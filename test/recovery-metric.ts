/**
 * The parser's error-recovery metric, importable WITHOUT vitest (so a scratch script can
 * measure an older `src/` with the same body — see `byte-identity-digest.ts` for why one
 * body, two callers).
 *
 * A mutant is an example with some tokens blanked out; its SURVIVAL is how many of the
 * original's statements the parser still produced, exactly, from the mutant:
 *
 *   survival = |multiset ∩ of statement fingerprints (mutant vs original)| / |original|
 *
 * pooled over every mutant of a class (Σ|∩| / Σ|original|), so a large file weighs as much
 * as its statements do.
 *
 * - **Statements** are walked recursively: `plan.body`, every `component` definition (a
 *   `component` counts as one statement — its name and parameters — and its body is
 *   walked), and the nested bodies of `for`/`if`/`while`/`level`/`zone`. A container's own
 *   fingerprint leaves its nested statement lists out, so one lost child is counted once,
 *   not once more for every block around it.
 * - **A fingerprint** is the node's JSON without its position fields: `span`, `line`,
 *   `col`, `comments`, `bodyStart`, and every other `…Span` key (`heightSpan`, `aliasSpan`,
 *   …). Anything else — ids, labels, expressions — must match exactly.
 * - **Blanking** replaces a token's bytes with spaces of the same length, so no two
 *   neighbouring tokens fuse into a new one and every surviving byte keeps its offset.
 *
 * Mutation classes (deterministic — no randomness):
 * - `dropBrace`: one mutant per `}` token, that `}` blanked.
 * - `dropToken`: one mutant per token at index `0, k, 2k, …` (`k` = {@link TOKEN_STRIDE}),
 *   that one token blanked — a stride sample of single-token deletions.
 * - `insertBrace`: one mutant per statement (as walked above), a stray `{ ` inserted at
 *   its first byte — the `room … {` habit, and a `{` alone on a line.
 * - `subToken`: the `dropToken` sample, the token replaced by the non-keyword `zz`
 *   instead of blanked.
 */

import type { Statement } from "../src/ast.js";
import type { lex } from "../src/lexer.js";
import type { parse } from "../src/parser.js";

export interface MetricApi {
  lex: typeof lex;
  parse: typeof parse;
}

/** Stride of the `dropToken`/`subToken` sample; chosen so the metric test runs in a few seconds. */
export const TOKEN_STRIDE = 13;

const POSITION_KEY = /^(span|line|col|comments|bodyStart)$|Spans?$/;
const NESTED_BODY_KEYS = new Set(["body", "then", "else"]);

function fingerprint(node: object, dropNested: boolean): string {
  return JSON.stringify(node, (key, value) => {
    if (key !== "" && POSITION_KEY.test(key)) return undefined;
    if (dropNested && NESTED_BODY_KEYS.has(key) && Array.isArray(value)) return undefined;
    return value;
  });
}

function walk(stmts: readonly Statement[], out: string[], starts: number[]): void {
  for (const s of stmts) {
    out.push(fingerprint(s, true));
    if (s.span) starts.push(s.span.start);
    const r = s as unknown as Record<string, unknown>;
    for (const k of NESTED_BODY_KEYS) {
      const v = r[k];
      if (Array.isArray(v)) walk(v as Statement[], out, starts);
    }
  }
}

function statements(api: MetricApi, src: string): { prints: string[]; starts: number[] } {
  const { plan } = api.parse(src);
  const prints: string[] = [];
  const starts: number[] = [];
  if (!plan) return { prints, starts };
  for (const def of plan.components.values()) {
    prints.push(JSON.stringify({ component: def.name, params: def.params }));
    if (def.span) starts.push(def.span.start);
    walk(def.body, prints, starts);
  }
  walk(plan.body, prints, starts);
  return { prints, starts };
}

/** Every statement fingerprint of `src`'s parse, in walk order (a multiset). */
export function statementFingerprints(api: MetricApi, src: string): string[] {
  return statements(api, src).prints;
}

/** |a ∩ b| as multisets. */
export function multisetIntersection(a: readonly string[], b: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  let n = 0;
  for (const x of b) {
    const c = counts.get(x) ?? 0;
    if (c > 0) {
      n++;
      counts.set(x, c - 1);
    }
  }
  return n;
}

function blank(src: string, t: { start: number; end: number }): string {
  return src.slice(0, t.start) + " ".repeat(t.end - t.start) + src.slice(t.end);
}

export interface ClassResult {
  mutants: number;
  survived: number;
  original: number;
  /** Σ|∩| / Σ|original|. */
  survival: number;
}

export const MUTATION_CLASSES = ["dropBrace", "dropToken", "insertBrace", "subToken"] as const;
export type MutationClass = (typeof MUTATION_CLASSES)[number];

/** The mutants of one class for one source, in source order. */
export function mutants(api: MetricApi, src: string, cls: MutationClass): string[] {
  if (cls === "insertBrace") {
    const starts = [...new Set(statements(api, src).starts)].sort((a, b) => a - b);
    return starts.map((at) => `${src.slice(0, at)}{ ${src.slice(at)}`);
  }
  const toks = api.lex(src).tokens.filter((t) => t.type !== "eof");
  if (cls === "dropBrace") return toks.filter((t) => t.type === "rcurly").map((t) => blank(src, t));
  const out: string[] = [];
  for (let i = 0; i < toks.length; i += TOKEN_STRIDE) {
    const t = toks[i]!;
    out.push(cls === "dropToken" ? blank(src, t) : `${src.slice(0, t.start)}zz${src.slice(t.end)}`);
  }
  return out;
}

/** Pooled survival of one mutation class over a corpus of clean sources. */
export function measure(api: MetricApi, sources: readonly string[], cls: MutationClass): ClassResult {
  let mutantCount = 0;
  let survived = 0;
  let original = 0;
  for (const src of sources) {
    const base = statementFingerprints(api, src);
    for (const m of mutants(api, src, cls)) {
      mutantCount++;
      original += base.length;
      survived += multisetIntersection(base, statementFingerprints(api, m));
    }
  }
  return { mutants: mutantCount, survived, original, survival: original === 0 ? 0 : survived / original };
}
