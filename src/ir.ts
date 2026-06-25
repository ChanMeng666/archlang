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
import type { Env, Expr, Value } from "./expr.js";
import { asBool, asNum, closest, evalExpr, exprSpan } from "./expr.js";
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
/** Safety cap on `while` iterations (deterministic guard against runaway loops). */
const MAX_ITERATIONS = 10_000;

/** An element flattened out of the body, paired with the env its exprs use. */
interface Entry {
  node: AstElement;
  env: Env;
  id: string;
  resolved?: ResolvedElement;
}

/**
 * A lexical scope: its own bindings plus a link to the enclosing scope. `let`
 * declares in this scope (shadowing parents); assignment mutates the nearest
 * enclosing scope that owns the name; lookups walk up the chain. All of this is
 * expand-time and pure — there is no runtime.
 */
class Scope {
  readonly vars = new Map<string, Value>();
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
    for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of chain[i].vars) m.set(k, v);
    return m;
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
): Entry[] {
  const diag = (d: Diagnostic) => diagnostics.push(d);
  const out: Entry[] = [];
  /** Evaluate an expression against this scope's currently-visible bindings. */
  const evalIn = (e: Expr): Value => evalExpr(e, scope.flatten(), diag);

  for (const stmt of body) {
    switch (stmt.kind) {
      case "let": {
        if (scope.vars.has(stmt.name)) {
          diag({ severity: "error", message: `"${stmt.name}" is already defined in this scope`, code: "E_REDEF", span: stmt.span });
          break;
        }
        scope.vars.set(stmt.name, evalIn(stmt.value));
        break;
      }
      case "assign": {
        const owner = scope.owner(stmt.name);
        if (!owner) {
          const hint = closest(stmt.name, [...scope.flatten().keys()]);
          diag({ severity: "error", message: `Cannot assign to undefined name "${stmt.name}" (declare it with "let" first)`, code: "E_ASSIGN_UNDEF", span: stmt.span, hints: hint ? [`did you mean "${hint}"?`] : undefined });
          break;
        }
        owner.vars.set(stmt.name, evalIn(stmt.value));
        break;
      }
      case "instance": {
        const comp = components.get(stmt.name);
        if (!comp) {
          const hint = closest(stmt.name, [...components.keys()]);
          diag({ severity: "error", message: `Unknown component "${stmt.name}"`, code: "E_UNKNOWN_COMPONENT", span: stmt.span, hints: hint ? [`did you mean "${hint}"?`] : undefined });
          break;
        }
        if (depth >= MAX_DEPTH) {
          diag({ severity: "error", message: `Component recursion too deep (limit ${MAX_DEPTH}) instantiating "${stmt.name}"`, code: "E_RECURSION", span: stmt.span });
          break;
        }
        if (stmt.args.length !== comp.params.length) {
          diag({ severity: "error", message: `Component "${stmt.name}" expects ${comp.params.length} argument(s) but got ${stmt.args.length}`, code: "E_ARGCOUNT", span: stmt.span });
        }
        const argVals: Value[] = comp.params.map((_, i) =>
          stmt.args[i] !== undefined ? evalIn(stmt.args[i]) : { t: "num", v: 0 },
        );
        // Component scope = plan global + params; its lets are local.
        const childScope = new Scope(global);
        comp.params.forEach((p, i) => childScope.vars.set(p, argVals[i]));
        out.push(...expandScope(comp.body, childScope, global, components, diagnostics, depth + 1));
        break;
      }
      case "for": {
        const it = evalIn(stmt.iter);
        if (it.t !== "arr") {
          diag({ severity: "error", message: `"for" expects an array or range but got a ${it.t === "num" ? "number" : it.t}`, code: "E_TYPE", span: stmt.span });
          break;
        }
        for (const item of it.v) {
          const child = new Scope(scope);
          child.vars.set(stmt.varName, item);
          out.push(...expandScope(stmt.body, child, global, components, diagnostics, depth));
        }
        break;
      }
      case "if": {
        const cond = asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond));
        const branch = cond ? stmt.then : stmt.else;
        if (branch) out.push(...expandScope(branch, new Scope(scope), global, components, diagnostics, depth));
        break;
      }
      case "while": {
        let n = 0;
        while (asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond))) {
          if (n++ >= MAX_ITERATIONS) {
            diag({ severity: "error", message: `"while" exceeded ${MAX_ITERATIONS} iterations (possible infinite loop)`, code: "E_WHILE_LIMIT", span: stmt.span });
            break;
          }
          out.push(...expandScope(stmt.body, new Scope(scope), global, components, diagnostics, depth));
        }
        break;
      }
      default:
        // An element: snapshot the scope's visible bindings for resolve.
        out.push({ node: stmt, env: scope.flatten(), id: "" });
    }
  }
  return out;
}

export function resolve(ast: PlanNode): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const g = ast.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const snapPt = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  // 0. Expand body (lets, assignments, instances, control flow) into a flat
  //    element stream. The top-level scope IS the global scope (plan `let`s).
  const globalScope = new Scope();
  const entries = expandScope(ast.body, globalScope, globalScope, ast.components, diagnostics, 0);

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
  const evalNum = (e: Expr): number =>
    asNum(evalExpr(e, activeEnv, (d) => diagnostics.push(d)), (d) => diagnostics.push(d), exprSpan(e));
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
