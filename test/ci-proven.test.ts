/** scripts/ci-proven.mjs: when a push to `main` is proven by a train PR's full CI run. */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as ciProven from "../scripts/ci-proven.mjs";

const {
  checkRun,
  FULL_RUN_JOBS,
  fullRun,
  INFORMATIONAL_JOBS,
  isTrainRun,
  MAX_PROOF_AGE_MS,
  main,
  NOTHING_TO_RUN_STEPS,
  prove,
} = ciProven;

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
const BRANCH = "train/20261115-1";
const PROOF = `https://github.com/${REPO}/actions/runs/100`;
const PUSHED = "2026-11-15T12:00:00Z";
const hoursBefore = (hours: number) => new Date(Date.parse(PUSHED) - hours * 3_600_000).toISOString();
/** A GitHub Actions expression as ci.yml writes it, built so no string literal holds a `${` placeholder. */
const gh = (body: string) => ["$", "{{ ", body, " }}"].join("");

const trainRun = (over: Json = {}): Json => ({
  id: 100,
  workflow_id: WORKFLOW_ID,
  head_sha: P2,
  event: "pull_request",
  head_branch: BRANCH,
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  html_url: PROOF,
  updated_at: hoursBefore(1),
  pull_requests: [], // what the live API returns once the PR has merged
  ...over,
});

/** A pull request as `commits/{sha}/pulls` returns it, merged as M. */
const pull = (over: Json = {}): Json => ({
  number: 7,
  state: "closed",
  merged_at: hoursBefore(0.1),
  merge_commit_sha: M,
  base: { ref: "main", repo: { full_name: REPO } },
  head: { ref: BRANCH, sha: P2, repo: { full_name: REPO } },
  ...over,
});

const job = (name: string, over: Json = {}): Json => ({
  name,
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  steps: [
    { name: "Set up job", conclusion: "success" },
    { name: NOTHING_TO_RUN_STEPS[0], conclusion: "skipped" },
    { name: NOTHING_TO_RUN_STEPS[1], conclusion: "skipped" },
    { name: "Run the work", conclusion: "success" },
  ],
  ...over,
});
const jobsOf = (jobs: Json[]): Json => ({ total_count: jobs.length, jobs });
const fullJobs = (): Json[] => [
  ...(FULL_RUN_JOBS as string[]).map((n) => job(n)),
  job("Benchmark (informational)", { conclusion: "failure" }),
];

const runsPath = `/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/runs?head_sha=${P2}&event=pull_request&per_page=100`;
const jobsPath = `/repos/${REPO}/actions/runs/100/jobs?filter=latest&per_page=100`;
const pullsPath = `/repos/${REPO}/commits/${P2}/pulls`;
const runs = (...workflow_runs: Json[]) => ({ total_count: workflow_runs.length, workflow_runs });

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
    [`/repos/${REPO}/actions/runs/${RUN_ID}`]: { id: RUN_ID, workflow_id: WORKFLOW_ID, created_at: PUSHED },
    [runsPath]: runs(trainRun()),
    [pullsPath]: [pull()],
    [jobsPath]: jobsOf(fullJobs()),
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

