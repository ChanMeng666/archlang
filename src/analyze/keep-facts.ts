/**
 * `describe --facts depends` for keeps (ADR 0033; plan-soundness PS4.3b, design §5, R5, R16):
 * `depends.keeps[]`, one row per accepted keep, read from the declarations alone.
 *
 * - **`targets`**: the ids, datums and axis labels as written.
 * - **`constrains`**: the bound names (`let`s, parameters, `for` variables, user functions) the
 *   targets' positions read, following each target's `on`, `hostWallId` (a derived wall's own
 *   row included), `axes` and `params` edges of the storey's depends rows transitively, the
 *   `place … at`/arguments of every instance a target sits in, and the axis expressions of an
 *   axis it names; plus the names the keep's own value (`<mm>`, a `stacked` level) reads, since
 *   a `--set` of one of those moves its residual too. Sorted. **`locked: true`** when that set is
 *   empty: no `--set` can break the keep, only an edit of a literal.
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
 *   plan's `grid` (an integer when there is none), and the datum an edge, never a centre. Only
 *   statements that always expand are read: the storey's body and its `zone`s, never a loop,
 *   a branch or a component. Then the keeps, in the order `describe().keeps` lists them; an
 *   equality whose value reads a name is not entered (its `c` is not fixed). An equality whose
 *   ends are already joined with the same `c` is **implied** (`by`: the statements on the
 *   spanning-forest path between them); a keep whose every equality is implied is
 *   **redundant**; one joined with a different `c` **conflicts**, with the path it cannot hold
 *   together with and the gap. A `min clear` is redundant by an earlier one on the same room
 *   that demands at least as much, or a later one that demands more. A `stacked` keep's nodes
 *   are its own (each storey's resolved footprint edge, which is not snapped the way a datum
 *   is), so it is implied only by another `stacked` keep.
 *
 * Per storey (R16): each `levels[]` entry's `depends.keeps` lists that storey's rows; the
 * top-level `depends.keeps` lists every row, `stacked` ones included (they span storeys, so they
 * sit on no one storey's list).
 *
 * Post-resolve and outside the evaluator: nothing is charged to the step meter (no expression
 * is evaluated; there is no meter outside a resolution). Bounded by counts: at most `MAX_KEEPS`
 * × `MAX_KEEP_TARGETS` equalities plus one or two implications per room and one per wall
 * segment; the union-find is near-linear; at most {@link MAX_KEEP_PATHS} implied paths and as many
 * conflict paths are walked (each a breadth-first walk of one component's spanning forest),
 * after which a row says `implied_truncated` / `conflicts_truncated`; the closure for
 * `constrains` visits each element row once per keep, bounded by `MAX_ELEMENTS`.
 */

import type { Expr } from "../expr.js";
import type { KeepRef, PlanNode, Statement } from "../ast.js";
import type { ResolvedLevel, ResolvedPlan } from "../ir.js";
import { type KeepResult, keepHalfOf, keepRefsOf, mmNumber } from "../keep.js";
import { COMPASS_DATUM_ALIASES } from "../room-datums.js";
import { keepRefText } from "../statement-print.js";
import { type DependsFacts, exprNames } from "./depends.js";

/** Most implied paths, and most conflict paths, named in one plan's facts. */
export const MAX_KEEP_PATHS = 64;

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
  /** Equalities of this keep already implied by what came before it. */
  implied?: { equation: string[]; by?: string[] }[];
  implied_truncated?: true;
  redundant?: { by: string[] };
  /** Equalities that cannot hold together with what came before: `gap_mm` is this keep's value
   *  less the value the path implies. */
  conflicts?: { equation: string[]; with: string[]; axis: string; gap_mm: number }[];
  conflicts_truncated?: true;
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** A literal: a number, or a negated one. */
function literalOf(e: Expr | undefined): number | undefined {
  if (!e) return undefined;
  if (e.t === "num") return e.value;
  if (e.t === "unary" && e.op === "-" && e.e.t === "num") return -e.e.value;
  return undefined;
}

