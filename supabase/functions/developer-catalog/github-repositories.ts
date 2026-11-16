import { Buffer } from "node:buffer";
import { createPrivateKey, sign } from "node:crypto";

type Repo = { slug: string; private?: boolean };

const slugPattern = /^[\w-]+\/[\w.-]+$/;
const env = (name: string) => Deno.env.get(name) || "";
const jwtPart = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export class GitHubError extends Error {
  constructor(public status: number) {
    super("GitHub returned HTTP " + status);
  }
}

export async function github(path: string, token = "", method = "GET") {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new GitHubError(res.status);
  return res.json();
}

let credentials: { token: string; expires: number } | undefined;
let access: { repositories: Repo[]; token: string; until: number } | undefined;
let pending: ReturnType<typeof loadRepositories> | undefined;

async function loadRepositories(appId: string, installationId: string, pem: string) {
  if (!credentials || credentials.expires <= Date.now() + 60_000) {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = jwtPart({ alg: "RS256", typ: "JWT" }) + "." +
      jwtPart({ iss: appId, iat: now - 60, exp: now + 540 });
    const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
    const jwt = unsigned + "." +
      sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url");

    const result = await github(
      "/app/installations/" + installationId + "/access_tokens",
      jwt,
      "POST",
    );
    credentials = { token: result.token, expires: Date.parse(result.expires_at) };
  }

  const { token } = credentials;
  const repositories = new Map<string, Repo>();

  for (let page = 1; page <= 50; page++) {
    const result = await github("/installation/repositories?per_page=100&page=" + page, token);
    if (!Array.isArray(result.repositories)) {
      throw new Error("Invalid GitHub repository list.");
    }

    for (const repo of result.repositories) {
      if (typeof repo.full_name === "string" && slugPattern.test(repo.full_name)) {
        repositories.set(repo.full_name.toLowerCase(), {
          slug: repo.full_name,
          private: repo.private === true,
        });
      }
    }

    if (result.repositories.length < 100 || page * 100 >= result.total_count) {
      return {
        repositories: [...repositories.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
        token,
      };
    }
  }

  throw new Error("Repository list exceeds the catalog limit.");
}

export async function accessibleRepositories() {
  const appId = env("TD_GITHUB_APP_ID");
  const installationId = env("TD_GITHUB_INSTALLATION_ID");
  const key = env("TD_GITHUB_APP_PRIVATE_KEY");

  if (!appId && !installationId && !key) {
    const slug = env("TD_CATALOG_GITHUB_REPO") || "sincere-hub/Tech-dev-working-app-space-";
    if (!slugPattern.test(slug)) throw new Error("Invalid repository setting.");
    return { repositories: [{ slug }], token: env("TD_GITHUB_READ_TOKEN") };
  }

  if (!/^\d+$/.test(appId) || !/^\d+$/.test(installationId) || !key) {
    throw new Error("GitHub App settings are incomplete.");
  }

  if (access && access.until > Date.now()) return access;

  pending ??= loadRepositories(appId, installationId, key).then(result => {
    access = { ...result, until: Date.now() + 60_000 };
    return access;
  }).finally(() => { pending = undefined; });

  return await pending;
}
