/**
 * T0 furniture, visual-assets cards V1–V3, V5, V6: the shape primitives (V2) one by one — every
 * shell closed, outward-wound, integer micrometres, its extents the box asked for — then every
 * generator over a sweep of sizes: fitted exactly to its footprint, as tall as its ledgered
 * height (a wall-hung one from its mount), mirror-symmetric across its width unless its family is
 * handed (then built reflected when the plan reflects it), its material slots its family's row
 * (V1). Then the catalogue's names: every word of a built family's core row is registered, and
 * every family of the batches is built. The palette both renderers read is checked last.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adaptPlan,
  assetFor,
  buildMesh,
  type Furniture,
  linearRgb,
  MATERIAL_SLOTS,
  PALETTE,
  type Part,
  partShell,
  sectionRing,
  type Shell,
  slotColour,
  slotGroups,
  T0_FAMILIES,
  T0_HANDED,
  T0_HEIGHT_MM,
  T0_MATERIALS,
  T0_MOUNT_MM,
  t0LocalParts,
  t0Shells,
  validateScene3D,
} from "../src/index.js";
import { openEdges, signedVolume } from "../src/node.js";
import { WORLD } from "./corpus.js";

/** [min, max] of a shell's x, y and z, µm. */
function extents(s: Shell): [[number, number], [number, number], [number, number]] {
  const out: Array<[number, number]> = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ];
  for (let i = 0; i < s.positions.length; i++) {
    const e = out[i % 3] as [number, number];
    const v = s.positions[i] as number;
    e[0] = Math.min(e[0], v);
    e[1] = Math.max(e[1], v);
  }
  return out as [[number, number], [number, number], [number, number]];
}

/** The shell is closed, outward-wound and integer, and spans exactly `p`'s box. */
function expectSound(s: Shell | null, p: Part, what: string): asserts s is Shell {
  expect(s, what).not.toBeNull();
  if (!s) return;
  expect(openEdges(s), `${what}: open edges`).toBe(0);
  expect(signedVolume(s), `${what}: outward`).toBeGreaterThan(0);
  expect(
    s.positions.every((v) => Number.isInteger(v)),
    `${what}: integer µm`,
  ).toBe(true);
  const um = (v: number) => (v < 0 ? -Math.round(-v * 1000) : Math.round(v * 1000)) || 0;
  expect(
    s.positions.some((v) => Object.is(v, -0)),
    `${what}: no −0`,
  ).toBe(false);
  expect(extents(s), `${what}: extents`).toEqual([
    [um(p.x0), um(p.x1)],
    [um(p.y0), um(p.y1)],
    [um(p.z0), um(p.z1)],
  ]);
}

