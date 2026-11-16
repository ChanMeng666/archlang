/**
 * What `check:quick` (`scripts/check-quick.mjs`) selects, as pure functions of the changed paths and
 * the tracked files: the directory-scanning guards, the source-tree scanners, the tests named after a
 * changed module, the text guards and the corpus pins, and `planTests`, which orders them under their caps. Zero
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
// A guard that lists a SOURCE folder (`src/`, `scripts/`, `eval/`, `test/`, `.claude/`) and asserts over every
// file it finds: no CLI spawn, no escaper chain, the provenance walk. No import reaches it from the file that
// broke it, and a folder this wide cannot join `SCANNED_DIRS` (a test that lists `test/fixtures` is not one).
// They run in addition to the `--max` cap, within `TREE_MAX_SECS` recorded seconds (they cost tens of
// milliseconds each, so the budget is time; `TREE_MAX_FILES` is only a safety ceiling).
export const TREE_ROOTS = ["src", "scripts", "eval", "test", ".claude"];
export const TREE_MAX_FILES = 30;
export const TREE_MAX_SECS = 15;
/** The recorded seconds assumed for a scanner the duration record does not list yet (a source scan is cheap). */
export const UNKNOWN_SCAN_SECS = 0.5;
const LISTS_A_TREE = /\b(?:readdirSync|readdir|opendirSync|globSync)\s*\(|ls-files/;
const READS_FILES = /\breadFileSync\s*\(/;

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

/** A test that imports the core (`../src/...`): it runs the compiler over what it reads. */
const IMPORTS_CORE = /from\s+["'](?:\.\.\/)+src\//;

/**
 * Whether a test is a source-tree scanner, and the roots it scans. It lives in the repo's own `test/` folder
 * (a workspace test's `src` is the workspace's), enumerates a source root (`listedTrees`), reads the files it
 * finds as text, and does not run the compiler over a corpus: a test that lists `examples/` or `docs/` AND
 * imports the core is a corpus test, which `scanningGuards` and `corpusPins` select.
 */
export function scannedTrees(text, file = "test/x.test.ts") {
  const roots = listedTrees(text);
  if (!file.startsWith("test/") || roots.size === 0 || !READS_FILES.test(text)) return new Set();
  if (listedDirs(text).size > 0 && IMPORTS_CORE.test(text)) return new Set();
  return roots;
}

/** The head of `ordered` that fits `maxFiles` files and `maxSecs` seconds (a file that would overspend ends the list). */
function capByCost(ordered, maxFiles, maxSecs) {
  const out = [];
  let spent = 0;
  for (const g of ordered) {
    if (out.length >= maxFiles || spent + g.secs > maxSecs) break;
    spent += g.secs;
    out.push(g);
  }
  return out;
}

/**
 * The scanner tests a change set wakes: those scanning a tree a changed code file sits in, within
 * `maxSecs` recorded seconds (and the `maxFiles` safety ceiling). Ranked: the fewest trees scanned first
 * (every dedicated scanner gets in before one that lists several trees), then the cheapest (a test the
 * duration record does not list yet is costed at `UNKNOWN_SCAN_SECS`), then by name. A scanner that no
 * longer fits the budget is cut, and a cheaper one after it may still go in. Each is `{ file, why, secs }`.
 */
export function treeGuards(ROOT, changed, files, maxFiles = TREE_MAX_FILES, maxSecs = TREE_MAX_SECS) {
  const woken = TREE_ROOTS.filter((r) => changed.some((f) => touchesTree(r, f)));
  if (woken.length === 0) return [];
  const durations = readDurations(ROOT);
  const found = [];
  for (const t of files.filter((f) => isTest(f) && existsSync(join(ROOT, f)))) {
    const scanned = scannedTrees(readFileSync(join(ROOT, t), "utf8"), t);
    const roots = [...scanned].filter((r) => woken.includes(r));
    if (roots.length > 0) {
      found.push({
        file: t,
        roots,
        breadth: scanned.size,
        why: `scans ${roots.map((r) => `${r}/`).join(" and ")}`,
        secs: durations[t] ?? UNKNOWN_SCAN_SECS,
      });
    }
  }
  found.sort((a, b) => a.breadth - b.breadth || a.secs - b.secs || (a.file < b.file ? -1 : 1));
  const out = [];
  let spent = 0;
  for (const g of found) {
    if (out.length >= maxFiles) break;
    if (spent + g.secs > maxSecs) continue;
    out.push(g);
    spent += g.secs;
  }
  return out;
}

// ---- tests named after a changed module ------------------------------------------------------
const GENERIC_STEMS = new Set(["index", "types", "util", "utils", "helpers", "main", "constants", "common", "shared"]);
/** A stem shared by more tests than this names a family, not a module. */
const NAMED_MAX = 6;
export const NAMED_MAX_FILES = 5;
export const NAMED_MAX_SECS = 10;

/** The median of the recorded seconds (what a test the record does not list yet is costed at). */
export function medianSecs(durations) {
  const v = Object.values(durations)
    .filter((n) => typeof n === "number")
    .sort((a, b) => a - b);
  return v.length === 0 ? 0 : v[Math.floor(v.length / 2)];
}

/**
 * The tests named after a changed code file: `src/lint/rules/room-contents.ts` -> `test/lint-room-contents.test.ts`
 * (the stem is a whole hyphen-delimited run of the test's name). A stem under 6 characters, a generic one,
 * or one that names more than `NAMED_MAX` tests (`lint`) is skipped. Of those, the cheapest by recorded
 * seconds (a test the record does not list is costed at the median) within `maxFiles` files and `maxSecs`
 * seconds. Each is `{ file, why, secs }`.
 */
export function namedTests(changed, files, durations = {}, maxFiles = NAMED_MAX_FILES, maxSecs = NAMED_MAX_SECS) {
  const tests = files.filter(isTest);
  const median = medianSecs(durations);
  const found = [];
  for (const f of changed) {
    if (!CODE.test(f) || isTest(f)) continue;
    const stem = posix.basename(f).replace(/\.[^.]+$/, "");
    if (stem.length < 6 || GENERIC_STEMS.has(stem)) continue;
    const hits = tests.filter((t) => `-${posix.basename(t).replace(/\.test\.ts$/, "")}-`.includes(`-${stem}-`));
    if (hits.length > 0 && hits.length <= NAMED_MAX)
      for (const t of hits)
        if (!found.some((o) => o.file === t))
          found.push({ file: t, why: `named after ${f}`, secs: durations[t] ?? median });
  }
  found.sort((a, b) => a.secs - b.secs || (a.file < b.file ? -1 : 1));
  return capByCost(found, maxFiles, maxSecs);
}

// ---- the text guards --------------------------------------------------------------------------
/**
 * Three guards that read catalogue, docs and allowlisted TEXT by a path the import graph never follows,
 * so the nearest-tests cut misses them and CI fails on them instead (#848). Each has its own inputs.
 */
export const OPAQUE_GUARD = "test/opaque-literal-guard.test.ts";
export const DOCS_FLAGS = "test/docs-flags.test.ts";
export const FIX_TEXTS = "test/lint-fix-texts.test.ts";
export const TEXT_GUARDS = [OPAQUE_GUARD, DOCS_FLAGS, FIX_TEXTS];

/**
 * Every path a `.gitleaksignore` fingerprint (`<commit>:<path>:<ruleID>:<line>`) names, deduplicated and
 * sorted, as written. The one parser: `test/opaque-literal-guard.test.ts` reads its guarded set with it.
 */
export function fingerprintPaths(text) {
  return [
    ...new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(":")[1] ?? ""),
    ),
  ]
    .filter(Boolean)
    .sort();
}

/** The paths `.gitleaksignore` names, with `/` separators; empty when the file cannot be read. */
export function gitleaksExcluded(ROOT) {
  let text = "";
  try {
    text = readFileSync(join(ROOT, ".gitleaksignore"), "utf8");
  } catch {
    return new Set();
  }
  return new Set(fingerprintPaths(text).map((p) => p.replace(/\\/g, "/")));
}

/**
 * The files `test/docs-flags.test.ts` reads, read out of its text (never retyped): every quoted literal
 * that is a tracked file or one of `gone` (a page deleted or renamed away, which the test may still name),
 * and each `skills/<name>/SKILL.md` when it lists `skills`.
 */
export function docsFlagsReads(ROOT, files, gone = []) {
  let text = "";
  try {
    text = readFileSync(join(ROOT, DOCS_FLAGS), "utf8");
  } catch {
    return new Set();
  }
  const known = new Set([...files, ...gone]);
  const read = new Set([...text.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]).filter((l) => known.has(l)));
  if (/readdirSync\(\s*"skills"\s*\)/.test(text)) {
    for (const f of known) if (/^skills\/[^/]+\/SKILL\.md$/.test(f)) read.add(f);
  }
  return read;
}

