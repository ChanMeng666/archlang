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
 *   storey's (the floor finish stands 5 mm above both). A surface that overlaps an earlier one of its
 *   storey by more than 1 cm² is lifted one step (0.5 mm, `FLOOR_LIFT_UM`) above the highest earlier
 *   one it overlaps, as rooms are (V-GEO-05), so two coplanar tops never fight; ledgered
 *   `outdoor-overlap-lift`. A balcony's railing is not built (ledgered `outdoor-rail-omitted`);
 * - a fence stands on the floor level, [e, e + its style's height].
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
 * Each style's profile, mm: what stands along a run. Every style has a square post at each of the
 * fence's points and at most `postPitch` apart between them (the core posts a panel and a
 * post-and-rail fence at 1.8 m too). A picket fence adds two rails and its pickets, a panel fence one
 * board the whole height, a post-and-rail fence one rail along the top: the core draws the three as
 * dense ticks, a double line and posts on a single rail.
 */
export interface FenceProfile {
  post: number;
  postPitch: number;
  /** Boards along the run: [depth across it, bottom, top], mm above the base. */
  rails: ReadonlyArray<readonly [number, number, number]>;
  /** Pickets: [width along the run, depth across it, pitch], mm, or none. */
  pickets?: readonly [number, number, number];
}

export const FENCE_PROFILES: Readonly<Record<string, FenceProfile>> = {
  picket: {
    post: 80,
    postPitch: 1800,
    rails: [
      [20, 150, 220],
      [20, 700, 770],
    ],
    pickets: [70, 20, 140],
  },
  panel: { post: 100, postPitch: 1800, rails: [[40, 0, 1800]] },
  post: { post: 100, postPitch: 1800, rails: [[60, 1040, 1100]] },
};

/** The most posts or pickets one segment takes, whatever its length. */
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

const count = (len: number, pitch: number): number => Math.max(1, Math.min(MAX_FENCE_REPEAT, Math.ceil(len / pitch)));

/**
 * A fence's plan pieces, each with its [bottom, top] in mm above its base: per segment its posts (one
 * at its start, then evenly at most `postPitch` apart; the last point of an open fence gets one too),
 * its rails and its pickets, each a box aligned with the segment.
 */
export function fencePieces(
  f: Pick<Fence, "points" | "closed">,
  profile: FenceProfile,
  height: number,
): Array<{
  poly: Polygon;
  z: readonly [number, number];
}> {
  const pts = f.points;
  const segs: Array<[Pt, Pt]> = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i] as Pt, pts[i + 1] as Pt]);
  if (f.closed && pts.length > 2) segs.push([pts[pts.length - 1] as Pt, pts[0] as Pt]);
  const out: Array<{ poly: Polygon; z: readonly [number, number] }> = [];
  const half = (profile.post * MM) / 2;
  const post = (c: Pt, a: Pt, b: Pt): void => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const p = (s: number): Pt => [Math.round(c[0] + ux * s), Math.round(c[1] + uy * s)];
    out.push({ poly: slab2d(p(-half), p(half), profile.post * MM), z: [0, height] });
  };
  segs.forEach(([a, b], k) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(len > 0)) return;
    const n = count(len, profile.postPitch * MM);
    for (let i = 0; i < n; i++) post(at(a, b, i / n), a, b);
    if (!f.closed && k === segs.length - 1) post(b, a, b);
    for (const [depth, z0, z1] of profile.rails)
      out.push({ poly: slab2d(a, b, depth * MM), z: [Math.min(z0, height), Math.min(z1, height)] });
    if (profile.pickets) {
      const [w, d, pitch] = profile.pickets;
      const m = count(len, pitch * MM);
      const hw = Math.min((w * MM) / 2, len / (2 * m));
      for (let j = 0; j < m; j++) {
        const c = at(a, b, (j + 0.5) / m);
        const ux = (b[0] - a[0]) / len;
        const uy = (b[1] - a[1]) / len;
        const p = (s: number): Pt => [Math.round(c[0] + ux * s), Math.round(c[1] + uy * s)];
        out.push({ poly: slab2d(p(-hw), p(hw), d * MM), z: [0, height] });
      }
    }
  });
  return out;
}
