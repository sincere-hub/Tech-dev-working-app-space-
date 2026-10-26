import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Download,
  History,
  Upload,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";
import "./wiki-article-tools.css";

const types = {
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

const sizeLabel = size =>
  `${(Number(size || 0) / 1024).toLocaleString("en-ZA", {
    maximumFractionDigits: 1,
  })} KB`;

const dateLabel = date =>
  new Date(date).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  });

function timed(promise, milliseconds = 30000) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "The request timed out. Keep this window open and retry."
            )
          ),
        milliseconds
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export default function DocumentVersionTools({
  record,
  userId,
  isManager,
  employees = [],
  disabled = false,
  onSaved,
  onBusy,
}) {
  const [mode, setMode] = useState("");
  const [latest, setLatest] = useState(record);
  const [file, setFile] = useState(null);
  const [versions, setVersions] = useState([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [notice, setNotice] = useState("");

  const dialog = useRef(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const attempt = useRef(null);
  const aborter = useRef(null);
  const urls = useRef(new Set());

  const allowed = Boolean(
    isManager || record.created_by === userId
  );

  const bucket = supabase.storage.from("legion-documents");

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      aborter.current?.abort();
      urls.current.forEach(url => URL.revokeObjectURL(url));
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
    const { data, error } = await timed(
      supabase.auth.getSession(),
      15000
    );

    if (error) throw error;

    if (
      !alive.current ||
      data.session?.user.id !== userId
    ) {
      throw new Error(
        "Your account changed. Reopen Documents after signing in."
      );
    }
  }

  async function request(query) {
    await checkAccount();

    const controller = new AbortController();
    aborter.current = controller;

    const timer = setTimeout(
      () => controller.abort(),
      15000
    );

    try {
      const { data, error } = await query.abortSignal(
        controller.signal
      );

      if (error) throw error;

      await checkAccount();

      return data;
    } finally {
      clearTimeout(timer);

      if (aborter.current === controller) {
        aborter.current = null;
      }
    }
  }

  async function run(action) {
    if (lock.current || disabled || !allowed) return;

    if (!navigator.onLine) {
      setError("Connect to the internet before continuing.");
      return;
    }

    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    setNotice("");

    try {
      await checkAccount();
      await action();
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message || "The document request failed."
        );
      }
    } finally {
      lock.current = false;
      onBusy?.(false);

      if (alive.current) {
        setBusy(false);
        setStage("");
      }
    }
  }

  const currentDocument = () =>
    request(
      supabase
        .from("workplace_records")
        .select("*")
        .eq("id", record.id)
        .eq("module_id", "collaboration.docs")
        .single()
    );

  async function historyPage(before) {
    let query = supabase
      .from("td_document_versions")
      .select("revision,metadata,uploaded_by,saved_at")
      .eq("document_id", record.id)
      .order("revision", { ascending: false })
      .limit(21);

    if (before) {
      query = query.lt("revision", before);
    }

    const rows = await request(query);

    setMore(rows.length > 20);
    setVersions(previous =>
      before
        ? [...previous, ...rows.slice(0, 20)]
        : rows.slice(0, 20)
    );
  }

  function open(nextMode) {
    return run(async () => {
      const current = await currentDocument();

      if (
        current.metadata?.kind !== "document" ||
        current.metadata.file_state !== "ready"
      ) {
        throw new Error(
          "This document is not ready. Refresh the library."
        );
      }

      if (nextMode === "history") {
        await historyPage();
      }

      setLatest(current);
      setFile(null);
      attempt.current = null;
      onSaved(current);
      setMode(nextMode);
    });
  }

  const publishedAttempt = pending =>
    request(
      supabase
        .from("td_document_versions")
        .select("revision")
        .eq("document_id", record.id)
        .eq("metadata->>storage_path", pending.path)
        .maybeSingle()
    );

  async function publish(pending) {
    const result = await request(
      supabase.rpc("td_document_publish_version", {
        p_upload_id: pending.id,
      })
    );

    const saved = Array.isArray(result)
      ? result[0]
      : result;

    if (!saved?.id) {
      throw new Error(
        "Could not confirm publication. Retry this upload."
      );
    }

    attempt.current = null;
    onSaved(saved);
    setLatest(saved);
    dialog.current?.close();
    setMode("");
    setFile(null);

    setNotice(
      `Document saved · version ${saved.document_revision}`
    );
  }

  function upload(event) {
    event.preventDefault();

    return run(async () => {
      if (!file) {
        throw new Error("Choose a replacement file.");
      }

      const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

      if (
        !types[extension] ||
        !file.size ||
        file.size > 10485760 ||
        file.name.length > 200 ||
        /[/\\\x00-\x1f\x7f]/.test(file.name)
      ) {
        throw new Error(
          "Choose a supported file with a valid name, no larger than 10 MB."
        );
      }

      if (!attempt.current) {
        const id = crypto.randomUUID();

        attempt.current = {
          id,
          path: `${latest.created_by}/${id}.${extension}`,
          expected: latest.document_revision,
          inflight: null,
        };
      }

      const pending = attempt.current;

      setStage("Preparing replacement…");

      await request(
        supabase.rpc("td_document_begin_version", {
          p_document_id: record.id,
          p_expected_revision: pending.expected,
          p_upload_id: pending.id,
          p_file_name: file.name,
          p_file_size: file.size,
        })
      );

      if (await publishedAttempt(pending)) {
        await publish(pending);
        return;
      }

      await checkAccount();
      setStage("Uploading replacement…");

      if (!pending.inflight) {
        pending.inflight = bucket
          .upload(pending.path, file, {
            contentType: types[extension],
            cacheControl: "0",
            upsert: false,
          })
          .finally(() => {
            pending.inflight = null;
          });
      }

      const uploaded = await timed(pending.inflight);

      await checkAccount();

      if (
        uploaded.error &&
        String(uploaded.error.statusCode) !== "409" &&
        !/already exists|duplicate/i.test(
          uploaded.error.message
        )
      ) {
        throw uploaded.error;
      }

      setStage("Publishing new version…");
      await publish(pending);
    });
  }

  function closeNow() {
    dialog.current?.close();
    setMode("");
    setFile(null);
    setError("");
  }

  function close() {
    if (lock.current || busy) return;

    if (!attempt.current) {
      closeNow();
      return;
    }

    if (
      !window.confirm(
        "Cancel this replacement attempt? The current published document will stay available."
      )
    ) {
      return;
    }

    return run(async () => {
      const pending = attempt.current;

      if (pending.inflight) {
        await timed(pending.inflight);
      }

      if (await publishedAttempt(pending)) {
        await publish(pending);
        return;
      }

      try {
        await request(
          supabase.rpc("td_document_cancel_version", {
            p_upload_id: pending.id,
          })
        );
      } catch (failure) {
        if (
          !/Remove the unfinished uploaded file first/i.test(
            failure.message || ""
          )
        ) {
          throw failure;
        }

        await checkAccount();

        const removed = await timed(
          bucket.remove([pending.path])
        );

        if (removed.error) throw removed.error;

        await request(
          supabase.rpc("td_document_cancel_version", {
            p_upload_id: pending.id,
          })
        );
      }

      attempt.current = null;
      closeNow();
    });
  }

  function archive() {
    const restoring = record.status === "archived";

    if (
      !window.confirm(
        restoring
          ? "Restore this document to the active library?"
          : "Archive this document and keep its file versions? Permitted users will retain access."
      )
    ) {
      return;
    }

    return run(async () => {
      const current = await currentDocument();

      const saved = await request(
        supabase
          .from("workplace_records")
          .update({
            status: restoring ? "published" : "archived",
          })
          .eq("id", record.id)
          .eq("document_revision", current.document_revision)
          .eq("status", current.status)
          .eq("updated_at", current.updated_at)
          .select("*")
          .single()
      );

      onSaved(saved);

      setNotice(
        restoring
          ? "Document restored."
          : "Document archived."
      );
    });
  }

  function download(version) {
    return run(async () => {
      const { data, error } = await timed(
        bucket.download(version.metadata.storage_path)
      );

      if (error) throw error;

      await checkAccount();

      const url = URL.createObjectURL(data);
      urls.current.add(url);

      const link = document.createElement("a");

      link.href = url;
      link.download = String(
        version.metadata.file_name || "document"
      ).replace(/[/\\\x00-\x1f\x7f]/g, "_");

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 60000);
    });
  }

  if (!allowed) return null;

  return (
    <div className="td-wiki-tools td-document-tools">
      <div className="td-wiki-actions">
        {record.status !== "archived" && (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => open("upload")}
          >
            <Upload size={15} />
            Upload new version
          </button>
        )}

        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => open("history")}
        >
          <History size={15} />
          File history
        </button>

        <button
          type="button"
          disabled={busy || disabled}
          onClick={archive}
        >
          <Archive size={15} />
          {record.status === "archived"
            ? "Restore to library"
            : "Archive"}
        </button>
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
            mode === "upload"
              ? "Upload new document version"
              : "Document file history"
          }
          onCancel={event => {
            event.preventDefault();
            close();
          }}
        >
          <header>
            <div>
              <small>DOCUMENT LIBRARY</small>
              <h2>
                {mode === "upload"
                  ? "Upload new version"
                  : "File history"}
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

          <h3>{latest.title}</h3>

          <p className="td-wiki-help">
            Current file: {latest.metadata.file_name}
            {" · "}version {latest.document_revision}
          </p>

          {error && (
            <p className="td-wiki-error" role="alert">
              {error}
            </p>
          )}

          {mode === "upload" ? (
            <form onSubmit={upload}>
              <p className="td-wiki-help">
                The new file becomes the current version
                after publication. Earlier files stay in
                history. The document title, description
                and access permissions are preserved.
              </p>

              <fieldset disabled={busy}>
                <label>
                  Replacement file
                  <input
                    type="file"
                    required
                    disabled={Boolean(attempt.current)}
                    accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp"
                    onChange={event =>
                      setFile(event.target.files?.[0] || null)
                    }
                  />
                </label>

                <small>
                  Maximum 10 MB. Keep this window open
                  to retry an interrupted upload.
                </small>

                {file && (
                  <p>
                    {file.name} · {sizeLabel(file.size)}
                  </p>
                )}
              </fieldset>

              {stage && (
                <p className="td-wiki-help" role="status">
                  {stage}
                </p>
              )}

              <footer>
                <button
                  type="button"
                  disabled={busy}
                  onClick={close}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="td-wiki-save"
                  disabled={busy || !file}
                >
                  {busy
                    ? "Saving…"
                    : attempt.current
                      ? "Retry replacement"
                      : "Upload and publish"}
                </button>
              </footer>
            </form>
          ) : (
            <>
              <p className="td-wiki-help">
                File history is available to the uploader
                and managers/admins. Download a previous
                file to inspect it or upload it again
                as a new version.
              </p>

              <div className="td-document-history">
                {versions.map(version => (
                  <article key={version.revision}>
                    <div>
                      <strong>
                        Version {version.revision}
                        {version.revision ===
                        latest.document_revision
                          ? " · Current"
                          : ""}
                      </strong>

                      <p>
                        {version.metadata.file_name}
                        {" · "}
                        {sizeLabel(version.metadata.file_size)}
                      </p>

                      <small>
                        {dateLabel(version.saved_at)}
                        {" · "}
                        {version.uploaded_by
                          ? employees.find(
                              person =>
                                person.id ===
                                version.uploaded_by
                            )?.display_name ||
                            "Workspace uploader"
                          : "Existing file when history began"}
                      </small>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => download(version)}
                    >
                      <Download size={15} />
                      Download
                    </button>
                  </article>
                ))}

                {!versions.length && (
                  <p>No file versions found.</p>
                )}

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
              </div>
            </>
          )}
        </dialog>
      )}
    </div>
  );
}