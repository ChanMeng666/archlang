/**
 * The label-relocation pass (`relocateLabels`, `src/label-placement.ts`) against the form it
 * replaced, kept here VERBATIM as the oracle and compared BIT FOR BIT (`docs/backlog.md`
 * M.19, M.15).
 *
 * The old pass summed every obstacle and every already-placed label for each of a group's 51
 * probes: O(G²) per storey in the labels, ~53 s for nine storeys of 4,760 rooms. The new one
 * asks a grid for the boxes a probe can touch and remembers, per probe of groups with the same
 * text box, anchor and ring, how far through the placed labels it has summed. Neither may move
 * a label: the sums must be the same floats, so the same terms are added in the same order (only
 * exact `+0` terms are skipped), and the same candidate wins.
 *
 * The real pass is wrapped (`vi.mock`) so every call the compiler makes is recorded with its
 * input; each recorded call is replayed through the oracle and every node compared, numbers
 * with `Object.is` (so `-0` is told from `0` and an ulp from none). The corpus and generated
 * degenerate plans (coincident, near-coincident and crowded rooms, polygons, circles, fixed
 * labels) are compiled; each block counts the groups that were searched and moved, the calls
 * long enough to reach the grid, and the groups that shared a signature with an earlier one.
 *
 * The oracle's only additions are the `tally` counters, which read and change nothing. Its one
 * edit: a text box is measured by the shared `textExtent` (`src/text-layout.ts`) rather than
 * `textWidth(value, size)` by `size`, because a room name may now be WRAPPED onto several lines before
 * the pass runs (`wrapLabels`). How big a label is is the pass's INPUT, not the search under
 * test, and for a one-line text the two measures are the same expression — so every call
 * without a wrapped name replays exactly as before, and the wrapped ones are counted
 * (`Reach.wrapped`) so the comparison is shown to cover them.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Point } from "../src/ast.js";
import { OUTDOOR_LAYERS } from "../src/elements/outdoor.js";
import { ROOF_LAYER } from "../src/elements/roof.js";
import { segmentRectangle, segmentsOfWall } from "../src/geometry.js";
import { arcTessellate } from "../src/geometry/arc.js";
import { pointInPolygon, polygonBounds, rectInsidePolygon } from "../src/geometry/polygon.js";
import type { BBox } from "../src/geometry/rect.js";
import { overlap1d } from "../src/geometry/rect.js";
import { compile } from "../src/index.js";
import type { ResolvedPlan } from "../src/ir.js";
import { BoxSums, CLEARANCE, COLLIDE_MIN, FRACTIONS, type LabelGroup, relocateLabels } from "../src/label-placement.js";
import { extractArchBlocks } from "../src/markdown.js";
import type { RenderSizes, SceneNode, ScenePrim } from "../src/scene.js";
import { textExtent } from "../src/text-layout.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

/** One call the compiler made: the input as it was handed in, and what the pass left. */
interface Call {
  before: SceneNode[];
  after: SceneNode[];
  groups: readonly LabelGroup[];
  ir: ResolvedPlan;
  sizes: RenderSizes;
}

const { calls } = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock("../src/label-placement.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/label-placement.js")>();
  return {
    ...real,
    relocateLabels: (nodes: SceneNode[], groups: readonly LabelGroup[], ir: ResolvedPlan, sizes: RenderSizes) => {
      // The pass REPLACES the nodes it moves and never edits one, so a shallow copy is the input.
      const before = nodes.slice();
      real.relocateLabels(nodes, groups, ir, sizes);
      calls.push({ before, after: nodes.slice(), groups, ir, sizes });
    },
  };
});

const ROOT = resolvePath(__dirname, "..");
const tally = { searched: 0, moved: 0, obstacles: 0 };

/* ---------------------------------------------------------------------------
 * The oracle: the replaced pass, verbatim (from `/** Score weight` to the end of the file)
 * ------------------------------------------------------------------------- */

