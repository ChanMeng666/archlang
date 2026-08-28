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
 * ## Two shipped defects, now fixed and pinned the other way up
 *
 * **(a) `toPdf` is byte-deterministic** — as of the fix, and it was not before. pdfkit
 * defaults `Info /CreationDate` to `new Date()` (second granularity) and derives the trailer
 * `/ID` as an MD5 over the info dict including that timestamp in MILLISECONDS, so two renders
 * of the same Scene differed. Measured at the time: those were the ONLY two differing fields
 * — every content-stream byte, the whole xref table and `startxref` were already identical.
 * `toPdf` now passes a fixed `info.CreationDate` (the Unix epoch, `(D:19700101000000Z)` — an
 * obvious sentinel, not a plausible-looking date), which makes both fields constant. The two
 * tests below used to be "the drawn page is identical" plus "every differing byte lies inside
 * one of two recognised spans"; **there is no mask any more**, so the honest assertion is
 * whole-file byte identity across two renders separated by a forced wall-clock second — which
 * is precisely what used to fail, and which by construction also catches a NEW variable field
 * (a `ModDate`, a random `/ID`) rather than tolerating it. A second test pins the sentinel
 * literal so a pdfkit upgrade that stopped honouring `info.CreationDate` names itself.
 *
 * **(b) Poché reaches the PDF** — also as of the fix, and it did not before. `drawNode`'s
 * switch handled polygon/line/region/arc/circle/text with no `hatch` case and no `default`,
 * and the `wallFill` layer is exactly one `hatch` primitive, so every PDF this project had
 * ever exported drew hollow walls while the module header of `src/export/pdf.ts` promised the
 * opposite. A `hatch` is the same multi-loop nonzero path a `region` is, so the two now share
 * one `case`, and `fillColor`'s `url(…) → theme.pocheBase` branch — dead code for as long as
 * the gap existed — is what gives it its colour. The characterisation test below is inverted,
 * keeping its shape: the same colour formatter is still shown to find a colour that is drawn,
 * so a passing assertion cannot be a mis-formatted needle that happens to match.
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
 * The whole file as comparable text. There is deliberately no masking helper here any
 * more — see finding (a): the two wall-clock fields this suite used to mask are now
 * constant, so every byte is compared and a NEW variable field cannot hide.
 */
const pdfBytes = (pdf: Uint8Array) => new TextDecoder("latin1").decode(pdf);

