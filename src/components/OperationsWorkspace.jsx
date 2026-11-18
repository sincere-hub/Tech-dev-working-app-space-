import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import RecordInteraction from "./RecordInteraction.jsx";
import "./developer-catalog.css";
import "./operations-workspace.css";

const severityLabels = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};
const incidentStates = {
  open: "Reported", in_progress: "Investigating", done: "Resolved",
};

const formatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
});

const date = value => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? formatter.format(time) : "";
};

const text = (fields, key) => String(fields.get(key) || "").trim();
const localTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ? Date.parse(value + ":00+02:00")
  : NaN;

function metadata(record) {
  try { return JSON.parse(record.metadata?.field_value || "null"); }
  catch { return null; }
}

function People({ employees, name, title, required = false }) {
  return (
    <label className="field">
      <span>{title}</span>
      <select name={name} required={required} defaultValue="">
        <option value="">{required ? "Choose an employee" : "None"}</option>
        {employees.map(employee => (
          <option value={employee.id} key={employee.id}>{employee.display_name}</option>
        ))}
      </select>
    </label>
  );
}

export default function OperationsWorkspace({
  records, employees, interactions, userId, onCreate, onStatus, onInteract,
}) {
  const [now, setNow] = useState(Date.now);
  const [check, setCheck] = useState({});
  const [saving, setSaving] = useState("");
  const [saveError, setSaveError] = useState("");
  const [service, setService] = useState("");
  const [changing, setChanging] = useState("");

  const roster = employees.filter(person => !person.is_banned);
  const name = id => employees.find(person => person.id === id)?.display_name
    || "Employee unavailable";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const rows = records.filter(r => r.module_id === "platform.operations")
    .map(record => ({ record, details: metadata(record) }));

  const incidents = rows.filter(({ details }) => details?.kind === "incident");
  const shifts = rows
    .filter(({ record, details }) => details?.kind === "oncall" && record.status === "published")
    .sort((a, b) => Date.parse(a.details.start) - Date.parse(b.details.start));
  const active = shifts.filter(({ details }) =>
    Date.parse(details.start) <= now && now < Date.parse(details.end));
  const upcoming = shifts.filter(({ details }) => Date.parse(details.start) > now);
  const legacy = rows.filter(({ details }) => !["incident", "oncall"].includes(details?.kind));

  async function runChecks() {
    if (check.loading) return;
    setCheck({ loading: true });

    try {
      const { data, error } = await supabase.functions.invoke("operations-check", { body: {} });
      if (error) {
        const detail = await error.context?.json?.().catch(() => null);
        throw new Error(detail?.error || "Could not reach operations-check. Check that the function is deployed.");
      }
      setCheck({ data });
    } catch (error) {
      setCheck({ error: error.message || "Could not check services." });
    }
  }

  async function save(event, kind) {
    event.preventDefault();
    if (saving) return;

    const form = event.currentTarget;
    const fields = new FormData(form);
    const scope = text(fields, "service");

    setSaveError("");
    if (!scope) return setSaveError("Enter a service or team name.");

    const details = { kind, service: scope };

    if (kind === "incident") {
      if (!text(fields, "title") || !text(fields, "description")) {
        return setSaveError("Enter an incident title and describe the impact.");
      }
      details.severity = text(fields, "severity");
      details.owner = text(fields, "owner");
    } else {
      const start = localTime(text(fields, "start"));
      const end = localTime(text(fields, "end"));
      const primary = text(fields, "primary");
      const backup = text(fields, "backup");

      if (!primary || (backup && primary === backup)) {
        return setSaveError("Choose a primary and a different backup, or leave backup empty.");
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return setSaveError("The shift must end after it starts.");
      }

      Object.assign(details, {
        primary, backup,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
      form.elements.namedItem("title").value = `On call: ${scope}`;
    }

    form.elements.namedItem("module_value").value = JSON.stringify(details);
    setSaving(kind);

    try {
      if (!await onCreate(event)) {
        setSaveError("The record was not saved. Your entries are still here.");
      } else if (kind === "incident") {
        setService("");
      }
    } catch {
      setSaveError("Could not save. Try again.");
    } finally {
      setSaving("");
    }
  }

  async function change(record, status) {
    if (changing) return;
    setChanging(record.id);
    try { await onStatus(record, status); }
    finally { setChanging(""); }
  }

  function shiftList(items, canCancel = false) {
    return (
      <ul className="td-code-items">
        {items.map(({ record, details }) => (
          <li key={record.id}>
            <div>
              <strong>{details.service} · {name(details.primary)}</strong>
              <small>{date(details.start)} → {date(details.end)} SAST</small>
              {details.backup && <small>Backup: {name(details.backup)}</small>}
              {record.description && (
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{record.description}</p>
              )}
            </div>
            {canCancel && (
              <button type="button" className="outline-button" disabled={!!changing}
                onClick={() => change(record, "archived")}>Cancel shift</button>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="td-code-catalog td-operations" aria-label="Monitoring, incidents and on-call">
      <header className="td-code-header">
        <div>
          <p className="td-code-kicker"><Activity size={15} aria-hidden="true" /> SERVICE OPERATIONS</p>
          <h2>Monitoring, incidents &amp; on-call</h2>
          <p>Check service endpoints, track incidents, and see who covers each shift.</p>
        </div>
        <a href="#operations-incident-form">Log incident</a>
      </header>
<div className="td-ops-overview" aria-label="Operations at a glance">
  <div>
    <span>Services responding</span>
    <strong>
      {check.data?.checks?.length
        ? `${check.data.checks.filter(item => item.state === "Responding").length}/${check.data.checks.length}`
        : "—"}
    </strong>
  </div>
  <div>
    <span>Unresolved incidents</span>
    <strong>
      {incidents.filter(({ record }) => !["done", "archived"].includes(record.status)).length}
    </strong>
  </div>
  <div>
    <span>Active on-call shifts</span>
    <strong>{active.length}</strong>
  </div>
</div>
      <h3>Service health</h3>
      <div className="td-code-tools">
        <button type="button" className="primary-button" disabled={check.loading} onClick={runChecks}>
          {check.loading ? "Checking…" : "Check services"}
        </button>
        <small>
          {check.data?.checkedAt
            ? `Last checked ${date(check.data.checkedAt)} SAST`
            : "Runs a check when requested."}
        </small>
      </div>

      {check.error && <p role="alert">{check.error}</p>}
      {check.data && !check.data.checks.length && <p>No endpoints are configured for monitoring.</p>}
      {!!check.data?.checks?.length && (
        <div className="td-code-facts">
          {check.data.checks.map(item => (
            <div key={item.name} data-health={item.state}>
              <strong>{item.name}</strong>
              <span>{item.state}{item.code ? ` · HTTP ${item.code}` : ""} · {item.ms} ms</span>
              {item.state !== "Responding" && (
                <a href="#operations-incident-form" onClick={() => setService(item.name)}>Log incident</a>
              )}
            </div>
          ))}
        </div>
      )}

      <h3>Incidents</h3>
      <form id="operations-incident-form" className="form-grid" onSubmit={event => save(event, "incident")}>
        <label className="field">
          <span>Incident title</span><input name="title" required maxLength={180} />
        </label>
        <label className="field">
          <span>Affected service</span>
          <input name="service" required maxLength={80} value={service}
            onChange={event => setService(event.target.value)} />
        </label>
        <label className="field">
          <span>Severity</span>
          <select name="severity" defaultValue="medium">
            {Object.entries(severityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <People employees={roster} name="owner" title="Incident lead" />
        <label className="field wide-field">
          <span>Impact and first steps</span><textarea name="description" maxLength={5000} required />
        </label>
        <input type="hidden" name="module_value" />
        <input type="hidden" name="visibility" value="private" />
        <input type="hidden" name="status" value="open" />
        <button className="primary-button" disabled={!!saving}>
          {saving === "incident" ? "Saving…" : "Log incident"}
        </button>
      </form>

      {!incidents.length && <p>No incidents logged yet.</p>}
      <ul className="td-code-items">
        {incidents.map(({ record, details }) => (
          <li key={record.id}>
            <div>
              <strong>{record.title}</strong>
              <small>{details.service} · {severityLabels[details.severity] || "Unspecified"} · {date(record.created_at)}</small>
              {details.owner && <small>Lead: {name(details.owner)}</small>}
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{record.description}</p>
              <RecordInteraction record={record} employees={employees} interactions={interactions}
                userId={userId} isManager onInteract={onInteract} />
            </div>
            <span className="td-code-kind" data-status={record.status}>{incidentStates[record.status] || record.status}</span>
            {record.status === "open" && (
              <button type="button" className="outline-button" disabled={!!changing}
                onClick={() => change(record, "in_progress")}>Investigate</button>
            )}
            {record.status === "in_progress" && (
              <button type="button" className="outline-button" disabled={!!changing}
                onClick={() => change(record, "done")}>Resolve</button>
            )}
          </li>
        ))}
      </ul>

      <h3>On call now</h3>
      {active.length ? shiftList(active) : <p>Nobody is scheduled on call right now.</p>}

      <h3>Upcoming shifts</h3>
      {upcoming.length ? shiftList(upcoming, true) : <p>No upcoming shifts scheduled.</p>}

      <form className="form-grid" onSubmit={event => save(event, "oncall")}>
        <label className="field wide-field">
          <span>Service or team</span><input name="service" maxLength={80} required />
        </label>
        <People employees={roster} name="primary" title="Primary on call" required />
        <People employees={roster} name="backup" title="Backup on call" />
        <label className="field"><span>Starts (SAST)</span><input name="start" type="datetime-local" required /></label>
        <label className="field"><span>Ends (SAST)</span><input name="end" type="datetime-local" required /></label>
        <label className="field wide-field"><span>Handoff notes</span><textarea name="description" maxLength={5000} /></label>
        <input type="hidden" name="title" />
        <input type="hidden" name="module_value" />
        <input type="hidden" name="visibility" value="private" />
        <input type="hidden" name="status" value="published" />
        <button className="primary-button" disabled={!!saving}>
          {saving === "oncall" ? "Saving…" : "Schedule shift"}
        </button>
      </form>

      {saveError && <p role="alert">{saveError}</p>}

      {!!legacy.length && (
        <details>
          <summary>Previous operations notes ({legacy.length})</summary>
          <ul className="td-code-items">
            {legacy.map(({ record }) => (
              <li key={record.id}><div><strong>{record.title}</strong><small>{record.description}</small></div></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}