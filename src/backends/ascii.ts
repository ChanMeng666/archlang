/**
 * ASCII backend — a pure, zero-dependency serializer of the {@link Scene} to a
 * fixed-width text floor plan.
 *
 * This is the one backend a sandboxed, text-only agent can actually *read* without
 * rasterizing anything: it draws walls, door/window openings, furniture markers and
 * room labels into a character grid. It is deliberately coarse — the precise facts
 * live in `describe()`; this is the "glance at the plan" channel.
 *
 * Determinism (a hard invariant — goldens are byte-asserted):
 *   - No optional deps, no Node APIs, no time, no randomness.
 *   - A single **fixed integer mm→cell map** with NO floating-point accumulation:
 *     a point (x,y) in the scene's mm bbox `[minX,minY]..[maxX,maxY]` lands in
 *         col = floor((x - minX) * cols / W)   (clamped to 0..cols-1)
 *         row = floor((y - minY) * rows / H)   (clamped to 0..rows-1)
 *     where W = max(1, maxX-minX), H = max(1, maxY-minY). Each cell is computed
 *     from the raw coordinate by one multiply + one divide + one floor — there is
 *     no running sum, so the same mm coordinate always maps to the same cell
 *     regardless of draw order or which primitive references it.
 *
 * Grid sizing preserves the plan's aspect ratio. A character cell reads ~2:1 tall,
 * so `rows ≈ cols * (H/W) / 2`. When that would exceed the row cap we clamp rows
 * and recompute cols back from rows (again ×2 for the cell aspect) so a very tall
 * plan is scaled down rather than squashed.
 *
 * Furniture markers rely on the opt-in `annotate` metadata (`elementId`/
 * `elementKind`, stamped by `toScene` under `compile(src, { annotate: true })`) —
 * it is the only way to recover a fixture's category/identity from the otherwise
 * geometry-only Scene. Without it the renderer still draws walls, openings, room
 * rectangles/labels, and *labelled* furniture; fixture glyphs are simply omitted.
 */

import type { Point } from "../ast.js";
import type { Scene, SceneNode, ScenePrim } from "../scene.js";

export interface AsciiOptions {
  /** Target grid width in characters (default 80). Clamped to ≥ 1. */
  cols?: number;
  /** Glyph set: box-drawing `unicode` (default) or portable `ascii`. */
  charset?: "unicode" | "ascii";
}

/** The four glyph roles per charset: horizontal wall, vertical wall, crossing, door, window. */
interface Glyphs {
  h: string;
  v: string;
  x: string;
  door: string;
  window: string;
  /** Membership test set for "is this cell currently a wall glyph?" (junction logic). */
  walls: Set<string>;
}

const UNICODE: Glyphs = { h: "─", v: "│", x: "┼", door: "·", window: "=", walls: new Set(["─", "│", "┼"]) };
const ASCII: Glyphs = { h: "-", v: "|", x: "+", door: "o", window: "=", walls: new Set(["-", "|", "+"]) };

