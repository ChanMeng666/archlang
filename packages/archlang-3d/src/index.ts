/**
 * @chanmeng666/archlang-3d — reads a resolved ArchLang plan into a plan-aligned Scene3D.
 * ArchLang itself draws plans; this package is a separate downstream consumer (ADR 0030) of the
 * core's public seam (ADR 0031). Browser-safe: the Node `World` lives in `./node`.
 */
export { adaptPlan, MIN_CORE } from "./adapter/adapt.js";
export type { AdaptOptions, AdaptResult, Refusal, RefusalCode, Warning3D } from "./adapter/adapt.js";
export { ARCHLANG_3D_VERSION, buildScene3D } from "./scene3d/build.js";
export type { BuildOptions, Storey } from "./scene3d/build.js";
export type * from "./scene3d/types.js";
export { validateScene3D } from "./scene3d/validate.js";
export type { ValidationIssue } from "./scene3d/validate.js";
export { um, umPoint } from "./units.js";
export { mixedHeightJoints, piecesOf, piecesTouch, wallOwnership } from "./walls/ownership.js";
export type { MixedHeightJoint, OwnedWall, Ownership, Piece, Point, Ring } from "./walls/ownership.js";
export { buildMesh, FURNITURE_HEIGHT_MM } from "./mesh/build.js";
export { clipToConvex, cutSector, insideCut, prism, sectorBand, slab2d } from "./mesh/extrude.js";
export type { CutSector } from "./mesh/extrude.js";
export { rectsOf, slabRegion } from "./mesh/slab.js";
export { assetFor, T0_FAMILIES, T0_HEIGHT_MM, t0Parts } from "./mesh/t0.js";
export type { Part, PlacedPart } from "./mesh/t0.js";
export { FLOOR_LIFT_UM, FLOOR_OVERLAP_MIN_UM2, floorLifts, floorOverlaps, overlapArea } from "./scene3d/overlap.js";
export type { FloorOverlap } from "./scene3d/overlap.js";
export type { Mesh3D, MeshNode, NodeKind, Shell, Stage } from "./mesh/types.js";
export {
  authoringOrder,
  EXPLODE_GAP_MM,
  ease,
  explodeLifts,
  FIXTURE_FAMILIES,
  keyFrames,
  PHASE,
  stateAt,
  STOP_LEAD,
  storeysOf,
  timeline,
  viewLabel,
  viewMesh,
} from "./replay/timeline.js";
export type { NodeState, ReplayEvent, ReplayState, ReplayView } from "./replay/timeline.js";
export {
  boxOfNodes,
  cameraAtStop,
  cameraStops,
  corners,
  coverage,
  drawingFrame,
  END_AZIMUTH,
  END_FOV,
  endElevation,
  FILL,
  fitEndCamera,
  frameCamera,
  projectBox,
  START_FOV,
} from "./replay/camera.js";
export type { Box, EndCamera, FrameCamera, Orbit, Vec3 } from "./replay/camera.js";
