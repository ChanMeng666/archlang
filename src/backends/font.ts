/**
 * The fonts every Node-only backend embeds, resolved once.
 *
 * Both the PNG rasteriser (resvg) and the PDF exporter (pdfkit) must draw text
 * with the SAME fonts so the two outputs agree and so neither depends on which
 * fonts happen to be installed on the host. A standard-14 PDF face (Helvetica)
 * cannot represent anything outside Windows-1252 — Polish, Czech, Turkish, Greek
 * and Cyrillic labels all lose glyphs — so the PDF embeds this TrueType face too.
 *
 * Roboto has no CJK glyphs, so a Chinese, Japanese or Korean label would render as
 * .notdef boxes with no warning. The CJK face ships as a SEPARATE optional
 * package, `@chanmeng666/archlang-font-cjk` (~11 MB — too big for the core tarball), in
 * the core's `optionalDependencies`, the same mechanism as pdfkit and resvg. It is
 * resolved lazily by {@link cjkFont} and only when some text actually needs it, so a
 * plan with no CJK neither loads nor embeds it and renders byte-identically.
 *
 * Which code points a face covers is read from the font's own `cmap` table by
 * {@link fontCoverage} — a small zero-dependency OpenType reader that touches only the
 * table directory and the `cmap` bytes, so asking about the 11 MB CJK face costs a few
 * hundred kilobytes of I/O, not a parse of every outline.
 *
 * `node:fs` / `node:url` are imported LAZILY (not at module top) so this module stays
 * browser-safe and honours the §0 invariant "no Node-only APIs in src/ except
 * cli.ts". The Node path only runs when a Node-only backend actually renders.
 */

/** The bundled font's family name — pinned as resvg's default and used as the
 *  pdfkit registration alias. */
export const BUNDLED_FONT_FAMILY = "Roboto";

/** The optional package that carries the CJK face. */
export const CJK_FONT_PACKAGE = "@chanmeng666/archlang-font-cjk";

/** A font file plus the family name it registers under. */
export interface FontFace {
  path: string;
  family: string;
}

let fontPathCache: string | null = null;

/**
 * Resolve the bundled font's path once. The same module runs both bundled
 * (`dist/…`) and straight from source (vitest / `tsx`), so try both layouts:
 * `dist/assets/` next to the emitted chunk, and `assets/fonts/` at the repo root
 * relative to `src/backends/`.
 */
export async function bundledFontPath(): Promise<string> {
  if (fontPathCache) return fontPathCache;
  // Namespace access (not destructuring) so browser bundlers that stub `node:*`
  // don't fail their static named-export check — this code never runs in a browser.
  // The ignore comments keep webpack/Vite from trying to resolve `node:fs`/`node:url`
  // for a browser bundle at all (same rule as the optional-dep imports; without them
  // a webpack consumer importing the core client-side fails its build on this
  // Node-only, never-reached-in-browser path).
  const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs");
  const url = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:url");
  // String-CONCAT paths (not literals or template literals) so browser bundlers'
  // `new URL(..., import.meta.url)` asset plugins don't statically pick the font
  // up — it ships only in the npm tarball (dist/assets) and is read here at
  // runtime under Node. (Vite/Rollup match literal/template forms, not `+`.)
  const file = "Roboto-Regular.ttf";
  const candidates = [
    new URL("./assets/" + file, import.meta.url), // bundled: dist/assets
    new URL("../.." + "/assets/fonts/" + file, import.meta.url), // source: repo/assets/fonts
  ];
  for (const u of candidates) {
    const p = url.fileURLToPath(u);
    if (fs.existsSync(p)) {
      fontPathCache = p;
      return p;
    }
  }
  throw new Error(`bundled font '${file}' could not be located`);
}

/** The bundled face as a {@link FontFace}. */
export async function bundledFont(): Promise<FontFace> {
  return { path: await bundledFontPath(), family: BUNDLED_FONT_FAMILY };
}

// ---------------------------------------------------------------------------
// The optional CJK face.

