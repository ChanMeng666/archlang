/**
 * Intermediate representation + `resolve(ast)`.
 *
 * `resolve` is the single place semantics live: it grid-snaps coordinates,
 * assigns ids, hosts openings, and runs semantic checks — producing a NEW
 * immutable IR (the input AST is never mutated). `render` consumes IR only.
 */

import type {
  AstElement,
  ComponentDef,
  DoorNode,
  ElementKind,
  ExprPoint,
  FenceStyle,
  FurnitureAnchor,
  FurnitureNode,
  OutdoorKind,
  RailSide,
  LevelNode,
  NorthDir,
  OpeningNode,
  PlaceNode,
  PlanNode,
  Point,
  RelAlign,
  RelDir,
  RoomNode,
  SiteNode,
  Statement,
  StripNode,
  TitleNode,
  UseKind,
  VerticalDir,
  WindowNode,
} from "./ast.js";
import type {
  DoorHinge,
  DoorKind,
  DoorSlideDir,
  DoorSwingBuilding,
  DoorSwingDir,
  WallStatus,
} from "./grammar/tokens.js";
import { moduleBindings } from "./import.js";
import { placeRelational } from "./layout.js";
import {
  beforeRoomsReader,
  functionBodyReader,
  buildDatumTable,
  type DatumTable,
  tableReader,
  type TableReaderOpts,
} from "./room-datums.js";
import { numberAxes } from "./axes.js";
import type { Frame } from "./frame.js";
import { composeFrame, makeFrame, tryTransformElement } from "./frame.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Env, EnvFallback, Expr, Value } from "./expr.js";
import { fmt3, MODEL_RANGE_MM, maxScaleDenominator, outOfRangeDiagnostic } from "./num-format.js";
import {
  asBool,
  asNum,
  asStr,
  atStackRoot,
  BUDGET_SUBSTITUTE,
  chargeSteps,
  closest,
  currentStepSite,
  DIAGNOSTIC_STEPS,
  enterStack,
  EXPAND_RESERVE,
  EXPAND_UNITS,
  evalExpr,
  exprSpan,
  firstOverflow,
  leaveStack,
  MAX_EVAL_STEPS,
  resetOverflowReports,
  setEnvFallback,
  type StepLimitSignal,
  stepSite,
  withDatumReader,
  withStepMeter,
} from "./expr.js";
import type { Theme } from "./theme.js";
import type { ResolveCtx, Registry } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import type { World } from "./world.js";
import { NULL_WORLD } from "./world.js";
import { idToken } from "./identity.js";
import type { WallSegment } from "./geometry.js";
import type { Arc } from "./geometry/arc.js";
import type { Side } from "./algebra/d4.js";
import { extendBounds, hostInfoForWalls, outerFaceBounds, segmentsOfWall, WallGrid } from "./geometry.js";
import type { LevelStamp } from "./chrome-layout.js";
import { titleRows } from "./chrome-layout.js";
import type { ResolvedSheet, SheetFitInput } from "./sheet.js";
import { drawingBounds, paperMm, renderSizes, resolveSheetSpec, scaleDenominator, usablePlanMm } from "./sheet.js";
import { hatchOf, hatchTileMm } from "./hatches.js";
import { elevationOf, heightRangeDiagnostic, isDrawableHeight, plansAuthorHeights, STOREY_HEIGHT } from "./datum.js";
import { planTableRows } from "./sheet-tables.js";
import type { GridBox } from "./geometry/grid-index.js";
import { GridIndex } from "./geometry/grid-index.js";
import { countOverlappingRectPairs, rectsOverlap } from "./geometry/rect.js";
import {
  effectiveVertices,
  polygonArea,
  polygonSelfIntersects,
  polygonsOverlap,
  rectRing,
} from "./geometry/polygon.js";
import { BUILTIN_NAMES } from "./builtins.js";
import { idSpanOf } from "./parser.js";
import { roomOverlapNamer } from "./naming.js";
import { classifyLabelUses } from "./vocabulary.js";
import {
  evaluateKeeps,
  evaluateStacked,
  expandKeep,
  type KeepPlace,
  type KeepRecord,
  type KeepResult,
  type KeepSink,
  type StackedStorey,
  violationOf,
} from "./keep.js";
import type { KeepNode } from "./ast.js";
import { keepFormText } from "./statement-print.js";

export interface RBase {
  kind: ElementKind;
  id: string;
  span?: Span;
  /**
   * Dotted path of the innermost `zone` block this element was written inside
   * (`"west"`, `"west.galleries"`), or absent when it sits in no zone. Pure declared
   * metadata — read by `describe().zones` and the grouped room schedule, never by any
   * geometry. Internal: set during resolve, never serialized into the Scene/SVG/exports
   * (the `_` prefix keeps it out), so a zoned plan renders byte-identically to the same
   * plan with the wrappers deleted.
   *
   * A `place`d instance IS implicitly a zone (see {@link RBase._instance}), so an element
   * inside one carries the instance path here too — an author who composes by wing gets
   * the grouping for free from the composition already written.
   */
  _zone?: string;
  /**
   * The `place … as <name>` instance this element was born inside (dotted for a nested
   * one), or absent at the root — which includes every legacy bare component call.
   * Internal: set when the instance is transformed into plan coordinates, surfaced by
   * `describe()`, never serialized into the Scene/SVG/exports (the `_` prefix keeps it out).
   */
  _instance?: string;
  /** The component {@link RBase._instance} was made from. Internal, as above. */
  _component?: string;
  /**
   * The `.arch` file this element's {@link RBase.span} — and every fix edit derived from
   * it — is measured in, when the statement came in through an `import`. Absent = the
   * compiled source, which is the overwhelmingly common case.
   *
   * This is the resolve-stage {@link import("./ir.js").Entry.file} carried past the element
   * boundary, where it used to be dropped. It exists because LINT runs after resolve and so
   * never passes through `stampProvenance`: without it a lint fix on an imported element
   * carries no `Diagnostic.file`/`FixSuggestion.file`, and `applyFixes` — which skips
   * exactly on that field — spliced the module's offsets into the middle of the IMPORTER's
   * source. Internal: set during resolve, never serialized into the Scene/SVG/exports (the
   * `_` prefix keeps it out), so a plan with no `import` is byte-identical everywhere.
   */
  _file?: string;
}

/**
 * A `zone` block as the resolver sees it: the declaration, not its contents. Zones are
 * collected in first-declaration order during expansion (a `zone` re-opened by a `for`
 * loop is recorded once), so the list is deterministic.
 */
export interface RZone {
  /** The zone's own id — the last segment of {@link path}. */
  id: string;
  /** Dotted path from the outermost enclosing zone (`"west.galleries"`). Its identity. */
  path: string;
  /** Printed name from `zone west "West wing"`, when the source gave one. */
  label?: string;
  /**
   * True when this zone is a `place`d instance's IMPLICIT namespace rather than an
   * author-written `zone` block.
   *
   * An instance is a zone so that `describe().zones` and `describe --zone <name>` can
   * address its contents without a second bookkeeping path — and that stays exactly as it
   * was. What it must NOT be is a **grouping level in a table**: a plan that places one
   * consult room six times printed six one-row groups with six subtotals, which is why
   * `examples/clinic.arch` shipped a `legend` and no `schedule`. The room schedule reads
   * this flag and groups by the innermost zone the AUTHOR declared instead (see
   * `groupRoomsByZone` in `sheet-tables.ts`).
   */
  instance?: boolean;
}

/**
 * A `place`d component instance as a resolved FACT: where its local origin landed in plan
 * coordinates and which rigid transform it carries. Not a {@link ResolvedElement} — an
 * instance draws nothing of its own; it is the frame its contents were drawn in.
 */
export interface RInstance {
  /** Dotted instance path — also the id namespace of everything inside it. */
  name: string;
  component: string;
  /** Where the component's local `(0,0)` landed, in plan coordinates. */
  at: Point;
  rotate: 0 | 90 | 180 | 270;
  mirror?: "x" | "y";
}

/** An opening (door/window) registered on a wall — voids the wall solid. */
export interface Opening {
  /** Centre point of the opening (on the wall centerline). */
  at: Point;
  /** Opening width along the wall. */
  width: number;
  /**
   * Which of the three opening elements this is. Append-only, and the wall
   * lowering does not read it: the hole a door cuts and the hole a window cuts are the
   * same hole.
   *
   * It is here because the {@link Opening} list is the ONLY place a wall knows what is in
   * it, and the vertical datum makes that worth knowing — a 2.5D slice through a wall at
   * a given height has to ask whether each hole is a door (open from the floor) or a
   * window (open between {@link sill} and {@link head}).
   */
  kind?: "door" | "window" | "opening";
  /** The opening element's own id, so a consumer can join this back to `describe()`. */
  ownerId?: string;
  /** Bottom of the opening above this storey's floor, in mm. `0` for a door and a cased
   *  opening; the glazing's sill for a window. */
  sill?: number;
  /** Top of the opening above this storey's floor, in mm. */
  head?: number;
}

export interface RWall extends RBase {
  kind: "wall";
  category: string;
  thickness: number;
  /** Resolved hatch material (always a known material; defaults to "poche"). */
  material: string;
  /** Hatch tile-size multiplier (default 1). */
  hatchScale: number;
  /** Extra hatch rotation in degrees (default 0). */
  hatchAngle: number;
  points: Point[];
  /**
   * Solved curved edges, indexed by SEGMENT index: entry `k` is the arc from
   * `points[k]` to `points[k+1]`. Solved ONCE here at resolve (centre, radius, signed
   * sweep) so no consumer re-derives a curve. Absent for an all-straight polyline, so
   * a straight wall's bytes do not depend on arcs existing.
   */
  arcs?: Array<Arc | undefined>;
  closed: boolean;
  /**
   * How tall this wall stands, in mm (the vertical datum layer) — **always
   * resolved**, never absent: the authored `height` clause, else this storey's height,
   * else the plan's, else {@link import("./datum.js").STOREY_HEIGHT}.
   *
   * It is a required number rather than an optional one on purpose. An optional field
   * makes every consumer re-implement the fallback chain, and the fallback is exactly the
   * thing that must not have two implementations. Nothing in scene-build reads it, so a
   * plan that declares no height renders the same bytes with a 3000 sitting here.
   *
   * Deliberately NOT grid-snapped. `grid` snaps plan coordinates so rooms line up with
   * each other; a storey height shares no axis with them, and snapping `height 2850` to a
   * 100 mm grid would silently redraw the section nobody asked for.
   */
  height: number;
  /**
   * True when {@link RWall.height} came from this wall's OWN `height` clause rather than
   * being inherited from the storey or the plan.
   *
   * It exists for one diagnostic. `E_OPENING_ABOVE_WALL` fires once per opening, and when
   * the wall inherited its height the author's mistake is a plan-level `height`, not any
   * of the openings named in the errors — so the message has to say where the number
   * really came from or it sends them to the wrong line. Internal: set during resolve,
   * never serialized into the Scene/SVG/exports (the `_` prefix keeps it out).
   */
  _heightAuthored?: boolean;
  /**
   * `status existing|demolish|new` as written on the wall, or on the `walls from rooms` statement
   * that derived it (preview-and-remodel B3a). Absent unless written; absent is `existing`. A
   * `demolish` wall is drawn (B3b) but is left out of {@link ResolvedPlan.walls} and
   * {@link ResolvedPlan.elements}: it encloses nothing, hosts nothing and counts in no area.
   */
  status?: WallStatus;
  /** Byte span of an authored hatch `scale` EXPRESSION (a bare literal has none), so the
   *  drawn-tile range check (`checkDrawnSizes`) blames the clause. Internal; never in the
   *  Scene/SVG/exports (the `_` prefix keeps it out). */
  _hatchScaleSpan?: Span;
  /** Openings (doors/windows) hosted on this wall; subtracted from its solid. */
  openings: Opening[];
  /** True when this wall's `id` was author-declared, not an assigned positional
   *  auto-id (`<category>_<n>`). Lets `suggestTopology` reference the wall by a
   *  STABLE ref that can't re-bind. Internal: set during resolve, never serialized
   *  into the Scene/SVG/exports (the `_` prefix keeps it out). */
  _idAuthored?: boolean;
  /**
   * Present only on a wall DERIVED by a `walls from rooms` statement (ADR 0028 §3), never on
   * an authored one. Such a wall has no author-facing id: its {@link RBase.id} is an internal
   * name no identifier can spell (`exterior`, `exterior#2`, `A|B`, with `~2`… for a run an
   * authored wall split off), and its {@link RBase.span} is the statement's. So a lint fix or
   * hint never quotes it and never edits its span, `arch fix`/`suggest` never emit it, and
   * `roof overhang` counts only the outer ring. Internal (the `_` prefix keeps it out of the
   * SVG and the exports; the Scene carries `from` and an empty `open` on an `open between` run,
   * for the joinery alone, and nothing is promised about it).
   */
  _derived?: {
    from: "rooms";
    /** Rings only: the outer ring, or a courtyard ring. */
    ring?: "outer" | "inner";
    /** Partitions only: the two rooms it stands between, in source order. */
    between?: [string, string];
    /** Partitions only: the run is voided by an `open between` clause (its span), so a
     *  relational `door|opening between` the pair is refused (`E_WALL_BETWEEN_OPEN`). */
    open?: { span?: Span };
  };
  /**
   * Present only on an AUTHORED wall written in a pairwise form (ADR 0028 §4): the rooms as
   * written (namespaced inside a `place`), `between` two or `around` a list. The wall is an
   * ordinary authored wall otherwise (its own id, span and hosting); this is read only by
   * `describe()` (`derived_walls[]`, `freedom.walls.relational`). Internal.
   */
  _relation?: WallRelation;
}

/** A pairwise wall's relation as written ({@link RWall._relation}). */
export type WallRelation = { between: [string, string] } | { around: string[] };

/** A resolved relational-placement constraint carried on an unplaced room until
 *  `placeRelational` computes its absolute `at` in dependency order. */
export interface RelConstraint {
  dir: RelDir;
  /** Id of the reference room this one is placed against. */
  ref: string;
  align?: RelAlign;
  /** Resolved spacing (mm) along the placement axis. */
  gap: number;
  span?: Span;
}

/**
 * How an element's position was authored vs derived by the resolver — the
 * degrees-of-freedom marker read by `describe().freedom` (facts only, ADR 0005).
 * Internal: set during resolve, never serialized into the Scene/SVG/exports.
 */
export type RoomPlacement = "absolute" | "relational" | "strip";
/** `relational`: `between <A> and <B>` or `on <room>.<edge>` (ADR 0028 §5, §6). */
export type OpeningPlacement = "attached" | "absolute" | "relational";

/** A relational opening's placement as written (ADR 0028 §5): `between <a> and <b>` or `on
 *  <room>.<edge>`, and its `at` position text (absent when none is written). */
export interface OpeningRelation {
  between?: [string, string];
  edge?: string;
  at?: string;
}
export type FurniturePlacement = "anchored" | "against-wall" | "absolute" | "relational";

/**
 * The furniture placement an author actually WROTE, with every expression already
 * evaluated — the room-relative or wall-anchored clause, never the coordinate it
 * resolved to.
 *
 * It exists because a projection that re-emits a DERIVED position as an authored
 * `at (x,y)` is not a faithful projection: `grid` snaps the numbers an author writes,
 * so a derived coordinate that is not already on the grid MOVES
 * on the way back in. Carrying the clause lets `planToJson` hand back the statement
 * rather than its result, so the round-trip re-derives the same position instead of
 * re-snapping a different one. Internal: set during resolve, never serialized into
 * the Scene/SVG/exports, and dropped when an element crosses a `place` frame (see
 * `transformElement` — the clause names local ids in local coordinates).
 */
export type FurnitureAuthored =
  | { mode: "centered" }
  | { mode: "anchor"; anchor: FurnitureAnchor; inset?: number }
  | {
      mode: "against";
      wall: string;
      segment?: number;
      offset?: number;
      side?: "left" | "right";
      /** A segment selector as written (`north`, `containing r.left`); `segment` is then the
       *  index it resolved to (PS3.5), absent when it resolved to none. */
      segmentSelect?: string;
    }
  | { mode: "against-edge"; edge: string; offset?: number };

export interface RRoom extends RBase {
  kind: "room";
  /** Top-left of the room. For a {@link RRoom.poly} room this is the ring's BOUNDING
   *  BOX corner, so a rect-shaped consumer still reads a truthful extent. */
  at: Point;
  /** Extent of the room — the ring's bounding box for a {@link RRoom.poly} room. */
  size: { w: number; h: number };
  /**
   * The room's floor as an explicit, implicitly-closed simple polygon (`room polygon
   * (x,y) …`). Absent for a rectangular room, which is what keeps every existing
   * plan byte-identical: a consumer must read this before assuming `at`/`size` IS the
   * floor. Vertices are grid-snapped, in source order, with no repeated last point.
   */
  poly?: Point[];
  /**
   * A CIRCULAR floor (`room circle at (cx,cy) radius R`) — the exact centre and
   * radius. When present, {@link RRoom.poly} also holds the 48-gon tessellation (so every
   * ring consumer works unchanged) and `at`/`size` the bounding box; the AREA must be
   * taken from this in closed form (πR²), never from the tessellation.
   */
  circle?: { c: Point; r: number };
  /** Explicit label/area anchor (`label "…" at (x,y)`); absent = the derived centre.
   *  Recorded for EVERY room shape — dropping a rectangle's would silently disable both
   *  the anchor and `W_ROOM_LABEL_OUTSIDE` there. */
  labelAt?: Point;
  /** Byte span of the `at (x,y)` clause behind {@link RRoom.labelAt}, so a diagnostic
   *  raised about it blames the clause and not the whole `room` statement. Recorded on
   *  the RECTANGULAR paths only, because they are the ones whose containment check is
   *  deferred out of the resolver — a relational room does not know its own floor until
   *  {@link placeRelational} runs, and by then the AST node is gone. Internal; never
   *  rendered, never in `describe()`. */
  _labelAtSpan?: Span;
  label?: string;
  /** Declared function(s) from `uses …`; absent when the room is untagged. */
  uses?: UseKind[];
  /** Present only when the room used a relational clause (`right-of`/…); its
   *  `at` above is a placeholder until {@link placeRelational} resolves it. */
  _rel?: RelConstraint;
  /** Set by {@link placeRelational} on a room that ended without a real position (failed,
   *  unplaced or on a cycle). Survives the instance transform so an enclosing pass treats
   *  it as unplaced; `checkRoomOverlaps` skips it. Internal; never rendered. */
  _unplaced?: true;
  /** How the position was authored (`absolute` `at`, `relational` clause, or
   *  `strip` sugar). Internal marker for `describe().freedom`; never rendered. */
  _placement?: RoomPlacement;
  /** True when this room's `id` was author-declared, not an assigned positional auto-id
   *  (`room_<n>`, which shifts when a room is inserted before it). Lets `diffPlans` tell a
   *  stable id from a positional one without guessing from the id's spelling. Internal:
   *  set during resolve, never serialized into the Scene/SVG/exports or `describe()`. */
  _idAuthored?: boolean;
}
export interface RDoor extends RBase {
  kind: "door";
  at: Point;
  width: number;
  hinge: DoorHinge;
  swing: DoorSwingDir;
  host: WallSegment | null;
  /** The author wrote this door's `id=` (set only then). Read by lint's door–door hint, which
   *  quotes an id only when the author wrote one. Internal. */
  _idAuthored?: true;
  /**
   * The door's kind, present ONLY when it is not the default `hinged` — so every
   * kind-free door (and every explicit `door hinged …`) carries no field
   * at all and every downstream payload is byte-identical. A kind changes what is
   * drawn in the reveal and whether a swing arc exists; it changes nothing else
   * (the wall boolean, the opening cover, adjacency and the walk-through landing
   * are all kind-independent by contract).
   */
  doorKind?: DoorKind;
  /** Which way the panel travels to open, along the host wall's traversal direction.
   *  Present only on a non-hinged door (defaulted at resolve). */
  slide?: DoorSlideDir;
  /** How far the panel is DRAWN open, 0–1. Present only on a non-hinged door. A
   *  drawing fact: no measured output may read it (see `E_DOOR_OPEN_RANGE`). */
  open?: number;
  /**
   * This door's instance frame REFLECTS (`place … mirror`). XOR-composed by `door.transform`.
   * Read only by a `sliding` door, whose fixed panel's track is the product of `slide` and the
   * wall's LEFT normal — a handed choice a reflection reverses while `slide` (measured along
   * the traversal) does not. Internal; never reaches `describe()` or Plan JSON.
   */
  _mirror?: true;
  /**
   * `swing inward|outward` as written, present only when written on a kind that takes `swing`.
   * `swing` above is already the wall-relative word it resolved to, which is all the drawing,
   * `describe()` and `lint()` read; this is kept only so Plan JSON can export the word as written
   * (`swing_building`). Frame-invariant, so a `place` frame carries it unchanged.
   */
  _swingBuilding?: DoorSwingBuilding;
  /** Byte span of the authored `slide` clause, or the zero-width insertion point —
   *  see {@link import("./ast.js").DoorNode.slideSpan}. Internal: never in the Scene. */
  _slideSpan?: Span;
  /** `attached` (`on <wall> at <pos>`) vs `absolute` (`at (x,y)`) vs `relational`
   *  (`between A and B …`, `on <room>.<edge> …`). Internal marker for `describe().freedom`;
   *  never rendered. */
  _placement?: OpeningPlacement;
  /** A relational opening's placement as written (`between a and b at 800 from end`, `on
   *  r.top at center`), in the frame it is written in: `describe()`, hints and Plan JSON quote
   *  it, never the internal name of its derived host. Internal. */
  _relation?: OpeningRelation;
  /**
   * The whole `door` statement re-emitted with the hinge on the OTHER jamb — the
   * machine-applicable fix text for `W_SWING_OBSTRUCTED`. Computed in `door.resolve`
   * (the only place the AST node is in scope) and read by `doorHingeFlipFix`; absent
   * for a door with no span. Internal: never reaches the Scene, so it changes no bytes.
   */
  _flipHingeText?: string;
  /**
   * Top of the doorway above this storey's floor, in mm — always resolved, the
   * authored `head` clause or {@link import("./datum.js").DOOR_HEAD}. A door's sill is
   * `0` by definition (you walk through it), so there is no `sill` here.
   */
  head: number;
}
export interface RWindow extends RBase {
  kind: "window";
  at: Point;
  width: number;
  host: WallSegment | null;
  /** The author wrote this window's `id=` (set only then). Read by `W_HOB_UNDER_WINDOW`'s hint,
   *  which quotes an id only when the author wrote one. Internal. */
  _idAuthored?: true;
  /** `attached` vs `absolute` — see {@link RDoor._placement}. */
  _placement?: OpeningPlacement;
  /** See {@link RDoor._relation}. */
  _relation?: OpeningRelation;
  /** Bottom of the glazing above this storey's floor, in mm — always resolved,
   *  the authored `sill` or {@link import("./datum.js").WINDOW_SILL}. */
  sill: number;
  /** Top of the glazing, in mm — the authored `head` or
   *  {@link import("./datum.js").WINDOW_HEAD}. Always above {@link RWindow.sill}. */
  head: number;
}
export interface ROpening extends RBase {
  kind: "opening";
  at: Point;
  width: number;
  host: WallSegment | null;
  /** `attached` vs `absolute` — see {@link RDoor._placement}. */
  _placement?: OpeningPlacement;
  /** See {@link RDoor._relation}. */
  _relation?: OpeningRelation;
  /**
   * Present only on an opening an `open between` clause of `walls from rooms` DERIVED (ADR
   * 0028 §3): the two rooms it joins, in source order, and whether the clause gave it an
   * `id=`. Its span is the clause's, so no lint fix edits it, and a hint quotes its id only
   * when the author wrote one (the derived default, `A|B:open`, cannot be spelled). Internal.
   */
  _derived?: {
    from: "rooms";
    between: [string, string];
    idAuthored: boolean;
    /** The two rooms as the clause writes them, in its own (component) frame: never namespaced. */
    written: [string, string];
  };
  /**
   * Top of the cased opening above this storey's floor, in mm — always resolved.
   * Its default is the HOST WALL's own height (a leaf-less opening is drawn full height),
   * falling back to the storey height when the opening sits on no wall at all.
   */
  head: number;
}
export interface RFurniture extends RBase {
  kind: "furniture";
  category: string;
  at: Point;
  size: { w: number; h: number };
  label?: string;
  /** Quarter-turn rotation of the drawn symbol (0|90|180|270), default 0. */
  rotate?: number;
  /** Declared owning room id (`in <roomId>`), if any. */
  room?: string;
  /** The author wrote `flush`: this piece's anchored edge(s) are measured from the
   *  backing wall's inner face, not the room rectangle's centerline edge. Position is
   *  already resolved into {@link RFurniture.at} — this records *how*, for tooling. */
  flush?: boolean;
  /** `anchored` (`in <room> anchor|centered`), `against-wall` (`against wall …`),
   *  or `absolute` (`at (x,y)`). Internal marker for `describe().freedom`. */
  _placement?: FurniturePlacement;
  /** The authored placement CLAUSE, expressions evaluated — see {@link FurnitureAuthored}.
   *  Absent for the absolute `at (x,y)` form, whose coordinate IS what the author wrote. */
  _authored?: FurnitureAuthored;
  /** Byte span of the authored `rotate` clause, or the zero-width point where one
   *  can be inserted — copied from {@link import("./ast.js").FurnitureNode.rotateSpan}
   *  so an orientation lint fix can rewrite it. Internal; never reaches the Scene. */
  _rotateSpan?: Span;
  /** The literal `size` token's byte span and its two numbers swapped (`2200x900` for
   *  `900x2200`), from {@link import("./ast.js").FurnitureNode.sizeSpan}, so
   *  `W_FOOTPRINT_TRANSPOSED` can offer the swap. Absent for an expression size or none.
   *  Internal; never reaches the Scene, `describe()` or Plan JSON. */
  _sizeSwap?: { span: Span; text: string };
  /**
   * This piece's instance frame REFLECTS (`place … mirror`), so its drawn symbol is the
   * mirror image of the one the catalogue draws. Set by `frame.ts`'s `transformElement`
   * — the one place a handed rule is flipped — and read by `furniture.render()`, which
   * reflects the glyph about its own vertical centre line before applying the derived
   * quarter-turn. A symbol with a vertical mirror axis is unaffected at every footprint,
   * because the reflection is DERIVED from the drawing rather than declared per family
   * (see `elements/glyph-chirality.ts`). Internal; never reaches `describe()` or Plan JSON.
   */
  _mirror?: true;
  /** `against <room>.<edge>` as written (`against r_bed.left offset 1500`, ADR 0029 §2), for
   *  `describe()`'s `relation`. Present only on that form. */
  _relation?: string;
  /** `facing <id>` (ADR 0029 §3): the target's id, namespaced by a `place` frame as the piece's
   *  own id is. The derived turn is {@link RFurniture.rotate}. Present only when declared. */
  _facing?: string;
  /** The `facing` clause's byte span, for the settle pass's refusals. */
  _facingSpan?: Span;
  /** `clear front|sides <mm>` (ADR 0029 §4), evaluated. Present only when declared. */
  _clear?: { front?: number; sides?: number };
  /** The author wrote this piece's `id=` (set only then). Read by lint's seat hint. Internal. */
  _idAuthored?: true;
  /** `against wall <id|category>`: the id of the one wall it resolved to, namespaced by a
   *  `place` frame as the piece's own id is. Read only by `describe --facts depends`. Internal. */
  _againstWall?: string;
}
export interface RDim extends RBase {
  kind: "dim";
  from: Point;
  to: Point;
  offset: number;
  text?: string;
  /**
   * Where each extension (witness) line STARTS, when that is not the measured
   * endpoint itself.
   *
   * A dimension CHAIN measures along one straight baseline, so its endpoints are
   * projections of the building onto that baseline — on a stepped or angled facade
   * the wall being pointed at is somewhere else entirely, and a witness line drawn
   * from the endpoint begins over blank page. `dims auto` therefore hands each
   * synthesized chain the facade point every tick should terminate on (see
   * `facadeAt` in `scene-build.ts`); `from`/`to` stay on the baseline, so the
   * dimension line, its ticks and its measured text are untouched.
   *
   * Set only by `dims auto` synthesis — a written `dim` statement never carries it
   * (its endpoints ARE the points it names), and it is never part of describe()
   * or Plan JSON.
   */
  witness?: { from: Point; to: Point };
  /**
   * Draw this dimension's NUMBER on the far side of its dimension line — the GB/T 50104 /
   * ISO 129 remedy for a chain of narrow spans whose values would otherwise overprint each
   * other (twelve 200 mm bays cannot each hold a 300 mm-wide "200").
   *
   * Purely a drawing fact: the measured endpoints, the dimension line, its station ticks
   * and the text itself are all unchanged — only which side of the line the text rides on.
   * It therefore never reaches `describe()`, Plan JSON or the measured value.
   *
   * Set only by `dims auto` chain synthesis (`emitChain` in `scene-build.ts`), and only for
   * a chain that is actually crowded; a written `dim` statement never carries it (the
   * author owns their own annotation — a crowded pair of hand-written dims is reported as
   * `W_DIM_OVERLAP` instead, never silently re-staged; ADR 0005).
   */
  stagger?: boolean;
  /**
   * When the number cannot fit BETWEEN the two stations and is written past one of them
   * instead (`outsideStations` in `elements/dim.ts` — the ISO 129-1 remedy for a
   * measurement too small to letter), write it past the `from` end rather than the `to`
   * end. Absent means the `to` end, which is what every dim did before this existed.
   *
   * A separate flag rather than "swap the endpoints", because the endpoint ORDER also
   * decides the text's reading direction: a vertical dimension's number reads bottom-to-top
   * in one order and top-to-bottom in the other, and only the first is the drafting
   * convention. Set only by the wall-thickness call-out, which picks the side of the wall
   * that has floor under it. Purely a drawing fact — never reaches `describe()` or the
   * measured value.
   */
  calloutFrom?: boolean;
  /**
   * The whole `dim` statement re-emitted with its two endpoints SWAPPED — the
   * machine-applicable fix text for `W_DIM_INSIDE`. Computed in `dim.resolve`
   * (where the AST expressions still exist) because lint sees only the IR.
   * Internal: never rendered, never part of describe()/Plan JSON.
   */
  _swapText?: string;
  /**
   * Byte span of the authored `offset` clause, or the zero-width point where one can be
   * inserted — copied from {@link import("./ast.js").DimNode.offsetSpan} so the
   * `W_DIM_OVERLAP` lint fix can re-tier the dimension. Internal; never reaches the Scene.
   */
  _offsetSpan?: Span;
  /**
   * Byte span of the authored `text "…"` string literal, quotes included — set only when the
   * text is ONE literal with no `{…}` interpolation, so the `W_DIM_TEXT_MISMATCH` lint fix can
   * rewrite it without baking a literal over an authored expression. Internal; never reaches
   * the Scene, `describe()` or Plan JSON.
   */
  _textSpan?: Span;
  /**
   * This dim's instance frame REFLECTS (`place … mirror`). XOR-composed by `dim.transform`.
   * The transform already negates `offset`, which carries the line and a non-zero offset's
   * number; this bit is what carries a ZERO-offset call-out's number to the mirrored side.
   * Internal; never reaches `describe()` or Plan JSON.
   */
  _mirror?: true;
}
export interface RColumn extends RBase {
  kind: "column";
  at: Point;
  size: { w: number; h: number };
}

