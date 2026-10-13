const notificationViews = new Set([
  "overview", "tasks", "attendance", "leave", "suite",
  "payslips", "notices", "activity",
]);

function notificationTarget(value) {
  const data = value && typeof value === "object" ? value : {};

  return {
    view: notificationViews.has(data.view) ? data.view : "notices",
    moduleId:
      data.view === "suite" &&
      typeof data.moduleId === "string" &&
      /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(data.moduleId) &&
      data.moduleId.length <= 100
        ? data.moduleId
        : "",
  };
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data?.json() || {};
  } catch {
    // Use a generic notification if the payload cannot be read.
  }

  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.slice(0, 120)
      : "Legion · Workspace update";

  const tag =
    typeof data.tag === "string" &&
    /^legion-[a-z0-9-]+$/i.test(data.tag)
      ? data.tag.slice(0, 100)
      : "legion-update";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: "Open Legion to view this update.",
      tag,
      data: notificationTarget(data),
    }),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = notificationTarget(event.notification.data);
  const url = new URL(self.registration.scope);

  url.searchParams.set("notificationView", target.view);

  if (target.moduleId) {
    url.searchParams.set("notificationModule", target.moduleId);
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        const current = new URL(client.url);

        if (
          current.origin === url.origin &&
          current.pathname === url.pathname
        ) {
          try {
            await client.focus();
            client.postMessage({
              type: "LEGION_NOTIFICATION_OPEN",
              ...target,
            });
            return;
          } catch {
            // Try another window or open Legion.
          }
        }
      }

      await self.clients.openWindow(url.href);
    })(),
  );
});