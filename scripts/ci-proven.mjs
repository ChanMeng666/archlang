#!/usr/bin/env node
// Is this push to `main` already proven by a train PR's full CI run? Run by ci.yml's `changes` job on
// a push to `refs/heads/main` only; when it says `proven=true`, every leg of that run reports its
// check green without running (ci.yml header). Zero dependencies; reads the REST API with a token.
//
// Proven iff ALL hold, for the pushed commit M:
//   a. M has exactly two parents (a merge commit: `gh pr merge --merge`), and the push's `before`
//      is M^1 (the push moved `main` from M^1 to M);
//   b. tree(M) == tree(M^2): the merge added nothing to the train head's tree;
//   c. M^1 is an ancestor of M^2 (compare API `ahead`, `behind_by` 0, merge base M^1): every earlier
//      `main` tip is too, so the PR run's merge ref (train head onto the `main` of its day) had
//      tree(M^2), which is tree(M);
//   d. a completed, successful run of THIS workflow exists with head_sha M^2, event `pull_request`,
//      a `train/` head branch and this repository as head and base repository (the run object is
//      the run's latest attempt, so a re-run that failed or is still running does not count), last
//      updated within MAX_PROOF_AGE_MS of this run's creation, whose pull request has base `main`,
//      that head, and (on `main`) was merged as M;
//   e. that run was full: in its latest attempt every job in FULL_RUN_JOBS is present, every job but
//      the informational ones concluded `success`, and no job ran a NOTHING_TO_RUN step (a job whose
//      steps were all guarded off reports success too, so success alone proves nothing).
// Anything else, including any API error, timeout or unexpected shape, is "not proven": the run
// then does all its work, exactly as without this script. It always exits 0.
//   node scripts/ci-proven.mjs     (env: GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_REPOSITORY,
//                                   GITHUB_SHA, GITHUB_RUN_ID, GITHUB_TOKEN, PUSH_BEFORE; optional
//                                   GITHUB_API_URL, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY)
//
// Read-only check of one run (for a train PR before it merges): would it prove its merge?
//   node scripts/ci-proven.mjs --run <run id> [--repo owner/name]
//     checks d (with an OPEN pull request) and e; token from GITHUB_TOKEN, GH_TOKEN or `gh auth token`;
//     prints `proves: yes|no (<reason>)`; exit 0 yes, 1 no, 2 usage or API error.
import { execFileSync } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TRAIN_PREFIX = "train/";

/** The proving run must have been last updated within this long of the push (24 h). */
export const MAX_PROOF_AGE_MS = 24 * 60 * 60 * 1000;

