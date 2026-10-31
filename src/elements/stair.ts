/**
 * `stair [id=] at (x,y) size WxH dir up|down [width <mm>]` — a straight flight of
 * stairs drawn as the conventional plan symbol. Or the block form (issue #362),
 * `stair [id=] dir up|down width <mm> { flight … landing … flight … }`: one stair of
 * authored rectangles, in climbing order on every storey.
 *
 * A stair is vertical circulation, so it is more than a drawing: the same `id` on two
 * `level` blocks declares one shaft, which is what lets `describe()` report a `vertical`
 * connection and lets an upper storey be reachable without its own front door. All of
 * that shared meaning lives in `src/vertical.ts`; this module owns only the grammar, the
 * resolve rules and the dispatch to the symbol in `vertical-glyphs.ts`.
 *
 * **What a block's flights mean.** Each is entered and left across the edges it shares with its
 * neighbours, so its direction is arithmetic on what the author wrote (ADR 0004), and neither
 * its long side nor an `entry` word decides it. Nothing here lays a stair out: a piece that does
 * not meet the next is refused (`E_STAIR_PIECES`), never moved.
 */

import type { Point, StairNode, StairPiece, VerticalDir } from "../ast.js";
import { VERTICAL_DIRS } from "../ast.js";
import { oppositeSide, type Side } from "../algebra/d4.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import { chargeSteps } from "../expr.js";
import { VERTEX_EPS } from "../geometry/polygon.js";
import { type BBox, overlap1d } from "../geometry/rect.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RStair, RStairFlight, RStairPiece } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { fmt3 } from "../num-format.js";
import { flightAxis, flightsOf, isBlockStair, piecesOf, tailEdge } from "../vertical.js";
import { runTooLong, runTreads, stairGlyph } from "./vertical-glyphs.js";

/** Parse the mandatory `dir up|down` clause shared by `stair` and `escalator`. */
export function parseVerticalDir(ctx: ParseCtx, keyword: string): VerticalDir {
  ctx.eatKeyword("dir");
  const t = ctx.eatIdent();
  if (!(VERTICAL_DIRS as readonly string[]).includes(t.value))
    ctx.fail(
      `Expected ${VERTICAL_DIRS.map((d) => `\`dir ${d}\``).join(" or ")} after \`${keyword}\` but found "${t.value}"`,
      t,
    );
  return t.value as VerticalDir;
}

/** The block form, read from its `dir` on: `flight` and `landing` mean something only in here. */
function parseBlock(ctx: ParseCtx, id: string, line: number): StairNode {
  const dir = parseVerticalDir(ctx, "stair");
  const pieces: StairPiece[] = [];
  const node: StairNode = { kind: "stair", id, dir, pieces, line };
  if (ctx.isKeyword("width")) {
    ctx.next();
    node.width = ctx.parseExpr();
  }
  if (!ctx.isType("lcurly")) {
    ctx.fail(
      `Expected "{" to open the stair's flights and landings; a straight stair takes \`at\` and \`size\` before \`dir\``,
    );
  }
  ctx.next();
  while (!ctx.isType("rcurly") && !ctx.isType("eof")) {
    const t = ctx.peek();
    if (!ctx.isKeyword("flight") && !ctx.isKeyword("landing")) {
      ctx.fail(
        `Expected "flight" or "landing" in the \`stair\` block but found ${t.type === "eof" ? "end of input" : `"${t.value}"`}`,
      );
    }
    ctx.next();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    pieces.push({ kind: t.value as StairPiece["kind"], at, size, span: ctx.spanFrom(t.start) });
  }
  ctx.eat("rcurly");
  return node;
}

/** Where piece `b` touches piece `a`: `a`'s side and the stretch of that side they share. */
interface Contact {
  side: Side;
  lo: number;
  hi: number;
}

/** The side of `a` that `b` stands against, or null when they share no length of edge. A corner
 *  is not a contact. Two rectangles that do not overlap touch along one side at most. */
function contact(a: BBox, b: BBox): Contact | null {
  const side: Side | null =
    Math.abs(a.x + a.w - b.x) <= VERTEX_EPS
      ? "right"
      : Math.abs(b.x + b.w - a.x) <= VERTEX_EPS
        ? "left"
        : Math.abs(a.y + a.h - b.y) <= VERTEX_EPS
          ? "bottom"
          : Math.abs(b.y + b.h - a.y) <= VERTEX_EPS
            ? "top"
            : null;
  if (side === null) return null;
  const upright = side === "left" || side === "right";
  const lo = upright ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  const hi = upright ? Math.min(a.y + a.h, b.y + b.h) : Math.min(a.x + a.w, b.x + b.w);
  return hi - lo > VERTEX_EPS ? { side, lo, hi } : null;
}

