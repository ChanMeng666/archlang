/**
 * A stair as stepped solids (card X3, `stairSolid`) and in its parts (card RM8.6, `stairDetail`:
 * what the mesh builds), from the Scene3D's flights and landings, which are the core's own
 * (`scene3d/build.ts`): nothing here re-derives a stair from its bounding box. The solid:
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
import { clipToConvex, prism, rect } from "./extrude.js";
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

// ── Product-roadmap card RM8.6: the stair in its parts ──────────────────────────────────────────

const clampMm = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * The drafting defaults a stair's parts are built to (mm), each a clamped share of its own geometry
 * (design `docs/plans/product-roadmap/design/visual-language.md` §2.3): `r` the riser (`rise / R`),
 * `g` a flight's going (`run / treads`), `W` the flight band's width. They are drawing defaults,
 * never a check against any regulation.
 */
export const STAIR_DETAIL = {
  /** A tread board, 0.25 r in [30, 50] thick (never more than half a riser). */
  tread: (r: number): number => Math.min(clampMm(Math.round(0.25 * r), 30, 50), Math.max(1, Math.floor(r / 2))),
  /** Its nosing past the front edge (not on a flight's first tread), 0.1 g in [15, 30]. */
  nosing: (g: number): number => clampMm(Math.round(0.1 * g), 15, 30),
  /** A stringer, 0.05 W in [40, 60] wide (at most a quarter of the band). */
  stringer: (W: number): number => Math.min(clampMm(Math.round(0.05 * W), 40, 60), Math.max(1, Math.floor(W / 4))),
  /** The stringer's band: 0.3 r in [40, 60] over the nosing line, 1.2 r in [150, 250] under it. */
  above: (r: number): number => clampMm(Math.round(0.3 * r), 40, 60),
  below: (r: number): number => clampMm(Math.round(1.2 * r), 150, 250),
  /** The handrail's top over the nosing line (measured upright), and its 50 × 50 section. */
  railHeight: 900,
  rail: 50,
  /** A baluster a tread, 0.03 W in [20, 30] square. */
  baluster: (W: number): number => clampMm(Math.round(0.03 * W), 20, 30),
  /** A newel at each end of a flight, 0.06 W in [60, 90] square, this far over the handrail. */
  newel: (W: number): number => clampMm(Math.round(0.06 * W), 60, 90),
  newelAbove: 100,
  /** A landing's open edge: its handrail's top over the landing; balusters a going apart. */
  landingRailHeight: 1000,
  /** How far past an edge the wall probe looks. */
  probe: 100,
} as const;

/** What a flight's long edge, or a landing's edge, has past it (the probe's answer). */
export interface StairSide {
  /** `flight <k>` or `landing <k>`, 1-based in climbing order. */
  of: string;
  side: Side;
  /**
   * `flight` / `landing`: the stair's other flights (and landings) lie past the whole edge; `newel`: a
   * landing edge open past it, but wholly held by the flights' newels standing on it.
   */
  against: "wall" | "open" | "flight" | "landing" | "newel";
}

/** A stair built in its parts (RM8.6): treads and landings, stringers, the balustrade. */
export interface StairDetail {
  /** The treads (the risers open) and the solid landings: the stair node's own shells. */
  treads: Shell[];
  stringers: Shell[];
  /** Handrails, balusters and newels. */
  rails: Shell[];
  risers: number;
  /** Shells left out as degenerate. */
  dropped: number;
  /** Every edge the probe looked past, in climbing order. */
  sides: StairSide[];
  /** The sizes used (mm). */
  dims: {
    tread: number;
    nosing: number[];
    stringer: { width: number; above: number; below: number };
    balustrade: {
      height: number;
      rail: [number, number];
      baluster: number;
      newel: number;
      newel_above: number;
      landing_height: number;
    };
  };
}

/** `[x0, y0, x1, y1]`, µm, plan axes. */
type Box2 = [number, number, number, number];

