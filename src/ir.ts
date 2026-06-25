/**
 * Intermediate representation + `resolve(ast)`.
 *
 * `resolve` is the single place semantics live: it grid-snaps coordinates,
 * assigns ids, hosts openings, and runs semantic checks — producing a NEW
 * immutable IR (the input AST is never mutated). `render` consumes IR only.
 */

import type { AstElement, ElementKind, NorthDir, PlanNode, Point, TitleNode } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { ResolveCtx } from "./registry.js";
import type { WallSegment } from "./geometry.js";
import { hostSegmentForWalls, isOnSomeWall } from "./geometry.js";
import { registryOrder } from "./elements/index.js";

export interface RBase {
  kind: ElementKind;
  id: string;
  span?: Span;
}

export interface RWall extends RBase {
  kind: "wall";
  category: string;
  thickness: number;
  points: Point[];
  closed: boolean;
}
export interface RRoom extends RBase {
  kind: "room";
  at: Point;
  size: { w: number; h: number };
  label?: string;
}
export interface RDoor extends RBase {
  kind: "door";
  at: Point;
  width: number;
  hinge: "left" | "right";
  swing: "in" | "out";
  host: WallSegment | null;
}
export interface RWindow extends RBase {
  kind: "window";
  at: Point;
  width: number;
  host: WallSegment | null;
}
export interface RFurniture extends RBase {
  kind: "furniture";
  category: string;
  at: Point;
  size: { w: number; h: number };
  label?: string;
}
export interface RDim extends RBase {
  kind: "dim";
  from: Point;
  to: Point;
  offset: number;
  text?: string;
}
export interface RColumn extends RBase {
  kind: "column";
  at: Point;
  size: { w: number; h: number };
}

export type ResolvedElement = RWall | RRoom | RDoor | RWindow | RFurniture | RDim | RColumn;

export interface ResolvedPlan {
  name: string;
  units: "mm";
  grid: number;
  scale?: string;
  north: NorthDir;
  title?: TitleNode;
  /** Resolved elements, in source order (for rendering). */
  elements: ResolvedElement[];
  /** Resolved walls (for bounds/hosting), in source order. */
  walls: RWall[];
}

export function resolve(ast: PlanNode): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const g = ast.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const snapPt = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  // 1. Assign ids in registry (canonical) order so cross-kind collisions and
  //    auto-id numbering are byte-identical to the v0.2 validate pass.
  const idMap = new Map<AstElement, string>();
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
  for (const def of registryOrder) {
    let idx = 0;
    for (const node of ast.elements) {
      if (node.kind !== def.kind) continue;
      idx++;
      idMap.set(node, assignId(node.id, def.idPrefix(node), idx, node.span));
    }
  }

  // 2. Resolve in registry order (walls first → openings can host against them).
  const walls: RWall[] = [];
  const ctx: ResolveCtx = {
    grid: g,
    snap,
    snapPt,
    idOf: (node) => idMap.get(node) ?? node.id,
    walls,
    hostSegment: (at, ref) => hostSegmentForWalls(walls, at, ref),
    isOnWall: (at, ref) => isOnSomeWall(walls, at, ref),
    diag: (d) => diagnostics.push(d),
  };
  const rmap = new Map<AstElement, ResolvedElement>();
  for (const def of registryOrder) {
    for (const node of ast.elements) {
      if (node.kind !== def.kind) continue;
      const r = def.resolve(node, ctx);
      rmap.set(node, r);
      if (r.kind === "wall") walls.push(r);
    }
  }

  // 3. IR element list in source order (for rendering).
  const elements = ast.elements.map((n) => rmap.get(n)!);

  // 4. Cross-element checks.
  const drawable = elements.some(
    (e) => e.kind === "wall" || e.kind === "room" || e.kind === "furniture" || e.kind === "column",
  );
  if (!drawable) {
    diagnostics.push({
      severity: "warning",
      message: "Plan has no walls, rooms, or furniture — nothing to draw",
      code: "W_EMPTY_PLAN",
    });
  }
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      const r1 = rooms[a];
      const r2 = rooms[b];
      const ox = Math.max(0, Math.min(r1.at.x + r1.size.w, r2.at.x + r2.size.w) - Math.max(r1.at.x, r2.at.x));
      const oy = Math.max(0, Math.min(r1.at.y + r1.size.h, r2.at.y + r2.size.h) - Math.max(r1.at.y, r2.at.y));
      if (ox > 1 && oy > 1) {
        diagnostics.push({
          severity: "warning",
          message: `Rooms "${r1.id}" and "${r2.id}" overlap`,
          code: "W_ROOM_OVERLAP",
          span: r2.span,
        });
      }
    }
  }

  const ir: ResolvedPlan = {
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    scale: ast.scale,
    north: ast.north,
    title: ast.title,
    elements,
    walls,
  };
  return { ir, diagnostics };
}
