/**
 * The shapes `describe()` returns: {@link SceneSummary}, the one storey's {@link LevelSummary},
 * and every row and fact block they are built from (moved verbatim from `src/describe.ts`,
 * which re-exports each one, so the public types are unchanged).
 *
 * Invariant: type-only. Nothing here has a runtime value, so importing it adds no edge to the
 * runtime import graph. It holds no code, so it charges nothing to the step meter.
 */

import type { DerivedWallRow, RoomPlacement, OpeningPlacement, FurniturePlacement } from "../ir.js";
import type { CompassWord, FenceStyle, OutdoorKind, Point, RailSide, VerticalDir } from "../ast.js";
import type { GrossAreaReason } from "../analyze/gross-area.js";
import type { DoorKind, WallStatus, WindowKind } from "../grammar/tokens.js";
import type { Diagnostic } from "../diagnostics.js";
import type { AccessGraph, BBox } from "../analyze.js";
import type { PaperOrientation, PaperSize } from "../sheet.js";
import type { CirculationModel } from "../analyze/circulation.js";
import type { SymmetryFacts } from "../analyze/symmetry.js";
import type { SyntaxFacts } from "../analyze/syntax.js";
import type { DependsFacts } from "../analyze/depends.js";
import type { ScheduleRow } from "../sheet-tables.js";
import type { SiteFacts } from "../site.js";
import type { StairTurn, VerticalConnection, VerticalKind } from "../vertical.js";
import type { RectEdge } from "../fixture-orientation.js";
import type { KeepSummary } from "../keep.js";
import type { ClearanceFacts } from "../lint/clearance-facts.js";
import type { QuantityFacts } from "../analyze/quantities.js";

export interface RoomSummary {
  id: string;
  label?: string;
  /** Declared or inferred function(s) of the room (e.g. `["living","kitchen"]`). */
  uses: string[];
  /** Canonical RPLAN-style room category derived from {@link uses}. */
  room_type: string;
  /**
   * Floor area in square metres, rounded to 2 decimals — measured on the room's own shape,
   * which is drawn on wall CENTRELINES, so it runs to the middle of every wall round it.
   */
  area_m2: number;
  /**
   * NET internal area in square metres, rounded to 2 decimals: the room's shape less every
   * part of it a wall's solid covers (each wall's band as drawn, before openings: its
   * faces, caps, mitres and arcs). A wall on the edge takes half of itself out of the room;
   * a wall standing on the floor takes what it stands on. Always `<= area_m2`; equal to it
   * when no wall touches the room. Computed exactly in closed form, or OMITTED (absent)
   * when it cannot be — and then {@link totals}`.net_floor_area_m2` is absent too. The rule:
   * `docs/adr/0027-net-internal-area.md`. Appended beside {@link area_m2}, which is unchanged.
   */
  net_area_m2?: number;
  bbox: BBox;
  /**
   * The room's FLOOR as a closed ring: a rectangle's four corners clockwise from
   * top-left, or — for a `room polygon` — its authored vertices in source order.
   * This, not `bbox`, is the room's actual shape; `bbox` is the vertex extent.
   */
  floor_polygon: { x: number; y: number }[];
  /**
   * A CIRCULAR room's exact centre + radius, present only for `room … circle`.
   * Such a room reports this INSTEAD of a 48-vertex ring: the tessellation is an
   * implementation detail of the grid layer, so `floor_polygon` is `[]` here and
   * `area_m2` is the exact πR². Append-only, like the rest of the summary.
   */
  floor_circle?: { cx: number; cy: number; r: number };
  /** Ids of rooms whose edges touch this one (within the adjacency tolerance). */
  adjacent: string[];
  /** The `place`d instance this room was drawn inside; absent at plan level. */
  instance?: string;
  /** The component {@link RoomSummary.instance} was made from. */
  component?: string;
}

export interface DoorSummary {
  id: string;
  /** The `place`d instance this door was drawn inside; absent at plan level. */
  instance?: string;
  /**
   * The one or two spaces this door connects: room ids, and/or the literal
   * `"exterior"` when the door sits on an outer wall with open space on one side.
   * Read off the host wall: the space one wall thickness either side of its centreline.
   */
  between: string[];
  /** Every room the door's clear span covers on one face of its host wall, when that is
   *  more than one — a partition runs into the doorway. Absent otherwise
   *  (`AccessEdge.straddles`). */
  straddles?: string[];
  width: number;
  /**
   * How a relational opening was placed, as written (ADR 0028 §5): `between a and b at 800
   * from end`, `on r.top`. Never the internal name of a derived host. Present only on a
   * relational opening, so every other payload is byte-identical.
   */
  relation?: string;
  /**
   * The door's kind — emitted **only when it is not the default `hinged`**,
   * so every payload written before kinds existed is byte-identical.
   *
   * It is here because a kind is a SEMANTIC fact, not a drawing one: it decides
   * whether a swing arc exists at all (so which clearance rules can fire), and an
   * agent that has just authored a pocket door has no other way to verify it did.
   * `slide` and `open` are deliberately NOT here — the first is a drafting handedness
   * and the second is purely how far the panel is drawn.
   */
  kind?: DoorKind;
  /**
   * Top of the doorway above this storey's floor, in mm (the vertical datum).
   *
   * Present **only when the plan authored a height clause somewhere** — see
   * {@link SceneSummary.heights}. A door's sill is the floor by definition, so there is no
   * `sill` here to pair with it.
   */
  head?: number;
  /**
   * Where a `between` door landed: the centre of its span on its host wall's centreline, in plan
   * mm, the point `door at (x,y)` would name. Read off the resolved position, so it answers what
   * `from start` counted from (the shared run, not the room). Present only on a door placed
   * `between`, whose position cannot be read off one room's edge, so every other row is byte-identical.
   */
  centreline_at?: Point;
}

