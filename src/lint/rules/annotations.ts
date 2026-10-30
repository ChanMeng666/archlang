/**
 * Annotation collisions on the drawn sheet (plan-soundness PS2.12): two drafting advisories that
 * read the drawing itself, never the plan's facts, so `describe()`, Plan JSON and the SVG are
 * untouched by them.
 *
 * `W_ANNOTATION_OVERLAP` — a number `dims auto` writes, or a room's name or area figure, printed
 * over a furniture, fixture or stair symbol; a `dims auto` number printed over a room's name or
 * area figure; or a room's name or area figure printed over a wall or a door's swing, or running
 * off its own floor (#367).
 *
 * `W_TITLE_OVERFLOW` — a title-block value wider than its row.
 *
 * ## What they read
 *
 * The positions are the drawn ones, from the code that draws them, never re-derived:
 *
 *  - the room labels where the Scene put them, AFTER `wrapLabels` and `relocateLabels` moved
 *    them off whatever they could (`toScene`, `src/label-placement.ts`). A label the placer
 *    could clear is never reported; one it could not, or one the author pinned with
 *    `label … at (x,y)`, is;
 *  - the `dims auto` numbers from {@link autoDimensions} (the list `toScene` renders) placed by
 *    {@link dimTextPrim} (the arithmetic `dim.render` letters them with), at the Scene's own
 *    `sizes`;
 *  - each symbol's DRAWN shapes — the polygons, closed paths and circles its `render` emits —
 *    not its footprint box. A line encloses no area and an arc stroke is not ink a number sits
 *    in, so neither is measured (the label placer's own rule, `primBBox`);
 *  - the walls' poché, the `hatch` fill `lowerWallSet` drew (openings cut, joints mitred; a
 *    demolished wall has none), and each leaf's quarter-disc from {@link doorLeaves}, the helper
 *    the door draws with;
 *  - the title block's row geometry from {@link titleBlockMetrics}, the one formula the chrome
 *    is laid out and drawn with.
 *
 * Every width is the one shared estimate, {@link textWidth} (`characters × size × 0.62`), through
 * {@link textExtent}: the same model the label placer, the `dims auto` stagger and
 * `W_DIM_OVERLAP` measure with. There is no font, canvas or Node API anywhere in it. The walls, the
 * swings and the floor's edge are the exception: a label sits right up to them on every plan with
 * a small room, and that estimate's slack read a name with clear floor on both sides as buried in
 * both walls (`two-bed-min-area`'s "Bathroom"), so those three use {@link INK_EM}, the width the
 * bundled face draws on average.
 *
 * ## What "over" means
 *
 * A text's box is the rectangle its estimated width and its size span about its anchor, turned
 * with the text. It is over a symbol when the area it shares with one of the symbol's drawn
 * shapes is more than {@link COLLIDE_MIN} (2 %) of its own area — the threshold at which the
 * label placer itself decides a label is buried and must move. Below it the overlap is the
 * estimate's own slack, not ink. The shared area is exact: each drawn shape is clipped to the
 * text's convex box (Sutherland–Hodgman) and measured by the shoelace; a curved edge is walked
 * in {@link ARC_STEPS} chords. Per symbol the LARGEST single shape's share counts, so a bed's
 * outline and the pillows drawn inside it are not added twice.
 *
 * A rug (an `underlay` fixture) is not a symbol here: it is the floor finish, and a name on a rug
 * reads. Furniture labels are text, not symbol ink, and are not measured.
 *
 * A door's swing is the area its leaf sweeps, not the leaf and the arc alone: they enclose nothing
 * this measure can see, and it is the area the label placer steers off. "Off its floor" is the
 * same 2 % of the text's box outside the room's ring, a wall's centreline where a wall bounds it.
 * A label pinned off its floor is `W_ROOM_LABEL_OUTSIDE`'s report: none of the three is repeated
 * for it.
 *
 * ## Why `W_DIM_INSIDE` was not widened to `dims auto` (the card's first proposal)
 *
 * Measured over the shipped examples before this rule was written: every `dims auto` number that
 * lands on a room floor (65 of them, on 21 of the 26 examples that use `dims auto`) is one of the
 * three call-outs the convention letters there — the wall-thickness figure written beside its
 * wall on the side with floor (`thicknessSideFlipped`, `scene-build.ts`), the `R` leader from an
 * arc's centre, the `φ` across a circle — and no chain number does, because a chain sits beyond
 * the outer face of every room. A "number on a floor" warning would therefore fire on every plan
 * that uses `dims auto all` or draws a curve, and its only remedy would be to give up the openings
 * chains. What makes such a number a defect is what it is printed OVER, which is this rule.
 *
 * ## Bounds
 *
 * Post-resolve and outside the evaluator, so nothing is charged to the step meter. The storey is
 * drawn once (`toScene`) only when it is within the drawing budget (`drawBudgetDiagnostic`, the
 * check `compile()` refuses a plan by); otherwise the rule files an `annotation-budget` skip. The
 * collision work is a count, {@link MAX_ANNOTATION_WORK}: one unit per (text, symbol) and
 * (number, label) pair whose boxes are compared, plus one per shape vertex clipped. Worst case
 * `numbers × symbols + labels × symbols + numbers × labels` pairs, each clip linear in the
 * shape's vertices; past the count the storey is skipped, never half-measured.
 *
 * The walls, swings and floors have a count of their own, the same size, so that measuring them can
 * never cost a plan a symbol report: one unit per (label, swing) pair and per label, plus one per
 * vertex clipped. Only a label within a wall's reach (a grid over the wall bands, grown by the
 * thickest wall so a mitre stays inside) clips the poché, whose one loop can run round the whole
 * building. Worst case `labels × (swings + 1)` units plus `labels × poché vertices`, for a storey
 * whose every label touches a wall; past the count those three tests are dropped for the storey
 * with an `annotation-budget` note, and the symbol and `dims auto` reports stand.
 *
 * The title check is closed form: one comparison per title row.
 */

