/** `room [id=] (at (x,y) | DIR ref [align E] [gap n]) size WxH [label "…"]`
 *  or `room [id=] polygon (x,y) (x,y) (x,y) … [label "…" [at (x,y)]]`
 *  or `room [id=] circle at (cx,cy) radius R [label "…"]`
 *  — floor fill + label + computed area. The absolute `at` path is the default;
 *  the relational clause is resolved to absolute coords in `placeRelational`; the
 *  `polygon` form carries its own vertex ring and derives `at`/`size` as the
 *  ring's bounding box, so every rect-shaped consumer still sees a sane extent; the
 *  `circle` form adds an exact centre+radius, a tessellated ring for the grid
 *  layer, and that same derived bounding box. A `polygon` ring with `arc` edges (card ARC2)
 *  carries its exact edges beside its tessellation, whose vertices it charges to the step meter
 *  (one step each) before it builds them. */

import type { ExprPoint, FloorClause, Point, RelAlign, RelDir, RoomNode, UseKind, WallArcNode } from "../ast.js";
import {
  AXIS_ALIGNS,
  REL_ALIGNS,
  REL_DIR_AXIS,
  OUTDOOR_KINDS,
  REL_DIRS as REL_DIR_LIST,
  USE_KINDS,
  relAlignCounterpart,
} from "../ast.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import type { Expr } from "../expr.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import { failExpected, failNear, missingClause, readClauses, type TailClause } from "../clause-order.js";
import { PLAIN_SHEET_TEXT } from "../sheet-text.js";
import type { SceneNode } from "../scene.js";
import type { RelConstraint, RRoom } from "../ir.js";
import { chargeSteps, closest } from "../expr.js";
import { fixesFrom, roomAlignAxisFix, roomAlignFix } from "../fix-producers.js";
import { recordWordSpan, wordSpanOf } from "../id-spans.js";
import {
  ARC_STEP_DEG,
  type Arc,
  arcExtremes,
  arcFromChord,
  arcTessellate,
  fullCircleArc,
  minArcRadius,
  smallestSpanningRadius,
} from "../geometry/arc.js";
import { type EdgeLoop, loopBBox } from "../geometry/band.js";
import { toPathLoop } from "../geometry/joinery.js";
import { ringArcMaxChordAngle, ringArcVertexCount, ringOfEdges, roomAreaMm2, roomRing } from "../geometry/room-ring.js";
import { ROOM_CONTAINMENT_SLACK_MM } from "../analyze/rooms.js";
import { readArcClause } from "./wall.js";
import {
  effectiveVertices,
  pointInPolygon,
  polygonBounds,
  polygonLabelPoint,
  polygonSelfIntersects,
} from "../geometry/polygon.js";
import { fmt3, fmtMessage, fmtTenthsOf2dp } from "../num-format.js";
import { noteMetres, noteSnap, noteSquare, roomSizeLooksMetric } from "../ir/silent-accepts.js";
import { FLOOR_MATERIALS, type FloorMaterial, floorHatch, hatchId, isFloorMaterial } from "../hatches.js";
import { LABEL_AREA_DROP, LABEL_NAME_RISE } from "../text-layout.js";
import type { Theme } from "../theme.js";
import type { FixtureMaterial } from "./fixtures-glyphs.js";
import { parseHexColor } from "./glyph-lib.js";

const REL_DIRS: ReadonlySet<string> = new Set<RelDir>(REL_DIR_LIST);

/**
 * The material whose tint a room's floor is washed in when its author wrote one of these floor
 * words (card RM8.7, ruling RM-D28, ADR 0023's 2026-11-12 amendment): a theme with `materialTints`
 * (only `rendered` ships one) paints the floor polygon in that material's tint moved
 * {@link FLOOR_TINT_MIX} of the way from `roomFill`. The four older words take no wash, so no plan
 * written before them changes under any theme; a theme without tints draws `roomFill` as before.
 * The words name the materials `rendered` already colours furniture in: one material, one hue.
 */
export const FLOOR_TINT_MATERIAL: Readonly<Partial<Record<FloorMaterial, FixtureMaterial>>> = {
  timber: "wood",
  carpeting: "wool",
  stone: "stone",
};

/**
 * How far a floor's wash moves from `roomFill` toward its material's tint, as an exact fraction
 * `[p, q]`. RM-D28's hard condition is that the floor pattern's ink (`pocheHatch`) keeps at least
 * 2.0:1 against the wash; the full tints give 1.66 to 1.87:1 under `rendered`, a third of the way
 * gives `timber` #f8f2e7 at 2.063:1, `stone` #f7f5f1 at 2.111:1 and `carpeting` #faf6f0 at 2.135:1.
 * `test/room-floor.test.ts` measures it for every shipped theme that has tints, so a theme given
 * `materialTints` later is held to the same floor. An odd denominator, as `SYMBOL_INK_MIX`'s, so
 * the per-channel rounding has no tie to break.
 */
export const FLOOR_TINT_MIX: readonly [number, number] = [1, 3];

/**
 * A room's floor colour: `roomFill`, or under a theme with tints the wash of its `floor` word's
 * material ({@link FLOOR_TINT_MATERIAL}). Either colour unparseable (an author's room colour by
 * name, a tint that is no hex) keeps `roomFill`: nothing to mix, and no guess.
 */