export interface WindowSummary {
  id: string;
  /** The room this window serves, or `null` if it sits on no room edge. */
  room: string | null;
  width: number;
  /**
   * How a relational opening was placed, as written (ADR 0028 §5): `between a and b at 800
   * from end`, `on r.top`. Never the internal name of a derived host. Present only on a
   * relational opening, so every other payload is byte-identical.
   */
  relation?: string;
  /** The window on the other wall of a corner, on a window placed `at corner`. Each row keeps its
   *  own wall, `width` and `facing`: a window faces one way. */
  corner_with?: string;
  /**
   * The window's kind, emitted **only when one was written**, so a kind-free window's row is
   * byte-identical. A semantic fact, like a door's: it says whether the window opens and how. The
   * hinge side is not here, as a door's is not: it is a drafting handedness.
   */
  kind?: WindowKind;
  /**
   * **True compass** direction the window's wall faces (the outward normal of its host
   * wall segment), read against the plan's declared `north`.
   *
   * It is computed in two steps. First the PAGE-relative direction: ArchLang geometry is
   * rectilinear and +y is DOWN, so a window on a room's TOP edge points at the top of the
   * page, its bottom edge at the bottom, and so on — when the window has a rectangular
   * host {@link WindowSummary.room} that is whichever of the room's four edges it sits
   * closest to, and otherwise it is the outward face of the host wall segment, found by
   * probing one wall thickness off each of its two faces and taking the side with no room
   * on it (see `windowFacingPage`, `src/site.ts`). Second, that direction is turned
   * by the plan's `north` setting (see {@link northQuarterTurns}): under the default
   * `north up` the page's top IS compass north and the two coincide, but under
   * `north right` compass north points at the page's RIGHT edge, so a right-edge window
   * faces `"N"` and a top-edge one faces `"W"`.
   *
   * Always one of the four; pure and deterministic. This is the direction an intent
   * `windows.facing` assertion is checked against. When the two differ, the page-relative
   * answer is still available as {@link WindowSummary.facingPage}.
   */
  facing: "N" | "S" | "E" | "W";
  /**
   * The PAGE-relative direction the window's wall faces — `"N"` = toward the top of the
   * drawing — before the plan's `north` is applied.
   *
   * Present **only** when the declared `north` actually turns the compass answer (i.e.
   * {@link northQuarterTurns} is non-zero), so a plan on the default `north up` — where
   * this would always equal {@link WindowSummary.facing} — has a byte-identical summary
   * to before. Append-only.
   */
  facingPage?: "N" | "S" | "E" | "W";
  /** Bottom of the glazing above this storey's floor, in mm. Present only when
   *  the plan authored a height clause somewhere — see {@link SceneSummary.heights}. */
  sill?: number;
  /** Top of the glazing above this storey's floor, in mm. Same gating. */
  head?: number;
}

export interface OpeningSummary {
  id: string;
  /** The one or two spaces this cased opening connects (room ids and/or `"exterior"`). */
  between: string[];
  /** As {@link DoorSummary.straddles}: rooms one face of the opening spans, when more than one. */
  straddles?: string[];
  width: number;
  /**
   * How a relational opening was placed, as written (ADR 0028 §5): `between a and b at 800
   * from end`, `on r.top`. Never the internal name of a derived host. Present only on a
   * relational opening, so every other payload is byte-identical.
   */
  relation?: string;
  /** Top of the cased opening above this storey's floor, in mm — by default the
   *  host wall's own height. Present only when the plan authored a height somewhere. */
  head?: number;
  /** As {@link DoorSummary.centreline_at}: only on a cased opening placed `between`. */
  centreline_at?: Point;
}

/**
 * The **vertical datum** of one storey — `describe().heights`.
 *
 * ## Why it is here at all, and why it is gated
 *
 * ArchLang draws a horizontal cut, so heights change nothing in the drawing: a plan with a
 * `height` on every wall renders byte-for-byte identically to the same plan without them.
 * They are FACTS, for the consumers a drawing cannot serve — a 2.5D occupancy slice at a
 * sensor height, a section, an extruded preview — and for an agent that has just authored
 * a 2200 mm parapet and has no other way to confirm it landed.
 *
 * The block is present **only when the source authored at least one `height`, `sill` or
 * `head` clause**, anywhere in the plan: a wall, a storey, an opening, an imported module.
 * That is the `doors[].kind` rule (present only when it is not the default) applied to a
 * whole block, and it is what makes the byte-identity law total — every plan written
 * before this layer existed describes exactly as it did.
 *
 * ## Why the walls are here rather than on a `walls[]` array
 *
 * `describe()` has never reported walls as objects; a room is a space and a wall is the
 * fabric between spaces, and the summary is about spaces. Rather than mint a whole new
 * top-level array to carry one number each, the heights that have nowhere else to live sit
 * here. The opening heights do have somewhere else to live — `doors[]`, `windows[]`,
 * `openings[]` — and are reported there, beside the width they belong with.
 */
export interface WallStatusFacts {
  /** How many walls of the storey have each status (every status listed, zeros included). */
  counts: Record<WallStatus, number>;
  /** Every wall of the storey as drawn, in source order: its id (a derived wall's internal
   *  name), category and status. */
  walls: Array<{ id: string; category: string; status: WallStatus }>;
}

