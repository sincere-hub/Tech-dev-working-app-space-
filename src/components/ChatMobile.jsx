import {
  useEffect,
  useRef,
  useState,
} from "react";

import { Reply, X } from "lucide-react";
import { chatCall } from "../lib/companyChat.js";
import "./chat-mobile.css";

export function useChatViewport(root) {
  useEffect(() => {
    const node = root.current;

    if (!node) return;

    const viewport = window.visualViewport;
    const bar = document.querySelector(".topbar");
    const nav = document.querySelector(".mobile-nav");

    let frame = 0;
    let width = window.innerWidth;

    let baseline = Math.max(
      window.innerHeight,
      viewport?.height || 0
    );

    let barHeight =
      bar?.getBoundingClientRect().height ||
      bar?.offsetHeight ||
      0;

    let navHeight =
      nav?.getBoundingClientRect().height ||
      nav?.offsetHeight ||
      0;

    function setPixels(name, value) {
      const next = `${Math.round(value)}px`;

      if (node.style.getPropertyValue(name) !== next) {
        node.style.setProperty(name, next);
      }
    }

    function measure() {
      frame = 0;

      const mobile = window.matchMedia(
        "(max-width: 759px)"
      ).matches;

      if (!mobile) {
        node.style.removeProperty("--td-chat-top");
        node.style.removeProperty("--td-chat-height");

        node.classList.remove(
          "td-chat-keyboard-open"
        );

        return;
      }

      const visibleHeight =
        viewport?.height || window.innerHeight;

      if (window.innerWidth !== width) {
        width = window.innerWidth;

        baseline = Math.max(
          window.innerHeight,
          visibleHeight
        );

        barHeight =
          bar?.getBoundingClientRect().height ||
          bar?.offsetHeight ||
          0;

        navHeight =
          nav?.getBoundingClientRect().height ||
          nav?.offsetHeight ||
          0;
      }

      baseline = Math.max(
        baseline,
        window.innerHeight,
        visibleHeight
      );

      const editing =
        node.contains(document.activeElement) &&
        document.activeElement?.matches(
          "input,textarea,[contenteditable='true']"
        );

      const keyboard = Boolean(
        editing &&
        Math.abs((viewport?.scale || 1) - 1) < 0.05 &&
        baseline - visibleHeight > 140
      );

      setPixels("--td-chat-top", barHeight);

      setPixels(
        "--td-chat-height",
        Math.max(
          0,
          visibleHeight -
            barHeight -
            (keyboard ? 0 : navHeight)
        )
      );

      node.classList.toggle(
        "td-chat-keyboard-open",
        keyboard
      );
    }

    function schedule() {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    }

    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);

    schedule();

    return () => {
      cancelAnimationFrame(frame);

      window.removeEventListener(
        "resize",
        schedule
      );

      viewport?.removeEventListener(
        "resize",
        schedule
      );

      node.style.removeProperty("--td-chat-top");
      node.style.removeProperty("--td-chat-height");

      node.classList.remove(
        "td-chat-keyboard-open"
      );
    };
  }, [root]);
}

export function replyPreview(message) {
  return {
    reply_to: message.id,
    reply_sender: message.sender_id,
    reply_body:
      message.kind === "voice"
        ? "Voice note"
        : String(message.body || "").slice(0, 180),
    reply_deleted: false,
  };
}

