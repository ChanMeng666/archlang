/**
 * `describe --facts depends` for keeps (ADR 0033; plan-soundness PS4.3b, design §5, R5, R16):
 * `depends.keeps[]`, one row per accepted keep, read from the declarations alone.
 *
 * - **`targets`**: the ids, datums and axis labels as written.
 * - **`constrains`**: the bound names (`let`s, parameters, `for` variables, user functions) the
 *   keep can be moved by. The targets' positions, following each target's `on`, `hostWallId` (a
 *   derived wall's own row included), `axes` and `params` edges of the storey's depends rows
 *   transitively; the `place … at`/arguments of every instance a target sits in; the axis
 *   expressions of an axis it names; the names the keep's own value (`<mm>`, a `stacked` level)
 *   reads; the conditions (`if`, `for`, `while`) around the keep, around each statement the
 *   closure reaches and around each `place` on its instance path, since a `--set` of one of those
 *   can add, remove or re-place a target; and then every name those read through a `let`
 *   chain (`let W = W0 + 50` adds `W0`). Sorted. **`locked: true`** when that set is empty.
 *   Read per element, not per edge (a room sized by `W` constrains every keep on it), and only
 *   through the edges the depends rows record: a position found by search (`flush`) is not one.
 * - **`equations`** (`align`, `equal`: targets − 1; `offset`, `on axis`, `fixed`: 1; `stacked`:
 *   4 × (levels − 1)) and **`bounds`** (`min clear`: 1).
 * - **`implied`**, **`redundant`**, **`conflicts`**: every equality is a difference constraint
 *   `v(x) − v(y) = c` between datum nodes in half-lattice units (the keeps' own scale), entered
 *   into one weighted union-find over the plan. The source's **implications** go in first,
 *   each a relation that holds for every value of every name and survives grid snapping (R5):
 *   a relational room's placement edge (`right-of a gap g` gives `b.left − a.right = g`) and its
 *   leading cross-axis edge (default or `align top|left`); a trailing one (`align bottom|right`),
 *   and the placement edge of `left-of`/`above`, only when the room's own size on that axis is
 *   a literal too (the room's corner is snapped before its size is added); and a straight wall
 *   segment whose two points both write the same edge datum plus the same literal on the line's
 *   coordinate (`(a.right, 0) (a.right, 5000)`). Every literal in it must be a multiple of the
 *   plan's `grid` (an integer when there is none) and on the 0.001 mm lattice, the datum an edge,
 *   never a centre, and the room or wall written with `id=` (an assigned id names nothing a
 *   keep can name, and two of them would share a node). Only statements that always expand are
 *   read: the storey's body and its `zone`s, never a loop, a branch or a component. Then the
 *   keeps, in the order `describe().keeps` lists them; an equality whose value reads a name, or
 *   is off the lattice, is not entered (its `c` is not fixed). An equality whose ends are already
 *   joined with the same `c` is **implied** (`by`: the statements on the spanning-forest path
 *   between them); a keep whose every equality is implied is **redundant**, or
 *   **`redundant_by_weaker`** when a keep on a path is of a weaker grade than it (a hard keep is
 *   never called redundant by an advisory one); one joined with a `c` that differs by more than one
 *   lattice unit **conflicts**, with the path it cannot hold together with and the gap. A
 *   difference of exactly one lattice unit (0.001 mm) is claimed neither way: the evaluator rounds
 *   a residual once, on the difference (R6 as amended), and a literal at a lattice tie can land
 *   either side of it. A `min clear` is redundant by an earlier one on the same room that demands
 *   at least as much, or a later one that demands more (by-weaker by the same grade rule). A
 *   `stacked` keep's nodes are its own (each storey's resolved footprint edge, which is not
 *   snapped the way a datum is), so it is implied only by another `stacked` keep.
 *
 * Per storey (R16): each `levels[]` entry's `depends.keeps` lists that storey's rows; the
 * top-level `depends.keeps` lists every row, `stacked` ones included (they span storeys, so they
 * sit on no one storey's list).
 *
 * Post-resolve and outside the evaluator: nothing is charged to the step meter (no expression
 * is evaluated; there is no meter outside a resolution). Bounded by counts: at most `MAX_KEEPS`
 * × `MAX_KEEP_TARGETS` equalities plus one or two implications per room and one per wall
 * segment, each target's node found by a map lookup; the union-find is near-linear; at most
 * {@link MAX_KEEP_PATHS} implied paths and as many conflict paths are walked (each a
 * breadth-first walk of one component's spanning forest), after which an implied entry has no
 * `by` and the row says `implied_truncated` (a redundant row then says `truncated` instead of
 * `by`), and a conflict is not listed and the row says `conflicts_truncated`; the closure for
 * `constrains` visits each element row once per keep, bounded by `MAX_ELEMENTS`, and each
 * binding once.
 */