describe("V2 shape primitives", () => {
  const box: Part = { x0: -300, x1: 500, z0: -200, z1: 250, y0: 100, y1: 400 };
  const cases: Array<[string, Partial<Part>]> = [
    ["a box", {}],
    ["an ellipse", { round: true }],
    ["rounded corners", { radius: 60 }],
    ["rounded corners at full radius (a stadium)", { radius: 1000 }],
    [
      "a profile",
      {
        profile: [
          [0, 0],
          [1, 0],
          [0.7, 1],
          [0.2, 0.8],
        ],
      },
    ],
    ["a plate with a hole", { holes: [{ x0: -100, x1: 300, z0: -100, z1: 100, radius: 30 }] }],
    ["a ring", { round: true, holes: [{ x0: -100, x1: 300, z0: -100, z1: 100, round: true }] }],
  ];
  for (const axis of [undefined, "x", "z"] as const) {
    for (const [name, more] of cases) {
      if (axis && more.holes) continue;
      it(`${name}, ${axis ? `extruded along ${axis}` : "extruded up"}: closed, outward, integer, its box`, () => {
        const p: Part = { ...box, ...more, ...(axis ? { axis } : {}) };
        expectSound(partShell(p), p, `${name} ${axis ?? "y"}`);
      });
    }
  }

  it("rounds a corner with four quarter-arc steps from the exact table, and repeats no point", () => {
    const r = sectionRing(0, 1, 0, 1, { radius: 0.5 });
    // A circle of radius 0.5 mm: 16 distinct points (the four arcs share their end points).
    expect(r.length).toBe(16);
    expect(new Set(r.map((p) => p.join())).size).toBe(16);
    // The 45° point of the first quarter: centre + r·√½, rounded to the micrometre.
    expect(r).toContainEqual([
      Math.round((0.5 + 0.5 * Math.SQRT1_2) * 1000),
      Math.round((0.5 + 0.5 * Math.SQRT1_2) * 1000),
    ]);
    const rr = sectionRing(0, 2, 0, 1, { radius: 0.2 });
    expect(rr.length).toBe(20);
  });

  it("builds nothing for an empty or inverted box, and no ring for an inverted section", () => {
    expect(partShell({ ...box, x0: 500, x1: -300 })).toBeNull();
    expect(partShell({ ...box, y0: 400, y1: 400 })).toBeNull();
    expect(partShell({ ...box, z0: 250, z1: -200, axis: "x", radius: 30 })).toBeNull();
    expect(sectionRing(10, 0, 0, 10, { radius: 5 })).toEqual([]);
    expect(sectionRing(0, 10, 10, 10)).toEqual([]);
  });

  it("builds a part whole when a hole is inverted or touches its outline, and counts the holes left out", () => {
    const n = { holes: 0 };
    const inverted = { ...box, holes: [{ x0: 100, x1: -100, z0: -50, z1: 50 }] };
    expectSound(partShell(inverted, n), inverted, "inverted hole");
    expect(n.holes).toBe(1);
    const touching = {
      ...box,
      holes: [
        { x0: -300, x1: 0, z0: -50, z1: 50 },
        { x0: 100, x1: 200, z0: -50, z1: 50 },
      ],
    };
    expectSound(partShell(touching, n), touching, "touching hole");
    expect(n.holes).toBe(3);
    const ok = { ...box, holes: [{ x0: -100, x1: 100, z0: -50, z1: 50 }] };
    expectSound(partShell(ok, n), ok, "a hole that fits");
    expect(n.holes).toBe(3);
  });

  it("refuses holes on a sideways part and a profile point off its box, as programming errors", () => {
    expect(() => partShell({ ...box, axis: "x", holes: [{ x0: 0, x1: 10, z0: 0, z1: 10 }] })).toThrow(/sideways/);
    expect(() =>
      sectionRing(0, 1, 0, 1, {
        profile: [
          [0, 0],
          [1.2, 0],
          [0, 1],
        ],
      }),
    ).toThrow(RangeError);
  });

  it("carries the part's slot on its shell, and none for body", () => {
    expect(partShell({ ...box, mat: "wood" })?.slot).toBe("wood");
    expect(partShell({ ...box, mat: "body" })).not.toHaveProperty("slot");
    expect(partShell(box)).not.toHaveProperty("slot");
  });
});

