const slugPattern = /^[\w-]+\/[\w.-]+$/;
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

const fileMarkers = new Set([
  "index.html",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "angular.json",
  "Dockerfile",
  "render.yaml",
  "vercel.json",
  "netlify.toml",
  "pubspec.yaml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
]);

export async function loadTestTarget(slug, token, github) {
  if (
    !slugPattern.test(slug) ||
    /\/\.{1,2}$/.test(slug)
  ) {
    throw new Error("Invalid test repository.");
  }

  const root = "/repos/" + slug;
  const githubUrl = "https://github.com/" + slug;

  const repo = await github(root, token);

  const branch =
    typeof repo?.default_branch === "string"
      ? repo.default_branch
      : "";

  const empty = {
    branch,
    commit: "",
    kind: "empty",
    markers: [],
    sourceUrl: githubUrl,
  };

  if (!branch) return empty;

  let revision;

  try {
    revision = await github(
      root + "/commits/" + encodeURIComponent(branch),
      token
    );
  } catch (error) {
    if (error?.status === 409) return empty;
    throw error;
  }

  const sha = revision?.sha;
  const treeSha = revision?.commit?.tree?.sha;

  if (
    typeof sha !== "string" ||
    typeof treeSha !== "string" ||
    !shaPattern.test(sha) ||
    !shaPattern.test(treeSha)
  ) {
    throw new Error(
      "Could not verify the repository revision."
    );
  }

  const rootTree = await github(
    root + "/git/trees/" + treeSha,
    token
  );

  if (!Array.isArray(rootTree?.tree)) {
    throw new Error("Could not read repository files.");
  }

  const paths = rootTree.tree
    .filter(item => typeof item?.path === "string")
    .map(item => item.path);

  const webConfig =
    /^((vite|next|nuxt|svelte|astro)\.config\.[\w]+|angular\.json)$/;

  const nativeConfig = /\.(xcodeproj|xcworkspace)$/;

  const pathsSet = new Set(paths);

  const web =
    pathsSet.has("index.html") ||
    paths.some(path => webConfig.test(path));

  const native =
    paths.some(path => nativeConfig.test(path)) ||
    (
      pathsSet.has("pubspec.yaml") &&
      (
        pathsSet.has("android") ||
        pathsSet.has("ios")
      )
    ) ||
    (
      (
        pathsSet.has("settings.gradle") ||
        pathsSet.has("settings.gradle.kts")
      ) &&
      (
        pathsSet.has("app") ||
        pathsSet.has("android")
      )
    );

  return {
    branch,
    commit: sha,
    kind: web ? "web" : native ? "native" : "unknown",
    alsoNative: web && native,

    markers: paths
      .filter(path =>
        fileMarkers.has(path) ||
        webConfig.test(path) ||
        nativeConfig.test(path)
      )
      .sort()
      .slice(0, 16),

    sourceUrl: githubUrl + "/tree/" + sha,
    partial: rootTree.truncated === true,
  };
}