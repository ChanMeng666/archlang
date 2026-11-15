#!/usr/bin/env node
/**
 * `npm run train` — land several reviewed PRs with ONE full CI run.
 *
 * Why: `main`'s required checks are strict, so PRs merge one at a time, each synced with `main`, each sync
 * re-running CI and re-read by the red team, then `main` runs the full suite again
 * (`docs/plans/ci-throughput-research.md`). GitHub's merge queue needs an organization-owned repo. A train
 * cuts `train/<UTC stamp>` from `origin/main`'s tip, merges each member PR's reviewed head into it and opens
 * one ordinary PR against `main` (the train PR). CI runs every leg on a `train/` PR, and the push run for
 * the train's merge commit skips its work when that PR run proved the identical tree (`scripts/ci-proven.mjs`).
 *
 *   npm run train -- <pr> [<pr>…] [--dry-run] [--json]     build (in the order given)
 *   npm run train -- --land <train pr> [--wait] [--json]   verify, merge, clean up
 *   npm run train -- --abandon <train pr> [--json]         close it; the members are untouched
 *
 * The three laws of `docs/plans/ci-throughput.md` § 2, as a train keeps them:
 *   1. A member boards at its pinned SHA: its head, named by a `reviewed <full sha>` comment from the
 *      owner, a member or a collaborator ({@link reviewedShas}); a low-tier PR (`classify()` of
 *      `scripts/risk-tier.mjs` over what it changed since its merge base with `main`) needs none. The train
 *      merges exactly that SHA; at landing each member's head must still be it, and the train PR merges
 *      with `--match-head-commit <train head>`.
 *   2. Each member's own CI run on its pinned SHA, and at landing the train PR's run on the train head,
 *      must be `completed` and `success`: the workflow RUN, keyed on the head SHA, then every check-run on
 *      that SHA read row by row (an empty list is "not yet", never "green").
 *   3. The train head is a merged head: landing needs a `reviewed <train head>` comment on the train PR,
 *      except for a one-member train whose tree is that member's reviewed tree ({@link law3}). The build
 *      prints each member's re-review focus: the `sync:main` focus with "the other side" = everything else
 *      in the train (main since the member's merge base, plus the other members).
 *
 * Build: each PR must be open, target `main`, come from this repository, not be a draft or a `train/` PR,
 * have a pinned SHA and a green CI run on it; any refusal stops the build before anything is created
 * (exit 2). Then a worktree at `.claude/worktrees/train-<stamp>` (next to the agents' worktrees in the
 * primary checkout, with a `node_modules` junction to the primary's), and per member
 * `git merge --no-ff --no-commit <pinned>`, conflicts resolved by `sync:main`'s rules with the sides
 * reversed ({@link resolveUnmerged} with `keep` 2: ours is the train, main plus the earlier members). A
 * hand conflict, or CHANGELOG lines the merge leaves outside `[Unreleased]`, aborts that merge and DROPS
 * the member (it needs an ordinary `sync:main` and a new review); the build goes on with the rest. The merge
 * message is GitHub's: `Merge pull request #<n> from <owner>/<branch>`, a blank line, the PR title.
 *
 * Generated artifacts, the invariant: the train TIP equals the generators' output. `npm run gen:all` runs
 * once, after the last merge, and what it changes is committed on top (`chore(train): regenerate …`). The
 * member merges in between may hold a textual merge of an artifact (a scripted conflict takes the train's
 * side); none of them is ever a branch tip, CI-tested, deployed or on `main`'s first-parent line. Once
 * per train, not per merge: each `gen:all` costs minutes, and only the tip is checked (`check:drift`).
 * The CHANGELOG verdict (`changelogVerdict` of `scripts/check-changelog-unreleased.mjs`) is taken per
 * merge (to name the member at fault) and again on the tip against the base, as CI's `changelog` job will.
 *
 * The train PR's body holds the record ({@link renderRecord}): base, head, members with their pinned SHAs,
 * dropped PRs with the reason. It is the single source of truth for `--land` and `--abandon`; no local
 * state file. `--dry-run` builds everything, pushes nothing, opens nothing, removes its worktree.
 *
 * The train head is always a fresh commit, never the base or a member's head ({@link headIsFresh}, checked
 * before the push and again at landing): check-runs are matched to a SHA by name, so a head shared with a
 * member PR would show that PR's ordinary run (Node 18, Node 20, Windows green by skipping) as the train's.
 *
 * Land: re-read the record; refuse unless the train PR is open, its head is the recorded (fresh) head,
 * `main` is the recorded base, every member is open at its pinned SHA, law 3 holds, the train's own
 * workflow RUN (`ci.yml`, event `pull_request`, head branch = the train branch, head SHA = the train head,
 * newest run, whose object is its latest attempt) is completed and successful, every check-run on the head
 * passed (read in addition to the run, never instead of it), and `mergeStateStatus` is CLEAN, UNSTABLE or
 * HAS_HOOKS ({@link landVerdict}). `--wait` polls every 30 s, at most 90 minutes, while only CI is pending.
 * Before merging it prints FT1's answer, `node scripts/ci-proven.mjs --run <that run>`
 * (`proves: yes|no|unknown (…)`): information for the coordinator, never a refusal.
 * Then `gh pr merge --merge --match-head-commit <full sha>` (never `--admin`, `--auto`, squash or rebase),
 * then the state is re-read: nothing is cleaned up unless the train PR reads MERGED. GitHub marks each
 * member merged on its own once its head is reachable from `main`; each is polled, bounded. Only a member
 * that reads MERGED, whose remote branch still points at the pinned SHA and is no open PR's base, loses
 * its branch, and each MERGED member gets a `landed by train #<n> (<merge sha>)` comment
 * ({@link cleanupPlan}). Then the train branch and worktree go (the junction is unlinked first).
 *
 * Refusals that hold everywhere ({@link forbidden}, checked before every `git` and `gh` call): no push to
 * `main`, no force push, no `--admin`, `--auto`, `--squash` or `--rebase`.
 * Exit codes: 0 done, 2 stopped for an agent, 1 error. Zero dependencies, plain Node.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { changelogVerdict } from "./check-changelog-unreleased.mjs";
import { classify } from "./risk-tier.mjs";
import {
  ARTIFACTS_JSON,
  artifactSets,
  CHANGELOG,
  changedExports,
  defaultRunGen,
  EXPORT_GLOBS,
  focusFiles,
  focusJson,
  importLinked,
  importReader,
  isRegenerated,
  reportLines,
  resolveUnmerged,
  scriptableSets,
  stageRegenerated,
} from "./sync-main.mjs";

export const TRAIN_PREFIX = "train/";
const MAIN = "main";
const REMOTE = "origin";
const SHA = /^[0-9a-f]{40}$/;
const TRAIN_BRANCH = /^train\/\d{8}-\d{6}$/;
const BEGIN = "<!-- train-record:begin -->";
const END = "<!-- train-record:end -->";
const EXEMPT_LABEL = "changelog-exempt";
/** Who may post a `reviewed <sha>` that counts: GitHub's author association. */
export const REVIEWERS = ["OWNER", "MEMBER", "COLLABORATOR"];
/** Check-runs that never gate (the CI run's own `success` still covers them). */
export const INFORMATIONAL_CHECKS = ["Benchmark (informational)"];
/** A `mergeStateStatus` the train PR may merge from. BEHIND and DIRTY mean `main` moved: rebuild. */
export const MERGEABLE_STATES = ["CLEAN", "UNSTABLE", "HAS_HOOKS"];
export const WAIT = { intervalMs: 30_000, timeoutMs: 90 * 60_000 };
/** GitHub marks indirect merges asynchronously: poll each member this often, this many times. */
export const MEMBER_POLL = { intervalMs: 10_000, attempts: 18 };
export const OTHER_SIDE = "the rest of the train";

