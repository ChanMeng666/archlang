/**
 * Read-only navigation over the parsed AST (a `LinkedNode`-style cursor).
 *
 * Given a byte offset it finds the innermost span-bearing node covering it
 * (statement, component, and/or expression) plus the enclosing statement path;
 * it also walks every statement / expression for whole-document passes (rename,
 * reference search). Pure and zero-dependency — reuses the `span` fields the
 * parser already records and {@link exprSpan}. Consumed by the LSP (T5.3) and
 * `explain` (T5.5). Borrows Typst `typst-syntax`'s `LinkedNode` cursor idea.
 */

import type { ComponentDef, ExprPoint, OpeningAttach, PlanNode, Statement } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { exprSpan } from "./expr.js";

/** Inclusive containment: `offset` lies within `[span.start, span.end]`. */
function inSpan(span: Span | undefined, offset: number): boolean {
  return span !== undefined && offset >= span.start && offset <= span.end;
}

/** Anything `statementExprs`' per-kind handlers can push an `Expr` onto — a real
 *  `Expr[]` satisfies this (its own `push` is strictly more capable), so no
 *  wrapper allocation is needed at the call site. */
type ExprSink = { push(...es: Expr[]): void };

const pt = (out: ExprSink, p: ExprPoint | undefined): void => {
  if (p) out.push(p.x, p.y);
};

/** A door/window/opening's leading placement: `on <wall> at <pos>` contributes its
 *  (expression) position; `at (x,y)` contributes the point. */
const openingLead = (out: ExprSink, s: { at?: ExprPoint; attach?: OpeningAttach }): void => {
  if (s.attach) {
    if (s.attach.pos.value !== undefined) out.push(s.attach.pos.value);
  } else {
    pt(out, s.at);
  }
};

/**
 * One `Expr`-collecting handler per {@link Statement} kind, keyed by `kind` so adding
 * a new statement kind fails typecheck here until it is handled — the switch this
 * replaced had no such guarantee (silently reachable with no case, as `opening` and
 * `level` both were: `opening`'s attach position and width were invisible to the LSP,
 * and `level`'s `height` binding could not be renamed).
 *
 * Each handler lists every {@link Expr}-typed field the AST holds for that kind
 * (verified against `src/ast.ts`), never a subset convenient for the first caller —
 * this is also what `eachExpr`/`eachStatement`/the LSP rename walk see, so a field
 * missing here is a use `arch lsp rename` silently drops.
 */
