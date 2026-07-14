/**
 * Shared CLI infrastructure — argument parsing, the {@link World}/IO seam, exit
 * codes, and the small emit/format helpers every command module reuses. Split out
 * of the former monolithic `src/cli.ts` (mechanical; behavior unchanged). Node APIs
 * and real time are allowed here — and across `src/cli/` — the one place they are.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatDiagnostic,
  setGeometryBackend,
  loadClipperBackend,
  EXPORT_FORMATS,
  planFromJson,
  buildManifest,
  ERROR_CATALOG,
} from "../index.js";
import type { Diagnostic, World, ExportFormat, ManifestCommand, ManifestFlag } from "../index.js";

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
  /** `--backup`: (fix) save the original bytes to `<target>.bak` before overwriting in place. */
  backup?: boolean;
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
  /** `--room <id[,id…]>`: (describe) keep only these rooms and what touches them. */
  room?: string;
  /** `--select <key[,key…]>`: (describe) emit only these top-level keys of the JSON. */
  select?: string;
  /** `--code <CODE[,…]>`: (lint/validate) DISPLAY-filter diagnostics by code — never gating. */
  code?: string;
  /** `--severity <error|warning>`: (lint/validate) DISPLAY-filter diagnostics — never gating. */
  severity?: string;
  /** `--section <spec|workflow|cli|errors>`: (context) print one section of the bundle, not all of it. */
  section?: string;
  /** `--help`/`-h`: print the command's help instead of running it (handled in `main`). */
  help?: boolean;
  /** Tokens that look like flags but this command does not accept — `main` exits 3 on any. */
  unknownFlags?: string[];
}

/** How a flag token is parsed: which {@link Args} field it fills, and with what. */
export interface FlagSpec {
  key: keyof Args;
  kind: "string" | "number" | "boolean";
}

/**
 * The one parse table: EVERY flag name and alias the CLI accepts, mapped to the
 * {@link Args} field it fills. Two invariants a drift test
 * (`test/cli-help.test.ts`) enforces both ways:
 *
 *  - every flag/alias in the manifest's command table (and its `globalFlags`) has an
 *    entry here, and every entry here is documented by the manifest;
 *  - a flag with a manifest `arg` is a value-taking (non-`boolean`) kind, and vice-versa.
 *
 * So the parser, the help renderer, `arch manifest --json`, and `docs/cli-reference.md`
 * all describe the same CLI — an undeclared flag can no longer be silently swallowed as
 * a positional (which is how `--jsn` used to become an input filename).
 */
export const FLAG_KEYS: Record<string, FlagSpec> = {
  "--out": { key: "o", kind: "string" },
  "-o": { key: "o", kind: "string" },
  "--width": { key: "width", kind: "number" },
  "-w": { key: "width", kind: "number" },
  "--format": { key: "format", kind: "string" },
  "-f": { key: "format", kind: "string" },
  "--jobs": { key: "jobs", kind: "number" },
  "-j": { key: "jobs", kind: "number" },
  "--scale": { key: "scale", kind: "number" },
  "-s": { key: "scale", kind: "number" },
  "--cols": { key: "cols", kind: "number" },
  "--at": { key: "at", kind: "number" },
  "--charset": { key: "charset", kind: "string" },
  "--profile": { key: "profile", kind: "string" },
  "--overlay": { key: "overlay", kind: "string" },
  "--room": { key: "room", kind: "string" },
  "--select": { key: "select", kind: "string" },
  "--code": { key: "code", kind: "string" },
  "--severity": { key: "severity", kind: "string" },
  "--section": { key: "section", kind: "string" },
  "--graph": { key: "graph", kind: "string" },
  "--intent": { key: "intent", kind: "string" },
  "--brief": { key: "brief", kind: "string" },
  "--from-json": { key: "fromJson", kind: "boolean" },
  "--feedback": { key: "feedback", kind: "boolean" },
  "--ascii": { key: "ascii", kind: "boolean" },
  "--install": { key: "install", kind: "boolean" },
  "--unsafe": { key: "unsafe", kind: "boolean" },
  "--dry-run": { key: "dryRun", kind: "boolean" },
  "--backup": { key: "backup", kind: "boolean" },
  "--write": { key: "write", kind: "boolean" },
  "--json": { key: "json", kind: "boolean" },
  "--quiet": { key: "quiet", kind: "boolean" },
  "-q": { key: "quiet", kind: "boolean" },
  "--force": { key: "force", kind: "boolean" },
  "--error-svg": { key: "errorSvg", kind: "boolean" },
  "--accessible": { key: "accessible", kind: "boolean" },
  "--strict": { key: "strict", kind: "boolean" },
  "--fail-on-warning": { key: "strict", kind: "boolean" },
};

