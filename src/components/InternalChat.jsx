import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Trash2,
  X,
} from "lucide-react";

import {
  ChatAvatar as EmployeeAvatar,
  ChatSignalsProvider,
  ChatPreviewTicks,
} from "./ChatSignals.jsx";
import ChatTools, {
  MentionText,
  useChatTools,
} from "./ChatTools.jsx";
import ChatRoomSettings, {
  ChatGroupIcon,
} from "./ChatRoomSettings.jsx";
import VoiceRecorder, {
  VoiceMessage,
} from "./ChatVoice.jsx";

import { supabase } from "../lib/supabase.js";
import {
  chatCall,
  chatListPreview,
  chatId,
  chatRequest,
  messageStatus,
  readableMessageIds,
  useChatInbox,
  useChatPage,
} from "../lib/companyChat.js";
import { uploadChatVoice } from "../lib/groupChat.js";
import "./company-chat.css";

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

function dateText(value, formatter = clock) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? formatter.format(date)
    : "";
}

export function roomTitle(room, people, userId) {
  if (room.kind !== "direct") {
    return room.name || "Group";
  }

  return (
    room.member_ids
      .filter(id => id !== userId)
      .map(
        id =>
          people.get(id)?.display_name ||
          "Former employee",
      )
      .join(" & ") || "Former employee"
  );
}

export default function InternalChat(props) {
  return props.userId ? (
    <CompanyChat key={props.userId} {...props} />
  ) : (
    <p>Please sign in to open chat.</p>
  );
}

