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
import { resolve as resolvePath, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import {
  compile,
  describe,
  lint,
  LINT_PROFILE_NAMES,
  explain,
  format,
  repair,
  applyFixes,
  suggestTopology,
  formatDiagnostic,
  diagnosticToJson,
  ERROR_CATALOG,
  loadClipperBackend,
  renderPng,
  renderPngFromSvg,
  renderAscii,
  setGeometryBackend,
  toDxf,
  toPdf,
  buildManifest,
  extractArchBlocks,
  rewriteMarkdown,
  EXPORT_FORMATS,
  planFromJson,
  astToJson,
  checkGraph,
  completion,
  validateIntent,
  intentFromJson,
  feedbackForResult,
} from "./index.js";
import type {
  Diagnostic,
  World,
  Scene,
  ExportFormat,
  FixSuggestion,
  Intent,
  IntentCheckResult,
  GraphCheck,
} from "./index.js";
// Internal (not part of the public surface): parse → link → resolve without
// rendering — validate/lint need only the diagnostics, never the SVG.
import { resolvePlan } from "./analyze.js";
// `arch ast` parses without resolving/rendering; parse() is not on the public
// surface, so the CLI reaches for it directly (as it does resolvePlan above).
import { parse } from "./parser.js";

type Format = ExportFormat;
/** Known `-f` ids and the "svg, dxf, pdf, or png" usage phrasing, from the one table. */
const FORMAT_IDS = new Set<string>(EXPORT_FORMATS.map((f) => f.id));
const FORMAT_LIST = `${EXPORT_FORMATS.slice(0, -1)
  .map((f) => f.id)
  .join(", ")}, or ${EXPORT_FORMATS[EXPORT_FORMATS.length - 1]!.id}`;

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
  strict?: boolean;
  /** `-j/--jobs`: max concurrent renders for `batch`. */
  jobs?: number;
  /** `-s/--scale`: raster scale for PNG (`preview` defaults to 2). */
  scale?: number;
  /** `--install`: auto-install a missing optional render dep, then retry. */
  install?: boolean;
  /** `--overlay <name>`: draw an opt-in diagnostic overlay (currently `circulation`). */
  overlay?: string;
  /** `--error-svg`: on a broken plan, still emit a self-describing error-card image. */
  errorSvg?: boolean;
  /** `--accessible`: emit <title>/<desc>/role/aria accessibility metadata into the SVG. */
  accessible?: boolean;
  /** `--ascii`: (preview) print the plan as ASCII text instead of a PNG. */
  ascii?: boolean;
  /** `--cols <n>`: target grid width for the `txt` / `--ascii` text renderer. */
  cols?: number;
  /** `--charset unicode|ascii`: glyph set for the text renderer (default unicode). */
  charset?: string;
  /** `--unsafe`: (fix) widen the applied-fix gate to also apply `maybe-incorrect` fixes. */
  unsafe?: boolean;
  /** `--dry-run`: (fix) compute the result but never write it. */
  dryRun?: boolean;
  /** `--from-json`: (compile) read the input as Plan JSON (RPLAN shape), not `.arch`. */
  fromJson?: boolean;
  /** `--graph <file>`: (validate) also check adjacency against an intended graph. */
  graph?: string;
  /** `--intent <file>`: (validate) also check the plan against a brief's intent JSON. */
  intent?: string;
  /** `--feedback`: (validate --intent) append deterministic per-violation correction prompts. */
  feedback?: boolean;
  /** `--brief <file>`: (score) the intent JSON to measure satisfaction against. */
  brief?: string;
  /** `--at <byteOffset>`: (complete) source offset to list completions at. */
  at?: number;
}

function parseArgs(argv: string[]): Args {
  const res: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-o" || a === "--out") res.o = argv[++i];
    else if (a === "-w" || a === "--width") res.width = Number(argv[++i]);
    else if (a === "-f" || a === "--format") res.format = argv[++i];
    else if (a === "-j" || a === "--jobs") res.jobs = Number(argv[++i]);
    else if (a === "-s" || a === "--scale") res.scale = Number(argv[++i]);
    else if (a === "--cols") res.cols = Number(argv[++i]);
    else if (a === "--at") res.at = Number(argv[++i]);
    else if (a === "--charset") res.charset = argv[++i];
    else if (a === "--from-json") res.fromJson = true;
    else if (a === "--graph") res.graph = argv[++i];
    else if (a === "--intent") res.intent = argv[++i];
    else if (a === "--brief") res.brief = argv[++i];
    else if (a === "--feedback") res.feedback = true;
    else if (a === "--ascii") res.ascii = true;
    else if (a === "--install") res.install = true;
    else if (a === "--unsafe") res.unsafe = true;
    else if (a === "--dry-run") res.dryRun = true;
    else if (a === "--write") res.write = true;
    else if (a === "--json") res.json = true;
    else if (a === "--quiet" || a === "-q") res.quiet = true;
    else if (a === "--force") res.force = true;
    else if (a === "--profile") res.profile = argv[++i];
    else if (a === "--overlay") res.overlay = argv[++i];
    else if (a === "--error-svg") res.errorSvg = true;
    else if (a === "--accessible") res.accessible = true;
    else if (a === "--strict" || a === "--fail-on-warning") res.strict = true;
    else res._.push(a);
  }
  return res;
}

/** The package version (for `arch manifest`), read from the shipped package.json. */
function readVersion(): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    const p = resolvePath(HERE, rel);
    if (existsSync(p)) {
      try {
        return (JSON.parse(readFileSync(p, "utf8")).version as string) ?? "0.0.0";
      } catch {
        /* fall through */
      }
    }
  }
  return "0.0.0";
}
const VERSION = readVersion();

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

function emitJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

/** Print diagnostics as framed snippets to stderr (unless quiet). */
function emitDiagnosticsHuman(source: string, diags: Diagnostic[], quiet?: boolean): void {
  if (quiet) return;
  for (const d of diags) process.stderr.write(`${formatDiagnostic(source, d)}\n\n`);
}

const hasErrors = (diags: Diagnostic[]): boolean => diags.some((d) => d.severity === "error");

/** A plain (non-array) object — used to sniff the `--graph` / Plan-JSON shapes. */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Convert Plan-JSON text (`--from-json`) to canonical `.arch` source. On a JSON
 * syntax error or a shape/kind problem, returns the error diagnostics (with the
 * partially-generated source, when any, so line/col projection still works);
 * on success returns the `.arch` string the compile pipeline then consumes.
 */
function sourceFromJson(jsonText: string): { source: string } | { error: Diagnostic[]; generated?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { error: [{ severity: "error", code: "E_JSON_SCHEMA", message: `invalid JSON: ${(e as Error).message}` }] };
  }
  const { source, diagnostics } = planFromJson(parsed);
  if (source === undefined || hasErrors(diagnostics)) return { error: diagnostics, generated: source };
  return { source };
}

function defaultOut(input: string, format: Format): string {
  if (input === "-") return `out.${format}`;
  return resolvePath(input).replace(/\.arch$/i, "") + "." + format;
}