import type { KeepGrade, KeepRef, PlanNode, Statement } from "../ast.js";
import type { Span } from "../diagnostics.js";
import type { Expr } from "../expr.js";
import type { ResolvedLevel, ResolvedPlan } from "../ir.js";
import { type KeepResult, keepHalfOf, keepRefsOf, mmNumber } from "../keep.js";
import { COMPASS_DATUM_ALIASES } from "../room-datums.js";
import { keepRefText } from "../statement-print.js";
import { type DependsFacts, exprNames } from "./depends.js";

/** Most implied paths, and most conflict paths, named in one plan's facts. */
export const MAX_KEEP_PATHS = 64;

/** A redundancy: the statements that make it so, or `truncated` past the path cap. */
export interface KeepRedundancy {
  by?: string[];
  truncated?: true;
}

/** One `depends.keeps[]` row. */
export interface KeepFact {
  /** The keep as `arch fmt` prints it, without `keep` and the grade. */
  keep: string;
  level?: number;
  targets: string[];
  constrains: string[];
  equations?: number;
  bounds?: number;
  locked?: true;
  /** Equalities of this keep already implied by what came before it; `by_weaker` when the path
   *  runs through a keep of a weaker grade. */
  implied?: { equation: string[]; by?: string[]; by_weaker?: true }[];
  implied_truncated?: true;
  redundant?: KeepRedundancy;
  /** Every equality implied, at least one through a keep of a weaker grade than this one. */
  redundant_by_weaker?: KeepRedundancy;
  /** Equalities that cannot hold together with what came before: `gap_mm` is this keep's value
   *  less the value the path implies. */
  conflicts?: { equation: string[]; with: string[]; axis: string; gap_mm: number }[];
  conflicts_truncated?: true;
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** How strong what states an equality is: a source statement holds for every value of every
 *  name, so it outranks every keep. */
const GRADE_RANK: Record<KeepGrade, number> = { advisory: 1, soft: 2, hard: 3 };
const SOURCE_RANK = 4;

/** A literal: a number, or a negated one. */
function literalOf(e: Expr | undefined): number | undefined {
  if (!e) return undefined;
  if (e.t === "num") return e.value;
  if (e.t === "unary" && e.op === "-" && e.e.t === "num") return -e.e.value;
  return undefined;
}

/** On the 0.001 mm lattice exactly (so it rounds to itself). */
const onLattice = (v: number): boolean => Number.isFinite(v) && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

/** A literal every snap leaves where it is: a multiple of the grid (an integer with no grid),
 *  on the lattice. */
const onGrid = (v: number | undefined, grid: number): v is number =>
  v !== undefined && onLattice(v) && (grid > 0 ? Number.isInteger(v / grid) : Number.isInteger(v));

const EDGE_AXIS: Record<string, "x" | "y"> = { left: "x", right: "x", top: "y", bottom: "y" };

/** `<room>.<edge>` (an edge word or its compass alias), `+`/`−` a literal, or neither. */
function datumPlus(e: Expr, grid: number): { room: string; word: string; c: number } | undefined {
  const bare = (x: Expr): { room: string; word: string } | undefined => {
    if (x.t !== "ref") return undefined;
    const dot = x.name.lastIndexOf(".");
    if (dot <= 0) return undefined;
    const raw = x.name.slice(dot + 1);
    const word = COMPASS_DATUM_ALIASES[raw] ?? raw;
    return EDGE_AXIS[word] ? { room: x.name.slice(0, dot), word } : undefined;
  };
  const d = bare(e);
  if (d) return { ...d, c: 0 };
  if (e.t !== "bin" || (e.op !== "+" && e.op !== "-")) return undefined;
  const l = bare(e.l);
  const rv = literalOf(e.r);
  if (l && onGrid(rv, grid)) return { ...l, c: e.op === "+" ? rv : -rv };
  const r = bare(e.r);
  const lv = literalOf(e.l);
  if (r && e.op === "+" && onGrid(lv, grid)) return { ...r, c: lv };
  return undefined;
}

/** One difference constraint `v(x) − v(y) = c`, with what it says, where it came from and how
 *  strong that is. */
interface Equation {
  x: string;
  y: string;
  c: number;
  label: string;
  rank: number;
}

/** A weighted union-find over named nodes, with the spanning forest of the edges that joined. */
class Potentials {
  private parent = new Map<string, string>();
  /** v(node) − v(parent). */
  private pot = new Map<string, number>();
  private adj = new Map<string, { to: string; label: string; rank: number }[]>();

