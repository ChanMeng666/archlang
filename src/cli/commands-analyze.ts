/**
 * The analysis commands — `describe`, `validate` (incl. `--graph`/`--intent`),
 * `lint`, and `score`. Render-free: they resolve/lint the plan and report facts or
 * gate on an intent contract. Split out of the former monolithic `src/cli.ts`
 * (mechanical; behavior unchanged).
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fmt2 } from "../num-format.js";
import {
  describe,
  describeLevel,
  DESCRIBE_FACTS,
  lint,
  lintWithCoverage,
  LINT_PROFILE_NAMES,
  ERROR_CODES,
  diagnosticToJson,
  checkGraph,
  validateIntent,
  intentFromJson,
  feedbackForResult,
  impact,
  applyLetOverride,
  taste,
  TASTE_PROFILE_NAMES,
  nextDiagnostic,
  offsetToLineCol,
  parseLockList,
} from "../index.js";
import type {
  LockSpan,
  DescribeFact,
  LayerSymmetry,
  Diagnostic,
  World,
  Intent,
  IntentCheckResult,
  GraphCheck,
  SceneSummary,
  FreedomElement,
  FreedomReport,
  LintCoverage,
  TasteReport,
  NextInput,
  NextItem,
} from "../index.js";
import { keepResultsOf } from "../ir.js";
import { MAX_WASTE_PCT } from "../describe.js";
import type { QuantityFacts } from "../index.js";
import { diagnosticsSummary, validateSummary } from "./summary.js";
import { type KeepResult, keepValidateRow } from "../keep.js";
import {
  AUTHORING_STAGES,
  type AuthoringStage,
  atStage,
  diagnosticStage,
  isAuthoringStage,
  type KindOf,
  kindsOf,
  predicateStage,
} from "../stages.js";
// Internal (not part of the public surface): parse → link → resolve without
// rendering — validate/lint need only the diagnostics, never the SVG.
import { resolvePlan } from "../analyze.js";
// The one human line of the lint coverage report (internal: only `lint` prints it).
import { coverageLine } from "../lint/coverage.js";
// The zero-dep levenshtein behind every "did you mean" hint the CLI prints.
import { closest } from "../expr.js";
import { CLI_NAME } from "../manifest.js";
import {
  type Args,
  EXIT,
  baseDirOf,
  emitDiagnosticsHuman,
  emitJson,
  ioError,
  isRecord,
  makeNodeWorld,
  readInput,
  usageError,
  usageErrorFor,
  withSource,
} from "./io.js";

// ---------------------------------------------------------------------------
// Bounded output — the narrowing filters behind `describe --room/--select`
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
  "sheet",
  "bbox",
  "bbox_outer",
  "axes",
  "site",
  "instances",
  "rooms",
  "doors",
  "windows",
  "openings",
  "furniture",
  "verticals",
  "voids",
  // `walls from rooms` (ADR 0028 §6): present only on a storey that derived a wall.
  "derived_walls",
  // The vertical datum. Conditional like `voids` — present only when the plan
  // authored a height clause — and therefore exactly the shape that let `voids` ship
  // UNSELECTABLE with the drift test green, so the set-equality fixture below now writes a
  // `height` (see `test/cli-narrow.test.ts`).
  //
  // It is NOT in `PER_STOREY_OPTIONAL_KEYS`: the gate is whole-PLAN, so when the block
  // exists it exists on every storey and a `--level N` spread always overwrites it with
  // that storey's own numbers. There is never a stale one left standing.
  "heights",
  "access",
  "circulation",
  "totals",
  "input_graph",
  "freedom",
  "schedule",
  "zones",
  "levels",
  "vertical",
  // Opt-in: present only under `--facts`, so selectable only alongside it.
  "symmetry",
  "syntax",
  "depends",
  "clearances",
  "quantities",
];

/** Why a `--waste` value is refused, or `null` when it is a percentage `describe()` takes. */
function wasteError(w: number): string | null {
  return Number.isFinite(w) && w >= 0 && w <= MAX_WASTE_PCT
    ? null
    : `--waste takes a percentage from 0 to ${MAX_WASTE_PCT} (e.g. --waste 10)`;
}

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
 * Deliberately NOT narrowed: `bbox`/`bbox_outer`, `totals`, `caption` and each room's `adjacent`
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

/**
 * `describe --zone west,east` — read one wing/department of a zoned plan.
 *
 * A zone is a DECLARED grouping with no geometry of its own, so this is defined entirely
 * in terms of the rooms the zone lists (nested zones roll up — see `ZoneSummary`): it
 * resolves the selection to member room ids and then narrows exactly as `--room` does, so
 * the two filters can never disagree about what "the elements touching these rooms" means.
 * `zones` itself narrows to the selected zones and anything nested inside them.
 *
 * A DISPLAY filter like every other: `ok`, `diagnostics` and the exit code still come from
 * the whole plan.
 */
