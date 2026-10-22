import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowDown,
  Check,
  LoaderCircle,
  MessageSquare,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";

import EmployeeAvatar from "./EmployeeAvatar.jsx";
import ChatTools, {
  MentionText,
  useChatTools,
} from "./ChatTools.jsx";

const clock = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const calendar = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const closed = record =>
  ["archived", "done", "rejected"].includes(record?.status);

function messageText(record) {
  const body = String(record.description || "").trim();
  const title = String(record.title || "").trim();

  return body &&
    title &&
    !body.replace(/\s+/g, " ").startsWith(title)
    ? `${title}\n${body}`
    : body || title;
}

export function chatMessages(
  records,
  interactions,
  employees,
  userId,
) {
  const people = new Map(
    employees.map(person => [
      person.id,
      person.display_name,
    ]),
  );

  const parents = new Map(
    records
      .filter(record =>
        record.module_id === "collaboration.chat"
      )
      .map(record => [record.id, record]),
  );

  const author = id => people.get(id) || "Employee";

  const items = [...parents.values()].map(record => ({
    key: `message-${record.id}`,
    record,
    authorId: record.created_by,
    author: author(record.created_by),
    text: messageText(record),
    date: record.created_at,
    original: true,
  }));

  for (const reply of interactions) {
    const parent = parents.get(reply.record_id);

    if (reply.kind !== "comment" || !parent) continue;

    items.push({
      key: `reply-${reply.id}`,
      record: parent,
      authorId: reply.employee_id,
      author: author(reply.employee_id),
      text: reply.body,
      date: reply.created_at,
      original: false,
      quote: {
        author: author(parent.created_by),
        text: messageText(parent),
      },
    });
  }

  return items
    .map(item => ({
      ...item,
      mine: item.authorId === userId,
    }))
    .sort(
      (a, b) =>
        new Date(a.date) - new Date(b.date) ||
        a.key.localeCompare(b.key),
    );
}