  private find(x: string): { root: string; p: number } {
    // Walk up, then compress: every node on the path points at the root with its potential.
    const path: string[] = [];
    let cur = x;
    while (this.parent.has(cur) && this.parent.get(cur) !== cur) {
      path.push(cur);
      cur = this.parent.get(cur)!;
    }
    const root = cur;
    let acc = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i]!;
      acc += this.pot.get(n)!;
      this.parent.set(n, root);
      this.pot.set(n, acc);
    }
    return { root, p: path.length > 0 ? this.pot.get(x)! : 0 };
  }

  /** Enter `v(x) − v(y) = c`: `joined` when it joined two components, else the value the
   *  forest already gives `v(x) − v(y)`. */
  enter(e: Equation): { joined: true } | { joined: false; implied: number } {
    const fx = this.find(e.x);
    const fy = this.find(e.y);
    if (fx.root === fy.root) return { joined: false, implied: fx.p - fy.p };
    this.parent.set(fx.root, fy.root);
    this.pot.set(fx.root, e.c - fx.p + fy.p);
    const link = (a: string, b: string): void => {
      const list = this.adj.get(a) ?? [];
      list.push({ to: b, label: e.label, rank: e.rank });
      this.adj.set(a, list);
    };
    link(e.x, e.y);
    link(e.y, e.x);
    return { joined: true };
  }

  /** The labels on the forest path from `a` to `b` (they are joined), in path order, once each,
   *  and the weakest rank among them. */
  path(a: string, b: string): { labels: string[]; rank: number } {
    const back = new Map<string, { from: string; label: string; rank: number }>();
    const queue = [a];
    const seen = new Set([a]);
    for (let i = 0; i < queue.length && !seen.has(b); i++) {
      const n = queue[i]!;
      for (const { to, label, rank } of this.adj.get(n) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        back.set(to, { from: n, label, rank });
        queue.push(to);
      }
    }
    const labels: string[] = [];
    let rank = SOURCE_RANK;
    for (let cur = b; cur !== a; ) {
      const step = back.get(cur);
      if (!step) break;
      labels.push(step.label);
      rank = Math.min(rank, step.rank);
      cur = step.from;
    }
    return { labels: [...new Set(labels.reverse())], rank };
  }
}

/** A storey: its level (undefined on a single-storey plan), its IR, its body as it expands. */
interface Storey {
  level: number | undefined;
  ir: ResolvedPlan;
  body: Statement[];
  facts: DependsFacts | undefined;
}

/** The statements of a body that always expand: the body and its `zone`s (never a loop, a
 *  branch, a level or a component). */
function alwaysExpands(body: readonly Statement[], out: Statement[]): void {
  for (const s of body) {
    if (s.kind === "zone") alwaysExpands(s.body, out);
    else if (s.kind !== "level") out.push(s);
  }
}

