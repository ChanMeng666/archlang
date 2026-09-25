/**
 * CJK text in the Node-only backends (issue #107).
 *
 * The PDF and PNG backends draw text with embedded fonts so the output never depends on the
 * host. The bundled Roboto has no Chinese, Japanese or Korean glyphs, so those labels used to
 * come out as .notdef boxes with NO warning — and were lost from PDF text extraction. The CJK
 * face now ships as the optional `@chanmeng666/archlang-font-cjk` package (a workspace here, so
 * it is always installed in this repo), resolved lazily and ONLY when some drawn string needs
 * it. What these tests pin:
 *
 *  - coverage is read from each font's own `cmap` (Roboto: Latin/Greek/Cyrillic, not Han;
 *    the CJK face: Han, kana, Hangul);
 *  - a CJK plan round-trips through the PDF — decoded PER FONT through each font's own
 *    `/ToUnicode` CMap, since two embedded subsets reuse the same glyph ids — and the PDF is
 *    byte-reproducible;
 *  - a plan with no CJK neither registers nor embeds the CJK face (the byte-identity law for
 *    the whole example corpus is proved by a SHA-256 sweep; this is its in-suite pin);
 *  - the PNG draws real glyphs, not tofu;
 *  - with the package absent, or for a script no face covers, the render still succeeds and
 *    raises the catalogued `W_CJK_FONT_MISSING` / `W_GLYPH_UNSUPPORTED` — never silent loss;
 *  - the committed font matches the SHA-256 its generator recorded beside it.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import * as fontPkg from "@chanmeng666/archlang-font-cjk";
import { ERROR_CATALOG } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import { toPdf } from "../src/export/pdf.js";
import { renderPng, svgTexts } from "../src/backends/png.js";
import {
  bundledFontPath,
  covers,
  fontCoverage,
  glyphDiagnostics,
  planFonts,
  setCjkFontForTesting,
} from "../src/backends/font.js";

async function has(pkg: string): Promise<boolean> {
  try {
    await import(pkg);
    return true;
  } catch {
    return false;
  }
}
const HAS_PDFKIT = await has("pdfkit");
const HAS_RESVG = await has("@resvg/resvg-js");

const sceneOf = (src: string) => toScene(resolve(parse(src).plan!).ir);

const CJK_PLAN = `plan "P" {
  units mm
  room id=k at (0,0) size 4000x3000 label "厨房"
  room id=l at (4000,0) size 4000x3000 label "客廳"
  room id=j at (0,3000) size 4000x3000 label "キッチン"
  room id=b at (4000,3000) size 4000x3000 label "주방 Kitchen"
}`;
const LATIN_PLAN = `plan "P" { room id=r at (0,0) size 4000x3000 label "Łazienka Кухня" }`;
const THAI_PLAN = `plan "P" { room id=r at (0,0) size 4000x3000 label "ห้องครัว" }`;

afterEach(() => setCjkFontForTesting(undefined));

// ---------------------------------------------------------------------------
// Reading a PDF back at the OBJECT level: text is decoded per font, through the
// `/ToUnicode` CMap of whichever font the content stream selected with `Tf`.

/** `N 0 obj … endobj` bodies by object number; a stream's payload is inflated. */
function objects(pdf: Uint8Array): Map<number, { dict: string; stream?: string }> {
  const buf = Buffer.from(pdf);
  const text = buf.toString("latin1");
  const out = new Map<number, { dict: string; stream?: string }>();
  for (const m of text.matchAll(/(\d+) 0 obj\b/g)) {
    const start = m.index! + m[0].length;
    const end = text.indexOf("endobj", start);
    const body = text.slice(start, end);
    const s = body.indexOf("stream");
    if (s < 0) {
      out.set(Number(m[1]), { dict: body });
      continue;
    }
    let p = start + s + 6;
    if (buf[p] === 0x0d) p++;
    if (buf[p] === 0x0a) p++;
    let e = text.indexOf("endstream", p);
    while (e > p && (buf[e - 1] === 0x0a || buf[e - 1] === 0x0d)) e--;
    let stream: string | undefined;
    try {
      stream = inflateSync(buf.subarray(p, e)).toString("latin1");
    } catch {
      stream = undefined; // a font program or other binary payload
    }
    out.set(Number(m[1]), { dict: body.slice(0, s), ...(stream !== undefined ? { stream } : {}) });
  }
  return out;
}

const utf16 = (hex: string) => {
  let s = "";
  for (let i = 0; i + 3 < hex.length; i += 4) s += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
  return s;
};

