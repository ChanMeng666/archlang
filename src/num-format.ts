/**
 * The one deterministic number → string formatter (round to N decimals, strip the
 * `-0`). Previously copy-pasted in scene-build, the SVG/DXF backends, the expression
 * evaluator and the source formatter — same shape, three precisions. Output strings
 * are byte-pinned by goldens/snapshots, so each call site keeps its exact historical
 * precision and non-finite behaviour.
 *
 * Invariant: the EXPRESSION language's number domain is closed — the lexer and the evaluator
 * (`E_NON_FINITE`, checked per operation) never admit a non-finite value — and so are the
 * derived quantities the resolver checks (`checkNumberDomain` in `ir.ts`: an element's extent,
 * a room's area, the total area). The resolver also holds every resolved coordinate and length
 * to {@link MODEL_RANGE_MM} and drops an element beyond it, so no backend or glyph ever forms a
 * product from an absurd magnitude. `fmt3`'s `"0"` for NaN/±Infinity is a byte-pinned backstop,
 * NOT a way to represent an overflow, and must not be removed.
 */

/**
 * The modelling range: every resolved coordinate and length of a plan lies within
 * ±2²⁵ mm (33,554,432 mm, about 33.5 km), the bound under which ADR 0020 measured plain-double
 * `orient2d` exact on integer coordinates. An element outside it is `E_OUT_OF_RANGE`
 * (`checkNumberDomain`, `src/ir.ts`). Defined once; the docs and the catalogue quote it.
 */
export const MODEL_RANGE_MM = 33_554_432;

/**
 * Build a formatter that rounds via `scale` (100 → 2 dp, 1000 → 3 dp, …) and never
 * emits `-0`. `zeroNonFinite` maps NaN/±Infinity to `"0"` — the expression-evaluator
 * and source-formatter behaviour (geometry backends never see non-finite input).
 */
export function makeNumFmt(scale: number, zeroNonFinite = false): (n: number) => string {
  return (n: number): string => {
    if (zeroNonFinite && !Number.isFinite(n)) return "0";
    let r = Math.round(n * scale) / scale;
    // A FINITE n whose scaled value overflows (|n| above ~1e305) is already an integer — every
    // double past 2^52 is — so rounding is a no-op: keep n rather than print `Infinity`.
    if (!Number.isFinite(r) && Number.isFinite(n)) r = n;
    return Object.is(r, -0) ? "0" : String(r);
  };
}

/** 2 dp — Scene labels and SVG coordinates. */
export const fmt2 = makeNumFmt(100);
/** 3 dp, non-finite → "0" — expression stringification and the source formatter. */
export const fmt3 = makeNumFmt(1000, true);
/** 4 dp — DXF coordinates. */
export const fmt4 = makeNumFmt(1e4);

/**
 * {@link fmt3} for SOURCE text — the printers that write `.arch` (`format`, the shared
 * statement and expression printers). A magnitude `String()` writes in exponent form (1e21
 * and above) is written out in digits instead, because the lexer has no exponent form:
 * `1e+24` would not re-parse. The digits are `String(n)`'s own (the shortest decimal that
 * reads back as `n`) with the exponent expanded into zeros, so `1e+24` prints as a 1 and 24
 * zeros and re-parses to the same double.
 */
export function fmtSource(n: number): string {
  const s = fmt3(n);
  if (!s.includes("e")) return s;
  const m = /^(-?)(\d)(?:\.(\d+))?e\+(\d+)$/.exec(String(n));
  if (!m) return s;
  const frac = m[3] ?? "";
  return `${m[1]}${m[2]}${frac}${"0".repeat(Number(m[4]) - frac.length)}`;
}
