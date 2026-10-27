/**
 * Mesh3D v0: the ONE triangulation the viewer and the GLB both read (archlang-3d amendment v0.7;
 * principle 1 of the preview-and-remodel programme). Built from a Scene3D alone, deterministically:
 * same Scene3D, same bytes.
 *
 * Axes are the exporters' (glTF): X = plan x, Y = up, Z = plan y, so a plan with y down becomes a
 * right-handed, Y-up scene; the mapping is fixed here once (plan §3.4). Every coordinate is an
 * integer number of micrometres. Triangles wind counter-clockwise seen from outside (outward
 * normals), and every shell is closed.
 */
import type { Assumption } from "../scene3d/types.js";

/** The authoring stage a node belongs to (the replay's order, decision D3). */
export type Stage = "brief" | "rooms" | "walls" | "openings" | "fixtures" | "drafting";

/** One closed triangle shell: `positions` is flat `[x, y, z, …]` (µm), `indices` are triangles. */
export interface Shell {
  positions: number[];
  indices: number[];
}

export type NodeKind = "slab" | "floor" | "column" | "wall" | "door" | "window" | "opening" | "furniture" | "roof";

export interface MeshNode {
  /** `L<level>/<kind>:<id>[:<part>]`, unique in the mesh (plan §3.6). */
  key: string;
  level: number;
  kind: NodeKind;
  id: string;
  part?: string;
  stage: Stage;
  /** Order inside its stage group when the replay raises it: source order. */
  order: number;
  /** Hidden by default in the viewer (the roof, decision D3). */
  hidden?: boolean;
  /** Facts carried for a consumer (category, host, door kind, provenance …). */
  extras: Record<string, string | number | boolean>;
  shells: Shell[];
}

export interface Mesh3D {
  version: 0;
  kind: "mesh3d";
  name: string;
  /** The Scene3D ledger plus every default the mesh stage added. */
  assumptions: Assumption[];
  /** In canonical order: level, then kind, then id, then part. */
  nodes: MeshNode[];
}
