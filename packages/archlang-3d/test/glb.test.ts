/**
 * The GLB (card A4), light half: written from the same Mesh3D the viewer reads, its node set is the
 * Mesh3D's and the viewer's (diffed both ways), names and `extras` follow plan §3.6, and the bytes
 * are pinned for laneway-house so CI's Node legs and its Windows leg compare across versions and
 * platforms (V-DET-02's start). glTF-Validator, three-run SHA-256 over the corpus (V-DET-01) and the
 * CLI are the heavy half, `e2e/glb.e2e.ts` under `npm run check:3d`.
 */
import { createHash } from "node:crypto";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { WebIO } from "@gltf-transform/core";
import { checkNaming, GLB_GENERATOR, glbJson, glbLeaks, readGlbNodes, replayPayload, writeGlb } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const meshOf = (name: string) => {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(r.refusal.code);
  return { src, mesh: buildMesh(r.scene) };
};
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** `a` less `b`, both ways: empty diffs mean equal sets. */
const diff = (a: Iterable<string>, b: Iterable<string>) => {
  const A = new Set(a);
  const B = new Set(b);
  return { onlyLeft: [...A].filter((x) => !B.has(x)), onlyRight: [...B].filter((x) => !A.has(x)) };
};

describe("GLB from Mesh3D", () => {
  for (const name of ["laneway-house.arch", "two-storey.arch", "hexagon-pavilion.arch", "remodel.arch"]) {
    it(`${name}: the GLB's nodes are the Mesh3D's, and the viewer's are the visible ones`, async () => {
      const { src, mesh } = meshOf(name);
      const glb = await writeGlb(mesh);
      const { levels, nodes } = await readGlbNodes(glb);
      expect(
        diff(
          nodes.map((n) => n.key),
          mesh.nodes.map((n) => n.key),
        ),
      ).toEqual({ onlyLeft: [], onlyRight: [] });
      expect(nodes.length).toBe(mesh.nodes.length); // no duplicates either
      // The viewer draws every node but the hidden ones (the roof, D3); the GLB marks exactly those.
      const viewer = replayPayload(mesh, { title: name, svg: compile(src, { world: WORLD }).svg }).nodes.map(
        (n) => n.key,
      );
      const shown = nodes.filter((n) => n.extras.hidden !== true).map((n) => n.key);
      expect(diff(viewer, shown)).toEqual({ onlyLeft: [], onlyRight: [] });
      expect(levels).toEqual([...new Set(mesh.nodes.map((n) => `level:L${n.level}`))]);
      const naming = checkNaming(nodes, levels, mesh);
      expect(naming.failures).toEqual([]);
    });
  }

  it("carries each node's facts in extras.archlang and a fixed generator, no time", async () => {
    const { mesh } = meshOf("laneway-house.arch");
    const glb = await writeGlb(mesh);
    const json = JSON.parse(glbJson(glb)) as {
      asset: { generator: string };
      nodes: Array<{ name: string; extras?: { archlang?: Record<string, unknown> } }>;
    };
    expect(json.asset.generator).toBe(GLB_GENERATOR);
    const door = json.nodes.find((n) => n.name.startsWith("door:"));
    expect(door?.extras?.archlang).toMatchObject({ kind: "door", level: 1, stage: "openings", pose: "closed" });
    expect(door?.extras?.archlang?.host).toBeTypeOf("string");
    const roof = json.nodes.find((n) => n.name.startsWith("roof:"));
    expect(roof?.extras?.archlang?.hidden).toBe(true);
    expect(json.nodes.find((n) => n.name === "level:L1")?.extras?.archlang).toEqual({ kind: "level", level: 1 });
  });

  it("writes a demolished wall (B3a) as its own node under its key, in a translucent material of its own", async () => {
    const { mesh } = meshOf("remodel.arch");
    const json = JSON.parse(glbJson(await writeGlb(mesh))) as {
      nodes: Array<{ name: string; mesh?: number; extras?: { archlang?: Record<string, unknown> } }>;
      meshes: Array<{ primitives: Array<{ material: number }> }>;
      materials: Array<{ name: string; alphaMode?: string }>;
    };
    const ghost = json.nodes.find((n) => n.name === "wall:x_kitchen:demolish");
    expect(ghost?.extras?.archlang).toMatchObject({ kind: "wall", part: "demolish", status: "demolish" });
    const mat = json.materials[json.meshes[ghost?.mesh ?? -1]?.primitives[0]?.material ?? -1];
    expect(mat).toMatchObject({ name: "wall:demolish", alphaMode: "BLEND" });
    const standing = json.nodes.find((n) => n.name === "wall:shell");
    expect(json.materials[json.meshes[standing?.mesh ?? -1]?.primitives[0]?.material ?? -1]?.name).toBe("wall");
  });

  it("V-GLTF-02 fails a GLB that lacks a Mesh3D node", async () => {
    const { mesh } = meshOf("laneway-house.arch");
    const { levels, nodes } = await readGlbNodes(await writeGlb(mesh));
    const r = checkNaming(nodes.slice(1), levels, mesh);
    expect(r.ok).toBe(false);
    expect(r.failures.join("\n")).toContain(`Mesh3D node "${nodes[0]?.key}" missing from the GLB`);
  });

  it("V-DET-01/02: three writes, one SHA-256, pinned for laneway-house", async () => {
    const hashes = await Promise.all([0, 1, 2].map(async () => sha(await writeGlb(meshOf("laneway-house.arch").mesh))));
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toBe(LANEWAY_GLB_SHA256);
  });

  it("reads a node nested below an element node, so V-GLTF-02 sees it", async () => {
    const { mesh } = meshOf("laneway-house.arch");
    const io = new WebIO();
    const doc = await io.readBinary(await writeGlb(mesh));
    const group = doc.getRoot().listScenes()[0]?.listChildren()[0];
    const first = group?.listChildren()[0];
    if (!group || !first) throw new Error("no element node");
    first.addChild(doc.createNode("stray:x"));
    const { levels, nodes } = await readGlbNodes(await io.writeBinary(doc));
    expect(nodes.map((n) => n.key)).toContain(`${group.getName().slice("level:".length)}/stray:x`);
    expect(checkNaming(nodes, levels, mesh).failures.join("\n")).toContain(
      'GLB node "L1/stray:x" is not a Mesh3D node',
    );
  });
});