/** Parse + validate the `-f` format, or `null` if it's not a known format. */
function parseFormat(args: Args): Format | null {
  const fmt = (args.format ?? "svg").toLowerCase();
  return FORMAT_IDS.has(fmt) ? (fmt as Format) : null;
}

/** Does this error mean a lazy optional render dependency (resvg/pdfkit) is absent? */
function isOptionalDepError(e: unknown): boolean {
  return /resvg|pdfkit|optional dependency/i.test((e as Error).message ?? "");
}

/** Pick the package manager from the environment (lockfiles / npm_config_user_agent). */
function detectPackageManager(): string {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (existsSync(resolvePath(process.cwd(), "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(resolvePath(process.cwd(), "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Auto-install an optional render dependency into the current working directory
 * (the one impure, networked CLI action — opt-in via `--install`). Best-effort:
 * Node resolves the dep from the package's own location, so this works when `arch`
 * runs as a project dependency; an `npx`-ephemeral install may not be found.
 */
function autoInstall(pkg: string, quiet?: boolean): void {
  const pm = detectPackageManager();
  const cmdArgs = pm === "yarn" ? ["add", pkg] : ["install", pkg];
  if (!quiet) process.stderr.write(`installing ${pkg} via ${pm} … (use SVG/DXF to avoid this)\n`);
  const r = spawnSync(pm, cmdArgs, {
    stdio: quiet ? "ignore" : "inherit",
    cwd: process.cwd(),
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`auto-install of ${pkg} failed (run manually: ${pm} ${cmdArgs.join(" ")})`);
}

/** Run a render, and on a missing-optional-dep error retry once after auto-install (if `--install`). */
async function runWithInstall<T>(fn: () => Promise<T>, pkg: string, args: Args): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (args.install && isOptionalDepError(e)) {
      autoInstall(pkg, args.quiet);
      return await fn();
    }
    throw e;
  }
}

/** Normalize the `--charset` flag to the text backend's union (unknown → unicode). */
const asciiCharset = (args: Args): "unicode" | "ascii" => (args.charset === "ascii" ? "ascii" : "unicode");

/** Serialize a built Scene to the requested format (auto-installing optional deps if asked). */
async function serialize(scene: Scene, svg: string, format: Format, args: Args): Promise<string | Uint8Array> {
  if (format === "dxf") return toDxf(scene);
  if (format === "txt") return renderAscii(scene, { cols: args.cols, charset: asciiCharset(args) });
  if (format === "pdf") return runWithInstall(() => toPdf(scene), "pdfkit", args);
  if (format === "png")
    return runWithInstall(() => renderPng(scene, { width: args.width, scale: args.scale }), "@resvg/resvg-js", args);
  return svg;
}

/** A single rendered artifact (or a failure), the shared core of compile/batch/md/preview. */
interface Rendered {
  bytes?: string | Uint8Array;
  diagnostics: Diagnostic[];
  /** Serialize/dependency error message (compile errors are in `diagnostics`). */
  error?: string;
  errorCode?: string;
}

/** Compile + serialize one source to bytes (no file IO). Compile errors → no bytes. */
async function renderArtifact(source: string, format: Format, args: Args, baseDir: string): Promise<Rendered> {
  await tryLoadGeometryBackend();
  const { svg, diagnostics, scene } = compile(source, {
    width: args.width,
    noCache: true,
    world: makeNodeWorld(baseDir),
    // `--overlay circulation` draws the opt-in diagnostic overlay; unknown names are ignored.
    ...(args.overlay === "circulation" ? { overlays: ["circulation"] as const } : {}),
    // `--error-svg`: a broken plan yields a self-describing error card in `svg`
    // (instead of ""), so the branch below can serialize it. Off → svg stays "".
    ...(args.errorSvg ? { onError: "svg" as const } : {}),
    // `--accessible`: stamp <title>/<desc>/role/aria into the SVG (SVG-only; a raster
    // format simply drops the metadata). Default output is byte-identical.
    ...(args.accessible ? { accessible: true } : {}),
    // The text renderer (`-f txt` / `preview --ascii`) needs the opt-in annotate
    // metadata (elementId/elementKind) to place furniture markers — the only way to
    // recover a fixture's identity from the geometry-only Scene. Other formats never
    // set it, so their output stays byte-identical.
    ...(format === "txt" || args.ascii ? { annotate: true } : {}),
  });
  if (hasErrors(diagnostics) || !scene) {
    // A broken plan. With `--error-svg`, `svg` holds the error card — serialize it
    // (as SVG, or rasterized to PNG) so the caller still gets an image; the
    // diagnostics ride along, so the exit code stays a user-source error. Only SVG
    // and PNG cards are meaningful (DXF/PDF error cards are not).
    if (args.errorSvg && svg && (format === "svg" || format === "png")) {
      try {
        const bytes =
          format === "png"
            ? await runWithInstall(
                () => renderPngFromSvg(svg, { width: args.width, scale: args.scale }),
                "@resvg/resvg-js",
                args,
              )
            : svg;
        return { bytes, diagnostics };
      } catch (e) {
        const message = (e as Error).message;
        if (isOptionalDepError(e)) {
          const dep: Diagnostic = { severity: "error", code: "E_PNG_DEPENDENCY", message };
          return { diagnostics: [...diagnostics, dep], error: message, errorCode: "E_PNG_DEPENDENCY" };
        }
        return { diagnostics, error: message };
      }
    }
    return { diagnostics };
  }
  try {
    return { bytes: await serialize(scene, svg, format, args), diagnostics };
  } catch (e) {
    const message = (e as Error).message;
    if (isOptionalDepError(e)) {
      // A missing optional render dependency — surface it as the catalogued,
      // self-correcting code (with `fix`) rather than an opaque thrown error.
      const dep: Diagnostic = { severity: "error", code: "E_PNG_DEPENDENCY", message };
      return { diagnostics: [...diagnostics, dep], error: message, errorCode: "E_PNG_DEPENDENCY" };
    }
    return { diagnostics, error: message };
  }
}

/** One file's result in a multi-file command (batch/md). */
interface PerFile {
  input: string;
  ok: boolean;
  format: Format;
  output?: string;
  bytes?: number;
  error?: string;
  errorCode?: string;
  diagnostics: Diagnostic[];
  source: string;
}

/** Read a `.arch` file, render it, and write the artifact to `targetPath`. */
async function compileToFile(input: string, format: Format, args: Args, targetPath: string): Promise<PerFile> {
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return { input, ok: false, format, error: `cannot read ${input}`, diagnostics: [], source: "" };
  }
  const r = await renderArtifact(source, format, args, baseDirOf(input));
  if (r.error || r.bytes === undefined) {
    return { input, ok: false, format, error: r.error, errorCode: r.errorCode, diagnostics: r.diagnostics, source };
  }
  try {
    writeFileSync(resolvePath(targetPath), r.bytes);
  } catch (e) {
    return { input, ok: false, format, error: (e as Error).message, diagnostics: r.diagnostics, source };
  }
  const bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
  return { input, ok: true, format, output: resolvePath(targetPath), bytes, diagnostics: r.diagnostics, source };
}

/** Project a {@link PerFile} onto the agent-facing JSON shape (with fix on a dep error). */
function perFileJson(r: PerFile): Record<string, unknown> {
  const o: Record<string, unknown> = { input: r.input, ok: r.ok, format: r.format };
  if (r.output) o.output = r.output;
  if (r.bytes !== undefined) o.bytes = r.bytes;
  o.diagnostics = r.diagnostics.map((d) => diagnosticToJson(r.source, d));
  if (r.error) o.error = r.error;
  if (r.errorCode) {
    o.code = r.errorCode;
    const fix = ERROR_CATALOG[r.errorCode]?.fix;
    if (fix) o.fix = fix;
  }
  return o;
}

/** Aggregate exit code for a multi-file run: user error > IO error > ok. */
function aggregateExit(results: PerFile[]): number {
  if (results.some((r) => !r.ok && !r.error)) return EXIT.USER; // a compile (user-source) error
  if (results.some((r) => !r.ok)) return EXIT.INTERNAL; // an IO/dependency error
  return EXIT.OK;
}

/** Run async thunks with a bounded concurrency (a tiny zero-dep p-limit). */
async function runPool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
    }
  };
  const n = Math.max(1, Math.min(limit, tasks.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

async function cmdCompile(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("missing input file (use a path or `-` for stdin)");

  const format = parseFormat(args);
  if (!format) return usageError(`unknown format "${args.format}" (use ${FORMAT_LIST})`);

  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }

  // `--from-json`: the input is Plan JSON (RPLAN shape), not `.arch`. Convert it to
  // canonical `.arch` here, then fall through to the normal pipeline so every flag
  // (-f/-o/--overlay/--accessible/--error-svg/--cols/--charset) composes unchanged.
  if (args.fromJson) {
    const conv = sourceFromJson(source);
    if ("error" in conv) {
      const projSrc = conv.generated ?? source;
      if (args.json) {
        emitJson({ ok: false, format, diagnostics: conv.error.map((d) => diagnosticToJson(projSrc, d)) });
      } else {
        emitDiagnosticsHuman(projSrc, conv.error, args.quiet);
        if (!args.quiet) process.stderr.write("✗ plan JSON is invalid\n");
      }
      return EXIT.USER;
    }
    source = conv.source;
  }

  const r = await renderArtifact(source, format, args, baseDirOf(input));

  if (r.error) {
    // A serialize / missing-optional-dependency failure (compile succeeded). In
    // --json carry the catalog code + fix so the agent knows exactly what to do.
    if (args.json) {
      const o: Record<string, unknown> = { ok: false, format, error: r.error };
      if (r.errorCode) {
        o.code = r.errorCode;
        const fix = ERROR_CATALOG[r.errorCode]?.fix;
        if (fix) o.fix = fix;
      }
      emitJson(o);
      return EXIT.INTERNAL;
    }
    return ioError(r.error, false, { format });
  }

  const errored = hasErrors(r.diagnostics);

  if (r.bytes === undefined) {
    const diagnostics = r.diagnostics;
    if (args.json) {
      emitJson({ ok: false, format, diagnostics: diagnostics.map((d) => diagnosticToJson(source, d)) });
    } else {
      emitDiagnosticsHuman(source, diagnostics, args.quiet);
      const n = diagnostics.filter((d) => d.severity === "error").length;
      if (!args.quiet) process.stderr.write(`✗ compilation failed (${n} error${n === 1 ? "" : "s"})\n`);
    }
    return EXIT.USER;
  }

  const bytes = r.bytes;
  const diagnostics = r.diagnostics;

  // Resolve output target. In JSON mode keep stdout clean: redirect `-` to a file.
  let target = args.o ?? defaultOut(input, format);
  if (args.json && target === "-") target = defaultOut(input === "-" ? "-" : input, format);

  // `--error-svg` produced an error-card image for a *broken* plan: write it (so an
  // agent/embed has visual feedback) but keep the user-source exit code and report
  // the diagnostics — a broken plan never counts as a successful compile.
  if (errored) {
    if (target === "-") {
      process.stdout.write(bytes);
    } else {
      try {
        writeFileSync(resolvePath(target), bytes);
      } catch (e) {
        return ioError((e as Error).message, args.json, { format });
      }
    }
    if (args.json) {
      const o: Record<string, unknown> = {
        ok: false,
        format,
        diagnostics: diagnostics.map((d) => diagnosticToJson(source, d)),
      };
      if (target !== "-") {
        o.output = resolvePath(target);
        o.bytes = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length;
      }
      emitJson(o);
    } else {
      emitDiagnosticsHuman(source, diagnostics, args.quiet);
      const n = diagnostics.filter((d) => d.severity === "error").length;
      if (!args.quiet && target !== "-")
        process.stderr.write(`✗ compilation failed (${n} error${n === 1 ? "" : "s"}); wrote error card → ${target}\n`);
    }
    return EXIT.USER;
  }

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
      diagnostics: warnings.map((d) => diagnosticToJson(source, d)),
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
// preview / batch / md / manifest
// ---------------------------------------------------------------------------

/**
 * `preview` — render a PNG an agent can *look at*. PNG-first, default `scale 2`
 * for legibility. Zero-install where the optional `@resvg/resvg-js` binary is
 * present (a normal `npm i`/`npx` installs it); otherwise the failure carries the
 * `E_PNG_DEPENDENCY` code + fix, and `--install` fetches it and retries.
 */
/**
 * `preview --ascii` — the text preview. Compiles to the `txt` backend and prints
 * the plan to stdout (human) or as an `ascii` field (`--json`), following the same
 * result shape as the PNG preview. Zero dependency: an agent gets a legible plan
 * with no raster binary at all.
 */
async function cmdPreviewAscii(args: Args, input: string): Promise<number> {
  const format: Format = "txt";
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }
  const r = await renderArtifact(source, format, args, baseDirOf(input));
  if (r.bytes === undefined) {
    if (args.json) emitJson({ ok: false, format, diagnostics: r.diagnostics.map((d) => diagnosticToJson(source, d)) });
    else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ compilation failed\n");
    }
    return EXIT.USER;
  }
  const ascii = typeof r.bytes === "string" ? r.bytes : Buffer.from(r.bytes).toString("utf8");
  const warnings = r.diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    emitJson({ ok: true, format, ascii, diagnostics: warnings.map((d) => diagnosticToJson(source, d)) });
  } else {
    process.stdout.write(ascii);
  }
  return EXIT.OK;
}

