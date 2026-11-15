/** scripts/ci-proven.mjs: when a push to `main` is proven by a train PR's full CI run. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as ciProven from "../scripts/ci-proven.mjs";

const { FULL_RUN_JOBS, fullRun, INFORMATIONAL_JOBS, isTrainRun, main, prove } = ciProven;

type Verdict = { proven: boolean; reason: string; proof?: string };
type Json = Record<string, any>;

const REPO = "owner/repo";
const h = (c: string) => c.repeat(40);
const M = h("1");
const P1 = h("2");
const P2 = h("3");
const TREE = h("4");
const RUN_ID = 900;
const WORKFLOW_ID = 301907379;
const PROOF = `https://github.com/${REPO}/actions/runs/100`;

const trainRun = (over: Json = {}): Json => ({
  id: 100,
  workflow_id: WORKFLOW_ID,
  head_sha: P2,
  event: "pull_request",
  head_branch: "train/20261115-1",
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  html_url: PROOF,
  ...over,
});

const job = (name: string, over: Json = {}): Json => ({
  name,
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  ...over,
});
const jobsOf = (jobs: Json[]): Json => ({ total_count: jobs.length, jobs });
const fullJobs = (): Json[] => [
  ...(FULL_RUN_JOBS as string[]).map((n) => job(n)),
  job("Benchmark (informational)", { conclusion: "failure" }),
];

/** The API as a table of path → response; a path not in it throws, as a 404 would. */
function api(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    [`/repos/${REPO}/git/commits/${M}`]: { sha: M, tree: { sha: TREE }, parents: [{ sha: P1 }, { sha: P2 }] },
    [`/repos/${REPO}/git/commits/${P2}`]: { sha: P2, tree: { sha: TREE }, parents: [{ sha: P1 }] },
    [`/repos/${REPO}/compare/${P1}...${P2}?per_page=1`]: {
      status: "ahead",
      ahead_by: 3,
      behind_by: 0,
      merge_base_commit: { sha: P1 },
    },
    [`/repos/${REPO}/actions/runs/${RUN_ID}`]: { id: RUN_ID, workflow_id: WORKFLOW_ID },
    [`/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/runs?head_sha=${P2}&event=pull_request&per_page=100`]: {
      total_count: 1,
      workflow_runs: [trainRun()],
    },
    [`/repos/${REPO}/actions/runs/100/jobs?filter=latest&per_page=100`]: jobsOf(fullJobs()),
    ...over,
  };
  const calls: string[] = [];
  const get = async (path: string) => {
    calls.push(path);
    if (!(path in table)) throw new Error(`GET ${path}: HTTP 404`);
    return table[path];
  };
  return { get, calls };
}

const decide = (over?: Record<string, unknown>): Promise<Verdict> =>
  prove(api(over).get, { repo: REPO, sha: M, runId: RUN_ID });
const runsPath = `/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/runs?head_sha=${P2}&event=pull_request&per_page=100`;
const jobsPath = `/repos/${REPO}/actions/runs/100/jobs?filter=latest&per_page=100`;
const runs = (...workflow_runs: Json[]) => ({ total_count: workflow_runs.length, workflow_runs });

