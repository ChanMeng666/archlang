/** `window [id=] at (x,y) width N [wall ref]` — opening + double glazing + exterior sill. */

import type { Point, WindowNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RWindow } from "../ir.js";
import { add, mul, nearestWallNote, normal, segmentDirAt, wallFaceProbes } from "../geometry.js";
import type { WallSegment } from "../geometry.js";
import { parseAttachTarget, resolveAttachment } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";
import { parseOpeningHeights, resolveOpeningHeights, WINDOW_HEAD, WINDOW_SILL } from "../datum.js";

/**
 * How far apart the two glass lines are, as a fraction of the host wall's thickness: 50 mm
 * in a 200 mm wall, 75 mm in a 300 mm one. That reads as a glazing band at 1:50 (several pens
 * of white between the panes) and, at 1:100 or in a small unscaled drawing where the pens
 * widen, closes into one firm blue band rather than into a smudge against the wall faces,
 * which stay four times as far out.
 */
const GLAZING_GAP = 0.25;

/**
 * The exterior sill, as fractions of the wall thickness: how far its nose stands proud of
 * the outside face (40 mm on a 200 mm wall) and how far it runs past each jamb (the
 * "horns" a sill is cut with, the same 40 mm).
 */
const SILL_PROJECTION = 0.2;
const SILL_HORN = 0.2;

/**
 * The unit normal pointing OUT of the building at a window, or `null` when the plan does
 * not say which way that is.
 *
 * Outside is the side with no floor on it, found by the probe `windowFacingPage`
 * (`src/site.ts`) and a garage door's panel side make: one wall thickness off the wall's
 * CENTRELINE on each side — half a thickness clear of each face, so a hit is floor and not
 * wall — asked of every room's own shape (and every `void`'s, which is inside the building
 * though it has no floor on this storey). Never a bounding box or a centroid, which name
 * the wrong face on a courtyard or an L.
 *
 * Inside on BOTH sides is an interior window and on NEITHER a free-standing wall: neither
 * has an outside, so neither gets a sill. Nor does a window drawn by a caller that cannot
 * answer the question (`RenderCtx.floorAt` absent).
 */
function exteriorNormal(
  seg: WallSegment,
  at: Point,
  n: Point,
  floorAt: ((p: Point) => boolean) | undefined,
): Point | null {
  if (!floorAt) return null;
  const { plus, minus } = wallFaceProbes(seg, at, Math.max(seg.thickness, 1));
  const onPlus = floorAt(plus);
  if (onPlus === floorAt(minus)) return null;
  return onPlus ? mul(n, -1) : n;
}

