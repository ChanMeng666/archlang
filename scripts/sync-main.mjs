#!/usr/bin/env node
/**
 * `npm run sync:main` — merge `origin/main` into the current PR branch, resolve the conflicts that
 * need no judgement, and tell the red team where to look on the merged head.
 *
 * Why: since required checks became strict (2026-11-10) a PR is synced about 1.4 times before it
 * merges, and half of the hand-resolved merges touched only `CHANGELOG.md` and generated artifacts
 * (`docs/plans/ci-throughput-research.md` § 4.4). `gh pr update-branch` is no answer: GitHub's textual
 * merge of a generated file is not the generator's output (`docs/agents/gotchas.md` § PRs & CI).
 *
 *   npm run sync:main [-- --push] [--no-gen] [--json] [--changelog-exempt]
 *   npm run sync:main -- --continue [--push] [--no-gen] [--json] [--changelog-exempt]
 *
 * Steps:
 *   1. Refuse unless the branch is not `main`, no merge is in progress and no tracked file has a change
 *      (untracked files are ignored: a worktree's state notes are untracked, and git refuses on its own
 *      when one would be overwritten).
 *   2. `git fetch origin main`; record OLD_HEAD and BASE (`git merge-base HEAD origin/main`). Already an
 *      ancestor: "up to date", exit 0 (with `--push`, the branch is pushed only if the remote's differs).
 *   3. `git merge --no-ff --no-commit origin/main`; each unmerged path is classified ({@link classifyUnmerged}):
 *      - a generated artifact takes main's side and is regenerated in step 4, but only when it is a
 *        whole-file artifact on BOTH sides (a key of `.artifacts` in `.claude/hooks/generated-artifacts.json`
 *        at OLD_HEAD and at main's tip, listed in neither side's `.partial`; read, never retyped);
 *      - `CHANGELOG.md` is union-merged from its three index stages, unless a diff3 merge shows both
 *        sides editing the same existing lines ({@link diff3EditsBase}): that is a hand conflict;
 *      - anything else is a real conflict, a `.partial` artifact included (its generator owns only a
 *        marked region; the rest is hand-written). The merge is left in progress, the files are printed,
 *        exit 2. Fix them, `git add` them, then `--continue`.
 *   4. `npm run gen:all` (not with `--no-gen`), then stage only the generated artifacts it changed.
 *   5. The `CHANGELOG.md` rule of `scripts/check-changelog-unreleased.mjs` (every added line under
 *      `[Unreleased]`): its own {@link changelogVerdict}, on the STAGED merge against main's tip. Running
 *      that script before the commit would diff `origin/main...HEAD`, and HEAD is still the pre-merge
 *      branch, so it would never see what the merge did; after the commit `origin/main...HEAD` is the same
 *      diff as this one (main's tip is then the merge base). A violation leaves the merge uncommitted, exit 2.
 *   6. `git commit --no-edit` (git's merge message).
 *   7. The re-review focus. The merged head is always red-teamed again: a clean merge with no shared
 *      file can still break the PR (a function main changed, called from a file only the PR touched).
 *      The block says where to look first: (a) overlap, files both the PR (BASE..OLD_HEAD) and main
 *      (BASE..main) changed ({@link focusFiles}); (b) the conflicts resolved by hand; (c) code main changed
 *      that a PR-changed file imports or is imported by, one level, by the import reading of
 *      `scripts/nearest-tests.mjs` ({@link importLinked}); (d) in `.ts`/`.mjs` files, the export
 *      declarations main's side added or removed, and the exports whose body it changed, read from the
 *      hunk headers of a `-U0` diff ({@link changedExports}), so the red team greps their callers in the
 *      PR. Whole-file artifacts, `CHANGELOG.md` and low-tier paths (`classify()` of
 *      `scripts/risk-tier.mjs`) are left out. Every `--name-only` diff is `--no-renames`, so a rename
 *      counts both paths.
 *   8. `git push origin <branch>` only with `--push`, after the focus is computed: a failed push still
 *      prints it, then exits 1.
 *
 * The state of a merge in progress is persisted in `sync-main.json` under the git dir
 * (`git rev-parse --git-path`, so each worktree has its own): OLD_HEAD, BASE, main's tip, the scripted
 * and hand-resolved files, `--push` and `--changelog-exempt` (which `--continue` honours). It is written
 * as soon as the merge has started, with every unmerged path counted as hand-resolved until the script
 * has resolved it, and removed after the commit. Recomputing the hand-resolved list at `--continue` from
 * "the staged file differs from both parents" would count every file git merged cleanly from two sides and
 * would miss a conflict resolved to exactly one side's text, so it is recorded where it is known. If the
 * record is gone, `--continue` falls back to that recomputation and says what it can miss.
 *
 * `--json` prints `{ upToDate, head, oldHead, scripted, hand, pushed, focus }` on stdout, `focus` being
 * `{ overlap, hand, importLinked, changedExports, changedExportBodies }`, or `null` when nothing was merged
 * (`hand`: every conflict resolved by hand; `focus.hand`: those not low tier). Progress goes to stderr.
 * Exit codes: 0 done, 2 stopped for an agent, 1 error. Zero dependencies, plain Node.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { changelogVerdict } from "./check-changelog-unreleased.mjs";
import { CODE, resolveSpec, SPEC } from "./nearest-tests.mjs";
import { classify } from "./risk-tier.mjs";

export const ARTIFACTS_JSON = ".claude/hooks/generated-artifacts.json";
export const CHANGELOG = "CHANGELOG.md";
const STATE = "sync-main.json";
const MAIN = "main";
const REMOTE = "origin";
const REMOTE_MAIN = `${REMOTE}/${MAIN}`;
const CONFLICT_MARK = /^(<{7}|>{7})( |$)/m;

/** One text of `.claude/hooks/generated-artifacts.json` as `{ artifacts, partial }` sets; empty if absent or bad. */
function parseArtifacts(text) {
  const artifacts = new Set();
  const partial = new Set();
  if (typeof text !== "string" || text === "") return { artifacts, partial };
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { artifacts, partial };
  }
  for (const p of Object.keys(doc?.artifacts ?? {})) artifacts.add(p);
  for (const p of Array.isArray(doc?.partial) ? doc.partial : []) partial.add(p);
  return { artifacts, partial };
}

