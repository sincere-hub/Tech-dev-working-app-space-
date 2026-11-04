import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase.js";

export function liveActivities(rows, now, userId) {
  const people = new Map();

  for (const row of rows) {
    const expires = Date.parse(row.expires_at);

    if (
      row.employee_id === userId ||
      !["typing", "recording"].includes(row.kind) ||
      !Number.isFinite(expires) ||
      expires <= now
    ) {
      continue;
    }

    const previous = people.get(row.employee_id);

    if (!previous || row.kind === "recording") {
      people.set(row.employee_id, row);
    }
  }

  return [...people.values()];
}

export function useChatActivity({
  userId,
  roomId,
  enabled,
}) {
  const [state, setState] = useState(null);
  const [, tick] = useState(0);
  const api = useRef({});

  const owner = `${userId}:${roomId}`;

  useEffect(() => {
    if (!enabled || !userId || !roomId) {
      api.current = {};
      return;
    }

    let live = true;
    let mode = "idle";
    let sequence = 0;
    let lastSent = 0;

    let idleTimer;
    let channel;
    let reading = false;
    let again = false;
    let readController;

    let writes = Promise.resolve();

    const device = crypto.randomUUID();

    function publish(kind) {
      const number = ++sequence;

      lastSent = performance.now();

      writes = writes
        .catch(() => {})
        .then(async () => {
          if (
            kind !== "idle" &&
            (
              !live ||
              mode !== kind ||
              document.hidden
            )
          ) {
            return;
          }

          if (!navigator.onLine) return;

          const controller = new AbortController();

          const timeout = setTimeout(
            () => controller.abort(),
            5000
          );

          try {
            const { data, error } =
              await supabase.auth.getSession();

            if (
              error ||
              data.session?.user.id !== userId
            ) {
              return;
            }

            await supabase
              .rpc("td_chat_activity_set", {
                p_room: roomId,
                p_device: device,
                p_kind: kind,
                p_sequence: number,
              })
              .abortSignal(controller.signal);
          } finally {
            clearTimeout(timeout);
          }
        })
        .catch(() => {});
    }

    function stop() {
      clearTimeout(idleTimer);

      if (mode !== "idle") {
        mode = "idle";
        publish("idle");
      }
    }

    function typing(text) {
      if (mode === "recording") return;

      if (!String(text || "").trim()) {
        stop();
        return;
      }

      const changed = mode !== "typing";

      mode = "typing";

      if (
        changed ||
        performance.now() - lastSent > 1500
      ) {
        publish("typing");
      }

      clearTimeout(idleTimer);

      idleTimer = setTimeout(stop, 2500);
    }

    function setRecording(value) {
      clearTimeout(idleTimer);

      if (value) {
        if (mode !== "recording") {
          mode = "recording";
          publish(mode);
        }
      } else if (mode === "recording") {
        stop();
      }
    }

    async function refresh() {
      if (
        !live ||
        document.hidden ||
        !navigator.onLine
      ) {
        return;
      }

      if (reading) {
        again = true;
        return;
      }

      reading = true;
      readController = new AbortController();

      const timeout = setTimeout(
        () => readController.abort(),
        5000
      );

      try {
        const { data, error } = await supabase
          .rpc("td_chat_activity_get", {
            p_room: roomId,
          })
          .abortSignal(readController.signal);

        if (
          live &&
          !error &&
          data?.employee_id === userId
        ) {
          setState({
            owner,
            rows: data.items || [],
            stamp: Date.parse(data.server_now),
            at: performance.now(),
          });
        } else if (live) {
          setState(null);
        }
      } catch {
        if (live) setState(null);
      } finally {
        clearTimeout(timeout);
        reading = false;

        if (again && live) {
          again = false;
          void refresh();
        }
      }
    }

    function hide() {
      if (mode === "typing") {
        stop();
      } else if (mode === "recording") {
        publish("idle");
      }

      setState(null);
    }

    function visible() {
      if (document.hidden) {
        hide();
      } else {
        if (mode === "recording") publish(mode);
        void refresh();
      }
    }

    api.current = {
      typing,
      stop,
      setRecording,

      stopTyping: () => {
        if (mode === "typing") stop();
      },
    };

    setState(null);
    void refresh();

    channel = supabase
      .channel(`td-activity:${roomId}:${device}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "td_chat_activity_live",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          void refresh();
        }
      });

    const heartbeat = setInterval(() => {
      if (
        live &&
        mode !== "idle" &&
        !document.hidden
      ) {
        publish(mode);
      }
    }, 2500);

    const poll = setInterval(() => {
      void refresh();
    }, 5000);

    const timer = setInterval(() => {
      if (live && !document.hidden) {
        tick(value => value + 1);
      }
    }, 1000);

    window.addEventListener("offline", hide);
    window.addEventListener("online", visible);
    window.addEventListener("pagehide", hide);

    document.addEventListener(
      "visibilitychange",
      visible
    );

    return () => {
      stop();

      live = false;
      api.current = {};

      clearTimeout(idleTimer);
      clearInterval(heartbeat);
      clearInterval(poll);
      clearInterval(timer);

      readController?.abort();

      window.removeEventListener("offline", hide);
      window.removeEventListener("online", visible);
      window.removeEventListener("pagehide", hide);

      document.removeEventListener(
        "visibilitychange",
        visible
      );

      void supabase.removeChannel(channel);
    };
  }, [userId, roomId, enabled, owner]);

  const now = state
    ? state.stamp +
      performance.now() -
      state.at
    : 0;

  return {
    members:
      enabled && state?.owner === owner
        ? liveActivities(state.rows, now, userId)
        : [],

    typing: useCallback(
      text => api.current.typing?.(text),
      []
    ),

    stop: useCallback(
      () => api.current.stop?.(),
      []
    ),

    stopTyping: useCallback(
      () => api.current.stopTyping?.(),
      []
    ),

    setRecording: useCallback(
      value => api.current.setRecording?.(value),
      []
    ),
  };
}

export function ChatActivityLabel({
  members,
  people,
  direct,
}) {
  const recording = members.filter(
    person => person.kind === "recording"
  );

  const active = recording.length
    ? recording
    : members;

  const kind = recording.length
    ? "recording"
    : "typing";

  let text = "";

  if (active.length && direct) {
    text = recording.length
      ? "Recording voice note…"
      : "Typing…";
  } else if (active.length) {
    const names = active.slice(0, 2).map(
      person =>
        people.get(person.employee_id)
          ?.display_name || "Someone"
    );

    const extra =
      active.length > 2
        ? ` and ${active.length - 2} others`
        : "";

    text =
      `${names.join(" and ")}${extra} ` +
      `${active.length === 1 ? "is" : "are"} ` +
      `${kind}` +
      `${kind === "recording" ? " a voice note" : ""}…`;
  }

  return (
    <small
      className={`td-chat-live-activity${
        recording.length ? " is-recording" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {text || "\u00a0"}
    </small>
  );
}