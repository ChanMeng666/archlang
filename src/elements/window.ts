/** `window [id=] at (x,y) width N [wall ref]` — opening + double glazing + exterior sill. */

import type { Point, WindowNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { ResolvedElement, RWindow } from "../ir.js";
import type { Diagnostic } from "../diagnostics.js";
import { add, mul, nearestWallNote, normal, segmentDirAt, wallFaceProbes } from "../geometry.js";
import type { WallSegment } from "../geometry.js";
import { parseAttachTarget, resolveOpeningLead } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";
import { parseOpeningHeights, resolveOpeningHeights, WINDOW_HEAD, WINDOW_SILL } from "../datum.js";
import { chargeSteps } from "../expr.js";
import { sameSeg } from "../opening-junctions.js";
import { cornerBlock } from "../opening-relation.js";
import { COMPASS_DATUM_ALIASES, splitDatum } from "../room-datums.js";

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
export const SILL_PROJECTION = 0.2;
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

/**
 * Where a window run to a corner stops, at `off` across its wall along `n`: the point on the line
 * from the two walls' inner corner to their outer one. Every line of the window, and of the window
 * on the other wall, ends on that line, so the two meet vertex to vertex and neither paints over
 * the other, whatever the two thicknesses are. Read from the shape: the corner, and the way the
 * other wall leaves it. Null for a window that stands at no corner.
 *
 * Past the free jamb that line has nothing to meet: a window barely wider than the other wall is
 * thick reaches it within the cover's pen of overhang. `pinched` says an `off` is that far, and
 * `cap` is where the line and the jamb meet. A pen is the sheet's, so the resolver cannot refuse it.
 */
function cornerMitre(
  wn: RWindow,
  seg: WallSegment,
  d: Point,
  n: Point,
): {
  at: (off: number) => Point;
  atEnd: boolean;
  pinched: (off: number) => boolean;
  cap: (off: number) => number;
} | null {
  const corner = wn._corner;
  if (!corner) return null;
  const { at: c, other } = corner;
  const far = other.a.x === c.x && other.a.y === c.y ? other.b : other.a;
  const length = Math.hypot(far.x - c.x, far.y - c.y);
  const away = { x: (far.x - c.x) / length, y: (far.y - c.y) / length };
  const atEnd = (c.x - wn.at.x) * d.x + (c.y - wn.at.y) * d.y > 0;
  // `off` along `n` is that far along `away`, up to a sign, and the same share of the other wall.
  const side = away.x * n.x + away.y * n.y;
  const share = other.thickness / seg.thickness;
  const toCorner = atEnd ? d : mul(d, -1);
  const jamb = (wn.width - other.thickness / 2) / share;
  const pinched = (off: number): boolean => off * side >= jamb;
  return {
    at: (off) => add(add(c, mul(toCorner, -off * side * share)), mul(away, off * side)),
    atEnd,
    pinched,
    cap: (off) => (pinched(off) ? side * jamb : off),
  };
}

/** An edge as a corner compares it: `a.north` is `a.top` where a compass word may stand for it. */
function edgeKey(name: string): string {
  const d = splitDatum(name);
  return d ? `${d.room}.${COMPASS_DATUM_ALIASES[d.word] ?? d.word}` : name;
}

/**
 * A window run to a corner, once its group has resolved: it needs the window on the other wall, and
 * the two must make one corner. A second leg on one wall, or none on the other, leaves a window
 * running into the side of a wall. Different heights leave wall at the corner above or below one of
 * them, so the two must share theirs. What the two windows share is reported once, on the later.
 */
function settleCorner(w: RWindow, own: readonly ResolvedElement[], diag: (d: Diagnostic) => void): void {
  // At most five passes over the group, on any one path: the peers, then the refused legs or their
  // partner, each window's place, and the columns. Charged whole, before the first.
  chargeSteps(5 * own.length + 1);
  const corner = w._corner!;
  const refuse = (message: string, hints?: string[]): void =>
    diag({
      severity: "error",
      message: `Window "${w.id}" ${message}`,
      code: "E_WINDOW_CORNER",
      ...(w.span ? { span: w.span } : {}),
      ...(hints ? { hints } : {}),
    });
  const peers = own.filter(
    (e): e is RWindow =>
      e !== w && e.kind === "window" && e._corner?.at.x === corner.at.x && e._corner.at.y === corner.at.y,
  );
  const named = w._relation?.at?.replace(/^corner /, "") ?? "<room>.<edge>";
  if (peers.length === 0) {
    // The window on the other wall was written if it was refused at this corner: its own error is
    // the one to read. A leg refused at any other corner says nothing about this one.
    const [mine, theirs] = [edgeKey(w._relation?.edge ?? ""), edgeKey(named)];
    const written = own.some(
      (e) =>
        e.kind === "window" &&
        e._cornerRefused !== undefined &&
        edgeKey(e._cornerRefused.on) === theirs &&
        edgeKey(e._cornerRefused.to) === mine,
    );
    if (written) return;
    refuse(
      "runs to a corner alone: no window runs to it along the other wall, so it would end in the side of that wall",
      [`Add \`window on ${named} at corner ${w._relation?.edge ?? "<room>.<edge>"} width <mm>\`.`],
    );
    return;
  }
  const partner = peers.find((p) => p.host !== null && sameSeg(p.host, corner.other));
  if (partner === undefined || peers.length > 1) {
    refuse(`is one of ${peers.length + 1} windows at one corner: a corner takes one window on each of its two walls`);
    return;
  }
  corner.with = partner.id;
  if (own.indexOf(partner) > own.indexOf(w)) return;
  if (partner.sill !== w.sill || partner.head !== w.head) {
    refuse(`and "${partner.id}" meet at a corner with different heights: they must share their \`sill\` and \`head\``, [
      "Give both windows the same `sill` and `head`, or take one off the corner.",
    ]);
    return;
  }
  const box = w.host ? cornerBlock(corner.at, w.host, corner.other) : null;
  const column = own.find(
    (e) =>
      box !== null &&
      e.kind === "column" &&
      e.at.x < box.x1 &&
      box.x0 < e.at.x + e.size.w &&
      e.at.y < box.y1 &&
      box.y0 < e.at.y + e.size.h,
  );
  if (column) {
    refuse(`and "${partner.id}" meet at a corner where column "${column.id}" stands`, [
      "Move the column, or take the windows off the corner.",
    ]);
  }
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
    if (at && ctx.isKeyword("wall")) {
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
    const heights = (
      host: ReturnType<typeof ctx.hostSegment>,
    ): { sill: number; head: number; _sillAuthored?: true } => ({
      ...resolveOpeningHeights(ctx, `Window "${id}"`, n, { sill: WINDOW_SILL, head: WINDOW_HEAD }, host, n.span),
      ...(n.sill !== undefined ? { _sillAuthored: true as const } : {}),
    });
    const lead = resolveOpeningLead(n, "window", width, ctx, `Window "${id}"`);
    const written = n.attach?.pos.kind === "corner" ? { on: n.attach.wall, to: n.attach.pos.edge } : undefined;
    if (lead) {
      const { at, host, relation, corner } = lead;
      return {
        kind: "window",
        id,
        at,
        width,
        host,
        ...heights(host),
        span: n.span,
        ...(relation ? { _placement: "relational" as const, _relation: relation } : {}),
        ...(corner ? { _corner: corner } : {}),
        ...(written && !corner ? { _cornerRefused: written } : {}),
      };
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

  /** A window run to a corner, once the group has resolved ({@link settleCorner}). */
  settle(resolved, own, diag): void {
    const w = resolved as RWindow;
    if (w._corner) settleCorner(w, own, diag);
  },

  // Empty on purpose: the sill stands only 0.2t proud of the wall face, which the page margin
  // already absorbs, and widening the bounds would move every page viewBox and sheet fit.
  bounds: () => [],
  /**
   * Its centre and width (see `door.measures`), plus how far it DRAWS from them — the wall
   * faces at t/2 and the sill nose at t/2 + `SILL_PROJECTION`·t off the centreline, the
   * horns `SILL_HORN`·t past each jamb — so the modelling-range check covers every drawn
   * coordinate. `along + across` bounds any drawn point's offset from `at` on each axis at
   * any wall angle. A window run to a corner has no horn there, and its sill's nose runs out by
   * the other wall's thickness instead, so `along` reads the thicker of the two. (The cover's
   * pen-width overhang is a pen, held by `checkDrawnSizes`.)
   */
  measures(resolved): number[] {
    const w = resolved as RWindow;
    const t = w.host?.thickness ?? 0;
    const across = t / 2 + SILL_PROJECTION * t;
    const along = w.width / 2 + SILL_HORN * Math.max(t, w._corner?.other.thickness ?? 0);
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
    const jA = add(wn.at, mul(d, -hw));
    const jB = add(wn.at, mul(d, hw));
    const mitre = cornerMitre(wn, seg, d, n);
    // A line `off` across the wall, from jamb to jamb, or to the mitre at a corner.
    const across = (off: number): [Point, Point] => [
      mitre && !mitre.atEnd ? mitre.at(off) : add(jA, mul(n, off)),
      mitre?.atEnd ? mitre.at(off) : add(jB, mul(n, off)),
    ];
    // The cover overhangs by a pen. Past the point where the mitre meets the free jamb it would turn
    // itself inside out, so there it stops, and its jamb and its mitre share that one vertex.
    const [c0, c1] = across(mitre ? mitre.cap(he) : he);
    const [c3, c2] = across(mitre ? mitre.cap(-he) : -he);
    const pts = [c0, ...(mitre?.pinched(he) ? [] : [c1]), ...(mitre?.pinched(-he) ? [] : [c2]), c3];
    const nodes: SceneNode[] = [];
    nodes.push({ layer: "windows", prim: { t: "polygon", pts }, paint: { fill: theme.opening } });
    for (const off of [h, -h]) {
      const [a, b] = across(off);
      nodes.push({
        layer: "windows",
        prim: { t: "line", a, b },
        paint: { stroke: theme.wallStroke, width: sizes.thin },
      });
    }
    // Double glazing: two panes centred on the wall, `GLAZING_GAP` of its thickness apart.
    const g = (GLAZING_GAP * seg.thickness) / 2;
    for (const off of [g, -g]) {
      const [a, b] = across(off);
      nodes.push({
        layer: "windows",
        prim: { t: "line", a, b },
        paint: { stroke: theme.windowPane, width: sizes.thin },
      });
    }
    // The sill, on the EXTERIOR face only — and only when the plan says which face that is.
    const out = exteriorNormal(seg, wn.at, n, ctx.floorAt);
    if (out) {
      const t = seg.thickness;
      const a = add(jA, mul(d, -SILL_HORN * t));
      const b = add(jB, mul(d, SILL_HORN * t));
      // `depth` off the centreline on the outside: past the jamb by the horn, or on the mitre.
      const toward = out.x * n.x + out.y * n.y;
      const atA = (depth: number): Point =>
        mitre && !mitre.atEnd ? mitre.at(toward * depth) : add(a, mul(out, depth));
      const atB = (depth: number): Point => (mitre?.atEnd ? mitre.at(toward * depth) : add(b, mul(out, depth)));
      nodes.push({
        layer: "windows",
        prim: {
          t: "polygon",
          pts: [atA(h), atA(h + SILL_PROJECTION * t), atB(h + SILL_PROJECTION * t), atB(h)],
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
    const corner = el._corner;
    return {
      ...el,
      id,
      at: t.point(el.at),
      host: el.host ? t.segment(el.host) : null,
      ...(corner
        ? {
            _corner: {
              at: t.point(corner.at),
              other: t.segment(corner.other),
              ...(corner.with !== undefined ? { with: t.nsId(corner.with) } : {}),
            },
          }
        : {}),
    };
  },
};
