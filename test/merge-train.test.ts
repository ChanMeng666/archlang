/** scripts/merge-train.mjs: land several reviewed PRs with one full CI run, the three laws kept. */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as train from "../scripts/merge-train.mjs";
import { mkTmp } from "./helpers/tmp.js";

const {
  cleanupPlan,
  forbidden,
  isTrainBranch,
  keepWaiting,
  landVerdict,
  latestCiRun,
  law3,
  main,
  memberVerdict,
  parseArgs,
  parseRecord,
  renderBody,
  renderRecord,
  reviewedShas,
  trainBranch,
  trainTitle,
} = train;

/**
 * The pure cores on literal inputs (the record, every precondition and landing refusal, law 3's one
 * exemption, the cleanup order), then the script in process on throwaway git repositories (`mkTmp`):
 * a local `origin` with four PR branches and `refs/pull/<n>/head`, a fake `gh`, a fake regenerator.
 * No network, no `gen:all`.
 */

const REPO = "o/r";
const sha = (c: string) => c.repeat(40).slice(0, 40);
const A = sha("a");
const B = sha("b");
const C = sha("c");
const H = sha("d");
const M = sha("e");

const owner = (body: string, authorAssociation = "OWNER") => ({ authorAssociation, body });

const openPr = (over: Record<string, unknown> = {}) => ({
  number: 7,
  state: "OPEN",
  isDraft: false,
  baseRefName: "main",
  headRefName: "feat/x",
  headRefOid: A,
  headRepository: { name: "r" },
  headRepositoryOwner: { login: "o" },
  isCrossRepository: false,
  title: "feat: x",
  comments: [owner(`reviewed ${A}`)],
  ...over,
});
const ciRun = (over: Record<string, unknown> = {}) => ({
  id: 10,
  head_sha: A,
  event: "pull_request",
  head_branch: "feat/x",
  head_repository: { full_name: REPO },
  status: "completed",
  conclusion: "success",
  ...over,
});
const runs = (...rs: unknown[]) => ({ workflow_runs: rs });

