/**
 * The analysis commands — `describe`, `validate` (incl. `--graph`/`--intent`),
 * `lint`, and `score`. Render-free: they resolve/lint the plan and report facts or
 * gate on an intent contract. Split out of the former monolithic `src/cli.ts`
 * (mechanical; behavior unchanged).
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  describe,
  lint,
  LINT_PROFILE_NAMES,
  diagnosticToJson,
  checkGraph,
  validateIntent,
  intentFromJson,
  feedbackForResult,
} from "../index.js";
import type { Diagnostic, World, Intent, IntentCheckResult, GraphCheck } from "../index.js";
// Internal (not part of the public surface): parse → link → resolve without
// rendering — validate/lint need only the diagnostics, never the SVG.
import { resolvePlan } from "../analyze.js";
import {
  type Args,
  EXIT,
  baseDirOf,
  emitDiagnosticsHuman,
  emitJson,
  ioError,
  isRecord,
  makeNodeWorld,
  usageError,
  withSource,
} from "./io.js";

export function cmdDescribe(args: Args): number {
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

export function cmdValidate(args: Args): number {
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
export function cmdScore(args: Args): number {
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

export function cmdLint(args: Args): number {
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
