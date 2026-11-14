/**
 * The sixteen fixture families of the new-families batch (product-roadmap card RM8.9): `wall_ac`,
 * `condenser`, `chest_freezer`, `wine_fridge` (glyphs-kitchen), `display_cabinet`,
 * `folding_screen`, `daybed`, `wall_art` (glyphs-living), `pool`, `garden_gate`, `gazebo`,
 * `greenhouse`, `climber`, `bamboo`, `stepping_stones` (glyphs-outdoor) and `potted_tree`
 * (glyphs-misc).
 *
 * Held to the checklist the V8 families are (`test/glyphs-new-families.test.ts`,
 * `.claude/rules/glyphs.md`): outline first in the `thin` pen and detail in `extraThin`; every
 * primitive inside the footprint at every aspect and every quarter-turn; true curves with no arc
 * edge over 120°; a dash only for a hidden part or one above the cut plane; no text; a clamped
 * primitive count; no hand at any footprint or position; the `symmetric` ones D4-invariant; each
 * part tinted with its own material under `rendered`; and the catalogue's claims true of the drawing.
 */

import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { compile } from "../src/index.js";
import type { SceneNode } from "../src/scene.js";
import { weightWidth } from "../src/scene.js";
import {
  CANONICAL_FIXTURES,
  FIXTURE_CATEGORIES,
  canonicalFixture,
  fixtureGlyph,
} from "../src/elements/fixtures-glyphs.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { mapSceneNode } from "../src/elements/glyph-lib.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { rotateNode } from "../src/elements/furniture.js";
import {
  defaultFootprint,
  fixtureSpec,
  isOverhead,
  isTallUnit,
  orientationMatters,
  requiresWall,
} from "../src/fixtures-catalog.js";
import { DEFAULT_THEME, mergeTheme, THEMES } from "../src/theme.js";
import { arcEdgeSweep, arcEdgesOf, pathExtentPoints } from "./helpers/glyph-extent.js";

/** Real pen sizes, taken from a real scene. */
const SIZES = compile(`plan "G" { units mm room id=r at (0,0) size 6000x5000 label "R" }`, { noCache: true }).scene!
  .sizes;

/** The sixteen canonical families, in table order — the tail of the vocabulary. */
const FAMILIES = [
  "wall_ac",
  "condenser",
  "chest_freezer",
  "wine_fridge",
  "display_cabinet",
  "folding_screen",
  "daybed",
  "pool",
  "garden_gate",
  "gazebo",
  "greenhouse",
  "wall_art",
  "climber",
  "bamboo",
  "potted_tree",
  "stepping_stones",
] as const;

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  wall_ac: ["split_ac", "air_conditioner", "ac_indoor"],
  condenser: ["ac_outdoor", "outdoor_unit", "heat_pump"],
  wine_fridge: ["wine_cooler"],
  display_cabinet: ["vitrine", "curio_cabinet"],
  folding_screen: ["room_divider", "privacy_screen"],
  daybed: ["day_bed"],
  pool: ["swimming_pool", "plunge_pool"],
  garden_gate: ["yard_gate"],
  gazebo: ["pavilion", "garden_pavilion"],
  greenhouse: ["glasshouse"],
  wall_art: ["artwork", "painting", "picture"],
  climber: ["climbing_plant"],
  potted_tree: ["indoor_tree"],
};

/** The symbol of `c` at its catalogued footprint (or 1200 x 1000), or at `r`. */
const at = (c: string, r?: Rect): Rect => {
  if (r) return r;
  const fp = defaultFootprint(c);
  return { x: 0, y: 0, w: fp?.along ?? 1200, h: fp?.depth ?? 1000 };
};
const glyph = (c: string, r?: Rect, theme = DEFAULT_THEME): SceneNode[] => {
  const nodes = fixtureGlyph(c, at(c, r), theme, SIZES);
  if (!nodes) throw new Error(`no glyph for ${c}`);
  return nodes;
};

/** The points bounding a primitive's ink. */
function inkPoints(n: SceneNode): Point[] {
  const p = n.prim;
  switch (p.t) {
    case "polygon":
      return [...p.pts];
    case "line":
      return [p.a, p.b];
    case "circle":
      return [
        { x: p.center.x - p.r, y: p.center.y - p.r },
        { x: p.center.x + p.r, y: p.center.y + p.r },
      ];
    case "path":
      return pathExtentPoints(p);
    default:
      throw new Error(`a fixture glyph emitted an unexpected primitive: ${p.t}`);
  }
}

