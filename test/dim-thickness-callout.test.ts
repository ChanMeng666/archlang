/** wall-thickness call-outs are never drawn in the poché; wall-thickness call-outs stay off doorways and fixtures. */

import { exampleNames as listExamples } from "./helpers/corpus.js";
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
import { parse } from "../src/parser.js";
import { link } from "../src/import.js";
import { resolveAll } from "../src/ir.js";
import type { ResolvedPlan, RFurniture } from "../src/ir.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { ElementDef } from "../src/registry.js";
import { rectCorners, segmentsOfWall } from "../src/geometry.js";
import { fmt2 } from "../src/num-format.js";
import type { World } from "../src/world.js";

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
 *     pushed straight into a partition tee-ing in at the segment midpoint — and no opening
 *     on the wall and no furniture footprint on the number's side blocks, so it is not
 *     written in a doorway or over a sink either (the second suite below).
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
 *  one at a time would call every room interior "poché".
 *
 *  **The `wallFill` filter is load-bearing, and it was not needed until ground surfaces existed.** A `hatch`
 *  node used to mean exactly one thing — wall solid. It now means three: the wall poché on
 *  `wallFill`, an `outdoor` ground material on `floor`, and a legend swatch on
 *  `annotations`. Without the filter this sweep reads a dimension number drawn over a lawn
 *  as a call-out buried in the wall it measures, which is a different claim and a false
 *  one — `examples/garden-house.arch`'s overall chain crosses its own deck, exactly as a
 *  site plan's chain should. The invariant is about the POCHÉ, so name the layer. */
function pocheRegions(s: Scene): readonly (readonly { x: number; y: number }[])[][] {
  const out: (readonly { x: number; y: number }[])[][] = [];
  for (const n of s.nodes) {
    if (n.prim.t === "hatch" && n.layer === "wallFill") out.push(n.prim.region.map((r) => [...r]));
  }
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
const exampleNames = listExamples().sort();
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

/** An axis-aligned box in plan millimetres. */
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A thickness call-out's NUMBER as drawn: its text box (the shared width estimate, turned
 *  with the text) and the wall line whose thickness it reads. */
interface Callout {
  value: string;
  box: Box;
  /** The wall segment runs along x (its line is `y = c`), else along y (`x = c`). */
  horiz: boolean;
  c: number;
}

const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;

/**
 * The thickness call-outs of one storey, found from the drawing and the walls rather than
 * from the code that placed them: a dims-layer number that reads a straight segment's
 * thickness and sits exactly where `outsideStations` writes a pushed number — half the wall,
 * one text gap and half the number off that segment's centreline, within its run.
 */
function thicknessCallouts(s: Scene, ir: ResolvedPlan): Callout[] {
  const gap = DIM_TEXT_GAP * s.sizes.dimFont;
  const out: Callout[] = [];
  for (const n of s.nodes) {
    if (n.layer !== "dims" || n.prim.t !== "text") continue;
    const { value, at, size } = n.prim;
    const w = textWidth(value, size);
    const turned = Math.abs(n.prim.rotate ?? 0) === 90;
    const hx = (turned ? size : w) / 2;
    const hy = (turned ? w : size) / 2;
    const box = { x0: at.x - hx, x1: at.x + hx, y0: at.y - hy, y1: at.y + hy };
    const host = ir.walls
      .flatMap((wall) => segmentsOfWall(wall))
      .find((seg) => {
        if (seg.arc || fmt2(seg.thickness) !== value) return false;
        const horiz = seg.a.y === seg.b.y && seg.a.x !== seg.b.x;
        if (!horiz && seg.a.x !== seg.b.x) return false;
        const along = horiz ? at.x : at.y;
        const c = horiz ? seg.a.y : seg.a.x;
        const lo = horiz ? Math.min(seg.a.x, seg.b.x) : Math.min(seg.a.y, seg.b.y);
        const hi = horiz ? Math.max(seg.a.x, seg.b.x) : Math.max(seg.a.y, seg.b.y);
        const off = Math.abs((horiz ? at.y : at.x) - c);
        return along >= lo && along <= hi && Math.abs(off - (seg.thickness / 2 + gap + w / 2)) < 1e-6;
      });
    if (!host) continue;
    const horiz = host.a.y === host.b.y;
    out.push({ value, box, horiz, c: horiz ? host.a.y : host.a.x });
  }
  return out;
}

