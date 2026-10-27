/**
 * Scene3D → Mesh3D (archlang-3d M1a, card A2). Every solid is a closed prism over a Scene3D polygon
 * (`extrude.ts`); no boolean is computed here, because the core's joinery already gave each wall its
 * owned pieces with the openings removed (`Wall.body`) and each opening its cut. What the plan does
 * not state is a labelled default in the ledger (ADR 0005).
 *
 * Per storey, at its elevation `e` (µm):
 * - slab: the storey's wall footprint, [e − 200 mm, e] (Q6);
 * - floor: each room, a 5 mm finish [e, e + 5 mm], a void inside it as a hole;
 * - column: its box, [e, e + storey height];
 * - wall: its body pieces [e, e + h]; under each cut a sill [e, e + sill], over it a lintel
 *   [e + head, e + h] (§4.1 step 2; a cased opening's head at the wall top makes no lintel);
 * - door: closed leaves, 40 mm thick, [e, e + head]: the core's leaves for a swinging door, one
 *   panel across the jambs for every other kind (Q11, closed by default);
 * - window: a 16 mm glass pane across the jambs and a 40 × 60 mm frame (§4.3);
 * - furniture: a grey box on the floor finish, its height a per-family default;
 * - roof: a 150 mm flat slab on the storey's ring at the top of its tallest wall, hidden (Q7, D3).
 * Stairs, outdoor surfaces and fences are not built yet (M4 and later); the ledger says so.
 */
import type { Assumption, Level, Polygon, Pt, Scene3D } from "../scene3d/types.js";
import { prism, rect, slab2d } from "./extrude.js";
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

/** An axis-aligned plan rectangle `[x0, y0, x1, y1]` (µm), x0 < x1, y0 < y1. */
type Rect = [number, number, number, number];

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

/** `a` less `b`: at most four rectangles, exact, tiling `a` outside `b`. */
function rectMinus(a: Rect, b: Rect): Rect[] {
  const [x0, y0, x1, y1] = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  if (!(x0 < x1 && y0 < y1)) return [a];
  const out: Rect[] = [];
  if (a[1] < y0) out.push([a[0], a[1], a[2], y0]);
  if (y1 < a[3]) out.push([a[0], y1, a[2], a[3]]);
  if (a[0] < x0) out.push([a[0], y0, x0, y1]);
  if (x1 < a[2]) out.push([x1, y0, a[2], y1]);
  return out;
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

function levelNodes(lv: Level, ledger: Assumption[], defaulted: Set<string>, isTop: boolean): MeshNode[] {
  const e = lv.elevation;
  const out: MeshNode[] = [];
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

  // Slab: the storey's wall footprint less its voids, below the floor level (§4.2).
  node(
    "slab",
    "slab",
    0,
    lv.footprint.flatMap((r) => lessVoids(r, lv.voids, "slab", ledger)).map((p) => prism(p, e - SLAB_MM * MM, e)),
    { thickness_mm: SLAB_MM },
  );

  // Floors: each room less the voids that fall in it.
  lv.floors.forEach((f, i) => {
    const pieces = f.polygon.holes?.length
      ? [f.polygon]
      : lessVoids(f.polygon.outer, lv.voids, `floor:${f.id}`, ledger);
    node(
      "floor",
      f.id,
      i,
      pieces.map((p) => prism(p, e, e + FLOOR_FINISH_MM * MM)),
      { ...(f.uses?.length ? { uses: f.uses.join(" ") } : {}) },
    );
  });

  lv.columns.forEach((c, i) => {
    node("column", c.id, i, [
      prism(rect(c.at[0], c.at[1], c.at[0] + c.size.w, c.at[1] + c.size.h), e, e + lv.storeyHeight),
    ]);
  });

  const openings = new Map(lv.openings.map((o) => [o.id, o] as const));
  const hostHeight = new Map(lv.walls.map((w) => [w.id, w.height] as const));
  lv.walls.forEach((w, i) => {
    const top = e + w.height;
    const shells: Array<Shell | null> = w.body.map((p) => prism(p, e, top));
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

  lv.openings.forEach((o, i) => {
    const [j0, j1] = o.jambs;
    // A leaf or frame never stands above its wall: the head is capped at the host's top.
    const head = Math.min(o.head, hostHeight.get(o.host) ?? o.head);
    const extras = { host: o.host, width_mm: o.width / MM, sill_mm: o.sill / MM, head_mm: o.head / MM };
    if (o.kind === "door") {
      const leaves = o.leaves ?? [[j0, j1]];
      node(
        "door",
        o.id,
        i,
        leaves.map(([h, f]) => prism(slab2d(h, f, LEAF_MM * MM), e + o.sill, e + head)),
        { ...extras, door_kind: o.doorKind ?? "hinged", pose: "closed" },
      );
    } else if (o.kind === "window") {
      const z0 = e + o.sill;
      const z1 = e + head;
      const fw = FRAME_WIDTH_MM * MM;
      const fd = FRAME_DEPTH_MM * MM;
      node("window", o.id, i, [prism(slab2d(j0, j1, GLASS_MM * MM), z0, z1)], extras, "glass");
      node(
        "window",
        o.id,
        i,
        [
          prism(slab2d(j0, along(j0, j1, fw), fd), z0, z1),
          prism(slab2d(along(j1, j0, fw), j1, fd), z0, z1),
          prism(slab2d(j0, j1, fd), z0, z0 + fw),
          prism(slab2d(j0, j1, fd), z1 - fw, z1),
        ],
        extras,
        "frame",
      );
    }
    // A cased opening (`kind: "opening"`) is the hole itself: nothing to build.
  });

  const floorTop = e + FLOOR_FINISH_MM * MM;
  lv.furniture.forEach((f, i) => {
    const h = FURNITURE_HEIGHT_MM[f.category] ?? FURNITURE_DEFAULT_MM;
    if (!defaulted.has(f.category)) {
      defaulted.add(f.category);
      ledger.push({
        kind: "furniture",
        field: `height_mm(${f.category})`,
        value: h,
        provenance: "default",
        rule: f.category in FURNITURE_HEIGHT_MM ? "furniture-height-family" : "furniture-height-greybox",
      });
    }
    const [cx, cy] = f.centre;
    const box = rect(cx - f.size.w / 2, cy - f.size.d / 2, cx + f.size.w / 2, cy + f.size.d / 2);
    node("furniture", f.id, i, [prism(box, floorTop, floorTop + h * MM)], {
      category: f.category,
      yaw_deg: f.yawDeg,
      asset: f.asset,
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

/** A Scene3D → its Mesh3D: deterministic, nodes in canonical (level, kind, id, part) order. */
export function buildMesh(scene: Scene3D): Mesh3D {
  const ledger: Assumption[] = [
    ...scene.meta.assumptions,
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
  const nodes = scene.levels.flatMap((lv, i) => levelNodes(lv, ledger, defaulted, i === top));
  nodes.sort(
    (a, b) => a.level - b.level || byText(a.kind, b.kind) || byText(a.id, b.id) || byText(a.part ?? "", b.part ?? ""),
  );
  return { version: 0, kind: "mesh3d", name: scene.meta.name, assumptions: ledger, nodes };
}
