/**
 * The T0 kit (visual-assets V2, V5, V6): the part type every generator returns and the few helpers
 * the generators share, kept apart from `t0.ts` so the batch modules (`t0-living.ts`,
 * `t0-utility.ts`) and `t0.ts` itself read them without an import cycle. Local frame and units:
 * `t0.ts`.
 */
import type { MaterialSlot } from "../materials.js";

/** A section's shape inside its box: a box, the inscribed ellipse, rounded corners, or a polygon. */
export interface SectionShape {
  /** The ellipse inscribed in the box (a 16-gon). */
  round?: boolean;
  /** Rounded corners of this radius (mm; clamped to half the shorter side): quarter arcs. */
  radius?: number;
  /**
   * An explicit polygon, each point a FRACTION of the box ([0, 1] on each axis, from its low
   * corner; a point outside throws): a chaise's curve, a leaning cushion. It should touch all four
   * sides of the box. It overrides `round` and `radius`.
   */
  profile?: ReadonlyArray<readonly [number, number]>;
}

/**
 * One part, millimetres, local frame: the box `x0..x1` × `y0..y1` (above the floor) × `z0..z1`.
 * Its section lies across the extrusion: plan (x, z) when vertical, (z, y) for `axis: "x"`,
 * (x, y) for `axis: "z"`.
 */
export interface Part extends SectionShape {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  /** Its material slot; omitted = `body` (the furniture kind's own colour). */
  mat?: MaterialSlot;
  /** Extruded sideways: along the width (`x`: a bolster, a rail) or the depth (`z`: an arm). */
  axis?: "x" | "z";
  /** Holes through a vertical part's plan section (a worktop around its sink); a sideways part with holes throws. */
  holes?: Array<SectionShape & { x0: number; x1: number; z0: number; z1: number }>;
}

/**
 * One T0 family as a batch module declares it: the catalogue names it answers to (every alias of
 * the core's family row), its ledgered height (the tallest point, mm), the underside of a
 * wall-hung piece (`mountMm`: nothing is drawn below it and it is never carried down to the
 * floor), its material slots in `MATERIAL_SLOTS` order, whether it is handed, and its generator.
 */
export interface T0Family {
  names: readonly string[];
  heightMm: number;
  mountMm?: number;
  /**
   * Hung by its TOP at `heightMm`, its underside a function of its size (a television: a 16:9
   * panel from its width). Nothing is carried down to the floor; the mesh builder ledgers each
   * piece's own underside, never one figure for the family.
   */
  hungFromTop?: true;
  materials: readonly Exclude<MaterialSlot, "body">[];
  /**
   * The piece is NOT its own mirror image across its width (an L-sofa's return, a chaise's one
   * arm, a grand piano's bent side). The core draws each of these families handed too, so the
   * model gains no hand the drawing lacks; a reflected piece (its own `mirror`, or a reflecting
   * `place`) is built reflected (`Furniture.mirror`).
   *
   * A function says at which sizes the piece is handed, for a family the core reads off its own
   * long axis (`axisPt`, glyphs-outdoor.ts): a bicycle laid along its width has its front at the
   * right, one stood along its depth is symmetric across its width (card V7). At every other size
   * the generator is mirror-symmetric, so a reflection of it changes nothing.
   */
  handed?: true | ((W: number, D: number) => boolean);
  gen: (W: number, D: number) => Part[];
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * `v` held to 1/64 mm: a box measure under a profile whose points are multiples of 1/64 of the box
 * (a chair's side view, a mailbox's tunnel), so every point is exact and lands on its mirror
 * partner's negation even at a micrometre rounding tie.
 */
export const snap64 = (v: number): number => Math.round(v * 64) / 64;

/** The most doors a run is divided into, as the core caps a symbol's divisions (bounded output). */
export const MAX_DOORS = 64;

/** A part on the box `x0..x1` × `z0..z1` × `y0..y1` in slot `mat`, with any further fields. */
export const P = (
  mat: MaterialSlot,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  more: Partial<Part> = {},
): Part => ({ x0, x1, z0, z1, y0, y1, mat, ...more });

/**
 * `n` intervals across `[-half, half]`, `gap` apart, symmetric by construction: interval `n-1-k`
 * is interval `k` negated exactly, so a row of doors or cushions is its own mirror image.
 */
export function span(n: number, half: number, gap: number): Array<[number, number]> {
  const each = (2 * half - (n - 1) * gap) / n;
  const out: Array<[number, number]> = new Array(n);
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const a = -half + k * (each + gap);
    const b = a + each;
    out[k] = [a, b];
    out[n - 1 - k] = [-b, -a];
  }
  if (n % 2 === 1) out[(n - 1) / 2] = [-each / 2, each / 2];
  return out;
}

