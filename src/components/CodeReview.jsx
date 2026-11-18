import { useEffect, useState } from "react";
import { ArrowUpRight, GitPullRequest, Search } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import "./developer-catalog.css";

const DEFAULT_REPO = "sincere-hub/Tech-dev-working-app-space-";

async function invoke(body, signal) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("developer-catalog", {
    body,
    signal,
  });

  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || "Could not reach the GitHub connection.");
  }

  return data;
}

function GitHubLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  );
}

export default function CodeReview() {
  const [repo, setRepo] = useState("");
  const [review, setReview] = useState({ loading: true });
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const [search, setSearch] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    setReview({ loading: true });

    invoke({ view: "code-review", ...(repo ? { repo } : {}) }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data?.empty && !data?.detailError && !Array.isArray(data?.pulls)) {
          throw new Error("Deploy the Code Review update to the developer-catalog function.");
        }
        setReview({ data });
      })
      .catch(error => {
        if (!controller.signal.aborted) setReview({ error: error.message });
      });

    return () => controller.abort();
  }, [repo]);

  useEffect(() => {
    if (!submitted) return;
    const controller = new AbortController();
    setSearch({ loading: true });

    invoke({
      view: "code-search",
      query: submitted.query,
      ...(repo ? { repo } : {}),
    }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (data?.empty) throw new Error("No GitHub repositories are connected yet.");
        if (data?.detailError) throw new Error(data.detailError);
        if (!Array.isArray(data?.matches)) {
          throw new Error("Deploy the Code Review update to the developer-catalog function.");
        }
        setSearch({ data });
      })
      .catch(error => {
        if (!controller.signal.aborted) setSearch({ error: error.message });
      });

    return () => controller.abort();
  }, [repo, submitted]);

  const repositories = review.data?.repositories || [];
  const slug = repo || review.data?.slug || DEFAULT_REPO;
  const literal = query.trim().replace(/[\\"]/g, "\\$&");
  const githubSearchUrl = "https://github.com/search?" + new URLSearchParams({
    q: `repo:${slug}${literal ? ` content:"${literal}"` : ""}`,
    type: "code",
  });
  const pulls = review.data?.pulls;
  const matches = search.data?.matches;

  return (
    <section className="td-code-catalog" aria-labelledby="td-review-title">
      <header className="td-code-header">
        <div>
          <p className="td-code-kicker">
            <GitPullRequest size={15} aria-hidden="true" /> GITHUB
          </p>
          <h2 id="td-review-title">Code Review &amp; Code Search</h2>
          <p>Find open pull requests and search your repository’s source code.</p>
        </div>
        <GitHubLink href={`https://github.com/${slug}/pulls`}>
          Open pull requests on GitHub
        </GitHubLink>
      </header>

      {repositories.length > 1 ? (
        <label className="td-code-repository">
          <span>Repository</span>
          <select value={slug} onChange={event => {
            setSubmitted(null);
            setSearch({});
            setRepo(event.target.value);
          }}>
            {repositories.map(item => (
              <option key={item.slug} value={item.slug}>{item.slug}</option>
            ))}
          </select>
        </label>
      ) : <p>{slug}</p>}

      <h3>Open pull requests</h3>
      {review.loading && <p role="status">Loading pull requests…</p>}
      {(review.error || review.data?.detailError) && (
        <p role="alert">{review.error || review.data.detailError}</p>
      )}
      {review.data?.empty && <p>No GitHub repositories are connected yet.</p>}
      {pulls?.length === 0 && <p>No open pull requests.</p>}

      {!!pulls?.length && (
        <ul className="td-code-items">
          {pulls.map(pr => (
            <li key={pr.number}>
              <div>
                <strong>#{pr.number} {pr.title}</strong>
                <small>{[pr.author, pr.base ? `Target: ${pr.base}` : ""]
                  .filter(Boolean).join(" · ")}</small>
              </div>
              <span className="td-code-kind">{pr.draft ? "Draft" : "Open"}</span>
              <GitHubLink href={pr.url}>Review changes</GitHubLink>
            </li>
          ))}
        </ul>
      )}

      <h3>Search code</h3>
      <form className="td-code-tools" onSubmit={event => {
        event.preventDefault();
        if (query.trim().length >= 2 && !search.loading) {
          setSubmitted({ query: query.trim() });
        }
      }}>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-label="Search code"
          placeholder="Search for a function or text"
          maxLength={100}
          required
        />
        <button type="submit" className="outline-button"
          disabled={query.trim().length < 2 || search.loading}>
          <Search size={15} aria-hidden="true" /> Search
        </button>
        <GitHubLink href={githubSearchUrl}>Search on GitHub</GitHubLink>
      </form>

      {search.loading && <p role="status">Searching code…</p>}
      {search.error && <p role="alert">{search.error}</p>}
      {matches && (
        <p role="status">
          {matches.length
            ? `${matches.length} matching files${search.data.more ? " (partial results)" : ""}`
            : search.data.more
              ? "No matches in the results GitHub returned. Try a more specific search."
              : "No matching files on the default branch."}
        </p>
      )}

      {!!matches?.length && (
        <ul className="td-code-items">
          {matches.map(match => (
            <li key={match.url}>
              <div><code>{match.path}</code></div>
              <GitHubLink href={match.url}>Open file</GitHubLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}