/** One `/ToUnicode` CMap: code → text (both `bfchar` and both `bfrange` forms). */
function cmapOf(src: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const b of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of b[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
      map.set(Number.parseInt(m[1]!, 16), utf16(m[2]!));
  for (const b of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of b[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = Number.parseInt(m[1]!, 16);
      let i = 0;
      for (const x of m[3]!.matchAll(/<([0-9a-fA-F]+)>/g)) map.set(lo + i++, utf16(x[1]!));
    }
    for (const m of b[1]!
      .replace(/\[[\s\S]*?\]/g, "")
      .matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = Number.parseInt(m[1]!, 16);
      const hi = Number.parseInt(m[2]!, 16);
      const dst = Number.parseInt(m[3]!, 16);
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + (c - lo)));
    }
  }
  return map;
}

/** Every string the page draws, in order, each decoded with the font that drew it; plus
 *  the `/BaseFont` of every font resource the page uses. */
function readPdf(pdf: Uint8Array): { strings: { font: string; text: string }[]; baseFonts: string[] } {
  const objs = objects(pdf);
  const fontRes = new Map<string, { base: string; cmap: Map<number, string> }>();
  for (const { dict } of objs.values()) {
    const res = /\/Font\s*<<([\s\S]*?)>>/.exec(dict);
    if (!res) continue;
    for (const m of res[1]!.matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const font = objs.get(Number(m[2]))!.dict;
      const base = /\/BaseFont\s*\/([^\s/>]+)/.exec(font)![1]!;
      const tu = /\/ToUnicode\s+(\d+) 0 R/.exec(font);
      fontRes.set(m[1]!, { base, cmap: tu ? cmapOf(objs.get(Number(tu[1]))!.stream ?? "") : new Map() });
    }
  }
  const page = [...objs.values()].find((o) => o.stream?.includes(" cm\n"))!.stream!;
  const strings: { font: string; text: string }[] = [];
  let cur: { base: string; cmap: Map<number, string> } | undefined;
  for (const m of page.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ/g)) {
    if (m[1]) {
      cur = fontRes.get(m[1]);
      continue;
    }
    let text = "";
    for (const h of m[2]!.matchAll(/<([0-9a-fA-F]*)>/g))
      for (let i = 0; i + 3 < h[1]!.length; i += 4)
        text += cur!.cmap.get(Number.parseInt(h[1]!.slice(i, i + 4), 16)) ?? "";
    strings.push({ font: cur!.base, text });
  }
  return { strings, baseFonts: [...new Set([...fontRes.values()].map((f) => f.base))] };
}

// ---------------------------------------------------------------------------

describe("font coverage (cmap)", () => {
  it("Roboto covers Latin, Polish, Greek and Cyrillic but no Han, kana or Hangul", async () => {
    const cov = await fontCoverage(await bundledFontPath());
    for (const ch of "AzŁąΩЖ0²") expect(covers(cov, ch.codePointAt(0)!), ch).toBe(true);
    for (const ch of "厨キ주") expect(covers(cov, ch.codePointAt(0)!), ch).toBe(false);
  });

  it("the CJK face covers Simplified and Traditional Han, kana, Hangul — and Latin", async () => {
    const cov = await fontCoverage(fontPkg.fontPath);
    for (const ch of "厨房客廳キッチン주방Kitchen、（") expect(covers(cov, ch.codePointAt(0)!), ch).toBe(true);
    // Thai is in neither face — the case W_GLYPH_UNSUPPORTED exists for.
    expect(covers(cov, "ห".codePointAt(0)!)).toBe(false);
  });

  it("plans no CJK face for text Roboto fully covers", async () => {
    const plan = await planFonts(["Kitchen", "Łazienka", "Кухня", "12.0 m²"]);
    expect(plan.cjk).toBeNull();
    expect(plan.missing).toBeNull();
  });
});

describe("the CJK font package", () => {
  it("ships the font its generator recorded (SHA-256 beside it)", () => {
    const recorded = readFileSync(`${fontPkg.fontPath}.sha256`, "utf8").split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(fontPkg.fontPath)).digest("hex");
    expect(actual).toBe(recorded);
    expect(fontPkg.fontFamily).toBe("ArchLang CJK Sans");
  });

  it("is renamed away from the Noto trademark in its name table", () => {
    // The family / full / PostScript names must not claim to be Noto (OFL + trademark).
    const bytes = readFileSync(fontPkg.fontPath).toString("latin1");
    expect(bytes).toContain("ArchLangCJKSans-Regular");
    expect(bytes).not.toContain("NotoSansCJKsc-Regular");
  });
});