/** The source's implications on one storey (see the module header). */
function implicationsOf(st: Storey, grid: number): Equation[] {
  const lv = st.level ?? "";
  const node = (room: string, word: string): string => `${lv}|${room}.${word}`;
  const lit = (e: Expr | undefined): number | undefined => {
    const v = e === undefined ? 0 : literalOf(e);
    return onGrid(v, grid) ? v : undefined;
  };
  const out: Equation[] = [];
  const push = (x: string, y: string, c: number, label: string): void => {
    out.push({ x, y, c, label, rank: SOURCE_RANK });
  };
  const walls = new Map(st.ir.walls.filter((w) => !w._derived).map((w) => [w.id, w]));
  for (const s of st.body) {
    // A room or wall with no `id=` has an assigned id no keep can name: it implies nothing a
    // keep reads, and two of them must never share a node.
    if (!s.id) continue;
    if (s.kind === "room" && s.rel && s.size && s.rel.ref) {
      const { dir, ref, align } = s.rel;
      const phrase = `room ${s.id} ${dir} ${ref}`;
      const gap = lit(s.rel.gap);
      const w = lit(s.size.w);
      const h = lit(s.size.h);
      // The placement edge.
      if (gap !== undefined) {
        const H = keepHalfOf(gap);
        if (dir === "right-of") push(node(s.id, "left"), node(ref, "right"), H, phrase);
        else if (dir === "below") push(node(s.id, "top"), node(ref, "bottom"), H, phrase);
        else if (dir === "left-of" && w !== undefined) push(node(ref, "left"), node(s.id, "right"), H, phrase);
        else if (dir === "above" && h !== undefined) push(node(ref, "top"), node(s.id, "bottom"), H, phrase);
      }
      // The cross-axis edge: the leading one by default.
      const across = dir === "right-of" || dir === "left-of";
      const word = align ?? (across ? "top" : "left");
      const label = align ? `${phrase} align ${align}` : phrase;
      if (word === "top" || word === "left") push(node(s.id, word), node(ref, word), 0, label);
      else if (word === "bottom" && h !== undefined) push(node(s.id, "bottom"), node(ref, "bottom"), 0, label);
      else if (word === "right" && w !== undefined) push(node(s.id, "right"), node(ref, "right"), 0, label);
    } else if (s.kind === "wall" && s.points.length >= 2 && !s.relation) {
      const rw = walls.get(s.id);
      // The resolved wall must have the points as written (so segment k is points k, k+1).
      if (!rw || rw.points.length !== s.points.length) continue;
      const n = s.points.length;
      const segs = s.closed && n > 2 ? n : n - 1;
      for (let k = 0; k < segs; k++) {
        if (s.arcs?.[k]) continue;
        const a = s.points[k]!;
        const b = s.points[(k + 1) % n]!;
        for (const coord of ["x", "y"] as const) {
          const da = datumPlus(a[coord], grid);
          const db = datumPlus(b[coord], grid);
          if (!da || !db || da.room !== db.room || da.word !== db.word || da.c !== db.c) continue;
          if (EDGE_AXIS[da.word] !== coord) continue;
          const plus = da.c === 0 ? "" : da.c > 0 ? ` + ${String(da.c)}` : ` - ${String(-da.c)}`;
          push(
            `${lv}|${s.id}#${k}`,
            node(da.room, da.word),
            keepHalfOf(da.c),
            `wall ${s.id} at ${da.room}.${da.word}${plus}`,
          );
        }
      }
    }
  }
  return out;
}

/** The names an expression list reads. */
const namesIn = (exprs: readonly (Expr | undefined)[]): Set<string> =>
  exprNames(exprs.filter((e): e is Expr => e !== undefined));

/** A statement's key: its file and byte span, as resolved elements carry them. */
const spanKey = (span: Span | undefined, file: string | undefined): string | undefined =>
  span ? `${file ?? ""}|${span.start}:${span.end}` : undefined;

