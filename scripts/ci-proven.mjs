#!/usr/bin/env node
// Is this push to `main` already proven by a train PR's full CI run? Run by ci.yml's `changes` job on
// a push to `refs/heads/main` only; when it says `proven=true`, every leg of that run reports its
// check green without running (ci.yml header). Zero dependencies; reads the REST API with GITHUB_TOKEN.
//
// Proven iff ALL hold, for the pushed commit M:
//   a. M has exactly two parents (a merge commit: `gh pr merge --merge`);
//   b. tree(M) == tree(M^2): the merge added nothing to the train head's tree;
//   c. M^1 is an ancestor of M^2 (compare API `ahead`, `behind_by` 0, merge base M^1): every earlier
//      `main` tip is too, so the PR run's merge ref (train head onto the `main` of its day) had
//      tree(M^2), which is tree(M);
//   d. a completed, successful run of THIS workflow exists with head_sha M^2, event `pull_request`,
//      a `train/` head branch and this repository as head and base repository (the run object is
//      the run's latest attempt, so a re-run that failed or is still running does not count);
//   e. that run was full: in its latest attempt every job in FULL_RUN_JOBS is present and every job
//      but the informational ones concluded `success` (an ordinary PR run, which skips Node 18,
//      Node 20 and Windows, and a records-only train run, which skips everything, both fail here).
// Anything else, including any API error, timeout or unexpected shape, is "not proven": the run
// then does all its work, exactly as without this script. It always exits 0.
//   node scripts/ci-proven.mjs     (env: GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_REPOSITORY,
//                                   GITHUB_SHA, GITHUB_RUN_ID, GITHUB_TOKEN; optional GITHUB_API_URL,
//                                   GITHUB_OUTPUT, GITHUB_STEP_SUMMARY)
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TRAIN_PREFIX = "train/";

/**
 * Every job a full PR run of ci.yml reports, by check name. A job missing from the proving run means
 * it was skipped or never started, so it is no proof. test/ci-proven.test.ts derives this list from
 * ci.yml and fails when the two disagree.
 */
export const FULL_RUN_JOBS = [
  "Changed paths",
  "Node 18 tests 1/3",
  "Node 18 tests 2/3",
  "Node 18 tests 3/3",
  "Node 20 tests 1/3",
  "Node 20 tests 2/3",
  "Node 20 tests 3/3",
  "Node 18",
  "Node 20",
  "Node 22 checks",
  "Node 22 tests 1/5",
  "Node 22 tests 2/5",
  "Node 22 tests 3/5",
  "Node 22 tests 4/5",
  "Node 22 tests 5/5",
  "CHANGELOG under [Unreleased]",
  "Node 22",
  "Workspace builds",
  "Windows tests 1/3",
  "Windows tests 2/3",
  "Windows tests 3/3",
  "Windows (tests + drift)",
  "Playground E2E chromium 1/2",
  "Playground E2E chromium 2/2",
  "Playground E2E engines",
  "Playground E2E (Playwright)",
  "3D package (check:3d)",
  "Docs site E2E (Playwright)",
];

/** Jobs that never gate: any conclusion is accepted (the run's own `success` still covers them). */
export const INFORMATIONAL_JOBS = ["Benchmark (informational)"];

const SHA = /^[0-9a-f]{40}$/;
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const no = (reason) => ({ proven: false, reason });

/** Condition a: `{ ok, tree, p1, p2 }` from a `git/commits/{sha}` response for M. */
export function mergeShape(commit, sha) {
  if (!isObj(commit) || commit.sha !== sha) return { ok: false, reason: "unexpected commit response" };
  const tree = commit.tree?.sha;
  const parents = commit.parents;
  if (!SHA.test(tree ?? "") || !Array.isArray(parents)) return { ok: false, reason: "unexpected commit response" };
  if (parents.length !== 2) return { ok: false, reason: `not a two-parent merge commit (${parents.length} parents)` };
  const [p1, p2] = parents.map((p) => p?.sha);
  if (!SHA.test(p1 ?? "") || !SHA.test(p2 ?? "")) return { ok: false, reason: "unexpected commit parents" };
  return { ok: true, tree, p1, p2 };
}

/** Condition b: the second parent's `git/commits/{p2}` response carries the same tree. */
export function sameTree(parent2, p2, tree) {
  if (!isObj(parent2) || parent2.sha !== p2 || !SHA.test(parent2.tree?.sha ?? "")) return false;
  return parent2.tree.sha === tree;
}

/** Condition c: a `compare/{p1}...{p2}` response that says p1 is a strict ancestor of p2. */
export function isAncestor(compare, p1) {
  return (
    isObj(compare) &&
    compare.status === "ahead" &&
    compare.behind_by === 0 &&
    Number.isInteger(compare.ahead_by) &&
    compare.ahead_by > 0 &&
    compare.merge_base_commit?.sha === p1
  );
}

/** Condition d, for one entry of a workflow-runs list. */
export function isTrainRun(run, { repo, headSha, workflowId }) {
  return (
    isObj(run) &&
    Number.isInteger(run.id) &&
    run.workflow_id === workflowId &&
    run.head_sha === headSha &&
    run.event === "pull_request" &&
    typeof run.head_branch === "string" &&
    run.head_branch.startsWith(TRAIN_PREFIX) &&
    run.repository?.full_name === repo &&
    run.head_repository?.full_name === repo &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    Number.isInteger(run.run_attempt) &&
    typeof run.html_url === "string" &&
    /^https:\/\/\S+$/.test(run.html_url)
  );
}

