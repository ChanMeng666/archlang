/**
 * **The wall-face probe is one helper, and it probes along the TANGENT.**
 *
 * "Which side of this wall has floor?" is answered by probing one wall thickness off each
 * face and asking which probe lands on a room — the shape's answer, never a bounding box's.
 * The probe used to be written out inline in five places, and they disagreed: three took
 * the normal of the TANGENT at the opening (`segmentDirAt`), two — `door.ts`'s
 * `swing into <polygon|circle room>` and the garage `roomSideOf` — took the normal of the
 * CHORD `b − a`. On a straight run the two are the same vector, bit for bit. On an arc
 * they are not, and on a MAJOR arc (sweep > 180°) near either end they point to opposite
 * faces, so `swing into drum` chose `out` and `doorSwing` — which sweeps along the
 * tangent's normal — drew the leaf outside the room it was told to open into.
 *
 * Three claims, each against an oracle that is the pre-migration arithmetic copied
 * verbatim (never re-derived):
 *  1. on a straight segment `wallFaceProbes` equals the old chord probe exactly;
 *  2. on a major-arc host, the side `swing into` chooses is the side the leaf is drawn on;
 *  3. the three call sites that already used the tangent (`site.ts` `windowFacingPage`,
 *     `analyze.ts` `doorFacesBalcony`, `facade.ts` `unchainedOpenings`) compute what they
 *     computed before, bit for bit. The corpus-level half of that claim is the examples'
 *     byte-identity pin (`test/byte-identity-baseline.ts`), which every example reaching
 *     these sites is in.
 */

