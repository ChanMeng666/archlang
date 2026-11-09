/**
 * Expansion, the first stage of `resolve()`: a plan body (`let`, assignment, `set`, `for`/`if`/
 * `while`, component calls, `place`d instances, `strip`, `zone`, `keep`) flattened into the
 * element stream ({@link Entry}) the resolver works on, in fixed source order.
 *
 * Invariant: expansion is expand-time and pure. It reads the parse-stage AST and never mutates
 * it (a `strip` yields new room nodes), and every element it emits counts toward
 * {@link MAX_ELEMENTS}. Step meter (`MAX_EVAL_STEPS`, `src/expr.ts`): one step per statement
 * executed and per loop iteration, `DIAGNOSTIC_STEPS` per diagnostic raised, and one per binding
 * a {@link Scope} copies when it flattens, each charged before the work it pays for.
 */

import type { AstElement, ComponentDef, ElementKind, PlaceNode, RoomNode, Statement, StripNode } from "../ast.js";
import { moduleBindings } from "../import.js";
import { beforeRoomsReader } from "../room-datums.js";
import type { Frame } from "../frame.js";
import { composeFrame, makeFrame } from "../frame.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import type { Env, EnvFallback, Expr, Value } from "../expr.js";
import {
  asBool,
  asNum,
  atStackRoot,
  BUDGET_SUBSTITUTE,
  chargeSteps,
  closest,
  currentStepSite,
  DIAGNOSTIC_STEPS,
  enterStack,
  EXPAND_RESERVE,
  EXPAND_UNITS,
  evalExpr,
  exprSpan,
  firstOverflow,
  leaveStack,
  resetOverflowReports,
  setEnvFallback,
  stepSite,
  withDatumReader,
} from "../expr.js";
import { expandKeep, type KeepPlace, type KeepSink } from "../keep.js";
import type { RZone, ResolvedElement } from "./types.js";

/** Max component-instantiation nesting depth before bailing out. */
const MAX_DEPTH = 64;
/** Safety cap on `while` iterations (deterministic guard against runaway loops). */
const MAX_ITERATIONS = 10_000;
/**
 * Cap on the elements ONE resolution expands (the root plan plus every `place`d instance
 * and component call it contains; each storey is its own resolution, so it is per storey).
 * Every element statement and every room a `strip` yields counts one, however it got
 * there (loop body, component, `place`); `let`/`set`/control flow count none. Past it
 * `E_ELEMENT_LIMIT` is raised once and expansion stops, so a runaway `for`/`while` yields
 * a diagnostic instead of an out-of-memory crash.
 *
 * Measured curve (identical overlapping rooms, after the room-overlap fix; compile +
 * describe + lint; loaded machine, 4 GB heap):
 *   1k rooms 0.43 + 0.12 + 0.40 s, 73 MB;  2k 1.3 + 0.3 + 0.7 s, 91 MB;
 *   5k 11 + 1.8 + 2.4 s, 187 MB;  10k: compile alone > 300 s (killed).
 * The cost is superlinear (label relocation is quadratic in rooms sharing space), not
 * memory — so the cap sits where a runaway still finishes in seconds (~5x the bench plan).
 * The corpus maximum is ~130 per storey and the bench plan ~1004.
 */
export const MAX_ELEMENTS = 5_000;

