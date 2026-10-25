import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Users,
  Video,
  MapPin,
  Plus,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { safeExternalUrl } from "../lib/reporting.js";
import RecordInteraction from "./RecordInteraction.jsx";

const ZONE = "Africa/Johannesburg";

function localMeetingTime(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = type =>
    parts.find(part => part.type === type).value;

  return (
    `${get("year")}-${get("month")}-${get("day")}` +
    `T${get("hour")}:${get("minute")}`
  );
}

function meetingIso(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ) {
    return null;
  }

  const date = new Date(`${value}:00+02:00`);

  return (
    Number.isFinite(date.getTime()) &&
    localMeetingTime(date) === value
  )
    ? date.toISOString()
    : null;
}

function meetingData(record) {
  const data = record.metadata?.meeting || {};

  return {
    starts_at:
      typeof data.starts_at === "string"
        ? data.starts_at : "",
    ends_at:
      typeof data.ends_at === "string"
        ? data.ends_at : "",
    location:
      typeof data.location === "string"
        ? data.location : "",
    decisions:
      typeof data.decisions === "string"
        ? data.decisions : "",
    next_steps:
      typeof data.next_steps === "string"
        ? data.next_steps : "",
    attendee_ids: Array.isArray(data.attendee_ids)
      ? [...new Set(
          data.attendee_ids.filter(
            id => typeof id === "string",
          ),
        )]
      : [],
  };
}

function meetingState(record, now) {
  if (record.status === "archived") return "cancelled";
  if (record.status === "done") return "past";

  const data = meetingData(record);
  const start = Date.parse(data.starts_at);
  const end = Date.parse(data.ends_at);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return "unscheduled";
  }

  if (end <= now) return "past";

  return start <= now ? "current" : "upcoming";
}

function dateText(value) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function timeText(value) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

const stateLabels = {
  upcoming: "Upcoming",
  current: "Scheduled now",
  past: "Finished",
  cancelled: "Cancelled",
  unscheduled: "Time not set",
};

