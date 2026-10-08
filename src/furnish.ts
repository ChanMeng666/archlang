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
 * **Fill only.** A room that holds any furniture is not touched. A room whose use is
 * unknown, or has no row in the table, is left alone. A polygon room and a multi-storey
 * plan are reported in `unresolved` and left as they are: `anchor` needs a rectangle, and
 * a position is never derived from a bounding box.
 *
 * **Never worse, per room.** A room's pieces are kept only when the plan with them compiles
 * and raises no diagnostic code (compile + lint, as a multiset) and no hard furniture
 * conflict it did not have before that room. Otherwise the next candidate is tried; when a
 * required piece cannot be placed the room is left empty and reported.
 *
 * **Bounded.** The candidate order is fixed, and the number of compile checks is at most
 * {@link furnishCheckBound} — linear in the rooms. There is no search loop and no randomness.
 */

import type { FurnitureAnchor, PlanNode, UseKind } from "./ast.js";
import { type AnalyzeOptions, resolvePlan, roomUses } from "./analyze.js";
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
import { defaultFootprint, fixtureSpec, frontClearanceMm, zoneFixtureCategories } from "./fixtures-catalog.js";
import { doorSwing, normal, sectorIntersectsRect, segmentsOfWall, sub, unit, type WallSegment } from "./geometry.js";
import { type BBox, doorLandingRect, rectsOverlap } from "./geometry/rect.js";
import type { RDoor, RFurniture, ROpening, ResolvedPlan, RRoom, RWall, RWindow } from "./ir.js";
import { lex } from "./lexer.js";
import { DEFAULT_RULESET } from "./lint.js";
import { fmtSource } from "./num-format.js";
import { parse } from "./parser.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { sourceConflicts } from "./repair.js";

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

/** How a piece is placed. */
export type FurnishPlacement =
  /** A services fixture on a wall: `against wall <id> offset <mm>`, the catalogued footprint. */
  | "wall"
  /** A free-standing piece with its back to a wall: `in <room> anchor <edge or corner> flush`. */
  | "back"
  /** In the middle of the room: `in <room> anchor center`. */
  | "centre"
  /** In front of the piece listed before it: the same edge anchor, `inset` past that piece. */
  | "front";

export interface FurnishItem {
  /** The catalogue word that is written. */
  category: string;
  /** Catalogue words tried, in order, when `category` cannot be placed. */
  or?: readonly string[];
  /** A required piece that cannot be placed leaves the whole room empty; an optional one is left out. */
  required: boolean;
  place: FurnishPlacement;
  /**
   * Footprints tried in order, `along` the wall × `depth` into the room, in mm. Absent =
   * the catalogue's own footprint. `finish` writes the one it used as an explicit `size`.
   */
  sizes?: readonly (readonly [along: number, depth: number])[];
}

const wet = zoneFixtureCategories("wet");
const kitchen = zoneFixtureCategories("kitchen");
/** A wet-room or kitchen fixture, admitted only when the catalogue lists it for that zone. */
const zoned = (zone: ReadonlySet<string>, required: boolean, category: string, ...or: string[]): FurnishItem[] => {
  const [first, ...rest] = [category, ...or].filter((c) => zone.has(c) && defaultFootprint(c) !== null);
  return first === undefined
    ? []
    : [{ category: first, ...(rest.length > 0 ? { or: rest } : {}), required, place: "wall" }];
};

/**
 * What goes in a room, by use. Every word is one `src/fixtures-catalog.ts` already has; the
 * wet-room and kitchen rows are read through the catalogue's own zones. A use with no row
 * (`hall`, `circulation`, `entry`, `storage`, `garage`) is never furnished.
 */
