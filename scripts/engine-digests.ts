/**
 * Cross-engine determinism measurement (`npm run digest:engines`) — MEASURES, NEVER FIXES.
 *
 * ECMA-262 pins `+ - * /` and `Math.sqrt` exactly; `sin`, `cos`, `atan2`, `hypot`, `log2`, `pow`
 * and friends are only "implementation-approximated". CI pins digests on V8 across Node 18/20/22,
 * but SpiderMonkey (Firefox) and JavaScriptCore (WebKit/Safari) were never compared, and the
 * playground runs this very core in any browser. This script closes that gap as a MEASUREMENT:
 *
 *   1. build the corpus (examples incl. lib, test/fixtures, test/recovery-corpus, eval/goldens,
 *      eval/fidelity-plans) plus a small probe set aimed at the transcendental hot spots;
 *   2. digest each source in-process on Node, through the BUILT `dist/`;
 *   3. serve `dist/` to Playwright's chromium, firefox and webkit on a fake origin, `import()` the
 *      core in the page, rebuild the payload from the SAME payload functions
 *      (`test/byte-identity-payload.ts`, via `Function.prototype.toString`) and hash with
 *      `crypto.subtle`;
 *   4. compare every engine with Node, and Node with the pinned `while-byte-identity` baseline
 *      where one exists; for a mismatch name the first differing payload part and its bytes.
 *
 * It ALWAYS exits 0 and writes a Markdown report (`--out <file>`, default
 * `engine-digests-report.md`); the last stdout line is `status=clean|diverged` (`incomplete` when an
 * engine could not be launched, so a missing browser is never reported as agreement). Deciding what
 * to do about a divergence — e.g. replacing hypot/atan2/log2 — is a separate, owner-gated decision.
 *
 * Browser location: honours `PLAYWRIGHT_BROWSERS_PATH` as Playwright does.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, type Browser, type BrowserType } from "@playwright/test";
import * as core from "../dist/index.js";
import {
  allStoreysDiagnosticsParts,
  allStoreysDiagnosticsPayload,
  engineProbeParts,
  type CompilerApi,
} from "../test/byte-identity-payload.js";
import { BASELINE } from "../test/while-byte-identity-baseline.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");
// https: `crypto.subtle` exists only in a secure context; `page.route` answers every request, nothing leaves the machine.
const ORIGIN = "https://archlang.test";
const NOW_MS = 0;

/** One compilation unit: a source plus the in-memory files its `import`s may read. */
interface Entry {
  name: string;
  src: string;
  /** Relative path -> source, rooted where the plan's own directory is (the Node `World` of the tests). */
  files: Record<string, string>;
}

type Kind = "core" | "facts";
const KINDS: readonly Kind[] = ["core", "facts"];

/** Per (entry, kind): the digest of the joined payload and one digest per part. */
interface Measure {
  digest: string;
  partDigests: string[];
  error?: string;
}

/** Aimed at sin/cos (hatch angle, glyphs), atan2/hypot (arcs, oblique walls, door tangents), log2 (`--facts syntax`). */
const PROBES: ReadonlyArray<readonly [string, string]> = [
  [
    "probe/oblique-walls.arch",
    `plan "Probe oblique" {
  units mm
  dims auto
  wall id=outer exterior thickness 200 material brick scale 1.7 angle 37 { (0,0) (7000,0) (9000,3100) (6500,6300) (0,5200) close }
  wall id=div partition thickness 100 { (2000,0) (3300,5400) }
  room id=main polygon (0,0) (7000,0) (9000,3100) (6500,6300) (0,5200) label "Oblique hall"
  door on outer at 55% width 900
  window on outer at 3% width 1200
  door on div at 30% width 800
  furniture sofa at (1000,3000) size 2000x900 rotate 90
  furniture table at (4000,2000) size 1600x900 rotate 270
}
`,
  ],
  [
    "probe/arcs-and-circles.arch",
    `plan "Probe arcs" {
  units mm
  dims auto
  wall id=ring exterior thickness 250 material concrete angle 23 { (0,3000) arc (6000,3000) radius 3000 cw arc (0,3000) radius 3000 cw close }
  wall id=bay exterior thickness 200 { (7000,0) (10000,0) arc (10000,4000) radius 2600 ccw (7000,4000) close }
  room id=rot circle at (3000,3000) radius 2800 label "Rotunda"
  room id=sq at (7200,200) size 2500x3600 label "Bay"
  door on ring at 25% width 1000
  door on bay at 60% width 900
  window on ring at 70% width 1100
  dim diameter rot
  dim radius ring segment 1
  outdoor planting at (-3500,0) size 2800x2800 label "Beds"
  outdoor water at (-3500,3200) size 2800x2400 label "Pool"
}
`,
  ],
];

