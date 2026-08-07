import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { dimReach } from "../src/chrome-layout.js";
import type { SceneNode } from "../src/scene.js";

/**
 * **The bbox-derived-position defect class.**
 *
 * A position derived from a shape's *bounding box or centroid* rather than from the
 * shape itself is right for a rectangle and can be arbitrarily wrong for a concave ring
 * — and, because nothing measures it, wrong *silently*. Three instances were fixed
 * during Batch-3 (the room label, the circulation routing anchor, the `dims auto`
 * witness lines); the sweep that followed found two more, and both are pinned here.
 *
 * The shape of every case below is the same: a plan whose bounding box and whose floor
 * disagree, built so that the bbox answer and the true answer are *opposite*.
 */

/** An L: the floor is the west arm (x 0…2000) plus the south band (y 6000…8000). The
 *  NOTCH — x 2000…8000, y 0…6000 — is inside the bounding box and is not floor, and the
 *  bbox centre (4000, 4000) sits squarely in it. */
const L_RING = "polygon (0,0) (2000,0) (2000,6000) (8000,6000) (8000,8000) (0,8000)";
const L_SHELL = "(0,0) (2000,0) (2000,6000) (8000,6000) (8000,8000) (0,8000)";

const codes = (src: string): string[] => compile(src).diagnostics.map((d) => d.code ?? "");

/**
 * The points the door's LEAF and SWING ARC are drawn from — which side of the wall the
 * door opens onto. The opening's own polygon is excluded: it straddles the wall by a
 * half thickness on both faces and so says nothing about the swing.
 */
function swingPoints(src: string): { x: number; y: number }[] {
  const scene = compile(src).scene;
  const pts: { x: number; y: number }[] = [];
  const walk = (p: SceneNode["prim"]): void => {
    if (p.t === "line") pts.push(p.a, p.b);
    else if (p.t === "arc") pts.push(p.center, p.start, p.end);
  };
  for (const n of scene?.nodes ?? []) if (n.layer === "doors") walk(n.prim);
  return pts;
}

describe("door `swing into <room>` asks the room's floor, not its bounding box", () => {
  // The `notch` wall runs down the middle of the L's bounding box and touches no part of
  // the room. Before the fix the bbox-perimeter test accepted it — the door was silently
  // given a swing "into" a room it does not border, and no diagnostic said so.
  const onAWallTheRoomDoesNotBorder = `plan "t" {
  wall id=shell exterior thickness 200 { ${L_SHELL} close }
  wall id=notch partition thickness 200 { (8000,0) (8000,6000) }
  room id=r ${L_RING} label "L"
  door id=d on notch at 3000 width 900 swing into r
}`;

  it("warns when the named room does not border the host wall", () => {
    expect(codes(onAWallTheRoomDoesNotBorder)).toContain("W_SWING_ROOM_NOT_ADJACENT");
  });

  // The east face of the west arm (x = 2000, y 0…6000) is a genuine edge of the ring and
  // is nowhere on the bounding box. Before the fix this raised a false
  // `W_SWING_ROOM_NOT_ADJACENT` and fell back to the default swing.
  const onARealEdgeOffTheBbox = (ring: string) => `plan "t" {
  wall id=shell exterior thickness 200 { ${ring} close }
  room id=r ${L_RING} label "L"
  door id=d at (2000,3000) width 900 wall shell swing into r
}`;

  it("accepts a door on a ring edge that the bounding box does not carry", () => {
    expect(codes(onARealEdgeOffTheBbox(L_SHELL))).not.toContain("W_SWING_ROOM_NOT_ADJACENT");
  });

  // The floor at that door is to the WEST (x < 2000). `hinge` is traversal-relative, so
  // the leaf may pivot at either end — but the side it sweeps to is the room's, and that
  // must not depend on which way round the wall was written.
  it.each([
    ["as written", L_SHELL],
    ["reversed", "(0,8000) (8000,8000) (8000,6000) (2000,6000) (2000,0) (0,0)"],
  ])("sweeps onto the floor side whichever way the wall is traversed (%s)", (_name, ring) => {
    const pts = swingPoints(onARealEdgeOffTheBbox(ring));
    expect(pts.length).toBeGreaterThan(0);
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThanOrEqual(2000);
  });

  // The rectangle path is untouched: the historical centre-of-the-rectangle answer is
  // still what a rectangular room gives, positively and negatively.
  const rect = (wall: string) => `plan "t" {
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  wall id=far partition thickness 200 { (6000,0) (6000,3000) }
  room id=r at (0,0) size 4000x3000 label "R"
  door id=d on ${wall} width 900 swing into r
}`;

  it("keeps the rectangle answers — accepted on its own wall, refused on a distant one", () => {
    expect(codes(rect("shell at 2000"))).not.toContain("W_SWING_ROOM_NOT_ADJACENT");
    expect(codes(rect("far at 1500"))).toContain("W_SWING_ROOM_NOT_ADJACENT");
  });
});

