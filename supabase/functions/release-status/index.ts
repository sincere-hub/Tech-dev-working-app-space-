import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-region",
  "Cache-Control": "no-store",
};

const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers });

const env = (key: string) => Deno.env.get(key)?.trim() || "";

class RenderError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Render HTTP ${status}`);
    this.status = status;
  }
}

const providerErrors: Record<number, string> = {
  401: "Render rejected the API key. Check TD_RENDER_API_KEY in Supabase.",
  403: "The Render API key cannot read this service or its deploys. Check its permissions and workspace.",
  404: "Render could not find this service. Check TD_RENDER_SERVICE_ID and the API key’s workspace.",
  429: "Render rate-limited the request. Wait a minute and refresh.",
};

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
    if (permission.error) {
      return reply(503, { error: "Apply release-flags.sql before connecting Render." });
    }
    if (permission.data !== true) {
      return reply(403, { error: "Admin access required." });
    }

    const service = env("TD_RENDER_SERVICE_ID");
    const token = env("TD_RENDER_API_KEY");

    if (!service) {
      return reply(503, { error: "TD_RENDER_SERVICE_ID is missing from this project's Edge Function Secrets." });
    }
    if (!/^srv-[a-z0-9]+$/i.test(service)) {
      return reply(503, { error: "TD_RENDER_SERVICE_ID must be the srv-… ID, without quotes or the rest of the dashboard URL." });
    }
    if (!token) {
      return reply(503, { error: "TD_RENDER_API_KEY is missing from this project's Edge Function Secrets." });
    }

    async function render(suffix = "") {
      const result = await fetch(`https://api.render.com/v1/services/${service}${suffix}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });

      if (!result.ok) throw new RenderError(result.status);
      return result.json();
    }

    const [info, rows] = await Promise.all([render(), render("/deploys?limit=20")]);
    if (info.id !== service || !Array.isArray(rows)) {
      throw new Error("Unexpected Render response");
    }

    const dashboard = new URL(info.dashboardUrl);
    if (dashboard.origin !== "https://dashboard.render.com" || dashboard.username || dashboard.password) {
      throw new Error("Unexpected Render dashboard link");
    }

    return reply(200, {
      connected: true,
      service: info.name,
      dashboardUrl: dashboard.href,
      deploys: rows.map(({ deploy: d }) => ({
        id: d.id,
        status: d.status,
        trigger: d.trigger,
        createdAt: d.createdAt,
        commit: d.commit?.id || "",
        message: d.commit?.message?.split("\n")[0].slice(0, 160) || "",
      })),
    });
  } catch (error) {
    if (error instanceof RenderError) {
      return reply(502, {
        error: providerErrors[error.status] || `Render returned HTTP ${error.status}.`,
      });
    }
    return reply(502, { error: "Could not read Render deployments. Check the service ID and API key permissions." });
  }
});