export default function InternalChat({
  module,
  records = [],
  interactions = [],
  employees = [],
  userId,
  isManager,
  onCreate,
  onInteract,
  onDelete,
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newMessages, setNewMessages] = useState(false);

  const list = useRef(null);
  const input = useRef(null);
  const locked = useRef(false);
  const nearBottom = useRef(true);
  const forceBottom = useRef(true);
  const chatTools = useChatTools({
  draft,
  setDraft,
  input,
  employees,
  busy,
});

  const messages = useMemo(
    () =>
      chatMessages(
        records,
        interactions,
        employees,
        userId,
      ),
    [records, interactions, employees, userId],
  );

  const search = query.trim().toLowerCase();

  const visible = messages.filter(item =>
    `${item.author} ${item.text}`
      .toLowerCase()
      .includes(search),
  );

  const tail = visible.at(-1)?.key;

  useEffect(() => {
    const element = list.current;
    if (!element) return;

    if (forceBottom.current || nearBottom.current) {
      element.scrollTop = element.scrollHeight;
      forceBottom.current = false;
      setNewMessages(false);
    } else {
      setNewMessages(true);
    }
  }, [tail, visible.length, query]);

  async function send(event) {
    event.preventDefault();

    const text = draft.trim();

    if (!text || locked.current) return;

    if (!navigator.onLine) {
      setError(
        "Connect to the internet before sending.",
      );
      return;
    }

    locked.current = true;
    setBusy(true);
    setError("");

    try {
      let saved;

      if (replyTo) {
        const parent = records.find(
          record => record.id === replyTo.id,
        );

        if (!parent || closed(parent)) {
          throw new Error(
            "That conversation is closed or unavailable. Cancel the reply to send a new message.",
          );
        }

        saved = await onInteract(
          parent.id,
          "comment",
          text,
          null,
        );
      } else {
        saved = await onCreate(module, event);
      }

      if (!saved) {
        throw new Error(
          "Message could not be sent. Your text is still here; try again.",
        );
      }

      setDraft("");
      setReplyTo(null);
      setEmojiOpen(false);
      setQuery("");

      forceBottom.current = true;
      nearBottom.current = true;
      setNewMessages(false);

      if (list.current) {
        list.current.scrollTop =
          list.current.scrollHeight;
      }

      window.requestAnimationFrame(() =>
        input.current?.focus(),
      );
    } catch (failure) {
      setError(
        failure.message || "Message could not be sent.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function startReply(item) {
    if (busy || closed(item.record)) return;

    setReplyTo(item.record);
    setError("");
    input.current?.focus();
  }

  function jumpToLatest() {
    setQuery("");
    forceBottom.current = true;

    if (list.current) {
      list.current.scrollTop =
        list.current.scrollHeight;
    }

    nearBottom.current = true;
    setNewMessages(false);
  }

  return (
    <section
      className="legion-chat"
      aria-label="Internal chat"
    >
      <header className="lc-header">
        <span className="lc-room-icon">
          <MessageSquare size={23} />
        </span>

        <div className="lc-heading">
          <h1>Internal chat</h1>
          <p>Company conversation</p>
        </div>

        <span className="lc-room-label">
          TEAM SPACE
        </span>
      </header>

      <div className="lc-toolbar">
        <label className="lc-search">
          <Search size={17} />

          <input
            aria-label="Search loaded chat messages"
            placeholder="Search messages or names"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              forceBottom.current = true;
            }}
          />

          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                forceBottom.current = true;
              }}
            >
              <X size={15} />
            </button>
          )}
        </label>

        <small>
          {search
            ? `${visible.length} matches`
            : `${messages.length} loaded messages`}
        </small>
      </div>

      <div className="lc-feed-wrap">
        <div
          ref={list}
          className="lc-feed"
          aria-label="Conversation messages"
          onScroll={() => {
            const element = list.current;

            nearBottom.current =
              element.scrollHeight -
                element.scrollTop -
                element.clientHeight <
              90;

            if (nearBottom.current) {
              setNewMessages(false);
            }
          }}
        >
          {!visible.length && (
            <div className="lc-empty">
              <MessageSquare size={34} />

              <h2>
                {search
                  ? "No matching messages"
                  : "Start the conversation"}
              </h2>

              <p>
                {search
                  ? "Try another name or phrase. Search covers loaded messages."
                  : "Share an update, ask a question, or say hello to your team."}
              </p>
            </div>
          )}

          {visible.map((item, index) => {
            const date = new Date(item.date);
            const valid = Number.isFinite(
              date.getTime(),
            );

            const day = valid
              ? calendar.format(date)
              : "Date unavailable";

            const previous = visible[index - 1];

            const previousDate =
              previous && new Date(previous.date);

            const previousDay =
              previousDate &&
              Number.isFinite(previousDate.getTime())
                ? calendar.format(previousDate)
                : "";

            return (
              <Fragment key={item.key}>
                {day !== previousDay && (
                  <div className="lc-day">
                    <span>{day}</span>
                  </div>
                )}

                <article
                  id={
                    item.original
                      ? `workplace-${item.record.id}`
                      : `chat-${item.key}`
                  }
                  className={
                    `lc-message${item.mine ? " lc-mine" : ""}`
                  }
                >
                  {!item.mine && (
                    <div className="lc-avatar">
                      <EmployeeAvatar
                        employeeId={item.authorId}
                        name={item.author}
                      />
                    </div>
                  )}

                  <div className="lc-bubble">
                    <strong className="lc-author">
                      {item.mine ? "You" : item.author}
                    </strong>

                    {item.record.visibility ===
                      "private" && (
                      <span className="lc-private">
                        Private conversation · managers
                        can view
                      </span>
                    )}

                    {item.quote && (
                      <div className="lc-quote">
                        <strong>
                          {item.quote.author}
                        </strong>
                        <span>{item.quote.text}</span>
                      </div>
                    )}

 <p className="lc-body">
  <MentionText
    text={item.text}
    employees={employees}
  />
</p>

                    <footer className="lc-message-footer">
                      {!closed(item.record) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            startReply(item)
                          }
                          aria-label={
                            `Reply to ${
                              item.original
                                ? item.author
                                : "this conversation"
                            }`
                          }
                        >
                          <Reply size={14} />
                          Reply
                        </button>
                      )}

                      {item.original &&
                        isManager &&
                        onDelete && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              onDelete(item.record)
                            }
                            aria-label="Delete message"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}

                      <time
                        dateTime={
                          valid
                            ? date.toISOString()
                            : undefined
                        }
                      >
                        {valid
                          ? clock.format(date)
                          : ""}
                      </time>

                      {item.mine && (
                        <span
                          className="lc-saved"
                          title="Saved to Legion"
                        >
                          <Check
                            size={14}
                            aria-label="Saved to Legion"
                          />
                        </span>
                      )}
                    </footer>
                  </div>
                </article>
              </Fragment>
            );
          })}
        </div>

        {newMessages && (
          <button
            type="button"
            className="lc-new"
            onClick={jumpToLatest}
          >
            <ArrowDown size={15} />
            New messages
          </button>
        )}
      </div>

      <form className="lc-composer" onSubmit={send}>
        <input
          type="hidden"
          name="title"
          value={draft
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 160)}
        />

        <input
          type="hidden"
          name="status"
          value="open"
        />

        <input
          type="hidden"
          name="visibility"
          value="company"
        />

        {replyTo && (
          <div className="lc-reply-preview">
            <Reply size={16} />

            <div>
              <strong>
                Replying to{" "}
                {employees.find(
                  person =>
                    person.id === replyTo.created_by,
                )?.display_name || "Employee"}
                {replyTo.visibility === "private"
                  ? " · Private"
                  : ""}
              </strong>

              <span>{messageText(replyTo)}</span>
            </div>

            <button
              type="button"
              disabled={busy}
              aria-label="Cancel reply"
              onClick={() => setReplyTo(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {error && (
          <p className="lc-error" role="alert">
            {error}
          </p>
        )}

<ChatTools
  tools={chatTools}
  emojiOpen={emojiOpen}
  busy={busy}
/>

        <div className="lc-compose-row">
          <button
            type="button"
            className="lc-emoji-toggle"
            disabled={busy}
            aria-label="Choose emoji"
            aria-expanded={emojiOpen}
            onClick={() =>
              setEmojiOpen(value => !value)
            }
          >
            <Smile size={22} />
          </button>

          <textarea
  ref={input}
  name="description"
  rows={2}
  maxLength={2000}
  required
  disabled={busy}
  aria-label="Message"
  aria-controls={
    chatTools.open ? "lc-mention-list" : undefined
  }
  aria-activedescendant={
    chatTools.open && chatTools.suggestions.length
      ? `lc-mention-${chatTools.selected}`
      : undefined
  }
  placeholder={
    replyTo
      ? "Write your reply…"
      : "Message your team… Type @ to mention someone"
  }
  value={draft}
  onChange={chatTools.change}
  onSelect={chatTools.select}
  onKeyDown={event => {
    chatTools.keyDown(event);

    if (event.defaultPrevented) return;

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      !event.repeat
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }}
/>

          <button
            type="submit"
            className="lc-send"
            disabled={busy || !draft.trim()}
            aria-label={
              busy
                ? "Sending message"
                : "Send message"
            }
          >
            {busy ? (
              <LoaderCircle
                className="lc-spin"
                size={21}
              />
            ) : (
              <Send size={21} />
            )}
          </button>
        </div>

        <small className="lc-compose-hint">
          {busy
            ? "Sending…"
            : replyTo?.visibility === "private"
              ? "This reply stays in the private conversation."
              : "Company messages are shared with employees who have chat access."}

          <span>{draft.length}/2000</span>
        </small>
      </form>
    </section>
  );
}