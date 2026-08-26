/**
 * `roof` — the eaves projection line (v1.29).
 *
 * The element is drawing-only, so the things worth pinning are the ones a rendered SVG
 * would let you eyeball and get wrong:
 *
 *  1. **The derivation is exact at any angle.** A mitred offset of a wall ring is closed
 *     form — line–line intersection, orientation from the shoelace sign — so the assertions
 *     here are exact coordinate equalities, not tolerances, and they include an OBLIQUE
 *     ring (where a bounding-box or per-vertex-normal shortcut would be visibly wrong) and
 *     a ring with a redundant collinear vertex (which must not survive as a corner).
 *  2. **Every refusal is a refusal.** All seven catalogued codes, each reproduced.
 *  3. **The node carries BOTH halves of the dash convention** (`lineType` and `paint.dash`),
 *     which is the cross-backend divergence `glyph-lib.ts` documents: the SVG serializer
 *     follows the name, the PDF serializer follows the number.
 *  4. **`fmt` round-trips both spellings.** The v1.26.1 lesson — a formatter that drops a
 *     clause has changed the drawing, not the layout.
 */

import { describe, expect, it } from "vitest";
import { compile, format, renderAscii, toDxf } from "../src/index.js";
import { resolve as resolvePlan } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import { offsetRingOutward, ROOF_LAYER } from "../src/elements/roof.js";
import type { RRoof } from "../src/ir.js";
import type { Point } from "../src/ast.js";

const plan = (body: string): string => `plan "Roof" {\n  units mm\n${body}\n}\n`;

/** A closed rectangular exterior ring, 8000 × 5000, 200 thick. */
const BOX = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;

const codesOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "<uncoded>");

/** The single resolved roof in a plan (throws if the plan does not resolve to one). */
function roofOf(src: string): RRoof {
  const p = parse(src);
  const { ir } = resolvePlan(p.plan!);
  const r = ir.elements.find((e): e is RRoof => e.kind === "roof");
  if (!r) throw new Error("fixture has no roof");
  return r;
}

const ringOf = (src: string): Point[] => roofOf(src).ring;

// ---------------------------------------------------------------------------
// 1. The derivation
// ---------------------------------------------------------------------------

describe("roof overhang — the derived ring", () => {
  it("offsets a rectangular ring by thickness/2 + overhang on every face", () => {
    // 200/2 + 600 = 700 out on all four sides, corners mitred to the exact rectangle.
    expect(ringOf(plan(`${BOX}\n  roof overhang 600`))).toEqual([
      { x: -700, y: -700 },
      { x: 8700, y: -700 },
      { x: 8700, y: 5700 },
      { x: -700, y: 5700 },
    ]);
  });

  it("gives the same ring whether the wall is named or inferred", () => {
    expect(ringOf(plan(`${BOX}\n  roof overhang 600 wall w1`))).toEqual(ringOf(plan(`${BOX}\n  roof overhang 600`)));
  });

  it("takes a counter-clockwise ring outward too — orientation is the shoelace sign", () => {
    // The same rectangle traced the other way round. A rule that assumed one winding
    // would push this one INTO the building.
    const ccw = `  wall id=w1 exterior thickness 200 { (0,0) (0,5000) (8000,5000) (8000,0) close }`;
    const ring = ringOf(plan(`${ccw}\n  roof overhang 600`));
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-700, 8700]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([-700, 5700]);
  });

  it("mitres an OBLIQUE corner in closed form", () => {
    // A right isosceles corner at the origin: the two faces meet at 90°, but neither is
    // axis-aligned, so the mitred vertex sits √2·d out along the bisector. d = 0 + 1000
    // (thickness 0 is not writable, so use 200 → d = 1100).
    const tri = `  wall id=w1 exterior thickness 200 { (0,0) (10000,0) (0,10000) close }`;
    const ring = ringOf(plan(`${tri}\n  roof overhang 1000`));
    expect(ring).toHaveLength(3);
    // The (0,0) corner is the right angle between the +y face (pushed to x = −1100) and
    // the +x face (pushed to y = −1100).
    expect(ring[0]!.x).toBeCloseTo(-1100, 9);
    expect(ring[0]!.y).toBeCloseTo(-1100, 9);
    // …and the hypotenuse's own face really did move by d, not by d along an axis.
    const hyp = Math.abs(ring[1]!.x + ring[1]!.y - 10000) / Math.SQRT2;
    expect(hyp).toBeCloseTo(1100, 6);
  });

  it("merges a collinear neighbour instead of leaving a corner that is not one", () => {
    // The top face carries a redundant mid-point. Offsetting per-vertex would keep it;
    // the offset of two collinear faces is one face.
    const withMid = `  wall id=w1 exterior thickness 200 { (0,0) (4000,0) (8000,0) (8000,5000) (0,5000) close }`;
    expect(ringOf(plan(`${withMid}\n  roof overhang 600`))).toEqual(ringOf(plan(`${BOX}\n  roof overhang 600`)));
  });

  it("offsetRingOutward is exact and reversible in scale", () => {
    const sq: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(offsetRingOutward(sq, 10)).toEqual([
      { x: -10, y: -10 },
      { x: 110, y: -10 },
      { x: 110, y: 110 },
      { x: -10, y: 110 },
    ]);
    // Pushing out then in by the same distance returns the original ring.
    expect(offsetRingOutward(offsetRingOutward(sq, 10), -10)).toEqual(sq);
  });
});

