/**
 * Stair safety (plan-soundness PS2.11e, the stair bullets, and PS2.34): a door swinging over a
 * flight or its landing, a flight with no landing at its foot or head, a doorway onto a flight's
 * side, a void where a flight arrives, and a flight too short to climb its storey.
 *
 * Every rule reads facts the plan states: the stair's footprint (`at`, `size`), its flight width
 * (`width`, else the footprint's cross extent) and its `dir`, which fix the flight's axis and the
 * end it is entered from (`tailEdge`, `src/vertical.ts`); the same id on the storey below
 * ({@link import("../context.js").BuildingContext.shaftNeighbours}); door swings (`doorSwing`, the
 * one quarter-disc the renderer draws); wall bodies; `void` footprints; and the storey height,
 * read only where the plan authors one (`describe().heights`).
 *
 * **Which end is which.** On a storey where a flight is `dir up` it is entered at its FOOT; where
 * it is `dir down`, at its HEAD (the floor you step off onto from the flight below). A storey
 * whose run continues upward from a flight arriving from below (`townhouse`'s middle storey) owes
 * both: the foot it is boarded at and the head the flight below arrives at, read off that run's
 * own tail as `arrivalRuns` reads it.
 *
 * **The landing** is the square beyond an end as wide as the flight and as deep as it is wide:
 * Approved Document K (2013) 1.20, "At the top and bottom of every flight, provide landings the
 * width and length at least as great as the smallest width of the flight" [V]; 1.21b, kept clear
 * of permanent obstructions [V]. In a building other than a dwelling it is at least 1200 mm long
 * (1.23a) [V]. The flight band is centred in the footprint (`stairGlyph`).
 */

import type { Point } from "../../ast.js";
import { pointInRoomBox } from "../../analyze.js";
import { det, oppositeSide, type Side } from "../../algebra/d4.js";
import type { Diagnostic } from "../../diagnostics.js";
import {
  doorSwing,
  type DoorSwing,
  normal,
  sectorIntersectsRect,
  sub,
  unit,
  type WallSegment,
} from "../../geometry.js";
import { VERTEX_EPS } from "../../geometry/polygon.js";
import { type BBox, rectsOverlap } from "../../geometry/rect.js";
import type { RDoor, ROpening, RStair, RVoid } from "../../ir.js";
import { roomOfVertical, runAxis, tailEdge } from "../../vertical.js";
import { openingClauseOf, wallRef } from "../../wall-ref.js";
import { rectToArc } from "../clearance-measure.js";
import { judgesAsDwelling, type LintContext, type LintRule } from "../context.js";
import { openingName, wallPhrase } from "../element-phrases.js";
import { deficitMm, mm } from "../measure.js";
import { MODEL_RANGE_MM } from "../../num-format.js";

/** The clear depth a door's swing must leave at the foot of a flight in a dwelling: Approved
 *  Document K (2013) 1.24 and Diagram 1.8, "at least 400mm" across the flight's width [V]. */
export const FOOT_DOOR_CLEAR_MM = 400;

/** The least landing length in a building other than a dwelling: Approved Document K (2013)
 *  1.23a, "an unobstructed length a minimum of 1200mm on each landing" [V]. */
export const NON_DWELLING_LANDING_MM = 1200;

/**
 * The most counted work the stair rules spend on one storey before they decline it (`stair-budget`
 * coverage skip), charged BEFORE the work: one unit per (landing, wall piece / void / room) the
 * landing measure reads, per (door, stair) and per (door or opening, stair) pair the swing and
 * side-entry rules compare. A count, never a time. The busiest shipped plan spends a few hundred;
 * three hundred stairs, doors and walls on one storey about two hundred thousand.
 */
export const MAX_STAIR_WORK = 2_000_000;

/** One end of a flight this storey owes a landing, read on the footprint of the flight it ends. */
interface Landing {
  end: "foot" | "head";
  edge: Side;
  /** The footprint of the flight this end belongs to: this storey's run, or, for the head a flight
   *  from the storey below arrives at, that lower flight's footprint. */
  rect: BBox;
  /** That flight's width. */
  width: number;
}

/** A stair's footprint rectangle. */
const rectOf = (v: { at: Point; size: { w: number; h: number } }): BBox => ({
  x: v.at.x,
  y: v.at.y,
  w: v.size.w,
  h: v.size.h,
});

/** The run's length along its flight axis. */
const runLength = (v: RStair): number => (runAxis(v) === "y" ? v.size.h : v.size.w);

/**
 * The rectangle beyond edge `e` of `r`, `depth` deep and `width` wide, centred on the edge (the
 * flight band is centred in the footprint).
 */
