/**
 * The site in 3D (product-roadmap card RM8.3, backlog VA.2): each `outdoor` surface a thin slab and
 * each `fence` a low-poly solid per style, built from the Scene3D's `outdoor` and `fences` (the
 * core's `ROutdoor` and `RFence`, read as they are). What the plan does not state is a labelled
 * default in the ledger (ADR 0030 decision 5): the slab's thickness, each kind's colour, each
 * style's height, colour and profile.
 *
 * Heights, per storey at its elevation `e` (µm):
 * - an outdoor surface is [e − 50 mm, e]: its top is the storey's floor level, the top of the
 *   building's slab, so a garden lies flush with the ground floor's slab and a balcony with its own
 *   storey's (the floor finish stands 5 mm above both). A surface never lies in the plane of a face
 *   it overlaps by more than 1 cm² (`build.ts`): over the slab it is lifted one step (0.5 mm,
 *   `FLOOR_LIFT_UM`, V-GEO-05's) above the slab's top, over an earlier surface one step above that
 *   one, and a step more while its top would meet a floor's bottom or top; ledgered
 *   `outdoor-overlap-lift`. A balcony's railing is not built (ledgered `outdoor-rail-omitted`);
 * - a fence stands on the floor level, [e, e + its style's height], a post on every tick the core
 *   draws (`fencePosts`); a fence with no run of positive length is not built (`fence-no-run`).
 *
 * Its colour is the core's own (ADR 0031's seam: `DEFAULT_THEME` from the core's public exports):
 * the tint the drawing fills the kind with (`GROUND_TINT`), laid on `GROUND_WASH` times
 * (`groundColour`), except where the 3D preview tells kinds apart that the drawing tells apart by
 * hatch alone (`GROUND_SPLITS`). Never from a `label`. The colour rides on the node
 * (`extras.colour`), so the viewer and the GLB writer read it without the core.
 *
 * Every coordinate is a whole micrometre; every repeat count (posts, pickets) a clamped function of
 * the segment's own length, so two equal fences build equally wherever they stand.
 */
import { DEFAULT_THEME } from "@chanmeng666/archlang";
import { FENCE_PALETTE, GROUND_SPLITS, GROUND_TINT, GROUND_WASH, type GroundTint } from "../materials.js";
import type { Fence, Polygon, Pt } from "../scene3d/types.js";
import { slab2d } from "./extrude.js";

/** An outdoor surface's slab, mm: thin, its top at the storey's floor level. */
export const OUTDOOR_MM = 50;

/** A fence's height by style, mm: drafting defaults (a front-garden picket, a pool panel, a post-and-rail). */
export const FENCE_HEIGHT_MM: Readonly<Record<string, number>> = { picket: 1000, panel: 1800, post: 1100 };

/**
 * The core's post spacing per style, mm (`POST_PITCH`, `src/elements/fence.ts`, not exported): it
 * draws `postCount` = round(run / pitch), clamped to 1…60, divisions on each straight run, a tick at
 * each division and one at an open fence's far end. The 3D posts stand exactly on those ticks
 * (`fencePosts`); `test/outdoor.test.ts` holds them to the ticks the core draws, across the corpus.
 */
export const CORE_POST_PITCH_MM: Readonly<Record<string, number>> = { picket: 600, panel: 1800, post: 1800 };
/** The core's clamp on a run's divisions (`MIN_POSTS`, `MAX_POSTS`). */
export const CORE_POSTS_PER_RUN = [1, 60] as const;

/**
 * Each style's profile, mm: what stands along a run. A square post stands on every tick the core
 * draws (`CORE_POST_PITCH_MM`); a picket fence adds two rails and its pickets, a panel fence one board
 * the whole height, a post-and-rail fence one rail along the top: the core draws the three as dense
 * ticks, a double line and posts on a single rail.
 */
export interface FenceProfile {
  post: number;
  /** Boards along the run: [depth across it, bottom, top], mm above the base. */
  rails: ReadonlyArray<readonly [number, number, number]>;
  /** Pickets: [width along the run, depth across it, pitch], mm, or none. */
  pickets?: readonly [number, number, number];
}

export const FENCE_PROFILES: Readonly<Record<string, FenceProfile>> = {
  picket: {
    post: 80,
    rails: [
      [20, 150, 220],
      [20, 700, 770],
    ],
    pickets: [70, 20, 140],
  },
  panel: { post: 100, rails: [[40, 0, 1800]] },
  post: { post: 100, rails: [[60, 1040, 1100]] },
};

/** The most pickets one run takes, whatever its length. */
export const MAX_FENCE_REPEAT = 400;

const MM = 1000;
/** A kind's tint, or `paving` for a kind this package does not know (a hand-made Scene3D). */
export const tintOf = (surface: string): GroundTint | undefined => GROUND_TINT[surface as keyof typeof GROUND_TINT];

