import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import EmployeeAvatar from "./EmployeeAvatar.jsx";
import { MentionText } from "./ChatTools.jsx";
import { supabase } from "../lib/supabase.js";
import { chatCall, chatId } from "../lib/companyChat.js";
import {
  checkChatMedia,
  mediaAccept,
  mediaBucket,
  splitChatLinks,
  uploadChatMedia,
} from "../lib/chatSharing.js";

import "./chat-sharing.css";

function SharingDialog({ title, busy = false, onClose, children }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialog.current.showModal();

    return () => {
      document.body.style.overflow = overflow;

      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      className="td-sharing-dialog"
      aria-label={title}
      onCancel={event => {
        event.preventDefault();
        if (!busy) close.current();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body
  );
}

export function ChatMessageText({ text, employees }) {
  return splitChatLinks(text).map((piece, index) =>
    piece.href ? (
      <a
        key={index}
        href={piece.href}
        target="_blank"
        rel="noopener noreferrer"
        className="td-message-link"
      >
        {piece.text}
      </a>
    ) : (
      <Fragment key={index}>
        <MentionText text={piece.text} employees={employees} />
      </Fragment>
    )
  );
}

function usePreview(file) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  return preview;
}

export function ChatMediaMessage({
  attachment,
  userId,
  expiresAt = null,
  serverOffset = 0,
}) {
  const frame = useRef(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState({ key: "", url: "", error: "" });
  const [retry, setRetry] = useState(0);
  const key = `${userId}:${attachment.path}`;

  useEffect(() => {
    if (!window.IntersectionObserver) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "240px" }
    );

    if (frame.current) observer.observe(frame.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;

    let alive = true;

    const sign = async () => {
      try {
        const seconds = expiresAt
          ? Math.min(
              60,
              Math.floor(
                (Date.parse(expiresAt) - Date.now() - serverOffset) / 1000
              )
            )
          : 300;

        if (seconds < 1) {
          throw new Error("This status has expired.");
        }

        const { data, error } = await supabase.storage
          .from(mediaBucket)
          .createSignedUrl(attachment.path, seconds);

        if (error) throw error;

        if (alive) {
          setState({ key, url: data.signedUrl, error: "" });
        }
      } catch (failure) {
        if (alive) {
          setState({
            key,
            url: "",
            error: failure.message || "Media could not load.",
          });
        }
      }
    };

    void sign();

    const timer = setInterval(sign, expiresAt ? 45_000 : 240_000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [visible, key, expiresAt, serverOffset, retry]);

  const current = state.key === key ? state : { url: "", error: "" };

  return (
    <figure ref={frame} className="td-shared-media">
      {current.error ? (
        <div>
          <p role="alert">{current.error}</p>
          <button
            type="button"
            onClick={() => setRetry(value => value + 1)}
          >
            Retry media
          </button>
        </div>
      ) : !current.url ? (
        <p role="status">Loading attachment…</p>
      ) : attachment.mime.startsWith("video/") ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={current.url}
          onError={() =>
            setState({
              key,
              url: "",
              error: "Video could not play. Try MP4 or reload the media.",
            })
          }
        />
      ) : (
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open full photo"
        >
          <img
            src={current.url}
            alt="Photo attachment"
            loading="lazy"
            onError={() =>
              setState({
                key,
                url: "",
                error: "Photo could not load. Retry the media.",
              })
            }
          />
        </a>
      )}
    </figure>
  );
}

export function ChatMediaUpload({ userId, roomId, disabled, onSent }) {
  const input = useRef(null);
  const lock = useRef(false);
  const uploadId = useRef("");

  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = usePreview(file);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={mediaAccept}
        hidden
        onChange={event => {
          const chosen = event.target.files?.[0];
          event.target.value = "";

          if (!chosen) return;

          try {
            checkChatMedia(chosen);
            uploadId.current = chatId();
            setFile(chosen);
            setCaption("");
            setError("");
          } catch (failure) {
            setError(failure.message);
          }
        }}
      />

      <button
        type="button"
        className="td-chat-icon"
        aria-label="Attach photo or video"
        title="Photo or video"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        <Paperclip size={21} />
      </button>

      {error && !file && (
        <span className="td-share-inline-error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            Dismiss
          </button>
        </span>
      )}

      {file && (
        <SharingDialog
          title="Send photo or video"
          busy={busy}
          onClose={() => setFile(null)}
        >
          <form
            onSubmit={async event => {
              event.preventDefault();

              if (lock.current) return;
              lock.current = true;

              setBusy(true);
              setError("");

              try {
                await uploadChatMedia(
                  userId,
                  uploadId.current,
                  file,
                  roomId
                );

                await chatCall(userId, "td_chat_media_send", {
                  p_upload: uploadId.current,
                  p_caption: caption,
                });

                setFile(null);
                onSent();
              } catch (failure) {
                setError(failure.message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              {preview && (
                <div className="td-upload-preview">
                  {file.type.startsWith("video/") ? (
                    <video
                      src={preview}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={preview} alt="Selected attachment" />
                  )}
                </div>
              )}

              <small>
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </small>

              <label>
                Caption (optional)
                <textarea
                  name="mediaCaption"
                  value={caption}
                  maxLength={2000}
                  onChange={event => setCaption(event.target.value)}
                />
              </label>

              {error && (
                <p className="td-sharing-error" role="alert">{error}</p>
              )}

              <button className="td-sharing-primary" type="submit">
                {busy ? "Uploading and sending…" : "Send attachment"}
              </button>
            </fieldset>
          </form>
        </SharingDialog>
      )}
    </>
  );
}

export function ChatDeleteMenu({
  userId,
  message,
  canDeleteEveryone,
  onDeleteEveryone,
  onChanged,
}) {
  const lock = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <button
        type="button"
        className="td-message-delete"
        aria-label="Delete message options"
        onClick={() => {
          setError("");
          setConfirm(true);
        }}
      >
        <Trash2 size={14} />
      </button>

      {confirm && (
        <SharingDialog
          title="Delete message"
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <p>
            Delete for me hides the message in your chat.
            Other participants keep their copy.
          </p>

          {error && (
            <p className="td-sharing-error" role="alert">{error}</p>
          )}

          <button
            className="td-sharing-primary"
            type="button"
            disabled={busy}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;

              setBusy(true);
              setError("");

              try {
                await chatCall(userId, "td_chat_hide_message", {
                  p_message: message.id,
                });

                setConfirm(false);
                onChanged();
              } catch (failure) {
                setError(failure.message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete for me"}
          </button>

          {canDeleteEveryone && !message.deleted_at && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirm(false);
                onDeleteEveryone();
              }}
            >
              Delete for everyone
            </button>
          )}
        </SharingDialog>
      )}
    </>
  );
}

export function ChatStatuses({ userId, employees = [] }) {
  const [open, setOpen] = useState(false);
  const [compose, setCompose] = useState(false);
  const [feed, setFeed] = useState({ posts: [], offset: 0 });
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [privacy, setPrivacy] = useState("everyone");
  const [audience, setAudience] = useState([]);
  const [viewers, setViewers] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now);

  const fileInput = useRef(null);
  const postId = useRef("");
  const uploadId = useRef("");
  const lock = useRef(false);
  const preview = usePreview(file);

  const posts = feed.posts.filter(
    post => Date.parse(post.expires_at) > now + feed.offset
  );

  const post = posts.find(row => row.id === selected);

  const name = id =>
    employees.find(person => person.id === id)?.display_name ||
    "Former employee";

  const own = posts.filter(row => row.employee_id === userId);
  const groups = new Map();

  for (const row of posts) {
    if (!groups.has(row.employee_id)) {
      groups.set(row.employee_id, []);
    }

    groups.get(row.employee_id).unshift(row);
  }

  const sequence = post ? groups.get(post.employee_id) : [];
  const index = sequence.findIndex(row => row.id === selected);

  const sharedAt = value =>
    new Date(value).toLocaleTimeString("en-ZA", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    });

  useEffect(() => {
    if (!open) return;

    let alive = true;
    setLoading(true);
    setError("");

    const load = async () => {
      try {
        const data = await chatCall(userId, "td_chat_status_feed");

        if (alive) {
          setFeed({
            posts: data.posts || [],
            offset: Date.parse(data.server_now) - Date.now(),
          });
          setNow(Date.now());
        }
      } catch (failure) {
        if (alive) setError(failure.message);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();

    const timer = setInterval(load, 30_000);
    window.addEventListener("focus", load);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [open, userId, refresh]);

  useEffect(() => {
    if (!open) return;

    const timer = setInterval(
      () => setNow(Date.now()),
      selected ? 1000 : 30_000
    );

    return () => clearInterval(timer);
  }, [open, selected]);

  useEffect(() => {
    setViewers(null);

    if (open && post && post.employee_id !== userId) {
      void chatCall(userId, "td_chat_status_seen", {
        p_id: post.id,
      }).catch(failure => setError(failure.message));
    }
  }, [open, selected, userId]);

  function startPost() {
    setCompose(true);
    setSelected("");
    setFile(null);
    setBody("");
    setPrivacy("everyone");
    setAudience([]);
    setError("");
    postId.current = chatId();
    uploadId.current = chatId();
  }

  function close() {
    setOpen(false);
    setCompose(false);
    setSelected("");
    setFile(null);
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-pressed={open}
        onClick={() => {
          setOpen(true);
          setSelected("");
          setError("");
        }}
      >
        Status
      </button>

      {open && (
        <SharingDialog title="Status" busy={busy} onClose={close}>
          {error && (
            <p className="td-sharing-error" role="alert">{error}</p>
          )}

          {compose ? (
            <form
              onSubmit={async event => {
                event.preventDefault();

                if (lock.current) return;

                if (
                  (!body.trim() && !file) ||
                  (privacy === "selected" && !audience.length)
                ) {
                  setError(
                    "Add text or media and choose who can see your status."
                  );
                  return;
                }

                lock.current = true;
                setBusy(true);
                setError("");

                try {
                  if (file) {
                    await uploadChatMedia(
                      userId,
                      uploadId.current,
                      file
                    );
                  }

                  await chatCall(userId, "td_chat_status_publish", {
                    p_id: postId.current,
                    p_body: body.trim(),
                    p_upload: file ? uploadId.current : null,
                    p_audience:
                      privacy === "everyone"
                        ? null
                        : [...audience].sort(),
                  });

                  setCompose(false);
                  setFile(null);
                  setRefresh(value => value + 1);
                } catch (failure) {
                  setError(failure.message);
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Your update
                  <textarea
                    name="statusText"
                    maxLength={700}
                    value={body}
                    onChange={event => setBody(event.target.value)}
                    placeholder="Share a moment or a short update…"
                  />
                </label>

                <input
                  ref={fileInput}
                  type="file"
                  accept={mediaAccept}
                  hidden
                  onChange={event => {
                    const chosen = event.target.files?.[0];
                    event.target.value = "";

                    if (!chosen) return;

                    try {
                      checkChatMedia(chosen);
                      setFile(chosen);
                      uploadId.current = chatId();
                      setError("");
                    } catch (failure) {
                      setError(failure.message);
                    }
                  }}
                />

                {preview && (
                  <div className="td-upload-preview">
                    {file.type.startsWith("video/") ? (
                      <video
                        src={preview}
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img src={preview} alt="Status preview" />
                    )}
                  </div>
                )}

                <div className="td-sharing-actions">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImagePlus size={17} />
                    {file ? "Change media" : "Add photo or video"}
                  </button>

                  {file && (
                    <button type="button" onClick={() => setFile(null)}>
                      Remove media
                    </button>
                  )}
                </div>

                <label>
                  Who can see this?
                  <select
                    name="statusAudience"
                    value={privacy}
                    onChange={event => setPrivacy(event.target.value)}
                  >
                    <option value="everyone">
                      Everyone in this workspace
                    </option>
                    <option value="selected">
                      Selected colleagues
                    </option>
                  </select>
                </label>

                {privacy === "selected" && (
                  <div className="td-status-audience">
                    {employees
                      .filter(
                        person => person.id !== userId && !person.is_banned
                      )
                      .map(person => (
                        <label key={person.id}>
                          <input
                            type="checkbox"
                            name="statusColleague"
                            value={person.id}
                            checked={audience.includes(person.id)}
                            onChange={event =>
                              setAudience(previous =>
                                event.target.checked
                                  ? [...previous, person.id]
                                  : previous.filter(id => id !== person.id)
                              )
                            }
                          />
                          <EmployeeAvatar
                            employeeId={person.id}
                            interactive={false}
                          />
                          <span>{person.display_name}</span>
                        </label>
                      ))}
                  </div>
                )}

                <small>
                  Visible for 24 hours. People you have blocked,
                  or who have blocked you, cannot see it.
                </small>

                <div className="td-sharing-actions">
                  <button
                    className="td-sharing-primary"
                    type="submit"
                  >
                    {busy ? "Posting…" : "Post status"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCompose(false);
                      setFile(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          ) : post ? (
            <>
              <div className="td-status-person">
                <EmployeeAvatar
                  employeeId={post.employee_id}
                  interactive={false}
                />
                <div>
                  <strong>
                    {post.employee_id === userId
                      ? "My status"
                      : name(post.employee_id)}
                  </strong>
                  <small>
                    Shared at {sharedAt(post.created_at)}
                    {" · "}{index + 1} / {sequence.length}
                  </small>
                </div>
              </div>

              {post.attachment && (
                <ChatMediaMessage
                  key={post.id}
                  userId={userId}
                  attachment={post.attachment}
                  expiresAt={post.expires_at}
                  serverOffset={feed.offset}
                />
              )}

              {post.body && (
                <p
                  className={
                    post.attachment ? "td-status-caption" : "td-status-text"
                  }
                >
                  <ChatMessageText
                    text={post.body}
                    employees={employees}
                  />
                </p>
              )}

              <div className="td-sharing-actions">
                <button
                  type="button"
                  disabled={index <= 0}
                  onClick={() => setSelected(sequence[index - 1].id)}
                >
                  <ChevronLeft size={17} />
                  Previous
                </button>

                <button
                  type="button"
                  disabled={index >= sequence.length - 1}
                  onClick={() => setSelected(sequence[index + 1].id)}
                >
                  Next
                  <ChevronRight size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelected("");
                    setRefresh(value => value + 1);
                  }}
                >
                  All statuses
                </button>
              </div>

              {post.employee_id === userId && (
                <>
                  <div className="td-sharing-actions">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { data, error: failure } = await supabase
                            .from("td_chat_status_views")
                            .select("employee_id,viewed_at")
                            .eq("status_id", post.id)
                            .order("viewed_at", { ascending: false })
                            .limit(100);

                          if (failure) throw failure;
                          setViewers(data || []);
                        } catch (failure) {
                          setError(failure.message);
                        }
                      }}
                    >
                      Viewed by {post.view_count || 0}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (lock.current) return;

                        lock.current = true;
                        setBusy(true);

                        try {
                          await chatCall(userId, "td_chat_status_delete", {
                            p_id: post.id,
                          });

                          setSelected("");
                          setRefresh(value => value + 1);
                        } catch (failure) {
                          setError(failure.message);
                        } finally {
                          lock.current = false;
                          setBusy(false);
                        }
                      }}
                    >
                      Delete my status
                    </button>
                  </div>

                  {viewers && (
                    <ul className="td-status-viewers">
                      {viewers.length ? (
                        viewers.map(viewer => (
                          <li key={viewer.employee_id}>
                            {name(viewer.employee_id)}
                            {" · "}{sharedAt(viewer.viewed_at)}
                          </li>
                        ))
                      ) : (
                        <li>No views yet.</li>
                      )}
                    </ul>
                  )}

                  {viewers?.length === 100 && (
                    <small>Showing the latest 100 viewers.</small>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="td-sharing-actions">
                <button
                  className="td-sharing-primary"
                  type="button"
                  onClick={startPost}
                >
                  <Plus size={17} />
                  Add my status
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setRefresh(value => value + 1)}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>

              <p>Text, photos and videos shared for 24 hours.</p>

              {selected && (
                <p>This status has expired or is no longer available.</p>
              )}

              {loading && <p role="status">Loading statuses…</p>}

              <div className="td-status-list">
                {[...groups]
                  .sort(([a], [b]) =>
                    a === userId ? -1 : b === userId ? 1 : 0
                  )
                  .map(([id, updates]) => (
                    <button
                      type="button"
                      key={id}
                      className={
                        updates.every(row => row.viewed || id === userId)
                          ? "is-viewed"
                          : ""
                      }
                      onClick={() => {
                        setError("");
                        setSelected(
                          (updates.find(row => !row.viewed) || updates[0]).id
                        );
                      }}
                    >
                      <span className="td-status-ring">
                        <EmployeeAvatar
                          employeeId={id}
                          interactive={false}
                        />
                      </span>

                      <span>
                        <strong>
                          {id === userId ? "My status" : name(id)}
                        </strong>
                        <small>
                          {updates.length}
                          {updates.length === 1 ? " update" : " updates"}
                          {" · "}
                          {sharedAt(updates.at(-1).created_at)}
                        </small>
                      </span>

                      <ChevronRight size={17} />
                    </button>
                  ))}
              </div>

              {!loading && !posts.length && (
                <p>No status updates yet. Share the first one.</p>
              )}

              {feed.posts.length === 200 && (
                <small>Showing the 200 most recent updates.</small>
              )}

              {!!own.length && (
                <small>
                  You have {own.length} active
                  {own.length === 1 ? " update" : " updates"}.
                </small>
              )}
            </>
          )}
        </SharingDialog>
      )}
    </>
  );
}
