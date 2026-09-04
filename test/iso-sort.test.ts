/**
 * **The painter's order is total, and the culling sign is measured rather than assumed.**
 *
 * Two claims, and they fail in different ways.
 *
 * ## Totality
 *
 * The reference implementation this feature borrows from sorts faces by depth with no
 * tie-break at all (`Arch.typ:2296`). At equal depth the result then depends on whatever
 * order the engine's sort happens to leave, and a floating-point hair apart is enough to
 * swap two faces no reader could tell apart. Both are non-determinism, and this repository
 * pins byte-identical output on three Node versions across two operating systems.
 *
 * So the key is a tuple whose first component is the depth **rounded through `fmt2`** — the
 * formatter the SVG coordinates themselves print at — and whose remaining three components
 * are unique per face by construction. The test that settles it is not "are ties broken"
 * but **"does reversing the input change a byte"**: a stable sort would pass a weaker test
 * while still being order-dependent, because `Array.prototype.sort` is only stable with
 * respect to the array it was given.
 *
 * ## The culling sign
 *
 * `extrude.ts` walks every side quad so that its right-handed normal is the OUTWARD one,
 * which follows from the joinery layer's orientation law (material on `+perp` of travel).
 * That makes back-face culling a plain winding test — but only if the sign is right, and a
 * sign that is wrong turns the building inside out while still producing a plausible
 * picture. So it is checked against a wall whose two faces are known by construction: the
 * SOUTH face of a box must survive and the NORTH face must not, for a viewer standing to
 * the south.
 */

import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { cameraFor, projectedArea2 } from "../src/view/camera.js";
import type { Face } from "../src/view/extrude.js";
import { facesOf } from "../src/view/extrude.js";
import { orderFaces } from "../src/view/paint.js";

const BOX = `plan "Box" {
  wall exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  room at (200,200) size 7600x4600 label "R"
}`;

const facesOfSource = (src: string): Face[] => {
  const { plan } = parse(src);
  return facesOf([{ ir: resolveAll(plan!).ir, index: 0 }]);
};

suite("iso painter — a total order, and a measured culling sign", () => {
  it("reversing the face list changes no byte of the drawing", () => {
    const faces = facesOfSource(BOX);
    const cam = cameraFor("iso");
    const forward = orderFaces(faces, cam);
    const reversed = orderFaces([...faces].reverse(), cam);
    expect(reversed.length).toBe(forward.length);
    // Compare the whole ordered geometry, not merely the count: two orderings that agree
    // on how many faces survive can still disagree about which is drawn last.
    const shape = (d: typeof forward): string => JSON.stringify(d.map((x) => [x.depth, x.loops]));
    expect(shape(reversed)).toBe(shape(forward));
  });

  it("a shuffled list, too — stability of the sort is not the property being claimed", () => {
    const faces = facesOfSource(BOX);
    const cam = cameraFor("axon");
    // A deterministic shuffle: take every other face, then the rest. No RNG in a test.
    const shuffled = [...faces.filter((_, i) => i % 2 === 0), ...faces.filter((_, i) => i % 2 === 1)];
    const a = orderFaces(faces, cam);
    const b = orderFaces(shuffled, cam);
    expect(JSON.stringify(b.map((x) => x.loops))).toBe(JSON.stringify(a.map((x) => x.loops)));
  });

  it("draws FAR to NEAR — the depths are non-increasing", () => {
    for (const view of ["iso", "axon"] as const) {
      const drawn = orderFaces(facesOfSource(BOX), cameraFor(view));
      for (let i = 1; i < drawn.length; i++) expect(drawn[i]!.depth).toBeLessThanOrEqual(drawn[i - 1]!.depth);
    }
  });

  it("planted equal-depth faces are separated by the id/loop/face tail, not by input order", () => {
    // Two faces at exactly the same depth: the same quad, twice, under different ids.
    const quad = [
      { x: 0, y: 0, z: 0 },
      { x: 1000, y: 0, z: 0 },
      { x: 1000, y: 0, z: 1000 },
      { x: 0, y: 0, z: 1000 },
    ];
    const mk = (elementId: string): Face => ({
      kind: "wall",
      loops: [quad],
      cullable: false,
      elementId,
      loopIndex: 0,
      faceIndex: 0,
    });
    const cam = cameraFor("iso");
    const ab = orderFaces([mk("b"), mk("a")], cam);
    const ba = orderFaces([mk("a"), mk("b")], cam);
    expect(ab.map((d) => d.face.elementId)).toEqual(["a", "b"]);
    expect(ba.map((d) => d.face.elementId)).toEqual(["a", "b"]);
  });

  it("a depth difference too small for `fmt2` to print cannot reorder two faces", () => {
    const at = (z: number, id: string): Face => ({
      kind: "wall",
      loops: [
        [
          { x: 0, y: 0, z },
          { x: 1000, y: 0, z },
          { x: 1000, y: 0, z: z + 1000 },
          { x: 0, y: 0, z: z + 1000 },
        ],
      ],
      cullable: false,
      elementId: id,
      loopIndex: 0,
      faceIndex: 0,
    });
    const cam = cameraFor("iso");
    // 1e-9 mm apart: it rounds away at 2 dp, so the id tail decides — in both input orders.
    const drawn = orderFaces([at(1e-9, "z"), at(0, "a")], cam);
    expect(drawn.map((d) => d.face.elementId)).toEqual(["a", "z"]);
    expect(drawn[0]!.depth).toBe(drawn[1]!.depth);
  });

  it("culls exactly the faces that turn away: the box keeps its SOUTH and WEST outer faces", () => {
    const cam = cameraFor("iso");
    const faces = facesOfSource(BOX);
    // The four outer side quads of the shell (loop 0 of the wall solid).
    const outer = faces.filter((f) => f.elementId.endsWith("walls@3000") && f.loopIndex === 0 && f.cullable);
    expect(outer.length).toBe(4);
    const kept = orderFaces(outer, cam).map((d) => d.face.faceIndex);
    // Loop 0 runs NW → NE → SE → SW: edge 0 is the north face, 1 the east, 2 the south,
    // 3 the west. A viewer to the south-west sees exactly the last two.
    expect(kept.sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("keeps a horizontal cap whatever its winding — a cap is never culled", () => {
    const faces = facesOfSource(BOX);
    const caps = faces.filter((f) => !f.cullable);
    expect(caps.length).toBeGreaterThan(0);
    const kept = orderFaces(caps, cameraFor("iso"));
    expect(kept.length).toBe(caps.length);
  });

  it("the sign is the camera's own: a reversed quad culls where the forward one survives", () => {
    const cam = cameraFor("iso");
    const south = [
      { x: 1000, y: 5000, z: 0 },
      { x: 0, y: 5000, z: 0 },
      { x: 0, y: 5000, z: 3000 },
      { x: 1000, y: 5000, z: 3000 },
    ];
    const proj = (l: typeof south): number => projectedArea2(l.map((p) => cam.project(p.x, p.y, p.z)));
    expect(Math.sign(proj(south))).toBe(cam.frontSign);
    expect(Math.sign(proj([...south].reverse()))).toBe(-cam.frontSign);
  });

  it("the whole pipeline is stable across two compiles of the same source", () => {
    for (const view of ["iso", "axon"] as const) {
      const a = compile(BOX, { view, noCache: true }).svg;
      const b = compile(BOX, { view, noCache: true }).svg;
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
    }
  });
});
