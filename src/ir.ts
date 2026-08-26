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
  FurnitureNode,
  LevelNode,
  NorthDir,
  OpeningNode,
  PlaceNode,
  PlanNode,
  Point,
  RelAlign,
  RelDir,
  RoomNode,
  ScheduleSubject,
  SiteNode,
  Statement,
  StripNode,
  TitleNode,
  UseKind,
  VerticalDir,
  WindowNode,
} from "./ast.js";
import type { DoorHinge, DoorKind, DoorSlideDir, DoorSwingDir } from "./grammar/tokens.js";
import { placeRelational } from "./layout.js";
import { numberAxes } from "./axes.js";
import type { Frame } from "./frame.js";
import { composeFrame, makeFrame, transformElement } from "./frame.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Env, Expr, Value } from "./expr.js";
import { asBool, asNum, asStr, closest, evalExpr, exprSpan } from "./expr.js";
import type { Theme } from "./theme.js";
import type { ResolveCtx, Registry } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import type { World } from "./world.js";
import { NULL_WORLD } from "./world.js";
import { idToken } from "./identity.js";
import type { WallSegment } from "./geometry.js";
import type { Arc } from "./geometry/arc.js";
import { outerFaceBounds, segmentsOfWall, WallGrid } from "./geometry.js";
import type { LevelStamp } from "./chrome-layout.js";
import { titleRows } from "./chrome-layout.js";
import type { ResolvedSheet, SheetFitInput } from "./sheet.js";
import { resolveSheetSpec, usablePlanMm } from "./sheet.js";
import { planTableRows } from "./sheet-tables.js";
import type { GridBox } from "./geometry/grid-index.js";
import { GridIndex } from "./geometry/grid-index.js";
import { rectsOverlap } from "./geometry/rect.js";
import { polygonsOverlap, rectRing } from "./geometry/polygon.js";
import { BUILTIN_NAMES } from "./builtins.js";

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
   * Solved curved edges (v1.24), indexed by SEGMENT index: entry `k` is the arc from
   * `points[k]` to `points[k+1]`. Solved ONCE here at resolve (centre, radius, signed
   * sweep) so no consumer re-derives a curve. Absent for an all-straight polyline —
   * which is every wall written before v1.24, and why their bytes are unchanged.
   */
  arcs?: Array<Arc | undefined>;
  closed: boolean;
  /** Openings (doors/windows) hosted on this wall; subtracted from its solid. */
  openings: Opening[];
  /** True when this wall's `id` was author-declared, not an assigned positional
   *  auto-id (`<category>_<n>`). Lets `suggestTopology` reference the wall by a
   *  STABLE ref that can't re-bind. Internal: set during resolve, never serialized
   *  into the Scene/SVG/exports (the `_` prefix keeps it out). */
  _idAuthored?: boolean;
}
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
export type OpeningPlacement = "attached" | "absolute";
export type FurniturePlacement = "anchored" | "against-wall" | "absolute";