/** Score weight: the text box does not fit wholly on its own floor. */
const W_OUTSIDE = 100;
/** Score weight per unit of area-fraction buried in drawn geometry. */
const W_OBSTACLE = 250;
/** Score weight per unit of area-fraction buried in an already-placed room label. */
const W_PLACED = 10_000;
/** How far a candidate may be preferred away from the anchor (planscript's `·4`). */
const W_DISTANCE = 4;

/** Bounding box of a point set (empty → null). */
function bboxOfPoints(pts: readonly Point[]): BBox | null {
  if (pts.length === 0) return null;
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
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The rect grown by `d` on every side. */
function inflate(b: BBox, d: number): BBox {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

/** The smallest rect containing both. */
function unionBBox(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** The rect translated by (dx, dy). */
function shiftBBox(b: BBox, dx: number, dy: number): BBox {
  return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
}

/** Overlapping area of two axis-aligned rects (mm²; 0 when disjoint). */
function overlapArea(a: BBox, b: BBox): number {
  return overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) * overlap1d(a.y, a.y + a.h, b.y, b.y + b.h);
}

/**
 * Axis-aligned extent of one drawn primitive — what a label has to stay off — or `null`
 * for a primitive this pass deliberately does not treat as an obstacle.
 *
 * **A `line` is not an obstacle.** It encloses no area, so the area-overlap metric this
 * pass is built on cannot say anything true about one: all it can offer is the line's
 * bounding box, which for a diagonal is enormously bigger than the ink (the aquarium's
 * `R12000` leader boxes 8.5 × 8.5 m of empty cafe floor). Nothing is lost by declining,
 * because every line in a drawing is either backed by an area obstacle that IS measured
 * — a wall face by its wall band, a door leaf by its swing arc, a window pane by its
 * host wall — or is a hairline annotation (a dimension line, an axis datum) a room name
 * may legitimately cross.
 *
 * A `region`/`hatch` is the unioned wall solid, whose bounding box is the whole
 * building; those are never asked about here (the caller substitutes per-segment wall
 * rectangles instead). An `arc` is bounded by its endpoints, its centre and its
 * midpoint, which is exactly a door swing's quarter-disc box. Rotated text is boxed by
 * the exact axis-aligned extent of the turned rectangle.
 */
function primBBox(prim: ScenePrim): BBox | null {
  switch (prim.t) {
    case "polygon":
      return bboxOfPoints(prim.pts);
    case "line":
      return null;
    case "region":
      return bboxOfPoints(prim.loops.flat());
    // A `path` is either the unioned wall solid — never asked about here, the caller
    // substitutes per-segment wall rectangles — or a fixture glyph's curved outline (a WC
    // bowl, a cushion, a tree canopy), which IS an obstacle like any furniture polygon.
    // Boxed by its vertices plus each arc's MIDPOINT, so a bulge between two vertices is
    // not lost.
    case "path": {
      const pts: Point[] = [];
      for (const lp of prim.loops) {
        let from = lp.start;
        pts.push(from);
        for (const e of lp.edges) {
          pts.push(e.to);
          if (e.t === "arc") {
            const mx = from.x + e.to.x - 2 * e.center.x;
            const my = from.y + e.to.y - 2 * e.center.y;
            const len = Math.hypot(mx, my);
            if (len > 0) pts.push({ x: e.center.x + (mx / len) * e.r, y: e.center.y + (my / len) * e.r });
          }
          from = e.to;
        }
      }
      return bboxOfPoints(pts);
    }
    case "hatch":
      return bboxOfPoints(prim.region.flat());
    case "circle":
      return { x: prim.center.x - prim.r, y: prim.center.y - prim.r, w: 2 * prim.r, h: 2 * prim.r };
    case "arc": {
      const ax = prim.start.x - prim.center.x;
      const ay = prim.start.y - prim.center.y;
      const bx = prim.end.x - prim.center.x;
      const by = prim.end.y - prim.center.y;
      const mx = ax + bx;
      const my = ay + by;
      const len = Math.hypot(mx, my);
      const mid: Point =
        len === 0 ? prim.start : { x: prim.center.x + (mx / len) * prim.r, y: prim.center.y + (my / len) * prim.r };
      return bboxOfPoints([prim.start, prim.end, prim.center, mid]);
    }
    case "text": {
      const { w, h } = textExtent(prim);
      const rot = ((prim.rotate ?? 0) * Math.PI) / 180;
      const c = Math.abs(Math.cos(rot));
      const s = Math.abs(Math.sin(rot));
      const bw = w * c + h * s;
      const bh = w * s + h * c;
      return { x: prim.at.x - bw / 2, y: prim.at.y - bh / 2, w: bw, h: bh };
    }
  }
}

/** Fraction of `rect`'s own area buried in any of `boxes` (summed, so a doubly-covered
 *  patch counts twice — exactly what makes a crowded spot score worse than a busy one). */
function buried(rect: BBox, boxes: readonly BBox[]): number {
  const area = rect.w * rect.h;
  if (!(area > 0)) return 0;
  let sum = 0;
  for (const b of boxes) sum += overlapArea(rect, b);
  return sum / area;
}

/** How badly a text box at `rect` is crowded: what it is buried in, weighted. Drawn
 *  geometry is bad; another room's already-placed name is 40× worse, because two names
 *  on top of each other is the one failure a reader cannot decode. */
function crowding(rect: BBox, obstacles: readonly BBox[], placed: readonly BBox[]): number {
  return W_OBSTACLE * buried(rect, obstacles) + W_PLACED * buried(rect, placed);
}

/**
 * Move each labelled area's name + area text off whatever is drawn under it.
 *
 * Mutates `nodes` in place (replacing, never editing, the text nodes it moves), which is
 * safe: every node in the list was freshly built by this `toScene` call. Groups are
 * visited in ELEMENT order and each placed label becomes an obstacle for the next, so two
 * labels can never be relocated onto each other — and an `outdoor` surface takes its turn
 * among the rooms rather than after them, which is what keeps a plan with no ground on
 * exactly the group list, and therefore exactly the bytes, it would have without ground.
 */
function relocateLabelsBefore(
  nodes: SceneNode[],
  groups: readonly LabelGroup[],
  ir: ResolvedPlan,
  sizes: RenderSizes,
): void {
  if (groups.length === 0) return;
  const clear = sizes.roomFont * CLEARANCE;

  // Nodes a room contributed are not obstacles to their own room; the label text is
  // tracked as a sequentially-placed rect below, and the floor fill is what the label
  // sits ON.
  const own = new Set<number>();
  for (const g of groups) for (let i = g.from; i < g.to; i++) own.add(i);

  const obstacles: BBox[] = [];
  // Walls come from the IR, per segment. The lowered wall nodes are a UNIONED region
  // whose bounding box is the entire building — true, useless, and it would make every
  // label in the plan read as colliding.
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      // A CURVED edge is banded along its own tessellation rather than boxed whole: one
      // box round a quarter arc would claim the entire square it turns through, most of
      // which is the room the label is trying to sit in.
      const run = s.arc ? arcTessellate(s.arc) : [s.a, s.b];
      for (let k = 0; k + 1 < run.length; k++) {
        const b = bboxOfPoints(segmentRectangle(run[k]!, run[k + 1]!, s.thickness));
        if (b) obstacles.push(inflate(b, clear));
      }
    }
  }
  // Everything else that is already drawn: furniture and its labels, door leaves and
  // swings, window panes, opening covers, stair/elevator symbols, axis bubbles and —
  // the reason this pass runs where it does — the `dims auto` numbers. `floor` is what
  // a label sits on, and the wall passes were handled above.
  for (let i = 0; i < nodes.length; i++) {
    if (own.has(i)) continue;
    const n = nodes[i]!;
    if (n.layer === "floor" || n.layer === "wallFill" || n.layer === "wallFace") continue;
    // A roof outline is the same trap as the unioned wall region above: its bounding box
    // is the whole building plus the eaves, so treating it as an obstacle would bury every
    // label in the plan at once and set the relocation pass loose on all of them. It is
    // also nothing a label collides WITH — an overhang is drawn above the plane the names
    // are written on.
    if (n.layerName === ROOF_LAYER) continue;
    // The same argument, for the same reason, for the ground. A `fence` node's
    // bounding box is its whole run — often the entire site — and a balcony's rail ticks
    // sit outside the building; neither is something a room name can collide with, and
    // treating either as an obstacle would set the relocation pass loose on every label
    // in the plan. The surfaces themselves ride the `floor` pass and are already skipped
    // above; this catches the rails and the fences, which ride `furniture`.
    //
    // Note what is NOT skipped: an `outdoor` LABEL, which rides `labels` like a room's.
    // Two names printed on top of each other is exactly the collision this pass exists
    // for, so a room label does move off a terrace's name.
    if (n.layer !== "labels" && n.layerName !== undefined && OUTDOOR_LAYERS.includes(n.layerName)) continue;
    const b = primBBox(n.prim);
    if (b) obstacles.push(inflate(b, clear));
  }

  tally.obstacles = obstacles.length;
  const placed: BBox[] = [];
  for (const g of groups) {
    const texts: number[] = [];
    for (let i = g.from; i < g.to; i++) {
      const n = nodes[i]!;
      if (n.layer === "labels" && n.prim.t === "text") texts.push(i);
    }
    if (texts.length === 0) continue;
    let rect0: BBox | null = null;
    for (const i of texts) {
      const b = primBBox(nodes[i]!.prim);
      if (b) rect0 = rect0 ? unionBBox(rect0, b) : b;
    }
    if (!rect0) continue;

    // An explicit `label "…" at (x,y)` is the author's decision and is never overruled —
    // it is also the anchor `W_ROOM_LABEL_OUTSIDE` reports on, so moving it would make
    // that diagnostic describe a position nothing is drawn at. (`outdoor` has no such
    // clause, so its groups are never `fixed`; the field is the room's.)
    if (g.fixed) {
      placed.push(rect0);
      continue;
    }

    if (buried(rect0, obstacles) + buried(rect0, placed) <= COLLIDE_MIN) {
      placed.push(rect0);
      continue;
    }

    tally.searched++;
    const { ring, anchor } = g;
    const bb = polygonBounds(ring);
    const diag = Math.max(1, Math.hypot(bb.w, bb.h));
    const score = (p: Point, preference: number): number => {
      const rect = shiftBBox(rect0, p.x - anchor.x, p.y - anchor.y);
      return preference + (rectInsidePolygon(rect, ring) ? 0 : W_OUTSIDE) + crowding(rect, obstacles, placed);
    };

    // The incumbent is candidate zero and carries preference 0, so it wins every tie.
    let best = anchor;
    let bestScore = score(anchor, 0);
    for (const fy of FRACTIONS) {
      for (const fx of FRACTIONS) {
        const p: Point = { x: bb.x + bb.w * fx, y: bb.y + bb.h * fy };
        if (!pointInPolygon(p.x, p.y, ring)) continue;
        const s = score(p, 1 + (Math.hypot(p.x - anchor.x, p.y - anchor.y) / diag) * W_DISTANCE);
        if (s < bestScore) {
          bestScore = s;
          best = p;
        }
      }
    }

    const dx = best.x - anchor.x;
    const dy = best.y - anchor.y;
    if (dx !== 0 || dy !== 0) {
      tally.moved++;
      for (const i of texts) {
        const n = nodes[i]!;
        if (n.prim.t !== "text") continue;
        nodes[i] = { ...n, prim: { ...n.prim, at: { x: n.prim.at.x + dx, y: n.prim.at.y + dy } } };
      }
    }
    placed.push(shiftBBox(rect0, dx, dy));
  }
}

