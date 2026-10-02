/**
 * A mirrored `place` draws the mirror-image SYMBOL.
 *
 * The defect was silent: `place … mirror` reflected a fixture's footprint, its owning room
 * and its derived quarter-turn, and left the drawing inside that footprint alone, so a
 * mirrored wing drew a LEFT-handed `sofa_l` in a right-handed room with every number
 * correct. Nothing could fail, because no test asked what the mirrored instance DREW.
 *
 * So every case here asks by CONSEQUENCE, on compiled Scenes, and in both directions:
 *
 *  - a handed symbol placed mirrored draws the reflection of the plain one (and, crucially,
 *    is NOT the plain one);
 *  - a symbol with a vertical mirror axis placed mirrored is **byte-identical** to the plain
 *    one — the flip must not perturb a symbol that has no handedness;
 *  - both axes (`mirror x`, `mirror y`) and a double mirror, which composes back to the
 *    identity because a frame is exact and composable.
 *
 * ## The pairing trick every case is built on
 *
 * `place c() as a at (0,0)` and `place c() as a at (W,0) mirror x` land a W-wide component
 * on **the same box**: the reflection about the instance's own origin maps local `[0,W]` to
 * `[−W,0]`, and the translation puts it back. So for a component whose walls and room are
 * themselves symmetric about that midline, the two plans differ in exactly one thing — the
 * handedness of the drawn symbol — and the whole SVG can be compared byte-for-byte with no
 * node bookkeeping at all. `mirror y` gets the same treatment about `(0,H)`.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { CANONICAL_FIXTURES, fixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { defaultFootprint, fixtureSpec } from "../src/fixtures-catalog.js";
import { DEFAULT_THEME } from "../src/theme.js";
import { rotateNode } from "../src/elements/furniture.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";
import { mapSceneNode } from "../src/elements/glyph-lib.js";
import { pathExtentPoints } from "./glyph-extent.js";
import { SURVEY_FOOTPRINTS, SURVEY_OFFSETS, surveyHandedness } from "./handedness-survey.js";

/** Real pen sizes, taken from a real scene rather than invented — as the glyph suites do. */
const SIZES: RenderSizes = toScene(
  resolve(parse(`plan "G" { units mm room id=r at (0,0) size 6000x5000 label "R" }`).plan!).ir,
).sizes;

/** The component box every paired plan uses: symmetric walls, one centred fixture. */
const W = 4000;
const H = 4000;

/**
 * A plan holding ONE instance of a one-fixture component, either plain or mirrored onto the
 * same box. `size` is given explicitly so nothing depends on a catalogued footprint.
 *
 * The fixture is CENTRED in the component box, which is what makes the pairing exact: the
 * reflection maps the box onto itself and the centred footprint onto itself, so the two
 * plans agree about every coordinate in the drawing and can only disagree about the marks
 * INSIDE that footprint. Place the piece off-centre and the reflection moves it — a real
 * difference, but not the one under test.
 */
function paired(category: string, mirror: "" | "x" | "y", size = "2600x1600", rotate = 0): string {
  const [w, h] = size.split("x").map(Number) as [number, number];
  const at = mirror === "x" ? `(${W},0)` : mirror === "y" ? `(0,${H})` : "(0,0)";
  const clause = mirror ? ` mirror ${mirror}` : "";
  const turn = rotate ? ` rotate ${rotate}` : "";
  return `plan "chirality" {
  component c() {
    wall id=w exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }
    room id=r at (0,0) size ${W}x${H} label "Room"
    furniture ${category} at (${(W - w) / 2},${(H - h) / 2}) size ${size}${turn} in r
  }
  place c() as a at ${at}${clause}
}`;
}

/** The centred footprint `paired` puts a `w x h` piece on, in plan coordinates. */
const centred = (w: number, h: number) => ({ cx: W / 2, cy: H / 2, x: (W - w) / 2, y: (H - h) / 2 });

