const notificationViews = new Set([
  "overview",
  "tasks",
  "attendance",
  "leave",
  "suite",
  "payslips",
  "notices",
  "activity",
]);

function notificationTarget(value) {
  const data = value && typeof value === "object"
    ? value
    : {};

  return {
    view: notificationViews.has(data.view)
      ? data.view
      : "notices",

    moduleId:
      data.view === "suite" &&
      typeof data.moduleId === "string" &&
      /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(
        data.moduleId
      ) &&
      data.moduleId.length <= 100
        ? data.moduleId
        : "",
  };
}

// The build fills in these two values automatically.
const SHELL_FILES = [];
const SHELL_VERSION = "dev";

const scope = new URL(self.registration.scope);
const prefix = `techdev-shell:${scope.pathname}:`;
const cacheName = prefix + SHELL_VERSION;

const shellURLs = new Set(
  SHELL_FILES.map(file => new URL(file, scope).href)
);

const indexURL = new URL("index.html", scope).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    if (SHELL_FILES.length) {
      const cache = await caches.open(cacheName);
      await cache.addAll([...shellURLs]);
    }

    if (!self.registration.active) {
      await self.skipWaiting();
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    if (SHELL_FILES.length) {
      for (const name of await caches.keys()) {
        if (
          name.startsWith(prefix) &&
          name !== cacheName
        ) {
          await caches.delete(name);
        }
      }
    }

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (
    !SHELL_FILES.length ||
    event.request.method !== "GET"
  ) {
    return;
  }

  const url = new URL(event.request.url);

  if (
    url.origin !== scope.origin ||
    !url.pathname.startsWith(scope.pathname)
  ) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const controller = new AbortController();

      const timer = setTimeout(
        () => controller.abort(),
        3500
      );

      try {
        const response = await fetch(
          event.request,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Navigation unavailable");
        }

        return response;
      } catch {
        const cache = await caches.open(cacheName);
        const saved = await cache.match(indexURL);

        if (saved) {
          const headers = new Headers(saved.headers);

          headers.delete("Content-Encoding");
          headers.delete("Content-Length");

          const html = (await saved.text()).replace(
            /<html(?=\s|>)/i,
            '<html data-techdev-offline="true"'
          );

          return new Response(html, {
            status: 200,
            headers,
          });
        }

        return new Response(
          "Connect once to prepare Tech Dev for offline use.",
          {
            status: 503,
            headers: {
              "Content-Type":
                "text/plain; charset=utf-8",
            },
          }
        );
      } finally {
        clearTimeout(timer);
      }
    })());

    return;
  }

  // Only cache the app's public build files.
  // Supabase and private API responses are not cached here.
  if (shellURLs.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);

      return (
        await cache.match(event.request)
      ) || fetch(event.request);
    })());
  }
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data?.json() || {};
  } catch {
    // Use the generic notification.
  }

  const title =
    typeof data.title === "string" &&
    data.title.trim()
      ? data.title.slice(0, 120)
      : "Tech Dev · Workspace update";

  const tag =
    typeof data.tag === "string" &&
    /^techdev-[a-z0-9-]+$/i.test(data.tag)
      ? data.tag.slice(0, 100)
      : "techdev-update";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: "Open Tech Dev to view this update.",
      tag,
      data: notificationTarget(data),
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = notificationTarget(
    event.notification.data
  );

  const url = new URL(self.registration.scope);

  url.searchParams.set(
    "notificationView",
    target.view
  );

  if (target.moduleId) {
    url.searchParams.set(
      "notificationModule",
      target.moduleId
    );
  }

  event.waitUntil((async () => {
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
            type: "TECHDEV_NOTIFICATION_OPEN",
            ...target,
          });

          return;
        } catch {
          // Try another window.
        }
      }
    }

    await self.clients.openWindow(url.href);
  })());
});