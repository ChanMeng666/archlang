/**
 * W7 — soft-deprecation of `while` and reassignment (`NAME = expr`).
 *
 * `while` plus a reassignment to make it terminate is the one construct in ArchLang's
 * expand-time language that breaks referential transparency: a `let` binding reassigned
 * later is no longer a value that can be substituted, which every equational tool (LSP
 * rename, `arch fix`'s rewrite-in-your-form, the planned re-roll refactor) relies on.
 * `for x in a..b` covers every counted loop `while` is used for.
 *
 * The owner chose a SOFT deprecation (2026-09-27): both forms still parse, compile and
 * render exactly as before. This module only ADDS two advisory `W_*` diagnostics (never
 * an error) plus, for the single canonical counted-loop shape, a machine-applicable fix.
 * It is purely syntactic — it walks the parsed AST and never evaluates an expression — so
 * it fires once per source `while`/reassignment regardless of how many times (if any) a
 * loop actually runs at expand time, and a plan using neither form is untouched (the
 * byte-identity law every new language form ships, `docs/agents/iron-laws.md`).
 *
 * Called once per parse, over the plan body and every locally-declared component body
 * (`src/parser.ts`); an imported module's own `while`/`assign` is caught when THAT file
 * is parsed (its warnings are dropped at the import site like any other parse warning,
 * matching existing `src/import.ts` behavior).
 */

import type { AssignNode, ComponentDef, LetNode, PlanNode, Statement, WhileNode } from "./ast.js";
import type { Diagnostic, FixSuggestion } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { exprToSource } from "./expr-source.js";
import { printDoc } from "./doc.js";
import { statementText, type LeafStatement } from "./statement-print.js";

/** Deep structural search: does `node` (an AST subtree, arbitrarily nested) contain a
 *  `{ t: "ref", name }` referencing `name`? Generic over every statement/expr shape, so it
 *  needs no update when a new element or expression form is added. */
function referencesName(node: unknown, name: string): boolean {
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
 *  (arbitrarily nested through `if`/`for`/`while`/`zone` bodies). */
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

/** Is `e` literally `<name> + 1`? (The one progress step the machine fix rewrites.) */
function isIncrementByOne(e: Expr, name: string): boolean {
  return e.t === "bin" && e.op === "+" && e.l.t === "ref" && e.l.name === name && e.r.t === "num" && e.r.value === 1;
}

/** The canonical counted-loop shape the machine fix rewrites, once matched. */
interface CanonicalShape {
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
 * this same body? All six hold, or there is no fix — see the task card's disqualifier
 * list; this function is that list, in code.
 */
function canonicalShapeAt(body: readonly Statement[], i: number): CanonicalShape | null {
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

/** Render one statement back to source, recursing through the block kinds
 *  (`for`/`if`/`while`/`zone`) that {@link statementText} does not cover — the fix's
 *  BODY may nest arbitrarily deep (nothing in the shape above forbids it). No comment
 *  preservation: a machine fix on this exact shape is not expected to carry any, and
 *  the proof obligation is `compile()` equality, not source-text fidelity. */
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
      // Unreachable from a body the canonical shape matched: `level` cannot appear
      // inside a control-flow body, and a matched shape has no unrecovered parse error.
      return "";
    default:
      return printDoc(statementText(s as LeafStatement), 80, "  ");
  }
}

/** Render a `{ … }` block body, one statement per indented line. */
function blockSource(stmts: readonly Statement[], indent: string): string {
  if (stmts.length === 0) return "{ }";
  const inner = `${indent}  `;
  const lines = stmts.map((s) => `${inner}${stmtSource(s, inner)}`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** Build the machine-applicable fix for a matched {@link CanonicalShape}: one edit
 *  spanning `let I = A` through the end of the `while`, replaced by
 *  `for I in A..B { BODY-without-its-last-statement }`. */
function buildFix(shape: CanonicalShape): FixSuggestion {
  const { letStmt, whileStmt, name, a, b } = shape;
  const bodyWithoutIncrement = whileStmt.body.slice(0, -1);
  const newText = `for ${name} in ${exprToSource(a)}..${exprToSource(b)} ${blockSource(bodyWithoutIncrement, "")}`;
  return {
    title: `rewrite the counted \`while\` loop over "${name}" as \`for\``,
    applicability: "machine-applicable",
    fixId: "while-to-for",
    edits: [{ span: { start: letStmt.span!.start, end: whileStmt.span!.end }, newText }],
  };
}

/** Is `stmt` the "progress step" of enclosing `while` `w` — its body's LAST statement,
 *  reassigning a name `w`'s own condition references? Broader than the machine-fixable
 *  shape (any progress pattern counts, not just literal `+ 1`) so a legitimate `while`
 *  with, say, a decrementing or multi-step counter is not double-warned either. */
function isProgressStep(w: WhileNode, stmt: Statement): boolean {
  const last = w.body[w.body.length - 1];
  return last === stmt && stmt.kind === "assign" && referencesName(w.cond, stmt.name);
}

/** Walk one statement list, emitting `W_WHILE_DEPRECATED` on every `while` and
 *  `W_REASSIGN_DEPRECATED` on every `assign` that is not some enclosing `while`'s own
 *  progress step. Recurses into every nested body (`if`/`for`/`while`/`zone`/`level`). */
function walk(body: readonly Statement[], diag: (d: Diagnostic) => void, exempt: Statement | undefined): void {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]!;
    switch (stmt.kind) {
      case "while": {
        const shape = canonicalShapeAt(body, i);
        diag({
          severity: "warning",
          code: "W_WHILE_DEPRECATED",
          span: stmt.span!,
          message: `"while" is deprecated and will be removed in 2.0.`,
          hints: [
            `Use "for ${stmt.cond.t === "bin" && stmt.cond.l.t === "ref" ? stmt.cond.l.name : "i"} in A..B { … }" for a counted loop.`,
          ],
          ...(shape ? { fixes: [buildFix(shape)] } : {}),
        });
        const last = stmt.body[stmt.body.length - 1];
        walk(stmt.body, diag, last && isProgressStep(stmt, last) ? last : undefined);
        break;
      }
      case "assign":
        if (stmt !== exempt) {
          diag({
            severity: "warning",
            code: "W_REASSIGN_DEPRECATED",
            span: stmt.span!,
            message: `Reassignment ("${stmt.name} = …") is deprecated and will be removed in 2.0.`,
            hints: [`Bind a new name with "let" instead, or use a "for" loop if this made a "while" progress.`],
          });
        }
        break;
      case "if":
        walk(stmt.then, diag, undefined);
        if (stmt.else) walk(stmt.else, diag, undefined);
        break;
      case "for":
        walk(stmt.body, diag, undefined);
        break;
      case "zone":
        walk(stmt.body, diag, undefined);
        break;
      case "level":
        walk(stmt.body, diag, undefined);
        break;
      default:
        break;
    }
  }
}

/** Entry point: attach `W_WHILE_DEPRECATED`/`W_REASSIGN_DEPRECATED` diagnostics for a
 *  freshly-parsed plan's own body and every locally-declared component body. */
export function checkWhileDeprecation(plan: PlanNode, diag: (d: Diagnostic) => void): void {
  walk(plan.body, diag, undefined);
  for (const def of plan.components.values()) walkComponent(def, diag);
}

function walkComponent(def: ComponentDef, diag: (d: Diagnostic) => void): void {
  walk(def.body, diag, undefined);
}