describe("pure cores", () => {
  it("names a train branch by its UTC stamp", () => {
    expect(trainBranch(new Date(Date.UTC(2026, 10, 5, 3, 4, 9)))).toBe("train/20261105-030409");
    expect(isTrainBranch("train/20261105-030409")).toBe(true);
    expect(isTrainBranch("train/x")).toBe(false);
    expect(isTrainBranch("feat/ft2-merge-train")).toBe(false);
  });

  it("refuses pushes to main, force pushes, --admin, --auto, squash and rebase", () => {
    const branch = "train/20261105-030409";
    expect(forbidden("git", ["push", "-q", "origin", `refs/heads/${branch}:refs/heads/${branch}`])).toBeNull();
    expect(forbidden("git", ["push", "-q", "origin", "--delete", "fix/main"])).toBeNull();
    for (const a of ["main", "refs/heads/main", "HEAD:main", "train/x:refs/heads/main"])
      expect(forbidden("git", ["push", "origin", a])).toMatch(/naming main/);
    for (const a of ["-f", "--force", "--force-with-lease", "+refs/heads/x:refs/heads/x", "--mirror", "--all"])
      expect(forbidden("git", ["push", "origin", a])).toMatch(/force or bulk/);
    expect(forbidden("git", ["push", "origin", "--delete", "main"])).toMatch(/naming main/);
    for (const a of ["--admin", "--auto", "--squash", "-s", "--rebase", "-r"])
      expect(forbidden("gh", ["pr", "merge", "1", "--merge", a])).toBe(`gh ${a}`);
    expect(forbidden("gh", ["pr", "merge", "1", "--merge", "--match-head-commit", A])).toBeNull();
  });

  it("reads `reviewed <full sha>` lines only from the owner, members and collaborators", () => {
    const got = reviewedShas([
      owner(`reviewed ${A}`),
      owner(`notes\nreviewed ${B} (round 2)`, "COLLABORATOR"),
      owner(`reviewed ${C}`, "NONE"),
      owner(`reviewed ${H.slice(0, 39)}`),
      owner(`I reviewed ${M}`),
      owner(`Reviewed ${M}`),
    ]);
    expect([...got].sort()).toEqual([A, B]);
  });

  it("takes the newest pull_request run of the PR's own branch on that SHA", () => {
    const got = latestCiRun(
      runs(
        ciRun({ id: 3 }),
        ciRun({ id: 9, head_branch: "other" }),
        ciRun({ id: 8, event: "push" }),
        ciRun({ id: 5, conclusion: "failure" }),
        ciRun({ id: 11, head_repository: { full_name: "fork/r" } }),
      ),
      { sha: A, branch: "feat/x", repo: REPO },
    );
    expect(got.id).toBe(5);
    expect(latestCiRun(null, { sha: A, branch: "feat/x", repo: REPO })).toBeNull();
  });

  it("boards a reviewed, green PR at its head; a low-tier PR needs no review comment", () => {
    expect(memberVerdict({ pr: openPr(), repo: REPO, tier: "medium", runs: runs(ciRun()) })).toEqual({
      ok: true,
      pinned: A,
      reasons: [],
    });
    expect(memberVerdict({ pr: openPr({ comments: [] }), repo: REPO, tier: "low", runs: runs(ciRun()) }).pinned).toBe(
      A,
    );
  });

  it("refuses every precondition by name", () => {
    const why = (over: Record<string, unknown>, tier = "medium", rs: unknown = runs(ciRun())) =>
      memberVerdict({ pr: openPr(over), repo: REPO, tier, runs: rs }).reasons.join("; ");
    expect(why({ state: "CLOSED" })).toContain("not open (CLOSED)");
    expect(why({ state: "MERGED" })).toContain("not open (MERGED)");
    expect(why({ isDraft: true })).toContain("a draft");
    expect(why({ baseRefName: "release" })).toContain("targets release, not main");
    expect(why({ isCrossRepository: true })).toContain("a fork PR");
    expect(why({ headRepositoryOwner: { login: "someone" } })).toContain("a fork PR");
    expect(why({ headRefName: "train/20261105-030409" })).toContain("a train PR");
    // A review of an older head does not pin the new one (law 1).
    expect(why({ comments: [owner(`reviewed ${B}`)] }, "high")).toContain(`no \`reviewed ${A}\` comment`);
    expect(why({ comments: [owner(`reviewed ${A}`, "CONTRIBUTOR")] })).toContain("no `reviewed");
    expect(why({}, "medium", runs(ciRun({ status: "in_progress", conclusion: null })))).toContain("is in_progress");
    expect(why({}, "medium", runs(ciRun({ conclusion: "failure" })))).toContain("concluded failure");
    expect(why({}, "medium", runs())).toContain("no CI run yet");
    expect(why({}, "medium", null)).toContain("no CI run yet");
    expect(why({}, null as unknown as string)).toContain("risk tier could not be read");
    expect(
      memberVerdict({ pr: openPr({ isDraft: true }), repo: REPO, tier: "low", runs: runs(ciRun()) }).pinned,
    ).toBeNull();
  });

  it("law 3 is waived only for one member whose tree is the train head's", () => {
    const one = [{ number: 1 }];
    expect(law3({ members: one, headTree: A, memberTree: A }).required).toBe(false);
    expect(law3({ members: one, headTree: A, memberTree: B }).required).toBe(true);
    expect(law3({ members: one, headTree: null, memberTree: null }).required).toBe(true);
    expect(law3({ members: [{ number: 1 }, { number: 2 }], headTree: A, memberTree: A }).required).toBe(true);
  });

  const rec = {
    v: 1,
    repo: REPO,
    branch: "train/20261105-030409",
    base: B,
    head: H,
    exempt: false,
    members: [
      { number: 1, branch: "feat/a", pinned: A, tier: "medium", title: "feat: a <!-- train-record:end --> & more" },
      { number: 2, branch: "docs/b", pinned: C, tier: "low", title: "docs: b" },
    ],
    dropped: [{ number: 3, reason: "hand conflicts with the train", files: ["src/a.ts"] }],
  };

  it("the record round-trips through the body, whatever a title holds, CRLF included", () => {
    const law = { required: true, why: "2 members merged together" };
    const body = renderBody({ rec, law, focusText: "#1 feat: a\n  head: x" });
    expect(parseRecord(body)).toEqual(rec);
    expect(parseRecord(body.replace(/\n/g, "\r\n"))).toEqual(rec);
    expect(body).toContain(`reviewed ${H}`);
    expect(body).toContain("#3 hand conflicts with the train: `src/a.ts`");
    expect(parseRecord(`text\n${renderRecord(rec)}\nmore`)).toEqual(rec);
    expect(trainTitle(rec.members)).toBe("train: #1 #2");
  });

  it("a missing, doubled or malformed record is refused, never guessed", () => {
    const block = renderRecord(rec);
    expect(() => parseRecord("no record")).toThrow(/no train record/);
    expect(() => parseRecord(`${block}\n${block}`)).toThrow(/more than one/);
    expect(() => parseRecord(block.replace("<!-- train-record:end -->", ""))).toThrow(/not closed/);
    const bad = (over: Record<string, unknown>) => () => parseRecord(renderRecord({ ...rec, ...over }));
    expect(bad({ head: "abc" })).toThrow(/base or head/);
    expect(bad({ branch: "feat/x" })).toThrow(/branch/);
    expect(bad({ members: [] })).toThrow(/members/);
    expect(bad({ members: [{ ...rec.members[0], branch: "train/20261105-030409" }] })).toThrow(/branch/);
    expect(bad({ members: [rec.members[0], rec.members[0]] })).toThrow(/twice/);
    expect(bad({ members: [{ ...rec.members[0], pinned: "x" }] })).toThrow(/pinned/);
    expect(bad({ v: 2 })).toThrow(/version/);
  });

  /** Facts that land: every refusal below changes one of them. */
  const facts = () => ({
    rec,
    train: {
      state: "OPEN",
      isCrossRepository: false,
      headRefName: rec.branch,
      baseRefName: "main",
      headRefOid: H,
      mergeStateStatus: "CLEAN",
      comments: [owner(`reviewed ${H}`)],
    },
    mainSha: B,
    members: {
      1: { state: "OPEN", headRefOid: A, comments: [owner(`reviewed ${A}`)] },
      2: { state: "OPEN", headRefOid: C, comments: [] },
    } as Record<number, Record<string, unknown>>,
    ciRun: ciRun({ head_sha: H, head_branch: rec.branch }),
    checks: {
      total_count: 3,
      check_runs: [
        { name: "Node 22", status: "completed", conclusion: "success" },
        { name: "Node 18 tests 1/3", status: "completed", conclusion: "skipped" },
        { name: "Benchmark (informational)", status: "completed", conclusion: "failure" },
      ],
    },
    headTree: null as string | null,
    memberTree: null as string | null,
  });
  type Facts = ReturnType<typeof facts>;
  const refusedBy = (change: (f: Facts) => void) => {
    const f = facts();
    change(f);
    return landVerdict(f);
  };
  const msgs = (v: { refusals: { msg: string }[] }) => v.refusals.map((r) => r.msg).join("; ");

  it("lands when every law holds", () => {
    const v = landVerdict(facts());
    expect(v).toMatchObject({ ok: true, refusals: [], pending: [] });
    expect(v.law.required).toBe(true);
  });

  it("refuses to land on each broken fact, by name", () => {
    expect(msgs(refusedBy((f) => (f.train.state = "CLOSED")))).toContain("the train PR is CLOSED");
    expect(msgs(refusedBy((f) => (f.train.isCrossRepository = true)))).toContain("from a fork");
    expect(msgs(refusedBy((f) => (f.train.headRefName = "train/20261105-030410")))).toContain("branch is");
    expect(msgs(refusedBy((f) => (f.train.baseRefName = "dev")))).toContain("targets dev");
    expect(msgs(refusedBy((f) => (f.train.headRefOid = M)))).toContain("abandon and rebuild");
    expect(msgs(refusedBy((f) => (f.mainSha = M)))).toContain("main is at");
    expect(msgs(refusedBy((f) => (f.train.mergeStateStatus = "BEHIND")))).toContain("BEHIND: rebuild");
    expect(msgs(refusedBy((f) => (f.train.mergeStateStatus = "DIRTY")))).toContain("DIRTY: rebuild");
    expect(msgs(refusedBy((f) => (f.train.mergeStateStatus = "BLOCKED")))).toContain("mergeStateStatus is BLOCKED");
    expect(msgs(refusedBy((f) => (f.members[1] = { state: "MERGED" })))).toContain("member #1 is MERGED");
    expect(msgs(refusedBy((f) => delete f.members[2]))).toContain("member #2 is undefined");
    expect(msgs(refusedBy((f) => (f.members[1] = { ...f.members[1], headRefOid: M })))).toContain(
      `not its pinned ${A}`,
    );
    expect(msgs(refusedBy((f) => (f.members[1] = { ...f.members[1], comments: [] })))).toContain("(law 1)");
    expect(msgs(refusedBy((f) => (f.ciRun = ciRun({ head_sha: H, conclusion: "failure" }))))).toContain(
      "concluded failure",
    );
    expect(
      msgs(
        refusedBy((f) => (f.checks.check_runs[0] = { name: "Node 22", status: "completed", conclusion: "failure" })),
      ),
    ).toContain('check "Node 22" concluded failure');
    expect(msgs(refusedBy((f) => (f.checks.total_count = 200)))).toContain("not on one page");
  });

  it("law 3: refused without `reviewed <train head>`, unless one member's tree is the head's", () => {
    const v = refusedBy((f) => (f.train.comments = [owner(`reviewed ${A}`)]));
    expect(v.refusals).toEqual([expect.objectContaining({ kind: "review" })]);
    const one = refusedBy((f) => {
      f.rec = { ...rec, members: rec.members.slice(1) };
      f.train.comments = [];
      f.headTree = M;
      f.memberTree = M;
    });
    expect(one.ok).toBe(true);
    const differs = refusedBy((f) => {
      f.rec = { ...rec, members: rec.members.slice(1) };
      f.train.comments = [];
      f.headTree = M;
      f.memberTree = A;
    });
    expect(msgs(differs)).toContain("law 3");
  });

  it("CI still running is pending, never green: --wait waits through it and law 3, not through a refusal", () => {
    const queued = refusedBy((f) => {
      f.ciRun = ciRun({ head_sha: H, status: "queued", conclusion: null });
      f.checks = { total_count: 0, check_runs: [] };
    });
    expect(queued.ok).toBe(false);
    expect(queued.pending).toEqual(["the train head: CI run 10 is queued", "no check-runs on the train head yet"]);
    expect(keepWaiting(queued)).toBe(true);
    const noRun = refusedBy((f) => (f.ciRun = null as unknown as ReturnType<typeof ciRun>));
    expect(noRun.pending).toEqual(["the train head: no CI run yet"]);
    const codeql = refusedBy((f) => {
      f.checks.check_runs.push({ name: "Analyze", status: "in_progress", conclusion: "" });
      f.checks.total_count = f.checks.check_runs.length;
    });
    expect(codeql.pending).toEqual(['check "Analyze" is in_progress']);
    const reviewAndQueued = refusedBy((f) => {
      f.ciRun = ciRun({ head_sha: H, status: "in_progress", conclusion: null });
      f.train.comments = [];
    });
    expect(keepWaiting(reviewAndQueued)).toBe(true);
    const movedAndQueued = refusedBy((f) => {
      f.ciRun = ciRun({ head_sha: H, status: "in_progress", conclusion: null });
      f.mainSha = M;
    });
    expect(keepWaiting(movedAndQueued)).toBe(false);
  });

  it("cleanup: nothing unless merged; a branch goes only when MERGED, at the pin, and no PR's base", () => {
    const m = (over: Record<string, unknown>) => ({
      number: 1,
      state: "MERGED",
      pinned: A,
      remoteTip: A,
      dependents: [],
      ...over,
    });
    expect(cleanupPlan({ merged: false, members: [m({})] })).toEqual([
      { number: 1, deleteBranch: false, comment: false, note: "the train PR did not merge: untouched" },
    ]);
    const plan = cleanupPlan({
      merged: true,
      members: [
        m({}),
        m({ number: 2, state: "OPEN" }),
        m({ number: 3, remoteTip: null }),
        m({ number: 4, remoteTip: B }),
        m({ number: 5, dependents: [9] }),
      ],
    });
    expect(plan.map((p: { deleteBranch: boolean; comment: boolean }) => [p.deleteBranch, p.comment])).toEqual([
      [true, true],
      [false, false],
      [false, true],
      [false, true],
      [false, true],
    ]);
    expect(plan[1].note).toContain("untouched");
    expect(plan[3].note).toContain(`moved to ${B}`);
    expect(plan[4].note).toContain("#9");
  });

  it("parses the three modes and refuses mixed or unknown flags", () => {
    expect(parseArgs(["12", "#13", "--json"])).toMatchObject({ mode: "build", prs: [12, 13], json: true });
    expect(parseArgs(["--land", "40", "--wait"])).toMatchObject({ mode: "land", pr: 40, wait: true });
    expect(parseArgs(["--abandon", "#40"])).toMatchObject({ mode: "abandon", pr: 40 });
    expect(() => parseArgs([])).toThrow(/name the PRs/);
    expect(() => parseArgs(["1", "1"])).toThrow(/twice/);
    expect(() => parseArgs(["--land", "1", "2"])).toThrow(/train PR only/);
    expect(() => parseArgs(["--abandon", "1", "--wait"])).toThrow(/--wait/);
    expect(() => parseArgs(["1", "--force"])).toThrow(/unknown argument --force/);
    expect(() => parseArgs(["--land", "1", "--abandon", "2"])).toThrow(/once/);
  });
});

