/** `furniture <category> [id=] at (x,y) size WxH [label "…"]` — outlined fill + label. */

import type { FurnitureAnchor, FurnitureNode, FurniturePlace, Point } from "../ast.js";
import { FURNITURE_ANCHORS } from "../ast.js";
import type { Span } from "../diagnostics.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RFurniture, RRoom } from "../ir.js";
import { rectCorners, segmentsOfWall, unit, normal, add, mul, sub, length } from "../geometry.js";
import { fixtureGlyph } from "./fixtures-glyphs.js";
import { defaultFootprint, orientationMatters } from "../fixtures-catalog.js";
import {
  ANCHOR_BACK_EDGES,
  backCandidateEdges,
  backingWallForRoomEdge,
  FIXTURE_WALL_TOL_MM,
  innerFaceOfRoomEdge,
  type RectEdge,
  rotateForBackEdge,
} from "../fixture-orientation.js";

const ANCHOR_SET: ReadonlySet<string> = new Set<FurnitureAnchor>(FURNITURE_ANCHORS);

/** Consume an optional `flush` modifier, recording its own byte span (so the
 *  "flush on a centred piece" diagnostic can point at the word, not the statement).
 *  Returns a spreadable partial so an absent `flush` adds no keys at all. */
function eatFlushOpt(ctx: ParseCtx): { flush?: true; flushSpan?: Span } {
  if (!ctx.isKeyword("flush")) return {};
  const t = ctx.next();
  return { flush: true, flushSpan: { start: t.start, end: t.end } };
}