async function cmdPreview(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("preview needs an input file (use a path or `-` for stdin)");

  // `--ascii`: a zero-install text preview an agent can read straight from stdout,
  // no raster dependency. Reuses the same `renderAscii` backend as `-f txt`.
  if (args.ascii) return cmdPreviewAscii(args, input);

  const format: Format = "png";
  // Target a sensible on-screen size by default: the native render is high-res
  // (thousands of px), so render the page at ~1600px wide unless the caller set
  // an explicit width/scale. That keeps the PNG legible *and* small enough for an
  // agent's vision to ingest without heavy downscaling.
  if (args.width === undefined && (args.scale === undefined || !(args.scale > 0))) args.width = 1600;
  if (args.scale === undefined || !(args.scale > 0)) args.scale = 1;

  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }

  const r = await renderArtifact(source, format, args, baseDirOf(input));

  if (r.error) {
    if (args.json) {
      const o: Record<string, unknown> = { ok: false, format, error: r.error };
      if (r.errorCode) {
        o.code = r.errorCode;
        const fix = ERROR_CATALOG[r.errorCode]?.fix;
        if (fix) o.fix = fix;
      }
      emitJson(o);
      return EXIT.INTERNAL;
    }
    return ioError(r.error, false, { format });
  }

  if (r.bytes === undefined) {
    if (args.json) emitJson({ ok: false, format, diagnostics: r.diagnostics.map((d) => diagnosticToJson(source, d)) });
    else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ compilation failed\n");
    }
    return EXIT.USER;
  }

  const errored = hasErrors(r.diagnostics);

  let target = args.o ?? defaultOut(input, format);
  if (args.json && target === "-") target = defaultOut(input === "-" ? "-" : input, format);

  // `--error-svg`: rasterized error-card PNG for a broken plan — write it, but keep
  // the user-source exit code and report the diagnostics.
  if (errored) {
    if (target === "-") {
      process.stdout.write(r.bytes);
    } else {
      try {
        writeFileSync(resolvePath(target), r.bytes);
      } catch (e) {
        return ioError((e as Error).message, args.json, { format });
      }
    }
    if (args.json) {
      const o: Record<string, unknown> = {
        ok: false,
        format,
        diagnostics: r.diagnostics.map((d) => diagnosticToJson(source, d)),
      };
      if (target !== "-") {
        o.output = resolvePath(target);
        o.bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
      }
      emitJson(o);
    } else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet && target !== "-") process.stderr.write(`✗ compilation failed; wrote error card → ${target}\n`);
    }
    return EXIT.USER;
  }

  if (target === "-") {
    process.stdout.write(r.bytes);
    return EXIT.OK;
  }
  try {
    writeFileSync(resolvePath(target), r.bytes);
  } catch (e) {
    return ioError((e as Error).message, args.json, { format });
  }

  const bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
  const warnings = r.diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    emitJson({
      ok: true,
      format,
      output: resolvePath(target),
      bytes,
      width: args.width ?? null,
      scale: args.scale,
      diagnostics: warnings.map((d) => diagnosticToJson(source, d)),
    });
  } else {
    emitDiagnosticsHuman(source, warnings, args.quiet);
    if (!args.quiet)
      process.stdout.write(
        `✓ ${input} → ${target} (${bytes} bytes, PNG${args.width ? ` ${args.width}px` : ""}@${args.scale}x)\n`,
      );
  }
  return EXIT.OK;
}

