/**
 * Pins read by more than one place: `test/glb.test.ts` and `scripts/prove-pack.ts`, which compares
 * the installed tarball's bytes with them.
 *
 * `PIN_GENERATOR` is the `asset.generator` the laneway digest is taken with: fixed, so a version bump
 * leaves the pin alone and a moved digest always means moved geometry or a changed writer. A real GLB
 * names the package's version (`GLB_GENERATOR`; `test/glb.test.ts` says so).
 */
export const PIN_GENERATOR = "archlang-3d 0.0.0";

/**
 * laneway-house's GLB, SHA-256, written with `PIN_GENERATOR`. Taken on Windows / Node 24 at the commit
 * that adds the GLB writer (card A4); it moves with the Mesh3D (`LANEWAY_MESH_SHA256` in
 * `mesh.test.ts`) or the writer, and only with a reason recorded in the commit.
 *
 * Moved by card A2b (was bef25c7b…) with the Mesh3D alone: T0 furniture and the split wall bodies.
 * The writer's one change (a `wall:demolish` material) writes nothing for a plan without one.
 */
export const LANEWAY_GLB_SHA256 = "4bcbf8e076e792ab259c4c516398bb259f9b890d26d219f6cf665ce82883b090";
