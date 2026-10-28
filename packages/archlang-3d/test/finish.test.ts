/**
 * The mesh finish (card A2b), one block per item the card names: T0 parametric furniture (plan
 * §4.4), V-GEO-05 `W3D_FLOOR_OVERLAP` with its 0.5 mm lift, window parts kept inside their cut on a
 * curved host, wall bodies meeting their sills and lintels vertex to vertex, the slab as rooms ∪
 * wall outline less voids, and a demolished wall (B3a) drawn from `ir.drawn` as a ghost.
 */
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type Mesh3D, type MeshNode, type Pt, slab2d, T0_FAMILIES } from "../src/index.js";
import { openEdges, signedVolume } from "../src/node.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";
import { inside } from "./probe.js";

function built(source: string) {
  const r = adaptPlan(source, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  const core = r.diagnostics.map((d) => d.code);
  return { scene: r.scene, mesh: buildMesh(r.scene), warnings: r.warnings, core };
}

const example = (name: string): string => EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
const corpus = [...EXAMPLES_LIST, ...Object.entries(STRESS_PLANS)].map(([n, s]) => ({ n, ...built(s) }));

/** Plan-space (x, z) of every vertex of a node's shells, and its height range. */
const verts = (nd: MeshNode) =>
  nd.shells.flatMap((s) =>
    Array.from({ length: s.positions.length / 3 }, (_, i) => [
      s.positions[3 * i] as number,
      s.positions[3 * i + 1] as number,
      s.positions[3 * i + 2] as number,
    ]),
  );

/** Even-odd, with points ON the ring counted inside (within 1 µm, the rounding of a clip). */
function inOrOn(p: Pt, r: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i] as Pt;
    const b = r[j] as Pt;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    if (Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) <= 1) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < (dx * (p[1] - a[1])) / dy + a[0]) c = !c;
  }
  return c;
}

const plan = (body: string) =>
  `plan "t" { units mm grid 50 wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close } ${body} }`;

