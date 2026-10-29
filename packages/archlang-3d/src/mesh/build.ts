/**
 * Scene3D → Mesh3D (archlang-3d M1a, card A2). Every solid is a closed prism over a Scene3D polygon
 * (`extrude.ts`); no boolean is computed here, because the core's joinery already gave each wall its
 * owned pieces with the openings removed (`Wall.body`) and each opening its cut. What the plan does
 * not state is a labelled default in the ledger (ADR 0005).
 *
 * Per storey, at its elevation `e` (µm):
 * - slab: the rooms ∪ the storey's wall outline, less its voids, [e − 200 mm, e] (Q6, `slab.ts`);
 * - floor: each room, a 5 mm finish [e, e + 5 mm], a void inside it as a hole; a room overlapping
 *   an earlier one is lifted 0.5 mm per step (V-GEO-05, `Floor.lift`);
 * - column: its box, [e, e + storey height];
 * - wall: its body pieces [e, e + h]; under each cut a sill [e, e + sill], over it a lintel
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
 *   edge on the open radius and lie inside the one sector (not a misalignment);
 * - window: a 16 mm glass pane across the jambs and a 40 × 60 mm frame (§4.3), every part kept
 *   inside its cut; on a curved host both follow the arc from jamb face to jamb face (`cutSector`);
 * - furniture: a T0 parametric piece (`t0.ts`) fitted to its footprint for the twelve families it
 *   covers, else a grey box on the floor finish, its height a per-family default;
 * - roof: a 150 mm flat slab on the storey's ring at the top of its tallest wall, hidden (Q7, D3).
 * Stairs, outdoor surfaces and fences are not built yet (M4 and later); the ledger says so.
 */
import type { Assumption, Level, Polygon, Pt, Scene3D } from "../scene3d/types.js";
import { cutSector, degenerateHoles, insideCut, prism as extrude, rect, sectorBand, slab2d } from "./extrude.js";
import { type Rect, rectMinus, slabRegion } from "./slab.js";
import { T0_HEIGHT_MM, t0Parts } from "./t0.js";
import type { Mesh3D, MeshNode, NodeKind, Shell, Stage } from "./types.js";

const MM = 1000;
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
 * mid-thickness line, from a tenth of the way out to just short of the tip, strictly inside a
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
): MeshNode[] {
  const e = lv.elevation;
  const out: MeshNode[] = [];
  /**
   * Degenerate holes `extrude` left out of the shells built since the last `node` call. Every
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
    node(
      "floor",
      f.id,
      i,
      pieces.map((p) => prism(p, z0, z0 + FLOOR_FINISH_MM * MM)),
      { ...(f.uses?.length ? { uses: f.uses.join(" ") } : {}), ...(f.lift ? { lift_mm: f.lift / MM } : {}) },
    );
  });

  lv.columns.forEach((c, i) => {
    node("column", c.id, i, [
      prism(rect(c.at[0], c.at[1], c.at[0] + c.size.w, c.at[1] + c.size.h), e, e + lv.storeyHeight),
    ]);
  });

  const openings = new Map(lv.openings.map((o) => [o.id, o] as const));
  const hostHeight = new Map(lv.walls.map((w) => [w.id, w.height] as const));
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
    const top = e + w.height;
    const shells: Array<Shell | null> = w.body.map((p) => prism(p, e, top, splits));
    for (const id of w.cuts) {
      const o = openings.get(id);
      if (!o) continue;
      if (o.sill > 0) shells.push(prism({ outer: o.cut }, e, e + Math.min(o.sill, w.height)));
      if (o.head < w.height) shells.push(prism({ outer: o.cut }, e + o.head, top));
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

  lv.openings.forEach((o, i) => {
    const [j0, j1] = o.jambs;
    // A leaf or frame never stands above its wall: the head is capped at the host's top.
    const head = Math.min(o.head, hostHeight.get(o.host) ?? o.head);
    const extras = { host: o.host, width_mm: o.width / MM, sill_mm: o.sill / MM, head_mm: o.head / MM };
    if (o.kind === "door") {
      const z0 = e + o.sill;
      const swung = o.leaves?.every((l) => l.length === 3) ? (o.leaves as Array<[Pt, Pt, Pt]>) : undefined;
      if (doors === "plan" && swung) {
        const open = swung.map(([h, f, end]) => openLeaf(h, f, end, LEAF_MM * MM));
        // The plan swings this leaf through a wall: reproduced as drawn, never silently.
        if (open.some((leaf) => leafThroughWall(leaf, lv.walls))) {
          ledger.push({
            kind: "door",
            id: o.id,
            field: "pose",
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
          { ...extras, door_kind: o.doorKind ?? "hinged", pose: "plan" },
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
    // A cased opening (`kind: "opening"`) is the hole itself: nothing to build.
  });

  const floorTop = e + FLOOR_FINISH_MM * MM;
  lv.furniture.forEach((f, i) => {
    const parts = t0Parts(f);
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
    const [cx, cy] = f.centre;
    const box = rect(cx - f.size.w / 2, cy - f.size.d / 2, cx + f.size.w / 2, cy + f.size.d / 2);
    const shells = parts
      ? parts.map((p) => prism(p.polygon, floorTop + p.y0, floorTop + p.y1))
      : [prism(box, floorTop, floorTop + h * MM)];
    node("furniture", f.id, i, shells, {
      category: f.category,
      yaw_deg: f.yawDeg,
      asset,
      ...(f.room ? { room: f.room } : {}),
    });
  });

  const tallest = lv.walls.reduce((m, w) => Math.max(m, w.height), 0) || lv.storeyHeight;
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
    {
      kind: "stair",
      field: "geometry",
      value: "omitted",
      provenance: "default",
      rule: "m1-omits-stairs-outdoor-fences",
    },
  ];
  const defaulted = new Set<string>();
  const top = scene.levels.length - 1;
  const nodes = scene.levels.flatMap((lv, i) => levelNodes(lv, ledger, defaulted, i === top, doors));
  nodes.sort(
    (a, b) => a.level - b.level || byText(a.kind, b.kind) || byText(a.id, b.id) || byText(a.part ?? "", b.part ?? ""),
  );
  return { version: 0, kind: "mesh3d", name: scene.meta.name, assumptions: ledger, nodes };
}
