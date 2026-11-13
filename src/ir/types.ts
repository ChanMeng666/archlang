/**
 * The resolved IR's types: every `R*` element interface, {@link ResolvedElement},
 * {@link ResolvedPlan}, and what a resolution returns ({@link ResolvedLevel},
 * {@link PlanResolution}).
 *
 * Type-only: this module declares no value, so it cannot take part in a runtime import cycle.
 * `src/ir.ts` re-exports every name here, and importers keep reading them from there.
 * Invariant: an IR is a new, immutable object per resolution, never the parse-stage AST.
 * Step meter: charges nothing (it runs no code).
 */

import type {
  CompassWord,
  ElementKind,
  FenceStyle,
  FurnitureAnchor,
  OutdoorKind,
  RailSide,
  NorthDir,
  Point,
  RelAlign,
  RelDir,
  SiteNode,
  SheetTextNode,
  TitleNode,
  UseKind,
  VerticalDir,
} from "../ast.js";
import type {
  DoorHinge,
  DoorKind,
  DoorSlideDir,
  DoorSwingBuilding,
  DoorSwingDir,
  WallStatus,
  WindowKind,
} from "../grammar/tokens.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import type { Theme } from "../theme.js";
import type { WallSegment } from "../geometry.js";
import type { Arc } from "../geometry/arc.js";
import type { Side } from "../algebra/d4.js";
import type { ResolvedSheet } from "../sheet.js";
import type { FloorMaterial } from "../hatches.js";
import type { ChromeHide } from "../ast.js";

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
   * name no identifier can spell (`exterior`, `exterior#2`, `A|B`, `A|B#2` for a pair's later
   * run, with `~2`… for a run an authored wall split off), and its {@link RBase.span} is the
   * statement's. So a lint fix or
   * hint never quotes it and never edits its span, `arch fix`/`suggest` never emit it, and
   * `roof overhang` counts only the outer ring. Internal (the `_` prefix keeps it out of the
   * SVG and the exports; the Scene carries `from`, and an empty `open` on an `open between` run,
   * for the joinery alone, and nothing is promised about it).
   */
  _derived?: {
    from: "rooms";
    /** Rings only: the outer ring, or a courtyard ring. */
    ring?: "outer" | "inner";
    /** Partitions only: the two rooms it stands between, in source order. */
    between?: [string, string];
    /** Partitions only: the run is voided by an `open between` clause (its span), so a
     *  relational `door|opening between` the pair is refused (`E_WALL_BETWEEN_OPEN`). `whole`
     *  when it is voided over its whole clear span, which leaves nothing for a jamb to meet
     *  (`openBoundaryIds`, `src/opening-junctions.ts`). */
    open?: { span?: Span; whole?: true };
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
  /** `floor <pattern>`, read only by the drawing and the legend. Never reaches `describe()` or `lint()`. */
  floor?: FloorMaterial;
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
  /** Set on a `polygon` room that reported its own ring (`E_ROOM_POLY_DEGENERATE`,
   *  `E_ROOM_POLY_SELF_INTERSECT`): it has no floor anything can be derived from, and the plan
   *  already says why. Internal; never rendered. */
  _ringRefused?: true;
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
/** A window run out to a corner of two walls (`at corner <room>.<edge>`): its span ends on the
 *  other wall's outer face, so with the window on that wall no wall stands at the corner. */
export interface WindowCorner {
  /** Where the two centrelines meet. */
  at: Point;
  /** The other wall's segment, which ends at {@link WindowCorner.at}. */
  other: WallSegment;
  /** The window on that wall, once the group has settled (`windowEl.settle`). */
  with?: string;
}
export interface RWindow extends RBase {
  kind: "window";
  at: Point;
  width: number;
  host: WallSegment | null;
  /** The window's kind, present ONLY when written, so a kind-free window carries no field and
   *  every downstream payload is byte-identical. */
  windowKind?: WindowKind;
  /**
   * The hinged jamb, relative to the host wall's traversal direction as a door's is, so it rides
   * a `place` frame with the carried segment. Present ONLY when written, on a kind that takes it:
   * absent means the source does not say, and the symbol then states no hand.
   */
  hinge?: DoorHinge;
  /** The author wrote this window's `id=` (set only then). Read by `W_HOB_UNDER_WINDOW`'s hint,
   *  which quotes an id only when the author wrote one. Internal. */
  _idAuthored?: true;
  /** `attached` vs `absolute` — see {@link RDoor._placement}. */
  _placement?: OpeningPlacement;
  /** See {@link RDoor._relation}. */
  _relation?: OpeningRelation;
  /** Present only on a window placed `at corner`. Internal: the drawing, `lint()` and `describe()`
   *  read it, and it never reaches the Scene. */
  _corner?: WindowCorner;
  /** Written `at corner` and refused there, as written: `on` the one edge, to the `to` edge. The
   *  window that names those two the other way round is not alone: this one was written, and its
   *  own error says what is wrong with it. Internal. */
  _cornerRefused?: { on: string; to: string };
  /** Bottom of the glazing above this storey's floor, in mm — always resolved,
   *  the authored `sill` or {@link import("./datum.js").WINDOW_SILL}. */
  sill: number;
  /** The statement wrote a `sill` clause, so {@link RWindow.sill} is the plan's word and not the
   *  default: `W_BALCONY_NO_DOOR` takes a window at it. Internal: never reaches the Scene. Plan JSON
   *  does not keep it: under the heights gate it writes a `sill` for every window, so a plan rebuilt
   *  from its JSON reads every window's sill as authored. */
  _sillAuthored?: true;
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
   * This piece is reflected, by its own `mirror` or an instance frame's (`place … mirror`), so its
   * drawn symbol is the mirror image of the one the catalogue draws. Set by `furniture.resolve()`,
   * XOR-composed by its `transform`, and read by `furniture.render()`, which
   * reflects the glyph about its own vertical centre line before applying the derived
   * quarter-turn. A symbol with a vertical mirror axis is unaffected at every footprint,
   * because the reflection is DERIVED from the drawing rather than declared per family
   * (see `elements/glyph-chirality.ts`). `describe()` reads it only as a symmetry fact's `hand`;
   * Plan JSON carries it as `mirror`.
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
/** A resolved `section` mark (RM6.1): its cut line, measured verbatim like a `dim`'s ends. */
export interface RSection extends RBase {
  kind: "section";
  /** The mark's own name (`A`, `1`); its element {@link RBase.id} is an auto-id. */
  name: string;
  from: Point;
  to: Point;
  /** The compass word written after `look`. */
  look: CompassWord;
  /** The PAGE direction the section looks in, a unit axis vector (`{x: 1, y: 0}` is page-right):
   *  the `look` word turned by the plan's `north`. `null` when it does not cross the cut line
   *  (`E_SECTION_LOOK`) or the line is no axis-aligned run (`E_SECTION_AXIS`). */
  toward: Point | null;
  /** The plan's `north` as clockwise quarter-turns, read by `transform` to name a turned
   *  direction. Internal. */
  _northTurns?: 0 | 1 | 2 | 3;
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

/** One rectangle of a block stair. */
export interface RStairPiece {
  at: Point;
  size: { w: number; h: number };
  /** A block stair's landing divided into this many tapered steps (`landing … winders <n>`);
   *  absent on a level landing and on every flight. */
  winders?: number;
}

/** One flight of a block stair: its rectangle and the edge it is entered across on THIS storey. */
export interface RStairFlight extends RStairPiece {
  tail: Side;
}

/**
 * A resolved stair. `width` is always concrete (defaulted to the footprint's cross-axis extent at
 * resolve), so nothing downstream re-derives it. A straight flight is one rectangle, `at` and
 * `size`. A block stair (`flights`, `landings`) is several, in climbing order on every storey, and
 * its `at` and `size` are their bounding box, which holds floor that is no stair: read the pieces
 * through `src/vertical.ts` (`flightsOf`, `piecesOf`).
 */
export interface RStair extends RBase {
  kind: "stair";
  at: Point;
  size: { w: number; h: number };
  dir: VerticalDir;
  /** Flight width across the run (mm). */
  width: number;
  /** The straight stair's statement writes `width` (absent when it is the footprint's default):
   *  read by a hint that quotes the clause to edit (`W_PATH_TOO_NARROW`, RM1.3b). Internal. */
  _widthAuthored?: true;
  /**
   * The footprint edge the run is entered across, in PLAN coordinates, once a `place` frame
   * has carried it: the local tail (`tailEdge`) acted on by the frame. Absent at the root,
   * where `tailEdge` applies its fixed page rule; a block stair always has it, the tail of the
   * flight boarded on this storey. Internal; never reaches `describe()`.
   */
  _tail?: Side;
  /** A block stair's flights, in climbing order. Absent on a straight stair. */
  flights?: RStairFlight[];
  /** A block stair's landings: `landings[i]` stands between `flights[i]` and `flights[i + 1]`. */
  landings?: RStairPiece[];
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
  /** Top-left; on the `polygon` spelling, of the ring's bounding box (an index, never a datum:
   *  a reader of the hole reads {@link RVoid.parts} through `voidPieces`). */
  at: Point;
  size: { w: number; h: number };
  /** The `polygon` spelling: the authored ring, snapped. Absent on the rectangle. */
  poly?: Point[];
  /** The `polygon` spelling: the rectangles the ring is made of (`ringParts`), cut once at
   *  resolve. Every reader of the floor hole reads these, never the box. */
  parts?: { at: Point; size: { w: number; h: number } }[];
  /** The rectangle's railed sides (`rail top left`), canonical order. Absent = no railing. */
  rail?: RailSide[];
  /** The ring's railed edges (`rail 0 3`): edge `n` runs from point `n` to `n+1`. Ascending. */
  railEdges?: number[];
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
  | RWallsFromRooms
  | RSection;

/** One `describe().derived_walls[]` row: a derived wall before coexistence (ADR 0028 §6). */
export interface DerivedWallRow {
  /** `rooms` for a wall `walls from rooms` derived; `between`/`around` for an authored wall
   *  written in a pairwise form (ADR 0028 §4, §6). */
  from: "rooms" | "between" | "around";
  /** The internal name (`exterior`, `exterior#2`, `A|B`, `A|B#2`), namespaced inside a `place`;
   *  for a pairwise wall, its authored id. */
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
  /** The sheet marks the plan hides. Absent unless written, and read only by the sheet. */
  hide?: ChromeHide;
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
  /** `schedule rooms net` — the room stamp reads the schedule's net area. Copied from the AST. */
  scheduleNet?: boolean;
  /** `schedule openings` — draw the door/window tags and the DOOR & WINDOW SCHEDULE.
   *  Presentation only, copied from the AST, absent unless the plan opts in. */
  openingSchedule?: boolean;
  /** `legend` — draw the derived materials/fixtures legend. Presentation only. */
  legend?: boolean;
  /** `notes "…"` — the sheet's general notes, in source order. Presentation only. */
  notes?: string[];
  /** `sheet text { … }` — the sheet's wording, read by the drawing alone. Copied from the AST. */
  sheetText?: SheetTextNode;
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
   * This storey's `slab` and clear height (MF-D1, RM-D17), present only when the plan writes a
   * `slab` or a `clear` somewhere: what `describe().heights` reports beside the storey height.
   * Internal: it draws nothing and is never serialized into the Scene/SVG/exports.
   */
  _ceiling?: import("../datum.js").CeilingFacts;
  /**
   * How many storeys the plan has, when it has more than one: what a per-plan count is divided
   * by, since each storey is drawn on its own (`fitWork`, `src/label-fit.ts`). Internal: never
   * serialized into the Scene/SVG/exports.
   */
  _storeyCount?: number;
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
