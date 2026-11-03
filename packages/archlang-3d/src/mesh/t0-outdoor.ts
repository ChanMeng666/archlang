/**
 * T0 batch V7 (visual-assets), the site: planting, garden furniture, the things parked on a
 * driveway, the terrace and lawn pieces and the small standing objects a survey records. Declared
 * like V5 (`t0-living.ts`); local frame, units and the clip: `t0.ts`. Back is −z (the top edge of
 * the core's symbol), front +z.
 *
 * Planting is massing, not botany: a crown is a stack of rounded tiers (16-gon prisms from the
 * exact table) whose radii follow a soft silhouette, with a few lobes pushed out of it so the
 * outline reads as foliage rather than as a drum, over a bark trunk. Every height is a fixed,
 * ledgered default; a tree is built at its own height even where it rises above the walls of its
 * storey, and the mesh builder ledgers that (`furniture-above-walls`), never clips it.
 *
 * Every generator follows the core's plan symbol for its family (`glyphs-outdoor.ts`,
 * `glyphs-misc.ts`) and is mirror-symmetric across its width, except where the drawing is handed in
 * its shape: a bicycle and a motorcycle laid along their width (the core reads both off their own
 * long axis, `axisPt`, the front at the right) are `handed` at those sizes, and built in the
 * drawing's hand. Where the drawing is handed only by a detail — the mailbox's flag on the right,
 * the charge point's plug at the left end of its cable — the model keeps the symmetric part (a
 * plain box on its post, a coiled cable under a centred holster) and gains no hand.
 */
import type { MaterialSlot } from "../materials.js";
import {
  type ChairBack,
  clamp,
  type DomeTable,
  dome,
  MOUND,
  P,
  type Part,
  pair,
  SIDE_CHAIR,
  sideways,
  snap64,
  span,
  type T0Family,
  tableSeats,
} from "./t0-kit.js";

/**
 * Stacked round tiers from `y0` to `y1`, the k-th `fr[k]` of the half-extents `rx`, `rz` (centred
 * on the origin, so each is its own mirror image): a crown, a mound, a canopy.
 */
function tiers(mat: MaterialSlot, rx: number, rz: number, y0: number, y1: number, fr: readonly number[]): Part[] {
  const h = (y1 - y0) / fr.length;
  return fr.map((f, k) =>
    P(mat, -rx * f, rx * f, -rz * f, rz * f, y0 + h * k, k === fr.length - 1 ? y1 : y0 + h * (k + 1), {
      round: true,
    }),
  );
}

/** A crown: the ellipsoid from 60° below its equator to its top (a tree, a potted plant). */
const CROWN: DomeTable = [
  [0.085, 0.614],
  [0.196, 0.8],
  [0.325, 0.932],
  [0.464, 1],
  [0.603, 1],
  [0.732, 0.932],
  [0.843, 0.8],
  [0.928, 0.614],
  [0.982, 0.386],
  [1, 0.132],
];

/** A shrub's side lobe: a coarse mound. */
const LOBE: DomeTable = [
  [0.45, 1],
  [0.78, 0.8],
  [1, 0.45],
];

/**
 * A piece read off its own LONG axis, as the core reads a bicycle, a swing, a washing line
 * (`axisPt`, glyphs-outdoor.ts): `a` along it from −L/2 to +L/2 (the width, front at the right,
 * when W ≥ D; else the depth, front at the front), `b` across it from its centre line. `part`
 * places a box given as (a, b) and extrudes it along (`"along"`) or across (`"across"`) the long
 * axis, so a side-view profile (u along `a`) is extruded `"across"` in either orientation. `ends`
 * twins a part end for end (a → −a) and `sides` across (b → −b), both exactly, and both keep the
 * part's profile (they reflect nothing the profile describes).
 */
function longFrame(W: number, D: number) {
  const horizontal = W >= D;
  const [L, S] = horizontal ? [W, D] : [D, W];
  const part = (
    mat: MaterialSlot,
    a0: number,
    a1: number,
    b0: number,
    b1: number,
    y0: number,
    y1: number,
    more: Partial<Part> = {},
    ext?: "along" | "across",
  ): Part => {
    const m: Partial<Part> = ext ? { ...more, axis: (ext === "along") === horizontal ? "x" : "z" } : more;
    return horizontal ? P(mat, a0, a1, b0, b1, y0, y1, m) : P(mat, b0, b1, a0, a1, y0, y1, m);
  };
  const flipZ = (p: Part): Part => ({ ...p, z0: -p.z1, z1: -p.z0 });
  return {
    horizontal,
    L,
    S,
    part,
    ends: (p: Part): Part[] => (horizontal ? pair(p) : [p, flipZ(p)]),
    sides: (p: Part): Part[] => (horizontal ? [p, flipZ(p)] : pair(p)),
  };
}

/**
 * A straight tube from (a0, y0) to (a1, y1) in the side view, `t` thick, `b` either side of the
 * centre line: a profile of its four corners in its own box, extruded across (a bicycle's frame,
 * a fork). The corners are the box's extremes, so the profile touches all four sides.
 */
function tube(
  fr: ReturnType<typeof longFrame>,
  mat: MaterialSlot,
  a0: number,
  y0: number,
  a1: number,
  y1: number,
  t: number,
  b: number,
): Part {
  const [da, dy] = [a1 - a0, y1 - y0];
  const len = Math.sqrt(da * da + dy * dy) || 1;
  const [na, ny] = [((-dy / len) * t) / 2, ((da / len) * t) / 2];
  const pts: Array<[number, number]> = [
    [a0 + na, y0 + ny],
    [a0 - na, y0 - ny],
    [a1 - na, y1 - ny],
    [a1 + na, y1 + ny],
  ];
  const [amin, amax] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [ymin, ymax] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const profile = pts.map(([a, y]): readonly [number, number] => [
    amax > amin ? (a - amin) / (amax - amin) : 0,
    ymax > ymin ? (y - ymin) / (ymax - ymin) : 0,
  ]);
  return fr.part(mat, amin, amax, -b, b, Math.max(0, ymin), ymax, { profile }, "across");
}

/**
 * The tiers of a planted clump for a row of `n`: a three-tier dome while the row is at most
 * `three` long, two tiers up to `two`, one beyond, so a bed's part count stays bounded.
 */
function clumpTable(n: number, three: number, two: number): DomeTable {
  if (n <= three) return LOBE;
  if (n <= two)
    return [
      [0.6, 1],
      [1, 0.6],
    ];
  return [[1, 1]];
}

/**
 * A pair of planted clumps (a flower, a seedling) at `a` along the long axis, `b` either side of
 * its centre line, `rho` in radius: the dome `table` from `y0` to `y1`, twinned exactly across.
 */
function clump(
  fr: ReturnType<typeof longFrame>,
  a: number,
  b: number,
  rho: number,
  y0: number,
  y1: number,
  table: DomeTable,
): Part[] {
  let lo = y0;
  return table.flatMap(([t, f], k) => {
    const hi = k === table.length - 1 ? y1 : y0 + (y1 - y0) * t;
    const p = fr.part("foliage", a - rho * f, a + rho * f, b - rho * f, b + rho * f, lo, hi, { round: true });
    lo = hi;
    return fr.sides(p);
  });
}

/** A wheel in the side view: the tyre, the rim proud of it, the hub proud of both (radius `r`). */
function wheel(fr: ReturnType<typeof longFrame>, a: number, r: number, w: number): Part[] {
  return [
    fr.part("rubber", a - r, a + r, -w / 2, w / 2, 0, 2 * r, { round: true }, "across"),
    fr.part("metal", a - r * 0.78, a + r * 0.78, -w / 2 - 3, w / 2 + 3, r * 0.22, r * 1.78, { round: true }, "across"),
    fr.part(
      "metal",
      a - r * 0.16,
      a + r * 0.16,
      -w / 2 - 12,
      w / 2 + 12,
      r * 0.84,
      r * 1.16,
      { round: true },
      "across",
    ),
  ];
}

