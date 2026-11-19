/**
 * Card AL5: a `dims auto` wall-thickness figure printed over a room's label moves to a place clear of everything drawn, or is not drawn and `W_DIM_THICKNESS_UNPLACED` says so.
 *
 * The figure is re-stationed after the label passes, when it meets a room's label by
 * `W_ANNOTATION_OVERLAP`'s own test, in order: the same wall and side; the next-longest straight
 * run of that thickness (the witness, `test/fixtures/dense-office.arch`); the other side where floor
 * stands under it; else it is not drawn. A place is taken only when the figure there is clear of
 * everything already drawn: labels, opening tags, axis bubbles, symbols, walls, door swings and the
 * other figures. Each step is pinned on a plan whose old drawing printed the figure over a label; the
 * red team's plans (a figure moved onto a tag, two figures onto each other, a figure into a swing, a
 * remodel's dropped and kept figures) are pinned against the audit below; the lint reads the
 * drawing's own layout (`drawnAutoDims`), so what it reports is what is drawn and what is not; and
 * past the label passes' count the figures left over a label are drawn there and reported.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, type Diagnostic, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { autoDimCount, autoDimensions, drawnAutoDims, toScene } from "../src/scene-build.js";
import { dimTextPrim } from "../src/elements/dim.js";
import { BUILTIN_RUNTIME } from "../src/registry.js";
import { fmt2 } from "../src/num-format.js";
import { textBox } from "../src/text-layout.js";
import { LINT_CODE_LAYERS } from "../src/lint.js";
import { NOT_GATED_DRAFTING } from "../src/furnish.js";
import { doorLeaves } from "../src/geometry.js";
import { clippedArea } from "../src/geometry/polygon.js";
import { sectorOf } from "../src/label-fit.js";
import { drawnView, type RDim, type RDoor } from "../src/ir.js";
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

/**
 * The red team's plans (round 1 on PR #959): before the re-station counted everything drawn, the
 * moved 200 figure landed on the D02 opening tag (`TAG`), the 150 and 200 figures on each other
 * (`PAIR`), and the figure inside door d0's swing (`SWING`).
 */
const TAG = `plan "F" {
  units mm
  grid 50
  paper A3 landscape
  scale 1:100
  dims auto walls
  schedule openings
  axes {
    x at 0, 2900, 6800
    y at 0, 4000
  }
  wall id=shell exterior thickness 200 { (0,0) (6800,0) (6800,4000) (0,4000) close }
  wall id=p1 partition thickness 200 { (2900,0) (2900,4000) }
  room id=r0 at (0,0) size 2900x4000 label "Kitchenette / Break" at (1000,350)
  room id=r1 at (2900,0) size 3900x4000 label "Office" at (4250,550)
  door id=d0 at (1750,4000) width 1000 wall shell swing out
  furniture table at (1350,3250) size 600x600
  door id=d1 at (5500,0) width 800 wall shell swing in
  window at (3750,4000) width 800 wall shell
}`;
const PAIR = `plan "F" {
  units mm
  grid 50
  paper A3 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 200 { (0,0) (12900,0) (12900,1900) (0,1900) close }
  wall id=p1 partition thickness 150 { (4400,0) (4400,1900) }
  wall id=p2 partition thickness 200 { (8400,0) (8400,1900) }
  wall id=p3 partition thickness 200 { (10400,0) (10400,1900) }
  room id=r0 at (0,0) size 4400x1900 label "Kitchenette / Break" at (1450,250)
  room id=r1 at (4400,0) size 4000x1900 label "Server and comms"
  room id=r2 at (8400,0) size 2000x1900 label "Meeting Room A" at (9350,450)
  room id=r3 at (10400,0) size 2500x1900 label "WC" at (12700,1500)
  door id=d0 at (3100,1900) width 800 wall shell swing out
  furniture table at (3100,950) size 600x600
  door id=d1 at (7650,1900) width 1000 wall shell swing in
  door id=pd1 on p1 at 1050 width 700 swing into r1
  window at (7600,1900) width 800 wall shell
  door id=d2 at (9350,0) width 1000 wall shell swing in
  door id=pd2 on p2 at 500 width 700 swing into r1
  window at (9200,0) width 800 wall shell
  door id=pd3 on p3 at 700 width 700 swing into r2
  window at (11950,0) width 800 wall shell
}`;
const SWING = `plan "F" {
  units mm
  grid 50
  paper A3 landscape
  scale 1:100
  dims auto all
  schedule openings
  axes {
    x at 0, 3000
    y at 0, 1500
  }
  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,1500) (0,1500) close }
  room id=r0 at (0,0) size 3000x1500 label "Kitchenette / Break" at (600,650)
  door id=d0 at (1850,0) width 1000 wall shell swing in
  window at (1950,0) width 800 wall shell
  furniture table at (2250,500) size 600x600
}`;
/** The red team's remodels: the 150 figure belongs on a `status demolish` partition the sheet still draws. */
const REMODEL_DROP = `plan "Remodel silent drop" {
  units mm
  paper A4 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,1200) (0,1200) close }
  wall id=old partition thickness 150 status demolish { (3000,0) (3000,1200) }
  room id=r at (0,0) size 6000x1200 label "Long corridor name" at (3000,600)
}`;
const REMODEL_KEPT = `plan "Remodel false unplaced" {
  units mm
  paper A4 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
  wall id=old partition thickness 100 status demolish { (3000,0) (3000,4000) }
  wall id=stub partition thickness 100 { (6000,0) (6000,1200) }
  room id=r at (0,0) size 9000x4000 label "Long open hall name" at (6000,600)
}`;

