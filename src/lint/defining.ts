/**
 * The pieces that define a room of each use, read from `FURNISH_TABLE` (the table `finish`
 * furnishes from), and the checked statements that place them. Shared by
 * `W_ROOM_MISSING_DEFINING` (which reports a furnished room lacking one) and
 * `W_ROOM_NO_FIXTURE` (whose hint quotes them, so applying it leaves no defining piece missing).
 */

import { rectOf, roomUses } from "../analyze.js";
import { navCellSizeMm, navExtent } from "../analyze/circulation.js";
import type { UseKind } from "../ast.js";
import { defaultFootprint } from "../fixtures-catalog.js";
import { FURNISH_TABLE, type FurnishItem } from "../furnish-table.js";
import { arcExtremes } from "../geometry/arc.js";
import { distPointToSegment } from "../geometry/polygon.js";
import type { BBox } from "../geometry/rect.js";
import type { RFurniture, RRoom } from "../ir.js";
import { verticalObstacles } from "../vertical.js";
import { LINT_RULES } from "./rules/index.js";
import type { LintContext, LintRule } from "./context.js";
import { type PasteFailure, pasteFixture } from "./fixture-paste.js";
import { distPointToRect } from "./measure.js";

/**
 * Which pieces define a room of each use, as a reading of {@link FURNISH_TABLE}, so the lint
 * and the `finish` stage cannot disagree about what a room needs:
 * - `"required"`: every piece the row marks required;
 * - `{ pick }`: the row's items with these categories (each item brings its own `or` words);
 * - `{ none }`: not checked, and why.
 *
 * A use with no row is never checked. `test/lint-room-contents.test.ts` holds that every use
 * whose row marks a piece required has an entry here and that every pick names an item of its
 * row. Two readings differ from the required marks, on purpose:
 * - `bath` is defined by its bathtub-or-shower item, which the row marks optional (furnish
 *   leaves it out when it does not fit; the never-worse gate then refuses that bath, which stays
 *   empty and is `W_ROOM_NO_FIXTURE`'s report). A bath holding a shower and no WC is a shower
 *   room, not a defect. A bath that holds a WC also needs a basin
 *   ({@link WASH_WITH}).
 * - `wc` is defined by its WC alone: a cloakroom without a basin is common.
 *
 * Kitchen: the row's required marks are a sink, a hob/stove and a worktop (`counter`, or
 * `worktop`; plan-soundness PS2.17), so a kitchen whose sink, hob and fridge are butted together
 * with nowhere to prepare food is reported (`test/defect-corpus/missing-defining-contents/
 * kitchen-no-worktop.arch`), and `finish` writes the worktop with them or leaves the kitchen out.
 */
export const DEFINING: Readonly<Partial<Record<UseKind, "required" | { pick: readonly string[] } | { none: string }>>> =
  Object.freeze({
    bedroom: "required",
    dining: "required",
    kitchen: "required",
    bath: { pick: ["bathtub"] },
    wc: { pick: ["wc"] },
    living: {
      none: "a living room is furnished many ways (armchairs, a piano, floor cushions); no one piece defines it",
    },
    office: { none: "a study can be a reading room with no desk; no one piece defines it" },
  });

/** The items, each satisfied by any one of its words, that define a room of `use`. */
export function definingItems(use: UseKind): FurnishItem[] {
  const row = FURNISH_TABLE[use];
  const spec = DEFINING[use];
  if (row === undefined || spec === undefined || (typeof spec === "object" && "none" in spec)) return [];
  if (spec === "required") return row.filter((i) => i.required);
  return spec.pick.flatMap((c) => row.filter((i) => i.category === c));
}

/**
 * A piece one held piece brings with it, as a reading of {@link FURNISH_TABLE} (both categories
 * name items of the use's row): a `bath` that holds a WC also needs a basin (plan-soundness
 * PS2.66). The convention is England's Approved Document G (G4, sanitary conveniences and washing
 * facilities): a washbasin in the room with the WC, or in a room or space that gives direct access
 * to it, provided it is not used to prepare food. So `W_ROOM_MISSING_DEFINING` counts a basin in
 * the room, or in any room joined to it directly by a door or opening (an access edge) that is
 * not a kitchen. A `wc` room has no entry: the module says why above. A bath with no WC (a
 * shower room) needs no basin from this reading.
 */