/** Busy-wait until the wall clock crosses into the next second (bounded by 1s). */
function crossSecondBoundary(): void {
  const start = Math.floor(Date.now() / 1000);
  while (Math.floor(Date.now() / 1000) === start) {
    /* spin — pdfkit's default CreationDate has second granularity, so this is the
       separation that used to make two renders differ in the Info dict as well as /ID */
  }
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
    it("the WHOLE FILE is byte-identical across two renders, over a wall-clock second", async () => {
      const a = await toPdf(scene);
      // The separation that used to break this: pdfkit's default `Info /CreationDate`
      // has second granularity, so two renders inside one second differed only in the
      // ms-derived trailer `/ID`. Crossing the boundary moves BOTH fields.
      crossSecondBoundary();
      const b = await toPdf(scene);

      expect(a.length).toBe(b.length);
      const differing: number[] = [];
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing.push(i);
      expect(
        differing.slice(0, 16).map((i) => [i, pdfBytes(a).slice(Math.max(0, i - 24), i + 24)]),
        "toPdf() is not byte-reproducible. Every byte — the vector ops, the Info dict, the xref " +
          "table, startxref — must be a pure function of the Scene; `info.CreationDate` is pinned " +
          "to a fixed epoch precisely so no wall-clock value can reach the file. A difference here " +
          "is a real nondeterminism to fix at the source, never a field to start masking.",
      ).toEqual([]);
      expect(pdfBytes(a)).toBe(pdfBytes(b));

      // Non-vacuity: this really is a drawn page, not two identical empty ones.
      expect(pageOps(a)).toContain(" re\n");
      expect(pageOps(a).length).toBeGreaterThan(200);
    });

    it("stamps the fixed sentinel CreationDate, not a wall-clock one", async () => {
      // The identity test above would also pass if pdfkit stopped writing a date at all,
      // so pin the actual value: an obviously-unreal epoch that no reader mistakes for a
      // creation time. This is the assertion that names a pdfkit upgrade which quietly
      // stopped honouring `info.CreationDate`.
      const text = pdfBytes(await toPdf(scene));
      const dates = [...text.matchAll(/\(D:\d{14}Z\)/g)].map((m) => m[0]);
      expect(dates).toEqual(["(D:19700101000000Z)"]);
      // …and nothing else in the container carries a date-shaped field.
      expect(text).not.toContain("/ModDate");
      // Producer/Creator are pdfkit's own constant strings — not a version we vary.
      expect(text).toContain("/Producer");
    });

    it("the same source re-resolved from scratch renders the same FILE", async () => {
      // A stronger statement than re-rendering one Scene object: the whole
      // parse → resolve → toScene → toPdf pipeline is reproducible, bytes included.
      expect(pdfBytes(await toPdf(sceneOf(RICH)))).toBe(pdfBytes(await toPdf(sceneOf(RICH))));
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
      expect(pdfBytes(await toPdf({ ...s, chrome: undefined }))).toBe(pdfBytes(await toPdf(s)));
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
      // `path` where this used to say `region`: RICH's exterior wall carries an `arc`, and
      // since v1.30 a wall set with any curve in it is one `path` outline rather than a
      // straight-edged `region` plus loose per-segment arcs. `region` has not gone away —
      // it is still what an ALL-STRAIGHT plan emits, which the SHEET check below proves,
      // so this backend keeps a witness for both.
      for (const k of ["polygon", "line", "path", "arc", "circle", "text"]) {
        expect(kinds, `the rich fixture stopped producing a \`${k}\` primitive`).toContain(k);
      }
      const straightKinds = new Set(planOf(SHEET).nodes.map((n) => n.prim.t));
      expect(straightKinds, "a rectilinear plan must still lower to a `region`").toContain("region");
      expect(s.nodes.some((n) => n.paint.dash)).toBe(true);
      expect(s.nodes.some((n) => n.paint.miterLimit !== undefined)).toBe(true);
      expect(s.nodes.some((n) => n.prim.t === "text" && n.prim.rotate !== undefined)).toBe(true);
      // The square line CAP moved fixtures in v1.30. It used to ride on the per-segment
      // wall face lines, which had free ends that a round cap would visibly shorten; a
      // joined outline is closed loops, where a cap has nothing to do. The one primitive
      // still asking for it is the opt-in circulation overlay's dashed route, so that is
      // what has to reach the page for `2 J` to be tested at all.
      const capped = toScene(resolve(parse(RICH).plan!).ir, { overlays: ["circulation"] });
      expect(capped.nodes.some((n) => n.paint.linecap === "square")).toBe(true);

      const ops = pageOps(await toPdf(s));
      expect(ops, "no Bezier op — the arc/circle/path primitives did not reach the page").toMatch(/ c\n/);
      expect(ops, "no dash array — a dashed opening or door leaf was drawn solid").toMatch(/\[[\d.]+ [\d.]+\] 0 d/);
      expect(ops, "no mitre-limit op — an acute wall joint can spike in print").toMatch(/[\d.]+ M\n/);
      expect(pageOps(await toPdf(capped)), "no square line cap").toContain("2 J");
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
     * Finding (b) in the header, inverted now that it is fixed.
     *
     * `drawNode`'s switch handled polygon/line/region/arc/circle/text with no `hatch`
     * case and no `default`, and the `wallFill` layer is a single `hatch` primitive — so
     * every PDF ArchLang exported through v1.26.0 had hollow walls, contradicting its own
     * module header, and `fillColor`'s `url(…) → theme.pocheBase` branch was dead code.
     * `hatch` now shares the `region` case and that branch is what colours it.
     *
     * The shape of the old characterisation test is kept deliberately: the same colour
     * formatter is still shown to find a colour that IS drawn, so this cannot pass (or
     * fail) on a mis-formatted needle.
     */
    it("fills a poche (hatch) region with the solid poche base colour", async () => {
      const s = planOf(SHEET);
      const hatches = s.nodes.filter((n) => n.prim.t === "hatch");
      expect(hatches.length, "the fixture must contain poche for this to say anything").toBeGreaterThan(0);
      for (const h of hatches) expect(h.paint.fill).toMatch(/^url\(#/);

      const ops = pageOps(await toPdf(s));
      // The needle-finding control: a colour that IS drawn, through the same formatter.
      expect(ops).toContain(`${rgbOp(s.theme.roomFill)} scn`);
      expect(
        ops.includes(`${rgbOp(s.theme.pocheBase)} scn`),
        "The poche base colour is missing from the PDF again — `drawNode` is dropping the " +
          "`hatch` primitive, so every wall prints as a hollow outline. This is the shipped bug " +
          "fixed in backlog 3.8; do not re-pin it as a known gap.",
      ).toBe(true);
    });

    it("draws the poche region as the same multi-loop nonzero path a `region` gets", async () => {
      // The wall poche and the wall FACE outline are the same loops (`emitRegion` emits a
      // `hatch` on wallFill and a `region` on wallFace from one `loops` array), so the fix
      // must not have invented a second geometry: the fill path and the outline path have
      // the same number of subpaths.
      const s = planOf(SHEET);
      const hatch = s.nodes.find((n) => n.prim.t === "hatch")!;
      const region = s.nodes.find((n) => n.prim.t === "region")!;
      const loops = (hatch.prim as { t: "hatch"; region: unknown[] }).region.length;
      expect(loops).toBe((region.prim as { t: "region"; loops: unknown[] }).loops.length);

      const ops = pageOps(await toPdf(s));
      const poche = `${rgbOp(s.theme.pocheBase)} scn`;
      const at = ops.indexOf(poche);
      // pdfkit builds the path first, then selects the colour and fills — so the poche
      // path is everything between the previous fill op and this colour op.
      const path = ops.slice(ops.lastIndexOf("\nf\n", at) + 3, at);
      expect((path.match(/ m\n/g) ?? []).length, "one moveto per poche loop").toBe(loops);
      // `f`, the NONZERO fill — an even-odd `f*` would punch the wall's own outline out.
      expect(ops.slice(at + poche.length)).toMatch(/^\nf\n/);
    });
  });
});

describe("PDF export — contract", () => {
  it("the backend is an async function consuming a Scene (not part of compile)", () => {
    expect(typeof toPdf).toBe("function");
    expect(toPdf.constructor.name).toBe("AsyncFunction");
  });
});