function svgOf(src: string): string {
  const out = compile(src);
  expect(out.errors, `compile errors: ${out.errors.join(" | ")}`).toEqual([]);
  return out.svg;
}

function furnitureNodes(src: string): SceneNode[] {
  const out = compile(src);
  expect(out.errors, `compile errors: ${out.errors.join(" | ")}`).toEqual([]);
  return out.scene!.nodes.filter((n) => n.layer === "furniture");
}

describe("a mirrored `place` draws the mirror-image symbol", () => {
  it("`sofa_l` mirrored about x draws the reflection of the plain one, not a copy of it", () => {
    const plain = furnitureNodes(paired("sofa_l", ""));
    const flipped = furnitureNodes(paired("sofa_l", "x"));
    expect(plain.length).toBeGreaterThan(3);
    // The two instances occupy the SAME box, so the axis is the shared footprint centre:
    // the piece is 2600 wide at x = 700.
    const axis = centred(2600, 1600).cx;
    // The mirrored instance draws exactly what reflecting the plain one draws …
    expect(
      marksEqual(
        flipped,
        plain.map((n) => mirrorNode(n, axis)),
      ),
    ).toBe(true);
    // … and that is a DIFFERENT drawing, which is the half the old code got wrong: before
    // this fix `flipped` was `plain`, and the first assertion alone would have passed for a
    // symmetric symbol.
    expect(marksEqual(flipped, plain)).toBe(false);
  });

  it("`mirror y` is handled too — the same reflection, a different derived quarter-turn", () => {
    const plain = furnitureNodes(paired("sofa_l", ""));
    const flipped = furnitureNodes(paired("sofa_l", "y"));
    // `M = R(m)·Fx` for every reflecting frame, so `mirror y` is `R(180)` composed with the
    // SAME glyph reflection: reflect about the footprint's vertical centre, then turn 180°
    // about its centre — which is a reflection about the HORIZONTAL centre line.
    const flipY = (n: SceneNode): SceneNode =>
      rotate180(mirrorNode(n, centred(2600, 1600).cx), centred(2600, 1600).cx, centred(2600, 1600).cy);
    expect(marksEqual(flipped, plain.map(flipY))).toBe(true);
    expect(marksEqual(flipped, plain)).toBe(false);
  });

  it("a double mirror composes back to the identity, byte-for-byte", () => {
    // `place` inside a component body: the outer instance reflects, the inner one reflects
    // again, and the composed frame has `det = +1`. A frame is exact and composable, so the
    // drawing must be the one the un-mirrored nesting produces — not merely equivalent.
    const nest = (outer: string, inner: string): string => `plan "nest" {
  component leaf() {
    furniture sofa_l at (700,1200) size 2600x1600
  }
  component mid() {
    wall id=w exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }
    place leaf() as l at ${inner ? `(${W},0)` : "(0,0)"}${inner}
  }
  place mid() as m at ${outer ? `(${W},0)` : "(0,0)"}${outer}
}`;
    expect(svgOf(nest(" mirror x", " mirror x"))).toBe(svgOf(nest("", "")));
    // …and one reflection alone is still a reflection (so the pin above is not vacuous).
    expect(svgOf(nest(" mirror x", ""))).not.toBe(svgOf(nest("", "")));
  });

  it("an AUTHORED placement clause and a handed symbol reflect together", () => {
    // The pairing fixture for the derived-position round-trip fix, which drops `_authored` in
    // the same arm of `transformGeometry` this change writes `_mirror` in. Two handed
    // facts meet the reflection here and get OPPOSITE answers, and only a plan that
    // carries BOTH can show they do not interfere:
    //
    //   * the placement CLAUSE (`in r anchor top-right`) names a corner of the instance's
    //     OWN room, which the reflection renames — so the piece must land at the mirrored
    //     corner, resolved in the local frame and carried across as a coordinate;
    //   * the drawn SYMBOL (`desk`, handed) must be the mirror image of the plain one.
    //
    // Neither branch can produce this fixture alone, which is exactly why it lives here:
    // a clean auto-merge is not evidence, and this is what would fail if one answer were
    // ever applied to the other's fact.
    const src = (m: "" | " mirror x"): string => `plan "cross" {
  component c() {
    wall id=w exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }
    room id=r at (0,0) size ${W}x${H} label "Room"
    furniture id=d desk in r anchor top-right inset 300 size 1400x700
  }
  place c() as a at ${m ? `(${W},0)` : "(0,0)"}${m}
}`;
    const plain = furnitureNodes(src(""));
    const flipped = furnitureNodes(src(" mirror x"));
    // POSITION: `anchor top-right` puts the plain piece at x 2300..3700 and the mirrored
    // one at 300..1700 — the reflected corner, not the same one.
    expect(spanX(plain)).toEqual([2300, 3700]);
    expect(spanX(flipped)).toEqual([300, 1700]);
    // SYMBOL: translate the plain drawing onto the mirrored footprint, then reflect it.
    const onto = plain.map((n) => translateX(n, -2000));
    expect(
      marksEqual(
        flipped,
        onto.map((n) => mirrorNode(n, (300 + 1700) / 2)),
      ),
    ).toBe(true);
    // …and NOT merely moved, which is what the defect looked like.
    expect(marksEqual(flipped, onto)).toBe(false);
  });
});