/** `<prefix> 1/<count>` … `<prefix> <count>/<count>`: a sharded job's check names. */
function shards(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}/${count}`);
}

/**
 * Every job a full PR run of ci.yml reports, by check name. A job missing from the proving run means
 * it was skipped or never started, so it is no proof. test/ci-proven.test.ts derives this list from
 * ci.yml and fails when the two disagree.
 */
export const FULL_RUN_JOBS = [
  "Changed paths",
  ...shards("Node 18 tests", 5),
  ...shards("Node 20 tests", 5),
  "Node 18",
  "Node 20",
  "Node 22 checks",
  ...shards("Node 22 tests", 7),
  "CHANGELOG under [Unreleased]",
  "Node 22",
  "Workspace builds",
  ...shards("Windows tests", 5),
  "Windows (tests + drift)",
  ...shards("Playground E2E chromium", 3),
  "Playground E2E engines",
  "Playground E2E (Playwright)",
  "3D package suite pass",
  "3D package frame-budget pass",
  "3D package (check:3d)",
  ...shards("Docs site E2E", 3),
  "Docs site E2E (Playwright)",
];

/** Jobs that never gate: any conclusion is accepted (the run's own `success` still covers them). */
export const INFORMATIONAL_JOBS = ["Benchmark (informational)"];

/**
 * The marker steps a step-guarded leaf runs when it skips its work (ci.yml). A proving run in which
 * one of them succeeded skipped that job's work. test/ci-proven.test.ts pins these names to ci.yml.
 */
export const NOTHING_TO_RUN_STEPS = [
  "Record-only change, nothing to run on this leg",
  "Proven by a train PR run, nothing to run on this leg",
];

const SHA = /^[0-9a-f]{40}$/;
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const no = (reason) => ({ proven: false, reason });
const message = (e) => (e instanceof Error ? e.message : String(e));
/** `owner/name` of a repository object: `full_name`, or the tail of its API `url` (runs' `pull_requests`). */
const repoOf = (r) => r?.full_name ?? (typeof r?.url === "string" ? r.url.replace(/^.*\/repos\//, "") : undefined);

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

/** Condition d, for one entry of a workflow-runs list (the pull request is checked by `trainPull`). */
export function isTrainRun(run, { repo, headSha, workflowId }) {
  return (
    isObj(run) &&
    Number.isInteger(run.id) &&
    run.workflow_id === workflowId &&
    run.head_sha === headSha &&
    run.event === "pull_request" &&
    typeof run.head_branch === "string" &&
    run.head_branch.startsWith(TRAIN_PREFIX) &&
    repoOf(run.repository) === repo &&
    repoOf(run.head_repository) === repo &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    Number.isInteger(run.run_attempt) &&
    typeof run.html_url === "string" &&
    /^https:\/\/\S+$/.test(run.html_url)
  );
}

/** Condition d's age: the run was last updated within MAX_PROOF_AGE_MS of `at` (an ISO time or ms). */
export function isRecent(run, at) {
  const updated = Date.parse(run?.updated_at ?? "");
  const ref = typeof at === "number" ? at : Date.parse(at ?? "");
  return Number.isFinite(updated) && Number.isFinite(ref) && Math.abs(ref - updated) <= MAX_PROOF_AGE_MS;
}

/**
 * Condition d's pull request: `{ ok, reason }`. `pulls` is a `commits/{head}/pulls` response. Every
 * entry of the run's own `pull_requests` (filled while the PR is open, empty once it merged, as the
 * live API returns) must have base `main`; one PR of `pulls` must have base `main`, the run's head
 * branch, SHA and repository, and either be merged as `mergedAs` or, without `mergedAs`, be open.
 */
export function trainPull(run, pulls, { repo, mergedAs }) {
  const own = Array.isArray(run?.pull_requests) ? run.pull_requests : null;
  if (own === null) return { ok: false, reason: "unexpected pull_requests on the run" };
  if (own.some((p) => p?.base?.ref !== "main")) return { ok: false, reason: "the run's pull request is not into main" };
  if (!Array.isArray(pulls)) return { ok: false, reason: "unexpected pulls response" };
  const match = pulls.find(
    (p) =>
      isObj(p) &&
      p.base?.ref === "main" &&
      repoOf(p.base?.repo) === repo &&
      p.head?.ref === run.head_branch &&
      p.head?.sha === run.head_sha &&
      repoOf(p.head?.repo) === repo &&
      (mergedAs === undefined
        ? p.state === "open"
        : typeof p.merged_at === "string" && p.merge_commit_sha === mergedAs),
  );
  if (!match)
    return {
      ok: false,
      reason:
        mergedAs === undefined ? "no open train pull request into main" : `no train pull request merged as ${mergedAs}`,
    };
  return { ok: true, reason: `pull request #${match.number}` };
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
    if (!Array.isArray(job.steps)) return { ok: false, reason: `job "${job.name}" lists no steps` };
    const marker = job.steps.find((s) => NOTHING_TO_RUN_STEPS.includes(s?.name) && s?.conclusion !== "skipped");
    if (marker) return { ok: false, reason: `job "${job.name}" ran "${marker.name}": its work was skipped` };
    seen.add(job.name);
  }
  const missing = FULL_RUN_JOBS.filter((name) => !seen.has(name));
  if (missing.length > 0) return { ok: false, reason: `not a full run (missing: ${missing.join(", ")})` };
  return { ok: true, reason: "full run" };
}

/**
 * Conditions d (age and pull request) and e for one run that passed `isTrainRun`. `at` is the time
 * the age is measured from; `mergedAs` the merge commit on `main` (absent: the PR must be open).
 */
