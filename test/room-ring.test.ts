// The room-ring seam (`src/geometry/room-ring.ts`, card ARC2-seam): over every room of the shipped examples, its exact
// boundary, area, extent and edge count agree with each other and with the discretised ring the grid layer reads.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolvePlan } from "../src/analyze.js";
import { edgeEnd, edgeStart, loopArea } from "../src/geometry/band.js";
import { rectRing } from "../src/geometry/polygon.js";
import {
  roomAreaMm2,
  roomCorners,
  roomCurveCount,
  roomEdges,
  roomExtent,
  roomRing,
} from "../src/geometry/room-ring.js";
import type { RRoom } from "../src/ir.js";
import { corpusFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

/** Every resolved room of every storey of the shipped examples (`examples/`, `lib` included). */
function corpusRooms(): RRoom[] {
  const out: RRoom[] = [];
  for (const f of corpusFiles({ dirs: ["examples"] })) {
    const res = resolvePlan(readFileSync(f, "utf8"), { world: worldFor(dirname(f)) });
    const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : res.ir ? [res.ir] : [];
    for (const ir of irs) for (const e of ir.elements) if (e.kind === "room") out.push(e as RRoom);
  }
  return out;
}

describe("the room-ring seam", () => {
  const rooms = corpusRooms();

  it("reads a corpus with all three floor shapes", () => {
    expect(rooms.some((r) => r.circle)).toBe(true);
    expect(rooms.some((r) => r.poly && !r.circle)).toBe(true);
    expect(rooms.some((r) => !r.poly)).toBe(true);
  });

  it("gives the discretised ring the grid layer always read: `poly`, else the rectangle's corners", () => {
    for (const r of rooms) {
      const want = r.poly ?? rectRing({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h });
      if (r.poly) expect(roomRing(r)).toBe(r.poly);
      else expect(roomRing(r)).toEqual(want);
    }
  });

  it("closes its exact boundary, and counts its edges without building them", () => {
    for (const r of rooms) {
      const loop = roomEdges(r);
      expect(loop.length).toBe(roomCurveCount(r));
      for (const [i, e] of loop.entries()) expect(edgeStart(loop[(i + 1) % loop.length]!)).toEqual(edgeEnd(e));
      if (r.circle)
        expect(loop).toEqual([{ t: "arc", arc: expect.objectContaining({ center: r.circle.c, r: r.circle.r }) }]);
      else expect(loop.every((e) => e.t === "line")).toBe(true);
    }
  });

  it("measures the boundary's closed-form area as `roomAreaMm2` does: exactly for a ring, πR² for a circle", () => {
    for (const r of rooms) {
      const exact = Math.abs(loopArea(roomEdges(r)));
      if (r.circle) expect(Math.abs(exact - roomAreaMm2(r))).toBeLessThanOrEqual(1e-9 * roomAreaMm2(r));
      else expect(exact).toBe(roomAreaMm2(r));
    }
  });

  it("bounds every vertex of the ring, and a circle by its centre and radius", () => {
    for (const r of rooms) {
      const e = roomExtent(r);
      for (const p of roomRing(r)) {
        expect(p.x).toBeGreaterThanOrEqual(e.minX - 1e-9);
        expect(p.x).toBeLessThanOrEqual(e.maxX + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(e.minY - 1e-9);
        expect(p.y).toBeLessThanOrEqual(e.maxY + 1e-9);
      }
      if (r.circle)
        expect(e).toEqual({
          minX: r.circle.c.x - r.circle.r,
          minY: r.circle.c.y - r.circle.r,
          maxX: r.circle.c.x + r.circle.r,
          maxY: r.circle.c.y + r.circle.r,
        });
    }
  });

  it("shows a reader no corner of a circle, and every corner of a ring", () => {
    for (const r of rooms) expect(roomCorners(r)).toEqual(r.circle ? [] : roomRing(r));
  });
});
