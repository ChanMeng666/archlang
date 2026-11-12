/**
 * The trim of a doorway and a window (product-roadmap card RM8.6; design
 * `docs/plans/product-roadmap/design/visual-language.md` §2.1, §2.2), as parts of the opening's
 * node, every size a clamped share of the host wall's thickness `t`, rounded to a whole millimetre:
 *
 * - a door (every kind) and a cased `opening`: a lining on the two jamb faces and the head, `l` =
 *   0.1 t in [12, 25] thick along the wall; a door's in two halves across the wall, a 40 mm slot
 *   between them for the leaf (which keeps its length and place, so it stays the core's `doorLeaves`
 *   leaf); and a casing (architrave) on each wall face, `c` = 0.35 t in [50, 90] wide and `p` =
 *   0.1 t in [10, 20] proud, its legs from the floor to the head, its head piece over the full width,
 *   cut at the wall's top (none when the head is at the top). A barn door has no casing on the face
 *   its panel hangs on (the core's `swing`), a garage door none at all, a door on a curved host none
 *   (its lining follows the arc), and a leg that would stand in another wall (a doorway at a corner)
 *   is left out, never shortened;
 * - a window: on the interior half of the cut, a reveal lining 0.075 t in [10, 20] on the jambs and
 *   the head, in the frame's colour; on its sill, an exterior sill 0.15 t in [20, 40] thick, proud
 *   of the outside face by 0.2 t and past each jamb by 0.2 t (the core's `SILL_PROJECTION` and
 *   `SILL_HORN`, of the host's own `t`), and an interior board 0.1 t in [18, 30] thick, past the
 *   inside face and each jamb by 0.1 t in [15, 30]. Which face is outside is the core's own rule
 *   (`exteriorNormal`, `src/elements/window.ts`): one wall thickness off each face, the side with no
 *   room or void of the storey there. Inside on both sides (an interior window): a reveal on both
 *   halves, no sill; on neither (a free-standing wall): nothing. A window with no sill (`sill 0`)
 *   has neither sill nor board. At a mitred end (a window run to a corner) a sill or a board stops
 *   on the mitre, past no jamb; on a curved host the reveals follow the arc and the sill and the
 *   board stay inside the cut.
 *
 * Every part is square to its wall, built in its jamb frame and rounded to whole micrometres; every
 * shell closed (`prism`). Each default is ledgered per opening (ADR 0030 decision 5).
 */
import type { Assumption, Level, Opening, Polygon, Pt } from "../scene3d/types.js";
import { overlapArea } from "../scene3d/overlap.js";
import { type CutSector, cutSector, sectorBand, where } from "./extrude.js";
import type { Shell } from "./types.js";

const MM = 1000;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** A share of `t` mm, rounded to a whole millimetre and clamped (design §2). */
const share = (k: number, t: number, lo: number, hi: number): number => clamp(Math.round(k * t), lo, hi);

/** The trim's sizes (mm) for a host `t` mm thick (design §2.1, §2.2). */
export const OPENING_DETAIL = {
  /** The slot a door's lining leaves for its leaf: the leaf's own thickness (`LEAF_MM`). */
  slot: 40,
  lining: (t: number): number => share(0.1, t, 12, 25),
  casingWidth: (t: number): number => share(0.35, t, 50, 90),
  casingProud: (t: number): number => share(0.1, t, 10, 20),
  sillThickness: (t: number): number => share(0.15, t, 20, 40),
  /** The core's `SILL_PROJECTION` and `SILL_HORN` (both 0.2 of the host's thickness). */
  sillProjection: (t: number): number => Math.round(0.2 * t),
  sillHorn: (t: number): number => Math.round(0.2 * t),
  boardThickness: (t: number): number => share(0.1, t, 18, 30),
  boardOverhang: (t: number): number => share(0.1, t, 15, 30),
  reveal: (t: number): number => share(0.075, t, 10, 20),
  /** The window frame's half depth (`FRAME_DEPTH_MM` / 2): where the reveal and the sills start. */
  frameHalfDepth: 30,
} as const;

