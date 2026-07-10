/** Abstract syntax tree for an ArchLang `plan`. All distances are in millimetres.
 *
 * The AST is the raw, immutable output of parsing: `resolve()` (see ir.ts) reads
 * it and produces a separate IR — nothing here is mutated after parse.
 */

import type { Span } from "./diagnostics.js";
import type { Comment } from "./lexer.js";
import type { Expr } from "./expr.js";
import type { Theme } from "./theme.js";

export interface Point {
  x: number;
  y: number;
}

/** A point whose coordinates are expressions (evaluated during resolve). */
export interface ExprPoint {
  x: Expr;
  y: Expr;
}

/** North orientation: a cardinal keyword or an explicit bearing in degrees. */
export type NorthDir = "up" | "down" | "left" | "right" | { deg: number };

/** Discriminant identifying an element's type (also its registry keyword). */
export type ElementKind = "wall" | "room" | "door" | "window" | "opening" | "furniture" | "dim" | "column";

/** Fields every element AST node carries. */
export interface NodeBase {
  id: string;
  line: number;
  /** Byte-offset span from the leading keyword to the last consumed token. */
  span?: Span;
}

export interface WallNode extends NodeBase {
  kind: "wall";
  /** Free-form category, e.g. "exterior" or "partition". Also a door/window ref. */
  category: string;
  /** Wall thickness in mm. */
  thickness: Expr;
  /** Optional hatch material (e.g. "brick"); defaults to the poché hatch. */
  material?: string;
  /** Optional hatch tile-size multiplier (`material … scale <n>`); defaults to 1. */
  materialScale?: Expr;
  /** Optional extra hatch rotation in degrees (`material … angle <n>`); defaults to 0. */
  materialAngle?: Expr;
  /** Polyline vertices in order. */
  points: ExprPoint[];
  /** Whether the polyline closes back to its first vertex. */
  closed: boolean;
}

/** Relational-placement direction: the side of the reference room to sit on. */
export type RelDir = "right-of" | "left-of" | "below" | "above";

/** Edge to align with the reference room. Horizontal placement
 *  (`right-of`/`left-of`) uses `top|middle|bottom`; vertical placement
 *  (`below`/`above`) uses `left|center|right` (`center`≡`middle`). */
export type RelAlign = "top" | "middle" | "bottom" | "left" | "center" | "right";

/**
 * A room's declared function(s). Explicit `uses` make the analysis layer's room
 * classification authored intent instead of a label-regex guess (see `roomUses` in
 * analyze.ts); a room may have several (a studio is `living kitchen`). Classification
 * only — it does not imply physical enclosure.
 */
export type UseKind =
  | "living"
  | "kitchen"
  | "dining"
  | "bedroom"
  | "bath"
  | "wc"
  | "hall"
  | "circulation"
  | "storage"
  | "utility"
  | "office"
  | "entry";

/** Every {@link UseKind}, in canonical order — the parser/formatter/grammar source. */
export const USE_KINDS: readonly UseKind[] = [
  "living",
  "kitchen",
  "dining",
  "bedroom",
  "bath",
  "wc",
  "hall",
  "circulation",
  "storage",
  "utility",
  "office",
  "entry",
];

/** `DIR REF [align EDGE] [gap EXPR]` — a room's position relative to another room.
 *  Resolved to absolute coordinates by pure arithmetic in dependency order. */
export interface RoomRel {
  dir: RelDir;
  /** Id of the reference room this one is placed against. */
  ref: string;
  align?: RelAlign;
  /** Spacing (mm) between the two rooms along the placement axis; default 0. */
  gap?: Expr;
  span?: Span;
}

export interface RoomNode extends NodeBase {
  kind: "room";
  /** Absolute top-left corner. Mutually exclusive with {@link RoomNode.rel};
   *  exactly one is present. The absolute path is the default and is unchanged. */
  at?: ExprPoint;
  /** Relational placement clause (when `at` is absent). */
  rel?: RoomRel;
  size: { w: Expr; h: Expr };
  /** Label as a string-interpolation template, evaluated at resolve. */
  label?: Expr;
  /** Declared function(s) — explicit room classification (`uses bedroom`, …). */
  uses?: UseKind[];
}