/** An element flattened out of the body, paired with the env its exprs use. */
export interface Entry {
  node: AstElement;
  env: Env;
  id: string;
  /** True when `node.id` was author-declared (vs an assigned positional auto-id);
   *  copied onto the resolved wall/room as {@link RWall._idAuthored}/{@link RRoom._idAuthored}. */
  idAuthored?: boolean;
  /** Active `set` overrides for this element's kind, captured at expansion. */
  defaults?: ReadonlyMap<string, Value>;
  resolved?: ResolvedElement;
  /** True when this room was expanded from a `strip` block (it looks absolute in
   *  the AST, so the origin has to be remembered for `describe().freedom`). */
  fromStrip?: boolean;
  /** Dotted path of the innermost `zone` this element was written inside, copied onto
   *  the resolved element as {@link RBase._zone}. Absent outside every zone. */
  zone?: string;
  /**
   * The `place`d instance frame this element belongs to, or absent for the root plan
   * (which includes every LEGACY bare component call — those splice into the caller's
   * coordinate space by design and must stay byte-identical). Entries sharing a frame
   * share an object identity, which is what groups them into one sub-resolution.
   */
  frame?: Frame;
  /**
   * The `.arch` file this element's `node.span` is measured in, when it came in through
   * an `import`. Stamped onto every diagnostic the element raises as
   * {@link Diagnostic.file}. Absent = the compiled source.
   */
  file?: string;
}

/** Ambient state threaded down {@link expandScope} — everything a `place` needs. */
interface ExpandCtx {
  /** The frame in force (absent at the root). */
  frame?: Frame;
  /** The file the statements being expanded were written in (absent = compiled source). */
  file?: string;
  /** Grid snap, so a `place` origin lands on the module like every other coordinate. */
  snap(v: number): number;
  /** Instance paths already taken, so `as west` twice is an error, not a silent merge. */
  seenInstances: Set<string>;
  /**
   * `while` statements that ran at least one iteration in THIS expansion, keyed by
   * {@link whileSpanKey} — shared by reference across every recursive `expandScope` call
   * in one `resolveImpl`, so it ends up recording every `while` this compile actually
   * reached and entered, wherever it sits (plan level, a `for`/`if`/`zone` body, or a
   * component's — including one never instantiated here, whose body is simply never
   * visited). Read by `src/while-fix.ts`'s non-vacuity gate; never serialized (see
   * {@link ResolvedPlan._executedWhileSpans}).
   */
  executedWhiles: Set<string>;
  /** The element budget, shared BY REFERENCE across every recursive call (components,
   *  `place`d instances, loop bodies) of one resolution. See {@link MAX_ELEMENTS}. */
  budget: ElementBudget;
  /** Imported modules' plan-level `let`s, shared BY REFERENCE across one resolution. */
  modules: ModuleEnvs;
  /** The keeps one resolution expands (ADR 0033), shared BY REFERENCE across every call. */
  keeps: KeepSink;
  /** Where a `keep` met here stands: a component body refuses it (`E_KEEP_PLACEMENT`). */
  keepPlace: KeepPlace;
}

/**
 * The plan-level bindings of every imported module one resolution has needed so far (see
 * {@link moduleFallback}), keyed by the module's binding statements, plus the built-in
 * scope a module's own scope sits on (the same one the plan's sits on).
 */
interface ModuleEnvs {
  builtins: Scope;
  envs: Map<Statement[], Env>;
}

/**
 * The fallback an imported component's body looks a name up in when no parameter, no `let`
 * of its own, no root plan `let` and no built-in binds it: its own module's plan-level
 * `let`s (and value-functions), evaluated in the module's own scope — "the plan" a component
 * was written against is its module. Undefined for a component of the compiled source and
 * for one whose module binds nothing.
 *
 * Additive by construction: it is consulted only by a lookup that would otherwise report
 * `E_UNKNOWN_REF` / `E_UNKNOWN_FN` (`src/expr.ts`), so the root's `let` still wins over the
 * module's, and the importer's own statements — which carry no fallback — never see it.
 *
 * The module's binding statements (`moduleBindings`, `src/import.ts`: its top level less
 * everything that draws) run LAZILY, on the first such lookup and once per resolution,
 * through the same `expandScope` that runs them when the module is compiled or imported
 * whole: so each step is charged before its work, and a `let` that fails reports the same
 * catalogued diagnostic it does in the module, with the module's `file` and a span in it.
 * A module nobody looks into costs nothing and reports nothing.
 */