/** The A-frame of a swing in its end view (u across, v up), multiples of 1/64: two splayed legs. */
const A_FRAME: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [6 / 64, 0],
  [32 / 64, 56 / 64],
  [58 / 64, 0],
  [1, 0],
  [36 / 64, 1],
  [28 / 64, 1],
];

/** A mailbox's tunnel in its front view (u across, v up), multiples of 1/64: flat sides, round top. */
const TUNNEL: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 38 / 64],
  [61 / 64, 50 / 64],
  [52 / 64, 59 / 64],
  [40 / 64, 1],
  [24 / 64, 1],
  [12 / 64, 59 / 64],
  [3 / 64, 50 / 64],
  [0, 38 / 64],
];

/** A barbecue hood in its side view (u back to front, v up): a dome hinged at the back. */
const HOOD: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 0.4],
  [0.94, 0.72],
  [0.78, 0.93],
  [0.55, 1],
  [0.3, 0.96],
  [0.1, 0.8],
  [0, 0.55],
];

/** A car's glasshouse in its side view (u nose to tail, v up): the raked windscreen and rear window. */
const GLASSHOUSE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0.8, 1],
  [0.26, 1],
];

/** A car's shoulder in its side view (u nose to tail, v up): the bonnet and the boot falling away. */
const SHOULDER: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 0.55],
  [0.95, 0.85],
  [0.8, 1],
  [0.24, 1],
  [0.08, 0.72],
  [0, 0.42],
];

/** A reclined back in its side view (u from the head, v up): a slab leaning toward the head. */
const RECLINE: ReadonlyArray<readonly [number, number]> = [
  [0.78, 0],
  [1, 0],
  [0.22, 1],
  [0, 1],
];

/**
 * A garden armchair's side frame (u back to front, v up), multiples of 1/64: the back and front
 * legs and the arm rail across their tops.
 */