/**
 * The files a guard imports directly by a relative specifier (`../src/manifest.js` -> `src/manifest.ts`),
 * read out of its text. The import graph ranks a guard by distance, so the capped list can cut it even
 * for a change to the very module it imports (#867). Empty when the guard cannot be read.
 */
export function guardImports(ROOT, guard) {
  let text = "";
  try {
    text = readFileSync(join(ROOT, guard), "utf8");
  } catch {
    return new Set();
  }
  const out = new Set();
  for (const m of text.matchAll(SPEC)) {
    const dep = resolveSpec(ROOT, guard, m[1]);
    if (dep && !isTest(dep)) out.add(dep);
  }
  return out;
}

/** The error catalogue: its index, its fix texts and every entry module. */
export const isErrorCatalogue = (f) =>
  f === "src/error-catalog.ts" || f === "src/error-catalog-fixes.ts" || f.startsWith("src/error-catalog/");

/** A property that carries diagnostic text: `message:`, `fix:`, `hint:` or `hints:` (optional ones too). */
const TEXT_PROP = /(?:^|[\s{,(])(message|fix|hint|hints)\??\s*:/m;
/** A comment line (`//`, `/*`, or a doc comment's ` * ` line): prose, never a property. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

const closures = new Map();
/** Every non-test module `guard` reaches through its imports, transitively (`guardImports` per step); memoised. */
export function guardClosure(ROOT, guard) {
  const key = `${ROOT}\0${guard}`;
  const hit = closures.get(key);
  if (hit) return hit;
  const seen = new Set();
  const queue = [...guardImports(ROOT, guard)];
  while (queue.length > 0) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const dep of guardImports(ROOT, f)) if (!seen.has(dep)) queue.push(dep);
  }
  closures.set(key, seen);
  return seen;
}

