/**
 * The twenty fixture families of the visual-assets tranche (card V8): `floor_lamp`, `side_table`,
 * `console_table`, `ottoman`, `bean_bag` (glyphs-living), `pantry` (glyphs-kitchen), `towel_rail`
 * (glyphs-bath), `palm`, `flower_bed`, `boulder`, `picnic_table`, `slide`, `bollard`,
 * `bike_rack`, `raised_bed` (glyphs-outdoor), `whiteboard`, `printer`, `server_rack`,
 * `workstation` (glyphs-misc) and `hospital_bed` (glyphs-bedroom).
 *
 * They are tested together because they are held to one checklist (`.claude/rules/glyphs.md`):
 * outline first in the `thin` pen and detail in `extraThin`; every primitive inside the footprint
 * at every aspect and every quarter-turn; true curves with no arc edge over 120°; a dash only for
 * a hidden part; no text; a clamped primitive count; no hand at any footprint or position; the
 * `symmetric` ones D4-invariant; every part tinted with its own material under `rendered`; and
 * the catalogue's claims about each one true of the drawing.
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
  isTallUnit,
  orientationMatters,
  requiresWall,
} from "../src/fixtures-catalog.js";
import { DEFAULT_THEME, mergeTheme, THEMES } from "../src/theme.js";
import { arcEdgeSweep, arcEdgesOf, pathExtentPoints } from "./glyph-extent.js";

/** Real pen sizes, taken from a real scene. */
const SIZES = compile(`plan "G" { units mm room id=r at (0,0) size 6000x5000 label "R" }`, { noCache: true }).scene!
  .sizes;

/** The twenty canonical families, in table order — the tail of the vocabulary. */
const FAMILIES = [
  "floor_lamp",
  "side_table",
  "console_table",
  "ottoman",
  "bean_bag",
  "pantry",
  "towel_rail",
  "palm",
  "flower_bed",
  "boulder",
  "picnic_table",
  "slide",
  "bollard",
  "bike_rack",
  "raised_bed",
  "whiteboard",
  "printer",
  "server_rack",
  "hospital_bed",
  "workstation",
] as const;

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  side_table: ["end_table"],
  ottoman: ["pouf", "footstool"],
  pantry: ["tall_cabinet", "larder"],
  towel_rail: ["towel_radiator"],
  palm: ["palm_tree"],
  flower_bed: ["planting_bed"],
  boulder: ["rock"],
  slide: ["playground_slide"],
  bike_rack: ["cycle_stand"],
  raised_bed: ["vegetable_bed"],
  printer: ["copier"],
  workstation: ["desk_pod"],
};

/** The symbol of `c` at its catalogued footprint (or `fallback`), or at `r`. */
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

/** The points bounding a primitive's ink; an arc primitive is sampled along its sweep. */
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

describe("V8 families — in the vocabulary", () => {
  it("are the last twenty families, contiguous and in order, aliases with them", () => {
    expect(CANONICAL_FIXTURES.slice(-FAMILIES.length)).toEqual([...FAMILIES]);
    const tail = FAMILIES.flatMap((f) => [f, ...(ALIASES[f] ?? [])]);
    expect(FIXTURE_CATEGORIES.slice(-tail.length)).toEqual(tail);
    for (const w of tail) expect(canonicalFixture(w), w).toBe(FAMILIES.find((f) => f === w || ALIASES[f]?.includes(w)));
  });

  it("every word draws its family's symbol, and an alias draws exactly what its family does", () => {
    for (const f of FAMILIES) {
      const want = JSON.stringify(glyph(f));
      for (const a of ALIASES[f] ?? []) expect(JSON.stringify(glyph(a, at(f))), a).toBe(want);
    }
  });

  it("carries the catalogue's claims: none needs a wall; symmetric, directional, tall and wall-mounted as drawn", () => {
    const flag = (k: "symmetric" | "directional" | "wallMounted" | "fixedAspect") =>
      FAMILIES.filter((f) => fixtureSpec(f)?.[k] === true);
    for (const f of FAMILIES) expect(requiresWall(f), f).toBe(false);
    expect(flag("symmetric")).toEqual(["floor_lamp", "side_table", "ottoman", "palm", "bollard"]);
    expect(flag("directional")).toEqual([
      "console_table",
      "pantry",
      "towel_rail",
      "slide",
      "whiteboard",
      "printer",
      "server_rack",
      "hospital_bed",
    ]);
    expect(flag("wallMounted")).toEqual(["towel_rail", "whiteboard"]);
    expect(flag("fixedAspect")).toEqual(["console_table", "towel_rail", "slide", "whiteboard", "hospital_bed"]);
    expect(FAMILIES.filter((f) => isTallUnit(f))).toEqual(["pantry", "server_rack"]);
    expect(FAMILIES.filter((f) => orientationMatters(f))).toEqual(flag("directional"));
    expect(fixtureSpec("hospital_bed")?.serves).toBe("bed");
    expect(fixtureSpec("workstation")?.serves).toBe("desk");
    // Every alias carries its family's row.
    for (const f of FAMILIES) for (const a of ALIASES[f] ?? []) expect(fixtureSpec(a), a).toEqual(fixtureSpec(f));
  });
});