/**
 * What a call-out's number collides with: every opening on its own wall line whose run
 * (centre ± half its width, from the opening model) the number's run along the wall
 * overlaps, and every furniture footprint the number's box overlaps.
 */
function calloutClashes(co: Callout, ir: ResolvedPlan): string[] {
  const hits: string[] = [];
  const [a0, a1] = co.horiz ? [co.box.x0, co.box.x1] : [co.box.y0, co.box.y1];
  for (const wall of ir.walls) {
    for (const op of wall.openings) {
      // The opening's host is the straight segment of its wall it sits on.
      const host = segmentsOfWall(wall).find((seg) =>
        !seg.arc && seg.a.y === seg.b.y && seg.a.x !== seg.b.x
          ? op.at.y === seg.a.y && op.at.x >= Math.min(seg.a.x, seg.b.x) && op.at.x <= Math.max(seg.a.x, seg.b.x)
          : !seg.arc &&
            seg.a.x === seg.b.x &&
            op.at.x === seg.a.x &&
            op.at.y >= Math.min(seg.a.y, seg.b.y) &&
            op.at.y <= Math.max(seg.a.y, seg.b.y),
      );
      if (!host || (host.a.y === host.b.y) !== co.horiz || (co.horiz ? host.a.y : host.a.x) !== co.c) continue;
      const centre = co.horiz ? op.at.x : op.at.y;
      if (overlaps(a0, a1, centre - op.width / 2, centre + op.width / 2))
        hits.push(`opening ${op.ownerId} ${centre - op.width / 2}..${centre + op.width / 2}`);
    }
  }
  for (const el of ir.elements) {
    if (el.kind !== "furniture") continue;
    const f = el as RFurniture;
    const fx1 = f.at.x + f.size.w;
    const fy1 = f.at.y + f.size.h;
    if (overlaps(co.box.x0, co.box.x1, f.at.x, fx1) && overlaps(co.box.y0, co.box.y1, f.at.y, fy1))
      hits.push(`furniture ${f.id} (${f.at.x},${f.at.y})..(${fx1},${fy1})`);
  }
  return hits;
}

/** The same call-out with its number moved to another station along its wall. */
function atStation(co: Callout, along: number): Callout {
  const box = co.horiz
    ? { ...co.box, x0: along - (co.box.x1 - co.box.x0) / 2, x1: along + (co.box.x1 - co.box.x0) / 2 }
    : { ...co.box, y0: along - (co.box.y1 - co.box.y0) / 2, y1: along + (co.box.y1 - co.box.y0) / 2 };
  return { ...co, box };
}

/** Every storey of a plan: its Scene and the resolved plan it was drawn from. */
function storeys(src: string, world?: World): { s: Scene; ir: ResolvedPlan }[] {
  const out = compile(src, { noCache: true, ...(world ? { world } : {}) });
  expect(out.errors).toEqual([]);
  const scenes = out.pages ? out.pages.map((p) => p.scene) : [out.scene as Scene];
  const w = world ?? { read: () => null, now: () => new Date(0) };
  const linked = link(parse(src).plan!, w, BUILTIN_REGISTRY);
  const resolved = resolveAll(linked.plan, BUILTIN_REGISTRY, w);
  const irs = resolved.levels.length > 0 ? resolved.levels.map((l) => l.ir) : [resolved.ir];
  expect(irs).toHaveLength(scenes.length);
  return scenes.map((s, i) => ({ s, ir: irs[i]! }));
}

