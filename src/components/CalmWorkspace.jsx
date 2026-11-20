import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
} from "lucide-react";
import EmployeeAvatar from "./EmployeeAvatar.jsx";

const statuses = {
  todo: "To do",
  in_progress: "In progress",
  done: "Completed",
};

function partsFor(now, options) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    ...options,
  }).formatToParts(now);
}

function dayKey(now) {
  const parts = partsFor(now, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return ["year", "month", "day"]
    .map(key => parts.find(part => part.type === key).value)
    .join("-");
}

function dueLabel(value, now) {
  if (!value) return "No due date";

  const key = value.slice(0, 10);

  if (key === dayKey(now)) return "Today";

  const parsed = new Date(`${key}T12:00:00+02:00`);

  if (Number.isNaN(parsed.getTime())) return "No due date";

  const formatted = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  }).format(parsed);

  return `${key < dayKey(now) ? "Overdue · " : ""}${formatted}`;
}

function taskOrder(a, b) {
  return (
    (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
    a.title.localeCompare(b.title)
  );
}

function useDayClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    function update() {
      if (!document.hidden) setNow(new Date());
    }

    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return now;
}

function TaskItem({
  task,
  now,
  onTask,
  onClaim,
  canEdit = true,
  employee,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  const claimable = !task.assignee_id && !!onClaim;

  async function act(action) {
    if (locked.current) return;

    locked.current = true;
    setBusy(true);
    setError("");

    try {
      await action();
    } catch (failure) {
      setError(
        failure?.message ||
          "Could not update this task. Please try again."
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <li
      className={`calm-task${task.status === "done" ? " is-done" : ""}`}
      aria-busy={busy}
    >
      <div className="calm-task-line">
        <button
          type="button"
          className="calm-check"
          disabled={busy || !canEdit || claimable || !onTask}
          aria-pressed={task.status === "done"}
          aria-label={`Mark ${task.title} as ${
            task.status === "done" ? "to do" : "completed"
          }`}
          onClick={() =>
            void act(() =>
              onTask(task, task.status === "done" ? "todo" : "done")
            )
          }
        >
          {task.status === "done" && (
            <Check size={15} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className="calm-task-open"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          <span>
            <strong>{task.title}</strong>
            <small
              className={
                task.status === "in_progress"
                  ? "calm-in-progress"
                  : ""
              }
            >
              {dueLabel(task.due_date, now)} ·{" "}
              {statuses[task.status] || "To do"}
            </small>
          </span>

          <ChevronDown
            size={16}
            className={open ? "is-open" : ""}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="calm-task-detail">
          {task.description && <p>{task.description}</p>}

          {employee && (
            <div className="calm-task-person">
              <EmployeeAvatar
                employeeId={employee.id}
                interactive={false}
              />
              <span>{employee.display_name}</span>
            </div>
          )}

          <small>
            Priority: {task.priority === "high" ? "High" : "Normal"}
          </small>

          {claimable ? (
            <button
              className="calm-action"
              type="button"
              disabled={busy}
              onClick={() => void act(() => onClaim(task))}
            >
              {busy ? "Saving…" : "Claim task"}
              <ArrowRight size={15} />
            </button>
          ) : (
            canEdit &&
            onTask && (
              <label>
                Task status
                <select
                  name={`task-status-${task.id}`}
                  value={task.status}
                  disabled={busy}
                  onChange={event => {
                    const next = event.target.value;
                    void act(() => onTask(task, next));
                  }}
                >
                  {Object.entries(statuses).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            )
          )}
        </div>
      )}

      {error && (
        <p className="calm-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export function CalmHome({
  name,
  tasks = [],
  announcements = [],
  onTask,
  onView,
  children,
}) {
  const now = useDayClock();

  const hour = Number(
    partsFor(now, {
      hour: "numeric",
      hourCycle: "h23",
    }).find(part => part.type === "hour").value
  );

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

  const next = tasks
    .filter(task => task.status !== "done")
    .sort(taskOrder)
    .slice(0, 2);

  const announcement = announcements[0];

  return (
    <section className="calm-home">
      <header className="calm-heading">
        <p>
          {new Intl.DateTimeFormat("en-ZA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Africa/Johannesburg",
          }).format(now)}
        </p>

        <h1>
          {greeting},
          <br />
          {name}.
        </h1>

        <p>Here’s your day at a glance.</p>
      </header>

      <div className="calm-home-layout">
        <div className="calm-clock-slot">{children}</div>

        <div className="calm-home-sections">
          <section className="calm-section">
            <header>
              <h2>Your next tasks</h2>
              <button type="button" onClick={() => onView("tasks")}>
                View all
              </button>
            </header>

            {next.length ? (
              <ul className="calm-task-list">
                {next.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    now={now}
                    onTask={onTask}
                  />
                ))}
              </ul>
            ) : (
              <div className="calm-empty">
                <CheckCheck size={25} />
                <h3>You’re up to date</h3>
                <p>Your next assigned tasks will appear here.</p>
                <button
                  type="button"
                  className="calm-link"
                  onClick={() => onView("tasks")}
                >
                  Open my tasks <ArrowRight size={14} />
                </button>
              </div>
            )}
          </section>

          <section className="calm-section">
            <header>
              <h2>Company update</h2>
              <button
                type="button"
                onClick={() => onView("notices")}
              >
                View all
              </button>
            </header>

            {announcement ? (
              <button
                type="button"
                className="calm-announcement"
                onClick={() => onView("notices")}
              >
                <span className="calm-notice-icon">
                  <FileText size={21} />
                </span>

                <span>
                  <strong>{announcement.title}</strong>
                  <span className="calm-notice-preview">
                    {announcement.body}
                  </span>
                </span>

                <ArrowRight size={15} />
              </button>
            ) : (
              <p className="calm-muted">No new company updates.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

export function CalmTasks({
  tasks = [],
  employees = [],
  employeeId,
  isManager = false,
  onTask,
  onClaim,
  children,
}) {
  const [tab, setTab] = useState("today");
  const now = useDayClock();
  const key = dayKey(now);

  const mine = tasks.filter(
    task => task.assignee_id === employeeId
  );

  const available = tasks.filter(
    task => !task.assignee_id && task.status !== "done"
  );

  const tabs = {
    today: "Today",
    upcoming: "Upcoming",
    completed: "Completed",
    ...(available.length ? { available: "Available work" } : {}),
    ...(isManager ? { team: "Team board" } : {}),
  };

  const activeTab = tabs[tab] ? tab : "today";

  const list =
    activeTab === "available"
      ? available
      : mine.filter(task =>
          activeTab === "completed"
            ? task.status === "done"
            : task.status !== "done" &&
              (activeTab === "today"
                ? !task.due_date ||
                  task.due_date.slice(0, 10) <= key ||
                  task.status === "in_progress"
                : task.due_date &&
                  task.due_date.slice(0, 10) > key &&
                  task.status !== "in_progress")
        );

  return (
    <section className="calm-tasks">
      <header className="calm-heading">
        <h1>{activeTab === "team" ? "Team tasks" : "My tasks"}</h1>
        <p>
          {activeTab === "team"
            ? "Clear assignments and shared progress."
            : "Focus on what’s next."}
        </p>
      </header>

      <div
        className="calm-tabs"
        role="group"
        aria-label="Task view"
      >
        {Object.entries(tabs).map(([id, title]) => (
          <button
            type="button"
            key={id}
            aria-pressed={activeTab === id}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </div>

      {activeTab === "team" ? (
        children
      ) : (
        <>
          <p className="calm-list-caption">
            {list.length} {list.length === 1 ? "task" : "tasks"}{" "}
            {activeTab === "today"
              ? "to focus on"
              : activeTab === "upcoming"
                ? "coming up"
                : activeTab === "available"
                  ? "available to claim"
                  : "completed"}
          </p>

          {list.length ? (
            <ul className="calm-task-list">
              {[...list].sort(taskOrder).map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  now={now}
                  onTask={onTask}
                  onClaim={
                    activeTab === "available" ? onClaim : undefined
                  }
                  canEdit={task.assignee_id === employeeId}
                  employee={employees.find(
                    person => person.id === task.assignee_id
                  )}
                />
              ))}
            </ul>
          ) : (
            <div className="calm-empty">
              <CheckCheck size={30} />
              <h2>
                {activeTab === "completed"
                  ? "Your progress will appear here"
                  : activeTab === "upcoming"
                    ? "Nothing scheduled ahead"
                    : "You’re up to date"}
              </h2>
              <p>
                {activeTab === "completed"
                  ? "Completed tasks stay here for you to review."
                  : "Assigned tasks will appear here when there’s work to do."}
              </p>
            </div>
          )}

          {!!list.length && (
            <p className="calm-end-note">
              <CheckCheck size={25} />
              <span>One task at a time.</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}