/**
 * The generated artifacts named by one or more texts of `.claude/hooks/generated-artifacts.json`:
 * `{ artifacts, partial }` as sets, the union over the texts. Used to leave artifacts out of the focus.
 */
export function artifactSets(texts) {
  const artifacts = new Set();
  const partial = new Set();
  for (const text of texts) {
    const one = parseArtifacts(text);
    for (const p of one.artifacts) artifacts.add(p);
    for (const p of one.partial) partial.add(p);
  }
  return { artifacts, partial };
}

/**
 * The artifacts a conflict may be scripted for: an artifact on BOTH sides (`ours` = OLD_HEAD's JSON,
 * `theirs` = main's), and `partial` on either side. A file one side does not call generated is the other
 * side's hand-written file, so taking main's text for it could drop real work.
 */
export function scriptableSets(ours, theirs) {
  const a = parseArtifacts(ours);
  const b = parseArtifacts(theirs);
  return {
    artifacts: new Set([...a.artifacts].filter((p) => b.artifacts.has(p))),
    partial: new Set([...a.partial, ...b.partial]),
  };
}

/**
 * How an unmerged path is resolved: `"generated"` (take main's side; the generator rewrites it),
 * `"changelog"` (union of the three stages) or `"conflict"` (an agent resolves it). `sets` comes from
 * {@link scriptableSets}. An artifact whose generator owns only a marked region is a conflict: taking
 * main's side would drop the branch's hand edits outside the region. A `CHANGELOG.md` missing its ours or
 * theirs stage (deleted on one side) is a conflict too.
 */
