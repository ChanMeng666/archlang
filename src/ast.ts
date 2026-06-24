/** Abstract syntax tree for an ArchLang `plan`. All distances are in millimetres. */

export interface Point {
  x: number;
  y: number;
}

/** North orientation: a cardinal keyword or an explicit bearing in degrees. */
export type NorthDir = "up" | "down" | "left" | "right" | { deg: number };

export interface WallNode {
  id: string;
  /** Free-form category, e.g. "exterior" or "partition". Drives line weight. */
  kind: string;
  /** Wall thickness in mm. */
  thickness: number;
  /** Polyline vertices in order. */
  points: Point[];
  /** Whether the polyline closes back to its first vertex. */
  closed: boolean;
  line: number;
}

export interface RoomNode {
  id: string;
  at: Point;
  size: { w: number; h: number };
  label?: string;
  line: number;
}

export interface DoorNode {
  id: string;
  at: Point;
  width: number;
  /** Optional wall (id or kind) the door is hosted by. */
  wall?: string;
  hinge: "left" | "right";
  swing: "in" | "out";
  line: number;
}

export interface WindowNode {
  id: string;
  at: Point;
  width: number;
  wall?: string;
  line: number;
}

export interface FurnitureNode {
  id: string;
  kind: string;
  at: Point;
  size: { w: number; h: number };
  label?: string;
  line: number;
}

export interface DimNode {
  id: string;
  from: Point;
  to: Point;
  /** Perpendicular offset of the dimension line from the measured segment, mm. */
  offset: number;
  /** Override text; defaults to the measured length. */
  text?: string;
  line: number;
}

export interface TitleNode {
  project?: string;
  drawnBy?: string;
  date?: string;
  line: number;
}

export interface PlanNode {
  name: string;
  /** Only "mm" is supported in v0.1. */
  units: "mm";
  /** Snap module in mm; 0 disables snapping. */
  grid: number;
  /** e.g. "1:50". */
  scale?: string;
  north: NorthDir;
  walls: WallNode[];
  rooms: RoomNode[];
  doors: DoorNode[];
  windows: WindowNode[];
  furniture: FurnitureNode[];
  dims: DimNode[];
  title?: TitleNode;
}
