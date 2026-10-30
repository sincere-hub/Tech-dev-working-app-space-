import { useEffect } from "react";
import { supabase } from "./supabase.js";

export function useChatHeartbeat(userId) {
  useEffect(() => {
    if (!userId || !supabase) return;

    let stopped = false;
    let request = null;

    async function pulse() {
      if (
        stopped ||
        request ||
        !navigator.onLine
      ) {
        return;
      }

      const controller = new AbortController();
      request = controller;

      const timeout = setTimeout(
        () => controller.abort(),
        12000,
      );
try {
  const { error } = await supabase
    .rpc("td_chat_touch_presence_v1")
    .abortSignal(controller.signal);

  if (error) throw error;
} catch (failure) {
  console.warn(
    "TechDev last-online heartbeat:",
    failure?.message || "Request failed",
  );
}
      finally {
        clearTimeout(timeout);

        if (request === controller) {
          request = null;
        }
      }
    }

    void pulse();

    const timer = setInterval(pulse, 30000);

    window.addEventListener("online", pulse);
    window.addEventListener("pageshow", pulse);

    return () => {
      stopped = true;
      clearInterval(timer);

      window.removeEventListener("online", pulse);
      window.removeEventListener("pageshow", pulse);

      request?.abort();
    };
  }, [userId]);
}