export function classifyUnmerged(path, { artifacts, partial }, stages = [1, 2, 3]) {
  if (path === CHANGELOG) return stages.includes(2) && stages.includes(3) ? "changelog" : "conflict";
  if (artifacts.has(path) && !partial.has(path)) return "generated";
  return "conflict";
}

/**
 * Whether a `git merge-file --diff3 -p` result has a conflict hunk whose base section is not empty: both
 * sides changed the same existing lines (an entry edited on one side and reworded on the other, or a
 * heading moved by a release), which a union would turn into a duplicated or garbled record. Two sides
 * that only insert at one place leave the base section empty, and the union keeps both.
 */
export function diff3EditsBase(text) {
  let section = null;
  let baseLines = 0;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("<<<<<<<")) {
      section = "ours";
      baseLines = 0;
    } else if (section === "ours" && line.startsWith("|||||||")) section = "base";
    else if ((section === "ours" || section === "base") && line.startsWith("=======")) {
      if (section === "base" && baseLines > 0) return true;
      section = "theirs";
    } else if (section === "theirs" && line.startsWith(">>>>>>>")) section = null;
    else if (section === "base") baseLines++;
  }
  return false;
}

const uniqSorted = (xs) => [...new Set(xs)].sort();
/** A path the risk tiers call low (internal prose): never a re-review focus. */
const isLowTier = (f) => classify([f]).tier === "low";
/** A whole-file generated artifact: regenerated, so neither side's text is reviewed. */
const isRegenerated = (f, { artifacts = new Set(), partial = new Set() }) => artifacts.has(f) && !partial.has(f);

/**
 * Focus (a) and (b). `prFiles` = what the PR changed (BASE..OLD_HEAD), `mainFiles` = what main brought in
 * (BASE..main), `hand` = conflicts an agent resolved, `sets` = {@link artifactSets}. Overlap leaves out
 * whole-file artifacts, `CHANGELOG.md` and low-tier paths; `hand` leaves out low-tier paths. Both sorted.
 */
export function focusFiles({ prFiles, mainFiles, hand = [], sets = {} }) {
  const main = new Set(mainFiles);
  const overlap = uniqSorted(prFiles).filter(
    (f) => main.has(f) && f !== CHANGELOG && !isRegenerated(f, sets) && !isLowTier(f),
  );
  return { overlap, hand: uniqSorted(hand).filter((f) => !isLowTier(f)) };
}

/**
 * Focus (c): code files main changed and the PR did not, that a PR-changed code file imports or is
 * imported by, one level. `importsOf(file)` gives the repository paths a file imports (on the merged
 * head). Returns `[{ file, via: [{ file, how: "imports" | "imported by" }] }]`, sorted by file; `how`
 * says what the main-side file does to the PR file.
 */
export function importLinked({ prFiles, mainFiles, importsOf, sets = {} }) {
  const pr = uniqSorted(prFiles).filter((f) => CODE.test(f));
  const prSet = new Set(pr);
  const linked = [];
  for (const m of uniqSorted(mainFiles)) {
    if (prSet.has(m) || !CODE.test(m) || isRegenerated(m, sets) || isLowTier(m)) continue;
    const mImports = new Set(importsOf(m));
    const via = [];
    for (const p of pr) {
      if (mImports.has(p)) via.push({ file: p, how: "imports" });
      else if (importsOf(p).includes(m)) via.push({ file: p, how: "imported by" });
    }
    if (via.length > 0) linked.push({ file: m, via });
  }
  return linked;
}

const EXPORT_DECL =
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/;
const HUNK = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@ ?(.*)$/;

/**
 * Focus (d), from a `git diff -U0 BASE main` of TS and `.mjs` files, as sorted `"<file>: <name>"` lists:
 * `declarations`, every exported function, const or class whose `export` line main's side added or
 * removed; `bodies`, every export named in a hunk header's context (git's function-name line: the
 * nearest line above the hunk that starts a declaration), that is an export whose body main changed
 * without touching its `export` line. Files `skip(file)` names (whole-file artifacts) are left out.
 */
