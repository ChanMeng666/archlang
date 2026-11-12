/**
 * `section <id|int> (x,y)->(x,y) look <compass>` — a section mark on the plan (RM6.1, design
 * `docs/plans/product-roadmap/design/slab-and-section.md` §2): where a section cuts the building and
 * which way it looks, drawn as GB/T 50001 and ISO 128 draw it on a plan: at each end of the cut line a
 * heavy cut stroke along the line, a heavy stroke at right angles pointing the way the section looks,
 * and the mark's name beside it. Nothing between the two ends is drawn, and nothing of the section
 * itself: the core draws no section view (the iron law that heights draw nothing).
 *
 * The keyword is contextual ({@link ElementDef.contextual}): it starts this statement only when a
 * name or a whole number and then `(` follow it, so `room id=section`, `let section = 1`, a component
 * named `section` and a `section()` call parse as they always did. `look` is read only after the
 * second point. A plan-level statement ({@link ElementDef.planLevelOnly}): in a `level`, `zone`,
 * `component` or block it is `E_SECTION_SCOPE`. The name is the mark's own, unique among the plan's
 * sections (`E_SECTION_DUP`) and in no namespace an element id shares, as an axis label is.
 */

import type { CompassWord, ExprPoint, Point, SectionNode } from "../ast.js";
import { COMPASS_DIRECTIONS } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RSection } from "../ir.js";
import { add, length, mul, sub } from "../geometry.js";
import {
  LETTER_SIDE,
  LETTERS_CW,
  type Letter,
  northQuarterTurns,
  SIDE_LETTER,
  SIDE_NORMAL,
  sideOfNormal,
  toCompass,
} from "../algebra/d4.js";
import { closest } from "../expr.js";
import { fmt0 } from "../num-format.js";

/** The cut stroke along the line at each end, in dimension-font heights (8 mm at a 2.5 mm font:
 *  GB/T 50001 asks 6–10 mm). */
const CUT_STROKE = 3.2;
/** The stroke that points the way the section looks, in dimension-font heights (5 mm: 4–6 mm). */
const LOOK_STROKE = 2;
/** The name's gap off the end of the cut line, in name heights. */
const NAME_GAP = 0.9;

/** A compass word's letter is its initial, as `describe()` spells a facing (`compassLetter`, `src/site.ts`). */
const letterOf = (word: CompassWord): Letter => word.charAt(0).toUpperCase() as Letter;
const wordOf = (letter: Letter): CompassWord => COMPASS_DIRECTIONS.find((w) => letterOf(w) === letter)!;

/** The page direction a compass word points in, under `turns` clockwise quarter-turns of north. */
function pageToward(look: CompassWord, turns: 0 | 1 | 2 | 3): Point {
  // The page letter whose compass letter is `look`'s: the inverse of `toCompass`.
  const page = LETTERS_CW.find((p) => toCompass(p, turns) === letterOf(look))!;
  const n = SIDE_NORMAL[LETTER_SIDE[page]];
  return { x: n.x, y: n.y };
}

/** The compass word of a page direction (a unit axis vector), under `turns`. */
function compassOf(toward: Point, turns: 0 | 1 | 2 | 3): CompassWord {
  return wordOf(toCompass(SIDE_LETTER[sideOfNormal(toward)!], turns));
}