export const FURNISH_TABLE: Readonly<Partial<Record<UseKind, readonly FurnishItem[]>>> = Object.freeze({
  bedroom: [
    {
      category: "bed",
      required: true,
      place: "back",
      sizes: [
        [1500, 2000],
        [900, 2000],
      ],
    },
    {
      category: "wardrobe",
      required: false,
      place: "back",
      sizes: [
        [1800, 600],
        [1200, 600],
      ],
    },
  ],
  living: [
    {
      category: "sofa",
      required: true,
      place: "back",
      sizes: [
        [2000, 900],
        [1600, 900],
      ],
    },
    { category: "coffee_table", required: false, place: "front", sizes: [[1000, 600]] },
  ],
  dining: [
    {
      category: "dining_table",
      required: true,
      place: "centre",
      sizes: [
        [1800, 1500],
        [1400, 1300],
      ],
    },
  ],
  office: [
    {
      category: "desk",
      required: true,
      place: "back",
      sizes: [
        [1400, 700],
        [1200, 600],
      ],
    },
    { category: "office_chair", required: false, place: "front", sizes: [[500, 500]] },
  ],
  kitchen: [
    ...zoned(kitchen, true, "kitchen_sink"),
    ...zoned(kitchen, true, "stove"),
    ...zoned(kitchen, false, "fridge"),
  ],
  bath: [...zoned(wet, true, "wc"), ...zoned(wet, true, "basin"), ...zoned(wet, false, "bathtub", "shower")],
  wc: [...zoned(wet, true, "wc"), ...zoned(wet, true, "basin")],
  utility: fixtureSpec("washer")?.footprint ? [{ category: "washer", required: true, place: "wall" }] : [],
});

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
}
const DETAIL: Readonly<Record<string, Detail>> = {
  wardrobe: { front: 600, tall: true },
  sofa: { middle: true },
  coffee_table: { gap: 400 },
  desk: { middle: true },
  office_chair: { gap: 100, faces: true },
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

/** How deep a door's clear approach is kept, each side of its wall. */
const LANDING_MM = Math.max(DEFAULT_RULESET.doorwayLandingMm, 450);
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
  codes: Map<string, number>;
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

  if (resolved.levels.length > 0) {
    for (const l of resolved.levels)
      for (const room of emptyRooms(l.ir))
        note(
          room,
          `"${room.id}" (level ${l.level}) was not furnished — the furnish stage handles single-storey plans only`,
        );
    return none(unresolved);
  }

  const ir = resolved.ir;
  const todo = emptyRooms(ir);
  if (todo.length === 0) return none(unresolved);
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
    const gained = [...after.codes].filter(([code, n]) => n > (before.codes.get(code) ?? 0)).map(([code]) => code);
    if (gained.length > 0) return gained.sort();
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
    const items = itemsFor(uses);
    const site = new Site(room, walls, segs, passages, doors, windows);
    let budget = MAX_CHECKS_PER_ROOM;

    // First proposal: the first candidate of every piece that clears the room's geometry.
    const first: Placed[] = [];
    let missing: FurnishItem | null = null;
    for (const item of items) {
      const [c] = site.candidates(item, first);
      if (c) first.push(c);
      else if (item.required) {
        missing = item;
        break;
      }
    }
    if (missing) {
      note(
        room,
        `no position for the required \`${missing.category}\` in "${room.id}" clears its walls, its doors and the pieces before it — the room was left empty`,
      );
      continue;
    }
    if (first.length === 0) continue;
    budget--;
    let blocking = refusal(render(first.map((p) => p.text)));
    if (blocking === null) {
      accept(room, uses, first);
      continue;
    }

    // Refused: place the pieces one at a time, each kept only when the plan stays no worse.
    const kept: Placed[] = [];
    let failed: FurnishItem | null = null;
    for (const item of items) {
      let ok = false;
      let tries = MAX_CHECKS_PER_PIECE;
      for (const c of site.candidates(item, kept)) {
        if (tries === 0 || budget === 0) break;
        tries--;
        budget--;
        const why = refusal(render([...kept, c].map((p) => p.text)));
        if (why === null) {
          kept.push(c);
          ok = true;
          break;
        }
        blocking = why;
      }
      if (!ok && item.required) {
        failed = item;
        break;
      }
    }
    if (failed || kept.length === 0) {
      note(
        room,
        `furnishing "${room.id}" would raise ${blocking.join(", ")}, which the plan does not have now${failed ? ` (the required \`${failed.category}\` has no position that avoids it)` : ""} — the room was left empty`,
        blocking,
      );
      continue;
    }
    accept(room, uses, kept);
  }

  if (lines.length === 0) return none(unresolved, checks, todo.length);
  const text = where.wrap(lines);
  return {
    source: render([]),
    changes,
    unresolved,
    changed: true,
    checks,
    rooms: todo.length,
    insert: { at: where.at, text },
  };
}

/** A room's uses that have a row in the table, the use with the largest required footprint first. */
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
    .map((u, i) => ({ u, i, w: weight(u) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.u);
}

/** The pieces a set of uses asks for: the union, each catalogue word once, capped. */
function itemsFor(uses: readonly UseKind[]): FurnishItem[] {
  const seen = new Set<string>();
  const out: FurnishItem[] = [];
  for (const u of uses)
    for (const item of FURNISH_TABLE[u] ?? []) {
      if (seen.has(item.category)) continue;
      seen.add(item.category);
      out.push(item);
    }
  return out.slice(0, MAX_PIECES_PER_ROOM);
}

function footprints(category: string, item: FurnishItem): ReadonlyArray<readonly [number, number]> {
  if (item.sizes && category === item.category) return item.sizes;
  const fp = defaultFootprint(category);
  return fp ? [[fp.along, fp.depth]] : (item.sizes ?? []);
}

/** The rooms of one storey that hold no furniture and whose use has a row in the table. */
function emptyRooms(ir: ResolvedPlan): RRoom[] {
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  return ir.elements.filter((e): e is RRoom => {
    if (e.kind !== "room" || e._unplaced || usesOf(e).length === 0) return false;
    const box: BBox = { x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h };
    return !furniture.some((f) => f.room === e.id || rectsOverlap(box, { x: f.at.x, y: f.at.y, ...f.size }));
  });
}

// ---------------------------------------------------------------------------
// one room's geometry
// ---------------------------------------------------------------------------

/** One proposed piece. */
interface Placed {
  item: FurnishItem;
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
  ref: { id: string; segment: number | null; side: "left" | "right"; from: number; sign: 1 | -1 } | null;
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

  constructor(
    private readonly room: RRoom,
    walls: RWall[],
    segs: WallSegment[],
    private readonly passages: ReadonlyArray<RDoor | ROpening>,
    private readonly doors: readonly RDoor[],
    windows: readonly RWindow[],
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

  /** Every position for `item` that clears the room's geometry and `placed`, in the fixed order. */
  candidates(item: FurnishItem, placed: readonly Placed[]): Placed[] {
    const out: Placed[] = [];
    for (const category of [item.category, ...(item.or ?? [])]) {
      const detail = DETAIL[category] ?? {};
      for (const [along, depth] of footprints(category, item)) {
        const here: Placed[] = [];
        const late: Placed[] = [];
        const offer = (p: Placed | null, e: Edge | null): void => {
          if (!p || !this.fits(p, placed)) return;
          const glazed = e?.windows.some(([lo, hi]) => Math.min(hi, p.hi) - Math.max(lo, p.lo) > 1);
          if (!glazed) here.push(p);
          else if (!detail.tall) late.push(p);
        };
        if (item.place === "centre") {
          const wide = this.clear.x1 - this.clear.x0 >= this.clear.y1 - this.clear.y0;
          for (const turned of wide ? [false, true] : [true, false])
            offer(this.centred(item, category, along, depth, turned), null);
          // The middle is some door's swing: stand it off the middle of a wall instead.
          for (const e of this.edges) offer(this.anchored(item, category, e, 1, along, depth, OFF_WALL_MM), null);
        } else if (item.place === "front") {
          const behind = placed[placed.length - 1];
          const e = behind?.middle ? this.edges.find((x) => x.edge === behind.edge) : undefined;
          if (behind && e)
            offer(this.anchored(item, category, e, 1, along, depth, behind.depth + (detail.gap ?? 0)), e);
        } else {
          const behind = placed[placed.length - 1];
          const next = detail.run && behind?.against ? this.edges.find((x) => x.edge === behind.edge) : undefined;
          if (next) {
            offer(this.against(item, category, next, behind!.hi + along / 2, along, depth), next);
            offer(this.against(item, category, next, behind!.lo - along / 2, along, depth), next);
          }
          for (const e of this.edges)
            for (const slot of detail.middle ? ([1, 0, 2] as const) : ([0, 2, 1] as const)) {
              if (item.place === "wall" && e.ref) {
                const c = slot === 0 ? e.segLo + along / 2 : slot === 2 ? e.segHi - along / 2 : (e.segLo + e.segHi) / 2;
                offer(this.against(item, category, e, c, along, depth), e);
              } else offer(this.anchored(item, category, e, slot, along, depth, 0), e);
            }
        }
        out.push(...here, ...late);
      }
    }
    return out;
  }

  /** `against wall <id> offset <mm>`: a services fixture centred at `c` along the edge. */
  private against(
    item: FurnishItem,
    category: string,
    e: Edge,
    c: number,
    along: number,
    depth: number,
  ): Placed | null {
    const ref = e.ref;
    if (!ref || !e.seg) return null;
    const offset = Math.round((c - ref.from) * ref.sign);
    const centre = ref.from + offset * ref.sign;
    if (centre - along / 2 < e.segLo - EPS || centre + along / 2 > e.segHi + EPS) return null;
    const line = e.horizontal ? e.seg.a.y : e.seg.a.x;
    const inward = e.edge === "top" || e.edge === "left" ? 1 : -1;
    const near = line + (inward * e.seg.thickness) / 2;
    const rect = this.rectAt(e, centre - along / 2, inward > 0 ? near : near - depth, along, depth);
    const text = [
      `furniture ${category} against wall ${ref.id}`,
      ...(ref.segment !== null ? [`segment ${ref.segment}`] : []),
      `offset ${fmtSource(offset)} side ${ref.side} in ${this.room.id}`,
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
  ): Placed | null {
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
  private centred(item: FurnishItem, category: string, along: number, depth: number, turned: boolean): Placed {
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
  ): Placed {
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
      if (swing && sectorIntersectsRect(swing, p.rect, DEFAULT_RULESET.swingClearanceMm)) return false;
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
