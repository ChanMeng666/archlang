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
 *
 * Moved by visual-assets cards V1–V3 (was 4bcbf8e0…) with the Mesh3D (the refined T0 furniture)
 * and the writer: a T0 piece's node now holds one primitive per material slot, material
 * `fixture:<slot>` from the shared palette (`src/materials.ts`). A node without slotted shells is
 * written as before: laneway's GLB with its furniture nodes removed hashes to 5d21c0d4… before and
 * after. 47 264 → 110 528 bytes.
 *
 * Moved by visual-assets cards V5/V6, red-team round 1 S3 on PR #461 (was d0c91a31…) with the
 * Mesh3D alone: the stove's oven door is now an `appliance` part with a dark `screen` window (the
 * core's `stove` material, V-D2), so its node gains an `appliance` primitive. With that stove edit
 * undone the GLB hashes to d0c91a31… exactly; the writer is unchanged.
 *
 * Moved by visual-assets card V9 (was 0b934378…) with the Mesh3D (each floor's `extras.finish`)
 * and the writer: every building material reads the one palette the viewer reads
 * (`KIND_PALETTE`, `FINISH_PALETTE`, `materials.ts`) instead of the writer's own massing colours,
 * a floor is written in `floor:<finish>` (laneway: `floor:timber`, `floor:tile`) and a window's
 * frame and glass in `window:frame` and `window:glass` (translucent, as the viewer draws it)
 * instead of one `window`. The binary chunk (every vertex and index) is byte-identical; only the
 * JSON's materials, the primitives' material indices and the three floor nodes' extras moved.
 * 111 908 → 112 436 bytes.
 */
export const LANEWAY_GLB_SHA256 = "fe9df0cb0589599c359f4b3c9c8625cd1baf34a35b1ffa40388475c7f56e0eb5";