const SPACE = " ";
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** First alphanumeric of a string, uppercased — the furniture marker glyph. */
function firstAlnum(s: string): string {
  const m = /[A-Za-z0-9]/.exec(s);
  return m ? m[0]!.toUpperCase() : "*";
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** All defining points of a primitive (for bounding-box accumulation). */
function pointsOf(prim: ScenePrim): Point[] {
  switch (prim.t) {
    case "polygon":
      return prim.pts;
    case "line":
      return [prim.a, prim.b];
    case "region":
      return prim.loops.flat();
    case "hatch":
      return prim.region.flat();
    case "arc":
      return [prim.start, prim.end, prim.center];
    case "text":
      return [prim.at];
  }
}

/** Closed/open polylines a primitive contributes as *strokable* wall linework. */
function polylinesOf(prim: ScenePrim): Array<{ pts: Point[]; closed: boolean }> {
  switch (prim.t) {
    case "polygon":
      return [{ pts: prim.pts, closed: true }];
    case "region":
      return prim.loops.map((l) => ({ pts: l, closed: true }));
    case "hatch":
      return prim.region.map((l) => ({ pts: l, closed: true }));
    case "line":
      return [{ pts: [prim.a, prim.b], closed: false }];
    default:
      return []; // arc / text contribute no wall linework
  }
}

/**
 * Render a {@link Scene} to a fixed-width ASCII floor plan (trailing newline).
 * Pure & deterministic; see the module header for the exact mm→cell rule.
 */
export function renderAscii(scene: Scene, opts: AsciiOptions = {}): string {
  const g = opts.charset === "ascii" ? ASCII : UNICODE;
  const b = scene.bounds;
  const W = Math.max(1, b.maxX - b.minX);
  const H = Math.max(1, b.maxY - b.minY);

  // Grid dimensions (aspect-preserving; char cell ≈ 2:1 tall). If rows would exceed
  // the cap, clamp rows and recompute cols from rows so the plan scales, not squashes.
  const ROW_CAP = 48;
  let cols = Math.max(1, Math.floor(opts.cols ?? 80));
  let rows = Math.max(1, Math.round((cols * H * 0.5) / W));
  if (rows > ROW_CAP) {
    rows = ROW_CAP;
    cols = Math.max(1, Math.round((rows * W * 2) / H));
  }

  // The single, accumulation-free mm→cell map (see header).
  const colOf = (x: number): number => clamp(Math.floor(((x - b.minX) * cols) / W), 0, cols - 1);
  const rowOf = (y: number): number => clamp(Math.floor(((y - b.minY) * rows) / H), 0, rows - 1);

  const grid: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(SPACE));
  const inB = (c: number, r: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols;

  /** Set a wall cell, resolving crossings to the junction glyph. */
  const plotWall = (c: number, r: number, glyph: string): void => {
    if (!inB(c, r)) return;
    const cur = grid[r]![c]!;
    if (cur === SPACE || cur === glyph) {
      grid[r]![c] = glyph;
    } else if (g.walls.has(cur)) {
      grid[r]![c] = g.x; // two wall runs meet → crossing
    } else {
      grid[r]![c] = glyph;
    }
  };

  /** Overwrite a cell unconditionally (openings, furniture, labels). */
  const plotOver = (c: number, r: number, ch: string): void => {
    if (inB(c, r)) grid[r]![c] = ch;
  };

  /** Bresenham raster of a cell segment, calling `plot` on each cell. */
  const line = (c0: number, r0: number, c1: number, r1: number, plot: (c: number, r: number) => void): void => {
    const dx = Math.abs(c1 - c0);
    const dy = Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    let c = c0;
    let r = r0;
    for (;;) {
      plot(c, r);
      if (c === c1 && r === r1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        c += sx;
      }
      if (e2 < dx) {
        err += dx;
        r += sy;
      }
    }
  };

  /** Stroke one polyline as wall linework (glyph chosen per edge's dominant axis). */
  const strokeWall = (pts: Point[], closed: boolean): void => {
    const n = pts.length;
    if (n < 2) return;
    const edge = (a: Point, b: Point): void => {
      const c0 = colOf(a.x);
      const r0 = rowOf(a.y);
      const c1 = colOf(b.x);
      const r1 = rowOf(b.y);
      const glyph = Math.abs(c1 - c0) >= Math.abs(r1 - r0) ? g.h : g.v;
      line(c0, r0, c1, r1, (c, r) => plotWall(c, r, glyph));
    };
    for (let i = 0; i + 1 < n; i++) edge(pts[i]!, pts[i + 1]!);
    if (closed && n > 2) edge(pts[n - 1]!, pts[0]!);
  };

  // ---- Pass 1: walls (base linework) ----
  for (const node of scene.nodes) {
    if (node.layer !== "wallFill" && node.layer !== "wallFace") continue;
    for (const pl of polylinesOf(node.prim)) strokeWall(pl.pts, pl.closed);
  }

  // ---- Pass 2: openings (overwrite wall cells along each opening centerline) ----
  for (const node of scene.nodes) {
    const ch = node.layer === "doors" ? g.door : node.layer === "windows" ? g.window : null;
    if (ch === null || node.prim.t !== "polygon") continue; // the cover polygon only
    const p = node.prim.pts;
    if (p.length < 4) continue;
    const a = midpoint(p[0]!, p[3]!); // jamb A (mid of the two "start" corners)
    const c = midpoint(p[1]!, p[2]!); // jamb B (mid of the two "end" corners)
    line(colOf(a.x), rowOf(a.y), colOf(c.x), rowOf(c.y), (cc, rr) => plotOver(cc, rr, ch));
  }

  // ---- Pass 3: furniture (one uppercase marker per item, later element wins) ----
  interface FurnGroup {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    label?: string;
    idKey?: string;
  }
  const furn = new Map<string, FurnGroup>();
  let anon = 0;
  for (const node of scene.nodes) {
    if (node.layer !== "furniture") continue;
    // Group a fixture's several glyph primitives into one item via the annotate id;
    // without annotate, only a labelled item's text node identifies an item.
    const key = node.elementId ?? (node.prim.t === "text" ? `#${anon++}` : null);
    if (key === null) continue; // fixture glyph without annotate → not identifiable, skip
    let grp = furn.get(key);
    if (!grp) {
      grp = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, idKey: node.elementId };
      furn.set(key, grp);
    }
    for (const pt of pointsOf(node.prim)) {
      if (pt.x < grp.minX) grp.minX = pt.x;
      if (pt.y < grp.minY) grp.minY = pt.y;
      if (pt.x > grp.maxX) grp.maxX = pt.x;
      if (pt.y > grp.maxY) grp.maxY = pt.y;
    }
    if (node.prim.t === "text") grp.label = node.prim.value;
  }
  // Insertion order == scene (source) order, so a later, overlapping item overwrites.
  for (const grp of furn.values()) {
    if (!Number.isFinite(grp.minX)) continue;
    const src = grp.label ?? grp.idKey ?? "";
    const cx = (grp.minX + grp.maxX) / 2;
    const cy = (grp.minY + grp.maxY) / 2;
    plotOver(colOf(cx), rowOf(cy), firstAlnum(src));
  }

  // ---- Pass 4: room labels (drawn LAST so they stay readable) ----
  // Room name = a weighted `labels` text (the area label carries no weight).
  const nameTexts = scene.nodes.filter(
    (n): n is SceneNode & { prim: Extract<ScenePrim, { t: "text" }> } =>
      n.layer === "labels" && n.prim.t === "text" && n.prim.weight !== undefined,
  );
  for (const node of scene.nodes) {
    if (node.layer !== "floor" || node.prim.t !== "polygon") continue; // room floor rect
    const pts = node.prim.pts;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const name = nameTexts.find((t) => {
      const at = t.prim.at;
      return at.x >= minX && at.x <= maxX && at.y >= minY && at.y <= maxY;
    })?.prim.value;
    const label = name ?? node.elementId; // fall back to the room id (annotate)
    if (!label) continue;

    const c0 = colOf(minX);
    const c1 = colOf(maxX);
    const rowMid = Math.round((rowOf(minY) + rowOf(maxY)) / 2);
    const usable = c1 - c0 - 1; // keep a cell clear of each wall
    if (usable <= 0) continue;
    const text = label.length > usable ? label.slice(0, usable) : label;
    const start = Math.round((c0 + c1) / 2) - Math.floor(text.length / 2);
    for (let i = 0; i < text.length; i++) plotOver(start + i, rowMid, text[i]!);
  }

  // rstrip each row (trailing spaces carry no information and bloat goldens).
  return grid.map((row) => row.join("").replace(/\s+$/, "")).join("\n") + "\n";
}
