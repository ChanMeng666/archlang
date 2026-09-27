/**
 * `describe(src, { facts: ["symmetry"] })` — the plan's symmetry group per layer, and its
 * repeated rooms.
 *
 * ## The law
 *
 * A symmetry group is a STABILISER, and the stabiliser of a moved set is the conjugate of
 * the original's: for every g in D4 ⋉ Z²,
 *
 *   Stab(g·P) = g · Stab(P) · g⁻¹,   centre(g·P) = g(centre(P)).
 *
 * It is checked through the W1 oracle's wrapper (`test/d4-oracle.ts`): P₀ and gP are the
 * same example imported whole and placed once, at the identity and by g, so both sides carry
 * the same `g.` ids and the prediction is made with `src/algebra/d4.ts`'s own `compose` and
 * `inverse` and `src/frame.ts`'s own point map. A D1 whose axis turns under a quarter-turn,
 * and a centre that moves with the translation, are what make it bite — a module that
 * reported a fixed answer, or measured in page terms, fails it.
 *
 * ## Hand cases
 *
 * Each group the module can name, on a shape whose group is known by construction, plus
 * the two corpus plans the card names, reported as they truly are.
 */

import { describe as suite, expect, it } from "vitest";
import { compose, fromSpelling, inverse } from "../src/algebra/d4.js";
import { tp } from "../src/frame.js";
import { describe, type LayerSymmetry, type SceneSummary, type SymmetryFacts } from "../src/index.js";
import {
  astOf,
  corpusElements,
  D4_ELEMENTS,
  ELIGIBLE_EXAMPLES,
  EXAMPLE_FILES,
  EXAMPLES_WORLD,
  frameFor,
  type GroupElement,
  TRANSLATION,
  witnessPair,
  wrapperSource,
} from "./d4-oracle.js";
import { KNOWN } from "./equivariance-known.js";

const LAYERS = ["shell", "rooms", "full"] as const;

function facts(src: string): SceneSummary {
  const s = describe(src, { world: EXAMPLES_WORLD, facts: ["symmetry", "syntax"] });
  expect(s.ok, s.diagnostics.map((d) => d.message).join(" | ")).toBe(true);
  return s;
}

const sym = (src: string): SymmetryFacts => facts(src).symmetry!;

/** A group's elements as canonical `k,f` keys, sorted. */
const elementKeys = (l: LayerSymmetry): string[] =>
  l.elements
    .map((e) => fromSpelling(e.rotate, e.mirror))
    .map((g) => `${g.k},${g.f}`)
    .sort();

/** The layer gP must report, predicted from P₀'s by conjugation and the frame. */
function predict(
  l0: LayerSymmetry,
  g: GroupElement,
  grid: number,
): { els: string[]; centre: { x: number; y: number } } {
  const gd = fromSpelling(g.rotate, g.mirror);
  const els = l0.elements
    .map((e) => compose(compose(gd, fromSpelling(e.rotate, e.mirror)), inverse(gd)))
    .map((h) => `${h.k},${h.f}`)
    .sort();
  const c = tp(frameFor(g, grid), l0.centre);
  return { els, centre: { x: c.x + 0, y: c.y + 0 } };
}

/** Every conjugation-law violation between two symmetry reports. */
function conjugationViolations(s0: SymmetryFacts, sG: SymmetryFacts, g: GroupElement, grid: number): string[] {
  const out: string[] = [];
  for (const layer of LAYERS) {
    const l0 = s0.layers[layer];
    const lG = sG.layers[layer];
    if (l0 === null || lG === null) {
      if (l0 !== lG) out.push(`${layer}: one side is null`);
      continue;
    }
    const p = predict(l0, g, grid);
    if (JSON.stringify(elementKeys(lG)) !== JSON.stringify(p.els)) {
      out.push(`${layer}: elements ${elementKeys(lG)} ≠ predicted ${p.els}`);
    }
    if (lG.centre.x !== p.centre.x || lG.centre.y !== p.centre.y) {
      out.push(`${layer}: centre ${JSON.stringify(lG.centre)} ≠ predicted ${JSON.stringify(p.centre)}`);
    }
    if (lG.group !== l0.group) out.push(`${layer}: group ${lG.group} ≠ ${l0.group} (conjugates have one type)`);
    if (lG.exact !== l0.exact) out.push(`${layer}: exact ${lG.exact} ≠ ${l0.exact}`);
  }
  return out;
}

