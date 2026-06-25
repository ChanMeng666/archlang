#!/usr/bin/env node
/** ArchLang CLI: `arch compile <in.arch> [-o out.svg]`, `arch watch <in.arch>`. */

import { readFileSync, writeFileSync, watchFile } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { compile, formatDiagnostic, resolve, toDxf, toPdf } from "./index.js";

type Format = "svg" | "dxf" | "pdf";

async function compileFile(input: string, output: string, format: Format, width?: number): Promise<boolean> {
  let source: string;
  try {
    source = readFileSync(input, "utf8");
  } catch {
    process.stderr.write(`error: cannot read ${input}\n`);
    return false;
  }
  const { svg, diagnostics, ast } = compile(source, { width, noCache: true });
  for (const d of diagnostics) {
    process.stderr.write(`${formatDiagnostic(source, d)}\n\n`);
  }
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  if (errorCount > 0) {
    process.stderr.write(`✗ compilation failed (${errorCount} error${errorCount > 1 ? "s" : ""})\n`);
    return false;
  }

  if (format === "dxf") {
    const { ir } = resolve(ast!);
    const dxf = toDxf(ir);
    writeFileSync(output, dxf, "utf8");
    process.stdout.write(`✓ ${input} → ${output} (${dxf.length} bytes, DXF)\n`);
    return true;
  }
  if (format === "pdf") {
    try {
      const pdf = await toPdf(svg);
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

function parseArgs(argv: string[]): { _: string[]; o?: string; width?: number; format?: string } {
  const res: { _: string[]; o?: string; width?: number; format?: string } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") res.o = argv[++i];
    else if (a === "-w" || a === "--width") res.width = Number(argv[++i]);
    else if (a === "-f" || a === "--format") res.format = argv[++i];
    else res._.push(a);
  }
  return res;
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
        `  arch watch   <in.arch> [-o out] [-w width] [-f svg|dxf|pdf]\n\n` +
        `Formats: svg (default) · dxf (zero-dep) · pdf (needs optional pdfkit + svg-to-pdfkit)\n`,
    );
    process.exit(cmd ? 0 : 1);
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