describe("V3 generators", () => {
  const sizes: Array<[number, number]> = [];
  for (const W of [350, 450, 600, 900, 1300, 2000, 2800])
    for (const D of [350, 450, 600, 900, 1500, 2000]) sizes.push([W, D]);

  /** A shell's vertex set as a sorted string, optionally mirrored across the width (x → −x). */
  const sig = (s: Shell, mirror: boolean): string => {
    const pts: string[] = [];
    for (let i = 0; i < s.positions.length; i += 3) {
      const x = s.positions[i] as number;
      pts.push(`${mirror ? -x || 0 : x},${s.positions[i + 1]},${s.positions[i + 2]}`);
    }
    return `${s.slot ?? "body"}|${[...new Set(pts)].sort().join(";")}`;
  };

  for (const family of Object.keys(T0_FAMILIES)) {
    const handed = T0_HANDED.has(family);
    const mount = T0_MOUNT_MM[family];
    it(`${family}: every part sound, fitted to the footprint, ${T0_HEIGHT_MM[family]} mm tall${mount ? ` from ${mount} mm` : ""}, ${handed ? "handed" : "symmetric"}, its slots`, () => {
      for (const [W, D] of sizes) {
        const what = `${family} ${W}x${D}`;
        const parts = t0LocalParts(family, W, D) ?? [];
        expect(parts.length, what).toBeGreaterThan(1);
        expect(parts.length, `${what}: a modest part count`).toBeLessThanOrEqual(24);
        const dropped = { holes: 0 };
        const shells = parts.map((p, i) => {
          const s = partShell(p, dropped);
          expectSound(s, p, `${what} part ${i}`);
          return s;
        });
        expect(dropped.holes, `${what}: holes left out`).toBe(0);
        const all = shells.map(extents);
        const lo = (k: number) => Math.min(...all.map((e) => e[k]?.[0] as number));
        const hi = (k: number) => Math.max(...all.map((e) => e[k]?.[1] as number));
        expect([lo(0), hi(0), hi(1), lo(2), hi(2)], `${what}: box`).toEqual([
          -W * 500,
          W * 500,
          (T0_HEIGHT_MM[family] as number) * 1000,
          -D * 500,
          D * 500,
        ]);
        // A standing piece stands on the floor; a wall-hung one draws nothing below its mount.
        if (mount === undefined) expect(lo(1), `${what}: on the floor`).toBe(0);
        else expect(lo(1), `${what}: hung`).toBeGreaterThanOrEqual(mount * 1000);
        const own = shells.map((s) => sig(s, false)).sort();
        const mirrored = shells.map((s) => sig(s, true)).sort();
        // A handed family really is handed (else the flag would be vacuous): see "handed" below.
        if (handed) expect(mirrored, `${what}: handed`).not.toEqual(own);
        else expect(mirrored, `${what}: mirror-symmetric`).toEqual(own);
        const slots = MATERIAL_SLOTS.filter((m) => shells.some((s) => (s.slot ?? "body") === m));
        expect(slots, `${what}: slots`).toEqual(T0_MATERIALS[family]);
      }
    });
  }

  it("hangs the wall cabinet, the hood, the mirror and the urinal by their underside at every size", () => {
    for (const family of ["upper_cabinet", "range_hood", "mirror", "urinal"]) {
      for (const [W, D] of sizes) {
        const ys = (t0LocalParts(family, W, D) ?? []).map((p) => p.y0);
        expect(Math.min(...ys), `${family} ${W}x${D}`).toBe(T0_MOUNT_MM[family]);
      }
    }
    expect(T0_MOUNT_MM.upper_cabinet).toBe(1400); // card V6
  });

  it("hangs a television by its top, 16:9 from its width, its widest panel at its mount", () => {
    for (const W of [700, 1000, 1200, 1351, 1352, 1600, 2400]) {
      const ys = (t0LocalParts("tv", W, 80) ?? []).map((p) => p.y0);
      const ph = Math.min(W * 0.5625, 760);
      expect(Math.min(...ys), `tv ${W}`).toBeCloseTo((T0_HEIGHT_MM.tv as number) - ph, 9);
    }
    expect((T0_HEIGHT_MM.tv as number) - 760).toBe(T0_MOUNT_MM.tv);
  });

  // Small and thin pieces (red-team round 1, PR #459): down to 50 mm, and long slivers both ways.
  const small: Array<[number, number]> = [];
  for (const W of [50, 80, 100, 150, 200, 250, 300])
    for (const D of [50, 80, 100, 150, 200, 250, 300]) small.push([W, D]);
  small.push([2000, 100], [100, 2000], [3000, 60], [60, 3000], [2000, 140], [600, 140], [600, 150], [100, 800]);
  for (const family of Object.keys(T0_FAMILIES)) {
    it(`${family}, small and thin: every part closed or left out, inside the footprint and its height, symmetric`, () => {
      for (const [W, D] of small) {
        const what = `${family} ${W}x${D}`;
        const parts = t0LocalParts(family, W, D) ?? [];
        expect(parts.length, what).toBeGreaterThan(0);
        const dropped = { holes: 0 };
        // A part with no room is left out by the generator; every part it keeps builds a sound shell.
        const shells = parts.map((p, i) => {
          const s = partShell(p, dropped);
          expectSound(s, p, `${what} part ${i}`);
          return s;
        });
        const all = shells.map(extents);
        const lo = (k: number) => Math.min(...all.map((e) => e[k]?.[0] as number));
        const hi = (k: number) => Math.max(...all.map((e) => e[k]?.[1] as number));
        expect(lo(0), `${what}: x`).toBeGreaterThanOrEqual(-W * 500);
        expect(hi(0), `${what}: x`).toBeLessThanOrEqual(W * 500);
        expect(lo(2), `${what}: z`).toBeGreaterThanOrEqual(-D * 500);
        expect(hi(2), `${what}: z`).toBeLessThanOrEqual(D * 500);
        const mount = T0_MOUNT_MM[family];
        if (mount === undefined) expect(lo(1), `${what}: on the floor`).toBe(0);
        else expect(lo(1), `${what}: hung`).toBeGreaterThanOrEqual(mount * 1000);
        expect(hi(1), `${what}: height`).toBeLessThanOrEqual((T0_HEIGHT_MM[family] as number) * 1000);
        if (!T0_HANDED.has(family)) {
          const own = shells.map((s) => sig(s, false)).sort();
          expect(shells.map((s) => sig(s, true)).sort(), `${what}: mirror-symmetric`).toEqual(own);
        }
        for (const s of shells) expect(T0_MATERIALS[family], what).toContain(s.slot);
      }
    });
  }

  it("has no generator for a word outside the catalogue, which stays a grey box", () => {
    expect(t0LocalParts("lectern", 1200, 600)).toBeNull();
    expect(assetFor("lectern")).toBe("greybox");
  });
});

