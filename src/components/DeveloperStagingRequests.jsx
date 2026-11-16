import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import StagingPreview from "./StagingPreview.jsx";

export default function DeveloperStagingRequests({ userId }) {
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!userId || !supabase) return;
    let stopped = false;
    let running = false;

    async function load() {
      if (stopped || running || document.hidden) return;
      running = true;

      try {
        const permission = await supabase.rpc("td_can_request_staging");
        if (stopped) return;

        if (permission.error || permission.data !== true) {
          setAllowed(false);
          setRows([]);
          return;
        }

        setAllowed(true);

        const { data, error } = await supabase.from("workplace_records")
          .select("id,title,status,created_at")
          .eq("module_id", "platform.internal-platform")
          .eq("created_by", userId)
          .contains("metadata", { internal_platform: { self_service: true } })
          .order("created_at", { ascending: false })
          .limit(20);

        if (stopped) return;
        if (error) setError(error.message);
        else setRows(data || []);
      } catch (failure) {
        if (!stopped) setError(failure.message);
      } finally {
        running = false;
      }
    }

    load();
    const timer = window.setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [userId, refresh]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");

    try {
      const { error } = await supabase.rpc("td_request_staging", {
        p_title: String(values.get("title") || ""),
        p_reason: String(values.get("reason") || ""),
      });

      if (error) throw error;
      form.reset();
      setRefresh(value => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return null;
  const newestApproved = rows.find(row => row.status === "approved")?.id;

  return (
  <>
    <DeveloperCatalog />
    <section className="card panel-card" aria-labelledby="my-previews-title">

      <form className="form-grid" onSubmit={submit}>
        <input type="hidden" name="title" value="Employee Workspace · staging preview" />

        <label className="field wide-field">
          <span>What do you need to test?</span>
          <textarea name="reason" required maxLength={2000} />
        </label>

        <button type="submit" className="primary-button form-action" disabled={busy}>
          {busy ? "Requesting…" : "Request staging preview"}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}

      <div className="suite-record-list">
        {rows.map(row => (
          <article key={row.id} className="suite-entry">
            <strong>{row.title}</strong>
            <p>
              {row.status === "pending_approval" ? "Awaiting approval"
                : row.status === "approved" ? "Approved"
                : row.status.replaceAll("_", " ")}
            </p>

            {row.status === "approved" && (
              <StagingPreview recordId={row.id} autoCheck={row.id === newestApproved} />
            )}
          </article>
        ))}

        {!rows.length && <p>You haven’t requested a staging preview yet.</p>}
      </div>
    </section>
    </>
  );
}