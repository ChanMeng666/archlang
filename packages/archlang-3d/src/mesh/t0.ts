/**
 * T0 parametric furniture (archlang-3d plan §4.4, §5.1–5.3; card A2b; visual-assets V1–V3,
 * V5–V7): pure generators that build a piece from a few parts, fitted EXACTLY to the plan's
 * footprint. The twelve families laneway-house uses are here; the living, bedroom, dining and
 * office batch is `t0-living.ts` (V5), the kitchen, bath and utility batch `t0-utility.ts` (V6),
 * the site (planting, garden, vehicles, terrace, the small standing objects) `t0-outdoor.ts` and
 * the office and commercial pieces `t0-office.ts` (V7). Every catalogued family is built; a word
 * outside the catalogue stays a grey box.
 *
 * Every generator is mirror-symmetric across its own width, so a mirrored piece (`mirror`,
 * `place … mirror`) needs no mirrored mesh and nothing gains handedness (`test/t0.test.ts` holds
 * it) — except the few `handed` families whose shape cannot be (`T0_HANDED`: an L-sofa, a chaise,
 * a grand piano, a reception desk; a bicycle and a motorcycle where they lie along their width,
 * `handedAt`). The core draws those handed as well, and reflects the drawing of a mirrored
 * piece; the model follows it: a handed piece the plan reflects carries `Furniture.mirror` and is
 * built as the reflection (`t0Shells`), so the model never shows the other hand from the drawing.
 *
 * A wall-hung family hangs at a ledgered height instead of standing on the floor, by its underside
 * (`T0_MOUNT_MM`: a wall cabinet, a hood, a mirror, a urinal) or by its top (`T0_HUNG_FROM_TOP`: a
 * television, whose underside each piece's size sets and the ledger records per piece): the core
 * marks such a piece only by drawing it dashed and exports no height, so the mount is this
 * package's labelled default.
 *
 * A part is a prism over a SECTION: a box, the ellipse inscribed in it (`round`), a box with
 * rounded corners (`radius`, quarter arcs from the exact 16-gon table) or an explicit polygon
 * (`profile`), extruded up (the default) or sideways (`axis`: along the width, `x`, or the depth,
 * `z`), optionally with holes (vertical parts). Each part names its material slot (`mat`,
 * `materials.ts`); untagged is `body`.
 *
 * Local frame (plan §3.4, §4.4): origin at the footprint's centre on the floor finish; +x along
 * the piece's width, +z its FRONT (an unturned piece faces plan +y, down the page), heights up.
 * The plan's `rotate` turns it clockwise on the page; widths and depths are fitted (the footprint
 * is never stretched in height: heights are fixed defaults, in the ledger). Lengths in mm here,
 * micrometres once placed.
 */
import type { MaterialSlot } from "../materials.js";
import type { Furniture, Pt } from "../scene3d/types.js";
import { degenerateHoles, prism } from "./extrude.js";
import {
  cabinet,
  clamp,
  MAX_DOORS,
  P,
  type Part,
  pair,
  type SectionShape,
  span,
  type T0Family,
  upholstered,
} from "./t0-kit.js";
import { T0_LIVING } from "./t0-living.js";
import { T0_OFFICE } from "./t0-office.js";
import { T0_OUTDOOR } from "./t0-outdoor.js";
import { T0_UTILITY } from "./t0-utility.js";
import type { Shell } from "./types.js";

export type { Part, SectionShape } from "./t0-kit.js";

/** The batch families (V5–V7), each declared once with all its facts (`T0Family`). */
const BATCHES: Readonly<Record<string, T0Family>> = { ...T0_LIVING, ...T0_UTILITY, ...T0_OUTDOOR, ...T0_OFFICE };

/** One fact of every batch family that has it, as a table keyed by family. */
const batchTable = <T>(pick: (f: T0Family) => T | undefined): Record<string, T> =>
  Object.fromEntries(
    Object.entries(BATCHES).flatMap(([k, f]) => {
      const v = pick(f);
      return v === undefined ? [] : [[k, v] as const];
    }),
  );