describe("V5, V6: the catalogue's names", () => {
  // The core's family rows, read from its source (the table is not exported): `["sofa_l",
  // "corner_sofa"]`, one per family, every alias of the family on its row.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../src/elements/fixtures-glyphs.ts"),
    "utf8",
  );
  const table = src.slice(
    src.indexOf("const FIXTURE_FAMILIES"),
    src.indexOf("\n];", src.indexOf("const FIXTURE_FAMILIES")),
  );
  const rows = [...table.matchAll(/^\s*\[("[a-z0-9_]+"(?:,\s*"[a-z0-9_]+")*)\],/gm)].map((m) =>
    [...(m[1] as string).matchAll(/"([a-z0-9_]+)"/g)].map((w) => w[1] as string),
  );
  const builtBy = (word: string): string | undefined => {
    const a = assetFor(word);
    return a === "greybox" ? undefined : a;
  };

  it("reads the core's table", () => {
    expect(rows.length).toBeGreaterThanOrEqual(83);
    expect(rows).toContainEqual(["sofa_l", "corner_sofa"]);
    expect(rows).toContainEqual(["bathtub", "tub", "bath"]);
  });

  it("registers every word of a built family's row, all to one generator, and no word the catalogue lacks", () => {
    for (const row of rows) {
      const assets = new Set(row.map(builtBy));
      if (!row.some((w) => builtBy(w))) continue;
      expect([...assets], row.join(",")).toHaveLength(1);
      expect(assets.has(undefined), row.join(",")).toBe(false);
    }
    const words = new Set(rows.flat());
    for (const names of Object.values(T0_FAMILIES)) for (const n of names) expect(words.has(n), n).toBe(true);
  });

  // The cards' lists (docs/plans/visual-assets/cards.md): no grey box for a family of these batches.
  const BATCHES: Record<string, string[]> = {
    V3: [
      "bed",
      "sofa",
      "table",
      "rug",
      "wardrobe",
      "fridge",
      "counter",
      "kitchen_sink",
      "stove",
      "shower",
      "wc",
      "basin",
    ],
    V5: [
      "double_bed",
      "nightstand",
      "armchair",
      "coffee_table",
      "tv_unit",
      "chair",
      "stool",
      "bench",
      "desk",
      "office_chair",
      "bookshelf",
      "sofa_l",
      "piano",
      "bunk_bed",
      "crib",
      "dresser",
      "vanity",
      "fireplace",
      "radiator",
      "sideboard",
      "loveseat",
      "chaise",
      "tv",
      "coat_rack",
      "shoe_cabinet",
      "mirror",
    ],
    V6: [
      "bathtub",
      "oven",
      "dishwasher",
      "island",
      "upper_cabinet",
      "washer",
      "dryer",
      "bidet",
      "urinal",
      "laundry_sink",
      "water_heater",
      "range_hood",
      "microwave",
      "bar_counter",
    ],
  };
  for (const [card, families] of Object.entries(BATCHES)) {
    it(`builds every family of ${card}, and every alias of each, from a T0 generator`, () => {
      for (const f of families) {
        const row = rows.find((r) => r[0] === f);
        expect(row, f).toBeDefined();
        for (const w of row ?? []) expect(assetFor(w), w).toMatch(/^t0:/);
      }
    });
  }
});

