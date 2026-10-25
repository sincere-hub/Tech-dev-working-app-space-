import { useRef, useState } from "react";
import {
  Target,
  Plus,
  Pencil,
  X,
  Search,
  Check,
} from "lucide-react";
import RecordInteraction from "./RecordInteraction.jsx";

function currentQuarter() {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());

  const year = parts.find(part => part.type === "year").value;
  const month = Number(
    parts.find(part => part.type === "month").value,
  );

  return `${year}-Q${Math.ceil(month / 3)}`;
}

function blankResult() {
  return {
    id: crypto.randomUUID(),
    title: "",
    start: 0,
    current: 0,
    target: 100,
    unit: "%",
  };
}

function resultProgress(result) {
  const values = [
    result.start,
    result.current,
    result.target,
  ];

  if (
    values.some(value =>
      value === "" ||
      value == null ||
      !Number.isFinite(Number(value)),
    )
  ) {
    return 0;
  }

  const [start, current, target] = values.map(Number);

  if (target === start) return 0;

  return Math.max(
    0,
    Math.min(
      100,
      ((current - start) / (target - start)) * 100,
    ),
  );
}

function objectiveProgress(results) {
  if (!results.length) return 0;

  return results.reduce(
    (sum, result) => sum + resultProgress(result),
    0,
  ) / results.length;
}

function detailsOf(record) {
  const data = record.metadata?.okr;

  return {
    owner_id:
      typeof data?.owner_id === "string"
        ? data.owner_id
        : "",
    cycle:
      typeof data?.cycle === "string"
        ? data.cycle
        : "Unscheduled",
    key_results: Array.isArray(data?.key_results)
      ? data.key_results.filter(
          result => result && typeof result === "object",
        )
      : [],
  };
}

function statusLabel(status) {
  return {
    open: "Planned",
    in_progress: "In progress",
    blocked: "Needs attention",
    done: "Completed",
    archived: "Archived",
  }[status] || String(status || "Planned").replaceAll("_", " ");
}