describe("the reproducibility leak check (plan §8.5 L7)", () => {
  const json = (asset: Record<string, unknown>, name = "laneway") =>
    JSON.stringify({ asset: { version: "2.0", ...asset }, scenes: [{ name }], nodes: [{ name: "room:r" }] });

  it("accepts a plan whose own name carries a date and time", () => {
    expect(glbLeaks(json({ generator: GLB_GENERATOR }, "Survey 2026-10-28T09:30"))).toEqual([]);
  });

  it("flags a date or time the writer stamped in the asset fields", () => {
    expect(glbLeaks(json({ generator: `${GLB_GENERATOR} 2026-10-28T09:30:00Z` }))).toHaveLength(1);
    expect(glbLeaks(json({ generator: GLB_GENERATOR, copyright: "2026-10-28" }))).toHaveLength(1);
  });

  it("flags an absolute path anywhere", () => {
    expect(glbLeaks(json({ generator: GLB_GENERATOR }, "C:\\Users\\me\\plan"))).toHaveLength(1);
    expect(glbLeaks(json({ generator: GLB_GENERATOR, extras: { src: "/home/me/plan.arch" } }))).toHaveLength(1);
  });

  it("passes the GLBs this package writes", async () => {
    expect(glbLeaks(glbJson(await writeGlb(meshOf("laneway-house.arch").mesh)))).toEqual([]);
  });
});

/**
 * laneway-house's GLB, SHA-256. Taken on Windows / Node 24 at the commit that adds the GLB writer
 * (card A4); it moves with the Mesh3D (`LANEWAY_MESH_SHA256` in `mesh.test.ts`) or the writer, and
 * only with a reason recorded in the commit.
 *
 * Moved by card A2b (was bef25c7b…) with the Mesh3D alone: T0 furniture and the split wall bodies.
 * The writer's one change (a `wall:demolish` material) writes nothing for a plan without one.
 *
 * Moved by the 0.1.0 version bump (was 4bcbf8e0…) with `asset.generator` alone: those bytes with
 * "archlang-3d 0.1.0" written back to "archlang-3d 0.0.0" hash to the old pin. It moves with every
 * version of the package, since the generator string names it.
 */
const LANEWAY_GLB_SHA256 = "80b64bfce0aba50b7a33f9a1ea10905d951c932f940961c04340a316be915309";
