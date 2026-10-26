/**
 * `describe --facts depends` (plan-soundness card PS4.1): per element, what it is derived
 * from. Opt-in; a summary that does not ask for it is unchanged by a byte.
 *
 * - `on`: the ids the element's resolution read. A relational room's reference room; the
 *   rooms of `between A and B`; the room of `on <room>.<edge>`, `against <room>.<edge>` and
 *   `segment containing <room>.<edge>`; a `facing` target; the room of `in <room> anchor|
 *   centered`, and of `in <room>` on an `against wall` piece with no `side` (the side is
 *   inferred from it); `swing into <room>`; a pairwise wall's rooms; `dim radius|diameter`'s
 *   element; every room whose datum (`r.top|bottom|left|right|cx|cy`, or a compass alias) one
 *   of its expressions or `from <room>.<edge>` reads; and an AUTHORED host or backing wall
 *   (an opening's host, an `against wall` piece's wall, the ring a `roof … overhang` follows).
 * - `axes`: the positioning-axis labels it is placed at (`at axis <label>`, ADR 0028 §5),
 *   sorted. Always present, empty when it reads none, like `on` and `params`.
 * - `hostWallId`: the wall it is hosted on or backed onto, authored or derived.
 * - `params`: the bound names its expressions read (a `let`, a module `let`, a component or
 *   function parameter, a `for` variable), and the user functions it calls. Direct reads
 *   only: a `let` that reads another `let` is not followed (shadowing and reassignment make a
 *   static chain ambiguous, and `arch impact` twin-compiles anyway).
 *
 * **A derived wall** (ADR 0028 §3, as amended by PS4.1) has no author-facing id, and
 * `describe()` prints its internal name only in `derived_walls[]`, in `heights.walls[]` and as
 * the `hostWallId` of an element hosted on or backed onto one. So `on` never holds one: the
 * element names it as `hostWallId`, and the rooms that produced it are listed ONCE, in its own
 * row of `depends.derived_walls[]` (keyed by `name` exactly as `heights.walls[]` keys them),
 * never copied into every piece backed onto it.
 *
 * Read from the linked AST (the names as written, in the frame of the statement, then
 * namespaced by the element's instance path exactly as `frame.ts`'s `nsId` does) and from
 * the resolved IR (hosts, derived walls). Post-resolve and outside the evaluator: each
 * statement is walked once (memoised), so the work and the output are linear in the AST, the
 * elements (each lists at most the distinct names and ids its own statement holds, plus one
 * host) and the derived walls times their rooms (a ring's row lists its room set once; the
 * set is computed once per statement). The element count is held by `MAX_ELEMENTS`. No step
 * is charged, because no evaluation happens (there is no meter outside a resolution, see
 * `src/expr.ts`).
 *
 * `--view` cannot reach it: `describe()` never sees a view, and nothing here reads one.
 * Heights are not dependencies: no element's position reads a height, and a height clause's
 * own names (`height h`, `head hd`, `sill s`) are read only by that element, so they appear
 * in its `params` like any other expression it reads, and nowhere in `on`.
 */

import type { PlanNode, Statement, WallsFromRoomsNode, WallsPairClause } from "../ast.js";
import { BUILTIN_NAMES } from "../builtins.js";
import { exprChildren, statementBodies, statementReads } from "../cursor.js";
import type { Span } from "../diagnostics.js";
import type { Expr } from "../expr.js";
import type { RFurniture, ResolvedElement, ResolvedPlan, RRoof, RRoom, RWallsFromRooms } from "../ir.js";
import { splitDatum } from "../room-datums.js";
import type { KeepFact } from "./keep-facts.js";

/** One element's dependencies. */
export interface DependsEntry {
  id: string;
  kind: string;
  /** Ids it derives from, sorted, no repeats. Never a derived wall's internal name. */
  on: string[];
  /** Bound names its expressions read, sorted, no repeats. */
  params: string[];
  /** Positioning-axis labels it is placed at (`at axis <label>`), sorted; empty when none. */
  axes: string[];
  /** The wall it is hosted on (a door, window or cased opening, as `access.edges[].hostWallId`)
   *  or backed onto (an `against wall` piece, a roof following a ring), authored or derived:
   *  the one place a derived wall's internal name appears in an element's row. */
  hostWallId?: string;
}

/** One derived wall's dependencies (`name` as in `derived_walls[]` and `heights.walls[]`). */
export interface DerivedWallDepends {
  name: string;
  /** The rooms it is derived from, and an authored wall that took a span over from it. */
  on: string[];
  /** The names its thickness expression reads. */
  params: string[];
}

/** `describe().depends`: present only when requested (`facts: ["depends"]`). */
export interface DependsFacts {
  /** Every element of the storey (but the `walls from rooms` statement itself), by id. */
  elements: DependsEntry[];
  /** Every wall `walls from rooms` derived on the storey, by name. */
  derived_walls: DerivedWallDepends[];
  /** The plan's keeps as static facts (`./keep-facts.ts`), present only when it declares one:
   *  every keep on the top-level object, a storey's own on each `levels[]` entry. */
  keeps?: KeepFact[];
}