function moduleFallback(comp: ComponentDef, diagnostics: Diagnostic[], ectx: ExpandCtx): EnvFallback | undefined {
  const bindings = moduleBindings(comp);
  if (!bindings) return undefined;
  const { modules } = ectx;
  const file = comp.file;
  return (name) => {
    let env = modules.envs.get(bindings);
    if (env === undefined) {
      // The statement that looked the name up stays the site a step-budget crossing is
      // reported at once the module has run (a crossing INSIDE it names the module's `let`).
      const site = currentStepSite();
      const scope = new Scope(modules.builtins);
      // The module's `let`s are expansion, whoever looks a name up first: the first lookup
      // may come from an element expression in some instance's wall pass, where that
      // instance's datum table is being read, and the env is cached for every later caller.
      // So a datum in a module `let` always refuses (ADR 0028 §2), never reads a table.
      withDatumReader(beforeRoomsReader("expand"), () =>
        expandScope(
          bindings,
          scope,
          scope,
          new Map(),
          diagnostics,
          0,
          {
            ...(file !== undefined ? { file } : {}),
            snap: ectx.snap,
            seenInstances: new Set<string>(),
            executedWhiles: new Set<string>(),
            budget: { count: 0, capped: false },
            modules,
            keeps: { list: [], count: 0, limited: false },
            keepPlace: "component",
          },
          rootZoneFrame(),
        ),
      );
      env = scope.flatten();
      modules.envs.set(bindings, env);
      if (site) stepSite(site.span, site.file, site.frame);
    }
    return env.get(name);
  };
}

/** Elements counted so far in one resolution, and whether the cap was hit (sticky: once
 *  set, every loop and statement list stops expanding). */
export interface ElementBudget {
  count: number;
  capped: boolean;
}

/** The key {@link ExpandCtx.executedWhiles} records a `while` statement under — its own
 *  span, qualified by the file it was written in (absent = the compiled source), so two
 *  different files' statements at coincidentally equal offsets never collide. Exported so
 *  `src/while-fix.ts`'s non-vacuity gate computes the SAME key rather than a lookalike
 *  (a second copy of this formatting rule is exactly how the two would silently drift). */
export function whileSpanKey(stmt: { span?: Span }, file: string | undefined): string {
  return `${file ?? ""}\u0000${stmt.span?.start ?? -1}\u0000${stmt.span?.end ?? -1}`;
}

/**
 * The zone frame threaded through {@link expandScope}: which `zone` blocks are currently
 * open, and the ledger of every zone declared so far.
 *
 * This is the ONE place membership is decided, and it is decided lexically — an element
 * belongs to the zone whose braces it was written inside, full stop (ADR 0005: no spatial
 * inference). It is also the insertion point for any future construct that wants to stamp
 * an implicit frame onto the elements it expands (see the `instance` case below).
 */
interface ZoneFrame {
  /** Open zones, outermost first. Empty at plan level. */
  readonly path: readonly string[];
  /** Every zone declared so far, keyed by dotted path; first declaration wins. */
  readonly declared: Map<string, RZone>;
}

/** A fresh, empty zone frame (plan level, nothing declared). */
export const rootZoneFrame = (): ZoneFrame => ({ path: [], declared: new Map() });

/** `{ zone: "a.b" }`, or `{}` at plan level — spread onto an {@link Entry}. */
const zoneOf = (z: ZoneFrame): { zone?: string } => (z.path.length > 0 ? { zone: z.path.join(".") } : {});

/**
 * Open a nested zone named `id` on top of `frame`, recording the declaration the first
 * time that path is seen. This is the ONE way a zone segment is pushed: a `zone` block
 * uses it, and so does a `place`d instance — which is why an instance is a zone with no
 * second declaration and no duplicated bookkeeping. `label` is what the grouped schedule
 * and `describe().zones` print.
 */