export function roomFloorFill(theme: Theme, floor: FloorMaterial | undefined): string {
  const material = floor === undefined ? undefined : FLOOR_TINT_MATERIAL[floor];
  const raw: unknown = theme.materialTints;
  if (material === undefined || typeof raw !== "object" || raw === null || !Object.hasOwn(raw, material))
    return theme.roomFill;
  const tint = (raw as Record<string, unknown>)[material];
  const t = typeof tint === "string" ? parseHexColor(tint) : null;
  const f = parseHexColor(theme.roomFill);
  if (!t || !f) return theme.roomFill;
  const [p, q] = FLOOR_TINT_MIX;
  const hex = (i: 0 | 1 | 2): string =>
    Math.round((f[i] * (q - p) + t[i] * p) / q)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(0)}${hex(1)}${hex(2)}`;
}

/**
 * The wash a room floored in `floor` really takes under `theme`, or `undefined` when it takes none:
 * {@link roomFloorFill} where that differs from `roomFill`. Only then may a flat stand-in for the
 * floor's pattern show the room's colour instead of its pattern (card RM8.7b: the PDF and the legend
 * swatch); with no wash (every theme but `rendered`, an older word) they draw it as they always did.
 */
export function floorWash(theme: Theme, floor: string): string | undefined {
  if (!isFloorMaterial(floor)) return undefined;
  const fill = roomFloorFill(theme, floor);
  return fill === theme.roomFill ? undefined : fill;
}
const REL_ALIGN_SET: ReadonlySet<string> = new Set<RelAlign>(REL_ALIGNS);
const USE_SET: ReadonlySet<string> = new Set<UseKind>(USE_KINDS);

/**
 * Words an author reaches for after `uses` that name ground OUTSIDE the building, which
 * ArchLang draws as an `outdoor <kind>` surface rather than as a room (backlog U.6). Every
 * {@link OUTDOOR_KINDS} word maps to itself (derived, so a new kind joins without an edit);
 * a synonym that is not a kind maps to the kind `docs/language-reference.md` draws it as
 * (its outdoor example: `outdoor lawn … label "Garden"`, `outdoor balcony … label "Terrace"`),
 * and a word with no such source gets no hint (backlog RR.5). Read case-blind. Exported so a
 * test ties each synonym (an entry whose word is not its kind) to that example.
 */
export const OUTDOOR_USE_NEAR_MISS: ReadonlyMap<string, string> = new Map<string, string>([
  ...OUTDOOR_KINDS.map((k): [string, string] => [k, k]),
  ["terrace", "balcony"],
  ["garden", "lawn"],
]);

function outdoorKindFor(word: string | undefined): string | undefined {
  return word === undefined ? undefined : OUTDOOR_USE_NEAR_MISS.get(word.toLowerCase());
}

/**
 * The one wording of the "no valid room use after `uses`" parse error, shared by the
 * room element and the strip parser so the two cannot drift. When the offending word is
 * an outdoor surface (`uses balcony`), the message names the element that draws it.
 */
export function roomUsesExpected(found: string | undefined, type: string): string {
  const base = `Expected one or more room uses (${USE_KINDS.join("|")}) after "uses" but found ${found ? `"${found}"` : "end of input"}`;
  const kind = type === "ident" ? outdoorKindFor(found) : undefined;
  return kind === undefined
    ? base
    : `${base}; "${found}" is not a room use: draw it as its own \`outdoor ${kind}\` surface outside the room`;
}

/**
 * The hint for an outdoor word that directly follows a valid `uses` list (`uses living
 * balcony`), else `undefined`. The list simply ends before such a word, so the room is kept;
 * the parser adds this only to the error the word ALREADY raises where the next statement
 * (or a strip's next `room`) should start (backlog RR.5). The same word anywhere else (an
 * assignment, a component call, a plugin keyword) parses as before.
 */
export function roomUsesOutdoorHint(type: string, found: string): string | undefined {
  const kind = type === "ident" ? outdoorKindFor(found) : undefined;
  return kind === undefined
    ? undefined
    : `"${found}" after "uses" is not a room use: draw it as its own \`outdoor ${kind}\` surface outside the room`;
}

/** The axis sentence both `align` diagnostics end on, rendered from {@link AXIS_ALIGNS}
 *  rather than retyped per branch — the rule and its two prose spellings have one owner,
 *  so adding an edge or an axis cannot leave a hint quietly out of date. */
const axisHint = (dir: RelDir): string => {
  const axis = REL_DIR_AXIS[dir];
  const [places, cross] = axis === "v" ? ["horizontal", "vertical"] : ["vertical", "horizontal"];
  return `\`${dir}\` places on the ${places} axis, so the cross axis is ${cross}: \`${AXIS_ALIGNS[axis].join("|")}\`.`;
};

/**
 * Where a room's label + area text are anchored, before any obstacle-aware
 * relocation: the author's `label … at (x,y)` when written (it always wins), else the
 * room centre for a rectangle, the circle's centre, or the area CENTROID for a polygon
 * — via {@link polygonLabelPoint}, which returns the centroid itself whenever the
 * centroid is legal, so a convex ring's bytes are untouched.
 *
 * Exported because the label-relocation post-pass (`src/label-placement.ts`) must know
 * the exact incumbent point in order to measure the translation it applies, and a second
 * copy of this expression would be a silent divergence: the anchor and the thing that
 * moves it have to agree about where the label started.
 */
export function roomLabelAnchor(r: RRoom): Point {
  return (
    r.labelAt ??
    (r.circle
      ? r.circle.c
      : r.poly
        ? polygonLabelPoint(r.poly)
        : { x: r.at.x + r.size.w / 2, y: r.at.y + r.size.h / 2 })
  );
}

/**
 * The one wording of `W_ROOM_LABEL_OUTSIDE`, shared by all three room shapes. Only the
 * containment TEST differs between them (a rectangle's four half-planes, a circle's
 * radius, a polygon's crossing count); the advisory itself must read identically, since
 * an agent keys off the code and a human off the sentence.
 */
function labelOutsideDiag(id: string, labelAt: Point, span: Span | undefined): Diagnostic {
  return {
    severity: "warning",
    message: `Room "${id}" pins its label at (${fmtMessage(labelAt.x)}, ${fmtMessage(labelAt.y)}), which is outside the room`,
    code: "W_ROOM_LABEL_OUTSIDE",
    span,
  };
}

/**
 * `W_ROOM_LABEL_OUTSIDE` for a RECTANGULAR room whose author pinned the label off its own
 * floor — or `undefined` when there is nothing to report.
 *
 * Exported because a rectangle is the one room form whose floor is not known when the
 * element resolves: a relational room (`right-of kitchen`) carries a placeholder `at`
 * until {@link import("../layout.js").placeRelational} computes the real one, so that
 * pass is the earliest moment the test can be honest. Both call sites go through this
 * function rather than each writing the comparison, so the absolute and relational forms
 * cannot drift into disagreeing about what "outside" means.
 *
 * The boundary counts as INSIDE, matching the circle (`> rr`) and the polygon
 * (`pointInPolygon`, which admits its own edge): a pin on a wall face is a legitimate
 * drafting choice, not a mistake. A room that already failed `E_ROOM_SIZE` is skipped —
 * a zero-extent rectangle would report every pin as outside, which is one diagnostic
 * about a problem the author has already been told about.
 */
