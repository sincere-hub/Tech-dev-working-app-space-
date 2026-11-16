import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const messages = {
  awaiting_approval: "Awaiting admin approval.",
  not_started: "No preview exists yet.",
  building: "Render is preparing the preview…",
  ready: "Staging preview is live.",
  failed: "The build failed. Ask an admin to check the preview’s build log in Render.",
};

export default function StagingPreview({
  recordId, approved = false, pending = false, autoCheck = false, onRefresh,
}) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (action, quiet = false) => {
    if (!quiet) setBusy(true);
    setError("");

    try {
      const { data, error } = await supabase.functions.invoke("provision-staging-preview", {
        body: { action, recordId },
      });

      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || error.message);
      }

      setResult(data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      if (!quiet) setBusy(false);
      if (action === "approve") onRefresh?.();
    }
  }, [recordId, onRefresh]);

  useEffect(() => {
    if (autoCheck) run("status");
  }, [autoCheck, run]);

  useEffect(() => {
    if (busy || error || result?.phase !== "building") return;
    const timer = window.setTimeout(() => run("status", true), 10000);
    return () => window.clearTimeout(timer);
  }, [busy, error, result, run]);

  return (
    <div className="td-idp-form-footer" style={{ marginTop: 12, justifyContent: "flex-start" }}>
      {(approved || pending) && (!result || result.phase === "not_started") && (
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => run(pending ? "approve" : "provision")}
        >
          {pending ? "Approve and provision" : "Provision staging preview"}
        </button>
      )}

      <button
        type="button"
        className="outline-button"
        disabled={busy}
        onClick={() => run("status")}
      >
        Check preview status
      </button>

      {result?.url && (
        <a href={result.url} target="_blank" rel="noopener noreferrer">
          Open staging preview
        </a>
      )}

      <div role="status">{busy ? "Contacting Render…" : messages[result?.phase]}</div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}