/**
 * The families with a generator, each with the catalogue names it answers to (plan §5.2): every
 * word of the core's family row (`FIXTURE_FAMILIES`), so no alias of a built family falls back to
 * a grey box (`test/t0.test.ts` reads the core's table). `double_bed` is built by the bed's
 * generator and `dining_table` by the table's, as their catalogue rows are separate families.
 */
export const T0_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  bed: ["bed", "double_bed"],
  sofa: ["sofa", "couch"],
  table: ["table", "dining_table"],
  rug: ["rug", "carpet"],
  wardrobe: ["wardrobe", "robe", "closet"],
  fridge: ["fridge", "refrigerator"],
  counter: ["counter", "worktop"],
  kitchen_sink: ["kitchen_sink", "sink"],
  stove: ["stove", "hob", "cooktop"],
  shower: ["shower"],
  wc: ["wc", "toilet"],
  basin: ["basin", "lavatory"],
  ...batchTable((f) => f.names),
};

const FAMILY_OF: ReadonlyMap<string, string> = new Map(
  Object.entries(T0_FAMILIES).flatMap(([f, names]) => names.map((n) => [n, f] as const)),
);

/** The asset a category is built with: `t0:<family>`, or `greybox` (plan §4.4 step 1). */
export const assetFor = (category: string): string => {
  const f = FAMILY_OF.get(category);
  return f ? `t0:${f}` : "greybox";
};

/** The tallest point of each family (mm): the height the ledger records. */
export const T0_HEIGHT_MM: Readonly<Record<string, number>> = {
  bed: 1000,
  sofa: 800,
  table: 750,
  rug: 12,
  wardrobe: 2100,
  fridge: 1800,
  counter: 900,
  kitchen_sink: 1160,
  stove: 910,
  shower: 2000,
  wc: 800,
  basin: 990,
  ...batchTable((f) => f.heightMm),
};

/**
 * The underside of each wall-hung family (mm above the floor finish; the ledger's
 * `furniture-mount-default`): a wall cabinet's 1400 mm (card V6), a hood 700 mm over a 900 mm hob,
 * a mirror over a basin, a urinal's rim height less its bowl. Nothing of the piece is drawn below
 * it and the piece is never carried down to the floor.
 */
export const T0_MOUNT_MM: Readonly<Record<string, number>> = batchTable((f) => f.mountMm);

/**
 * The families hung by their TOP at their `T0_HEIGHT_MM` (a television: its panel 16:9 from its
 * width, at most 760 mm tall), so each piece's underside depends on its size: the mesh builder
 * ledgers the piece's own (`furniture-mount-from-top`), never one figure for the family.
 */
export const T0_HUNG_FROM_TOP: ReadonlySet<string> = new Set(Object.keys(batchTable((f) => f.hungFromTop)));

/** Whether a family hangs on the wall (by its underside or by its top) rather than standing. */
export const isHung = (family: string): boolean => family in T0_MOUNT_MM || T0_HUNG_FROM_TOP.has(family);

/** The handed families (`T0Family.handed`): built reflected when the plan reflects the piece. */
export const T0_HANDED: ReadonlySet<string> = new Set(Object.keys(batchTable((f) => f.handed)));

/**
 * Whether a piece of `family`, `W` × `D` mm in its own frame, is handed: always for an L-sofa or
 * a reception desk, only along its width for a bicycle or a motorcycle (the core reads both off
 * their long axis), never for a symmetric family.
 */
export function handedAt(family: string, W: number, D: number): boolean {
  const h = BATCHES[family]?.handed;
  return h === true || (typeof h === "function" && h(W, D));
}

/** Whether an asset (`t0:<family>`) is a handed family's, so a reflection of it matters. */
export const isHandedAsset = (asset: string): boolean => asset.startsWith("t0:") && T0_HANDED.has(asset.slice(3));

/**
 * The material slots each family's parts use (the ledger's `furniture-material-default`, ADR 0030
 * decision 5): a property of the family, never read from a label. `test/t0.test.ts` holds every
 * generator to its row.
 */
