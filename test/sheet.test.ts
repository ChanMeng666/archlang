/**
 * The sheet layer (v1.20) — `paper <size> [orientation]` + the OPERATIVE drawing scale.
 *
 * Three things this suite exists to hold down:
 *
 * 1. **The compatibility contract.** A plan with no `paper` must render exactly as it did
 *    before the sheet layer existed. The whole snapshot/golden corpus is the real gate;
 *    here we pin the reference-dimension formulas themselves (deliberately RETYPED, so a
 *    "harmless" edit to `toScene`'s size block fails a test instead of silently
 *    re-scaling every plan ever authored) and assert no sheet, no root width/height.
 * 2. **The arithmetic.** Every paper-mode size is `<sheet mm> × <denominator>`, and the
 *    fit rule / auto-fit are closed-form functions of the outer-face extent.
 * 3. **One answer, everywhere.** `resolve()` picks the operative scale once, so
 *    `describe().sheet`, the title block and the diagnostics can never disagree.
 */

import { describe as suite, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compile, describe as describePlan, toScene } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { format } from "../src/format.js";
import { toPdf } from "../src/export/pdf.js";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { chromeBandDepth } from "../src/chrome-layout.js";
import {
  AUTO_SCALE_DENOMINATORS,
  chooseScaleDenominator,
  DIM_BAND_MM,
  fitsOnSheet,
  PAPER_MM,
  PAPER_ORIENTATIONS,
  PAPER_SIZES,
  paperMm,
  resolveSheetSpec,
  scaleDenominator,
  SHEET_MM,
  sizesFromPaper,
  usablePlanMm,
} from "../src/sheet.js";

const MUSEUM = readFileSync("examples/museum.arch", "utf8");

/** A small plan, optionally on a sheet. Extent is 8000 × 6000 on centerlines. */
function plan(settings: string): string {
  return `plan "P" {
  units mm
  ${settings}
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r at (0,0) size 8000x6000 label "Room" uses hall
  door on shell at 40% width 900
}`;
}

const sceneOf = (src: string) => toScene(resolve(parse(src).plan!).ir);

// ---------------------------------------------------------------------------
// 1. the compatibility contract
// ---------------------------------------------------------------------------

