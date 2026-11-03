/**
 * T0 batch V7 (visual-assets), office and commercial: the meeting table, the reception desk, the
 * filing cabinet, the locker, the pool table and the treadmill. Declared like V5 (`t0-living.ts`);
 * local frame, units and the clip: `t0.ts`. Back is −z (the top edge of the core's symbol), front +z.
 *
 * Every generator follows the core's plan symbol (`glyphs-misc.ts`) and is mirror-symmetric across
 * its width, except the reception desk: its L (`drawReceptionDesk`, the return on the LEFT, the
 * staff chair inside the L) is handed in its shape, so it is built in the drawing's hand and
 * reflected as the plan reflects it (`handed`).
 */
import {
  type ChairBack,
  clamp,
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

/** A chair's seat and back in its side view (u from the back, v up): the shell over its sled. */
const SHELL: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 7 / 64],
  [9 / 64, 7 / 64],
  [9 / 64, 1],
  [0, 1],
];

/** A chair's sled base in its side view (u from the back, v up): two legs and the rail on them. */
const SLED: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [4 / 64, 0],
  [4 / 64, 56 / 64],
  [60 / 64, 56 / 64],
  [60 / 64, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** The reception desk's L in plan, fractions of its box: the back run and the return on the left. */
const RECEPTION_L: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 0.42],
  [0.3, 0.42],
  [0.3, 1],
  [0, 1],
];

/** `n` heights from `y0` to `y1`, `gap` apart: a stack of drawers. */
function stack(n: number, y0: number, y1: number, gap: number): Array<[number, number]> {
  const h = (y1 - y0 - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, i): [number, number] => [y0 + i * (h + gap), y0 + i * (h + gap) + h]);
}

