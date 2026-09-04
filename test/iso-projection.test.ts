/**
 * **The projection, derived by hand.** One wall, one window, and the exact screen
 * coordinates four of its corners must land on — worked out on paper from the camera's
 * closed form and written here as literals, so the test's expected column comes from
 * outside the code it checks.
 *
 * That is the distinction v1.34.0's `nav-grid-residual` work made explicit and this file
 * applies to the view: a test that projects a point and compares it against the projection
 * of the same point proves determinism, not correctness. A sign error in `sy`, a `√3` where
 * a `√6` belongs, or a yaw taken the other way round would all pass such a test and fail
 * this one.
 *
 * ## The fixture
 *
 * ```
 * wall id=w exterior thickness 200 { (0,0) (4000,0) }
 * window at (2000,0) width 1000 wall w
 * ```
 *
 * A 4000 mm wall, 200 thick, standing 3000 tall (the datum's default storey), with a
 * 1000-wide window centred at x = 2000 taking the datum's default sill 900 and head 2100.
 * So in plan the band spans `y ∈ [−100, +100]`, the window's cut spans `x ∈ [1500, 2500]`,
 * and the glazing band — 20% of the wall's thickness, centred — spans `y ∈ [−20, +20]`.
 *
 * The band spans `x ∈ [−100, +4100]`, not `[0, 4000]`: a free wall end gets a SQUARE cap
 * half a thickness beyond its last vertex (`geometry/band.ts`). That is the plan view's own
 * rule, arriving here unchanged, and it is the cheapest evidence that the extraction of
 * `joinWallSet` really did hand the view the drawing's own footprint rather than a second
 * one computed here.
 *
 * ## The camera
 *
 * ```
 *   sx = (x + y) / √2
 *   sy = −(x − y + 2z) / √6
 * ```
 *
 * with `√2 = 1.4142135623730951` and `√6 = 2.449489742783178`.
 *
 * ## The four corners
 *
 * | plan point | sx | sy |
 * |---|---|---|
 * | `(−100, −100, 0)` — the band's west end, outer face, at the floor | `−200/√2 = −141.4213562373` | `−0/√6 = 0` |
 * | `(4100, −100, 3000)` — its east end, outer face, at the top | `4000/√2 = 2828.4271247462` | `−10200/√6 = −4164.1325627314` |
 * | `(1500, −100, 900)` — the window's west jamb at sill height | `1400/√2 = 989.9494936612` | `−3400/√6 = −1388.0441875771` |
 * | `(2500, −100, 2100)` — its east jamb at head height | `2400/√2 = 1697.0562748477` | `−6800/√6 = −2776.0883751543` |
 *
 * Each `sy` is worked from `x − y + 2z`: for the third row that is `1500 + 100 + 1800 = 3400`.
 * The first row is the one to read twice — `x − y + 2z` is `−100 + 100 + 0 = 0`, so that
 * corner lands exactly on the horizon through the projection's origin, which is a value no
 * sign error can reproduce by accident.
 */

import { describe as suite, expect, it } from "vitest";
import { resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { cameraFor } from "../src/view/camera.js";
import { facesOf } from "../src/view/extrude.js";
import type { Point3 } from "../src/view/camera.js";

const SRC = `plan "Datum" {
  wall id=w exterior thickness 200 { (0,0) (4000,0) }
  window at (2000,0) width 1000 wall w
}`;

/** The hand-derived table above, as data. */
const CORNERS: Array<{ p: [number, number, number]; sx: number; sy: number }> = [
  { p: [-100, -100, 0], sx: -141.4213562373, sy: 0 },
  { p: [4100, -100, 3000], sx: 2828.4271247462, sy: -4164.1325627314 },
  { p: [1500, -100, 900], sx: 989.9494936612, sy: -1388.0441875771 },
  { p: [2500, -100, 2100], sx: 1697.0562748477, sy: -2776.0883751543 },
];

const key = (p: Point3): string => `${p.x},${p.y},${p.z}`;

suite("iso projection — hand-derived corners", () => {
  const cam = cameraFor("iso");
  const { plan, diagnostics } = parse(SRC);
  const r = resolveAll(plan!);
  const faces = facesOf([{ ir: r.ir, index: 0 }]);

  it("the fixture compiles clean — an empty corpus proves nothing", () => {
    expect([...diagnostics, ...r.diagnostics].map((d) => d.code)).toEqual([]);
    expect(faces.length).toBeGreaterThan(0);
  });

  for (const { p, sx, sy } of CORNERS) {
    it(`projects (${p.join(", ")}) to (${sx}, ${sy})`, () => {
      const q = cam.project(p[0], p[1], p[2]);
      expect(q.x).toBeCloseTo(sx, 6);
      expect(q.y).toBeCloseTo(sy, 6);
    });
  }

  it("the extrusion actually PRODUCES those corners — the table is not free-floating", () => {
    const all = new Set<string>();
    for (const f of faces) for (const loop of f.loops) for (const p of loop) all.add(key(p));
    for (const { p } of CORNERS) expect(all.has(p.join(","))).toBe(true);
  });

  it("the window's REAL millimetres reach the geometry: sill 900, head 2100, wall 3000", () => {
    // The blocks that fill the wall back in above and below the hole. Their z extents are
    // the datum's resolved numbers, never a fraction of the wall — which is the whole
    // difference between this and the reference implementation's 0.3h/0.75h guesses.
    const zs = (id: string): number[] => {
      const f = faces.filter((x) => x.elementId === id);
      const s = new Set<number>();
      for (const x of f) for (const loop of x.loops) for (const p of loop) s.add(p.z);
      return [...s].sort((a, b) => a - b);
    };
    expect(zs("L0:w#0s")).toEqual([0, 900]);
    expect(zs("L0:w#0h")).toEqual([2100, 3000]);
    expect(zs("L0:w#0g")).toEqual([900, 2100]);
  });

  it("the glazing band is inset to 20% of the wall's thickness, on the centreline", () => {
    const ys = new Set<number>();
    for (const f of faces.filter((x) => x.kind === "glaz")) {
      for (const loop of f.loops) for (const p of loop) ys.add(p.y);
    }
    // 200 mm wall × 20% = 40 mm, centred on y = 0.
    expect([...ys].sort((a, b) => a - b)).toEqual([-20, 20]);
  });

  it("a free wall end is capped half a thickness beyond its last vertex", () => {
    // The plan view's rule, unchanged: a 4000 mm wall 200 thick makes a 4200 mm band.
    const xs = new Set<number>();
    for (const f of faces.filter((x) => x.elementId.endsWith("walls@3000"))) {
      for (const loop of f.loops) for (const p of loop) xs.add(p.x);
    }
    expect(Math.min(...xs)).toBe(-100);
    expect(Math.max(...xs)).toBe(4100);
  });

  it("the wall's own band still spans its FULL thickness either side of the window", () => {
    const ys = new Set<number>();
    for (const f of faces.filter((x) => x.elementId.endsWith("walls@3000"))) {
      for (const loop of f.loops) for (const p of loop) ys.add(p.y);
    }
    expect([...ys].sort((a, b) => a - b)).toEqual([-100, 100]);
  });
});
