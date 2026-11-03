/**
 * T0 batch V5 (visual-assets): living, bedroom, dining and office. Each family is declared once
 * with every fact the mesh builder and the ledger read (`T0Family`); `t0.ts` merges the batch into
 * its tables. Local frame, units and the clip to the footprint and height: `t0.ts`. Back is −z (the
 * wall a directional piece stands against, the top edge of the core's symbol), front +z.
 *
 * Every generator follows the anatomy of the core's plan symbol for its family (`glyphs-*.ts`),
 * and is mirror-symmetric across its width, except the three `handed` families whose drawing is
 * handed in its shape, not in a detail: `sofa_l` (the return on the left), `chaise` (one arm, on
 * the left) and `piano` (the straight bass side on the right, the bent side on the left). Where the
 * core's drawing is handed only by a detail (the bed's turned sheet, the desk's pedestal), the
 * model keeps the symmetric part of it and leaves the detail out, so it never gains a hand.
 */
import {
  BACK_CUSHION,
  clamp,
  dome,
  HEMI,
  MOUND,
  P,
  type Part,
  pair,
  span,
  type T0Family,
  upholstered,
} from "./t0-kit.js";

/** Intervals `[a, b]` of `n` equal pieces from `from` to `to`, `gap` apart (not centred on 0). */
function run(from: number, to: number, n: number, gap: number): Array<[number, number]> {
  const len = (to - from - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, i): [number, number] => [from + i * (len + gap), from + i * (len + gap) + len]);
}

/** The sofa's arm rule (`drawSofa`, `seatBody`): 8% of the width, held to [0.12, 0.22] of the depth. */
const sofaArm = (W: number, D: number): number => Math.min(clamp(W * 0.08, D * 0.12, D * 0.22), W * 0.25);

/**
 * A grand piano's case in plan, fractions of its box: u across (0 the treble cheek on the left, 1
 * the straight bass side), v from the keyboard (0) to the tail (1). Cheek, the convex shoulder,
 * the concave bent side, the round tail, then the bass side back to the keyboard.
 */
const PIANO_CASE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 0.82],
  [0.995, 0.88],
  [0.975, 0.93],
  [0.94, 0.97],
  [0.89, 0.995],
  [0.83, 1],
  [0.76, 0.985],
  [0.68, 0.92],
  [0.58, 0.82],
  [0.47, 0.72],
  [0.36, 0.64],
  [0.25, 0.58],
  [0.15, 0.535],
  [0.07, 0.49],
  [0.025, 0.44],
  [0.005, 0.37],
  [0, 0.3],
];

/** The case's ring from `v0` on (the keyboard band cut away), refitted to its own box. */
const caseFrom = (v0: number): Array<readonly [number, number]> => [
  [0, 0],
  [1, 0],
  ...PIANO_CASE.slice(2).map(([u, v]): readonly [number, number] => [u, (v - v0) / (1 - v0)]),
];

/** A drawer or door pull: a short bar across the front, centred on `c`, at height `y`. */
const pull = (c: number, half: number, z0: number, z1: number, y: number): Part =>
  P("metal", c - half, c + half, z0, z1, y - 6, y + 6, { axis: "x", round: true });