let cjkCache: Promise<FontFace | null> | null = null;
/** Test seam — see {@link setCjkFontForTesting}. `undefined` = resolve normally. */
let cjkOverride: FontFace | null | undefined;

/**
 * The CJK face from the optional `@chanmeng666/archlang-font-cjk` package, or `null`
 * when it is not installed (or does not export a readable font). Resolved once.
 *
 * The specifier is cast through `as string` and carries the bundler-ignore comments —
 * the same pattern as `pdfkit` and `@resvg/resvg-js` — so neither TypeScript nor a
 * downstream webpack/Vite/esbuild build tries to resolve an 11 MB font package for a
 * browser bundle; this path only ever runs under Node, from a PDF or PNG render.
 */
export function cjkFont(): Promise<FontFace | null> {
  if (cjkOverride !== undefined) return Promise.resolve(cjkOverride);
  if (!cjkCache) {
    cjkCache = (async (): Promise<FontFace | null> => {
      try {
        const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ CJK_FONT_PACKAGE as string)) as {
          fontPath?: unknown;
          fontFamily?: unknown;
        };
        if (typeof mod.fontPath !== "string" || typeof mod.fontFamily !== "string") return null;
        const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs");
        if (!fs.existsSync(mod.fontPath)) return null;
        return { path: mod.fontPath, family: mod.fontFamily };
      } catch {
        return null;
      }
    })();
  }
  return cjkCache;
}

/**
 * Replace what {@link cjkFont} resolves to — `null` simulates the package being absent,
 * a face substitutes one, `undefined` restores normal resolution. For tests only; NOT
 * exported from `src/index.ts`.
 */
export function setCjkFontForTesting(face: FontFace | null | undefined): void {
  cjkOverride = face;
}

// ---------------------------------------------------------------------------
// Coverage: which code points a face maps to a real glyph.

/** Sorted, disjoint, inclusive `[first, last]` code-point ranges a face maps to a glyph. */
export type Coverage = ReadonlyArray<readonly [number, number]>;

/** Does `cov` map `cp` to a real glyph? Binary search over the ranges. */
export function covers(cov: Coverage, cp: number): boolean {
  let lo = 0;
  let hi = cov.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = cov[mid]!;
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Merge a sorted list of code points into {@link Coverage} ranges. */
function toRanges(cps: number[]): Array<[number, number]> {
  cps.sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const cp of cps) {
    const last = out[out.length - 1];
    if (last && cp <= last[1] + 1) last[1] = Math.max(last[1], cp);
    else out.push([cp, cp]);
  }
  return out;
}

/**
 * Parse an OpenType `cmap` table (the raw table bytes) into the code points it maps to a
 * non-zero glyph. Reads the best Unicode subtable: format 12 (full repertoire, platform
 * 3/10 or 0/4+) when present, else format 4 (BMP, platform 3/1 or 0/3). Pure — exported
 * so a test can hold it against a known font.
 */
export function parseCmap(table: Uint8Array): Coverage {
  const dv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const n = dv.getUint16(2);
  let f12 = -1;
  let f4 = -1;
  for (let i = 0; i < n; i++) {
    const rec = 4 + i * 8;
    const platform = dv.getUint16(rec);
    const encoding = dv.getUint16(rec + 2);
    const offset = dv.getUint32(rec + 4);
    const format = dv.getUint16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12 && f12 < 0) f12 = offset;
    else if (format === 4 && f4 < 0) f4 = offset;
  }
  const cps: number[] = [];
  if (f12 >= 0) {
    const groups = dv.getUint32(f12 + 12);
    for (let g = 0; g < groups; g++) {
      const at = f12 + 16 + g * 12;
      const start = dv.getUint32(at);
      const end = dv.getUint32(at + 4);
      const glyph = dv.getUint32(at + 8);
      // A group mapping its first code point to glyph 0 (.notdef) maps it to nothing.
      for (let cp = glyph === 0 ? start + 1 : start; cp <= end; cp++) cps.push(cp);
    }
    return toRanges(cps);
  }
  if (f4 >= 0) {
    const segX2 = dv.getUint16(f4 + 6);
    const ends = f4 + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + s * 2);
      const start = dv.getUint16(starts + s * 2);
      const delta = dv.getInt16(deltas + s * 2);
      const roAt = rangeOffsets + s * 2;
      const ro = dv.getUint16(roAt);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let glyph: number;
        if (ro === 0) glyph = (cp + delta) & 0xffff;
        else {
          const gAt = roAt + ro + (cp - start) * 2;
          const raw = gAt + 1 < table.byteLength ? dv.getUint16(gAt) : 0;
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        if (glyph !== 0) cps.push(cp);
      }
    }
    return toRanges(cps);
  }
  return [];
}