describe("a symbol with no handedness is not perturbed", () => {
  // `table` and `bench` are the load-bearing pair: `bench` is the ONLY fixture in
  // `examples/museum-wing.arch`, the mirrored-`place` flagship, so this law is what keeps
  // that golden exactly where it is.
  //
  // The `mirror y` half compares against an unmirrored instance carrying `rotate 180`,
  // which is the quarter-turn `transformDeg` derives for that frame. That turn is NOT part
  // of this change and re-spells a symmetric drawing on its own (a 180° turn maps a
  // rectangle onto itself with its points in a different order), so comparing against the
  // unturned plain instance would measure the pre-existing rotation, not the chirality flip.
  for (const [category, size] of [
    ["table", "1600x900"],
    ["bench", "1800x600"],
    ["wc", "400x700"],
    ["shower", "900x900"],
    // The kitchen's three that a redraw must keep symmetric — `describe --facts symmetry` reads
    // handedness, so a stove, a sink or an oven that turned handed would move a semantic fact on
    // every plan with mirrored kitchens. Each at its catalogued footprint and at the thresholds
    // where its drawing changes (the sink's drainers and second bowl, the oven's hob).
    ["stove", "600x600"],
    ["stove", "900x600"],
    ["kitchen_sink", "800x600"],
    ["kitchen_sink", "1100x600"],
    ["kitchen_sink", "1200x600"],
    ["kitchen_sink", "1800x600"],
    ["oven", "600x600"],
    ["oven", "960x600"],
    ["oven", "1000x600"],
  ] as const) {
    it(`a mirrored \`${category}\` (${size}) is byte-identical to the plain one`, () => {
      expect(svgOf(paired(category, "x", size))).toBe(svgOf(paired(category, "", size)));
      expect(svgOf(paired(category, "y", size))).toBe(svgOf(paired(category, "", size, 180)));
    });
  }

  it("an UNCATALOGUED word keeps the labelled rectangle, mirrored or not", () => {
    // The fallback is a rectangle with a centred label — symmetric by construction, and
    // deliberately outside the mirroring branch, so this is a pin on the branch's placement
    // as much as on the drawing.
    expect(svgOf(paired("hammock", "x", "2000x800"))).toBe(svgOf(paired("hammock", "", "2000x800")));
  });

  it("the pairing trick really does put the two instances on the same box", () => {
    // Without this, every byte-identity case above could pass by drawing nothing anyone can
    // see. A plan with no fixture at all must be byte-identical either way — and a plan
    // with a HANDED one must not be, which is the case above.
    const bare = (m: string, at: string): string => `plan "bare" {
  component c() { wall id=w exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close } }
  place c() as a at ${at}${m}
}`;
    expect(svgOf(bare(" mirror x", `(${W},0)`))).toBe(svgOf(bare("", "(0,0)")));
  });

  it("a HANDED symbol is not byte-identical under either axis — the pins above are not vacuous", () => {
    expect(svgOf(paired("sofa_l", "x"))).not.toBe(svgOf(paired("sofa_l", "")));
    expect(svgOf(paired("sofa_l", "y"))).not.toBe(svgOf(paired("sofa_l", "", "2600x1600", 180)));
  });
});

