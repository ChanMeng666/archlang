/**
 * Scene3D → Mesh3D (archlang-3d M1a, card A2). Every solid is a closed prism over a Scene3D polygon
 * (`extrude.ts`); no boolean is computed here, because the core's joinery already gave each wall its
 * owned pieces with the openings removed (`Wall.body`) and each opening its cut. What the plan does
 * not state is a labelled default in the ledger (ADR 0005).
 *
 * Per storey, at its elevation `e` (µm):
 * - slab: the rooms ∪ the storey's wall outline, less its voids, [e − 200 mm, e] (Q6, `slab.ts`);
 * - floor: each room, a 5 mm finish [e, e + 5 mm], a void inside it as a hole; a room overlapping
 *   an earlier one is lifted 0.5 mm per step (V-GEO-05, `Floor.lift`); laid in the finish its author
 *   wrote (`room … floor <word>`, `Floor.pattern`, `wordFinish`, card RM8.7), else the one its `uses`
 *   give it (`floorFinish`, ledgered `floor-finish-default`); either way in `extras.finish`;
 * - column: its box, [e, e + storey height];
 * - wall: its body pieces [e, e + h]; a wall or column whose whole plan lies under the slab of the
 *   storey above stops at that slab's underside, so the two never overlap or share a face (ledgered
 *   `stops-under-slab-above`). The stop truncates: a wall declared taller than its storey is cut at
 *   the underside too, and an opening in it whose head is past the underside is cut there, the slab
 *   its lintel (ledgered `head-at-slab-above`). Under each cut a sill [e, e + sill], over it a lintel
 *   [e + head, e + h] (§4.1 step 2; a cased opening's head at the wall top makes no lintel). The
 *   body's vertical edges are split at every sill and head that meets them, so body, sill and
 *   lintel meet vertex to vertex (no T-junction);
 * - a demolished wall (B3a): its own pieces [e, e + h], a ghost keyed `wall:<id>:demolish` with
 *   `extras.status` "demolish", never one of the standing walls;
 * - door: leaves 40 mm thick, [e + sill, e + head]. Closed by default (Q11): the core's leaves for a
 *   swinging door, one panel across the jambs for every other kind. `doors: "plan"` (`--doors plan`)
 *   swings each of the core's leaves to the pose the plan draws (`openLeaf`); a kind that sweeps no
 *   leaf (or a pre-A7 Scene3D leaf without its open tip) keeps its closed panel, ledgered. The 3D
 *   leaf is a fixed 40 mm (at most half the leaf) where the core draws max(40 mm, 2 pens) capped at
 *   6 % of the width, so the two slabs can differ by a few mm in thickness; both share the hinge
 *   edge on the open radius and lie inside the one sector (not a misalignment). Its trim (card
 *   RM8.6, `openings.ts`): a lining on the jambs and head in two halves either side of the leaf's
 *   slot (`door:<id>:lining`) and a casing on each face (`door:<id>:casing`); a cased `opening` gets
 *   the same, its lining whole;
 * - window: a 16 mm glass pane across the jambs and a 40 × 60 mm frame (§4.3), every part kept
 *   inside its cut; on a curved host both follow the arc from jamb face to jamb face (`cutSector`).
 *   Its trim (card RM8.6, `openings.ts`): a reveal lining on the inside half (`window:<id>:reveal`),
 *   an exterior sill proud of the outside face and past the jambs (`sill`) and an interior board
 *   (`board`), the outside found as the core finds it for its sill;
 * - furniture: a T0 parametric piece (`t0.ts`) fitted to its footprint for the families it covers
 *   (on the floor finish, or hung at its family's mount), each part's shell carrying its material
 *   slot (`materials.ts`), else a grey box on the floor finish, its height a per-family default;
 * - stair (card X3; in its parts since card RM8.6, `stairDetail`): tread boards with open risers and
 *   solid landings (`stair:<id>`; a `winders` landing as its tapered treads, one riser each, card
 *   RM1.2g), two stringers a flight (`stair:<id>:stringer`) and a balustrade
 *   on each edge with no wall past it (`stair:<id>:rail`), on the floor finish of the storey it
 *   climbs from, up to the next storey's floor finish (`stair.ts`): a `dir up` stair climbs from its own storey; a `dir down`
 *   one is the same stair seen from above when the storey below holds a `dir up` stair of its id
 *   (built there, once), else it is built from the storey below. The void above stays as the plan
 *   puts it. A stair on the top storey climbs that storey's height; a `dir down` stair on the lowest
 *   storey has nothing to climb from and is not built; both are ledgered;
 * - roof: a 150 mm flat slab on the storey's ring at the top of its tallest wall, hidden (Q7, D3);
 * - outdoor surface (card RM8.3): a thin slab [e - 50 mm, e], its top the floor level, lifted a step
 *   where it overlaps the slab, a floor or an earlier surface; fence: its style's posts (on the core's
 *   ticks), rails and pickets on the floor level (`outdoor.ts`, every default ledgered).
 * The ground round the building is the viewer's, never a node (`GROUND_PLANE`, `materials.ts`), and
 * so are the soft contact shadows (`CONTACT_SHADOW`, card RM8.8); the ledger says both.
 */
import {
  CONTACT_SHADOW,
  floorFinish,
  GROUND_PLANE,
  GROUND_WASH,
  STAIR_MATERIAL,
  STAIR_RAIL_MATERIAL,
  TRIM_MATERIAL,
  wordFinish,
} from "../materials.js";
import { FLOOR_LIFT_UM, FLOOR_OVERLAP_MIN_UM2, overlapArea } from "../scene3d/overlap.js";
import type { Assumption, Level, Polygon, Pt, Scene3D, Stair } from "../scene3d/types.js";
import { cutSector, degenerateHoles, insideCut, prism as extrude, rect, sectorBand, slab2d } from "./extrude.js";
import { coveredBy, type Rect, rectMinus, slabRegion } from "./slab.js";
import { storeyTrim, type TrimInput } from "./openings.js";
import { stairDetail } from "./stair.js";
import {
  CORE_POST_PITCH_MM,
  FENCE_HEIGHT_MM,
  FENCE_PROFILES,
  type FenceProfile,
  fenceColour,
  fencePieces,
  OUTDOOR_MM,
  outdoorColour,
  tintOf,
} from "./outdoor.js";
import { isHung, T0_DEFAULTS, T0_HEIGHT_MM, T0_HUNG_FROM_TOP, T0_MATERIALS, T0_MOUNT_MM, t0Shells } from "./t0.js";
import type { Mesh3D, MeshNode, NodeKind, Shell, Stage } from "./types.js";

const MM = 1000;

