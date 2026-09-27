/**
 * W7 — soft-deprecation of `while` and reassignment (`NAME = expr`): the advisory
 * warnings only. The machine-applicable fix lives one layer up, in `src/while-fix.ts` +
 * `src/index.ts` — see that module's header for why (a fix here could only be a syntactic
 * GUESS; only the full `compile()` pipeline can prove one sound).
 *
 * `while` plus a reassignment to make it terminate is the one construct in ArchLang's
 * expand-time language that breaks referential transparency: a `let` binding reassigned
 * later is no longer a value that can be substituted, which every equational tool (LSP
 * rename, `arch fix`'s rewrite-in-your-form, the planned re-roll refactor) relies on.
 * `for x in a..b` covers every counted loop `while` is used for.
 *
 * The owner chose a SOFT deprecation (2026-09-27): both forms still parse, compile and
 * render exactly as before. This module only ADDS two advisory `W_*` diagnostics (never
 * an error, never a fix). It is purely syntactic — it walks the parsed AST and never
 * evaluates an expression — so it fires once per source `while`/reassignment regardless
 * of how many times (if any) a loop actually runs at expand time, and a plan using
 * neither form is untouched (the byte-identity law every new language form ships,
 * `docs/agents/iron-laws.md`).
 *
 * `W_REASSIGN_DEPRECATED` fires only on a reassignment that is NOT lexically inside any
 * `while` body, at any depth (through a nested `if`/`for`/`zone`) — everything inside a
 * `while` is already covered by that loop's own `W_WHILE_DEPRECATED`, so a reassignment
 * is never double-flagged regardless of where in the body it sits or what it updates.
 *
 * Called once per parse, over the plan body and every locally-declared component body
 * (`src/parser.ts`); an imported module's own `while`/`assign` is caught when THAT file
 * is parsed, and `src/import.ts` forwards exactly these two codes (tagged with the
 * module's `file`, never a fix) to the importer — every other parse warning from an
 * imported module still stays dropped, so a plan that merely imports a library is not
 * newly gained warnings unrelated to this deprecation.
 */

import type { ComponentDef, PlanNode, Statement } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";

/** Walk one statement list, emitting `W_WHILE_DEPRECATED` on every `while` and
 *  `W_REASSIGN_DEPRECATED` on every `assign` not lexically inside a `while` body.
 *  Recurses into every nested body (`if`/`for`/`while`/`zone`/`level`); `inWhile`
 *  stays true for everything nested under a `while`, however deep. */
function walk(body: readonly Statement[], diag: (d: Diagnostic) => void, inWhile: boolean): void {
  for (const stmt of body) {
    switch (stmt.kind) {
      case "while": {
        const cond = stmt.cond;
        const varName = cond.t === "bin" && cond.l.t === "ref" ? cond.l.name : "i";
        diag({
          severity: "warning",
          code: "W_WHILE_DEPRECATED",
          span: stmt.span!,
          message: `"while" is deprecated and will be removed in a future major version.`,
          hints: [`Use "for ${varName} in A..B { … }" for a counted loop.`],
        });
        walk(stmt.body, diag, true);
        break;
      }
      case "assign":
        if (!inWhile) {
          diag({
            severity: "warning",
            code: "W_REASSIGN_DEPRECATED",
            span: stmt.span!,
            message: `Reassignment ("${stmt.name} = …") is deprecated and will be removed in a future major version.`,
            hints: [`Bind a new name with "let" instead, or express the surrounding loop as "for NAME in A..B { … }".`],
          });
        }
        break;
      case "if":
        walk(stmt.then, diag, inWhile);
        if (stmt.else) walk(stmt.else, diag, inWhile);
        break;
      case "for":
        walk(stmt.body, diag, inWhile);
        break;
      case "zone":
        walk(stmt.body, diag, inWhile);
        break;
      case "level":
        walk(stmt.body, diag, inWhile);
        break;
      default:
        break;
    }
  }
}

/** Entry point: attach `W_WHILE_DEPRECATED`/`W_REASSIGN_DEPRECATED` diagnostics for a
 *  freshly-parsed plan's own body and every locally-declared component body. Never
 *  attaches a `fixes` array — see this module's header. */
export function checkWhileDeprecation(plan: PlanNode, diag: (d: Diagnostic) => void): void {
  walk(plan.body, diag, false);
  for (const def of plan.components.values()) walkComponent(def, diag);
}

function walkComponent(def: ComponentDef, diag: (d: Diagnostic) => void): void {
  walk(def.body, diag, false);
}
