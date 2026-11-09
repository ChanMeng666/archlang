/**
 * Structured JSON I/O for ArchLang plans — the machine-native channel an
 * LLM uses to author and read a floor plan without touching `.arch` syntax.
 *
 * The shape follows the **RPLAN / DStruct2Design** convention LLMs are demonstrably
 * trained on: `snake_case`, a canonical `room_type` enum, room rectangles, and an
 * `input_graph` adjacency dict keyed on interior-door connectivity. It is versioned
 * (`version: 1`) and additive.
 *
 * Three entry points, all pure, synchronous, deterministic, zero-dependency:
 *  - {@link planFromJson} — validate a JSON plan (no throw; catalogued `E_JSON_*`
 *    diagnostics naming the offending JSON path) and build the equivalent
 *    {@link PlanNode}. It works by emitting canonical `.arch` text and running the
 *    real parser, so every parse-time check is reused. **Not supported** (by design):
 *    scripting (`let`/`for`/`if`/`component`) and `import` — author those in `.arch`; the
 *    exception is a placed component that derives its walls (`components`/`instances`, PS3.9).
 *  - {@link planToJson} — parse + resolve a `.arch` source and project it OUT to the
 *    same shape, enriched with output-only facts (`area`, `floor_polygon`,
 *    `room_count`, `total_area`, `room_types`, `edges`, `input_graph`). Round-trip
 *    law: for a non-scripting, grouped plan, `planFromJson(planToJson(src))` compiles
 *    to byte-identical SVG.
 *  - {@link astToJson} — a faithful, span-bearing projection of a parsed AST (for
 *    `arch ast --json`); scripting nodes appear as their node kind with spans, with
 *    no expansion (so it does not round-trip through {@link planFromJson}).
 *
 * Plus {@link checkGraph} (T3b) — compare an intended adjacency dict against a
 * plan's compiled interior-door connectivity.
 *
 * This module is the entry point and declares nothing itself: the room-type tables live in
 * `plan-json/room-types.ts`, the wire types in `plan-json/types.ts`, `planToJson` in
 * `plan-json/to-json.ts`, the validator in `plan-json/from-json.ts`, the `.arch` emission and
 * `planFromJson` in `plan-json/emit.ts`, `astToJson` in `plan-json/ast-json.ts`, `checkGraph` in
 * `plan-json/check-graph.ts` and the schema in `plan-json/schema.ts`. Nothing here charges the
 * step meter.
 */

export type { RoomType } from "./plan-json/room-types.js";
export {
  ROOM_TYPES,
  USE_TO_ROOM_TYPE,
  ROOM_TYPE_TO_USE,
  roomTypeForUses,
  usesForRoomType,
} from "./plan-json/room-types.js";
export type {
  PointJson,
  WallArcJson,
  WallPointJson,
  PaperJson,
  InstanceMark,
  RoomJson,
  WallsFromRoomsJson,
  WallJson,
  OpeningOnJson,
  OpeningRelationJson,
  OpeningJson,
  FurnitureJson,
  DimJson,
  ColumnJson,
  TitleJson,
  EdgeJson,
  PlanBodyJson,
  ComponentJson,
  InstanceJson,
  PlanJson,
} from "./plan-json/types.js";
export type { PlanJsonDroppedClause, PlanJsonDropped, PlanJsonPage, CarriedInstances } from "./plan-json/to-json.js";
export { buildInputGraph, resolvedToJson, UNPROJECTED_KINDS, planToJson } from "./plan-json/to-json.js";
export { planJsonToArch, planFromJson } from "./plan-json/emit.js";
export { astToJson } from "./plan-json/ast-json.js";
export type { GraphCheck } from "./plan-json/check-graph.js";
export { checkGraph } from "./plan-json/check-graph.js";
export { PLAN_JSON_SCHEMA } from "./plan-json/schema.js";
