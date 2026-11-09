/**
 * The resolver's cross-element checks, run once every coordinate is final: the number domain
 * (`E_NON_FINITE`, `E_OUT_OF_RANGE`; the element is dropped), the drawn sizes a plan's settings
 * scale (a hatch tile, the heaviest pen), the empty plan (`W_EMPTY_PLAN`), room overlaps
 * (`W_ROOM_OVERLAP`) and furniture room references (`E_FURN_ROOM`).
 *
 * Invariant: a check reads resolved elements and reports; it never edits one (the number domain
 * returns what the caller drops). Step meter: nothing here calls `chargeSteps`. The one metered
 * cost is the exact polygon test in {@link checkRoomOverlaps}: `polygonsOverlap`
 * (`src/geometry/polygon.ts`) charges its edge reads, with the pair under test as the step site.
 */

import type { PlanNode, Point } from "../ast.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import { fmt3, MODEL_RANGE_MM, outOfRangeDiagnostic } from "../num-format.js";
import { stepSite } from "../expr.js";
import type { Registry } from "../registry.js";
import type { ResolvedSheet } from "../sheet.js";
import { drawingBounds, renderSizes } from "../sheet.js";
import { hatchOf, hatchTileMm } from "../hatches.js";
import type { GridBox } from "../geometry/grid-index.js";
import { GridIndex } from "../geometry/grid-index.js";
import { countOverlappingRectPairs, rectsOverlap } from "../geometry/rect.js";
import { polygonArea, polygonsOverlap, rectRing } from "../geometry/polygon.js";
import { roomOverlapNamer } from "../naming.js";
import { classifyLabelUses } from "../vocabulary.js";
import type { RWall, RRoom, ResolvedElement, ResolvedPlan } from "./types.js";
import { drawnView } from "./sheet.js";

/** The value of largest magnitude beyond {@link MODEL_RANGE_MM}, or undefined when every
 *  value is within it (the first such value on a tie, so the message is deterministic). */
export function farthest(values: readonly number[]): number | undefined {
  let far: number | undefined;
  for (const v of values)
    if (Math.abs(v) > MODEL_RANGE_MM && (far === undefined || Math.abs(v) > Math.abs(far))) far = v;
  return far;
}

/** The one `E_OUT_OF_RANGE` diagnostic: names the value, the limit and the unit. */
export function outOfRange(what: string, value: number, span: Span | undefined, file?: string): Diagnostic {
  return outOfRangeDiagnostic(
    `${what} reaches ${fmt3(value)} mm, outside the modelling range of ±${fmt3(MODEL_RANGE_MM)} mm ` +
      `(2^25 mm, about 33.5 km)`,
    span,
    file,
  );
}

/**
 * The number domain of the resolved plan, checked ONCE, after every `place` frame is carried
 * and every relational room placed, so each value is the element's final plan coordinate.
 *
 * - **Non-finite** (`E_NON_FINITE`): the expression language never yields a non-finite number,
 *   but two finite inputs can still overflow once the resolver combines them — a corner
 *   `x + w`, a room's area `w * h`.
 * - **Beyond the modelling range** (`E_OUT_OF_RANGE`): every point an element draws to (its
 *   `bounds()`, taken from the shape itself) and every coordinate and length it is made of
 *   (its `measures()`) lies within ±{@link MODEL_RANGE_MM}. A finite value past it is not a
 *   building, and it is what ran a stair's tread loop out of memory and printed `Infinity`
 *   for a dimension line.
 *
 * One diagnostic per element, at its span, non-finite first. The element is then DROPPED
 * (returned here; the caller removes it before openings are registered), so no later stage
 * (an opening's hole, the overlap check, the sheet fit, the drawing) forms a product from it.
 * `fmt3`'s `"0"` for a non-finite number stays only as a backstop.
 */