/** Do `a` and `b` share area? A touch is not an overlap. */
const overlapsArea = (a: BBox, b: BBox): boolean =>
  overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) > VERTEX_EPS && overlap1d(a.y, a.y + a.h, b.y, b.y + b.h) > VERTEX_EPS;

/** A flight's extent across its travel, and the centre of that extent. */
function across(r: BBox, tail: Side): { extent: number; centre: number } {
  return tail === "top" || tail === "bottom"
    ? { extent: r.w, centre: r.x + r.w / 2 }
    : { extent: r.h, centre: r.y + r.h / 2 };
}

/** The bounding box of the pieces: what `at` and `size` hold on a block stair. */
function unionOf(rects: readonly BBox[]): { at: Point; size: { w: number; h: number } } {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return rects.length > 0
    ? { at: { x: x0, y: y0 }, size: { w: x1 - x0, h: y1 - y0 } }
    : { at: { x: 0, y: 0 }, size: { w: 0, h: 0 } };
}

/**
 * Why these pieces are not one stair, or null. In climbing order, `rects` matching `pieces`, the
 * cheapest refusal first. Every pair is compared, charged before the loop: a flight may not stand
 * on a piece it does not touch either.
 */
function refusal(
  id: string,
  pieces: readonly StairPiece[],
  rects: readonly BBox[],
  hasWidth: boolean,
): { why: string; span?: Span } | null {
  if (!hasWidth) return { why: `Stair "${id}" needs \`width\`, the width of its flights` };
  if (pieces.length === 0) return { why: `Stair "${id}" has no flights` };
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i]!.kind !== (i % 2 === 0 ? "flight" : "landing")) {
      return {
        why: `Stair "${id}" must alternate flights and landings: piece ${i + 1} is a ${pieces[i]!.kind}`,
        span: pieces[i]!.span,
      };
    }
  }
  const last = pieces[pieces.length - 1]!;
  if (last.kind !== "flight") return { why: `Stair "${id}" must end on a flight, not a landing`, span: last.span };
  if (pieces.length < 3)
    return { why: `Stair "${id}" needs at least two flights; a single flight is the straight form` };
  chargeSteps((pieces.length * (pieces.length - 1)) / 2);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlapsArea(rects[i]!, rects[j]!)) {
        return { why: `Stair "${id}": pieces ${i + 1} and ${j + 1} overlap`, span: pieces[j]!.span };
      }
    }
  }
  return null;
}

/**
 * The block's flights: each one's tail on this storey (`dir up` boards the first flight's foot,
 * `dir down` the last flight's head), from the edges it shares with its neighbours. Refused, as
 * a message and a span, when a neighbour does not touch, or a flight would have to turn.
 */
function climbFlights(
  id: string,
  dir: VerticalDir,
  pieces: readonly StairPiece[],
  rects: readonly BBox[],
): RStairFlight[] | { why: string; span: Span } {
  const out: RStairFlight[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const r = rects[i]!;
    const prev = i > 0 ? contact(r, rects[i - 1]!) : undefined;
    const next = i + 1 < pieces.length ? contact(r, rects[i + 1]!) : undefined;
    const broken = prev === null ? i - 1 : next === null ? i + 1 : -1;
    if (broken >= 0) {
      return {
        why: `Stair "${id}": pieces ${Math.min(i, broken) + 1} and ${Math.max(i, broken) + 1} are consecutive, so they must share a length of edge`,
        span: pieces[Math.max(i, broken)]!.span,
      };
    }
    const foot = prev?.side ?? oppositeSide(next!.side);
    const head = next?.side ?? oppositeSide(prev!.side);
    if (head !== oppositeSide(foot)) {
      return {
        why: `Stair "${id}": flight ${i / 2 + 1} is entered on its ${foot} edge and left on its ${head} edge, but a flight runs straight: use a landing to turn`,
        span: pieces[i]!.span,
      };
    }
    out.push({ at: { x: r.x, y: r.y }, size: { w: r.w, h: r.h }, tail: dir === "up" ? foot : head });
  }
  return out;
}

/** Does the stretch `c` hold the flight band centred on `centre`? A flight lands whole. */
function bandHeld(c: Contact, centre: number, width: number): boolean {
  return c.lo - VERTEX_EPS <= centre - width / 2 && centre + width / 2 <= c.hi + VERTEX_EPS;
}