export const WASH_WITH: Readonly<Partial<Record<UseKind, { held: string; needs: string }>>> = Object.freeze({
  bath: { held: "wc", needs: "basin" },
});

/** The {@link WASH_WITH} items of `use` from its furnish row, or `undefined`. */
export function washItems(use: UseKind): { held: FurnishItem; needs: FurnishItem } | undefined {
  const spec = WASH_WITH[use];
  const row = FURNISH_TABLE[use];
  if (spec === undefined || row === undefined) return undefined;
  const held = row.find((i) => i.category === spec.held);
  const needs = row.find((i) => i.category === spec.needs);
  return held && needs ? { held, needs } : undefined;
}

/** Every defining item of every use of the room, in the room's use order, each once. */
export function roomDefiningItems(r: RRoom): FurnishItem[] {
  const out: FurnishItem[] = [];
  for (const u of roomUses(r)) for (const i of definingItems(u)) if (!out.includes(i)) out.push(i);
  return out;
}

/** The room noun a message names a use by: "a bathroom", not "a bath room". */
const NOUN: Partial<Record<UseKind, string>> = {
  bedroom: "bedroom",
  dining: "dining room",
  kitchen: "kitchen",
  bath: "bathroom",
  wc: "WC",
};
export const useNoun = (use: UseKind): string => NOUN[use] ?? use;

/** An item's words: its category, then the ones tried in its place. */
export const itemWords = (i: FurnishItem): string[] => [i.category, ...(i.or ?? [])];

/**
 * The footprints a word of `item` is pasted at, in the order tried: every one of the item's
 * sizes for its own category (as `finish` tries them: a worktop's 600 mm module, then its
 * 400 mm one), else the catalogue's.
 */
function footprintsOf(item: FurnishItem, word: string): { along: number; depth: number }[] {
  const sizes = word === item.category ? item.sizes : undefined;
  if (sizes && sizes.length > 0) return sizes.map(([along, depth]) => ({ along, depth }));
  const fp = defaultFootprint(word);
  return fp ? [fp] : [];
}

/**
 * Statements that place every item in `room` TOGETHER: each is checked by {@link pasteFixture}
 * with the pieces quoted before it already standing, so applying all of them collides with
 * nothing the placement rules measure. Each item tries its words in order. When an item has no
 * clear position, nothing is quoted and the first such item is returned with the reason.
 */
