/**
 * Doors, windows and openings on a curved wall are drawn on the curve, and on a straight wall
 * exactly as before (card ARC-W1).
 *
 * The bug: a window on an `arc` segment was drawn as straight lines along the tangent at its centre,
 * so its jambs stood off the curve by about `hw² / 2R` (170 mm for a 1600 mm window on a 1900 mm
 * bay, more than half the 250 mm wall) and a door's leaf hung off the jamb by the same. Now every
 * line along the wall is a concentric arc, every jamb radial and on the joinery's own cut
 * (`arcOpeningSpan`, the span `openingCut` severs), and a door's leaf is DRAWN hinged on a jamb of the
 * cut. Drawing only: the model's swing (`doorSwing`/`doorLeaves`, read by lint, the symmetry facts and
 * the 3D package) is still the tangent construction, and the annotation passes read main's footprint
 * of a curved opening (`annotationFootprint`: the tangent drawing), so no label, tag or leader moves.
 *
 * The straight-host rows are {@link arcOpeningsLawDigest} (`test/helpers/arc-openings-law.ts`),
 * **measured against `src/` at `a0f85ebf`** (`main` before the change), that tree extracted by
 * `git archive`, the body and the rows imported from this branch and handed that tree's compiler; a
 * planted change to a straight window's glazing gap moved all four, so the law can fail.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, doorLeaves, lint, renderAscii, resolvePlan, toDxf } from "../src/index.js";
import {
  clearResolveCache,
  evaluationSteps,
  resolveAll,
  type RDoor,
  type ROpening,
  type RWall,
  type RWindow,
} from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD } from "../src/world.js";
import { segmentDirAt } from "../src/geometry.js";
import { openingCut, PointInterner } from "../src/geometry/band.js";
import { type Arc, arcExtremes, arcFromPrimitive } from "../src/geometry/arc.js";
import { windowEl } from "../src/elements/window.js";
import { WINDOW_KINDS } from "../src/grammar/tokens.js";
import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";
import { type ArcOpeningsLawApi, arcOpeningsLawDigest } from "./helpers/arc-openings-law.js";
import { BAY, drum, STRAIGHT_ROWS } from "./tables/arc-openings-plans.js";

const API: ArcOpeningsLawApi = {
  compile,
  describe,
  lint,
  stepsOf(src) {
    clearResolveCache();
    const { plan: ast } = parse(src, BUILTIN_REGISTRY);
    if (!ast) return 0;
    return evaluationSteps(resolveAll(link(ast, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD));
  },
  toDxf,
  renderAscii,
};

// Digest first: a row keyed by a path is the shape the secret scanner reads as a credential.
const PINS: ReadonlyArray<readonly [string, string]> = [
  ["2fddce09f68aca8ac04d8e97f73375dc2c4a8c17b9331e185e63128e007700ab", "inline:every-window-kind-straight"],
  ["62951efadb983934a2dcca18390aa119c56977ed604e89e34cb7bb6aafa487d0", "inline:oblique-wall"],
  ["76a967c9f265f11aea7dabd0a4cdcc06e5d4e4e3688ed024f9728eadea6779d9", "inline:corner-window"],
  // Re-taken by card ARC3 (#1020): this plan's living room is a rectangle on the chord of the shell's
  // `arc … radius 1900 cw`, so the 1.13 m² bay is standable floor in no room and `lint()` now carries one
  // W_FLOOR_UNASSIGNED for it. Its SVG, describe(), diagnostics and scene are unchanged; was 3129dce9….
  ["3aa65a73fbc0d6a50c0130c52910b337ee4b606cf10c84e9792728745723005b", "inline:straight-runs-of-a-curved-wall"],
];

type Hosted = RDoor | RWindow | ROpening;
const openingsOf = (src: string): Hosted[] =>
  (resolvePlan(src).ir?.elements ?? []).filter(
    (e): e is Hosted => e.kind === "door" || e.kind === "window" || e.kind === "opening",
  );

suite("a straight host draws exactly as before", () => {
  it("premise: every row draws, every opening stands on a straight run, and the rows reach every fork", () => {
    expect(PINS.map(([, name]) => name)).toEqual(STRAIGHT_ROWS.map((r) => r.name));
    const all = STRAIGHT_ROWS.flatMap((r) => {
      const out = compile(r.src, { noCache: true });
      expect(
        out.diagnostics.filter((d) => d.severity === "error"),
        r.name,
      ).toEqual([]);
      return openingsOf(r.src);
    });
    for (const o of all) {
      expect(o.host, o.id).not.toBeNull();
      expect(o.host!.arc, o.id).toBeUndefined();
    }
    const windows = all.filter((o): o is RWindow => o.kind === "window");
    for (const k of WINDOW_KINDS)
      expect(
        windows.some((w) => w.windowKind === k),
        k,
      ).toBe(true);
    expect(windows.some((w) => w._corner !== undefined)).toBe(true);
    expect(all.some((o) => o.kind === "door" && o.doorKind === "double")).toBe(true);
    expect(all.some((o) => o.kind === "opening")).toBe(true);
    // The straight runs of a wall that has an arc: the fork is per segment.
    expect(all.filter((o) => o.host!.arcWall === true).length).toBeGreaterThanOrEqual(3);
  });

  for (const [pin, name] of PINS) {
    it(name, () => {
      const row = STRAIGHT_ROWS.find((r) => r.name === name)!;
      expect(arcOpeningsLawDigest(API, row.src)).toBe(pin);
    });
  }
});

const EPS = 1e-6;
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The one window of `src`, its host wall, its arc, the joinery's cut for it and its drawn nodes. */
function windowCase(src: string): { w: RWindow; arc: Arc; cut: ReturnType<typeof openingCut>; nodes: SceneNode[] } {
  const els = resolvePlan(src).ir!.elements;
  const ws = els.filter((e): e is RWindow => e.kind === "window");
  expect(ws).toHaveLength(1);
  const w = ws[0]!;
  const wall = els.find((e): e is RWall => e.kind === "wall" && e.id === w.host!.wallId)!;
  const cut = openingCut(wall, { at: w.at, width: w.width }, new PointInterner());
  const out = compile(src, { noCache: true });
  expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return { w, arc: w.host!.arc!, cut, nodes: out.scene!.nodes.filter((n) => n.layer === "windows") };
}

