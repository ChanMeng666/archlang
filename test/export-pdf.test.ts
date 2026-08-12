/**
 * The PDF export backend (`src/export/pdf.ts`) — a PUBLISHED output format (`arch compile
 * -f pdf`), and until now 294 lines behind four assertions on one rectangle.
 *
 * Two things this suite exists to hold down.
 *
 * **1. The optional dep may not fail SILENTLY.** `pdfkit` is an `optionalDependency`, and
 * this suite used to open with `describe.skipIf(!available)`. That is not vacuous — vitest
 * reports a skip, so it never claimed to have asserted — but it does not FAIL in CI either,
 * so an install that quietly stopped pulling `optionalDependencies` would silently stop
 * testing a published output format and nothing would go red. `skipIf` has nowhere to hang
 * the CI throw, so the gate is restructured the way `test/png.test.ts` does it and
 * `docs/testing.md` §3 states: **required in CI** (a missing dep is the broken-install bug
 * it is), a **visible named skip** locally.
 *
 * **2. What the drawing actually contains.** Assertions go through the inflated page
 * CONTENT STREAM — the vector ops a reader sees — not the container's byte length, and
 * every expectation is DERIVED from the Scene under test (its theme colours, its title-block
 * rows, its primitive mix) rather than retyped, so a fixture that stops exercising a path
 * fails instead of quietly passing.
 *
 * ## Two findings recorded here, not papered over
 *
 * **(a) `toPdf` is NOT byte-deterministic**, and cannot be from inside this repo: pdfkit
 * stamps `Info /CreationDate` from `new Date()` (second granularity) and derives the trailer
 * `/ID` as an MD5 over that timestamp in MILLISECONDS, so two renders of the same Scene
 * differ. Measured: those are the ONLY two differing fields — every content-stream byte, the
 * whole xref table and `startxref` are identical, and both fields are fixed-width so nothing
 * shifts. Rather than mask and move on, {@link volatileSpans} pins the masking itself: one
 * test asserts the drawn page is byte-identical, and the next asserts every differing byte in
 * the whole FILE lies inside one of exactly two recognised spans — so a real nondeterminism
 * anywhere else cannot hide behind the mask. Making the output truly reproducible means
 * passing a fixed `info.CreationDate` into `PDFDocument`, which changes shipped bytes for a
 * published format; that is a product decision, not a test fix.
 *
 * **(b) Poché is DROPPED from every PDF.** `drawNode`'s switch has no `hatch` case, and the
 * `wallFill` layer is a single `hatch` primitive — so walls print as hollow outlines. The
 * module header of `src/export/pdf.ts` promises the opposite ("poché regions fill with the
 * solid poché base colour in PDF"), and `fillColor`'s `url(…) → theme.pocheBase` branch is
 * consequently dead: no non-hatch primitive ever carries a pattern fill. The gap is pinned
 * below as a characterisation test, non-vacuously (the same colour formatter is shown to find
 * a colour that IS drawn), so it cannot be lost again. **Fixing it means flipping that test.**
 *
 * **(c) The `layoutChrome` fallback is wrong for a sheet.** `toPdf` and `drawChrome` both fall
 * back to recomputing the chrome when a Scene carries none. On the historical (no-`paper`)
 * path that reproduces the stored layout byte-for-byte — asserted below. With a `paper` it
 * does not: `toScene` positions the chrome against the PAGE rectangle and the fallback
 * re-derives it against the drawing BOUNDS, so the scale bar and title block move tens of
 * metres. Unreachable today (every `toScene` Scene carries `chrome`), so it is a latent trap
 * in a documented hand-built-Scene path rather than a shipped bug — pinned, and flipped when
 * fixed.
 */

import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { layoutChrome } from "../src/chrome-layout.js";
import { compile } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import { toPdf } from "../src/export/pdf.js";

async function hasPdfkit(): Promise<boolean> {
  try {
    await import("pdfkit" as string);
    return true;
  } catch {
    return false;
  }
}