/** What the plan's statements read beyond their own expressions, gathered in one walk of the
 *  root body and every component body:
 *  - `conditions`: per statement, the names its enclosing `if`, `for` and `while` read;
 *  - `places`: per instance path, what its `place` reads (its `at`, its arguments and the
 *    conditions around it), which every element inside moves with or reads;
 *  - `bindings`: per bound name, the names its `let`s, reassignments and `for` ranges read. */
function sourceReads(plan: PlanNode): {
  conditions: Map<string, ReadonlySet<string>>;
  places: Map<string, Set<string>>;
  bindings: Map<string, Set<string>>;
} {
  const conditions = new Map<string, ReadonlySet<string>>();
  const places = new Map<string, Set<string>>();
  const bindings = new Map<string, Set<string>>();
  const bind = (name: string, reads: Set<string>): void => {
    const b = bindings.get(name) ?? new Set<string>();
    for (const r of reads) if (r !== name) b.add(r);
    bindings.set(name, b);
  };
  const walk = (
    body: readonly Statement[],
    file: string | undefined,
    conds: ReadonlySet<string>,
    prefix: string | undefined,
    stack: ReadonlySet<string>,
  ): void => {
    for (const s of body) {
      const k = spanKey(s.span, file);
      if (k && conds.size > 0) conditions.set(k, conds);
      const more = (exprs: Expr[]): ReadonlySet<string> => new Set([...conds, ...namesIn(exprs)]);
      switch (s.kind) {
        case "let":
        case "assign":
          bind(s.name, namesIn([s.value]));
          break;
        case "for":
          bind(s.varName, namesIn([s.iter]));
          walk(s.body, file, more([s.iter]), prefix, stack);
          break;
        case "while":
          walk(s.body, file, more([s.cond]), prefix, stack);
          break;
        case "if": {
          const inner = more([s.cond]);
          walk(s.then, file, inner, prefix, stack);
          if (s.else) walk(s.else, file, inner, prefix, stack);
          break;
        }
        case "level":
        case "zone":
          walk(s.body, file, conds, prefix, stack);
          break;
        case "place": {
          if (prefix === undefined) break;
          const path = prefix ? `${prefix}.${s.alias}` : s.alias;
          places.set(path, new Set([...conds, ...namesIn([s.at.x, s.at.y, ...s.args])]));
          const def = plan.components.get(s.name);
          if (def && !stack.has(s.name)) walk(def.body, def.file, new Set(), path, new Set([...stack, s.name]));
          break;
        }
      }
    }
  };
  walk(plan.body, undefined, new Set(), "", new Set());
  // Every component body once more for its own conditions and bindings (an element of a bare
  // call or a nested scope is reached here); places were followed from the root above.
  const seen = new Set<unknown>();
  const comps = (m: ReadonlyMap<string, import("../ast.js").ComponentDef> | undefined): void => {
    for (const c of m?.values() ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      walk(c.body, c.file, new Set(), undefined, new Set());
      comps(c.scope);
    }
  };
  comps(plan.components);
  return { conditions, places, bindings };
}

/**
 * The `depends.keeps[]` rows of a plan: one per accepted keep, in `describe().keeps` order.
 * `storeyFacts` gives each storey's `depends` rows (the lowest storey's for a single-storey
 * plan), read for the `constrains` closure.
 */