function declareZone(frame: ZoneFrame, id: string, label?: string, instance = false): ZoneFrame {
  const path = [...frame.path, id];
  const key = path.join(".");
  // First declaration wins — a zone re-opened (by a loop, or written twice) merges its
  // members rather than declaring a second, identically-named group.
  if (!frame.declared.has(key)) {
    frame.declared.set(key, {
      id,
      path: key,
      ...(label !== undefined ? { label } : {}),
      // Spread, so a written `zone` carries no key at all and its IR is byte-identical.
      ...(instance ? { instance: true } : {}),
    });
  }
  return { path, declared: frame.declared };
}

/**
 * A lexical scope: its own bindings plus a link to the enclosing scope. `let`
 * declares in this scope (shadowing parents); assignment mutates the nearest
 * enclosing scope that owns the name; lookups walk up the chain. All of this is
 * expand-time and pure — there is no runtime.
 */
export class Scope {
  readonly vars = new Map<string, Value>();
  /** Active `set <kind>(…)` overrides declared in THIS scope. */
  readonly sets = new Map<ElementKind, ReadonlyMap<string, Value>>();
  /** Where a name no scope of the chain binds is looked up (an imported component's
   *  module `let`s, see {@link moduleFallback}); the nearest one in the chain applies. */
  fallback?: EnvFallback;
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
    let copied = 0;
    let fallback: EnvFallback | undefined;
    for (let s: Scope | undefined = this; s; s = s.parent) {
      chain.push(s);
      copied += s.vars.size;
      fallback ??= s.fallback;
    }
    // A binding copied is an evaluation step (`MAX_EVAL_STEPS`, `src/expr.ts`).
    chargeSteps(copied);
    for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of chain[i]!.vars) m.set(k, v);
    if (fallback) setEnvFallback(m, fallback);
    return m;
  }

  /** Merge `set` overrides for `kind` down the scope chain (child wins). */
  effectiveSet(kind: ElementKind): ReadonlyMap<string, Value> | undefined {
    let merged: Map<string, Value> | undefined;
    const chain: Scope[] = [];
    for (let s: Scope | undefined = this; s; s = s.parent) chain.push(s);
    for (let i = chain.length - 1; i >= 0; i--) {
      const m = chain[i]!.sets.get(kind);
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
export function expandScope(
  body: Statement[],
  scope: Scope,
  global: Scope,
  components: Map<string, ComponentDef>,
  diagnostics: Diagnostic[],
  depth: number,
  ectx: ExpandCtx,
  zone: ZoneFrame = rootZoneFrame(),
): Entry[] {
  // Every block and component body is one frame of a recursion the JS stack must hold.
  // `MAX_DEPTH` bounds component nesting and the parser bounds block nesting, but their PRODUCT
  // (64 components x 256 blocks) is not bounded by either, so the frames also draw on the
  // evaluator's shared stack budget; past it the body is not expanded (one diagnostic).
  if (!enterStack(EXPAND_UNITS, EXPAND_RESERVE)) {
    if (firstOverflow("expand")) {
      diagnostics.push(
        stampProvenance(
          {
            severity: "error",
            message: "Blocks and component instances are nested too deeply to expand; the innermost was skipped",
            code: "E_RECURSION",
            span: body[0]?.span,
          },
          ectx.frame,
          ectx.file,
        ),
      );
    }
    return [];
  }
  try {
    return expandScopeFrame(body, scope, global, components, diagnostics, depth, ectx, zone);
  } finally {
    leaveStack(EXPAND_UNITS);
  }
}

function expandScopeFrame(
  body: Statement[],
  scope: Scope,
  global: Scope,
  components: Map<string, ComponentDef>,
  diagnostics: Diagnostic[],
  depth: number,
  ectx: ExpandCtx,
  zone: ZoneFrame,
): Entry[] {
  // Every diagnostic raised while expanding THIS body inherits the body's provenance:
  // which file its spans are measured in, and which placed instance it belongs to.
  const diag = (d: Diagnostic) => {
    // A diagnostic is retained work: charged to the step budget, so a loop raising one per
    // iteration is stopped before its reports fill memory (`DIAGNOSTIC_STEPS`).
    chargeSteps(DIAGNOSTIC_STEPS);
    diagnostics.push(stampProvenance(d, ectx.frame, ectx.file));
  };
  const out: Entry[] = [];
  /** Element/statement entries carry the same provenance, for resolve-time diagnostics. */
  const prov = {
    ...(ectx.frame ? { frame: ectx.frame } : {}),
    ...(ectx.file !== undefined ? { file: ectx.file } : {}),
    ...zoneOf(zone),
  };
  /** Evaluate an expression against this scope's currently-visible bindings. */
  const evalIn = (e: Expr): Value => evalExpr(e, scope.flatten(), diag);

  /** Count one element toward the budget; false (after ONE E_ELEMENT_LIMIT at `at`) once
   *  the cap is crossed. */
  const spend = (at: { span?: Span }): boolean => {
    const b = ectx.budget;
    if (b.capped) return false;
    if (++b.count <= MAX_ELEMENTS) return true;
    b.capped = true;
    diag({
      severity: "error",
      message: `Plan expands to more than ${MAX_ELEMENTS} elements — expansion stopped (a loop that never ends, or far too many iterations?)`,
      code: "E_ELEMENT_LIMIT",
      ...(at.span ? { span: at.span } : {}),
    });
    return false;
  };

  for (const stmt of body) {
    if (ectx.budget.capped) break;
    // Each statement of the outermost body is an independent fault domain for the stack
    // budget's once-per-crossing report.
    if (atStackRoot()) resetOverflowReports();
    // A statement executed is an evaluation step, and the site a crossing is reported at
    // (`MAX_EVAL_STEPS`, `src/expr.ts`). A loop re-marks itself before each iteration, so
    // a crossing on an iteration names the loop, not the last statement of its body.
    stepSite(stmt.span, ectx.file, ectx.frame);
    chargeSteps(1);
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
        // Component scope = plan global + params; its lets are local. An imported
        // component falls back to its own module's `let`s.
        const childScope = new Scope(global);
        comp.params.forEach((p, i) => {
          childScope.vars.set(p, argVals[i]!);
        });
        childScope.fallback = moduleFallback(comp, diagnostics, ectx);
        // A LEGACY bare call is TRANSPARENT to zones as it is to coordinates and ids: it
        // splices its body into the caller verbatim, so it pushes no zone segment. Only
        // its statements' spans differ — they belong to the file the component was
        // WRITTEN in, which is what the `file` swap records.
        out.push(
          ...expandScope(
            comp.body,
            childScope,
            global,
            comp.scope ?? components,
            diagnostics,
            depth + 1,
            {
              ...ectx,
              ...(comp.file !== undefined ? { file: comp.file } : { file: undefined }),
              keepPlace: "component",
            },
            zone,
          ),
        );
        break;
      }
      case "place": {
        const child = placeFrame(stmt, evalIn, diag, components, ectx, depth);
        if (!child) break;
        const comp = components.get(stmt.name)!;
        const argVals: Value[] = comp.params.map((_, i) =>
          stmt.args[i] !== undefined ? evalIn(stmt.args[i]) : { t: "num", v: 0 },
        );
        const childScope = new Scope(global);
        comp.params.forEach((p, i) => {
          childScope.vars.set(p, argVals[i]!);
        });
        childScope.fallback = moduleFallback(comp, diagnostics, ectx);
        // **A `place`d instance IS a zone.** `as west` already names an addressable group
        // of elements with its own id namespace, which is exactly what a `zone` block
        // declares — so the instance pushes its own segment onto the zone frame and every
        // element the component expands inherits membership through the identical
        // mechanism a hand-written `zone` uses. Composing by wing therefore GIVES you the
        // grouping: `describe().zones`, the grouped room schedule and `describe --zone
        // west` all work with no second declaration. (A bare call pushes nothing — it is
        // a macro, not a thing.) An explicit `zone` around a `place` still nests, so the
        // instance's path is `<outer>.<instance>`.
        out.push(
          ...expandScope(
            comp.body,
            childScope,
            global,
            comp.scope ?? components,
            diagnostics,
            depth + 1,
            {
              frame: child,
              ...(comp.file !== undefined ? { file: comp.file } : { file: undefined }),
              snap: ectx.snap,
              seenInstances: ectx.seenInstances,
              executedWhiles: ectx.executedWhiles,
              budget: ectx.budget,
              modules: ectx.modules,
              keeps: ectx.keeps,
              keepPlace: "component",
            },
            // No label: the instance NAME is already the heading a reader wants, and
            // inventing one ("wing instance") would print the same text for every
            // instance of a component. `describe().instances` says which component.
            // Marked `instance` so a TABLE does not group by it (see `RZone.instance`).
            declareZone(zone, stmt.alias, undefined, true),
          ),
        );
        break;
      }
      case "for": {
        const it = evalIn(stmt.iter);
        if (it === BUDGET_SUBSTITUTE) break; // already diagnosed by the stack budget
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
          if (ectx.budget.capped) break;
          stepSite(stmt.span, ectx.file, ectx.frame);
          chargeSteps(1);
          const child = new Scope(scope);
          child.vars.set(stmt.varName, item);
          out.push(...expandScope(stmt.body, child, global, components, diagnostics, depth, ectx, zone));
        }
        break;
      }
      case "if": {
        const cond = asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond));
        const branch = cond ? stmt.then : stmt.else;
        if (branch) {
          out.push(...expandScope(branch, new Scope(scope), global, components, diagnostics, depth, ectx, zone));
        }
        break;
      }
      case "while": {
        let n = 0;
        while (!ectx.budget.capped) {
          // Each test of the condition starts an iteration (one step, at the loop).
          stepSite(stmt.span, ectx.file, ectx.frame);
          chargeSteps(1);
          if (!asBool(evalIn(stmt.cond), diag, exprSpan(stmt.cond))) break;
          if (n++ >= MAX_ITERATIONS) {
            diag({
              severity: "error",
              message: `"while" exceeded ${MAX_ITERATIONS} iterations (possible infinite loop)`,
              code: "E_WHILE_LIMIT",
              span: stmt.span,
            });
            break;
          }
          out.push(...expandScope(stmt.body, new Scope(scope), global, components, diagnostics, depth, ectx, zone));
          // Recorded on every completed iteration, not just the first — a Set, so it
          // costs nothing beyond the first — because this only needs to answer "did it
          // run >= 1 time", which is exactly what reaching here at all proves.
          ectx.executedWhiles.add(whileSpanKey(stmt, ectx.file));
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
      case "strip": {
        // Expand the strip into ordinary absolute-placed room entries. Positions
        // are closed-form (running sum of extents + gap); the resulting rooms flow
        // through room.resolve exactly like hand-authored `room at (x,y) size WxH`.
        for (const child of stripRooms(stmt, evalIn, diag)) {
          if (!spend(stmt)) break;
          out.push({
            node: child,
            env: scope.flatten(),
            id: "",
            defaults: scope.effectiveSet("room"),
            fromStrip: true,
            ...prov,
          });
        }
        break;
      }
      case "zone": {
        // A PURE metadata wrapper: no new scope, no new depth, no expansion of its own.
        // The body is expanded against the *same* Scope, so a `let`/`set` written inside a
        // zone behaves exactly as it would with the braces deleted — that is what makes
        // the byte-identity law (`test/zones.test.ts`) total rather than approximate.
        out.push(
          ...expandScope(
            stmt.body,
            scope,
            global,
            components,
            diagnostics,
            depth,
            ectx,
            declareZone(zone, stmt.id, stmt.label),
          ),
        );
        break;
      }
      case "keep":
        // A declared invariant (ADR 0033): its values are evaluated here, in this scope, and the
        // record is measured once the storey has resolved. It yields no element.
        expandKeep(stmt, ectx.keepPlace, (e) => keepValueOf(e, () => scope.flatten(), diag), diag, ectx.keeps);
        break;
      case "error":
        // A statement that failed to parse — already reported as a diagnostic at
        // parse time. It carries no geometry, so there is nothing to expand.
        break;
      case "level":
        // Storeys are partitioned OUT of the body before a level is resolved (see
        // `levelPlanFor`), so one can only reach here if a caller resolved a multi-storey
        // AST through the single-plan path. Skip it rather than treat it as an element:
        // the levels are drawn by `resolveAll`, and `E_LEVEL_MIX` already covers the
        // shape. Never a silent geometry change.
        break;
      default:
        // An element: snapshot the scope's visible bindings + active set-defaults.
        if (!spend(stmt)) break;
        out.push({ node: stmt, env: scope.flatten(), id: "", defaults: scope.effectiveSet(stmt.kind), ...prov });
    }
  }
  return out;
}