/** A resolved straight flight of stairs. `width` is always concrete (defaulted to the
 *  footprint's cross-axis extent at resolve), so nothing downstream re-derives it. */
export interface RStair extends RBase {
  kind: "stair";
  at: Point;
  size: { w: number; h: number };
  dir: VerticalDir;
  /** Flight width across the run (mm). */
  width: number;
  /**
   * The footprint edge the run is entered across, in PLAN coordinates, once a `place` frame
   * has carried it: the local tail (`tailEdge`) acted on by the frame. Absent at the root,
   * where `tailEdge` applies its fixed page rule. Internal; never reaches `describe()`.
   */
  _tail?: Side;
  /**
   * The frame REFLECTS, so the break line's diagonals (the one handed part of the symbol)
   * read their mirror. XOR-composed by `stair.transform`. Internal; never reaches `describe()`.
   */
  _mirror?: true;
}

/** A resolved lift shaft. */
export interface RElevator extends RBase {
  kind: "elevator";
  at: Point;
  size: { w: number; h: number };
  /** The entry edge the frame carried — see {@link RStair._tail}. */
  _tail?: Side;
}

/** A resolved escalator run. */
export interface REscalator extends RBase {
  kind: "escalator";
  at: Point;
  size: { w: number; h: number };
  dir: VerticalDir;
  /** The tail edge the frame carried — see {@link RStair._tail}. */
  _tail?: Side;
}

/**
 * A resolved roof projection. The ring is ALWAYS concrete — the `overhang` sugar is
 * discharged at resolve into the same explicit vertex list the `polygon` form writes —
 * so nothing downstream re-derives an offset or needs to know which spelling was used.
 * Implicitly closed, no repeated last vertex (the `RRoom.poly` convention).
 */
export interface RRoof extends RBase {
  kind: "roof";
  ring: Point[];
  /** The `overhang` form: the id of the closed wall ring it follows, named or inferred.
   *  Read only by `describe --facts depends`. Internal. */
  _follows?: string;
}

/** A resolved floor void. `at` is the TOP-LEFT of the opening (the `room`/`column`
 *  convention), never its centre. */
export interface RVoid extends RBase {
  kind: "void";
  at: Point;
  size: { w: number; h: number };
}

/**
 * A resolved ground surface. Like {@link RRoom}, it carries BOTH a rectangle and — for
 * the `polygon` spelling — the ring that is the honest datum.
 *
 * `at`/`size` are always populated, because a great deal of downstream code (the frame
 * transform, the balcony rail derivation, the grid index the lint rules use) is written
 * on a box; but they are the polygon's BOUNDING box when `poly` is set, and **no derived
 * position may be taken from them in that case**: area comes from the shoelace, the label point from
 * `polygonLabelPoint`, containment from `pointInPolygon`. The bbox is for indexing only.
 */
export interface ROutdoor extends RBase {
  kind: "outdoor";
  /** Which ground surface — the hatch, the tint and the CAD layer all follow from it. */
  surface: OutdoorKind;
  /** Top-left of the extent (the polygon's bbox corner on the `polygon` spelling). */
  at: Point;
  size: { w: number; h: number };
  /** The floor ring, present only for the `polygon` spelling. Implicitly closed, no
   *  repeated last vertex (the {@link RRoom.poly} convention). */
  poly?: Point[];
  label?: string;
  /** Which edges carry a railing — `balcony` only, and always CONCRETE by resolve: the
   *  authored `all`/`none`/edge list is discharged here, and an omitted clause is
   *  replaced by the derived set (every edge with no wall behind it). */
  rail?: RailSide[];
  /** True when the rail set above was DERIVED rather than written. `describe()` does not
   *  report this — it is what `arch fmt` reads to decide whether to re-emit the clause. */
  railDerived?: boolean;
}

/**
 * A resolved fence run. Deliberately NOT an {@link RWall}: no thickness, no material, no
 * openings, no place in the access graph or the wall joinery.
 */
export interface RFence extends RBase {
  kind: "fence";
  style: FenceStyle;
  points: Point[];
  closed: boolean;
}

export type ResolvedElement =
  | RWall
  | RRoom
  | RDoor
  | RWindow
  | ROpening
  | RFurniture
  | RDim
  | RColumn
  | RStair
  | RElevator
  | REscalator
  | RRoof
  | RVoid
  | ROutdoor
  | RFence
  | RWallsFromRooms;

/** One `describe().derived_walls[]` row: a derived wall before coexistence (ADR 0028 §6). */
export interface DerivedWallRow {
  /** `rooms` for a wall `walls from rooms` derived; `between`/`around` for an authored wall
   *  written in a pairwise form (ADR 0028 §4, §6). */
  from: "rooms" | "between" | "around";
  /** The internal name (`exterior`, `exterior#2`, `A|B`), namespaced inside a `place`; for a
   *  pairwise wall, its authored id. */
  name: string;
  between?: [string, string];
  /** `around` only: the rooms the ring goes round, as written. */
  around?: string[];
  /** The spans an authored wall took over (its id in `by`), in the wall's direction. */
  dropped?: Array<{ x1: number; y1: number; x2: number; y2: number; by: string }>;
}

/**
 * A resolved `walls from rooms` statement. It draws nothing of its own: its derived walls
 * ({@link RWallsFromRooms._derivedWalls}) enter `ResolvedPlan.walls`, where every wall is
 * drawn, hosted on and measured, but never `elements` (so nothing reads a derived wall as
 * an authored statement). Empty when the statement was refused.
 */
export interface RWallsFromRooms extends RBase {
  kind: "walls";
  /** The exterior ring's thickness (mm). */
  exterior: number;
  /** The partitions' thickness (mm). */
  partition: number;
  /** The rooms left out of the derivation. */
  except: string[];
  /** `status <s>` as written (B3a); every derived wall carries it too. Absent unless written. */
  status?: WallStatus;
  /** The derived walls, in derivation order: the outer ring, the courtyard rings, the
   *  partitions (by their rooms' source order). Internal. */
  _derivedWalls: RWall[];
  /** The facts row of each derived wall (ADR 0028 §6). Internal. */
  _derivedRows: DerivedWallRow[];
  /** The openings its `open between` clauses derive, in run order. They enter
   *  `ResolvedPlan.elements` right after the statement (`ElementDef.yieldsElements`), where
   *  they are ordinary openings. Internal. */
  _derivedOpenings: ROpening[];
  /** The pair clauses as resolved (rooms, thickness, width), for Plan JSON. Absent when the
   *  statement has none. */
  pairs?: Array<
    | { kind: "open"; between: [string, string]; id?: string; width?: number }
    | { kind: "thickness"; between: [string, string]; thickness: number }
  >;
}

/**
 * One resolved **positioning axis** (定位轴线): an author-declared datum line at `pos`
 * mm, with the label GB/T 50001 gives it. Not a {@link ResolvedElement} — an axis is a
 * plan-level datum, not a drawable element, so it never enters `elements`, gets no id,
 * and cannot be referenced by a door/room clause.
 *
 * `label` is **always derived** from sorted position by {@link import("./axes.js").numberAxes}
 * — `"1"`, `"2"`, … for `x`; `"A"`, `"B"`, … for `y`, bottom-to-top.
 */
export interface RAxis {
  axis: "x" | "y";
  /** x coordinate for an `x` axis, y coordinate for a `y` axis (mm, grid-snapped). */
  pos: number;
  /** The derived GB/T label drawn in the axis bubble. */
  label: string;
}

export interface ResolvedPlan {
  name: string;
  units: "mm";
  grid: number;
  /**
   * The EFFECTIVE scale, e.g. "1:50". With a `paper` declaration this is always set —
   * either as authored or as auto-fit chose it — and it is what the title block and
   * {@link sheet} report. Without `paper` it is the authored value (annotation only).
   */
  scale?: string;
  /**
   * The resolved sheet (`paper …` + the operative scale denominator), or absent when
   * the plan declares no `paper`. Computed once here so scene-build, `describe()` and
   * the diagnostics can never disagree about which scale is in force. See `src/sheet.ts`.
   */
  sheet?: ResolvedSheet;
  north: NorthDir;
  /**
   * `site { street … [hemisphere …] }` — carried through untouched from the AST, absent
   * when the plan declares none (so an existing IR, its Scene and its bytes are
   * unchanged). Semantics only: nothing in scene-build reads it. `describe()` derives the
   * direction names from it (`src/site.ts`) and one lint rule reads it; it is a plan-level
   * setting, so a multi-storey plan carries the same site on every storey.
   */
  site?: SiteNode;
  /**
   * The `site { boundary … }` LOT LINE, resolved: expressions evaluated,
   * grid-snapped, implicitly closed, no repeated last vertex.
   *
   * Separate from {@link site} — which stays the verbatim AST node — because this is the
   * one part of `site` that has GEOMETRY, and scene-build must not evaluate expressions.
   * Absent when the plan declares no boundary (or when the ring was refused), which is
   * what keeps a plan with only `street`/`hemisphere` drawing exactly nothing.
   */
  siteBoundary?: Point[];
  /** `dims auto …` — synthesize dimension strings at scene-build (presentation only). */
  autoDims?: "overall" | "rooms" | "walls" | "all";
  /**
   * Resolved positioning axes (定位轴线) in **label order** — `x` axes `1…n` left-to-right,
   * then `y` axes `A…` bottom-to-top. Absent when the plan declares no `axes` block (or
   * declares an empty one), so a plan without axes is byte-identical to before.
   */
  axes?: RAxis[];
  /**
   * `schedule rooms` — the sheet schedule table the drawing carries. Presentation only:
   * copied straight from the AST, never derived, and absent unless the plan opts in.
   */
  schedule?: "rooms";
  /** `schedule openings` — draw the door/window tags and the DOOR & WINDOW SCHEDULE.
   *  Presentation only, copied from the AST, absent unless the plan opts in. */
  openingSchedule?: boolean;
  /** `legend` — draw the derived materials/fixtures legend. Presentation only. */
  legend?: boolean;
  /** `notes "…"` — the sheet's general notes, in source order. Presentation only. */
  notes?: string[];
  title?: TitleNode;
  /** Explicit accessible title (`accTitle "…"`), overriding the plan name in the
   *  accessible-SVG `<title>`. Metadata only — never affects default output. */
  accTitle?: string;
  /** Explicit accessible description (`accDescr "…"`), overriding the derived
   *  caption in the accessible-SVG `<desc>`. Metadata only. */
  accDescr?: string;
  theme?: Partial<Theme>;
  /** Named theme base (`theme <name>`), resolved to colours at lowering. */
  themeBase?: string;
  /** Wall colour for opt-in poché derivation (`theme from "#color"`). */
  themeFrom?: string;
  /** Per-element style overrides (`style <kind> { … }`), applied at lowering. */
  styles?: Record<string, Partial<Theme>>;
  /**
   * Which **storey** this IR is, for a multi-storey plan (`level <n> { … }`): the authored
   * level number. Absent for a single-storey plan, so its IR — and therefore its Scene and
   * bytes — is unchanged. Derived page identity, never authored on the AST: it is what
   * stamps the `LEVEL` title-block row so a drawing SET is readable.
   */
  level?: number;
  /** The storey's name (`level 1 "Ground floor"`), when one was given. */
  levelName?: string;
  /**
   * The `zone` blocks this plan declares, in first-declaration order — the wing/department
   * grouping. Absent when the plan declares none, so an existing IR (and therefore
   * its Scene and its bytes) is unchanged. Each element's membership rides on
   * {@link RBase._zone}; nothing here has geometric meaning.
   */
  zones?: RZone[];
  /**
   * This storey's floor-to-floor height, in mm — always resolved: the `level`'s
   * own `height`, else the plan's, else {@link import("./datum.js").STOREY_HEIGHT}. It is
   * what every wall on this storey inherits when it declares none.
   */
  storeyHeight: number;
  /**
   * This storey's floor level above the building's LOWEST floor, in mm — `0` for a
   * single-storey plan and for the ground storey of any plan.
   *
   * The sum of the heights of the storeys below, not `level × storeyHeight`: `level 1
   * height 3600` puts level 2 at 3600 however tall the storeys above it are. See
   * `elevationOf` in `src/datum.ts`.
   */
  elevation: number;
  /**
   * Did the SOURCE author a height anywhere — this storey's or any other's, a wall's, an
   * opening's, an imported module's?
   *
   * The gate behind the byte-identity law: `describe()` emits its height block only when
   * this is true, so every plan written before the datum layer produces the summary it
   * always did. It is whole-PLAN rather than per-storey on purpose — a building whose
   * second floor declares a height and whose ground floor does not should report heights
   * for both, or the two pages disagree about whether the third dimension exists.
   * Internal: never serialized into the Scene/SVG/exports.
   */
  _heightsAuthored: boolean;
  /**
   * Every `while` statement that ran at least one iteration in THIS resolve, keyed by
   * {@link whileSpanKey} (its own span, qualified by the file it was written in).
   *
   * The non-vacuity gate for W7's `while`→`for` machine fix (`src/while-fix.ts`): a
   * candidate shape is proved only for a `while` this compile actually reached and
   * entered — never one inside a component this file never instantiates (a library
   * compiled standalone, or an unreachable branch of `place`), never one inside a dead
   * `if` branch (which `expandScope` never visits), and never one whose own condition was
   * false on entry (an empty loop proves nothing about the body it never ran).
   * Internal: never serialized into the Scene/SVG/exports/Plan JSON.
   */
  _executedWhileSpans?: ReadonlySet<string>;
  /** Resolved elements, in source order (for rendering). Without the `status demolish` walls:
   *  the drawing reads {@link ResolvedPlan.drawn} (see {@link drawnView}). */
  elements: ResolvedElement[];
  /** Resolved walls (for bounds/hosting), in source order. Without the `status demolish` walls
   *  (preview-and-remodel B3a): every analysis reads the plan after the demolition. */
  walls: RWall[];
  /**
   * The storey AS DRAWN, present only when a wall on it is `status demolish` (B3a): every element
   * and every wall in source order, the demolished ones included (but not an opening a demolished
   * `walls from rooms` statement derived: it goes with its wall). `elements`/`walls` above are the
   * plan after the demolition (what `describe()`, `lint()`, net area, circulation, enclosure,
   * keeps and every other analysis read), while the drawing (`toScene`, the drawing budget, the
   * sheet fit, `finish`) reads this, through {@link drawnView}. `toScene` draws its demolished
   * walls dashed and its standing walls, schedule and overlay from the plan after the demolition
   * (B3b).
   */
  drawn?: { elements: ResolvedElement[]; walls: RWall[] };
  /**
   * The plan's `place`d component instances, in source order. Absent when the plan places
   * none, so a component-free plan's IR — and therefore its Scene and its bytes — is unaffected.
   */
  instances?: RInstance[];
}

/** Max component-instantiation nesting depth before bailing out. */
const MAX_DEPTH = 64;
/** Safety cap on `while` iterations (deterministic guard against runaway loops). */
const MAX_ITERATIONS = 10_000;
/**
 * Cap on the elements ONE resolution expands (the root plan plus every `place`d instance
 * and component call it contains; each storey is its own resolution, so it is per storey).
 * Every element statement and every room a `strip` yields counts one, however it got
 * there (loop body, component, `place`); `let`/`set`/control flow count none. Past it
 * `E_ELEMENT_LIMIT` is raised once and expansion stops, so a runaway `for`/`while` yields
 * a diagnostic instead of an out-of-memory crash.
 *
 * Measured curve (identical overlapping rooms, after the room-overlap fix; compile +
 * describe + lint; loaded machine, 4 GB heap):
 *   1k rooms 0.43 + 0.12 + 0.40 s, 73 MB;  2k 1.3 + 0.3 + 0.7 s, 91 MB;
 *   5k 11 + 1.8 + 2.4 s, 187 MB;  10k: compile alone > 300 s (killed).
 * The cost is superlinear (label relocation is quadratic in rooms sharing space), not
 * memory — so the cap sits where a runaway still finishes in seconds (~5x the bench plan).
 * The corpus maximum is ~130 per storey and the bench plan ~1004.
 */
export const MAX_ELEMENTS = 5_000;

/** An element flattened out of the body, paired with the env its exprs use. */
interface Entry {
  node: AstElement;
  env: Env;
  id: string;
  /** True when `node.id` was author-declared (vs an assigned positional auto-id);
   *  copied onto the resolved wall/room as {@link RWall._idAuthored}/{@link RRoom._idAuthored}. */
  idAuthored?: boolean;
  /** Active `set` overrides for this element's kind, captured at expansion. */
  defaults?: ReadonlyMap<string, Value>;
  resolved?: ResolvedElement;
  /** True when this room was expanded from a `strip` block (it looks absolute in
   *  the AST, so the origin has to be remembered for `describe().freedom`). */
  fromStrip?: boolean;
  /** Dotted path of the innermost `zone` this element was written inside, copied onto
   *  the resolved element as {@link RBase._zone}. Absent outside every zone. */
  zone?: string;
  /**
   * The `place`d instance frame this element belongs to, or absent for the root plan
   * (which includes every LEGACY bare component call — those splice into the caller's
   * coordinate space by design and must stay byte-identical). Entries sharing a frame
   * share an object identity, which is what groups them into one sub-resolution.
   */
  frame?: Frame;
  /**
   * The `.arch` file this element's `node.span` is measured in, when it came in through
   * an `import`. Stamped onto every diagnostic the element raises as
   * {@link Diagnostic.file}. Absent = the compiled source.
   */
  file?: string;
}

/** Ambient state threaded down {@link expandScope} — everything a `place` needs. */
interface ExpandCtx {
  /** The frame in force (absent at the root). */
  frame?: Frame;
  /** The file the statements being expanded were written in (absent = compiled source). */
  file?: string;
  /** Grid snap, so a `place` origin lands on the module like every other coordinate. */
  snap(v: number): number;
  /** Instance paths already taken, so `as west` twice is an error, not a silent merge. */
  seenInstances: Set<string>;
  /**
   * `while` statements that ran at least one iteration in THIS expansion, keyed by
   * {@link whileSpanKey} — shared by reference across every recursive `expandScope` call
   * in one `resolveImpl`, so it ends up recording every `while` this compile actually
   * reached and entered, wherever it sits (plan level, a `for`/`if`/`zone` body, or a
   * component's — including one never instantiated here, whose body is simply never
   * visited). Read by `src/while-fix.ts`'s non-vacuity gate; never serialized (see
   * {@link ResolvedPlan._executedWhileSpans}).
   */
  executedWhiles: Set<string>;
  /** The element budget, shared BY REFERENCE across every recursive call (components,
   *  `place`d instances, loop bodies) of one resolution. See {@link MAX_ELEMENTS}. */
  budget: ElementBudget;
  /** Imported modules' plan-level `let`s, shared BY REFERENCE across one resolution. */
  modules: ModuleEnvs;
  /** The keeps one resolution expands (ADR 0033), shared BY REFERENCE across every call. */
  keeps: KeepSink;
  /** Where a `keep` met here stands: a component body refuses it (`E_KEEP_PLACEMENT`). */
  keepPlace: KeepPlace;
}