export default function MeetingWorkspace({
  records = [],
  employees = [],
  interactions = [],
  userId,
  isManager,
  onSave,
  onInteract,
}) {
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState("upcoming");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const locked = useRef(false);
  const titleRef = useRef(null);

  const people = new Map(
    employees.map(person => [
      person.id,
      person.display_name,
    ]),
  );

  const nameOf = id =>
    people.get(id) || "Employee unavailable";

  const meetings = records.filter(
    record =>
      record.module_id === "collaboration.meetings",
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      30000,
    );

    return () => window.clearInterval(timer);
  }, []);

  const matches = meetings.filter(record => {
    const data = meetingData(record);

    const text = [
      record.title,
      record.description,
      data.location,
      nameOf(record.created_by),
      ...data.attendee_ids.map(nameOf),
    ].join(" ").toLowerCase();

    return (
      (
        !mine ||
        record.created_by === userId ||
        data.attendee_ids.includes(userId)
      ) &&
      text.includes(query.trim().toLowerCase())
    );
  });

  function belongs(record, value) {
    if (value === "all") return true;

    const state = meetingState(record, now);

    if (value === "upcoming") {
      return [
        "upcoming",
        "current",
        "unscheduled",
      ].includes(state);
    }

    return state === value;
  }

  const visible = matches
    .filter(record => belongs(record, tab))
    .sort((a, b) => {
      const first = Date.parse(
        meetingData(a).starts_at,
      );

      const second = Date.parse(
        meetingData(b).starts_at,
      );

      return (
        (tab === "past" ? -1 : 1) *
          (
            (Number.isFinite(first) ? first : Infinity) -
            (Number.isFinite(second) ? second : Infinity)
          ) ||
        String(a.id).localeCompare(String(b.id))
      );
    });

  function edit(record = null) {
    if (!isManager || locked.current) return;

    const data = record ? meetingData(record) : {};

    const start =
      Math.ceil(Date.now() / 1800000) * 1800000;

    setError("");
    setMessage("");

    setEditor({
      record,
      title: record?.title || "",
      agenda: record?.description || "",
      starts: data.starts_at
        ? localMeetingTime(data.starts_at)
        : localMeetingTime(start),
      ends: data.ends_at
        ? localMeetingTime(data.ends_at)
        : localMeetingTime(start + 3600000),
      location: data.location || "",
      link: record?.metadata?.resource_url || "",
      attendees: [...(data.attendee_ids || [])],
      decisions: data.decisions || "",
      next_steps: data.next_steps || "",
      visibility: record?.visibility || "company",
      status:
        record?.status === "archived"
          ? "archived"
          : record?.status === "done"
            ? "done"
            : "open",
    });
  }

  function change(field, value) {
    setEditor(old => ({
      ...old,
      [field]: value,
    }));
  }

  function closeEditor() {
    if (
      !locked.current &&
      window.confirm(
        "Discard these unsaved meeting changes?",
      )
    ) {
      setEditor(null);
      setError("");
    }
  }

  async function save(event) {
    event.preventDefault();

    if (!isManager || !editor || locked.current) return;

    setError("");

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to save. Your changes are still here.",
      );
      return;
    }

    if (!editor.title.trim()) {
      setError("Add a meeting title.");
      return;
    }

    const starts = meetingIso(editor.starts);
    const ends = meetingIso(editor.ends);

    if (
      !starts ||
      !ends ||
      Date.parse(ends) <= Date.parse(starts)
    ) {
      setError(
        "Choose valid times, with the end after the start. All times use South African time.",
      );
      return;
    }

    const link = editor.link.trim();

    if (link && !safeExternalUrl(link)) {
      setError(
        "Use a full HTTPS meeting link without embedded credentials.",
      );
      return;
    }

    const payload = {
      title: editor.title.trim(),
      description: editor.agenda.trim(),
      status: editor.status,
      visibility: editor.visibility,
      due_date: editor.starts.slice(0, 10),
      metadata: {
        ...(editor.record?.metadata || {}),
        resource_url: link,
        meeting: {
          version: 1,
          starts_at: starts,
          ends_at: ends,
          location: editor.location.trim(),
          attendee_ids: [
            ...new Set(editor.attendees),
          ],
          decisions: editor.decisions.trim(),
          next_steps: editor.next_steps.trim(),
        },
      },
    };

    locked.current = true;
    setBusy(true);

    try {
      const result = await onSave(
        editor.record,
        payload,
      );

      if (!result) {
        throw new Error(
          "The meeting was not saved. Your changes are still here; check the workspace error above.",
        );
      }

      setEditor(null);
      setTab("all");
      setQuery("");
      setMine(false);
      setMessage("Meeting saved.");
      titleRef.current?.focus();
    } catch (failure) {
      setError(
        failure.message ||
        "Could not save this meeting.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="td-meetings"
      aria-label="Meeting tools"
    >
      <header className="mt-hero">
        <span className="mt-symbol">
          <CalendarDays size={27} />
        </span>

        <div>
          <p className="mt-eyebrow">MAKE TIME COUNT</p>
          <h1 tabIndex={-1} ref={titleRef}>
            Meetings
          </h1>
          <p>
            Plan the conversation. Capture decisions.
            Keep work moving.
          </p>
        </div>

        {isManager && (
          <button
            className="mt-primary"
            type="button"
            disabled={busy || Boolean(editor)}
            onClick={() => edit()}
          >
            <Plus size={17} />
            Schedule meeting
          </button>
        )}
      </header>

      {message && (
        <p className="mt-success" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-error" role="alert">
          {error}
        </p>
      )}

      {editor && (
        <form className="mt-editor" onSubmit={save}>
          <header>
            <h2>
              {editor.record
                ? "Update meeting"
                : "Schedule a meeting"}
            </h2>

            <button
              className="mt-icon"
              type="button"
              disabled={busy}
              onClick={closeEditor}
              aria-label="Close meeting editor"
            >
              <X size={20} />
            </button>
          </header>

          <fieldset disabled={busy}>
            <div className="mt-fields">
              <label className="mt-wide">
                Meeting title
                <input
                  autoFocus
                  required
                  maxLength={180}
                  value={editor.title}
                  onChange={event =>
                    change("title", event.target.value)
                  }
                  placeholder="For example: Weekly delivery review"
                />
              </label>

              <label>
                Starts · South African time
                <input
                  required
                  type="datetime-local"
                  value={editor.starts}
                  onChange={event =>
                    change("starts", event.target.value)
                  }
                />
              </label>

              <label>
                Ends · South African time
                <input
                  required
                  type="datetime-local"
                  value={editor.ends}
                  onChange={event =>
                    change("ends", event.target.value)
                  }
                />
              </label>

              <label>
                Meeting link
                <input
                  type="url"
                  maxLength={2000}
                  value={editor.link}
                  onChange={event =>
                    change("link", event.target.value)
                  }
                  placeholder="Paste a Teams, Meet, or Zoom HTTPS link"
                />
              </label>

              <label>
                Location
                <input
                  maxLength={180}
                  value={editor.location}
                  onChange={event =>
                    change("location", event.target.value)
                  }
                  placeholder="Office boardroom or online"
                />
              </label>

              <label>
                Visibility
                <select
                  value={editor.visibility}
                  onChange={event =>
                    change(
                      "visibility",
                      event.target.value,
                    )
                  }
                >
                  <option value="company">
                    Company employees can view
                  </option>
                  <option value="private">
                    Only creator and managers can view
                  </option>
                </select>
              </label>

              <label>
                Status
                <select
                  value={editor.status}
                  onChange={event =>
                    change("status", event.target.value)
                  }
                >
                  <option value="open">Scheduled</option>
                  <option value="done">Completed</option>
                  <option value="archived">Cancelled</option>
                </select>
              </label>

              <label className="mt-wide">
                Agenda
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={editor.agenda}
                  onChange={event =>
                    change("agenda", event.target.value)
                  }
                  placeholder={
                    "What will you discuss?\nAdd each agenda item on a new line."
                  }
                />
              </label>
            </div>

            <h3>Attendees</h3>

            <p className="mt-hint">
              This lists attendees; invitations are sent
              separately. Visibility above controls who
              can see the meeting.
            </p>

            <div className="mt-attendees">
              {employees.map(person => (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    checked={editor.attendees.includes(
                      person.id,
                    )}
                    onChange={event =>
                      change(
                        "attendees",
                        event.target.checked
                          ? [
                              ...editor.attendees,
                              person.id,
                            ]
                          : editor.attendees.filter(
                              id => id !== person.id,
                            ),
                      )
                    }
                  />
                  <span>{person.display_name}</span>
                </label>
              ))}

              {!employees.length && (
                <p className="mt-hint">
                  No employees are currently loaded.
                </p>
              )}
            </div>

            <div className="mt-fields mt-notes-fields">
              <label>
                Decisions
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={editor.decisions}
                  onChange={event =>
                    change(
                      "decisions",
                      event.target.value,
                    )
                  }
                  placeholder="Record what was agreed."
                />
              </label>

              <label>
                Follow-up actions
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={editor.next_steps}
                  onChange={event =>
                    change(
                      "next_steps",
                      event.target.value,
                    )
                  }
                  placeholder="Record each action, owner, and deadline."
                />
              </label>
            </div>

            <footer>
              <span>
                Times are saved in UTC and displayed
                in SAST.
              </span>

              <button
                className="mt-primary"
                type="submit"
              >
                {busy ? "Saving…" : "Save meeting"}
              </button>
            </footer>
          </fieldset>
        </form>
      )}

      <div className="mt-toolbar">
        <label className="mt-search">
          <Search size={17} />
          <input
            aria-label="Search loaded meetings"
            value={query}
            onChange={event =>
              setQuery(event.target.value)
            }
            placeholder="Search meetings, people, or locations"
          />
        </label>

        <label className="mt-mine">
          <input
            type="checkbox"
            checked={mine}
            onChange={event =>
              setMine(event.target.checked)
            }
          />
          My meetings
        </label>
      </div>

      <div
        className="mt-tabs"
        role="group"
        aria-label="Filter meetings"
      >
        {[
          ["upcoming", "Upcoming"],
          ["past", "Past"],
          ["cancelled", "Cancelled"],
          ["all", "All"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
            <span>
              {
                matches.filter(
                  record => belongs(record, value),
                ).length
              }
            </span>
          </button>
        ))}
      </div>

      <p className="mt-hint">
        All times are South African time
        (SAST, UTC+02:00). Showing meetings loaded
        into your workspace.
      </p>

      <div className="mt-list">
        {visible.map(record => {
          const data = meetingData(record);
          const state = meetingState(record, now);
          const link = safeExternalUrl(
            record.metadata?.resource_url,
          );
          const start = Date.parse(data.starts_at);

          const crossesDay =
            data.ends_at &&
            data.starts_at &&
            localMeetingTime(data.ends_at).slice(0, 10) !==
              localMeetingTime(data.starts_at).slice(0, 10);

          return (
            <article
              className="mt-card"
              id={`workplace-${record.id}`}
              key={record.id}
            >
              <div className="mt-meeting-top">
                <div className="mt-date">
                  <strong>
                    {Number.isFinite(start)
                      ? new Intl.DateTimeFormat("en-ZA", {
                          timeZone: ZONE,
                          day: "2-digit",
                        }).format(new Date(start))
                      : "—"}
                  </strong>

                  <span>
                    {Number.isFinite(start)
                      ? new Intl.DateTimeFormat("en-ZA", {
                          timeZone: ZONE,
                          month: "short",
                        }).format(new Date(start))
                      : "No date"}
                  </span>
                </div>

                <div className="mt-heading">
                  <span
                    className={`mt-status mt-status-${state}`}
                  >
                    {stateLabels[state]}
                  </span>

                  <h2>{record.title}</h2>

                  <p>
                    Organised by {nameOf(record.created_by)}
                    {record.visibility === "private"
                      ? " · Private"
                      : ""}
                  </p>
                </div>

                {link &&
                  !["past", "cancelled"].includes(state) && (
                    <a
                      className="mt-primary"
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Video size={17} />
                      Join meeting
                    </a>
                  )}
              </div>

              <div className="mt-meta">
                <span>
                  <Clock3 size={16} />
                  {dateText(data.starts_at)}
                  {" · "}
                  {timeText(data.starts_at)}
                  {"–"}
                  {crossesDay
                    ? `${dateText(data.ends_at)} · `
                    : ""}
                  {timeText(data.ends_at)}
                </span>

                <span>
                  <MapPin size={16} />
                  {data.location ||
                    (link
                      ? "Online meeting"
                      : "Location not set")}
                </span>

                <span>
                  <Users size={16} />
                  {data.attendee_ids.length}
                  {" "}
                  {data.attendee_ids.length === 1
                    ? "attendee"
                    : "attendees"}
                </span>
              </div>

              <details className="mt-details">
                <summary>
                  Agenda, attendees & meeting notes
                </summary>

                <div className="mt-details-grid">
                  <section>
                    <h3>Agenda</h3>

                    {record.description ? (
                      <ol>
                        {record.description
                          .split(/\n/)
                          .filter(line => line.trim())
                          .map((line, index) => (
                            <li key={index}>
                              {line.replace(
                                /^\s*(?:[-*]|\d+[.)])\s+/,
                                "",
                              )}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p>No agenda added yet.</p>
                    )}
                  </section>

                  <section>
                    <h3>Attendees</h3>

                    <div className="mt-chips">
                      {data.attendee_ids.map(id => (
                        <span key={id}>{nameOf(id)}</span>
                      ))}
                    </div>

                    {!data.attendee_ids.length && (
                      <p>No attendees listed yet.</p>
                    )}
                  </section>

                  <section>
                    <h3>Decisions</h3>
                    <p>
                      {data.decisions ||
                        "Record decisions after the discussion."}
                    </p>
                  </section>

                  <section>
                    <h3>Follow-up actions</h3>
                    <p>
                      {data.next_steps ||
                        "Record the next steps and their owners."}
                    </p>
                  </section>
                </div>

                {link && (
                  <p className="mt-link-source">
                    Meeting provider: {new URL(link).hostname}
                  </p>
                )}
              </details>

              {isManager && (
                <div className="mt-card-actions">
                  <button
                    className="mt-secondary"
                    type="button"
                    disabled={busy || Boolean(editor)}
                    onClick={() => edit(record)}
                  >
                    <Pencil size={15} />
                    Edit meeting & notes
                  </button>
                </div>
              )}

              {onInteract && (
                <RecordInteraction
                  record={record}
                  interactions={interactions}
                  employees={employees}
                  userId={userId}
                  isManager={isManager}
                  onInteract={onInteract}
                />
              )}
            </article>
          );
        })}

        {!visible.length && (
          <div className="mt-empty">
            <CalendarDays size={34} />
            <h2>No meetings here yet</h2>

            <p>
              {meetings.length
                ? "Try another filter or search."
                : isManager
                  ? "Schedule your first meeting and give everyone a clear agenda."
                  : "Company meetings will appear here when a manager schedules them."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}