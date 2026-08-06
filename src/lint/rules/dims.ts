/**
 * Annotation-quality advisories over the plan's HAND-WRITTEN dimensions: `W_DIM_INSIDE`
 * (a dimension line landing inside the building) and `W_DIM_OVERLAP` (two dimensions
 * drawn on top of each other). Both are advisory with a machine-applicable fix — the
 * compiler never re-stages an author's `dim` on its own (ADR 0005).
 *
 * `W_DIM_INSIDE` — a hand-written dimension line lands inside the building.
 *
 * A `dim`'s line is drawn `offset` away along the LEFT normal of from→to, so the
 * ENDPOINT ORDER is what chooses which side it lands on — reversing a dim mirrors it
 * across the measured segment. The classic mistake is writing the two points in the
 * order they read on screen and getting the line pushed back INTO the plan, where it
 * crosses room labels, furniture and wall poché instead of reading in the page margin.
 *
 * The rule fires only when the whole dimension LINE (not its witness lines) falls
 * inside the room-extents bounding box, and only for dims that came from source — the
 * `dims auto` chains are synthesized at scene-build and never enter the IR, so a
 * wall-thickness call-out can never trip it. A hand-written zero-offset dim is skipped
 * too: it sits ON its measured segment by definition. Advisory, with a
 * machine-applicable fix that swaps the endpoints.
 */

import type { Diagnostic, Span } from "../../diagnostics.js";
import { add, length, mul, normal, sub, unit } from "../../geometry.js";
import type { Point } from "../../ast.js";
import type { RDim } from "../../ir.js";
import { dimBumpFix, dimSwapFix, fixesFrom } from "../../fix-producers.js";
import { CHAIN_STEP, SHEET_MM } from "../../sheet.js";
import { fmt2 } from "../../num-format.js";
import type { LintContext, LintRule } from "../context.js";

/** Margin (mm) a point must clear the room-extents box by to count as "inside". */
const EPS = 1;

export const dimInside: LintRule = {
  name: "dim-inside",
  check(ctx: LintContext): Diagnostic[] {
    const dims = ctx.ir.elements.filter((e): e is RDim => e.kind === "dim");
    if (dims.length === 0 || ctx.roomRects.size === 0) return [];

    // Room extents (the building box a dimension should read outside of).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of ctx.roomRects.values()) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const inside = (p: Point): boolean => p.x > minX + EPS && p.x < maxX - EPS && p.y > minY + EPS && p.y < maxY - EPS;

    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const dm of dims) {
      if (!dm.span || dm.offset === 0) continue;
      // One warning per SOURCE statement: a dim inside a `for` loop resolves many
      // times over one span, and the fix would otherwise be offered N times.
      const key = `${dm.span.start}:${dm.span.end}`;
      if (seen.has(key)) continue;
      // The MIDPOINT of the offset line: a dimension legitimately runs corner to
      // corner, so its endpoints sit ON the box edges — where the line ended up
      // (which side the offset threw it) is what the midpoint answers.
      const off = mul(normal(unit(sub(dm.to, dm.from))), dm.offset);
      const mid = add({ x: (dm.from.x + dm.to.x) / 2, y: (dm.from.y + dm.to.y) / 2 }, off);
      if (!inside(mid)) continue;
      seen.add(key);
      out.push({
        severity: "warning",
        code: "W_DIM_INSIDE",
        span: dm.span,
        message: `Dimension "${dm.id}" draws its line inside the building — the \`offset ${dm.offset}\` pushes it into the plan, not out to the margin.`,
        hints: ["Swap the two endpoints (or negate the offset) so the dimension reads outside the building."],
        ...fixesFrom(dimSwapFix(dm)),
      });
    }
    return out;
  },
};

/* ---------------------------------------------------------------------------
 * W_DIM_OVERLAP — two hand-written dimensions drawn on top of each other.
 * ------------------------------------------------------------------------- */

/**
 * `W_DIM_OVERLAP` — advisory: two hand-written dimensions collide on the sheet.
 *
 * ArchLang never re-staggers a `dim`: the author's `offset` **is** the tier control, and a
 * layout pass that silently moved a dimension would be exactly the invisible architect
 * ADR 0005 forbids. So a collision is reported, with a machine-applicable fix that bumps
 * the offset out by whole {@link CHAIN_STEP} tiers — the author accepts it or doesn't.
 *
 * **What "overlap" means here.** A dimension's *drawn extent* is an oriented band in the
 * frame of its own measured segment: the dimension line and its two station ticks, plus
 * the length text riding above the line's midpoint. Two dims collide when those bands
 * intersect. Three deliberate restrictions keep the rule honest:
 *
 *  - **Only PARALLEL pairs.** Two chains meeting at a building corner cross by
 *    construction; that is correct drafting, and an offset bump could not separate them
 *    anyway. Non-parallel dims are never compared.
 *  - **The station ticks are excluded from the ALONG extent.** Adjacent members of a
 *    dimension chain (`0→4000`, `4000→7000`) deliberately *share* the tick where they
 *    meet — the touching case must not warn — so the along-extent is the measured run
 *    itself (unioned with the text box, which can overhang a short run) and the overlap
 *    test is strict.
 *  - **Only across DIFFERENT source statements.** Two instances of one `dim` inside a
 *    `for` share an `offset` expression, so no bump can separate them; flagging them
 *    would offer a fix that does not fix.
 *
 * A zero-offset dim is skipped for the same reason `dimInside` skips it — it sits ON its
 * measured segment by contract (the canonical wall-thickness call-out), and a bump would
 * have no side to move to. `dims auto` chains are synthesized at scene-build, never enter
 * the IR, and already tier themselves; see the note at the top of this file.
 */
