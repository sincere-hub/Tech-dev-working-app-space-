import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const when = value => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })
  : "";

function History({ deploys, error }) {
  if (error) return <p role="alert">{error}</p>;
  if (!deploys.length) return <p>No deployments reported by this source.</p>;

  return (
    <ul className="td-code-items">
      {deploys.map(item => (
        <li key={item.id}>
          <div>
            <strong>{item.label || item.commit?.slice(0, 8) || "Deployment"}</strong>
            <small>{[item.commit?.slice(0, 8), when(item.at)].filter(Boolean).join(" · ")}</small>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer">Open deployment</a>
            )}
          </div>
          <span className="td-code-kind">{(item.state || "Unknown").replaceAll("_", " ")}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ReleaseProjects({ refresh }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    const abort = new AbortController();
    setState({ loading: true });

    async function load() {
      try {
        const { data, error } = await supabase.functions.invoke("release-projects", {
          body: { page }, signal: abort.signal,
        });
        if (error) {
          const body = await error.context?.json?.().catch(() => null);
          throw new Error(body?.error || "Could not reach the release-projects Edge Function.");
        }
        if (!abort.signal.aborted) setState({ data });
      } catch (error) {
        if (!abort.signal.aborted) setState({ error: error.message });
      }
    }

    void load();
    return () => abort.abort();
  }, [page, refresh]);

  const { data, error, loading } = state;

  return (
    <div className="td-code-catalog">
      <h3>Project deployments</h3>
      <p>Repositories from sincere-hub, grouped by project and deployment source.</p>
      {loading && <p role="status">Loading projects and deployments…</p>}
      {error && <p role="alert">{error}</p>}
      {data?.notes?.map(note => <small key={note}>{note}</small>)}
      {data && !data.total && <p>No repositories from sincere-hub are available to this GitHub App installation.</p>}

      {data?.projects.map(project => (
        <article className="td-code-catalog" key={project.slug}>
          <header>
            <h3>{project.name}</h3>
            <a href={`https://github.com/${project.slug}`} target="_blank" rel="noopener noreferrer">
              {project.slug}
            </a>
          </header>

          {project.hosts.map(host => (
            <section key={`${host.provider}:${host.id}`}>
              <h4>{host.name || project.name} · {host.provider}</h4>
              {host.dashboard && (
                <a href={host.dashboard} target="_blank" rel="noopener noreferrer">
                  Manage in {host.provider}
                </a>
              )}
              <History deploys={host.deploys} error={host.error} />
            </section>
          ))}

          <details open={!project.hosts.length}>
            <summary>Reported to GitHub</summary>
            <History deploys={project.github.deploys} error={project.github.error} />
          </details>
        </article>
      ))}

      {data?.totalPages > 1 && (
        <nav className="td-code-tools" aria-label="Project pages">
          <button className="outline-button" type="button" disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}>Previous</button>
          <span>Page {data.page} of {data.totalPages} · {data.total} repositories</span>
          <button className="outline-button" type="button" disabled={data.page >= data.totalPages}
            onClick={() => setPage(data.page + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}