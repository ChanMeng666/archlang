/**
 * The closed-form text widths in the tree: {@link textWidth}, the one shared estimate, and
 * {@link inkWidth}, from the advances of the two faces a label is drawn in, for a test a label stands
 * right up against.
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

/**
 * Advance widths of the two faces a room's name is drawn in, code point by code point: U+0020 to
 * U+007E, then U+00A0 to U+00FF. {@link inkWidth} takes the wider of the two for each character.
 *
 * Roboto Regular, in 2048ths of the em: the `hmtx` table of `assets/fonts/Roboto-Regular.ttf`
 * (Version 2.001047), the face the PNG and the PDF draw. Helvetica-Bold, in 1000ths: Adobe's Core 14
 * metrics (`Helvetica-Bold.afm`, 1997, as pdfkit ships them); Arial Bold shares the figures. That
 * is what an SVG draws in a browser: `Helvetica, Arial` at a name's weight 600 reaches the bold, and
 * the SVG is what most people read a plan in. `test/text-metrics.test.ts` reads the font file and
 * the AFM and holds every entry of these tables to them. Neither file is read at compile time.
 *
 * Per character, because that is what the faces show: in Roboto `i` and `l` advance 0.24 em, `m`
 * 0.88, `W` 0.89, and a name's mean runs from 0.36 ("Utility") to 0.77 ("WC").
 *
 * An estimate that covers those two faces, not a promise for every font: a host with neither
 * Helvetica nor Arial substitutes its own, and a theme can name any family.
 */
const ROBOTO_ASCII: readonly number[] = [
  507, 527, 655, 1261, 1150, 1500, 1273, 357, 700, 712, 882, 1161, 402, 565, 539, 844, 1150, 1150, 1150, 1150, 1150,
  1150, 1150, 1150, 1150, 1150, 496, 433, 1041, 1124, 1070, 967, 1839, 1336, 1275, 1333, 1343, 1164, 1132, 1395, 1460,
  557, 1130, 1284, 1102, 1788, 1460, 1408, 1292, 1408, 1261, 1215, 1222, 1328, 1303, 1817, 1284, 1230, 1226, 543, 840,
  543, 856, 924, 633, 1114, 1149, 1072, 1155, 1085, 711, 1149, 1128, 497, 489, 1038, 497, 1795, 1130, 1168, 1149, 1164,
  693, 1056, 669, 1129, 992, 1539, 1015, 969, 1015, 693, 499, 693, 1393,
];
const ROBOTO_LATIN1: readonly number[] = [
  507, 499, 1120, 1190, 1460, 1075, 491, 1256, 856, 1609, 915, 961, 1134, 565, 1610, 938, 765, 1094, 751, 751, 642,
  1160, 1001, 534, 507, 751, 931, 960, 1500, 1589, 1593, 969, 1336, 1336, 1336, 1336, 1336, 1336, 1914, 1333, 1164,
  1164, 1164, 1164, 557, 557, 557, 557, 1373, 1460, 1408, 1408, 1408, 1408, 1408, 1092, 1408, 1328, 1328, 1328, 1328,
  1230, 1210, 1218, 1114, 1114, 1114, 1114, 1114, 1114, 1729, 1072, 1085, 1085, 1085, 1085, 506, 506, 506, 506, 1200,
  1130, 1168, 1168, 1168, 1168, 1168, 1169, 1160, 1129, 1129, 1129, 1129, 969, 1180, 969,
];

const HELVETICA_BOLD_ASCII: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
];
const HELVETICA_BOLD_LATIN1: readonly number[] = [
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556,
  278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278,
  278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556,
  556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611,
  611, 556, 611, 556,
];

/**
 * The units {@link inkWidth} sums, to the em: the least common multiple of Roboto's 2048 and Adobe's
 * 1000, so the two faces compare and add up in whole numbers.
 */
const UNITS_PER_EM = 256_000;

