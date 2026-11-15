/**
 * Order-free trailing clauses. A statement's optional keyword-led clauses (`size`, `label`,
 * `rotate`, `clear`, … after a `furniture`'s placement) may come in any order, each once.
 *
 * Every clause keeps the RANK it had in the fixed order the grammar used to require. A clause
 * the old grammar would have read at this point (its rank at or above every rank read so far,
 * not yet written, and every REQUIRED clause ranked below it already read: the old grammar
 * never got past a missing `width` to read `wall`) is read exactly as it was, with no new
 * condition. Any other clause (out
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
  /** The statement cannot leave it out (a rectangle's `size`, an opening's `width`). */
  readonly required?: boolean;
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
    // A required clause ranked below this one and not yet read: the old grammar failed on that
    // clause before it reached this one, so this one is out of the old order.
    const skipped = clauses.some((k) => k.required && k.rank < c.rank && !first.has(k));
    const inOrder = !dup && !skipped && c.rank >= rank;
    // A required clause not yet read, out of order: without it the statement failed on the old
    // grammar whatever followed, so only an assignment or a statement keyword stops it; a value
    // in parentheses (`width (900)`) is still its value, not a call.
    const owed = c.required && !first.has(c);
    const stops = owed
      ? ctx.isStatementStart(c.word) || ctx.peek(1).type === "equals"
      : c.startsStatement
        ? c.startsStatement()
        : startsStatement(ctx, c.word);
    if (!inOrder && stops) return;
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
 * `width`): an `E_PARSE` spanned on the statement and naming it, which also says what stands
 * where the clause could have been (`expected "width" but found "widht"`, as `eatKeyword` said)
 * and keeps the hints that token earns (`separate uses with spaces` on a `,`). Where that token
 * is the word itself, it was out of the old order and read as the start of a statement.
 */
export function missingClause(
  ctx: ParseCtx,
  stmt: { what: string; id: string; start: number },
  word: string,
  form: string,
): never {
  const t = ctx.peek();
  const name = stmt.id ? `${stmt.what} "${stmt.id}"` : `this ${stmt.what}`;
  const found = ctx.isKeyword(word)
    ? `: the \`${word}\` after it reads as the start of a statement (\`${word} = …\` or \`${word}(…)\`)`
    : `: expected "${word}" but found ${describeToken(t)}`;
  // Spanned on the statement that lacks the clause, never on the token after it; the hints are
  // the token's, as they were when the parse failed on it.
  return ctx.failAt(`${name[0]!.toUpperCase()}${name.slice(1)} has no \`${form}\`${found}`, {
    start: stmt.start,
    end: ctx.peek(-1).end,
  });
}

/** A token as a parse message names it (the parser's own wording). */
function describeToken(t: { type: string; value: string }): string {
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}

/**
 * The statements whose `id=` may also follow the kind word: each calls {@link idAfterKind} with
 * its keyword. The spec's rule 6 reads this list, and `test/clause-order-byte-identity.test.ts`
 * holds it to the calls in `src/`.
 */
export const ID_AFTER_KIND_STATEMENTS = ["furniture", "door", "window", "outdoor", "wall"] as const;
export type IdAfterKindStatement = (typeof ID_AFTER_KIND_STATEMENTS)[number];

/**
 * `id=` after the kind word (`furniture bed id=b1`, `door double id=d1`), where a model writes it.
 * The word after a kind was never `id`, so this reads nothing a plan wrote before. `id` is the id
 * read before the kind ("" for none) and `idSpan` its span; every further `id=` is `E_DUP_CLAUSE`.
 */
export function idAfterKind(ctx: ParseCtx, what: IdAfterKindStatement, id: string, idSpan: Span | undefined): string {
  let first = id ? idSpan : undefined;
  while (ctx.isKeyword("id") && ctx.peek(1).type === "equals") {
    if (!first) {
      const read = parseIdWithSpan(ctx);
      id = read.id;
      first = read.idSpan;
      continue;
    }
    const kw = ctx.next();
    ctx.next();
    const t = ctx.eatIdent();
    ctx.diag({
      severity: "error",
      code: "E_DUP_CLAUSE",
      message: `\`id=\` is written twice on this ${what}: each clause is written once`,
      span: { start: kw.start, end: t.end },
      relatedSpans: [{ span: first, message: "`id=` first written here" }],
      hints: ["delete one of the two"],
    });
  }
  return id;
}

/**
 * The order-free clauses whose value is an expression, each with an example of its own. Only
 * these can turn into a call: written out of the old order with the value in parentheses
 * (`… clear front 600 rotate (90)`), the word reads as a component call (see the module header).
 * `test/clause-order-byte-identity.test.ts` holds the keys to the clause words `src/` reads.
 */
export const EXPRESSION_CLAUSE_EXAMPLES: Readonly<Record<string, string>> = {
  size: "size 1500x2000",
  rotate: "rotate 90",
  width: "width 900",
  open: "open 0.5",
  head: "head 2100",
  sill: "sill 900",
};

/** The hint for a call of an unknown component named like one of {@link EXPRESSION_CLAUSE_EXAMPLES}. */
export function clauseWordCallHint(name: string): string | undefined {
  if (!Object.hasOwn(EXPRESSION_CLAUSE_EXAMPLES, name)) return undefined;
  return `\`${name}\` is also a clause word: written out of a statement's old clause order with its value in parentheses, it reads as a call. Write the value without them (\`${EXPRESSION_CLAUSE_EXAMPLES[name]}\`)`;
}

/** `ctx.parseIdOpt()` with the span of what it read, for {@link idAfterKind}. */
export function parseIdWithSpan(ctx: ParseCtx): { id: string; idSpan?: Span } {
  const start = ctx.peek().start;
  const id = ctx.parseIdOpt();
  return id ? { id, idSpan: { start, end: ctx.peek(-1).end } } : { id };
}