/**
 * Why a changed module composes the fix and hint text `test/lint-fix-texts.test.ts` reads, read out of
 * its own source (never a list of paths), or `undefined`: a `message:`/`fix:`/`hint:`/`hints:` property
 * outside a comment line, or a leading doc comment that mentions "message" or "hint". Only `src/` code
 * inside the guard's transitive import closure (`guardClosure`); a deleted or unreadable module composes nothing.
 */
export function composesFixText(ROOT, f) {
  if (!f.startsWith("src/") || !CODE.test(f)) return undefined;
  if (!guardClosure(ROOT, FIX_TEXTS).has(f)) return undefined;
  let text = "";
  try {
    text = readFileSync(join(ROOT, f), "utf8");
  } catch {
    return undefined;
  }
  const code = text
    .split("\n")
    .filter((line) => !COMMENT_LINE.test(line))
    .join("\n");
  const prop = TEXT_PROP.exec(code);
  if (prop) return `a module with a \`${prop[1]}:\` property`;
  const start = text.indexOf("/**");
  const end = start === -1 ? -1 : text.indexOf("*/", start);
  const head = end === -1 || text.slice(0, start).trim() !== "" ? "" : text.slice(start, end);
  if (/\b(message|hint)s?\b/i.test(head)) return "a module whose header names message text";
  return undefined;
}

/** The key file IndexNow serves at the domain root, which `opaque-literal-guard` matches to the test's key. */
export const isIndexNowKey = (f) => /^docs-site\/public\/[0-9a-f]{32}\.txt$/.test(f);

/**
 * Why a changed path `f` wakes `guard`, or `undefined`. `ctx` is `{ excluded, docs, imports?, root? }`: the
 * `.gitleaksignore` paths, the files `test/docs-flags.test.ts` reads, each guard's `guardImports`, and the
 * repo root `composesFixText` reads a changed module under.
 */
export function textGuardTrigger(guard, f, ctx) {
  if (guard === FIX_TEXTS) {
    if (isErrorCatalogue(f)) return "the error catalogue";
    if (f === "src/fix-producers.ts") return "the fix producers";
    const composes = ctx.root === undefined ? undefined : composesFixText(ctx.root, f);
    if (composes) return composes;
    // Its imports are the whole core (`src/index.ts`, `src/lint.ts`): not a trigger of their own.
    return undefined;
  }
  if (guard === OPAQUE_GUARD) {
    if (f === ".gitleaksignore") return "the gitleaks allowlist";
    if (ctx.excluded.has(f)) return "a file .gitleaksignore names";
    if (isIndexNowKey(f)) return "the published IndexNow key";
    if (isErrorCatalogue(f)) return "the error catalogue";
  }
  if (guard === DOCS_FLAGS && ctx.docs.has(f)) return `a page ${DOCS_FLAGS} reads`;
  if (ctx.imports?.get(guard)?.has(f)) return `a module ${guard} imports`;
  return undefined;
}