const groupOf = (l: LayerSymmetry | null): string =>
  l === null ? "null" : `${l.group}${l.axis ? ` ${l.axis}` : ""}${l.axes ? ` ${l.axes.join("/")}` : ""}`;

// ---------------------------------------------------------------------------
// Hand cases
// ---------------------------------------------------------------------------

const SQUARE = `
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Room" uses living`;

const RECT = `
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    room id=r at (0,0) size 8000x4000 label "Room" uses living`;

/** The L is symmetric about the line through its corner and its re-entrant corner. */
const L_SHAPE = `
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) close }
    room id=r polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "L" uses living`;

/** Four hooks, each the last turned a quarter about (5000,5000): chiral, so C4 and no mirror. */
const PINWHEEL = `
    wall id=h1 partition thickness 100 { (5000,5000) (8000,5000) (8000,6000) }
    wall id=h2 partition thickness 100 { (5000,5000) (5000,8000) (4000,8000) }
    wall id=h3 partition thickness 100 { (5000,5000) (2000,5000) (2000,4000) }
    wall id=h4 partition thickness 100 { (5000,5000) (5000,2000) (6000,2000) }`;

/** The rectangle with four windows placed D2-symmetrically. */
const RECT_WINDOWS = `${RECT}
    window id=w1 at (2000,0) width 1200 wall shell
    window id=w2 at (6000,0) width 1200 wall shell
    window id=w3 at (2000,4000) width 1200 wall shell
    window id=w4 at (6000,4000) width 1200 wall shell`;

/**
 * The rectangle with two sliding doors arranged C2 (each the other turned a half), so
 * `full` is C2 and the law has a non-trivial group whose record reads the track.
 */
const RECT_SLIDERS = `${RECT}
    door id=d1 sliding at (2000,4000) width 1200 wall shell slide left
    door id=d2 sliding at (6000,0) width 1200 wall shell slide left`;

/**
 * A unit with a stair, placed twice stacked, the second `mirror y` — `full` is D1 y only
 * when the carried `_tail` (arrow down) and `_mirror` (break hand) are read. Declared as
 * the witness component itself, so the law places this whole composition by every g and
 * the nested frames compose with it.
 */
const STAIR_PAIR_DECL = `component u() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "R" uses hall
    stair id=s at (1500,500) size 1000x3000 dir up
  }
  component c() {
    place u() as a at (0,0)
    place u() as b at (0,8000) mirror y
  }`;

const plan = (body: string): string => `plan "hand" {\n  units mm\n  grid 50\n${body}\n}\n`;