function beyond(r: BBox, e: Side, depth: number, width: number): BBox {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (e) {
    case "bottom":
      return { x: cx - width / 2, y: r.y + r.h, w: width, h: depth };
    case "top":
      return { x: cx - width / 2, y: r.y - depth, w: width, h: depth };
    case "right":
      return { x: r.x + r.w, y: cy - width / 2, w: depth, h: width };
    case "left":
      return { x: r.x - depth, y: cy - width / 2, w: depth, h: width };
  }
}

/** How far `p` stands beyond edge `e` of `r`, outward (negative inside the footprint). */
function pastEdge(r: BBox, e: Side, p: Point): number {
  switch (e) {
    case "bottom":
      return p.y - (r.y + r.h);
    case "top":
      return r.y - p.y;
    case "right":
      return p.x - (r.x + r.w);
    case "left":
      return r.x - p.x;
  }
}

/** The point `d` beyond the centre of edge `e` of `r`. */
function outFrom(r: BBox, e: Side, d: number): Point {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (e === "bottom") return { x: cx, y: r.y + r.h + d };
  if (e === "top") return { x: cx, y: r.y - d };
  if (e === "right") return { x: r.x + r.w + d, y: cy };
  return { x: r.x - d, y: cy };
}

/** A rectangle shrunk by `by` on every side: a touch is not an overlap. */
const inset = (r: BBox, by: number): BBox => ({ x: r.x + by, y: r.y + by, w: r.w - 2 * by, h: r.h - 2 * by });

/**
 * The ends of `v` this storey owes a landing: the end it is entered from here (its foot when it
 * goes up, its head when it comes down), plus the head of the flight arriving from the storey
 * below when that flight goes up along the same axis and ends somewhere else: a run that continues
 * upward from where the flight below arrives. That head is read on the LOWER flight's footprint,
 * where it actually ends. The other end of a `dir up` flight is on the storey above, not here.
 */
function landingsOf(v: RStair, ctx: LintContext): Landing[] {
  const tail = tailEdge(v);
  const own = rectOf(v);
  const out: Landing[] = [{ end: v.dir === "up" ? "foot" : "head", edge: tail, rect: own, width: v.width }];
  const below = ctx.building.shaftNeighbours?.get(v.id)?.below?.run;
  if (below && below.kind === "stair" && below.dir === "up" && runAxis(below) === runAxis(v)) {
    const head = oppositeSide(tailEdge(below));
    const rect = rectOf(below);
    const same = head === tail && rect.x === own.x && rect.y === own.y && rect.w === own.w && rect.h === own.h;
    if (!same) out.push({ end: "head", edge: head, rect, width: (below as RStair).width });
  }
  return out;
}

/** The clear headroom over a flight and its landings: Approved Document K (2013) 1.11 and
 *  Diagram 1.3, "at least 2m" [V]. What a person walking beside a rising flight passes under. */
export const STAIR_HEADROOM_MM = 2000;

/** The landing length this building asks of a flight `width` wide: the width, and in a building
 *  other than a dwelling at least {@link NON_DWELLING_LANDING_MM} (D6, `judgesAsDwelling`). */
const landingDepth = (width: number, ctx: LintContext): number =>
  judgesAsDwelling(ctx) ? width : Math.max(width, NON_DWELLING_LANDING_MM);

/** How a message names a stair: by the room it stands in, else where it stands; the storey on a
 *  plan of several. Never its id (the id is in the hint). */
function stairName(v: RStair, ctx: LintContext): string {
  const roomId = roomOfVertical(v, ctx.rooms);
  const room = roomId === null ? undefined : ctx.rooms.find((r) => r.id === roomId);
  const where = room ? `in ${ctx.nameOf(room)}` : ctx.placeAt({ x: v.at.x + v.size.w / 2, y: v.at.y + v.size.h / 2 });
  const lv = (ctx.building.storeyCount ?? 1) > 1 && ctx.ir.level !== undefined ? ` on level ${ctx.ir.level}` : "";
  return `the stair ${where}${lv}`;
}

/** How a HINT names a door or opening an author can edit: its id when written (`` `d1` ``), the
 *  `open between` clause that derived it, else the phrase its message uses. */
function connectorRef(ctx: LintContext, c: RDoor | ROpening): string {
  const clause = openingClauseOf(c);
  if (clause !== undefined) return clause;
  if (c.kind === "door" && c._idAuthored !== true) return openingName(ctx, c);
  return `\`${c.id}\``;
}

const stepWord = (end: Landing["end"]): string => (end === "foot" ? "bottom step" : "top step");

// ── The shared measure, once per storey ─────────────────────────────────────

