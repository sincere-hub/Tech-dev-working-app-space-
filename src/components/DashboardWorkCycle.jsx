
import { useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { monthWindow, workdayCycle } from "../lib/workdayCycle.js";
import "./dashboard-work-cycle.css";

export default function DashboardWorkCycle({
  employeeId,
  refreshKey
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    if (!employeeId) return;

    let alive = true;
    let running = false;
    let controller;
    let timer;

    async function refresh() {
      if (document.hidden || running) return;

      running = true;
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 15000);

      try {
        const {
          data: auth,
          error: authError
        } = await supabase.auth.getSession();

        if (authError) throw authError;

        if (auth.session?.user.id !== employeeId) {
          throw new Error(
            "Reopen the dashboard after signing in."
          );
        }

        const now = Date.now();
        const { from, to } = monthWindow(now);

        async function read(table, columns, apply) {
          const all = [];

          for (
            let offset = 0;
            offset <= 10000;
            offset += 500
          ) {
            const { data, error: problem } = await apply(
              supabase
                .from(table)
                .select(columns)
                .eq("employee_id", employeeId)
            )
              .order("id")
              .range(offset, offset + 499)
              .abortSignal(request.signal);

            if (problem) throw problem;

            if (
              !Array.isArray(data) ||
              data.some(row => row.employee_id !== employeeId)
            ) {
              throw new Error(
                "Attendance records could not be verified."
              );
            }

            if (all.length + data.length > 10000) {
              throw new Error(
                "Too many attendance records for this month."
              );
            }

            all.push(...data);

            if (data.length < 500) return all;
          }

          throw new Error(
            "Attendance records could not be loaded completely."
          );
        }

        const start = new Date(from).toISOString();
        const end =
          new Date(Math.min(to, now)).toISOString();

        const [sessions, shifts] = await Promise.all([
          read(
            "time_entries",
            "id,employee_id,clocked_in_at,clocked_out_at",
            q => q
              .lt("clocked_in_at", end)
              .or(
                "clocked_out_at.is.null,clocked_out_at.gt." +
                start
              )
          ),
          read(
            "shifts",
            "id,employee_id,starts_at,ends_at",
            q => q
              .lt("starts_at", end)
              .gt("ends_at", start)
          )
        ]);

        if (alive && !request.signal.aborted) {
          setSnapshot({
            employeeId,
            now,
            ...workdayCycle({
              sessions,
              shifts,
              now,
              from,
              to
            })
          });
          setError("");
        }
      } catch (failure) {
        request.abort();

        if (alive) {
          setError(
            failure?.message ||
            "Attendance analytics could not refresh."
          );
        }
      } finally {
        clearTimeout(timeout);
        running = false;

        if (alive) {
          timer = setTimeout(refresh, 60000);
        }
      }
    }

    const wake = () => {
      clearTimeout(timer);
      refresh();
    };

    refresh();

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      alive = false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [employeeId, refreshKey, retry]);

  const data =
    snapshot?.employeeId === employeeId ? snapshot : null;

  const percent = data?.total
    ? Math.round(data.worked / data.total * 100)
    : 0;

  const month = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    month: "long",
    year: "numeric"
  }).format(data?.now || Date.now());

  return (
    <section
      className="td-work-cycle"
      aria-labelledby={id + "-heading"}
    >
      <header>
        <div>
          <p className="td-cycle-eyebrow">
            ATTENDANCE ANALYTICS
          </p>
          <h2 id={id + "-heading"}>Your work cycle</h2>
        </div>
        <span>{month}</span>
      </header>

      {error && (
        <p role="status">
          {data ? "Showing the last successful update. " : ""}
          {error}{" "}
          <button
            type="button"
            onClick={() => setRetry(value => value + 1)}
          >
            Retry
          </button>
        </p>
      )}

      {!data ? (
        <p role="status">
          {error
            ? "Analytics unavailable."
            : "Loading attendance analytics…"}
        </p>
      ) : (
        <>
          <div className="td-cycle-body">
            <div className="td-cycle-visual">
              <svg
                viewBox="0 0 160 160"
                role="img"
                aria-label={`${data.worked} days worked; ${data.notWorked} scheduled days not worked`}
              >
                <defs>
                  <linearGradient
                    id={id + "-green"}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop stopColor="#06b67e"/>
                    <stop offset="1" stopColor="#22deed"/>
                  </linearGradient>
                </defs>

                <circle
                  cx="80"
                  cy="80"
                  r="62"
                  className="td-cycle-track"
                />

                {data.total > 0 && (
                  <g transform="rotate(-90 80 80)">
                    <circle
                      cx="80"
                      cy="80"
                      r="62"
                      pathLength="100"
                      className="td-cycle-missed"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="62"
                      pathLength="100"
                      fill="none"
                      stroke={`url(#${id}-green)`}
                      strokeWidth="13"
                      strokeDasharray={`${data.worked / data.total * 100} 100`}
                    />
                  </g>
                )}
              </svg>

              <div
                className="td-cycle-center"
                aria-hidden="true"
              >
                <strong>
                  {data.total ? percent + "%" : "—"}
                </strong>
                <span>
                  {data.total
                    ? "days worked"
                    : "No records yet"}
                </span>
              </div>
            </div>

            <dl className="td-cycle-totals">
              <div>
                <dt><i/>Days worked</dt>
                <dd>{data.worked}</dd>
              </div>
              <div>
                <dt><i/>Days not worked</dt>
                <dd>{data.notWorked}</dd>
              </div>
            </dl>
          </div>

          <p className="td-cycle-note">
            Worked means any recorded attendance that day.
            Not worked means a completed scheduled day with
            no attendance, including leave. Future days and
            unscheduled days off are excluded.
            South African time.
          </p>
        </>
      )}
    </section>
  );
}