export function checkNumberDomain(
  elements: ResolvedElement[],
  registry: Registry,
  diagnostics: Diagnostic[],
): Set<ResolvedElement> {
  const outside = new Set<ResolvedElement>();
  let total = 0;
  let totalSpan: Span | undefined;
  for (const el of elements) {
    const def = registry.byKind.get(el.kind);
    const pts = def ? def.bounds(el) : [];
    const values = def?.measures ? def.measures(el) : [];
    let what: string | undefined;
    if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) what = `The extent of ${el.kind} "${el.id}"`;
    else if (values.some((v) => !Number.isFinite(v))) what = `A dimension of ${el.kind} "${el.id}"`;
    let area = 0;
    if (what === undefined && el.kind === "room") {
      const r = el as RRoom;
      area = r.poly ? polygonArea(r.poly) : r.size.w * r.size.h;
      if (!Number.isFinite(area)) what = `The area of room "${r.id}"`;
    }
    const span = (el as { span?: Span }).span;
    if (what !== undefined) {
      diagnostics.push({
        severity: "error",
        message: `${what} is not finite (the dimensions overflow the number range)`,
        code: "E_NON_FINITE",
        span,
        ...(el._file ? { file: el._file } : {}),
      });
      outside.add(el);
      continue;
    }
    const far = farthest([...pts.flatMap((p) => [p.x, p.y]), ...values]);
    if (far !== undefined) {
      diagnostics.push(outOfRange(`The geometry of ${el.kind} "${el.id}"`, far, span, el._file));
      outside.add(el);
      continue;
    }
    if (el.kind === "room") {
      // A backstop: rooms inside the modelling range cannot overflow the sum, but the
      // check costs nothing and keeps the derived total in the closed domain by itself.
      total += area;
      if (!Number.isFinite(total) && totalSpan === undefined) totalSpan = span;
    }
  }
  if (!Number.isFinite(total)) {
    diagnostics.push({
      severity: "error",
      message: "The total room area is not finite (the dimensions overflow the number range)",
      code: "E_NON_FINITE",
      span: totalSpan,
    });
  }
  return outside;
}

/**
 * The two drawn sizes a plan's settings scale without bound, held to the modelling range on
 * THIS drawing: a wall's hatch pattern tile (its hatch `scale` × the drawing's hatch module)
 * and the heaviest pen (the theme `lineWeight` × the drawing's wall stroke). Both depend on
 * the drawing's reference dimension, so a coarse `scale 10` is fine on a house and refused only
 * where the tile really leaves the range; `1e308` used to draw `width="Infinity"` and
 * `stroke-width="Infinity"`. Sizes come from `renderSizes`, the function `toScene()` draws
 * with, and the tile from `hatchTileMm`, the markup the pattern is drawn with.
 *
 * Skipped (no work, no output) when nothing could exceed it. Inside the range the reference
 * dimension is at most 2²⁶ mm (the larger side of an extent within ±2²⁵, or 100 mm × a paper
 * denominator `scaleInRange` holds below 2²⁵ / 297), so with every hatch `scale` ≤ 1 and no
 * authored `lineWeight` a tile is at most 4 × 0.013 × 2²⁶ mm and the pen 0.0028 × 2²⁶ × 1.1 mm
 * (1.1 is a built-in theme's heaviest weight), both well inside it.
 */
export function checkDrawnSizes(
  ast: PlanNode,
  elements: readonly ResolvedElement[],
  walls: readonly RWall[],
  siteBoundary: readonly Point[] | undefined,
  sheet: ResolvedSheet | undefined,
  registry: Registry,
  diagnostics: Diagnostic[],
  checkPen: boolean,
): void {
  const lw = ast.theme?.lineWeight;
  if (lw === undefined && !walls.some((w) => w.hatchScale > 1)) return;
  const b = drawingBounds(elements, siteBoundary, registry);
  const sizes = renderSizes(sheet, b.maxX - b.minX, b.maxY - b.minY, lw ?? 1);
  if (checkPen && lw !== undefined && !(Math.abs(sizes.wallStroke) <= MODEL_RANGE_MM)) {
    diagnostics.push(penOutOfRange(lw, sizes.wallStroke, ast.lineWeightSpan));
  }
  for (const w of walls) {
    if (!(w.hatchScale > 1)) continue;
    const tile = hatchTileMm(hatchOf(w), sizes.hatchGap);
    if (tile <= MODEL_RANGE_MM) continue;
    diagnostics.push(
      outOfRangeDiagnostic(
        `Wall "${w.id}" hatch \`scale\` ${fmt3(w.hatchScale)} draws a pattern tile of ${drawnSize(tile)} on this drawing, outside ${DRAWN_LIMIT}`,
        w._hatchScaleSpan ?? w.span,
        w._file,
      ),
    );
  }
}

/** How the drawn-size checks name the range they hold a size to. */
const DRAWN_LIMIT = `the modelling range of ±${fmt3(MODEL_RANGE_MM)} mm (2^25 mm, about 33.5 km)`;

/** A drawn size for a message: millimetres, or a phrase when it left the finite numbers. */
function drawnSize(v: number): string {
  return Number.isFinite(v) ? `${fmt3(v)} mm` : "a size past the number range";
}

