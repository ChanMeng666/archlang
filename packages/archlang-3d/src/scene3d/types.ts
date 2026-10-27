/**
 * Scene3D v0: a renderer-independent, plan-aligned 2.5D scene read off a resolved plan
 * (archlang-3d plan §3.5, appendix A). Plan axes: x right, y DOWN; z up. Every length is an
 * integer number of micrometres ({@link Um}); handedness is resolved only by exporters.
 *
 * Mirrored by `scene3d.schema.json` and checked by `validateScene3D`; a test holds the three
 * together on the whole corpus.
 */

/** Integer micrometres (mm × 1000). */
export type Um = number;
/** `[x, y]` in micrometres, plan axes. */
export type Pt = [Um, Um];
/** A closed ring, no repeated last vertex. */
export type Ring3 = Pt[];
export interface Polygon {
  outer: Ring3;
  holes?: Ring3[];
}

export type Provenance = "authored" | "derived" | "default" | "user-param";

/** The plan element a Scene3D item was read from. `span` is its byte span in the source. */
export interface Source {
  kind: string;
  id: string;
  span?: [number, number];
}

/** One entry of the assumption ledger: every value the plan did not state (ADR 0005). */
export interface Assumption {
  kind: string;
  id?: string;
  field: string;
  value: unknown;
  provenance: Provenance;
  rule: string;
}

export interface Meta {
  name: string;
  units: "mm";
  tool: { archlang3d: string; archlang: string };
  north?: "up" | "down" | "left" | "right" | number;
  siteBoundary?: Ring3;
  params?: Record<string, unknown>;
  assumptions: Assumption[];
}

export interface Floor {
  id: string;
  source: Source;
  polygon: Polygon;
  uses?: string[];
}

/**
 * A wall's OWNED region after the core's joinery (H1), one polygon per connected piece, with the
 * openings NOT removed: each opening lists its cut, and the geometry stage removes it from every
 * piece it covers, keeping the sill and lintel.
 */
export interface Wall {
  id: string;
  source: Source;
  category?: string;
  material?: string;
  footprint: Polygon[];
  /** The same pieces with every opening's cut removed: the wall between each opening's sill and head. */
  body: Polygon[];
  height: Um;
  thickness: Um;
  /** Ids of the openings whose cut is hosted by this wall. */
  cuts: string[];
}

export type DoorKind = "hinged" | "sliding" | "barn" | "bifold" | "pocket" | "garage" | "double";

export interface Opening {
  id: string;
  source: Source;
  kind: "door" | "window" | "opening";
  doorKind?: DoorKind;
  /** The host wall's id. */
  host: string;
  /** The plan footprint the opening removes, from the core's `openingCut`. */
  cut: Ring3;
  centre: Pt;
  /** The two jambs on the host's centreline (the opening's chord along the wall, its tangent on a curve). */
  jambs: [Pt, Pt];
  /** A door's leaves in the closed pose, each `[hinge, far jamb]` (two for a `double` door, from the
   *  core's `doorLeaves`); absent for a kind that sweeps no leaf. */
  leaves?: Array<[Pt, Pt]>;
  width: Um;
  sill: Um;
  head: Um;
  hinge?: "left" | "right";
  swing?: "in" | "out";
  slide?: "left" | "right";
}

export interface Furniture {
  id: string;
  source: Source;
  category: string;
  room?: string;
  centre: Pt;
  /**
   * The footprint ON THE PLAN, already turned: `w` along plan x, `d` along plan y, whatever the
   * quarter-turn. An exporter places the box as is; `yawDeg` orients the asset INSIDE it (an
   * asset's own width runs along plan y at ±90°). Never apply `yawDeg` to this box a second time.
   */
  size: { w: Um; d: Um };
  /** Rotation about the vertical axis in the exporters' convention: minus the plan's `rotate`. */
  yawDeg: number;
  asset: string;
}

export interface Box {
  id: string;
  source: Source;
  at: Pt;
  size: { w: Um; h: Um };
}

export interface Stair {
  id: string;
  source: Source;
  box: Box;
  dir: "up" | "down";
  width: Um;
}

export interface Outdoor {
  id: string;
  source: Source;
  surface: string;
  polygon: Polygon;
  rail?: string[];
}

export interface Fence {
  id: string;
  source: Source;
  style: string;
  points: Pt[];
  closed: boolean;
}

export interface Roof {
  id: string;
  source: Source;
  form: "flat";
  ring: Ring3;
  provenance: Provenance;
}

export interface Level {
  level: number;
  name?: string;
  /** Top of this storey's floor above the lowest storey's floor. */
  elevation: Um;
  storeyHeight: Um;
  /** The outer rings of the storey's joined wall solid: the building's wall footprint. */
  footprint: Ring3[];
  floors: Floor[];
  walls: Wall[];
  openings: Opening[];
  furniture: Furniture[];
  stairs: Stair[];
  voids: Box[];
  columns: Box[];
  outdoor: Outdoor[];
  fences: Fence[];
  roofs: Roof[];
}

export interface Scene3D {
  version: 0;
  kind: "scene3d";
  meta: Meta;
  levels: Level[];
}
