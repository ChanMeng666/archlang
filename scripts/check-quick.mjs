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

// ---- 2b. the directory-scanning guards -------------------------------------------------------
// A folder whose files a suite LISTS rather than names. `touches` says which changed path wakes them.
const SCANNED_DIRS = [
  { dir: "examples", why: "an examples/ change", touches: (f) => f.startsWith("examples/") },
  { dir: "docs", why: "a docs/**/*.md change", touches: (f) => f.startsWith("docs/") && f.endsWith(".md") },
];
const LISTS_A_DIR = /\b(?:readdirSync|readdir|opendirSync|globSync)\s*\(/;
/** A test that pins what it reads (a snapshot, a digest, a baseline or a `tables/` row) moves on ANY edit. */
const PINS = /toMatch(?:Inline|File)?Snapshot\(|createHash\(|\bdigest|baseline|\btables\//i;

/** The scanned folders a module's text lists: a directory call plus a quoted folder literal for it. */
function listedDirs(text) {
  const dirs = new Set();
  if (!LISTS_A_DIR.test(text)) return dirs;
  for (const m of text.matchAll(QUOTED)) {
    const segs = m[1]
      .replace(/^(?:\.\.?\/)+/, "")
      .replace(/\/$/, "")
      .split("/");
    // A folder (`"examples"`, `"../examples"`, `"docs/agents"`), never a file (`"examples/studio.arch"`).
    if (SCANNED_DIRS.some((s) => s.dir === segs[0]) && !segs[segs.length - 1].includes(".")) dirs.add(segs[0]);
  }
  return dirs;
}

/**
 * The tests that list one of `dirs`, themselves or through a test-folder helper they import
 * (transitively): a test file whose source calls `readdirSync(`/`readdir(`/`opendirSync(`/`globSync(`
 * and quotes the folder. Ordered: tests that pin what they read first, then by the duration CI
 * recorded (`test/.durations.json`, cheapest first, so the cap buys the most guards), then by name.
 * Each is `{ file, why }`.
 */
function scanningGuards(dirs) {
  const modules = lines(git("ls-files", "--cached", "--others", "--exclude-standard"))
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => TEST_DIRS.test(f) && CODE.test(f) && existsSync(join(ROOT, f)));
  const text = new Map(modules.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
  const direct = new Map(modules.map((f) => [f, listedDirs(text.get(f))]));
  const durations = (() => {
    try {
      return JSON.parse(readFileSync(join(ROOT, "test", ".durations.json"), "utf8"));
    } catch {
      return {};
    }
  })();
  const guards = [];
  for (const t of modules.filter(isTest)) {
    // Breadth-first over the helpers it imports; a test file is never a helper.
    const reached = new Map([[t, t]]);
    let frontier = [t];
    while (frontier.length > 0) {
      const next = [];
      for (const f of frontier) {
        for (const m of text.get(f).matchAll(SPEC)) {
          const dep = resolveSpec(f, m[1]);
          if (dep && direct.has(dep) && !isTest(dep) && !reached.has(dep)) {
            reached.set(dep, f);
            next.push(dep);
          }
        }
      }
      frontier = next;
    }
    const hit = [...reached.keys()].find((f) => dirs.some((d) => direct.get(f).has(d)));
    if (!hit) continue;
    const listed = dirs.filter((d) => [...reached.keys()].some((f) => direct.get(f).has(d)));
    const pins = PINS.test(text.get(t));
    const why = `lists ${listed.map((d) => `${d}/`).join(" and ")}${hit === t ? "" : ` via ${hit}`}${pins ? ", pins its output" : ""}`;
    guards.push({ file: t, why, pins, secs: durations[t] ?? Number.POSITIVE_INFINITY });
  }
  return guards.sort((a, b) => Number(b.pins) - Number(a.pins) || a.secs - b.secs || (a.file < b.file ? -1 : 1));
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
const guardNotes = [];
if (!flag("--no-tests")) {
  const related = nearestTests();
  // The order: the branch's own changed test files, then the directory-scanning guards the change
  // wakes (they take every slot left before the import-distance tests), then the nearest tests.
  const own = related.filter((f) => changed.includes(f));
  const woken = SCANNED_DIRS.filter((s) => changed.some(s.touches));
  const guards = woken.length > 0 ? scanningGuards(woken.map((s) => s.dir)).filter((g) => !own.includes(g.file)) : [];
  const guardPick = guards.slice(0, Math.max(0, MAX - own.length));
  const rest = related.filter((f) => !own.includes(f) && !guardPick.some((g) => g.file === f));
  const picked = [...own, ...guardPick.map((g) => g.file), ...rest].slice(0, MAX);
  const total = new Set([...related, ...guards.map((g) => g.file)]).size;
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
