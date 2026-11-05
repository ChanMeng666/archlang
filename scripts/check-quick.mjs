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
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

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

const TEST_DIRS = /^(test|playground\/test|packages\/[^/]+\/test|editors\/vscode\/test)\//;
const isTest = (f) => TEST_DIRS.test(f) && f.endsWith(".test.ts");
const isTestDirFile = (f) => TEST_DIRS.test(f);
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
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
// Static and regex-based on purpose: it only RANKS tests for a local run, CI runs them all.
const ALIAS = {
  archlang: "src/index.ts",
  "@chanmeng666/archlang": "src/index.ts",
  "@chanmeng666/archlang/link": "src/cli/link.ts",
};
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function resolveSpec(fromFile, spec) {
  if (ALIAS[spec]) return ALIAS[spec];
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  const stem = base.replace(/\.(js|mjs|cjs|ts)$/, "");
  for (const cand of [
    base,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}.mts`,
    `${stem}.mjs`,
    `${stem}.js`,
    `${base}/index.ts`,
  ]) {
    if (existsSync(join(ROOT, cand))) return cand;
  }
  return null;
}

/** The folder of the nearest `package.json` above `file` ("" for the repository root). */
function workspaceOf(file) {
  let dir = posix.dirname(file);
  while (dir !== "." && dir !== "") {
    if (existsSync(join(ROOT, dir, "package.json"))) return dir;
    dir = posix.dirname(dir);
  }
  return "";
}

/** A single- or double-quoted literal with no space in it: a path a test may open. */
const QUOTED = /["']([^"'\s]+)["']/g;

/**
 * Whether test `t` reads the changed file `f` whose name (`README.md`, `CHANGELOG.md`, …) is too
 * common to match on alone. A quoted literal ending in the name counts when it resolves to `f`: a
 * `./`/`../` path from the test's folder, any other path from the repository root, and a bare name
 * when `f` sits at the root of the test's own workspace (a `join(ROOT, "README.md")`).
 */
function readsGeneric(t, text, f, name) {
  // Plain quotes only: a name in backticks is a comment's, not a path the test opens.
  for (const m of text.matchAll(QUOTED)) {
    const p = m[1];
    if (p !== name && !p.endsWith(`/${name}`)) continue;
    if (p === name) {
      const ws = workspaceOf(t);
      if (f === (ws ? `${ws}/${name}` : name)) return true;
    } else if (p.startsWith("./") || p.startsWith("../")) {
      if (posix.normalize(posix.join(posix.dirname(t), p)) === f) return true;
    } else if (posix.normalize(p.replace(/^\//, "")) === f) {
      return true;
    }
  }
  return false;
}

function nearestTests() {
  const tracked = lines(git("ls-files", "--cached", "--others", "--exclude-standard"))
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => CODE.test(f) && !f.includes("node_modules/") && !f.startsWith(".claude/"));
  const importers = new Map(); // file -> files that import it
  for (const f of tracked) {
    let text;
    try {
      text = readFileSync(join(ROOT, f), "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(SPEC)) {
      const target = resolveSpec(f, m[1]);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(f);
    }
  }
  // A test that reads a changed non-code file (a doc, an example, AGENTS.md) names it rather than
  // importing it: a test with a string literal ending in the file's name counts as one import away
  // (a mention in a comment does not).
  const testTexts = tracked.filter(isTest).map((t) => [t, readFileSync(join(ROOT, t), "utf8")]);
  // A name too common to say which file a test reads (every package has a README.md) counts only
  // when the test's literal resolves to the changed file itself: see `readsGeneric`.
  const GENERIC = new Set(["package.json", "package-lock.json", "README.md", "CHANGELOG.md", "tsconfig.json"]);
  for (const f of changed) {
    if (CODE.test(f)) continue;
    const name = posix.basename(f);
    const generic = GENERIC.has(name);
    for (const [t, text] of testTexts) {
      if (generic ? readsGeneric(t, text, f, name) : text.includes(`${name}"`) || text.includes(`${name}'`)) {
        if (!importers.has(f)) importers.set(f, new Set());
        importers.get(f).add(t);
      }
    }
  }
  // Breadth-first from the changed files: a test's distance is how many imports away it sits.
  const order = [];
  const seen = new Set();
  let frontier = [];
  for (const f of changed) {
    seen.add(f);
    if (isTest(f)) order.push(f);
    frontier.push(f);
  }
  while (frontier.length > 0) {
    const next = [];
    for (const f of frontier.sort()) {
      for (const imp of [...(importers.get(f) ?? [])].sort()) {
        if (seen.has(imp)) continue;
        seen.add(imp);
        if (isTest(imp)) order.push(imp);
        next.push(imp);
      }
    }
    frontier = next;
  }
  return order;
}

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
  const related = nearestTests();
  const picked = related.slice(0, MAX);
  if (related.length > picked.length) {
    cutNote = `ran the ${picked.length} nearest of ${related.length} related tests; CI runs the rest`;
  }
  if (picked.length > 0) {
    steps.push({
      name: `vitest (${picked.length} files)`,
      cmd: "npx",
      args: ["vitest", "run", "--poolOptions.forks.maxForks=2", "--poolOptions.forks.minForks=1", ...picked],
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
  const r = spawnSync(s.cmd, s.args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
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