const ARM_FRAME: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [5 / 64, 0],
  [5 / 64, 55 / 64],
  [59 / 64, 55 / 64],
  [59 / 64, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export const T0_OUTDOOR: Readonly<Record<string, T0Family>> = {
  // ── planting ──
  plant: {
    names: ["plant", "planter"],
    heightMm: 1100,
    materials: ["ceramic", "foliage"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      // `drawPlant`: the pot ring at 0.42 of the crown, the crown over it.
      return [
        P("ceramic", -rx * 0.34, rx * 0.34, -rz * 0.34, rz * 0.34, 0, 50, { round: true }),
        P("ceramic", -rx * 0.4, rx * 0.4, -rz * 0.4, rz * 0.4, 50, 400, { round: true }),
        P("ceramic", -rx * 0.44, rx * 0.44, -rz * 0.44, rz * 0.44, 400, 440, { round: true }),
        ...dome("foliage", 0, 0, rx, rz, 430, 1100, CROWN),
      ];
    },
  },
  tree: {
    names: ["tree", "deciduous_tree"],
    heightMm: 4500,
    materials: ["foliage", "bark"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      const rt = clamp(Math.min(W, D) * 0.045, 25, 180);
      // `drawTree`: the canopy over its trunk. The crown from 1.8 m to the top, an ellipsoid, on a
      // bark trunk with its root flare that runs up into it.
      const yb = 1800;
      return [
        P("bark", -rt * 1.5, rt * 1.5, -rt * 1.5, rt * 1.5, 0, 90, { round: true }),
        P("bark", -rt, rt, -rt, rt, 0, yb + 900, { round: true }),
        ...dome("foliage", 0, 0, rx, rz, yb, 4500, CROWN),
      ];
    },
  },
  conifer: {
    names: ["conifer", "pine"],
    heightMm: 5000,
    materials: ["foliage", "bark"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      const rt = clamp(Math.min(W, D) * 0.05, 20, 120);
      // `drawConifer`: a needled crown to a point. A cone in sixteen tiers, each a sixteenth
      // narrower, from just above the ground, on a short bark trunk.
      const n = 16;
      return [
        P("bark", -rt, rt, -rt, rt, 0, 900, { round: true }),
        ...tiers(
          "foliage",
          rx,
          rz,
          350,
          5000,
          Array.from({ length: n }, (_, k) => (n - k) / n),
        ),
      ];
    },
  },
  shrub: {
    names: ["shrub", "bush"],
    heightMm: 900,
    materials: ["foliage"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      // `drawShrub`: lobes on the D4 bearings round a mound. A mound 0.8 of the footprint with a
      // lower lobe on each axis reaching its edge (0.4 across, centred 0.6 out).
      const lobe = (cx: number, cz: number): Part[] => dome("foliage", cx, cz, rx * 0.4, rz * 0.4, 0, 560, LOBE);
      return [
        ...dome("foliage", 0, 0, rx * 0.8, rz * 0.8, 0, 900, MOUND),
        ...lobe(-rx * 0.6, 0).flatMap(pair),
        ...lobe(0, -rz * 0.6),
        ...lobe(0, rz * 0.6),
      ];
    },
  },
  hedge: {
    names: ["hedge"],
    heightMm: 1500,
    materials: ["foliage"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawHedge`: one band with round ends. A clipped hedge, battered a little and its crown
      // rounded over in three steps.
      const band = (inset: number, y0: number, y1: number): Part =>
        P("foliage", -hw + inset, hw - inset, -hd + inset, hd - inset, y0, y1, { radius: s / 2 });
      return [band(0, 0, 520), band(s * 0.025, 520, 1230), band(s * 0.06, 1230, 1400), band(s * 0.14, 1400, 1500)];
    },
  },

  // ── garden furniture ──
  bbq: {
    names: ["bbq", "grill", "barbecue"],
    heightMm: 1150,
    materials: ["wood", "metal", "screen"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawBbq`: the firebox the middle three fifths, a shelf each side set in from back and
      // front, the controls on the front; the hood hinges at the back.
      const fx = W * 0.3;
      const zs = D * 0.12;
      const leg = clamp(s * 0.05, 20, 35);
      const legs = [-hd + zs, hd - zs - leg].flatMap((z) =>
        pair(P("metal", -fx + 8, -fx + 8 + leg, z, z + leg, 0, 820, { radius: leg * 0.3 })),
      );
      const knob = clamp(s * 0.035, 10, 22);
      return [
        ...legs,
        P("wood", -fx + 8, fx - 8, -hd + zs, hd - zs, 200, 222),
        P("metal", -fx, fx, -hd, hd - 30, 820, 930, { radius: clamp(s * 0.06, 4, 30) }),
        P("screen", -fx + 12, fx - 12, hd - 30, hd - 18, 835, 905, { radius: 4 }),
        ...pair(
          P("metal", -W * 0.12 - knob, -W * 0.12 + knob, hd - 18, hd, 870 - knob, 870 + knob, {
            axis: "z",
            round: true,
          }),
        ),
        P("metal", -knob, knob, hd - 18, hd, 870 - knob, 870 + knob, { axis: "z", round: true }),
        P("metal", -fx, fx, -hd, hd - zs, 930, 1150, { axis: "x", profile: HOOD }),
        P("metal", -W * 0.2, W * 0.2, hd - zs, hd - zs + 24, 1030, 1050, { axis: "x", round: true }),
        ...pair(P("wood", -hw, -fx, -hd + zs, hd - zs, 880, 904, { radius: 6 })),
      ];
    },
  },
  outdoor_table: {
    names: ["outdoor_table", "patio_table"],
    heightMm: 820,
    materials: ["wood", "cushion"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const band = snap64(s * 0.22);
      const [tx, tz] = [hw - band, hd - band];
      // `drawOutdoorTable`: round (a round top, one chair a side) when the sides differ by a fifth
      // or less, else a long top with a chair per 2.2 bands a side, `[1, 4]`, and one each end;
      // the parasol hole through the top.
      const round = Math.abs(W - D) <= 0.2 * Math.max(W, D);
      const hole = { x0: -s * 0.025, x1: s * 0.025, z0: -s * 0.025, z1: s * 0.025, round: true };
      const top = P(
        "wood",
        -tx,
        tx,
        -tz,
        tz,
        710,
        740,
        round
          ? { round: true, holes: [hole] }
          : {
              radius: Math.min(tx, tz) * 0.06,
              holes: [hole],
            },
      );
      const t = clamp(s * 0.03, 15, 45);
      const base = round
        ? [
            P("wood", -t, t, -t, t, 50, 710, { round: true }),
            P(
              "wood",
              -Math.min(tx, tz) * 0.5,
              Math.min(tx, tz) * 0.5,
              -Math.min(tx, tz) * 0.5,
              Math.min(tx, tz) * 0.5,
              0,
              50,
              {
                round: true,
              },
            ),
          ]
        : W >= D
          ? pair(P("wood", -tx * 0.8, -tx * 0.8 + t, -tz + 20, tz - 20, 0, 710))
          : [-1, 1].map((k) =>
              P("wood", -tx + 20, tx - 20, k < 0 ? -tz * 0.8 : tz * 0.8 - t, k < 0 ? -tz * 0.8 + t : tz * 0.8, 0, 710),
            );
      // The count is the core's own expression on the unrounded band (`drawOutdoorTable`: the top
      // `r.w - 2 * band` long, `round(runLen / (PATIO_PITCH * band))`), so a .5 tie rounds the
      // same way in the drawing and the model (red-team S1, PR #463); only positions are snapped.
      const cb = s * 0.22;
      const perSide = clamp(Math.round((W >= D ? W - 2 * cb : D - 2 * cb) / (2.2 * cb)), 1, 4);
      const chair = (b: { x0: number; x1: number; z0: number; z1: number }, back: ChairBack): Part[] => {
        // The seat's cushion over the frame's seat, front 6/64 and back 6/64 in.
        const depthAlong = back === "-z" || back === "+z";
        const [u0, u1] = depthAlong ? [b.z0, b.z1] : [b.x0, b.x1];
        const d = u1 - u0;
        const [c0, c1] =
          back === "-z" || back === "-x"
            ? [u0 + (d * 6) / 64, u1 - (d * 4) / 64]
            : [u0 + (d * 4) / 64, u1 - (d * 6) / 64];
        const pad = depthAlong
          ? P("cushion", b.x0 + 4, b.x1 - 4, c0, c1, 435, 470, { radius: 12 })
          : P("cushion", c0, c1, b.z0 + 4, b.z1 - 4, 435, 470, { radius: 12 });
        return [sideways("wood", b, 0, 820, back, SIDE_CHAIR), pad];
      };
      return [top, ...base, ...tableSeats(W, D, round, perSide, chair)];
    },
  },
  outdoor_chair: {
    names: ["outdoor_chair", "patio_chair"],
    heightMm: 850,
    materials: ["wood", "cushion"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawOutdoorChair`: the seat between two arms 11% of the width, the backrest along the
      // back, slats across the seat.
      const aw = clamp(W * 0.11, 25, 90);
      const zb = -hd + D * 0.2;
      const slats = span(4, (D * 0.82) / 2, clamp(D * 0.02, 4, 14)).map(
        ([a, b]): Part => P("wood", -hw + aw, hw - aw, a + D * 0.07, b + D * 0.07, 380, 405, { radius: 4 }),
      );
      return [
        ...pair(P("wood", -hw, -hw + aw, -hd + D * 0.06, hd, 0, 640, { axis: "x", profile: ARM_FRAME })),
        ...slats,
        P("wood", -hw + aw, hw - aw, -hd, zb, 405, 850, { axis: "x", profile: RECLINE }),
        P("cushion", -hw + aw + 8, hw - aw - 8, zb - D * 0.04, hd - D * 0.05, 405, 465, { radius: 25 }),
        P("cushion", -hw + aw + 8, hw - aw - 8, -hd + D * 0.07, zb + D * 0.02, 465, 800, {
          axis: "x",
          profile: [
            [0, 0.86],
            [0.62, 0],
            [1, 0],
            [0.38, 1],
            [0.1, 1],
          ],
        }),
      ];
    },
  },
  umbrella: {
    names: ["umbrella", "parasol"],
    heightMm: 2400,
    materials: ["fabric", "stone", "metal"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const p = clamp(s * 0.012, 10, 25);
      const b = clamp(s * 0.12, 40, 250);
      // `drawUmbrella`: the canopy on its ribs round the pole: a stepped dome with a valance, two
      // ribs under it, the runner on the pole, a weighted base.
      return [
        P("stone", -b, b, -b, b, 0, 80, { round: true }),
        P("metal", -p, p, -p, p, 80, 2330, { round: true }),
        P("metal", -p * 1.8, p * 1.8, -p * 1.8, p * 1.8, 2330, 2400, { round: true }),
        P("metal", -p * 2, p * 2, -p * 2, p * 2, 1650, 1720, { round: true }),
        P("metal", -rx * 0.97, rx * 0.97, -6, 6, 1930, 1950, { axis: "x", round: true }),
        P("metal", -6, 6, -rz * 0.97, rz * 0.97, 1930, 1950, { axis: "z", round: true }),
        P("fabric", -rx, rx, -rz, rz, 1950, 2010, { round: true }),
        // A shallow cone, eight tiers, each a tenth narrower.
        ...tiers("fabric", rx, rz, 2010, 2330, [0.92, 0.82, 0.72, 0.62, 0.52, 0.42, 0.31, 0.2]),
      ];
    },
  },
  sun_lounger: {
    names: ["sun_lounger", "lounger"],
    heightMm: 800,
    materials: ["wood", "cushion"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawSunLounger`: the frame, and on it three cushions with a gap between them — the raised
      // back at the head (the top edge), the seat and the leg rest — and a headrest.
      const leg = clamp(s * 0.06, 20, 45);
      const legs = [-hd + D * 0.04, hd - D * 0.04 - leg].flatMap((z) =>
        pair(P("wood", -hw + W * 0.05, -hw + W * 0.05 + leg, z, z + leg, 0, 270, { radius: leg * 0.3 })),
      );
      const i = s * 0.09;
      const pad = (f0: number, f1: number): Part =>
        P("cushion", -hw + i, hw - i, -hd + D * f0, -hd + D * f1, 300, 365, { radius: s * 0.04 });
      const [b0, b1] = [-hd + D * 0.035, -hd + D * 0.31];
      return [
        ...legs,
        P("wood", -hw, hw, -hd, hd, 260, 300, { radius: s * 0.08 }),
        pad(0.325, 0.56),
        pad(0.575, 0.965),
        P("wood", -hw + i * 0.6, hw - i * 0.6, b0 + (b1 - b0) * 0.1, b1 - (b1 - b0) * 0.1, 300, 700, {
          axis: "x",
          profile: RECLINE,
        }),
        P("cushion", -hw + i, hw - i, b0, b1, 300, 780, { axis: "x", profile: RECLINE }),
        P("cushion", -hw + i + (W - 2 * i) * 0.18, hw - i - (W - 2 * i) * 0.18, b0, b0 + (b1 - b0) * 0.3, 720, 800, {
          axis: "x",
          round: true,
        }),
      ];
    },
  },

  // ── parked things ──
  car: {
    names: ["car"],
    heightMm: 1450,
    materials: ["metal", "glass", "screen", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawCar`: the long axis is the depth, the bonnet at the top edge (−z); the body 91% of
      // the width, the mirrors standing off it at the foot of the windscreen, inside the footprint.
      const bw = (W * 0.91) / 2;
      const r = clamp(D * 0.075, 120, 340);
      const tw = clamp(W * 0.11, 30, 230);
      const axles = [-hd + D * 0.17, hd - D * 0.19];
      const wheels = axles.flatMap((z) => [
        ...pair(P("rubber", -bw + 6, -bw + 6 + tw, z - r, z + r, 0, 2 * r, { axis: "x", round: true })),
        ...pair(
          P("metal", -bw + 2, -bw + 12, z - r * 0.62, z + r * 0.62, r * 0.38, r * 1.62, { axis: "x", round: true }),
        ),
      ]);
      // The body in two pieces: the lower tub, rounded in plan as the symbol's nose and tail are,
      // and over it the shoulder in side view (the bonnet falling to the nose, the boot to the
      // tail). The glasshouse is glass over a dark cabin, so the windows read tinted; the roof
      // panel on it (`drawCar`'s roof, 0.37–0.645 of the length).
      const belt = 900;
      const zw = -hd + D * 0.245;
      const zr = hd - D * 0.255;
      const mz = -hd + D * 0.285;
      const mh = Math.min(D * 0.028, W * 0.09);
      const lamp = (x0: number, x1: number, front: boolean, mat: MaterialSlot): Part =>
        P(mat, x0, x1, front ? -hd : hd - 15, front ? -hd + 15 : hd, 560, 640, { radius: 10 });
      return [
        ...wheels,
        P("rubber", -bw + tw + 30, bw - tw - 30, -hd + D * 0.1, hd - D * 0.1, r * 0.45, r + 20),
        P("paint", -bw, bw, -hd + 15, hd - 15, r * 0.95, 700, { radius: Math.min(bw * 0.6, D * 0.1) }),
        P("paint", -bw * 0.93, bw * 0.93, -hd + D * 0.06, hd - D * 0.05, 680, belt, { axis: "x", profile: SHOULDER }),
        P("glass", -bw * 0.82, bw * 0.82, zw, zr, belt - 10, 1385, { axis: "x", profile: GLASSHOUSE }),
        P("screen", -bw * 0.82 + 25, bw * 0.82 - 25, zw + 30, zr - 30, belt - 5, 1360, {
          axis: "x",
          profile: GLASSHOUSE,
        }),
        P("paint", -bw * 0.78, bw * 0.78, -hd + D * 0.37, -hd + D * 0.645, 1380, 1450, { radius: bw * 0.12 }),
        ...pair(P("paint", -hw, -hw + W * 0.07, mz, mz + mh, belt - 30, belt + 50, { radius: mh * 0.4 })),
        ...pair(lamp(-bw * 0.82, -bw * 0.5, true, "glass")),
        lamp(-bw * 0.3, bw * 0.3, true, "screen"),
        ...pair(lamp(-bw * 0.86, -bw * 0.56, false, "screen")),
      ];
    },
  },
  bicycle: {
    names: ["bicycle", "bike"],
    heightMm: 1050,
    materials: ["metal", "rubber"],
    handed: (W, D) => W >= D,
    gen(W, D) {
      const fr = longFrame(W, D);
      const { L, S, part, sides } = fr;
      // `drawBicycle`, read off its long axis: two slim tyres in line, the frame between them on
      // the centre line, the saddle behind, the bar across the front wheel (the front is +a), the
      // cranks with their pedals. The tyre is held to 3% of the length, as the drawing holds it.
      const r = Math.min(L * 0.19, 340);
      const w = Math.min(S * 0.1, L * 0.06);
      const [ar, af] = [-L / 2 + r, L / 2 - r];
      const t = clamp(S * 0.05, 12, 36);
      const bb: [number, number] = [-L * 0.04, r * 0.85];
      const seat: [number, number] = [-L * 0.2, 940];
      const head: [number, number] = [L * 0.2, 1030];
      const headLow: [number, number] = [L * 0.22, 820];
      const p = clamp(L * 0.02, 8, 40);
      return [
        ...wheel(fr, ar, r, w),
        ...wheel(fr, af, r, w),
        tube(fr, "metal", ar, r, bb[0], bb[1], t * 0.8, t / 2),
        tube(fr, "metal", ar, r, seat[0], seat[1] - 100, t * 0.8, t / 2),
        tube(fr, "metal", bb[0], bb[1], seat[0], seat[1], t, t / 2),
        tube(fr, "metal", seat[0], seat[1] - 120, headLow[0], headLow[1], t, t / 2),
        tube(fr, "metal", bb[0], bb[1], headLow[0], headLow[1] - 30, t * 1.2, t / 2),
        tube(fr, "metal", af, r, head[0], head[1], t, t / 2),
        part(
          "rubber",
          seat[0] - L * 0.065,
          seat[0] + L * 0.065,
          -Math.min(S * 0.12, L * 0.042),
          Math.min(S * 0.12, L * 0.042),
          seat[1],
          990,
          {
            radius: 20,
          },
        ),
        part("metal", head[0] - 14, head[0] + 14, -S * 0.42, S * 0.42, 1022, 1050, { round: true }, "across"),
        ...sides(part("rubber", head[0] - 18, head[0] + 18, S * 0.36, S / 2, 1018, 1050, { round: true }, "across")),
        part("metal", bb[0] - p, bb[0] + p, -S * 0.2, S * 0.2, bb[1] - p, bb[1] + p, { round: true }, "across"),
        ...sides(
          part("rubber", bb[0] - L * 0.02, bb[0] + L * 0.02, S * 0.2, S * 0.3, bb[1] - 12, bb[1] + 12, { radius: 4 }),
        ),
      ];
    },
  },
  motorcycle: {
    names: ["motorcycle"],
    heightMm: 1150,
    materials: ["metal", "glass", "paint", "rubber"],
    handed: (W, D) => W >= D,
    gen(W, D) {
      const fr = longFrame(W, D);
      const { L, S, part, sides } = fr;
      // `drawMotorcycle`, read off its long axis: the rear tyre wider than the front, the body
      // slung over them widest at the tank, the seat behind it, the bar across the front with a
      // mirror each end; the front is +a.
      const [rr, rf] = [Math.min(L * 0.15, 330), Math.min(L * 0.14, 320)];
      const [ar, af] = [-L / 2 + rr, L / 2 - rf];
      const t = clamp(S * 0.06, 20, 50);
      return [
        part("rubber", ar - rr, ar + rr, -S * 0.11, S * 0.11, 0, 2 * rr, { round: true }, "across"),
        part(
          "metal",
          ar - rr * 0.68,
          ar + rr * 0.68,
          -S * 0.11 - 3,
          S * 0.11 + 3,
          rr * 0.32,
          rr * 1.68,
          { round: true },
          "across",
        ),
        part("rubber", af - rf, af + rf, -S * 0.08, S * 0.08, 0, 2 * rf, { round: true }, "across"),
        part(
          "metal",
          af - rf * 0.68,
          af + rf * 0.68,
          -S * 0.08 - 3,
          S * 0.08 + 3,
          rf * 0.32,
          rf * 1.68,
          { round: true },
          "across",
        ),
        tube(fr, "metal", ar, rr, -L * 0.06, 380, t, S * 0.05),
        tube(fr, "metal", af, rf, L * 0.258, 1010, t, S * 0.07),
        part("metal", -L * 0.1, L * 0.18, -S * 0.16, S * 0.16, 220, 580, { radius: 40 }, "across"),
        ...sides(part("metal", -L * 0.44, -L * 0.04, S * 0.1, S * 0.18, 260, 340, { round: true }, "along")),
        part("paint", L * 0.04, L * 0.27, -S * 0.2, S * 0.2, 600, 860, { radius: 90 }, "across"),
        part("rubber", -L * 0.28, L * 0.06, -S * 0.13, S * 0.13, 700, 800, { radius: 30 }, "across"),
        part("paint", -L * 0.42, -L * 0.24, -S * 0.09, S * 0.09, 640, 790, { radius: 40 }, "across"),
        part("glass", L * 0.3, L * 0.36, -S * 0.07, S * 0.07, 800, 920, { round: true }, "along"),
        part("metal", L * 0.245, L * 0.27, -S * 0.42, S * 0.42, 1000, 1024, { round: true }, "across"),
        ...sides(part("rubber", L * 0.24, L * 0.275, S * 0.36, S / 2, 996, 1028, { round: true }, "across")),
        ...sides(part("metal", L * 0.23, L * 0.24, S * 0.395 - 5, S * 0.395 + 5, 1010, 1100, { round: true })),
        ...sides(part("metal", L * 0.22, L * 0.25, S * 0.37, S * 0.43, 1090, 1150, { round: true })),
      ];
    },
  },

  // ── terrace & lawn ──
  hot_tub: {
    names: ["hot_tub", "spa"],
    heightMm: 900,
    materials: ["wood", "wood_dark", "ceramic", "water"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawHotTub`: the rounded shell, the water 9% of the short side in; a white liner under
      // the water, a coping round it, a dark recessed plinth.
      const r = s * 0.16;
      const e = s * 0.09;
      const water = { x0: -hw + e, x1: hw - e, z0: -hd + e, z1: hd - e, radius: s * 0.1 };
      return [
        P("wood_dark", -hw + 25, hw - 25, -hd + 25, hd - 25, 0, 80, { radius: Math.max(1, r - 25) }),
        P("wood", -hw, hw, -hd, hd, 80, 800, { radius: r }),
        P("wood", -hw, hw, -hd, hd, 800, 900, { radius: r, holes: [water] }),
        P("ceramic", water.x0 - 10, water.x1 + 10, water.z0 - 10, water.z1 + 10, 790, 812, {
          radius: water.radius + 10,
        }),
        P("water", water.x0 - 10, water.x1 + 10, water.z0 - 10, water.z1 + 10, 812, 860, { radius: water.radius + 10 }),
      ];
    },
  },
  swing: {
    names: ["swing", "swing_set"],
    heightMm: 2100,
    materials: ["wood", "metal"],
    gen(W, D) {
      const fr = longFrame(W, D);
      const { L, S, part, ends } = fr;
      // `drawSwing`: the beam down the long axis on an A-frame at each end, two seats hung under
      // it on their chains at 0.34 and 0.66 of the run.
      const bb = clamp(S * 0.03, 25, 55);
      const t = clamp(S * 0.04, 30, 80);
      const a0 = -L / 2 + L * 0.03;
      const sv = Math.min(S * 0.08, L * 0.05);
      const rope = (a: number): Part => part("metal", a - 7, a + 7, -7, 7, 420, 2100 - bb * 2, { round: true });
      return [
        part("wood", -L / 2, L / 2, -bb, bb, 2100 - bb * 2, 2100, { radius: 8 }, "along"),
        ...ends(part("wood", a0, a0 + t, -S / 2, S / 2, 0, 2100 - bb, { profile: A_FRAME }, "along")),
        ...ends(part("wood", a0, a0 + t, -S * 0.3, S * 0.3, 680, 680 + bb * 1.2, { round: true }, "across")),
        ...ends(part("wood", -L * 0.24, -L * 0.08, -sv, sv, 380, 420, { radius: 10 })),
        ...ends(rope(-L * 0.225)),
        ...ends(rope(-L * 0.095)),
      ];
    },
  },
  trampoline: {
    names: ["trampoline"],
    heightMm: 900,
    materials: ["fabric", "metal", "rubber"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const lg = clamp(s * 0.012, 12, 30);
      // `drawTrampoline`: the frame, the mat at 0.8 of it; the springs hidden under the pad that
      // covers the band between, on four legs and a ground ring.
      const at = (cx: number, cz: number): Part =>
        P("metal", cx - lg, cx + lg, cz - lg, cz + lg, 0, 840, { round: true });
      const [lx, lz] = [rx * 0.6, rz * 0.6];
      const inner = (f: number) => ({ x0: -rx * f, x1: rx * f, z0: -rz * f, z1: rz * f, round: true });
      return [
        ...pair(at(-lx, -lz)),
        ...pair(at(-lx, lz)),
        P("metal", -rx * 0.66, rx * 0.66, -rz * 0.66, rz * 0.66, 0, 30, { round: true, holes: [inner(0.58)] }),
        P("metal", -rx * 0.98, rx * 0.98, -rz * 0.98, rz * 0.98, 820, 850, { round: true, holes: [inner(0.86)] }),
        P("rubber", -rx * 0.82, rx * 0.82, -rz * 0.82, rz * 0.82, 840, 856, { round: true }),
        P("fabric", -rx, rx, -rz, rz, 850, 900, { round: true, holes: [inner(0.79)] }),
      ];
    },
  },

  // ── the small standing objects ──
  bin: {
    names: ["bin", "wheelie_bin"],
    heightMm: 1070,
    materials: ["metal", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawBin`: the body, the lid, the handle along the hinged back edge, the grip at the front
      // of the lid; the wheels under the handle.
      const rw = clamp(D * 0.16, 30, 110);
      const r = s * 0.08;
      return [
        ...pair(P("rubber", -hw, -hw + W * 0.1, -hd, -hd + 2 * rw, 0, 2 * rw, { axis: "x", round: true })),
        P("metal", -hw + W * 0.02, hw - W * 0.02, -hd + rw - 8, -hd + rw + 8, rw - 8, rw + 8, {
          axis: "x",
          round: true,
        }),
        P("paint", -hw + W * 0.08, hw - W * 0.08, -hd + D * 0.06, hd - D * 0.1, 30, 500, { radius: r }),
        P("paint", -hw + W * 0.05, hw - W * 0.05, -hd + D * 0.04, hd - D * 0.06, 500, 960, { radius: r }),
        P("paint", -hw + W * 0.03, hw - W * 0.03, -hd, hd - D * 0.02, 960, 1000, { radius: r }),
        P("paint", -hw + W * 0.12, hw - W * 0.12, -hd, -hd + clamp(D * 0.05, 10, 40), 1020, 1070, {
          axis: "x",
          round: true,
        }),
        P("paint", -W * 0.15, W * 0.15, hd - D * 0.04, hd, 975, 1000, { axis: "x", radius: 6 }),
      ];
    },
  },
  mailbox: {
    names: ["mailbox", "letterbox"],
    heightMm: 1200,
    materials: ["wood", "stone", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawMailbox`: the box on its post with the flap across its front, on a paving slab. The
      // flag the core draws on the right is that drawing's handed detail, left out (no hand
      // gained): the box is centred.
      const p = clamp(Math.min(W, D) * 0.12, 15, 45);
      const bx = snap64(W * 0.34);
      const [z0, z1] = [-hd + D * 0.14, hd - D * 0.12];
      const k = clamp(Math.min(W, D) * 0.04, 4, 14);
      return [
        P("stone", -hw, hw, -hd, hd, 0, 40, { radius: 10 }),
        P("wood", -p, p, -p, p, 40, 940, { radius: 5 }),
        P("metal", -bx, bx, z0, z1 - 8, 930, 1200, { axis: "z", profile: TUNNEL }),
        P("metal", -bx + 6, bx - 6, z1 - 8, z1, 936, 1190, { axis: "z", profile: TUNNEL }),
        P("wood", -k, k, z1, Math.min(z1 + 2 * k, hd), 1100 - k, 1100 + k, { axis: "z", round: true }),
      ];
    },
  },
  ev_charger: {
    names: ["ev_charger"],
    heightMm: 1400,
    materials: ["stone", "metal", "appliance", "screen", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawEvCharger`: the pedestal against the back edge with its display. The cable the core
      // draws hanging to a plug at its left end is that drawing's handed detail: here it is coiled
      // under a centred holster (no hand gained).
      const px = W * 0.25;
      const [z0, z1] = [-hd + D * 0.06, -hd + D * 0.56];
      const f = z1;
      return [
        P("stone", -hw, hw, -hd, hd, 0, 40, { radius: 10 }),
        P("appliance", -px, px, z0, z1, 40, 1400, { radius: Math.min(px, (z1 - z0) / 2) * 0.3 }),
        P("screen", -W * 0.15, W * 0.15, f, f + 6, 1060, 1260, { axis: "z", radius: 10 }),
        P("metal", -W * 0.08, W * 0.08, f, f + D * 0.1, 830, 930, { radius: 8 }),
        P("rubber", -W * 0.045, W * 0.045, f + D * 0.02, f + D * 0.14, 880, 990, { radius: 8 }),
        P("rubber", -W * 0.19, W * 0.19, f, f + D * 0.07, 420, 800, { axis: "z", round: true }),
      ];
    },
  },
  pergola: {
    names: ["pergola"],
    heightMm: 2600,
    materials: ["wood", "stone"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawPergola`: four posts at 0.08 of the short side in, the frame on them, rafters both
      // ways at about a quarter of the short side (`[1, 9]` each way).
      const [px, pz] = [hw - s * 0.08, hd - s * 0.08];
      const h = s * 0.03;
      const nx = clamp(Math.round(W / (s * 0.25)) - 1, 1, 9);
      const nz = clamp(Math.round(D / (s * 0.25)) - 1, 1, 9);
      // `(2i − n − 1)` negates exactly for the partner `n + 1 − i`: each row is symmetric.
      const at = (n: number, len: number) =>
        Array.from({ length: n }, (_, k) => (len * (2 * (k + 1) - n - 1)) / (2 * (n + 1)));
      const rw = clamp(s * 0.02, 12, 45);
      const posts = [-pz, pz].flatMap((z) => [
        ...pair(P("stone", -px - h * 1.6, -px + h * 1.6, z - h * 1.6, z + h * 1.6, 0, 120, { radius: 4 })),
        ...pair(P("wood", -px - h, -px + h, z - h, z + h, 0, 2420, { radius: 3 })),
      ]);
      return [
        ...posts,
        ...[-pz, pz].map((z) => P("wood", -hw, hw, z - h, z + h, 2300, 2460, { radius: 3 })),
        ...at(nx, W).map((x) => P("wood", x - rw / 2, x + rw / 2, -hd, hd, 2460, 2560, { radius: 2 })),
        ...at(nz, D).map((z) => P("wood", -hw, hw, z - rw * 0.4, z + rw * 0.4, 2560, 2600, { radius: 2 })),
      ];
    },
  },
  sandpit: {
    names: ["sandpit", "sandbox"],
    heightMm: 300,
    materials: ["wood", "soil"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawSandpit`: the timber frame, the sand inside it 0.08 of the short side in, a seat
      // board across each corner (each the mirror of its partner across the width).
      const e = s * 0.08;
      const sand = { x0: -hw + e, x1: hw - e, z0: -hd + e, z1: hd - e, radius: s * 0.015 };
      const k = s * 0.2;
      const tri: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [1, 0],
        [0, 1],
      ];
      const flipU = tri.map(([u, v]): readonly [number, number] => [1 - u, v]);
      const flipV = (p: ReadonlyArray<readonly [number, number]>) =>
        p.map(([u, v]): readonly [number, number] => [u, 1 - v]);
      const corner = (zBack: boolean): Part[] => {
        const [z0, z1] = zBack ? [sand.z0, sand.z0 + k] : [sand.z1 - k, sand.z1];
        const prof = zBack ? tri : flipV(tri);
        return [
          P("wood", sand.x0, sand.x0 + k, z0, z1, 268, 300, { profile: prof }),
          P("wood", -sand.x0 - k, -sand.x0, z0, z1, 268, 300, { profile: zBack ? flipU : flipV(flipU) }),
        ];
      };
      return [
        P("wood", -hw, hw, -hd, hd, 0, 280, { radius: s * 0.03, holes: [sand] }),
        P("soil", sand.x0 - 10, sand.x1 + 10, sand.z0 - 10, sand.z1 + 10, 0, 220, { radius: sand.radius + 10 }),
        ...corner(true),
        ...corner(false),
      ];
    },
  },
  fire_pit: {
    names: ["fire_pit"],
    heightMm: 420,
    materials: ["wood_dark", "stone", "metal"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      // `drawFirePit`: the stone surround, the fire bowl 0.68 of it, four logs laid toward the
      // centre on the axes.
      const bowl = { x0: -rx * 0.68, x1: rx * 0.68, z0: -rz * 0.68, z1: rz * 0.68, round: true };
      const ring = (f: number) => ({ x0: -rx * f, x1: rx * f, z0: -rz * f, z1: rz * f, round: true });
      const lg = Math.min(rx, rz) * 0.08;
      const [n, f] = [0.12, 0.58];
      return [
        P("stone", -rx * 0.97, rx * 0.97, -rz * 0.97, rz * 0.97, 0, 360, { round: true, holes: [bowl] }),
        P("stone", -rx, rx, -rz, rz, 360, 420, { round: true, holes: [ring(0.64)] }),
        P("metal", bowl.x0 - 10, bowl.x1 + 10, bowl.z0 - 10, bowl.z1 + 10, 0, 220, { round: true }),
        ...pair(P("wood_dark", -rx * f, -rx * n, -lg, lg, 220, 220 + 2 * lg, { axis: "x", round: true })),
        P("wood_dark", -lg, lg, -rz * f, -rz * n, 220 + 2 * lg, 220 + 4 * lg, { axis: "z", round: true }),
        P("wood_dark", -lg, lg, rz * n, rz * f, 220 + 2 * lg, 220 + 4 * lg, { axis: "z", round: true }),
      ];
    },
  },
  shed: {
    names: ["shed", "garden_shed"],
    heightMm: 2300,
    materials: ["wood", "wood_dark", "metal", "glass"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawShed`: walls with a pair of doors in the front wall, the ridge along the long axis.
      // The roof overhangs the walls; a window in each side wall.
      const ov = clamp(s * 0.04, 10, 120);
      const [wx, wz] = [hw - ov, hd - ov];
      const eaves = 1900;
      const dw = Math.max(0, Math.min(W * 0.36, (D - 2 * ov) * 1.2)) / 2;
      const along = W >= D;
      const gable: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [1, 0],
        [0.5, 1],
      ];
      const win = Math.min(wz * 0.5, 300);
      return [
        P("wood", -wx, wx, -wz, wz, 0, eaves),
        P("wood_dark", -hw, hw, -hd, hd, eaves - 20, eaves + 20),
        P("wood_dark", -hw, hw, -hd, hd, eaves + 20, 2300, { axis: along ? "x" : "z", profile: gable }),
        ...span(2, dw, 6).map(([a, b]) => P("wood_dark", a, b, wz, Math.min(wz + 20, hd), 30, 1780)),
        ...pair(P("metal", -26, -12, Math.min(wz + 20, hd) - 2, Math.min(wz + 40, hd), 950, 1100, { radius: 4 })),
        ...pair(P("glass", -wx - 10, -wx, -win, win, 1150, 1550)),
      ];
    },
  },
  clothesline: {
    names: ["clothesline", "washing_line"],
    heightMm: 1900,
    materials: ["metal"],
    gen(W, D) {
      const fr = longFrame(W, D);
      const { L, S, part, ends, sides } = fr;
      // `drawClothesline`: a T-post at each end of the run, its cross-arm across it, and four
      // lines strung between the arms at ±0.1 and ±0.3 of the width.
      const post = clamp(Math.min(S * 0.07, L * 0.02), 12, 40);
      const arm = clamp(Math.min(L * 0.012, S * 0.05), 10, 30);
      const a0 = -L / 2;
      return [
        ...ends(part("metal", a0, a0 + 2 * post, -post, post, 0, 1900, { round: true })),
        ...ends(part("metal", a0 + post - arm, a0 + post + arm, -S / 2, S / 2, 1820, 1860, { round: true }, "across")),
        ...[0.1, 0.3].flatMap((b) =>
          sides(part("metal", a0 + post, -a0 - post, S * b - 4, S * b + 4, 1810, 1818, {}, "along")),
        ),
      ];
    },
  },

  // ── planting, play and street furniture added with the new families ──
  palm: {
    names: ["palm", "palm_tree"],
    heightMm: 5000,
    materials: ["foliage", "bark"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      const rt = clamp(Math.min(W, D) * 0.05, 40, 180);
      // `drawPalm`: eight pointed fronds on the D4 bearings round the trunk. The crown is four
      // star layers, each eight-pointed and smaller going up, the second and fourth turned half a
      // frond (22.5°), so the fronds read as drooping in tiers; a ringed trunk under it.
      const layer = (f: number, y0: number, y1: number, turned: boolean): Part =>
        P("foliage", -rx * f, rx * f, -rz * f, rz * f, y0, y1, { profile: turned ? STAR_TURNED : STAR });
      const trunk = Array.from({ length: 6 }, (_, k) => {
        const f = k % 2 === 0 ? 1 : 0.86;
        return P("bark", -rt * f, rt * f, -rt * f, rt * f, 280 + k * 690, 280 + (k + 1) * 690, { round: true });
      });
      return [
        P("bark", -rt * 1.35, rt * 1.35, -rt * 1.35, rt * 1.35, 0, 280, { round: true }),
        ...trunk,
        layer(1, 4300, 4380, false),
        layer(0.84, 4380, 4500, true),
        layer(0.62, 4500, 4640, false),
        layer(0.4, 4640, 4790, true),
        P("foliage", -rx * 0.14, rx * 0.14, -rz * 0.14, rz * 0.14, 4790, 5000, { round: true }),
      ];
    },
  },
  flower_bed: {
    names: ["flower_bed", "planting_bed"],
    heightMm: 360,
    materials: ["stone", "foliage", "soil"],
    gen(W, D) {
      const fr = longFrame(W, D);
      const { L, S } = fr;
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawFlowerBed`: the bed with its edging a twentieth of the short side in, and two rows of
      // flowers along its long axis at ±0.22 of the width, one per half a short side, `[2, 8]` a
      // row. Each a low domed clump, in as many tiers as keep the bed's part count bounded.
      const e = s * 0.05;
      const inner = { x0: -hw + e, x1: hw - e, z0: -hd + e, z1: hd - e, radius: s * 0.1 };
      const n = clamp(Math.round((2 * L) / S), 2, 8);
      const rho = Math.min(S * 0.19, (L / n) * 0.42);
      const plants = Array.from({ length: n }, (_, i) => (L * (2 * i + 1 - n)) / (2 * n)).flatMap((a) =>
        clump(fr, a, S * 0.22, rho, 100, 360, clumpTable(n, 3, 5)),
      );
      return [
        P("stone", -hw, hw, -hd, hd, 0, 160, { radius: s * 0.14, holes: [inner] }),
        P("soil", inner.x0 - 10, inner.x1 + 10, inner.z0 - 10, inner.z1 + 10, 0, 120, { radius: inner.radius + 10 }),
        ...plants,
      ];
    },
  },
  boulder: {
    names: ["boulder", "rock"],
    heightMm: 600,
    materials: ["stone"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawBoulder`: the faceted outline, broad at its base, its crown toward the back. A natural
      // stone rather than a stepped dome: a main mass, faceted, its crown set back, and a lower
      // irregular lump at each front shoulder, the right one the left one's reflection (its
      // facets flipped end for end), so the stone is irregular and still has no hand.
      const mass = (f: number, y0: number, y1: number): Part => {
        const z1 = hd - D * 0.2;
        const cz = (-hd + z1) / 2 - D * 0.1 * (1 - f);
        const h = (z1 + hd) / 2;
        return P("stone", -W * 0.36 * f, W * 0.36 * f, cz - h * f, cz + h * f, y0, y1, { profile: BOULDER });
      };
      const lump = (f: number, y0: number, y1: number): Part[] => {
        const [cx, cz, a, h] = [-hw + W * 0.24, hd - D * 0.34, W * 0.24, D * 0.34];
        const p = P("stone", cx - a * f, cx + a * f, cz - h * f, cz + h * f, y0, y1, { profile: ROCK });
        return [
          p,
          { ...p, x0: -p.x1, x1: -p.x0, profile: ROCK.map(([u, v]): readonly [number, number] => [1 - u, v]) },
        ];
      };
      return [mass(1, 0, 260), mass(0.8, 260, 450), mass(0.5, 450, 600), ...lump(1, 0, 210), ...lump(0.7, 210, 330)];
    },
  },
  picnic_table: {
    names: ["picnic_table"],
    heightMm: 750,
    materials: ["wood"],
    gen(W, D) {
      const { L, S, part, ends, sides } = longFrame(W, D);
      // `drawPicnicTable`, read off its long axis: the top (three boards) over the middle 0.44 of
      // the width, a bench along each long side (0.31–0.48), the two A-frames at 0.13 and 0.87 of
      // the run crossing under it from bench to bench.
      const t = clamp(S * 0.03, 20, 60);
      const a = L * 0.37;
      return [
        ...span(3, S * 0.22, clamp(S * 0.008, 2, 10)).map(([b0, b1]) =>
          part("wood", -L / 2, L / 2, b0, b1, 720, 750, { radius: 4 }),
        ),
        ...sides(part("wood", -L * 0.45, L * 0.45, S * 0.31, S * 0.48, 420, 450, { radius: 4 })),
        ...ends(part("wood", a - t / 2, a + t / 2, -S / 2, S / 2, 0, 720, { profile: PICNIC_FRAME }, "along")),
        ...ends(part("wood", a - t / 2, a + t / 2, -S * 0.48, S * 0.48, 380, 420)),
      ];
    },
  },
  slide: {
    names: ["slide", "playground_slide"],
    heightMm: 1750,
    materials: ["metal", "paint"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawSlide`: the ladder at the head (the top edge, −z), the platform with a guard rail
      // each side, the chute running down to the exit with its run-out lip.
      const [p0, p1] = [-hd + D * 0.13, -hd + D * 0.27];
      const zc = (y: number): number => -hd + D * 0.13 * (0.15 + (0.7 * y) / 1200);
      return [
        ...pair(P("paint", -W * 0.27, -W * 0.27 + 40, -hd, p0, 0, 1200, { axis: "x", profile: LADDER })),
        ...[300, 600, 900].map((y) =>
          P("metal", -W * 0.27, W * 0.27, zc(y) - 14, zc(y) + 14, y - 14, y + 14, { axis: "x", round: true }),
        ),
        P("paint", -hw, hw, p0, p1, 1150, 1200, { radius: 6 }),
        ...[p0, p1 - 40].flatMap((z) => pair(P("paint", -hw + 20, -hw + 60, z, z + 40, 0, 1150))),
        ...pair(P("paint", -hw, -hw + 30, p0, p1, 1200, 1750, { radius: 6 })),
        P("metal", -W * 0.2, W * 0.2, -hd + D * 0.24, hd, 0, 1260, { axis: "x", profile: CHUTE }),
        ...pair(P("paint", -W * 0.28, -W * 0.2, -hd + D * 0.24, hd, 0, 1380, { axis: "x", profile: CHUTE })),
      ];
    },
  },
  bollard: {
    names: ["bollard"],
    heightMm: 900,
    materials: ["metal", "rubber"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      // `drawBollard`: the post, the cap's chamfer ring, the cap; a reflective band near the top.
      const at = (f: number, y0: number, y1: number, mat: "metal" | "rubber" = "metal"): Part =>
        P(mat, -rx * f, rx * f, -rz * f, rz * f, y0, y1, { round: true });
      return [at(0.92, 0, 760), at(1, 600, 660, "rubber"), at(0.8, 760, 840), at(0.64, 840, 880), at(0.3, 880, 900)];
    },
  },
  bike_rack: {
    names: ["bike_rack", "cycle_stand"],
    heightMm: 800,
    materials: ["metal"],
    gen(W, D) {
      const { L, S, part, sides } = longFrame(W, D);
      // `drawBikeRack`: a row of Sheffield hoops ACROSS the long axis, one per short side of run,
      // `[1, 10]`, each an inverted U 0.84 of the width, on two ground rails along the run.
      const n = clamp(Math.round(L / S), 1, 10);
      const half = Math.min(S * 0.045, L / (4 * n));
      const reach = S * 0.42;
      const tu = Math.min(0.2, (2 * half) / (2 * reach));
      const tv = Math.min(0.2, (2 * half) / 800);
      const hoop: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [tu, 0],
        [tu, 0.86 - tv],
        [tu + 0.1, 1 - tv],
        [1 - tu - 0.1, 1 - tv],
        [1 - tu, 0.86 - tv],
        [1 - tu, 0],
        [1, 0],
        [1, 0.86],
        [0.9, 1],
        [0.1, 1],
        [0, 0.86],
      ];
      const hoops = Array.from({ length: n }, (_, i) => (L * (2 * i + 1 - n)) / (2 * n)).map((a) =>
        part("metal", a - half, a + half, -reach, reach, 12, 800, { profile: hoop }, "along"),
      );
      return [...hoops, ...sides(part("metal", -L / 2, L / 2, S * 0.36, S / 2, 0, 12, { radius: 4 }))];
    },
  },
  raised_bed: {
    names: ["raised_bed", "vegetable_bed"],
    heightMm: 500,
    materials: ["wood", "foliage", "soil"],
    gen(W, D) {
      const fr = longFrame(W, D);
      const { L, S } = fr;
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawRaisedBed`: the timber frame, the soil a tenth of the short side in, a post in each
      // corner, two rows of seedlings at ±0.18 of the width, one per 0.3 short sides, `[2, 8]`.
      const k = s * 0.1;
      const soil = { x0: -hw + k, x1: hw - k, z0: -hd + k, z1: hd - k, radius: s * 0.01 };
      const run = L - 2 * k;
      const n = clamp(Math.round(run / (S * 0.3)), 2, 8);
      const rho = Math.min(S * 0.11, (run / n) * 0.4);
      const seedlings = Array.from({ length: n }, (_, i) => (run * (2 * i + 1 - n)) / (2 * n)).flatMap((a) =>
        clump(fr, a, S * 0.18, rho, 400, 490, clumpTable(n, 2, 4)),
      );
      return [
        P("wood", -hw, hw, -hd, hd, 0, 450, { radius: s * 0.02, holes: [soil] }),
        ...[-hd, hd - k].flatMap((z) => pair(P("wood", -hw, -hw + k, z, z + k, 0, 500))),
        P("soil", soil.x0 - 10, soil.x1 + 10, soil.z0 - 10, soil.z1 + 10, 0, 420, { radius: soil.radius + 10 }),
        ...seedlings,
      ];
    },
  },
};