export interface HeightFacts {
  /** This storey's floor-to-floor height in mm: the `level`'s own `height`, else the
   *  plan's, else 3000. What a wall inherits when it declares none. */
  storey_height: number;
  /**
   * This storey's floor above the building's LOWEST floor, in mm — `0` for a
   * single-storey plan and for the ground storey of any plan.
   *
   * The sum of the heights of the storeys below, so a 3600 ground floor puts the first
   * floor at 3600 whatever the storeys above it declare. It is NOT `level ×
   * storey_height`, and a consumer that computes it that way will be wrong on exactly the
   * plans that bothered to declare per-storey heights.
   */
  elevation: number;
  /** The storey's own `level … slab <mm>`: the floor construction under its floor, finish
   *  included. The slab and clear-height keys appear only when the plan writes a `slab` or a
   *  `clear` somewhere (MF-D1, RM-D17). */
  slab?: number;
  /** Floor to ceiling, in mm: the author's `clear`, else this storey's `height` less the `slab`
   *  of the storey above. Never guessed: absent with {@link clear_height_omitted} instead. */
  clear_height?: number;
  /** Where {@link clear_height} came from. */
  clear_height_source?: "authored" | "derived";
  /** Why there is no {@link clear_height}: `single-storey` / `top-storey` (no `clear` written),
   *  `no-slab-above`, `default-storey-height` (no `height` written), `slab-above-too-thick`. */
  clear_height_omitted?: import("../datum.js").ClearHeightOmitted;
  /** Every wall on this storey, in source order, with the height it resolved to. */
  walls: { id: string; height: number }[];
}

export interface FurnitureSummary {
  id: string;
  category: string;
  label?: string;
  /** Declared owning room id (`in <roomId>`), if any. */
  room?: string;
  /**
   * The quarter-turn the drawn symbol carries (0/90/180/270), when it is not 0 — either
   * authored (`rotate`), derived from the backing wall, or carried through a `place`d
   * instance's own turn. Absent for an upright symbol.
   */
  rotate?: number;
  /** The `place`d instance this piece was drawn inside; absent at plan level. */
  instance?: string;
  /** The component {@link FurnitureSummary.instance} was made from. */
  component?: string;
  /** `against <room>.<edge>[ offset <mm>]` as written (ADR 0029 §2); present only on that form. */
  relation?: string;
  /** The `facing <id>` target (ADR 0029 §3); the derived turn is {@link FurnitureSummary.rotate}.
   *  Present only when declared. */
  facing?: string;
  /** The declared `clear front|sides` depths and the depth measured free (ADR 0029 §4), the
   *  smaller side for `sides`. Present only when declared. */
  clear?: { front?: ClearFact; sides?: ClearFact };
}

/** One declared clear zone: the depth the author asked for and the depth measured free (capped
 *  at the declared depth). */
export interface ClearFact {
  declared: number;
  measured: number;
}

/**
 * One run of vertical circulation ON THIS STOREY. Present in the summary only
 * when the storey draws at least one `stair`/`elevator`/`escalator`, so every existing
 * summary is unchanged. The cross-storey view is {@link SceneSummary.vertical}.
 */
export interface VerticalSummary {
  id: string;
  kind: VerticalKind;
  /** `up`/`down` as declared on THIS storey; absent for an `elevator`. */
  dir?: VerticalDir;
  /** The room whose rectangle contains the footprint's centre, or `null`; on a block stair, the
   *  centre of the flight boarded on this storey, because that of its {@link bbox} can stand off the
   *  stair. */
  room: string | null;
  /** The footprint; on a block stair the bounding box of its pieces, which holds floor that is no
   *  stair (read {@link flights} and {@link landings}). */
  bbox: BBox;
  /** Flight width across the run (mm) — `stair` only. */
  flight_width?: number;
  /** A block stair's flights, in climbing order on every storey; absent on any other run. */
  flights?: StairFlightSummary[];
  /** A block stair's landings, in climbing order; absent on any other run. */
  landings?: StairLandingSummary[];
  /** How the last flight climbs from the first, as the person climbing turns: the net of
   *  {@link StairLandingSummary.turn}, so two right turns read `half`. A block stair only. */
  turn?: StairTurn;
}

/** One flight of a block stair. */
export interface StairFlightSummary {
  bbox: BBox;
  /** Its length along its run (mm). */
  run_mm: number;
  /** The edge a person on THIS storey meets it by: its foot on a `dir up` stop, its head on a
   *  `dir down` one. */
  entry: RectEdge;
}

/** One landing between a block stair's flights. */
export interface StairLandingSummary {
  bbox: BBox;
  /** How the person climbing turns on it. */
  turn: StairTurn;
  /** The tapered steps this landing is divided into (`landing … winders <n>`); absent on a
   *  level landing. */
  winders?: number;
}

/**
 * One hole in this storey's floor plate (`void`). Present in the summary only when
 * the storey declares at least one, so every existing summary is unchanged.
 *
 * The room's own `area_m2` is NOT reduced by the void — see `src/elements/void.ts` for
 * why — so a consumer that needs the net floor of a double-height space subtracts
 * `size.w × size.h` here (`area_m2` on a `polygon` void) from the room named by
 * {@link VoidSummary.room}.
 */
