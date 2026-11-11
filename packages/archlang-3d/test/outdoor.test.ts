/**
 * The site in 3D (product-roadmap card RM8.3, backlog VA.2): each `outdoor` kind a thin slab in a
 * ledgered colour taken from the core's theme, each `fence` style a low-poly profile at a ledgered
 * height with its posts on the ticks the core draws, and the ground plane the viewer draws (a
 * backdrop, in no node). One minimal fixture per kind and per style (`fixtures/outdoor/`), and
 * `site-edges.arch` for the edge cases review R1 of PR #701 found; `e2e/glb.e2e.ts` passes each one's
 * GLB through glTF-Validator.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import {
  adaptPlan,
  buildMesh,
  type Fence,
  FENCE_HEIGHT_MM,
  FENCE_PALETTE,
  FENCE_PROFILES,
  fencePieces,
  fencePosts,
  fenceRuns,
  GROUND_PLANE,
  GROUND_TINT,
  linearRgb,
  type Mesh3D,
  type MeshNode,
  OUTDOOR_MM,
  PHASE,
  stateAt,
  timeline,
  viewMesh,
} from "../src/index.js";
import { bodyMaterialName, glbJson, openEdges, replayPayload, signedVolume, writeGlb } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "outdoor");
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => [f.replace(/\.arch$/, ""), readFileSync(join(DIR, f), "utf8")] as const);

function built(source: string) {
  const r = adaptPlan(source, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  return { scene: r.scene, mesh: buildMesh(r.scene) };
}

const fixture = (name: string): string => FIXTURES.find(([n]) => n === name)?.[1] ?? "";
const example = (name: string): string => EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
const nodesOf = (m: Mesh3D, kind: string): MeshNode[] => m.nodes.filter((n) => n.kind === kind);
const ys = (n: MeshNode): number[] => n.shells.flatMap((s) => s.positions.filter((_, i) => i % 3 === 1));

/**
 * Each kind's 3D colour, written out here rather than read from `GROUND_SPLITS` or `groundColour`:
 * the default theme's tint laid on six times over its white paper (lawn #eef3e7, paving #f1efeb,
 * water #e6eff5), or the 3D palette's own entry for a kind the drawing tells apart by hatch alone.
 */
const EXPECTED_COLOUR: Readonly<Record<string, string>> = {
  lawn: "#99b76f",
  planting: "#8c9b78",
  paving: "#ab9f87",
  deck: "#c6a785",
  gravel: "#cbc3b4",
  water: "#699fc3",
  driveway: "#8c8984",
  patio: "#ab9f87",
  balcony: "#ab9f87",
};
const SPLIT = new Set(["planting", "deck", "gravel", "driveway"]);

/** Each horizontal triangle of a node at height `y` (µm), as plan (x, z) corners. */
function flatTris(n: MeshNode, y: number): Array<[number, number][]> {
  const out: Array<[number, number][]> = [];
  for (const s of n.shells) {
    const p = s.positions;
    for (let t = 0; t < s.indices.length; t += 3) {
      const k = [s.indices[t], s.indices[t + 1], s.indices[t + 2]] as number[];
      if (k.every((i) => p[3 * i + 1] === y)) out.push(k.map((i) => [p[3 * i] as number, p[3 * i + 2] as number]));
    }
  }
  return out;
}
const inTri = (q: [number, number], [a, b, c]: [number, number][]): boolean => {
  const d = (u: [number, number], v: [number, number]) => (v[0] - u[0]) * (q[1] - u[1]) - (v[1] - u[1]) * (q[0] - u[0]);
  const [s1, s2, s3] = [
    d(a as [number, number], b as [number, number]),
    d(b as [number, number], c as [number, number]),
    d(c as [number, number], a as [number, number]),
  ];
  return (s1 > 0 && s2 > 0 && s3 > 0) || (s1 < 0 && s2 < 0 && s3 < 0);
};

/**
 * Every outdoor surface's top sampled (a barycentric grid on each of its top triangles): the keys of
 * the slab, floor and other outdoor nodes of its storey with a horizontal face at the same height
 * over a sample point. Any hit is two coplanar faces that fight in depth (review R1, B1).
 */
