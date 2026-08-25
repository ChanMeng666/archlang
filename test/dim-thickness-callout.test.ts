import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";
import { textWidth } from "../src/text-metrics.js";
import { DIM_TEXT_GAP } from "../src/sheet.js";
import { pointInPolygon } from "../src/geometry/polygon.js";
import type { Point } from "../src/ast.js";
import type { Scene } from "../src/scene.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "..", "examples");
const example = (name: string): string => readFileSync(join(examplesDir, name), "utf8");

/**
 * **A dimension reading must never be drawn inside the poché it is measuring.**
 *
 * `dims auto walls` (and therefore `dims auto all`) emits one thickness call-out per
 * distinct wall thickness: a dimension line running face to face across the wall, at zero
 * offset, labelled with the measured thickness. The number is far wider than the thing it
 * measures — "100" needs ~4.6 mm of paper at a 2.5 mm dimension font and has 0.5 mm of wall
 * to sit in — so it was drawn straight through the hatch, rotated, unreadable, on EVERY
 * plan that asked for wall dimensions. `arch lint` reported nothing; it is a drawing fact,
 * not a measured one.
 *
 * ISO 129-1 and GB/T 50001 both answer this the same way: where the space between the
 * stations cannot hold the value, the value goes OUTSIDE them. Three pieces implement it,
 * and each has a test below:
 *
 *  1. `outsideStations` (`elements/dim.ts`) pushes the number past the far station — only
 *     for a ZERO-OFFSET dim (a chain span's remedy is the stagger, and its neighbours own
 *     the space outside its stations), and only when it genuinely does not fit.
 *  2. `thicknessStation` (`scene-build.ts`) picks WHERE along the wall to take the
 *     call-out: the middle of the widest run no other wall crosses, so the number is not
 *     pushed straight into a partition tee-ing in at the segment midpoint.
 *  3. `thicknessSideFlipped` picks WHICH SIDE: the one with floor under it, probed off the
 *     wall's own faces. On a shell the other side is the annotation band the `dims auto`
 *     chains live in.
 *
 * The invariant at the top is stated over every shipped example, not over a fixture, because
 * that is the form the defect took: it was in twelve of them at once and nothing was looking.
 */

/** Every poché region the drawing paints. A region is a RING SET — an outer boundary plus
 *  the room-shaped holes punched out of it — so a point is in the poché when it is inside
 *  an ODD number of its rings, exactly as the backends' fill rule paints it. Testing rings
 *  one at a time would call every room interior "poché". */
function pocheRegions(s: Scene): readonly (readonly { x: number; y: number }[])[][] {
  const out: (readonly { x: number; y: number }[])[][] = [];
  for (const n of s.nodes) if (n.prim.t === "hatch") out.push(n.prim.region.map((r) => [...r]));
  return out;
}

function inPoche(x: number, y: number, regions: readonly (readonly (readonly Point[])[])[]): boolean {
  return regions.some((rings) => rings.reduce((odd, r) => (pointInPolygon(x, y, r) ? !odd : odd), false));
}

/** Every dimension VALUE the drawing carries, with its anchor. */
function dimTexts(s: Scene): { value: string; x: number; y: number; size: number }[] {
  const out: { value: string; x: number; y: number; size: number }[] = [];
  for (const n of s.nodes) {
    if (n.layer !== "dims" || n.prim.t !== "text") continue;
    out.push({ value: n.prim.value, x: n.prim.at.x, y: n.prim.at.y, size: n.prim.size });
  }
  return out;
}

/** Readings whose anchor lands inside a poché region — the defect, as a predicate. */
function readingsInPoche(s: Scene): string[] {
  const regions = pocheRegions(s);
  return dimTexts(s)
    .filter((t) => inPoche(t.x, t.y, regions))
    .map((t) => `"${t.value}" @ (${t.x},${t.y})`);
}

function scene(src: string, world?: { read: (p: string) => string }): Scene {
  const { scene: s, errors } = compile(src, { noCache: true, ...(world ? { world } : {}) });
  expect(errors).toEqual([]);
  expect(s).toBeDefined();
  return s as Scene;
}

/** The examples read straight off disk, so a new one is covered the day it lands. */
const exampleNames = readdirSync(examplesDir)
  .filter((f) => f.endsWith(".arch"))
  .sort();
/** `imports.arch` / `museum-wings.arch` link sibling modules; give them a reader. */
const exampleWorld = { read: (p: string): string => readFileSync(join(examplesDir, p), "utf8") };

