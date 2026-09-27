/**
 * W7's machine-applicable fix: `let I = A; while I < B { …; I = I + 1 }` rewritten to
 * `for I in A..B { … }`.
 *
 * Two red-team rounds moved this fix further and further from `compile()`. Round one
 * found attaching it straight from the syntactic shape check (at parse time) unsound —
 * ArchLang scoping is not local to one statement list. Round two found that even a
 * compile-and-compare proof INSIDE `compile()` was unsound in a different way: `compile()`
 * is supposed to be a pure function of its source text, but a fix depends on facts about
 * THIS PARTICULAR RUN's expansion (did the loop actually iterate? is it inside a component
 * this file happens to instantiate?) — baking that into `compile()`'s own result made the
 * fix's presence a hidden, non-obvious input-dependent side channel, and cost every caller
 * of `compile()` a second, hidden compile for every `while` whether or not anyone wanted
 * the fix.
 *
 * So the proof lives ENTIRELY OUTSIDE `compile()` now. `compile()` (`src/index.ts`) only
 * ever emits the two advisory warnings, from `src/while-deprecation.ts`, never a fix.
 * {@link proveWhileFixes} is a separate, opt-in entry point — today, the only caller is
 * `arch fix` (`src/cli/commands-author.ts`) — that:
 *
 *   1. Uses {@link canonicalShapeAt} as a cheap syntactic pre-filter (unchanged from
 *      round one).
 *   2. Applies a NON-VACUITY gate: a candidate is considered only if its `while` actually
 *      ran at least one iteration in THIS compile of THIS file — recorded by the resolver
 *      itself as it expands (`ResolvedPlan._executedWhileSpans`, `src/ir.ts`), which for
 *      free also declines a site inside a component this file never instantiates (a
 *      library compiled standalone, or one behind a dead `if` branch: `expandScope` never
 *      visits either, so nothing is ever recorded for them) and a plan that resolved to
 *      nothing (`W_EMPTY_PLAN`) or that failed to resolve at all.
 *   3. Tiers the result: `machine-applicable` only for a site at PLAN LEVEL (not inside
 *      any component) — a component's own fix is `maybe-incorrect`, because the proof
 *      only ever covers how THIS file instantiates it, and an importer may call it with
 *      different arguments that make a different number of iterations run.
 *   4. Proves the survivors by compiling a candidate rewrite (the "twin") and comparing
 *      SVG/`describe()`/`lint()` to the original — computed ONCE, not per candidate.
 *
 * The BODY the fix keeps is the ORIGINAL SOURCE BYTES, sliced verbatim (comments, blank
 * lines and all) between the `while`'s `{` and the increment statement it drops — never
 * reprinted from the AST — so a fix never has to reconcile a comment against a rebuilt
 * tree; it only ever has to decide whether one sits somewhere it cannot faithfully keep it
 * (see {@link buildCandidateEdit}), and declines rather than silently drop it.
 */

import type { AssignNode, LetNode, PlanNode, Statement, WhileNode } from "./ast.js";
import type { Comment } from "./lexer.js";
import type { Diagnostic, FixEdit, FixSuggestion } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import { exprToSource } from "./expr-source.js";
import { resolvePlan } from "./analyze.js";
import type { AnalyzeOptions } from "./analyze.js";
import { whileSpanKey } from "./ir.js";
import { compile } from "./index.js";
import type { CompileResult } from "./types.js";
import { describe as describePlan } from "./describe.js";
import { lint as lintPlan } from "./lint.js";

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
 *  (arbitrarily nested through `if`/`for`/`while`/`zone` bodies — a called component's own
 *  body is deliberately NOT reached here: this is a syntactic pre-filter over one
 *  statement list's own text, and a component call's effects are exactly the kind of
 *  thing only the compile-and-compare proof can see). */
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

/** The canonical counted-loop shape the machine fix rewrites, once matched. `cond` is
 *  carried as the matched `bin "<"` node (not just its parts) so callers can read its own
 *  `span` — where the fix looks for the loop's opening `{`. */