// ---- pure cores --------------------------------------------------------------------------------

/** `train/<YYYYMMDD-HHMMSS>` of a Date, in UTC. */
export function trainBranch(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const d = date;
  return `${TRAIN_PREFIX}${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export const isTrainBranch = (name) => typeof name === "string" && TRAIN_BRANCH.test(name);

/**
 * Why a `git` or `gh` invocation is refused, or null. Checked before every call the script makes, so a
 * code path that builds a forbidden command fails loudly instead of running it.
 */
export function forbidden(cmd, args) {
  if (cmd === "git" && args[0] === "push") {
    const mainRef = [MAIN, `refs/heads/${MAIN}`];
    for (const a of args.slice(1)) {
      if (
        a === "-f" ||
        a.startsWith("--force") ||
        a.startsWith("+") ||
        ["--mirror", "--all", "--prune", "--tags"].includes(a)
      )
        return `force or bulk push (${a})`;
      const dst = a.includes(":") ? a.slice(a.lastIndexOf(":") + 1) : a;
      if (mainRef.includes(dst)) return `push naming ${MAIN} (${a})`;
    }
  }
  if (cmd === "gh") {
    for (const a of args) if (["--admin", "--auto", "--squash", "--rebase", "-s", "-r"].includes(a)) return `gh ${a}`;
  }
  return null;
}

/** The SHAs named by `reviewed <full sha>` lines in comments whose author association counts. */
export function reviewedShas(comments) {
  const shas = new Set();
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!REVIEWERS.includes(c?.authorAssociation) || typeof c?.body !== "string") continue;
    for (const line of c.body.replace(/\r\n/g, "\n").split("\n")) {
      const m = /^\s*reviewed ([0-9a-f]{40})(?![0-9a-zA-Z])/.exec(line);
      if (m) shas.add(m[1]);
    }
  }
  return shas;
}

/** The newest `pull_request` run of the workflow for `sha` on `branch` of `repo`, or null. */
export function latestCiRun(runsResponse, { sha, branch, repo }) {
  const runs = Array.isArray(runsResponse?.workflow_runs) ? runsResponse.workflow_runs : [];
  const mine = runs.filter(
    (r) =>
      Number.isInteger(r?.id) &&
      r.head_sha === sha &&
      r.event === "pull_request" &&
      r.head_branch === branch &&
      r.head_repository?.full_name === repo,
  );
  return mine.sort((a, b) => b.id - a.id)[0] ?? null;
}

/** Why a CI run is not a pass, or null: `{ pending }` while it runs, `{ failed }` once it has not passed. */
export function runState(run, what) {
  if (!run) return { pending: `${what}: no CI run yet` };
  if (run.status !== "completed") return { pending: `${what}: CI run ${run.id} is ${run.status}` };
  if (run.conclusion !== "success") return { failed: `${what}: CI run ${run.id} concluded ${run.conclusion}` };
  return null;
}

const ownerRepo = (pr) => `${pr?.headRepositoryOwner?.login ?? ""}/${pr?.headRepository?.name ?? ""}`;

/**
 * Whether a PR may board, from its `gh pr view` JSON, its tier and its CI runs. Returns
 * `{ ok, pinned, reasons }`; `pinned` is the SHA the train merges (law 1).
 */
export function memberVerdict({ pr, repo, tier, runs }) {
  const reasons = [];
  const head = pr?.headRefOid;
  if (pr?.state !== "OPEN") reasons.push(`not open (${pr?.state})`);
  if (pr?.isDraft) reasons.push("a draft");
  if (pr?.baseRefName !== MAIN) reasons.push(`targets ${pr?.baseRefName}, not ${MAIN}`);
  if (pr?.isCrossRepository || ownerRepo(pr).toLowerCase() !== String(repo).toLowerCase())
    reasons.push("a fork PR (a train merges same-repository branches only)");
  if (typeof pr?.headRefName !== "string" || pr.headRefName.startsWith(TRAIN_PREFIX))
    reasons.push("a train PR (its head branch starts `train/`)");
  if (!SHA.test(head ?? "")) reasons.push("no head SHA");
  let pinned = null;
  if (!["low", "medium", "high"].includes(tier)) reasons.push("its risk tier could not be read");
  else if (SHA.test(head ?? "")) {
    if (tier === "low" || reviewedShas(pr.comments).has(head)) pinned = head;
    else reasons.push(`no \`reviewed ${head}\` comment for its head (tier ${tier}; law 1)`);
  }
  if (pinned) {
    const s = runState(latestCiRun(runs, { sha: pinned, branch: pr.headRefName, repo }), "its own CI on the pin");
    if (s) reasons.push(s.pending ?? s.failed);
  }
  return { ok: reasons.length === 0, pinned: reasons.length === 0 ? pinned : null, reasons };
}

/**
 * Why a train head is unfit, or null. It must be a fresh commit: never the base and never a member's head.
 * GitHub matches check-runs to a SHA by name, so a train head that is also a member PR's head shows that
 * PR's ordinary run (Node 18, Node 20 and Windows green by skipping) on the train PR as well.
 */
export function headIsFresh({ head, base, members }) {
  if (head === base) return `the train head ${head} is the base: nothing was merged`;
  const same = members.find((m) => m.pinned === head);
  return same ? `the train head ${head} is also member #${same.number}'s head: it must be a fresh merge commit` : null;
}

/** Law 3: whether landing needs `reviewed <train head>`. Exempt only for one member whose tree is the head's. */
export function law3({ members, headTree, memberTree }) {
  const same = members.length === 1 && SHA.test(headTree ?? "") && headTree === memberTree;
  return same
    ? { required: false, why: "one member, and the train tree is its reviewed tree" }
    : {
        required: true,
        why:
          members.length === 1
            ? "one member, but the train tree differs from its reviewed tree (main moved, or a regeneration)"
            : `${members.length} members merged together: the train head is a new merged head`,
      };
}