/**
 * `batch` — render many `.arch` files in one call, concurrently. Stable array
 * JSON shape (`{ ok, results: [...] }`) so an agent can render design variants and
 * read every outcome at once. `-o <dir>` directs outputs into a directory; `-j`
 * caps concurrency (default: CPU count).
 */
async function cmdBatch(args: Args): Promise<number> {
  const inputs = args._;
  if (inputs.length === 0) return usageError("batch needs at least one input file");
  const format = parseFormat(args);
  if (!format) return usageError(`unknown format "${args.format}" (use ${FORMAT_LIST})`);

  const outDir = args.o && args.o !== "-" ? args.o : undefined;
  const targetFor = (input: string): string =>
    outDir ? resolvePath(outDir, basename(input).replace(/\.arch$/i, "") + "." + format) : defaultOut(input, format);

  const jobs = args.jobs && args.jobs > 0 ? args.jobs : Math.min(cpus().length, inputs.length);
  const results = await runPool(
    inputs.map((input) => () => compileToFile(input, format, args, targetFor(input))),
    jobs,
  );

  if (args.json) {
    emitJson({ ok: results.every((r) => r.ok), results: results.map(perFileJson) });
  } else if (!args.quiet) {
    for (const r of results) {
      if (r.ok) process.stdout.write(`✓ ${r.input} → ${r.output} (${r.bytes} bytes, ${format.toUpperCase()})\n`);
      else process.stderr.write(`✗ ${r.input}: ${r.error ?? "compilation failed"}\n`);
    }
  }
  return aggregateExit(results);
}

/** Alt text for an embedded block's image link. */
function blockAlt(index: number): string {
  return `Floor plan ${index + 1}`;
}

/**
 * `md` — render every ` ```arch ` block in a Markdown file to an image and rewrite
 * each block to an image link (mermaid-cli's markdown mode). Images are written
 * next to the output `.md` as `<name>-<n>.<ext>`. A block that fails to render is
 * left untouched in the output.
 */
async function cmdMd(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("md needs a Markdown file");
  const fmt = (args.format ?? "svg").toLowerCase();
  if (fmt !== "svg" && fmt !== "png") return usageError(`md supports -f svg or png (got "${args.format ?? "svg"}")`);
  const format = fmt as Format;

  let md: string;
  try {
    md = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json);
  }

  // Output target: default `<name>.out.md`; in JSON mode never stream to stdout.
  let target = args.o ?? (input === "-" ? "out.md" : resolvePath(input).replace(/\.md$/i, "") + ".out.md");
  if (args.json && target === "-")
    target = input === "-" ? "out.md" : resolvePath(input).replace(/\.md$/i, "") + ".out.md";
  const outAbs = target === "-" ? resolvePath("out.md") : resolvePath(target);
  const outDir = dirname(outAbs);
  const outBase = basename(outAbs).replace(/\.[^.]+$/, "");
  const baseDir = baseDirOf(input);

  const blocks = extractArchBlocks(md);
  const replacements: Array<string | undefined> = [];
  const images: PerFile[] = [];

  for (const b of blocks) {
    const imgName = `${outBase}-${b.index + 1}.${format}`;
    const r = await renderArtifact(b.source, format, args, baseDir);
    if (r.error || r.bytes === undefined) {
      images.push({
        input: `block ${b.index + 1}`,
        ok: false,
        format,
        error: r.error,
        errorCode: r.errorCode,
        diagnostics: r.diagnostics,
        source: b.source,
      });
      replacements[b.index] = undefined; // leave the failing block in place
      continue;
    }
    try {
      writeFileSync(resolvePath(outDir, imgName), r.bytes);
    } catch (e) {
      images.push({
        input: `block ${b.index + 1}`,
        ok: false,
        format,
        error: (e as Error).message,
        diagnostics: r.diagnostics,
        source: b.source,
      });
      replacements[b.index] = undefined;
      continue;
    }
    const bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
    // With `--error-svg`, a broken block still produced bytes (an error card): the
    // image is written and the block rewritten to it, but `ok` reflects that the
    // block errored, so the aggregate exit code stays a user-source error.
    images.push({
      input: `block ${b.index + 1}`,
      ok: !hasErrors(r.diagnostics),
      format,
      output: resolvePath(outDir, imgName),
      bytes,
      diagnostics: r.diagnostics,
      source: b.source,
    });
    replacements[b.index] = `![${blockAlt(b.index)}](${imgName})`;
  }

  const rewritten = rewriteMarkdown(md, blocks, replacements);
  if (target === "-") {
    process.stdout.write(rewritten);
  } else {
    try {
      writeFileSync(outAbs, rewritten, "utf8");
    } catch (e) {
      return ioError((e as Error).message, args.json);
    }
  }

  if (args.json) {
    emitJson({
      ok: images.every((i) => i.ok),
      output: target === "-" ? null : outAbs,
      blocks: blocks.length,
      images: images.map(perFileJson),
    });
  } else if (!args.quiet) {
    const rendered = images.filter((i) => i.ok).length;
    process.stdout.write(
      `✓ ${input} → ${target} (${blocks.length} block${blocks.length === 1 ? "" : "s"}, ${rendered} rendered)\n`,
    );
  }
  return aggregateExit(images);
}

