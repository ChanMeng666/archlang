/**
 * The dihedral group D4 — the eight symmetries of a square: four quarter-turns and four
 * axis reflections — with ONE encoding and ONE normal form.
 *
 * Every rectilinear direction fact in the compiler is an action of this group: a `place`
 * frame's linear part, a fixture's quarter-turn and back edge, a rail edge, a facade side,
 * a compass letter. They used to be re-encoded site by site as switches and look-up
 * tables; this module is the one place the group and its actions live.
 *
 * **Conventions.** Page coordinates: +x right, +y DOWN. So the generator `R` is a quarter
 * turn CLOCKWISE on screen, `(x, y) ↦ (−y, x)`, and `Fx` negates x, `(x, y) ↦ (−x, y)`.
 * **Normal form:** every element is `R^k · Fx^f` (reflect first, then turn) — exactly the
 * `(rotate, mirror x)` pair `frame.ts`'s `composeFrame` re-derives for `describe()`.
 * `mirror y` is not a new element: `Fy = R² · Fx`.
 *
 * A domain-free LEAF: it imports nothing at runtime and only types from `../ast.js`
 * (`test/algebra-leaf.test.ts`). Everything is integer table arithmetic — no trig, and
 * every table is written with literal zeros, so no `-0` is ever introduced here.
 */

import type { NorthDir } from "../ast.js";

/** A quarter-turn count, CLOCKWISE on screen (+y down). */
export type QuarterTurn = 0 | 1 | 2 | 3;

/** One element of D4 in normal form: `R^k · Fx^f`. */
export interface D4 {
  readonly k: QuarterTurn;
  readonly f: 0 | 1;
}

/** A 2×2 matrix `[a, b, c, d]`, row-major: `(x, y) ↦ (a·x + b·y, c·x + d·y)`. */
export type Mat2 = readonly [number, number, number, number];

const el = (k: QuarterTurn, f: 0 | 1): D4 => Object.freeze({ k, f });

/** The eight elements, rotations first: index `4·f + k`. */
export const D4_ELEMENTS: readonly D4[] = Object.freeze([
  el(0, 0),
  el(1, 0),
  el(2, 0),
  el(3, 0),
  el(0, 1),
  el(1, 1),
  el(2, 1),
  el(3, 1),
]);

/** The canonical (frozen) element for `(k, f)`. */
const at = (k: QuarterTurn, f: 0 | 1): D4 => D4_ELEMENTS[4 * f + k]!;

/** The identity. */
export const D4_IDENTITY: D4 = at(0, 0);
/** The half-turn `R²` — the map that sends every side and letter to its opposite. */
export const D4_HALF_TURN: D4 = at(2, 0);

/** `R^k · Fx^f` as a matrix, indexed `4·f + k`. Literal zeros: no `-0` is introduced. */
const MATRICES: readonly Mat2[] = [
  [1, 0, 0, 1],
  [0, -1, 1, 0], // R: (x,y) → (−y, x)
  [-1, 0, 0, -1],
  [0, 1, -1, 0], // R³: (x,y) → (y, −x)
  [-1, 0, 0, 1], // Fx
  [0, -1, -1, 0],
  [1, 0, 0, -1], // R²·Fx = Fy
  [0, 1, 1, 0],
];

/** The quarter-turn count of a degree spelling; anything but 90/180/270 reads as `0`. */
function turnsOf(rotate: number): QuarterTurn {
  switch (rotate) {
    case 90:
      return 1;
    case 180:
      return 2;
    case 270:
      return 3;
    default:
      return 0;
  }
}

/**
 * The element a `place` spelling denotes, with `makeFrame`'s semantics: reflect in the
 * component's own axes, then turn (`R · Mir`). `mirror y` is `R² · Fx`.
 */
export function fromSpelling(rotate: 0 | 90 | 180 | 270, mirror?: "x" | "y"): D4 {
  const k = turnsOf(rotate);
  if (mirror === "x") return at(k, 1);
  if (mirror === "y") return at(((k + 2) % 4) as QuarterTurn, 1);
  return at(k, 0);
}

/** The normal-form spelling: `rotate k·90`, plus `mirror x` when the element reflects. */
export function toSpelling(g: D4): { rotate: 0 | 90 | 180 | 270; mirror?: "x" } {
  const rotate = (g.k * 90) as 0 | 90 | 180 | 270;
  return g.f ? { rotate, mirror: "x" } : { rotate };
}

