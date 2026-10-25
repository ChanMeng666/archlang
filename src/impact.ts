/**
 * `impact(before, after)` (plan-soundness card PS4.2): change one number, see what follows,
 * what stays put, and what breaks. The executable answer to "what changes, what must not".
 *
 * Both sources go through the one pipeline (`compileUncached`, the shape `reroll` proves its
 * twins with, plus `resolvePlan`, `describe()` and `lint()`, all over the same parse), and the
 * report is built on two facts that already exist: `diffPlans` says what moved, resized
 * or was re-hosted, and `describe(…, { facts: ["depends"] })` (PS4.1) says what each element
 * was derived from. Four sections:
 *
 * - **changed**: every element that changed between the sides (rooms, openings and walls as
 *   `diffPlans` classifies them; other kinds, and a door that slid along an unchanged wall,
 *   from their resolved position), each with `why`: the dependency chain from it back to a
 *   root that itself changed. The chain follows `on`, `hostWallId` (`host`), `axes` and
 *   `params`: a bound name (a `let` anywhere, a `for` variable, a component parameter) whose
 *   binding changed or reads a changed one, plus the names the element's `place … at (x, y)`
 *   and arguments read. One more edge, `joins`, is followed for a re-hosted opening only: the
 *   rooms whose change moved the spaces it joins (its `between` is read off the rooms around
 *   it, not named by it). Among a node's changed edges the chain takes the first, in that edge
 *   order and then code-unit id order, that reaches a root (a memoised depth-first search),
 *   else the first changed one: "first" is an order, not a claim about which cause mattered
 *   most. `root` says how the chain ends: `let` (a binding's expression changed, e.g. the
 *   `--set` target), `edited` (that element's own statement changed), `axis` (a positioning
 *   axis moved) or `unexplained` (no recorded dependency reaches a change: geometry found by
 *   search, such as `flush` measuring from a wall, or a `place` edited to a literal).
 * - **held**: an element that did NOT change although something it depends on (by the same
 *   four edges) changed geometry or value. A wall changes only as `diffPlans` sees it (points,
 *   arcs, closure, thickness): an opening widened in it is not a change of the wall. The "should it have followed?" signal. A
 *   relabel never makes a dependant held.
 * - **diagnostics**: `broke` (on the after side only) and `healed` (on the before side only),
 *   matched as a multiset keyed by code, element and storey, and `unchanged_count`. The
 *   element is the one whose statement contains the diagnostic's span (its byte offsets move
 *   when `--set` changes the length of a value, so spans themselves never key). A side that
 *   does not resolve has no elements, so its diagnostics carry no element.
 *
 * **Naming.** An element is named by its id as `describe()` prints it. A wall `walls from
 * rooms` derived has no id an author can type, so it is named by its room phrase exactly as
 * `diffPlans` names it (`the partition between "a" and "b"`), an `open between` opening by
 * its clause (`opening between a and b`) and the statement itself as `walls from rooms`;
 * internal names (`a|b`, `exterior`, `a|b:open`) never leave this module.
 *
 * - **keeps** (ADR 0033; PS4.3 design §6, R15), present only when either side declares a
 *   `keep`: each keep matched across the sides by (storey, its text as `arch fmt` prints it,
 *   occurrence index), span-blind, so a `for` loop's repeats are told apart by order and a
 *   `--set` never re-keys one. `broke`: broken after, and held before or its residual moved;
 *   `healed`: held after, broken before; `held`: held on both sides while a target it names
 *   changed or its residual moved (a `min clear` margin); a keep on one side only is `added` or
 *   `removed` with the one residual it has; everything else counts in `unchanged_count`. A
 *   target's change is read on the keep's own storey (every storey, unlike `changed[]` and
 *   `held[]` below, which compare the lowest storey's elements until PS4.6): its resolved
 *   element, label aside, differs between the sides; a `stacked` keep reads every level it lists.
 *
 * **`W_KEEP_VIOLATED` is reported once, under `keeps`.** `compile()` raises it for a broken
 * hard keep, so it arrives in {@link sideDiagnostics}' `compile` channel; when both sides
 * resolve, the code is dropped there before matching, so `diagnostics.broke`/`healed`/
 * `unchanged_count` never count it and the keep row (with its residual) is the one report. When
 * a side does not resolve nothing is compared: the code stays a diagnostic and no `keeps`
 * section is built.
 *
 * **Limits** (recorded, not hidden): elements pair by id, so under `--against` a statement
 * inserted ahead of auto-id'd elements shifts their ids (PS0.23, as in `diffPlans`); only the
 * lowest storey's elements are compared (as `describe()`'s top-level facts and `diffPlans`
 * do), while diagnostics cover every storey; a bound name is one entry however many places
 * bind it (a component parameter and a `let` of the same name are not told apart, PS4.7); and
 * an element whose position comes
 * from geometry it does not record as a dependency (an absolute wall a room has outgrown)
 * cannot be "held" by this definition: the breakage it causes appears under `broke` instead.
 *
 * **Bounds.** Post-compile and outside the evaluator, so nothing is charged to the step meter
 * (`src/expr.ts`; there is no meter outside a resolution). Every loop is bounded by a count:
 * with E elements and walls per side (at most `MAX_ELEMENTS` = 5,000 elements per
 * resolution, plus the walls they derive), L bound names with R names read in all, D
 * diagnostics and K the largest dependency row: pairing and classifying is O(E) map lookups;
 * the binding closure is at most L passes, each over every name and its reads, O(L·(L+R));
 * the chain search visits each node once (memoised) over its edges, O(E·K), and each reported
 * chain is at most {@link MAX_WHY_DEPTH} steps, O(E·MAX_WHY_DEPTH) to print them all; held
 * is one pass over every row, O(E·K); keying diagnostics scans the elements once per
 * diagnostic, O(D·E). Worst case is that last term, ~5,000 × the diagnostic count.
 *
 * Pure, synchronous, deterministic (code-unit order, never `localeCompare`), never throws on
 * user source.
 */

import type { ComponentDef, LetNode, PlanNode, Statement } from "./ast.js";
import { exprChildren, statementBodies } from "./cursor.js";
import { describe, type DescribeOptions } from "./describe.js";
import type { DependsEntry, DerivedWallDepends } from "./analyze/depends.js";
import { indexStatements } from "./analyze/depends.js";
import { resolvePlan } from "./analyze.js";
import type { Diagnostic, Severity } from "./diagnostics.js";
import { diffSides, type OpeningChange, type PlanDiff, type RoomChange, type WallChange } from "./diff.js";
import { closest, type Expr } from "./expr.js";
import type { ResolvedElement, ResolvedPlan, ROpening, RWall } from "./ir.js";
import { lex } from "./lexer.js";
import { keepResultsOf, type ResolvedLevel } from "./ir.js";
import { type KeepAt, type KeepResult, keepRefsOf, mmNumber } from "./keep.js";
import { lint } from "./lint.js";
import { fmtHalfLattice } from "./num-format.js";
import { parse } from "./parser.js";
import { compileUncached } from "./pipeline.js";
import type { CompileOptions } from "./types.js";
import { wallPhraseOf } from "./wall-ref.js";

