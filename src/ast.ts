/** Abstract syntax tree for an ArchLang `plan`. All distances are in millimetres.
 *
 * The AST is the raw, immutable output of parsing: `resolve()` (see ir.ts) reads
 * it and produces a separate IR — nothing here is mutated after parse.
 */

import type { Span } from "./diagnostics.js";

export interface Point {
  x: number;
  y: number;
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
  thickness: number;
  /** Polyline vertices in order. */
  points: Point[];
  /** Whether the polyline closes back to its first vertex. */
  closed: boolean;
}

export interface RoomNode extends NodeBase {
  kind: "room";
  at: Point;
  size: { w: number; h: number };
  label?: string;
}

export interface DoorNode extends NodeBase {
  kind: "door";
  at: Point;
  width: number;
  /** Optional wall (id or category) the door is hosted by. */
  wall?: string;
  hinge: "left" | "right";
  swing: "in" | "out";
}

export interface WindowNode extends NodeBase {
  kind: "window";
  at: Point;
  width: number;
  wall?: string;
}

export interface FurnitureNode extends NodeBase {
  kind: "furniture";
  /** Free-form category, e.g. "bed" or "sofa". */
  category: string;
  at: Point;
  size: { w: number; h: number };
  label?: string;
}

export interface DimNode extends NodeBase {
  kind: "dim";
  from: Point;
  to: Point;
  /** Perpendicular offset of the dimension line from the measured segment, mm. */
  offset: number;
  /** Override text; defaults to the measured length. */
  text?: string;
}

export interface ColumnNode extends NodeBase {
  kind: "column";
  at: Point;
  size: { w: number; h: number };
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
  /** All elements, in source order. */
  elements: AstElement[];
}