describe("T0 parametric furniture (plan §4.4)", () => {
  const laneway = built(example("laneway-house.arch"));
  const pieces = laneway.mesh.nodes.filter((n) => n.kind === "furniture");

  it("builds laneway-house's twelve pieces from the twelve T0 families, one node each", () => {
    expect(pieces.length).toBe(12);
    const families = new Set(pieces.map((p) => String(p.extras.asset)));
    expect([...families].sort()).toEqual(
      Object.keys(T0_FAMILIES)
        .map((f) => `t0:${f}`)
        .sort(),
    );
    for (const p of pieces) if (p.extras.category !== "rug") expect(p.shells.length, p.id).toBeGreaterThan(1);
  });

  it("keeps every T0 part inside its plan footprint and on the floor, every shell closed (corpus)", () => {
    const bad: string[] = [];
    let t0 = 0;
    for (const { n, scene, mesh } of corpus) {
      for (const lv of scene.levels) {
        for (const f of lv.furniture) {
          const nd = mesh.nodes.find((x) => x.key === `L${lv.level}/furniture:${f.id}`);
          if (!nd || !String(nd.extras.asset).startsWith("t0:")) continue;
          t0++;
          const [cx, cy] = f.centre;
          const floor = lv.elevation + 5000;
          for (const [x, y, z] of verts(nd)) {
            const off =
              Math.abs((x as number) - cx) > f.size.w / 2 ||
              Math.abs((z as number) - cy) > f.size.d / 2 ||
              (y as number) < floor;
            if (off) {
              bad.push(`${n} ${f.id}`);
              break;
            }
          }
          for (const s of nd.shells) if (openEdges(s) !== 0 || !(signedVolume(s) > 0)) bad.push(`${n} ${f.id} shell`);
        }
      }
    }
    expect(t0).toBeGreaterThan(300);
    expect(bad).toEqual([]);
  });

  /** Plan (x, y) centre of the part of `nd` that reaches highest: a wc's tank, a bed's headboard. */
  const tallest = (nd: MeshNode): [number, number] => {
    const top = Math.max(...nd.shells.map((s) => Math.max(...s.positions.filter((_, i) => i % 3 === 1))));
    const s = nd.shells.find((sh) => Math.max(...sh.positions.filter((_, i) => i % 3 === 1)) === top);
    const xs = s?.positions.filter((_, i) => i % 3 === 0) ?? [];
    const zs = s?.positions.filter((_, i) => i % 3 === 2) ?? [];
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  };
  const centre = (id: string): Pt => laneway.scene.levels[0]?.furniture.find((f) => f.id === id)?.centre ?? [0, 0];

  it("V-FUR-02: a piece's back is on its wall side (yaw = −rotate°, front +z)", () => {
    // wc_11 against the bath's bottom wall (rotate 180): its tank toward +y.
    expect(tallest(pieces.find((p) => p.id === "wc_11") as MeshNode)[1]).toBeGreaterThan(centre("wc_11")[1]);
    // bed_8 against the bedroom's right wall (rotate 90): its headboard toward +x.
    expect(tallest(pieces.find((p) => p.id === "bed_8") as MeshNode)[0]).toBeGreaterThan(centre("bed_8")[0]);
    // fridge_1 against the west wall (rotate 270): its doors (the front) toward +x, the body behind.
    const fridge = pieces.find((p) => p.id === "fridge_1") as MeshNode;
    const front = fridge.shells[1]?.positions.filter((_, i) => i % 3 === 0) ?? [];
    expect(Math.min(...front)).toBeGreaterThan(centre("fridge_1")[0]);
    // Unturned (rotate 0): the front faces plan +y, so the tank is toward −y.
    const m = built(plan('room id=r at (0,0) size 6000x4000 label "R" furniture wc at (1000,1000) size 400x700'));
    const wc = m.mesh.nodes.find((x) => x.kind === "furniture") as MeshNode;
    expect(tallest(wc)[1]).toBeLessThan(m.scene.levels[0]?.furniture[0]?.centre[1] ?? 0);
  });

  it("leaves a family without a generator a grey box", () => {
    const m = built(plan('room id=r at (0,0) size 6000x4000 label "R" furniture desk at (1000,1000) size 1200x600'));
    const desk = m.mesh.nodes.find((x) => x.kind === "furniture") as MeshNode;
    expect(desk.extras.asset).toBe("greybox");
    expect(desk.shells.length).toBe(1);
  });
});

describe("V-GEO-05: W3D_FLOOR_OVERLAP and the 0.5 mm lift (plan §4.2)", () => {
  const rooms =
    'room id=a at (0,0) size 3000x4000 label "A" room id=b at (2000,0) size 3000x4000 label "B" room id=c at (2500,1000) size 1000x1000 label "C"';

  it("reports each overlapping pair and lifts the later room one step above the highest it overlaps", () => {
    const m = built(plan(rooms));
    const w = m.warnings.filter((x) => x.code === "W3D_FLOOR_OVERLAP");
    expect(w.map((x) => (x.code === "W3D_FLOOR_OVERLAP" ? `${x.rooms.join(">")} ${x.areaMm2}` : ""))).toEqual([
      "a>b 4000000",
      "a>c 500000",
      "b>c 1000000",
    ]);
    const z0 = (id: string) =>
      Math.min(
        ...(m.mesh.nodes.find((x) => x.kind === "floor" && x.id === id)?.shells[0]?.positions ?? []).filter(
          (_, i) => i % 3 === 1,
        ),
      );
    expect([z0("a"), z0("b"), z0("c")]).toEqual([0, 500, 1000]);
    expect(m.mesh.assumptions.filter((x) => x.rule === "floor-overlap-lift").map((x) => [x.id, x.value])).toEqual([
      ["b", 0.5],
      ["c", 1],
    ]);
    // The core warns on the same plan.
    expect(m.core).toContain("W_ROOM_OVERLAP");
  });

  it("does not fire on rooms that only share an edge, nor anywhere in the corpus", () => {
    const m = built(plan('room id=a at (0,0) size 3000x4000 label "A" room id=b at (3000,0) size 3000x4000 label "B"'));
    expect(m.warnings).toEqual([]);
    expect(m.core).not.toContain("W_ROOM_OVERLAP");
    // Over the corpus and the stress plans it fires exactly where the core warns W_ROOM_OVERLAP: nowhere.
    const ours = corpus.filter((c) => c.warnings.some((w) => w.code === "W3D_FLOOR_OVERLAP")).map((c) => c.n);
    const core = corpus.filter((c) => c.core.includes("W_ROOM_OVERLAP")).map((c) => c.n);
    expect(ours).toEqual(core);
    expect(ours).toEqual([]);
  });
});

