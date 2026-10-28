/**
 * T0 parametric furniture (archlang-3d plan §4.4, §5.1–5.3; card A2b): pure generators that build
 * a piece from a few boxes, rounded parts and plates with holes, fitted EXACTLY to the plan's
 * footprint. The twelve families laneway-house uses have one each; every other family stays a grey
 * box. Each generator is mirror-symmetric across its own width, so a mirrored piece (`place …
 * mirror`) needs no mirrored mesh and nothing gains handedness.
 *
 * Local frame (plan §3.4, §4.4): origin at the footprint's centre on the floor finish; +x along
 * the piece's width, +z its FRONT (an unturned piece faces plan +y, down the page), heights up.
 * The plan's `rotate` turns it clockwise on the page; widths and depths are fitted (the footprint
 * is never stretched in height: heights are fixed defaults, in the ledger). Lengths in mm here,
 * micrometres once placed.
 */
import type { Furniture, Polygon, Pt } from "../scene3d/types.js";

/** One part: a plan rectangle (or the ellipse inscribed in it) from `y0` to `y1` above the floor,
 *  optionally with holes (a worktop around its sink). Millimetres, local frame. */
export interface Part {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  round?: boolean;
  holes?: Array<Omit<Part, "y0" | "y1" | "holes">>;
}

/** The families with a generator, each with the catalogue names it answers to (plan §5.2). */
export const T0_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  bed: ["bed"],
  sofa: ["sofa", "couch"],
  table: ["table", "dining_table"],
  rug: ["rug", "carpet"],
  wardrobe: ["wardrobe", "robe", "closet"],
  fridge: ["fridge", "refrigerator"],
  counter: ["counter", "worktop"],
  kitchen_sink: ["kitchen_sink"],
  stove: ["stove", "hob", "cooktop"],
  shower: ["shower"],
  wc: ["wc", "toilet"],
  basin: ["basin", "lavatory"],
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
  rug: 15,
  wardrobe: 2100,
  fridge: 1800,
  counter: 900,
  kitchen_sink: 900,
  stove: 910,
  shower: 60,
  wc: 800,
  basin: 850,
};

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): Part => ({
  x0,
  x1,
  z0,
  z1,
  y0,
  y1,
});

/** Plinth, carcass and worktop: the kitchen run's body (900 mm worktop, 100 mm recessed plinth). */
function cabinet(W: number, D: number, hole?: Part["holes"]): Part[] {
  const [hw, hd] = [W / 2, D / 2];
  const top = 900;
  return [
    box(-hw, hw, -hd, hd - 60, 0, 100),
    box(-hw, hw, -hd, hd - 20, 100, hole ? 700 : top - 30),
    ...(hole ? [{ ...box(-hw, hw, -hd, hd, 700, top), holes: hole }] : [box(-hw, hw, -hd, hd, top - 30, top)]),
  ];
}