/** A `CONTACT_SHADOW` width rule as the ledger states it: `clamp(round(of × <size>), min, max)` mm. */
const shadowRule = (r: { of: number; minMm: number; maxMm: number }, size: string) => ({
  of: r.of,
  size,
  min: r.minMm,
  max: r.maxMm,
});
export const SLAB_MM = 200;
export const FLOOR_FINISH_MM = 5;
export const ROOF_MM = 150;
export const LEAF_MM = 40;
export const GLASS_MM = 16;
export const FRAME_WIDTH_MM = 40;
export const FRAME_DEPTH_MM = 60;
export const FURNITURE_DEFAULT_MM = 750;

/**
 * Grey-box heights (mm) by catalogue family: rounded typical heights, drafting defaults, not
 * measurements of any product. A family not listed stands {@link FURNITURE_DEFAULT_MM} high.
 *
 * Every family listed here now has a T0 generator (cards V3, V5, V6), so the table is read only
 * when a T0 piece is built as a grey box after all: at a turn that is not a quarter turn (a
 * hand-made Scene3D; the core turns furniture by quarter turns only). It stays for that, and
 * because it is a public export of this package (removing it would break a consumer).
 */
export const FURNITURE_HEIGHT_MM: Readonly<Record<string, number>> = {
  bed: 500,
  double_bed: 500,
  bunk_bed: 1600,
  sofa: 800,
  armchair: 800,
  chair: 850,
  table: 750,
  dining_table: 750,
  desk: 750,
  wardrobe: 2000,
  bookshelf: 1800,
  fridge: 1800,
  stove: 900,
  kitchen_sink: 900,
  counter: 900,
  dishwasher: 850,
  washing_machine: 850,
  wc: 750,
  basin: 850,
  bath: 550,
  shower: 50,
  tv: 600,
  rug: 10,
};

const STAGE: Record<NodeKind, Stage> = {
  slab: "brief",
  floor: "rooms",
  column: "walls",
  wall: "walls",
  roof: "walls",
  door: "openings",
  window: "openings",
  opening: "openings",
  furniture: "fixtures",
  stair: "walls",
  // The site (card RM8.3): its surfaces are laid out with the slab, before the rooms; a fence rises
  // with the storey's walls.
  outdoor: "brief",
  fence: "walls",
};

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Point `t` along a→b by `d` µm. */
function along(a: Pt, b: Pt, d: number): Pt {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [Math.round(a[0] + ((b[0] - a[0]) / len) * d), Math.round(a[1] + ((b[1] - a[1]) / len) * d)];
}

const inRing = (p: Pt, r: readonly Pt[]): boolean => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i] as Pt;
    const b = r[j] as Pt;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/** `ring` as a Rect when it is exactly an axis-aligned rectangle, else null. */
function asRect(ring: readonly Pt[]): Rect | null {
  if (ring.length !== 4) return null;
  const xs = [...new Set(ring.map((p) => p[0]))];
  const ys = [...new Set(ring.map((p) => p[1]))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  const axis = ring.every((p, i) => {
    const q = ring[(i + 1) % 4] as Pt;
    return p[0] === q[0] || p[1] === q[1];
  });
  return axis ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
}

/** Whether the closed rectangle `r` overlaps `ring`'s interior at all (a corner inside, or crossing). */
function rectTouches(r: Rect, ring: readonly Pt[]): boolean {
  const corners: Pt[] = [
    [r[0], r[1]],
    [r[2], r[1]],
    [r[2], r[3]],
    [r[0], r[3]],
  ];
  if (corners.some((c) => inRing(c, ring))) return true;
  return ring.some((p) => p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]);
}

/**
 * A plan region less this storey's voids, as prism-ready polygons. An axis-aligned rectangle (most
 * rooms, many footprints) is cut exactly, so a void flush with a wall or straddling two rooms cuts
 * each one. Any other shape keeps a void as a hole only when it lies strictly inside, apart from
 * every other hole; otherwise the void is not cut there and the ledger says so (never silently).
 */
function lessVoids(outer: readonly Pt[], voids: Level["voids"], where: string, ledger: Assumption[]): Polygon[] {
  const rects = voids.map((v) => ({ id: v.id, r: [v.at[0], v.at[1], v.at[0] + v.size.w, v.at[1] + v.size.h] as Rect }));
  const box = asRect(outer);
  if (box) {
    let pieces: Rect[] = [box];
    for (const v of rects) pieces = pieces.flatMap((p) => rectMinus(p, v.r));
    return pieces.map((p) => rect(p[0], p[1], p[2], p[3]));
  }
  const holes: Pt[][] = [];
  const taken: Rect[] = [];
  for (const v of rects) {
    if (!rectTouches(v.r, outer)) continue;
    const corners = rect(v.r[0], v.r[1], v.r[2], v.r[3]).outer;
    const strict =
      corners.every((c) => inRing(c, outer)) &&
      !outer.some((p) => p[0] >= v.r[0] && p[0] <= v.r[2] && p[1] >= v.r[1] && p[1] <= v.r[3]) &&
      taken.every((t) => t[2] < v.r[0] || v.r[2] < t[0] || t[3] < v.r[1] || v.r[3] < t[1]);
    if (strict) {
      holes.push(corners);
      taken.push(v.r);
    } else {
      ledger.push({
        kind: "void",
        id: v.id,
        field: "cut",
        value: where,
        provenance: "default",
        rule: "void-not-cut-non-rect",
      });
    }
  }
  return [{ outer: [...outer], ...(holes.length ? { holes } : {}) }];
}

/** How the doors stand: `closed` (the default, Q11) or swung as the plan draws them (`plan`). */
export type DoorPose = "closed" | "plan";
export const DOOR_POSES: readonly DoorPose[] = ["closed", "plan"];

export interface MeshOptions {
  /** Default `closed`: every leaf across its doorway. `plan`: each swinging leaf at its drawn swing. */
  doors?: DoorPose;
}

/**
 * A leaf swung open as the core draws it: the slab along the open radius hinge → `end`, its
 * thickness `t` laid off toward the far jamb `f` (inside the quarter-disc, where the core's own
 * `leafSlab` puts it), the outer corner pulled onto the swing circle less a micrometre, so every
 * corner, rounded, stays inside the sector the leaf sweeps. `[hinge, end, tip, heel]`.
 */
