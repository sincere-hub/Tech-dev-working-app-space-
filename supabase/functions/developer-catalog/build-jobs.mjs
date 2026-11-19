const RUN_LIMIT = 10;
const JOB_LIMIT = 100;

const BUILD_WORDS =
  /\b(?:build|compile|bundle|packag(?:e|ing))\b/i;

const SETUP_STEP =
  /^(?:pre |post |set up\b|setup\b|prepare\b|install\b|checkout\b|download\b|upload\b)/i;

const text = value =>
  typeof value === "string" ? value : "";

const validId = value =>
  Number.isSafeInteger(value) && value > 0;

function isBuildStep(step) {
  const name = text(step?.name)
    .trim()
    .replace(/^run\s+/i, "");

  return BUILD_WORDS.test(name) && !SETUP_STEP.test(name);
}

function duration(start, end) {
  if (!start || !end) return null;

  const from = Date.parse(start);
  const to = Date.parse(end);

  return (
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    to >= from
  )
    ? Math.floor((to - from) / 1000)
    : null;
}

export async function loadBuildJobs(slug, token, github) {
  if (
    !/^[\w-]+\/[\w.-]+$/.test(slug) ||
    /\/\.{1,2}$/.test(slug)
  ) {
    throw new Error("Invalid build repository.");
  }

  const prefix = "/repos/" + slug + "/actions/runs";

  const data = await github(
    prefix + "?per_page=" + RUN_LIMIT,
    token
  );

  if (!Array.isArray(data?.workflow_runs)) {
    throw new Error("GitHub did not return workflow runs.");
  }

  const runs = data.workflow_runs.slice(0, RUN_LIMIT);

  const lookups = await Promise.allSettled(
    runs.map(async run => {
      if (!validId(run?.id)) {
        throw new Error("GitHub returned an invalid run ID.");
      }

      const result = await github(
        prefix +
          "/" +
          run.id +
          "/jobs?filter=latest&per_page=" +
          JOB_LIMIT,
        token
      );

      if (!Array.isArray(result?.jobs)) {
        throw new Error("GitHub did not return jobs.");
      }

      const jobs = [];

      for (const job of result.jobs.slice(0, JOB_LIMIT)) {
        if (!validId(job?.id)) continue;

        const steps = Array.isArray(job.steps)
          ? job.steps
          : [];

        const buildSteps = steps.filter(isBuildStep);

        if (
          !BUILD_WORDS.test(text(job.name)) &&
          !buildSteps.length
        ) {
          continue;
        }

        const failedStep = steps.find(
          step => step?.conclusion === "failure"
        );

        jobs.push({
          id: job.id,
          name: text(job.name) || "Build job",
          workflow: text(run.name),
          branch: text(run.head_branch),
          commit: text(run.head_sha).slice(0, 7),
          status:
            text(job.conclusion) ||
            text(job.status) ||
            "unknown",
          startedAt: text(job.started_at),
          createdAt: text(run.created_at),
          seconds: duration(
            job.started_at,
            job.completed_at
          ),
          failedStep: text(failedStep?.name),

          buildSteps: buildSteps.map(step => ({
            name: text(step.name),
            status:
              text(step.conclusion) ||
              text(step.status) ||
              "unknown",
            seconds: duration(
              step.started_at,
              step.completed_at
            ),
          })),

          url:
            "https://github.com/" +
            slug +
            "/actions/runs/" +
            run.id +
            "/job/" +
            job.id,
        });
      }

      return {
        jobs,
        truncated: Number(result.total_count) > JOB_LIMIT,
      };
    })
  );

  const found = lookups.filter(
    result => result.status === "fulfilled"
  );

  if (runs.length && !found.length) {
    throw new Error("Could not read GitHub build jobs.");
  }

  const builds = found
    .flatMap(result => result.value.jobs)
    .sort(
      (a, b) =>
        (
          Date.parse(b.startedAt || b.createdAt) || 0
        ) -
        (
          Date.parse(a.startedAt || a.createdAt) || 0
        )
    );

  return {
    builds,
    sampledRuns: runs.length,
    checkedRuns: found.length,
    partial:
      found.length < runs.length ||
      found.some(result => result.value.truncated),
  };
}