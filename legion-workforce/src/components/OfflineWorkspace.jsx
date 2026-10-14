import { useEffect, useState } from "react";

import {
  readOfflineWorkspace,
  clearOfflineWorkspace,
} from "../lib/offlineWorkspace.js";

function stamp(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function OfflineWorkspace({ viewerId }) {
  const [tab, setTab] = useState("home");
  const [revision, setRevision] = useState(0);

  const copy = readOfflineWorkspace(viewerId);

  useEffect(() => {
    const changed = () =>
      setRevision(value => value + 1);

    window.addEventListener(
      "legion-offline-copy-changed",
      changed
    );

    window.addEventListener("storage", changed);

    const expiry = window.setInterval(
      changed,
      60000
    );

    return () => {
      window.removeEventListener(
        "legion-offline-copy-changed",
        changed
      );

      window.removeEventListener("storage", changed);
      window.clearInterval(expiry);
    };
  }, []);

  void revision;

  const retry = () =>
    window.dispatchEvent(new Event("online"));

  const empty = message => (
    <p className="offline-empty">{message}</p>
  );

  const tabs = [
    ["home", "Home"],
    ["tasks", "My tasks"],
    ["time", "Time & shifts"],
    ["notices", "Notices"],
  ];

  const heading = tabs.find(
    item => item[0] === tab
  )?.[1];

  return (
    <main className="offline-screen">
      <section className="offline-workspace">
        <header className="offline-header">
          <img
            src={`${import.meta.env.BASE_URL}legion-mark.svg`}
            width="42"
            height="42"
            alt="Legion"
          />

          <div>
            <strong>LEGION</strong>
            <span>Saved workspace</span>
          </div>

          <span className="offline-status">
            Offline · Read only
          </span>
        </header>

        <div className="offline-banner" role="status">
          <strong>
            Your connection is unavailable.
          </strong>

          <p>
            {copy
              ? `Showing saved information for ${copy.name}. Last updated ${stamp(copy.savedAt)}.`
              : "Connect and open Legion once to save information for offline use. Saved copies expire after 24 hours."}
          </p>

          <button type="button" onClick={retry}>
            Try reconnecting
          </button>
        </div>

        {copy && (
          <>
            <nav
              className="offline-tabs"
              aria-label="Offline pages"
            >
              {tabs.map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-current={
                    tab === id ? "page" : undefined
                  }
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <h1>{heading}</h1>

            {tab === "home" && (
              <>
                <p className="offline-intro">
                  Welcome back, {copy.name.split(" ")[0]}.
                  You can browse your saved information
                  while Legion reconnects.
                </p>

                <div className="offline-stats">
                  <div>
                    <span>Saved tasks</span>
                    <strong>{copy.tasks.length}</strong>
                  </div>

                  <div>
                    <span>Saved shifts</span>
                    <strong>{copy.shifts.length}</strong>
                  </div>

                  <div>
                    <span>Saved notices</span>
                    <strong>{copy.notices.length}</strong>
                  </div>
                </div>

                <section className="offline-card">
                  <h2>Actions resume when connected</h2>
                  <p>
                    Clock-in/out, sending messages,
                    changing tasks, uploads and payroll
                    changes need a connection. Nothing
                    is queued or marked as saved while
                    offline.
                  </p>
                </section>
              </>
            )}

            {tab === "tasks" && (
              copy.tasks.length
                ? copy.tasks.map(task => (
                    <article
                      className="offline-card"
                      key={task.id}
                    >
                      <div className="offline-card-title">
                        <h2>{task.title}</h2>
                        <span>
                          {task.status.replace(/_/g, " ")}
                        </span>
                      </div>

                      {task.description && (
                        <p>{task.description}</p>
                      )}

                      {task.due_date && (
                        <small>
                          Due:{" "}
                          {stamp(
                            `${task.due_date.slice(0, 10)}T12:00:00+02:00`
                          )}
                        </small>
                      )}
                    </article>
                  ))
                : empty(
                    "No tasks are available in this saved copy."
                  )
            )}

            {tab === "time" && (
              <>
                <h2 className="offline-section-title">
                  Saved clock records
                </h2>

                {copy.times.length
                  ? copy.times.map(entry => (
                      <article
                        className="offline-card"
                        key={entry.id}
                      >
                        <dl>
                          <div>
                            <dt>Clocked in</dt>
                            <dd>
                              {stamp(entry.clocked_in_at)}
                            </dd>
                          </div>

                          <div>
                            <dt>Clocked out</dt>
                            <dd>
                              {entry.clocked_out_at
                                ? stamp(entry.clocked_out_at)
                                : "Not recorded in this saved copy"}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    ))
                  : empty(
                      "No clock records are available in this saved copy."
                    )}

                <h2 className="offline-section-title">
                  Saved shifts
                </h2>

                {copy.shifts.length
                  ? copy.shifts.map(shift => (
                      <article
                        className="offline-card"
                        key={shift.id}
                      >
                        <h2>
                          {stamp(shift.starts_at)}
                          {" – "}
                          {stamp(shift.ends_at)}
                        </h2>

                        <p>
                          {shift.location ||
                            "No location provided"}
                        </p>
                      </article>
                    ))
                  : empty(
                      "No shifts are available in this saved copy."
                    )}
              </>
            )}

            {tab === "notices" && (
              copy.notices.length
                ? copy.notices.map(notice => (
                    <article
                      className="offline-card"
                      key={notice.id}
                    >
                      <h2>{notice.title}</h2>
                      <p>{notice.body}</p>
                      <small>
                        {stamp(notice.created_at)}
                      </small>
                    </article>
                  ))
                : empty(
                    "No notices are available in this saved copy."
                  )
            )}

            <footer className="offline-footer">
              <p>
                This device stores only the signed-in
                employee’s saved tasks, shifts, clock
                records and company notices. Live
                reports, chats and payslips require
                a connection.
              </p>

              <button
                type="button"
                onClick={clearOfflineWorkspace}
              >
                Remove saved copy
              </button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}