const decide = (over?: Record<string, unknown>, before: string | undefined = P1): Promise<Verdict> =>
  prove(api(over).get, { repo: REPO, sha: M, runId: RUN_ID, before });

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

  it("needs the push's before to be M^1, and refuses when it is absent", async () => {
    for (const before of [undefined, "", h("9"), P2]) {
      const v: Verdict = await prove(api().get, { repo: REPO, sha: M, runId: RUN_ID, before });
      expect(v.proven, String(before)).toBe(false);
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
      { head_repository: null },
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

  it("needs the run updated within 24 h of the push", async () => {
    expect(MAX_PROOF_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect((await decide({ [runsPath]: runs(trainRun({ updated_at: hoursBefore(23.9) })) })).proven).toBe(true);
    for (const updated_at of [hoursBefore(24.1), hoursBefore(-24.1), "not a time", undefined]) {
      expect((await decide({ [runsPath]: runs(trainRun({ updated_at })) })).proven, String(updated_at)).toBe(false);
    }
  });

  it("needs the run's pull request into main and merged as M", async () => {
    for (const pulls of [
      [],
      [pull({ base: { ref: "develop", repo: { full_name: REPO } } })],
      [pull({ merge_commit_sha: h("a") })],
      [pull({ merged_at: null })],
      [pull({ head: { ref: "train/other", sha: P2, repo: { full_name: REPO } } })],
      [pull({ head: { ref: BRANCH, sha: P2, repo: { full_name: "fork/repo" } } })],
      [pull({ head: { ref: BRANCH, sha: h("b"), repo: { full_name: REPO } } })],
      { message: "Not Found" },
    ]) {
      expect((await decide({ [pullsPath]: pulls })).proven, JSON.stringify(pulls)).toBe(false);
    }
    // The run's own `pull_requests` (the live shape: repo as `url`), when filled, must point at main.
    const own = (ref: string) => ({
      number: 7,
      base: { ref, repo: { url: `https://api.github.com/repos/${REPO}` } },
      head: { ref: BRANCH, sha: P2, repo: { url: `https://api.github.com/repos/${REPO}` } },
    });
    expect((await decide({ [runsPath]: runs(trainRun({ pull_requests: [own("main")] })) })).proven).toBe(true);
    expect((await decide({ [runsPath]: runs(trainRun({ pull_requests: [own("develop")] })) })).proven).toBe(false);
    expect((await decide({ [runsPath]: runs(trainRun({ pull_requests: null })) })).proven).toBe(false);
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

  it("refuses a job that succeeded by running a nothing-to-run marker step", async () => {
    for (const marker of NOTHING_TO_RUN_STEPS as string[]) {
      const jobs = fullJobs().map((j) =>
        j.name === "3D package (check:3d)"
          ? {
              ...j,
              steps: [
                { name: "Set up job", conclusion: "success" },
                { name: marker, conclusion: "success" },
              ],
            }
          : j,
      );
      expect(await decide({ [jobsPath]: jobsOf(jobs) })).toMatchObject({
        proven: false,
        reason: expect.stringContaining("its work was skipped"),
      });
    }
    const noSteps = fullJobs().map((j) => (j.name === "Workspace builds" ? { ...j, steps: undefined } : j));
    expect((await decide({ [jobsPath]: jobsOf(noSteps) })).proven).toBe(false);
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

  it("prefers the newest full candidate, and falls back to an older one when the newest is not full", async () => {
    const url101 = `https://github.com/${REPO}/actions/runs/101`;
    const jobs101 = `/repos/${REPO}/actions/runs/101/jobs?filter=latest&per_page=100`;
    const newer = trainRun({ id: 101, html_url: url101 });
    expect(await decide({ [runsPath]: runs(trainRun(), newer), [jobs101]: jobsOf(fullJobs()) })).toMatchObject({
      proven: true,
      proof: url101,
    });
    const notFull = jobsOf(fullJobs().filter((j) => j.name !== "Node 18"));
    expect(await decide({ [runsPath]: runs(trainRun(), newer), [jobs101]: notFull })).toMatchObject({
      proven: true,
      proof: PROOF,
    });
  });

  it("refuses an odd shape and a malformed environment without guessing", async () => {
    expect((await decide({ [runsPath]: { workflow_runs: "nope" } })).proven).toBe(false);
    expect((await decide({ [`/repos/${REPO}/actions/runs/${RUN_ID}`]: { id: RUN_ID } })).proven).toBe(false);
    expect((await decide({ [`/repos/${REPO}/git/commits/${M}`]: null })).proven).toBe(false);
    const { get, calls } = api();
    expect((await prove(get, { repo: REPO, sha: "HEAD", runId: RUN_ID, before: P1 })).proven).toBe(false);
    expect(calls).toEqual([]);
  });

  it("isTrainRun and fullRun reject non-objects", () => {
    expect(isTrainRun(null, { repo: REPO, headSha: P2, workflowId: WORKFLOW_ID })).toBe(false);
    expect(fullRun(null, trainRun()).ok).toBe(false);
    expect(fullRun({ total_count: 1, jobs: [null] }, trainRun()).ok).toBe(false);
  });
});

describe("scripts/ci-proven.mjs checkRun() (the --run mode)", () => {
  const openPull = pull({ state: "open", merged_at: null, merge_commit_sha: h("c") });
  const tableFor = (run: Json, pulls: unknown = [openPull]) => ({
    [`/repos/${REPO}/actions/workflows/ci.yml`]: { id: WORKFLOW_ID },
    [`/repos/${REPO}/actions/runs/100`]: run,
    [pullsPath]: pulls,
  });
  const check = (table: Record<string, unknown>, now = Date.parse(PUSHED)): Promise<Verdict> =>
    checkRun(api(table).get, { repo: REPO, runId: 100, now });

  it("says yes for a full, recent train run whose PR into main is open", async () => {
    expect(await check(tableFor(trainRun()))).toMatchObject({ proven: true, proof: PROOF });
  });

  it("says no, with the reason, otherwise", async () => {
    expect((await check(tableFor(trainRun({ head_branch: "feat/x" })))).reason).toContain("not a completed");
    expect((await check(tableFor(trainRun(), [pull()]))).reason).toContain("no open train pull request");
    expect((await check(tableFor(trainRun()), Date.parse(PUSHED) + 2 * MAX_PROOF_AGE_MS)).proven).toBe(false);
    const notFull = jobsOf(fullJobs().filter((j) => j.name !== "Node 20"));
    expect((await check({ ...tableFor(trainRun()), [jobsPath]: notFull })).reason).toContain("missing: Node 20");
    expect((await checkRun(api().get, { repo: REPO, runId: "x", now: 0 })).proven).toBe(false);
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
    PUSH_BEFORE: P1,
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

  it("fails open on an API error and on a timeout", async () => {
    const failing = () => async () => {
      throw new Error("HTTP 502");
    };
    expect(await main(env, failing)).toEqual({ proven: false, reason: "error: HTTP 502" });
    const hanging = () => () => new Promise(() => {});
    expect(await main(env, hanging, 20)).toEqual({ proven: false, reason: "timed out" });
  });

  it("writes the two outputs the Verdict step reads, last", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-proven-"));
    try {
      const out = join(dir, "output");
      await main({ ...env, GITHUB_OUTPUT: out }, () => api().get);
      expect(readFileSync(out, "utf8")).toBe(`proven=true\nproof=${PROOF}\n`);
      const out2 = join(dir, "output2");
      await main({ ...env, PUSH_BEFORE: "", GITHUB_OUTPUT: out2 }, () => api().get);
      expect(readFileSync(out2, "utf8")).toBe("proven=false\nproof=\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const yml = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(yml).toContain(
      `PROVEN: ${gh("steps.proven.outcome == 'success' && steps.proven.outputs.proven == 'true'")}`,
    );
    expect(yml).toContain(`PROOF: ${gh("steps.proven.outputs.proof")}`);
    expect(yml).toContain(`PUSH_BEFORE: ${gh("github.event.before")}`);
  });
});

// ---------------------------------------------------------------------------------------------------
// ci.yml, read as text. A proving run's jobs are trusted only because (1) FULL_RUN_JOBS is every job
// ci.yml defines, (2) no job ran a NOTHING_TO_RUN step, and (3) every other step of a step-guarded job
// carries the one guard, the same predicate that decides `Node 22 checks` at job level. These tests
// pin all three, so a new PR-only narrowing of a leg cannot land without changing them.

type Step = { name?: string; uses?: string; if?: string };
type Job = {
  id: string;
  name?: string;
  matrix: Map<string, string[]>;
  env: Map<string, string>;
  jobIf?: string;
  steps: Step[];
};

function ciJobs(): Map<string, Job> {
  const lines = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").split(/\r?\n/);
  const jobs = new Map<string, Job>();
  let job: Job | undefined;
  let section: "matrix" | "env" | "steps" | undefined;
  let step: Step | undefined;
  for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
    const id = /^ {2}([A-Za-z0-9_-]+):$/.exec(line);
    if (id?.[1]) {
      job = { id: id[1], matrix: new Map(), env: new Map(), steps: [] };
      jobs.set(id[1], job);
      section = undefined;
      continue;
    }
    if (!job || /^\s*(#.*)?$/.test(line)) continue;
    const top = /^ {4}([a-z-]+):\s?(.*)$/.exec(line);
    if (top?.[1]) {
      section = top[1] === "env" ? "env" : top[1] === "steps" ? "steps" : undefined;
      if (top[1] === "name" && job.name === undefined) job.name = top[2];
      if (top[1] === "if") job.jobIf = top[2];
      continue;
    }
    if (/^ {6}matrix:$/.test(line)) {
      section = "matrix";
      continue;
    }
    if (section === "matrix") {
      const axis = /^ {8}(\w+): \[(.*)\]$/.exec(line);
      if (axis?.[1] && axis[2] !== undefined)
        job.matrix.set(
          axis[1],
          axis[2].split(",").map((s) => s.trim()),
        );
    } else if (section === "env") {
      const kv = /^ {6}([A-Z_]+): (.*)$/.exec(line);
      if (kv?.[1] && kv[2] !== undefined) job.env.set(kv[1], kv[2]);
    } else if (section === "steps") {
      const start = /^ {6}- (name|uses|if): (.*)$/.exec(line);
      if (start?.[1]) {
        step = {};
        job.steps.push(step);
      }
      const field = start ?? /^ {8}(name|uses|if): (.*)$/.exec(line);
      if (step && field?.[1] && field[2] !== undefined) step[field[1] as keyof Step] = field[2];
    }
  }
  return jobs;
}

/** Each job's check names: its `name:` with the matrix expanded. */
function checkNames(job: Job): string[] {
  if (job.name === undefined) throw new Error(`ci.yml job ${job.id} has no name`);
  let names = [job.name];
  for (const [axis, values] of job.matrix) {
    const slot = `\${{ matrix.${axis} }}`;
    if (!job.name.includes(slot)) continue;
    names = names.flatMap((n) => values.map((v) => n.split(slot).join(v)));
  }
  if (names.some((n) => n.includes("${{"))) throw new Error(`ci.yml job ${job.id}: unexpanded name ${job.name}`);
  return names;
}

const inner = (expr: string | undefined) => /^\$\{\{ (.*) \}\}$/.exec(expr ?? "")?.[1];

describe("ci.yml and the proof agree", () => {
  const jobs = ciJobs();
  const markerJobs = [...jobs.values()].filter((j) => j.steps.some((s) => s.name === NOTHING_TO_RUN_STEPS[0]));

  it("FULL_RUN_JOBS is every job ci.yml defines, but the benchmark", () => {
    const all = [...jobs.values()].flatMap(checkNames);
    expect(jobs.get("bench") && checkNames(jobs.get("bench") as Job)).toEqual(INFORMATIONAL_JOBS);
    expect([...(FULL_RUN_JOBS as string[])].sort()).toEqual(all.filter((n) => !INFORMATIONAL_JOBS.includes(n)).sort());
  });

  it("FULL_RUN_JOBS holds every required check the release guard reads", () => {
    const guard = readFileSync(new URL("../scripts/release-guard.sh", import.meta.url), "utf8");
    const line = guard.split("\n").find((l) => l.startsWith("required=("));
    const required = [...(line ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(0);
    for (const name of required) expect(FULL_RUN_JOBS).toContain(name);
  });

  it("NOTHING_TO_RUN_STEPS are exactly ci.yml's nothing-to-run step names", () => {
    const named = new Set(
      [...jobs.values()]
        .flatMap((j) => j.steps.map((s) => s.name ?? ""))
        .filter((n) => n.endsWith("nothing to run on this leg")),
    );
    expect([...named].sort()).toEqual([...(NOTHING_TO_RUN_STEPS as string[])].sort());
  });

  it("every step-guarded leaf guards each step but its markers with the Node 22 checks predicate", () => {
    const checksIf = inner(jobs.get("node-22-checks")?.jobIf);
    expect(checksIf).toMatch(/^!cancelled\(\) && /);
    const predicate = (checksIf as string).replace(/^!cancelled\(\) && /, "");
    expect(inner(jobs.get("node-22-tests")?.jobIf)).toBe(checksIf);
    expect(markerJobs.length).toBeGreaterThan(0);
    // A job with a FULL_CI env is a step-guarded leaf, `node-22` aside (its FULL_CI selects the docs leg).
    const withFullCi = [...jobs.values()].filter((j) => j.env.has("FULL_CI") && j.id !== "node-22").map((j) => j.id);
    expect(withFullCi.sort()).toEqual(markerJobs.map((j) => j.id).sort());
    for (const j of markerJobs) {
      expect(inner(j.env.get("FULL_CI")), j.id).toBe(predicate);
      const [record, proven] = NOTHING_TO_RUN_STEPS as string[];
      expect(j.steps.find((s) => s.name === record)?.if, j.id).toBe("env.FULL_CI != 'true' && env.PROVEN != 'true'");
      expect(j.steps.find((s) => s.name === proven)?.if, j.id).toBe("env.PROVEN == 'true'");
      for (const s of j.steps) {
        if (NOTHING_TO_RUN_STEPS.includes(s.name)) continue;
        const guarded = (s.if ?? "").includes("env.FULL_CI == 'true'") || s.if === "failure()";
        expect(guarded, `${j.id}: step ${s.name ?? s.uses} has no FULL_CI guard`).toBe(true);
      }
    }
  });

  it("every reader of `proven` also needs a successful `changes`, and FULL_LEG has one definition", () => {
    const provenEnv = gh("needs.changes.result == 'success' && needs.changes.outputs.proven == 'true'");
    const readers = [...jobs.values()].filter((j) => j.env.has("PROVEN"));
    expect(readers.length).toBeGreaterThan(0);
    for (const j of readers) expect(j.env.get("PROVEN"), j.id).toBe(provenEnv);
    const fullLeg = "needs.changes.result != 'success' || needs.changes.outputs.full_leg == 'true'";
    for (const id of ["node-18-tests", "node-20-tests", "windows-tests"])
      expect(inner(jobs.get(id)?.jobIf), id).toBe(`!cancelled() && (${fullLeg})`);
    for (const id of ["build", "windows"]) expect(inner(jobs.get(id)?.env.get("FULL_LEG")), id).toBe(fullLeg);
  });
});
