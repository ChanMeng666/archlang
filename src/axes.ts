/**
 * **Positioning axes** (定位轴线) — GB/T 50001's structural datum grid.
 *
 * An architectural drawing is not dimensioned from the paper edge: it is dimensioned
 * from a named grid of datum lines that the structure sits on. GB/T 50001 draws each
 * as a thin dash-dot line protruding past the building, tagged at one end with a
 * circled label — vertical axes numbered `1 2 3 …` read LEFT-TO-RIGHT, horizontal
 * axes lettered `A B C …` read BOTTOM-TO-TOP.
 *
 * Two halves, deliberately split (ADR 0005 — facts, no invisible architect):
 *
 * - **Positions are author-declared** (`axes { x at 0, 6000 … }`) and never derived
 *   from walls. The compiler does not guess where your structural grid is.
 * - **Labels are always derived** and never authorable: they fall out of sorted
 *   position, so an axis inserted in the middle renumbers everything after it exactly
 *   as a draughtsman would. (A future release may add an explicit label override; the
 *   v1.20 surface stays minimal.)
 *
 * Pure and deterministic: sorting, deduping, and label assignment are closed-form,
 * and every emitted size derives from {@link RenderSizes} so axes scale with the rest
 * of the drawing (a `sizesFromPaper` variant flows through unchanged).
 */

import type { Bounds } from "./geometry.js";
import type { RAxis } from "./ir.js";
import type { PageMargins } from "./chrome-layout.js";
import type { RenderSizes, SceneNode } from "./scene.js";
import type { Theme } from "./theme.js";

/**
 * The GB/T 50001 letter sequence: the Latin alphabet **without `I`, `O` and `Z`**,
 * which are barred because they misread as `1`, `0` and `2` at drawing scale. 23
 * letters.
 */
export const AXIS_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXY";

/**
 * The `i`-th horizontal-axis label (0-based). Within the 23 permitted letters it is
 * that letter; past them it continues `AA, AB, … AY, BA, …` — a bijective base-23
 * counter over the same reduced alphabet.
 *
 * GB/T 50001 §6.2 allows either a doubled letter (`AA`) or a letter-with-subscript
 * (`A1`) once the alphabet runs out but does not fix the order. We take the doubled
 * form and continue it lexicographically, so the sequence never repeats a label and
 * never needs a subscript glyph the drawing font might lack.
 */
export function axisLetter(i: number): string {
  const base = AXIS_LETTERS.length;
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % base;
    out = AXIS_LETTERS[rem]! + out;
    n = Math.floor((n - 1) / base);
  }
  return out;
}

/**
 * Sort, dedupe and label declared axis positions into the resolved axis list.
 *
 * - **Sorted + deduped.** Exact duplicates collapse silently: declaring the same datum
 *   twice is declarative idempotence, not an error.
 * - **`x` axes are numbered `1 2 3 …` left-to-right** (ascending x).
 * - **`y` axes are lettered `A B C …` bottom-to-top.** ArchLang's +y points DOWN, so
 *   bottom-to-top means DESCENDING y — the axis with the largest y is `A`.
 *
 * The returned list is in **label order** (x axes `1…n`, then y axes `A…`), so
 * `axes[0]` is always ① and the first y entry is always Ⓐ.
 */
export function numberAxes(xs: readonly number[], ys: readonly number[]): RAxis[] {
  const uniqAsc = (vs: readonly number[]): number[] => {
    const sorted = [...vs].sort((a, b) => a - b);
    return sorted.filter((v, i) => i === 0 || v !== sorted[i - 1]);
  };
  const out: RAxis[] = [];
  uniqAsc(xs).forEach((pos, i) => {
    out.push({ axis: "x", pos, label: String(i + 1) });
  });
  // Descending y = bottom-to-top on a +y-down page.
  uniqAsc(ys)
    .reverse()
    .forEach((pos, i) => {
      out.push({ axis: "y", pos, label: axisLetter(i) });
    });
  return out;
}

/** Bubble diameter and the label inside it, both stepped off `dimFont` so the axis
 *  tags stay in proportion with the dimension text at any drawing size. */
const BUBBLE_DIA = 1.8;
const BUBBLE_LABEL = 0.9;
/** How far the axis line protrudes past the drawing extent at its FAR (untagged) end. */
const AXIS_LEAD = 1.2;
/** Clear gap between the outermost dimension chain (or the plan, when undimensioned)
 *  and the bubble it sits outside of — GB/T puts the tags outside the dimensions. */
const BUBBLE_GAP = 1.4;

/**
 * Lower the resolved axes to Scene primitives on the `axes` pass: one thin dash-dot
 * (`center`) line per axis spanning the drawing plus a lead at each end, with a
 * circle bubble and its derived label at the **bottom** end of an `x` axis and the
 * **left** end of a `y` axis (the GB/T reading corner).
 *
 * `reach` is how far the dimension annotations already extend on each side, so the
 * bubbles land OUTSIDE every dimension chain rather than through one. The line stops
 * at the bubble's edge instead of crossing it, so the tag reads cleanly.
 *
 * The label is drawn as a **plain glyph inside a drawn circle**, never as a Unicode
 * `①`/`Ⓐ` codepoint: the PNG backend rasterizes with a bundled font that need not
 * carry enclosed alphanumerics, and a CAD backend has no such glyph at all.
 */
export function axesNodes(
  axes: readonly RAxis[],
  bounds: Bounds,
  sizes: RenderSizes,
  theme: Theme,
  reach: PageMargins,
): SceneNode[] {
  const u = sizes.dimFont;
  const r = (u * BUBBLE_DIA) / 2;
  const lead = u * AXIS_LEAD;
  const nodes: SceneNode[] = [];
  const stroke = { stroke: theme.dim, width: sizes.thin };

  for (const ax of axes) {
    // Bubble centre: outside the plan, outside that side's dimension reach.
    const tag =
      ax.axis === "x"
        ? bounds.maxY + reach.bottom + BUBBLE_GAP * u + r
        : bounds.minX - (reach.left + BUBBLE_GAP * u + r);
    const center = ax.axis === "x" ? { x: ax.pos, y: tag } : { x: tag, y: ax.pos };
    const a = ax.axis === "x" ? { x: ax.pos, y: bounds.minY - lead } : { x: bounds.maxX + lead, y: ax.pos };
    const b = ax.axis === "x" ? { x: ax.pos, y: tag - r } : { x: tag + r, y: ax.pos };
    nodes.push({
      layer: "axes",
      prim: { t: "line", a, b },
      paint: { ...stroke },
      lineWeight: "thin",
      lineType: "center",
    });
    nodes.push({
      layer: "axes",
      prim: { t: "circle", center, r },
      paint: { fill: "none", ...stroke },
      lineWeight: "thin",
    });
    nodes.push({
      layer: "axes",
      prim: {
        t: "text",
        at: center,
        value: ax.label,
        size: u * BUBBLE_LABEL,
        anchor: "middle",
        baseline: "central",
      },
      paint: { fill: theme.dim },
    });
  }
  return nodes;
}