/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

/** Deep equality with `Object.is` at the leaves; the first path that differs, or null. */
function differs(a: unknown, b: unknown, path = ""): string | null {
  if (typeof a === "number" || typeof b === "number")
    return Object.is(a, b) ? null : `${path}: ${String(a)} vs ${String(b)}`;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return a === b ? null : `${path}: ${String(a)} vs ${String(b)}`;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.join() !== kb.join()) return `${path}: keys ${ka.join()} vs ${kb.join()}`;
  for (const k of ka) {
    const d = differs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** What the replayed calls reached. */
interface Reach {
  calls: number;
  searched: number;
  moved: number;
  /** Calls with more obstacles or labels than the pass walks directly, so the grid answered. */
  gridCalls: number;
  /** Calls with more labels than that, so the placed labels' grid answered too. */
  placedGridCalls: number;
  /** Searched groups whose signature an earlier searched group of the same call had. */
  repeats: number;
  /** Groups whose name reached the pass wrapped onto several lines. */
  wrapped: number;
}

/** Replay every recorded call through the oracle; fail on the first node that differs. */
function replay(label: string): Reach {
  const reach: Reach = { calls: 0, searched: 0, moved: 0, gridCalls: 0, placedGridCalls: 0, repeats: 0, wrapped: 0 };
  for (const c of calls.splice(0)) {
    const s0 = tally.searched;
    const m0 = tally.moved;
    const mine = c.before.slice();
    relocateLabelsBefore(mine, c.groups, c.ir, c.sizes);
    expect(mine.length, label).toBe(c.after.length);
    for (let i = 0; i < mine.length; i++) {
      if (mine[i] === c.after[i]) continue;
      expect(differs(c.after[i], mine[i], `${label} node ${i}`), label).toBeNull();
    }
    reach.calls++;
    reach.searched += tally.searched - s0;
    reach.moved += tally.moved - m0;
    // `DIRECT_TAIL` (32) boxes or fewer are walked without the grid.
    if (tally.obstacles > 32 || c.groups.length > 33) reach.gridCalls++;
    if (c.groups.length > 33) reach.placedGridCalls++;
    for (const g of c.groups) {
      for (let i = g.from; i < g.to; i++) {
        const p = c.before[i]!.prim;
        if (p.t === "text" && p.block) reach.wrapped++;
      }
    }
    const seen = new Set<string>();
    for (const g of c.groups) {
      const key = JSON.stringify([g.anchor, g.ring, g.to - g.from]);
      if (seen.has(key)) reach.repeats++;
      seen.add(key);
    }
  }
  return reach;
}

function corpus(): { name: string; src: string; world: World }[] {
  const out: { name: string; src: string; world: World }[] = [];
  const worldFor = (dir: string): World => ({
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
  });
  const walk = (dir: string, keep: (f: string) => boolean): string[] => {
    const files: string[] = [];
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) files.push(...walk(p, keep));
      else if (keep(f)) files.push(p);
    }
    return files;
  };
  for (const d of [
    "examples",
    "test/fixtures",
    "test/recovery-corpus",
    "eval/goldens",
    "eval/faults",
    "eval/fidelity-plans",
  ])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      out.push({ name: p, src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md)
    for (const b of extractArchBlocks(readFileSync(p, "utf8")))
      out.push({ name: `${p}#${b.index}`, src: b.source, world: NULL_WORLD });
  return out;
}

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

