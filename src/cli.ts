#!/usr/bin/env node
/**
 * ArchLang CLI — agent-native.
 *
 * Every command takes `--json`: structured result to **stdout**, human messages to
 * **stderr**, so an AI agent pipes stdout straight into a parser. Exit codes are
 * deterministic — `0` ok · `2` user-source error (don't blindly retry) · `1`
 * internal/IO · `3` bad usage — and every JSON diagnostic carries the catalog `fix`,
 * so the self-correction loop needs no docs lookup. Source can come from a file or
 * from stdin (`-`), and artifacts can go to stdout (`-o -`).
 *
 * Verbs:
 *   compile   render a plan to SVG/DXF/PDF/PNG
 *   watch     recompile on save (human/interactive)
 *   validate  parse + resolve + lint, no render (is it valid & sound?)
 *   describe  semantic facts: rooms, areas, adjacency, what doors connect
 *   lint      architectural soundness warnings
 *   fmt       canonical formatting
 *   spec      print the one-prompt language spec (spec.llm.md)
 *   new       scaffold a starter .arch
 *   explain   look up an error code
 */

import { readFileSync, writeFileSync, existsSync, watchFile } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compile,
  describe,
  lint,
  LINT_PROFILE_NAMES,
  explain,
  format,
  formatDiagnostic,
  offsetToLineCol,
  ERROR_CATALOG,
  loadClipperBackend,
  renderPng,
  setGeometryBackend,
  toDxf,
  toPdf,
} from "./index.js";
import type { Diagnostic, World } from "./index.js";

type Format = "svg" | "dxf" | "pdf" | "png";

/** Deterministic exit codes (documented in `--help`). */
const EXIT = { OK: 0, INTERNAL: 1, USER: 2, USAGE: 3 } as const;

const HERE = dirname(fileURLToPath(import.meta.url));

interface Args {
  _: string[];
  o?: string;
  width?: number;
  format?: string;
  write?: boolean;
  json?: boolean;
  quiet?: boolean;
  force?: boolean;
  profile?: string;
}

function parseArgs(argv: string[]): Args {
  const res: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") res.o = argv[++i];
    else if (a === "-w" || a === "--width") res.width = Number(argv[++i]);
    else if (a === "-f" || a === "--format") res.format = argv[++i];
    else if (a === "--write") res.write = true;
    else if (a === "--json") res.json = true;
    else if (a === "--quiet" || a === "-q") res.quiet = true;
    else if (a === "--force") res.force = true;
    else if (a === "--profile") res.profile = argv[++i];
    else res._.push(a);
  }
  return res;
}

/** Read source from a file, or from stdin when `path` is `-`. */
function readInput(path: string): string {
  return path === "-" ? readFileSync(0, "utf8") : readFileSync(resolvePath(path), "utf8");
}

/** A real-filesystem {@link World}: imports resolve against `baseDir`; `now` is the
 *  wall clock. The one spot Node APIs + real time are allowed. */
