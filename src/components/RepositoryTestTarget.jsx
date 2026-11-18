import { useEffect, useState } from "react";
import { ArrowUpRight, GitBranch } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const targetLabels = {
  web: "Web build files detected",
  native: "Native mobile build files detected",
  unknown: "No supported web build detected at the repository root",
  empty: "This repository has no revision to test yet",
};

export default function RepositoryTestTarget({ onTargetChange }) {
  const [repositories, setRepositories] = useState([]);
  const [selected, setSelected] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ pending: true });

  useEffect(() => {
    const controller = new AbortController();

    setResult({ pending: true });
    onTargetChange(null);

    async function inspect() {
      try {
        if (!supabase) throw new Error("Supabase is not configured.");

        const { data, error } = await supabase.functions.invoke("developer-catalog", {
          body: { view: "test-target", ...(selected ? { repo: selected } : {}) },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (error) {
          const detail = await error.context?.json?.().catch(() => null);
          throw new Error(detail?.error || "Could not load GitHub test repositories.");
        }

        setRepositories(Array.isArray(data?.repositories) ? data.repositories : []);

        if (data?.detailError) throw new Error(data.detailError);

        if (!data?.empty && !data?.target) {
          throw new Error("Deploy the repository testing update to the developer-catalog function.");
        }

        setResult({ data });

        if (data?.slug && data?.target?.commit) {
          onTargetChange({ ...data.target, slug: data.slug });
        }
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error.message });
      }
    }

    inspect();
    return () => controller.abort();
  }, [selected, refresh, onTargetChange]);

  const target = result.data?.target;
  const slug = selected || result.data?.slug || repositories[0]?.slug || "";

  return (
    <section aria-labelledby="td-test-target-title" className="td-code-facts">
      <div>
        <p className="td-code-kicker">
          <GitBranch size={15} aria-hidden="true" /> REPOSITORY
        </p>

        <h3 id="td-test-target-title">Choose an app to test</h3>
        <p>Inspect the selected repository’s default branch and see which build files are present.</p>

        {repositories.length > 0 && (
          <label className="td-code-repository">
            <span>Repository</span>
            <select value={slug} onChange={event => {
              onTargetChange(null);
              setSelected(event.target.value);
            }}>
              {repositories.map(repo => (
                <option key={repo.slug} value={repo.slug}>{repo.slug}</option>
              ))}
            </select>
          </label>
        )}

        {result.pending && <p role="status">Reading repository build files…</p>}
        {result.error && <p role="alert">{result.error}</p>}
        {result.data?.empty && <p>No GitHub repositories are connected yet.</p>}

        {target && (
          <>
            <strong>{targetLabels[target.kind] || targetLabels.unknown}</strong>
            {target.commit && (
              <p>{target.branch} · <code>{target.commit.slice(0, 12)}</code></p>
            )}
            {target.markers.length > 0 && <p>{target.markers.join(" · ")}</p>}
            {target.alsoNative && <p>This repository also has native mobile build files.</p>}
            {target.partial && <p>GitHub returned a partial file list.</p>}

            <a href={target.sourceUrl} target="_blank" rel="noreferrer">
              Open source on GitHub <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </>
        )}

        <p>Device sessions require a separate preview runner. Manual test runs are available below.</p>

        <button type="button" className="outline-button" disabled={result.pending}
          onClick={() => setRefresh(value => value + 1)}>
          Refresh repositories
        </button>
      </div>
    </section>
  );
}