/** Resolve the block form: the checks of `E_STAIR_PIECES`, then the record every reader takes. */
function resolveBlock(n: StairNode, ctx: ResolveCtx): RStair {
  const id = ctx.id;
  const pieces = n.pieces!;
  // Each piece is a footprint the walking grid, lint and the drawing read, as a whole element
  // is, so it counts as one past the one the statement was charged at expansion.
  if (pieces.length > 1 && ctx.elementBudget && !ctx.elementBudget(pieces.length - 1)) {
    ctx.diag({
      severity: "error",
      message: `Stair "${id}" has ${pieces.length} pieces: more than the plan's element budget`,
      code: "E_ELEMENT_LIMIT",
      span: n.span,
    });
    return { kind: "stair", id, at: { x: 0, y: 0 }, size: { w: 0, h: 0 }, dir: n.dir, width: 0, span: n.span };
  }
  const width = n.width === undefined ? 0 : ctx.snap(ctx.eval(n.width));
  const rects: BBox[] = pieces.map((p): BBox => {
    const at = ctx.snapPt(ctx.evalPt(p.at));
    return { x: at.x, y: at.y, w: ctx.snap(ctx.eval(p.size.w)), h: ctx.snap(ctx.eval(p.size.h)) };
  });
  const box = unionOf(rects);
  const stop = (d: Diagnostic): RStair => {
    ctx.diag(d);
    return { kind: "stair", id, ...box, dir: n.dir, width: 0, span: n.span };
  };
  const sized = rects.findIndex((r) => !(r.w > 0 && r.h > 0));
  if (sized >= 0) {
    return stop({
      severity: "error",
      message: `Stair "${id}": piece ${sized + 1} must have a positive size`,
      code: "E_VERT_SIZE",
      span: pieces[sized]!.span,
    });
  }
  const bad = refusal(id, pieces, rects, n.width !== undefined);
  if (bad) return stop({ severity: "error", message: bad.why, code: "E_STAIR_PIECES", span: bad.span ?? n.span });
  const flights = climbFlights(id, n.dir, pieces, rects);
  if ("why" in flights)
    return stop({ severity: "error", message: flights.why, code: "E_STAIR_PIECES", span: flights.span });
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i]!;
    const r = rects[i * 2]!;
    const { extent, centre } = across(r, f.tail);
    if (width <= 0 || width > extent) {
      return stop({
        severity: "error",
        message: `Stair "${id}" flight \`width\` must be between 0 and flight ${i + 1}'s extent across its run (${fmt3(extent)} mm)`,
        code: "E_STAIR_WIDTH",
        span: pieces[i * 2]!.span,
      });
    }
    for (const j of [i * 2 - 1, i * 2 + 1]) {
      if (j < 0 || j >= rects.length) continue;
      if (!bandHeld(contact(r, rects[j]!)!, centre, width)) {
        return stop({
          severity: "error",
          message: `Stair "${id}": flight ${i + 1}, ${fmt3(width)} mm wide and centred in its footprint, does not meet piece ${j + 1} along its whole width`,
          code: "E_STAIR_PIECES",
          span: pieces[j]!.span,
        });
      }
    }
    const axial = f.tail === "top" || f.tail === "bottom" ? r.h : r.w;
    const long = runTooLong(`Stair "${id}" flight ${i + 1}`, { w: axial, h: 0 }, pieces[i * 2]!.span);
    if (long) return stop(long);
  }
  const landings: RStairPiece[] = rects
    .filter((_, i) => i % 2 === 1)
    .map((r) => ({ at: { x: r.x, y: r.y }, size: { w: r.w, h: r.h } }));
  const boarded = n.dir === "up" ? flights[0]! : flights[flights.length - 1]!;
  return { kind: "stair", id, ...box, dir: n.dir, width, flights, landings, _tail: boarded.tail, span: n.span };
}