export const section: ElementDef = {
  kind: "section",
  keyword: "section",
  // `set` applies no bare word to this kind: its resolver reads nothing from `ctx.defaults`.
  setWords: {},
  doc: "A section mark: where a section cuts the plan and which way it looks. It draws the cut-line ends only.",
  params: [
    { name: "name", type: "ident|int", doc: "The mark's name (`A`, `1`), unique among the plan's sections." },
    { name: "from", type: "point", doc: "One end of the cut line (x, y) in mm." },
    { name: "to", type: "point", doc: "The other end; the line is horizontal or vertical." },
    {
      name: "look",
      type: "north|south|east|west",
      doc: "The compass direction the section looks in, across the line.",
    },
  ],

  contextual(ctx: ParseCtx): boolean {
    const name = ctx.peek(1);
    return (name.type === "ident" || name.type === "number") && ctx.peek(2).type === "lparen";
  },

  planLevelOnly: "E_SECTION_SCOPE",

  parse(ctx: ParseCtx): SectionNode {
    const kw = ctx.eatKeyword("section");
    const nameTok = ctx.peek();
    let name: string;
    if (nameTok.type === "number") {
      const n = ctx.eatNumber();
      if (!(Number.isInteger(n) && n > 0)) ctx.fail("A section's number is a positive whole number", nameTok);
      name = fmt0(n);
    } else name = ctx.eatIdent().value;
    const nameSpan = { start: nameTok.start, end: nameTok.end };
    const from: ExprPoint = ctx.parsePoint();
    ctx.eat("arrow");
    const to: ExprPoint = ctx.parsePoint();
    const lookTok = ctx.peek();
    if (!ctx.isKeyword("look")) {
      ctx.fail(`Expected \`look ${COMPASS_DIRECTIONS.join("|")}\` after the section's second point`, lookTok);
    }
    ctx.next();
    const word = ctx.eatIdent();
    if (!(COMPASS_DIRECTIONS as readonly string[]).includes(word.value)) {
      const hint = closest(word.value, [...COMPASS_DIRECTIONS]);
      ctx.fail(
        `Unknown look direction "${word.value}"${hint ? ` — did you mean "${hint}"?` : ""} (available: ${COMPASS_DIRECTIONS.join(", ")})`,
        word,
      );
    }
    return {
      kind: "section",
      id: "",
      name,
      nameSpan,
      from,
      to,
      look: word.value as CompassWord,
      lookSpan: { start: lookTok.start, end: word.end },
      line: kw.line,
    };
  },

  idPrefix: () => "section",

  resolve(node, ctx: ResolveCtx): RSection {
    const n = node as SectionNode;
    // A mark annotates the plan, so its ends are taken as written, never grid-snapped (as a `dim`'s).
    const from = ctx.evalPt(n.from);
    const to = ctx.evalPt(n.to);
    const turns = northQuarterTurns(ctx.north ?? "up");
    const out: RSection = {
      kind: "section",
      id: ctx.id,
      name: n.name,
      from,
      to,
      look: n.look,
      toward: null,
      span: n.span,
    };
    out._northTurns = turns;
    const first = ctx.group?.().find((e) => e.kind === "section" && (e as RSection).name === n.name);
    if (first) {
      ctx.diag({
        severity: "error",
        code: "E_SECTION_DUP",
        message: `Section "${n.name}" is already marked — each section name may appear once in a plan`,
        span: n.nameSpan,
        ...(first.span ? { relatedSpans: [{ span: first.span, message: `section ${n.name} first marked here` }] } : {}),
      });
    }
    const horizontal = from.y === to.y;
    const vertical = from.x === to.x;
    if (horizontal === vertical) {
      ctx.diag({
        severity: "error",
        code: "E_SECTION_AXIS",
        message: horizontal
          ? `Section "${n.name}" has a cut line of zero length: its two ends are the same point`
          : `Section "${n.name}" cuts on a slant: a section line runs horizontally or vertically (its two ends share an x or a y)`,
        ...(n.span ? { span: n.span } : {}),
      });
      return out;
    }
    const toward = pageToward(n.look, turns);
    if ((horizontal && toward.y === 0) || (vertical && toward.x === 0)) {
      const across = horizontal
        ? [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
          ]
        : [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
          ];
      const words = across.map((v) => compassOf(v, turns));
      ctx.diag({
        severity: "error",
        code: "E_SECTION_LOOK",
        message:
          `Section "${n.name}" looks ${n.look}, along its own cut line: under this plan's north it can look ` +
          `${words[0]} or ${words[1]}`,
        span: n.lookSpan,
      });
      return out;
    }
    out.toward = toward;
    return out;
  },

  bounds(resolved): Point[] {
    const s = resolved as RSection;
    return [s.from, s.to];
  },

  /** Nothing beyond the two ends: every stroke and the name are a fixed paper size off them. */
  measures: () => [],

  /** At most 6 primitives (the drawing budget, `MAX_DRAW_UNITS`): at each end a cut stroke, a look
   *  stroke and the name. */
  drawCost: () => 6,

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const s = resolved as RSection;
    if (!s.toward) return [];
    const { theme, sizes } = ctx;
    const span = length(sub(s.to, s.from));
    const dir = mul(sub(s.to, s.from), 1 / span);
    // A line shorter than two cut strokes takes half its length for each, so the two never cross.
    const cut = Math.min(CUT_STROKE * sizes.dimFont, span / 2);
    const look = LOOK_STROKE * sizes.dimFont;
    const font = sizes.roomFont;
    const stroke = { stroke: theme.annotation, width: sizes.wallStroke };
    const nodes: SceneNode[] = [];
    for (const [end, inward] of [
      [s.from, dir],
      [s.to, mul(dir, -1)],
    ] as const) {
      nodes.push(
        { layer: "annotations", prim: { t: "line", a: end, b: add(end, mul(inward, cut)) }, paint: { ...stroke } },
        { layer: "annotations", prim: { t: "line", a: end, b: add(end, mul(s.toward, look)) }, paint: { ...stroke } },
        {
          layer: "annotations",
          prim: {
            t: "text",
            // Beside the look stroke, past the end of the cut line, upright whatever the north.
            at: add(add(end, mul(inward, -NAME_GAP * font)), mul(s.toward, look / 2)),
            value: s.name,
            size: font,
            anchor: "middle",
            baseline: "central",
          },
          paint: { fill: theme.annotation },
        },
      );
    }
    return nodes;
  },

  /**
   * The frame's action on a mark. Unreachable from a source (a `section` inside a `component` is
   * `E_SECTION_SCOPE`), kept for the registry's contract: the ends and the page direction map, and
   * the compass word follows the direction under the plan's north.
   */
  transform(resolved, t: TransformCtx): RSection {
    const el = resolved as RSection;
    const from = t.point(el.from);
    const to = t.point(el.to);
    if (!el.toward) return { ...el, id: t.id, from, to };
    const toward = sub(t.point(add(el.from, el.toward)), from);
    return { ...el, id: t.id, from, to, toward, look: compassOf(toward, el._northTurns ?? 0) };
  },
};