const coverageCache = new Map<string, Promise<Coverage>>();

/**
 * The code points the font file at `path` covers, read from its `cmap` table and cached
 * per path. Reads only the table directory and the `cmap` bytes (positioned reads), so
 * asking about a large face is cheap.
 */
export function fontCoverage(path: string): Promise<Coverage> {
  let hit = coverageCache.get(path);
  if (!hit) {
    hit = (async () => {
      const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs");
      const fd = fs.openSync(path, "r");
      try {
        const read = (pos: number, len: number): Uint8Array => {
          const buf = new Uint8Array(len);
          let got = 0;
          while (got < len) {
            const n = fs.readSync(fd, buf, got, len - got, pos + got);
            if (n <= 0) throw new Error(`font '${path}' is truncated`);
            got += n;
          }
          return buf;
        };
        const head = read(0, 12);
        const numTables = new DataView(head.buffer).getUint16(4);
        const dir = read(12, numTables * 16);
        const dv = new DataView(dir.buffer);
        for (let i = 0; i < numTables; i++) {
          const rec = i * 16;
          const tag = String.fromCharCode(dir[rec]!, dir[rec + 1]!, dir[rec + 2]!, dir[rec + 3]!);
          if (tag === "cmap") return parseCmap(read(dv.getUint32(rec + 8), dv.getUint32(rec + 12)));
        }
        throw new Error(`font '${path}' has no cmap table`);
      } finally {
        fs.closeSync(fd);
      }
    })();
    coverageCache.set(path, hit);
  }
  return hit;
}

// ---------------------------------------------------------------------------
// Choosing a face for a string, and reporting what no face can draw.

/** Is `cp` a character the CJK package is the answer for (Han, kana, Hangul, CJK
 *  punctuation, fullwidth forms)? Used only to word the warning for a MISSING package. */
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

/** What a text run could not be drawn with — collected across a whole render. */
export interface MissingGlyphs {
  /** Code points no available face covers, in first-seen order (deduplicated). */
  codePoints: number[];
  /** Whether the CJK package was installed when this was measured. */
  cjkInstalled: boolean;
}

/**
 * The font plan for one render: which face each string is drawn with, and which code
 * points no face can draw. Built by {@link planFonts} from the complete list of strings
 * the render will draw, BEFORE drawing, so the CJK face is registered only when a string
 * really needs it (and a render with no CJK stays byte-identical).
 */
export interface FontPlan {
  /** The CJK face, when some string is drawn with it; otherwise `null` (not registered). */
  cjk: FontFace | null;
  /** The face a string is drawn with: the CJK face only when it covers the string and
   *  Roboto does not. */
  faceFor(text: string): FontFace;
  /** Everything no face can draw, or `null` when every glyph exists. */
  missing: MissingGlyphs | null;
}

/**
 * Plan the fonts for a render that draws exactly `texts`. Roboto draws any string it
 * fully covers. Otherwise the CJK face draws it when it covers the whole string (Noto
 * carries Latin too, so a mixed "Kitchen 厨房" goes wholly in CJK and keeps one
 * consistent face); failing that, whichever face covers more of the string, and the
 * rest is reported in {@link FontPlan.missing}. The CJK package is only resolved when
 * some string has a code point Roboto lacks.
 */