export const T0_MATERIALS: Readonly<Record<string, readonly Exclude<MaterialSlot, "body">[]>> = {
  bed: ["wood", "linen", "wool"],
  sofa: ["wood_dark", "fabric", "cushion"],
  table: ["wood"],
  rug: ["fabric", "wool"],
  wardrobe: ["wood", "wood_dark", "metal"],
  fridge: ["metal", "appliance", "rubber"],
  counter: ["stone", "metal", "paint", "rubber"],
  kitchen_sink: ["stone", "metal", "paint", "rubber"],
  stove: ["stone", "metal", "appliance", "screen", "paint", "rubber"],
  shower: ["ceramic", "metal", "glass"],
  wc: ["ceramic", "metal", "water"],
  basin: ["wood", "ceramic", "metal"],
  ...batchTable((f) => f.materials),
};

/** Each generator: the piece's width W and depth D (mm, local frame) → its parts. */
const GENERATORS: Readonly<Record<string, (W: number, D: number) => Part[]>> = {
  bed(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const hb = clamp(D * 0.035, 30, 70);
    const head = -hd + hb;
    const rail = clamp(W * 0.02, 15, 35);
    const legH = 90;
    const deck = 300;
    const mTop = 500;
    const fold = head + (hd - head) * 0.3;
    const throwZ = hd - (hd - head) * 0.24;
    const n = W >= 1200 ? 2 : 1;
    const pd = clamp(D * 0.17, 120, 380);
    const leg = clamp(Math.min(W, D) * 0.035, 30, 55);
    const legs = [head, hd - leg].flatMap((z) => pair(P("wood", -hw, -hw + leg, z, z + leg, 0, legH)));
    return [
      P("wood", -hw, hw, -hd, head, 0, 1000, { axis: "x", radius: hb * 0.45 }),
      ...legs,
      P("wood", -hw, hw, head, hd, legH, deck, { radius: 12 }),
      P("linen", -hw + rail, hw - rail, head + 8, hd - rail, deck, mTop, { radius: 45 }),
      // The duvet, its turned-down sheet at the head and a wool throw across the foot.
      P("linen", -hw + 6, hw - 6, fold, hd - 6, deck + 70, mTop + 40, { axis: "x", radius: 45 }),
      P("linen", -hw + 8, hw - 8, fold - 40, fold + 150, mTop + 10, mTop + 62, { axis: "x", round: true }),
      P("wool", -hw + 2, hw - 2, throwZ, hd - 2, deck + 90, mTop + 52, { axis: "x", radius: 40 }),
      ...span(n, hw - rail - 50, 70).map(([a, b]) =>
        P("linen", a, b, head + 50, head + 50 + pd, mTop, mTop + 120, { axis: "x", radius: 55 }),
      ),
    ];
  },
  // The plan symbol's arms (`drawSofa`): 8% of the width, held to [0.12, 0.22] of the depth.
  sofa: (W, D) => upholstered(W, D, Math.min(clamp(W * 0.08, D * 0.12, D * 0.22), W * 0.25)),
  table(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const s = Math.min(W, D);
    const leg = clamp(s * 0.045, 30, 55);
    const ins = clamp(s * 0.05, 20, 70);
    const under = 715;
    const legs = [-hd + ins, hd - ins - leg].flatMap((z) =>
      pair(P("wood", -hw + ins, -hw + ins + leg, z, z + leg, 0, under, { radius: leg * 0.3 })),
    );
    const a = ins + 8;
    // The apron is a 20 mm frame under the top; a table too small to frame an opening has none.
    const apron =
      hw - a - 20 >= 10 && hd - a - 20 >= 10
        ? [
            P("wood", -hw + a, hw - a, -hd + a, hd - a, 640, under, {
              holes: [{ x0: -hw + a + 20, x1: hw - a - 20, z0: -hd + a + 20, z1: hd - a - 20 }],
            }),
          ]
        : [];
    return [P("wood", -hw, hw, -hd, hd, under, 750, { radius: clamp(s * 0.02, 4, 20) }), ...legs, ...apron];
  },
  rug(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const b = clamp(Math.min(W, D) * 0.04, 30, 110);
    // A rug too narrow for its bound edge is the field alone, the whole footprint.
    if (hw - b < 10 || hd - b < 10) return [P("wool", -hw, hw, -hd, hd, 0, 10)];
    return [
      P("wool", -hw + 15, hw - 15, -hd + 15, hd - 15, 0, 10),
      P("fabric", -hw, hw, -hd, hd, 0, 12, {
        radius: 15,
        holes: [{ x0: -hw + b, x1: hw - b, z0: -hd + b, z1: hd - b }],
      }),
    ];
  },
  wardrobe(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    // A door pair per metre, at most 64 doors, as the core caps a run's divisions (red-team N7).
    const n = 2 * clamp(Math.round(W / 1000), 1, MAX_DOORS / 2);
    const doors = span(n, hw - 8, 4);
    const fz = hd - 12;
    return [
      P("wood_dark", -hw + 20, hw - 20, -hd, hd - 60, 0, 80),
      P("wood", -hw, hw, -hd, hd - 30, 80, 2100),
      ...doors.map(([a, b]) => P("wood", a, b, hd - 30, fz, 96, 2084)),
      ...doors.map(([a, b], k) => {
        const x = k % 2 === 0 ? b - 40 : a + 22;
        return P("metal", x, x + 18, fz, hd, 900, 1340, { radius: 6 });
      }),
    ];
  },
  fridge(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const fz = hd - 16;
    const bar = Math.min(W * 0.32, 220);
    return [
      P("appliance", -hw, hw, -hd, hd - 40, 30, 1800, { radius: 10 }),
      P("appliance", -hw + 3, hw - 3, hd - 40, fz, 40, 700, { radius: 8 }),
      P("appliance", -hw + 3, hw - 3, hd - 40, fz, 712, 1790, { radius: 8 }),
      P("rubber", -hw + 20, hw - 20, -hd, hd - 60, 0, 30),
      P("metal", -bar, bar, fz, hd, 630, 656, { axis: "x", round: true }),
      P("metal", -bar, bar, fz, hd, 756, 782, { axis: "x", round: true }),
    ];
  },
  counter: (W, D) => cabinet(W, D),
  kitchen_sink(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const ix = hw - clamp(W * 0.15, 40, 120);
    const iz0 = -hd + clamp(D * 0.25, 60, 160);
    // At least 60 mm of stone in front, so the liner (10 mm wider) stays inside the carcass collar.
    const iz1 = hd - clamp(D * 0.15, 60, 100);
    // A unit with no room for a bowl (its opening under 20 mm, or the liner outside the carcass) is
    // a plain counter: never an inverted cut.
    if (ix - 15 < 10 || iz1 - iz0 - 30 < 20 || ix + 10 >= hw || iz1 + 10 >= hd - 40 || iz0 - 10 <= -hd)
      return cabinet(W, D);
    const r = clamp(Math.min(ix, (iz1 - iz0) / 2) * 0.15, 5, 40);
    const hole = { x0: -ix, x1: ix, z0: iz0, z1: iz1, radius: r };
    // The bowl: a steel liner a little wider than the cut (hidden in the stone) whose own opening is
    // 15 mm inside it, a visible rim; its floor sits 180 mm down.
    const liner = { x0: -ix - 10, x1: ix + 10, z0: iz0 - 10, z1: iz1 + 10, radius: r + 10 };
    const lip = { x0: -ix + 15, x1: ix - 15, z0: iz0 + 15, z1: iz1 - 15, radius: Math.max(1, r - 15) };
    // Under the sink the carcass stops at the bowl's floor and a collar carries the worktop around it.
    const parts = cabinet(W, D, { hole: [hole], carcassTop: 700 });
    const zc = (-hd + iz0) / 2;
    return [
      ...parts,
      P("paint", -hw, hw, -hd, hd - 40, 700, 870, { holes: [liner] }),
      P("metal", liner.x0, liner.x1, liner.z0, liner.z1, 700, 896, { radius: liner.radius, holes: [lip] }),
      P("metal", lip.x0 - 5, lip.x1 + 5, lip.z0 - 5, lip.z1 + 5, 690, 715, { radius: lip.radius + 5 }),
      P("metal", -18, 18, zc - 18, zc + 18, 900, 1160, { round: true }),
      P("metal", -12, 12, zc, zc + Math.min(200, (iz1 - iz0) * 0.55), 1126, 1150, { axis: "z", round: true }),
    ];
  },
  stove(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const r = Math.min(W, D) * 0.11;
    const rings = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => {
        const [x, z] = [sx * W * 0.22, sz * D * 0.2];
        return P("metal", x - r, x + r, z - r, z + r, 906, 910, {
          round: true,
          holes: [{ x0: x - r * 0.62, x1: x + r * 0.62, z0: z - r * 0.62, z1: z + r * 0.62, round: true }],
        });
      }),
    );
    const bar = Math.min(W * 0.32, 220);
    return [
      ...cabinet(W, D, { fronts: false }),
      // The built-under oven: an appliance door (the core's `stove` is `appliance`, V-D2) with its
      // dark window.
      P("appliance", -hw + 30, hw - 30, hd - 40, hd - 22, 160, 760, { radius: 10 }),
      P("screen", -hw + W * 0.15, hw - W * 0.15, hd - 22, hd - 18, 300, 640, { axis: "z", radius: 10 }),
      P("metal", -bar, bar, hd - 22, hd - 4, 790, 808, { axis: "x", round: true }),
      P("screen", -hw + 30, hw - 30, -hd + 30, hd - 50, 900, 906, { radius: 12 }),
      ...rings,
    ];
  },
  shower(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const rim = clamp(Math.min(W, D) * 0.06, 10, 50);
    const zh = -hd + 20;
    return [
      P("ceramic", -hw, hw, -hd, hd, 0, 30),
      // The tray's rim; a tray too small to leave a basin inside it is one solid slab.
      P(
        "ceramic",
        -hw,
        hw,
        -hd,
        hd,
        30,
        60,
        hw - rim >= 10 && hd - rim >= 10
          ? { holes: [{ x0: -hw + rim, x1: hw - rim, z0: -hd + rim, z1: hd - rim }] }
          : {},
      ),
      P("metal", -40, 40, -40, 40, 30, 34, { round: true }),
      P("glass", -hw + 10, hw - 10, hd - 10, hd, 60, 1980),
      P("metal", -hw, hw, hd - 20, hd, 1980, 2000, { axis: "x", radius: 6 }),
      P("metal", -12, 12, zh, zh + 24, 900, 1960, { round: true }),
      P("metal", -100, 100, zh + 24, zh + 224, 1940, 1960, { round: true }),
    ];
  },
  wc(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const tank = clamp(D * 0.24, 100, 200);
    const zb = -hd + tank * 0.75;
    const hole = { x0: -hw * 0.62, x1: hw * 0.62, z0: zb + (hd - zb) * 0.14, z1: hd - (hd - zb) * 0.12, round: true };
    return [
      P("ceramic", -hw + 12, hw - 12, -hd, -hd + tank - 10, 380, 770, { radius: 25 }),
      P("ceramic", -hw, hw, -hd, -hd + tank, 770, 790, { radius: 25 }),
      P("metal", -22, 22, -hd + tank / 2 - 22, -hd + tank / 2 + 22, 790, 800, { round: true }),
      P("ceramic", -hw * 0.55, hw * 0.55, zb, hd - (hd - zb) * 0.25, 0, 300, { round: true }),
      P("ceramic", -hw, hw, zb, hd, 300, 385, { round: true, holes: [hole] }),
      P("ceramic", -hw, hw, zb, hd, 385, 405, { round: true, holes: [hole] }),
      P("water", hole.x0 - 8, hole.x1 + 8, hole.z0 - 8, hole.z1 + 8, 300, 335, { round: true }),
    ];
  },
  ...batchTable((f) => f.gen),
  basin(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const z0 = -hd + D * 0.3;
    const r = clamp(Math.min(W, D) * 0.1, 10, 60);
    const hole = { x0: -hw * 0.62, x1: hw * 0.62, z0, z1: hd - D * 0.12, radius: r };
    const zc = (-hd + z0) / 2;
    return [
      P("wood", -hw + 15, hw - 15, -hd, hd - 25, 0, 780),
      ...span(2, hw - 18, 4).map(([a, b]) => P("wood", a, b, hd - 25, hd - 8, 40, 760)),
      P("ceramic", -hw, hw, -hd, hd, 780, 840, { radius: clamp(Math.min(W, D) * 0.05, 5, 30), holes: [hole] }),
      P("ceramic", hole.x0 - 10, hole.x1 + 10, hole.z0 - 10, hole.z1 + 10, 740, 790, { radius: r + 10 }),
      P("metal", -16, 16, zc - 16, zc + 16, 840, 990, { round: true }),
      P("metal", -10, 10, zc, zc + Math.min(140, (hole.z1 - hole.z0) * 0.45), 964, 984, { axis: "z", round: true }),
    ];
  },
};