export function rectLabelOutsideDiag(r: RRoom): Diagnostic | undefined {
  const at = r.labelAt;
  if (!at || r.poly || r.circle) return undefined;
  if (!(r.size.w > 0 && r.size.h > 0)) return undefined;
  const outside = at.x < r.at.x || at.x > r.at.x + r.size.w || at.y < r.at.y || at.y > r.at.y + r.size.h;
  return outside ? labelOutsideDiag(r.id, at, r._labelAtSpan ?? r.span) : undefined;
}

/**
 * The clauses after a room's placement, which every room form shares, in any order and each once
 * (`src/clause-order.ts`): a rectangle's `size` (when `sized`), `label "…" [at (x,y)]`,
 * `floor <pattern>` and `uses <kind> …`. Each key lands on `node` as its clause is read, so a
 * plan in the old order (`size`, `label`, then `floor` and `uses` either way round) has the tree
 * it always had. Factored out so the rect and polygon forms can never drift apart.
 */
function parseTail(ctx: ParseCtx, node: RoomNode, start: number, sized = false): void {
  const clauses: TailClause[] = [
    {
      word: "label",
      rank: 1,
      read(keep) {
        ctx.next();
        const label = ctx.parseStringExpr();
        // `label "Gallery" at (x,y)` — an explicit anchor for the label + area text. Only
        // reachable after a label (the room's own `at` was consumed before the clauses).
        let labelAt: ExprPoint | undefined;
        let labelAtSpan: Span | undefined;
        if (ctx.isKeyword("at")) {
          const kw = ctx.next();
          labelAt = ctx.parsePoint();
          labelAtSpan = { start: kw.start, end: ctx.peek(-1).end };
        }
        if (!keep) return;
        node.label = label;
        if (labelAt) {
          node.labelAt = labelAt;
          node.labelAtSpan = labelAtSpan;
        }
      },
    },
    floorClause(ctx, 2, node),
    {
      // Optional `uses <kind> [<kind> …]` — explicit room classification. Greedily
      // consume contiguous valid use-kind identifiers (they never collide with a
      // following statement keyword), requiring at least one.
      word: "uses",
      rank: 2,
      read(keep) {
        ctx.next();
        const uses: UseKind[] = [];
        while (ctx.peek().type === "ident" && USE_SET.has(ctx.peek().value)) {
          uses.push(ctx.next().value as UseKind);
        }
        if (uses.length === 0) {
          failNear(ctx, roomUsesExpected(ctx.peek().value || undefined, ctx.peek().type), USE_KINDS);
        }
        if (keep) node.uses = uses;
      },
    },
  ];
  if (sized) {
    clauses.unshift({
      word: "size",
      rank: 0,
      required: true,
      read(keep) {
        ctx.next();
        const sizeStart = ctx.peek().start;
        const size = ctx.parseDimensions();
        const sizeSpan = ctx.spanFrom(sizeStart);
        if (!keep) return;
        node.size = size;
        node.sizeSpan = sizeSpan;
      },
    });
  }
  readClauses(ctx, "room", clauses);
  // A rectangle cannot leave its `size` out.
  if (sized && node.size === undefined)
    missingClause(ctx, { what: "room", id: node.id, start }, "size", "size <W>x<H>");
}

/**
 * `floor <pattern>`, a clause of a room line. The word and its value stand on one line, so a
 * statement that starts with the word (`floor = 2`, `floor()`, `floor` alone) stays that statement.
 */
export function floorClause(ctx: ParseCtx, rank: number, node: { floor?: FloorClause }): TailClause {
  return {
    word: "floor",
    rank,
    at: () => ctx.isKeyword("floor") && ctx.peek(1).type === "ident" && ctx.peek(1).line === ctx.peek().line,
    read(keep) {
      ctx.next();
      const value = ctx.next();
      if (keep) node.floor = { word: value.value, span: { start: value.start, end: value.end } };
    },
  };
}

/**
 * A rectangle room's written `size`, said out loud when it is not what is drawn (RM1.4): sides
 * that read as metres (`size 4x3`, `W_LENGTH_IN_METRES`), else a side `grid` moved
 * (`W_GRID_SNAPPED`); first, a side that is a binding times itself (`W_AREA_AS_LENGTH`, AF10 step
 * 2). Reports only; the room keeps the snapped size it always had.
 */
function noteRoomSize(
  ctx: ResolveCtx,
  id: string,
  exprs: { w: Expr; h: Expr },
  written: { w: number; h: number },
  size: { w: number; h: number },
  span: Span | undefined,
): void {
  noteSquare(ctx, `Room "${id}"`, "a room's size", exprs.w, written.w, span, true);
  noteSquare(ctx, `Room "${id}"`, "a room's size", exprs.h, written.h, span, true);
  const metric = roomSizeLooksMetric(written.w, written.h);
  if (metric && noteMetres(ctx, `Room "${id}"`, "size", [written.w, written.h], span)) return;
  noteSnap(ctx, `Room "${id}"`, "size", [written.w, written.h], [size.w, size.h], span);
}

/** A room's `floor` word held to the patterns; another is `W_UNKNOWN_MATERIAL` and draws none. */
function floorOf(n: RoomNode, ctx: ResolveCtx): Pick<RRoom, "floor"> {
  if (n.floor === undefined) return {};
  if (isFloorMaterial(n.floor.word)) return { floor: n.floor.word };
  const hint = closest(n.floor.word, [...FLOOR_MATERIALS]);
  ctx.diag({
    severity: "warning",
    message: `Unknown floor "${n.floor.word}" (known: ${FLOOR_MATERIALS.join(", ")}); drawing no pattern`,
    code: "W_UNKNOWN_MATERIAL",
    span: n.floor.span,
    ...(hint ? { hints: [`Did you mean "${hint}"?`] } : {}),
  });
  return {};
}

/** A room's resolved relational clause, its reference id's span kept beside it (AF2), so the
 *  resolved room (and `resolve()`'s output) carries no new key. */
function relConstraint(rel: NonNullable<RoomNode["rel"]>, gap: number, span: Span | undefined): RelConstraint {
  const out: RelConstraint = { dir: rel.dir, ref: rel.ref, align: rel.align, gap, span };
  const refSpan = wordSpanOf(rel);
  if (refSpan) recordWordSpan(out, refSpan);
  return out;
}

