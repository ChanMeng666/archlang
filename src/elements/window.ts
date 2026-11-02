/**
 * `window [id=] [<kind>] at (x,y) width N [wall ref] [hinge <side>]` — opening + double glazing +
 * exterior sill, plus the kind's mark (see {@link kindMarks}).
 */

import type { Point, WindowNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { CadPart, SceneNode } from "../scene.js";
import type { ResolvedElement, RWindow } from "../ir.js";
import type { Diagnostic } from "../diagnostics.js";
import type { RenderSizes } from "../scene.js";
import type { Theme } from "../theme.js";
import { add, mul, nearestWallNote, normal, segmentDirAt, wallFaceProbes } from "../geometry.js";
import type { WallSegment } from "../geometry.js";
import { eatEnumValue, parseAttachTarget, resolveOpeningLead } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix, windowKindClauseFix } from "../fix-producers.js";
import { parseOpeningHeights, resolveOpeningHeights, WINDOW_HEAD, WINDOW_SILL } from "../datum.js";
import { chargeSteps } from "../expr.js";
import { DOOR_ENUMS, WINDOW_KIND_HINGED, WINDOW_KINDS, type WindowKind } from "../grammar/tokens.js";
import { sameSeg } from "../opening-junctions.js";
import { cornerBlock } from "../opening-relation.js";
import { COMPASS_DATUM_ALIASES, splitDatum } from "../room-datums.js";
import { cadTurnOf, weightWidth } from "../scene.js";
import { arrowHead } from "./glyph-lib.js";

/**
 * How far apart the two glass lines are, as a fraction of the host wall's thickness: 50 mm
 * in a 200 mm wall, 75 mm in a 300 mm one. That reads as a glazing band at 1:50 (several pens
 * of white between the panes) and, at 1:100 or in a small unscaled drawing where the pens
 * widen, closes into one firm blue band rather than into a smudge against the wall faces,
 * which stay four times as far out.
 */
export const GLAZING_GAP = 0.25;

/**
 * The exterior sill, as fractions of the wall thickness: how far its nose stands proud of
 * the outside face (40 mm on a 200 mm wall) and how far it runs past each jamb (the
 * "horns" a sill is cut with, the same 40 mm).
 */
export const SILL_PROJECTION = 0.2;
const SILL_HORN = 0.2;

/**
 * The hinge mark, as fractions of the wall thickness: a chevron with its point on the hinged jamb
 * and its arms `HINGE_MARK_REACH` along the wall, `HINGE_MARK_SPREAD` off the centreline each way
 * (three quarters of the way to the wall face). Neither is more than half the half-width, so two
 * hinge marks and a tilt mark stay apart on a narrow window, and a thick wall draws no fan.
 */
const HINGE_MARK_REACH = 0.75;
const HINGE_MARK_SPREAD = 0.375;
/** The tilt mark's radius, a fraction of the wall thickness, and at most a quarter of the
 *  half-width. */
const TILT_MARK_RADIUS = 0.2;
/** The sliding mark's half-length, a fraction of the wall thickness, at most this share of the
 *  half-width, and its heads' length and half-width, the second never more than the first. */
const SLIDE_MARK_REACH = 1.5;
const SLIDE_MARK_SHARE = 0.6;
const SLIDE_HEAD_LENGTH = 0.3;
const SLIDE_HEAD_SPREAD = 0.2;

/**
 * What a window kind adds in the reveal (issue #369). Every mark lies inside the wall's
 * thickness and the opening's width, so `measures()` already covers it, `bounds()` stays empty
 * and nothing else on the plan has anything new to avoid. No mark reads a sill or a head: heights
 * draw nothing. `fixed` is not here: its mark is the one glass line `render` draws instead of two.
 *
 * - `casement`, `tilt_turn`: the hinge mark. A hinge side is a handed fact, so it stands only on
 *   the side the source wrote. With none written it stands on BOTH jambs, which states no hand.
 *   `hinge` is read along the wall's direction, as a door's, so it rides a `place` frame with the
 *   carried segment (`transform` has nothing to flip), and the chevron is symmetric across the
 *   wall, so a reflection has no face to choose.
 * - `tilt`, `tilt_turn`: a small circle at mid-span. A sash hung along its foot has no side.
 * - `sliding`: a two-headed arrow at mid-span. Which pane slides is not stated, so it is symmetric.
 *
 * A polygon here always carries a stroke: the ASCII backend finds the opening by its one
 * unstroked polygon, the cover.
 *
 * `at` and `hw` are the span the marks stand in. A window run to a corner has no second jamb to
 * hang on, so `free` names the one it has, and its marks stand in its clear span
 * ({@link cornerMitre}), so none reaches the mitre.
 */
