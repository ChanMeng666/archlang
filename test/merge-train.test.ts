/** scripts/merge-train.mjs: land several reviewed PRs with one full CI run, the three laws kept. */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as train from "../scripts/merge-train.mjs";
import { mkTmp } from "./helpers/tmp.js";

const {
  approvedAt,
  cleanupPlan,
  conflictedWith,
  dropRemedy,
  forbidden,
  headIsFresh,
  isTrainBranch,
  judgeRun,
  keepWaiting,
  landVerdict,
  latestCiRun,
  law3,
  main,
  memberVerdict,
  onlyUnknown,
  parseArgs,
  parseRecord,
  renderBody,
  renderRecord,
  reviewOf,
  trainBranch,
  trainTitle,
} = train;

/**
 * The pure cores on literal inputs (the record, every precondition and landing refusal, law 3's
 * exemptions, the cleanup order), then the script in process on throwaway git repositories (`mkTmp`):
 * a local `origin` with PR branches and `refs/pull/<n>/head`, a fake `gh`, a fake regenerator.
 * No network, no `gen:all`.
 */

const REPO = "o/r";
const sha = (c: string) => c.repeat(40).slice(0, 40);
const A = sha("a");
const B = sha("b");
const C = sha("c");
const H = sha("d");
const M = sha("e");

const owner = (body: string, authorAssociation = "OWNER", createdAt?: string) => ({
  authorAssociation,
  body,
  ...(createdAt ? { createdAt } : {}),
});

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
  pull_requests: [{ number: 7, base: { ref: "main" } }],
  status: "completed",
  conclusion: "success",
  ...over,
});
const runs = (...rs: unknown[]) => ({ workflow_runs: rs });
const jobs = (...js: [string, string][]) => ({
  total_count: js.length,
  jobs: js.map(([name, conclusion]) => ({ name, status: "completed", conclusion })),
});
const BENCH = "Benchmark (informational)";

