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

import type { ComponentDef, ExprPoint, PlanNode, Statement } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { exprSpan } from "./expr.js";

/** Inclusive containment: `offset` lies within `[span.start, span.end]`. */
function inSpan(span: Span | undefined, offset: number): boolean {
  return span !== undefined && offset >= span.start && offset <= span.end;
}

/** The expression-bearing fields of a statement, in source order. */
export function statementExprs(s: Statement): Expr[] {
  const out: Expr[] = [];
  const pt = (p: ExprPoint | undefined): void => {
    if (p) out.push(p.x, p.y);
  };
  switch (s.kind) {
    case "wall":
      out.push(s.thickness);
      if (s.materialScale) out.push(s.materialScale);
      if (s.materialAngle) out.push(s.materialAngle);
      for (const p of s.points) pt(p);
      break;
    case "room":
      pt(s.at);
      out.push(s.size.w, s.size.h);
      if (s.label) out.push(s.label);
      break;
    case "door":
    case "window":
      pt(s.at);
      out.push(s.width);
      break;
    case "furniture":
      pt(s.at);
      if (s.size) out.push(s.size.w, s.size.h);
      if (s.label) out.push(s.label);
      break;
    case "dim":
      pt(s.from);
      pt(s.to);
      out.push(s.offset);
      if (s.text) out.push(s.text);
      break;
    case "column":
      pt(s.at);
      out.push(s.size.w, s.size.h);
      break;
    case "strip":
      pt(s.at);
      out.push(s.gap);
      if (s.cross) out.push(s.cross);
      for (const r of s.rooms) {
        out.push(r.main);
        if (r.cross) out.push(r.cross);
        if (r.label) out.push(r.label);
      }
      break;
    case "let":
    case "assign":
      out.push(s.value);
      break;
    case "instance":
      out.push(...s.args);
      break;
    case "for":
      out.push(s.iter);
      break;
    case "if":
    case "while":
      out.push(s.cond);
      break;
    case "set":
      for (const o of s.over) out.push(o.value);
      break;
    case "error":
      break;
  }
  return out;
}

/** The nested statement blocks of a control-flow statement (empty otherwise). */
export function statementBodies(s: Statement): Statement[][] {
  switch (s.kind) {
    case "for":
    case "while":
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

/** Visit every expression (and sub-expression) in the plan. */
export function eachExpr(plan: PlanNode, visit: (e: Expr) => void): void {
  const goExpr = (e: Expr): void => {
    visit(e);
    for (const c of exprChildren(e)) goExpr(c);
  };
  eachStatement(plan, (s) => {
    for (const e of statementExprs(s)) goExpr(e);
  });
}
