/**
 * Share → Export → GLB (public-surfaces card X5; in the Share menu since card PG4): its own chunk,
 * loaded on the first click (actions.ts imports it dynamically, beside plan3d.ts), so glTF-Transform
 * never reaches the startup chunks or the 3D chunk.
 *
 * It writes the GLB the package's `archlang3d build plan.arch -o plan.glb` writes: the same
 * `writeGlb` over the same whole-plan Mesh3D (`plan3d.ts`). `playground/test/glb-export.test.ts`
 * holds the page's path to the CLI's bytes over the examples, and writes with `Math.random`
 * throwing, since the writer's library carries one (reached only when reading). The package
 * exports `writeGlb` from its Node entry only (that entry also reads the file system), but the
 * writer itself is browser-agnostic (glTF-Transform's `WebIO`), so the playground reads its module
 * from source, as it reads the rest of the package. What the browser cannot do is check it: the CLI
 * runs the Khronos glTF validator on every GLB it writes, a Node-only check the playground does not
 * load, and the button's note says so.
 */
import type { Mesh3D } from "@chanmeng666/archlang-3d";
import { writeGlb } from "../../packages/archlang-3d/src/glb/write.js";

/** The file name: the one `saveBlob` gives every other download of the plan, as a GLB. */
export const GLB_FILE_NAME = "floorplan.glb";

/** The GLB of `mesh`: the package's writer with its own generator, as `archlang3d build` writes. */
export function glbBytes(mesh: Mesh3D): Promise<Uint8Array> {
  return writeGlb(mesh);
}

/** Write the GLB of `mesh` and hand it to the browser as a download. */
export async function downloadGlb(mesh: Mesh3D): Promise<void> {
  const blob = new Blob([(await glbBytes(mesh)) as BlobPart], { type: "model/gltf-binary" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = GLB_FILE_NAME;
  a.click();
  URL.revokeObjectURL(a.href);
}
