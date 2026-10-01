/**
 * The one deterministic number → string formatter (round to N decimals, strip the
 * `-0`). Previously copy-pasted in scene-build, the SVG/DXF backends, the expression
 * evaluator and the source formatter — same shape, three precisions. Output strings
 * are byte-pinned by goldens/snapshots, so each call site keeps its exact historical
 * precision and non-finite behaviour.
 *
 * Invariant: the EXPRESSION language's number domain is closed — the lexer and the evaluator
 * (`E_NON_FINITE`, checked per operation) never admit a non-finite value — and so are the
 * derived quantities the resolver checks (`checkDerivedFinite` in `ir.ts`: an element's extent,
 * a room's area, the total area). Quantities outside those (any other product a backend or
 * glyph forms from finite inputs) are not checked. `fmt3`'s `"0"` for NaN/±Infinity is a
 * byte-pinned backstop for them, NOT a way to represent an overflow, and must not be removed.
 */

/**
 * Build a formatter that rounds via `scale` (100 → 2 dp, 1000 → 3 dp, …) and never
 * emits `-0`. `zeroNonFinite` maps NaN/±Infinity to `"0"` — the expression-evaluator
 * and source-formatter behaviour (geometry backends never see non-finite input).
 */
export function makeNumFmt(scale: number, zeroNonFinite = false): (n: number) => string {
  return (n: number): string => {
    if (zeroNonFinite && !Number.isFinite(n)) return "0";
    const r = Math.round(n * scale) / scale;
    return Object.is(r, -0) ? "0" : String(r);
  };
}

/** 2 dp — Scene labels and SVG coordinates. */
export const fmt2 = makeNumFmt(100);
/** 3 dp, non-finite → "0" — expression stringification and the source formatter. */
export const fmt3 = makeNumFmt(1000, true);
/** 4 dp — DXF coordinates. */
export const fmt4 = makeNumFmt(1e4);