/** The drawn thickness figure for `value`, or undefined when none is drawn. */
function figure(scene: Scene, value: string): { x: number; y: number } | undefined {
  const n = scene.nodes.find((x) => x.layer === "dims" && x.prim.t === "text" && x.prim.value === value);
  return n?.prim.t === "text" ? n.prim.at : undefined;
}
const sceneOf = (src: string): Scene => toScene(resolvePlan(src).ir!);
/** A wall-thickness figure: the zero-offset call-out lettered with digits. */
const isThickness = (dm: RDim): boolean => dm.offset === 0 && /^\d/.test(dm.text ?? "");

/**
 * The red team's audit, independent of the code under test: every thickness figure as drawn, against
 * every other text on the sheet (by its turned box) and every door leaf's swept sector, at the 2 %
 * the rule and the label passes use. Returns what each figure is printed over, how many thickness
 * figures the plan lays out before the labels, how many are drawn, and how many the lint reports
 * as not drawn.
 */
function audit(src: string): { over: string[]; laidOut: number; drawn: number; unplaced: number } {
  const { ir } = resolvePlan(src);
  const scene = toScene(ir!, { annotate: true });
  const texts = scene.nodes.flatMap((n) => (n.prim.t === "text" ? [n.prim] : []));
  const thick = (drawnAutoDims(scene)?.dims ?? []).filter(isThickness).map((dm) => dimTextPrim(dm, scene.sizes, fmt2));
  const over: string[] = [];
  for (const p of thick) {
    const fb = textBox(p);
    for (const t of texts) {
      if (t.value === p.value && t.at.x === p.at.x && t.at.y === p.at.y) continue; // the figure itself
      if (clippedArea(textBox(t).rect, fb.rect) > 0.02 * fb.area) over.push(`${p.value} over "${t.value}"`);
    }
    for (const d of ir!.elements.filter((e) => e.kind === "door"))
      for (const leaf of doorLeaves(d as RDoor))
        if (clippedArea(sectorOf(leaf), fb.rect) > 0.02 * fb.area) over.push(`${p.value} over the swing of ${d.id}`);
  }
  return {
    over,
    laidOut: autoDimensions(drawnView(ir!), scene.sizes, BUILTIN_RUNTIME.registry).filter(isThickness).length,
    drawn: thick.length,
    unplaced: of(src, UNPLACED).length,
  };
}

