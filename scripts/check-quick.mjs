#!/usr/bin/env node
/**
 * `npm run check:quick` — the local pre-push check. GitHub CI is the full gate (`npm run check`,
 * every platform, e2e, 3D); this script only catches the cheap mistakes before a CI round trip,
 * and it must stay cheap: it never grows into the full suite.
 *
 * What it runs, all on the files this branch changed (against the merge base with origin/main,
 * plus uncommitted and untracked files):
 *   1. Biome on the changed files it can read.
 *   2. tsc: `tsconfig.json` (src) or `tsconfig.dev.json` (src + test/eval/dataset/scripts/bench),
 *      whichever the changes need, and `typecheck` in each changed workspace.
 *   3. `check:drift`, unless every change is a test file.
 *   4. The nearest tests: the changed test files, then the tests that import a changed file (or
 *      open a changed doc or data file by name; a `README.md` or `CHANGELOG.md` only by a path
 *      that resolves to it), nearest first by import distance, up to `--max` files (default 20).
 *      The cut is printed; CI runs the rest.
 *      When a change is under `examples/` or is a `docs/**\/*.md`, the directory-scanning guards for
 *      that folder come right after the changed test files and before the import-distance tests:
 *      a corpus digest or docs tripwire lists the folder and never names the file, so the import
 *      graph cannot reach it (five PRs went red that way on 2026-10-28). See `scanningGuards`.
 *      `--max` caps exactly that list: the branch's own changed test files, the directory-scanning
 *      guards and the import-distance tests, together and in that order. It does NOT cap the extras, four
 *      kinds of test the import graph ranks too far away, each under its own cap: the source-tree
 *      scanners a changed `src/`, `scripts/`, `eval/`, `test/` or `.claude/` file wakes (`treeGuards`;
 *      30 files at most: every one under 1 recorded second, then the others within 55), the tests named after a
 *      changed module (`namedTests`; at most 5 files and 35 recorded seconds), the text guards CI failed on in #848, each woken only by its own
 *      inputs (`textGuards`; no cap beyond the three files): `lint-fix-texts` by the error catalogue,
 *      `src/fix-producers.ts` or a `src/` module whose own text composes fix text (`composesFixText`), `opaque-literal-guard` by `.gitleaksignore`,
 *      a path it names, the IndexNow key or the catalogue, `docs-flags` by a page that test reads (deleted
 *      or renamed away too), both by a module they import; and, for a change under `src/`, the cheapest reachable tests
 *      that pin their output over the examples corpus (`corpusPins`; within `--pins` recorded seconds).
 *      All of it is in `scripts/gate-select.mjs`.
 *
 * Flags: `--base <ref>` (default origin/main), `--max <n>` (default 20), `--pins <secs>` (default 30),
 * `--fix` (let Biome write its fixes), `--no-drift`, `--no-tests`, `--list` (print the plan, run
 * nothing). One child process at a time. Exit code is the first failing step's.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { driftWanted, PIN_SECS as DEFAULT_PIN_SECS, planTests } from "./gate-select.mjs";
import { CODE, nearestTests as nearestTestsOf } from "./nearest-tests.mjs";
import { checkQuickWorkspaces } from "./workspaces.mjs";

// fileURLToPath decodes %20 etc., so a checkout under a path with spaces resolves correctly.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const MAX = Number(opt("--max", "20"));
const PIN_SECS = Number(opt("--pins", String(DEFAULT_PIN_SECS)));
const BASE = opt("--base", "origin/main");
const LIST = flag("--list");

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const lines = (s) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// ---- 1. what changed -------------------------------------------------------------------------
let mergeBase;
try {
  mergeBase = git("merge-base", "HEAD", BASE);
} catch {
  console.error(`check:quick: cannot find a merge base with ${BASE}; pass --base <ref>.`);
  process.exit(2);
}
const changed = [
  ...new Set([
    ...lines(git("diff", "--name-only", "--diff-filter=d", mergeBase)),
    ...lines(git("ls-files", "--others", "--exclude-standard")),
  ]),
]
  .map((f) => f.replace(/\\/g, "/"))
  .filter((f) => existsSync(join(ROOT, f)) && !f.startsWith(".claude/worktrees/"));
// The paths the branch deleted or renamed away (`--no-renames` splits a rename into a deletion and an
// addition): nothing can run or lint them, but a text guard that names one must still wake.
const gone = lines(git("diff", "--name-only", "--no-renames", "--diff-filter=D", mergeBase))
  .map((f) => f.replace(/\\/g, "/"))
  .filter((f) => !existsSync(join(ROOT, f)) && !f.startsWith(".claude/worktrees/"));

if (changed.length === 0 && gone.length === 0) {
  console.log(`check:quick: nothing changed against ${BASE}.`);
  process.exit(0);
}

const LINTABLE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|jsonc|css)$/;

const WORKSPACES = checkQuickWorkspaces(ROOT); // package.json `workspaces`, scripts/workspaces.mjs
const DEV_ROOTS = /^(test|eval|dataset|scripts|bench)\//;

// ---- 2. the import graph, for the nearest tests ----------------------------------------------
// `scripts/nearest-tests.mjs` (shared with the nightly mutant sampler, `scripts/mutants.mjs`).

// ---- 2b. the guards the import graph cannot reach --------------------------------------------
// `scripts/gate-select.mjs`: directory-scanning guards, source-tree scanners, tests named after a changed
// module, corpus pins, the text guards (uncapped, each on its own inputs), and the list `planTests`
// builds from them.

// ---- 3. the plan -----------------------------------------------------------------------------
const steps = [];
const lintFiles = changed.filter((f) => LINTABLE.test(f));
// One command line per chunk of files whose names total under 6000 characters: cmd.exe refuses a command
// line past 8191 characters, which a large branch (400 changed files) exceeds.
const BIOME_CHUNK_CHARS = 6000;
const biomeChunks = [];
for (const f of lintFiles) {
  const last = biomeChunks[biomeChunks.length - 1];
  if (last && last.join(" ").length + f.length + 1 < BIOME_CHUNK_CHARS) last.push(f);
  else biomeChunks.push([f]);
}
let biomeDone = 0;
for (const chunk of biomeChunks) {
  steps.push({
    name: `biome (${chunk.length} files${biomeChunks.length > 1 ? `, ${biomeDone + 1}-${biomeDone + chunk.length} of ${lintFiles.length}` : ""})`,
    cmd: "npx",
    // `--no-errors-on-unmatched`: a chunk made only of files `biome.jsonc` excludes (a generated
    // `src/context-size.ts` alone) is "No files were processed", an error; there is nothing to lint.
    args: ["biome", "check", "--no-errors-on-unmatched", ...(flag("--fix") ? ["--write"] : []), ...chunk],
  });
  biomeDone += chunk.length;
}

const codeChanged = changed.filter((f) => CODE.test(f));
if (codeChanged.some((f) => DEV_ROOTS.test(f))) {
  steps.push({
    name: "tsc (src + test, eval, dataset, scripts, bench)",
    cmd: "npx",
    args: ["tsc", "-p", "tsconfig.dev.json", "--noEmit"],
  });
} else if (codeChanged.some((f) => f.startsWith("src/"))) {
  steps.push({ name: "tsc (src)", cmd: "npx", args: ["tsc", "--noEmit"] });
}
for (const ws of WORKSPACES) {
  if (codeChanged.some((f) => f.startsWith(`${ws}/`))) {
    steps.push({ name: `typecheck ${ws}`, cmd: "npm", args: ["-w", ws, "run", "typecheck"] });
  }
}

if (!flag("--no-drift") && driftWanted([...changed, ...gone])) {
  steps.push({ name: "check:drift", cmd: "npm", args: ["run", "-s", "check:drift"] });
}

let cutNote = "";
const guardNotes = [];
const EXTRA_LABELS = {
  treeGuards: "source-tree scanners",
  namedTests: "tests named after a changed module",
  textGuards:
    "text guards woken by their own inputs (catalogue, fix-text modules, .gitleaksignore paths, docs-flags pages)",
  corpusPins: `corpus pins reachable from src/ (within ${PIN_SECS}s of recorded time)`,
};
if (!flag("--no-tests")) {
  const files = lines(git("ls-files", "--cached", "--others", "--exclude-standard")).map((f) => f.replace(/\\/g, "/"));
  const related = nearestTestsOf(ROOT, changed);
  // `planTests` (`scripts/gate-select.mjs`): the capped list (the branch's own changed test files, the
  // directory-scanning guards, the nearest tests), then the extras the import graph ranks too far away.
  const { own, woken, guards, guardPick, extras, picked, total } = planTests({
    ROOT,
    changed,
    files,
    related,
    gone,
    max: MAX,
    pinSecs: PIN_SECS,
  });
  if (total > picked.length) {
    cutNote = `ran ${picked.length} of ${total} related tests; CI runs the rest`;
  }
  if (woken.length > 0) {
    guardNotes.push(
      `directory-scanning guards for ${woken.map((s) => s.why).join(" and ")}: ` +
        `${guardPick.length} of ${guards.length} take ${guardPick.length} of the ${MAX} slots` +
        (own.length > 0 ? ` (after ${own.length} changed test file${own.length === 1 ? "" : "s"})` : ""),
      ...guardPick.map((g) => `    + ${g.file} (${g.why})`),
    );
  }
  for (const [rule, label] of Object.entries(EXTRA_LABELS)) {
    const list = extras.filter((e) => e.rule === rule);
    if (list.length > 0) {
      guardNotes.push(
        `${label}: ${list.length} beyond the ${MAX}-file cap`,
        ...list.map((g) => `    + ${g.file} (${g.why})`),
      );
    }
  }
  if (picked.length > 0) {
    steps.push({
      name: `vitest (${picked.length} files)`,
      cmd: "npx",
      args: ["vitest", "run", "--poolOptions.forks.maxForks=2", "--poolOptions.forks.minForks=1", ...picked],
      // A quarter of every property's runs: the nearest-tests pass is a smoke, CI runs the full counts.
      env: { FC_SCALE: process.env.FC_SCALE ?? "0.25" },
    });
  }
}

console.log(`check:quick: ${changed.length} changed files against ${BASE} (${mergeBase.slice(0, 8)})`);
for (const s of steps) console.log(`  - ${s.name}`);
if (steps.some((s) => s.name === "check:drift")) {
  // Two things that make a green drift step a false green: files the generators cannot see, and a stale base.
  const untracked = lines(git("ls-files", "--others", "--exclude-standard")).filter(
    (f) => !f.startsWith(".claude/worktrees/"),
  );
  if (untracked.length > 0) {
    console.log(
      `  (${untracked.length} untracked file${untracked.length === 1 ? "" : "s"}, e.g. ${untracked[0]}: the generators that read ` +
        "`git ls-files` (module-map, test-index) cannot see them; `git add` them before trusting check:drift)",
    );
  }
  let behind = 0;
  try {
    behind = Number(git("rev-list", "--count", `HEAD..${BASE}`));
  } catch {}
  if (behind > 0) {
    console.log(
      `  (${behind} commit${behind === 1 ? "" : "s"} behind ${BASE}: CI checks the merge, and module-map counts the whole tree; ` +
        "`npm run sync:main` if drift is red there)",
    );
  }
}
if (cutNote) console.log(`  (${cutNote})`);
for (const note of guardNotes) console.log(`  ${note}`);
if (LIST) {
  const t = steps.find((s) => s.name.startsWith("vitest"));
  if (t) for (const f of t.args.filter((a) => a.endsWith(".test.ts"))) console.log(`      ${f}`);
  process.exit(0);
}

// ---- 4. run ----------------------------------------------------------------------------------
const started = Date.now();
for (const s of steps) {
  const t0 = Date.now();
  console.log(`\n▶ ${s.name}`);
  const r = spawnSync(s.cmd, s.args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...s.env },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`\n✗ check:quick: ${s.name} failed (${secs}s). Fix it before pushing.`);
    process.exit(r.status ?? 1);
  }
  console.log(`✓ ${s.name} (${secs}s)`);
}
console.log(
  `\n✓ check:quick passed in ${((Date.now() - started) / 1000).toFixed(1)}s.` +
    `${cutNote ? ` Note: ${cutNote}.` : ""} Push; GitHub CI is the full gate.`,
);