/**
 * The plan-level bindings of every imported module one resolution has needed so far (see
 * {@link moduleFallback}), keyed by the module's binding statements, plus the built-in
 * scope a module's own scope sits on (the same one the plan's sits on).
 */
interface ModuleEnvs {
  builtins: Scope;
  envs: Map<Statement[], Env>;
}

/**
 * The fallback an imported component's body looks a name up in when no parameter, no `let`
 * of its own, no root plan `let` and no built-in binds it: its own module's plan-level
 * `let`s (and value-functions), evaluated in the module's own scope — "the plan" a component
 * was written against is its module. Undefined for a component of the compiled source and
 * for one whose module binds nothing.
 *
 * Additive by construction: it is consulted only by a lookup that would otherwise report
 * `E_UNKNOWN_REF` / `E_UNKNOWN_FN` (`src/expr.ts`), so the root's `let` still wins over the
 * module's, and the importer's own statements — which carry no fallback — never see it.
 *
 * The module's binding statements (`moduleBindings`, `src/import.ts`: its top level less
 * everything that draws) run LAZILY, on the first such lookup and once per resolution,
 * through the same `expandScope` that runs them when the module is compiled or imported
 * whole: so each step is charged before its work, and a `let` that fails reports the same
 * catalogued diagnostic it does in the module, with the module's `file` and a span in it.
 * A module nobody looks into costs nothing and reports nothing.
 */
function moduleFallback(comp: ComponentDef, diagnostics: Diagnostic[], ectx: ExpandCtx): EnvFallback | undefined {
  const bindings = moduleBindings(comp);
  if (!bindings) return undefined;
  const { modules } = ectx;
  const file = comp.file;
  return (name) => {
    let env = modules.envs.get(bindings);
    if (env === undefined) {
      // The statement that looked the name up stays the site a step-budget crossing is
      // reported at once the module has run (a crossing INSIDE it names the module's `let`).
      const site = currentStepSite();
      const scope = new Scope(modules.builtins);
      // The module's `let`s are expansion, whoever looks a name up first: the first lookup
      // may come from an element expression in some instance's wall pass, where that
      // instance's datum table is being read, and the env is cached for every later caller.
      // So a datum in a module `let` always refuses (ADR 0028 §2), never reads a table.
      withDatumReader(beforeRoomsReader("expand"), () =>
        expandScope(
          bindings,
          scope,
          scope,
          new Map(),
          diagnostics,
          0,
          {
            ...(file !== undefined ? { file } : {}),
            snap: ectx.snap,
            seenInstances: new Set<string>(),
            executedWhiles: new Set<string>(),
            budget: { count: 0, capped: false },
            modules,
            keeps: { list: [], count: 0, limited: false },
            keepPlace: "component",
          },
          rootZoneFrame(),
        ),
      );
      env = scope.flatten();
      modules.envs.set(bindings, env);
      if (site) stepSite(site.span, site.file, site.frame);
    }
    return env.get(name);
  };
}

/** Elements counted so far in one resolution, and whether the cap was hit (sticky: once
 *  set, every loop and statement list stops expanding). */
interface ElementBudget {
  count: number;
  capped: boolean;
}

/** The key {@link ExpandCtx.executedWhiles} records a `while` statement under — its own
 *  span, qualified by the file it was written in (absent = the compiled source), so two
 *  different files' statements at coincidentally equal offsets never collide. Exported so
 *  `src/while-fix.ts`'s non-vacuity gate computes the SAME key rather than a lookalike
 *  (a second copy of this formatting rule is exactly how the two would silently drift). */
export function whileSpanKey(stmt: { span?: Span }, file: string | undefined): string {
  return `${file ?? ""}\u0000${stmt.span?.start ?? -1}\u0000${stmt.span?.end ?? -1}`;
}

/**
 * The zone frame threaded through {@link expandScope}: which `zone` blocks are currently
 * open, and the ledger of every zone declared so far.
 *
 * This is the ONE place membership is decided, and it is decided lexically — an element
 * belongs to the zone whose braces it was written inside, full stop (ADR 0005: no spatial
 * inference). It is also the insertion point for any future construct that wants to stamp
 * an implicit frame onto the elements it expands (see the `instance` case below).
 */
interface ZoneFrame {
  /** Open zones, outermost first. Empty at plan level. */
  readonly path: readonly string[];
  /** Every zone declared so far, keyed by dotted path; first declaration wins. */
  readonly declared: Map<string, RZone>;
}

/** A fresh, empty zone frame (plan level, nothing declared). */
const rootZoneFrame = (): ZoneFrame => ({ path: [], declared: new Map() });

/** `{ zone: "a.b" }`, or `{}` at plan level — spread onto an {@link Entry}. */
const zoneOf = (z: ZoneFrame): { zone?: string } => (z.path.length > 0 ? { zone: z.path.join(".") } : {});

/**
 * Open a nested zone named `id` on top of `frame`, recording the declaration the first
 * time that path is seen. This is the ONE way a zone segment is pushed: a `zone` block
 * uses it, and so does a `place`d instance — which is why an instance is a zone with no
 * second declaration and no duplicated bookkeeping. `label` is what the grouped schedule
 * and `describe().zones` print.
 */
function declareZone(frame: ZoneFrame, id: string, label?: string, instance = false): ZoneFrame {
  const path = [...frame.path, id];
  const key = path.join(".");
  // First declaration wins — a zone re-opened (by a loop, or written twice) merges its
  // members rather than declaring a second, identically-named group.
  if (!frame.declared.has(key)) {
    frame.declared.set(key, {
      id,
      path: key,
      ...(label !== undefined ? { label } : {}),
      // Spread, so a written `zone` carries no key at all and its IR is byte-identical.
      ...(instance ? { instance: true } : {}),
    });
  }
  return { path, declared: frame.declared };
}

/**
 * A lexical scope: its own bindings plus a link to the enclosing scope. `let`
 * declares in this scope (shadowing parents); assignment mutates the nearest
 * enclosing scope that owns the name; lookups walk up the chain. All of this is
 * expand-time and pure — there is no runtime.
 */
class Scope {
  readonly vars = new Map<string, Value>();
  /** Active `set <kind>(…)` overrides declared in THIS scope. */
  readonly sets = new Map<ElementKind, ReadonlyMap<string, Value>>();
  /** Where a name no scope of the chain binds is looked up (an imported component's
   *  module `let`s, see {@link moduleFallback}); the nearest one in the chain applies. */
  fallback?: EnvFallback;
  constructor(readonly parent?: Scope) {}

  /** The nearest scope (this or an ancestor) that declares `name`. */
  owner(name: string): Scope | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) if (s.vars.has(name)) return s;
    return undefined;
  }

  /** Flatten all visible bindings into a Map (child overrides parent). This is
   *  the per-element env snapshot `resolve` evaluates expressions against. */
  flatten(): Env {
    const m: Env = new Map();
    const chain: Scope[] = [];
    let copied = 0;
    let fallback: EnvFallback | undefined;
    for (let s: Scope | undefined = this; s; s = s.parent) {
      chain.push(s);
      copied += s.vars.size;
      fallback ??= s.fallback;
    }
    // A binding copied is an evaluation step (`MAX_EVAL_STEPS`, `src/expr.ts`).
    chargeSteps(copied);
    for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of chain[i]!.vars) m.set(k, v);
    if (fallback) setEnvFallback(m, fallback);
    return m;
  }

  /** Merge `set` overrides for `kind` down the scope chain (child wins). */
  effectiveSet(kind: ElementKind): ReadonlyMap<string, Value> | undefined {
    let merged: Map<string, Value> | undefined;
    const chain: Scope[] = [];
    for (let s: Scope | undefined = this; s; s = s.parent) chain.push(s);
    for (let i = chain.length - 1; i >= 0; i--) {
      const m = chain[i]!.sets.get(kind);
      if (m) merged = new Map([...(merged ?? []), ...m]);
    }
    return merged;
  }
}

/**
 * Expand a statement list into a flat element stream: evaluate `let`s and
 * assignments into the scope, inline component instances, and expand `for`/`if`/
 * `while` — all in fixed source order, expand-time, with no runtime.
 *
 * Scoping is lexical with the plan as the global scope: a component body sees
 * the plan-level `let`s (`global`) plus its own params and local `let`s, but NOT
 * the caller's locals. `for`/`if`/`while` bodies are child scopes of the current
 * one, so loop-local `let`s don't collide across iterations and assignments can
 * reach an outer binding (which is what lets `while` terminate).
 */
function expandScope(
  body: Statement[],
  scope: Scope,
  global: Scope,
  components: Map<string, ComponentDef>,
  diagnostics: Diagnostic[],
  depth: number,
  ectx: ExpandCtx,
  zone: ZoneFrame = rootZoneFrame(),
): Entry[] {
  // Every block and component body is one frame of a recursion the JS stack must hold.
  // `MAX_DEPTH` bounds component nesting and the parser bounds block nesting, but their PRODUCT
  // (64 components x 256 blocks) is not bounded by either, so the frames also draw on the
  // evaluator's shared stack budget; past it the body is not expanded (one diagnostic).
  if (!enterStack(EXPAND_UNITS, EXPAND_RESERVE)) {
    if (firstOverflow("expand")) {
      diagnostics.push(
        stampProvenance(
          {
            severity: "error",
            message: "Blocks and component instances are nested too deeply to expand; the innermost was skipped",
            code: "E_RECURSION",
            span: body[0]?.span,
          },
          ectx.frame,
          ectx.file,
        ),
      );
    }
    return [];
  }
  try {
    return expandScopeFrame(body, scope, global, components, diagnostics, depth, ectx, zone);
  } finally {
    leaveStack(EXPAND_UNITS);
  }
}

function expandScopeFrame(
  body: Statement[],
  scope: Scope,
  global: Scope,
  components: Map<string, ComponentDef>,
  diagnostics: Diagnostic[],
  depth: number,
  ectx: ExpandCtx,
  zone: ZoneFrame,
): Entry[] {
  // Every diagnostic raised while expanding THIS body inherits the body's provenance:
  // which file its spans are measured in, and which placed instance it belongs to.
  const diag = (d: Diagnostic) => {
    // A diagnostic is retained work: charged to the step budget, so a loop raising one per
    // iteration is stopped before its reports fill memory (`DIAGNOSTIC_STEPS`).
    chargeSteps(DIAGNOSTIC_STEPS);
    diagnostics.push(stampProvenance(d, ectx.frame, ectx.file));
  };
  const out: Entry[] = [];
  /** Element/statement entries carry the same provenance, for resolve-time diagnostics. */
  const prov = {
    ...(ectx.frame ? { frame: ectx.frame } : {}),
    ...(ectx.file !== undefined ? { file: ectx.file } : {}),
    ...zoneOf(zone),
  };
  /** Evaluate an expression against this scope's currently-visible bindings. */
  const evalIn = (e: Expr): Value => evalExpr(e, scope.flatten(), diag);

  /** Count one element toward the budget; false (after ONE E_ELEMENT_LIMIT at `at`) once
   *  the cap is crossed. */
  const spend = (at: { span?: Span }): boolean => {
    const b = ectx.budget;
    if (b.capped) return false;
    if (++b.count <= MAX_ELEMENTS) return true;
    b.capped = true;
    diag({
      severity: "error",
      message: `Plan expands to more than ${MAX_ELEMENTS} elements — expansion stopped (a loop that never ends, or far too many iterations?)`,
      code: "E_ELEMENT_LIMIT",
      ...(at.span ? { span: at.span } : {}),
    });
    return false;
  };

  for (const stmt of body) {
    if (ectx.budget.capped) break;
    // Each statement of the outermost body is an independent fault domain for the stack
    // budget's once-per-crossing report.
    if (atStackRoot()) resetOverflowReports();
    // A statement executed is an evaluation step, and the site a crossing is reported at
    // (`MAX_EVAL_STEPS`, `src/expr.ts`). A loop re-marks itself before each iteration, so
    // a crossing on an iteration names the loop, not the last statement of its body.
    stepSite(stmt.span, ectx.file, ectx.frame);
    chargeSteps(1);
    switch (stmt.kind) {
      case "let": {
        if (scope.vars.has(stmt.name)) {
          diag({
            severity: "error",
            message: `"${stmt.name}" is already defined in this scope`,
            code: "E_REDEF",
            span: stmt.span,
          });
          break;
        }
        const v = evalIn(stmt.value);
        // A function may call itself: add it to its own closure for recursion.
        if (v.t === "fn") v.closure.set(stmt.name, v);
        scope.vars.set(stmt.name, v);
        break;
      }
      case "assign": {
        const owner = scope.owner(stmt.name);
        if (!owner) {
          const hint = closest(stmt.name, [...scope.flatten().keys()]);
          diag({
            severity: "error",
            message: `Cannot assign to undefined name "${stmt.name}" (declare it with "let" first)`,
            code: "E_ASSIGN_UNDEF",
            span: stmt.span,
            hints: hint ? [`did you mean "${hint}"?`] : undefined,
          });
          break;
        }
        owner.vars.set(stmt.name, evalIn(stmt.value));
        break;
      }
      case "instance": {
        const comp = components.get(stmt.name);
        if (!comp) {
          const hint = closest(stmt.name, [...components.keys()]);
          diag({
            severity: "error",
            message: `Unknown component "${stmt.name}"`,
            code: "E_UNKNOWN_COMPONENT",
            span: stmt.span,
            hints: hint ? [`did you mean "${hint}"?`] : undefined,
          });
          break;
        }
        if (depth >= MAX_DEPTH) {
          diag({
            severity: "error",
            message: `Component recursion too deep (limit ${MAX_DEPTH}) instantiating "${stmt.name}"`,
            code: "E_RECURSION",
            span: stmt.span,
          });
          break;
        }
        if (stmt.args.length !== comp.params.length) {
          diag({
            severity: "error",
            message: `Component "${stmt.name}" expects ${comp.params.length} argument(s) but got ${stmt.args.length}`,
            code: "E_ARGCOUNT",
            span: stmt.span,
          });
        }
        const argVals: Value[] = comp.params.map((_, i) =>
          stmt.args[i] !== undefined ? evalIn(stmt.args[i]) : { t: "num", v: 0 },
        );
        // Component scope = plan global + params; its lets are local. An imported
        // component falls back to its own module's `let`s.
        const childScope = new Scope(global);
        comp.params.forEach((p, i) => {
          childScope.vars.set(p, argVals[i]!);
        });
        childScope.fallback = moduleFallback(comp, diagnostics, ectx);
        // A LEGACY bare call is TRANSPARENT to zones as it is to coordinates and ids: it
        // splices its body into the caller verbatim, so it pushes no zone segment. Only
        // its statements' spans differ — they belong to the file the component was
        // WRITTEN in, which is what the `file` swap records.
        out.push(
          ...expandScope(
            comp.body,
            childScope,
            global,
            comp.scope ?? components,
            diagnostics,
            depth + 1,
            {
              ...ectx,
              ...(comp.file !== undefined ? { file: comp.file } : { file: undefined }),
              keepPlace: "component",
            },
            zone,
          ),
        );
        break;
      }
      case "place": {
        const child = placeFrame(stmt, evalIn, diag, components, ectx, depth);
        if (!child) break;
        const comp = components.get(stmt.name)!;
        const argVals: Value[] = comp.params.map((_, i) =>
          stmt.args[i] !== undefined ? evalIn(stmt.args[i]) : { t: "num", v: 0 },
        );
        const childScope = new Scope(global);
        comp.params.forEach((p, i) => {
          childScope.vars.set(p, argVals[i]!);
        });
        childScope.fallback = moduleFallback(comp, diagnostics, ectx);
        // **A `place`d instance IS a zone.** `as west` already names an addressable group
        // of elements with its own id namespace, which is exactly what a `zone` block
        // declares — so the instance pushes its own segment onto the zone frame and every
        // element the component expands inherits membership through the identical
        // mechanism a hand-written `zone` uses. Composing by wing therefore GIVES you the
        // grouping: `describe().zones`, the grouped room schedule and `describe --zone
        // west` all work with no second declaration. (A bare call pushes nothing — it is
        // a macro, not a thing.) An explicit `zone` around a `place` still nests, so the
        // instance's path is `<outer>.<instance>`.
        out.push(
          ...expandScope(
            comp.body,
            childScope,
            global,
            comp.scope ?? components,
            diagnostics,
            depth + 1,
            {
              frame: child,
              ...(comp.file !== undefined ? { file: comp.file } : { file: undefined }),
              snap: ectx.snap,
              seenInstances: ectx.seenInstances,
              executedWhiles: ectx.executedWhiles,
              budget: ectx.budget,
              modules: ectx.modules,
              keeps: ectx.keeps,
              keepPlace: "component",
            },
            // No label: the instance NAME is already the heading a reader wants, and
            // inventing one ("wing instance") would print the same text for every
            // instance of a component. `describe().instances` says which component.
            // Marked `instance` so a TABLE does not group by it (see `RZone.instance`).
            declareZone(zone, stmt.alias, undefined, true),
          ),
        );
        break;
      }
      case "for": {
        const it = evalIn(stmt.iter);
        if (it === BUDGET_SUBSTITUTE) break; // already diagnosed by the stack budget
        if (it.t !== "arr") {
          diag({
            severity: "error",
            message: `"for" expects an array or range but got a ${it.t === "num" ? "number" : it.t}`,
            code: "E_TYPE",
            span: stmt.span,
          });
          break;
        }
        for (const item of it.v) {
          if (ectx.budget.capped) break;
          stepSite(stmt.span, ectx.file, ectx.frame);
          chargeSteps(1);
          const child = new Scope(scope);
          child.vars.set(stmt.varName, item);
          out.push(...expandScope(stmt.body, child, global, components, diagnostics, depth, ectx, zone));
        }
        break;
      }
      case "if": {
        const cond = asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond));
        const branch = cond ? stmt.then : stmt.else;
        if (branch) {
          out.push(...expandScope(branch, new Scope(scope), global, components, diagnostics, depth, ectx, zone));
        }
        break;
      }
      case "while": {
        let n = 0;
        while (!ectx.budget.capped) {
          // Each test of the condition starts an iteration (one step, at the loop).
          stepSite(stmt.span, ectx.file, ectx.frame);
          chargeSteps(1);
          if (!asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond))) break;
          if (n++ >= MAX_ITERATIONS) {
            diag({
              severity: "error",
              message: `"while" exceeded ${MAX_ITERATIONS} iterations (possible infinite loop)`,
              code: "E_WHILE_LIMIT",
              span: stmt.span,
            });
            break;
          }
          out.push(...expandScope(stmt.body, new Scope(scope), global, components, diagnostics, depth, ectx, zone));
          // Recorded on every completed iteration, not just the first — a Set, so it
          // costs nothing beyond the first — because this only needs to answer "did it
          // run >= 1 time", which is exactly what reaching here at all proves.
          ectx.executedWhiles.add(whileSpanKey(stmt, ectx.file));
        }
        break;
      }
      case "set": {
        // Merge into this scope's overrides for the target kind; later elements
        // in this (and nested) scopes pick them up.
        const merged = new Map<string, Value>(scope.sets.get(stmt.target) ?? []);
        for (const o of stmt.over) merged.set(o.key, evalIn(o.value));
        scope.sets.set(stmt.target, merged);
        break;
      }
      case "strip": {
        // Expand the strip into ordinary absolute-placed room entries. Positions
        // are closed-form (running sum of extents + gap); the resulting rooms flow
        // through room.resolve exactly like hand-authored `room at (x,y) size WxH`.
        for (const child of stripRooms(stmt, evalIn, diag)) {
          if (!spend(stmt)) break;
          out.push({
            node: child,
            env: scope.flatten(),
            id: "",
            defaults: scope.effectiveSet("room"),
            fromStrip: true,
            ...prov,
          });
        }
        break;
      }
      case "zone": {
        // A PURE metadata wrapper: no new scope, no new depth, no expansion of its own.
        // The body is expanded against the *same* Scope, so a `let`/`set` written inside a
        // zone behaves exactly as it would with the braces deleted — that is what makes
        // the byte-identity law (`test/zones.test.ts`) total rather than approximate.
        out.push(
          ...expandScope(
            stmt.body,
            scope,
            global,
            components,
            diagnostics,
            depth,
            ectx,
            declareZone(zone, stmt.id, stmt.label),
          ),
        );
        break;
      }
      case "keep":
        // A declared invariant (ADR 0033): its values are evaluated here, in this scope, and the
        // record is measured once the storey has resolved. It yields no element.
        expandKeep(stmt, ectx.keepPlace, (e) => keepValueOf(e, () => scope.flatten(), diag), diag, ectx.keeps);
        break;
      case "error":
        // A statement that failed to parse — already reported as a diagnostic at
        // parse time. It carries no geometry, so there is nothing to expand.
        break;
      case "level":
        // Storeys are partitioned OUT of the body before a level is resolved (see
        // `levelPlanFor`), so one can only reach here if a caller resolved a multi-storey
        // AST through the single-plan path. Skip it rather than treat it as an element:
        // the levels are drawn by `resolveAll`, and `E_LEVEL_MIX` already covers the
        // shape. Never a silent geometry change.
        break;
      default:
        // An element: snapshot the scope's visible bindings + active set-defaults.
        if (!spend(stmt)) break;
        out.push({ node: stmt, env: scope.flatten(), id: "", defaults: scope.effectiveSet(stmt.kind), ...prov });
    }
  }
  return out;
}

/**
 * A keep's value (`<mm>`, a level), or `undefined` when evaluating it raised a diagnostic: that
 * report stands, and the keep is dropped rather than measured against the substitute value the
 * evaluator returns (ADR 0033).
 */
function keepValueOf(e: Expr, env: () => Env, diag: (d: Diagnostic) => void): number | undefined {
  let raised = false;
  const report = (d: Diagnostic): void => {
    raised = true;
    diag(d);
  };
  const v = asNum(evalExpr(e, env(), report), report, exprSpan(e));
  return raised ? undefined : v;
}

/**
 * Stamp a diagnostic with the provenance of the statement that raised it: which FILE its
 * `span` (and every fix edit derived from it) is measured in, and which placed INSTANCE
 * it belongs to.
 *
 * Both are append-only fields, and both are absent for the root plan of the compiled
 * source — so a plan with no `place` and no `import` gets byte-identical diagnostics.
 *
 * The `file` stamp also travels onto `fixes[].file`, which is what stops `arch fix` from
 * splicing an imported component's edit into the importing file (before this existed it
 * did exactly that, corrupting the importer). When the `place` itself is in the compiled
 * source, a related span points at it, so a reader always has one location it can render.
 */
function stampProvenance(d: Diagnostic, frame: Frame | undefined, file: string | undefined): Diagnostic {
  if (!frame && file === undefined) return d;
  const out: Diagnostic = { ...d };
  if (file !== undefined) {
    out.file = file;
    if (d.fixes) out.fixes = d.fixes.map((f) => ({ ...f, file }));
  }
  if (frame) {
    out.instance = frame.prefix;
    out.component = frame.component;
    // A related span is rendered against the COMPILED source, so only offer one when the
    // `place` statement actually lives there.
    if (frame.span && frame.file === undefined) {
      out.relatedSpans = [
        ...(d.relatedSpans ?? []),
        { span: frame.span, message: `in instance "${frame.prefix}" placed here` },
      ];
    }
  }
  return out;
}

/**
 * Validate one `place` statement and build the frame its body expands in, or return
 * `null` (after a catalogued diagnostic) when it cannot be placed.
 *
 * The origin is evaluated in the CALLER's scope and grid-snapped exactly like any other
 * coordinate, then composed with the caller's own frame — which is what makes a `place`
 * inside a placed component body work (the frames simply multiply).
 */
