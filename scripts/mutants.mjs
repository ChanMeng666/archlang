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
 *                            [--max-tests N] [--allow <path>] [--report <out.json>] [--dry-run]
 *                            [--fail-on-survivor]
 *
 * Defaults: `--files src/num-format.ts,src/expr.ts`, `--mutants 40`, `--seed` the UTC date as
 * `YYYYMMDD` (each night samples differently, and a night is reproducible from its seed),
 * `--timeout 180` seconds per mutant, `--max-tests 20`, `--allow test/mutants.allow.json`.
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
 * skips that file's mutants rather than calling them killed. Verdicts: `killed` (a test failed),
 * `survived`, `equivalent (allow-listed)` (a survivor with a row in the allow-list:
 * `{ file, line, operator, before, after, reason }`, `before`/`after` the trimmed source line),
 * `timeout`, `error` (vitest wrote no report), `skipped` (baseline red, or no nearest test).
 *
 * Output: a Markdown table on stdout (and appended to `$GITHUB_STEP_SUMMARY` when set), the JSON
 * report at `--report`. Exit 0 always — report-only — except 1 under `--fail-on-survivor` when a
 * survivor is not allow-listed, and 2 for a refusal: bad arguments, an unreadable allow-list, or a
 * target file with uncommitted changes (the sampler writes target files in place, so it refuses
 * to start on a dirty one rather than risk mixing its bytes into real work).
 */
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { nearestTests } from "./nearest-tests.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

/** Run vitest on `tests`; resolves `{ status: "pass"|"fail"|"timeout"|"error", killer?, seconds, tail? }`. */
export function runVitest(tests, timeoutSec) {
  const out = mkdtempSync(join(tmpdir(), "archlang-mutants-"));
  const reportFile = join(out, "report.json");
  const bin = join(ROOT, "node_modules", "vitest", "vitest.mjs");
  const args = [
    bin,
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
    // Its own process group on POSIX, so a timeout kills the workers too, not only the parent.
    const child = spawn(process.execPath, args, { cwd: ROOT, detached: process.platform !== "win32" });
    activeChild = child;
    let tail = "";
    const keep = (b) => {
      tail = (tail + b.toString()).slice(-4000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutSec * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      activeChild = undefined;
      const seconds = Math.round((Date.now() - t0) / 100) / 10;
      let report;
      try {
        report = JSON.parse(readFileSync(reportFile, "utf8"));
      } catch {
        report = undefined;
      }
      rmSync(out, { recursive: true, force: true });
      if (timedOut) return done({ status: "timeout", seconds });
      if (code === 0) return done({ status: "pass", seconds });
      if (!report) return done({ status: "error", seconds, tail });
      done({ status: "fail", killer: killerOf(report), seconds });
    });
  });
}

/** The first failing test (`file › name`), else the first failing file, from a vitest JSON report. */
export function killerOf(report) {
  for (const f of report.testResults ?? []) {
    const file = relative(ROOT, f.name ?? "").replace(/\\/g, "/");
    const a = (f.assertionResults ?? []).find((x) => x.status === "failed");
    if (a) return `${file} › ${a.fullName ?? a.title}`;
  }
  for (const f of report.testResults ?? []) {
    if (f.status === "failed") return relative(ROOT, f.name ?? "").replace(/\\/g, "/");
  }
  return "an unhandled error";
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
      process.exit(130);
    });
  }
  process.on("exit", restore);
}

// ---- report ----------------------------------------------------------------------------------

