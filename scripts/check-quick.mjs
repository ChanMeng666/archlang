#!/usr/bin/env node
/**
 * `npm run check:quick` — the local pre-push check. GitHub CI is the full gate (`npm run check`,
 * every platform, e2e, 3D); this script only catches the cheap mistakes before a CI round trip,
 * and it must stay cheap: it never grows into the full suite.
 *
 * What it runs, all on the files this branch changed (against the merge base with origin/main,
 * plus uncommitted and untracked files):
 *   1. Biome on the changed files it can read.
 *   2. The typecheck the changes need. A change that can break what the per-file steps do not compile
 *      (a `package.json` or the lockfile, `tsup.config.ts`, a tsconfig, or a `src/` diff that adds or removes
 *      an export or a type member) runs
 *      `typecheck:all` (CI's "Type-check every workspace": the dev config plus every workspace) on a
 *      `dist/` built first if it is missing or older than its sources. Otherwise `tsconfig.json` (src) or
 *      `tsconfig.dev.json` (src + test/eval/dataset/scripts/bench), whichever the changes need, and
 *      `typecheck` in each changed workspace.
 *   3. `check:drift`, unless every change is a test file.
 *   4. The nearest tests: the changed test files, then the tests that import a changed file (or
 *      open a changed doc or data file by name; a `README.md` or `CHANGELOG.md` only by a path
 *      that resolves to it), nearest first by import distance, up to `--max` files (default 20).
 *      The cut is printed; CI runs the rest.
 *      When a change is under `examples/` or is a `docs/**\/*.md`, the directory-scanning guards for
 *      that folder come right after the changed test files and before the import-distance tests:
 *      a corpus digest or docs tripwire lists the folder and never names the file, so the import
 *      graph cannot reach it (five PRs went red that way on 2026-10-28). See `scanningGuards`.
 *      Outside that cap, three more kinds of test that the import graph ranks too far away run:
 *      the source-tree scanners a changed `src/`, `scripts/`, `eval/`, `test/` or `.claude/` file wakes
 *      (`treeGuards`), the tests named after a changed module (`namedTests`), and, for a change under
 *      `src/`, the cheapest reachable tests that pin their output over the examples corpus within
 *      `--pins` recorded seconds (`corpusPins`). All of it is in `scripts/gate-select.mjs`.
 *
 * Flags: `--base <ref>` (default origin/main), `--max <n>`, `--pins <secs>` (default 20), `--fix` (let
 * Biome write its fixes), `--no-drift`, `--no-typecheck-all`, `--no-tests`, `--list` (print the plan,
 * run nothing). One child process at a time. Exit code is the first failing step's.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  corpusPins,
  driftWanted,
  namedTests,
  readDurations,
  SCANNED_DIRS,
  scanningGuards,
  treeGuards,
  typecheckAllWanted,
} from "./gate-select.mjs";
import { CODE, nearestTests as nearestTestsOf } from "./nearest-tests.mjs";
import { checkQuickWorkspaces } from "./workspaces.mjs";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const MAX = Number(opt("--max", "20"));
const PIN_SECS = Number(opt("--pins", "20"));
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

if (changed.length === 0) {
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
// module, corpus pins, and which deterministic CI steps (`check:drift`, `typecheck:all`) a change set needs.

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
    args: ["biome", "check", ...(flag("--fix") ? ["--write"] : []), ...chunk],
  });
  biomeDone += chunk.length;
}

const codeChanged = changed.filter((f) => CODE.test(f));
/** Whether `dist/` is missing or older than the sources it is built from (what the workspaces typecheck against). */
function distStale() {
  const built = statSync(join(ROOT, "dist", "index.d.ts"), { throwIfNoEntry: false })?.mtimeMs;
  if (built === undefined) return true;
  let newest = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else newest = Math.max(newest, statSync(join(dir, e.name)).mtimeMs);
    }
  };
  walk(join(ROOT, "src"));
  for (const f of ["tsup.config.ts", "package.json", "tsconfig.json"]) {
    newest = Math.max(newest, statSync(join(ROOT, f), { throwIfNoEntry: false })?.mtimeMs ?? 0);
  }
  return newest > built;
}
/** The `src/` diff `typecheckAllWanted` reads: tracked changes as `git diff -U0`, untracked files as all-added lines. */
function srcDiff() {
  const added = lines(git("ls-files", "--others", "--exclude-standard", "--", "src")).flatMap((f) =>
    readFileSync(join(ROOT, f), "utf8")
      .split("\n")
      .map((l) => `+${l}`),
  );
  return `${git("diff", "-U0", mergeBase, "--", "src")}\n${added.join("\n")}`;
}
if (!flag("--no-typecheck-all") && typecheckAllWanted(changed, srcDiff())) {
  // `typecheck:all` compiles everything the steps below would (the dev config, every workspace), against `dist/`.
  if (distStale()) steps.push({ name: "build (dist/ for typecheck:all)", cmd: "npm", args: ["run", "-s", "build"] });
  steps.push({
    name: "typecheck:all (dev config + every workspace)",
    cmd: "npm",
    args: ["run", "-s", "typecheck:all"],
  });
} else {
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
}

if (!flag("--no-drift") && driftWanted(changed)) {
  steps.push({ name: "check:drift", cmd: "npm", args: ["run", "-s", "check:drift"] });
}

let cutNote = "";
const guardNotes = [];
if (!flag("--no-tests")) {
  const files = lines(git("ls-files", "--cached", "--others", "--exclude-standard")).map((f) => f.replace(/\\/g, "/"));
  const related = nearestTestsOf(ROOT, changed);
  // The order: the branch's own changed test files, then the directory-scanning guards the change
  // wakes (they take every slot left before the import-distance tests), then the nearest tests.
  const own = related.filter((f) => changed.includes(f));
  const woken = SCANNED_DIRS.filter((s) => changed.some(s.touches));
  const guards =
    woken.length > 0
      ? scanningGuards(
          ROOT,
          woken.map((s) => s.dir),
          files,
        ).filter((g) => !own.includes(g.file))
      : [];
  const guardPick = guards.slice(0, Math.max(0, MAX - own.length));
  // Outside the cap: what the import graph ranks too far away (`scripts/gate-select.mjs`).
  const taken = new Set([...own, ...guardPick.map((g) => g.file)]);
  const extras = [];
  const addExtras = (label, list) => {
    const fresh = list.filter((g) => !taken.has(g.file) && !extras.some((e) => e.file === g.file));
    extras.push(...fresh);
    if (fresh.length > 0) {
      guardNotes.push(
        `${label}: ${fresh.length} beyond the ${MAX}-file cap`,
        ...fresh.map((g) => `    + ${g.file} (${g.why})`),
      );
    }
  };
  addExtras("source-tree scanners", treeGuards(ROOT, changed, files));
  addExtras("tests named after a changed module", namedTests(changed, files));
  if (changed.some((f) => f.startsWith("src/") && CODE.test(f))) {
    const pins = corpusPins(scanningGuards(ROOT, ["examples"], files), related, PIN_SECS, readDurations(ROOT));
    addExtras(`corpus pins reachable from src/ (within ${PIN_SECS}s of recorded time)`, pins);
  }
  const extraSet = new Set(extras.map((g) => g.file));
  const rest = related.filter((f) => !taken.has(f) && !extraSet.has(f));
  const room = Math.max(0, MAX - own.length - guardPick.length);
  const picked = [...own, ...extras.map((g) => g.file), ...guardPick.map((g) => g.file), ...rest.slice(0, room)];
  const total = new Set([...related, ...guards.map((g) => g.file), ...extraSet]).size;
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