suite("a figure over a label is taken elsewhere", () => {
  it("the witness: the 200 figure keeps its first station once the kitchenette's name is led away", () => {
    const at = figure(sceneOf(WITNESS), "200")!;
    // The longest 200 run is the north wall (y 0), and the figure is written into the boardroom
    // beside it. The kitchenette's name, which ran past its wall over that station, now stands in
    // the corridor at the end of a leader (card AL3b), so the figure meets no label and is not moved
    // (the move itself: CROWDED, below).
    expect(at.x).toBe(8325);
    expect(at.y).toBeGreaterThan(0);
    expect(at.y).toBeLessThan(3000);
    expect(of(WITNESS, OVERLAP)).toEqual([]);
    expect(of(WITNESS, UNPLACED)).toEqual([]);
  });

  it("on the other side of its wall, when the floor side has no clear place and there is floor there", () => {
    const s = sceneOf(CROWDED);
    // The partition's figure was written east of it, into Store B, over its pinned name: now west.
    const p = figure(s, "150")!;
    expect(p.x).toBeLessThan(3000);
    expect(p.y).toBe(600);
    // The 200 figure moves along the same north wall, off Store A's name.
    const t = figure(s, "200")!;
    expect(t.x).toBeGreaterThan(3000);
    expect(of(CROWDED, OVERLAP)).toEqual([]);
    expect(of(CROWDED, UNPLACED)).toEqual([]);
  });

  it("a figure that meets no label is drawn where the layout before the labels puts it", () => {
    const s = sceneOf(CLEAR);
    const before = autoDimensions(resolvePlan(CLEAR).ir!, s.sizes, BUILTIN_RUNTIME.registry);
    const drawn = s.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
    expect(drawn).toEqual(before.map((dm) => dimTextPrim(dm, s.sizes, fmt2)));
    // The control: with the crowded pins, that layout is NOT what is drawn.
    const c = sceneOf(CROWDED);
    const crowded = autoDimensions(resolvePlan(CROWDED).ir!, c.sizes, BUILTIN_RUNTIME.registry);
    const crowdedDrawn = c.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
    expect(crowdedDrawn).not.toEqual(crowded.map((dm) => dimTextPrim(dm, c.sizes, fmt2)));
  });
});

suite("a moved figure is clear of everything drawn, and none is left out silently", () => {
  for (const [name, src] of [
    ["onto an opening tag", TAG],
    ["two figures onto each other", PAIR],
    ["into a door's swing", SWING],
    ["a remodel whose figure is dropped", REMODEL_DROP],
    ["a remodel whose figure moves", REMODEL_KEPT],
    ["the witness", WITNESS],
    ["two stores", CROWDED],
    ["the WC", WC],
  ] as const) {
    it(`${name}: no drawn thickness figure is over a text or a swing, and drawn + reported = laid out`, () => {
      const a = audit(src);
      expect(a.over).toEqual([]);
      expect(a.drawn + a.unplaced).toBe(a.laidOut);
    });
  }

  it("each of the red team's plans really moved or dropped a figure (so the audit above ran on one)", () => {
    for (const src of [TAG, PAIR, SWING, REMODEL_DROP, REMODEL_KEPT]) {
      const { ir } = resolvePlan(src);
      const scene = toScene(ir!);
      const before = autoDimensions(drawnView(ir!), scene.sizes, BUILTIN_RUNTIME.registry).filter(isThickness);
      const after = (drawnAutoDims(scene)?.dims ?? []).filter(isThickness);
      expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    }
  });

  it("the remodel that drops its 150 figure says so, at the demolished wall it belongs on", () => {
    const [d, ...rest] = of(REMODEL_DROP, UNPLACED);
    expect(rest).toEqual([]);
    expect(d!.message).toMatch(/^The wall-thickness figure 150 that `dims auto all` writes is not drawn/);
    expect(REMODEL_DROP.slice(d!.span!.start, d!.span!.end)).toMatch(/^wall id=old/);
    expect(of(REMODEL_KEPT, UNPLACED)).toEqual([]);
  });
});

suite("no clear place: the figure is not drawn, and W_DIM_THICKNESS_UNPLACED says which", () => {
  it("draws no 200 figure, and the warning names the wall, the thickness and the pinned label", () => {
    const s = sceneOf(WC);
    expect(figure(s, "200")).toBeUndefined();
    const [d, ...rest] = of(WC, UNPLACED);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(
      'The wall-thickness figure 200 that `dims auto all` writes is not drawn: where it would stand it is printed over the label of "WC", and neither the exterior wall of "WC", the longest straight wall of that thickness, nor the next longest has any other place for it, on a side with floor, clear of everything drawn there (labels, tags, symbols, walls, door swings and other figures).',
    );
    // The label is pinned, so the hint moves its point rather than asking for one.
    expect(d!.hints?.[0]).toBe(
      'Move the `label "WC" at (x,y)` point of room `r` clear of it, or move what stands along that wall (`shell`); or draw with `dims auto rooms` and state the 200 thickness with a hand `dim` (`offset 0`, face to face) where it reads clear.',
    );
    expect(WC.slice(d!.span!.start, d!.span!.end)).toMatch(/^wall id=shell/);
    // The figure it replaces is no longer reported over the name: it is not on the sheet.
    expect(of(WC, OVERLAP)).toEqual([]);
  });

  it("an unpinned label is offered a clear point instead", () => {
    // The WC's label unpinned: the placer leaves it at the centre, under every station.
    const src = WC.replace(" at (600,600)", "");
    const ds = of(src, UNPLACED);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints?.[0]).toMatch(/^Give the label of room `r` a clear point with `label "…" at \(x,y\)`/);
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
    for (const src of [WITNESS, CROWDED, CLEAR, TAG, PAIR, REMODEL_KEPT]) expect(of(src, UNPLACED)).toEqual([]);
    // The swing plan's figure has no clear place: it is left out, and said to be.
    expect(of(SWING, UNPLACED)).toHaveLength(1);
  });
});

