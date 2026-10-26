import { useEffect, useRef, useState } from "react";
import {
  History,
  LoaderCircle,
  Pencil,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";
import "./wiki-article-tools.css";

function fieldsFrom(record) {
  return {
    title: record.title || "",
    body: record.description || "",
    topic: record.metadata?.field_value || "General",
    link: record.metadata?.resource_url || "",
  };
}

function dateLabel(value) {
  return new Date(value).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function WikiArticleTools({
  record,
  userId,
  isManager,
  employees = [],
  onSaved,
}) {
  const [mode, setMode] = useState("");
  const [latest, setLatest] = useState(record);
  const [draft, setDraft] = useState(() => fieldsFrom(record));
  const [versions, setVersions] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  const dialog = useRef(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const controller = useRef(null);

  const allowed = Boolean(
    isManager || record.created_by === userId
  );

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (
      mode &&
      dialog.current &&
      !dialog.current.open
    ) {
      dialog.current.showModal();
    }
  }, [mode]);

  async function checkAccount() {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (
      !alive.current ||
      data.session?.user.id !== userId
    ) {
      throw new Error(
        "Your account changed. Reopen the wiki after signing in."
      );
    }
  }

  async function request(query) {
    await checkAccount();

    const aborter = new AbortController();
    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      15000
    );

    try {
      const { data, error } = await query.abortSignal(
        aborter.signal
      );

      if (error) throw error;

      await checkAccount();

      return data;
    } finally {
      clearTimeout(timer);

      if (controller.current === aborter) {
        controller.current = null;
      }
    }
  }

  async function run(action) {
    if (lock.current || !allowed) return;

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to edit articles or load history."
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "The request failed. Please try again."
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) setBusy(false);
    }
  }

  async function historyPage(before) {
    let query = supabase
      .from("td_wiki_versions")
      .select(
        "revision,snapshot,saved_by,saved_at,source"
      )
      .eq("article_id", record.id)
      .order("revision", { ascending: false })
      .limit(21);

    if (before) {
      query = query.lt("revision", before);
    }

    const rows = await request(query);
    const page = rows.slice(0, 20);

    setMore(rows.length > 20);

    setVersions(previous =>
      before ? [...previous, ...page] : page
    );

    if (!before) setChosen(page[0] || null);
  }

  function open(nextMode) {
    return run(async () => {
      const current = await request(
        supabase
          .from("workplace_records")
          .select("*")
          .eq("id", record.id)
          .eq("module_id", "collaboration.docs")
          .single()
      );

      if (current.metadata?.kind === "document") {
        throw new Error(
          "This item is a file, not a wiki article."
        );
      }

      if (nextMode === "history") {
        await historyPage();
      }

      setLatest(current);
      setDraft(fieldsFrom(current));
      setDirty(false);
      onSaved(current);
      setMode(nextMode);
    });
  }

  function close() {
    if (lock.current) return;

    if (
      mode === "edit" &&
      dirty &&
      !window.confirm(
        "Discard your unsaved article changes?"
      )
    ) {
      return;
    }

    dialog.current?.close();
    setMode("");
    setError("");
  }

  function change(key, value) {
    setDraft(previous => ({
      ...previous,
      [key]: value,
    }));

    setDirty(true);
  }

  function save(event) {
    event.preventDefault();

    return run(async () => {
      const data = await request(
        supabase.rpc("td_wiki_save", {
          p_article_id: record.id,
          p_expected_revision: latest.wiki_revision,
          p_title: draft.title,
          p_body: draft.body,
          p_topic: draft.topic,
          p_resource_url: draft.link,
        })
      );

      const saved = Array.isArray(data) ? data[0] : data;

      if (!saved?.id) {
        throw new Error(
          "Could not confirm the save. Reopen the article before retrying."
        );
      }

      onSaved(saved);
      setLatest(saved);
      setDirty(false);
      dialog.current?.close();
      setMode("");

      setNotice(
        `Article saved · version ${saved.wiki_revision}`
      );
    });
  }

  if (!allowed) return null;

  return (
    <section
      className="td-wiki-tools"
      aria-label="Article editing"
    >
      <div className="td-wiki-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => open("edit")}
        >
          <Pencil size={16} />
          Edit article
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => open("history")}
        >
          <History size={16} />
          Version history
        </button>

        {busy && (
          <span role="status">
            <LoaderCircle size={16} className="spin" />
            Working…
          </span>
        )}
      </div>

      {!mode && error && (
        <p className="td-wiki-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="td-wiki-notice" role="status">
          {notice}
        </p>
      )}

      {mode && (
        <dialog
          ref={dialog}
          className="td-wiki-dialog"
          aria-label={
            mode === "edit"
              ? "Edit article"
              : "Article version history"
          }
          onCancel={event => {
            event.preventDefault();
            close();
          }}
        >
          <header>
            <div>
              <small>COMPANY WIKI</small>
              <h2>
                {mode === "edit"
                  ? "Edit article"
                  : "Version history"}
              </h2>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={close}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </header>

          {error && (
            <p className="td-wiki-error" role="alert">
              {error}
            </p>
          )}

          {mode === "edit" ? (
            <form onSubmit={save}>
              <p className="td-wiki-help">
                Editing version {latest.wiki_revision}.
                Saving keeps previous versions and preserves
                the current access and publication status.
              </p>

              <fieldset disabled={busy}>
                <label>
                  Article title
                  <input
                    required
                    maxLength={180}
                    value={draft.title}
                    onChange={event =>
                      change("title", event.target.value)
                    }
                  />
                </label>

                <label>
                  Topic
                  <input
                    required
                    maxLength={100}
                    value={draft.topic}
                    onChange={event =>
                      change("topic", event.target.value)
                    }
                  />
                </label>

                <label>
                  Article content
                  <textarea
                    required
                    rows={12}
                    maxLength={5000}
                    value={draft.body}
                    onChange={event =>
                      change("body", event.target.value)
                    }
                  />
                </label>

                <small>
                  {draft.body.length.toLocaleString()} / 5,000
                  characters · use ## for headings and -
                  for list items.
                </small>

                <label>
                  Supporting link · optional
                  <input
                    type="url"
                    maxLength={2000}
                    value={draft.link}
                    onChange={event =>
                      change("link", event.target.value)
                    }
                    placeholder="https://"
                  />
                </label>
              </fieldset>

              <footer>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Replace your unsaved writing with the latest saved article?"
                      )
                    ) {
                      open("edit");
                    }
                  }}
                >
                  Load latest
                </button>

                <button
                  type="submit"
                  className="td-wiki-save"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </footer>
            </form>
          ) : (
            <>
              <p className="td-wiki-help">
                Only the author and managers/admins can
                see history. Select a version to inspect
                its content.
              </p>

              <div className="td-wiki-history">
                <div
                  className="td-wiki-version-list"
                  role="group"
                  aria-label="Saved versions"
                >
                  {versions.map(version => (
                    <button
                      key={version.revision}
                      type="button"
                      disabled={busy}
                      aria-pressed={
                        chosen?.revision === version.revision
                      }
                      onClick={() => setChosen(version)}
                    >
                      <strong>
                        Version {version.revision}
                      </strong>

                      <span>
                        {dateLabel(version.saved_at)}
                      </span>

                      <small>
                        {version.source === "baseline"
                          ? "Existing article when history began"
                          : employees.find(
                              person =>
                                person.id === version.saved_by
                            )?.display_name ||
                            "Workspace editor"}
                      </small>
                    </button>
                  ))}

                  {more && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          historyPage(
                            versions.at(-1)?.revision
                          )
                        )
                      }
                    >
                      Load older versions
                    </button>
                  )}

                  {!versions.length && (
                    <p>No saved versions found.</p>
                  )}
                </div>

                {chosen && (
                  <article className="td-wiki-version-preview">
                    <small>
                      VERSION {chosen.revision} · SAVED CONTENT
                    </small>

                    <h3>{chosen.snapshot.title}</h3>

                    <p className="td-wiki-version-body">
                      {chosen.snapshot.description}
                    </p>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setDraft(fieldsFrom(chosen.snapshot));
                        setDirty(true);
                        setError("");
                        setMode("edit");
                      }}
                    >
                      Use this content in editor
                    </button>

                    <p className="td-wiki-help">
                      Review the content before saving.
                      This creates a new version when changed;
                      it does not restore old access permissions.
                    </p>
                  </article>
                )}
              </div>
            </>
          )}
        </dialog>
      )}
    </section>
  );
}