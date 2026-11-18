/**
 * Card AL5: a `dims auto` wall-thickness figure printed over a room's label moves off it, or is not drawn and `W_DIM_THICKNESS_UNPLACED` says so.
 *
 * The figure is re-stationed after the label passes, by `W_ANNOTATION_OVERLAP`'s own test of a
 * number against a label, in order: the same wall and side with the labels as blockers; the
 * next-longest straight run of that thickness (the witness, `test/fixtures/dense-office.arch`); the
 * other side where floor stands under it; else it is not drawn. Each step is pinned on a plan whose
 * old drawing printed the figure over a label, the drawing and the lint agree on where every
 * number stands (`autoDimensions` with the labels' boxes is what the Scene draws), and the warning
 * fires on the plan with no clear place and on none of the others.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, type Diagnostic, diagnosticOverprint, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { autoDimCount, autoDimensions, toScene } from "../src/scene-build.js";
import { dimTextPrim } from "../src/elements/dim.js";
import { BUILTIN_RUNTIME } from "../src/registry.js";
import { fmt2 } from "../src/num-format.js";
import { textBox } from "../src/text-layout.js";
import { LINT_CODE_LAYERS } from "../src/lint.js";
import { NOT_GATED_DRAFTING } from "../src/furnish.js";
import type { Scene } from "../src/scene.js";

const UNPLACED = "W_DIM_THICKNESS_UNPLACED";
const OVERLAP = "W_ANNOTATION_OVERLAP";
const of = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);
const WITNESS = readFileSync("test/fixtures/dense-office.arch", "utf8");

/** Two 3 x 1.2 m stores either side of a 150 mm partition, each label pinned where `a` and `b` say. */
const stores = (a: string, b: string, names: readonly [string, string] = ["Store A", "Store B"]) => `plan "Two stores" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,1200) (0,1200) close }
  wall id=mid partition thickness 150 { (3000,0) (3000,1200) }
  room id=r_a at (0,0) size 3000x1200 label "${names[0]}" at ${a} uses storage
  room id=r_b at (3000,0) size 3000x1200 label "${names[1]}" at ${b} uses storage
}`;
/** Store B's label pinned against the partition, on the side its figure was written; Store A's on the 200 figure's old station. */
const CROWDED = stores("(1000,600)", "(3850,600)");
/** The same pins with one-letter names, which neither figure meets where it stands with no labels. */
const CLEAR = stores("(1000,600)", "(5000,600)", ["A", "B"]);

/** A 1.2 m square WC whose name is pinned at its centre: no wall of 200 has room for the figure. */
const WC = `plan "WC" {
  units mm
  paper A4 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 200 { (0,0) (1200,0) (1200,1200) (0,1200) close }
  room id=r at (0,0) size 1200x1200 label "WC" at (600,600)
}`;

/** The drawn thickness figure for `value`, or undefined when none is drawn. */
function figure(scene: Scene, value: string): { x: number; y: number } | undefined {
  const n = scene.nodes.find((x) => x.layer === "dims" && x.prim.t === "text" && x.prim.value === value);
  return n?.prim.t === "text" ? n.prim.at : undefined;
}
const sceneOf = (src: string): Scene => toScene(resolvePlan(src).ir!);

