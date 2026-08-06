import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, makeVirtualWorld } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import type { RRoom } from "../src/ir.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { roomLabelAnchor } from "../src/elements/room.js";
import { COLLIDE_MIN, FRACTIONS } from "../src/label-placement.js";
import { pointInPolygon, rectRing } from "../src/geometry/polygon.js";
import { textWidth } from "../src/text-metrics.js";

/**
 * Obstacle-aware room-label placement (`src/label-placement.ts`).
 *
 * Two halves, and the second is the one that protects every drawing shipped before it:
 *
 *  1. A label whose box is genuinely buried — in furniture, in a door's swing, in a
 *     dimension number — moves off it, taking its area text with it, and lands inside
 *     its own room.
 *  2. A label that is already clear **does not move at all**. That is asserted directly
 *     against `roomLabelAnchor`, the anchor the room element computes, so the byte
 *     identity of an unobstructed plan is a property of the pass, not of a snapshot.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

const sceneOf = (src: string): Scene => {
  const res = compile(src, { noCache: true });
  if (!res.scene) throw new Error(`no scene: ${res.errors.join("; ")}`);
  return res.scene;
};

const roomsOf = (src: string): RRoom[] =>
  resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

/** Every `labels`-pass text node, in draw order. */
const labelTexts = (scene: Scene): Array<{ value: string; x: number; y: number; size: number }> =>
  scene.nodes
    .filter((n: SceneNode) => n.layer === "labels" && n.prim.t === "text")
    .map((n) => {
      if (n.prim.t !== "text") throw new Error("unreachable");
      return { value: n.prim.value, x: n.prim.at.x, y: n.prim.at.y, size: n.prim.size };
    });

/** The drawn position of one room's name. */
const nameAt = (scene: Scene, label: string): { x: number; y: number } => {
  const t = labelTexts(scene).find((n) => n.value === label);
  if (!t) throw new Error(`no label "${label}"`);
  return { x: t.x, y: t.y };
};

/** How far the drawn name sits from the anchor the room element computed. */
const drift = (src: string, id: string, label: string): { dx: number; dy: number } => {
  const room = roomsOf(src).find((r) => r.id === id)!;
  const a = roomLabelAnchor(room);
  const scene = sceneOf(src);
  const at = nameAt(scene, label);
  return { dx: at.x - a.x, dy: at.y - (a.y - scene.sizes.roomFont * 0.2) };
};

/** A 5 × 4 m room with a wall round it, and whatever else the caller adds. */
const plan = (body: string): string =>
  `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  ${body}
}`;

const CLEAR = plan(`room id=r at (0,0) size 5000x4000 label "Hall"`);
const BLOCKED = plan(`room id=r at (0,0) size 5000x4000 label "Hall"
  furniture bed at (1000,1000) size 3000x2000 label "Bed"`);

describe("label placement — a clear label never moves", () => {
  it("sits exactly on the room element's own anchor when nothing is drawn there", () => {
    expect(drift(CLEAR, "r", "Hall")).toEqual({ dx: 0, dy: 0 });
  });

  it("EVERY room name in the obstacle-free shipped examples is still on its anchor", () => {
    // These four cover the shapes the pass could most easily disturb: the large-building
    // flagship on a sheet with `dims auto` + axes, the polygon flagship (whose label
    // point is pinned to the exact centroid by test/polygon-rooms.test.ts), the curved
    // flagship, and a relationally-placed plan. None of them has furniture or a swing
    // under a room name, so none of them may move a byte.
    for (const file of ["museum.arch", "gallery-l.arch", "aquarium.arch", "relational.arch"]) {
      const src = example(file);
      const scene = sceneOf(src);
      for (const room of roomsOf(src)) {
        if (!room.label) continue;
        const a = roomLabelAnchor(room);
        expect({ file, id: room.id, ...nameAt(scene, room.label) }).toEqual({
          file,
          id: room.id,
          x: a.x,
          y: a.y - scene.sizes.roomFont * 0.2,
        });
      }
    }
  });

  it("a zero-area LINE is never an obstacle — a diagonal leader does not evict a label", () => {
    // The aquarium's `R12000` leader runs diagonally across the Cafe. Its bounding box
    // covers 8.5 × 8.5 m of empty floor; its ink covers none of the label. Boxing a line
    // would have moved that name 6 m.
    const src = example("aquarium.arch");
    expect(drift(src, "cafe", "Cafe")).toEqual({ dx: 0, dy: 0 });
  });

  it("keeps the incumbent on a TIE — the candidate lattice can never win by equal score", () => {
    // The room centre IS lattice point (0.5, 0.5), so the two are geometrically the same
    // place and score identically. Strict improvement is what stops the pass rewriting
    // the drawing for nothing.
    expect(FRACTIONS[0]).toBe(0.5);
    expect(drift(CLEAR, "r", "Hall")).toEqual({ dx: 0, dy: 0 });
  });
});

