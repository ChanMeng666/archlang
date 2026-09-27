/**
 * `cursor.ts`'s `statementExprs` is a compiler-enforced mapped type (`STATEMENT_EXPRS`):
 * adding a `Statement` kind now fails typecheck until it is handled. That guarantees
 * every KIND has a handler; it says nothing about whether a handler lists every FIELD
 * the AST actually holds for that kind — which is exactly how `opening` went unhandled
 * and `furniture`'s `against`/`place` clauses, a door's `open`, a wall's `arc radius`s
 * and a `level`'s `height` went missing before this task, each silently invisible to
 * `eachExpr` and so to LSP rename/references.
 *
 * This file closes THAT gap with an independent oracle: a reflective walk of a
 * statement's own object tree (recursing into every plain object/array field, treating
 * anything shaped like an {@link Expr} as a leaf, and refusing to descend into a NESTED
 * statement body — `body`/`then`/`else`, the same boundary `statementExprs` itself
 * draws) must find exactly the same set of `Expr` objects, BY REFERENCE, as
 * `statementExprs(s)` returns. A field the mapped-type handler forgets shows up here as
 * an `Expr` the reflective walk found that `statementExprs` did not return.
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parse } from "../src/parser.js";
import { eachStatement, statementExprs } from "../src/cursor.js";
import type { Statement } from "../src/ast.js";
import type { Expr } from "../src/expr.js";
import { archPlan } from "./arbitrary-plan.js";

// `Expr`'s own discriminant (`src/expr.ts`) — a type union, so there is no runtime
// table to derive this from; it is exhaustively listed there via a switch with no
// `default`, which is the same guarantee this list leans on.
const EXPR_TAGS = new Set([
  "num",
  "bool",
  "str",
  "arr",
  "ref",
  "unary",
  "bin",
  "range",
  "index",
  "call",
  "fnlit",
  "if",
]);

function isExprLike(v: unknown): v is Expr {
  return (
    typeof v === "object" &&
    v !== null &&
    "t" in v &&
    typeof (v as { t: unknown }).t === "string" &&
    EXPR_TAGS.has((v as { t: string }).t)
  );
}

/** The nested-statement-list field names — the ONE boundary `statementExprs` itself
 *  draws (a nested statement's own fields are that statement's business, reached
 *  separately by `statementBodies`/`eachStatement`). Every other field is fair game. */
const BODY_FIELDS = new Set(["body", "then", "else"]);

/** Reflectively collect every `Expr`-shaped object directly reachable from `node`,
 *  stopping at each one found (an `Expr`'s own children are `exprChildren`'s job, not
 *  `statementExprs`'s) and never crossing into a nested statement body. */
function reflectiveExprs(node: unknown, out: Expr[]): void {
  if (node === null || typeof node !== "object") return;
  if (isExprLike(node)) {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) reflectiveExprs(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (BODY_FIELDS.has(key)) continue;
    reflectiveExprs(value, out);
  }
}

/**
 * Assert `statementExprs(s)` is exactly the reflective set, by object identity — a SET
 * comparison, not a multiset one: a `dim radius|diameter` call-out's `from`/`to` are, by
 * construction (`elements/dim.ts`'s parser), the SAME placeholder `ExprPoint` object, so
 * both the reflective walk and `statementExprs` visit its `x`/`y` twice over. That is a
 * pre-existing AST-sharing quirk orthogonal to what this walk checks (field COVERAGE),
 * so it is tolerated here rather than asserted against.
 */
function checkStatement(s: Statement): void {
  const reflective: Expr[] = [];
  reflectiveExprs(s, reflective);
  const declared = statementExprs(s);

  const reflectiveSet = new Set(reflective);
  const declaredSet = new Set(declared);
  for (const e of declared) {
    expect(reflectiveSet.has(e), `statementExprs("${s.kind}") returned an Expr not reachable on the node`).toBe(true);
  }
  for (const e of reflective) {
    expect(declaredSet.has(e), `statementExprs("${s.kind}") is missing a field the AST holds`).toBe(true);
  }
}

function checkSource(src: string): void {
  const { plan } = parse(src);
  expect(plan, "fixture failed to parse").toBeTruthy();
  // `eachStatement` already walks every component body, not just the plan body.
  eachStatement(plan!, checkStatement);
}

const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));
const LIBS = readdirSync("examples/lib")
  .filter((f) => f.endsWith(".arch"))
  .map((f) => `lib/${f}`);
const ALL = [...EXAMPLES, ...LIBS];
const readExample = (name: string): string => readFileSync(`examples/${name}`, "utf8");

describe("cursor.ts — statementExprs matches a reflective AST walk", () => {
  for (const name of ALL) {
    it(`every Expr field of every statement in ${name} is exactly what statementExprs sees`, () => {
      checkSource(readExample(name));
    });
  }

  it("also holds over fc.sample(archPlan) — wall/room/door/window/opening/furniture/dim/column", () => {
    for (const src of fc.sample(archPlan, { numRuns: 200, seed: 20260927 })) checkSource(src);
  });
});