suite("a figure over a label is taken elsewhere", () => {
  it("the witness: the 200 figure leaves the boardroom for the south wall, the next-longest 200 run", () => {
    const at = figure(sceneOf(WITNESS), "200")!;
    // The longest 200 run is the north wall (y 0); the next is the south wall (y 12500), and the
    // figure is written into the open-plan floor beside it, between its windows.
    expect(at.y).toBeGreaterThan(11000);
    expect(at.y).toBeLessThan(12500);
    expect(at.x).toBeGreaterThan(11500);
    expect(at.x).toBeLessThan(14500);
    const subjects = of(WITNESS, OVERLAP).map((d) => diagnosticOverprint(d)?.subject.kind);
    expect(subjects).toEqual(["room-label", "room-label"]);
    expect(of(WITNESS, UNPLACED)).toEqual([]);
  });

  it("on the other side of its wall, when the floor side has no clear place and there is floor there", () => {
    const s = sceneOf(CROWDED);
    // The partition's figure was written east of it, into Store B, over its pinned name: now west.
    const p = figure(s, "150")!;
    expect(p.x).toBeLessThan(3000);
    expect(p.y).toBe(600);
    // The 200 figure moves along the same north wall, off Store A's name, with the labels as blockers.
    const t = figure(s, "200")!;
    expect(t.x).toBeGreaterThan(3000);
    expect(of(CROWDED, OVERLAP)).toEqual([]);
    expect(of(CROWDED, UNPLACED)).toEqual([]);
  });

  it("a figure that meets no label is drawn where the layout with no labels puts it", () => {
    const s = sceneOf(CLEAR);
    const noLabels = autoDimensions(resolvePlan(CLEAR).ir!, s.sizes, BUILTIN_RUNTIME.registry, []);
    const drawn = s.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
    expect(drawn).toEqual(noLabels.map((dm) => dimTextPrim(dm, s.sizes, fmt2)));
    // The control: with the crowded pins, the same layout is NOT what is drawn.
    const c = sceneOf(CROWDED);
    const crowdedNoLabels = autoDimensions(resolvePlan(CROWDED).ir!, c.sizes, BUILTIN_RUNTIME.registry, []);
    const crowdedDrawn = c.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
    expect(crowdedDrawn).not.toEqual(crowdedNoLabels.map((dm) => dimTextPrim(dm, c.sizes, fmt2)));
  });
});

suite("no clear place: the figure is not drawn, and W_DIM_THICKNESS_UNPLACED says which", () => {
  it("draws no 200 figure, and the warning names the wall and the thickness", () => {
    const s = sceneOf(WC);
    expect(figure(s, "200")).toBeUndefined();
    const [d, ...rest] = of(WC, UNPLACED);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(
      'The wall-thickness figure 200 that `dims auto all` writes is not drawn: it would be printed over a room\'s name or area figure, and neither the exterior wall of "WC", the longest straight wall of that thickness, nor the next longest has any other place for it, on a side with floor, clear of the room labels, crossing walls, openings, furniture and stairs.',
    );
    expect(d!.hints?.[0]).toContain("(`shell`)");
    expect(d!.hints?.[0]).toContain("`dims auto rooms`");
    expect(WC.slice(d!.span!.start, d!.span!.end)).toMatch(/^wall id=shell/);
    // The figure it replaces is no longer reported over the name: it is not on the sheet.
    expect(of(WC, OVERLAP)).toEqual([]);
  });

  it("a figure not drawn draws nothing, and the drawing budget's count still covers what is drawn", () => {
    const { ir } = resolvePlan(WC);
    const s = toScene(ir!);
    const dims = s.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").length;
    expect(dims).toBe(autoDimCount(ir!) - 1);
  });

  it("is a drafting advisory, which `finish` does not count; compile() draws the plan without the figure", () => {
    expect(LINT_CODE_LAYERS[UNPLACED]).toBe("drafting");
    expect(NOT_GATED_DRAFTING.has(UNPLACED)).toBe(true);
    const out = compile(WC);
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(out.svg).not.toContain(">200</text>");
  });

  it("fires only where the drawing leaves a figure out", () => {
    for (const src of [WITNESS, CROWDED, CLEAR]) expect(of(src, UNPLACED)).toEqual([]);
  });
});

suite("the drawing and the lint read one layout", () => {
  for (const [name, src] of [
    ["the witness", WITNESS],
    ["two stores", CROWDED],
    ["the WC", WC],
  ] as const) {
    it(`${name}: autoDimensions with the room labels' boxes is what the Scene draws`, () => {
      const { ir } = resolvePlan(src);
      const scene = toScene(ir!, { annotate: true });
      const labels = scene.nodes
        .filter((n) => n.elementKind === "room" && n.prim.t === "text")
        .map((n) => (n.prim.t === "text" ? textBox(n.prim) : undefined)!);
      const drawn = scene.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
      const placed = autoDimensions(ir!, scene.sizes, BUILTIN_RUNTIME.registry, labels).map((dm) =>
        dimTextPrim(dm, scene.sizes, fmt2),
      );
      expect(placed).toEqual(drawn);
      // And the unannotated drawing is the same drawing.
      const plain = toScene(ir!)
        .nodes.filter((n) => n.layer === "dims" && n.prim.t === "text")
        .map((n) => n.prim);
      expect(plain).toEqual(drawn);
    });
  }
});