// ---- the script on throwaway repositories --------------------------------------------------------

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

type Files = Record<string, string>;
type Pr = Record<string, unknown> & { number: number; headRefName: string; headRefOid: string };

const CHANGELOG_BASE = "# Changelog\n\n## [Unreleased]\n\n- base entry\n\n## [1.0.0] - 2026-01-01\n\n- old entry\n";
const withEntry = (e: string) => CHANGELOG_BASE.replace("- base entry\n", `- base entry\n${e}\n`);
const BASE: Files = {
  ".claude/hooks/generated-artifacts.json": JSON.stringify({ artifacts: { "gen/out.txt": "gen:x" }, partial: [] }),
  "CHANGELOG.md": CHANGELOG_BASE,
  "gen/out.txt": "count 0\n",
  "src/a.ts": "export const a = 1;\n",
};

function setup() {
  const root = mkTmp("archlang-merge-train-");
  roots.push(root);
  const origin = join(root, "origin");
  const work = join(root, "work");
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const configure = (cwd: string) => {
    for (const [k, v] of [
      ["core.autocrlf", "false"],
      ["user.email", "merge-train@example.invalid"],
      ["user.name", "merge-train"],
      ["commit.gpgsign", "false"],
      ["core.hooksPath", join(root, "no-hooks")],
      ["gc.auto", "0"],
      ["maintenance.auto", "false"],
    ])
      git(cwd, "config", k as string, v as string);
  };
  const commit = (cwd: string, files: Files, msg: string) => {
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, p)), { recursive: true });
      writeFileSync(join(cwd, p), text);
    }
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", msg);
    return git(cwd, "rev-parse", "HEAD");
  };
  mkdirSync(origin);
  git(origin, "init", "-q", "-b", "main");
  configure(origin);
  commit(origin, BASE, "base");
  git(root, "clone", "-q", "-c", "core.autocrlf=false", origin, work);
  configure(work);
  const prs: Record<number, Pr> = {};
  /** A PR branch cut from the base, pushed with its `refs/pull/<n>/head`. */
  const pr = (number: number, branch: string, files: Files) => {
    git(work, "checkout", "-q", "-b", branch, "origin/main");
    const head = commit(work, files, `pr ${number}`);
    git(work, "push", "-q", "origin", `${branch}:${branch}`, `${branch}:refs/pull/${number}/head`);
    prs[number] = {
      number,
      state: "OPEN",
      isDraft: false,
      baseRefName: "main",
      headRefName: branch,
      headRefOid: head,
      headRepository: { name: "r" },
      headRepositoryOwner: { login: "o" },
      isCrossRepository: false,
      title: `title of #${number}`,
      labels: [],
      comments: [owner(`reviewed ${head}`)],
      mergeStateStatus: "BEHIND",
    };
  };
  return { root, origin, work, git, commit, prs, pr };
}

