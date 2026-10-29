import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "./supabase.js";
import { attachChatOptions } from "./groupChat.js";
import {
  useAppChatPresence,
} from "./chatPresence.js";

export async function chatRequest(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const { data, error } = await query.abortSignal(
      controller.signal,
    );

    if (error) {
      throw new Error(
        error.message || "Chat could not connect.",
      );
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCall(
  userId,
  name,
  args = {},
) {
  if (!supabase) {
    throw new Error(
      "The workspace connection is unavailable.",
    );
  }

  const { data, error } = await supabase.auth.getSession();

  if (
    error ||
    !userId ||
    data.session?.user.id !== userId
  ) {
    throw new Error(
      "Your account changed. Reopen the chat.",
    );
  }

  return chatRequest(supabase.rpc(name, args));
}

export function chatId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(
    new Uint8Array(16),
  );

  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;

  const text = [...bytes]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  return [
    text.slice(0, 8),
    text.slice(8, 12),
    text.slice(12, 16),
    text.slice(16, 20),
    text.slice(20),
  ].join("-");
}

export function messageStatus(message) {
if (message.blocked) return "blocked";
  if (message.local) {
    if (message.failed) return "failed";
    return message.saved ? "sent" : "sending";
  }

  const total = Number(message.recipients);

  if (total > 0 && Number(message.seen) >= total) {
    return "read";
  }

  if (total > 0 && Number(message.delivered) >= total) {
    return "delivered";
  }

  return "sent";
}

export function readableMessageIds(
  feed,
  rows,
  userId,
) {
  if (
    !feed ||
    !navigator.onLine ||
    document.visibilityState !== "visible" ||
    !document.hasFocus() ||
    document.querySelector("dialog[open]") ||
    feed.closest("[inert], [aria-hidden='true']")
  ) {
    return [];
  }

  const bounds = feed.getBoundingClientRect();

  if (!bounds.height) return [];

  return rows
    .filter(message =>
      message.sender_id !== userId &&
      !message.my_read_at &&
      !message.deleted_at
    )
    .filter(message => {
      const element = feed.querySelector(
        `[data-chat-message="${message.id}"] .td-chat-bubble`,
      );

      const rect = element?.getBoundingClientRect();

      if (!rect) return false;

      const top = Math.max(
        rect.top,
        bounds.top,
        0,
      );

      const bottom = Math.min(
        rect.bottom,
        bounds.bottom,
        window.innerHeight,
      );

      const left = Math.max(
        rect.left,
        bounds.left,
        0,
      );

      const right = Math.min(
        rect.right,
        bounds.right,
        window.innerWidth,
      );

      return (
        right > left &&
        bottom - top >= Math.min(32, rect.height) &&
        element.contains(
          document.elementFromPoint(
            (left + right) / 2,
            (top + bottom) / 2,
          ),
        )
      );
    })
    .map(message => message.id);
}

let channelId = 0;

export function useChatInbox(userId) {
  const [state, setState] = useState({
    rooms: [],
    role: "employee",
    revision: 0,
    loading: true,
    live: false,
    error: "",
  });

  const reload = useRef(() => {});
  const refresh = useCallback(
    () => reload.current(),
    [],
  );

  useEffect(() => {
    if (!userId || !supabase) return;

    let alive = true;
    let busy = false;
    let again = false;
    let debounce;

    async function load() {
      if (!alive) return;

      if (busy) {
        again = true;
        return;
      }

      busy = true;

      try {
        const [profile, baseRooms] = await Promise.all([
          chatRequest(
            supabase
              .from("employees")
              .select("role")
              .eq("id", userId)
              .single(),
          ),
          (async () => {
            const rows = [];

            for (let offset = 0; ; offset += 500) {
              const page = await chatRequest(
                supabase
                  .rpc("td_chat_inbox")
                  .range(offset, offset + 499),
              );

              rows.push(...page);

              if (page.length < 500) return rows;
            }
          })(),
        ]);
const rooms = await attachChatInboxIndicators(
  userId,
  await attachChatOptions(userId, baseRooms)
);
        if (alive) {
          setState(previous => ({
            ...previous,
            rooms,
            role: profile.role,
            loading: false,
            error: "",
            revision: previous.revision + 1,
          }));
        }
      } catch (error) {
        if (alive) {
          setState(previous => ({
            ...previous,
            loading: false,
            error: error.message,
          }));
        }
      } finally {
        busy = false;

        if (again && alive) {
          again = false;
          schedule();
        }
      }
    }

    function schedule() {
      if (!alive) return;

      clearTimeout(debounce);
      debounce = setTimeout(load, 180);
    }

    reload.current = schedule;

    const channel = supabase.channel(
      `td-chat-inbox-${userId}-${++channelId}`,
    );
    for (const table of [
      "td_chat_rooms",
      "td_chat_members",
      "td_chat_messages",
      "td_chat_receipts",
      "td_chat_blocks",
    ]) {

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        schedule,
      );
    }

    channel.subscribe(status => {
      if (alive) {
        setState(previous => ({
          ...previous,
          live: status === "SUBSCRIBED",
        }));
      }

      if (status === "SUBSCRIBED") schedule();
    });

    load();

    const timer = setInterval(schedule, 15000);

    window.addEventListener("online", schedule);
    window.addEventListener("focus", schedule);

    return () => {
      alive = false;
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", schedule);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { ...state, refresh };
}

export function useChatPage(
  userId,
  roomId,
  before,
  revision,
  search = "",
) {
  const [state, setState] = useState({
    key: "",
    rows: [],
    more: false,
    error: "",
    loading: true,
  });

  const key =
    `${roomId}:${before?.id || "latest"}:${search}`;

  useEffect(() => {
    let alive = true;

    chatCall(userId, "td_chat_page_v2", {
      p_room: roomId,
      p_before_in: before?.created_at || null,
      p_before_id: before?.id || null,
      p_search: search,
    })
      .then(data => {
        if (alive) {
          setState({
            key,
            rows: data.slice(0, 50).reverse(),
            more: data.length > 50,
            error: "",
            loading: false,
          });
        }
      })
      .catch(error => {
        if (alive) {
          setState(previous => ({
            key,
            rows:
              previous.key === key
                ? previous.rows
                : [],
            more:
              previous.key === key &&
              previous.more,
            error: error.message,
            loading: false,
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [
    userId,
    roomId,
    before?.id,
    before?.created_at,
    revision,
    key,
    search,
  ]);

  return state.key === key
    ? state
    : {
        rows: [],
        more: false,
        error: "",
        loading: true,
      };
}

// Mount once in App.jsx.
export function ChatDelivery({ userId }) {
    useAppChatPresence(userId);
  useEffect(() => {
    if (!userId || !supabase) return;

    let alive = true;
    let busy = false;
    let retry;

    async function receive() {
      if (!alive || busy || !navigator.onLine) return;

      busy = true;

      try {
        for (
          let batch = 0;
          alive && batch < 10;
          batch++
        ) {
          const receipts = await chatRequest(
            supabase
              .from("td_chat_receipts")
              .select("message_id")
              .eq("employee_id", userId)
              .is("delivered_at", null)
              .order("message_id")
              .limit(200),
          );

          if (!alive || !receipts.length) break;

          // Receive the message contents before
          // recording delivery.
          const messages = await chatRequest(
            supabase
              .from("td_chat_messages")
              .select("id,body")
              .in(
                "id",
                receipts.map(row => row.message_id),
              ),
          );

          if (!alive || !messages.length) break;

          await chatCall(userId, "td_chat_ack", {
            p_message_ids: messages.map(row => row.id),
            p_read: false,
          });

          if (receipts.length < 200) break;

          if (batch === 9 && alive) {
            retry = setTimeout(receive, 300);
          }
        }
      } catch {
        // Retry after reconnecting or on the next interval.
      } finally {
        busy = false;
      }
    }

    const channel = supabase
      .channel(
        `td-chat-delivery-${userId}-${++channelId}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "td_chat_receipts",
          filter: `employee_id=eq.${userId}`,
        },
        receive,
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") receive();
      });

    receive();

    const timer = setInterval(receive, 30000);

    window.addEventListener("online", receive);
    window.addEventListener("focus", receive);

    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(retry);
      window.removeEventListener("online", receive);
      window.removeEventListener("focus", receive);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
async function attachChatInboxIndicators(
  userId,
  rooms
) {
  const signals = new Map();

  for (
    let offset = 0;
    offset < rooms.length;
    offset += 500
  ) {
    const rows = await chatCall(
      userId,
      "td_chat_inbox_signals_v1",
      {
        p_rooms: rooms
          .slice(offset, offset + 500)
          .map(room => room.room_id),
      }
    );

    for (const row of rows || []) {
      signals.set(row.room_id, row);
    }
  }

  return rooms.map(room => {
    const signal = signals.get(room.room_id);

    return {
      ...room,
      blocked_by_other:
        signal?.blocked_by_other === true,
      chat_last_message:
        signal?.last_message || null,
      last_body: signal
        ? signal.last_body
        : room.last_body,
      last_at: signal
        ? signal.last_at
        : room.last_at,
    };
  });
}

export function chatListPreview(
  room,
  outbox,
  userId
) {
  const stored = room.chat_last_message;

  const local = outbox
    .filter(item => item.room_id === room.room_id)
    .at(-1);

  const sameMessage =
    local &&
    stored?.client_id === local.client_id;

  const headUnchanged = stored
    ? stored.id === local?.preview_after_id
    : (room.last_at || null) ===
      (local?.preview_after_at || null);

  const pending =
    local && !sameMessage && headUnchanged
      ? local
      : null;

  const message = pending || stored;

  return {
    message:
      message?.sender_id === userId
        ? message
        : null,

    text: pending
      ? pending.kind === "voice"
        ? "Voice message"
        : pending.body
      : room.last_body ||
        (
          room.kind === "company"
            ? "Everyone in one place"
            : "Start the conversation"
        ),

    at: pending?.created_at || room.last_at,
  };
}