/** The part and its mirror across the width (x → −x), exact. */
export const pair = (p: Part): Part[] => [p, { ...p, x0: -p.x1, x1: -p.x0 }];

/**
 * The sofa's body (V3) with arms `arm` wide and `seats` cushions (by default one per 0.62 depths of
 * seat, `[1, 4]`, as the plan's `drawSofa`): the sofa, the loveseat (two) and the armchair (one,
 * broader arms) are one construction, as `seatBody` makes them one drawing in the core.
 */
export function upholstered(W: number, D: number, arm: number, seats?: number): Part[] {
  const [hw, hd] = [W / 2, D / 2];
  const back = clamp(D * 0.18, 110, 220);
  const legH = 80;
  const seat = 280;
  const inner = hw - arm;
  const n = seats ?? clamp(Math.round((2 * inner) / (0.62 * Math.min(D, 1000))), 1, 4);
  const cushions = span(n, inner - 6, 12);
  const backCush = clamp((hd * 2 - back) * 0.24, 90, 200);
  const leg = 40;
  const legs = [-hd + 30, hd - 30 - leg].flatMap((z) =>
    pair(P("wood_dark", -hw + 30, -hw + 30 + leg, z, z + leg, 0, legH)),
  );
  return [
    ...legs,
    P("fabric", -inner, inner, -hd, hd - 10, legH, seat),
    ...pair(P("fabric", -hw, -inner, -hd, hd, legH, 620, { axis: "z", radius: Math.min(arm * 0.45, 70) })),
    P("fabric", -inner, inner, -hd, -hd + back, legH, 800, { axis: "x", radius: Math.min(back * 0.45, 70) }),
    ...cushions.map(([a, b]) =>
      P("cushion", a, b, -hd + back + 4, hd - 4, seat, seat + 150, { axis: "x", radius: 50 }),
    ),
    ...cushions.map(([a, b]) =>
      P("cushion", a, b, -hd + back, -hd + back + backCush, seat + 150, 760, {
        axis: "x",
        profile: BACK_CUSHION,
      }),
    ),
  ];
}

/** A back cushion's section (z, y): leaning back from its seat, its top rounded over. */
export const BACK_CUSHION: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0.55, 0.96],
  [0.35, 1],
  [0, 0.9],
];

/**
 * A chair seen side-on (V7), fractions of its box, multiples of 1/64 (so a mirrored chair's points
 * land on its partner's): u from its back (0) to its front (1), v from the floor (0) to its top
 * (1): the back post rising from the floor, the seat at 29/64–34/64 of the height, the front leg.
 * Extruded across the chair's width it is a sled-base chair: the two leg panels, the seat, the back.
 */
export const SIDE_CHAIR: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [6 / 64, 0],
  [6 / 64, 29 / 64],
  [58 / 64, 29 / 64],
  [58 / 64, 0],
  [1, 0],
  [1, 34 / 64],
  [6 / 64, 34 / 64],
  [6 / 64, 1],
  [0, 1],
];

/** Where a chair's back is: toward −z (it faces +z), +z, −x or +x. */
export type ChairBack = "-z" | "+z" | "-x" | "+x";

/**
 * The side-view polygon `profile` (u from the back) set in the box `x0..x1` × `z0..z1` × `y0..y1`
 * with its back toward `back`: extruded across the chair's own width (`axis`), the profile flipped
 * end for end when the back is on the box's high side. A chair at `-x` and one at `+x` built on
 * mirrored boxes are each other's reflection.
 */
export function sideways(
  mat: MaterialSlot,
  box: { x0: number; x1: number; z0: number; z1: number },
  y0: number,
  y1: number,
  back: ChairBack,
  profile: ReadonlyArray<readonly [number, number]>,
): Part {
  const flip = back === "+z" || back === "+x";
  return P(mat, box.x0, box.x1, box.z0, box.z1, y0, y1, {
    axis: back === "-z" || back === "+z" ? "x" : "z",
    profile: flip ? profile.map(([u, v]): readonly [number, number] => [1 - u, v]) : profile,
  });
}

/**
 * The seats round a patio or meeting table (`drawOutdoorTable`, `drawMeetingTable`): the declared
 * footprint is the whole seating zone, the top inset a chair band (0.22 of the short side), a
 * chair 0.9 of the band wide in the band, its front at the top's edge. A round top seats one a
 * side; a long one `perSide` along each long side (centred by construction, so the row is its own
 * mirror image) and one at each end. `chair` builds one chair in its box, back toward `back`.
 */
