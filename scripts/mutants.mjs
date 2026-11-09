#!/usr/bin/env node
/**
 * Nightly sampled mutants (REPORT-ONLY): a seeded sample of small source mutations, each run against
 * only the tests nearest the mutated file, to measure what the byte-identity suites cannot see —
 * boundary mutants on thresholds the corpus never straddles, error paths asserted only as "some
 * diagnostic", branches no test reaches. Full Stryker is out of budget (every corpus-wide digest
 * file executes most of `src/`), so this samples N sites a night instead. Zero dependencies beyond
 * the dev dep `typescript` (its compiler API finds the sites) and vitest (it runs the tests).
 *
 *   node scripts/mutants.mjs [--files <path|glob,...>] [--mutants N] [--seed <int>] [--timeout <s>]
 *                            [--max-tests N] [--budget-minutes N] [--allow <path>] [--report <out.json>]
 *                            [--dry-run] [--fail-on-survivor]
 *
 * Run from the repository root (paths are relative to the working directory). Defaults:
 * `--files src/num-format.ts,src/expr.ts`, `--mutants 40`, `--seed` the UTC date as `YYYYMMDD`
 * (each night samples differently, and a night is reproducible from its seed), `--timeout 180`
 * seconds per mutant (a baseline gets twice that), `--max-tests 20`, `--budget-minutes 85` (no new
 * run STARTS once the budget is spent; the rest are `not run (budget)`, so the whole night fits
 * inside the job's timeout), `--allow test/mutants.allow.json`.
 *
 * Operators (sites found syntactically, no type information):
 *   boundary      `<` ↔ `<=`, `>` ↔ `>=`
 *   sign          `+` ↔ `-` (not when an operand is a string or template literal), `*` ↔ `/`
 *   negation      `!x` → `x`
 *   equality      `===` ↔ `!==`, `==` ↔ `!=`
 *   early-return  `return; ` inserted before the first statement of a function body that returns
 *                 a value somewhere (a `return <expr>` of its own); constructors, setters,
 *                 generators and `: void` functions are skipped
 *   constant      a numeric literal operand of a comparison, `n` → `n+1`
 *
 * Per sampled site: the file is rewritten with the one mutation, the nearest tests by import
 * distance (`scripts/nearest-tests.mjs`, the graph `check:quick` uses; capped at `--max-tests`) run
 * under vitest with two workers and `--bail=1`, and the original bytes are put back in a `finally`
 * and verified. Each target file's tests first run once unmutated: a red or timed-out baseline
 * skips that file's mutants rather than calling them killed. Verdicts: `killed` (a test failed, or
 * a test file failed to load), `survived`, `equivalent (allow-listed)` (a survivor with a row in the
 * allow-list: `{ file, line, operator, before, after, reason }`, `before`/`after` the trimmed source
 * line), `timeout`, `error` (the mutant does not compile, vitest failed outside any test, wrote no
 * report or could not start: never a kill), `skipped` (baseline red, or no nearest test),
 * `not run (budget)`, `interrupted` (a signal or a runner fault stopped it).
 *
 * Output: the JSON report at `--report` and the Markdown table in `$GITHUB_STEP_SUMMARY` (when set),
 * both REWRITTEN after every run and on SIGINT/SIGTERM/SIGHUP, so a cancelled job keeps the
 * verdicts it reached; the final table on stdout. Exit 0 always — report-only — except 1 under `--fail-on-survivor` when a
 * survivor is not allow-listed, and 2 for a refusal: bad arguments, an unreadable allow-list, or a
 * target file with uncommitted changes (the sampler writes target files in place, so it refuses
 * to start on a dirty one rather than risk mixing its bytes into real work).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { nearestTests } from "./nearest-tests.mjs";

export const DEFAULT_FILES = ["src/num-format.ts", "src/expr.ts"];
export const OPERATORS = ["boundary", "sign", "negation", "equality", "early-return", "constant"];

// ---- sites -----------------------------------------------------------------------------------

const SWAP = new Map([
  [ts.SyntaxKind.LessThanToken, ["boundary", "<="]],
  [ts.SyntaxKind.LessThanEqualsToken, ["boundary", "<"]],
  [ts.SyntaxKind.GreaterThanToken, ["boundary", ">="]],
  [ts.SyntaxKind.GreaterThanEqualsToken, ["boundary", ">"]],
  [ts.SyntaxKind.PlusToken, ["sign", "-"]],
  [ts.SyntaxKind.MinusToken, ["sign", "+"]],
  [ts.SyntaxKind.AsteriskToken, ["sign", "/"]],
  [ts.SyntaxKind.SlashToken, ["sign", "*"]],
  [ts.SyntaxKind.EqualsEqualsEqualsToken, ["equality", "!=="]],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, ["equality", "==="]],
  [ts.SyntaxKind.EqualsEqualsToken, ["equality", "!="]],
  [ts.SyntaxKind.ExclamationEqualsToken, ["equality", "=="]],
]);
const COMPARISON = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
const STRINGY = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
]);

/** Whether a function body returns a value of its own (a `return <expr>` not inside a nested function). */
function returnsValue(body) {
  let found = false;
  const visit = (n) => {
    if (found || ts.isFunctionLike(n) || ts.isClassLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) found = true;
    else ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function isEarlyReturnCandidate(n) {
  if (!ts.isFunctionLike(n) || !("body" in n) || !n.body || !ts.isBlock(n.body)) return false;
  if (ts.isConstructorDeclaration(n) || ts.isSetAccessorDeclaration(n)) return false;
  if ("asteriskToken" in n && n.asteriskToken) return false;
  if (n.type && n.type.kind === ts.SyntaxKind.VoidKeyword) return false;
  return n.body.statements.length > 0 && returnsValue(n.body);
}

/**
 * Every mutation site in one source, in source order. A site is
 * `{ file, line, column, operator, start, end, replacement, before, after }`: the edit replaces
 * `[start, end)` with `replacement`; `before`/`after` are the trimmed source line without and with
 * it (what the table prints and the allow-list matches); `line`/`column` are 1-based.
 */
export function enumerateSites(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sites = [];
  const add = (operator, start, end, replacement) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(start);
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", start);
    if (lineEnd < 0) lineEnd = text.length;
    const src = text.slice(lineStart, lineEnd);
    const before = src.replace(/\r$/, "").trim();
    // An edit is one token (or an insertion), so it never crosses the line it starts on.
    const mutated = src.slice(0, start - lineStart) + replacement + src.slice(end - lineStart);
    const after = mutated.replace(/\r$/, "").trim();
    sites.push({ file, line: line + 1, column: character + 1, operator, start, end, replacement, before, after });
  };
  const visit = (n) => {
    if (ts.isBinaryExpression(n)) {
      const kind = n.operatorToken.kind;
      const swap = SWAP.get(kind);
      const stringy =
        (kind === ts.SyntaxKind.PlusToken || kind === ts.SyntaxKind.MinusToken) &&
        (STRINGY.has(n.left.kind) || STRINGY.has(n.right.kind));
      if (swap && !stringy) add(swap[0], n.operatorToken.getStart(sf), n.operatorToken.getEnd(), swap[1]);
      if (COMPARISON.has(kind)) {
        for (const side of [n.left, n.right]) {
          if (!ts.isNumericLiteral(side)) continue;
          const value = Number(side.getText(sf).replace(/_/g, ""));
          if (Number.isFinite(value)) add("constant", side.getStart(sf), side.getEnd(), String(value + 1));
        }
      }
    } else if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
      const start = n.getStart(sf);
      add("negation", start, start + 1, "");
    }
    if (isEarlyReturnCandidate(n)) {
      const first = n.body.statements[0].getStart(sf);
      add("early-return", first, first, "return; ");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites.sort((a, b) => a.start - b.start || OPERATORS.indexOf(a.operator) - OPERATORS.indexOf(b.operator));
}

/** The source with one site's edit applied. */
export const applySite = (text, site) => text.slice(0, site.start) + site.replacement + text.slice(site.end);

// ---- sampling --------------------------------------------------------------------------------

/** mulberry32: a 32-bit seeded PRNG, uniform in [0, 1). Deterministic for a seed on every engine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` sites drawn without replacement (a partial Fisher–Yates shuffle), returned in input order. */
export function sampleSites(sites, n, seed) {
  const rand = mulberry32(seed);
  const idx = sites.map((_, i) => i);
  const k = Math.min(n, idx.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx
    .slice(0, k)
    .sort((x, y) => x - y)
    .map((i) => sites[i]);
}

/** The UTC date of `now` as the integer `YYYYMMDD`: the default seed. */
export const dateSeed = (now = new Date()) =>
  now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();

// ---- allow-list ------------------------------------------------------------------------------

const ALLOW_KEYS = ["file", "line", "operator", "before", "after", "reason"];

/** The allow-list rows, validated: each needs every key, and a non-empty `reason`. */
export function parseAllow(json) {
  const rows = JSON.parse(json);
  if (!Array.isArray(rows)) throw new Error("the allow-list must be a JSON array");
  rows.forEach((r, i) => {
    for (const k of ALLOW_KEYS) {
      if (r?.[k] === undefined) throw new Error(`allow-list row ${i} has no \`${k}\``);
    }
    if (typeof r.reason !== "string" || r.reason.trim() === "") throw new Error(`allow-list row ${i} gives no reason`);
  });
  return rows;
}

/** The allow-list row matching a site (file, line, operator and both lines exactly), or undefined. */
export const allowRow = (site, rows) =>
  rows.find(
    (r) =>
      r.file === site.file &&
      r.line === site.line &&
      r.operator === site.operator &&
      r.before === site.before &&
      r.after === site.after,
  );

// ---- running ---------------------------------------------------------------------------------

/** esbuild's and Node's words for a source that does not parse: a mutant that broke the syntax. */
const NO_COMPILE = /Transform failed|SyntaxError|Unexpected token|ERROR: Expected|Parse failure/;

/**
 * What one vitest run says about a mutant, from its exit code and JSON report (`undefined` when it
 * wrote none). A failed test is a kill. A test file that failed to load is a kill too, unless it
 * failed because the mutant does not compile: that, and a red exit with no failed test or file (an
 * unhandled error), is `error`, never a kill: no test detected anything.
 * @returns {{ status: "pass"|"fail"|"error", killer?: string, reason?: string }}
 */
export function classify(code, report, root = process.cwd()) {
  if (code === 0) return { status: "pass" };
  if (!report) return { status: "error", reason: "vitest wrote no report" };
  const rel = (f) => relative(root, f.name ?? "").replace(/\\/g, "/");
  for (const f of report.testResults ?? []) {
    const a = (f.assertionResults ?? []).find((x) => x.status === "failed");
    if (a) return { status: "fail", killer: `${rel(f)} › ${a.fullName ?? a.title}` };
  }
  for (const f of report.testResults ?? []) {
    if (f.status !== "failed") continue;
    const msg = String(f.message ?? "");
    if (NO_COMPILE.test(msg)) {
      return { status: "error", reason: `does not compile: ${msg.split("\n").find((l) => l.trim()) ?? ""}`.trim() };
    }
    return { status: "fail", killer: `${rel(f)} (failed to load)` };
  }
  return { status: "error", reason: "unhandled error outside any test" };
}

/**
 * Run vitest on `tests` from `root`; resolves `{ status: "pass"|"fail"|"timeout"|"error", killer?,
 * reason?, seconds, tail? }` and never rejects (a process that cannot start is `error`).
 */
export function runVitest(tests, timeoutSec, root = process.cwd(), node = process.execPath) {
  const out = mkdtempSync(join(tmpdir(), "archlang-mutants-"));
  const reportFile = join(out, "report.json");
  const args = [
    join(root, "node_modules", "vitest", "vitest.mjs"),
    "run",
    ...tests,
    "--poolOptions.forks.maxForks=2",
    "--poolOptions.forks.minForks=1",
    "--bail=1",
    "--reporter=dot",
    "--reporter=json",
    `--outputFile.json=${reportFile}`,
  ];
  const t0 = Date.now();
  return new Promise((done) => {
    let settled = false;
    let timer;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeChild = undefined;
      rmSync(out, { recursive: true, force: true });
      done({ ...r, seconds: Math.round((Date.now() - t0) / 100) / 10 });
    };
    // Its own process group on POSIX, so a timeout kills the workers too, not only the parent.
    const child = spawn(node, args, { cwd: root, detached: process.platform !== "win32" });
    activeChild = child;
    let tail = "";
    const keep = (b) => {
      tail = (tail + b.toString()).slice(-4000);
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    let timedOut = false;
    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutSec * 1000);
    child.on("error", (e) => finish({ status: "error", reason: `cannot run vitest: ${e.message}`, tail }));
    child.on("close", (code) => {
      if (timedOut) return finish({ status: "timeout" });
      let report;
      try {
        report = JSON.parse(readFileSync(reportFile, "utf8"));
      } catch {
        report = undefined;
      }
      const r = classify(code, report, root);
      finish(r.status === "error" ? { ...r, tail } : r);
    });
  });
}

let activeChild;
function killTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
}

// The one file currently holding a mutation and its original bytes: every exit path puts them back.
let pending;
// The running sampler's report writer, so a signal still leaves the night's verdicts behind.
let onSignal;
function restore() {
  if (!pending) return;
  const { path, bytes } = pending;
  writeFileSync(path, bytes);
  if (!readFileSync(path).equals(bytes)) throw new Error(`mutants: ${path} did not restore byte for byte`);
  pending = undefined;
}
let guarded = false;
/** Registered once, before the first write: a cancelled job (SIGTERM) or Ctrl-C still restores. */
function guardExit() {
  if (guarded) return;
  guarded = true;
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      killTree(activeChild);
      restore();
      onSignal?.(sig);
      process.exit(130);
    });
  }
  process.on("exit", restore);
}