/** A wall's straight body as a quad, a cased opening's span cut out. */
interface WallBody {
  seg: WallSegment;
  quad: Point[];
}

/** What first stands in a landing, and how far past the step. */
interface LandingBlock {
  depth: number;
  what: { wall: WallSegment } | { void: RVoid } | { noFloor: true };
}

/** One stair's facts, measured once per storey for every rule. */
interface StairFacts {
  v: RStair;
  landings: Landing[];
  /** The footprint is a stairwell here (a flight comes down from, or arrives at, this storey). */
  well: boolean;
  /** Per landing: what cuts it short (`null` when the full depth is clear), or `"curved"` when a
   *  curved wall stands near it and it is not judged. */
  blocks: Array<LandingBlock | null | "curved">;
  /** The landing depth the building asks of each landing. */
  needs: number[];
}

/** Everything the stair rules read on one storey, or `null` past {@link MAX_STAIR_WORK}. */
interface StoreyStairs {
  stairs: StairFacts[];
  /** Work left for the pairwise rules, a count. */
  left: number;
}

const FACTS = new WeakMap<LintContext, StoreyStairs | null>();

/**
 * The stair facts of `ctx`'s storey, measured once and shared by the five rules (memoised on the
 * context). `null` when there is no stair, or when measuring the landings would pass
 * {@link MAX_STAIR_WORK} (the caller files `stair-budget`).
 */
function storeyStairs(ctx: LintContext): StoreyStairs | null {
  if (FACTS.has(ctx)) return FACTS.get(ctx)!;
  const stairs = ctx.verticals.filter((v): v is RStair => v.kind === "stair");
  let result: StoreyStairs | null = null;
  if (stairs.length > 0) {
    const landings = stairs.map((v) => landingsOf(v, ctx));
    const nLandings = landings.reduce((a, l) => a + l.length, 0);
    // Charged before any of it runs: every landing reads every wall piece, void and room once.
    const cost = nLandings * (ctx.wallSegs.length + ctx.openings.length + ctx.voids.length + ctx.rooms.length + 1);
    if (cost <= MAX_STAIR_WORK) {
      const bodies = wallBodies(ctx);
      const arcs = ctx.wallSegs.filter((s) => s.arc !== undefined);
      result = {
        left: MAX_STAIR_WORK - cost,
        stairs: stairs.map((v, i) => {
          const ls = landings[i]!;
          const needs = ls.map((l) => landingDepth(l.width, ctx));
          return {
            v,
            landings: ls,
            well: ls.some((l) => l.end === "head"),
            needs,
            blocks: ls.map((l, j) => {
              const zone = beyond(l.rect, l.edge, needs[j]!, l.width);
              if (arcs.some((s) => rectToArc(zone, s.arc!) < s.thickness / 2)) return "curved" as const;
              return landingBlock(l, needs[j]!, ctx, bodies);
            }),
          };
        }),
      };
    }
  }
  FACTS.set(ctx, result);
  return result;
}

/**
 * Take `n` units of the storey's pairwise work, or report that it is spent. Charged before the
 * pairs are compared, so a rule either judges every pair or none.
 */
function charge(f: StoreyStairs, n: number): boolean {
  if (n > f.left) return false;
  f.left -= n;
  return true;
}

/** Shared entry of the rules: the storey's stair facts, filing the skip that explains a `null`. */
function factsFor(ctx: LintContext): StoreyStairs | null {
  if (!ctx.verticals.some((v) => v.kind === "stair")) return null;
  const f = storeyStairs(ctx);
  if (f === null) ctx.skip("stair-budget");
  return f;
}

/**
 * The part of a stair's footprint that stands in the way at floor level of something `height` tall.
 * A stairwell (`well`) is a hole: all of it. Where the flight rises from this floor, only its low
 * end: the treads climb the storey height over the run, so a door leaf `height` tall swings, and a
 * person walks, under the part of the flight higher than that (the pitch line, Diagram 1.3). The
 * storey height is `ir.storeyHeight`: the authored `height`, else 3000 mm (`STOREY_HEIGHT`), a
 * default that can only narrow what is judged.
 */
function lowPart(f: StairFacts, height: number, ctx: LintContext): BBox {
  const r = rectOf(f.v);
  if (f.well) return r;
  const len = runLength(f.v);
  const reach = Math.min(len, (len * height) / ctx.ir.storeyHeight);
  switch (tailEdge(f.v)) {
    case "bottom":
      return { x: r.x, y: r.y + r.h - reach, w: r.w, h: reach };
    case "top":
      return { x: r.x, y: r.y, w: r.w, h: reach };
    case "right":
      return { x: r.x + r.w - reach, y: r.y, w: reach, h: r.h };
    case "left":
      return { x: r.x, y: r.y, w: reach, h: r.h };
  }
}