/** Every arc a node draws: an `arc` primitive, or the arc edges of a `path`'s loops. */
function arcsOf(n: SceneNode): Arc[] {
  if (n.prim.t === "arc") return [arcFromPrimitive(n.prim)];
  if (n.prim.t !== "path") return [];
  return n.prim.loops.flatMap((lp) => {
    let from = lp.start;
    return lp.edges.flatMap((e) => {
      const a =
        e.t === "arc" ? [arcFromPrimitive({ center: e.center, r: e.r, start: from, end: e.to, sweep: e.sweep })] : [];
      from = e.to;
      return a;
    });
  });
}

/** Every point a node draws to (vertices, ends, and each arc's extremes, so a bulge counts). */
function inkOf(n: SceneNode): Point[] {
  const p = n.prim;
  const arcs = arcsOf(n).flatMap((a) => arcExtremes(a));
  if (p.t === "line") return [p.a, p.b];
  if (p.t === "polygon") return p.pts;
  if (p.t === "circle")
    return [p.center, { x: p.center.x - p.r, y: p.center.y - p.r }, { x: p.center.x + p.r, y: p.center.y + p.r }];
  if (p.t === "path") return [...p.loops.flatMap((lp) => [lp.start, ...lp.edges.map((e) => e.to)]), ...arcs];
  return arcs;
}

const WINDOW_CASES: ReadonlyArray<readonly [string, string]> = [
  ["the card's bay (R1900, 1600 wide, cw)", BAY],
  ["a casement on a ccw drum", drum("  window id=w casement on drum at 9% width 1400 hinge left")],
  ["a sliding window on a cw drum", drum("  window id=w sliding on drum at 22% width 1600", " cw")],
  ["a tilt_turn window", drum("  window id=w tilt_turn on drum at 43% width 1200")],
  ["a fixed window", drum("  window id=w fixed on drum at 58% width 1000")],
  ["a window over 120° of arc (two pieces a line)", drum("  window id=w on drum at 80% width 7000")],
];

