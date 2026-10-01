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

import type { Diagnostic, Span } from "./diagnostics.js";

/**
 * The modelling range: every resolved coordinate and length of a plan lies within
 * ±2²⁵ mm (33,554,432 mm, about 33.5 km), the bound under which ADR 0020 measured plain-double
 * `orient2d` exact on integer coordinates. An element outside it is `E_OUT_OF_RANGE`
 * (`checkNumberDomain`, `src/ir.ts`). Defined once; the docs and the catalogue quote it.
 */
export const MODEL_RANGE_MM = 33_554_432;

/*
 * The settings that are not coordinates or lengths, held to domains derived from the range.
 *
 * Inside the range a drawing's reference dimension is at most 2²⁶ mm: without `paper` it is
 * the larger side of the drawn extent (element bounds and the lot line, each within ±2²⁵),
 * and with `paper` it is 100 mm × the scale denominator, which {@link maxScaleDenominator}
 * holds below 2²⁵ / 297 × 100 ≈ 1.1 × 10⁷. Every bound below keeps what the setting
 * multiplies within the range at that worst case.
 */

/** The largest hatch `scale`. A pattern tile is at most 4 × the hatch gap (`hatches.ts`),
 *  the gap at most 0.013 × the reference dimension, so a tile is at most
 *  0.052 × 2²⁶ × 8 ≈ 2.8 × 10⁷ mm: inside the range. Shipped plans use at most 3. */
export const MAX_HATCH_SCALE = 8;

/** The largest theme `lineWeight`. The heaviest pen is 0.0028 × the reference dimension
 *  × the weight (`scene-build.ts`), at most 0.0028 × 2²⁶ × 128 ≈ 2.4 × 10⁷ mm. Shipped
 *  plans use at most 1.3. */
export const MAX_LINE_WEIGHT = 128;

/** The largest magnitude of an angle in degrees (`north`, a hatch `angle`): the range's own
 *  bound, read in degrees, so `deg × π / 180` and every sine and cosine of it stay finite
 *  (`north 1e308` overflowed to `Infinity` there and drew `x="NaN"`). */
export const MAX_ANGLE_DEG = MODEL_RANGE_MM;

/** The largest scale denominator a `paper` plan may declare: the sheet, in plan millimetres,
 *  stays within the range (`1:28220` on A0, `1:112977` on A4). */
export function maxScaleDenominator(sheetLongSideMm: number): number {
  return Math.floor(MODEL_RANGE_MM / sheetLongSideMm);
}

/** The one shape of an `E_OUT_OF_RANGE` diagnostic, for every value the range holds. */
export function outOfRangeDiagnostic(message: string, span: Span | undefined, file?: string): Diagnostic {
  return { severity: "error", message, code: "E_OUT_OF_RANGE", span, ...(file ? { file } : {}) };
}

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
 * statement and expression printers). Every finite value it prints re-parses to the same
 * double:
 *
 * - while `|n| × 1000 ≤ 2⁵³` it is `fmt3` exactly (3 dp, the historical bytes);
 * - above that, `fmt3`'s `Math.round(n × 1000) / 1000` can move the value itself (an integer
 *   near 10²¹ came back 10⁵ off), so the value is printed as `String(n)` — the shortest
 *   decimal that reads back as `n` — with an exponent (1e21 and above) expanded into zeros,
 *   because the lexer has no exponent form and `1e+24` would not re-parse.
 */
export function fmtSource(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) * 1000 <= 2 ** 53) return fmt3(n);
  return plainDigits(n);
}

/**
 * `String(n)` — the shortest decimal that reads back as `n` — with a positive exponent
 * expanded into zeros (`1e+24` → a 1 and 24 zeros), so the lexer, which has no exponent form,
 * reads it back as the same double. Below 1e21 it is `String(n)` unchanged.
 */
export function plainDigits(n: number): string {
  const s = String(n);
  const m = /^(-?)(\d)(?:\.(\d+))?e\+(\d+)$/.exec(s);
  if (!m) return s;
  const frac = m[3] ?? "";
  return `${m[1]}${m[2]}${frac}${"0".repeat(Number(m[4]) - frac.length)}`;
}