/** cos/sin at k × 22.5°, written out so no engine's last ulp reaches a coordinate. */
const C16 = [
  1,
  0.9238795325112867,
  Math.SQRT1_2,
  0.3826834323650898,
  0,
  -0.3826834323650898,
  -Math.SQRT1_2,
  -0.9238795325112867,
  -1,
  -0.9238795325112867,
  -Math.SQRT1_2,
  -0.3826834323650898,
  0,
  0.3826834323650898,
  Math.SQRT1_2,
  0.9238795325112867,
];
const S16 = C16.map((_, k) => C16[(k + 12) % 16] as number);

/**
 * Millimetres → whole micrometres, rounded symmetrically about 0 (so a mirrored part rounds to its
 * mirror), and never −0 (whose float32 bytes in the GLB differ from 0's).
 */
const um = (v: number): number => (v < 0 ? -Math.round(-v * 1000) : Math.round(v * 1000)) || 0;

/**
 * A section's ring in whole micrometres: the box `u0..u1` × `v0..v1` (mm) as a box, the ellipse
 * inscribed in it, a box with rounded corners (four quarter arcs, five points each, from the
 * 16-gon table) or an explicit polygon in fractions of the box (`profile` wins over `round` and
 * `radius`). No repeated points. An empty or inverted box (`u0 ≥ u1` or `v0 ≥ v1`) has no ring:
 * `[]`, which the extruder treats as degenerate (a hole it leaves out, an outer it refuses).
 */