function makeNodeWorld(baseDir: string): World {
  return {
    read(path: string): string | null {
      try {
        return readFileSync(resolvePath(baseDir, path), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(),
  };
}

/** Base dir for import resolution given the input path (cwd for stdin). */
const baseDirOf = (input: string): string => (input === "-" ? process.cwd() : dirname(resolvePath(input)));

async function tryLoadGeometryBackend(): Promise<void> {
  try {
    setGeometryBackend(await loadClipperBackend());
  } catch {
    // clipper2-wasm not installed — angled walls fall back to per-segment.
  }
}

/** A diagnostic projected to the agent-friendly JSON shape (with `fix`). */
function diagToJson(source: string, d: Diagnostic): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.code) out.code = d.code;
  out.severity = d.severity;
  out.message = d.message;
  if (d.span) {
    const { line, col } = offsetToLineCol(source, d.span.start);
    out.line = line;
    out.col = col;
    out.span = [d.span.start, d.span.end];
  }
  const fix = d.code ? ERROR_CATALOG[d.code]?.fix : undefined;
  if (fix) out.fix = fix;
  if (d.hints?.length) out.hints = d.hints;
  return out;
}

function emitJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

/** Print diagnostics as framed snippets to stderr (unless quiet). */
function emitDiagnosticsHuman(source: string, diags: Diagnostic[], quiet?: boolean): void {
  if (quiet) return;
  for (const d of diags) process.stderr.write(`${formatDiagnostic(source, d)}\n\n`);
}

const hasErrors = (diags: Diagnostic[]): boolean => diags.some((d) => d.severity === "error");

function defaultOut(input: string, format: Format): string {
  if (input === "-") return `out.${format}`;
  return resolvePath(input).replace(/\.arch$/i, "") + "." + format;
}

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

async function cmdCompile(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("missing input file (use a path or `-` for stdin)");

  const fmt = (args.format ?? "svg").toLowerCase();
  if (fmt !== "svg" && fmt !== "dxf" && fmt !== "pdf" && fmt !== "png") {
    return usageError(`unknown format "${args.format}" (use svg, dxf, pdf, or png)`);
  }
  const format = fmt as Format;

  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }

  await tryLoadGeometryBackend();
  const { svg, diagnostics, scene } = compile(source, {
    width: args.width,
    noCache: true,
    world: makeNodeWorld(baseDirOf(input)),
  });

  if (hasErrors(diagnostics) || !scene) {
    if (args.json) {
      emitJson({ ok: false, format, diagnostics: diagnostics.map((d) => diagToJson(source, d)) });
    } else {
      emitDiagnosticsHuman(source, diagnostics, args.quiet);
      const n = diagnostics.filter((d) => d.severity === "error").length;
      if (!args.quiet) process.stderr.write(`✗ compilation failed (${n} error${n === 1 ? "" : "s"})\n`);
    }
    return EXIT.USER;
  }

  // Serialize the artifact.
  let bytes: string | Uint8Array;
  try {
    if (format === "dxf") bytes = toDxf(scene);
    else if (format === "pdf") bytes = await toPdf(scene);
    else if (format === "png") bytes = await renderPng(scene);
    else bytes = svg;
  } catch (e) {
    return ioError((e as Error).message, args.json, { format });
  }

  // Resolve output target. In JSON mode keep stdout clean: redirect `-` to a file.
  let target = args.o ?? defaultOut(input, format);
  if (args.json && target === "-") target = defaultOut(input === "-" ? "-" : input, format);

  if (target === "-") {
    process.stdout.write(bytes);
    return EXIT.OK;
  }
  try {
    writeFileSync(resolvePath(target), bytes);
  } catch (e) {
    return ioError((e as Error).message, args.json, { format });
  }

  const warnings = diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    const s = describe(source, { world: makeNodeWorld(baseDirOf(input)) });
    const { ok: _ok, diagnostics: _d, ...summary } = s;
    emitJson({
      ok: true,
      format,
      output: resolvePath(target),
      bytes: typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length,
      diagnostics: warnings.map((d) => diagToJson(source, d)),
      summary,
    });
  } else {
    emitDiagnosticsHuman(source, warnings, args.quiet);
    const len = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length;
    if (!args.quiet) process.stdout.write(`✓ ${input} → ${target} (${len} bytes, ${format.toUpperCase()})\n`);
  }
  return EXIT.OK;
}

async function cmdWatch(args: Args): Promise<number> {
  const input = args._[0];
  if (!input || input === "-") return usageError("watch needs a file path");
  await cmdCompile(args);
  process.stderr.write(`watching ${input} … (Ctrl+C to stop)\n`);
  watchFile(resolvePath(input), { interval: 300 }, () => void cmdCompile(args));
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// describe / validate / lint
// ---------------------------------------------------------------------------

function withSource(args: Args, run: (source: string, input: string) => number): number {
  const input = args._[0];
  if (!input) return usageError("missing input file (use a path or `-` for stdin)");
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json);
  }
  return run(source, input);
}

