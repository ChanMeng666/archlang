/**
 * The GLB entry (`./glb`): `writeGlb` and its naming, for a page that writes the GLB bytes without
 * Node (a "Download GLB" button). The bytes are the ones `./node`'s `writeGlb` and
 * `archlang3d build` write for the same Mesh3D: it is the same function. Its own entry, so
 * glTF-Transform never reaches `.` or `./browser`: a host loads it only where it writes a GLB.
 * The checks (Khronos glTF-Validator) stay in `./node`; `test/browser-safety.test.ts` holds this
 * entry's graph free of Node modules.
 */
export { bodyMaterialName, GLB_GENERATOR, glbNodeName, levelNodeName, nodeExtras, writeGlb } from "./glb/write.js";
export type { Mesh3D, MeshNode } from "./mesh/types.js";
