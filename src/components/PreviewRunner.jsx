import { useEffect, useState } from "react";

const base = "http://127.0.0.1:4318";
const sizes = { mobile: [390, 844], desktop: [1280, 800] };

async function runner(path, body) {
  const options = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const response = await fetch(base + path, options).catch(() => {
    throw new Error("Start the local preview runner and reload this page.");
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Preview runner request failed.");
  return result;
}

export default function PreviewRunner({ selectedRepo, onCreate }) {
  const [targets, setTargets] = useState([]);
  const [choice, setChoice] = useState("");
  const [type, setType] = useState("mobile");
  const [name, setName] = useState("");
  const [width, setWidth] = useState(390);
  const [height, setHeight] = useState(844);
  const [run, setRun] = useState(null);
  const [report, setReport] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    runner("/targets").then(data => {
      if (alive) setTargets(data);
    }).catch(failure => {
      if (alive) setError(failure.message);
    });
    return () => { alive = false; };
  }, []);

  const repo = run?.repo || choice ||
    targets.find(row => row.repo === selectedRepo)?.repo || targets[0]?.repo || "";
  const commit = run?.commit || targets.find(row => row.repo === repo)?.commit;

  async function start(event) {
    event.preventDefault();
    if (busy || run || !repo) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setRun(await runner("/start", {
        repo,
        device: { type, name, width: Number(width), height: Number(height) },
      }));
      setNotice("Preview opened in Chromium. Come back here to stop and save.");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function stop() {
    if (busy || !run) return;
    setBusy(true);
    setError("");
    try {
      const data = report || await runner("/stop", { id: run.id });
      setReport(data);
      setNotice("Preview stopped.");
      const { device, events, total, problems, overflow } = data;

      const fields = {
        title: `Preview: ${data.repo} · ${device.name}`.slice(0, 180),
        status: problems || overflow > 0 ? "blocked" : "done",
        visibility: "private",
        module_value: `${data.repo} @ ${data.commit.slice(0, 8)} · ${device.name}`.slice(0, 180),
        description: [
          `Repository: ${data.repo}`,
          `Staging commit: ${data.commit}`,
          `Device: ${device.name} (${device.width} × ${device.height})`,
          `Duration: ${data.duration}s · ${total} events · ${problems} automatic warnings`,
          overflow === null
            ? "Horizontal overflow: not measured"
            : `Horizontal overflow at stop: ${overflow}px`,
          notes.trim() ? `Notes: ${notes.trim()}` : "",
          "",
          "Recent events:",
          ...events,
        ].join("\n").slice(0, 5000),
      };

      const form = document.createElement("form");
      for (const [key, value] of Object.entries(fields)) {
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = key;
        field.value = value;
        form.append(field);
      }

      if (!await onCreate({ currentTarget: form, preventDefault() {} })) {
        throw new Error("Could not save. The report is still here; use Retry save.");
      }

      setRun(null);
      setReport(null);
      setNotes("");
      setNotice(`Saved in Testing history. ${problems} automatic warnings.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Preview runner">
      <h3>Preview runner · Local</h3>
      <p>Open a registered staging site in Chromium and record a test run.</p>

      <form className="form-grid" onSubmit={start}>
        <fieldset
          className="form-grid wide-field"
          disabled={busy || !!run}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <label className="field wide-field">
            Staging repository
            <select value={repo} onChange={event => setChoice(event.target.value)} required>
              <option value="">No staging repositories configured</option>
              {targets.map(row => <option key={row.repo} value={row.repo}>{row.repo}</option>)}
            </select>
          </label>

          {commit && <small className="wide-field">Staging commit: {commit.slice(0, 8)}</small>}

          <label className="field">
            Device type
            <select value={type} onChange={event => {
              const value = event.target.value;
              setType(value);
              setWidth(sizes[value][0]);
              setHeight(sizes[value][1]);
            }}>
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>

          <label className="field">
            Device label
            <input
              value={name} placeholder="e.g. Mobicel" maxLength={60}
              onChange={event => setName(event.target.value)}
            />
          </label>

          <label className="field">
            Width (px)
            <input
              type="number" min={280} max={1600} value={width} required
              onChange={event => setWidth(event.target.value)}
            />
          </label>

          <label className="field">
            Height (px)
            <input
              type="number" min={400} max={1200} value={height} required
              onChange={event => setHeight(event.target.value)}
            />
          </label>
        </fieldset>

        {!run && (
          <button type="submit" className="primary-button" disabled={busy || !repo}>
            {busy ? "Opening…" : "Start preview"}
          </button>
        )}

        {run && <>
          <label className="field wide-field">
            Issues or improvements you noticed
            <textarea
              value={notes} maxLength={1500}
              onChange={event => setNotes(event.target.value)}
            />
          </label>
          <button type="button" className="primary-button" disabled={busy} onClick={stop}>
            {busy ? "Saving…" : report ? "Retry save" : "Stop & save"}
          </button>
        </>}
      </form>

      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}