function kindMarks(
  wn: RWindow,
  at: Point,
  hw: number,
  free: number | undefined,
  d: Point,
  n: Point,
  t: number,
  theme: Theme,
  sizes: RenderSizes,
): SceneNode[] {
  const kind = wn.windowKind;
  const nodes: SceneNode[] = [];
  const stroke = (a: Point, b: Point): SceneNode => ({
    layer: "windows",
    prim: { t: "line", a, b },
    paint: { stroke: theme.windowPane, width: weightWidth("extraThin", sizes) },
    lineWeight: "extraThin",
  });
  if (kind === "casement" || kind === "tilt_turn") {
    const reach = Math.min(HINGE_MARK_REACH * t, hw / 2);
    const spread = Math.min(HINGE_MARK_SPREAD * t, hw / 2);
    const sides = wn.hinge ? [wn.hinge === "left" ? -1 : 1] : free !== undefined ? [free] : [-1, 1];
    for (const s of sides) {
      const jamb = add(at, mul(d, s * hw));
      const foot = add(at, mul(d, s * (hw - reach)));
      nodes.push(stroke(jamb, add(foot, mul(n, spread))), stroke(jamb, add(foot, mul(n, -spread))));
    }
  }
  if (kind === "tilt" || kind === "tilt_turn") {
    nodes.push({
      layer: "windows",
      prim: { t: "circle", center: at, r: Math.min(TILT_MARK_RADIUS * t, hw / 4) },
      paint: { fill: theme.opening, stroke: theme.windowPane, width: sizes.thin },
    });
  }
  if (kind === "sliding") {
    const reach = Math.min(SLIDE_MARK_REACH * t, SLIDE_MARK_SHARE * hw);
    const head = Math.min(SLIDE_HEAD_LENGTH * t, reach / 2);
    const a = add(at, mul(d, -reach));
    const b = add(at, mul(d, reach));
    nodes.push(stroke(a, b));
    for (const [tip, along] of [
      [a, mul(d, -1)],
      [b, d],
    ] as const) {
      nodes.push({
        layer: "windows",
        prim: { t: "polygon", pts: arrowHead(tip, along, head, Math.min(SLIDE_HEAD_SPREAD * t, head)) },
        paint: { fill: theme.windowPane, stroke: theme.windowPane, width: sizes.thin },
      });
    }
  }
  return nodes;
}

/** A kind's symbol in a legend swatch: the drawing's own nodes, on a wall as deep as the box, with
 *  no cover (there is no wall to carry across) and no sill (no plan to read the outside from). */
export function windowSwatch(
  kind: WindowKind,
  box: { x: number; y: number; w: number; h: number },
  theme: Theme,
  sizes: RenderSizes,
): SceneNode[] {
  const y = box.y + box.h / 2;
  const host: WallSegment = {
    a: { x: box.x, y },
    b: { x: box.x + box.w, y },
    thickness: box.h,
    category: "",
    wallId: "",
    index: 0,
  };
  const at = { x: box.x + box.w / 2, y };
  const el: RWindow = { kind: "window", id: "", at, width: box.w, host, windowKind: kind, sill: 0, head: 0 };
  return windowEl.render(el, { theme, sizes, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, fmt: String }).slice(1);
}

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
 *
 * `clear` is the span a kind's marks stand in, from the free jamb to the other wall's inner face.
 * The whole mitre lies at or past that face, at any depth across the wall and any two thicknesses,
 * so a mark in it cannot reach the line, on a leg of any width.
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
  clear: { at: Point; hw: number; free: number };
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
    clear: {
      at: add(wn.at, mul(toCorner, -other.thickness / 2)),
      hw: (wn.width - other.thickness) / 2,
      free: atEnd ? -1 : 1,
    },
  };
}

