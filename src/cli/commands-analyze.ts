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
  ERROR_CODES,
  diagnosticToJson,
  checkGraph,
  validateIntent,
  intentFromJson,
  feedbackForResult,
} from "../index.js";
import type {
  Diagnostic,
  World,
  Intent,
  IntentCheckResult,
  GraphCheck,
  SceneSummary,
  FreedomElement,
  FreedomReport,
} from "../index.js";
// Internal (not part of the public surface): parse → link → resolve without
// rendering — validate/lint need only the diagnostics, never the SVG.
import { resolvePlan } from "../analyze.js";
// The zero-dep levenshtein behind every "did you mean" hint the CLI prints.
import { closest } from "../expr.js";
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

// ---------------------------------------------------------------------------
// Bounded output (v1.17) — the narrowing filters behind `describe --room/--select`
// and `lint`/`validate` `--code/--severity`.
//
// These live in the CLI layer on purpose: `describe()` and `lint()` stay pure,
// whole-plan fact producers, and the narrowing is a presentation concern of the one
// consumer that has a context budget. The library is never asked to know less.
// ---------------------------------------------------------------------------

/** Split a `a,b , c` flag value into trimmed, non-empty parts. */
const csv = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** How many candidates a usage error may echo before it stops being bounded itself. */
const ECHO_CAP = 20;

/** `a, b, c, … (+N more)` — an error message that lists options must stay small. */
function echoList(items: readonly string[]): string {
  const shown = items.slice(0, ECHO_CAP);
  const more = items.length - shown.length;
  return `${shown.join(", ")}${more > 0 ? `, … (+${more} more)` : ""}`;
}

/** ` (did you mean "x"?)`, or `""` when nothing is close enough. */
function didYouMean(name: string, candidates: readonly string[]): string {
  const c = closest(name, [...candidates]);
  return c === null ? "" : ` (did you mean "${c}"?)`;
}

/**
 * The `describe --json` keys that are ALWAYS emitted, whatever `--select` names: an
 * agent must never lose the pass/fail envelope by narrowing the payload.
 */
const DESCRIBE_ENVELOPE: readonly string[] = ["ok", "plan", "units", "diagnostics"];

/**
 * Every top-level key of a {@link SceneSummary} (envelope + selectable). `--select`
 * validates against this; `test/cli-narrow.test.ts` pins it to the real key set of a
 * `describe()` result, so a new summary field cannot silently become unselectable.
 */
export const DESCRIBE_KEYS: readonly string[] = [
  ...DESCRIBE_ENVELOPE,
  "caption",
  "accTitle",
  "accDescr",
  "scale",
  "bbox",
  "rooms",
  "doors",
  "windows",
  "openings",
  "furniture",
  "access",
  "circulation",
  "totals",
  "input_graph",
  "freedom",
];

/** Tally a {@link FreedomReport} bucket without fighting the placement unions. */
const bump = (bucket: object, key: string): void => {
  const b = bucket as Record<string, number>;
  b.total = (b.total ?? 0) + 1;
  b[key] = (b[key] ?? 0) + 1;
};

/** Re-tally a {@link FreedomReport} over just the surviving elements, so a narrowed
 *  summary's counts describe what it actually lists (never the whole plan). */
function recountFreedom(elements: FreedomElement[]): FreedomReport {
  const f: FreedomReport = {
    rooms: { total: 0, absolute: 0, relational: 0, strip: 0 },
    openings: { total: 0, attached: 0, absolute: 0 },
    furniture: { total: 0, anchored: 0, againstWall: 0, absolute: 0 },
    elements,
  };
  for (const el of elements) {
    if (el.kind === "room") bump(f.rooms, el.placement);
    else if (el.kind === "furniture") bump(f.furniture, el.placement === "against-wall" ? "againstWall" : el.placement);
    else bump(f.openings, el.placement);
  }
  return f;
}

/**
 * `describe --room a,b` — keep only the named rooms and the elements that TOUCH them
 * (a door/opening whose `between` names a kept room, a window/furniture whose host room
 * is kept), plus the access/circulation/freedom rows for those elements.
 *
 * Deliberately NOT narrowed: `bbox`, `totals`, `caption` and each room's `adjacent`
 * list. Those are facts about the whole plan, and an agent reading one room still needs
 * to know the plan is 8 rooms wide and what its neighbours are called — silently
 * rewriting them to the selection would make a narrowed read lie about the building.
 * The `filtered`/`selected_rooms` markers say which lists were cut.
 */