/** The longest `why` chain reported; a longer one ends with `truncated: true`. A count. */
export const MAX_WHY_DEPTH = 32;

/** Options `impact` shares with `compile()`, as `reroll` takes them. */
export interface ImpactOptions {
  /** The environment both sides resolve `import`s through, unless {@link beforeWorld} is given. */
  world?: CompileOptions["world"];
  /** The before side's environment, when it differs (`--against` a file in another directory). */
  beforeWorld?: CompileOptions["world"];
  plugins?: CompileOptions["plugins"];
}

/** One link of a `why` chain or a held element's `because`. */
export interface ImpactStep {
  /** The edge followed: a depends `on` id, the host wall, an axis, a `let` read, or (for a
   *  re-hosted opening only) a room whose change moved the spaces it joins. */
  via: "on" | "host" | "axis" | "param" | "joins";
  /** The dependency, named as the report names everything (never an internal name). */
  name: string;
  /** How it changed, briefly (`resized`, `moved 500 mm right`, `4000 → 4500`). */
  change: string;
}

/** One changed element. */
export interface ImpactChange {
  /** How the report names it: its id, or a derived wall's room phrase. */
  name: string;
  /** Its id, when an author can type it (absent on a derived wall or opening). */
  id?: string;
  kind: string;
  derived?: true;
  change: "added" | "removed" | "moved" | "resized" | "rehosted" | "relabeled" | "rethickened" | "changed";
  /** The change as a phrase (`moved 500 mm right`, `resized (20 m² → 22.5 m²; right edge +500 mm)`). */
  detail: string;
  /** The chain from this element to the root that changed; empty when it is its own root. */
  why: ImpactStep[];
  /** How the chain ends (see the module header). */
  root: "let" | "edited" | "axis" | "unexplained";
  /** Present when the chain hit {@link MAX_WHY_DEPTH}. */
  truncated?: true;
}

/** One element that stayed put although a dependency changed. */
export interface ImpactHeld {
  name: string;
  id?: string;
  kind: string;
  derived?: true;
  /** Every direct dependency that changed. */
  because: ImpactStep[];
}

/** A top-level `let` whose expression changed, directly or through a `let` it reads. */
export interface ImpactLet {
  name: string;
  /** The expression as written on each side (absent on the side that lacks the `let`). */
  before?: string;
  after?: string;
  /** For a `let` whose own text is unchanged: the changed `let`s it reads. */
  reads?: string[];
}

/** One diagnostic on one side only. */
export interface ImpactDiagnostic {
  code: string;
  severity: Severity;
  /** The element whose statement raised it, named as the report names elements; absent for a
   *  plan-level diagnostic. */
  element?: string;
  message: string;
  level?: number;
  /** Which pass raised it: `compile` (parse, resolve, render; a broken hard keep's `W_KEEP_VIOLATED` is raised here and reported under `keeps` instead) or `lint`. */
  channel: "compile" | "lint";
}

/** One keep in the `keeps` section (PS4.3 design §6). */
export interface KeepImpact {
  /** The keep as `arch fmt` prints it, without `keep` and the grade. */
  keep: string;
  grade: KeepResult["grade"];
  /** Its storey, on a multi-storey plan (absent for a `stacked` keep, which spans storeys). */
  level?: number;
  /** The reported residual in mm on each side it exists on (`before` absent when added,
   *  `after` absent when removed). */
  residual_mm: { before?: number; after?: number };
  /** Where the reported residual stands (the after side's; the before side's when removed). */
  at?: KeepAt;
  /** The targets it names whose element changed on its storey (a `stacked` keep: on any level
   *  it lists), by id or `axis <label>`, in the order the keep names them. */
  changed: string[];
}

/** `ImpactReport.keeps`. */
export interface ImpactKeeps {
  broke: KeepImpact[];
  held: KeepImpact[];
  healed: KeepImpact[];
  added: KeepImpact[];
  removed: KeepImpact[];
  unchanged_count: number;
}

export interface ImpactReport {
  /** Both sides resolved. When false, `changed`/`held` are empty and `broke` holds the errors. */
  ok: boolean;
  lets: ImpactLet[];
  changed: ImpactChange[];
  held: ImpactHeld[];
  diagnostics: { broke: ImpactDiagnostic[]; healed: ImpactDiagnostic[]; unchanged_count: number };
  /** The keeps, matched across the sides; present only when both sides resolve and either
   *  declares a keep (see the module header). */
  keeps?: ImpactKeeps;
  /** The report as human lines (sections Lets / Changed / Held / Broke / Healed, then the
   *  keeps' when present). */
  summary: string[];
}

// ---------------------------------------------------------------------------------------
// One side

interface LetFact {
  key: string;
  reads: Set<string>;
  /** The first top-level `let`'s expression text, and the first `let`'s anywhere in the source. */
  topText: string;
  anyText: string;
}
/** A changed binding, briefly: `4000 → 4500`, `reads W`, or `changed` when it has no text. */
const letChangePhrase = (l: ImpactLet): string =>
  l.reads
    ? `reads ${l.reads.join(", ")}`
    : l.before === undefined && l.after === undefined
      ? "changed"
      : `${l.before ?? "(none)"} → ${l.after ?? "(none)"}`;
const textOf = (l: LetFact | undefined): string | undefined => (l ? l.topText || l.anyText || undefined : undefined);

interface Side {
  ok: boolean;
  ir: ResolvedPlan | null;
  /** Every storey's elements, for keying diagnostics. */
  allElements: ResolvedElement[];
  diagnostics: Array<{ d: Diagnostic; channel: ImpactDiagnostic["channel"] }>;
  rows: Map<string, DependsEntry>;
  derivedRows: Map<string, DerivedWallDepends>;
  /** Element (and wall) fingerprints by id: the resolved fields, without spans or internals. */
  fp: Map<string, string>;
  kind: Map<string, string>;
  name: Map<string, string>;
  /** True for a derived wall or a derived opening with no typed id. */
  derived: Set<string>;
  /** The statement each element came from, span-blind. */
  stmt: Map<string, string>;
  lets: Map<string, LetFact>;
  /** Each `place`, by instance path: the names its `at` reads, and per component parameter
   *  the names its argument reads. */
  places: Map<string, PlaceReads>;
  /** Each element's instance path. */
  instance: Map<string, string>;
  axes: Map<string, string>;
  /** Openings' resolved `at` and furniture's `at`/`size`, for move/resize phrases. */
  at: Map<string, { x: number; y: number }>;
  size: Map<string, { w: number; h: number }>;
  /** Every accepted keep, measured (`undefined` when the side declares none or does not resolve). */
  keeps?: KeepResult[];
  /** The storeys, for reading a keep's targets on its own storey. */
  levels: readonly ResolvedLevel[];
}