suite("symmetry — hand cases", () => {
  it("a square room is D4 on every layer", () => {
    const s = sym(plan(SQUARE));
    for (const layer of LAYERS) expect(groupOf(s.layers[layer]), layer).toBe("D4");
    expect(s.layers.shell!.centre).toEqual({ x: 2000, y: 2000 });
    expect(s.layers.shell!.elements).toHaveLength(8);
    expect(s.layers.shell!.exact).toBe(true);
  });

  it("a 2:1 rectangle is D2 about its two axis-parallel lines", () => {
    const s = sym(plan(RECT));
    expect(groupOf(s.layers.shell)).toBe("D2 x/y");
    expect(groupOf(s.layers.rooms)).toBe("D2 x/y");
    expect(s.layers.shell!.elements).toEqual([
      { rotate: 0 },
      { rotate: 180 },
      { rotate: 0, mirror: "x" },
      { rotate: 180, mirror: "x" },
    ]);
  });

  it("an L is D1 about its diagonal — the box's other symmetries fail on the shape", () => {
    const s = sym(plan(L_SHAPE));
    expect(groupOf(s.layers.shell)).toBe("D1 diag");
    expect(groupOf(s.layers.rooms)).toBe("D1 diag");
    expect(s.layers.shell!.centre).toEqual({ x: 3000, y: 3000 });
  });

  it("a pinwheel is C4: every quarter-turn, no mirror", () => {
    const s = sym(plan(PINWHEEL));
    expect(groupOf(s.layers.shell)).toBe("C4");
    expect(s.layers.shell!.centre).toEqual({ x: 5000, y: 5000 });
    expect(s.layers.rooms).toBeNull();
    expect(s.layers.full).toBeNull();
  });

  it("maximal-line normal form: splitting a wall into statements does not change the answer", () => {
    const split = `
    wall id=a exterior thickness 200 { (0,0) (3000,0) }
    wall id=b exterior thickness 200 { (2000,0) (8000,0) (8000,4000) (5000,4000) }
    wall id=c exterior thickness 200 { (5000,4000) (0,4000) (0,0) }
    room id=r at (0,0) size 8000x4000 label "Room" uses living`;
    expect(groupOf(sym(plan(split)).layers.shell)).toBe("D2 x/y");
    // …and a thickness is a label: one thicker side is no longer symmetric with its twin.
    const thick = split.replace("wall id=c exterior thickness 200", "wall id=c exterior thickness 300");
    expect(groupOf(sym(plan(thick)).layers.shell)).toBe("C1");
  });

  it("rooms are labelled by uses, not by label text", () => {
    const two = (a: string, b: string): string => `
    room id=r1 at (0,0) size 4000x4000 label "${a}" uses bedroom
    room id=r2 at (4000,0) size 4000x4000 label "${b}" uses bedroom`;
    expect(groupOf(sym(plan(two("Bed 1", "Bed 2"))).layers.rooms)).toBe("D2 x/y");
    const mixed = two("Bed", "Study").replace(/uses bedroom$/, "uses office");
    // Different uses: the swap fails, and only the line both rooms straddle survives.
    expect(groupOf(sym(plan(mixed)).layers.rooms)).toBe("D1 y");
  });

  it("non-vacuity: moving ONE window breaks `full` and leaves `shell` and `rooms` alone", () => {
    const before = sym(plan(RECT_WINDOWS));
    expect(groupOf(before.layers.full)).toBe("D2 x/y");
    const after = sym(plan(RECT_WINDOWS.replace("window id=w1 at (2000,0)", "window id=w1 at (2500,0)")));
    expect(groupOf(after.layers.full)).toBe("C1");
    expect(after.layers.shell).toEqual(before.layers.shell);
    expect(after.layers.rooms).toEqual(before.layers.rooms);
  });

  it("a hinged door is chiral: its hinge side decides the mirror", () => {
    // One door on the axis cannot be mirror-symmetric (the hinge is on one jamb)…
    const onAxis = `${RECT}\n    door id=d at (4000,4000) width 900 wall shell hinge left swing in`;
    expect(groupOf(sym(plan(onAxis)).layers.full)).toBe("C1");
    // …two doors hinged on mirror-image jambs are; hinged on the same jamb they are not.
    const pair = (h2: string): string =>
      `${RECT}\n    door id=d1 at (2000,4000) width 900 wall shell hinge left swing in\n    door id=d2 at (6000,4000) width 900 wall shell hinge ${h2} swing in`;
    expect(groupOf(sym(plan(pair("right"))).layers.full)).toBe("D1 x");
    expect(groupOf(sym(plan(pair("left"))).layers.full)).toBe("C1");
  });

  it("terrace-row is C1 on every layer and repeats nothing — what it truly is", () => {
    // Its widths are 5400/5400/6000/5400 and alternate units step back 600 from the street,
    // so no unit is an exact translate or mirror image of another: the sawtooth and the one
    // wider unit break every candidate.
    const s = sym(EXAMPLE_FILES["terrace-row.arch"]!);
    for (const layer of LAYERS) expect(groupOf(s.layers[layer]), layer).toBe("C1");
    expect(s.layers.shell!.centre).toEqual({ x: 11100, y: 4800 });
    expect(s.repeats).toEqual([]);
  });

  it("terrace-row with equal widths and no setback IS a mirror terrace (the docs' claim)", () => {
    const src = EXAMPLE_FILES["terrace-row.arch"]!;
    const even = src
      .replace("let SETBACK = 600 ", "let SETBACK = 0   ")
      .replace("let widths  = [5400, 5400, 6000, 5400]", "let widths  = [5400, 5400, 5400, 5400]");
    expect(even).not.toBe(src);
    const s = sym(even);
    for (const layer of LAYERS) expect(groupOf(s.layers[layer]), layer).toBe("D1 x");
    expect(s.layers.shell!.centre.x).toBe(10800);
    const run = (room: string) => ({
      kind: "mirror",
      count: 4,
      axis: "x",
      step: { x: 10800, y: 0 },
      lines: [5400, 10800, 16200],
      ids: [1, 2, 3, 4].map((i) => `u${i}.${room}`),
    });
    expect(s.repeats).toEqual([
      { kind: "translate", count: 4, step: { x: 5400, y: 0 }, ids: ["u1.hall", "u2.hall", "u3.hall", "u4.hall"] },
      run("bed"),
      run("bath"),
      run("living"),
    ]);
  });

  it("museum-wings: the mirrored wings make shell and rooms D1 x; the door hinges break `full`", () => {
    const src = EXAMPLE_FILES["museum-wings.arch"]!;
    const s = sym(src);
    expect(groupOf(s.layers.shell)).toBe("D1 x");
    expect(groupOf(s.layers.rooms)).toBe("D1 x");
    expect(s.layers.shell!.centre).toEqual({ x: 21000, y: 6000 });
    // `full` is C1, and that is the TRUE answer: `d_main` is one hinged door on the axis,
    // and `d_west`/`d_east` hinge on opposite jambs (`hinge left` on the west shell's
    // downward run is its NORTH jamb, `hinge right` on the east one's is its SOUTH jamb).
    expect(groupOf(s.layers.full)).toBe("C1");
    // Drop the axis door and hinge the west door like its mirror twin: `full` becomes D1 x.
    const fixed = src
      .split("\n")
      .filter((l) => !l.includes("door id=d_main"))
      .join("\n")
      .replace("wall west.shell  hinge left  swing into hall", "wall west.shell  hinge right swing into hall");
    expect(fixed).not.toBe(src);
    expect(groupOf(sym(fixed).layers.full)).toBe("D1 x");
    // The two wings' galleries repeat at a 6 m step, each wing its own run.
    expect(s.repeats).toEqual([
      { kind: "translate", count: 3, step: { x: 6000, y: 0 }, ids: ["west.g1", "west.g2", "west.g3"] },
      { kind: "translate", count: 3, step: { x: 6000, y: 0 }, ids: ["east.g3", "east.g2", "east.g1"] },
    ]);
  });
});

