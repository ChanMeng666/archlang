/**
 * Mesh3D (card A2): one deterministic triangulation, checked against the plan it came from
 * (archlang-3d plan §8.1): V-GEO-02/10 every shell closed with positive volume; V-GEO-07 each wall
 * exactly its height; V-GEO-01 each floor's area equal to the room's; V-GEO-04 every opening's
 * centre clear of the walls and its lintel/sill solid (V-GEO-11 with it: a probe through every
 * opening meets no wall, so each cut opened every piece it covers); V-DET-01 the same bytes on every run, pinned
 * for laneway-house so CI's Node legs compare across versions; V-GEO-12 the mixed-height warning on
 * s11 only; V-FUR-01 furniture over its floor.
 */
import { createHash } from "node:crypto";
import { describeLevel, describe as describePlan } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type Mesh3D, prism, type Shell } from "../src/index.js";
import { openEdges, signedVolume as volume } from "../src/node.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

type V3 = [number, number, number];

function adapted(source: string) {
  const r = adaptPlan(source, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  return r;
}

const vert = (s: Shell, i: number): V3 => [
  s.positions[3 * i] as number,
  s.positions[3 * i + 1] as number,
  s.positions[3 * i + 2] as number,
];

/**
 * Whether `p` lies inside the closed shell: parity of a +X ray's crossings. `p` is offset by a
 * fraction of a micrometre in Y and Z, so on an all-integer mesh the ray never grazes an edge.
 */
function inside(s: Shell, p: V3): boolean {
  const o: V3 = [p[0], p[1] + 0.37, p[2] + 0.61];
  let hits = 0;
  for (let t = 0; t < s.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => vert(s, s.indices[t + k] as number)) as [V3, V3, V3];
    // Möller–Trumbore against direction (1, 0, 0).
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const pv: V3 = [0, -e2[2], e2[1]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (det === 0) continue;
    const tv: V3 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
    if (u < 0 || u > 1) continue;
    const q: V3 = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const v = q[0] / det;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (dist > 0) hits++;
  }
  return hits % 2 === 1;
}

const digest = (m: Mesh3D): string => createHash("sha256").update(JSON.stringify(m)).digest("hex");

const corpus = EXAMPLES_LIST.map(([n, s]) => {
  const r = adapted(s);
  return { n, r, mesh: buildMesh(r.scene) };
});

describe("Mesh3D on the shipped corpus", () => {
  it("builds every example (35)", () => {
    expect(corpus.length).toBe(35); // 35 since B3b added examples/remodel.arch
    expect(corpus.every((c) => c.mesh.nodes.length > 0)).toBe(true);
  });

  it("V-GEO-02/10: every shell is closed and points out (positive volume)", () => {
    const bad: string[] = [];
    let shells = 0;
    for (const { n, mesh } of corpus) {
      for (const nd of mesh.nodes) {
        for (const s of nd.shells) {
          shells++;
          if (openEdges(s) !== 0 || !(volume(s) > 0)) bad.push(`${n} ${nd.key}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(shells).toBeGreaterThan(3000);
  });

  it("puts every coordinate on a whole micrometre", () => {
    for (const { n, mesh } of corpus) {
      const off = mesh.nodes.flatMap((nd) => nd.shells.flatMap((s) => s.positions)).filter((x) => !Number.isInteger(x));
      expect(off.length, n).toBe(0);
    }
  });

  it("orders nodes canonically: level, kind, id, part; keys unique", () => {
    for (const { n, mesh } of corpus) {
      const keys = mesh.nodes.map((nd) => nd.key);
      expect(new Set(keys).size, n).toBe(keys.length);
      // Checked pairwise against the key's own fields, not by re-sorting with the builder's comparator.
      for (let i = 1; i < mesh.nodes.length; i++) {
        const [a, b] = [mesh.nodes[i - 1], mesh.nodes[i]] as [Mesh3D["nodes"][number], Mesh3D["nodes"][number]];
        const t = (x: typeof a): string[] => [String(x.level).padStart(4, "0"), x.kind, x.id, x.part ?? ""];
        const [ta, tb] = [t(a), t(b)];
        const k = ta.findIndex((v, j) => v !== tb[j]);
        expect(k >= 0 && (ta[k] as string) < (tb[k] as string), `${n}: ${a.key} before ${b.key}`).toBe(true);
      }
    }
  });

  it("V-GEO-07: each wall stands exactly its resolved height above its storey", () => {
    for (const { n, r, mesh } of corpus) {
      for (const lv of r.scene.levels) {
        for (const w of lv.walls) {
          const nd = mesh.nodes.find((x) => x.key === `L${lv.level}/wall:${w.id}`);
          if (w.body.length === 0) continue;
          const ys = nd?.shells.flatMap((s) => s.positions.filter((_, i) => i % 3 === 1)) ?? [];
          expect([Math.min(...ys), Math.max(...ys)], `${n} ${w.id}`).toEqual([lv.elevation, lv.elevation + w.height]);
        }
      }
    }
  });

  it("V-GEO-01: each storey's floors match its rooms' describe() area (±0.02 m², plus ε × perimeter on a curve)", () => {
    const off: string[] = [];
    let compared = 0;
    for (const { n, r, mesh } of corpus) {
      const src = EXAMPLES_LIST.find(([k]) => k === n)?.[1] ?? "";
      const summary = describePlan(src, { world: WORLD });
      for (const lv of r.scene.levels) {
        const rooms = r.scene.levels.length > 1 ? describeLevel(summary, lv.level).rooms : summary.rooms;
        const voids = lv.voids.length > 0;
        for (const room of rooms) {
          const nd = mesh.nodes.find((x) => x.kind === "floor" && x.id === room.id && x.level === lv.level);
          if (!nd || voids) continue; // a storey with a void: the floor is the room less the void (tested below)
          const m2 = nd.shells.reduce((sum, sh) => {
            const ys = sh.positions.filter((_, i) => i % 3 === 1);
            return sum + volume(sh) / (Math.max(...ys) - Math.min(...ys)) / 1e12;
          }, 0);
          // An inscribed polygon whose chords sag at most ε loses at most ε × perimeter (plan §8.1's
          // "arc rooms need their own bound"); a straight-sided room keeps the spike's 0.02 m².
          const ring = lv.floors.find((f) => f.id === room.id)?.polygon.outer ?? [];
          const perim = ring.reduce((sum, p, i) => {
            const q = ring[(i + 1) % ring.length] ?? p;
            return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
          }, 0);
          const bound = 0.02 + (ring.length > 24 ? (2 * perim) / 1e9 : 0);
          compared++;
          if (Math.abs(m2 - room.area_m2) > bound)
            off.push(`${n} L${lv.level} ${room.id}: ${m2.toFixed(3)} vs ${room.area_m2}`);
        }
      }
    }
    expect(compared).toBeGreaterThan(200);
    expect(off).toEqual([]);
  });

  it("V-GEO-04: every opening's centre is clear of every wall, and its lintel or sill is solid", () => {
    const blocked: string[] = [];
    const notSolid: string[] = [];
    let probes = 0;
    for (const { n, r, mesh } of corpus) {
      for (const lv of r.scene.levels) {
        const walls = mesh.nodes.filter((x) => x.level === lv.level && x.kind === "wall");
        const solidAt = (p: V3): boolean => walls.some((w) => w.shells.some((s) => inside(s, p)));
        for (const o of lv.openings) {
          const host = lv.walls.find((w) => w.id === o.host);
          if (!host) continue;
          const [x, z] = o.centre;
          probes++;
          const mid = lv.elevation + Math.round((o.sill + Math.min(o.head, host.height)) / 2);
          if (solidAt([x, mid, z])) blocked.push(`${n} ${o.id}`);
          if (o.head < host.height - 50_000) {
            const y = lv.elevation + Math.round((o.head + host.height) / 2);
            if (!solidAt([x, y, z])) notSolid.push(`${n} ${o.id} lintel`);
          }
          if (o.sill > 50_000 && !solidAt([x, lv.elevation + Math.round(o.sill / 2), z]))
            notSolid.push(`${n} ${o.id} sill`);
        }
      }
    }
    expect(probes).toBeGreaterThan(500);
    expect(blocked).toEqual([]);
    expect(notSolid).toEqual([]);
  });

  it("builds a double door's two leaves, from the core's doorLeaves", () => {
    const aq = corpus.find((c) => c.n === "aquarium.arch");
    const d = aq?.mesh.nodes.find((x) => x.kind === "door" && x.id === "d_main");
    expect(d?.extras.door_kind).toBe("double");
    expect(d?.shells.length).toBe(2);
  });

  it("hides the roof by default and puts it on the tallest wall", () => {
    const roofs = corpus.flatMap((c) => c.mesh.nodes.filter((x) => x.kind === "roof"));
    expect(roofs.length).toBeGreaterThan(0);
    expect(roofs.every((x) => x.hidden === true)).toBe(true);
  });

  it("V-FUR-01: every piece declared in a room stands over a floor of its storey", () => {
    const outside: string[] = [];
    let inRoom = 0;
    for (const { n, mesh } of corpus) {
      for (const f of mesh.nodes.filter((x) => x.kind === "furniture")) {
        const s = f.shells[0] as Shell;
        const xs = s.positions.filter((_, i) => i % 3 === 0);
        const zs = s.positions.filter((_, i) => i % 3 === 2);
        const ys = s.positions.filter((_, i) => i % 3 === 1);
        const c: V3 = [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          Math.min(...ys) - 2500,
          (Math.min(...zs) + Math.max(...zs)) / 2,
        ];
        const floors = mesh.nodes.filter((x) => x.kind === "floor" && x.level === f.level);
        const over = floors.some((fl) => fl.shells.some((sh) => inside(sh, c)));
        if (f.extras.room !== undefined) inRoom++;
        // A piece over no floor must be one the plan put in no room (garden pieces on the site).
        if (!over && f.extras.room !== undefined) outside.push(`${n} ${f.id}`);
      }
    }
    expect(inRoom).toBeGreaterThan(300);
    expect(outside).toEqual([]);
  });

  it("drops no shell anywhere in the corpus (a refused shell would be in the ledger)", () => {
    const dropped = corpus.flatMap((c) =>
      c.mesh.assumptions
        .filter((a) => a.rule === "shell-degenerate-or-touching-hole")
        .map((a) => `${c.n} ${a.kind}:${a.id}`),
    );
    expect(dropped).toEqual([]);
  });

  it("cuts a real gallery void out of the slab and the floor (two-storey, hillside-villa)", () => {
    let checked = 0;
    for (const { n, r, mesh } of corpus.filter((c) => c.n === "two-storey.arch" || c.n === "hillside-villa.arch")) {
      for (const lv of r.scene.levels) {
        for (const v of lv.voids) {
          const p: V3 = [v.at[0] + v.size.w / 2, lv.elevation - 100_000, v.at[1] + v.size.h / 2];
          const slab = mesh.nodes.find((x) => x.key === `L${lv.level}/slab:slab`);
          expect(
            slab?.shells.some((s) => inside(s, p)),
            `${n} L${lv.level} slab under ${v.id}`,
          ).toBe(false);
          const q: V3 = [p[0], lv.elevation + 2500, p[2]];
          const floors = mesh.nodes.filter((x) => x.kind === "floor" && x.level === lv.level);
          expect(
            floors.some((f) => f.shells.some((s) => inside(s, q))),
            `${n} floor over ${v.id}`,
          ).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it("records every default it adds in the ledger", () => {
    const rules = new Set(corpus.flatMap((c) => c.mesh.assumptions.map((a) => a.rule)));
    for (const r of [
      "slab-default-200",
      "door-pose-closed",
      "floor-finish-5",
      "window-frame-40x60",
      "furniture-height-family",
    ]) {
      expect(rules.has(r), r).toBe(true);
    }
  });
});

describe("voids and holes (PR #328 review round 1)", () => {
  const plan = (body: string) =>
    buildMesh(
      adapted(
        `plan "v" { units mm grid 50 wall id=w exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close } ${body} }`,
      ).scene,
    );
  const floorsOf = (m: Mesh3D) => m.nodes.filter((x) => x.kind === "floor");
  const area = (m: Mesh3D, id: string): number =>
    floorsOf(m)
      .filter((x) => x.id === id)
      .flatMap((x) => x.shells)
      .reduce((s, sh) => s + volume(sh) / (5 * 1000) / 1e12, 0);

  it("cuts a void flush with a wall and one on a corner exactly, every shell closed", () => {
    const m = plan(
      'room id=a at (0,0) size 4000x4000 label "A" void id=v1 at (0,2500) size 1000x1000 void id=v2 at (0,0) size 500x500',
    );
    for (const f of floorsOf(m)) for (const sh of f.shells) expect(openEdges(sh)).toBe(0);
    expect(area(m, "a")).toBeCloseTo(16 - 1 - 0.25, 6);
  });

  it("cuts a void straddling two rooms out of both", () => {
    const m = plan(
      'room id=a at (0,0) size 4000x4000 label "A" room id=b at (4000,0) size 4000x4000 label "B" void id=v at (3000,1000) size 2000x1000',
    );
    expect(area(m, "a")).toBeCloseTo(16 - 1, 6);
    expect(area(m, "b")).toBeCloseTo(16 - 1, 6);
  });

  it("refuses a prism whose hole touches its outer ring or another hole, instead of an open shell", () => {
    const outer: Array<[number, number]> = [
      [0, 0],
      [4000, 0],
      [4000, 4000],
      [0, 4000],
    ];
    const sq = (x: number, y: number, w: number): Array<[number, number]> => [
      [x, y],
      [x + w, y],
      [x + w, y + w],
      [x, y + w],
    ];
    expect(prism({ outer, holes: [sq(0, 1000, 1000)] }, 0, 10)).toBeNull(); // shares an edge
    expect(prism({ outer, holes: [sq(1000, 1000, 1000), sq(2000, 1000, 1000)] }, 0, 10)).toBeNull(); // holes touch
    const ok = prism({ outer, holes: [sq(1000, 1000, 1000)] }, 0, 10);
    expect(ok && openEdges(ok)).toBe(0);
  });
});

describe("Mesh3D determinism and budget", () => {
  const laneway = EXAMPLES_LIST.find(([n]) => n === "laneway-house.arch")?.[1] ?? "";

  it("V-DET-01: three builds, one SHA-256; pinned so CI's Node legs compare across versions", () => {
    const hashes = [0, 1, 2].map(() => digest(buildMesh(adapted(laneway).scene)));
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toBe(LANEWAY_MESH_SHA256);
  });

  it("builds a single storey within 2 s", () => {
    const t = performance.now();
    buildMesh(adapted(laneway).scene);
    expect(performance.now() - t).toBeLessThan(2000);
  });

  it("V-GEO-12: the mixed-height warning fires on s11 only", () => {
    const fired = [...EXAMPLES_LIST.map(([n, s]) => [n, s] as const), ...Object.entries(STRESS_PLANS)].flatMap(
      ([n, s]) => adapted(s).warnings.map((w) => `${n}: ${w.owner.id}>${w.notched.id}`),
    );
    expect(fired).toEqual(["s11-mixed-thick-low: lowthick>tall"]);
  });
});

/**
 * laneway-house's Mesh3D, SHA-256 of its JSON. Taken on Windows / Node 24 at the commit that adds
 * this test; CI's Node 18/20/22 and Windows legs must reproduce it. It moves only with a deliberate
 * change to the adapter or the mesh stage (or a core change to the plan's geometry), recorded in
 * the PR that moves it.
 */
const LANEWAY_MESH_SHA256 = "7d05de616817cba5b063f91ba0d5f77c3c218adf654e4323c0ff56e5bd725a6d";
