/** `opening [id=] at (x,y) width N [wall ref]` — a leaf-less cased opening: a gap in
 *  the host wall (no door leaf, no glazing) that still connects the two spaces. */

import type { Point, OpeningNode } from "../ast.js";
import type { ElementDef, ParseCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { ROpening } from "../ir.js";
import { add, mul, nearestWallNote, normal, segmentDirAt } from "../geometry.js";
import { parseAttachTarget, resolveAttachment } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";
import { hostWallHeight, parseOpeningHeights, resolveOpeningHeights } from "../datum.js";

export const opening: ElementDef = {
  kind: "opening",
  keyword: "opening",
  doc: "A cased opening: a leaf-less gap in a wall that connects two spaces.",
  params: [
    { name: "at", type: "point", doc: "Center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Opening width in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
  ],

  parse(ctx: ParseCtx): OpeningNode {
    const kw = ctx.eatKeyword("opening");
    const id = ctx.parseIdOpt();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: OpeningNode = {
      kind: "opening",
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
    // The vertical datum (v1.35): `head` only. A cased opening's sill is the floor.
    Object.assign(node, parseOpeningHeights(ctx, { sill: false }));
    return node;
  },

  idPrefix: () => "opening",

  resolve(node, ctx: ResolveCtx): ROpening {
    const n = node as OpeningNode;
    const id = ctx.id;
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({
        severity: "error",
        message: `Opening "${id}" must have a positive width`,
        code: "E_OPENING_WIDTH",
        span: n.span,
        ...fixesFrom(openingWidthFix("opening", n)),
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
    // Attached: the point + host come from walking the named wall (no off-wall check).
    if (n.attach) {
      const a = resolveAttachment(n.attach, ctx.walls, ctx.snapPt, ctx.diag, `Opening "${id}"`, (e) => ctx.eval(e));
      const at = a ? a.at : { x: 0, y: 0 };
      const host = a ? a.host : null;
      return { kind: "opening", id, at, width, host, ...heights(host), span: n.span };
    }
    const at = ctx.snapPt(ctx.evalPt(n.at!));
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      const note = nearestWallNote(at, ctx.walls);
      ctx.diag({
        severity: "warning",
        message: `Opening "${id}" does not lie on any wall`,
        code: "W_OPENING_OFF_WALL",
        span: n.span,
        relatedSpans: note ? [note] : undefined,
        ...fixesFrom(offWallFix("opening", n, at, ctx.walls)),
      });
    }
    const host = ctx.hostSegment(at, n.wall);
    return { kind: "opening", id, at, width, host, ...heights(host), span: n.span };
  },

  bounds: () => [],

  render(resolved): SceneNode[] {
    const op = resolved as ROpening;
    const seg = op.host;
    if (!seg) return [];
    // Tangent at the passage on a curved host (cover along it, jambs radial).
    const d = segmentDirAt(seg, op.at);
    const n = normal(d);
    const h = seg.thickness / 2;
    const hw = op.width / 2;
    // The wall solid is ALWAYS severed here: since v1.30 the joinery pass
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
      prim: { t: "polygon", pts: cover },
      paint: { fill: "none" },
    });
    // No head/lintel line. A cased opening used to draw one dashed line at each wall
    // face, a convention borrowed from a drawing where the wall was NOT severed. With a
    // real hole in the poché those two lines re-bridge the gap the joinery just opened,
    // which is the opposite of what the passage means — so they are gone, with no
    // opt-in.
    return nodes;
  },
};
