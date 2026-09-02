/**
 * A mirrored `place` draws the mirror-image SYMBOL — `docs/backlog.md` 5.4.
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
import { defaultFootprint } from "../src/fixtures-catalog.js";
import { DEFAULT_THEME } from "../src/theme.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";

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
    // The pairing fixture for the collision with backlog G.4, which drops `_authored` in
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
  ] as const) {
    it(`a mirrored \`${category}\` is byte-identical to the plain one`, () => {
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
   * `docs/backlog.md` 5.4 names; the other eighteen are what looking rather than assuming
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
    "shoe_cabinet",
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

  it("nineteen of the 83 shipped families are handed at their catalogued footprint", () => {
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

/** The x extent of a node list, for asserting WHERE a clause put the piece. */
function spanX(nodes: readonly SceneNode[]): [number, number] {
  const xs: number[] = [];
  for (const n of nodes) {
    const p = n.prim;
    if (p.t === "polygon") for (const q of p.pts) xs.push(q.x);
    else if (p.t === "line") xs.push(p.a.x, p.b.x);
    else if (p.t === "circle") xs.push(p.center.x - p.r, p.center.x + p.r);
  }
  return [Math.min(...xs), Math.max(...xs)];
}

/** Slide a node along x — the plain instance's drawing onto the mirrored footprint. */
function translateX(n: SceneNode, dx: number): SceneNode {
  const t = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y });
  const prim = n.prim;
  switch (prim.t) {
    case "polygon":
      return { ...n, prim: { ...prim, pts: prim.pts.map(t) } };
    case "line":
      return { ...n, prim: { ...prim, a: t(prim.a), b: t(prim.b) } };
    case "circle":
      return { ...n, prim: { ...prim, center: t(prim.center) } };
    default:
      return n;
  }
}

/** A 180° turn about `(cx, cy)` — exact, and only used to spell out what `mirror y` is. */
function rotate180(n: SceneNode, cx: number, cy: number): SceneNode {
  const rp = (p: { x: number; y: number }) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
  const prim = n.prim;
  switch (prim.t) {
    case "polygon":
      return { ...n, prim: { ...prim, pts: prim.pts.map(rp) } };
    case "line":
      return { ...n, prim: { ...prim, a: rp(prim.a), b: rp(prim.b) } };
    case "text":
      return { ...n, prim: { ...prim, at: rp(prim.at) } };
    case "circle":
      return { ...n, prim: { ...prim, center: rp(prim.center) } };
    case "arc":
      return { ...n, prim: { ...prim, center: rp(prim.center), start: rp(prim.start), end: rp(prim.end) } };
    default:
      return n;
  }
}