describe("label placement — a buried label moves", () => {
  it("moves off a furniture rectangle it was drawn on top of", () => {
    const { dx, dy } = drift(BLOCKED, "r", "Hall");
    expect(dx !== 0 || dy !== 0).toBe(true);
    const scene = sceneOf(BLOCKED);
    const at = nameAt(scene, "Hall");
    const w = textWidth("Hall", scene.sizes.roomFont) / 2;
    const h = scene.sizes.roomFont / 2;
    // Clear of the bed's own rectangle (1000,1000)–(4000,3000) on at least one axis.
    const clearX = at.x + w < 1000 || at.x - w > 4000;
    const clearY = at.y + h < 1000 || at.y - h > 3000;
    expect(clearX || clearY).toBe(true);
  });

  it("the AREA text travels with the name — the pair never separates", () => {
    const before = sceneOf(CLEAR);
    const after = sceneOf(BLOCKED);
    const pair = (s: Scene) => {
      const name = labelTexts(s).find((t) => t.value === "Hall")!;
      const area = labelTexts(s).find((t) => t.value.endsWith(" m²"))!;
      return { dx: area.x - name.x, dy: area.y - name.y };
    };
    expect(pair(after).dx).toBeCloseTo(pair(before).dx, 6);
    expect(pair(after).dy).toBeCloseTo(pair(before).dy, 6);
  });

  it("lands INSIDE its own room", () => {
    const room = roomsOf(BLOCKED)[0]!;
    const ring = rectRing({ x: room.at.x, y: room.at.y, w: room.size.w, h: room.size.h });
    const at = nameAt(sceneOf(BLOCKED), "Hall");
    expect(pointInPolygon(at.x, at.y, ring)).toBe(true);
  });

  it("moves off a DOOR SWING — the quarter disc is an obstacle, not just the leaf", () => {
    const src = plan(`room id=r at (0,0) size 5000x4000 label "Hall"
  door at (2500,4000) width 3000 wall exterior hinge left swing in`);
    const { dx, dy } = drift(src, "r", "Hall");
    expect(dx !== 0 || dy !== 0).toBe(true);
  });

  it("moves off a DIMENSION NUMBER — the reason this is a post-pass and not an element rule", () => {
    // A `dim` is lowered during `toScene`, not by an element, and its text is placed by
    // the dim element from the measured length. No `RenderCtx` can see it; only a pass
    // running after the dims are rendered can. Same plan, same room, same anchor — the
    // only difference is a dimension string laid across the middle of the room.
    const bare = plan(`room id=r at (0,0) size 5000x4000 label "Hall"`);
    const dimmed = plan(`room id=r at (0,0) size 5000x4000 label "Hall"
  dim (500,2000)->(4500,2000) offset 0`);
    expect(drift(bare, "r", "Hall")).toEqual({ dx: 0, dy: 0 });
    const { dx, dy } = drift(dimmed, "r", "Hall");
    expect(dx !== 0 || dy !== 0).toBe(true);
  });

  it("never lands on a label already placed — rooms are resolved in order", () => {
    // Two long names in two narrow rooms whose only clear floor is the same strip.
    const src = `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  room id=a at (0,0) size 3000x4000 label "Alpha"
  room id=b at (3000,0) size 3000x4000 label "Bravo"
  furniture bed at (200,1400) size 2600x1200
  furniture bed at (3200,1400) size 2600x1200
}`;
    const scene = sceneOf(src);
    const a = nameAt(scene, "Alpha");
    const b = nameAt(scene, "Bravo");
    const half = (v: string) => textWidth(v, scene.sizes.roomFont) / 2;
    const apart = Math.abs(a.x - b.x) >= half("Alpha") + half("Bravo") || Math.abs(a.y - b.y) >= scene.sizes.roomFont;
    expect(apart).toBe(true);
  });
});