import { describe as suite, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { type RoomBox, pointInRoomBox, resolvePlan } from "../src/analyze.js";
import { doorSwing, normal, segmentDirAt, sub, unit, type WallSegment, wallFaceProbes } from "../src/geometry.js";
import { pointInPolygon } from "../src/geometry/polygon.js";
import type { RDoor, RRoom, RWindow } from "../src/ir.js";
import { windowFacingPage } from "../src/site.js";

/** A small deterministic PRNG (mulberry32), so a failure reproduces from its seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random straight segments with awkward floats (any angle, fractional mm), plus the
 *  axis-aligned and degenerate cases, each with a point on it and a thickness. */
function straightCases(seed: number, n: number): { seg: WallSegment; at: Point }[] {
  const r = rng(seed);
  const coord = () => (r() - 0.5) * 40000 + (r() < 0.5 ? r() : 0);
  const out: { seg: WallSegment; at: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const a = { x: coord(), y: coord() };
    const kind = i % 4;
    const b = kind === 0 ? { x: a.x, y: coord() } : kind === 1 ? { x: coord(), y: a.y } : { x: coord(), y: coord() };
    const t = r();
    const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const thickness = [0, 0.5, 100, 200, 300.7, r() * 1200][i % 6]!;
    out.push({ seg: { a, b, thickness, category: "partition", wallId: "w", index: 0 }, at });
  }
  // A zero-length segment: `unit` of the zero vector is (0,0) on both paths.
  out.push({
    seg: { a: { x: 5, y: 5 }, b: { x: 5, y: 5 }, thickness: 200, category: "p", wallId: "w", index: 0 },
    at: { x: 5, y: 5 },
  });
  return out;
}

/** Bit-for-bit point equality (`Object.is` keeps `-0` ≠ `0` and would see a NaN). */
function expectSamePoint(got: Point, want: Point): void {
  expect(
    Object.is(got.x, want.x) && Object.is(got.y, want.y),
    `${JSON.stringify(got)} vs ${JSON.stringify(want)}`,
  ).toBe(true);
}

suite("wallFaceProbes on a straight segment is the old chord probe, bit for bit", () => {
  const cases = straightCases(0x5eed, 600);

  it("the normal is the chord normal `door.ts` used", () => {
    for (const { seg, at } of cases) {
      const chord = normal(unit(sub(seg.b, seg.a)));
      expectSamePoint(wallFaceProbes(seg, at, 1).n, chord);
    }
  });

  it("`swingInto`'s ring path: at ± n·d with d = max(thickness, 1)", () => {
    for (const { seg, at } of cases) {
      // Verbatim from the pre-migration `swingInto`.
      const n = normal(unit(sub(seg.b, seg.a)));
      const d = Math.max(seg.thickness, 1);
      const { plus, minus } = wallFaceProbes(seg, at, d);
      expectSamePoint(plus, { x: at.x + n.x * d, y: at.y + n.y * d });
      expectSamePoint(minus, { x: at.x - n.x * d, y: at.y - n.y * d });
    }
  });

  it("`roomSideOf`'s signed form: at + sign·n·d for sign ±1", () => {
    for (const { seg, at } of cases) {
      // Verbatim from the pre-migration `roomSideOf`.
      const n = normal(unit(sub(seg.b, seg.a)));
      const d = Math.max(seg.thickness, 1);
      const probe = (sign: 1 | -1): Point => ({ x: at.x + sign * n.x * d, y: at.y + sign * n.y * d });
      const { plus, minus } = wallFaceProbes(seg, at, d);
      expectSamePoint(plus, probe(1));
      expectSamePoint(minus, probe(-1));
    }
  });
});

suite("the three tangent call sites compute what they computed before", () => {
  const cases = straightCases(0xfacade, 600);

  it("`doorFacesBalcony` (analyze.ts): d = max(thickness, 1)", () => {
    for (const { seg, at } of cases) {
      // Verbatim from the pre-migration `doorFacesBalcony`.
      const n = normal(segmentDirAt(seg, at));
      const dist = Math.max(seg.thickness, 1);
      const plus: Point = { x: at.x + n.x * dist, y: at.y + n.y * dist };
      const minus: Point = { x: at.x - n.x * dist, y: at.y - n.y * dist };
      const got = wallFaceProbes(seg, at, Math.max(seg.thickness, 1));
      expectSamePoint(got.plus, plus);
      expectSamePoint(got.minus, minus);
    }
  });

  it("`unchainedOpenings` (facade.ts): d = the bare thickness, zero included", () => {
    for (const { seg, at } of cases) {
      // Verbatim from the pre-migration `unchainedOpenings`.
      const n = normal(segmentDirAt(seg, at));
      const clear = seg.thickness;
      const sideA = { x: at.x + n.x * clear, y: at.y + n.y * clear };
      const sideB = { x: at.x - n.x * clear, y: at.y - n.y * clear };
      const got = wallFaceProbes(seg, at, seg.thickness);
      expectSamePoint(got.plus, sideA);
      expectSamePoint(got.minus, sideB);
    }
  });

  it("`windowFacingPage` (site.ts): the whole function against its pre-migration body", () => {
    // The pre-migration function, verbatim except for its name. A polygon host room and
    // the room-less case both fall through to the probe, which is what this exercises.
    function before(
      at: Point,
      room: RoomBox | null,
      host: RWindow["host"],
      planCenter: Point,
      rooms: ReadonlyMap<string, RoomBox>,
    ): string {
      const roomRect = room && !room.poly ? room : null;
      if (roomRect) {
        const dTop = Math.abs(at.y - roomRect.y);
        const dBottom = Math.abs(at.y - (roomRect.y + roomRect.h));
        const dLeft = Math.abs(at.x - roomRect.x);
        const dRight = Math.abs(at.x - (roomRect.x + roomRect.w));
        if (Math.min(dTop, dBottom) <= Math.min(dLeft, dRight)) return dTop <= dBottom ? "N" : "S";
        return dLeft <= dRight ? "W" : "E";
      }
      if (host) {
        const n = normal(segmentDirAt(host, at));
        const d = Math.max(host.thickness, 1);
        const anyRoomAt = (p: Point): boolean => [...rooms.values()].some((b) => pointInRoomBox(p, b));
        const onPlus = anyRoomAt({ x: at.x + n.x * d, y: at.y + n.y * d });
        const onMinus = anyRoomAt({ x: at.x - n.x * d, y: at.y - n.y * d });
        if (onPlus !== onMinus) {
          const s = onPlus ? -1 : 1;
          const ox = s * n.x;
          const oy = s * n.y;
          return Math.abs(oy) >= Math.abs(ox) ? (oy < 0 ? "N" : "S") : ox < 0 ? "W" : "E";
        }
      }
      const horizontal = host
        ? Math.abs(host.a.y - host.b.y) <= Math.abs(host.a.x - host.b.x)
        : Math.abs(at.y - planCenter.y) >= Math.abs(at.x - planCenter.x);
      if (horizontal) return at.y <= planCenter.y ? "N" : "S";
      return at.x <= planCenter.x ? "W" : "E";
    }

    const r = rng(0x517e);
    let probed = 0;
    for (const { seg, at } of cases) {
      // A room on one side of the wall only, as a polygon (so it falls through to the probe),
      // and a rectangle elsewhere so the rooms map is never trivially a single entry.
      const n = normal(unit(sub(seg.b, seg.a)));
      const side = r() < 0.5 ? 1 : -1;
      const reach = 400 + r() * 3000;
      const q = (u: number, v: number): Point => ({
        x: at.x + (seg.b.x - seg.a.x) * u + side * n.x * v,
        y: at.y + (seg.b.y - seg.a.y) * u + side * n.y * v,
      });
      const poly = [q(-0.5, 0.5), q(0.5, 0.5), q(0.5, reach), q(-0.5, reach)];
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      const box: RoomBox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        poly,
      };
      const rooms = new Map<string, RoomBox>([
        ["p", box],
        ["r", { x: at.x + 90000, y: at.y + 90000, w: 1000, h: 1000 }],
      ]);
      const centre = { x: at.x + (r() - 0.5) * 8000, y: at.y + (r() - 0.5) * 8000 };
      for (const room of [box, null]) {
        const want = before(at, room, seg, centre, rooms);
        expect(windowFacingPage(at, room, seg, centre, rooms)).toBe(want);
        const { plus, minus } = wallFaceProbes(seg, at, Math.max(seg.thickness, 1));
        if (pointInRoomBox(plus, box) !== pointInRoomBox(minus, box)) probed++;
      }
    }
    // The probe itself decided a real share of the cases (not only the fallback).
    expect(probed).toBeGreaterThan(cases.length / 2);
  });
});