export interface CanonicalShape {
  letStmt: LetNode;
  whileStmt: WhileNode;
  cond: Extract<Expr, { t: "bin" }>;
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
 * body reading/writing `i`, a `zone`'s scope-transparency, whether the loop ran at all, or
 * whether it is at plan level — {@link proveWhileFixes} checks every one of those before a
 * candidate this function matches may ever become a fix.
 */
export function canonicalShapeAt(body: readonly Statement[], i: number): CanonicalShape | null {
  const w = body[i];
  if (w?.kind !== "while") return null;
  const cond = w.cond;
  if (cond.t !== "bin" || cond.op !== "<" || cond.l.t !== "ref" || !cond.span) return null;
  const name = cond.l.name;
  const b = cond.r;

  const prev = body[i - 1];
  if (prev?.kind !== "let" || prev.name !== name) return null;
  if (prev.value.t === "fnlit") return null; // must bind a plain value, not a function
  const a = prev.value;

  const wbody = w.body;
  // A body of ONLY the increment rewrites to a pointless `for` with an empty body — not
  // wrong, just not useful, and not worth the extra empty-body formatting case. Decline.
  if (wbody.length < 2) return null;
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

  return { letStmt: prev, whileStmt: w, cond, name, a, b };
}

/** `{ body: <the array a while/if/for/zone/let sits in>, index: <its position>,
 *  whileStmt, insideComponent }` for every `while` reachable from a plan's own body and
 *  its locally-declared components (never through an imported component — those are a
 *  different file's parse). `insideComponent` is true for a site reached through ANY
 *  `component` body, however deeply nested inside further `if`/`for`/`zone`/`while` —
 *  the plan-level-vs-component distinction {@link proveWhileFixes} tiers applicability on. */
export interface WhileSite {
  body: readonly Statement[];
  index: number;
  whileStmt: WhileNode;
  insideComponent: boolean;
}

function collectSites(body: readonly Statement[], insideComponent: boolean, out: WhileSite[]): void {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]!;
    if (stmt.kind === "while") {
      out.push({ body, index: i, whileStmt: stmt, insideComponent });
      collectSites(stmt.body, insideComponent, out);
    } else if (stmt.kind === "if") {
      collectSites(stmt.then, insideComponent, out);
      if (stmt.else) collectSites(stmt.else, insideComponent, out);
    } else if (stmt.kind === "for" || stmt.kind === "zone" || stmt.kind === "level") {
      collectSites(stmt.body, insideComponent, out);
    }
  }
}

/** Every `while` site in `plan`'s own body plus its locally-declared components (mirrors
 *  `while-deprecation.ts`'s traversal, so every `W_WHILE_DEPRECATED` diagnostic has a
 *  matching site here — by span — to re-derive the candidate shape from). */
export function collectWhileSites(plan: PlanNode): WhileSite[] {
  const out: WhileSite[] = [];
  collectSites(plan.body, false, out);
  for (const def of plan.components.values()) collectSites(def.body, true, out);
  return out;
}

/** Comments starting in `[from, to)`, in source order. */
function commentsIn(comments: readonly Comment[], from: number, to: number): Comment[] {
  return comments.filter((c) => c.span.start >= from && c.span.start < to).sort((x, y) => x.span.start - y.span.start);
}

/** Byte offset just past the end of the line containing `offset` (the newline, if any,
 *  is NOT included — matches `diagnostics.ts`'s own `lineEnd`). */
function lineEndOf(source: string, offset: number): number {
  const nl = source.indexOf("\n", offset);
  return nl === -1 ? source.length : nl;
}