/** A fake `gh` over the PR table: every call recorded, the merge and the member states scripted. */
function fakeGh(r: ReturnType<typeof setup>, script: { merge?: () => { status: number; stderr?: string } } = {}) {
  const calls: string[][] = [];
  const ok = (v: unknown) => ({ status: 0, stdout: typeof v === "string" ? v : JSON.stringify(v), stderr: "" });
  const branchOf = (s: string) => Object.values(r.prs).find((p) => p.headRefOid === s)?.headRefName;
  const gh = (args: string[]) => {
    calls.push(args);
    const [a, b] = args;
    if (a === "repo") return ok({ nameWithOwner: REPO });
    if (a === "api") {
      const path = args[1] ?? "";
      const head = /head_sha=([0-9a-f]{40})/.exec(path)?.[1];
      if (path.includes("branch=main&event=push"))
        return ok({ workflow_runs: [{ id: 1, head_sha: A, status: "completed", conclusion: "success" }] });
      if (head) return ok(runs(ciRun({ id: 20, head_sha: head, head_branch: branchOf(head) })));
      const checks = /commits\/([0-9a-f]{40})\/check-runs/.exec(path);
      if (checks)
        return ok({ total_count: 1, check_runs: [{ name: "Node 22", status: "completed", conclusion: "success" }] });
      const commit = /git\/commits\/([0-9a-f]{40})$/.exec(path)?.[1];
      if (commit) {
        const [, ...parents] = r.git(r.origin, "rev-list", "--parents", "-n", "1", commit).split(" ");
        return ok({
          sha: commit,
          tree: { sha: r.git(r.origin, "rev-parse", `${commit}^{tree}`) },
          parents: parents.map((p) => ({ sha: p })),
        });
      }
    }
    if (a === "pr" && b === "view") {
      const p = r.prs[Number(args[2])];
      return p ? ok(p) : { status: 1, stdout: "", stderr: "no such PR" };
    }
    if (a === "pr" && b === "create") {
      const body = readFileSync(args[args.indexOf("--body-file") + 1] as string, "utf8");
      const head = args[args.indexOf("--head") + 1] as string;
      r.prs[99] = {
        number: 99,
        state: "OPEN",
        baseRefName: "main",
        headRefName: head,
        headRefOid: r.git(r.origin, "rev-parse", `refs/heads/${head}`),
        isCrossRepository: false,
        mergeStateStatus: "CLEAN",
        comments: [],
        body,
      };
      return ok("https://github.com/o/r/pull/99\n");
    }
    if (a === "pr" && b === "merge") {
      const res = script.merge?.() ?? { status: 1, stderr: "not scripted" };
      return { status: res.status, stdout: "", stderr: res.stderr ?? "" };
    }
    if (a === "pr" && b === "comment") return ok("");
    if (a === "pr" && b === "list") return ok([]);
    if (a === "pr" && b === "close") {
      (r.prs[Number(args[2])] as Pr).state = "CLOSED";
      return ok("");
    }
    return { status: 1, stdout: "", stderr: `fake gh: unexpected ${args.join(" ")}` };
  };
  return { gh, calls };
}