export const stair: ElementDef = {
  kind: "stair",
  keyword: "stair",
  doc: "A straight flight of stairs: treads, a break line and an UP/DN direction arrow. Or one turning stair, written `stair dir up width 1000 { flight … landing … flight … }`: each `flight` and `landing` takes its own `at` and `size`, in climbing order on every storey, and each touches the next.",
  params: [
    {
      name: "at",
      type: "point",
      optional: true,
      doc: "Top-left corner (x, y) of a straight stair's footprint, in mm. A turning stair has none: its pieces do.",
    },
    {
      name: "size",
      type: "WxH",
      optional: true,
      doc: "A straight stair's footprint, width × height in mm; the flight runs along the LONG axis. A turning stair has none: its pieces do.",
    },
    { name: "dir", type: "up|down", doc: "Which way this stair goes from THIS storey — draws UP or DN." },
    {
      name: "width",
      type: "number",
      optional: true,
      default: "on a straight stair, the footprint's cross-axis extent",
      doc: "Flight width across the run, in mm; may not exceed the footprint. A turning stair must state it.",
    },
  ],

  parse(ctx: ParseCtx): StairNode {
    const kw = ctx.eatKeyword("stair");
    const id = ctx.parseIdOpt();
    if (ctx.isKeyword("dir")) return parseBlock(ctx, id, kw.line);
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const dir = parseVerticalDir(ctx, "stair");
    const node: StairNode = { kind: "stair", id, at, size, dir, line: kw.line };
    if (ctx.isKeyword("width")) {
      ctx.next();
      node.width = ctx.parseExpr();
    }
    return node;
  },

  idPrefix: () => "stair",

  resolve(node, ctx: ResolveCtx): RStair {
    const n = node as StairNode;
    if (n.pieces !== undefined) return resolveBlock(n, ctx);
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at!));
    const size = { w: ctx.snap(ctx.eval(n.size!.w)), h: ctx.snap(ctx.eval(n.size!.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Stair "${id}" must have a positive size`,
        code: "E_VERT_SIZE",
        span: n.span,
      });
    }
    // The flight runs along the long axis, so its width is measured across the short one.
    const cross = flightAxis(size) === "y" ? size.w : size.h;
    let width = cross;
    if (n.width !== undefined) {
      width = ctx.snap(ctx.eval(n.width));
      if (width <= 0 || width > cross) {
        ctx.diag({
          severity: "error",
          message: `Stair "${id}" flight \`width\` must be between 0 and the footprint's cross extent (${cross} mm)`,
          code: "E_STAIR_WIDTH",
          span: n.span,
        });
        width = cross;
      }
    }
    const long = runTooLong(`Stair "${id}"`, size, n.span);
    if (long) ctx.diag(long);
    return { kind: "stair", id, at, size, dir: n.dir, width, span: n.span };
  },

  bounds(resolved): Point[] {
    const s = resolved as RStair;
    return piecesOf(s).flatMap((r) => rectCorners(r.x, r.y, r.w, r.h));
  },

  /** A block's lengths: every coordinate is a corner in `bounds()`, and a length is not. */
  measures(resolved): number[] {
    const s = resolved as RStair;
    return isBlockStair(s) ? [s.width, ...piecesOf(s).flatMap((r) => [r.w, r.h])] : [];
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    return stairGlyph(resolved as RStair, ctx.theme, ctx.sizes);
  },
  /** At most one tread line per division plus eight (`stairGlyph`: the footprint, the two
   *  break lines, the two band edges and the four-stroke arrow), for the drawing budget. A block
   *  stair is that per flight, an outline per landing and up to three more strokes of its
   *  walking line per landing, which is more than `blockStairGlyph` draws, its one break line,
   *  arrowhead and word being counted on every flight. */
  drawCost(resolved): number {
    const s = resolved as RStair;
    if (!isBlockStair(s)) return runTreads(s) + 8;
    return flightsOf(s).reduce((n, f) => n + runTreads(f) + 8, 0) + 4 * s.landings.length;
  },
  /**
   * The frame's action on a stair (`frame.ts`'s `transformElement` calls this). The tail is
   * read in the LOCAL frame and acted on (`_tail`), so the arrow and the nav grid's entry
   * edge follow the turn; a reflection also mirrors the break line (`_mirror`, XORed so a
   * nested reflection composes back to the identity, as a fixture's does).
   */
  transform(resolved, t: TransformCtx): RStair {
    const el = resolved as RStair;
    const { id } = t;
    const r = t.rect(el.at, el.size);
    const out: RStair = { ...el, id, at: r.at, size: r.size, _tail: t.side(tailEdge(el)) };
    if (el.flights !== undefined) {
      out.flights = el.flights.map((f) => ({ ...t.rect(f.at, f.size), tail: t.side(f.tail) }));
      out.landings = el.landings!.map((l) => t.rect(l.at, l.size));
    }
    if (t.reflected !== (el._mirror === true)) out._mirror = true;
    else delete out._mirror;
    return out;
  },
};
