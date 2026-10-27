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
 * Two settings scale a DRAWN length without bound — a wall's hatch `scale` (the pattern tile)
 * and the theme `lineWeight` (every pen). They are not capped as inputs: the resolver measures
 * the tile and the pen on the drawing they belong to and refuses only one that leaves the
 * range (`checkDrawnSizes`, `src/ir.ts`), so a coarse `scale 10` on a house is legal. The
 * three below are held as values, because no legitimate plan comes near them.
 */

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

/** 0 dp — whole millimetres, where a lint rule compares the value it prints. */
export const fmt0 = makeNumFmt(1);
/** 2 dp — Scene labels and SVG coordinates. */
export const fmt2 = makeNumFmt(100);
/** 3 dp, non-finite → "0" — expression stringification and the source formatter. */
export const fmt3 = makeNumFmt(1000, true);
/** 4 dp — DXF coordinates. */
export const fmt4 = makeNumFmt(1e4);

/**
 * An integer PERMYRIAD `p` (a score in [0, 1] times 10,000, decided in integers by the taste
 * layer, ADR 0032) as its exact decimal: built from the integer's digits, no division, so no
 * float sits upstream of the bytes. `6125 → "0.6125"`, `5000 → "0.5"`, `10000 → "1"`,
 * `5 → "0.0005"`, `0 → "0"`. The JSON number is the parse of this string, which ECMA-262 makes
 * the nearest double and `JSON.stringify` prints back byte for byte. A non-integer or a value
 * outside [0, 10000] is a caller bug and throws (it never comes from user source).
 */
export function fmtPermyriad(p: number): string {
  if (!Number.isInteger(p) || p < 0 || p > 10000) throw new RangeError(`fmtPermyriad: ${p} is not a permyriad`);
  if (p === 10000) return "1";
  const frac = String(p).padStart(4, "0").replace(/0+$/, "");
  return frac === "" ? "0" : `0.${frac}`;
}

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

/** The decimal digit string `d` (no sign, no dot) times the small non-negative integer `k`.
 *  Linear in the length (digits gathered in an array), so a long literal costs its length. */
function mulDigits(d: string, k: number): string {
  const out: number[] = [];
  let carry = 0;
  for (let i = d.length - 1; i >= 0; i--) {
    const v = (d.charCodeAt(i) - 48) * k + carry;
    out.push(v % 10);
    carry = Math.floor(v / 10);
  }
  for (; carry > 0; carry = Math.floor(carry / 10)) out.push(carry % 10);
  return out.reverse().join("");
}

/** The sum of two decimal digit strings (no sign, no dot). */
function addDigits(a: string, b: string): string {
  const out: number[] = [];
  let carry = 0;
  for (let i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0; i--, j--) {
    const v = (i >= 0 ? a.charCodeAt(i) - 48 : 0) + (j >= 0 ? b.charCodeAt(j) - 48 : 0) + carry;
    out.push(v % 10);
    carry = v >= 10 ? 1 : 0;
  }
  if (carry > 0) out.push(1);
  return out.reverse().join("");
}

/**
 * An imperial length literal (`12ft`, `6in`, `12ft6in`) in whole millimetres: `feet` and `inches`
 * are the literal's raw decimal digit strings (`"12"`, `"6"`, `"0.5"`, `".5"`; `""` for an absent
 * part), converted EXACTLY (1 in = 25.4 mm, 1 ft = 12 in) and rounded half away from zero to an
 * integer, the direction ADR 0022's lattice rounding takes. The arithmetic is on the digit strings
 * (×12, +, ×254, then a decimal shift), never a float multiply, so `1ft1in` is 330 (330.2) and
 * `0.5in` is 13 (12.7) on every host. A literal is never negative (negation is the unary
 * operator), so "away from zero" is "up on a half" here, and `-0.5in` is `-(13)`: symmetric.
 * A value beyond the doubles comes back `Infinity`; the lexer turns that into `E_NON_FINITE`.
 */
export function imperialToMm(feet: string, inches: string): number {
  const split = (s: string): [string, string] => {
    const dot = s.indexOf(".");
    return dot === -1 ? [s, ""] : [s.slice(0, dot), s.slice(dot + 1)];
  };
  const [fi, ff] = split(feet);
  const [ii, iff] = split(inches);
  const places = Math.max(ff.length, iff.length);
  // Each part scaled by 10^places, as an integer digit string.
  const ftScaled = `${fi}${ff.padEnd(places, "0")}` || "0";
  const inScaled = `${ii}${iff.padEnd(places, "0")}` || "0";
  // mm × 10^(places+1) = (12·ft + in) × 254.
  const scaledMm = mulDigits(addDigits(mulDigits(ftScaled, 12), inScaled), 254);
  const shift = places + 1;
  const padded = scaledMm.padStart(shift + 1, "0");
  let whole = padded.slice(0, padded.length - shift);
  // Half away from zero: the first dropped digit alone decides (a 5 followed by anything, zeros
  // included, is at or above the half).
  if (padded.charCodeAt(padded.length - shift) >= 53) whole = addDigits(whole, "1");
  return parseFloat(whole);
}

/**
 * An integer count `h` of half-lattice units (0.0005 mm: the 0.001 mm lattice of ADR 0022, doubled
 * so a centre line is never rounded) as its exact decimal in mm, built from the integer's digits
 * with no division, so no float sits upstream of the bytes (the `keep` residuals, ADR 0033).
 * `-1_000_000 → "-500"`, `1 → "0.0005"`, `0 → "0"`. A non-integer is a caller bug and throws.
 */
export function fmtHalfLattice(h: number): string {
  if (!Number.isSafeInteger(h)) throw new RangeError(`fmtHalfLattice: ${h} is not an integer count`);
  const q = Math.abs(h) * 5;
  const whole = Math.floor(q / 10000);
  const frac = String(q % 10000)
    .padStart(4, "0")
    .replace(/0+$/, "");
  const body = frac === "" ? String(whole) : `${whole}.${frac}`;
  return h < 0 ? `-${body}` : body;
}
