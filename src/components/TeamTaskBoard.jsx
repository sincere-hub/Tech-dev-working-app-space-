import { useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  LoaderCircle,
  Users,
} from "lucide-react";

import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./team-task-board.css";

const statuses = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

function todayKey() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDue(value) {
  if (!value) return "No due date";

  const date = new Date(
    `${value.slice(0, 10)}T12:00:00`
  );

  return Number.isNaN(date.getTime())
    ? "No due date"
    : date.toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function BoardRow({
  task,
  employee,
  employeeId,
  isManager,
  onTask,
  onClaim,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  const canClaim = !isManager && !task.assignee_id;

  const canEdit =
    isManager || task.assignee_id === employeeId;

  const overdue =
    task.due_date &&
    task.due_date < todayKey() &&
    task.status !== "done";

  const status = statuses[task.status] || "To do";

  async function act(action) {
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError("");

    try {
      await action();
    } catch (failure) {
      setError(
        failure?.message ||
        "The task could not be updated. Please try again."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <li
      className={
        "tdtb-row" +
        (task.status === "done" ? " is-complete" : "")
      }
      aria-busy={busy}
    >
      <div className="tdtb-task">
        <button
          type="button"
          className={
            "tdtb-check" +
            (task.status === "done" ? " is-done" : "")
          }
          disabled={busy || !canEdit || !onTask}
          aria-pressed={task.status === "done"}
          aria-label={
            `Mark ${task.title} as ` +
            (task.status === "done" ? "to do" : "done")
          }
          onClick={() =>
            act(() =>
              onTask(
                task,
                task.status === "done" ? "todo" : "done"
              )
            )
          }
        >
          {task.status === "done" ? (
            <Check size={15} aria-hidden="true" />
          ) : task.status === "in_progress" ? (
            <span />
          ) : null}
        </button>

        <div className="tdtb-task-copy">
          <h3>{task.title}</h3>

          {task.description && (
            <details className="tdtb-details">
              <summary>View details</summary>
              <p>{task.description}</p>
            </details>
          )}
        </div>
      </div>

      <div className="tdtb-cell">
        <span className="tdtb-label">Assigned to</span>

        <div className="tdtb-person">
          <span className="tdtb-avatar">
            {task.assignee_id ? (
              <EmployeeAvatar
                employeeId={task.assignee_id}
              />
            ) : (
              <Users size={17} aria-hidden="true" />
            )}
          </span>

          <span>
            {task.assignee_id
              ? employee?.display_name || "Employee"
              : "Open task pool"}
          </span>
        </div>
      </div>

      <div
        className={
          "tdtb-cell" +
          (overdue ? " is-overdue" : "")
        }
      >
        <span className="tdtb-label">Due date</span>

        <span className="tdtb-date">
          <CalendarDays size={14} aria-hidden="true" />
          {formatDue(task.due_date)}
        </span>

        {overdue && (
          <small className="tdtb-overdue">Overdue</small>
        )}
      </div>

      <div className="tdtb-cell">
        <span className="tdtb-label">Priority</span>

        <span
          className={
            "tdtb-priority" +
            (task.priority === "high" ? " is-high" : "")
          }
        >
          <i aria-hidden="true" />
          {task.priority === "high" ? "High" : "Normal"}
        </span>
      </div>

      <div className="tdtb-cell tdtb-status-cell">
        <span className="tdtb-label">Status</span>

        {busy ? (
          <span className="tdtb-saving" role="status">
            <LoaderCircle
              size={15}
              className="tdtb-spin"
              aria-hidden="true"
            />
            Saving…
          </span>
        ) : canClaim ? (
          <button
            type="button"
            className="tdtb-claim"
            disabled={!onClaim}
            onClick={() => act(() => onClaim(task))}
          >
            Claim task
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : !isManager && canEdit ? (
          <select
            className="tdtb-select"
            aria-label={`Status for ${task.title}`}
            value={task.status}
            disabled={!onTask}
            onChange={event => {
              const next = event.target.value;
              void act(() => onTask(task, next));
            }}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        ) : (
          <span
            className={
              `tdtb-status tdtb-status-${task.status}`
            }
          >
            <i aria-hidden="true" />
            {status}
          </span>
        )}
      </div>

      {error && (
        <p className="tdtb-row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export default function TeamTaskBoard({
  tasks = [],
  employees = [],
  employeeId,
  isManager = false,
  onTask,
  onClaim,
}) {
  const completed = tasks.filter(
    task => task.status === "done"
  ).length;

  const percent = tasks.length
    ? Math.round(completed / tasks.length * 100)
    : 0;

  const people = new Map(
    employees.map(person => [person.id, person])
  );

  return (
    <section
      className="td-task-board"
      aria-label={
        isManager ? "Team task board" : "Your task list"
      }
    >
      <header className="tdtb-header">
        <div>
          <p className="tdtb-eyebrow">
            {isManager ? "TEAM WORK" : "YOUR WORK"}
          </p>

          <h2>
            {isManager
              ? "Team task board"
              : "Your task list"}
          </h2>

          <p className="tdtb-subtitle">
            Clear ownership. Visible progress.
          </p>
        </div>

        <span className="tdtb-total">
          <CheckCheck size={16} aria-hidden="true" />
          {completed} of {tasks.length} complete
        </span>
      </header>

      <div className="tdtb-progress-area">
        <div className="tdtb-progress-label">
          <span>Task completion</span>
          <strong>{percent}%</strong>
        </div>

        <div
          className="tdtb-progress"
          role="progressbar"
          aria-label="Task completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      {tasks.length ? (
        <>
          <div
            className="tdtb-columns"
            aria-hidden="true"
          >
            <span>Task</span>
            <span>Assigned to</span>
            <span>Due date</span>
            <span>Priority</span>
            <span>Status</span>
          </div>

          <ul className="tdtb-list">
            {tasks.map(task => (
              <BoardRow
                key={task.id}
                task={task}
                employee={people.get(task.assignee_id)}
                employeeId={employeeId}
                isManager={isManager}
                onTask={onTask}
                onClaim={onClaim}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="tdtb-empty">
          <CheckCheck size={28} aria-hidden="true" />
          <h3>No tasks here yet</h3>
          <p>
            {isManager
              ? "Assign a task above to start your team’s work."
              : "Your assigned work and open tasks will appear here."}
          </p>
        </div>
      )}

      <footer className="tdtb-footer">
        {tasks.length}{" "}
        {tasks.length === 1 ? "task" : "tasks"}
        {" · "}
        {tasks.length - completed} remaining
      </footer>
    </section>
  );
}