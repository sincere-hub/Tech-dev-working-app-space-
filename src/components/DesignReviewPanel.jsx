import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Check,
  History,
  LoaderCircle,
  RefreshCw,
  Send,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";

function untilAbort(promise, signal) {
  let stop;

  const cancelled = new Promise((_, reject) => {
    stop = () => reject(
      new Error(
        "The request timed out or was cancelled. Refresh history before trying again.",
      ),
    );

    if (signal.aborted) {
      stop();
    } else {
      signal.addEventListener("abort", stop, {
        once: true,
      });
    }
  });

  return Promise.race([
    promise,
    cancelled,
  ]).finally(() => {
    signal.removeEventListener("abort", stop);
  });
}

const labels = {
  pending: "Waiting for review",
  published: "Published release",
  changes_requested: "Changes requested",
  superseded: "Superseded",
};

function formatDate(value) {
  const parsed = new Date(value);

  return value && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Johannesburg",
      })
    : "Date unavailable";
}

export default function DesignReviewPanel({
  record,
  userId,
  employees = [],
  isManager,
  onRefresh,
}) {
  const [history, setHistory] = useState({
    key: "",
    rows: [],
    more: false,
  });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const alive = useRef(true);
  const read = useRef(null);
  const action = useRef(null);
  const readLock = useRef(false);
  const actionLock = useRef(false);
  const generation = useRef(0);

  const scope =
    `${userId}:${record.id}:${record.updated_at}`;

  const currentScope = useRef(scope);
  currentScope.current = scope;

  const current = () =>
    alive.current &&
    currentScope.current === scope;

  const rows = history.key === scope
    ? history.rows
    : [];

  const pending = rows.find(
    row => row.state === "pending",
  );

  const byId = new Map(
    employees.map(person => [person.id, person]),
  );

  const name = id =>
    byId.get(id)?.display_name ||
    (id === userId ? "You" : "Account unavailable");

  async function session(signal) {
    const { data, error } = await untilAbort(
      supabase.auth.getSession(),
      signal,
    );

    if (error) throw error;

    if (
      !current() ||
      !userId ||
      data.session?.user.id !== userId ||
      signal.aborted
    ) {
      throw new Error(
        "Your account or reference changed. Reopen its review history.",
      );
    }

    return data.session.access_token;
  }

  async function execute(query, signal) {
    const token = await session(signal);

    const { data, error } = await untilAbort(
      query
        .setHeader(
          "Authorization",
          `Bearer ${token}`,
        )
        .abortSignal(signal),
      signal,
    );

    if (error) {
      throw new Error(
        error.message ||
        "The review request could not finish.",
      );
    }

    await session(signal);

    return data;
  }

  async function load(reset = true) {
    if (
      !current() ||
      (
        !reset &&
        (
          readLock.current ||
          !history.more ||
          !rows.length
        )
      )
    ) {
      return;
    }

    read.current?.abort();

    const aborter = new AbortController();
    read.current = aborter;

    const request = ++generation.current;

    readLock.current = true;
    setLoading(true);
    setError("");

    const timer = setTimeout(
      () => aborter.abort(),
      15000,
    );

    try {
      let query = supabase
        .from("td_design_reviews")
        .select("*")
        .eq("record_id", record.id)
        .order("sequence", {
          ascending: false,
        })
        .limit(11);

      if (!reset) {
        query = query.lt(
          "sequence",
          rows.at(-1).sequence,
        );
      }

      const page = await execute(
        query,
        aborter.signal,
      );

      if (
        !current() ||
        request !== generation.current
      ) {
        return;
      }

      setHistory(previous => ({
        key: scope,

        rows: [
          ...new Map([
            ...(
              !reset && previous.key === scope
                ? previous.rows
                : []
            ),

            ...(page || []).slice(0, 10),
          ].map(row => [
            row.id,
            row,
          ])).values(),
        ],

        more: (page || []).length > 10,
      }));
    } catch (failure) {
      if (
        current() &&
        request === generation.current
      ) {
        setError(
          aborter.signal.aborted
            ? "History loading timed out. Try Refresh history."
            : failure.message,
        );
      }
    } finally {
      clearTimeout(timer);

      if (request === generation.current) {
        readLock.current = false;

        if (current()) {
          setLoading(false);
        }
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    load(true);

    return () => {
      alive.current = false;
      generation.current += 1;
      read.current?.abort();
      action.current?.abort();
    };
  }, [scope]);

  async function refresh() {
    if (actionLock.current) return;

    try {
      if (typeof onRefresh === "function") {
        await onRefresh();
      }

      if (current()) {
        await load(true);
      }
    } catch (failure) {
      if (current()) {
        setError(
          failure.message ||
          "Could not refresh the library.",
        );
      }
    }
  }

  async function review(actionName) {
    if (
      !isManager ||
      !current() ||
      actionLock.current ||
      loading ||
      history.key !== scope
    ) {
      return;
    }

    setError("");
    setNotice("");

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to review this reference.",
      );
      return;
    }

    if (typeof onRefresh !== "function") {
      setError(
        "Review controls are not connected. Contact your administrator.",
      );
      return;
    }

    if (
      actionName === "request_changes" &&
      !note.trim()
    ) {
      setError(
        "Explain the changes needed in the review note.",
      );
      return;
    }

    if (actionName !== "submit" && !pending) {
      return;
    }

    if (
      actionName === "publish" &&
      !window.confirm(
        `Publish version ${pending.version} ` +
        `of “${record.title}”?`,
      )
    ) {
      return;
    }

    actionLock.current = true;
    setBusy(true);

    const aborter = new AbortController();
    action.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      20000,
    );

    let committed = false;

    try {
      const result = await execute(
        supabase.rpc(
          "td_design_review_action",
          {
            p_record_id: record.id,
            p_expected_updated_at:
              record.updated_at,
            p_action: actionName,
            p_note: note.trim(),

            p_review_id:
              actionName === "submit"
                ? null
                : pending.id,
          },
        ),
        aborter.signal,
      );

      if (
        !result?.id ||
        result.record_id !== record.id
      ) {
        throw new Error(
          "The review result was not confirmed. Refresh history before trying again.",
        );
      }

      committed = true;

      if (current()) {
        setNote("");

        setNotice(
          actionName === "publish"
            ? "Version published. Its saved specification is in the history below."
            : actionName === "submit"
              ? "Review request submitted."
              : "Changes requested. The reference is a draft again.",
        );
      }

      await onRefresh();

      if (current()) {
        await load(true);
      }
    } catch (failure) {
      if (current()) {
        setError(
          committed
            ? "The review was saved, but the library could not refresh. Reload the workspace."
            : (
                failure.message ||
                "Could not update this review."
              ),
        );
      }
    } finally {
      clearTimeout(timer);
      actionLock.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  return (
    <section
      className="tds-review"
      aria-label="Design reviews and release history"
    >
      <header className="tds-toolbar">
        <div>
          <p className="tds-eyebrow">
            CHANGE CONTROL
          </p>

          <h3>Reviews & release history</h3>
        </div>

        <button
          type="button"
          className="tds-button"
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={15} />
          Refresh history
        </button>
      </header>

      {isManager && (
        <div className="tds-review-actions">
          <label>
            Review or release note

            <textarea
              rows={2}
              maxLength={2000}
              value={note}
              disabled={busy}
              onChange={event => {
                setNote(event.target.value);
                setError("");
              }}
              placeholder="Describe the change, review feedback or release decision."
            />
          </label>

          <div className="tds-wrap">
            {!pending &&
              record.status !== "archived" && (
                <button
                  type="button"
                  className="tds-button tds-primary"
                  disabled={
                    loading ||
                    busy ||
                    history.key !== scope ||
                    Boolean(error)
                  }
                  onClick={() => review("submit")}
                >
                  <Send size={15} />
                  Submit for review
                </button>
              )}

            {pending && (
              <>
                <button
                  type="button"
                  className="tds-button tds-primary"
                  disabled={
                    loading ||
                    busy ||
                    Boolean(error)
                  }
                  onClick={() => review("publish")}
                >
                  <Check size={15} />
                  Approve & publish v{pending.version}
                </button>

                <button
                  type="button"
                  className="tds-button"
                  disabled={
                    loading ||
                    busy ||
                    Boolean(error)
                  }
                  onClick={() =>
                    review("request_changes")
                  }
                >
                  Request changes
                </button>
              </>
            )}

            {busy && (
              <span
                className="tds-review-progress"
                role="status"
              >
                <LoaderCircle
                  className="tdkit-spin"
                  size={17}
                />

                Saving review…
              </span>
            )}
          </div>

          <p className="tds-muted">
            Managers and admins can review submissions,
            including their own. A content change
            invalidates its pending review. Each
            published version keeps its saved
            specification.
          </p>
        </div>
      )}

      {error && (
        <p className="tds-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="tds-feedback" role="status">
          {notice}
        </p>
      )}

      {loading && (
        <p className="tds-muted" role="status">
          Loading history…
        </p>
      )}

      {!loading && !error && !rows.length && (
        <p className="tds-muted">
          No{" "}
          {isManager
            ? "review requests or releases"
            : "published releases"}
          {" "}recorded yet.
        </p>
      )}

      <div className="tds-review-list">
        {rows.map(item => (
          <article
            key={`review:${item.id}`}
            className="tds-review-item"
          >
            <div className="tds-toolbar">
              <strong>
                <History size={16} />

                Version {item.version}
                {" · "}
                revision {item.revision}
              </strong>

              <span
                className={
                  "tds-status " +
                  (
                    item.state === "published"
                      ? "tds-status-published"
                      : item.state === "pending"
                        ? "tds-status-pending_approval"
                        : ""
                  )
                }
              >
                {labels[item.state] || item.state}
              </span>
            </div>

            <p className="tds-muted">
              Submitted by {name(item.submitted_by)}
              {" · "}
              {formatDate(item.submitted_at)}

              {item.reviewed_by
                ? (
                    ` · Reviewed by ` +
                    `${name(item.reviewed_by)} · ` +
                    formatDate(item.reviewed_at)
                  )
                : ""}
            </p>

            {item.submission_note && (
              <p className="tds-review-note">
                <strong>Submission:</strong>
                {" "}
                {item.submission_note}
              </p>
            )}

            {item.review_note && (
              <p className="tds-review-note">
                <strong>Review:</strong>
                {" "}
                {item.review_note}
              </p>
            )}

            <details>
              <summary>
                Inspect saved specification
              </summary>

              <h4>{item.snapshot?.title}</h4>

              <p className="tds-review-note">
                {item.snapshot?.description ||
                  "No usage guidance recorded."}
              </p>

              <pre
                tabIndex={0}
                aria-label={
                  `Saved specification for version ` +
                  item.version
                }
              >
                <code>
                  {JSON.stringify(
                    item.snapshot?.metadata
                      ?.design_system || {},
                    null,
                    2,
                  )}
                </code>
              </pre>
            </details>
          </article>
        ))}
      </div>

      {history.key === scope && history.more && (
        <button
          type="button"
          className="tds-button"
          disabled={loading || busy}
          onClick={() => load(false)}
        >
          Load older entries
        </button>
      )}
    </section>
  );
}