interface PlaceReads {
  at: Set<string>;
  args: Map<string, Set<string>>;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Drop what is not semantic: spans, source lines and every internal `_` field. */
function stripped(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripped);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === "span" || k === "line" || k.endsWith("Span") || k.startsWith("_")) continue;
      out[k] = stripped(val);
    }
    return out;
  }
  return v;
}
const keyOf = (v: unknown): string => JSON.stringify(stripped(v)) ?? "";

/** Names an expression reads (a `ref` without a dot, a called name), its own `fnlit`
 *  parameters excluded. Linear in the expression. */
function exprReads(e: Expr, out: Set<string>, bound: ReadonlySet<string> = new Set()): void {
  if (e.t === "ref" && !e.name.includes(".") && !bound.has(e.name)) out.add(e.name);
  else if (e.t === "call" && !bound.has(e.callee)) out.add(e.callee);
  const inner = e.t === "fnlit" ? new Set([...bound, ...e.params]) : bound;
  for (const c of exprChildren(e)) exprReads(c, out, inner);
}

/** The expression text of a `let NAME = <expr>` statement as written. */
function letText(source: string, s: LetNode): string {
  if (!s.span) return "";
  const text = source.slice(s.span.start, s.span.end);
  const eq = text.indexOf("=");
  return eq < 0 ? text : text.slice(eq + 1).trim();
}

/**
 * Every bound name of the plan, by name: a `let` or reassignment anywhere (the root body, a
 * block, a component body), a `for` variable (it reads its range) and a component parameter
 * (it reads the arguments every `place`/call passes it). A name bound in several places is one
 * entry whose `key` joins them in walk order and whose `reads` is their union, so the name, not
 * the binding, is what changes (PS4.7). `text` is the expression of the first top-level `let`
 * of that name in the compiled source, else of the first `let` there; empty otherwise.
 *
 * Also, by instance path (`west`, `west.inner`), what each `place … as <alias> at (x, y)`
 * reads: the names in its `at`, which move every element of the instance, and per component
 * parameter the names its argument reads, which reach only the elements that read that
 * parameter (resolved per instance in `edges`, so two instances' arguments stay apart there).
 *
 * Linear in the statements and their expressions; each component body is walked once for its
 * bindings, and once per instance path for its places (a component on the current path is not
 * re-entered, so a self-placing component, already `E_RECURSION`, cannot loop).
 */
function bindingsOf(
  source: string,
  plan: PlanNode | undefined,
): { lets: Map<string, LetFact>; places: Map<string, PlaceReads> } {
  const lets = new Map<string, LetFact>();
  const places = new Map<string, PlaceReads>();
  if (!plan) return { lets, places };
  const comps = new Map<string, ComponentDef>();
  const seen = new Set<ComponentDef>();
  const collect = (m: ReadonlyMap<string, ComponentDef> | undefined): void => {
    for (const [n, c] of m ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (!comps.has(n)) comps.set(n, c);
      collect(c.scope);
    }
  };
  collect(plan.components);
  const bind = (name: string, part: string, value: Expr | undefined, text: string, top: boolean): void => {
    const prev = lets.get(name);
    const reads = prev?.reads ?? new Set<string>();
    if (value) exprReads(value, reads);
    reads.delete(name);
    lets.set(name, {
      key: `${prev ? `${prev.key};` : ""}${part}`,
      reads,
      topText: prev?.topText || (top ? text : ""),
      anyText: prev?.anyText || text,
    });
  };
  const argsOf = (callee: string, args: readonly Expr[]): void => {
    const def = comps.get(callee);
    if (!def) return;
    def.params.forEach((p, k) => {
      const a = args[k];
      bind(p, `arg:${a ? keyOf(a) : ""}`, a, "", false);
    });
  };
  const walk = (body: readonly Statement[], top: boolean, file: string | undefined): void => {
    for (const s of body) {
      if (s.kind === "let" || s.kind === "assign") {
        const text = s.kind === "let" && file === undefined ? letText(source, s) : "";
        bind(s.name, `${s.kind}:${keyOf(s.value)}`, s.value, text, top);
      } else if (s.kind === "for") bind(s.varName, `for:${keyOf(s.iter)}`, s.iter, "", false);
      else if (s.kind === "place" || s.kind === "instance") argsOf(s.name, s.args);
      for (const b of statementBodies(s)) walk(b, false, file);
    }
  };
  walk(plan.body, true, undefined);
  for (const c of seen) walk(c.body, false, c.file);
  const walkPlaces = (body: readonly Statement[], prefix: string, stack: ReadonlySet<string>): void => {
    for (const s of body) {
      if (s.kind === "place") {
        const path = prefix ? `${prefix}.${s.alias}` : s.alias;
        const at = new Set<string>();
        exprReads(s.at.x, at);
        exprReads(s.at.y, at);
        const def = comps.get(s.name);
        const args = new Map<string, Set<string>>();
        def?.params.forEach((p, k) => {
          const reads = new Set<string>();
          const a = s.args[k];
          if (a) exprReads(a, reads);
          args.set(p, reads);
        });
        places.set(path, { at, args });
        if (def && !stack.has(s.name)) walkPlaces(def.body, path, new Set([...stack, s.name]));
      }
      for (const b of statementBodies(s)) walkPlaces(b, prefix, stack);
    }
  };
  walkPlaces(plan.body, "", new Set());
  return { lets, places };
}

function nameOf(e: ResolvedElement): { name: string; derived: boolean } {
  if (e.kind === "walls")
    return { name: e._instance ? `walls from rooms in ${e._instance}` : "walls from rooms", derived: true };
  if (e.kind === "opening") {
    const d = (e as ROpening)._derived;
    if (d && !d.idAuthored) return { name: `opening between ${d.between[0]} and ${d.between[1]}`, derived: true };
  }
  return { name: e.id, derived: false };
}

/** `west.inner` → `west`; `west` → `` (the root). */
const parentPath = (path: string): string => {
  const k = path.lastIndexOf(".");
  return k < 0 ? "" : path.slice(0, k);
};

/** A wall as `diffPlans` names it (its `DiffWallFact.name`). */
function wallName(w: RWall): string {
  const run = w._derived ? /~(\d+)$/.exec(w.id) : null;
  return `${wallPhraseOf(w)}${run ? ` (run ${run[1]})` : ""}`;
}

/** Diagnostics from both passes, each tagged with the pass that raised it. `diagnosticDelta` drops `W_KEEP_VIOLATED` from the `compile` channel when both sides resolve. */
function sideDiagnostics(source: string, opts: ImpactOptions): Side["diagnostics"] {
  const compiled = compileUncached(source, { world: opts.world, plugins: opts.plugins });
  return [
    ...compiled.diagnostics.map((d) => ({ d, channel: "compile" as const })),
    ...lint(source, { world: opts.world, plugins: opts.plugins }).map((d) => ({ d, channel: "lint" as const })),
  ];
}