describe("V8 families — the drawing language", () => {
  it("draw the outline first, as a filled closed shape in the thin pen", () => {
    for (const f of FAMILIES) {
      const first = glyph(f)[0]!;
      expect(["path", "polygon", "circle"], f).toContain(first.prim.t);
      expect(first.lineWeight, f).toBe("thin");
      expect(first.paint.fill, f).not.toBe("none");
    }
  });

  it("paint on the furniture layer at the two glyph pens only, paint.width agreeing, and use both", () => {
    for (const f of FAMILIES) {
      const nodes = glyph(f);
      for (const n of nodes) {
        expect(n.layer, f).toBe("furniture");
        expect(["thin", "extraThin"], f).toContain(n.lineWeight);
        expect(n.paint.width, f).toBe(weightWidth(n.lineWeight!, SIZES));
      }
      expect(
        nodes.some((n) => n.lineWeight === "extraThin"),
        `${f} has detail`,
      ).toBe(true);
    }
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

  it("dash only what is hidden: the side table's shelf, the console's shelf, the rack's rails", () => {
    const dashed = FAMILIES.filter((f) => glyph(f).some((n) => n.lineType === "dashed"));
    expect(dashed).toEqual(["side_table", "console_table", "server_rack"]);
    for (const f of dashed) {
      for (const n of glyph(f).filter((x) => x.lineType === "dashed")) {
        expect(n.lineWeight, f).toBe("extraThin");
        expect(n.paint.dash, f).toBeDefined();
      }
    }
  });

  it("draw a fixed count at the catalogued footprint, and a clamped one at every aspect", () => {
    const EXPECTED: Readonly<Record<(typeof FAMILIES)[number], number>> = {
      floor_lamp: 7,
      side_table: 3,
      console_table: 4,
      ottoman: 6,
      bean_bag: 3,
      pantry: 5,
      towel_rail: 6,
      palm: 42,
      flower_bed: 22,
      boulder: 4,
      picnic_table: 9,
      slide: 10,
      bollard: 3,
      bike_rack: 9,
      raised_bed: 18,
      whiteboard: 5,
      printer: 6,
      server_rack: 6,
      hospital_bed: 12,
      workstation: 16,
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

describe("V8 families — inside the footprint", () => {
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
      return { f, x: 500 + (i % 5) * 3600, y: 500 + Math.floor(i / 5) * 3600, w, h };
    });
    for (const rot of [0, 90, 180, 270]) {
      const src = `plan "V8" {\n  units mm\n  room id=r at (0,0) size 18500x15000 label "All"\n${pieces
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
        // Every node the piece drew is inside its own footprint, so they are all found there.
        expect(mine.length, `${p.f} rotate ${rot}`).toBe(count(p));
      }
      expect(nodes.length, `rotate ${rot}: no node outside every footprint`).toBe(
        pieces.reduce((s, p) => s + count(p), 0),
      );
    }
  });
});

describe("V8 families — no hand, and the symmetric ones D4-invariant", () => {
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

  it("is not vacuous: one off-centre mark is seen as a hand", () => {
    const r = { x: 0, y: 0, w: 1000, h: 1000 };
    const nodes = glyph("ottoman", r);
    const planted = [
      ...nodes,
      { ...nodes[1]!, prim: { t: "line" as const, a: { x: 200, y: 0 }, b: { x: 200, y: 1000 } } },
    ];
    expect(
      marksEqual(
        planted,
        planted.map((n) => mirrorNode(n, 500)),
      ),
    ).toBe(false);
  });

  it("the `symmetric` families map onto themselves under every turn and both mirrors", () => {
    const RADIAL = new Set(["floor_lamp", "palm", "bollard"]);
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
    expect(symmetric.length).toBe(5);
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
      const n = glyph(f)[i]!;
      const pts = inkPoints(n);
      return pts.reduce((s, p) => s + p.y, 0) / pts.length;
    };
    const mid = (f: string): number => at(f).h / 2;
    expect(y("console_table", 2)).toBeLessThan(mid("console_table")); // the back rail
    expect(y("pantry", 1)).toBeGreaterThan(mid("pantry")); // the door-front line
    expect(y("towel_rail", 1)).toBeLessThan(mid("towel_rail")); // a wall bracket
    expect(y("slide", 5)).toBeLessThan(mid("slide")); // a ladder stringer
    expect(y("whiteboard", 0)).toBeLessThan(mid("whiteboard")); // the board, on the wall
    expect(y("printer", 4)).toBeGreaterThan(mid("printer")); // the control panel
    expect(y("server_rack", 2)).toBeGreaterThan(mid("server_rack")); // the front door line
    expect(y("hospital_bed", 1)).toBeLessThan(mid("hospital_bed")); // the head panel
  });
});

describe("V8 families — under `rendered`, each part takes its own material", () => {
  const rendered = mergeTheme(THEMES.rendered);
  const tints = rendered.materialTints!;
  const blank = rendered.opening;
  const fills = (f: string): (string | undefined)[] => glyph(f, undefined, rendered).map((n) => n.paint.fill);

  it("the shade is fabric, its open top the light, the finial metal", () => {
    expect(fills("floor_lamp")[0]).toBe(tints.fabric);
    expect(fills("floor_lamp")[1]).toBe(blank);
    expect(fills("floor_lamp").at(-1)).toBe(tints.metal);
  });

  it("planting: the palm's crown is foliage and its trunk bark; a bed's flowers foliage on soil", () => {
    expect(fills("palm")[0]).toBe(tints.foliage);
    expect(fills("palm").at(-1)).toBe(tints.bark);
    expect(fills("flower_bed")[0]).toBe(tints.soil);
    expect(fills("flower_bed")).toContain(tints.foliage);
    expect(fills("raised_bed").slice(0, 2)).toEqual([tints.wood, blank]);
    expect(fills("raised_bed").at(-1)).toBe(tints.foliage);
  });

  it("the soft goods, the beds and the equipment", () => {
    expect(fills("ottoman").slice(0, 2)).toEqual([tints.fabric, tints.cushion]);
    expect(fills("bean_bag")).toEqual([tints.fabric, tints.fabric, tints.cushion]);
    expect(fills("hospital_bed")[0]).toBe(tints.metal);
    expect(fills("hospital_bed")).toContain(tints.linen);
    expect(fills("hospital_bed").at(-1)).toBe(blank);
    expect(fills("slide").slice(0, 2)).toEqual([tints.paint, tints.metal]);
    expect(fills("printer")).toEqual(expect.arrayContaining([tints.appliance, blank, tints.screen]));
    expect(fills("workstation")[0]).toBe(tints.wood);
    expect(fills("workstation")[1]).toBe(tints.fabric);
    expect(fills("boulder")[0]).toBe(tints.stone);
  });

  it("without tints, every theme draws them with its own furniture fill", () => {
    for (const f of FAMILIES) expect(fills(f).length, f).toBe(glyph(f).length);
    expect(glyph("boulder")[0]!.paint.fill).toBe(DEFAULT_THEME.furnitureFill);
    expect(glyph("palm")[0]!.paint.fill).toBe(DEFAULT_THEME.lawn);
  });
});