export function sectionRing(u0: number, u1: number, v0: number, v1: number, shape: SectionShape = {}): Pt[] {
  if (!(u0 < u1 && v0 < v1)) return [];
  const [cu, cv, ru, rv] = [(u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) / 2, (v1 - v0) / 2];
  let pts: Array<[number, number]>;
  if (shape.profile) {
    // A generator's own constant, never user input: a point off the box is a programming error.
    if (shape.profile.some(([fu, fv]) => !(fu >= 0 && fu <= 1 && fv >= 0 && fv <= 1)))
      throw new RangeError("a T0 profile point lies outside [0, 1]²");
    // About the box's centre, not from its low corner (red-team S2, PR #463): a point and its
    // mirror partner (`1 − fu` in the mirrored box) are then exact negatives before rounding, so a
    // half-micrometre tie rounds them apart never; the box's own sides are its exact ends.
    const at = (f: number, a: number, b: number, c: number): number =>
      f === 0 ? a : f === 1 ? b : c + (f - 0.5) * (b - a);
    pts = shape.profile.map(([fu, fv]) => [at(fu, u0, u1, cu), at(fv, v0, v1, cv)]);
  } else if (shape.round) {
    pts = C16.map((c, k) => [cu + ru * c, cv + rv * (S16[k] as number)]);
  } else if (shape.radius && shape.radius > 0) {
    const r = Math.max(0, Math.min(shape.radius, ru, rv));
    // Quarter q spans k = 4q … 4q + 4 about its corner's centre, counter-clockwise from +u.
    const centres: Array<[number, number]> = [
      [u1 - r, v1 - r],
      [u0 + r, v1 - r],
      [u0 + r, v0 + r],
      [u1 - r, v0 + r],
    ];
    pts = centres.flatMap(([a, b], q) =>
      [0, 1, 2, 3, 4].map((i): [number, number] => {
        const k = (4 * q + i) % 16;
        return [a + r * (C16[k] as number), b + r * (S16[k] as number)];
      }),
    );
  } else {
    pts = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
  }
  const ring: Pt[] = [];
  for (const [u, v] of pts) {
    const p: Pt = [um(u), um(v)];
    const q = ring[ring.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) ring.push(p);
  }
  while (ring.length > 1 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]) ring.pop();
  return ring;
}