/**
 * The candidate edit for a matched {@link CanonicalShape}: one span from `let I = A`
 * through the end of the `while`, replaced by `for I in A..B { … }`.
 *
 * The BODY between `{` and the dropped increment is the ORIGINAL SOURCE BYTES, sliced
 * verbatim (comments, blank lines, exact original indentation, all of it) — never
 * reprinted from the AST — so a comment leading the body, between two kept statements, on
 * its own line, or following the whole `while` is simply never touched and survives for
 * free. The HEADER is rebuilt, so a comment trailing the `let` line, trailing the `while`
 * line (either side of its own `{`), or on its own line between the two statements — all
 * of which the merge would otherwise swallow — are carried as the body's new FIRST lines,
 * in original source order. (Not trailing the new header's own `{`: `arch fmt` itself
 * moves a comment there onto the following line, so putting one there would make the fix
 * its own `fmt`-instability; leading lines are what the formatter already agrees with.)
 * Each comment has exactly ONE owner: a comment trailing `{` is CARRIED (this paragraph)
 * and the verbatim slice below starts AFTER that comment's own line, never before it — a
 * comment carried AND left in the slice would appear twice.
 *
 * Returns `null` — decline, no fix — when:
 *   - a comment sits on the INCREMENT's own line: that statement is deleted, and unlike
 *     the header's two source lines merging into one, there is no corresponding position
 *     left for a comment attached to gone text;
 *   - the closing `}` sits on the SAME LINE as the increment (`i = i + 1 }`): the body
 *     slice ends at the increment's own start, so anything sharing its line — the
 *     increment's text included — sits AFTER that cut point, and there is no faithful
 *     single-line rewrite that drops the increment but keeps whatever follows it. A
 *     "declined, no fix" one-line loop is not a defect; misplacing `}` and reintroducing
 *     the deprecated reassignment inside the `for` would be.
 *
 * Result is `fmt`-stable exactly when the input already was: this only ever narrows one
 * span's worth of text (the loop's own two-statement header) and copies the rest verbatim,
 * so it introduces no indentation or wrapping decision `arch fmt` would ever revisit — see
 * `test/while-fix.test.ts`'s `format(fixed) === fixed` cases for the nesting depths pinned.
 */
export function buildCandidateEdit(
  shape: CanonicalShape,
  source: string,
  comments: readonly Comment[],
): FixEdit | null {
  const { letStmt, whileStmt, cond, name, a, b } = shape;
  const braceIdx = source.indexOf("{", cond.span!.end);
  if (braceIdx < 0) return null; // defensive; the grammar guarantees one

  const bodyStmts = whileStmt.body;
  const increment = bodyStmts[bodyStmts.length - 1]!;
  if (commentsIn(comments, increment.span!.end, lineEndOf(source, increment.span!.end)).length > 0) return null;

  // M2: the closing `}` must NOT share the increment's own line — otherwise the body
  // slice (which ends at the increment's START) cuts off before it, and there is no
  // faithful place left for whatever sits between the increment and `}` on that one line.
  const closeIdx = whileStmt.span!.end - 1; // the "}" itself
  if (!source.slice(increment.span!.end, closeIdx).includes("\n")) return null;

  // M1: a comment trailing `{` is CARRIED (below) — the verbatim slice must start AFTER
  // that comment's own line, never at `braceIdx + 1`, or the same text appears twice.
  // Only skip past it when such a comment actually exists: `{` with body content on the
  // SAME line (no comment) must keep that content, which starting past the whole line
  // would silently drop.
  const braceLineEnd = lineEndOf(source, braceIdx + 1);
  const trailingBrace = commentsIn(comments, braceIdx + 1, braceLineEnd);
  const innerStart = trailingBrace.length > 0 ? trailingBrace[trailingBrace.length - 1]!.span.end : braceIdx + 1;

  // Every comment the merge would otherwise swallow: trailing `let`, trailing the `while`
  // header (either side of its own `{`), and any standalone one between the two
  // statements — collected in ORIGINAL SOURCE ORDER, not by which bucket they fall in.
  const carried = [
    ...commentsIn(comments, letStmt.span!.end, whileStmt.span!.start),
    ...commentsIn(comments, cond.span!.end, braceIdx),
    ...trailingBrace,
  ].sort((x, y) => x.span.start - y.span.start);

  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const indent = baseIndentOf(source, letStmt.span!.start);
  const carriedLines = carried.map((c) => `${eol}${indent}  ${c.text}`).join("");

  // Verbatim: everything from just past `{` (and its own trailing comment, if carried
  // above) up to the START of the increment, with only its own trailing indentation
  // (never a newline) trimmed off — the increment's line disappears, the blank line it
  // leaves does not.
  const inner = source.slice(innerStart, increment.span!.start).replace(/[ \t]*$/, "");

  // The closing `}`'s OWN original indentation, read from the source rather than assumed
  // — faithful even when the block's indent style is unusual. Safe now that M2 above
  // guarantees `}` is on a line of its own, below the increment's.
  let closeLineStart = closeIdx;
  while (closeLineStart > 0 && source[closeLineStart - 1] !== "\n") closeLineStart--;
  const closeIndent = source.slice(closeLineStart, closeIdx);

  const header = `for ${name} in ${exprToSource(a)}..${exprToSource(b)} {`;
  const newText = `${header}${carriedLines}${inner}${closeIndent}}`;
  return { span: { start: letStmt.span!.start, end: whileStmt.span!.end }, newText };
}