function readSide(source: string, opts: ImpactOptions): Side {
  const aopts: DescribeOptions = { world: opts.world, plugins: opts.plugins };
  const { ir, levels, plan } = resolvePlan(source, aopts);
  const bound = bindingsOf(source, plan);
  const keeps = ir ? keepResultsOf(ir, levels) : undefined;
  const side: Side = {
    ok: ir !== null,
    ir,
    allElements: ir ? (levels.length > 0 ? levels.flatMap((l) => l.ir.elements) : ir.elements) : [],
    diagnostics: sideDiagnostics(source, opts),
    rows: new Map(),
    derivedRows: new Map(),
    fp: new Map(),
    kind: new Map(),
    name: new Map(),
    derived: new Set(),
    stmt: new Map(),
    lets: bound.lets,
    places: bound.places,
    instance: new Map(),
    axes: new Map(),
    at: new Map(),
    size: new Map(),
    ...(keeps ? { keeps } : {}),
    levels,
  };
  if (!ir) return side;
  const deps = describe(source, { ...aopts, facts: ["depends"] }).depends;
  for (const r of deps?.elements ?? []) side.rows.set(r.id, r);
  for (const r of deps?.derived_walls ?? []) side.derivedRows.set(r.name, r);
  const index = plan ? indexStatements(plan) : undefined;
  for (const e of ir.elements as ResolvedElement[]) {
    if (e.kind === "walls" || e.kind === "wall" || side.kind.has(e.id)) continue;
    side.kind.set(e.id, e.kind);
    const n = nameOf(e);
    side.name.set(e.id, n.name);
    if (n.derived) side.derived.add(e.id);
    if (e._instance !== undefined) side.instance.set(e.id, e._instance);
    // An opening's host segment is `diffPlans`' business (re-hosted); its own place is `at`.
    const { host: _host, ...rest } = e as unknown as Record<string, unknown>;
    side.fp.set(e.id, keyOf(e.kind === "door" || e.kind === "window" || e.kind === "opening" ? rest : e));
    const s = index?.statement(e.span, e._file);
    if (s && !n.derived) side.stmt.set(e.id, keyOf(s));
    const p = e as { at?: { x: number; y: number }; size?: { w: number; h: number } };
    if (p.at && typeof p.at.x === "number") side.at.set(e.id, p.at);
    if (p.size && typeof p.size.w === "number") side.size.set(e.id, p.size);
  }
  // Walls (authored and derived) from `ir.walls`, the list `diffPlans` pairs; the first of a
  // repeated id stands for it.
  for (const w of ir.walls) {
    if (side.kind.has(w.id)) continue;
    side.kind.set(w.id, "wall");
    side.name.set(w.id, w._derived ? wallName(w) : w.id);
    if (w._instance !== undefined) side.instance.set(w.id, w._instance);
    if (w._derived) side.derived.add(w.id);
    const s = w._derived ? undefined : index?.statement(w.span, w._file);
    if (s) side.stmt.set(w.id, keyOf(s));
  }
  for (const a of ir.axes ?? []) side.axes.set(a.label, `${a.axis}:${a.pos}`);
  return side;
}

// ---------------------------------------------------------------------------------------
// Phrases (diffPlans' style: mm rounded, +y runs down the page)

const EDGE_EPS_MM = 10;
const mm = (v: number): string => `${Math.round(v)} mm`;
const m2 = (v: number): string => `${v.toFixed(1).replace(/\.0$/, "")} m²`;

function offsetPhrase(o: { dx: number; dy: number }): string {
  const parts: string[] = [];
  if (Math.abs(o.dx) >= 0.5) parts.push(`${mm(Math.abs(o.dx))} ${o.dx > 0 ? "right" : "left"}`);
  if (Math.abs(o.dy) >= 0.5) parts.push(`${mm(Math.abs(o.dy))} ${o.dy > 0 ? "down" : "up"}`);
  return parts.length > 0 ? parts.join(", ") : "less than 1 mm";
}

const spaces = (s: readonly string[] | undefined): string => (!s || s.length === 0 ? "nothing" : s.join(" and "));

function roomDetail(r: RoomChange): string {
  if (r.change === "moved") return `moved ${offsetPhrase(r.offset!)}`;
  if (r.change === "resized") {
    const edges = Object.entries(r.edges!)
      .filter(([, v]) => Math.abs(v) > EDGE_EPS_MM)
      .map(([k, v]) => `${k} edge ${v > 0 ? "+" : ""}${mm(v)}`);
    return `resized (${m2(r.areaBeforeM2!)} → ${m2(r.areaAfterM2!)}${edges.length > 0 ? `; ${edges.join(", ")}` : ""})`;
  }
  if (r.change === "relabeled") return `relabeled "${r.label ?? ""}"`;
  return r.change;
}

function openingDetail(o: OpeningChange): string {
  const parts: string[] = [];
  if (o.change === "resized") parts.push(`width ${mm(o.widthBeforeMm!)} → ${mm(o.widthAfterMm!)}`);
  if (o.hostBefore !== undefined) {
    const was = o.relationBefore ?? o.hostBefore;
    const now = o.relationAfter ?? o.hostAfter!;
    parts.push(`re-hosted ${was !== now ? `${was} → ${now}` : `${o.hostBefore} → ${o.hostAfter}`}`);
  }
  if (o.betweenBefore !== undefined) parts.push(`joins ${spaces(o.betweenBefore)} → ${spaces(o.between)}`);
  if (parts.length === 0) return o.change;
  return o.change === "resized" ? parts.join("; ") : `re-hosted: ${parts.join("; ").replace(/^re-hosted /, "")}`;
}

function wallDetail(w: WallChange): string {
  const thick =
    w.thicknessBeforeMm !== undefined && w.thicknessAfterMm !== undefined
      ? `thickness ${mm(w.thicknessBeforeMm)} → ${mm(w.thicknessAfterMm)}`
      : "";
  if (w.change === "moved") return `moved ${offsetPhrase(w.offset!)}${thick ? `; ${thick}` : ""}`;
  if (w.change === "resized")
    return `resized (${mm(w.lengthBeforeMm!)} → ${mm(w.lengthAfterMm!)} long${thick ? `; ${thick}` : ""})`;
  if (w.change === "rethickened") return thick;
  return w.change;
}

// ---------------------------------------------------------------------------------------
// The report

interface Node {
  change: ImpactChange["change"];
  /** The short form a chain step shows. */
  brief: string;
}

/**
 * Compare `before` with `after` (two whole sources; `applyLetOverride` makes the second from
 * the first for `--set`). See the module header for the sections, naming and bounds.
 */