export const T0_LIVING: Readonly<Record<string, T0Family>> = {
  nightstand: {
    names: ["nightstand", "bedside_table"],
    heightMm: 550,
    materials: ["wood", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const leg = clamp(Math.min(W, D) * 0.07, 22, 40);
      const legH = 130;
      const fz = hd - 30;
      const legs = [-hd + 10, fz - leg - 6].flatMap((z) =>
        pair(P("wood", -hw + 10, -hw + 10 + leg, z, z + leg, 0, legH + 4, { radius: leg * 0.3 })),
      );
      const drawers: Array<[number, number]> = [
        [legH + 6, 328],
        [334, 519],
      ];
      return [
        ...legs,
        P("wood", -hw + 4, hw - 4, -hd, fz, legH, 525),
        P("wood", -hw, hw, -hd, hd, 525, 550, { radius: clamp(Math.min(W, D) * 0.04, 4, 15) }),
        ...drawers.map(([a, b]) => P("wood", -hw + 8, hw - 8, fz, hd - 12, a, b, { radius: 3 })),
        ...drawers.map(([a, b]) =>
          P("metal", -11, 11, hd - 12, hd, (a + b) / 2 - 11, (a + b) / 2 + 11, { axis: "z", round: true }),
        ),
      ];
    },
  },
  // `seatBody(r, g, 1, r.w * 0.16)`: one cushion, broader arms.
  armchair: {
    names: ["armchair"],
    heightMm: 800,
    materials: ["wood_dark", "fabric", "cushion"],
    gen: (W, D) => upholstered(W, D, Math.min(W * 0.16, W * 0.25), 1),
  },
  // `drawLoveseat`: the sofa with two cushions on any length.
  loveseat: {
    names: ["loveseat", "sofa_2"],
    heightMm: 800,
    materials: ["wood_dark", "fabric", "cushion"],
    gen: (W, D) => upholstered(W, D, sofaArm(W, D), 2),
  },
  coffee_table: {
    names: ["coffee_table"],
    heightMm: 420,
    materials: ["wood", "metal", "glass"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const r = clamp(s * 0.04, 4, 30);
      const inset = clamp(s * 0.1, 25, 120);
      const leg = clamp(s * 0.05, 20, 40);
      const legIn = clamp(s * 0.05, 15, 60);
      const legs = [-hd + legIn, hd - legIn - leg].flatMap((z) =>
        pair(P("metal", -hw + legIn, -hw + legIn + leg, z, z + leg, 0, 395, { radius: leg * 0.5 })),
      );
      // The top is a frame round a glass panel (`drawCoffeeTable`'s inset panel), a tenth of the
      // short side in; a top too small to frame one is solid.
      const framed = hw - inset >= 10 && hd - inset >= 10;
      const pane = { x0: -hw + inset, x1: hw - inset, z0: -hd + inset, z1: hd - inset, radius: Math.max(1, r * 0.6) };
      return [
        ...legs,
        P("wood", -hw + legIn, hw - legIn, -hd + legIn, hd - legIn, 110, 128, { radius: 6 }),
        P("wood", -hw, hw, -hd, hd, 390, 420, { radius: r, ...(framed ? { holes: [pane] } : {}) }),
        ...(framed ? [P("glass", pane.x0 + 2, pane.x1 - 2, pane.z0 + 2, pane.z1 - 2, 398, 414, { radius: 1 })] : []),
      ];
    },
  },
  tv_unit: {
    names: ["tv_unit"],
    heightMm: 1180,
    materials: ["wood", "wood_dark", "metal", "screen"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const [legH, top, H] = [120, 500, 1180];
      const leg = 30;
      const legs = [-hd + 30, hd - 50 - leg].flatMap((z) =>
        pair(P("metal", -hw + 40, -hw + 40 + leg, z, z + leg, 0, legH + 4, { round: true })),
      );
      // Doors: one per depth of run, [2, 5] (`drawTvUnit`).
      const doors = span(clamp(Math.round(W / D), 2, 5), hw - 4, 4);
      // The television stands at the back on a foot plate: 16:9, 74% of the run, at most 1100 wide.
      const pw = Math.min(W * 0.74, 1100);
      const ph = pw * 0.5625;
      const pz = -hd + 30;
      return [
        ...legs,
        P("wood_dark", -hw, hw, -hd, hd - 20, legH, top - 20),
        P("wood_dark", -hw, hw, -hd, hd, top - 20, top, { radius: 8 }),
        ...doors.map(([a, b]) => P("wood", a, b, hd - 20, hd - 6, legH + 6, top - 26)),
        ...doors.map(([a, b]) => pull((a + b) / 2, Math.min((b - a) * 0.3, 90) / 2, hd - 6, hd, top - 64)),
        P("metal", -Math.min(pw * 0.2, 160), Math.min(pw * 0.2, 160), pz - 20, pz + 120, top, top + 12, { radius: 6 }),
        P("metal", -30, 30, pz + 40, pz + 70, top + 12, H - ph + 60),
        P("screen", -pw / 2, pw / 2, pz, pz + 40, H - ph, H, { axis: "z", radius: 6 }),
      ];
    },
  },
  chair: {
    names: ["chair"],
    heightMm: 880,
    materials: ["wood", "fabric"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const leg = clamp(s * 0.07, 20, 38);
      const seat = 450;
      return [
        // The back legs run up into the back posts; the backrest is the core's back bar.
        ...pair(P("wood", -hw, -hw + leg, -hd, -hd + leg, 0, 880, { radius: leg * 0.3 })),
        ...pair(P("wood", -hw + 4, -hw + 4 + leg, hd - leg, hd, 0, seat - 25, { radius: leg * 0.3 })),
        ...pair(P("wood", -hw + 4, -hw + 4 + leg * 0.6, -hd + leg, hd - leg, 150, 170, { axis: "z", round: true })),
        P("wood", -hw, hw, -hd, hd, seat - 25, seat, { radius: clamp(s * 0.05, 5, 30) }),
        P("fabric", -hw + 15, hw - 15, -hd + leg + 10, hd - 12, seat, seat + 35, { radius: clamp(s * 0.08, 5, 50) }),
        P("wood", -hw + leg, hw - leg, -hd + 4, -hd + 4 + clamp(D * 0.05, 15, 25), 620, 860, {
          axis: "z",
          radius: 40,
        }),
      ];
    },
  },
  stool: {
    names: ["stool", "barstool"],
    heightMm: 650,
    materials: ["wood", "cushion", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const r = clamp(Math.min(W, D) * 0.05, 12, 22);
      const legs = [-1, 1].flatMap((sz) =>
        pair(P("wood", -W * 0.32 - r, -W * 0.32 + r, sz * D * 0.32 - r, sz * D * 0.32 + r, 0, 600, { round: true })),
      );
      return [
        ...legs,
        P("metal", -W * 0.36, W * 0.36, -D * 0.36, D * 0.36, 230, 245, {
          round: true,
          holes: [{ x0: -W * 0.31, x1: W * 0.31, z0: -D * 0.31, z1: D * 0.31, round: true }],
        }),
        P("wood", -hw, hw, -hd, hd, 600, 625, { round: true }),
        P("cushion", -hw + 14, hw - 14, -hd + 14, hd - 14, 625, 650, { round: true }),
      ];
    },
  },
  bench: {
    names: ["bench"],
    heightMm: 450,
    materials: ["wood", "wood_dark"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const inset = clamp(W * 0.06, 15, 120);
      const t = clamp(W * 0.03, 18, 40);
      return [
        ...pair(P("wood_dark", -hw + inset, -hw + inset + t, -hd + 20, hd - 20, 0, 410)),
        P("wood_dark", -hw + inset + t, hw - inset - t, -15, 15, 250, 290),
        P("wood", -hw, hw, -hd, hd, 410, 450, { radius: clamp(Math.min(W, D) * 0.04, 4, 20) }),
      ];
    },
  },
  desk: {
    names: ["desk"],
    heightMm: 1200,
    materials: ["wood", "metal", "appliance", "screen"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const [top, H] = [750, 1200];
      const panel = clamp(W * 0.025, 18, 30);
      // The modesty panel at 0.12 of the depth from the back (`drawDesk`); the drawer pedestal the
      // core draws on the right is that drawing's handed detail, left out (no hand gained).
      const zm = -hd + D * 0.12;
      const mw = Math.min(560, W * 0.6);
      const mz = -hd + D * 0.15;
      return [
        ...pair(P("wood", -hw + 20, -hw + 20 + panel, -hd + 30, hd - 30, 0, top - 28)),
        P("wood", -hw + 20 + panel, hw - 20 - panel, zm - 9, zm + 9, 380, top - 28),
        P("wood", -hw, hw, -hd, hd, top - 28, top, { radius: clamp(Math.min(W, D) * 0.015, 3, 12) }),
        P("metal", -Math.min(110, mw * 0.3), Math.min(110, mw * 0.3), mz - 60, mz + 70, top, top + 10, { radius: 20 }),
        P("metal", -22, 22, mz - 14, mz + 4, top + 10, H - 270),
        P("screen", -mw / 2, mw / 2, mz + 4, mz + 26, H - 330, H, { axis: "z", radius: 8 }),
        P("appliance", -Math.min(220, W * 0.2), Math.min(220, W * 0.2), mz + 150, mz + 290, top, top + 14, {
          radius: 6,
        }),
      ];
    },
  },
  office_chair: {
    names: ["office_chair"],
    heightMm: 1000,
    materials: ["fabric", "cushion", "metal", "rubber"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const c = clamp(s * 0.05, 14, 30);
      const base = 2 * c;
      // The core's five-star base, at quarter turns: two crossed bars on their castors.
      return [
        P("metal", -hw, hw, -16, 16, base, base + 28, { axis: "x", radius: 10 }),
        P("metal", -16, 16, -hd, hd, base, base + 28, { axis: "z", radius: 10 }),
        ...pair(P("rubber", -hw, -hw + 2 * c, -c, c, 0, base, { round: true })),
        P("rubber", -c, c, -hd, -hd + 2 * c, 0, base, { round: true }),
        P("rubber", -c, c, hd - 2 * c, hd, 0, base, { round: true }),
        P("metal", -22, 22, -22, 22, base + 28, 420, { round: true }),
        P("fabric", -hw * 0.86, hw * 0.86, -hd * 0.8, hd * 0.9, 420, 465, { radius: s * 0.12 }),
        P("cushion", -hw * 0.8, hw * 0.8, -hd * 0.72, hd * 0.84, 465, 500, { radius: s * 0.1 }),
        P("metal", -25, 25, -hd * 0.86, -hd * 0.86 + 22, 430, 640),
        P("fabric", -hw * 0.78, hw * 0.78, -hd * 0.94, -hd * 0.94 + 60, 560, 1000, {
          axis: "z",
          radius: Math.min(hw * 0.7, 120),
        }),
        ...pair(P("metal", -hw * 0.9, -hw * 0.9 + 22, -12, 12, 470, 650)),
        ...pair(P("rubber", -hw * 0.94, -hw * 0.94 + 60, -hd * 0.45, hd * 0.3, 650, 675, { radius: 14 })),
      ];
    },
  },
  bookshelf: {
    names: ["bookshelf", "bookcase", "shelf"],
    heightMm: 1800,
    materials: ["wood", "wood_dark", "linen", "wool"],
    gen(W, D) {
      const [hw, hd, H] = [W / 2, D / 2, 1800];
      const t = 18;
      const plinth = 70;
      const floor = plinth + t;
      // Four shelves, five compartments of equal height.
      const c = (H - t - floor - 4 * t) / 5;
      const base = (k: number): number => floor + k * (c + t);
      // Books: a group at each end of the second and fourth compartments, mirrored, and a stack
      // lying flat in the middle one. The count is a clamped function of the width only.
      const g = clamp(Math.floor((W - 2 * t) / 160), 1, 3);
      const bw = clamp((W - 2 * t) * 0.055, 22, 50);
      const bz0 = -hd + 14;
      const bz1 = hd - Math.min(40, D * 0.12);
      const tall = [0.84, 0.92, 0.76];
      const covers = ["wood_dark", "wool", "linen"] as const;
      const books: Part[] = [];
      for (const k of [1, 3]) {
        for (let j = 0; j < g; j++) {
          const x0 = -hw + t + 4 + j * (bw + 3);
          const top = base(k) + c * (tall[(j + k) % 3] as number);
          books.push(...pair(P(covers[(j + k) % 3] ?? "linen", x0, x0 + bw, bz0, bz1, base(k), top)));
        }
      }
      const wide = Math.min((W - 2 * t) * 0.45, 260);
      return [
        ...pair(P("wood", -hw, -hw + t, -hd, hd, 0, H)),
        P("wood", -hw + t, hw - t, -hd, hd, H - t, H),
        P("wood", -hw + t, hw - t, -hd, hd - 20, 0, floor),
        P("wood_dark", -hw + t, hw - t, -hd, -hd + 8, floor, H - t),
        ...[1, 2, 3, 4].map((k) => P("wood", -hw + t, hw - t, -hd + 8, hd - 6, base(k) - t, base(k))),
        ...books,
        P("wool", -wide / 2, wide / 2, bz0, bz1, base(2), base(2) + 38),
        P("linen", -wide * 0.42, wide * 0.42, bz0 + 10, bz1 - 10, base(2) + 38, base(2) + 72),
      ];
    },
  },
  sofa_l: {
    names: ["sofa_l", "corner_sofa"],
    heightMm: 800,
    materials: ["wood_dark", "fabric", "cushion"],
    handed: true,
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawSofaL`: both runs one seat deep, R = min(0.56 h, 0.35 w); the back run along the back
      // edge, the return down the LEFT, the front-right quadrant open floor; arms at the free ends.
      const R = Math.min(D * 0.56, W * 0.35);
      const back = clamp(R * 0.2, 90, 200);
      const arm = R * 0.18;
      const [legH, seat] = [80, 280];
      const L = (u: number, v: number): Array<readonly [number, number]> => [
        [0, 0],
        [1, 0],
        [1, v],
        [u, v],
        [u, 1],
        [0, 1],
      ];
      const backCush = clamp((R - back) * 0.24, 70, 180);
      const count = (len: number): number => clamp(Math.round(len / (0.62 * R)), 1, 3);
      const topRun = [-hw + R + 6, hw - arm - 6] as const;
      const retRun = [-hd + R + 6, hd - arm - 6] as const;
      const tops = topRun[1] - topRun[0] >= 20 ? run(topRun[0], topRun[1], count(topRun[1] - topRun[0]), 12) : [];
      const rets = retRun[1] - retRun[0] >= 20 ? run(retRun[0], retRun[1], count(retRun[1] - retRun[0]), 12) : [];
      const [s0, s1] = [-hd + back + 4, -hd + R - 4]; // a top-run seat's depth
      const [r0, r1] = [-hw + back + 4, -hw + R - 4]; // a return seat's depth
      const plinth =
        R > 80 && W > 120 && D > 120
          ? [
              P("wood_dark", -hw + 30, hw - 30, -hd + 30, hd - 30, 0, legH, {
                profile: L((R - 60) / (W - 60), (R - 60) / (D - 60)),
              }),
            ]
          : [];
      return [
        ...plinth,
        P("fabric", -hw, hw, -hd, hd, legH, seat, { profile: L(R / W, R / D) }),
        P("fabric", -hw, hw - arm, -hd, -hd + back, legH, 800, { axis: "x", radius: Math.min(back * 0.45, 70) }),
        P("fabric", -hw, -hw + back, -hd + back, hd - arm, legH, 800, { axis: "z", radius: Math.min(back * 0.45, 70) }),
        P("fabric", hw - arm, hw, -hd, -hd + R, legH, 620, { axis: "z", radius: Math.min(arm * 0.45, 70) }),
        P("fabric", -hw, -hw + R, hd - arm, hd, legH, 620, { axis: "x", radius: Math.min(arm * 0.45, 70) }),
        // Seats: the square corner seat, the back run's, the return's.
        P("cushion", r0, r1, s0, s1, seat, seat + 150, { radius: 50 }),
        ...tops.map(([a, b]) => P("cushion", a, b, s0, s1, seat, seat + 150, { axis: "x", radius: 50 })),
        ...rets.map(([a, b]) => P("cushion", r0, r1, a, b, seat, seat + 150, { axis: "z", radius: 50 })),
        // Back cushions: the corner's pinwheel (along the back into the corner, then down the
        // left below it), then one behind every run seat.
        P("cushion", -hw + back, -hw + R, -hd + back, -hd + back + backCush, seat + 150, 760, {
          axis: "x",
          profile: BACK_CUSHION,
        }),
        P("cushion", -hw + back, -hw + back + backCush, -hd + back + backCush, -hd + R, seat + 150, 760, {
          axis: "z",
          profile: BACK_CUSHION,
        }),
        ...tops.map(([a, b]) =>
          P("cushion", a, b, -hd + back, -hd + back + backCush, seat + 150, 760, { axis: "x", profile: BACK_CUSHION }),
        ),
        ...rets.map(([a, b]) =>
          P("cushion", -hw + back, -hw + back + backCush, a, b, seat + 150, 760, { axis: "z", profile: BACK_CUSHION }),
        ),
      ];
    },
  },
  chaise: {
    names: ["chaise"],
    heightMm: 800,
    materials: ["wood_dark", "fabric", "cushion"],
    handed: true,
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawChaise`: the sofa's language with ONE arm, on the left, and the right end open.
      const arm = sofaArm(W, D);
      const back = clamp(D * 0.18, 110, 220);
      const [legH, seat] = [80, 280];
      const leg = 40;
      const backCush = clamp((D - back) * 0.24, 90, 200);
      const rowX = -hw + arm + 6;
      const rowEnd = hw - Math.min(W, D) * 0.045;
      const n = clamp(Math.round((rowEnd - rowX) / (0.62 * D)), 1, 4);
      const legs = [-hd + 30, hd - 30 - leg].flatMap((z) =>
        pair(P("wood_dark", -hw + 30, -hw + 30 + leg, z, z + leg, 0, legH)),
      );
      return [
        ...legs,
        P("fabric", -hw + arm, hw, -hd, hd - 10, legH, seat, { radius: 30 }),
        P("fabric", -hw, -hw + arm, -hd, hd, legH, 620, { axis: "z", radius: Math.min(arm * 0.45, 70) }),
        P("fabric", -hw + arm, hw, -hd, -hd + back, legH, 800, { axis: "x", radius: Math.min(back * 0.45, 70) }),
        P("cushion", rowX, rowEnd, -hd + back + 4, hd - 4, seat, seat + 150, { radius: 60 }),
        ...run(rowX, rowEnd, n, 12).map(([a, b]) =>
          P("cushion", a, b, -hd + back, -hd + back + backCush, seat + 150, 760, { axis: "x", profile: BACK_CUSHION }),
        ),
      ];
    },
  },
  piano: {
    names: ["piano", "grand_piano"],
    heightMm: 1250,
    materials: ["wood_dark", "linen", "metal", "rubber"],
    handed: true,
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawPiano`: the keyboard at the BACK edge; a bench in front of it (behind it on the page)
      // only on a footprint at least 1.3 widths deep, the case keeping the rest.
      const bench = D >= W * 1.3;
      const z0 = bench ? -hd + W * 0.3 : -hd;
      const L = hd - z0;
      const kb = 0.13; // the keyboard band, a fraction of the case
      const kz1 = z0 + L * kb;
      const at = (u: number, v: number): [number, number] => [-hw + u * W, z0 + v * L];
      const leg = (u: number, v: number): Part => {
        const [x, z] = at(u, v);
        return P("wood_dark", x - 32, x + 32, z - 32, z + 32, 0, 620, { round: true });
      };
      const cheek = W * 0.06;
      const [mx, mz] = [Math.min(hw * 0.55, 360), kz1 + Math.min(L * 0.06, 90)];
      return [
        leg(0.09, kb + 0.06),
        leg(0.9, kb + 0.06),
        leg(0.85, 0.9),
        // The case: its bottom board under the keys, the rim round the strings, the lid closed.
        P("wood_dark", -hw, hw, z0, hd, 600, 700, { profile: PIANO_CASE }),
        P("wood_dark", -hw, hw, kz1, hd, 700, 985, { profile: caseFrom(kb) }),
        P("wood_dark", -hw + 6, hw - 6, kz1 + 6, hd - 6, 985, 1000, { profile: caseFrom(kb) }),
        // The keyboard between its cheek blocks, the key slip's felt and the open fall board.
        ...pair(P("wood_dark", -hw, -hw + cheek, z0, kz1, 700, 780)),
        P("linen", -hw + cheek, hw - cheek, z0 + 12, kz1 - 24, 700, 722),
        P("rubber", -hw + cheek, hw - cheek, z0, z0 + 12, 690, 716),
        P("wood_dark", -hw + cheek, hw - cheek, kz1 - 24, kz1, 700, 840),
        // The music desk, leaning back over the lid; the lyre and its pedals under the keys.
        P("wood_dark", -mx, mx, mz, mz + 90, 1000, 1250, {
          axis: "x",
          profile: [
            [0, 0],
            [0.2, 0],
            [1, 1],
            [0.8, 1],
          ],
        }),
        P("wood_dark", -45, 45, z0 + L * 0.06, z0 + L * 0.06 + 40, 60, 600),
        P("metal", -70, 70, z0 + L * 0.02, z0 + L * 0.06 + 40, 40, 60),
        ...(bench
          ? [
              ...pair(P("wood_dark", -W * 0.25, -W * 0.25 + 40, -hd, -hd + W * 0.2, 0, 470)),
              P("rubber", -W * 0.25, W * 0.25, -hd, -hd + W * 0.2, 470, 520, { radius: 10 }),
            ]
          : []),
      ];
    },
  },
  bunk_bed: {
    names: ["bunk_bed"],
    heightMm: 1700,
    materials: ["wood", "linen", "wool"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const post = clamp(Math.min(W, D) * 0.05, 40, 60);
      const rail = post * 0.6;
      const pd = clamp(D * 0.15, 100, 300);
      // `drawBunkBed`: posts and a headboard, two decks, a guard rail round the upper one, and
      // the ladder at the FOOT, centred.
      const deck = (y: number): Part[] => [
        P("wood", -hw, hw, -hd, hd, y, y + 100),
        P("linen", -hw + rail, hw - rail, -hd + post, hd - post, y + 100, y + 250, { radius: 40 }),
        P("linen", -hw + rail + 60, hw - rail - 60, -hd + post + 30, -hd + post + 30 + pd, y + 250, y + 350, {
          axis: "x",
          radius: 50,
        }),
        P("wool", -hw + rail - 6, hw - rail + 6, -hd + post + pd + 80, hd - post, y + 160, y + 280, {
          axis: "x",
          radius: 40,
        }),
      ];
      const lw = Math.min(200, hw * 0.5);
      return [
        ...[-hd, hd - post].flatMap((z) => pair(P("wood", -hw, -hw + post, z, z + post, 0, 1700, { radius: 6 }))),
        ...deck(220),
        ...deck(1150),
        P("wood", -hw + post, hw - post, -hd + post * 0.2, -hd + post * 0.7, 220, 1650),
        P("wood", -hw + post, hw - post, hd - post * 0.7, hd - post * 0.2, 220, 600),
        ...pair(P("wood", -hw, -hw + rail, -hd + post, hd - post, 1540, 1600, { axis: "z", radius: 12 })),
        P("wood", -hw + post, hw - post, hd - rail, hd, 1540, 1600, { axis: "x", radius: 12 }),
        ...pair(P("wood", -lw - 36, -lw, hd - 34, hd, 320, 1600, { radius: 6 })),
        ...[560, 800, 1040].map((y) => P("wood", -lw, lw, hd - 30, hd - 6, y, y + 30, { axis: "x", round: true })),
      ];
    },
  },
  crib: {
    names: ["crib", "cot"],
    heightMm: 900,
    materials: ["wood", "linen", "wool"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const post = clamp(Math.min(W, D) * 0.05, 30, 45);
      // `drawCrib`: the bars down both LONG faces, read off the footprint, their count from the
      // length.
      const deep = D >= W;
      const long = (deep ? D : W) - 2 * post;
      const n = clamp(Math.round(long / 150), 3, 6);
      const bars = span(n, long / 2 - 30, 0).map(([a, b]) => (a + b) / 2);
      const end = post * 0.6;
      const sides: Part[] = deep
        ? [
            P("wood", -hw + post, hw - post, -hd, -hd + end, 290, 860),
            P("wood", -hw + post, hw - post, hd - end, hd, 290, 860),
            ...pair(P("wood", -hw, -hw + post * 0.7, -hd + post, hd - post, 840, 880, { axis: "z", radius: 10 })),
            ...bars.flatMap((z) => pair(P("wood", -hw + 6, -hw + 26, z - 10, z + 10, 290, 840, { round: true }))),
          ]
        : [
            ...pair(P("wood", -hw, -hw + end, -hd + post, hd - post, 290, 860)),
            P("wood", -hw + post, hw - post, -hd, -hd + post * 0.7, 840, 880, { axis: "x", radius: 10 }),
            P("wood", -hw + post, hw - post, hd - post * 0.7, hd, 840, 880, { axis: "x", radius: 10 }),
            ...bars.flatMap((x) => [
              P("wood", x - 10, x + 10, -hd + 6, -hd + 26, 290, 840, { round: true }),
              P("wood", x - 10, x + 10, hd - 26, hd - 6, 290, 840, { round: true }),
            ]),
          ];
      return [
        ...[-hd, hd - post].flatMap((z) => pair(P("wood", -hw, -hw + post, z, z + post, 0, 900, { radius: 6 }))),
        P("wood", -hw, hw, -hd, hd, 240, 290),
        P("linen", -hw + post, hw - post, -hd + post, hd - post, 290, 400, { radius: 30 }),
        P("wool", -hw + post - 4, hw - post + 4, -hd + D * 0.38, hd - post, 330, 420, { axis: "x", radius: 30 }),
        ...sides,
      ];
    },
  },
  dresser: {
    names: ["dresser", "chest_of_drawers"],
    heightMm: 900,
    materials: ["wood", "wood_dark", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const cols = span(W >= 1000 ? 2 : 1, hw - 4, 4);
      const rows = run(86, 874, 4, 4);
      return [
        P("wood_dark", -hw + 20, hw - 20, -hd, hd - 40, 0, 80),
        P("wood", -hw, hw, -hd, hd - 18, 80, 880),
        P("wood", -hw, hw, -hd, hd, 880, 900, { radius: 6 }),
        ...cols.flatMap(([a, b]) => rows.map(([y0, y1]) => P("wood", a, b, hd - 18, hd - 6, y0, y1, { radius: 3 }))),
        ...cols.flatMap(([a, b]) =>
          rows.map(([y0, y1]) => pull((a + b) / 2, Math.min((b - a) * 0.18, 80), hd - 6, hd, (y0 + y1) / 2)),
        ),
      ];
    },
  },
  vanity: {
    names: ["vanity", "dressing_table"],
    heightMm: 1450,
    materials: ["wood", "cushion", "metal", "glass"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const top = 760;
      // `drawVanity`: a drawer pedestal at each end, the stool in the knee-hole between, and the
      // mirror standing on the table at the back.
      const p = Math.min(clamp(W * 0.25, 150, 400), W * 0.3);
      const rows = run(30, top - 31, 2, 6);
      const r = Math.min(hw - p - 20, 200, D * 0.35);
      // The mirror: a tall stadium standing on the top at the back, its ends fully rounded.
      const mw = Math.min(W * 0.28, 330);
      return [
        ...pair(P("wood", -hw, -hw + p, -hd, hd - 18, 0, top - 25)),
        ...rows.flatMap(([y0, y1]) => pair(P("wood", -hw + 4, -hw + p - 4, hd - 18, hd - 6, y0, y1, { radius: 3 }))),
        ...rows.flatMap(([y0, y1]) => pair(pull(-hw + p / 2, Math.min(p * 0.2, 60), hd - 6, hd, (y0 + y1) / 2))),
        P("wood", -hw, hw, -hd, hd, top - 25, top, { radius: 6 }),
        P("metal", -mw, mw, -hd, -hd + 12, top, 1450, { axis: "z", radius: mw }),
        P("glass", -mw + 12, mw - 12, -hd + 12, -hd + 18, top + 12, 1438, { axis: "z", radius: Math.max(1, mw - 12) }),
        P("cushion", -r, r, hd - 2 * r, hd, 420, 460, { round: true }),
        P("metal", -18, 18, hd - r - 18, hd - r + 18, 0, 420, { round: true }),
      ];
    },
  },
  fireplace: {
    names: ["fireplace"],
    heightMm: 1200,
    materials: ["wood", "stone", "metal", "rubber", "bark"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // `drawFireplace`: the breast across the back (62% of the depth), the hearth 8% narrower each
      // side projecting in front, and the firebox recessed into the breast's face.
      const zb = -hd + D * 0.62;
      const fw = Math.min(W * 0.5, 900) / 2;
      const fh = 620;
      const zr = zb - D * 0.62 * 0.55; // the firebox's back
      const zl = (zr + zb) / 2;
      return [
        P("stone", -hw + W * 0.08, hw - W * 0.08, -hd, hd, 0, 50),
        ...pair(P("stone", -hw, -fw, -hd, zb, 0, 1140)),
        P("stone", -fw, fw, -hd, zb, 50 + fh, 1140),
        P("rubber", -fw, fw, -hd, zr, 50, 50 + fh),
        P("metal", -fw * 0.7, fw * 0.7, zr + 10, zb - 20, 50, 100),
        P("bark", -fw * 0.56, fw * 0.56, zl - 40, zl + 20, 100, 160, { axis: "x", round: true }),
        P("bark", -fw * 0.46, fw * 0.46, zl - 10, zl + 50, 150, 205, { axis: "x", round: true }),
        P("wood", -hw, hw, -hd, zb + clamp(D * 0.08, 20, 60), 1140, 1200, { radius: 6 }),
      ];
    },
  },
  radiator: {
    names: ["radiator"],
    heightMm: 600,
    materials: ["metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const [y0, y1] = [150, 600];
      // Columns between a header at the top and at the bottom, fed by two pipes from the floor.
      const n = clamp(Math.round(W / 70), 3, 16);
      const cols = span(n, hw, Math.max(4, (W / n) * 0.3));
      const pz = Math.min(15, hd * 0.6);
      return [
        ...cols.map(([a, b]) => P("metal", a, b, -hd, hd, y0, y1, { radius: Math.min((b - a) * 0.45, D * 0.4, 20) })),
        P("metal", -hw, hw, -D * 0.15, D * 0.15, y0 + 20, y0 + 50, { axis: "x", round: true }),
        P("metal", -hw, hw, -D * 0.15, D * 0.15, y1 - 50, y1 - 20, { axis: "x", round: true }),
        ...pair(P("metal", -hw + 8, -hw + 30, -pz, pz, 0, y0 + 30, { round: true })),
        ...pair(P("metal", -hw + 2, -hw + 36, -pz - 6, pz + 6, 80, 125, { round: true })),
      ];
    },
  },
  sideboard: {
    names: ["sideboard", "buffet"],
    heightMm: 800,
    materials: ["wood", "wood_dark", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const leg = clamp(Math.min(W, D) * 0.06, 25, 40);
      const legs = [-hd + 30, hd - 50 - leg].flatMap((z) =>
        pair(P("wood_dark", -hw + 30, -hw + 30 + leg, z, z + leg, 0, 164, { radius: leg * 0.3 })),
      );
      const doors = span(clamp(Math.round(W / 450), 2, 4), hw - 4, 4);
      return [
        ...legs,
        P("wood", -hw, hw, -hd, hd - 18, 160, 780),
        P("wood", -hw, hw, -hd, hd, 780, 800, { radius: 6 }),
        ...doors.map(([a, b]) => P("wood_dark", a, b, hd - 18, hd - 6, 166, 774, { radius: 3 })),
        ...doors.map(([a, b]) => {
          const c = (a + b) / 2;
          return P("metal", c - 6, c + 6, hd - 6, hd, 470 - 90, 470 + 90, { radius: 3 });
        }),
      ];
    },
  },
  tv: {
    names: ["tv"],
    heightMm: 1700,
    hungFromTop: true,
    materials: ["metal", "screen", "rubber"],
    gen(W, D) {
      const [hw, hd, H] = [W / 2, D / 2, 1700];
      // `drawTv`: the panel on the FRONT edge, slim at any depth, its bracket behind it to the
      // wall. Hung by its top; 16:9 from its width, at most 760 tall.
      const slab = Math.min(D * 0.55, W * 0.06);
      const ph = clamp(W * 0.5625, 120, 760);
      const yc = H - ph / 2;
      const bh = Math.min(ph * 0.3, 150);
      return [
        P("metal", -W * 0.15, W * 0.15, -hd, hd - slab, yc - bh, yc + bh),
        P("rubber", -hw, hw, hd - slab, hd - 4, H - ph, H, { axis: "z", radius: 6 }),
        P("screen", -hw + 8, hw - 8, hd - 4, hd, H - ph + 8, H - 8, { axis: "z", radius: 3 }),
      ];
    },
  },
  coat_rack: {
    names: ["coat_rack"],
    heightMm: 1800,
    materials: ["wood", "wood_dark", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      const r = clamp(s * 0.045, 12, 22);
      const b = s * 0.22;
      // `drawCoatRack`: the round base, the pole, and four hook arms with a knob each; here on the
      // piece's axes rather than its diagonals (the arms reach the footprint's edges).
      return [
        P("wood_dark", -b, b, -b, b, 0, 25, { round: true }),
        P("wood", -r, r, -r, r, 25, 1760, { round: true }),
        P("wood", -r * 1.6, r * 1.6, -r * 1.6, r * 1.6, 1760, 1800, { round: true }),
        P("metal", -hw, hw, -7, 7, 1640, 1654, { axis: "x", round: true }),
        P("metal", -7, 7, -hd, hd, 1600, 1614, { axis: "z", round: true }),
        ...pair(P("wood_dark", -hw, -hw + 24, -12, 12, 1650, 1674, { round: true })),
        P("wood_dark", -12, 12, -hd, -hd + 24, 1610, 1634, { round: true }),
        P("wood_dark", -12, 12, hd - 24, hd, 1610, 1634, { round: true }),
      ];
    },
  },
  shoe_cabinet: {
    names: ["shoe_cabinet"],
    heightMm: 1000,
    materials: ["wood", "wood_dark", "metal"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // Tilt-out fronts, two high, one column per 600 mm, a long pull at the top of each.
      const cols = span(clamp(Math.round(W / 600), 1, 5), hw - 4, 4);
      const rows = run(66, 974, 2, 4);
      return [
        P("wood_dark", -hw + 15, hw - 15, -hd, hd - 30, 0, 60),
        P("wood", -hw, hw, -hd, hd - 18, 60, 980),
        P("wood", -hw, hw, -hd, hd, 980, 1000, { radius: 4 }),
        ...cols.flatMap(([a, b]) => rows.map(([y0, y1]) => P("wood", a, b, hd - 18, hd - 6, y0, y1, { radius: 3 }))),
        ...cols.flatMap(([a, b]) => rows.map(([, y1]) => pull((a + b) / 2, (b - a) * 0.38, hd - 6, hd, y1 - 34))),
      ];
    },
  },
  mirror: {
    names: ["mirror"],
    heightMm: 1900,
    mountMm: 1100,
    materials: ["metal", "glass"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      // Hung over a basin: a silvered back with softly rounded corners and the glass proud of it.
      const rad = clamp(W * 0.04, 6, 60);
      const e = clamp(W * 0.015, 4, 20);
      const zg = -hd + D * 0.4;
      return [
        P("metal", -hw, hw, -hd, zg, 1100, 1900, { axis: "z", radius: rad }),
        P("glass", -hw + e, hw - e, zg, hd, 1100 + e, 1900 - e, { axis: "z", radius: Math.max(1, rad - e) }),
      ];
    },
  },
  floor_lamp: {
    names: ["floor_lamp"],
    heightMm: 1650,
    materials: ["fabric", "metal"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      const p = clamp(Math.min(W, D) * 0.025, 6, 14);
      // `drawFloorLamp`: the drum shade over everything, open at the top where the light is, its
      // spider fitting (four struts to a finial) across the opening; the pole and base under it.
      const top = { x0: -rx * 0.92, x1: rx * 0.92, z0: -rz * 0.92, z1: rz * 0.92, round: true };
      return [
        P("metal", -rx * 0.62, rx * 0.62, -rz * 0.62, rz * 0.62, 0, 22, { round: true }),
        P("metal", -p, p, -p, p, 22, 1600, { round: true }),
        P("fabric", -rx, rx, -rz, rz, 1330, 1650, { round: true, holes: [top] }),
        P("metal", -rx * 0.92, rx * 0.92, -4, 4, 1612, 1620, { axis: "x", round: true }),
        P("metal", -4, 4, -rz * 0.92, rz * 0.92, 1612, 1620, { axis: "z", round: true }),
        P("metal", -rx * 0.13, rx * 0.13, -rz * 0.13, rz * 0.13, 1606, 1630, { round: true }),
      ];
    },
  },
  side_table: {
    names: ["side_table", "end_table"],
    heightMm: 550,
    materials: ["wood"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawSideTable`: a top with eased corners and, under it, the lower shelf, here carried
      // between the four legs.
      const leg = clamp(s * 0.06, 15, 40);
      const li = s * 0.06;
      return [
        ...[-hd + li, hd - li - leg].flatMap((z) =>
          pair(P("wood", -hw + li, -hw + li + leg, z, z + leg, 0, 525, { radius: leg * 0.3 })),
        ),
        P("wood", -hw + li + 4, hw - li - 4, -hd + li + 4, hd - li - 4, 150, 170, { radius: s * 0.03 }),
        P("wood", -hw, hw, -hd, hd, 525, 550, { radius: s * 0.08 }),
      ];
    },
  },
  console_table: {
    names: ["console_table"],
    heightMm: 800,
    materials: ["wood", "wood_dark"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawConsoleTable`: a long shallow top, the back rail along the wall edge, the stretcher
      // shelf under the top (0.12–0.88 of the length, 0.36–0.78 of the depth), slender legs.
      const leg = clamp(s * 0.08, 15, 40);
      const li = s * 0.04;
      return [
        ...[-hd + li, hd - li - leg].flatMap((z) =>
          pair(P("wood_dark", -hw + li, -hw + li + leg, z, z + leg, 0, 775, { radius: leg * 0.3 })),
        ),
        P("wood_dark", -hw + li + leg, hw - li - leg, -hd + li, -hd + li + 20, 680, 775),
        P("wood", -hw + W * 0.12, hw - W * 0.12, -hd + D * 0.36, -hd + D * 0.78, 160, 180, { radius: 6 }),
        P("wood_dark", -hw + li + leg, hw - li - leg, -6, 6, 150, 160),
        P("wood", -hw, hw, -hd, hd, 775, 800, { radius: s * 0.04 }),
      ];
    },
  },
  ottoman: {
    names: ["ottoman", "pouf", "footstool"],
    heightMm: 450,
    materials: ["fabric", "cushion"],
    gen(W, D) {
      const [hw, hd] = [W / 2, D / 2];
      const s = Math.min(W, D);
      // `drawOttoman`: an upholstered block with eased corners, its padded top inset from the welt,
      // and the tufting: `2 x side / short side` buttons each way, `[2, 6]`, centred by
      // construction (the numerator negates exactly for a button's mirror partner).
      const t = s * 0.09;
      const [tw, td] = [W - 2 * t, D - 2 * t];
      const nx = clamp(Math.round((2 * W) / s), 2, 6);
      const nz = clamp(Math.round((2 * D) / s), 2, 6);
      const b = clamp(s * 0.025, 4, 14);
      const buttons: Part[] = [];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const ox = (tw * 0.8 * (2 * i + 1 - nx)) / (2 * nx);
          const oz = (td * 0.8 * (2 * j + 1 - nz)) / (2 * nz);
          buttons.push(P("fabric", ox - b, ox + b, oz - b, oz + b, 430, 450, { round: true }));
        }
      }
      return [
        P("fabric", -hw + 20, hw - 20, -hd + 20, hd - 20, 0, 40, { radius: Math.max(1, s * 0.16 - 20) }),
        P("fabric", -hw, hw, -hd, hd, 40, 400, { radius: s * 0.16 }),
        P("cushion", -hw + t * 0.5, hw - t * 0.5, -hd + t * 0.5, hd - t * 0.5, 400, 440, { radius: s * 0.12 }),
        ...buttons,
      ];
    },
  },
  bean_bag: {
    names: ["bean_bag"],
    heightMm: 750,
    materials: ["fabric", "cushion"],
    gen(W, D) {
      const [rx, rz] = [W / 2, D / 2];
      // `drawBeanBag`: a soft, nearly round sack, the raised back at the top edge (−z) as a
      // mound, and the hollow a body sits in in front of it.
      const zb = -rz + D * 0.28;
      const zs = -rz + D * 0.6;
      return [
        ...dome("fabric", 0, 0, rx, rz, 0, 400, MOUND),
        ...dome("fabric", 0, zb, rx * 0.76, D * 0.24, 280, 750, HEMI),
        P("cushion", -rx * 0.42, rx * 0.42, zs - D * 0.15, zs + D * 0.15, 372, 410, { round: true }),
      ];
    },
  },
};