// ---- report ----------------------------------------------------------------------------------

/**
 * Table-cell escapes, character by character (no regex replace, so no character is left
 * half-escaped): a pipe and a backslash escaped (GFM honours `\|` inside a code span too), a
 * backtick made a quote and a line break a space, so a cell can end neither its code span nor its row.
 */
const CELL_ESC = { "|": "\\|", "\\": "\\\\", "`": "'", "\r": " ", "\n": " " };
const cell = (s) => Array.from(String(s), (c) => CELL_ESC[c] ?? c).join("");
/** A window of at most `n` characters of `s` around index `at`, with an ellipsis for each cut. */
const clip = (s, at, n = 64) => {
  if (s.length <= n) return s;
  const from = Math.max(0, Math.min(at - 24, s.length - n));
  return `${from > 0 ? "…" : ""}${s.slice(from, from + n)}${from + n < s.length ? "…" : ""}`;
};
/** Where two lines first differ: the mutation's place in the printed line. */
const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

/** The verdict tallies; `score` is killed + timeout over killed + timeout + survived. */
export function tally(results) {
  const counts = {
    killed: 0,
    survived: 0,
    equivalent: 0,
    timeout: 0,
    error: 0,
    skipped: 0,
    budget: 0,
    interrupted: 0,
    pending: 0,
  };
  for (const r of results) {
    if (r.verdict === "equivalent (allow-listed)") counts.equivalent++;
    else if (r.verdict === "not run (budget)") counts.budget++;
    else if (r.verdict === "not run" || r.verdict === "running") counts.pending++;
    else if (r.verdict in counts) counts[r.verdict]++;
  }
  const scored = counts.killed + counts.timeout + counts.survived;
  return { counts, score: scored ? Math.round(((counts.killed + counts.timeout) / scored) * 1000) / 10 : null };
}