describe("window parts inside their cut (a curved host)", () => {
  it("keeps every window part's plan outline in its opening's cut, corpus and stress plans", () => {
    const bad: string[] = [];
    let parts = 0;
    for (const { n, scene, mesh } of corpus) {
      for (const lv of scene.levels) {
        for (const o of lv.openings.filter((x) => x.kind === "window")) {
          for (const nd of mesh.nodes.filter((x) => x.level === lv.level && x.kind === "window" && x.id === o.id)) {
            parts += nd.shells.length;
            if (verts(nd).some(([x, , z]) => !inOrOn([x as number, z as number], o.cut))) bad.push(`${n} ${nd.key}`);
          }
        }
      }
    }
    expect(parts).toBeGreaterThan(500);
    expect(bad).toEqual([]);
  });

  it("clips hillside-villa's window on the arc bay, whose chord pane crossed the jambs", () => {
    const { scene, mesh } = corpus.find((c) => c.n === "hillside-villa.arch") as (typeof corpus)[number];
    const lv = scene.levels[0];
    // The windows whose chord pane leaves the cut are those on a curved host.
    const crossing = (lv?.openings ?? []).filter(
      (o) => o.kind === "window" && slab2d(o.jambs[0], o.jambs[1], 16000).outer.some((p) => !inOrOn(p, o.cut)),
    );
    expect(crossing.map((o) => o.id)).toEqual(["window_10"]);
    const glass = mesh.nodes.find((x) => x.key === "L1/window:window_10:glass") as MeshNode;
    expect(glass.shells.length).toBe(1);
  });
});

describe("wall bodies meet their sills and lintels vertex to vertex (no T-junction)", () => {
  /** Vertices of `b` lying strictly inside an edge of `a` (an edge ending mid-edge of a neighbour). */
  function tJunctions(a: MeshNode["shells"], b: MeshNode["shells"]): number {
    const pts = b.flatMap((s) =>
      Array.from({ length: s.positions.length / 3 }, (_, i) => s.positions.slice(3 * i, 3 * i + 3)),
    );
    let n = 0;
    for (const s of a) {
      for (let t = 0; t < s.indices.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const p = s.positions.slice(3 * (s.indices[t + k] as number), 3 * (s.indices[t + k] as number) + 3);
          const q = s.positions.slice(
            3 * (s.indices[t + ((k + 1) % 3)] as number),
            3 * (s.indices[t + ((k + 1) % 3)] as number) + 3,
          );
          const d = [0, 1, 2].map((j) => (q[j] as number) - (p[j] as number));
          for (const v of pts) {
            const w = [0, 1, 2].map((j) => (v[j] as number) - (p[j] as number));
            const cross = [
              (d[1] as number) * (w[2] as number) - (d[2] as number) * (w[1] as number),
              (d[2] as number) * (w[0] as number) - (d[0] as number) * (w[2] as number),
              (d[0] as number) * (w[1] as number) - (d[1] as number) * (w[0] as number),
            ];
            if (cross.some((c) => c !== 0)) continue;
            const along = d.reduce((s2, x, j) => s2 + x * (w[j] as number), 0);
            const len2 = d.reduce((s2, x) => s2 + x * x, 0);
            if (along > 0 && along < len2) n++;
          }
        }
      }
    }
    return n;
  }

  it("on every wall with a sill or lintel in the corpus (each pair of shells, both ways)", () => {
    const bad: string[] = [];
    let walls = 0;
    for (const { n, scene, mesh } of corpus.filter((c) => !c.n.startsWith("s"))) {
      for (const lv of scene.levels) {
        for (const w of lv.walls) {
          const nd = mesh.nodes.find((x) => x.key === `L${lv.level}/wall:${w.id}`);
          if (!nd || nd.shells.length <= w.body.length) continue;
          walls++;
          const body = nd.shells.slice(0, w.body.length);
          const cuts = nd.shells.slice(w.body.length);
          const tj = tJunctions(body, cuts) + tJunctions(cuts, body);
          if (tj > 0) bad.push(`${n} ${w.id}: ${tj}`);
        }
      }
    }
    expect(walls).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  }, 60_000);
});