const escapeChars = (s, table) => Array.from(String(s), (c) => table[c] ?? c).join("");
/** Prose that cannot open an HTML comment (a record marker) in the body. */
const htmlText = (s) => escapeChars(s, { "<": "&lt;", ">": "&gt;", "&": "&amp;" });
/** JSON whose strings cannot hold a record marker. */
const markerSafeJson = (v) => escapeChars(JSON.stringify(v, null, 2), { "<": "\\u003c", ">": "\\u003e" });

/** The machine-readable block of the train PR's body. */
export function renderRecord(rec) {
  return [BEGIN, "```json", markerSafeJson(rec), "```", END].join("\n");
}

const isInt = (n) => Number.isInteger(n) && n > 0;
const isStrings = (xs) => Array.isArray(xs) && xs.every((x) => typeof x === "string");

/** The record from a train PR's body; throws an Error saying what is wrong. */
export function parseRecord(body) {
  const text = String(body ?? "").replace(/\r\n/g, "\n");
  const i = text.indexOf(BEGIN);
  if (i < 0) throw new Error("no train record in the PR body");
  if (text.indexOf(BEGIN, i + 1) >= 0) throw new Error("more than one train record in the PR body");
  const j = text.indexOf(END, i);
  if (j < 0) throw new Error("the train record is not closed");
  const inner = text.slice(i + BEGIN.length, j).trim();
  if (!inner.startsWith("```json\n") || !inner.endsWith("\n```"))
    throw new Error("the train record is not a json fence");
  let rec;
  try {
    rec = JSON.parse(inner.slice("```json\n".length, -"\n```".length));
  } catch (e) {
    throw new Error(`the train record is not JSON: ${e.message}`);
  }
  const bad = (what) => {
    throw new Error(`the train record is malformed: ${what}`);
  };
  if (rec?.v !== 1) bad("version");
  if (typeof rec.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(rec.repo)) bad("repo");
  if (!isTrainBranch(rec.branch)) bad("branch");
  if (!SHA.test(rec.base ?? "") || !SHA.test(rec.head ?? "")) bad("base or head");
  if (typeof rec.exempt !== "boolean") bad("exempt");
  if (!Array.isArray(rec.members) || rec.members.length === 0) bad("members");
  for (const m of rec.members) {
    if (!isInt(m?.number) || typeof m.branch !== "string" || m.branch === "" || m.branch.startsWith(TRAIN_PREFIX))
      bad("a member's number or branch");
    if (m.branch === MAIN) bad("a member's branch");
    if (!SHA.test(m.pinned ?? "")) bad(`member #${m.number}'s pinned SHA`);
    if (!["low", "medium", "high"].includes(m.tier)) bad(`member #${m.number}'s tier`);
    if (typeof m.title !== "string") bad(`member #${m.number}'s title`);
  }
  if (new Set(rec.members.map((m) => m.number)).size !== rec.members.length) bad("a member listed twice");
  if (!Array.isArray(rec.dropped)) bad("dropped");
  for (const d of rec.dropped)
    if (!isInt(d?.number) || typeof d.reason !== "string" || !isStrings(d.files)) bad("dropped");
  return rec;
}

/** `train: #a #b #c`. */
export const trainTitle = (members) => `train: ${members.map((m) => `#${m.number}`).join(" ")}`;

/** The train PR's body: a human list, the landing steps, the focus, then the record. */
export function renderBody({ rec, law, focusText }) {
  const lines = [
    "Merge train built by `npm run train`: one full CI run lands every member below, each merged at its",
    "pinned (reviewed) head. Land with `npm run train -- --land <this PR> --wait`; never merge it by hand.",
    "",
    "Members, in merge order:",
    ...rec.members.map(
      (m) => `- #${m.number} ${htmlText(m.title)} (\`${m.branch}\`, pinned \`${m.pinned}\`, ${m.tier})`,
    ),
  ];
  if (rec.dropped.length > 0) {
    lines.push("", "Dropped (each needs an ordinary `npm run sync:main` and a new review):");
    for (const d of rec.dropped) {
      const files = d.files.length > 0 ? `: ${d.files.map((f) => `\`${htmlText(f)}\``).join(", ")}` : "";
      lines.push(`- #${d.number} ${htmlText(d.reason)}${files}`);
    }
  }
  lines.push(
    "",
    `Base \`${rec.base}\`, head \`${rec.head}\`.`,
    law.required
      ? `Law 3: ${law.why}; the red team reads this head, then posts \`reviewed ${rec.head}\` here.`
      : `Law 3: ${law.why}; no new review is needed to land.`,
  );
  if (focusText) {
    lines.push("", "<details><summary>Re-review focus</summary>", "", "```text", focusText, "```", "", "</details>");
  }
  lines.push("", renderRecord(rec), "");
  return lines.join("\n");
}

/**
 * Every refusal and every pending item before landing, from what was read. `f` holds `rec`, the train
 * PR's view (`train`), `mainSha`, the members' views by number (`members`), `ciRun`, the check-runs
 * response (`checks`) and the trees for law 3 (`headTree`, `memberTree`). Refusals carry a `kind`:
 * `review` (law 3) is the only one a `--wait` keeps waiting through, until CI is done.
 */
export function landVerdict(f) {
  const { rec, train } = f;
  const refusals = [];
  const pending = [];
  const refuse = (kind, msg) => refusals.push({ kind, msg });
  if (train?.state !== "OPEN") refuse("state", `the train PR is ${train?.state}, not OPEN`);
  if (train?.isCrossRepository) refuse("state", "the train PR comes from a fork");
  if (train?.headRefName !== rec.branch)
    refuse("state", `the train PR's branch is ${train?.headRefName}, not ${rec.branch}`);
  if (train?.baseRefName !== MAIN) refuse("state", `the train PR targets ${train?.baseRefName}, not ${MAIN}`);
  if (train?.headRefOid !== rec.head)
    refuse("moved", `the train head is ${train?.headRefOid}, not the recorded ${rec.head}: abandon and rebuild`);
  const stale = headIsFresh(rec);
  if (stale) refuse("state", `${stale}; abandon and rebuild`);
  if (f.mainSha !== rec.base) refuse("moved", `${MAIN} is at ${f.mainSha}, not the train's base ${rec.base}: rebuild`);
  else if (["BEHIND", "DIRTY"].includes(train?.mergeStateStatus))
    refuse("moved", `the train PR is ${train.mergeStateStatus}: rebuild`);
  for (const m of rec.members) {
    const v = f.members?.[m.number];
    if (v?.state !== "OPEN") refuse("member", `member #${m.number} is ${v?.state}, not OPEN: abandon and rebuild`);
    else if (v.headRefOid !== m.pinned)
      refuse(
        "member",
        `member #${m.number}'s head is ${v.headRefOid}, not its pinned ${m.pinned}: abandon and rebuild`,
      );
    else if (m.tier !== "low" && !reviewedShas(v.comments).has(m.pinned))
      refuse("member", `member #${m.number} has no \`reviewed ${m.pinned}\` comment (law 1)`);
  }
  const law = law3({ members: rec.members, headTree: f.headTree, memberTree: f.memberTree });
  if (law.required && !reviewedShas(train?.comments).has(rec.head))
    refuse("review", `law 3: no \`reviewed ${rec.head}\` comment on the train PR (${law.why})`);
  const s = runState(f.ciRun, "the train head");
  if (s?.pending) pending.push(s.pending);
  if (s?.failed) refuse("ci", `${s.failed}: read the failing job; abandon and rebuild without the culprit`);
  const checks = f.checks;
  if (!checks || !Array.isArray(checks.check_runs) || checks.check_runs.length === 0) {
    pending.push("no check-runs on the train head yet");
  } else if (checks.total_count !== checks.check_runs.length) {
    refuse("ci", "the check-runs list is not on one page");
  } else {
    for (const c of checks.check_runs) {
      if (INFORMATIONAL_CHECKS.includes(c?.name)) continue;
      if (c?.status !== "completed") pending.push(`check "${c?.name}" is ${c?.status}`);
      else if (!["success", "skipped", "neutral"].includes(c.conclusion))
        refuse("ci", `check "${c.name}" concluded ${c.conclusion}`);
    }
  }
  if (refusals.length === 0 && pending.length === 0 && !MERGEABLE_STATES.includes(train?.mergeStateStatus))
    refuse("state", `the train PR's mergeStateStatus is ${train?.mergeStateStatus}`);
  return { ok: refusals.length === 0 && pending.length === 0, refusals, pending, law };
}