export const room: ElementDef = {
  kind: "room",
  keyword: "room",
  // `set` applies no bare word to this kind: its resolver reads nothing from `ctx.defaults`.
  setWords: {},
  doc: "A room: a filled rectangle with a centered label and computed area.",
  params: [
    { name: "at", type: "point", optional: true, doc: "Absolute top-left corner (x, y) in mm." },
    {
      name: REL_DIR_LIST.join("|"),
      type: "ref",
      optional: true,
      doc: "Place relative to another room by id (instead of `at`).",
    },
    {
      name: "align",
      type: REL_ALIGNS.join("|"),
      optional: true,
      doc: "Edge to align with the reference room.",
    },
    {
      name: "gap",
      type: "number",
      optional: true,
      default: "0",
      doc: "Spacing (mm) from the reference room along the placement axis.",
    },
    {
      name: "polygon",
      type: "(x,y) (x,y) (x,y) …",
      optional: true,
      doc: "An implicitly-closed simple polygon of ≥3 vertices, instead of `at` + `size`.",
    },
    {
      name: "circle at … radius",
      type: "point + number",
      optional: true,
      doc: "A circular floor: centre (cx,cy) and radius R in mm, instead of `at` + `size`.",
    },
    { name: "size", type: "WxH", doc: "Width × height in mm (e.g. 4000x3000)." },
    { name: "label", type: "string", optional: true, doc: "Room label (supports {interpolation})." },
    {
      name: "label … at",
      type: "point",
      optional: true,
      doc: "Explicit label/area anchor — overrides the automatic centroid/pole placement.",
    },
  ],

  parse(ctx: ParseCtx): RoomNode {
    const kw = ctx.eatKeyword("room");
    const id = ctx.parseIdOpt();
    let at: RoomNode["at"];
    let rel: RoomNode["rel"];
    // —— `polygon (x,y) (x,y) (x,y) …` — the explicit-ring form (no `size`). ——
    if (ctx.isKeyword("polygon")) {
      ctx.eatKeyword("polygon");
      const polygon: ExprPoint[] = [];
      // `arc (x,y) radius R [cw|ccw] [major]` (card ARC2): the wall body's own clause, read by
      // the wall's reader, written on the vertex the curved edge arrives at, so it cannot lead
      // the ring. `arcs[k]` is the edge from `polygon[k]` to `polygon[k + 1]`, as a wall's.
      const arcs: Array<WallArcNode | undefined> = [];
      while (ctx.isType("lparen") || ctx.isKeyword("arc")) {
        if (ctx.isType("lparen")) {
          polygon.push(ctx.parsePoint());
          continue;
        }
        const { to, arc } = readArcClause(ctx, polygon.length === 0);
        arcs[polygon.length - 1] = arc;
        polygon.push(to);
      }
      // A ring needs three written vertices, or two joined by an arc (a segment of a circle:
      // an `arc` always follows a vertex, so a curved ring has two).
      const curved = arcs.length > 0;
      if (!curved && polygon.length < 3) {
        ctx.fail(`A polygon room needs at least three vertices but found ${polygon.length}`, kw);
      }
      const node: RoomNode = { kind: "room", id, polygon, ...(curved ? { arcs } : {}), line: kw.line };
      parseTail(ctx, node, kw.start);
      return node;
    }
    // —— `circle at (cx,cy) radius R` — the circular-floor form (no `size`). ——
    if (ctx.isKeyword("circle")) {
      ctx.eatKeyword("circle");
      ctx.eatKeyword("at");
      const c = ctx.parsePoint();
      ctx.eatKeyword("radius");
      const r = ctx.parseExpr();
      const node: RoomNode = { kind: "room", id, circle: { c, r }, line: kw.line };
      parseTail(ctx, node, kw.start);
      return node;
    }
    if (ctx.isKeyword("at")) {
      ctx.eatKeyword("at");
      at = ctx.parsePoint();
    } else {
      // Relational clause: DIR REF [align EDGE] [gap EXPR].
      const dirTok = ctx.next();
      if (!REL_DIRS.has(dirTok.value)) {
        failExpected(
          ctx,
          `Expected "at" or a relational direction (${REL_DIR_LIST.join("|")}) but found "${dirTok.value}"`,
          // In the order the statement tries its placements (AF4).
          ["polygon", "circle", "at", ...REL_DIR_LIST],
          { t: dirTok, near: ["at", ...REL_DIR_LIST] },
        );
      }
      const refTok = ctx.eatIdent();
      const ref = refTok.value;
      let align: RelAlign | undefined;
      let alignSpan: Span | undefined;
      let alignBad: { word: string; span: Span } | undefined;
      let gap: Expr | undefined;
      if (ctx.isKeyword("align")) {
        ctx.next();
        // CHECKED, not cast. Every other closed value set on this statement already
        // refuses an unknown word (`REL_DIRS` just above, `USE_KINDS` in `parseTail`);
        // `align` was the one that did not, and an out-of-set word silently drew the
        // plan as `align top`. Refusal is DEFERRED to resolve rather than raised here
        // as a parse error, because that is what buys the offending word a catalogued
        // code, a `fix`, and `file` provenance — the same shape as `E_DOOR_KIND_CLAUSE`.
        const t = ctx.eatIdent();
        // Membership is only HALF the check. A legal word can still belong to the other
        // axis (`right-of … align left`), which `alignOffset` also drops on the floor —
        // so the word's span is kept even when it passes, because that second, direction-
        // dependent judgement can only be made at resolve, and `E_ROOM_ALIGN_AXIS` needs
        // these bytes to underline and to rewrite.
        if (REL_ALIGN_SET.has(t.value)) {
          align = t.value as RelAlign;
          alignSpan = { start: t.start, end: t.end };
        } else alignBad = { word: t.value, span: { start: t.start, end: t.end } };
      }
      if (ctx.isKeyword("gap")) {
        ctx.next();
        gap = ctx.parseExpr();
      }
      rel = { dir: dirTok.value as RelDir, ref, align, alignSpan, alignBad, gap };
      recordWordSpan(rel, { start: refTok.start, end: refTok.end });
    }
    // `size` is read with the other clauses, so it may follow them; its key keeps its place.
    const node: RoomNode = { kind: "room", id, at, rel, size: undefined, sizeSpan: undefined, line: kw.line };
    parseTail(ctx, node, kw.start, true);
    return node;
  },

  idPrefix: () => "room",

  resolve(node, ctx: ResolveCtx): RRoom {
    const n = node as RoomNode;
    const id = ctx.id;
    if (n.circle) return resolveCircle(n, id, ctx);
    if (n.polygon) return resolvePolygon(n, id, ctx);
    if (n.at) {
      // —— Absolute / "manual" path — no constraint, never moved by the solver. ——
      const at = ctx.snapPt(ctx.evalPt(n.at));
      const written = { w: ctx.eval(n.size!.w), h: ctx.eval(n.size!.h) };
      const size = { w: ctx.snap(written.w), h: ctx.snap(written.h) };
      if (size.w <= 0 || size.h <= 0) {
        ctx.diag({
          severity: "error",
          message: `Room "${id}" must have a positive size`,
          code: "E_ROOM_SIZE",
          span: n.span,
        });
      }
      noteRoomSize(ctx, id, n.size!, written, size, n.sizeSpan ?? n.span);
      // An explicit `label … at (x,y)` is recorded here exactly as the `polygon` and
      // `circle` forms record theirs. Parsing the clause and then dropping it would make
      // the anchor silently do nothing and leave `W_ROOM_LABEL_OUTSIDE` unable to fire on
      // the commonest room form in the language.
      const labelAt = n.labelAt ? ctx.snapPt(ctx.evalPt(n.labelAt)) : undefined;
      const room: RRoom = {
        kind: "room",
        id,
        at,
        size,
        ...(labelAt ? { labelAt, _labelAtSpan: n.labelAtSpan } : {}),
        label: n.label !== undefined ? ctx.evalStr(n.label) : undefined,
        ...(n.uses ? { uses: n.uses } : {}),
        ...floorOf(n, ctx),
        span: n.span,
      };
      // The floor is known right here, so the advisory is raised at resolve like the
      // other two shapes' — and, being a resolve diagnostic, it gets `file` provenance.
      const outside = rectLabelOutsideDiag(room);
      if (outside) ctx.diag(outside);
      return room;
    }
    // —— Relational path: position computed later by placeRelational(), in
    //    dependency order. `at` is a placeholder until then. ——
    const rel = n.rel!;
    // An out-of-set `align <word>`. Raised HERE rather than at parse so it carries a
    // catalogued code, a `fix` and `file` provenance — and spanned on the OFFENDING
    // WORD, which is both what the reader needs to see underlined and the exact bytes
    // the fix rewrites. `closest()` is the CLI's own did-you-mean helper, reused rather
    // than reimplemented; it declines beyond a small edit distance, and the fix declines
    // with it (see `roomAlignFix`).
    if (rel.alignBad) {
      const hint = closest(rel.alignBad.word, [...REL_ALIGNS]);
      ctx.diag({
        severity: "error",
        message:
          `Room "${id}" has \`align ${rel.alignBad.word}\`, which is not an alignment edge` +
          `${hint ? ` — did you mean "${hint}"?` : ""}`,
        code: "E_ROOM_ALIGN",
        span: rel.alignBad.span,
        hints: [`Available: ${REL_ALIGNS.join(", ")}.`, axisHint(rel.dir)],
        ...fixesFrom(roomAlignFix(rel.alignBad, hint)),
      });
    }
    // The OTHER half of the same defect: a word that IS in `REL_ALIGNS` but belongs to
    // the other axis. `1213e08` closed the typo case and left this one, and this one is
    // the likelier of the two — the offending words are valid spellings, so nothing about
    // the source looks wrong. `alignOffset` matches no branch for them and returns the
    // leading edge, which is why `right-of a align left` and `right-of a align top` drew
    // byte-identical plans with zero diagnostics.
    //
    // `relAlignCounterpart` both decides and answers, so the two can never disagree: it
    // returns null for a legal word (including a centring word, legal on BOTH axes) and
    // the positional counterpart otherwise. Unlike the typo case there is no guess and so
    // no declining branch — the fix is always offered.
    const counterpart = rel.align !== undefined ? relAlignCounterpart(rel.dir, rel.align) : null;
    if (counterpart !== null && rel.alignSpan) {
      ctx.diag({
        severity: "error",
        message:
          `Room "${id}" has \`${rel.dir} … align ${rel.align}\`, but \`${rel.align}\` is an edge of the other axis` +
          ` — did you mean "${counterpart}"?`,
        code: "E_ROOM_ALIGN_AXIS",
        span: rel.alignSpan,
        hints: [
          axisHint(rel.dir),
          `\`${rel.align}\` was silently ignored before v1.26, drawing the room against \`${AXIS_ALIGNS[REL_DIR_AXIS[rel.dir]][0]}\`.`,
        ],
        ...fixesFrom(roomAlignAxisFix(rel.alignSpan, counterpart)),
      });
    }
    const gap = rel.gap !== undefined ? ctx.eval(rel.gap) : 0;
    const written = { w: ctx.eval(n.size!.w), h: ctx.eval(n.size!.h) };
    const size = { w: ctx.snap(written.w), h: ctx.snap(written.h) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Room "${id}" must have a positive size`,
        code: "E_ROOM_SIZE",
        span: n.span,
      });
    }
    noteRoomSize(ctx, id, n.size!, written, size, n.sizeSpan ?? n.span);
    // The anchor is an absolute plan coordinate even here — `label … at` says WHERE the
    // name is drawn, it is not an offset from a room whose corner is not yet known. So it
    // is recorded now and CHECKED later: `placeRelational` calls `rectLabelOutsideDiag`
    // once it has computed this room's real `at`, which is why `_labelAtSpan` travels
    // with it (a diagnostic raised there must still blame the `at (x,y)` clause).
    const labelAt = n.labelAt ? ctx.snapPt(ctx.evalPt(n.labelAt)) : undefined;
    return {
      kind: "room",
      id,
      at: { x: 0, y: 0 },
      size,
      ...(labelAt ? { labelAt, _labelAtSpan: n.labelAtSpan } : {}),
      label: n.label !== undefined ? ctx.evalStr(n.label) : undefined,
      ...(n.uses ? { uses: n.uses } : {}),
      ...floorOf(n, ctx),
      span: n.span,
      _rel: relConstraint(rel, gap, n.span),
    };
  },

  bounds(resolved): Point[] {
    const r = resolved as RRoom;
    // An arc edge's floor reaches its closed-form extremes, past its chord (card ARC2).
    if (r.edges) return r.edges.flatMap((e) => (e.t === "line" ? [e.a] : arcExtremes(e.arc)));
    return roomRing(r);
  },

  /** Its authored label anchor, the one coordinate a room carries outside its floor, and each
   *  arc edge's centre and radius, which no drawn point carries. */
  measures(resolved): number[] {
    const r = resolved as RRoom;
    const out = r.labelAt ? [r.labelAt.x, r.labelAt.y] : [];
    for (const e of r.edges ?? []) if (e.t === "arc") out.push(e.arc.center.x, e.arc.center.y, e.arc.r);
    return out;
  },

  /**
   * At most 6 primitives (the drawing budget, `MAX_DRAW_UNITS`): its floor (a polygon or a true
   * circle), its `floor` hatch, its name and its area, and, when its label is led off its floor
   * (card AL3b, `src/label-fit.ts`), the leader's line and dot. Only a named room whose label is not
   * pinned can be led, so only it is charged the two.
   */
  drawCost: (resolved) => {
    const r = resolved as RRoom;
    const leader = r.label && r.labelAt === undefined ? 2 : 0;
    return (r.floor ? 4 : 3) + leader;
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const r = resolved as RRoom;
    const { theme, sizes } = ctx;
    const nodes: SceneNode[] = [];
    // `roomFill`, or under `rendered` the wash of a newer floor word's material (`roomFloorFill`).
    const fill = roomFloorFill(theme, r.floor);
    // A circular floor is drawn as a TRUE `circle` primitive (an SVG `<circle>`, a DXF
    // `CIRCLE`), so its edge is never faceted — the tessellated `poly` it also carries
    // exists for the grid/adjacency layer, not for the drawing.
    if (r.circle) {
      nodes.push({
        layer: "floor",
        prim: { t: "circle", center: r.circle.c, r: r.circle.r },
        paint: { fill },
      });
    } else if (r.edges) {
      // An arc-edged ring (card ARC2) is drawn as a `path` with TRUE arcs (each cut into minor
      // pieces, `toPathLoop`), so its curve is never faceted either.
      nodes.push({ layer: "floor", prim: { t: "path", loops: [toPathLoop(r.edges)] }, paint: { fill } });
    } else {
      const c = roomRing(r);
      nodes.push({ layer: "floor", prim: { t: "polygon", pts: c }, paint: { fill } });
    }
    // `floor <pattern>`: over the tint, from the room's own ring (a circle's 48-gon, an arc
    // ring's tessellation, which its walls cover). A drawing fact: no measure reads it. The paint carries the pattern reference,
    // as `wall-lowering.ts` and the ground's do.
    if (r.floor) {
      const spec = floorHatch(r.floor);
      const ring = roomRing(r);
      nodes.push({
        layer: "floor",
        prim: { t: "hatch", region: [ring.map((p) => ({ ...p }))], material: spec.material, scale: 1, angle: 0 },
        paint: { fill: `url(#${hatchId(spec)})`, fillRule: "nonzero" },
      });
    }

    // Label/area anchor: the room centre for a rectangle, the circle's centre, the area
    // CENTROID for a polygon (closed form) — or, for the concave ring whose centroid lands
    // off its own floor, that ring's pole of inaccessibility (`polygonLabelPoint`, which
    // returns the centroid itself whenever the centroid is legal, so a convex ring's bytes
    // are untouched) — or the author's `label … at (x,y)`, which always wins.
    const centre = roomLabelAnchor(r);
    const cx = centre.x;
    const cy = centre.y;
    // The rectangle keeps its OWN expression, written out rather than routed through one
    // helper: its `(w/1000)*(h/1000)` differs from an `area/1e6` rewrite by an ulp, and an
    // ulp at a `.x5` boundary flips `toFixed(1)` — so a "tidier" single expression would
    // silently move an existing drawing's bytes. A circle is πR², exact — never the 48-gon
    // the grid layer uses (0.29% short). A circle and a polygon (its shoelace) were always
    // `area/1e6`, so they read the exact area through the room-ring seam (`roomAreaMm2`).
    const areaM2 =
      r.circle || r.poly ? (roomAreaMm2(r) / 1_000_000).toFixed(1) : ((r.size.w / 1000) * (r.size.h / 1000)).toFixed(1);
    // `schedule rooms net`: the schedule's own net figure (two decimals, as it is tabulated),
    // read to one decimal and named, so a reader cannot take it for the centreline area. A room
    // with no net figure keeps the centreline stamp, unsuffixed.
    const net = ctx.netAreaOf?.(r.id);
    const text = ctx.text ?? PLAIN_SHEET_TEXT;
    const stamp =
      net !== undefined ? `${text.num(fmtTenthsOf2dp(net))} m² ${text.word("net")}` : `${text.num(areaM2)} m²`;
    // The name, then the area figure: `wrapLabels` (`src/label-placement.ts`) reads a
    // room's two text nodes in this order when the name is too wide for one line.
    if (r.label) {
      nodes.push({
        layer: "labels",
        prim: {
          t: "text",
          at: { x: cx, y: cy - sizes.roomFont * LABEL_NAME_RISE },
          value: r.label,
          size: sizes.roomFont,
          anchor: "middle",
          baseline: "central",
          weight: 600,
        },
        paint: { fill: theme.roomLabel },
      });
    }
    nodes.push({
      layer: "labels",
      prim: {
        t: "text",
        at: { x: cx, y: cy + (r.label ? sizes.roomFont * LABEL_AREA_DROP : 0) },
        value: stamp,
        size: sizes.areaFont,
        anchor: "middle",
        baseline: "central",
      },
      paint: { fill: theme.areaLabel },
    });
    return nodes;
  },
  /** The frame's action on a room (`frame.ts`'s `transformElement` calls this). */
  transform(resolved, t: TransformCtx): RRoom {
    const el = resolved as RRoom;
    const { id } = t;
    const r = t.rect(el.at, el.size);
    const out: RRoom = { ...el, id, at: r.at, size: r.size };
    // A polygon room's ring is carried through vertex by vertex — a frame is an
    // integer isometry, so the turned/mirrored ring is EXACT (same area, same shape,
    // no float drift) and its bbox above still bounds it. Ring ORDER is preserved,
    // which flips the winding under a reflection; nothing downstream reads winding
    // (area is taken absolute, containment is a crossing count).
    if (el.poly) out.poly = el.poly.map((p) => t.point(p));
    // An arc ring's exact edges ride along as a wall's do (`t.arc`, which flips a sweep under a
    // reflection), so the turned floor is the same curve, never a re-fitted one.
    if (el.edges)
      out.edges = el.edges.map((e) =>
        e.t === "line" ? { t: "line", a: t.point(e.a), b: t.point(e.b) } : { t: "arc", arc: t.arc(e.arc) },
      );
    // A circle is invariant under an isometry apart from where its centre lands, so
    // the radius carries over untouched and the area stays EXACTLY πR².
    if (el.circle) out.circle = { c: t.point(el.circle.c), r: el.circle.r };
    if (el.labelAt) out.labelAt = t.point(el.labelAt);
    // The relational constraint is DISCHARGED by the instance's own placement pass
    // (which ran in the local frame, where `right-of` means the component's right).
    // Keeping it would let the plan-level pass re-place the room in global terms.
    delete out._rel;
    return out;
  },
};

