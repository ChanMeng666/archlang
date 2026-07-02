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
  RelAlign,
  RelDir,
  Statement,
  TitleNode,
  UseKind,
} from "./ast.js";
import { placeRelational } from "./layout.js";
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
import { segmentsOfWall, WallGrid } from "./geometry.js";
import type { GridBox } from "./geometry/grid-index.js";
import { GridIndex } from "./geometry/grid-index.js";
import { BUILTIN_NAMES } from "./builtins.js";

export interface RBase {
  kind: ElementKind;
  id: string;
  span?: Span;
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
  closed: boolean;
  /** Openings (doors/windows) hosted on this wall; subtracted from its solid. */
  openings: Opening[];
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

export interface RRoom extends RBase {
  kind: "room";
  at: Point;
  size: { w: number; h: number };
  label?: string;
  /** Declared function(s) from `uses …`; absent when the room is untagged. */
  uses?: UseKind[];
  /** Present only when the room used a relational clause (`right-of`/…); its
   *  `at` above is a placeholder until {@link placeRelational} resolves it. */
  _rel?: RelConstraint;
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
export interface ROpening extends RBase {
  kind: "opening";
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
  /** Quarter-turn rotation of the drawn symbol (0|90|180|270), default 0. */
  rotate?: number;
  /** Declared owning room id (`in <roomId>`), if any. */
  room?: string;
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

export type ResolvedElement = RWall | RRoom | RDoor | RWindow | ROpening | RFurniture | RDim | RColumn;

export interface ResolvedPlan {
  name: string;
  units: "mm";
  grid: number;
  scale?: string;
  north: NorthDir;
  /** `dims auto …` — synthesize dimension strings at scene-build (presentation only). */
  autoDims?: "overall" | "rooms" | "walls" | "all";
  title?: TitleNode;
  theme?: Partial<Theme>;
  /** Named theme base (`theme <name>`), resolved to colours at lowering. */
  themeBase?: string;
  /** Wall colour for opt-in poché derivation (`theme from "#color"`). */
  themeFrom?: string;
  /** Per-element style overrides (`style <kind> { … }`), applied at lowering. */
  styles?: Record<string, Partial<Theme>>;
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
  /** Active `set` overrides for this element's kind, captured at expansion. */
  defaults?: ReadonlyMap<string, Value>;
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
    for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of chain[i].vars) m.set(k, v);
    return m;
  }

  /** Merge `set` overrides for `kind` down the scope chain (child wins). */
  effectiveSet(kind: ElementKind): ReadonlyMap<string, Value> | undefined {
    let merged: Map<string, Value> | undefined;
    const chain: Scope[] = [];
    for (let s: Scope | undefined = this; s; s = s.parent) chain.push(s);
    for (let i = chain.length - 1; i >= 0; i--) {
      const m = chain[i].sets.get(kind);
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
): Entry[] {
  const diag = (d: Diagnostic) => diagnostics.push(d);
  const out: Entry[] = [];
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
          childScope.vars.set(p, argVals[i]);
        });
        out.push(...expandScope(comp.body, childScope, global, components, diagnostics, depth + 1));
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
            diag({
              severity: "error",
              message: `"while" exceeded ${MAX_ITERATIONS} iterations (possible infinite loop)`,
              code: "E_WHILE_LIMIT",
              span: stmt.span,
            });
            break;
          }
          out.push(...expandScope(stmt.body, new Scope(scope), global, components, diagnostics, depth));
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
      case "error":
        // A statement that failed to parse — already reported as a diagnostic at
        // parse time. It carries no geometry, so there is nothing to expand.
        break;
      default:
        // An element: snapshot the scope's visible bindings + active set-defaults.
        out.push({ node: stmt, env: scope.flatten(), id: "", defaults: scope.effectiveSet(stmt.kind) });
    }
  }
  return out;
}

// Stage memo: resolution is a pure function of (ast, registry, world). The AST
// is an immutable per-parse object, so its identity token uniquely keys the
// result (collision-free, unlike a content hash). Sharing the IR is safe —
// scene-building reads it read-only.
const resolveCache = new Map<string, { ir: ResolvedPlan; diagnostics: Diagnostic[] }>();
const RESOLVE_CACHE_MAX = 32;

/** Clear the resolve stage memo (called by `clearCache`). */
export function clearResolveCache(): void {
  resolveCache.clear();
}