export function useReplyContext(
  userId,
  roomId,
  rows,
  revision,
) {
  const ids = [...new Set(
    rows
      .filter(row => !row.local && row.id)
      .map(row => row.id),
  )].sort().join(",");

  // Keep existing quotes during a refresh.
  const scope = JSON.stringify([userId, roomId]);

  const [state, setState] = useState({
    scope: "",
    rows: [],
    error: "",
  });

  useEffect(() => {
    if (!userId || !roomId || !ids) return;

    let alive = true;

    chatCall(userId, "td_chat_reply_context_v1", {
      p_room: roomId,
      p_messages: ids.split(","),
    })
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error(
            "Reply previews could not load.",
          );
        }

        if (alive) {
          setState({
            scope,
            rows: data,
            error: "",
          });
        }
      })
      .catch(failure => {
        if (!alive) return;

        setState(previous => ({
          scope,
          rows:
            previous.scope === scope
              ? previous.rows
              : [],
          error:
            failure.message ||
            "Reply previews could not load.",
        }));
      });

    return () => {
      alive = false;
    };
  }, [userId, roomId, ids, revision, scope]);

  const visibleIds = new Set(
    ids ? ids.split(",") : [],
  );

  return {
    loading: Boolean(ids && state.scope !== scope),
    byId: new Map(
      state.scope === scope
        ? state.rows
            .filter(row =>
              visibleIds.has(row.message_id),
            )
            .map(row => [
              row.message_id,
              row,
            ])
        : [],
    ),

    error:
      ids && state.scope === scope
        ? state.error
        : "",
  };
}

export function ReplyQuote({
  quote,
  people,
  userId,
}) {
  if (!quote) return null;

  const author = quote.reply_deleted
    ? "Original message"
    : quote.reply_sender === userId
      ? "You"
      : people.get(quote.reply_sender)
          ?.display_name || "Former employee";

  return (
    <div
      className="td-reply-quote"
      aria-label="Replying to a message"
    >
      <strong>{author}</strong>
      <span>{quote.reply_body}</span>
    </div>
  );
}

export function ReplyComposer({
  message,
  people,
  userId,
  onCancel,
}) {
  if (!message) return null;

  return (
    <div className="td-reply-composer">
      <Reply size={18} aria-hidden="true" />

      <ReplyQuote
        quote={replyPreview(message)}
        people={people}
        userId={userId}
      />

      <button
        type="button"
        aria-label="Cancel reply"
        onClick={onCancel}
      >
        <X size={19} />
      </button>
    </div>
  );
}

export function SwipeReply({
  onReply,
  children,
  className = "",
  ...props
}) {
  const gesture = useRef(null);

  function reset(node) {
    gesture.current = null;

    node.style.setProperty(
      "--td-reply-drag",
      "0px",
    );

    node.classList.remove("is-swiping");
  }

  return (
    <article
      {...props}
      className={`${className} td-swipe-message`}
      onPointerDown={event => {
        if (
          !onReply ||
          !event.isPrimary ||
          event.pointerType === "mouse" ||
          event.target.closest(
            "button,a,input,textarea,audio,video,summary",
          ) ||
          window.getSelection()?.toString()
        ) {
          return;
        }

        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dx: 0,
          axis: "",
        };
      }}
      onPointerMove={event => {
        const move = gesture.current;

        if (
          !move ||
          move.id !== event.pointerId
        ) {
          return;
        }

        const dx = event.clientX - move.x;
        const dy = event.clientY - move.y;

        if (
          !move.axis &&
          Math.abs(dy) > 12 &&
          Math.abs(dy) >= Math.abs(dx)
        ) {
          reset(event.currentTarget);
          return;
        }

        if (
          !move.axis &&
          dx > 12 &&
          dx > Math.abs(dy) * 1.5
        ) {
          move.axis = "x";

          event.currentTarget.setPointerCapture(
            event.pointerId,
          );
        }

        if (move.axis !== "x") return;

        move.dx = Math.max(
          0,
          Math.min(dx, 72),
        );

        event.currentTarget.classList.add(
          "is-swiping",
        );

        event.currentTarget.style.setProperty(
          "--td-reply-drag",
          `${move.dx}px`,
        );

        if (event.cancelable) {
          event.preventDefault();
        }
      }}
      onPointerUp={event => {
        const move = gesture.current;

        if (
          !move ||
          move.id !== event.pointerId
        ) {
          return;
        }

        const ready =
          move.axis === "x" &&
          move.dx >= 56;

        reset(event.currentTarget);

        if (ready) onReply?.();
      }}
      onPointerCancel={event =>
        reset(event.currentTarget)
      }
      onLostPointerCapture={event =>
        reset(event.currentTarget)
      }
    >
      {onReply && (
        <span
          className="td-swipe-cue"
          aria-hidden="true"
        >
          <Reply size={20} />
        </span>
      )}

      {children}
    </article>
  );
}