export interface RRoom extends RBase {
  kind: "room";
  /** Top-left of the room. For a {@link RRoom.poly} room this is the ring's BOUNDING
   *  BOX corner, so a rect-shaped consumer still reads a truthful extent. */
  at: Point;
  /** Extent of the room — the ring's bounding box for a {@link RRoom.poly} room. */
  size: { w: number; h: number };
  /**
   * The room's floor as an explicit, implicitly-closed simple polygon (`room polygon
   * (x,y) …`, v1.23). Absent for a rectangular room, which is what keeps every existing
   * plan byte-identical: a consumer must read this before assuming `at`/`size` IS the
   * floor. Vertices are grid-snapped, in source order, with no repeated last point.
   */
  poly?: Point[];
  /**
   * A CIRCULAR floor (`room circle at (cx,cy) radius R`, v1.24) — the exact centre and
   * radius. When present, {@link RRoom.poly} also holds the 48-gon tessellation (so every
   * ring consumer works unchanged) and `at`/`size` the bounding box; the AREA must be
   * taken from this in closed form (πR²), never from the tessellation.
   */
  circle?: { c: Point; r: number };
  /** Explicit label/area anchor (`label "…" at (x,y)`); absent = the derived centre.
   *  Recorded for EVERY room shape — a rectangle's was parsed and then dropped before
   *  v1.25, which silently disabled both the anchor and `W_ROOM_LABEL_OUTSIDE` there. */
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
  /** How the position was authored (`absolute` `at`, `relational` clause, or
   *  `strip` sugar). Internal marker for `describe().freedom`; never rendered. */
  _placement?: RoomPlacement;
}
export interface RDoor extends RBase {
  kind: "door";
  at: Point;
  width: number;
  hinge: DoorHinge;
  swing: DoorSwingDir;
  host: WallSegment | null;
  /**
   * The door's kind, present ONLY when it is not the default `hinged` — so every
   * door written before v1.25 (and every explicit `door hinged …`) carries no field
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
  /** Byte span of the authored `slide` clause, or the zero-width insertion point —
   *  see {@link import("./ast.js").DoorNode.slideSpan}. Internal: never in the Scene. */
  _slideSpan?: Span;
  /** `attached` (`on <wall> at <pos>`) vs `absolute` (`at (x,y)`). Internal
   *  marker for `describe().freedom`; never rendered. */
  _placement?: OpeningPlacement;
  /**
   * The whole `door` statement re-emitted with the hinge on the OTHER jamb — the
   * machine-applicable fix text for `W_SWING_OBSTRUCTED`. Computed in `door.resolve`
   * (the only place the AST node is in scope) and read by `doorHingeFlipFix`; absent
   * for a door with no span. Internal: never reaches the Scene, so it changes no bytes.
   */
  _flipHingeText?: string;
}
export interface RWindow extends RBase {
  kind: "window";
  at: Point;
  width: number;
  host: WallSegment | null;
  /** `attached` vs `absolute` — see {@link RDoor._placement}. */
  _placement?: OpeningPlacement;
}
export interface ROpening extends RBase {
  kind: "opening";
  at: Point;
  width: number;
  host: WallSegment | null;
  /** `attached` vs `absolute` — see {@link RDoor._placement}. */
  _placement?: OpeningPlacement;
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
  /** Byte span of the authored `rotate` clause, or the zero-width point where one
   *  can be inserted — copied from {@link import("./ast.js").FurnitureNode.rotateSpan}
   *  so an orientation lint fix can rewrite it. Internal; never reaches the Scene. */
  _rotateSpan?: Span;
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
}

/** A resolved lift shaft. */
export interface RElevator extends RBase {
  kind: "elevator";
  at: Point;
  size: { w: number; h: number };
}

/** A resolved escalator run. */
export interface REscalator extends RBase {
  kind: "escalator";
  at: Point;
  size: { w: number; h: number };
  dir: VerticalDir;
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
  | RRoof;

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
  schedule?: ScheduleSubject;
  /** `legend` — draw the derived materials/fixtures legend. Presentation only. */
  legend?: boolean;
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
   * grouping (v1.22). Absent when the plan declares none, so an existing IR (and therefore
   * its Scene and its bytes) is unchanged. Each element's membership rides on
   * {@link RBase._zone}; nothing here has geometric meaning.
   */
  zones?: RZone[];
  /** Resolved elements, in source order (for rendering). */
  elements: ResolvedElement[];
  /** Resolved walls (for bounds/hosting), in source order. */
  walls: RWall[];
  /**
   * The plan's `place`d component instances, in source order. Absent when the plan places
   * none, so a pre-v1.22 plan's IR — and therefore its Scene and its bytes — is unchanged.
   */
  instances?: RInstance[];
}

/** Max component-instantiation nesting depth before bailing out. */
const MAX_DEPTH = 64;
/** Safety cap on `while` iterations (deterministic guard against runaway loops). */
const MAX_ITERATIONS = 10_000;

