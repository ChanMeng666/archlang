/**
 * `door [id=] [<kind>] at (x,y) width N [wall ref] [hinge <side>] [swing <dir>]
 *  [slide <dir>] [open <0..1>]` — opening + leaf + swing arc, or (for a non-hinged
 *  kind) opening + panels/track/cavity.
 */

import type { DoorNode, Point } from "../ast.js";
import type { Span } from "../diagnostics.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RDoor, RRoom } from "../ir.js";
import type { Value } from "../expr.js";
import type { WallSegment } from "../geometry.js";
import { add, doorSwing, mul, nearestWallNote, normal, segmentDirAt, sub, unit } from "../geometry.js";
import { pointInPolygon, pointOnPolygonEdge } from "../geometry/polygon.js";
import type { DoorClauseName, DoorKind } from "../grammar/tokens.js";
import { DOOR_ENUMS, DOOR_HINGE_NEAR, DOOR_KIND_CLAUSES, DOOR_KINDS, enumList } from "../grammar/tokens.js";
import { parseAttachTarget, resolveAttachment } from "../attach.js";
import {
  doorKindClauseFix,
  doorOpenRangeFix,
  emitOpening,
  fixesFrom,
  offWallFix,
  openingWidthFix,
} from "../fix-producers.js";
import { renderDoorPanels } from "./door-panels.js";

/**
 * Read the next ident and check it against a closed value set from
 * {@link DOOR_ENUMS} / {@link DOOR_HINGE_NEAR}. The allowed values and the message
 * that lists them both come from the table, so the check can never allow one thing
 * and the diagnostic name another. `ctx.fail` returns `never`, which narrows the
 * result to the member type.
 */
function eatEnumValue<T extends string>(ctx: ParseCtx, allowed: readonly T[], what: string): T {
  const v = ctx.eatIdent().value;
  if (!(allowed as readonly string[]).includes(v)) ctx.fail(`Expected ${what} ${enumList(allowed)} but found "${v}"`);
  return v as T;
}

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

/** `open` when the author writes none — the drawn rest position of a sliding-family panel. */
const DEFAULT_OPEN = 0.5;

/** Clamp `v` into `[0,1]`. */
const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