describe("mirrorNode", () => {
  it("reverses an arc's sweep — a reflection reverses orientation", () => {
    const node: SceneNode = {
      layer: "furniture",
      prim: { t: "arc", center: { x: 100, y: 50 }, r: 20, start: { x: 120, y: 50 }, end: { x: 100, y: 70 }, sweep: 1 },
      paint: { stroke: "#000", width: 1 },
    };
    const m = mirrorNode(node, 100);
    expect(m.prim).toEqual({
      t: "arc",
      center: { x: 100, y: 50 },
      r: 20,
      start: { x: 80, y: 50 },
      end: { x: 100, y: 70 },
      sweep: 0,
    });
  });

  it("is an involution on the primitives a glyph draws", () => {
    const nodes = fixtureGlyph("sofa_l", { x: 0, y: 0, w: 2600, h: 1600 }, DEFAULT_THEME, SIZES)!;
    const twice = nodes.map((n) => mirrorNode(mirrorNode(n, 1300), 1300));
    expect(marksEqual(twice, nodes)).toBe(true);
  });
});

describe("the handedness survey", () => {
  /**
   * The families whose plan symbol has NO vertical mirror axis at its catalogued footprint,
   * measured by reflecting the drawing rather than read off a flag. `sofa_l` is the one
   * originally reported; the other seventeen are what looking rather than assuming
   * turned up.
   *
   * This is a RECORD of the survey, not the mechanism — `mirrorGlyph` derives handedness per
   * drawing, per footprint, so nothing reads this list. Redraw a symbol and it may move: that
   * is a finding to explain (did the redraw gain or lose a handed detail?) before it is a
   * line to edit.
   */
  const HANDED = [
    "bathtub",
    "bed",
    "double_bed",
    "desk",
    "island",
    "washer",
    "sofa_l",
    "piano",
    "shrub",
    "bbq",
    "bicycle",
    "motorcycle",
    "mailbox",
    "ev_charger",
    "mirror",
    "microwave",
    "chaise",
    "reception_desk",
  ];

  const handedAt = (category: string, w: number, h: number): boolean => {
    const nodes = fixtureGlyph(category, { x: 0, y: 0, w, h }, DEFAULT_THEME, SIZES);
    if (!nodes) throw new Error(`no glyph for ${category}`);
    return !marksEqual(
      nodes,
      nodes.map((n) => mirrorNode(n, w / 2)),
    );
  };

  it("eighteen of the 83 shipped families are handed at their catalogued footprint", () => {
    const found = CANONICAL_FIXTURES.filter((c) => {
      const fp = defaultFootprint(c);
      return handedAt(c, fp?.along ?? 1000, fp?.depth ?? 600);
    });
    expect(found).toEqual(HANDED);
  });

  it("handedness is a property of the DRAWING, not of the family — which is why it is derived", () => {
    // Five families are handed at one aspect ratio and symmetric at another, because their
    // detail is tiled and the tile COUNT comes from the footprint. A per-family flag cannot
    // express that; asking the drawing can. This is the case that settled the design, so it
    // is pinned rather than described.
    for (const c of ["counter", "upper_cabinet", "hedge"]) {
      expect(handedAt(c, 1000, 600), `${c} @ 1000x600`).toBe(false);
      expect(handedAt(c, 2000, 500), `${c} @ 2000x500`).toBe(true);
    }
    expect(handedAt("fridge", 600, 1000)).toBe(false);
    expect(handedAt("fridge", 1000, 600)).toBe(true);
  });
});

