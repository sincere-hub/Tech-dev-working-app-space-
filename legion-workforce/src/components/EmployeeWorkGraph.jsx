import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

function validEntry(entry, employeeId) {
  if (entry === null) return null;

  const start = Date.parse(entry?.clocked_in_at);

  const end = entry?.clocked_out_at == null
    ? null
    : Date.parse(entry.clocked_out_at);

  if (
    !entry?.id ||
    entry.employee_id !== employeeId ||
    !Number.isFinite(start) ||
    (
      end !== null &&
      (!Number.isFinite(end) || end < start)
    )
  ) {
    throw new Error(
      "The work session could not be read. Refresh the report."
    );
  }

  return {
    id: entry.id,
    employee_id: entry.employee_id,
    clocked_in_at: entry.clocked_in_at,
    clocked_out_at: entry.clocked_out_at,
  };
}

function sessionSeconds(entry, serverNow) {
  if (!entry) return 0;

  const end = entry.clocked_out_at
    ? Date.parse(entry.clocked_out_at)
    : serverNow;

  return Math.max(
    0,
    Math.floor(
      (end - Date.parse(entry.clocked_in_at)) / 1000
    )
  );
}

function duration(seconds) {
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}

function clockLabel(value) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function weekDays(
  snapshot,
  serverNow,
  fresh,
  windowStart = 0,
  windowHours = 24
) {
  const start = Date.parse(snapshot.week_start);
  const day = 86400000;

  const numberOfDays = Math.round(
    (Date.parse(snapshot.week_end) - start) / day
  );

  return Array.from(
    { length: numberOfDays },
    (_, index) => {
      const dayStart = start + index * day;
      const dayEnd = dayStart + day;

      const bars = snapshot.sessions.flatMap(entry => {
        const visibleStart =
          dayStart + windowStart * 3600000;

        const visibleEnd =
          visibleStart + windowHours * 3600000;

        const from = Math.max(
          Date.parse(entry.clocked_in_at),
          visibleStart
        );

        const to = Math.min(
          entry.clocked_out_at
            ? Date.parse(entry.clocked_out_at)
            : serverNow,
          visibleEnd
        );

        if (
          to < from ||
          (to === from && entry.clocked_out_at) ||
          from >= visibleEnd
        ) {
          return [];
        }

        return [{
          id: entry.id,
          from,
          to,
          left:
            (from - visibleStart) /
            (windowHours * 3600000) *
            100,
          width:
            (to - from) /
            (windowHours * 3600000) *
            100,
          startsHere:
            Date.parse(entry.clocked_in_at) >= visibleStart,
          active:
            fresh &&
            !entry.clocked_out_at &&
            serverNow >= visibleStart &&
            serverNow < visibleEnd,
          label:
            `${clockLabel(new Date(from).toISOString())}` +
            ` to ${clockLabel(new Date(to).toISOString())}`,
        }];
      });

      return { index, dayStart, bars };
    }
  );
}