/**
 * A keep's value (`<mm>`, a level), or `undefined` when evaluating it raised a diagnostic: that
 * report stands, and the keep is dropped rather than measured against the substitute value the
 * evaluator returns (ADR 0033).
 */
export function keepValueOf(e: Expr, env: () => Env, diag: (d: Diagnostic) => void): number | undefined {
  let raised = false;
  const report = (d: Diagnostic): void => {
    raised = true;
    diag(d);
  };
  const v = asNum(evalExpr(e, env(), report), report, exprSpan(e));
  return raised ? undefined : v;
}

/**
 * Stamp a diagnostic with the provenance of the statement that raised it: which FILE its
 * `span` (and every fix edit derived from it) is measured in, and which placed INSTANCE
 * it belongs to.
 *
 * Both are append-only fields, and both are absent for the root plan of the compiled
 * source — so a plan with no `place` and no `import` gets byte-identical diagnostics.
 *
 * The `file` stamp also travels onto `fixes[].file`, which is what stops `arch fix` from
 * splicing an imported component's edit into the importing file (before this existed it
 * did exactly that, corrupting the importer). When the `place` itself is in the compiled
 * source, a related span points at it, so a reader always has one location it can render.
 */
export function stampProvenance(d: Diagnostic, frame: Frame | undefined, file: string | undefined): Diagnostic {
  if (!frame && file === undefined) return d;
  const out: Diagnostic = { ...d };
  if (file !== undefined) {
    out.file = file;
    if (d.fixes) out.fixes = d.fixes.map((f) => ({ ...f, file }));
  }
  if (frame) {
    out.instance = frame.prefix;
    out.component = frame.component;
    // A related span is rendered against the COMPILED source, so only offer one when the
    // `place` statement actually lives there.
    if (frame.span && frame.file === undefined) {
      out.relatedSpans = [
        ...(d.relatedSpans ?? []),
        { span: frame.span, message: `in instance "${frame.prefix}" placed here` },
      ];
    }
  }
  return out;
}