/**
 * The `circle` form. The resolved room carries THREE views of the same floor,
 * each for the consumer that needs it:
 *
 *  - `circle` — the exact centre + radius. `describe()` measures πR² from this, and the
 *    drawing emits a true `circle` primitive, so neither is ever a facet count.
 *  - `poly` — the 48-gon tessellation, so every ring-shaped consumer written for
 *    polygon rooms (occupancy grid, circulation flood-fill, adjacency, containment,
 *    overlap) works VERBATIM on a curve with no second code path.
 *  - `at`/`size` — the bounding box, so every older rect-shaped consumer still reads a
 *    truthful extent.
 *
 * The one thing a consumer must not do is compute the AREA from `poly`: that is the
 * documented exact-vs-chordal split (docs/analysis.md).
 */
function resolveCircle(n: RoomNode, id: string, ctx: ResolveCtx): RRoom {
  const c = ctx.snapPt(ctx.evalPt(n.circle!.c));
  const rv = ctx.eval(n.circle!.r);
  const r = ctx.snap(rv) || rv;
  const label = n.label !== undefined ? ctx.evalStr(n.label) : undefined;
  if (!(r > 0)) {
    ctx.diag({
      severity: "error",
      message: `Room "${id}" must have a positive radius`,
      code: "E_ROOM_RADIUS",
      span: n.span,
    });
  }
  const rr = Math.max(0, r);
  const labelAt = n.labelAt ? ctx.snapPt(ctx.evalPt(n.labelAt)) : undefined;
  if (labelAt && rr > 0 && Math.hypot(labelAt.x - c.x, labelAt.y - c.y) > rr) {
    ctx.diag(labelOutsideDiag(id, labelAt, n.labelAtSpan ?? n.span));
  }
  return {
    kind: "room",
    id,
    at: { x: c.x - rr, y: c.y - rr },
    size: { w: 2 * rr, h: 2 * rr },
    circle: { c, r: rr },
    poly: arcTessellate(fullCircleArc(c, rr)).slice(0, -1),
    ...(labelAt ? { labelAt } : {}),
    label,
    ...(n.uses ? { uses: n.uses } : {}),
    ...floorOf(n, ctx),
    span: n.span,
  };
}