export function markdown(r) {
  const c = r.counts;
  const head = r.dryRun
    ? `## Sampled mutants — dry run (seed ${r.seed})`
    : `## Sampled mutants (report-only, never gates) — seed ${r.seed}${r.final ? "" : " — IN PROGRESS"}`;
  const extra = [
    c.budget ? `${c.budget} not run (the ${r.budgetMinutes}-minute budget ran out)` : "",
    c.interrupted ? `${c.interrupted} interrupted` : "",
    c.pending ? `${c.pending} not yet run` : "",
  ].filter(Boolean);
  const summary = r.dryRun
    ? `${r.results.length} of ${r.sitesTotal} sites sampled; nothing run.`
    : `${r.results.length} of ${r.sitesTotal} sites: ${c.killed} killed, ${c.survived} survived, ` +
      `${c.equivalent} equivalent (allow-listed), ${c.timeout} timeout, ${c.error} error, ${c.skipped} skipped` +
      `${extra.length ? `, ${extra.join(", ")}` : ""}. ` +
      `Mutation score ${r.score === null ? "n/a" : `${r.score}%`} (killed + timeout over killed + timeout + survived). ` +
      "`error` is a mutant that did not compile, or a run that failed outside any test: never counted as killed.";
  const rows = r.results.map((x, i) => {
    const at = firstDiff(x.before, x.after);
    return (
      `| ${i + 1} | \`${x.file}:${x.line}\` | ${x.operator} | \`${cell(clip(x.before, at))}\` → \`${cell(clip(x.after, at))}\` | ` +
      `${x.verdict}${x.reason ? ` (${cell(x.reason)})` : ""} | ${x.killer ? cell(x.killer) : ""} | ${x.seconds ?? ""} |`
    );
  });
  const tests = Object.entries(r.tests).map(
    ([f, t]) =>
      `- \`${f}\`: ${t.list.length < t.related ? `the ${t.list.length} nearest of ${t.related}` : `all ${t.related}`} related test files` +
      (t.baseline ? `; unmutated baseline ${t.baseline.status} in ${t.baseline.seconds}s` : ""),
  );
  const stale = r.staleAllow.map(
    (a) => `- \`${a.file}:${a.line}\` ${a.operator}: ${cell(a.before)} (matches no site now)`,
  );
  return [
    head,
    "",
    summary,
    "",
    ...tests,
    "",
    "| # | Site | Operator | Before → after | Verdict | Killed by | s |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    ...(stale.length ? ["", "Stale allow-list rows:", ...stale] : []),
    "",
  ].join("\n");
}