/** A literal every snap leaves where it is: a multiple of the grid (an integer with no grid). */
const onGrid = (v: number | undefined, grid: number): v is number =>
  v !== undefined && Number.isFinite(v) && (grid > 0 ? Number.isInteger(v / grid) : Number.isInteger(v));

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

/** One difference constraint `v(x) − v(y) = c`, with what it says and where it came from. */
interface Equation {
  x: string;
  y: string;
  c: number;
  label: string;
}

/** A weighted union-find over named nodes, with the spanning forest of the edges that joined. */
class Potentials {
  private parent = new Map<string, string>();
  /** v(node) − v(parent). */
  private pot = new Map<string, number>();
  private adj = new Map<string, { to: string; label: string }[]>();

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
      list.push({ to: b, label: e.label });
      this.adj.set(a, list);
    };
    link(e.x, e.y);
    link(e.y, e.x);
    return { joined: true };
  }

  /** The labels on the forest path from `a` to `b` (they are joined), in path order, once each. */
  path(a: string, b: string): string[] {
    const back = new Map<string, { from: string; label: string }>();
    const queue = [a];
    const seen = new Set([a]);
    for (let i = 0; i < queue.length && !seen.has(b); i++) {
      const n = queue[i]!;
      for (const { to, label } of this.adj.get(n) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        back.set(to, { from: n, label });
        queue.push(to);
      }
    }
    const labels: string[] = [];
    for (let cur = b; cur !== a; ) {
      const step = back.get(cur);
      if (!step) break;
      labels.push(step.label);
      cur = step.from;
    }
    return [...new Set(labels.reverse())];
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
  const walls = new Map(st.ir.walls.filter((w) => !w._derived).map((w) => [w.id, w]));
  for (const s of st.body) {
    if (s.kind === "room" && s.rel && s.size) {
      const { dir, ref, align } = s.rel;
      const phrase = `room ${s.id} ${dir} ${ref}`;
      const gap = lit(s.rel.gap);
      const w = lit(s.size.w);
      const h = lit(s.size.h);
      const H = halfOfOr(gap);
      // The placement edge.
      if (gap !== undefined) {
        if (dir === "right-of") out.push({ x: node(s.id, "left"), y: node(ref, "right"), c: H!, label: phrase });
        else if (dir === "below") out.push({ x: node(s.id, "top"), y: node(ref, "bottom"), c: H!, label: phrase });
        else if (dir === "left-of" && w !== undefined)
          out.push({ x: node(ref, "left"), y: node(s.id, "right"), c: H!, label: phrase });
        else if (dir === "above" && h !== undefined)
          out.push({ x: node(ref, "top"), y: node(s.id, "bottom"), c: H!, label: phrase });
      }
      // The cross-axis edge: the leading one by default.
      const across = dir === "right-of" || dir === "left-of";
      const word = align ?? (across ? "top" : "left");
      const label = align ? `${phrase} align ${align}` : phrase;
      if (word === "top" || word === "left") out.push({ x: node(s.id, word), y: node(ref, word), c: 0, label });
      else if (word === "bottom" && h !== undefined)
        out.push({ x: node(s.id, "bottom"), y: node(ref, "bottom"), c: 0, label });
      else if (word === "right" && w !== undefined)
        out.push({ x: node(s.id, "right"), y: node(ref, "right"), c: 0, label });
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
          out.push({
            x: `${lv}|${s.id}#${k}`,
            y: node(da.room, da.word),
            c: keepHalfOf(da.c),
            label: `wall ${s.id} at ${da.room}.${da.word}${plus}`,
          });
        }
      }
    }
  }
  return out;
}

const halfOfOr = (v: number | undefined): number | undefined => (v === undefined ? undefined : keepHalfOf(v));

/** The names an expression list reads. */
const namesIn = (exprs: readonly (Expr | undefined)[]): Set<string> =>
  exprNames(exprs.filter((e): e is Expr => e !== undefined));

