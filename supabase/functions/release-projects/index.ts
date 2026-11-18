import { createClient } from "npm:@supabase/supabase-js@2";
import { accessibleRepositories, github, GitHubError } from "../developer-catalog/github-repositories.ts";

const owner = "sincere-hub";
const pageSize = 4;
const recent = 4;
const env = (name: string) => Deno.env.get(name)?.trim() || "";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-region",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: unknown) => Response.json(body, { status, headers });

type Project = {
  id: string;
  name: string;
  slug: string;
  provider: "Render" | "Vercel";
  dashboard?: string;
};

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 180) : "";

const repoSlug = (value: unknown) =>
  /^(?:https:\/\/github\.com\/|git@github\.com:)?([\w-]+\/[\w.-]+?)(?:\.git)?\/?$/i
    .exec(clean(value))?.[1].toLowerCase() || "";

function https(value: unknown, host?: string) {
  try {
    const url = new URL(String(value));
    if (
      url.protocol === "https:" && !url.username && !url.password &&
      (!host || url.origin === `https://${host}`)
    ) {
      url.search = "";
      url.hash = "";
      return url.href;
    }
  } catch { /* Omit invalid links. */ }
  return "";
}

async function read(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function listRender(key: string, scope: string) {
  const items: Project[] = [];
  let cursor = "";

  for (let i = 0; i < 25; i++) {
    const query = new URLSearchParams({
      ownerId: scope, includePreviews: "false", limit: "100",
    });
    if (cursor) query.set("cursor", cursor);

    const rows = await read(`https://api.render.com/v1/services?${query}`, key);
    if (!Array.isArray(rows)) throw new Error("Unexpected Render project list");

    for (const { service: s } of rows) {
      const slug = repoSlug(s?.repo);
      if ((s?.ownerId ?? s?.owner_id) !== scope || !slug || !/^srv-[a-z0-9]+$/i.test(s.id)) {
        continue;
      }
      items.push({
        id: s.id,
        name: clean(s.name),
        slug,
        provider: "Render",
        dashboard: https(s.dashboardUrl, "dashboard.render.com"),
      });
    }

    if (rows.length < 100) return items;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor) break;
    cursor = next;
  }

  throw new Error("Render project listing did not finish");
}

async function listVercel(key: string, team: string) {
  const items: Project[] = [];
  let cursor = "";

  for (let i = 0; i < 25; i++) {
    const query = new URLSearchParams({ teamId: team, limit: "100" });
    if (cursor) query.set("until", cursor);

    const data = await read(`https://api.vercel.com/v10/projects?${query}`, key);
    if (!Array.isArray(data.projects)) throw new Error("Unexpected Vercel project list");

    for (const p of data.projects) {
      const link = p.link;
      const slug = link?.type === "github" ? repoSlug(`${link.org}/${link.repo}`) : "";
      if (slug && /^prj_[a-zA-Z0-9]+$/.test(p.id)) {
        items.push({ id: p.id, name: clean(p.name), slug, provider: "Vercel" });
      }
    }

    if (!data.pagination?.next) return items;
    const next = String(data.pagination.next);
    if (next === cursor) break;
    cursor = next;
  }

  throw new Error("Vercel project listing did not finish");
}

const cache = new Map<string, { expires: number; task: Promise<Project[]> }>();

async function discover(name: string, token: string, scope: string, list: typeof listRender) {
  if (!token || !scope) {
    return { projects: [] as Project[], note: `${name} workspace not connected directly.` };
  }

  let entry = cache.get(name);
  if (!entry || entry.expires <= Date.now()) {
    entry = { expires: Date.now() + 60_000, task: list(token, scope) };
    cache.set(name, entry);
  }

  try {
    return { projects: await entry.task, note: "" };
  } catch {
    if (cache.get(name) === entry) cache.delete(name);
    return {
      projects: [] as Project[],
      note: `Could not read ${name} workspace projects. Check its access settings.`,
    };
  }
}

