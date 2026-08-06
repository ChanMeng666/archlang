/**
 * The one closed-form text-width estimate in the tree.
 *
 * ArchLang's renderers are zero-dependency and isomorphic: there is **no font loader and
 * no text-measurement API** anywhere in `src/`, and there never will be — measuring a font
 * would mean shipping one, and would make `compile()` depend on which fonts the host has.
 * So every place that must reason about how wide a string will draw — the error card's
 * chip layout, the `W_DIM_OVERLAP` lint band, and the `dims auto` number-stagger decision —
 * estimates it as `characters × font size × {@link EM_PER_CHAR}`.
 *
 * It lives in one module on purpose. The lint rule's estimate and the renderer's stagger
 * decision must agree about what collides, or `W_DIM_OVERLAP` would warn about text the
 * renderer has already separated (or stay silent about text it has not). A second copy of
 * the constant is a silent divergence waiting to happen — it was already copied once, into
 * `backends/error-svg.ts` and `lint/rules/dims.ts`, before this module existed.
 */

/**
 * Mean advance width per character, as a fraction of the font size.
 *
 * Calibrated for the digits-and-short-words strings these call sites actually measure
 * (dimension values like `4200`, error codes like `E_ARC_RADIUS`, severity words) in the
 * DIN-ish sans the SVG backend asks for. Deliberately a little generous: over-estimating a
 * width costs a millimetre of clearance, under-estimating costs overprinted ink.
 */
export const EM_PER_CHAR = 0.62;

/** Estimated drawn width of `text` at `fontSize`, in the same units as `fontSize`. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * EM_PER_CHAR;
}