/** One part of an opening's node: its name and its shells (a `null` one was degenerate). */
export interface TrimPart {
  part: "lining" | "casing" | "sill" | "board" | "reveal";
  shells: Array<Shell | null>;
}

/** What the trim is built against: the opening's storey and its host. */
export interface TrimContext {
  /** The storey's floor level (µm). */
  e: number;
  /** The host's thickness (µm). */
  t: number;
  /** The head as built (µm over `e`; the opening's head capped at the host's built top). */
  head: number;
  /** The host's built top (µm over `e`). */
  top: number;
  level: Level;
  /** The extruder `build.ts` counts degenerate holes with. */
  prism: (poly: Polygon, z0: number, z1: number) => Shell | null;
}

/**
 * An opening's jamb frame: `u` along the centreline from `jambs[0]` to `jambs[1]` (0 … `w`), `v`
 * across it toward the core's `+normal` (the side a door's `swing in` opens to, `doorSwing`).
 */
interface JambFrame {
  w: number;
  at: (u: number, v: number) => Pt;
  /** A plan rectangle over `u0..u1` × `v0..v1` in this frame (corners in order). */
  quad: (u0: number, u1: number, v0: number, v1: number) => Polygon;
}

function jambFrame(o: Opening): JambFrame | null {
  const [j0, j1] = o.jambs;
  const dx = j1[0] - j0[0];
  const dy = j1[1] - j0[1];
  const w = Math.hypot(dx, dy);
  if (!(w > 0)) return null;
  const [ux, uy] = [dx / w, dy / w];
  const at = (u: number, v: number): Pt => [Math.round(j0[0] + u * ux - v * uy), Math.round(j0[1] + u * uy + v * ux)];
  return {
    w,
    at,
    quad: (u0, u1, v0, v1) => ({ outer: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)] }),
  };
}

/** `p` in the frame's (u, v), µm (the inverse of `at`, unrounded). */
function toFrame(o: Opening, p: Pt): [number, number] {
  const [j0, j1] = o.jambs;
  const w = Math.hypot(j1[0] - j0[0], j1[1] - j0[1]) || 1;
  const [ux, uy] = [(j1[0] - j0[0]) / w, (j1[1] - j0[1]) / w];
  const [dx, dy] = [p[0] - j0[0], p[1] - j0[1]];
  return [dx * ux + dy * uy, -dx * uy + dy * ux];
}

/**
 * Where the cut's end at `u = 0` (`end` 0) or at `u = w` (`end` 1) lies at depth `v`: a straight end
 * stays at its jamb; a mitred one (a window run to a corner, its two corners more than 1 mm apart
 * along the wall) is the line through those two corners, as the core stops the window's every line
 * on it (`cornerMitre`). `null` when the cut is not the four corners of a straight host.
 */
function cutEnds(o: Opening, w: number): { mitred: [boolean, boolean]; u: (end: 0 | 1, v: number) => number } | null {
  if (o.cut.length !== 4) return null;
  const pts = o.cut.map((p) => toFrame(o, p)).sort((a, b) => a[0] - b[0]);
  const ends = [pts.slice(0, 2), pts.slice(2)] as [Array<[number, number]>, Array<[number, number]>];
  const mitred = ends.map((e) => Math.abs((e[0] as [number, number])[0] - (e[1] as [number, number])[0]) > MM) as [
    boolean,
    boolean,
  ];
  return {
    mitred,
    u: (end, v) => {
      if (!mitred[end]) return end === 0 ? 0 : w;
      const [a, b] = ends[end] as [[number, number], [number, number]];
      return a[1] === b[1] ? a[0] : a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]);
    },
  };
}

/** Whether plan point `p` lies in one of the storey's rooms or voids (the core's `floorAt`). */
function floorAt(level: Level, p: Pt): boolean {
  return (
    level.floors.some((f) => where(p, f.polygon.outer) === true) ||
    level.voids.some((v) => p[0] > v.at[0] && p[0] < v.at[0] + v.size.w && p[1] > v.at[1] && p[1] < v.at[1] + v.size.h)
  );
}