export function changedExports(diff, skip = () => false) {
  const declarations = [];
  const bodies = [];
  let file = null;
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    const header = /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    if (file === null || skip(file)) continue;
    const hunk = HUNK.exec(line);
    if (hunk) {
      const m = EXPORT_DECL.exec(hunk[1]);
      if (m) bodies.push(`${file}: ${m[1]}`);
      continue;
    }
    if ((line[0] === "+" || line[0] === "-") && line[1] !== line[0]) {
      const m = EXPORT_DECL.exec(line.slice(1));
      if (m) declarations.push(`${file}: ${m[1]}`);
    }
  }
  return { declarations: uniqSorted(declarations), bodies: uniqSorted(bodies) };
}

/** The flags; an unknown one throws. */
export function parseArgs(argv) {
  const known = new Set(["--continue", "--push", "--no-gen", "--json", "--changelog-exempt"]);
  for (const a of argv) if (!known.has(a)) throw new Error(`unknown argument ${a}`);
  return {
    resume: argv.includes("--continue"),
    push: argv.includes("--push"),
    gen: !argv.includes("--no-gen"),
    json: argv.includes("--json"),
    exempt: argv.includes("--changelog-exempt"),
  };
}

/** The command that resumes a stopped sync, with the flags it was started with. */
export function continueHint({ push, gen, json, exempt }) {
  const flags = [
    "--continue",
    push ? "--push" : "",
    gen ? "" : "--no-gen",
    json ? "--json" : "",
    exempt ? "--changelog-exempt" : "",
  ];
  return `npm run sync:main -- ${flags.filter(Boolean).join(" ")}`;
}

/**
 * The stop lines for real conflicts. A `.partial` artifact gets its own advice: only its marked region
 * is generated, and the Edit/Write tools refuse the file (hook rule `generated-edit`,
 * `.claude/hooks/local-gate.mjs`), so it is resolved from the shell.
 */
export function conflictLines(hand, partial, hint) {
  const lines = ["real conflicts, an agent resolves them:"];
  for (const f of hand) {
    if (!partial.has(f)) lines.push(`  ${f}`);
    else {
      lines.push(
        `  ${f} (only its marked region is generated; the rest is hand-written. The Edit/Write tools refuse it:`,
        "    take one side with `git checkout --ours -- <file>` or `--theirs`, re-apply the other side's hand edits",
        "    from the shell (`git show :2:<file>` / `:3:<file>` print each side), leave the marked region to gen:all)",
      );
    }
  }
  lines.push(`resolve these, \`git add\` them, then \`${hint}\``);
  return lines;
}

/** The lines of the final report (text mode). */
export function reportLines({ head, scripted, regenerated = [], focus }) {
  const out = [];
  if (scripted.length > 0) out.push(`scripted: ${scripted.join(", ")}`);
  if (regenerated.length > 0) out.push(`regenerated: ${regenerated.join(", ")}`);
  out.push(`re-review focus (red-team the merged head ${head}; start here):`);
  const section = (title, items) => {
    out.push(`  ${title}:${items.length === 0 ? " none" : ""}`);
    for (const i of items) out.push(`    ${i}`);
  };
  section("overlap (both the PR and main changed)", focus.overlap);
  section("hand-resolved conflicts", focus.hand);
  section(
    "import-linked (main changed; one import from a PR file)",
    focus.importLinked.map(({ file, via }) => `${file} (${via.map((v) => `${v.how} ${v.file}`).join(", ")})`),
  );
  section("export declarations main added/removed (grep their callers in the PR)", focus.changedExports);
  section("exports whose body main changed (grep their callers in the PR)", focus.changedExportBodies);
  out.push(`head: ${head}`);
  return out;
}

/** The `--json` object's `focus`: the import-linked entries as file names. */
export function focusJson(focus) {
  return { ...focus, importLinked: focus.importLinked.map((l) => l.file) };
}

class Stop extends Error {
  constructor(code, lines) {
    super(lines.join("\n"));
    this.code = code;
    this.lines = lines;
  }
}

