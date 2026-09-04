/**
 * **The painter's order is checked against the GEOMETRY, not against itself.**
 *
 * Every other law about this ordering compares the sort to a perturbation of its own input:
 * `iso-sort.test.ts` reverses and shuffles the face list and asserts the output does not
 * move, which proves the order is TOTAL and deterministic. It cannot prove the order is
 * *right* — a sort keyed on the wrong quantity is exactly as reproducible as one keyed on
 * the right quantity, and would pass every case in that file.
 *
 * So this one takes its expected answer from outside the sort. Depth is a property of the
 * 3D vertices, and the sort key is the depth at ONE point per face — the boundary
 * centroid. The check re-derives, for every drawn face, the **range** of true depths over
 * all of its own vertices, and then asserts the pairwise consequence:
 *
 * > if face A is drawn before face B, and the two overlap on screen, A must not be
 * > *entirely nearer* than B.
 *
 * That is the weakest claim a painter's algorithm has to satisfy and the only one it can:
 * two faces whose depth ranges interleave genuinely have no correct order without splitting
 * them, which is what the docs mean by "no hidden-line algorithm". But a face drawn behind
 * one that every one of its points is in front of is a plain wrong answer, and it is what a
 * centroid key produces when a face is large, slanted, or — the case that motivated this —
 * when one `Face` carries several DISJOINT pieces and the key reads only the first
 * (`paint.ts`'s `boundaryDepth` takes `loops[0]`; a wall ring cut by two openings really
 * does come back as two separate solid loops on one cap face).
 *
 * ## Screen overlap is over-approximated on purpose
 *
 * Two faces "overlap" here if their projected bounding boxes do, which is looser than a real
 * polygon intersection. That makes the test STRICTER than the visual truth — it will
 * complain about a pair that never actually covers each other — which is the safe direction
 * for a gate whose job is to catch a wrong answer.
 *
 * ## Non-vacuity is proved, not asserted
 *
 * A pairwise "no violations" result is worthless without evidence the detector can fire, and
 * the shipped corpus produces **zero** violations. So the last case runs the identical
 * detector over the REVERSED draw order and requires thousands — measured at 10,761 across
 * the corpus in both presets. If a refactor made the check vacuous, that number collapses
 * and this file goes red before the silent one does.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";
import { cameraFor } from "../src/view/camera.js";
import type { Camera, ViewName } from "../src/view/camera.js";
import { facesOf } from "../src/view/extrude.js";
import { orderFaces } from "../src/view/paint.js";

const EXAMPLES = resolvePath("examples");

/** A World over the examples directory, so the two plans that `import` are covered too. */
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};

const EXAMPLE_NAMES = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .sort();

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One drawn face reduced to what the pairwise rule needs: where it lands, and how deep it
 *  really is at its own extremes — never the single point the sort keyed on. */
interface Probe {
  box: Box;
  minDepth: number;
  maxDepth: number;
  name: string;
}

function boxOf(loops: readonly (readonly { x: number; y: number }[])[]): Box {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const l of loops) {
    for (const p of l) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  }
  return { x0, y0, x1, y1 };
}

/** A 1 mm slack so two faces that merely SHARE an edge — every adjacent quad in the model
 *  does — are not treated as covering each other. */
const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;

function probesFor(src: string, view: ViewName, reversed: boolean): Probe[] {
  const parsed = parse(src);
  const r = resolveAll(parsed.plan!, BUILTIN_REGISTRY, world);
  const plans = r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir];
  const cam: Camera = cameraFor(view);
  const ordered = orderFaces(facesOf(plans.map((ir, index) => ({ ir, index }))), cam);
  const drawn = reversed ? [...ordered].reverse() : ordered;
  return drawn.map((d) => {
    const depths = d.face.loops.flat().map((p) => cam.depth(p.x, p.y, p.z));
    return {
      box: boxOf(d.loops),
      minDepth: Math.min(...depths),
      maxDepth: Math.max(...depths),
      name: `${d.face.elementId}#${d.face.loopIndex}.${d.face.faceIndex}`,
    };
  });
}

/** Every pair drawn in an order the depths contradict. `a` comes first, so `a` is claimed
 *  to be the FARTHER of the two; a violation is `a` being entirely nearer. */
function violations(probes: readonly Probe[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < probes.length; i++) {
    const a = probes[i]!;
    for (let j = i + 1; j < probes.length; j++) {
      const b = probes[j]!;
      if (a.maxDepth < b.minDepth && overlap(a.box, b.box)) out.push(`${a.name} drawn before ${b.name}`);
    }
  }
  return out;
}

const VIEWS: readonly ViewName[] = ["iso", "axon"];

suite("iso painter order — measured against the geometry, not against the sort", () => {
  it("has a corpus to run over", () => {
    expect(EXAMPLE_NAMES.length).toBeGreaterThanOrEqual(30);
  });

  for (const view of VIEWS) {
    it(`${view}: no shipped example draws a face in front of one it is entirely behind`, () => {
      const found: string[] = [];
      for (const f of EXAMPLE_NAMES) {
        const bad = violations(probesFor(readFileSync(join(EXAMPLES, f), "utf8"), view, false));
        if (bad.length > 0) found.push(`${f}: ${bad.length} — first: ${bad[0]}`);
      }
      expect(found).toEqual([]);
    });
  }

  it("the detector FIRES on a wrong order — 0 violations is a result, not a vacuous pass", () => {
    // The identical check over the reversed draw order. Nothing else changes: same faces,
    // same camera, same overlap rule — only the claim about which is farther.
    let total = 0;
    for (const view of VIEWS) {
      for (const f of EXAMPLE_NAMES) {
        total += violations(probesFor(readFileSync(join(EXAMPLES, f), "utf8"), view, true)).length;
      }
    }
    expect(total).toBeGreaterThan(1000);
  });
});