/** An element flattened out of the body, paired with the env its exprs use. */
interface Entry {
  node: AstElement;
  env: Env;
  id: string;
  /** True when `node.id` was author-declared (vs an assigned positional auto-id);
   *  copied onto the resolved wall as {@link RWall._idAuthored}. */
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
    for (let s: Scope | undefined = this; s; s = s.parent) chain.push(s);
    for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of chain[i]!.vars) m.set(k, v);
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
  // Every diagnostic raised while expanding THIS body inherits the body's provenance:
  // which file its spans are measured in, and which placed instance it belongs to.
  const diag = (d: Diagnostic) => diagnostics.push(stampProvenance(d, ectx.frame, ectx.file));
  const out: Entry[] = [];
  /** Element/statement entries carry the same provenance, for resolve-time diagnostics. */
  const prov = {
    ...(ectx.frame ? { frame: ectx.frame } : {}),
    ...(ectx.file !== undefined ? { file: ectx.file } : {}),
    ...zoneOf(zone),
  };
  /** Evaluate an expression against this scope's currently-visible bindings. */
  const evalIn = (e: Expr): Value => evalExpr(e, scope.flatten(), diag);

  for (const stmt of body) {
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
        // Component scope = plan global + params; its lets are local.
        const childScope = new Scope(global);
        comp.params.forEach((p, i) => {
          childScope.vars.set(p, argVals[i]!);
        });
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
            { ...ectx, ...(comp.file !== undefined ? { file: comp.file } : { file: undefined }) },
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
        while (asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond))) {
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
        out.push({ node: stmt, env: scope.flatten(), id: "", defaults: scope.effectiveSet(stmt.kind), ...prov });
    }
  }
  return out;
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
  return ectx.frame ? composeFrame(ectx.frame, local) : local;
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
  /** A pre-resolved sheet to adopt verbatim (skips deriving one + its overflow warning). */
  sheet?: ResolvedSheet;
}

/** A value-based key for {@link ResolveExtras}, so the memo hits across calls (an
 *  identity token would miss every time — the sheet object is rebuilt per call). */
function extrasKey(extras: ResolveExtras | undefined): string {
  if (!extras) return "";
  const l = extras.level ? `L${extras.level.level}/${extras.level.name ?? ""}` : "";
  const s = extras.sheet
    ? `S${extras.sheet.size}/${extras.sheet.orientation}/${extras.sheet.denom}/${extras.sheet.auto ? 1 : 0}/${extras.sheet.fits ? 1 : 0}`
    : "";
  return `${l}|${s}`;
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
  const shared = ast.body.filter((s) => s.kind !== "level");
  const plan: PlanNode = {
    ...ast,
    ...(dropPaper ? { paper: undefined } : {}),
    body: [...shared, ...block.body],
  };
  if (levelPlanCache.size >= RESOLVE_CACHE_MAX * 4) levelPlanCache.clear();
  levelPlanCache.set(key, plan);
  return plan;
}

/** The margin-table row count one resolved storey will draw — the second thing (after the
 *  extent) a shared sheet has to be the maximum of. */
function tableRowsOf(ir: ResolvedPlan): number {
  return planTableRows({
    schedule: ir.schedule,
    legend: ir.legend,
    rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
    zones: ir.zones,
    walls: ir.walls,
    furniture: ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
  });
}