export const dimOverlap: LintRule = {
  name: "dim-overlap",
  check(ctx: LintContext): Diagnostic[] {
    const dims = ctx.ir.elements.filter((e): e is RDim => e.kind === "dim");
    if (dims.length < 2) return [];
    const { dimFont, tick } = annotationSizes(ctx);
    // Cross-axis reach of one dim's band, measured from its own drawn line: BACK past the
    // line is the station tick (a unit 45° slash of length `tick`, so `tick/√2` across),
    // FORWARD is the text — `dimFont * 0.7` of standoff (elements/dim.ts) plus half a cap
    // height. Identical for every dim, so it is computed once rather than stored per band.
    const back = tick * Math.SQRT1_2;
    const fore = dimFont * 1.2;
    const step = CHAIN_STEP * dimFont;

    const bands = dims.filter(hasDrawnBand).map((dm) => band(dm, dimFont));
    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < bands.length; i++) {
      for (let j = i + 1; j < bands.length; j++) {
        const a = bands[i]!;
        const b = bands[j]!;
        if (a.key === b.key || !parallel(a, b) || !collide(a, b, back, fore)) continue;
        // Report on the LATER source statement and bump THAT one: the first-written
        // dimension keeps the inner tier, which is the order an author reads them in.
        const later = b.at >= a.at ? b : a;
        const other = later === b ? a : b;
        if (seen.has(later.key)) continue;
        seen.add(later.key);
        const newOffset = retier(later, other, { back, fore, step });
        out.push({
          severity: "warning",
          code: "W_DIM_OVERLAP",
          span: later.span,
          message: `Dimension "${later.dm.id}" is drawn over "${other.dm.id}" — both land in the same chain tier (\`offset ${fmt2(later.dm.offset)}\` and \`offset ${fmt2(other.dm.offset)}\`), so their lines and texts collide.`,
          hints: [`Move one of them out a tier — \`offset ${fmt2(newOffset)}\` clears the other's line and text.`],
          relatedSpans: [{ span: other.span, message: "overlaps this dimension" }],
          ...fixesFrom(dimBumpFix(later.dm, newOffset)),
        });
      }
    }
    return out;
  },
};

/** A hand-written dim with a drawn band worth testing: it came from source, it is offset
 *  off its measured segment, and that segment has a direction (a failed `dim radius` ref
 *  collapses to a zero-length placeholder). */
function hasDrawnBand(dm: RDim): boolean {
  return !!dm.span && dm.offset !== 0 && length(sub(dm.to, dm.from)) > 0;
}

/** One dim's drawn band: the frame of its measured segment, the midpoint of the drawn
 *  line, and how far the band runs along that line either side of the midpoint. */
interface Band {
  dm: RDim;
  /** The dim's own span (non-null by {@link hasDrawnBand}). */
  span: Span;
  /** Start offset of that span — the source ORDER key. */
  at: number;
  /** Identity of the SOURCE STATEMENT (a `for` resolves one statement many times). */
  key: string;
  /** Unit direction of from→to. */
  u: Point;
  /** Left normal of `u` — the axis `offset` runs along. */
  n: Point;
  /** Midpoint of the DRAWN line (the measured midpoint pushed out by `offset`). */
  mid: Point;
  /** Half the along-axis extent about `mid`. */
  half: number;
}

/**
 * Em-per-character factor for estimating a rendered string's width. The renderer has no
 * text metrics — the only such factor in the tree is the error card's
 * (`backends/error-svg.ts`) — so a width is a closed-form estimate over the exact string
 * `dim.render` draws: the authored `text` when there is one, else the measured length
 * through the same {@link fmt2} the render context passes as its `fmt`.
 */
const EM_PER_CHAR = 0.62;

function band(dm: RDim, dimFont: number): Band {
  const span = dm.span!;
  const u = unit(sub(dm.to, dm.from));
  const n = normal(u);
  const len = length(sub(dm.to, dm.from));
  const mid = add({ x: (dm.from.x + dm.to.x) / 2, y: (dm.from.y + dm.to.y) / 2 }, mul(n, dm.offset));
  const label = dm.text ?? fmt2(len);
  const textW = label.length * dimFont * EM_PER_CHAR;
  return { dm, span, at: span.start, key: `${span.start}:${span.end}`, u, n, mid, half: Math.max(len, textW) / 2 };
}