/**
 * A circular room whose wall is a MAJOR arc (sweep ≈ 286°) through two chord ends below
 * its centre. At 10% and 90% of the run the tangent is ~114° off the chord, so the chord's
 * normal points at the OTHER face; at 50% the tangent is parallel to the chord (control).
 */
function drumPlan(turn: "cw" | "ccw", cy: number, at: string): string {
  return `plan "t" {
  room id=drum circle at (10000,${cy}) radius 5000
  wall id=w partition thickness 200 { (7000,14000) arc (13000,14000) radius 5000 ${turn} major }
  door id=d on w at ${at} width 900 swing into drum
}`;
}

suite("a door on a major arc swings into the room it names — the side its leaf is drawn on", () => {
  const cases = [
    // `cw` turns the long way round ABOVE the chord (centre (10000,10000)); `ccw` below it.
    { turn: "cw" as const, cy: 10000 },
    { turn: "ccw" as const, cy: 18000 },
  ];
  for (const { turn, cy } of cases) {
    for (const at of ["10%", "90%", "50%"]) {
      it(`${turn} major arc, door at ${at}`, () => {
        const res = resolvePlan(drumPlan(turn, cy, at));
        expect(res.diagnostics.map((d) => d.code)).toEqual([]);
        const els = res.ir!.elements;
        const door = els.find((e): e is RDoor => e.kind === "door")!;
        const drum = els.find((e): e is RRoom => e.kind === "room")!;
        const host = door.host!;
        expect(host.arc).toBeDefined();
        expect(Math.abs(host.arc!.sweep)).toBeGreaterThan(Math.PI);
        expect(host.arc!.center).toEqual({ x: 10000, y: cy });

        // The drawn leaf: `doorSwing` is what `door.render()` and `W_SWING_OBSTRUCTED` use.
        const swing = doorSwing(door)!;
        expect(pointInPolygon(swing.leafEnd.x, swing.leafEnd.y, drum.poly!)).toBe(true);

        // Witness that the case discriminates: at the ends the chord probe answers the
        // other face, so the pre-fix code chose the side the leaf is NOT drawn on.
        const d = Math.max(host.thickness, 1);
        const chord = normal(unit(sub(host.b, host.a)));
        const tangent = wallFaceProbes(host, door.at, d);
        const chordIn = pointInPolygon(door.at.x + chord.x * d, door.at.y + chord.y * d, drum.poly!);
        const tangentIn = pointInPolygon(tangent.plus.x, tangent.plus.y, drum.poly!);
        expect(door.swing).toBe(tangentIn ? "in" : "out");
        if (at === "50%") expect(chordIn).toBe(tangentIn);
        else expect(chordIn).toBe(!tangentIn);
      });
    }
  }
});