describe("pure cores", () => {
  it("names a train branch by its UTC stamp", () => {
    expect(trainBranch(new Date(Date.UTC(2026, 10, 5, 3, 4, 9)))).toBe("train/20261105-030409");
    expect(isTrainBranch("train/20261105-030409")).toBe(true);
    expect(isTrainBranch("train/x")).toBe(false);
    expect(isTrainBranch("feat/ft2-merge-train")).toBe(false);
  });

  it("refuses pushes to main in any spelling, force and bulk pushes", () => {
    const branch = "train/20261105-030409";
    expect(forbidden("git", ["push", "-q", "origin", `refs/heads/${branch}:refs/heads/${branch}`])).toBeNull();
    expect(forbidden("git", ["push", "-q", "origin", "--delete", "refs/heads/fix/main"])).toBeNull();
    for (const a of ["main", "refs/heads/main", "heads/main", "HEAD:main", "x:refs/heads/main", "x:heads/main"])
      expect(forbidden("git", ["push", "origin", a])).toMatch(/naming main/);
    expect(forbidden("git", ["push", "origin", "--delete", "refs/heads/main"])).toMatch(/naming main/);
    for (const a of ["+refs/heads/x:refs/heads/x", "+x:main"])
      expect(forbidden("git", ["push", "origin", a])).toMatch(/force/);
    for (const a of [
      "-f",
      "-qf",
      "-fu",
      "--force",
      "--force-with-lease",
      "--force-with-lease=x",
      "--mirror",
      "--all",
      "--prune",
      "--tags",
    ])
      expect(forbidden("git", ["push", a, "origin", "x"])).toMatch(/force|bulk/);
    expect(forbidden("git", ["push", "-q", "-u", "origin", "x"])).toBeNull();
  });

  it("refuses gh --admin, --auto, any merge but a plain --merge, and an api call that is not a GET", () => {
    for (const a of ["--admin", "--auto"]) expect(forbidden("gh", ["pr", "merge", "1", "--merge", a])).toBe(`gh ${a}`);
    for (const a of ["--squash", "-s", "--rebase", "-r", "--delete-branch", "-d"])
      expect(forbidden("gh", ["pr", "merge", "1", "--merge", a])).toBe(`gh pr merge ${a}`);
    expect(forbidden("gh", ["pr", "merge", "1", "--match-head-commit", A])).toMatch(/without --merge/);
    expect(forbidden("gh", ["pr", "merge", "1", "--merge", "--match-head-commit", A])).toBeNull();
    expect(forbidden("gh", ["api", "repos/o/r/pulls"])).toBeNull();
    expect(forbidden("gh", ["api", "-X", "GET", "repos/o/r/pulls"])).toBeNull();
    for (const extra of [
      ["-X", "POST"],
      ["--method", "DELETE"],
      ["-XPATCH"],
      ["--method=PUT"],
      ["-f", "a=b"],
      ["-F", "a=b"],
      ["--field=a=b"],
      ["--raw-field", "a=b"],
      ["--input", "x.json"],
    ])
      expect(forbidden("gh", ["api", "repos/o/r/pulls", ...extra])).toMatch(/gh api/);
  });

  it("an approval is a comment whose FIRST line is exactly `reviewed <sha>`, the newest one counting", () => {
    expect(reviewOf([owner(`reviewed ${A}`)])).toBe(A);
    expect(reviewOf([owner(`reviewed ${A}  \nround 2 notes`)])).toBe(A);
    expect(reviewOf([owner(`reviewed ${A}`, "COLLABORATOR")])).toBe(A);
    // Refused forms: trailing text on the line, a sha on a later line, a short sha, other wording.
    for (const body of [
      `reviewed ${A}: do-not-merge, fix B1 first`,
      `reviewed ${A} (round 2)`,
      `notes\nreviewed ${A}`,
      `reviewed ${A.slice(0, 39)}`,
      `Reviewed ${A}`,
      ` reviewed ${A}`,
      `I reviewed ${A}`,
    ])
      expect(reviewOf([owner(body)]), body).toBeNull();
    // Only the owner and collaborators (a user-owned repository has no members).
    for (const who of ["MEMBER", "CONTRIBUTOR", "NONE"]) expect(reviewOf([owner(`reviewed ${A}`, who)])).toBeNull();
    // The newest approval wins: a later one for another SHA unpins the earlier.
    const later = [
      owner(`reviewed ${A}`, "OWNER", "2026-11-15T01:00:00Z"),
      owner(`reviewed ${B}`, "OWNER", "2026-11-15T02:00:00Z"),
    ];
    expect(reviewOf(later)).toBe(B);
    expect(approvedAt(later, A)).toBe(false);
    expect(reviewOf([...later].reverse())).toBe(B);
    // A later comment that is no approval does not unpin.
    expect(reviewOf([owner(`reviewed ${A}`), owner("needs fixes: see above")])).toBe(A);
  });

  it("takes the newest pull_request run of the PR's own branch on that SHA, that names the PR", () => {
    const got = latestCiRun(
      runs(
        ciRun({ id: 3 }),
        ciRun({ id: 9, head_branch: "other" }),
        ciRun({ id: 8, event: "push" }),
        ciRun({ id: 5, conclusion: "failure" }),
        ciRun({ id: 11, head_repository: { full_name: "fork/r" } }),
        ciRun({ id: 12, pull_requests: [{ number: 8, base: { ref: "main" } }] }),
        ciRun({ id: 13, pull_requests: [{ number: 7, base: { ref: "dev" } }] }),
        ciRun({ id: 14, pull_requests: [] }),
      ),
      { sha: A, branch: "feat/x", repo: REPO, pr: 7 },
    );
    expect(got.id).toBe(5);
    expect(latestCiRun(null, { sha: A, branch: "feat/x", repo: REPO, pr: 7 })).toBeNull();
  });

  it("a run that failed only on Benchmark passes, said plainly; any other failure does not", () => {
    expect(judgeRun(ciRun(), null, "x")).toEqual({ ok: true, note: null });
    const bench = judgeRun(
      ciRun({ conclusion: "failure" }),
      jobs(["Node 22", "success"], ["Node 18 tests 1/3", "skipped"], [BENCH, "failure"]),
      "x",
    );
    expect(bench.ok).toBe(true);
    expect(bench.note).toContain(`only because ${BENCH} failed`);
    expect(bench.note).toContain("main's push run will run in full");
    expect(
      judgeRun(ciRun({ conclusion: "failure" }), jobs(["Node 22", "failure"], [BENCH, "failure"]), "x").failed,
    ).toContain("failed: Node 22, Benchmark");
    expect(judgeRun(ciRun({ conclusion: "failure" }), null, "x").failed).toContain("could not be read");
    expect(
      judgeRun(
        ciRun({ conclusion: "failure" }),
        { total_count: 9, jobs: [{ name: BENCH, status: "completed", conclusion: "failure" }] },
        "x",
      ).failed,
    ).toContain("not on one page");
    expect(judgeRun(ciRun({ conclusion: "cancelled" }), null, "x").failed).toContain("concluded cancelled");
    expect(judgeRun(ciRun({ status: "queued", conclusion: null }), null, "x").pending).toContain("is queued");
    expect(judgeRun(null, null, "x").pending).toContain("no CI run yet");
  });

  it("boards a reviewed, green PR at its head; a low-tier PR needs no review comment", () => {
    expect(memberVerdict({ pr: openPr(), repo: REPO, tier: "medium", run: ciRun(), jobs: null })).toEqual({
      ok: true,
      pinned: A,
      reasons: [],
      note: null,
    });
    expect(
      memberVerdict({ pr: openPr({ comments: [] }), repo: REPO, tier: "low", run: ciRun(), jobs: null }).pinned,
    ).toBe(A);
    const bench = memberVerdict({
      pr: openPr(),
      repo: REPO,
      tier: "medium",
      run: ciRun({ conclusion: "failure" }),
      jobs: jobs([BENCH, "failure"]),
    });
    expect(bench.ok).toBe(true);
    expect(bench.note).toContain("only because");
  });

  it("refuses every precondition by name", () => {
    const why = (over: Record<string, unknown>, tier = "medium", run: unknown = ciRun()) =>
      memberVerdict({ pr: openPr(over), repo: REPO, tier, run, jobs: null }).reasons.join("; ");
    expect(why({ state: "CLOSED" })).toContain("not open (CLOSED)");
    expect(why({ state: "MERGED" })).toContain("not open (MERGED)");
    expect(why({ isDraft: true })).toContain("a draft");
    expect(why({ baseRefName: "release" })).toContain("targets release, not main");
    expect(why({ isCrossRepository: true })).toContain("a fork PR");
    expect(why({ headRepositoryOwner: { login: "someone" } })).toContain("a fork PR");
    expect(why({ headRefName: "train/20261105-030409" })).toContain("a train PR");
    // A review of an older head does not pin the new one (law 1).
    expect(why({ comments: [owner(`reviewed ${B}`)] }, "high")).toContain(`newest approval is not \`reviewed ${A}\``);
    expect(why({ comments: [owner(`reviewed ${A}: do-not-merge`)] })).toContain("newest approval is not");
    expect(why({ comments: [owner(`reviewed ${A}`, "CONTRIBUTOR")] })).toContain("newest approval is not");
    expect(why({}, "medium", ciRun({ status: "in_progress", conclusion: null }))).toContain("is in_progress");
    expect(why({}, "medium", ciRun({ conclusion: "failure" }))).toContain("concluded failure");
    expect(why({}, "medium", null)).toContain("no CI run yet");
    expect(why({}, null as unknown as string)).toContain("risk tier could not be read");
    expect(
      memberVerdict({ pr: openPr({ isDraft: true }), repo: REPO, tier: "low", run: ciRun(), jobs: null }).pinned,
    ).toBeNull();
  });

  it("a train head is fresh: never the base, never a member's head", () => {
    const members = [
      { number: 1, pinned: A },
      { number: 2, pinned: C },
    ];
    expect(headIsFresh({ head: H, base: B, members })).toBeNull();
    expect(headIsFresh({ head: B, base: B, members })).toContain("is the base");
    expect(headIsFresh({ head: C, base: B, members })).toContain("also member #2's head");
  });

  it("law 3 is waived for low-tier members only, or one member whose tree is the train head's", () => {
    const med = { number: 1, tier: "medium" };
    expect(law3({ members: [med], headTree: A, memberTree: A }).required).toBe(false);
    expect(law3({ members: [med], headTree: A, memberTree: B }).required).toBe(true);
    expect(law3({ members: [med], headTree: null, memberTree: null }).required).toBe(true);
    expect(law3({ members: [med, { number: 2, tier: "low" }], headTree: A, memberTree: A }).required).toBe(true);
    const lows = [
      { number: 1, tier: "low" },
      { number: 2, tier: "low" },
    ];
    expect(law3({ members: lows, headTree: A, memberTree: null })).toEqual({
      required: false,
      why: "every member is low tier",
    });
    expect(
      law3({
        members: [
          { number: 1, tier: "low" },
          { number: 2, tier: "high" },
        ],
        headTree: A,
        memberTree: null,
      }).required,
    ).toBe(true);
  });

  it("a dropped PR names what it conflicted with, and the remedy follows", () => {
    expect(conflictedWith(["src/a.ts"], ["src/m.ts"], [{ number: 1, files: ["src/a.ts"] }])).toEqual([1]);
    expect(conflictedWith(["src/a.ts"], ["src/a.ts"], [{ number: 1, files: ["src/b.ts"] }])).toEqual(["main"]);
    expect(conflictedWith(["src/a.ts"], ["src/a.ts"], [{ number: 1, files: ["src/a.ts"] }])).toEqual(["main", 1]);
    expect(conflictedWith(["x"], [], [])).toEqual(["main"]);
    expect(dropRemedy(["main"])).toBe("`npm run sync:main -- --push` and a new review");
    expect(dropRemedy([1, 4])).toBe("land after #1, #4, then `npm run sync:main -- --push` and a new review");
  });

  const rec = {
    v: 1,
    repo: REPO,
    branch: "train/20261105-030409",
    base: B,
    head: H,
    exempt: false,
    stray: [],
    members: [
      { number: 1, branch: "feat/a", pinned: A, tier: "medium", title: "feat: a <!-- train-record:end --> & more" },
      { number: 2, branch: "docs/b", pinned: C, tier: "low", title: "docs: b" },
    ],
    dropped: [{ number: 3, reason: "hand conflicts with the train", files: ["src/a.ts"], with: [1] }],
  };

  it("the record round-trips through the body, whatever a title or the focus holds, CRLF included", () => {
    const law = { required: true, why: "2 members merged together" };
    const focusText = "#1 feat: a <!-- train-record:begin --> <!-- train-record:end -->\n  head: x";
    const { body, cut } = renderBody({ rec, law, focusText });
    expect(cut).toBe(false);
    expect(parseRecord(body)).toEqual(rec);
    expect(parseRecord(body.replace(/\n/g, "\r\n"))).toEqual(rec);
    // The record comes first, before the human list and the focus.
    expect(body.indexOf("<!-- train-record:begin -->")).toBeLessThan(body.indexOf("Members, in merge order"));
    expect(body).toContain("&lt;!-- train-record:begin --&gt;");
    expect(body).toContain(`reviewed ${H}`);
    expect(body).toContain("#3 hand conflicts with the train: `src/a.ts` (conflicts with #1); needs: land after #1");
    expect(parseRecord(`text\n${renderRecord(rec)}\nmore`)).toEqual(rec);
    expect(parseRecord(renderRecord({ ...rec, stray: undefined })).stray).toEqual([]);
    expect(trainTitle(rec.members)).toBe("train: #1 #2");
  });

  it("a long focus is cut in the body, the record kept whole", () => {
    const focusText = "x".repeat(50);
    const { body, cut } = renderBody({ rec, law: { required: true, why: "w" }, focusText, cap: 10 });
    expect(cut).toBe(true);
    expect(body).toContain("xxxxxxxxxx\n… (cut here; the full focus is in a comment below)");
    expect(body).not.toContain("x".repeat(11));
    expect(parseRecord(body)).toEqual(rec);
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
    expect(bad({ members: [{ ...rec.members[0], branch: "refs/heads/main" }] })).toThrow(/branch/);
    expect(bad({ members: [rec.members[0], rec.members[0]] })).toThrow(/twice/);
    expect(bad({ members: [{ ...rec.members[0], pinned: "x" }] })).toThrow(/pinned/);
    expect(bad({ dropped: [{ ...rec.dropped[0], with: ["elsewhere"] }] })).toThrow(/dropped/);
    expect(bad({ stray: "x" })).toThrow(/stray/);
    expect(bad({ v: 2 })).toThrow(/version/);
  });

  const memberView = (pinned: string, branch: string, over: Record<string, unknown> = {}) => ({
    ...openPr({ headRefOid: pinned, headRefName: branch, comments: [owner(`reviewed ${pinned}`)] }),
    ...over,
  });
  /** Facts that land: every refusal below changes one of them. */
  const facts = () => ({
    rec: rec as typeof rec,
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
      1: memberView(A, "feat/a"),
      2: memberView(C, "docs/b", { comments: [] }),
    } as Record<number, Record<string, unknown>>,
    derived: { 1: { tier: "medium", contained: true }, 2: { tier: "low", contained: true } } as Record<
      number,
      { tier: string | null; contained: boolean }
    >,
    ciRun: ciRun({ head_sha: H, head_branch: rec.branch }),
    jobs: null as unknown,
    checks: {
      total_count: 3,
      check_runs: [
        { name: "Node 22", status: "completed", conclusion: "success" },
        { name: "Node 18 tests 1/3", status: "completed", conclusion: "skipped" },
        { name: BENCH, status: "completed", conclusion: "failure" },
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
    expect(v).toMatchObject({ ok: true, refusals: [], pending: [], notes: [] });
    expect(v.law.required).toBe(true);
  });

  it("refuses to land on each broken fact of the train, by name", () => {
    expect(msgs(refusedBy((f) => (f.train.state = "CLOSED")))).toContain("the train PR is CLOSED");
    expect(msgs(refusedBy((f) => (f.train.isCrossRepository = true)))).toContain("from a fork");
    expect(msgs(refusedBy((f) => (f.train.headRefName = "train/20261105-030410")))).toContain("branch is");
    expect(msgs(refusedBy((f) => (f.train.baseRefName = "dev")))).toContain("targets dev");
    expect(msgs(refusedBy((f) => (f.train.headRefOid = M)))).toContain("abandon and rebuild");
    expect(msgs(refusedBy((f) => (f.mainSha = M)))).toContain("main is at");
    expect(msgs(refusedBy((f) => (f.train.mergeStateStatus = "BEHIND")))).toContain("BEHIND: rebuild");
    expect(msgs(refusedBy((f) => (f.train.mergeStateStatus = "DIRTY")))).toContain("DIRTY: rebuild");
    expect(msgs(refusedBy((f) => (f.train.mergeStateStatus = "BLOCKED")))).toContain("mergeStateStatus is BLOCKED");
    // A hand-built train whose head is a member's head: the check names would read that PR's run.
    const shared = refusedBy((f) => {
      f.rec = { ...rec, head: A };
      f.train.headRefOid = A;
      f.train.comments = [owner(`reviewed ${A}`)];
      f.ciRun = ciRun({ head_sha: A, head_branch: rec.branch });
    });
    expect(msgs(shared)).toBe(
      `the train head ${A} is also member #1's head: it must be a fresh merge commit; abandon and rebuild`,
    );
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

  it("re-derives each member instead of trusting the record", () => {
    expect(msgs(refusedBy((f) => (f.members[1] = { state: "MERGED" })))).toContain("member #1 is MERGED");
    expect(msgs(refusedBy((f) => delete f.members[2]))).toContain("member #2 is undefined");
    expect(msgs(refusedBy((f) => (f.members[1] = memberView(M, "feat/a"))))).toContain(`not its pinned ${A}`);
    expect(msgs(refusedBy((f) => (f.members[1] = memberView(A, "feat/other"))))).toContain(
      "branch is feat/other, not the recorded feat/a",
    );
    expect(msgs(refusedBy((f) => (f.members[1] = memberView(A, "feat/a", { isDraft: true }))))).toContain(
      "member #1 is a draft",
    );
    expect(msgs(refusedBy((f) => (f.members[1] = memberView(A, "feat/a", { baseRefName: "dev" }))))).toContain(
      "targets dev",
    );
    expect(msgs(refusedBy((f) => (f.members[1] = memberView(A, "feat/a", { isCrossRepository: true }))))).toContain(
      "a fork PR",
    );
    expect(msgs(refusedBy((f) => (f.members[1] = memberView(A, "feat/a", { comments: [] }))))).toContain("(law 1)");
    expect(
      msgs(
        refusedBy(
          (f) =>
            (f.members[1] = memberView(A, "feat/a", { comments: [owner(`reviewed ${A}`), owner(`reviewed ${M}`)] })),
        ),
      ),
    ).toContain("(law 1)");
    // The record says low; recomputed it is medium: refused, and its missing review is not waived.
    expect(msgs(refusedBy((f) => (f.derived[2] = { tier: "medium", contained: true })))).toContain(
      "tier medium now, not the recorded low",
    );
    expect(msgs(refusedBy((f) => (f.derived[1] = { tier: null, contained: true })))).toContain(
      "could not be recomputed",
    );
    expect(msgs(refusedBy((f) => (f.derived[1] = { tier: "medium", contained: false })))).toContain(
      `pinned ${A} is not in the train head`,
    );
  });

  it("law 3: refused without the train head's approval, unless low-tier only or one member's tree", () => {
    const v = refusedBy((f) => (f.train.comments = [owner(`reviewed ${A}`)]));
    expect(v.refusals).toEqual([expect.objectContaining({ kind: "review" })]);
    const trailing = refusedBy((f) => (f.train.comments = [owner(`reviewed ${H} but wait for B1`)]));
    expect(trailing.refusals).toEqual([expect.objectContaining({ kind: "review" })]);
    const one = refusedBy((f) => {
      f.rec = { ...rec, members: rec.members.slice(0, 1) };
      f.train.comments = [];
      f.headTree = M;
      f.memberTree = M;
    });
    expect(one.ok).toBe(true);
    const differs = refusedBy((f) => {
      f.rec = { ...rec, members: rec.members.slice(0, 1) };
      f.train.comments = [];
      f.headTree = M;
      f.memberTree = A;
    });
    expect(msgs(differs)).toContain("law 3");
    const lowOnly = refusedBy((f) => {
      f.rec = { ...rec, members: [{ ...rec.members[0], tier: "low" }, rec.members[1]] } as typeof rec;
      f.derived[1] = { tier: "low", contained: true };
      f.train.comments = [];
    });
    expect(lowOnly.ok).toBe(true);
    expect(lowOnly.law.why).toBe("every member is low tier");
  });

  it("a Benchmark-only failure lands, with the note; CI still running is pending, never green", () => {
    const bench = refusedBy((f) => {
      f.ciRun = ciRun({ head_sha: H, head_branch: rec.branch, conclusion: "failure" });
      f.jobs = jobs(["Node 22", "success"], ["Windows tests 1/3", "success"], [BENCH, "failure"]);
    });
    expect(bench.ok).toBe(true);
    expect(bench.notes.join("\n")).toContain("main's push run will run in full");
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

  it("an UNKNOWN merge state is pending, re-read briefly even without --wait", () => {
    const unknown = refusedBy((f) => (f.train.mergeStateStatus = "UNKNOWN"));
    expect(unknown.ok).toBe(false);
    expect(unknown.refusals).toEqual([]);
    expect(unknown.pending).toEqual(["mergeStateStatus is UNKNOWN (GitHub is computing it)"]);
    expect(onlyUnknown(unknown)).toBe(true);
    expect(keepWaiting(unknown)).toBe(true);
    const alsoQueued = refusedBy((f) => {
      f.train.mergeStateStatus = "UNKNOWN";
      f.ciRun = ciRun({ head_sha: H, status: "queued", conclusion: null });
    });
    expect(onlyUnknown(alsoQueued)).toBe(false);
  });

  it("cleanup: nothing unless merged; a branch goes only when MERGED, at the pin, no PR's base or head", () => {
    const m = (over: Record<string, unknown>) => ({
      number: 1,
      state: "MERGED",
      pinned: A,
      remoteTip: A,
      dependents: [],
      heads: [],
      commented: false,
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
        m({ number: 6, heads: [8] }),
        m({ number: 7, commented: true }),
      ],
    });
    expect(plan.map((p: { deleteBranch: boolean; comment: boolean }) => [p.deleteBranch, p.comment])).toEqual([
      [true, true],
      [false, false],
      [false, true],
      [false, true],
      [false, true],
      [false, true],
      [true, false],
    ]);
    expect(plan[1].note).toContain("untouched");
    expect(plan[3].note).toContain(`moved to ${B}`);
    expect(plan[4].note).toContain("base of open PR #9");
    expect(plan[5].note).toContain("head of open PR #8");
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

/** The shapes of every `gh` call the script may make; anything else fails the test that made it. */
const GH_SHAPES: RegExp[] = [
  /^repo view --json nameWithOwner$/,
  /^pr view \d+ --json [\w,]+$/,
  /^api repos\/o\/r\/actions\/workflows\/ci\.yml\/runs\?(branch=main&event=push&per_page=1|head_sha=[0-9a-f]{40}&event=pull_request&per_page=100)$/,
  /^api repos\/o\/r\/actions\/runs\/\d+\/jobs\?filter=latest&per_page=100$/,
  /^api repos\/o\/r\/commits\/[0-9a-f]{40}\/check-runs\?per_page=100$/,
  /^api repos\/o\/r\/git\/commits\/[0-9a-f]{40}$/,
  /^pr create --base main --head train\/\d{8}-\d{6} --title train:( #\d+)+ --body-file \S+$/,
  /^pr comment \d+ --body landed by train #\d+ \([0-9a-f]{40}\)$/,
  /^pr comment \d+ --body-file \S+$/,
  /^pr list --(base|head) \S+ --state open --json number$/,
  /^pr merge \d+ --merge --match-head-commit [0-9a-f]{40}$/,
  /^pr close \d+ --comment .+$/,
];

/** A fake `gh` over the PR table: every call recorded, the merge scripted. */
function fakeGh(r: ReturnType<typeof setup>, script: { merge?: () => { status: number; stderr?: string } } = {}) {
  const calls: string[][] = [];
  const ok = (v: unknown) => ({ status: 0, stdout: typeof v === "string" ? v : JSON.stringify(v), stderr: "" });
  const prOf = (s: string) => Object.values(r.prs).find((p) => p.headRefOid === s);
  const gh = (args: string[]) => {
    calls.push(args);
    const [a, b] = args;
    if (a === "repo") return ok({ nameWithOwner: REPO });
    if (a === "api") {
      const path = args[1] ?? "";
      const head = /head_sha=([0-9a-f]{40})/.exec(path)?.[1];
      if (path.includes("branch=main&event=push"))
        return ok({ workflow_runs: [{ id: 1, head_sha: A, status: "completed", conclusion: "success" }] });
      if (head) {
        const p = prOf(head);
        return ok(
          runs(
            ciRun({
              id: 20,
              head_sha: head,
              head_branch: p?.headRefName,
              pull_requests: [{ number: p?.number, base: { ref: "main" } }],
            }),
          ),
        );
      }
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
    if (a === "pr" && b === "comment") {
      const p = r.prs[Number(args[2])] as Pr;
      const i = args.indexOf("--body");
      if (i >= 0) (p.comments as unknown[]).push(owner(args[i + 1] as string));
      return ok("");
    }
    if (a === "pr" && b === "list") return ok([]);
    if (a === "pr" && b === "close") {
      (r.prs[Number(args[2])] as Pr).state = "CLOSED";
      return ok("");
    }
    return { status: 1, stdout: "", stderr: `fake gh: unexpected ${args.join(" ")}` };
  };
  /** Every call matched a known shape (a new kind of call must be added here, and reviewed). */
  const shapesOk = () => calls.filter((c) => !GH_SHAPES.some((s) => s.test(c.join(" "))));
  return { gh, calls, shapesOk };
}

const NOW = () => new Date(Date.UTC(2026, 10, 15, 1, 2, 3));
const BRANCH = "train/20261115-010203";

// About 150 git processes: a few seconds on Linux, more on Windows (the main-only Windows leg runs it).
describe("the train on a throwaway repository", { timeout: 90_000 }, () => {
  it("builds (a scripted conflict boards, a hand conflict drops), refuses a failed merge's cleanup, lands, resumes", () => {
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
    // #3 conflicts with member #1, not with main: it waits for #1.
    expect(j.dropped).toEqual([
      {
        number: 3,
        reason: "hand conflicts with the train",
        files: ["src/a.ts"],
        with: [1],
        needs: "land after #1, then `npm run sync:main -- --push` and a new review",
      },
    ]);
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
    expect(record).toMatchObject({ branch: BRANCH, base, head: j.head, stray: [] });
    expect(record.dropped).toEqual([
      { number: 3, reason: "hand conflicts with the train", files: ["src/a.ts"], with: [1] },
    ]);
    const wt = join(r.work, ".claude", "worktrees", "train-20261115-010203");
    expect(existsSync(wt)).toBe(true);

    // Land, with the merge failing: refused cleanup, everything still in place.
    (r.prs[99] as Pr).comments = [owner(`reviewed ${j.head}`)];
    const failing = fakeGh(r, { merge: () => ({ status: 1, stderr: "Head branch was modified" }) });
    expect(runMain(["--land", "99"], failing.gh)).toBe(1);
    expect(lines.err.join("\n")).toContain("nothing was cleaned up");
    // No FT1 script in this repository: the proof is "unknown", printed, and not a refusal.
    expect(lines.err.join("\n")).toContain("proves: unknown (scripts/ci-proven.mjs is not in this checkout");
    expect(failing.calls.filter((c) => c[1] === "comment" || c[1] === "list")).toEqual([]);
    for (const b of ["feat/a", "feat/b", "feat/d", BRANCH])
      expect(r.git(r.origin, "rev-parse", `refs/heads/${b}`)).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(wt)).toBe(true);
    expect(failing.calls.find((c) => c[1] === "merge")).toEqual([
      "pr",
      "merge",
      "99",
      "--merge",
      "--match-head-commit",
      j.head,
    ]);

    // A BLOCKED merge state with CI green: `--wait` re-reads it (bounded, BLOCKED_POLL) before refusing;
    // without `--wait` it refuses at once. The merge itself still fails here, so nothing lands for real.
    const blockedThen = (states: string[]) => {
      const inner = fakeGh(r, { merge: () => ({ status: 1, stderr: "Head branch was modified" }) });
      let views = 0;
      const gh = (a: string[]) => {
        if (a[0] === "pr" && a[1] === "view" && a[2] === "99")
          (r.prs[99] as Pr).mergeStateStatus = states[Math.min(views++, states.length - 1)] as string;
        return inner.gh(a);
      };
      return { gh, calls: inner.calls };
    };
    const blockedMsg = "the train PR's mergeStateStatus is BLOCKED";
    let sleeps: number[] = [];
    const sleep = (ms: number) => void sleeps.push(ms);
    const lagging = blockedThen(["BLOCKED", "BLOCKED", "CLEAN"]);
    expect(runMain(["--land", "99", "--wait"], lagging.gh, { sleep })).toBe(1);
    expect(sleeps).toEqual([10_000, 10_000]);
    expect(lagging.calls.filter((c) => c[1] === "merge")).toHaveLength(1);
    sleeps = [];
    const stuck = blockedThen(["BLOCKED"]);
    expect(runMain(["--land", "99", "--wait"], stuck.gh, { sleep })).toBe(2);
    expect(sleeps).toEqual(Array(6).fill(10_000));
    expect(lines.err.join("\n")).toContain(blockedMsg);
    expect(stuck.calls.filter((c) => c[1] === "merge")).toEqual([]);
    sleeps = [];
    const noWait = blockedThen(["BLOCKED", "CLEAN"]);
    expect(runMain(["--land", "99"], noWait.gh, { sleep })).toBe(2);
    expect(sleeps).toEqual([]);
    expect(lines.err.join("\n")).toContain(blockedMsg);
    expect(noWait.calls.filter((c) => c[1] === "merge")).toEqual([]);
    (r.prs[99] as Pr).mergeStateStatus = "CLEAN";

    // Land for real: GitHub's merge (simulated on origin), #1 and #2 marked merged, #4 not; a file nobody
    // expected in the train's worktree keeps it in place.
    writeFileSync(join(wt, "unexpected.txt"), "an agent's edit\n");
    const landing = fakeGh(r, {
      merge: () => {
        r.git(r.origin, "merge", "-q", "--no-ff", "-m", `Merge pull request #99 from o/${BRANCH}`, j.head);
        Object.assign(r.prs[99] as Pr, { state: "MERGED", mergeCommit: { oid: r.git(r.origin, "rev-parse", "HEAD") } });
        (r.prs[1] as Pr).state = "MERGED";
        (r.prs[2] as Pr).state = "MERGED";
        return { status: 0 };
      },
    });
    const proofCalls: unknown[][] = [];
    const proof = (...a: unknown[]) => {
      proofCalls.push(a);
      return { status: 1, stdout: "proves: no (a job was skipped)\n", stderr: "" };
    };
    expect(runMain(["--land", "99", "--json"], landing.gh, { proof })).toBe(1);
    const landed = JSON.parse(lines.out.join("\n"));
    const mergeSha = r.git(r.origin, "rev-parse", "main");
    // The train's own run (id 20 in the fake) is the one asked about; a "no" still lands.
    expect(proofCalls).toEqual([[20, REPO]]);
    expect(landed).toMatchObject({ trainPr: 99, merged: true, mergeSha, proof: "proves: no (a job was skipped)" });
    expect(r.git(r.origin, "rev-parse", "main^1")).toBe(base);
    expect(r.git(r.origin, "rev-parse", "main^2")).toBe(j.head);
    const rows = (x: { members: { number: number; branchDeleted: boolean; commented: boolean }[] }) =>
      x.members.map((m) => [m.number, m.branchDeleted, m.commented]);
    expect(rows(landed)).toEqual([
      [1, true, true],
      [2, true, true],
      [4, false, false],
    ]);
    expect(lines.err.join("\n")).toContain("MEMBER #4 IS NOT MARKED MERGED");
    expect(lines.err.join("\n")).toContain("unexpected.txt");
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").sort()).toEqual([
      "feat/c",
      "feat/d",
      "main",
    ]);
    expect(landing.calls.filter((c) => c[1] === "comment").map((c) => [c[2], c[4]])).toEqual([
      ["1", `landed by train #99 (${mergeSha})`],
      ["2", `landed by train #99 (${mergeSha})`],
    ]);
    expect(existsSync(wt)).toBe(true);

    // Resume: the train reads MERGED at the recorded head; the cleanup runs again, idempotently.
    unlinkSync(join(wt, "unexpected.txt"));
    (r.prs[4] as Pr).state = "MERGED";
    const resuming = fakeGh(r);
    expect(runMain(["--land", "99", "--json"], resuming.gh)).toBe(0);
    expect(lines.err.join("\n")).toContain("resuming the cleanup");
    expect(rows(JSON.parse(lines.out.join("\n")))).toEqual([
      [1, false, false],
      [2, false, false],
      [4, true, true],
    ]);
    expect(resuming.calls.filter((c) => c[1] === "merge")).toEqual([]);
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").sort()).toEqual([
      "feat/c",
      "main",
    ]);
    expect(existsSync(wt)).toBe(false);
    expect(r.git(r.work, "branch", "--list", BRANCH)).toBe("");
    for (const f of [fake, failing, landing, resuming]) expect(f.shapesOk()).toEqual([]);
  });

  it("one up-to-date member still gets its own merge commit: a fresh head, law 3 waived by tree", () => {
    const r = setup();
    r.pr(1, "feat/a", { "src/a.ts": "export const a = 2;\n" });
    const out: string[] = [];
    const err: string[] = [];
    const fake = fakeGh(r);
    const code = main(["1", "--dry-run", "--json"], {
      cwd: r.work,
      out: (l: string) => out.push(l),
      err: (l: string) => err.push(l),
      gh: fake.gh,
      now: NOW,
      runGen: () => true,
    });
    expect(code, err.join("\n")).toBe(0);
    const j = JSON.parse(out.join("\n"));
    const pinned = r.prs[1]?.headRefOid;
    expect(j.head).not.toBe(pinned);
    expect(j.law3).toMatchObject({ required: false, why: "one member, and the train tree is its reviewed tree" });
    expect(r.git(r.work, "rev-parse", `${j.head}^{tree}`)).toBe(r.git(r.work, "rev-parse", `${pinned}^{tree}`));
    expect(r.git(r.work, "rev-parse", `${j.head}^2`)).toBe(pinned);
    // --dry-run pushed nothing and left no worktree.
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads/train")).toBe("");
    expect(existsSync(join(r.work, ".claude", "worktrees", "train-20261115-010203"))).toBe(false);
    expect(fake.shapesOk()).toEqual([]);
  });

  it("refuses to build when a member is not ready, and creates nothing", () => {
    const r = setup();
    r.pr(1, "feat/a", { "src/a.ts": "export const a = 2;\n" });
    r.pr(2, "feat/b", { "src/b.ts": "export const b = 2;\n" });
    (r.prs[2] as Pr).comments = [owner(`reviewed ${r.prs[2]?.headRefOid}: do-not-merge, see B1`)];
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
    expect(err.join("\n")).toContain("#2: its newest approval is not `reviewed");
    expect(existsSync(join(r.work, ".claude", "worktrees"))).toBe(false);
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads/train")).toBe("");
  });

  it("abandons: closes the train PR, deletes its branch only at the recorded head, leaves the members", () => {
    const r = setup();
    r.pr(1, "feat/a", { "src/a.ts": "export const a = 2;\n" });
    const head = r.prs[1]?.headRefOid as string;
    r.git(r.work, "push", "-q", "origin", `feat/a:refs/heads/${BRANCH}`);
    const recordFor = (h: string) =>
      renderRecord({
        ...{ v: 1, repo: REPO, branch: BRANCH, base: B, head: h, exempt: false, stray: [] },
        members: [{ number: 1, branch: "feat/a", pinned: A, tier: "low", title: "t" }],
        dropped: [],
      });
    const trainPr = (h: string) => ({
      number: 99,
      state: "OPEN",
      headRefName: BRANCH,
      headRefOid: head,
      isCrossRepository: false,
      body: recordFor(h),
    });
    const quiet = { out: () => {}, err: () => {} };
    // The branch is not at the recorded head: closed, the branch left, exit 1.
    r.prs[99] = trainPr(M);
    const moved = fakeGh(r);
    expect(main(["--abandon", "99"], { cwd: r.work, ...quiet, gh: moved.gh })).toBe(1);
    expect(r.prs[99]?.state).toBe("CLOSED");
    expect(r.git(r.origin, "rev-parse", `refs/heads/${BRANCH}`)).toBe(head);
    // At the recorded head: deleted.
    r.prs[99] = trainPr(head);
    const fake = fakeGh(r);
    expect(main(["--abandon", "99"], { cwd: r.work, ...quiet, gh: fake.gh })).toBe(0);
    expect(r.git(r.origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").sort()).toEqual([
      "feat/a",
      "main",
    ]);
    expect(fake.calls.filter((c) => c[1] === "close")).toHaveLength(1);
    // A non-train PR is refused.
    expect(main(["--abandon", "1"], { cwd: r.work, ...quiet, gh: fake.gh })).toBe(2);
    for (const f of [moved, fake]) expect(f.shapesOk()).toEqual([]);
  });
});
