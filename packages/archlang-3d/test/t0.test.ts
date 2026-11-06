/**
 * T0 furniture, visual-assets cards V1–V3, V5–V7: the shape primitives (V2) one by one — every
 * shell closed, outward-wound, integer micrometres, its extents the box asked for — then every
 * generator over a sweep of sizes: fitted exactly to its footprint, as tall as its ledgered
 * height (a wall-hung one from its mount), mirror-symmetric across its width unless the piece is
 * handed at that size (then built reflected when the plan reflects it), its material slots its
 * family's row (V1). Then the catalogue's names: every word of a built family's core row is
 * registered, every family of the batches is built, and since V7 no catalogued family is a grey
 * box. The palette both renderers read is checked last.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { mirroredIds } from "../src/adapter/adapt.js";
import {
  adaptPlan,
  assetFor,
  buildMesh,
  FINISH_PALETTE,
  finishColour,
  type Furniture,
  handedAt,
  KIND_PALETTE,
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
  T0_HUNG_FROM_TOP,
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
    const mount = T0_MOUNT_MM[family];
    it(`${family}: every part sound, fitted to the footprint, ${T0_HEIGHT_MM[family]} mm tall${mount ? ` from ${mount} mm` : ""}, ${T0_HANDED.has(family) ? "handed" : "symmetric"}, its slots`, () => {
      for (const [W, D] of sizes) {
        const what = `${family} ${W}x${D}`;
        // A bicycle is handed laid along its width and symmetric stood along its depth (V7).
        const handed = handedAt(family, W, D);
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
        // A standing piece stands on the floor; a wall-hung one draws nothing below its mount, and
        // one hung by its top is off the floor.
        if (T0_HUNG_FROM_TOP.has(family)) expect(lo(1), `${what}: hung by its top`).toBeGreaterThan(0);
        else if (mount === undefined) expect(lo(1), `${what}: on the floor`).toBe(0);
        else expect(lo(1), `${what}: hung`).toBe(mount * 1000);
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

  it("hangs the wall cabinet, the hood, the mirror, the urinal, the towel rail and the whiteboard by their underside at every size", () => {
    for (const family of ["upper_cabinet", "range_hood", "mirror", "urinal", "towel_rail", "whiteboard"]) {
      for (const [W, D] of sizes) {
        const ys = (t0LocalParts(family, W, D) ?? []).map((p) => p.y0);
        expect(Math.min(...ys), `${family} ${W}x${D}`).toBe(T0_MOUNT_MM[family]);
      }
    }
    expect(T0_MOUNT_MM.upper_cabinet).toBe(1400); // card V6
    // The core's two new `wallMounted` families (PR #462): a ladder rail 200 mm off the floor, a
    // board hung from 900 mm (`drawWhiteboard`: "from about 900 mm to about 2000 mm").
    expect([T0_MOUNT_MM.towel_rail, T0_MOUNT_MM.whiteboard]).toEqual([200, 900]);
  });

  it("hangs a television by its top, 16:9 from its width, at most 760 mm tall", () => {
    expect([...T0_HUNG_FROM_TOP]).toEqual(["tv"]);
    expect(T0_MOUNT_MM).not.toHaveProperty("tv");
    for (const W of [700, 1000, 1200, 1351, 1352, 1600, 2400]) {
      const ys = (t0LocalParts("tv", W, 80) ?? []).map((p) => p.y0);
      const ph = Math.min(W * 0.5625, 760);
      expect(Math.min(...ys), `tv ${W}`).toBeCloseTo((T0_HEIGHT_MM.tv as number) - ph, 9);
    }
  });

  it("ledgers a 1000 mm television's own underside, as built (red-team S2, PR #461)", () => {
    const r = adaptPlan(
      `plan "t" { units mm grid 50 wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close } room id=r at (0,0) size 6000x4000 label "R" furniture tv at (1000,100) size 1000x80 furniture tv at (3000,100) size 1600x80 }`,
      { world: WORLD },
    );
    if (!r.ok) throw new Error(r.refusal.code);
    const mesh = buildMesh(r.scene);
    const under = mesh.assumptions.filter((a) => a.rule === "furniture-mount-from-top");
    // 1700 mm top, 1000 × 9 / 16 = 562.5 mm panel: 1137.5; a 1600 mm one is held to 760 mm: 940.
    expect(under.map((a) => [a.id, a.field, a.value])).toEqual([
      ["tv_1", "mount_mm", 1137.5],
      ["tv_2", "mount_mm", 940],
    ]);
    // What is ledgered is what is built: the node's lowest vertex, above the 5 mm floor finish.
    const node = mesh.nodes.find((n) => n.id === "tv_1");
    const low = Math.min(...(node?.shells ?? []).flatMap((s) => s.positions.filter((_, k) => k % 3 === 1)));
    expect(low - (r.scene.levels[0]?.elevation ?? 0) - 5000).toBe(1137500);
    // No single underside is stated for the family.
    expect(mesh.assumptions.some((a) => a.field === "mount_mm(tv)")).toBe(false);
  });

  it("ledgers a hung piece whose default top is above the storey's walls, and draws it there", () => {
    const low = adaptPlan(
      `plan "t" { units mm grid 50 wall id=w exterior thickness 200 height 1200 { (0,0) (6000,0) (6000,4000) (0,4000) close } room id=r at (0,0) size 6000x4000 label "R" furniture upper_cabinet at (1000,100) size 600x350 furniture counter at (2000,100) size 600x600 }`,
      { world: WORLD },
    );
    if (!low.ok) throw new Error(low.refusal.code);
    const a = buildMesh(low.scene).assumptions.filter((x) => x.rule === "furniture-hung-above-walls");
    expect(a.map((x) => [x.id, x.value])).toEqual([["upper_cabinet_1", 2100]]);
  });

  it("builds a tree at its default height above its storey's walls, ledgered, never clipped (card V7)", () => {
    const r = adaptPlan(
      `plan "t" { units mm grid 50 wall id=w exterior thickness 200 height 2700 { (0,0) (6000,0) (6000,4000) (0,4000) close } room id=r at (0,0) size 6000x4000 label "R" furniture tree at (8000,1000) size 2400x2400 furniture shrub at (8000,4000) size 900x900 furniture wardrobe at (1000,100) size 1200x600 }`,
      { world: WORLD },
    );
    if (!r.ok) throw new Error(r.refusal.code);
    const mesh = buildMesh(r.scene);
    const above = mesh.assumptions.filter((a) => a.rule === "furniture-above-walls");
    // The tree (5000 mm) rises over the 2700 mm walls; the shrub and the wardrobe do not.
    expect(above.map((a) => [a.id, a.field, a.value])).toEqual([["tree_1", "top_mm", T0_HEIGHT_MM.tree]]);
    const node = mesh.nodes.find((n) => n.id === "tree_1");
    const top = Math.max(...(node?.shells ?? []).flatMap((s) => s.positions.filter((_, k) => k % 3 === 1)));
    expect(top - (r.scene.levels[0]?.elevation ?? 0) - 5000).toBe((T0_HEIGHT_MM.tree as number) * 1000);
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
        if (T0_HUNG_FROM_TOP.has(family)) expect(lo(1), `${what}: hung by its top`).toBeGreaterThan(0);
        else if (mount === undefined) expect(lo(1), `${what}: on the floor`).toBe(0);
        else expect(lo(1), `${what}: hung`).toBeGreaterThanOrEqual(mount * 1000);
        expect(hi(1), `${what}: height`).toBeLessThanOrEqual((T0_HEIGHT_MM[family] as number) * 1000);
        if (!handedAt(family, W, D)) {
          const own = shells.map((s) => sig(s, false)).sort();
          expect(shells.map((s) => sig(s, true)).sort(), `${what}: mirror-symmetric`).toEqual(own);
        }
        for (const s of shells) expect(T0_MATERIALS[family], what).toContain(s.slot);
      }
    });
  }

  // Red-team S2/S3, PR #463: mirror symmetry held only at whole-millimetre sizes; a profile point
  // (from its box's low corner) and its partner could round apart at a half-micrometre tie (a
  // boulder 593.2 x 1034, a picnic table 182.2 x 1264.6, a swing 949.4 x 1028.8; the urinal's bowl
  // at 600 x 306). Points are now placed about the box's centre. A fixed list of one- and
  // two-decimal sizes, with the reported ones, every family symmetric wherever it is not handed.
  const decimal: Array<[number, number]> = [
    [593.2, 1034],
    [182.2, 1264.6],
    [1264.6, 182.2],
    [123.4, 567.8],
    [949.4, 1028.8],
    [600, 306],
    [307, 600],
    [600, 318],
    ...Array.from({ length: 44 }, (_, k): [number, number] => [
      Number((87.3 + 41.7 * k).toFixed(1)),
      Number((1264.6 - 23.45 * k).toFixed(2)),
    ]),
  ];
  for (const family of Object.keys(T0_FAMILIES)) {
    it(`${family}: mirror-symmetric at one- and two-decimal sizes wherever it is not handed (red-team S2)`, () => {
      for (const [W, D] of decimal) {
        if (handedAt(family, W, D)) continue;
        const shells = (t0LocalParts(family, W, D) ?? []).map((p) => partShell(p)).filter((s): s is Shell => !!s);
        const own = shells.map((s) => sig(s, false)).sort();
        expect(shells.map((s) => sig(s, true)).sort(), `${family} ${W}x${D}`).toEqual(own);
      }
    });
  }

  it("has no generator for a word outside the catalogue, which stays a grey box", () => {
    expect(t0LocalParts("lectern", 1200, 600)).toBeNull();
    expect(assetFor("lectern")).toBe("greybox");
  });
});

/**
 * The core's family → material table (`FIXTURE_FAMILY_MATERIALS`, a public export since the
 * `rendered` theme, PR #460), read off the root as a consumer would and feature-detected: a
 * published core older than that has no such export (the peer floor is 1.57).
 */