/**
 * The parts of `[s0, s1]` no interval of `taken` covers, at least `min` long: a shorter one counts as
 * covered (review of PR #732, S1: a dog-leg whose flights differ by a millimetre left a 1 mm stub of
 * rail and a newel on it).
 */
function freeRuns(
  s0: number,
  s1: number,
  taken: ReadonlyArray<readonly [number, number]>,
  min = 0,
): Array<[number, number]> {
  let runs: Array<[number, number]> = [[s0, s1]];
  for (const [a, b] of taken)
    runs = runs.flatMap(
      ([p, q]): Array<[number, number]> =>
        b <= p || a >= q
          ? [[p, q]]
          : (
              [
                [p, Math.min(a, q)],
                [Math.max(b, p), q],
              ] as Array<[number, number]>
            ).filter(([u, v]) => v > u),
    );
  return runs.filter(([u, v]) => v - u >= min);
}

/**
 * `stair` climbing `rise` µm from `z0`, in its parts (product-roadmap RM8.6; design
 * `visual-language.md` §2.3), or `null` where `stairSolid` refuses one. Every tread top is
 * `stairSolid`'s riser top (`z0 + round(rise·k/R)`), so the climb is the same; the stair is built:
 *
 * - each tread a board `STAIR_DETAIL.tread` thick under its riser top, from its tread line (less
 *   the nosing, but on a flight's first tread) to the next, between the two stringers (so no face
 *   of a tread lies in a stringer's); the risers are open;
 * - two stringers on the flight band's long edges, their side section the band from `below` under
 *   to `above` over the nosing line (through the tread tops' front edges), clipped to the run and
 *   to `[z0, the flight's head]`;
 * - each landing a solid box, as before;
 * - a balustrade on each long edge the probe finds open (`solidAt` false 100 mm past it at mid-run;
 *   the caller answers from the storey's wall bodies and columns): a sloping handrail centred on the
 *   stringer, a baluster under the middle of each tread from inside the stringer to inside the rail,
 *   a newel centred on each end of the flight; on a landing's open edge (no flight and no wall past
 *   it) a level handrail inside the edge with balusters a going apart, stopping where a newel or an
 *   earlier rail already stands.
 *
 * Square to the plan, integer micrometres, every shell closed and wound outward (`prism`,
 * `sideways`). Read from the shape alone: a mirrored plan probes the mirrored edges and builds the
 * mirrored stair, so nothing gains a hand.
 */