/** The outer-wall-face extent of a resolved plan (what a sheet fit is measured on). */
function outerExtent(ir: ResolvedPlan): { w: number; h: number } {
  const rects = ir.elements
    .filter((e): e is RRoom => e.kind === "room")
    .map((r) => ({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }));
  const ob = outerFaceBounds(ir.walls, rects);
  return Number.isFinite(ob.minX) ? { w: ob.maxX - ob.minX, h: ob.maxY - ob.minY } : { w: 0, h: 0 };
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

  let sheet: ResolvedSheet | undefined;
  if (ast.paper) {
    let w = 0;
    let h = 0;
    // The tables are per-STOREY (each page draws its own rooms), but the sheet is shared —
    // so the band reserved is the DEEPEST any page will draw, exactly as the extent is the
    // largest any page occupies. Reserving the ground floor's would let a taller schedule
    // upstairs run off the paper the fit rule just approved.
    let tableRows = 0;
    for (const b of blocks) {
      const probe = resolveCached(levelPlanFor(ast, b, true), registry, world, { level: stampOf(b) });
      const e = outerExtent(probe.ir);
      w = Math.max(w, e.w);
      h = Math.max(h, e.h);
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
    sheet = resolveSheetSpec(ast.paper, ast.scale, fit);
    if (!sheet.fits) {
      shared.push(
        scaleOverflowDiagnostic(ast, sheet, { w, h }, usablePlanMm(sheet.widthMm, sheet.heightMm, sheet.denom, fit)),
      );
    }
  }

  const levels: ResolvedLevel[] = blocks.map((b) => {
    const extras: ResolveExtras = { level: stampOf(b), ...(sheet ? { sheet } : {}) };
    const { ir, diagnostics } = resolveCached(levelPlanFor(ast, b, false), registry, world, extras);
    return {
      level: b.level,
      ...(b.name !== undefined ? { name: b.name } : {}),
      ir,
      // Tag by copy — the cached diagnostics are shared and must never be mutated.
      diagnostics: diagnostics.map((d) => ({ ...d, level: b.level })),
    };
  });

  return {
    ir: levels[0]!.ir,
    diagnostics: [...shared, ...levels.flatMap((l) => l.diagnostics)],
    levels,
  };
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

function resolveImpl(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
  extras: ResolveExtras = {},
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
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
  const entries = expandScope(
    ast.body,
    globalScope,
    globalScope,
    ast.components,
    diagnostics,
    0,
    { snap, seenInstances: new Set<string>() },
    zoneFrame,
  );

  // 1. Partition the flat stream into RESOLUTION GROUPS: one per `place`d instance, plus
  //    the root plan. A plan with no `place` has exactly one group (the root) holding
  //    every entry — including every legacy bare component call — so everything below is
  //    the historical single pass, byte for byte.
  const groups = groupEntries(entries);

  // 2. Assign ids PER GROUP, so an instance's auto-id counters restart at 1 and two
  //    instances of one component get order-independent ids (`west.wall_1` / `east.wall_1`
  //    rather than `wall_1` / `wall_4`). Ids inside a group stay unprefixed until the
  //    group is transformed, which is what lets an intra-instance reference (`door on
  //    perimeter`) resolve against the instance's own namespace.
  for (const grp of groups) assignIds(grp.entries, registry, diagnostics);

  // 3. Resolve each group in registry order (walls first → openings can host against
  //    them), then transform the instance groups into plan coordinates.
  //
  //    A `place`d instance is a CLOSED WORLD: it resolves entirely in its own local frame
  //    against its OWN walls and rooms, and one rigid transform then carries the result
  //    into the plan. That is what makes every derived-geometry rule (`anchor top-left`,
  //    `against wall … side`, `swing into`, `right-of`) mean inside a rotated instance
  //    exactly what it means when the component is authored on its own — see `frame.ts`.
  //    The root plan resolves LAST and sees every instance's walls and rooms under their
  //    namespaced ids, which is how `door on west.perimeter` and `furniture … in west.main`
  //    work. The reverse does not hold, by design: a component cannot reach out of itself.
  const walls: RWall[] = [];
  const rooms2: RRoom[] = [];
  const instances: RInstance[] = [];
  let activeEnv: Env = new Map();
  /** The entry being resolved — the provenance every diagnostic below inherits. */
  let activeEntry: Entry | undefined;
  const pushDiag = (d: Diagnostic): void => {
    diagnostics.push(activeEntry ? stampProvenance(d, activeEntry.frame, activeEntry.file) : d);
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
  const ctx: ResolveCtx = {
    grid: g,
    snap,
    snapPt,
    eval: evalNum,
    evalStr,
    evalPt,
    id: "",
    walls,
    rooms: rooms2,
    hostSegment: (at, ref) => hostInfo(at, ref).host,
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

  for (const grp of groups) {
    // The root group accumulates into the plan-wide arrays (already carrying every
    // instance's transformed walls/rooms); an instance group gets its own local pair.
    const grpWalls: RWall[] = grp.frame ? [] : walls;
    const grpRooms: RRoom[] = grp.frame ? [] : rooms2;
    ctx.walls = grpWalls;
    ctx.rooms = grpRooms;
    wallGrid = null;
    hiKey = "";
    hiVal = null;
    for (const def of registry.order) {
      for (const e of grp.entries) {
        if (e.node.kind !== def.kind) continue;
        activeEnv = e.env;
        activeEntry = e;
        ctx.id = e.id;
        ctx.defaults = e.defaults;
        const r = def.resolve(e.node, ctx);
        e.resolved = r;
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
          grpWalls.push(r);
        } else if (r.kind === "room") grpRooms.push(r);
      }
    }
    activeEntry = undefined;
    if (!grp.frame) continue;
    instances.push({
      name: grp.frame.prefix,
      component: grp.frame.component,
      at: { x: grp.frame.tx, y: grp.frame.ty },
      rotate: grp.frame.rotate,
      ...(grp.frame.mirror ? { mirror: grp.frame.mirror } : {}),
    });
    // The instance's own relational placement runs HERE, in the local frame, because
    // `right-of` means the COMPONENT's right — resolving it after the transform would
    // read the page's right instead (ADR 0004 arithmetic, one frame at a time).
    placeRelational(grpRooms, snapPt, (d) => diagnostics.push(stampProvenance(d, grp.frame, undefined)));
    const f = grp.frame;
    for (const e of grp.entries) {
      const t = transformElement(f, e.resolved!);
      e.resolved = t;
      if (t.kind === "wall") walls.push(t);
      else if (t.kind === "room") rooms2.push(t);
    }
  }

  // 3. IR element list in source order (for rendering).
  const elements = entries.map((e) => e.resolved!);

  // 3a. Relational placement: rooms positioned with `right-of`/`below`/… get
  //     absolute coordinates here, by pure arithmetic in dependency order
  //     (topological). Rooms with an absolute `at` carry no constraint, so this
  //     is a no-op for them and the manual path stays byte-identical.
  placeRelational(
    elements.filter((e): e is RRoom => e.kind === "room"),
    snapPt,
    (d: Diagnostic) => diagnostics.push(d),
  );

  // 3b. Register openings: each hosted door/window voids its wall's solid.
  registerOpenings(elements, walls);

  // 4. Cross-element checks.
  checkPlanDrawable(elements, diagnostics);
  checkRoomOverlaps(elements, diagnostics);
  checkFurnitureRooms(elements, diagnostics);

  // 5. Positioning axes (定位轴线): plan-level datums, not elements. Their positions are
  //    expressions, evaluated here against the plan's GLOBAL bindings — the block is a
  //    plan setting, not a body statement, so it sees every plan-level `let` regardless
  //    of where it sits in the file. Snapped like every other coordinate (an off-grid
  //    datum would not line up with the rooms it dimensions), then sorted, deduped and
  //    labelled by the GB/T rules. An empty block resolves to no axes at all, so
  //    `ir.axes` stays absent and the drawing is byte-identical.
  let axes: RAxis[] | undefined;
  if (ast.axes) {
    activeEnv = globalScope.flatten();
    const xs = ast.axes.x.map((e) => snap(evalNum(e)));
    const ys = ast.axes.y.map((e) => snap(evalNum(e)));
    const labelled = numberAxes(xs, ys);
    if (labelled.length > 0) axes = labelled;
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
    );

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
    autoDims: ast.autoDims,
    ...(axes ? { axes } : {}),
    // Sheet-table opt-ins: presentation flags carried through untouched. Spread so an
    // opted-out plan has no key at all and the IR stays byte-identical to before.
    ...(ast.schedule ? { schedule: ast.schedule } : {}),
    ...(ast.legend ? { legend: true } : {}),
    // Declared wing/department grouping (v1.22) — metadata only, absent when the plan
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
    elements,
    walls,
    ...(instances.length > 0 ? { instances } : {}),
  };
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
): ResolvedSheet | undefined {
  if (!ast.paper) return undefined;
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const rects = rooms.map((r) => ({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }));
  const ob = outerFaceBounds(walls, rects);
  const extent = Number.isFinite(ob.minX) ? { w: ob.maxX - ob.minX, h: ob.maxY - ob.minY } : { w: 0, h: 0 };
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
    }),
  };
  const sheet = resolveSheetSpec(ast.paper, ast.scale, fit);
  if (!sheet.fits) {
    diagnostics.push(
      scaleOverflowDiagnostic(ast, sheet, extent, usablePlanMm(sheet.widthMm, sheet.heightMm, sheet.denom, fit)),
    );
  }
  return sheet;
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

