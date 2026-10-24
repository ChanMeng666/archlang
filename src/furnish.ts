/**
 * The `furnish` stage of `finish()` — furniture by room use, in rooms that hold none
 * (`docs/adr/0025-furnish-as-explicit-transform.md`).
 *
 * A source-to-source stage outside `compile()`. For each room it reads the use from
 * {@link roomUses}, looks the use up in {@link FURNISH_TABLE}, and writes the pieces as
 * ordinary `furniture` statements in the two relative forms the compiler resolves:
 * `against wall … offset …` for a services fixture, `in <room> anchor …` with an explicit
 * `size` and `rotate` for a free-standing piece. It never writes `at (x,y)`.
 *
 * **Fill only.** A room that holds any furniture is not touched; when it lacks a piece its
 * use requires, the missing words are named in `unresolved`. Whether a piece is in a room is
 * read off the room's shape, never its bounding box. A room whose use is
 * unknown, or has no row in the table, is left alone. A polygon room and a multi-storey
 * plan are reported in `unresolved` and left as they are: `anchor` needs a rectangle, and
 * a position is never derived from a bounding box.
 *
 * **Never worse, per room.** A room's pieces are kept only when the plan with them compiles
 * and raises no diagnostic code (compile + lint under the default ruleset and under every
 * named profile, as multisets) and no hard furniture conflict it did not have before that
 * room. Otherwise the next candidate is tried; when a required piece cannot be placed its
 * use is left out whole, and a room with no use left is left empty. Both are reported. The one
 * code the gate does not count is `W_ROOM_MISSING_DEFINING`, which every partial state of a
 * room raises; a use is judged on its finished pieces instead. A defining piece the stage's own
 * candidates cannot place is tried once more with the lint's placement search (the statement the
 * rule's hint quotes); a use whose defining piece neither places is left out whole, and reported.
 *
 * **Bounded.** The candidate order is fixed, and the number of compile checks is at most
 * {@link furnishCheckBound} — linear in the rooms. There is no search loop and no randomness.
 */

import type { FurnitureAnchor, PlanNode, Point, UseKind } from "./ast.js";
import { type AnalyzeOptions, ROOM_CONTAINMENT_SLACK_MM, resolvePlan, roomAreaMm2, roomUses } from "./analyze.js";
import type { Span } from "./diagnostics.js";
import { Data } from "./fix-apply.js";
import type { FinishChange, FinishNote, FinishResult } from "./finish.js";
import {
  backingWallForRoomEdge,
  FIXTURE_WALL_TOL_MM,
  innerFaceOfRoomEdge,
  type RectEdge,
  rotateForBackEdge,
} from "./fixture-orientation.js";
import { defaultFootprint, frontClearanceMm } from "./fixtures-catalog.js";
import { FURNISH_TABLE, type FurnishItem, familyOf, servedBy } from "./furnish-table.js";
import { doorSwing, normal, sectorIntersectsRect, segmentsOfWall, sub, unit, type WallSegment } from "./geometry.js";
import { distToPolygonEdge, pointInPolygon, polygonsOverlap, rectRing } from "./geometry/polygon.js";
import { type BBox, doorLandingRect, rectsOverlap } from "./geometry/rect.js";
import type { RDoor, RFurniture, ROpening, ResolvedPlan, RRoom, RWall, RWindow } from "./ir.js";
import { lex } from "./lexer.js";
import { ADVISORY_CODE_PROFILES, DEFAULT_RULESET, LINT_CODE_LAYERS, LINT_PROFILES } from "./lint.js";
import { buildLintContext } from "./lint/context.js";
import { definingItems, pasteSet, useNoun } from "./lint/defining.js";
import { fmtSource } from "./num-format.js";
import { parse } from "./parser.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { sourceConflicts } from "./repair.js";

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

export { FURNISH_TABLE, type FurnishItem, type FurnishPlacement } from "./furnish-table.js";

/** Placement detail that is not part of the public table. */
interface Detail {
  /** Clear floor kept in front of the piece, beyond the catalogue's `clearanceMm`. */
  front?: number;
  /** Gap between a `front` piece and the piece it stands in front of. */
  gap?: number;
  /** Never stands in front of a window. */
  tall?: true;
  /** Tried in the middle of a wall before its corners. */
  middle?: true;
  /** Tried next to the previous `wall` piece before anywhere else. */
  run?: true;
  /** A `front` piece that faces the piece behind it, so its own back is to the room. */
  faces?: true;
  /**
   * A `run` piece that, when no place next to the run is clear, may stand against any wall
   * instead (a worktop on the opposite wall of a galley, or the other leg of an L). It never
   * constrains where the pieces before it stand, so the run is placed exactly as it would be
   * without it.
   */
  spill?: true;
}
const DETAIL: Readonly<Record<string, Detail>> = {
  wardrobe: { front: 600, tall: true },
  sofa: { middle: true },
  coffee_table: { gap: 400 },
  desk: { middle: true },
  office_chair: { gap: 100, faces: true },
  counter: { run: true, spill: true },
  worktop: { run: true, spill: true },
  stove: { run: true },
  fridge: { run: true, tall: true },
  shower: { tall: true },
};

// ---------------------------------------------------------------------------
// bounds
// ---------------------------------------------------------------------------

/** The most pieces one room is given, whatever the union of its uses asks for. */
export const MAX_PIECES_PER_ROOM = 8;
/** Compile checks spent on one piece once a room's first proposal has been refused. */
export const MAX_CHECKS_PER_PIECE = 3;
/** Compile checks spent on one room: the first proposal, then piece by piece. */
export const MAX_CHECKS_PER_ROOM = 13;

/** The most compile checks one run of the stage makes on a plan with `rooms` rooms. */
export const furnishCheckBound = (rooms: number): number => 1 + rooms * MAX_CHECKS_PER_ROOM;

/** The largest floor a room may have and still be furnished from the table, in m². */
export const MAX_ROOM_AREA_M2 = 100;

/**
 * The one code the never-worse gate does not count. `W_ROOM_MISSING_DEFINING` reports a
 * furnished room that lacks the piece its use is defined by, so it fires on every partial
 * state the stage passes through: a kitchen holding its sink before its stove is placed, a
 * bath holding its WC before its bathtub. Counted as a gained code it refused each piece of
 * the piece-by-piece fallback in turn and emptied rooms the stage used to furnish. It is
 * judged on the finished set instead, use by use, from the same reading the lint uses
 * (`settle` in {@link furnishStage}): a use whose defining piece found no position is left
 * out whole, and reported.
 */
const JUDGED_BY_PIECES = "W_ROOM_MISSING_DEFINING";

/** The default ruleset and every named profile but the advisory-code ones
 *  ({@link ADVISORY_CODE_PROFILES}): a position is pruned by the strictest of them. */
