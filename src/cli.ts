#!/usr/bin/env node
/** ArchLang CLI: `arch compile <in.arch> [-o out.svg]`, `arch watch <in.arch>`. */

import { readFileSync, writeFileSync, watchFile } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { compile, format, formatDiagnostic, loadClipperBackend, setGeometryBackend, toDxf, toPdf } from "./index.js";
import type { World } from "./index.js";

type Format = "svg" | "dxf" | "pdf";

/**
 * A real-filesystem {@link World}: import paths resolve relative to `baseDir`
 * and `now` is the wall clock. This is the one spot Node APIs and real time are
 * allowed — the compiler core stays pure and gets its environment injected here.
 */
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

/**
 * Best-effort registration of the optional angled-geometry engine. Loaded once,
 * before compiling, so the synchronous pipeline can use it for non-axis-aligned
 * walls. Absent dependency ⇒ silently keep the zero-dep per-segment fallback.
 */
async function tryLoadGeometryBackend(): Promise<void> {
  try {
    setGeometryBackend(await loadClipperBackend());
  } catch {
    // clipper2-wasm not installed — angled walls fall back to per-segment.
  }
}

async function compileFile(input: string, output: string, format: Format, width?: number): Promise<boolean> {
  let source: string;
  try {
    source = readFileSync(input, "utf8");
  } catch {
    process.stderr.write(`error: cannot read ${input}\n`);
    return false;
  }
  const { svg, diagnostics, scene } = compile(source, { width, noCache: true, world: makeNodeWorld(dirname(input)) });
  for (const d of diagnostics) {
    process.stderr.write(`${formatDiagnostic(source, d)}\n\n`);
  }
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  if (errorCount > 0 || !scene) {
    process.stderr.write(`✗ compilation failed (${errorCount} error${errorCount > 1 ? "s" : ""})\n`);
    return false;
  }

  if (format === "dxf") {
    const dxf = toDxf(scene);
    writeFileSync(output, dxf, "utf8");
    process.stdout.write(`✓ ${input} → ${output} (${dxf.length} bytes, DXF)\n`);
    return true;
  }
  if (format === "pdf") {
    try {
      const pdf = await toPdf(scene);
      writeFileSync(output, pdf);
      process.stdout.write(`✓ ${input} → ${output} (${pdf.length} bytes, PDF)\n`);
      return true;
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      return false;
    }
  }
  writeFileSync(output, svg, "utf8");
  process.stdout.write(`✓ ${input} → ${output} (${svg.length} bytes)\n`);
  return true;
}

function parseArgs(argv: string[]): { _: string[]; o?: string; width?: number; format?: string; write?: boolean } {
  const res: { _: string[]; o?: string; width?: number; format?: string; write?: boolean } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") res.o = argv[++i];
    else if (a === "-w" || a === "--width") res.width = Number(argv[++i]);
    else if (a === "-f" || a === "--format") res.format = argv[++i];
    else if (a === "--write") res.write = true;
    else res._.push(a);
  }
  return res;
}

/**
 * `arch fmt <in.arch> [--write]` — format source to canonical, comment-preserving
 * form. Prints to stdout by default; `--write` rewrites the file in place.
 */
function fmtFile(input: string, write: boolean): boolean {
  let source: string;
  try {
    source = readFileSync(input, "utf8");
  } catch {
    process.stderr.write(`error: cannot read ${input}\n`);
    return false;
  }
  const formatted = format(source);
  if (write) {
    if (formatted !== source) writeFileSync(input, formatted, "utf8");
    process.stdout.write(`✓ ${input} formatted${formatted === source ? " (no changes)" : ""}\n`);
  } else {
    process.stdout.write(formatted);
  }
  return true;
}

function defaultOut(input: string, format: Format): string {
  return input.replace(/\.arch$/i, "") + "." + format;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(
      `arch — ArchLang compiler\n\n` +
        `Usage:\n` +
        `  arch compile <in.arch> [-o out] [-w width] [-f svg|dxf|pdf]\n` +
        `  arch watch   <in.arch> [-o out] [-w width] [-f svg|dxf|pdf]\n` +
        `  arch fmt     <in.arch> [--write]\n\n` +
        `Formats: svg (default) · dxf (zero-dep) · pdf (needs optional pdfkit + svg-to-pdfkit)\n`,
    );
    process.exit(cmd ? 0 : 1);
  }

  // `fmt` is a pure text→text command — no geometry backend, no output format.
  if (cmd === "fmt") {
    const input = args._[0];
    if (!input) {
      process.stderr.write("error: missing input file\n");
      process.exit(1);
    }
    process.exit(fmtFile(resolvePath(input), args.write ?? false) ? 0 : 1);
  }

  const fmt = (args.format ?? "svg").toLowerCase();
  if (fmt !== "svg" && fmt !== "dxf" && fmt !== "pdf") {
    process.stderr.write(`error: unknown format "${args.format}" (use svg, dxf, or pdf)\n`);
    process.exit(1);
  }
  const format = fmt as Format;

  const input = args._[0];
  if (!input) {
    process.stderr.write("error: missing input file\n");
    process.exit(1);
  }
  const inPath = resolvePath(input);
  const output = args.o ? resolvePath(args.o) : defaultOut(inPath, format);

  // Enable seamless angled-wall joinery when the optional engine is available.
  await tryLoadGeometryBackend();

  if (cmd === "compile") {
    process.exit((await compileFile(inPath, output, format, args.width)) ? 0 : 1);
  } else if (cmd === "watch") {
    await compileFile(inPath, output, format, args.width);
    process.stdout.write(`watching ${input} … (Ctrl+C to stop)\n`);
    watchFile(inPath, { interval: 300 }, () => {
      void compileFile(inPath, output, format, args.width);
    });
  } else {
    process.stderr.write(`error: unknown command "${cmd}"\n`);
    process.exit(1);
  }
}

void main();