export function impact(before: string, after: string, opts: ImpactOptions = {}): ImpactReport {
  const beforeOpts: ImpactOptions = { ...opts, world: opts.beforeWorld ?? opts.world };
  const A = readSide(before, beforeOpts);
  const B = readSide(after, opts);
  const ok = A.ok && B.ok;
  const report: ImpactReport = {
    ok,
    lets: [],
    changed: [],
    held: [],
    // Both sides resolved: a broken keep is reported once, in `keeps`, never also here.
    diagnostics: diagnosticDelta(A, B, ok),
    // After `diagnostics`, before `summary`, as the JSON prints it; only when there is a keep.
    ...(ok && (A.keeps || B.keeps) ? { keeps: keepDelta(A, B) } : {}),
    summary: [],
  };
  if (ok) {
    // `diffPlans`, with each side read in its own environment.
    const diff = diffSides(
      before,
      after,
      { world: beforeOpts.world, plugins: opts.plugins },
      { world: opts.world, plugins: opts.plugins },
    );
    buildChanges(A, B, diff, report);
  }
  report.summary = summaryOf(report);
  return report;
}

function buildChanges(A: Side, B: Side, diff: PlanDiff, report: ImpactReport): void {
  // 1. Bound names: a changed binding, then (at most one pass per name) any name whose
  // bindings read a changed one. `before`/`after` are the `let` text as written, when there is
  // one in the compiled source.
  const letNames = [...new Set([...A.lets.keys(), ...B.lets.keys()])].sort(cmp);
  const lets = new Map<string, ImpactLet>();
  const texts = (n: string): Pick<ImpactLet, "before" | "after"> => {
    const a = textOf(A.lets.get(n));
    const b = textOf(B.lets.get(n));
    return { ...(a !== undefined ? { before: a } : {}), ...(b !== undefined ? { after: b } : {}) };
  };
  for (const n of letNames) if (A.lets.get(n)?.key !== B.lets.get(n)?.key) lets.set(n, { name: n, ...texts(n) });
  for (let pass = 0; pass < letNames.length; pass++) {
    let grew = false;
    for (const n of letNames) {
      if (lets.has(n)) continue;
      const reads = [...(B.lets.get(n)?.reads ?? [])].filter((r) => lets.has(r)).sort(cmp);
      if (reads.length === 0) continue;
      lets.set(n, { name: n, ...texts(n), reads });
      grew = true;
    }
    if (!grew) break;
  }
  report.lets = [...lets.values()].sort((x, y) => cmp(x.name, y.name));

  // 2. Element and wall changes, by id (internal ids stay internal: `name` is what is shown).
  const nodes = new Map<string, Node>();
  const detail = new Map<string, string>();
  const roomById = new Map(diff.rooms.map((r) => [r.id, r]));
  const openingById = new Map(diff.openings.map((o) => [`${o.kind}\u0000${o.id}`, o]));
  const wallByKey = new Map<string, WallChange>();
  for (const w of diff.walls) wallByKey.set(w.id ?? `\u0000${w.name}`, w);
  const ids = [...new Set([...A.kind.keys(), ...B.kind.keys()])].sort(cmp);
  for (const id of ids) {
    const kind = B.kind.get(id) ?? A.kind.get(id)!;
    const inA = A.kind.has(id);
    const inB = B.kind.has(id);
    const set = (change: Node["change"], d: string, brief = d): void => {
      nodes.set(id, { change, brief });
      detail.set(id, d);
    };
    if (kind === "room" && roomById.has(id)) {
      const r = roomById.get(id)!;
      set(r.change, roomDetail(r), r.change === "moved" ? roomDetail(r) : r.change);
      continue;
    }
    if (kind === "wall") {
      // A wall changes only as `diffPlans` sees it: its points, arcs, closure or thickness
      // (and appearing or vanishing). The openings cut into it are theirs, never the wall's.
      const derived = (inB ? B : A).derived.has(id);
      const w = wallByKey.get(derived ? `\u0000${B.name.get(id) ?? A.name.get(id)}` : id);
      if (w) set(w.change, wallDetail(w), w.change === "moved" ? wallDetail(w) : w.change);
      continue;
    }
    if (!inA || !inB) {
      set(inB ? "added" : "removed", inB ? "added" : "removed");
      continue;
    }
    const o = openingById.get(`${kind}\u0000${id}`);
    if (o && (o.change === "resized" || o.change === "rehosted")) {
      set(
        o.change,
        openingDetail(o),
        o.change === "resized" ? `width ${mm(o.widthBeforeMm!)} → ${mm(o.widthAfterMm!)}` : "re-hosted",
      );
      continue;
    }
    if (A.fp.get(id) === B.fp.get(id)) continue;
    const pa = A.at.get(id);
    const pb = B.at.get(id);
    const sa = A.size.get(id);
    const sb = B.size.get(id);
    if (kind !== "room" && sa && sb && (sa.w !== sb.w || sa.h !== sb.h))
      set("resized", `resized (${mm(sa.w)} × ${mm(sa.h)} → ${mm(sb.w)} × ${mm(sb.h)})`, "resized");
    else if (kind !== "room" && pa && pb && (pa.x !== pb.x || pa.y !== pb.y)) {
      const d = `moved ${offsetPhrase({ dx: pb.x - pa.x, dy: pb.y - pa.y })}`;
      set("moved", d);
    } else set("changed", "changed");
  }

  const nameOfId = (id: string): string => B.name.get(id) ?? A.name.get(id) ?? id;
  const isLetNode = (k: string): boolean => k.startsWith("let\u0000");
  const letBrief = (n: string): string => {
    return letChangePhrase(lets.get(n)!);
  };
  const axisChanged = (label: string): boolean => A.axes.get(label) !== B.axes.get(label);
  /** A node changed in geometry or value (a relabel does not count). */
  const moves = (key: string): boolean => {
    if (isLetNode(key)) return lets.has(key.slice(4));
    if (key.startsWith("axis\u0000")) return axisChanged(key.slice(5));
    const n = nodes.get(key);
    return n !== undefined && n.change !== "relabeled";
  };
  const brief = (key: string): string => {
    if (isLetNode(key)) return letBrief(key.slice(4));
    if (key.startsWith("axis\u0000")) return "moved";
    return nodes.get(key)!.brief;
  };
  const display = (key: string): string => {
    if (isLetNode(key)) return key.slice(4);
    if (key.startsWith("axis\u0000")) return `axis ${key.slice(5)}`;
    return nameOfId(key);
  };
  const placeOf = (path: string): PlaceReads | undefined => B.places.get(path) ?? A.places.get(path);
  /** A node's dependency edges in a fixed order: on, host, axes, params, joins. */
  const edges = (key: string): Array<{ via: ImpactStep["via"]; key: string }> => {
    const out: Array<{ via: ImpactStep["via"]; key: string }> = [];
    if (isLetNode(key)) {
      for (const r of lets.get(key.slice(4))?.reads ?? []) out.push({ via: "param", key: `let\u0000${r}` });
      return out;
    }
    if (key.startsWith("axis\u0000")) return out;
    const row = B.rows.get(key) ?? A.rows.get(key);
    const drow = B.derivedRows.get(key) ?? A.derivedRows.get(key);
    for (const id of row?.on ?? drow?.on ?? []) if (id !== row?.hostWallId) out.push({ via: "on", key: id });
    if (row?.hostWallId !== undefined) out.push({ via: "host", key: row.hostWallId });
    for (const a of row?.axes ?? []) out.push({ via: "axis", key: `axis\u0000${a}` });
    // Inside a placed instance, a name that is a component parameter of an enclosing instance
    // stands for what THAT instance's argument reads (resolved outwards, one instance level
    // per step, so bounded by the path's depth); any other name is the plan-wide binding. The
    // instance's own `place … at` (and each enclosing one's) moves every element in it.
    const inst = B.instance.get(key) ?? A.instance.get(key);
    const params = new Set<string>();
    const resolve = (name: string, path: string): void => {
      for (let cur = path; cur !== ""; cur = parentPath(cur)) {
        const arg = placeOf(cur)?.args.get(name);
        if (arg) {
          for (const r of arg) resolve(r, parentPath(cur));
          return;
        }
      }
      params.add(name);
    };
    for (const p of row?.params ?? drow?.params ?? []) resolve(p, inst ?? "");
    for (let cur = inst ?? ""; cur !== ""; cur = parentPath(cur))
      for (const r of placeOf(cur)?.at ?? []) resolve(r, parentPath(cur));
    for (const p of [...params].sort(cmp)) if (lets.has(p)) out.push({ via: "param", key: `let\u0000${p}` });
    const kind = B.kind.get(key) ?? A.kind.get(key);
    const o = kind ? openingById.get(`${kind}\u0000${key}`) : undefined;
    if (o?.betweenBefore !== undefined)
      for (const r of [...new Set([...o.betweenBefore, ...(o.between ?? [])])].sort(cmp))
        out.push({ via: "joins", key: r });
    return out;
  };
  const edited = (key: string): boolean => {
    if (isLetNode(key) || key.startsWith("axis\u0000")) return false;
    const a = A.stmt.get(key);
    const b = B.stmt.get(key);
    if (a === undefined && b === undefined) return false;
    return a !== b;
  };

  /** How a node is a root of a chain, or undefined when it is not one. */
  const rootOf = (key: string): ImpactChange["root"] | undefined => {
    if (edited(key)) return "edited";
    if (isLetNode(key)) return lets.get(key.slice(4))!.reads ? undefined : "let";
    if (key.startsWith("axis\u0000")) return "axis";
    return undefined;
  };
  // Which edge each node's chain takes: the first (in `edges` order) whose target reaches a
  // root, else the first that changed at all (the chain then ends `unexplained`). Memoised, so
  // every node is searched once whichever element's chain reaches it: O(nodes x edges) in all.
  // A node already on the search path is skipped, so a cycle terminates (deterministically).
  const reaches = new Map<string, boolean>();
  const nextOf = new Map<string, { via: ImpactStep["via"]; key: string } | undefined>();
  const onPath = new Set<string>();
  const reach = (key: string): boolean => {
    const memo = reaches.get(key);
    if (memo !== undefined) return memo;
    if (rootOf(key) !== undefined) {
      reaches.set(key, true);
      return true;
    }
    onPath.add(key);
    let first: { via: ImpactStep["via"]; key: string } | undefined;
    let found: typeof first;
    for (const e of edges(key)) {
      if (onPath.has(e.key) || !moves(e.key)) continue;
      first ??= e;
      if (reach(e.key)) {
        found = e;
        break;
      }
    }
    onPath.delete(key);
    nextOf.set(key, found ?? first);
    reaches.set(key, found !== undefined);
    return found !== undefined;
  };

  for (const id of ids) {
    const n = nodes.get(id);
    if (!n) continue;
    const why: ImpactStep[] = [];
    const seen = new Set<string>([id]);
    let cur = id;
    let root: ImpactChange["root"] = "unexplained";
    let truncated = false;
    for (;;) {
      const r = rootOf(cur);
      if (r !== undefined) {
        root = r;
        break;
      }
      reach(cur);
      const next = nextOf.get(cur);
      if (!next || seen.has(next.key)) break;
      if (why.length >= MAX_WHY_DEPTH) {
        truncated = true;
        break;
      }
      seen.add(next.key);
      why.push({ via: next.via, name: display(next.key), change: brief(next.key) });
      cur = next.key;
    }
    const derived = B.derived.has(id) || (!B.kind.has(id) && A.derived.has(id));
    report.changed.push({
      name: nameOfId(id),
      ...(derived ? {} : { id }),
      kind: B.kind.get(id) ?? A.kind.get(id)!,
      ...(derived ? { derived: true as const } : {}),
      change: n.change,
      detail: detail.get(id)!,
      why,
      root,
      ...(truncated ? { truncated: true as const } : {}),
    });
  }

  // 3. Held: on both sides, unchanged, with a direct dependency that changed.
  for (const id of ids) {
    if (nodes.has(id) || !A.kind.has(id) || !B.kind.has(id)) continue;
    const because = edges(id)
      .filter((e) => e.via !== "joins" && moves(e.key))
      .map((e) => ({ via: e.via, name: display(e.key), change: brief(e.key) }));
    if (because.length === 0) continue;
    const derived = B.derived.has(id);
    report.held.push({
      name: nameOfId(id),
      ...(derived ? {} : { id }),
      kind: B.kind.get(id)!,
      ...(derived ? { derived: true as const } : {}),
      because,
    });
  }
  report.changed.sort((x, y) => cmp(x.name, y.name) || cmp(x.change, y.change));
  report.held.sort((x, y) => cmp(x.name, y.name));
}

