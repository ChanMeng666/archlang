/**
 * T0 batch V6 (visual-assets): kitchen, bath and utility. Declared like V5 (`t0-living.ts`); local
 * frame, units and the clip: `t0.ts`. Back is −z (the wall a service stands against), front +z.
 *
 * Every generator follows the core's plan symbol for its family and is mirror-symmetric across its
 * width. Where the core's drawing is handed by a detail — the bath's taps at its head, the washer's
 * dial, the microwave's keypad, the island's hob or bowl at one end — the model keeps the symmetric
 * part (taps on the middle of the back deck, a centred display, a plain worktop) and so gains no
 * hand. Three families hang on the wall at a ledgered height (`mountMm`): the wall cabinet, the hood
 * and the urinal.
 */
import { cabinet, clamp, MAX_DOORS, P, type Part, pair, span, type T0Family } from "./t0-kit.js";

/** A bar handle across the front, centred, `half` either side, at height `y`. */
const bar = (half: number, z0: number, z1: number, y: number): Part =>
  P("metal", -half, half, z0, z1, y - 8, y + 8, { axis: "x", round: true });

/**
 * A wall-hung urinal's bowl in plan, fractions of its box (multiples of 1/64, so a mirrored point
 * lands exactly on its partner): flat against the wall at the back, a rounded front.
 */
const URINAL: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 28 / 64],
  [62 / 64, 42 / 64],
  [55 / 64, 53 / 64],
  [44 / 64, 61 / 64],
  [32 / 64, 1],
  [20 / 64, 61 / 64],
  [9 / 64, 53 / 64],
  [2 / 64, 42 / 64],
  [0, 28 / 64],
];

/** A washer or a dryer: carcass, control band with a centred display, and the round door. */
function laundry(W: number, D: number, dryer: boolean): Part[] {
  const [hw, hd] = [W / 2, D / 2];
  // `drawWasher`: the door ring 31% of the short side in radius, the porthole glass 62% of it; a
  // dryer's ring is the carcass's own white, a washer's chrome.
  const R = Math.min(W * 0.31, 260);
  const cy = 380;
  const kx = W * 0.3;
  return [
    ...[-hd + 30, hd - 60].flatMap((z) => pair(P("rubber", -hw + 30, -hw + 60, z, z + 30, 0, 20, { round: true }))),
    P("appliance", -hw, hw, -hd, hd - 20, 20, 850, { radius: 10 }),
    P("appliance", -hw + 4, hw - 4, hd - 20, hd - 8, 730, 840, { radius: 4 }),
    P("screen", -Math.min(70, W * 0.12), Math.min(70, W * 0.12), hd - 8, hd - 4, 770, 810, { radius: 3 }),
    ...pair(P("metal", -kx - 22, -kx + 22, hd - 8, hd, 768, 812, { axis: "z", round: true })),
    P(dryer ? "appliance" : "metal", -R, R, hd - 20, hd - 10, cy - R, cy + R, { axis: "z", round: true }),
    P("rubber", -R * 0.78, R * 0.78, hd - 10, hd - 6, cy - R * 0.78, cy + R * 0.78, { axis: "z", round: true }),
    P("glass", -R * 0.62, R * 0.62, hd - 6, hd, cy - R * 0.62, cy + R * 0.62, { axis: "z", round: true }),
  ];
}