export const door: ElementDef = {
  kind: "door",
  keyword: "door",
  doc: "A door: an opening in its host wall with a leaf and swing arc.",
  params: [
    { name: "at", type: "point", doc: "Hinge/center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Door width (leaf length) in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
    {
      name: "hinge",
      type: DOOR_ENUMS.hinge.join("|"),
      optional: true,
      doc: "Hinge side relative to wall direction.",
    },
    {
      name: "swing",
      type: DOOR_ENUMS.swing.join("|"),
      optional: true,
      doc: "Hinged: which side the leaf sweeps to. Barn/bifold: which face the panel hangs on or folds toward.",
    },
    {
      name: "slide",
      type: DOOR_ENUMS.slide.join("|"),
      optional: true,
      doc: "Which way the panel travels to open (sliding family only), along the wall's direction.",
    },
    { name: "open", type: "number", optional: true, doc: "How far the panel is drawn open, 0–1 (default 0.5)." },
  ],

  parse(ctx: ParseCtx): DoorNode {
    const kw = ctx.eatKeyword("door");
    const id = ctx.parseIdOpt();
    // A bare KIND word may lead, after any `id=` — the shipped `room polygon` /
    // `room circle` / `dim faces` shape. Unambiguous by construction: the only other
    // legal leads here are `at` and `on` (see `parseAttachTarget`), neither of which
    // is a kind, so a lookahead against the closed table decides it with no backtrack.
    const doorKind = DOOR_KINDS.find((k) => ctx.isKeyword(k));
    if (doorKind) ctx.next();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: DoorNode = {
      kind: "door",
      id,
      ...(doorKind ? { doorKind } : {}),
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
        node.hingeNear = eatEnumValue(ctx, DOOR_HINGE_NEAR, "hinge near");
      } else {
        node.hinge = eatEnumValue(ctx, DOOR_ENUMS.hinge, "hinge");
      }
    }
    if (ctx.isKeyword("swing")) {
      ctx.next();
      // `swing into <room>` picks in/out toward that room; `swing in|out` is explicit.
      if (ctx.isKeyword("into")) {
        ctx.next();
        node.swingInto = ctx.eatIdent().value;
      } else {
        node.swing = eatEnumValue(ctx, DOOR_ENUMS.swing, "swing");
      }
    }
    // `slide left|right` — which way the panel travels. Its byte span (or the
    // zero-width point where one could be inserted, which is HERE — before the
    // trailing `open`, which the grammar puts last) is recorded so `W_POCKET_RUN`'s
    // reverse-slide fix can rewrite exactly that clause. Same shape as
    // `FurnitureNode.rotateSpan`, with one difference: it is recorded ONLY on a door
    // that names a kind or writes `slide`, so a plan that uses none of this feature
    // has a byte-identical `arch ast --json` too, not merely a byte-identical drawing.
    const slideAt = ctx.peek(-1).end;
    if (ctx.isKeyword("slide")) {
      const slideKw = ctx.next();
      node.slide = eatEnumValue(ctx, DOOR_ENUMS.slide, "slide");
      node.slideSpan = { start: slideKw.start, end: ctx.peek(-1).end };
    } else if (doorKind !== undefined) {
      node.slideSpan = { start: slideAt, end: slideAt };
    }
    if (ctx.isKeyword("open")) {
      ctx.next();
      node.open = ctx.parseExpr();
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
    // —— Kind, and the clauses it does and does not accept ——
    // `hinged` is dropped: an omitted kind word and an explicit `door hinged …` must be
    // indistinguishable from here down, which is what makes every pre-v1.25 plan's
    // bytes (and its `describe`/`lint`/Plan JSON payloads) unchanged.
    const named: DoorKind = n.doorKind ?? "hinged";
    const doorKind = named === "hinged" ? undefined : named;
    const allowed = DOOR_KIND_CLAUSES[named];
    const written: ReadonlyArray<readonly [DoorClauseName, boolean]> = [
      ["hinge", n.hinge !== undefined || n.hingeNear !== undefined],
      ["swing", n.swing !== undefined || n.swingInto !== undefined],
      ["slide", n.slide !== undefined],
      ["open", n.open !== undefined],
    ];
    for (const [clause, present] of written) {
      if (!present || allowed[clause]) continue;
      const alternatives = DOOR_KINDS.filter((k) => DOOR_KIND_CLAUSES[k][clause]);
      ctx.diag({
        severity: "error",
        message: `Door "${id}" is a "${named}" door, which has no \`${clause}\` clause`,
        code: "E_DOOR_KIND_CLAUSE",
        span: n.span,
        hints: [
          `Delete the \`${clause}\` clause — the fix does exactly that.`,
          alternatives.length > 0
            ? `Or make it one of the kinds that takes it: ${alternatives.map((k) => `\`${k}\``).join(", ")}.`
            : `No door kind takes \`${clause}\`.`,
        ],
        ...fixesFrom(doorKindClauseFix(n, clause)),
      });
    }
    // The sliding family is drawn as a straight panel on a straight track, and a
    // pocket is a straight cavity — none of that survives on a curved reveal. Refuse
    // with a code rather than draw a straight panel across an arc (§10's explicit
    // stage-1 decision: decide, never let it fall out silently). A HINGED leaf does
    // survive, because its swing is taken from the tangent at the doorway.
    if (doorKind !== undefined && host?.arc) {
      ctx.diag({
        severity: "error",
        message: `Door "${id}" is a "${named}" door on a curved wall — its panel and track are straight`,
        code: "E_DOOR_KIND_CURVED",
        span: n.span,
        hints: [
          "Use the default hinged door here (delete the kind word) — its leaf and swing come from the tangent at the doorway.",
          "Or move the door onto one of the wall's straight runs.",
        ],
      });
    }
    // `open` is a DRAWING fact and nothing else reads it, so an impossible value is
    // reported (with the clamped value as a fix) rather than silently clamped — the
    // shipped `E_ARC_RADIUS` pattern.
    const openRaw = n.open !== undefined ? ctx.eval(n.open) : undefined;
    if (openRaw !== undefined && !(openRaw >= 0 && openRaw <= 1)) {
      const clamped = Number.isNaN(openRaw) ? 0 : clamp01(openRaw);
      ctx.diag({
        severity: "error",
        message: `Door "${id}" has \`open ${openRaw}\`, which is outside the 0–1 range a panel can travel`,
        code: "E_DOOR_OPEN_RANGE",
        span: n.span,
        hints: [`Use a fraction in [0,1] — \`open ${clamped}\` is the nearest legal value.`],
        ...fixesFrom(doorOpenRangeFix(n, clamped)),
      });
    }
    // The drawn fraction after the diagnostic above: an out-of-range value still has to
    // draw something, and the nearest legal position is the honest choice (the error is
    // what tells the author; the drawing never silently accepts the impossible value).
    const open = openRaw === undefined || Number.isNaN(openRaw) ? DEFAULT_OPEN : clamp01(openRaw);
    // Precedence: explicit attribute > derived (`near`/`into`) > `set door(...)` > hard default.
    const hingeNear = n.hingeNear ? (n.hingeNear === "start" ? "left" : "right") : undefined;
    const hinge = n.hinge ?? hingeNear ?? enumDefault(ctx.defaults, "hinge", DOOR_ENUMS.hinge) ?? "left";
    const intoSwing = n.swingInto ? swingInto(n.swingInto, at, host, ctx.rooms, ctx, id, n.span) : undefined;
    const swing = n.swing ?? intoSwing ?? enumDefault(ctx.defaults, "swing", DOOR_ENUMS.swing) ?? "in";
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
      // Everything below is present ONLY on a non-hinged door, so a plan that names
      // no kind produces exactly the IR (and therefore exactly the bytes, exactly the
      // `describe()` payload and exactly the Plan JSON) it produced before v1.25.
      ...(doorKind !== undefined
        ? {
            doorKind,
            slide: n.slide ?? "left",
            open,
            ...(n.slideSpan ? { _slideSpan: n.slideSpan } : {}),
          }
        : {}),
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
    // A NON-HINGED kind draws panels/tracks/cavity in the reveal instead of a leaf and
    // arc, and `doorSwing` returns null for it — so the hinged branch below is the
    // EXISTING code, unmoved and unrewritten, and a plan that names no kind emits the
    // same primitives in the same order it always did.
    if (dr.doorKind !== undefined) {
      nodes.push(...renderDoorPanels(dr, { theme, sizes, dir: d, thickness: seg.thickness }));
      return nodes;
    }
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