/** Whether a `--wait` keeps polling: something is pending and nothing but law 3 is refused. */
export const keepWaiting = (v) => v.pending.length > 0 && v.refusals.every((r) => r.kind === "review");

/**
 * What landing does to each member, in order, after the merge: `{ number, deleteBranch, comment, note }`.
 * Nothing at all unless the train PR reads MERGED; a member GitHub has not marked MERGED is left untouched;
 * its branch goes only while it still points at the pinned SHA and no open PR is based on it.
 */
export function cleanupPlan({ merged, members }) {
  return members.map((m) => {
    const keep = (note, comment = true) => ({ number: m.number, deleteBranch: false, comment, note });
    if (!merged) return keep("the train PR did not merge: untouched", false);
    if (m.state !== "MERGED") return keep(`GitHub reads it ${m.state}, not MERGED: untouched, check it by hand`, false);
    if (m.remoteTip === null) return keep("its branch is already gone");
    if (m.remoteTip !== m.pinned) return keep(`its branch moved to ${m.remoteTip} after the pin: branch kept`);
    if (m.dependents.length > 0)
      return keep(`its branch is the base of open PR ${m.dependents.map((n) => `#${n}`).join(", ")}: branch kept`);
    return { number: m.number, deleteBranch: true, comment: true, note: null };
  });
}

/** The flags; an unknown one throws. */
export function parseArgs(argv) {
  const args = { mode: "build", prs: [], pr: null, wait: false, dryRun: false, json: false };
  const num = (s) => {
    const m = /^#?(\d+)$/.exec(s ?? "");
    if (!m || Number(m[1]) <= 0) throw new Error(`not a PR number: ${s}`);
    return Number(m[1]);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--land" || a === "--abandon") {
      if (args.mode !== "build") throw new Error("--land and --abandon take one train PR, once");
      args.mode = a.slice(2);
      args.pr = num(argv[++i]);
    } else if (a === "--wait") args.wait = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--json") args.json = true;
    else if (a.startsWith("-")) throw new Error(`unknown argument ${a}`);
    else args.prs.push(num(a));
  }
  if (args.mode === "build") {
    if (args.prs.length === 0) throw new Error("name the PRs to board: npm run train -- <pr> [<pr>…]");
    if (new Set(args.prs).size !== args.prs.length) throw new Error("a PR is named twice");
    if (args.wait) throw new Error("--wait goes with --land");
  } else {
    if (args.prs.length > 0) throw new Error(`--${args.mode} takes the train PR only`);
    if (args.dryRun) throw new Error("--dry-run goes with a build");
    if (args.mode === "abandon" && args.wait) throw new Error("--wait goes with --land");
  }
  return args;
}

// ---- I/O ----------------------------------------------------------------------------------------

class Stop extends Error {
  constructor(code, lines) {
    super(lines.join("\n"));
    this.code = code;
    this.lines = lines;
  }
}

const split0 = (s) => s.split("\0").filter(Boolean);
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * The script. `opts`: `cwd` (any checkout of the repository), `out`/`err` (print a line), `gh(args, cwd)`
 * (returns `{ status, stdout, stderr }`; default the `gh` CLI), `runGen(root)` (default `npm run gen:all`),
 * `now()`, `sleep(ms)`, `wait` and `memberPoll` (the poll bounds). Returns the exit code.
 */