import type { Point } from "../../ast.js";
import type { Diagnostic } from "../../diagnostics.js";
import { doorLeaves, rectCorners, type DoorSwing } from "../../geometry.js";
import type { RDim, RDoor, ResolvedElement, ResolvedPlan, RFurniture, RRoom } from "../../ir.js";
import type { ScenePrim } from "../../scene.js";
import { BUILTIN_RUNTIME } from "../../registry.js";
import { autoDimensions, toScene } from "../../scene-build.js";
import { dimTextPrim } from "../../elements/dim.js";
import { titleBlockMetrics, titleRows } from "../../chrome-layout.js";
import { drawBudgetDiagnostic } from "../../draw-budget.js";
import { COLLIDE_MIN, meanExtent, wallBands } from "../../label-placement.js";
import { textExtent } from "../../text-layout.js";
import { EM_PER_CHAR, INK_EM, textWidth } from "../../text-metrics.js";
import { fmt2 as fmtMm } from "../../num-format.js";
import { isUnderlay } from "../../fixtures-catalog.js";
import { isVertical } from "../../vertical.js";
import { pointInRoomBox, roomBox } from "../../analyze.js";
import { GridIndex } from "../../geometry/grid-index.js";
import { clippedArea, clippedSigned, pointInPolygon } from "../../geometry/polygon.js";
import { openingName } from "../element-phrases.js";
import type { LintContext, LintRule } from "../context.js";

type TextPrim = Extract<ScenePrim, { t: "text" }>;

/** Chords per curved path edge or circle quarter: enough that a WC bowl's area is within a
 *  percent of the true curve, which is far inside the 2 % trigger. */
const ARC_STEPS = 8;

/**
 * The counted collision budget per storey: pair comparisons plus clipped vertices. A furnished
 * flat spends a few thousand; the largest shipped plan under fifty thousand. A million keeps the
 * worst case to tens of milliseconds while no real building comes near it.
 */
