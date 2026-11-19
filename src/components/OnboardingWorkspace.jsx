import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./onboarding-workspace.css";
import OnboardingActions from "./OnboardingActions.jsx";

const stages = {
  prepare: "Before day one",
  day1: "Day one",
  week1: "First week",
  month1: "First month",
};

const freshChecklist = () => [
  [
    "Prepare workspace and approved accounts",
    "prepare",
    "hr",
    -1,
    "Arrange the equipment and access needed for the role.",
  ],
  [
    "Check your profile and sign-in",
    "day1",
    "employee",
    0,
    "Confirm your name, role and contact details with HR.",
  ],
  [
    "Read the company welcome guide",
    "day1",
    "employee",
    0,
    "Find the welcome guide and policies in Docs & wiki. Ask HR if you need help.",
  ],
  [
    "Introduce the manager and buddy",
    "day1",
    "hr",
    0,
    "Introduce the employee to their manager and their first point of contact.",
  ],
  [
    "Learn attendance, tasks and notices",
    "week1",
    "employee",
    2,
    "Practise clocking in and out, opening assigned tasks, and reading company notices.",
  ],
  [
    "Confirm equipment and tool access",
    "week1",
    "hr",
    2,
    "Check that the employee can access the tools their role requires.",
  ],
  [
    "Discuss your first-week goals",
    "week1",
    "employee",
    5,
    "Meet your manager and agree on your first responsibilities and support needs.",
  ],
  [
    "Hold the first-month check-in",
    "month1",
    "hr",
    29,
    "Discuss progress, answer questions and agree on next steps.",
  ],
].map(([title, phase, owner, day, instructions]) => ({
  title,
  phase,
  owner,
  day,
  instructions,
}));

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const displayDate = value =>
  value
    ? new Date(value + "T12:00:00+02:00").toLocaleDateString(
        "en-ZA",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Africa/Johannesburg",
        },
      )
    : "";

const tasksOf = plan =>
  [...(plan?.tasks || [])].sort(
    (a, b) => a.position - b.position,
  );