/** One resolution group: the entries of a single coordinate frame. */
interface ResolveGroup {
  /** The instance frame, or absent for the root plan. */
  frame?: Frame;
  entries: Entry[];
}

/**
 * Partition the expanded entry stream by coordinate frame — one group per `place`d
 * instance (keyed on the frame OBJECT, which every entry of that instance shares), plus
 * the root plan.
 *
 * Instance groups come FIRST, in first-appearance order, and the root LAST. That ordering
 * is what lets the plan reference an instance's walls and rooms by their namespaced ids
 * (`door on west.perimeter`) while keeping the instance itself sealed. Element ORDER in
 * the drawing is untouched — `elements` is rebuilt from `entries` in source order after
 * every group has resolved — so this affects only which facts each group can see.
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
      r._placement = (node as DoorNode | WindowNode | OpeningNode).attach !== undefined ? "attached" : "absolute";
      return;
    case "furniture": {
      const fn = node as FurnitureNode;
      r._placement = fn.against !== undefined ? "against-wall" : fn.place !== undefined ? "anchored" : "absolute";
      return;
    }
  }
}

/** Each hosted door/window/opening voids its wall's solid. The host segment came
 *  from `segmentsOfWall`, so the owning wall is matched by endpoint coords. */
function registerOpenings(elements: ResolvedElement[], walls: RWall[]): void {
  const wallOfSegment = (seg: WallSegment): RWall | undefined =>
    walls.find((w) =>
      segmentsOfWall(w).some((s) => s.a.x === seg.a.x && s.a.y === seg.a.y && s.b.x === seg.b.x && s.b.y === seg.b.y),
    );
  for (const el of elements) {
    if ((el.kind === "door" || el.kind === "window" || el.kind === "opening") && el.host) {
      wallOfSegment(el.host)?.openings.push({ at: el.at, width: el.width });
    }
  }
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
      e.kind === "roof",
  );
  if (!drawable) {
    diagnostics.push({
      severity: "warning",
      message: "Plan has no walls, rooms, or furniture — nothing to draw",
      code: "W_EMPTY_PLAN",
    });
  }
}

