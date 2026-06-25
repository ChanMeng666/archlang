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
  ElementKind,
  ExprPoint,
  NorthDir,
  PlanNode,
  Point,
  Statement,
  TitleNode,
} from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Env, Expr } from "./expr.js";
import { closest, evalExpr } from "./expr.js";
import type { Theme } from "./theme.js";
import type { ResolveCtx } from "./registry.js";
import type { WallSegment } from "./geometry.js";
import { hostInfoForWalls } from "./geometry.js";
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
  /** Resolved hatch material (always a known material; defaults to "poche"). */
  material: string;
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
  theme?: Partial<Theme>;
  /** Resolved elements, in source order (for rendering). */
  elements: ResolvedElement[];
  /** Resolved walls (for bounds/hosting), in source order. */
  walls: RWall[];
}

/** Max component-instantiation nesting depth before bailing out. */
const MAX_DEPTH = 64;

/** An element flattened out of the body, paired with the env its exprs use. */
interface Entry {
  node: AstElement;
  env: Env;
  id: string;
  resolved?: ResolvedElement;
}

/**
 * Expand a statement list into a flat element stream: evaluate `let`s into the
 * scope env (source order, no forward refs), and inline component instances.
 *
 * Scoping is lexical with the plan as the global scope: a component body sees
 * the plan-level `let`s (`global`) plus its own params and local `let`s, but
 * NOT the caller's locals. `env` is this scope's env; at the top level it *is*
 * `global`, so top-level `let`s populate the global scope.
 */
function expandScope(
  body: Statement[],
  env: Env,
  defined: Set<string>,
  global: Env,
  components: Map<string, ComponentDef>,
  diagnostics: Diagnostic[],
  depth: number,
): Entry[] {
  const diag = (d: Diagnostic) => diagnostics.push(d);
  const out: Entry[] = [];

  for (const stmt of body) {
    if (stmt.kind === "let") {
      if (defined.has(stmt.name)) {
        diag({ severity: "error", message: `"${stmt.name}" is already defined in this scope`, code: "E_REDEF", span: stmt.span });
        continue;
      }
      env.set(stmt.name, evalExpr(stmt.value, env, diag));
      defined.add(stmt.name);
    } else if (stmt.kind === "instance") {
      const comp = components.get(stmt.name);
      if (!comp) {
        const hint = closest(stmt.name, [...components.keys()]);
        diag({ severity: "error", message: `Unknown component "${stmt.name}"`, code: "E_UNKNOWN_COMPONENT", span: stmt.span, hints: hint ? [`did you mean "${hint}"?`] : undefined });
        continue;
      }
      if (depth >= MAX_DEPTH) {
        diag({ severity: "error", message: `Component recursion too deep (limit ${MAX_DEPTH}) instantiating "${stmt.name}"`, code: "E_RECURSION", span: stmt.span });
        continue;
      }
      if (stmt.args.length !== comp.params.length) {
        diag({ severity: "error", message: `Component "${stmt.name}" expects ${comp.params.length} argument(s) but got ${stmt.args.length}`, code: "E_ARGCOUNT", span: stmt.span });
      }
      const argVals = comp.params.map((_, i) => (stmt.args[i] !== undefined ? evalExpr(stmt.args[i], env, diag) : 0));
      // Component scope = plan global + params; its lets are local.
      const childEnv: Env = new Map(global);
      const childDefined = new Set<string>();
      comp.params.forEach((p, i) => {
        childEnv.set(p, argVals[i]);
        childDefined.add(p);
      });
      out.push(...expandScope(comp.body, childEnv, childDefined, global, components, diagnostics, depth + 1));
    } else {
      out.push({ node: stmt, env: new Map(env), id: "" });
    }
  }
  return out;
}

export function resolve(ast: PlanNode): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const g = ast.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const snapPt = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  // 0. Expand body (lets + component instantiation) into a flat element stream.
  //    At the top level the scope env IS the global env (plan-level `let`s).
  const globalEnv: Env = new Map();
  const entries = expandScope(ast.body, globalEnv, new Set(), globalEnv, ast.components, diagnostics, 0);

  // 1. Assign ids in registry (canonical) order. The flat stream is numbered
  //    globally per kind, so auto-ids stay unique across component instances.
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
    for (const e of entries) {
      if (e.node.kind !== def.kind) continue;
      idx++;
      e.id = assignId(e.node.id, def.idPrefix(e.node), idx, e.node.span);
    }
  }

  // 2. Resolve in registry order (walls first → openings can host against them).
  //    `activeEnv`/`activeId` are swapped per entry so each element evaluates
  //    its expressions against the env captured during expansion.
  const walls: RWall[] = [];
  let activeEnv: Env = new Map();
  const evalNum = (e: Expr): number => evalExpr(e, activeEnv, (d) => diagnostics.push(d));
  const evalPt = (p: ExprPoint): Point => ({ x: evalNum(p.x), y: evalNum(p.y) });
  // Openings call isOnWall(at, ref) then hostSegment(at, ref) with identical
  // args back-to-back; a one-entry memo fuses those into a single wall scan.
  // walls is fully populated before any opening resolves (registry order:
  // walls first), so the cached info stays valid for the whole opening phase.
  let hiKey = "";
  let hiVal: { host: WallSegment | null; onWall: boolean } | null = null;
  const hostInfo = (at: Point, ref?: string) => {
    const key = `${at.x},${at.y},${ref ?? ""}`;
    if (key === hiKey && hiVal) return hiVal;
    hiKey = key;
    hiVal = hostInfoForWalls(walls, at, ref);
    return hiVal;
  };
  const ctx: ResolveCtx = {
    grid: g,
    snap,
    snapPt,
    eval: evalNum,
    evalPt,
    id: "",
    walls,
    hostSegment: (at, ref) => hostInfo(at, ref).host,
    isOnWall: (at, ref) => hostInfo(at, ref).onWall,
    diag: (d) => diagnostics.push(d),
  };
  for (const def of registryOrder) {
    for (const e of entries) {
      if (e.node.kind !== def.kind) continue;
      activeEnv = e.env;
      ctx.id = e.id;
      const r = def.resolve(e.node, ctx);
      e.resolved = r;
      if (r.kind === "wall") walls.push(r);
    }
  }

  // 3. IR element list in source order (for rendering).
  const elements = entries.map((e) => e.resolved!);

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
    theme: ast.theme,
    elements,
    walls,
  };
  return { ir, diagnostics };
}
