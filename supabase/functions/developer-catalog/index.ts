import { createClient } from "npm:@supabase/supabase-js@2";
import { accessibleRepositories, github, GitHubError } from "./github-repositories.ts";
import { handleReviewRequest } from "./review-tools.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
};

const response = (status: number, body: unknown) =>
  Response.json(body, { status, headers });
const env = (name: string) => Deno.env.get(name) || "";
const pathUrl = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function loadPipelineRuns(slug: string, token: string) {
  const { workflow_runs } = await github(
    "/repos/" + slug + "/actions/runs?per_page=20",
    token,
  );

  if (!Array.isArray(workflow_runs)) {
    throw new Error("GitHub did not return a workflow run list.");
  }

  return workflow_runs.map(run => ({
    id: run.id,
    name: run.name || "GitHub workflow",
    branch: run.head_branch || "",
    commit: run.head_sha?.slice(0, 7) || "",
    event: run.event || "",
    status: run.status || "",
    conclusion: run.conclusion || "",
    createdAt: run.created_at,
    url: "https://github.com/" + slug + "/actions/runs/" + Number(run.id),
  }));
}

async function discover(slug: string, token: string) {
  const read = (path = "") => github("/repos/" + slug + path, token);
  const repo = await read();
  const branch = repo.default_branch || "";
  const ref = encodeURIComponent(branch);
  let tree: { path: string; type: string }[] = [];

  if (branch) {
    try {
      const result = await read("/git/trees/" + ref + "?recursive=1");
      if (result.truncated || !Array.isArray(result.tree)) {
        throw new Error("GitHub returned an incomplete file list.");
      }
      tree = result.tree;
    } catch (error) {
      if (!(error instanceof GitHubError) || error.status !== 409) throw error;
    }
  }

  const files = new Set(tree.filter(entry => entry.type === "blob").map(entry => entry.path));
  const repoUrl = "https://github.com/" + slug;
  const source = (path: string) => repoUrl + "/blob/" + ref + "/" + pathUrl(path);
  const items: { kind: string; name: string; path: string; url: string }[] = [];

  function add(kind: string, name: string, path: string) {
    items.push({ kind, name, path, url: source(path) });
  }

  const knownFiles = [
    ["README.md", "Documentation"],
    ["package.json", "JavaScript project"],
    ["pyproject.toml", "Python project"],
    ["pom.xml", "Java project"],
    ["go.mod", "Go project"],
    ["Cargo.toml", "Rust project"],
    ["Dockerfile", "Container"],
    ["render.yaml", "Render configuration"],
    ["vercel.json", "Vercel configuration"],
    ["src/App.jsx", "React entry"],
  ];

  for (const [path, kind] of knownFiles) {
    if (!files.has(path)) continue;
    const name = path === "src/App.jsx" &&
      slug.toLowerCase() === "sincere-hub/tech-dev-working-app-space-"
      ? "Employee Workspace" : path;
    add(kind, name, path);
  }

  if (files.has("supabase/schema.sql")) {
    add("Database", "Supabase schema", "supabase/schema.sql");
  }

  for (const path of [...files].sort()) {
    const fn = /^supabase\/functions\/([^/_][^/]*)\/index\.(?:tsx?|jsx?)$/.exec(path);
    if (fn) add("Backend function", fn[1], path);
    if (/^supabase\/migrations\/[^/]+\.sql$/.test(path)) {
      add("Migration", path.split("/").at(-1)!, path);
    }
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) {
      add("Workflow", path.split("/").at(-1)!, path);
    }
  }

  const ownerFile = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]
    .find(path => files.has(path));

  async function latestRun() {
    if (!branch || !items.some(item => item.kind === "Workflow")) return null;

    try {
      const { workflow_runs } = await read("/actions/runs?per_page=1&event=push&branch=" + ref);
      const run = workflow_runs[0];
      return run ? {
        status: run.conclusion || run.status,
        name: run.name,
        commit: run.head_sha?.slice(0, 7),
        url: repoUrl + "/actions/runs/" + Number(run.id),
      } : { status: "no push runs yet" };
    } catch {
      return { status: "unavailable" };
    }
  }

  async function defaultReviewers() {
    if (!ownerFile) return [];

    try {
      const { content, encoding } = await read("/contents/" + pathUrl(ownerFile) + "?ref=" + ref);
      if (encoding !== "base64") return [];
      const rules = atob(content.replace(/\s/g, "")).split(/\r?\n/);
      const line = rules.map(rule => rule.trim()).findLast(rule => /^\*(?:\s|$)/.test(rule));
      return (line?.split("#")[0].split(/\s+/).slice(1) || [])
        .filter(name => /^@[\w-]+(?:\/[\w-]+)?$/.test(name));
    } catch {
      return [];
    }
  }

  const [ci, reviewers] = await Promise.all([latestRun(), defaultReviewers()]);
  return {
    slug, branch, repoUrl, items, ci, reviewers,
    checkedAt: new Date().toISOString(),
    codeowners: ownerFile ? source(ownerFile) : null,
  };
}