/** `manifest` — the whole CLI API surface as one structured document for agents. */
function cmdManifest(args: Args): number {
  const m = buildManifest(VERSION);
  if (args.json) {
    emitJson(m);
  } else {
    const lines = [
      `arch ${m.version} — ${m.commands.length} commands`,
      ...m.commands.map((c) => `  ${c.name}${c.aliases ? ` (${c.aliases.join(", ")})` : ""} — ${c.summary}`),
      `formats: ${m.formats.map((f) => f.id).join(", ")}`,
      `lint profiles: ${m.lint.profiles.join(", ")}`,
      `error codes: ${m.errorCodes.length}  ·  elements: ${m.elements.join(", ")}`,
    ];
    process.stdout.write(lines.join("\n") + "\n");
  }
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
      emitJson({ ...summary, diagnostics: summary.diagnostics.map((d) => diagnosticToJson(source, d)) });
    } else if (!summary.ok) {
      emitDiagnosticsHuman(source, summary.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ could not describe (plan has errors)\n");
    } else {
      const lines = [
        `${summary.plan} — ${summary.totals.rooms} room(s), ${summary.totals.floor_area_m2} m²`,
        ...summary.rooms.map(
          (r) =>
            `  ${r.id}${r.label ? ` "${r.label}"` : ""}: ${r.area_m2} m²${r.adjacent.length ? ` — adj: ${r.adjacent.join(", ")}` : ""}`,
        ),
      ];
      process.stdout.write(lines.join("\n") + "\n");
    }
    return summary.ok ? EXIT.OK : EXIT.USER;
  });
}

/**
 * Shared reporter for `validate` and `lint`: emit diagnostics, pick exit code.
 * `--strict` (alias `--fail-on-warning`) makes advisory warnings count toward failure
 * too — the gate a generator pipeline runs so it can't ship a plan that lint flagged.
 */
function report(source: string, diags: Diagnostic[], args: Args): number {
  const e = diags.filter((d) => d.severity === "error").length;
  const w = diags.length - e;
  const ok = e === 0 && (!args.strict || w === 0);
  if (args.json) {
    emitJson({ ok, strict: args.strict ?? false, diagnostics: diags.map((d) => diagnosticToJson(source, d)) });
  } else {
    emitDiagnosticsHuman(source, diags, args.quiet);
    if (!args.quiet) {
      if (ok) process.stdout.write(`✓ ok${w ? ` (${w} warning${w === 1 ? "" : "s"})` : ""}\n`);
      else if (e === 0) process.stdout.write(`✗ ${w} warning${w === 1 ? "" : "s"} (--strict)\n`);
      else process.stdout.write(`✗ ${e} error${e === 1 ? "" : "s"}, ${w} warning${w === 1 ? "" : "s"}\n`);
    }
  }
  return ok ? EXIT.OK : EXIT.USER;
}

function cmdValidate(args: Args): number {
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    // resolvePlan yields exactly compile()'s diagnostics (toScene/renderSvg never
    // emit any) without paying for the render; lint() then reuses the warm
    // parse/resolve stage memos, so the whole command resolves once, renders never.
    const { diagnostics } = resolvePlan(source, { world });
    const lintDiags = lint(source, { world });
    const diags = [...diagnostics, ...lintDiags];
    // `--graph` and/or `--intent` layer an intent check onto plain validate; both
    // blocks may appear in one call, and either failing gates the exit code. Plain
    // validate (neither flag) stays byte-identical via `report`.
    if (args.graph !== undefined || args.intent !== undefined) return reportWithChecks(source, diags, args, world);
    return report(source, diags, args);
  });
}

/** An IO/usage error that a check-loader hit — the exit code is already emitted, so
 *  the caller just propagates it. Distinct from a resolved check result. */
interface CheckError {
  exit: number;
}
const isCheckError = (v: unknown): v is CheckError => isRecord(v) && typeof v.exit === "number";

/**
 * Read + parse a `--graph <graph.json>` file and compare it to the plan's compiled
 * interior-door adjacency. The file is a bare adjacency dict (`{ "room": ["room", …] }`)
 * or wrapped under `input_graph`. On an IO/usage problem the message is written and the
 * exit code returned (as {@link CheckError}); otherwise the {@link GraphCheck} block.
 */
function loadGraphCheck(source: string, graphPath: string, args: Args, world: World): GraphCheck | CheckError {
  let graphText: string;
  try {
    graphText = readFileSync(resolvePath(graphPath), "utf8");
  } catch {
    return { exit: ioError(`cannot read graph file ${graphPath}`, args.json) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(graphText);
  } catch (e) {
    return { exit: usageError(`invalid --graph JSON: ${(e as Error).message}`) };
  }
  // Accept a bare adjacency dict or a `{ input_graph: {…} }` wrapper.
  const intentRaw = isRecord(raw) && isRecord(raw.input_graph) ? raw.input_graph : raw;
  if (!isRecord(intentRaw)) {
    return {
      exit: usageError("--graph must be an adjacency object { room: [neighbours] } (optionally under input_graph)"),
    };
  }
  const intent: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(intentRaw)) {
    intent[k] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  }
  return checkGraph(source, intent, { world });
}

/**
 * Read + parse an intent JSON file (`--intent`/`--brief`) into a validated {@link Intent}.
 * Mirrors {@link loadGraphCheck}'s error ladder: an unreadable file → IO error (exit 1); a
 * JSON syntax error or an `intentFromJson` shape error → usage error (exit 3) listing the
 * pathed messages. `flag` names the option in the messages.
 */