const RULESETS = [
  DEFAULT_RULESET,
  ...Object.entries(LINT_PROFILES)
    .filter(([name]) => !ADVISORY_CODE_PROFILES.includes(name))
    .map(([, p]) => ({ ...DEFAULT_RULESET, ...p })),
];
/** How deep a door's clear approach is kept, each side of its wall. */
const LANDING_MM = Math.max(...RULESETS.map((r) => r.doorwayLandingMm));
/** How far off a door's swing a piece is kept. */
const SWING_MM = Math.max(...RULESETS.map((r) => r.swingClearanceMm));
/** How far off a room edge an opening's point may sit and still be on that edge. */
const ON_EDGE_MM = 200;
/** How far off a wall a `centre` piece stands when the middle of the room is not free. */
const OFF_WALL_MM = 600;
const EPS = 0.5;

// ---------------------------------------------------------------------------
// the stage
// ---------------------------------------------------------------------------

/** The diagnostic codes of a source, as `finish` measures them. */
export interface FurnishCodes {
  errors: boolean;
  /** compile's codes, and lint's under the default ruleset. */
  codes: ReadonlyMap<string, number>;
  /** lint's codes under each named profile that differs from the default. */
  profiles?: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * The codes the never-worse law does not count, in either stage: every DRAFTING-layer lint code
 * (ADR 0032; read from {@link LINT_CODE_LAYERS}, so a new drafting rule joins by declaring its
 * layer). A drafting code reports the annotation, not the plan: where a label or a number landed
 * on the sheet (`W_ANNOTATION_OVERLAP`, `W_TITLE_OVERFLOW`, PS2.12), how a dimension is drawn
 * (`W_DIM_INSIDE`, `W_DIM_OVERLAP`) and what it says (`W_DIM_TEXT_MISMATCH`, PS2.10), or what the `dims auto` chains leave out
 * (`W_OPENING_NOT_DIMENSIONED`). The law protects the plan's soundness. Counted, a drafting code
 * refused a kitchen's fridge because the room's name would sit on it, and degraded `dims auto all`
 * for an opening no chain can reach — trading a real piece or a dimension set for an annotation.
 * The finished plan is then measured by the lint like any other, and says so (ADR 0024 §6 and ADR
 * 0025 §7, amended 2026-10-24).
 */
export const NOT_GATED_DRAFTING: ReadonlySet<string> = new Set(
  Object.entries(LINT_CODE_LAYERS)
    .filter(([, layer]) => layer === "drafting")
    .map(([code]) => code),
);

/** The codes `after` has more of than `before`, under the default ruleset or any profile —
 *  {@link NOT_GATED_DRAFTING} aside. */
export function gainedCodes(before: FurnishCodes, after: FurnishCodes): string[] {
  const out = new Set<string>();
  const more = (was: ReadonlyMap<string, number> | undefined, now: ReadonlyMap<string, number>): void => {
    for (const [code, n] of now) if (!NOT_GATED_DRAFTING.has(code) && n > (was?.get(code) ?? 0)) out.add(code);
  };
  more(before.codes, after.codes);
  for (const [profile, now] of after.profiles ?? []) more(before.profiles?.get(profile), now);
  return [...out].sort();
}

export interface FurnishStageResult extends FinishResult {
  /** The compile checks this run made — at most {@link furnishCheckBound}. */
  checks: number;
  /** The rooms looked at, for the bound. */
  rooms: number;
  /** Where the furniture was inserted in `source`, or null when nothing was. */
  insert: { at: number; text: string } | null;
}

/** The lint code behind each kind of hard conflict `sourceConflicts` keys. */
const CONFLICT_CODE: Readonly<Record<string, string>> = {
  overlap: "W_FURNITURE_OVERLAP",
  wall: "W_FURNITURE_WALL_COLLISION",
  doorway: "W_DOORWAY_BLOCKED",
  swing: "W_SWING_OBSTRUCTED",
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Furnish the empty rooms of `source`. `codesOf` is `finish`'s own measure (compile + lint
 * codes as a multiset), passed in so both stages count a diagnostic the same way.
 */
export function furnishStage(
  source: string,
  env: AnalyzeOptions,
  codesOf: (source: string) => FurnishCodes,
): FurnishStageResult {
  const none = (unresolved: FinishNote[], checks = 0, rooms = 0): FurnishStageResult => ({
    source,
    changes: [],
    unresolved,
    changed: false,
    checks,
    rooms,
    insert: null,
  });
  const registry = env.plugins?.length ? createRegistry(env.plugins) : BUILTIN_REGISTRY;
  let before = codesOf(source);
  const { plan } = parse(source, registry);
  const resolved = resolvePlan(source, env);
  if (before.errors || !plan || !resolved.ir || plan.bodyStart === undefined)
    return none([
      { stage: "furnish", reason: "the plan does not compile — fix its errors first; nothing was changed" },
    ]);

  const unresolved: FinishNote[] = [];
  const note = (room: RRoom, reason: string, codes?: string[]): void => {
    unresolved.push({
      stage: "furnish",
      room: room.id,
      reason,
      ...(codes && codes.length > 0 ? { codes } : {}),
      ...(room.span ? { span: room.span } : {}),
    });
  };

  /**
   * A room that holds some furniture is never topped up (ADR 0025, decision 2): what it
   * lacks is reported. These notes follow every other note of the run, in room order.
   */
  const partly = (r: Reported, level?: number): void => {
    const { room } = r;
    const name = room._idAuthored === true ? `"${room.id}"` : `the room "${room.label ?? room.id}"`;
    const where = level === undefined ? name : `${name} (level ${level})`;
    const code = (words: readonly string[]): string => words.map((c) => `\`${c}\``).join(", ");
    const what =
      "strayed" in r
        ? `holds no piece on its floor — ${code(r.strayed)} ${r.strayed.length === 1 ? "is" : "are"} declared \`in ${room.id}\` but ${r.strayed.length === 1 ? "stands" : "stand"} outside it (\`W_FIXTURE_WRONG_ROOM\`)`
        : `holds furniture but not every piece its use requires — ${r.missing
            .map((m) => `${m.use}: ${code(m.categories)}`)
            .join("; ")} missing`;
    // A room of a placed component is told to furnish the component, whatever its size: no
    // statement in the plan body can name it, so that is the advice that applies first.
    const reason =
      room._instance !== undefined
        ? `${where} ${what}; it belongs to a placed component instance — furnish the component instead`
        : roomAreaMm2(room) / 1e6 > MAX_ROOM_AREA_M2
          ? `${where} ${what}; it is larger than ${MAX_ROOM_AREA_M2} m², which the furnish table does not cover; finish fills only empty dwelling rooms`
          : `${where} ${what}; finish fills only empty rooms`;
    note(room, level === undefined ? reason : `${reason}, and the furnish stage handles single-storey plans only`);
  };

  if (resolved.levels.length > 0) {
    const partial: Array<[Reported, number]> = [];
    for (const l of resolved.levels) {
      const fill = roomsByFill(l.ir);
      for (const p of fill.reported) partial.push([p, l.level]);
      for (const room of fill.empty)
        note(
          room,
          `"${room.id}" (level ${l.level}) was not furnished — the furnish stage handles single-storey plans only`,
        );
    }
    for (const [p, level] of partial) partly(p, level);
    return none(unresolved);
  }

  const ir = resolved.ir;
  const { empty: todo, reported: partial } = roomsByFill(ir);
  /** Every note of the run: the stage's own, then the partly furnished rooms. Called once, at the return. */
  const reported = (): FinishNote[] => {
    for (const p of partial) partly(p);
    return unresolved;
  };
  if (todo.length === 0) return none(reported());
  const where = insertionPoint(source, plan);
  const walls = ir.walls;
  const segs = walls.flatMap((w) => segmentsOfWall(w));
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const passages = [...doors, ...ir.elements.filter((e): e is ROpening => e.kind === "opening")];
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const ids = new Map<string, number>();
  for (const e of ir.elements) if (e.kind === "room") ids.set(e.id, (ids.get(e.id) ?? 0) + 1);

  const lines: string[] = [];
  const changes: FinishChange[] = [];
  const render = (extra: readonly string[]): string => {
    const data = new Data(source);
    data.replaceRange(where.at, where.at, where.wrap([...lines, ...extra]));
    return data.render();
  };
  let conflicts = new Set(sourceConflicts(source, env).conflicts.keys());
  let checks = 0;
  /** null when `candidate` is no worse than the plan so far; otherwise what it would add. */
  const refusal = (candidate: string): string[] | null => {
    checks++;
    const after = codesOf(candidate);
    const gained = gainedCodes(before, after).filter((c) => c !== JUDGED_BY_PIECES);
    if (gained.length > 0) return gained;
    if (after.errors) return ["E_PARSE"];
    for (const k of sourceConflicts(candidate, env).conflicts.keys())
      if (!conflicts.has(k)) return [CONFLICT_CODE[k.split("|")[1] ?? ""] ?? "W_FURNITURE_OVERLAP"];
    return null;
  };
  const accept = (room: RRoom, uses: UseKind[], placed: Placed[]): void => {
    const texts = placed.map((p) => p.text);
    const out = render(texts);
    before = codesOf(out);
    conflicts = new Set(sourceConflicts(out, env).conflicts.keys());
    lines.push(...texts);
    for (const text of texts)
      changes.push({
        stage: "furnish",
        kind: "added",
        statement: "furniture",
        text,
        span: { start: where.at, end: where.at },
        room: room.id,
        reason: `"${room.id}" (${uses.join(", ")}) held no furniture`,
      });
  };

  for (const room of todo) {
    const uses = usesOf(room);
    if (room.poly || room.circle) {
      note(
        room,
        `"${room.id}" is a ${room.circle ? "circular" : "polygon"} room — the furnish stage places furniture in rectangular rooms only, and never derives a position from a bounding box`,
      );
      continue;
    }
    if (room._idAuthored !== true || room._instance !== undefined || !IDENT.test(room.id) || ids.get(room.id) !== 1) {
      note(
        room,
        room._instance !== undefined
          ? `"${room.id}" belongs to a placed component instance, so no statement in the plan body can name it — furnish the component instead`
          : `the room "${room.label ?? room.id}" has no \`id=\` of its own to place furniture \`in\` — give it one`,
      );
      continue;
    }
    if ((room.size.w * room.size.h) / 1e6 > MAX_ROOM_AREA_M2) {
      note(
        room,
        `"${room.id}" is larger than ${MAX_ROOM_AREA_M2} m² — the furnish table describes dwelling rooms, so the room was left as it is`,
      );
      continue;
    }
    let groups = groupsFor(uses);
    const relational = room._placement === "relational";
    if (relational) {
      // `in <room> anchor` needs a room with authored `at` coordinates (E_PLACE_REF);
      // `against wall` does not. Decided here, before any compile check.
      const anchored = groups.flatMap((g) => g.items).find((i) => i.required && i.place !== "wall");
      if (anchored) {
        note(
          room,
          `"${room.id}" was not furnished — a relational room has no fixed \`at\` to anchor in, and its \`${anchored.category}\` is placed \`in <room> anchor\`; give the room \`at (x,y)\` coordinates`,
        );
        continue;
      }
      groups = groups.map((g) => ({
        use: g.use,
        items: g.items.filter((i) => i.place === "wall"),
      }));
    }
    const site = new Site(room, walls, segs, passages, doors, windows, !relational);
    let budget = MAX_CHECKS_PER_ROOM;
    const nowhere = (item: FurnishItem): string =>
      site.walled === 0 && item.place !== "centre"
        ? `"${room.id}" has no wall behind any of its edges to stand the required \`${item.category}\` against`
        : `no position for the ${item.category === "counter" ? `worktop (\`counter\`, ${(item.sizes ?? []).map(([a]) => a).join(", ")} mm along)` : `required \`${item.category}\``} in "${room.id}" clears its walls, its doors and the pieces before it${
            site.named === 0 && item.place === "wall"
              ? `, and no wall behind it has an \`id=\` of its own for \`against wall\` to name`
              : ""
          }`;
    /** The uses left out of a room that was furnished: each is reported, never scattered. */
    const leftOut = (dropped: readonly Dropped[]): void => {
      for (const d of dropped)
        note(
          room,
          d.codes
            ? `the ${d.use} pieces were left out of "${room.id}" — they would raise ${d.codes.join(", ")}, which the plan does not have now (the required \`${d.item.category}\` has no position that avoids it)`
            : `the ${d.use} pieces were left out of "${room.id}" — ${nowhere(d.item)}`,
          d.codes ?? undefined,
        );
    };

    /**
     * Accept `placed`, judging each use it furnishes by the pieces that define it
     * (`definingItems`, the reading `W_ROOM_MISSING_DEFINING` lints). The gate does not count
     * that code (see {@link JUDGED_BY_PIECES}); it is judged here, per use, on the finished
     * set. A defining piece the stage's candidates have no position for is tried with the lint's
     * own placement search ({@link hinted}); a use whose defining piece neither search places is
     * left out whole, and what remains is checked once more before it is kept.
     */
    /**
     * One defining piece placed by the lint's own search (`pasteSet`, the statement the
     * `W_ROOM_MISSING_DEFINING` hint quotes), measured on the plan with `placed` written, and
     * kept only when the gate accepts it. A statement in the `at (x,y)` form (a relational room)
     * is not taken: the stage never writes one. One resolve and one compile check, charged to
     * the room's budget.
     */
    const hinted = (room: RRoom, placed: Placed[], use: UseKind, item: FurnishItem): Placed | null => {
      if (budget === 0) return null;
      const src = render(placed.map((p) => p.text));
      const ir = resolvePlan(src, env).ir;
      const here = ir?.elements.find((e): e is RRoom => e.kind === "room" && e.id === room.id);
      if (!ir || !here) return null;
      const paste = pasteSet(buildLintContext(ir, DEFAULT_RULESET), here, [item]);
      const text = "stmts" in paste ? paste.stmts[0] : undefined;
      if (text === undefined || text.includes(" at (")) return null;
      budget--;
      if (refusal(render([...placed.map((p) => p.text), text])) !== null) return null;
      // Only `text` and `use` are read from here on (accept, and the next settle question);
      // the geometry fields describe no candidate of the stage's own and are left empty.
      return {
        item,
        use,
        text,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        strip: null,
        edge: null,
        middle: false,
        against: false,
        lo: 0,
        hi: 0,
        depth: 0,
      };
    };

    const settle = (room: RRoom, uses: UseKind[], placed: Placed[], leftOutNotes: () => void): void => {
      const families = new Set(placed.flatMap((p) => servedBy(p.text.split(" ")[1] ?? "")));
      const holds = (i: FurnishItem): boolean => [i.category, ...(i.or ?? [])].some((w) => families.has(familyOf(w)));
      const lacking: Array<{ use: UseKind; item: FurnishItem }> = [];
      // A defining piece the stage did not place: its own candidates (corners and wall middles,
      // beside the run it already placed) had no position the gate accepts, or its bounded tries
      // never reached one. Ask the lint's placement search, the one the rule's hint quotes,
      // before giving the use up: a use is never written without the piece that defines it,
      // so `finish` raises no W_ROOM_MISSING_DEFINING on a use it furnished.
      for (const use of [...new Set(placed.map((p) => p.use))])
        for (const item of definingItems(use))
          if (!holds(item)) {
            const extra = hinted(room, placed, use, item);
            if (extra) placed = [...placed, extra];
            else lacking.push({ use, item });
          }
      if (lacking.length === 0) {
        accept(room, uses, placed);
        leftOutNotes();
        return;
      }
      const out = new Set(lacking.map((l) => l.use));
      const remaining = placed.filter((p) => !out.has(p.use));
      const words = (i: FurnishItem): string => [i.category, ...(i.or ?? [])].map((w) => `\`${w}\``).join(" or ");
      const why = (l: { use: UseKind; item: FurnishItem }): string =>
        `furnish found no position for its ${words(l.item)}, the piece that defines a ${useNoun(l.use)} (\`${JUDGED_BY_PIECES}\`)`;
      let keep = remaining.length > 0 && budget > 0;
      if (keep) {
        budget--;
        keep = refusal(render(remaining.map((p) => p.text))) === null;
      }
      if (!keep) {
        note(room, `"${room.id}" was left empty — ${lacking.map(why).join("; ")}`, [JUDGED_BY_PIECES]);
        return;
      }
      accept(room, uses, remaining);
      leftOutNotes();
      for (const l of lacking)
        note(room, `the ${l.use} pieces were left out of "${room.id}" — ${why(l)}`, [JUDGED_BY_PIECES]);
    };

    // First proposal: use by use, the first candidate of every piece that clears the room's
    // geometry. A use whose required piece has no position is left out whole.
    const first: Placed[] = [];
    const absent: Dropped[] = [];
    for (const g of groups) {
      const mine: Placed[] = [];
      let missing: FurnishItem | null = null;
      for (const [i, item] of g.items.entries()) {
        const [c] = site.candidates(item, g.use, [...first, ...mine], followers(g.items, i));
        if (c) mine.push(c);
        else if (item.required) {
          missing = item;
          break;
        }
      }
      if (missing) absent.push({ use: g.use, item: missing, codes: null });
      else first.push(...mine);
    }
    if (first.length === 0) {
      if (absent[0]) note(room, `${nowhere(absent[0].item)} — the room was left empty`);
      continue;
    }
    budget--;
    let blocking = refusal(render(first.map((p) => p.text)));
    if (blocking === null) {
      settle(room, uses, first, () => leftOut(absent));
      continue;
    }

    // Refused: place the pieces one at a time, each kept only when the plan stays no worse.
    // A use whose required piece is refused is left out whole.
    const kept: Placed[] = [];
    const dropped: Dropped[] = [];
    for (const g of groups) {
      const mine: Placed[] = [];
      let failed: FurnishItem | null = null;
      let why: string[] | null = null;
      for (const [i, item] of g.items.entries()) {
        let ok = false;
        let tries = MAX_CHECKS_PER_PIECE;
        for (const c of site.candidates(item, g.use, [...kept, ...mine], followers(g.items, i))) {
          if (tries === 0 || budget === 0) break;
          tries--;
          budget--;
          const refused = refusal(render([...kept, ...mine, c].map((p) => p.text)));
          if (refused === null) {
            mine.push(c);
            ok = true;
            break;
          }
          why = refused;
          blocking = refused;
        }
        if (!ok && item.required) {
          failed = item;
          break;
        }
      }
      if (failed) dropped.push({ use: g.use, item: failed, codes: why });
      else kept.push(...mine);
    }
    if (kept.length === 0) {
      const failed = dropped[0]?.item;
      note(
        room,
        `furnishing "${room.id}" would raise ${blocking.join(", ")}, which the plan does not have now${failed ? ` (the required \`${failed.category}\` has no position that avoids it)` : ""} — the room was left empty`,
        blocking,
      );
      continue;
    }
    settle(room, uses, kept, () => leftOut(dropped));
  }

  if (lines.length === 0) return none(reported(), checks, todo.length);
  const text = where.wrap(lines);
  return {
    source: render([]),
    changes,
    unresolved: reported(),
    changed: true,
    checks,
    rooms: todo.length,
    insert: { at: where.at, text },
  };
}

/** A use left out of a room: the required piece that had no position, and the codes that refused it. */
interface Dropped {
  use: UseKind;
  item: FurnishItem;
  codes: string[] | null;
}

/**
 * A room's uses that have a row in the table: the uses with a wall run first, so the run
 * gets a whole wall before a free-standing piece claims it, then the larger required
 * footprint first.
 */
function usesOf(room: RRoom): UseKind[] {
  const weight = (u: UseKind): number =>
    (FURNISH_TABLE[u] ?? [])
      .filter((i) => i.required)
      .reduce((sum, i) => {
        const [along, depth] = footprints(i.category, i)[0] ?? [0, 0];
        return sum + along * depth;
      }, 0);
  return [...roomUses(room)]
    .filter((u) => (FURNISH_TABLE[u]?.length ?? 0) > 0)
    .map((u, i) => ({
      u,
      i,
      w: weight(u),
      free: (FURNISH_TABLE[u] ?? []).some((x) => x.place === "wall") ? 0 : 1,
    }))
    .sort((a, b) => a.free - b.free || b.w - a.w || a.i - b.i)
    .map((x) => x.u);
}

/** The pieces a set of uses asks for, use by use: the union, each catalogue word once, capped. */
function groupsFor(uses: readonly UseKind[]): Array<{ use: UseKind; items: FurnishItem[] }> {
  const seen = new Set<string>();
  const out: Array<{ use: UseKind; items: FurnishItem[] }> = [];
  for (const use of uses) {
    const items: FurnishItem[] = [];
    for (const item of FURNISH_TABLE[use] ?? []) {
      if (seen.has(item.category) || seen.size >= MAX_PIECES_PER_ROOM) continue;
      seen.add(item.category);
      items.push(item);
    }
    if (items.length > 0) out.push({ use, items });
  }
  return out;
}

/** The required pieces after `items[i]` that must stand in its run: it is placed where they fit. */
const followers = (items: readonly FurnishItem[], i: number): FurnishItem[] =>
  items.slice(i + 1).filter((f) => f.required && DETAIL[f.category]?.run === true && !DETAIL[f.category]?.spill);

function footprints(category: string, item: FurnishItem): ReadonlyArray<readonly [number, number]> {
  if (item.sizes && category === item.category) return item.sizes;
  const fp = defaultFootprint(category);
  return fp ? [[fp.along, fp.depth]] : (item.sizes ?? []);
}

/**
 * Does the piece stand on the room's floor? Its footprint is tested against the room's
 * SHAPE — the polygon (a circle's tessellation), else the rectangle — never the room's
 * bounding box, so a piece in the notch of an L is not the L's. "On" is interiors
 * overlapping by more than 1 mm, the measure {@link rectsOverlap} uses: a piece against a
 * partition shares the wall band with the room on its far side, and is not in it.
 *
 * `eps` is that 1 mm. {@link beyondBand}'s footprint passes 0: the band is already taken
 * off, so any reach past it counts, exactly where `W_FIXTURE_WRONG_ROOM` starts to fire.
 */
function standsIn(foot: BBox, floor: readonly Point[], eps = 1): boolean {
  if (polygonsOverlap(rectRing(foot), floor, eps)) return true;
  // A footprint whose every edge lies on the floor's boundary (a piece the size of the
  // room) has no vertex or edge midpoint strictly inside the floor; its centre is. So does a
  // footprint {@link beyondBand} shrank to a line or a point.
  const c = { x: foot.x + foot.w / 2, y: foot.y + foot.h / 2 };
  return distToPolygonEdge(c, floor) > eps && pointInPolygon(c.x, c.y, floor);
}

const footOf = (f: RFurniture): BBox => ({ x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h });
/**
 * The footprint less the band a piece may hang into a neighbouring room before its `in`
 * reads as wrong: {@link ROOM_CONTAINMENT_SLACK_MM} on every side, the band of
 * `W_FIXTURE_WRONG_ROOM` (`rectInRoomBox`, which shrinks the same way — a piece smaller
 * than twice the band shrinks to its centre).
 */
function beyondBand(f: RFurniture): BBox {
  const m = Math.min(ROOM_CONTAINMENT_SLACK_MM, f.size.w / 2, f.size.h / 2);
  return { x: f.at.x + m, y: f.at.y + m, w: f.size.w - 2 * m, h: f.size.h - 2 * m };
}

/** A room that is not empty, and why it is reported. */
type Reported =
  /** It holds furniture, but not every piece its uses require. */
  | { room: RRoom; missing: Array<{ use: UseKind; categories: string[] }> }
  /** Nothing stands on its floor; the pieces declared `in` it stand outside it. */
  | { room: RRoom; strayed: string[] };

/**
 * The rooms of one storey whose use has a row in the table, by what they hold: `empty`
 * (no piece; the stage furnishes it) and `reported` (never topped up, and said why: a
 * partly furnished room, or one whose only pieces are declared in it but stand elsewhere).
 * A room holding every required piece is in neither.
 *
 * Which pieces a room holds is read off the room's shape. A piece stands in the room it is
 * declared `in` when its footprint reaches that room's floor, and in any other room when it
 * reaches that floor beyond the band {@link beyondBand} allows. A piece with no `in` (or one
 * naming no room of this storey) stands in every room its footprint reaches. A room a piece
 * is declared `in` is never empty, wherever the piece stands, as before this test existed.
 */
function roomsByFill(ir: ResolvedPlan): { empty: RRoom[]; reported: Reported[] } {
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const rooms = new Set(ir.elements.filter((e) => e.kind === "room").map((e) => (e as RRoom).id));
  const empty: RRoom[] = [];
  const reported: Reported[] = [];
  for (const e of ir.elements) {
    if (e.kind !== "room" || e._unplaced) continue;
    const uses = usesOf(e);
    if (uses.length === 0) continue;
    const floor = e.poly ?? rectRing({ x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h });
    const declaredHere = (f: RFurniture): boolean => f.room === e.id;
    const held = furniture.filter((f) =>
      f.room === undefined || !rooms.has(f.room)
        ? standsIn(footOf(f), floor)
        : declaredHere(f)
          ? standsIn(footOf(f), floor)
          : standsIn(beyondBand(f), floor, 0),
    );
    if (held.length === 0) {
      const strayed = furniture.filter(declaredHere);
      if (strayed.length === 0) empty.push(e);
      else reported.push({ room: e, strayed: [...new Set(strayed.map((f) => f.category))] });
      continue;
    }
    const families = new Set(held.flatMap((f) => servedBy(f.category)));
    const holds = (i: FurnishItem): boolean => [i.category, ...(i.or ?? [])].some((w) => families.has(familyOf(w)));
    const missing: Array<{ use: UseKind; categories: string[] }> = [];
    for (const use of uses) {
      const categories = (FURNISH_TABLE[use] ?? []).filter((i) => i.required && !holds(i)).map((i) => i.category);
      if (categories.length > 0) missing.push({ use, categories });
    }
    if (missing.length > 0) reported.push({ room: e, missing });
  }
  return { empty, reported };
}

// ---------------------------------------------------------------------------
// one room's geometry
// ---------------------------------------------------------------------------

/** A piece before `candidates` gives it the use that asked for it. */
type Unowned = Omit<Placed, "use">;

/** One proposed piece. */
interface Placed {
  item: FurnishItem;
  /** The use whose row asked for it. */
  use: UseKind;
  text: string;
  rect: BBox;
  /** The floor kept clear in front of it, or null. */
  strip: BBox | null;
  /** The room edge its back is on, or null for a centred piece. */
  edge: RectEdge | null;
  /** Anchored to the middle of `edge`, so a `front` piece can share the anchor. */
  middle: boolean;
  /** Written `against wall`. */
  against: boolean;
  /** Its run along `edge`, and its depth off the wall face. */
  lo: number;
  hi: number;
  depth: number;
}

const EDGES: readonly RectEdge[] = ["top", "right", "bottom", "left"];
const OPPOSITE: Readonly<Record<RectEdge, RectEdge>> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const ANCHORS: Readonly<Record<RectEdge, readonly [FurnitureAnchor, FurnitureAnchor, FurnitureAnchor]>> = {
  top: ["top-left", "top", "top-right"],
  bottom: ["bottom-left", "bottom", "bottom-right"],
  left: ["top-left", "left", "bottom-left"],
  right: ["top-right", "right", "bottom-right"],
};

interface Edge {
  edge: RectEdge;
  horizontal: boolean;
  /** The wall segment behind the edge, or null. */
  seg: WallSegment | null;
  /** How `against wall` names that segment, or null when the source cannot. */
  ref: {
    id: string;
    segment: number | null;
    side: "left" | "right";
    from: number;
    sign: 1 | -1;
  } | null;
  /** The clear run along the edge, between the faces of the two walls it meets. */
  lo: number;
  hi: number;
  /** The same run cut down to the backing segment's own extent. */
  segLo: number;
  segHi: number;
  /** The middle of the ROOM rectangle on this axis — where an edge anchor centres a piece. */
  mid: number;
  windows: Array<[number, number]>;
  doors: number;
}

/** A rectangular room, read once: its clear rectangle, its four edges and what is on them. */
class Site {
  private readonly clear: { x0: number; y0: number; x1: number; y1: number };
  private readonly edges: Edge[];
  private readonly all: Edge[];
  /** How many of the four edges have a wall behind them. */
  readonly walled: number;
  /** How many of those walls a statement can name: an authored `id=` no other wall shares. */
  readonly named: number;

  constructor(
    private readonly room: RRoom,
    walls: RWall[],
    segs: WallSegment[],
    private readonly passages: ReadonlyArray<RDoor | ROpening>,
    private readonly doors: readonly RDoor[],
    windows: readonly RWindow[],
    /** Can a piece be written `in <room> anchor`? Not in a relational room. */
    private readonly anchors: boolean,
  ) {
    const rect: BBox = { x: room.at.x, y: room.at.y, w: room.size.w, h: room.size.h };
    const x1 = rect.x + rect.w;
    const y1 = rect.y + rect.h;
    // The floor starts at the innermost face of the walls on an edge — the plane `flush`
    // measures from — and a piece is backed by the wall that covers most of the edge.
    const backing = (edge: RectEdge): { seg: WallSegment; face: number } | null => {
      const seg = backingWallForRoomEdge(rect, edge, walls, FIXTURE_WALL_TOL_MM, segs);
      const face = innerFaceOfRoomEdge(rect, edge, walls, FIXTURE_WALL_TOL_MM, segs);
      return seg && face !== null ? { seg, face } : null;
    };
    const back = { top: backing("top"), right: backing("right"), bottom: backing("bottom"), left: backing("left") };
    this.clear = {
      x0: back.left?.face ?? rect.x,
      y0: back.top?.face ?? rect.y,
      x1: back.right?.face ?? x1,
      y1: back.bottom?.face ?? y1,
    };
    const onEdge = (p: { x: number; y: number }, edge: RectEdge): number | null => {
      const horizontal = edge === "top" || edge === "bottom";
      const fixed = edge === "top" ? rect.y : edge === "bottom" ? y1 : edge === "left" ? rect.x : x1;
      const [off, along, lo, hi] = horizontal ? [p.y - fixed, p.x, rect.x, x1] : [p.x - fixed, p.y, rect.y, y1];
      return Math.abs(off) <= ON_EDGE_MM && along >= lo - EPS && along <= hi + EPS ? along : null;
    };
    const all = EDGES.map((edge): Edge => {
      const horizontal = edge === "top" || edge === "bottom";
      const seg = back[edge]?.seg ?? null;
      const [lo, hi] = horizontal ? [this.clear.x0, this.clear.x1] : [this.clear.y0, this.clear.y1];
      const [a, b] = seg ? (horizontal ? [seg.a.x, seg.b.x] : [seg.a.y, seg.b.y]) : [lo, hi];
      const spans = (els: ReadonlyArray<{ at: { x: number; y: number }; width: number }>): Array<[number, number]> =>
        els.flatMap((el): Array<[number, number]> => {
          const at = onEdge(el.at, edge);
          return at === null ? [] : [[at - el.width / 2, at + el.width / 2]];
        });
      return {
        edge,
        horizontal,
        seg,
        ref: seg ? wallRef(seg, walls, edge) : null,
        lo,
        hi,
        segLo: Math.max(lo, Math.min(a, b)),
        segHi: Math.min(hi, Math.max(a, b)),
        mid: horizontal ? rect.x + rect.w / 2 : rect.y + rect.h / 2,
        windows: spans(windows),
        doors: spans(passages).length,
      };
    });
    // Walls with no door first, then with no window, then the longer; the fixed order breaks a tie.
    this.all = all;
    this.walled = all.filter((e) => e.seg !== null).length;
    this.named = all.filter((e) => e.ref !== null).length;
    this.edges = all
      .filter((e) => e.seg !== null)
      .map((e, i) => ({ e, i }))
      .sort(
        (p, q) =>
          Math.min(p.e.doors, 1) - Math.min(q.e.doors, 1) ||
          Math.min(p.e.windows.length, 1) - Math.min(q.e.windows.length, 1) ||
          q.e.hi - q.e.lo - (p.e.hi - p.e.lo) ||
          p.i - q.i,
      )
      .map((p) => p.e);
  }

  /**
   * Every position for `item` that clears the room's geometry and `placed`, in the fixed
   * order. A `run` piece stands next to the last wall piece of its OWN use and nowhere else,
   * so a use's run is one unbroken row; a piece with `after` is offered only where each of
   * those can then join the run.
   */
  candidates(item: FurnishItem, use: UseKind, placed: readonly Placed[], after: readonly FurnishItem[] = []): Placed[] {
    const out: Placed[] = [];
    for (const category of [item.category, ...(item.or ?? [])]) {
      const detail = DETAIL[category] ?? {};
      for (const [along, depth] of footprints(category, item)) {
        const here: Placed[] = [];
        const late: Placed[] = [];
        const offer = (made: Unowned | null, windowOn: boolean): void => {
          if (!made) return;
          const p: Placed = { ...made, use };
          if (!this.fits(p, placed)) return;
          if (!(windowOn && this.glazed(p))) here.push(p);
          else if (!detail.tall) late.push(p);
        };
        if (item.place === "centre") {
          const wide = this.clear.x1 - this.clear.x0 >= this.clear.y1 - this.clear.y0;
          for (const turned of wide ? [false, true] : [true, false])
            offer(this.centred(item, category, along, depth, turned), false);
          // The middle is some door's swing: stand it off the middle of a wall instead.
          for (const e of this.edges) offer(this.anchored(item, category, e, 1, along, depth, OFF_WALL_MM), false);
        } else if (item.place === "front") {
          const behind = placed[placed.length - 1];
          const e = behind?.middle ? this.edges.find((x) => x.edge === behind.edge) : undefined;
          if (behind && e)
            offer(this.anchored(item, category, e, 1, along, depth, behind.depth + (detail.gap ?? 0)), true);
        } else {
          const mate = detail.run
            ? [...placed].reverse().find((q) => q.item.place === "wall" && q.use === use)
            : undefined;
          const next = mate?.against ? this.edges.find((x) => x.edge === mate.edge) : undefined;
          if (mate) {
            // Only `against wall … offset` can say "next to it": an anchored mate has no run.
            if (next) {
              offer(this.against(item, category, next, mate.hi + along / 2, along, depth), true);
              offer(this.against(item, category, next, mate.lo - along / 2, along, depth), true);
            }
          }
          if (mate && detail.spill) {
            // Every place beside the run first (under a window included), then any wall.
            out.push(...here.splice(0), ...late.splice(0));
          }
          if (!mate || detail.spill) {
            const at = (e: Edge, slot: 0 | 1 | 2): void => {
              // A wall no statement can name: the fixture is written in the anchored form.
              if (item.place !== "wall" || !e.ref) {
                if (this.anchors) offer(this.anchored(item, category, e, slot, along, depth, 0), true);
                return;
              }
              const c = slot === 0 ? e.segLo + along / 2 : slot === 2 ? e.segHi - along / 2 : (e.segLo + e.segHi) / 2;
              offer(this.against(item, category, e, c, along, depth), true);
            };
            // A `middle` piece tries the middle of every wall before any corner.
            if (detail.middle) for (const e of this.edges) at(e, 1);
            for (const e of this.edges)
              for (const slot of detail.middle ? ([0, 2] as const) : ([0, 2, 1] as const)) at(e, slot);
          }
        }
        out.push(...here, ...late);
      }
    }
    if (after.length === 0) return out;
    return out.filter((c) => {
      const row = [...placed, c];
      for (const f of after) {
        const [n] = this.candidates(f, use, row);
        if (!n) return false;
        row.push(n);
      }
      return true;
    });
  }

  /** Is the piece against a wall under a window — the wall behind it, or the one beside a corner? */
  private glazed(p: Placed): boolean {
    const r = p.rect;
    const c = this.clear;
    return this.all.some((e) => {
      const off =
        e.edge === "top"
          ? r.y - c.y0
          : e.edge === "bottom"
            ? c.y1 - (r.y + r.h)
            : e.edge === "left"
              ? r.x - c.x0
              : c.x1 - (r.x + r.w);
      if (p.edge !== e.edge && Math.abs(off) > 1) return false;
      const [lo, hi] = e.horizontal ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
      return e.windows.some(([a, b]) => Math.min(b, hi) - Math.max(a, lo) > 1);
    });
  }

  /** `against wall <id> offset <mm>`: a services fixture centred at `c` along the edge. */
  private against(
    item: FurnishItem,
    category: string,
    e: Edge,
    c: number,
    along: number,
    depth: number,
  ): Unowned | null {
    const ref = e.ref;
    if (!ref || !e.seg) return null;
    const offset = Math.round((c - ref.from) * ref.sign);
    const centre = ref.from + offset * ref.sign;
    if (centre - along / 2 < e.segLo - EPS || centre + along / 2 > e.segHi + EPS) return null;
    const line = e.horizontal ? e.seg.a.y : e.seg.a.x;
    const inward = e.edge === "top" || e.edge === "left" ? 1 : -1;
    const near = line + (inward * e.seg.thickness) / 2;
    const rect = this.rectAt(e, centre - along / 2, inward > 0 ? near : near - depth, along, depth);
    // A footprint other than the catalogue's is written out (a 400 mm worktop module); the
    // catalogue's own is not, so every statement that used it reads as it always did.
    const fp = defaultFootprint(category);
    const sized =
      fp && (fp.along !== along || fp.depth !== depth) ? ` size ${fmtSource(along)}x${fmtSource(depth)}` : "";
    const text = [
      `furniture ${category} against wall ${ref.id}`,
      ...(ref.segment !== null ? [`segment ${ref.segment}`] : []),
      `offset ${fmtSource(offset)} side ${ref.side}${sized} in ${this.room.id}`,
    ].join(" ");
    return this.piece(item, category, text, rect, e.edge, false, true, centre - along / 2, along, depth);
  }

  /** `in <room> anchor <corner or edge> flush [inset]`: slot 0/2 are the corners, 1 the middle. */
  private anchored(
    item: FurnishItem,
    category: string,
    e: Edge,
    slot: 0 | 1 | 2,
    along: number,
    depth: number,
    inset: number,
  ): Unowned | null {
    const start = slot === 0 ? e.lo : slot === 2 ? e.hi - along : e.mid - along / 2;
    const face =
      e.edge === "top"
        ? this.clear.y0
        : e.edge === "bottom"
          ? this.clear.y1
          : e.edge === "left"
            ? this.clear.x0
            : this.clear.x1;
    const inward = e.edge === "top" || e.edge === "left" ? 1 : -1;
    const near = inward > 0 ? face + inset : face - inset - depth;
    const rect = this.rectAt(e, start, near, along, depth);
    const faces = DETAIL[category]?.faces === true;
    const text = [
      `furniture ${category} in ${this.room.id} anchor ${ANCHORS[e.edge][slot]} flush`,
      ...(inset > 0 ? [`inset ${fmtSource(inset)}`] : []),
      `size ${fmtSource(rect.w)}x${fmtSource(rect.h)}`,
      `rotate ${rotateForBackEdge(faces ? OPPOSITE[e.edge] : e.edge)}`,
    ].join(" ");
    return this.piece(item, category, text, rect, e.edge, slot === 1, false, start, along, inset + depth);
  }

  /** `in <room> anchor center`: the long side along the room's long side unless `turned`. */
  private centred(item: FurnishItem, category: string, along: number, depth: number, turned: boolean): Unowned {
    const [w, h] = turned ? [depth, along] : [along, depth];
    const r = this.room;
    const rect: BBox = { x: r.at.x + r.size.w / 2 - w / 2, y: r.at.y + r.size.h / 2 - h / 2, w, h };
    const text = `furniture ${category} in ${r.id} anchor center size ${fmtSource(w)}x${fmtSource(h)} rotate ${turned ? 90 : 0}`;
    return { item, text, rect, strip: null, edge: null, middle: false, against: false, lo: 0, hi: 0, depth: 0 };
  }

  private rectAt(e: Edge, start: number, near: number, along: number, depth: number): BBox {
    return e.horizontal ? { x: start, y: near, w: along, h: depth } : { x: near, y: start, w: depth, h: along };
  }

  private piece(
    item: FurnishItem,
    category: string,
    text: string,
    rect: BBox,
    edge: RectEdge,
    middle: boolean,
    against: boolean,
    lo: number,
    along: number,
    depth: number,
  ): Unowned {
    const clear = Math.max(frontClearanceMm(category), DETAIL[category]?.front ?? 0);
    const strip: BBox | null =
      clear <= 0
        ? null
        : edge === "top"
          ? { x: rect.x, y: rect.y + rect.h, w: rect.w, h: clear }
          : edge === "bottom"
            ? { x: rect.x, y: rect.y - clear, w: rect.w, h: clear }
            : edge === "left"
              ? { x: rect.x + rect.w, y: rect.y, w: clear, h: rect.h }
              : { x: rect.x - clear, y: rect.y, w: clear, h: rect.h };
    return { item, text, rect, strip, edge, middle, against, lo, hi: lo + along, depth };
  }

  /** Is the piece on the room's clear floor, off every door's approach and swing, and clear of `placed`? */
  private fits(p: Placed, placed: readonly Placed[]): boolean {
    const c = this.clear;
    const inside = (r: BBox): boolean =>
      r.x >= c.x0 - EPS && r.y >= c.y0 - EPS && r.x + r.w <= c.x1 + EPS && r.y + r.h <= c.y1 + EPS;
    if (p.rect.w <= 0 || p.rect.h <= 0 || !inside(p.rect) || (p.strip && !inside(p.strip))) return false;
    const behind = p.item.place === "front" ? placed[placed.length - 1] : undefined;
    for (const q of placed) {
      if (rectsOverlap(p.rect, q.rect)) return false;
      if (q !== behind && q.strip && rectsOverlap(p.rect, q.strip)) return false;
      if (p.strip && rectsOverlap(p.strip, q.rect)) return false;
    }
    for (const d of this.passages) {
      const landing = doorLandingRect(d, LANDING_MM);
      if (landing && rectsOverlap(landing, p.rect)) return false;
    }
    for (const d of this.doors) {
      const swing = doorSwing(d);
      if (swing && sectorIntersectsRect(swing, p.rect, SWING_MM)) return false;
    }
    return true;
  }
}

/** How a statement in the plan body can name the wall behind `seg`, or null when it cannot. */
function wallRef(seg: WallSegment, walls: readonly RWall[], edge: RectEdge): Edge["ref"] {
  const wall = walls.find((w) => w.id === seg.wallId);
  if (wall?._idAuthored !== true || wall._instance !== undefined || !IDENT.test(wall.id)) return null;
  if (walls.filter((w) => w.id === wall.id || w.category === wall.id).length !== 1) return null;
  const d = unit(sub(seg.b, seg.a));
  const left = normal(d);
  const inward =
    edge === "top"
      ? { x: 0, y: 1 }
      : edge === "bottom"
        ? { x: 0, y: -1 }
        : edge === "left"
          ? { x: 1, y: 0 }
          : { x: -1, y: 0 };
  const horizontal = edge === "top" || edge === "bottom";
  return {
    id: wall.id,
    segment: segmentsOfWall(wall).length > 1 ? seg.index : null,
    side: left.x * inward.x + left.y * inward.y > 0 ? "left" : "right",
    from: horizontal ? seg.a.x : seg.a.y,
    sign: (horizontal ? d.x : d.y) > 0 ? 1 : -1,
  };
}

// ---------------------------------------------------------------------------
// where the statements go
// ---------------------------------------------------------------------------

const BLANK = /^[ \t]*$/;
const BLANK_OR_COMMENT = /^[ \t]*(#.*)?$/;
/** The statements furniture is written after, when the plan body has no furniture of its own. */
const SHELL_KINDS: ReadonlySet<string> = new Set(["room", "wall", "door", "window", "opening"]);

/**
 * Where the new statements go, and how they are laid out there: after the last `furniture`
 * statement of the plan body itself, else after its last room, wall, door, window or
 * opening — never inside a `for`, an `if`, a `zone`, a `level` or a component body. When
 * that statement does not end its line, they go before the plan's closing brace instead.
 * A wrong guess does not compile, and the never-worse check then refuses the room.
 */
function insertionPoint(source: string, plan: PlanNode): { at: number; wrap: (lines: readonly string[]) => string } {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lineStart = (at: number): number => source.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = (at: number): number => {
    const i = source.indexOf("\n", at);
    if (i < 0) return source.length;
    return i > 0 && source[i - 1] === "\r" ? i - 1 : i;
  };
  const last = (kinds: (kind: string) => boolean): Span | null => {
    let best: Span | null = null;
    for (const s of plan.body) {
      const span = (s as { span?: Span }).span;
      if (span && kinds(s.kind) && (!best || span.end > best.end)) best = span;
    }
    return best;
  };
  const after = last((k) => k === "furniture") ?? last((k) => SHELL_KINDS.has(k));
  if (after && BLANK_OR_COMMENT.test(source.slice(after.end, lineEnd(after.end)))) {
    const lead = source.slice(lineStart(after.start), after.start);
    const indent = BLANK.test(lead) ? lead : "  ";
    return { at: lineEnd(after.end), wrap: (lines) => lines.map((l) => `${eol}${indent}${l}`).join("") };
  }
  // Before the closing brace of the plan: the last `}` the lexer reads at depth 0 of the body.
  const toks = lex(source).tokens;
  const open = toks.findIndex((t) => t.type === "lcurly" && t.end === plan.bodyStart);
  let depth = 0;
  let close = source.length;
  for (const t of toks.slice(open + 1)) {
    if (t.type === "lcurly") depth++;
    else if (t.type === "rcurly" && depth-- === 0) {
      close = t.start;
      break;
    }
  }
  const outer = /^[ \t]*/.exec(source.slice(lineStart(plan.bodyStart!)))![0];
  const indent = `${outer}  `;
  if (BLANK.test(source.slice(lineStart(close), close)) && lineStart(close) > 0) {
    const at = lineStart(close);
    return { at, wrap: (lines) => lines.map((l) => `${indent}${l}${eol}`).join("") };
  }
  // The brace shares its line: the statements go in before the blanks in front of it, which
  // then lead the brace's own new line — nothing authored is removed.
  const lead = source.slice(lineStart(close), close);
  const blanks = lead.length - lead.trimEnd().length;
  return {
    at: close - blanks,
    wrap: (lines) => `${lines.map((l) => `${eol}${indent}${l}`).join("")}${eol}${blanks === 0 ? outer : ""}`,
  };
}
