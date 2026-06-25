/** Abstract syntax tree for an ArchLang `plan`. All distances are in millimetres.
 *
 * The AST is the raw, immutable output of parsing: `resolve()` (see ir.ts) reads
 * it and produces a separate IR — nothing here is mutated after parse.
 */

import type { Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";

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
  /** Polyline vertices in order. */
  points: ExprPoint[];
  /** Whether the polyline closes back to its first vertex. */
  closed: boolean;
}

export interface RoomNode extends NodeBase {
  kind: "room";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
  label?: string;
}

export interface DoorNode extends NodeBase {
  kind: "door";
  at: ExprPoint;
  width: Expr;
  /** Optional wall (id or category) the door is hosted by. */
  wall?: string;
  hinge: "left" | "right";
  swing: "in" | "out";
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
  label?: string;
}

export interface DimNode extends NodeBase {
  kind: "dim";
  from: ExprPoint;
  to: ExprPoint;
  /** Perpendicular offset of the dimension line from the measured segment, mm. */
  offset: Expr;
  /** Override text; defaults to the measured length. */
  text?: string;
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

/** A plan-body statement in source order: an element, a `let`, or an instance. */
export type Statement = AstElement | LetNode | InstanceNode;

/** `component NAME(params) { body }` — a reusable parameterised sub-plan. */
export interface ComponentDef {
  name: string;
  params: string[];
  body: Statement[];
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
  /** Component definitions, by name. */
  components: Map<string, ComponentDef>;
  /** All statements (elements, `let`s, instances), in source order. */
  body: Statement[];
}
