/**
 * Shared CLI infrastructure — argument parsing, the {@link World}/IO seam, exit
 * codes, and the small emit/format helpers every command module reuses. Split out
 * of the former monolithic `src/cli.ts` (mechanical; behavior unchanged). Node APIs
 * and real time are allowed here — and across `src/cli/` — the one place they are.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDiagnostic, setGeometryBackend, loadClipperBackend, EXPORT_FORMATS, planFromJson } from "../index.js";
import type { Diagnostic, World, ExportFormat } from "../index.js";

export type Format = ExportFormat;
/** Known `-f` ids and the "svg, dxf, pdf, or png" usage phrasing, from the one table. */
export const FORMAT_IDS = new Set<string>(EXPORT_FORMATS.map((f) => f.id));
export const FORMAT_LIST = `${EXPORT_FORMATS.slice(0, -1)
  .map((f) => f.id)
  .join(", ")}, or ${EXPORT_FORMATS[EXPORT_FORMATS.length - 1]!.id}`;

/** Deterministic exit codes (documented in `--help`). */
export const EXIT = { OK: 0, INTERNAL: 1, USER: 2, USAGE: 3 } as const;

export const HERE = dirname(fileURLToPath(import.meta.url));

export interface Args {
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

export function parseArgs(argv: string[]): Args {
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
export const VERSION = readVersion();

/** Read source from a file, or from stdin when `path` is `-`. */
export function readInput(path: string): string {
  return path === "-" ? readFileSync(0, "utf8") : readFileSync(resolvePath(path), "utf8");
}

/** A real-filesystem {@link World}: imports resolve against `baseDir`; `now` is the
 *  wall clock. The one spot Node APIs + real time are allowed. */
export function makeNodeWorld(baseDir: string): World {
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
export const baseDirOf = (input: string): string => (input === "-" ? process.cwd() : dirname(resolvePath(input)));

export async function tryLoadGeometryBackend(): Promise<void> {
  try {
    setGeometryBackend(await loadClipperBackend());
  } catch {
    // clipper2-wasm not installed — angled walls fall back to per-segment.
  }
}

export function emitJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

/** Print diagnostics as framed snippets to stderr (unless quiet). */
export function emitDiagnosticsHuman(source: string, diags: Diagnostic[], quiet?: boolean): void {
  if (quiet) return;
  for (const d of diags) process.stderr.write(`${formatDiagnostic(source, d)}\n\n`);
}

export const hasErrors = (diags: Diagnostic[]): boolean => diags.some((d) => d.severity === "error");

/** A plain (non-array) object — used to sniff the `--graph` / Plan-JSON shapes. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Convert Plan-JSON text (`--from-json`) to canonical `.arch` source. On a JSON
 * syntax error or a shape/kind problem, returns the error diagnostics (with the
 * partially-generated source, when any, so line/col projection still works);
 * on success returns the `.arch` string the compile pipeline then consumes.
 */
export function sourceFromJson(jsonText: string): { source: string } | { error: Diagnostic[]; generated?: string } {
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

export function defaultOut(input: string, format: Format): string {
  if (input === "-") return `out.${format}`;
  return resolvePath(input).replace(/\.arch$/i, "") + "." + format;
}

/** Parse + validate the `-f` format, or `null` if it's not a known format. */
export function parseFormat(args: Args): Format | null {
  const fmt = (args.format ?? "svg").toLowerCase();
  return FORMAT_IDS.has(fmt) ? (fmt as Format) : null;
}

/** Normalize the `--charset` flag to the text backend's union (unknown → unicode). */
export const asciiCharset = (args: Args): "unicode" | "ascii" => (args.charset === "ascii" ? "ascii" : "unicode");

export function usageError(msg: string): number {
  process.stderr.write(`error: ${msg}\n`);
  return EXIT.USAGE;
}

export function ioError(msg: string, json?: boolean, extra?: Record<string, unknown>): number {
  if (json) emitJson({ ok: false, error: msg, ...extra });
  else process.stderr.write(`error: ${msg}\n`);
  return EXIT.INTERNAL;
}

/** Read source for a command from a file (or stdin `-`), then run `run`; the shared
 *  entry ladder for the single-source commands (describe/lint/fmt/…). */
export function withSource(args: Args, run: (source: string, input: string) => number): number {
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