function expectInside(nodes: readonly SceneNode[], r: Rect, what: string): void {
  const eps = 1e-6 * Math.max(1, Math.abs(r.x), Math.abs(r.y), r.w, r.h);
  for (const n of nodes) {
    for (const p of inkPoints(n)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${what}: a finite point`).toBe(true);
      expect(p.x, `${what}: x >= left`).toBeGreaterThanOrEqual(r.x - eps);
      expect(p.x, `${what}: x <= right`).toBeLessThanOrEqual(r.x + r.w + eps);
      expect(p.y, `${what}: y >= top`).toBeGreaterThanOrEqual(r.y - eps);
      expect(p.y, `${what}: y <= bottom`).toBeLessThanOrEqual(r.y + r.h + eps);
    }
  }
}

/** Aspects from a sliver to a square to a long run, both ways round, plus the fuzz's extremes. */
const ASPECTS: readonly (readonly [number, number])[] = [
  [1000, 1000],
  [1600, 700],
  [700, 1600],
  [2400, 600],
  [600, 2400],
  [450, 450],
  [1800, 100],
  [100, 1800],
  [10000, 10],
  [10, 10000],
  [1, 1],
  [567, 1234],
];

describe("RM8.9 families — in the vocabulary", () => {
  it("are the sixteen families after the first 103, contiguous and in order, aliases with them", () => {
    expect(CANONICAL_FIXTURES.slice(103, 103 + FAMILIES.length)).toEqual([...FAMILIES]);
    const tail = FAMILIES.flatMap((f) => [f, ...(ALIASES[f] ?? [])]);
    const from = FIXTURE_CATEGORIES.indexOf(FAMILIES[0]);
    expect(FIXTURE_CATEGORIES.slice(from, from + tail.length)).toEqual(tail);
    for (const w of tail) expect(canonicalFixture(w), w).toBe(FAMILIES.find((f) => f === w || ALIASES[f]?.includes(w)));
  });

  it("every word draws its family's symbol, and an alias draws exactly what its family does", () => {
    for (const f of FAMILIES) {
      const want = JSON.stringify(glyph(f));
      for (const a of ALIASES[f] ?? []) expect(JSON.stringify(glyph(a, at(f))), a).toBe(want);
    }
  });

  it("carries the catalogue's claims: two hang off a wall above the cut plane; the rest as drawn", () => {
    const flag = (k: "symmetric" | "directional" | "wallMounted" | "fixedAspect") =>
      FAMILIES.filter((f) => fixtureSpec(f)?.[k] === true);
    expect(FAMILIES.filter((f) => requiresWall(f))).toEqual(["wall_ac", "wall_art"]);
    expect(FAMILIES.filter((f) => isOverhead(f))).toEqual(["wall_ac", "wall_art"]);
    expect(flag("symmetric")).toEqual(["pool", "gazebo", "potted_tree"]);
    expect(flag("directional")).toEqual([
      "wall_ac",
      "condenser",
      "chest_freezer",
      "wine_fridge",
      "display_cabinet",
      "wall_art",
      "climber",
    ]);
    expect(flag("wallMounted")).toEqual(["climber"]);
    expect(flag("fixedAspect")).toEqual(["wall_ac", "wall_art"]);
    expect(FAMILIES.filter((f) => isTallUnit(f))).toEqual(["display_cabinet"]);
    expect(FAMILIES.filter((f) => orientationMatters(f))).toEqual(flag("directional"));
    for (const f of FAMILIES) expect(fixtureSpec(f)?.clearanceMm, f).toBeUndefined();
    // Every alias carries its family's row.
    for (const f of FAMILIES) for (const a of ALIASES[f] ?? []) expect(fixtureSpec(a), a).toEqual(fixtureSpec(f));
  });
});

describe("RM8.9 families — the drawing language", () => {
  it("draw the outline first, a closed shape in the thin pen, filled unless it is above the cut plane", () => {
    for (const f of FAMILIES) {
      const first = glyph(f)[0]!;
      expect(["path", "polygon", "circle"], f).toContain(first.prim.t);
      expect(first.lineWeight, f).toBe("thin");
    }
    const unfilled = FAMILIES.filter((f) => glyph(f)[0]!.paint.fill === "none");
    expect(unfilled).toEqual(["wall_ac", "gazebo"]);
    for (const f of unfilled) expect(glyph(f)[0]!.lineType, f).toBe("dashed");
  });

  it("paint on the furniture layer at the two glyph pens only, paint.width agreeing; detail in the fine pen", () => {
    for (const f of FAMILIES) {
      const nodes = glyph(f);
      for (const n of nodes) {
        expect(n.layer, f).toBe("furniture");
        expect(["thin", "extraThin"], f).toContain(n.lineWeight);
        expect(n.paint.width, f).toBe(weightWidth(n.lineWeight!, SIZES));
      }
    }
    // Stepping stones are all outline: a stone has no detail to draw.
    const detailed = FAMILIES.filter((f) => glyph(f).some((n) => n.lineWeight === "extraThin"));
    expect(FAMILIES.filter((f) => !detailed.includes(f))).toEqual(["stepping_stones"]);
  });

  it("emit no text and no bare arc: every curve is a path of arcs of at most 120°", () => {
    for (const f of FAMILIES) {
      for (const [w, h] of ASPECTS) {
        for (const n of glyph(f, { x: 0, y: 0, w, h })) {
          expect(["path", "polygon", "circle", "line"], `${f} ${w}x${h}`).toContain(n.prim.t);
          if (n.prim.t !== "path") continue;
          for (const { from, e } of arcEdgesOf(n.prim)) {
            expect(Math.abs(arcEdgeSweep(from, e)), `${f} ${w}x${h}`).toBeLessThanOrEqual((2 * Math.PI) / 3 + 1e-9);
          }
        }
      }
    }
  });

  it("dash only what is hidden or above the cut plane: the hung pieces, the shelves, the roofs", () => {
    const dashed = FAMILIES.filter((f) => glyph(f).some((n) => n.lineType === "dashed"));
    expect(dashed).toEqual(["wall_ac", "wine_fridge", "gazebo", "greenhouse", "wall_art"]);
    for (const f of dashed) {
      for (const n of glyph(f).filter((x) => x.lineType === "dashed")) expect(n.paint.dash, f).toBeDefined();
    }
  });

  it("draw a fixed count at the catalogued footprint, and a clamped one at every aspect", () => {
    const EXPECTED: Readonly<Record<(typeof FAMILIES)[number], number>> = {
      wall_ac: 4,
      condenser: 8,
      chest_freezer: 4,
      wine_fridge: 6,
      display_cabinet: 6,
      folding_screen: 2,
      daybed: 5,
      pool: 3,
      garden_gate: 6,
      gazebo: 10,
      greenhouse: 5,
      wall_art: 2,
      climber: 5,
      bamboo: 21,
      potted_tree: 7,
      stepping_stones: 2,
    };
    for (const f of FAMILIES) expect(glyph(f).length, f).toBe(EXPECTED[f]);
    for (const f of FAMILIES) {
      for (const [w, h] of ASPECTS) {
        const n = glyph(f, { x: 0, y: 0, w, h }).length;
        expect(n, `${f} ${w}x${h}`).toBeLessThanOrEqual(48);
        // A count is a function of the footprint alone: the same at every pen.
        const big = fixtureGlyph(f, { x: 0, y: 0, w, h }, DEFAULT_THEME, { ...SIZES, thin: SIZES.thin * 7 })!;
        expect(big.length, `${f} ${w}x${h} at another pen`).toBe(n);
      }
    }
  });
});

describe("RM8.9 families — inside the footprint", () => {
  it("at every aspect, at the origin and far from it", () => {
    for (const f of FAMILIES) {
      for (const [w, h] of ASPECTS) {
        for (const [x, y] of [
          [0, 0],
          [12345.67, -890.12],
        ] as const) {
          const r = { x, y, w, h };
          expectInside(glyph(f, r), r, `${f} ${w}x${h} at (${x}, ${y})`);
        }
      }
    }
  });

  it("at every quarter-turn, through the compiler", () => {
    const pieces = FAMILIES.map((f, i) => {
      const fp = defaultFootprint(f);
      const w = fp?.along ?? 1200;
      const h = fp?.depth ?? 1000;
      return { f, x: 500 + (i % 4) * 3600, y: 500 + Math.floor(i / 4) * 3600, w, h };
    });
    for (const rot of [0, 90, 180, 270]) {
      const src = `plan "RM89" {\n  units mm\n  room id=r at (0,0) size 15000x15000 label "All"\n${pieces
        .map((p) => `  furniture id=p${p.f} ${p.f} at (${p.x},${p.y}) size ${p.w}x${p.h} rotate ${rot}`)
        .join("\n")}\n}`;
      const out = compile(src, { noCache: true });
      expect(out.errors, `rotate ${rot}`).toEqual([]);
      const nodes = out.scene!.nodes.filter((n) => n.layer === "furniture");
      // A quarter-turned piece is drawn in a frame with its sides swapped, then turned to fill the
      // declared footprint, so its count is the swapped frame's.
      const count = (p: (typeof pieces)[number]): number =>
        glyph(p.f, rot % 180 === 0 ? { x: 0, y: 0, w: p.w, h: p.h } : { x: 0, y: 0, w: p.h, h: p.w }).length;
      for (const p of pieces) {
        const r = { x: p.x, y: p.y, w: p.w, h: p.h };
        const mine = nodes.filter((n) =>
          inkPoints(n).every((q) => q.x >= r.x - 1 && q.x <= r.x + r.w + 1 && q.y >= r.y - 1 && q.y <= r.y + r.h + 1),
        );
        expect(mine.length, `${p.f} rotate ${rot}`).toBe(count(p));
      }
      expect(nodes.length, `rotate ${rot}: no node outside every footprint`).toBe(
        pieces.reduce((s, p) => s + count(p), 0),
      );
    }
  });
});

describe("RM8.9 families — no hand, and the symmetric ones D4-invariant", () => {
  it("every family is its own mirror image at every aspect and position", () => {
    const OFFSETS = Array.from({ length: 8 }, (_, i) => ({
      x: ((i * 7919.37) % 20000) - 3000 + i * 0.137,
      y: ((i * 104729.11) % 30000) - 5000 + i * 0.291,
    }));
    for (const f of FAMILIES) {
      for (const [w, h] of ASPECTS) {
        for (const o of OFFSETS) {
          const r = { x: o.x, y: o.y, w, h };
          const nodes = glyph(f, r);
          expect(
            marksEqual(
              nodes,
              nodes.map((n) => mirrorNode(n, r.x + r.w / 2)),
            ),
            `${f} ${w}x${h} at (${o.x.toFixed(3)}, ${o.y.toFixed(3)})`,
          ).toBe(true);
        }
      }
    }
  });

  it("the `symmetric` families map onto themselves under every turn and both mirrors", () => {
    const RADIAL = new Set(["potted_tree"]);
    const SQUARES = [400, 1000, 1234.5, 2400];
    const OBLONGS: readonly (readonly [number, number])[] = [
      [1600, 700],
      [700, 1600],
    ];
    const OFFSETS: readonly (readonly [number, number])[] = [
      [0, 0],
      [100, 100],
      [12345.67, 678.25],
    ];
    const symmetric = FAMILIES.filter((f) => fixtureSpec(f)?.symmetric === true);
    expect(symmetric.length).toBe(3);
    for (const f of symmetric) {
      const sizes: (readonly [number, number])[] = [...SQUARES.map((s) => [s, s] as const), ...OBLONGS];
      for (const [w, h] of sizes) {
        for (const [ox, oy] of OFFSETS) {
          const r = { x: ox, y: oy, w, h };
          const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
          const nodes = glyph(f, r);
          const maps: [string, (n: SceneNode) => SceneNode][] = [
            ["mirror x", (n) => mirrorNode(n, c.x)],
            ["mirror y", (n) => mapSceneNode(n, (p) => ({ x: p.x, y: c.y + (c.y - p.y) }), true)],
            ["turn 180", (n) => rotateNode(n, c, 180)],
          ];
          if (w === h || RADIAL.has(f)) {
            maps.push(["turn 90", (n) => rotateNode(n, c, 90)], ["turn 270", (n) => rotateNode(n, c, 270)]);
          }
          for (const [what, m] of maps) {
            expect(marksEqual(nodes, nodes.map(m)), `${f} ${w}x${h} at (${ox}, ${oy}): ${what}`).toBe(true);
          }
        }
      }
    }
  });

  it("a directional family's front is drawn below its centre, its back above", () => {
    // The mark that says which way each faces, read off the drawing at the catalogued footprint.
    const y = (f: string, i: number): number => {
      const pts = inkPoints(glyph(f)[i]!);
      return pts.reduce((s, p) => s + p.y, 0) / pts.length;
    };
    const mid = (f: string): number => at(f).h / 2;
    expect(y("wall_ac", 1)).toBeGreaterThan(mid("wall_ac")); // the louvre
    expect(y("condenser", 1)).toBeLessThan(mid("condenser")); // the coil face
    expect(y("chest_freezer", 3)).toBeGreaterThan(mid("chest_freezer")); // the lid's handle
    expect(y("wine_fridge", 1)).toBeGreaterThan(mid("wine_fridge")); // the glass door
    expect(y("display_cabinet", 2)).toBeGreaterThan(mid("display_cabinet")); // the door-front line
    expect(y("climber", 1)).toBeLessThan(mid("climber")); // the trellis rail, on the wall
  });

  it("the zig-zag, the stones and the culms are clamped functions of the footprint", () => {
    const n = (f: string, w: number, h: number) => glyph(f, { x: 0, y: 0, w, h }).length;
    // A folding screen draws an even number of panels, two to eight: its hinges are panels − 1.
    expect([n("folding_screen", 1000, 1000), n("folding_screen", 1800, 400), n("folding_screen", 9000, 100)]).toEqual([
      2, 4, 8,
    ]);
    // Stepping stones: one per 1.2 widths of run, at least two, at most twenty-four.
    expect([n("stepping_stones", 600, 600), n("stepping_stones", 3600, 500), n("stepping_stones", 90000, 500)]).toEqual([
      2, 6, 24,
    ]);
    // Bamboo: two rows of culms, one per 0.35 widths, one to ten a row.
    expect([n("bamboo", 600, 600), n("bamboo", 90000, 600)]).toEqual([7, 21]);
  });
});

describe("RM8.9 families — under `rendered`, each part takes its own material", () => {
  const rendered = mergeTheme(THEMES.rendered);
  const tints = rendered.materialTints!;
  const fills = (f: string): (string | undefined)[] => glyph(f, undefined, rendered).map((n) => n.paint.fill);

  it("the appliances and the cabinets: their bodies and their glass", () => {
    expect(fills("condenser")[0]).toBe(tints.appliance);
    expect(fills("condenser").at(-1)).toBe(tints.metal);
    expect(fills("chest_freezer")[0]).toBe(tints.appliance);
    expect(fills("wine_fridge").slice(0, 2)).toEqual([tints.appliance, tints.glass]);
    expect(fills("display_cabinet").slice(0, 2)).toEqual([tints.wood, tints.glass]);
  });

  it("the living room: a daybed's mattress, a screen's frame and hinges, a picture's canvas", () => {
    expect(fills("daybed")[0]).toBe(tints.fabric);
    expect(fills("daybed").at(-1)).toBe(tints.cushion);
    expect(fills("folding_screen")[0]).toBe(tints.wood);
    expect(fills("folding_screen")[1]).toBe(tints.fabric);
    expect(fills("wall_art")).toEqual([tints.wood, tints.paint]);
  });

  it("the garden and the planting", () => {
    expect(fills("pool").slice(0, 2)).toEqual([tints.stone, tints.water]);
    expect(fills("garden_gate")[0]).toBe(tints.wood);
    expect(fills("gazebo")[1]).toBe(tints.wood);
    expect(fills("greenhouse").slice(0, 2)).toEqual([tints.metal, tints.glass]);
    expect(fills("climber").slice(0, 2)).toEqual([tints.foliage, tints.wood]);
    expect(fills("bamboo")[0]).toBe(tints.foliage);
    expect(fills("potted_tree").slice(0, 2)).toEqual([tints.foliage, tints.ceramic]);
    expect(fills("stepping_stones")[0]).toBe(tints.stone);
  });

  it("without tints, every theme draws them with its own furniture fill, planting in the lawn tint", () => {
    for (const f of FAMILIES) expect(fills(f).length, f).toBe(glyph(f).length);
    expect(glyph("pool")[0]!.paint.fill).toBe(DEFAULT_THEME.furnitureFill);
    for (const f of ["climber", "bamboo", "potted_tree"]) expect(glyph(f)[0]!.paint.fill, f).toBe(DEFAULT_THEME.lawn);
  });
});