// ---------------------------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------------------------

/** Every `.arch` under `dir`, keyed by its path relative to `dir` (forward slashes). */
function archFilesUnder(dir: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const p = rel ? `${rel}/${name}` : name;
    if (statSync(join(dir, p)).isDirectory()) Object.assign(out, archFilesUnder(dir, p));
    else if (name.endsWith(".arch")) out[p] = readFileSync(join(dir, p), "utf8");
  }
  return out;
}

/** The directories swept, as `[repo-relative dir, recurse into subdirectories?]`. */
const CORPUS_DIRS: ReadonlyArray<readonly [string, boolean]> = [
  ["examples", false],
  ["examples/lib", false],
  ["test/fixtures", false],
  ["test/recovery-corpus", false],
  ["eval/goldens", false],
  ["eval/fidelity-plans", false],
];

function buildCorpus(): Entry[] {
  const entries: Entry[] = [];
  for (const [dir] of CORPUS_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    // A plan's own directory is its World root (as the tests build it), so `import "lib/x.arch"` resolves.
    const flat: Record<string, string> = {};
    for (const f of readdirSync(abs).sort())
      if (f.endsWith(".arch") && statSync(join(abs, f)).isFile()) flat[f] = readFileSync(join(abs, f), "utf8");
    const files = dir === "examples" ? archFilesUnder(abs) : flat;
    for (const [f, src] of Object.entries(flat)) entries.push({ name: `${dir}/${f}`, src, files });
  }
  for (const [name, src] of PROBES) entries.push({ name, src, files: { "probe.arch": src } });
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Node side
// ---------------------------------------------------------------------------------------------

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

const API = { compile: core.compile, describe: core.describe, lint: core.lint } as CompilerApi;

function nodeMeasure(e: Entry, kind: Kind): { m: Measure; parts: string[] } {
  try {
    const opts = { world: core.makeVirtualWorld(e.files, () => new Date(NOW_MS)) };
    const parts = (kind === "core" ? allStoreysDiagnosticsParts : engineProbeParts)(API, e.src, opts);
    const payload = kind === "core" ? allStoreysDiagnosticsPayload(API, e.src, opts) : parts.join(" ");
    if (kind === "core" && payload !== parts.join(" ")) throw new Error("parts.join(' ') != payload on Node");
    return { m: { digest: sha256(payload), partDigests: parts.map(sha256) }, parts };
  } catch (err) {
    return { m: { digest: "", partDigests: [], error: String(err) }, parts: [] };
  }
}

// ---------------------------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------------------------

const MIME: Record<string, string> = { ".js": "text/javascript", ".map": "application/json", ".html": "text/html" };

/** The page-side program. Plain JS (no TS) because it is evaluated as a string argument. */
const PAGE_PROGRAM = `
async ({ origin, nowMs, entries, fns, wantParts }) => {
  const mod = await import(origin + "/dist/index.js");
  const api = { compile: mod.compile, describe: mod.describe, lint: mod.lint };
  const make = (src) => (0, eval)("(" + src + ")");
  const payloadFn = make(fns.payload);
  const partsFn = { core: make(fns.coreParts), facts: make(fns.factsParts) };
  const enc = new TextEncoder();
  const sha = async (s) => {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  const out = {};
  for (const e of entries) {
    for (const kind of ["core", "facts"]) {
      const key = e.name + "|" + kind;
      if (wantParts && !wantParts.includes(key)) continue;
      try {
        const opts = { world: mod.makeVirtualWorld(e.files, () => new Date(nowMs)) };
        const parts = partsFn[kind](api, e.src, opts);
        const payload = kind === "core" ? payloadFn(api, e.src, opts) : parts.join(" ");
        if (kind === "core" && payload !== parts.join(" ")) throw new Error("parts.join(' ') != payload in page");
        const r = { digest: await sha(payload), partDigests: await Promise.all(parts.map(sha)) };
        if (wantParts) r.parts = parts;
        out[key] = r;
      } catch (err) {
        out[key] = { digest: "", partDigests: [], error: String(err && err.message || err) };
      }
    }
  }
  return out;
}
`;

function fnSource(f: (...a: never[]) => unknown): string {
  const s = f.toString();
  // A transpiler helper (esbuild's `__name`) inside the body would be a free identifier in the page.
  if (/__name|__publicField|__spreadValues/.test(s))
    throw new Error(`${f.name}: serialised source references a transpiler helper`);
  return s;
}

const FNS = {
  payload: fnSource(allStoreysDiagnosticsPayload),
  coreParts: fnSource(allStoreysDiagnosticsParts),
  factsParts: fnSource(engineProbeParts),
};

interface EngineRun {
  engine: string;
  version: string;
  results: Record<string, Measure & { parts?: string[] }>;
  error?: string;
}

async function runEngine(type: BrowserType, entries: Entry[], wantParts?: string[]): Promise<EngineRun> {
  const run: EngineRun = { engine: type.name(), version: "?", results: {} };
  let browser: Browser | undefined;
  try {
    browser = await type.launch();
    run.version = browser.version();
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/")
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><title>engine-digests</title>",
        });
      if (url.pathname.startsWith("/dist/")) {
        const file = join(DIST, url.pathname.slice("/dist/".length));
        if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile())
          return route.fulfill({
            status: 200,
            contentType: MIME[extname(file)] ?? "application/octet-stream",
            body: readFileSync(file),
          });
      }
      return route.fulfill({ status: 404, body: "not found" });
    });
    await page.goto(`${ORIGIN}/`);
    run.results = (await page.evaluate(
      `(${PAGE_PROGRAM})(${JSON.stringify({ origin: ORIGIN, nowMs: NOW_MS, entries, fns: FNS, wantParts: wantParts ?? null })})`,
    )) as EngineRun["results"];
  } catch (err) {
    run.error = String((err as Error)?.message ?? err).split("\n")[0];
  } finally {
    await browser?.close().catch(() => undefined);
  }
  return run;
}