export function pasteSet(
  ctx: LintContext,
  room: RRoom,
  items: readonly FurnishItem[],
):
  | {
      stmts: string[] /** Each statement's footprint and turn as the check placed it (tests compare them with the resolver's). */;
      rects: (BBox & { rotate: number })[];
    }
  | { item: FurnishItem; footprint: { along: number; depth: number } | null; failure: PasteFailure } {
  const stmts: string[] = [];
  const rects: (BBox & { rotate: number })[] = [];
  let here = ctx;
  for (const item of items) {
    let first: { footprint: { along: number; depth: number } | null; failure: PasteFailure } | null = null;
    let placed = false;
    for (const [w, fp] of itemWords(item).flatMap((w) => footprintsOf(item, w).map((fp) => [w, fp] as const))) {
      const paste = pasteFixture(here, room, w, fp.along, fp.depth);
      if ("stmt" in paste) {
        stmts.push(paste.stmt);
        rects.push({ ...paste.rect, rotate: paste.rotate });
        const phantom = {
          kind: "furniture",
          id: `hint-piece-${stmts.length}`,
          category: w,
          at: { x: paste.rect.x, y: paste.rect.y },
          size: { w: paste.rect.w, h: paste.rect.h },
          rotate: paste.rotate,
          room: room.id,
        } as RFurniture;
        here = { ...here, furniture: [...here.furniture, phantom] };
        placed = true;
        break;
      }
      first ??= { footprint: fp, failure: paste.failure };
    }
    if (!placed)
      return {
        item,
        footprint: first?.footprint ?? footprintsOf(item, item.category)[0] ?? null,
        failure: first?.failure ?? "no-room",
      };
  }
  // Each piece is checked against what the placement rules measure, one at a time. The SET can
  // still raise what no single check sees: two pieces on different walls can squeeze the walk
  // below its minimum clear width (`W_PATH_TOO_NARROW`) or close the way through a room so the
  // walk goes the long way round (`W_CIRCUITOUS_PATH`), and a kitchen fixture that now locates
  // the kitchen beside a bathroom door lets `W_WET_ROOM_DOOR` judge it. So the set is re-linted
  // with its pieces standing against the rules flagged `readsFurniture` (the ones a pasted hint
  // was measured to move), and a set that would add any finding is not quoted: a hint that warns
  // when pasted is worse than none. The plan's own reading of those rules is taken once per
  // context; each verification is one pass on one copy of the context, charged to
  // {@link MAX_HINT_VERIFICATIONS} before it runs. The walk (`readsFurniture: "walk"`, the rules
  // reading a nav model of the whole storey) joins the pass only when a quoted piece stands
  // closer than the walk's minimum clear width to a doorway, a wall face, another piece or an
  // obstacle standing in the room ({@link mayPinch}): a piece flush to its walls and clear of
  // everything by that width cannot narrow any walk below it. The
  // copies file no coverage notes and keep an attribution budget of their own, so this check
  // changes nothing outside itself.
  if (stmts.length > 0 && !(VERIFYING in ctx)) {
    const run = runOf(ctx);
    const unverified = (): {
      item: FurnishItem;
      footprint: { along: number; depth: number } | null;
      failure: PasteFailure;
    } => {
      if (!run.reported) {
        run.reported = true;
        ctx.skip("hint-budget");
      }
      const last = items[items.length - 1]!;
      return { item: last, footprint: footprintsOf(last, last.category)[0] ?? null, failure: "unverified" };
    };
    // Charged before the work: one pass, tested before any geometry is measured; then, for a
    // walk, the rooms it walks (the plan's own walk, the first time, and this pass's), which
    // only {@link mayPinch} can say.
    if (run.used + 1 > MAX_HINT_VERIFICATIONS) return unverified();
    const walk = mayPinch(ctx, room, here.furniture.slice(ctx.furniture.length), here.furniture);
    const walkCost = walk ? ctx.rooms.length * (BASELINE.get(ctx)?.walked ? 1 : 2) : 0;
    if (run.walked + walkCost > MAX_HINT_WALK_ROOMS) return unverified();
    run.used++;
    run.walked += walkCost;
    const wet = nearWetRoom(ctx, room);
    const rules = LINT_RULES.filter(
      (r) =>
        r.readsFurniture === true || (walk && r.readsFurniture === "walk") || (wet && r.readsFurniture === "wet-door"),
    );
    const before = new Set(rules.flatMap((r) => baselineOf(ctx, r)));
    const pass = quietCopy(here);
    const gained = rules
      .flatMap((r) => r.check(pass))
      .map(said)
      .find((m) => !before.has(m));
    if (gained !== undefined) {
      const last = items[items.length - 1]!;
      return {
        item: last,
        footprint: footprintsOf(last, last.category)[0] ?? null,
        failure: gained.startsWith("W_PATH_TOO_NARROW|") ? "squeeze" : "raises",
      };
    }
  }
  return { stmts, rects };
}

/**
 * The most quoted fixture sets one `lint()` run re-lints before quoting them (counted per
 * storey context, and shared by every storey of a multi-storey run). A count, never a time:
 * each verification is one pass of the `readsFurniture` rules. Past it, a room's hint says the
 * placement was not verified and quotes none, and the run files one `hint-budget` coverage
 * skip. Measured in PR #216: the most any corpus plan verifies in one run is 4.
 */
export const MAX_HINT_VERIFICATIONS = 64;

/**
 * The rooms the verifications of one `lint()` run may walk (`readsFurniture: "walk"`: a nav
 * model of the whole storey per pass, so its work grows with the storey's rooms). A pass that
 * walks charges the storey's room count, and the first one in a context charges it twice (the
 * plan's own walk, taken once, and the pass). Past it, as {@link MAX_HINT_VERIFICATIONS}.
 * Measured in PR #216: the most any corpus plan walks in one run is 80 rooms (16-room
 * `test/recovery-corpus/terrace-row.arch`: its own walk and four sets); 128 lets a 55-room storey
 * walk its own plan and one set, which keeps 50 empty kitchens within 3× main's lint time.
 */