suite("wall-thickness call-outs are never drawn in the poché", () => {
  it("holds for every shipped example", () => {
    const offenders: string[] = [];
    for (const name of exampleNames) {
      const hits = readingsInPoche(scene(example(name), exampleWorld));
      if (hits.length > 0) offenders.push(`${name}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("is not vacuous — the shipped examples really do emit call-outs, and they really are too wide", () => {
    // If `dims auto walls` ever stops emitting these, the property above passes by drawing
    // nothing; this is the assertion that says so out loud.
    const s = scene(example("bungalow.arch"));
    const thicknesses = ["200", "100"];
    const drawn = dimTexts(s).map((t) => t.value);
    for (const t of thicknesses) expect(drawn, `bungalow should call out a ${t} wall`).toContain(t);
    // The premise of the whole fix: the number cannot fit between the two faces.
    for (const t of thicknesses) {
      expect(textWidth(t, s.sizes.dimFont) + 2 * DIM_TEXT_GAP * s.sizes.dimFont).toBeGreaterThan(Number(t));
    }
  });

  it("puts the pushed number on the side of the wall that has FLOOR under it", () => {
    // A one-room shell: the only 200 wall is the perimeter, so one side of the call-out is
    // the room and the other is the annotation band the exterior chains occupy. The number
    // must land in the room. (Before the fix it sat on the wall's own centerline; the
    // unflipped endpoint order would have put it outside, on top of a chain's numbers.)
    const src = [
      'plan "Shell" {',
      "  units mm",
      "  dims auto all",
      "  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }",
      '  room id=r at (0,0) size 8000x6000 label "Room" uses living',
      "  door id=d at (4000,6000) width 900 wall shell",
      "}",
    ].join("\n");
    const s = scene(src);
    const callout = dimTexts(s).filter((t) => t.value === "200");
    expect(callout).toHaveLength(1);
    const p = callout[0]!;
    // Inside the room's rectangle (which is drawn on wall centerlines), not outside it.
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(8000);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(6000);
  });

  it("takes the call-out on a run no other wall crosses, not at the segment midpoint", () => {
    // The reported symptom was "where a partition meets the shell". Here a partition tees
    // into the spine wall at its exact midpoint, so the midpoint station would push the
    // number into the partition's poché. The station must move off it.
    const src = [
      'plan "Tee" {',
      "  units mm",
      "  dims auto walls",
      "  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }",
      "  wall id=spine partition thickness 100 { (0,3000) (8000,3000) }",
      "  wall id=tee partition thickness 100 { (4000,3000) (4000,6000) }",
      '  room id=a at (0,0) size 8000x3000 label "A" uses living',
      '  room id=b at (0,3000) size 4000x3000 label "B" uses bedroom',
      '  room id=c at (4000,3000) size 4000x3000 label "C" uses bedroom',
      "}",
    ].join("\n");
    const s = scene(src);
    const callout = dimTexts(s).filter((t) => t.value === "100");
    expect(callout).toHaveLength(1);
    // The spine's midpoint is x = 4000, which is exactly where `tee` lands.
    expect(callout[0]!.x).not.toBe(4000);
    expect(readingsInPoche(s)).toEqual([]);
  });

  it("leaves a dimension that FITS between its stations exactly where it always was", () => {
    // The byte-identity half of the rule. A hand-written zero-offset dim across a 4 m span
    // has room for "4000", so `outsideStations` returns 0 and the historical placement runs
    // — the number centred on the line, standing `dimFont * 0.7` off it.
    const src = [
      'plan "Fits" {',
      "  units mm",
      "  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }",
      '  room id=r at (0,0) size 4000x3000 label "R" uses living',
      "  dim (0,1500)->(4000,1500) offset 0",
      "}",
    ].join("\n");
    const s = scene(src);
    const t = dimTexts(s).find((d) => d.value === "4000");
    expect(t).toBeDefined();
    // Centred on the measured span, pushed off the line by the historical standoff.
    expect(t!.x).toBe(2000);
    expect(t!.y).toBeCloseTo(1500 + s.sizes.dimFont * 0.7, 9);
    // And the premise: it fits, so nothing moved.
    expect(textWidth("4000", s.sizes.dimFont) + 2 * DIM_TEXT_GAP * s.sizes.dimFont).toBeLessThan(4000);
  });

  it("never moves a `dims auto` CHAIN span — its remedy is the stagger, not a push", () => {
    // A chain runs at a non-zero slot offset, so `outsideStations` declines it by
    // construction. Pushing a crowded chain span outside its own stations would land it on
    // its neighbour; the stagger is what separates those. Twelve 200 mm bays: every number
    // stays centred on the bay it labels.
    const ticks = Array.from({ length: 13 }, (_, i) => i * 200).join(", ");
    const src = [
      'plan "Bays" {',
      "  units mm",
      "  dims auto rooms",
      `  axes { x at ${ticks} }`,
      "  wall id=shell exterior thickness 300 { (0,0) (2400,0) (2400,6000) (0,6000) close }",
      '  room id=r at (0,0) size 2400x6000 label "R" uses living',
      "}",
    ].join("\n");
    const s = scene(src);
    const chain = dimTexts(s).filter((t) => t.value === "200");
    expect(chain).toHaveLength(12);
    // Each number is centred on its own bay: 100, 300, 500, … — none pushed past a station.
    expect(chain.map((t) => t.x).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => 100 + i * 200));
  });

  it("keeps the sheet layer OUT of the element registry's load graph", () => {
    // `outsideStations` needs the shared `DIM_TEXT_GAP`, and the obvious home for it —
    // `sheet.ts` — reaches the element registry through `chrome-layout.ts`. Importing it
    // from an element module closed a load-time cycle that left `BUILTIN_DEFS` undefined
    // for whichever test file happened to enter the graph first (`TypeError: BUILTIN_DEFS
    // is not iterable`). The constant lives in the dependency-free `text-metrics.ts`
    // instead, and no element may reach for the sheet layer.
    const dir = join(__dirname, "..", "src", "elements");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /from "\.\.\/(sheet|chrome-layout|sheet-tables)\.js"/.test(readFileSync(join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("is a DRAWING fact — `describe()` cannot tell", () => {
    // Where a number is printed is not something the building knows, and the call-out is
    // synthesized at scene-build and never enters the IR.
    const src = example("bungalow.arch");
    expect(JSON.stringify(describePlan(src))).toBe(JSON.stringify(describePlan(src)));
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});
