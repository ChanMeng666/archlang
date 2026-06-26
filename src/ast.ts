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
export type ElementKind =
  | "wall"
  | "room"
  | "door"
  | "window"
  | "furniture"
  | "dim"
  | "column";

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

export interface RoomNode extends NodeBase {
  kind: "room";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
  /** Label as a string-interpolation template, evaluated at resolve. */
  label?: Expr;
}

export interface DoorNode extends NodeBase {
  kind: "door";
  at: ExprPoint;
  width: Expr;
  /** Optional wall (id or category) the door is hosted by. */
  wall?: string;
  /** Hinge/swing are explicit-only here; the default (and any `set door(...)`
   *  override) is applied at resolve so user-specified values always win. */
  hinge?: "left" | "right";
  swing?: "in" | "out";
}

export interface WindowNode extends NodeBase {
  kind: "window";
  at: ExprPoint;
  width: Expr;
  wall?: string;
}

export interface FurnitureNode extends NodeBase {
  kind: "furniture";
  /** Free-form category, e.g. "bed" or "sofa". */
  category: string;
  at: ExprPoint;
  size: { w: Expr; h: Expr };
  /** Label as a string-interpolation template, evaluated at resolve. */
  label?: Expr;
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

/** Discriminated union of all element AST nodes (registry-dispatchable). */
export type AstElement =
  | WallNode
  | RoomNode
  | DoorNode
  | WindowNode
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
  title?: TitleNode;
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
