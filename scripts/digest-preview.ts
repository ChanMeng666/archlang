/**
 * `npm run digest:preview` — the 64-hex digest pins the tests under `test/` hold, measured on this tree
 * WITHOUT vitest, and the rows that moved (card TR12, `docs/plans/ci-throughput-research.md` § 13.2).
 * OPTIONAL: `check:quick` stays the local gate (AGENTS.md) and CI is the merge evidence.
 *
 * Why: the largest group of real code-PR reds was a drawing change that moved a pinned corpus digest
 * `check:quick`'s corpus-pin budget did not select, some of them plans held inline in `test/tables/*.ts`
 * that a sweep of `.arch` files and docs fences never sees. Each cost a CI round plus a fix.
 *
 * How: it loads the digest test files THEMSELVES, with `vitest` resolved to a stand-in
 * (`scripts/digest-preview/vitest-shim.ts`), and runs their tests one file at a time. So the digest
 * bodies, the tables (`test/tables/*`, `test/helpers/*`) and the pinned values are the tests' own: there
 * is no second measurement to drift from the first. A failed equality whose every difference is a pin (a
 * 64-hex literal in the file's reach) is a MOVED ROW (recorded, and the test carries on, so a table loop
 * reports every row); two measured digests that differ are a failed law; anything else is a failure.
 *
 * Which files (`scripts/digest-preview/select.ts`): every `test/**\/*.test.ts` whose reach (itself, its
 * local `test/` imports, transitively, and the JSON tables they name) holds a 64-hex literal. NOT covered:
 * laws pinned by a vitest snapshot, which the report names, and tests outside `test/`.
 *
 * Zero work never reads as green: an `--only` that matches no file, a file that registers no test, an async
 * `describe` body (which the stand-in cannot await) or a file that fails to load is exit 2.
 *
 * It is a PREVIEW. A row this lists is a finding to explain (`docs/testing.md` § 3), never a re-pin. The
 * report is in file order and declaration order whatever `--jobs` is, so it is deterministic; only the
 * timings vary.
 *
 * Flags: `--list` (print the selected files, run nothing), `--json` (one JSON object on stdout),
 * `--only <substring>` (repeatable: only files whose path contains one), `--jobs <n>` (default 1: worker
 * processes, files balanced by `test/.durations.json`; one heavy process at a time is the local rule, so
 * raise it only on an idle machine), `--root <dir>` (the tree to read, default this checkout; the tests use
 * it). Exit: 0 nothing moved or failed, 1 a row moved or a test failed, 2 zero work or a file the stand-in
 * could not run.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digestFiles, pinsOf, readTree, setupFiles, snapshotFiles, type Tree } from "./digest-preview/select.js";

const SELF = fileURLToPath(import.meta.url);
const SHIM = pathToFileURL(join(dirname(SELF), "digest-preview", "vitest-shim.ts")).href;
/** The line a worker prints its result on, so a test's own console output cannot be mistaken for it. */
const RESULT_MARK = "@@digest-preview-result@@";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const values = (name: string) => argv.flatMap((a, i) => (argv[i - 1] === name ? [a] : []));
const ROOT = resolve(values("--root")[0] ?? join(dirname(SELF), ".."));
const JSON_OUT = flag("--json");
const WORKER = flag("--worker");
const JOBS = Math.max(1, Math.min(8, Math.trunc(Number(values("--jobs")[0] ?? 1)) || 1));
// vitest runs every file from the repository root; some read their tables by a root-relative path.
process.chdir(ROOT);

// ---- one file's run --------------------------------------------------------------------------
interface FileResult {
  file: string;
  tests: number;
  skipped: number;
  moved: { test: string; where: string; pinned: string; now: string }[];
  failed: { test: string; message: string }[];
  /** Why the file could not be run under the stand-in, if it could not. */
  unloadable?: string;
  /** Snapshot assertions the file made, which nothing here compares. */
  snapshots: number;
  secs: number;
}

const firstLine = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).split("\n")[0] as string;

type Shim = typeof import("./digest-preview/vitest-shim.js");
let shimLoaded: Shim | undefined;

