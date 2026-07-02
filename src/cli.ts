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
  formatDiagnostic,
  offsetToLineCol,
  ERROR_CATALOG,
  loadClipperBackend,
  renderPng,
  setGeometryBackend,
  toDxf,
  toPdf,
  buildManifest,
  extractArchBlocks,
  rewriteMarkdown,
} from "./index.js";
import type { Diagnostic, World, Scene } from "./index.js";
// Internal (not part of the public surface): parse → link → resolve without
// rendering — validate/lint need only the diagnostics, never the SVG.
import { resolvePlan } from "./analyze.js";

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
  strict?: boolean;
  /** `-j/--jobs`: max concurrent renders for `batch`. */
  jobs?: number;
  /** `-s/--scale`: raster scale for PNG (`preview` defaults to 2). */
  scale?: number;
  /** `--install`: auto-install a missing optional render dep, then retry. */
  install?: boolean;
}

function parseArgs(argv: string[]): Args {
  const res: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") res.o = argv[++i];
    else if (a === "-w" || a === "--width") res.width = Number(argv[++i]);
    else if (a === "-f" || a === "--format") res.format = argv[++i];
    else if (a === "-j" || a === "--jobs") res.jobs = Number(argv[++i]);
    else if (a === "-s" || a === "--scale") res.scale = Number(argv[++i]);
    else if (a === "--install") res.install = true;
    else if (a === "--write") res.write = true;
    else if (a === "--json") res.json = true;
    else if (a === "--quiet" || a === "-q") res.quiet = true;
    else if (a === "--force") res.force = true;
    else if (a === "--profile") res.profile = argv[++i];
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

/** Parse + validate the `-f` format, or `null` if it's not a known format. */
function parseFormat(args: Args): Format | null {
  const fmt = (args.format ?? "svg").toLowerCase();
  return fmt === "svg" || fmt === "dxf" || fmt === "pdf" || fmt === "png" ? (fmt as Format) : null;
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

/** Serialize a built Scene to the requested format (auto-installing optional deps if asked). */
async function serialize(scene: Scene, svg: string, format: Format, args: Args): Promise<string | Uint8Array> {
  if (format === "dxf") return toDxf(scene);
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
  });
  if (hasErrors(diagnostics) || !scene) return { diagnostics };
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
  o.diagnostics = r.diagnostics.map((d) => diagToJson(r.source, d));
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
      results[i] = await tasks[i]();
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
  if (!format) return usageError(`unknown format "${args.format}" (use svg, dxf, pdf, or png)`);

  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
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

  if (r.bytes === undefined) {
    const diagnostics = r.diagnostics;
    if (args.json) {
      emitJson({ ok: false, format, diagnostics: diagnostics.map((d) => diagToJson(source, d)) });
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
// preview / batch / md / manifest
// ---------------------------------------------------------------------------

/**
 * `preview` — render a PNG an agent can *look at*. PNG-first, default `scale 2`
 * for legibility. Zero-install where the optional `@resvg/resvg-js` binary is
 * present (a normal `npm i`/`npx` installs it); otherwise the failure carries the
 * `E_PNG_DEPENDENCY` code + fix, and `--install` fetches it and retries.
 */
async function cmdPreview(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("preview needs an input file (use a path or `-` for stdin)");
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
    if (args.json) emitJson({ ok: false, format, diagnostics: r.diagnostics.map((d) => diagToJson(source, d)) });
    else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ compilation failed\n");
    }
    return EXIT.USER;
  }

  let target = args.o ?? defaultOut(input, format);
  if (args.json && target === "-") target = defaultOut(input === "-" ? "-" : input, format);
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
      diagnostics: warnings.map((d) => diagToJson(source, d)),
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
  if (!format) return usageError(`unknown format "${args.format}" (use svg, dxf, pdf, or png)`);

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
    images.push({
      input: `block ${b.index + 1}`,
      ok: true,
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
      emitJson({ ...summary, diagnostics: summary.diagnostics.map((d) => diagToJson(source, d)) });
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
    emitJson({ ok, strict: args.strict ?? false, diagnostics: diags.map((d) => diagToJson(source, d)) });
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
    // Render-free: resolvePlan carries every diagnostic compile() would.
    const { diagnostics } = resolvePlan(source, { world });
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
  arch compile  <in.arch|-> [-o out|-] [-w width] [-f svg|dxf|pdf|png] [--install] [--json] [--quiet]
  arch preview  <in.arch|-> [-o out.png] [-s scale] [--install] [--json]   render a PNG you can look at
  arch batch    <a.arch> <b.arch> … [-o dir] [-f …] [-j jobs] [--json]   render many files concurrently
  arch md       <doc.md> [-o out.md] [-f svg|png] [--json]   render fenced arch blocks → image links
  arch watch    <in.arch> [-o out] [-w width] [-f …]
  arch validate <in.arch|-> [--strict] [--json]      parse + resolve + lint (no render)
  arch describe <in.arch|-> [--json]      semantic facts (rooms, areas, adjacency)
  arch lint     <in.arch|-> [--profile residential-basic|accessibility-advisory] [--strict] [--json]   architectural soundness warnings
  arch fmt      <in.arch|-> [--write] [--json]
  arch repair   <in.arch|-> [-o out|-] [--json]   emit corrected source (furniture out of walls) + change log
  arch manifest [--json]                  the whole CLI API as structured data (for agents)
  arch spec     [--json]                  print the one-prompt language spec
  arch new      [-o out] [--force] [--json]   scaffold a starter .arch
  arch explain  <CODE> [--json]           e.g. E_ROOM_SIZE

Input  '-' reads source from stdin.   Output '-' writes the artifact to stdout.
Every command takes --json: result on stdout, messages on stderr.
--strict (validate/lint, alias --fail-on-warning): advisory warnings fail too (exit 2).
--install (compile -f png/pdf, preview): auto-install the missing optional render dep, then retry.
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
    case "lint":
      return process.exit(cmdLint(args));
    case "fmt":
      return process.exit(cmdFmt(args));
    case "repair":
      return process.exit(cmdRepair(args));
    case "spec":
      return process.exit(cmdSpec(args));
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
