/**
 * The Checks overlay's string work, pure (unit-tested in Node): lifting the review rings out of the
 * sheet `arch preview --review` draws, and laying them over the drawing on screen.
 *
 * The sheet (`buildReviewSheet`, src/cli/review.ts) draws the plan in a nested `<svg>` whose
 * viewBox is the plan's own, and its rings and their numbered tags in that same coordinate space
 * (plan millimetres), as two groups: `<g id="rv-rings">` and `<g id="rv-tags">`. Those two groups
 * are taken here byte for byte and put inside the drawing on screen, whose viewBox is the same, so
 * the rings on screen are the review sheet's rings, never redrawn here. Nothing else of the sheet
 * (its access graph, legend and close-ups) is used.
 *
 * The overlay is for the screen only: main.ts adds it to the SVG it shows, never to the SVG the
 * exports read, so a download or a copy is byte-identical with Checks on or off.
 */

/** A box in plan millimetres (origin top-left, +y down), as the review sheet reports a ring. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The class of the group the overlay is wrapped in, inside the drawing on screen. */
export const CHECKS_CLASS = "pg-checks";
/** The class of the (initially empty) group the highlight of one finding is drawn into. */
export const HIGHLIGHT_CLASS = "pg-checks-hl";

/** One group of the review sheet, by id: its inner markup (the groups hold no nested `<g>`). */
function group(svg: string, id: string): string {
  const open = `<g id="${id}">`;
  const at = svg.indexOf(open);
  if (at < 0) throw new Error(`the review sheet has no <g id="${id}">`);
  const from = at + open.length;
  const to = svg.indexOf("</g>", from);
  if (to < 0) throw new Error(`the review sheet's <g id="${id}"> is not closed`);
  return svg.slice(from, to);
}

/** The review sheet's rings and their tags, in plan millimetres, as one overlay group. */
export function ringsOverlay(sheetSvg: string): string {
  return (
    `<g class="${CHECKS_CLASS}" pointer-events="none">` +
    `<g class="pg-checks-rings">${group(sheetSvg, "rv-rings")}</g>` +
    `<g class="pg-checks-tags">${group(sheetSvg, "rv-tags")}</g>` +
    `<g class="${HIGHLIGHT_CLASS}"></g></g>`
  );
}

/** `planSvg` with `overlay` drawn last, over everything, inside its root. */
export function withOverlay(planSvg: string, overlay: string): string {
  const end = planSvg.lastIndexOf("</svg>");
  if (end < 0) return planSvg;
  return planSvg.slice(0, end) + overlay + planSvg.slice(end);
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** The highlight of one finding's rings: a broad outline round each box, a fixed width on screen. */
export function highlightMarkup(boxes: readonly Box[]): string {
  return boxes
    .map(
      (b) =>
        `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="none" ` +
        `stroke="#1d4ed8" stroke-width="4" vector-effect="non-scaling-stroke" stroke-dasharray="8 4"/>`,
    )
    .join("");
}