// ---- main ------------------------------------------------------------------------------------

/**
 * Whether a `/`-separated `path` matches the glob `pattern`, walking both strings (no RegExp is
 * ever built from the argument). `*` is any run of characters except `/`, `**` any run including
 * `/` (and `**\/` also matches no folder at all, so `src/**\/*.ts` takes `src/a.ts`), `?` one
 * character except `/`; every other character is itself. Each (pattern, path) position pair is
 * decided once, so the walk is at most pattern length × path length steps whatever the input.
 * An optional `meter` counts the pairs decided (`meter.steps`), so a test can pin that bound as a
 * count rather than a clock.
 */
export function globMatch(pattern, path, meter) {
  const memo = new Map();
  const at = (p, s) => {
    const key = p * (path.length + 1) + s;
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (meter) meter.steps++;
    let r = false;
    const c = pattern[p];
    if (p === pattern.length) r = s === path.length;
    else if (c === "*" && pattern[p + 1] === "*") {
      const q = p + 2;
      for (let k = s; k <= path.length && !r; k++) r = at(q, k);
      if (!r && pattern[q] === "/") r = at(q + 1, s);
    } else if (c === "*") {
      for (let k = s; !r; k++) {
        r = at(p + 1, k);
        if (k === path.length || path[k] === "/") break;
      }
    } else if (c === "?") r = s < path.length && path[s] !== "/" && at(p + 1, s + 1);
    else r = s < path.length && path[s] === c && at(p + 1, s + 1);
    memo.set(key, r);
    return r;
  };
  return at(0, 0);
}