const split0 = (s) => s.split("\0").filter(Boolean);

/** Run `npm run gen:all` in `cwd`, its output on stderr; true when it succeeds. */
function defaultRunGen(cwd) {
  const viaNpm = process.env.npm_execpath;
  const opts = { cwd, stdio: ["ignore", 2, 2] };
  const r =
    viaNpm && isAbsolute(viaNpm) && /\.c?js$/.test(viaNpm)
      ? spawnSync(process.execPath, [viaNpm, "run", "gen:all"], opts)
      : spawnSync("npm run gen:all", { ...opts, shell: true });
  return r.status === 0;
}

/**
 * The script. `opts.cwd` is the checkout (default the process's), `opts.out`/`opts.err` print a line,
 * `opts.runGen(root)` regenerates (default `npm run gen:all`). Returns the exit code.
 */
export function main(argv, opts = {}) {
  const out = opts.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = opts.err ?? ((l) => process.stderr.write(`${l}\n`));
  const runGen = opts.runGen ?? defaultRunGen;
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`sync:main: ${e.message}`);
    return 1;
  }
  const log = (l) => err(`sync:main: ${l}`);

  const run = (cmd, cmdArgs, { cwd, ok = [0] } = {}) => {
    const r = spawnSync(cmd, cmdArgs, { cwd, maxBuffer: 1 << 28 });
    if (r.error) throw new Error(`${cmd} ${cmdArgs.join(" ")}: ${r.error.message}`);
    if (ok !== "any" && !ok.includes(r.status)) {
      throw new Error(`${cmd} ${cmdArgs.join(" ")} exited ${r.status}: ${r.stderr.toString().trim()}`);
    }
    return r;
  };
  let root = opts.cwd ?? process.cwd();
  const gitRaw = (gitArgs, o = {}) => run("git", gitArgs, { cwd: root, ...o });
  const git = (...gitArgs) => gitRaw(gitArgs).stdout.toString().trim();
  const gitOk = (...gitArgs) => gitRaw(gitArgs, { ok: [0, 1] }).status === 0;
  const show = (spec) => {
    const r = gitRaw(["show", spec], { ok: [0, 128] });
    return r.status === 0 ? r.stdout : null;
  };
  const showText = (spec) => show(spec)?.toString("utf8") ?? null;
  const names = (...gitArgs) => split0(git(...gitArgs, "-z"));
  const unmerged = () => names("diff", "--name-only", "--no-renames", "--diff-filter=U");
  /** Run `git merge-file <mode> -p ours base theirs` over the three index stages of `path` (empty when absent). */
  const mergeStages = (path, mode) => {
    const dir = mkdtempSync(join(tmpdir(), "sync-main-"));
    try {
      const files = {};
      for (const [name, stage] of [
        ["base", 1],
        ["ours", 2],
        ["theirs", 3],
      ]) {
        files[name] = join(dir, name);
        writeFileSync(files[name], show(`:${stage}:${path}`) ?? Buffer.alloc(0));
      }
      // The exit code is the number of conflicts (or 255 on an error, which `ok` refuses).
      const r = run("git", ["merge-file", mode, "-p", files.ours, files.base, files.theirs], { cwd: root, ok: "any" });
      if (r.status < 0 || r.status > 127) throw new Error(`git merge-file ${mode} failed: ${r.stderr.toString()}`);
      return r.stdout;
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  };

  try {
    root = git("rev-parse", "--show-toplevel");
    // Relative to `root` (every git call runs there) in a plain checkout, absolute in a linked worktree.
    const gitPath = git("rev-parse", "--git-path", STATE);
    const statePath = isAbsolute(gitPath) ? gitPath : join(root, gitPath);
    const saveState = (s) => writeFileSync(statePath, `${JSON.stringify(s, null, 2)}\n`);
    const branch = gitRaw(["symbolic-ref", "-q", "--short", "HEAD"], { ok: [0, 1] })
      .stdout.toString()
      .trim();
    if (branch === "") throw new Stop(1, ["refusing: HEAD is detached; check out the PR branch"]);
    if (branch === MAIN) throw new Stop(1, [`refusing: on ${MAIN}; run it on a PR branch`]);
    const merging = gitOk("rev-parse", "-q", "--verify", "MERGE_HEAD");
    /** Push the branch; false (with the reason logged) when the push fails. */
    const push = () => {
      log(`pushing ${branch}`);
      const r = gitRaw(["push", "-q", REMOTE, branch], { ok: "any" });
      if (r.status === 0) return true;
      log(`git push failed (${r.status}): ${r.stderr.toString().trim()}`);
      return false;
    };

    let state;
    if (!args.resume) {
      if (merging)
        throw new Stop(1, ["refusing: a merge is in progress; finish it with --continue, or `git merge --abort`"]);
      const dirty = git("status", "--porcelain", "--untracked-files=no");
      if (dirty !== "") throw new Stop(1, ["refusing: the working tree has changes to tracked files:", dirty]);
      log(`fetching ${REMOTE} ${MAIN}`);
      git("fetch", "-q", REMOTE, MAIN);
      const oldHead = git("rev-parse", "HEAD");
      const mainHead = git("rev-parse", REMOTE_MAIN);
      if (gitOk("merge-base", "--is-ancestor", mainHead, oldHead)) {
        let pushed = false;
        let pushFailed = false;
        if (args.push) {
          const remote = git("ls-remote", REMOTE, `refs/heads/${branch}`).split(/\s+/)[0] ?? "";
          if (remote === oldHead) log("not pushed (already up to date)");
          else if (push()) pushed = true;
          else pushFailed = true;
        }
        if (args.json) {
          out(JSON.stringify({ upToDate: true, head: oldHead, oldHead, scripted: [], hand: [], pushed, focus: null }));
        } else {
          out(`up to date: ${branch} already contains ${REMOTE_MAIN} (${mainHead})`);
          out(`head: ${oldHead}`);
        }
        return pushFailed ? 1 : 0;
      }
      const base = git("merge-base", oldHead, mainHead);
      log(`merging ${REMOTE_MAIN} (${mainHead}) into ${branch} (${oldHead})`);
      // By name, so git's default message reads "Merge remote-tracking branch 'origin/main' into …".
      const m = gitRaw(["merge", "--no-ff", "--no-commit", REMOTE_MAIN], { ok: [0, 1] });
      if (!gitOk("rev-parse", "-q", "--verify", "MERGE_HEAD")) {
        throw new Error(`git merge did not start: ${m.stderr.toString().trim() || m.stdout.toString().trim()}`);
      }
      if (git("rev-parse", "MERGE_HEAD") !== mainHead)
        throw new Error(`${REMOTE_MAIN} moved during the merge; abort and rerun`);
      const paths = unmerged();
      // Recorded before any conflict is touched: until the loop resolves one, it counts as hand-resolved.
      state = {
        branch,
        oldHead,
        base,
        mainHead,
        scripted: [],
        hand: [...paths],
        push: args.push,
        exempt: args.exempt,
        recorded: true,
      };
      saveState(state);
      const sets = scriptableSets(showText(`${oldHead}:${ARTIFACTS_JSON}`), showText(`${mainHead}:${ARTIFACTS_JSON}`));
      const scripted = [];
      const hand = [];
      for (const path of paths) {
        const stages = [
          ...new Set(
            split0(git("ls-files", "-u", "-z", "--", path)).map((l) => Number(l.split("\t")[0].split(" ")[2])),
          ),
        ];
        let kind = classifyUnmerged(path, sets, stages);
        if (kind === "changelog" && diff3EditsBase(mergeStages(path, "--diff3").toString("utf8"))) kind = "conflict";
        if (kind === "generated") {
          if (stages.includes(3)) {
            git("checkout", "--theirs", "--", path);
            git("add", "--", path);
          } else {
            git("rm", "-q", "--", path);
          }
          scripted.push(path);
        } else if (kind === "changelog") {
          writeFileSync(join(root, path), mergeStages(path, "--union"));
          git("add", "--", path);
          scripted.push(path);
        } else {
          hand.push(path);
        }
      }
      state = { ...state, scripted, hand };
      saveState(state);
      for (const f of scripted) log(`resolved ${f} (${f === CHANGELOG ? "union of both sides" : "main's side"})`);
      if (hand.length > 0) throw new Stop(2, conflictLines(hand, sets.partial, continueHint(args)));
    } else {
      if (!merging) throw new Stop(1, ["--continue: no merge in progress (no MERGE_HEAD)"]);
      const left = unmerged();
      if (left.length > 0) {
        throw new Stop(2, ["--continue: still unmerged; resolve and `git add` them:", ...left.map((f) => `  ${f}`)]);
      }
      const unstaged = names("diff", "--name-only", "--no-renames");
      if (unstaged.length > 0) {
        throw new Stop(2, [
          "--continue: unstaged changes; `git add` (or restore) them:",
          ...unstaged.map((f) => `  ${f}`),
        ]);
      }
      const oldHead = git("rev-parse", "HEAD");
      const mainHead = git("rev-parse", "MERGE_HEAD");
      let saved = null;
      if (existsSync(statePath)) {
        try {
          saved = JSON.parse(readFileSync(statePath, "utf8"));
        } catch {
          saved = null;
        }
      }
      if (saved && saved.oldHead === oldHead && saved.mainHead === mainHead) {
        state = saved;
      } else {
        const sets = scriptableSets(
          showText(`${oldHead}:${ARTIFACTS_JSON}`),
          showText(`${mainHead}:${ARTIFACTS_JSON}`),
        );
        const fromOurs = new Set(names("diff", "--cached", "--name-only", "--no-renames", oldHead));
        const both = names("diff", "--cached", "--name-only", "--no-renames", mainHead).filter((f) => fromOurs.has(f));
        const hand = both.filter((f) => classifyUnmerged(f, sets) === "conflict");
        log(
          `no record of this merge in ${STATE}; counting as hand-resolved every file that differs from both ` +
            "parents (a conflict resolved to exactly one side's text is missed: name it to the red team)",
        );
        state = {
          branch,
          oldHead,
          base: git("merge-base", oldHead, mainHead),
          mainHead,
          scripted: [],
          hand,
          push: false,
          exempt: false,
          recorded: false,
        };
        saveState(state);
      }
      // The flags the sync was started with hold for its --continue too.
      args = { ...args, push: args.push || Boolean(state.push), exempt: args.exempt || Boolean(state.exempt) };
      const marked = state.hand.filter((f) => {
        const blob = show(`:${f}`);
        return blob !== null && CONFLICT_MARK.test(blob.toString("utf8"));
      });
      if (marked.length > 0) {
        throw new Stop(2, ["--continue: conflict markers are still staged in:", ...marked.map((f) => `  ${f}`)]);
      }
    }

    // ---- 4. regenerate ----
    const regenerated = [];
    if (args.gen) {
      const untrackedBefore = new Set(names("ls-files", "-o", "--exclude-standard"));
      log("npm run gen:all");
      if (!runGen(root)) throw new Error(`npm run gen:all failed; fix it, then \`${continueHint(args)}\``);
      const sets = artifactSets([
        showText(`${state.oldHead}:${ARTIFACTS_JSON}`),
        showText(`${state.mainHead}:${ARTIFACTS_JSON}`),
        existsSync(join(root, ARTIFACTS_JSON)) ? readFileSync(join(root, ARTIFACTS_JSON), "utf8") : null,
      ]);
      const newUntracked = names("ls-files", "-o", "--exclude-standard").filter((f) => !untrackedBefore.has(f));
      const changed = uniqSorted([...names("diff", "--name-only", "--no-renames"), ...newUntracked]);
      for (const f of changed) if (sets.artifacts.has(f)) regenerated.push(f);
      if (regenerated.length > 0) git("add", "--", ...regenerated);
      const stray = changed.filter((f) => !sets.artifacts.has(f));
      if (stray.length > 0)
        log(`gen:all also changed files that are not generated artifacts (left unstaged): ${stray.join(", ")}`);
    } else {
      log("--no-gen: generated artifacts were taken from main's side and NOT regenerated");
    }

    // ---- 5. CHANGELOG lines under [Unreleased] ----
    const diff = gitRaw([
      "diff",
      "--cached",
      "--no-color",
      "--no-ext-diff",
      "--unified=1000000",
      state.mainHead,
      "--",
      CHANGELOG,
    ]).stdout.toString("utf8");
    const cl = changelogVerdict(diff, { exempt: args.exempt });
    if (cl.code !== 0) {
      throw new Stop(2, [
        ...cl.out,
        "the merge is left uncommitted: move the branch's lines under `## [Unreleased]`, `git add CHANGELOG.md`,",
        `then \`${continueHint(args)}\`. A deliberate edit of released history (the PR is labelled`,
        "`changelog-exempt`) passes with `--changelog-exempt` instead.",
      ]);
    }
    for (const l of cl.out) log(l);

    // ---- 6. commit ----
    git("commit", "-q", "--no-edit");
    if (existsSync(statePath)) unlinkSync(statePath);
    const head = git("rev-parse", "HEAD");

    // ---- 7. the re-review focus ----
    const prFiles = names("diff", "--name-only", "--no-renames", state.base, state.oldHead);
    const mainFiles = names("diff", "--name-only", "--no-renames", state.base, state.mainHead);
    const sets = artifactSets([showText(`${head}:${ARTIFACTS_JSON}`), showText(`${state.oldHead}:${ARTIFACTS_JSON}`)]);
    const importCache = new Map();
    /** The repository paths `file` imports on the merged head (the working tree, just committed). */
    const importsOf = (file) => {
      if (!importCache.has(file)) {
        let found = [];
        const abs = join(root, file);
        if (CODE.test(file) && existsSync(abs)) {
          const text = readFileSync(abs, "utf8");
          found = [...text.matchAll(SPEC)].map((m) => resolveSpec(root, file, m[1])).filter((p) => p !== null);
        }
        importCache.set(file, found);
      }
      return importCache.get(file);
    };
    const exportsDiff = gitRaw([
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-renames",
      "-U0",
      state.base,
      state.mainHead,
      "--",
      "*.ts",
      "*.tsx",
      "*.mts",
      "*.mjs",
    ]).stdout.toString("utf8");
    const exportsChanged = changedExports(exportsDiff, (f) => isRegenerated(f, sets));
    const focus = {
      ...focusFiles({ prFiles, mainFiles, hand: state.hand, sets }),
      importLinked: importLinked({ prFiles, mainFiles, importsOf, sets }),
      changedExports: exportsChanged.declarations,
      changedExportBodies: exportsChanged.bodies,
    };

    // ---- 8. push, after the focus exists: a failed push still reports it ----
    const pushed = args.push ? push() : false;
    if (args.json) {
      out(
        JSON.stringify({
          upToDate: false,
          head,
          oldHead: state.oldHead,
          scripted: state.scripted,
          hand: uniqSorted(state.hand),
          pushed,
          focus: focusJson(focus),
        }),
      );
    } else {
      out(`merged ${REMOTE_MAIN} (${state.mainHead}) into ${state.branch} (was ${state.oldHead})`);
      for (const l of reportLines({ head, scripted: state.scripted, regenerated, focus })) out(l);
    }
    if (args.push && !pushed) {
      log(`the merge is committed (${head}) but not pushed; push it with \`git push ${REMOTE} ${branch}\``);
      return 1;
    }
    return 0;
  } catch (e) {
    if (e instanceof Stop) {
      for (const l of e.lines) err(`sync:main: ${l}`);
      return e.code;
    }
    err(`sync:main: error: ${e.message}`);
    return 1;
  }
}

const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) process.exit(main(process.argv.slice(2)));