function cmdDescribe(args: Args): number {
  return withSource(args, (source, input) => {
    const summary = describe(source, { world: makeNodeWorld(baseDirOf(input)) });
    if (args.json) {
      emitJson({ ...summary, diagnostics: summary.diagnostics.map((d) => diagToJson(source, d)) });
    } else if (!summary.ok) {
      emitDiagnosticsHuman(source, summary.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ could not describe (plan has errors)\n");
    } else {
      const lines = [
        `${summary.plan} — ${summary.totals.rooms} room(s), ${summary.totals.floor_area_m2} m²`,
        ...summary.rooms.map((r) => `  ${r.id}${r.label ? ` "${r.label}"` : ""}: ${r.area_m2} m²${r.adjacent.length ? ` — adj: ${r.adjacent.join(", ")}` : ""}`),
      ];
      process.stdout.write(lines.join("\n") + "\n");
    }
    return summary.ok ? EXIT.OK : EXIT.USER;
  });
}

/** Shared reporter for `validate` and `lint`: emit diagnostics, pick exit code. */
function report(source: string, diags: Diagnostic[], args: Args): number {
  const ok = !hasErrors(diags);
  if (args.json) {
    emitJson({ ok, diagnostics: diags.map((d) => diagToJson(source, d)) });
  } else {
    emitDiagnosticsHuman(source, diags, args.quiet);
    if (!args.quiet) {
      const e = diags.filter((d) => d.severity === "error").length;
      const w = diags.length - e;
      process.stdout.write(ok ? `✓ ok${w ? ` (${w} warning${w === 1 ? "" : "s"})` : ""}\n` : `✗ ${e} error${e === 1 ? "" : "s"}, ${w} warning${w === 1 ? "" : "s"}\n`);
    }
  }
  return ok ? EXIT.OK : EXIT.USER;
}

function cmdValidate(args: Args): number {
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    const { diagnostics } = compile(source, { noCache: true, world });
    const lintDiags = lint(source, { world });
    return report(source, [...diagnostics, ...lintDiags], args);
  });
}

function cmdLint(args: Args): number {
  if (args.profile && !LINT_PROFILE_NAMES.includes(args.profile)) {
    process.stderr.write(`Unknown lint profile "${args.profile}". Available: ${LINT_PROFILE_NAMES.join(", ")}\n`);
    return 3;
  }
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    // Surface fatal errors too (lint() is silent on an unresolvable plan).
    const { diagnostics } = compile(source, { noCache: true, world });
    const errs = diagnostics.filter((d) => d.severity === "error");
    return report(source, errs.length ? errs : lint(source, { world, profile: args.profile }), args);
  });
}

// ---------------------------------------------------------------------------
// fmt / spec / new / explain
// ---------------------------------------------------------------------------

function cmdFmt(args: Args): number {
  return withSource(args, (source, input) => {
    const formatted = format(source);
    const changed = formatted !== source;
    if (args.write && input !== "-") {
      if (changed) writeFileSync(resolvePath(input), formatted, "utf8");
      if (args.json) emitJson({ ok: true, changed, output: resolvePath(input) });
      else if (!args.quiet) process.stdout.write(`✓ ${input} formatted${changed ? "" : " (no changes)"}\n`);
    } else if (args.json) {
      emitJson({ ok: true, changed, formatted });
    } else {
      process.stdout.write(formatted);
    }
    return EXIT.OK;
  });
}

/** A minimal but complete starter plan for `arch new`. */
const STARTER = `plan "New Plan" {
  units mm
  grid 50
  scale 1:50
  north up

  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }

  room id=r_main at (0,0) size 5000x4000 label "Room"

  door   at (2500,4000) width 900  wall exterior hinge left swing in
  window at (2500,0)    width 1500 wall exterior
}
`;

