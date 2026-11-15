/**
 * Order-free trailing clauses. A statement's optional keyword-led clauses (`size`, `label`,
 * `rotate`, `clear`, … after a `furniture`'s placement) may come in any order, each once.
 *
 * Every clause keeps the RANK it had in the fixed order the grammar used to require. A clause
 * the old grammar would have read at this point (its rank at or above every rank read so far,
 * and not yet written) is read exactly as it was, with no new condition. Any other clause (out
 * of the old order, or written a second time) is read only where its word cannot begin the
 * next statement: not a statement keyword, and not followed by `=` or `(` (an assignment, a
 * component call). A plan that parsed before therefore parses to the same tree: it reads the
 * same clauses at the same tokens and stops where it stopped. The only sources that read
 * differently were parse errors, because a clause word that is no statement start began an
 * "Unknown statement". A second copy of a clause is `E_DUP_CLAUSE`, reported with its span
 * and read past, never thrown.
 */

import type { Span } from "./diagnostics.js";
import type { ParseCtx } from "./registry.js";

export interface TailClause {
  /** The word that leads the clause. */
  readonly word: string;
  /** Its place in the old fixed order. Clauses sharing a rank were already free among themselves. */
  readonly rank: number;
  /** The clause starts at the cursor: its word, and any condition it has always had. Default: the word. */
  readonly at?: () => boolean;
  /** Out of the old order, the word begins the next statement here. Default: {@link startsStatement}. */
  readonly startsStatement?: () => boolean;
  /** The clause may repeat and checks its own repeats (`clear front|sides`). */
  readonly repeats?: boolean;
  /** Where the statement already said what the clause says (`furniture … in <room> centered`). */
  readonly given?: Span;
  /** Read the clause, the cursor on its word. `keep` is false for a duplicate, read only to be skipped. */
  read(keep: boolean): void;
}

/** The default reading of a clause word out of the old order: does it begin a statement instead? */
export function startsStatement(ctx: ParseCtx, word: string): boolean {
  const after = ctx.peek(1).type;
  return ctx.isStatementStart(word) || after === "equals" || after === "lparen";
}

/**
 * The statements whose clauses after the placement come in any order: each calls
 * {@link readClauses} with its keyword (a `strip`'s room under `room`). The spec's sentence reads
 * this list, and `test/clause-order-byte-identity.test.ts` holds it to the calls in `src/`.
 */
export const ORDER_FREE_STATEMENTS = ["room", "furniture", "door", "window", "opening", "outdoor"] as const;
export type OrderFreeStatement = (typeof ORDER_FREE_STATEMENTS)[number];

/** Read the clauses at the cursor, in any order, each once (see the module header). */
export function readClauses(ctx: ParseCtx, what: OrderFreeStatement, clauses: readonly TailClause[]): void {
  const first = new Map<TailClause, Span>();
  for (const c of clauses) if (c.given) first.set(c, c.given);
  let rank = Number.NEGATIVE_INFINITY;
  for (;;) {
    const c = clauses.find((k) => (k.at ? k.at() : ctx.isKeyword(k.word)));
    if (!c) return;
    const dup = !c.repeats && first.has(c);
    if ((dup || c.rank < rank) && (c.startsStatement ? c.startsStatement() : startsStatement(ctx, c.word))) return;
    const kw = ctx.peek();
    c.read(!dup);
    const span = { start: kw.start, end: ctx.peek(-1).end };
    if (dup) {
      ctx.diag({
        severity: "error",
        code: "E_DUP_CLAUSE",
        message: `\`${c.word}\` is written twice on this ${what}: each clause is written once`,
        span,
        relatedSpans: [{ span: first.get(c)!, message: `\`${c.word}\` first written here` }],
        hints: ["delete one of the two"],
      });
    } else if (!first.has(c)) first.set(c, span);
    if (c.rank > rank) rank = c.rank;
  }
}

/**
 * The statement left out a clause it cannot do without (a rectangle room's `size`, an opening's
 * `width`). Where the cursor is not on the word, the message is `eatKeyword`'s own, as before.
 * Where it is, the word was out of the old order and read as the start of a statement.
 */
export function missingClause(ctx: ParseCtx, word: string, form: string): never {
  if (!ctx.isKeyword(word)) ctx.eatKeyword(word);
  return ctx.fail(
    `This \`${word}\` reads as the start of a statement (\`${word} = …\` or \`${word}(…)\`): write \`${form}\` right after the placement`,
  );
}

/**
 * `id=` after the kind word (`furniture bed id=b1`, `door double id=d1`), where a model writes it.
 * The word after a kind was never `id`, so this reads nothing a plan wrote before. `id` is the id
 * read before the kind ("" for none) and `idSpan` its span; a second `id=` is `E_DUP_CLAUSE`.
 */
export function idAfterKind(ctx: ParseCtx, what: string, id: string, idSpan: Span | undefined): string {
  if (!ctx.isKeyword("id") || ctx.peek(1).type !== "equals") return id;
  if (id === "" || !idSpan) return ctx.parseIdOpt();
  const kw = ctx.next();
  ctx.next();
  const t = ctx.eatIdent();
  ctx.diag({
    severity: "error",
    code: "E_DUP_CLAUSE",
    message: `\`id=\` is written twice on this ${what}: each clause is written once`,
    span: { start: kw.start, end: t.end },
    relatedSpans: [{ span: idSpan, message: "`id=` first written here" }],
    hints: ["delete one of the two"],
  });
  return id;
}

/** `ctx.parseIdOpt()` with the span of what it read, for {@link idAfterKind}. */
export function parseIdWithSpan(ctx: ParseCtx): { id: string; idSpan?: Span } {
  const start = ctx.peek().start;
  const id = ctx.parseIdOpt();
  return id ? { id, idSpan: { start, end: ctx.peek(-1).end } } : { id };
}