export interface VoidSummary {
  id: string;
  /** Top-left of the opening, in mm; on a `polygon` void, of its ring's bounding box. */
  at: Point;
  /** The extent; on a `polygon` void the ring's bounding box, an index and never the hole's
   *  area (that is {@link VoidSummary.area_m2}). */
  size: { w: number; h: number };
  /** The `polygon` spelling only: the ring, as resolved. */
  polygon?: Point[];
  /** The `polygon` spelling only: the hole's area in m², 2 dp, by the exact shoelace. */
  area_m2?: number;
  /** Present only when written: the rectangle's railed sides, or the ring's railed edge
   *  numbers (edge n runs from point n to n+1). `[]` is `rail none`. */
  rail?: RailSide[] | number[];
  /**
   * The room whose FLOOR contains the opening's centre — the poly-aware containment test,
   * never the room's bounding box, so a void inside a courtyard plan's notch is reported
   * as belonging to no room rather than to the U-shaped room whose box surrounds it. On a
   * `polygon` void, the room holding most of its area (by the cells of its ring).
   */
  room: string | null;
}

/**
 * One ground surface (`outdoor`). Present in the summary only when the storey
 * declares at least one, so every existing summary is unchanged.
 *
 * **Its area is NOT part of `totals.floor_area_m2`, and must never become so.** A terrace
 * is not floor area; a lawn certainly is not. The whole-plan floor figure is the number
 * every downstream consumer — the schedule, the intent channel, a brief's assertions —
 * trusts, and quietly adding the garden to it would be wrong in the one place a summary
 * cannot afford to be. The separate {@link SceneSummary.totals}`.outdoor_area_m2` is where
 * the ground is totalled, and a consumer that wants "plot coverage" adds the two itself,
 * having decided that is what it means.
 */
export interface OutdoorSummary {
  id: string;
  /** Which ground surface (`lawn`, `paving`, `balcony`, …). */
  kind: OutdoorKind;
  label?: string;
  /**
   * Area in m², 2 dp — the EXACT shoelace for the `polygon` spelling and w x h for the
   * rectangle, never the bounding box in either case.
   */
  area_m2: number;
  /** The extent, as top-left + size. On a polygon surface this is the ring's bounding
   *  box: a convenience for indexing, never the datum any measurement comes from. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Which edges carry a railing — `balcony` only, and absent on every other kind. An
   *  empty array is a real answer (`rail none`), distinct from the key being absent. */
  rail?: RailSide[];
}

/** One fence run. Present only when the storey declares at least one. */
export interface FenceSummary {
  id: string;
  style: FenceStyle;
  /** Total run length in mm, summed along the segments (plus the closing one). */
  length_mm: number;
  closed: boolean;
}

/**
 * One `section` mark (RM6.1): the cut line as written and the way it looks. Plan-wide, as the mark
 * is: present on the top-level summary only, whichever storey `describeLevel` narrows to.
 */
export interface SectionSummary {
  /** The mark's own name (`A`, `1`): unique among the plan's sections, not an element id. */
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The compass word after `look`. */
  look: CompassWord;
  /** The page direction it looks in, a unit axis vector (+x right, +y down): `look` turned by
   *  the plan's `north`, so a reader need not turn it. */
  toward: { x: number; y: number };
}

/**
 * The building's **vertical connections**: every `stair`/`elevator`/`escalator`
 * id drawn on two or more storeys. Identity is the whole rule — same id, same shaft —
 * so nothing is inferred from geometry (ADR 0005). Present only on a multi-storey plan
 * that actually has one; a run on a single storey is not a connection and is what
 * `W_STAIR_UNMATCHED` reports.
 *
 * `reachable_levels` is the reason this block matters to an agent: a storey with no
 * exterior door of its own is still reachable if a shaft joins it to one that has —
 * which is exactly the reachability `lint` now evaluates per storey.
 */
export interface VerticalReport {
  connections: VerticalConnection[];
  /** Level numbers reachable from the outside once shafts are counted, ascending. */
  reachable_levels: number[];
}

/**
 * One `place`d component instance as a fact: its addressable name — which is also
 * the id namespace of everything inside it — the component it was made from, where its
 * local `(0,0)` landed, and the exact rigid transform applied.
 */
export interface InstanceSummary {
  name: string;
  component: string;
  at: { x: number; y: number };
  rotate: 0 | 90 | 180 | 270;
  mirror?: "x" | "y";
}

/** How a single placed element's position was authored vs derived. */
export interface FreedomElement {
  id: string;
  kind: "room" | "door" | "window" | "opening" | "furniture";
  /** `absolute` = a literal `at (x,y)`; anything else was computed by the
   *  resolver from a higher-level clause (relational/strip/attach/anchor/wall). */
  placement: RoomPlacement | OpeningPlacement | FurniturePlacement;
  /**
   * The `place`d instance this element lives in. When present, `placement`
   * describes how the element was authored **inside its component** — its position ON
   * THE PAGE additionally derives from the instance frame, which is the authored-absolute
   * thing (see {@link SceneSummary.instances}). So: an instance is a degree of freedom,
   * and everything inside it is derived from that one. Absent at plan level, so existing
   * reports are unchanged.
   */
  instance?: string;
}

/**
 * Degrees-of-freedom report: for each placed element, whether its
 * position was authored **absolutely** or **derived** by the resolver — the
 * "how constrained is this plan" fact an agent reads before editing. Facts only
 * (ADR 0005): no advice, no scoring, no thresholds. Counts per family plus one
 * `elements` row each, in `describe()`'s own emission order (rooms, doors,
 * windows, openings, furniture). Openings pools doors + windows + cased openings.
 */
