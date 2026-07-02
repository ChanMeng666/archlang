/** `furniture <category> [id=] at (x,y) size WxH [label "…"]` — outlined fill + label. */

import type { FurnitureNode, Point } from "../ast.js";
import type { Span } from "../diagnostics.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RFurniture } from "../ir.js";
import { rectCorners, segmentsOfWall, unit, normal, add, mul, sub, length } from "../geometry.js";
import { fixtureGlyph } from "./fixtures-glyphs.js";
import { defaultFootprint } from "../fixtures-catalog.js";

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
    // Position: absolute `at (x,y)` OR wall-anchored `against wall <id> …`.
    let at: FurnitureNode["at"];
    let against: FurnitureNode["against"];
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
      ...(size ? { size } : {}),
      line: kw.line,
    };
    if (ctx.isKeyword("label")) {
      ctx.next();
      node.label = ctx.parseStringExpr();
    }
    // Optional `rotate <0|90|180|270>` — quarter-turn the drawn symbol.
    if (ctx.isKeyword("rotate")) {
      ctx.next();
      node.rotate = ctx.parseExpr();
    }
    // Optional `in <roomId>` — declare which room this fixture belongs to.
    if (ctx.isKeyword("in")) {
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
      ...(n.room ? { room: n.room } : {}),
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
  // The symbol's back faces the wall (−nSide); rotate 0 = back to the north.
  const rotate = Math.abs(nSide.x) < 1e-9 ? (nSide.y > 0 ? 0 : 180) : nSide.x < 0 ? 90 : 270;
  return { at: { x: center.x - bw / 2, y: center.y - bh / 2 }, size: { w: bw, h: bh }, rotate };
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
    default:
      return n;
  }
}