// ---------------------------------------------------------------------------------------
// Diagnostics delta

/** The element whose statement contains `d`'s span (the narrowest; the first in element
 *  order on a tie, e.g. the instances of one loop body). */
function elementOf(side: Side, d: Diagnostic): string | undefined {
  const s = d.span;
  if (!s || d.file !== undefined) return undefined;
  let best: ResolvedElement | undefined;
  for (const e of side.allElements) {
    const es = e.span;
    if (!es || e._file !== undefined || es.start > s.start || es.end < s.end) continue;
    if (!best || es.end - es.start < best.span!.end - best.span!.start) best = e;
  }
  if (!best) return undefined;
  return nameOf(best).name;
}

/** A broken hard keep's compile code, which `keeps` reports instead. */
const KEEP_CODE = "W_KEEP_VIOLATED";

function diagnosticDelta(A: Side, B: Side, dropKeeps: boolean): ImpactReport["diagnostics"] {
  const project = (side: Side): Array<{ key: string; out: ImpactDiagnostic }> =>
    side.diagnostics
      .filter(({ d, channel }) => !(dropKeeps && channel === "compile" && d.code === KEEP_CODE))
      .map(({ d, channel }) => {
        const element = elementOf(side, d);
        const out: ImpactDiagnostic = {
          code: d.code ?? "",
          severity: d.severity,
          ...(element !== undefined ? { element } : {}),
          message: d.message,
          ...(d.level !== undefined ? { level: d.level } : {}),
          channel,
        };
        return { key: `${channel}\u0000${out.code}\u0000${element ?? ""}\u0000${d.level ?? ""}`, out };
      });
  const a = project(A);
  const b = project(B);
  const count = (xs: typeof a): Map<string, number> => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.key, (m.get(x.key) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  let unchanged = 0;
  for (const [k, n] of ca) unchanged += Math.min(n, cb.get(k) ?? 0);
  /** The entries of `xs` past the other side's count of their key (the later ones). */
  const extra = (xs: typeof a, other: Map<string, number>): ImpactDiagnostic[] => {
    const seen = new Map<string, number>();
    const out: ImpactDiagnostic[] = [];
    for (const x of xs) {
      const n = (seen.get(x.key) ?? 0) + 1;
      seen.set(x.key, n);
      if (n > (other.get(x.key) ?? 0)) out.push(x.out);
    }
    return out.sort(
      (p, q) =>
        cmp(p.element ?? "", q.element ?? "") ||
        cmp(p.code, q.code) ||
        (p.level ?? 0) - (q.level ?? 0) ||
        cmp(p.message, q.message),
    );
  };
  return { broke: extra(b, ca), healed: extra(a, cb), unchanged_count: unchanged };
}

// ---------------------------------------------------------------------------------------
// Keeps (PS4.3 design §6, R15)

/** What a keep's target is on its storey, label aside: the resolved element's fields without
 *  spans or internals (a wall from `ir.walls`), or `undefined` when the storey lacks it. */
function storeyFacts(ir: ResolvedPlan): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of ir.elements as ResolvedElement[]) {
    if (e.kind === "walls" || e.kind === "wall" || out.has(e.id)) continue;
    const { label: _label, ...rest } = e as unknown as Record<string, unknown>;
    out.set(e.id, keyOf(rest));
  }
  for (const w of ir.walls) if (!out.has(w.id)) out.set(w.id, keyOf(w));
  return out;
}

