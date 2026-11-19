import { createClient } from "npm:@supabase/supabase-js@2";

import {
  accessibleRepositories,
  github as requestGitHub,
} from "./github-repositories.ts";

import { loadTestTarget } from "./repository-target.mjs";
import { loadBuildJobs } from "./build-jobs.mjs";

const LIMIT = 20;

const reviewHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-region",
  "Cache-Control": "no-store",
};

function repositoryUrl(slug) {
  if (
    !/^[\w-]+\/[\w.-]+$/.test(slug) ||
    /\/\.{1,2}$/.test(slug)
  ) {
    throw new Error("Invalid review repository.");
  }

  return "https://github.com/" + slug;
}

export async function loadPullRequests(slug, token, github) {
  const repoUrl = repositoryUrl(slug);

  const pulls = await github(
    "/repos/" +
      slug +
      "/pulls?state=open&sort=updated&direction=desc&per_page=" +
      LIMIT,
    token
  );

  if (!Array.isArray(pulls)) {
    throw new Error("GitHub did not return pull requests.");
  }

  return pulls
    .filter(pr =>
      Number.isSafeInteger(pr?.number) && pr.number > 0
    )
    .map(pr => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || "",
      draft: Boolean(pr.draft),
      base: pr.base?.ref || "",
      url: repoUrl + "/pull/" + pr.number + "/files",
    }));
}

export async function searchRepositoryCode(
  slug,
  query,
  token,
  github
) {
  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.trim().length > 100
  ) {
    throw new Error(
      "Enter a search term of 2–100 characters."
    );
  }

  const repoUrl = repositoryUrl(slug);

  const literal = query.trim().replace(/[\\"]/g, "\\$&");

  const search = new URLSearchParams({
    q: 'repo:' + slug + ' in:file "' + literal + '"',
    per_page: String(LIMIT),
  });

  const result = await github(
    "/search/code?" + search.toString(),
    token
  );

  if (!Array.isArray(result?.items)) {
    throw new Error("GitHub did not return code results.");
  }

  const blobPrefix =
    new URL(repoUrl).pathname.toLowerCase() + "/blob/";

  const matches = result.items.flatMap(item => {
    if (
      item?.repository?.full_name?.toLowerCase() !==
      slug.toLowerCase()
    ) {
      return [];
    }

    if (
      typeof item.path !== "string" ||
      !item.path ||
      typeof item.html_url !== "string"
    ) {
      return [];
    }

    let url;

    try {
      url = new URL(item.html_url);
    } catch {
      return [];
    }

    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      !url.pathname.toLowerCase().startsWith(blobPrefix)
    ) {
      return [];
    }

    return [{
      path: item.path,
      url: url.href,
    }];
  });

  return {
    matches,
    more:
      Boolean(result.incomplete_results) ||
      Number(result.total_count) > result.items.length,
  };
}

/** @param {Request} req */
export async function handleReviewRequest(req) {
  if (req.method !== "POST") return null;

  let body;

  try {
    body = await req.clone().json();
  } catch {
    return null;
  }

  if (
    !body ||
    ![
      "code-review",
      "code-search",
      "test-target",
      "build-systems",
    ].includes(body.view)
  ) {
    return null;
  }

  const send = (status, value) =>
    Response.json(value, {
      status,
      headers: reviewHeaders,
    });

  const auth = req.headers.get("Authorization") || "";
  const jwt = /^Bearer (\S+)$/i.exec(auth)?.[1];

  if (!jwt) {
    return send(401, {
      error: "Sign in again.",
    });
  }

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: {
          headers: {
            Authorization: auth,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(jwt);

    if (authError || !user) {
      return send(401, {
        error: "Sign in again.",
      });
    }

    const {
      data: employee,
      error,
    } = await db
      .from("employees")
      .select("role,is_banned")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return send(503, {
        error: "Could not check workspace access.",
      });
    }

    if (!employee || employee.is_banned) {
      return send(403, {
        error: "Catalog access denied.",
      });
    }

    if (employee.role !== "admin") {
      const permission = await db.rpc(
        "td_can_request_staging"
      );

      if (
        permission.error ||
        permission.data !== true
      ) {
        return send(403, {
          error: "Catalog access denied.",
        });
      }
    }

    if (
      body.repo !== undefined &&
      typeof body.repo !== "string"
    ) {
      return send(400, {
        error: "Invalid repository selection.",
      });
    }

    if (
      body.view === "code-search" &&
      (
        typeof body.query !== "string" ||
        body.query.trim().length < 2 ||
        body.query.trim().length > 100
      )
    ) {
      return send(400, {
        error: "Enter a search term of 2–100 characters.",
      });
    }

    const {
      repositories,
      token,
    } = await accessibleRepositories();

    const selected =
      body.repo === undefined
        ? repositories[0]
        : repositories.find(repo =>
            repo.slug.toLowerCase() ===
            body.repo.toLowerCase()
          );

    if (!selected) {
      if (body.repo !== undefined) {
        return send(404, {
          error: "Repository not available in the catalog.",
        });
      }

      return send(200, {
        repositories,
        empty: true,
        pulls: [],
        matches: [],
      });
    }

    try {
      if (body.view === "build-systems") {
        const results = await loadBuildJobs(
          selected.slug,
          token,
          requestGitHub
        );

        return send(200, {
          slug: selected.slug,
          repositories,
          ...results,
        });
      }

      if (body.view === "test-target") {
        const target = await loadTestTarget(
          selected.slug,
          token,
          requestGitHub
        );

        return send(200, {
          slug: selected.slug,
          repositories,
          target,
        });
      }

      if (body.view === "code-review") {
        const pulls = await loadPullRequests(
          selected.slug,
          token,
          requestGitHub
        );

        return send(200, {
          slug: selected.slug,
          repositories,
          pulls,
        });
      }

      const results = await searchRepositoryCode(
        selected.slug,
        body.query,
        token,
        requestGitHub
      );

      return send(200, {
        slug: selected.slug,
        repositories,
        ...results,
      });
    } catch (failure) {
      const status = Number(failure?.status);

      const detailError =
        status === 429 || status === 403
          ? "GitHub blocked this request. Check the app's repository permissions and API rate limits."
          : body.view === "build-systems"
          ? "Could not read build jobs. Check Actions: Read-only access for this installation."
          : body.view === "test-target"
          ? "Could not inspect this repository. Check Contents: Read-only access for this installation."
          : body.view === "code-review"
          ? "Could not read pull requests. Check Pull requests: Read-only access for this installation."
          : "GitHub code search is unavailable. Check Contents: Read-only access or use Search on GitHub.";

      return send(200, {
        slug: selected.slug,
        repositories,
        detailError,
      });
    }
  } catch {
    return send(502, {
      error:
        "Could not connect to GitHub. Check the three GitHub App secrets and installation access.",
    });
  }
}