/** `--help`/`-h` is accepted by every command and handled inside {@link parseArgs}. */
export const HELP_FLAGS: readonly string[] = ["--help", "-h"];

const flagNames = (flags: readonly ManifestFlag[]): string[] =>
  flags.flatMap((f) => (f.alias ? [f.flag, f.alias] : [f.flag]));

/** The global flags every command tolerates (`--json`/`--quiet`), from the manifest. */
const GLOBAL_FLAG_NAMES: readonly string[] = flagNames(buildManifest("0.0.0").globalFlags);

/** Every flag token `command` accepts: its own flags + the global ones + help. */
export function allowedFlags(command: ManifestCommand): string[] {
  return [...new Set([...flagNames(command.flags), ...GLOBAL_FLAG_NAMES, ...HELP_FLAGS])];
}

/**
 * Parse `argv` against {@link FLAG_KEYS}. When a `command` is given, a flag it does not
 * declare is rejected (collected into `unknownFlags`) rather than swallowed as a
 * positional; `--help`/`-h` short-circuits to `help: true` so `arch describe --help`
 * prints help instead of failing on the missing input file.
 */
export function parseArgs(argv: string[], command?: ManifestCommand): Args {
  const allowed = command ? new Set(allowedFlags(command)) : null;
  const res: Args = { _: [] };
  const bag = res as unknown as Record<string, unknown>;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (HELP_FLAGS.includes(a)) {
      res.help = true;
      continue;
    }
    const spec = FLAG_KEYS[a];
    if (spec && (!allowed || allowed.has(a))) {
      if (spec.kind === "boolean") bag[spec.key] = true;
      else {
        const raw = argv[++i];
        bag[spec.key] = spec.kind === "number" ? Number(raw) : raw;
      }
      continue;
    }
    // A `-`-leading token that isn't a flag this command takes is an error, never a
    // filename. Bare `-` stays the stdin sentinel. No value is consumed for it.
    if (a !== "-" && a.startsWith("-")) {
      res.unknownFlags = [...(res.unknownFlags ?? []), a];
    } else res._.push(a);
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

/**
 * The catalog's one-line remedy for a diagnostic, rendered in `formatDiagnostic`'s
 * `= help:` style — or `""` when the code is uncatalogued (or carries no fix), so a
 * bare `= fix:` line is never printed. JSON mode already carries this field
 * (`diagnosticToJson`); this is the human-mode parity so a reader of stderr does not
 * have to run `arch explain <CODE>` to learn the remedy.
 */
function catalogFixLine(d: Diagnostic): string {
  const fix = d.code ? ERROR_CATALOG[d.code]?.fix : undefined;
  return fix ? `\n  = fix: ${fix}` : "";
}

/** Print diagnostics as framed snippets to stderr (unless quiet), each followed by
 *  the error catalog's `fix` line when the code has one. */
export function emitDiagnosticsHuman(source: string, diags: Diagnostic[], quiet?: boolean): void {
  if (quiet) return;
  for (const d of diags) process.stderr.write(`${formatDiagnostic(source, d)}${catalogFixLine(d)}\n\n`);
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
