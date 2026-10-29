import { useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { clearOfflineWorkspace } from "./offlineWorkspace.js";

export default function useEmployeeAccess(userId, onBlocked) {
  const callback = useRef(onBlocked);
  callback.current = onBlocked;

  useEffect(() => {
    if (!userId) return;

    let live = true;
    let running = false;
    let kicked = false;

    async function check() {
      if (!live || running || kicked) return;

      const key = `techdev-banned:${userId}`;

      if (!navigator.onLine) {
        try {
          if (localStorage.getItem(key) === "1") {
            clearOfflineWorkspace();
            callback.current?.();
          }
        } catch {}

        return;
      }

      running = true;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        8000
      );

      try {
        const { data: auth } =
          await supabase.auth.getSession();

        if (!live || auth.session?.user.id !== userId) return;

        const { data, error } = await supabase
          .rpc("techdev_access_state")
          .setHeader(
            "Authorization",
            `Bearer ${auth.session.access_token}`
          )
          .abortSignal(controller.signal);

        const banned =
          data?.banned === true ||
          /TECHDEV_ACCOUNT_BANNED/.test(error?.message || "");

        const denied =
          banned ||
          data?.allowed === false ||
          /TECHDEV_SESSION_REVOKED/.test(error?.message || "");

        if (!live) return;

        if (!denied) {
          if (!error && data?.allowed === true) {
            try {
              localStorage.removeItem(key);
            } catch {}
          }

          return;
        }

        const { data: current } =
          await supabase.auth.getSession();

        if (!live || current.session?.user.id !== userId) return;

        kicked = true;

        try {
          sessionStorage.setItem(
            "techdev-access-notice",
            banned
              ? "Your account has been banned. Contact an administrator."
              : "Your session has ended. Please sign in again."
          );

          if (banned) localStorage.setItem(key, "1");
        } catch {}

        clearOfflineWorkspace();
        callback.current?.();

        void supabase.removeAllChannels().catch(() => {});

        await supabase.auth.signOut({ scope: "local" });
      } finally {
        clearTimeout(timeout);
        running = false;
      }
    }

    const poll = () => {
      void check().catch(() => {});
    };

    poll();

    const timer = setInterval(poll, 5000);

    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    window.addEventListener("pageshow", poll);

    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
      window.removeEventListener("pageshow", poll);
    };
  }, [userId]);
}