import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Clock3,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import EmployeeAvatar from "./EmployeeAvatar.jsx";
import RecordInteraction from "./RecordInteraction.jsx";
import { safeExternalUrl } from "../lib/reporting.js";
import WikiArticleTools from "./WikiArticleTools.jsx";

const topics = [
  "General",
  "Handbook",
  "Policies",
  "Procedures",
  "Guides",
  "Reference",
];

const statuses = [
  "open",
  "in_progress",
  "blocked",
  "pending_approval",
  "approved",
  "rejected",
  "done",
  "published",
  "archived",
];

const statusLabel = value =>
  String(value || "open").replaceAll("_", " ");

function topicOf(record) {
  const value = String(
    record.metadata?.field_value || ""
  ).trim();

  return value && !safeExternalUrl(value)
    ? value
    : "General";
}

function dateLabel(value) {
  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date unavailable";
}

export function articleBlocks(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .filter(block => block.trim())
    .map(block => {
      const lines = block.split("\n");

      if (
        lines.length === 1 &&
        /^#{1,3}\s+/.test(block)
      ) {
        return {
          type: "heading",
          text: block.replace(/^#{1,3}\s+/, ""),
        };
      }

      if (lines.every(line => /^[-*]\s+/.test(line))) {
        return {
          type: "list",
          items: lines.map(line =>
            line.replace(/^[-*]\s+/, "")
          ),
        };
      }

      return { type: "paragraph", text: block };
    });
}

export default function DocsWiki({
  module,
  records = [],
  employees = [],
  interactions = [],
  userId,
  isManager,
  onCreate,
  onStatus,
  onDelete,
  onInteract,
}) {
  const [savedArticles, setSavedArticles] = useState({});
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const [sort, setSort] = useState("recent");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locked = useRef(false);
  const reader = useRef(null);
  const editorTitle = useRef(null);
  const root = useRef(null);

  
  const documents = useMemo(
  () =>
    records
      .filter(
        record =>
          record.module_id === "collaboration.docs" &&
          record.metadata?.kind !== "document"
      )
      .map(record => {
        const saved = savedArticles[record.id];

        return saved &&
          Number(saved.wiki_revision) >=
            Number(record.wiki_revision || 1)
          ? saved
          : record;
      }),
  [records, savedArticles]
);

  const people = useMemo(
    () =>
      new Map(
        employees.map(person => [
          person.id,
          person.display_name,
        ])
      ),
    [employees]
  );

  const author = id => people.get(id) || "Employee";

  const categories = [
    ...new Set(documents.map(topicOf)),
  ].sort();

  const selected = documents.find(
    record => record.id === selectedId
  );

  const canCreate = Boolean(
    isManager || module.employeeCreate
  );

  const search = query.trim().toLowerCase();

  const visible = documents
    .filter(record =>
      (
        topic === "all" ||
        topicOf(record) === topic
      ) &&
      [
        record.title,
        record.description || "",
        topicOf(record),
        author(record.created_by),
      ].join(" ").toLowerCase().includes(search)
    )
    .sort((a, b) => {
      if (sort === "title") {
        return a.title.localeCompare(b.title);
      }

      const difference =
        new Date(a.updated_at || a.created_at) -
        new Date(b.updated_at || b.created_at);

      return (
        (sort === "oldest" ? 1 : -1) * difference ||
        a.id.localeCompare(b.id)
      );
    });

  useEffect(() => {
    if (selectedId) {
      reader.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      reader.current?.focus({ preventScroll: true });
    }
  }, [selectedId]);

  useEffect(() => {
    if (creating) editorTitle.current?.focus();
  }, [creating]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        const target = change.target;

        if (
          target.dataset.activityTarget === "true" &&
          target.dataset.documentId
        ) {
          setSelectedId(target.dataset.documentId);
        }
      }
    });

    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-activity-target"],
    });

    return () => observer.disconnect();
  }, []);

  async function publish(event) {
    event.preventDefault();

    if (locked.current) return;

    if (!navigator.onLine) {
      setError(
        "Connect to the internet before saving an article."
      );
      return;
    }

    const fields = new FormData(event.currentTarget);

    if (
      !String(fields.get("title") || "").trim() ||
      !String(fields.get("description") || "").trim()
    ) {
      setError("Add an article title and content.");
      return;
    }

    locked.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await onCreate(module, event);

      if (!result) {
        throw new Error(
          "The article could not be saved. Your writing is still here."
        );
      }

      setCreating(false);
      setQuery("");
      setTopic("all");
    } catch (failure) {
      setError(
        failure.message || "Could not save the article."
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function changeStatus(record, status) {
    if (locked.current) return;

    locked.current = true;
    setBusy(true);
    setError("");

    try {
      await onStatus(record, status);
    } catch {
      setError("Could not update the article status.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="legion-docs"
      ref={root}
      aria-label="Docs and wiki"
    >
      <header className="ld-hero">
        <span className="ld-hero-icon">
          <BookOpen size={27} />
        </span>

        <div>
          <span className="ld-eyebrow">
            COMPANY KNOWLEDGE
          </span>

          <h1>Docs & wiki</h1>

          <p>
            A home for the knowledge your team works with.
          </p>
        </div>

        {canCreate && (
          <button
            className="ld-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setCreating(true);
              setError("");
            }}
          >
            <Plus size={17} />
            New article
          </button>
        )}
      </header>

      <div className="ld-stats">
        <span>
          <strong>{documents.length}</strong>
          {" "}loaded articles
        </span>

        <span>
          <strong>
            {
              documents.filter(
                record => record.status === "published"
              ).length
            }
          </strong>
          {" "}published
        </span>

        <span>
          <strong>{categories.length}</strong>
          {" "}topics
        </span>
      </div>

      {creating && canCreate && (
        <section
          className="ld-editor"
          aria-label="Create article"
        >
          <header>
            <div>
              <span className="ld-eyebrow">
                CONTRIBUTE
              </span>
              <h2>Write an article</h2>
            </div>

            <button
              type="button"
              className="ld-icon"
              disabled={busy}
              aria-label="Close article editor"
              onClick={() => {
                if (
                  window.confirm(
                    "Close the editor and discard this unsaved article?"
                  )
                ) {
                  setCreating(false);
                  setError("");
                }
              }}
            >
              <X size={20} />
            </button>
          </header>

          <form onSubmit={publish}>
            <fieldset
              disabled={busy}
              className="ld-fields"
            >
              <label className="ld-wide">
                Article title
                <input
                  ref={editorTitle}
                  name="title"
                  required
                  maxLength={180}
                  placeholder="Give your article a clear title"
                />
              </label>

              <label>
                Topic
                <select
                  name="module_value"
                  defaultValue="General"
                >
                  {topics.map(value => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  name="status"
                  defaultValue="published"
                >
                  <option value="published">
                    Published
                  </option>
                  <option value="in_progress">
                    In progress
                  </option>
                </select>
              </label>

              <label className="ld-wide">
                Article content
                <textarea
                  name="description"
                  rows={10}
                  required
                  maxLength={5000}
                  placeholder={
                    "Write your article here…\n\n" +
                    "## Section heading\n\n" +
                    "- A useful point\n" +
                    "- Another point"
                  }
                />
                <small>
                  Use blank lines between paragraphs,
                  ## for headings, and - for list items.
                  Up to 5,000 characters.
                </small>
              </label>

              <label className="ld-wide">
                Supporting link · optional
                <input
                  type="url"
                  name="resource_url"
                  maxLength={2000}
                  placeholder="https://"
                />
              </label>

              <label>
                Who can read it?
                <select
                  name="visibility"
                  defaultValue="company"
                >
                  <option value="company">
                    Shared with the company
                  </option>
                  <option value="private">
                    Only me and managers
                  </option>
                </select>
              </label>

              <div className="ld-save">
                <button
                  type="submit"
                  className="ld-primary"
                >
                  {busy ? (
                    <LoaderCircle
                      className="spin"
                      size={16}
                    />
                  ) : (
                    <FileText size={16} />
                  )}

                  {busy ? "Saving…" : "Save article"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      {error && (
        <p className="ld-error" role="alert">
          {error}
        </p>
      )}

      {selected && (
        <article
          className="ld-reader"
          ref={reader}
          tabIndex={-1}
          aria-label={`Read ${selected.title}`}
        >
          <header className="ld-reader-toolbar">
            <button
              type="button"
              className="ld-secondary"
              onClick={() => setSelectedId("")}
            >
              <ArrowLeft size={16} />
              Close article
            </button>

            <span className="ld-tag">
              {topicOf(selected)}
            </span>
          </header>

          <div className="ld-paper">
            <span className="ld-eyebrow">
              KNOWLEDGE ARTICLE
            </span>

            <h2>{selected.title}</h2>

            <div className="ld-byline">
              <EmployeeAvatar
                employeeId={selected.created_by}
                name={author(selected.created_by)}
              />

              <span>
                {author(selected.created_by)}
                <small>
                  Updated{" "}
                  {dateLabel(
                    selected.updated_at ||
                    selected.created_at
                  )}
                </small>
              </span>

              <span className="ld-reading">
                <Clock3 size={14} />
                {Math.max(
                  1,
                  Math.ceil(
                    String(selected.description || "")
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean).length / 200
                  )
                )}
                {" "}min read
              </span>
            </div>

            <div className="ld-state">
              <span className="ld-tag">
                {statusLabel(selected.status)}
              </span>

              {selected.visibility === "private" && (
                <span>
                  <LockKeyhole size={14} />
                  Private · only author and managers
                </span>
              )}
            </div>

            <div className="ld-article-body">
              {articleBlocks(selected.description).map(
                (block, index) =>
                  block.type === "heading" ? (
                    <h3 key={index}>{block.text}</h3>
                  ) : block.type === "list" ? (
                    <ul key={index}>
                      {block.items.map(
                        (item, itemIndex) => (
                          <li key={itemIndex}>
                            {item}
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <p key={index}>{block.text}</p>
                  )
              )}

              {!selected.description && (
                <p>No article content has been added.</p>
              )}
            </div>

            {safeExternalUrl(
              selected.metadata?.resource_url ||
              selected.metadata?.field_value
            ) && (
              <a
                className="ld-resource"
                href={safeExternalUrl(
                  selected.metadata?.resource_url ||
                  selected.metadata?.field_value
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open supporting resource
                <ArrowUpRight size={16} />
              </a>
            )}
<WikiArticleTools
  key={`${userId}:${selected.id}`}
  record={selected}
  userId={userId}
  isManager={isManager}
  employees={employees}
  onSaved={saved =>
    setSavedArticles(previous => ({
      ...previous,
      [saved.id]: saved,
    }))
  }
/>
            <div className="ld-management">
              {(
                isManager ||
                selected.created_by === userId
              ) && onStatus && (
                <label>
                  Article status
                  <select
                    aria-label="Article status"
                    value={selected.status}
                    disabled={busy}
                    onChange={event =>
                      changeStatus(
                        selected,
                        event.target.value
                      )
                    }
                  >
                    {statuses.map(value => (
                      <option
                        value={value}
                        key={value}
                      >
                        {statusLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {isManager && onDelete && (
                <button
                  type="button"
                  className="ld-delete"
                  disabled={busy}
                  onClick={() => onDelete(selected)}
                >
                  <Trash2 size={15} />
                  Delete article
                </button>
              )}
            </div>

            {onInteract && (
              <RecordInteraction
                key={selected.id}
                record={selected}
                interactions={interactions}
                employees={employees}
                userId={userId}
                isManager={isManager}
                onInteract={onInteract}
              />
            )}
          </div>
        </article>
      )}

      <section
        className="ld-library"
        aria-label="Document library"
      >
        <div className="ld-library-heading">
          <div>
            <span className="ld-eyebrow">
              EXPLORE
            </span>
            <h2>Knowledge library</h2>
          </div>

          <small>
            {visible.length} matching{" "}
            {visible.length === 1 ? "article" : "articles"}
          </small>
        </div>

        <div className="ld-filters">
          <label className="ld-search">
            <Search size={18} />
            <input
              aria-label="Search loaded articles"
              placeholder="Search titles, content or authors…"
              value={query}
              onChange={event =>
                setQuery(event.target.value)
              }
            />
          </label>

          <select
            aria-label="Filter articles by topic"
            value={topic}
            onChange={event => setTopic(event.target.value)}
          >
            <option value="all">All topics</option>
            {categories.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>

          <select
            aria-label="Sort articles"
            value={sort}
            onChange={event => setSort(event.target.value)}
          >
            <option value="recent">
              Recently updated
            </option>
            <option value="oldest">
              Oldest updated
            </option>
            <option value="title">
              Title A–Z
            </option>
          </select>
        </div>

        <div className="ld-grid">
          {visible.map(record => (
            <article
              className="ld-card"
              key={record.id}
              id={`workplace-${record.id}`}
              data-document-id={record.id}
            >
              <div className="ld-card-top">
                <span className="ld-tag">
                  {topicOf(record)}
                </span>

                {record.visibility === "private" && (
                  <LockKeyhole
                    size={15}
                    aria-label="Private article"
                  />
                )}
              </div>

              <FileText
                className="ld-document-icon"
                size={26}
              />

              <h3>
                <button
                  type="button"
                  onClick={() => setSelectedId(record.id)}
                >
                  {record.title}
                </button>
              </h3>

              <p>
                {String(
                  record.description ||
                  "Open this article to read more."
                )
                  .replace(/^#{1,3}\s+/gm, "")
                  .slice(0, 150)}

                {record.description?.length > 150
                  ? "…"
                  : ""}
              </p>

              <div className="ld-card-bottom">
                <span>{author(record.created_by)}</span>
                <small>
                  {dateLabel(
                    record.updated_at ||
                    record.created_at
                  )}
                </small>
              </div>

              <footer>
                <span className="ld-status">
                  {statusLabel(record.status)}
                </span>

                <button
                  type="button"
                  className="ld-open"
                  aria-label={`Read ${record.title}`}
                  onClick={() => setSelectedId(record.id)}
                >
                  Read article
                  <ArrowUpRight size={15} />
                </button>
              </footer>
            </article>
          ))}
        </div>

        {!visible.length && (
          <div className="ld-empty">
            <BookOpen size={35} />

            <h3>
              {documents.length
                ? "No articles match"
                : "Build your company knowledge"}
            </h3>

            <p>
              {documents.length
                ? "Try another search or choose a different topic."
                : "Add the first handbook, procedure or reference article."}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}