// ── W_SWING_OVER_STAIR ──────────────────────────────────────────────────────

/** Where a swing meets a stair, worst first. */
type SwingHit = "flight" | "head" | "foot";

/**
 * The first place swing `s` sweeps over a stair or the floor it owes, or null. A touch is not an
 * overlap: the rectangles are taken in by 1 mm. A landing is read only as deep as its floor stands
 * clear (the shared {@link landingBlock}): a door on the far side of the wall that cuts a landing
 * short is behind that wall, and the short landing is `W_STAIR_NO_LANDING`'s report. A landing a
 * curved wall stands near is not judged.
 */
function swingHit(s: DoorSwing, head: number, f: StairFacts, ctx: LintContext): SwingHit | null {
  if (sectorIntersectsRect(s, inset(lowPart(f, head, ctx), 1), 0)) return "flight";
  const dwelling = judgesAsDwelling(ctx);
  const sweeps = (i: number, depth: number): boolean => {
    const l = f.landings[i]!;
    const b = f.blocks[i]!;
    if (b === "curved") return false;
    const clear = Math.min(depth, b?.depth ?? f.needs[i]!);
    return clear > 1 && sectorIntersectsRect(s, inset(beyond(l.rect, l.edge, clear, l.width), 1), 0);
  };
  for (let i = 0; i < f.landings.length; i++)
    if (f.landings[i]!.end === "head" && sweeps(i, f.needs[i]!)) return "head";
  // A dwelling's door may swing across the foot landing if it leaves 400 mm clear (AD K 1.24);
  // elsewhere no door swings across a landing (1.23b).
  for (let i = 0; i < f.landings.length; i++)
    if (f.landings[i]!.end === "foot" && sweeps(i, dwelling ? FOOT_DOOR_CLEAR_MM : f.needs[i]!)) return "foot";
  return null;
}

/**
 * `W_SWING_OVER_STAIR`: a hinged leaf's quarter-disc over the flight, the head landing, or the foot's
 * 400 mm strip (a dwelling) or whole foot landing (elsewhere). On a storey the flight RISES from, only
 * the part of it lower than the door's `head` counts ({@link lowPart}), read against `ir.storeyHeight`,
 * which is 3000 mm (`STOREY_HEIGHT`) when the plan authors no height: a default used only to decide
 * which treads a leaf passes under, so it can only make this rule quieter, never louder.
 */
export const swingOverStair: LintRule = {
  name: "swing-over-stair",
  family: "stairs",
  layer: "validity",
  stage: "openings",
  codes: ["W_SWING_OVER_STAIR"],
  check(ctx: LintContext): Diagnostic[] {
    const f = factsFor(ctx);
    if (f === null) return [];
    const swings = ctx.doors.flatMap((d) => {
      const s = doorSwing(d);
      return s ? [{ d, s }] : [];
    });
    // Each pair is compared up to three times (the swing and its two alternatives).
    if (!charge(f, swings.length * f.stairs.length * 3)) {
      ctx.skip("stair-budget");
      return [];
    }
    const out: Diagnostic[] = [];
    const dwelling = judgesAsDwelling(ctx);
    for (const { d, s } of swings) {
      for (const sf of f.stairs) {
        const v = sf.v;
        const hit = swingHit(s, d.head, sf, ctx);
        if (hit === null) continue;
        const headNeed = sf.needs[sf.landings.findIndex((l) => l.end === "head")] ?? sf.needs[0]!;
        const where =
          hit === "flight"
            ? "its open leaf sweeps the flight itself"
            : hit === "head"
              ? `its open leaf sweeps the landing at the head of the flight, the ${mm(headNeed)} mm a person steps off onto`
              : dwelling
                ? `its open leaf comes within ${mm(FOOT_DOOR_CLEAR_MM)} mm of the bottom step, the clear space a door at the foot of a flight must leave across its width`
                : "its open leaf sweeps the landing at the foot of the flight, which no door of a building other than a dwelling may swing across";
        const clears = (alt: RDoor): boolean => {
          const sw = doorSwing(alt);
          return sw !== null && swingHit(sw, d.head, sf, ctx) === null;
        };
        const hingeClears = clears({ ...d, hinge: d.hinge === "left" ? "right" : "left" });
        const sideClears = clears({ ...d, swing: d.swing === "in" ? "out" : "in" });
        // The swing as WRITTEN: `door.transform` flips `swing` under a reflecting frame.
        const g = ctx.frameOf(d);
        const written = g !== null && det(g) < 0 ? (d.swing === "in" ? "out" : "in") : d.swing;
        const ref = connectorRef(ctx, d);
        out.push({
          severity: "warning",
          code: "W_SWING_OVER_STAIR",
          ...ctx.at(d),
          message: `${capitalise(openingName(ctx, d))} swings over ${stairName(v, ctx)}: ${where}.`,
          hints: [
            `Open ${ref} to the other side of its wall — \`swing ${written === "in" ? "out" : "in"}\`${sideClears ? " (this clears the stair)" : ""} — or hang it on the other jamb (the other \`hinge\`)${hingeClears ? " (this clears the stair)" : ""}.`,
            `Or move ${ref} along its wall, or the stair \`${v.id}\`, so the swing stays off the flight and its landings; a \`sliding\` or \`pocket\` door sweeps nothing.`,
          ],
        });
      }
    }
    return out;
  },
};

