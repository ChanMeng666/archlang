/**
 * The nearest tests to a set of changed files, by import distance: the graph `check:quick`
 * (`scripts/check-quick.mjs`) runs its local test pass on, shared with the nightly mutant sampler
 * (`scripts/mutants.mjs`), which runs the nearest tests of the one file it mutated. Zero
 * dependencies, plain Node; it only reads files and `git ls-files`.
 *
 * `nearestTests(ROOT, changed)` returns the changed test files, then the tests that import a changed
 * file (or open a changed doc or data file by name; a `README.md` or `CHANGELOG.md` only by a path
 * that resolves to it), nearest first by import distance. The caller cuts the list.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

export const TEST_DIRS = /^(test|playground\/test|packages\/[^/]+\/test|editors\/vscode\/test)\//;
export const isTest = (f) => TEST_DIRS.test(f) && f.endsWith(".test.ts");
export const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

const git = (ROOT, ...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const lines = (s) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// Static and regex-based on purpose: it only RANKS tests for a local run, CI runs them all.
const ALIAS = {
  archlang: "src/index.ts",
  "@chanmeng666/archlang": "src/index.ts",
  "@chanmeng666/archlang/link": "src/cli/link.ts",
};
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function resolveSpec(ROOT, fromFile, spec) {
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
function workspaceOf(ROOT, file) {
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
function readsGeneric(ROOT, t, text, f, name) {
  // Plain quotes only: a name in backticks is a comment's, not a path the test opens.
  for (const m of text.matchAll(QUOTED)) {
    const p = m[1];
    if (p !== name && !p.endsWith(`/${name}`)) continue;
    if (p === name) {
      const ws = workspaceOf(ROOT, t);
      if (f === (ws ? `${ws}/${name}` : name)) return true;
    } else if (p.startsWith("./") || p.startsWith("../")) {
      if (posix.normalize(posix.join(posix.dirname(t), p)) === f) return true;
    } else if (posix.normalize(p.replace(/^\//, "")) === f) {
      return true;
    }
  }
  return false;
}

export function nearestTests(ROOT, changed) {
  const tracked = lines(git(ROOT, "ls-files", "--cached", "--others", "--exclude-standard"))
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
      const target = resolveSpec(ROOT, f, m[1]);
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
      if (generic ? readsGeneric(ROOT, t, text, f, name) : text.includes(`${name}"`) || text.includes(`${name}'`)) {
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