function coplanarHits(mesh: Mesh3D): string[] {
  const hits: string[] = [];
  for (const o of nodesOf(mesh, "outdoor")) {
    const top = Math.max(...ys(o));
    const others = mesh.nodes.filter(
      (n) => n !== o && n.level === o.level && (n.kind === "slab" || n.kind === "floor" || n.kind === "outdoor"),
    );
    const faces = others.map((n) => ({ key: n.key, tris: flatTris(n, top) })).filter((f) => f.tris.length > 0);
    if (faces.length === 0) continue;
    for (const [a, b, c] of flatTris(o, top)) {
      for (let i = 1; i < 10; i++)
        for (let j = 1; i + j < 10; j++) {
          const w = [i / 10, j / 10, 1 - (i + j) / 10] as const;
          const q: [number, number] = [
            (a as [number, number])[0] * w[0] + (b as [number, number])[0] * w[1] + (c as [number, number])[0] * w[2],
            (a as [number, number])[1] * w[0] + (b as [number, number])[1] * w[1] + (c as [number, number])[1] * w[2],
          ];
          for (const f of faces)
            if (f.tris.some((t) => inTri(q, t)) && !hits.includes(`${o.key} on ${f.key}`))
              hits.push(`${o.key} on ${f.key}`);
        }
    }
  }
  return hits;
}

