/**
 * A stair as stepped solids (card X3), from the Scene3D's flights and landings, which are the
 * core's own (`scene3d/build.ts`): nothing here re-derives a stair from its bounding box.
 *
 * - Risers: one per tread the plan draws on a flight, plus one more at its head, because a flight's
 *   last riser lands on the landing or the floor above. So a stair of flights with `n₁ … n_F` treads
 *   climbs its rise in `R = Σ (nᵢ + 1)` equal risers, and riser `k` tops out at `z0 + round(rise·k/R)`
 *   (whole micrometres; the last is exactly `z0 + rise`, the floor above).
 * - A flight: one closed prism whose side section is its steps, extruded across the flight band
 *   (the stair's `width`, centred across the flight, as the drawing centres it), each tread
 *   `run / treads` deep, on the drawing's tread lines. It is solid down to the stair's floor `z0`.
 * - A landing: a closed box over its rectangle, from `z0` up to the riser its flight ends on.
 *
 * Every shell is closed and wound outward (`prism`), in integer micrometres and glTF axes.
 */
import type { Pt, Side, Stair, StairFlight } from "../scene3d/types.js";
import { prism, rect } from "./extrude.js";
import type { Shell } from "./types.js";

/** How many risers a stair of these flights climbs: each flight's treads plus its head riser. */
export function stairRisers(flights: readonly Pick<StairFlight, "treads">[]): number {
  return flights.reduce((n, f) => n + f.treads + 1, 0);
}

/** A stair's solids, how many risers it climbs, and the height each landing stands at. */
export interface StairSolid {
  shells: Shell[];
  risers: number;
  /** The top of each landing (µm), in climbing order. */
  landingTops: number[];
  /** The top of the highest tread (µm): one riser below `z0 + rise`. */
  top: number;
}

/** Along a flight's run from its foot (`d` µm in) to the plan coordinate on its run axis. */
function runCoordinate(f: StairFlight, d: number): number {
  const [x, y] = f.at;
  switch (f.foot) {
    case "bottom":
      return y + f.size.h - d;
    case "top":
      return y + d;
    case "right":
      return x + f.size.w - d;
    case "left":
      return x + d;
  }
}

const alongY = (foot: Side): boolean => foot === "top" || foot === "bottom";

/**
 * A prism over a section in the vertical plane through a flight's run, extruded across it from
 * `c0` to `c1`: built upright by `prism` (section as its plan ring, the cross axis as its height),
 * then relabelled. A run along plan y maps (u, h, v) → (h, v, u), a cyclic permutation, so the
 * winding stays outward; a run along plan x maps (u, h, v) → (u, v, h), a swap, so each triangle is
 * turned back over (as `partShell` does for a sideways part).
 */
function sideways(section: Pt[], c0: number, c1: number, runAlongY: boolean): Shell | null {
  const up = prism({ outer: section }, c0, c1);
  if (!up) return null;
  const positions: number[] = [];
  for (let i = 0; i < up.positions.length; i += 3) {
    const [u, h, v] = [up.positions[i] as number, up.positions[i + 1] as number, up.positions[i + 2] as number];
    if (runAlongY) positions.push(h, v, u);
    else positions.push(u, v, h);
  }
  const indices = [...up.indices];
  if (!runAlongY) {
    for (let t = 0; t < indices.length; t += 3) {
      const b = indices[t + 1] as number;
      indices[t + 1] = indices[t + 2] as number;
      indices[t + 2] = b;
    }
  }
  return { positions, indices };
}

/**
 * The stepped solids of `stair` climbing `rise` µm from `z0`, or `null` when it carries no flights
 * (a Scene3D the core gave no tread count) or `rise` is not positive. A shell that would be
 * degenerate is left out and counted in `dropped`.
 */
export function stairSolid(stair: Stair, z0: number, rise: number): (StairSolid & { dropped: number }) | null {
  const flights = stair.flights;
  if (!flights?.length || !(rise > 0)) return null;
  const R = stairRisers(flights);
  const riserTop = (k: number): number => z0 + Math.round((rise * k) / R);
  const shells: Shell[] = [];
  const landingTops: number[] = [];
  let dropped = 0;
  let climbed = 0;
  flights.forEach((f, i) => {
    const n = f.treads;
    const yRun = alongY(f.foot);
    const run = yRun ? f.size.h : f.size.w;
    // The flight band, centred across the flight (the drawing's `runFrame` centres it there).
    const [lo, extent] = yRun ? [f.at[0], f.size.w] : [f.at[1], f.size.h];
    const width = Math.min(stair.width, extent);
    const c0 = lo + Math.round((extent - width) / 2);
    const c1 = c0 + width;
    const at = (t: number): number => runCoordinate(f, Math.round((run * t) / n));
    // The steps' side section, (run coordinate, height): up the first riser, then tread by tread.
    const section: Pt[] = [[at(0), z0]];
    for (let t = 0; t < n; t++) {
      const h = riserTop(climbed + t + 1);
      section.push([at(t), h], [at(t + 1), h]);
    }
    section.push([at(n), z0]);
    const s = sideways(section, c0, c1, yRun);
    if (s) shells.push(s);
    else dropped++;
    climbed += n + 1;
    const landing = stair.landings?.[i];
    if (landing && i < flights.length - 1) {
      const top = riserTop(climbed);
      landingTops.push(top);
      const box = prism(
        rect(landing.at[0], landing.at[1], landing.at[0] + landing.size.w, landing.at[1] + landing.size.h),
        z0,
        top,
      );
      if (box) shells.push(box);
      else dropped++;
    }
  });
  return { shells, risers: R, landingTops, top: riserTop(R - 1), dropped };
}