function narrowToRooms(s: SceneSummary, ids: string[]): SceneSummary {
  const keep = new Set(ids);
  const touches = (spaces: readonly string[]): boolean => spaces.some((x) => keep.has(x));

  const rooms = s.rooms.filter((r) => keep.has(r.id));
  const doors = s.doors.filter((d) => touches(d.between));
  const windows = s.windows.filter((w) => w.room !== null && keep.has(w.room));
  const openings = s.openings.filter((o) => touches(o.between));
  // Furniture is attributed by its declared `in <room>` clause — describe() carries no
  // position for it, so a fixture with no owning room cannot be tied to a kept room.
  const furniture = s.furniture.filter((f) => f.room !== undefined && keep.has(f.room));

  // A freedom row survives iff its element did (kind+id — ids are unique per kind).
  const kept = new Set<string>([
    ...rooms.map((r) => `room:${r.id}`),
    ...doors.map((d) => `door:${d.id}`),
    ...windows.map((w) => `window:${w.id}`),
    ...openings.map((o) => `opening:${o.id}`),
    ...furniture.map((f) => `furniture:${f.id}`),
  ]);
  const connectorIds = new Set<string>([...doors.map((d) => d.id), ...openings.map((o) => o.id)]);

  return {
    ...s,
    rooms,
    doors,
    windows,
    openings,
    furniture,
    access: {
      ...s.access,
      entrances: s.access.entrances.filter((id) => connectorIds.has(id)),
      edges: s.access.edges.filter((e) => touches(e.between)),
      rooms: s.access.rooms.filter((r) => keep.has(r.id)),
    },
    circulation:
      s.circulation === null
        ? null
        : {
            ...s.circulation,
            rooms: s.circulation.rooms.filter((r) => keep.has(r.roomId)),
            routes: s.circulation.routes.filter((r) => keep.has(r.fromRoomId) || keep.has(r.toRoomId)),
          },
    input_graph: Object.fromEntries(Object.entries(s.input_graph).filter(([id]) => keep.has(id))),
    freedom: recountFreedom(s.freedom.elements.filter((el) => kept.has(`${el.kind}:${el.id}`))),
  };
}

/** `--select k1,k2` — keep the envelope plus the named keys, in the summary's own key
 *  order (so a selected object is a strict subset of the full one, never a reshuffle). */
function selectKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const want = new Set([...DESCRIBE_ENVELOPE, ...keys]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (want.has(k)) out[k] = v;
  return out;
}