/** The theme's tint laid on `GROUND_WASH` times over its paper (`materials.ts`). */
export function groundColour(tint: GroundTint, theme = DEFAULT_THEME): string {
  const ch = (hex: string, i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  const bg = theme.bg;
  const wash = theme[tint];
  const out = [1, 3, 5].map((i) => {
    const v = ch(bg, i) - GROUND_WASH * (ch(bg, i) - ch(wash, i));
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

/** A surface's 3D colour and where it came from (the ledger's rule). */
export function outdoorColour(surface: string): { srgb: string; rule: "outdoor-colour-theme" | "outdoor-colour-3d" } {
  const split = GROUND_SPLITS[surface as keyof typeof GROUND_SPLITS];
  if (split) return { srgb: split.srgb, rule: "outdoor-colour-3d" };
  return { srgb: groundColour(tintOf(surface) ?? "paving"), rule: "outdoor-colour-theme" };
}

/** A fence's colour (its style's, or a picket's for a style this package does not know). */
export const fenceColour = (style: string): string =>
  (FENCE_PALETTE[style as keyof typeof FENCE_PALETTE] ?? FENCE_PALETTE.picket).srgb;

/** The point a fraction `f` along a→b, rounded to whole micrometres. */
const at = (a: Pt, b: Pt, f: number): Pt => [
  Math.round(a[0] + (b[0] - a[0]) * f),
  Math.round(a[1] + (b[1] - a[1]) * f),
];

/** The core's `postCount`: a run's divisions for a style (`CORE_POST_PITCH_MM`). */
export function corePostCount(lenUm: number, style: string): number {
  const pitch = CORE_POST_PITCH_MM[style] ?? (CORE_POST_PITCH_MM.picket as number);
  const [lo, hi] = CORE_POSTS_PER_RUN;
  return Math.max(lo, Math.min(hi, Math.round(lenUm / MM / pitch)));
}

/**
 * A fence's runs as the core draws them (`fenceSegments`, then `render`): consecutive points, plus
 * the closing run of a closed fence of three points or more, zero-length runs left out; and whether
 * the runs close into a ring (then the last run's far end is the first run's start, and an open
 * fence's last run takes a post at its far end).
 */
export function fenceRuns(f: Pick<Fence, "points" | "closed">): { runs: Array<[Pt, Pt]>; ring: boolean } {
  const pts = f.points;
  const all: Array<[Pt, Pt]> = [];
  for (let i = 0; i + 1 < pts.length; i++) all.push([pts[i] as Pt, pts[i + 1] as Pt]);
  if (f.closed && pts.length > 2) all.push([pts[pts.length - 1] as Pt, pts[0] as Pt]);
  const runs = all.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0);
  return { runs, ring: f.closed && pts.length > 2 && runs.length > 1 };
}

/** Where the core draws a fence's ticks, so where its posts stand (µm, the plan point, its run). */
export function fencePosts(f: Pick<Fence, "points" | "closed" | "style">): Array<{ at: Pt; run: [Pt, Pt] }> {
  const { runs, ring } = fenceRuns(f);
  const out: Array<{ at: Pt; run: [Pt, Pt] }> = [];
  runs.forEach(([a, b], i) => {
    const n = corePostCount(Math.hypot(b[0] - a[0], b[1] - a[1]), f.style);
    for (let k = 0; k < n; k++) out.push({ at: at(a, b, k / n), run: [a, b] });
    if (i === runs.length - 1 && !ring) out.push({ at: b, run: [a, b] });
  });
  return out;
}

/**
 * A fence's plan pieces, each with its [bottom, top] in mm above its base: a post on every tick the
 * core draws (`fencePosts`), and per run its rails and its pickets, each a box aligned with the run.
 * A fence with no run of positive length has no piece.
 */
export function fencePieces(
  f: Pick<Fence, "points" | "closed" | "style">,
  profile: FenceProfile,
  height: number,
): Array<{
  poly: Polygon;
  z: readonly [number, number];
}> {
  const out: Array<{ poly: Polygon; z: readonly [number, number] }> = [];
  // A box `w` long along the run a→b, `d` deep across it, centred on `c`.
  const box = (c: Pt, [a, b]: [Pt, Pt], w: number, d: number): Polygon => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const p = (s: number): Pt => [Math.round(c[0] + ux * s), Math.round(c[1] + uy * s)];
    return slab2d(p(-w / 2), p(w / 2), d);
  };
  for (const p of fencePosts(f))
    out.push({ poly: box(p.at, p.run, profile.post * MM, profile.post * MM), z: [0, height] });
  for (const [a, b] of fenceRuns(f).runs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const [depth, z0, z1] of profile.rails)
      out.push({ poly: slab2d(a, b, depth * MM), z: [Math.min(z0, height), Math.min(z1, height)] });
    if (profile.pickets) {
      const [w, d, pitch] = profile.pickets;
      const m = Math.max(1, Math.min(MAX_FENCE_REPEAT, Math.ceil(len / (pitch * MM))));
      const pw = Math.min(w * MM, len / m);
      for (let j = 0; j < m; j++) out.push({ poly: box(at(a, b, (j + 0.5) / m), [a, b], pw, d * MM), z: [0, height] });
    }
  }
  return out;
}
