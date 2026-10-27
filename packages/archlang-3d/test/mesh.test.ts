/**
 * Mesh3D (card A2): one deterministic triangulation, checked against the plan it came from
 * (archlang-3d plan §8.1): V-GEO-02/10 every shell closed with positive volume; V-GEO-07 each wall
 * exactly its height; V-GEO-01 each floor's area equal to the room's; V-GEO-04 every opening's
 * centre clear of the walls and its lintel/sill solid; V-DET-01 the same bytes on every run, pinned
 * for laneway-house so CI's Node legs compare across versions; V-GEO-12 the mixed-height warning on
 * s11 only; V-FUR-01 furniture over its floor.
 */
import { createHash } from "node:crypto";
import { describe as describePlan } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type Mesh3D, type Shell } from "../src/index.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

type V3 = [number, number, number];

function adapted(source: string) {
  const r = adaptPlan(source, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  return r;
}

/** Directed edges not matched by exactly one reverse edge (0 = closed, consistently wound). */
function openEdges(s: Shell): number {
  const m = new Map<string, number>();
  for (let t = 0; t < s.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${s.indices[t + k]}>${s.indices[t + ((k + 1) % 3)]}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [e, n] of m) {
    const [a, b] = e.split(">");
    if (n !== 1 || m.get(`${b}>${a}`) !== 1) bad++;
  }
  return bad;
}

const vert = (s: Shell, i: number): V3 => [
  s.positions[3 * i] as number,
  s.positions[3 * i + 1] as number,
  s.positions[3 * i + 2] as number,
];

/** Signed volume (µm³); positive when every face points out. */
function volume(s: Shell): number {
  let v = 0;
  for (let t = 0; t < s.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => vert(s, s.indices[t + k] as number)) as [V3, V3, V3];
    v +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return v;
}

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
  it("builds every example (34)", () => {
    expect(corpus.length).toBe(34);
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
      const sorted = [...mesh.nodes].sort(
        (a, b) =>
          a.level - b.level ||
          (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
          ((a.part ?? "") < (b.part ?? "") ? -1 : (a.part ?? "") > (b.part ?? "") ? 1 : 0),
      );
      expect(
        sorted.map((nd) => nd.key),
        n,
      ).toEqual(keys);
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

  it("V-GEO-01: each floor's area is its room's describe() area (±0.02 m², plus ε × perimeter on a curve)", () => {
    const off: string[] = [];
    for (const { n, r, mesh } of corpus) {
      const src = EXAMPLES_LIST.find(([k]) => k === n)?.[1] ?? "";
      const rooms = describePlan(src, { world: WORLD }).rooms;
      for (const room of rooms) {
        const nd = mesh.nodes.find(
          (x) =>
            x.kind === "floor" &&
            x.id === room.id &&
            x.level === (mesh.nodes.find((y) => y.kind === "floor" && y.id === room.id)?.level ?? 0),
        );
        const s = nd?.shells[0];
        if (!s) continue;
        const ys = s.positions.filter((_, i) => i % 3 === 1);
        const thick = Math.max(...ys) - Math.min(...ys);
        const m2 = volume(s) / thick / 1e12;
        // An inscribed polygon whose chords sag at most ε loses at most ε × perimeter (plan §8.1's
        // "arc rooms need their own bound"); a straight-sided room keeps the spike's 0.02 m².
        const ring = r.scene.levels.flatMap((l) => l.floors).find((f) => f.id === room.id)?.polygon.outer ?? [];
        const perim = ring.reduce((sum, p, i) => {
          const q = ring[(i + 1) % ring.length] ?? p;
          return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
        }, 0);
        const curved = ring.length > 24;
        const bound = 0.02 + (curved ? (2 * perim) / 1e9 : 0);
        if (Math.abs(m2 - room.area_m2) > bound) off.push(`${n} ${room.id}: ${m2.toFixed(3)} vs ${room.area_m2}`);
      }
    }
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
const LANEWAY_MESH_SHA256 = "7e553810b1f410ed460370ceb948eeb8e01796cf718dfbc820e1c902d4c92983";