describe("relocateLabels: the indexed pass against the full scan", () => {
  it("every storey of the corpus: every node the same, bit for bit", () => {
    let plans = 0;
    for (const c of corpus()) {
      compile(c.src, { noCache: true, world: c.world });
      plans++;
    }
    const r = replay("corpus");
    // Not vacuous: the corpus relocates labels, and some storeys are long enough for the grid.
    expect(plans).toBeGreaterThan(250);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.moved).toBeGreaterThan(20);
    expect(r.gridCalls).toBeGreaterThan(0);
    expect(r.wrapped).toBeGreaterThan(0);
  }, 300_000);

  const degenerate: Record<string, string> = {
    "300 coincident rooms": plan(`  for i in 0..300 { room at (0,0) size 4000x3000 label "Room" }`),
    "200 near-coincident rooms": plan(`  for i in 0..200 { room at (i*7, i*3) size 4000x3000 label "R{i}" }`),
    "a crowded lattice (labels wider than rooms)": plan(
      `  for i in 0..14 { for j in 0..14 { room at (i*1200, j*1200) size 1200x1200 label "Room" } }`,
    ),
    "coincident L-shapes and circles": plan(
      `  for i in 0..80 { room polygon (0,0) (4000,0) (4000,1500) (2000,1500) (2000,3000) (0,3000) label "L" }\n` +
        `  for i in 0..80 { room circle at (2000,2000) radius 1500 label "C" }`,
    ),
    "fixed labels among moving ones": plan(
      `  for i in 0..120 { room at (0,0) size 4000x3000 label "Fixed" at (2000,1500) }\n` +
        `  for i in 0..120 { room at (0,0) size 4000x3000 label "Free" }`,
    ),
    "rooms piled on walls and furniture": plan(
      `  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n` +
        `  wall partition thickness 100 { (2000,0) (2000,3000) }\n` +
        `  for i in 0..150 { room at (0,0) size 4000x3000 label "Living" }\n` +
        `  furniture bed at (1000,1000) size 1600x2000\n  furniture sofa at (2400,400) size 1400x800`,
    ),
    // Names too wide for their rooms on one line, wrapped before the pass sees them: narrow
    // walled rooms, piled, with fixed ones among them and furniture to be moved off.
    "wrapped names among walls and furniture": plan(
      `  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }\n` +
        `  for i in 1..6 { wall partition thickness 200 { (i*2000,0) (i*2000,6000) } }\n` +
        `  for i in 0..6 { for k in 0..12 { room at (i*2000,0) size 2000x6000 label "Bedroom {i} Suite" } }\n` +
        `  for i in 0..6 { for k in 0..6 { room at (i*2000,0) size 2000x6000 label "Sleeping {k}" at (i*2000+1000,2000) } }\n` +
        `  for i in 0..6 { furniture bed at (i*2000+300,2400) size 1400x2000 }`,
    ),
    "two storeys of the same pile": plan(
      `  level 1 { for i in 0..120 { room at (0,0) size 4000x3000 label "Room" } }\n` +
        `  level 2 { for i in 0..120 { room at (i, 0) size 4000x3000 label "Room" } }`,
    ),
  };
  for (const [name, src] of Object.entries(degenerate)) {
    it(`${name}: every node the same, bit for bit`, () => {
      const res = compile(src, { noCache: true });
      expect(
        res.diagnostics.filter((d) => d.severity === "error"),
        name,
      ).toEqual([]);
      const r = replay(name);
      expect(r.calls).toBeGreaterThan(0);
      expect(r.searched, name).toBeGreaterThan(30);
      expect(r.moved, name).toBeGreaterThan(30);
      expect(r.gridCalls, name).toBeGreaterThan(0);
      if (name.startsWith("wrapped")) expect(r.wrapped, name).toBeGreaterThan(30);
    }, 300_000);
  }

  it("a pile of identical rooms reaches the remembered sums (same signature, searched)", () => {
    compile(plan(`  for i in 0..200 { room at (0,0) size 4000x3000 label "Room" }`), { noCache: true });
    const r = replay("identical");
    expect(r.repeats).toBeGreaterThan(150);
    expect(r.searched).toBeGreaterThan(150);
  }, 300_000);
  it("synthetic: boxes the grid cannot hold (huge, NaN) and labels at the threshold", () => {
    // No compiled plan reaches these: `checkNumberDomain` drops a non-finite or out-of-range
    // element first. The pass is called directly so the plain-loop fallbacks run anyway.
    const text = (x: number, y: number, value = "Room"): SceneNode => ({
      layer: "labels",
      prim: { t: "text", at: { x, y }, value, size: 250, anchor: "middle", baseline: "central" },
      paint: {},
    });
    const box = (x: number, y: number, w: number, h: number): SceneNode => ({
      layer: "furniture",
      prim: {
        t: "polygon",
        pts: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
      },
      paint: {},
    });
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    // A NaN obstacle makes every sum NaN (no candidate is then strictly better), so it gets a
    // call of its own; the first call moves labels past huge boxes the grid cannot hold.
    for (const poisoned of [false, true]) {
      const odd = [1e301, -1e301, Number.NaN, 2e300, -0, 1 + 2 ** -52];
      const nodes: SceneNode[] = [];
      for (let k = 0; k < 60; k++) nodes.push(box(k % 7 === 0 ? 1e301 * (k % 2 ? 1 : -1) : 1000 + k, 1200, 800, 600));
      nodes.push(box(1e301, 1e301, 1e301, 1e301), box(-1e301, 0, 1e301, 10));
      if (poisoned) nodes.push(box(Number.NaN, Number.NaN, 10, 10));
      const groups: LabelGroup[] = [];
      for (let k = 0; k < 80; k++) {
        // The odd anchors come last: a NaN label, once placed, makes every later sum NaN.
        const x = k >= 60 ? odd[k % odd.length]! : k % 5 === 0 ? 2000 + 2 ** -40 : 2000;
        const from = nodes.length;
        nodes.push(text(x, 1500), text(x, 1800, "12.0 m²"));
        groups.push({ ring, anchor: { x, y: 1500 }, fixed: k % 9 === 0, from, to: nodes.length });
      }
      const ir = { walls: [] } as unknown as ResolvedPlan;
      const sizes = { roomFont: 250 } as RenderSizes;
      relocateLabels(nodes, groups, ir, sizes);
      const r = replay(`synthetic${poisoned ? " (NaN)" : ""}`);
      expect(r.searched).toBeGreaterThan(30);
      if (!poisoned) expect(r.moved).toBeGreaterThan(10);
    }
  });
});

