/**
 * The roof mitre now calls `meetLines` (src/geometry/intersect.ts). The OLD private
 * `meet` of `elements/roof.ts` is kept here verbatim as an oracle: for every pair of
 * offset faces the two must agree EXACTLY, except where `meetLines`' exact
 * vertical x horizontal shortcut fires — there the shortcut is the exact answer and the
 * old Cramer solve may differ by an ulp.
 */

import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { meetLines } from "../src/geometry/intersect.js";
import { offsetRingOutward } from "../src/elements/roof.js";

interface OffsetLine {
  p: Point;
  dx: number;
  dy: number;
}

const PARALLEL_SIN = 1e-12;

/** The pre-dedup `meet`, verbatim. */
function oldMeet(a: OffsetLine, b: OffsetLine): Point {
  const la = Math.hypot(a.dx, a.dy);
  const lb = Math.hypot(b.dx, b.dy);
  const cross = a.dx * b.dy - a.dy * b.dx;
  if (la === 0 || lb === 0 || Math.abs(cross) / (la * lb) < PARALLEL_SIN) return { ...b.p };
  const a1 = a.dy;
  const b1 = -a.dx;
  const c1 = a.dy * a.p.x - a.dx * a.p.y;
  const a2 = b.dy;
  const b2 = -b.dx;
  const c2 = b.dy * b.p.x - b.dx * b.p.y;
  const det = a1 * b2 - a2 * b1;
  return { x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det };
}

const newMeet = (a: OffsetLine, b: OffsetLine): Point =>
  meetLines(a.p, { x: a.dx, y: a.dy }, b.p, { x: b.dx, y: b.dy }) ?? { ...b.p };

/** Same line construction as `offsetRingOutward`. */
function facesOf(pts: readonly Point[], d: number): OffsetLine[] {
  let s2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s2 += a.x * b.y - b.x * a.y;
  }
  const sign = s2 > 0 ? 1 : -1;
  const lines: OffsetLine[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    lines.push({ p: { x: a.x + ((sign * dy) / len) * d, y: a.y + ((-sign * dx) / len) * d }, dx, dy });
  }
  return lines;
}

/** Deterministic PRNG (mulberry32). */
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

function rings(): Point[][] {
  const r = rng(20261001);
  const out: Point[][] = [
    // axis-aligned rectangle and an L, the shapes that matter most
    [
      { x: 0, y: 0 },
      { x: 11400, y: 0 },
      { x: 11400, y: 7000 },
      { x: 0, y: 7000 },
    ],
    [
      { x: 0, y: 0 },
      { x: 9000, y: 0 },
      { x: 9000, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 8000 },
      { x: 0, y: 8000 },
    ],
    // oblique parallelogram
    [
      { x: 0, y: 0 },
      { x: 6000, y: 1000 },
      { x: 7000, y: 5000 },
      { x: 1000, y: 4000 },
    ],
    // nearly-parallel neighbours (sine ~ 1e-11 and ~ 1e-13) and a doubled-back ring
    [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 10000, y: 5e-8 },
      { x: 10000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 10000, y: 5e-10 },
      { x: 10000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 3000 },
    ],
  ];
  for (let k = 0; k < 400; k++) {
    const n = 3 + Math.floor(r() * 6);
    const mode = k % 3;
    const ring: Point[] = [];
    if (mode === 0) {
      // rectilinear staircase-ish ring on a 100 mm grid
      let x = 0;
      let y = 0;
      for (let i = 0; i < n; i++) {
        ring.push({ x, y });
        if (i % 2 === 0) x += (1 + Math.floor(r() * 80)) * 100 * (r() < 0.8 ? 1 : -1);
        else y += (1 + Math.floor(r() * 80)) * 100 * (r() < 0.8 ? 1 : -1);
      }
    } else if (mode === 1) {
      for (let i = 0; i < n; i++) ring.push({ x: Math.round(r() * 20000) / 7, y: Math.round(r() * 20000) / 7 });
    } else {
      for (let i = 0; i < n; i++) ring.push({ x: r() * 20000, y: r() * 20000 });
    }
    out.push(ring);
  }
  return out;
}

describe("roof mitre: meetLines reproduces the retired private meet", () => {
  it("is exact for every adjacent face pair, except an ulp where the rectilinear shortcut fires", () => {
    const diffs: string[] = [];
    let pairs = 0;
    for (const ring of rings()) {
      for (const d of [0, 600, 1234.5]) {
        const lines = facesOf(ring, d);
        for (let i = 0; i < lines.length; i++) {
          const a = lines[(i - 1 + lines.length) % lines.length]!;
          const b = lines[i]!;
          pairs++;
          const o = oldMeet(a, b);
          const n = newMeet(a, b);
          if (Object.is(o.x, n.x) && Object.is(o.y, n.y)) continue;
          // equal up to -0 / +0 is also identical for rendering; anything else must be the shortcut
          const vh =
            (a.dx === 0 && a.dy !== 0 && b.dy === 0 && b.dx !== 0) ||
            (a.dy === 0 && a.dx !== 0 && b.dx === 0 && b.dy !== 0);
          diffs.push(`${vh ? "VxH" : "OTHER"} d=${d} old=(${o.x},${o.y}) new=(${n.x},${n.y})`);
          expect(vh, diffs[diffs.length - 1]).toBe(true);
          // the shortcut is exact; the old solve is within an ulp-scale of it
          const scale = Math.max(1, Math.abs(n.x), Math.abs(n.y));
          expect(Math.abs(o.x - n.x) / scale).toBeLessThan(1e-12);
          expect(Math.abs(o.y - n.y) / scale).toBeLessThan(1e-12);
        }
      }
    }
    expect(pairs).toBeGreaterThan(1000);
    if (process.env.ROOF_MEET_VERBOSE)
      console.log(`pairs=${pairs} diffs=${diffs.length}\n${diffs.slice(0, 40).join("\n")}`);
  });

  it("offsetRingOutward of a rectilinear ring has exact integer corners", () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 11400, y: 0 },
      { x: 11400, y: 7000 },
      { x: 0, y: 7000 },
    ];
    expect(offsetRingOutward(ring, 600)).toEqual([
      { x: -600, y: -600 },
      { x: 12000, y: -600 },
      { x: 12000, y: 7600 },
      { x: -600, y: 7600 },
    ]);
  });
});