function placeFrame(
  stmt: PlaceNode,
  evalIn: (e: Expr) => Value,
  diag: (d: Diagnostic) => void,
  components: Map<string, ComponentDef>,
  ectx: ExpandCtx,
  depth: number,
): Frame | null {
  const comp = components.get(stmt.name);
  if (!comp) {
    const hint = closest(stmt.name, [...components.keys()]);
    diag({
      severity: "error",
      message: `Unknown component "${stmt.name}"`,
      code: "E_UNKNOWN_COMPONENT",
      span: stmt.span,
      hints: hint ? [`did you mean "${hint}"?`] : undefined,
    });
    return null;
  }
  if (depth >= MAX_DEPTH) {
    diag({
      severity: "error",
      message: `Component recursion too deep (limit ${MAX_DEPTH}) placing "${stmt.name}"`,
      code: "E_RECURSION",
      span: stmt.span,
    });
    return null;
  }
  if (stmt.args.length !== comp.params.length) {
    diag({
      severity: "error",
      message: `Component "${stmt.name}" expects ${comp.params.length} argument(s) but got ${stmt.args.length}`,
      code: "E_ARGCOUNT",
      span: stmt.span,
    });
  }
  const path = ectx.frame?.prefix ? `${ectx.frame.prefix}.${stmt.alias}` : stmt.alias;
  if (ectx.seenInstances.has(path)) {
    diag({
      severity: "error",
      message: `Instance name "${path}" is already used — every \`place … as <name>\` must be unique (it is the id namespace)`,
      code: "E_DUP_INSTANCE",
      span: stmt.aliasSpan ?? stmt.span,
    });
    return null;
  }
  ectx.seenInstances.add(path);
  const num = (e: Expr): number => ectx.snap(asNum(evalIn(e), diag, exprSpan(e)));
  const local = makeFrame({
    origin: { x: num(stmt.at.x), y: num(stmt.at.y) },
    ...(stmt.rotate !== undefined ? { rotate: stmt.rotate } : {}),
    ...(stmt.mirror ? { mirror: stmt.mirror } : {}),
    prefix: path,
    component: stmt.name,
    ...(stmt.span ? { span: stmt.span } : {}),
    ...(ectx.file !== undefined ? { file: ectx.file } : {}),
  });
  return ectx.frame ? { ...composeFrame(ectx.frame, local), parent: ectx.frame, local } : local;
}

/**
 * Lower a `strip` block to a list of absolute-placed {@link RoomNode}s. The k-th
 * room's main-axis offset is the running sum of previous extents plus `gap`; the
 * cross axis is the strip origin, and the cross dimension is the strip's shared
 * `height`/`width` (overridable per room). Deterministic pure arithmetic — the
 * emitted rooms are byte-identical to hand-authored `room at (x,y) size WxH`.
 */
function stripRooms(strip: StripNode, evalIn: (e: Expr) => Value, diag: (d: Diagnostic) => void): RoomNode[] {
  const num = (e: Expr): number => asNum(evalIn(e), diag, exprSpan(e));
  const numE = (v: number): Expr => ({ t: "num", value: v });
  const originX = num(strip.at.x);
  const originY = num(strip.at.y);
  const gap = num(strip.gap);
  const horiz = strip.dir === "right" || strip.dir === "left";
  const stripCross = strip.cross !== undefined ? num(strip.cross) : undefined;
  const rooms: RoomNode[] = [];
  let offset = 0;
  for (const child of strip.rooms) {
    const mainExt = num(child.main);
    const crossExt = child.cross !== undefined ? num(child.cross) : stripCross;
    if (crossExt === undefined) {
      diag({
        severity: "error",
        message: `Room "${child.id || "(unnamed)"}" in a strip needs a cross-axis size — give the strip a \`${horiz ? "height" : "width"}\`, or the room its own \`size <main>x<cross>\``,
        code: "E_STRIP_SIZE",
        span: child.span,
      });
      continue;
    }
    let atx: number;
    let aty: number;
    let w: number;
    let h: number;
    if (horiz) {
      w = mainExt;
      h = crossExt;
      aty = originY;
      atx = strip.dir === "right" ? originX + offset : originX - offset - mainExt;
    } else {
      h = mainExt;
      w = crossExt;
      atx = originX;
      aty = strip.dir === "down" ? originY + offset : originY - offset - mainExt;
    }
    rooms.push({
      kind: "room",
      id: child.id,
      at: { x: numE(atx), y: numE(aty) },
      size: { w: numE(w), h: numE(h) },
      ...(child.label !== undefined ? { label: child.label } : {}),
      ...(child.uses ? { uses: child.uses } : {}),
      line: child.line,
      span: child.span,
    });
    offset += mainExt + gap;
  }
  return rooms;
}

// Stage memo: resolution is a pure function of (ast, registry, world). The AST
// is an immutable per-parse object, so its identity token uniquely keys the
// result (collision-free, unlike a content hash). Sharing the IR is safe —
// scene-building reads it read-only.
const resolveCache = new Map<string, { ir: ResolvedPlan; diagnostics: Diagnostic[] }>();
const RESOLVE_CACHE_MAX = 32;
/** Per-level synthetic PlanNodes, memoized so the resolve memo above can hit. */
const levelPlanCache = new Map<string, PlanNode>();
/** Whole multi-storey resolutions, memoized by the same (ast, registry, world) key. */
const levelsCache = new Map<string, PlanResolution>();

/** Clear the resolve stage memo (called by `clearCache`). */
export function clearResolveCache(): void {
  resolveCache.clear();
  levelPlanCache.clear();
  levelsCache.clear();
}

/**
 * A **resolved storey** of a multi-storey plan: the level's own {@link ResolvedPlan} (one
 * drawing) plus the diagnostics it raised, each tagged with {@link Diagnostic.level}.
 */
export interface ResolvedLevel {
  /** The authored level number (integer; 0/negative legal). */
  level: number;
  /** The storey's name, when the source gave one. */
  name?: string;
  ir: ResolvedPlan;
  diagnostics: Diagnostic[];
}

/**
 * The whole result of resolving a plan, single- or multi-storey.
 *
 * `ir` is the PRIMARY plan — for a multi-storey plan, the LOWEST level (page 1), which is
 * what `compile().svg`/`scene` and `describe()`'s top-level facts mean. `diagnostics`
 * aggregates every storey's problems, so nothing a level raised can hide from a gate.
 * `levels` is empty for a single-storey plan (the historical shape).
 */
export interface PlanResolution {
  ir: ResolvedPlan;
  diagnostics: Diagnostic[];
  levels: ResolvedLevel[];
}

/**
 * Extra, non-authored inputs to one resolution — the multi-storey seam. Both are derived
 * facts a *caller* knows and the AST cannot: which storey this pass is for, and the sheet
 * shared by every storey (a building is issued on ONE paper at ONE scale, so auto-fit
 * cannot be allowed to pick a finer scale for the smaller floor).
 */
interface ResolveExtras {
  level?: LevelStamp;
  /** How many `level` blocks the plan has: a message names the storey only when this is above 1. */
  storeyCount?: number;
  /** A pre-resolved sheet to adopt verbatim (skips deriving one + its overflow warning). */
  sheet?: ResolvedSheet;
  /**
   * This storey's floor level above the building's lowest, in mm — the sum of the
   * heights of the storeys BELOW it, which only the multi-storey caller can know because
   * it is the only thing that has seen the other storeys. Absent = `0`, the single-storey
   * plan and the ground floor of every plan.
   */
  elevation?: number;
  /**
   * Did the WHOLE plan author a height anywhere? Same reason: a `level 2 height
   * 3200` is invisible from inside level 1's synthetic plan, and the two pages must agree
   * about whether the third dimension exists. Absent = derive it from the plan at hand,
   * which is exactly right for a single-storey plan.
   */
  heightsAuthored?: boolean;
  /**
   * The evaluation steps the storeys below this one already spent (`MAX_EVAL_STEPS`,
   * `src/expr.ts`): the budget is one counter across the whole building, so a storey starts
   * where the one below it stopped. Absent = 0, the single-storey plan and the lowest storey.
   */
  stepsBefore?: number;
  /**
   * The `keep` seam (ADR 0033). `probe`: this is a `paper` plan's geometry probe, so its keeps
   * are expanded but never measured (R11). `keepsBefore`/`keepsLimited`: the keeps the storeys
   * below counted, and whether `E_KEEP_LIMIT` was raised, so the cap is the plan's. `rootKeeps`:
   * the plan's root `stacked` keeps, handed to the LAST storey's drawn pass to be expanded
   * against the plan-level bindings (R12). `keepAuthored`: record which ids were authored, for
   * the `stacked` pass. All absent on a plan with no keep.
   */
  probe?: boolean;
  keepsBefore?: number;
  keepsLimited?: boolean;
  rootKeeps?: readonly KeepNode[];
  keepAuthored?: boolean;
}

/** A value-based key for {@link ResolveExtras}, so the memo hits across calls (an
 *  identity token would miss every time — the sheet object is rebuilt per call). */
function extrasKey(extras: ResolveExtras | undefined): string {
  if (!extras) return "";
  const l = extras.level ? `L${extras.level.level}/${extras.level.name ?? ""}` : "";
  const s = extras.sheet
    ? `S${extras.sheet.size}/${extras.sheet.orientation}/${extras.sheet.denom}/${extras.sheet.auto ? 1 : 0}/${extras.sheet.fits ? 1 : 0}`
    : "";
  // The vertical datum rides in the key too — two storeys of the same shape at different
  // elevations are different resolutions, and a memo that could not tell them apart would
  // hand the upper floor the ground floor's facts.
  const h = `E${extras.elevation ?? 0}/${extras.heightsAuthored === undefined ? "-" : extras.heightsAuthored ? 1 : 0}`;
  // Where the step counter starts decides whether the storey crosses the budget, so it is
  // part of what the resolution is a function of.
  // The keep seam: absent on a plan with no keep, so its keys are what they were.
  const k = `${extras.probe ? "|P" : ""}${extras.keepsBefore ? `|K${extras.keepsBefore}${extras.keepsLimited ? "!" : ""}` : ""}${extras.rootKeeps ? `|R${extras.rootKeeps.length}` : ""}${extras.keepAuthored ? "|A" : ""}`;
  return `${l}|${s}|${h}|T${extras.stepsBefore ?? 0}${k}`;
}

export function resolve(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  // The single-storey path returns the memoized result OBJECT itself (not a copy) — the
  // stage-memo contract is identity, not just equality (`test/stage-cache.test.ts`).
  if (levelBlocks(ast).length === 0) return resolveCached(ast, registry, world);
  const { ir, diagnostics } = resolveAll(ast, registry, world);
  return { ir, diagnostics };
}

/**
 * Resolve a plan, honouring `level` blocks: one {@link ResolvedPlan} per storey.
 *
 * This is the entry point every consumer that cares about pages uses (`compile`,
 * `describe`, `lint`); {@link resolve} is the narrow historical projection of it. For a
 * plan with no `level` block it is exactly the old single resolution, memoized as before.
 *
 * For a multi-storey plan each level's body is resolved as its OWN plan — sharing the plan
 * settings, components, imports and plan-global `let`/`set`, but with per-level element
 * namespaces (so `stair` may exist on every floor and mean vertical identity, and auto-ids
 * restart per storey). Levels come back sorted ASCENDING, so the lowest is page 1.
 */
export function resolveAll(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
): PlanResolution {
  const blocks = levelBlocks(ast);
  if (blocks.length === 0) {
    const { ir, diagnostics } = resolveCached(ast, registry, world);
    return { ir, diagnostics, levels: [] };
  }
  const key = `${idToken(ast)}:${idToken(registry)}:${idToken(world)}`;
  const hit = levelsCache.get(key);
  if (hit) return hit;
  const out = resolveLevelsImpl(ast, blocks, registry, world);
  if (levelsCache.size >= RESOLVE_CACHE_MAX) {
    const oldest = levelsCache.keys().next().value;
    if (oldest !== undefined) levelsCache.delete(oldest);
  }
  levelsCache.set(key, out);
  return out;
}

/**
 * The plan's `level` blocks in DRAWING order — ascending by level number, and with a
 * duplicate number kept only once (the first block wins; the parser already reported
 * `E_LEVEL_DUP`, and resolving a second storey with the same number would emit a second
 * page claiming to be the same floor). Empty for a single-storey plan. The sort is stable
 * on source order, so it is deterministic.
 */
export function levelBlocks(ast: PlanNode): LevelNode[] {
  const out: LevelNode[] = [];
  const seen = new Set<number>();
  for (const s of ast.body) {
    if (s.kind !== "level" || seen.has(s.level)) continue;
    seen.add(s.level);
    out.push(s);
  }
  return out.sort((a, b) => a.level - b.level);
}

/**
 * The synthetic {@link PlanNode} for one storey: the plan's settings and declarations, its
 * plan-global body statements (`let`/`set`/…, which apply to every level), then the
 * level's own body. Memoized per (ast, level, dropPaper) so the resolve memo keys on a
 * stable object identity instead of a fresh clone each call.
 *
 * The parse-stage AST is never mutated (iron law): this is a shallow clone with a new
 * `body` array. `dropPaper` builds the geometry-only variant the shared-sheet pass uses —
 * the sheet affects annotation SIZES, never geometry, so measuring extents without it is
 * exact.
 */
function levelPlanFor(ast: PlanNode, block: LevelNode, dropPaper: boolean): PlanNode {
  const key = `${idToken(ast)}:${block.level}:${dropPaper ? 1 : 0}`;
  const hit = levelPlanCache.get(key);
  if (hit) return hit;
  // A root `keep` is the plan's, never copied into every storey (R12): `resolveLevelsImpl` reads it.
  const shared = ast.body.filter((s) => s.kind !== "level" && s.kind !== "keep");
  const plan: PlanNode = {
    ...ast,
    ...(dropPaper ? { paper: undefined } : {}),
    // `level <n> height <h>` folds into the synthetic plan's own `height`, so the
    // resolver reads ONE field and the fallback chain wall → level → plan → constant has
    // exactly one implementation. A storey that declares none keeps the plan's.
    ...(block.height !== undefined ? { height: block.height, heightSpan: block.heightSpan } : {}),
    body: [...shared, ...block.body],
  };
  if (levelPlanCache.size >= RESOLVE_CACHE_MAX * 4) levelPlanCache.clear();
  levelPlanCache.set(key, plan);
  return plan;
}

/** The margin-table row count one resolved storey will draw — the second thing (after the
 *  extent) a shared sheet has to be the maximum of. */
function tableRowsOf(plan: ResolvedPlan): number {
  const ir = drawnView(plan);
  return planTableRows({
    schedule: ir.schedule,
    legend: ir.legend,
    rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
    zones: ir.zones,
    walls: ir.walls,
    furniture: ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
    outdoor: ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
    openingSchedule: ir.openingSchedule,
    elements: ir.elements,
    notes: ir.notes,
  });
}

/**
 * The two extents a sheet is decided from.
 *
 * `building` is the outer-wall-face extent — what a builder and a GB/T overall dimension
 * see, and what the fit rule has always measured. `drawn` is that plus **everything else
 * the plan puts on the page**: every non-wall element's own registry `bounds()` (ground,
 * fences, roof eaves, a fixture pushed outside the shell, a stair landing) and the
 * `site … boundary` ring, which is a plan-level datum with no `ElementDef` of its own.
 *
 * `drawn` therefore CONTAINS `building` by construction, which is what makes
 * `fits === false ⟹ grown === true` a fact rather than a coincidence.
 *
 * Two things it deliberately is not. It is not `scene-build.ts`'s `planBounds`: the
 * building half is measured by {@link outerFaceBounds}, the same call `fits` uses, so the
 * new signal and the old one differ by their EXTENT and not by their ruler. And it takes
 * no wall band — the joinery is a rendering concern and this runs in `resolve()`, which
 * `describe()` and `lint()` both go through.
 */
export function sheetExtents(
  elements: readonly ResolvedElement[],
  walls: readonly RWall[],
  siteBoundary: readonly Point[] | undefined,
  registry: Registry,
): { building: { w: number; h: number }; drawn: { w: number; h: number } } {
  const rects = elements
    .filter((e): e is RRoom => e.kind === "room")
    .map((r) => ({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }));
  const ob = outerFaceBounds(walls, rects);
  const building = Number.isFinite(ob.minX) ? { w: ob.maxX - ob.minX, h: ob.maxY - ob.minY } : { w: 0, h: 0 };

  const db = { ...ob };
  for (const el of elements) {
    // Walls are already in `ob` on their outer faces; taking their band here would
    // measure the building with a second ruler.
    if (el.kind === "wall") continue;
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    for (const p of def.bounds(el)) extendBounds(db, p.x, p.y);
  }
  for (const p of siteBoundary ?? []) extendBounds(db, p.x, p.y);
  const drawn = Number.isFinite(db.minX) ? { w: db.maxX - db.minX, h: db.maxY - db.minY } : { w: 0, h: 0 };
  return { building, drawn };
}

/** The outer-wall-face extent of a resolved plan (what a sheet fit is measured on). */
function outerExtent(ir: ResolvedPlan, registry: Registry): ReturnType<typeof sheetExtents> {
  const d = drawnView(ir);
  return sheetExtents(d.elements, d.walls, d.siteBoundary, registry);
}

/**
 * The storey as the sheet draws it (preview-and-remodel B3a): {@link ResolvedPlan.drawn}'s
 * elements and walls, the `status demolish` walls included, in place of the plan after the
 * demolition. The SAME object when no wall is demolished, so every plan without the clause reads
 * exactly what it always did. Read by every drawing consumer (`toScene`, the drawing budget, the
 * sheet fit and `finish`), never by an analysis.
 */
export function drawnView(ir: ResolvedPlan): ResolvedPlan {
  return ir.drawn ? { ...ir, elements: ir.drawn.elements, walls: ir.drawn.walls } : ir;
}

/**
 * Resolve every storey of a multi-storey plan.
 *
 * With a `paper` declaration this runs a first, geometry-only pass to measure the
 * BUILDING (the largest extent over all storeys) and resolve **one** sheet from it, which
 * every page then adopts: a drawing set is issued on one paper at one scale, so auto-fit
 * must not draw the smaller top floor at 1:50 while the ground floor gets 1:100. The
 * `W_SCALE_OVERFLOW` that goes with it is raised ONCE, for the building, rather than once
 * per page — hence it carries no `level`.
 */
function resolveLevelsImpl(ast: PlanNode, blocks: LevelNode[], registry: Registry, world: World): PlanResolution {
  const stampOf = (b: LevelNode): LevelStamp => ({ level: b.level, ...(b.name !== undefined ? { name: b.name } : {}) });
  const shared: Diagnostic[] = [];
  const { stacked: rootStacked, spans: rootKeepSpans } = rootKeepsOf(ast, blocks.length, shared);

  let sheet: ResolvedSheet | undefined;
  // The step budget is one counter for the whole compile, so on a `paper` plan the geometry
  // probes below and the drawn pass that follows count into the same total: the probes
  // evaluate every storey once and the drawn pass a second time, and the drawn pass starts
  // where the probes stopped. A probe that crosses the budget ends the resolution there.
  let probeSteps = 0;
  let probeKeeps: KeepState | undefined;
  if (ast.paper) {
    let w = 0;
    let h = 0;
    // The DRAWN extent is maximised over the storeys the same way the building's is: a
    // ground-floor terrace and a second-floor balcony each grow the shared page.
    let dw = 0;
    let dh = 0;
    // The tables are per-STOREY (each page draws its own rooms), but the sheet is shared —
    // so the band reserved is the DEEPEST any page will draw, exactly as the extent is the
    // largest any page occupies. Reserving the ground floor's would let a taller schedule
    // upstairs run off the paper the fit rule just approved.
    let tableRows = 0;
    // A probe that crosses the step budget is where the plan stops: it is refused with what
    // the geometry pass found (every storey up to and including the crossing; the sheet,
    // which needs every storey, is never derived), rather than evaluated again.
    const probes: { b: LevelNode; ir: ResolvedPlan; diagnostics: Diagnostic[] }[] = [];
    for (const b of blocks) {
      const probe = resolveCached(levelPlanFor(ast, b, true), registry, world, {
        level: stampOf(b),
        storeyCount: blocks.length,
        stepsBefore: probeSteps,
        probe: true,
        ...keepsBeforeOf(probeKeeps),
      });
      probeKeeps = keepStateOfIr.get(probe.ir) ?? probeKeeps;
      probes.push({ b, ...probe });
      const spent = stepsOf(probe.ir);
      if (spent.exhausted) return stoppedLevels(ast, blocks, probes, stampOf);
      probeSteps = spent.used;
      const e = outerExtent(probe.ir, registry);
      w = Math.max(w, e.building.w);
      h = Math.max(h, e.building.h);
      dw = Math.max(dw, e.drawn.w);
      dh = Math.max(dh, e.drawn.h);
      tableRows = Math.max(tableRows, tableRowsOf(probe.ir));
    }
    const fit: SheetFitInput = {
      extent: { w, h },
      autoDims: ast.autoDims !== undefined,
      // Every page carries the same rows (the LEVEL row included), so the band the fit
      // reserves is level-independent; a placeholder scale keeps it denominator-independent.
      titleRows: titleRows(ast.title, "1:1", stampOf(blocks[0]!)).length,
      tableRows,
    };
    sheet = resolveSheetSpec(ast.paper, scaleInRange(ast, shared), fit, { w: dw, h: dh });
    const usable = usablePlanMm(sheet.widthMm, sheet.heightMm, sheet.denom, fit);
    if (!sheet.fits) shared.push(scaleOverflowDiagnostic(ast, sheet, { w, h }, usable));
    else if (!sheet.drawingFits) shared.push(drawingOverflowDiagnostic(ast, sheet, { w: dw, h: dh }, usable));
  }

  // The vertical datum, decided ONCE for the building rather than per storey.
  //
  // `blocks` is ascending, so walking it in order means every storey's elevation is the
  // sum of the heights of the storeys already resolved below it — which is the rule, and
  // is NOT `level × storeyHeight`: `level 1 height 3600` puts level 2 at 3600 however tall
  // the floors above are. Each storey is resolved exactly once; the accumulator is what
  // makes that enough.
  //
  // `heightsAuthored` is whole-plan for a reason a per-storey answer gets wrong: a `height`
  // written on the second floor alone would otherwise switch the summary's height block on
  // for page 2 and off for page 1, and the two pages would disagree about whether the third
  // dimension exists.
  const heightsAuthored = plansAuthorHeights(ast);
  const heightsBelow: number[] = [];
  // The evaluation-step budget is one counter across the building: each storey starts where
  // the one below it stopped, and once a storey crosses it the storeys above are not
  // evaluated at all (they resolve to no elements and raise nothing).
  let steps = probeSteps;
  let stopped = false;
  let keeps: KeepState | undefined;
  // A report about a root keep is the plan's, not the storey's that happened to expand it.
  const inRootKeep = (d: Diagnostic): boolean =>
    d.span !== undefined && rootKeepSpans.some((sp) => d.span!.start >= sp.start && d.span!.end <= sp.end);
  const levels: ResolvedLevel[] = blocks.map((b, i) => {
    if (stopped) return unresolvedLevel(ast, b, stampOf(b));
    const extras: ResolveExtras = {
      level: stampOf(b),
      storeyCount: blocks.length,
      ...(sheet ? { sheet } : {}),
      elevation: elevationOf(heightsBelow),
      heightsAuthored,
      stepsBefore: steps,
      ...keepsBeforeOf(keeps),
      ...(rootStacked.length > 0 ? { keepAuthored: true } : {}),
      ...(rootStacked.length > 0 && i === blocks.length - 1 ? { rootKeeps: rootStacked } : {}),
    };
    const { ir, diagnostics } = resolveCached(levelPlanFor(ast, b, false), registry, world, extras);
    const spent = stepsOf(ir);
    steps = spent.used;
    stopped = spent.exhausted;
    keeps = keepStateOfIr.get(ir) ?? keeps;
    heightsBelow.push(ir.storeyHeight);
    return {
      level: b.level,
      ...(b.name !== undefined ? { name: b.name } : {}),
      ir,
      // Tag by copy — the cached diagnostics are shared and must never be mutated.
      diagnostics: diagnostics.map((d) => (inRootKeep(d) ? { ...d } : { ...d, level: b.level })),
    };
  });

  // The plan's `stacked` keeps, after the last storey (R12), on the same step counter: a crossing
  // here is `E_STEP_LIMIT` and leaves the plan unresolved, as any crossing does (R13).
  const planKeeps: Diagnostic[] = [];
  const records = !stopped ? keepStateOfIr.get(levels[levels.length - 1]!.ir)?.stacked : undefined;
  if (records) {
    const storeys: StackedStorey[] = levels.map((l) => ({
      level: l.level,
      ir: l.ir,
      authored: keepStateOfIr.get(l.ir)?.authored ?? (() => false),
    }));
    const run = withStepMeter(steps, () =>
      evaluateStacked(records, storeys, (d) => {
        chargeSteps(DIAGNOSTIC_STEPS);
        planKeeps.push(d);
      }),
    );
    if ("value" in run) {
      for (const r of run.value) if (r.grade === "hard" && !r.holds) planKeeps.push(violationOf(r));
      stackedResultsOfIr.set(levels[0]!.ir, run.value);
      stackedStepsOfIr.set(levels[0]!.ir, run.used);
    } else {
      planKeeps.push(stepLimitDiagnostic(run.signal));
      stopped = true;
      for (let i = 0; i < levels.length; i++) {
        const ir = unresolvedPlan(levelPlanFor(ast, blocks[i]!, false), { level: stampOf(blocks[i]!) });
        stepsSpent.set(ir, { used: run.used, exhausted: true });
        levels[i] = { ...levels[i]!, ir };
      }
    }
  }

  // Once per PLAN, not per page: the theme's pen (the drawing budget is the pipeline's).
  // It does not run on a plan the step budget stopped (its storeys hold no elements).
  const planWide: Diagnostic[] = [];
  if (!stopped) {
    const lw = ast.theme?.lineWeight;
    if (lw !== undefined) {
      const pen = lineWeightOutOfRange(levels, lw, ast.lineWeightSpan, registry);
      if (pen) planWide.push(pen);
    }
  }

  return {
    ir: levels[0]!.ir,
    diagnostics: [
      ...shared,
      ...oncePerPlan(
        levels.map((l) => l.diagnostics),
        ast,
      ),
      ...planKeeps,
      ...planWide,
    ],
    levels,
  };
}

