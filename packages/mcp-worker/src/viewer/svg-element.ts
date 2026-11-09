/** Builds the hosted MCP viewer's SVG element from the compiler's output: sanitised, then sized by its `viewBox`. */

import { type SvgEnv, sanitizeSvg } from "./svg-sanitize.js";

/** The compiler's SVG as a sanitised element (`svg-sanitize.ts`), sized by its `viewBox`. */
export function svgElement(text: string, env?: SvgEnv): SVGSVGElement | undefined {
  const root = sanitizeSvg(text, env);
  if (!root) return undefined;
  // The compiler sizes its drawings by `viewBox` alone; give the element that size in user units
  // so fit() scales a known box (an unsized <svg> lays out at the browser's 300×150 default).
  const vb = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite)) {
    if (!root.hasAttribute("width")) root.setAttribute("width", String(vb[2]));
    if (!root.hasAttribute("height")) root.setAttribute("height", String(vb[3]));
  }
  return root;
}