export const MAX_HINT_WALK_ROOMS = 128;

/** A finding as the verification compares it. */
const said = (d: { code?: string; message: string }): string => `${d.code}|${d.message}`;

/** One copy of `c` for one verification pass, shared by every rule of the pass (so the walk's
 *  nav model, cached per context, is built once in it). It files no coverage notes and has an
 *  attribution budget of its own. */
function quietCopy(c: LintContext): LintContext {
  return { ...c, skip: () => {}, building: ownBudget(c.building), [VERIFYING]: true } as LintContext;
}

/** The plan's own findings of each `readsFurniture` rule, taken once per lint context and rule,
 *  all from one copy of the context. */
const BASELINE = new WeakMap<LintContext, { pass: LintContext; byRule: Map<LintRule, string[]>; walked?: true }>();
function baselineOf(ctx: LintContext, rule: LintRule): string[] {
  let b = BASELINE.get(ctx);
  if (b === undefined) {
    b = { pass: quietCopy(ctx), byRule: new Map() };
    BASELINE.set(ctx, b);
  }
  let found = b.byRule.get(rule);
  if (found === undefined) {
    found = rule.check(b.pass).map(said);
    b.byRule.set(rule, found);
    if (rule.readsFurniture === "walk") b.walked = true;
  }
  return found;
}

/** Is the room a bath or WC, or does a door or opening join it to one? Only then can its
 *  pieces change what `W_WET_ROOM_DOOR` judges (a kitchen fixture that locates the kitchen). */
function nearWetRoom(ctx: LintContext, room: RRoom): boolean {
  const wetRoom = (id: string): boolean => {
    const r = ctx.rooms.find((x) => x.id === id);
    if (!r) return false;
    const u = roomUses(r);
    return u.has("bath") || u.has("wc");
  };
  if (wetRoom(room.id)) return true;
  return ctx
    .access()
    .edges.some((e) => e.between.includes(room.id) && wetRoom(e.between[0] === room.id ? e.between[1] : e.between[0]));
}

/**
 * Could the quoted pieces narrow a walk below the minimum clear width? Only if one of them
 * stands closer than that width to a wall face, to another piece across open floor, or to an
 * obstacle inside the room. A rectangular room's own edges are read through its walls' faces,
 * conservatively: the gap to a centreline less the thickest wall's half (an under-estimate, so a
 * doubt runs the walk). A polygon or circular room always runs it. The obstacles inside the
 * room are what the walk's nav grid blocks besides furniture, read from the same inputs it is
 * built from ({@link interiorObstacles}).
 */
