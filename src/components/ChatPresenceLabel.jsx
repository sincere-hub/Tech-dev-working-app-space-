import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase.js";

import {
  useOnlineEmployees,
} from "../lib/chatPresence.js";

const dateTime = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ChatPresenceLabel({
  userId,
  employeeId,
  blocked,
}) {
  const online =
    useOnlineEmployees(userId).has(employeeId);

  const [connected, setConnected] = useState(
    () => navigator.onLine,
  );

  const [seen, setSeen] = useState(null);

  useEffect(() => {
    function update() {
      setConnected(navigator.onLine);
    }

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    setSeen(null);

    if (
      !employeeId ||
      blocked ||
      online ||
      !connected
    ) {
      return;
    }

    let alive = true;
    let request = null;

    async function load() {
      if (request) return;

      const controller = new AbortController();
      request = controller;

      const timeout = setTimeout(
        () => controller.abort(),
        12000,
      );

      try {
        const { data, error } = await supabase
          .rpc("td_chat_last_seen_v1", {
            p_employee: employeeId,
          })
          .abortSignal(controller.signal);

        if (alive) {
          setSeen({
            employeeId,
            value: error ? null : data,
          });
        }
      } catch {
        if (alive) {
          setSeen({
            employeeId,
            value: null,
          });
        }
      } finally {
        clearTimeout(timeout);

        if (request === controller) {
          request = null;
        }
      }
    }

    void load();

    const timer = setInterval(load, 30000);

    return () => {
      alive = false;
      clearInterval(timer);
      request?.abort();
    };
  }, [
    userId,
    employeeId,
    blocked,
    online,
    connected,
  ]);

  if (blocked) {
    return (
      <span className="td-chat-presence-label is-blocked">
        Conversation blocked
      </span>
    );
  }

  if (!connected) {
    return (
      <span className="td-chat-presence-label">
        Connection unavailable
      </span>
    );
  }

  if (online) {
    return (
      <span className="td-chat-presence-label is-online">
        Online
      </span>
    );
  }

  const date =
    seen?.employeeId === employeeId && seen.value
      ? new Date(seen.value)
      : null;

  return (
    <span className="td-chat-presence-label">
      {date && Number.isFinite(date.getTime())
        ? `Offline · Last online ${dateTime.format(date)}`
        : "Offline · No saved online history yet"}
    </span>
  );
}