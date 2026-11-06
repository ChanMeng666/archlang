/**
 * The storey joint (public-surfaces card X4 follow-up): a wall or column wholly under the slab of
 * the storey above stops at that slab's underside, so the two solids never overlap and never share
 * the 200 mm band of the slab's edge (where the coplanar faces fought in depth: a sliver along the
 * joint in the assembled view). Checked over the corpus: every stopped node tops out exactly at the
 * underside, is ledgered `stops-under-slab-above`, and sits on a storey with a storey above; a
 * one-storey plan, and the top storey of any plan, stops nothing.
 */
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type MeshNode } from "../src/index.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const SLAB_UM = 200 * 1000;

const topOf = (n: MeshNode): number => {
  let max = -Infinity;
  for (const s of n.shells)
    for (let i = 1; i < s.positions.length; i += 3) max = Math.max(max, s.positions[i] as number);
  return max;
};

const corpus = EXAMPLES_LIST.map(([name, src]) => {
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) return undefined;
  return { name, scene: r.scene, mesh: buildMesh(r.scene) };
}).filter((c) => c !== undefined);

describe("the storey joint", () => {
  it("stops a wall or column under the slab above at its underside, and nothing else", () => {
    let stopped = 0;
    for (const { name, scene, mesh } of corpus) {
      const levels = scene.levels.map((l) => l.level);
      const entries = mesh.assumptions.filter((a) => a.rule === "stops-under-slab-above");
      if (levels.length === 1) expect(entries, name).toEqual([]);
      for (const a of entries) {
        // The storey is in the field (`top_mm(L<n>)`): an id may stand on several storeys.
        const level = Number(/^top_mm\(L(-?\d+)\)$/.exec(a.field)?.[1]);
        const nodes = mesh.nodes.filter(
          (n) => n.kind === a.kind && n.id === a.id && n.level === level && n.part === undefined,
        );
        expect(nodes.length, `${name} ${a.kind}:${a.id} on L${level}`).toBe(1);
        const i = levels.indexOf(level);
        const above = scene.levels[i + 1];
        expect(above, `${name} ${a.id}: a storey above L${level}`).toBeDefined();
        const underside = (above?.elevation ?? 0) - SLAB_UM;
        for (const n of nodes) expect(topOf(n), `${name} ${a.kind}:${a.id}`).toBe(underside);
        expect(a.value, `${name} ${a.id}`).toBe((underside - (scene.levels[i]?.elevation ?? 0)) / 1000);
        stopped++;
      }
      // The top storey stops nothing.
      const top = levels.at(-1);
      expect(
        entries.filter((a) => a.field === `top_mm(L${top})`),
        name,
      ).toEqual([]);
    }
    expect(stopped).toBeGreaterThan(0);
  });

  it("two-storey: every storey-1 wall stops at storey 2's slab, 2500 mm up", () => {
    const c = corpus.find((x) => x.name === "two-storey.arch");
    expect(c).toBeDefined();
    const walls = c?.mesh.nodes.filter((n) => n.kind === "wall" && n.level === 1) ?? [];
    expect(walls.map((n) => n.id).sort()).toEqual(["hall_w", "kitchen_w", "shell"]);
    for (const n of walls) expect(topOf(n), n.id).toBe(2_500_000);
  });
});