suite("wall-thickness call-outs stay off doorways and fixtures", () => {
  // The agent-UX audit's plan: the "100" call-out sat in doorway `d_bed2` and the "200" on the
  // kitchen sink. Committed verbatim (under a header comment) so the defect stays reproducible.
  const audit = readFileSync(join(__dirname, "callout-fixtures", "agent-ux-flat.arch"), "utf8");

  it("moves the audit plan's call-outs out of doorway d_bed2 and off the kitchen sink", () => {
    const { s, ir } = storeys(audit)[0]!;
    const callouts = thicknessCallouts(s, ir);
    expect(callouts.map((c) => c.value).sort()).toEqual(["100", "200"]);

    // "100" reads the hall's west partition, the wall `d_bed2` is hung in.
    const c100 = callouts.find((c) => c.value === "100")!;
    expect(c100.horiz).toBe(false);
    expect(c100.c).toBe(3600);
    const bed2 = ir.walls.flatMap((w) => w.openings).find((o) => o.ownerId === "d_bed2")!;
    const [d0, d1] = [bed2.at.y - bed2.width / 2, bed2.at.y + bed2.width / 2];
    expect([d0, d1]).toEqual([4600, 5400]); // the audit's reading of the doorway
    expect(overlaps(c100.box.y0, c100.box.y1, d0, d1)).toBe(false);

    // "200" reads the north shell, which the kitchen run stands against.
    const c200 = callouts.find((c) => c.value === "200")!;
    expect(c200.horiz).toBe(true);
    expect(c200.c).toBe(0);
    const sink = ir.elements.find((e): e is RFurniture => e.kind === "furniture" && e.category === "kitchen_sink")!;
    const sinkBox = { x0: sink.at.x, x1: sink.at.x + sink.size.w, y0: sink.at.y, y1: sink.at.y + sink.size.h };
    expect(
      overlaps(c200.box.x0, c200.box.x1, sinkBox.x0, sinkBox.x1) &&
        overlaps(c200.box.y0, c200.box.y1, sinkBox.y0, sinkBox.y1),
    ).toBe(false);

    // And nothing else: no opening on either wall line, no footprint under either number.
    expect(calloutClashes(c100, ir)).toEqual([]);
    expect(calloutClashes(c200, ir)).toEqual([]);
  });

  it("is not vacuous — the stations the audit found are caught by the same predicate", () => {
    // The audit's drawing put "100" at y = 4975 and "200" at x = 7775 (the midpoints of the
    // widest runs clear of WALLS only). Moved back there, each call-out must clash.
    const { s, ir } = storeys(audit)[0]!;
    const callouts = thicknessCallouts(s, ir);
    const c100 = callouts.find((c) => c.value === "100")!;
    const c200 = callouts.find((c) => c.value === "200")!;
    expect(calloutClashes(atStation(c100, 4975), ir)).toEqual(["opening d_bed2 4600..5400"]);
    expect(calloutClashes(atStation(c200, 7775), ir)).toEqual(["furniture kitchen_sink_3 (7300,100)..(8100,700)"]);
  });

  it("holds over the corpus: no call-out in poché, in a doorway or over a piece of furniture", () => {
    // The shipped examples, the test fixtures (this file's own included) and recovery-corpus
    // copies, and the eval goldens — every plan here that draws a thickness call-out. The site's
    // agent gallery is deliberately not read: it stays out of the language's corpus
    // (`test/agent-gallery.test.ts`).
    const root = join(__dirname, "..");
    const dirs = ["examples", "test/fixtures", "test/callout-fixtures", "test/recovery-corpus", "eval/goldens"];
    const offenders: string[] = [];
    let seen = 0;
    let plans = 0;
    for (const dir of dirs) {
      const abs = join(root, dir);
      const world: World = {
        read: (p) => {
          try {
            return readFileSync(join(abs, p), "utf8");
          } catch {
            return null;
          }
        },
        now: () => new Date(0),
      };
      for (const file of readdirSync(abs)
        .filter((f) => f.endsWith(".arch"))
        .sort()) {
        plans++;
        for (const [i, { s, ir }] of storeys(readFileSync(join(abs, file), "utf8"), world).entries()) {
          const where = `${dir}/${file} storey ${i + 1}`;
          for (const hit of readingsInPoche(s)) offenders.push(`${where} in poché: ${hit}`);
          for (const co of thicknessCallouts(s, ir)) {
            seen++;
            const hits = calloutClashes(co, ir);
            if (hits.length > 0) offenders.push(`${where} "${co.value}": ${hits.join(", ")}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // Not vacuous: the corpus is walked, and its call-outs really are found by the finder.
    expect(plans).toBeGreaterThan(70);
    expect(seen).toBeGreaterThan(60);
  });

  it("never trades poché for a clear doorway: walls first, then openings and furniture", () => {
    // The red team's repro. Partition `p` carries two 1600 mm openings that, with the shell
    // and `q` teeing in at p's midpoint, leave no run clear of everything. The station must
    // fall back to the widest run clear of WALLS (in an opening — untidy, readable), never to
    // the segment midpoint, which is exactly where `q`'s poché is.
    const src = [
      'plan "Tee" {',
      "  units mm",
      "  dims auto all",
      "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }",
      "  wall id=p partition thickness 100 { (3000,0) (3000,4000) }",
      "  wall id=q partition thickness 100 { (3000,2000) (6000,2000) }",
      '  room id=w at (0,0) size 3000x4000 label "W" uses living',
      '  room id=n at (3000,0) size 3000x2000 label "N" uses bedroom',
      '  room id=s at (3000,2000) size 3000x2000 label "S" uses bedroom',
      "  opening id=o1 on p at 1000 width 1600",
      "  opening id=o2 on p at 3000 width 1600",
      "}",
    ].join("\n");
    const s = scene(src);
    expect(readingsInPoche(s)).toEqual([]);
    const c100 = dimTexts(s).filter((t) => t.value === "100");
    expect(c100).toHaveLength(1);
    // q's band is y 1950..2050; the number is a cap height tall, centred on its station.
    const { y, size } = c100[0]!;
    expect(y + size / 2 <= 1950 || y - size / 2 >= 2050).toBe(true);
  });

  it("leaves a call-out that collides with nothing exactly where walls alone put it", () => {
    // The stability tier: an opening ELSEWHERE on the wall changes which run is widest once
    // openings block, but the wall-clear station is already clear, so it must not move.
    const without = scene([...CALM, "}"].join("\n"));
    const withDoor = scene([...CALM, "  door id=d on spine at 7200 width 800", "}"].join("\n"));
    // The door (6800..7600) shortens the widest wall-clear run (2050..7900), so the widest run
    // clear of everything has a different midpoint: without the stability tier this moves.
    expect(calm100(without).x).toBeLessThan(6800);
    expect(calm100(withDoor)).toEqual(calm100(without));
  });

  it("…and the same for a piece of furniture elsewhere on the number's side", () => {
    // The number is written into room `a` (y < 3000), in the band y ≈ 2650..2950 off the
    // spine's face. A wardrobe against the spine at x 6700..7300 stands in that band, so it
    // blocks a run once furniture counts; the clear call-out at x 4975 must still stay put.
    const without = scene([...CALM, "}"].join("\n"));
    const withPiece = scene([...CALM, "  furniture wardrobe at (6700,2400) size 600x550", "}"].join("\n"));
    expect(calm100(without).y).toBeLessThan(2950);
    expect(calm100(withPiece)).toEqual(calm100(without));
  });

  it("reads the footprint from the compile's own registry, and ignores a non-finite one", () => {
    // A plugin may REPLACE the built-in `furniture` kind (`createRegistry`); the call-out
    // must then avoid the footprint the plugin's `bounds()` reports, not the built-in one.
    const builtin = BUILTIN_REGISTRY.byKind.get("furniture")!;
    const src = [...CALM, "  furniture wardrobe at (500,500) size 600x600", "}"].join("\n");
    const at = (plugins: ElementDef[]) => {
      const out = compile(src, { noCache: true, plugins });
      expect(out.errors).toEqual([]);
      expect(out.svg).not.toContain("NaN");
      return calm100(out.scene as Scene);
    };
    const plain = at([]);
    // The built-in footprint (500..1100, 500..1100) is far from the spine: the station is the
    // wall-clear one, x 4975.
    expect(plain.x).toBe(4975);
    // A replacement whose footprint stands across that station, in the number's band.
    const moved = at([{ ...builtin, bounds: () => rectCorners(4700, 2400, 600, 550) }]);
    expect(Math.abs(moved.x - 4975)).toBeGreaterThan(300 + moved.size);
    // A footprint with a non-finite vertex blocks nothing and never reaches the interval sort
    // as NaN. Here the spine stops short of the east wall (x 7000), so its last free run ends
    // at the segment's end, not at a wall band; and a real wardrobe stands on the wall-clear
    // station, so the station leaves tier 1 for the widest run clear of everything — that last
    // run, from the wardrobe to x 7000, the one a NaN cursor would lose (it draws at x 1025
    // instead when the guard is removed). The far piece at (500,500) reports an
    // extra vertex at y 2800, inside the number's band, whose x is NaN. The range check would
    // drop such a piece before the drawing, so it goes non-finite only when the station asks
    // (read off the call stack) — the guard itself is what is under test.
    const blocked = [
      'plan "Open end" {',
      "  units mm",
      "  dims auto walls",
      "  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }",
      "  wall id=spine partition thickness 100 { (0,3000) (7000,3000) }",
      "  wall id=tee partition thickness 100 { (2000,3000) (2000,6000) }",
      '  room id=a at (0,0) size 8000x3000 label "A" uses living',
      '  room id=b at (0,3000) size 2000x3000 label "B" uses bedroom',
      '  room id=c at (2000,3000) size 6000x3000 label "C" uses bedroom',
      "  furniture wardrobe at (500,500) size 600x600",
      "  furniture wardrobe at (4100,2400) size 600x550",
      "}",
    ];
    const run = (plugins: ElementDef[]) => {
      const out = compile(blocked.join("\n"), { noCache: true, plugins });
      expect(out.errors).toEqual([]);
      expect(out.svg).not.toContain("NaN");
      return calm100(out.scene as Scene);
    };
    const tier2 = run([]);
    expect(tier2.x).toBeGreaterThan(4700 + tier2.size); // the last run, past the wardrobe
    let asked = 0;
    const nan = run([
      {
        ...builtin,
        bounds: (el) => {
          const far = (el as RFurniture).at.x === 500;
          if (!far || !new Error().stack?.includes("thicknessStation")) return builtin.bounds(el);
          asked++;
          return [{ x: Number.NaN, y: 2800 }, ...builtin.bounds(el)];
        },
      },
    ]);
    expect(asked).toBeGreaterThan(0);
    expect(nan).toEqual(tier2);
  });
});

/** A spine wall with a tee: the "100" call-out's wall-clear station is x 4975 on the spine. */
const CALM = [
  'plan "Calm" {',
  "  units mm",
  "  dims auto walls",
  "  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }",
  "  wall id=spine partition thickness 100 { (0,3000) (8000,3000) }",
  "  wall id=tee partition thickness 100 { (2000,3000) (2000,6000) }",
  '  room id=a at (0,0) size 8000x3000 label "A" uses living',
  '  room id=b at (0,3000) size 2000x3000 label "B" uses bedroom',
  '  room id=c at (2000,3000) size 6000x3000 label "C" uses bedroom',
];
const calm100 = (sc: Scene) => dimTexts(sc).find((t) => t.value === "100")!;
