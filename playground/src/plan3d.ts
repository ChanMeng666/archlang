/**
 * The 3D preview's one way from a plan's source to its Mesh3D (card X5), apart from the DOM so a
 * Node test runs it exactly as the page does (`playground/test/glb-export.test.ts`): what the 3D
 * preview shows and what Download GLB writes both come from here.
 *
 * The page passes the package's adapter no options: no `World`, so an `import` does not resolve and
 * the plan is refused (the CLI reads imports from the file system); no `coreVersion` (a Scene3D
 * fact the GLB does not carry); the default curve tolerance; doors closed. The test proves that this
 * writes the CLI `build`'s bytes for every example the page can build.
 */
import { type AdaptResult, adaptPlan, buildMesh, type Mesh3D, type Scene3D } from "@chanmeng666/archlang-3d";

/** The package's adapter over `source`, as the page calls it. */
export function adapt3d(source: string): AdaptResult {
  return adaptPlan(source);
}

/** The whole plan's Mesh3D (every storey, doors closed), as the page builds it. */
export function mesh3d(scene: Scene3D): Mesh3D {
  return buildMesh(scene);
}
