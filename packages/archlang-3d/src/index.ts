/**
 * @chanmeng666/archlang-3d — reads a resolved ArchLang plan into a plan-aligned Scene3D.
 * ArchLang itself draws plans; this package is a separate downstream consumer (ADR 0030) of the
 * core's public seam (ADR 0031). Browser-safe: the Node `World` lives in `./node`.
 */
export { adaptPlan, MIN_CORE } from "./adapter/adapt.js";
export type { AdaptOptions, AdaptResult, Refusal, RefusalCode } from "./adapter/adapt.js";
export { ARCHLANG_3D_VERSION, buildScene3D } from "./scene3d/build.js";
export type { BuildOptions, Storey } from "./scene3d/build.js";
export type * from "./scene3d/types.js";
export { validateScene3D } from "./scene3d/validate.js";
export type { ValidationIssue } from "./scene3d/validate.js";
export { um, umPoint } from "./units.js";
export { hatchGroupKey, mixedHeightJoints, piecesOf, piecesTouch, wallOwnership } from "./walls/ownership.js";
export type { MixedHeightJoint, OwnedWall, Ownership, Piece, Point, Ring } from "./walls/ownership.js";
export { buildMesh, FURNITURE_HEIGHT_MM } from "./mesh/build.js";
export { prism } from "./mesh/extrude.js";
export type { Mesh3D, MeshNode, NodeKind, Shell, Stage } from "./mesh/types.js";
export { authoringOrder, ease, FIXTURE_FAMILIES, keyFrames, PHASE, stateAt, timeline } from "./replay/timeline.js";
export type { NodeState, ReplayEvent, ReplayState } from "./replay/timeline.js";
