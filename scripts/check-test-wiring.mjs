#!/usr/bin/env node
/**
 * Wiring gate for the test suite: every tracked `*.test.ts` must be RUN by vitest.
 *
 * `vitest.config.ts` selects the suite with an explicit `test.include` list — four
 * globs over `test/`, `playground/test/`, every `packages/<name>/test/` and
 * `editors/vscode/test/`. A `*.test.ts` written anywhere else is not an error, not
 * a skip and not a warning: vitest simply never sees it. The file typechecks, it
 * lints, it sits in the diff looking exactly like coverage, and `npm test` still
 * reports green — a green that now means less than it did, silently. (AGENTS.md
 * states the hazard in its own words: "the include list is in `vitest.config.ts`;
 * a test outside it silently never runs.")
 *
 * So: enumerate every tracked `*.test.ts`, match it against the include globs
 * PARSED OUT OF `vitest.config.ts`, and fail on anything the suite would skip.
 * The reverse is checked too — an include glob matching nothing is the same fault
 * seen from the other end (rename `packages/mcp/test/` to `tests/` and a whole
 * tree stops running while this file's own list still looks plausible).
 *
 * Two deliberate mechanics:
 *
 *   1. The globs are EXTRACTED from vitest.config.ts, never retyped. A guard
 *      carrying its own copy of the include list is the stale-template failure mode
 *      CLAUDE.md warns about — it would keep validating against yesterday's config
 *      forever, and would go on passing on the very day someone narrowed the real
 *      one. If the extraction fails, this script exits 1 rather than falling back
 *      to a built-in list: a guard that cannot read its source of truth must be
 *      loud, not helpful.
 *   2. Candidates come from `git ls-files`, not a recursive readdir. The repo
 *      carries `node_modules` in every workspace and `.claude/worktrees/agent-*`
 *      holds whole checkouts with their own `test/` trees; a walk trips on all of
 *      them. The index is the definition of "a file this repo ships" anyway, which
 *      is what `test/docs-fences.test.ts` and `test/docs-table-pipes.test.ts`
 *      already rely on.
 *
 * Zero dependencies, plain node. Usage: node scripts/check-test-wiring.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, ".."); // scripts/ → repo root
const CONFIG = "vitest.config.ts";

/** Abort with a message on stderr — used for every "the guard itself is broken" path. */
function fatal(message) {
  console.error(`check-test-wiring: ${message}`);
  process.exit(1);
}

/**
 * The `test.include` globs, EXTRACTED from vitest.config.ts rather than retyped.
 * Scans from the `test:` block's `include:` key to its closing bracket and reads the
 * string literals inside; anything unexpected is a hard failure, never a fallback.
 */
function includeGlobs() {
  let source;
  try {
    source = readFileSync(join(repo, CONFIG), "utf8");
  } catch (err) {
    return fatal(`cannot read ${CONFIG} — ${err.message}`);
  }
  const testBlock = source.indexOf("test:");
  if (testBlock === -1) fatal(`no \`test:\` block found in ${CONFIG} — has the config been restructured?`);
  const key = source.indexOf("include:", testBlock);
  if (key === -1)
    fatal(`no \`include:\` key inside the \`test:\` block of ${CONFIG} — has the config been restructured?`);
  const open = source.indexOf("[", key);
  const close = source.indexOf("]", open);
  if (open === -1 || close === -1)
    fatal(`\`include:\` in ${CONFIG} is not a bracketed array literal — cannot extract it`);
  const globs = [...source.slice(open, close).matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
  if (globs.length === 0) fatal(`extracted an EMPTY include list from ${CONFIG} — refusing to check against nothing`);
  return globs;
}

/**
 * A glob → anchored RegExp, covering the subset the config uses: a double star
 * spanning any number of path segments INCLUDING ZERO (so the `test/` glob matches
 * a file sitting directly in `test/`, not only one nested a level down — 100+ of
 * them do), a single star inside one segment, and `?` for one character.
 */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        out += "(?:[^/]+/)*"; // `**/` — zero or more whole segments
      } else {
        out += ".*"; // trailing `**`
      }
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Every `*.test.ts` git tracks, repo-relative with forward slashes. */
function trackedTests() {
  const out = execFileSync("git", ["ls-files", "-z", "--", "*.test.ts"], { cwd: repo, encoding: "utf8" });
  return out
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .sort();
}

const globs = includeGlobs();
const matchers = globs.map((glob) => ({ glob, re: globToRegExp(glob), hits: 0 }));
const tests = trackedTests();

if (tests.length === 0) {
  fatal('`git ls-files -- "*.test.ts"` returned nothing — is this a git checkout?');
}

const orphans = [];
for (const file of tests) {
  const matched = matchers.filter((m) => m.re.test(file));
  if (matched.length === 0) orphans.push(file);
  for (const m of matched) m.hits++;
}

const deadGlobs = matchers.filter((m) => m.hits === 0);

if (orphans.length > 0 || deadGlobs.length > 0) {
  console.error(`check-test-wiring: the vitest suite does not cover every tracked test file\n`);
  for (const file of orphans) console.error(`  ✗ ${file} — matches NO include glob, so vitest never runs it`);
  for (const m of deadGlobs) console.error(`  ✗ include glob "${m.glob}" matches no tracked test file`);
  for (const m of matchers.filter((x) => x.hits > 0)) console.error(`  ✓ ${m.glob} — ${m.hits} file(s)`);
  console.error(`\nA \`*.test.ts\` outside \`test.include\` in ${CONFIG} is not skipped and not reported: it is`);
  console.error("simply never collected, so it looks like coverage while proving nothing. Fix it by MOVING the");
  console.error(`file into one of the covered trees (the normal answer), or — if it genuinely belongs where it`);
  console.error(`is — by widening \`test.include\` in ${CONFIG} so the suite actually runs it. A dead glob means`);
  console.error("the opposite: a directory was renamed or removed and a whole tree stopped running — repoint it.");
  process.exit(1);
}

console.log(`check-test-wiring: all ${tests.length} tracked test file(s) are matched by ${CONFIG}'s include list`);
for (const m of matchers) console.log(`  ✓ ${m.glob} — ${m.hits} file(s)`);
process.exit(0);