export function main(argv, opts = {}) {
  const out = opts.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = opts.err ?? ((l) => process.stderr.write(`${l}\n`));
  const log = (l) => err(`train: ${l}`);
  const runGen = opts.runGen ?? defaultRunGen;
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? sleepSync;
  const waitBounds = opts.wait ?? WAIT;
  const memberPoll = opts.memberPoll ?? MEMBER_POLL;
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`train: ${e.message}`);
    return 1;
  }

  const run = (cmd, cmdArgs, { cwd, ok = [0] } = {}) => {
    const no = forbidden(cmd, cmdArgs);
    if (no) throw new Error(`refusing to run ${cmd} ${cmdArgs.join(" ")}: ${no}`);
    const r = spawnSync(cmd, cmdArgs, { cwd, maxBuffer: 1 << 28 });
    if (r.error) throw new Error(`${cmd} ${cmdArgs.join(" ")}: ${r.error.message}`);
    if (ok !== "any" && !ok.includes(r.status)) {
      throw new Error(`${cmd} ${cmdArgs.join(" ")} exited ${r.status}: ${r.stderr.toString().trim()}`);
    }
    return r;
  };
  const cwd0 = opts.cwd ?? process.cwd();
  /** git helpers bound to one checkout. */
  const tools = (root) => {
    const gitRaw = (gitArgs, o = {}) => run("git", gitArgs, { cwd: root, ...o });
    const git = (...gitArgs) => gitRaw(gitArgs).stdout.toString().trim();
    const gitOk = (...gitArgs) => gitRaw(gitArgs, { ok: [0, 1] }).status === 0;
    const show = (spec) => {
      const r = gitRaw(["show", spec], { ok: [0, 128] });
      return r.status === 0 ? r.stdout : null;
    };
    const showText = (spec) => show(spec)?.toString("utf8") ?? null;
    const names = (...gitArgs) => split0(git(...gitArgs, "-z"));
    return { root, run, gitRaw, git, gitOk, show, showText, names };
  };
  const ghRun =
    opts.gh ??
    ((ghArgs, cwd) => {
      const r = spawnSync("gh", ghArgs, { cwd, maxBuffer: 1 << 28 });
      if (r.error) throw new Error(`gh ${ghArgs.join(" ")}: ${r.error.message}`);
      return r;
    });
  let here;
  const gh = (ghArgs, { ok = [0] } = {}) => {
    const no = forbidden("gh", ghArgs);
    if (no) throw new Error(`refusing to run gh ${ghArgs.join(" ")}: ${no}`);
    const r = ghRun(ghArgs, here.root);
    const status = r.status;
    if (ok !== "any" && !ok.includes(status))
      throw new Error(`gh ${ghArgs.join(" ")} exited ${status}: ${String(r.stderr ?? "").trim()}`);
    return { status, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
  };
  const ghJson = (ghArgs) => {
    const text = gh(ghArgs).stdout;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`gh ${ghArgs.join(" ")}: not JSON: ${text.slice(0, 200)}`);
    }
  };
  const PR_FIELDS =
    "number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,title,url,labels,comments,mergeStateStatus";
  const viewPr = (n, fields = PR_FIELDS) => ghJson(["pr", "view", String(n), "--json", fields]);
  const ciRuns = (repo, sha) =>
    ghJson(["api", `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=pull_request&per_page=100`]);
  const remoteTip = (branch) => {
    const line = here.git("ls-remote", REMOTE, `refs/heads/${branch}`);
    const sha = line.split(/\s+/)[0] ?? "";
    return SHA.test(sha) ? sha : null;
  };
  /** The primary checkout: the parent of the shared git dir. */
  const primaryRoot = () => dirname(here.git("rev-parse", "--path-format=absolute", "--git-common-dir"));
  const worktreeOf = (branch) => {
    const blocks = here.git("worktree", "list", "--porcelain").replace(/\r\n/g, "\n").split("\n\n");
    for (const b of blocks) {
      const lines = b.split("\n");
      const path = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length);
      if (path && lines.includes(`branch refs/heads/${branch}`)) return path;
    }
    return null;
  };
  /**
   * Remove a train worktree and its local branch: unlink the `node_modules` junction first (a recursive
   * delete would follow it into the primary), refuse while any other link sits in the tree.
   */
  const removeWorktree = (wt, branch) => {
    const nm = join(wt, "node_modules");
    try {
      // On Windows, Node reports a junction as a symbolic link; unlink removes the link, not its target.
      if (lstatSync(nm).isSymbolicLink()) unlinkSync(nm);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const links = linksBelow(wt, 4);
    if (links.length > 0) {
      log(`left the worktree ${wt} in place: it holds links (${links.join(", ")}); unlink them, then remove it`);
      return false;
    }
    here.git("worktree", "remove", "--force", wt);
    if (isTrainBranch(branch) && here.gitOk("rev-parse", "-q", "--verify", `refs/heads/${branch}`))
      here.git("branch", "-q", "-D", branch);
    return true;
  };

  try {
    here = tools(here?.root ?? cwd0);
    here = tools(here.git("rev-parse", "--show-toplevel"));
    const repo = ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
    if (typeof repo !== "string" || !repo.includes("/")) throw new Error("gh repo view gave no nameWithOwner");
    if (args.mode === "build") return build(repo);
    if (args.mode === "land") return land(repo);
    return abandon(repo);
  } catch (e) {
    if (e instanceof Stop) {
      for (const l of e.lines) err(`train: ${l}`);
      return e.code;
    }
    err(`train: error: ${e.message}`);
    return 1;
  }

  // ---- build ----
  function build(repo) {
    log(`fetching ${REMOTE} ${MAIN}`);
    here.git("fetch", "-q", REMOTE, MAIN);
    const base = here.git("rev-parse", `refs/remotes/${REMOTE}/${MAIN}`);
    let mainRun = null;
    try {
      const r = ghJson(["api", `repos/${repo}/actions/workflows/ci.yml/runs?branch=${MAIN}&event=push&per_page=1`]);
      const top = r?.workflow_runs?.[0];
      if (top) mainRun = { id: top.id, sha: top.head_sha, status: top.status, conclusion: top.conclusion };
    } catch (e) {
      log(`could not read ${MAIN}'s last push run: ${e.message}`);
    }
    log(
      mainRun
        ? `information: ${MAIN}'s last push run ${mainRun.id} (${mainRun.sha}) is ${mainRun.status}${mainRun.conclusion ? `, ${mainRun.conclusion}` : ""}`
        : `information: no push run of ${MAIN} found`,
    );

    // 1. Preconditions, every PR, before anything is created.
    const candidates = [];
    const refusals = [];
    for (const n of args.prs) {
      let pr;
      try {
        pr = viewPr(n);
      } catch (e) {
        refusals.push(`#${n}: cannot read it: ${e.message}`);
        continue;
      }
      let tier = null;
      let runs = null;
      const head = pr?.headRefOid;
      if (SHA.test(head ?? "")) {
        const f = here.gitRaw(["fetch", "-q", REMOTE, `refs/pull/${n}/head`], { ok: "any" });
        if (f.status !== 0 || !here.gitOk("cat-file", "-e", `${head}^{commit}`)) {
          refusals.push(`#${n}: cannot fetch its head ${head}`);
          continue;
        }
        const mb = here.git("merge-base", base, head);
        tier = classify(here.names("diff", "--name-only", "--no-renames", mb, head)).tier;
        runs = v0(() => ciRuns(repo, head));
      }
      const v = memberVerdict({ pr, repo, tier, runs });
      if (!v.ok) refusals.push(`#${n}: ${v.reasons.join("; ")}`);
      else
        candidates.push({
          number: n,
          branch: pr.headRefName,
          owner: pr.headRepositoryOwner.login,
          pinned: v.pinned,
          tier,
          title: pr.title,
          exempt: (pr.labels ?? []).some((l) => l?.name === EXEMPT_LABEL),
        });
    }
    if (refusals.length > 0)
      throw new Stop(2, ["refusing to build; nothing was created:", ...refusals.map((r) => `  ${r}`)]);

    // 2. The worktree.
    const branch = trainBranch(now());
    const primary = primaryRoot();
    const wt = join(primary, ".claude", "worktrees", branch.replace("/", "-"));
    if (existsSync(wt)) throw new Error(`${wt} exists already`);
    mkdirSync(dirname(wt), { recursive: true });
    log(`creating ${branch} at ${base} in ${wt}`);
    here.git("worktree", "add", "-q", "-b", branch, wt, base);
    const nmTarget = join(primary, "node_modules");
    if (existsSync(nmTarget)) symlinkSync(nmTarget, join(wt, "node_modules"), "junction");
    const t = tools(wt);
    let pushed = false;
    try {
      // 3. The merges.
      const members = [];
      const dropped = [];
      for (const c of candidates) {
        if (t.gitOk("merge-base", "--is-ancestor", c.pinned, "HEAD")) {
          log(`#${c.number}: ${c.pinned} is already in the train (an earlier member contains it)`);
          members.push({ ...c, scripted: [], contained: true });
          continue;
        }
        const trainJson = t.showText(`HEAD:${ARTIFACTS_JSON}`);
        const memberJson = t.showText(`${c.pinned}:${ARTIFACTS_JSON}`);
        log(`merging #${c.number} (${c.branch} at ${c.pinned})`);
        const m = t.gitRaw(["merge", "--no-ff", "--no-commit", c.pinned], { ok: [0, 1] });
        if (!t.gitOk("rev-parse", "-q", "--verify", "MERGE_HEAD"))
          throw new Error(`git merge did not start: ${m.stderr.toString().trim() || m.stdout.toString().trim()}`);
        const paths = t.names("diff", "--name-only", "--no-renames", "--diff-filter=U");
        const { scripted, hand } = resolveUnmerged(t, paths, scriptableSets(trainJson, memberJson), 2);
        if (hand.length > 0) {
          t.git("merge", "--abort");
          log(`#${c.number}: dropped, hand conflicts in ${hand.join(", ")}`);
          dropped.push({ number: c.number, reason: "hand conflicts with the train", files: [...hand].sort() });
          continue;
        }
        const diff = t
          .gitRaw(["diff", "--cached", "--no-color", "--no-ext-diff", "--unified=1000000", "HEAD", "--", CHANGELOG])
          .stdout.toString("utf8");
        const cl = changelogVerdict(diff, { exempt: c.exempt });
        if (cl.code !== 0) {
          t.git("merge", "--abort");
          for (const l of cl.out) log(`#${c.number}: ${l}`);
          dropped.push({
            number: c.number,
            reason: "CHANGELOG lines outside `[Unreleased]` once merged (a release moved its entry)",
            files: [CHANGELOG],
          });
          continue;
        }
        for (const f of scripted)
          log(
            `#${c.number}: resolved ${f} (${f === CHANGELOG ? "union of both sides" : "the train's side, regenerated below"})`,
          );
        t.git("commit", "-q", "-m", `Merge pull request #${c.number} from ${c.owner}/${c.branch}`, "-m", c.title);
        members.push({ ...c, scripted, contained: false });
      }
      if (members.length === 0)
        throw new Stop(2, [
          "nothing boarded: every PR was dropped",
          ...dropped.map((d) => `  #${d.number}: ${d.reason}: ${d.files.join(", ")}`),
        ]);

      // 4. Regenerate once, on the tip.
      const untrackedBefore = new Set(t.names("ls-files", "-o", "--exclude-standard"));
      log("npm run gen:all (on the train tip)");
      if (!runGen(wt)) throw new Error("npm run gen:all failed on the train tip");
      const sets = artifactSets([
        t.showText(`HEAD:${ARTIFACTS_JSON}`),
        existsSync(join(wt, ARTIFACTS_JSON)) ? readFileSync(join(wt, ARTIFACTS_JSON), "utf8") : null,
      ]);
      const { regenerated, stray } = stageRegenerated(t, sets, untrackedBefore);
      if (stray.length > 0)
        log(`gen:all also changed files that are not generated artifacts (left out of the train): ${stray.join(", ")}`);
      if (regenerated.length > 0) {
        log(`regenerated: ${regenerated.join(", ")}`);
        t.git(
          "commit",
          "-q",
          "-m",
          "chore(train): regenerate the generated artifacts",
          "-m",
          "`npm run gen:all` on the train tip; the member merges above hold git's textual merge of these files.",
        );
      }

      // 5. The CHANGELOG verdict on the tip against the base, as CI's changelog job reads it.
      const exempt = members.some((m) => m.exempt);
      const fullDiff = t
        .gitRaw(["diff", "--no-color", "--no-ext-diff", "--unified=1000000", base, "HEAD", "--", CHANGELOG])
        .stdout.toString("utf8");
      const cl = changelogVerdict(fullDiff, { exempt });
      if (cl.code !== 0) throw new Stop(2, [...cl.out, "the train tip fails the CHANGELOG rule; nothing was pushed"]);
      for (const l of cl.out) log(l);
      const head = t.git("rev-parse", "HEAD");
      // Every boarded member got its own --no-ff merge commit, so the head is fresh unless every member was
      // already contained; checked anyway, before anything is pushed.
      const stale = headIsFresh({ head, base, members });
      if (stale) throw new Stop(2, [`${stale}; nothing was pushed`]);
      const law = law3({
        members,
        headTree: t.git("rev-parse", `${head}^{tree}`),
        memberTree: members.length === 1 ? t.git("rev-parse", `${members[0].pinned}^{tree}`) : null,
      });

      // 6. The re-review focus: per member, the other side is everything else in the train.
      const importsOf = importReader(wt);
      const own = new Map();
      for (const m of members) {
        const mb = t.git("merge-base", m.pinned, base);
        own.set(m.number, { mb, files: t.names("diff", "--name-only", "--no-renames", mb, m.pinned) });
      }
      const exportsDiff = (from, to) =>
        t
          .gitRaw(["diff", "--no-color", "--no-ext-diff", "--no-renames", "-U0", from, to, "--", ...EXPORT_GLOBS])
          .stdout.toString("utf8");
      const focus = {};
      for (const m of members) {
        const { mb, files: prFiles } = own.get(m.number);
        const others = members.filter((k) => k.number !== m.number);
        const otherFiles = [
          ...t.names("diff", "--name-only", "--no-renames", mb, base),
          ...others.flatMap((k) => own.get(k.number).files),
        ];
        const diffs = [exportsDiff(mb, base), ...others.map((k) => exportsDiff(own.get(k.number).mb, k.pinned))].join(
          "\n",
        );
        const fsets = artifactSets([t.showText(`HEAD:${ARTIFACTS_JSON}`), t.showText(`${m.pinned}:${ARTIFACTS_JSON}`)]);
        const ex = changedExports(diffs, (file) => isRegenerated(file, fsets));
        focus[m.number] = {
          scripted: m.scripted,
          ...focusFiles({ prFiles, mainFiles: otherFiles, hand: [], sets: fsets }),
          importLinked: importLinked({ prFiles, mainFiles: otherFiles, importsOf, sets: fsets }),
          changedExports: ex.declarations,
          changedExportBodies: ex.bodies,
        };
      }
      const focusText = members
        .flatMap((m) => [
          `#${m.number} ${m.title}`,
          ...reportLines({ head, scripted: m.scripted, focus: focus[m.number], other: OTHER_SIDE }).map(
            (l) => `  ${l}`,
          ),
        ])
        .join("\n");

      const rec = {
        v: 1,
        repo,
        branch,
        base,
        head,
        exempt,
        members: members.map((m) => ({
          number: m.number,
          branch: m.branch,
          pinned: m.pinned,
          tier: m.tier,
          title: m.title,
        })),
        dropped,
      };
      const body = renderBody({ rec, law, focusText });
      const report = { trainPr: null, url: null, dryRun: args.dryRun, rec, regenerated, law, mainRun, focus };

      // 7. Push and open the train PR (not with --dry-run).
      if (args.dryRun) {
        log("--dry-run: nothing pushed, no PR opened; removing the worktree");
        removeWorktree(wt, branch);
        print(report, body, focusText);
        return 0;
      }
      log(`pushing ${branch}`);
      t.git("push", "-q", REMOTE, `refs/heads/${branch}:refs/heads/${branch}`);
      pushed = true;
      const bodyDir = mkdtempSync(join(tmpdir(), "merge-train-"));
      let created;
      try {
        const bodyFile = join(bodyDir, "body.md");
        writeFileSync(bodyFile, body);
        const ghArgs = [
          "pr",
          "create",
          "--base",
          MAIN,
          "--head",
          branch,
          "--title",
          trainTitle(members),
          "--body-file",
          bodyFile,
        ];
        if (exempt) ghArgs.push("--label", EXEMPT_LABEL);
        created = gh(ghArgs, { ok: "any" });
      } finally {
        rmSync(bodyDir, { recursive: true, force: true, maxRetries: 3 });
      }
      const num = /\/pull\/(\d+)/.exec(created.stdout)?.[1];
      if (created.status !== 0 || !num) {
        throw new Stop(1, [
          `pushed ${branch} (${head}) but the train PR was not created: ${created.stderr.trim()}`,
          `open it by hand with the body above, or delete the branch: git push ${REMOTE} --delete ${branch}`,
          `the worktree stays at ${wt}`,
        ]);
      }
      report.trainPr = Number(num);
      report.url = created.stdout.trim();
      print(report, body, focusText);
      return 0;
    } catch (e) {
      if (!pushed) {
        try {
          if (t.gitOk("rev-parse", "-q", "--verify", "MERGE_HEAD")) t.git("merge", "--abort");
          removeWorktree(wt, branch);
        } catch (cleanupError) {
          log(`could not remove the worktree ${wt}: ${cleanupError.message}`);
        }
      }
      throw e;
    }
  }

  /**
   * The `proves: yes|no (<reason>)` line of `node scripts/ci-proven.mjs --run <id>` (FT1), from this
   * checkout's copy; `proves: unknown (…)` when the script is absent or fails. `opts.proof(runId, repo)`
   * replaces the call in tests (returns `{ status, stdout, stderr }`).
   */
  function readProof(runId, repo) {
    const script = join(here.root, "scripts", "ci-proven.mjs");
    let r;
    if (opts.proof) r = opts.proof(runId, repo);
    else if (!existsSync(script))
      return "proves: unknown (scripts/ci-proven.mjs is not in this checkout: FT1 not merged)";
    else
      r = spawnSync(process.execPath, [script, "--run", String(runId), "--repo", repo], {
        cwd: here.root,
        timeout: 120_000,
      });
    const line = String(r?.stdout ?? "")
      .split(/\r?\n/)
      .find((l) => l.startsWith("proves: "));
    return (
      line ??
      `proves: unknown (ci-proven exited ${r?.status}: ${String(r?.stderr ?? "")
        .trim()
        .slice(0, 200)})`
    );
  }

  /** `fn()`, or null when it throws (a missing CI-runs response is "no run", which refuses). */
  function v0(fn) {
    try {
      return fn();
    } catch (e) {
      log(e.message);
      return null;
    }
  }

  function print(report, body, focusText) {
    const { rec } = report;
    if (args.json) {
      out(
        JSON.stringify({
          trainPr: report.trainPr,
          url: report.url,
          dryRun: report.dryRun,
          branch: rec.branch,
          base: rec.base,
          head: rec.head,
          members: rec.members,
          dropped: rec.dropped,
          regenerated: report.regenerated,
          law3: report.law,
          mainRun: report.mainRun,
          focus: Object.fromEntries(Object.entries(report.focus).map(([n, f]) => [n, focusJson(f)])),
        }),
      );
      return;
    }
    out(report.dryRun ? `dry run: ${rec.branch} (not pushed)` : `train PR #${report.trainPr}: ${report.url}`);
    out(`base: ${rec.base}`);
    out(`head: ${rec.head}`);
    out(`members: ${rec.members.map((m) => `#${m.number} (${m.pinned})`).join(", ")}`);
    out(
      `dropped: ${rec.dropped.length === 0 ? "none" : rec.dropped.map((d) => `#${d.number} (${d.reason}: ${d.files.join(", ")})`).join("; ")}`,
    );
    if (report.regenerated.length > 0) out(`regenerated: ${report.regenerated.join(", ")}`);
    out(
      `law 3: ${report.law.required ? `post \`reviewed ${rec.head}\` after the red team reads the head` : "no new review needed"} (${report.law.why})`,
    );
    out("re-review focus:");
    for (const l of focusText.split("\n")) out(`  ${l}`);
    if (report.dryRun) {
      out("body:");
      for (const l of body.split("\n")) out(`  ${l}`);
    }
  }

  // ---- land ----
  function land(repo) {
    const n = args.pr;
    const TRAIN_FIELDS = `${PR_FIELDS},body`;
    const read = () => {
      const train = viewPr(n, TRAIN_FIELDS);
      let rec;
      try {
        rec = parseRecord(train.body);
      } catch (e) {
        throw new Stop(2, [`#${n}: ${e.message}`]);
      }
      if (rec.repo.toLowerCase() !== repo.toLowerCase())
        throw new Stop(2, [`#${n}: the record names ${rec.repo}, not ${repo}`]);
      const members = {};
      for (const m of rec.members) members[m.number] = viewPr(m.number, "number,state,headRefOid,comments");
      const one = rec.members.length === 1;
      const treeOf = (sha) => ghJson(["api", `repos/${repo}/git/commits/${sha}`])?.tree?.sha ?? null;
      return {
        rec,
        train,
        members,
        mainSha: remoteTip(MAIN),
        ciRun: v0(() => latestCiRun(ciRuns(repo, rec.head), { sha: rec.head, branch: rec.branch, repo })),
        checks: v0(() => ghJson(["api", `repos/${repo}/commits/${rec.head}/check-runs?per_page=100`])),
        headTree: one ? treeOf(rec.head) : null,
        memberTree: one ? treeOf(rec.members[0].pinned) : null,
      };
    };
    let facts = read();
    let v = landVerdict(facts);
    const deadline = now().getTime() + waitBounds.timeoutMs;
    while (args.wait && keepWaiting(v) && now().getTime() < deadline) {
      log(`waiting ${Math.round(waitBounds.intervalMs / 1000)} s: ${v.pending.join("; ")}`);
      sleep(waitBounds.intervalMs);
      facts = read();
      v = landVerdict(facts);
    }
    const { rec } = facts;
    if (!v.ok) {
      const lines = [
        `not landing #${n}:`,
        ...v.refusals.map((r) => `  ${r.msg}`),
        ...v.pending.map((p) => `  pending: ${p}`),
      ];
      if (v.refusals.length === 0)
        lines.push(args.wait ? "  (the wait timed out)" : "  re-run with --wait to wait for CI");
      throw new Stop(2, lines);
    }

    // Information, never a refusal: will the push run for this merge be proven by the train's run (FT1's
    // `scripts/ci-proven.mjs --run`)? A "no" means `main` runs every leg itself.
    const proof = readProof(facts.ciRun.id, repo);
    log(`main push proof (ci-proven --run ${facts.ciRun.id}): ${proof}`);

    // The merge, pinned to the recorded head. Then read the state: cleanup is decided only from it.
    log(`merging #${n} at ${rec.head}`);
    const m = gh(["pr", "merge", String(n), "--merge", "--match-head-commit", rec.head], { ok: "any" });
    let after = viewPr(n, "state,mergeCommit");
    // A zero exit is re-read a few times before it counts as "not merged"; a failed merge is not.
    for (let i = 0; m.status === 0 && after?.state !== "MERGED" && i < 3; i++) {
      sleep(memberPoll.intervalMs);
      after = viewPr(n, "state,mergeCommit");
    }
    if (after?.state !== "MERGED") {
      throw new Stop(1, [
        `#${n} did not merge (gh exited ${m.status}: ${m.stderr.trim()}); it reads ${after?.state}.`,
        "nothing was cleaned up: no branch deleted, no comment posted, the worktree kept",
      ]);
    }
    const mergeSha = after.mergeCommit?.oid ?? "";
    log(`#${n} merged as ${mergeSha}`);
    try {
      const parents = ghJson(["api", `repos/${repo}/git/commits/${mergeSha}`])?.parents?.map((p) => p.sha) ?? [];
      if (parents[0] !== rec.base || parents[1] !== rec.head)
        log(`warning: the merge commit's parents are ${parents.join(" ")}, not ${rec.base} ${rec.head}`);
    } catch (e) {
      log(`could not read the merge commit: ${e.message}`);
    }

    // Members: GitHub marks each merged once its head is reachable from main, asynchronously.
    let states = {};
    for (let attempt = 0; attempt < memberPoll.attempts; attempt++) {
      states = Object.fromEntries(rec.members.map((mm) => [mm.number, viewPr(mm.number, "number,state")?.state]));
      if (Object.values(states).every((s) => s === "MERGED")) break;
      if (attempt + 1 < memberPoll.attempts) sleep(memberPoll.intervalMs);
    }
    const plan = cleanupPlan({
      merged: true,
      members: rec.members.map((mm) => {
        const merged = states[mm.number] === "MERGED";
        return {
          number: mm.number,
          pinned: mm.pinned,
          state: states[mm.number],
          remoteTip: merged ? remoteTip(mm.branch) : null,
          dependents: merged
            ? (ghJson(["pr", "list", "--base", mm.branch, "--state", "open", "--json", "number"]) ?? []).map(
                (p) => p.number,
              )
            : [],
        };
      }),
    });
    const results = [];
    for (const step of plan) {
      const mm = rec.members.find((x) => x.number === step.number);
      const r = {
        number: step.number,
        state: states[step.number],
        branchDeleted: false,
        commented: false,
        note: step.note,
      };
      if (step.deleteBranch) {
        here.git("push", "-q", REMOTE, "--delete", mm.branch);
        r.branchDeleted = true;
      }
      if (step.comment) {
        gh(["pr", "comment", String(step.number), "--body", `landed by train #${n} (${mergeSha})`]);
        r.commented = true;
      }
      results.push(r);
    }
    // The train branch and its worktree.
    const trainTip = remoteTip(rec.branch);
    if (trainTip === rec.head) here.git("push", "-q", REMOTE, "--delete", rec.branch);
    else if (trainTip !== null) log(`${rec.branch} moved to ${trainTip}: kept`);
    const wt = worktreeOf(rec.branch);
    if (wt) removeWorktree(wt, rec.branch);
    else if (here.gitOk("rev-parse", "-q", "--verify", `refs/heads/${rec.branch}`))
      here.git("branch", "-q", "-D", rec.branch);
    const unmerged = results.filter((r) => r.state !== "MERGED");
    if (args.json) out(JSON.stringify({ trainPr: n, merged: true, mergeSha, proof, members: results }));
    else {
      out(`landed train #${n} as ${mergeSha}`);
      out(`  main push proof: ${proof}`);
      for (const r of results)
        out(
          `  #${r.number}: ${r.state}${r.branchDeleted ? ", branch deleted" : ""}${r.commented ? ", commented" : ""}${r.note ? ` (${r.note})` : ""}`,
        );
    }
    for (const r of unmerged)
      err(`train: MEMBER #${r.number} IS NOT MARKED MERGED (${r.state}); it was left untouched`);
    return unmerged.length > 0 ? 1 : 0;
  }

  // ---- abandon ----
  function abandon(repo) {
    const n = args.pr;
    const train = viewPr(n, "number,state,headRefName,isCrossRepository,headRefOid");
    if (!isTrainBranch(train?.headRefName) || train.isCrossRepository)
      throw new Stop(2, [`#${n} is not a train PR of ${repo} (branch ${train?.headRefName})`]);
    if (train.state === "MERGED") throw new Stop(2, [`#${n} is merged; nothing to abandon`]);
    if (train.state === "OPEN") {
      gh([
        "pr",
        "close",
        String(n),
        "--comment",
        "Abandoned with `npm run train -- --abandon`; its members are untouched.",
      ]);
      const after = viewPr(n, "state");
      if (after?.state !== "CLOSED") throw new Stop(1, [`#${n} reads ${after?.state} after closing; nothing deleted`]);
    }
    const branch = train.headRefName;
    const tip = remoteTip(branch);
    if (tip !== null) here.git("push", "-q", REMOTE, "--delete", branch);
    const wt = worktreeOf(branch);
    if (wt) removeWorktree(wt, branch);
    else if (here.gitOk("rev-parse", "-q", "--verify", `refs/heads/${branch}`)) here.git("branch", "-q", "-D", branch);
    if (args.json) out(JSON.stringify({ trainPr: n, closed: true, branchDeleted: tip !== null, worktree: wt }));
    else
      out(
        `abandoned train #${n}: closed, ${tip !== null ? `${branch} deleted` : `${branch} already gone`}${wt ? `, worktree ${wt} removed` : ""}`,
      );
    return 0;
  }
}

/** The links (junctions, symlinks) at most `depth` levels below `dir`, never following one; `.git` skipped. */
function linksBelow(dir, depth) {
  const found = [];
  const walk = (d, left) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === ".git") continue;
      const p = join(d, name);
      // lstat, not the dirent type: on Windows a junction must read as a link, never as a directory.
      const st = lstatSync(p, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isSymbolicLink()) found.push(p);
      else if (st.isDirectory() && left > 1) walk(p, left - 1);
    }
  };
  walk(dir, depth);
  return found;
}

const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) process.exit(main(process.argv.slice(2)));
