import { useEffect, useState } from "react";
import { ArrowUpRight, GitBranch, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import "./developer-catalog.css";

const activeStatuses = new Set([
  "queued", "in_progress", "pending", "requested", "waiting",
]);

const statusLabels = {
  success: "Passed",
  failure: "Failed",
  in_progress: "Running",
  queued: "Queued",
  timed_out: "Timed out",
  cancelled: "Cancelled",
  action_required: "Action required",
};

function resultOf(run) {
  return run.conclusion || run.status || "unknown";
}

export default function PipelineRuns() {
  const [repo, setRepo] = useState("");
  const [repositories, setRepositories] = useState([]);
  const [filter, setFilter] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });

    async function load() {
      try {
        if (!supabase) throw new Error("Supabase is not configured.");

        const { data, error } = await supabase.functions.invoke("developer-catalog", {
          body: { view: "pipelines", ...(repo ? { repo } : {}) },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (error) {
          const detail = await error.context?.json?.().catch(() => null);
          throw new Error(detail?.error || "Could not load GitHub Actions runs.");
        }

        setRepositories(Array.isArray(data?.repositories) ? data.repositories : []);

        if (data?.detailError) {
          throw new Error(data.detailError + " For private repos, check Actions: Read access.");
        }

        if (!data?.empty && !Array.isArray(data?.runs)) {
          throw new Error("Redeploy developer-catalog with the pipeline update.");
        }

        setState({ data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ error: error.message || "Could not load pipeline history." });
        }
      }
    }

    load();
    return () => controller.abort();
  }, [repo, refresh]);

  const { data, loading, error } = state;
  const runs = data?.runs || [];

  const visible = runs.filter(run => {
    const result = resultOf(run);
    if (filter === "active") return !run.conclusion && activeStatuses.has(run.status);
    if (filter === "failure") return ["failure", "timed_out"].includes(result);
    return filter === "all" || result === filter;
  });

  return (
    <section className="td-code-catalog" aria-label="CI/CD pipelines">
      <header className="td-code-header">
        <div>
          <p className="td-code-kicker">
            <GitBranch size={15} aria-hidden="true" /> GITHUB ACTIONS
          </p>
          <h2>CI/CD Pipelines</h2>
          <p>Check recent workflow runs and open the logs for any result.</p>
        </div>

        <button
          type="button"
          className="outline-button"
          disabled={loading}
          onClick={() => setRefresh(n => n + 1)}
        >
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>

      <div className="td-code-tools">
        {repositories.length > 1 ? (
          <label className="td-code-repository">
            <span>Repository</span>
            <select
              value={repo || data?.slug || repositories[0].slug}
              onChange={event => {
                setFilter("all");
                setRepo(event.target.value);
              }}
            >
              {repositories.map(item => (
                <option key={item.slug} value={item.slug}>{item.slug}</option>
              ))}
            </select>
          </label>
        ) : data?.slug ? (
          <strong>{data.slug}</strong>
        ) : null}

        <label className="td-code-repository">
          <span>Result</span>
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All results</option>
            <option value="success">Passed</option>
            <option value="failure">Failed or timed out</option>
            <option value="active">Queued or running</option>
          </select>
        </label>
      </div>

      {loading && <p role="status">Reading GitHub Actions runs…</p>}
      {error && <p role="alert">{error}</p>}
      {data?.empty && <p>No repositories are connected yet.</p>}

      {data && !data.empty && (
        <>
          <small>Showing {visible.length} of {runs.length} recent runs</small>
          <ul className="td-code-items">
            {visible.map(run => {
              const result = resultOf(run);

              return (
                <li key={run.id}>
                  <div>
                    <strong>{run.name}</strong>
                    <small>
                      {[run.branch, run.commit, run.event?.replaceAll("_", " ")]
                        .filter(Boolean).join(" · ")}
                    </small>
                    {run.createdAt && (
                      <small>
                        <time dateTime={run.createdAt}>
                          {new Date(run.createdAt).toLocaleString("en-ZA")}
                        </time>
                      </small>
                    )}
                  </div>

                  <span className="td-code-kind td-pipeline-status" data-result={result}>
                    {statusLabels[result] || result.replaceAll("_", " ")}
                  </span>

                  <a href={run.url} target="_blank" rel="noreferrer">
                    View logs
                    <span className="td-code-sr"> for {run.name}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>

          {!visible.length && (
            <p>{runs.length ? "No recent runs match this filter." : "No workflow runs yet."}</p>
          )}
        </>
      )}
    </section>
  );
}