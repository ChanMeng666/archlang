/**
 * The storey joint (public-surfaces card X4 follow-up): a wall or column wholly under the slab of
 * the storey above stops at that slab's underside, so the two solids never overlap and never share
 * the 200 mm band of the slab's edge (where the coplanar faces fought in depth: a sliver along the
 * joint in the assembled view). Checked over the corpus: every stopped node tops out exactly at the
 * underside, is ledgered `stops-under-slab-above`, and sits on a storey with a storey above; a
 * one-storey plan, and the top storey of any plan, stops nothing; an opening whose head is past the
 * underside is cut there (`head-at-slab-above`). Two synthetic plans hold the containment: a wall
 * across a notch of the storey above, or under its void, keeps its height.
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

  it("cuts an opening of a stopped wall at the underside when its head reaches past it (the slab is its lintel)", () => {
    let cut = 0;
    for (const { name, scene, mesh } of corpus) {
      for (const a of mesh.assumptions.filter((x) => x.rule === "head-at-slab-above")) {
        const level = Number(/^head_mm\(L(-?\d+)\)$/.exec(a.field)?.[1]);
        const lv = scene.levels.find((l) => l.level === level);
        const o = lv?.openings.find((x) => x.id === a.id);
        expect(o, `${name} ${a.id}`).toBeDefined();
        // Its host is stopped, and the opening's head was past the underside the entry names.
        const host = mesh.assumptions.find(
          (x) => x.rule === "stops-under-slab-above" && x.id === o?.host && x.field === `top_mm(L${level})`,
        );
        expect(host?.value, `${name} ${a.id}'s host ${o?.host}`).toBe(a.value);
        expect((o?.head ?? 0) / 1000, `${name} ${a.id}`).toBeGreaterThan(a.value as number);
        cut++;
      }
    }
    expect(cut).toBeGreaterThan(0);
  });

  it("two-storey: every storey-1 wall stops at storey 2's slab, 2500 mm up", () => {
    const c = corpus.find((x) => x.name === "two-storey.arch");
    expect(c).toBeDefined();
    const walls = c?.mesh.nodes.filter((n) => n.kind === "wall" && n.level === 1) ?? [];
    expect(walls.map((n) => n.id).sort()).toEqual(["hall_w", "kitchen_w", "shell"]);
    for (const n of walls) expect(topOf(n), n.id).toBe(2_500_000);
  });

  it("turning-stair: both storey-1 walls stop at storey 2's slab, 2550 mm up", () => {
    const c = corpus.find((x) => x.name === "turning-stair.arch");
    const stops = c?.mesh.assumptions.filter((a) => a.rule === "stops-under-slab-above") ?? [];
    expect(stops.map((a) => `${a.kind}:${a.id}@${a.field}=${a.value}`)).toEqual([
      "wall:exterior@top_mm(L1)=2550",
      "wall:hall|living@top_mm(L1)=2550",
    ]);
  });

  // The whole footprint must lie under slab, never just its corners (review of PR #519, M1): each
  // plan has a control wall wholly under slab (`under`, stopped) and one whose ends are under slab
  // but whose middle is not (`across`, kept at its height). A corner test stopped both.
  const built = (src: string) => {
    const r = adaptPlan(src, {});
    if (!r.ok) throw new Error(r.refusal.message);
    const mesh = buildMesh(r.scene);
    const top = (id: string): number => {
      const n = mesh.nodes.find((x) => x.level === 1 && x.kind === "wall" && x.id === id);
      return n ? topOf(n) : Number.NaN;
    };
    return { mesh, top };
  };
  const ground = (extra: string, across: string) => `
    level 1 "Ground" {
      wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
      wall id=under partition thickness 100 { (1000,1000) (7000,1000) }
      wall id=across partition thickness 100 { ${across} }
      room id=hall at (0,0) size 8000x6000 label "Hall"
      ${extra}
    }`;

  it("keeps a wall across a notch of the storey above at its height (the upper storey a U)", () => {
    const { top } = built(`plan "notch" { units mm grid 50 height 2700
      ${ground("", "(1000,5000) (7000,5000)")}
      level 2 "Upper" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (6000,6000) (6000,2000) (2000,2000) (2000,6000) (0,6000) close }
        room id=a at (0,0) size 8000x2000 label "A"
        room id=b at (0,2000) size 2000x4000 label "B"
        room id=c at (6000,2000) size 2000x4000 label "C"
      }
    }`);
    expect(top("under")).toBe(2_500_000);
    expect(top("across")).toBe(2_700_000);
    // The ground storey's shell runs under the notch along its north side: not stopped either.
    expect(top("shell")).toBe(2_700_000);
  });

  it("keeps a wall under a void of the storey above at its height, its corners outside the void", () => {
    const { mesh, top } = built(`plan "void" { units mm grid 50 height 2700
      ${ground("window id=tall on shell at 4000 width 1200 sill 300 head 2600", "(1000,3000) (7000,3000)")}
      level 2 "Upper" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
        room id=top at (0,0) size 8000x6000 label "Top"
        void id=well at (3000,2500) size 2000x1000
      }
    }`);
    expect(top("under")).toBe(2_500_000);
    expect(top("across")).toBe(2_700_000);
    // m1: the shell is wholly under slab although its window's head (2600) is past the underside
    // (2500): the wall stops there all the same, and the window with it, ledgered.
    expect(top("shell")).toBe(2_500_000);
    const win = mesh.nodes.find((n) => n.kind === "window" && n.id === "tall");
    expect(win && topOf(win)).toBe(2_500_000);
    expect(
      mesh.assumptions.filter((a) => a.rule === "head-at-slab-above").map((a) => `${a.kind}:${a.id}=${a.value}`),
    ).toEqual(["window:tall=2500"]);
  });
});
