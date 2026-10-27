/**
 * The orientation convention (archlang-3d plan §3.4, V-FUR-02): a piece's front is +Z in its own
 * frame, and at `rotate 0` it faces page-DOWN (+y); the exporters' yaw is minus the plan's
 * clockwise `rotate`. Checked against the core's own placement: every piece laneway-house places
 * `against` a wall has its BACK on that wall's face and its front clear of it.
 */
import { resolvePlan } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan } from "../src/index.js";
import type { Point } from "../src/walls/ownership.js";
import { EXAMPLE_FILES, WORLD } from "./corpus.js";

/** The page direction a piece faces at yaw `yawDeg`: page-down at 0, then clockwise on the page as yaw falls. */
function front(yawDeg: number): Point {
  const r = (((-yawDeg % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  return { 0: { x: 0, y: 1 }, 90: { x: -1, y: 0 }, 180: { x: 0, y: -1 }, 270: { x: 1, y: 0 } }[r];
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

describe("orientation: yaw = −rotate°, front = +Z, faces page-down at rotate 0", () => {
  const source = EXAMPLE_FILES["laneway-house.arch"] ?? "";
  const ir = resolvePlan(source, { world: WORLD }).ir;
  const r = adaptPlan(source, { world: WORLD });
  // The pieces laneway-house writes `against` a wall or a room edge (its source, lines 40–53).
  const AGAINST = ["fridge", "stove", "kitchen_sink", "counter", "bed", "wc"];

  it("reads laneway-house's against-wall pieces", () => {
    expect(r.ok && ir).toBeTruthy();
    const cats = (r.ok ? (r.scene.levels[0]?.furniture ?? []) : []).map((f) => f.category);
    for (const c of AGAINST) expect(cats).toContain(c);
  });

  const walls = ir?.walls ?? [];
  const segs = walls.flatMap((w) =>
    w.points
      .slice(0, w.closed ? undefined : -1)
      .map((a, i) => ({ a, b: w.points[(i + 1) % w.points.length] as Point, half: w.thickness / 2 })),
  );
  const pieces = (r.ok ? (r.scene.levels[0]?.furniture ?? []) : []).filter((f) => AGAINST.includes(f.category));
  type Piece = (typeof pieces)[number];

  /** Whether, read at `yawDeg`, the piece's back edge sits on a wall face and its front edge is clear. */
  function fits(f: Piece, yawDeg: number): boolean {
    const c = { x: f.centre[0] / 1000, y: f.centre[1] / 1000 };
    const dir = front(yawDeg);
    const depth = (Math.abs(dir.x) * f.size.w + Math.abs(dir.y) * f.size.d) / 1000;
    const back = { x: c.x - (dir.x * depth) / 2, y: c.y - (dir.y * depth) / 2 };
    const fore = { x: c.x + (dir.x * depth) / 2, y: c.y + (dir.y * depth) / 2 };
    // On a face: the back edge's midpoint sits half a wall thickness off some centreline.
    const onFace = segs.some((s) => Math.abs(segDist(back, s.a, s.b) - s.half) <= 1);
    const foreClear = segs.every((s) => segDist(fore, s.a, s.b) > s.half + 1);
    return onFace && foreClear;
  }

  it("puts each one's back on a wall face and its front clear of every wall", () => {
    expect(pieces.length).toBe(AGAINST.length);
    expect(pieces.filter((f) => !fits(f, f.yawDeg)).map((f) => `${f.id} yaw ${f.yawDeg}`)).toEqual([]);
  });

  it("fails under the opposite sign of yaw (the check can fail)", () => {
    const turned = pieces.filter((f) => f.yawDeg % 180 !== 0);
    expect(turned.length).toBeGreaterThan(0);
    expect(turned.every((f) => !fits(f, -f.yawDeg))).toBe(true);
  });
});