/** Where along a named wall an opening attaches (`… on <wall> at <pos>`). The
 *  position walks the wall polyline: a percentage of its total length, an
 *  absolute millimetre distance from its start, or its midpoint. Resolved to an
 *  absolute point + host segment in `src/attach.ts` (bypasses nearest-wall
 *  search, so an attached opening can never be "off wall"). Append-only optional. */
export interface OpeningAttach {
  /** Host wall id (or category) whose polyline is walked. */
  wall: string;
  pos: { kind: "percent" | "mm" | "center"; value?: number };
  span?: Span;
}

export interface DoorNode extends NodeBase {
  kind: "door";
  /** Absolute hinge/center position. Absent when {@link DoorNode.attach} is used. */
  at?: ExprPoint;
  /** Wall-attached placement (`on <wall> at <pos>`). Exclusive with `at`. */
  attach?: OpeningAttach;
  width: Expr;
  /** Optional wall (id or category) the door is hosted by (in `at` mode). */
  wall?: string;
  /** Hinge/swing are explicit-only here; the default (and any `set door(...)`
   *  override) is applied at resolve so user-specified values always win. */
  hinge?: "left" | "right";
  swing?: "in" | "out";
  /** `swing into <room>` — resolve chooses in/out so the leaf opens toward that
   *  room's side of the host wall. Exclusive with `swing`. */
  swingInto?: string;
  /** `hinge near start|end` — hinge at the door-segment end nearer the wall's
   *  start/end point, independent of traversal wording. Exclusive with `hinge`. */
  hingeNear?: "start" | "end";
}

export interface WindowNode extends NodeBase {
  kind: "window";
  at?: ExprPoint;
  attach?: OpeningAttach;
  width: Expr;
  wall?: string;
}

/** `opening [id=] (at (x,y) [wall ref] | on <wall> at <pos>) width N` — a leaf-less
 *  cased opening: a gap in the wall (no door, no glazing) that still connects the
 *  two spaces. */
export interface OpeningNode extends NodeBase {
  kind: "opening";
  at?: ExprPoint;
  attach?: OpeningAttach;
  width: Expr;
  wall?: string;
}

/** `against wall <id> [segment <n>] [offset <d>] [side left|right]` — anchor a fixture
 *  flush to a wall face. The renderer position + quarter-turn are computed from it
 *  at resolve (closed-form). Mutually exclusive with {@link FurnitureNode.at}. */
export interface FurnitureAgainst {
  /** Host wall id to back onto. */
  wall: string;
  /** Which segment of a multi-segment wall (0-based); required when the wall has >1. */
  segment?: Expr;
  /** Distance (mm) along the segment from its start to the fixture's along-wall centre; default = segment midpoint. */
  offset?: Expr;
  /** Which face of the wall — left/right of the segment's start→end direction. */
  side?: "left" | "right";
  span?: Span;
}

/** Anchor position inside a room box for `furniture … in <room> anchor <a>`. */
export type FurnitureAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** Every {@link FurnitureAnchor}, canonical order — parser/formatter/grammar source. */
export const FURNITURE_ANCHORS: readonly FurnitureAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** `in <room> centered` | `in <room> anchor <a> [inset N]` — closed-form placement
 *  of a fixture inside a resolved room's box. The `in <room>` also owns the fixture
 *  (sets {@link FurnitureNode.room}). Exclusive with `at`/`against`. */
export type FurniturePlace = { mode: "centered" } | { mode: "anchor"; anchor: FurnitureAnchor; inset?: Expr };