/** What one statement reads, in its own frame. */
interface Reads {
  names: ReadonlySet<string>;
  ids: ReadonlySet<string>;
  axes: ReadonlySet<string>;
}

type ClauseHit = { stmt: WallsFromRoomsNode; pair: WallsPairClause };

/** The linked plan's statements, by the span (and file) every resolved element carries. */
export interface StatementIndex {
  statement(span: Span | undefined, file: string | undefined): Statement | undefined;
  clause(span: Span | undefined, file: string | undefined): ClauseHit | undefined;
  reads(s: Statement): Reads;
}

const key = (span: Span, file: string | undefined): string => `${file ?? ""}\u0000${span.start}:${span.end}`;
const BUILTINS: ReadonlySet<string> = new Set(BUILTIN_NAMES);

/** Index every statement of the linked plan: its body, its components, their nested scopes. */
export function indexStatements(plan: PlanNode): StatementIndex {
  const byKey = new Map<string, Statement>();
  const clauses = new Map<string, ClauseHit>();
  const seen = new Set<unknown>();
  const go = (body: readonly Statement[], file: string | undefined): void => {
    for (const s of body) {
      if (s.span && !byKey.has(key(s.span, file))) byKey.set(key(s.span, file), s);
      if (s.kind === "walls") for (const p of s.pairs ?? []) clauses.set(key(p.span, file), { stmt: s, pair: p });
      for (const b of statementBodies(s)) go(b, file);
    }
  };
  const comps = (m: ReadonlyMap<string, import("../ast.js").ComponentDef> | undefined): void => {
    for (const c of m?.values() ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      go(c.body, c.file);
      comps(c.scope);
    }
  };
  go(plan.body, undefined);
  comps(plan.components);
  const memo = new Map<Statement, Reads>();
  return {
    statement: (span, file) => (span ? byKey.get(key(span, file)) : undefined),
    clause: (span, file) => (span ? clauses.get(key(span, file)) : undefined),
    reads(s) {
      let r = memo.get(s);
      if (!r) {
        r = readsOf(s);
        memo.set(s, r);
      }
      return r;
    },
  };
}

/** The names an expression reads (minus those its own function literals bind), and the rooms
 *  of the datums it reads. */
function walkExprs(exprs: readonly Expr[], names: Set<string>, ids: Set<string>): void {
  const go = (e: Expr, bound: ReadonlySet<string>): void => {
    if (e.t === "ref") {
      const d = e.name.includes(".") ? splitDatum(e.name) : undefined;
      if (d) ids.add(d.room);
      else if (!bound.has(e.name)) names.add(e.name);
    } else if (e.t === "call" && !BUILTINS.has(e.callee) && !bound.has(e.callee)) names.add(e.callee);
    const inner = e.t === "fnlit" ? new Set([...bound, ...e.params]) : bound;
    for (const c of exprChildren(e)) go(c, inner);
  };
  for (const e of exprs) go(e, new Set());
}

/** The bound names expressions read (a `let`, a parameter, a user function), minus built-ins
 *  and the names their own function literals bind; datums are not names. */
export function exprNames(exprs: readonly Expr[]): Set<string> {
  const names = new Set<string>();
  walkExprs(exprs, names, new Set());
  return names;
}

/** The room of a dotted `<room>.<edge>` written outside an expression. */
const datumRoom = (name: string | undefined, ids: Set<string>): void => {
  const d = name !== undefined ? splitDatum(name) : undefined;
  if (d) ids.add(d.room);
};