export const MAX_ANNOTATION_WORK = 1_000_000;

/** Kinds whose drawn shapes are symbols a number or a name must not sit on. */
const isSymbolElement = (el: ResolvedElement): boolean =>
  (el.kind === "furniture" && !isUnderlay((el as RFurniture).category)) || isVertical(el);

/** One drawn symbol: its element, its closed shapes, and their joint extent. */
interface SymbolInk {
  el: ResolvedElement;
  shapes: Point[][];
  box: Box;
}

/** One text on the sheet: its turned box and its extent. */
interface Text {
  rect: Point[];
  box: Box;
  area: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const annotationOverlap: LintRule = {
  name: "annotation-overlap",
  family: "annotation",
  layer: "drafting",
  stage: "drafting",
  codes: ["W_ANNOTATION_OVERLAP"],
  check(ctx: LintContext): Diagnostic[] {
    const { ir } = ctx;
    const hasSymbols = ir.elements.some(isSymbolElement);
    const rooms = ctx.rooms;
    // Nothing can collide: no room to letter, and no `dims auto` number to sit on a symbol.
    if (rooms.length === 0 && !(ir.autoDims && hasSymbols)) return [];
    const registry = BUILTIN_RUNTIME.registry;
    if (drawBudgetDiagnostic([{ ir }], registry, undefined) !== undefined) {
      ctx.skip("annotation-budget");
      return [];
    }
    const scene = toScene(ir, { annotate: true });

    // Symbols, grouped by the element that drew them, in drawing order.
    const byId = new Map<string, ResolvedElement>();
    for (const el of ir.elements) if (isSymbolElement(el)) byId.set(el.id, el);
    const symbols = new Map<string, SymbolInk>();
    // Room labels: each room's name and area figure as drawn.
    const labels: { room: RRoom; prim: TextPrim; text: Text; ink: Text; isName: boolean }[] = [];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const named = new Set<RRoom>();
    // The walls' poche as drawn (openings cut, joints mitred); a demolished wall draws none.
    const walls: Point[][][] = [];
    for (const n of scene.nodes) {
      if (n.layer === "wallFill" && n.prim.t === "hatch") walls.push(n.prim.region);
      if (n.elementId === undefined) continue;
      if (n.elementKind === "room" && n.prim.t === "text") {
        const room = roomById.get(n.elementId);
        if (!room) continue;
        // `room.render` draws the name first (only when the room has one), then the area figure.
        const isName = !!room.label && !named.has(room);
        named.add(room);
        labels.push({ room, prim: n.prim, text: textBox(n.prim), ink: textBox(n.prim, INK_EM / EM_PER_CHAR), isName });
        continue;
      }
      const el = byId.get(n.elementId);
      if (!el || el.kind !== n.elementKind) continue;
      const shapes = shapesOf(n.prim);
      if (shapes.length === 0) continue;
      let s = symbols.get(el.id);
      if (!s) {
        s = { el, shapes: [], box: emptyBox() };
        symbols.set(el.id, s);
      }
      for (const sh of shapes) {
        s.shapes.push(sh);
        for (const p of sh) grow(s.box, p);
      }
    }
    // The `dims auto` numbers, as drawn.
    const numbers = autoDimensions(ir, scene.sizes, registry).map((dm) => {
      const prim = dimTextPrim(dm, scene.sizes, fmtMm);
      return { dm, prim, text: textBox(prim) };
    });

    const syms = [...symbols.values()];
    const swings = ctx.doors.flatMap((door) =>
      doorLeaves(door).map((leaf) => {
        const ring = sectorOf(leaf);
        const box = emptyBox();
        for (const p of ring) grow(box, p);
        return { door, ring, box };
      }),
    );
    const pairs = (numbers.length + labels.length) * syms.length + numbers.length * labels.length;
    if (pairs > MAX_ANNOTATION_WORK) {
      ctx.skip("annotation-budget");
      return [];
    }
    let work = pairs;
    let spent = false;
    /** The share of `t`'s box a symbol's largest shape covers, charged before it is clipped. */
    const share = (t: Text, shapes: readonly Point[][]): number => {
      let best = 0;
      for (const sh of shapes) {
        work += sh.length;
        if (work > MAX_ANNOTATION_WORK) {
          spent = true;
          return 0;
        }
        best = Math.max(best, clippedArea(sh, t.rect));
      }
      return best;
    };
    const over = (t: Text, shapes: readonly Point[][], box: Box): boolean =>
      boxesMeet(t.box, box) && share(t, shapes) > COLLIDE_MIN * t.area;

    // The walls, swings and floors, on their own count (see Bounds).
    let fabricWork = labels.length * (swings.length + 1);
    /** Charge `n` units of fabric work; false once the count is spent. */
    const charge = (n: number): boolean => {
      fabricWork += n;
      return fabricWork <= MAX_ANNOTATION_WORK;
    };
    /** The area of `t` a set of loops covers, holes subtracting: one fill of wall poche. */
    const inkOf = (t: Text, loops: readonly Point[][]): number => {
      let sum = 0;
      for (const loop of loops) if (charge(loop.length)) sum += clippedSigned(loop, t.rect);
      return Math.abs(sum);
    };
    const reach = wallReach(ir, walls);
    const nearWall = (t: Text): boolean => {
      let near = false;
      reach?.forEach(t.box, () => {
        near = true;
      });
      return near;
    };
    const overWall = (t: Text): boolean => nearWall(t) && walls.some((w) => inkOf(t, w) > COLLIDE_MIN * t.area);
    const overSwing = (t: Text, s: (typeof swings)[number]): boolean =>
      boxesMeet(t.box, s.box) && charge(s.ring.length) && clippedArea(s.ring, t.rect) > COLLIDE_MIN * t.area;
    /** `t` stands more than the trigger outside `room`'s floor. */
    const leaves = (t: Text, room: RRoom): boolean => {
      const ring = room.poly ?? rectCorners(room.at.x, room.at.y, room.size.w, room.size.h);
      return t.area - inkOf(t, [ring]) > COLLIDE_MIN * t.area;
    };

    const out: Diagnostic[] = [];

    // A room's name or area figure over a symbol, a wall or a door's swing, or off its floor:
    // one warning per room.
    interface RoomHit {
      name: boolean;
      area: string | null;
      hits: ResolvedElement[];
      wall: boolean;
      doors: RDoor[];
      outside: boolean;
      /** The name itself, not only the area figure, is over a wall or off the floor. */
      nameTight: boolean;
    }
    const perRoom = new Map<RRoom, RoomHit>();
    const hitOn = (l: (typeof labels)[number]): RoomHit => {
      let e = perRoom.get(l.room);
      if (!e) {
        e = { name: false, area: null, hits: [], wall: false, doors: [], outside: false, nameTight: false };
        perRoom.set(l.room, e);
      }
      if (l.isName) e.name = true;
      else e.area = l.prim.value;
      return e;
    };
    for (const l of labels) {
      for (const s of syms) {
        if (!over(l.text, s.shapes, s.box)) continue;
        const e = hitOn(l);
        if (!e.hits.includes(s.el)) e.hits.push(s.el);
      }
    }
    // Measured whole or not at all, and merged only once it is known to be whole. A label pinned off
    // its floor is `W_ROOM_LABEL_OUTSIDE`'s report, whatever it landed on.
    const fabric: { l: (typeof labels)[number]; doors: RDoor[]; wall: boolean; outside: boolean }[] = [];
    for (const l of labels) {
      if (l.room.labelAt && !pointInRoomFloor(l.room.labelAt, l.room)) continue;
      const doors = swings.filter((s) => overSwing(l.ink, s)).map((s) => s.door);
      const wall = overWall(l.ink);
      const outside = leaves(l.ink, l.room);
      if (doors.length > 0 || wall || outside) fabric.push({ l, doors, wall, outside });
    }
    if (fabricWork > MAX_ANNOTATION_WORK) ctx.skip("annotation-budget");
    else
      for (const f of fabric) {
        const e = hitOn(f.l);
        for (const d of f.doors) if (!e.doors.includes(d)) e.doors.push(d);
        e.wall ||= f.wall;
        e.outside ||= f.outside;
        if (f.l.isName) e.nameTight ||= f.wall || f.outside;
      }

    // A `dims auto` number over a symbol or a room's label: one warning per number.
    const perNumber: { dm: RDim; value: string; at: Point; hits: ResolvedElement[]; over: typeof labels }[] = [];
    for (const nb of numbers) {
      const hits: ResolvedElement[] = [];
      const onLabels: typeof labels = [];
      for (const s of syms) if (over(nb.text, s.shapes, s.box)) hits.push(s.el);
      for (const l of labels) if (over(nb.text, [l.text.rect], l.text.box)) onLabels.push(l);
      if (hits.length + onLabels.length > 0)
        perNumber.push({ dm: nb.dm, value: nb.prim.value, at: nb.prim.at, hits, over: onLabels });
    }
    if (spent) {
      ctx.skip("annotation-budget");
      return [];
    }

    for (const [room, e] of perRoom) {
      const name = room.label || undefined;
      const both = e.name && e.area !== null;
      const subject = both
        ? `The name "${name}" and the area figure (${e.area})`
        : e.name
          ? `The name "${name}"`
          : name !== undefined
            ? `The area figure (${e.area}) of "${name}"`
            : `The area figure (${e.area}) of ${ctx.nameOf(room)}`;
      const things = listOf([
        ...e.hits.map(symbolWord),
        ...(e.wall ? ["a wall"] : []),
        ...e.doors.map((d) => `the swing of ${openingName(ctx, d)}`),
      ]);
      const printed = things === "" ? "" : `${both ? "are" : "is"} printed over ${things}`;
      const off = e.outside ? `${printed === "" ? "" : " and "}${both ? "run" : "runs"} out of the room` : "";
      const onlySymbols = !e.wall && e.doors.length === 0 && !e.outside;
      const after = onlySymbols
        ? "so the label and the symbol overprint each other on the drawing."
        : printed === ""
          ? "so part of the label is drawn off its own floor."
          : "so the label and what is under it overprint each other on the drawing.";
      // The hint names each element by the id an agent edits it by (never the message).
      const movable = [...e.hits.map(symbolWithId), ...e.doors.map(doorWithId)];
      const byId = listOf(movable);
      const pinned = room.labelAt !== undefined;
      const moveOr = movable.length > 0 ? `, or move ${byId}` : "";
      const tight = e.wall || e.outside;
      const clearPoint = `\`label "${name}" at (x,y)\``;
      out.push({
        severity: "warning",
        code: "W_ANNOTATION_OVERLAP",
        ...ctx.at(room),
        message: `${subject} ${printed}${off}, ${after}`,
        hints: [
          name === undefined
            ? tight || e.doors.length > 0
              ? `${movable.length > 0 ? `Move ${byId} clear of the figure, enlarge the room` : "Enlarge the room"}, or name it and give its label a clear point with \`label "…" at (x,y)\` if the floor has one.`
              : `Move ${byId} off the middle of the floor, or name the room and give its label a clear point with \`label "…" at (x,y)\`.`
            : pinned
              ? `The label of ${roomRef(ctx, room)} is pinned by ${clearPoint}: move that point to a clear part of the floor${e.nameTight ? ", shorten the name, widen the room" : tight ? ", widen the room" : ""}${moveOr}.`
              : `The label placer found no clear part of the floor of ${roomRef(ctx, room)} big enough for the label. ${
                  e.nameTight
                    ? `Shorten the name or widen the room, or give it a clear point with ${clearPoint} if the floor has one`
                    : tight
                      ? `Widen the room, or give the label a clear point with ${clearPoint} if the floor has one`
                      : `Give it a clear point with ${clearPoint}`
                }${moveOr}.`,
        ],
      });
    }

    const setting = `\`dims auto ${ir.autoDims ?? "all"}\``;
    for (const nb of perNumber) {
      const kind = callOutKind(nb.dm);
      const floor = rooms.find((r) => pointInRoomBox(nb.at, roomBox(r)));
      // Where the number stands, unless what it is over already says so (a room's own label).
      const where =
        floor && !(nb.hits.length === 0 && nb.over.every((l) => l.room === floor)) ? ` in ${ctx.nameOf(floor)}` : "";
      const things = listOf([
        ...nb.hits.map(symbolWord),
        ...nb.over.map((l) =>
          l.isName ? `the name "${l.prim.value}"` : `the area figure (${l.prim.value}) of ${ctx.nameOf(l.room)}`,
        ),
      ]);
      const pinnedLabel = nb.over.find((l) => l.room.labelAt !== undefined);
      const subject = {
        thickness: `The wall-thickness figure ${nb.value} that ${setting} writes beside its wall`,
        radius: `The radius call-out ${nb.value} that ${setting} draws from the arc's centre`,
        diameter: `The diameter call-out ${nb.value} that ${setting} draws across the circle`,
        chain: `The figure ${nb.value} of a ${setting} chain`,
      }[kind];
      const move = pinnedLabel
        ? `Move the \`label "${pinnedLabel.room.label}" at (x,y)\` point of ${roomRef(ctx, pinnedLabel.room)} clear of it`
        : nb.hits.length > 0
          ? `Move ${listOf(nb.hits.map(symbolWithId))} clear of it`
          : `Give the label of ${roomRef(ctx, nb.over[0]!.room)} a clear point with \`label "…" at (x,y)\``;
      const why = {
        thickness:
          "`dims auto all` letters each wall thickness once, on the longest straight wall of that thickness, at a run no crossing wall, opening, piece of furniture or stair stands on; this wall has no such run.",
        radius: "The `R` call-out is lettered halfway along the line from the arc's centre to its midpoint.",
        diameter: "The `φ` call-out is lettered at the circle's centre.",
        chain: "A chain number sits outside the building's outer faces.",
      }[kind];
      const anchor = pinnedLabel?.room ?? nb.hits[0] ?? nb.over[0]!.room;
      out.push({
        severity: "warning",
        code: "W_ANNOTATION_OVERLAP",
        ...ctx.at(anchor),
        message: `${subject} is printed over ${things}${where}, so the two overprint each other on the drawing.`,
        hints: [
          `${why} ${move}${kind === "thickness" ? ", or draw with `dims auto rooms` and state that thickness with a hand `dim` (`offset 0`, face to face) where it reads clear" : ""}.`,
        ],
      });
    }
    return out;
  },
};

/**
 * `W_TITLE_OVERFLOW` — a title-block value wider than its row. The block is laid out at a fixed
 * fraction of the drawing's reference dimension ({@link titleBlockMetrics}) and does not wrap or
 * shrink a value, so a value whose estimated width exceeds the row between the two side pads
 * starts left of its own caption (which sits at the left pad) and prints over it, and past the
 * frame when it exceeds the row less one pad. Both widths scale with the drawing, so the test is
 * a character count and holds on every sheet and at every scale.
 *
 * Deliberately the value against the ROW, not the value plus its caption: the shared estimate is
 * generous for mixed-case text (0.62 em per character against about 0.5 em for the bundled face),
 * and adding the caption to it would report a 21-character value that the drawn block sets with
 * room to spare. Only the authored rows are judged: the stamped `SCALE` and `LEVEL` rows carry no
 * span to report at. Reported once per plan: on the lowest storey of a multi-storey plan, whose
 * pages repeat the same rows.
 */
export const titleOverflow: LintRule = {
  name: "title-overflow",
  family: "annotation",
  layer: "drafting",
  stage: "drafting",
  codes: ["W_TITLE_OVERFLOW"],
  check(ctx: LintContext): Diagnostic[] {
    const title = ctx.ir.title;
    if (!title) return [];
    if (ctx.building.multiStorey && !ctx.building.lowestStorey) return [];
    // Ratios only: every length below is a multiple of the reference dimension, so 1 serves.
    const { w, fs, pad } = titleBlockMetrics(1);
    const room = w - 2 * pad;
    const holds = Math.floor(room / (fs * EM_PER_CHAR));
    const out: Diagnostic[] = [];
    for (const row of titleRows({ ...title }, undefined)) {
      const width = textWidth(row.v, fs);
      if (!(width > room)) continue;
      const outside = width > w - pad;
      out.push({
        severity: "warning",
        code: "W_TITLE_OVERFLOW",
        ...ctx.at(title),
        message: `The title block's ${row.k} value is ${row.v.length} characters, wider than its row, which holds about ${holds} at the size the value is drawn: it prints over the ${row.k} caption${outside ? " and runs out of the block's frame" : ""}.`,
        hints: [
          `Shorten "${row.v}" to ${holds} characters or fewer — the title block neither wraps nor shrinks a value — and move the rest to a \`notes "…"\` line.`,
        ],
      });
    }
    return out;
  },
};

/** Which call-out a `dims auto` number is. A chain span is the only one with an offset; the
 *  thickness figure is digits (`fmtMm`), the curve call-outs start with their symbol. */
function callOutKind(dm: RDim): "thickness" | "radius" | "diameter" | "chain" {
  if (dm.offset !== 0) return "chain";
  const t = dm.text ?? "";
  if (/^\d/.test(t)) return "thickness";
  return t.startsWith("R") ? "radius" : "diameter";
}

/** A symbol as a person names it: the piece's category (or its own label), or the run's kind. */
function symbolWord(el: ResolvedElement): string {
  if (el.kind === "furniture") {
    const f = el as RFurniture;
    const word = f.category.replace(/_/g, " ");
    return f.label !== undefined && f.label !== "" && f.label.toLowerCase() !== word
      ? `the ${word} "${f.label}"`
      : `the ${word}`;
  }
  return el.kind === "elevator" ? "the lift" : `the ${el.kind}`;
}

/** A symbol with the id an agent edits it by, for a hint: the bed, then its id in backticks. */
const symbolWithId = (el: ResolvedElement): string =>
  idAuthored(el) ? `${symbolWord(el)} (\`${el.id}\`)` : symbolWord(el);

/**
 * Did the author write this element's `id=`? Only then is the id quoted in a hint: an assigned
 * auto-id (`furniture_3`, `room_2`) shifts when a statement is inserted before it, so it is no
 * handle to edit by, and the hint keeps the kind word instead ("the basin").
 */
const idAuthored = (el: ResolvedElement): boolean => (el as { _idAuthored?: boolean })._idAuthored === true;

/** A room as a hint names it: by its authored id, else as the message does. */
const roomRef = (ctx: LintContext, r: RRoom): string => (idAuthored(r) ? `room \`${r.id}\`` : ctx.nameOf(r));

/**
 * What can reach a wall's poché: a grid over the wall bands, grown by the thickest wall so that a
 * mitre's tip stays inside its band. `undefined` for a storey that draws no poché.
 */
function wallReach(ir: ResolvedPlan, walls: readonly (readonly Point[][])[]): GridIndex<true> | undefined {
  if (walls.length === 0) return undefined;
  const bands = wallBands(
    ir,
    ir.walls.reduce((t, w) => Math.max(t, w.thickness), 0),
  );
  const grid = new GridIndex<true>(meanExtent(bands));
  for (const b of bands) grid.insert({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }, true);
  return grid;
}

/** A door with the id an agent edits it by, for a hint. */
const doorWithId = (d: RDoor): string => (idAuthored(d) ? `the door (\`${d.id}\`)` : "the door");

/** Is `p` on `room`'s floor? */
const pointInRoomFloor = (p: Point, room: RRoom): boolean =>
  room.poly ? pointInPolygon(p.x, p.y, room.poly) : pointInRoomBox(p, roomBox(room));

/** "a", "a and b", "a, b and c" — first-hit order, duplicates dropped. */
function listOf(words: readonly string[]): string {
  const ws = [...new Set(words)];
  return ws.length <= 1 ? (ws[0] ?? "") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`;
}

/** The turned rectangle a text occupies on the sheet, about its anchor. */
function textBox(prim: TextPrim, widthScale = 1): Text {
  const extent = textExtent(prim);
  const w = extent.w * widthScale;
  const h = extent.h;
  const th = ((prim.rotate ?? 0) * Math.PI) / 180;
  const u = { x: Math.cos(th), y: Math.sin(th) };
  const v = { x: -u.y, y: u.x };
  const shift = prim.anchor === "start" ? w / 2 : prim.anchor === "end" ? -w / 2 : 0;
  const c = { x: prim.at.x + u.x * shift, y: prim.at.y + u.y * shift };
  const at = (a: number, b: number): Point => ({ x: c.x + u.x * a + v.x * b, y: c.y + u.y * a + v.y * b });
  const rect = [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)];
  const box = emptyBox();
  for (const p of rect) grow(box, p);
  return { rect, box, area: w * h };
}

/** The quarter-disc a door leaf sweeps, hinge first, its arc walked in {@link ARC_STEPS} chords. */
function sectorOf(s: DoorSwing): Point[] {
  const a0 = Math.atan2(s.farJamb.y - s.hinge.y, s.farJamb.x - s.hinge.x);
  let d = Math.atan2(s.leafEnd.y - s.hinge.y, s.leafEnd.x - s.hinge.x) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const ring: Point[] = [s.hinge];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const a = a0 + (d * i) / ARC_STEPS;
    ring.push({ x: s.hinge.x + s.radius * Math.cos(a), y: s.hinge.y + s.radius * Math.sin(a) });
  }
  return ring;
}

/** The closed shapes a drawn primitive covers; none for a stroke, a text or a hatch. */
function shapesOf(prim: ScenePrim): Point[][] {
  switch (prim.t) {
    case "polygon":
      return prim.pts.length >= 3 ? [prim.pts] : [];
    case "region":
      return prim.loops.filter((l) => l.length >= 3);
    case "circle": {
      const n = 4 * ARC_STEPS;
      const ring: Point[] = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        ring.push({ x: prim.center.x + prim.r * Math.cos(a), y: prim.center.y + prim.r * Math.sin(a) });
      }
      return [ring];
    }
    case "path":
      return prim.loops
        .map((lp) => {
          const ring: Point[] = [lp.start];
          let from = lp.start;
          for (const e of lp.edges) {
            if (e.t === "arc") {
              // A path arc is a MINOR arc by the primitive's contract: walk the short way round.
              const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
              let d = Math.atan2(e.to.y - e.center.y, e.to.x - e.center.x) - a0;
              while (d > Math.PI) d -= 2 * Math.PI;
              while (d < -Math.PI) d += 2 * Math.PI;
              for (let i = 1; i < ARC_STEPS; i++) {
                const a = a0 + (d * i) / ARC_STEPS;
                ring.push({ x: e.center.x + e.r * Math.cos(a), y: e.center.y + e.r * Math.sin(a) });
              }
            }
            ring.push(e.to);
            from = e.to;
          }
          return ring;
        })
        .filter((r) => r.length >= 3);
    default:
      return [];
  }
}

const emptyBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

function grow(b: Box, p: Point): void {
  b.minX = Math.min(b.minX, p.x);
  b.minY = Math.min(b.minY, p.y);
  b.maxX = Math.max(b.maxX, p.x);
  b.maxY = Math.max(b.maxY, p.y);
}

const boxesMeet = (a: Box, b: Box): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