Deno.serve(async (req: Request) => {
  const codeReviewResponse = await handleReviewRequest(req);

  if (codeReviewResponse) {
    return codeReviewResponse;
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return response(405, { error: "Use POST." });

  const auth = req.headers.get("Authorization") || "";
  const sessionToken = /^Bearer (\S+)$/i.exec(auth)?.[1];
  if (!sessionToken) return response(401, { error: "Sign in first." });

  try {
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await db.auth.getUser(sessionToken);
    if (authError || !user) return response(401, { error: "Sign in again." });

    const { data: employee, error } = await db.from("employees")
      .select("role,is_banned").eq("id", user.id).maybeSingle();

    if (error) return response(503, { error: "Could not check workspace access." });
    if (!employee || employee.is_banned) {
      return response(403, { error: "Catalog access denied." });
    }

    if (employee.role !== "admin") {
      const permission = await db.rpc("td_can_request_staging");
      if (permission.error || permission.data !== true) {
        return response(403, { error: "Catalog access denied." });
      }
    }

    const rawBody = await req.text();
    let selection: unknown;
    let pipelineView = false;

    if (rawBody.trim()) {
      try {
        const body = JSON.parse(rawBody);
        selection = body?.repo;
        pipelineView = body?.view === "pipelines";
      } catch {
        return response(400, { error: "Invalid catalog request." });
      }
    }

    if (selection !== undefined && typeof selection !== "string") {
      return response(400, { error: "Invalid repository selection." });
    }

    const { repositories, token: githubToken } = await accessibleRepositories();
    const selected = typeof selection === "string"
      ? repositories.find(repo => repo.slug.toLowerCase() === selection.toLowerCase())
      : repositories[0];

    if (!selected) {
      if (selection !== undefined) {
        return response(404, { error: "Repository not available in the catalog." });
      }
      return response(200, { repositories, items: [], runs: [], empty: true });
    }

    try {
      if (pipelineView) {
        const runs = await loadPipelineRuns(selected.slug, githubToken);
        return response(200, { slug: selected.slug, repositories, runs });
      }

      const detail = await discover(selected.slug, githubToken);
      return response(200, { ...detail, repositories });
    } catch (error) {
      console.error("developer-catalog:", error instanceof Error ? error.message : "Unexpected error");
      return response(200, {
        repositories, items: [], slug: selected.slug,
        detailError: pipelineView
          ? "Could not read workflow runs. For a private repo, check Actions: Read access."
          : "Could not read this repository. You can select another one or refresh.",
      });
    }
  } catch (error) {
    console.error("developer-catalog:", error instanceof Error ? error.message : "Unexpected error");
    return response(502, { error: "GitHub catalog unavailable. Check the connection and read permissions." });
  }
});