/** Each generator: the piece's width W and depth D (mm, local frame) → its parts. */
const GENERATORS: Readonly<Record<string, (W: number, D: number) => Part[]>> = {
  bed(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const hb = clamp(D * 0.04, 20, 80);
    const head = -hd + hb;
    const n = W >= 1200 ? 2 : 1;
    const gap = 60;
    const pw = (W - 60 - (n + 1) * gap) / n;
    const pd = clamp(D * 0.18, 100, 350);
    return [
      box(-hw, hw, -hd, head, 0, 1000),
      box(-hw, hw, head, hd, 0, 300),
      box(-hw + 30, hw - 30, head, hd - 30, 300, 520),
      ...Array.from({ length: n }, (_, k) => {
        const x0 = -hw + 30 + gap + k * (pw + gap);
        return box(x0, x0 + pw, head + 60, head + 60 + pd, 520, 620);
      }),
    ];
  },
  sofa(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const arm = clamp(W * 0.08, 60, Math.min(250, W * 0.2));
    const back = clamp(D * 0.22, 60, Math.min(250, D * 0.3));
    return [
      box(-hw, -hw + arm, -hd, hd, 0, 600),
      box(hw - arm, hw, -hd, hd, 0, 600),
      box(-hw + arm, hw - arm, -hd, -hd + back, 0, 800),
      box(-hw + arm, hw - arm, -hd + back, hd, 0, 280),
      box(-hw + arm + 10, hw - arm - 10, -hd + back, hd - 20, 280, 420),
    ];
  },
  table(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const leg = clamp(Math.min(W, D) * 0.06, 20, 60);
    const ins = clamp(Math.min(W, D) * 0.04, 0, 40);
    const legs = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => {
        const x = sx < 0 ? -hw + ins : hw - ins - leg;
        const z = sz < 0 ? -hd + ins : hd - ins - leg;
        return box(x, x + leg, z, z + leg, 0, 720);
      }),
    );
    return [box(-hw, hw, -hd, hd, 720, 750), ...legs];
  },
  rug: (W, D) => [box(-W / 2, W / 2, -D / 2, D / 2, 0, 15)],
  wardrobe(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const n = Math.max(1, Math.round(W / 600));
    const each = W / n;
    const doors = Array.from({ length: n }, (_, k) =>
      box(-hw + k * each + 2, -hw + (k + 1) * each - 2, hd - 20, hd, 20, 2080),
    );
    return [box(-hw, hw, -hd, hd - 20, 0, 2100), ...doors];
  },
  fridge(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    return [
      box(-hw, hw, -hd, hd - 30, 0, 1800),
      box(-hw + 5, hw - 5, hd - 30, hd, 10, 1190),
      box(-hw + 5, hw - 5, hd - 30, hd, 1210, 1790),
    ];
  },
  counter: (W, D) => cabinet(W, D),
  kitchen_sink(W, D) {
    const ix = W / 2 - clamp(W * 0.15, 40, 120);
    const iz = D / 2 - clamp(D * 0.2, 40, 120);
    return cabinet(W, D, [{ x0: -ix, x1: ix, z0: -iz, z1: iz }]);
  },
  stove(W, D) {
    const r = Math.min(W, D) * 0.12;
    const burners = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => ({
        ...box(sx * W * 0.22 - r, sx * W * 0.22 + r, sz * D * 0.2 - r, sz * D * 0.2 + r, 900, 910),
        round: true,
      })),
    );
    return [...cabinet(W, D), ...burners];
  },
  shower(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const rim = clamp(Math.min(W, D) * 0.06, 10, 50);
    return [
      box(-hw, hw, -hd, hd, 0, 30),
      { ...box(-hw, hw, -hd, hd, 30, 60), holes: [{ x0: -hw + rim, x1: hw - rim, z0: -hd + rim, z1: hd - rim }] },
    ];
  },
  wc(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    const tank = clamp(D * 0.26, 40, 200);
    return [
      box(-hw, hw, -hd, -hd + tank, 380, 800),
      { ...box(-hw * 0.6, hw * 0.6, -hd + tank * 0.5, hd - D * 0.15, 0, 380), round: true },
      { ...box(-hw, hw, -hd + tank * 0.8, hd, 300, 400), round: true },
    ];
  },
  basin(W, D) {
    const [hw, hd] = [W / 2, D / 2];
    return [
      box(-hw + 20, hw - 20, -hd, hd - 40, 0, 780),
      {
        ...box(-hw, hw, -hd, hd, 780, 850),
        holes: [{ x0: -hw * 0.6, x1: hw * 0.6, z0: -hd + D * 0.25, z1: hd - D * 0.15, round: true }],
      },
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

/** A part's plan outline in local millimetres, rounded to whole micrometres. */
function outline(p: { x0: number; x1: number; z0: number; z1: number; round?: boolean }): Pt[] {
  const um = (v: number): number => Math.round(v * 1000);
  if (!p.round) {
    return [
      [um(p.x0), um(p.z0)],
      [um(p.x1), um(p.z0)],
      [um(p.x1), um(p.z1)],
      [um(p.x0), um(p.z1)],
    ];
  }
  const [cx, cz, rx, rz] = [(p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, (p.x1 - p.x0) / 2, (p.z1 - p.z0) / 2];
  return C16.map((c, k) => [um(cx + rx * c), um(cz + rz * (S16[k] as number))]);
}

/** A quarter turn's (cos, sin), exact; `null` for any other angle. */
function quarter(rotateDeg: number): [number, number] | null {
  const r = ((rotateDeg % 360) + 360) % 360;
  return r === 0 ? [1, 0] : r === 90 ? [0, 1] : r === 180 ? [-1, 0] : r === 270 ? [0, -1] : null;
}

export interface PlacedPart {
  polygon: Polygon;
  /** Above the floor finish, µm. */
  y0: number;
  y1: number;
}

/**
 * `f`'s T0 parts, placed in plan micrometres: `null` when its asset is not T0 or its turn is not a
 * quarter turn (the grey box stands instead). The plan's `rotate` (clockwise on the page, y down)
 * maps local (x, z) to plan (x cos r − z sin r, x sin r + z cos r) about the footprint's centre; at
 * a quarter turn the piece's own width runs along plan y (`Furniture.size` is the turned box).
 */
export function t0Parts(f: Furniture): PlacedPart[] | null {
  const family = f.asset.startsWith("t0:") ? f.asset.slice(3) : undefined;
  const gen = family ? GENERATORS[family] : undefined;
  const cs = quarter(-f.yawDeg);
  if (!gen || !cs) return null;
  const [c, s] = cs;
  const turned = s !== 0;
  const W = (turned ? f.size.d : f.size.w) / 1000;
  const D = (turned ? f.size.w : f.size.d) / 1000;
  const [cx, cy] = f.centre;
  const place = (r: Pt[]): Pt[] => r.map(([x, z]) => [cx + x * c - z * s, cy + x * s + z * c]);
  return gen(W, D).map((p) => ({
    polygon: {
      outer: place(outline(p)),
      ...(p.holes?.length ? { holes: p.holes.map((h) => place(outline(h))) } : {}),
    },
    y0: Math.round(p.y0 * 1000),
    y1: Math.round(p.y1 * 1000),
  }));
}