function localDate(value = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const pick = name =>
    parts.find(part => part.type === name).value;

  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

const initialFilters = () => ({
  date: localDate(),
  days: 7,
  from: "00:00:00",
  to: "23:59:59",
});

export default function EmployeeWorkGraph({
  employeeId,
  viewerId,
}) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [cursors, setCursors] = useState([null]);
  const [selection, setSelection] = useState(null);
  const [windowHours, setWindowHours] = useState(24);
  const [windowStart, setWindowStart] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");

  const [online, setOnline] = useState(
    () => navigator.onLine
  );

  const [tick, setTick] = useState(
    () => performance.now()
  );

  const cursor = cursors[cursors.length - 1];

  const key = JSON.stringify([
    viewerId,
    employeeId,
    filters,
    cursor,
    refreshVersion,
  ]);

  const current = snapshot?.key === key
    ? snapshot
    : null;

  useEffect(() => {
    let live = true;
    let running = false;
    let queued = false;
    let generation = 0;
    let controller;
    let requestTimer;

    setError("");

    async function refresh() {
      if (
        !live ||
        !navigator.onLine ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      if (running) {
        queued = true;
        return;
      }

      running = true;

      const request = ++generation;
      const aborter = new AbortController();
      controller = aborter;

      const timer = window.setTimeout(() => {
        aborter.abort();

        if (live && request === generation) {
          setError("Updates paused. Reconnecting…");
        }
      }, 12000);

      requestTimer = timer;

      try {
        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getSession();

        if (
          !live ||
          aborter.signal.aborted ||
          request !== generation
        ) {
          return;
        }

        if (authError) throw authError;

        if (
          !viewerId ||
          auth.session?.user.id !== viewerId
        ) {
          throw Object.assign(
            new Error(
              "Your account changed. Reopen the profile."
            ),
            { code: "ACCOUNT_CHANGED" }
          );
        }

        const {
          data,
          error: requestError,
        } = await supabase
          .rpc("get_employee_work_history", {
            p_employee_id: employeeId,
            p_date: filters.date,
            p_days: filters.days,
            p_from: filters.from || "00:00:00",
            p_to: filters.to || "23:59:59",
            p_before_in:
              cursor?.clocked_in_at || null,
            p_before_id:
              cursor?.id || null,
          })
          .abortSignal(aborter.signal);

        if (
          !live ||
          aborter.signal.aborted ||
          request !== generation
        ) {
          return;
        }

        if (requestError) throw requestError;

        const serverMillis = Date.parse(
          data?.server_time
        );

        if (
          data?.employee_id !== employeeId ||
          !Number.isFinite(serverMillis)
        ) {
          throw new Error(
            "The work session response was invalid."
          );
        }

        const weekStart = Date.parse(
          data.week_start
        );

        const weekEnd = Date.parse(
          data.week_end
        );

        if (
          !Array.isArray(data.sessions) ||
          !Number.isFinite(weekStart) ||
          weekEnd - weekStart !==
            filters.days * 86400000 ||
          data.sessions.length > 25 ||
          typeof data.has_more !== "boolean" ||
          (
            data.has_more &&
            (
              !data.next_cursor?.id ||
              !Number.isFinite(
                Date.parse(
                  data.next_cursor.clocked_in_at
                )
              )
            )
          )
        ) {
          throw new Error(
            "The attendance response was invalid."
          );
        }

        const latest = validEntry(
          data.latest,
          employeeId
        );

        const sessions = data.sessions.map(
          row => validEntry(row, employeeId)
        );

        if (sessions.some(row => !row)) {
          throw new Error(
            "The attendance response was invalid."
          );
        }

        const receivedAt = performance.now();

        setSnapshot({
          key,
          latest,
          sessions,
          has_more: data.has_more,
          next_cursor: data.next_cursor,
          week_start: data.week_start,
          week_end: data.week_end,
          serverMillis,
          receivedAt,
        });

        setTick(receivedAt);
        setError("");
      } catch (problem) {
        if (
          live &&
          !aborter.signal.aborted &&
          request === generation
        ) {
          if (
            ["42501", "ACCOUNT_CHANGED"].includes(
              problem.code
            )
          ) {
            setSnapshot(null);
          }

          setError(
            problem.message ||
            "Updates paused. Reconnecting…"
          );
        }
      } finally {
        window.clearTimeout(timer);
        running = false;

        if (queued && live) {
          queued = false;
          refresh();
        }
      }
    }

    function changed(payload) {
      generation++;

      const row = payload.new;

      if (
        row?.employee_id === employeeId &&
        row.clocked_out_at
      ) {
        try {
          const entry = validEntry(
            row,
            employeeId
          );

          setSnapshot(previous => {
            if (previous?.key !== key) {
              return previous;
            }

            const committed = Date.parse(
              payload.commit_timestamp
            );

            return {
              ...previous,
              latest:
                previous.latest?.id === entry.id
                  ? entry
                  : previous.latest,
              sessions:
                previous.sessions.map(item =>
                  item.id === entry.id
                    ? entry
                    : item
                ),
              serverMillis:
                Number.isFinite(committed)
                  ? committed
                  : Math.max(
                      previous.serverMillis,
                      Date.parse(
                        entry.clocked_out_at
                      )
                    ),
              receivedAt: performance.now(),
            };
          });

          setTick(performance.now());
        } catch {
          // The refresh validates the database response.
        }
      }

      refresh();
    }

    function connected() {
      setOnline(navigator.onLine);
      setTick(performance.now());
      refresh();
    }

    function disconnected() {
      setOnline(false);
      setTick(performance.now());
    }

    refresh();

    const filter = {
      schema: "public",
      table: "time_entries",
      filter: `employee_id=eq.${employeeId}`,
    };

    const channel = supabase
      .channel(
        `work-history-${viewerId}-${employeeId}-${Date.now()}`
      )
      .on(
        "postgres_changes",
        { ...filter, event: "INSERT" },
        changed
      )
      .on(
        "postgres_changes",
        { ...filter, event: "UPDATE" },
        changed
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          refresh();
        }
      });

    const poll = window.setInterval(
      refresh,
      15000
    );

    window.addEventListener(
      "online",
      connected
    );

    window.addEventListener(
      "offline",
      disconnected
    );

    window.addEventListener(
      "focus",
      connected
    );

    document.addEventListener(
      "visibilitychange",
      refresh
    );

    return () => {
      live = false;
      generation++;
      controller?.abort();

      window.clearTimeout(requestTimer);
      window.clearInterval(poll);

      window.removeEventListener(
        "online",
        connected
      );

      window.removeEventListener(
        "offline",
        disconnected
      );

      window.removeEventListener(
        "focus",
        connected
      );

      document.removeEventListener(
        "visibilitychange",
        refresh
      );

      supabase.removeChannel(channel);
    };
  }, [key]);

  const entry = current?.latest;

  const open = Boolean(
    entry && !entry.clocked_out_at
  );

  useEffect(() => {
    if (!open || !online) return;

    const timer = window.setInterval(
      () => setTick(performance.now()),
      1000
    );

    return () =>
      window.clearInterval(timer);
  }, [open, online, entry?.id]);

  const fresh = Boolean(
    current &&
    online &&
    !error &&
    tick - current.receivedAt < 45000
  );

  const active = open && fresh;

  const serverNow = current
    ? current.serverMillis +
      (
        fresh
          ? Math.max(
              0,
              tick - current.receivedAt
            )
          : 0
      )
    : 0;

  const seconds = sessionSeconds(
    entry,
    serverNow
  );

  const days = current
    ? weekDays(
        current,
        serverNow,
        fresh,
        windowStart,
        windowHours
      )
    : [];

  const selected = selection?.key === key
    ? current?.sessions.find(
        item => item.id === selection.id
      )
    : null;

  function choose(item) {
    setSelection({
      key,
      id: item.id,
    });

    const hour =
      (
        new Date(
          item.clocked_in_at
        ).getUTCHours() + 2
      ) % 24;

    setWindowHours(6);
    setWindowStart(
      Math.floor(hour / 6) * 6
    );
  }

  function apply(event) {
    event?.preventDefault();

    setFilters({ ...draft });
    setCursors([null]);
    setSelection(null);
    setWindowHours(24);
    setWindowStart(0);

    setRefreshVersion(
      value => value + 1
    );
  }

  function today() {
    const next = initialFilters();

    setDraft(next);
    setFilters(next);
    setCursors([null]);
    setSelection(null);
    setWindowHours(24);
    setWindowStart(0);

    setRefreshVersion(
      value => value + 1
    );
  }

  const hourLabel = hour =>
    `${String(Math.floor(hour)).padStart(2, "0")}:` +
    `${String(
      Math.round((hour % 1) * 60)
    ).padStart(2, "0")}`;

  const dayName = new Intl.DateTimeFormat(
    "en-ZA",
    {
      timeZone: "Africa/Johannesburg",
      weekday: "short",
    }
  );

  const dayDate = new Intl.DateTimeFormat(
    "en-ZA",
    {
      timeZone: "Africa/Johannesburg",
      day: "numeric",
      month: "short",
    }
  );

  return (
    <section
      className={
        `work-session-card work-history-card` +
        (
          active
            ? " work-session-active"
            : ""
        )
      }
    >
      <header className="work-session-header">
        <div>
          <p>TIME & ATTENDANCE</p>
          <h3>Attendance timeline</h3>
        </div>

        <span className="work-session-status">
          <i />

          {!current
            ? error
              ? "Unavailable"
              : "Connecting…"
            : !fresh
              ? "Updates paused"
              : open
                ? "Clocked in"
                : entry
                  ? "Clocked out"
                  : "No session recorded"}
        </span>
      </header>

      <form
        className="work-history-filters"
        onSubmit={apply}
      >
        <label>
          Date

          <input
            type="date"
            required
            value={draft.date}
            onChange={event =>
              setDraft(value => ({
                ...value,
                date: event.target.value,
              }))
            }
          />
        </label>

        <label>
          View

          <select
            value={draft.days}
            onChange={event =>
              setDraft(value => ({
                ...value,
                days: Number(
                  event.target.value
                ),
              }))
            }
          >
            <option value={7}>
              Week containing this date
            </option>

            <option value={1}>
              This day only
            </option>
          </select>
        </label>

        {draft.days === 1 && (
          <>
            <label>
              Clock-in from

              <input
                type="time"
                step="1"
                required
                value={draft.from}
                onChange={event =>
                  setDraft(value => ({
                    ...value,
                    from: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Clock-in to

              <input
                type="time"
                step="1"
                required
                min={draft.from}
                value={draft.to}
                onChange={event =>
                  setDraft(value => ({
                    ...value,
                    to: event.target.value,
                  }))
                }
              />
            </label>
          </>
        )}

        <div className="work-history-filter-actions">
          <button type="submit">
            Find sessions
          </button>

          <button
            type="button"
            onClick={today}
          >
            This week
          </button>
        </div>
      </form>

      {error && (
        <p
          className="work-session-message"
          role="status"
        >
          {error}
        </p>
      )}

      {current ? (
        <>
          <dl className="work-session-stats">
            <div>
              <dt>Latest clock-in</dt>
              <dd>
                {clockLabel(
                  entry?.clocked_in_at
                )}
              </dd>
            </div>

            <div>
              <dt>Latest clock-out</dt>
              <dd>
                {open
                  ? "Still clocked in"
                  : clockLabel(
                      entry?.clocked_out_at
                    )}
              </dd>
            </div>

            <div>
              <dt>Latest session duration</dt>
              <dd className="work-session-timer">
                {duration(seconds)}
              </dd>
            </div>
          </dl>

          <div className="work-history-zoom">
            <label>
              Time scale

              <select
                value={windowHours}
                onChange={event => {
                  setWindowHours(
                    Number(
                      event.target.value
                    )
                  );
                  setWindowStart(0);
                }}
              >
                <option value={24}>
                  Full day
                </option>

                <option value={6}>
                  6-hour detail
                </option>
              </select>
            </label>

            {windowHours === 6 && (
              <label>
                Time window

                <select
                  value={windowStart}
                  onChange={event =>
                    setWindowStart(
                      Number(
                        event.target.value
                      )
                    )
                  }
                >
                  {[0, 6, 12, 18].map(hour => (
                    <option
                      key={hour}
                      value={hour}
                    >
                      {hourLabel(hour)}
                      –
                      {hourLabel(hour + 6)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <span>
              ● Clock-in point
              <b>━</b> Recorded work time
            </span>
          </div>

          <div className="work-week-table">
            <div className="work-week-scale">
              <strong>Day</strong>

              <div className="work-week-axis">
                {Array.from(
                  { length: 5 },
                  (_, index) => (
                    <span
                      key={index}
                      style={{
                        left: `${index * 25}%`,
                      }}
                    >
                      {hourLabel(
                        windowStart +
                        index * windowHours / 4
                      )}
                    </span>
                  )
                )}
              </div>
            </div>

            {days.map(row => (
              <div
                className="work-week-row"
                key={row.index}
              >
                <div className="work-week-day">
                  <strong>
                    {dayName.format(
                      new Date(row.dayStart)
                    )}
                  </strong>

                  <small>
                    {dayDate.format(
                      new Date(row.dayStart)
                    )}
                  </small>
                </div>

                <div
                  className="work-week-track"
                  role="group"
                  aria-label={
                    `${dayName.format(
                      new Date(row.dayStart)
                    )}, ${dayDate.format(
                      new Date(row.dayStart)
                    )}`
                  }
                >
                  {row.bars.map(bar => (
                    <button
                      type="button"
                      key={bar.id}
                      className={
                        "work-week-bar" +
                        (
                          bar.active
                            ? " work-week-bar-live"
                            : ""
                        ) +
                        (
                          selected?.id === bar.id
                            ? " work-week-bar-selected"
                            : ""
                        ) +
                        (
                          bar.startsHere
                            ? " work-week-bar-start"
                            : ""
                        )
                      }
                      onClick={() =>
                        choose(
                          current.sessions.find(
                            item =>
                              item.id === bar.id
                          )
                        )
                      }
                      style={{
                        left: `${bar.left}%`,
                        width: `${bar.width}%`,
                      }}
                      title={bar.label}
                      aria-label={
                        `Select session: ${bar.label}`
                      }
                      aria-pressed={
                        selected?.id === bar.id
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="work-session-caption">
            {dayDate.format(
              new Date(current.week_start)
            )}
            –
            {dayDate.format(
              new Date(
                Date.parse(current.week_end) - 1
              )
            )}

            {" · South African time. "}

            Graph shows the{" "}
            {current.sessions.length}{" "}
            sessions on this page,
            by clock-in date.

            {!fresh
              ? " Showing last confirmed times."
              : ""}
          </p>

          {selected && (
            <section
              className="work-history-selection"
              aria-label="Selected work session"
            >
              <div>
                <span>SELECTED SESSION</span>

                <button
                  type="button"
                  onClick={() =>
                    setSelection(null)
                  }
                >
                  Clear selection
                </button>
              </div>

              <dl>
                <div>
                  <dt>Clocked in</dt>
                  <dd>
                    {clockLabel(
                      selected.clocked_in_at
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Clocked out</dt>
                  <dd>
                    {selected.clocked_out_at
                      ? clockLabel(
                          selected.clocked_out_at
                        )
                      : "Still clocked in"}
                  </dd>
                </div>

                <div>
                  <dt>Duration</dt>
                  <dd>
                    {duration(
                      sessionSeconds(
                        selected,
                        serverNow
                      )
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          <div className="work-history-list-header">
            <h4>Recorded sessions</h4>

            <span>
              Page {cursors.length}
              {" · newest first"}
            </span>
          </div>

          <p className="work-history-hint">
            Select a session to highlight its
            clock-in point and zoom in.
            Use “This day only” and the clock-in
            time filters to narrow your search.
          </p>

          {current.sessions.length ? (
            <ol className="work-history-list">
              {current.sessions.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      selected?.id === item.id
                        ? "is-selected"
                        : ""
                    }
                    aria-pressed={
                      selected?.id === item.id
                    }
                    onClick={() =>
                      choose(item)
                    }
                  >
                    <span>
                      <strong>
                        {clockLabel(
                          item.clocked_in_at
                        )}
                      </strong>

                      <small>
                        {item.clocked_out_at
                          ? `Out: ${clockLabel(
                              item.clocked_out_at
                            )}`
                          : "Still clocked in"}
                      </small>
                    </span>

                    <span className="work-history-duration">
                      {duration(
                        sessionSeconds(
                          item,
                          serverNow
                        )
                      )}

                      <small>
                        View on graph →
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="work-session-message">
              No clock-ins match these filters.
              Sessions are listed by their
              clock-in date.
            </p>
          )}

          <nav
            className="work-history-pagination"
            aria-label="Attendance history pages"
          >
            <button
              type="button"
              disabled={cursors.length === 1}
              onClick={() =>
                setCursors(value =>
                  value.slice(0, -1)
                )
              }
            >
              ← Newer sessions
            </button>

            <button
              type="button"
              disabled={!current.has_more}
              onClick={() =>
                setCursors(value => [
                  ...value,
                  current.next_cursor,
                ])
              }
            >
              Older sessions →
            </button>
          </nav>
        </>
      ) : (
        <p
          className="work-session-message"
          role="status"
        >
          {error
            ? "Attendance could not be loaded. Check the connection and try Find sessions again."
            : "Loading recorded clock times…"}
        </p>
      )}
    </section>
  );
}