/**
 * Tier T3 of the D4 ⋉ Z² equivariance oracle: the DRAWING.
 *
 * Per element id (annotate mode stamps one on every node an element renders), gP's
 * primitive multiset must equal g · P₀'s — every polygon, line, region, curved path, arc
 * and circle carried through the frame, compared orientation-free at a 1e-6 mm quantum
 * (`test/d4-oracle.ts`: `canonPrim`). The wall fabric, unioned across statements, is one
 * group; a hand-written dimension is three (`.line`, `.ticks`, `.text`), because under a
 * reflection its tick hand is a declared convention and its text side a defect, and one
 * pin must not absorb the other. Both sides are drawn on one fixed sheet so every render
 * size is a constant and a violation names the element that caused it. Violations are held
 * to `test/equivariance-known.ts` in both directions, and audited against their class, as
 * T0–T2 are.
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
  idOfKey,
  pinAudit,
  pinDiff,
  runScenes,
  sceneOf,
  toObserved,
  transformPrim,
  wrapperSource,
} from "./d4-oracle.js";
import { KNOWN, KNOWN_CLASSES } from "./equivariance-known.js";
import type { PathEdge } from "../src/scene.js";
import { fixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { mapSceneNode } from "../src/elements/glyph-lib.js";
import { tp } from "../src/frame.js";
import { DEFAULT_THEME } from "../src/theme.js";

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

  it("the canonical form forgets how an arc is CUT — at the angle-0 seam too", () => {
    // One outline, three spellings: a semicircle bulging to +x closed by its chord, drawn whole,
    // cut exactly on the +x axis (angle 0 — where a curved glyph's apex or vertex split lands
    // once the symbol is turned), and cut a hair below it. A canonical form that kept the piece
    // starting at 0 beside the merged run reported the same ink two ways.
    const r = 50;
    const C = { x: 0, y: 0 };
    const top = { x: 0, y: -r };
    const bottom = { x: 0, y: r };
    const arcTo = (to: { x: number; y: number }) => ({ t: "arc" as const, to, center: C, r, sweep: 1 as const });
    const loop = (edges: PathEdge[]) => ({ t: "path" as const, loops: [{ start: top, edges }] });
    const close = { t: "line" as const, to: top };
    const whole = loop([arcTo(bottom), close]);
    const cut0 = loop([arcTo({ x: r, y: 0 }), arcTo(bottom), close]);
    const e = 1e-13;
    const cutBelow = loop([arcTo({ x: r * Math.cos(-e), y: r * Math.sin(-e) }), arcTo(bottom), close]);
    expect(canonPrim(cut0)).toBe(canonPrim(whole));
    expect(canonPrim(cutBelow)).toBe(canonPrim(whole));
    // …and it still sees how much arc there is: the first quarter alone is a different outline.
    const quarter = loop([arcTo({ x: r, y: 0 }), close]);
    expect(canonPrim(quarter)).not.toBe(canonPrim(cut0));
  });

  it("the canonical form reads an arc's SWEEP: the same two endpoints bound two different semicircles", () => {
    // Two endpoints and a centre bound two arcs; for an exact semicircle (a tree lobe, a
    // scallop, a pill's end) they are the same size, so only the sweep flag says which side is
    // drawn. A form built from endpoints alone called the +x and the −x semicircle the same.
    const r = 50;
    const C = { x: 0, y: 0 };
    const top = { x: 0, y: -r };
    const bottom = { x: 0, y: r };
    const close = { t: "line" as const, to: top };
    const semi = (sweep: 0 | 1) => ({
      t: "path" as const,
      loops: [{ start: top, edges: [{ t: "arc" as const, to: bottom, center: C, r, sweep }, close] }],
    });
    expect(canonPrim(semi(1))).not.toBe(canonPrim(semi(0)));
    const arcPrim = (sweep: 0 | 1) => ({ t: "arc" as const, center: C, r, start: top, end: bottom, sweep });
    expect(canonPrim(arcPrim(1))).not.toBe(canonPrim(arcPrim(0)));
    // A reflection carries one onto the other — the prediction flips the sweep with the points.
    const mx = frameFor(elementNamed("mx"), 0);
    expect(canonPrim(transformPrim(mx, semi(1)))).not.toBe(canonPrim(semi(1)));
    expect(canonPrim(transformPrim(mx, transformPrim(mx, semi(1))))).toBe(canonPrim(semi(1)));
  });

  it("a mirrored tree canopy matches the prediction, and one flipped lobe is a violation", () => {
    // The tree's even lobes are exact semicircles — the case only the sweep can tell apart.
    const tree = fixtureGlyph(
      "tree",
      { x: 100, y: 200, w: 2400, h: 2400 },
      DEFAULT_THEME,
      sceneOf(`plan "S" { units mm room id=r at (0,0) size 3000x3000 }`).sizes,
    )!;
    const canopy = tree[0]!;
    if (canopy.prim.t !== "path") throw new Error("the canopy is a path");
    for (const name of ["mx", "r90mx", "r90"]) {
      const f = frameFor(elementNamed(name), 0);
      const reflects = name.endsWith("mx");
      // What the renderer draws: the glyph's own traversal, sweep flipped under a reflection.
      const drawn = mapSceneNode(canopy, (q) => tp(f, q), reflects).prim;
      expect(canonPrim(drawn), name).toBe(canonPrim(transformPrim(f, canopy.prim)));
      if (drawn.t !== "path") throw new Error("still a path");
      const lp = drawn.loops[0]!;
      const i = lp.edges.findIndex((e) => e.t === "arc");
      const flipped = {
        ...drawn,
        loops: [
          {
            ...lp,
            edges: lp.edges.map((e, k) =>
              k === i && e.t === "arc" ? { ...e, sweep: e.sweep === 0 ? (1 as const) : (0 as const) } : e,
            ),
          },
        ],
      };
      expect(canonPrim(flipped), `${name}: a flipped lobe must not compare equal`).not.toBe(
        canonPrim(transformPrim(f, canopy.prim)),
      );
    }
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
      const observed = runs.flatMap((r) => toObserved(rel, r.tag, r.vs));
      const inScope = (o: { where: string; path: string }) => o.where === rel && o.path.startsWith("scene.");
      const { added, vanished } = pinDiff(KNOWN, observed, inScope);
      const detail = added
        .map((k) => {
          const [, tag, path, idAndDelta = ""] = k.split(" | ");
          const id = idAndDelta.split("  ")[0];
          return `${k}\n${explain(runs.find((r) => r.tag === tag)?.vs.filter((v) => v.path === path && idOfKey(v.key) === id) ?? [], 2)}`;
        })
        .join("\n");
      expect(
        added,
        `NEW equivariance violation — pin it in test/equivariance-known.ts with a class, a witness and a why:\n${detail}`,
      ).toEqual([]);
      expect(vanished, `FIXED: delete the pin and its witness:\n${vanished.join("\n")}`).toEqual([]);
      expect(pinAudit(KNOWN, KNOWN_CLASSES, rel, runs), "a pin whose class does not account for it").toEqual([]);
    },
    SLOW,
  );
});