export function openLeaf(h: Pt, f: Pt, end: Pt, t: number): Polygon {
  const r = Math.hypot(end[0] - h[0], end[1] - h[1]);
  const c = Math.hypot(f[0] - h[0], f[1] - h[1]);
  if (r === 0 || c === 0) return { outer: [h, h, h] };
  const tt = Math.min(t, r / 2);
  const ox = (end[0] - h[0]) / r;
  const oy = (end[1] - h[1]) / r;
  const ax = (f[0] - h[0]) / c;
  const ay = (f[1] - h[1]) / c;
  const reach = Math.sqrt(r * r - tt * tt) - 1;
  const p = (x: number, y: number): Pt => [Math.round(x), Math.round(y)];
  return {
    outer: [h, end, p(h[0] + ox * reach + ax * tt, h[1] + oy * reach + ay * tt), p(h[0] + ax * tt, h[1] + ay * tt)],
  };
}

/**
 * Whether an open leaf (`openLeaf`'s quadrilateral) passes through a standing wall: a point of its
 * mid-thickness line, sampled every twentieth of the way from the hinge to just short of the tip
 * (columns are not tested), strictly inside a
 * body piece and not in one of its holes. The hinge's own jamb is free (the cut removed the host
 * there), so the host needs no exception. The leaf is still built as the plan draws it; the caller
 * ledgers it (card A9: stress `s5-door-on-arc` swings a leaf through its curved host).
 */
export function leafThroughWall(leaf: Polygon, walls: ReadonlyArray<{ body: Polygon[] }>): boolean {
  const [h, end, , inner] = leaf.outer;
  if (!h || !end || !inner) return false;
  const ox = (inner[0] - h[0]) / 2;
  const oy = (inner[1] - h[1]) / 2;
  for (let k = 1; k <= 19; k++) {
    const s = k / 20;
    const p: Pt = [h[0] + (end[0] - h[0]) * s + ox, h[1] + (end[1] - h[1]) * s + oy];
    for (const w of walls)
      for (const piece of w.body)
        if (inRing(p, piece.outer) && !(piece.holes ?? []).some((r) => inRing(p, r))) return true;
  }
  return false;
}