export default function OnboardingWorkspace({
  employees = [],
  userId,
  isManager,
  records = [],
  onNavigate,
}) {
  const [plans, setPlans] = useState([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState(freshChecklist);

  const requestId = useRef(null);

  const manager = isManager === true;

  const person = id =>
    employees.find(row => row.id === id);

  const available = plans.filter(
    item => showArchived || !item.archived,
  );

  const plan =
    available.find(row => row.id === selected) ||
    available[0];

  const tasks = tasksOf(plan);

  const completed = tasks.filter(
    task => task.completed_at,
  ).length;

  const percentage = tasks.length
    ? Math.round((completed * 100) / tasks.length)
    : 0;

  const overdue = tasks.filter(
    task => !task.completed_at && task.due_date < today(),
  ).length;

  const legacy = records.filter(
    row => row.module_id === "people.onboarding",
  );

  async function load(signal) {
    const { data, error: failure } = await supabase
      .from("td_onboarding_plans")
      .select("*,tasks:td_onboarding_tasks(*)")
      .order("created_at", { ascending: false })
      .limit(100)
      .abortSignal(
        signal || new AbortController().signal,
      );

    if (failure) {
      const needsSetup = [
        "42P01",
        "PGRST200",
        "PGRST205",
      ].includes(failure.code);

      throw new Error(
        needsSetup
          ? "Onboarding is not configured yet. Run supabase/onboarding.sql in the SQL Editor."
          : "Could not load onboarding. Check your connection and try Refresh.",
      );
    }

    if (!signal?.aborted) {
      setPlans(data || []);
    }
  }

  useEffect(() => {
    const abort = new AbortController();

    load(abort.signal)
      .catch(failure => {
        if (!abort.signal.aborted) {
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abort.abort();
  }, [userId]);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  function edit(index, key, value) {
    setDraft(rows =>
      rows.map((row, i) =>
        i === index
          ? { ...row, [key]: value }
          : row,
      ),
    );
  }

  async function create(event) {
    event.preventDefault();

    if (!manager || busy) return;

    const form = event.currentTarget;
    const fields = new FormData(form);

    setBusy("create");
    setError("");
    setNotice("");

    try {
      if (!requestId.current) {
        requestId.current = crypto.randomUUID();
      }

      const { data, error: failure } =
        await supabase.rpc("td_onboarding_create", {
          p_id: requestId.current,
          p_employee: fields.get("employee"),
          p_start: fields.get("start"),
          p_tasks: draft,
        });

      if (failure) {
        throw new Error(failure.message);
      }

      requestId.current = null;
      form.reset();
      setDraft(freshChecklist());
      setSelected(data);
      setShowArchived(false);
      setNotice(
        "Onboarding assigned. The employee can now open their checklist.",
      );

      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  async function change(task) {
    if (busy) return;

    setBusy(task.id);
    setError("");
    setNotice("");

    try {
      const { error: failure } = await supabase.rpc(
        "td_onboarding_set_task",
        {
          p_task: task.id,
          p_done: !task.completed_at,
        },
      );

      if (failure) {
        throw new Error(failure.message);
      }

      setNotice(
        task.completed_at
          ? "Task reopened."
          : "Task completed.",
      );

      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  async function archive() {
    if (!plan || busy) return;

    const confirmed = window.confirm(
      "Archive this journey? Its checklist will be kept and become read-only.",
    );

    if (!confirmed) return;

    setBusy("archive");
    setError("");

    try {
      const { error: failure } = await supabase.rpc(
        "td_onboarding_archive",
        { p_plan: plan.id },
      );

      if (failure) {
        throw new Error(failure.message);
      }

      setNotice(
        "Journey archived. You can assign a new journey to this employee.",
      );

      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="td-onboarding">
      <header className="ob-hero">
        <div>
          <p className="ob-eyebrow">
            <UserPlus size={16} aria-hidden="true" />
            PEOPLE &amp; CULTURE
          </p>

          <h2>
            {manager
              ? "A great start, for everyone."
              : "Your start at TechDev."}
          </h2>

          <p>
            {manager
              ? "Give new colleagues a clear path from their first day to their first month."
              : "Your checklist, your team, and the steps that help you settle in."}
          </p>
        </div>

        <button
          className="ob-outline"
          type="button"
          disabled={loading || !!busy}
          onClick={refresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {error && (
        <p className="ob-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="ob-notice" role="status">
          {notice}
        </p>
      )}

      {manager && (
        <details className="ob-panel ob-create">
          <summary>
            <UserPlus size={18} aria-hidden="true" />
            Create a journey
            <span>
              TechDev essentials · customise before assigning
            </span>
          </summary>

          <form onSubmit={create}>
            <fieldset disabled={!!busy}>
              <div className="ob-fields">
                <label>
                  New colleague
                  <select
                    name="employee"
                    defaultValue=""
                    required
                  >
                    <option value="">
                      Choose an employee
                    </option>

                    {employees
                      .filter(row => !row.is_banned)
                      .map(row => (
                        <option
                          key={row.id}
                          value={row.id}
                        >
                          {row.display_name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  First day
                  <input
                    name="start"
                    type="date"
                    defaultValue={today()}
                    required
                  />
                </label>
              </div>

              <p className="ob-muted">
                Due dates use calendar days relative to the
                first day. Review the tasks before assigning.
              </p>

              <div className="ob-draft">
                {draft.map((item, index) => (
                  <details key={index}>
                    <summary>
                      {index + 1}.{" "}
                      {item.title || "Untitled task"}
                    </summary>

                    <div className="ob-fields">
                      <label>
                        Task title
                        <input
                          value={item.title}
                          maxLength={160}
                          required
                          onChange={event =>
                            edit(
                              index,
                              "title",
                              event.target.value,
                            )
                          }
                        />
                      </label>

                      <label>
                        Stage
                        <select
                          value={item.phase}
                          onChange={event =>
                            edit(
                              index,
                              "phase",
                              event.target.value,
                            )
                          }
                        >
                          {Object.entries(stages).map(
                            ([key, label]) => (
                              <option
                                key={key}
                                value={key}
                              >
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label>
                        Responsible
                        <select
                          value={item.owner}
                          onChange={event =>
                            edit(
                              index,
                              "owner",
                              event.target.value,
                            )
                          }
                        >
                          <option value="employee">
                            Employee
                          </option>
                          <option value="hr">
                            HR / manager
                          </option>
                        </select>
                      </label>

                      <label>
                        Days after first day
                        <input
                          type="number"
                          min={-30}
                          max={180}
                          value={item.day}
                          required
                          onChange={event =>
                            edit(
                              index,
                              "day",
                              event.target.value === ""
                                ? ""
                                : Number(
                                    event.target.value,
                                  ),
                            )
                          }
                        />
                      </label>

                      <label className="ob-wide">
                        Instructions
                        <textarea
                          maxLength={1000}
                          value={item.instructions}
                          onChange={event =>
                            edit(
                              index,
                              "instructions",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>

                    <button
                      className="ob-outline"
                      type="button"
                      disabled={draft.length === 1}
                      onClick={() =>
                        setDraft(rows =>
                          rows.filter(
                            (_, i) => i !== index,
                          ),
                        )
                      }
                    >
                      Remove task
                    </button>
                  </details>
                ))}
              </div>

              <button
                className="ob-outline"
                type="button"
                disabled={draft.length >= 50}
                onClick={() =>
                  setDraft(rows => [
                    ...rows,
                    {
                      title: "",
                      phase: "week1",
                      owner: "employee",
                      day: 5,
                      instructions: "",
                    },
                  ])
                }
              >
                Add task
              </button>

              <button
                className="ob-primary"
                type="submit"
              >
                {busy === "create"
                  ? "Assigning…"
                  : "Assign onboarding"}
              </button>
            </fieldset>
          </form>
        </details>
      )}

      {loading && (
        <p role="status">
          Loading onboarding journeys…
        </p>
      )}

      <div className="ob-toolbar">
        <label className="ob-picker">
          {manager ? "Recent journeys" : "My journeys"}

          <select
            value={plan?.id || ""}
            onChange={event =>
              setSelected(event.target.value)
            }
            disabled={!!busy}
          >
            <option value="">
              {available.length
                ? "Choose a journey"
                : "No journey assigned"}
            </option>

            {available.map(row => (
              <option key={row.id} value={row.id}>
                {person(row.employee_id)?.display_name ||
                  "Employee"}
                {" · "}
                {displayDate(row.start_date)}
                {row.archived ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="ob-archive">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={event =>
              setShowArchived(event.target.checked)
            }
          />
          Include archived
        </label>
      </div>

      {!loading && !plan && (
        <div className="ob-panel ob-empty">
          <UserPlus size={30} aria-hidden="true" />

          <h3>
            {manager
              ? "A clear first step."
              : "Your journey is on its way."}
          </h3>

          <p>
            {manager
              ? "Open Create a journey, choose a colleague and set their first day."
              : "HR will assign your onboarding checklist here."}
          </p>
        </div>
      )}
{(!loading || plans.length > 0) && (
  <OnboardingActions
    key={plan?.id || "empty"}
    plans={plans}
    plan={plan}
    employees={employees}
    userId={userId}
    isManager={manager}
    onSelect={id => {
      setSelected(id);
      setShowArchived(false);
    }}
    onRefresh={refresh}
  />
)}
      {plan && (
        <>
          <div className="ob-panel ob-person">
            <EmployeeAvatar
              employeeId={plan.employee_id}
              size={52}
            />

            <div>
              <p className="ob-eyebrow">
                {plan.archived
                  ? "ARCHIVED JOURNEY"
                  : "ONBOARDING JOURNEY"}
              </p>

              <h3>
                {person(plan.employee_id)?.display_name ||
                  "New colleague"}
              </h3>

              <p>
                First day · {displayDate(plan.start_date)}
              </p>
            </div>

            <span className="ob-pill">
              {completed === tasks.length && tasks.length
                ? "Completed"
                : "In progress"}
            </span>
          </div>

          <div className="ob-metrics">
            <div className="ob-panel">
              <span>Progress</span>
              <strong>{percentage}%</strong>

              <progress
                value={completed}
                max={tasks.length || 1}
                aria-label="Onboarding completion"
              />

              <small>
                {completed} of {tasks.length} completed
              </small>
            </div>

            <div className="ob-panel">
              <span>
                {plan.archived ? "Unfinished" : "Overdue"}
              </span>

              <strong>
                {plan.archived
                  ? tasks.length - completed
                  : overdue}
              </strong>

              <small>
                {plan.archived
                  ? "When archived"
                  : "Needs attention"}
              </small>
            </div>

            <button
              className="ob-panel ob-resource"
              type="button"
              onClick={() =>
                onNavigate("suite", "collaboration.docs")
              }
            >
              <ArrowUpRight
                size={20}
                aria-hidden="true"
              />
              <strong>Docs &amp; wiki</strong>
              <span>
                Company guides and useful references
              </span>
            </button>
          </div>

          {Object.entries(stages).map(([key, label]) => (
            <section
              className="ob-panel ob-stage"
              key={key}
            >
              <header>
                <h3>{label}</h3>

                <small>
                  {
                    tasks.filter(
                      task =>
                        task.phase === key &&
                        task.completed_at,
                    ).length
                  }
                  /
                  {
                    tasks.filter(
                      task => task.phase === key,
                    ).length
                  }{" "}
                  done
                </small>
              </header>

              {tasks
                .filter(task => task.phase === key)
                .map(task => {
                  const allowed =
                    !plan.archived &&
                    (task.owner === "hr"
                      ? manager
                      : plan.employee_id === userId);

                  const late =
                    !plan.archived &&
                    !task.completed_at &&
                    task.due_date < today();

                  return (
                    <article
                      className="ob-task"
                      id={`onboarding-task-${task.id}`}
                      key={task.id}
                      data-done={!!task.completed_at}
                    >
                      <input
                        type="checkbox"
                        checked={!!task.completed_at}
                        disabled={!!busy || !allowed}
                        aria-label={`${
                          task.completed_at
                            ? "Reopen"
                            : "Complete"
                        }: ${task.title}`}
                        onChange={() => change(task)}
                      />

                      <div>
                        <h4>{task.title}</h4>
                        <p>{task.instructions}</p>

                        <div className="ob-task-meta">
                          <span>
                            {task.owner === "hr"
                              ? "HR / manager"
                              : "Employee"}
                          </span>

                          <span
                            className={
                              late ? "ob-late" : ""
                            }
                          >
                            {late ? "Overdue · " : "Due "}
                            {displayDate(task.due_date)}
                          </span>

                          {task.completed_at && (
                            <span className="ob-done">
                              <CheckCircle2
                                size={14}
                                aria-hidden="true"
                              />
                              Completed ·{" "}
                              {person(task.completed_by)
                                ?.display_name ||
                                "Team member"}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
            </section>
          ))}

          {manager && !plan.archived && (
            <button
              className="ob-outline"
              type="button"
              disabled={!!busy}
              onClick={archive}
            >
              Archive journey
            </button>
          )}
        </>
      )}

      {manager && plans.length === 100 && (
        <small className="ob-muted">
          Showing the 100 most recent journeys.
        </small>
      )}

      {!!legacy.length && (
        <details className="ob-panel">
          <summary>
            Earlier onboarding notes ({legacy.length})
          </summary>

          {legacy.map(row => (
            <article key={row.id}>
              <h4>{row.title}</h4>
              <p>{row.description}</p>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}