/**
 * The `E_OUT_OF_RANGE` for a theme `lineWeight` whose heaviest pen leaves the range. `from`
 * says where a value with no source span came from (the compile options), and the report is
 * then placed at the plan header.
 */
function penOutOfRange(lw: number, stroke: number, span: Span | undefined, from?: string): Diagnostic {
  // A value from the API may be anything; only a finite number is printed as one.
  const value = typeof lw === "number" && Number.isFinite(lw) ? fmt3(lw) : "that is not a finite number";
  return outOfRangeDiagnostic(
    `Theme \`lineWeight\` ${value}${from ? ` (${from})` : ""} draws the heaviest pen at ${drawnSize(stroke)} on this drawing, outside ${DRAWN_LIMIT}`,
    span,
  );
}

/**
 * The heaviest pen a `lineWeight` draws on one resolved storey: the wall stroke of the same
 * {@link renderSizes} `toScene()` draws with, measured on the same drawing bounds.
 */
function heaviestPen(ir: ResolvedPlan, lw: number, registry: Registry): number {
  const b = drawingBounds(drawnView(ir).elements, ir.siteBoundary, registry);
  return renderSizes(ir.sheet, b.maxX - b.minX, b.maxY - b.minY, lw).wallStroke;
}

/**
 * Hold a `lineWeight` to the drawn-pen rule once per PLAN: on a multi-storey plan the first
 * storey (in drawing order) whose heaviest pen leaves the range is reported, tagged with its
 * level, rather than once per page. Returns undefined when every page's pen is in range.
 */
export function lineWeightOutOfRange(
  storeys: readonly { ir: ResolvedPlan; level?: number }[],
  lw: number,
  span: Span | undefined,
  registry: Registry,
  from?: string,
): Diagnostic | undefined {
  for (const s of storeys) {
    const stroke = heaviestPen(s.ir, lw, registry);
    if (Math.abs(stroke) <= MODEL_RANGE_MM) continue;
    const d = penOutOfRange(lw, stroke, span, from);
    return s.level !== undefined ? { ...d, level: s.level } : d;
  }
  return undefined;
}

/** W_EMPTY_PLAN: the plan resolves but contains nothing drawable. */
export function checkPlanDrawable(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  const drawable = elements.some(
    (e) =>
      e.kind === "wall" ||
      e.kind === "room" ||
      e.kind === "furniture" ||
      e.kind === "column" ||
      e.kind === "stair" ||
      e.kind === "elevator" ||
      e.kind === "escalator" ||
      e.kind === "roof" ||
      e.kind === "void" ||
      // A SITE PLAN — a lot line, a lawn, a driveway and a fence, with the building
      // drawn on another sheet — is a real drawing with no wall and no room in it. It
      // would be wrong to tell its author there is "nothing to draw".
      e.kind === "outdoor" ||
      e.kind === "fence",
  );
  if (!drawable) {
    diagnostics.push({
      severity: "warning",
      message: "Plan has no walls, rooms, or furniture — nothing to draw",
      code: "W_EMPTY_PLAN",
    });
  }
}

/** Do two rectangles overlap by no more than one grid step? Rounding can only make such an overlap. */
function withinOneStep(a: RRoom, b: RRoom, grid: number): boolean {
  if (grid <= 0 || a.poly || b.poly) return false;
  const across = Math.min(a.at.x + a.size.w, b.at.x + b.size.w) - Math.max(a.at.x, b.at.x);
  const down = Math.min(a.at.y + a.size.h, b.at.y + b.size.h) - Math.max(a.at.y, b.at.y);
  return Math.min(across, down) <= grid;
}

/** Why rooms that touch in the source can overlap on the sheet: each number rounds on its own. */
const gridOverlapHint = (grid: number): string =>
  `This overlap may be the grid's: \`grid ${fmt3(grid)}\` rounds every coordinate and size on its own, so rooms that touch in the source can overlap by one step. Write them on the grid, or place the second with \`right-of\` or \`below\`.`;

/** How many overlapping room pairs `W_ROOM_OVERLAP` lists before it only counts. 1000 identical
 *  rooms are 499,500 pairs; a list that long is noise and an unbounded allocation. */
export const MAX_OVERLAP_PAIRS_LISTED = 200;

