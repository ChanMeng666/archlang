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
 *    literals form an EXACT (binary, not printed-form) arithmetic progression in
 *    statement order: `vals[0] + j*d === vals[j]` for every `j` — so the public
 *    `scene`/SVG built from the substituted `loopVar*d` expression is
 *    byte-identical to the one built from the original literals, not merely
 *    equal once rounded for display;
 *  - every other token is identical, including strings/labels (v1: a string slot
 *    must be identical, not just its printed form — no numeric interpolation
 *    inside a string may vary across the run);
 *  - no statement carries an explicit `id=` (auto-ids only — an id can't be
 *    generated inside a loop);
 *  - no `#` comment falls inside the run, or trails its last statement (the
 *    formatter preserves comments; a refactor must never be lossier than it).
 *
 * Each surviving candidate is gated by a PROOF OBLIGATION (apply the edit, compile
 * the twin, and require: no new error, byte-identical SVG per page, deep-equal
 * `describe()` MODULO its own `diagnostics` — compared separately as a
 * `{code,severity,message}` multiset, exactly like lint/compile diagnostics, so a
 * warning ON the run does not fail the proof over a byte span that legitimately
 * shifted — and a token-count gate (the loop must be genuinely shorter, by the
 * lexer's own count) before it is offered. Pure and synchronous — no I/O, no
 * mutation of the parsed `PlanNode`.
 *
 * The proof obligation calls `compileUncached` from `pipeline.ts` — the SAME
 * pipeline `compile()` wraps with its memoization cache — rather than
 * re-deriving parse→link→resolve→render here, so the two can never drift
 * apart (one compile pipeline). `reroll` never calls itself while proving a
 * twin (no recursion).
 *
 * PERFORMANCE (the LSP calls this on every code-action request): detection
 * (structural matching + printing a replacement) is cheap; PROVING a candidate
 * — compiling, describing and linting the twin — is not. `detectCandidates`
 * therefore never proves; {@link reroll} proves every candidate it found,
 * while `rerollInRange` (used by `refactorActions`) filters candidates to those
 * touching a byte range FIRST and proves only the survivors. The ORIGINAL
 * source's own compile/describe/lint (`getBaseline`) is memoized in a single
 * slot keyed by source text (+ `world`/`plugins` identity), so repeat requests
 * on an unchanged document (an editor re-asking on every selection change)
 * recompute nothing. A FAILED baseline (a parse error or any error diagnostic)
 * is never memoized — the failure may live in an imported module the same
 * `world` will read fixed on the next call — and `clearCache()` empties the
 * slot (`resetRerollCache`), as it does the compile cache.
 */

import type { PlanNode, Statement } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { compileUncached } from "./pipeline.js";
import type { CompileOptions, CompileResult } from "./types.js";
import { describe, type SceneSummary } from "./describe.js";
import { lint } from "./lint.js";
import { statementBodies } from "./cursor.js";
import { concat, type Doc, hardline, indent, printDoc } from "./doc.js";
import { statementText, type LeafStatement } from "./statement-print.js";
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

/** Options `reroll` shares with `compile()` — append-only. */
export interface RerollOptions {
  /**
   * Environment seam for `import` resolution (and `now`), exactly as
   * `compile(src, { world })` takes it — so a plan whose statements come from
   * an `import`ed module can still be proven. Default: a no-op World (nothing
   * readable), matching `compile()`'s own default.
   */
  world?: CompileOptions["world"];
  /** Third-party element definitions, as `compile(src, { plugins })` takes them. */
  plugins?: CompileOptions["plugins"];
}

// Matches format.ts's own print width — the pretty-printer's fixed point.
const PRINT_WIDTH = 80;

const BLOCK_KINDS = new Set<Statement["kind"]>(["for", "if", "while", "level", "zone"]);
const LOOP_VAR_CANDIDATES = ["i", "j", "k", "n", "idx"];

/** Do two byte spans touch (share ≥1 byte, or a shared endpoint)? Mirrors
 *  `lsp.ts`'s own `spansTouch` — duplicated rather than imported (`lsp.ts`
 *  already imports THIS module; importing it back would be a cycle). */
const spansTouch = (a: Span, b: Span): boolean => a.start <= b.end && a.end >= b.start;

/** Are offsets `a` and `b` on the same source line (no `\n` between them,
 *  either order)? Mirrors `format.ts`'s own trailing-comment test. */
const sameLine = (a: number, b: number, src: string): boolean =>
  !src.slice(Math.min(a, b), Math.max(a, b)).includes("\n");

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
 * entry the slot's value across the whole run, in run order — EVERY numeric
 * slot, constant or varying: the `isExprNum` branch is checked before any
 * reference/primitive shortcut, so a constant literal is recorded the same way
 * a varying one is, and {@link buildReplacement}'s identical ordering (it also
 * checks `isExprNum` first) stays in lockstep BY CONSTRUCTION rather than by
 * the two traversals happening to agree. Returns `null` the moment the
 * statements are NOT the same shape modulo numeric literals: a differing key
 * set, a differing non-numeric primitive, or a differing string (a `str`
 * `Expr` is opaque — required byte-for-byte, per v1).
 *
 * @internal Exported for `test/reroll-findrun-oracle.test.ts` (the pairwise
 * lemma {@link findRun} relies on) — not part of the public surface.
 */
export function collectSlots(nodes: unknown[]): number[][] | null {
  const slots: number[][] = [];
  function visit(vs: unknown[]): boolean {
    const v0 = vs[0];
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
    // A true primitive (string/number/boolean/undefined) — never a `num`/`str`
    // Expr node (those are handled above), so this must be exactly equal.
    return vs.every((v) => v === v0);
  }
  return visit(nodes) ? slots : null;
}

/** EXACT binary arithmetic progression: `vals[0] + j*d === vals[j]` for every
 *  `j`, no rounding. A progression that only agrees once printed (`100.1,
 *  100.2, 100.3` — IEEE-754 doubles a fraction of a unit apart) is refused: the
 *  substituted `a + loopVar*d` expression must reproduce the exact `scene`
 *  values the literals did, not merely their displayed form.
 *
 *  @internal Exported for `test/reroll-findrun-oracle.test.ts` (prefix
 *  closure, which {@link findRun} relies on) — not part of the public surface. */
export function isArithmeticProgression(vals: number[]): boolean {
  if (vals.every((v) => v === vals[0])) return true; // constant — trivially fine, not "differing"
  const d = vals[1]! - vals[0]!;
  for (let j = 0; j < vals.length; j++) {
    if (vals[0]! + j * d !== vals[j]!) return false;
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

// ---- replacement printing (at the run's own nesting depth, source EOL) ---

function indentBy(n: number, doc: Doc): Doc {
  let out = doc;
  for (let i = 0; i < n; i++) out = indent(out);
  return out;
}

/** `for <loopVar> in 0..<count> { <stmt> }`, printed through the shared leaf
 *  printer and the Doc pretty-printer — never hand-concatenated — with `depth`
 *  extra indent levels so the loop's body and closing brace land at the same
 *  column `format()` would put them at (the opening `for … {` line needs none:
 *  it is spliced in at the first statement's own column, already correct).
 *  `eol` is `"\r\n"` when the SOURCE uses CRLF (detected once, over the whole
 *  file, by the caller) — `printDoc` always emits `"\n"`, so a CRLF source
 *  gets its replacement's newlines translated to match, or the spliced-in loop
 *  would be the one CRLF file's one block of LF line endings. */
function printForLoop(loopVar: string, count: number, body: LeafStatement, depth: number, eol: string): string {
  const block = concat(["{", indent(concat([hardline, statementText(body)])), hardline, "}"]);
  const text = printDoc(indentBy(depth, concat([`for ${loopVar} in 0..${count} `, block])), PRINT_WIDTH);
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

// ---- token counting (the shortening gate) ---------------------------------

const tokenCount = (text: string): number => lex(text).tokens.filter((t) => t.type !== "eof").length;

// ---- comment-loss guard (MAJOR 2) -----------------------------------------

/** Does any `#` comment fall inside `[start, end)`, or trail the byte AT
 *  `end` (same source line, so it visually trails the run's last statement)?
 *  The formatter (`format.ts`) preserves every comment by weaving it back in
 *  by position; a refactor that deletes one by silently overwriting its span
 *  would be lossier than `format`, which this project never accepts. */
function commentInOrTrailingRun(
  comments: readonly { span: Span }[],
  start: number,
  end: number,
  source: string,
): boolean {
  return comments.some((c) => {
    if (c.span.start >= start && c.span.start < end) return true; // swallowed by the splice
    if (c.span.start >= end && sameLine(end, c.span.start, source)) return true; // trails the last statement
    return false;
  });
}

// ---- the proof obligation --------------------------------------------------

interface ProofPipeline {
  ok: boolean;
  diagnostics: Diagnostic[];
  pages: string[];
}

/** A `describe()` result split into its diagnostics (compared separately, as a
 *  multiset — see {@link Baseline}) and everything else (compared deep-equal). */
type DescribeFacts = Omit<SceneSummary, "diagnostics">;

/** Project a full `compile()` result down to what the proof obligation
 *  compares: whether it errored, its diagnostics, and one SVG string per page
 *  (a single-storey result's own `svg` is its one page). */
function toProofPipeline(result: CompileResult): ProofPipeline {
  return {
    ok: result.errors.length === 0,
    diagnostics: result.diagnostics,
    pages: result.pages ? result.pages.map((p) => p.svg) : [result.svg],
  };
}

/**
 * Compile `source` through the SAME pipeline `compile()` uses — see this
 * module's header — carrying `pipelineOpts` (the `world`/`plugins` `reroll`
 * was given) so an `import`-bearing plan proves against the same modules
 * `compile()` would resolve.
 *
 * @internal Exported for `test/reroll.test.ts` to drive the proof obligation
 * directly (a deliberately WRONG replacement, to prove each of its checks
 * actually rejects something) — not part of the package's public surface
 * (`src/index.ts` does not re-export it).
 */
export function compileForProof(source: string, pipelineOpts: CompileOptions): ProofPipeline {
  return toProofPipeline(compileUncached(source, pipelineOpts));
}

const diagTriples = (ds: Diagnostic[]): string[] =>
  ds.map((d) => JSON.stringify([d.code, d.severity, d.message])).sort();
const lintPairs = (ds: Diagnostic[]): string[] => ds.map((d) => JSON.stringify([d.code, d.message])).sort();
const sameMultiset = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Split a `describe()` result into its diagnostics (own multiset comparison)
 *  and the rest of the facts (deep-equal, diagnostics removed so a warning's
 *  byte SPAN shifting because the run's length changed never fails the proof
 *  over bytes nothing downstream reads a diagnostic's span to redraw). */
function describeFacts(s: SceneSummary): DescribeFacts {
  const { diagnostics: _diagnostics, ...rest } = s;
  return rest;
}

/** The whole-plan baseline a candidate's twin is compared against: the
 *  original's own compile/describe/lint, computed once per source text (see
 *  {@link getBaseline}'s memo). */
interface Baseline {
  pipeline: ProofPipeline;
  describeFacts: DescribeFacts;
  describeDiagTriples: string[];
  lintPairs: string[];
}

/**
 * Does applying `replacement` over `[span.start, span.end)` of `source` prove
 * fully equivalent to `baseline`? See the module doc's proof-obligation list.
 * `pipelineOpts` (`reroll`'s own `world`/`plugins`) is threaded through every
 * stage so an `import`-bearing plan's twin resolves the same modules the
 * original did.
 *
 * @internal Exported for `test/reroll.test.ts` to call directly with a
 * deliberately wrong `replacement` (proving each check — SVG, describe, lint,
 * diagnostics — actually rejects a mismatch, not just happening to pass on
 * `reroll`'s own always-correct replacements). Not part of the public surface.
 */
export function proves(
  source: string,
  span: Span,
  replacement: string,
  pipelineOpts: CompileOptions,
  baseline: Baseline,
): boolean {
  const twin = source.slice(0, span.start) + replacement + source.slice(span.end);
  const twinPipeline = compileForProof(twin, pipelineOpts);
  if (!twinPipeline.ok) return false;
  if (twinPipeline.pages.length !== baseline.pipeline.pages.length) return false;
  if (twinPipeline.pages.some((svg, i) => svg !== baseline.pipeline.pages[i])) return false;
  if (!sameMultiset(diagTriples(twinPipeline.diagnostics), diagTriples(baseline.pipeline.diagnostics))) return false;
  const twinDescribe = describe(twin, pipelineOpts);
  if (!deepEqual(describeFacts(twinDescribe), baseline.describeFacts)) return false;
  if (!sameMultiset(diagTriples(twinDescribe.diagnostics), baseline.describeDiagTriples)) return false;
  if (!sameMultiset(lintPairs(lint(twin, pipelineOpts)), baseline.lintPairs)) return false;
  return true;
}

// ---- run detection (cheap: no compile) -------------------------------------

function isEligible(s: Statement): boolean {
  return !BLOCK_KINDS.has(s.kind) && s.kind !== "error" && "id" in s && s.id === "";
}

/** @internal Exported only for `test/reroll-findrun-oracle.test.ts`. */
export interface RunFound {
  length: number;
  slots: number[][];
}

/** @internal The shape of {@link findRun}, so a test can drive {@link rerollWith}
 *  with an oracle finder. */
export type RunFinder = (stmts: Statement[], start: number) => RunFound | null;

/**
 * The longest AP-valid, structurally-uniform run starting exactly at `start`,
 * or `null` if none of length ≥ 3 qualifies. The contract is "the LONGEST
 * length `len` in `[3, W]` (W = the maximal window of eligible same-kind
 * statements) for which `collectSlots(run)` is non-null and every slot passes
 * {@link isArithmeticProgression}", with that run's `collectSlots` as `slots`
 * — exactly what trying every length from W down to 3 returns
 * (`test/reroll-findrun-oracle.test.ts` pins that equality against the old
 * shrinking search, kept verbatim there as the oracle).
 *
 * It is found in ONE forward pass, because the valid lengths are
 * downward-closed (valid at `len` ⇒ valid at every `len' ∈ [2, len]`):
 *  1. `collectSlots([n0 … nL])` is non-null iff every `collectSlots([n0, ni])`
 *     is: each check in its `visit` is `n0` vs `ni` (a key set, a string, an
 *     array length, a primitive `===`, "is a num"), and which branch runs — so
 *     how the walk descends — is chosen by `n0`'s node alone.
 *  2. For the same reason the slot SEQUENCE (how many, in what order) is fixed
 *     by `n0` alone, so slot `k` of the whole run is `[v0, v1, …]` where `vi`
 *     is slot `k`'s second entry in `collectSlots([n0, ni])`.
 *  3. {@link isArithmeticProgression} is prefix-closed: a constant list's
 *     prefix is constant, and a non-constant one's prefix of length ≥ 2 has the
 *     same `d = v1 − v0` and checks a subset of the same `v0 + j*d === vj`
 *     terms (or is constant, which also passes).
 * So each slot keeps two running flags — "constant so far" (`vj === v0`) and
 * "progression so far" (`v0 + j*d === vj`, the same operands and operation
 * order as {@link isArithmeticProgression}, `j = 0` included) — and the run
 * extends one statement at a time until the window ends, a pair fails
 * structurally, or some slot has neither flag left. The token-count gate and
 * the comment guard are NOT part of this contract: they run afterwards in
 * {@link buildCandidate}, which never asks for a shorter run, exactly as
 * before. Cost: O(run length × statement size) per start, where the shrinking
 * search was cubic on long non-progression windows.
 *
 * @internal Exported for `test/reroll-findrun-oracle.test.ts`.
 */
export function findRun(stmts: Statement[], start: number): RunFound | null {
  const first = stmts[start]!;
  if (!isEligible(first)) return null;
  // Per slot k: the values seen so far, the step d (fixed at j = 1) and the two
  // running flags. Allocated at j = 1, when the slot sequence is first known.
  let slots: number[][] = [];
  let steps: number[] = [];
  let constant: boolean[] = [];
  let progression: boolean[] = [];
  let len = 1;
  for (let i = start + 1; i < stmts.length; i++) {
    const s = stmts[i]!;
    if (!isEligible(s) || s.kind !== first.kind) break;
    const pair = collectSlots([first, s]);
    if (!pair) break;
    const j = i - start;
    if (j === 1) {
      slots = pair.map(([v0, v1]) => [v0!, v1!]);
      steps = pair.map(([v0, v1]) => v1! - v0!);
      // `every(v => v === vals[0])` over [v0, v1]: its `v0 === v0` term is implied by
      // `v1 === v0` (both are false only for NaN), so it is left out.
      constant = pair.map(([v0, v1]) => v1 === v0);
      // The j = 0 term is not trivially true: `0 * d` is NaN when d is ±Infinity or NaN.
      progression = pair.map(([v0, v1], k) => v0! + 0 * steps[k]! === v0 && v0! + 1 * steps[k]! === v1);
    } else {
      const next = pair.map(([v0, vj], k) => ({
        vj: vj!,
        c: constant[k]! && vj === v0,
        p: progression[k]! && v0! + j * steps[k]! === vj,
      }));
      // Length j+1 (≥ 3 here) is invalid, and (downward-closed) so is every longer one.
      if (!next.every((n) => n.c || n.p)) break;
      next.forEach((n, k) => {
        slots[k]!.push(n.vj);
        constant[k] = n.c;
        progression[k] = n.p;
      });
    }
    len = j + 1;
  }
  return len >= 3 ? { length: len, slots } : null;
}

/** A structurally-detected, UNPROVEN run: everything {@link RerollSuggestion}
 *  carries, before the (expensive) proof obligation runs. */
type Candidate = RerollSuggestion;

/** Build the candidate for a matched run, or `undefined` if it fails the
 *  comment-loss guard, has no free loop variable, or fails the token-shortening
 *  gate. Does NOT prove — see {@link proves} — so this is cheap enough to run
 *  over every run in the plan regardless of what the caller ends up proving. */
function buildCandidate(
  source: string,
  comments: readonly { span: Span }[],
  eol: string,
  stmts: Statement[],
  start: number,
  run: RunFound,
  depth: number,
  bound: Set<string>,
): Candidate | undefined {
  const group = stmts.slice(start, start + run.length);
  const spanStart = group[0]!.span!.start;
  const spanEnd = group[group.length - 1]!.span!.end;
  if (commentInOrTrailingRun(comments, spanStart, spanEnd, source)) return undefined;
  const runSource = source.slice(spanStart, spanEnd);

  const loopVar = pickLoopVar(bound, runSource);
  if (!loopVar) return undefined;

  const replacements: (Expr | undefined)[] = run.slots.map((vals) => {
    if (vals.every((v) => v === vals[0])) return undefined;
    return slotExpr(vals[0]!, vals[1]! - vals[0]!, loopVar);
  });
  const bodyStmt = buildReplacement(group[0], replacements) as LeafStatement;
  const replacement = printForLoop(loopVar, run.length, bodyStmt, depth, eol);

  const tokensBefore = tokenCount(runSource);
  const tokensAfter = tokenCount(replacement);
  if (tokensAfter >= tokensBefore) return undefined;

  return {
    span: { start: spanStart, end: spanEnd },
    replacement,
    count: run.length,
    loopVar,
    tokensBefore,
    tokensAfter,
  };
}

/** Detect every candidate run in `plan` — the plan body, every component body,
 *  and every nested `for`/`if`/`while`/`level`/`zone` body. Pure detection,
 *  no proof (see this module's header on why the two are split). */
function detectCandidates(plan: PlanNode, source: string, bound: Set<string>, find: RunFinder): Candidate[] {
  const comments = lex(source).comments;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const out: Candidate[] = [];
  function scan(stmts: Statement[], depth: number): void {
    let i = 0;
    while (i < stmts.length) {
      const run = find(stmts, i);
      if (run) {
        const candidate = buildCandidate(source, comments, eol, stmts, i, run, depth + 1, bound);
        if (candidate) {
          out.push(candidate);
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

// ---- baseline memo (one slot; see the module header) -----------------------

interface BaselineContext {
  plan: PlanNode;
  bound: Set<string>;
  pipelineOpts: CompileOptions;
  baseline: Baseline;
}

/** The one memo slot: a SUCCESSFUL baseline and the key it was computed under. */
let cached:
  | { source: string; world: CompileOptions["world"]; plugins: CompileOptions["plugins"]; ctx: BaselineContext }
  | undefined;

/**
 * Empty the baseline memo. `clearCache()` (`src/index.ts`) calls it, so an embedder that
 * clears the compile cache after an imported module changed under the same `World`
 * never gets a stale baseline back.
 *
 * @internal Not part of the public surface (`src/index.ts` does not re-export it).
 */
export function resetRerollCache(): void {
  cached = undefined;
}

/** The original source's own compile/describe/lint, needed by every candidate's
 *  proof — computed once and kept in a SINGLE slot keyed by source text (and
 *  `world`/`plugins` identity, compared by reference: the LSP always passes the
 *  same `undefined`, so its repeat requests on an unchanged document hit this
 *  every time). Returns `null` when the source fails to parse or carries any
 *  error diagnostic — nothing is ever offered against a broken plan — and that
 *  `null` is never memoized (the error may be in an imported module that the
 *  same `world` reads fixed next time). */
function getBaseline(source: string, opts: RerollOptions): BaselineContext | null {
  if (cached && cached.source === source && cached.world === opts.world && cached.plugins === opts.plugins) {
    return cached.ctx;
  }
  cached = undefined;

  const pipelineOpts: CompileOptions = { world: opts.world, plugins: opts.plugins };
  const compiled = compileUncached(source, pipelineOpts);
  if (!compiled.ast || compiled.errors.length > 0) return null;
  const plan = compiled.ast;
  const describeResult = describe(source, pipelineOpts);
  const baseline: Baseline = {
    pipeline: toProofPipeline(compiled),
    describeFacts: describeFacts(describeResult),
    describeDiagTriples: diagTriples(describeResult.diagnostics),
    lintPairs: lintPairs(lint(source, pipelineOpts)),
  };
  const ctx: BaselineContext = { plan, bound: collectBoundNames(plan), pipelineOpts, baseline };
  cached = { source, world: opts.world, plugins: opts.plugins, ctx };
  return ctx;
}

/**
 * Detect runs of ≥3 consecutive statements in arithmetic progression across
 * every statement list in `source` (the plan body, a component body, a
 * `for`/`if`/`while` body, a `level`, a `zone`) and offer a proven-equivalent
 * `for` loop for each. Pure and synchronous; returns `[]` on a plan that fails
 * to parse or carries any error diagnostic (compile or resolve) — nothing is
 * ever offered against a broken plan. `opts.world`/`opts.plugins` are threaded
 * through detection AND the proof obligation, exactly as `compile()` takes
 * them, so a plan whose statements come from an `import`ed module can still be
 * proven equivalent through the same modules.
 */
export function reroll(source: string, opts: RerollOptions = {}): RerollSuggestion[] {
  return rerollWith(source, opts, findRun);
}

/**
 * {@link reroll} with the run finder supplied by the caller.
 *
 * @internal Exported for `test/reroll-findrun-oracle.test.ts`, which runs the
 * whole pipeline once with {@link findRun} and once with the old shrinking
 * search (its oracle) and requires identical suggestions. Not part of the
 * public surface (`src/index.ts` does not re-export it).
 */
export function rerollWith(source: string, opts: RerollOptions, find: RunFinder): RerollSuggestion[] {
  const ctx = getBaseline(source, opts);
  if (!ctx) return [];
  const candidates = detectCandidates(ctx.plan, source, ctx.bound, find);
  const out: RerollSuggestion[] = [];
  for (const c of candidates) if (proves(source, c.span, c.replacement, ctx.pipelineOpts, ctx.baseline)) out.push(c);
  return out;
}

/**
 * `reroll`, filtered to candidates whose span touches `range` BEFORE the
 * (expensive) proof obligation runs — a candidate outside the request's range
 * is never compiled/described/linted at all. Used by `lsp.ts`'s `refactorActions`,
 * which an editor calls on every selection change; a candidate far from the
 * cursor costs nothing here beyond the cheap structural detection every
 * `refactorActions` call already needs to decide what touches the range.
 *
 * @internal Not part of the public surface (`src/index.ts` does not re-export
 * it) — `lsp.ts` is a sibling module in `src/` and imports it directly.
 */
export function rerollInRange(source: string, range: Span, opts: RerollOptions = {}): RerollSuggestion[] {
  const ctx = getBaseline(source, opts);
  if (!ctx) return [];
  const candidates = detectCandidates(ctx.plan, source, ctx.bound, findRun).filter((c) => spansTouch(c.span, range));
  const out: RerollSuggestion[] = [];
  for (const c of candidates) if (proves(source, c.span, c.replacement, ctx.pipelineOpts, ctx.baseline)) out.push(c);
  return out;
}