/** What each instance path's `place` reads: its `at` and its arguments (the elements inside
 *  move with the one, and read the other). Walked once per path; a component already on the
 *  path is not re-entered. */
function placeReads(plan: PlanNode): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (body: readonly Statement[], prefix: string, stack: ReadonlySet<string>): void => {
    for (const s of body) {
      if (s.kind === "place") {
        const path = prefix ? `${prefix}.${s.alias}` : s.alias;
        out.set(path, namesIn([s.at.x, s.at.y, ...s.args]));
        const def = plan.components.get(s.name);
        if (def && !stack.has(s.name)) walk(def.body, path, new Set([...stack, s.name]));
      } else if (s.kind === "for" || s.kind === "while" || s.kind === "zone" || s.kind === "level") {
        walk(s.body, prefix, stack);
      } else if (s.kind === "if") {
        walk(s.then, prefix, stack);
        if (s.else) walk(s.else, prefix, stack);
      }
    }
  };
  walk(plan.body, "", new Set());
  return out;
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
  const storeyOf = (level: number | undefined): Storey | undefined =>
    storeys.find((s) => s.level === level) ?? (level === undefined ? storeys[0] : undefined);

  // `constrains`: the closure over one storey's depends rows.
  const places = placeReads(plan);
  const axisNames = { x: namesIn(plan.axes?.x ?? []), y: namesIn(plan.axes?.y ?? []) };
  const axisOf = (label: string): "x" | "y" | undefined => storeys[0]?.ir.axes?.find((a) => a.label === label)?.axis;
  const closure = new Map<string, (ids: readonly string[]) => Set<string>>();
  const closureOn = (st: Storey): ((ids: readonly string[]) => Set<string>) => {
    const k = String(st.level ?? "");
    let fn = closure.get(k);
    if (fn) return fn;
    const rows = new Map((st.facts?.elements ?? []).map((r) => [r.id, r]));
    const derived = new Map((st.facts?.derived_walls ?? []).map((r) => [r.name, r]));
    const instanceOf = new Map<string, string>();
    for (const e of st.ir.elements) if (e._instance !== undefined) instanceOf.set(e.id, e._instance);
    for (const w of st.ir.walls)
      if (w._instance !== undefined && !instanceOf.has(w.id)) instanceOf.set(w.id, w._instance);
    fn = (ids) => {
      const names = new Set<string>();
      const seen = new Set<string>();
      const queue = [...ids];
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i]!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (let p = instanceOf.get(id); p; p = p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : undefined)
          for (const n of places.get(p) ?? []) names.add(n);
        const row = rows.get(id);
        const drow = derived.get(id);
        for (const n of row?.params ?? drow?.params ?? []) names.add(n);
        for (const a of row?.axes ?? []) for (const n of axisNames[axisOf(a) ?? "x"]) names.add(n);
        queue.push(...(row?.on ?? drow?.on ?? []));
        if (row?.hostWallId !== undefined) queue.push(row.hostWallId);
      }
      return names;
    };
    closure.set(k, fn);
    return fn;
  };

  const rows: KeepFact[] = [];
  const pot = new Potentials();
  for (const st of storeys) for (const e of implicationsOf(st, grid)) pot.enter(e);
  let impliedPaths = 0;
  let conflictPaths = 0;
  /** `min clear` demands seen, per storey and room: the value and the keep that said it. */
  const clears = new Map<string, { h: number; label: string; row: KeepFact }[]>();

  for (const r of keeps) {
    const node = r.node;
    const lv = r.level ?? "";
    const label = `keep ${r.keep}`;
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
    const idsOf = (ref: KeepRef): string[] => (ref.t === "room" ? [ref.room] : ref.t === "el" ? [ref.id] : []);
    for (const ref of refs) {
      if (ref.t === "axis") for (const n of axisNames[axisOf(ref.label) ?? "x"]) names.add(n);
    }
    const targetIds = refs.flatMap(idsOf);
    const onStoreys = node.form === "stacked" ? (r.levels ?? []).map((l) => storeyOf(l)) : [st];
    for (const s of onStoreys) if (s) for (const n of closureOn(s)(targetIds)) names.add(n);
    const constrains = sorted(names);

    // the equalities
    const vertical = r.vertical;
    const axisWord = vertical === undefined ? "x" : vertical ? "x" : "y";
    const lineNode = (ref: KeepRef): string => {
      if (ref.t === "axis") return `axis|${ref.label}`;
      if (ref.t === "room") return `${lv}|${ref.room}.${COMPASS_DATUM_ALIASES[ref.word] ?? ref.word}`;
      const isWall =
        st?.ir.walls.some((w) => w.id === ref.id) && !st.ir.elements.some((e) => e.id === ref.id && e.kind !== "wall");
      return isWall ? `${lv}|${ref.id}#${ref.segment ?? 0}` : `${lv}|${ref.id}@${axisWord}`;
    };
    const equations: { eq: Equation; text: string[]; axis: string }[] = [];
    let entered = true;
    let bounds: number | undefined;
    const literalValue = valueNames.size === 0 && r.valueH !== undefined;
    switch (node.form) {
      case "align":
      case "on-axis": {
        const [first, ...rest] = node.form === "align" ? node.refs : [node.axis, node.wall];
        for (const t of rest)
          equations.push({
            eq: { x: lineNode(t), y: lineNode(first!), c: 0, label },
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
            eq: { x: len(t), y: len(first!), c: 0, label },
            text: [keepRefText(first!), keepRefText(t)],
            axis: node.measure,
          });
        break;
      }
      case "offset":
        if (literalValue)
          equations.push({
            eq: { x: lineNode(node.x), y: lineNode(node.from), c: r.valueH!, label },
            text: [keepRefText(node.x), keepRefText(node.from)],
            axis: axisWord,
          });
        else entered = false;
        break;
      case "fixed":
        if (literalValue)
          equations.push({
            eq: { x: lineNode(node.datum), y: `origin|${axisWord}`, c: r.valueH!, label },
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
              eq: { x: `stack|${l}|${id}.${edge}`, y: `stack|${ls[0]}|${id}.${edge}`, c: 0, label },
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
    for (const { eq, text, axis } of equations) {
      const got = pot.enter(eq);
      if (got.joined) continue;
      if (got.implied === eq.c) {
        if (impliedPaths < MAX_KEEP_PATHS) {
          impliedPaths++;
          const path = pot.path(eq.y, eq.x);
          by.push(...path);
          implied.push({ equation: text, by: path });
        } else {
          implied.push({ equation: text });
          row.implied_truncated = true;
        }
      } else if (conflictPaths < MAX_KEEP_PATHS) {
        conflictPaths++;
        conflicts.push({ equation: text, with: pot.path(eq.y, eq.x), axis, gap_mm: mmNumber(eq.c - got.implied) });
      } else row.conflicts_truncated = true;
    }
    if (implied.length > 0) row.implied = implied;
    if (entered && equations.length > 0 && implied.length === equations.length)
      row.redundant = { by: [...new Set(by)] };
    if (conflicts.length > 0) row.conflicts = conflicts;
    // `min clear`: redundant by another on the same room that demands at least as much.
    if (node.form === "min-clear" && literalValue) {
      const key = `${lv}|${keepRefText(node.room)}`;
      const list = clears.get(key) ?? [];
      const stronger = list.find((x) => x.h >= r.valueH!);
      if (stronger) row.redundant = { by: [stronger.label] };
      for (const x of list) if (r.valueH! > x.h && !x.row.redundant) x.row.redundant = { by: [label] };
      list.push({ h: r.valueH!, label, row });
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
    ...(conflicts ? { conflicts } : {}),
    ...(conflicts_truncated ? { conflicts_truncated } : {}),
  };
}
