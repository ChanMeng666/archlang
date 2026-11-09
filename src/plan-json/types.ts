/**
 * The Plan JSON wire shape (`version: 1`): every row interface and {@link PlanJson} itself. All
 * coordinates are millimetres; areas m² (moved verbatim from `src/plan-json.ts`, which re-exports
 * every name it exported).
 *
 * Invariant: type-only, so importing it adds no edge to the runtime import graph. It holds no
 * code, so it charges nothing to the step meter.
 */

import type { ArcDirWord, AutoDimsMode, CompassWord, FurnitureAnchor, Hemisphere, UseKind } from "../ast.js";
import type {
  DoorHinge,
  DoorKind,
  DoorSlideDir,
  DoorSwingBuilding,
  DoorSwingDir,
  TitleField,
  WallStatus,
  WindowKind,
} from "../grammar/tokens.js";
import type { PaperOrientation, PaperSize } from "../sheet.js";
import type { RoomType } from "./room-types.js";

export interface PointJson {
  x: number;
  y: number;
}

/** `arc (x,y) radius R [cw|ccw] [major]`, on the point the edge arrives at: {@link WallPointJson}. */
export interface WallArcJson {
  radius: number;
  /** As the reader sees it on the sheet. Absent means `ccw`, as in `.arch`; output always writes it. */
  dir?: ArcDirWord;
  /** The long way round. Written only when true. */
  major?: boolean;
}

/**
 * A wall vertex. `arc` says the edge ARRIVING here is curved, so a wall's first point cannot carry
 * one. `x`/`y` stay the edge's end, so a reader that ignores `arc` sees the chord. Absent on every
 * straight edge, so a straight wall's payload is unchanged.
 */
export interface WallPointJson extends PointJson {
  arc?: WallArcJson;
}

/** `paper <size> <orientation>`: the sheet, beside the effective `scale`. */
export interface PaperJson {
  size: PaperSize;
  /** Absent on input means `landscape`, as in `.arch`; output always writes it. */
  orientation?: PaperOrientation;
  /**
   * The plan wrote no `scale`, so the sheet fitted one. The document's `scale` is then that fit, and
   * on input it is not written back, so the way back fits again and stays auto-fitted.
   */
  scale_auto?: boolean;
}

/**
 * The marker on a FLATTENED row of a payload that carries `components`/`instances` (PS3.9):
 * the `place`d instance the row was born inside. Such a row is the instance's element in plan
 * coordinates under its dotted id, for a reader that only wants geometry; on input it is
 * skipped, because the `place` the instance prints re-creates it, so an edit to it is ignored
 * (its `id` must carry the instance's namespace, so a root row cannot be marked and lost by
 * mistake; a dimension has no id). Absent on every other row,
 * and on every row of a payload without `instances`.
 */
export interface InstanceMark {
  instance?: string;
}