describe("one fixture per outdoor kind and per fence style", () => {
  it("covers exactly the core's nine kinds and three styles", () => {
    expect(FIXTURES.map(([n]) => n).filter((n) => n.startsWith("ground-") || n.startsWith("fence-"))).toEqual(
      [
        ...Object.keys(GROUND_TINT).map((k) => `ground-${k}`),
        ...Object.keys(FENCE_PROFILES).map((s) => `fence-${s}`),
      ].sort(),
    );
    expect(Object.keys(GROUND_TINT).sort()).toEqual(Object.keys(EXPECTED_COLOUR).sort());
    // Each fixture is a plan the core accepts as it is: no error, so a kind it lacks would fail here.
    for (const [n, src] of FIXTURES) expect(compile(src, { world: WORLD }).errors, n).toEqual([]);
  });

  for (const [name, src] of FIXTURES.filter(([n]) => n.startsWith("ground-"))) {
    const kind = name.slice("ground-".length);
    it(`${kind}: one closed slab, 50 mm thick, its top at or a lift above the floor level, in its ledgered colour`, async () => {
      const { scene, mesh } = built(src);
      const e = scene.levels[0]?.elevation ?? Number.NaN;
      const [o, ...rest] = nodesOf(mesh, "outdoor");
      expect(rest).toEqual([]);
      expect(o?.key).toBe("L1/outdoor:g");
      expect(o?.stage).toBe("brief");
      for (const s of o?.shells ?? []) {
        expect(openEdges(s)).toBe(0);
        expect(signedVolume(s)).toBeGreaterThan(0);
      }
      const lift = ((o?.extras.lift_mm as number | undefined) ?? 0) * 1000;
      expect([Math.min(...ys(o as MeshNode)), Math.max(...ys(o as MeshNode))]).toEqual([
        e - OUTDOOR_MM * 1000 + lift,
        e + lift,
      ]);
      const colour = EXPECTED_COLOUR[kind] as string;
      expect(o?.extras).toMatchObject({ surface: kind, colour, thickness_mm: OUTDOOR_MM });
      expect(mesh.assumptions).toContainEqual({
        kind: "outdoor",
        field: `colour(${kind})`,
        value: colour,
        provenance: "default",
        rule: SPLIT.has(kind) ? "outdoor-colour-3d" : "outdoor-colour-theme",
      });
      for (const [field, value, rule] of [
        ["thickness_mm", OUTDOOR_MM, "outdoor-thickness-default"],
        ["wash", 6, "outdoor-colour-wash"],
      ] as const)
        expect(mesh.assumptions).toContainEqual({ kind: "outdoor", field, value, provenance: "default", rule });
      // The GLB writes it in a material of its kind, in the colour the viewer draws it in.
      const json = JSON.parse(glbJson(await writeGlb(mesh))) as {
        materials: Array<{ name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }>;
      };
      expect(bodyMaterialName(o as MeshNode)).toBe(`outdoor:${kind}`);
      const mat = json.materials.find((m) => m.name === `outdoor:${kind}`);
      expect(mat?.pbrMetallicRoughness?.baseColorFactor).toEqual([...linearRgb(colour), 1]);
      const viewer = replayPayload(mesh, { title: name, svg: compile(src, { world: WORLD }).svg });
      expect(viewer.nodes.find((n) => n.key === o?.key)?.colour).toBe(colour);
    });
  }

  for (const [name, src] of FIXTURES.filter(([n]) => n.startsWith("fence-"))) {
    const style = name.slice("fence-".length) as keyof typeof FENCE_PALETTE;
    it(`${style}: closed pieces on the floor level, up to its ledgered height, in its colour in the GLB`, async () => {
      const { scene, mesh } = built(src);
      const e = scene.levels[0]?.elevation ?? Number.NaN;
      const [f, ...rest] = nodesOf(mesh, "fence");
      expect(rest).toEqual([]);
      expect(f?.key).toBe("L1/fence:f");
      expect(f?.stage).toBe("walls");
      for (const s of f?.shells ?? []) {
        expect(openEdges(s)).toBe(0);
        expect(signedVolume(s)).toBeGreaterThan(0);
      }
      const height = FENCE_HEIGHT_MM[style] as number;
      expect([Math.min(...ys(f as MeshNode)), Math.max(...ys(f as MeshNode))]).toEqual([e, e + height * 1000]);
      const colour = { picket: "#eeebe4", panel: "#c6a785", post: "#7b5b44" }[style];
      expect(f?.extras).toMatchObject({ style, colour, height_mm: height });
      for (const field of [`height_mm(${style})`, `profile(${style})`, `colour(${style})`]) {
        expect(
          mesh.assumptions.filter((a) => a.kind === "fence" && a.field === field),
          field,
        ).toHaveLength(1);
      }
      expect(bodyMaterialName(f as MeshNode)).toBe(`fence:${style}`);
      const json = JSON.parse(glbJson(await writeGlb(mesh))) as {
        materials: Array<{ name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }>;
      };
      const mat = json.materials.find((m) => m.name === `fence:${style}`);
      expect(mat?.pbrMetallicRoughness?.baseColorFactor).toEqual([...linearRgb(colour), 1]);
    });
  }

  it("follows the core's post arithmetic: round(run / pitch) divisions, 1…60, and an open fence's end", () => {
    const run = (
      style: string,
      closed = false,
      ...pts: Array<[number, number]>
    ): Pick<Fence, "points" | "closed" | "style"> => ({
      points: pts,
      closed,
      style,
    });
    // A 3.6 m post-and-rail run: round(3600 / 1800) = 2 divisions, posts at 0 and 1.8 m and the end.
    const post = FENCE_PROFILES.post;
    expect(post && fencePieces(run("post", false, [0, 0], [3_600_000, 0]), post, 1100)).toHaveLength(3 + 1);
    // 2.6 m: round(1.44) = 1 division, where a ceiling would have given 2.
    expect(fencePosts(run("post", false, [0, 0], [2_600_000, 0]))).toHaveLength(2);
    // A closed 3.6 × 3 m panel ring: 2 + 2 + 2 + 2 posts (3000 / 1800 rounds to 2), four boards.
    const panel = FENCE_PROFILES.panel;
    const ring = run("panel", true, [0, 0], [3_600_000, 0], [3_600_000, 3_000_000], [0, 3_000_000]);
    expect(panel && fencePieces(ring, panel, 1800)).toHaveLength(8 + 4);
    // A 3.6 m picket run: round(3600 / 600) = 6 divisions and the end post, 2 rails, 26 pickets.
    const picket = FENCE_PROFILES.picket;
    expect(picket && fencePieces(run("picket", false, [0, 0], [3_600_000, 0]), picket, 1000)).toHaveLength(7 + 2 + 26);
    // 100 m of picket fence: the core's clamp, 60 divisions.
    expect(fencePosts(run("picket", false, [0, 0], [100_000_000, 0]))).toHaveLength(61);
    // Every piece is a whole number of micrometres (V-DET).
    for (const p of picket ? fencePieces(run("picket", false, [0, 0], [3_600_000, 1_000_000]), picket, 1000) : [])
      for (const q of p.poly.outer) expect(q.every(Number.isInteger)).toBe(true);
  });

  it("stands a post on every tick the core draws, across the corpus and the fixtures", () => {
    const plans = [
      ...EXAMPLES_LIST.filter(([, s]) => /^\s*fence\b/m.test(s)),
      ...FIXTURES.filter(([, s]) => /^\s*fence\b/m.test(s)),
    ];
    expect(plans.length).toBeGreaterThanOrEqual(5);
    let fences = 0;
    for (const [name, src] of plans) {
      const c = compile(src, { world: WORLD });
      const { scene } = built(src);
      scene.levels.forEach((lv, i) => {
        const drawn = c.pages?.[i]?.scene ?? c.scene;
        // A tick is a thin site line whose midpoint lies on a run (a panel's two lines lie off it).
        const lines = (drawn?.nodes ?? []).filter(
          (n) => n.layerName === "L-SITE" && n.prim.t === "line" && n.lineWeight === "extraThin",
        );
        for (const f of lv.fences) {
          fences++;
          const runs = fenceRuns(f).runs.map(([a, b]) => [a.map((v) => v / 1000), b.map((v) => v / 1000)]);
          const onRun = (x: number, y: number) =>
            runs.some(([a, b]) => {
              const [ax, ay, bx, by] = [a?.[0], a?.[1], b?.[0], b?.[1]] as number[];
              const len = Math.hypot((bx as number) - (ax as number), (by as number) - (ay as number));
              const t =
                ((x - (ax as number)) * ((bx as number) - (ax as number)) +
                  (y - (ay as number)) * ((by as number) - (ay as number))) /
                len;
              const d =
                Math.abs(
                  (x - (ax as number)) * ((by as number) - (ay as number)) -
                    (y - (ay as number)) * ((bx as number) - (ax as number)),
                ) / len;
              return d < 0.5 && t > -0.5 && t < len + 0.5;
            });
          const ticks = lines
            .map((n) =>
              n.prim.t === "line" ? { x: (n.prim.a.x + n.prim.b.x) / 2, y: (n.prim.a.y + n.prim.b.y) / 2 } : null,
            )
            .filter((p): p is { x: number; y: number } => p !== null && onRun(p.x, p.y))
            .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
            .sort();
          const posts = fencePosts(f)
            .map((p) => `${Math.round(p.at[0] / 1000)},${Math.round(p.at[1] / 1000)}`)
            .sort();
          expect(posts, `${name} L${lv.level} ${f.id}`).toEqual(ticks);
        }
      });
    }
    expect(fences).toBeGreaterThanOrEqual(8);
  });
});