export async function planFonts(texts: Iterable<string>): Promise<FontPlan> {
  const roboto = await bundledFont();
  const robotoCov = await fontCoverage(roboto.path);
  const uncovered = new Set<string>();
  for (const t of texts) {
    for (const ch of t) {
      if (!covers(robotoCov, ch.codePointAt(0)!)) {
        uncovered.add(t);
        break;
      }
    }
  }
  if (uncovered.size === 0) return { cjk: null, faceFor: () => roboto, missing: null };

  const cjk = await cjkFont();
  const cjkCov = cjk ? await fontCoverage(cjk.path) : null;
  const choice = new Map<string, FontFace>();
  const missing: number[] = [];
  const seen = new Set<number>();
  for (const t of uncovered) {
    let inRoboto = 0;
    let inCjk = 0;
    for (const ch of t) {
      const cp = ch.codePointAt(0)!;
      const r = covers(robotoCov, cp);
      const c = cjkCov ? covers(cjkCov, cp) : false;
      if (r) inRoboto++;
      if (c) inCjk++;
      if (!r && !c && !seen.has(cp)) {
        seen.add(cp);
        missing.push(cp);
      }
    }
    if (cjk && inCjk > inRoboto) choice.set(t, cjk);
  }
  const usesCjk = choice.size > 0;
  return {
    cjk: usesCjk ? cjk : null,
    faceFor: (text) => choice.get(text) ?? roboto,
    missing: missing.length > 0 ? { codePoints: missing, cjkInstalled: cjk !== null } : null,
  };
}

/** Render a code point for a message: the character plus its `U+XXXX` name. */
function describeCp(cp: number): string {
  return `"${String.fromCodePoint(cp)}" (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`;
}

/** At most this many characters are named in one warning. */
const NAMED_LIMIT = 8;

/** A render diagnostic, structurally a {@link import("../diagnostics.js").Diagnostic}. */
export interface GlyphDiagnostic {
  severity: "warning";
  code: "W_CJK_FONT_MISSING" | "W_GLYPH_UNSUPPORTED";
  message: string;
  hints?: string[];
}

/**
 * Turn {@link MissingGlyphs} into the catalogued warnings: `W_CJK_FONT_MISSING` for the
 * CJK characters a missing `@chanmeng666/archlang-font-cjk` would have drawn, and
 * `W_GLYPH_UNSUPPORTED` for everything no ArchLang face covers. `format` names the
 * output ("PDF" / "PNG") in the message.
 */
export function glyphDiagnostics(missing: MissingGlyphs | null, format: string): GlyphDiagnostic[] {
  if (!missing) return [];
  const cjkNeeded = missing.cjkInstalled ? [] : missing.codePoints.filter(isCjkCodePoint);
  const unsupported = missing.cjkInstalled
    ? missing.codePoints
    : missing.codePoints.filter((cp) => !isCjkCodePoint(cp));
  const list = (cps: number[]) =>
    cps.slice(0, NAMED_LIMIT).map(describeCp).join(", ") + (cps.length > NAMED_LIMIT ? ", …" : "");
  const out: GlyphDiagnostic[] = [];
  if (cjkNeeded.length > 0) {
    out.push({
      severity: "warning",
      code: "W_CJK_FONT_MISSING",
      message: `${format} text has ${cjkNeeded.length} CJK character${cjkNeeded.length === 1 ? "" : "s"} (${list(cjkNeeded)}) but the optional CJK font package '${CJK_FONT_PACKAGE}' is not installed, so ${cjkNeeded.length === 1 ? "it renders" : "they render"} as empty boxes.`,
      hints: [`npm i ${CJK_FONT_PACKAGE}`],
    });
  }
  if (unsupported.length > 0) {
    out.push({
      severity: "warning",
      code: "W_GLYPH_UNSUPPORTED",
      message: `${format} text has ${unsupported.length} character${unsupported.length === 1 ? "" : "s"} (${list(unsupported)}) that no font ArchLang embeds can draw, so ${unsupported.length === 1 ? "it renders" : "they render"} as empty boxes.`,
    });
  }
  return out;
}