describe("V5: a handed family is built as the plan draws it", () => {
  /** A piece at the origin, `w` × `d` mm on the plan, turned `rotate`, reflected or not. */
  const piece = (family: string, w: number, d: number, rotate: number, mirror: boolean): Furniture => ({
    id: "p",
    source: { kind: "furniture", id: "p" },
    category: family,
    centre: [0, 0],
    size: { w: w * 1000, d: d * 1000 },
    yawDeg: rotate === 0 ? 0 : -rotate,
    asset: `t0:${family}`,
    ...(mirror ? { mirror: true as const } : {}),
  });
  /** Every vertex of the built piece in plan (x, up, y), optionally reflected across plan x or y. */
  const cloud = (shells: Array<Shell | null>, flip?: 0 | 2): string[] =>
    shells
      .flatMap((s) => {
        const out: string[] = [];
        for (let i = 0; s && i < s.positions.length; i += 3) {
          const p = [s.positions[i], s.positions[i + 1], s.positions[i + 2]] as number[];
          if (flip !== undefined) p[flip] = -(p[flip] as number) || 0;
          out.push(`${s.slot}|${p.join(",")}`);
        }
        return out;
      })
      .sort();

  it("lists exactly the families the core draws handed in their shape", () => {
    expect([...T0_HANDED].sort()).toEqual(["chaise", "piano", "sofa_l"]);
  });

  for (const family of ["sofa_l", "chaise", "piano"]) {
    it(`${family}: a reflected piece is the plain one reflected across its own width, at every quarter turn`, () => {
      for (const [w, d] of [
        [2600, 1600],
        [1600, 800],
        [1400, 1400],
        [1200, 2000],
      ] as const) {
        for (const rotate of [0, 90, 180, 270]) {
          const [pw, pd] = rotate % 180 === 0 ? [w, d] : [d, w];
          const plain = t0Shells(piece(family, pw, pd, rotate, false), 0)?.shells ?? [];
          const flipped = t0Shells(piece(family, pw, pd, rotate, true), 0)?.shells ?? [];
          // The piece's width runs along plan x unturned, along plan y at a quarter turn.
          const axis = rotate % 180 === 0 ? 0 : 2;
          const what = `${family} ${w}x${d} rotate ${rotate}`;
          expect(cloud(flipped), what).toEqual(cloud(plain, axis));
          expect(cloud(flipped), `${what}: handed`).not.toEqual(cloud(plain));
          for (const s of flipped) {
            expect(s, what).not.toBeNull();
            if (!s) continue;
            expect(openEdges(s), `${what}: closed`).toBe(0);
            expect(signedVolume(s), `${what}: outward`).toBeGreaterThan(0);
          }
        }
      }
    });
  }

  const plan = (body: string) =>
    `plan "t" { units mm grid 50 wall id=w exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close } room id=r at (0,0) size 8000x6000 label "R" ${body} }`;
  const scene = (body: string) => {
    const r = adaptPlan(plan(body), { world: WORLD });
    if (!r.ok) throw new Error(r.refusal.code);
    expect(validateScene3D(r.scene)).toEqual([]);
    return r.scene;
  };

  it("reads a piece's reflection from the core's Plan JSON: its own `mirror` and a reflecting `place`", () => {
    const own = scene(
      "furniture sofa_l at (500,500) size 2600x1600 mirror furniture sofa_l at (500,3500) size 2600x1600",
    );
    expect(own.levels[0]?.furniture.map((f) => [f.id, f.mirror ?? false])).toEqual([
      ["sofa_l_1", true],
      ["sofa_l_2", false],
    ]);
    const placed = scene(
      "component c() { furniture chaise at (0,0) size 1600x800 furniture bed at (0,1000) size 1500x2000 } place c() as a at (500,500) place c() as b at (4000,500) mirror x",
    );
    expect(placed.levels[0]?.furniture.map((f) => [f.id, f.mirror ?? false])).toEqual([
      ["a.chaise_1", false],
      ["a.bed_2", false],
      ["b.chaise_1", true],
      // A symmetric asset is its own reflection: the fact is not recorded on it.
      ["b.bed_2", false],
    ]);
    const mesh = buildMesh(placed);
    expect(mesh.nodes.find((n) => n.id === "b.chaise_1")?.extras.mirror).toBe(true);
    expect(mesh.nodes.find((n) => n.id === "a.chaise_1")?.extras).not.toHaveProperty("mirror");
  });

  it("stands a handed piece as a grey box, ledgered, when the reflection is unknown", async () => {
    const { buildScene3D } = await import("../src/scene3d/build.js");
    const { resolvePlan } = await import("@chanmeng666/archlang");
    const res = resolvePlan(plan("furniture piano at (500,500) size 1400x1400"), {});
    if (!res.ir) throw new Error("no ir");
    const sc = buildScene3D([{ level: 1, ir: res.ir }], { coreVersion: "x" });
    expect(sc.levels[0]?.furniture[0]?.asset).toBe("greybox");
    expect(sc.meta.assumptions).toContainEqual(
      expect.objectContaining({ id: "piano_1", rule: "furniture-handed-mirror-unknown", value: "greybox" }),
    );
    const known = buildScene3D([{ level: 1, ir: res.ir }], { coreVersion: "x", mirrored: [new Set()] });
    expect(known.levels[0]?.furniture[0]?.asset).toBe("t0:piano");
  });
});

