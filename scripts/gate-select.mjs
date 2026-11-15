/**
 * What `check:quick` (`scripts/check-quick.mjs`) selects, as pure functions of the changed paths and
 * the tracked files: the directory-scanning guards, the tests named after a changed module, and which
 * of the two deterministic CI steps (`check:drift`, `typecheck:all`) a change set needs. Zero
 * dependencies; it reads only the files it is handed. `test/gate-select.test.ts` pins it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { CODE, isTest, QUOTED, resolveSpec, SPEC, TEST_DIRS } from "./nearest-tests.mjs";

// ---- the directory-scanning guards -----------------------------------------------------------
// A folder whose files a suite LISTS rather than names. `touches` says which changed path wakes them.
export const SCANNED_DIRS = [
  { dir: "examples", why: "an examples/ change", touches: (f) => f.startsWith("examples/") },
  { dir: "docs", why: "a docs/**/*.md change", touches: (f) => f.startsWith("docs/") && f.endsWith(".md") },
];
const LISTS_A_DIR = /\b(?:readdirSync|readdir|opendirSync|globSync)\s*\(/;
/** A test that pins what it reads (a snapshot, a digest, a baseline or a `tables/` row) moves on ANY edit. */
const PINS = /toMatch(?:Inline|File)?Snapshot\(|createHash\(|\bdigest|baseline|\btables\//i;

/** The scanned folders a module's text lists: a directory call plus a quoted folder literal for it. */
export function listedDirs(text, scanned = SCANNED_DIRS) {
  const dirs = new Set();
  if (!LISTS_A_DIR.test(text)) return dirs;
  for (const m of text.matchAll(QUOTED)) {
    const segs = m[1]
      .replace(/^(?:\.\.?\/)+/, "")
      .replace(/\/$/, "")
      .split("/");
    // A folder (`"examples"`, `"../examples"`, `"docs/agents"`), never a file (`"examples/studio.arch"`).
    if (scanned.some((s) => s.dir === segs[0]) && !segs[segs.length - 1].includes(".")) dirs.add(segs[0]);
  }
  return dirs;
}

/**
 * The tests that list one of `dirs`, themselves or through a test-folder helper they import
 * (transitively): a test file whose source calls `readdirSync(`/`readdir(`/`opendirSync(`/`globSync(`
 * and quotes the folder. Ordered: tests that pin what they read first, then by the duration CI
 * recorded (`test/.durations.json`, cheapest first, so the cap buys the most guards), then by name.
 * Each is `{ file, why }`. `files` is the tracked and untracked file list.
 */
export function scanningGuards(ROOT, dirs, files, scanned = SCANNED_DIRS) {
  const modules = files.filter((f) => TEST_DIRS.test(f) && CODE.test(f) && existsSync(join(ROOT, f)));
  const text = new Map(modules.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
  const direct = new Map(modules.map((f) => [f, listedDirs(text.get(f), scanned)]));
  const durations = readDurations(ROOT);
  const guards = [];
  for (const t of modules.filter(isTest)) {
    // Breadth-first over the helpers it imports; a test file is never a helper.
    const reached = new Map([[t, t]]);
    let frontier = [t];
    while (frontier.length > 0) {
      const next = [];
      for (const f of frontier) {
        for (const m of text.get(f).matchAll(SPEC)) {
          const dep = resolveSpec(ROOT, f, m[1]);
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

// ---- the source-tree scanners ----------------------------------------------------------------
// A guard that lists a SOURCE folder (`src/`, `scripts/`, `eval/`, `test/`, `.claude/`) and reads what it
// finds: no CLI spawn, no escaper chain, the provenance walk. No import reaches it from the file that broke
// it, and a folder this wide cannot join `SCANNED_DIRS` (a test that lists `test/fixtures` is not one).
// These are cheap (a few seconds in all), so they run in addition to the `--max` cap.
export const TREE_ROOTS = ["src", "scripts", "eval", "test", ".claude"];
const LISTS_A_TREE = /\b(?:readdirSync|readdir|opendirSync|globSync)\s*\(|ls-files/;

/** Whether `f` is a change a scanner of the `root` tree can see (code; any file under `.claude/`). */
export const touchesTree = (root, f) => f.startsWith(`${root}/`) && (CODE.test(f) || root === ".claude");

/** The source roots a test's own text lists: a bare folder literal, or (with `ls-files`) a folder named in a pattern. */
export function listedTrees(text) {
  const roots = new Set();
  if (!LISTS_A_TREE.test(text)) return roots;
  const lsFiles = text.includes("ls-files");
  for (const root of TREE_ROOTS) {
    const esc = root.replace(".", "\\.");
    const bare = [...text.matchAll(QUOTED)].some((m) => {
      const segs = m[1]
        .replace(/^(?:\.\.?\/)+/, "")
        .replace(/\/$/, "")
        .split("/");
      return segs[0] === root && (segs.length === 1 || root === ".claude");
    });
    if (bare || (lsFiles && new RegExp(`(?:^|[("'\`/|:\\\\])${esc}(?:[|)"'\`]|\\\\?/)`, "m").test(text)))
      roots.add(root);
  }
  return roots;
}

/** The scanner tests a change set wakes: those listing a tree a changed code file sits in. Cheapest first. */
export function treeGuards(ROOT, changed, files) {
  const woken = TREE_ROOTS.filter((r) => changed.some((f) => touchesTree(r, f)));
  if (woken.length === 0) return [];
  const durations = readDurations(ROOT);
  const out = [];
  for (const t of files.filter((f) => isTest(f) && existsSync(join(ROOT, f)))) {
    const roots = [...listedTrees(readFileSync(join(ROOT, t), "utf8"))].filter((r) => woken.includes(r));
    if (roots.length > 0) {
      out.push({
        file: t,
        why: `scans ${roots.map((r) => `${r}/`).join(" and ")}`,
        secs: durations[t] ?? Number.POSITIVE_INFINITY,
      });
    }
  }
  return out.sort((a, b) => a.secs - b.secs || (a.file < b.file ? -1 : 1));
}

// ---- tests named after a changed module ------------------------------------------------------
const GENERIC_STEMS = new Set(["index", "types", "util", "utils", "helpers", "main", "constants", "common", "shared"]);
/** A stem shared by more tests than this names a family, not a module. */
const NAMED_MAX = 6;

/**
 * The tests named after a changed code file: `src/lint/rules/room-contents.ts` -> `test/lint-room-contents.test.ts`
 * (the stem is a whole hyphen-delimited run of the test's name). A stem under 6 characters, a generic one,
 * or one that names more than `NAMED_MAX` tests (`lint`) is skipped.
 */
export function namedTests(changed, files) {
  const tests = files.filter(isTest);
  const out = [];
  for (const f of changed) {
    if (!CODE.test(f) || isTest(f)) continue;
    const stem = posix.basename(f).replace(/\.[^.]+$/, "");
    if (stem.length < 6 || GENERIC_STEMS.has(stem)) continue;
    const hits = tests.filter((t) => `-${posix.basename(t).replace(/\.test\.ts$/, "")}-`.includes(`-${stem}-`));
    if (hits.length > 0 && hits.length <= NAMED_MAX)
      for (const t of hits) if (!out.some((o) => o.file === t)) out.push({ file: t, why: `named after ${f}` });
  }
  return out;
}

// ---- corpus pins ------------------------------------------------------------------------------
/** The recorded seconds assumed for a test file the duration record does not list yet. */
export const UNKNOWN_SECS = 3;

/**
 * Of the tests a code change reaches (`related`), the ones that pin their output over the examples corpus
 * (`exampleGuards`, from `scanningGuards(["examples"])`), cheapest first, until `budgetSecs` of recorded
 * duration is spent. They sit far from a changed `src/` file by import distance (every one goes through
 * `src/index.ts`), so the nearest-first cut never reaches them, and they are what CI most often fails.
 */
export function corpusPins(exampleGuards, related, budgetSecs, durations = {}) {
  const reach = new Set(related);
  const pins = exampleGuards
    .filter((g) => g.pins && reach.has(g.file))
    .map((g) => ({ ...g, cost: durations[g.file] ?? UNKNOWN_SECS }))
    .sort((a, b) => a.cost - b.cost || (a.file < b.file ? -1 : 1));
  const out = [];
  let spent = 0;
  for (const g of pins) {
    if (spent + g.cost > budgetSecs) continue;
    spent += g.cost;
    out.push(g);
  }
  return out;
}

export function readDurations(ROOT) {
  try {
    return JSON.parse(readFileSync(join(ROOT, "test", ".durations.json"), "utf8"));
  } catch {
    return {};
  }
}

// ---- which deterministic CI steps a change set needs -----------------------------------------
/** `check:drift` runs on every change set that is not only test files (the generators read the whole tree). */
export const driftWanted = (changed) => !changed.every((f) => TEST_DIRS.test(f));

/** A diff line (`-U0`) that adds or removes an `export`, or a type member (`name?: type;`) of an interface or type literal. */
const SURFACE_LINE = /^[+-]\s*(?:export\b|(?:readonly\s+)?[A-Za-z_$][\w$]*\??:\s.*;\s*(?:\/\/.*)?$)/;

/** Whether a `git diff -U0` of `src/` (new files as all-added lines) moves what a consumer of the core's types sees. */
export const surfaceChanged = (srcDiff) =>
  srcDiff.split("\n").some((l) => !/^(?:\+\+\+|---)/.test(l) && SURFACE_LINE.test(l));

/**
 * `typecheck:all` (the root dev config plus every workspace, against a built `dist/`) runs when a change can
 * break something the per-file steps do not compile: a `package.json` or the lockfile (a dependency moved),
 * `tsup.config.ts` or a tsconfig, or code under `src/` whose diff (`srcDiff`) adds or removes an export or a
 * type member (the workspaces and `test/` consume the core's types through `dist/`). A change inside a
 * function body cannot break them, and the 30 s build plus ~2 min typecheck are not spent on it.
 */
export function typecheckAllWanted(changed, srcDiff = "") {
  return (
    changed.some(
      (f) =>
        /(?:^|\/)package(?:-lock)?\.json$/.test(f) ||
        /^tsup\.config\.[cm]?[jt]s$/.test(f) ||
        /^tsconfig[^/]*\.json$/.test(f),
    ) ||
    (changed.some((f) => f.startsWith("src/") && (CODE.test(f) || f.endsWith(".json"))) && surfaceChanged(srcDiff))
  );
}
