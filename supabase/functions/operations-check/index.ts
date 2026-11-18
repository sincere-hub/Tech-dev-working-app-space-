import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-region",
  "Cache-Control": "no-store",
};
const env = (name: string) => Deno.env.get(name)?.trim() || "";
const reply = (status: number, data: unknown) => Response.json(data, { status, headers });

function targets(raw: string): { name: string; url: URL }[] {
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  const entries = Object.entries(value);
  if (entries.length > 10) throw new Error();

  return entries.map(([name, input]) => {
    if (!name.trim() || name.length > 80 || typeof input !== "string") throw new Error();
    const url = new URL(input);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) ||
      /\.(?:localhost|local|internal|test|invalid|home\.arpa)$/i.test(url.hostname)
    ) throw new Error();

    return { name: name.trim(), url };
  });
}

async function probe({ name, url }: { name: string; url: URL }) {
  const start = performance.now();

  try {
    const res = await fetch(url, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000),
    });
    void res.body?.cancel().catch(() => {});

    return {
      name,
      code: res.status,
      ms: Math.round(performance.now() - start),
      state: res.ok ? "Responding" : res.status >= 300 && res.status < 400 ? "Redirect" : "HTTP error",
    };
  } catch (error) {
    return {
      name,
      code: null,
      ms: Math.round(performance.now() - start),
      state: error instanceof Error && error.name === "TimeoutError" ? "Timed out" : "Unreachable",
    };
  }
}

let cached: { config: string; expires: number; result: Promise<unknown> } | undefined;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const auth = req.headers.get("Authorization") || "";
  const jwt = /^Bearer (\S+)$/i.exec(auth)?.[1];
  if (!jwt) return reply(401, { error: "Sign in again." });

  try {
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error } = await db.auth.getUser(jwt);
    if (error || !user) return reply(401, { error: "Sign in again." });

    const permission = await db.rpc("td_release_is_admin");
    if (permission.error) return reply(503, { error: "Apply release-flags.sql first to set up admin access." });
    if (permission.data !== true) return reply(403, { error: "Admin access required." });

    const config = env("TD_MONITOR_TARGETS");
    if (!config) return reply(200, { checks: [] });

    if (!cached || cached.config !== config || cached.expires <= Date.now()) {
      let list: ReturnType<typeof targets>;
      try { list = targets(config); }
      catch {
        return reply(503, { error: "TD_MONITOR_TARGETS must map up to 10 service names to public HTTPS URLs." });
      }

      const result = Promise.all(list.map(probe))
        .then(checks => ({ checks, checkedAt: new Date().toISOString() }));
      cached = { config, expires: Date.now() + 15_000, result };
    }

    return reply(200, await cached.result);
  } catch {
    return reply(502, { error: "Could not run the health check. Try again." });
  }
});