/** Resolve `vitest` to the stand-in, and give `test/` modules vitest's `__dirname`/`__filename`. */
async function loadShim(): Promise<Shim> {
  if (shimLoaded) return shimLoaded;
  const testUrl = `${pathToFileURL(join(ROOT, "test")).href}/`;
  // Every other specifier goes on to tsx's resolver. A module under `test/` that uses `__dirname` or
  // `__filename` without declaring it gets the value vitest gives every ES module.
  const hook = `export async function resolve(s, c, next) {
  return s === "vitest" ? { url: ${JSON.stringify(SHIM)}, shortCircuit: true } : next(s, c);
}
export async function load(url, c, next) {
  const r = await next(url, c);
  if (!url.startsWith(${JSON.stringify(testUrl)}) || r.format !== "module" || r.source == null) return r;
  const src = typeof r.source === "string" ? r.source : new TextDecoder().decode(r.source);
  const add = [];
  for (const name of ["__filename", "__dirname"]) {
    if (new RegExp("\\\\b" + name + "\\\\b").test(src) && !new RegExp("\\\\b(?:const|let|var|function)\\\\s+" + name + "\\\\b").test(src)) add.push(name);
  }
  if (add.length === 0) return r;
  const head = 'import { fileURLToPath as __dpF } from "node:url"; import { dirname as __dpD } from "node:path";' +
    (add.includes("__filename") ? " const __filename = __dpF(import.meta.url);" : "") +
    (add.includes("__dirname") ? " const __dirname = __dpD(__dpF(import.meta.url));" : "");
  return { ...r, source: head + src };
}`;
  register(`data:text/javascript,${encodeURIComponent(hook)}`);
  // check:quick's property scale (a quarter): a digest row runs no property, a stray one runs fast.
  process.env.FC_SCALE ??= "0.25";
  shimLoaded = (await import(SHIM)) as Shim;
  for (const s of setupFiles(ROOT)) await import(pathToFileURL(join(ROOT, s)).href);
  return shimLoaded;
}

async function runFile(tree: Tree, file: string): Promise<FileResult> {
  const shim = await loadShim();
  const t0 = Date.now();
  const r: FileResult = { file, tests: 0, skipped: 0, moved: [], failed: [], snapshots: 0, secs: 0 };
  shim.takeTests();
  shim.takeNotes();
  shim.setPins(pinsOf(tree, file));
  try {
    await import(pathToFileURL(join(ROOT, file)).href);
  } catch (e) {
    r.unloadable = firstLine(e);
    r.secs = (Date.now() - t0) / 1000;
    return r;
  }
  const tests = shim.takeTests();
  const collected = shim.takeNotes();
  if (collected.asyncDescribes.length > 0) {
    r.unloadable = `an async describe body the stand-in cannot await: ${collected.asyncDescribes.join("; ")}`;
  } else if (tests.length === 0) {
    r.unloadable = "registered no test";
  }
  if (r.unloadable !== undefined) {
    r.secs = (Date.now() - t0) / 1000;
    return r;
  }
  for (const t of tests) {
    if (t.skip) {
      r.skipped++;
      continue;
    }
    r.tests++;
    const out = await shim.runTest(t);
    for (const m of out.moved) r.moved.push({ test: t.name, ...m });
    if (out.error !== undefined) r.failed.push({ test: t.name, message: firstLine(out.error) });
  }
  try {
    await shim.finishFile(tests);
  } catch (e) {
    r.failed.push({ test: "afterAll", message: firstLine(e) });
  }
  r.snapshots = shim.takeNotes().snapshots;
  r.secs = (Date.now() - t0) / 1000;
  return r;
}

const fileLine = (r: FileResult): string =>
  r.unloadable !== undefined
    ? `LOAD  ${r.file}: ${r.unloadable}`
    : `${r.moved.length || r.failed.length ? "MOVED" : "ok   "} ${r.file} (` +
      `${r.moved.length || r.failed.length ? `${r.moved.length} moved, ${r.failed.length} failed` : "unchanged"}, ` +
      `${r.secs.toFixed(1)}s)`;

// ---- worker mode: run the named files, print the results on one marked line -----------------
if (WORKER) {
  const tree = readTree(ROOT);
  const out: FileResult[] = [];
  for (const f of values("--file")) out.push(await runFile(tree, f));
  process.stdout.write(`\n${RESULT_MARK}${JSON.stringify(out)}\n`);
  process.exit(0);
}

// ---- main ------------------------------------------------------------------------------------
const tree = readTree(ROOT);
const only = values("--only");
const selected = digestFiles(tree).filter((f) => only.length === 0 || only.some((o) => f.file.includes(o)));
const snapshotLaws = snapshotFiles(tree).filter((f) => !selected.some((s) => s.file === f));
const notCovered =
  snapshotLaws.length > 0
    ? `not covered: snapshot laws ${snapshotLaws.map((f) => f.replace(/^test\//, "").replace(/\.test\.ts$/, "")).join(", ")}; CI checks them`
    : "";