suite("a window on a curve stands on the arc", () => {
  for (const [name, src] of WINDOW_CASES) {
    it(`${name}: its jambs are the cut's, on the faces R ± t/2`, () => {
      const { w, arc, cut, nodes } = windowCase(src);
      const h = w.host!.thickness / 2;
      expect(cut).not.toBeNull();
      const jambEnds = cut!.flatMap((e) => (e.t === "line" ? [e.a, e.b] : []));
      expect(jambEnds).toHaveLength(4);
      // The two face arcs, whatever their pieces: every arc drawn at R ± h.
      const faces = nodes.flatMap(arcsOf).filter((a) => Math.abs(Math.abs(a.r - arc.r) - h) < EPS);
      expect(faces.length).toBeGreaterThanOrEqual(2);
      const faceEnds = faces.flatMap((a) => [a.a, a.b]);
      for (const p of faceEnds) expect(Math.abs(Math.abs(dist(p, arc.center) - arc.r) - h)).toBeLessThan(EPS);
      // Each corner of the cut is the end of a drawn face: the drawing's jambs are the cut's.
      for (const j of jambEnds) expect(Math.min(...faceEnds.map((p) => dist(p, j)))).toBeLessThan(EPS);
    });

    it(`${name}: every curve it draws is concentric with the wall, and the cover's jambs radial`, () => {
      const { arc, nodes } = windowCase(src);
      const curves = nodes.flatMap(arcsOf);
      expect(curves.length).toBeGreaterThan(0);
      for (const a of curves) expect(dist(a.center, arc.center)).toBeLessThan(1e-9);
      // No line along the wall is left: a straight `line` node is only a kind's chevron arm.
      const cover = nodes[0]!;
      expect(cover.prim.t).toBe("path");
      if (cover.prim.t !== "path") return;
      const lp = cover.prim.loops[0]!;
      let from = lp.start;
      let radial = 0;
      for (const e of lp.edges) {
        if (e.t === "line") {
          const u = { x: e.to.x - from.x, y: e.to.y - from.y };
          const v = { x: from.x - arc.center.x, y: from.y - arc.center.y };
          expect(Math.abs(u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))).toBeLessThan(1e-9);
          radial++;
        }
        from = e.to;
      }
      expect(radial).toBe(2);
      expect(dist(from, lp.start)).toBe(0);
    });

    it(`${name}: drawCost bounds what it draws and measures() every drawn point`, () => {
      const { w, nodes } = windowCase(src);
      expect(nodes.length).toBeLessThanOrEqual(windowEl.drawCost!(w));
      const m = windowEl.measures!(w);
      const [minX, maxX, minY, maxY] = m.slice(-4) as [number, number, number, number];
      // The cover overhangs the faces by a pen (held by `checkDrawnSizes`), so it is left out.
      for (const p of nodes.slice(1).flatMap(inkOf)) {
        expect(p.x).toBeGreaterThanOrEqual(minX - EPS);
        expect(p.x).toBeLessThanOrEqual(maxX + EPS);
        expect(p.y).toBeGreaterThanOrEqual(minY - EPS);
        expect(p.y).toBeLessThanOrEqual(maxY + EPS);
      }
    });
  }

  it("a window over 120° of arc draws each line along the wall in pieces, and is charged for them", () => {
    const { w, nodes } = windowCase(WINDOW_CASES[5]![1]);
    expect(nodes.filter((n) => n.prim.t === "arc").length).toBe(8);
    expect(windowEl.drawCost!(w)).toBe(10);
  });

  it("the sill stands on the exterior face, along the arc: one path of true arcs", () => {
    const { w, arc, nodes } = windowCase(WINDOW_CASES[1]![1]);
    const t = w.host!.thickness;
    const sill = nodes.find((n) => n.prim.t === "path" && n.paint.fill === "none");
    expect(sill).toBeDefined();
    // The room is inside the drum, so the sill is outside: from the outer face outward.
    const radii = arcsOf(sill!).map((a) => a.r);
    expect(Math.min(...radii)).toBeCloseTo(arc.r + t / 2, 9);
    expect(Math.max(...radii)).toBeCloseTo(arc.r + t / 2 + 0.2 * t, 9);
  });
});

suite("the annotation passes read main's footprint of a curved opening (card ARC-W1)", () => {
  // Each pinned value is `main`'s (`a0f85ebf`), measured with these very plans: the label, tag and
  // north-arrow passes read the tangent drawing and the model's leaves (`annotationFootprint`), so
  // what they place does not move when the opening is drawn on the curve. The review of the second
  // round found these two moved: the tag by 400 mm, the room's name by 270 mm.
  const texts = (src: string) =>
    compile(src, { noCache: true })
      .scene!.nodes.filter((n) => n.prim.t === "text")
      .slice(0, 3)
      .map((n) => (n.prim.t === "text" ? [n.prim.value, n.prim.at.x, n.prim.at.y] : []));

  it("a window's opening tag stands where main put it", () => {
    expect(texts(drum("  schedule openings\n  window id=w on drum at 3% width 800"))).toEqual([
      ["Drum", 3000, 2962.5],
      ["28.3 m²", 3000, 3168.75],
      ["W01", 5210.882504364418, 2587.801566982905],
    ]);
  });

  it("the room's name stands where main put it beside a door on a small drum", () => {
    expect(texts(drum("  door id=d on drum at 24% width 1100 hinge right swing out", "", 200, 900))).toEqual([
      ["Drum", 900, 1158],
      ["2.5 m²", 900, 1224],
    ]);
  });

  it("the drawing itself is the curve: the footprint is put back after the passes", () => {
    const nodes = compile(drum("  window id=w on drum at 3% width 800"), { noCache: true }).scene!.nodes;
    expect(nodes.some((n) => n.layer === "windows" && n.prim.t === "arc")).toBe(true);
    expect(nodes.some((n) => n.layer === "floor" && n.prim.t === "polygon" && n.prim.pts.length === 0)).toBe(false);
  });
});