/**
 * One part's closed, outward-wound shell in local micrometres (x width, y up from the floor
 * finish, z front), carrying its slot unless `body`; `null` if its box is empty or inverted, or
 * its section is degenerate.
 *
 * Holes never open a shell: a degenerate hole is left out, and holes that touch the outline or
 * each other are all left out (the part is built whole); either way their count is added to
 * `dropped.holes`, so the mesh builder ledgers them (`hole-degenerate`), never silently.
 *
 * The extruder builds every prism upright (plan ring, heights up). A sideways part is that prism
 * with its axes relabelled: `x` maps (u, h, v) → (h, v, u), a cyclic permutation, so the winding
 * stays outward; `z` maps (u, h, v) → (u, v, h), a swap, so each triangle is turned back over.
 */
export function partShell(p: Part, dropped?: { holes: number }): Shell | null {
  if (p.axis && p.holes?.length) throw new Error("a sideways T0 part takes no holes");
  if (!(um(p.x0) < um(p.x1) && um(p.y0) < um(p.y1) && um(p.z0) < um(p.z1))) return null;
  let s: Shell | null;
  if (!p.axis) {
    const outer = sectionRing(p.x0, p.x1, p.z0, p.z1, p);
    const holes = (p.holes ?? []).map((h) => sectionRing(h.x0, h.x1, h.z0, h.z1, h));
    const poly = { outer, ...(holes.length ? { holes } : {}) };
    s = prism(poly, um(p.y0), um(p.y1));
    if (s) {
      if (dropped) dropped.holes += degenerateHoles(poly);
    } else if (holes.length) {
      s = prism({ outer }, um(p.y0), um(p.y1));
      if (s && dropped) dropped.holes += holes.length;
    }
  } else {
    const x = p.axis === "x";
    const ring = x ? sectionRing(p.z0, p.z1, p.y0, p.y1, p) : sectionRing(p.x0, p.x1, p.y0, p.y1, p);
    const up = x ? prism({ outer: ring }, um(p.x0), um(p.x1)) : prism({ outer: ring }, um(p.z0), um(p.z1));
    if (up) {
      const positions: number[] = [];
      for (let i = 0; i < up.positions.length; i += 3) {
        const [u, h, v] = [up.positions[i] as number, up.positions[i + 1] as number, up.positions[i + 2] as number];
        if (x) positions.push(h, v, u);
        else positions.push(u, v, h);
      }
      const indices = [...up.indices];
      if (!x) {
        for (let t = 0; t < indices.length; t += 3) {
          const b = indices[t + 1] as number;
          indices[t + 1] = indices[t + 2] as number;
          indices[t + 2] = b;
        }
      }
      s = { positions, indices };
    } else s = null;
  }
  if (s && p.mat && p.mat !== "body") s.slot = p.mat;
  return s;
}