/**
 * The text guards a change set wakes, each by its own inputs: `lint-fix-texts` by the error catalogue,
 * the fix producers and a module whose own source composes fix text (`composesFixText`); `opaque-literal-guard` by `.gitleaksignore`,
 * the files it names, the published IndexNow key and the catalogue; `docs-flags` by the pages it reads,
 * a deleted or renamed-away one too (`gone`); those two also by a module they import directly. Each is
 * `{ file, why }`, the why naming the trigger.
 */
export function textGuards(ROOT, changed, files, gone = []) {
  const ctx = {
    excluded: gitleaksExcluded(ROOT),
    docs: docsFlagsReads(ROOT, files, gone),
    imports: new Map(TEXT_GUARDS.map((g) => [g, guardImports(ROOT, g)])),
    root: ROOT,
  };
  const out = [];
  for (const guard of TEXT_GUARDS) {
    if (!files.includes(guard)) continue;
    for (const f of [...changed, ...gone]) {
      const why = textGuardTrigger(guard, f, ctx);
      if (why) {
        out.push({ file: guard, why: `${why} changed (${f})` });
        break;
      }
    }
  }
  return out;
}

// ---- corpus pins ------------------------------------------------------------------------------
/** The recorded seconds assumed for a test file the duration record does not list yet. */
export const UNKNOWN_SECS = 3;
/** The default recorded-seconds budget of the corpus pins (`--pins`): `keep-digests` fits, the costlier ones are CI's. */
export const PIN_SECS = 5;

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

// ---- the test list ----------------------------------------------------------------------------
/**
 * What the gate would run, as a pure function of the change set. `related` is the import-distance order
 * (`nearestTests`), `files` the tracked and untracked files, `gone` the paths the branch deleted or renamed
 * away (only the text guards read them). Two parts:
 *   - capped by `max` (`--max`), together and in this order: the branch's own changed test files, the
 *     directory-scanning guards an `examples/` or `docs/**\/*.md` change wakes, then the nearest tests;
 *   - beyond `max`, each under its own cap: the source-tree scanners (`TREE_MAX_FILES` files and
 *     `TREE_MAX_SECS` seconds), the tests named after a changed module (`NAMED_MAX_FILES`, `NAMED_MAX_SECS`),
 *     the text guards (`TEXT_GUARDS`, each woken only by its own inputs; uncapped, at most three) and, for a change under `src/`, the corpus pins
 *     (`pinSecs` seconds).
 * Returns `{ own, woken, guards, guardPick, extras, picked, total }`; each extra is `{ file, why, rule }`.
 */
export function planTests({ ROOT, changed, files, related, gone = [], max = 20, pinSecs = PIN_SECS }) {
  const durations = readDurations(ROOT);
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
  const guardPick = guards.slice(0, Math.max(0, max - own.length));
  const capped = [
    ...own,
    ...guardPick.map((g) => g.file),
    ...related.filter((f) => !own.includes(f) && !guardPick.some((g) => g.file === f)),
  ].slice(0, max);
  const extras = [];
  const addExtras = (rule, list) => {
    for (const g of list) {
      if (!capped.includes(g.file) && !extras.some((e) => e.file === g.file))
        extras.push({ file: g.file, why: g.why, rule });
    }
  };
  addExtras("treeGuards", treeGuards(ROOT, changed, files));
  addExtras("namedTests", namedTests(changed, files, durations));
  addExtras("textGuards", textGuards(ROOT, changed, files, gone));
  if (changed.some((f) => f.startsWith("src/") && CODE.test(f))) {
    addExtras("corpusPins", corpusPins(scanningGuards(ROOT, ["examples"], files), related, pinSecs, durations));
  }
  const picked = [...extras.map((e) => e.file), ...capped];
  const total = new Set([...related, ...guards.map((g) => g.file), ...extras.map((e) => e.file)]).size;
  return { own, woken, guards, guardPick, extras, picked, total };
}

// ---- which deterministic CI steps a change set needs -----------------------------------------
/** `check:drift` runs on every change set that is not only test files (the generators read the whole tree). */
export const driftWanted = (changed) => !changed.every((f) => TEST_DIRS.test(f));