/**
 * The `polygon` form. Vertices are grid-snapped like every other coordinate,
 * and the resolved room ALSO carries `at`/`size` = the ring's bounding box, so every
 * consumer written against a rectangle still reads a truthful extent (and the ones
 * that must not approximate a polygon check `poly` and either generalise or decline).
 *
 * Two errors are returned, never thrown: a ring with fewer than three *effective*
 * vertices (duplicates and straight-through points removed) draws no floor, and a
 * self-intersecting ring has no well-defined interior — so neither has an area,
 * a centroid or a containment test worth computing.
 */
function resolvePolygon(n: RoomNode, id: string, ctx: ResolveCtx): RRoom {
  const written = n.polygon!.map((p) => ctx.snapPt(ctx.evalPt(p)));
  // A ring with an `arc` (card ARC2) carries its exact `edges` beside the tessellation `poly`;
  // a straight ring is the ring it always was.
  const curved = n.arcs ? resolveRingArcs(n, id, written, ctx) : undefined;
  const poly = curved ? curved.poly : written;
  const effective = effectiveVertices(poly);
  const label = n.label !== undefined ? ctx.evalStr(n.label) : undefined;
  let ringRefused = false;
  if (effective.length < 3) {
    ringRefused = true;
    ctx.diag({
      severity: "error",
      message: `Room "${id}" is a degenerate polygon — ${effective.length} effective vertices after removing duplicate and collinear points (3 are needed)`,
      code: "E_ROOM_POLY_DEGENERATE",
      span: n.span,
    });
  } else if (polygonSelfIntersects(effective)) {
    ringRefused = true;
    ctx.diag({
      severity: "error",
      message: `Room "${id}" is a self-intersecting polygon — its edges cross, so it has no well-defined floor`,
      code: "E_ROOM_POLY_SELF_INTERSECT",
      span: n.span,
    });
  }
  // The extent of the EXACT boundary: a bulge reaches past its chord's vertices.
  const bbox = curved ? edgeLoopBounds(curved.edges) : polygonBounds(poly);
  const labelAt = n.labelAt ? ctx.snapPt(ctx.evalPt(n.labelAt)) : undefined;
  if (labelAt && effective.length >= 3 && !pointInPolygon(labelAt.x, labelAt.y, effective)) {
    ctx.diag(labelOutsideDiag(id, labelAt, n.labelAtSpan ?? n.span));
  }
  return {
    kind: "room",
    id,
    at: { x: bbox.x, y: bbox.y },
    size: { w: bbox.w, h: bbox.h },
    poly,
    ...(curved ? { edges: curved.edges } : {}),
    ...(ringRefused ? { _ringRefused: true as const } : {}),
    ...(labelAt ? { labelAt } : {}),
    label,
    ...(n.uses ? { uses: n.uses } : {}),
    ...floorOf(n, ctx),
    span: n.span,
  };
}