/** One side's view of its keeps' targets: per storey (`""` for a single-storey plan), the
 *  facts of each element, built once per storey on first use; and the axes. */
function targetReader(side: Side): (level: number | undefined, id: string) => string | undefined {
  const byLevel = new Map<string, Map<string, string>>();
  return (level, id) => {
    const k = level === undefined ? "" : String(level);
    let m = byLevel.get(k);
    if (!m) {
      const ir =
        level === undefined
          ? side.levels.length === 0
            ? side.ir
            : null
          : side.levels.find((l) => l.level === level)?.ir;
      m = ir ? storeyFacts(ir) : new Map();
      byLevel.set(k, m);
    }
    return m.get(id);
  };
}

/**
 * The `keeps` section: match by (storey, text, occurrence index), classify, and name the
 * targets that changed. Linear in the keeps and their targets, plus one pass over each storey's
 * elements the first time a keep on it is read.
 */
function keepDelta(A: Side, B: Side): ImpactKeeps {
  const keyed = (rs: readonly KeepResult[] | undefined): Array<{ key: string; r: KeepResult }> => {
    const seen = new Map<string, number>();
    return (rs ?? []).map((r) => {
      const base = `${r.level ?? ""}\u0000${r.keep}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { key: `${base}\u0000${n}`, r };
    });
  };
  const a = keyed(A.keeps);
  const b = keyed(B.keeps);
  const before = new Map(a.map((x) => [x.key, x.r]));
  const afterKeys = new Set(b.map((x) => x.key));
  const readA = targetReader(A);
  const readB = targetReader(B);
  /** The targets of `r` whose element differs between the sides, on the storeys it reads. */
  const changedOf = (r: KeepResult): string[] => {
    const out: string[] = [];
    const levels = r.levels ?? [r.level];
    for (const ref of keepRefsOf(r.node)) {
      const name = ref.t === "axis" ? `axis ${ref.label}` : ref.t === "room" ? ref.room : ref.id;
      if (out.includes(name)) continue;
      const moved =
        ref.t === "axis"
          ? A.axes.get(ref.label) !== B.axes.get(ref.label)
          : levels.some((lv) => readA(lv, name) !== readB(lv, name));
      if (moved) out.push(name);
    }
    return out;
  };
  const row = (r: KeepResult, residual: KeepImpact["residual_mm"], at: KeepAt | undefined): KeepImpact => ({
    keep: r.keep,
    grade: r.grade,
    ...(r.level !== undefined ? { level: r.level } : {}),
    residual_mm: residual,
    ...(at ? { at } : {}),
    changed: changedOf(r),
  });
  const out: ImpactKeeps = { broke: [], held: [], healed: [], added: [], removed: [], unchanged_count: 0 };
  for (const { key, r } of b) {
    const p = before.get(key);
    if (!p) {
      out.added.push(row(r, { after: mmNumber(r.h) }, r.at));
      continue;
    }
    const residual = { before: mmNumber(p.h), after: mmNumber(r.h) };
    const moved = p.h !== r.h;
    if (!r.holds && (p.holds || moved)) out.broke.push(row(r, residual, r.at));
    else if (r.holds && !p.holds) out.healed.push(row(r, residual, r.at));
    else if (r.holds && p.holds) {
      const k = row(r, residual, r.at);
      if (k.changed.length > 0 || moved) out.held.push(k);
      else out.unchanged_count++;
    } else out.unchanged_count++;
  }
  for (const { key, r } of a) if (!afterKeys.has(key)) out.removed.push(row(r, { before: mmNumber(r.h) }, r.at));
  return out;
}

/** `keep <text> (<grade>[, level n]): residual <before> → <after> mm[ at <target>[, level n, <edge> edge]]`. */
function keepLine(k: KeepImpact): string {
  const mm = (v: number | undefined): string => fmtHalfLattice(Math.round((v ?? 0) * 2000));
  const where = k.at
    ? ` at ${k.at.target}${k.at.level !== undefined ? `, level ${k.at.level}` : ""}${k.at.edge !== undefined ? `, ${k.at.edge} edge` : ""}`
    : "";
  const residual =
    k.residual_mm.before === undefined
      ? `added, residual ${mm(k.residual_mm.after)} mm`
      : k.residual_mm.after === undefined
        ? `removed, residual was ${mm(k.residual_mm.before)} mm`
        : `residual ${mm(k.residual_mm.before)} → ${mm(k.residual_mm.after)} mm`;
  return `  keep ${k.keep} (${k.grade}${k.level !== undefined ? `, level ${k.level}` : ""}): ${residual}${where}`;
}

// ---------------------------------------------------------------------------------------
// Human lines

const VIA_WORD: Record<ImpactStep["via"], string> = {
  on: "on",
  host: "host",
  axis: "at",
  param: "reads",
  joins: "joins",
};
const stepPhrase = (s: ImpactStep): string => `${VIA_WORD[s.via]} ${s.name} (${s.change})`;

/** `room a`, or a derived element's phrase alone (it already says what it is). */
const who = (x: { kind: string; name: string; derived?: true }): string => (x.derived ? x.name : `${x.kind} ${x.name}`);

function summaryOf(r: ImpactReport): string[] {
  const out: string[] = [];
  if (!r.ok)
    out.push(
      "Not compared: a side does not resolve; its errors are under Broke (or unchanged, when both sides have them)",
    );
  const head = (title: string, n: number): void => {
    out.push(`${title} (${n})${n === 0 ? ": none" : ":"}`);
  };
  if (r.lets.length > 0) {
    head("Lets", r.lets.length);
    for (const l of r.lets) out.push(`  ${l.name}: ${letChangePhrase(l)}`);
  }
  head("Changed", r.changed.length);
  for (const c of r.changed) {
    out.push(`  ${who(c)} ${c.detail}`);
    const chain = c.why.map(stepPhrase).join(" ← ");
    const end =
      c.root === "edited"
        ? `${c.why.length === 0 ? "its own statement" : "that statement"} was edited`
        : c.root === "unexplained"
          ? "no recorded dependency reaches a change"
          : "";
    out.push(`    why: ${[chain, end].filter((x) => x !== "").join("; ")}${c.truncated ? " (truncated)" : ""}`);
  }
  head("Held", r.held.length);
  for (const h of r.held)
    out.push(`  ${who(h)} stayed; what it depends on changed: ${h.because.map(stepPhrase).join(", ")}`);
  const diag = (title: string, ds: ImpactDiagnostic[]): void => {
    head(title, ds.length);
    for (const d of ds)
      out.push(
        `  ${d.code}${d.element !== undefined ? ` on ${d.element}` : ""}${d.level !== undefined ? ` (level ${d.level})` : ""}: ${d.message}`,
      );
  };
  diag("Broke", r.diagnostics.broke);
  diag("Healed", r.diagnostics.healed);
  out.push(`Unchanged diagnostics: ${r.diagnostics.unchanged_count}`);
  if (r.keeps) {
    const keeps = (title: string, ks: KeepImpact[], always: boolean): void => {
      if (!always && ks.length === 0) return;
      head(title, ks.length);
      for (const k of ks) {
        out.push(keepLine(k));
        if (k.changed.length > 0) out.push(`    changed: ${k.changed.join(", ")}`);
      }
    };
    keeps("Keeps broke", r.keeps.broke, true);
    keeps("Keeps held", r.keeps.held, true);
    keeps("Keeps healed", r.keeps.healed, true);
    keeps("Keeps added", r.keeps.added, false);
    keeps("Keeps removed", r.keeps.removed, false);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// `--set NAME=value`

/** The result of {@link applyLetOverride}. */
export type LetOverride =
  | { ok: true; source: string; name: string; before: string; after: string }
  | { ok: false; diagnostics: Diagnostic[] };

/**
 * `--set NAME=value`: the source with the expression of the root plan's top-level
 * `let NAME = <expr>` replaced by `value`, a numeric literal written as the language writes
 * one (`4500`, `4.5m`, `-200`, `45cm`). Refuses with `E_SET_OVERRIDE` when NAME is not exactly
 * one top-level `let` (absent, only inside a block or component, a value-function, declared
 * twice, or reassigned), or when `value` is not a numeric literal. Nothing else in the text
 * moves. A source that does not parse returns its parse errors. Pure; linear in the source.
 */
export function applyLetOverride(source: string, name: string, value: string): LetOverride {
  const refuse = (message: string, hints: string[] = [], span?: LetNode["span"]): LetOverride => ({
    ok: false,
    diagnostics: [{ severity: "error", code: "E_SET_OVERRIDE", message, ...(span ? { span } : {}), hints }],
  });
  const lexed = lex(value.trim());
  const toks = lexed.tokens.filter((t) => t.type !== "eof");
  const literal =
    lexed.errors.length === 0 &&
    ((toks.length === 1 && toks[0]!.type === "number") ||
      (toks.length === 2 && toks[0]!.type === "minus" && toks[1]!.type === "number"));
  if (!literal)
    return refuse(`\`--set ${name}=${value}\`: the value is not a numeric literal`, [
      "Give one number as the language writes it: 4500, 4.5m, 45cm or -200. A bare number is millimetres (a plan's units are always mm).",
    ]);
  const { plan, diagnostics } = parseForOverride(source);
  if (!plan) return { ok: false, diagnostics: diagnostics.filter((d) => d.severity === "error") };
  const top = plan.body.filter((s): s is LetNode => s.kind === "let" && s.name === name);
  const assigned = plan.body.some((s) => s.kind === "assign" && s.name === name);
  const lets = [...new Set(plan.body.filter((s) => s.kind === "let").map((s) => (s as LetNode).name))].sort(cmp);
  if (top.length === 0) {
    const hint = closest(name, lets);
    return refuse(`\`--set ${name}=…\`: "${name}" is not a top-level \`let\` of this plan`, [
      ...(hint ? [`Did you mean "${hint}"?`] : []),
      lets.length > 0
        ? `The top-level lets are: ${lets.join(", ")}.`
        : "This plan has no top-level `let`; compare two files with `--against old.arch` instead.",
    ]);
  }
  const s = top[0]!;
  if (top.length > 1 || assigned)
    return refuse(
      `\`--set ${name}=…\`: "${name}" is ${assigned ? "reassigned" : "declared more than once"} at the top level, so one value cannot stand for it`,
      ["Bind one `let` per name, or compare two files with `--against old.arch`."],
      s.span,
    );
  if (s.value.t === "fnlit")
    return refuse(`\`--set ${name}=…\`: "${name}" is a value-function, not a number`, [], s.span);
  const span = s.span!;
  const text = source.slice(span.start, span.end);
  const eq = text.indexOf("=");
  const lead = text.slice(eq + 1).length - text.slice(eq + 1).trimStart().length;
  const start = span.start + eq + 1 + lead;
  const v = value.trim();
  return {
    ok: true,
    source: `${source.slice(0, start)}${v}${source.slice(span.end)}`,
    name,
    before: source.slice(start, span.end),
    after: v,
  };
}

/** The parse the override reads: the memoised parse, read and never mutated. */
function parseForOverride(source: string): { plan: PlanNode | null; diagnostics: Diagnostic[] } {
  const out = parse(source);
  const failed = out.diagnostics.some((d) => d.severity === "error");
  return { plan: failed ? null : (out.plan ?? null), diagnostics: out.diagnostics };
}
