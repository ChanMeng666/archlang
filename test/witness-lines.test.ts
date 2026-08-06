import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { distPointToWallSegment, segmentsOfWall } from "../src/geometry.js";
import type { Point } from "../src/ast.js";
import type { Scene } from "../src/scene.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string): string => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/**
 * `dims auto` extension (witness) lines terminate ON the facade they point at.
 *
 * A dimension CHAIN measures along one straight baseline, so its endpoints are
 * projections of the building onto that baseline. Before v1.25 the witness lines
 * started at those projections, which is right only when the facade is a single
 * straight line at the extent's edge: on `gallery-l`, whose south facade exists only
 * for x in [0, 6000] before a 40 degree run climbs away, the two right-hand ticks began
 * ~5.1 m below the wall, over blank page — and nothing reported it, the same class of
 * silent-wrong-output as the concave label and routing-anchor bugs.
 *
 * The fix interpolates the true facade coordinate at each tick (`facadeAt` in
 * `scene-build.ts`) and hands it to the dim element as `RDim.witness`. The measured
 * endpoints never move, so the dimension line, its ticks and its text are untouched —
 * and `describe()` never sees any of it (a dimension is a drawing fact, not a measured
 * one).
 */

/** A synthesized witness line, wall end first. They are the lightest strokes on the
 *  `dims` layer (`thin * 0.7`); dimension lines and ticks are `thin`. */
function witnessLines(src: string): { at: Point; to: Point }[] {
  const { scene, errors } = compile(src, { noCache: true });
  expect(errors).toEqual([]);
  expect(scene).toBeDefined();
  const s = scene as Scene;
  const w = s.sizes.thin * 0.7;
  const out: { at: Point; to: Point }[] = [];
  for (const n of s.nodes) {
    if (n.layer !== "dims" || n.prim.t !== "line" || n.paint.width !== w) continue;
    out.push({ at: n.prim.a, to: n.prim.b });
  }
  return out;
}

/**
 * Whether a point stands on a wall. A MITRED outer corner is legitimately further from
 * either centerline than half a thickness (it is where two offset faces cross), so the
 * bound is one full thickness — still four orders of magnitude tighter than the defect,
 * which put a terminus metres out over blank page.
 */
function onSomeWall(src: string, p: Point): boolean {
  const walls = resolve(parse(src).plan!).ir.walls;
  for (const w of walls) {
    for (const seg of segmentsOfWall(w)) {
      if (distPointToWallSegment(p, seg) <= seg.thickness + 1e-6) return true;
    }
  }
  return false;
}

suite("dims auto — witness lines terminate on the facade", () => {
  it("gallery-l: the two right-hand ticks land on the 40 degree facade, not the bounding box", () => {
    const src = example("gallery-l.arch");
    const vertical = witnessLines(src).filter((l) => l.at.x === l.to.x);
    const at = (x: number): number => {
      const hits = vertical.filter((l) => l.at.x === x && l.to.y > l.at.y);
      expect(hits.length).toBeGreaterThan(0);
      return hits[0]!.at.y;
    };
    // The south facade runs (12000,9000) -> (6000,14000) at 40 degrees on a 300 wall, so
    // its outer face stands 150 * sqrt(1 + (5/6)^2) = 195.26 mm below the centerline
    // measured on y. At the tick x = 12000 that is 9195.26 — the outer corner of the
    // building, NOT the 14150 the bounding box would claim (5.1 m of blank page).
    expect(at(12000)).toBeCloseTo(9195.26, 2);
    // The overall chain's tick sits on the east outer-face plane x = 12150, half a wall
    // BEYOND the last corner, so the facade line is extended to it — which lands exactly
    // on the mitred outer corner the wall outline itself draws (`L 12150,9070.26`).
    expect(at(12150)).toBeCloseTo(9070.26, 2);
    // Everything on the straight part of the same chain is untouched.
    expect(at(0)).toBe(14150);
    expect(at(6000)).toBe(14150);
  });

  it("gallery-l: where a flat and an angled facade meet, the flat face wins the corner", () => {
    // At x = 6000 both facades' centerlines pass through y = 14000; the outline's mitre
    // is at x = 6054.31, so the drawn wall at x = 6000 is still the flat face at 14150.
    // Taking the INNERMOST face of a tied pair is what keeps it there (the angled face
    // extended would say 14195.26 — a hair OUTSIDE the wall) and is also why every
    // rectilinear plan's bytes are unchanged.
    const src = example("gallery-l.arch");
    const svg = compile(src, { noCache: true }).svg;
    expect(svg).toContain('<line x1="6000" y1="14150" x2="6000" y2="15000"');
  });

  it("every witness line starts on a wall — rectilinear and angled examples alike", () => {
    for (const name of ["studio.arch", "two-bed.arch", "museum.arch", "two-storey.arch", "gallery-l.arch"]) {
      const src = example(name);
      for (const line of witnessLines(src)) {
        expect(onSomeWall(src, line.at), `${name}: witness at (${line.at.x}, ${line.at.y}) floats`).toBe(true);
      }
    }
  });

  it("a purely rectilinear plan puts every witness exactly on its measured endpoint", () => {
    // The byte-identity law: with no stepped or angled facade the interpolated facade
    // coordinate IS the chain baseline, so nothing moves.
    const src = `plan "p" {
      units mm
      dims auto all
      wall exterior thickness 300 { (0,0) (8000,0) (8000,6000) (0,6000) close }
      room id=a at (0,0) size 5000x6000
      room id=b at (5000,0) size 3000x6000
      door id=d on exterior at 10% width 900
    }`;
    const lines = witnessLines(src);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      // A witness line is perpendicular to its chain, so start and end share one axis;
      // "on the baseline" means the OTHER coordinate is that side's outer face, half of
      // the 300 wall beyond its centerline — never anything interpolated.
      const cross = l.at.x === l.to.x ? l.at.y : l.at.x;
      expect([-150, 6150, 8150]).toContain(cross);
    }
  });

  it("a CURVED facade is deferred by name: the flat baseline is kept, never approximated", () => {
    // v1.25 does not solve the circle for a face coordinate, so a tick standing over an
    // `arc` keeps `SideGeom.outer` — the same declining-rather-than-approximating stance
    // `probeSide`, `facadeOpenings` and `synthWallDims` already take on curves. On
    // `aquarium` the south-east corner is a R12000 quarter arc, so the x = 60000 tick
    // still starts on the extent edge rather than on the arc. Pinned so that the day
    // someone DOES solve it, this test says so out loud instead of silently passing.
    const src = example("aquarium.arch");
    const deferred = witnessLines(src).filter((l) => l.at.x === 60000 && l.at.y === 40150);
    expect(deferred.length).toBeGreaterThan(0);
    // The straight facades of the very same plan must NOT have been dragged inward by
    // some partition 20 m away — declining means keeping the old answer, not inventing
    // a new wrong one.
    const eastChain = witnessLines(src).filter((l) => (l.at.y === 30000 || l.at.y === 40000) && l.to.x > l.at.x);
    expect(eastChain.length).toBeGreaterThan(0);
    for (const l of eastChain) expect(l.at.x).toBe(60150);
  });
});