export const windowEl: ElementDef = {
  kind: "window",
  keyword: "window",
  doc: "A window: a glazed opening in its host wall.",
  params: [
    { name: "at", type: "point", doc: "Center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Window width in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
  ],

  parse(ctx: ParseCtx): WindowNode {
    const kw = ctx.eatKeyword("window");
    const id = ctx.parseIdOpt();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: WindowNode = {
      kind: "window",
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
    // The vertical datum: `sill` then `head`, both trailing every existing clause.
    Object.assign(node, parseOpeningHeights(ctx, { sill: true }));
    return node;
  },

  idPrefix: () => "window",

  resolve(node, ctx: ResolveCtx): RWindow {
    const n = node as WindowNode;
    const id = ctx.id;
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({
        severity: "error",
        message: `Window "${id}" must have a positive width`,
        code: "E_WINDOW_WIDTH",
        span: n.span,
        ...fixesFrom(openingWidthFix("window", n)),
      });
    }
    const heights = (host: ReturnType<typeof ctx.hostSegment>): { sill: number; head: number } =>
      resolveOpeningHeights(ctx, `Window "${id}"`, n, { sill: WINDOW_SILL, head: WINDOW_HEAD }, host, n.span);
    if (n.attach) {
      const a = resolveAttachment(n.attach, ctx.walls, ctx.snapPt, ctx.diag, `Window "${id}"`, (e) => ctx.eval(e));
      const at = a ? a.at : { x: 0, y: 0 };
      const host = a ? a.host : null;
      return { kind: "window", id, at, width, host, ...heights(host), span: n.span };
    }
    const at = ctx.snapPt(ctx.evalPt(n.at!));
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      const note = nearestWallNote(at, ctx.walls);
      ctx.diag({
        severity: "warning",
        message: `Window "${id}" does not lie on any wall`,
        code: "W_WINDOW_OFF_WALL",
        span: n.span,
        relatedSpans: note ? [note] : undefined,
        ...fixesFrom(offWallFix("window", n, at, ctx.walls)),
      });
    }
    const host = ctx.hostSegment(at, n.wall);
    return { kind: "window", id, at, width, host, ...heights(host), span: n.span };
  },

  // Empty on purpose: the sill stands only 0.2t proud of the wall face, which the page margin
  // already absorbs, and widening the bounds would move every page viewBox and sheet fit.
  bounds: () => [],
  /**
   * Its centre and width (see `door.measures`), plus how far it DRAWS from them — the wall
   * faces at t/2 and the sill nose at t/2 + `SILL_PROJECTION`·t off the centreline, the
   * horns `SILL_HORN`·t past each jamb — so the modelling-range check covers every drawn
   * coordinate. `along + across` bounds any drawn point's offset from `at` on each axis at
   * any wall angle. (The cover's pen-width overhang is a pen, held by `checkDrawnSizes`.)
   */
  measures(resolved): number[] {
    const w = resolved as RWindow;
    const t = w.host?.thickness ?? 0;
    const across = t / 2 + SILL_PROJECTION * t;
    const along = w.width / 2 + SILL_HORN * t;
    const r = along + across;
    return [w.at.x, w.at.y, w.width, across, along, w.at.x - r, w.at.x + r, w.at.y - r, w.at.y + r];
  },

  /** At most 6 primitives (the drawing budget, `MAX_DRAW_UNITS`): the opening cover, the two wall-face lines, the two glazing lines and the exterior sill. */
  drawCost: () => 6,

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const wn = resolved as RWindow;
    const seg = wn.host;
    if (!seg) return [];
    const { theme, sizes } = ctx;
    // Tangent at the opening on a curved host (pane along it, jambs radial).
    const d = segmentDirAt(seg, wn.at);
    const n = normal(d);
    const h = seg.thickness / 2;
    const he = h + sizes.wallStroke;
    const hw = wn.width / 2;
    const cover: Point[] = [
      add(add(wn.at, mul(d, -hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, -he)),
      add(add(wn.at, mul(d, -hw)), mul(n, -he)),
    ];
    const nodes: SceneNode[] = [];
    nodes.push({ layer: "windows", prim: { t: "polygon", pts: cover }, paint: { fill: theme.opening } });
    const jA = add(wn.at, mul(d, -hw));
    const jB = add(wn.at, mul(d, hw));
    for (const off of [h, -h]) {
      nodes.push({
        layer: "windows",
        prim: { t: "line", a: add(jA, mul(n, off)), b: add(jB, mul(n, off)) },
        paint: { stroke: theme.wallStroke, width: sizes.thin },
      });
    }
    // Double glazing: two panes centred on the wall, `GLAZING_GAP` of its thickness apart.
    const g = (GLAZING_GAP * seg.thickness) / 2;
    for (const off of [g, -g]) {
      nodes.push({
        layer: "windows",
        prim: { t: "line", a: add(jA, mul(n, off)), b: add(jB, mul(n, off)) },
        paint: { stroke: theme.windowPane, width: sizes.thin },
      });
    }
    // The sill, on the EXTERIOR face only — and only when the plan says which face that is.
    const out = exteriorNormal(seg, wn.at, n, ctx.floorAt);
    if (out) {
      const t = seg.thickness;
      const a = add(jA, mul(d, -SILL_HORN * t));
      const b = add(jB, mul(d, SILL_HORN * t));
      nodes.push({
        layer: "windows",
        prim: {
          t: "polygon",
          pts: [
            add(a, mul(out, h)),
            add(a, mul(out, h + SILL_PROJECTION * t)),
            add(b, mul(out, h + SILL_PROJECTION * t)),
            add(b, mul(out, h)),
          ],
        },
        paint: { fill: "none", stroke: theme.wallStroke, width: sizes.thin },
      });
    }
    return nodes;
  },
  /** The frame's action on a window (`frame.ts`'s `transformElement` calls this). */
  transform(resolved, t: TransformCtx): RWindow {
    const el = resolved as RWindow;
    const { id } = t;
    return { ...el, id, at: t.point(el.at), host: el.host ? t.segment(el.host) : null };
  },
};