/** Condition e: `{ ok, reason }` from a `runs/{id}/jobs?filter=latest` response for `run`. */
export function fullRun(jobsResponse, run) {
  if (!isObj(jobsResponse) || !Array.isArray(jobsResponse.jobs))
    return { ok: false, reason: "unexpected jobs response" };
  const { jobs } = jobsResponse;
  if (jobsResponse.total_count !== jobs.length) return { ok: false, reason: "jobs list not on one page" };
  const seen = new Set();
  for (const job of jobs) {
    if (!isObj(job) || typeof job.name !== "string") return { ok: false, reason: "unexpected job entry" };
    if (job.run_attempt !== run.run_attempt) return { ok: false, reason: `job "${job.name}" is from another attempt` };
    if (INFORMATIONAL_JOBS.includes(job.name)) continue;
    if (job.status !== "completed" || job.conclusion !== "success")
      return { ok: false, reason: `job "${job.name}" concluded ${job.conclusion}` };
    seen.add(job.name);
  }
  const missing = FULL_RUN_JOBS.filter((name) => !seen.has(name));
  if (missing.length > 0) return { ok: false, reason: `not a full run (missing: ${missing.join(", ")})` };
  return { ok: true, reason: "full run" };
}

/**
 * The decision. `get(path)` returns the parsed JSON of a REST GET (it may throw); everything else is
 * pure. Returns `{ proven, reason, proof? }`, `proof` being the proving run's URL.
 */
export async function prove(get, { repo, sha, runId }) {
  if (!SHA.test(sha ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !/^\d+$/.test(String(runId ?? "")))
    return no("missing or malformed run environment");
  const shape = mergeShape(await get(`/repos/${repo}/git/commits/${sha}`), sha);
  if (!shape.ok) return no(shape.reason);
  const { tree, p1, p2 } = shape;
  if (!sameTree(await get(`/repos/${repo}/git/commits/${p2}`), p2, tree))
    return no("the merge commit's tree differs from its second parent's");
  if (!isAncestor(await get(`/repos/${repo}/compare/${p1}...${p2}?per_page=1`), p1))
    return no("the first parent is not an ancestor of the second");
  const current = await get(`/repos/${repo}/actions/runs/${runId}`);
  const workflowId = current?.workflow_id;
  if (!Number.isInteger(workflowId)) return no("unexpected response for this run");
  const runs = await get(
    `/repos/${repo}/actions/workflows/${workflowId}/runs?head_sha=${p2}&event=pull_request&per_page=100`,
  );
  if (!isObj(runs) || !Array.isArray(runs.workflow_runs)) return no("unexpected workflow-runs response");
  const candidates = runs.workflow_runs
    .filter((r) => isTrainRun(r, { repo, headSha: p2, workflowId }))
    .sort((a, b) => b.id - a.id)
    .slice(0, 3);
  if (candidates.length === 0) return no(`no successful train PR run of this workflow for ${p2}`);
  const reasons = [];
  for (const run of candidates) {
    const full = fullRun(await get(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`), run);
    if (full.ok) return { proven: true, reason: `train PR run ${run.id} at ${p2} ran every job`, proof: run.html_url };
    reasons.push(`run ${run.id}: ${full.reason}`);
  }
  return no(reasons.join("; "));
}

/** A `get` over fetch, each request bounded by `timeoutMs`. */
export function restGet(api, token, timeoutMs = 15_000) {
  return async (path) => {
    const res = await fetch(`${api}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "archlang-ci-proven",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
    return res.json();
  };
}

/** Decide, print and write the step outputs; never throws. `makeGet` is the seam the test uses. */
export async function main(env, makeGet = restGet) {
  let verdict;
  try {
    if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") verdict = no("not a push to main");
    else if (!env.GITHUB_TOKEN) verdict = no("no GITHUB_TOKEN");
    else {
      const get = makeGet(env.GITHUB_API_URL || "https://api.github.com", env.GITHUB_TOKEN);
      let timer;
      const deadline = new Promise((resolve) => {
        timer = setTimeout(() => resolve(no("timed out")), 60_000);
      });
      const decided = prove(get, { repo: env.GITHUB_REPOSITORY, sha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID }).catch(
        (e) => no(`error: ${e instanceof Error ? e.message : String(e)}`),
      );
      verdict = await Promise.race([decided, deadline]);
      clearTimeout(timer);
    }
  } catch (e) {
    verdict = no(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const line = verdict.proven
    ? `Proven by ${verdict.proof}: ${verdict.reason}.`
    : `Not proven (${verdict.reason}): every leg runs in full.`;
  console.log(line);
  try {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
    // Written last, once: a failure before this line leaves the step's outputs unset (not proven).
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `proven=${verdict.proven}\nproof=${verdict.proven ? verdict.proof : ""}\n`);
  } catch (e) {
    console.log(`::warning::ci-proven could not write its outputs: ${e instanceof Error ? e.message : String(e)}`);
  }
  return verdict;
}

// Compare real paths: started through a junction or symlink, argv[1] keeps the link path.
const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) await main(process.env);