/** A part thinner than this (mm) on any axis is left out: a detail the footprint has no room for. */
const MIN_PART_MM = 1;

/**
 * A family's parts for a piece `W` × `D` mm (local frame), or `null` for a family without a
 * generator. Every part is clipped to the footprint and to the family's ledgered height, so no ink
 * leaves either on a small or thin piece, and a part the clip leaves thinner than `MIN_PART_MM`
 * is left out. The clip is symmetric about x = 0, so a mirror-symmetric generator stays so.
 */
export function t0LocalParts(family: string, W: number, D: number): Part[] | null {
  const gen = GENERATORS[family];
  if (!gen) return null;
  const [hw, hd, H] = [W / 2, D / 2, T0_HEIGHT_MM[family] ?? 0];
  const mount = T0_MOUNT_MM[family];
  const out: Part[] = [];
  for (const p of gen(W, D)) {
    const q: Part = {
      ...p,
      x0: Math.max(p.x0, -hw),
      x1: Math.min(p.x1, hw),
      z0: Math.max(p.z0, -hd),
      z1: Math.min(p.z1, hd),
      y0: Math.max(p.y0, mount ?? 0),
      y1: Math.min(p.y1, H),
    };
    if (q.x1 - q.x0 >= MIN_PART_MM && q.z1 - q.z0 >= MIN_PART_MM && q.y1 - q.y0 >= MIN_PART_MM) out.push(q);
  }
  // A piece always stands on the floor: when the parts that reach it were left out (a plinth with
  // no room), the lowest parts kept are carried down to it. A wall-hung piece hangs instead.
  const lowest = Math.min(...out.map((p) => p.y0));
  if (!isHung(family) && lowest > 0) for (const p of out) if (p.y0 === lowest) p.y0 = 0;
  return out;
}