describe("colours from the core's theme (ADR 0031's seam)", () => {
  it("each kind's tint is the one the core's drawing fills it with", () => {
    const tints = { lawn: "#eef3e7", paving: "#f1efeb", water: "#e6eff5" };
    for (const [kind, tint] of Object.entries(GROUND_TINT)) {
      const scene = compile(fixture(`ground-${kind}`), { world: WORLD }).scene;
      const all = new Set(Object.values(tints));
      const drawn = [...new Set((scene?.nodes ?? []).map((n) => n.paint?.fill).filter((f) => all.has(f as string)))];
      expect(drawn, kind).toEqual([tints[tint]]);
    }
  });

  it("never reads a label: the same surface with and without one builds the same node", () => {
    const a = built(fixture("ground-lawn")).mesh;
    const b = built(fixture("ground-lawn").replace("size 3000x3000", 'size 3000x3000 label "Water"')).mesh;
    expect(nodesOf(b, "outdoor")).toEqual(nodesOf(a, "outdoor"));
  });
});

describe("overlaps, edges and the ledger", () => {
  it("no outdoor surface's top lies in the plane of a slab, floor or surface it overlaps (review R1, B1)", () => {
    const plans = [
      ...EXAMPLES_LIST.filter(([, s]) => /^\s*outdoor\b/m.test(s)),
      ...FIXTURES.filter(([, s]) => /^\s*outdoor\b/m.test(s)),
    ];
    expect(plans.map(([n]) => n)).toEqual(expect.arrayContaining(["courtyard-house.arch", "garden-house.arch"]));
    const hits = plans.flatMap(([n, s]) => coplanarHits(built(s).mesh).map((h) => `${n}: ${h}`));
    expect(hits).toEqual([]);
  });

  it("the check above sees a coplanar overlap: a surface put back in the slab's plane is found", () => {
    const { mesh } = built(example("courtyard-house.arch"));
    const patio = nodesOf(mesh, "outdoor")[0] as MeshNode;
    const lift = ((patio.extras.lift_mm as number) ?? 0) * 1000;
    expect(lift).toBe(500);
    const down: MeshNode = {
      ...patio,
      shells: patio.shells.map((s) => ({ ...s, positions: s.positions.map((v, i) => (i % 3 === 1 ? v - lift : v)) })),
    };
    expect(coplanarHits({ ...mesh, nodes: mesh.nodes.map((n) => (n === patio ? down : n)) })).toContain(
      `${patio.key} on L1/slab:slab`,
    );
  });

  it("lifts a surface a step over the slab and over an earlier surface, ledgered", () => {
    const { scene, mesh } = built(fixture("site-edges"));
    const e = scene.levels[0]?.elevation ?? Number.NaN;
    const top = (key: string) => Math.max(...ys(mesh.nodes.find((n) => n.key === key) as MeshNode));
    // The lawn runs under the whole building: a step over the slab; the paving and the pool lie on it.
    expect(top("L1/outdoor:under")).toBe(e + 500);
    expect(top("L1/outdoor:pv")).toBe(e + 1000);
    expect(top("L1/outdoor:tri")).toBe(e + 1000);
    expect(mesh.assumptions.filter((a) => a.rule === "outdoor-overlap-lift").map((a) => [a.id, a.value])).toEqual([
      ["under", 0.5],
      ["pv", 1],
      ["tri", 1],
      ["terr", 0.5],
    ]);
  });

  it("builds an upper storey's terrace and fence on that storey's floor level", () => {
    const { scene, mesh } = built(fixture("site-edges"));
    const e2 = scene.levels[1]?.elevation ?? Number.NaN;
    const terr = mesh.nodes.find((n) => n.key === "L2/outdoor:terr") as MeshNode;
    const up = mesh.nodes.find((n) => n.key === "L2/fence:up") as MeshNode;
    expect(Math.max(...ys(terr))).toBe(e2 + 500); // its edge lies over the wall band, so over the slab
    expect(Math.min(...ys(up))).toBe(e2);
    expect(Math.max(...ys(up))).toBe(e2 + (FENCE_HEIGHT_MM.picket as number) * 1000);
  });

  it("degenerate fences: a repeated last point keeps its end post, two closed points both, one point nothing", () => {
    const { scene, mesh } = built(fixture("site-edges"));
    const fence = (id: string) => scene.levels[0]?.fences.find((f) => f.id === id) as Fence;
    const has = (id: string, x: number, y: number) =>
      fencePosts(fence(id)).some((p) => p.at[0] === x * 1000 && p.at[1] === y * 1000);
    expect(has("diag", 8500, -1500)).toBe(true);
    expect(has("two", 7000, 3000) && has("two", 8800, 3000)).toBe(true);
    expect(fencePosts(fence("two"))).toHaveLength(2);
    // The one-point fence: no node, said so, and the panel style's defaults are not claimed for it.
    expect(mesh.nodes.some((n) => n.key === "L1/fence:zz")).toBe(false);
    expect(mesh.assumptions.filter((a) => a.id === "zz").map((a) => a.rule)).toEqual(["fence-no-run"]);
    expect(mesh.assumptions.some((a) => a.field === "height_mm(panel)")).toBe(false);
    expect(mesh.assumptions.some((a) => a.rule === "shell-degenerate-or-touching-hole")).toBe(false);
  });

  it("says a balcony's railing is not built", () => {
    const { mesh } = built(fixture("ground-balcony"));
    expect(mesh.assumptions.filter((a) => a.rule === "outdoor-rail-omitted").map((a) => a.id)).toEqual(["g"]);
  });

  it("a plan with no outdoor surface or fence: no site node, no site row, and the ground row", () => {
    const { mesh } = built(example("laneway-house.arch"));
    expect(mesh.nodes.filter((n) => n.kind === "outdoor" || n.kind === "fence")).toEqual([]);
    expect(mesh.assumptions.filter((a) => a.kind === "outdoor" || a.kind === "fence")).toEqual([]);
    expect(mesh.assumptions.filter((a) => a.kind === "ground")).toEqual([
      {
        kind: "ground",
        field: "plane",
        value: {
          drawn: "viewer only",
          level: 1,
          margin_mm: GROUND_PLANE.marginMm,
          colour: GROUND_PLANE.light,
          colour_dark: GROUND_PLANE.dark,
        },
        provenance: "default",
        rule: "ground-plane-viewer-only",
      },
    ]);
    expect(GROUND_PLANE.dark).toBe("#16293d");
    expect(mesh.assumptions.some((a) => a.rule === "m1-omits-outdoor-fences")).toBe(false);
  });
});

