/**
 * `sheet.drawing_fits` and `W_DRAWING_OVERFLOW` — backlog 4.9.
 *
 * ## The defect
 *
 * `resolveSheetSpec` → `fitsOnSheet` → `usablePlanMm` decided whether a drawing fits its
 * declared `paper` from **the building's outer-face extent**. Since v1.29 a plan draws a
 * `roof` eaves line and since v1.31 `outdoor` ground, a `fence` and a `site … boundary` —
 * none of it in that extent, so none of it could make the fit test say no. A 4 × 3 m
 * cottage with a 40 m yard reported `sheet.fits === true` and was issued on a page 46,600
 * plan mm tall against a paper height of 29,700 — 57% over, with **no diagnostic of any
 * kind**. That is the v1.27.0 `tableRows` defect's shape (a band the layout draws and the
 * rule does not reserve) one layer out.
 *
 * ## What is reported, and what is deliberately NOT claimed
 *
 * `fits` stays the building-vs-paper claim it has always been — auto-fit chooses a
 * denominator against it and `W_SCALE_OVERFLOW` reports it — and the residual is reported
 * beside it rather than folded into it. Widening `fits` would move which denominator
 * auto-fit picks on every site plan and raise `W_SCALE_OVERFLOW` on drawings that are
 * perfectly issuable today, which is a false-positive generator. Reporting the residual is
 * the move `circulation.unmeasured[]` made for G.5.
 *
 * **The signal is `drawingFits`, and it is NOT "the page grew".** That distinction is the
 * whole reason this file names what it names. The measured page fact needs a laid-out
 * Scene (`SceneSheet.grown`), and `describe()` never builds one — so the closed-form
 * residual is the same `fitsOnSheet` rule on a wider extent, measured against the drawing
 * area the sheet RESERVES. That is conservative: a marginal overrun eats the reserved
 * margin instead of growing the page. Measured over the shipped corpus, three plans report
 * `drawing_fits: false` and only ONE of them is actually issued on a bigger page. The
 * `does not claim the page grew` suite below pins both halves of that, so nobody renames
 * this to `grown` on the strength of the one case where it happens to coincide.
 */

