import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Download,
  Eye,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";
import DocumentVersionTools from "./DocumentVersionTools.jsx";

const documentTypes = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const topics = [
  "General",
  "Handbook",
  "Policies",
  "Procedures",
  "Guides",
  "Reference",
];

function validateDocument(file) {
  const extension = String(file?.name || "")
    .split(".")
    .pop()
    .toLowerCase();

  if (!documentTypes[extension]) {
    throw new Error(
      "Choose a PDF, DOCX, XLSX, PPTX, TXT, CSV, JPG, PNG or WEBP file."
    );
  }

  if (!file.size || file.size > 10485760) {
    throw new Error(
      "Choose a non-empty file no larger than 10 MB."
    );
  }

  if (
    file.name.length > 200 ||
    /[/\\\x00-\x1f\x7f]/.test(file.name)
  ) {
    throw new Error(
      "Use a shorter filename without special path characters."
    );
  }

  return extension;
}

function sizeLabel(bytes) {
  const size = Number(bytes || 0);

  return size < 1048576
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1048576).toFixed(2)} MB`;
}

export default function DocumentLibrary({
  userId,
  isManager,
  employees = [],
  records = [],
}) {
  const [files, setFiles] = useState(() =>
    records
      .filter(
        record =>
          record.module_id === "collaboration.docs" &&
          record.metadata?.kind === "document"
      )
      .sort(
        (a, b) =>
          new Date(b.created_at) - new Date(a.created_at) ||
          b.id.localeCompare(a.id)
      )
      .slice(0, 100)
  );

  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resume, setResume] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");

  const lock = useRef(false);
  const pending = useRef(null);
  const version = useRef(0);
  const mounted = useRef(true);
  const urls = useRef(new Set());
  const dialog = useRef(null);

  const bucket = supabase.storage.from("legion-documents");

  const revision = records
    .filter(
      record =>
        record.module_id === "collaboration.docs" &&
        record.metadata?.kind === "document"
    )
    .map(
      record =>
        `${record.id}:${record.updated_at}:${record.metadata.file_state}`
    )
    .join("|");

  const author = id =>
    employees.find(person => person.id === id)?.display_name ||
    "Employee";

  const search = query.trim().toLowerCase();

  const matches = files
  .filter(file =>
    (
      showArchived
        ? file.status === "archived"
        : file.status !== "archived"
    ) &&
    (
      topicFilter === "all" ||
      String(file.metadata.field_value || "General") ===
        topicFilter
    ) &&
    [
      file.title,
      file.description,
      file.metadata.file_name,
      file.metadata.field_value,
      author(file.created_by),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search)
  )
  .sort((a, b) => {
    if (sortOrder === "title") {
      return a.title.localeCompare(b.title);
    }

    return (
      (sortOrder === "oldest" ? 1 : -1) *
        (new Date(a.created_at) - new Date(b.created_at)) ||
      a.id.localeCompare(b.id)
    );
  });

  async function currentUser() {
    const { data, error } = await supabase.auth.getSession();

    if (
      error ||
      data.session?.user.id !== userId ||
      !mounted.current
    ) {
      throw new Error(
        "Your account changed. Sign in again before continuing."
      );
    }
  }

  const refresh = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);

    try {
      await currentUser();

      const { data, error } = await supabase
        .from("workplace_records")
        .select("*")
        .eq("module_id", "collaboration.docs")
        .eq("metadata->>kind", "document")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(0, 99);

      if (error) throw error;

      await currentUser();

      if (
        mounted.current &&
        request === version.current
      ) {
        setFiles(data || []);
        setHasMore(data?.length === 100);
        setLoadError("");
      }
    } catch (failure) {
      if (
        mounted.current &&
        request === version.current
      ) {
        setLoadError(
          failure.message || "Could not load documents."
        );
      }
    } finally {
      if (
        mounted.current &&
        request === version.current
      ) {
        setLoading(false);
      }
    }
  }, [userId]);

  async function loadMore() {
    if (loading || !hasMore || !files.length) return;

    const request = ++version.current;
    const cursor = files.at(-1);

    setLoading(true);

    try {
      await currentUser();

      const { data, error } = await supabase
        .from("workplace_records")
        .select("*")
        .eq("module_id", "collaboration.docs")
        .eq("metadata->>kind", "document")
        .or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(0, 99);

      if (error) throw error;

      await currentUser();

      if (
        mounted.current &&
        request === version.current
      ) {
        setFiles(previous => [
          ...new Map(
            [...previous, ...(data || [])].map(file => [
              file.id,
              file,
            ])
          ).values(),
        ]);

        setHasMore(data?.length === 100);
        setLoadError("");
      }
    } catch (failure) {
      if (
        mounted.current &&
        request === version.current
      ) {
        setLoadError(
          failure.message || "Could not load more documents."
        );
      }
    } finally {
      if (
        mounted.current &&
        request === version.current
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      version.current++;

      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current.clear();
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, revision]);

  useEffect(() => {
    if (
      preview &&
      dialog.current &&
      !dialog.current.open
    ) {
      dialog.current.showModal();
    }
  }, [preview]);

  async function operate(action) {
    if (lock.current) return;

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to use documents."
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await currentUser();
      await action();
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure.message ||
          "The document request failed. Try again."
        );
      }
    } finally {
      lock.current = false;

      if (mounted.current) setBusy(false);
    }
  }

  async function find(id) {
    const { data, error } = await supabase
      .from("workplace_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    return data;
  }

  function startUpload(record = null) {
    if (busy) return;

    setResume(record);
    pending.current = null;
    setUploading(true);
    setError("");
    setMessage("");
  }

  async function upload(event) {
    event.preventDefault();

    const fields = new FormData(event.currentTarget);

    await operate(async () => {
      const file = fields.get("file");
      const extension = validateDocument(file);
      const title = String(fields.get("title") || "").trim();

      if (!title) {
        throw new Error("Add a document title.");
      }

      if (
        resume &&
        (
          resume.metadata.file_name !== file.name ||
          Number(resume.metadata.file_size) !== file.size
        )
      ) {
        throw new Error(
          "To retry, select the original file with the same name and size."
        );
      }

      const fileKey =
        `${file.name}:${file.size}:${file.lastModified}`;

      let record = resume;

      if (!record) {
        if (
          !pending.current ||
          pending.current.fileKey !== fileKey
        ) {
          const id = crypto.randomUUID();

          pending.current = {
            fileKey,
            record: {
              id,
              module_id: "collaboration.docs",
              title,
              description: String(
                fields.get("description") || ""
              ).trim(),
              status: "open",
              visibility: "private",
              created_by: userId,
              metadata: {
                kind: "document",
                storage_path:
                  `${userId}/${id}.${extension}`,
                file_name: file.name,
                file_size: file.size,
                file_state: "pending",
                field_value: String(
                  fields.get("topic") || "General"
                ),
              },
            },
          };
        }

        record = pending.current.record;

        const inserted = await supabase
          .from("workplace_records")
          .insert(record)
          .select()
          .single();

        if (inserted.error) {
          const existing = await find(record.id);

          if (
            !existing ||
            existing.created_by !== userId ||
            existing.metadata?.storage_path !==
              record.metadata.storage_path
          ) {
            throw inserted.error;
          }

          record = existing;
        } else {
          record = inserted.data;
        }
      } else {
        record = await find(record.id);
      }

      if (
        !record ||
        record.metadata.file_state === "deleting"
      ) {
        throw new Error(
          "This upload was removed. Refresh the library."
        );
      }

      if (record.metadata.file_state !== "ready") {
        const uploaded = await bucket.upload(
          record.metadata.storage_path,
          file,
          {
            contentType: documentTypes[extension],
            cacheControl: "0",
            upsert: false,
          }
        );

        if (
          uploaded.error &&
          String(uploaded.error.statusCode) !== "409" &&
          !/already exists|duplicate/i.test(
            uploaded.error.message
          )
        ) {
          throw uploaded.error;
        }
      }

      await currentUser();

      const desired = {
        title,
        description: String(
          fields.get("description") || ""
        ).trim(),
        status: "published",
        visibility: String(
          fields.get("visibility") || "private"
        ),
        metadata: {
          ...record.metadata,
          file_state: "ready",
          field_value: String(
            fields.get("topic") || "General"
          ),
        },
      };

      const saved = await supabase
        .from("workplace_records")
        .update(desired)
        .eq("id", record.id)
        .eq("created_by", userId)
        .eq(
          "metadata->>file_state",
          record.metadata.file_state
        )
        .select()
        .single();

      if (saved.error) {
        const confirmed = await find(record.id);

        if (
          confirmed?.metadata?.file_state !== "ready" ||
          confirmed.title !== desired.title ||
          confirmed.description !== desired.description ||
          confirmed.visibility !== desired.visibility ||
          confirmed.metadata.field_value !==
            desired.metadata.field_value
        ) {
          throw saved.error;
        }
      }

      if (mounted.current) {
        setUploading(false);
        setResume(null);
        pending.current = null;
        setMessage("Document uploaded.");
      }

      await refresh();
    });
  }

  async function remove(record) {
    if (
      !window.confirm(
        `Permanently delete “${record.title}” and its uploaded file?`
      )
    ) {
      return;
    }

    await operate(async () => {
      if (record.metadata.file_state !== "deleting") {
        const marked = await supabase
          .from("workplace_records")
          .update({
            visibility: "private",
            metadata: {
              ...record.metadata,
              file_state: "deleting",
            },
          })
          .eq("id", record.id)
          .select()
          .single();

        if (marked.error) throw marked.error;
      }

      const removed = await bucket.remove([
        record.metadata.storage_path,
      ]);

      if (removed.error) throw removed.error;

      const deleted = await supabase
        .from("workplace_records")
        .delete()
        .eq("id", record.id)
        .select("id")
        .single();

      if (deleted.error) throw deleted.error;

      setMessage("Document deleted.");
      await refresh();
    });

    await refresh();
  }

  function closePreview() {
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
      urls.current.delete(preview.url);
    }

    setPreview(null);
  }

  async function openFile(record, showPreview) {
    await operate(async () => {
      const { data, error } = await bucket.download(
        record.metadata.storage_path
      );

      if (error) throw error;

      await currentUser();

      if (!mounted.current) return;

      const mime = record.metadata.content_type;

      if (
        showPreview &&
        ["text/plain", "text/csv"].includes(mime)
      ) {
        setPreview({
          title: record.metadata.file_name,
          text: await data.slice(0, 100000).text(),
          truncated: data.size > 100000,
        });
      } else {
        const url = URL.createObjectURL(data);
        urls.current.add(url);

        if (showPreview) {
          setPreview({
            title: record.metadata.file_name,
            url,
          });
        } else {
          const link = document.createElement("a");

          link.href = url;
          link.download =
            record.metadata.file_name.replace(
              /[/\\\x00-\x1f]/g,
              "_"
            );

          document.body.appendChild(link);
          link.click();
          link.remove();

          setTimeout(() => {
            URL.revokeObjectURL(url);
            urls.current.delete(url);
          }, 60000);
        }
      }
    });
  }

  return (
    <section
      className="legion-docs legion-files"
      aria-label="Company documents"
    >
      <header className="ld-hero">
        <span className="ld-hero-icon">
          <FileText size={27} />
        </span>

        <div>
          <span className="ld-eyebrow">
            DOCUMENT LIBRARY
          </span>
          <h1>Company documents</h1>
          <p>
            Keep your team's files organised and
            accessible to the right people.
          </p>
        </div>

        <button
          type="button"
          className="ld-primary"
          disabled={busy || uploading}
          onClick={() => startUpload()}
        >
          <Plus size={17} />
          Upload document
        </button>
      </header>

      <p className="lf-summary">
        PDF, Word, Excel, PowerPoint, text and images
        {" · "}Maximum 10 MB per file
      </p>

      {uploading && (
        <section className="ld-editor">
          <header>
            <div>
              <span className="ld-eyebrow">
                {resume ? "RETRY UPLOAD" : "ADD A DOCUMENT"}
              </span>
              <h2>{resume ? resume.title : "Upload a file"}</h2>
            </div>

            <button
              type="button"
              className="ld-icon"
              disabled={busy}
              aria-label="Close upload form"
              onClick={() => setUploading(false)}
            >
              <X size={20} />
            </button>
          </header>

          <form
            onSubmit={upload}
            key={resume?.id || "new"}
          >
            <fieldset
              className="ld-fields"
              disabled={busy}
            >
              <label className="ld-wide">
                Choose file
                <input
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp"
                />
                <small>
                  {resume
                    ? `Select ${resume.metadata.file_name} to finish this upload.`
                    : "One file per upload. Use DOCX, XLSX or PPTX for Office documents."}
                </small>
              </label>

              <label className="ld-wide">
                Document title
                <input
                  name="title"
                  required
                  maxLength={180}
                  defaultValue={resume?.title || ""}
                />
              </label>

              <label>
                Topic
                <select
                  name="topic"
                  defaultValue={
                    topics.includes(
                      resume?.metadata.field_value
                    )
                      ? resume.metadata.field_value
                      : "General"
                  }
                >
                  {topics.map(topic => (
                    <option key={topic}>{topic}</option>
                  ))}
                </select>
              </label>

              <label>
                Who can access it?
                <select
                  name="visibility"
                  defaultValue="private"
                >
                  <option value="private">
                    Only me and managers
                  </option>
                  <option value="company">
                    Shared with the company
                  </option>
                </select>
              </label>

              <label className="ld-wide">
                Description · optional
                <textarea
                  name="description"
                  maxLength={5000}
                  rows={3}
                  defaultValue={resume?.description || ""}
                />
              </label>

              <div className="ld-save ld-wide">
                <button
                  className="ld-primary"
                  type="submit"
                >
                  {busy ? (
                    <LoaderCircle
                      className="spin"
                      size={17}
                    />
                  ) : (
                    <Upload size={17} />
                  )}

                  {busy ? "Uploading…" : "Upload and save"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      {error && (
        <p className="ld-error" role="alert">
          {error}
          {uploading
            ? " If an upload was interrupted, use Retry upload on its library card."
            : ""}
        </p>
      )}

      {message && (
        <p className="lf-success" role="status">
          {message}
        </p>
      )}
<label className="td-document-archive-filter">
  <input
    type="checkbox"
    checked={showArchived}
    onChange={event =>
      setShowArchived(event.target.checked)
    }
  />
  Show archived documents
</label>
      <section className="ld-library">
        <div className="ld-library-heading">
          <div>
            <span className="ld-eyebrow">
              YOUR WORKSPACE
            </span>
            <h2>Stored documents</h2>
          </div>

          <button
            type="button"
            className="ld-secondary"
            disabled={busy || loading}
            onClick={refresh}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        <div className="ld-filters">
          <label className="ld-search">
            <Search size={18} />
            <input
              aria-label="Search loaded documents"
              placeholder="Search loaded files, topics or uploaders…"
              value={query}
              onChange={event =>
                setQuery(event.target.value)
              }
            />
          </label>

          <select
            aria-label="Filter documents by topic"
            value={topicFilter}
            onChange={event =>
              setTopicFilter(event.target.value)
            }
          >
            <option value="all">All topics</option>

            {[
              ...new Set([
                ...topics,
                ...files.map(file =>
                  String(
                    file.metadata.field_value || "General"
                  )
                ),
              ]),
            ].map(topic => (
              <option key={topic}>{topic}</option>
            ))}
          </select>

          <select
            aria-label="Sort loaded documents"
            value={sortOrder}
            onChange={event =>
              setSortOrder(event.target.value)
            }
          >
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>

        <p className="lf-summary">
          {matches.length} matching · {files.length} files loaded.
          {" "}Refresh loads the newest 100.
        </p>

        {loadError && (
          <p className="ld-error" role="alert">
            {loadError}
          </p>
        )}

        {loading && (
          <p className="lf-summary" role="status">
            Loading documents…
          </p>
        )}

        <div className="ld-grid">
          {matches.map(record => {
            const state = record.metadata.file_state;
            const ready = state === "ready";

            const extension = record.metadata.file_name
              .split(".")
              .pop()
              .toLowerCase();

            const canDelete =
              isManager || record.created_by === userId;

            const canPreview =
              /^(image\/(jpeg|png|webp)|text\/(plain|csv))$/.test(
                record.metadata.content_type
              );

            return (
              <article
                className="ld-card"
                key={record.id}
                id={`workplace-${record.id}`}
                data-document-id={record.id}
              >
                <div className="ld-card-top">
                  <span className="ld-tag">
                    {String(
                      record.metadata.field_value || "General"
                    )}
                  </span>

                  {record.visibility === "private" && (
                    <LockKeyhole
                      size={16}
                      aria-label="Private document"
                    />
                  )}
                </div>

                <span
                  className="lf-filetype"
                  data-type={extension}
                >
                  {extension.toUpperCase()}
                </span>

                <h3>{record.title}</h3>

                <p>
                  {record.description ||
                    record.metadata.file_name}
                </p>

                <div className="ld-card-bottom">
                  <strong className="lf-filename">
                    {record.metadata.file_name}
                  </strong>

                  <span>
                    {sizeLabel(record.metadata.file_size)}
                    {" · "}
                    {extension.toUpperCase()}
                  </span>

                  <span>{author(record.created_by)}</span>

                  <small>
                    {new Date(
                      record.created_at
                    ).toLocaleDateString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}
                  </small>
                </div>

                <p className="lf-access">
                  {ready
                    ? record.visibility === "company"
                      ? "Shared with the company"
                      : "Only uploader and managers"
                    : state === "deleting"
                      ? "Deletion pending · retry Delete"
                      : "Incomplete upload · select the original file to retry"}
                </p>

               <footer className="lf-actions">
  <span className="td-document-version">
    Version {record.document_revision || 1}
    {record.status === "archived" ? " · Archived" : ""}
  </span>

  {ready && (
    <button
      type="button"
      className="ld-open"
      disabled={busy}
      onClick={() => openFile(record, false)}
    >
      <Download size={15} />
      Download
    </button>
  )}

  {ready && canPreview && (
    <button
      type="button"
      className="ld-open"
      disabled={busy}
      onClick={() => openFile(record, true)}
    >
      <Eye size={15} />
      Preview
    </button>
  )}

  {state === "pending" &&
    record.created_by === userId && (
      <button
        type="button"
        className="ld-open"
        disabled={busy}
        onClick={() => startUpload(record)}
      >
        <Upload size={15} />
        Retry upload
      </button>
    )}

  {ready && canDelete && (
    <DocumentVersionTools
      key={`${userId}:${record.id}`}
      record={record}
      userId={userId}
      isManager={isManager}
      employees={employees}
      disabled={busy}
      onBusy={value => {
        lock.current = value;
        setBusy(value);
      }}
      onSaved={saved => {
        version.current += 1;
        setLoading(false);

        setFiles(previous =>
          previous.map(item =>
            item.id === saved.id ? saved : item
          )
        );

        if (saved.status === "archived") {
          setMessage(
            "Document archived. Select Show archived documents to find it."
          );
        }
      }}
    />
  )}

  {!ready && canDelete && (
    <button
      type="button"
      className="ld-delete"
      disabled={busy}
      onClick={() => remove(record)}
    >
      <Trash2 size={15} />
      Delete incomplete upload
    </button>
  )}
</footer>
              </article>
            );
          })}
        </div>

        {!loading && !matches.length && (
          <div className="ld-empty">
            <FileText size={34} />

            <h3>
              {files.length
                ? "No matching documents"
                : "Your document library is ready"}
            </h3>

            <p>
              {files.length
                ? "Try another search or load more files."
                : "Upload a file to make it available inside Legion."}
            </p>
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            className="ld-secondary lf-load"
            disabled={loading || busy}
            onClick={loadMore}
          >
            Load more documents
          </button>
        )}
      </section>

      {preview && (
        <dialog
          ref={dialog}
          className="lf-preview"
          onCancel={event => {
            event.preventDefault();
            closePreview();
          }}
        >
          <header>
            <h2>{preview.title}</h2>

            <button
              type="button"
              className="ld-icon"
              aria-label="Close document preview"
              onClick={closePreview}
            >
              <X size={20} />
            </button>
          </header>

          {preview.url ? (
            <img
              src={preview.url}
              alt={preview.title}
            />
          ) : (
            <>
              <pre>{preview.text}</pre>

              {preview.truncated && (
                <p>
                  Showing the first 100 KB. Download the
                  file to read all of it.
                </p>
              )}
            </>
          )}
        </dialog>
      )}
    </section>
  );
}