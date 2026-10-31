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

    let frame = 0;

    const viewport = window.visualViewport;
    const bar = document.querySelector(".topbar");
    const nav = document.querySelector(".mobile-nav");

    function measure() {
      const mobile = window.matchMedia(
        "(max-width: 759px)",
      ).matches;

      const offset = viewport?.offsetTop || 0;

      const end =
        offset +
        (viewport?.height || window.innerHeight);

      const barRect = bar?.getBoundingClientRect();

      const top = mobile
        ? Math.min(
            end,
            Math.max(
              offset,
              barRect?.bottom || offset,
            ),
          )
        : Math.max(
            offset,
            node.getBoundingClientRect().top,
          );

      const navRect = nav?.getBoundingClientRect();

      const bottom =
        mobile &&
        navRect?.height &&
        navRect.top > top &&
        navRect.top < end
          ? navRect.top
          : end;

      node.style.setProperty(
        "--td-chat-top",
        `${top}px`,
      );

      node.style.setProperty(
        "--td-chat-height",
        `${Math.max(
          0,
          bottom - top - (mobile ? 0 : 16),
        )}px`,
      );

      const typing = document.activeElement?.matches(
        "input,textarea,[contenteditable='true']",
      );

      node.classList.toggle(
        "td-chat-keyboard-open",
        Boolean(
          mobile &&
          typing &&
          window.innerHeight -
            (viewport?.height || window.innerHeight) >
            120,
        ),
      );
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    const observer = new ResizeObserver(schedule);

    if (bar) observer.observe(bar);
    if (nav) observer.observe(nav);

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, {
      passive: true,
    });

    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);

    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);

    schedule();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();

      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);

      viewport?.removeEventListener(
        "resize",
        schedule,
      );

      viewport?.removeEventListener(
        "scroll",
        schedule,
      );

      document.removeEventListener(
        "focusin",
        schedule,
      );

      document.removeEventListener(
        "focusout",
        schedule,
      );

      node.style.removeProperty("--td-chat-top");
      node.style.removeProperty("--td-chat-height");
      node.classList.remove("td-chat-keyboard-open");
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
  const ids = rows
    .filter(row => !row.local)
    .map(row => row.id)
    .join(",");

  const key =
    `${userId}:${roomId}:${ids}:${revision}`;

  const [state, setState] = useState({
    key: "",
    rows: [],
    error: "",
  });

  useEffect(() => {
    if (!ids) return;

    let alive = true;

    chatCall(
      userId,
      "td_chat_reply_context_v1",
      {
        p_room: roomId,
        p_messages: ids.split(","),
      },
    )
      .then(data => {
        if (alive) {
          setState({
            key,
            rows: data || [],
            error: "",
          });
        }
      })
      .catch(failure => {
        if (alive) {
          setState({
            key,
            rows: [],
            error:
              failure.message ||
              "Reply previews could not load",
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [userId, roomId, ids, key]);

  return {
    byId: new Map(
      state.key === key
        ? state.rows.map(row => [
            row.message_id,
            row,
          ])
        : [],
    ),

    error:
      ids && state.key === key
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