const HAS_PDFKIT = await hasPdfkit();
const PDFKIT_REQUIRED = !!process.env.CI;

const sceneOf = (src: string) => toScene(resolve(parse(src).plan!).ir);

/** Parse-clean or the fixture is lying about what it exercises. */
function planOf(src: string) {
  const p = parse(src);
  const errors = p.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new Error(`fixture does not parse: ${errors.map((d) => d.message).join("; ")}`);
  return toScene(resolve(p.plan!).ir);
}

// ---------------------------------------------------------------------------
// Reading a PDF back: the drawing lives in a Flate-compressed content stream.

/** Every `stream … endstream` payload, inflated; undecompressable ones are dropped. */
function inflatedStreams(pdf: Uint8Array): string[] {
  const buf = Buffer.from(pdf);
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const s = buf.indexOf("stream", i);
    if (s < 0) break;
    if (buf.subarray(s - 3, s).toString("latin1") === "end") {
      i = s + 6; // an `endstream` keyword, not the opening one
      continue;
    }
    let p = s + 6;
    if (buf[p] === 0x0d) p++;
    if (buf[p] === 0x0a) p++;
    const e = buf.indexOf("endstream", p);
    if (e < 0) break;
    let end = e;
    while (end > p && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d)) end--;
    try {
      out.push(inflateSync(buf.subarray(p, end)).toString("latin1"));
    } catch {
      /* a font file or an uncompressed stream — not the page content */
    }
    i = e + 9;
  }
  return out;
}

/** The page's vector operator stream — what a reader actually sees drawn. */
function pageOps(pdf: Uint8Array): string {
  const ops = inflatedStreams(pdf).find((s) => s.includes(" cm\n"));
  if (ops === undefined) throw new Error("no page content stream found in the PDF");
  return ops;
}

const unhex = (hex: string) => {
  let s = "";
  for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  return s;
};

/**
 * Every string drawn on the page, in draw order. pdfkit emits Helvetica text as hex
 * glyph runs inside one `TJ` array (`[<4C> -20 <656674> 0] TJ`); for a standard-14 font
 * the glyph codes are the character codes, so the hex decodes straight back to the label.
 * The runs of ONE array must be joined — kerning splits a word across several of them,
 * which is why "Left" is not a single `<…>`.
 */
function pdfStrings(pdf: Uint8Array): string[] {
  const out: string[] = [];
  for (const m of pageOps(pdf).matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    out.push([...m[1]!.matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => unhex(h[1]!)).join(""));
  }
  return out;
}

/** `#rrggbb` as the exact `r g b` operand pdfkit writes for a `scn` colour op. */
const rgbOp = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).join(" ");

/** `/MediaBox [0 0 w h]` of the first page, in PostScript points. */
function mediaBox(pdf: Uint8Array): [number, number] {
  const m = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(new TextDecoder("latin1").decode(pdf));
  if (!m) throw new Error("no MediaBox in the PDF");
  return [Number(m[1]), Number(m[2])];
}

/**
 * The byte ranges of the two wall-clock fields pdfkit stamps into every file — see
 * finding (a) in the header. Both are FIXED WIDTH, so masking them cannot shift any
 * other offset. Callers assert there are exactly two, which is what stops a pdfkit
 * change to either format from turning the mask into a silent no-op.
 */
const VOLATILE = [
  /\(D:\d{14}Z\)/g, // Info /CreationDate — `new Date()`, second granularity
  /\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/g, // trailer /ID — MD5 over CreationDate in ms
];

function volatileSpans(pdf: Uint8Array): [number, number][] {
  const text = new TextDecoder("latin1").decode(pdf);
  const spans: [number, number][] = [];
  for (const re of VOLATILE) for (const m of text.matchAll(re)) spans.push([m.index, m.index + m[0].length]);
  return spans.sort((a, b) => a[0] - b[0]);
}

function maskVolatile(pdf: Uint8Array): string {
  let text = new TextDecoder("latin1").decode(pdf);
  for (const re of VOLATILE) text = text.replace(re, (m) => "\u0000".repeat(m.length));
  return text;
}