/**
 * The side of the frame (`+1`: `+v`, `−1`: `−v`) a room or void lies on, one wall thickness off each
 * face at the opening's centre (the core's `exteriorNormal`, through `wallFaceProbes`): `"both"` for
 * an interior window, `null` for one on a free-standing wall.
 */
export function insideOf(o: Opening, t: number, level: Level): 1 | -1 | "both" | null {
  const f = jambFrame(o);
  if (!f) return null;
  const mid = f.w / 2;
  const d = Math.max(t, 1);
  const plus = floorAt(level, f.at(mid, d));
  const minus = floorAt(level, f.at(mid, -d));
  return plus && minus ? "both" : plus ? 1 : minus ? -1 : null;
}

/** More overlap than this (µm², 1 mm²) is a clash; less is the rounding of two faces that touch. */
const CLASH_UM2 = 1e6;

const boxPoly = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  outer: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
});

/**
 * What a casing piece at plan polygon `poly` would stand in, or `null`: a wall's body or a column of
 * the storey (a doorway at a corner), a piece of furniture placed against the wall there (a casing
 * leg only: it runs down to the floor), or another opening's doorway, its cut and a casing's depth
 * off each face (two doorways side by side, whose casings would overlap).
 */
function clash(o: Opening, level: Level, poly: Polygon, leg: boolean): string | null {
  const hit = (q: Polygon): boolean => overlapArea(q, poly) > CLASH_UM2;
  if (level.walls.some((w) => w.body.some(hit))) return "wall";
  if (level.columns.some((c) => hit(boxPoly(c.at[0], c.at[1], c.at[0] + c.size.w, c.at[1] + c.size.h))))
    return "column";
  if (
    leg &&
    level.furniture.some((f) =>
      hit(
        boxPoly(
          f.centre[0] - f.size.w / 2,
          f.centre[1] - f.size.d / 2,
          f.centre[0] + f.size.w / 2,
          f.centre[1] + f.size.d / 2,
        ),
      ),
    )
  )
    return "furniture";
  const host = new Map(level.walls.map((w) => [w.id, w.thickness] as const));
  for (const b of level.openings) {
    if (b.id === o.id) continue;
    const fb = jambFrame(b);
    const hb = (host.get(b.host) ?? 0) / 2 + OPENING_DETAIL.casingProud(Number.POSITIVE_INFINITY) * MM;
    if (fb && hit(fb.quad(0, fb.w, -hb, hb))) return `opening ${b.id}`;
  }
  return null;
}

/**
 * The other opening of the storey whose cut overlaps this one's (two walls drawn over each other,
 * each with its opening there), or `null`: such an opening gets no trim, since each one's lining
 * would stand in the other's.
 */
function cutOverlap(o: Opening, level: Level): string | null {
  const own = { outer: o.cut };
  for (const b of level.openings) if (b.id !== o.id && overlapArea({ outer: b.cut }, own) > CLASH_UM2) return b.id;
  return null;
}

/** A lining of thickness `l` on a curved host: the two jambs and the head, across `[v0, v1]`. */
function curvedLining(
  sector: CutSector,
  l: number,
  bands: ReadonlyArray<readonly [number, number]>,
  z0: number,
  head: number,
  withHead: boolean,
  prism: TrimContext["prism"],
): Array<Shell | null> {
  const f = Math.min(0.5, l / (sector.r * Math.abs(sector.sweep)));
  return bands.flatMap(([v0, v1]) => [
    prism(sectorBand(sector, v0, v1, 0, f), z0, head),
    prism(sectorBand(sector, v0, v1, 1 - f, 1), z0, head),
    ...(withHead && f < 0.5 ? [prism(sectorBand(sector, v0, v1, f, 1 - f), head - l, head)] : []),
  ]);
}

/**
 * A doorway's lining and casing (a door of any kind, or a cased `opening`), and the ledger rows that
 * say what was assumed. Nothing for an opening with no width.
 */
