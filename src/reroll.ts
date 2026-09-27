/**
 * `reroll(source)` — detect a run of ≥3 CONSECUTIVE statements in arithmetic
 * progression and offer a proven-equivalent `for` loop (Szalinski, PLDI 2020,
 * `uwplse/szalinski` `src/solve.rs`, minus the e-graph — fit an AP over sorted
 * instances). ADR 0005: never rewrite silently — this is an explicit, opt-in
 * refactor a caller applies (or not).
 *
 * Detection walks every statement list in the plan (the plan body, a component
 * body, a `for`/`if`/`while` body, a `level`, a `zone`) for a maximal run where:
 *  - every statement has the same `kind` and the same STRUCTURE, compared on the
 *    AST with spans/line numbers ignored;
 *  - every differing slot is a numeric literal (`Expr` `{ t: "num" }`), and the
 *    literals form an arithmetic progression in statement order (exact on the
 *    printed numbers — `num-format.ts`'s `fmt3`);
 *  - every other token is identical, including strings/labels (v1: a string slot
 *    must be identical, not just its printed form — no numeric interpolation
 *    inside a string may vary across the run);
 *  - no statement carries an explicit `id=` (auto-ids only — an id can't be
 *    generated inside a loop).
 *
 * Each surviving candidate is gated by a PROOF OBLIGATION (apply the edit, compile
 * the twin, and require: no new error, byte-identical SVG per page, deep-equal
 * `describe()`, and a `{code,message}`/`{code,severity,message}` multiset match
 * for lint/compile diagnostics) and a token-count gate (the loop must be
 * genuinely shorter, by the lexer's own count) before it is offered. Pure and
 * synchronous — no I/O, no mutation of the parsed `PlanNode`.
 *
 * Self-contained: the twin-compile proof here does not share code with a similar
 * one W7 builds for `attachWhileFixes` in `index.ts` — a later cleanup may unify
 * them. `reroll` never calls itself while proving a twin (no recursion).
 */

import type { PlanNode, Statement } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { parse } from "./parser.js";
import { link } from "./import.js";
import { resolveAll } from "./ir.js";
import { toScene } from "./scene-build.js";
import { renderSvg } from "./backends/svg.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import { describe, type SceneSummary } from "./describe.js";
import { lint } from "./lint.js";
import { statementBodies } from "./cursor.js";
import { concat, type Doc, hardline, indent, printDoc } from "./doc.js";
import { statementText, type LeafStatement } from "./statement-print.js";
import { fmt3 as numStr } from "./num-format.js";
import { lex } from "./lexer.js";

/** One offered `for` loop, replacing a run of `count` consecutive statements. */
export interface RerollSuggestion {
  /** Byte span of the run being replaced (first statement's start to the last's end). */
  span: Span;
  /** The `for … { … }` source text to splice in, printed at the run's own nesting depth. */
  replacement: string;
  /** How many statements the loop replaces. */
  count: number;
  /** The chosen loop variable (the first of `i, j, k, n, idx` free in scope and unused in the run). */
  loopVar: string;
  /** Lexer token count of the original run (excluding `eof`). */
  tokensBefore: number;
  /** Lexer token count of {@link replacement} (excluding `eof`). */
  tokensAfter: number;
}

/** Reserved for future options; `reroll` takes none today. */
export type RerollOptions = Record<string, never>;

// Matches format.ts's own print width — the pretty-printer's fixed point.
const PRINT_WIDTH = 80;

const BLOCK_KINDS = new Set<Statement["kind"]>(["for", "if", "while", "level", "zone"]);
const LOOP_VAR_CANDIDATES = ["i", "j", "k", "n", "idx"];

// ---- generic, span-blind structural diff over a run of statements --------

/** Any key never compared for equality: byte spans (and their many `…Span`
 *  siblings) and the source LINE number — everything the parser records for
 *  diagnostics, none of it semantic to what a statement DRAWS. */
function skipKey(k: string): boolean {
  return k === "span" || k === "line" || k.endsWith("Span");
}

function isExprNum(v: unknown): v is { t: "num"; value: number } {
  return (
    v !== null &&
    typeof v === "object" &&
    (v as { t?: unknown }).t === "num" &&
    typeof (v as { value?: unknown }).value === "number"
  );
}

function isExprStr(v: unknown): v is { t: "str" } {
  return v !== null && typeof v === "object" && (v as { t?: unknown }).t === "str";
}

function stripKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (skipKey(k)) continue;
      out[k] = stripKeys(val);
    }
    return out;
  }
  return v;
}

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Walk `nodes` (one value per statement in a candidate run) in lockstep, driven
 * by `nodes[0]`'s own key order (so a caller re-walking the template alone in
 * the same order — {@link buildReplacement} — sees the same slot sequence).
 * Pushes one entry per matched numeric-literal slot (`Expr { t: "num" }`), each
 * entry the slot's value across the whole run, in run order. Returns `null` the
 * moment the statements are NOT the same shape modulo numeric literals: a
 * differing key set, a differing non-numeric primitive, or a differing string
 * (a `str` `Expr` is opaque — required byte-for-byte, per v1).
 */
function collectSlots(nodes: unknown[]): number[][] | null {
  const slots: number[][] = [];
  function visit(vs: unknown[]): boolean {
    const v0 = vs[0];
    if (vs.every((v) => v === v0)) return true; // same reference, or equal primitive (incl. undefined)
    if (isExprNum(v0)) {
      if (!vs.every(isExprNum)) return false;
      slots.push(vs.map((v) => (v as { value: number }).value));
      return true;
    }
    if (isExprStr(v0)) {
      const s0 = stripKeys(v0);
      return vs.every((v) => isExprStr(v) && deepEqual(stripKeys(v), s0));
    }
    if (Array.isArray(v0)) {
      if (!vs.every((v) => Array.isArray(v) && v.length === v0.length)) return false;
      for (let i = 0; i < v0.length; i++) if (!visit(vs.map((v) => (v as unknown[])[i]))) return false;
      return true;
    }
    if (v0 !== null && typeof v0 === "object") {
      if (!vs.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) return false;
      const keys = Object.keys(v0 as object).filter((k) => !skipKey(k));
      for (const v of vs.slice(1)) {
        const vk = new Set(Object.keys(v as object).filter((k) => !skipKey(k)));
        if (vk.size !== keys.length || !keys.every((k) => vk.has(k))) return false;
      }
      for (const k of keys) if (!visit(vs.map((v) => (v as Record<string, unknown>)[k]))) return false;
      return true;
    }
    return false; // primitive mismatch (or null vs non-null)
  }
  return visit(nodes) ? slots : null;
}

/** Exact on the PRINTED numbers (num-format's own rounding), per the card. */
function isArithmeticProgression(vals: number[]): boolean {
  if (vals.every((v) => v === vals[0])) return true; // constant — trivially fine, not "differing"
  const d = vals[1]! - vals[0]!;
  for (let j = 0; j < vals.length; j++) {
    if (numStr(vals[0]! + j * d) !== numStr(vals[j]!)) return false;
  }
  return true;
}

/** `a + loopVar * d`, simplified when `a === 0` or `d === 1`. */
function slotExpr(a: number, d: number, loopVar: string): Expr {
  const mul: Expr =
    d === 1
      ? { t: "ref", name: loopVar }
      : { t: "bin", op: "*", l: { t: "ref", name: loopVar }, r: { t: "num", value: d } };
  return a === 0 ? mul : { t: "bin", op: "+", l: { t: "num", value: a }, r: mul };
}

/**
 * Rebuild the template statement (`group[0]`) with each VARYING slot (a
 * non-constant entry of `slots`, in the same order {@link collectSlots} found
 * them) replaced by its `a + loopVar * d` formula; a constant slot keeps its
 * original literal untouched. Walks `group[0]` alone, in the identical
 * deterministic key order `collectSlots` used, so the Nth `num` leaf it meets
 * is always the Nth slot.
 */
function buildReplacement(template: unknown, replacements: (Expr | undefined)[]): unknown {
  const idx = { i: 0 };
  function build(node: unknown): unknown {
    if (isExprNum(node)) {
      const r = replacements[idx.i++];
      return r ?? node;
    }
    if (isExprStr(node)) return node;
    if (Array.isArray(node)) return node.map(build);
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = skipKey(k) ? v : build(v);
      return out;
    }
    return node;
  }
  return build(template);
}

// ---- loop-var selection ----------------------------------------------------

/** Every name bound anywhere in the plan (`let`, `for`, a component's own name
 *  and params) — a global, conservative superset of "in scope": never wrongly
 *  picks a name that IS bound somewhere, occasionally more cautious than a
 *  precise scope walk would be, never unsound. */