/**
 * The EXTENDED handedness survey, pinned against `main`.
 *
 * Measured on `main` @ 22bce44 (v1.38.0 + agent docs) — the checkout every visual-polish branch
 * forks from — with `npx tsx test/handedness-survey.ts D:/github_repository/archlang`, which
 * runs `analyze/symmetry.ts`'s own predicate (`marksEqual` against the glyph's mirror image, at
 * unit pens, the rect placed at `cx − w/2`) over every family x seven footprints x three
 * absolute positions. A row is `SURVEY_FOOTPRINTS` in order — catalogue, square, portrait 1:3,
 * landscape 3:1, 640, 777, 555x900 — each as three characters for `at (0,0)`, `(100,100)`,
 * `(1000,1000)`: `H` handed, `.` not.
 *
 * THE RULE (visual-polish programme): a family may never GAIN handedness at a cell where `main`
 * was symmetric — a redraw that does has put an asymmetric mark (or an ulp-dependent structure)
 * into a symmetric symbol, which flips `describe --facts symmetry` and mirrored-`place` bytes. A
 * family MAY lose handedness only by being listed in {@link LOST_HANDEDNESS} with the reason its
 * old handed mark was decorative. Never re-measure this table to green the test.
 */
const HANDED_ON_MAIN: Readonly<Record<string, string>> = {
  wc: "... ... ... ... ... ... ...",
  basin: "... ... ... ... ... ... ...",
  shower: "... ... ... ... ... ... ...",
  bathtub: "HHH HHH HHH HHH HHH HHH HHH",
  kitchen_sink: "... ... ... ... ... ... ...",
  counter: "... ... ... ... ... ... ...",
  stove: "... ... ... ... ... ... ...",
  fridge: "... ... ... HHH ... ... ...",
  bed: "HHH HHH HHH HHH HHH HHH HHH",
  double_bed: "HHH HHH HHH HHH HHH HHH HHH",
  nightstand: "... ... ... ... ... ... ...",
  wardrobe: "... ... ... ... ... ... ...",
  sofa: "... ... ... ... ... ... ...",
  armchair: "... ... ... ... ... ... ...",
  coffee_table: "... ... ... ... ... ... ...",
  tv_unit: "... ... ... ... ... ... ...",
  table: "... ... ... ... ... ... ...",
  dining_table: "... ... ... ... ... ... ...",
  chair: "... ... ... ... ... ... ...",
  stool: "... ... ... ... ... ... ...",
  bench: "... ... ... ... ... ... ...",
  desk: "HHH HHH HHH HHH HHH HHH HHH",
  office_chair: "... ... ... ... ... ... ...",
  bookshelf: "... ... ... ... ... ... ...",
  oven: "... ... ... ... ... ... ...",
  dishwasher: "... ... ... ... ... ... ...",
  island: "HHH HHH HHH HHH HHH HHH HHH",
  upper_cabinet: "... ... ... ... ... ... ...",
  washer: "HHH HHH HHH HHH HHH HHH HHH",
  dryer: "... ... ... ... ... ... ...",
  plant: "... ... ... ... ... ... ...",
  car: "... ... ... ... ... ... ...",
  rug: "... ... ... ... ... ... ...",
  sofa_l: "HHH HHH HHH HHH HHH HHH HHH",
  piano: "HHH HHH HHH HHH HHH HHH HHH",
  sun_lounger: "... ... ... ... ... ... ...",
  tree: "... ... ... ... ... ... ...",
  conifer: "... ... ... ... ... ... ...",
  shrub: "HHH HHH HHH HHH HHH HHH HHH",
  hedge: "... ... ... HHH ... ... ...",
  bbq: "HHH HHH HHH HHH HHH HHH HHH",
  outdoor_table: "... ... ... ... ... ... ...",
  outdoor_chair: "... ... ... ... ... ... ...",
  umbrella: "... ... ... ... ... ... ...",
  bicycle: "HHH HHH HHH HHH HHH HHH HHH",
  motorcycle: "HHH HHH ... HHH HHH HHH ...",
  hot_tub: "... ... ... ... ... ... ...",
  swing: "... ... ... ... ... ... ...",
  trampoline: "... ... ... ... ... ... ...",
  bin: "... ... ... ... ... ... ...",
  mailbox: "HHH HHH HHH HHH HHH HHH HHH",
  ev_charger: "HHH HHH HHH HHH HHH HHH HHH",
  pergola: "... ... ... ... ... ... ...",
  sandpit: "... ... ... ... ... ... ...",
  fire_pit: "... ... ... ... ... ... ...",
  shed: "... ... ... ... ... ... ...",
  clothesline: "... ... ... ... ... ... ...",
  bidet: "... ... ... ... ... ... ...",
  urinal: "... ... ... ... ... ... ...",
  laundry_sink: "... ... ... ... ... ... ...",
  water_heater: "... ... ... ... ... ... ...",
  mirror: "HHH HHH HHH HHH HHH HHH HHH",
  range_hood: "... ... ... ... ... ... ...",
  microwave: "HHH HHH HHH HHH HHH HHH HHH",
  bar_counter: "... ... ... ... ... ... ...",
  bunk_bed: "... ... ... ... ... ... ...",
  crib: "... ... ... ... ... ... ...",
  dresser: "... ... ... ... ... ... ...",
  vanity: "... ... ... ... ... ... ...",
  fireplace: "... ... ... ... ... ... ...",
  radiator: "... ... ... ... ... ... ...",
  sideboard: "... ... ... ... ... ... ...",
  loveseat: "... ... ... ... ... ... ...",
  chaise: "HHH HHH HHH HHH HHH HHH HHH",
  tv: "... ... ... ... ... ... ...",
  coat_rack: "... ... ... ... ... ... ...",
  shoe_cabinet: "HHH HHH HHH HHH HHH HHH HHH",
  meeting_table: "... ... ... ... ... ... ...",
  reception_desk: "HHH HHH HHH HHH HHH HHH HHH",
  filing_cabinet: "... ... ... ... ... ... ...",
  locker: "... ... ... ... ... ... ...",
  pool_table: "... ... ... ... ... ... ...",
  treadmill: "... ... ... ... ... ... ...",
};