function CompanyChat({
  userId,
  employees = [],
  records = [],
  interactions = [],
}) {
  const inbox = useChatInbox(userId);

  const [selected, setSelected] = useState("");
  const [awaiting, setAwaiting] = useState("");
  const [tab, setTab] = useState("chats");
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});
  const [outbox, setOutbox] = useState([]);

  const locks = useRef(new Set());
  const alive = useRef(true);
  const chatRoot = useRef(null);

  useEffect(() => {
    try {
      const size = localStorage.getItem(
        `td-chat-text-size:${userId}`,
      );

      if (["14", "16", "18"].includes(size)) {
        chatRoot.current?.style.setProperty(
          "--td-chat-message-size",
          `${size}px`,
        );
      }
    } catch {
      // Text sizing remains available for this session.
    }
  }, [userId]);

  const reconcile = useCallback(ids => {
    setOutbox(previous => {
      const next = previous.filter(
        item => !ids.includes(item.client_id),
      );

      return next.length === previous.length
        ? previous
        : next;
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const people = useMemo(
    () =>
      new Map(
        employees.map(person => [person.id, person]),
      ),
    [employees],
  );

  const room = inbox.rooms.find(
    item => item.room_id === selected,
  );

  const admin = inbox.role === "admin";
  const canCreate = ["manager", "admin"].includes(
    inbox.role,
  );
  const search = query.trim().toLowerCase();

  const rooms = inbox.rooms
    .filter(item =>
      tab === "review"
        ? !item.is_member && admin
        : item.is_member,
    )
    .filter(item =>
      `${roomTitle(item, people, userId)} ${
        item.last_body || ""
      }`
        .toLowerCase()
        .includes(search),
    );

  const contacts = employees
    .filter(
      person =>
        person.id !== userId &&
        `${person.display_name} ${
          person.job_title || ""
        }`
          .toLowerCase()
          .includes(search),
    )
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );

  const legacy = useMemo(() => {
    const originals = records.filter(
      record =>
        record.module_id === "collaboration.chat" &&
        record.visibility === "company",
    );

    const ids = new Set(
      originals.map(record => record.id),
    );

    return [
      ...originals.map(record => ({
        id: record.id,
        sender_id: record.created_by,
        body: record.description || record.title,
        created_at: record.created_at,
      })),
      ...interactions
        .filter(
          item =>
            item.kind === "comment" &&
            ids.has(item.record_id),
        )
        .map(item => ({
          id: item.id,
          sender_id: item.employee_id,
          body: item.body,
          created_at: item.created_at,
        })),
    ].sort(
      (a, b) =>
        new Date(a.created_at) -
        new Date(b.created_at),
    );
  }, [records, interactions]);

  useEffect(() => {
    if (
      awaiting &&
      inbox.rooms.some(
        item => item.room_id === awaiting,
      )
    ) {
      setSelected(awaiting);
      setAwaiting("");
      return;
    }

    if (awaiting) return;

    if (
      !selected &&
      window.matchMedia("(min-width: 760px)").matches
    ) {
      const company = inbox.rooms.find(
        item => item.kind === "company",
      );

      if (company) setSelected(company.room_id);
    }

    if (
      selected &&
      selected !== "archive" &&
      !inbox.loading &&
      !inbox.error &&
      !room
    ) {
      setSelected("");
    }
  }, [
    inbox.rooms,
    inbox.loading,
    inbox.error,
    room,
    selected,
    awaiting,
  ]);

  async function openPerson(person) {
    if (opening) return;

    setOpening(true);
    setError("");

    try {
      const id = await chatCall(
        userId,
        "td_chat_open_direct",
        { p_employee_id: person.id },
      );

      if (alive.current) {
        setAwaiting(id);
        setTab("chats");
        inbox.refresh();
      }
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      if (alive.current) setOpening(false);
    }
  }

  async function transmit(item) {
    if (locks.current.has(item.room_id)) return;

    locks.current.add(item.room_id);

    setOutbox(previous =>
      previous.map(row =>
        row.client_id === item.client_id
          ? {
              ...row,
              failed: false,
              saved: false,
              blocked: false,
            }
          : row,
      ),
    );

    try {
      if (item.kind === "voice") {
        await uploadChatVoice(userId, item);
      } else {
        await chatCall(userId, "td_chat_send", {
          p_room: item.room_id,
          p_body: item.body,
          p_client_id: item.client_id,
        });
      }

      if (alive.current) {
        setOutbox(previous =>
          previous.map(row =>
            row.client_id === item.client_id
              ? { ...row, saved: true }
              : row,
          ),
        );
        inbox.refresh();
      }
    } catch (failure) {
      const blocked = failure.message?.includes(
        "TD_CHAT_BLOCKED",
      );
      if (blocked) inbox.refresh();
      if (alive.current) {
        setOutbox(previous =>
          previous.map(row =>
            row.client_id === item.client_id
              ? {
                  ...row,
                  failed: !blocked,
                  blocked,
                  error: blocked
                    ? "Blocked · This message was not delivered."
                    : failure.message,
                }
              : row,
          ),
        );
      }
    } finally {
      locks.current.delete(item.room_id);
    }
  }

  function send(text, voice = null) {
    if (
      !room?.is_member ||
      room.blocked_by_me ||
      locks.current.has(room.room_id)
    ) {
      return false;
    }

    const item = {
      id: chatId(),
      client_id: chatId(),
           room_id: room.room_id,
      preview_after_id:
        room.chat_last_message?.id || null,
      preview_after_at:
        room.last_at || null,
      sender_id: userId,
      body: text,
      created_at: new Date().toISOString(),
      local: true,
      kind: voice ? "voice" : "text",
      blob: voice?.blob,
      duration_ms: voice?.duration_ms,
    };

    setOutbox(previous => [...previous, item]);

    if (!voice) {
      setDrafts(previous => ({
        ...previous,
        [room.room_id]: "",
      }));
    }

    transmit(item);
    return true;
  }

  const active =
    selected === "archive" || Boolean(room);

  return (
    <ChatSignalsProvider
      userId={userId}
      rooms={inbox.rooms}
    >
    <section
      ref={chatRoot}
      className={`td-chat${
        active ? " td-chat-open" : ""
      }`}
      aria-label="Company chat"
    >
      <aside className="td-chat-sidebar">
        <header className="td-chat-top">
          <div>
            <small>TECH DEV WORKSPACE</small>
            <h1>Messages</h1>
          </div>

          {canCreate && (
            <button
              type="button"
              className="td-chat-icon"
              aria-label="Create group"
              title="Create group"
              onClick={() => setGroupOpen(true)}
            >
              <Plus size={20} />
            </button>
          )}

          <button
            type="button"
            className="td-chat-icon"
            aria-label="Refresh chats"
            onClick={inbox.refresh}
          >
            <RefreshCw size={17} />
          </button>
        </header>

        <div
          className="td-chat-tabs"
          role="group"
          aria-label="Chat lists"
        >
          {[
            ["chats", "Chats"],
            ["people", "People"],
            ...(admin
              ? [["review", "Admin review"]]
              : []),
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                setQuery("");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="td-chat-search">
          <Search size={17} />
          <input
            value={query}
            onChange={event =>
              setQuery(event.target.value)
            }
            placeholder={
              tab === "people"
                ? "Find a colleague"
                : "Find a conversation"
            }
            aria-label="Search chat list"
          />
        </label>

        {(error || inbox.error) && (
          <p className="td-chat-error" role="alert">
            {error || inbox.error}
          </p>
        )}

        <div className="td-chat-list">
          {inbox.loading && (
            <p className="td-chat-empty">
              Loading your conversations…
            </p>
          )}

          {tab === "people"
            ? contacts.map(person => (
                <article
                  className="td-chat-contact"
                  key={person.id}
                >
                  <EmployeeAvatar
                    employeeId={person.id}
                    name={person.display_name}
                  />

                  <button
                    type="button"
                    className="td-chat-contact-main"
                    disabled={opening}
                    onClick={() =>
                      openPerson(person)
                    }
                  >
                    <strong>
                      {person.display_name}
                    </strong>
                    <span>
                      {person.job_title || "Employee"}
                    </span>
                  </button>

                  <MessageSquare
                    size={17}
                    aria-hidden="true"
                  />
                </article>
              ))
            : rooms.map(item => {
              const preview = chatListPreview(
                  item,
                  outbox,
                  userId
                );
                const title = roomTitle(
                  item,
                  people,
                  userId,
                );

                const other =
                  item.kind === "direct" &&
                  item.member_ids.find(
                    id => id !== userId,
                  );

                return (
                  <article
                    className={`td-chat-contact${
                      selected === item.room_id
                        ? " is-active"
                        : ""
                    }`}
                    key={item.room_id}
                  >
                    {other ? (
                      <EmployeeAvatar
                        employeeId={other}
                        name={
                          people.get(other)
                            ?.display_name
                        }
                      />
                    ) : (
                      <ChatGroupIcon room={item} />
                    )}

                    <button
                      type="button"
                      className="td-chat-contact-main"
                      aria-current={
                        selected === item.room_id
                          ? "true"
                          : undefined
                      }
                      onClick={() =>
                        setSelected(item.room_id)
                      }
                    >
                      <strong>{title}</strong>
                       <span className="td-chat-list-preview">
                        <ChatPreviewTicks
                          message={preview.message}
                        />

                        <span className="td-chat-preview-text">
                          {preview.text}
                        </span>
                      </span>
                    </button>

                    <div className="td-chat-contact-meta">
                      <time>
                        {dateText(preview.at)}
                      </time>

                      {Number(item.unread) > 0 && (
                        <b
                          aria-label={`${item.unread} unread messages`}
                        >
                          {Number(item.unread) > 99
                            ? "99+"
                            : item.unread}
                        </b>
                      )}
                    </div>
                  </article>
                );
              })}

          {!inbox.loading &&
            !(tab === "people"
              ? contacts.length
              : rooms.length) && (
              <p className="td-chat-empty">
                {tab === "review"
                  ? "No other conversations to review."
                  : "No matches. Open People to start a conversation."}
              </p>
            )}
        </div>

        <footer className="td-chat-sidebar-footer">
          <span
            className={
              inbox.live ? "td-chat-live" : ""
            }
          >
            {inbox.live
              ? "Live updates"
              : "Checking for updates every 15 seconds"}
          </span>

          {legacy.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected("archive")}
            >
              Earlier company chat
            </button>
          )}
        </footer>
      </aside>

      {selected === "archive" ? (
        <section className="td-chat-room">
          <header className="td-chat-room-header">
            <button
              type="button"
              className="td-chat-icon td-chat-back"
              aria-label="Back to chats"
              onClick={() => setSelected("")}
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <h2>Earlier company chat</h2>
              <small>
                Previously loaded shared messages ·
                read-only
              </small>
            </div>
          </header>

          <div className="td-chat-feed">
            {legacy.map(message => (
              <article
                className="td-chat-message"
                key={message.id}
              >
                <EmployeeAvatar
                  employeeId={message.sender_id}
                />
                <div className="td-chat-bubble">
                  <strong>
                    {people.get(message.sender_id)
                      ?.display_name ||
                      "Former employee"}
                  </strong>
                  <p>
                    <MentionText
                      text={message.body}
                      employees={employees}
                    />
                  </p>
                  <small>
                    {dateText(
                      message.created_at,
                      calendar,
                    )}
                    {" · "}
                    {dateText(message.created_at)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : room ? (
        <RoomPane
          key={room.room_id}
          room={room}
          userId={userId}
          employees={employees}
          people={people}
          admin={admin}
          revision={inbox.revision}
          refresh={inbox.refresh}
          onBack={() => setSelected("")}
          draft={drafts[room.room_id] || ""}
          setDraft={value =>
            setDrafts(previous => ({
              ...previous,
              [room.room_id]:
                typeof value === "function"
                  ? value(
                      previous[room.room_id] || "",
                    )
                  : value,
            }))
          }
          pending={outbox.filter(
            item => item.room_id === room.room_id,
          )}
          onSend={send}
          onVoice={voice =>
            send("Voice note", voice)
          }
          onRetry={transmit}
          onLoaded={reconcile}
        />
      ) : (
        <div className="td-chat-welcome">
          <MessageSquare size={44} />
          <h2>Your team, connected</h2>
          <p>
            Choose a conversation or open People
            to message a colleague.
          </p>
          <span>
            <ShieldCheck size={15} />
            Company admins can review workplace chats.
          </span>
        </div>
      )}

      {groupOpen && (
        <GroupDialog
          userId={userId}
          employees={employees}
          onClose={() => setGroupOpen(false)}
          onCreated={id => {
            setGroupOpen(false);
            setAwaiting(id);
            setTab("chats");
            inbox.refresh();
          }}
        />
      )}
    </section>
     </ChatSignalsProvider>
  );
}

function RoomPane({
  room,
  userId,
  employees,
  people,
  admin,
  revision,
  refresh,
  onBack,
  draft,
  setDraft,
  pending,
  onSend,
  onVoice,
  onRetry,
  onLoaded,
}) {
  const [pages, setPages] = useState([null]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [unseen, setUnseen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const before = pages.at(-1);

  const page = useChatPage(
    userId,
    room.room_id,
    before,
    revision,
    searchTerm,
  );

  const feed = useRef(null);
  const input = useRef(null);
  const nearBottom = useRef(true);
  const lockedRead = useRef(false);
  const menu = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(search.trim());
      setPages([null]);
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    function close(event) {
      if (
        menu.current &&
        !menu.current.contains(event.target)
      ) {
        menu.current.open = false;
      }
    }

    function escape(event) {
      if (
        event.key === "Escape" &&
        menu.current?.open
      ) {
        menu.current.open = false;
        menu.current
          .querySelector("summary")
          ?.focus();
      }
    }

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        close,
      );
      document.removeEventListener(
        "keydown",
        escape,
      );
    };
  }, []);

  function action(callback) {
    if (menu.current) menu.current.open = false;
    callback();
  }

  const newest = page.rows.at(-1)?.id;

  const local = before
    ? []
    : pending.filter(
        item =>
          !page.rows.some(
            row =>
              row.client_id === item.client_id,
          ),
      );

  const busy = pending.some(
    item =>
      !item.failed &&
      !item.saved &&
      !item.blocked,
  );

  const tools = useChatTools({
    draft,
    setDraft,
    input,
    employees,
    busy,
  });

  const title = roomTitle(room, people, userId);

  const other =
    room.kind === "direct" &&
    room.member_ids.find(id => id !== userId);

  useEffect(() => {
    onLoaded(page.rows.map(row => row.client_id));
  }, [page.rows, onLoaded]);

  useEffect(() => {
    if (before) {
      if (feed.current) feed.current.scrollTop = 0;
      return;
    }

    if (nearBottom.current && feed.current) {
      feed.current.scrollTop =
        feed.current.scrollHeight;
      setUnseen(false);
    } else {
      setUnseen(true);
    }
  }, [newest, before, local.length]);

  useEffect(() => {
    let alive = true;

    async function markVisible() {
      if (
        !room.is_member ||
        lockedRead.current
      ) {
        return;
      }

      const ids = readableMessageIds(
        feed.current,
        page.rows,
        userId,
      );

      if (!ids.length) return;

      lockedRead.current = true;

      try {
        await chatCall(userId, "td_chat_ack", {
          p_message_ids: ids,
          p_read: true,
        });

        if (alive) refresh();
      } catch {
        // Retry while the conversation is visible.
      } finally {
        lockedRead.current = false;
      }
    }

    const timer = setInterval(markVisible, 1000);
    markVisible();

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [
    room.is_member,
    userId,
    page.rows,
    refresh,
  ]);

  function jumpLatest() {
    setPages([null]);
    setSearch("");
    setSearchTerm("");
    setSearchOpen(false);
    nearBottom.current = true;

    if (feed.current) {
      feed.current.scrollTop =
        feed.current.scrollHeight;
    }

    setUnseen(false);
  }

  function closeDetails() {
    setDetails(null);
    menu.current
      ?.querySelector("summary")
      ?.focus();
  }

  return (
    <section
      className="td-chat-room"
      aria-label={title}
    >
      <header className="td-chat-room-header">
        <button
          type="button"
          className="td-chat-icon td-chat-back"
          aria-label="Back to chats"
          onClick={onBack}
        >
          <ArrowLeft size={19} />
        </button>

        {other ? (
          <EmployeeAvatar
            employeeId={other}
            name={people.get(other)?.display_name}
          />
        ) : (
          <ChatGroupIcon room={room} />
        )}

        <button
          type="button"
          className="td-chat-room-title"
          onClick={() =>
            setDetails({ kind: "members" })
          }
        >
          <h2>{title}</h2>
          <span>
            {room.kind === "direct"
              ? "Direct conversation"
              : `${room.member_ids.length} members`}
            {" · View details"}
          </span>
        </button>

        <details
          ref={menu}
          className="td-chat-menu"
        >
          <summary
            className="td-chat-icon"
            aria-label="Conversation menu"
          >
            <MoreVertical size={21} />
          </summary>

          <div>
            <button
              type="button"
              onClick={() =>
                action(() =>
                  setDetails({ kind: "members" }),
                )
              }
            >
              {room.kind === "direct"
                ? "Contact details"
                : "Group details"}
            </button>

            <button
              type="button"
              onClick={() =>
                action(() => setSearchOpen(true))
              }
            >
              Search messages
            </button>

            <button
              type="button"
              onClick={() => action(jumpLatest)}
            >
              Jump to latest
            </button>

            <button
              type="button"
              onClick={() =>
                action(() =>
                  setDetails({ kind: "settings" }),
                )
              }
            >
              Settings
            </button>

            <button
              type="button"
              onClick={() => action(refresh)}
            >
              Refresh conversation
            </button>
          </div>
        </details>
      </header>

      {searchOpen && (
        <div className="td-chat-message-search">
          <Search size={17} />
          <input
            autoFocus
            maxLength={120}
            value={search}
            onChange={event =>
              setSearch(event.target.value)
            }
            aria-label="Search this conversation"
            placeholder="Search this conversation"
          />
          <button
            type="button"
            className="td-chat-icon"
            aria-label="Close message search"
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}

      <div className="td-chat-disclosure">
        <ShieldCheck size={14} />
        <span>
          {room.is_member
            ? "Participants and company admins can access this conversation."
            : "Admin review · Read-only. Your visit does not mark messages as read."}
        </span>
      </div>

      <div className="td-chat-pagination">
        <button
          type="button"
          disabled={!page.more || page.loading}
          onClick={() => {
            setPages(previous => [
              ...previous,
              page.rows[0],
            ]);
            nearBottom.current = false;
          }}
        >
          <ChevronLeft size={15} />
          Earlier
        </button>

        <span>
          {searchTerm
            ? "Search results"
            : before
              ? "Earlier messages"
              : "Latest messages"}
        </span>

        {before ? (
          <>
            <button
              type="button"
              onClick={() =>
                setPages(previous =>
                  previous.slice(0, -1),
                )
              }
            >
              Newer
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={jumpLatest}
            >
              Latest
            </button>
          </>
        ) : (
          <small>50 per page</small>
        )}
      </div>

      {page.error && (
        <p className="td-chat-error" role="alert">
          {page.error}
          <button
            type="button"
            onClick={refresh}
          >
            Retry
          </button>
        </p>
      )}

      <div className="td-chat-feed-wrap">
        <div
          className="td-chat-feed"
          ref={feed}
          aria-label="Messages"
          onScroll={() => {
            const node = feed.current;

            nearBottom.current =
              node.scrollHeight -
                node.scrollTop -
                node.clientHeight <
              90;

            if (nearBottom.current) {
              setUnseen(false);
            }
          }}
        >
          {page.loading && (
            <p className="td-chat-empty">
              Loading messages…
            </p>
          )}

          {!page.loading &&
            !page.rows.length &&
            !local.length && (
              <div className="td-chat-empty">
                <MessageSquare size={32} />
                <p>Start the conversation.</p>
              </div>
            )}

          {[...page.rows, ...local].map(
            (message, index, all) => {
              const day = dateText(
                message.created_at,
                calendar,
              );
              const mine =
                message.sender_id === userId;
              const author =
                people.get(message.sender_id)
                  ?.display_name ||
                "Former employee";
              const status = messageStatus(message);

              return (
                <Fragment
                  key={message.client_id}
                >
                  {day !==
                    dateText(
                      all[index - 1]?.created_at,
                      calendar,
                    ) && (
                    <div className="td-chat-day">
                      <span>{day}</span>
                    </div>
                  )}

                  <article
                    className={`td-chat-message${
                      mine ? " is-mine" : ""
                    }`}
                    data-chat-message={message.id}
                  >
                    {!mine && (
                      <EmployeeAvatar
                        employeeId={message.sender_id}
                        name={author}
                      />
                    )}

                    <div
                      className={`td-chat-bubble${
                        message.deleted_at
                          ? " is-deleted"
                          : ""
                      }`}
                    >
                      {!mine && (
                        <strong>{author}</strong>
                      )}

                      {message.kind === "voice" &&
                      !message.deleted_at ? (
                        <VoiceMessage
                          message={message}
                        />
                      ) : (
                        <p>
                          <MentionText
                            text={message.body}
                            employees={employees}
                          />
                        </p>
                      )}

                      <footer>
                        {!message.local &&
                          !message.deleted_at &&
                          room.is_member && (
                            <>
                              {mine &&
                                message.kind !==
                                  "voice" && (
                                  <button
                                    type="button"
                                    aria-label="Edit message"
                                    onClick={() =>
                                      setDetails({
                                        kind: "edit",
                                        message,
                                      })
                                    }
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}

                              {(mine || admin) && (
                                <button
                                  type="button"
                                  aria-label="Delete message"
                                  onClick={() =>
                                    setDetails({
                                      kind: "delete",
                                      message,
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          )}

                        <time
                          dateTime={message.created_at}
                        >
                          {message.edited_at
                            ? "Edited · "
                            : ""}
                          {dateText(
                            message.created_at,
                          )}
                        </time>

                        {mine && (
                          <button
                            type="button"
                            className={`td-chat-ticks ${status}`}
                            aria-label={
                              status === "read"
                                ? `Read by ${message.seen} of ${message.recipients}`
                                : status
                            }
                            title={status}
                            disabled={Boolean(
                              message.local,
                            )}
                            onClick={() =>
                              setDetails({
                                kind: "receipts",
                                message,
                              })
                            }
                          >
                            {status === "blocked" ? (
                              <span
                                className="td-chat-blocked-ticks"
                                aria-hidden="true"
                              >
                                <Check size={17} />
                                <Check size={17} />
                                <Check size={17} />
                              </span>
                            ) : status ===
                              "sending" ? (
                              <Clock3 size={15} />
                            ) : status === "read" ||
                              status ===
                                "delivered" ? (
                              <CheckCheck size={18} />
                            ) : status ===
                              "failed" ? (
                              <X size={16} />
                            ) : (
                              <Check size={17} />
                            )}
                          </button>
                        )}
                      </footer>

                      {(message.failed ||
                        message.blocked) && (
                        <div
                          className="td-chat-send-error"
                          role="alert"
                        >
                          <span>
                            {message.error ||
                              "Message could not be sent."}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              onRetry(message)
                            }
                          >
                            Retry send
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                </Fragment>
              );
            },
          )}
        </div>

        {unseen && !before && (
          <button
            type="button"
            className="td-chat-new"
            onClick={jumpLatest}
          >
            <ArrowDown size={16} />
            Latest messages
          </button>
        )}
      </div>

      {room.is_member && room.blocked_by_me && (
        <div className="td-chat-disclosure">
          You blocked this person. Open Settings
          from the three-dot menu to unblock.
        </div>
      )}

      {room.is_member && !room.blocked_by_me && (
        <form
          className="td-chat-composer"
          onSubmit={event => {
            event.preventDefault();

            if (draft.trim() && !busy) {
              onSend(draft.trim());
              setEmojiOpen(false);
              nearBottom.current = true;
              setPages([null]);
            }
          }}
        >
          <div className="legion-chat td-chat-tools-host">
            <ChatTools
              tools={tools}
              emojiOpen={emojiOpen}
              busy={busy}
            />
          </div>

          <div className="td-chat-compose-row">
            <button
              type="button"
              className="td-chat-icon"
              aria-label="Choose emoji"
              aria-expanded={emojiOpen}
              disabled={busy}
              onClick={() =>
                setEmojiOpen(value => !value)
              }
            >
              <Smile size={23} />
            </button>

            <textarea
              ref={input}
              rows={1}
              maxLength={2000}
              required
              disabled={busy}
              aria-label="Message"
              placeholder="Write a message…"
              value={draft}
              onChange={tools.change}
              onSelect={tools.select}
              aria-controls={
                tools.open
                  ? "lc-mention-list"
                  : undefined
              }
              aria-activedescendant={
                tools.open &&
                tools.suggestions.length
                  ? `lc-mention-${tools.selected}`
                  : undefined
              }
              onKeyDown={event => {
                tools.keyDown(event);

                if (
                  !event.defaultPrevented &&
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  !event.repeat
                ) {
                  event.preventDefault();
                  event.currentTarget.form
                    ?.requestSubmit();
                }
              }}
            />

            {draft.trim() || busy ? (
              <button
                type="submit"
                className="td-chat-send"
                disabled={
                  busy || !draft.trim()
                }
                aria-label="Send message"
              >
                {busy ? (
                  <LoaderCircle
                    className="spin"
                    size={20}
                  />
                ) : (
                  <Send size={20} />
                )}
              </button>
            ) : (
              <VoiceRecorder
                disabled={busy}
                onSend={voice => {
                  const accepted = onVoice(voice);

                  if (accepted) {
                    nearBottom.current = true;
                    setPages([null]);
                  }

                  return accepted;
                }}
              />
            )}
          </div>

          <small>
            Enter to send · Shift+Enter for a new line
            <span>{draft.length}/2000</span>
          </small>
        </form>
      )}

      {details && (
        <ChatDetails
          key={`${details.kind}:${
            details.message?.id || room.room_id
          }`}
          details={details}
          room={room}
          userId={userId}
          people={people}
          onClose={closeDetails}
          onSaved={refresh}
        />
      )}
    </section>
  );
}

function ChatDialog({
  title,
  busy = false,
  onClose,
  children,
}) {
  const dialog = useRef(null);

  useEffect(() => {
    const node = dialog.current;
    node.showModal();

    return () => {
      if (node.open) node.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="td-chat-dialog"
      aria-label={title}
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={event => {
        if (
          event.target === dialog.current &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="td-chat-icon"
          disabled={busy}
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function GroupDialog({
  userId,
  employees,
  onClose,
  onCreated,
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;

    locked.current = true;
    setBusy(true);
    setError("");

    try {
      const id = await chatCall(
        userId,
        "td_chat_create_group",
        {
          p_name: name.trim(),
          p_members: selected,
        },
      );

      onCreated(id);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    } finally {
      locked.current = false;
    }
  }

  return (
    <ChatDialog
      title="Create a group"
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label className="td-chat-field">
          Group name
          <input
            autoFocus
            value={name}
            maxLength={80}
            required
            disabled={busy}
            onChange={event =>
              setName(event.target.value)
            }
            placeholder="For example: Product team"
          />
        </label>

        <label className="td-chat-field">
          Find members
          <input
            type="search"
            value={search}
            disabled={busy}
            onChange={event =>
              setSearch(event.target.value)
            }
            placeholder="Search colleagues"
          />
        </label>

        <p className="td-chat-note">
          You are included automatically.{" "}
          {selected.length} colleagues selected.
        </p>

        <div className="td-chat-member-list">
          {employees
            .filter(
              person =>
                person.id !== userId &&
                person.display_name
                  .toLowerCase()
                  .includes(
                    search.toLowerCase(),
                  ),
            )
            .map(person => (
              <div
                className="td-chat-member"
                key={person.id}
              >
                <EmployeeAvatar
                  employeeId={person.id}
                  name={person.display_name}
                />

                <label>
                  <strong>
                    {person.display_name}
                  </strong>
                  <span>
                    {person.job_title ||
                      "Employee"}
                  </span>

                  <input
                    type="checkbox"
                    disabled={
                      busy ||
                      (!selected.includes(
                        person.id,
                      ) &&
                        selected.length >= 250)
                    }
                    checked={selected.includes(
                      person.id,
                    )}
                    onChange={event =>
                      setSelected(previous =>
                        event.target.checked
                          ? [
                              ...previous,
                              person.id,
                            ]
                          : previous.filter(
                              id =>
                                id !== person.id,
                            ),
                      )
                    }
                  />
                </label>
              </div>
            ))}
        </div>

        {error && (
          <p className="td-chat-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="td-chat-primary"
          disabled={
            busy ||
            !name.trim() ||
            !selected.length
          }
        >
          {busy ? "Creating…" : "Create group"}
        </button>
      </form>
    </ChatDialog>
  );
}

function ChatDetails({
  details,
  room,
  userId,
  people,
  onClose,
  onSaved,
}) {
  const { kind, message } = details;

  const [body, setBody] = useState(
    message?.body || "",
  );
  const [receipts, setReceipts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(
    kind === "receipts",
  );

  const locked = useRef(false);

  useEffect(() => {
    if (kind !== "receipts") return;

    let alive = true;

    (async () => {
      const rows = [];

      for (
        let offset = 0;
        ;
        offset += 500
      ) {
        const page = await chatRequest(
          supabase
            .from("td_chat_receipts")
            .select(
              "employee_id,delivered_at,read_at",
            )
            .eq("message_id", message.id)
            .order("employee_id")
            .range(offset, offset + 499),
        );

        rows.push(...page);
        if (page.length < 500) break;
      }

      if (alive) setReceipts(rows);
    })()
      .catch(failure => {
        if (alive) setError(failure.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [kind, message?.id]);

  async function save(event) {
    event.preventDefault();
    if (locked.current) return;

    locked.current = true;
    setBusy(true);
    setError("");

    try {
      await chatCall(
        userId,
        "td_chat_change_message",
        {
          p_message_id: message.id,
          p_body:
            kind === "edit"
              ? body.trim()
              : null,
          p_delete: kind === "delete",
        },
      );

      onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure.message?.includes(
          "TD_CHAT_BLOCKED",
        )
          ? "Messages cannot be edited while this conversation is blocked."
          : failure.message,
      );
      setBusy(false);
    } finally {
      locked.current = false;
    }
  }

  const title = {
    members: "Conversation details",
    settings: "Conversation settings",
    receipts: "Message delivery",
    edit: "Edit message",
    delete: "Delete message",
  }[kind];

  return (
    <ChatDialog
      title={title}
      busy={busy}
      onClose={onClose}
    >
      {kind === "settings" && (
        <ChatRoomSettings
          room={room}
          userId={userId}
          onChanged={onSaved}
          onBusy={setBusy}
        />
      )}

      {kind === "members" && (
        <>
          <p className="td-chat-note">
            {room.kind === "company"
              ? "Every employee joins this group automatically."
              : "Conversation participants"}
            {" Company admins can review messages."}
          </p>

          <div className="td-chat-member-list">
            {room.member_ids.map(id => (
              <div
                className="td-chat-member"
                key={id}
              >
                <EmployeeAvatar
                  employeeId={id}
                  name={
                    people.get(id)?.display_name
                  }
                />
                <div>
                  <strong>
                    {people.get(id)
                      ?.display_name ||
                      "Former employee"}
                  </strong>
                  <span>
                    {people.get(id)?.job_title ||
                      "Employee"}
                    {id === userId
                      ? " · You"
                      : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {kind === "receipts" && (
        <>
          {loading ? (
            <p className="td-chat-note">
              Loading receipts…
            </p>
          ) : (
            <>
              <p className="td-chat-note">
                Read{" "}
                {
                  receipts.filter(
                    row => row.read_at,
                  ).length
                }
                /{receipts.length}
                {" · Delivered "}
                {
                  receipts.filter(
                    row => row.delivered_at,
                  ).length
                }
                /{receipts.length}
              </p>

              <div className="td-chat-member-list">
                {receipts.map(row => (
                  <div
                    className="td-chat-member"
                    key={row.employee_id}
                  >
                    <EmployeeAvatar
                      employeeId={row.employee_id}
                      name={
                        people.get(
                          row.employee_id,
                        )?.display_name
                      }
                    />

                    <div>
                      <strong>
                        {people.get(
                          row.employee_id,
                        )?.display_name ||
                          "Former employee"}
                      </strong>
                      <span>
                        {row.read_at
                          ? `Read · ${dateText(
                              row.read_at,
                              calendar,
                            )} ${dateText(
                              row.read_at,
                            )}`
                          : row.delivered_at
                            ? `Delivered · ${dateText(
                                row.delivered_at,
                                calendar,
                              )} ${dateText(
                                row.delivered_at,
                              )}`
                            : "Awaiting delivery"}
                      </span>
                    </div>

                    {row.read_at ? (
                      <CheckCheck
                        className="td-chat-read"
                        size={18}
                      />
                    ) : row.delivered_at ? (
                      <CheckCheck size={18} />
                    ) : (
                      <Check size={17} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {["edit", "delete"].includes(kind) && (
        <form onSubmit={save}>
          {kind === "edit" ? (
            <label className="td-chat-field">
              Message
              <textarea
                autoFocus
                value={body}
                onChange={event =>
                  setBody(event.target.value)
                }
                required
                maxLength={2000}
                rows={5}
                disabled={busy}
              />
            </label>
          ) : (
            <p className="td-chat-note">
              This replaces the message with
              “Message deleted” for everyone.
            </p>
          )}

          <button
            type="submit"
            className={`td-chat-primary${
              kind === "delete"
                ? " is-danger"
                : ""
            }`}
            disabled={
              busy ||
              (kind === "edit" &&
                !body.trim())
            }
          >
            {busy
              ? "Saving…"
              : kind === "edit"
                ? "Save changes"
                : "Delete for everyone"}
          </button>
        </form>
      )}

      {error && (
        <p className="td-chat-error" role="alert">
          {error}
        </p>
      )}
    </ChatDialog>
  );
}