export async function provesWith(get, run, { repo, at, mergedAs }) {
  if (!isRecent(run, at)) return { ok: false, reason: `last updated ${run.updated_at}, not within 24 h` };
  const pull = trainPull(run, await get(`/repos/${repo}/commits/${run.head_sha}/pulls`), { repo, mergedAs });
  if (!pull.ok) return pull;
  const full = fullRun(await get(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`), run);
  if (!full.ok) return full;
  return { ok: true, reason: `${pull.reason}, every job ran` };
}

/**
 * The decision on a push to `main`. `get(path)` returns the parsed JSON of a REST GET (it may
 * throw); everything else is pure. Returns `{ proven, reason, proof? }`, `proof` the proving run's URL.
 */
export async function prove(get, { repo, sha, runId, before }) {
  if (!SHA.test(sha ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !/^\d+$/.test(String(runId ?? "")))
    return no("missing or malformed run environment");
  const shape = mergeShape(await get(`/repos/${repo}/git/commits/${sha}`), sha);
  if (!shape.ok) return no(shape.reason);
  const { tree, p1, p2 } = shape;
  if (before !== p1) return no(`the push's before (${before || "absent"}) is not the first parent ${p1}`);
  if (!sameTree(await get(`/repos/${repo}/git/commits/${p2}`), p2, tree))
    return no("the merge commit's tree differs from its second parent's");
  if (!isAncestor(await get(`/repos/${repo}/compare/${p1}...${p2}?per_page=1`), p1))
    return no("the first parent is not an ancestor of the second");
  const current = await get(`/repos/${repo}/actions/runs/${runId}`);
  const workflowId = current?.workflow_id;
  if (!Number.isInteger(workflowId) || typeof current?.created_at !== "string")
    return no("unexpected response for this run");
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
    const v = await provesWith(get, run, { repo, at: current.created_at, mergedAs: sha });
    if (v.ok) return { proven: true, reason: `train PR run ${run.id} at ${p2}: ${v.reason}`, proof: run.html_url };
    reasons.push(`run ${run.id}: ${v.reason}`);
  }
  return no(reasons.join("; "));
}

/**
 * The read-only check of one run (`--run`): would a merge of its train PR, pushed now, be proven by
 * it? Conditions d (with the PR still open) and e. Returns `{ proven, reason }`.
 */
export async function checkRun(get, { repo, runId, now }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !/^\d+$/.test(String(runId ?? ""))) return no("bad --repo or --run");
  const workflow = await get(`/repos/${repo}/actions/workflows/ci.yml`);
  const run = await get(`/repos/${repo}/actions/runs/${runId}`);
  if (!Number.isInteger(workflow?.id) || !isObj(run)) return no("unexpected workflow or run response");
  if (!SHA.test(run.head_sha ?? "")) return no("unexpected run response");
  if (!isTrainRun(run, { repo, headSha: run.head_sha, workflowId: workflow.id }))
    return no(
      `not a completed, successful train PR run of ci.yml (event ${run.event}, branch ${run.head_branch}, ${run.status}/${run.conclusion})`,
    );
  const v = await provesWith(get, run, { repo, at: now, mergedAs: undefined });
  return v.ok ? { proven: true, reason: v.reason, proof: run.html_url } : no(v.reason);
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

/** `promise`, or `no("timed out")` after `ms`. */
async function bounded(promise, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(no("timed out")), ms);
  });
  try {
    return await Promise.race([promise.catch((e) => no(`error: ${message(e)}`)), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide, print and write the step outputs; never throws. `makeGet` and `timeoutMs` are the seams
 * the test uses.
 */
export async function main(env, makeGet = restGet, timeoutMs = 60_000) {
  let verdict;
  try {
    if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") verdict = no("not a push to main");
    else if (!env.GITHUB_TOKEN) verdict = no("no GITHUB_TOKEN");
    else {
      const get = makeGet(env.GITHUB_API_URL || "https://api.github.com", env.GITHUB_TOKEN);
      const args = {
        repo: env.GITHUB_REPOSITORY,
        sha: env.GITHUB_SHA,
        runId: env.GITHUB_RUN_ID,
        before: env.PUSH_BEFORE,
      };
      verdict = await bounded(prove(get, args), timeoutMs);
    }
  } catch (e) {
    verdict = no(`error: ${message(e)}`);
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
    console.log(`::warning::ci-proven could not write its outputs: ${message(e)}`);
  }
  return verdict;
}

/** `--run <id> [--repo owner/name]`: exit 0 if the run would prove its merge, 1 if not, 2 on error. */
async function cli(argv, env) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const runId = flag("--run");
  if (!runId) {
    console.error("usage: node scripts/ci-proven.mjs --run <run id> [--repo owner/name]");
    return 2;
  }
  const sh = (cmd, args) => {
    try {
      return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  const repo =
    flag("--repo") ??
    env.GITHUB_REPOSITORY ??
    /github\.com[:/]([\w.-]+\/[\w.-]+?)(\.git)?$/.exec(sh("git", ["config", "--get", "remote.origin.url"]))?.[1];
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || sh("gh", ["auth", "token"]);
  if (!token || !repo) {
    console.error("ci-proven: no token (GITHUB_TOKEN, GH_TOKEN or `gh auth token`) or no repository");
    return 2;
  }
  try {
    const v = await checkRun(restGet(env.GITHUB_API_URL || "https://api.github.com", token), {
      repo,
      runId,
      now: Date.now(),
    });
    console.log(`proves: ${v.proven ? "yes" : "no"} (${v.reason})`);
    return v.proven ? 0 : 1;
  } catch (e) {
    console.error(`ci-proven: ${message(e)}`);
    return 2;
  }
}

// Compare real paths: started through a junction or symlink, argv[1] keeps the link path.
const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) {
  if (process.argv.includes("--run")) process.exitCode = await cli(process.argv.slice(2), process.env);
  else await main(process.env);
}