/** The `{x, y, w, h}` box of an exact boundary (`loopBBox`: a bulge's closed-form extremes). */
function edgeLoopBounds(edges: EdgeLoop): { x: number; y: number; w: number; h: number } {
  const b = loopBBox(edges);
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

/**
 * A `room polygon` ring with `arc` edges (card ARC2, `docs/plans/arc2-room-arcs.md` §4): its exact
 * boundary `edges` (one per edge, closing edge last) and its discretised ring `poly` (every vertex
 * plus each arc's canonical interior points, `ringOfEdges` in `src/geometry/room-ring.ts`: at the
 * absolute angles k·7.5° about its centre, so rooms sharing a curve share its vertices), or
 * `undefined` when no arc solved.
 *
 * A ring is implicitly closed and stores no repeated vertex, so a ring that ENDS with an arc back
 * onto its first vertex curves its closing edge and drops the repeat; a repeat reached by a
 * straight edge keeps its old meaning (a duplicate `effectiveVertices` removes). Each clause is
 * solved as a wall's (`arcFromChord`); a radius below half the chord is `E_ROOM_ARC_RADIUS`, with
 * the wall's minimum-radius fix, and that edge stays straight. The tessellation is charged to the
 * step meter before it is built.
 */
function resolveRingArcs(
  n: RoomNode,
  id: string,
  written: Point[],
  ctx: ResolveCtx,
): { edges: EdgeLoop; poly: Point[] } | undefined {
  const specs = n.arcs!;
  const last = written.length - 1;
  const first = written[0]!;
  const end = written[last]!;
  const closes = last >= 2 && specs[last - 1] !== undefined && end.x === first.x && end.y === first.y;
  const ring = closes ? written.slice(0, last) : written;
  const m = ring.length;
  const edges: EdgeLoop = [];
  let any = false;
  for (let k = 0; k < m; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % m]!;
    const spec = specs[k];
    const solved = spec ? solveRingArc(spec, a, b, id, n, ctx) : null;
    const arc = solved && spec && sagWithin(solved, spec, id, n, ctx) ? solved : null;
    if (arc) any = true;
    edges.push(arc ? { t: "arc", arc } : { t: "line", a, b });
  }
  if (!any) return undefined;
  // Every vertex the ring will hold, charged before it is allocated (a non-finite arc, which the
  // number-domain check then drops, holds its start alone).
  let vertices = 0;
  for (const e of edges) vertices += e.t === "arc" ? ringArcVertexCount(e.arc) : 1;
  chargeSteps(vertices);
  return { edges, poly: ringOfEdges(edges) };
}