export interface FreedomReport {
  rooms: { total: number; absolute: number; relational: number; strip: number };
  /** `relational` (`between A and B`, `on <room>.<edge>`, ADR 0028 §6) is present only when
   *  the storey has such an opening, so every other report is byte-identical. */
  openings: { total: number; attached: number; absolute: number; relational?: number };
  /** `relational` (`against <room>.<edge>`, ADR 0029 §2) is present only when the storey has
   *  such a piece, so every other report is byte-identical. */
  furniture: { total: number; anchored: number; againstWall: number; absolute: number; relational?: number };
  elements: FreedomElement[];
  /** The walls: how many were derived by `walls from rooms` (ADR 0028 §6), how many were
   *  typed as points, and (`relational`, present only when there is one) how many authored
   *  walls were written `between`/`around` rooms (§4). Present only on a storey that derived a
   *  wall or holds a pairwise one. */
  walls?: { total: number; derived: number; absolute: number; relational?: number };
}

/** One positioning axis as a fact: where the datum is and what it is called. */
export interface AxisSummary {
  /** mm along the axis's own direction (x for a vertical axis, y for a horizontal one). */
  pos: number;
  /** The GB/T label drawn in its bubble — derived from position, never authored. */
  label: string;
}

/**
 * The plan's declared **positioning axes** (定位轴线), in label order: `x` numbered
 * `1 2 3 …` left-to-right, `y` lettered `A B C …` bottom-to-top (so `y[0]` is `A`, the
 * BOTTOM-most axis — +y points down). Absent from the summary entirely when the plan
 * declares no axes, so existing summaries are unchanged.
 */
export interface AxesSummary {
  x: AxisSummary[];
  y: AxisSummary[];
}

/**
 * The sheet facts for a plan that declares `paper`: which sheet, which way
 * round, the operative scale denominator, and whether the building fits on it at that
 * scale. `fits: false` is the `W_SCALE_OVERFLOW` condition — the drawing is still
 * produced, on a page grown past the sheet.
 */
export interface SheetSummary {
  paper: PaperSize;
  orientation: PaperOrientation;
  /** The `<denom>` of `1:<denom>` — authored, or chosen by auto-fit. */
  scale_denominator: number;
  /** True when the denominator was chosen by auto-fit (the plan declared no `scale`). */
  scale_auto: boolean;
  /** Does the BUILDING's outer-face extent fit the sheet's drawing area at this scale? */
  fits: boolean;
  /**
   * `false` when **everything the plan draws** does not fit the sheet's drawing area at
   * this scale — **present only then**. Absent means the whole drawing fits;
   * read it as `sheet.drawing_fits === false`, never as a tri-state.
   *
   * It is the residual {@link fits} cannot report. `fits` measures the BUILDING's
   * outer-face extent, and a plan draws more than its building — `outdoor` ground, a
   * `fence`, a `site … boundary`, a `roof` eaves line — so a 4 × 3 m cottage with a 40 m
   * yard reported `fits: true` with nothing anywhere saying its sheet could not hold the
   * drawing. Same ruler, wider extent: `fits === false` implies this is `false` too, and
   * the case worth acting on is `fits` true with this present, which raises
   * `W_DRAWING_OVERFLOW`.
   *
   * **It is not a claim that the page grew.** Like `fits` it is measured against the area
   * the sheet RESERVES for the drawing, and a marginal overflow eats the reserved margin
   * rather than growing the page — of the three shipped examples that report it, only one
   * is actually issued on a larger page. The page rectangle is `scene.sheet.page`, which
   * needs a laid-out Scene; `describe()` never builds one.
   *
   * **Emitted conditionally on purpose.** An always-present key would move every
   * `describe()` payload for every plan that declares `paper`, which the standing
   * byte-identity law forbids — a plan that does not use a feature must describe exactly as
   * before. This follows `circulation.unmeasured[]`, which omits itself when
   * empty for the same reason.
   */
  drawing_fits?: false;
}

/**
 * One declared **zone** — a wing, a department, a phase — and the rooms it groups.
 *
 * Membership is by DECLARATION, never geometry (ADR 0005): a room is listed here because
 * it was written inside that `zone` block, not because the compiler decided it looks like
 * it belongs there. A zone has no geometric semantics at all — deleting every `zone`
 * wrapper from a plan leaves the drawing byte-identical.
 *
 * **Nesting rolls up.** `rooms` lists the zone's own rooms *plus* every room in a zone
 * nested inside it, so `west` reports the whole west wing even when its rooms are written
 * in `west.galleries` and `west.stores`. That makes the list a rollup, not a partition:
 * **summing `floor_area_m2` over `zones` double-counts** whenever zones nest, and it is
 * not the plan total. `totals.floor_area_m2` remains the one whole-plan figure. (The
 * drawn ROOM SCHEDULE groups by the *innermost* zone instead, so its subtotals do
 * partition the rooms and do add up to its TOTAL.)
 */
export interface ZoneSummary {
  /** The zone's own id — the last segment of {@link path}. */
  id: string;
  /** The printed name from `zone west "West wing"`, when the source gave one. */
  label?: string;
  /** Dotted path from the outermost enclosing zone (`"west.galleries"`). Its identity —
   *  the value `describe --zone` selects on, and what `id` alone cannot disambiguate. */
  path: string;
  /** The storey this zone was declared on, for a multi-storey plan. Absent otherwise. */
  level?: number;
  /** Member room ids in source order — the zone's own rooms and every nested zone's. */
  rooms: string[];
  room_count: number;
  /** Sum of the member rooms' (rounded) areas, in m². See the rollup caveat above. */
  floor_area_m2: number;
}

/**
 * One **storey** of a multi-storey plan as facts: the level number and name plus the exact
 * same fact shape a single-storey plan reports at the top level (rooms, areas, adjacency,
 * access, circulation, totals, freedom, …). So an agent reads `levels[i]` with the code it
 * already has for a whole plan — a storey IS a plan.
 */