function familyTable(): Readonly<Record<string, { primary: string; secondary?: string }>> {
  const t = (core as unknown as { FIXTURE_FAMILY_MATERIALS?: Record<string, { primary: string; secondary?: string }> })
    .FIXTURE_FAMILY_MATERIALS;
  if (!t) throw new Error("the core exports no FIXTURE_FAMILY_MATERIALS");
  return t;
}

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

  it("reads the core's table, every row of it: one per family of the core's public material table", () => {
    // The family grouping is not exported, so the rows are read from source; their count and their
    // canonical names are held to the public `FIXTURE_FAMILY_MATERIALS` (one entry per family), so
    // a row the regex misses cannot pass unseen.
    expect(rows.map((r) => r[0]).sort()).toEqual(Object.keys(familyTable()).sort());
    expect(rows).toHaveLength(Object.keys(familyTable()).length);
    expect(rows).toContainEqual(["sofa_l", "corner_sofa"]);
    expect(rows).toContainEqual(["bathtub", "tub", "bath"]);
  });

  // V-D2 (red-team S3, PR #461): a family's 2D tint and its 3D material name the same thing, so the
  // core's primary and secondary for every built family are among its T0 slots.
  it("builds every family with the core's primary and secondary material among its slots", () => {
    const bad: string[] = [];
    for (const [family, m] of Object.entries(familyTable())) {
      const asset = assetFor(family);
      if (asset === "greybox") continue;
      const slots: readonly string[] = T0_MATERIALS[asset.slice(3)] ?? [];
      for (const want of [m.primary, m.secondary]) {
        if (want !== undefined && !slots.includes(want)) bad.push(`${family} (${asset}) lacks ${want}`);
      }
    }
    expect(bad).toEqual([]);
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
      "dining_table",
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
    V7: [
      "plant",
      "tree",
      "conifer",
      "shrub",
      "hedge",
      "car",
      "bicycle",
      "motorcycle",
      "bbq",
      "outdoor_table",
      "outdoor_chair",
      "umbrella",
      "sun_lounger",
      "hot_tub",
      "swing",
      "trampoline",
      "bin",
      "mailbox",
      "ev_charger",
      "pergola",
      "sandpit",
      "fire_pit",
      "shed",
      "clothesline",
      "meeting_table",
      "reception_desk",
      "filing_cabinet",
      "locker",
      "pool_table",
      "treadmill",
    ],
    // The twenty new core families (PR #462), built in the same card (V-D6).
    V8: [
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

  // V7 built the last catalogued families (the twenty new ones of PR #462 with them): a word the
  // core can draw is never a grey box, and a new family ships its generator with it (V-D6). The
  // cards' lists are the whole catalogue, and every word of it, alias or canonical, is built.
  it("builds every catalogued family: no word of the core's table is a grey box", () => {
    expect(rows.flat().filter((w) => assetFor(w) === "greybox")).toEqual([]);
    expect(Object.values(BATCHES).flat().sort()).toEqual(rows.map((r) => r[0]).sort());
    // Every canonical family of the core's public material table has a generator.
    expect(Object.keys(familyTable()).filter((f) => assetFor(f) === "greybox")).toEqual([]);
    // And every word the core's public manifest lists (`buildManifest().fixtureCategories`, the
    // flattened family table) — red-team N6.
    const words = core.buildManifest("test").fixtureCategories;
    expect(words.length).toBe(rows.flat().length);
    expect(words.filter((w) => assetFor(w) === "greybox")).toEqual([]);
  });
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
    // `test/glyph-chirality.test.ts`'s survey also finds the mailbox, the charge point (and the
    // bed, the desk …) handed: by a detail (a flag, a plug), which the model leaves out (V5–V7).
    expect([...T0_HANDED].sort()).toEqual(["bicycle", "chaise", "motorcycle", "piano", "reception_desk", "sofa_l"]);
  });

  // A bicycle and a motorcycle are read off their own long axis (`axisPt`, glyphs-outdoor.ts):
  // laid along the width the front (the handlebar, the front wheel) is at the RIGHT, +x; stood
  // along the depth the front is at +z and the drawing is symmetric across the width (V7).
  for (const family of ["bicycle", "motorcycle"]) {
    it(`${family}: the front is at +x laid along the width, and nothing is handed stood along the depth (\`draw${family === "bicycle" ? "Bicycle" : "Motorcycle"}\`, glyphs-outdoor.ts)`, () => {
      for (const [W, D] of [
        [1800, 600],
        [2200, 900],
        [600, 600],
      ] as const) {
        expect(handedAt(family, W, D), `${W}x${D}`).toBe(true);
        const parts = t0LocalParts(family, W, D) ?? [];
        // The handlebar: the widest part across, high up.
        const bar = parts.filter((p) => p.y0 >= 990).reduce((a, b) => (b.z1 - b.z0 > a.z1 - a.z0 ? b : a));
        expect((bar.x0 + bar.x1) / 2, `${W}x${D}: bar at the front, +x`).toBeGreaterThan(0);
      }
      for (const [W, D] of [
        [600, 1800],
        [900, 2200],
      ] as const) {
        expect(handedAt(family, W, D), `${W}x${D}`).toBe(false);
        const parts = t0LocalParts(family, W, D) ?? [];
        const bar = parts.filter((p) => p.y0 >= 990).reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
        expect((bar.z0 + bar.z1) / 2, `${W}x${D}: bar at the front, +z`).toBeGreaterThan(0);
      }
    });
  }

  it("reception_desk: the return is on the LEFT and the staff chair in the open front-right quadrant (`drawReceptionDesk`, glyphs-misc.ts: the return at `x0`, the chair at 0.62 of the width)", () => {
    for (const [W, D] of sizesOf) {
      const parts = t0LocalParts("reception_desk", W, D) ?? [];
      const runZ = -D / 2 + D * 0.42;
      // Everything raised along the outer faces (the fascia, the ledge) that reaches in front of
      // the back run: the return's.
      const front = parts.filter((p) => p.y0 >= 770 && p.z1 > runZ + 1 && (p.mat === "wood" || p.mat === "stone"));
      expect(front.length, `${W}x${D}`).toBeGreaterThan(0);
      for (const p of front) expect(p.x1, `${W}x${D}: the return at the left`).toBeLessThan(0);
      const seat = parts.find((p) => p.mat === "fabric" && p.y0 === 430);
      expect(((seat?.x0 ?? 0) + (seat?.x1 ?? 0)) / 2, `${W}x${D}: chair right of centre`).toBeGreaterThan(0);
      expect(((seat?.z0 ?? 0) + (seat?.z1 ?? 0)) / 2, `${W}x${D}: chair in front of the run`).toBeGreaterThan(runZ);
    }
  });

  // Each handed generator's own hand IS the core drawing's hand (red-team S4, PR #461): local +x is
  // the symbol frame's +x (right on the page), local −z its top (the back).
  const sizesOf: Array<[number, number]> = [
    [2600, 1600],
    [1600, 800],
    [1400, 1400],
    [1500, 2100],
    [3200, 1800],
  ];
  it("sofa_l: the return is on the LEFT, the front-right quadrant open (`drawSofaL`, glyphs-living.ts:594-595: the second arm at `x0`, the foot of the return)", () => {
    for (const [W, D] of sizesOf) {
      const R = Math.min(D * 0.56, W * 0.35);
      const parts = t0LocalParts("sofa_l", W, D) ?? [];
      // Everything in front of the back run: the return's seats, back cushions and arm.
      const front = parts.filter((p) => p.z0 >= -D / 2 + R);
      expect(front.length, `${W}x${D}`).toBeGreaterThan(1);
      const area = front.reduce((s, p) => s + (p.x1 - p.x0) * (p.z1 - p.z0), 0);
      const cx = front.reduce((s, p) => s + ((p.x0 + p.x1) / 2) * (p.x1 - p.x0) * (p.z1 - p.z0), 0) / area;
      expect(cx, `${W}x${D}: return's x-centroid`).toBeLessThan(0);
      expect(Math.max(...front.map((p) => p.x1)), `${W}x${D}: nothing in the open quadrant`).toBeLessThanOrEqual(
        -W / 2 + R,
      );
    }
  });

  it("chaise: the one arm is on the LEFT and the right end open (`drawChaise`, glyphs-living.ts:978: the arm at `r.x`)", () => {
    for (const [W, D] of sizesOf) {
      const parts = t0LocalParts("chaise", W, D) ?? [];
      const arms = parts.filter((p) => p.mat === "fabric" && p.y1 === 620);
      expect(arms, `${W}x${D}`).toHaveLength(1);
      expect(arms[0]?.x0, `${W}x${D}: arm at the left edge`).toBe(-W / 2);
      expect((arms[0]?.x1 ?? 0) < 0, `${W}x${D}: arm left of centre`).toBe(true);
    }
  });

  it("piano: the straight bass side is at +x and the tail on the right (`grandCase`, glyphs-living.ts:689: the tail circle at `x1 - rt`)", () => {
    for (const [W, D] of sizesOf) {
      const parts = t0LocalParts("piano", W, D) ?? [];
      const body = parts.find((p) => p.y0 === 600 && p.y1 === 700);
      if (!body) throw new Error("no case");
      const ring = sectionRing(body.x0, body.x1, body.z0, body.z1, body);
      const right = ring.filter(([x]) => x === Math.round((W / 2) * 1000)).map(([, z]) => z);
      const len = (body.z1 - body.z0) * 1000;
      // The bass side runs straight at +x from the keyboard to 80% of the case's length.
      expect(Math.max(...right) - Math.min(...right), `${W}x${D}: straight +x side`).toBeGreaterThanOrEqual(0.8 * len);
      const left = ring.filter(([x]) => x === Math.round((-W / 2) * 1000)).map(([, z]) => z);
      expect(Math.max(...left) - Math.min(...left), `${W}x${D}: short cheek at −x`).toBeLessThan(0.4 * len);
      const tail = ring.reduce((a, b) => (b[1] > a[1] ? b : a));
      expect(tail[0], `${W}x${D}: tail on the right`).toBeGreaterThan(0);
    }
  });

  it("reads each storey's reflections from its own Plan JSON page (a multi-storey plan)", () => {
    const two = `plan "t" { units mm grid 50
  level 1 { wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close } room id=r at (0,0) size 6000x4000 label "A" furniture chaise at (500,500) size 1600x800 }
  level 2 { wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close } room id=r at (0,0) size 6000x4000 label "B" furniture chaise at (500,500) size 1600x800 mirror furniture chaise at (500,2000) size 1600x800 }
}`;
    const r = adaptPlan(two, { world: WORLD });
    if (!r.ok) throw new Error(r.refusal.code);
    expect(validateScene3D(r.scene)).toEqual([]);
    expect(r.scene.levels.map((lv) => lv.furniture.map((f) => [f.id, f.asset, f.mirror ?? false]))).toEqual([
      [["chaise_1", "t0:chaise", false]],
      [
        ["chaise_1", "t0:chaise", true],
        ["chaise_2", "t0:chaise", false],
      ],
    ]);
  });

  it("calls a reflection unknown on every storey when Plan JSON's pages do not match the storeys", () => {
    const one = plan("furniture chaise at (500,500) size 1600x800 mirror");
    expect(mirroredIds(one, WORLD, 1)).toEqual([new Set(["chaise_1"])]);
    // The one page of a single-storey plan cannot be matched to two storeys: unknown, both.
    expect(mirroredIds(one, WORLD, 2)).toEqual([null, null]);
  });

  for (const family of ["sofa_l", "chaise", "piano", "reception_desk", "bicycle", "motorcycle"]) {
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
          // A bicycle stood along its depth is its own reflection: the plan's reflection changes nothing.
          if (handedAt(family, w, d)) expect(cloud(flipped), `${what}: handed`).not.toEqual(cloud(plain));
          else expect(cloud(flipped), `${what}: symmetric here`).toEqual(cloud(plain));
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

  // Red-team N3, PR #463: only a piece handed at ITS size needs its reflection. A bicycle laid
  // along its width is greyed when that is unknown; one stood along its depth is symmetric there
  // and is built. `size` is the plan box: turned a quarter, a 600 x 1800 box is a piece 1800 wide
  // in its own frame (handed), an 1800 x 600 one a piece stood on end (symmetric).
  it("greys a bicycle for an unknown reflection only where it is handed at its own size", async () => {
    const { buildScene3D } = await import("../src/scene3d/build.js");
    const { resolvePlan } = await import("@chanmeng666/archlang");
    const res = resolvePlan(
      plan(
        "furniture bicycle at (500,500) size 1800x600 furniture bicycle at (500,2000) size 600x1800 furniture bicycle at (3000,2000) size 600x1800 rotate 90 furniture bicycle at (3000,4500) size 1800x600 rotate 90",
      ),
      {},
    );
    if (!res.ir) throw new Error("no ir");
    const sc = buildScene3D([{ level: 1, ir: res.ir }], { coreVersion: "x" });
    expect(sc.levels[0]?.furniture.map((f) => [f.id, f.asset])).toEqual([
      ["bicycle_1", "greybox"],
      ["bicycle_2", "t0:bicycle"],
      ["bicycle_3", "greybox"],
      ["bicycle_4", "t0:bicycle"],
    ]);
    expect(sc.meta.assumptions.filter((a) => a.rule === "furniture-handed-mirror-unknown").map((a) => a.id)).toEqual([
      "bicycle_1",
      "bicycle_3",
    ]);
  });
});