/** The keep cap's state the storeys below handed on (absent when nothing was counted). */
function keepsBeforeOf(k: KeepState | undefined): Pick<ResolveExtras, "keepsBefore" | "keepsLimited"> {
  if (!k || k.count === 0) return {};
  return { keepsBefore: k.count, ...(k.limited ? { keepsLimited: true } : {}) };
}

/**
 * The root keeps of a multi-storey plan (R12): a `stacked` keep is the plan's, measured after the
 * last storey; any other form there is refused once, with no level (`E_KEEP_PLACEMENT`), and so is
 * a `stacked` keep on a plan of one storey. Returns the accepted `stacked` keeps and every root
 * keep's span.
 */
function rootKeepsOf(ast: PlanNode, storeys: number, out: Diagnostic[]): { stacked: KeepNode[]; spans: Span[] } {
  const stacked: KeepNode[] = [];
  const spans: Span[] = [];
  for (const s of ast.body) {
    if (s.kind !== "keep") continue;
    if (s.span) spans.push(s.span);
    const refuse = (message: string, hint: string): void => {
      out.push({
        severity: "error",
        code: "E_KEEP_PLACEMENT",
        message,
        ...(s.span ? { span: s.span } : {}),
        hints: [hint],
      });
    };
    if (s.form !== "stacked") {
      refuse(
        "A keep at the root of a multi-storey plan measures no storey: it sits inside the level it measures",
        `move \`keep ${keepFormText(s)}\` into the \`level\` block whose plan it reads`,
      );
    } else if (storeys < 2) {
      refuse(
        "A stacked keep compares storeys, and this plan has one",
        `\`keep ${keepFormText(s)}\` needs two or more \`level\` blocks`,
      );
    } else stacked.push(s);
  }
  return { stacked, spans };
}

/** A storey left unevaluated because a storey below it crossed the step budget. */
function unresolvedLevel(ast: PlanNode, b: LevelNode, stamp: LevelStamp): ResolvedLevel {
  return {
    level: b.level,
    ...(b.name !== undefined ? { name: b.name } : {}),
    ir: unresolvedPlan(levelPlanFor(ast, b, false), { level: stamp }),
    diagnostics: [],
  };
}

/**
 * The resolution of a multi-storey plan whose geometry pass (the shared-sheet probes)
 * crossed the step budget: the probed storeys as they resolved, up to and including the one
 * that crossed it, and the storeys above it unevaluated.
 */
function stoppedLevels(
  ast: PlanNode,
  blocks: readonly LevelNode[],
  probes: readonly { b: LevelNode; ir: ResolvedPlan; diagnostics: Diagnostic[] }[],
  stampOf: (b: LevelNode) => LevelStamp,
): PlanResolution {
  const levels: ResolvedLevel[] = blocks.map((b, i) => {
    const p = probes[i];
    if (!p) return unresolvedLevel(ast, b, stampOf(b));
    return {
      level: b.level,
      ...(b.name !== undefined ? { name: b.name } : {}),
      ir: p.ir,
      diagnostics: p.diagnostics.map((d) => ({ ...d, level: b.level })),
    };
  });
  return {
    ir: levels[0]!.ir,
    diagnostics: oncePerPlan(
      levels.map((l) => l.diagnostics),
      ast,
    ),
    levels,
  };
}

/**
 * The spans of the plan-level SETTINGS a storey evaluates on its own behalf: the `axes`
 * block, the `site` block and the plan `height`. A report inside one of them is about the
 * plan, whichever storey raised it. (`north`, `grid` and a `paper` scale are reported by the
 * parser or the shared sheet, once already; a theme `lineWeight` once by
 * {@link lineWeightOutOfRange}.)
 */
function planSettingSpans(ast: PlanNode): Span[] {
  const spans: Span[] = [];
  if (ast.axes?.span) spans.push(ast.axes.span);
  if (ast.site?.span) spans.push(ast.site.span);
  if (ast.heightSpan) spans.push(ast.heightSpan);
  return spans;
}

/**
 * The storeys' diagnostics in drawing order, with a report raised INSIDE a plan-level
 * setting (see {@link planSettingSpans}) kept once, untagged, where it first appears: every
 * storey evaluates the same setting against the same plan-level bindings, so it is one fact
 * about the plan, not one per page. Everything else keeps one report per storey with its
 * level, including a statement written once and expanded on several storeys (a component
 * placed on two floors is two placements, each reported on its own floor).
 */
function oncePerPlan(perStorey: readonly Diagnostic[][], ast: PlanNode): Diagnostic[] {
  const all = perStorey.flat();
  const settings = planSettingSpans(ast);
  if (perStorey.length < 2 || settings.length === 0) return all;
  const inSetting = (d: Diagnostic): boolean =>
    d.file === undefined &&
    d.span !== undefined &&
    settings.some((s) => d.span!.start >= s.start && d.span!.end <= s.end);
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of all) {
    if (!inSetting(d)) {
      out.push(d);
      continue;
    }
    const { level: _level, ...plan } = d;
    const k = JSON.stringify(plan);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(plan);
  }
  return out;
}

/** The memoized single-plan resolution (the historical `resolve`). */
function resolveCached(
  ast: PlanNode,
  registry: Registry,
  world: World,
  extras?: ResolveExtras,
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const key = `${idToken(ast)}:${idToken(registry)}:${idToken(world)}:${extrasKey(extras)}`;
  const hit = resolveCache.get(key);
  if (hit) return hit;
  const out = resolveImpl(ast, registry, world, extras);
  if (resolveCache.size >= RESOLVE_CACHE_MAX) {
    const oldest = resolveCache.keys().next().value;
    if (oldest !== undefined) resolveCache.delete(oldest);
  }
  resolveCache.set(key, out);
  return out;
}

/** Each resolved storey's frozen datum tables (ADR 0028 §1), by instance prefix. */
const datumTablesOfIr = new WeakMap<ResolvedPlan, ReadonlyMap<string, DatumTable>>();

/**
 * The datum tables one storey's resolution froze: `""` is the root plan's, and each `place`d
 * instance's is under its prefix (`west`, `west.inner`), in that instance's own frame. Empty
 * for a plan whose resolution was stopped or that was not resolved here.
 *
 * Internal: the language reads a table through the room-edge datums (`hall.top`,
 * `src/room-datums.ts` `tableReader`, installed in `resolveGroup`); this accessor is for the
 * tests that pin what the table holds. Not part of the public surface.
 */
export function datumTablesOf(ir: ResolvedPlan): ReadonlyMap<string, DatumTable> {
  return datumTablesOfIr.get(ir) ?? new Map();
}

/** One `place`d instance's body as its own group resolved it, before its frame carried it. */
export interface InstanceBody {
  /** The instance's own elements in its LOCAL frame and LOCAL names (no `<prefix>.`), in
   *  entry order; the ones the frame could not carry are left out, as they are from the plan. */
  local: readonly ResolvedElement[];
  /** True when the component body came in through an `import` (some entry's `file` is set). */
  imported: boolean;
}

/** Each resolved storey's instance bodies, by instance prefix, in commit order. */
const instanceBodiesOfIr = new WeakMap<ResolvedPlan, ReadonlyMap<string, InstanceBody>>();

/**
 * The bodies of one storey's `place`d instances, keyed by prefix (`west`, `west.inner`) in the
 * order `ir.instances` lists them: each is what the component compiled as a plan resolves to
 * (an instance never reaches out, ADR 0016 §3). Empty for a plan with no instance or one not
 * resolved here. Internal: Plan JSON reads it to carry a component's statement as written
 * (PS3.9); it never reaches the Scene, `describe()` or `lint()`.
 */
export function instanceBodiesOf(ir: ResolvedPlan): ReadonlyMap<string, InstanceBody> {
  return instanceBodiesOfIr.get(ir) ?? new Map();
}

/**
 * What one resolution spent of the evaluation-step budget (`MAX_EVAL_STEPS`, `src/expr.ts`),
 * counted from the steps the storeys below it spent; `exhausted` when it crossed the budget
 * and stopped. Kept beside the IR rather than on it, so no serialisation can see it.
 */
interface StepsSpent {
  used: number;
  exhausted: boolean;
}
const stepsSpent = new WeakMap<ResolvedPlan, StepsSpent>();

/**
 * What one storey's resolution knows of its keeps (ADR 0033), beside the IR as `stepsSpent` is,
 * never on it: the keeps the plan has counted so far (this storey's included), whether
 * `E_KEEP_LIMIT` was raised, this storey's measured results, the plan's root `stacked` keeps
 * as the last storey expanded them, and which ids were authored (for the `stacked` pass). Set only
 * for a plan that declares a keep.
 */
interface KeepState {
  count: number;
  limited: boolean;
  results?: KeepResult[];
  stacked?: KeepRecord[];
  authored?: (id: string) => boolean;
}
const keepStateOfIr = new WeakMap<ResolvedPlan, KeepState>();
/** The plan's `stacked` results, keyed by its PRIMARY (lowest) storey's IR. */
const stackedResultsOfIr = new WeakMap<ResolvedPlan, KeepResult[]>();
/** Where the `stacked` pass left the step counter, keyed the same way (read by `evaluationSteps`). */
const stackedStepsOfIr = new WeakMap<ResolvedPlan, number>();

/**
 * Every accepted keep of a resolved plan, measured, in source order: each storey's keeps by level,
 * then the plan's (`stacked`). `undefined` when the plan declares none, so a reader adds no key.
 * Internal: read by `describe()` and `validate`; never on the IR, never in the drawing.
 */
export function keepResultsOf(ir: ResolvedPlan, levels: readonly ResolvedLevel[]): KeepResult[] | undefined {
  const storeys = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  const out: KeepResult[] = [];
  let any = false;
  for (const s of storeys) {
    const st = keepStateOfIr.get(s);
    if (st?.results) {
      any = true;
      out.push(...st.results);
    }
  }
  const plan = stackedResultsOfIr.get(storeys[0]!);
  if (plan) {
    any = true;
    out.push(...plan);
  }
  return any ? out : undefined;
}

/** The steps a resolved plan's resolution left the counter at (0 for a plan from elsewhere). */
function stepsOf(ir: ResolvedPlan): StepsSpent {
  return stepsSpent.get(ir) ?? { used: 0, exhausted: false };
}

/** The evaluation steps a whole resolution spent (every storey). Internal: for the tests
 *  that pin the budget against the corpus; not part of the public surface. */
export function evaluationSteps(res: PlanResolution): number {
  const top = res.levels.length > 0 ? res.levels[res.levels.length - 1]!.ir : res.ir;
  let used = stepsOf(top).used;
  // A storey left unevaluated above a crossing carries no count; the crossing storey's does.
  for (const l of res.levels) used = Math.max(used, stepsOf(l.ir).used);
  // The plan's `stacked` keeps are measured after the last storey, on the same counter.
  const first = res.levels[0]?.ir;
  if (first) used = Math.max(used, stackedStepsOfIr.get(first) ?? 0);
  return used;
}

/**
 * One resolution under the evaluation-step budget. Past the budget the resolution stops
 * where it is: the diagnostics raised so far are kept, `E_STEP_LIMIT` is added at the
 * statement that crossed it, and the plan resolves to no elements (an error draws nothing,
 * and `describe()`/`lint()` stop at it), so nothing downstream works on a half-evaluated body.
 */
function resolveImpl(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
  extras: ResolveExtras = {},
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  // Until a group's datum table is frozen, a room-edge datum is read before any room is
  // placed: the expansion and the plan settings refuse it (ADR 0028 §2, `resolveGroup`).
  const run = withStepMeter(extras.stepsBefore ?? 0, () =>
    withDatumReader(
      beforeRoomsReader("expand"),
      () => resolveBody(ast, registry, world, extras, diagnostics),
      functionBodyReader,
    ),
  );
  if ("value" in run) {
    stepsSpent.set(run.value.ir, { used: run.used, exhausted: false });
    return run.value;
  }
  diagnostics.push(stepLimitDiagnostic(run.signal));
  const ir = unresolvedPlan(ast, extras);
  stepsSpent.set(ir, { used: run.used, exhausted: true });
  return { ir, diagnostics };
}

/** The one `E_STEP_LIMIT`, at the statement that crossed the budget. */
function stepLimitDiagnostic(signal: StepLimitSignal): Diagnostic {
  const at = signal.at;
  return stampProvenance(
    {
      severity: "error",
      message:
        `Evaluation stopped after ${MAX_EVAL_STEPS} steps — the plan's loops, calls or strings do more work ` +
        "than any plan needs (a loop nested in a loop, recursion that branches, or a string that doubles?)",
      code: "E_STEP_LIMIT",
      ...(at.span ? { span: at.span } : {}),
    },
    at.frame as Frame | undefined,
    at.file,
  );
}

/**
 * The plan a resolution that was stopped returns: its settings and no elements. It is never
 * drawn (it comes with an error) and `describe()`/`lint()` stop at the error, so it only has
 * to be a well-formed {@link ResolvedPlan}.
 */
function unresolvedPlan(ast: PlanNode, extras: ResolveExtras): ResolvedPlan {
  return {
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    scale: ast.scale,
    north: ast.north,
    autoDims: ast.autoDims,
    ...(extras.level ? { level: extras.level.level } : {}),
    ...(extras.level?.name !== undefined ? { levelName: extras.level.name } : {}),
    title: ast.title,
    accTitle: ast.accTitle,
    accDescr: ast.accDescr,
    theme: ast.theme,
    themeBase: ast.themeBase,
    themeFrom: ast.themeFrom,
    styles: ast.styles,
    storeyHeight: STOREY_HEIGHT,
    elevation: extras.elevation ?? 0,
    _heightsAuthored: extras.heightsAuthored ?? plansAuthorHeights(ast),
    elements: [],
    walls: [],
  };
}

