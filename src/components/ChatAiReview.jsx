import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ShieldCheck, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";

import {
  chatCall,
  chatRequest,
} from "../lib/companyChat.js";

import "./chat-ai.css";

function useAiState(userId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++generation.current;

    try {
      const data = await chatCall(
        userId,
        "td_chat_ai_config_v1",
      );

      if (version === generation.current) {
        setState(data);
        setError("");
      }
    } catch (failure) {
      if (version === generation.current) {
        setError(
          failure.message || "Review status unavailable",
        );
      }
    }
  }, [userId]);

  useEffect(() => {
    setState(null);
    void refresh();

    const timer = setInterval(refresh, 30000);

    return () => {
      clearInterval(timer);
      generation.current++;
    };
  }, [refresh]);

  return { state, error, refresh };
}

export function ChatAiNotice({ userId }) {
  const { state, error } = useAiState(userId);

  return (
    <span>
      {error
        ? "Automated review status unavailable."
        : !state
          ? "Checking automated review status…"
          : state.enabled
            ? "Automated safety review is enabled for direct text messages. OpenAI processes the text; flagged excerpts may be reviewed by admins. AI flags require human review."
            : "Automated safety review is off. Direct conversations are accessible to their participants through TechDev."}
    </span>
  );
}

export function ChatAiAdminButton({
  userId,
  onOpen,
}) {
  const { state, error } = useAiState(userId);

  return (
    <button
      type="button"
      className="td-ai-open"
      onClick={onOpen}
      title={error || "Open safety reports"}
    >
      <ShieldCheck size={16} />
      Safety reports

      {state?.open > 0 && <b>{state.open}</b>}

      {error && <span> · Status unavailable</span>}
    </button>
  );
}

function saveEvidence(report, author) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.font = "22px sans-serif";

  const lines = [];

  for (const paragraph of [
    "TechDev — evidence excerpt",
    author,
    report.message_at,
    "",
    report.excerpt,
    "",
    "AI flag, not a finding of misconduct.",
    "Rendered from a stored excerpt.",
  ]) {
    let line = "";

    for (const character of Array.from(paragraph)) {
      if (
        character === "\n" ||
        context.measureText(line + character).width > 810
      ) {
        lines.push(line);
        line = character === "\n" ? "" : character;
      } else {
        line += character;
      }
    }

    lines.push(line);
  }

  canvas.height = 90 + lines.length * 32;

  context.fillStyle = "#102339";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.font = "22px sans-serif";
  context.fillStyle = "#edf5ff";

  lines.forEach((line, index) =>
    context.fillText(line, 42, 48 + index * 32),
  );

  const link = document.createElement("a");
  link.download = `techdev-evidence-${report.id}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export default function ChatAiReview({
  userId,
  employees = [],
  onClose,
}) {
  const dialog = useRef(null);
  const alive = useRef(true);
  const lock = useRef(false);

  const {
    state,
    error: statusError,
    refresh,
  } = useAiState(userId);

  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await chatRequest(
        supabase
          .from("td_chat_ai_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(51),
      );

      if (alive.current) {
        setReports(rows.slice(0, 50));
        setOlder(rows.length > 50);
        setError("");
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message || "Could not load reports",
        );
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    dialog.current.showModal();

    void load();

    const timer = setInterval(() => {
      if (!lock.current) void load();
    }, 30000);

    return () => {
      alive.current = false;
      clearInterval(timer);

      if (dialog.current?.open) {
        dialog.current.close();
      }
    };
  }, [load]);

  async function act(name, args) {
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError("");

    try {
      await chatCall(userId, name, args);
      await Promise.all([load(), refresh()]);
    } catch (failure) {
      if (alive.current) {
        setError(failure.message || "Action failed");
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const person = id =>
    employees.find(employee => employee.id === id)
      ?.display_name || "Former employee";

  return (
    <dialog
      ref={dialog}
      className="td-chat-dialog td-ai-dialog"
      aria-labelledby="td-ai-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <small>ADMINISTRATION</small>
          <h2 id="td-ai-title">Chat safety reports</h2>
        </div>

        <button
          type="button"
          className="td-chat-icon"
          disabled={busy}
          onClick={onClose}
          aria-label="Close safety reports"
        >
          <X size={19} />
        </button>
      </header>

      <p className="td-chat-note">
        AI flags are possible concerns, not findings
        of misconduct. Review context fairly before
        taking action. Voice notes, images and linked
        websites are not scanned.
      </p>

      {state && (
        <div className="td-ai-controls">
          <strong>
            Monitoring {state.enabled ? "enabled" : "disabled"}
          </strong>

          <span>
            {state.pending} pending · {state.failed} failed
            {" · "}{state.checked} recent checks
          </span>

          <button
            type="button"
            disabled={busy || Boolean(statusError)}
            onClick={() =>
              act("td_chat_ai_config_v1", {
                p_enabled: !state.enabled,
              })
            }
          >
            {state.enabled
              ? "Disable review"
              : "Enable review"}
          </button>

          {state.failed > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act("td_chat_ai_config_v1", {
                  p_retry: true,
                })
              }
            >
              Retry failed checks
            </button>
          )}

          {state.last_error && (
            <p role="status">
              Last worker error: {state.last_error}
            </p>
          )}
        </div>
      )}

      {(error || statusError) && (
        <p className="td-chat-error" role="alert">
          {error || statusError}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void load();
          void refresh();
        }}
      >
        Refresh reports
      </button>

      {loading ? (
        <p role="status">Loading reports…</p>
      ) : !reports.length && !error ? (
        <p>No reports yet.</p>
      ) : null}

      {reports.map(report => (
        <article
          key={report.id}
          className="td-ai-report"
        >
          <div className="td-ai-heading">
            <strong>
              Possible {report.category.replace(/_/g, " ")}
            </strong>
            <span>{report.review_state}</span>
          </div>

          <p>
            Conversation participants:{" "}
            {(report.participants || [])
              .map(person)
              .join(" · ")}
          </p>

          <p>{report.summary}</p>

          <div className="td-ai-evidence">
            <small>
              SUPPORTING EXCERPT · NOT THE FULL CONVERSATION
            </small>

            <strong>{person(report.author_id)}</strong>

            <time dateTime={report.message_at}>
              {new Date(report.message_at).toLocaleString(
                "en-ZA",
                { timeZone: "Africa/Johannesburg" },
              )}
            </time>

            <blockquote>{report.excerpt}</blockquote>
          </div>

          {report.superseded && (
            <p>
              This message was edited or deleted after
              this evidence was recorded.
            </p>
          )}

          <div className="td-ai-actions">
            <button
              type="button"
              onClick={() =>
                saveEvidence(
                  report,
                  person(report.author_id),
                )
              }
            >
              Save evidence PNG
            </button>

            {report.review_state === "open" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act("td_chat_ai_review_v1", {
                      p_report: report.id,
                      p_state: "dismissed",
                    })
                  }
                >
                  Dismiss flag
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act("td_chat_ai_review_v1", {
                      p_report: report.id,
                      p_state: "escalated",
                    })
                  }
                >
                  Needs investigation
                </button>
              </>
            )}
          </div>
        </article>
      ))}

      {older && <p>Showing the newest 50 reports.</p>}

      <p className="td-chat-note">
        Reports expire after 30 days. Full private
        conversations remain restricted to their participants.
      </p>
    </dialog>
  );
}