/** The element's matrix (a fresh tuple). */
export function toMatrix(g: D4): Mat2 {
  const m = MATRICES[4 * g.f + g.k]!;
  return [m[0], m[1], m[2], m[3]];
}

/**
 * The element a signed-permutation matrix denotes, or `null` when the matrix is not one
 * of the eight. Compared with `===`, so a `-0` entry (which `makeFrame`'s column scale
 * produces) reads as `0`.
 */
export function fromMatrix(m: Mat2): D4 | null {
  for (let i = 0; i < 8; i++) {
    const t = MATRICES[i]!;
    if (t[0] === m[0] && t[1] === m[1] && t[2] === m[2] && t[3] === m[3]) return D4_ELEMENTS[i]!;
  }
  return null;
}

/**
 * The product `g · h` — apply `h` first, then `g`. In normal form, from
 * `Fx · R^b = R^(−b) · Fx`: `R^a Fx^f · R^b Fx^e = R^(a ± b) · Fx^(f ⊕ e)`.
 */
export function compose(g: D4, h: D4): D4 {
  const b = g.f ? (4 - h.k) % 4 : h.k;
  return at(((g.k + b) % 4) as QuarterTurn, (g.f ^ h.f) as 0 | 1);
}

/** The inverse: a rotation turns back; every reflection is its own inverse. */
export function inverse(g: D4): D4 {
  return g.f ? g : at(((4 - g.k) % 4) as QuarterTurn, 0);
}

/** `+1` for a rotation, `−1` for a reflection. */
export function det(g: D4): 1 | -1 {
  return g.f ? -1 : 1;
}

/** Act on a vector by the element's matrix. */
export function applyVec(g: D4, v: { x: number; y: number }): { x: number; y: number } {
  const [a, b, c, d] = MATRICES[4 * g.f + g.k]!;
  return { x: a * v.x + b * v.y, y: c * v.x + d * v.y };
}

// ---------------------------------------------------------------------------
// Sides of an axis-aligned rectangle — its four outward normals
// ---------------------------------------------------------------------------

/** A side of an axis-aligned rectangle (= fixture-orientation's `RectEdge`, the AST's
 *  `RailSide`, the facade model's `Side`). `top` is −y (the page's top). */
export type Side = "top" | "right" | "bottom" | "left";

/** The four sides, clockwise from the top. */
export const SIDES_CW: readonly Side[] = Object.freeze(["top", "right", "bottom", "left"] as const);

/** The outward unit normal of each side, in page terms (+x right, +y down). */
export const SIDE_NORMAL: Readonly<Record<Side, Readonly<{ x: number; y: number }>>> = Object.freeze({
  top: Object.freeze({ x: 0, y: -1 }),
  bottom: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});

/** The side whose outward normal is exactly `v`, or `null` when `v` is not a unit axis vector. */
export function sideOfNormal(v: { x: number; y: number }): Side | null {
  for (const s of SIDES_CW) {
    const n = SIDE_NORMAL[s];
    if (n.x === v.x && n.y === v.y) return s;
  }
  return null;
}

/** The side `s` becomes under `g`: its normal pushed through the matrix, read back. */
export function actOnSide(g: D4, s: Side): Side {
  return sideOfNormal(applyVec(g, SIDE_NORMAL[s]))!;
}

const OPPOSITE_SIDE: Readonly<Record<Side, Side>> = Object.freeze({
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
});

/** The opposite side — the half-turn's action. */
export function oppositeSide(s: Side): Side {
  return OPPOSITE_SIDE[s];
}

// ---------------------------------------------------------------------------
// Compass letters — the same four directions, named N/E/S/W
// ---------------------------------------------------------------------------

/** A direction letter; on the PAGE, `N` is toward the top of the drawing. */
export type Letter = "N" | "E" | "S" | "W";

/** The four letters in CLOCKWISE order from the top — the index space `toCompass` turns in. */
export const LETTERS_CW: readonly Letter[] = Object.freeze(["N", "E", "S", "W"] as const);

const LETTER_SIDE: Readonly<Record<Letter, Side>> = Object.freeze({ N: "top", E: "right", S: "bottom", W: "left" });
const SIDE_LETTER: Readonly<Record<Side, Letter>> = Object.freeze({ top: "N", right: "E", bottom: "S", left: "W" });

/** The page letter `l` becomes under `g`. */
export function actOnLetter(g: D4, l: Letter): Letter {
  return SIDE_LETTER[actOnSide(g, LETTER_SIDE[l])];
}