export function stairDetail(stair: Stair, z0: number, rise: number, solidAt: (p: Pt) => boolean): StairDetail | null {
  const flights = stair.flights;
  if (!flights?.length || !(rise > 0)) return null;
  const MM = 1000;
  const D = STAIR_DETAIL;
  const R = stairRisers(flights);
  const riserTop = (k: number): number => z0 + Math.round((rise * k) / R);
  const r = rise / R / MM;
  const W = stair.width / MM;
  const [T, above, below] = [D.tread(r) * MM, D.above(r) * MM, D.below(r) * MM];
  const [sw, bb, np] = [D.stringer(W) * MM, D.baluster(W) * MM, D.newel(W) * MM];
  const [railH, railW] = [D.railHeight * MM, D.rail * MM];
  const out: Pick<StairDetail, "treads" | "stringers" | "rails" | "sides"> & { dropped: number } = {
    treads: [],
    stringers: [],
    rails: [],
    sides: [],
    dropped: 0,
  };
  const keep = (into: Shell[], s: Shell | null): void => {
    if (s) into.push(s);
    else out.dropped++;
  };
  const nosings: number[] = [];
  /** Plan point at run `d` of `f`, across coordinate `a`. */
  const planAt = (f: StairFlight, d: number, a: number): Pt =>
    alongY(f.foot) ? [a, runCoordinate(f, d)] : [runCoordinate(f, d), a];
  /** The plan rectangle over run `d0..d1` of `f` and across `a0..a1`. */
  const planBox = (f: StairFlight, d0: number, d1: number, a0: number, a1: number): Box2 => {
    const [p, q] = [planAt(f, d0, a0), planAt(f, d1, a1)];
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  };
  const solid = (b: Box2, za: number, zb: number): Shell | null => prism(rect(b[0], b[1], b[2], b[3]), za, zb);
  /** A side section of `f` in (d, z), extruded across `a0..a1`. */
  const section = (f: StairFlight, pts: readonly Pt[], a0: number, a1: number): Shell | null =>
    sideways(
      pts.map(([d, z]): Pt => [runCoordinate(f, d), z]),
      a0,
      a1,
      alongY(f.foot),
    );
  const flightBoxes: Box2[] = flights.map((f) => [f.at[0], f.at[1], f.at[0] + f.size.w, f.at[1] + f.size.h]);
  const landingBoxes: Box2[] = (stair.landings ?? [])
    .slice(0, flights.length - 1)
    .map((l) => [l.at[0], l.at[1], l.at[0] + l.size.w, l.at[1] + l.size.h]);
  const newels: Box2[] = [];
  const landings: Array<{ box: Box2; top: number; going: number; k: number }> = [];
  let climbed = 0;
  let base = z0;
  flights.forEach((f, i) => {
    const n = f.treads;
    const yRun = alongY(f.foot);
    const run = yRun ? f.size.h : f.size.w;
    const [lo, extent] = yRun ? [f.at[0], f.size.w] : [f.at[1], f.size.h];
    const width = Math.min(stair.width, extent);
    const c0 = lo + Math.round((extent - width) / 2);
    const c1 = c0 + width;
    const g = run / n / MM;
    const nos = D.nosing(g) * MM;
    nosings.push(nos / MM);
    const line = (t: number): number => Math.round((run * t) / n);
    const first = riserTop(climbed + 1);
    const head = riserTop(climbed + n + 1);
    const slope = (head - first) / run;
    /** The nosing line, through the tread tops' front edges: `first` at the foot, `head` at `run`. */
    const h = (d: number): number => first + slope * d;
    for (let t = 0; t < n; t++) {
      const top = riserTop(climbed + t + 1);
      keep(out.treads, solid(planBox(f, t === 0 ? 0 : line(t) - nos, line(t + 1), c0 + sw, c1 - sw), top - T, top));
    }
    // Its foot stands on what the flight starts from (the floor, or the landing): on a steep stair
    // (a riser over 208 mm, where `below` is held at 250 mm) the band alone would stop short of it.
    const band = clipToConvex(
      [
        [0, Math.min(Math.round(h(0) - below), base)],
        [run, Math.round(h(run) - below)],
        [run, Math.round(h(run) + above)],
        [0, Math.round(h(0) + above)],
      ],
      rect(0, z0, run, head).outer,
    );
    keep(out.stringers, band ? section(f, band.outer, c0, c0 + sw) : null);
    keep(out.stringers, band ? section(f, band.outer, c1 - sw, c1) : null);
    const edges: Array<{ side: Side; strip: [number, number]; past: number; cc: number }> = [
      { side: yRun ? "left" : "top", strip: [c0 - D.probe * MM, c0], past: c0 - D.probe * MM, cc: c0 + sw / 2 },
      { side: yRun ? "right" : "bottom", strip: [c1, c1 + D.probe * MM], past: c1 + D.probe * MM, cc: c1 - sw / 2 },
    ];
    // Along the run, `d` from the foot: the plan's run coordinate the other way round.
    const r0 = runCoordinate(f, 0);
    const dir = runCoordinate(f, 1) - r0;
    const dOf = (r: number): number => dir * (r - r0);
    for (const { side, strip, past, cc } of edges) {
      // The stretches of this edge that the stair's other flights or its landings lie past (a
      // dog-leg's two flights side by side, a flight beside a landing: RM8.6b n1) are taken out; each
      // stretch left is probed at its own middle, a wall closing it or nothing past it.
      const touching = (boxes: readonly Box2[]) =>
        boxes.filter(([a, b, c, d]) => {
          const [x0, x1] = yRun ? [a, c] : [b, d];
          const [y0, y1] = yRun ? [b, d] : [a, c];
          return (
            x0 < strip[1] && x1 > strip[0] && y1 > Math.min(r0, r0 + dir * run) && y0 < Math.max(r0, r0 + dir * run)
          );
        });
      const byFlight = touching(flightBoxes.filter((_, j) => j !== i)).length > 0;
      const covered = [...flightBoxes.filter((_, j) => j !== i), ...landingBoxes]
        .filter(([a, b, c, d]) => {
          const [x0, x1] = yRun ? [a, c] : [b, d];
          const [y0, y1] = yRun ? [b, d] : [a, c];
          return (
            x0 < strip[1] && x1 > strip[0] && y1 > Math.min(r0, r0 + dir * run) && y0 < Math.max(r0, r0 + dir * run)
          );
        })
        .map(([a, b, c, d]): [number, number] => {
          const [y0, y1] = yRun ? [b, d] : [a, c];
          const [da, db] = [dOf(y0), dOf(y1)].sort((x, y) => x - y) as [number, number];
          return [Math.max(0, da), Math.min(run, db)];
        });
      // A stretch shorter than the newel that would end its rail counts as covered (S1).
      const free = freeRuns(0, run, covered, np);
      const open = free.filter(([da, db]) => !solidAt(planAt(f, Math.round((da + db) / 2), past)));
      const against = free.length === 0 ? (byFlight ? "flight" : "landing") : open.length === 0 ? "wall" : "open";
      out.sides.push({ of: `flight ${i + 1}`, side, against });
      const ra = Math.round(cc - railW / 2);
      const lean = Math.ceil((slope * bb) / 2) + MM;
      const ba = Math.round(cc - bb / 2);
      const na = Math.round(cc - np / 2);
      for (const [da, db] of open) {
        keep(
          out.rails,
          section(
            f,
            [
              [da, Math.round(h(da) + railH - railW)],
              [db, Math.round(h(db) + railH - railW)],
              [db, Math.round(h(db) + railH)],
              [da, Math.round(h(da) + railH)],
            ],
            ra,
            ra + railW,
          ),
        );
        // A baluster under the middle of each tread along the stretch: its foot inside the
        // stringer's sloping top, its head inside the rail's sloping underside (`lean` covers the
        // slope across its width).
        for (let t = 0; t < n; t++) {
          const dm = Math.round((line(t) + line(t + 1)) / 2);
          if (dm - bb / 2 < da || dm + bb / 2 > db) continue;
          keep(
            out.rails,
            solid(
              planBox(f, dm - bb / 2, dm + bb / 2, ba, ba + bb),
              Math.round(h(dm) + above) - lean,
              Math.round(h(dm) + railH - railW) + lean,
            ),
          );
        }
        // A newel centred on each end of the flight the stretch reaches: from the floor (or landing)
        // the flight starts on, and from its last tread at the head, to `newelAbove` over the
        // handrail there.
        for (const [d, za] of [
          [0, base],
          [run, riserTop(climbed + n)],
        ] as const) {
          if (d !== da && d !== db) continue;
          const nb = planBox(f, d - np / 2, d + np / 2, na, na + np);
          keep(out.rails, solid(nb, za, Math.round(h(d) + railH + D.newelAbove * MM)));
          newels.push(nb);
        }
      }
    }
    climbed += n + 1;
    const landing = stair.landings?.[i];
    if (landing && i < flights.length - 1) {
      const top = riserTop(climbed);
      base = top;
      const box: Box2 = [landing.at[0], landing.at[1], landing.at[0] + landing.size.w, landing.at[1] + landing.size.h];
      keep(out.treads, solid(box, z0, top));
      landings.push({ box, top, going: Math.round(g * MM), k: i + 1 });
    }
  });
  // A landing's edges, once every newel stands. Along each edge, the stretches a flight arrives on or
  // leaves from (any flight whose rectangle touches the edge from outside: a dog-leg's two, side by
  // side) are taken out first (review M1 on PR #729: a single probe at the edge's middle missed
  // them); each stretch left is probed at its own middle, and an open one takes a level rail inside
  // the edge, stopping where a newel or an earlier rail already stands.
  const taken: Box2[] = [...newels];
  for (const { box, top, going, k } of landings) {
    const [x0, y0, x1, y1] = box;
    const p = D.probe * MM;
    const edges: Array<{ side: Side; horizontal: boolean; at: number; out: 1 | -1 }> = [
      { side: "top", horizontal: true, at: y0, out: -1 },
      { side: "right", horizontal: false, at: x1, out: 1 },
      { side: "bottom", horizontal: true, at: y1, out: 1 },
      { side: "left", horizontal: false, at: x0, out: -1 },
    ];
    const railTop = top + D.landingRailHeight * MM;
    for (const { side, horizontal, at, out: dir } of edges) {
      const [a0, a1] = horizontal ? [x0, x1] : [y0, y1];
      // The strip `p` deep outside the edge, and the flights that overlap it.
      const [s0, s1] = dir > 0 ? [at, at + p] : [at - p, at];
      const flightRuns = flightBoxes
        .filter(([fa, fb, fc, fd]) =>
          horizontal ? fb < s1 && fd > s0 && fa < a1 && fc > a0 : fa < s1 && fc > s0 && fb < a1 && fd > a0,
        )
        .map(([fa, fb, fc, fd]): [number, number] => (horizontal ? [fa, fc] : [fb, fd]));
      const free = freeRuns(a0, a1, flightRuns, np);
      const open = free.filter(([r0, r1]) => {
        const m = Math.round((r0 + r1) / 2);
        return !solidAt(horizontal ? [m, at + dir * p] : [at + dir * p, m]);
      });
      const sideAt = out.sides.length;
      out.sides.push({
        of: `landing ${k}`,
        side,
        against: free.length === 0 ? "flight" : open.length === 0 ? "wall" : "open",
      });
      let railed = false;
      const across: [number, number] =
        side === "top"
          ? [y0, y0 + railW]
          : side === "bottom"
            ? [y1 - railW, y1]
            : side === "left"
              ? [x0, x0 + railW]
              : [x1 - railW, x1];
      for (const [r0, r1] of open) {
        // What a newel or an earlier rail already holds along this edge's rail band.
        const held = taken
          .filter((b) => (horizontal ? b[1] < across[1] && b[3] > across[0] : b[0] < across[1] && b[2] > across[0]))
          .map((b): [number, number] => (horizontal ? [b[0], b[2]] : [b[1], b[3]]));
        for (const [q0, q1] of freeRuns(r0, r1, held, np)) {
          const b: Box2 = horizontal ? [q0, across[0], q1, across[1]] : [across[0], q0, across[1], q1];
          keep(out.rails, solid(b, railTop - railW, railTop));
          taken.push(b);
          railed = true;
          const len = q1 - q0;
          const count = Math.max(1, Math.min(64, Math.floor(len / going)));
          const mid = Math.round((across[0] + across[1] - bb) / 2);
          for (let j = 0; j < count; j++) {
            const c = Math.round(q0 + (len * (2 * j + 1)) / (2 * count) - bb / 2);
            const bal: Box2 = horizontal ? [c, mid, c + bb, mid + bb] : [mid, c, mid + bb, c + bb];
            keep(out.rails, solid(bal, top, railTop - railW + MM));
          }
        }
      }
      // Open, but every open stretch already held by a flight's newels (RM8.6b n4): nothing built.
      if (open.length > 0 && !railed) (out.sides[sideAt] as StairSide).against = "newel";
    }
  }
  return {
    treads: out.treads,
    stringers: out.stringers,
    rails: out.rails,
    risers: R,
    dropped: out.dropped,
    sides: out.sides,
    dims: {
      tread: T / MM,
      nosing: nosings,
      stringer: { width: sw / MM, above: above / MM, below: below / MM },
      balustrade: {
        height: D.railHeight,
        rail: [D.rail, D.rail],
        baluster: bb / MM,
        newel: np / MM,
        newel_above: D.newelAbove,
        landing_height: D.landingRailHeight,
      },
    },
  };
}