if (flag("--list")) {
  for (const f of selected) console.log(`${f.file}${f.via.length ? `  (pins in ${f.via.join(", ")})` : ""}`);
  console.log(`${selected.length} digest test files`);
  if (notCovered) console.log(notCovered);
  process.exit(selected.length === 0 ? 2 : 0);
}
if (selected.length === 0) {
  console.error(
    `digest:preview: no digest test file matches${only.length ? ` --only ${only.join(", ")}` : ""}; nothing ran.`,
  );
  process.exit(2);
}

/** `files` split into `n` groups of near-equal recorded time (longest first onto the lightest group). */
function balance(files: string[], n: number): string[][] {
  let durations: Record<string, number> = {};
  const table = join(ROOT, "test", ".durations.json");
  if (existsSync(table)) durations = JSON.parse(readFileSync(table, "utf8"));
  const cost = (f: string) => durations[f] ?? 3;
  const groups = Array.from({ length: n }, () => ({ files: [] as string[], secs: 0 }));
  for (const f of [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1))) {
    const g = groups.reduce((a, b) => (b.secs < a.secs ? b : a));
    g.files.push(f);
    g.secs += cost(f);
  }
  return groups.map((g) => g.files).filter((g) => g.length > 0);
}

function runWorker(files: string[]): Promise<FileResult[]> {
  return new Promise((done, fail) => {
    // The same Node flags this process runs under (tsx's loader), so the worker resolves `.ts` alike.
    const args = [...process.execArgv, SELF, "--worker", "--root", ROOT, ...files.flatMap((f) => ["--file", f])];
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"], env: process.env });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (s: string) => {
      stdout += s;
    });
    child.on("error", fail);
    child.on("close", (code) => {
      const line = stdout.split("\n").find((l) => l.startsWith(RESULT_MARK));
      if (line === undefined) fail(new Error(`a digest:preview worker exited ${code} without a result`));
      else done(JSON.parse(line.slice(RESULT_MARK.length)) as FileResult[]);
    });
  });
}

const started = Date.now();
const files = selected.map((f) => f.file);
let results: FileResult[];
if (JOBS === 1) {
  results = [];
  for (const f of files) {
    const r = await runFile(tree, f);
    results.push(r);
    if (!JSON_OUT) console.log(fileLine(r));
  }
} else {
  const order = new Map(files.map((f, i) => [f, i]));
  results = (await Promise.all(balance(files, JOBS).map(runWorker)))
    .flat()
    .sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0));
  if (!JSON_OUT) for (const r of results) console.log(fileLine(r));
}
const secs = (Date.now() - started) / 1000;

const moved = results.flatMap((r) => r.moved.map((m) => ({ file: r.file, ...m })));
const failed = results.flatMap((r) => r.failed.map((f) => ({ file: r.file, ...f })));
const unloadable = results.flatMap((r) =>
  r.unloadable === undefined ? [] : [{ file: r.file, message: r.unloadable }],
);
const tests = results.reduce((n, r) => n + r.tests, 0);
const skipped = results.reduce((n, r) => n + r.skipped, 0);
const snapshots = results.reduce((n, r) => n + r.snapshots, 0);

if (JSON_OUT) {
  console.log(
    JSON.stringify({
      files: files.length,
      tests,
      skipped,
      moved,
      failed,
      unloadable,
      snapshotsNotCompared: snapshots,
      notCovered: snapshotLaws,
      jobs: JOBS,
      secs,
    }),
  );
} else {
  if (moved.length > 0) {
    console.log("\nMoved rows (file > test [row]: pinned, now):");
    for (const r of moved) {
      console.log(
        `  ${r.file} > ${r.test}${r.where ? ` ${r.where}` : ""}\n    pinned ${r.pinned}\n    now    ${r.now}`,
      );
    }
  }
  if (failed.length > 0) {
    console.log("\nOther failures in digest test files (a failed law between two measured digests says so):");
    for (const f of failed) console.log(`  ${f.file} > ${f.test}\n    ${f.message.slice(0, 300)}`);
  }
  console.log(
    `\ndigest:preview: ${files.length} files, ${tests} tests (${skipped} skipped): ${moved.length} moved rows, ` +
      `${failed.length} other failures, ${unloadable.length} unloadable, in ${secs.toFixed(1)}s (--jobs ${JOBS}).` +
      (snapshots > 0 ? ` ${snapshots} snapshot assertions in these files were not compared.` : "") +
      (moved.length > 0
        ? " A moved row is a finding to explain (docs/testing.md § 3), never a re-pin; CI is the gate."
        : ""),
  );
  if (notCovered) console.log(notCovered);
}
process.exit(unloadable.length > 0 ? 2 : moved.length > 0 || failed.length > 0 ? 1 : 0);