describe("the slab: rooms ∪ wall outline, less voids (plan §4.2)", () => {
  const slabOf = (m: Mesh3D) => m.nodes.find((x) => x.kind === "slab") as MeshNode;
  const under = (m: Mesh3D, x: number, y: number) =>
    slabOf(m).shells.some((s) => inside(s, [x * 1000, -100_000, y * 1000]));

  it("puts a slab under a room outside every wall, exactly (no overlapping solid)", () => {
    const { mesh: m } = built(
      plan('room id=r at (0,0) size 6000x4000 label "In" room id=t at (6000,1000) size 2000x2000 label "Terrace"'),
    );
    expect(under(m, 7000, 2000)).toBe(true);
    expect(under(m, 7000, 500)).toBe(false);
    // Volume = (outline + terrace) × 200 mm: the pieces tile, nothing counted twice.
    const vol = slabOf(m).shells.reduce((s, sh) => s + signedVolume(sh), 0);
    expect(vol / 200_000 / 1e6).toBeCloseTo(6200 * 4200 + 1900 * 2000, 0);
    for (const s of slabOf(m).shells) expect(openEdges(s)).toBe(0);
  });

  it("adds a non-rectilinear room apart from the walls whole, and cuts a void from it", () => {
    const { mesh: m } = built(
      plan('room id=t polygon (7000,0) (9000,0) (8000,2000) label "T" void id=v at (7800,500) size 400x400'),
    );
    expect(under(m, 8000, 1500)).toBe(true);
    expect(under(m, 8000, 700)).toBe(false);
  });

  it("changes nothing where the outline already covers every room (the corpus)", () => {
    const rules = corpus.flatMap((c) =>
      c.mesh.assumptions.filter((a) => a.rule === "slab-room-unsplit").map(() => c.n),
    );
    expect(rules).toEqual([]);
  });
});

describe("a demolished wall (B3a), from ir.drawn", () => {
  const remodel = built(example("remodel.arch"));
  const ghosts = remodel.mesh.nodes.filter((n) => n.part === "demolish");

  it("is a ghost node per demolished wall, status demolish, never a standing wall", () => {
    expect(ghosts.map((g) => g.key)).toEqual(["L1/wall:x_dining:demolish", "L1/wall:x_kitchen:demolish"]);
    for (const g of ghosts) {
      expect(g.kind).toBe("wall");
      expect(g.extras.status).toBe("demolish");
      for (const s of g.shells) expect([openEdges(s), signedVolume(s) > 0]).toEqual([0, true]);
    }
    const lv = remodel.scene.levels[0];
    expect(lv?.walls.map((w) => w.id)).not.toContain("x_kitchen");
    expect(lv?.demolished?.map((w) => [w.id, w.cuts.length])).toEqual([
      ["x_kitchen", 0],
      ["x_dining", 0],
    ]);
  });

  it("leaves the standing walls' ownership (H1) as the plan after the demolition", () => {
    // The same plan with the demolished walls deleted: its standing walls are byte-identical.
    const without = example("remodel.arch")
      .split("\n")
      .filter((l) => !l.includes("status demolish"))
      .join("\n");
    expect(JSON.stringify(built(without).scene.levels[0]?.walls.map((w) => [w.id, w.footprint, w.body]))).toBe(
      JSON.stringify(remodel.scene.levels[0]?.walls.map((w) => [w.id, w.footprint, w.body])),
    );
  });

  it("adds nothing to a plan that demolishes nothing (no `demolished` key)", () => {
    for (const { n, scene } of corpus.filter((c) => c.n !== "remodel.arch"))
      for (const lv of scene.levels) expect("demolished" in lv, n).toBe(false);
  });
});