describe.skipIf(!HAS_PDFKIT)("PDF: CJK labels", () => {
  it("round-trips Chinese, Japanese and Korean through the embedded CJK face", async () => {
    const { strings, baseFonts } = readPdf(await toPdf(sceneOf(CJK_PLAN)));
    const texts = strings.map((s) => s.text);
    for (const label of ["厨房", "客廳", "キッチン", "주방 Kitchen"]) expect(texts).toContain(label);
    // A mixed label goes wholly in the CJK face; the area labels stay in Roboto.
    expect(strings.find((s) => s.text === "주방 Kitchen")!.font).toMatch(/ArchLangCJKSans-Regular$/);
    expect(strings.find((s) => s.text === "12.0 m²")!.font).toMatch(/Roboto/);
    expect(baseFonts.some((b) => b.endsWith("ArchLangCJKSans-Regular"))).toBe(true);
  });

  it("is byte-reproducible", async () => {
    const a = await toPdf(sceneOf(CJK_PLAN));
    const b = await toPdf(sceneOf(CJK_PLAN));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("does not register or embed the CJK face when nothing needs it", async () => {
    const pdf = await toPdf(sceneOf(LATIN_PLAN));
    const { strings, baseFonts } = readPdf(pdf);
    expect(strings.map((s) => s.text)).toContain("Łazienka Кухня");
    expect(baseFonts.every((b) => /Roboto/.test(b))).toBe(true);
    expect(Buffer.from(pdf).toString("latin1")).not.toContain("ArchLangCJK");
  });

  it("warns W_CJK_FONT_MISSING (with a fix) and still renders when the package is absent", async () => {
    setCjkFontForTesting(null);
    const seen: Diagnostic[] = [];
    const pdf = await toPdf(sceneOf(CJK_PLAN), { onDiagnostic: (d) => seen.push(d) });
    expect(pdf.length).toBeGreaterThan(0);
    expect(seen.map((d) => d.code)).toEqual(["W_CJK_FONT_MISSING"]);
    expect(seen[0]!.severity).toBe("warning");
    expect(seen[0]!.message).toContain("厨");
    expect(seen[0]!.hints).toEqual(["npm i @chanmeng666/archlang-font-cjk"]);
  });

  it("warns W_GLYPH_UNSUPPORTED for a script no embedded face covers", async () => {
    const seen: Diagnostic[] = [];
    await toPdf(sceneOf(THAI_PLAN), { onDiagnostic: (d) => seen.push(d) });
    expect(seen.map((d) => d.code)).toEqual(["W_GLYPH_UNSUPPORTED"]);
    expect(seen[0]!.message).toContain("U+0E2B");
  });

  it("raises nothing for a plan every face covers", async () => {
    const seen: Diagnostic[] = [];
    await toPdf(sceneOf(CJK_PLAN), { onDiagnostic: (d) => seen.push(d) });
    await toPdf(sceneOf(LATIN_PLAN), { onDiagnostic: (d) => seen.push(d) });
    expect(seen).toEqual([]);
  });
});

describe.skipIf(!HAS_RESVG)("PNG: CJK labels", () => {
  it("reads the drawn strings back out of the SVG, unescaped", () => {
    expect(svgTexts('<text x="0">A &amp; B</text><text>厨房</text><tspan>&lt;x&gt;</tspan>')).toEqual([
      "A & B",
      "厨房",
      "<x>",
    ]);
  });

  it("draws real CJK glyphs — the output differs from the tofu the absent package gives", async () => {
    const scene = sceneOf(`plan "P" { room id=k at (0,0) size 4000x3000 label "厨房" }`);
    const withFont = await renderPng(scene);
    setCjkFontForTesting(null);
    const seen: Diagnostic[] = [];
    const tofu = await renderPng(scene, { onDiagnostic: (d) => seen.push(d) });
    expect(Buffer.from(withFont).equals(Buffer.from(tofu))).toBe(false);
    expect(seen.map((d) => d.code)).toEqual(["W_CJK_FONT_MISSING"]);
  });

  it("renders a non-CJK plan byte-identically whether or not the package is present", async () => {
    const scene = sceneOf(LATIN_PLAN);
    const a = await renderPng(scene);
    setCjkFontForTesting(null);
    const b = await renderPng(scene);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("the warnings are catalogued", () => {
  it("both codes exist as warnings with a fix", () => {
    for (const code of ["W_CJK_FONT_MISSING", "W_GLYPH_UNSUPPORTED"] as const) {
      const e = ERROR_CATALOG[code];
      expect(e, code).toBeDefined();
      expect(e!.severity).toBe("warning");
      expect(e!.fix.length).toBeGreaterThan(0);
    }
  });

  it("splits CJK-needs-the-package from no-face-covers-it only when the package is absent", () => {
    const cps = ["厨", "ห"].map((c) => c.codePointAt(0)!);
    expect(glyphDiagnostics({ codePoints: cps, cjkInstalled: false }, "PDF").map((d) => d.code)).toEqual([
      "W_CJK_FONT_MISSING",
      "W_GLYPH_UNSUPPORTED",
    ]);
    expect(glyphDiagnostics({ codePoints: cps, cjkInstalled: true }, "PDF").map((d) => d.code)).toEqual([
      "W_GLYPH_UNSUPPORTED",
    ]);
  });
});