/**
 * Turn a PAGE-relative letter into a true COMPASS letter, given the plan's north as
 * clockwise quarter-turns from the page top. A page direction `i` quarter-turns clockwise
 * of the top is `i − turns` quarter-turns clockwise of NORTH — the action of `R^(−turns)`.
 */
export function toCompass(page: Letter, turns: QuarterTurn): Letter {
  const i = LETTERS_CW.indexOf(page);
  return LETTERS_CW[(i - turns + 4) % 4] as Letter;
}

// ---------------------------------------------------------------------------
// Quarter-turns in degrees — a fixture's facing
// ---------------------------------------------------------------------------

/** Normalise degrees into `[0, 360)` — EXACTLY `((x % 360) + 360) % 360`. */
export function mod360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/**
 * The unit vector a fixture's BACK points along at quarter-turn `d` — the drawn symbol
 * starts back-north and turns clockwise. A non-quarter value (or `NaN`) reads as `0`.
 */
export function backVectorOfDeg(d: number): { x: number; y: number } {
  switch (mod360(d)) {
    case 90:
      return { x: 1, y: 0 };
    case 180:
      return { x: 0, y: 1 };
    case 270:
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: -1 };
  }
}

/** Inverse of {@link backVectorOfDeg}; anything not recognised reads as `0`. */
export function degOfBackVector(v: { x: number; y: number }): 0 | 90 | 180 | 270 {
  if (v.x === 1) return 90;
  if (v.y === 1) return 180;
  if (v.x === -1) return 270;
  return 0;
}

/** The quarter-turn a fixture turned `d` faces after `g`: its back vector pushed through. */
export function actOnQuarterTurn(g: D4, d: number | undefined): 0 | 90 | 180 | 270 {
  return degOfBackVector(applyVec(g, backVectorOfDeg(d ?? 0)));
}

/** The footprint side a fixture's back lands on at quarter-turn `d` (non-quarter reads as `top`). */
export function backEdgeOfDeg(d: number | undefined): Side {
  switch (mod360(d ?? 0)) {
    case 90:
      return "right";
    case 180:
      return "bottom";
    case 270:
      return "left";
    default:
      return "top";
  }
}

/** The quarter-turn that puts a fixture's back on side `s` of its footprint. */
export const BACK_EDGE_DEG: Readonly<Record<Side, 0 | 90 | 180 | 270>> = Object.freeze({
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
});

/** The quarter-turn that puts a fixture's back on side `s` (see {@link BACK_EDGE_DEG}). */
export function degOfBackEdge(s: Side): 0 | 90 | 180 | 270 {
  return BACK_EDGE_DEG[s];
}

// ---------------------------------------------------------------------------
// The plan's north
// ---------------------------------------------------------------------------

/**
 * The page bearing, in raw degrees clockwise from the page top, that the plan's `north`
 * names — the angle the north arrow is drawn at. A `{ deg }` bearing is passed through
 * unnormalised, exactly as the renderers have always read it.
 */
export function northBearingDeg(north: NorthDir): number {
  switch (north) {
    case "up":
      return 0;
    case "down":
      return 180;
    case "left":
      return 270;
    case "right":
      return 90;
    default:
      return typeof north === "object" ? north.deg : 0;
  }
}

/**
 * How many CLOCKWISE quarter-turns separate the top of the page from compass north, for
 * the plan's declared `north` — `0` for `up` (the default), `1` for `right`, `2` for
 * `down`, `3` for `left`. This is the same page bearing the north arrow is drawn at
 * (`src/backends/svg.ts`), quantised to the four cardinals.
 *
 * A `{ deg }` bearing is **snapped to the nearest cardinal**, because a facing can only
 * be one of four letters and ArchLang geometry is rectilinear: `north 80` is reported as
 * if north were `right`. **An exact 45° tie rounds CLOCKWISE** — `north 45` snaps to
 * `right` (1), `north -45` to `up` (0), `north 135` to `down` (2). A bearing outside
 * [0,360) is normalised, so `north 450` == `north 90`. Pure, closed-form, deterministic:
 * no trigonometry and no floating-point comparisons beyond one `Math.floor`.
 */
export function northQuarterTurns(north: NorthDir): 0 | 1 | 2 | 3 {
  let q: number;
  switch (north) {
    case "up":
      q = 0;
      break;
    case "right":
      q = 1;
      break;
    case "down":
      q = 2;
      break;
    case "left":
      q = 3;
      break;
    default:
      // Nearest cardinal, ties clockwise: floor((deg + 45) / 90).
      q = Math.floor((north.deg + 45) / 90);
  }
  return (((q % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}