export function tableSeats(
  W: number,
  D: number,
  round: boolean,
  perSide: number,
  chair: (box: { x0: number; x1: number; z0: number; z1: number }, back: ChairBack) => Part[],
): Part[] {
  const [hw, hd] = [W / 2, D / 2];
  const band = snap64(Math.min(W, D) * 0.22);
  const cw = snap64(band * 0.9);
  const out: Part[] = [];
  const zSide = (x: number): void => {
    out.push(...chair({ x0: x - cw / 2, x1: x + cw / 2, z0: -hd, z1: -hd + band }, "-z"));
    out.push(...chair({ x0: x - cw / 2, x1: x + cw / 2, z0: hd - band, z1: hd }, "+z"));
  };
  const xSide = (z: number): void => {
    out.push(...chair({ x0: -hw, x1: -hw + band, z0: z - cw / 2, z1: z + cw / 2 }, "-x"));
    out.push(...chair({ x0: hw - band, x1: hw, z0: z - cw / 2, z1: z + cw / 2 }, "+x"));
  };
  if (round) {
    zSide(0);
    xSide(0);
    return out;
  }
  const horizontal = W >= D;
  const run = horizontal ? W - 2 * band : D - 2 * band;
  for (let i = 0; i < perSide; i++) {
    // `(2i + 1 − n)` negates exactly for the partner `n − 1 − i`: the row is symmetric.
    const c = (run * (2 * i + 1 - perSide)) / (2 * perSide);
    if (horizontal) zSide(c);
    else xSide(c);
  }
  if (horizontal) xSide(0);
  else zSide(0);
  return out;
}

/**
 * A dome as round tiers, each `[top of the tier as a fraction of the height, its radius as a
 * fraction of the half-extents]`. The tables (`t0-outdoor.ts`) slice an ellipsoid at equal steps of latitude
 * (15°), so the tiers thin out toward the top and the dome rounds over instead of stepping like a
 * cake; the radii are cos(mid-latitude), the widest scaled to 1, written out (no engine's
 * `Math.cos` reaches a coordinate).
 */
export type DomeTable = ReadonlyArray<readonly [number, number]>;

/** A mound sitting on the ground: the ellipsoid from 30° below its equator (a shrub). */
export const MOUND: DomeTable = [
  [0.161, 0.932],
  [0.333, 1],
  [0.506, 1],
  [0.667, 0.932],
  [0.805, 0.8],
  [0.911, 0.614],
  [0.977, 0.386],
  [1, 0.132],
];

/** A hemisphere: the ellipsoid from its equator to its top (a bean bag's raised back). */
export const HEMI: DomeTable = [
  [0.259, 1],
  [0.5, 0.932],
  [Math.SQRT1_2, 0.8],
  [0.866, 0.614],
  [0.966, 0.386],
  [1, 0.132],
];

/** The dome `table` from `y0` to `y1` over the half-extents `rx`, `rz`, centred on (`cx`, `cz`). */
export function dome(
  mat: MaterialSlot,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  y0: number,
  y1: number,
  table: DomeTable,
): Part[] {
  let lo = y0;
  return table.map(([t, f], k) => {
    const hi = k === table.length - 1 ? y1 : y0 + (y1 - y0) * t;
    const p = P(mat, cx - rx * f, cx + rx * f, cz - rz * f, cz + rz * f, lo, hi, { round: true });
    lo = hi;
    return p;
  });
}

/**
 * Plinth, carcass with its fronts and pulls, and worktop: the kitchen run's body (900 mm worktop,
 * 100 mm recessed plinth). `hole` cuts the worktop (a sink); `carcassTop` stops the carcass lower
 * (under a sink's bowl); `fronts: false` leaves the front to the caller (an oven door).
 */
export function cabinet(
  W: number,
  D: number,
  opts: { hole?: Part["holes"]; carcassTop?: number; fronts?: boolean } = {},
): Part[] {
  const [hw, hd] = [W / 2, D / 2];
  const top = 870;
  const fz = hd - 22;
  const out: Part[] = [
    P("rubber", -hw, hw, -hd, hd - 70, 0, 100),
    P("paint", -hw, hw, -hd, hd - 40, 100, opts.carcassTop ?? top),
    P("stone", -hw, hw, -hd, hd, top, 900, opts.hole ? { holes: opts.hole } : {}),
  ];
  if (opts.fronts === false) return out;
  // One door per 600 mm, at most 64, as the core caps a run's divisions.
  const n = clamp(Math.round(W / 600), 1, MAX_DOORS);
  for (const [a, b] of span(n, hw - 2, 4)) {
    out.push(P("paint", a, b, hd - 40, fz, 106, top - 8));
    const pw = Math.min((b - a) * 0.45, 160) / 2;
    const c = (a + b) / 2;
    out.push(P("metal", c - pw, c + pw, fz, hd - 8, top - 60, top - 46, { axis: "x", round: true }));
  }
  return out;
}