/** The wider of a character's two advances, in {@link UNITS_PER_EM}ths. */
const wider = (roboto: number, helveticaBold: number): number => Math.max(roboto * 125, helveticaBold * 256);

/**
 * The width a text can draw, in the units of `fontSize`: the sum, character by character, of the
 * wider of the two faces' advances ({@link ROBOTO_ASCII}, {@link HELVETICA_BOLD_ASCII} and their
 * Latin-1 rows), kerning left out, which only narrows a line. One figure for the name and the area
 * figure alike: a digit is 0.56 em in both faces. A CJK character is one em: the CJK face is square
 * (`packages/font-cjk`: Han and kana 1000 of 1000 units, Hangul 920) and neither table has it. Any
 * other character takes {@link EM_PER_CHAR}, about what Roboto gives Greek (0.57 on average) and
 * Cyrillic (0.63).
 *
 * For a test that reports a name over a wall or off its floor, refuses it a place or shrinks it:
 * there {@link textWidth}'s slack reads a name with clear floor on both sides as buried in both
 * walls, while its one constant reads "WC" narrower than it draws.
 */
export function inkWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) units += wider(ROBOTO_ASCII[c - 0x20]!, HELVETICA_BOLD_ASCII[c - 0x20]!);
    else if (c >= 0xa0 && c <= 0xff) units += wider(ROBOTO_LATIN1[c - 0xa0]!, HELVETICA_BOLD_LATIN1[c - 0xa0]!);
    else if (isCjkCodePoint(c)) units += UNITS_PER_EM;
    else units += UNITS_PER_EM * EM_PER_CHAR;
  }
  return (units * fontSize) / UNITS_PER_EM;
}

/** Is `cp` a character the CJK package is the answer for (Han, kana, Hangul, CJK
 *  punctuation, fullwidth forms)? Words the warning for a MISSING package, and tells
 *  `inkWidth` (`src/text-metrics.ts`) a square character from a Latin one. */
export function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x2fdf) || // CJK radicals, Kangxi radicals
    (cp >= 0x3000 && cp <= 0x33ff) || // CJK punctuation, kana, bopomofo, compat jamo, enclosed, compat
    (cp >= 0x3400 && cp <= 0x4dbf) || // Extension A
    (cp >= 0x4e00 && cp <= 0x9fff) || // Unified ideographs
    (cp >= 0xa960 && cp <= 0xa97f) || // Hangul Jamo Extended-A
    (cp >= 0xac00 && cp <= 0xd7ff) || // Hangul syllables + Jamo Extended-B
    (cp >= 0xf900 && cp <= 0xfaff) || // Compatibility ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xffef) || // Half/fullwidth forms
    (cp >= 0x20000 && cp <= 0x3ffff) // Supplementary ideographic planes
  );
}

/** Estimated drawn width of `text` at `fontSize`, in the same units as `fontSize`. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * EM_PER_CHAR;
}

/**
 * Clear gap a dimension NUMBER must keep from whatever it sits beside, in dimension-font
 * multiples. Two decisions read it, and both must read the same value:
 *
 * - **Crowding within a chain** (`staggerChain`, `scene-build.ts`): below this gap the
 *   numbers overprint their neighbours and the whole chain staggers.
 * - **A number too big for its own measurement** (`outsideStations`, `elements/dim.ts`):
 *   below this gap the value cannot sit between its stations and is written past one.
 *
 * It lives HERE, with the width estimate it is always compared against, rather than in
 * `sheet.ts` (which re-exports it, so every existing importer is unchanged): `sheet.ts`
 * reaches the element registry through `chrome-layout.ts`, so an element module importing
 * it closes a load-time cycle. The sheet's own chain-slot geometry deliberately does NOT
 * move for either remedy — a staggered number flips to the INNER side of its line and a
 * pushed-out one runs ALONG it, so `DIM_BAND_FONTS` reserves exactly the same depth.
 */
export const DIM_TEXT_GAP = 0.5;