/**
 * The handed facts a `place` frame carries on a resolved element (`RDoor._mirror`,
 * `RStair._tail`/`_mirror`): `full` must read them, because the drawing does.
 *
 * Each case is a PAIR on the same symmetric shell: one placed plainly at the mirrored
 * position (whose handed part is NOT the mirror image) and one placed `mirror x` (whose
 * handed part is). A module that ignored the fact would answer the same for both.
 */
suite("symmetry — frame-carried handedness in `full`", () => {
  /** Two 4 m square units side by side, each with its own shell; `b` plain or mirrored. */
  const pair = (body: string, mirrored: boolean): string =>
    plan(`
  component c() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
${body}
  }
  place c() as a at (0,0)
  place c() as b at ${mirrored ? "(8000,0) mirror x" : "(4000,0)"}`);

  /** The element must really have hosted — else its record is one bare point and the case proves nothing. */
  const hosted = (src: string, id: string): void => {
    const s = facts(src);
    expect(s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(s.access.edges.find((e) => e.doorId === id)?.hostWallId, `${id} hosts on its unit's shell`).toBeDefined();
  };

  it("a sliding door's track: two ROOT doors with mirrored slides are not mirror images", () => {
    // The fixed panel's track is `slide` times the wall's left normal — so on one wall,
    // `slide left` and `slide right` put it on OPPOSITE faces, and no root pair mirrors.
    const root = `${RECT}
    door id=d1 sliding at (2000,4000) width 1200 wall shell slide left
    door id=d2 sliding at (6000,4000) width 1200 wall shell slide right`;
    expect(groupOf(sym(plan(root)).layers.full)).toBe("C1");
  });

  it("a sliding door's track: `place … mirror x` makes the true mirror image (`RDoor._mirror`)", () => {
    // Centred on its unit's south wall, so the plain copy's jambs DO mirror the first's and
    // only the slide side and the track can tell the two placements apart.
    const body = `
    room id=r at (0,0) size 4000x4000 label "R" uses living
    door id=d sliding at (2000,4000) width 1200 wall shell slide left`;
    for (const m of [false, true]) hosted(pair(body, m), `${m ? "b" : "a"}.d`);
    const mirrored = sym(pair(body, true));
    const plain = sym(pair(body, false));
    expect(groupOf(mirrored.layers.rooms)).toBe("D2 x/y");
    expect(groupOf(mirrored.layers.full)).toBe("D1 x");
    expect(groupOf(plain.layers.full)).toBe("C1");
    // The TRACK alone decides it: a pocket door (slide side read, no track) in the same
    // pair mirrors as well — so it is the `_mirror`-reversed track, not the slide side,
    // that the sliding case above leans on.
    const pocket = body.replace("sliding", "pocket");
    expect(groupOf(sym(pair(pocket, true)).layers.full)).toBe("D1 x");
  });

  it("a stair's tail and break hand (`RStair._tail`, `_mirror`)", () => {
    const body = `
    room id=r at (0,0) size 4000x4000 label "R" uses hall
    stair id=s at (500,500) size 1000x3000 dir up`;
    const mirrored = sym(pair(body, true));
    const plain = sym(pair(body, false));
    expect(groupOf(mirrored.layers.rooms)).toBe("D2 x/y");
    // Mirrored: the footprint, arrow and break line are all the mirror image.
    expect(groupOf(mirrored.layers.full)).toBe("D1 x");
    // Plain at the mirrored position: footprint and arrow match, the break line does not.
    expect(groupOf(plain.layers.full)).toBe("C1");
  });

  it("a stair's tail under `mirror y`: the carried tail, not the root page rule", () => {
    // Stacked, `b` reflected about y = 4000. The root rule would enter b's portrait `up`
    // flight from its bottom again (arrow up); the carried `_tail` is its TOP (arrow down),
    // the true mirror image of a's — and only that reading makes the pair D1 y.
    const src = plan(`
  component c() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "R" uses hall
    stair id=s at (1500,500) size 1000x3000 dir up
  }
  place c() as a at (0,0)
  place c() as b at (0,8000) mirror y`);
    const s = sym(src);
    expect(groupOf(s.layers.rooms)).toBe("D2 x/y");
    expect(groupOf(s.layers.full)).toBe("D1 y");
  });
});

suite("symmetry — repeats", () => {
  it("a translational run: ≥3 congruent rooms at a constant step, sorted by (y, x)", () => {
    const s = sym(
      plan(`
    room id=a at (0,0) size 3000x4000 label "A" uses bedroom
    room id=c at (6000,0) size 3000x4000 label "C" uses bedroom
    room id=b at (3000,0) size 3000x4000 label "B" uses bedroom
    room id=odd at (9000,0) size 3000x4000 label "D" uses office`),
    );
    expect(s.repeats).toEqual([{ kind: "translate", count: 3, step: { x: 3000, y: 0 }, ids: ["a", "b", "c"] }]);
  });

  it("furniture is part of the motif: one unfurnished room ends the run", () => {
    const row = (withBed: boolean): string => `
    room id=a at (0,0) size 3000x4000 label "A" uses bedroom
    room id=b at (3000,0) size 3000x4000 label "B" uses bedroom
    room id=c at (6000,0) size 3000x4000 label "C" uses bedroom
    furniture bed at (500,500) size 1400x2000 in a
    furniture bed at (3500,500) size 1400x2000 in b
    ${withBed ? "furniture bed at (6500,500) size 1400x2000 in c" : ""}`;
    expect(sym(plan(row(true))).repeats).toHaveLength(1);
    expect(sym(plan(row(false))).repeats).toEqual([]);
  });

  it("an alternating mirror run: A, mirror-A, A, mirror-A about the shared walls", () => {
    const terrace = `
  component unit() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,8000) (0,8000) close }
    wall id=p partition thickness 100 { (0,4000) (4000,4000) }
    room id=back at (0,0) size 4000x4000 label "Bed" uses bedroom
    room id=front at (0,4000) size 4000x4000 label "Living" uses living
    door id=d at (1000,4000) width 800 wall p swing into back
    furniture id=f bed at (2400,500) size 1400x2000 in back
  }
  place unit() as u1 at (0,0)
  place unit() as u2 at (8000,0) mirror x
  place unit() as u3 at (8000,0)
  place unit() as u4 at (16000,0) mirror x`;
    const s = sym(plan(terrace));
    expect(s.repeats).toEqual([
      // The bare front rooms are their own mirror images, so they repeat by translation…
      { kind: "translate", count: 4, step: { x: 4000, y: 0 }, ids: ["u1.front", "u2.front", "u3.front", "u4.front"] },
      // …the furnished back rooms alternate, reflected about each shared party wall.
      {
        kind: "mirror",
        count: 4,
        axis: "x",
        step: { x: 8000, y: 0 },
        lines: [4000, 8000, 12000],
        ids: ["u1.back", "u2.back", "u3.back", "u4.back"],
      },
    ]);
    expect(groupOf(s.layers.shell)).toBe("D2 x/y");
  });
});

// ---------------------------------------------------------------------------
// The conjugation law
// ---------------------------------------------------------------------------

suite("symmetry — Stab(gP) = g·Stab(P)·g⁻¹ (the W1 wrapper)", () => {
  const HAND = { SQUARE, RECT, L_SHAPE, PINWHEEL, RECT_WINDOWS, RECT_SLIDERS } as const;

  it("the frame-carried witnesses have non-trivial `full` groups at the identity", () => {
    expect(groupOf(sym(plan(RECT_SLIDERS)).layers.full)).toBe("C2");
    const { p0 } = witnessPair("", TRANSLATION, { declare: STAIR_PAIR_DECL });
    expect(groupOf(sym(p0).layers.full)).toBe("D1 y");
  });

  it("the stacked mirrored stair pair (nested frames), under all eight elements and a translation", () => {
    const bad: string[] = [];
    for (const g of [...D4_ELEMENTS.filter((e) => e.name !== "e"), TRANSLATION]) {
      const { p0, gP } = witnessPair("", g, { declare: STAIR_PAIR_DECL });
      bad.push(...conjugationViolations(sym(p0), sym(gP), g, 50).map((v) => `${g.name}: ${v}`));
    }
    expect(bad).toEqual([]);
  });
  it.each(Object.keys(HAND))("hand case %s, under all eight elements and a translation", (name) => {
    const body = HAND[name as keyof typeof HAND];
    const bad: string[] = [];
    for (const g of [...D4_ELEMENTS.filter((e) => e.name !== "e"), TRANSLATION]) {
      const { p0, gP } = witnessPair(body, g);
      bad.push(...conjugationViolations(sym(p0), sym(gP), g, 50).map((v) => `${g.name}: ${v}`));
    }
    expect(bad).toEqual([]);
  });

  // The wrapper is not faithful for an example whose P₀ does not even resolve — a known
  // COMPOSITION defect (the oracle's T0 `ok` pins), not a symmetry question. Those are
  // skipped, and the skip list is pinned to exactly those pins below so it cannot grow.
  const T0_UNRESOLVED = KNOWN.filter((k) => k.g === "T0" && k.path === "ok").map((k) => k.where);
  const skipped: string[] = [];
  let nonTrivial = 0;
  it.each(ELIGIBLE_EXAMPLES)(
    "%s",
    (rel) => {
      const grid = astOf(rel).grid;
      const d0 = describe(wrapperSource(rel, null), { world: EXAMPLES_WORLD, facts: ["symmetry"] });
      if (!d0.ok) {
        skipped.push(rel);
        return;
      }
      const s0 = d0.symmetry!;
      for (const layer of LAYERS) if ((s0.layers[layer]?.elements.length ?? 1) > 1) nonTrivial++;
      const bad: string[] = [];
      for (const g of corpusElements(rel)) {
        const sG = sym(wrapperSource(rel, g));
        bad.push(...conjugationViolations(s0, sG, g, grid).map((v) => `${g.name}: ${v}`));
      }
      expect(bad).toEqual([]);
    },
    120_000,
  );

  it("only the oracle's known unresolved wrappers were skipped", () => {
    expect(skipped.sort()).toEqual([...T0_UNRESOLVED].sort());
  });

  it("the corpus is not vacuous: some example has a non-trivial layer group", () => {
    // museum-wing (D1 x), one-room/parametric (D2), hexagon-pavilion's shell (D2), …
    expect(nonTrivial).toBeGreaterThan(5);
  });

  it("the law can FAIL: museum-wing's D1 x, turned a quarter, is D1 y — not D1 x", () => {
    const r90 = D4_ELEMENTS.find((g) => g.name === "r90")!;
    const s0 = sym(wrapperSource("museum-wing.arch", null));
    const sG = sym(wrapperSource("museum-wing.arch", r90));
    expect(groupOf(s0.layers.shell)).toBe("D1 x");
    expect(groupOf(sG.layers.shell)).toBe("D1 y");
    // Predicting with the WRONG element (the identity) is caught.
    const e = D4_ELEMENTS.find((g) => g.name === "e")!;
    expect(conjugationViolations(s0, sG, e, astOf("museum-wing.arch").grid)).not.toEqual([]);
  });
});

suite("symmetry — determinism", () => {
  it("two describes of the same source report the same bytes", () => {
    for (const rel of ["terrace-row.arch", "museum-wings.arch", "hexagon-pavilion.arch", "aquarium.arch"]) {
      const a = JSON.stringify(sym(EXAMPLE_FILES[rel]!));
      const b = JSON.stringify(sym(EXAMPLE_FILES[rel]!));
      expect(a, rel).toBe(b);
    }
  });
});