/** Where each corner of a triangle comes from once it is turned over. */
const TURN_OVER = [0, 2, 1] as const;

/** A quarter turn's (cos, sin), exact; `null` for any other angle. */
function quarter(rotateDeg: number): [number, number] | null {
  const r = ((rotateDeg % 360) + 360) % 360;
  return r === 0 ? [1, 0] : r === 90 ? [0, 1] : r === 180 ? [-1, 0] : r === 270 ? [0, -1] : null;
}

/**
 * `f`'s T0 shells, placed in plan micrometres with the floor finish at `floor` (µm), and how many
 * holes they were built without (`partShell`; the mesh builder ledgers them): `null` when its
 * asset is not T0 or its turn is not a quarter turn (the grey box stands instead); a `null` shell
 * is a part whose section was degenerate (the mesh builder ledgers it too). The plan's `rotate`
 * (clockwise on the page, y down) maps local (x, z) to plan (x cos r − z sin r, x sin r + z cos r)
 * about the footprint's centre, a proper rotation, so every shell stays outward-wound; at a quarter
 * turn the piece's own width runs along plan y (`Furniture.size` is the turned box).
 *
 * A reflected piece (`f.mirror`, set on a handed family only) is built as its reflection across
 * its own width BEFORE the turn, exactly as the core draws it (`glyph-chirality.ts`: reflect the
 * symbol about its own vertical centre line, then apply the quarter turn): local x → −x on every
 * vertex, each triangle turned back over so the shell stays outward-wound. Exact in integers.
 */
export function t0Shells(f: Furniture, floor: number): { shells: Array<Shell | null>; holesDropped: number } | null {
  const family = f.asset.startsWith("t0:") ? f.asset.slice(3) : undefined;
  const cs = quarter(-f.yawDeg);
  const turned = cs !== null && cs[1] !== 0;
  const parts =
    family && cs
      ? t0LocalParts(family, (turned ? f.size.d : f.size.w) / 1000, (turned ? f.size.w : f.size.d) / 1000)
      : null;
  if (!parts || !cs) return null;
  const [c, s] = cs;
  const [cx, cy] = f.centre;
  const flip = f.mirror === true;
  const dropped = { holes: 0 };
  const shells = parts.map((p) => {
    const local = partShell(p, dropped);
    if (!local) return null;
    const positions: number[] = [];
    for (let i = 0; i < local.positions.length; i += 3) {
      const [x, y, z] = [
        flip ? -(local.positions[i] as number) || 0 : (local.positions[i] as number),
        local.positions[i + 1] as number,
        local.positions[i + 2] as number,
      ];
      positions.push(cx + x * c - z * s, floor + y, cy + x * s + z * c);
    }
    // Turned over: each triangle (a, b, c) becomes (a, c, b).
    const indices = flip
      ? local.indices.map((_, k, a) => a[k - (k % 3) + (TURN_OVER[k % 3] as number)] as number)
      : local.indices;
    return { positions, indices, ...(local.slot ? { slot: local.slot } : {}) };
  });
  return { shells, holesDropped: dropped.holes };
}