/**
 * Validate one `place` statement and build the frame its body expands in, or return
 * `null` (after a catalogued diagnostic) when it cannot be placed.
 *
 * The origin is evaluated in the CALLER's scope and grid-snapped exactly like any other
 * coordinate, then composed with the caller's own frame — which is what makes a `place`
 * inside a placed component body work (the frames simply multiply).
 */
function placeFrame(
  stmt: PlaceNode,
  evalIn: (e: Expr) => Value,
  diag: (d: Diagnostic) => void,
  components: Map<string, ComponentDef>,
  ectx: ExpandCtx,
  depth: number,
): Frame | null {
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
    return null;
  }
  if (depth >= MAX_DEPTH) {
    diag({
      severity: "error",
      message: `Component recursion too deep (limit ${MAX_DEPTH}) placing "${stmt.name}"`,
      code: "E_RECURSION",
      span: stmt.span,
    });
    return null;
  }
  if (stmt.args.length !== comp.params.length) {
    diag({
      severity: "error",
      message: `Component "${stmt.name}" expects ${comp.params.length} argument(s) but got ${stmt.args.length}`,
      code: "E_ARGCOUNT",
      span: stmt.span,
    });
  }
  const path = ectx.frame?.prefix ? `${ectx.frame.prefix}.${stmt.alias}` : stmt.alias;
  if (ectx.seenInstances.has(path)) {
    diag({
      severity: "error",
      message: `Instance name "${path}" is already used — every \`place … as <name>\` must be unique (it is the id namespace)`,
      code: "E_DUP_INSTANCE",
      span: stmt.aliasSpan ?? stmt.span,
    });
    return null;
  }
  ectx.seenInstances.add(path);
  const num = (e: Expr): number => ectx.snap(asNum(evalIn(e), diag, exprSpan(e)));
  const local = makeFrame({
    origin: { x: num(stmt.at.x), y: num(stmt.at.y) },
    ...(stmt.rotate !== undefined ? { rotate: stmt.rotate } : {}),
    ...(stmt.mirror ? { mirror: stmt.mirror } : {}),
    prefix: path,
    component: stmt.name,
    ...(stmt.span ? { span: stmt.span } : {}),
    ...(ectx.file !== undefined ? { file: ectx.file } : {}),
  });
  return ectx.frame ? { ...composeFrame(ectx.frame, local), parent: ectx.frame, local } : local;
}