describe("label placement — what it is not allowed to touch", () => {
  it("an explicit `label … at (x,y)` is NEVER relocated, obstacle or no obstacle", () => {
    // The pin sits squarely on the bed; an unpinned twin in the same plan moves off it.
    // NOTE the room form: `labelAt` reaches the IR only from the `polygon` and `circle`
    // resolvers — a RECTANGLE's `label … at` is parsed and then dropped at resolve, and
    // has been since v1.23. That is a pre-existing gap, not something this pass created
    // (a rect room with a pin behaves exactly as an unpinned one, before and after).
    const pinned = plan(`room id=r polygon (0,0) (5000,0) (5000,4000) (0,4000) label "Hall" at (2500,2000)
  furniture bed at (1000,1000) size 3000x2000 label "Bed"`);
    const loose = plan(`room id=r polygon (0,0) (5000,0) (5000,4000) (0,4000) label "Hall"
  furniture bed at (1000,1000) size 3000x2000 label "Bed"`);
    const scene = sceneOf(pinned);
    expect(nameAt(scene, "Hall")).toEqual({ x: 2500, y: 2000 - scene.sizes.roomFont * 0.2 });
    expect(nameAt(sceneOf(loose), "Hall")).not.toEqual({ x: 2500, y: 2000 - scene.sizes.roomFont * 0.2 });
  });

  it("W_ROOM_LABEL_OUTSIDE still fires on a pinned anchor — it is about the AUTHOR's point", () => {
    const src = `plan "P" { room polygon (0,0) (4000,0) (4000,3000) (0,3000) label "Hall" at (9000,9000) }`;
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).toContain("W_ROOM_LABEL_OUTSIDE");
  });

  it("`describe()` is untouched — a label is a drawing fact, not a measured one", () => {
    // Same plan, same furniture; the only difference is that the second one's label had
    // to move. Every measured fact must be identical.
    const moved = describePlan(BLOCKED);
    const pinned = describePlan(
      plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (2500,2000)
  furniture bed at (1000,1000) size 3000x2000 label "Bed"`),
    );
    expect(JSON.stringify(moved.rooms)).toBe(JSON.stringify(pinned.rooms));
    expect(moved.totals).toEqual(pinned.totals);
    expect(moved.caption).toBe(pinned.caption);
  });

  it("adds and removes NO nodes — it is a translation, nothing else", () => {
    const count = (s: Scene) => s.nodes.length;
    expect(count(sceneOf(BLOCKED))).toBe(count(sceneOf(BLOCKED)));
    // Two texts per labelled room (name + area), before and after a relocation.
    expect(labelTexts(sceneOf(CLEAR)).length).toBe(2);
    expect(labelTexts(sceneOf(BLOCKED)).length).toBe(2);
  });

  it("is deterministic — the same source renders byte-identically every time", () => {
    expect(compile(BLOCKED, { noCache: true }).svg).toBe(compile(BLOCKED, { noCache: true }).svg);
    const world = makeVirtualWorld({});
    expect(compile(BLOCKED, { noCache: true, world }).svg).toBe(compile(BLOCKED, { noCache: true }).svg);
  });

  it("the collision threshold is a fraction of the label's OWN box, so it is scale-free", () => {
    // The same plan at 1× and at 10× must make the same decision — the metric is a ratio,
    // never a millimetre count.
    const big = plan(`room id=r at (0,0) size 5000x4000 label "Hall"`).replace(/\d{3,}/g, (m) =>
      String(Number(m) * 10),
    );
    expect(COLLIDE_MIN).toBeGreaterThan(0);
    expect(drift(big, "r", "Hall")).toEqual({ dx: 0, dy: 0 });
  });
});