function resolveBody(
  ast: PlanNode,
  registry: Registry,
  world: World,
  extras: ResolveExtras,
  diagnostics: Diagnostic[],
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const g = ast.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const snapPt = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  // 0. Expand body (lets, assignments, instances, control flow) into a flat
  //    element stream. Built-ins live in a scope ABOVE the plan's globals, so a
  //    user `let` of the same name shadows them without an E_REDEF.
  const builtinScope = new Scope();
  for (const name of BUILTIN_NAMES) builtinScope.vars.set(name, { t: "builtin", name });
  const globalScope = new Scope(builtinScope);
  // The zone frame is created here and filled during expansion: `zoneFrame.declared` ends
  // up holding every `zone` the plan declares — and every `place`d instance, which is
  // implicitly one — in first-declaration order.
  const zoneFrame = rootZoneFrame();
  const executedWhiles = new Set<string>();
  const budget: ElementBudget = { count: 0, capped: false };
  const keepSink: KeepSink = { list: [], count: extras.keepsBefore ?? 0, limited: extras.keepsLimited === true };
  const entries = expandScope(
    ast.body,
    globalScope,
    globalScope,
    ast.components,
    diagnostics,
    0,
    {
      snap,
      seenInstances: new Set<string>(),
      executedWhiles,
      budget,
      modules: { builtins: builtinScope, envs: new Map() },
      keeps: keepSink,
      keepPlace: extras.level !== undefined ? "storey" : "plan",
    },
    zoneFrame,
  );
  // The plan's root `stacked` keeps, on the last storey only: expanded against the plan-level
  // bindings, measured after the last storey (`resolveLevelsImpl`, R12).
  const stackedSink: KeepSink = { list: [], count: keepSink.count, limited: keepSink.limited };
  for (const k of extras.rootKeeps ?? []) {
    stepSite(k.span);
    chargeSteps(1);
    const diagRoot = (d: Diagnostic): void => {
      chargeSteps(DIAGNOSTIC_STEPS);
      diagnostics.push(d);
    };
    expandKeep(k, "root", (e) => keepValueOf(e, () => globalScope.flatten(), diagRoot), diagRoot, stackedSink);
  }

  // 1. Partition the flat stream into RESOLUTION GROUPS: one per `place`d instance, plus
  //    the root plan. A plan with no `place` has exactly one group (the root) holding
  //    every entry — including every legacy bare component call — so everything below is
  //    the historical single pass, byte for byte.
  const groups = groupEntries(entries);
  /** What each wall-deriving statement was charged at expansion (`ctx.elementBudget`). */
  const precharged = chargeDerivedElements(entries, groups, registry, budget, diagnostics);

  // 2. Assign ids PER GROUP, so an instance's auto-id counters restart at 1 and two
  //    instances of one component get order-independent ids (`west.wall_1` / `east.wall_1`
  //    rather than `wall_1` / `wall_4`). Ids inside a group stay unprefixed until the
  //    group is transformed, which is what lets an intra-instance reference (`door on
  //    perimeter`) resolve against the instance's own namespace.
  for (const grp of groups) assignIds(grp.entries, registry, diagnostics);

  // 3. Resolve each group — rooms and their relational placement first, then the frozen
  //    datum table, then walls, then the openings that host against them and the rest in
  //    registry order (ADR 0028 §1, `resolveGroup`) — then transform the instance groups
  //    into plan coordinates.
  //
  //    A `place`d instance is a CLOSED WORLD going out: it resolves entirely in its own
  //    local frame, and one rigid transform then carries the result into the plan. That is
  //    what makes every derived-geometry rule (`anchor top-left`, `against wall … side`,
  //    `swing into`, `right-of`) mean inside a rotated instance exactly what it means when
  //    the component is authored on its own — see `frame.ts`.
  //
  //    Every level reaches INTO its descendants the same way: the root plan resolves LAST
  //    and sees every instance's walls and rooms under their namespaced ids (`door on
  //    west.perimeter`, `furniture … in west.main`), and an instance resolves after all of
  //    its descendants and sees theirs, carried into its own local frame and named relative
  //    to it — exactly what its body would see compiled as the plan. So placing a plan is
  //    associative. None reaches OUT: an instance never sees its parent's or its siblings'
  //    elements, so a component cannot reference anything outside itself (ADR 0016 §3).
  const walls: RWall[] = [];
  const rooms2: RRoom[] = [];
  const instances: RInstance[] = [];
  /** Entries a `place` could not carry into plan coordinates — excluded from `elements`. */
  const dropped = new Set<Entry>();
  let activeEnv: Env = new Map();
  /** The entry being resolved — the provenance every diagnostic below inherits. */
  let activeEntry: Entry | undefined;
  /** Where resolution diagnostics go: the plan's list, or an instance group's buffer. */
  let diagSink: Diagnostic[] = diagnostics;
  /** The entry each resolve-time diagnostic is ABOUT, so the number-domain check can drop
   *  every other diagnostic of an element it drops (one report per element). Keyed by the
   *  object pushed, which is the object that reaches `diagnostics`. */
  const ownerOf = new Map<Diagnostic, Entry>();
  /** The entry a resolved element (local, or carried into plan coordinates) came from. */
  const entryOf = new Map<ResolvedElement, Entry>();
  const pushDiag = (d: Diagnostic): void => {
    chargeSteps(DIAGNOSTIC_STEPS);
    const out = activeEntry ? stampProvenance(d, activeEntry.frame, activeEntry.file) : d;
    diagSink.push(out);
    if (activeEntry) ownerOf.set(out, activeEntry);
  };
  /** Record a relational-placement diagnostic, owned by the room it is about. */
  const ownRoomDiag = (d: Diagnostic, room: RRoom | undefined): void => {
    const e = room ? entryOf.get(room) : undefined;
    if (e) ownerOf.set(d, e);
  };
  const evalNum = (e: Expr): number => asNum(evalExpr(e, activeEnv, pushDiag), pushDiag, exprSpan(e));
  const evalStr = (e: Expr): string => asStr(evalExpr(e, activeEnv, pushDiag));
  const evalPt = (p: ExprPoint): Point => ({ x: evalNum(p.x), y: evalNum(p.y) });
  // Openings call isOnWall(at, ref) then hostSegment(at, ref) with identical
  // args back-to-back; a one-entry memo fuses those into a single wall scan.
  // ctx.walls is fully populated before any opening resolves (registry order:
  // walls first), so the spatial index is built lazily on first use and reused.
  // Both are reset when the pass moves to the next group's wall set.
  let wallGrid: WallGrid | null = null;
  let hiKey = "";
  let hiVal: { host: WallSegment | null; onWall: boolean } | null = null;

  // ---- the vertical datum ------------------------------------------------
  // This storey's floor-to-floor height, resolved BEFORE any element so every wall can
  // inherit it. The expression is evaluated against the plan's GLOBAL bindings — it is a
  // plan setting, not a body statement, so it sees every plan-level `let` wherever that
  // sits in the file — exactly as the `axes` block and the lot line are.
  //
  // `levelPlanFor` has already folded a `level <n> height <h>` into `ast.height` for the
  // storey being resolved, so there is one place to read and one chain to get wrong.
  //
  // It is NOT grid-snapped. `grid` snaps plan coordinates so rooms line up with each
  // other; a height shares no axis with them, and snapping `height 2850` onto a 100 mm
  // grid would silently redraw a section nobody asked for.
  let storeyHeight = STOREY_HEIGHT;
  if (ast.height !== undefined) {
    stepSite(ast.heightSpan);
    activeEnv = globalScope.flatten();
    const h = evalNum(ast.height);
    if (isDrawableHeight(h)) storeyHeight = h;
    else diagnostics.push(heightRangeDiagnostic("The plan", "height", h, ast.heightSpan));
  }

  const ctx: ResolveCtx = {
    grid: g,
    snap,
    snapPt,
    eval: evalNum,
    evalStr,
    evalPt,
    id: "",
    storeyHeight,
    walls,
    rooms: rooms2,
    hostSegment: (at, ref) => hostInfo(at, ref).host,
    // A deriving statement's real walls, beyond its expansion pre-charge (B1, ADR 0028 §3).
    elementBudget: (n) => {
      const e = activeEntry;
      const pre = e ? (precharged.get(e) ?? 0) : 0;
      if (n <= pre) return true;
      if (e) precharged.set(e, n);
      budget.count += n - pre;
      return budget.count <= MAX_ELEMENTS;
    },
    isOnWall: (at, ref) => hostInfo(at, ref).onWall,
    ...(world.now ? { now: () => world.now!() } : {}),
    diag: pushDiag,
  };
  function hostInfo(at: Point, ref?: string): { host: WallSegment | null; onWall: boolean } {
    const key = `${at.x},${at.y},${ref ?? ""}`;
    if (key === hiKey && hiVal) return hiVal;
    if (!wallGrid) wallGrid = new WallGrid(ctx.walls);
    hiKey = key;
    hiVal = wallGrid.hostInfo(at, ref);
    return hiVal;
  }

  /**
   * Resolve one group's entries against `grpWalls`/`grpRooms`, which the group's own walls
   * and rooms are appended to as they resolve (ADR 0028 §1):
   *
   *   1. every ROOM, then relational placement over `relational.rooms()` (ADR 0004), so
   *      every room the group can see has its final position;
   *   2. the group's DATUM TABLE, built from those rooms (and the plan's `axes`, root only)
   *      and frozen, before any wall resolves;
   *   3. every other kind in registry order: walls, then the openings against the final
   *      wall set, then the rest.
   *
   * Ids were assigned before this (step 2), so the registry order of ids is unchanged.
   * Diagnostics are BUFFERED per kind and flushed in registry order, then the relational
   * placement ones: the order one pass in registry order (walls first, placement after the
   * pass) produced, so `compile().diagnostics` does not move. A resolution stopped by
   * `E_STEP_LIMIT` still flushes what was raised before the crossing.
   */
  /**
   * How a group's datums read beyond its table (ADR 0028 §2): compass words alias the frame
   * words only in the root group of a plan whose `north` is `up`, and a dotted path that is
   * also an element id inside an instance the group sees is refused. That id set is built
   * the first time a datum is read in the group, charged one step per element first.
   */
  const datumOpts = (grp: ResolveGroup): TableReaderOpts => {
    const north = ast.north;
    const compassWhy = grp.frame
      ? `inside the placed component "${grp.frame.component}" a datum names the component's own frame, not the compass`
      : typeof north === "object"
        ? `the plan's \`north\` is a bearing of ${fmt3(north.deg)} degrees`
        : `the plan's \`north\` is \`${north}\``;
    let ids: Set<string> | undefined;
    return {
      compassAliases: grp.frame === undefined && north === "up",
      compassWhy,
      instanceIds: () => {
        if (ids) return ids;
        const base = grp.frame?.prefix;
        const seen = groups.filter(
          (d) => d.frame !== undefined && d !== grp && (base === undefined || d.frame.prefix.startsWith(`${base}.`)),
        );
        let n = 0;
        for (const d of seen) n += d.entries.length;
        chargeSteps(n);
        ids = new Set<string>();
        for (const d of seen) {
          const rel = base === undefined ? d.frame!.prefix : d.frame!.prefix.slice(base.length + 1);
          for (const e of d.entries) ids.add(`${rel}.${e.id}`);
        }
        return ids;
      },
    };
  };

  const resolveGroup = (
    grp: ResolveGroup,
    grpWalls: RWall[],
    grpRooms: RRoom[],
    relational: { rooms: () => RRoom[]; stamp: (d: Diagnostic) => Diagnostic },
    axes: readonly RAxis[] | undefined,
    /** The ids of the walls this group sees that a pairwise form refused (no points), as the
     *  group names them; its own refused walls join as they resolve. */
    refusedWalls: Set<string>,
  ): DatumTable => {
    ctx.walls = grpWalls;
    ctx.unplacedWall = (ref) => refusedWalls.has(ref);
    ctx.rooms = grpRooms;
    delete ctx.datums;
    // The group's OWN elements resolved so far, in source order (never a descendant's).
    ctx.group = () => {
      chargeSteps(grp.entries.length + 1);
      const own: ResolvedElement[] = [];
      for (const e of grp.entries) if (e.resolved !== undefined) own.push(e.resolved);
      return own;
    };
    wallGrid = null;
    hiKey = "";
    hiVal = null;
    const order = registry.order;
    const byKind: Diagnostic[][] = order.map(() => []);
    const placement: Diagnostic[] = [];
    /** The entry each kind's pass ended on, so the step site is left where one pass in
     *  registry order leaves it (the statement a later crossing is reported at). */
    const lastOf: (Entry | undefined)[] = order.map(() => undefined);
    const sink = diagSink;
    const resolveKind = (i: number): void => {
      const def = order[i]!;
      diagSink = byKind[i]!;
      for (const e of grp.entries) {
        if (e.node.kind !== def.kind) continue;
        lastOf[i] = e;
        activeEnv = e.env;
        activeEntry = e;
        stepSite(e.node.span, e.file, e.frame);
        ctx.id = e.id;
        ctx.defaults = e.defaults;
        const r = def.resolve(e.node, ctx);
        e.resolved = r;
        entryOf.set(r, e);
        markPlacement(r, e.node, e.fromStrip === true);
        // Declared zone membership — a `zone` block the element was written inside, or
        // the `place`d instance that expanded it (an instance IS a zone). Set only when
        // there is one, so an unzoned plan's IR carries no new key at all.
        if (e.zone !== undefined) r._zone = e.zone;
        // Which FILE this element's span is measured in. Resolve-time diagnostics get it
        // from `stampProvenance` above; carrying it onto the element is what lets the
        // POST-resolve consumers (lint) stamp it too, instead of minting fixes that
        // `applyFixes` then splices into the wrong source. Set only when there is one, so
        // an import-free plan's IR carries no new key at all.
        if (e.file !== undefined) r._file = e.file;
        if (r.kind === "wall") {
          r._idAuthored = e.idAuthored === true;
          // A pairwise wall the rooms refused (ADR 0028 §4) has no points: no body to draw or
          // host. Its id is recorded, so a reference to it names the refusal.
          if (r.points.length > 0) grpWalls.push(r);
          else refusedWalls.add(r.id);
        } else if (r.kind === "room") {
          r._idAuthored = e.idAuthored === true;
          grpRooms.push(r);
        } else if (r.kind === "furniture") {
          // Only when authored, so a plan's IR gains no key: lint's seat hint (ADR 0029 §6)
          // names a piece by id only when the author gave it one.
          if (e.idAuthored === true) r._idAuthored = true;
        } else if (r.kind === "door") {
          // The same, for `W_LEAF_ACROSS_DOORWAY`'s hints (plan-soundness PS2.11d).
          if (e.idAuthored === true) r._idAuthored = true;
        } else if (r.kind === "window") {
          // The same, for `W_HOB_UNDER_WINDOW`'s hint (plan-soundness PS2.46).
          if (e.idAuthored === true) r._idAuthored = true;
        } else if (def.yieldsWalls) {
          // Derived walls join the group's wall list at once, before any opening resolves
          // (ADR 0028 §3); they carry the statement's zone and file, never an authored id.
          const kids = def.yieldsWalls(r);
          for (const w of kids) {
            if (e.zone !== undefined) w._zone = e.zone;
            if (e.file !== undefined) w._file = e.file;
            grpWalls.push(w);
          }
          if (kids.length > 0) {
            wallGrid = null;
            hiKey = "";
            hiVal = null;
          }
        }
      }
    };
    const roomKind = order.findIndex((d) => d.kind === "room");
    // The registry order of every pass after the rooms. A group that holds a wall-deriving
    // statement (`ElementDef.yieldsWalls`, `walls from rooms`) resolves the kinds it reads
    // first (`dependsOn`), then the authored walls, then the statement, then the rest; a
    // group without one keeps the plain registry order.
    const derivers = order.flatMap((d, i) =>
      d.yieldsWalls && grp.entries.some((e) => e.node.kind === d.kind) ? [i] : [],
    );
    const early: number[] = [];
    for (const i of derivers) {
      for (const k of order[i]!.dependsOn ?? []) {
        const j = order.findIndex((d) => d.kind === k);
        if (j >= 0 && j !== roomKind && !early.includes(j) && !derivers.includes(j)) early.push(j);
      }
    }
    early.sort((a, b) => a - b);
    const wallKind = order.findIndex((d) => d.kind === "wall");
    const first =
      derivers.length === 0
        ? []
        : [...early, ...(wallKind >= 0 && !early.includes(wallKind) ? [wallKind] : []), ...derivers];
    const passes = [...first, ...order.map((_, i) => i).filter((i) => i !== roomKind && !first.includes(i))];
    /** After the authored walls, in a deriving group: an authored wall may not take an id the
     *  derived walls are given there (`ElementDef.reservedIds`, `E_WALL_ID_RESERVED`), so a wall
     *  id keeps naming one wall (the host a hint names, `hostWallId`). Reported with the walls. */
    const refuseReservedIds = (): void => {
      const reserved = new Set(derivers.flatMap((i) => order[i]!.reservedIds ?? []));
      if (reserved.size === 0) return;
      for (const e of grp.entries) {
        if (e.node.kind !== "wall" || e.idAuthored !== true || !reserved.has(e.id)) continue;
        activeEntry = e;
        pushDiag({
          severity: "error",
          message: `\`${e.id}\` is the name of the ring \`walls from rooms\` derives here, so an authored wall cannot take it; rename the wall`,
          code: "E_WALL_ID_RESERVED",
          span: idSpanOf(e.node) ?? e.node.span,
        });
      }
      activeEntry = undefined;
    };
    /** After every pass: let each deriver judge the group it derived in (`auditGroup`). */
    const auditDerivers = (): void => {
      for (const i of derivers) {
        const def = order[i]!;
        if (!def.auditGroup) continue;
        diagSink = byKind[i]!;
        const own: ResolvedElement[] = [];
        for (const e of grp.entries) if (e.resolved !== undefined) own.push(e.resolved);
        chargeSteps(own.length + 1);
        for (const e of grp.entries) {
          if (e.node.kind !== def.kind || !e.resolved) continue;
          activeEntry = e;
          def.auditGroup(e.resolved, own, pushDiag);
        }
        activeEntry = undefined;
      }
    };
    /** After every pass: let each kind that reads its group settle (`ElementDef.settle`, ADR
     *  0029 §3). It charges its own steps, and only for an element that needs it, so a group
     *  with nothing to settle meters exactly what it did before. */
    const settleKinds = (): void => {
      let own: ResolvedElement[] | undefined;
      for (let i = 0; i < order.length; i++) {
        const def = order[i]!;
        if (!def.settle) continue;
        for (const e of grp.entries) {
          if (e.node.kind !== def.kind || !e.resolved) continue;
          if (own === undefined) {
            own = [];
            for (const x of grp.entries) if (x.resolved !== undefined) own.push(x.resolved);
          }
          diagSink = byKind[i]!;
          activeEntry = e;
          def.settle(e.resolved, own, pushDiag);
        }
        activeEntry = undefined;
      }
    };
    /** After the derivers: let each early kind refresh what it read off the walls. */
    const rewall = (): void => {
      for (const j of early) {
        const def = order[j]!;
        if (!def.rewall) continue;
        for (const e of grp.entries) if (e.node.kind === def.kind && e.resolved) def.rewall(e.resolved, grpWalls);
      }
    };
    let table: DatumTable;
    try {
      // The room pass reads no datum: the table it would read does not exist yet.
      withDatumReader(beforeRoomsReader("rooms"), () => {
        if (roomKind >= 0) resolveKind(roomKind);
        activeEntry = undefined;
        placeRelational(relational.rooms(), snapPt, (d, room) => {
          const out = relational.stamp(d);
          placement.push(out);
          ownRoomDiag(out, room);
        });
      });
      const frozen = buildDatumTable(grpRooms, axes);
      table = frozen;
      const opts = datumOpts(grp);
      const reader = tableReader(frozen, opts);
      // A relational opening reads the same table through the same reader (ADR 0028 §5).
      ctx.datums = {
        table: frozen,
        compass: { aliases: opts.compassAliases, why: opts.compassWhy },
        read: (name, span) => {
          let refused = false;
          const v = reader(name, span, (d) => {
            refused = true;
            pushDiag(d);
          });
          return v === undefined ? undefined : refused ? null : v.t === "num" ? v.v : null;
        },
      };
      // Every later statement reads the frozen table (ADR 0028 §2).
      withDatumReader(reader, () => {
        for (const i of passes) {
          resolveKind(i);
          if (i === wallKind && derivers.length > 0) refuseReservedIds();
          if (i === derivers[derivers.length - 1]) rewall();
        }
        auditDerivers();
        settleKinds();
      });
    } finally {
      diagSink = sink;
      for (const list of byKind) for (const d of list) sink.push(d);
      for (const d of placement) sink.push(d);
      activeEntry = undefined;
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const e = lastOf[i];
      if (e === undefined) continue;
      stepSite(e.node.span, e.file, e.frame);
      break;
    }
    return table;
  };

  // 3(i). The instance groups, DEEPEST FIRST, so every descendant of a group has resolved
  //      before the group does. Each group's effects are held in `placed` and committed
  //      below in the original group order, so the plan-wide wall/room arrays, `instances`
  //      and the diagnostic order are exactly what one pass in that order produces.
  const placed = new Map<ResolveGroup, PlacedGroup>();
  /** The ids of the instances' refused pairwise walls, as the root names them (`west.p`). */
  const rootRefusedWalls = new Set<string>();
  /** Each group's frozen datum table, by instance prefix (`""` is the root plan). */
  const datumTables = new Map<string, DatumTable>();
  for (const grp of deepestFirst(groups)) {
    const f = grp.frame!;
    const buffer: Diagnostic[] = [];
    diagSink = buffer;
    // What this instance can reach: its descendants' walls and rooms, carried into its
    // local frame, BEFORE its own — the order the plan-wide arrays hold instances and root
    // in. Every search by position or category (a door hosted by position or by `wall
    // exterior`, `against wall <category>`, a `dim` projection, a wall's height, a rail)
    // reads this array in this order, so it breaks a tie here exactly as it breaks it at
    // the root: the nearest-wall host is first-wins, so a coincident descendant wall wins.
    const view = descendantView(grp, groups, placed, registry);
    // The instance's own relational placement runs inside `resolveGroup`, after its rooms
    // and before its walls, in the LOCAL frame, because `right-of` means the COMPONENT's
    // right — resolving it after the transform would read the page's right instead (ADR
    // 0004 arithmetic, one frame at a time). A descendant's room is a reference only: it
    // carries no `_rel` once transformed. An instance has no `axes` of its own.
    const table = resolveGroup(
      grp,
      view.walls,
      view.rooms,
      { rooms: () => view.rooms, stamp: (d) => stampProvenance(d, grp.frame, undefined) },
      undefined,
      new Set(view.refusedWalls),
    );
    datumTables.set(f.prefix, table);
    const locals = grp.entries.map((e) => e.resolved!);
    const carried: ResolvedElement[] = [];
    // Kinds already refused in THIS instance: a component with ten plugin elements of one
    // kind is one fact, reported once per (instance, kind).
    const refusedKinds = new Set<string>();
    for (const e of grp.entries) {
      const local = e.resolved!;
      const t = tryTransformElement(f, local, registry.byKind.get(local.kind));
      if (typeof t === "string") {
        // A plugin kind whose `ElementDef` has no `transform()` (or a plugin replacing a
        // built-in kind whose inherited built-in `transform()` threw on the plugin's own
        // resolved shape): the frame cannot carry it, and drawing it at its LOCAL
        // coordinates would put it somewhere the author never wrote. So it is dropped from
        // the drawing and reported at the `place`.
        dropped.add(e);
        if (!refusedKinds.has(local.kind)) {
          refusedKinds.add(local.kind);
          const refusal = stampProvenance(
            {
              severity: "error",
              message:
                t === "none"
                  ? `Element kind "${local.kind}" in component "${f.component}" cannot be placed: its plugin ElementDef has no transform()`
                  : `Element kind "${local.kind}" in component "${f.component}" cannot be placed: its plugin ElementDef has no transform(), and the built-in "${local.kind}" transform() it inherits could not read the plugin's resolved shape — the plugin must define its own transform()`,
              code: "E_INSTANCE_NO_TRANSFORM",
              span: f.span,
            },
            f,
            f.file,
          );
          // The primary span IS the `place` statement, so the "placed here" related span
          // `stampProvenance` appends would only repeat it. Dropped for this code alone:
          // every other placed diagnostic points INTO the instance and keeps its pointer out.
          const extra = refusal.relatedSpans?.filter(
            (r) => r.span.start !== f.span?.start || r.span.end !== f.span?.end,
          );
          if (extra?.length) refusal.relatedSpans = extra;
          else delete refusal.relatedSpans;
          diagSink.push(refusal);
        }
        continue;
      }
      e.resolved = t;
      entryOf.set(t, e);
      carried.push(t);
    }
    placed.set(grp, { diagnostics: buffer, local: locals, carried });
  }
  diagSink = diagnostics;

  // 3(ii). Commit the instance groups in the original order, then resolve the root plan
  //        against the plan-wide arrays, which by then carry every instance.
  const instanceBodies = new Map<string, InstanceBody>();
  for (const grp of groups) {
    const done = placed.get(grp);
    if (!done) continue;
    for (const d of done.diagnostics) diagnostics.push(d);
    instanceBodies.set(grp.frame!.prefix, {
      local: grp.entries.flatMap((e, i) => (dropped.has(e) ? [] : [done.local[i]!])),
      imported: grp.entries.some((e) => e.file !== undefined),
    });
    instances.push({
      name: grp.frame!.prefix,
      component: grp.frame!.component,
      at: { x: grp.frame!.tx, y: grp.frame!.ty },
      rotate: grp.frame!.rotate,
      ...(grp.frame!.mirror ? { mirror: grp.frame!.mirror } : {}),
    });
    const derived: RWall[] = [];
    for (const t of done.carried) {
      if (t.kind === "wall") {
        if (t.points.length > 0) walls.push(t);
        else rootRefusedWalls.add(t.id);
      } else if (t.kind === "room") rooms2.push(t);
      else derived.push(...(registry.byKind.get(t.kind)?.yieldsWalls?.(t) ?? []));
    }
    // A group's derived walls follow its authored ones (ADR 0028 §3), as they do in its
    // own resolution, so a first-wins search over the walls prefers the authored wall.
    for (const w of derived) walls.push(w);
  }
  // The plan's positioning axes (定位轴线): plan-level datums, not elements, so they enter
  // the ROOT group's datum table and are evaluated now, before it resolves (ADR 0028 §1).
  // Their positions are expressions, evaluated against the plan's GLOBAL bindings — the
  // block is a plan setting, not a body statement, so it sees every plan-level `let`
  // regardless of where it sits in the file. Snapped like every other coordinate (an
  // off-grid datum would not line up with the rooms it dimensions), then sorted, deduped
  // and labelled by the GB/T rules. An empty block resolves to no axes at all, so
  // `ir.axes` stays absent and the drawing is byte-identical. What the block raises is
  // held in `axesDiags` and reported at step 5, where it always was.
  let axes: RAxis[] | undefined;
  const axesDiags: Diagnostic[] = [];
  if (ast.axes) {
    stepSite(ast.axes.span);
    diagSink = axesDiags;
    try {
      activeEnv = globalScope.flatten();
      // A datum beyond the modelling range is reported (at its expression, else the block)
      // and left out.
      const inRange = (list: Expr[], axis: "x" | "y"): number[] =>
        list.flatMap((e) => {
          const v = snap(evalNum(e));
          if (Math.abs(v) <= MODEL_RANGE_MM) return [v];
          axesDiags.push(outOfRange(`The \`axes\` ${axis} position`, v, exprSpan(e) ?? ast.axes?.span));
          return [];
        });
      const xs = inRange(ast.axes.x, "x");
      const ys = inRange(ast.axes.y, "y");
      const labelled = numberAxes(xs, ys);
      if (labelled.length > 0) axes = labelled;
    } catch (e) {
      // A stopped resolution keeps what was raised before the crossing.
      for (const d of axesDiags) diagnostics.push(d);
      throw e;
    } finally {
      diagSink = diagnostics;
    }
  }
  for (const grp of groups) {
    if (grp.frame) continue;
    // The root's relational placement reads every room in SOURCE order (instances' carried
    // rooms included, as references), exactly the list it always read.
    const table = resolveGroup(
      grp,
      walls,
      rooms2,
      {
        rooms: () =>
          entries.filter((e) => !dropped.has(e) && e.resolved?.kind === "room").map((e) => e.resolved as RRoom),
        stamp: (d) => d,
      },
      axes,
      rootRefusedWalls,
    );
    datumTables.set("", table);
  }

  // 3. IR element list in source order (for rendering), less any element a `place` could
  //    not carry (`E_INSTANCE_NO_TRANSFORM` above). Relational placement has already run,
  //    inside each group's resolution (3a, ADR 0004), so every room here is final. The
  //    elements a statement derives (`ElementDef.yieldsElements`) follow it.
  const resolvedElements = entries
    .filter((e) => !dropped.has(e))
    .flatMap((e) => {
      const kids = registry.byKind.get(e.resolved!.kind)?.yieldsElements?.(e.resolved!) ?? [];
      return kids.length === 0 ? [e.resolved!] : [e.resolved!, ...kids];
    });

  // 3b. The number domain, once every coordinate is final (frames carried, relational rooms
  //     placed): an element whose geometry is non-finite or beyond the modelling range is
  //     reported and DROPPED here, before it can host an opening or reach any consumer.
  //     An opening hosted on a dropped wall goes with it, silently: its host's report is the
  //     one report, and an opening cannot be drawn in a wall that is not there. Every OTHER
  //     diagnostic about a dropped element (its resolve-time errors and warnings) is removed,
  //     so an element out of range is reported exactly once.
  const outside = checkNumberDomain(resolvedElements, registry, diagnostics);
  if (outside.size > 0) {
    // A dropped wall-deriving statement takes its derived walls with it (its bounds and
    // measures are theirs), and so the openings hosted on them below.
    for (const el of [...outside]) {
      for (const w of registry.byKind.get(el.kind)?.yieldsWalls?.(el) ?? []) outside.add(w);
    }
    for (const el of resolvedElements) {
      if ((el.kind === "door" || el.kind === "window" || el.kind === "opening") && el.host) {
        const host = hostWallOf(el.host, walls);
        if (host && outside.has(host)) outside.add(el);
      }
    }
    const droppedEntries = new Set<Entry>();
    for (const e of entries) if (e.resolved && outside.has(e.resolved)) droppedEntries.add(e);
    let kept = 0;
    for (const d of diagnostics) {
      const owner = ownerOf.get(d);
      if (owner === undefined || !droppedEntries.has(owner)) diagnostics[kept++] = d;
    }
    diagnostics.length = kept;
    const keptWalls = walls.filter((w) => !outside.has(w));
    walls.length = 0;
    for (const w of keptWalls) walls.push(w);
  }
  const elements = outside.size > 0 ? resolvedElements.filter((e) => !outside.has(e)) : resolvedElements;

  // 3c. Register openings: each hosted door/window voids its wall's solid.
  registerOpenings(elements, walls);
  // 3d. A demolished wall hosts nothing (B3a). An authored door, window or opening the hosting
  //     rule gave a demolished wall is re-hosted, for the analysis only, on a STANDING wall that
  //     hosts it at its point (the same rule over the standing walls: a coincident `status new`
  //     wall takes it); with none there, or when the statement names the demolished wall by id
  //     (`on <id>`, `wall <id>`), it is refused. The drawing keeps the hosting it always had.
  //     Only a plan that marks a wall `demolish` reaches the loop.
  const rehosted = new Map<ResolvedElement, WallSegment>();
  if (walls.some((w) => w.status === "demolish")) {
    const standingWalls = walls.filter((w) => w.status !== "demolish");
    for (const el of elements) {
      if ((el.kind !== "door" && el.kind !== "window" && el.kind !== "opening") || !el.host) continue;
      if (el.kind === "opening" && el._derived) continue;
      const host = hostWallOf(el.host, walls);
      if (host?.status !== "demolish") continue;
      const entry = entryOf.get(el);
      const node = entry?.node as { attach?: { wall?: string }; wall?: string } | undefined;
      const ref = node?.attach?.wall ?? node?.wall;
      const namesIt = ref !== undefined && (ref === host.id || host.id.endsWith(`.${ref}`));
      if (!namesIt) {
        const { host: seg, onWall } = hostInfoForWalls(standingWalls, el.at, ref);
        if (seg && onWall) {
          rehosted.set(el, seg);
          continue;
        }
      }
      const d = demolishedHostDiagnostic(el, host);
      diagnostics.push(entry ? stampProvenance(d, entry.frame, entry.file) : d);
    }
  }

  // 4. Cross-element checks. Drawability and room references read the plan as authored
  //    (a dropped room is still the room a piece of furniture names, so it raises no
  //    second error); the overlap check reads only what was kept.
  checkPlanDrawable(resolvedElements, diagnostics);
  checkRoomOverlaps(elements, diagnostics, (extras?.storeyCount ?? 1) > 1 ? extras?.level?.level : undefined);
  checkFurnitureRooms(resolvedElements, diagnostics);

  // 5. Positioning axes (定位轴线): evaluated before the root group resolved (step 3(ii)),
  //    because they are part of its datum table; what they raised is reported HERE, after
  //    every element's diagnostic, where it always was, and the step site is put back on
  //    the block as this step always left it.
  if (ast.axes) {
    stepSite(ast.axes.span);
    for (const d of axesDiags) diagnostics.push(d);
  }

  // 5b. The lot line. Same shape as the axes above and for the same reasons: a
  //     plan-level datum whose coordinates are expressions, evaluated against the plan's
  //     GLOBAL bindings and snapped like every other authored coordinate. It REFUSES
  //     rather than approximating — a degenerate or self-crossing ring encloses no single
  //     area, so there is no lot to report an area for and no outline to draw — which is
  //     the `room polygon` precedent applied one layer up.
  let siteBoundary: Point[] | undefined;
  if (ast.site?.boundary) {
    stepSite(ast.site.boundarySpan ?? ast.site.span);
    activeEnv = globalScope.flatten();
    const ring = ast.site.boundary.map((p) => snapPt({ x: evalNum(p.x), y: evalNum(p.y) }));
    const effective = effectiveVertices(ring);
    const span = ast.site.boundarySpan ?? ast.site.span;
    const far = farthest(ring.flatMap((p) => [p.x, p.y]));
    if (far !== undefined) {
      diagnostics.push(outOfRange("The site `boundary`", far, span));
    } else if (effective.length < 3) {
      diagnostics.push({
        severity: "error",
        message:
          `The site \`boundary\` is degenerate — ${effective.length} effective vertices after removing ` +
          `duplicate and collinear points (3 are needed to enclose a lot)`,
        code: "E_SITE_BOUNDARY_DEGENERATE",
        ...(span ? { span } : {}),
      });
    } else if (polygonSelfIntersects(effective)) {
      diagnostics.push({
        severity: "error",
        message: "The site `boundary` self-intersects — its edges cross, so it encloses no single lot",
        code: "E_SITE_BOUNDARY_SELF_INTERSECT",
        ...(span ? { span } : {}),
      });
    } else {
      siteBoundary = ring;
    }
  }

  // 6. The sheet: resolve `paper` (+ the authored `scale`) into an operative scale
  //    denominator, and report an overflow. Purely arithmetic over the extent already
  //    computed above — no rendering, so `describe()` and `toScene()` both just read it.
  //    A multi-storey plan hands one shared sheet in instead (`extras.sheet`), measured
  //    on the whole BUILDING, so every page is issued at the same scale and the overflow
  //    warning is raised once by the caller rather than once per storey.
  const sheet =
    extras.sheet ??
    resolveSheet(
      ast,
      elements,
      walls,
      diagnostics,
      zoneFrame.declared.size > 0 ? [...zoneFrame.declared.values()] : undefined,
      siteBoundary,
      registry,
    );

  // 7. The drawn sizes the plan's own settings scale: a wall's hatch tile and the heaviest
  //    pen, measured on THIS drawing (it needs the sheet, so it runs last).
  //    A storey of a multi-storey plan leaves the pen to `resolveLevelsImpl`, which reports a
  //    plan-level `lineWeight` once for the building rather than once per page.
  checkDrawnSizes(ast, elements, walls, siteBoundary, sheet, registry, diagnostics, extras.level === undefined);

  const ir: ResolvedPlan = {
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    // With a sheet the EFFECTIVE scale is stamped in (auto-fit's choice when the author
    // wrote none), so the title block, the scale bar and describe() all quote the scale
    // the drawing was actually made at.
    scale: sheet ? `1:${fmtDenom(sheet.denom)}` : ast.scale,
    ...(sheet ? { sheet } : {}),
    north: ast.north,
    // Absent unless declared, so the IR of a plan with no `site` is byte-identical.
    ...(ast.site ? { site: ast.site } : {}),
    ...(siteBoundary ? { siteBoundary } : {}),
    autoDims: ast.autoDims,
    ...(axes ? { axes } : {}),
    // Sheet-table opt-ins: presentation flags carried through untouched. Spread so an
    // opted-out plan has no key at all and the IR stays byte-identical to before.
    ...(ast.schedule ? { schedule: ast.schedule } : {}),
    ...(ast.openingSchedule ? { openingSchedule: true } : {}),
    ...(ast.legend ? { legend: true } : {}),
    ...(ast.notes && ast.notes.length > 0 ? { notes: ast.notes } : {}),
    // Declared wing/department grouping — metadata only, absent when the plan
    // declares no `zone`, so an existing IR is byte-identical.
    ...(zoneFrame.declared.size > 0 ? { zones: [...zoneFrame.declared.values()] } : {}),
    // Page identity for a multi-storey plan (absent otherwise → byte-identical IR).
    ...(extras.level ? { level: extras.level.level } : {}),
    ...(extras.level?.name !== undefined ? { levelName: extras.level.name } : {}),
    title: ast.title,
    accTitle: ast.accTitle,
    accDescr: ast.accDescr,
    theme: ast.theme,
    themeBase: ast.themeBase,
    themeFrom: ast.themeFrom,
    styles: ast.styles,
    // The vertical datum. All three are ALWAYS present — unlike every optional
    // key above, they are not "absent when undeclared", because a storey always has a
    // height whether or not anyone wrote one down. The byte-identity law is kept a layer
    // out instead: `describe()` reads `_heightsAuthored` and emits nothing when it is
    // false, so an IR field costs no consumer a byte.
    storeyHeight,
    elevation: extras.elevation ?? 0,
    _heightsAuthored: extras.heightsAuthored ?? plansAuthorHeights(ast),
    _executedWhileSpans: executedWhiles,
    // A `status demolish` wall (B3a) is drawn but stands in no analysis: `elements`/`walls` are
    // the plan after the demolition and `drawn` the plan as drawn. No such wall, no `drawn` key
    // and the very arrays, so the IR is the one it always was.
    ...afterDemolition(elements, walls, rehosted),
    ...(instances.length > 0 ? { instances } : {}),
  };
  datumTablesOfIr.set(ir, datumTables);
  if (instanceBodies.size > 0) instanceBodiesOfIr.set(ir, instanceBodies);

  // 8. The storey's keeps (ADR 0033), last: measured against the plan as it resolved, in plan
  //    coordinates, in source order — on a `paper` plan's drawn pass only (R11). A keep reads, it
  //    never writes; a broken hard keep is one `W_KEEP_VIOLATED`, after every other diagnostic of
  //    the storey. A plan with no keep does none of this and spends no step on it.
  const authoredOf = (): ((id: string) => boolean) => {
    let ids: Set<string> | undefined;
    return (id) => {
      if (!ids) {
        chargeSteps(entries.length + 1);
        ids = new Set();
        // Every id the author wrote, an element later dropped (out of range, not carried) included,
        // so a keep naming one is told it was dropped, not that it was never written.
        for (const e of entries) if (e.idAuthored === true && e.resolved) ids.add(e.resolved.id);
      }
      return ids.has(id);
    };
  };
  const keepState: KeepState = { count: stackedSink.count, limited: stackedSink.limited };
  if (extras.keepAuthored) keepState.authored = authoredOf();
  if (stackedSink.list.length > 0) keepState.stacked = stackedSink.list;
  if (keepSink.list.length > 0 && !extras.probe) {
    const north = ast.north;
    const results = evaluateKeeps(keepSink.list, {
      ir,
      snap,
      authored: keepState.authored ?? authoredOf(),
      compass: {
        aliases: north === "up",
        why:
          typeof north === "object"
            ? `the plan's \`north\` is a bearing of ${fmt3(north.deg)} degrees`
            : `the plan's \`north\` is \`${north}\``,
      },
      ...(extras.level ? { level: extras.level.level } : {}),
      ...((extras.storeyCount ?? 1) > 1 && extras.level ? { namingLevel: extras.level.level } : {}),
      diag: (d) => {
        chargeSteps(DIAGNOSTIC_STEPS);
        diagnostics.push(d);
      },
    });
    for (const r of results) {
      if (r.grade === "hard" && !r.holds) {
        chargeSteps(DIAGNOSTIC_STEPS);
        diagnostics.push(violationOf(r));
      }
    }
    keepState.results = results;
  }
  if (keepSink.count > 0 || keepState.authored || keepState.stacked) keepStateOfIr.set(ir, keepState);
  return { ir, diagnostics };
}