export interface LevelSummary extends Omit<SceneSummary, "ok" | "diagnostics" | "levels" | "vertical"> {
  /** The authored storey number (integer; 0/negative legal). */
  level: number;
  /** The storey's name (`level 1 "Ground floor"`), when the source gave one. */
  name?: string;
}

/** The semantic summary of a plan. `ok` is false when fatal errors prevented
 *  resolution; inspect `diagnostics` in that case (the lists will be empty). */
export interface SceneSummary {
  ok: boolean;
  plan: string;
  /**
   * One deterministic natural-language sentence describing the plan, composed
   * purely from the fields below (plan name, room labels/areas, totals, entrance).
   * Feeds the accessible-SVG `<desc>` (`compile(src, { accessible: true })`) and is
   * useful as ready-made alt text. Empty string when the plan failed to resolve.
   */
  caption: string;
  /**
   * Explicit accessible metadata from the plan-level `accTitle "…"` / `accDescr "…"`
   * keywords, when present. In accessible-SVG output these override the plan name in
   * `<title>` and the derived {@link caption} in `<desc>` respectively; here they are
   * surfaced as facts alongside the always-derived {@link caption}. Absent when the
   * plan declares neither, so existing summaries are unchanged.
   */
  accTitle?: string;
  accDescr?: string;
  units: "mm";
  /**
   * The EFFECTIVE drawing scale, e.g. `"1:200"`. Annotation-only on its own; when
   * {@link sheet} is present it is operative (every annotation size derives from it),
   * and it is the scale auto-fit chose if the plan declared none.
   */
  scale?: string;
  /**
   * The sheet the drawing is issued on — present only when the plan declares `paper`.
   * Absent (the default) means reference-dimension sizing: no paper, and `scale` is a
   * title-block annotation. See [the sheet layer](../src/sheet.ts).
   */
  sheet?: SheetSummary;
  /**
   * Overall drawing extent in mm, measured on wall **centerlines** (the union of raw
   * wall points and room rectangles). This is the coordinate space the source is
   * written in — a room's `at`/`size`, a door's `at`, a wall point — so it is the
   * number to reason with when placing elements. Normative and unchanged.
   */
  bbox: { w: number; h: number };
  /**
   * Overall extent in mm measured on the **outer wall faces** — the building as a
   * builder or a GB/T overall dimension sees it: `bbox` plus half a wall thickness at
   * each end (a 7000×6000 centerline plan inside a 200 shell is 7200×6200 outside).
   * This is what `dims auto`'s outermost chain prints. Use `bbox` for authoring
   * coordinates and `bbox_outer` when quoting the building's size.
   */
  bbox_outer: { w: number; h: number };
  /**
   * The plan's positioning axes (定位轴线) — the datum grid every GB/T dimension is read
   * from, with the labels the drawing prints. Present only when the plan declares an
   * `axes` block; read it to know which coordinates are structural datums (and, with
   * `dims auto rooms|all`, what the middle dimension chain measures).
   */
  axes?: AxesSummary;
  /**
   * The direction NAMES the plan's `site` block licenses — `street`/`back` plus the three
   * `_side` names — every one of them a true compass letter, so they read against the same
   * `north` as `windows[].facing`. Present only when the plan declares `site`, so an
   * existing summary is unchanged.
   *
   * **`equator_side` / `sunrise_side` / `sunset_side` are a drafting heuristic, not a
   * measured daylight outcome.** They name an aspect, in closed form, from `street` and
   * `hemisphere` alone; no sun model, latitude or date is involved anywhere. See
   * [the site layer](../src/site.ts).
   */
  site?: SiteFacts;
  /**
   * The `place`d component instances this drawing is made of, in source order:
   * where each one's local origin landed and the rigid transform it carries. Present only
   * when the plan places at least one, so existing summaries are unchanged.
   *
   * This is the block that says WHICH degrees of freedom the plan really has: everything
   * with a matching `instance` field is positioned by its component's own coordinates
   * plus this frame, so moving a wing is one edit here, not N edits inside.
   */
  instances?: InstanceSummary[];
  rooms: RoomSummary[];
  doors: DoorSummary[];
  windows: WindowSummary[];
  /** Leaf-less cased openings and the spaces they connect. */
  openings: OpeningSummary[];
  furniture: FurnitureSummary[];
  /**
   * The vertical-circulation runs drawn on this storey — `stair`, `elevator`,
   * `escalator`. Absent when the storey draws none, so existing summaries are unchanged.
   */
  verticals?: VerticalSummary[];
  /**
   * The holes in this storey's floor plate — `void`. Absent when the storey
   * declares none, so existing summaries are unchanged. A void obstructs circulation and
   * does NOT reduce the containing room's reported area.
   */
  voids?: VoidSummary[];
  /**
   * The ground surfaces outside the building (`outdoor`). Absent when the storey
   * declares none, so existing summaries are unchanged.
   *
   * Ground is reported here and NOWHERE else: it is not in {@link rooms}, not in
   * {@link input_graph}, not in {@link access}, not in {@link circulation}, and its area
   * is not in `totals.floor_area_m2`.
   */
  outdoor?: OutdoorSummary[];
  /** The fence runs. Absent when the storey declares none. A fence is not a
   *  wall: it hosts nothing and joins no graph. */
  fences?: FenceSummary[];
  /**
   * The walls `walls from rooms` derived (ADR 0028 §6): one row per derived wall, with its
   * internal name (`exterior`, `exterior#2`, `A|B`, `A|B#2`; never an id an author can type) and
   * every span an authored wall took over. Absent unless the storey derived a wall.
   */
  derived_walls?: DerivedWallRow[];
  /**
   * The plan's `section` marks (RM6.1), in source order. Absent unless the plan writes one. A
   * whole-plan key: on a multi-storey plan it stands on the top-level summary, never on a
   * `levels[]` entry, and `describeLevel` keeps it.
   */
  sections?: SectionSummary[];
  /**
   * The storey's vertical datum — storey height, elevation, and every wall's
   * height. **Absent unless the plan authored a height, sill or head somewhere**, which
   * is what keeps every summary written before this layer byte-identical. See
   * {@link HeightFacts}; the opening heights ride on `doors[]`/`windows[]`/`openings[]`
   * under the same gate.
   */
  heights?: HeightFacts;
  /**
   * The walls' remodel status (preview-and-remodel B3a): how many walls of the storey are
   * `existing`, `demolish` and `new`, and each wall's status in source order (a wall that writes
   * none is `existing`). **Absent unless a wall on the storey writes `status`**, so every summary
   * of a plan without the clause is byte-identical. Every wall is listed, the demolished ones
   * included, though no other fact of the summary reads a demolished wall: it encloses nothing,
   * hosts nothing and counts in no area, and where it stood between two rooms they are joined
   * (`access.edges` carries the run, named by the wall's id).
   */
  wall_status?: WallStatusFacts;
  /**
   * The modeled access graph: entrances, room reachability/depth from the exterior,
   * and connector edges (doors and cased openings) with estimated clear widths.
   */
  access: AccessGraph;
  /**
   * Circulation facts on a clearance-eroded navigation grid: how far, how wide and
   * how direct the walk is from the entrance to each room, plus key functional
   * routes. Null when the plan has no modeled exterior entrance and no stair, lift or
   * escalator arrives on it from a reachable storey (such a storey is walked from the head
   * of the arriving flight, `entranceId` = the run's id). Coarse & advisory —
   * facts, never a generated layout (ADR 0008).
   */
  circulation: CirculationModel | null;
  totals: {
    rooms: number;
    doors: number;
    windows: number;
    floor_area_m2: number;
    /**
     * GROSS INTERNAL AREA in m², 2 dp: the floor enclosed by the inner faces of the storey's
     * `exterior` walls (authored, or the ring `walls from rooms` derives), joined as the drawing
     * joins them, before any opening is cut. Exact from the shape: each loop's closed-form
     * area, never a bbox. It counts the partitions and any floor no room covers inside the
     * shell, and excludes the shell; a courtyard ring's court is excluded, a court bounded only
     * by partitions is not. Several separate buildings on one storey sum. This, not the
     * centreline `floor_area_m2`, is the "about N m²" a brief means.
     * `src/analyze/gross-area.ts` holds the rule.
     *
     * ABSENT when the storey has no closed exterior ring or the figure cannot be trusted, and
     * then {@link gross_internal_area_omitted} says why: every resolving summary carries exactly
     * one of the two. Like every total here it is THIS storey's: the top level reports the
     * lowest storey, and each `levels[i].totals` its own.
     */
    gross_internal_area_m2?: number;
    /**
     * Why {@link gross_internal_area_m2} is absent, present only then:
     * `no-closed-exterior-ring` (no exterior wall encloses a region: a shell that does not
     * close, a room-only sketch, an open site), `exterior-ring-subdivided` (an exterior wall
     * divides the enclosure, so which side is the building is not stated),
     * `nested-exterior-rings` (something enclosed inside a courtyard ring), `too-much-work` (a
     * counted cap) or `inconsistent`. Never a guess (ADR 0005).
     */
    gross_internal_area_omitted?: GrossAreaReason;
    /**
     * What {@link gross_internal_area_m2} leaves out, present only when it does: the ids of the
     * rooms with floor outside every exterior ring, in source order, on a storey where a ring closes
     * and an open shell stands beside it or off it (`W_EXTERIOR_RING_OPEN`'s reading,
     * `src/analyze/open-shell.ts`), so the figure is a closed porch's or one building's, not the
     * storey's. A room a ring covers in part is listed, and the figure holds the covered part: the
     * list names what is short, not how much. A room whose label says it is open to the sky is not
     * listed. Absent on every other
     * storey, a closed building's and one with no figure alike, and absent past that reading's
     * counted cap. A second key, so the figure and {@link gross_internal_area_omitted} stay exactly one of two.
     */
    gross_internal_area_leaves_out?: string[];
    /**
     * The BUILDING's gross internal area in m², 2 dp: the sum of every storey's
     * {@link gross_internal_area_m2} (each already rounded, the way `floor_area_m2` is summed),
     * equal to it on a single-storey plan. Top-level `totals` only: never inside `levels[i]`,
     * and a summary narrowed to one storey (`describe --level`) does not carry it. ABSENT when
     * any storey's figure is, and then {@link gross_internal_area_all_levels_omitted} names the
     * first such storey and its reason: every resolving whole-plan summary carries exactly one
     * of the two. This is the figure a brief's whole-house "about N m²" binds to.
     */
    gross_internal_area_all_levels_m2?: number;
    /**
     * Why {@link gross_internal_area_all_levels_m2} is absent: the first storey (lowest first)
     * whose figure is omitted, by its `level` number (absent on a plan with no `level`
     * blocks), and that storey's {@link gross_internal_area_omitted} reason.
     */
    gross_internal_area_all_levels_omitted?: { level?: number; reason: GrossAreaReason };
    /**
     * What {@link gross_internal_area_all_levels_m2} leaves out, present only when it does: each
     * storey with a {@link gross_internal_area_leaves_out}, lowest first, by its `level` number
     * (absent on a plan with no `level` blocks). Top-level `totals` only, as that figure is.
     */
    gross_internal_area_all_levels_leaves_out?: Array<{ level?: number; rooms: string[] }>;
    /**
     * Sum of the rooms' {@link RoomSummary.net_area_m2}, rounded to 2 decimals — summed from
     * the same rounded per-room figures, the way `floor_area_m2` is, so the total and the
     * list never disagree by a rounding step. ABSENT when any room's net area is omitted:
     * never a sum over a subset of the rooms.
     */
    net_floor_area_m2?: number;
    /**
     * Total `outdoor` area in m², 2 dp — present ONLY when the storey declares a
     * ground surface, so every existing `totals` object is byte-identical.
     *
     * Deliberately a sibling of `floor_area_m2` rather than a component of it. See
     * {@link OutdoorSummary}: floor area is floor area, and a consumer that wants a plot
     * figure adds the two having decided that is what it means.
     */
    outdoor_area_m2?: number;
  };
  /**
   * Interior-door adjacency dict: every room id → the ids of rooms it shares
   * a door / cased opening with (exterior entrances excluded). Keys in room source
   * order; each neighbour list sorted by room source order. Empty when the plan
   * failed to resolve. The RPLAN-style `input_graph` an intent check compares against.
   */
  input_graph: Record<string, string[]>;
  /**
   * Degrees-of-freedom placement report: which elements were positioned
   * absolutely vs derived by the resolver. Facts only — see {@link FreedomReport}.
   */
  freedom: FreedomReport;
  /**
   * The ROOM SCHEDULE exactly as the sheet draws it — `{ no, id, name, area_m2,
   * net_area_m2 }` per room in source order, so an agent can read the numbered table it just
   * rendered without OCR'ing the SVG. Present **only when the plan sets `schedule rooms`**;
   * absent otherwise, so existing summaries are unchanged. `area_m2` and `net_area_m2` match
   * {@link RoomSummary.area_m2} and {@link RoomSummary.net_area_m2}, and the drawn TOTALs
   * match {@link totals}`.floor_area_m2` and `.net_floor_area_m2`.
   * The `legend` setting has no counterpart here on purpose: it is pure rendering, and
   * every fact it shows (wall materials, furniture categories) is already in `furniture`
   * and the source.
   */
  schedule?: ScheduleRow[];
  /**
   * The plan's declared **zones** — wings, departments, phases — in
   * first-declaration order, with the rooms each groups. Present **only** when the plan
   * declares a `zone` block, so every existing summary is unchanged. See
   * {@link ZoneSummary} for the nesting-rollup caveat.
   */
  zones?: ZoneSummary[];
  /**
   * The plan's **storeys**, ascending by level — present **only** when the plan declares
   * `level` blocks (so every existing summary is unchanged).
   *
   * Every field ABOVE describes the LOWEST storey (page 1), because a storey is what a
   * floor plan is: rooms, adjacency and circulation only mean something within one floor.
   * Read `levels` to see the whole building — `levels[0]` repeats the top-level facts.
   * Diagnostics stay whole-plan (aggregated across storeys, each tagged with its `level`).
   */
  levels?: LevelSummary[];
  /**
   * The BUILDING's vertical connections — which shafts join which storeys, and
   * which storeys that makes reachable from outside. A whole-building fact, so it exists
   * only at the top level (never inside `levels[i]`) and only when the plan is
   * multi-storey AND a run appears on two or more of its storeys. See
   * {@link VerticalReport}.
   */
  vertical?: VerticalReport;
  /**
   * The storey's symmetry group per layer (shell, rooms, full) and its repeated rooms.
   * Present **only when requested** (`facts: ["symmetry"]`). See {@link SymmetryFacts}.
   */
  symmetry?: SymmetryFacts;
  /**
   * Space-syntax metrics on the access graph (depth, mean depth, RA, integration,
   * control, cycle rank). Present **only when requested** (`facts: ["syntax"]`).
   */
  syntax?: SyntaxFacts;
  /**
   * What each element is derived from: the ids it reads (`on`) and the bound names its
   * expressions read (`params`), sorted by element id; the derived walls in their own list.
   * Present **only when requested** (`facts: ["depends"]`). See {@link DependsFacts}.
   */
  depends?: DependsFacts;
  /**
   * What each clearance rule measured on this storey, under the default ruleset: a WC's sides,
   * a tall unit's and a hob's cover of a window, a hob's nearest tall unit, a doorway's clear
   * width and approach, a stair's run and landings (plan-soundness PS2.72). Read through the
   * rules' own measures, so a warning, or its absence, can be checked here. Present **only when
   * requested** (`facts: ["clearances"]`). See {@link ClearanceFacts}.
   */
  clearances?: ClearanceFacts;
  /**
   * This storey's geometric quantities: wall lengths per category (centreline and face), room
   * perimeters (centreline and net), the net floor area (and, with
   * {@link DescribeOptions.wastePct}, that area with waste), door and window counts by kind and
   * width, and wall face areas when the plan authors heights. Geometry only; the convention is in
   * each field name. Present **only when requested** (`facts: ["quantities"]`). See
   * {@link QuantityFacts}.
   */
  quantities?: QuantityFacts;
  /** All problems from parse/link/resolve, with byte spans and codes. */
  diagnostics: Diagnostic[];
  /**
   * The plan's `keep` invariants (ADR 0033), each measured against the resolved plan: one row
   * per keep in source order, every storey's by level and then the plan's (`stacked`), with its
   * signed residual in mm. Present **only when the plan declares a keep**, and last.
   */
  keeps?: KeepSummary[];
}
