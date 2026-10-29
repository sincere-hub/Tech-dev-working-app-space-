import {
  useEffect,
  useSyncExternalStore,
} from "react";
import { supabase } from "./supabase.js";

const empty = new Set();
const listeners = new Set();

let snapshot = {
  owner: "",
  online: empty,
};

let closing = Promise.resolve();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function publish(owner, online = empty) {
  snapshot = { owner, online };

  for (const listener of listeners) {
    listener();
  }
}

export function useOnlineEmployees(userId) {
  const current = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  return current.owner === userId
    ? current.online
    : empty;
}

export function useAppChatPresence(userId) {
  useEffect(() => {
    if (!userId || !supabase) return;

    let live = true;
    let channel;
    let joined = false;

    publish(userId);

    function sync() {
      if (
        !live ||
        !joined ||
        !navigator.onLine
      ) return;

      const online = new Set();

      for (
        const [id, devices]
        of Object.entries(channel.presenceState())
      ) {
        if (
          devices.some(device => device.online === true)
        ) {
          online.add(id);
        }
      }

      publish(userId, online);
    }

    async function track() {
      if (
        !live ||
        !joined ||
        !navigator.onLine
      ) return;

      try {
        const result = await channel.track({
          online: true,
        });

        if (live && result === "ok") sync();
      } catch {
        if (live) publish(userId);
      }
    }

    function offline() {
      if (live) publish(userId);
    }

    function hide() {
      if (joined) {
        void channel.untrack().catch(() => {});
      }
    }

    async function start() {
      await closing;

      if (!live) return;

      const { data, error } =
        await supabase.auth.getSession();

      if (
        !live ||
        error ||
        data.session?.user.id !== userId
      ) return;

      await supabase.realtime.setAuth(
        data.session.access_token
      );

      if (!live) return;

      channel = supabase.channel(
        "techdev-online-v1",
        {
          config: {
            private: true,
            presence: { key: userId },
          },
        }
      );

      channel.on(
        "presence",
        { event: "sync" },
        sync
      );

      channel.subscribe(status => {
        if (!live) return;

        joined = status === "SUBSCRIBED";

        if (joined) void track();
        else publish(userId);
      });
    }

    void start().catch(() => {
      if (live) publish(userId);
    });

    window.addEventListener("offline", offline);
    window.addEventListener("online", track);
    window.addEventListener("pageshow", track);
    window.addEventListener("pagehide", hide);

    return () => {
      live = false;
      publish("");

      window.removeEventListener("offline", offline);
      window.removeEventListener("online", track);
      window.removeEventListener("pageshow", track);
      window.removeEventListener("pagehide", hide);

      if (channel) {
        const previous = channel;

        closing = closing
          .then(() =>
            supabase.removeChannel(previous)
          )
          .catch(() => {});
      }
    };
  }, [userId]);
}