function mayPinch(ctx: LintContext, room: RRoom, quoted: readonly RFurniture[], all: readonly RFurniture[]): boolean {
  if (room.poly || room.circle) return true;
  // The walk reads widths on its nav grid, whose cell grows with the plan's area past 2500 m²
  // (`navExtent`, the extent `buildGrid` tiles): a width reads in whole cells either side of the
  // walk's centre (`centreFreedomToClearWidth`), so it can read narrower than the gap is. The
  // gaps to a wall face and a doorway were measured on the finest cell (`navCellSizeMm(0)`) and
  // absorb its rounding; a coarser grid pads them by two cells' worth of the difference (`min`).
  // A gap to another piece or an obstacle in the room, which the review's sweeps found reading a
  // cell short at exactly the minimum (a 700 mm gap read as 500 mm), takes one cell more
  // (`tight`). A doubt runs the walk.
  const cell = navExtent(ctx.rooms)?.cell ?? navCellSizeMm(0);
  const min = ctx.rules.minPathClearWidthMm + 2 * Math.max(0, cell - navCellSizeMm(0));
  const tight = min + cell;
  const half = Math.max(0, ...ctx.wallSegs.map((s) => s.thickness / 2));
  const x0 = room.at.x;
  const y0 = room.at.y;
  const x1 = x0 + room.size.w;
  const y1 = y0 + room.size.h;
  const rectOfPiece = (f: RFurniture) => ({ x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h });
  const nearDoor = (p: { x: number; y: number; w: number; h: number }): boolean =>
    ctx.connectors.some((c) => {
      const dx = Math.max(p.x - c.at.x, 0, c.at.x - (p.x + p.w));
      const dy = Math.max(p.y - c.at.y, 0, c.at.y - (p.y + p.h));
      return Math.hypot(dx, dy) < min + c.width / 2;
    });
  // The room edges a piece stands flush against (within the thickest wall's half).
  const flush = (p: { x: number; y: number; w: number; h: number }) => ({
    left: p.x - x0 <= half + 1,
    right: x1 - (p.x + p.w) <= half + 1,
    top: p.y - y0 <= half + 1,
    bottom: y1 - (p.y + p.h) <= half + 1,
  });
  const inside = interiorObstacles(ctx, room, half);
  for (const f of quoted) {
    const p = rectOfPiece(f);
    const fp = flush(p);
    // Near a doorway the walk starts or ends there: a piece within the minimum width of any
    // door or opening (its centre, plus half its width) runs the walk.
    if (nearDoor(p)) return true;
    // Near a wall stub, a stair, a lift or a void standing in the room (touching one included).
    if (inside.some((o) => o(p) < tight)) return true;
    // A gap to a wall the piece is not against: only across the room (the piece flush to the
    // opposite wall, or to none) can it be a walk; a gap beside a piece flush to a wall that
    // runs past it is a dead-end recess along that wall, which no walk needs.
    const across = (opposite: boolean, side1: boolean, side2: boolean): boolean => opposite || !(side1 || side2);
    const gaps: [number, boolean][] = [
      [p.x - x0, across(fp.right, fp.top, fp.bottom)],
      [x1 - (p.x + p.w), across(fp.left, fp.top, fp.bottom)],
      [p.y - y0, across(fp.bottom, fp.left, fp.right)],
      [y1 - (p.y + p.h), across(fp.top, fp.left, fp.right)],
    ];
    for (const [d, counts] of gaps) if (counts && d > half + 1 && d - half < min) return true;
    for (const o of all) {
      if (o === f) continue;
      const q = rectOfPiece(o);
      const fq = flush(q);
      const gx = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w));
      const gy = Math.max(q.y - (p.y + p.h), p.y - (q.y + q.h));
      // Overlapping pieces are one obstacle: the gap is measured from their union's others.
      if (gx < 0 && gy < 0) continue;
      // Two pieces side by side against one wall (or butted along it) leave a recess along it,
      // or none, not a walk.
      if (gx >= 0 && gy < 0 && ((fp.top && fq.top) || (fp.bottom && fq.bottom))) continue;
      if (gy >= 0 && gx < 0 && ((fp.left && fq.left) || (fp.right && fq.right))) continue;
      // Two pieces on walls that meet at a corner, offset diagonally, close a corner pocket.
      const onRow = (s: typeof fp) => s.top || s.bottom;
      const onCol = (s: typeof fp) => s.left || s.right;
      // (A pocket a doorway opens into is a walk: then it counts. The pocket spans the two
      // pieces and the corner their walls meet at.)
      const pocket = (): { x: number; y: number; w: number; h: number } => {
        const [row, col] = onRow(fp) && onCol(fq) ? [fp, fq] : [fq, fp];
        const cx = col.left ? x0 : x1;
        const cy = row.top ? y0 : y1;
        const lx = Math.min(p.x, q.x, cx);
        const ly = Math.min(p.y, q.y, cy);
        return { x: lx, y: ly, w: Math.max(p.x + p.w, q.x + q.w, cx) - lx, h: Math.max(p.y + p.h, q.y + q.h, cy) - ly };
      };
      if (gx > 0 && gy > 0 && ((onRow(fp) && onCol(fq)) || (onCol(fp) && onRow(fq))) && !nearDoor(pocket())) continue;
      // The gap as `rectGap` measures it: edges in line (a gap of 0 on one axis) or a corner
      // touch (0 on both) is a gap like any other, and touching (0) is the narrowest of all.
      if (Math.hypot(Math.max(0, gx), Math.max(0, gy)) < tight) return true;
    }
  }
  return false;
}