const STATEMENT_EXPRS: { [K in Statement["kind"]]: (s: Extract<Statement, { kind: K }>, out: ExprSink) => void } = {
  wall: (s, out) => {
    out.push(s.thickness);
    if (s.materialScale !== undefined) out.push(s.materialScale);
    if (s.materialAngle !== undefined) out.push(s.materialAngle);
    for (const arc of s.arcs ?? []) if (arc) out.push(arc.radius);
    if (s.height !== undefined) out.push(s.height);
    for (const p of s.points) pt(out, p);
  },
  room: (s, out) => {
    pt(out, s.at);
    for (const p of s.polygon ?? []) pt(out, p);
    if (s.circle) {
      pt(out, s.circle.c);
      out.push(s.circle.r);
    }
    if (s.size) out.push(s.size.w, s.size.h);
    if (s.rel?.gap !== undefined) out.push(s.rel.gap);
    if (s.label) out.push(s.label);
    pt(out, s.labelAt);
  },
  door: (s, out) => {
    openingLead(out, s);
    out.push(s.width);
    if (s.open !== undefined) out.push(s.open);
    if (s.head !== undefined) out.push(s.head);
  },
  window: (s, out) => {
    openingLead(out, s);
    out.push(s.width);
    if (s.sill !== undefined) out.push(s.sill);
    if (s.head !== undefined) out.push(s.head);
  },
  opening: (s, out) => {
    openingLead(out, s);
    out.push(s.width);
    if (s.head !== undefined) out.push(s.head);
  },
  furniture: (s, out) => {
    pt(out, s.at);
    if (s.against) {
      if (s.against.segment !== undefined) out.push(s.against.segment);
      if (s.against.offset !== undefined) out.push(s.against.offset);
    }
    if (s.place?.mode === "anchor" && s.place.inset !== undefined) out.push(s.place.inset);
    if (s.size) out.push(s.size.w, s.size.h);
    if (s.label) out.push(s.label);
    if (s.rotate !== undefined) out.push(s.rotate);
  },
  dim: (s, out) => {
    pt(out, s.from);
    pt(out, s.to);
    out.push(s.offset);
    if (s.text) out.push(s.text);
    if (s.curve?.segment !== undefined) out.push(s.curve.segment);
  },
  column: (s, out) => {
    pt(out, s.at);
    out.push(s.size.w, s.size.h);
  },
  stair: (s, out) => {
    pt(out, s.at);
    out.push(s.size.w, s.size.h);
    if (s.width !== undefined) out.push(s.width);
  },
  elevator: (s, out) => {
    pt(out, s.at);
    out.push(s.size.w, s.size.h);
  },
  escalator: (s, out) => {
    pt(out, s.at);
    out.push(s.size.w, s.size.h);
  },
  roof: (s, out) => {
    // Exactly one of the two spellings is present; the `wall` clause is an id, not an
    // expression, so it contributes nothing here.
    if (s.overhang) out.push(s.overhang);
    for (const p of s.polygon ?? []) pt(out, p);
  },
  void: (s, out) => {
    pt(out, s.at);
    out.push(s.size.w, s.size.h);
  },
  outdoor: (s, out) => {
    // Exactly one of the two spellings is present. `surface` and the `rail` edges are
    // closed-vocabulary WORDS, not expressions, so neither contributes here.
    pt(out, s.at);
    if (s.size) out.push(s.size.w, s.size.h);
    for (const p of s.polygon ?? []) pt(out, p);
    if (s.label) out.push(s.label);
  },
  fence: (s, out) => {
    for (const p of s.points) pt(out, p);
  },
  strip: (s, out) => {
    pt(out, s.at);
    out.push(s.gap);
    if (s.cross !== undefined) out.push(s.cross);
    for (const r of s.rooms) {
      out.push(r.main);
      if (r.cross !== undefined) out.push(r.cross);
      if (r.label) out.push(r.label);
    }
  },
  let: (s, out) => out.push(s.value),
  assign: (s, out) => out.push(s.value),
  instance: (s, out) => out.push(...s.args),
  place: (s, out) => {
    out.push(...s.args);
    pt(out, s.at);
  },
  for: (s, out) => out.push(s.iter),
  if: (s, out) => out.push(s.cond),
  while: (s, out) => out.push(s.cond),
  set: (s, out) => {
    for (const o of s.over) out.push(o.value);
  },
  level: (s, out) => {
    if (s.height !== undefined) out.push(s.height);
  },
  zone: () => {
    // A zone is a pure lexical/metadata wrapper (label is a string, not an Expr) —
    // no expression of its own; its body is walked separately (`statementBodies`).
  },
  error: () => {
    // A parse failure carries no evaluable expression.
  },
};

/** The expression-bearing fields of a statement, in source order. */
export function statementExprs(s: Statement): Expr[] {
  const out: Expr[] = [];
  const handler = STATEMENT_EXPRS[s.kind] as (s: Statement, out: ExprSink) => void;
  handler(s, out);
  return out;
}