export interface FurnitureNode extends NodeBase {
  kind: "furniture";
  /** Free-form category, e.g. "bed" or "sofa". */
  category: string;
  /** Absolute top-left corner. Mutually exclusive with {@link FurnitureNode.against}. */
  at?: ExprPoint;
  /** Wall-anchored placement (computes at/size/rotation). Exclusive with `at`. */
  against?: FurnitureAgainst;
  /** Room-relative placement (`in <room> centered|anchor …`). Exclusive with `at`/`against`. */
  place?: FurniturePlace;
  /** In `at` mode: plan-axis width×height. In `against` mode: wall-relative along×depth.
   *  Optional only with `against` + a fixture that has a catalogued default footprint. */
  size?: { w: Expr; h: Expr };
  /** Label as a string-interpolation template, evaluated at resolve. */
  label?: Expr;
  /** Quarter-turn rotation of the drawn symbol (0|90|180|270 degrees), evaluated at resolve. */
  rotate?: Expr;
  /** Declared owning room id (`in <roomId>`) — the room this fixture belongs to. */
  room?: string;
}

export interface DimNode extends NodeBase {
  kind: "dim";
  from: ExprPoint;
  to: ExprPoint;
  /** Perpendicular offset of the dimension line from the measured segment, mm. */
  offset: Expr;
  /** Override text (string-interpolation template); defaults to measured length. */
  text?: Expr;
}

export interface ColumnNode extends NodeBase {
  kind: "column";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
}

/** One room child of a `strip` block. It carries its main-axis extent and an
 *  optional cross-axis override; the strip supplies the shared cross dimension
 *  when the child omits it. Expanded into an ordinary absolute {@link RoomNode}
 *  during resolve. */
export interface StripRoomChild {
  id: string;
  /** Main-axis extent (width for a right/left strip, height for a down/up strip). */
  main: Expr;
  /** Optional cross-axis extent — overrides the strip's shared `height`/`width`. */
  cross?: Expr;
  label?: Expr;
  uses?: UseKind[];
  line: number;
  span?: Span;
}

/**
 * `strip <dir> at (x,y) gap G (height|width) H { room … }` — a row/column of rooms
 * laid out end to end. `dir` is the fill axis (`right`/`left`/`down`/`up`); each
 * room's main-axis offset is the running sum of prior extents plus `gap`, and the
 * shared cross dimension is the strip's `height` (horizontal) or `width` (vertical),
 * overridable per room. Expanded to ordinary absolute-placed rooms in resolve, so
 * everything downstream is unchanged. A top-level block only (no nesting).
 */
export interface StripNode extends NodeBase {
  kind: "strip";
  dir: "right" | "left" | "down" | "up";
  /** Origin corner (top-left of the first room). */
  at: ExprPoint;
  /** Spacing (mm) between consecutive rooms along the fill axis. */
  gap: Expr;
  /** Shared cross-axis dimension (`height` for horizontal, `width` for vertical). */
  cross?: Expr;
  rooms: StripRoomChild[];
}

/** Discriminated union of all element AST nodes (registry-dispatchable). */
export type AstElement =
  | WallNode
  | RoomNode
  | DoorNode
  | WindowNode
  | OpeningNode
  | FurnitureNode
  | DimNode
  | ColumnNode;

/** `let NAME = <expr>` — a binding statement. */
export interface LetNode extends NodeBase {
  kind: "let";
  name: string;
  value: Expr;
}

/** `NAME(args)` — instantiate a component (expanded during resolve). */
export interface InstanceNode extends NodeBase {
  kind: "instance";
  name: string;
  args: Expr[];
}

/** `for NAME in <expr> { body }` — expanded over the iterable during resolve. */
export interface ForNode extends NodeBase {
  kind: "for";
  varName: string;
  iter: Expr;
  body: Statement[];
}

/** `if <expr> { then } [else { else }]` — control flow, expanded during resolve. */
export interface IfNode extends NodeBase {
  kind: "if";
  cond: Expr;
  then: Statement[];
  else?: Statement[];
}

/** `while <expr> { body }` — bounded loop, expanded during resolve. */
export interface WhileNode extends NodeBase {
  kind: "while";
  cond: Expr;
  body: Statement[];
}