/** W_ROOM_OVERLAP: a spatial grid restricts the pairwise test to rooms sharing a
 *  cell (~O(n) for distributed plans) instead of all O(n²) pairs. Two rooms
 *  overlap ⟹ their boxes intersect ⟹ they share a cell, so this finds exactly
 *  the same overlaps; pairs are emitted in (a,b) order to keep diagnostics
 *  byte-identical to the former double loop. */
function checkRoomOverlaps(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const roomBox = (r: RRoom): GridBox => ({
    minX: r.at.x,
    minY: r.at.y,
    maxX: r.at.x + r.size.w,
    maxY: r.at.y + r.size.h,
  });
  let rext = 0;
  for (const r of rooms) rext += r.size.w + r.size.h;
  const rgrid = new GridIndex<number>(rooms.length > 0 ? Math.max(rext / (rooms.length * 2), 1) : 1);
  rooms.forEach((r, i) => {
    rgrid.insert(roomBox(r), i);
  });
  const overlaps: [number, number][] = [];
  const seenPair = new Set<string>();
  rooms.forEach((r1, a) => {
    for (const b of rgrid.queryBox(roomBox(r1))) {
      if (b <= a) continue; // each unordered pair once, with a < b
      const r2 = rooms[b]!;
      const b1 = { x: r1.at.x, y: r1.at.y, w: r1.size.w, h: r1.size.h };
      const b2 = { x: r2.at.x, y: r2.at.y, w: r2.size.w, h: r2.size.h };
      // A polygon room is tested EXACTLY (its own ring against the other's), never by
      // its bounding box — an L and the room tucked into its notch have overlapping
      // boxes and disjoint floors, and a bbox answer there would be a plain lie.
      const overlapping =
        r1.poly || r2.poly
          ? rectsOverlap(b1, b2) && polygonsOverlap(r1.poly ?? rectRing(b1), r2.poly ?? rectRing(b2))
          : rectsOverlap(b1, b2);
      if (overlapping) {
        const key = `${a},${b}`;
        if (!seenPair.has(key)) {
          seenPair.add(key);
          overlaps.push([a, b]);
        }
      }
    }
  });
  overlaps.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const [a, b] of overlaps) {
    diagnostics.push({
      severity: "warning",
      message: `Rooms "${rooms[a]!.id}" and "${rooms[b]!.id}" overlap`,
      code: "W_ROOM_OVERLAP",
      span: rooms[b]!.span,
    });
  }
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
