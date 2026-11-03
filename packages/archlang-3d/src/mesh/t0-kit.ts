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
  materials: readonly Exclude<MaterialSlot, "body">[];
  /**
   * The piece is NOT its own mirror image across its width (an L-sofa's return, a chaise's one
   * arm, a grand piano's bent side). The core draws each of these families handed too, so the
   * model gains no hand the drawing lacks; a reflected piece (its own `mirror`, or a reflecting
   * `place`) is built reflected (`Furniture.mirror`).
   */
  handed?: true;
  gen: (W: number, D: number) => Part[];
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

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
  const n = Math.max(1, Math.round(W / 600));
  for (const [a, b] of span(n, hw - 2, 4)) {
    out.push(P("paint", a, b, hd - 40, fz, 106, top - 8));
    const pw = Math.min((b - a) * 0.45, 160) / 2;
    const c = (a + b) / 2;
    out.push(P("metal", c - pw, c + pw, fz, hd - 8, top - 60, top - 46, { axis: "x", round: true }));
  }
  return out;
}