function loadIntent(intentPath: string, flag: string, args: Args): Intent | CheckError {
  let text: string;
  try {
    text = readFileSync(resolvePath(intentPath), "utf8");
  } catch {
    return { exit: ioError(`cannot read intent file ${intentPath}`, args.json) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { exit: usageError(`invalid ${flag} JSON: ${(e as Error).message}`) };
  }
  const { intent, errors } = intentFromJson(raw);
  if (intent === null) return { exit: usageError(`invalid ${flag}: ${errors.join("; ")}`) };
  return intent;
}

/** The agent-facing projection of a single intent violation (the predicate objects
 *  are dropped — `maxM2` can be `Infinity`, which `JSON.stringify` would null). */
const violationJson = (v: IntentCheckResult["violations"][number]): Record<string, unknown> => ({
  code: v.code,
  message: v.message,
  gate: v.gate,
});

/**
 * `validate --graph`/`--intent` — normal validate plus an optional graph-adjacency
 * comparison and/or an intent check. Both blocks may appear together (`--graph` and
 * `--intent` compose). Base diagnostics behave exactly as plain validate; a graph
 * mismatch or a failing intent GATE additionally fails the command (exit 2). `--feedback`
 * appends the deterministic per-violation correction prompts to the intent block.
 */
function reportWithChecks(source: string, diags: Diagnostic[], args: Args, world: World): number {
  const graph = args.graph !== undefined ? loadGraphCheck(source, args.graph, args, world) : undefined;
  if (isCheckError(graph)) return graph.exit;

  let intentResult: IntentCheckResult | undefined;
  let feedback: string[] | undefined;
  if (args.intent !== undefined) {
    const it = loadIntent(args.intent, "--intent", args);
    if (isCheckError(it)) return it.exit;
    intentResult = validateIntent(source, it, { world });
    if (args.feedback) feedback = feedbackForResult(intentResult);
  }

  const e = diags.filter((d) => d.severity === "error").length;
  const w = diags.length - e;
  const diagsOk = e === 0 && (!args.strict || w === 0);
  const graphOk = graph ? graph.ok : true;
  const intentOk = intentResult ? intentResult.ok : true;
  const ok = diagsOk && graphOk && intentOk;

  if (args.json) {
    const o: Record<string, unknown> = {
      ok,
      strict: args.strict ?? false,
      diagnostics: diags.map((d) => diagnosticToJson(source, d)),
    };
    if (graph) {
      o.graph = {
        ok: graph.ok,
        missing_rooms: graph.missing_rooms,
        missing_connections: graph.missing_connections,
        extra_connections: graph.extra_connections,
      };
    }
    if (intentResult) {
      const block: Record<string, unknown> = {
        ok: intentResult.ok,
        satisfied: intentResult.satisfied,
        total: intentResult.total,
        subscores: intentResult.subscores,
        violations: intentResult.violations.map(violationJson),
      };
      if (feedback) block.feedback = feedback;
      o.intent = block;
    }
    emitJson(o);
  } else {
    emitDiagnosticsHuman(source, diags, args.quiet);
    if (!args.quiet) {
      if (graph) {
        for (const rm of graph.missing_rooms) process.stderr.write(`  graph: room "${rm}" not found in plan\n`);
        for (const [a, b] of graph.missing_connections)
          process.stderr.write(`  graph: missing connection ${a} — ${b}\n`);
        for (const [a, b] of graph.extra_connections)
          process.stderr.write(`  graph: unexpected connection ${a} — ${b}\n`);
      }
      if (intentResult) {
        for (const v of intentResult.violations) process.stderr.write(`  ${v.code}: ${v.message}\n`);
        if (feedback) for (const f of feedback) process.stderr.write(`  ${f}\n`);
      }
      if (ok) {
        const extras: string[] = [];
        if (graph) extras.push("graph matches");
        if (intentResult) extras.push("intent satisfied");
        process.stdout.write(
          `✓ ok${w ? ` (${w} warning${w === 1 ? "" : "s"})` : ""}${extras.length ? `, ${extras.join(", ")}` : ""}\n`,
        );
      } else {
        const parts: string[] = [];
        if (e) parts.push(`${e} error${e === 1 ? "" : "s"}`);
        if (w) parts.push(`${w} warning${w === 1 ? "" : "s"}`);
        if (graph && !graph.ok) parts.push("graph mismatch");
        if (intentResult && !intentResult.ok) parts.push("intent violated");
        process.stdout.write(`✗ ${parts.join(", ")}\n`);
      }
    }
  }
  return ok ? EXIT.OK : EXIT.USER;
}

/**
 * `score <file.arch|-> --brief <intent.json>` — the continuous intent-satisfaction
 * METER (the H4 reward projection): reports satisfied/total, a scalar `score` in [0,1],
 * the four subscores, and the violations. It measures, it does NOT gate — a successful
 * measurement exits 0 even with failing assertions (`validate --intent` is the gate).
 * IO/usage problems still exit 1/3. `ok` mirrors the intent gate so a caller can still
 * read pass/fail, but never changes the exit code.
 */
function cmdScore(args: Args): number {
  if (args.brief === undefined) return usageError("score needs --brief <intent.json>");
  return withSource(args, (source, input) => {
    const it = loadIntent(args.brief!, "--brief", args);
    if (isCheckError(it)) return it.exit;
    const result = validateIntent(source, it, { world: makeNodeWorld(baseDirOf(input)) });
    // score = fraction of assertions satisfied (an empty intent scores a perfect 1),
    // rounded to 4 decimals so the meter is deterministic across runs.
    const score = result.total === 0 ? 1 : Math.round((result.satisfied / result.total) * 10000) / 10000;
    if (args.json) {
      emitJson({
        ok: result.ok,
        satisfied: result.satisfied,
        total: result.total,
        score,
        subscores: result.subscores,
        violations: result.violations.map(violationJson),
      });
    } else if (!args.quiet) {
      const pct = Math.round(score * 100);
      process.stdout.write(`score ${result.satisfied}/${result.total} (${pct}%) · ${result.ok ? "ok" : "gated"}\n`);
      for (const v of result.violations) process.stderr.write(`  ${v.code}: ${v.message}\n`);
    }
    // The meter always exits 0 on a successful measurement, gated or not.
    return EXIT.OK;
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
    // Render-free: resolvePlan carries every diagnostic compile() would.
    const { diagnostics } = resolvePlan(source, { world });
    const errs = diagnostics.filter((d) => d.severity === "error");
    return report(source, errs.length ? errs : lint(source, { world, profile: args.profile }), args);
  });
}

// ---------------------------------------------------------------------------
// ast / complete
// ---------------------------------------------------------------------------

/**
 * `ast` — parse only (no resolve/render) and print the span-bearing AST as JSON
 * (`astToJson`: scripting nodes appear as their kind, unexpanded). The parser
 * recovers, so a partial AST is emitted even on error; error diagnostics still
 * force exit 2. Human mode pretty-prints the same JSON (diagnostics → stderr).
 */
function cmdAst(args: Args): number {
  return withSource(args, (source) => {
    const { plan, diagnostics } = parse(source);
    const ast = plan ? astToJson(plan) : undefined;
    const errored = hasErrors(diagnostics);
    if (args.json) {
      const o: Record<string, unknown> = { ok: !errored };
      if (ast !== undefined) o.ast = ast;
      o.diagnostics = diagnostics.map((d) => diagnosticToJson(source, d));
      emitJson(o);
    } else {
      if (diagnostics.length) emitDiagnosticsHuman(source, diagnostics, args.quiet);
      if (ast !== undefined) process.stdout.write(JSON.stringify(ast, null, 2) + "\n");
    }
    return errored ? EXIT.USER : EXIT.OK;
  });
}

/**
 * `complete --at <byteOffset>` — the core LSP `completion()` projected as data: the
 * items in scope at that source offset. Missing/invalid `--at` is a usage error.
 */
function cmdComplete(args: Args): number {
  if (args.at === undefined || !Number.isFinite(args.at) || args.at < 0) {
    return usageError("complete needs --at <byteOffset> (a non-negative integer)");
  }
  const offset = Math.trunc(args.at);
  return withSource(args, (source) => {
    const items = completion(source, offset);
    if (args.json) {
      emitJson({ ok: true, items });
    } else if (!args.quiet) {
      for (const it of items) {
        process.stdout.write(`${it.label}\t${it.kind}${it.detail ? `\t${it.detail}` : ""}\n`);
      }
    }
    return EXIT.OK;
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

/**
 * `repair` — the explicit source-to-source corrector (ADR 0006). Emits new `.arch`
 * source (furniture pushed out of walls) plus a change log; never edits render output.
 * Writes corrected source to `-o <file>` (or stdout); the change log goes to stderr.
 */
function cmdRepair(args: Args): number {
  return withSource(args, (source, input) => {
    const r = repair(source);
    if (args.json) {
      emitJson({ ok: true, changed: r.changed, changes: r.changes, unresolved: r.unresolved, source: r.source });
      return EXIT.OK;
    }
    const target = args.o;
    if (target && target !== "-") {
      writeFileSync(resolvePath(target), r.source, "utf8");
      if (!args.quiet)
        process.stderr.write(
          `✓ ${input} → ${target} (${r.changes.length} change${r.changes.length === 1 ? "" : "s"})\n`,
        );
    } else {
      process.stdout.write(r.source);
    }
    if (!args.quiet) {
      for (const c of r.changes) {
        process.stderr.write(`  moved ${c.id} (${c.from.x},${c.from.y}) → (${c.to.x},${c.to.y}) — ${c.reason}\n`);
      }
      for (const u of r.unresolved) process.stderr.write(`  ⚠ ${u.id}: ${u.reason}\n`);
      if (!r.changed) process.stderr.write("  (no changes — nothing to repair)\n");
    }
    return EXIT.OK;
  });
}

/**
 * `arch fix` — apply the machine-applicable fix suggestions the compiler and lint
 * attach to their diagnostics (the *syntactic* corrector: off-wall openings → the
 * attachment form, out-of-range attach positions clamped, an alias-inferred room use
 * pinned with an explicit `uses`, …). A bounded fixpoint: each pass compiles + lints,
 * collects `diagnostics[].fixes`, applies them (default only `machine-applicable`;
 * `--unsafe` also applies `maybe-incorrect`), then re-checks; a pass that *increases*
 * the error count is rolled back and the loop stops (unless `--force`). Stops on zero
 * progress or after 4 passes. Writes the result to the input file (or `-o`);
 * `--dry-run` never writes. Report style mirrors `arch repair`.
 */
async function cmdFix(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("fix needs an input file (use a path or `-` for stdin)");
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json);
  }

  const world = makeNodeWorld(baseDirOf(input));
  const maxApplicability = args.unsafe ? ("maybe-incorrect" as const) : ("machine-applicable" as const);
  const MAX_PASSES = 4;

  // Every fix-bearing diagnostic for a source: compile-stage (resolve) diagnostics plus
  // the architectural-soundness lint warnings (some of which now carry a machine-applicable
  // fix, e.g. W_ALIAS_MATCH). lint() is silent on an unresolvable plan, so this is exactly
  // compile's diagnostics whenever there is a fatal error.
  const diagsOf = (src: string): Diagnostic[] => [
    ...compile(src, { noCache: true, world }).diagnostics,
    ...lint(src, { world }),
  ];

  const errorsOf = (src: string): Diagnostic[] =>
    compile(src, { noCache: true, world }).diagnostics.filter((d) => d.severity === "error");

  const applied: Array<{ code?: string; title: string; applicability: string }> = [];
  const skipped: Array<{ code?: string; reason: string }> = [];
  const changeLog: string[] = [];
  let current = source;
  let passes = 0;
  let stopReason: string | undefined;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const diagnostics = diagsOf(current);
    const fixes: FixSuggestion[] = [];
    const codeOf = new Map<FixSuggestion, string | undefined>();
    for (const d of diagnostics) {
      for (const f of d.fixes ?? []) {
        fixes.push(f);
        codeOf.set(f, d.code);
      }
    }
    if (fixes.length === 0) break;

    const report = applyFixes(current, fixes, { maxApplicability });
    if (report.applied.length === 0) break; // zero progress (all skipped/placeholders)

    const errBefore = diagnostics.filter((d) => d.severity === "error").length;
    const errAfter = errorsOf(report.output).length;
    if (errAfter > errBefore && !args.force) {
      stopReason = `pass ${pass + 1} would raise the error count ${errBefore} → ${errAfter}; rolled back (use --force to keep it)`;
      break;
    }

    current = report.output;
    passes++;
    for (const f of report.applied) {
      applied.push({ code: codeOf.get(f), title: f.title, applicability: f.applicability });
      changeLog.push(`applied ${codeOf.get(f) ? `[${codeOf.get(f)}] ` : ""}${f.title}`);
    }
    for (const s of report.skipped) skipped.push({ code: codeOf.get(s.suggestion), reason: s.reason });
  }

  // Residue: distinct codes of remaining problems the loop could not clear (errors,
  // or diagnostics that still carry a fix it declined to auto-apply).
  const finalDiags = diagsOf(current);
  const unresolved = [
    ...new Set(
      finalDiags.filter((d) => d.severity === "error" || d.fixes?.length).flatMap((d) => (d.code ? [d.code] : [])),
    ),
  ];
  const ok = finalDiags.every((d) => d.severity !== "error");

  // Write the result (default: back to the input; `-o` redirects; `--dry-run` never
  // writes). Stdin input with no `-o` streams to stdout.
  const target = args.o ?? (input === "-" ? "-" : input);
  const wrote = current !== source && !args.dryRun;
  if (wrote && target !== "-") {
    try {
      writeFileSync(resolvePath(target), current, "utf8");
    } catch (e) {
      return ioError((e as Error).message, args.json);
    }
  }

  if (args.json) {
    emitJson({ ok, passes, applied, skipped, unresolved });
  } else {
    if (target === "-" && !args.dryRun) process.stdout.write(current);
    if (!args.quiet) {
      for (const c of changeLog) process.stderr.write(`  ${c}\n`);
      for (const s of skipped) process.stderr.write(`  skipped${s.code ? ` [${s.code}]` : ""}: ${s.reason}\n`);
      if (stopReason) process.stderr.write(`  ⚠ ${stopReason}\n`);
      if (applied.length === 0) process.stderr.write("  (no fixes applied)\n");
      else if (wrote && target !== "-")
        process.stderr.write(
          `✓ ${input} → ${target} (${applied.length} fix${applied.length === 1 ? "" : "es"}, ${passes} pass${passes === 1 ? "" : "es"})\n`,
        );
      if (unresolved.length) process.stderr.write(`  unresolved: ${unresolved.join(", ")}\n`);
    }
  }
  return ok ? EXIT.OK : EXIT.USER;
}

/**
 * `arch suggest` — advisory topology suggestions as data (never applied; ADR 0005).
 * For a room with no path to the entrance or a bedroom with no window, prints
 * ready-to-paste `door`/`window` statements (attachment form) plus a rationale.
 */
function cmdSuggest(args: Args): number {
  return withSource(args, (source, input) => {
    const suggestions = suggestTopology(source, { world: makeNodeWorld(baseDirOf(input)) });
    if (args.json) {
      emitJson({ ok: true, suggestions });
      return EXIT.OK;
    }
    if (suggestions.length === 0) {
      if (!args.quiet) process.stdout.write("no topology suggestions\n");
      return EXIT.OK;
    }
    const lines: string[] = [];
    for (const s of suggestions) {
      lines.push(`${s.code}: ${s.problem}`);
      for (const c of s.candidates) lines.push(`  ${c.insertText}\n    → ${c.rationale}`);
    }
    process.stdout.write(lines.join("\n") + "\n");
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

/** Locate llms-full.txt relative to this module (shipped at the package root). */
function readContext(): string | null {
  for (const rel of ["../llms-full.txt", "../../llms-full.txt"]) {
    const p = resolvePath(HERE, rel);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

function cmdContext(args: Args): number {
  const context = readContext();
  if (context === null) return ioError("llms-full.txt not found", args.json);
  if (args.json) emitJson({ ok: true, context });
  else process.stdout.write(context.endsWith("\n") ? context : context + "\n");
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
  arch compile  <in.arch|-> [-o out|-] [-w width] [-f svg|dxf|txt|pdf|png] [--cols n] [--charset unicode|ascii] [--overlay circulation] [--error-svg] [--accessible] [--from-json] [--install] [--json] [--quiet]
  arch preview  <in.arch|-> [-o out.png] [-s scale] [--ascii [--cols n] [--charset …]] [--error-svg] [--install] [--json]   render a PNG (or ASCII text) you can look at
  arch batch    <a.arch> <b.arch> … [-o dir] [-f …] [-j jobs] [--json]   render many files concurrently
  arch md       <doc.md> [-o out.md] [-f svg|png] [--error-svg] [--json]   render fenced arch blocks → image links
  arch watch    <in.arch> [-o out] [-w width] [-f …]
  arch validate <in.arch|-> [--strict] [--graph g.json] [--intent i.json [--feedback]] [--json]   parse + resolve + lint + optional graph/intent gate (no render)
  arch describe <in.arch|-> [--json]      semantic facts (rooms, areas, adjacency)
  arch score    <in.arch|-> --brief i.json [--json]   continuous intent satisfaction (satisfied/total) — measures, never gates
  arch lint     <in.arch|-> [--profile residential-basic|accessibility-advisory] [--strict] [--json]   architectural soundness warnings
  arch ast      <in.arch|-> [--json]      parse only → span-bearing AST JSON (no resolve/render)
  arch complete <in.arch|-> --at <n> [--json]   completion items in scope at a byte offset
  arch fmt      <in.arch|-> [--write] [--json]
  arch repair   <in.arch|-> [-o out|-] [--json]   emit corrected source (furniture out of walls) + change log
  arch fix      <in.arch|-> [-o out|-] [--unsafe] [--dry-run] [--force] [--json]   apply machine-applicable diagnostic fixes
  arch suggest  <in.arch|-> [--json]      advisory topology suggestions (door/window statements to paste)
  arch manifest [--json]                  the whole CLI API as structured data (for agents)
  arch spec     [--json]                  print the one-prompt language spec
  arch context  [--json]                  print the full bundled agent context (spec + workflow + CLI + errors)
  arch new      [-o out] [--force] [--json]   scaffold a starter .arch
  arch explain  <CODE> [--json]           e.g. E_ROOM_SIZE

Input  '-' reads source from stdin.   Output '-' writes the artifact to stdout.
Every command takes --json: result on stdout, messages on stderr.
--strict (validate/lint, alias --fail-on-warning): advisory warnings fail too (exit 2).
--error-svg (compile/preview/md): on a broken plan, still emit a self-describing error-card image
  (SVG, or PNG for preview) listing the diagnostics; exit code stays 2.
--accessible (compile, SVG): emit <title>/<desc>/role="img"/aria-labelledby (the describe() caption)
  so the drawing is self-describing for assistive tech and machine readers; default output is unchanged.
--from-json (compile): read the input as Plan JSON (RPLAN shape), convert to .arch, then compile (all -f/-o flags apply).
--graph <g.json> (validate): check interior-door adjacency against an intended graph (bare dict or {input_graph:{…}}); mismatch → exit 2.
--intent <i.json> (validate): gate the plan against a brief's intent JSON; a failing gating assertion → exit 2 (adjacency/reachability score but never gate). --feedback appends per-violation correction prompts.
--brief <i.json> (score): the intent JSON to measure against; score reports satisfied/total and always exits 0 on a successful measurement.
--at <byteOffset> (complete): required; the source offset to list completions at.
--install (compile -f png/pdf, preview): auto-install the missing optional render dep, then retry.
--ascii (preview) / -f txt (compile): render a zero-dependency ASCII text plan (--cols, --charset).
Exit codes: 0 ok · 2 user-source error (don't retry) · 1 internal/IO · 3 bad usage.
Formats: svg (default) · dxf (zero-dep) · txt (zero-dep ASCII) · pdf (optional pdfkit) · png (optional @resvg/resvg-js)
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(cmd ? EXIT.OK : EXIT.USAGE);
  }

  switch (cmd) {
    case "compile":
      return process.exit(await cmdCompile(args));
    case "preview":
      return process.exit(await cmdPreview(args));
    case "batch":
      return process.exit(await cmdBatch(args));
    case "md":
    case "markdown":
      return process.exit(await cmdMd(args));
    case "manifest":
    case "capabilities":
      return process.exit(cmdManifest(args));
    case "watch":
      return process.exit(await cmdWatch(args));
    case "validate":
      return process.exit(cmdValidate(args));
    case "describe":
      return process.exit(cmdDescribe(args));
    case "score":
      return process.exit(cmdScore(args));
    case "lint":
      return process.exit(cmdLint(args));
    case "ast":
      return process.exit(cmdAst(args));
    case "complete":
      return process.exit(cmdComplete(args));
    case "fmt":
      return process.exit(cmdFmt(args));
    case "repair":
      return process.exit(cmdRepair(args));
    case "fix":
      return process.exit(await cmdFix(args));
    case "suggest":
      return process.exit(cmdSuggest(args));
    case "spec":
      return process.exit(cmdSpec(args));
    case "context":
      return process.exit(cmdContext(args));
    case "new":
    case "init":
      return process.exit(cmdNew(args));
    case "explain":
      return process.exit(cmdExplain(args));
    default:
      return process.exit(usageError(`unknown command "${cmd}" (try \`arch help\`)`));
  }
}

void main();