export function doorTrim(o: Opening, ctx: TrimContext): { parts: TrimPart[]; ledger: Assumption[] } {
  const ledger: Assumption[] = [];
  const parts: TrimPart[] = [];
  const f = jambFrame(o);
  if (!f) return { parts, ledger };
  const { e, t, head, top, prism } = ctx;
  const tm = t / MM;
  const kind = o.kind;
  const door = kind === "door";
  const sector = cutSector(o.cut, o.jambs, o.centre);
  // No trim where it cannot stand: a cut another opening's overlaps, or a door on a curved host,
  // whose closed leaf is the chord between its jambs (inside the arc's lining).
  const blocked = cutOverlap(o, ctx.level);
  if (blocked || (door && sector)) {
    ledger.push({
      kind,
      id: o.id,
      field: "trim",
      value: blocked ? `cut overlaps ${blocked}` : "curved host",
      provenance: "default",
      rule: "door-trim-omitted",
    });
    return { parts, ledger };
  }
  const l = OPENING_DETAIL.lining(tm) * MM;
  const slot = (OPENING_DETAIL.slot * MM) / 2;
  const half = t / 2;
  const z0 = e + o.sill;
  const zh = e + head;
  const withHead = head < top;
  // A door's lining is in two halves either side of its leaf's slot; a cased opening's is whole.
  const bands: Array<[number, number]> = door
    ? half - slot >= MM
      ? [
          [-half, -slot],
          [slot, half],
        ]
      : []
    : [[-half, half]];
  const lining: Array<Shell | null> = sector
    ? curvedLining(sector, l, bands, z0, zh, withHead, prism)
    : bands.flatMap(([v0, v1]) => [
        prism(f.quad(0, l, v0, v1), z0, zh),
        prism(f.quad(f.w - l, f.w, v0, v1), z0, zh),
        ...(withHead && f.w > 2 * l ? [prism(f.quad(l, f.w - l, v0, v1), zh - l, zh)] : []),
      ]);
  if (lining.length) parts.push({ part: "lining", shells: lining });
  ledger.push({
    kind,
    id: o.id,
    field: "lining_mm",
    value: bands.length
      ? { thickness: l / MM, ...(door ? { slot: OPENING_DETAIL.slot } : {}), head: withHead }
      : "omitted",
    provenance: "default",
    rule: bands.length ? "door-lining-default" : "door-lining-omitted",
  });
  // The casing, on each face the kind takes it on.
  const why = o.doorKind === "garage" ? "garage" : sector ? "curved" : null;
  if (why) {
    ledger.push({ kind, id: o.id, field: "casing", value: why, provenance: "default", rule: "door-casing-omitted" });
    return { parts, ledger };
  }
  const c = OPENING_DETAIL.casingWidth(tm) * MM;
  const p = OPENING_DETAIL.casingProud(tm) * MM;
  // A barn door's panel hangs on its `swing` face (the core's `door-panels.ts`): `in` is `+v`.
  const panel = o.doorKind === "barn" ? (o.swing === "out" ? -1 : 1) : 0;
  const casing: Array<Shell | null> = [];
  const omitted: string[] = [];
  const barTop = Math.min(head + c, top);
  for (const s of [1, -1] as const) {
    if (s === panel) {
      omitted.push(`${s > 0 ? "+" : "-"}face:barn`);
      continue;
    }
    const [v0, v1] = s > 0 ? [half, half + p] : [-half - p, -half];
    let [u0, u1] = [-c, f.w + c];
    const face = s > 0 ? "+face" : "-face";
    for (const end of [0, 1] as const) {
      const leg = end === 0 ? f.quad(-c, 0, v0, v1) : f.quad(f.w, f.w + c, v0, v1);
      const what = clash(o, ctx.level, leg, true);
      if (what) {
        // Left out, never shortened (design §2.1); the head piece then stops at that jamb.
        omitted.push(`${face}:${end === 0 ? "start" : "end"}:${what}`);
        if (end === 0) u0 = 0;
        else u1 = f.w;
        continue;
      }
      casing.push(prism(leg, e, zh));
    }
    if (barTop > head) {
      const bar = f.quad(u0, u1, v0, v1);
      const what = clash(o, ctx.level, bar, false);
      if (what) omitted.push(`${face}:head:${what}`);
      else casing.push(prism(bar, zh, e + barTop));
    }
  }
  if (casing.length) parts.push({ part: "casing", shells: casing });
  ledger.push({
    kind,
    id: o.id,
    field: "casing_mm",
    value: { width: c / MM, proud: p / MM, head: barTop > head },
    provenance: "default",
    rule: "door-casing-default",
  });
  if (omitted.length)
    ledger.push({
      kind,
      id: o.id,
      field: "casing",
      value: omitted,
      provenance: "default",
      rule: "door-casing-omitted",
    });
  return { parts, ledger };
}

