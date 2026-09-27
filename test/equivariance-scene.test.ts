/**
 * Tier T3 of the D4 ⋉ Z² equivariance oracle: the DRAWING.
 *
 * Per element id (annotate mode stamps one on every node an element renders), gP's
 * primitive multiset must equal g · P₀'s — every polygon, line, region, curved path, arc
 * and circle carried through the frame, compared orientation-free at a 1e-6 mm quantum
 * (`test/d4-oracle.ts`: `canonPrim`). The wall fabric, unioned across statements, is one
 * group. Both sides are drawn on one fixed sheet so every render size is a constant and a
 * violation names the element that caused it. Violations are held to
 * `test/equivariance-known.ts` in both directions, exactly as T0–T2 are.
 */

import { describe, expect, it } from "vitest";
import {
  astOf,
  canonPrim,
  compareScenes,
  ELIGIBLE_EXAMPLES,
  elementNamed,
  explain,
  frameFor,
  type Observed,
  pinDiff,
  runScenes,
  sceneOf,
  toObserved,
  transformPrim,
  wrapperSource,
} from "./d4-oracle.js";
import { KNOWN } from "./equivariance-known.js";

const SLOW = 120_000;

describe("T3 — the drawn scene, under the group", () => {
  it("the comparison can FAIL: r270 observed against r90's prediction is caught", () => {
    const rel = "studio.arch";
    const s0 = sceneOf(wrapperSource(rel, null, { fixedSheet: true }));
    const s270 = sceneOf(wrapperSource(rel, elementNamed("r270"), { fixedSheet: true }));
    const vs = compareScenes(s0, s270, frameFor(elementNamed("r90"), astOf(rel).grid));
    expect(vs.map((v) => v.path)).toContain("scene.walls");
    expect(vs.map((v) => v.path)).toContain("scene.room[]");
  });

  it("the canonical form forgets only orientation: a ring re-started or re-wound compares equal", () => {
    const a = { t: "polygon" as const, pts: [0, 1, 2, 3].map((i) => ({ x: [0, 4, 4, 0][i]!, y: [0, 0, 3, 3][i]! })) };
    const b = { t: "polygon" as const, pts: [...a.pts.slice(2), ...a.pts.slice(0, 2)].reverse() };
    const c = { t: "polygon" as const, pts: a.pts.map((p) => ({ x: p.x + 1, y: p.y })) };
    expect(canonPrim(b)).toBe(canonPrim(a));
    expect(canonPrim(c)).not.toBe(canonPrim(a));
    const r90 = frameFor(elementNamed("r90"), 0);
    expect(canonPrim(transformPrim(r90, a))).not.toBe(canonPrim(a));
  });

  it.each(ELIGIBLE_EXAMPLES)(
    "%s",
    (rel) => {
      const runs = runScenes(rel);
      if (runs === null) {
        const pinned = KNOWN.some((k) => k.where === rel && k.g === "T0" && k.path === "ok");
        expect(pinned, `${rel}: P₀ does not compile and T0 does not pin it`).toBe(true);
        return;
      }
      const observed: Observed[] = runs.flatMap((r) => toObserved(rel, r.tag, r.vs));
      const { added, vanished } = pinDiff(KNOWN, observed, (o) => o.where === rel && o.path.startsWith("scene."));
      const detail = added
        .map((k) => {
          const [, tag, path] = k.split(" | ");
          return `${k}\n${explain(runs.find((r) => r.tag === tag)?.vs.filter((v) => v.path === path) ?? [], 2)}`;
        })
        .join("\n");
      expect(
        added,
        `NEW equivariance violation — pin it in test/equivariance-known.ts with a class, a witness and a why:\n${detail}`,
      ).toEqual([]);
      expect(vanished, `FIXED: delete the pin and its witness:\n${vanished.join("\n")}`).toEqual([]);
    },
    SLOW,
  );
});