// ---------------------------------------------------------------------------
// Fixtures. Built inline (not read from examples/) so a change to the gallery can
// never silently change what this suite exercises.

const ROOM = 'plan "P" { room id=r at (0,0) size 4000x3000 label "Room" }';

/** Arcs, a circle, a dashed opening, rotated dimension text, poché, a mitre cap. */
const RICH = `plan "Rich" {
  wall exterior thickness 200 { (0,0) (6000,0) arc (6000,4000) radius 3600 (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  room id=a at (0,0) size 3000x4000 label "Left"
  room id=b circle at (4300,2000) radius 1200 label "Drum"
  door at (3000,2000) width 900 wall partition hinge left swing in
  opening at (1500,0) width 900 wall exterior
  dims auto
}`;

const SHEET = `plan "Sheet Demo" {
  paper A2
  scale 1:100
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Hall"
}`;

const TWO_STOREY = `plan "Tower" {
  level 1 {
    wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=g at (0,0) size 6000x4000 label "Ground"
  }
  level 2 {
    wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=u at (0,0) size 6000x4000 label "Upper"
  }
}`;

const THEMED = `plan "Themed" {
  theme { background: "#1e2127" room: "#272b33" wallFill: "#3a3f4b" }
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Living"
}`;

describe("PDF export", () => {
  if (!HAS_PDFKIT) {
    const gate = "optional dep pdfkit is installed";
    if (PDFKIT_REQUIRED) {
      it(gate, () => {
        throw new Error(
          "optional dep pdfkit missing in CI — install step is broken. The PDF backend was " +
            "NOT exercised (format, determinism, multi-page fan-out, the sheet page, the title " +
            "block, themes and poche all went unasserted) even though `arch compile -f pdf` is a " +
            "published output format. Check that the install step still pulls optionalDependencies " +
            "(npm ci without --omit=optional).",
        );
      });
    } else {
      // Visible in the reporter as a skip, with the reason in the name.
      it.skip(`${gate} (absent locally — PDF backend not exercised)`, () => {});
    }
    return;
  }

  const scene = sceneOf(ROOM);

  it("produces a valid PDF (magic header + EOF trailer)", async () => {
    const pdf = await toPdf(scene);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    const head = new TextDecoder().decode(pdf.slice(0, 5));
    expect(head).toBe("%PDF-");
    const tail = new TextDecoder().decode(pdf.slice(-6));
    expect(tail).toContain("EOF");
  });

  it("neutralises control characters and unpaired surrogates in labels", async () => {
    // The lexer admits any raw character except newline inside "…", so NUL, ESC
    // and a lone surrogate can reach the backend. plainText() must blank them
    // before pdfkit's string encoder sees them (identity on well-formed text).
    // Built via fromCharCode so this test file stays pure ASCII.
    const hostileLabel = [
      "a",
      String.fromCharCode(0),
      "b",
      String.fromCharCode(27),
      "c",
      String.fromCharCode(0xd800),
      "d",
    ].join("");
    const hostile = sceneOf(`plan "P" { room id=r at (0,0) size 4000x3000 label "${hostileLabel}" }`);
    const pdf = await toPdf(hostile);
    const head = new TextDecoder().decode(pdf.slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(100);
  });

  it("emits vector content with selectable text (no rasterized image)", async () => {
    const pdf = await toPdf(scene);
    const bytes = new TextDecoder("latin1").decode(pdf);
    // A real text font (selectable text), and no image XObject (true vector).
    // Note: pdfkit always lists /ImageB /ImageC /ImageI in /ProcSet — that is not
    // an embedded image, so we check specifically for an image XObject subtype.
    expect(bytes).toContain("Helvetica");
    expect(bytes).not.toContain("/Subtype /Image");
    // …and the label really is text, not outlined into paths.
    expect(pdfStrings(pdf)).toContain("Room");
  });

  // -------------------------------------------------------------------------
  // Determinism — finding (a) in the header.

  describe("determinism", () => {
    it("the DRAWN page is byte-identical across two renders", async () => {
      const a = await toPdf(scene);
      const b = await toPdf(scene);
      expect(pageOps(a)).toBe(pageOps(b));
      // Non-vacuity: the stream really carries the drawing, not an empty page.
      expect(pageOps(a)).toContain(" re\n");
      expect(pageOps(a).length).toBeGreaterThan(200);
    });

    it("the file differs ONLY inside the two wall-clock container fields", async () => {
      const a = await toPdf(scene);
      const b = await toPdf(scene);
      // Both volatile fields are fixed-width, so the files stay the same size.
      expect(a.length).toBe(b.length);

      const spans = volatileSpans(a);
      expect(
        spans.map(([s, e]) => new TextDecoder("latin1").decode(a.subarray(s, e)).slice(0, 4)),
        "pdfkit no longer writes one `(D:…Z)` CreationDate and one trailer `/ID [<…> <…>]` in the " +
          "shape this suite masks. The mask must be re-derived from the real output before it is " +
          "trusted again — an unmatched pattern would silently stop hiding a real nondeterminism.",
      ).toEqual(["(D:2", "/ID "]);
      expect(volatileSpans(b)).toEqual(spans);

      const differing: number[] = [];
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing.push(i);
      const outside = differing.filter((i) => !spans.some(([s, e]) => i >= s && i < e));
      expect(
        outside.slice(0, 16),
        "toPdf() drifted OUTSIDE the two known wall-clock fields. Everything else — every vector " +
          "op, the xref table and startxref — is required to be byte-stable, so this is a real " +
          "nondeterminism in the PDF backend, not a container artefact to mask away.",
      ).toEqual([]);

      expect(maskVolatile(a)).toBe(maskVolatile(b));
    });

    it("the same source re-resolved from scratch renders the same drawing", async () => {
      // A stronger statement than re-rendering one Scene object: the whole
      // parse → resolve → toScene → toPdf pipeline is reproducible.
      expect(pageOps(await toPdf(sceneOf(RICH)))).toBe(pageOps(await toPdf(sceneOf(RICH))));
    });
  });

  // -------------------------------------------------------------------------
  // Multi-page / `level` fan-out.

  describe("multi-storey", () => {
    it("fans out to one single-page PDF per storey, each carrying ITS OWN drawing", async () => {
      const r = compile(TWO_STOREY, { noCache: true });
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.pages).toHaveLength(2);

      const pages = r.pages!;
      const pdfs = await Promise.all(pages.map((p) => toPdf(p.scene)));

      for (const pdf of pdfs) {
        expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
        // toPdf is one Scene → one page; the fan-out is per FILE, never extra pages.
        expect(new TextDecoder("latin1").decode(pdf)).toContain("/Count 1");
      }

      // Each file is the storey it claims to be — the ground floor twice would pass a
      // "two valid PDFs" check and be exactly the multi-storey bug worth catching.
      for (const [i, page] of pages.entries()) {
        const strings = pdfStrings(pdfs[i]!);
        const label = page.scene.nodes.find((n) => n.prim.t === "text" && n.layer === "labels");
        expect(label, "the storey fixture must draw a room label to identify it by").toBeDefined();
        expect(strings).toContain((label!.prim as { t: "text"; value: string }).value);
        expect(strings).toContain(String(page.level));
      }
      expect(pdfStrings(pdfs[0]!)).toContain("Ground");
      expect(pdfStrings(pdfs[1]!)).toContain("Upper");
      expect(pageOps(pdfs[0]!)).not.toBe(pageOps(pdfs[1]!));
    });
  });

  // -------------------------------------------------------------------------
  // The sheet frame and the title block.

  describe("sheet", () => {
    it("prints a `paper` plan at the TRUE ISO page size, with every title-block row", async () => {
      const s = planOf(SHEET);
      expect(s.sheet, "the sheet fixture must actually declare a paper size").toBeDefined();

      const PT_PER_MM = 72 / 25.4;
      const [w, h] = mediaBox(await toPdf(s));
      expect(w).toBeCloseTo(594 * PT_PER_MM, 1); // A2 landscape
      expect(h).toBeCloseTo(420 * PT_PER_MM, 1);

      // Rows are DERIVED from the Scene's own chrome, never retyped here.
      const rows = s.chrome?.titleBlock?.rows ?? [];
      expect(rows.length, "the sheet fixture must produce a title block to assert about").toBeGreaterThan(0);
      const strings = pdfStrings(await toPdf(s));
      for (const row of rows) {
        expect(strings).toContain(row.k);
        expect(strings).toContain(row.v);
      }
    });

    it("keeps the historical 1 mm = 1 pt page, and no title block, without `paper`", async () => {
      const s = planOf(ROOM);
      expect(s.sheet).toBeUndefined();
      expect(s.chrome?.titleBlock).toBeNull();
      const [w, h] = mediaBox(await toPdf(s));
      expect(w).toBeCloseTo(s.width, 1);
      expect(h).toBeCloseTo(s.height, 1);
    });

    it("recomputes an identical chrome layout for a hand-built Scene that carries none", async () => {
      // `toPdf` and `drawChrome` both fall back to `layoutChrome(...)` when a Scene was
      // assembled by hand rather than by `toScene`. On the historical (no-`paper`) path
      // that fallback lands in exactly the same place as the stored layout.
      const s = planOf(RICH);
      expect(s.sheet).toBeUndefined();
      expect(maskVolatile(await toPdf({ ...s, chrome: undefined }))).toBe(maskVolatile(await toPdf(s)));
    });

    /**
     * KNOWN GAP — the same fallback is WRONG once a sheet exists.
     *
     * `toScene` positions a sheet plan's chrome against the PAGE rectangle, but the
     * `layoutChrome(...)` call both `toPdf` and `drawChrome` fall back to is not given the
     * sheet, so it re-derives the chrome against the drawing BOUNDS — placing the scale bar
     * and title block tens of metres from where they belong. Unreachable today (every Scene
     * `toScene` builds carries `chrome`), so this is a latent trap in a documented
     * hand-built-Scene path, not a shipped bug.
     *
     * **When it is fixed, this test flips** — the two layouts become equal.
     */
    it("KNOWN GAP: the chrome fallback ignores the sheet page and misplaces the chrome", () => {
      const s = planOf(SHEET);
      const stored = s.chrome!;
      const fallback = layoutChrome({
        bounds: s.bounds,
        refDim: s.sizes.refDim,
        baseMargin: s.sizes.margin,
        nodes: s.nodes,
        title: s.title,
        scale: s.scale,
      });
      // Same content, wrong place — which is exactly what makes it easy to miss.
      expect(fallback.titleBlock?.rows).toEqual(stored.titleBlock?.rows);
      expect(
        [fallback.scaleBar.x0, fallback.scaleBar.y0],
        "the chrome fallback now agrees with the stored sheet layout, so the gap is closed. " +
          "Invert this into an equality assertion and drop the KNOWN GAP framing here and in " +
          "this file's header.",
      ).not.toEqual([stored.scaleBar.x0, stored.scaleBar.y0]);
    });
  });

  // -------------------------------------------------------------------------
  // Themes.

  describe("theme", () => {
    it("writes the plan's own theme colours as PDF colour ops", async () => {
      const s = planOf(THEMED);
      const ops = pageOps(await toPdf(s));
      for (const colour of [s.theme.bg, s.theme.roomFill]) {
        expect(ops, `theme colour ${colour} never reached the PDF`).toContain(`${rgbOp(colour)} scn`);
      }
      // …and it is the PLAN's theme, not the default one leaking through.
      const dflt = planOf(ROOM).theme;
      expect(s.theme.bg).not.toBe(dflt.bg);
      expect(ops).not.toContain(`${rgbOp(dflt.bg)} scn`);
    });
  });

  // -------------------------------------------------------------------------
  // Every Scene primitive the backend claims to serialize.

  describe("primitives", () => {
    it("lowers arcs, circles, dashes, mitre limits and square caps to vector ops", async () => {
      const s = planOf(RICH);
      const kinds = new Set(s.nodes.map((n) => n.prim.t));
      // Non-vacuity: assert the FIXTURE exercises the paths before asserting the output.
      for (const k of ["polygon", "line", "region", "arc", "circle", "text"]) {
        expect(kinds, `the rich fixture stopped producing a \`${k}\` primitive`).toContain(k);
      }
      expect(s.nodes.some((n) => n.paint.dash)).toBe(true);
      expect(s.nodes.some((n) => n.paint.miterLimit !== undefined)).toBe(true);
      expect(s.nodes.some((n) => n.paint.linecap === "square")).toBe(true);
      expect(s.nodes.some((n) => n.prim.t === "text" && n.prim.rotate !== undefined)).toBe(true);

      const ops = pageOps(await toPdf(s));
      expect(ops, "no Bezier op — the arc/circle primitives did not reach the page").toMatch(/ c\n/);
      expect(ops, "no dash array — a dashed opening or door leaf was drawn solid").toMatch(/\[[\d.]+ [\d.]+\] 0 d/);
      expect(ops, "no mitre-limit op — an acute wall joint can spike in print").toMatch(/[\d.]+ M\n/);
      expect(ops, "no square line cap").toContain("2 J");
      expect(pdfStrings(await toPdf(s))).toEqual(expect.arrayContaining(["Left", "Drum"]));
    });

    it("rotates the north arrow with the plan's bearing", async () => {
      const drawn = await Promise.all(
        (["up", "down", "left", "right"] as const).map(async (dir) =>
          pageOps(await toPdf(planOf(`plan "N" { north ${dir} room id=r at (0,0) size 4000x3000 label "R" }`))),
        ),
      );
      // Four bearings, four distinct drawings — `northDegrees` is not a no-op.
      expect(new Set(drawn).size).toBe(4);
    });

    /**
     * KNOWN GAP — finding (b) in the header, pinned so it cannot be lost again.
     *
     * `drawNode`'s switch handles polygon/line/region/arc/circle/text but NOT `hatch`,
     * and the `wallFill` layer is a single `hatch` primitive — so every PDF ArchLang has
     * ever exported has hollow walls. `src/export/pdf.ts`'s header promises the opposite
     * ("poché regions fill with the solid poché base colour in PDF"), which also makes
     * `fillColor`'s `url(…) → theme.pocheBase` branch unreachable.
     *
     * **When that is fixed, this test flips**: the poché colour becomes present and the
     * final assertion inverts. It is deliberately non-vacuous — the same formatter is
     * shown to find a colour that IS drawn, so the absence below is real and not a
     * mis-formatted needle.
     */
    it("KNOWN GAP: a poche (hatch) region is DROPPED, not filled with the poche base", async () => {
      const s = planOf(SHEET);
      const hatches = s.nodes.filter((n) => n.prim.t === "hatch");
      expect(hatches.length, "the fixture must contain poche for this to say anything").toBeGreaterThan(0);
      for (const h of hatches) expect(h.paint.fill).toMatch(/^url\(#/);

      const ops = pageOps(await toPdf(s));
      // The needle-finding control: a colour that IS drawn, through the same formatter.
      expect(ops).toContain(`${rgbOp(s.theme.roomFill)} scn`);
      expect(
        ops.includes(`${rgbOp(s.theme.pocheBase)} scn`),
        "The poche base colour now DOES reach the PDF, which means the hatch gap was fixed. " +
          "Good — invert this assertion (and drop the KNOWN GAP framing plus the finding in this " +
          "file's header and in `src/export/pdf.ts`'s).",
      ).toBe(false);
    });
  });
});

describe("PDF export — contract", () => {
  it("the backend is an async function consuming a Scene (not part of compile)", () => {
    expect(typeof toPdf).toBe("function");
    expect(toPdf.constructor.name).toBe("AsyncFunction");
  });
});
