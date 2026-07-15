/**
 * The authoring/transform commands — `ast`, `complete`, `fmt`, `repair`, `fix`,
 * `suggest`. They parse/format/correct source (the syntactic `fix` and the geometric
 * `repair` are a hard boundary; see ADR 0006/0011). Split out of the former
 * monolithic `src/cli.ts` (mechanical; behavior unchanged).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  compile,
  lint,
  format,
  repair,
  applyFixes,
  rankFixes,
  suggestTopology,
  astToJson,
  completion,
  diagnosticToJson,
  unifiedDiff,
} from "../index.js";
import type { Diagnostic, FixSuggestion } from "../index.js";
// `arch ast` parses without resolving/rendering; parse() is not on the public
// surface, so the CLI reaches for it directly (as it does resolvePlan).
import { parse } from "../parser.js";
import {
  type Args,
  EXIT,
  baseDirOf,
  emitDiagnosticsHuman,
  emitJson,
  hasErrors,
  ioError,
  makeNodeWorld,
  readInput,
  usageError,
  withSource,
} from "./io.js";

// ---------------------------------------------------------------------------
// ast / complete
// ---------------------------------------------------------------------------

/**
 * `ast` — parse only (no resolve/render) and print the span-bearing AST as JSON
 * (`astToJson`: scripting nodes appear as their kind, unexpanded). The parser
 * recovers, so a partial AST is emitted even on error; error diagnostics still
 * force exit 2. Human mode pretty-prints the same JSON (diagnostics → stderr).
 */
export function cmdAst(args: Args): number {
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
export function cmdComplete(args: Args): number {
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
// fmt / repair / fix / suggest
// ---------------------------------------------------------------------------

export function cmdFmt(args: Args): number {
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
export function cmdRepair(args: Args): number {
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
 *
 * Because the default target is the input file itself, this rewrite is the CLI's one
 * destructive act — so it is previewable and reversible: whenever the source changes, a
 * unified diff of exactly what would be written goes to stderr (human mode, `--dry-run`
 * included) and into `--json` as `diff`, and `--backup` saves the target's original bytes
 * to `<target>.bak` before overwriting (opt-in, so a plain `fix` leaves no `.bak` litter).
 */
export async function cmdFix(args: Args): Promise<number> {
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
      // The `fixes` on one diagnostic are mutually-exclusive alternatives — take the
      // single top-ranked one (rankFixes is the identity on today's singleton arrays,
      // so this is byte-identical until a producer emits real alternatives).
      const [chosen] = rankFixes(d.fixes ?? []);
      if (!chosen) continue;
      fixes.push(chosen);
      codeOf.set(chosen, d.code);
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
  const changed = current !== source;
  const wrote = changed && !args.dryRun;
  // The exact bytes the write would produce, as a patch — the preview an agent needs to
  // decide whether to accept an in-place rewrite. Empty when nothing changed.
  const diff = changed
    ? unifiedDiff(source, current, `a/${input === "-" ? "stdin" : input}`, `b/${target === "-" ? "stdout" : target}`)
    : "";

  // `--backup`: preserve what is about to be clobbered. Only a real file that already
  // exists has anything to lose, so `-o new-file.arch` and stdout write no `.bak`.
  let backup: string | undefined;
  if (wrote && target !== "-" && args.backup) {
    const path = resolvePath(target);
    if (existsSync(path)) {
      try {
        writeFileSync(`${path}.bak`, readFileSync(path, "utf8"), "utf8");
        backup = `${target}.bak`;
      } catch (e) {
        return ioError((e as Error).message, args.json);
      }
    }
  }

  if (wrote && target !== "-") {
    try {
      writeFileSync(resolvePath(target), current, "utf8");
    } catch (e) {
      return ioError((e as Error).message, args.json);
    }
  }

  if (args.json) {
    // Append-only: `wrote`/`target` say whether (and where) bytes landed, `backup` names
    // the saved original, `diff` carries the patch. The four are omitted-when-absent only
    // for `backup`/`diff`, which have no meaningful empty value.
    const out: Record<string, unknown> = { ok, passes, applied, skipped, unresolved, wrote, target };
    if (backup) out.backup = backup;
    if (diff) out.diff = diff;
    emitJson(out);
  } else {
    if (target === "-" && !args.dryRun) process.stdout.write(current);
    if (!args.quiet) {
      if (diff) process.stderr.write(diff);
      for (const c of changeLog) process.stderr.write(`  ${c}\n`);
      for (const s of skipped) process.stderr.write(`  skipped${s.code ? ` [${s.code}]` : ""}: ${s.reason}\n`);
      if (stopReason) process.stderr.write(`  ⚠ ${stopReason}\n`);
      if (backup) process.stderr.write(`  backup: ${backup}\n`);
      if (applied.length === 0) process.stderr.write("  (no fixes applied)\n");
      else if (args.dryRun) process.stderr.write("  (dry run — nothing written)\n");
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
 * For a room with no path back, a building with no entrance, a bath reachable only
 * through a bedroom, or a windowless bedroom, prints ready-to-paste `door`/`window`
 * statements (furniture-aware, each referencing its wall by a stable ref — an authored
 * id or a unique category — or absolute coordinates) plus a rationale.
 */
export function cmdSuggest(args: Args): number {
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