/** 16 directions at k × 22.5°: (cos, sin), written out (no engine's `Math.cos` reaches a coordinate). */
const DIR16: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.9238795325112867, 0.3826834323650898],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0.3826834323650898, 0.9238795325112867],
  [0, 1],
  [-0.3826834323650898, 0.9238795325112867],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-0.9238795325112867, 0.3826834323650898],
  [-1, 0],
  [-0.9238795325112867, -0.3826834323650898],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [-0.3826834323650898, -0.9238795325112867],
  [0, -1],
  [0.3826834323650898, -0.9238795325112867],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [0.9238795325112867, -0.3826834323650898],
];

/**
 * An eight-pointed star in its box: tips on the axes and diagonals (or turned 22.5°), notches at
 * 0.28 of a tip, stretched so its tips touch every side of the box (as a profile must).
 */
const starOf = (turned: boolean): ReadonlyArray<readonly [number, number]> => {
  const pts = DIR16.map(([c, s], k): [number, number] => {
    const r = (k % 2 === 0) !== turned ? 1 : 0.28;
    return [r * c, r * s];
  });
  const m = Math.max(...pts.map(([u]) => u));
  return pts.map(([u, v]): readonly [number, number] => [0.5 + (0.5 * u) / m, 0.5 + (0.5 * v) / m]);
};
const STAR = starOf(false);
const STAR_TURNED = starOf(true);