function narrowToZones(s: SceneSummary, paths: string[]): SceneSummary {
  const want = new Set(paths);
  const inSelection = (p: string): boolean => want.has(p) || paths.some((sel) => p.startsWith(`${sel}.`));
  const roomIds = [...new Set((s.zones ?? []).filter((z) => want.has(z.path)).flatMap((z) => z.rooms))];
  return { ...narrowToRooms(s, roomIds), zones: (s.zones ?? []).filter((z) => inSelection(z.path)) };
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
  const wantZones = args.zone === undefined ? null : csv(args.zone);
  // `--facts` names opt-in derived facts; like `--select`, an unknown name is a usage error.
  const facts = args.facts === undefined ? [] : csv(args.facts);
  for (const f of facts) {
    if (!(DESCRIBE_FACTS as readonly string[]).includes(f)) {
      return usageError(
        `unknown --facts name "${f}"${didYouMean(f, DESCRIBE_FACTS)} (available: ${echoList(DESCRIBE_FACTS)})`,
      );
    }
  }
  // An opt-in fact is absent unless computed, so selecting one without asking for it would
  // silently print nothing — a usage error with the fix, rather than an empty answer.
  for (const k of selected ?? []) {
    if ((DESCRIBE_FACTS as readonly string[]).includes(k) && !facts.includes(k)) {
      return usageError(`--select ${k} needs the fact computed: add --facts ${k}`);
    }
  }
  // `--waste` feeds the quantities fact alone; asked for without it, it would silently do nothing.
  if (args.waste !== undefined) {
    if (!facts.includes("quantities")) return usageError("--waste needs the quantities fact: add --facts quantities");
    const bad = wasteError(args.waste);
    if (bad) return usageError(bad);
  }

  return withSource(args, (source, input) => {
    const full = describe(source, {
      world: makeNodeWorld(baseDirOf(input)),
      ...(facts.length > 0 ? { facts: facts as DescribeFact[] } : {}),
      ...(args.waste !== undefined ? { wastePct: args.waste } : {}),
    });

    // A plan that failed to resolve has no rooms to narrow: report ITS diagnostics
    // rather than a misleading `unknown room` (the room list is empty for a reason).
    let summary = full;
    let filtered = false;
    // `--level` is applied FIRST: it picks which storey the rest of the read is about, so a
    // following `--room` narrows within that storey rather than across floors.
    if (args.level !== undefined && full.ok) {
      const have = (full.levels ?? []).map((l) => l.level);
      if (!have.includes(args.level)) {
        return usageError(
          have.length === 0
            ? `--level ${args.level} was given but this plan declares no \`level\` blocks (it is single-storey) — drop --level`
            : `unknown --level ${args.level} (plan has ${echoList(have.map(String))})`,
        );
      }
      summary = describeLevel(full, args.level);
      filtered = true;
    }
    // `--zone` sits between `--level` and `--room`: it picks the wing, `--room` may then
    // pick rooms within it.
    if (wantZones && summary.ok) {
      const have = (summary.zones ?? []).map((z) => z.path);
      for (const p of wantZones) {
        if (!have.includes(p)) {
          return usageError(
            have.length === 0
              ? `--zone ${p} was given but this plan declares no \`zone\` blocks — drop --zone`
              : `unknown zone "${p}"${didYouMean(p, have)} (plan has ${have.length}: ${echoList(have)})`,
          );
        }
      }
      summary = narrowToZones(summary, wantZones);
      filtered = true;
    }
    if (wantRooms && summary.ok) {
      // Unknown room id → usage error listing what the plan actually has (capped, so
      // the error stays as bounded as the output it is guarding). "What it has" is the
      // storey in view, so `--level 2 --room bed1` reports level 2's rooms.
      const have = summary.rooms.map((r) => r.id);
      for (const id of wantRooms) {
        if (!have.includes(id)) {
          return usageError(`unknown room "${id}"${didYouMean(id, have)} (plan has ${have.length}: ${echoList(have)})`);
        }
      }
      summary = narrowToRooms(summary, wantRooms);
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
      emitJson(
        filtered
          ? {
              ...shaped,
              filtered: true,
              ...(wantZones ? { selected_zones: wantZones } : {}),
              ...(wantRooms ? { selected_rooms: wantRooms } : {}),
              ...(args.level !== undefined ? { selected_level: args.level } : {}),
            }
          : shaped,
      );
    } else if (!summary.ok) {
      emitDiagnosticsHuman(source, summary.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ could not describe (plan has errors)\n");
    } else {
      const storey = args.level !== undefined ? ` [level ${args.level}]` : "";
      const lines = [
        `${summary.plan}${storey} — ${summary.totals.rooms} room(s), ${summary.totals.floor_area_m2} m²${filtered ? ` (showing ${summary.rooms.length})` : ""}`,
        ...summary.rooms.map(
          (r) =>
            `  ${r.id}${r.label ? ` "${r.label}"` : ""}: ${r.area_m2} m²${r.adjacent.length ? ` — adj: ${r.adjacent.join(", ")}` : ""}`,
        ),
        ...factLines(summary),
      ];
      process.stdout.write(lines.join("\n") + "\n");
    }
    return summary.ok ? EXIT.OK : EXIT.USER;
  });
}

/** One compact human line per requested opt-in fact (`--facts` without `--json`). */
function factLines(s: SceneSummary): string[] {
  const out: string[] = [];
  if (s.symmetry) {
    const g = (l: LayerSymmetry | null): string =>
      l === null ? "—" : `${l.group}${l.axis ? ` ${l.axis}` : ""}${l.axes ? ` ${l.axes.join("/")}` : ""}`;
    const { shell, rooms, full } = s.symmetry.layers;
    out.push(`symmetry: shell ${g(shell)} · rooms ${g(rooms)} · full ${g(full)}; repeats ${s.symmetry.repeats.length}`);
  }
  if (s.syntax) out.push(`syntax: k=${s.syntax.k} cycleRank=${s.syntax.cycleRank}`);
  if (s.depends) {
    const linked = s.depends.elements.filter(
      (e) => e.on.length > 0 || e.params.length > 0 || e.axes.length > 0 || e.hostWallId !== undefined,
    ).length;
    out.push(
      `depends: ${linked} of ${s.depends.elements.length} element(s) depend on another id, a name, an axis or a host wall; ${s.depends.derived_walls.length} derived wall(s) (--json for the lists)`,
    );
  }
  if (s.clearances) {
    const c = s.clearances;
    out.push(
      `clearances: ${c.wcs.length} WC(s), ${c.tall_units.length} tall unit(s), ${c.hobs.length} hob(s), ${c.doorways.length} doorway(s), ${c.stairs === null ? "stairs not measured (budget)" : `${c.stairs.length} stair(s)`} measured (--json for the figures)`,
    );
  }
  if (s.quantities) {
    const q = s.quantities;
    const centre = q.walls.reduce((n, w) => n + w.length_centreline_mm, 0);
    out.push(
      `quantities: ${q.walls.length} wall categor${q.walls.length === 1 ? "y" : "ies"}, ${fmt2(centre)} mm of wall centreline, ${q.rooms.length} room(s), ${q.doors.reduce((n, d) => n + d.count, 0)} door(s), ${q.windows.reduce((n, w) => n + w.count, 0)} window(s) (--json or \`${CLI_NAME} takeoff\` for the figures)`,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// `takeoff` — the quantities block as a table (preview-and-remodel B4, D9).
// ---------------------------------------------------------------------------

/** The formats `takeoff --format` writes. */
const TAKEOFF_FORMATS = ["csv", "md"] as const;

/** One figure of a takeoff: the long form both formats are written from. */
interface TakeoffRow {
  level: number | undefined;
  section: "walls" | "rooms" | "floor" | "doors" | "windows";
  item: string;
  width_mm?: number;
  field: string;
  value: number | string;
}

/** Every figure of one storey's block, in the block's own order and with its own field names. */
function takeoffRows(q: QuantityFacts, level: number | undefined): TakeoffRow[] {
  const rows: TakeoffRow[] = [];
  const add = (section: TakeoffRow["section"], item: string, obj: object, skip: readonly string[], width?: number) => {
    for (const [field, value] of Object.entries(obj)) {
      if (skip.includes(field) || (typeof value !== "number" && typeof value !== "string")) continue;
      rows.push({ level, section, item, ...(width !== undefined ? { width_mm: width } : {}), field, value });
    }
  };
  for (const w of q.walls) add("walls", w.category, w, ["category"]);
  if (q.faces_omitted) add("walls", "*", { faces_omitted: q.faces_omitted }, []);
  for (const r of q.rooms) add("rooms", r.id, r, ["id"]);
  const { floor_area_net_m2, waste_pct, floor_area_with_waste_m2 } = q;
  add("floor", "storey", { floor_area_net_m2, waste_pct, floor_area_with_waste_m2 }, []);
  for (const d of q.doors) add("doors", d.kind, { count: d.count }, [], d.width_mm);
  for (const w of q.windows) add("windows", "window", { count: w.count }, [], w.width_mm);
  return rows;
}

const cell = (v: number | string | undefined): string => (v === undefined ? "" : typeof v === "number" ? fmt2(v) : v);

/** RFC 4180: quote a field holding a comma, a quote or a line break. */
const csvField = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function takeoffCsv(rows: readonly TakeoffRow[]): string {
  const lines = ["level,section,item,width_mm,field,value"];
  for (const r of rows)
    lines.push(
      [cell(r.level), r.section, r.item, cell(r.width_mm), r.field, cell(r.value)].map((s) => csvField(s)).join(","),
    );
  return `${lines.join("\n")}\n`;
}

/** A Markdown table: the header row from `cols`, one row per object, `|` escaped. */
function mdTable(cols: readonly string[], rows: ReadonlyArray<Record<string, number | string | undefined>>): string[] {
  const esc = (s: string): string => s.replace(/\|/g, "\\|");
  return [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${cols.map((c) => esc(cell(r[c]))).join(" | ")} |`),
  ];
}

/** The columns a list of rows carries, in first-seen order (an absent figure is no column). */
const columnsOf = (rows: readonly object[]): string[] => [...new Set(rows.flatMap((r) => Object.keys(r)))];

function takeoffMd(plan: string, storeys: ReadonlyArray<{ title?: string; q: QuantityFacts }>): string {
  const out = [
    `# Takeoff: ${plan}`,
    "",
    "Geometric quantities measured from the plan; each column's convention is in its name.",
  ];
  for (const { title, q } of storeys) {
    const h = title ? `## ${title}: ` : "## ";
    out.push("", `${h}walls`, "", ...mdTable(columnsOf(q.walls), q.walls as unknown as Record<string, number>[]));
    if (q.faces_omitted) out.push("", `Face lengths omitted: ${q.faces_omitted}.`);
    out.push("", `${h}rooms`, "", ...mdTable(columnsOf(q.rooms), q.rooms as unknown as Record<string, number>[]));
    const floor = {
      floor_area_net_m2: q.floor_area_net_m2,
      ...(q.waste_pct !== undefined ? { waste_pct: q.waste_pct } : {}),
      ...(q.floor_area_with_waste_m2 !== undefined ? { floor_area_with_waste_m2: q.floor_area_with_waste_m2 } : {}),
    };
    out.push("", `${h}floor`, "", ...mdTable(Object.keys(floor), [floor]));
    out.push(
      "",
      `${h}doors`,
      "",
      ...mdTable(["kind", "width_mm", "count"], q.doors as unknown as Record<string, number>[]),
    );
    out.push(
      "",
      `${h}windows`,
      "",
      ...mdTable(["width_mm", "count"], q.windows as unknown as Record<string, number>[]),
    );
  }
  return `${out.join("\n")}\n`;
}

export function cmdTakeoff(args: Args): number {
  const format = args.format ?? "md";
  if (args.json && args.format !== undefined)
    return usageErrorFor("takeoff", "--json writes the quantities as JSON; --format picks a table — give one of them");
  if (!(TAKEOFF_FORMATS as readonly string[]).includes(format))
    return usageErrorFor(
      "takeoff",
      `unknown --format "${format}"${didYouMean(format, TAKEOFF_FORMATS)} (available: ${TAKEOFF_FORMATS.join(", ")})`,
    );
  if (args.waste !== undefined) {
    const bad = wasteError(args.waste);
    if (bad) return usageErrorFor("takeoff", bad);
  }
  return withSource(args, (source, input) => {
    const s = describe(source, {
      world: makeNodeWorld(baseDirOf(input)),
      facts: ["quantities"],
      ...(args.waste !== undefined ? { wastePct: args.waste } : {}),
    });
    if (!s.ok || !s.quantities) {
      if (args.json)
        emitJson({ ok: false, plan: s.plan, diagnostics: s.diagnostics.map((d) => diagnosticToJson(source, d)) });
      else {
        emitDiagnosticsHuman(source, s.diagnostics, args.quiet);
        if (!args.quiet) process.stderr.write("✗ could not take off (plan has errors)\n");
      }
      return EXIT.USER;
    }
    // A multi-storey plan is taken off storey by storey; the top-level block repeats the lowest.
    const storeys = s.levels
      ? s.levels.map((l) => ({ level: l.level, name: l.name, q: l.quantities! }))
      : [{ level: undefined, name: undefined, q: s.quantities }];
    if (args.json) {
      emitJson({
        ok: true,
        plan: s.plan,
        units: s.units,
        quantities: s.quantities,
        ...(s.levels
          ? {
              levels: storeys.map((st) => ({
                level: st.level,
                ...(st.name !== undefined ? { name: st.name } : {}),
                quantities: st.q,
              })),
            }
          : {}),
        diagnostics: s.diagnostics.map((d) => diagnosticToJson(source, d)),
      });
    } else if (format === "csv") {
      process.stdout.write(takeoffCsv(storeys.flatMap((st) => takeoffRows(st.q, st.level))));
    } else {
      process.stdout.write(
        takeoffMd(
          s.plan,
          storeys.map((st) => ({
            ...(st.level !== undefined ? { title: `Level ${st.level}${st.name ? ` (${st.name})` : ""}` } : {}),
            q: st.q,
          })),
        ),
      );
    }
    return EXIT.OK;
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
            `unknown diagnostic code "${c}"${didYouMean(c, ERROR_CODES)} — see \`${CLI_NAME} explain <CODE>\` or \`${CLI_NAME} manifest --json\` for all ${ERROR_CODES.length}`,
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
 *
 * `coverage` (only `lint` passes it, and only when the rules ran) is APPENDED: a `coverage`
 * key after `diagnostics` in JSON, and in human mode one line on stderr when something was
 * skipped, nothing otherwise. Every byte before it is what it was without it.
 */
function report(
  source: string,
  diags: Diagnostic[],
  args: Args,
  filter: DiagFilter = {},
  coverage?: LintCoverage,
  next?: NextItem | null,
  keeps?: readonly KeepResult[],
  staged?: Staged,
): number {
  const e = diags.filter((d) => d.severity === "error").length;
  const w = diags.length - e;
  const ok = e === 0 && (!args.strict || w === 0);

  const active = filterActive(filter);
  const shown = active ? applyDiagFilter(diags, filter) : diags;
  // PS7.6: the count and the codes, of the whole set like `ok`. A function of the diagnostics
  // alone, so `validate`'s `next` stays purely additive (test/cli-validate-next.test.ts).
  const summary = stagedSummary(diagnosticsSummary(diags), staged);

  if (args.json) {
    emitJson({
      // First, so a reader who cuts the output short still sees the count and the codes.
      summary,
      ok,
      strict: args.strict ?? false,
      ...(active ? { filtered: true, total_diagnostics: diags.length } : {}),
      diagnostics: shown.map((d) => withStage(diagnosticToJson(source, d), staged?.stageOf(d))),
      ...(coverage ? { coverage } : {}),
      // PS7.1: only under `--stage`, before `keeps` and `next`.
      ...(staged?.at ? { at_stage: atStageJson(staged.at) } : {}),
      // ADR 0033: the plan's keeps, only when it declares one, before `next`.
      ...(keeps ? { keeps: keeps.map(keepValidateRow) } : {}),
      // `validate` only (PS5.3): appended LAST, so every byte before it is what it was.
      ...(next !== undefined ? { next } : {}),
    });
  } else {
    // PS7.6: the first line of the report, only when there is something to count. The filter
    // note sits under it too, so the line cannot be read as describing the shown set.
    if ((diags.length || staged?.at) && !args.quiet) {
      const shownNote = active ? `  (display filter: showing ${shown.length} of ${diags.length} diagnostics)\n` : "";
      process.stderr.write(`${summary}\n${shownNote}\n`);
    }
    emitDiagnosticsHuman(source, shown, args.quiet);
    if (!args.quiet) {
      if (active) process.stderr.write(`  (display filter: showing ${shown.length} of ${diags.length} diagnostics)\n`);
      const skipped = coverage ? coverageLine(coverage) : null;
      if (skipped) process.stderr.write(`  ${skipped}\n`);
      if (next) process.stderr.write(`${nextLine(source, next)}\n`);
      if (staged?.at) process.stderr.write(`${stageLine(staged.at)}\n`);
      if (ok) process.stdout.write(`✓ ok${w ? ` (${w} warning${w === 1 ? "" : "s"})` : ""}\n`);
      else if (e === 0) process.stdout.write(`✗ ${w} warning${w === 1 ? "" : "s"} (--strict)\n`);
      else process.stdout.write(`✗ ${e} error${e === 1 ? "" : "s"}, ${w} warning${w === 1 ? "" : "s"}\n`);
    }
  }
  return ok ? EXIT.OK : EXIT.USER;
}

/**
 * What `validate` knows about stages (PS7.1). `stageOf` is always there on `validate`, so every
 * JSON diagnostic carries its `stage`; `at` only under `--stage`.
 */
interface Staged {
  stageOf: (d: Diagnostic) => AuthoringStage;
  /** `intent`: with `--intent`, the assertions of this stage or an earlier one (satisfied/total). */
  at?: { stage: AuthoringStage; held: number; clean: boolean; intent?: { satisfied: number; total: number } };
}

/** A JSON object with its `stage` appended last (additive: every key before it is as it was). */
function withStage<T extends object>(j: T, stage: AuthoringStage | undefined): T {
  return stage === undefined ? j : { ...j, stage };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The summary under `--stage`: the stage first, the held-back count last; unchanged without it. */
function stagedSummary(line: string, staged: Staged | undefined): string {
  const at = staged?.at;
  if (!at) return line;
  const held = at.held ? ` (${plural(at.held, "later-stage finding")} held back)` : "";
  return `stage ${at.stage}: ${line}${held}`;
}

const atStageJson = (at: NonNullable<Staged["at"]>): Record<string, unknown> => ({
  stage: at.stage,
  held_back: at.held,
  clean: at.clean,
  ...(at.intent ? { intent: at.intent } : {}),
});

/** The human stage line (stderr): whether the stage is clean, and where to go next. */
function stageLine(at: NonNullable<Staged["at"]>): string {
  const after = AUTHORING_STAGES[AUTHORING_STAGES.indexOf(at.stage) + 1];
  const held = at.held ? `; ${plural(at.held, "later-stage finding")} held back` : "";
  if (!at.clean) return `  (stage ${at.stage}: fix what it shows before advancing${held})`;
  return after === undefined
    ? `  (stage ${at.stage} is clean, and it is the last)`
    : `  (stage ${at.stage} is clean: advance to --stage ${after}${held})`;
}

/** A stage is clean when no tier of `next` but taste has an item left (taste never gates). */
function isClean(input: NextInput): boolean {
  const { taste: _taste, ...rest } = input;
  return nextDiagnostic(rest) === null;
}

/**
 * The human `next:` line (PS5.3), for stderr: tier, code, where, and what is wrong, then the
 * hint on a second, indented `= help:` line when there is one.
 */
function nextLine(source: string, n: NextItem): string {
  let where = "";
  if (n.file !== undefined) where = ` in ${n.file}`;
  else if (n.span) {
    const { line, col } = offsetToLineCol(source, n.span[0]);
    where = ` at ${line}:${col}`;
  }
  const head = `next (${n.tier}): ${n.code === null ? "" : `${n.code}${where}: `}${n.message}`;
  return n.hint ? `${head}\n  = help: ${n.hint}` : head;
}

export function cmdValidate(args: Args): number {
  // Unknown profile names are bad usage (exit 3) before any work, as on `lint` and `score`.
  if (args.profile !== undefined && !LINT_PROFILE_NAMES.includes(args.profile)) {
    return usageError(
      `unknown lint profile "${args.profile}"${didYouMean(args.profile, LINT_PROFILE_NAMES)} (available: ${echoList(LINT_PROFILE_NAMES)})`,
    );
  }
  if (args.taste !== undefined && !TASTE_PROFILE_NAMES.includes(args.taste)) {
    return usageError(
      `unknown taste profile "${args.taste}"${didYouMean(args.taste, TASTE_PROFILE_NAMES)} (available: ${echoList(TASTE_PROFILE_NAMES)})`,
    );
  }
  // `--stage` with no value parses to no value at all: refused, never read as "no stage".
  if (Object.hasOwn(args, "stage") && (args.stage === undefined || args.stage === "")) {
    return usageError(`--stage needs a value: ${echoList(AUTHORING_STAGES)}`);
  }
  if (args.stage !== undefined && !isAuthoringStage(args.stage)) {
    return usageError(
      `unknown stage "${args.stage}"${didYouMean(args.stage, AUTHORING_STAGES)} (available: ${echoList(AUTHORING_STAGES)})`,
    );
  }
  const stage = args.stage as AuthoringStage | undefined;
  const filter = parseDiagFilter(args);
  if (isCheckError(filter)) return filter.exit;
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    // resolvePlan yields exactly compile()'s diagnostics (toScene/renderSvg never
    // emit any) without paying for the render; lint() then reuses the warm
    // parse/resolve stage memos, so the whole command resolves once, renders never.
    const { diagnostics, ir, levels } = resolvePlan(source, { world });
    // ADR 0033: the plan's keeps, measured by the same resolve (absent when it declares none).
    const keeps = ir ? keepResultsOf(ir, levels) : undefined;
    const lintDiags = lint(source, { world });
    // `--profile` lints under the named advisory ruleset too, and its warnings are the ones
    // reported (as `lint --profile` reports them); the default run still ranks `next`.
    const profileLint = args.profile !== undefined ? lint(source, { world, profile: args.profile }) : undefined;
    const diags = [...diagnostics, ...(profileLint ?? lintDiags)];
    // `--taste` feeds `next` its last tier only; a plan with compile errors is never scored.
    const tasteReport =
      args.taste !== undefined && !diagnostics.some((d) => d.severity === "error")
        ? taste(source, { profile: args.taste, world })
        : undefined;
    const nextInput: NextInput = {
      diagnostics,
      lint: lintDiags,
      ...(keeps ? { keeps } : {}),
      ...(profileLint ? { profileLint } : {}),
      ...(tasteReport ? { taste: tasteReport } : {}),
    };
    // `--graph` and/or `--intent` layer an intent check onto plain validate; both
    // blocks may appear in one call, and either failing gates the exit code. Plain
    // validate (neither flag) is `report`, byte-identical to before but for `next`.
    // PS7.1: every diagnostic's stage, read off its code (a broken hard keep off its measure).
    const kindOf = kindsOf(levels.length > 0 ? levels.map((l) => l.ir) : ir ? [ir] : []);
    const stageOf = (d: Diagnostic): AuthoringStage => diagnosticStage(d, keeps, kindOf);
    if (args.graph !== undefined || args.intent !== undefined)
      return reportWithChecks(source, diags, args, world, filter, nextInput, keeps, { stage, stageOf, kindOf });
    if (stage === undefined)
      return report(source, diags, args, filter, undefined, nextDiagnostic(nextInput), keeps, { stageOf });
    // `--stage`: the report, `next` and `ok` read the stage's view; errors always stay.
    const view = atStage(stage, diags, nextInput, kindOf);
    const at = { stage, held: view.held, clean: isClean(view.input) };
    return report(source, view.diagnostics, args, filter, undefined, nextDiagnostic(view.input), keeps, {
      stageOf,
      at,
    });
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

/** The brief-bound measure rows (PS4.4), present on the intent block only when the intent
 *  asserts one, so every other `--json` payload is byte-identical. */
const measuresJson = (r: IntentCheckResult): Record<string, unknown> => (r.measures ? { measures: r.measures } : {});

/** One human line per brief-bound measure: what, the value, the residual, the verdict. */
function measureLine(m: NonNullable<IntentCheckResult["measures"]>[number]): string {
  const unit = m.unit === "m2" ? " m²" : " mm";
  const sign = (n: number): string => (n > 0 ? `+${fmt2(n)}` : n < 0 ? `−${fmt2(-n)}` : "0");
  const body =
    m.measured && m.residual
      ? `${m.measured.map(fmt2).join(" × ")}${unit}${m.turned ? " (turned)" : ""}, residual ${m.residual.map(sign).join(" × ")}${unit}`
      : `unmeasured (${m.level !== undefined ? `level ${m.level}: ` : ""}${m.reason})`;
  return `  measure ${m.path}: ${m.what} ${body} · ${m.pass ? "ok" : "miss"}\n`;
}

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
  filter: DiagFilter,
  nextInput: NextInput,
  keeps: readonly KeepResult[] | undefined,
  stages: { stage?: AuthoringStage; stageOf: (d: Diagnostic) => AuthoringStage; kindOf: KindOf },
): number {
  const loaded = args.graph !== undefined ? loadGraphCheck(source, args.graph, args, world) : undefined;
  if (isCheckError(loaded)) return loaded.exit;
  let graph: GraphCheck | undefined = loaded;

  let intentResult: IntentCheckResult | undefined;
  if (args.intent !== undefined) {
    const it = loadIntent(args.intent, "--intent", args);
    if (isCheckError(it)) return it.exit;
    intentResult = validateIntent(source, it, { world });
  }

  // PS7.1 `--stage`: the stage's view of everything measured; errors always stay. A `--graph`
  // check reads the door graph, so before `openings` its block is held back with the rest.
  let at: Staged["at"];
  if (stages.stage !== undefined) {
    const view = atStage(
      stages.stage,
      diags,
      { ...nextInput, ...(intentResult ? { intent: intentResult } : {}), ...(graph ? { graph } : {}) },
      stages.kindOf,
    );
    diags = view.diagnostics;
    nextInput = view.input;
    intentResult = view.input.intent;
    graph = view.input.graph;
    at = {
      stage: stages.stage,
      held: view.held,
      clean: isClean(view.input),
      ...(view.intent ? { intent: view.intent } : {}),
    };
  }
  const feedback = intentResult && args.feedback ? feedbackForResult(intentResult) : undefined;

  const e = diags.filter((d) => d.severity === "error").length;
  const w = diags.length - e;
  const diagsOk = e === 0 && (!args.strict || w === 0);
  const graphOk = graph ? graph.ok : true;
  const intentOk = intentResult ? intentResult.ok : true;
  const ok = diagsOk && graphOk && intentOk;

  const active = filterActive(filter);
  const shown = active ? applyDiagFilter(diags, filter) : diags;
  // Weighs everything, like `ok`: a display filter never changes what comes next.
  const next = nextDiagnostic({
    ...nextInput,
    ...(intentResult ? { intent: intentResult } : {}),
    ...(graph ? { graph } : {}),
  });

  const summary = stagedSummary(validateSummary(diags, ok), { stageOf: stages.stageOf, at });

  if (args.json) {
    const o: Record<string, unknown> = {
      summary,
      ok,
      strict: args.strict ?? false,
      ...(active ? { filtered: true, total_diagnostics: diags.length } : {}),
      diagnostics: shown.map((d) => withStage(diagnosticToJson(source, d), stages.stageOf(d))),
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
        violations: intentResult.violations.map((v) => withStage(violationJson(v), predicateStage(v.predicate))),
        ...measuresJson(intentResult),
      };
      if (feedback) block.feedback = feedback;
      o.intent = block;
    }
    if (at) o.at_stage = atStageJson(at);
    if (keeps) o.keeps = keeps.map(keepValidateRow);
    // PS5.3: appended LAST, so every byte before it is what it was.
    o.next = next;
    emitJson(o);
  } else {
    // As in `report`: under `--stage` the summary line is always printed, so the stage is said.
    if ((diags.length || at) && !args.quiet) {
      const shownNote = active ? `  (display filter: showing ${shown.length} of ${diags.length} diagnostics)\n` : "";
      process.stderr.write(`${summary}\n${shownNote}\n`);
    }
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
        for (const m of intentResult.measures ?? []) process.stderr.write(measureLine(m));
        for (const v of intentResult.violations) process.stderr.write(`  ${v.code}: ${v.message}\n`);
        if (feedback) for (const f of feedback) process.stderr.write(`  ${f}\n`);
      }
      if (next) process.stderr.write(`${nextLine(source, next)}\n`);
      if (at) process.stderr.write(`${stageLine(at)}\n`);
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
  if (args.taste !== undefined && args.brief !== undefined)
    return usageError("score takes one of --brief <intent.json> and --taste <profile>, not both");
  if (args.taste !== undefined) return cmdScoreTaste(args, args.taste);
  if (args.brief === undefined) return usageError("score needs --brief <intent.json> or --taste <profile>");
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
        ...measuresJson(result),
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

/**
 * `score <file.arch|-> --taste <profile>` — the TASTE meter (ADR 0032, PS5.1): a separate,
 * sourced score in [0, 1], capped at 0.5 while a validity-layer lint warning stands. Like the
 * intent meter it measures and never gates: a measurement exits 0 whatever the score. A plan
 * with compile errors exits 2 and prints them (the `lint` path); an unknown profile exits 3.
 */
function cmdScoreTaste(args: Args, profile: string): number {
  if (!TASTE_PROFILE_NAMES.includes(profile)) {
    return usageError(
      `unknown taste profile "${profile}"${didYouMean(profile, TASTE_PROFILE_NAMES)} (available: ${echoList(TASTE_PROFILE_NAMES)})`,
    );
  }
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    const { diagnostics } = resolvePlan(source, { world });
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length) return report(source, errs, args);
    const r = taste(source, { profile, world });
    if (args.json) emitJson(r);
    else if (!args.quiet) printTaste(r);
    // The meter always exits 0 on a successful measurement: taste never gates.
    return EXIT.OK;
  });
}

/** The human taste report: one summary line on stdout, one line per criterion on stderr. */
function printTaste(r: TasteReport): void {
  const w = r.coverage.weight;
  const score =
    r.score === null ? "not assessable" : `${r.score}${r.capped ? ` (capped; uncapped ${r.uncapped})` : ""}`;
  process.stdout.write(`taste ${r.profile}: ${score} · judged ${w.assessable}/${w.total} of the weight\n`);
  if (!r.validity.pass)
    process.stderr.write(
      `  validity: ${r.validity.warnings} warning${r.validity.warnings === 1 ? "" : "s"} (${r.validity.codes.join(", ")}) cap the score at 0.5\n`,
    );
  if (r.validity.drafting.warnings > 0)
    process.stderr.write(`  drafting (does not cap): ${r.validity.drafting.codes.join(", ")}\n`);
  if (r.advisory.length > 0)
    process.stderr.write(
      `  advisory, ${r.profile} only (does not cap): ${r.advisory.map((a) => `${a.code} ×${a.warnings}`).join(", ")} (see \`lint --profile ${r.profile}\`)\n`,
    );
  for (const c of r.criteria) {
    const head = `${c.id} ${c.name} ${c.score === null ? "—" : c.score}${c.advice ? ` ${c.advice}` : ""}`;
    process.stderr.write(`  ${head}: ${c.message}\n`);
  }
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
    if (errs.length) return report(source, errs, args, filter);
    // One run of the rules gives the diagnostics `lint()` returns and the coverage report.
    const linted = lintWithCoverage(source, { world, profile: args.profile });
    return report(source, linted.diagnostics, args, filter, linted.coverage ?? undefined);
  });
}

/**
 * `arch impact <plan.arch> (--set NAME=value | --against old.arch)` (plan-soundness PS4.2):
 * the {@link impact} report between the plan and its twin. With `--set` the twin is the
 * plan with one top-level `let` overridden (`applyLetOverride`); with `--against` the plan is
 * the after side and the named file the before side. Exactly one is required (exit 3).
 *
 * A report is a measurement, so it exits 0 whatever broke (like `score`); a refused `--set`
 * is a deterministic user error (exit 2, `E_SET_OVERRIDE`); an unreadable file exits 1.
 * `--lock <id,…>` (card B1) turns the report into a gate: exit 2 when a locked element changed
 * (`E_LOCKED_ELEMENT_CHANGED`), a lock was refused (`E_LOCK_UNNAMED`) or a side does not
 * resolve, so nothing could be checked. The check itself is `impact`'s (`src/lock.ts`).
 */
export function cmdImpact(args: Args): number {
  const hasSet = args.set !== undefined;
  const hasAgainst = args.against !== undefined;
  if (hasSet === hasAgainst)
    return usageErrorFor("impact", "impact needs exactly one of --set NAME=value and --against <old.arch>");
  let setName = "";
  let setValue = "";
  if (hasSet) {
    const eq = args.set!.indexOf("=");
    setName = eq > 0 ? args.set!.slice(0, eq).trim() : "";
    setValue = eq > 0 ? args.set!.slice(eq + 1).trim() : "";
    if (setName === "" || setValue === "")
      return usageErrorFor("impact", `--set takes NAME=value (e.g. --set W=4500), got "${args.set}"`);
  }
  const lock = args.lock !== undefined ? parseLockList(args.lock) : undefined;
  if (lock && lock.length === 0)
    return usageErrorFor("impact", `--lock takes ids separated by commas (e.g. --lock entry,w1), got "${args.lock}"`);
  return withSource(args, (source, input) => {
    const world = makeNodeWorld(baseDirOf(input));
    let before = source;
    let after = source;
    let set: { name: string; before: string; after: string } | undefined;
    if (hasSet) {
      const o = applyLetOverride(source, setName, setValue);
      if (!o.ok) {
        if (args.json) emitJson({ ok: false, diagnostics: o.diagnostics.map((d) => diagnosticToJson(source, d)) });
        else emitDiagnosticsHuman(source, o.diagnostics, args.quiet);
        return EXIT.USER;
      }
      after = o.source;
      set = { name: o.name, before: o.before, after: o.after };
    } else {
      try {
        before = readInput(args.against!);
      } catch {
        return ioError(`cannot read ${args.against}`, args.json);
      }
    }
    // Each file resolves its `import`s against its own directory.
    const beforeWorld = hasAgainst ? makeNodeWorld(baseDirOf(args.against!)) : world;
    const report = impact(before, after, { world, beforeWorld, ...(lock ? { lock } : {}) });
    const { ok, ...rest } = report;
    if (args.json) emitJson({ ok, ...(set ? { set } : {}), ...rest });
    else if (!args.quiet) {
      const head = set ? `${set.name}: ${set.before} → ${set.after}` : `${args.against} → ${input}`;
      // Where each changed locked element's statement stands on each side (line:col in its file).
      const where = (s: LockSpan | undefined, text: string, file: string): string => {
        if (!s) return "(none)";
        if (s.file !== undefined) return `${s.file} [${s.span[0]}, ${s.span[1]})`;
        const { line, col } = offsetToLineCol(text, s.span[0]);
        return `${file}:${line}:${col}`;
      };
      const beforeFile = hasAgainst ? args.against! : input;
      const afterFile = set ? `${input} (with --set)` : input;
      const spans = (report.lock?.violations ?? []).map(
        (v) => `  ${v.id}: ${where(v.before, before, beforeFile)} → ${where(v.after, after, afterFile)}`,
      );
      const lines = [head, ...report.summary];
      if (spans.length > 0) lines.push("Locked elements that changed, before → after:", ...spans);
      process.stdout.write(`${lines.join("\n")}\n`);
    }
    return report.lock && !report.lock.ok ? EXIT.USER : EXIT.OK;
  });
}
