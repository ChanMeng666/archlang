/**
 * The site in 3D (product-roadmap card RM8.3, backlog VA.2): each `outdoor` kind a thin slab in a
 * ledgered colour taken from the core's theme, each `fence` style a low-poly profile at a ledgered
 * height, and the ground plane the viewer draws (in no node). One minimal fixture per kind and per
 * style (`fixtures/outdoor/`); `e2e/glb.e2e.ts` passes each one's GLB through glTF-Validator.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, DEFAULT_THEME } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import {
  adaptPlan,
  buildMesh,
  FENCE_HEIGHT_MM,
  FENCE_PALETTE,
  FENCE_PROFILES,
  fencePieces,
  GROUND_PLANE,
  GROUND_SPLITS,
  GROUND_TINT,
  groundColour,
  linearRgb,
  type Mesh3D,
  type MeshNode,
  OUTDOOR_MM,
  PHASE,
  stateAt,
  timeline,
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
const nodesOf = (m: Mesh3D, kind: string): MeshNode[] => m.nodes.filter((n) => n.kind === kind);
const ys = (n: MeshNode): number[] => n.shells.flatMap((s) => s.positions.filter((_, i) => i % 3 === 1));

describe("one fixture per outdoor kind and per fence style", () => {
  it("covers exactly the core's nine kinds and three styles", () => {
    expect(FIXTURES.map(([n]) => n)).toEqual(
      [
        ...Object.keys(GROUND_TINT).map((k) => `ground-${k}`),
        ...Object.keys(FENCE_PROFILES).map((s) => `fence-${s}`),
      ].sort(),
    );
    expect(Object.keys(GROUND_TINT)).toHaveLength(9);
    // Each fixture is a plan the core accepts as it is: no error, so a kind it lacks would fail here.
    for (const [n, src] of FIXTURES) expect(compile(src, { world: WORLD }).errors, n).toEqual([]);
  });

  for (const [name, src] of FIXTURES.filter(([n]) => n.startsWith("ground-"))) {
    const kind = name.slice("ground-".length) as keyof typeof GROUND_TINT;
    it(`${kind}: one closed slab [e − ${OUTDOOR_MM} mm, e] in its ledgered colour`, async () => {
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
      expect([Math.min(...ys(o as MeshNode)), Math.max(...ys(o as MeshNode))]).toEqual([e - OUTDOOR_MM * 1000, e]);
      const split = GROUND_SPLITS[kind];
      const colour = split ? split.srgb : groundColour(GROUND_TINT[kind]);
      expect(o?.extras).toMatchObject({ surface: kind, colour, thickness_mm: OUTDOOR_MM });
      expect(mesh.assumptions).toContainEqual({
        kind: "outdoor",
        field: `colour(${kind})`,
        value: colour,
        provenance: "default",
        rule: split ? "outdoor-colour-3d" : "outdoor-colour-theme",
      });
      expect(mesh.assumptions).toContainEqual({
        kind: "outdoor",
        field: "thickness_mm",
        value: OUTDOOR_MM,
        provenance: "default",
        rule: "outdoor-thickness-default",
      });
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
    it(`${style}: closed pieces on the floor level, up to its ledgered height`, () => {
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
      expect(f?.extras).toMatchObject({ style, colour: FENCE_PALETTE[style].srgb, height_mm: height });
      for (const field of [`height_mm(${style})`, `profile(${style})`, `colour(${style})`]) {
        expect(mesh.assumptions.filter((a) => a.kind === "fence" && a.field === field), field).toHaveLength(1);
      }
      expect(bodyMaterialName(f as MeshNode)).toBe(`fence:${style}`);
    });
  }

  it("posts a fence at each of its points and at most the pitch apart, its pickets by their pitch", () => {
    // A 3.6 m straight post-and-rail run: posts at 0, 1.8 and 3.6 m, and one rail.
    const post = FENCE_PROFILES.post;
    const run = { points: [[0, 0] as [number, number], [3_600_000, 0] as [number, number]], closed: false };
    expect(post && fencePieces(run, post, 1100)).toHaveLength(3 + 1);
    // A closed 3.6 × 3 m panel ring: per side 2 posts and a board (its corners are the next side's
    // first post), so 4 × 3 pieces.
    const panel = FENCE_PROFILES.panel;
    const ring = {
      points: [
        [0, 0],
        [3_600_000, 0],
        [3_600_000, 3_000_000],
        [0, 3_000_000],
      ] as Array<[number, number]>,
      closed: true,
    };
    expect(panel && fencePieces(ring, panel, 1800)).toHaveLength(4 * 3);
    // A 3.6 m picket run: 2 posts + the end one, 2 rails, 3600 / 140 → 26 pickets.
    const picket = FENCE_PROFILES.picket;
    expect(picket && fencePieces(run, picket, 1000)).toHaveLength(3 + 2 + 26);
    // Every piece is a whole number of micrometres (V-DET).
    for (const p of picket ? fencePieces(run, picket, 1000) : [])
      for (const q of p.poly.outer) expect(q.every(Number.isInteger)).toBe(true);
  });
});

describe("colours from the core's theme (ADR 0031's seam)", () => {
  it("each kind's tint is the one the core's drawing fills it with", () => {
    for (const [kind, tint] of Object.entries(GROUND_TINT)) {
      const scene = compile(fixture(`ground-${kind}`), { world: WORLD }).scene;
      const tints = new Set([DEFAULT_THEME.lawn, DEFAULT_THEME.paving, DEFAULT_THEME.water]);
      const drawn = [...new Set((scene?.nodes ?? []).map((n) => n.paint?.fill).filter((f) => tints.has(f as string)))];
      expect(drawn, kind).toEqual([DEFAULT_THEME[tint]]);
    }
  });

  it("lays the theme's wash on six times over its paper: the default theme's lawn, paving and water", () => {
    expect([groundColour("lawn"), groundColour("paving"), groundColour("water")]).toEqual([
      "#99b76f",
      "#ab9f87",
      "#699fc3",
    ]);
  });

  it("never reads a label: the same surface with and without one builds the same node", () => {
    const a = built(fixture("ground-lawn")).mesh;
    const b = built(fixture("ground-lawn").replace("size 3000x3000", 'size 3000x3000 label "Water"')).mesh;
    expect(nodesOf(b, "outdoor")).toEqual(nodesOf(a, "outdoor"));
  });
});

describe("overlaps, railings and the ledger", () => {
  it("lifts a surface overlapping an earlier one 0.5 mm above it, ledgered", () => {
    const src = fixture("ground-lawn").replace(
      "outdoor id=g lawn at (4500,0) size 3000x3000",
      "outdoor id=g lawn at (4500,0) size 3000x3000\n  outdoor id=p paving at (5000,500) size 1000x2000",
    );
    const { scene, mesh } = built(src);
    const e = scene.levels[0]?.elevation ?? Number.NaN;
    const p = mesh.nodes.find((n) => n.key === "L1/outdoor:p") as MeshNode;
    expect(Math.max(...ys(p))).toBe(e + 500);
    expect(p.extras.lift_mm).toBe(0.5);
    expect(mesh.assumptions.filter((a) => a.rule === "outdoor-overlap-lift").map((a) => [a.id, a.value])).toEqual([
      ["p", 0.5],
    ]);
  });

  it("says a balcony's railing is not built", () => {
    const { mesh } = built(fixture("ground-balcony"));
    expect(mesh.assumptions.filter((a) => a.rule === "outdoor-rail-omitted").map((a) => a.id)).toEqual(["g"]);
  });

  it("a plan with no outdoor surface or fence: no site node, no site row, and the ground row", () => {
    const laneway = EXAMPLES_LIST.find(([n]) => n === "laneway-house.arch")?.[1] ?? "";
    const { mesh } = built(laneway);
    expect(mesh.nodes.filter((n) => n.kind === "outdoor" || n.kind === "fence")).toEqual([]);
    expect(mesh.assumptions.filter((a) => a.kind === "outdoor" || a.kind === "fence")).toEqual([]);
    expect(mesh.assumptions.filter((a) => a.kind === "ground")).toEqual([
      {
        kind: "ground",
        field: "plane",
        value: { drawn: "viewer only", margin_mm: GROUND_PLANE.marginMm, colour: GROUND_PLANE.light },
        provenance: "default",
        rule: "ground-plane-viewer-only",
      },
    ]);
    expect(mesh.assumptions.some((a) => a.rule === "m1-omits-outdoor-fences")).toBe(false);
  });
});

describe("the replay", () => {
  const src = fixture("fence-picket").replace("fence id=f", "outdoor id=g lawn at (4500,500) size 3000x2000\n  fence id=f");
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

  it("shows the ground from the moment the drawing starts to fade, at the lowest storey's floor level", () => {
    expect(stateAt(events, PHASE.rise - 1e-6).ground).toBe(false);
    expect(stateAt(events, PHASE.rise).ground).toBe(true);
    expect(stateAt(events, 1).ground).toBe(true);
    const p = replayPayload(mesh, { title: "g", svg: compile(src, { world: WORLD }).svg });
    const slab = mesh.nodes.find((n) => n.key === "L1/slab:slab") as MeshNode;
    expect(p.ground).toEqual({ y: Math.max(...ys(slab)) });
    expect(p.nodes.find((n) => n.key === "L1/fence:f")?.colour).toBe(FENCE_PALETTE.picket.srgb);
  });
});