/**
 * Families allowed to have LOST handedness relative to {@link HANDED_ON_MAIN}, each with the
 * reason its old handed mark was decorative rather than meaningful.
 */
const LOST_HANDEDNESS: Readonly<Record<string, string>> = {
  shoe_cabinet:
    "its one-way tilt diagonals were decoration that read as cross-bracing; the redraw is carcass, splits and centred pulls",
};

describe("the extended handedness survey, pinned against main", () => {
  const api = { CANONICAL_FIXTURES, fixtureGlyph, marksEqual, mirrorNode, defaultFootprint, DEFAULT_THEME };

  it("covers every family, every footprint and every offset", () => {
    expect(Object.keys(HANDED_ON_MAIN)).toEqual([...CANONICAL_FIXTURES]);
    const cells = SURVEY_FOOTPRINTS.length * SURVEY_OFFSETS.length;
    for (const [c, row] of Object.entries(HANDED_ON_MAIN)) expect(row.replace(/ /g, ""), c).toHaveLength(cells);
  });

  it("no family GAINS handedness where main was symmetric, and none loses it unlisted", () => {
    const now = surveyHandedness(api);
    const gained: string[] = [];
    const lost: string[] = [];
    for (const c of CANONICAL_FIXTURES) {
      const was = HANDED_ON_MAIN[c]!;
      const is = now[c]!;
      for (let i = 0; i < was.length; i++) {
        if (was[i] === "." && is[i] === "H") gained.push(`${c} @ cell ${i}`);
        if (was[i] === "H" && is[i] === "." && !(c in LOST_HANDEDNESS)) lost.push(`${c} @ cell ${i}`);
      }
    }
    expect(gained, "a symmetric family became HANDED — never allowed").toEqual([]);
    expect(lost, "a family lost handedness — list it in LOST_HANDEDNESS with its reason").toEqual([]);
  });

  it("the `symmetric` PILOT families are quarter-turn invariant too, at squares and offsets", () => {
    // The mirror survey above cannot see a quarter-turn defect, and a catalogued `S` family must
    // map onto itself under one. Measured on main with the same sweep, three S families already
    // fail it there — `rug` and `pool_table` (their long-axis detail picks a side on a square)
    // and `shrub` (deliberately irregular) — so this pins only the visual-polish PILOTS.
    const PILOTS = ["sofa", "loveseat", "armchair", "chair", "dining_table", "bed", "double_bed", "wc", "tree"];
    const symmetricPilots = PILOTS.filter((c) => fixtureSpec(c)?.symmetric === true);
    expect(symmetricPilots).toEqual(["dining_table", "tree"]);
    for (const c of symmetricPilots) {
      for (const s of [1, 400, 640, 777, 1000, 1500, 2400]) {
        for (const o of [0, 100, 1000]) {
          const cc = { x: o + s / 2, y: o + s / 2 };
          const nodes = fixtureGlyph(c, { x: cc.x - s / 2, y: cc.y - s / 2, w: s, h: s }, DEFAULT_THEME, SIZES)!;
          for (const deg of [90, 180, 270]) {
            expect(
              marksEqual(
                nodes,
                nodes.map((n) => rotateNode(n, cc, deg)),
              ),
              `${c} ${s}x${s} at ${o} r${deg}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("is not vacuous: one asymmetric mark in a symmetric family is seen at every cell", () => {
    const planted = {
      ...api,
      fixtureGlyph: (...args: Parameters<typeof fixtureGlyph>) => {
        const nodes = fixtureGlyph(...args);
        if (args[0] !== "sofa" || !nodes) return nodes;
        const r = args[1];
        // A tick in the left third only — a mark with no mirror partner.
        return [
          ...nodes,
          {
            ...nodes[0]!,
            prim: { t: "line" as const, a: { x: r.x + r.w * 0.2, y: r.y }, b: { x: r.x + r.w * 0.2, y: r.y + r.h } },
          },
        ];
      },
    };
    expect(HANDED_ON_MAIN.sofa).not.toContain("H");
    expect(surveyHandedness(planted).sofa).not.toContain(".");
  });
});

/** The x extent of a node list, for asserting WHERE a clause put the piece. */
function spanX(nodes: readonly SceneNode[]): [number, number] {
  const xs: number[] = [];
  for (const n of nodes) {
    const p = n.prim;
    if (p.t === "polygon") for (const q of p.pts) xs.push(q.x);
    else if (p.t === "line") xs.push(p.a.x, p.b.x);
    else if (p.t === "circle") xs.push(p.center.x - p.r, p.center.x + p.r);
    else if (p.t === "path") for (const q of pathExtentPoints(p)) xs.push(q.x);
  }
  return [Math.min(...xs), Math.max(...xs)];
}

/** Slide a node along x — the plain instance's drawing onto the mirrored footprint. Through the
 *  shared `mapSceneNode`, so every primitive kind a glyph draws (a curved `path` too) moves. */
function translateX(n: SceneNode, dx: number): SceneNode {
  return mapSceneNode(n, (p) => ({ x: p.x + dx, y: p.y }), false);
}

/** A 180° turn about `(cx, cy)` — exact, and only used to spell out what `mirror y` is. */
function rotate180(n: SceneNode, cx: number, cy: number): SceneNode {
  return mapSceneNode(n, (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y }), false);
}