// ---------------------------------------------------------------------------------------------
// Comparison + report
// ---------------------------------------------------------------------------------------------

const PART_NAMES = (n: number): string[] => {
  // core parts: page SVGs..., describe, lint, diagnostics; facts parts add a trailing describe+facts.
  return Array.from({ length: n }, (_, i) => `part ${i}`);
};

function partLabel(i: number, partCount: number, kind: Kind): string {
  const tail =
    kind === "core"
      ? ["describe", "lint", "diagnostics"]
      : ["describe", "lint", "diagnostics", "describe --facts symmetry,syntax"];
  const pages = partCount - tail.length;
  if (i < pages) return `page ${i + 1} SVG`;
  return tail[i - pages] ?? PART_NAMES(partCount)[i] ?? `part ${i}`;
}

function esc(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** The first differing code unit of two strings, with a short escaped window around it. */
function byteContext(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const win = (s: string): string => esc(s.slice(Math.max(0, i - 30), i + 30));
  return `at offset ${i} (node len ${a.length}, engine len ${b.length}): node \`...${win(a)}...\` vs engine \`...${win(b)}...\``;
}

const key = (name: string, kind: Kind): string => `${name}|${kind}`;

async function main(): Promise<void> {
  const outArg = process.argv.indexOf("--out");
  const outFile =
    outArg >= 0 && process.argv[outArg + 1]
      ? resolve(process.argv[outArg + 1] as string)
      : resolve("engine-digests-report.md");

  const entries = buildCorpus();
  const node = new Map<string, { m: Measure; parts: string[] }>();
  for (const e of entries) for (const k of KINDS) node.set(key(e.name, k), nodeMeasure(e, k));

  const baseline = new Map(BASELINE.map(([n, h]) => [n, h] as const));
  const baselineProblems: string[] = [];
  let baselineChecked = 0;
  for (const [name, hash] of baseline) {
    const got = node.get(key(name, "core"));
    if (!got) baselineProblems.push(`${name}: pinned but not in the corpus`);
    else if (got.m.digest !== hash)
      baselineProblems.push(`${name}: Node digest ${got.m.digest.slice(0, 12)} != pinned ${hash.slice(0, 12)}`);
    else baselineChecked++;
  }

  const types: BrowserType[] = [chromium, firefox, webkit];
  const runs: EngineRun[] = [];
  for (const t of types) runs.push(await runEngine(t, entries));

  // Divergences: (engine, entry, kind) whose digest differs from Node's.
  interface Div {
    engine: string;
    name: string;
    kind: Kind;
    first: string;
  }
  const divs: Div[] = [];
  const wantParts = new Map<string, string[]>(); // engine -> keys needing parts
  for (const r of runs) {
    if (r.error) continue;
    for (const e of entries)
      for (const k of KINDS) {
        const n = node.get(key(e.name, k))!;
        const g = r.results[key(e.name, k)];
        if (!g || g.digest !== n.m.digest || g.error || n.m.error) {
          divs.push({ engine: r.engine, name: e.name, kind: k, first: "" });
          wantParts.set(r.engine, [...(wantParts.get(r.engine) ?? []), key(e.name, k)]);
        }
      }
  }
  for (const t of types) {
    const want = wantParts.get(t.name());
    if (!want || want.length === 0) continue;
    const detail = await runEngine(
      t,
      entries.filter((e) => want.some((w) => w.startsWith(e.name + "|"))),
      want,
    );
    for (const d of divs.filter((x) => x.engine === t.name())) {
      const n = node.get(key(d.name, d.kind))!;
      const g = detail.results[key(d.name, d.kind)];
      if (n.m.error || g?.error) {
        d.first = `error: node=${n.m.error ?? "ok"}; engine=${g?.error ?? "ok"}`.slice(0, 300);
        continue;
      }
      if (!g?.parts) {
        d.first = "engine did not return parts";
        continue;
      }
      const count = Math.max(n.parts.length, g.parts.length);
      for (let i = 0; i < count; i++) {
        if (n.parts[i] !== g.parts[i]) {
          d.first = `${partLabel(i, n.parts.length, d.kind)}: ${byteContext(n.parts[i] ?? "", g.parts[i] ?? "")}`;
          break;
        }
      }
      if (!d.first) d.first = "no part differs (digest mismatch only)";
    }
  }

  const failedEngines = runs.filter((r) => r.error);
  const status =
    divs.length > 0 || baselineProblems.length > 0 ? "diverged" : failedEngines.length > 0 ? "incomplete" : "clean";

  // Report
  const L: string[] = [];
  L.push("# Cross-engine determinism report", "");
  L.push(
    `Node ${process.version} (V8) in-process vs ${runs.map((r) => `${r.engine} ${r.version}`).join(", ")}; corpus ${entries.length} plans (${entries.length - PROBES.length} files + ${PROBES.length} probes) x ${KINDS.length} payloads.`,
    "",
  );
  L.push(
    "`core` = SVG of every page + `describe()` + `lint()` + `compile().diagnostics` (the `while-byte-identity` payload); `facts` = the same plus `describe({facts:[symmetry,syntax]})` (sin/cos/atan2/log2). All engines run the same payload functions from `test/byte-identity-payload.ts` over the built `dist/`.",
    "",
  );
  L.push(
    "## Summary",
    "",
    "| Engine | Version | Identical to Node | Diverged | Note |",
    "| --- | --- | --- | --- | --- |",
  );
  const total = entries.length * KINDS.length;
  for (const r of runs) {
    const d = divs.filter((x) => x.engine === r.engine).length;
    L.push(
      `| ${r.engine} | ${r.version} | ${r.error ? "-" : total - d} / ${total} | ${r.error ? "-" : d} | ${r.error ? `UNAVAILABLE: ${r.error}` : ""} |`,
    );
  }
  L.push(
    "",
    `Node vs the pinned \`while-byte-identity\` baseline: ${baselineChecked} / ${baseline.size} identical${baselineProblems.length ? "; **problems**:" : "."}`,
  );
  for (const p of baselineProblems) L.push(`- ${p}`);
  L.push("");
  if (divs.length > 0) {
    L.push("## Divergences", "", "| Engine | Plan | Payload | First differing part |", "| --- | --- | --- | --- |");
    for (const d of divs) L.push(`| ${d.engine} | \`${d.name}\` | ${d.kind} | ${d.first.replace(/\|/g, "\\|")} |`);
    L.push("");
  } else L.push("## Divergences", "", failedEngines.length ? "None among the engines that ran." : "None.", "");
  L.push(
    "## Per file",
    "",
    `| Plan | pinned | ${runs.map((r) => `${r.engine} core | ${r.engine} facts`).join(" | ")} |`,
    `| --- | --- | ${runs.map(() => "--- | ---").join(" | ")} |`,
  );
  for (const e of entries) {
    const cell = (r: EngineRun, k: Kind): string =>
      r.error
        ? "n/a"
        : divs.some((d) => d.engine === r.engine && d.name === e.name && d.kind === k)
          ? "**DIVERGED**"
          : "clean";
    const pin = baseline.has(e.name)
      ? baselineProblems.some((p) => p.startsWith(e.name + ":"))
        ? "**MOVED**"
        : "ok"
      : "-";
    L.push(`| \`${e.name}\` | ${pin} | ${runs.map((r) => `${cell(r, "core")} | ${cell(r, "facts")}`).join(" | ")} |`);
  }
  L.push("", `status=${status}`);
  writeFileSync(outFile, L.join("\n") + "\n");

  console.log(L.slice(0, L.indexOf("## Per file")).join("\n"));
  console.log(`report: ${outFile}`);
  console.log(`status=${status}`);
}

main()
  .catch((err) => {
    // Advisory by contract: never a non-zero exit, never a missing status line.
    console.log(`engine-digests failed: ${String((err as Error)?.stack ?? err)}`);
    console.log("status=incomplete");
  })
  .finally(() => {
    process.exitCode = 0;
  });
