import { useState } from "react";
import { ArrowRight, LifeBuoy } from "lucide-react";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import { supabase } from "../lib/supabase.js";

const businessDate = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = type =>
    parts.find(piece => piece.type === type).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
};

export function journeySummary(plan, date = businessDate()) {
  const tasks = plan?.tasks || [];
  const done = tasks.filter(task => task.completed_at).length;
  const open = tasks.filter(task => !task.completed_at);

  return {
    done,
    total: tasks.length,
    overdue: open.filter(task => task.due_date < date).length,
    help: open.filter(task => task.help_note?.trim()).length,
    complete: !!tasks.length && !open.length,
  };
}

function goToTask(id) {
  const node = document.getElementById(`onboarding-task-${id}`);

  node?.scrollIntoView({
    block: "center",
    behavior: "auto",
  });

  node?.querySelector("input")?.focus({
    preventScroll: true,
  });
}

export default function OnboardingActions({
  plans,
  plan,
  employees,
  userId,
  isManager,
  onSelect,
  onRefresh,
}) {
  const [filter, setFilter] = useState("attention");
  const [expanded, setExpanded] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const active = plans.filter(row => !row.archived);

  const name = id =>
    employees.find(person => person.id === id)?.display_name ||
    "Colleague";

  const queue = active
    .map(row => ({
      plan: row,
      ...journeySummary(row),
    }))
    .sort(
      (a, b) =>
        b.help - a.help ||
        b.overdue - a.overdue ||
        a.plan.start_date.localeCompare(b.plan.start_date),
    );

  const attention = queue.filter(row => row.help || row.overdue);

  const visible = queue.filter(
    row =>
      filter === "all" ||
      (filter === "done"
        ? row.complete
        : row.help || row.overdue),
  );

  const help = active.flatMap(row =>
    (row.tasks || [])
      .filter(task => task.help_note?.trim() && !task.completed_at)
      .map(task => ({ plan: row, task })),
  );

  const canRequest =
    plan && !plan.archived && plan.employee_id === userId;

  const choices = canRequest
    ? (plan.tasks || []).filter(
        task => task.owner === "employee" && !task.completed_at,
      )
    : [];

  const selected =
    choices.find(task => task.id === taskId) || choices[0];

  const next = plan?.archived
    ? []
    : [...(plan?.tasks || [])]
        .filter(
          task =>
            !task.completed_at &&
            (task.owner === "hr"
              ? isManager
              : plan.employee_id === userId),
        )
        .sort(
          (a, b) =>
            a.due_date.localeCompare(b.due_date) ||
            a.position - b.position,
        )
        .slice(0, 2);

  async function saveHelp(id, message) {
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: failure } = await supabase.rpc(
        "td_onboarding_help",
        {
          p_task: id,
          p_note: message,
        },
      );

      if (failure) throw new Error(failure.message);

      setNotice(
        message
          ? "Request saved. HR can see it in the onboarding help queue."
          : "Help request resolved.",
      );

      if (message) setNote("");

      await onRefresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-actions">
      {isManager && (
        <section className="ob-panel">
          <header className="ob-action-heading">
            <div>
              <p className="ob-eyebrow">HR OVERVIEW</p>
              <h3>Help people move forward.</h3>
            </div>

            <span className="ob-pill">
              {active.length} active journeys
            </span>
          </header>

          <p className="ob-muted">
            {attention.length} need attention ·{" "}
            {queue.filter(row => row.complete).length} completed
            {" · "}based on loaded journeys
          </p>

          <div
            className="ob-action-filters"
            aria-label="Journey filter"
          >
            {[
              ["attention", "Needs attention"],
              ["all", "All active"],
              ["done", "Completed"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {!visible.length && <p>No journeys in this view.</p>}

          <div className="ob-journey-grid">
            {(expanded ? visible : visible.slice(0, 6)).map(row => (
              <button
                type="button"
                className="ob-journey-button"
                key={row.plan.id}
                aria-pressed={row.plan.id === plan?.id}
                onClick={() => onSelect(row.plan.id)}
              >
                <EmployeeAvatar
                  employeeId={row.plan.employee_id}
                  size={36}
                />

                <span>
                  <strong>{name(row.plan.employee_id)}</strong>
                  <small>
                    {row.done}/{row.total} tasks ·{" "}
                    {row.help} need help · {row.overdue} overdue
                  </small>
                </span>

                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>

          {visible.length > 6 && (
            <button
              className="ob-outline"
              type="button"
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? "Show fewer" : "Show all in this view"}
            </button>
          )}
        </section>
      )}

      {!!next.length && (
        <section className="ob-panel ob-next">
          <p className="ob-eyebrow">NEXT FOR YOU</p>

          <h3>
            {isManager
              ? "Your next onboarding actions"
              : "Start with these steps"}
          </h3>

          {next.map(task => (
            <div className="ob-next-row" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <small>
                  {task.help_note
                    ? "Help requested"
                    : `Due ${task.due_date}`}
                </small>
              </div>

              <button
                className="ob-outline"
                type="button"
                onClick={() => goToTask(task.id)}
              >
                Open task
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      )}

      {isManager && !!help.length && (
        <section className="ob-panel ob-help-queue">
          <header className="ob-action-heading">
            <h3>
              <LifeBuoy size={19} aria-hidden="true" />
              Help requests
            </h3>

            <span className="ob-pill">
              {help.length} open
            </span>
          </header>

          {help.map(({ plan: row, task }) => (
            <article className="ob-help-item" key={task.id}>
              <strong>
                {name(row.employee_id)} · {task.title}
              </strong>

              <p>{task.help_note}</p>

              <div className="ob-action-filters">
                <button
                  className="ob-outline"
                  type="button"
                  onClick={() => onSelect(row.id)}
                >
                  View journey
                </button>

                <button
                  className="ob-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => saveHelp(task.id, "")}
                >
                  Resolve request
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!!choices.length && (
        <details className="ob-panel ob-help-form">
          <summary>
            <LifeBuoy size={17} aria-hidden="true" />
            Need help with a step?
          </summary>

          <form
            onSubmit={event => {
              event.preventDefault();

              if (selected && note.trim()) {
                void saveHelp(selected.id, note.trim());
              }
            }}
          >
            <label>
              Task
              <select
                value={selected?.id || ""}
                disabled={busy}
                onChange={event => setTaskId(event.target.value)}
              >
                {choices.map(task => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              What’s stopping you?
              <textarea
                value={note}
                required
                maxLength={1200}
                disabled={busy}
                placeholder="For example: I cannot access the welcome guide."
                onChange={event => setNote(event.target.value)}
              />
            </label>

            {selected?.help_note && (
              <p>Current request: {selected.help_note}</p>
            )}

            <button
              className="ob-primary"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : selected?.help_note
                  ? "Update help request"
                  : "Ask HR for help"}
            </button>
          </form>
        </details>
      )}

      {error && (
        <p className="ob-error" role="alert">{error}</p>
      )}

      {notice && (
        <p className="ob-notice" role="status">{notice}</p>
      )}
    </div>
  );
}