/** Leading whitespace of the line containing `offset` — used only to indent a carried
 *  between-statements comment one level into the body. */
function baseIndentOf(source: string, offset: number): string {
  let start = offset;
  while (start > 0 && source[start - 1] !== "\n") start--;
  return /^[ \t]*/.exec(source.slice(start, offset))?.[0] ?? "";
}

/** A `{code, message}` multiset, order-independent, spans never included (a rewrite always
 *  shifts every byte offset below it, so a span diff proves nothing about SOUNDNESS). */
function diagnosticKeys(ds: readonly { code?: string; message: string }[]): string[] {
  return ds.map((d) => `${d.code ?? ""}\u0000${d.message}`).sort();
}

/** `diagnosticKeys(ds)`, with exactly ONE occurrence of `code` at `span` removed first —
 *  the target `W_WHILE_DEPRECATED` this candidate is proving a fix FOR. Every other
 *  diagnostic, deprecation-coded or not, must still appear in the TWIN unchanged: this is
 *  what catches an edit that accidentally drops or (M2's bug) re-adds one. */
function keysMinusOne(
  ds: readonly { code?: string; message: string; span?: { start: number; end: number } }[],
  code: string,
  span: { start: number; end: number },
): string[] {
  let removed = false;
  const keys: string[] = [];
  for (const d of ds) {
    if (!removed && d.code === code && d.span && d.span.start === span.start && d.span.end === span.end) {
      removed = true;
      continue;
    }
    keys.push(`${d.code ?? ""}\u0000${d.message}`);
  }
  return keys.sort();
}

/** Options {@link proveWhileFixes} takes — the same two fields a compile's own scoping
 *  can vary (`AnalyzeOptions` is `Pick<CompileOptions, "plugins" | "world">`). */
export type ProveWhileFixesOptions = AnalyzeOptions;

/** Already-computed results a caller (`arch fix`) may hand in so `proveWhileFixes` does
 *  not redundantly recompute the ORIGINAL's `compile()`/`lint()` — it already needed both
 *  to know a `W_WHILE_DEPRECATED` diagnostic exists at all. Both must have been produced
 *  with the SAME `source` and `opts` this call receives, `noCache: true`; a mismatched
 *  pair would silently prove against the wrong source, so a caller unsure just omits this
 *  and pays for one extra `compile()`/`lint()` — still one twin cheaper than the original
 *  design (see this function's own doc comment). */
export interface PrecomputedOriginal {
  compile: CompileResult;
  lint: readonly Diagnostic[];
}

/** One proven fix, paired with the `W_WHILE_DEPRECATED` diagnostic span it belongs to —
 *  a caller (`arch fix`) matches it back onto that diagnostic by `span.start`/`span.end`. */
export interface ProvenWhileFix {
  span: { start: number; end: number };
  fix: FixSuggestion;
}

/**
 * Prove every candidate `while`→`for` rewrite `source` offers, and return the ones that
 * pass — see this module's header for the full design. NEVER called by `compile()`;
 * today's only caller is `arch fix` (`src/cli/commands-author.ts`).
 *
 * `describe()`/`lint()` of the ORIGINAL are computed once, hoisted out of the per-
 * candidate loop — proving N candidates costs one extra parse/resolve pass (for the
 * non-vacuity gate) plus N twin compiles, not N times the whole original pipeline. Pass
 * `precomputed` to also skip the ORIGINAL's own `compile()`/`lint()` when the caller
 * already has both (see {@link PrecomputedOriginal}).
 */
