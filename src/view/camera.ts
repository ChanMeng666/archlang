/**
 * **The axonometric camera** — the two projections the opt-in 3D view is drawn through,
 * and nothing else.
 *
 * ## The coordinate frame
 *
 * The plan's own, extended upward. `x` runs right, `y` runs **down** the page (ArchLang's
 * plan convention — `src/scene.ts`), and `z` runs **up** off the page, measured from the
 * building's lowest floor in the same millimetres. Screen coordinates are SVG's: `sx`
 * right, `sy` **down**.
 *
 * Both cameras look from the plan's **bottom-left and above** — south-west, reading the
 * page as a map with north at the top. That is the conventional architectural viewpoint
 * and it is the same for both presets on purpose: switching preset must change the
 * *drafting convention*, never which corner of the building you are standing at.
 *
 * ## No trigonometry, and why that is a hard rule
 *
 * `Math.sin`/`cos`/`tan`/`atan` are **implementation-defined** in ECMAScript — the spec
 * requires only an "implementation-approximated" result, so two engines (or two versions
 * of one) may differ in the last bits. This repository's CI spans Windows and Linux
 * across Node 18/20/22 and its whole verification system rests on byte-identical output,
 * so a projection built on `Math.cos` would be a determinism hazard sitting under every
 * rendered face.
 *
 * `Math.sqrt` is **exactly rounded** (IEEE-754 requires it), as are `+`, `-`, `*` and
 * `/`. Every constant below is therefore written as a square-root expression, which is
 * both exact and honest about where the angle came from. `test/iso-camera.test.ts` greps
 * this directory for the four trig functions and fails on a hit.
 *
 * ## `iso` — a true isometric, viewed from the south-west
 *
 * The orthonormal basis, as rows of the 3 × 3 matrix `(sx, sy, depth) = M · (x, y, z)`:
 *
 * ```
 *   sx    = ( x + y) / √2
 *   sy    = −(x − y + 2z) / √6
 *   depth = ( x − y −  z) / √3
 * ```
 *
 * It is the yaw-then-pitch camera of the reference implementation with the signs settled:
 * yaw −45° (`sin = −√2/2`, `cos = √2/2`) and pitch `atan(1/√2)` (`sin φ = 1/√3`,
 * `cos φ = √(2/3) = 2/√6`), composed so that the image is a genuine view rather than its
 * mirror. Each row is a unit vector and the three are mutually orthogonal, so `depth` is
 * the third row of the *same* basis and not a second, disagreeing, ordering rule.
 *
 * It is isometric in the strict sense: the three axis unit vectors all project to length
 * `√(2/3)`, `ẑ` projects to a purely vertical screen line, and each plan axis leaves the
 * horizontal at 30°.
 *
 * ## `axon` — the 30°/60° plan oblique (planometric)
 *
 * The other convention an architect draws, and deliberately a different *kind* of
 * projection rather than a second angle: the plan is **rotated on the page and kept at
 * true shape and true size**, and heights rise straight up, also true size.
 *
 * ```
 *   with cos ψ = √3/2, sin ψ = −1/2   (ψ = −30°)
 *   sx    =  x·cos ψ − y·sin ψ = ( √3·x + y) / 2
 *   sy    =  x·sin ψ + y·cos ψ − z = (−x + √3·y) / 2 − z
 *   depth = −(x·sin ψ + y·cos ψ + z) / √2 = (x − √3·y − 2z) / (2·√2)
 * ```
 *
 * A plan drawn this way can still be measured with a rule and a protractor, which is the
 * whole point of the convention — but the view as a whole is illustrative all the same,
 * and nothing in `describe()` or `lint()` knows it exists.
 *
 * ## Depth, and the culling sign
 *
 * `depth` grows **away from the viewer** in both presets, so the painter's algorithm
 * draws in descending depth. The projection's kernel — the direction along which two
 * points collide on screen — is `row_sx × row_sy` in both cases, and in both it points at
 * the viewer. A planar face traversed right-handed about its outward normal `n` therefore
 * projects to a signed screen area proportional to `n · (row_sx × row_sy)`, which is
 * positive exactly when the face turns towards the viewer. So for **both** cameras the
 * front-facing test is the same one — *projected signed area > 0* — which is what
 * {@link Camera.frontSign} records and `test/iso-sort.test.ts` proves rather than assumes.
 */

import type { Point } from "../ast.js";

/** A point in the plan's frame, lifted: plan `x`/`y` in mm, `z` up from the lowest floor. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** The two presets. There are no free angles — see the module header. */
export const VIEW_NAMES = ["iso", "axon"] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

/** Is `s` one of the two view names? The CLI's and `compile()`'s one gate. */
export function isViewName(s: string): s is ViewName {
  return (VIEW_NAMES as readonly string[]).includes(s);
}

/* ---------------------------------------------------------------------------
 * The constants, as square roots
 * ------------------------------------------------------------------------- */

/** √2, exactly rounded. */
const SQRT2 = Math.sqrt(2);
/** √3, exactly rounded. */
const SQRT3 = Math.sqrt(3);
/** √6, exactly rounded. */
const SQRT6 = Math.sqrt(6);

/** A projected point in SVG screen millimetres (`x` right, `y` down). */
export type Projected = Point;

/**
 * One camera: a linear map from the lifted plan frame to (screen, depth).
 *
 * Both members are pure functions of their three arguments — no state, no tolerance, no
 * accumulated transform — so a face's projection cannot depend on how many faces were
 * projected before it.
 */
export interface Camera {
  readonly name: ViewName;
  /** Screen position, in SVG millimetres. */
  project(x: number, y: number, z: number): Projected;
  /** Distance ordering: **larger is farther**, so the painter draws in descending order. */
  depth(x: number, y: number, z: number): number;
  /**
   * The sign a **front-facing** loop's projected signed area carries. `+1` for both
   * presets (see the module header); it is a field rather than a constant so a future
   * camera cannot silently inherit a sign it does not have.
   */
  readonly frontSign: 1 | -1;
}

const ISO: Camera = {
  name: "iso",
  project: (x, y, z) => ({ x: (x + y) / SQRT2, y: -(x - y + 2 * z) / SQRT6 }),
  depth: (x, y, z) => (x - y - z) / SQRT3,
  frontSign: 1,
};

/** cos(−30°) = √3/2 and sin(−30°) = −1/2, written where the arithmetic below uses them. */
const COS_PSI = SQRT3 / 2;
const SIN_PSI = -1 / 2;

const AXON: Camera = {
  name: "axon",
  project: (x, y, z) => ({ x: x * COS_PSI - y * SIN_PSI, y: x * SIN_PSI + y * COS_PSI - z }),
  depth: (x, y, z) => -(x * SIN_PSI + y * COS_PSI + z) / SQRT2,
  frontSign: 1,
};

/** The camera for a view name. Two presets, one lookup, no free angles. */
export function cameraFor(view: ViewName): Camera {
  return view === "iso" ? ISO : AXON;
}

/**
 * Twice the signed area of a projected loop, by the shoelace sum.
 *
 * Twice, not once: the halving is a division by a constant that cannot change the sign,
 * and the only consumer is a sign test. Screen coordinates run `y` **down**, so a
 * positive value is a *clockwise* loop as the reader sees it — which is the convention
 * {@link Camera.frontSign} is stated in.
 */
export function projectedArea2(pts: readonly Projected[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}
