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
 *
 * Flags: `--base <ref>` (default origin/main), `--max <n>`, `--fix` (let Biome write its fixes),
 * `--no-drift`, `--no-tests`, `--list`
 * (print the plan, run nothing). Exit code is the first failing step's.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CODE, nearestTests as nearestTestsOf, TEST_DIRS } from "./nearest-tests.mjs";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const MAX = Number(opt("--max", "20"));
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

const isTestDirFile = (f) => TEST_DIRS.test(f);
const LINTABLE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|jsonc|css)$/;

const WORKSPACES = [
  "playground",
  "docs-site",
  "packages/mcp",
  "packages/mcp-worker",
  "packages/web-component",
  "packages/archlang-3d",
  "editors/vscode",
];
const DEV_ROOTS = /^(test|eval|dataset|scripts|bench)\//;

// ---- 2. the import graph, for the nearest tests ----------------------------------------------
// `scripts/nearest-tests.mjs` (shared with the nightly mutant sampler, `scripts/mutants.mjs`).

// ---- 3. the plan -----------------------------------------------------------------------------
const steps = [];
const lintFiles = changed.filter((f) => LINTABLE.test(f));
if (lintFiles.length > 0) {
  steps.push({
    name: `biome (${lintFiles.length} files)`,
    cmd: "npx",
    args: ["biome", "check", ...(flag("--fix") ? ["--write"] : []), ...lintFiles],
  });
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

if (!flag("--no-drift") && !changed.every(isTestDirFile)) {
  steps.push({ name: "check:drift", cmd: "npm", args: ["run", "-s", "check:drift"] });
}

let cutNote = "";
if (!flag("--no-tests")) {
  const related = nearestTestsOf(ROOT, changed);
  const picked = related.slice(0, MAX);
  if (related.length > picked.length) {
    cutNote = `ran the ${picked.length} nearest of ${related.length} related tests; CI runs the rest`;
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
if (cutNote) console.log(`  (${cutNote})`);
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
