import { useEffect, useState } from "react";
import { ArrowUpRight, GitBranch, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import "./developer-catalog.css";

function Source({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  );
}

export default function DeveloperCatalog() {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState({ loading: true });
  const [query, setQuery] = useState("");
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });

    async function load() {
      try {
        if (!supabase) throw new Error("Supabase is not configured.");

        const { data, error } = await supabase.functions.invoke("developer-catalog", {
          method: "POST",
          signal: controller.signal,
          ...(selectedRepo ? { body: { repo: selectedRepo } } : {}),
        });

        if (error) {
          const detail = await error.context?.json?.().catch(() => null);
          throw new Error(detail?.error || "Could not load the GitHub catalog.");
        }

        if (!Array.isArray(data?.items)) {
          throw new Error("Unexpected catalog response.");
        }

        if (!controller.signal.aborted) {
          setRepositories(data.repositories || []);
          setState({ data });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ error: error.message || "Could not load the catalog." });
        }
      }
    }

    load();
    return () => controller.abort();
  }, [attempt, selectedRepo]);

  const { data, loading, error } = state;
  const term = query.trim().toLowerCase();
  const visible = data?.items.filter(item =>
    [item.name, item.kind, item.path].join(" ").toLowerCase().includes(term)
  ) || [];

  return (
    <section className="td-code-catalog" aria-label="Software catalog">
      <header className="td-code-header">
        <div>
          <p className="td-code-kicker">
            <GitBranch size={15} aria-hidden="true" /> GITHUB · SOFTWARE CATALOG
          </p>
          <h2>Code inventory</h2>
          <p>Find the workspace’s source, database changes and build checks.</p>
        </div>

        <button
          type="button"
          className="outline-button"
          disabled={loading}
          onClick={() => {
            setSelectedRepo("");
            setQuery("");
            retry(n => n + 1);
          }}
        >
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>

      {repositories.length > 1 && (
        <label className="td-code-repository">
          <span>Repository</span>
          <select
            name="catalogRepository"
            value={selectedRepo || data?.slug || repositories[0].slug}
            onChange={event => {
              setQuery("");
              setSelectedRepo(event.target.value);
            }}
          >
            {repositories.map(repo => (
              <option key={repo.slug} value={repo.slug}>
                {repo.slug}{repo.private ? " · Private" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && <p role="status">Reading the GitHub repository…</p>}
      {error && <p role="alert">{error}</p>}
      {data?.detailError && <p role="alert">{data.detailError}</p>}
      {data?.empty && (
        <p role="status">No repositories are connected to the TechDev GitHub App.</p>
      )}

      {data && !data.empty && !data.detailError && (
        <>
          <div className="td-code-facts">
            <div>
              <span>Repository · {data.branch || "No default branch"}</span>
              <Source href={data.repoUrl}>{data.slug}</Source>
            </div>

            <div>
              <span>{data.ci?.name || "Latest push workflow"}</span>
              <strong data-ci={data.ci?.status}>
                {data.ci?.status?.replaceAll("_", " ") || "CI workflow not found"}
              </strong>
              {data.ci?.url && (
                <Source href={data.ci.url}>View run {data.ci.commit}</Source>
              )}
            </div>

            <div>
              <span>Default code reviewers</span>
              {!!data.reviewers?.length && <strong>{data.reviewers.join(", ")}</strong>}
              {data.codeowners
                ? <Source href={data.codeowners}>CODEOWNERS rules</Source>
                : <strong>No CODEOWNERS file</strong>}
            </div>
          </div>

          <div className="td-code-tools">
            <input
              type="search"
              name="catalogSearch"
              placeholder="Search source files or types"
              aria-label="Search code inventory"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <small>
              {visible.length} of {data.items.length} files · Checked{" "}
              {new Date(data.checkedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </div>

          <ul className="td-code-items">
            {visible.map(item => (
              <li key={item.path}>
                <div>
                  <strong>{item.name}</strong>
                  <code>{item.path}</code>
                </div>
                <span className="td-code-kind">{item.kind}</span>
                <Source href={item.url}>
                  View source<span className="td-code-sr"> for {item.name}</span>
                </Source>
              </li>
            ))}
          </ul>

          {!visible.length && (
            <p>{term ? "No files match that search." : "No supported source files found on this branch."}</p>
          )}
        </>
      )}
    </section>
  );
}