/** W_ROOM_OVERLAP: the overlapping room pairs, listed in (a,b) order up to
 *  {@link MAX_OVERLAP_PAIRS_LISTED} and then only counted — the same diagnostics, byte for byte,
 *  as the double loop over every pair (`test/room-overlap-oracle.test.ts` keeps that loop and
 *  the grid pass that replaced it, and compares all three).
 *
 *  Nothing here is quadratic in a pile of identical rooms. Whether two rooms overlap depends
 *  only on their geometry (`at`, `size`, `poly`), so rooms with value-identical geometry form
 *  one CLASS and each pair of classes is tested once; a spatial grid over the classes restricts
 *  the tests to classes sharing a cell (two rooms overlap ⟹ their boxes intersect ⟹ they share
 *  a cell). The listing then walks rooms `a` in order and takes the partners `b > a` from the
 *  overlapping classes' member lists, stopping at the cap. Past the cap only the count is
 *  needed: rectangle pairs are counted in O(n log n) by {@link countOverlappingRectPairs}, and
 *  pairs with a polygon room by class (a pile of n coincident polygon rooms is one test). What
 *  stays quadratic is what the answer is made of: n DISTINCT polygon rooms that all share a
 *  cell are n² distinct exact tests, each charged to the step meter by `polygonsOverlap`, with
 *  the pair it is testing as the step site. Rooms reaching this check are finite (`checkNumberDomain` drops the rest first). */