// Red-team S1, PR #463: the seat counts are the core's own expressions on the UNROUNDED band, so
// at a .5 tie (outdoor_table 363 x 220: 3 a side in the drawing) the model rounds the same way.
// The core's formulas, from the glyphs they draw (glyphs-outdoor.ts `drawOutdoorTable`,
// glyphs-misc.ts `drawMeetingTable` and `drawWorkstation`).
describe("seat counts agree with the core's drawing at every tie size (red-team S1)", () => {
  const cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const CORE: Record<
    string,
    {
      per: (W: number, D: number, band: number) => number;
      total: (W: number, D: number, n: number) => number;
      frac: number;
      max: number;
    }
  > = {
    outdoor_table: {
      frac: 0.22,
      max: 4,
      per: (W, D, band) => (W >= D ? W - 2 * band : D - 2 * band) / (2.2 * band),
      total: (W, D, n) => (Math.abs(W - D) <= 0.2 * Math.max(W, D) ? 4 : 2 * n + 2),
    },
    meeting_table: {
      frac: 0.22,
      max: 6,
      per: (W, D, band) => (W >= D ? W - 2 * band : D - 2 * band) / (2.2 * band),
      total: (_W, _D, n) => 2 * n + 2,
    },
    workstation: {
      frac: 0.26,
      max: 4,
      per: (W, D, band) => (W >= D ? W : D) / (2.2 * band),
      total: (_W, _D, n) => 2 * n,
    },
  };
  /** The chairs a piece is built with: the parts that reach the chairs' 820 mm back. */
  const chairs = (family: string, W: number, D: number): number =>
    (t0LocalParts(family, W, D) ?? []).filter(
      (p) => p.y1 === 820 && p.mat === (family === "outdoor_table" ? "wood" : "fabric"),
    ).length;
  for (const [family, c] of Object.entries(CORE)) {
    it(`${family}: the model's chairs are the drawing's at every size where the band's rounding would tip the count`, () => {
      const ties: Array<[number, number]> = [];
      for (let W = 150; W <= 2400; W++) {
        for (let D = 150; D <= 2400; D += 1) {
          const band = Math.min(W, D) * c.frac;
          const snapped = Math.round(band * 64) / 64;
          if (Math.round(c.per(W, D, band)) !== Math.round(c.per(W, D, snapped))) ties.push([W, D]);
        }
      }
      // The sweep finds the sizes the red team reported (e.g. 363 x 220 for the patio table).
      expect(ties.length, family).toBeGreaterThan(0);
      for (const [W, D] of ties.slice(0, 400)) {
        const n = cl(Math.round(c.per(W, D, Math.min(W, D) * c.frac)), 1, c.max);
        expect(chairs(family, W, D), `${family} ${W}x${D}`).toBe(c.total(W, D, n));
      }
    });
  }
  it("outdoor_table 363 x 220 seats three a side, as the core draws it", () => {
    expect(chairs("outdoor_table", 363, 220)).toBe(2 * 3 + 2);
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

  it("gives the building and its floor finishes their own colours, apart from each other (V9)", () => {
    const all = { ...KIND_PALETTE, ...FINISH_PALETTE, ...PALETTE };
    for (const [k, m] of Object.entries(all)) {
      expect(m.srgb, k).toMatch(/^#[0-9a-f]{6}$/);
      expect(m.alpha, k).toBeGreaterThan(0);
      expect(m.alpha, k).toBeLessThanOrEqual(1);
    }
    // Walls, floors, slab, doors, frames and glass each read apart from one another.
    const building = [
      KIND_PALETTE.wall,
      KIND_PALETTE.slab,
      KIND_PALETTE.door,
      KIND_PALETTE["window:frame"],
      KIND_PALETTE["window:glass"],
      ...Object.values(FINISH_PALETTE),
    ].map((m) => m.srgb);
    expect(new Set(building).size).toBe(building.length);
    expect(KIND_PALETTE["window:glass"].alpha).toBeLessThan(1);
    expect(KIND_PALETTE["wall:demolish"].alpha).toBeLessThan(1);
    expect(finishColour("timber", "light", "#000000")).toBe(FINISH_PALETTE.timber.srgb);
    expect(finishColour("timber", "dark", "#1b3248")).not.toBe(FINISH_PALETTE.timber.srgb);
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