/**
 * What the walk's nav grid blocks inside a rectangular room besides furniture (`buildGrid`,
 * `src/analyze/circulation.ts`, built from `ctx.ir.walls`, `ctx.verticals` and `ctx.voids`), each
 * as the distance from a piece's rectangle to it: every wall segment that reaches the room's
 * interior farther than `half` from its edges (a stub, a nib, a partition run into the room; a
 * wall along an edge is the edge, which {@link mayPinch} reads through its face), and every
 * vertical run or void that meets that interior. A wall's band is measured from its centreline
 * less half its thickness; a curved segment by the box of its sweep (an under-estimate, so a doubt
 * runs the walk).
 */
function interiorObstacles(ctx: LintContext, room: RRoom, half: number): ((p: BBox) => number)[] {
  const m = half + 1;
  const core: BBox = { x: room.at.x + m, y: room.at.y + m, w: room.size.w - 2 * m, h: room.size.h - 2 * m };
  if (core.w <= 0 || core.h <= 0) return [];
  const out: ((p: BBox) => number)[] = [];
  for (const s of ctx.wallSegs) {
    if (s.arc) {
      const box = boxOf(arcExtremes(s.arc));
      if (rectGap(box, core) > s.thickness / 2) continue;
      out.push((p) => Math.max(0, rectGap(p, box) - s.thickness / 2));
      continue;
    }
    if (segRectGap(s.a, s.b, core) > 0) continue;
    out.push((p) => Math.max(0, segRectGap(s.a, s.b, p) - s.thickness / 2));
  }
  const rects = [...verticalObstacles(ctx.verticals).map((o) => o.rect), ...ctx.voids.map((v) => rectOf(v))];
  for (const r of rects) if (rectGap(r, core) === 0) out.push((p) => rectGap(p, r));
  return out;
}

/** The bounding box of points. */
function boxOf(pts: readonly { x: number; y: number }[]): BBox {
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The gap between two closed rectangles (0 when they meet). */
function rectGap(a: BBox, b: BBox): number {
  const gx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(gx, gy);
}

/** The gap between segment ab and a closed rectangle (0 when they meet). */
function segRectGap(a: { x: number; y: number }, b: { x: number; y: number }, r: BBox): number {
  // Liang–Barsky: does the segment enter the closed rectangle?
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (pp: number, q: number): boolean => {
    if (pp === 0) return q >= 0;
    const t = q / pp;
    if (pp < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (
    clip(-dx, a.x - r.x) &&
    clip(dx, r.x + r.w - a.x) &&
    clip(-dy, a.y - r.y) &&
    clip(dy, r.y + r.h - a.y) &&
    t0 <= t1
  )
    return 0;
  // Apart, the nearest pair is an endpoint against the rectangle or a corner against the segment.
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
  return Math.min(distPointToRect(a, r), distPointToRect(b, r), ...corners.map((c) => distPointToSegment(c, a, b)));
}

/** The verifications one lint run has spent: keyed by the run's shared attribution budget
 *  object (one per multi-storey run), else by the storey's own context. */
const SPENT = new WeakMap<object, { used: number; walked: number; reported: boolean }>();
function runOf(ctx: LintContext): { used: number; walked: number; reported: boolean } {
  const key: object = ctx.building.attributionMeasures ?? ctx;
  let s = SPENT.get(key);
  if (s === undefined) {
    s = { used: 0, walked: 0, reported: false };
    SPENT.set(key, s);
  }
  return s;
}

/** The building context with an attribution budget of its own, and an empty one: the
 *  verification compares findings, not door attributions, so it never re-measures a door
 *  set, and it spends none of the lint run's shared count. */
function ownBudget(b: LintContext["building"]): LintContext["building"] {
  return { ...b, attributionMeasures: { left: 0, storeys: 0 } };
}

/** Marks a context {@link pasteSet} built to re-lint a set with its pieces standing: a hint a
 *  rule quotes inside that run is not verified again. */
const VERIFYING = Symbol("pasteSet verifying");