export function proveWhileFixes(
  source: string,
  opts: ProveWhileFixesOptions = {},
  precomputed?: PrecomputedOriginal,
): ProvenWhileFix[] {
  const original = precomputed?.compile ?? compile(source, { ...opts, noCache: true });
  if (!original.ast || original.diagnostics.some((d) => d.severity === "error")) return [];
  const whileDiags = original.diagnostics.filter(
    (d) => d.code === "W_WHILE_DEPRECATED" && d.file === undefined && d.span,
  );
  if (whileDiags.length === 0) return [];

  // Non-vacuity: which `while` spans actually ran >= 1 iteration in THIS compile, across
  // every storey. A separate resolve (parse is memoized, so this is one extra link+resolve
  // pass, not a second full pipeline) — `compile()` does not expose the internal IR this
  // needs, by design (see this module's header on why that proof stays out of `compile()`).
  const analysis = resolvePlan(source, opts);
  const irs = analysis.levels.length > 0 ? analysis.levels.map((l) => l.ir) : analysis.ir ? [analysis.ir] : [];
  const executed = new Set<string>();
  for (const ir of irs) for (const k of ir._executedWhileSpans) executed.add(k);

  const plan = original.ast;
  const comments = plan.comments ?? [];
  const sites = collectWhileSites(plan);
  const origPages = original.pages ? original.pages.map((p) => p.svg) : [original.svg];
  const origDesc = describePlan(source, opts);
  const origLint = precomputed?.lint ?? lintPlan(source, opts);

  const out: ProvenWhileFix[] = [];
  for (const d of whileDiags) {
    const site = sites.find((s) => s.whileStmt.span!.start === d.span!.start && s.whileStmt.span!.end === d.span!.end);
    if (!site) continue;
    if (!executed.has(whileSpanKey(site.whileStmt, undefined))) continue; // never ran

    const shape = canonicalShapeAt(site.body, site.index);
    if (!shape) continue;
    const edit = buildCandidateEdit(shape, source, comments);
    if (!edit) continue; // an unplaceable comment, or an unsafe `}` — decline, not guess

    const candidateSource = source.slice(0, edit.span.start) + edit.newText + source.slice(edit.span.end);
    const twin = compile(candidateSource, { ...opts, noCache: true });
    if (twin.diagnostics.some((x) => x.severity === "error")) continue;

    const twinPages = twin.pages ? twin.pages.map((p) => p.svg) : [twin.svg];
    if (twinPages.length !== origPages.length || twinPages.some((s, i) => s !== origPages[i])) continue;

    // describe()'s own `diagnostics`: the ORIGINAL's full set, minus exactly the ONE
    // `W_WHILE_DEPRECATED` this candidate targets, must equal the TWIN's full set —
    // never a blanket strip of every deprecation code (see `isDeprecationCode`'s doc).
    const twinDesc = describePlan(candidateSource, opts);
    const origDescKeys = keysMinusOne(origDesc.diagnostics, "W_WHILE_DEPRECATED", d.span!);
    const twinDescKeys = diagnosticKeys(twinDesc.diagnostics);
    if (JSON.stringify(origDescKeys) !== JSON.stringify(twinDescKeys)) continue;
    const stripDesc = (s: typeof origDesc) => ({ ...s, diagnostics: undefined });
    if (JSON.stringify(stripDesc(origDesc)) !== JSON.stringify(stripDesc(twinDesc))) continue;

    // `lint()` never raises either deprecation code today, so this is already the same
    // comparison as before — stated as the general rule (no filtering) for consistency.
    const twinLintKeys = diagnosticKeys(lintPlan(candidateSource, opts));
    if (JSON.stringify(diagnosticKeys(origLint)) !== JSON.stringify(twinLintKeys)) continue;

    out.push({
      span: { start: d.span!.start, end: d.span!.end },
      fix: {
        title: `rewrite the counted \`while\` loop over "${shape.name}" as \`for\``,
        applicability: site.insideComponent ? "maybe-incorrect" : "machine-applicable",
        fixId: "while-to-for",
        edits: [edit],
      },
    });
  }
  return out;
}