function collectBoundNames(plan: PlanNode): Set<string> {
  const names = new Set<string>();
  const visit = (stmts: Statement[]): void => {
    for (const s of stmts) {
      if (s.kind === "let") names.add(s.name);
      if (s.kind === "for") names.add(s.varName);
      for (const body of statementBodies(s)) visit(body);
    }
  };
  visit(plan.body);
  for (const comp of plan.components.values()) {
    names.add(comp.name);
    for (const p of comp.params) names.add(p);
    visit(comp.body);
  }
  return names;
}

/** The first of `i, j, k, n, idx` neither bound anywhere in the plan nor used
 *  (as any identifier token) inside the run's own source text, or `undefined`
 *  if all five are taken. */
function pickLoopVar(bound: Set<string>, runSource: string): string | undefined {
  const used = new Set(
    lex(runSource)
      .tokens.filter((t) => t.type === "ident")
      .map((t) => t.value),
  );
  return LOOP_VAR_CANDIDATES.find((c) => !bound.has(c) && !used.has(c));
}

// ---- replacement printing (at the run's own nesting depth) ---------------

function indentBy(n: number, doc: Doc): Doc {
  let out = doc;
  for (let i = 0; i < n; i++) out = indent(out);
  return out;
}

/** `for <loopVar> in 0..<count> { <stmt> }`, printed through the shared leaf
 *  printer and the Doc pretty-printer — never hand-concatenated — with `depth`
 *  extra indent levels so the loop's body and closing brace land at the same
 *  column `format()` would put them at (the opening `for … {` line needs none:
 *  it is spliced in at the first statement's own column, already correct). */
function printForLoop(loopVar: string, count: number, body: LeafStatement, depth: number): string {
  const block = concat(["{", indent(concat([hardline, statementText(body)])), hardline, "}"]);
  return printDoc(indentBy(depth, concat([`for ${loopVar} in 0..${count} `, block])), PRINT_WIDTH);
}

// ---- token counting (the shortening gate) ---------------------------------

const tokenCount = (text: string): number => lex(text).tokens.filter((t) => t.type !== "eof").length;

// ---- the proof obligation --------------------------------------------------

interface ProofPipeline {
  ok: boolean;
  diagnostics: Diagnostic[];
  pages: string[];
}

/** A self-contained rebuild of `compile()`'s pipeline (parse → link → resolve →
 *  render), deliberately NOT imported from `index.js`: `index.ts` re-exports
 *  `reroll`, so importing `compile` back from there would be a cycle. Every
 *  module reached here sits at (or below) `index.ts`'s own layer. */
function compileForProof(source: string): ProofPipeline {
  const { plan, diagnostics: parseDiags } = parse(source, BUILTIN_REGISTRY);
  if (!plan) return { ok: false, diagnostics: parseDiags, pages: [] };
  const linked = link(plan, NULL_WORLD, BUILTIN_REGISTRY);
  const resolved = resolveAll(linked.plan, BUILTIN_REGISTRY, NULL_WORLD);
  const diagnostics = [...parseDiags, ...linked.diagnostics, ...resolved.diagnostics];
  if (diagnostics.some((d) => d.severity === "error")) return { ok: false, diagnostics, pages: [] };
  const pages =
    resolved.levels.length > 0
      ? resolved.levels.map((l) => renderSvg(toScene(l.ir, {}, { registry: BUILTIN_REGISTRY }), {}))
      : [renderSvg(toScene(resolved.ir, {}, { registry: BUILTIN_REGISTRY }), {})];
  return { ok: true, diagnostics, pages };
}

const diagTriples = (ds: Diagnostic[]): string[] =>
  ds.map((d) => JSON.stringify([d.code, d.severity, d.message])).sort();
const lintPairs = (ds: Diagnostic[]): string[] => ds.map((d) => JSON.stringify([d.code, d.message])).sort();
const sameMultiset = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Does applying `replacement` over `[span.start, span.end)` of `source` prove
 *  fully equivalent? See the module doc's proof-obligation list. */
function proves(
  source: string,
  span: Span,
  replacement: string,
  baseline: { pipeline: ProofPipeline; describe: SceneSummary; lintPairs: string[] },
): boolean {
  const twin = source.slice(0, span.start) + replacement + source.slice(span.end);
  const twinPipeline = compileForProof(twin);
  if (!twinPipeline.ok) return false;
  if (twinPipeline.pages.length !== baseline.pipeline.pages.length) return false;
  if (twinPipeline.pages.some((svg, i) => svg !== baseline.pipeline.pages[i])) return false;
  if (!sameMultiset(diagTriples(twinPipeline.diagnostics), diagTriples(baseline.pipeline.diagnostics))) return false;
  if (!deepEqual(describe(twin), baseline.describe)) return false;
  if (!sameMultiset(lintPairs(lint(twin)), baseline.lintPairs)) return false;
  return true;
}