// A table cell: a pipe escaped (GFM honours `\|` inside a code span too), a backtick and a newline
// replaced, so the cell cannot end its code span or its row.
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/`/g, "'").replace(/\n/g, " ");
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

export function markdown(r) {
  const c = r.counts;
  const head = r.dryRun
    ? `## Sampled mutants — dry run (seed ${r.seed})`
    : `## Sampled mutants (report-only, never gates) — seed ${r.seed}`;
  const summary = r.dryRun
    ? `${r.results.length} of ${r.sitesTotal} sites sampled; nothing run.`
    : `${r.results.length} of ${r.sitesTotal} sites: ${c.killed} killed, ${c.survived} survived, ` +
      `${c.equivalent} equivalent (allow-listed), ${c.timeout} timeout, ${c.error} error, ${c.skipped} skipped. ` +
      `Mutation score ${r.score === null ? "n/a" : `${r.score}%`} (killed + timeout over killed + timeout + survived).`;
  const rows = r.results.map((x, i) => {
    const at = firstDiff(x.before, x.after);
    return (
      `| ${i + 1} | \`${x.file}:${x.line}\` | ${x.operator} | \`${cell(clip(x.before, at))}\` → \`${cell(clip(x.after, at))}\` | ` +
      `${x.verdict}${x.reason ? ` (${cell(x.reason)})` : ""} | ${x.killer ? cell(x.killer) : ""} | ${x.seconds ?? ""} |`
    );
  });
  const tests = Object.entries(r.tests).map(
    ([f, t]) =>
      `- \`${f}\`: ${t.list.length} nearest test files` +
      (t.baseline ? `, unmutated baseline ${t.baseline.status} in ${t.baseline.seconds}s` : ""),
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

function globToRegExp(g) {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*" && g[i + 1] === "*") {
      re += ".*";
      i++;
      if (g[i + 1] === "/") i++;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const gitOut = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

function resolveFiles(list) {
  const out = [];
  let tracked;
  for (const p of list) {
    if (/[*?]/.test(p)) {
      tracked ??= gitOut("ls-files").split("\n").filter(Boolean);
      const re = globToRegExp(p);
      out.push(...tracked.filter((f) => re.test(f)));
    } else out.push(p.replace(/\\/g, "/"));
  }
  return [...new Set(out)];
}

/**
 * @param {string[]} argv
 * @param {{ log?: (s: string) => void, run?: typeof runVitest }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  const log = deps.log ?? ((s) => console.log(s));
  const run = deps.run ?? runVitest;
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
  const files = resolveFiles((opt("--files", undefined) ?? DEFAULT_FILES.join(",")).split(",").filter(Boolean));
  const n = int("--mutants", 40);
  const seed = int("--seed", dateSeed());
  const timeout = int("--timeout", 180);
  const maxTests = int("--max-tests", 20);
  const allowPath = opt("--allow", "test/mutants.allow.json");
  const reportPath = opt("--report", undefined);
  const dryRun = argv.includes("--dry-run");
  for (const [k, v] of Object.entries({
    "--mutants": n,
    "--seed": seed,
    "--timeout": timeout,
    "--max-tests": maxTests,
  })) {
    if (!Number.isInteger(v) || (k !== "--seed" && v < 1)) return refuse(`${k} needs a positive integer`);
  }
  if (files.length === 0) return refuse("--files matched nothing");
  for (const f of files) if (!existsSync(join(ROOT, f))) return refuse(`no such file: ${f}`);

  let allow = [];
  const allowFile = join(ROOT, allowPath);
  if (existsSync(allowFile)) {
    try {
      allow = parseAllow(readFileSync(allowFile, "utf8"));
    } catch (e) {
      return refuse(`cannot read the allow-list ${allowPath}: ${e.message}`);
    }
  } else if (opt("--allow", undefined) !== undefined) return refuse(`no such allow-list: ${allowPath}`);

  if (!dryRun) {
    const dirty = gitOut("status", "--porcelain", "--", ...files).trim();
    if (dirty) return refuse(`refusing to mutate files with uncommitted changes:\n${dirty}`);
  }

  const originals = new Map(files.map((f) => [f, readFileSync(join(ROOT, f))]));
  const all = files.flatMap((f) => enumerateSites(f, originals.get(f).toString("utf8")));
  const sampled = sampleSites(all, n, seed);
  const tests = {};
  for (const f of new Set(sampled.map((s) => s.file))) tests[f] = { list: nearestTests(ROOT, [f]).slice(0, maxTests) };
  const staleAllow = allow.filter((a) => !all.some((s) => allowRow(s, [a])));

  const results = [];
  const t0 = Date.now();
  for (const site of sampled) {
    const t = tests[site.file];
    const row = { ...site, verdict: "not run" };
    results.push(row);
    if (dryRun) continue;
    if (t.list.length === 0) {
      row.verdict = "skipped";
      row.reason = "no nearest test";
      continue;
    }
    if (!t.baseline) {
      t.baseline = await run(t.list, timeout * 2);
      log(
        `mutants: baseline for ${site.file} (${t.list.length} test files): ${t.baseline.status} in ${t.baseline.seconds}s`,
      );
    }
    if (t.baseline.status !== "pass") {
      row.verdict = "skipped";
      row.reason = `baseline ${t.baseline.status}`;
      continue;
    }
    const path = join(ROOT, site.file);
    const bytes = originals.get(site.file);
    let res;
    guardExit();
    try {
      pending = { path, bytes };
      writeFileSync(path, applySite(bytes.toString("utf8"), site));
      res = await run(t.list, timeout);
    } finally {
      restore();
    }
    row.seconds = res.seconds;
    if (res.status === "fail") {
      row.verdict = "killed";
      row.killer = res.killer;
    } else if (res.status === "pass") {
      const a = allowRow(site, allow);
      row.verdict = a ? "equivalent (allow-listed)" : "survived";
      if (a) row.reason = a.reason;
    } else {
      row.verdict = res.status;
      if (res.tail) row.tail = res.tail;
    }
    log(`mutants: ${site.file}:${site.line} ${site.operator} → ${row.verdict} (${res.seconds}s)`);
  }

  const counts = { killed: 0, survived: 0, equivalent: 0, timeout: 0, error: 0, skipped: 0 };
  for (const r of results) {
    if (r.verdict === "equivalent (allow-listed)") counts.equivalent++;
    else if (r.verdict in counts) counts[r.verdict]++;
  }
  const scored = counts.killed + counts.timeout + counts.survived;
  const report = {
    seed,
    files,
    operators: OPERATORS,
    sitesTotal: all.length,
    timeoutSec: timeout,
    dryRun,
    seconds: Math.round((Date.now() - t0) / 1000),
    counts,
    score: scored ? Math.round(((counts.killed + counts.timeout) / scored) * 1000) / 10 : null,
    tests,
    results: results.map(({ start, end, ...r }) => r),
    staleAllow,
  };
  const md = markdown(report);
  log(md);
  if (process.env.GITHUB_STEP_SUMMARY && !dryRun) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  if (reportPath) writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  return argv.includes("--fail-on-survivor") && counts.survived > 0 ? 1 : 0;
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code));