// ── W_STAIR_NO_LANDING ──────────────────────────────────────────────────────

/** A convex polygon clipped to an axis-aligned rectangle (Sutherland–Hodgman); empty when they
 *  do not meet. Exact for the axis-aligned rectangles and wall quads it is given. */
function clipToRect(poly: readonly Point[], r: BBox): Point[] {
  let pts: Point[] = [...poly];
  const planes: Array<(p: Point) => number> = [
    (p) => p.x - r.x,
    (p) => r.x + r.w - p.x,
    (p) => p.y - r.y,
    (p) => r.y + r.h - p.y,
  ];
  for (const f of planes) {
    if (pts.length === 0) break;
    const next: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const fa = f(a);
      const fb = f(b);
      if (fa >= 0) next.push(a);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    pts = next;
  }
  return pts;
}

/** A wall's straight body as quads, with each leaf-less cased opening's span cut out (a doorway
 *  with no leaf is passable; a door's closed leaf stands in the wall, so it stays). A curved wall
 *  is not here: a landing it stands near is not judged (`curved-landing-wall`). */
function wallBodies(ctx: LintContext): WallBody[] {
  const out: WallBody[] = [];
  for (const seg of ctx.wallSegs) {
    if (seg.arc) continue;
    const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
    if (len <= 0) continue;
    const dir = unit(sub(seg.b, seg.a));
    const n = normal(dir);
    const h = seg.thickness / 2;
    // The spans of this segment's cased openings, as [from, to] along it.
    const cuts: Array<[number, number]> = [];
    for (const o of ctx.openings as ROpening[]) {
      const host = o.host;
      if (!host || host.wallId !== seg.wallId || host.index !== seg.index) continue;
      const t = (o.at.x - seg.a.x) * dir.x + (o.at.y - seg.a.y) * dir.y;
      cuts.push([t - o.width / 2, t + o.width / 2]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let from = 0;
    const pieces: Array<[number, number]> = [];
    for (const [c0, c1] of cuts) {
      if (c0 > from) pieces.push([from, Math.min(c0, len)]);
      from = Math.max(from, c1);
    }
    if (from < len) pieces.push([from, len]);
    for (const [t0, t1] of pieces) {
      if (t1 - t0 <= VERTEX_EPS) continue;
      const p0 = { x: seg.a.x + dir.x * t0, y: seg.a.y + dir.y * t0 };
      const p1 = { x: seg.a.x + dir.x * t1, y: seg.a.y + dir.y * t1 };
      out.push({
        seg,
        quad: [
          { x: p0.x + n.x * h, y: p0.y + n.y * h },
          { x: p1.x + n.x * h, y: p1.y + n.y * h },
          { x: p1.x - n.x * h, y: p1.y - n.y * h },
          { x: p0.x - n.x * h, y: p0.y - n.y * h },
        ],
      });
    }
  }
  return out;
}

/**
 * How deep the floor stands clear beyond landing `l`'s step, up to `need`: the nearest wall body
 * (cased openings cut out) or, at a foot, `void`, met across the MIDDLE HALF of the flight's width
 * (so a flank wall drawn to the flight's edge, or 50 mm into it, is not read as standing across
 * it), and the floor itself: the point halfway to that depth must lie in a room. `null` when the
 * full depth is clear.
 */
function landingBlock(l: Landing, need: number, ctx: LintContext, bodies: readonly WallBody[]): LandingBlock | null {
  const r = l.rect;
  const probe = beyond(r, l.edge, need, l.width / 2);
  let best: LandingBlock | null = null;
  const consider = (poly: readonly Point[], what: LandingBlock["what"]): void => {
    const clipped = clipToRect(poly, probe);
    if (clipped.length < 3) return;
    let d = Infinity;
    for (const p of clipped) d = Math.min(d, pastEdge(r, l.edge, p));
    d = Math.max(0, d);
    if (d + VERTEX_EPS < need && (best === null || d < best.depth)) best = { depth: d, what };
  };
  for (const b of bodies) consider(b.quad, { wall: b.seg });
  if (l.end === "foot")
    for (const vd of ctx.voids)
      consider(
        [
          { x: vd.at.x, y: vd.at.y },
          { x: vd.at.x + vd.size.w, y: vd.at.y },
          { x: vd.at.x + vd.size.w, y: vd.at.y + vd.size.h },
          { x: vd.at.x, y: vd.at.y + vd.size.h },
        ],
        { void: vd },
      );
  // The floor: halfway to the measured depth, on the flight's centreline, must be in a room.
  const blocked = best as LandingBlock | null;
  const clear = blocked === null ? need : blocked.depth;
  if (clear > 0 && ctx.rooms.length > 0) {
    const p = outFrom(r, l.edge, clear / 2);
    const onFloor = ctx.rooms.some((room) => {
      const box = ctx.roomRects.get(room.id);
      return box !== undefined && pointInRoomBox(p, box);
    });
    if (!onFloor) return { depth: 0, what: { noFloor: true } };
  }
  return blocked;
}

export const stairNoLanding: LintRule = {
  name: "stair-no-landing",
  family: "stairs",
  layer: "validity",
  stage: "walls",
  codes: ["W_STAIR_NO_LANDING"],
  check(ctx: LintContext): Diagnostic[] {
    const f = factsFor(ctx);
    if (f === null) return [];
    const out: Diagnostic[] = [];
    for (const sf of f.stairs) {
      const v = sf.v;
      sf.landings.forEach((l, i) => {
        const b = sf.blocks[i]!;
        if (b === "curved") {
          ctx.skip("curved-landing-wall");
          return;
        }
        if (b === null) return;
        const need = sf.needs[i]!;
        const m = deficitMm(need, b.depth);
        const what =
          "noFloor" in b.what
            ? "there is no floor"
            : "void" in b.what
              ? `a void opens ${m.available} mm past the ${stepWord(l.end)}`
              : `${wallPhrase(b.what.wall)} stands ${m.available} mm past the ${stepWord(l.end)}`;
        const blocker =
          "wall" in b.what
            ? ` or ${wallRef(ctx.ir.walls, b.what.wall)}`
            : "void" in b.what
              ? ` or the void \`${b.what.void.id}\``
              : "";
        out.push({
          severity: "warning",
          code: "W_STAIR_NO_LANDING",
          ...ctx.at(v),
          message: `${capitalise(stairName(v, ctx))} has no landing at its ${l.end}: ${what}, where a landing as long as the flight is wide needs ${m.required} mm (${m.short} mm short).`,
          hints: [
            `Move or shorten \`${v.id}\`${blocker} so ${m.required} mm of floor, ${mm(l.width)} mm wide, stands clear beyond its ${l.end}; a flight is stepped off straight ahead, not into a wall or a turn.`,
          ],
        });
      });
    }
    return out;
  },
};

// ── W_STAIR_SIDE_ENTRY ──────────────────────────────────────────────────────

/**
 * `W_STAIR_SIDE_ENTRY`: a doorway beside the part of a flight a person cannot pass under, with less
 * than a doorway's width of it past either end, nearer than `minPathClearWidthMm`. On a storey the
 * flight rises from, that part is the run up to 2 m of rise ({@link STAIR_HEADROOM_MM}), read
 * against `ir.storeyHeight`, 3000 mm (`STOREY_HEIGHT`) when the plan authors no height: a default
 * that only narrows what is judged, never widens it.
 */
export const stairSideEntry: LintRule = {
  name: "stair-side-entry",
  family: "stairs",
  layer: "validity",
  stage: "openings",
  codes: ["W_STAIR_SIDE_ENTRY"],
  check(ctx: LintContext): Diagnostic[] {
    const f = factsFor(ctx);
    if (f === null) return [];
    if (!charge(f, ctx.connectors.length * f.stairs.length)) {
      ctx.skip("stair-budget");
      return [];
    }
    const out: Diagnostic[] = [];
    const min = ctx.rules.minPathClearWidthMm;
    for (const c of ctx.connectors) {
      const host = c.host;
      if (!host || host.arc) continue;
      const vertical = host.a.x === host.b.x && host.a.y !== host.b.y;
      const horizontal = host.a.y === host.b.y && host.a.x !== host.b.x;
      if (!vertical && !horizontal) continue;
      for (const sf of f.stairs) {
        const v = sf.v;
        const axis = runAxis(v);
        // A wall along the flight: vertical for a flight up the page, horizontal across it.
        if ((axis === "y") !== vertical) continue;
        // The part of the flight a person stepping through cannot pass under.
        const r = lowPart(sf, STAIR_HEADROOM_MM, ctx);
        const [lo, hi, mid] = axis === "y" ? [r.y, r.y + r.h, c.at.y] : [r.x, r.x + r.w, c.at.x];
        const c0 = mid - c.width / 2;
        const c1 = mid + c.width / 2;
        // Beside the flight at all, and is a usable doorway left past either end of it?
        if (Math.min(c1, hi) - Math.max(c0, lo) <= VERTEX_EPS) continue;
        const past = Math.max(0, Math.min(c1, lo) - c0, c1 - Math.max(c0, hi));
        if (past + VERTEX_EPS >= Math.min(ctx.rules.minDoorWidthMm, c.width)) continue;
        const [flo, fhi, line] = axis === "y" ? [r.x, r.x + r.w, host.a.x] : [r.y, r.y + r.h, host.a.y];
        const half = host.thickness / 2;
        let gap: number;
        if (line >= fhi) gap = line - half - fhi;
        else if (line <= flo) gap = flo - (line + half);
        else continue; // a wall through the footprint is another defect
        gap = Math.max(0, gap);
        if (gap + VERTEX_EPS >= min) continue;
        const m = deficitMm(min, gap);
        const kind = c.kind === "door" ? "door" : "opening";
        const ref = connectorRef(ctx, c);
        out.push({
          severity: "warning",
          code: "W_STAIR_SIDE_ENTRY",
          ...ctx.at(c),
          message: `${capitalise(openingName(ctx, c))} opens onto the side of ${stairName(v, ctx)}, ${m.available} mm from the flight: less than the ${m.required} mm a person needs to step through and turn, and a flight is entered at its foot or head, from a landing.`,
          hints: [
            `Move ${ref.startsWith("`") ? `the ${kind} ${ref}` : ref} along its wall past the end of \`${v.id}\`, or move the stair so at least ${m.required} mm stand between the doorway and the flight.`,
          ],
        });
      }
    }
    return out;
  },
};

// ── W_STAIR_HEAD_VOID ───────────────────────────────────────────────────────

export const stairHeadVoid: LintRule = {
  name: "stair-head-void",
  family: "stairs",
  layer: "validity",
  stage: "rooms",
  codes: ["W_STAIR_HEAD_VOID"],
  check(ctx: LintContext): Diagnostic[] {
    if (ctx.voids.length === 0) return [];
    const f = factsFor(ctx);
    if (f === null) return [];
    const out: Diagnostic[] = [];
    for (const sf of f.stairs) {
      const v = sf.v;
      sf.landings.forEach((l, i) => {
        if (l.end !== "head") return;
        const need = sf.needs[i]!;
        const zone = beyond(l.rect, l.edge, need, l.width);
        const hole = ctx.voids.find((vd) => rectsOverlap(rectOf(vd), zone));
        if (!hole) return;
        const corners: Point[] = [
          { x: hole.at.x, y: hole.at.y },
          { x: hole.at.x + hole.size.w, y: hole.at.y },
          { x: hole.at.x, y: hole.at.y + hole.size.h },
          { x: hole.at.x + hole.size.w, y: hole.at.y + hole.size.h },
        ];
        const gap = Math.max(0, Math.min(...corners.map((p) => pastEdge(l.rect, l.edge, p))));
        const m = deficitMm(need, gap);
        out.push({
          severity: "warning",
          code: "W_STAIR_HEAD_VOID",
          ...ctx.at(v),
          message: `A void opens on the landing at the head of ${stairName(v, ctx)}: the floor ends ${m.available} mm past the top step, where a person stepping off the flight needs ${m.required} mm (${m.short} mm short).`,
          hints: [
            `Move the void \`${hole.id}\` clear of the ${m.required} × ${mm(l.width)} mm landing beyond the head of \`${v.id}\` (beside the stairwell, or drawn as the stairwell itself), or shrink it.`,
          ],
        });
      });
    }
    return out;
  },
};

// ── W_STAIR_TOO_STEEP ───────────────────────────────────────────────────────

/** The figures {@link minimumRun} reads, from the ruleset. */
interface StairLimits {
  stairMaxRiseMm: number;
  stairMinGoingMm: number;
  stairMaxPitchRatio: number | null;
}

/** Can {@link minimumRun} judge with these limits? A riser limit finite and above zero, a going
 *  finite and not negative, a pitch cap absent or finite and above zero. Anything else (a caller's
 *  `ruleset` override) is declined: no loop, no `Infinity` or `NaN` in a message. */
export function stairLimitsValid(rules: StairLimits): boolean {
  const { stairMaxRiseMm: r, stairMinGoingMm: g, stairMaxPitchRatio: p } = rules;
  return Number.isFinite(r) && r > 0 && Number.isFinite(g) && g >= 0 && (p === null || (Number.isFinite(p) && p > 0));
}

/**
 * The shortest run (mm) a straight flight climbing `rise` needs under the ruleset: the fewest
 * risers no higher than `stairMaxRiseMm` (fewer risers mean fewer goings, so the shortest run),
 * each going at least `stairMinGoingMm` and, with a pitch cap, at least the riser over it. One
 * going fewer than risers: the top step is the floor above. Closed form: one `ceil` and one
 * correction for floating-point dust, no loop and no trigonometry. `null` when the limits or the
 * rise cannot be judged ({@link stairLimitsValid}; a rise finite and above zero) or the run is not
 * finite or longer than the modelling range (`MODEL_RANGE_MM`).
 */
export function minimumRun(
  rise: number,
  rules: StairLimits,
): { risers: number; riser: number; going: number; run: number } | null {
  if (!stairLimitsValid(rules) || !Number.isFinite(rise) || rise <= 0) return null;
  const max = rules.stairMaxRiseMm;
  let n = Math.max(1, Math.ceil(rise / max));
  if (n > 1 && (n - 1) * max >= rise) n -= 1;
  else if (n * max < rise) n += 1;
  const riser = rise / n;
  const going = Math.max(
    rules.stairMinGoingMm,
    rules.stairMaxPitchRatio === null ? 0 : riser / rules.stairMaxPitchRatio,
  );
  const run = (n - 1) * going;
  // A run longer than anything the plan can draw is no measurement to quote.
  if (!Number.isFinite(run) || !Number.isFinite(going) || run > MODEL_RANGE_MM) return null;
  return { risers: n, riser, going, run };
}

/** A length limit as prose: whole mm as is; a quarter inch exactly (an IRC figure) as
 *  `197 mm (7¾ in)`; anything else as `about 197 mm`. */
function limitMm(x: number): string {
  if (Number.isInteger(x)) return `${mm(x)} mm`;
  const quarters = (x / 25.4) * 4;
  if (x >= 25.4 && Math.abs(quarters - Math.round(quarters)) < 1e-9) {
    const q = Math.round(quarters);
    const whole = Math.floor(q / 4);
    const frac = ["", "¼", "½", "¾"][q % 4]!;
    return `${mm(x)} mm (${whole > 0 ? whole : ""}${frac} in)`;
  }
  return `about ${mm(x)} mm`;
}

export const stairTooSteep: LintRule = {
  name: "stair-too-steep",
  family: "stairs",
  layer: "validity",
  stage: "rooms",
  codes: ["W_STAIR_TOO_STEEP"],
  check(ctx: LintContext): Diagnostic[] {
    // Judged on the storey a flight climbs FROM (`dir up`), against that storey's height: the
    // `dir down` stop above is the same flight.
    const ups = ctx.verticals.filter((v): v is RStair => v.kind === "stair" && v.dir === "up");
    if (ups.length === 0) return [];
    if (!ctx.ir._heightsAuthored) {
      ctx.skip("no-storey-height");
      return [];
    }
    const rise = ctx.ir.storeyHeight;
    const need = minimumRun(rise, ctx.rules);
    if (need === null) return [];
    const out: Diagnostic[] = [];
    for (const v of ups) {
      const run = runLength(v);
      if (run + VERTEX_EPS >= need.run) continue;
      const m = deficitMm(need.run, run);
      const limits =
        ctx.rules.stairMaxPitchRatio === null ? "riser and going limits come" : "riser, going and pitch limits come";
      out.push({
        severity: "warning",
        code: "W_STAIR_TOO_STEEP",
        ...ctx.at(v),
        message: `${capitalise(stairName(v, ctx))} is too steep: its ${mm(run)} mm run must climb the ${mm(rise)} mm storey, and at ${limitMm(ctx.rules.stairMaxRiseMm)} a riser at most that is ${need.risers} risers and ${need.risers - 1} goings of at least ${mm(Math.ceil(need.going - VERTEX_EPS))} mm, a ${m.required} mm run (${m.short} mm short).`,
        hints: [
          `Lengthen \`${v.id}\` along its flight to at least ${m.required} mm on every storey it is drawn on (its \`size\`), or turn the climb into two flights with a landing; the ${limits} from the lint profile (\`--profile\`).`,
        ],
      });
    }
    return out;
  },
};

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
