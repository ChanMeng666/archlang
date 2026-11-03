/**
 * T0 furniture, visual-assets cards V1–V3: the shape primitives (V2) one by one — every shell
 * closed, outward-wound, integer micrometres, its extents the box asked for — then every
 * generator over a sweep of sizes: fitted exactly to its footprint, as tall as its ledgered
 * height, mirror-symmetric across its width, its material slots its family's row (V1). The
 * palette both renderers read is checked last.
 */
import { describe, expect, it } from "vitest";
import {
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
  T0_HEIGHT_MM,
  T0_MATERIALS,
  t0LocalParts,
} from "../src/index.js";
import { openEdges, signedVolume } from "../src/node.js";

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
  const um = (v: number) => (v < 0 ? -Math.round(-v * 1000) : Math.round(v * 1000));
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
    it(`${family}: every part sound, fitted to the footprint, ${T0_HEIGHT_MM[family]} mm tall, symmetric, its slots`, () => {
      for (const [W, D] of sizes) {
        const what = `${family} ${W}x${D}`;
        const parts = t0LocalParts(family, W, D) ?? [];
        expect(parts.length, what).toBeGreaterThan(1);
        expect(parts.length, `${what}: a modest part count`).toBeLessThanOrEqual(24);
        const shells = parts.map((p, i) => {
          const s = partShell(p);
          expectSound(s, p, `${what} part ${i}`);
          return s;
        });
        const all = shells.map(extents);
        const lo = (k: number) => Math.min(...all.map((e) => e[k]?.[0] as number));
        const hi = (k: number) => Math.max(...all.map((e) => e[k]?.[1] as number));
        expect([lo(0), hi(0), lo(1), hi(1), lo(2), hi(2)], `${what}: box`).toEqual([
          -W * 500,
          W * 500,
          0,
          (T0_HEIGHT_MM[family] as number) * 1000,
          -D * 500,
          D * 500,
        ]);
        const own = shells.map((s) => sig(s, false)).sort();
        const mirrored = shells.map((s) => sig(s, true)).sort();
        expect(mirrored, `${what}: mirror-symmetric`).toEqual(own);
        const slots = MATERIAL_SLOTS.filter((m) => shells.some((s) => (s.slot ?? "body") === m));
        expect(slots, `${what}: slots`).toEqual(T0_MATERIALS[family]);
      }
    });
  }

  it("has no generator for a family outside T0, which stays a grey box", () => {
    expect(t0LocalParts("desk", 1200, 600)).toBeNull();
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