/** A window's reveal linings, exterior sill and interior board, and their ledger rows. */
export function windowTrim(o: Opening, ctx: TrimContext): { parts: TrimPart[]; ledger: Assumption[] } {
  const ledger: Assumption[] = [];
  const parts: TrimPart[] = [];
  const f = jambFrame(o);
  if (!f) return { parts, ledger };
  const { e, t, head, top, prism } = ctx;
  const tm = t / MM;
  const half = t / 2;
  const ff = Math.min(OPENING_DETAIL.frameHalfDepth * MM, half);
  const inside = insideOf(o, t, ctx.level);
  ledger.push({
    kind: "window",
    id: o.id,
    field: "inside",
    value: inside === null ? "neither" : inside === "both" ? "both" : inside > 0 ? "+normal" : "-normal",
    provenance: "derived",
    rule: "window-inside-probe",
  });
  if (inside === null) return { parts, ledger };
  const blocked = cutOverlap(o, ctx.level);
  if (blocked) {
    ledger.push({
      kind: "window",
      id: o.id,
      field: "trim",
      value: `cut overlaps ${blocked}`,
      provenance: "default",
      rule: "window-trim-omitted",
    });
    return { parts, ledger };
  }
  const sector = cutSector(o.cut, o.jambs, o.centre);
  const ends = sector ? null : cutEnds(o, f.w);
  const hasSill = o.sill > 0;
  const zs = e + o.sill;
  const zh = e + head;
  const withHead = head < top;
  const bt = OPENING_DETAIL.boardThickness(tm) * MM;
  const st = OPENING_DETAIL.sillThickness(tm) * MM;
  // The reveal: the interior half (both halves of an interior window), from the board (or the sill)
  // to the head; none at a mitred end, where the window turns the corner and has no jamb.
  const rl = OPENING_DETAIL.reveal(tm) * MM;
  const sides: Array<1 | -1> = inside === "both" ? [1, -1] : [inside];
  const reveal: Array<Shell | null> = [];
  if (half - ff >= MM) {
    for (const s of sides) {
      const [v0, v1] = s > 0 ? [ff, half] : [-half, -ff];
      const base = hasSill && inside !== "both" ? zs + bt : zs;
      if (sector) {
        // A millimetre off the frame: the arc's chords differ between the two bands, and the reveal
        // would otherwise overlap the frame by a sliver in the plane of its head.
        const k = sectorSign(o, sector);
        const [a, b] = s > 0 ? [ff + MM, half] : [-half, -ff - MM];
        reveal.push(
          ...curvedLining(
            sector,
            rl,
            [[a * k, b * k].sort((x, y) => x - y) as [number, number]],
            base,
            zh,
            withHead,
            prism,
          ),
        );
        continue;
      }
      const m0 = ends?.mitred[0] ?? false;
      const m1 = ends?.mitred[1] ?? false;
      if (!m0) reveal.push(prism(f.quad(0, rl, v0, v1), base, zh));
      if (!m1) reveal.push(prism(f.quad(f.w - rl, f.w, v0, v1), base, zh));
      const [a, b] = [m0 ? 0 : rl, m1 ? f.w : f.w - rl];
      if (withHead && b > a) reveal.push(prism(f.quad(a, b, v0, v1), zh - rl, zh));
    }
  }
  if (reveal.length) parts.push({ part: "reveal", shells: reveal });
  ledger.push({
    kind: "window",
    id: o.id,
    field: "reveal_mm",
    value: reveal.length ? { thickness: rl / MM, head: withHead } : "omitted",
    provenance: "default",
    rule: "window-reveal-lining",
  });
  if (inside === "both" || !hasSill) {
    ledger.push({
      kind: "window",
      id: o.id,
      field: "sill",
      value: inside === "both" ? "interior window" : "sill 0",
      provenance: "derived",
      rule: "window-sill-omitted",
    });
    return { parts, ledger };
  }
  const sIn = inside;
  const sOut = -inside as 1 | -1;
  const proj = OPENING_DETAIL.sillProjection(tm) * MM;
  const horn = OPENING_DETAIL.sillHorn(tm) * MM;
  const over = OPENING_DETAIL.boardOverhang(tm) * MM;
  /** A slab on side `s` from the frame's face to `reach` past the wall's, `past` beyond each jamb. */
  const slab = (s: 1 | -1, reach: number, past: number): Polygon => {
    const [va, vb] = s > 0 ? [ff, half + reach] : [-half - reach, -ff];
    if (!ends) return f.quad(-past, f.w + past, va, vb);
    const ua = (v: number): number => (ends.mitred[0] ? ends.u(0, v) : -past);
    const ub = (v: number): number => (ends.mitred[1] ? ends.u(1, v) : f.w + past);
    return { outer: [f.at(ua(va), va), f.at(ub(va), va), f.at(ub(vb), vb), f.at(ua(vb), vb)] };
  };
  if (sector) {
    const k = sectorSign(o, sector);
    const band = (s: 1 | -1): [number, number] =>
      (s > 0 ? [ff * k, half * k] : [-half * k, -ff * k]).sort((a, b) => a - b) as [number, number];
    const [o0, o1] = band(sOut);
    const [i0, i1] = band(sIn);
    parts.push({ part: "sill", shells: [prism(sectorBand(sector, o0, o1), zs, zs + st)] });
    parts.push({ part: "board", shells: [prism(sectorBand(sector, i0, i1), zs, zs + bt)] });
    ledger.push({
      kind: "window",
      id: o.id,
      field: "sill_mm",
      value: { thickness: st / MM, board: bt / MM },
      provenance: "default",
      rule: "window-sill-curved-inside-cut",
    });
    return { parts, ledger };
  }
  parts.push({ part: "sill", shells: [prism(slab(sOut, proj, horn), zs, zs + st)] });
  parts.push({ part: "board", shells: [prism(slab(sIn, over, over), zs, zs + bt)] });
  ledger.push(
    {
      kind: "window",
      id: o.id,
      field: "sill_mm",
      value: { thickness: st / MM, projection: proj / MM, horn: horn / MM, mitred: ends?.mitred ?? [false, false] },
      provenance: "default",
      rule: "window-sill-exterior",
    },
    {
      kind: "window",
      id: o.id,
      field: "board_mm",
      value: { thickness: bt / MM, overhang: over / MM },
      provenance: "default",
      rule: "window-board-interior",
    },
  );
  return { parts, ledger };
}

/**
 * On a curved host, how the frame's `+v` reads radially: `+1` when `+v` points away from the arc's
 * centre at the opening (a band at `r + d` is then on the `+v` side for `d > 0`), else `−1`.
 */
function sectorSign(o: Opening, sector: CutSector): 1 | -1 {
  const [j0, j1] = o.jambs;
  const [dx, dy] = [j1[0] - j0[0], j1[1] - j0[1]];
  const [nx, ny] = [-dy, dx];
  const [rx, ry] = [o.centre[0] - sector.c[0], o.centre[1] - sector.c[1]];
  return nx * rx + ny * ry >= 0 ? 1 : -1;
}
