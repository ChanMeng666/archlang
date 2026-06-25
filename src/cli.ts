#!/usr/bin/env node
/** ArchLang CLI: `arch compile <in.arch> [-o out.svg]`, `arch watch <in.arch>`. */

import { readFileSync, writeFileSync, watchFile } from "node:fs";
import { resolve } from "node:path";
import { compile, formatDiagnostic } from "./index.js";

function compileFile(input: string, output: string, width?: number): boolean {
  let source: string;
  try {
    source = readFileSync(input, "utf8");
  } catch {
    process.stderr.write(`error: cannot read ${input}\n`);
    return false;
  }
  const { svg, diagnostics } = compile(source, { width, noCache: true });
  for (const d of diagnostics) {
    process.stderr.write(`${formatDiagnostic(source, d)}\n\n`);
  }
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  if (errorCount > 0) {
    process.stderr.write(`✗ compilation failed (${errorCount} error${errorCount > 1 ? "s" : ""})\n`);
    return false;
  }
  writeFileSync(output, svg, "utf8");
  process.stdout.write(`✓ ${input} → ${output} (${svg.length} bytes)\n`);
  return true;
}

function parseArgs(argv: string[]): { _: string[]; o?: string; width?: number } {
  const res: { _: string[]; o?: string; width?: number } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") res.o = argv[++i];
    else if (a === "-w" || a === "--width") res.width = Number(argv[++i]);
    else res._.push(a);
  }
  return res;
}

function defaultOut(input: string): string {
  return input.replace(/\.arch$/i, "") + ".svg";
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(
      `arch — ArchLang compiler\n\n` +
        `Usage:\n` +
        `  arch compile <in.arch> [-o out.svg] [-w width]\n` +
        `  arch watch   <in.arch> [-o out.svg] [-w width]\n`,
    );
    process.exit(cmd ? 0 : 1);
  }

  const input = args._[0];
  if (!input) {
    process.stderr.write("error: missing input file\n");
    process.exit(1);
  }
  const output = args.o ? resolve(args.o) : defaultOut(resolve(input));

  if (cmd === "compile") {
    process.exit(compileFile(resolve(input), output, args.width) ? 0 : 1);
  } else if (cmd === "watch") {
    compileFile(resolve(input), output, args.width);
    process.stdout.write(`watching ${input} … (Ctrl+C to stop)\n`);
    watchFile(resolve(input), { interval: 300 }, () => compileFile(resolve(input), output, args.width));
  } else {
    process.stderr.write(`error: unknown command "${cmd}"\n`);
    process.exit(1);
  }
}

main();