describe("V1 palette", () => {
  it("gives every slot but body one entry, a colour, an alpha, glass translucent", () => {
    expect(Object.keys(PALETTE).sort()).toEqual(MATERIAL_SLOTS.filter((s) => s !== "body").sort());
    for (const [slot, m] of Object.entries(PALETTE)) {
      expect(m.srgb, slot).toMatch(/^#[0-9a-f]{6}$/);
      expect(m.alpha, slot).toBeGreaterThan(0);
      expect(m.alpha, slot).toBeLessThanOrEqual(1);
    }
    expect(PALETTE.glass.alpha).toBeLessThan(1);
    // Six or more visibly different materials in one frame (programme success): distinct colours.
    expect(new Set(Object.values(PALETTE).map((m) => m.srgb)).size).toBe(Object.keys(PALETTE).length);
  });

  it("converts sRGB to linear for the GLB exactly at the ends and monotonically between", () => {
    expect(linearRgb("#000000")).toEqual([0, 0, 0]);
    expect(linearRgb("#ffffff")).toEqual([1, 1, 1]);
    expect(linearRgb("#808080")[0]).toBeCloseTo(0.2159, 4);
  });

  it("keeps the light theme's colour and pulls the dark theme's toward its furniture colour", () => {
    expect(slotColour("wood", "light", "#3f6a8f")).toBe(PALETTE.wood.srgb);
    expect(slotColour("wood", "dark", "#000000")).toMatch(/^#[0-9a-f]{6}$/);
    expect(slotColour("linen", "dark", "#3f6a8f")).not.toBe(PALETTE.linen.srgb);
  });

  it("groups a node's shells by slot in palette order, body first", () => {
    const s = (slot?: Shell["slot"]): Shell => ({ positions: [], indices: [], ...(slot ? { slot } : {}) });
    const g = slotGroups([s("metal"), s(), s("wood"), s("metal")]);
    expect(g.map((x) => [x.slot, x.shells.length])).toEqual([
      ["body", 1],
      ["wood", 1],
      ["metal", 2],
    ]);
  });
});
