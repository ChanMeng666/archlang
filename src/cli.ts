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
 *
 * This file is the argument-parse + dispatch entry point; the commands themselves
 * (and their shared IO/render helpers) live in `src/cli/`. Node APIs and real time
 * are allowed here and across `src/cli/`, the one place they are — everything else
 * in `src/` gets its environment via the `World` seam.
 */

import { EXIT, parseArgs, usageError } from "./cli/io.js";
import { cmdBatch, cmdCompile, cmdMd, cmdPreview, cmdWatch } from "./cli/commands-render.js";
import { cmdDescribe, cmdLint, cmdScore, cmdValidate } from "./cli/commands-analyze.js";
import { cmdAst, cmdComplete, cmdFix, cmdFmt, cmdRepair, cmdSuggest } from "./cli/commands-author.js";
import { cmdContext, cmdExplain, cmdManifest, cmdNew, cmdSpec } from "./cli/commands-meta.js";

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