describe("scripts/ci-proven.mjs prove()", () => {
  it("proves a merge of a train PR whose run was full, and names that run", async () => {
    expect(await decide()).toEqual({ proven: true, reason: expect.stringContaining("run 100"), proof: PROOF });
  });

  it("needs a two-parent merge commit (a squash, a rebase or an octopus is not)", async () => {
    for (const parents of [[{ sha: P2 }], [{ sha: P1 }, { sha: P2 }, { sha: h("5") }], []]) {
      const v = await decide({ [`/repos/${REPO}/git/commits/${M}`]: { sha: M, tree: { sha: TREE }, parents } });
      expect(v.proven).toBe(false);
    }
  });

  it("needs tree(M) == tree(M^2)", async () => {
    const v = await decide({ [`/repos/${REPO}/git/commits/${P2}`]: { sha: P2, tree: { sha: h("6") } } });
    expect(v).toMatchObject({ proven: false, reason: expect.stringContaining("tree") });
  });

  it("needs M^1 to be an ancestor of M^2", async () => {
    const compare = `/repos/${REPO}/compare/${P1}...${P2}?per_page=1`;
    for (const body of [
      { status: "diverged", ahead_by: 2, behind_by: 1, merge_base_commit: { sha: h("7") } },
      { status: "behind", ahead_by: 0, behind_by: 2, merge_base_commit: { sha: P2 } },
      { status: "identical", ahead_by: 0, behind_by: 0, merge_base_commit: { sha: P1 } },
      { status: "ahead", ahead_by: 1, behind_by: 0, merge_base_commit: { sha: h("7") } },
    ]) {
      expect((await decide({ [compare]: body })).proven).toBe(false);
    }
  });

  it("never counts an ordinary PR's run, a push run, a fork's train branch or another workflow", async () => {
    for (const over of [
      { head_branch: "feat/x" },
      { head_branch: "main" },
      { head_branch: "xtrain/1" },
      { event: "push" },
      { event: "merge_group" },
      { head_repository: { full_name: "fork/repo" } },
      { repository: { full_name: "fork/repo" } },
      { workflow_id: 1 },
      { head_sha: h("8") },
    ]) {
      expect((await decide({ [runsPath]: runs(trainRun(over)) })).proven, JSON.stringify(over)).toBe(false);
    }
  });

  it("needs the run's latest attempt completed and successful", async () => {
    for (const over of [
      { conclusion: "failure" },
      { conclusion: "cancelled" },
      { conclusion: null, status: "in_progress" },
      { conclusion: null, status: "queued", run_attempt: 2 },
    ]) {
      expect((await decide({ [runsPath]: runs(trainRun(over)) })).proven, JSON.stringify(over)).toBe(false);
    }
  });

  it("needs every job of a full run: an ordinary PR run and a records-only train run are no proof", async () => {
    const without = (prefix: string) => fullJobs().filter((j) => !j.name.startsWith(prefix));
    const skipped = (prefix: string) =>
      fullJobs().map((j) => (j.name.startsWith(prefix) ? { ...j, conclusion: "skipped" } : j));
    for (const jobs of [
      without("Node 18 tests"), // a PR run lists a job skipped by its `if` at most as skipped
      skipped("Node 18 tests"),
      skipped("Windows tests"),
      skipped("Node 22 checks"), // records-only: the code legs skip
      skipped("Node 22 tests"),
      fullJobs().map((j) => (j.name === "Workspace builds" ? { ...j, conclusion: "failure" } : j)),
      [...fullJobs(), job("A job added later", { conclusion: "cancelled" })],
    ]) {
      expect((await decide({ [jobsPath]: jobsOf(jobs) })).proven).toBe(false);
    }
  });

  it("ignores only the informational benchmark's conclusion", async () => {
    expect(INFORMATIONAL_JOBS).toEqual(["Benchmark (informational)"]);
    const noBench = fullJobs().filter((j) => j.name !== "Benchmark (informational)");
    expect((await decide({ [jobsPath]: jobsOf(noBench) })).proven).toBe(true);
  });

  it("refuses jobs from an older attempt and a jobs list that is not on one page", async () => {
    const mixed = fullJobs().map((j, i) => (i === 0 ? { ...j, run_attempt: 2 } : j));
    expect((await decide({ [jobsPath]: jobsOf(mixed) })).proven).toBe(false);
    expect((await decide({ [jobsPath]: { total_count: 120, jobs: fullJobs() } })).proven).toBe(false);
  });

  it("takes the newest candidate that was full", async () => {
    const newer = trainRun({ id: 101, html_url: `https://github.com/${REPO}/actions/runs/101` });
    const v = await decide({
      [runsPath]: runs(trainRun(), newer),
      [`/repos/${REPO}/actions/runs/101/jobs?filter=latest&per_page=100`]: jobsOf(
        fullJobs().filter((j) => j.name !== "Node 18"),
      ),
    });
    expect(v).toMatchObject({ proven: true, proof: PROOF });
  });

  it("refuses an odd shape and a malformed environment without guessing", async () => {
    expect((await decide({ [runsPath]: { workflow_runs: "nope" } })).proven).toBe(false);
    expect((await decide({ [`/repos/${REPO}/actions/runs/${RUN_ID}`]: { id: RUN_ID } })).proven).toBe(false);
    expect((await decide({ [`/repos/${REPO}/git/commits/${M}`]: null })).proven).toBe(false);
    const { get, calls } = api();
    expect((await prove(get, { repo: REPO, sha: "HEAD", runId: RUN_ID })).proven).toBe(false);
    expect(calls).toEqual([]);
  });

  it("isTrainRun and fullRun reject non-objects", () => {
    expect(isTrainRun(null, { repo: REPO, headSha: P2, workflowId: WORKFLOW_ID })).toBe(false);
    expect(fullRun(null, trainRun()).ok).toBe(false);
    expect(fullRun({ total_count: 1, jobs: [null] }, trainRun()).ok).toBe(false);
  });
});