/** Does a written `hinge` name a window's corner end? `right` is the jamb ahead along the wall. */
function hingesOnCorner(hinge: string, at: Point, host: WallSegment, corner: Point): boolean {
  const d = segmentDirAt(host, at);
  return (hinge === "right") === (corner.x - at.x) * d.x + (corner.y - at.y) * d.y > 0;
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
    {
      name: "hinge",
      type: DOOR_ENUMS.hinge.join("|"),
      optional: true,
      doc: "Hinged jamb of a casement or tilt_turn window, relative to wall direction.",
    },
  ],

  setRefuses: {
    hinge: "`set` cannot supply a window's `hinge`: a side is stated on the window itself, or left unstated",
  },

  parse(ctx: ParseCtx): WindowNode {
    const kw = ctx.eatKeyword("window");
    const id = ctx.parseIdOpt();
    // A bare KIND word may lead, after any `id=`, as on a `door`. The only other legal leads are
    // `at` and `on`, neither of them a kind, so a lookahead against the closed table decides it.
    const windowKind = WINDOW_KINDS.find((k) => ctx.isKeyword(k));
    if (windowKind) ctx.next();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: WindowNode = {
      kind: "window",
      id,
      ...(windowKind ? { windowKind } : {}),
      width,
      line: kw.line,
      ...(at ? { at } : {}),
      ...(attach ? { attach } : {}),
    };
    if (at && ctx.isKeyword("wall")) {
      ctx.next();
      node.wall = ctx.eatIdent().value;
    }
    if (ctx.isKeyword("hinge")) {
      ctx.next();
      node.hinge = eatEnumValue(ctx, DOOR_ENUMS.hinge, "hinge");
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
    // A written kind and a written `hinge`, and nothing otherwise: a kind-free window carries no
    // field at all. `hinge` has no default, from a kind or from `set`: an unstated side stays one.
    const takesHinge = n.windowKind !== undefined && WINDOW_KIND_HINGED[n.windowKind];
    if (n.hinge !== undefined && !takesHinge) {
      const takers = WINDOW_KINDS.filter((k) => WINDOW_KIND_HINGED[k]).map((k) => `\`${k}\``);
      ctx.diag({
        severity: "error",
        message: `Window "${id}" is ${n.windowKind ? `a "${n.windowKind}" window` : "a window with no kind"}, which has no \`hinge\` clause`,
        code: "E_WINDOW_KIND_CLAUSE",
        span: n.span,
        hints: [
          "Delete the `hinge` clause — the fix does exactly that.",
          `Or make it one of the kinds that hang on a jamb: ${takers.join(", ")}.`,
        ],
        ...fixesFrom(windowKindClauseFix(n)),
      });
    }
    const kindFacts = {
      ...(n.windowKind ? { windowKind: n.windowKind } : {}),
      ...(n.hinge !== undefined && takesHinge ? { hinge: n.hinge } : {}),
    };
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
      if (corner && host && kindFacts.hinge !== undefined && hingesOnCorner(kindFacts.hinge, at, host, corner.at)) {
        ctx.diag({
          severity: "error",
          message: `Window "${id}" cannot hang on the corner: \`hinge ${kindFacts.hinge}\` names the jamb at the corner, where no wall is left`,
          code: "E_WINDOW_CORNER",
          span: n.span,
          hints: [
            `Write \`hinge ${kindFacts.hinge === "left" ? "right" : "left"}\`, the free jamb, or leave \`hinge\` out: the mark then stands on the free jamb.`,
          ],
        });
      }
      return {
        kind: "window",
        id,
        at,
        width,
        host,
        ...kindFacts,
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
    return { kind: "window", id, at, width, host, ...kindFacts, ...heights(host), span: n.span };
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

  /** At most 6 primitives (the drawing budget, `MAX_DRAW_UNITS`): the opening cover, the two wall-face lines, the two glazing lines and the exterior sill. A kind adds at most 5: two chevrons of two lines and a circle ({@link kindMarks}). */
  drawCost: (resolved) => ((resolved as RWindow).windowKind ? 11 : 6),

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
    // Double glazing: two panes centred on the wall, `GLAZING_GAP` of its thickness apart. A
    // `fixed` window draws one glass line on the centreline instead: no sash, nothing that opens.
    const g = (GLAZING_GAP * seg.thickness) / 2;
    for (const off of wn.windowKind === "fixed" ? [0] : [g, -g]) {
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
    if (wn.windowKind) {
      const { at, hw: half, free } = mitre?.clear ?? { at: wn.at, hw, free: undefined };
      nodes.push(...kindMarks(wn, at, half, free, d, n, seg.thickness, theme, sizes));
    }
    return nodes;
  },
  /** A block at the window's centre, in the frame of its wall, one for each drawing of it. */
  cadPart(resolved): CadPart | undefined {
    const wn = resolved as RWindow;
    if (!wn.host) return undefined;
    const name = `WINDOW-${wn.windowKind ? `${wn.windowKind}-` : ""}${wn.width}`;
    return { t: "block", name, at: wn.at, turn: cadTurnOf(segmentDirAt(wn.host, wn.at)) };
  },
  /** The frame's action on a window (`frame.ts`'s `transformElement` calls this). `hinge` rides the
   *  traversal with the carried segment, as a door's does, and the marks are symmetric across the
   *  wall, so a reflection has nothing to flip. */
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