/** Are the two measured segments parallel (either direction)? Both vectors are unit, so
 *  the cross product is the sine of the angle between them. */
function parallel(a: Band, b: Band): boolean {
  return Math.abs(a.u.x * b.u.y - a.u.y * b.u.x) <= 1e-9;
}

const dot = (p: Point, q: Point): number => p.x * q.x + p.y * q.y;

/** Strict interval overlap — touching is not colliding (adjacent chain members share a
 *  station tick, and two tiers that just graze read fine on paper). */
const overlaps = (lo1: number, hi1: number, lo2: number, hi2: number): boolean =>
  Math.min(hi1, hi2) - Math.max(lo1, lo2) > 1e-6;

/** Do two PARALLEL bands intersect? Tested in `a`'s frame, where `b` projects to a single
 *  along-interval and (being parallel) a single cross-coordinate. */
function collide(a: Band, b: Band, back: number, fore: number): boolean {
  const d = sub(b.mid, a.mid);
  const s = dot(d, a.u);
  if (!overlaps(-a.half, a.half, s - b.half, s + b.half)) return false;
  const [lo, hi] = crossBand(dot(d, a.n), dot(b.n, a.n) > 0, back, fore);
  return overlaps(-back, fore, lo, hi);
}

/** A band's cross-axis interval about its line at `t`, expressed on a reference normal. A
 *  dim whose own normal points the other way carries its text on the other side. */
function crossBand(t: number, sameSide: boolean, back: number, fore: number): [number, number] {
  return sameSide ? [t - back, t + fore] : [t - fore, t + back];
}

/**
 * The offset that carries `later`'s band clear of `other`'s: the smallest whole number of
 * {@link CHAIN_STEP} tiers, travelled along the direction `later`'s own offset already
 * points (so the fix never flips a dimension to the far side of what it measures). `k` is
 * 1 in the ordinary case — two dims stacked in one tier — and more only when the
 * neighbour already sits further out. Rounded to whole millimetres, which keeps the
 * rewritten source readable and is orders of magnitude below the clearance it just bought.
 */
function retier(later: Band, other: Band, size: { back: number; fore: number; step: number }): number {
  const { back, fore, step } = size;
  const off = later.dm.offset;
  const dir = off > 0 ? 1 : -1;
  // `other`'s band in LATER's offset coordinate: distance along `later.n` from the segment
  // `later` measures, which is where its own `offset` is measured from.
  const t = dot(sub(other.mid, later.dm.from), later.n);
  const [lo, hi] = crossBand(t, dot(other.n, later.n) > 0, back, fore);
  // How far past its current offset the line must travel for the near edge of its band to
  // clear the far edge of the other's, in the direction it is already offset. `floor + 1`
  // (never `ceil`) so an exact multiple still lands strictly beyond, never touching.
  const need = dir > 0 ? hi + back - off : off - (lo - fore);
  const k = Math.max(1, Math.floor(need / step) + 1);
  return Math.round(off + dir * k * step);
}

/**
 * The two annotation sizes this rule measures against, in plan millimetres.
 *
 * `lint()` never builds a Scene, so there is no {@link import("../../scene.js").RenderSizes}
 * to read — the rule reconstructs the same two formulas `scene-build.ts` uses. With `paper`
 * the reconstruction is EXACT (every size is a fixed sheet millimetre × the scale
 * denominator). Without it, `refDim` is the drawing's own reference dimension, estimated
 * here from the plan's rooms, wall polylines and dimension endpoints rather than from every
 * element's registry `bounds()` — a few percent out at worst, on an advisory threshold.
 */
function annotationSizes(ctx: LintContext): { dimFont: number; tick: number } {
  const denom = ctx.ir.sheet?.denom;
  const refDim = denom !== undefined ? SHEET_MM.ref * denom : drawingRef(ctx);
  return {
    dimFont: denom !== undefined ? SHEET_MM.dimText * denom : refDim * 0.02,
    // The dimension tick is `refDim * 0.012` in elements/dim.ts — one formula, both modes.
    tick: refDim * 0.012,
  };
}

/** `max(width, height, 1)` of the plan's structural extent — the `refDim` a paperless
 *  drawing scales its annotation from. */
function drawingRef(ctx: LintContext): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const put = (p: Point): void => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const r of ctx.roomRects.values()) {
    put({ x: r.x, y: r.y });
    put({ x: r.x + r.w, y: r.y + r.h });
  }
  for (const w of ctx.ir.walls) for (const p of w.points) put(p);
  for (const e of ctx.ir.elements) {
    if (e.kind !== "dim") continue;
    put(e.from);
    put(e.to);
  }
  if (!Number.isFinite(minX)) return 1;
  return Math.max(maxX - minX, maxY - minY, 1);
}