const gitOut = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

function resolveFiles(root, list) {
  const out = [];
  let tracked;
  for (const raw of list) {
    const p = raw.replace(/\\/g, "/");
    if (p.includes("*") || p.includes("?")) {
      tracked ??= gitOut(root, "ls-files").split("\n").filter(Boolean);
      out.push(...tracked.filter((f) => globMatch(p, f)));
    } else out.push(p);
  }
  return [...new Set(out)];
}

/**
 * @param {string[]} argv
 * @param {{ root?: string, log?: (s: string) => void, run?: (tests: string[], timeoutSec: number) => Promise<any>,
 *   now?: () => number, env?: Record<string, string | undefined> }} [deps] `root` is the repository
 *   (default the working directory); `run` replaces vitest, `now` the clock, `env` `process.env`
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  const root = resolve(deps.root ?? process.cwd());
  const log = deps.log ?? ((s) => console.log(s));
  const run = deps.run ?? ((tests, timeoutSec) => runVitest(tests, timeoutSec, root));
  const now = deps.now ?? Date.now;
  const env = deps.env ?? process.env;
  const refuse = (msg) => {
    log(`mutants: ${msg}`);
    return 2;
  };
  const opt = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const int = (name, dflt) => {
    const v = opt(name, undefined);
    if (v === undefined) return dflt;
    return /^\d+$/.test(v) ? Number(v) : Number.NaN;
  };
  const files = resolveFiles(root, (opt("--files", undefined) ?? DEFAULT_FILES.join(",")).split(",").filter(Boolean));
  const n = int("--mutants", 40);
  const seed = int("--seed", dateSeed());
  const timeout = int("--timeout", 180);
  const maxTests = int("--max-tests", 20);
  const budgetMinutes = int("--budget-minutes", 85);
  const allowPath = opt("--allow", "test/mutants.allow.json");
  const reportPath = opt("--report", undefined);
  const dryRun = argv.includes("--dry-run");
  for (const [k, v] of Object.entries({ "--mutants": n, "--timeout": timeout, "--max-tests": maxTests })) {
    if (!Number.isInteger(v) || v < 1) return refuse(`${k} needs a positive integer`);
  }
  for (const [k, v] of Object.entries({ "--seed": seed, "--budget-minutes": budgetMinutes })) {
    if (!Number.isInteger(v)) return refuse(`${k} needs a non-negative integer`);
  }
  if (files.length === 0) return refuse("--files matched nothing");
  for (const f of files) if (!existsSync(join(root, f))) return refuse(`no such file: ${f}`);

  let allow = [];
  const allowFile = resolve(root, allowPath);
  if (existsSync(allowFile)) {
    try {
      allow = parseAllow(readFileSync(allowFile, "utf8"));
    } catch (e) {
      return refuse(`cannot read the allow-list ${allowPath}: ${e.message}`);
    }
  } else if (opt("--allow", undefined) !== undefined) return refuse(`no such allow-list: ${allowPath}`);

  if (!dryRun) {
    const dirty = gitOut(root, "status", "--porcelain", "--", ...files).trim();
    if (dirty) return refuse(`refusing to mutate files with uncommitted changes:\n${dirty}`);
  }

  const originals = new Map(files.map((f) => [f, readFileSync(join(root, f))]));
  const all = files.flatMap((f) => enumerateSites(f, originals.get(f).toString("utf8")));
  const sampled = sampleSites(all, n, seed);
  const tests = {};
  for (const f of new Set(sampled.map((s) => s.file))) {
    const related = nearestTests(root, [f]);
    tests[f] = { list: related.slice(0, maxTests), related: related.length };
  }
  const staleAllow = allow.filter((a) => !all.some((s) => allowRow(s, [a])));
  const results = sampled.map((site) => ({ ...site, verdict: "not run" }));
  const t0 = now();

  // The report and the step summary are rewritten after every run, so a cancelled or timed-out
  // job still leaves every verdict reached so far.
  const write = (final) => {
    const { counts, score } = tally(results);
    const report = {
      seed,
      files,
      operators: OPERATORS,
      sitesTotal: all.length,
      timeoutSec: timeout,
      budgetMinutes,
      dryRun,
      final,
      seconds: Math.round((now() - t0) / 1000),
      counts,
      score,
      tests,
      results: results.map(({ start, end, ...r }) => r),
      staleAllow,
    };
    const md = markdown(report);
    if (env.GITHUB_STEP_SUMMARY && !dryRun) writeFileSync(env.GITHUB_STEP_SUMMARY, `${md}\n`);
    if (reportPath) writeFileSync(resolve(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);
    return md;
  };
  onSignal = (sig) => {
    for (const r of results) if (r.verdict === "running") r.verdict = "interrupted";
    log(`mutants: ${sig}; the report keeps the verdicts reached so far`);
    write(false);
  };

  let outOfBudget = false;
  const spent = () => {
    outOfBudget ||= now() - t0 >= budgetMinutes * 60_000;
    return outOfBudget;
  };
  try {
    for (const row of results) {
      if (dryRun) continue;
      const t = tests[row.file];
      if (t.list.length === 0) {
        row.verdict = "skipped";
        row.reason = "no nearest test";
        continue;
      }
      if (spent()) {
        row.verdict = "not run (budget)";
        continue;
      }
      if (!t.baseline) {
        t.baseline = await run(t.list, timeout * 2);
        log(
          `mutants: baseline for ${row.file} (${t.list.length} test files): ${t.baseline.status} in ${t.baseline.seconds}s`,
        );
        write(false);
        if (t.baseline.status === "pass" && spent()) {
          row.verdict = "not run (budget)";
          continue;
        }
      }
      if (t.baseline.status !== "pass") {
        row.verdict = "skipped";
        row.reason = `baseline ${t.baseline.status}`;
        continue;
      }
      const path = join(root, row.file);
      const bytes = originals.get(row.file);
      let res;
      guardExit();
      row.verdict = "running";
      try {
        pending = { path, bytes };
        writeFileSync(path, applySite(bytes.toString("utf8"), row));
        res = await run(t.list, timeout);
      } catch (e) {
        row.verdict = "interrupted";
        row.reason = `the runner threw: ${e?.message ?? e}`;
        throw e;
      } finally {
        restore();
      }
      row.seconds = res.seconds;
      if (res.status === "fail") {
        row.verdict = "killed";
        row.killer = res.killer;
      } else if (res.status === "pass") {
        const a = allowRow(row, allow);
        row.verdict = a ? "equivalent (allow-listed)" : "survived";
        if (a) row.reason = a.reason;
      } else {
        row.verdict = res.status;
        if (res.reason) row.reason = res.reason;
        if (res.tail) row.tail = res.tail;
      }
      log(`mutants: ${row.file}:${row.line} ${row.operator} → ${row.verdict} (${res.seconds}s)`);
      write(false);
    }
  } finally {
    onSignal = undefined;
    // Also on a throw: the row that was running says so, and the rest stay `not run`.
    const md = write(true);
    log(md);
  }
  return argv.includes("--fail-on-survivor") && tally(results).counts.survived > 0 ? 1 : 0;
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code));