describe("the replay", () => {
  const src = fixture("fence-picket").replace(
    "fence id=f",
    "outdoor id=g lawn at (4500,500) size 3000x2000\n  fence id=f",
  );
  const { mesh } = built(src);
  const events = timeline(mesh);
  const ev = (key: string) => events.find((e) => e.key === key);

  it("lays a surface out flat in the top-down phase, after the slab, and raises a fence with the walls", () => {
    const slab = ev("L1/slab:slab");
    const lawn = ev("L1/outdoor:g");
    const fence = ev("L1/fence:f");
    expect(lawn && slab && lawn.appear > slab.appear).toBe(true);
    expect(lawn && lawn.riseFrom === lawn.riseTo && lawn.appear < PHASE.drawn).toBe(true);
    expect(fence?.riseFrom).toBe(PHASE.rise);
    expect(fence?.riseTo).toBe(PHASE.wallsUp);
  });

  it("fades the ground in as the drawing fades out, never at once (review R1, S1)", () => {
    expect(stateAt(events, PHASE.svgIn).ground).toBe(0);
    expect(stateAt(events, PHASE.rise).ground).toBe(0);
    const mid = stateAt(events, (PHASE.rise + PHASE.svgOut) / 2);
    expect(mid.ground).toBeGreaterThan(0);
    expect(mid.ground).toBeLessThan(1);
    expect(mid.ground + mid.svg).toBeCloseTo(1, 12);
    expect(stateAt(events, PHASE.svgOut).ground).toBe(1);
    expect(stateAt(events, 1).ground).toBe(1);
    // Thirty frames a second over ten seconds: no step between two frames exceeds a sixth.
    let worst = 0;
    for (let k = 1; k <= 300; k++)
      worst = Math.max(worst, stateAt(events, k / 300).ground - stateAt(events, (k - 1) / 300).ground);
    expect(worst).toBeLessThan(1 / 6);
  });

  it("stands the lowest storey on the ground at its floor level; a view of an upper storey has none (S2)", () => {
    const p = replayPayload(mesh, { title: "g", svg: compile(src, { world: WORLD }).svg });
    const slab = mesh.nodes.find((n) => n.key === "L1/slab:slab") as MeshNode;
    expect(p.ground).toEqual({ y: Math.max(...ys(slab)) });
    expect(p.nodes.find((n) => n.key === "L1/fence:f")?.colour).toBe(FENCE_PALETTE.picket.srgb);
    const garden = built(example("garden-house.arch")).mesh;
    const svg = compile(example("garden-house.arch"), { world: WORLD }).svg;
    const lowest = replayPayload(viewMesh(garden, 1), { title: "1", svg });
    const upper = replayPayload(viewMesh(garden, 2), { title: "2", svg });
    expect(lowest.ground?.y).toBe(replayPayload(garden, { title: "all", svg }).ground?.y);
    expect(upper.ground).toBeUndefined();
  });
});