/**
 * Lower a `strip` block to a list of absolute-placed {@link RoomNode}s. The k-th
 * room's main-axis offset is the running sum of previous extents plus `gap`; the
 * cross axis is the strip origin, and the cross dimension is the strip's shared
 * `height`/`width` (overridable per room). Deterministic pure arithmetic — the
 * emitted rooms are byte-identical to hand-authored `room at (x,y) size WxH`.
 */
function stripRooms(strip: StripNode, evalIn: (e: Expr) => Value, diag: (d: Diagnostic) => void): RoomNode[] {
  const num = (e: Expr): number => asNum(evalIn(e), diag, exprSpan(e));
  const numE = (v: number): Expr => ({ t: "num", value: v });
  const originX = num(strip.at.x);
  const originY = num(strip.at.y);
  const gap = num(strip.gap);
  const horiz = strip.dir === "right" || strip.dir === "left";
  const stripCross = strip.cross !== undefined ? num(strip.cross) : undefined;
  const rooms: RoomNode[] = [];
  let offset = 0;
  for (const child of strip.rooms) {
    const mainExt = num(child.main);
    const crossExt = child.cross !== undefined ? num(child.cross) : stripCross;
    if (crossExt === undefined) {
      diag({
        severity: "error",
        message: `Room "${child.id || "(unnamed)"}" in a strip needs a cross-axis size — give the strip a \`${horiz ? "height" : "width"}\`, or the room its own \`size <main>x<cross>\``,
        code: "E_STRIP_SIZE",
        span: child.span,
      });
      continue;
    }
    let atx: number;
    let aty: number;
    let w: number;
    let h: number;
    if (horiz) {
      w = mainExt;
      h = crossExt;
      aty = originY;
      atx = strip.dir === "right" ? originX + offset : originX - offset - mainExt;
    } else {
      h = mainExt;
      w = crossExt;
      atx = originX;
      aty = strip.dir === "down" ? originY + offset : originY - offset - mainExt;
    }
    rooms.push({
      kind: "room",
      id: child.id,
      at: { x: numE(atx), y: numE(aty) },
      size: { w: numE(w), h: numE(h) },
      ...(child.label !== undefined ? { label: child.label } : {}),
      ...(child.uses ? { uses: child.uses } : {}),
      ...(child.floor ? { floor: child.floor } : {}),
      line: child.line,
      span: child.span,
    });
    offset += mainExt + gap;
  }
  return rooms;
}