import { describe as suite, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { compile, describe as describePlan } from "../src/index.js";
import type { World } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");

/** A Node-fs World for import resolution, mirroring the CLI's `makeNodeWorld`. */
function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

/** The backlog entry's own reproduction, verbatim. */
const REPRO = `plan "g" { units mm paper A4 portrait scale 1:100
  wall id=s exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "R" uses living
  outdoor id=y lawn at (0,3500) size 4000x40000 label "Yard"
}`;

/** The same plan with the yard cut back to something the sheet can hold. */
const REPRO_OK = REPRO.replace("size 4000x40000", "size 4000x4000");

const codesOf = (src: string, world?: World): string[] =>
  compile(src, { noCache: true, ...(world ? { world } : {}) }).diagnostics.map((d) => d.code ?? "");

suite("4.9 — the reproduction", () => {
  it("raises W_DRAWING_OVERFLOW where nothing was raised before", () => {
    const r = compile(REPRO, { noCache: true });
    expect(r.errors).toEqual([]);
    const w = r.diagnostics.filter((d) => d.code === "W_DRAWING_OVERFLOW");
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warning");
    // The building really does fit: this is the residual, not a re-statement of the fit test.
    expect(r.diagnostics.filter((d) => d.code === "W_SCALE_OVERFLOW")).toEqual([]);
    expect(r.scene!.sheet!.fits).toBe(true);
  });

  it("the page really is 46600 × the A4 it declares (the bytes, not the rule's say-so)", () => {
    const sheet = compile(REPRO, { noCache: true }).scene!.sheet!;
    expect(sheet.widthMm * sheet.denom).toBe(21_000);
    expect(sheet.heightMm * sheet.denom).toBe(29_700);
    expect(sheet.page.w).toBe(21_000);
    expect(sheet.page.h).toBe(46_600);
    // 46600 / 29700 - 1 = 0.5690…
    expect(sheet.page.h / (sheet.heightMm * sheet.denom) - 1).toBeCloseTo(0.569, 3);
  });

  it("states the paper, the drawing, and the overflow on each axis", () => {
    const m = compile(REPRO, { noCache: true }).diagnostics.find((d) => d.code === "W_DRAWING_OVERFLOW")!.message;
    expect(m).toContain("A4 portrait");
    expect(m).toContain("1:100");
    // The drawn extent: the shell's outer faces (-100 … 4100) unioned with the yard
    // (0 … 43500), i.e. 4200 × 43600. Measured from the source coordinates, not quoted
    // back from the implementation.
    expect(m).toContain("4200×43600");
    expect(m).toContain("of drawing area");
    expect(m).toMatch(/over by none across and \d+ mm down/);
  });

  it("points at the `paper` statement it is about", () => {
    const d = compile(REPRO, { noCache: true }).diagnostics.find((x) => x.code === "W_DRAWING_OVERFLOW")!;
    expect(REPRO.slice(d.span!.start, d.span!.end)).toBe("paper A4 portrait");
  });

  it("carries no machine-applicable fix — every remedy rewrites an authored decision", () => {
    const d = compile(REPRO, { noCache: true }).diagnostics.find((x) => x.code === "W_DRAWING_OVERFLOW")!;
    expect(d.fixes ?? []).toEqual([]);
  });

  it("stands down when the same plan's ground is small enough", () => {
    expect(codesOf(REPRO_OK)).toEqual([]);
    expect(describePlan(REPRO_OK).sheet!.fits).toBe(true);
    expect(describePlan(REPRO_OK).sheet).not.toHaveProperty("drawing_fits");
  });
});

suite("4.9 — describe().sheet.drawing_fits", () => {
  it("is present and false exactly when the whole drawing does not fit", () => {
    expect(describePlan(REPRO).sheet!.drawing_fits).toBe(false);
    expect(describePlan(REPRO_OK).sheet!.drawing_fits).toBeUndefined();
  });

  it("is CONDITIONAL, so a sheet whose drawing fits describes exactly as before the key existed", () => {
    // The byte-identity law for a new key: a plan that does not exercise it must describe
    // byte-for-byte as it did. An always-present boolean would have moved every payload of
    // every plan that declares `paper`.
    const keys = Object.keys(describePlan(REPRO_OK).sheet!);
    expect(keys).toEqual(["paper", "orientation", "scale_denominator", "scale_auto", "fits"]);
    expect(Object.keys(describePlan(REPRO).sheet!)).toEqual([...keys, "drawing_fits"]);
  });

  it("agrees with the diagnostic on every shipped example", () => {
    for (const [name, src, world] of shippedExamples()) {
      const d = describePlan(src, { world });
      if (!d.sheet) continue;
      const raised = codesOf(src, world).includes("W_DRAWING_OVERFLOW");
      const reported = d.sheet.drawing_fits === false;
      // Not equality: the warning stands down when `W_SCALE_OVERFLOW` already covers the
      // plan, so `raised` implies `reported` and not the reverse.
      expect(raised && !reported, `${name}: warned without reporting`).toBe(false);
    }
  });
});

suite("4.9 — the two warnings are mutually exclusive, and `fits` did not move", () => {
  /** A building far too big for its own sheet: the `W_SCALE_OVERFLOW` condition. */
  const TOO_BIG = `plan "g" { units mm paper A4 portrait scale 1:1
  wall id=s exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r at (0,0) size 8000x6000 label "R" uses living
  outdoor id=y lawn at (0,7000) size 8000x40000 label "Yard"
}`;

  it("a building that overflows gets W_SCALE_OVERFLOW and NOT the new one", () => {
    const codes = codesOf(TOO_BIG);
    expect(codes.filter((c) => c === "W_SCALE_OVERFLOW")).toHaveLength(1);
    expect(codes.filter((c) => c === "W_DRAWING_OVERFLOW")).toHaveLength(0);
  });

  it("…but `drawing_fits` is still reported false there — the fact is not suppressed", () => {
    // The warning is suppressed to avoid repeating W_SCALE_OVERFLOW; the FACT is not, so a
    // consumer reading `describe --json` sees the same thing either way.
    expect(describePlan(TOO_BIG).sheet!.drawing_fits).toBe(false);
    expect(describePlan(TOO_BIG).sheet!.fits).toBe(false);
  });

  it("`fits === false` implies `drawing_fits === false`, over the whole shipped corpus", () => {
    // Not a coincidence: the drawn extent CONTAINS the building extent by construction,
    // measured by the same `fitsOnSheet` rule. This is what makes the suppression above
    // safe — there is no plan the building fails and the drawing passes.
    let checked = 0;
    for (const [name, src, world] of shippedExamples()) {
      const s = describePlan(src, { world }).sheet;
      if (!s) continue;
      checked++;
      if (s.fits === false) expect(s.drawing_fits, `${name}`).toBe(false);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("ground never moves the denominator auto-fit picks (this is option (b), not (a))", () => {
    // The reason the residual is reported rather than folded into `fits`: feeding ground
    // into the fit extent would re-scale every site plan. Same building, same sheet, a
    // yard added — the chosen denominator must not budge.
    const body = `plan "g" { units mm paper A3 landscape
  wall id=s exterior thickness 200 { (0,0) (12000,0) (12000,8000) (0,8000) close }
  room id=r at (0,0) size 12000x8000 label "R" uses living
`;
    const bare = `${body}}`;
    const withGround = `${body}  outdoor id=y lawn at (0,9000) size 12000x30000 label "Yard"
}`;
    const a = describePlan(bare).sheet!;
    const b = describePlan(withGround).sheet!;
    expect(a.scale_auto).toBe(true);
    expect(b.scale_auto).toBe(true);
    expect(b.scale_denominator).toBe(a.scale_denominator);
    expect(b.fits).toBe(a.fits);
    // …and the residual is what carries the new information instead.
    expect(a.drawing_fits).toBeUndefined();
    expect(b.drawing_fits).toBe(false);
  });
});

suite("4.9 — it does not claim the page grew, and the corpus proves it", () => {
  /**
   * The pin that stops this being renamed `grown`.
   *
   * `courtyard-house` raises the warning — its `roof overhang 600` puts the eaves at
   * 17500 × 13000 against 35350 × 12910 mm of drawing area, 90 mm over — and its page comes
   * out **exactly A3**, because the 15 mm reserved sheet margin absorbs it. Only
   * `garden-house`, whose 22 × 22 m lot line overruns by 4050 mm, is issued larger.
   */
  it("courtyard-house warns AND is issued exactly paper-sized", () => {
    const [, src, world] = exampleNamed("courtyard-house");
    expect(codesOf(src, world)).toContain("W_DRAWING_OVERFLOW");
    const sheet = compile(src, { world, noCache: true }).scene!.sheet!;
    expect(sheet.page.w).toBe(sheet.widthMm * sheet.denom);
    expect(sheet.page.h).toBe(sheet.heightMm * sheet.denom);
    expect(sheet.grown).toBe(false);
  });

  it("garden-house warns AND is issued about 1% taller than its A2", () => {
    const [, src, world] = exampleNamed("garden-house");
    expect(codesOf(src, world)).toContain("W_DRAWING_OVERFLOW");
    const sheet = compile(src, { world, noCache: true }).scene!.sheet!;
    expect(sheet.grown).toBe(true);
    expect(sheet.page.h / (sheet.heightMm * sheet.denom) - 1).toBeCloseTo(0.0101, 4);
  });

  it("exactly these shipped examples report the residual", () => {
    // A corpus gate, not a constant: re-measure it when an example's ground, eaves or
    // sheet changes, and say which and why. `materials` is the `fits: false` plan, so it
    // reports the fact and takes `W_SCALE_OVERFLOW` rather than this warning.
    const reported: string[] = [];
    const warned: string[] = [];
    for (const [name, src, world] of shippedExamples()) {
      const s = describePlan(src, { world }).sheet;
      if (s?.drawing_fits === false) reported.push(name);
      if (codesOf(src, world).includes("W_DRAWING_OVERFLOW")) warned.push(name);
    }
    expect(reported.sort()).toEqual(["courtyard-house", "garden-house", "hillside-villa", "materials"]);
    expect(warned.sort()).toEqual(["courtyard-house", "garden-house", "hillside-villa"]);
  });
});

suite("4.9 — a multi-storey plan is measured as one building", () => {
  const LEVELS = `plan "g" { units mm paper A4 portrait scale 1:100
  level 1 "G" {
    wall id=s1 exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r1 at (0,0) size 4000x3000 label "R" uses living
  }
  level 2 "1" {
    wall id=s2 exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r2 at (0,0) size 4000x3000 label "R" uses bedroom
    outdoor id=b balcony at (0,3500) size 4000x40000 label "Deck"
  }
}`;

  it("an UPPER storey's ground grows the shared sheet, and warns ONCE", () => {
    const r = compile(LEVELS, { noCache: true });
    expect(r.pages).toHaveLength(2);
    const w = r.diagnostics.filter((d) => d.code === "W_DRAWING_OVERFLOW");
    expect(w).toHaveLength(1);
    // Raised for the building, so it carries no `level` — exactly as W_SCALE_OVERFLOW does.
    expect(w[0]!.level).toBeUndefined();
    // Every page adopts the one sheet, so every page reports the residual.
    for (const p of r.pages!) expect(p.scene.sheet!.drawingFits).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// corpus helpers
// ---------------------------------------------------------------------------

type Example = [name: string, src: string, world: World];

function shippedExamples(): Example[] {
  const dir = join(ROOT, "examples");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => {
      const abs = join(dir, f);
      return [f.replace(/\.arch$/, ""), readFileSync(abs, "utf8"), worldFor(dirname(abs))] as Example;
    });
}

function exampleNamed(name: string): Example {
  const hit = shippedExamples().find((e) => e[0] === name);
  if (!hit) throw new Error(`no shipped example named ${name}`);
  return hit;
}