function cmdNew(args: Args): number {
  if (args.o && args.o !== "-") {
    const target = resolvePath(args.o);
    if (existsSync(target) && !args.force) {
      return ioError(`${args.o} already exists (use --force to overwrite)`, args.json);
    }
    writeFileSync(target, STARTER, "utf8");
    if (args.json) emitJson({ ok: true, output: target });
    else if (!args.quiet) process.stdout.write(`✓ wrote starter plan to ${args.o}\n`);
    return EXIT.OK;
  }
  if (args.json) emitJson({ ok: true, template: STARTER });
  else process.stdout.write(STARTER);
  return EXIT.OK;
}

/** Locate spec.llm.md relative to this module (shipped at the package root). */
function readSpec(): string | null {
  for (const rel of ["../spec.llm.md", "../../spec.llm.md"]) {
    const p = resolvePath(HERE, rel);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

function cmdSpec(args: Args): number {
  const spec = readSpec();
  if (spec === null) return ioError("spec.llm.md not found", args.json);
  if (args.json) emitJson({ ok: true, spec });
  else process.stdout.write(spec.endsWith("\n") ? spec : spec + "\n");
  return EXIT.OK;
}

function cmdExplain(args: Args): number {
  const code = args._[0];
  if (!code) return usageError("missing error code (e.g. arch explain E_ROOM_SIZE)");
  const upper = code.toUpperCase();
  const entry = ERROR_CATALOG[upper];
  if (!entry) {
    if (args.json) emitJson({ ok: false, code: upper });
    else process.stderr.write(`error: unknown error code "${code}"\n`);
    return EXIT.USAGE;
  }
  if (args.json) emitJson({ ok: true, code: upper, entry });
  else process.stdout.write((explain(upper) ?? "") + "\n");
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// error helpers + dispatch
// ---------------------------------------------------------------------------

function usageError(msg: string): number {
  process.stderr.write(`error: ${msg}\n`);
  return EXIT.USAGE;
}

function ioError(msg: string, json?: boolean, extra?: Record<string, unknown>): number {
  if (json) emitJson({ ok: false, error: msg, ...extra });
  else process.stderr.write(`error: ${msg}\n`);
  return EXIT.INTERNAL;
}

const HELP = `arch — ArchLang compiler (agent-native)

Usage:
  arch compile  <in.arch|-> [-o out|-] [-w width] [-f svg|dxf|pdf|png] [--json] [--quiet]
  arch watch    <in.arch> [-o out] [-w width] [-f …]
  arch validate <in.arch|-> [--json]      parse + resolve + lint (no render)
  arch describe <in.arch|-> [--json]      semantic facts (rooms, areas, adjacency)
  arch lint     <in.arch|-> [--profile residential-basic|accessibility-advisory] [--json]   architectural soundness warnings
  arch fmt      <in.arch|-> [--write] [--json]
  arch spec     [--json]                  print the one-prompt language spec
  arch new      [-o out] [--force] [--json]   scaffold a starter .arch
  arch explain  <CODE> [--json]           e.g. E_ROOM_SIZE

Input  '-' reads source from stdin.   Output '-' writes the artifact to stdout.
Every command takes --json: result on stdout, messages on stderr.
Exit codes: 0 ok · 2 user-source error (don't retry) · 1 internal/IO · 3 bad usage.
Formats: svg (default) · dxf (zero-dep) · pdf (optional pdfkit) · png (optional @resvg/resvg-js)
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(cmd ? EXIT.OK : EXIT.USAGE);
  }

  switch (cmd) {
    case "compile": process.exit(await cmdCompile(args));
    case "watch": process.exit(await cmdWatch(args));
    case "validate": process.exit(cmdValidate(args));
    case "describe": process.exit(cmdDescribe(args));
    case "lint": process.exit(cmdLint(args));
    case "fmt": process.exit(cmdFmt(args));
    case "spec": process.exit(cmdSpec(args));
    case "new": case "init": process.exit(cmdNew(args));
    case "explain": process.exit(cmdExplain(args));
    default: process.exit(usageError(`unknown command "${cmd}" (try \`arch help\`)`));
  }
}

void main();