suite("sheet — no `paper` is byte-for-byte the historical path", () => {
  it("leaves the Scene sheet-less and the SVG root size-less", () => {
    const r = compile(plan("scale 1:50"), { noCache: true });
    expect(r.errors).toEqual([]);
    expect(r.scene!.sheet).toBeUndefined();
    // The historical root: no width/height, just the viewBox (and the double space
    // where the empty attribute slot sits — part of the byte-identical output).
    expect(r.svg).toContain('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox=');
    expect(r.svg.split("\n")[0]!).not.toContain("width=");
  });

  it("keeps the reference-dimension size formulas exactly (pinned, retyped on purpose)", () => {
    const scene = sceneOf(plan("scale 1:50"));
    const b = scene.bounds;
    const refDim = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
    expect(scene.sizes).toEqual({
      refDim,
      wallStroke: refDim * 0.0028,
      thin: refDim * 0.0016,
      roomFont: refDim * 0.03,
      areaFont: refDim * 0.022,
      dimFont: refDim * 0.02,
      furnFont: refDim * 0.017,
      margin: refDim * 0.17,
      hatchGap: refDim * 0.013,
    });
  });

  it("`scale` alone stays annotation-only: it changes nothing but the title block", () => {
    const withScale = compile(plan("scale 1:50"), { noCache: true });
    const noScale = compile(plan(""), { noCache: true });
    expect(withScale.scene!.sizes).toEqual(noScale.scene!.sizes);
    expect(withScale.scene!.width).toBe(noScale.scene!.width);
    // …and the drawing is untouched: the only delta is the SCALE row.
    expect(withScale.svg).toContain("1:50");
    expect(noScale.svg).not.toContain("1:50");
  });

  it("no plan-level `paper` means describe() emits no `sheet` key at all", () => {
    const d = describePlan(plan("scale 1:50"));
    expect(d.sheet).toBeUndefined();
    expect("sheet" in d).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. the arithmetic
// ---------------------------------------------------------------------------

suite("sheet — the ISO 216 table", () => {
  it("is portrait short × long, halving down the series", () => {
    expect(PAPER_MM.A0).toEqual({ w: 841, h: 1189 });
    for (let i = 0; i + 1 < PAPER_SIZES.length; i++) {
      const bigger = PAPER_MM[PAPER_SIZES[i + 1]!];
      const smaller = PAPER_MM[PAPER_SIZES[i]!];
      // Each step down halves the long edge onto the short edge (±1 mm rounding).
      expect(Math.abs(bigger.w - smaller.h)).toBeLessThanOrEqual(1);
    }
  });

  it("applies the orientation (landscape is the default and is wider than tall)", () => {
    expect(paperMm("A1", "landscape")).toEqual({ w: 841, h: 594 });
    expect(paperMm("A1", "portrait")).toEqual({ w: 594, h: 841 });
    for (const s of PAPER_SIZES) {
      const l = paperMm(s, "landscape");
      expect(l.w).toBeGreaterThan(l.h);
    }
  });

  it("is the same vocabulary the grammar highlights (tokens.ts drift guard)", () => {
    for (const s of PAPER_SIZES) expect(KEYWORDS.enum as readonly string[]).toContain(s);
    for (const o of PAPER_ORIENTATIONS) expect(KEYWORDS.enum as readonly string[]).toContain(o);
    expect(KEYWORDS.attribute as readonly string[]).toContain("paper");
  });
});

suite("sheet — sizesFromPaper is <sheet mm> × <denominator>", () => {
  it("scales every constant by the denominator", () => {
    for (const denom of [50, 100, 200]) {
      const sheet = resolveSheetSpec({ size: "A1", orientation: "landscape" }, `1:${denom}`, {
        extent: { w: 1000, h: 1000 },
        autoDims: false,
        titleRows: 0,
      });
      const s = sizesFromPaper(sheet, 1);
      expect(s.roomFont).toBe(SHEET_MM.roomLabel * denom);
      expect(s.areaFont).toBe(SHEET_MM.areaText * denom);
      expect(s.dimFont).toBe(SHEET_MM.dimText * denom);
      expect(s.furnFont).toBe(SHEET_MM.furnLabel * denom);
      expect(s.wallStroke).toBe(SHEET_MM.heavy * denom);
      expect(s.thin).toBe(SHEET_MM.thin * denom);
      expect(s.hatchGap).toBe(SHEET_MM.hatchGap * denom);
      expect(s.margin).toBe(SHEET_MM.margin * denom);
      // refDim is 100 mm of sheet — what turns the chrome/tick fractions into mm.
      expect(s.refDim).toBe(SHEET_MM.ref * denom);
    }
  });

  it("applies the theme pen multiplier to strokes only, never to type", () => {
    const sheet = resolveSheetSpec({ size: "A3", orientation: "landscape" }, "1:100", {
      extent: { w: 1000, h: 1000 },
      autoDims: false,
      titleRows: 0,
    });
    const a = sizesFromPaper(sheet, 1);
    const b = sizesFromPaper(sheet, 2);
    expect(b.wallStroke).toBe(a.wallStroke * 2);
    expect(b.thin).toBe(a.thin * 2);
    expect(b.roomFont).toBe(a.roomFont);
    expect(b.margin).toBe(a.margin);
  });

  it("a 100 m building and a 7 m building get the SAME ink at their own scales", () => {
    const big = sceneOf(plan("paper A1\n  scale 1:200"));
    const small = sceneOf(plan("paper A4\n  scale 1:50"));
    expect(big.sizes.roomFont / big.sheet!.denom).toBe(small.sizes.roomFont / small.sheet!.denom);
    expect(big.sizes.roomFont / big.sheet!.denom).toBe(SHEET_MM.roomLabel);
  });
});

suite("sheet — the fit rule", () => {
  const input = { extent: { w: 0, h: 0 }, autoDims: false, titleRows: 0 };

  it("is the paper minus margins (and the dim band, when `dims auto` is on)", () => {
    const bare = usablePlanMm(841, 594, 100, { autoDims: false, titleRows: 0 });
    expect(bare.w).toBe((841 - 2 * SHEET_MM.margin) * 100);
    const dimmed = usablePlanMm(841, 594, 100, { autoDims: true, titleRows: 0 });
    expect(dimmed.w).toBe((841 - 2 * (SHEET_MM.margin + DIM_BAND_MM)) * 100);
    expect(dimmed.w).toBeLessThan(bare.w);
  });

  it("reserves the bottom chrome band from the height only", () => {
    const u = usablePlanMm(841, 594, 1, { autoDims: false, titleRows: 4 });
    expect(u.w).toBe(841 - 2 * SHEET_MM.margin);
    expect(u.h).toBe(594 - 2 * SHEET_MM.margin - chromeBandDepth(SHEET_MM.ref, 4));
  });

  it("more title rows shrink the usable height", () => {
    const few = usablePlanMm(841, 594, 1, { autoDims: false, titleRows: 1 });
    const many = usablePlanMm(841, 594, 1, { autoDims: false, titleRows: 6 });
    expect(many.h).toBeLessThan(few.h);
  });

  it("accepts a building exactly at the limit and rejects one past it", () => {
    const u = usablePlanMm(841, 594, 200, { autoDims: true, titleRows: 4 });
    expect(fitsOnSheet(841, 594, 200, { ...input, extent: u, autoDims: true, titleRows: 4 })).toBe(true);
    expect(fitsOnSheet(841, 594, 200, { ...input, extent: { w: u.w + 1, h: u.h }, autoDims: true, titleRows: 4 })).toBe(
      false,
    );
    expect(fitsOnSheet(841, 594, 200, { ...input, extent: { w: u.w, h: u.h + 1 }, autoDims: true, titleRows: 4 })).toBe(
      false,
    );
  });

  it("never returns a negative usable area for a sheet smaller than its own bands", () => {
    const u = usablePlanMm(10, 10, 100, { autoDims: true, titleRows: 4 });
    expect(u.w).toBe(0);
    expect(u.h).toBe(0);
  });
});

suite("sheet — auto-fit picks the finest scale that fits", () => {
  const at = (extent: { w: number; h: number }, size = "A1" as const) => {
    const p = paperMm(size, "landscape");
    return chooseScaleDenominator(p.w, p.h, { extent, autoDims: true, titleRows: 4 });
  };

  it("candidates are the four nice denominators, finest first", () => {
    expect([...AUTO_SCALE_DENOMINATORS]).toEqual([50, 100, 200, 500]);
  });

  it("picks 1:50 for a small building", () => {
    expect(at({ w: 8000, h: 6000 })).toEqual({ denom: 50, fits: true });
  });

  it("picks 1:100 — not 1:200 — for a building that fits at 100", () => {
    // Just past the 1:50 usable width, comfortably inside the 1:100 one.
    const u50 = usablePlanMm(841, 594, 50, { autoDims: true, titleRows: 4 });
    expect(at({ w: u50.w + 1000, h: 6000 })).toEqual({ denom: 100, fits: true });
  });

  it("steps out to 1:200 and 1:500 as the building grows", () => {
    const u100 = usablePlanMm(841, 594, 100, { autoDims: true, titleRows: 4 });
    expect(at({ w: u100.w + 1000, h: 6000 }).denom).toBe(200);
    const u200 = usablePlanMm(841, 594, 200, { autoDims: true, titleRows: 4 });
    expect(at({ w: u200.w + 1000, h: 6000 }).denom).toBe(500);
  });

  it("keeps the coarsest candidate and reports `fits: false` when nothing fits", () => {
    expect(at({ w: 5_000_000, h: 5_000_000 })).toEqual({ denom: 500, fits: false });
  });

  it("reads the denominator out of `<a>:<b>`, and rejects nonsense", () => {
    expect(scaleDenominator("1:50")).toBe(50);
    expect(scaleDenominator("2:100")).toBe(50);
    expect(scaleDenominator(undefined)).toBeNull();
    expect(scaleDenominator("1:0")).toBeNull();
    expect(scaleDenominator("half")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. one answer, everywhere
// ---------------------------------------------------------------------------

suite("sheet — parsing and formatting", () => {
  it("defaults the orientation to landscape (floor plans are wide)", () => {
    const p = parse(plan("paper A2")).plan!;
    expect(p.paper).toEqual({ size: "A2", orientation: "landscape" });
  });

  it("accepts an explicit orientation", () => {
    expect(parse(plan("paper A0 portrait")).plan!.paper).toEqual({ size: "A0", orientation: "portrait" });
  });

  it("rejects an unknown paper size with a catalogued parse error", () => {
    const r = compile(plan("paper A9"), { noCache: true });
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]!.message).toContain("Unknown paper size");
  });

  it("round-trips through the formatter, orientation always spelled out", () => {
    const src = plan("paper A2 portrait\n  scale 1:100");
    const once = format(src);
    expect(once).toContain("paper A2 portrait");
    expect(format(once)).toBe(once); // idempotent
    expect(parse(once).plan!.paper).toEqual({ size: "A2", orientation: "portrait" });
  });

  it("formats a bare `paper A2` with its defaulted orientation", () => {
    expect(format(plan("paper A2"))).toContain("paper A2 landscape");
  });
});

suite("sheet — describe() reports it (append-only)", () => {
  it("carries the declared paper, orientation and operative denominator", () => {
    const d = describePlan(plan("paper A3 portrait\n  scale 1:100"));
    expect(d.sheet).toEqual({
      paper: "A3",
      orientation: "portrait",
      scale_denominator: 100,
      scale_auto: false,
      fits: true,
    });
    expect(d.scale).toBe("1:100");
  });

  it("marks an auto-fitted scale and stamps it into `scale`", () => {
    const d = describePlan(plan("paper A4"));
    expect(d.sheet!.scale_auto).toBe(true);
    expect(d.scale).toBe(`1:${d.sheet!.scale_denominator}`);
  });

  it("is selectable through `describe --select` (DESCRIBE_KEYS drift)", async () => {
    const { DESCRIBE_KEYS } = await import("../src/cli/commands-analyze.js");
    expect(DESCRIBE_KEYS).toContain("sheet");
  });
});

suite("sheet — W_SCALE_OVERFLOW", () => {
  it("warns (and never errors) when the declared scale does not fit", () => {
    // 8 × 6 m at 1:1 needs 8 m of paper.
    const r = compile(plan("paper A4\n  scale 1:1"), { noCache: true });
    expect(r.errors).toEqual([]);
    const w = r.diagnostics.filter((d) => d.code === "W_SCALE_OVERFLOW");
    expect(w.length).toBe(1);
    expect(w[0]!.severity).toBe("warning");
    expect(w[0]!.message).toContain("A4");
    expect(r.svg).not.toBe(""); // rendered anyway
  });

  it("points at the `scale` statement it is about", () => {
    const src = plan("paper A4\n  scale 1:1");
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_SCALE_OVERFLOW")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe("scale 1:1");
  });

  it("never fires when the plan fits, and never without a `paper`", () => {
    const fine = compile(plan("paper A2\n  scale 1:100"), { noCache: true });
    expect(fine.diagnostics.filter((d) => d.code === "W_SCALE_OVERFLOW")).toEqual([]);
    const bare = compile(plan("scale 1:1"), { noCache: true });
    expect(bare.diagnostics.filter((d) => d.code === "W_SCALE_OVERFLOW")).toEqual([]);
  });

  it("never fires on an auto-fitted plan that the candidates can serve", () => {
    const r = compile(plan("paper A4"), { noCache: true });
    expect(r.diagnostics.filter((d) => d.code === "W_SCALE_OVERFLOW")).toEqual([]);
  });

  it("grows the page instead of clipping, and says so", () => {
    const scene = sceneOf(plan("paper A4\n  scale 1:1"));
    expect(scene.sheet!.fits).toBe(false);
    expect(scene.sheet!.grown).toBe(true);
    // Every drawn primitive stays inside the page.
    const p = scene.sheet!.page;
    expect(scene.bounds.minX).toBeGreaterThanOrEqual(p.x);
    expect(scene.bounds.maxX).toBeLessThanOrEqual(p.x + p.w);
    expect(scene.bounds.minY).toBeGreaterThanOrEqual(p.y);
    expect(scene.bounds.maxY).toBeLessThanOrEqual(p.y + p.h);
  });
});

suite("sheet — the page", () => {
  it("is the paper × the denominator, in plan mm", () => {
    const scene = sceneOf(plan("paper A1\n  scale 1:200"));
    expect(scene.sheet!.page.w).toBe(841 * 200);
    expect(scene.sheet!.page.h).toBe(594 * 200);
    expect(scene.width).toBe(scene.sheet!.page.w);
    expect(scene.height).toBe(scene.sheet!.page.h);
    expect(scene.sheet!.grown).toBe(false);
  });

  it("centres the drawing on the sheet", () => {
    const scene = sceneOf(plan("paper A1\n  scale 1:200"));
    const p = scene.sheet!.page;
    const b = scene.bounds;
    const leftGap = (b.minX - p.x) / (p.x + p.w - b.maxX);
    // The drawing itself is centred to within the asymmetry the grown margins add.
    expect(leftGap).toBeGreaterThan(0.8);
    expect(leftGap).toBeLessThan(1.25);
  });

  it("puts the chrome in the sheet's own corners when there is room for it", () => {
    const scene = sceneOf(plan("paper A1\n  scale 1:200"));
    const p = scene.sheet!.page;
    const tb = scene.chrome!.titleBlock!;
    expect(tb.x0 + tb.w).toBeCloseTo(p.x + p.w - scene.sizes.margin, 6);
    expect(scene.chrome!.scaleBar.x0).toBeCloseTo(p.x + scene.sizes.margin, 6);
    // …below the drawing, never on top of it.
    expect(tb.y0).toBeGreaterThan(scene.bounds.maxY);
    expect(tb.y0 + tb.h).toBeLessThanOrEqual(p.y + p.h);
  });

  it("keeps the chrome beside the drawing when the sheet is too tight to re-anchor", () => {
    const scene = sceneOf(plan("paper A4\n  scale 1:1"));
    const p = scene.sheet!.page;
    // Overflowed: the corner band is not clear, so the layout is the classic one —
    // scale bar at the drawing's left edge, title block at its right edge.
    expect(scene.chrome!.scaleBar.x0).toBe(scene.bounds.minX);
    expect(scene.chrome!.titleBlock!.x0).toBe(scene.bounds.maxX - scene.chrome!.titleBlock!.w);
    expect(p.w).toBeGreaterThan(297); // grown past the A4 landscape width
  });
});

suite("sheet — the SVG root carries the true paper size", () => {
  it("emits width/height in millimetres so the file prints at its scale", () => {
    const r = compile(plan("paper A1\n  scale 1:200"), { noCache: true });
    expect(r.svg).toContain('width="841mm" height="594mm"');
    expect(r.svg).toContain('viewBox="-');
  });

  it("uses the portrait dimensions when asked", () => {
    const r = compile(plan("paper A3 portrait\n  scale 1:100"), { noCache: true });
    expect(r.svg).toContain('width="297mm" height="420mm"');
  });

  it("lets an explicit pixel width win (an embedder's box)", () => {
    const r = compile(plan("paper A1\n  scale 1:200"), { noCache: true, width: 800 });
    expect(r.svg).toContain('width="800"');
    expect(r.svg).not.toContain("mm");
  });

  it("the viewBox is the page rectangle", () => {
    const r = compile(plan("paper A1\n  scale 1:200"), { noCache: true });
    const p = r.scene!.sheet!.page;
    expect(r.svg).toContain(`viewBox="${p.x} ${p.y} ${p.w} ${p.h}"`);
  });
});

/**
 * `pdfkit` is an `optionalDependency`. This block used to be `suite.skipIf(!pdfAvailable)`,
 * which is not vacuous — vitest reports a skip — but does not FAIL in CI either, so an
 * install that quietly stopped pulling `optionalDependencies` would silently stop checking
 * that a `paper` plan prints at its true ISO size, in a PUBLISHED output format, with
 * nothing going red. `skipIf` has nowhere to hang the CI throw, so the gate takes the
 * `if (!HAS) { … return; }` shape `test/png.test.ts` and `test/export-pdf.test.ts` use, and
 * `docs/testing.md` §3 states: REQUIRED in CI, a VISIBLE named skip locally.
 */
const HAS_PDFKIT = await (async () => {
  try {
    await import("pdfkit" as string);
    return true;
  } catch {
    return false;
  }
})();
const PDFKIT_REQUIRED = !!process.env.CI;

suite("sheet — the PDF page is the true ISO size", () => {
  if (!HAS_PDFKIT) {
    const gate = "optional dep pdfkit is installed";
    if (PDFKIT_REQUIRED) {
      it(gate, () => {
        throw new Error(
          "optional dep pdfkit missing in CI — install step is broken. The sheet layer's PDF " +
            "page-size contract was NOT exercised: nothing checked that `paper A1` prints a true " +
            "841x594 mm MediaBox, or that a plan with no `paper` keeps the historical 1 mm = 1 pt " +
            "page. Check that the install step still pulls optionalDependencies (npm ci without " +
            "--omit=optional).",
        );
      });
    } else {
      // Visible in the reporter as a skip, with the reason in the name.
      it.skip(`${gate} (absent locally — the PDF page size is not exercised)`, () => {});
    }
    return;
  }

  const PT_PER_MM = 72 / 25.4;
  /** `/MediaBox [0 0 w h]` of the first page. */
  function mediaBox(pdf: Uint8Array): [number, number] {
    const m = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(new TextDecoder("latin1").decode(pdf));
    if (!m) throw new Error("no MediaBox in the PDF");
    return [Number(m[1]), Number(m[2])];
  }

  it("is A1 landscape in points when the plan declares it", async () => {
    const [w, h] = mediaBox(await toPdf(sceneOf(plan("paper A1\n  scale 1:200"))));
    expect(w).toBeCloseTo(841 * PT_PER_MM, 1);
    expect(h).toBeCloseTo(594 * PT_PER_MM, 1);
  });

  it("keeps the historical 1 mm = 1 pt page for a plan with no `paper`", async () => {
    const scene = sceneOf(plan("scale 1:200"));
    const [w, h] = mediaBox(await toPdf(scene));
    expect(w).toBeCloseTo(scene.width, 1);
    expect(h).toBeCloseTo(scene.height, 1);
  });
});

suite("sheet — determinism", () => {
  it("compiles byte-identically twice", () => {
    const a = compile(plan("paper A1\n  scale 1:200"), { noCache: true }).svg;
    const b = compile(plan("paper A1\n  scale 1:200"), { noCache: true }).svg;
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(500);
  });

  it("is unaffected by a registered geometry backend", () => {
    const src = plan("paper A1\n  scale 1:200");
    const bare = compile(src, { noCache: true }).svg;
    // The rectilinear default and an explicitly-null backend must agree; the wider
    // engine-present/absent equality is covered by the determinism suite.
    expect(compile(src, { noCache: true, backend: undefined }).svg).toBe(bare);
  });
});

// ---------------------------------------------------------------------------
// the flagship
// ---------------------------------------------------------------------------

suite("examples/museum.arch — the large-building flagship", () => {
  it("compiles clean (no errors, no warnings)", () => {
    const r = compile(MUSEUM, { noCache: true });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.svg).not.toBe("");
  });

  it("is a ~100 × 60 m, 14-room, 6000 m² building", () => {
    const d = describePlan(MUSEUM);
    expect(d.ok).toBe(true);
    expect(d.diagnostics).toEqual([]);
    expect(d.bbox).toEqual({ w: 100000, h: 60000 });
    expect(d.bbox_outer).toEqual({ w: 100300, h: 60300 });
    expect(d.totals).toEqual({ rooms: 14, doors: 7, windows: 9, floor_area_m2: 6000 });
    expect(d.access.hasEntrance).toBe(true);
    expect(d.access.rooms.filter((r) => !r.reachable)).toEqual([]);
  });

  it("is issued on A1 landscape at 1:200, and it fits", () => {
    const d = describePlan(MUSEUM);
    expect(d.sheet).toEqual({
      paper: "A1",
      orientation: "landscape",
      scale_denominator: 200,
      scale_auto: false,
      fits: true,
    });
  });

  it("auto-fit would pick the same 1:200 — and 1:100 on the next sheet up", () => {
    const ext = { w: 100300, h: 60300 };
    const input = { extent: ext, autoDims: true, titleRows: 4 };
    const a1 = paperMm("A1", "landscape");
    expect(chooseScaleDenominator(a1.w, a1.h, input)).toEqual({ denom: 200, fits: true });
    const a0 = paperMm("A0", "landscape");
    expect(chooseScaleDenominator(a0.w, a0.h, input)).toEqual({ denom: 100, fits: true });
  });

  it("draws 3.5 mm room labels on the sheet, not metre-tall ones", () => {
    const scene = sceneOf(MUSEUM);
    expect(scene.sizes.roomFont).toBe(SHEET_MM.roomLabel * 200);
    // What the same plan would have got from the drawing's own reference dimension:
    // a 3 m label. That is the bug this example exists to demonstrate.
    expect(Math.max(scene.bounds.maxX - scene.bounds.minX, 1) * 0.03).toBeGreaterThan(2500);
  });

  it("never grows past its sheet", () => {
    const scene = sceneOf(MUSEUM);
    expect(scene.sheet!.grown).toBe(false);
    expect(scene.width).toBe(841 * 200);
  });
});