suite("the drawing and the lint read one layout", () => {
  for (const [name, src] of [
    ["the witness", WITNESS],
    ["two stores", CROWDED],
    ["the WC", WC],
    ["a remodel", REMODEL_DROP],
  ] as const) {
    it(`${name}: the layout kept beside the Scene is what it draws, annotated or not`, () => {
      const { ir } = resolvePlan(src);
      const scene = toScene(ir!, { annotate: true });
      const drawn = scene.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
      const laid = drawnAutoDims(scene)!;
      expect(laid.dims.map((dm) => dimTextPrim(dm, scene.sizes, fmt2))).toEqual(drawn);
      expect(of(src, UNPLACED)).toHaveLength(laid.unplaced.length);
      const plain = toScene(ir!)
        .nodes.filter((n) => n.layer === "dims" && n.prim.t === "text")
        .map((n) => n.prim);
      expect(plain).toEqual(drawn);
    });
  }
});

suite("past the label passes' count", () => {
  it("a figure left over a label is drawn there and reported; none is left out silently", () => {
    // Four storeys of 600 distinct wall thicknesses, each lettered over a pinned label: each storey's
    // re-station runs out of its quarter of the label-fit count part-way (a count, so at the same
    // figure on every machine), and the figures after that keep the stations they were drawn at,
    // where `W_ANNOTATION_OVERLAP` (within its own count here) reports each.
    const n = 600;
    const levels = 4;
    const lines = [`plan "B" {`, "  units mm", "  paper A0 landscape", "  scale 1:500", "  dims auto walls"];
    for (let lv = 1; lv <= levels; lv++) {
      lines.push(`  level ${lv} {`);
      lines.push(`    wall id=shell exterior thickness 30 { (0,0) (${n * 1200},0) (${n * 1200},1200) (0,1200) close }`);
      for (let i = 1; i < n; i++)
        lines.push(`    wall id=p${i} partition thickness ${40 + i} { (${i * 1200},0) (${i * 1200},1200) }`);
      for (let i = 0; i < n; i++)
        lines.push(
          `    room id=r${i} at (${i * 1200},0) size 1200x1200 label "Room number ${i}" at (${i * 1200 + 600},600)`,
        );
      lines.push("  }");
    }
    lines.push("}");
    const src = lines.join("\n");
    const ds = lint(src);
    const kept = ds.filter((d) => d.code === OVERLAP && /^The wall-thickness figure/.test(d.message)).length;
    const unplaced = ds.filter((d) => d.code === UNPLACED).length;
    let drawn = 0;
    let overLabel = 0;
    for (const { ir } of resolvePlan(src).levels) {
      const scene = toScene(ir, { annotate: true });
      const labels = scene.nodes.flatMap((x) =>
        x.elementKind === "room" && x.prim.t === "text" ? [textBox(x.prim)] : [],
      );
      for (const dm of (drawnAutoDims(scene)?.dims ?? []).filter(isThickness)) {
        drawn++;
        const fb = textBox(dimTextPrim(dm, scene.sizes, fmt2));
        if (labels.some((l) => clippedArea(l.rect, fb.rect) > 0.02 * fb.area)) overLabel++;
      }
    }
    expect(kept).toBeGreaterThan(0);
    expect(unplaced).toBeGreaterThan(0);
    // Every figure is drawn or reported as not drawn, and every one drawn over a label is reported.
    expect(drawn + unplaced).toBe(n * levels);
    expect(kept).toBe(overLabel);
  }, 120_000);
});
