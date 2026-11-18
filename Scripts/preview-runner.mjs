import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PORT = 4318;
const devOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const slugPattern = /^[\w-]+\/[\w.-]+$/;
const shaPattern = /^[a-f0-9]{40}$/i;
const TTL = 15 * 60_000;

export function parseTargets(source) {
  const raw = JSON.parse(source);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected an object of preview targets.");
  }

  const known = new Map();
  for (const [slug, target] of Object.entries(raw)) {
    const url = new URL(target.url);
    if (
      !slugPattern.test(slug) || /\/\.{1,2}$/.test(slug) ||
      typeof target.commit !== "string" || !shaPattern.test(target.commit) ||
      url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    ) {
      throw new Error("Each repo needs a GitHub slug, full commit SHA and a trusted HTTPS staging URL.");
    }

    if (!Array.isArray(target.allowedOrigins ?? [])) {
      throw new Error("allowedOrigins must be a list.");
    }

    const allowed = new Set([url.origin]);
    for (const value of target.allowedOrigins || []) {
      const extra = new URL(value);
      if (extra.protocol !== "https:" || extra.origin !== value) {
        throw new Error("Allowed origins must be exact HTTPS origins.");
      }
      allowed.add(extra.origin);
    }

    known.set(slug, { url: url.href, commit: target.commit.toLowerCase(), allowed });
  }
  return known;
}

function readDevice(device) {
  if (
    !device || !["mobile", "desktop"].includes(device.type) ||
    !Number.isInteger(device.width) || device.width < 280 || device.width > 1600 ||
    !Number.isInteger(device.height) || device.height < 400 || device.height > 1200
  ) {
    throw new Error("Invalid device dimensions.");
  }
  const name = typeof device.name === "string"
    ? device.name.replace(/[\r\n]/g, " ").trim().slice(0, 60) : "";
  return { name: name || device.type, type: device.type, width: device.width, height: device.height };
}

export function createRunner(targets, launch) {
  let active;
  let finished;
  let busy = false;

  async function finish(run, measure = true) {
    let overflow = null;
    if (measure) {
      let timeout;
      try {
        overflow = await Promise.race([
          run.page.evaluate(() => Math.max(0,
            document.documentElement.scrollWidth - document.documentElement.clientWidth)),
          new Promise(resolve => { timeout = setTimeout(() => resolve(null), 1000); }),
        ]);
      } catch { /* The preview window may already be closed. */ }
      finally { clearTimeout(timeout); }
    }

    finished = {
      id: run.id, repo: run.repo, commit: run.commit, device: run.device,
      duration: Math.floor((Date.now() - run.started) / 1000),
      events: run.events.slice(), total: run.total, problems: run.problems,
      overflow, stopped: Date.now(),
    };
    active = undefined;
    await run.browser.close().catch(() => {});
    return finished;
  }

  const timer = setInterval(() => {
    if (active && Date.now() - active.started > TTL && !busy) {
      busy = true;
      void finish(active, false).finally(() => { busy = false; });
    }
    if (finished && Date.now() - finished.stopped > TTL) finished = undefined;
  }, 15_000).unref();

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    const localHost = request.headers.host === "127.0.0.1:" + PORT ||
      request.headers.host === "localhost:" + PORT;
    const allowed = localHost && devOrigins.has(origin);

    const reply = (code, body) => {
      if (allowed) response.setHeader("Access-Control-Allow-Origin", origin);
      response.writeHead(code, {
        "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
      });
      response.end(body === undefined ? "" : JSON.stringify(body));
    };

    if (!allowed) return reply(403, { error: "Open Testing from Vite on localhost:5173." });
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return reply(204);
    }
    if (request.method === "GET" && request.url === "/targets") {
      return reply(200, [...targets].map(([repo, target]) => ({ repo, commit: target.commit })));
    }
    if (request.method !== "POST" || !request.headers["content-type"]?.startsWith("application/json")) {
      return reply(405, { error: "Unsupported request." });
    }
    if (!["/start", "/stop"].includes(request.url)) return reply(404, { error: "Unknown runner route." });
    if (busy) return reply(409, { error: "The runner is busy. Try again." });

    busy = true;
    let opening;
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 4096) throw new Error("Invalid runner request.");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

      if (request.url === "/start") {
        if (active) return reply(409, { error: "Stop the current preview first." });
        const target = targets.get(body.repo);
        if (!target) return reply(404, { error: "This repo has no approved staging preview." });

        const device = readDevice(body.device);
        opening = await launch();
        const browser = opening;
        const mobile = device.type === "mobile";
        const context = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, serviceWorkers: "block",
        });

        const permit = address => {
          try {
            const url = new URL(address);
            return url.protocol === "https:" && target.allowed.has(url.origin);
          } catch { return false; }
        };

        await context.route("**/*", route =>
          permit(route.request().url()) ? route.continue() : route.abort("blockedbyclient"));
        await context.routeWebSocket("**/*", socket => socket.close());

        const page = await context.newPage();
        context.on("page", popup => {
          if (popup !== page) void popup.close().catch(() => {});
        });

        const run = {
          id: randomUUID(), repo: body.repo, commit: target.commit, device, browser, page,
          started: Date.now(), events: [], total: 0, problems: 0,
        };

        function record(message, problem = false) {
          run.total++;
          if (problem) run.problems++;
          run.events.push(Math.floor((Date.now() - run.started) / 1000) + "s · " + message);
          if (run.events.length > 45) run.events.shift();
        }

        page.on("framenavigated", frame => {
          if (frame !== page.mainFrame() || frame.url() === "about:blank") return;
          if (!permit(frame.url())) {
            record("Navigation left the approved preview", true);
            void page.close().catch(() => {});
          } else record("Page navigation");
        });
        page.on("pageerror", () => record("JavaScript error", true));
        page.on("requestfailed", request => {
          if (permit(request.url())) record("Network request failed", true);
        });
        page.on("response", res => {
          if (permit(res.url()) && res.status() >= 400) record("HTTP " + res.status(), true);
        });

        await page.exposeBinding("__techdevPreviewTap", ({ frame }) => {
          if (frame === page.mainFrame()) record("Clicked or tapped");
        });
        await page.addInitScript(() => {
          document.addEventListener("click", () => {
            window.__techdevPreviewTap().catch(() => {});
          }, true);
        });

        await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 20_000 })
          .catch(() => record("Initial page load did not complete", true));

        active = run;
        opening = undefined;
        return reply(200, { id: run.id, repo: run.repo, commit: run.commit });
      }

      if (finished && body.id === finished.id) return reply(200, finished);
      if (!active || body.id !== active.id) {
        return reply(404, { error: "This recording is no longer running." });
      }
      return reply(200, await finish(active));
    } catch {
      if (opening) await opening.close().catch(() => {});
      return reply(400, {
        error: "The request failed. Check the device settings and that Playwright Chromium is installed.",
      });
    } finally { busy = false; }
  });

  server.on("close", () => {
    clearInterval(timer);
    if (active) void active.browser.close().catch(() => {});
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = await import("playwright");
  const targets = parseTargets(readFileSync("preview-targets.local.json", "utf8"));
  createRunner(targets, () => chromium.launch({ headless: false, chromiumSandbox: true }))
    .listen(PORT, "127.0.0.1", () => {
      process.stdout.write("Preview runner ready on 127.0.0.1:4318\n");
    });
}