describe("scripts/ci-proven.mjs main()", () => {
  const env = {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: REPO,
    GITHUB_SHA: M,
    GITHUB_RUN_ID: String(RUN_ID),
    GITHUB_TOKEN: "t",
  };

  it("decides only on a push to main", async () => {
    let made = 0;
    const makeGet = () => {
      made++;
      return api().get;
    };
    expect(((await main(env, makeGet)) as Verdict).proven).toBe(true);
    for (const over of [
      { GITHUB_EVENT_NAME: "pull_request" },
      { GITHUB_EVENT_NAME: "merge_group" },
      { GITHUB_REF: "refs/heads/train/1" },
      { GITHUB_TOKEN: "" },
    ]) {
      expect(((await main({ ...env, ...over }, makeGet)) as Verdict).proven).toBe(false);
    }
    expect(made).toBe(1);
  });

  it("fails open on an API error", async () => {
    const makeGet = () => async () => {
      throw new Error("HTTP 502");
    };
    expect(await main(env, makeGet)).toEqual({ proven: false, reason: "error: HTTP 502" });
  });
});

/**
 * FULL_RUN_JOBS, derived from ci.yml: each job's `name:` with its matrix expanded. The proof is only
 * as good as this list, so a job added, renamed or re-sharded in ci.yml turns this red until the
 * script's list follows.
 */
function ciJobNames(): Map<string, string[]> {
  const lines = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").split(/\r?\n/);
  const start = lines.indexOf("jobs:");
  const byJob = new Map<string, { name?: string; matrix: Map<string, string[]> }>();
  let current: { name?: string; matrix: Map<string, string[]> } | undefined;
  let inMatrix = false;
  for (const line of lines.slice(start + 1)) {
    const id = /^ {2}([a-z0-9-]+):$/.exec(line);
    if (id?.[1]) {
      current = { matrix: new Map() };
      byJob.set(id[1], current);
      inMatrix = false;
      continue;
    }
    if (!current) continue;
    const name = /^ {4}name: (.+)$/.exec(line);
    if (name?.[1] && current.name === undefined) current.name = name[1];
    if (/^ {6}matrix:$/.test(line)) {
      inMatrix = true;
      continue;
    }
    if (inMatrix) {
      const axis = /^ {8}(\w+): \[(.*)\]$/.exec(line);
      if (axis?.[1] && axis[2] !== undefined)
        current.matrix.set(
          axis[1],
          axis[2].split(",").map((s) => s.trim()),
        );
      else if (!/^ {8}/.test(line)) inMatrix = false;
    }
  }
  const out = new Map<string, string[]>();
  for (const [jobId, { name, matrix }] of byJob) {
    if (name === undefined) throw new Error(`ci.yml job ${jobId} has no name`);
    let names = [name];
    for (const [axis, values] of matrix) {
      const slot = `\${{ matrix.${axis} }}`;
      if (!name.includes(slot)) continue;
      names = names.flatMap((n) => values.map((v) => n.split(slot).join(v)));
    }
    if (names.some((n) => n.includes("${{"))) throw new Error(`ci.yml job ${jobId}: unexpanded name ${name}`);
    out.set(jobId, names);
  }
  return out;
}

describe("FULL_RUN_JOBS follows ci.yml", () => {
  const jobs = ciJobNames();

  it("is every job ci.yml defines, but the benchmark", () => {
    const all = [...jobs.values()].flat();
    expect(jobs.get("bench")).toEqual(INFORMATIONAL_JOBS);
    expect([...(FULL_RUN_JOBS as string[])].sort()).toEqual(all.filter((n) => !INFORMATIONAL_JOBS.includes(n)).sort());
  });

  it("holds every required check the release guard reads", () => {
    const guard = readFileSync(new URL("../scripts/release-guard.sh", import.meta.url), "utf8");
    const line = guard.split("\n").find((l) => l.startsWith("required=("));
    const required = [...(line ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(0);
    for (const name of required) expect(FULL_RUN_JOBS).toContain(name);
  });
});
