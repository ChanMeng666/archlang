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
export { buildMesh, DOOR_POSES, FURNITURE_HEIGHT_MM, openLeaf } from "./mesh/build.js";
export type { DoorPose, MeshOptions } from "./mesh/build.js";
export { clipToConvex, cutSector, insideCut, prism, sectorBand, slab2d } from "./mesh/extrude.js";
export type { CutSector } from "./mesh/extrude.js";
export { rectsOf, slabRegion } from "./mesh/slab.js";
export { doorTrim, FLAT_MM, insideOf, OPENING_DETAIL, TrimSite, windowTrim } from "./mesh/openings.js";
export type { ObstacleClass, TrimContext, TrimPart } from "./mesh/openings.js";
export { STAIR_DETAIL, stairDetail, stairRisers, stairSolid } from "./mesh/stair.js";
export type { StairDetail, StairSide, StairSolid } from "./mesh/stair.js";
export {
  assetFor,
  handedAt,
  partShell,
  sectionRing,
  T0_FAMILIES,
  T0_HANDED,
  T0_HEIGHT_MM,
  T0_HUNG_FROM_TOP,
  T0_MATERIALS,
  T0_MOUNT_MM,
  t0LocalParts,
  t0Shells,
} from "./mesh/t0.js";
export type { Part, SectionShape } from "./mesh/t0.js";
export {
  FENCE_PALETTE,
  FINISH_PALETTE,
  FLOOR_FINISH_RULES,
  FLOOR_FINISHES,
  finishColour,
  floorFinish,
  GROUND_PLANE,
  GROUND_ROUGHNESS,
  GROUND_SPLITS,
  GROUND_TINT,
  GROUND_WASH,
  KIND_PALETTE,
  linearRgb,
  MATERIAL_SLOTS,
  PALETTE,
  SITE_PALETTE,
  siteColour,
  slotColour,
  slotGroups,
  STAIR_MATERIAL,
  STAIR_RAIL_MATERIAL,
  TRIM_MATERIAL,
  WALL_CAP_SRGB,
} from "./materials.js";
export type { FloorFinish, GroundTint, KindMaterial, MaterialSlot, SlotMaterial } from "./materials.js";
export {
  CORE_POST_PITCH_MM,
  CORE_POSTS_PER_RUN,
  corePostCount,
  FENCE_HEIGHT_MM,
  FENCE_PROFILES,
  fenceColour,
  fencePieces,
  fencePosts,
  fenceRuns,
  groundColour,
  MAX_FENCE_REPEAT,
  OUTDOOR_MM,
  outdoorColour,
} from "./mesh/outdoor.js";
export type { FenceProfile } from "./mesh/outdoor.js";
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
export { replayFacts } from "./replay/facts.js";
export type { FactsOptions } from "./replay/facts.js";
export { stripAt } from "./replay/strip.js";
export type { ReplayFacts, StripItem } from "./replay/strip.js";
export type { NodeState, ReplayEvent, ReplayState, ReplayView } from "./replay/timeline.js";
export {
  boxOfNodes,
  cameraAtStop,
  cameraStops,
  corners,
  coverage,
  distanceLimits,
  drawingFrame,
  ELEVATION_AZIMUTH,
  ELEVATION_RANGE,
  END_AZIMUTH,
  END_FOV,
  endElevation,
  FILL,
  fitEndCamera,
  frameCamera,
  pivotAbove,
  PRESET_NAMES,
  presetCamera,
  projectBox,
  settledLift,
  START_FOV,
  stopCount,
  takenLens,
  targetBounds,
  ZOOM,
} from "./replay/camera.js";
export type { Box, EndCamera, FrameCamera, Orbit, PresetName, Vec3, ViewScene } from "./replay/camera.js";