function readsOf(s: Statement): Reads {
  const names = new Set<string>();
  const ids = new Set<string>();
  const axes = new Set<string>();
  walkExprs(statementReads(s), names, ids);
  switch (s.kind) {
    case "room":
      if (s.rel) ids.add(s.rel.ref);
      break;
    case "wall":
      if (s.relation?.kind === "between") ids.add(s.relation.a.id).add(s.relation.b.id);
      else if (s.relation) for (const r of s.relation.rooms) ids.add(r.id);
      break;
    case "door":
    case "window":
    case "opening": {
      datumRoom(s.attach?.wall, ids);
      for (const pos of [s.attach?.pos, "between" in s ? s.between?.pos : undefined]) {
        if (pos?.kind === "from" && "datum" in pos.from) datumRoom(pos.from.datum, ids);
        if (pos?.kind === "axis") axes.add(pos.label);
      }
      if ("between" in s && s.between) ids.add(s.between.a.id).add(s.between.b.id);
      if (s.kind === "door" && s.swingInto !== undefined) ids.add(s.swingInto);
      break;
    }
    case "furniture":
      datumRoom(s.againstEdge?.edge, ids);
      if (s.against?.segmentSelect?.kind === "containing") datumRoom(s.against.segmentSelect.edge, ids);
      if (s.facing) ids.add(s.facing.target);
      // `in <room>` places a room-relative piece, and picks an `against wall` piece's face
      // when no `side` is written; on an `at (x,y)` piece it only says whose it is.
      if (s.room !== undefined && (s.place || (s.against && s.against.side === undefined))) ids.add(s.room);
      break;
    case "dim":
      if (s.curve) {
        ids.add(s.curve.ref);
        if (s.curve.segmentSelect?.kind === "containing") datumRoom(s.curve.segmentSelect.edge, ids);
      }
      break;
  }
  return { names, ids, axes };
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** The rooms a `walls from rooms` statement derives from: its group's placed rooms less
 *  `except` (what a ring is drawn round). */
function roomSet(stmt: RWallsFromRooms, rooms: readonly RRoom[]): string[] {
  const ns = (id: string): string => (stmt._instance ? `${stmt._instance}.${id}` : id);
  const except = new Set(stmt.except.map(ns));
  return rooms
    .filter((r) => r._instance === stmt._instance && r._unplaced !== true && !except.has(r.id))
    .map((r) => r.id);
}

/** The `depends` fact of one storey. */
export function dependsFacts(ir: ResolvedPlan, index: StatementIndex): DependsFacts {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const wallsById = new Map(ir.walls.map((w) => [w.id, w]));
  const statements = ir.elements.filter((e): e is RWallsFromRooms => e.kind === "walls");
  const ns = (e: { _instance?: string }) => (id: string) => (e._instance ? `${e._instance}.${id}` : id);
  const namesOf = (exprs: readonly (Expr | undefined)[]): Set<string> => {
    const names = new Set<string>();
    walkExprs(
      exprs.filter((x): x is Expr => x !== undefined),
      names,
      new Set(),
    );
    return names;
  };

  const elements: DependsEntry[] = [];
  for (const e of ir.elements as ResolvedElement[]) {
    if (e.kind === "walls") continue;
    const on = new Set<string>();
    let params: Iterable<string> = [];
    let axes: Iterable<string> = [];
    let hostWallId: string | undefined;
    const prefix = ns(e);
    const clause = e.kind === "opening" && e._derived ? index.clause(e.span, e._file) : undefined;
    if (e.kind === "opening" && e._derived && clause?.pair.kind === "open") {
      // A derived `open between` opening: its clause's width, its pair.
      for (const r of e._derived.between) on.add(r);
      params = namesOf([clause.pair.width]);
    } else {
      const stmt = index.statement(e.span, e._file);
      if (stmt) {
        const r = index.reads(stmt);
        params = r.names;
        axes = r.axes;
        for (const id of r.ids) on.add(prefix(id));
      }
    }
    // The wall it is hosted on or backed onto: always `hostWallId`; in `on` only when authored.
    if (e.kind === "door" || e.kind === "window" || e.kind === "opening") hostWallId = e.host?.wallId;
    else if (e.kind === "furniture") hostWallId = (e as RFurniture)._againstWall;
    else if (e.kind === "roof") hostWallId = (e as RRoof)._follows;
    if (hostWallId !== undefined) on.add(hostWallId);
    // A derived wall is never named in `on` (ADR 0028 §3), even where the author could spell
    // it: it is reached through `hostWallId` and its own `derived_walls[]` row.
    for (const id of [...on]) if (wallsById.get(id)?._derived) on.delete(id);
    on.delete(e.id);
    elements.push({
      id: e.id,
      kind: e.kind,
      on: sorted(on),
      params: sorted(params),
      axes: sorted(axes),
      ...(hostWallId !== undefined ? { hostWallId } : {}),
    });
  }
  elements.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  const derived_walls: DerivedWallDepends[] = [];
  for (const s of statements) {
    const node = index.statement(s.span, s._file);
    const ast = node?.kind === "walls" ? node : undefined;
    const prefix = ns(s);
    const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    // Each lookup is a map, so a statement's rows cost time linear in its walls.
    const rowOf = new Map(s._derivedRows.map((r) => [r.name, r]));
    const thicknessOf = new Map<string, Expr>();
    for (const p of ast?.pairs ?? [])
      if (p.kind === "thickness") thicknessOf.set(pairKey(prefix(p.a.id), prefix(p.b.id)), p.thickness);
    let ring: string[] | undefined;
    for (const w of s._derivedWalls) {
      const between = w._derived?.between;
      if (!between && ring === undefined) ring = roomSet(s, rooms);
      const on = new Set(between ?? ring);
      // An authored wall that took a span of this run over: the remainder's ends follow it.
      // A piece split off a run is named `<run>~<n>`.
      const row = rowOf.get(w.id) ?? rowOf.get(w.id.replace(/~\d+$/, ""));
      for (const d of row?.dropped ?? []) on.add(d.by);
      let thickness: Expr | undefined;
      if (ast) {
        if (w._derived?.ring) thickness = ast.exterior;
        else thickness = (between && thicknessOf.get(pairKey(between[0], between[1]))) || ast.partition;
      }
      derived_walls.push({ name: w.id, on: sorted(on), params: sorted(namesOf([thickness])) });
    }
  }
  derived_walls.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { elements, derived_walls };
}