export default function OkrWorkspace({
  records = [],
  employees = [],
  interactions = [],
  userId,
  isManager,
  onSave,
  onInteract,
}) {
  const [query, setQuery] = useState("");
  const [cycle, setCycle] = useState("all");
  const [scope, setScope] = useState("all");
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const locked = useRef(false);
  const heading = useRef(null);

  const objectives = records.filter(
    record => record.module_id === "collaboration.okrs",
  );

  const people = new Map(
    employees.map(person => [
      person.id,
      person.display_name,
    ]),
  );

  function ownerName(id) {
    return people.get(id) ||
      (id ? "Employee unavailable" : "Unassigned");
  }

  const cycles = [
    ...new Set(
      objectives.map(record => detailsOf(record).cycle),
    ),
  ].sort().reverse();

  const visible = objectives.filter(record => {
    const data = detailsOf(record);

    const searchable = [
      record.title,
      record.description,
      ownerName(data.owner_id),
      ...data.key_results.map(result => result.title),
    ].join(" ").toLowerCase();

    return (
      (cycle === "all" || data.cycle === cycle) &&
      (scope === "all" || data.owner_id === userId) &&
      searchable.includes(query.trim().toLowerCase())
    );
  });

  const measured = visible.filter(
    record => detailsOf(record).key_results.length > 0,
  );

  const average = measured.length
    ? Math.round(
        measured.reduce(
          (sum, record) =>
            sum + objectiveProgress(
              detailsOf(record).key_results,
            ),
          0,
        ) / measured.length,
      )
    : null;

  function openEditor(record = null) {
    if (!isManager || locked.current) return;

    const data = record ? detailsOf(record) : null;

    setError("");
    setMessage("");

    setEditor({
      record,
      title: record?.title || "",
      description: record?.description || "",
      owner_id: data?.owner_id || "",
      cycle:
        data?.cycle && data.cycle !== "Unscheduled"
          ? data.cycle
          : currentQuarter(),
      due_date: record?.due_date || "",
      visibility: record?.visibility || "company",
      status: [
        "open",
        "in_progress",
        "blocked",
        "archived",
      ].includes(record?.status)
        ? record.status
        : "in_progress",
      key_results: data?.key_results.length
        ? data.key_results.map(result => ({
            ...result,
            id: result.id || crypto.randomUUID(),
          }))
        : [blankResult()],
    });
  }

  function change(field, value) {
    setEditor(old => ({
      ...old,
      [field]: value,
    }));
  }

  function changeResult(index, field, value) {
    setEditor(old => ({
      ...old,
      key_results: old.key_results.map((result, i) =>
        i === index
          ? { ...result, [field]: value }
          : result,
      ),
    }));
  }

  function closeEditor() {
    if (locked.current) return;

    if (
      window.confirm(
        "Discard these unsaved objective changes?",
      )
    ) {
      setEditor(null);
      setError("");
    }
  }

  async function save(event) {
    event.preventDefault();

    if (locked.current || !isManager || !editor) return;

    setError("");

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to save. Your changes are still here.",
      );
      return;
    }

    if (!editor.title.trim()) {
      setError("Give the objective a title.");
      return;
    }

    if (!/^\d{4}-Q[1-4]$/.test(editor.cycle)) {
      setError("Use a cycle such as 2026-Q4.");
      return;
    }

    if (
      !editor.key_results.length ||
      editor.key_results.length > 8
    ) {
      setError("Add between one and eight key results.");
      return;
    }

    for (const result of editor.key_results) {
      if (!String(result.title || "").trim()) {
        setError(
          "Give every key result a measurable outcome.",
        );
        return;
      }

      const values = [
        result.start,
        result.current,
        result.target,
      ];

      if (
        values.some(value =>
          value === "" ||
          value == null ||
          !Number.isFinite(Number(value)),
        )
      ) {
        setError(
          "Enter valid starting, current, and target values for every key result.",
        );
        return;
      }

      if (Number(result.target) === Number(result.start)) {
        setError(
          "Each target must differ from its starting value.",
        );
        return;
      }
    }

    const results = editor.key_results.map(result => ({
      id: result.id,
      title: String(result.title).trim(),
      start: Number(result.start),
      current: Number(result.current),
      target: Number(result.target),
      unit: String(result.unit || "").trim(),
    }));

    const progress = objectiveProgress(results);

    const payload = {
      title: editor.title.trim(),
      description: editor.description.trim(),
      due_date: editor.due_date || null,
      visibility: editor.visibility,
      status:
        editor.status === "archived"
          ? "archived"
          : progress >= 100
            ? "done"
            : editor.status,
      metadata: {
        ...(editor.record?.metadata || {}),
        okr: {
          version: 1,
          owner_id: editor.owner_id,
          cycle: editor.cycle,
          key_results: results,
        },
      },
    };

    locked.current = true;
    setBusy(true);

    try {
      const saved = await onSave(editor.record, payload);

      if (!saved) {
        throw new Error(
          "The objective was not saved. Your changes are still here; check the workspace error above.",
        );
      }

      setEditor(null);
      setMessage("Objective saved.");
      heading.current?.focus();
    } catch (failure) {
      setError(
        failure.message || "Could not save this objective.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="td-okrs"
      aria-label="Objectives and key results"
    >
      <header className="okr-hero">
        <span className="okr-symbol">
          <Target size={27} />
        </span>

        <div>
          <p className="okr-eyebrow">TEAM DIRECTION</p>

          <h1 ref={heading} tabIndex={-1}>
            Objectives & key results
          </h1>

          <p>
            Clear goals. Measurable outcomes. Visible progress.
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="okr-primary"
            disabled={busy || Boolean(editor)}
            onClick={() => openEditor()}
          >
            <Plus size={17} />
            New objective
          </button>
        )}
      </header>

      {message && (
        <p className="okr-message" role="status">
          <Check size={16} />
          {message}
        </p>
      )}

      {error && (
        <p className="okr-error" role="alert">
          {error}
        </p>
      )}

      {editor && (
        <form className="okr-editor" onSubmit={save}>
          <header>
            <h2>
              {editor.record
                ? "Update objective"
                : "Create objective"}
            </h2>

            <button
              type="button"
              className="okr-icon"
              aria-label="Close objective editor"
              disabled={busy}
              onClick={closeEditor}
            >
              <X size={20} />
            </button>
          </header>

          <fieldset disabled={busy}>
            <div className="okr-form-grid">
              <label className="okr-wide">
                Objective
                <input
                  autoFocus
                  required
                  maxLength={180}
                  value={editor.title}
                  onChange={event =>
                    change("title", event.target.value)
                  }
                  placeholder="What meaningful outcome should the team achieve?"
                />
              </label>

              <label>
                Owner
                <select
                  value={editor.owner_id}
                  onChange={event =>
                    change("owner_id", event.target.value)
                  }
                >
                  <option value="">Unassigned</option>

                  {editor.owner_id &&
                    !people.has(editor.owner_id) && (
                      <option value={editor.owner_id}>
                        Employee unavailable
                      </option>
                    )}

                  {employees.map(person => (
                    <option
                      key={person.id}
                      value={person.id}
                    >
                      {person.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cycle
                <input
                  required
                  pattern="[0-9]{4}-Q[1-4]"
                  maxLength={7}
                  value={editor.cycle}
                  onChange={event =>
                    change(
                      "cycle",
                      event.target.value.toUpperCase(),
                    )
                  }
                  placeholder="2026-Q4"
                />
              </label>

              <label>
                Due date
                <input
                  type="date"
                  value={editor.due_date}
                  onChange={event =>
                    change("due_date", event.target.value)
                  }
                />
              </label>

              <label>
                Status
                <select
                  value={editor.status}
                  onChange={event =>
                    change("status", event.target.value)
                  }
                >
                  <option value="open">Planned</option>
                  <option value="in_progress">
                    In progress
                  </option>
                  <option value="blocked">
                    Needs attention
                  </option>
                  <option value="archived">
                    Archived
                  </option>
                </select>
              </label>

              <label className="okr-wide">
                Context
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={editor.description}
                  onChange={event =>
                    change(
                      "description",
                      event.target.value,
                    )
                  }
                  placeholder="Why does this objective matter?"
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
                  <option value="company">Company</option>
                  <option value="private">
                    Only creator and managers
                  </option>
                </select>
              </label>
            </div>

            <div className="okr-section-heading">
              <h3>Measurable key results</h3>
              <span>{editor.key_results.length}/8</span>
            </div>

            <p className="okr-hint">
              Use a higher target to grow a metric or a
              lower target to reduce it. All key results
              carry equal weight.
            </p>

            {editor.key_results.map((result, index) => (
              <section
                className="okr-result-editor"
                key={result.id}
                aria-label={`Key result ${index + 1}`}
              >
                <div className="okr-result-heading">
                  <strong>KR {index + 1}</strong>

                  <button
                    type="button"
                    className="okr-icon"
                    aria-label={`Remove key result ${index + 1}`}
                    disabled={
                      editor.key_results.length === 1
                    }
                    onClick={() =>
                      change(
                        "key_results",
                        editor.key_results.filter(
                          (_, i) => i !== index,
                        ),
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>

                <label>
                  Outcome
                  <input
                    required
                    maxLength={180}
                    value={result.title || ""}
                    onChange={event =>
                      changeResult(
                        index,
                        "title",
                        event.target.value,
                      )
                    }
                    placeholder="For example: Increase completed customer onboardings"
                  />
                </label>

                <div className="okr-metric-fields">
                  {[
                    ["start", "Starting value"],
                    ["current", "Current value"],
                    ["target", "Target value"],
                  ].map(([field, label]) => (
                    <label key={field}>
                      {label}
                      <input
                        required
                        type="number"
                        step="any"
                        value={result[field] ?? ""}
                        onChange={event =>
                          changeResult(
                            index,
                            field,
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  ))}

                  <label>
                    Unit
                    <input
                      maxLength={20}
                      value={result.unit || ""}
                      onChange={event =>
                        changeResult(
                          index,
                          "unit",
                          event.target.value,
                        )
                      }
                      placeholder="%, clients, hours"
                    />
                  </label>
                </div>
              </section>
            ))}

            <button
              type="button"
              className="okr-secondary"
              disabled={editor.key_results.length >= 8}
              onClick={() =>
                change("key_results", [
                  ...editor.key_results,
                  blankResult(),
                ])
              }
            >
              <Plus size={16} />
              Add key result
            </button>

            <footer className="okr-editor-actions">
              <span>
                Completed automatically when every key
                result reaches its target.
              </span>

              <button
                type="submit"
                className="okr-primary"
              >
                {busy ? "Saving…" : "Save objective"}
              </button>
            </footer>
          </fieldset>
        </form>
      )}

      <div className="okr-toolbar">
        <label className="okr-search">
          <Search size={17} />
          <input
            aria-label="Search loaded objectives"
            value={query}
            onChange={event =>
              setQuery(event.target.value)
            }
            placeholder="Find an objective, owner, or result"
          />
        </label>

        <select
          aria-label="Filter by cycle"
          value={cycle}
          onChange={event => setCycle(event.target.value)}
        >
          <option value="all">All cycles</option>
          {cycles.map(value => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          aria-label="Filter by owner"
          value={scope}
          onChange={event => setScope(event.target.value)}
        >
          <option value="all">All owners</option>
          <option value="mine">Assigned to me</option>
        </select>
      </div>

      <p className="okr-hint">
        Showing objectives loaded into your workspace.
        Filters apply to the figures below.
      </p>

      <div className="okr-stats">
        <div>
          <span>Objectives</span>
          <strong>{visible.length}</strong>
        </div>

        <div>
          <span>Average progress</span>
          <strong>
            {average === null ? "—" : `${average}%`}
          </strong>
        </div>

        <div>
          <span>Needs attention</span>
          <strong>
            {
              visible.filter(
                record => record.status === "blocked",
              ).length
            }
          </strong>
        </div>

        <div>
          <span>Completed</span>
          <strong>
            {
              visible.filter(
                record => record.status === "done",
              ).length
            }
          </strong>
        </div>
      </div>

      <div className="okr-objectives">
        {visible.map(record => {
          const data = detailsOf(record);
          const progress = objectiveProgress(
            data.key_results,
          );

          return (
            <article
              className="okr-objective"
              id={`workplace-${record.id}`}
              key={record.id}
            >
              <div className="okr-card-top">
                <span className="okr-cycle">
                  {data.cycle}
                </span>

                <span
                  className={`okr-status ${
                    record.status === "blocked"
                      ? "okr-status-alert"
                      : record.status === "done"
                        ? "okr-status-done"
                        : ""
                  }`}
                >
                  {statusLabel(record.status)}
                </span>
              </div>

              <div className="okr-objective-heading">
                <div>
                  <h2>{record.title}</h2>
                  <p>
                    {record.description ||
                      "No context added yet."}
                  </p>
                </div>

                <div className="okr-score">
                  <strong>
                    {data.key_results.length
                      ? `${Math.round(progress)}%`
                      : "—"}
                  </strong>
                  <span>achieved</span>
                </div>
              </div>

              <p className="okr-owner">
                {ownerName(data.owner_id)}
                <span>·</span>
                {record.visibility === "private"
                  ? "Private"
                  : "Company"}

                {record.due_date && (
                  <>
                    <span>·</span>
                    Due {record.due_date}
                  </>
                )}
              </p>

              <div className="okr-key-results">
                {data.key_results.map((result, index) => (
                  <div
                    className="okr-key-result"
                    key={result.id || index}
                  >
                    <div className="okr-result-title">
                      <span>KR {index + 1}</span>
                      <strong>{result.title}</strong>
                      <b>
                        {Math.round(
                          resultProgress(result),
                        )}%
                      </b>
                    </div>

                    <progress
                      max="100"
                      value={resultProgress(result)}
                      aria-label={`Progress for ${result.title}`}
                    />

                    <p>
                      Start: {result.start}
                      {" · "}Current: {result.current}
                      {" · "}Target: {result.target}
                      {result.unit
                        ? ` ${result.unit}`
                        : ""}
                    </p>
                  </div>
                ))}

                {!data.key_results.length && (
                  <p className="okr-hint">
                    No measurable key results yet. A manager
                    can add them using Update objective.
                  </p>
                )}
              </div>

              {isManager && (
                <div className="okr-card-actions">
                  <button
                    type="button"
                    className="okr-secondary"
                    disabled={busy || Boolean(editor)}
                    onClick={() => openEditor(record)}
                  >
                    <Pencil size={15} />
                    Update objective
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
          <div className="okr-empty">
            <Target size={32} />

            <h2>
              {objectives.length
                ? "No matching objectives"
                : "Give your team a clear direction"}
            </h2>

            <p>
              {objectives.length
                ? "Try another search or filter."
                : isManager
                  ? "Create an objective, assign an owner, and define measurable key results."
                  : "Shared objectives will appear here when a manager creates them."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}