/**
 * The most a room ring's tessellation chord may stand off its arc (mm): the room containment slack
 * (`ROOM_CONTAINMENT_SLACK_MM`, `src/analyze/rooms.ts`), the smallest tolerance a reader of the
 * discretised ring `poly` allows (grids, adjacency, containment, overlap). Within it those readers
 * are right on the tessellation, as they are on a `room circle`'s 48-gon.
 *
 * A chord's sagitta is `r(1 − cos(θ/2))` for the angle θ it spans, at most 7.5° (the canonical
 * step) or the whole sweep if that is less (`ringArcMaxChordAngle`), so an arc keeps inside 100 mm
 * up to R = 100 / (1 − cos 3.75°) ≈ 46,705 mm, and an arc under 7.5° further. `MODEL_RANGE_MM` does
 * not bound it.
 */
export const ROOM_ARC_MAX_SAG_MM = ROOM_CONTAINMENT_SLACK_MM;

/** The largest radius whose full-step (7.5°) tessellation stays within {@link ROOM_ARC_MAX_SAG_MM}. */
export const ROOM_ARC_FULL_STEP_RADIUS_MM = Math.floor(
  ROOM_ARC_MAX_SAG_MM / (1 - Math.cos((ARC_STEP_DEG / 2) * (Math.PI / 180))),
);

/**
 * Whether a solved ring arc's tessellation stays within {@link ROOM_ARC_MAX_SAG_MM} of the curve;
 * if not, `E_ROOM_ARC_SAG` (the edge then stays straight). A non-finite sag (a radius past the
 * number range) is left to the number-domain check, which drops the room.
 */
function sagWithin(arc: Arc, spec: WallArcNode, id: string, n: RoomNode, ctx: ResolveCtx): boolean {
  const sag = arc.r * (1 - Math.cos(ringArcMaxChordAngle(arc) / 2));
  if (!Number.isFinite(sag) || sag <= ROOM_ARC_MAX_SAG_MM) return true;
  ctx.diag({
    severity: "error",
    message: `Room "${id}" has an arc edge of radius ${fmt3(arc.r)} whose drawn ring stands up to ${fmt3(sag)} mm off the curve, more than the ${fmt3(ROOM_ARC_MAX_SAG_MM)} mm a room's containment and adjacency tests allow`,
    code: "E_ROOM_ARC_SAG",
    span: spec.span ?? n.span,
    hints: [
      `An arc of ${fmt3(ARC_STEP_DEG)}° or more stays within it up to radius ${fmt3(ROOM_ARC_FULL_STEP_RADIUS_MM)}; write a curve this large as straight edges.`,
    ],
  });
  return false;
}

/**
 * One ring `arc` clause solved through `arcFromChord` (as a wall's, `resolveArcs` in `./wall.ts`),
 * or `null` after `E_ROOM_ARC_RADIUS`: no circle of the radius passes through both vertices. The
 * fix writes the smallest radius that passes the same predicate once printed, re-parsed and
 * snapped, for the end point as printed, so applying it always clears the error.
 */
function solveRingArc(spec: WallArcNode, a: Point, b: Point, id: string, n: RoomNode, ctx: ResolveCtx): Arc | null {
  const rv = ctx.eval(spec.radius);
  const r = ctx.snap(rv) || rv;
  const arc = arcFromChord(a, b, r, spec.dir ?? "ccw", spec.major === true);
  if (arc) return arc;
  const half = minArcRadius(a, b);
  const bFixed = ctx.snapPt({ x: Number(fmt3(b.x)), y: Number(fmt3(b.y)) });
  const printed = (v: number): number => {
    const p = Number(fmt3(v));
    return ctx.snap(p) || p;
  };
  const min = half > 0 ? smallestSpanningRadius(a, bFixed, ctx.grid >= 0.001 ? ctx.grid : 0.001, printed) : 0;
  ctx.diag({
    severity: "error",
    message:
      r > 0
        ? `Room "${id}" has an arc edge of radius ${fmt3(r)} spanning a ${fmt3(half * 2)} mm chord — no circle of that radius passes through both vertices (the minimum is ${fmt3(min)})`
        : `Room "${id}" has an arc edge with a non-positive radius`,
    code: "E_ROOM_ARC_RADIUS",
    span: spec.span ?? n.span,
    hints: [`The radius must be at least half the chord: ${fmt3(min)}.`],
    ...(spec.span && min > 0
      ? {
          fixes: [
            {
              title: `use the minimum radius ${fmt3(min)}`,
              applicability: "machine-applicable" as const,
              fixId: "arc-radius-min",
              edits: [
                {
                  span: spec.span,
                  newText: `arc (${fmt3(b.x)}, ${fmt3(b.y)}) radius ${fmt3(min)}${spec.dir ? ` ${spec.dir}` : ""}${spec.major ? " major" : ""}`,
                },
              ],
            },
          ],
        }
      : {}),
  });
  return null;
}