describe("`furniture … against wall <w> in <room>` probes the floor, not the bounding box", () => {
  // Both faces of the `notch` wall land inside the L's bounding box and outside its
  // floor. The bbox test made one of them read as "inside the room" and silently backed
  // the counter onto a wall the room does not touch; the ring test reaches the existing
  // "neither/both faces fall inside" refusal instead.
  const src = `plan "t" {
  wall id=shell exterior thickness 200 { ${L_SHELL} close }
  wall id=notch partition thickness 200 { (8000,0) (8000,6000) }
  room id=r ${L_RING} label "L"
  furniture id=f counter against wall notch in r
}`;

  it("refuses rather than back a piece onto a wall outside the room", () => {
    expect(codes(src)).toContain("E_FURN_AGAINST");
  });

  it("still infers the side for a rectangular room", () => {
    const ok = `plan "t" {
  wall id=south exterior thickness 200 { (0,3000) (4000,3000) }
  room id=r at (0,0) size 4000x3000 label "R"
  furniture id=f counter against wall south offset 1000 in r
}`;
    expect(codes(ok)).not.toContain("E_FURN_AGAINST");
  });
});

/**
 * `dimReach` bounds a text node by its anchor inflated by its font size — a SQUARE of
 * the font size, which ignores the string's length entirely. Audited 2026-08-07 and
 * deliberately left as it is; this test pins the two facts that make that safe, so a
 * future change to the annotation geometry that breaks either of them shows up here
 * rather than as a clipped drawing.
 *
 *  1. The box is **conservative across the baseline** — the direction that actually sets
 *     the margin on a dimensioned side. A cap height is ~0.7 em, so a half-height of a
 *     full em over-reserves by ~3×.
 *  2. Along the baseline it under-reserves for a string of four or more characters, but
 *     a dimension number is anchored at its span's MIDPOINT — interior to the bounds by
 *     construction — so that direction is never the binding maximum.
 */
describe("dimReach's square-of-the-font-size text box (audited, deliberately unchanged)", () => {
  const bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 5000 };
  const text = (at: { x: number; y: number }, value: string, size: number): SceneNode => ({
    layer: "dims",
    prim: { t: "text", at, value, size, anchor: "middle", baseline: "central" },
    paint: {},
  });

  it("reserves one full font size across the baseline, whatever the string says", () => {
    const short = dimReach(bounds, [text({ x: 5000, y: 5300 }, "4", 200)]);
    const long = dimReach(bounds, [text({ x: 5000, y: 5300 }, "12345678", 200)]);
    expect(short.bottom).toBe(500);
    expect(long.bottom).toBe(500);
  });

  it("is unaffected by string length while the anchor stays interior to the bounds", () => {
    const at = { x: 5000, y: 5300 };
    expect(dimReach(bounds, [text(at, "4200", 200)])).toEqual(dimReach(bounds, [text(at, "4", 200)]));
  });
});