function levelNodes(
  lv: Level,
  ledger: Assumption[],
  defaulted: Set<string>,
  isTop: boolean,
  doors: DoorPose,
  below?: Level,
  above?: Level,
): MeshNode[] {
  const e = lv.elevation;
  const out: MeshNode[] = [];
  /**
   * Degenerate holes `extrude` left out of the shells built since the last `node` call (and the
   * holes a T0 part was built without, `t0Shells`: degenerate, or touching its outline). Every
   * shell below is built in the arguments of (or just before) the `node` call it belongs to, so
   * `node` reads and resets this count for its own shells.
   */
  let holesLeftOut = 0;
  const prism: typeof extrude = (poly, z0, z1, splits) => {
    const s = extrude(poly, z0, z1, splits);
    if (s) holesLeftOut += degenerateHoles(poly);
    return s;
  };
  const node = (
    kind: NodeKind,
    id: string,
    order: number,
    shells: Array<Shell | null>,
    extras: MeshNode["extras"] = {},
    part?: string,
  ): void => {
    const ok = shells.filter((s): s is Shell => s !== null);
    // A refused shell (degenerate, or a hole touching its ring) is never dropped silently.
    if (ok.length < shells.length) {
      ledger.push({
        kind,
        id,
        field: "shells_dropped",
        value: shells.length - ok.length,
        provenance: "derived",
        rule: "shell-degenerate-or-touching-hole",
      });
    }
    // Nor is a degenerate hole a shell was built without (it cut nothing).
    if (holesLeftOut > 0) {
      ledger.push({
        kind,
        id,
        field: "holes_dropped",
        value: holesLeftOut,
        provenance: "derived",
        rule: "hole-degenerate",
      });
      holesLeftOut = 0;
    }
    if (ok.length === 0) return;
    out.push({
      key: `L${lv.level}/${kind}:${id}${part ? `:${part}` : ""}`,
      level: lv.level,
      kind,
      id,
      ...(part ? { part } : {}),
      stage: STAGE[kind],
      order,
      ...(kind === "roof" ? { hidden: true } : {}),
      extras,
      shells: ok,
    });
  };

  // Slab: the rooms ∪ the storey's wall outline, less its voids, below the floor level (§4.2).
  node(
    "slab",
    "slab",
    0,
    slabRegion(lv.footprint, lv.floors, ledger)
      .flatMap((r) => lessVoids(r.outer, lv.voids, "slab", ledger))
      .map((p) => prism(p, e - SLAB_MM * MM, e)),
    { thickness_mm: SLAB_MM },
  );

  // Floors: each room less the voids that fall in it.
  lv.floors.forEach((f, i) => {
    const pieces = f.polygon.holes?.length
      ? [f.polygon]
      : lessVoids(f.polygon.outer, lv.voids, `floor:${f.id}`, ledger);
    const z0 = e + (f.lift ?? 0);
    // Its finish: the author's `floor` word when the plan wrote one (card RM8.7), a stated fact and
    // so not ledgered; else from its declared uses (visual-assets V9), a drafting default, ledgered
    // per floor. A word this package does not know (a hand-made Scene3D) falls back to the default.
    const authored = wordFinish(f.pattern);
    const finish = authored ?? floorFinish(f.uses);
    if (authored === undefined)
      ledger.push({
        kind: "floor",
        id: f.id,
        field: "finish",
        value: finish,
        provenance: "default",
        rule: "floor-finish-default",
      });
    node(
      "floor",
      f.id,
      i,
      pieces.map((p) => prism(p, z0, z0 + FLOOR_FINISH_MM * MM)),
      {
        ...(f.uses?.length ? { uses: f.uses.join(" ") } : {}),
        ...(f.lift ? { lift_mm: f.lift / MM } : {}),
        finish,
      },
    );
  });

  // Under the storey above's slab, a wall or a column stops at the slab's underside (public-surfaces
  // X4 follow-up): the slab, [above − 200 mm, above], would otherwise share its outer face over
  // those 200 mm, two coplanar faces that fight in depth (a sliver along the storey joint in the
  // assembled view), and the two solids would overlap. It is stopped when its whole plan (a wall's
  // body pieces and its openings' cuts) lies in or on the slab above, less its voids (`coveredBy`:
  // a wall across a notch of the storey above, or under a stair's void, keeps its height). An
  // opening whose head reaches past the underside is cut there too: the slab is its lintel (ledgered
  // `head-at-slab-above`). A wall declared taller than its storey is cut at the underside all the
  // same: what the plan declares above it would stand inside the slab and the storey above. With no
  // storey above (one storey, or the top one), nothing is stopped.
  const ceiling = above ? above.elevation - SLAB_MM * MM - e : 0;
  const slabAbove =
    above && ceiling > 0
      ? slabRegion(above.footprint, above.floors, []).flatMap((r) => lessVoids(r.outer, above.voids, "slab", []))
      : [];
  const stopped = (height: number, rings: ReadonlyArray<readonly Pt[]>): boolean =>
    height > ceiling && ceiling > 0 && rings.every((r) => coveredBy(r, slabAbove));
  // The storey is in the field: an id may stand on several storeys.
  const stopLedger = (kind: string, id: string): void => {
    ledger.push({
      kind,
      id,
      field: `top_mm(L${lv.level})`,
      value: ceiling / MM,
      provenance: "derived",
      rule: "stops-under-slab-above",
    });
  };

  lv.columns.forEach((c, i) => {
    const box = rect(c.at[0], c.at[1], c.at[0] + c.size.w, c.at[1] + c.size.h);
    const stop = stopped(lv.storeyHeight, [box.outer]);
    if (stop) stopLedger("column", c.id);
    node("column", c.id, i, [prism(box, e, e + (stop ? ceiling : lv.storeyHeight))]);
  });

  // Stairs (card X3): each climb is built once, on the storey it climbs from. This storey's own
  // `dir up` stairs climb to the storey above (or this storey's height on the top storey); a
  // `dir down` stair of the storey above with no `dir up` stair of its id here climbs from here
  // too. A `dir down` stair here is the top of a climb built below, or, on the lowest storey, one
  // with nothing to climb from.
  const climbs: Array<{ s: Stair; order: number; rise: number; from: "own" | "above" }> = [];
  lv.stairs.forEach((s, i) => {
    if (s.dir === "up") {
      climbs.push({ s, order: i, rise: above ? above.elevation - e : lv.storeyHeight, from: "own" });
      if (!above) {
        ledger.push({
          kind: "stair",
          id: s.id,
          field: "rise_mm",
          value: lv.storeyHeight / MM,
          provenance: "default",
          rule: "stair-rise-storey-height",
        });
      }
    } else if (!below) {
      ledger.push({
        kind: "stair",
        id: s.id,
        field: "geometry",
        value: "omitted",
        provenance: "default",
        rule: "stair-down-no-storey-below",
      });
    }
  });
  (above?.stairs ?? []).forEach((s, i) => {
    const partnered = lv.stairs.some((t) => t.id === s.id && t.dir === "up");
    if (s.dir === "down" && !partnered && above)
      climbs.push({ s, order: lv.stairs.length + i, rise: above.elevation - e, from: "above" });
  });
  const stairFloor = e + FLOOR_FINISH_MM * MM;
  // The probe a stair's balustrade asks (card RM8.6): is this plan point inside a wall's body (not
  // in one of its openings) or a column of the storey?
  const solidAt = (p: Pt): boolean =>
    lv.walls.some((w) => w.body.some((b) => inRing(p, b.outer) && !(b.holes ?? []).some((r) => inRing(p, r)))) ||
    lv.columns.some((c) => p[0] > c.at[0] && p[0] < c.at[0] + c.size.w && p[1] > c.at[1] && p[1] < c.at[1] + c.size.h);
  for (const { s, order, rise, from } of climbs) {
    const solid = stairDetail(s, stairFloor, rise, solidAt);
    if (!solid) {
      ledger.push({
        kind: "stair",
        id: s.id,
        field: "geometry",
        value: "omitted",
        provenance: "default",
        rule: s.flights?.length ? "stair-rise-not-positive" : "stair-no-flights",
      });
      continue;
    }
    if (!defaulted.has("stair:defaults")) {
      defaulted.add("stair:defaults");
      ledger.push(
        {
          kind: "stair",
          field: "material",
          value: STAIR_MATERIAL,
          provenance: "default",
          rule: "stair-material-default",
        },
        // Card RM8.6: the handrails, balusters and newels in the walnut of the palette.
        {
          kind: "stair",
          field: "material(rail)",
          value: STAIR_RAIL_MATERIAL,
          provenance: "default",
          rule: "stair-rail-material-default",
        },
      );
    }
    // One riser per tread the plan draws, and one at each flight's head: derived, never assumed.
    ledger.push({
      kind: "stair",
      id: s.id,
      field: "risers",
      value: solid.risers,
      provenance: "derived",
      rule: "stair-risers-from-treads",
    });
    // Card RM1.2g: a winder landing is built as the tapered treads the plan's lines cut it into, one
    // riser each (counted in `risers` above): derived from the drawing, never assumed. Each tread is
    // solid down to the floor, as a level landing is, so its risers are closed, not the flights'
    // open ones (`risers_form` below).
    (s.landings ?? []).forEach((l, k) => {
      if (l.winders?.length)
        ledger.push(
          {
            kind: "stair",
            id: s.id,
            field: `winders(landing ${k + 1})`,
            value: l.winders.length,
            provenance: "derived",
            rule: "stair-winders-from-drawing",
          },
          {
            kind: "stair",
            id: s.id,
            field: `risers_form(landing ${k + 1})`,
            value: "solid",
            provenance: "default",
            rule: "stair-winders-solid",
          },
        );
    });
    // Its parts' sizes, each a share of its own riser, going and width (card RM8.6, design
    // `visual-language.md` §2.3), and what each probed edge met: the stair's own facts, per stair.
    const d = solid.dims;
    ledger.push(
      {
        kind: "stair",
        id: s.id,
        field: "tread_mm",
        value: { thickness: d.tread, nosing: d.nosing },
        provenance: "default",
        rule: "stair-tread-default",
      },
      { kind: "stair", id: s.id, field: "risers_form", value: "open", provenance: "default", rule: "stair-open-riser" },
      {
        kind: "stair",
        id: s.id,
        field: "stringer_mm",
        value: d.stringer,
        provenance: "default",
        rule: "stair-stringer-default",
      },
      ...(s.landings?.length
        ? [
            {
              kind: "stair",
              id: s.id,
              field: "landing",
              value: "solid",
              provenance: "default" as const,
              rule: "stair-landing-solid",
            },
          ]
        : []),
      {
        kind: "stair",
        id: s.id,
        field: "balustrade_mm",
        value: d.balustrade,
        provenance: "default",
        rule: "stair-balustrade-default",
      },
      ...solid.sides.map((x) => ({
        kind: "stair",
        id: s.id,
        field: `side(${x.of}, ${x.side})`,
        value: x.against,
        provenance: "derived" as const,
        rule: "stair-balustrade-side",
      })),
      // The guard round the void of the storey above is not built.
      ...(above
        ? [
            {
              kind: "stair",
              id: s.id,
              field: "void_guard",
              value: "omitted",
              provenance: "default" as const,
              rule: "stair-void-guard-omitted",
            },
          ]
        : []),
    );
    node("stair", s.id, order, [...solid.treads, ...Array.from({ length: solid.dropped }, () => null)], {
      dir: s.dir,
      width_mm: s.width / MM,
      flights: s.flights?.length ?? 0,
      risers: solid.risers,
      rise_mm: rise / MM,
      ...(from === "above" ? { from_storey_above: true } : {}),
    });
    node("stair", s.id, order, solid.stringers, {}, "stringer");
    if (solid.rails.length) node("stair", s.id, order, solid.rails, {}, "rail");
  }

  const openings = new Map(lv.openings.map((o) => [o.id, o] as const));
  const wallHeight = new Map(
    lv.walls.map((w) => {
      const cut = w.cuts.flatMap((id) => {
        const o = openings.get(id);
        return o ? [o] : [];
      });
      const stop = stopped(w.height, [...w.body.map((p) => p.outer), ...cut.map((o) => o.cut)]);
      if (!stop) return [w.id, w.height] as const;
      stopLedger("wall", w.id);
      for (const o of cut.filter((x) => x.head > ceiling)) {
        ledger.push({
          kind: o.kind,
          id: o.id,
          field: `head_mm(L${lv.level})`,
          value: ceiling / MM,
          provenance: "derived",
          rule: "head-at-slab-above",
        });
      }
      return [w.id, ceiling] as const;
    }),
  );
  const hostHeight = wallHeight;
  // Every cut corner's sill and head heights (µm above e): where a body's vertical edge is split,
  // so the body meets its sill and lintel vertex to vertex. Keyed by the plan point, not by the
  // host wall, on purpose: another wall with a vertex at a cut corner meets that sill or lintel
  // there too, and is split for it (aquarium's `partition_8` under the rotunda door `d_rot_n`'s
  // lintel; keyed by host it would meet the lintel mid-edge, a T-junction between the two nodes).
  const splitAt = new Map<string, number[]>();
  for (const o of lv.openings) {
    const h = hostHeight.get(o.host);
    if (h === undefined) continue;
    const hs = [...(o.sill > 0 ? [Math.min(o.sill, h)] : []), ...(o.head < h ? [o.head] : [])];
    for (const p of o.cut) {
      const k = `${p[0]},${p[1]}`;
      splitAt.set(k, [...(splitAt.get(k) ?? []), ...hs]);
    }
  }
  const splits = (p: Pt): number[] => (splitAt.get(`${p[0]},${p[1]}`) ?? []).map((h) => e + h);
  lv.walls.forEach((w, i) => {
    const height = wallHeight.get(w.id) ?? w.height;
    const top = e + height;
    const shells: Array<Shell | null> = w.body.map((p) => prism(p, e, top, splits));
    for (const id of w.cuts) {
      const o = openings.get(id);
      if (!o) continue;
      if (o.sill > 0) shells.push(prism({ outer: o.cut }, e, e + Math.min(o.sill, height)));
      if (o.head < height) shells.push(prism({ outer: o.cut }, e + o.head, top));
    }
    node("wall", w.id, i, shells, {
      ...(w.category ? { category: w.category } : {}),
      height_mm: w.height / MM,
      thickness_mm: w.thickness / MM,
    });
  });

  // Demolished walls (B3a): ghosts of the plan as drawn, solid, hosting nothing.
  (lv.demolished ?? []).forEach((w, i) => {
    node(
      "wall",
      w.id,
      lv.walls.length + i,
      w.body.map((p) => prism(p, e, e + w.height)),
      {
        ...(w.category ? { category: w.category } : {}),
        height_mm: w.height / MM,
        status: "demolish",
        thickness_mm: w.thickness / MM,
      },
      "demolish",
    );
  });

  const hostOf = new Map(lv.walls.map((w) => [w.id, w] as const));
  // A part's node is named `<kind>:<id>:<part>` (V-GLTF-02), so an id holding a `:`, a `/` or a
  // space cannot name one: such an opening (a passage the core names after its two rooms,
  // `opening between a and b`, `a|b:open`) keeps no trim, and the ledger says so.
  const nameless = (o: (typeof lv.openings)[number]): boolean => /[:/\s]/.test(o.id);
  // The trim (card RM8.6, `openings.ts`): every opening's at once, so it never depends on the order
  // the plan writes them in (RM8.6b), round the storey's walls, columns, doorways and furniture,
  // each piece of furniture at the heights it is built to below (RM8.6b n3).
  const trimInputs: TrimInput[] = lv.openings.flatMap((o) => {
    const host = hostOf.get(o.host);
    if (!host || nameless(o)) return [];
    const head = Math.min(o.head, hostHeight.get(o.host) ?? o.head);
    return [{ o, t: host.thickness, head, top: hostHeight.get(o.host) ?? host.height }];
  });
  const trims = storeyTrim(
    lv,
    trimInputs,
    e,
    (poly, a, b) => prism(poly, a, b),
    (f) => {
      const floor = FLOOR_FINISH_MM * MM;
      const family = f.asset.startsWith("t0:") ? f.asset.slice(3) : undefined;
      const turn = (((-f.yawDeg % 360) + 360) % 360) % 90 === 0;
      // A T0 piece at a turn that is not a quarter turn is built as a grey box (below), at its
      // category's grey-box height.
      if (!family || !turn) return [floor, floor + (FURNITURE_HEIGHT_MM[f.category] ?? FURNITURE_DEFAULT_MM) * MM];
      const h = (T0_HEIGHT_MM[family] ?? 0) * MM;
      if (T0_HUNG_FROM_TOP.has(family)) {
        // Hung by its top: its underside is its own size's (a television's 16:9 panel).
        const ys = (t0Shells(f, floor)?.shells ?? []).flatMap((sh) =>
          sh ? sh.positions.filter((_, k) => k % 3 === 1) : [],
        );
        return [ys.length ? Math.min(...ys) : floor, floor + h];
      }
      return [floor + (T0_MOUNT_MM[family] ?? 0) * MM, floor + h];
    },
  );
  lv.openings.forEach((o, i) => {
    const [j0, j1] = o.jambs;
    // A leaf or frame never stands above its wall: the head is capped at the host's top.
    const head = Math.min(o.head, hostHeight.get(o.host) ?? o.head);
    const extras = { host: o.host, width_mm: o.width / MM, sill_mm: o.sill / MM, head_mm: o.head / MM };
    // The trim (card RM8.6, `openings.ts`): a doorway's lining and casing, a window's reveal, sill
    // and board, each a part of the opening's node, every size a share of the host's thickness.
    const trim = trims.get(o.id);
    if (hostOf.has(o.host) && nameless(o)) {
      ledger.push({
        kind: o.kind,
        id: o.id,
        field: "trim",
        value: "the id names no part node",
        provenance: "default",
        rule: "opening-trim-omitted",
      });
    } else if (trim) {
      ledger.push(...trim.ledger);
      for (const t of trim.parts) {
        // The colour each part is built in, once per Mesh3D (card RM8.6, review m1): a drafting
        // default like every other, ledgered.
        const slot = `${o.kind}:${t.part}`;
        if (!defaulted.has(`trim:${slot}`)) {
          defaulted.add(`trim:${slot}`);
          ledger.push({
            kind: o.kind,
            field: `material(${t.part})`,
            value: TRIM_MATERIAL[slot as keyof typeof TRIM_MATERIAL] ?? o.kind,
            provenance: "default",
            rule: "trim-material-default",
          });
        }
        node(o.kind, o.id, i, t.shells, { host: o.host }, t.part);
      }
    }
    if (o.kind === "door") {
      const z0 = e + o.sill;
      const swung = o.leaves?.every((l) => l.length === 3) ? (o.leaves as Array<[Pt, Pt, Pt]>) : undefined;
      if (doors === "plan" && swung) {
        const open = swung.map(([h, f, end]) => openLeaf(h, f, end, LEAF_MM * MM));
        // The plan swings this leaf through a wall: reproduced as drawn, never silently.
        const through = open.some((leaf) => leafThroughWall(leaf, lv.walls));
        if (through) {
          ledger.push({
            kind: "door",
            id: o.id,
            field: "leaf",
            value: "through-wall",
            provenance: "derived",
            rule: "door-leaf-through-wall",
          });
        }
        node(
          "door",
          o.id,
          i,
          open.map((leaf) => prism(leaf, z0, e + head)),
          // `through_wall` rides on the node, so a GLB reader (whose file carries no ledger) sees it too.
          { ...extras, door_kind: o.doorKind ?? "hinged", pose: "plan", ...(through ? { through_wall: true } : {}) },
        );
        return;
      }
      if (doors === "plan") {
        // No swing to draw (a sliding, barn, bifold, pocket or garage door: the core's `doorLeaves`
        // gives none; or a pre-A7 leaf without its tip): it stays closed, and the ledger says so.
        ledger.push({
          kind: "door",
          id: o.id,
          field: "pose",
          value: "closed",
          provenance: "default",
          rule: "door-pose-plan-no-swing",
        });
      }
      const leaves = o.leaves ?? [[j0, j1]];
      node(
        "door",
        o.id,
        i,
        leaves.map(([h, f]) => prism(slab2d(h, f, LEAF_MM * MM), z0, e + head)),
        { ...extras, door_kind: o.doorKind ?? "hinged", pose: "closed" },
      );
    } else if (o.kind === "window") {
      const z0 = e + o.sill;
      const z1 = e + head;
      const fw = FRAME_WIDTH_MM * MM;
      const fd = FRAME_DEPTH_MM * MM;
      const sector = cutSector(o.cut, o.jambs, o.centre);
      if (sector) {
        // A curved host (red-team round 1): the jambs lie on the tangent at the opening's centre, so
        // a chord pane clipped to the cut ends short of the radial jamb faces and its jamb members
        // all but vanish. The pane and the frame follow the arc from jamb face to jamb face instead,
        // centred on the host's centreline; a jamb member spans the frame's width along the arc.
        const band = (depth: number, f0?: number, f1?: number): Polygon =>
          sectorBand(sector, -depth / 2, depth / 2, f0, f1);
        const f = Math.min(0.5, fw / (sector.r * Math.abs(sector.sweep)));
        node("window", o.id, i, [prism(band(GLASS_MM * MM), z0, z1)], extras, "glass");
        node(
          "window",
          o.id,
          i,
          [
            prism(band(fd, 0, f), z0, z1),
            prism(band(fd, 1 - f, 1), z0, z1),
            prism(band(fd), z0, z0 + fw),
            prism(band(fd), z1 - fw, z1),
          ],
          extras,
          "frame",
        );
        return;
      }
      // A straight host: every part already lies in its cut (`insideCut` keeps it as it is).
      const fit = (p: Polygon, a: number, b: number): Shell | null => {
        const q = insideCut(p, o.cut);
        return q ? prism(q, a, b) : null;
      };
      node("window", o.id, i, [fit(slab2d(j0, j1, GLASS_MM * MM), z0, z1)], extras, "glass");
      node(
        "window",
        o.id,
        i,
        [
          fit(slab2d(j0, along(j0, j1, fw), fd), z0, z1),
          fit(slab2d(along(j1, j0, fw), j1, fd), z0, z1),
          fit(slab2d(j0, j1, fd), z0, z0 + fw),
          fit(slab2d(j0, j1, fd), z1 - fw, z1),
        ],
        extras,
        "frame",
      );
    }
    // A cased opening (`kind: "opening"`) is the hole itself and its trim: nothing more to build.
  });

  const floorTop = e + FLOOR_FINISH_MM * MM;
  // The storey's tallest wall as declared: the roof's height (a roof is hidden, so it keeps it).
  const tallest = lv.walls.reduce((m, w) => Math.max(m, w.height), 0) || lv.storeyHeight;
  // The tallest wall as built (a wall stopped under the slab above stands at the underside): the line
  // a piece is checked against, so the ledger's "above walls" means above what is drawn.
  const tallestBuilt = lv.walls.reduce((m, w) => Math.max(m, wallHeight.get(w.id) ?? w.height), 0) || lv.storeyHeight;
  lv.furniture.forEach((f, i) => {
    const parts = t0Shells(f, floorTop);
    const family = parts ? f.asset.slice("t0:".length) : undefined;
    const h = family ? (T0_HEIGHT_MM[family] ?? 0) : (FURNITURE_HEIGHT_MM[f.category] ?? FURNITURE_DEFAULT_MM);
    if (!defaulted.has(f.category)) {
      defaulted.add(f.category);
      ledger.push({
        kind: "furniture",
        field: `height_mm(${f.category})`,
        value: h,
        provenance: "default",
        rule: family
          ? "furniture-height-t0"
          : f.category in FURNITURE_HEIGHT_MM
            ? "furniture-height-family"
            : "furniture-height-greybox",
      });
      // A wall-hung family's underside (visual-assets V5, V6): the core exports no height, so the
      // mount is this package's labelled default.
      const mount = family ? T0_MOUNT_MM[family] : undefined;
      if (mount !== undefined) {
        ledger.push({
          kind: "furniture",
          field: `mount_mm(${f.category})`,
          value: mount,
          provenance: "default",
          rule: "furniture-mount-default",
        });
      }
      // A further default the family is built with (`T0_DEFAULTS`: a pool's water at grade, RM8.9).
      for (const d of family ? (T0_DEFAULTS[family] ?? []) : []) {
        ledger.push({
          kind: "furniture",
          field: `${d.field}(${f.category})`,
          value: d.value,
          provenance: "default",
          rule: d.rule,
        });
      }
      // Its parts' materials (visual-assets V1): a property of the family, never of a label.
      const slots = family ? T0_MATERIALS[family] : undefined;
      if (slots?.length) {
        ledger.push({
          kind: "furniture",
          field: `material(${f.category})`,
          value: [...slots],
          provenance: "default",
          rule: "furniture-material-default",
        });
      }
    }
    const asset = parts ? f.asset : "greybox";
    if (f.asset !== asset) {
      // A T0 family at a turn that is not a quarter turn: the grey box stands, never silently.
      ledger.push({
        kind: "furniture",
        id: f.id,
        field: "asset",
        value: "greybox",
        provenance: "default",
        rule: "furniture-t0-not-quarter-turn",
      });
    }
    if (parts && family && isHung(family)) {
      // A piece hung by its top (a television) has an underside of its own size: ledgered per
      // piece, as built, never one figure for the family.
      if (T0_HUNG_FROM_TOP.has(family)) {
        const low = Math.min(...parts.shells.flatMap((s) => (s ? s.positions.filter((_, k) => k % 3 === 1) : [])));
        ledger.push({
          kind: "furniture",
          id: f.id,
          field: "mount_mm",
          value: (low - floorTop) / MM,
          provenance: "default",
          rule: "furniture-mount-from-top",
        });
      }
      // Hung at its default above walls that stop lower (a low or a short storey): drawn where the
      // default puts it, and said so.
      if (floorTop + h * MM > e + tallestBuilt) {
        ledger.push({
          kind: "furniture",
          id: f.id,
          field: "top_mm",
          value: h,
          provenance: "default",
          rule: "furniture-hung-above-walls",
        });
      }
    } else if (parts && family && floorTop + h * MM > e + tallestBuilt) {
      // A standing piece whose default height is above its storey's walls (a tree in the garden,
      // visual-assets V7): built at that height, never clipped to the walls, and said so.
      ledger.push({
        kind: "furniture",
        id: f.id,
        field: "top_mm",
        value: h,
        provenance: "default",
        rule: "furniture-above-walls",
      });
    }
    const [cx, cy] = f.centre;
    const box = rect(cx - f.size.w / 2, cy - f.size.d / 2, cx + f.size.w / 2, cy + f.size.d / 2);
    // A T0 part built without a hole (degenerate, or touching its outline) is ledgered by `node`.
    if (parts) holesLeftOut += parts.holesDropped;
    const shells = parts ? parts.shells : [prism(box, floorTop, floorTop + h * MM)];
    node("furniture", f.id, i, shells, {
      category: f.category,
      yaw_deg: f.yawDeg,
      asset,
      ...(f.room ? { room: f.room } : {}),
      ...(parts && f.mirror ? { mirror: true } : {}),
      // Hung on the wall, not standing (`isHung`): a fact of the piece as built, so a reader (the
      // replay's contact shadows, card RM8.8) needs neither the T0 tables nor the ledger, whose
      // per-piece rows name no storey. Absent on a standing piece.
      ...(parts && family && isHung(family) ? { hung: true } : {}),
    });
  });

  const roofZ = [e + tallest, e + tallest + ROOF_MM * MM] as const;
  lv.roofs.forEach((r, i) => {
    node("roof", r.id, i, [prism({ outer: r.ring }, ...roofZ)], { form: r.form });
  });
  // No roof written on the top storey: a flat one on its wall footprint (plan §4.5 RF1), hidden like any roof.
  if (isTop && lv.roofs.length === 0 && lv.footprint.length > 0) {
    ledger.push({
      kind: "roof",
      id: `L${lv.level}`,
      field: "ring",
      value: "wall footprint",
      provenance: "default",
      rule: "roof-default-footprint",
    });
    node(
      "roof",
      "roof",
      0,
      lv.footprint.map((ring) => prism({ outer: ring }, ...roofZ)),
      { form: "flat" },
    );
  }

  // The site (card RM8.3, `outdoor.ts`): each surface a thin slab whose top is the floor level; each
  // fence its style's profile. A surface never lies in the plane of a face it overlaps (review R1,
  // B1: a courtyard's patio over the slab fought it in depth): over the slab it stands one step
  // (0.5 mm, V-GEO-05's) above the slab's top; over an earlier surface one step above that one's
  // top; and it climbs a step more while its top would still meet the top of the slab, or the
  // bottom or the top of a floor, that it overlaps (> 1 cm²). Each lift is ledgered.
  const slabHere = slabRegion(lv.footprint, lv.floors, []).flatMap((r) => lessVoids(r.outer, lv.voids, "slab", []));
  const over = (p: Polygon, q: Polygon): boolean => overlapArea(p, q) > FLOOR_OVERLAP_MIN_UM2;
  const steps = new Map<string, number>();
  lv.outdoor.forEach((o, i) => {
    const earlier = lv.outdoor.slice(0, i).filter((p) => over(p.polygon, o.polygon));
    const onSlab = slabHere.some((s) => over(s, o.polygon));
    const floorsUnder = lv.floors.filter((f) => over(f.polygon, o.polygon));
    // Heights (µm above e) its top must not take.
    const taken = new Set<number>([
      ...(onSlab ? [0] : []),
      ...floorsUnder.flatMap((f) => [f.lift ?? 0, (f.lift ?? 0) + FLOOR_FINISH_MM * MM]),
      ...earlier.map((p) => (steps.get(p.id) ?? 0) * FLOOR_LIFT_UM),
    ]);
    let step = Math.max(onSlab ? 1 : 0, ...earlier.map((p) => 1 + (steps.get(p.id) ?? 0)));
    while (taken.has(step * FLOOR_LIFT_UM)) step++;
    steps.set(o.id, step);
    const lift = step * FLOOR_LIFT_UM;
    if (lift > 0) {
      ledger.push({
        kind: "outdoor",
        id: o.id,
        field: "lift_mm",
        value: lift / MM,
        provenance: "derived",
        rule: "outdoor-overlap-lift",
      });
    }
    if (!defaulted.has("outdoor:thickness")) {
      defaulted.add("outdoor:thickness");
      ledger.push({
        kind: "outdoor",
        field: "thickness_mm",
        value: OUTDOOR_MM,
        provenance: "default",
        rule: "outdoor-thickness-default",
      });
      // How a theme tint becomes a 3D colour (`groundColour`): a drafting default too.
      ledger.push({
        kind: "outdoor",
        field: "wash",
        value: GROUND_WASH,
        provenance: "default",
        rule: "outdoor-colour-wash",
      });
    }
    const colour = outdoorColour(o.surface);
    if (!defaulted.has(`outdoor:${o.surface}`)) {
      defaulted.add(`outdoor:${o.surface}`);
      ledger.push({
        kind: "outdoor",
        field: `colour(${o.surface})`,
        value: colour.srgb,
        provenance: "default",
        rule: tintOf(o.surface) ? colour.rule : "outdoor-surface-unknown",
      });
    }
    if (o.rail?.length) {
      ledger.push({
        kind: "outdoor",
        id: o.id,
        field: "rail",
        value: "omitted",
        provenance: "default",
        rule: "outdoor-rail-omitted",
      });
    }
    node("outdoor", o.id, i, [prism(o.polygon, e - OUTDOOR_MM * MM + lift, e + lift)], {
      surface: o.surface,
      colour: colour.srgb,
      thickness_mm: OUTDOOR_MM,
      ...(lift > 0 ? { lift_mm: lift / MM } : {}),
    });
  });
  lv.fences.forEach((f, i) => {
    const known = f.style in FENCE_PROFILES;
    const style = known ? f.style : "picket";
    const profile = FENCE_PROFILES[style] as FenceProfile;
    const height = FENCE_HEIGHT_MM[style] as number;
    const pieces = fencePieces({ ...f, style }, profile, height);
    // No run of positive length (every point the same): the core draws nothing, and nothing is built
    // (review R1, S4); said so, and its style's defaults are not claimed for it.
    if (pieces.length === 0) {
      ledger.push({
        kind: "fence",
        id: f.id,
        field: "geometry",
        value: "omitted",
        provenance: "derived",
        rule: "fence-no-run",
      });
      return;
    }
    if (!defaulted.has(`fence:${f.style}`)) {
      defaulted.add(`fence:${f.style}`);
      ledger.push(
        {
          kind: "fence",
          field: `height_mm(${f.style})`,
          value: height,
          provenance: "default",
          rule: known ? "fence-height-default" : "fence-style-unknown",
        },
        {
          kind: "fence",
          field: `profile(${f.style})`,
          value: {
            post_mm: profile.post,
            // The core's own spacing: a post on every tick it draws (`fencePosts`).
            post_pitch_mm: CORE_POST_PITCH_MM[style],
            rails_mm: profile.rails.map((r) => [...r]),
            ...(profile.pickets ? { pickets_mm: [...profile.pickets] } : {}),
          },
          provenance: "default",
          rule: "fence-profile-default",
        },
        {
          kind: "fence",
          field: `colour(${f.style})`,
          value: fenceColour(f.style),
          provenance: "default",
          rule: "fence-colour-default",
        },
      );
    }
    node(
      "fence",
      f.id,
      i,
      pieces.map((p) => prism(p.poly, e + p.z[0] * MM, e + p.z[1] * MM)),
      { style: f.style, colour: fenceColour(f.style), height_mm: height, closed: f.closed },
    );
  });
  return out;
}

