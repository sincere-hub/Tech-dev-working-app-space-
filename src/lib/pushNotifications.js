import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

const base = new URL(
  import.meta.env.BASE_URL || "/",
  window.location.origin,
);

const workerUrl = new URL("legion-push-sw.js", base).href;

export function notificationSupportError() {
  if (!window.isSecureContext) {
    return "Notifications require HTTPS or localhost.";
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "This browser does not support Legion push notifications.";
  }

  return "";
}

function timed(promise, milliseconds = 15000) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("The request timed out. Try again.")),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function ownerClient(userId) {
  const { data, error } = await timed(supabase.auth.getSession());

  if (error) throw error;

  if (!userId || data.session?.user.id !== userId) {
    throw new Error(
      "Your account changed. Reopen the notification settings.",
    );
  }

  const accessToken = data.session.access_token;

  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      accessToken: async () => accessToken,
    },
  );
}


async function database(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const { data, error } = await query.abortSignal(controller.signal);

    if (error) {
      throw new Error(
        error.message || "Notification settings could not be saved.",
      );
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

function publicKey() {
  const value =
  String(
    import.meta.env.VITE_VAPID_PUBLIC_KEY || ""
  ).trim() ||
  "BOmcpObwRAKfa8vOwYkv_obtcxn7oHnreOqWxEM5S5BLS3hVpTYY-Dg0L8abZf2BCRpqFGY4rtoUN6sb1mzOE0k".trim();

  if (!/^[A-Za-z0-9_-]{87}$/.test(value)) {
    throw new Error(
      "Notifications are not configured yet. Please contact your administrator.",
    );
  }

  const raw = atob(
    value.replace(/-/g, "+").replace(/_/g, "/") + "=",
  );

  const bytes = Uint8Array.from(
    raw,
    character => character.charCodeAt(0),
  );

  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error("Invalid VAPID public key.");
  }

  return bytes;
}

async function existingSubscription() {
  const registration = await timed(
    navigator.serviceWorker.getRegistration(base.href),
  );

  if (registration?.active?.scriptURL !== workerUrl) return null;

  return timed(registration.pushManager.getSubscription());
}

export async function getDeviceNotificationStatus(userId) {
  const problem = notificationSupportError();

  if (problem) {
    return {
      enabled: false,
      supported: false,
      blocked: false,
      message: problem,
    };
  }

  const blocked = Notification.permission === "denied";
  const subscription = await existingSubscription();

  if (!subscription || Notification.permission !== "granted") {
    return { enabled: false, supported: true, blocked };
  }

  const client = await ownerClient(userId);

  const rows = await database(
    client
      .from("push_subscriptions")
      .select("id")
      .eq("employee_id", userId)
      .eq("endpoint", subscription.endpoint),
  );

  return {
    enabled: Boolean(rows?.length),
    supported: true,
    blocked,
  };
}

export async function enableDeviceNotifications(userId) {
  const problem = notificationSupportError();
  if (problem) throw new Error(problem);

  const key = publicKey();

  if (!userId) {
    throw new Error("Sign in before enabling notifications.");
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked. Allow them in your browser's site settings."
        : "Permission was not granted. You can try again later.",
    );
  }

  const client = await ownerClient(userId);

  await timed(
    navigator.serviceWorker.register(workerUrl, {
      scope: base.pathname,
    }),
  );

  const registration = await timed(
    navigator.serviceWorker.ready,
    20000,
  );

  if (registration.active?.scriptURL !== workerUrl) {
    throw new Error(
      "The notification worker is not ready. Reload Legion and try again.",
    );
  }

  let subscription = await timed(
    registration.pushManager.getSubscription(),
  );

  const oldKey = subscription?.options?.applicationServerKey;

  if (
    subscription &&
    oldKey &&
    (
      oldKey.byteLength !== key.length ||
      !new Uint8Array(oldKey).every(
        (byte, index) => byte === key[index],
      )
    )
  ) {
    await timed(subscription.unsubscribe());
    subscription = null;
  }

  if (!subscription) {
    subscription = await timed(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }),
      20000,
    );
  }

  try {
    const json = subscription.toJSON();

    if (!json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("Device notification keys are missing.");
    }

    await database(
      client.rpc("register_push_device", {
        p_endpoint: subscription.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth_key: json.keys.auth,
      }),
    );

    const { data, error } = await timed(
      supabase.auth.getSession(),
    );

    if (error || data.session?.user.id !== userId) {
      await database(
        client
          .from("push_subscriptions")
          .delete()
          .eq("employee_id", userId)
          .eq("endpoint", subscription.endpoint),
      );

      throw new Error(
        "Your account changed. Enable notifications after signing in again.",
      );
    }
  } catch (error) {
    await timed(subscription.unsubscribe()).catch(() => {});
    throw error;
  }
}

export async function disableDeviceNotifications(userId) {
  if (notificationSupportError()) return;

  const subscription = await existingSubscription();
  if (!subscription) return;

  let client;
  let problem;

  try {
    client = await ownerClient(userId);
  } catch (error) {
    problem = error;
  }

  try {
    const removed = await timed(subscription.unsubscribe());

    if (!removed) {
      problem = new Error(
        "The browser could not disable notifications. Try again.",
      );
    }
  } catch (error) {
    problem = error;
  }

  if (client) {
    await database(
      client
        .from("push_subscriptions")
        .delete()
        .eq("employee_id", userId)
        .eq("endpoint", subscription.endpoint),
    );
  }

  if (problem) throw problem;
}