/** `drawBoulder`'s eleven facets, in its box (the drawing's, stretched to touch every side). */
const BOULDER: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0],
  [46 / 64, 0.04255],
  [57 / 64, 0.19149],
  [1, 0.46809],
  [59 / 64, 0.80851],
  [43 / 64, 1],
  [21 / 64, 1],
  [5 / 64, 0.80851],
  [0, 0.46809],
  [7 / 64, 0.19149],
  [18 / 64, 0.04255],
];

/** An irregular stone lump in plan (multiples of 1/64, so its reflection is exact). */
const ROCK: ReadonlyArray<readonly [number, number]> = [
  [20 / 64, 0],
  [44 / 64, 4 / 64],
  [60 / 64, 18 / 64],
  [1, 38 / 64],
  [54 / 64, 58 / 64],
  [34 / 64, 1],
  [12 / 64, 60 / 64],
  [0, 40 / 64],
  [4 / 64, 16 / 64],
];

/** A picnic table's A-frame in its end view (u across, v up), multiples of 1/64. */
const PICNIC_FRAME: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [4 / 64, 0],
  [20 / 64, 58 / 64],
  [44 / 64, 58 / 64],
  [60 / 64, 0],
  [1, 0],
  [46 / 64, 1],
  [18 / 64, 1],
];

/** A slide's ladder stile in its side view (u from the foot back, v up): leaning to the platform. */
const LADDER: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.3, 0],
  [1, 1],
  [0.7, 1],
];

/** A slide's chute in its side view (u from the platform to the exit, v up): the run-out lip on a foot. */
const CHUTE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.9],
  [0, 1],
  [0.78, 0.24],
  [1, 0.2],
  [1, 0],
  [0.95, 0],
  [0.95, 0.13],
  [0.76, 0.17],
];
