import { useEffect, useRef, useState } from "react";
import { Camera, ShieldBan, Users, X } from "lucide-react";
import { chatCall } from "../lib/companyChat.js";
import {
  prepareGroupIcon,
  uploadGroupIcon,
} from "../lib/groupChat.js";

export function ChatGroupIcon({ room }) {
  const [failed, setFailed] = useState("");
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);

  const src =
    room.icon_url && failed !== room.icon_url
      ? room.icon_url
      : "";

  useEffect(() => {
    if (!open) return;

    const node = dialog.current;
    node.showModal();

    return () => {
      if (node.open) node.close();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="td-chat-group-icon"
        aria-label={`View ${room.name || "group"} icon`}
        onClick={() => setOpen(true)}
      >
        {src ? (
          <img
            src={src}
            alt=""
            onError={() => setFailed(room.icon_url)}
          />
        ) : (
          <Users size={21} />
        )}
      </button>

      {open && (
        <dialog
          ref={dialog}
          className="td-chat-dialog td-chat-icon-viewer"
          aria-label="Group icon"
          onCancel={event => {
            event.preventDefault();
            setOpen(false);
          }}
          onClick={event => {
            if (event.target === dialog.current) {
              setOpen(false);
            }
          }}
        >
          <header>
            <h2>{room.name || "Group"}</h2>
            <button
              type="button"
              className="td-chat-icon"
              aria-label="Close group icon"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </header>

          {src ? (
            <img
              src={src}
              alt={`${room.name || "Group"} icon`}
              onError={() => setFailed(room.icon_url)}
            />
          ) : (
            <p className="td-chat-note">
              No group icon has been added yet.
            </p>
          )}
        </dialog>
      )}
    </>
  );
}

export default function ChatRoomSettings({
  room,
  userId,
  onChanged,
  onBusy,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [blocked, setBlocked] = useState(
    Boolean(room.blocked_by_me),
  );
  const [textSize, setTextSize] = useState("14");

  const fileInput = useRef(null);
  const locked = useRef(false);
  const settings = useRef(null);

  useEffect(() => {
    try {
      const size = localStorage.getItem(
        `td-chat-text-size:${userId}`,
      );

      if (["14", "16", "18"].includes(size)) {
        setTextSize(size);
      }
    } catch {
      // Settings remain available for this session.
    }
  }, [userId]);

  useEffect(() => {
    setBlocked(Boolean(room.blocked_by_me));
  }, [room.blocked_by_me]);

  async function changeIcon(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || locked.current) return;

    locked.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");

    try {
      const image = await prepareGroupIcon(file);
      await uploadGroupIcon(userId, room.room_id, image);
      setNotice("Group icon updated.");
      onChanged();
    } catch (failure) {
      setError(
        failure.message || "Could not update the group icon.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  async function changeBlock(next) {
    if (locked.current) return;

    locked.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");

    try {
      await chatCall(userId, "td_chat_set_block", {
        p_room: room.room_id,
        p_block: next,
      });

      setBlocked(next);
      setConfirm(false);
      setNotice(
        next
          ? "This direct conversation is blocked."
          : "Conversation unblocked.",
      );
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      locked.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <section
      ref={settings}
      className="td-chat-room-settings"
      aria-label="Conversation settings"
    >
      <label className="td-chat-field">
        Message text size
        <select
          value={textSize}
          onChange={event => {
            const size = event.target.value;
            setTextSize(size);

            settings.current
              ?.closest(".td-chat")
              ?.style.setProperty(
                "--td-chat-message-size",
                `${size}px`,
              );

            try {
              localStorage.setItem(
                `td-chat-text-size:${userId}`,
                size,
              );
            } catch {
              // Applied for this session.
            }
          }}
        >
          <option value="14">Standard</option>
          <option value="16">Larger</option>
          <option value="18">Extra large</option>
        </select>
      </label>

<p className="td-chat-note">
  Voice notes can be up to 2 minutes.
  {" "}
  {room.kind === "direct"
    ? "Only participants can access this direct conversation through TechDev."
    : "Group participants and company admins can access these messages."}
</p>

      {room.kind !== "direct" && room.can_change_icon && (
        <>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={changeIcon}
          />

          <button
            type="button"
            className="td-chat-primary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Camera size={17} />
            {busy ? "Checking image…" : "Change group icon"}
          </button>

          <p className="td-chat-note">
            The image is checked before it becomes visible
            to the group.
          </p>
        </>
      )}

      {room.kind === "direct" && room.is_member && (
        <>
          <button
            type="button"
            className={`td-chat-primary${
              blocked ? "" : " is-danger"
            }`}
            disabled={busy}
            onClick={() =>
              blocked
                ? changeBlock(false)
                : setConfirm(true)
            }
          >
            <ShieldBan size={17} />
            {busy
              ? "Saving…"
              : blocked
                ? "Unblock conversation"
                : "Block this person"}
          </button>

          {confirm && (
            <div className="td-chat-block-confirm">
              <strong>Block this person?</strong>
              <p>
                New direct messages will not be delivered
                in either direction. Blocked sends show
                three red ticks. Your existing conversation
                stays available.
              </p>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="td-chat-primary is-danger"
                  disabled={busy}
                  onClick={() => changeBlock(true)}
                >
                  Confirm block
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="td-chat-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="td-chat-note" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}