export function resolve(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const key = `${idToken(ast)}:${idToken(registry)}:${idToken(world)}`;
  const hit = resolveCache.get(key);
  if (hit) return hit;
  const out = resolveImpl(ast, registry, world);
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
  for (const def of registry.order) {
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
  const rooms2: RRoom[] = [];
  let activeEnv: Env = new Map();
  const evalNum = (e: Expr): number =>
    asNum(
      evalExpr(e, activeEnv, (d) => diagnostics.push(d)),
      (d) => diagnostics.push(d),
      exprSpan(e),
    );
  const evalStr = (e: Expr): string => asStr(evalExpr(e, activeEnv, (d) => diagnostics.push(d)));
  const evalPt = (p: ExprPoint): Point => ({ x: evalNum(p.x), y: evalNum(p.y) });
  // Openings call isOnWall(at, ref) then hostSegment(at, ref) with identical
  // args back-to-back; a one-entry memo fuses those into a single wall scan.
  // walls is fully populated before any opening resolves (registry order:
  // walls first), so the spatial index is built lazily on first use and reused.
  let wallGrid: WallGrid | null = null;
  let hiKey = "";
  let hiVal: { host: WallSegment | null; onWall: boolean } | null = null;
  const hostInfo = (at: Point, ref?: string) => {
    const key = `${at.x},${at.y},${ref ?? ""}`;
    if (key === hiKey && hiVal) return hiVal;
    if (!wallGrid) wallGrid = new WallGrid(walls);
    hiKey = key;
    hiVal = wallGrid.hostInfo(at, ref);
    return hiVal;
  };
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
    diag: (d) => diagnostics.push(d),
  };
  for (const def of registry.order) {
    for (const e of entries) {
      if (e.node.kind !== def.kind) continue;
      activeEnv = e.env;
      ctx.id = e.id;
      ctx.defaults = e.defaults;
      const r = def.resolve(e.node, ctx);
      e.resolved = r;
      if (r.kind === "wall") walls.push(r);
      else if (r.kind === "room") rooms2.push(r);
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

  // 3b. Register openings: each hosted door/window voids its wall's solid. The
  //     host segment came from `segmentsOfWall`, so match by endpoint coords.
  const wallOfSegment = (seg: WallSegment): RWall | undefined =>
    walls.find((w) =>
      segmentsOfWall(w).some((s) => s.a.x === seg.a.x && s.a.y === seg.a.y && s.b.x === seg.b.x && s.b.y === seg.b.y),
    );
  for (const el of elements) {
    if ((el.kind === "door" || el.kind === "window" || el.kind === "opening") && el.host) {
      wallOfSegment(el.host)?.openings.push({ at: el.at, width: el.width });
    }
  }

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
  // Room overlap: a spatial grid restricts the pairwise test to rooms sharing a
  // cell (~O(n) for distributed plans) instead of all O(n²) pairs. Two rooms
  // overlap ⟹ their boxes intersect ⟹ they share a cell, so this finds exactly
  // the same overlaps; pairs are emitted in (a,b) order to keep diagnostics
  // byte-identical to the former double loop.
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
      const r2 = rooms[b];
      const ox = Math.max(0, Math.min(r1.at.x + r1.size.w, r2.at.x + r2.size.w) - Math.max(r1.at.x, r2.at.x));
      const oy = Math.max(0, Math.min(r1.at.y + r1.size.h, r2.at.y + r2.size.h) - Math.max(r1.at.y, r2.at.y));
      if (ox > 1 && oy > 1) {
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
      message: `Rooms "${rooms[a].id}" and "${rooms[b].id}" overlap`,
      code: "W_ROOM_OVERLAP",
      span: rooms[b].span,
    });
  }

  // A fixture's `in <roomId>` must name a real room (fail fast on an explicit ref —
  // ADR 0005: the core never guesses which room was meant).
  const roomIds = new Set(rooms.map((r) => r.id));
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

  const ir: ResolvedPlan = {
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    scale: ast.scale,
    north: ast.north,
    autoDims: ast.autoDims,
    title: ast.title,
    theme: ast.theme,
    themeBase: ast.themeBase,
    themeFrom: ast.themeFrom,
    styles: ast.styles,
    elements,
    walls,
  };
  return { ir, diagnostics };
}