suite("a door on a curve is DRAWN hanging on the cut's jambs; its model swing is unchanged", () => {
  const cutJambs = (src: string, id: string): { door: RDoor; mids: Point[]; arc: Arc } => {
    const els = resolvePlan(src).ir!.elements;
    const door = els.find((e): e is RDoor => e.kind === "door" && e.id === id)!;
    const wall = els.find((e): e is RWall => e.kind === "wall" && e.id === door.host!.wallId)!;
    const cut = openingCut(wall, { at: door.at, width: door.width }, new PointInterner())!;
    const mids = cut.flatMap((e) => (e.t === "line" ? [{ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }] : []));
    return { door, mids, arc: door.host!.arc! };
  };
  /** The drawn swings: each `arc` on the doors layer, centred on its hinge, from the leaf's tip to the far jamb. */
  const drawnSwings = (src: string) =>
    compile(src, { noCache: true })
      .scene!.nodes.filter((n) => n.layer === "doors" && n.prim.t === "arc")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "arc" }>);
  const CASES: ReadonlyArray<readonly [string, string]> = [
    ["d1", drum("  door id=d1 on drum at 10% width 1000 swing in")],
    ["d2", drum("  door id=d2 on drum at 35% width 900 hinge right swing out")],
  ];

  for (const [id, src] of CASES) {
    it(`hinged ${id}: the drawn hinge is a jamb of the cut, on the centreline R`, () => {
      const { mids, arc } = cutJambs(src, id);
      const [swing] = drawnSwings(src);
      expect(Math.abs(dist(swing!.center, arc.center) - arc.r)).toBeLessThan(EPS);
      expect(Math.abs(dist(swing!.end, arc.center) - arc.r)).toBeLessThan(EPS);
      expect(Math.min(...mids.map((m) => dist(m, swing!.center)))).toBeLessThan(EPS);
      expect(Math.min(...mids.map((m) => dist(m, swing!.end)))).toBeLessThan(EPS);
      // A leaf is straight: it closes along the chord, so it is as long as the chord.
      expect(swing!.r).toBeCloseTo(dist(swing!.center, swing!.end), 9);
    });

    it(`hinged ${id}: the model's swing (lint, symmetry, 3D) is still the tangent construction`, () => {
      const { door } = cutJambs(src, id);
      const [leaf] = doorLeaves(door);
      const d = segmentDirAt(door.host!, door.at);
      const s = door.hinge === "left" ? -1 : 1;
      expect(leaf!.hinge).toEqual({
        x: door.at.x + d.x * s * (door.width / 2),
        y: door.at.y + d.y * s * (door.width / 2),
      });
      expect(leaf!.radius).toBe(door.width);
    });
  }

  it("double: each drawn leaf hinges on its own jamb and the pair closes on one line", () => {
    const src = drum("  door id=d3 double on drum at 70% width 1600");
    const { mids } = cutJambs(src, "d3");
    const [a, b] = drawnSwings(src);
    for (const sw of [a!, b!]) expect(Math.min(...mids.map((m) => dist(m, sw.center)))).toBeLessThan(EPS);
    expect(a!.end).toEqual(b!.end);
    // The two hinges and the shared far jamb are collinear (the chord between the jambs).
    const u = { x: a!.end.x - a!.center.x, y: a!.end.y - a!.center.y };
    const v = { x: b!.center.x - a!.center.x, y: b!.center.y - a!.center.y };
    expect(Math.abs(u.x * v.y - u.y * v.x) / Math.hypot(u.x, u.y)).toBeLessThan(EPS);
  });

  it("a door wider than its span can close draws the model's leaf, never a degenerate one", () => {
    // 3000 mm on a 400 mm drum: the span's half-angle caps at π and the jambs meet.
    const src = drum("  door id=d on drum at 20% width 3000", "", 250, 400);
    const swings = drawnSwings(src);
    expect(swings.length).toBeGreaterThan(0);
    for (const sw of swings) expect(sw.r).toBeGreaterThan(1);
  });

  it("the door's and the cased opening's covers are the cut's sector, concentric", () => {
    const src = drum("  door id=d1 on drum at 10% width 1000\n  opening id=o1 on drum at 40% width 1200");
    const nodes = compile(src, { noCache: true }).scene!.nodes.filter(
      (n) => n.layer === "doors" || n.layer === "openings",
    );
    const covers = nodes.filter((n) => n.prim.t === "path" && n.paint.stroke === undefined);
    expect(covers).toHaveLength(2);
    for (const c of covers) {
      const radii = arcsOf(c)
        .map((a) => a.r)
        .sort((x, y) => x - y);
      expect(radii[0]).toBeCloseTo(3000 - 125, 9);
      expect(radii[radii.length - 1]).toBeCloseTo(3000 + 125, 9);
      for (const a of arcsOf(c)) expect(dist(a.center, { x: 3000, y: 3000 })).toBeLessThan(1e-6);
    }
  });
});
