import { useEffect, useState } from "react";
import { ArrowUpRight, GitBranch, RefreshCw, Wrench } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import "./build-systems.css";

const labels = {
  success: "Passed",
  failure: "Failed",
  in_progress: "Running",
  queued: "Queued",
  cancelled: "Cancelled",
  skipped: "Skipped",
  timed_out: "Timed out",
  waiting: "Waiting",
};

const active = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
const failed = new Set(["failure", "timed_out"]);
const dateFormat = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});

const label = status => labels[status] || String(status || "unknown").replaceAll("_", " ");

function duration(seconds) {
  if (seconds == null) return null;
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function time(value) {
  return value && Number.isFinite(Date.parse(value))
    ? dateFormat.format(new Date(value))
    : null;
}

function BuildJob({ job }) {
  const when = job.startedAt || job.createdAt;
  const formattedTime = time(when);
  const jobDuration = duration(job.seconds);

  return (
    <li className="td-build-job">
      <div className="td-build-job-head">
        <div>
          <h3>{job.name}</h3>
          <p>{[job.workflow, job.branch, job.commit].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="td-build-state" data-state={job.status}>
          {label(job.status)}
        </span>
      </div>

      <div className="td-build-job-meta">
        {formattedTime && <time dateTime={when}>{formattedTime} SAST</time>}
        {jobDuration && <span>Job: {jobDuration}</span>}
        <a href={job.url} target="_blank" rel="noreferrer" aria-label={`View logs for ${job.name}`}>
          View logs <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>

      {job.failedStep && <p className="td-build-failure">Failed step: {job.failedStep}</p>}

      {job.buildSteps.length > 0 && (
        <ul className="td-build-steps" aria-label="Build steps">
          {job.buildSteps.map((step, i) => (
            <li key={`${step.name}-${i}`}>
              <code>{step.name}</code>
              <span>{[label(step.status), duration(step.seconds)].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function BuildSystems() {
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
          body: { view: "build-systems", ...(repo ? { repo } : {}) },
          signal: controller.signal,
        });

        if (error) {
          const detail = await error.context?.json?.().catch(() => null);
          throw new Error(detail?.error || "Could not load build jobs.");
        }
        if (controller.signal.aborted) return;

        setRepositories(Array.isArray(data?.repositories) ? data.repositories : []);
        if (data?.detailError) throw new Error(data.detailError);
        if (!data?.empty && !Array.isArray(data?.builds)) {
          throw new Error("Deploy the Build Systems update to the developer-catalog function.");
        }

        setState({ data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ error: error.message || "Could not load build jobs." });
        }
      }
    }

    load();
    return () => controller.abort();
  }, [repo, refresh]);

  const { data, loading, error } = state;
  const builds = data?.builds || [];
  const visible = builds.filter(job => {
    if (filter === "active") return active.has(job.status);
    if (filter === "failed") return failed.has(job.status);
    return filter === "all" || filter === job.status;
  });

  return (
    <section className="td-build-systems" aria-labelledby="td-build-title">
      <header className="td-build-header">
        <div>
          <p className="td-build-source"><Wrench size={15} aria-hidden="true" /> GITHUB ACTIONS</p>
          <h2 id="td-build-title">Build Systems</h2>
          <p>Inspect individual build jobs and find the step that failed.</p>
        </div>

        <button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>

      <div className="td-build-controls">
        {repositories.length > 1 ? (
          <label>
            <span>Repository</span>
            <select value={repo || data?.slug || repositories[0].slug} onChange={event => {
              setFilter("all");
              setRepo(event.target.value);
            }}>
              {repositories.map(item => (
                <option key={item.slug} value={item.slug}>{item.slug}</option>
              ))}
            </select>
          </label>
        ) : data?.slug && (
          <p className="td-build-repo"><GitBranch size={15} aria-hidden="true" /> {data.slug}</p>
        )}

        {!data?.empty && (
          <label>
            <span>Job result</span>
            <select value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="all">All results</option>
              <option value="success">Passed</option>
              <option value="failed">Failed or timed out</option>
              <option value="active">Queued or running</option>
            </select>
          </label>
        )}
      </div>

      {loading && <p role="status">Reading recent GitHub build jobs…</p>}
      {error && <p role="alert" className="td-build-failure">{error}</p>}
      {data?.empty && <p>No repositories are connected yet.</p>}

      {data && !data.empty && (
        <>
          <p className="td-build-count" role="status">
            {visible.length} of {builds.length} build jobs · {data.checkedRuns} recent workflow runs checked
          </p>

          {data.partial && <p>Some job results could not be loaded. Refresh to try again.</p>}

          {visible.length > 0 ? (
            <ul className="td-build-jobs">
              {visible.map(job => <BuildJob key={job.id} job={job} />)}
            </ul>
          ) : (
            <p>{builds.length
              ? "No build jobs match this filter."
              : data.sampledRuns
                ? "No jobs with build-related names or steps were found in these runs."
                : "No workflow runs yet."}</p>
          )}
        </>
      )}
    </section>
  );
}