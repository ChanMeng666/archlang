/**
 * W7's machine-applicable fix: `let I = A; while I < B { …; I = I + 1 }` rewritten to
 * `for I in A..B { … }`.
 *
 * A red-team review of the first cut (attaching this fix straight from the syntactic
 * shape check, at parse time) found it unsound: ArchLang scoping is not local to one
 * statement list — a component called from BODY can read or write the loop counter, a
 * `zone` is scope-transparent, the loop can already be at its 10,000-iteration cap (where
 * `while` refuses but `for`'s 100,000-item cap would not), and a body containing a
 * recovered parse `error` node silently DELETED that token when reprinted. None of that
 * is visible to a check that only looks at the `while`/`let` statements themselves.
 *
 * So this module supplies only the CHEAP PRE-FILTER — {@link canonicalShapeAt} decides
 * whether the syntactic shape matches at all, purely from the AST, and
 * {@link buildCandidateEdit} renders the candidate text. Neither attaches a fix. The
 * actual proof — compile the candidate, and check it behaves identically — is
 * `src/index.ts`'s job, because only the full `compile()` pipeline has the resolved
 * scoping, the rendered SVG and `describe()`/`lint()` to compare against.
 */

import type { AssignNode, LetNode, PlanNode, Statement, WhileNode } from "./ast.js";
import type { FixEdit } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { exprToSource } from "./expr-source.js";
import { printDoc } from "./doc.js";
import { statementText, type LeafStatement } from "./statement-print.js";

/** Deep structural search: does `node` (an AST subtree, arbitrarily nested) contain a
 *  `{ t: "ref", name }` referencing `name`? Generic over every statement/expr shape, so it
 *  needs no update when a new element or expression form is added. */
export function referencesName(node: unknown, name: string): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((n) => referencesName(n, name));
  const obj = node as Record<string, unknown>;
  if (obj.t === "ref" && obj.name === name) return true;
  for (const k in obj) {
    if (Object.hasOwn(obj, k) && referencesName(obj[k], name)) return true;
  }
  return false;
}

/** Deep structural collection of every `assign`-kind statement reachable from `node`
 *  (arbitrarily nested through `if`/`for`/`while`/`zone` bodies, INCLUDING a called
 *  component's own body is deliberately NOT reached here — this is a syntactic
 *  pre-filter over one statement list's own text; a component call's effects are
 *  exactly the kind of thing only the compile-and-compare proof can see). */
function collectAssigns(node: unknown, out: AssignNode[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectAssigns(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.kind === "assign") out.push(obj as unknown as AssignNode);
  for (const k in obj) {
    if (Object.hasOwn(obj, k)) collectAssigns(obj[k], out);
  }
}

/** Deep structural search for a recovered parse `error` node anywhere in `node` — the
 *  fix must never reprint a `.arch` region the parser could not read (B2: reprinting an
 *  `error` node loses the source bytes it recovered around). */
export function containsErrorNode(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(containsErrorNode);
  const obj = node as Record<string, unknown>;
  if (obj.kind === "error") return true;
  for (const k in obj) {
    if (Object.hasOwn(obj, k) && containsErrorNode(obj[k])) return true;
  }
  return false;
}

/** Is `e` literally `<name> + 1`? (The one progress step the machine fix rewrites.) */
function isIncrementByOne(e: Expr, name: string): boolean {
  return e.t === "bin" && e.op === "+" && e.l.t === "ref" && e.l.name === name && e.r.t === "num" && e.r.value === 1;
}

/** The canonical counted-loop shape the machine fix rewrites, once matched. */
export interface CanonicalShape {
  letStmt: LetNode;
  whileStmt: WhileNode;
  name: string;
  a: Expr;
  b: Expr;
}

/**
 * Does `body[i]` (a `while`) sit right after `let I = A`, with `I < B` as its condition,
 * a literal `I = I + 1` as the LAST statement of its body and no other assignment
 * anywhere in the body, `B` not referencing `I`, and `I` unreferenced after the loop in
 * this same body?
 *
 * This is the CHEAP PRE-FILTER only. It says nothing about a component called from the
 * body reading/writing `i`, a `zone`'s scope-transparency, the 10,000-iteration cap, or a
 * recovered parse error elsewhere in the body — those need the compile-and-compare proof
 * this function's caller (`src/index.ts`) runs before ever attaching the result as a fix.
 */
export function canonicalShapeAt(body: readonly Statement[], i: number): CanonicalShape | null {
  const w = body[i];
  if (w?.kind !== "while") return null;
  const cond = w.cond;
  if (cond.t !== "bin" || cond.op !== "<" || cond.l.t !== "ref") return null;
  const name = cond.l.name;
  const b = cond.r;

  const prev = body[i - 1];
  if (prev?.kind !== "let" || prev.name !== name) return null;
  if (prev.value.t === "fnlit") return null; // must bind a plain value, not a function
  const a = prev.value;

  const wbody = w.body;
  const last = wbody[wbody.length - 1];
  if (last?.kind !== "assign" || last.name !== name) return null;
  if (!isIncrementByOne(last.value, name)) return null;

  // No other assignment anywhere in BODY besides this exact increment.
  const assigns: AssignNode[] = [];
  collectAssigns(wbody, assigns);
  if (assigns.some((asn) => asn !== last)) return null;

  // B must not depend on the loop variable itself.
  if (referencesName(b, name)) return null;

  // I must not be referenced after the loop, in the same enclosing body.
  for (let j = i + 1; j < body.length; j++) {
    if (referencesName(body[j], name)) return null;
  }

  // The candidate BODY (without its increment) must contain no recovered parse error —
  // reprinting one would silently delete the bytes it could not read (B2).
  const candidateBody = wbody.slice(0, -1);
  if (containsErrorNode(candidateBody)) return null;

  // A and B must be re-printable. `exprToSource` is total over today's `Expr` union;
  // this is a defensive belt for a future variant that might not be.
  try {
    exprToSource(a);
    exprToSource(b);
  } catch {
    return null;
  }

  return { letStmt: prev, whileStmt: w, name, a, b };
}

/** `{ body: <the array a while/if/for/zone/let sits in>, index: <its position>, whileStmt }`
 *  for every `while` reachable from a plan's own body and its locally-declared components
 *  (never through an imported component — those are a different file's parse). */
export interface WhileSite {
  body: readonly Statement[];
  index: number;
  whileStmt: WhileNode;
}

function collectSites(body: readonly Statement[], out: WhileSite[]): void {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]!;
    if (stmt.kind === "while") {
      out.push({ body, index: i, whileStmt: stmt });
      collectSites(stmt.body, out);
    } else if (stmt.kind === "if") {
      collectSites(stmt.then, out);
      if (stmt.else) collectSites(stmt.else, out);
    } else if (stmt.kind === "for" || stmt.kind === "zone" || stmt.kind === "level") {
      collectSites(stmt.body, out);
    }
  }
}