export function checkRoomOverlaps(
  elements: ResolvedElement[],
  diagnostics: Diagnostic[],
  level?: number,
  grid = 0,
): void {
  // A room left unplaced carries a (0,0) placeholder, not geometry: testing it would
  // report phantom overlaps (quadratic in a chain) on top of the layout error.
  const rooms = elements.filter((e): e is RRoom => e.kind === "room" && !e._unplaced);
  const roomBox = (r: RRoom): GridBox => ({
    minX: r.at.x,
    minY: r.at.y,
    maxX: r.at.x + r.size.w,
    maxY: r.at.y + r.size.h,
  });
  let rext = 0;
  for (const r of rooms) rext += r.size.w + r.size.h;
  const cell = rooms.length > 0 ? Math.max(rext / (rooms.length * 2), 1) : 1;

  // Classes: first member's index order, members ascending. The key is the numbers' bit
  // patterns (so -0 is not 0), so two rooms in one class are the same numbers and every test
  // answers the same for both.
  const keyOf = (r: RRoom): string => {
    let k = bitsKey(r.at.x) + bitsKey(r.at.y) + bitsKey(r.size.w) + bitsKey(r.size.h);
    if (r.poly) {
      k += "|";
      for (const p of r.poly) k += bitsKey(p.x) + bitsKey(p.y);
    }
    return k;
  };
  const classIds = new Map<string, number>();
  const classOf: number[] = [];
  const members: number[][] = [];
  rooms.forEach((r, i) => {
    const k = keyOf(r);
    let c = classIds.get(k);
    if (c === undefined) {
      c = members.length;
      classIds.set(k, c);
      members.push([]);
    }
    members[c]!.push(i);
    classOf.push(c);
  });
  const rep = (c: number): RRoom => rooms[members[c]![0]!]!;
  const cgrid = new GridIndex<number>(cell);
  members.forEach((_, c) => {
    cgrid.insert(roomBox(rep(c)), c);
  });
  const overlapping = (r1: RRoom, r2: RRoom): boolean => {
    const b1 = { x: r1.at.x, y: r1.at.y, w: r1.size.w, h: r1.size.h };
    const b2 = { x: r2.at.x, y: r2.at.y, w: r2.size.w, h: r2.size.h };
    // A polygon room is tested EXACTLY (its own ring against the other's), never by
    // its bounding box — an L and the room tucked into its notch have overlapping
    // boxes and disjoint floors, and a bbox answer there would be a plain lie.
    if (!(r1.poly || r2.poly)) return rectsOverlap(b1, b2);
    if (!rectsOverlap(b1, b2)) return false;
    // A budget crossed here is reported at this pair, never at whichever room came last.
    stepSite(r2.span, r2._file);
    return polygonsOverlap(r1.poly ?? rectRing(b1), r2.poly ?? rectRing(b2));
  };
  /** The classes overlapping class `c` (itself included when its members overlap one
   *  another), ascending; computed once per class. Both tests are symmetric in their
   *  arguments, so a class pair's answer does not depend on which side asked. */
  const partnerClasses: (number[] | undefined)[] = [];
  const partnersOf = (c: number): number[] => {
    let list = partnerClasses[c];
    if (!list) {
      list = cgrid
        .queryBox(roomBox(rep(c)))
        .filter((d) => {
          // A class of one has no pair inside it; a lower class already listed has the answer.
          if (d === c) return members[c]!.length > 1 && overlapping(rep(c), rep(c));
          const known = d < c ? partnerClasses[d] : undefined;
          return known ? includesSorted(known, c) : overlapping(rep(Math.min(c, d)), rep(Math.max(c, d)));
        })
        .sort((p, q) => p - q);
      partnerClasses[c] = list;
    }
    return list;
  };
  // A message never quotes an id (PS2.29): a labelled room is named by its label, an unlabelled
  // one by what the plan knows of it (`src/naming.ts`, built only when a pair needs it).
  const overlapText = roomOverlapNamer(
    rooms,
    (x) => (x.uses && x.uses.length > 0 ? x.uses : classifyLabelUses(x.label ?? x.id).uses),
    level,
  );
  const report = (r1: RRoom, r2: RRoom): void => {
    diagnostics.push({
      severity: "warning",
      message: overlapText(r1, r2),
      code: "W_ROOM_OVERLAP",
      span: r2.span,
      ...(withinOneStep(r1, r2, grid) ? { hints: [gridOverlapHint(grid)] } : {}),
    });
  };

  // The listing: room `a` in ascending order, its partners `b > a` ascending — exactly the
  // former double loop's emission order.
  let listed = 0;
  for (let a = 0; a < rooms.length && listed < MAX_OVERLAP_PAIRS_LISTED; a++) {
    const need = MAX_OVERLAP_PAIRS_LISTED - listed;
    const bs: number[] = [];
    for (const d of partnersOf(classOf[a]!)) {
      const ms = members[d]!;
      // First member after `a` (members are ascending), then at most `need` of them.
      let lo = 0;
      let hi = ms.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (ms[mid]! > a) hi = mid;
        else lo = mid + 1;
      }
      for (let k = lo; k < ms.length && k < lo + need; k++) bs.push(ms[k]!);
    }
    bs.sort((p, q) => p - q);
    for (let k = 0; k < bs.length && k < need; k++) report(rooms[a]!, rooms[bs[k]!]!);
    listed += Math.min(bs.length, need);
  }
  if (listed < MAX_OVERLAP_PAIRS_LISTED) return;

  // The count: every class pair once, rectangle pairs by sorting.
  const sizeOf = (c: number): number => members[c]!.length;
  const rectCount = countOverlappingRectPairs(
    rooms.filter((r) => !r.poly).map((r) => ({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h })),
  );
  let found = rectCount ?? 0;
  members.forEach((_, c) => {
    const poly = rep(c).poly !== undefined;
    if (!poly && rectCount !== undefined) return;
    for (const d of partnersOf(c)) {
      if (d === c) found += (sizeOf(c) * (sizeOf(c) - 1)) / 2;
      // A rectangle partner of a polygon class is counted from the polygon's side only.
      else if (d > c ? poly || rep(d).poly === undefined : poly && rep(d).poly === undefined)
        found += sizeOf(c) * sizeOf(d);
    }
  });
  if (found > MAX_OVERLAP_PAIRS_LISTED) {
    diagnostics.push({
      severity: "warning",
      message: `…and ${found - MAX_OVERLAP_PAIRS_LISTED} more room pairs overlap (first ${MAX_OVERLAP_PAIRS_LISTED} listed)`,
      code: "W_ROOM_OVERLAP",
    });
  }
}

const BITS = new Float64Array(1);
const BITS16 = new Uint16Array(BITS.buffer);

/** A number's exact bit pattern as four UTF-16 code units: equal keys are equal doubles
 *  (`-0` and `0` apart). Cheaper than printing it. */
function bitsKey(v: number): string {
  BITS[0] = v;
  return String.fromCharCode(BITS16[0]!, BITS16[1]!, BITS16[2]!, BITS16[3]!);
}

/** Does the ascending `list` hold `v`? */
function includesSorted(list: readonly number[], v: number): boolean {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return list[lo] === v;
}

/** E_FURN_ROOM: a fixture's `in <roomId>` must name a real room (fail fast on an
 *  explicit ref — ADR 0005: the core never guesses which room was meant). */
export function checkFurnitureRooms(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  const roomIds = new Set(elements.filter((e): e is RRoom => e.kind === "room").map((r) => r.id));
  for (const el of elements) {
    if (el.kind === "furniture" && el.room !== undefined && !roomIds.has(el.room)) {
      diagnostics.push({
        severity: "error",
        message: `Furniture "${el.id}" is placed \`in ${el.room}\` but no room has that id`,
        code: "E_FURN_ROOM",
        span: el.span,
      });
    }
  }
}