const NOW = () => new Date(Date.UTC(2026, 10, 15, 1, 2, 3));
const BRANCH = "train/20261115-010203";

// About 120 git processes: a few seconds on Linux, more on Windows (the main-only Windows leg runs it).
describe("the train on a throwaway repository", { timeout: 60_000 }, () => {
  it("builds (a scripted conflict boards, a hand conflict drops), refuses a failed merge's cleanup, then lands", () => {
    const r = setup();
    r.pr(1, "feat/a", {
      "src/a.ts": "export const a = 2;\n",
      "CHANGELOG.md": withEntry("- a entry"),
      "gen/out.txt": "count a\n",
    });
    r.pr(2, "feat/b", { "CHANGELOG.md": withEntry("- b entry"), "gen/out.txt": "count b\n" });
    r.pr(3, "feat/c", { "src/a.ts": "export const a = 3;\n" });
    r.pr(4, "feat/d", {
      "src/d.ts": 'import { a } from "./a.js";\nexport const d = a;\n',
      "CHANGELOG.md": withEntry("- d entry"),
    });
    const base = r.commit(r.origin, { "src/m.ts": "export const m = 1;\n" }, "main moves");
    r.git(r.work, "checkout", "-q", "--detach");

    const lines = { out: [] as string[], err: [] as string[] };
    const runMain = (argv: string[], gh: (a: string[]) => unknown, extra: Record<string, unknown> = {}) => {
      lines.out = [];
      lines.err = [];
      return main(argv, {
        cwd: r.work,
        out: (l: string) => lines.out.push(l),
        err: (l: string) => lines.err.push(l),
        gh,
        now: NOW,
        sleep: () => {},
        memberPoll: { intervalMs: 0, attempts: 2 },
        ...extra,
      });
    };
    const fake = fakeGh(r);
    const regen = (wt: string) => {
      writeFileSync(join(wt, "gen/out.txt"), "regenerated\n");
      return true;
    };
    const code = runMain(["1", "2", "3", "4", "--json"], fake.gh, { runGen: regen });
    expect(code, lines.err.join("\n")).toBe(0);
    const j = JSON.parse(lines.out.join("\n"));
    expect(j).toMatchObject({
      trainPr: 99,
      branch: BRANCH,
      base,
      regenerated: ["gen/out.txt"],
      law3: { required: true },
    });
    expect(j.members.map((m: { number: number }) => m.number)).toEqual([1, 2, 4]);
    expect(j.members[0]).toEqual({
      number: 1,
      branch: "feat/a",
      pinned: r.prs[1]?.headRefOid,
      tier: "medium",
      title: "title of #1",
    });
    expect(j.dropped).toEqual([{ number: 3, reason: "hand conflicts with the train", files: ["src/a.ts"] }]);
    expect(j.focus["2"].scripted.sort()).toEqual(["CHANGELOG.md", "gen/out.txt"]);
    expect(j.focus["1"]).toMatchObject({ overlap: [], hand: [], importLinked: ["src/d.ts"] });
    expect(j.focus["1"].changedExports).toEqual(["src/d.ts: d", "src/m.ts: m"]);

    // The pushed tip: GitHub's merge subjects on the first-parent line, the regeneration on top.
    expect(r.git(r.origin, "rev-parse", `refs/heads/${BRANCH}`)).toBe(j.head);
    expect(r.git(r.origin, "log", "--first-parent", "--format=%s", `${base}..${j.head}`).split("\n")).toEqual([
      "chore(train): regenerate the generated artifacts",
      "Merge pull request #4 from o/feat/d",
      "Merge pull request #2 from o/feat/b",
      "Merge pull request #1 from o/feat/a",
    ]);
    expect(r.git(r.origin, "log", "-1", "--format=%b", `${j.head}~1`)).toBe("title of #4");
    expect(r.git(r.origin, "show", `${j.head}:gen/out.txt`)).toBe("regenerated");
    const changelog = r.git(r.origin, "show", `${j.head}:CHANGELOG.md`);
    for (const e of ["- a entry", "- b entry", "- d entry"]) expect(changelog).toContain(e);
    expect(r.git(r.origin, "show", `${j.head}:src/a.ts`)).toBe("export const a = 2;");
    const record = parseRecord(r.prs[99]?.body);
    expect(record).toMatchObject({ branch: BRANCH, base, head: j.head, dropped: j.dropped });
    const wt = join(r.work, ".claude", "worktrees", "train-20261115-010203");
    expect(existsSync(wt)).toBe(true);
    const create = fake.calls.find((c) => c[0] === "pr" && c[1] === "create");
    expect(create).toEqual(expect.arrayContaining(["--base", "main", "--head", BRANCH, "--title", "train: #1 #2 #4"]));

    // Land, with the merge failing: refused cleanup, everything still in place.
    (r.prs[99] as Pr).comments = [owner(`reviewed ${j.head}`)];
    const failing = fakeGh(r, { merge: () => ({ status: 1, stderr: "Head branch was modified" }) });
    expect(runMain(["--land", "99"], failing.gh)).toBe(1);
    expect(lines.err.join("\n")).toContain("nothing was cleaned up");
    expect(failing.calls.filter((c) => c[1] === "comment" || c[1] === "list")).toEqual([]);
    for (const b of ["feat/a", "feat/b", "feat/d", BRANCH])
      expect(r.git(r.origin, "rev-parse", `refs/heads/${b}`)).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(wt)).toBe(true);
    const mergeCall = failing.calls.find((c) => c[1] === "merge");
    expect(mergeCall).toEqual(["pr", "merge", "99", "--merge", "--match-head-commit", j.head]);

    // Land for real: GitHub's merge (simulated on origin), #1 and #2 marked merged, #4 not.
    const landing = fakeGh(r, {
      merge: () => {
        r.git(r.origin, "merge", "-q", "--no-ff", "-m", `Merge pull request #99 from o/${BRANCH}`, j.head);
        Object.assign(r.prs[99] as Pr, { state: "MERGED", mergeCommit: { oid: r.git(r.origin, "rev-parse", "HEAD") } });
        (r.prs[1] as Pr).state = "MERGED";
        (r.prs[2] as Pr).state = "MERGED";
        return { status: 0 };
      },
    });
    expect(runMain(["--land", "99", "--json"], landing.gh)).toBe(1);
    const landed = JSON.parse(lines.out.join("\n"));
    const mergeSha = r.git(r.origin, "rev-parse", "main");
    expect(landed).toMatchObject({ trainPr: 99, merged: true, mergeSha });
    expect(r.git(r.origin, "rev-parse", "main^1")).toBe(base);
    expect(r.git(r.origin, "rev-parse", "main^2")).toBe(j.head);
    expect(
      landed.members.map((m: { number: number; branchDeleted: boolean; commented: boolean }) => [
        m.number,
        m.branchDeleted,
        m.commented,
      ]),
    ).toEqual([
      [1, true, true],
      [2, true, true],
      [4, false, false],
    ]);
    expect(lines.err.join("\n")).toContain("MEMBER #4 IS NOT MARKED MERGED");
    const heads = r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n");
    expect(heads.sort()).toEqual(["feat/c", "feat/d", "main"]);
    expect(landing.calls.filter((c) => c[1] === "comment").map((c) => [c[2], c[4]])).toEqual([
      ["1", `landed by train #99 (${mergeSha})`],
      ["2", `landed by train #99 (${mergeSha})`],
    ]);
    expect(existsSync(wt)).toBe(false);
    expect(r.git(r.work, "branch", "--list", BRANCH)).toBe("");
    for (const calls of [fake.calls, failing.calls, landing.calls])
      for (const c of calls) expect(forbidden("gh", c)).toBeNull();
  });

  it("refuses to build when a member is not ready, and creates nothing", () => {
    const r = setup();
    r.pr(1, "feat/a", { "src/a.ts": "export const a = 2;\n" });
    r.pr(2, "feat/b", { "src/b.ts": "export const b = 2;\n" });
    (r.prs[2] as Pr).comments = [];
    (r.prs[1] as Pr).isDraft = true;
    const fake = fakeGh(r);
    const err: string[] = [];
    const code = main(["1", "2"], {
      cwd: r.work,
      out: () => {},
      err: (l: string) => err.push(l),
      gh: fake.gh,
      now: NOW,
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("#1: a draft");
    expect(err.join("\n")).toContain("#2: no `reviewed");
    expect(existsSync(join(r.work, ".claude", "worktrees"))).toBe(false);
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads/train")).toBe("");
  });

  it("abandons: closes the train PR, deletes its branch, leaves the members alone", () => {
    const r = setup();
    r.pr(1, "feat/a", { "src/a.ts": "export const a = 2;\n" });
    r.git(r.work, "push", "-q", "origin", `feat/a:refs/heads/${BRANCH}`);
    r.prs[99] = {
      number: 99,
      state: "OPEN",
      headRefName: BRANCH,
      headRefOid: r.prs[1]?.headRefOid as string,
      isCrossRepository: false,
    };
    const fake = fakeGh(r);
    const out: string[] = [];
    const code = main(["--abandon", "99"], {
      cwd: r.work,
      out: (l: string) => out.push(l),
      err: () => {},
      gh: fake.gh,
    });
    expect(code).toBe(0);
    expect(r.prs[99]?.state).toBe("CLOSED");
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").sort()).toEqual([
      "feat/a",
      "main",
    ]);
    expect(fake.calls.filter((c) => c[1] === "close")).toHaveLength(1);
    // A non-train PR is refused.
    expect(main(["--abandon", "1"], { cwd: r.work, out: () => {}, err: () => {}, gh: fake.gh })).toBe(2);
  });
});
