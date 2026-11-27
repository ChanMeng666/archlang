/** `opening [id=] at (x,y) width N [wall ref] [head <mm>]` — a leaf-less cased opening: a gap in
 *  the host wall (no door leaf, no glazing) that still connects the two spaces. The clauses
 *  after the placement come in any order (`src/clause-order.ts`). */

import type { Point, OpeningNode } from "../ast.js";
import { evaluateIn } from "../evaluator.js";
import type { ElementDef, ParseCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { ROpening } from "../ir.js";
import { add, mul, nearestWallNote, normal, segmentDirAt } from "../geometry.js";
import { leadOf, parseAttachTarget, resolveOpeningLead, wallClause } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";
import { reprint } from "./reprint.js";
import { openingCover } from "./glyph-lib.js";
import { noteSquare } from "../ir/silent-accepts.js";
import {
  heightsInOrder,
  hostWallHeight,
  type OpeningHeightClauses,
  openingHeightClauses,
  resolveOpeningHeights,
} from "../datum.js";
import { missingClause, readClauses } from "../clause-order.js";

/**
 * A cased opening's (unpainted) cover: on a curved host, when `curved`, the cut's sector
 * (`openingCover`); else, and on every straight host, the rectangle along the tangent, which is what
 * the annotation passes read for an opening on a curve (`annotationFootprint`, card ARC-W1).
 */
function drawOpening(op: ROpening, curved: boolean): SceneNode[] {
  const seg = op.host;
  if (!seg) return [];
  // Tangent at the passage; on a curved host the cover is the cut's sector (`openingCover`).
  const d = segmentDirAt(seg, op.at);
  const n = normal(d);
  const h = seg.thickness / 2;
  const hw = op.width / 2;
  // The wall solid is ALWAYS severed here: the joinery pass
  // (`wall-lowering.ts`) cuts every opening on every host — straight, angled or
  // curved — with the floor running continuously through the gap and the capped jambs
  // the only lines left. So the cover is never painted: `theme.opening` is the page
  // background in every theme, and repainting a real hole with it laid a white band
  // across the floor, overhanging a whole `wallStroke` past each wall face.
  //
  // The polygon is still EMITTED, at the wall's own half-extent, because it is how the
  // ASCII and DXF backends *locate* the passage (they read the polygon on the
  // `openings` pass). Half-extent, not `h + wallStroke`: a stroke-width overhang was
  // slack for a cover that had to hide a face line, and there is no face line here.
  const cover: Point[] = [
    add(add(op.at, mul(d, -hw)), mul(n, h)),
    add(add(op.at, mul(d, hw)), mul(n, h)),
    add(add(op.at, mul(d, hw)), mul(n, -h)),
    add(add(op.at, mul(d, -hw)), mul(n, -h)),
  ];
  const nodes: SceneNode[] = [];
  nodes.push({
    layer: "openings",
    prim: (curved ? openingCover(seg, op.at, op.width) : null) ?? { t: "polygon", pts: cover },
    paint: { fill: "none" },
  });
  // No head/lintel line. A cased opening used to draw one dashed line at each wall
  // face, a convention borrowed from a drawing where the wall was NOT severed. With a
  // real hole in the poché those two lines re-bridge the gap the joinery just opened,
  // which is the opposite of what the passage means — so they are gone, with no
  // opt-in.
  return nodes;
}

export const opening: ElementDef = {
  kind: "opening",
  keyword: "opening",
  // `set` applies no bare word to this kind: its resolver reads nothing from `ctx.defaults`.
  setWords: {},
  doc: "A cased opening: a leaf-less gap in a wall that connects two spaces.",
  params: [
    { name: "at", type: "point", doc: "Center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Opening width in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
  ],

  parse(ctx: ParseCtx): OpeningNode {
    const kw = ctx.eatKeyword("opening");
    const id = ctx.parseIdOpt();
    const { at, attach, between } = parseAttachTarget(ctx, true);
    // The clauses after the placement, in any order, each once (`src/clause-order.ts`), laid
    // out after in the old order, so an opening written in that order keeps its tree.
    let width: OpeningNode["width"] | undefined;
    const wall: Pick<OpeningNode, "wall"> = {};
    const heights: OpeningHeightClauses = {};
    readClauses(ctx, "opening", [
      {
        word: "width",
        rank: 1,
        required: true,
        read(keep) {
          ctx.next();
          const v = ctx.parseExpr();
          if (keep) width = v;
        },
      },
      ...(at ? [wallClause(ctx, 2, (ref) => (wall.wall = ref))] : []),
      // The vertical datum: `head` only. A cased opening's sill is the floor.
      ...openingHeightClauses(ctx, heights, { sill: false }, 3),
    ]);
    if (width === undefined) missingClause(ctx, { what: "opening", id, start: kw.start }, "width", "width <mm>");
    const node: OpeningNode = {
      kind: "opening",
      id,
      width,
      line: kw.line,
      ...(at ? { at } : {}),
      ...(attach ? { attach } : {}),
      ...(between ? { between } : {}),
    };
    Object.assign(node, wall, heightsInOrder(heights));
    return node;
  },

  idPrefix: () => "opening",

  resolve(node, ctx: ResolveCtx): ROpening {
    const n = node as OpeningNode;
    const id = ctx.id;
    const wv = evaluateIn(ctx, n.width);
    noteSquare(ctx, `Opening "${id}"`, "an opening's width", n.width, wv, n.span);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({
        severity: "error",
        message: `Opening "${id}" must have a positive width`,
        code: "E_OPENING_WIDTH",
        span: n.span,
        ...fixesFrom(reprint(ctx, n, "width", "width", () => openingWidthFix("opening", n))),
      });
    }
    // A cased opening is drawn FULL HEIGHT unless the author says otherwise, so its `head`
    // default is the host wall's own height rather than a constant — the one opening whose
    // default is a lookup (see `CASED_OPENING_HEAD`, which is only what this evaluates to
    // in a default storey).
    const heights = (host: ReturnType<typeof ctx.hostSegment>): { head: number } => {
      const full = hostWallHeight(host, ctx.walls, ctx.storeyHeight);
      return { head: resolveOpeningHeights(ctx, `Opening "${id}"`, n, { sill: 0, head: full }, host, n.span).head };
    };
    // Attached or relational: the point + host come from the named wall, or from the rooms
    // (ADR 0028 §5); no off-wall check.
    const lead = resolveOpeningLead(n, "opening", width, ctx, `Opening "${id}"`);
    if (lead) {
      const { at, host, relation } = lead;
      return {
        kind: "opening",
        id,
        at,
        width,
        host,
        ...heights(host),
        span: n.span,
        ...(relation ? { _placement: "relational" as const, _relation: relation } : {}),
        ...(host ? leadOf(n, relation !== undefined) : {}),
      };
    }
    const at = ctx.snapPt(ctx.evalPt(n.at!));
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      const note = nearestWallNote(at, ctx.walls, ctx.sameFile);
      ctx.diag({
        severity: "warning",
        message: `Opening "${id}" does not lie on any wall`,
        code: "W_OPENING_OFF_WALL",
        span: n.span,
        relatedSpans: note ? [note] : undefined,
        ...fixesFrom(
          reprint(ctx, n, "off", `${at.x},${at.y}`, () => offWallFix("opening", n, at, ctx.walls), ctx.walls),
        ),
      });
    }
    const host = ctx.hostSegment(at, n.wall);
    return { kind: "opening", id, at, width, host, ...heights(host), span: n.span };
  },

  bounds: () => [],
  /** Its centre and width (see `door.measures`). */
  measures(resolved): number[] {
    const o = resolved as ROpening;
    return [o.at.x, o.at.y, o.width];
  },

  /** At most 1 primitive (the drawing budget, `MAX_DRAW_UNITS`): the opening cover. */
  drawCost: () => 1,

  render(resolved): SceneNode[] {
    return drawOpening(resolved as ROpening, true);
  },
  /** On a curve, the tangent rectangle: what the label, tag and north-arrow passes read (card ARC-W1). */
  annotationFootprint(resolved): SceneNode[] | undefined {
    const op = resolved as ROpening;
    return op.host && openingCover(op.host, op.at, op.width) ? drawOpening(op, false) : undefined;
  },
  /** The frame's action on a cased opening (`frame.ts`'s `transformElement` calls this). */
  transform(resolved, t: TransformCtx): ROpening {
    const el = resolved as ROpening;
    const { id } = t;
    return { ...el, id, at: t.point(el.at), host: el.host ? t.segment(el.host) : null };
  },
};