/** Every `while` site in `plan`'s own body plus its locally-declared components (mirrors
 *  `while-deprecation.ts`'s traversal, so every `W_WHILE_DEPRECATED` diagnostic has a
 *  matching site here — by span — for `src/index.ts` to re-derive the candidate shape. */
export function collectWhileSites(plan: PlanNode): WhileSite[] {
  const out: WhileSite[] = [];
  collectSites(plan.body, out);
  for (const def of plan.components.values()) collectSites(def.body, out);
  return out;
}

/** Leading whitespace of the line containing `offset` — the column the replacement's
 *  first line already sits at (untouched), and the column every one of its OWN later
 *  lines must be reindented to, so the fixed file is already `fmt`-stable at the loop's
 *  real nesting depth (never a flat, always-zero indent). */
function baseIndentOf(source: string, offset: number): string {
  let start = offset;
  while (start > 0 && source[start - 1] !== "\n") start--;
  return /^[ \t]*/.exec(source.slice(start, offset))?.[0] ?? "";
}

/** Render one statement back to source, recursing through the block kinds
 *  (`for`/`if`/`while`/`zone`) that {@link statementText} does not cover — the fix's
 *  BODY may nest arbitrarily deep (nothing in the shape above forbids it). No comment
 *  preservation: a machine fix on this exact shape is not expected to carry any, and the
 *  proof obligation (`src/index.ts`) is `compile()`/`describe()`/`lint()` equality, not
 *  source-text fidelity. */
function stmtSource(s: Statement, indent: string): string {
  switch (s.kind) {
    case "for":
      return `for ${s.varName} in ${exprToSource(s.iter)} ${blockSource(s.body, indent)}`;
    case "while":
      return `while ${exprToSource(s.cond)} ${blockSource(s.body, indent)}`;
    case "if": {
      const out = `if ${exprToSource(s.cond)} ${blockSource(s.then, indent)}`;
      return s.else ? `${out} else ${blockSource(s.else, indent)}` : out;
    }
    case "zone":
      return `zone ${s.id}${s.label !== undefined ? ` ${JSON.stringify(s.label)}` : ""} ${blockSource(s.body, indent)}`;
    case "level":
    case "error":
      // `level` cannot appear inside a control-flow body; `error` is excluded by
      // `canonicalShapeAt`'s explicit `containsErrorNode` check before this ever runs.
      return "";
    default:
      return printDoc(statementText(s as LeafStatement), 80, "  ");
  }
}

/** Render a `{ … }` block body, one statement per indented line, relative to `indent`
 *  (the block's OWN opening line's indent — callers add one level for its contents). */
function blockSource(stmts: readonly Statement[], indent: string): string {
  if (stmts.length === 0) return "{ }";
  const inner = `${indent}  `;
  const lines = stmts.map((s) => `${inner}${stmtSource(s, inner)}`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/**
 * The candidate edit for a matched {@link CanonicalShape}: one span from `let I = A`
 * through the end of the `while`, replaced by `for I in A..B { BODY-without-its-last-
 * statement }`, reindented to the loop's REAL column in `source` (so a fixed file is
 * already `fmt`-stable — never a flat, always-zero indent regardless of nesting).
 *
 * Not yet a {@link import("./diagnostics.js").FixSuggestion} — this is the CANDIDATE
 * text `src/index.ts` compiles and compares before it may ever be attached as one.
 */
export function buildCandidateEdit(shape: CanonicalShape, source: string): FixEdit {
  const { letStmt, whileStmt, name, a, b } = shape;
  const bodyWithoutIncrement = whileStmt.body.slice(0, -1);
  const raw = `for ${name} in ${exprToSource(a)}..${exprToSource(b)} ${blockSource(bodyWithoutIncrement, "")}`;
  const indent = baseIndentOf(source, letStmt.span!.start);
  const newText = raw
    .split("\n")
    .map((line, i) => (i === 0 ? line : `${indent}${line}`))
    .join("\n");
  return { span: { start: letStmt.span!.start, end: whileStmt.span!.end }, newText };
}
