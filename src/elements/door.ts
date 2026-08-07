/** `door [id=] at (x,y) width N [wall ref] [hinge l|r] [swing in|out]` — opening + leaf + swing arc. */

import type { DoorNode, Point } from "../ast.js";
import type { Span } from "../diagnostics.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RDoor, RRoom } from "../ir.js";
import type { Value } from "../expr.js";
import type { WallSegment } from "../geometry.js";
import { add, doorSwing, mul, nearestWallNote, normal, segmentDirAt, sub, unit } from "../geometry.js";
import { pointInPolygon, pointOnPolygonEdge } from "../geometry/polygon.js";
import { parseAttachTarget, resolveAttachment } from "../attach.js";
import { emitOpening, fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";

/** Read an enum override from the active `set` defaults, if valid. */
function enumDefault<T extends string>(
  defaults: ReadonlyMap<string, Value> | undefined,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const v = defaults?.get(key);
  return v && v.t === "str" && (allowed as readonly string[]).includes(v.v) ? (v.v as T) : undefined;
}

/**
 * Choose the internal `in|out` value so a `swing into <room>` door opens toward
 * that room. The leaf sweeps to the wall's `+normal` side when `in` and `-normal`
 * when `out` (see {@link doorSwing}). Returns `undefined` (after a
 * `W_SWING_ROOM_NOT_ADJACENT` warning) when the room does not border the host wall,
 * so the caller falls back to the default.
 *
 * Two questions, and both are asked of the room's own FLOOR, not of its bounding box:
 *
 * - **Does the room border this wall?** — the door point must lie on the room's
 *   perimeter. A rectangle's perimeter is its four sides; a `polygon`/`circle` room's
 *   is its ring ({@link RRoom.poly}, which a circle also carries).
 * - **Which side is the room on?** — a probe one wall thickness off each face; the
 *   room is on the side whose probe lands on the floor. For a rectangle that is the
 *   historical centre-of-the-rectangle answer, byte for byte, because the rectangle's
 *   centre is always on the inward side of every one of its own edges. For a concave
 *   ring it is not: an L's bounding-box centre sits in the notch, which is not floor,
 *   so a bbox-derived side is a coin flip. A probe is local and exact.
 *
 * Neither probe landing on the floor (or both) means the door is not on a face of this
 * room after all — the same "does not border its wall" answer, reported the same way.
 */
function swingInto(
  roomId: string,
  at: Point,
  host: WallSegment | null,
  rooms: readonly RRoom[],
  ctx: ResolveCtx,
  id: string,
  span: Span | undefined,
): "in" | "out" | undefined {
  const notAdjacent = (): undefined => {
    ctx.diag({
      severity: "warning",
      message: `Door "${id}" swings into "${roomId}", which does not border its wall — using the default swing`,
      code: "W_SWING_ROOM_NOT_ADJACENT",
      span,
    });
    return undefined;
  };
  const room = rooms.find((r) => r.id === roomId);
  if (!room || !host || room._rel) return notAdjacent();
  // The room borders the wall if the door position sits on the room's perimeter.
  const tol = host.thickness / 2 + Math.max(host.thickness, 1);
  const n = normal(unit(sub(host.b, host.a)));
  // —— Ring path: a `polygon` or `circle` room (a circle carries the 48-gon in `poly`). ——
  if (room.poly) {
    const ring = room.poly;
    if (!pointOnPolygonEdge(at, ring, tol)) return notAdjacent();
    // One wall thickness clears the solid on either face, so a probe that lands on the
    // floor is genuinely inside the room rather than inside the wall.
    const d = Math.max(host.thickness, 1);
    const inPos = pointInPolygon(at.x + n.x * d, at.y + n.y * d, ring);
    const inNeg = pointInPolygon(at.x - n.x * d, at.y - n.y * d, ring);
    if (inPos === inNeg) return notAdjacent();
    return inPos ? "in" : "out";
  }
  // —— Rectangle path: UNCHANGED, byte-identical. ——
  const { x, y } = room.at;
  const x1 = x + room.size.w;
  const y1 = y + room.size.h;
  const onVert = (ex: number) => Math.abs(at.x - ex) <= tol && at.y >= y - tol && at.y <= y1 + tol;
  const onHoriz = (ey: number) => Math.abs(at.y - ey) <= tol && at.x >= x - tol && at.x <= x1 + tol;
  if (!(onVert(x) || onVert(x1) || onHoriz(y) || onHoriz(y1))) return notAdjacent();
  const cx = x + room.size.w / 2;
  const cy = y + room.size.h / 2;
  const dot = (cx - at.x) * n.x + (cy - at.y) * n.y;
  if (dot === 0) return notAdjacent();
  return dot > 0 ? "in" : "out";
}

export const door: ElementDef = {
  kind: "door",
  keyword: "door",
  doc: "A door: an opening in its host wall with a leaf and swing arc.",
  params: [
    { name: "at", type: "point", doc: "Hinge/center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Door width (leaf length) in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
    { name: "hinge", type: "left|right", optional: true, doc: "Hinge side relative to wall direction." },
    { name: "swing", type: "in|out", optional: true, doc: "Swing direction." },
  ],

  parse(ctx: ParseCtx): DoorNode {
    const kw = ctx.eatKeyword("door");
    const id = ctx.parseIdOpt();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: DoorNode = {
      kind: "door",
      id,
      width,
      line: kw.line,
      ...(at ? { at } : {}),
      ...(attach ? { attach } : {}),
    };
    if (!attach && ctx.isKeyword("wall")) {
      ctx.next();
      node.wall = ctx.eatIdent().value;
    }
    if (ctx.isKeyword("hinge")) {
      ctx.next();
      // `hinge near start|end` fixes the hinge to a wall vertex; `hinge left|right`
      // is relative to the wall's traversal direction (the older form).
      if (ctx.isKeyword("near")) {
        ctx.next();
        const s = ctx.eatIdent().value;
        if (s !== "start" && s !== "end") ctx.fail(`Expected hinge near "start" or "end" but found "${s}"`);
        node.hingeNear = s;
      } else {
        const h = ctx.eatIdent().value;
        if (h !== "left" && h !== "right") ctx.fail(`Expected hinge "left" or "right" but found "${h}"`);
        node.hinge = h;
      }
    }
    if (ctx.isKeyword("swing")) {
      ctx.next();
      // `swing into <room>` picks in/out toward that room; `swing in|out` is explicit.
      if (ctx.isKeyword("into")) {
        ctx.next();
        node.swingInto = ctx.eatIdent().value;
      } else {
        const s = ctx.eatIdent().value;
        if (s !== "in" && s !== "out") ctx.fail(`Expected swing "in" or "out" but found "${s}"`);
        node.swing = s;
      }
    }
    return node;
  },

  idPrefix: () => "door",

  resolve(node, ctx: ResolveCtx): RDoor {
    const n = node as DoorNode;
    const id = ctx.id;
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({
        severity: "error",
        message: `Door "${id}" must have a positive width`,
        code: "E_DOOR_WIDTH",
        span: n.span,
        ...fixesFrom(openingWidthFix("door", n)),
      });
    }
    // Position + host: either walk the attached wall, or the classic point + nearest
    // wall (with the off-wall check kept for the point form only).
    let at: Point;
    let host: WallSegment | null;
    if (n.attach) {
      const a = resolveAttachment(n.attach, ctx.walls, ctx.snapPt, ctx.diag, `Door "${id}"`);
      at = a ? a.at : { x: 0, y: 0 };
      host = a ? a.host : null;
    } else {
      at = ctx.snapPt(ctx.evalPt(n.at!));
      host = ctx.hostSegment(at, n.wall);
      if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
        const note = nearestWallNote(at, ctx.walls);
        ctx.diag({
          severity: "warning",
          message: `Door "${id}" does not lie on any wall`,
          code: "W_DOOR_OFF_WALL",
          span: n.span,
          relatedSpans: note ? [note] : undefined,
          ...fixesFrom(offWallFix("door", n, at, ctx.walls)),
        });
      }
    }
    // Precedence: explicit attribute > derived (`near`/`into`) > `set door(...)` > hard default.
    const hingeNear = n.hingeNear ? (n.hingeNear === "start" ? "left" : "right") : undefined;
    const hinge = n.hinge ?? hingeNear ?? enumDefault(ctx.defaults, "hinge", ["left", "right"] as const) ?? "left";
    const intoSwing = n.swingInto ? swingInto(n.swingInto, at, host, ctx.rooms, ctx, id, n.span) : undefined;
    const swing = n.swing ?? intoSwing ?? enumDefault(ctx.defaults, "swing", ["in", "out"] as const) ?? "in";
    // Pre-emit the hinge-flipped statement for `W_SWING_OBSTRUCTED`'s fix: lint sees
    // only the IR, and re-emitting here keeps the authored placement/width expressions
    // (rather than baking in resolved numbers). Internal field — no Scene, no bytes.
    const flipText = n.span ? emitOpening("door", n, { hinge: hinge === "left" ? "right" : "left" }) : undefined;
    return {
      kind: "door",
      id,
      at,
      width,
      hinge,
      swing,
      host,
      span: n.span,
      ...(flipText ? { _flipHingeText: flipText } : {}),
    };
  },

  bounds: () => [],

  /**
   * Opening cover + leaf line + swing arc. The swing geometry (hinge, leaf,
   * far jamb, minor-arc orientation) is computed **here, once** — every backend
   * (SVG, DXF, PDF) now serializes the same `arc` primitive rather than
   * re-deriving it.
   */
  render(resolved, ctx: RenderCtx): SceneNode[] {
    const dr = resolved as RDoor;
    const seg = dr.host;
    if (!seg) return [];
    const { theme, sizes } = ctx;
    // On a CURVED host the direction is the TANGENT at the doorway, so the cover spans a
    // chord of the wall at that point and the jambs run radially — and the leaf and swing
    // (computed from the same tangent inside `doorSwing`) can never disagree with it.
    const d = segmentDirAt(seg, dr.at);
    const n = normal(d);
    // Only paint the cover when the wall lowering has NOT already voided the wall at
    // this doorway (see `RenderCtx.openingsVoided`): `theme.opening` is the page
    // background, so covering a real hole laid a white band across the floor either
    // side of the door. When the hole is real the polygon stays — invisible — because
    // the ASCII/DXF backends locate the doorway by the cover polygon on this pass.
    // A wall carrying ANY `arc` edge is lowered per-segment and subtracts nothing, so no
    // doorway on it is a real hole — not on the curve, and not on its straight runs
    // either. `seg.arcWall` is that per-wall fact (`seg.arc` alone would miss the
    // straight segments, and a semicircle's chord is axis-aligned anyway).
    const voided = ctx.openingsVoided === true && !seg.arcWall && (seg.a.x === seg.b.x || seg.a.y === seg.b.y);
    const h = seg.thickness / 2 + (voided ? 0 : sizes.wallStroke);
    const hw = dr.width / 2;
    const cover: Point[] = [
      add(add(dr.at, mul(d, -hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, -h)),
      add(add(dr.at, mul(d, -hw)), mul(n, -h)),
    ];
    const nodes: SceneNode[] = [];
    nodes.push({
      layer: "doors",
      prim: { t: "polygon", pts: cover },
      paint: voided ? { fill: "none" } : { fill: theme.opening },
    });
    // Leaf + minor-arc geometry is shared with the swing-clearance lint rule.
    const swing = doorSwing(dr);
    if (swing) {
      nodes.push({
        layer: "doors",
        prim: { t: "line", a: swing.hinge, b: swing.leafEnd },
        paint: { stroke: theme.doorLeaf, width: sizes.thin * 1.3 },
      });
      nodes.push({
        layer: "doors",
        prim: {
          t: "arc",
          center: swing.hinge,
          r: swing.radius,
          start: swing.leafEnd,
          end: swing.farJamb,
          sweep: swing.sweep,
        },
        paint: { fill: "none", stroke: theme.doorLeaf, width: sizes.thin, dash: [sizes.thin * 4, sizes.thin * 3] },
      });
    }
    return nodes;
  },
};