/**
 * A Scene3D → its Mesh3D: deterministic, nodes in canonical (level, kind, id, part) order. `opts`
 * left out (or `doors: "closed"`) is the default build, byte for byte.
 */
export function buildMesh(scene: Scene3D, opts: MeshOptions = {}): Mesh3D {
  const doors = opts.doors ?? "closed";
  // The pose is chosen here, so a `plan` build restates the scene's `door-pose-closed` entry.
  const asked: Assumption = {
    kind: "door",
    field: "pose",
    value: "plan",
    provenance: "user-param",
    rule: "door-pose-plan",
  };
  const ledger: Assumption[] = [
    ...(doors === "closed"
      ? scene.meta.assumptions
      : scene.meta.assumptions.map((a) => (a.rule === "door-pose-closed" ? asked : a))),
    { kind: "slab", field: "thickness_mm", value: SLAB_MM, provenance: "default", rule: "slab-default-200" },
    { kind: "floor", field: "finish_mm", value: FLOOR_FINISH_MM, provenance: "default", rule: "floor-finish-5" },
    {
      kind: "window",
      field: "frame_mm",
      value: [FRAME_WIDTH_MM, FRAME_DEPTH_MM],
      provenance: "default",
      rule: "window-frame-40x60",
    },
    { kind: "door", field: "leaf_mm", value: LEAF_MM, provenance: "default", rule: "door-leaf-40" },
    { kind: "roof", field: "thickness_mm", value: ROOF_MM, provenance: "default", rule: "roof-flat-150" },
    // Card RM8.3 builds outdoor surfaces and fences (it replaced the two `m1-omits-outdoor-fences`
    // rows here; their defaults are ledgered per kind and style where they are built). The ground
    // plane the viewer draws round the building is in no node, so it is said here, in every Mesh3D.
    {
      kind: "ground",
      field: "plane",
      value: {
        drawn: "viewer only",
        level: scene.levels[0]?.level ?? 0,
        margin_mm: GROUND_PLANE.marginMm,
        colour: GROUND_PLANE.light,
        colour_dark: GROUND_PLANE.dark,
      },
      provenance: "default",
      rule: "ground-plane-viewer-only",
    },
    // Card RM8.8: the soft contact shadows the viewer draws are in no node and not in the GLB, so,
    // as the ground plane, they are said here, in every Mesh3D: each band's width rule and alphas.
    {
      kind: "shadow",
      field: "contact",
      value: {
        drawn: "viewer only",
        wall_band_mm: shadowRule(CONTACT_SHADOW.wall, "thickness"),
        furniture_band_mm: shadowRule(CONTACT_SHADOW.furniture, "smaller footprint side"),
        fence_band_mm: shadowRule(CONTACT_SHADOW.fence, "post"),
        stair_thickness_mm: CONTACT_SHADOW.stairThicknessMm,
        alpha: { ...CONTACT_SHADOW.alpha },
        alpha_dark: { ...CONTACT_SHADOW.alphaDark },
      },
      provenance: "default",
      rule: "contact-shadows-viewer-only",
    },
  ];
  const defaulted = new Set<string>();
  const top = scene.levels.length - 1;
  const nodes = scene.levels.flatMap((lv, i) =>
    levelNodes(lv, ledger, defaulted, i === top, doors, scene.levels[i - 1], scene.levels[i + 1]),
  );
  nodes.sort(
    (a, b) => a.level - b.level || byText(a.kind, b.kind) || byText(a.id, b.id) || byText(a.part ?? "", b.part ?? ""),
  );
  return { version: 0, kind: "mesh3d", name: scene.meta.name, assumptions: ledger, nodes };
}