export function cmdDescribe(args: Args): number {
  // Both narrowing flags are validated BEFORE any work: a typo'd room id or key is a
  // usage error (exit 3), not a silently empty result.
  const selected = args.select === undefined ? null : csv(args.select);
  if (selected) {
    for (const k of selected) {
      if (!DESCRIBE_KEYS.includes(k)) {
        return usageError(
          `unknown --select key "${k}"${didYouMean(k, DESCRIBE_KEYS)} (available: ${echoList(DESCRIBE_KEYS)})`,
        );
      }
    }
  }
  const wantRooms = args.room === undefined ? null : csv(args.room);

  return withSource(args, (source, input) => {
    const full = describe(source, { world: makeNodeWorld(baseDirOf(input)) });

    // A plan that failed to resolve has no rooms to narrow: report ITS diagnostics
    // rather than a misleading `unknown room` (the room list is empty for a reason).
    let summary = full;
    let filtered = false;
    if (wantRooms && full.ok) {
      // Unknown room id → usage error listing what the plan actually has (capped, so
      // the error stays as bounded as the output it is guarding).
      const have = full.rooms.map((r) => r.id);
      for (const id of wantRooms) {
        if (!have.includes(id)) {
          return usageError(`unknown room "${id}"${didYouMean(id, have)} (plan has ${have.length}: ${echoList(have)})`);
        }
      }
      summary = narrowToRooms(full, wantRooms);
      filtered = true;
    }

    if (args.json) {
      const base: Record<string, unknown> = {
        ...summary,
        diagnostics: summary.diagnostics.map((d) => diagnosticToJson(source, d)),
      };
      const shaped = selected ? selectKeys(base, selected) : base;
      // The markers ride OUTSIDE `--select` — a narrowed read must always be able to
      // tell that it is narrowed.
      emitJson(filtered ? { ...shaped, filtered: true, selected_rooms: wantRooms } : shaped);
    } else if (!summary.ok) {
      emitDiagnosticsHuman(source, summary.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ could not describe (plan has errors)\n");
    } else {
      const lines = [
        `${summary.plan} — ${summary.totals.rooms} room(s), ${summary.totals.floor_area_m2} m²${filtered ? ` (showing ${summary.rooms.length})` : ""}`,
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
 * A validated `--code`/`--severity` DISPLAY filter. It narrows what a caller READS,
 * never what the command DECIDES: {@link report} computes `ok` and the exit code from
 * the unfiltered diagnostic set before applying this. An agent that runs
 * `lint --code W_X` on a plan whose only problem is `E_Y` still gets exit 2.
 */
interface DiagFilter {
  codes?: Set<string>;
  severity?: "error" | "warning";
}
const filterActive = (f: DiagFilter): boolean => f.codes !== undefined || f.severity !== undefined;

const applyDiagFilter = (diags: Diagnostic[], f: DiagFilter): Diagnostic[] =>
  diags.filter(
    (d) =>
      (f.codes === undefined || (d.code !== undefined && f.codes.has(d.code))) &&
      (f.severity === undefined || d.severity === f.severity),
  );

/** Parse + validate `--code`/`--severity`, or return the emitted usage exit code. */
function parseDiagFilter(args: Args): DiagFilter | CheckError {
  const f: DiagFilter = {};
  if (args.code !== undefined) {
    const codes = csv(args.code).map((c) => c.toUpperCase());
    for (const c of codes) {
      if (!ERROR_CODES.includes(c)) {
        return {
          exit: usageError(
            `unknown diagnostic code "${c}"${didYouMean(c, ERROR_CODES)} — see \`arch explain <CODE>\` or \`arch manifest --json\` for all ${ERROR_CODES.length}`,
          ),
        };
      }
    }
    f.codes = new Set(codes);
  }
  if (args.severity !== undefined) {
    if (args.severity !== "error" && args.severity !== "warning") {
      return { exit: usageError(`unknown --severity "${args.severity}" (available: error, warning)`) };
    }
    f.severity = args.severity;
  }
  return f;
}

/**
 * Shared reporter for `validate` and `lint`: emit diagnostics, pick exit code.
 * `--strict` (alias `--fail-on-warning`) makes advisory warnings count toward failure
 * too — the gate a generator pipeline runs so it can't ship a plan that lint flagged.
 *
 * `filter` narrows only what is PRINTED. `e`/`w`/`ok` are computed from `diags` — the
 * unfiltered set — so a display filter can never turn a failing plan into exit 0.
 */
function report(source: string, diags: Diagnostic[], args: Args, filter: DiagFilter = {}): number {
  const e = diags.filter((d) => d.severity === "error").length;
  const w = diags.length - e;
  const ok = e === 0 && (!args.strict || w === 0);

  const active = filterActive(filter);
  const shown = active ? applyDiagFilter(diags, filter) : diags;

  if (args.json) {
    emitJson({
      ok,
      strict: args.strict ?? false,
      ...(active ? { filtered: true, total_diagnostics: diags.length } : {}),
      diagnostics: shown.map((d) => diagnosticToJson(source, d)),
    });
  } else {
    emitDiagnosticsHuman(source, shown, args.quiet);
    if (!args.quiet) {
      if (active) process.stderr.write(`  (display filter: showing ${shown.length} of ${diags.length} diagnostics)\n`);
      if (ok) process.stdout.write(`✓ ok${w ? ` (${w} warning${w === 1 ? "" : "s"})` : ""}\n`);
      else if (e === 0) process.stdout.write(`✗ ${w} warning${w === 1 ? "" : "s"} (--strict)\n`);
      else process.stdout.write(`✗ ${e} error${e === 1 ? "" : "s"}, ${w} warning${w === 1 ? "" : "s"}\n`);
    }
  }
  return ok ? EXIT.OK : EXIT.USER;
}

export function cmdValidate(args: Args): number {
  const filter = parseDiagFilter(args);
  if (isCheckError(filter)) return filter.exit;
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
    if (args.graph !== undefined || args.intent !== undefined)
      return reportWithChecks(source, diags, args, world, filter);
    return report(source, diags, args, filter);
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
 *
 * `filter` is the same DISPLAY-only narrowing {@link report} applies: the diagnostic
 * counts that feed `ok` and the exit code are taken from the unfiltered `diags`.
 */
function reportWithChecks(
  source: string,
  diags: Diagnostic[],
  args: Args,
  world: World,
  filter: DiagFilter = {},
): number {
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

  const active = filterActive(filter);
  const shown = active ? applyDiagFilter(diags, filter) : diags;

  if (args.json) {
    const o: Record<string, unknown> = {
      ok,
      strict: args.strict ?? false,
      ...(active ? { filtered: true, total_diagnostics: diags.length } : {}),
      diagnostics: shown.map((d) => diagnosticToJson(source, d)),
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
    emitDiagnosticsHuman(source, shown, args.quiet);
    if (!args.quiet) {
      if (active) process.stderr.write(`  (display filter: showing ${shown.length} of ${diags.length} diagnostics)\n`);
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
  // An unknown profile is a bad-usage error like every other one: `error: …` on stderr,
  // exit 3, with a did-you-mean and the real profile names from LINT_PROFILE_NAMES (this
  // path used to hand-roll its own message and a bare `return 3`).
  if (args.profile !== undefined && !LINT_PROFILE_NAMES.includes(args.profile)) {
    return usageError(
      `unknown lint profile "${args.profile}"${didYouMean(args.profile, LINT_PROFILE_NAMES)} (available: ${echoList(LINT_PROFILE_NAMES)})`,
    );
  }
  const filter = parseDiagFilter(args);
  if (isCheckError(filter)) return filter.exit;
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    // Surface fatal errors too (lint() is silent on an unresolvable plan).
    // Render-free: resolvePlan carries every diagnostic compile() would.
    const { diagnostics } = resolvePlan(source, { world });
    const errs = diagnostics.filter((d) => d.severity === "error");
    return report(source, errs.length ? errs : lint(source, { world, profile: args.profile }), args, filter);
  });
}