describe("BoxSums against the plain loop", () => {
  // The relocations above compare decisions; this compares the sums under them, where adding
  // the same terms in another order is already a different float.
  it("property: the same float as summing every box in order, from any start", () => {
    // Ordinary values mostly; a rare NaN (which makes the rest of a sum NaN) or 1e301 (which
    // the grid cannot hold) keeps the fallbacks in play.
    const v = fc.oneof(
      { weight: 20, arbitrary: fc.constantFrom(-0, 0, 0.1, 0.3, 1, 7.7, 500.25, 1e3 + 0.1, 2e3, -1e3) },
      { weight: 1, arbitrary: fc.constantFrom(1e301, -1e301, Number.NaN) },
    );
    const ext = fc.constantFrom(0, 0.3, 1, 333.3, 1234.5, 3000, 3000, 3000, -5);
    const box = fc.tuple(v, v, ext, ext).map(([x, y, w, h]) => ({ x, y, w, h }));
    let nonzero = 0;
    fc.assert(
      fc.property(
        fc.array(box, { maxLength: 120, size: "max" }),
        fc.array(fc.tuple(box, fc.nat(), fc.constantFrom(0, 0.5, 1e9)), { maxLength: 20, size: "max" }),
        fc.constantFrom(100, 1000, 5000),
        (boxes, queries, cell) => {
          const sums = new BoxSums(cell);
          for (const b of boxes) sums.push(b);
          for (const [rect, start, base] of queries) {
            const from = boxes.length === 0 ? 0 : start % (boxes.length + 1);
            let plain = base;
            for (let i = from; i < boxes.length; i++) plain += overlapArea(rect, boxes[i]!);
            const got = sums.sum(rect, from, base);
            expect(Object.is(got, plain), `${got} vs ${plain}`).toBe(true);
            // A tail longer than the 32 the pass walks directly is answered by the grid.
            if (got !== base && !Number.isNaN(got) && boxes.length - from > 32) nonzero++;
          }
        },
      ),
      { numRuns: 1000, seed: 1519 },
    );
    expect(nonzero).toBeGreaterThan(250);
  });
});
