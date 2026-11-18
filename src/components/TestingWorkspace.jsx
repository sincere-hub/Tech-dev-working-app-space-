import RepositoryTestTarget from "./RepositoryTestTarget.jsx";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import "./developer-catalog.css";
import PreviewRunner from "./PreviewRunner.jsx";
import ReleaseWorkspace, { TestingFeatureGate } from "./ReleaseWorkspace.jsx";

const checklists = {
  "Core workspace": [
    "Sign in and open the dashboard",
    "Open the menu and navigate back",
    "Open assigned tasks",
    "Open the clock-in page and verify your status",
    "Open company notices",
  ],
  "Developer tools": [
    "Open Internal Developer Platform and check repository results",
    "Open CI/CD and check recent workflow runs",
    "Open Build Systems and check build jobs",
    "Open Code Review and check pull requests",
    "Search for a known source file or code term",
  ],
};

const labels = {
  "not-run": "Not run",
  pass: "Pass",
  fail: "Fail",
  blocked: "Blocked",
};

const recordLabels = {
  done: "Completed",
  blocked: "Needs follow-up",
  in_progress: "In progress",
};

function summariseTestRun(checks, results) {
  const values = checks.map((_, index) => results[index] || "not-run");
  const passed = values.filter(result => result === "pass").length;
  const failed = values.filter(result => result === "fail").length;
  const blocked = values.filter(result => result === "blocked").length;
  const notRun = values.length - passed - failed - blocked;

  return {
    values,
    passed,
    failed,
    blocked,
    notRun,
    status: failed || blocked ? "blocked" : notRun ? "in_progress" : "done",
  };
}

export default function TestingWorkspace({ records, canCreate, onCreate }) {
  const [checklist, setChecklist] = useState("Core workspace");
  const [results, setResults] = useState({});
  const [environment, setEnvironment] = useState("");
  const [device, setDevice] = useState("");
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const checks = checklists[checklist];
  const summary = summariseTestRun(checks, results);
  const history = records.filter(record => record.module_id === "platform.testing");

  const description = [
    ...(target ? [
      "Repository: " + target.slug,
      "Branch: " + target.branch,
      "Commit: " + target.commit,
      "",
    ] : []),
    "Checklist: " + checklist,
    ...checks.map((check, index) => labels[summary.values[index]] + " — " + check),
    ...(notes.trim() ? ["", "Notes: " + notes.trim()] : []),
  ].join("\n");

  async function submit(event) {
    event.preventDefault();
    if (!canCreate || saving) return;

    const title = String(new FormData(event.currentTarget).get("title") || "").trim();

    if (!title) {
      setError("Enter a name for this test run.");
      return;
    }

    if (summary.notRun === checks.length) {
      setError("Mark at least one check as Pass, Fail or Blocked.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const saved = await onCreate(event);

      if (saved) {
        setResults({});
        setEnvironment("");
        setDevice("");
        setNotes("");
      } else {
        setError("Could not save the run. Your results are still here.");
      }
    } catch {
      setError("Could not save the run. Your results are still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="td-code-catalog" aria-labelledby="td-testing-title">
      <header className="td-code-header">
        <div>
          <p className="td-code-kicker">
            <FlaskConical size={15} aria-hidden="true" /> MANUAL TESTING
          </p>
          <h2 id="td-testing-title">Testing</h2>
          <p>Run through a checklist, record the results, and save notes for follow-up.</p>
        </div>
      </header>

      <RepositoryTestTarget onTargetChange={setTarget} />
 {canCreate && import.meta.env.DEV && (
        <PreviewRunner selectedRepo={target?.slug} onCreate={onCreate} />
      )}
      {canCreate && (
        <form className="form-grid" onSubmit={submit}>
          <label className="field wide-field">
            <span>Test run name</span>
            <input name="title" required maxLength={180}
              placeholder="e.g. Mobile sign-in before release" />
          </label>

          <label className="field">
            <span>Environment</span>
            <select required value={environment}
              onChange={event => setEnvironment(event.target.value)}>
              <option value="">Choose an environment</option>
              <option>Local</option>
              <option>Staging</option>
              <option>Production</option>
            </select>
          </label>

          <label className="field">
            <span>Device (optional)</span>
            <select value={device} onChange={event => setDevice(event.target.value)}>
              <option value="">Choose a device</option>
              <option>Desktop or laptop</option>
              <option>Android</option>
              <option>iPhone or iPad</option>
              <option>Other</option>
            </select>
          </label>

          <label className="field wide-field">
            <span>Checklist</span>
            <select value={checklist} onChange={event => {
              setChecklist(event.target.value);
              setResults({});
              setError("");
            }}>
              {Object.keys(checklists).map(name => <option key={name}>{name}</option>)}
            </select>
          </label>

          {checks.map((check, index) => (
            <label className="field wide-field" key={check}>
              <span>{check}</span>
              <select value={summary.values[index]} onChange={event => {
                const value = event.target.value;
                setResults(previous => ({ ...previous, [index]: value }));
              }}>
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          ))}

          <p className="wide-field" role="status">
            {summary.passed} passed · {summary.failed} failed ·{" "}
            {summary.blocked} blocked · {summary.notRun} not run
          </p>

          <label className="field wide-field">
            <span>Notes or steps to reproduce (optional)</span>
            <textarea value={notes} maxLength={2000}
              onChange={event => setNotes(event.target.value)}
              placeholder="What did you expect? What happened instead?" />
          </label>

          <input type="hidden" name="status" value={summary.status} />
          <input type="hidden" name="visibility" value="private" />
          <input type="hidden" name="description" value={description} />
          <input type="hidden" name="module_value"
            value={[environment, device].filter(Boolean).join(" · ")} />

          {error && <p className="wide-field" role="alert">{error}</p>}

          <button className="primary-button form-action" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save test run"}
          </button>
        </form>
      )}

      <h3>Saved test runs</h3>
      {!history.length && <p>No saved test runs yet.</p>}

      {!!history.length && (
        <ul className="td-code-items">
          {history.map(record => (
            <li key={record.id} id={`workplace-${record.id}`}>
              <div>
                <strong>{record.title}</strong>
                <small>{[
                  new Date(record.created_at).toLocaleDateString("en-ZA", {
                    timeZone: "Africa/Johannesburg",
                  }),
                  record.metadata?.field_value,
                ].filter(Boolean).join(" · ")}</small>

                {record.description && (
                  <details>
                    <summary>View results and notes</summary>
                    <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      {record.description}
                    </p>
                  </details>
                )}
              </div>

              <span className="td-code-kind">{recordLabels[record.status] || "Saved"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}