/** The nested statement blocks of a control-flow statement (empty otherwise). */
export function statementBodies(s: Statement): Statement[][] {
  switch (s.kind) {
    case "for":
    case "while":
    // A `level` block's body is an ordinary statement list, so every walker built on
    // this helper (the cursor, `eachStatement`, `eachExpr`, and therefore the LSP) sees
    // inside a storey exactly as it sees inside a loop.
    case "level":
    // A `zone` block is a pure metadata wrapper around an ordinary statement list, so
    // every walker must see straight through it — a cursor inside a zoned room still
    // resolves to that room, and `eachStatement` still reaches it.
    case "zone":
      return [s.body];
    case "if":
      return s.else ? [s.then, s.else] : [s.then];
    default:
      return [];
  }
}

/** The sub-expressions of an expression, in source order. */
export function exprChildren(e: Expr): Expr[] {
  switch (e.t) {
    case "str":
      return e.parts.filter((p): p is Expr => typeof p !== "string");
    case "arr":
      return e.items;
    case "unary":
      return [e.e];
    case "bin":
      return [e.l, e.r];
    case "range":
      return [e.lo, e.hi];
    case "index":
      return [e.base, e.idx];
    case "call":
      return e.args;
    case "fnlit":
      return [e.body];
    case "if":
      return [e.cond, e.then, e.else];
    default:
      return [];
  }
}

/** The innermost span-bearing expression at `offset`, searching children first. */
function deepestExpr(e: Expr, offset: number): Expr | undefined {
  for (const c of exprChildren(e)) {
    const hit = deepestExpr(c, offset);
    if (hit) return hit;
  }
  return inSpan(exprSpan(e), offset) ? e : undefined;
}

/** What the cursor found at a byte offset. */
export interface CursorHit {
  /** The innermost statement enclosing the offset (may be an `error` node). */
  stmt?: Statement;
  /** The component definition enclosing the offset, if the offset is in one. */
  component?: ComponentDef;
  /** The innermost expression at the offset (e.g. a `ref`), if any. */
  expr?: Expr;
  /** Enclosing statements, outermost-first. */
  path: Statement[];
}

/** Locate the innermost AST node covering `offset`. */
export function nodeAt(plan: PlanNode, offset: number): CursorHit {
  const path: Statement[] = [];
  let stmt: Statement | undefined;
  let expr: Expr | undefined;

  const visitBody = (body: Statement[]): void => {
    for (const s of body) {
      if (!inSpan(s.span, offset)) continue;
      stmt = s;
      path.push(s);
      for (const e of statementExprs(s)) {
        const hit = deepestExpr(e, offset);
        if (hit) expr = hit;
      }
      for (const b of statementBodies(s)) visitBody(b);
    }
  };

  visitBody(plan.body);
  let component: ComponentDef | undefined;
  for (const c of plan.components.values()) {
    if (inSpan(c.span, offset)) {
      component = c;
      visitBody(c.body);
    }
  }
  return { stmt, component, expr, path };
}

/** Visit every statement in the plan and its component bodies (depth-first). */
export function eachStatement(plan: PlanNode, visit: (s: Statement) => void): void {
  const go = (body: Statement[]): void => {
    for (const s of body) {
      visit(s);
      for (const b of statementBodies(s)) go(b);
    }
  };
  go(plan.body);
  for (const c of plan.components.values()) go(c.body);
}

/** Visit every expression (and sub-expression) in the plan, INCLUDING the plan-level
 *  settings (`height`, `axes { … }`, `site { … boundary … }`) that carry one — none
 *  of these are a statement, so `statementExprs` cannot see them. */
export function eachExpr(plan: PlanNode, visit: (e: Expr) => void): void {
  const goExpr = (e: Expr): void => {
    visit(e);
    for (const c of exprChildren(e)) goExpr(c);
  };
  if (plan.height !== undefined) goExpr(plan.height);
  if (plan.axes) {
    for (const e of plan.axes.x) goExpr(e);
    for (const e of plan.axes.y) goExpr(e);
  }
  if (plan.site?.boundary) {
    for (const p of plan.site.boundary) {
      goExpr(p.x);
      goExpr(p.y);
    }
  }
  eachStatement(plan, (s) => {
    for (const e of statementExprs(s)) goExpr(e);
  });
}
