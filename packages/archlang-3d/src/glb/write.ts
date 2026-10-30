/**
 * Mesh3D → GLB (card A4; archlang-3d plan §3.6, §3.7). The same Mesh3D the replay viewer reads,
 * written with glTF-Transform: one scene, one group node per storey (`level:L<n>`) and under it one
 * node per Mesh3D node, named `<kind>:<id>[:<part>]` (its Mesh3D key without the `L<n>/` prefix, so
 * the global key `L<n>/<name>` IS the Mesh3D key), carrying the node's facts in
 * `extras.archlang`. Each node's shells are one triangle primitive in metres (the µm integers ÷ 10⁶,
 * float32), in glTF axes already (X plan x, Y up, Z plan y). One plain material per kind.
 *
 * Deterministic (V-DET-01): nodes in the Mesh3D's canonical order, object keys in a fixed order,
 * `asset.generator` a fixed string with no time. glTF has no "hidden" flag a validator accepts
 * without an extension, so the hidden roof is written like any node with `extras.archlang.hidden`.
 *
 * Browser-agnostic code, but exported from `./node` only: glTF-Transform's bundle contains a
 * `Math.random()` (its id helper, reached only when READING external resources, never on this
 * write path), which the browser bundle's scan forbids (`test/browser-safety.test.ts`).
 */
import { Document, Logger, WebIO } from "@gltf-transform/core";
import type { Mesh3D, MeshNode, NodeKind } from "../mesh/types.js";
import { ARCHLANG_3D_VERSION } from "../scene3d/build.js";

/** `asset.generator`: the package and its version, never a time (plan §3.7). */
export const GLB_GENERATOR = `archlang-3d ${ARCHLANG_3D_VERSION}`;

/** Plain base colours (linear RGBA) per kind: a neutral massing palette, not a rendering. */
const COLOUR: Record<NodeKind, [number, number, number, number]> = {
  slab: [0.55, 0.55, 0.55, 1],
  floor: [0.8, 0.75, 0.66, 1],
  column: [0.7, 0.7, 0.7, 1],
  wall: [0.92, 0.91, 0.88, 1],
  door: [0.55, 0.4, 0.28, 1],
  window: [0.6, 0.75, 0.85, 1],
  opening: [0.6, 0.6, 0.6, 1],
  furniture: [0.62, 0.64, 0.66, 1],
  roof: [0.45, 0.42, 0.4, 1],
};

/** A demolished wall's ghost (B3a): its own translucent material, `wall:demolish`. */
const DEMOLISH_COLOUR: [number, number, number, number] = [0.78, 0.33, 0.24, 0.3];

/** The glTF node name of a Mesh3D node: its key without the storey prefix (plan §3.6). */
export const glbNodeName = (n: MeshNode): string => n.key.slice(n.key.indexOf("/") + 1);

/** The storey group node's name. */
export const levelNodeName = (level: number): string => `level:L${level}`;

/** `extras.archlang` of a Mesh3D node: identity first, then the node's own facts, in a fixed key order. */
export function nodeExtras(n: MeshNode): Record<string, string | number | boolean> {
  const own = Object.keys(n.extras)
    .sort()
    .map((k) => [k, n.extras[k] as string | number | boolean] as const);
  return {
    key: n.key,
    kind: n.kind,
    id: n.id,
    ...(n.part ? { part: n.part } : {}),
    level: n.level,
    stage: n.stage,
    order: n.order,
    ...(n.hidden ? { hidden: true } : {}),
    ...Object.fromEntries(own),
  };
}

/** The GLB of `mesh`: same Mesh3D and `generator`, same bytes. */
export async function writeGlb(mesh: Mesh3D, opts: { generator?: string } = {}): Promise<Uint8Array> {
  const doc = new Document();
  doc.setLogger(new Logger(Logger.Verbosity.SILENT));
  doc.getRoot().getAsset().generator = opts.generator ?? GLB_GENERATOR;
  const buffer = doc.createBuffer();
  const scene = doc.createScene(mesh.name);
  doc.getRoot().setDefaultScene(scene);

  const materials = new Map<string, ReturnType<Document["createMaterial"]>>();
  const material = (n: MeshNode) => {
    const ghost = n.kind === "wall" && n.part === "demolish";
    const key = ghost ? "wall:demolish" : n.kind;
    let m = materials.get(key);
    if (!m) {
      m = doc
        .createMaterial(key)
        .setBaseColorFactor(ghost ? DEMOLISH_COLOUR : COLOUR[n.kind])
        .setMetallicFactor(0)
        .setRoughnessFactor(1);
      if (ghost) m.setAlphaMode("BLEND");
      materials.set(key, m);
    }
    return m;
  };

  const levels = new Map<number, ReturnType<Document["createNode"]>>();
  for (const n of mesh.nodes) {
    let group = levels.get(n.level);
    if (!group) {
      group = doc.createNode(levelNodeName(n.level)).setExtras({ archlang: { kind: "level", level: n.level } });
      scene.addChild(group);
      levels.set(n.level, group);
    }
    const positions: number[] = [];
    const indices: number[] = [];
    for (const s of n.shells) {
      const base = positions.length / 3;
      for (const v of s.positions) positions.push(v / 1e6);
      for (const i of s.indices) indices.push(base + i);
    }
    const count = positions.length / 3;
    const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
    const idx = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(count > 0xffff ? new Uint32Array(indices) : new Uint16Array(indices))
      .setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute("POSITION", pos).setIndices(idx).setMaterial(material(n));
    const name = glbNodeName(n);
    const node = doc
      .createNode(name)
      .setMesh(doc.createMesh(name).addPrimitive(prim))
      .setExtras({ archlang: nodeExtras(n) });
    group.addChild(node);
  }
  return new WebIO().writeBinary(doc);
}

/** One node read back from a GLB: its global key (`L<n>/<name>`) and its `extras.archlang`. */
export interface GlbNode {
  key: string;
  name: string;
  extras: Record<string, unknown>;
}

/**
 * The storey groups (each scene's root nodes) and every node below them at any depth, depth first
 * in file order. This module writes element nodes one level under their group only, so a node
 * nested deeper is reported too (and then named and diffed like any other), never skipped.
 */
export async function readGlbNodes(glb: Uint8Array): Promise<{ levels: string[]; nodes: GlbNode[] }> {
  const doc = await new WebIO().readBinary(glb);
  const levels: string[] = [];
  const nodes: GlbNode[] = [];
  type Node = ReturnType<Document["createNode"]>;
  const walk = (parent: Node, prefix: string): void => {
    for (const c of parent.listChildren()) {
      const extras = (c.getExtras() as { archlang?: Record<string, unknown> }).archlang ?? {};
      nodes.push({ key: `${prefix}${c.getName()}`, name: c.getName(), extras });
      walk(c, prefix);
    }
  };
  for (const scene of doc.getRoot().listScenes()) {
    for (const group of scene.listChildren()) {
      const lv = group.getName();
      levels.push(lv);
      walk(group, lv.startsWith("level:") ? `${lv.slice("level:".length)}/` : "");
    }
  }
  return { levels, nodes };
}
