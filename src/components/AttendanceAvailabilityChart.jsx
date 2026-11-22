
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useState
} from "react";
import { supabase } from "../lib/supabase.js";
import { availabilitySeries } from "../lib/availabilityChart.js";
import "./attendance-availability-chart.css";

const formatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const dayFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short"
});

const date = value => formatter.format(new Date(value));

function AttendanceAvailabilityChart({
  employeeId,
  viewerId,
  from,
  to,
  serverNow,
  live,
  refreshKey
}) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const id = useId().replace(/:/g, "");
  const key = JSON.stringify([employeeId, viewerId, from, to]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
      if (alive) {
        setError(
          "Chart request timed out. Use Find sessions to retry."
        );
      }
    }, 15000);

    async function rows(table, configure) {
      const all = [];

      for (
        let offset = 0;
        offset <= 10000;
        offset += 500
      ) {
        const query = configure(
          supabase
            .from(table)
            .select("*")
            .eq("employee_id", employeeId)
        )
          .order("id")
          .range(offset, offset + 499)
          .abortSignal(controller.signal);

        const { data, error: problem } = await query;

        if (problem) throw problem;

        if (!Array.isArray(data)) {
          throw new Error("Invalid " + table + " response.");
        }

        if (data.some(row => row.employee_id !== employeeId)) {
          throw new Error("Employee record mismatch.");
        }

        if (all.length + data.length > 10000) {
          throw new Error(
            "Too many records. Select a shorter date range."
          );
        }

        all.push(...data);

        if (data.length < 500) return all;
      }

      throw new Error("Select a shorter date range.");
    }

    (async () => {
      setError("");

      const {
        data: auth,
        error: problem
      } = await supabase.auth.getSession();

      if (problem) throw problem;

      if (auth.session?.user.id !== viewerId) {
        throw new Error(
          "Account changed. Reopen the employee report."
        );
      }

      const a = new Date(from).toISOString();
      const b = new Date(to).toISOString();

      const day = t =>
        new Date(t + 7200000).toISOString().slice(0, 10);

      const [sessions, shifts, leaves] = await Promise.all([
        rows(
          "time_entries",
          q => q.lt("clocked_in_at", b).or(
            "clocked_out_at.is.null,clocked_out_at.gt." + a
          )
        ),
        rows(
          "shifts",
          q => q.lt("starts_at", b).gt("ends_at", a)
        ),
        rows(
          "leave_requests",
          q => q
            .eq("status", "approved")
            .lte("start_date", day(to - 1))
            .gte("end_date", day(from))
        )
      ]);

      if (alive && !controller.signal.aborted) {
        setState({
          key,
          sessions,
          shifts,
          leaves,
          confirmedNow: serverNow
        });
      }
    })()
      .catch(problem => {
        if (alive && !controller.signal.aborted) {
          setError(problem.message || "Chart could not load.");
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [key, refreshKey]);

  const data = state?.key === key ? state : null;
  const active = Boolean(live && !error);

  const series = useMemo(
    () => data
      ? availabilitySeries({
          ...data,
          from,
          to,
          now: active ? serverNow : data.confirmedNow,
          live: active
        })
      : null,
    [data, from, to, serverNow, active]
  );

  if (!data) {
    return (
      <p role="status">
        {error || "Loading attendance chart…"}
      </p>
    );
  }

  const peak = [series.blue, series.red].reduce(
    (max, points) => points.reduce(
      (n, point) => Math.max(n, point.hours),
      max
    ),
    0
  );

  const maxHours = Math.min(
    24,
    Math.max(8, Math.ceil(peak / 4) * 4)
  );

  const x = t => 58 + (t - from) / (to - from) * 860;
  const y = hours =>
    286 - Math.min(maxHours, Math.max(0, hours)) /
    maxHours * 220;

  const line = points => points.map(
    (point, index) =>
      (index ? "L" : "M") +
      x(point.time).toFixed(2) + "," +
      y(point.hours).toFixed(2)
  ).join(" ");

  const area = points => points.length
    ? line(points) +
      " L" + x(points.at(-1).time) +
      ",286 L" + x(points[0].time) + ",286 Z"
    : "";

  const focus = text => () => setSelected(text);

  const activate = text => event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(text);
    }
  };

  const days = Math.min(
    7,
    Math.max(1, Math.round((to - from) / 86400000))
  );

  return (
    <section
      className="td-availability-chart"
      aria-label="Employee availability chart"
    >
      <header className="td-availability-heading">
        <div>
          <p>ATTENDANCE REPORT</p>
          <h4>Employee availability</h4>
          <small>
            {dayFormatter.format(new Date(from))}
            {" – "}
            {dayFormatter.format(new Date(to - 1))}
            {" · Hours per day"}
          </small>
        </div>

        <span className={
          series.livePoint
            ? "td-report-status is-live"
            : "td-report-status"
        }>
          {error
            ? "Update paused"
            : series.livePoint
              ? "Live session"
              : "Recorded history"}
        </span>
      </header>

      <div className="td-availability-legend">
        <span>Available · Worked hours</span>
        <span>Unavailable · Leave / missed time</span>
      </div>

      {error && (
        <p role="status">
          {error} Showing the last confirmed chart
          without live animation.
        </p>
      )}

      <div className="td-availability-scroll">
        <svg
          viewBox="0 0 960 340"
          role="group"
          aria-labelledby={id + "-title"}
        >
          <title id={id + "-title"}>
            Daily worked hours and unavailable hours;
            cyan nodes identify clock-outs.
          </title>

          <defs>
            <linearGradient
              id={id + "-blue"}
              x1="0" y1="0" x2="0" y2="1"
            >
              <stop
                offset="0%"
                stopColor="#0786ed"
                stopOpacity=".24"
              />
              <stop
                offset="100%"
                stopColor="#0786ed"
                stopOpacity=".03"
              />
            </linearGradient>

            <linearGradient
              id={id + "-red"}
              x1="0" y1="0" x2="0" y2="1"
            >
              <stop
                offset="0%"
                stopColor="#ed3547"
                stopOpacity=".13"
              />
              <stop
                offset="100%"
                stopColor="#ed3547"
                stopOpacity=".02"
              />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map(index => {
            const hours = index * maxHours / 4;

            return (
              <g key={hours}>
                <line
                  x1="58"
                  x2="918"
                  y1={y(hours)}
                  y2={y(hours)}
                  stroke="currentColor"
                  opacity=".1"
                  strokeDasharray={index ? "3 5" : undefined}
                />
                <text
                  x="45"
                  y={y(hours) + 4}
                  textAnchor="end"
                >
                  {hours}h
                </text>
              </g>
            );
          })}

          <path
            d={area(series.red)}
            fill={"url(#" + id + "-red)"}
          />
          <path
            d={area(series.blue)}
            fill={"url(#" + id + "-blue)"}
          />
          <path
            d={line(series.red)}
            className="td-availability-red"
          />
          <path
            d={line(series.blue)}
            className={
              "td-availability-blue" +
              (series.livePoint ? " is-live" : "")
            }
          />

          {series.outs.map(point => {
            const text =
              (point.auto ? "Auto clocked out" : "Clocked out") +
              " · " + date(point.time) +
              " · " + point.hours.toFixed(2) +
              " worked hours that day";

            return (
              <rect
                key={point.id}
                x={x(point.time) - 4}
                y={y(point.hours) - 4}
                width="8"
                height="8"
                fill="#00e8ff"
                stroke="#086cc1"
                tabIndex="0"
                role="button"
                aria-label={text}
                onClick={focus(text)}
                onFocus={focus(text)}
                onKeyDown={activate(text)}
              >
                <title>{text}</title>
              </rect>
            );
          })}

          {series.unavailableNodes.map((point, index) => {
            const text =
              date(point.time) +
              " · " + point.hours.toFixed(2) +
              " unavailable hours" +
              (point.leave ? " · Approved leave" : "") +
              (point.missed
                ? " · Uncovered scheduled time"
                : "");

            return (
              <rect
                key={index}
                x={x(point.time) - 4}
                y={y(point.hours) - 4}
                width="8"
                height="8"
                fill="#111"
                tabIndex="0"
                role="button"
                aria-label={text}
                onClick={focus(text)}
                onFocus={focus(text)}
                onKeyDown={activate(text)}
              >
                <title>{text}</title>
              </rect>
            );
          })}

          {series.livePoint && (
            <g>
              <circle
                cx={x(series.livePoint.time)}
                cy={y(series.livePoint.hours)}
                r="13"
                className="td-availability-live-halo"
              />
              <circle
                cx={x(series.livePoint.time)}
                cy={y(series.livePoint.hours)}
                r="5"
                className="td-availability-live-point"
              >
                <title>
                  Clocked in — updating recorded work duration
                </title>
              </circle>
            </g>
          )}

          {Array.from({ length: days + 1 }, (_, index) => {
            const time = from + index * (to - from) / days;

            return (
              <text
                key={index}
                x={x(time)}
                y="312"
                textAnchor={
                  index === 0
                    ? "start"
                    : index === days
                      ? "end"
                      : "middle"
                }
              >
                {dayFormatter.format(new Date(time))}
              </text>
            );
          })}
        </svg>
      </div>

      <p
        className="td-availability-selection"
        aria-live="polite"
      >
        {selected ||
          "Select a node for its recorded time and details."}
      </p>

      <p className="td-availability-note">
        Hours reset at midnight, South African time.
        Blue: recorded work. Red: approved leave or time outside
        clocked sessions during published shifts; overlapping
        intervals count once. Approved leave covers its calendar
        dates. No schedule means no inferred absence.
        Chart covers the full period; the clock-in filters and
        pagination below apply to the session list.
      </p>

      {!data.sessions.length && (
        <p>No recorded work sessions in this period.</p>
      )}

      {data.sessions.some(
        row => row.clocked_out_at && row.auto_clocked_out === true
      ) && (
        <p>
          Auto clocked out:{" "}
          {data.sessions
            .filter(
              row =>
                row.clocked_out_at &&
                row.auto_clocked_out === true
            )
            .map(row => date(Date.parse(row.clocked_out_at)))
            .join("; ")}
        </p>
      )}
    </section>
  );
}

export default memo(AttendanceAvailabilityChart);