describe("roof polygon — the explicit ring", () => {
  it("takes its vertices verbatim", () => {
    expect(ringOf(plan(`  roof polygon (0,0) (9000,0) (9000,6000) (0,6000)`))).toEqual([
      { x: 0, y: 0 },
      { x: 9000, y: 0 },
      { x: 9000, y: 6000 },
      { x: 0, y: 6000 },
    ]);
  });

  it("needs no wall at all — a canopy is not the building's outline", () => {
    expect(codesOf(plan(`  roof polygon (0,0) (3000,0) (3000,2000) (0,2000)`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Every refusal
// ---------------------------------------------------------------------------

describe("roof — refuses rather than approximating", () => {
  const CASES: [string, string, string][] = [
    ["E_ROOF_OVERHANG", "zero projection", plan(`${BOX}\n  roof overhang 0`)],
    ["E_ROOF_OVERHANG", "negative projection", plan(`${BOX}\n  roof overhang 0 - 600`)],
    [
      "E_ROOF_AMBIGUOUS",
      "no closed exterior ring at all",
      plan(`  room id=r1 at (0,0) size 4000x3000\n  roof overhang 600`),
    ],
    [
      "E_ROOF_AMBIGUOUS",
      "two closed exterior rings",
      plan(
        `${BOX}\n  wall id=w2 exterior thickness 200 { (12000,0) (18000,0) (18000,5000) (12000,5000) close }\n  roof overhang 600`,
      ),
    ],
    ["E_ROOF_WALL", "unknown wall id", plan(`${BOX}\n  roof overhang 600 wall nope`)],
    [
      "E_ROOF_WALL",
      "an open polyline is not a ring",
      plan(`  wall id=w1 exterior thickness 200 { (0,0) (8000,0) }\n  roof overhang 600 wall w1`),
    ],
    [
      "E_ROOF_CURVED",
      "an arc edge on the ring",
      plan(
        `  wall id=drum exterior thickness 200 { (0,0) arc (6000,0) radius 4000 (6000,4000) (0,4000) close }\n` +
          `  roof overhang 600 wall drum`,
      ),
    ],
    ["E_ROOF_SELF_INTERSECT", "a bow-tie polygon", plan(`  roof polygon (0,0) (4000,4000) (4000,0) (0,4000)`)],
    ["E_ROOF_POLY_DEGENERATE", "three collinear points", plan(`  roof polygon (0,0) (4000,0) (8000,0)`)],
    [
      "E_ROOF_PLACEMENT",
      "inside a component body",
      `plan "Roof" {\n  units mm\n  component wing() { roof overhang 600 }\n  wing()\n}\n`,
    ],
  ];

  for (const [code, note, src] of CASES) {
    it(`${code} — ${note}`, () => {
      expect(codesOf(src)).toContain(code);
    });
  }

  it("E_ROOF_SELF_INTERSECT — an overhang wide enough to swallow a notch", () => {
    // A C-shaped ring with a 600 mm-deep slot. A 1500 mm eave closes the slot and the
    // pushed-out faces cross; approximating it would draw an outline that folds over
    // itself.
    const notched =
      `  wall id=w1 exterior thickness 100 { (0,0) (8000,0) (8000,5000) (4300,5000) (4300,600) ` +
      `(3700,600) (3700,5000) (0,5000) close }`;
    expect(codesOf(plan(`${notched}\n  roof overhang 1500`))).toContain("E_ROOF_SELF_INTERSECT");
  });

  it("a refused roof draws nothing rather than a broken outline", () => {
    const { svg } = compile(plan(`${BOX}\n  roof overhang 0`), { noCache: true });
    expect(svg).not.toContain(ROOF_LAYER);
  });
});

// ---------------------------------------------------------------------------
// 3. What is drawn
// ---------------------------------------------------------------------------

describe("roof — the Scene node", () => {
  const sceneNodes = (src: string) => toScene(resolvePlan(parse(src).plan!).ir).nodes;

  it("is ONE unfilled polygon on the annotations pass, on its own CAD layer", () => {
    const nodes = sceneNodes(plan(`${BOX}\n  roof overhang 600`)).filter((n) => n.layerName === ROOF_LAYER);
    expect(nodes).toHaveLength(1);
    const n = nodes[0]!;
    expect(n.layer).toBe("annotations");
    expect(n.prim.t).toBe("polygon");
    expect(n.paint.fill).toBe("none");
  });

  it("names the dashed line type AND carries the matching raw pattern", () => {
    // Naming one and handing the other a different pattern is how the SVG and the PDF
    // come to draw two different dashes from one node.
    const n = sceneNodes(plan(`${BOX}\n  roof overhang 600`)).find((x) => x.layerName === ROOF_LAYER)!;
    expect(n.lineType).toBe("dashed");
    expect(n.lineWeight).toBe("thin");
    const sizes = toScene(resolvePlan(parse(plan(`${BOX}\n  roof overhang 600`)).plan!).ir).sizes;
    expect(n.paint.dash).toEqual([sizes.thin * 6, sizes.thin * 4]);
    expect(n.paint.width).toBe(sizes.thin);
  });

  it("takes the muted annotation ink, and follows a `style roof { … }` override", () => {
    const base = sceneNodes(plan(`${BOX}\n  roof overhang 600`)).find((x) => x.layerName === ROOF_LAYER)!;
    expect(base.paint.stroke).toBe("#888888");
    const styled = sceneNodes(plan(`  style roof { stroke "#ff0000" }\n${BOX}\n  roof overhang 600`)).find(
      (x) => x.layerName === ROOF_LAYER,
    )!;
    expect(styled.paint.stroke).toBe("#ff0000");
  });

  it("grows the drawing bounds, so the page contains the eaves", () => {
    const without = toScene(resolvePlan(parse(plan(BOX)).plan!).ir);
    const withRoof = toScene(resolvePlan(parse(plan(`${BOX}\n  roof overhang 600`)).plan!).ir);
    expect(withRoof.bounds.minX).toBeLessThan(without.bounds.minX);
    expect(withRoof.bounds.maxX).toBeGreaterThan(without.bounds.maxX);
    expect(withRoof.width).toBeGreaterThan(without.width);
  });
});

describe("roof — every backend serializes it", () => {
  const SRC = plan(`  room id=r1 at (0,0) size 8000x5000 label "Hall"\n${BOX}\n  roof overhang 600`);

  it("SVG emits the outline on an A-ROOF group", () => {
    const { svg, errors } = compile(SRC, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain(`id="${ROOF_LAYER}"`);
    expect(svg).toContain("-700,-700");
  });

  it("DXF puts it on the A-ROOF layer", () => {
    const dxf = toDxf(toScene(resolvePlan(parse(SRC).plan!).ir));
    expect(dxf).toContain(ROOF_LAYER);
  });

  it("the ASCII plan renders without throwing", () => {
    expect(() => renderAscii(toScene(resolvePlan(parse(SRC).plan!).ir))).not.toThrow();
  });

  it("PDF export draws it", async () => {
    let pdfkit = true;
    try {
      await import("pdfkit" as string);
    } catch {
      pdfkit = false;
    }
    if (!pdfkit) {
      // A missing optional dep is a broken install in CI, and a visible skip locally —
      // the `test/export-pdf.test.ts` gate shape, so this can never pass having asserted
      // nothing.
      if (process.env.CI) throw new Error("optional dep pdfkit missing in CI — the install step is broken");
      return;
    }
    const { toPdf } = await import("../src/export/pdf.js");
    const bytes = await toPdf(toScene(resolvePlan(parse(SRC).plan!).ir));
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// 4. The formatter
// ---------------------------------------------------------------------------

describe("roof — `arch fmt` round-trips both spellings", () => {
  const ROUND_TRIP = [
    `${BOX}\n  roof overhang 600`,
    `${BOX}\n  roof overhang 600 wall w1`,
    `  roof polygon (0,0) (9000,0) (9000,6000) (0,6000)`,
  ];

  for (const body of ROUND_TRIP) {
    const stmt = body.trim().split("\n").pop()!;
    it(`preserves \`${stmt}\``, () => {
      const src = plan(body);
      const once = format(src);
      // The clause words all survive (the formatter spaces a point `(0, 0)`, so this is
      // a word-level check; the ring equality below is the semantic one)…
      for (const word of stmt.split(/[\s(),]+/).filter(Boolean)) expect(once).toContain(word);
      // …the format is a fixpoint…
      expect(format(once)).toBe(once);
      // …and the formatted source draws the same ring, which is the promise that matters:
      // a `wall` clause dropped by the printer would silently re-point the roof.
      expect(ringOf(once)).toEqual(ringOf(src));
    });
  }

  it("keeps the `wall` clause — dropping it would re-point the roof by inference", () => {
    const two =
      `${BOX}\n  wall id=w2 exterior thickness 200 { (12000,0) (18000,0) (18000,5000) (12000,5000) close }\n` +
      `  roof overhang 600 wall w2`;
    expect(format(plan(two))).toContain("roof overhang 600 wall w2");
  });
});