// ---- resolveImpl stages (pure moves — each does one job) -----------------------

/** A scale denominator as it appears in `1:<denom>`: integral when it is whole. */
function fmtDenom(d: number): string {
  return Number.isInteger(d) ? String(d) : String(Number(d.toFixed(4)));
}

/**
 * Resolve the plan's `paper` declaration into a {@link ResolvedSheet}, and raise the
 * advisory `W_SCALE_OVERFLOW` when the building does not fit the sheet at the scale in
 * force. Returns undefined for a plan with no `paper` — the historical
 * reference-dimension sizing path, byte-for-byte unchanged.
 *
 * The fit is measured on the building's OUTER wall faces (what a builder and a GB/T
 * overall dimension see), against the sheet minus its margins, the `dims auto` chain
 * bands, the bottom chrome band and the margin-table row `schedule rooms` / `legend`
 * occupy below it — the one rule in `src/sheet.ts`.
 *
 * An authored `scale` is never overridden: an overflow is reported and the drawing is
 * never clipped (the page grows to contain it — scene-build), because silently re-scaling
 * a drawing out from under the scale in its own title block would be a lie.
 */
function resolveSheet(
  ast: PlanNode,
  elements: ResolvedElement[],
  walls: RWall[],
  diagnostics: Diagnostic[],
  zones: readonly RZone[] | undefined,
  siteBoundary: readonly Point[] | undefined,
  registry: Registry,
): ResolvedSheet | undefined {
  if (!ast.paper) return undefined;
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const { building: extent, drawn } = sheetExtents(elements, walls, siteBoundary, registry);
  // A sheet always carries a SCALE row (the effective scale is stamped in below), so the
  // row count is scale-independent — pass a placeholder so the band reserved for the
  // title block does not depend on which denominator we are testing.
  const fit: SheetFitInput = {
    extent,
    autoDims: ast.autoDims !== undefined,
    titleRows: titleRows(ast.title, "1:1").length,
    // The margin tables occupy a second band below the chrome, and it has to be reserved
    // here or the page can be issued taller than the paper it declares. Counted from the
    // same derivation `toScene()` draws them with (`planTableRows`), never re-derived.
    tableRows: planTableRows({
      schedule: ast.schedule,
      legend: ast.legend,
      rooms,
      zones,
      walls,
      furniture: elements.filter((e): e is RFurniture => e.kind === "furniture"),
      outdoor: elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
      openingSchedule: ast.openingSchedule,
      elements,
      notes: ast.notes,
    }),
  };
  const sheet = resolveSheetSpec(ast.paper, scaleInRange(ast, diagnostics), fit, drawn);
  const usable = usablePlanMm(sheet.widthMm, sheet.heightMm, sheet.denom, fit);
  // Exactly one of the two, never both. The drawn extent CONTAINS the building, so
  // `fits === false` implies `drawingFits === false`, and the second warning would repeat
  // the first on every plan it already covers — noise, and `W_SCALE_OVERFLOW` already names
  // the same remedies. What `W_DRAWING_OVERFLOW` reports is the case nothing else could
  // see: the building fits and the drawing still does not.
  if (!sheet.fits) diagnostics.push(scaleOverflowDiagnostic(ast, sheet, extent, usable));
  else if (!sheet.drawingFits) diagnostics.push(drawingOverflowDiagnostic(ast, sheet, drawn, usable));
  return sheet;
}

/**
 * The authored `scale`, or undefined (after one `E_OUT_OF_RANGE`) when its denominator would
 * put the `paper` sheet, in plan millimetres, past the modelling range — the sheet is then
 * auto-fitted, so nothing downstream sizes a pen or a font from it. Without `paper` a scale
 * is a title-block annotation and measures nothing, so it is not held.
 */
function scaleInRange(ast: PlanNode, diagnostics: Diagnostic[]): string | undefined {
  const denom = scaleDenominator(ast.scale);
  if (!ast.paper || denom === null) return ast.scale;
  const { w, h } = paperMm(ast.paper.size, ast.paper.orientation);
  const max = maxScaleDenominator(Math.max(w, h));
  if (denom <= max) return ast.scale;
  diagnostics.push(
    outOfRangeDiagnostic(
      `\`scale ${ast.scale}\` on ${ast.paper.size} puts the sheet at ${fmt3(denom * Math.max(w, h))} mm, outside the ` +
        `modelling range of ±${fmt3(MODEL_RANGE_MM)} mm (the largest denominator on ${ast.paper.size} is ${max})`,
      ast.scaleSpan,
    ),
  );
  return undefined;
}

/**
 * The advisory `W_SCALE_OVERFLOW`, built in one place so the single-storey path and the
 * multi-storey shared-sheet pass word it identically.
 *
 * It quotes BOTH numbers — the building and the drawing area it is measured against — so
 * the verdict is checkable rather than asserted, and so a reader can see when the sheet
 * FURNITURE is what consumed the room (a schedule and a legend take a real band, and
 * adding one can raise this with no change to the plan's geometry at all).
 *
 * It deliberately does not promise that the page grows. That is the usual consequence, but
 * a marginal overflow eats the sheet margin instead and comes out exactly paper-sized — so
 * what is stated is the invariant that actually holds: nothing is clipped.
 */
function scaleOverflowDiagnostic(
  ast: PlanNode,
  sheet: ResolvedSheet,
  extent: { w: number; h: number },
  usable: { w: number; h: number },
): Diagnostic {
  return {
    severity: "warning",
    code: "W_SCALE_OVERFLOW",
    message:
      `The drawing does not fit ${sheet.size} ${sheet.orientation} at 1:${fmtDenom(sheet.denom)} — ` +
      `the building measures ${Math.round(extent.w)}×${Math.round(extent.h)} mm on its outer faces, ` +
      `against ${Math.round(usable.w)}×${Math.round(usable.h)} mm of drawing area once the margins, ` +
      `dimension bands, title block and margin tables are taken out. ` +
      `Nothing is clipped — the sheet margin gives way first, and the page grows past the paper if ` +
      `that is not enough; use a larger sheet, a coarser scale, or one fewer margin table.`,
    span: ast.scaleSpan ?? ast.paperSpan,
  };
}

/**
 * The advisory `W_DRAWING_OVERFLOW` — the residual `W_SCALE_OVERFLOW` cannot see.
 *
 * Same ruler, different subject. `W_SCALE_OVERFLOW` measures the BUILDING against the
 * sheet's drawing area; this measures **everything the plan draws** against that same
 * area, because a plan draws ground, fences, a lot line and eaves the building's
 * outer-face extent does not contain, and none of it can make the fit test say no. It
 * quotes the whole drawing's extent, the same drawing area the other rule quotes, and the
 * OVERFLOW ITSELF on each axis, so a reader can tell a millimetre of eaves from a 40 m
 * yard — the two want different answers.
 *
 * **It does not promise the page grows**, and that is measurement rather than caution: of
 * the three shipped examples that raise it, only `garden-house` is actually issued on a
 * larger page (+1.01%); `courtyard-house`'s eaves overrun by 90 plan mm at 1:100 and
 * `hillside-villa`'s by 715 at 1:50, and both come out exactly paper-sized because the
 * reserved margin gives way first. `W_SCALE_OVERFLOW` words its own consequence the same
 * way for the same reason. The measured page fact is `SceneSheet.grown`, which needs a
 * laid-out Scene.
 *
 * It carries no machine-applicable fix, for the reason `W_SCALE_OVERFLOW` carries none:
 * every remedy rewrites a decision the author made (which paper, which scale, how much
 * ground to draw), and picking one for them is exactly the invisible architect ADR 0005
 * refuses. Unlike `W_SCALE_OVERFLOW` there is not even a defensible default — a coarser
 * scale shrinks a building the author had already sized correctly for the sheet.
 */
function drawingOverflowDiagnostic(
  ast: PlanNode,
  sheet: ResolvedSheet,
  drawn: { w: number; h: number },
  usable: { w: number; h: number },
): Diagnostic {
  const over = (d: number, u: number): string => (d > u ? `${Math.round(d - u)} mm` : "none");
  return {
    severity: "warning",
    code: "W_DRAWING_OVERFLOW",
    message:
      `The BUILDING fits ${sheet.size} ${sheet.orientation} at 1:${fmtDenom(sheet.denom)}, but the whole ` +
      `DRAWING does not — everything drawn measures ${Math.round(drawn.w)}×${Math.round(drawn.h)} mm ` +
      `against ${Math.round(usable.w)}×${Math.round(usable.h)} mm of drawing area, over by ` +
      `${over(drawn.w, usable.w)} across and ${over(drawn.h, usable.h)} down. ` +
      `The excess is the part of the drawing that is not the building — \`outdoor\` ground, a \`fence\`, ` +
      `a \`site … boundary\`, a \`roof\` eaves line — none of which the fit test measures, which is ` +
      `why \`sheet.fits\` is still true. Nothing is clipped: the reserved sheet margin gives way first, and ` +
      `only if that is not enough does the page grow past the paper. Use a larger sheet, a coarser scale, ` +
      `or draw less ground.`,
    span: ast.paperSpan ?? ast.scaleSpan,
  };
}

/** One resolution group: the entries of a single coordinate frame. */
interface ResolveGroup {
  /** The instance frame, or absent for the root plan. */
  frame?: Frame;
  entries: Entry[];
}

/** What resolving one instance group produced, held until the groups are committed. */
interface PlacedGroup {
  /** Every diagnostic the group raised, in the order it raised them. */
  diagnostics: Diagnostic[];
  /** Each entry's element in the instance's LOCAL frame, parallel to the group's entries. */
  local: ResolvedElement[];
  /** The elements carried into plan coordinates, in entry order (dropped ones absent). */
  carried: ResolvedElement[];
}

/** How many `place`s enclose this instance's own (0 for a top-level instance). */
function frameDepth(f: Frame): number {
  let n = 0;
  for (let p = f.parent; p; p = p.parent) n++;
  return n;
}

/**
 * The instance groups in resolution order: deepest first, ties in the original order. Every
 * descendant of an instance is strictly deeper, so it resolves before the instance does.
 */
function deepestFirst(groups: readonly ResolveGroup[]): ResolveGroup[] {
  return groups
    .flatMap((grp, i) => (grp.frame ? [{ grp, i, depth: frameDepth(grp.frame) }] : []))
    .sort((x, y) => y.depth - x.depth || x.i - y.i)
    .map((x) => x.grp);
}

/**
 * The frame that carries descendant `d`'s local coordinates into `ancestor`'s: the authored
 * `place` frames between them, composed outermost first, with ids named relative to the
 * ancestor (`g.c2.main` is `c2.main` in `g`). That is the frame `d` would have if the
 * ancestor's body were compiled as the plan, by the same frame arithmetic. It is NOT the
 * frame `d`'s elements reach the plan by: a host found on this view is carried on by the
 * ancestor's frame, `tp(A, tp(rel, p))`, while `d`'s own wall goes through the composed
 * frame, `tp(A∘rel, p)` — equal for integers, not always for floats (grid 0). Which is why
 * `registerOpenings` matches a host to its wall by id, never by coordinates.
 * `undefined` when `d` is not a descendant of `ancestor`. Walking the chain per
 * (group, descendant) pair is quadratic in the nesting, which place depth keeps small.
 */
function relativeFrame(ancestor: Frame, d: Frame): Frame | undefined {
  const chain: Frame[] = [];
  let f: Frame | undefined = d;
  for (; f && f !== ancestor; f = f.parent) chain.push(f);
  if (!f || chain.length === 0) return undefined;
  const localOf = (x: Frame): Frame => x.local ?? x;
  let rel = localOf(chain[chain.length - 1]!);
  for (let i = chain.length - 2; i >= 0; i--) rel = composeFrame(rel, localOf(chain[i]!));
  return { ...rel, prefix: d.prefix.slice(ancestor.prefix.length + 1) };
}

/**
 * The walls and rooms instance group `grp` can reach before its own: every descendant
 * instance's, carried into `grp`'s local frame by {@link relativeFrame}, in the original
 * group order — the order the plan-wide arrays hold instances in. Siblings and ancestors are
 * not descendants, so they never appear (a component cannot reach out of itself).
 */
function descendantView(
  grp: ResolveGroup,
  groups: readonly ResolveGroup[],
  placed: ReadonlyMap<ResolveGroup, PlacedGroup>,
  registry: Registry,
): { walls: RWall[]; rooms: RRoom[]; refusedWalls: string[] } {
  const walls: RWall[] = [];
  const rooms: RRoom[] = [];
  const refusedWalls: string[] = [];
  for (const d of groups) {
    const done = placed.get(d);
    if (!d.frame || !done) continue;
    const rel = relativeFrame(grp.frame!, d.frame);
    if (!rel) continue;
    const derived: RWall[] = [];
    for (const local of done.local) {
      const def = registry.byKind.get(local.kind);
      if (local.kind !== "wall" && local.kind !== "room" && !def?.yieldsWalls) continue;
      const v = tryTransformElement(rel, local, def);
      // A refusal is neither a wall nor a room: the descendant's own pass already dropped
      // and reported it.
      if (typeof v === "string") continue;
      if (v.kind === "wall") {
        if (v.points.length > 0) walls.push(v);
        else refusedWalls.push(v.id);
      } else if (v.kind === "room") rooms.push(v);
      else derived.push(...(def?.yieldsWalls?.(v) ?? []));
    }
    for (const w of derived) walls.push(w);
  }
  return { walls, rooms, refusedWalls };
}

/**
 * Partition the expanded entry stream by coordinate frame — one group per `place`d
 * instance (keyed on the frame OBJECT, which every entry of that instance shares), plus
 * the root plan.
 *
 * Instance groups come FIRST, in first-appearance order, and the root LAST. That is the
 * order the groups' effects are COMMITTED in (the plan-wide wall/room arrays, `instances`,
 * diagnostics); the instances RESOLVE deepest first ({@link deepestFirst}) so each one can
 * reference its descendants, and the root resolves last so it can reference every
 * instance (`door on west.perimeter`). Element ORDER in the drawing is untouched —
 * `elements` is rebuilt from `entries` in source order after every group has resolved.
 *
 * A plan with no `place` yields exactly one group holding every entry: the historical
 * single pass.
 */
function groupEntries(entries: Entry[]): ResolveGroup[] {
  const byFrame = new Map<Frame, Entry[]>();
  const root: Entry[] = [];
  for (const e of entries) {
    if (!e.frame) {
      root.push(e);
      continue;
    }
    const got = byFrame.get(e.frame);
    if (got) got.push(e);
    else byFrame.set(e.frame, [e]);
  }
  const out: ResolveGroup[] = [];
  for (const [frame, grouped] of byFrame) out.push({ frame, entries: grouped });
  out.push({ entries: root });
  return out;
}

/**
 * What one `walls from rooms` statement is charged per room of its group at expansion, toward
 * {@link MAX_ELEMENTS}, before anything resolves (ADR 0028 §3, "Bounds, charged before
 * allocating"): `6n` partition pieces and `4n` ring vertices for `n` rooms. It is NOT an upper
 * bound on what the statement derives: every authored wall lying on a derived line splits it
 * once more, so the derivation counts its real walls again before allocating them and charges
 * any excess over this pre-charge (`ResolveCtx.elementBudget`, `E_ELEMENT_LIMIT`).
 */
export const DERIVED_ELEMENTS_PER_ROOM = 10;

/**
 * Count each wall-deriving statement (`ElementDef.yieldsWalls`) toward the element budget
 * with the upper bound of what it can derive, once expansion is done and the groups are
 * known: `DERIVED_ELEMENTS_PER_ROOM` per room its group declares. A statement that would
 * cross the cap is `E_ELEMENT_LIMIT` at the statement, reported once, and it and every later
 * deriving statement are removed, so nothing past the cap is derived. A plan with no such
 * statement is untouched.
 */
function chargeDerivedElements(
  entries: Entry[],
  groups: ResolveGroup[],
  registry: Registry,
  budget: ElementBudget,
  diagnostics: Diagnostic[],
): Map<Entry, number> {
  const charged = new Map<Entry, number>();
  const refused = new Set<Entry>();
  for (const grp of groups) {
    let rooms = -1;
    for (const e of grp.entries) {
      const def = registry.byKind.get(e.node.kind);
      // A statement that is no deriver may still count toward the budget beyond itself (a
      // `wall … around` ring, ADR 0028 §4): `ElementDef.expansionCharge`.
      const extra = def?.yieldsWalls ? undefined : def?.expansionCharge?.(e.node);
      if (!def?.yieldsWalls && !(extra && extra.count > 0)) continue;
      if (budget.capped) {
        refused.add(e);
        continue;
      }
      let count: number;
      let what: string;
      if (extra) {
        count = extra.count;
        what = extra.what;
      } else {
        if (rooms < 0) rooms = grp.entries.filter((x) => x.node.kind === "room").length;
        count = DERIVED_ELEMENTS_PER_ROOM * rooms;
        charged.set(e, count);
        what = `\`walls from rooms\` over ${rooms} rooms may derive up to ${count} walls`;
      }
      budget.count += count;
      if (budget.count <= MAX_ELEMENTS) continue;
      budget.capped = true;
      refused.add(e);
      diagnostics.push(
        stampProvenance(
          {
            severity: "error",
            message: `Plan expands to more than ${MAX_ELEMENTS} elements: ${what}, so it derives none`,
            code: "E_ELEMENT_LIMIT",
            ...(e.node.span ? { span: e.node.span } : {}),
          },
          e.frame,
          e.file,
        ),
      );
    }
  }
  if (refused.size === 0) return charged;
  const keep = (e: Entry): boolean => !refused.has(e);
  const kept = entries.filter(keep);
  entries.length = 0;
  entries.push(...kept);
  for (const grp of groups) grp.entries = grp.entries.filter(keep);
  return charged;
}

/** Assign ids in registry order: explicit ids are checked for duplicates; missing
 *  ones get `<prefix>_<n>` numbered globally per kind, so auto-ids stay unique
 *  across component instances. */
function assignIds(entries: Entry[], registry: Registry, diagnostics: Diagnostic[]): void {
  const seen = new Set<string>();
  const assignId = (provided: string, prefix: string, idx: number, span?: Span): string => {
    if (provided) {
      if (seen.has(provided)) {
        diagnostics.push({ severity: "error", message: `Duplicate id "${provided}"`, code: "E_DUP_ID", span });
      }
      seen.add(provided);
      return provided;
    }
    let auto = `${prefix}_${idx}`;
    while (seen.has(auto)) auto = `${auto}_`;
    seen.add(auto);
    return auto;
  };
  for (const def of registry.order) {
    let idx = 0;
    for (const e of entries) {
      if (e.node.kind !== def.kind) continue;
      idx++;
      e.idAuthored = Boolean(e.node.id);
      e.id = assignId(e.node.id, def.idPrefix(e.node), idx, e.node.span);
    }
  }
  // The ids a statement gives the elements it derives (`ElementDef.authoredChildIds`): checked
  // against every other id, after them, so a duplicate is reported on the later name.
  for (const e of entries) {
    for (const c of registry.byKind.get(e.node.kind)?.authoredChildIds?.(e.node) ?? []) assignId(c.id, "", 0, c.span);
  }
}

/**
 * Record how an element's position was authored — the degrees-of-freedom marker
 * read by `describe().freedom`. Pure classification from the AST node (and the
 * strip origin); sets an internal `_placement` field that never reaches the Scene.
 * `node.kind === r.kind` here (the resolve loop matches by kind), so the casts are safe.
 */
function markPlacement(r: ResolvedElement, node: AstElement, fromStrip: boolean): void {
  switch (r.kind) {
    case "room":
      r._placement = fromStrip ? "strip" : r._rel !== undefined ? "relational" : "absolute";
      return;
    case "door":
    case "window":
    case "opening":
      // A relational opening (ADR 0028 §5) marked itself when it resolved.
      if (r._placement === "relational") return;
      r._placement = (node as DoorNode | WindowNode | OpeningNode).attach !== undefined ? "attached" : "absolute";
      return;
    case "furniture": {
      const fn = node as FurnitureNode;
      r._placement =
        fn.againstEdge !== undefined
          ? "relational"
          : fn.against !== undefined
            ? "against-wall"
            : fn.place !== undefined
              ? "anchored"
              : "absolute";
      return;
    }
  }
}