export interface RoomJson extends InstanceMark {
  id?: string;
  label?: string;
  room_type: RoomType;
  uses?: UseKind[];
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * An explicit, implicitly-closed simple polygon of ≥3 vertices — the room's
   * floor when it is not a rectangle. Present on OUTPUT for a `room polygon`, and
   * honoured on INPUT, where it replaces `x`/`y`/`width`/`height` (which stay on output
   * as the polygon's bounding box, so a rect-only reader still sees a truthful extent).
   */
  polygon?: PointJson[];
  /** Output-only: floor area in m² (2 dp) — exact (shoelace) for a polygon. Ignored on input. */
  area?: number;
  /** Output-only: the room's floor ring — the rectangle's four corners, or the polygon. */
  floor_polygon?: PointJson[];
}

/** The `walls from rooms` statement, as written (ADR 0028 §3). */
export interface WallsFromRoomsJson {
  exterior: number;
  partition: number;
  except?: string[];
  /** `open [id=] between A and B [width]` clauses: the openings they derive are not
   *  listed in `openings`. */
  open?: Array<{ between: [string, string]; id?: string; width?: number }>;
  /** `between A and B thickness t` clauses. */
  between?: Array<{ between: [string, string]; thickness: number }>;
  /** `status <s>` (B3a): the status of every wall the statement derives. Only when written. */
  status?: WallStatus;
}

export interface WallJson extends InstanceMark {
  id?: string;
  /** Free-form category (e.g. `exterior`, `partition`); also a door/window host ref. */
  category?: string;
  points: WallPointJson[];
  thickness?: number;
  /**
   * How tall the wall stands, in mm (v1.35, the vertical datum layer) — a VERTICAL
   * height, not a plan extent.
   *
   * It is spelled `height` because that is the `.arch` clause it round-trips to, and a
   * model writing this payload has to produce that word. Do not read it as the sibling of
   * {@link RoomJson.height} / {@link FurnitureJson.height}, which are y-axis extents in
   * plan: a wall is a polyline and has no such extent.
   *
   * Emitted only when the plan authored a height somewhere, so every payload written
   * before this layer is byte-identical; honoured on input.
   */
  height?: number;
  /**
   * `status existing|demolish|new` (preview-and-remodel B3a): what becomes of the wall in a
   * remodel. Emitted only when the source writes it, and honoured on input; absent is `existing`.
   * A `demolish` wall is listed here (it is drawn) but encloses nothing, hosts nothing and counts
   * in no area, so it is in no `edges`/`input_graph` fact as a wall.
   */
  status?: WallStatus;
  /** Whether the polyline closes into a loop. */
  closed?: boolean;
  /** Hatch material (omitted when the default poché). */
  material?: string;
  material_scale?: number;
  material_angle?: number;
}

/** Where along a named wall an opening attaches (percentage / mm / `center`). */
export interface OpeningOnJson {
  wall: string;
  at: string;
}

/** {@link OpeningJson.relation}: exactly one of `between` and `edge`. */
export interface OpeningRelationJson {
  between?: [string, string];
  edge?: string;
  at?: string;
}

export interface OpeningJson extends InstanceMark {
  kind: "door" | "window" | "opening";
  id?: string;
  x?: number;
  y?: number;
  /** Wall-attached placement (alternative to `x`/`y`). */
  on?: OpeningOnJson;
  /**
   * A relational placement as written (ADR 0028 §5): `between` two rooms or `edge`, a room
   * edge (`r.top`), with the `at` position text when one is written. Emitted, beside the
   * resolved `x`/`y`, only for a relational opening of the plan itself (one inside a `place`d
   * instance is exported by its coordinates, as every instance element is, and so is one
   * positioned `at axis <label>`, since Plan JSON carries no axes); on input it is
   * the placement `planJsonToArch` writes back, and `x`/`y` are then not needed.
   */
  relation?: OpeningRelationJson;
  width: number;
  /** Host wall by id or category. */
  wall?: string;
  hinge?: DoorHinge;
  swing?: DoorSwingDir;
  /**
   * `swing inward|outward` as written (building-relative), beside the wall-relative `swing` it
   * resolved to. Emitted only for a door of the plan itself that wrote the word (one inside a
   * `place`d instance is exported by its resolved `swing`, as `relation` is by coordinates); on
   * input it is the clause `planJsonToArch` writes back, and `swing` is then not read.
   */
  swing_building?: DoorSwingBuilding;
  /**
   * The door's kind — `door_kind`, not `kind`, because `kind` already discriminates
   * door/window/opening here. Emitted only when it is not the default `hinged`, so
   * every payload a pre-v1.25 plan produces is byte-identical.
   */
  door_kind?: DoorKind;
  /** A window's kind (`window_kind`, for the reason `door_kind` is not `kind`). Emitted only when
   *  one was written, as a window's `hinge` is. */
  window_kind?: WindowKind;
  /** Which way a sliding-family panel travels to open. */
  slide?: DoorSlideDir;
  /** How far the panel is drawn open, 0–1. A drawing fact; nothing measured reads it. */
  open?: number;
  /** `true` on a door inside a reflecting `place` frame — the FRAME's reflection (the IR's
   *  `_mirror`, which a sliding door's track choice reads), not the leaf's handedness.
   *  Absent otherwise; `planJsonToArch` refuses it (`E_JSON_MIRROR`), since source has no
   *  per-door `mirror`. */
  mirror?: boolean;
  /**
   * Bottom of the glazing above this storey's floor, in mm — `window` only. `0` is
   * legal and means a floor-length window. Emitted only when the plan authored a height
   * somewhere; honoured on input.
   */
  sill?: number;
  /** Top of the opening above this storey's floor, in mm. Same gating; must sit
   *  above {@link OpeningJson.sill} and no higher than the host wall. */
  head?: number;
}

/**
 * One fixture.
 *
 * `x`/`y`/`width`/`height` are always the RESOLVED plan-space footprint, so a reader
 * that only wants to know where the piece ended up can stop there. The placement
 * clause beside them — `centered`/`anchor` (with `room`), or `against_wall` — is the
 * one the author WROTE, and it is what `planJsonToArch` re-emits, because a derived
 * coordinate re-authored as `at (x,y)` is re-snapped by `grid` and lands somewhere
 * else (see {@link import("./ir.js").FurnitureAuthored}). A payload carrying both is
 * not contradictory: the clause is the statement, the coordinates are its result.
 *
 * The one place the two frames differ is `against wall`, whose `.arch` `size` is
 * wall-relative (along × depth) while `width`/`height` here stay plan-axis. `rotate`
 * carries the derived quarter-turn, so the emitter un-turns them; a hand-written
 * payload that gives `against_wall` without `rotate` is read exactly as before.
 */
export interface FurnitureJson extends InstanceMark {
  category: string;
  id?: string;
  room?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotate?: number;
  /** `true` on every fixture inside a reflecting `place` frame — the FRAME's reflection,
   *  which the quarter-turn `rotate` cannot carry, not the glyph's handedness, so a
   *  symmetric symbol carries it too. Absent otherwise; `planJsonToArch` refuses it
   *  as the `mirror` clause. */
  mirror?: boolean;
  /** Room-relative placement: centre the fixture inside `room`. */
  centered?: boolean;
  /** Room-relative placement: anchor the fixture to a corner/edge of `room`. */
  anchor?: FurnitureAnchor;
  inset?: number;
  /** Measure the anchored edge(s) from the backing wall's inner FACE rather than the
   *  room rectangle's centerline edge (`anchor <a> flush`). Emitted only when the
   *  author wrote it, so every payload a flush-free plan produces is unchanged. */
  flush?: boolean;
  /** Wall-anchored placement: back the fixture onto a wall by id/category. */
  against_wall?: string;
  segment?: number;
  /** A segment selector as written (`north`, `containing r.left`, PS3.5); `segment` is then
   *  the index it resolved to. Re-emitted in place of the number, so the source round-trips. */
  segment_select?: string;
  offset?: number;
  side?: "left" | "right";
  /** Edge-anchored placement (`against <room>.<edge>`, ADR 0029 §2): the dotted room edge.
   *  `offset` above is its offset; `width`/`height` stay plan-axis, as for `against_wall`. */
  against_edge?: string;
  /** `facing <id>` (ADR 0029 §3): re-emitted instead of the resolved `rotate`. Exported for a
   *  piece of the root plan only; a placed instance's piece exports its `rotate`. */
  facing?: string;
  /** `clear front <mm>` / `clear sides <mm>` (ADR 0029 §4), as declared. */
  clear_front?: number;
  clear_sides?: number;
  label?: string;
}

export interface DimJson extends InstanceMark {
  from: PointJson;
  to: PointJson;
  offset?: number;
  text?: string;
  /** `true` on a dimension inside a reflecting `place` frame — the FRAME's reflection (the
   *  IR's `_mirror`, which sets the side a zero-offset call-out's number reads on).
   *  Absent otherwise; `planJsonToArch` refuses it (`E_JSON_MIRROR`). */
  mirror?: boolean;
}

export interface ColumnJson extends InstanceMark {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One optional string per `TITLE_FIELDS` word. */
export type TitleJson = { [K in TitleField]?: string };

/** One connector edge (output-only), from the modeled door/opening access graph. */
export interface EdgeJson {
  from: string;
  to: string;
  via: "door" | "opening";
  /** `front` when it connects the exterior (an entrance); else `interior`. */
  type: "interior" | "front";
}

/** A component's body as one instance resolved it: the root's row arrays, in LOCAL names
 *  and coordinates (PS3.9). */
export interface PlanBodyJson {
  rooms: RoomJson[];
  walls: WallJson[];
  walls_from_rooms?: WallsFromRoomsJson;
  openings: OpeningJson[];
  furniture: FurnitureJson[];
  dims?: DimJson[];
  columns?: ColumnJson[];
}

/** `component <name>() { … }`, carried as its resolved body (no parameters: the arguments are
 *  already applied, and every instance of it resolved to this one body). */
export interface ComponentJson {
  name: string;
  body: PlanBodyJson;
}

/** `place <component>() as <name> at (x,y) [rotate r] [mirror m]`; the fields of
 *  `describe().instances`. */
export interface InstanceJson {
  name: string;
  component: string;
  at: PointJson;
  rotate?: 90 | 180 | 270;
  mirror?: "x" | "y";
}

export interface PlanJson {
  version: 1;
  plan: string;
  units: "mm";
  grid?: number;
  /** The effective scale: as written, or the one the sheet fitted ({@link PaperJson.scale_auto}). */
  scale?: string;
  /** The sheet. Emitted only when the plan declares `paper`, so every other payload is unchanged. */
  paper?: PaperJson;
  north?: "up" | "down" | "left" | "right" | { deg: number };
  /**
   * `site { street … [hemisphere …] }` — the building's relation to its street. Emitted
   * only when the plan declares one, so every existing payload is byte-identical, and
   * accepted on input because Plan JSON is a ROUND-TRIP surface: without it
   * `compile --from-json` would silently drop the site and every derived fact with it.
   */
  site?: { street: CompassWord; hemisphere?: Hemisphere };
  /**
   * `dims auto [overall|rooms|walls|all]` — which automatic dimension chains the render
   * draws. A plan-level SETTING, like `grid`/`scale`/`north`/`site`, and emitted only when
   * the plan declares one, so every pre-existing payload is byte-identical. It is here
   * because it is load-bearing on OUTPUT: the chains it synthesizes grow the drawing
   * extent, so dropping the word silently reflows the whole sheet (a plan that declares
   * `dims auto all` and one that declares nothing render different bytes with no
   * diagnostic). `dims[]` beside it is the unrelated list of EXPLICIT `dim` statements;
   * the two compose exactly as they do in `.arch`.
   */
  dims_auto?: AutoDimsMode;
  /**
   * The plan's default floor-to-floor storey height, in mm — the `height <mm>`
   * plan setting. Emitted only when the plan authored a height somewhere, so every
   * existing payload is byte-identical, and accepted on input because Plan JSON is a
   * ROUND-TRIP surface: without it `compile --from-json` would silently drop the datum and
   * hand every wall the 3000 default back.
   *
   * Plan JSON is a SINGLE-STOREY projection (the lowest level of a multi-storey plan), so
   * there is no per-level height here and no elevation.
   */
  storey_height?: number;
  /** Output-only enrichments (ignored on input). */
  room_count?: number;
  total_area?: number;
  room_types?: RoomType[];
  rooms: RoomJson[];
  walls: WallJson[];
  /**
   * The `walls from rooms` statement (ADR 0028 §3), as written: present only on a plan that
   * has one. The walls it derives are NOT in `walls` (they have no author-facing id); a
   * consumer that needs them reads `describe().derived_walls` or re-derives them.
   */
  walls_from_rooms?: WallsFromRoomsJson;
  openings: OpeningJson[];
  furniture: FurnitureJson[];
  dims?: DimJson[];
  columns?: ColumnJson[];
  /**
   * The components the plan's `place`d instances were made from, each as its resolved body
   * (PS3.9). Emitted, with {@link PlanJson.instances} and the rows' `instance` markers, only on
   * a storey where a placed instance derives its walls (`walls from rooms`), so every other
   * payload is unchanged; on input each prints as a `component` and each instance as a `place`.
   */
  components?: ComponentJson[];
  /** The `place`d instances, in source order; present exactly when `components` is. */
  instances?: InstanceJson[];
  title?: TitleJson;
  /** Output-only: connector edges from the access graph. */
  edges?: EdgeJson[];
  /** Output-only: interior-door adjacency dict, keyed by room id. */
  input_graph?: Record<string, string[]>;
}