export function keepFacts(
  plan: PlanNode,
  ir: ResolvedPlan,
  levels: readonly ResolvedLevel[],
  keeps: readonly KeepResult[],
  storeyFacts: (level: number | undefined) => DependsFacts | undefined,
): KeepFact[] {
  const grid = plan.grid;
  const shared: Statement[] = [];
  alwaysExpands(plan.body, shared);
  const storeys: Storey[] =
    levels.length === 0
      ? [{ level: undefined, ir, body: shared, facts: storeyFacts(undefined) }]
      : levels.map((l) => {
          const body = [...shared];
          for (const s of plan.body) if (s.kind === "level" && s.level === l.level) alwaysExpands(s.body, body);
          return { level: l.level, ir: l.ir, body, facts: storeyFacts(l.level) };
        });
  const storeyByLevel = new Map(storeys.map((s) => [String(s.level ?? ""), s]));
  const storeyOf = (level: number | undefined): Storey | undefined =>
    storeyByLevel.get(String(level ?? "")) ?? (level === undefined ? storeys[0] : undefined);

  // `constrains`: the closure over one storey's depends rows, then the binding chains.
  const { conditions, places, bindings } = sourceReads(plan);
  const axisNames = { x: namesIn(plan.axes?.x ?? []), y: namesIn(plan.axes?.y ?? []) };
  const axisLabels = new Map((storeys[0]?.ir.axes ?? []).map((a) => [a.label, a.axis]));
  const axisNamesOf = (label: string): ReadonlySet<string> => axisNames[axisLabels.get(label) ?? "x"];
  const withChains = (names: Set<string>): Set<string> => {
    const queue = [...names];
    for (let i = 0; i < queue.length; i++)
      for (const n of bindings.get(queue[i]!) ?? [])
        if (!names.has(n)) {
          names.add(n);
          queue.push(n);
        }
    return names;
  };
  interface StoreyIndex {
    closure: (ids: readonly string[]) => Set<string>;
    walls: ReadonlySet<string>;
    others: ReadonlySet<string>;
  }
  const indexes = new Map<Storey, StoreyIndex>();
  const indexOn = (st: Storey): StoreyIndex => {
    const memo = indexes.get(st);
    if (memo) return memo;
    const rows = new Map((st.facts?.elements ?? []).map((r) => [r.id, r]));
    const derived = new Map((st.facts?.derived_walls ?? []).map((r) => [r.name, r]));
    const instanceOf = new Map<string, string>();
    const keyOf = new Map<string, string>();
    const others = new Set<string>();
    for (const e of st.ir.elements) {
      if (e._instance !== undefined && !instanceOf.has(e.id)) instanceOf.set(e.id, e._instance);
      const k = spanKey(e.span, e._file);
      if (k && !keyOf.has(e.id)) keyOf.set(e.id, k);
      if (e.kind !== "wall") others.add(e.id);
    }
    const walls = new Set<string>();
    for (const w of st.ir.walls) {
      walls.add(w.id);
      if (w._instance !== undefined && !instanceOf.has(w.id)) instanceOf.set(w.id, w._instance);
      const k = spanKey(w.span, w._file);
      if (k && !keyOf.has(w.id)) keyOf.set(w.id, k);
    }
    const closure = (ids: readonly string[]): Set<string> => {
      const names = new Set<string>();
      const seen = new Set<string>();
      const queue = [...ids];
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i]!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (let p = instanceOf.get(id); p; p = p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : undefined)
          for (const n of places.get(p) ?? []) names.add(n);
        const k = keyOf.get(id);
        for (const n of (k && conditions.get(k)) || []) names.add(n);
        const row = rows.get(id);
        const drow = derived.get(id);
        for (const n of row?.params ?? drow?.params ?? []) names.add(n);
        for (const a of row?.axes ?? []) for (const n of axisNamesOf(a)) names.add(n);
        queue.push(...(row?.on ?? drow?.on ?? []));
        if (row?.hostWallId !== undefined) queue.push(row.hostWallId);
      }
      return names;
    };
    const ix = { closure, walls, others };
    indexes.set(st, ix);
    return ix;
  };

  const rows: KeepFact[] = [];
  const pot = new Potentials();
  for (const st of storeys) for (const e of implicationsOf(st, grid)) pot.enter(e);
  let impliedPaths = 0;
  let conflictPaths = 0;
  /** `min clear` demands seen, per storey and room: the value, the keep that said it, its rank. */
  const clears = new Map<string, { h: number; label: string; rank: number; row: KeepFact }[]>();

  for (const r of keeps) {
    const node = r.node;
    const lv = r.level ?? "";
    const label = `keep ${r.keep}`;
    const rank = GRADE_RANK[r.grade];
    const refs = keepRefsOf(node);
    const st = storeyOf(r.level);
    // constrains
    const names = new Set<string>();
    const valueExprs: Expr[] =
      node.form === "offset" || node.form === "min-clear" || node.form === "fixed"
        ? [node.mm]
        : node.form === "stacked"
          ? node.levels
          : [];
    const valueNames = namesIn(valueExprs);
    for (const n of valueNames) names.add(n);
    for (const n of conditions.get(spanKey(node.span, undefined) ?? "") ?? []) names.add(n);
    const idsOf = (ref: KeepRef): string[] => (ref.t === "room" ? [ref.room] : ref.t === "el" ? [ref.id] : []);
    for (const ref of refs) if (ref.t === "axis") for (const n of axisNamesOf(ref.label)) names.add(n);
    const targetIds = refs.flatMap(idsOf);
    const onStoreys = node.form === "stacked" ? (r.levels ?? []).map((l) => storeyOf(l)) : [st];
    for (const s of onStoreys) if (s) for (const n of indexOn(s).closure(targetIds)) names.add(n);
    const constrains = sorted(withChains(names));

    // the equalities
    const vertical = r.vertical;
    const axisWord = vertical === undefined ? "x" : vertical ? "x" : "y";
    const ix = st ? indexOn(st) : undefined;
    const lineNode = (ref: KeepRef): string => {
      if (ref.t === "axis") return `axis|${ref.label}`;
      if (ref.t === "room") return `${lv}|${ref.room}.${COMPASS_DATUM_ALIASES[ref.word] ?? ref.word}`;
      const isWall = ix?.walls.has(ref.id) === true && !ix.others.has(ref.id);
      return isWall ? `${lv}|${ref.id}#${ref.segment ?? 0}` : `${lv}|${ref.id}@${axisWord}`;
    };
    const equations: { eq: Equation; text: string[]; axis: string }[] = [];
    let entered = true;
    let bounds: number | undefined;
    const literalValue = valueNames.size === 0 && r.value !== undefined && onLattice(r.value);
    const eq = (x: string, y: string, c: number): Equation => ({ x, y, c, label, rank });
    switch (node.form) {
      case "align":
      case "on-axis": {
        const [first, ...rest] = node.form === "align" ? node.refs : [node.axis, node.wall];
        for (const t of rest)
          equations.push({
            eq: eq(lineNode(t), lineNode(first!), 0),
            text: [keepRefText(first!), keepRefText(t)],
            axis: axisWord,
          });
        break;
      }
      case "equal": {
        const [first, ...rest] = node.refs;
        const len = (t: KeepRef): string => `${lv}|${node.measure} ${keepRefText(t)}`;
        for (const t of rest)
          equations.push({
            eq: eq(len(t), len(first!), 0),
            text: [keepRefText(first!), keepRefText(t)],
            axis: node.measure,
          });
        break;
      }
      case "offset":
        if (literalValue)
          equations.push({
            eq: eq(lineNode(node.x), lineNode(node.from), keepHalfOf(r.value!)),
            text: [keepRefText(node.x), keepRefText(node.from)],
            axis: axisWord,
          });
        else entered = false;
        break;
      case "fixed":
        if (literalValue)
          equations.push({
            eq: eq(lineNode(node.datum), `origin|${axisWord}`, keepHalfOf(r.value!)),
            text: [keepRefText(node.datum)],
            axis: axisWord,
          });
        else entered = false;
        break;
      case "stacked": {
        const ls = r.levels ?? [];
        const id = keepRefText(node.target);
        for (const l of ls.slice(1))
          for (const edge of ["left", "top", "right", "bottom"] as const)
            equations.push({
              eq: eq(`stack|${l}|${id}.${edge}`, `stack|${ls[0]}|${id}.${edge}`, 0),
              text: [`${id}.${edge} on level ${ls[0]}`, `${id}.${edge} on level ${l}`],
              axis: EDGE_AXIS[edge]!,
            });
        break;
      }
      case "min-clear":
        bounds = 1;
        break;
    }
    const count =
      node.form === "align" || node.form === "equal"
        ? node.refs.length - 1
        : node.form === "stacked"
          ? 4 * Math.max(0, (r.levels?.length ?? 0) - 1)
          : node.form === "min-clear"
            ? 0
            : 1;

    const row: KeepFact = {
      keep: r.keep,
      ...(r.level !== undefined ? { level: r.level } : {}),
      targets: r.targets,
      constrains,
      ...(count > 0 ? { equations: count } : {}),
      ...(bounds !== undefined ? { bounds } : {}),
      ...(constrains.length === 0 ? { locked: true as const } : {}),
    };
    const implied: NonNullable<KeepFact["implied"]> = [];
    const conflicts: NonNullable<KeepFact["conflicts"]> = [];
    const by: string[] = [];
    let weaker = false;
    let truncated = false;
    let undecided = 0;
    for (const { eq: e, text, axis } of equations) {
      const got = pot.enter(e);
      if (got.joined) continue;
      const gap = e.c - got.implied;
      if (gap === 0) {
        if (impliedPaths < MAX_KEEP_PATHS) {
          impliedPaths++;
          const path = pot.path(e.y, e.x);
          const byWeaker = path.rank < rank;
          weaker ||= byWeaker;
          by.push(...path.labels);
          implied.push({ equation: text, by: path.labels, ...(byWeaker ? { by_weaker: true as const } : {}) });
        } else {
          implied.push({ equation: text });
          row.implied_truncated = true;
          truncated = true;
        }
      } else if (Math.abs(gap) <= 2) {
        // One lattice unit (2 half-units): a literal at a tie can round either way; say nothing.
        undecided++;
      } else if (conflictPaths < MAX_KEEP_PATHS) {
        conflictPaths++;
        conflicts.push({ equation: text, with: pot.path(e.y, e.x).labels, axis, gap_mm: mmNumber(gap) });
      } else row.conflicts_truncated = true;
    }
    if (implied.length > 0) row.implied = implied;
    if (entered && undecided === 0 && equations.length > 0 && implied.length === equations.length) {
      const why: KeepRedundancy = truncated ? { truncated: true } : { by: [...new Set(by)] };
      if (weaker) row.redundant_by_weaker = why;
      else row.redundant = why;
    }
    if (conflicts.length > 0) row.conflicts = conflicts;
    // `min clear`: redundant by another on the same room that demands at least as much.
    if (node.form === "min-clear" && literalValue) {
      const h = keepHalfOf(r.value!);
      const key = `${lv}|${keepRefText(node.room)}`;
      const list = clears.get(key) ?? [];
      const stronger = list.find((x) => x.h >= h);
      if (stronger) {
        if (stronger.rank >= rank) row.redundant = { by: [stronger.label] };
        else row.redundant_by_weaker = { by: [stronger.label] };
      }
      for (const x of list)
        if (h > x.h && !x.row.redundant && !x.row.redundant_by_weaker) {
          if (rank >= x.rank) x.row.redundant = { by: [label] };
          else x.row.redundant_by_weaker = { by: [label] };
        }
      list.push({ h, label, rank, row });
      clears.set(key, list);
    }
    rows.push(row);
  }
  return rows.map(ordered);
}

/** A row in the design's key order (`redundant` may have been set after `conflicts`). */
function ordered(r: KeepFact): KeepFact {
  const {
    keep,
    level,
    targets,
    constrains,
    equations,
    bounds,
    locked,
    implied,
    implied_truncated,
    redundant,
    redundant_by_weaker,
    conflicts,
    conflicts_truncated,
  } = r;
  return {
    keep,
    ...(level !== undefined ? { level } : {}),
    targets,
    constrains,
    ...(equations !== undefined ? { equations } : {}),
    ...(bounds !== undefined ? { bounds } : {}),
    ...(locked ? { locked } : {}),
    ...(implied ? { implied } : {}),
    ...(implied_truncated ? { implied_truncated } : {}),
    ...(redundant ? { redundant } : {}),
    ...(redundant_by_weaker ? { redundant_by_weaker } : {}),
    ...(conflicts ? { conflicts } : {}),
    ...(conflicts_truncated ? { conflicts_truncated } : {}),
  };
}