/**
 * Each hosted door/window/opening voids its wall's solid. The owning wall is found by
 * IDENTITY: the host segment came from `segmentsOfWall`, so it carries its wall's id, and a
 * `place` frame namespaces that id with the same `nsId` as the wall's own. Coordinates are
 * not an identity: a host an instance found on a DESCENDANT's wall was carried by the
 * descendant's frame and then by the instance's (`tp(P, tp(C, s))`), while the wall itself
 * was carried by the composed frame (`tp(P∘C, s)`) — the same point by two float evaluation
 * orders, which need not be equal when the grid is 0. Endpoint equality survives only to
 * choose among walls that share an id (an `E_DUP_ID` plan), and as the fallback for a host
 * whose id names no wall.
 */
/**
 * {@link ResolvedPlan}'s `elements`/`walls`/`drawn` from the storey as resolved (B3a): the very
 * arrays when no wall is `status demolish`, else the plan after the demolition plus `drawn`.
 *
 * The plan after the demolition drops every demolished wall and every opening a `walls from rooms
 * … status demolish` statement derived on one (it stood in the wall). An opening step 3d re-hosted
 * on a standing wall is a copy carrying its new host, and that wall a copy carrying the opening,
 * so the drawn objects (the hosting the drawing always had) are never touched.
 *
 * The plan as drawn drops that derived opening too (A8): it goes with its wall, so the sheet draws
 * no opening, tags none and schedules none that `describe()` does not know. The demolished wall
 * keeps the void the opening cut in it: that gap is the wall's own outline as it stands before the
 * works, and the wall is drawn dashed with it.
 */
function afterDemolition(
  elements: ResolvedElement[],
  walls: RWall[],
  rehosted: ReadonlyMap<ResolvedElement, WallSegment>,
): Pick<ResolvedPlan, "elements" | "walls" | "drawn"> {
  if (!walls.some((w) => w.status === "demolish")) return { elements, walls };
  const demolished = (e: ResolvedElement): boolean => e.kind === "wall" && (e as RWall).status === "demolish";
  const onDemolished = (e: ResolvedElement): boolean =>
    e.kind === "opening" && e._derived !== undefined && !!e.host && hostWallOf(e.host, walls)?.status === "demolish";
  const standingWalls = walls.filter((w) => !demolished(w));
  // The standing walls that take a re-hosted opening, as copies with the opening appended.
  const copies = new Map<RWall, RWall>();
  const moved = new Map<ResolvedElement, ResolvedElement>();
  for (const [el, seg] of rehosted) {
    const o = el as RDoor | RWindow | ROpening;
    const target = hostWallOf(seg, standingWalls);
    if (!target) continue;
    const copy = copies.get(target) ?? { ...target, openings: [...target.openings] };
    copy.openings.push({
      at: o.at,
      width: o.width,
      kind: o.kind,
      ownerId: o.id,
      sill: o.kind === "window" ? o.sill : 0,
      head: o.head,
    });
    copies.set(target, copy);
    moved.set(el, { ...o, host: seg });
  }
  const after = (e: ResolvedElement): ResolvedElement =>
    moved.get(e) ?? (e.kind === "wall" ? (copies.get(e as RWall) ?? e) : e);
  return {
    elements: elements.filter((e) => !demolished(e) && !onDemolished(e)).map(after),
    walls: standingWalls.map((w) => copies.get(w) ?? w),
    drawn: { elements: elements.filter((e) => !onDemolished(e)), walls },
  };
}

/** `E_OPENING_ON_DEMOLISHED_WALL`: a door, window or opening stands in a `status demolish` wall.
 *  Named as a person would (the kind and the line the wall runs on); the ids are in the hint. */
function demolishedHostDiagnostic(el: RDoor | RWindow | ROpening, host: RWall): Diagnostic {
  const s = el.host!;
  const line =
    s.a.x === s.b.x && s.a.y !== s.b.y
      ? ` at x ${fmt3(s.a.x)}`
      : s.a.y === s.b.y && s.a.x !== s.b.x
        ? ` at y ${fmt3(s.a.y)}`
        : "";
  const kind = host.category === "partition" ? "partition" : `${host.category} wall`;
  return {
    severity: "error",
    code: "E_OPENING_ON_DEMOLISHED_WALL",
    message: `A ${el.kind} stands in the ${kind}${line}, which is marked \`status demolish\`: a demolished wall hosts nothing`,
    ...(el.span ? { span: el.span } : {}),
    hints: [
      `The ${el.kind} is "${el.id}" and the wall "${host.id}". Remove the ${el.kind} (it goes with the wall), host it on a wall that stays, or keep the wall (\`status existing\`).`,
    ],
  };
}

/** The wall a hosted opening's segment belongs to: by id when that is unique, else the wall
 *  (among the named ones, or all) that has exactly this segment. */
function hostWallOf(seg: WallSegment, walls: readonly RWall[]): RWall | undefined {
  const sameSegment = (w: RWall) =>
    segmentsOfWall(w).some((s) => s.a.x === seg.a.x && s.a.y === seg.a.y && s.b.x === seg.b.x && s.b.y === seg.b.y);
  const named = walls.filter((w) => w.id === seg.wallId);
  if (named.length === 1) return named[0];
  return (named.length > 1 ? named : walls).find(sameSegment);
}

function registerOpenings(elements: ResolvedElement[], walls: RWall[]): void {
  const wallOfSegment = (seg: WallSegment): RWall | undefined => hostWallOf(seg, walls);
  for (const el of elements) {
    if ((el.kind === "door" || el.kind === "window" || el.kind === "opening") && el.host) {
      // `kind`/`ownerId`/`sill`/`head` are APPENDED facts: the wall lowering reads
      // `at` and `width` and nothing else — a door's hole and a window's hole are the same
      // hole — so no drawing moves. They are here because this list is the only place a
      // wall knows what is cut into it, which is what a 2.5D slice at a given height needs.
      wallOfSegment(el.host)?.openings.push({
        at: el.at,
        width: el.width,
        kind: el.kind,
        ownerId: el.id,
        sill: el.kind === "window" ? el.sill : 0,
        head: el.head,
      });
    }
  }
}

/** The value of largest magnitude beyond {@link MODEL_RANGE_MM}, or undefined when every
 *  value is within it (the first such value on a tie, so the message is deterministic). */
function farthest(values: readonly number[]): number | undefined {
  let far: number | undefined;
  for (const v of values)
    if (Math.abs(v) > MODEL_RANGE_MM && (far === undefined || Math.abs(v) > Math.abs(far))) far = v;
  return far;
}

/** The one `E_OUT_OF_RANGE` diagnostic: names the value, the limit and the unit. */
function outOfRange(what: string, value: number, span: Span | undefined, file?: string): Diagnostic {
  return outOfRangeDiagnostic(
    `${what} reaches ${fmt3(value)} mm, outside the modelling range of ±${fmt3(MODEL_RANGE_MM)} mm ` +
      `(2^25 mm, about 33.5 km)`,
    span,
    file,
  );
}

/**
 * The number domain of the resolved plan, checked ONCE, after every `place` frame is carried
 * and every relational room placed, so each value is the element's final plan coordinate.
 *
 * - **Non-finite** (`E_NON_FINITE`): the expression language never yields a non-finite number,
 *   but two finite inputs can still overflow once the resolver combines them — a corner
 *   `x + w`, a room's area `w * h`.
 * - **Beyond the modelling range** (`E_OUT_OF_RANGE`): every point an element draws to (its
 *   `bounds()`, taken from the shape itself) and every coordinate and length it is made of
 *   (its `measures()`) lies within ±{@link MODEL_RANGE_MM}. A finite value past it is not a
 *   building, and it is what ran a stair's tread loop out of memory and printed `Infinity`
 *   for a dimension line.
 *
 * One diagnostic per element, at its span, non-finite first. The element is then DROPPED
 * (returned here; the caller removes it before openings are registered), so no later stage
 * (an opening's hole, the overlap check, the sheet fit, the drawing) forms a product from it.
 * `fmt3`'s `"0"` for a non-finite number stays only as a backstop.
 */
function checkNumberDomain(
  elements: ResolvedElement[],
  registry: Registry,
  diagnostics: Diagnostic[],
): Set<ResolvedElement> {
  const outside = new Set<ResolvedElement>();
  let total = 0;
  let totalSpan: Span | undefined;
  for (const el of elements) {
    const def = registry.byKind.get(el.kind);
    const pts = def ? def.bounds(el) : [];
    const values = def?.measures ? def.measures(el) : [];
    let what: string | undefined;
    if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) what = `The extent of ${el.kind} "${el.id}"`;
    else if (values.some((v) => !Number.isFinite(v))) what = `A dimension of ${el.kind} "${el.id}"`;
    let area = 0;
    if (what === undefined && el.kind === "room") {
      const r = el as RRoom;
      area = r.poly ? polygonArea(r.poly) : r.size.w * r.size.h;
      if (!Number.isFinite(area)) what = `The area of room "${r.id}"`;
    }
    const span = (el as { span?: Span }).span;
    if (what !== undefined) {
      diagnostics.push({
        severity: "error",
        message: `${what} is not finite (the dimensions overflow the number range)`,
        code: "E_NON_FINITE",
        span,
        ...(el._file ? { file: el._file } : {}),
      });
      outside.add(el);
      continue;
    }
    const far = farthest([...pts.flatMap((p) => [p.x, p.y]), ...values]);
    if (far !== undefined) {
      diagnostics.push(outOfRange(`The geometry of ${el.kind} "${el.id}"`, far, span, el._file));
      outside.add(el);
      continue;
    }
    if (el.kind === "room") {
      // A backstop: rooms inside the modelling range cannot overflow the sum, but the
      // check costs nothing and keeps the derived total in the closed domain by itself.
      total += area;
      if (!Number.isFinite(total) && totalSpan === undefined) totalSpan = span;
    }
  }
  if (!Number.isFinite(total)) {
    diagnostics.push({
      severity: "error",
      message: "The total room area is not finite (the dimensions overflow the number range)",
      code: "E_NON_FINITE",
      span: totalSpan,
    });
  }
  return outside;
}

/**
 * The two drawn sizes a plan's settings scale without bound, held to the modelling range on
 * THIS drawing: a wall's hatch pattern tile (its hatch `scale` × the drawing's hatch module)
 * and the heaviest pen (the theme `lineWeight` × the drawing's wall stroke). Both depend on
 * the drawing's reference dimension, so a coarse `scale 10` is fine on a house and refused only
 * where the tile really leaves the range; `1e308` used to draw `width="Infinity"` and
 * `stroke-width="Infinity"`. Sizes come from `renderSizes`, the function `toScene()` draws
 * with, and the tile from `hatchTileMm`, the markup the pattern is drawn with.
 *
 * Skipped (no work, no output) when nothing could exceed it. Inside the range the reference
 * dimension is at most 2²⁶ mm (the larger side of an extent within ±2²⁵, or 100 mm × a paper
 * denominator `scaleInRange` holds below 2²⁵ / 297), so with every hatch `scale` ≤ 1 and no
 * authored `lineWeight` a tile is at most 4 × 0.013 × 2²⁶ mm and the pen 0.0028 × 2²⁶ × 1.1 mm
 * (1.1 is a built-in theme's heaviest weight), both well inside it.
 */
function checkDrawnSizes(
  ast: PlanNode,
  elements: readonly ResolvedElement[],
  walls: readonly RWall[],
  siteBoundary: readonly Point[] | undefined,
  sheet: ResolvedSheet | undefined,
  registry: Registry,
  diagnostics: Diagnostic[],
  checkPen: boolean,
): void {
  const lw = ast.theme?.lineWeight;
  if (lw === undefined && !walls.some((w) => w.hatchScale > 1)) return;
  const b = drawingBounds(elements, siteBoundary, registry);
  const sizes = renderSizes(sheet, b.maxX - b.minX, b.maxY - b.minY, lw ?? 1);
  if (checkPen && lw !== undefined && !(Math.abs(sizes.wallStroke) <= MODEL_RANGE_MM)) {
    diagnostics.push(penOutOfRange(lw, sizes.wallStroke, ast.lineWeightSpan));
  }
  for (const w of walls) {
    if (!(w.hatchScale > 1)) continue;
    const tile = hatchTileMm(hatchOf(w), sizes.hatchGap);
    if (tile <= MODEL_RANGE_MM) continue;
    diagnostics.push(
      outOfRangeDiagnostic(
        `Wall "${w.id}" hatch \`scale\` ${fmt3(w.hatchScale)} draws a pattern tile of ${drawnSize(tile)} on this drawing, outside ${DRAWN_LIMIT}`,
        w._hatchScaleSpan ?? w.span,
        w._file,
      ),
    );
  }
}

/** How the drawn-size checks name the range they hold a size to. */
const DRAWN_LIMIT = `the modelling range of ±${fmt3(MODEL_RANGE_MM)} mm (2^25 mm, about 33.5 km)`;

/** A drawn size for a message: millimetres, or a phrase when it left the finite numbers. */
function drawnSize(v: number): string {
  return Number.isFinite(v) ? `${fmt3(v)} mm` : "a size past the number range";
}

/**
 * The `E_OUT_OF_RANGE` for a theme `lineWeight` whose heaviest pen leaves the range. `from`
 * says where a value with no source span came from (the compile options), and the report is
 * then placed at the plan header.
 */
function penOutOfRange(lw: number, stroke: number, span: Span | undefined, from?: string): Diagnostic {
  // A value from the API may be anything; only a finite number is printed as one.
  const value = typeof lw === "number" && Number.isFinite(lw) ? fmt3(lw) : "that is not a finite number";
  return outOfRangeDiagnostic(
    `Theme \`lineWeight\` ${value}${from ? ` (${from})` : ""} draws the heaviest pen at ${drawnSize(stroke)} on this drawing, outside ${DRAWN_LIMIT}`,
    span,
  );
}

/**
 * The heaviest pen a `lineWeight` draws on one resolved storey: the wall stroke of the same
 * {@link renderSizes} `toScene()` draws with, measured on the same drawing bounds.
 */
function heaviestPen(ir: ResolvedPlan, lw: number, registry: Registry): number {
  const b = drawingBounds(drawnView(ir).elements, ir.siteBoundary, registry);
  return renderSizes(ir.sheet, b.maxX - b.minX, b.maxY - b.minY, lw).wallStroke;
}

/**
 * Hold a `lineWeight` to the drawn-pen rule once per PLAN: on a multi-storey plan the first
 * storey (in drawing order) whose heaviest pen leaves the range is reported, tagged with its
 * level, rather than once per page. Returns undefined when every page's pen is in range.
 */
export function lineWeightOutOfRange(
  storeys: readonly { ir: ResolvedPlan; level?: number }[],
  lw: number,
  span: Span | undefined,
  registry: Registry,
  from?: string,
): Diagnostic | undefined {
  for (const s of storeys) {
    const stroke = heaviestPen(s.ir, lw, registry);
    if (Math.abs(stroke) <= MODEL_RANGE_MM) continue;
    const d = penOutOfRange(lw, stroke, span, from);
    return s.level !== undefined ? { ...d, level: s.level } : d;
  }
  return undefined;
}

/** W_EMPTY_PLAN: the plan resolves but contains nothing drawable. */
function checkPlanDrawable(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  const drawable = elements.some(
    (e) =>
      e.kind === "wall" ||
      e.kind === "room" ||
      e.kind === "furniture" ||
      e.kind === "column" ||
      e.kind === "stair" ||
      e.kind === "elevator" ||
      e.kind === "escalator" ||
      e.kind === "roof" ||
      e.kind === "void" ||
      // A SITE PLAN — a lot line, a lawn, a driveway and a fence, with the building
      // drawn on another sheet — is a real drawing with no wall and no room in it. It
      // would be wrong to tell its author there is "nothing to draw".
      e.kind === "outdoor" ||
      e.kind === "fence",
  );
  if (!drawable) {
    diagnostics.push({
      severity: "warning",
      message: "Plan has no walls, rooms, or furniture — nothing to draw",
      code: "W_EMPTY_PLAN",
    });
  }
}

/** How many overlapping room pairs `W_ROOM_OVERLAP` lists before it only counts. 1000 identical
 *  rooms are 499,500 pairs; a list that long is noise and an unbounded allocation. */
export const MAX_OVERLAP_PAIRS_LISTED = 200;

/** W_ROOM_OVERLAP: the overlapping room pairs, listed in (a,b) order up to
 *  {@link MAX_OVERLAP_PAIRS_LISTED} and then only counted — the same diagnostics, byte for byte,
 *  as the double loop over every pair (`test/room-overlap-oracle.test.ts` keeps that loop and
 *  the grid pass that replaced it, and compares all three).
 *
 *  Nothing here is quadratic in a pile of identical rooms. Whether two rooms overlap depends
 *  only on their geometry (`at`, `size`, `poly`), so rooms with value-identical geometry form
 *  one CLASS and each pair of classes is tested once; a spatial grid over the classes restricts
 *  the tests to classes sharing a cell (two rooms overlap ⟹ their boxes intersect ⟹ they share
 *  a cell). The listing then walks rooms `a` in order and takes the partners `b > a` from the
 *  overlapping classes' member lists, stopping at the cap. Past the cap only the count is
 *  needed: rectangle pairs are counted in O(n log n) by {@link countOverlappingRectPairs}, and
 *  pairs with a polygon room by class (a pile of n coincident polygon rooms is one test). What
 *  stays quadratic is what the answer is made of: n DISTINCT polygon rooms that all share a
 *  cell are n² distinct exact tests. Rooms reaching this check are finite (`checkNumberDomain`
 *  drops the rest first). */
export function checkRoomOverlaps(elements: ResolvedElement[], diagnostics: Diagnostic[], level?: number): void {
  // A room left unplaced carries a (0,0) placeholder, not geometry: testing it would
  // report phantom overlaps (quadratic in a chain) on top of the layout error.
  const rooms = elements.filter((e): e is RRoom => e.kind === "room" && !e._unplaced);
  const roomBox = (r: RRoom): GridBox => ({
    minX: r.at.x,
    minY: r.at.y,
    maxX: r.at.x + r.size.w,
    maxY: r.at.y + r.size.h,
  });
  let rext = 0;
  for (const r of rooms) rext += r.size.w + r.size.h;
  const cell = rooms.length > 0 ? Math.max(rext / (rooms.length * 2), 1) : 1;

  // Classes: first member's index order, members ascending. The key is the numbers' bit
  // patterns (so -0 is not 0), so two rooms in one class are the same numbers and every test
  // answers the same for both.
  const keyOf = (r: RRoom): string => {
    let k = bitsKey(r.at.x) + bitsKey(r.at.y) + bitsKey(r.size.w) + bitsKey(r.size.h);
    if (r.poly) {
      k += "|";
      for (const p of r.poly) k += bitsKey(p.x) + bitsKey(p.y);
    }
    return k;
  };
  const classIds = new Map<string, number>();
  const classOf: number[] = [];
  const members: number[][] = [];
  rooms.forEach((r, i) => {
    const k = keyOf(r);
    let c = classIds.get(k);
    if (c === undefined) {
      c = members.length;
      classIds.set(k, c);
      members.push([]);
    }
    members[c]!.push(i);
    classOf.push(c);
  });
  const rep = (c: number): RRoom => rooms[members[c]![0]!]!;
  const cgrid = new GridIndex<number>(cell);
  members.forEach((_, c) => {
    cgrid.insert(roomBox(rep(c)), c);
  });
  const overlapping = (r1: RRoom, r2: RRoom): boolean => {
    const b1 = { x: r1.at.x, y: r1.at.y, w: r1.size.w, h: r1.size.h };
    const b2 = { x: r2.at.x, y: r2.at.y, w: r2.size.w, h: r2.size.h };
    // A polygon room is tested EXACTLY (its own ring against the other's), never by
    // its bounding box — an L and the room tucked into its notch have overlapping
    // boxes and disjoint floors, and a bbox answer there would be a plain lie.
    return r1.poly || r2.poly
      ? rectsOverlap(b1, b2) && polygonsOverlap(r1.poly ?? rectRing(b1), r2.poly ?? rectRing(b2))
      : rectsOverlap(b1, b2);
  };
  /** The classes overlapping class `c` (itself included when its members overlap one
   *  another), ascending; computed once per class. Both tests are symmetric in their
   *  arguments, so a class pair's answer does not depend on which side asked. */
  const partnerClasses: (number[] | undefined)[] = [];
  const partnersOf = (c: number): number[] => {
    let list = partnerClasses[c];
    if (!list) {
      list = cgrid
        .queryBox(roomBox(rep(c)))
        .filter((d) => {
          // A class of one has no pair inside it; a lower class already listed has the answer.
          if (d === c) return members[c]!.length > 1 && overlapping(rep(c), rep(c));
          const known = d < c ? partnerClasses[d] : undefined;
          return known ? includesSorted(known, c) : overlapping(rep(Math.min(c, d)), rep(Math.max(c, d)));
        })
        .sort((p, q) => p - q);
      partnerClasses[c] = list;
    }
    return list;
  };
  // A message never quotes an id (PS2.29): a labelled room is named by its label, an unlabelled
  // one by what the plan knows of it (`src/naming.ts`, built only when a pair needs it).
  const overlapText = roomOverlapNamer(
    rooms,
    (x) => (x.uses && x.uses.length > 0 ? x.uses : classifyLabelUses(x.label ?? x.id).uses),
    level,
  );
  const report = (r1: RRoom, r2: RRoom): void => {
    diagnostics.push({
      severity: "warning",
      message: overlapText(r1, r2),
      code: "W_ROOM_OVERLAP",
      span: r2.span,
    });
  };

  // The listing: room `a` in ascending order, its partners `b > a` ascending — exactly the
  // former double loop's emission order.
  let listed = 0;
  for (let a = 0; a < rooms.length && listed < MAX_OVERLAP_PAIRS_LISTED; a++) {
    const need = MAX_OVERLAP_PAIRS_LISTED - listed;
    const bs: number[] = [];
    for (const d of partnersOf(classOf[a]!)) {
      const ms = members[d]!;
      // First member after `a` (members are ascending), then at most `need` of them.
      let lo = 0;
      let hi = ms.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (ms[mid]! > a) hi = mid;
        else lo = mid + 1;
      }
      for (let k = lo; k < ms.length && k < lo + need; k++) bs.push(ms[k]!);
    }
    bs.sort((p, q) => p - q);
    for (let k = 0; k < bs.length && k < need; k++) report(rooms[a]!, rooms[bs[k]!]!);
    listed += Math.min(bs.length, need);
  }
  if (listed < MAX_OVERLAP_PAIRS_LISTED) return;

  // The count: every class pair once, rectangle pairs by sorting.
  const sizeOf = (c: number): number => members[c]!.length;
  const rectCount = countOverlappingRectPairs(
    rooms.filter((r) => !r.poly).map((r) => ({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h })),
  );
  let found = rectCount ?? 0;
  members.forEach((_, c) => {
    const poly = rep(c).poly !== undefined;
    if (!poly && rectCount !== undefined) return;
    for (const d of partnersOf(c)) {
      if (d === c) found += (sizeOf(c) * (sizeOf(c) - 1)) / 2;
      // A rectangle partner of a polygon class is counted from the polygon's side only.
      else if (d > c ? poly || rep(d).poly === undefined : poly && rep(d).poly === undefined)
        found += sizeOf(c) * sizeOf(d);
    }
  });
  if (found > MAX_OVERLAP_PAIRS_LISTED) {
    diagnostics.push({
      severity: "warning",
      message: `…and ${found - MAX_OVERLAP_PAIRS_LISTED} more room pairs overlap (first ${MAX_OVERLAP_PAIRS_LISTED} listed)`,
      code: "W_ROOM_OVERLAP",
    });
  }
}

const BITS = new Float64Array(1);
const BITS16 = new Uint16Array(BITS.buffer);

/** A number's exact bit pattern as four UTF-16 code units: equal keys are equal doubles
 *  (`-0` and `0` apart). Cheaper than printing it. */
function bitsKey(v: number): string {
  BITS[0] = v;
  return String.fromCharCode(BITS16[0]!, BITS16[1]!, BITS16[2]!, BITS16[3]!);
}

/** Does the ascending `list` hold `v`? */
function includesSorted(list: readonly number[], v: number): boolean {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return list[lo] === v;
}

/** E_FURN_ROOM: a fixture's `in <roomId>` must name a real room (fail fast on an
 *  explicit ref — ADR 0005: the core never guesses which room was meant). */
function checkFurnitureRooms(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  const roomIds = new Set(elements.filter((e): e is RRoom => e.kind === "room").map((r) => r.id));
  for (const el of elements) {
    if (el.kind === "furniture" && el.room !== undefined && !roomIds.has(el.room)) {
      diagnostics.push({
        severity: "error",
        message: `Furniture "${el.id}" is placed \`in ${el.room}\` but no room has that id`,
        code: "E_FURN_ROOM",
        span: el.span,
      });
    }
  }
}