export const T0_UTILITY: Readonly<Record<string, T0Family>> = {
  bathtub: {
    names: ["bathtub", "tub", "bath"],
    heightMm: 640,
    materials: ["ceramic", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawBathtub`: the rim 9% of the short side at the sides and foot, a wider deck for the
      // taps (20%), the well rounded. Here the deck is along the back and the taps on its middle.
      const side = clamp(s * 0.09, 30, 90);
      const deck = clamp(s * 0.2, 60, 200);
      const well = { x0: -hw + side, x1: hw - side, z0: -hd + deck, z1: hd - side };
      const wr = 0.42 * Math.min(well.x1 - well.x0, well.z1 - well.z0);
      const mz = -hd + deck * 0.5;
      const wz = well.z0 + Math.min(70, (well.z1 - well.z0) * 0.25);
      return [
        P("ceramic", -hw, hw, -hd, hd, 0, 180, { radius: clamp(s * 0.08, 6, 80) }),
        P("ceramic", -hw, hw, -hd, hd, 180, 560, {
          radius: clamp(s * 0.08, 6, 80),
          holes: [{ ...well, radius: wr }],
        }),
        P("metal", -22, 22, wz - 22, wz + 22, 180, 184, { round: true }),
        P("metal", -28, 28, mz - 28, mz + 28, 560, 600, { round: true }),
        P("metal", -13, 13, mz, mz + Math.min(170, deck * 0.5 + 90), 584, 604, { axis: "z", round: true }),
        ...pair(P("metal", -95, -65, mz - 15, mz + 15, 560, 640, { round: true })),
      ];
    },
  },
  oven: {
    names: ["oven"],
    heightMm: 910,
    materials: ["metal", "glass", "appliance", "screen", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawOven`: a range (a hob on top) when the footprint is 1.6 times wider than deep.
      const range = W * 10 >= D * 16;
      const r = Math.min(W, D) * 0.1;
      const rings = range
        ? [-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => {
              const [x, z] = [sx * W * 0.22, sz * D * 0.18];
              return P("metal", x - r, x + r, z - r, z + r, 904, 908, {
                round: true,
                holes: [{ x0: x - r * 0.62, x1: x + r * 0.62, z0: z - r * 0.62, z1: z + r * 0.62, round: true }],
              });
            }),
          )
        : [];
      return [
        P("rubber", -hw + 20, hw - 20, -hd, hd - 50, 0, 60),
        P("appliance", -hw, hw, -hd, hd - 24, 60, 900, { radius: 6 }),
        P("appliance", -hw + 4, hw - 4, hd - 24, hd - 6, 770, 890, { radius: 4 }),
        P("screen", -Math.min(80, W * 0.12), Math.min(80, W * 0.12), hd - 6, hd - 2, 810, 850, { radius: 3 }),
        ...pair(P("metal", -W * 0.32 - 18, -W * 0.32 + 18, hd - 6, hd, 812, 848, { axis: "z", round: true })),
        P("appliance", -hw + 4, hw - 4, hd - 24, hd - 6, 90, 760, { axis: "z", radius: 8 }),
        // The door window: the dark oven behind a glass pane (the core gives an oven glass).
        P("screen", -hw + W * 0.12, hw - W * 0.12, hd - 6, hd - 4, 200, 620, { axis: "z", radius: 12 }),
        P("glass", -hw + W * 0.12 - 6, hw - W * 0.12 + 6, hd - 4, hd - 1, 194, 626, { axis: "z", radius: 14 }),
        bar(Math.min(W * 0.34, 260), hd - 6, hd, 712),
        P("appliance", -hw, hw, -hd, -hd + clamp(D * 0.06, 15, 40), 900, 910, { radius: 4 }),
        ...(range ? [P("screen", -hw + 20, hw - 20, -hd + 45, hd - 30, 900, 904, { radius: 10 }), ...rings] : []),
      ];
    },
  },
  dishwasher: {
    names: ["dishwasher"],
    heightMm: 900,
    materials: ["stone", "metal", "appliance", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // Built in under the run's worktop, so a fitted kitchen reads as one run: the carcass and
      // worktop of `cabinet`, the door panel, its control band and handle.
      return [
        ...cabinet(W, D, { fronts: false }),
        P("appliance", -hw + 2, hw - 2, hd - 40, hd - 8, 106, 786, { axis: "z", radius: 6 }),
        P("metal", -hw + 2, hw - 2, hd - 40, hd - 10, 790, 862),
        bar(Math.min(W * 0.14, 120), hd - 8, hd, 748),
      ];
    },
  },
  island: {
    names: ["island"],
    heightMm: 900,
    materials: ["stone", "metal", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawIsland`: the worktop overhangs the seating side (the front 24% of the depth); the
      // cabinets face the work side at the back. The hob or bowl the core draws at one end is that
      // drawing's handed detail, left out.
      const ov = D * 0.24;
      const doors = span(clamp(Math.round(W / 600), 1, MAX_DOORS), hw - 2, 4);
      return [
        P("rubber", -hw + 40, hw - 40, -hd + 70, hd - ov - 40, 0, 100),
        P("paint", -hw, hw, -hd + 30, hd - ov, 100, 870),
        P("stone", -hw, hw, -hd, hd, 870, 900, { radius: clamp(Math.min(W, D) * 0.015, 3, 15) }),
        ...doors.map(([a, b]) => P("paint", a, b, -hd + 12, -hd + 30, 106, 862)),
        ...doors.map(([a, b]) => {
          const pw = Math.min((b - a) * 0.45, 160) / 2;
          const c = (a + b) / 2;
          return P("metal", c - pw, c + pw, -hd, -hd + 12, 800, 814, { axis: "x", round: true });
        }),
      ];
    },
  },
  upper_cabinet: {
    names: ["upper_cabinet", "wall_cabinet"],
    heightMm: 2100,
    mountMm: 1400,
    materials: ["metal", "paint"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // Hung with its underside at 1400 mm; the pulls at the doors' bottom edge, where a hand
      // reaches up to them.
      const doors = span(clamp(Math.round(W / 600), 1, MAX_DOORS), hw - 2, 4);
      return [
        P("paint", -hw, hw, -hd, hd - 20, 1400, 2100),
        ...doors.map(([a, b]) => P("paint", a, b, hd - 20, hd - 4, 1404, 2096)),
        ...doors.map(([a, b]) => {
          const pw = Math.min((b - a) * 0.35, 120);
          const c = (a + b) / 2;
          return P("metal", c - pw, c + pw, hd - 4, hd, 1420, 1434, { axis: "x", round: true });
        }),
      ];
    },
  },
  washer: {
    names: ["washer", "washing_machine"],
    heightMm: 850,
    materials: ["metal", "glass", "appliance", "screen", "rubber"],
    gen: (W, D) => laundry(W, D, false),
  },
  dryer: {
    names: ["dryer"],
    heightMm: 850,
    materials: ["metal", "glass", "appliance", "screen", "rubber"],
    gen: (W, D) => laundry(W, D, true),
  },
  bidet: {
    names: ["bidet"],
    heightMm: 480,
    materials: ["ceramic", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawBidet`: the bowl reaching nearly to the wall, no cistern, a small tap deck on its
      // back rim, the waste on the bowl's centre.
      const hole = { x0: -hw * 0.62, x1: hw * 0.62, z0: -hd + D * 0.22, z1: hd - D * 0.1, round: true };
      const tz = -hd + D * 0.11;
      const cz = (hole.z0 + hole.z1) / 2;
      return [
        P("ceramic", -hw * 0.55, hw * 0.55, -hd + D * 0.12, hd - D * 0.2, 0, 300, { round: true }),
        P("ceramic", -hw, hw, -hd, hd, 300, 400, { radius: hw * 0.9, holes: [hole] }),
        P("metal", -20, 20, cz - 20, cz + 20, 300, 303, { round: true }),
        P("ceramic", -W * 0.17, W * 0.17, -hd + D * 0.04, -hd + D * 0.18, 400, 425, { radius: 15 }),
        P("metal", -16, 16, tz - 16, tz + 16, 425, 480, { round: true }),
        P("metal", -10, 10, tz, tz + Math.min(90, D * 0.12), 450, 468, { axis: "z", round: true }),
      ];
    },
  },
  urinal: {
    names: ["urinal"],
    heightMm: 1250,
    mountMm: 350,
    materials: ["ceramic", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawUrinal`: a U against its wall, flat at the back and round at the front: a shallow bowl
      // hung under a tall rounded back, the flush pipe rising from it. Nothing below 350 mm.
      // The bowl is the outline inset evenly: the outline is convex, so its shrunken copy about the
      // centre lies strictly inside it at any aspect.
      const e = clamp(Math.min(W, D) * 0.1, 12, 50);
      const bowl = { x0: -hw + e, x1: hw - e, z0: -hd + e, z1: hd - e, profile: URINAL };
      const zb = -hd + Math.min(D * 0.3, 110);
      return [
        P("ceramic", -hw, hw, -hd, hd, 350, 430, { profile: URINAL }),
        P("ceramic", -hw, hw, -hd, hd, 430, 640, { profile: URINAL, holes: [bowl] }),
        P("ceramic", -hw + 10, hw - 10, -hd, zb, 430, 1080, { axis: "z", radius: Math.min(hw * 0.9, 160) }),
        P("metal", -20, 20, (bowl.z0 + bowl.z1) / 2 - 20, (bowl.z0 + bowl.z1) / 2 + 20, 430, 433, { round: true }),
        P("metal", -15, 15, -hd + 6, -hd + 36, 1000, 1250, { round: true }),
        P("metal", -40, 40, -hd, -hd + 50, 1140, 1200, { radius: 8 }),
      ];
    },
  },
  laundry_sink: {
    names: ["laundry_sink", "laundry_tub"],
    heightMm: 1150,
    materials: ["ceramic", "metal", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawLaundrySink`: ONE deep bowl, 10% in from the sides, from 26% of the depth to 8% from
      // the front, on a cupboard; the tap at the back.
      const hole = { x0: -hw + W * 0.1, x1: hw - W * 0.1, z0: -hd + D * 0.26, z1: hd - D * 0.08 };
      const r = clamp(Math.min(hole.x1 - hole.x0, hole.z1 - hole.z0) * 0.12, 5, 50);
      const tz = (-hd + hole.z0) / 2;
      return [
        P("rubber", -hw, hw, -hd, hd - 70, 0, 100),
        P("paint", -hw, hw, -hd, hd - 40, 100, 480),
        ...span(2, hw - 2, 4).map(([a, b]) => P("paint", a, b, hd - 40, hd - 22, 106, 474)),
        ...span(2, hw - 2, 4).map(([a, b]) => {
          const pw = Math.min((b - a) * 0.4, 120) / 2;
          const c = (a + b) / 2;
          return P("metal", c - pw, c + pw, hd - 22, hd - 8, 430, 444, { axis: "x", round: true });
        }),
        P("ceramic", -hw, hw, -hd, hd, 480, 520, { radius: 10 }),
        P("ceramic", -hw, hw, -hd, hd, 520, 900, { radius: 10, holes: [{ ...hole, radius: r }] }),
        P("metal", -18, 18, tz - 18, tz + 18, 900, 1150, { round: true }),
        P("metal", -12, 12, tz, tz + Math.min(200, (hole.z1 - hole.z0) * 0.55), 1116, 1140, {
          axis: "z",
          round: true,
        }),
      ];
    },
  },
  water_heater: {
    names: ["water_heater", "boiler"],
    heightMm: 1600,
    materials: ["metal", "appliance", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawWaterHeater`: the cylinder 0.4 of the short side in radius, pushed toward the front,
      // its two pipes running back to the wall (and up it).
      const s = Math.min(W, D);
      const R = 0.4 * s;
      const zc = hd - 0.5 * s;
      const px = 0.3 * R;
      const band = (y: number): Part =>
        P("appliance", -R - 5, R + 5, zc - R - 5, zc + R + 5, y, y + 30, { round: true });
      return [
        P("rubber", -hw, hw, -hd, hd, 0, 30, { radius: 10 }),
        P("metal", -R, R, zc - R, zc + R, 30, 1450, { round: true }),
        band(250),
        band(1200),
        P("appliance", -R * 0.92, R * 0.92, zc - R * 0.92, zc + R * 0.92, 1450, 1500, { round: true }),
        P("appliance", -R * 0.6, R * 0.6, zc - R * 0.6, zc + R * 0.6, 1500, 1530, { round: true }),
        P("appliance", -R * 0.3, R * 0.3, zc + R * 0.85, Math.min(zc + R + 25, hd), 500, 620, { radius: 6 }),
        ...pair(P("metal", -px - 14, -px + 14, -hd, zc, 1380, 1408, { axis: "z", round: true })),
        ...pair(P("metal", -px - 14, -px + 14, -hd, -hd + 28, 1380, 1600, { round: true })),
      ];
    },
  },
  range_hood: {
    names: ["range_hood"],
    heightMm: 2250,
    mountMm: 1600,
    materials: ["metal", "screen"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // Hung 700 mm over a 900 mm hob: the sloped canopy, its dark filter underneath, the chimney
      // up the wall.
      return [
        P("screen", -hw + 20, hw - 20, -hd + 20, hd - 20, 1600, 1606),
        P("metal", -hw, hw, -hd, hd, 1604, 1790, {
          axis: "x",
          profile: [
            [0, 0],
            [1, 0],
            [1, 0.3],
            [0.55, 1],
            [0, 1],
          ],
        }),
        P("metal", -Math.min(hw * 0.33, 150), Math.min(hw * 0.33, 150), -hd, -hd + Math.min(D * 0.5, 250), 1790, 2250),
      ];
    },
  },
  microwave: {
    names: ["microwave"],
    heightMm: 1200,
    materials: ["wood", "metal", "glass", "appliance", "screen"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // A microwave is set at worktop height: on a small cart of its own, so a piece the plan
      // stands on the floor neither floats nor sits on the floor. Centred door window and display;
      // the core's keypad on the right is that drawing's handed detail, left out.
      const legs = [-hd + 20, hd - 44].flatMap((z) =>
        pair(P("metal", -hw + 20, -hw + 44, z, z + 24, 0, 880, { round: true })),
      );
      return [
        ...legs,
        P("wood", -hw + 20, hw - 20, -hd + 20, hd - 20, 280, 300),
        P("wood", -hw, hw, -hd, hd, 880, 900, { radius: 6 }),
        P("appliance", -hw + 10, hw - 10, -hd + 20, hd - 20, 900, 1200, { radius: 8 }),
        P("appliance", -hw + 16, hw - 16, hd - 20, hd - 6, 912, 1188, { axis: "z", radius: 8 }),
        P("screen", -hw + W * 0.14, hw - W * 0.14, hd - 6, hd - 4, 960, 1120, { axis: "z", radius: 10 }),
        P("glass", -hw + W * 0.14 - 5, hw - W * 0.14 + 5, hd - 4, hd - 1, 955, 1125, { axis: "z", radius: 12 }),
        P("screen", -Math.min(W * 0.15, 70), Math.min(W * 0.15, 70), hd - 6, hd - 2, 1140, 1170, { radius: 3 }),
        bar(Math.min(W * 0.25, 120), hd - 6, hd, 934),
      ];
    },
  },
  bar_counter: {
    names: ["bar_counter"],
    heightMm: 1050,
    materials: ["wood", "cushion", "stone", "metal", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawBarCounter`: the top over the BACK 62% of the depth, the overhang, a footrail, and
      // 1.2 stools per counter-depth of run, [1, 8], seated on the front band.
      const zt = -hd + D * 0.62;
      const n = clamp(Math.round((W / D) * 1.2), 1, 8);
      const r = Math.min((0.4 * W) / n, 0.3 * D, 200);
      const stools = span(n, hw, 0).map(([a, b]) => (a + b) / 2);
      return [
        P("rubber", -hw + 40, hw - 40, -hd + 40, zt - 120, 0, 80),
        P("wood", -hw, hw, -hd, zt - 90, 80, 1020),
        P("stone", -hw, hw, -hd, zt, 1020, 1050, { radius: 8 }),
        P("metal", -hw + 40, hw - 40, zt - 70, zt - 40, 180, 210, { axis: "x", round: true }),
        ...stools.flatMap((c) => [
          P("cushion", c - r, c + r, hd - 2 * r, hd, 720, 770, { round: true }),
          P("metal", c - 22, c + 22, hd - r - 22, hd - r + 22, 0, 720, { round: true }),
          ...(n <= 6
            ? [P("metal", c - r * 0.75, c + r * 0.75, hd - r * 1.75, hd - r * 0.25, 0, 12, { round: true })]
            : []),
        ]),
      ];
    },
  },
  pantry: {
    names: ["pantry", "tall_cabinet", "larder"],
    heightMm: 2100,
    materials: ["metal", "paint"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawPantry`: full-height joinery, the door band across the front, one door per 0.9
      // depths of width, `[1, 4]`, a pull centred on each.
      const doors = span(clamp(Math.round(W / (D * 0.9)), 1, 4), hw - 2, 4);
      return [
        P("paint", -hw + 20, hw - 20, -hd, hd - 70, 0, 100),
        P("paint", -hw, hw, -hd, hd - 22, 100, 2100),
        ...doors.map(([a, b]) => P("paint", a, b, hd - 22, hd - 6, 106, 2094, { radius: 3 })),
        ...doors.map(([a, b]) => {
          const pw = Math.min((b - a) * 0.16, 90);
          const c = (a + b) / 2;
          return P("metal", c - pw, c + pw, hd - 6, hd, 1040, 1056, { axis: "x", round: true });
        }),
      ];
    },
  },
  towel_rail: {
    names: ["towel_rail", "towel_radiator"],
    heightMm: 1400,
    mountMm: 200,
    materials: ["linen", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawTowelRail`: a heated ladder rail hung 200 mm off the floor: a stile at each end, the
      // bars between them in one plane 0.6 of the depth from the wall, the brackets back to the
      // wall, and a towel hung over the middle (0.3–0.7 of the width).
      const st = clamp(Math.min(D * 0.22, W * 0.08) * 0.6, 5, 25);
      const zc = -hd + D * 0.6;
      const rr = clamp(D * 0.09, 4, 14);
      const rungs = Array.from({ length: 10 }, (_, k) => 260 + k * 120);
      return [
        ...pair(P("metal", -hw, -hw + 2 * st, zc - st, zc + st, 200, 1400, { round: true })),
        ...rungs.map((y) =>
          P("metal", -hw + st, hw - st, zc - rr, zc + rr, y - rr, y + rr, { axis: "x", round: true }),
        ),
        ...[300, 1300].flatMap((y) =>
          pair(P("metal", -hw + st - 6, -hw + st + 6, -hd, zc, y - 6, y + 6, { axis: "z", round: true })),
        ),
        P("linen", -W * 0.2, W * 0.2, -hd + D * 0.2, hd, 560, 1140, { radius: 8 }),
      ];
    },
  },
};