export const furniture: ElementDef = {
  kind: "furniture",
  keyword: "furniture",
  doc: "A furniture item: an outlined rectangle with an optional label.",
  params: [
    { name: "category", type: "name", doc: "Furniture category, e.g. bed or sofa." },
    { name: "at", type: "point", doc: "Top-left corner (x, y) in mm." },
    { name: "size", type: "WxH", doc: "Width × height in mm." },
    { name: "label", type: "string", optional: true, doc: "Label (supports {interpolation})." },
  ],

  parse(ctx: ParseCtx): FurnitureNode {
    const kw = ctx.eatKeyword("furniture");
    const id = ctx.parseIdOpt();
    const category = ctx.eatIdent().value;
    // Position: absolute `at (x,y)`, wall-anchored `against wall <id> …`, or
    // room-relative `in <room> centered|anchor …`.
    let at: FurnitureNode["at"];
    let against: FurnitureNode["against"];
    let place: FurnitureNode["place"];
    let room: string | undefined;
    if (ctx.isKeyword("against")) {
      ctx.next();
      ctx.eatKeyword("wall");
      const wall = ctx.eatIdent().value;
      const a: NonNullable<FurnitureNode["against"]> = { wall };
      if (ctx.isKeyword("segment")) {
        ctx.next();
        a.segment = ctx.parseExpr();
      }
      if (ctx.isKeyword("offset")) {
        ctx.next();
        a.offset = ctx.parseExpr();
      }
      if (ctx.isKeyword("side")) {
        ctx.next();
        a.side = ctx.eatIdent().value as "left" | "right";
      }
      against = a;
    } else if (ctx.isKeyword("in")) {
      // `in <room> centered` | `in <room> anchor <a> [flush] [inset N]` — the `in`
      // room both positions and owns the fixture. `flush` comes before `inset`
      // because it re-bases it (room centerline → wall face), and the canonical
      // order is what the formatter emits.
      ctx.next();
      room = ctx.eatIdent().value;
      if (ctx.isKeyword("centered")) {
        ctx.next();
        // A centred piece is anchored to no edge, so `flush` has nothing to be
        // flush with — accepted here only so resolve can say so (E_FURN_FLUSH).
        place = { mode: "centered", ...eatFlushOpt(ctx) };
      } else if (ctx.isKeyword("anchor")) {
        ctx.next();
        const a = ctx.eatIdent().value;
        if (!ANCHOR_SET.has(a)) ctx.fail(`Expected an anchor (${FURNITURE_ANCHORS.join("|")}) but found "${a}"`);
        const p: Extract<FurniturePlace, { mode: "anchor" }> = {
          mode: "anchor",
          anchor: a as FurnitureAnchor,
          ...eatFlushOpt(ctx),
        };
        if (ctx.isKeyword("inset")) {
          ctx.next();
          p.inset = ctx.parseExpr();
          if (ctx.isKeyword("flush"))
            ctx.fail(`\`flush\` comes before \`inset\` — write \`anchor ${a} flush inset <mm>\``);
        }
        place = p;
      } else {
        ctx.fail(`Expected "centered" or "anchor" after \`in ${room}\``);
      }
    } else {
      ctx.eatKeyword("at");
      at = ctx.parsePoint();
    }
    // `size` is optional only for an `against wall` fixture with a catalogued default
    // footprint; resolve enforces that and errors otherwise.
    let size: FurnitureNode["size"];
    if (ctx.isKeyword("size")) {
      ctx.next();
      size = ctx.parseDimensions();
    }
    const node: FurnitureNode = {
      kind: "furniture",
      id,
      category,
      ...(at ? { at } : {}),
      ...(against ? { against } : {}),
      ...(place ? { place } : {}),
      ...(room ? { room } : {}),
      ...(size ? { size } : {}),
      line: kw.line,
    };
    if (ctx.isKeyword("label")) {
      ctx.next();
      node.label = ctx.parseStringExpr();
    }
    // Optional `rotate <0|90|180|270>` — quarter-turn the drawn symbol. Its byte
    // span (or the zero-width point where one could be inserted, which is HERE —
    // before the trailing `in <room>` the grammar puts last) is recorded on the node
    // so an orientation fix can rewrite the clause; see FurnitureNode.rotateSpan.
    const rotateAt = ctx.peek(-1).end;
    if (ctx.isKeyword("rotate")) {
      const rotKw = ctx.next();
      node.rotate = ctx.parseExpr();
      node.rotateSpan = { start: rotKw.start, end: ctx.peek(-1).end };
    } else {
      node.rotateSpan = { start: rotateAt, end: rotateAt };
    }
    // Optional trailing `in <roomId>` — declare the owning room (for the absolute
    // `at`/`against` forms; the room-relative form already set it above).
    if (node.room === undefined && ctx.isKeyword("in")) {
      ctx.next();
      node.room = ctx.eatIdent().value;
    }
    return node;
  },

  idPrefix: (node) => (node as FurnitureNode).category || "furniture",

  resolve(node, ctx: ResolveCtx): RFurniture {
    const n = node as FurnitureNode;
    const id = ctx.id;
    // Authored dims: plan w×h for `at`, wall-relative along×depth for `against`. When
    // `size` is omitted, an `against wall` fixture falls back to its catalogued default
    // footprint (closed-form, never a guess); anything else is the E_FURN_SIZE error.
    let dw: number;
    let dh: number;
    if (n.size) {
      dw = ctx.snap(ctx.eval(n.size.w));
      dh = ctx.snap(ctx.eval(n.size.h));
    } else {
      const fp = n.against ? defaultFootprint(n.category) : null;
      if (!fp) {
        ctx.diag({
          severity: "error",
          message: `Furniture "${id}" needs a \`size WxH\` (no default footprint for "${n.category}")`,
          code: "E_FURN_SIZE",
          span: n.span,
        });
        dw = 0;
        dh = 0;
      } else {
        dw = ctx.snap(fp.along);
        dh = ctx.snap(fp.depth);
      }
    }
    if (dw <= 0 || dh <= 0) {
      if (n.size)
        ctx.diag({
          severity: "error",
          message: `Furniture "${id}" must have a positive size`,
          code: "E_FURN_SIZE",
          span: n.span,
        });
    }
    let rotate: number | undefined;
    if (n.rotate !== undefined) {
      rotate = ((ctx.eval(n.rotate) % 360) + 360) % 360; // normalize to [0,360)
      if (rotate !== 0 && rotate !== 90 && rotate !== 180 && rotate !== 270) {
        ctx.diag({
          severity: "error",
          message: `Furniture "${id}" rotate must be 0, 90, 180, or 270`,
          code: "E_FURN_ROTATE",
          span: n.span,
        });
        rotate = 0;
      }
    }

    let at: Point;
    let size = { w: dw, h: dh };
    let roomOut = n.room;
    if (n.against) {
      if (rotate !== undefined) {
        ctx.diag({
          severity: "error",
          message: `Furniture "${id}" rotation is derived from the wall in \`against\` mode — drop \`rotate\``,
          code: "E_FURN_AGAINST",
          span: n.span,
        });
      }
      const placed = placeAgainst(id, n.against, dw, dh, n.room, ctx, n.span);
      at = placed ? ctx.snapPt(placed.at) : { x: 0, y: 0 };
      if (placed) {
        size = placed.size;
        rotate = placed.rotate;
      }
    } else if (n.place) {
      // Room-relative: closed-form corner/edge/centre placement inside the room box.
      // The anchor also names which room edge the piece backs onto, so for a fixture
      // whose facing means something and that the author did not turn by hand, the
      // rotation is derived from the wall on that edge — closed-form, and only when
      // exactly one candidate edge is walled (ADR 0005: no guess among alternatives).
      const placed = placeInRoom(
        id,
        n.place,
        n.room!,
        n.category,
        dw,
        dh,
        ctx,
        n.span,
        rotate === undefined && orientationMatters(n.category),
      );
      at = placed ? ctx.snapPt(placed.at) : { x: 0, y: 0 };
      if (placed?.rotate !== undefined) rotate = placed.rotate;
      if (!placed) roomOut = undefined; // room ref invalid — don't double-report via E_FURN_ROOM
    } else {
      at = ctx.snapPt(ctx.evalPt(n.at!));
    }
    return {
      kind: "furniture",
      id,
      category: n.category,
      at,
      size,
      label: n.label !== undefined ? ctx.evalStr(n.label) : undefined,
      ...(rotate ? { rotate } : {}),
      ...(n.place?.flush ? { flush: true } : {}),
      ...(roomOut ? { room: roomOut } : {}),
      ...(n.rotateSpan ? { _rotateSpan: n.rotateSpan } : {}),
      span: n.span,
    };
  },

  bounds(resolved): Point[] {
    const f = resolved as RFurniture;
    return rectCorners(f.at.x, f.at.y, f.size.w, f.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const f = resolved as RFurniture;
    const { theme, sizes } = ctx;
    const deg = f.rotate ?? 0;
    const cx = f.at.x + f.size.w / 2;
    const cy = f.at.y + f.size.h / 2;
    // Draw the symbol in its "back-on-top" frame, then quarter-turn it about the
    // footprint centre. For 90/270 the pre-rotation footprint has swapped dims so
    // the rotated symbol exactly fills the declared WxH (and bounds() stays right).
    const swap = deg === 90 || deg === 270;
    const pw = swap ? f.size.h : f.size.w;
    const ph = swap ? f.size.w : f.size.h;
    const rect = { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph };

    // Known plumbing/kitchen fixtures draw a real plan symbol; everything else
    // (bed, sofa, desk, …) falls back to the labelled rectangle.
    let nodes = fixtureGlyph(f.category, rect, theme, sizes);
    if (!nodes) {
      nodes = [];
      nodes.push({
        layer: "furniture",
        prim: { t: "polygon", pts: rectCorners(rect.x, rect.y, rect.w, rect.h) },
        paint: { fill: theme.furnitureFill, stroke: theme.furnitureStroke, width: sizes.thin },
      });
      if (f.label) {
        // Label stays at the centre (rotation-invariant) and upright.
        nodes.push({
          layer: "furniture",
          prim: {
            t: "text",
            at: { x: cx, y: cy },
            value: f.label,
            size: sizes.furnFont,
            anchor: "middle",
            baseline: "central",
          },
          paint: { fill: theme.furnitureLabel },
        });
      }
    }
    return deg === 0 ? nodes : nodes.map((n) => rotateNode(n, { x: cx, y: cy }, deg));
  },
};

/**
 * Resolve a wall-anchored `against wall …` placement to a concrete plan footprint:
 * top-left `at`, plan-axis `size` (w×h), and a derived quarter-turn `rotate` so the
 * symbol's back is flush against the chosen wall face. Pure & closed-form; pushes a
 * catalogued `E_FURN_AGAINST` and returns `null` on any ambiguity (never guesses).
 */
function placeAgainst(
  id: string,
  ag: NonNullable<FurnitureNode["against"]>,
  along: number,
  depth: number,
  roomId: string | undefined,
  ctx: ResolveCtx,
  span: Span | undefined,
): { at: Point; size: { w: number; h: number }; rotate: number } | null {
  const err = (message: string): null => {
    ctx.diag({ severity: "error", message: `Furniture "${id}" ${message}`, code: "E_FURN_AGAINST", span });
    return null;
  };
  const matches = ctx.walls.filter((w) => w.id === ag.wall || w.category === ag.wall);
  if (matches.length === 0) return err(`is placed \`against wall ${ag.wall}\` but no wall has that id or category`);
  if (matches.length > 1)
    return err(`\`against wall ${ag.wall}\` matches ${matches.length} walls — reference a unique wall id`);
  const wall = matches[0]!;
  const segs = segmentsOfWall(wall);
  let segIdx: number;
  if (ag.segment !== undefined) segIdx = Math.floor(ctx.eval(ag.segment));
  else if (segs.length === 1) segIdx = 0;
  else return err(`wall "${ag.wall}" has ${segs.length} segments — add \`segment <n>\``);
  if (segIdx < 0 || segIdx >= segs.length) return err(`segment ${segIdx} is out of range (0..${segs.length - 1})`);
  const seg = segs[segIdx]!;
  const d = unit(sub(seg.b, seg.a));
  const horiz = Math.abs(d.y) < 1e-9;
  const vert = Math.abs(d.x) < 1e-9;
  if (!horiz && !vert)
    return err(`segment ${segIdx} of wall "${ag.wall}" is not axis-aligned (placement supports quarter-turns only)`);
  const segLen = length(sub(seg.b, seg.a));
  const off = ag.offset !== undefined ? ctx.eval(ag.offset) : segLen / 2;
  if (off < 0 || off > segLen) return err(`offset ${off} is outside the segment run (0..${segLen})`);
  const nL = normal(d); // left normal of a→b (into the room for `side left`)

  // Which face to back onto: explicit `side`, else inferred from `in <room>` (the
  // side whose footprint falls inside that room) — avoids the wall-direction gotcha.
  let nSide: { x: number; y: number };
  if (ag.side !== undefined) {
    nSide = ag.side === "left" ? nL : mul(nL, -1);
  } else {
    const room = roomId ? ctx.rooms.find((r) => r.id === roomId) : undefined;
    if (!room) return err("needs `side left|right` (or `in <room>` to infer the wall face to back onto)");
    if (room._rel)
      return err(`can't infer \`side\` from a relationally-placed room "${roomId}" — give \`side left|right\``);
    const probe = (n: { x: number; y: number }) => add(add(seg.a, mul(d, off)), mul(n, seg.thickness / 2 + depth / 2));
    const inRoom = (p: Point): boolean =>
      p.x >= room.at.x && p.x <= room.at.x + room.size.w && p.y >= room.at.y && p.y <= room.at.y + room.size.h;
    const leftIn = inRoom(probe(nL));
    const rightIn = inRoom(probe(mul(nL, -1)));
    if (leftIn === rightIn)
      return err(
        `can't infer \`side\` from \`in ${roomId}\` (neither/both faces fall inside) — give \`side left|right\``,
      );
    nSide = leftIn ? nL : mul(nL, -1);
  }
  const center = add(add(seg.a, mul(d, off)), mul(nSide, seg.thickness / 2 + depth / 2));
  const bw = horiz ? along : depth;
  const bh = horiz ? depth : along;
  // The wall sits on the −nSide face, so the symbol's back goes on that footprint
  // edge; the edge → quarter-turn mapping is the shared one (rotate 0 = back north),
  // so `against wall` and the room-anchored derivation can never disagree.
  const backEdge: RectEdge =
    Math.abs(nSide.x) < 1e-9 ? (nSide.y > 0 ? "top" : "bottom") : nSide.x < 0 ? "right" : "left";
  const rotate = rotateForBackEdge(backEdge);
  return { at: { x: center.x - bw / 2, y: center.y - bh / 2 }, size: { w: bw, h: bh }, rotate };
}

/**
 * `flush` is only meaningful when the placement pushes the piece onto an edge, since
 * an edge is the only thing that has a wall face to be flush with. A centred piece
 * (`centered`, or the equivalent `anchor center`) names none, so this reports the
 * combination as a usage error instead of silently ignoring the word. Points at the
 * `flush` keyword itself when the parser recorded its span. No-op when `flush` is absent.
 */
function flushWithoutEdge(
  id: string,
  place: NonNullable<FurnitureNode["place"]>,
  ctx: ResolveCtx,
  span: Span | undefined,
): void {
  if (!place.flush) return;
  const where = place.mode === "centered" ? "`centered`" : "`anchor center`";
  ctx.diag({
    severity: "error",
    message: `Furniture "${id}" is ${where}, which touches no edge — \`flush\` has no wall face to measure from`,
    code: "E_FURN_FLUSH",
    span: place.flushSpan ?? span,
  });
}

/**
 * Closed-form room-relative placement (`in <room> centered|anchor …`): the
 * fixture's top-left corner inside the resolved room box, plus — when `derive` is
 * set — the quarter-turn that puts the fixture's back against the wall the anchor
 * names. Pure; pushes a catalogued `E_PLACE_REF` and returns `null` when the room
 * is unknown or is positioned relationally (its box is not yet fixed when the
 * fixture resolves).
 *
 * The derivation is deliberately narrow (ADR 0005 — no invisible architect): the
 * anchor must name a **unique** backed edge. `anchor bottom` on a room whose south
 * edge carries a wall is one unambiguous answer, so it is derived; a corner anchor
 * with walls on both of its edges, or an anchor whose edge has no wall at all, has
 * no unique answer, so nothing is derived and `lint` says so instead
 * (`W_FIXTURE_BACK_TO_ROOM`). `centered` names no edge, so it never derives.
 *
 * `flush` re-bases the `inset` of each anchored edge from the room rectangle (a wall
 * CENTERLINE) to that wall's inner face, per edge and independently — a corner anchor
 * can be flush on one edge and room-referenced on the other, and an edge with no wall
 * behind it keeps the room-rect reference (there is no face to measure from). It is a
 * *position* rule only: it runs before the rotation derivation and shares its
 * "is there a wall behind this edge?" question, so the two always agree about which
 * wall the piece is on.
 */
function placeInRoom(
  id: string,
  place: NonNullable<FurnitureNode["place"]>,
  roomId: string,
  category: string,
  w: number,
  h: number,
  ctx: ResolveCtx,
  span: Span | undefined,
  derive: boolean,
): { at: Point; rotate?: number } | null {
  const room = ctx.rooms.find((r): r is RRoom => r.id === roomId);
  if (!room || room._rel) {
    ctx.diag({
      severity: "error",
      message: `Furniture "${id}" is placed \`in ${roomId}\` but no room with that id has fixed \`at\` coordinates`,
      code: "E_PLACE_REF",
      span,
    });
    return null;
  }
  // `in <room> anchor|centered` measures from the room RECTANGLE's corners, edges and
  // centre. A polygon room has none of those as a whole — its bounding box is not its
  // floor, so "anchor bottom-left" could land the piece in a notch that is outside the
  // room. Refuse and name the alternative rather than place it somewhere plausible-
  // looking and wrong (ADR 0005 — the core never guesses).
  if (room.poly) {
    ctx.diag({
      severity: "error",
      message: `Furniture "${id}" is placed \`in ${roomId}\` with \`${place.mode === "centered" ? "centered" : `anchor ${place.anchor}`}\`, but "${roomId}" is a polygon room — anchored placement needs a rectangular room. Place it with \`at (x,y)\` (plus \`rotate\`) instead.`,
      code: "E_PLACE_POLY",
      span,
    });
    return null;
  }
  const x0 = room.at.x;
  const y0 = room.at.y;
  const x1 = x0 + room.size.w;
  const y1 = y0 + room.size.h;
  const cx = x0 + room.size.w / 2;
  const cy = y0 + room.size.h / 2;
  if (place.mode === "centered") {
    flushWithoutEdge(id, place, ctx, span);
    return { at: { x: cx - w / 2, y: cy - h / 2 } };
  }
  const inset = place.inset !== undefined ? ctx.eval(place.inset) : 0;
  const a = place.anchor;
  const roomRect = { x: x0, y: y0, w: room.size.w, h: room.size.h };
  // `flush` re-bases the anchored edge(s) from the room rectangle (wall centerlines)
  // to the backing wall's inner face. `null` = keep the room-rect edge, either because
  // the author did not ask for `flush` or because that edge has no wall behind it.
  if (place.flush && ANCHOR_BACK_EDGES[a].length === 0) flushWithoutEdge(id, place, ctx, span);
  const face = (e: RectEdge): number | null =>
    place.flush && ANCHOR_BACK_EDGES[a].includes(e)
      ? innerFaceOfRoomEdge(roomRect, e, ctx.walls, FIXTURE_WALL_TOL_MM)
      : null;
  let x: number;
  if (a === "top-left" || a === "left" || a === "bottom-left") x = (face("left") ?? x0) + inset;
  else if (a === "top-right" || a === "right" || a === "bottom-right") x = (face("right") ?? x1) - w - inset;
  else x = cx - w / 2; // top | center | bottom → horizontally centred
  let y: number;
  if (a === "top-left" || a === "top" || a === "top-right") y = (face("top") ?? y0) + inset;
  else if (a === "bottom-left" || a === "bottom" || a === "bottom-right") y = (face("bottom") ?? y1) - h - inset;
  else y = cy - h / 2; // left | center | right → vertically centred
  const at = { x, y };
  if (!derive) return { at };
  // Two independent closed-form constraints: the anchor names the edge(s) the piece
  // is pushed against, and the footprint's aspect says which edges can physically be
  // its back. A single walled edge in both = one answer; anything else = no rotation.
  const shape = backCandidateEdges({ w, h }, defaultFootprint(category));
  const backed = ANCHOR_BACK_EDGES[a].filter(
    (e) => shape.includes(e) && backingWallForRoomEdge(roomRect, e, ctx.walls, FIXTURE_WALL_TOL_MM) !== null,
  );
  return backed.length === 1 ? { at, rotate: rotateForBackEdge(backed[0]!) } : { at };
}

/** Rotate a point a quarter-turn about centre `c` (screen y-down, clockwise) using
 *  exact arithmetic — no trig, so output stays byte-stable. */
function rotatePoint(p: Point, c: Point, deg: number): Point {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  switch (deg) {
    case 90:
      return { x: c.x - dy, y: c.y + dx };
    case 180:
      return { x: c.x - dx, y: c.y - dy };
    case 270:
      return { x: c.x + dy, y: c.y - dx };
    default:
      return p;
  }
}

/** Rotate a scene node's geometry about `c`. Fixture glyphs use polygon/line/text;
 *  text at the centre is rotation-invariant so labels stay put and upright. */
function rotateNode(n: SceneNode, c: Point, deg: number): SceneNode {
  const rp = (p: Point): Point => rotatePoint(p, c, deg);
  const prim = n.prim;
  switch (prim.t) {
    case "polygon":
      return { ...n, prim: { ...prim, pts: prim.pts.map(rp) } };
    case "line":
      return { ...n, prim: { ...prim, a: rp(prim.a), b: rp(prim.b) } };
    case "text":
      return { ...n, prim: { ...prim, at: rp(prim.at) } };
    case "circle":
      return { ...n, prim: { ...prim, center: rp(prim.center) } };
    default:
      return n;
  }
}