/** `NAME = <expr>` — reassign an existing binding (expand-time, makes `while`
 *  loops terminate). Distinct from `let`, which declares. */
export interface AssignNode extends NodeBase {
  kind: "assign";
  name: string;
  value: Expr;
}

/** One `key: value` override inside a `set` rule. */
export interface SetOverride {
  key: string;
  value: Expr;
}

/** `set <kind>(key: value, …)` — override defaults for subsequent elements of
 *  that kind, scoped to the enclosing block. */
export interface SetNode extends NodeBase {
  kind: "set";
  target: ElementKind;
  over: SetOverride[];
}

/**
 * A statement the parser could not parse. Instead of silently dropping the
 * broken region, the parser emits one of these (capturing the skipped span and
 * the diagnostic message), so the tree stays lossless and tooling can see the
 * hole. It carries no geometry; `resolve` skips it.
 */
export interface ErrorNode extends NodeBase {
  kind: "error";
  message: string;
}

/** A plan-body statement in source order. */
export type Statement =
  | AstElement
  | LetNode
  | InstanceNode
  | ForNode
  | IfNode
  | WhileNode
  | AssignNode
  | SetNode
  | StripNode
  | ErrorNode;

/** `component NAME(params) { body }` — a reusable parameterised sub-plan. */
export interface ComponentDef {
  name: string;
  params: string[];
  body: Statement[];
  line: number;
  span?: Span;
}

/** One named item in an `import` list, optionally renamed with `as`. */
export interface ImportItem {
  name: string;
  alias?: string;
}

/**
 * `import "<spec>" : a, b as c` (named items) or `import "<spec>" : *` (all).
 * `spec` is a module reference — a relative `.arch` path or a namespaced
 * `@local/name:1.0.0` — resolved through the {@link import("./world.js").World}
 * at link time. Imports bring the module's **components** into this plan.
 */
export interface ImportNode {
  kind: "import";
  spec: string;
  items: ImportItem[];
  /** `import "x": *` — bring in every exported component. */
  star: boolean;
  line: number;
  span?: Span;
}

export interface TitleNode {
  project?: string;
  drawnBy?: string;
  date?: string;
  line: number;
  span?: Span;
}

export interface PlanNode {
  name: string;
  /** Only "mm" is supported. */
  units: "mm";
  /** Snap module in mm; 0 disables snapping. */
  grid: number;
  /** e.g. "1:50". */
  scale?: string;
  north: NorthDir;
  /** `dims auto [overall|rooms|walls|all]` — synthesize dimension strings at render. */
  autoDims?: "overall" | "rooms" | "walls" | "all";
  title?: TitleNode;
  /** Explicit accessible title (`accTitle "…"`) — overrides the plan name in the
   *  accessible-SVG `<title>` (`compile(src, { accessible: true })`). Metadata only. */
  accTitle?: string;
  /** Explicit accessible description (`accDescr "…"`) — overrides the derived
   *  caption in the accessible-SVG `<desc>`. Metadata only. */
  accDescr?: string;
  /** Theme overrides from the `theme { … }` directive. */
  theme?: Partial<Theme>;
  /** Named theme base from `theme <name> { … }` (resolved at lowering). */
  themeBase?: string;
  /** Wall colour for `theme from "#color"` — opt-in poché derivation. */
  themeFrom?: string;
  /** Per-element style overrides (`style <kind> { … }`), by kind → Theme partial. */
  styles?: Record<string, Partial<Theme>>;
  /** Component definitions, by name. */
  components: Map<string, ComponentDef>;
  /** Module imports (header-level), resolved at link time before resolve. */
  imports: ImportNode[];
  /** All statements (elements, `let`s, instances), in source order. */
  body: Statement[];
  /** Line comments captured as trivia (for the formatter / LSP); not semantic. */
  comments?: Comment[];
  /** Byte offset just past the body's opening `{` — lets the formatter tell
   *  file-header comments (before it) from in-body comments. */
  bodyStart?: number;
}
