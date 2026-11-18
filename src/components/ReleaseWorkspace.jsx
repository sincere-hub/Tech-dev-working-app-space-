import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Rocket } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import "./developer-catalog.css";
import ReleaseProjects from "./ReleaseProjects.jsx";

const flagKey = "testing_workspace";
const dateTime = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
});
const display = value => (value || "unknown").replaceAll("_", " ");
const date = value => Number.isFinite(Date.parse(value))
  ? dateTime.format(new Date(value))
  : "";

function useTestingFlag(refresh = 0) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    const abort = new AbortController();
    setState({ loading: true });

    async function load() {
      try {
        const { data, error } = await supabase.from("td_release_flags")
          .select("enabled,updated_at")
          .eq("key", flagKey)
          .abortSignal(abort.signal)
          .single();

        if (error || !data) throw new Error();
        if (!abort.signal.aborted) setState({ data });
      } catch {
        if (!abort.signal.aborted) {
          setState({ error: "Testing flag unavailable. Check release-flags.sql and your admin access." });
        }
      }
    }

    void load();
    return () => abort.abort();
  }, [refresh]);

  return [state, setState];
}

export function TestingFeatureGate({ children }) {
  const [flag] = useTestingFlag();
  if (!flag.loading && flag.data?.enabled !== false) return children;

  return (
    <section className="td-code-catalog">
      <h2>Testing</h2>
      {flag.loading
        ? <p role="status">Checking Testing availability…</p>
        : <p>Testing is paused. An admin can turn it back on under Deployment, rollback &amp; feature flags.</p>}
    </section>
  );
}

export default function ReleaseWorkspace({ records = [] }) {
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState({ loading: true });
  const [flag, setFlag] = useTestingFlag(refresh);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    setStatus({ loading: true });

    async function load() {
      try {
        const { data, error } = await supabase.functions.invoke("release-status", {
          body: {}, signal: abort.signal,
        });

        if (error) {
          const detail = await error.context?.json?.().catch(() => null);
          throw new Error(detail?.error || "Could not reach release-status. Check the Edge Function deployment.");
        }

        if (!abort.signal.aborted) setStatus({ data });
      } catch (error) {
        if (!abort.signal.aborted) setStatus({ error: error.message });
      }
    }

    void load();
    return () => abort.abort();
  }, [refresh]);

  async function toggleTesting() {
    const current = flag.data;
    if (!current || saving) return;
    const enabled = !current.enabled;

    setSaving(true);
    setSaveMessage("");

    try {
      const { data, error } = await supabase.from("td_release_flags")
        .update({ enabled })
        .eq("key", flagKey)
        .eq("updated_at", current.updated_at)
        .select("enabled,updated_at")
        .single();

      if (error || !data) throw new Error();
      setFlag({ data });
      setSaveMessage(enabled ? "Testing is enabled." : "Testing is paused. Saved runs are kept.");
    } catch {
      setSaveMessage("Flag update could not be confirmed. Refresh to check its current value.");
    } finally {
      setSaving(false);
    }
  }

  const data = status.data;
  const deploys = data?.deploys || [];
  const live = deploys.find(deploy => deploy.status === "live");
  const oldRecords = records.filter(record => record.module_id === "platform.deployments");

  return (
    <section className="td-code-catalog" aria-label="Deployment, rollback and feature flags">
      <header className="td-code-header">
        <div>
          <p className="td-code-kicker">
            <Rocket size={15} aria-hidden="true" /> RELEASE CONTROL
          </p>
          <h2>Deployment, rollback &amp; feature flags</h2>
          <p>Check what’s live, manage releases in Render, and control Testing without redeploying.</p>
        </div>
        <button
          className="outline-button"
          type="button"
          disabled={status.loading || flag.loading || saving}
          onClick={() => { setSaveMessage(""); setRefresh(n => n + 1); }}
        >
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>

      <ReleaseProjects refresh={refresh} />

  <details>
  <summary>Existing Render service connection</summary>
      {status.loading && <p role="status">Checking Render…</p>}
      {status.error && <p role="alert">{status.error}</p>}
      {data?.connected === false && <p>Render isn’t connected. Set the Render service ID and API key in Supabase.</p>}

      {data?.connected && <>
        <div className="td-code-facts">
          <div><span>Render service</span><strong>{data.service}</strong></div>
          <div>
            <span>Live commit</span>
            <strong>{live?.commit?.slice(0, 8) || (live ? "No Git commit reported" : "Not in recent history")}</strong>
          </div>
        </div>

        <a href={data.dashboardUrl} target="_blank" rel="noopener noreferrer">
          Deploy or roll back in Render <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <p>For a rollback, match the commit or deploy ID below and confirm the target in Render.</p>
        {!deploys.length && <p>No deployments reported for this service.</p>}

        <ul className="td-code-items">
          {deploys.map(item => (
            <li key={item.id}>
              <div>
                <strong>{item.message || item.commit?.slice(0, 8) || item.id}</strong>
                <small>{[item.commit?.slice(0, 8), date(item.createdAt), display(item.trigger)].filter(Boolean).join(" · ")}</small>
                <code>{item.id}</code>
              </div>
              <span className="td-code-kind">{display(item.status)}</span>
            </li>
          ))}
        </ul>
      </>}
</details>
      <h3>Feature flags</h3>
      <div className="td-code-facts">
        <div>
          <strong>Testing workspace</strong>
          <p>Pauses the Testing page for admins the next time they open it. Saved runs are kept.</p>
          {flag.loading && <p role="status">Loading flag…</p>}
          {flag.error && <p role="alert">{flag.error}</p>}
          {flag.data && <>
            <span>{flag.data.enabled ? "On" : "Off"} · Updated {date(flag.data.updated_at)}</span>
            <button className="outline-button" type="button" disabled={saving} onClick={toggleTesting}>
              {saving ? "Saving…" : flag.data.enabled ? "Pause Testing" : "Enable Testing"}
            </button>
          </>}
        </div>
      </div>
      {saveMessage && <p role="status">{saveMessage}</p>}

      {!!oldRecords.length && <details>
        <summary>Previous release notes ({oldRecords.length})</summary>
        <ul className="td-code-items">
          {oldRecords.map(record => (
            <li key={record.id}>
              <div><strong>{record.title}</strong><small>{record.description}</small></div>
            </li>
          ))}
        </ul>
      </details>}
    </section>
  );
}