async function history(project: Project, renderKey: string, vercelKey: string, team: string) {
  try {
    if (project.provider === "Render") {
      const rows = await read(
        `https://api.render.com/v1/services/${project.id}/deploys?limit=${recent}`,
        renderKey,
      );
      if (!Array.isArray(rows)) throw new Error();

      return {
        ...project,
        deploys: rows.map(({ deploy: d }) => ({
          id: d.id,
          state: d.status,
          at: d.createdAt,
          commit: clean(d.commit?.id),
          label: clean(d.commit?.message).split("\n")[0],
        })),
      };
    }

    const query = new URLSearchParams({
      projectId: project.id, teamId: team, limit: String(recent),
    });
    const { deployments } = await read(`https://api.vercel.com/v7/deployments?${query}`, vercelKey);
    if (!Array.isArray(deployments)) throw new Error();

    return {
      ...project,
      deploys: deployments.map(d => ({
        id: d.uid,
        state: d.readyState || d.state,
        at: d.createdAt ?? d.created,
        commit: clean(d.gitSource?.sha || d.meta?.githubCommitSha),
        label: clean(d.target),
        url: d.url ? https(`https://${d.url}`) : "",
      })),
    };
  } catch {
    return { ...project, deploys: [], error: "Could not read this project’s deployments." };
  }
}

async function reported(slug: string, token: string) {
  const path = `/repos/${slug}/deployments`;
  try {
    const rows = await github(`${path}?per_page=${recent}`, token);
    if (!Array.isArray(rows)) throw new Error();

    const deploys = await Promise.all(rows.map(async d => {
      let status;
      if (Number.isSafeInteger(d.id)) {
        const statuses = await github(`${path}/${d.id}/statuses?per_page=1`, token).catch(() => []);
        status = statuses?.[0];
      }
      return {
        id: d.id,
        state: clean(status?.state) || "Status unavailable",
        at: d.created_at,
        commit: clean(d.sha),
        label: clean(d.environment),
        url: https(status?.environment_url || status?.log_url),
      };
    }));

    return { deploys, error: "" };
  } catch (error) {
    const permission = error instanceof GitHubError && [403, 404].includes(error.status);
    return {
      deploys: [],
      error: permission
        ? "Check the GitHub App’s Deployments: Read-only permission."
        : "GitHub deployment history unavailable.",
    };
  }
}

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
    if (permission.error) return reply(503, { error: "Apply release-flags.sql first." });
    if (permission.data !== true) return reply(403, { error: "Admin access required." });

    if (!["TD_GITHUB_APP_ID", "TD_GITHUB_INSTALLATION_ID", "TD_GITHUB_APP_PRIVATE_KEY"].every(env)) {
      return reply(503, {
        error: "Connect the GitHub App installation on sincere-hub to list all its repositories.",
      });
    }

    const { repositories, token } = await accessibleRepositories();
    const all = repositories.filter(repo => repo.slug.split("/")[0].toLowerCase() === owner);
    const body = await req.json().catch(() => ({}));
    const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    const page = Math.max(1, Math.min(Number.isSafeInteger(body?.page) ? body.page : 1, totalPages));
    const selected = all.slice((page - 1) * pageSize, page * pageSize);

    const renderKey = env("TD_RENDER_API_KEY");
    const vercelKey = env("TD_VERCEL_TOKEN");
    const team = env("TD_VERCEL_TEAM_ID");

    const [render, vercel, githubHistories] = await Promise.all([
      discover("Render", renderKey, env("TD_RENDER_OWNER_ID"), listRender),
      discover("Vercel", vercelKey, team, listVercel),
      Promise.all(selected.map(repo => reported(repo.slug, token))),
    ]);

    const hosts = [...render.projects, ...vercel.projects]
      .filter(project => selected.some(repo => repo.slug.toLowerCase() === project.slug));

   const histories: Awaited<ReturnType<typeof history>>[] = [];
    for (let i = 0; i < hosts.length; i += 4) {
      histories.push(...await Promise.all(
        hosts.slice(i, i + 4).map(p => history(p, renderKey, vercelKey, team)),
      ));
    }

    const projects = selected.map(({ slug }, i) => ({
      slug,
      name: slug.split("/")[1],
      hosts: histories.filter(p => p.slug === slug.toLowerCase()),
      github: githubHistories[i],
    }));

    return reply(200, {
      projects, page, totalPages, total: all.length,
      notes: [render.note, vercel.note].filter(Boolean),
    });
  } catch {
    return reply(502, {
      error: "Could not load GitHub repositories. Check that the GitHub App is installed on sincere-hub and its secrets are correct.",
    });
  }
});