export const T0_OFFICE: Readonly<Record<string, T0Family>> = {
  meeting_table: {
    names: ["meeting_table"],
    heightMm: 820,
    materials: ["wood", "fabric", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const band = snap64(s * 0.22);
      const [tx, tz] = [hw - band, hd - band];
      // `drawMeetingTable`: an eased boardroom top inside a chair band, the dining chairs round it,
      // `[1, 6]` along each long side and one at each end, on two pedestals down the long axis.
      const horizontal = W >= D;
      const run = horizontal ? 2 * tx : 2 * tz;
      // The count is the core's own expression on the unrounded band (`drawMeetingTable`:
      // `clampCount(runLen / (CHAIR_PITCH * band), 1, 6)`, the top `r.w - 2 * band` long), so a .5
      // tie rounds the same way in the drawing and the model (red-team S1); positions are snapped.
      const cb = s * 0.22;
      const perSide = clamp(Math.round((horizontal ? W - 2 * cb : D - 2 * cb) / (2.2 * cb)), 1, 6);
      const c = clamp(s * 0.03, 12, 45);
      const o = run * 0.3;
      const f = Math.min(tx, tz) * 0.6;
      const pedestals = horizontal
        ? [
            ...pair(P("metal", -o - c, -o + c, -c, c, 30, 715, { round: true })),
            ...pair(P("metal", -o - 2 * c, -o + 2 * c, -f, f, 0, 30, { radius: 8 })),
          ]
        : [-o, o].flatMap((z) => [
            P("metal", -c, c, z - c, z + c, 30, 715, { round: true }),
            P("metal", -f, f, z - 2 * c, z + 2 * c, 0, 30, { radius: 8 }),
          ]);
      // A run of three or fewer a side: each chair a fabric shell on a metal sled; a longer run
      // (up to fourteen chairs) one fabric piece each, so the part count stays bounded.
      const chair = (b: { x0: number; x1: number; z0: number; z1: number }, back: ChairBack): Part[] =>
        perSide <= 3
          ? [sideways("metal", b, 0, 430, back, SLED), sideways("fabric", b, 400, 820, back, SHELL)]
          : [sideways("fabric", b, 0, 820, back, SIDE_CHAIR)];
      return [
        P("wood", -tx, tx, -tz, tz, 715, 745, { radius: Math.min(tx, tz) * 0.28 }),
        ...pedestals,
        ...tableSeats(W, D, false, perSide, chair),
      ];
    },
  },
  reception_desk: {
    names: ["reception_desk"],
    heightMm: 1100,
    materials: ["wood", "wood_dark", "fabric", "stone", "metal", "screen"],
    handed: true,
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawReceptionDesk`: the back run over 42% of the depth and the return down the LEFT 30%
      // of the width; the transaction ledge raised along the two outer (visitor) faces; the staff
      // chair in the open quadrant, its back to the open side; a monitor on the run facing it.
      const led = s * 0.12;
      const lw = led * 1.4;
      const cx = -hw + W * 0.62;
      const cz = -hd + D * 0.42 + D * 0.58 * 0.58;
      const cs = Math.max(0, Math.min(D * 0.34, W * 0.14)) / 2;
      const mw = Math.min(W * 0.12, 280);
      const mz = -hd + led + 30;
      return [
        P("wood_dark", -hw + 20, hw - 20, -hd + 20, hd - 20, 0, 60, { profile: RECEPTION_L }),
        P("wood", -hw, hw, -hd, hd, 60, 740, { profile: RECEPTION_L }),
        P("stone", -hw, hw, -hd, hd, 740, 770, { profile: RECEPTION_L }),
        P("wood", -hw, hw, -hd, -hd + led, 770, 1075),
        P("wood", -hw, -hw + led, -hd + led, hd, 770, 1075),
        P("stone", -hw, hw, -hd, -hd + lw, 1075, 1100, { radius: 6 }),
        P("stone", -hw, -hw + lw, -hd + lw, hd, 1075, 1100, { radius: 6 }),
        P("metal", cx - mw * 0.3, cx + mw * 0.3, mz, mz + 40, 770, 800, { radius: 6 }),
        P("screen", cx - mw, cx + mw, mz + 12, mz + 32, 800, 1060, { axis: "z", radius: 8 }),
        P("metal", cx - cs * 0.9, cx + cs * 0.9, cz - cs * 0.9, cz + cs * 0.9, 0, 30, { round: true }),
        P("metal", cx - 20, cx + 20, cz - 20, cz + 20, 30, 430, { round: true }),
        P("fabric", cx - cs, cx + cs, cz - cs, cz + cs, 430, 480, { radius: cs * 0.3 }),
        P("fabric", cx - cs * 0.9, cx + cs * 0.9, cz + cs - Math.min(60, cs * 0.4), cz + cs, 480, 860, {
          axis: "z",
          radius: Math.min(cs * 0.6, 100),
        }),
      ];
    },
  },
  filing_cabinet: {
    names: ["filing_cabinet"],
    heightMm: 1320,
    materials: ["metal", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawFilingCabinet`: the carcass, four drawers across it (the three lines between them),
      // each with its pull on the front.
      const drawers = stack(4, 70, 1312, 6);
      const pw = Math.min(W * 0.18, 70);
      return [
        P("rubber", -hw + 20, hw - 20, -hd + 20, hd - 40, 0, 60),
        P("metal", -hw, hw, -hd, hd - 20, 60, 1320, { radius: 4 }),
        ...drawers.map(([a, b]) => P("metal", -hw + 6, hw - 6, hd - 20, hd - 10, a, b, { radius: 3 })),
        ...drawers.map(([, b]) => P("rubber", -pw, pw, hd - 10, hd, b - 70, b - 54, { axis: "x", radius: 6 })),
      ];
    },
  },
  locker: {
    names: ["locker"],
    heightMm: 1800,
    materials: ["metal", "screen", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawLocker`: the carcass split into narrow doors, about one a depth, `[2, 6]`; a pull on
      // each door's front, a vent at its head.
      const n = clamp(Math.round(W / D), 2, 6);
      const doors = span(n, hw - 3, 6);
      return [
        P("rubber", -hw + 15, hw - 15, -hd + 15, hd - 50, 0, 80),
        P("metal", -hw, hw, -hd, hd - 22, 80, 1800, { radius: 3 }),
        ...doors.map(([a, b]) => P("paint", a, b, hd - 22, hd - 6, 95, 1785, { radius: 3 })),
        ...doors.map(([a, b]) => {
          const [c, h] = [(a + b) / 2, (b - a) * 0.3];
          return P("screen", c - h, c + h, hd - 6, hd - 4, 1560, 1660, { radius: 4 });
        }),
        ...doors.map(([a, b]) => {
          const [c, h] = [(a + b) / 2, (b - a) * 0.14];
          return P("metal", c - h, c + h, hd - 6, hd, 1000, 1020, { axis: "x", round: true });
        }),
      ];
    },
  },
  pool_table: {
    names: ["pool_table"],
    heightMm: 800,
    materials: ["wood_dark", "fabric", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawPoolTable`: the rail 6.5% of the short side, the cushion to 12%, the cloth inside, six
      // pockets on the cloth's corners and the middle of its LONG sides, on four heavy legs.
      const [e1, e2] = [s * 0.065, s * 0.12];
      const leg = clamp(s * 0.07, 25, 140);
      const li = s * 0.06;
      const legs = [-hd + li, hd - li - leg].flatMap((z) =>
        pair(P("wood_dark", -hw + li, -hw + li + leg, z, z + leg, 0, 620, { radius: leg * 0.2 })),
      );
      const [cx, cz] = [hw - e2, hd - e2];
      const pr = s * 0.036 * 1.2;
      const pocket = (x: number, z: number): Part =>
        P("rubber", x - pr, x + pr, z - pr, z + pr, 756, 764, { round: true });
      const mids = W >= D ? [pocket(0, -cz), pocket(0, cz)] : pair(pocket(-cx, 0));
      return [
        ...legs,
        P("wood_dark", -hw + s * 0.04, hw - s * 0.04, -hd + s * 0.04, hd - s * 0.04, 560, 720, { radius: s * 0.03 }),
        P("wood_dark", -hw, hw, -hd, hd, 720, 800, {
          radius: s * 0.035,
          holes: [{ x0: -hw + e1, x1: hw - e1, z0: -hd + e1, z1: hd - e1, radius: s * 0.02 }],
        }),
        P("fabric", -hw + e1 - 10, hw - e1 + 10, -hd + e1 - 10, hd - e1 + 10, 740, 790, {
          radius: s * 0.02 + 10,
          holes: [{ x0: -cx, x1: cx, z0: -cz, z1: cz, radius: s * 0.012 }],
        }),
        P("fabric", -cx - 10, cx + 10, -cz - 10, cz + 10, 720, 760, { radius: s * 0.012 + 10 }),
        ...pair(pocket(-cx, -cz)),
        ...pair(pocket(-cx, cz)),
        ...mids,
      ];
    },
  },
  treadmill: {
    names: ["treadmill"],
    heightMm: 1400,
    materials: ["metal", "appliance", "screen", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawTreadmill`: the frame, the console at the wall end (the top edge, −z) with its
      // display, the two side platforms and the belt between them.
      const deck = -hd + D * 0.21;
      const end = -hd + D * 0.95;
      const u = clamp(s * 0.05, 20, 50);
      const f = clamp(s * 0.06, 15, 50);
      const feet = [-hd, hd - f].flatMap((z) =>
        pair(P("rubber", -hw + 20, -hw + 20 + f, z, z + f, 0, 40, { radius: 6 })),
      );
      const bw = W * 0.245;
      return [
        ...feet,
        P("appliance", -hw, hw, -hd + D * 0.1, hd, 40, 185, { radius: s * 0.05 }),
        P("appliance", -W * 0.4, W * 0.4, -hd + D * 0.04, deck, 40, 330, { axis: "x", radius: 60 }),
        ...pair(P("appliance", -hw + W * 0.075, -hw + W * 0.205, deck, end, 185, 212, { radius: s * 0.03 })),
        P("rubber", -bw, bw, deck, end, 180, 205, { radius: bw }),
        ...pair(
          P("appliance", -hw + W * 0.04, -hw + W * 0.04 + u, -hd + D * 0.1, -hd + D * 0.1 + u, 185, 1250, {
            radius: 6,
          }),
        ),
        P("appliance", -W * 0.4, W * 0.4, -hd + D * 0.035, -hd + D * 0.165, 1200, 1400, { axis: "x", radius: 40 }),
        P("screen", -W * 0.29, W * 0.29, -hd + D * 0.165, -hd + D * 0.165 + 6, 1240, 1370, { axis: "z", radius: 10 }),
        ...pair(
          P("metal", -hw + W * 0.04, -hw + W * 0.04 + 30, -hd + D * 0.1, -hd + D * 0.42, 1000, 1030, {
            axis: "z",
            round: true,
          }),
        ),
      ];
    },
  },

  // ── office and care pieces added with the new families ──
  whiteboard: {
    names: ["whiteboard"],
    heightMm: 2000,
    mountMm: 900,
    materials: ["metal", "paint"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawWhiteboard`: hung from 900 mm to 2000 mm, the board against the wall (0.45 of the
      // depth), the frame's end caps and top rail, the pen tray along its foot.
      const zb = -hd + D * 0.45;
      const cap = Math.max(W * 0.012, 6);
      return [
        P("paint", -hw + cap, hw - cap, -hd, zb, 940, 1985, { axis: "z", radius: 4 }),
        ...pair(P("metal", -hw, -hw + cap, -hd, zb + 4, 935, 2000)),
        P("metal", -hw + cap, hw - cap, -hd, zb + 2, 1985, 2000),
        P("metal", -hw + W * 0.04, hw - W * 0.04, -hd, hd, 900, 940, { radius: 8 }),
      ];
    },
  },
  printer: {
    names: ["printer", "copier"],
    heightMm: 1150,
    materials: ["metal", "appliance", "screen", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawPrinter`: a floor-standing copier: the paper trays in its base, the scanner lid over
      // the back 0.6 of the depth, the paper exit across the front, the control panel at the front
      // with its display, centred (no hand); on castors.
      const c = clamp(s * 0.06, 15, 45);
      const casters = [-hd + 30, hd - 30 - c].flatMap((z) =>
        pair(P("rubber", -hw + 30, -hw + 30 + c, z, z + c, 0, 70, { round: true })),
      );
      const trays: Array<[number, number]> = [
        [90, 350],
        [362, 622],
      ];
      return [
        ...casters,
        P("appliance", -hw, hw, -hd, hd - 16, 70, 1050, { radius: s * 0.05 }),
        ...trays.map(([y0, y1]) => P("appliance", -hw + 10, hw - 10, hd - 16, hd - 6, y0, y1, { radius: 4 })),
        ...trays.map(([, y1]) => P("metal", -W * 0.2, W * 0.2, hd - 6, hd, y1 - 50, y1 - 36, { axis: "x", radius: 6 })),
        P("screen", -W * 0.4, W * 0.4, hd - 16, hd - 12, 930, 990, { radius: 4 }),
        P("appliance", -hw + W * 0.07, hw - W * 0.07, -hd + D * 0.06, -hd + D * 0.66, 1050, 1110, {
          radius: s * 0.025,
        }),
        P("appliance", -W * 0.3, W * 0.3, hd - D * 0.22, hd - D * 0.07, 1050, 1130, { radius: 8 }),
        P("screen", -W * 0.14, W * 0.14, hd - D * 0.19, hd - D * 0.1, 1130, 1150, { radius: 4 }),
      ];
    },
  },
  server_rack: {
    names: ["server_rack"],
    heightMm: 2000,
    materials: ["metal", "screen", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawServerRack`: a run of cabinets, one per 0.6 depths of width, `[1, 8]`, each with its
      // (perforated, dark) front door and a handle centred on it; worked from the front.
      const bays = span(clamp(Math.round(W / (D * 0.6)), 1, 8), hw - 2, 4);
      return [
        P("rubber", -hw + 20, hw - 20, -hd + 20, hd - 40, 0, 60),
        P("metal", -hw, hw, -hd, hd - 20, 60, 2000, { radius: 3 }),
        ...bays.map(([a, b]) => P("screen", a, b, hd - 20, hd - 6, 80, 1980, { radius: 3 })),
        ...bays.map(([a, b]) => {
          const [c, h] = [(a + b) / 2, (b - a) * 0.14];
          return P("metal", c - h, c + h, hd - 6, hd, 1000, 1016, { axis: "x", round: true });
        }),
      ];
    },
  },
  hospital_bed: {
    names: ["hospital_bed"],
    heightMm: 1000,
    materials: ["linen", "metal", "paint", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawHospitalBed`: the head at the top edge (−z): a panel across the head and the foot,
      // the four split side rails, the mattress on its deck, the pillow; on a lifting chassis and
      // castors.
      const c = clamp(s * 0.05, 15, 50);
      const casters = [-hd + D * 0.08, hd - D * 0.08 - c].flatMap((z) =>
        pair(P("rubber", -hw + W * 0.1, -hw + W * 0.1 + c, z, z + c, 0, 120, { round: true })),
      );
      const rails = [
        [0.1, 0.46],
        [0.54, 0.86],
      ].flatMap(([f0, f1]) =>
        pair(
          P("metal", -hw + W * 0.015, -hw + W * 0.065, -hd + D * (f0 as number), -hd + D * (f1 as number), 520, 860, {
            axis: "x",
            radius: 12,
          }),
        ),
      );
      return [
        ...casters,
        P("metal", -hw + W * 0.12, hw - W * 0.12, -hd + D * 0.1, hd - D * 0.1, 120, 380, { radius: 20 }),
        P("metal", -hw + W * 0.07, hw - W * 0.07, -hd + D * 0.05, hd - D * 0.05, 380, 450, { radius: s * 0.04 }),
        P("paint", -hw, hw, -hd, -hd + D * 0.045, 300, 1000, { axis: "z", radius: 20 }),
        P("paint", -hw, hw, hd - D * 0.045, hd, 300, 820, { axis: "z", radius: 20 }),
        P("linen", -hw + W * 0.09, hw - W * 0.09, -hd + D * 0.06, hd - D * 0.06, 450, 600, { radius: s * 0.05 }),
        P("linen", -W * 0.28, W * 0.28, -hd + D * 0.09, -hd + D * 0.21, 600, 680, { axis: "x", radius: 30 }),
        ...rails,
      ];
    },
  },
  workstation: {
    names: ["workstation", "desk_pod"],
    heightMm: 1200,
    materials: ["wood", "fabric", "screen"],
    gen(W, D) {
      const s = Math.min(W, D);
      // `drawWorkstation`, read off its long axis: two rows of desks back to back with the
      // privacy screen between them, a monitor on each desk facing its user, a chair band 0.26 of
      // the short side each side, one desk per 2.2 bands a side, `[1, 4]`.
      const band = snap64(s * 0.26);
      const horizontal = W >= D;
      const run = horizontal ? W : D;
      const depth = (horizontal ? D : W) - 2 * band;
      // The count is the core's own expression on the unrounded band (`drawWorkstation`:
      // `clampCount(runLen / (2.2 * band), 1, 4)`), so the drawing and the model agree at a .5 tie.
      const n = clamp(Math.round(run / (2.2 * (s * 0.26))), 1, 4);
      const scr = Math.max(depth * 0.025, 8);
      const box = (u0: number, u1: number, v0: number, v1: number) =>
        horizontal ? { x0: u0, x1: u1, z0: v0, z1: v1 } : { x0: v0, x1: v1, z0: u0, z1: u1 };
      const at = (mat: "wood" | "fabric" | "screen", b: ReturnType<typeof box>, y0: number, y1: number, more = {}) =>
        P(mat, b.x0, b.x1, b.z0, b.z1, y0, y1, more);
      const off = scr + depth * 0.06;
      const mh = Math.max(depth * 0.04, 12);
      const mw = (run / n) * 0.38;
      const cw = snap64(band * 0.9);
      const desks = Array.from({ length: n }, (_, i) => (run * (2 * i + 1 - n)) / (2 * n)).flatMap((u) =>
        [-1, 1].flatMap((sgn) => {
          const v = sgn * (off + mh / 2);
          const side: ChairBack = horizontal ? (sgn < 0 ? "-z" : "+z") : sgn < 0 ? "-x" : "+x";
          const chair =
            sgn < 0
              ? box(u - cw / 2, u + cw / 2, -depth / 2 - band, -depth / 2)
              : box(u - cw / 2, u + cw / 2, depth / 2, depth / 2 + band);
          return [
            at("screen", box(u - mw / 2, u + mw / 2, v - mh / 2, v + mh / 2), 745, 1080, { radius: 4 }),
            sideways("fabric", chair, 0, 820, side, SIDE_CHAIR),
          ];
        }),
      );
      const leg = box(-run / 2 + 10, -run / 2 + 40, -depth / 2 + 20, depth / 2 - 20);
      const legs = horizontal
        ? pair(at("wood", leg, 0, 720))
        : [
            at("wood", leg, 0, 720),
            at("wood", box(run / 2 - 40, run / 2 - 10, -depth / 2 + 20, depth / 2 - 20), 0, 720),
          ];
      return [
        at("wood", box(-run / 2, run / 2, -depth / 2, depth / 2), 720, 745, { radius: 6 }),
        ...legs,
        at("fabric", box(-run * 0.49, run * 0.49, -scr, scr), 745, 1200, { radius: scr }),
        ...desks,
      ];
    },
  },
};