// ---- run detection ----------------------------------------------------------

function isEligible(s: Statement): boolean {
  return !BLOCK_KINDS.has(s.kind) && s.kind !== "error" && "id" in s && s.id === "";
}

interface RunFound {
  length: number;
  slots: number[][];
}

/** The longest AP-valid, structurally-uniform run starting exactly at `start`
 *  (trimming from the tail when the maximal structural match's progression
 *  breaks partway through), or `null` if none of length ≥ 3 qualifies. */
function findRun(stmts: Statement[], start: number): RunFound | null {
  const first = stmts[start]!;
  if (!isEligible(first)) return null;
  let end = start + 1;
  while (end < stmts.length && isEligible(stmts[end]!) && stmts[end]!.kind === first.kind) end++;
  for (let len = end - start; len >= 3; len--) {
    const slots = collectSlots(stmts.slice(start, start + len));
    if (slots?.every(isArithmeticProgression)) return { length: len, slots };
  }
  return null;
}

/** Build the offered suggestion for a matched run, or `undefined` if it fails
 *  the token-shortening gate, has no free loop variable, or fails the proof
 *  obligation. */
function buildSuggestion(
  source: string,
  stmts: Statement[],
  start: number,
  run: RunFound,
  depth: number,
  bound: Set<string>,
  baseline: { pipeline: ProofPipeline; describe: SceneSummary; lintPairs: string[] },
): RerollSuggestion | undefined {
  const group = stmts.slice(start, start + run.length);
  const spanStart = group[0]!.span!.start;
  const spanEnd = group[group.length - 1]!.span!.end;
  const runSource = source.slice(spanStart, spanEnd);

  const loopVar = pickLoopVar(bound, runSource);
  if (!loopVar) return undefined;

  const replacements: (Expr | undefined)[] = run.slots.map((vals) => {
    if (vals.every((v) => v === vals[0])) return undefined;
    return slotExpr(vals[0]!, vals[1]! - vals[0]!, loopVar);
  });
  const bodyStmt = buildReplacement(group[0], replacements) as LeafStatement;
  const replacement = printForLoop(loopVar, run.length, bodyStmt, depth);

  const tokensBefore = tokenCount(runSource);
  const tokensAfter = tokenCount(replacement);
  if (tokensAfter >= tokensBefore) return undefined;

  const span: Span = { start: spanStart, end: spanEnd };
  if (!proves(source, span, replacement, baseline)) return undefined;

  return { span, replacement, count: run.length, loopVar, tokensBefore, tokensAfter };
}

/**
 * Detect runs of ≥3 consecutive statements in arithmetic progression across
 * every statement list in `source` (the plan body, a component body, a
 * `for`/`if`/`while` body, a `level`, a `zone`) and offer a proven-equivalent
 * `for` loop for each. Pure and synchronous; returns `[]` on a plan that fails
 * to parse or carries any error diagnostic (compile or resolve) — nothing is
 * ever offered against a broken plan.
 */
export function reroll(source: string, _opts: RerollOptions = {}): RerollSuggestion[] {
  const { plan, diagnostics: parseDiags } = parse(source);
  if (!plan || parseDiags.some((d) => d.severity === "error")) return [];

  const pipeline = compileForProof(source);
  if (!pipeline.ok) return [];
  const baseline = { pipeline, describe: describe(source), lintPairs: lintPairs(lint(source)) };
  const bound = collectBoundNames(plan);

  const out: RerollSuggestion[] = [];
  function scan(stmts: Statement[], depth: number): void {
    let i = 0;
    while (i < stmts.length) {
      const run = findRun(stmts, i);
      if (run) {
        const suggestion = buildSuggestion(source, stmts, i, run, depth + 1, bound, baseline);
        if (suggestion) {
          out.push(suggestion);
          i += run.length;
          continue;
        }
      }
      for (const body of statementBodies(stmts[i]!)) scan(body, depth + 1);
      i++;
    }
  }
  scan(plan.body, 0);
  for (const comp of plan.components.values()) scan(comp.body, 1);
  return out;
}
