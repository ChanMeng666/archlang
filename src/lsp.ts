/**
 * Pure language-services core for the ArchLang LSP (T5.3).
 *
 * Every function takes `(source, offset, registry?)` and returns plain data —
 * no `vscode-languageserver` types — so it is zero-dependency, isomorphic, and
 * unit-testable. The VS Code server (`editors/vscode/src/server.ts`) is a thin
 * adapter that converts byte offsets ↔ LSP ranges and these results ↔ LSP types.
 *
 * It is built on `parse()` + `lex()` (both memoized), the AST cursor
 * ({@link import("./cursor.js")}), the registry's parameter schemas, and a
 * lexical-scope walk that mirrors `ir.ts`. Hover, completion, go-to-definition,
 * rename, and signature help are all derived from the same symbol model.
 */

import type { PlanNode, Statement } from "./ast.js";
import type { FixEdit, Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import type { ParamDoc, Registry } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import { lex, type Token } from "./lexer.js";
import { parse } from "./parser.js";
import { eachExpr, eachStatement } from "./cursor.js";
import { resolvePlan } from "./analyze.js";
import { diagnosticToJson, type DiagnosticJson } from "./diagnostic-json.js";
import { rankFixes } from "./fix-apply.js";
import { canonicalFixture, FIXTURE_CATEGORIES, hasFixtureGlyph } from "./elements/fixtures-glyphs.js";
import { defaultFootprint, fixtureSpec } from "./fixtures-catalog.js";

// ---- keyword catalog (one place; T5.4 will source this from grammar/tokens) ----

const SETTING_KW: Record<string, string> = {
  units: "Drawing units (only `mm`).",
  grid: "Snap module in mm; 0 disables snapping.",
  scale: "Drawing scale, e.g. `scale 1:50`.",
  north: "North orientation: up | down | left | right | <degrees>.",
  title: "Title block (project / drawn_by / date).",
  axes: "Positioning axes (定位轴线): `axes { x at 0, 6000  y at 0, 8000 }`. Labels ①/Ⓐ are derived from position.",
  accTitle: "Accessible title for the `--accessible` SVG `<title>` (overrides the plan name).",
  accDescr: "Accessible description for the `--accessible` SVG `<desc>` (overrides the derived caption).",
  theme: 'Theme: a named base, `{ key: value }` overrides, or `from "#color"`.',
  style: "Per-element-kind style overrides (`style room { fill … }`).",
  let: "Bind a value or define a value-function: `let NAME = …` / `let f(a) = …`.",
  component: "Define a reusable parameterised sub-plan.",
  import: 'Import components from a module: `import "lib.arch": a, b`.',
};
const CONTROL_KW: Record<string, string> = {
  for: "Expand a body once per item: `for x in <array|range> { … }`.",
  if: "Conditionally expand a body: `if <cond> { … } else { … }`.",
  while: "Expand a body while a condition holds (bounded).",
  set: "Scoped default overrides for an element kind: `set door(swing: out)`.",
  place:
    "Instantiate a component as an addressable instance: `place wing() as west at (0,0) [rotate 90] [mirror x]`. " +
    "The body is authored in LOCAL coordinates from (0,0); ids inside become `west.<id>`.",
  else: "The alternative branch of an `if`.",
  in: "Separates the loop variable from its iterable in a `for`.",
};
const ENUM_KW = new Set(["up", "down", "left", "right", "out", "mm", "true", "false", "from", "as", "close", "id"]);

const BUILTIN_SIGS: Record<string, string> = {
  min: "min(a, b, …) → number",
  max: "max(a, b, …) → number",
  abs: "abs(x) → number",
  sqrt: "sqrt(x) → number",
  floor: "floor(x) → number",
  ceil: "ceil(x) → number",
  round: "round(x) → number",
  len: "len(array) → number",
  str: "str(x) → string",
};

// ---- public result shapes ----

export interface HoverResult {
  /** Markdown contents. */
  contents: string;
  /** The span the hover applies to (the token under the cursor). */
  span?: Span;
}
/** Every completion kind the core can emit — editors map these to their icon
 *  enums; typing that map `Record<CompletionKind, …>` (or checking coverage
 *  against this list) catches a newly added kind at build time instead of a
 *  silent icon fallback. */
export const COMPLETION_KINDS = ["keyword", "element", "variable", "function", "component", "enum"] as const;
export type CompletionKind = (typeof COMPLETION_KINDS)[number];
export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail?: string;
  doc?: string;
}
/** A single text replacement (span → newText). Unified with — and an alias of —
 *  the core {@link FixEdit}; both names name one shape so an LSP `TextEdit` and a
 *  diagnostic `FixEdit` are interchangeable. */
export type TextEdit = FixEdit;
export interface SignatureResult {
  label: string;
  params: string[];
  activeParameter: number;
}

// ---- token helpers ----

const inTok = (t: Token, off: number): boolean => off >= t.start && off <= t.end;

function identAt(tokens: Token[], offset: number): Token | undefined {
  return tokens.find((t) => t.type === "ident" && inTok(t, offset));
}

/** First identifier token named `name` at or after `from` (a binding's name). */
function findNameSpan(tokens: Token[], from: number, name: string): Span | undefined {
  const t = tokens.find((tk) => tk.start >= from && tk.type === "ident" && tk.value === name);
  return t ? { start: t.start, end: t.end } : undefined;
}

// ---- symbol model ----

type BindKind = "let" | "fn" | "component" | "param" | "loopvar";
interface Binding {
  name: string;
  nameSpan: Span;
  kind: BindKind;
  detail: string;
  /** Block this binding is visible in; undefined = plan-wide (global). */
  scope?: Span;
}

const fnSig = (name: string, params: string[]): string => `${name}(${params.join(", ")})`;

/** Collect every binding (lets, functions, components, params, loop vars). */
function collectBindings(plan: PlanNode, tokens: Token[]): Binding[] {
  const out: Binding[] = [];
  const letDetail = (s: Extract<Statement, { kind: "let" }>): string =>
    s.value.t === "fnlit" ? `let ${fnSig(s.name, s.value.params)} = …` : `let ${s.name} = …`;

  const visit = (stmts: Statement[], scope?: Span): void => {
    for (const s of stmts) {
      if (s.kind === "let") {
        const nameSpan = findNameSpan(tokens, s.span!.start, s.name);
        if (nameSpan)
          out.push({ name: s.name, nameSpan, kind: s.value.t === "fnlit" ? "fn" : "let", detail: letDetail(s), scope });
      } else if (s.kind === "for") {
        const nameSpan = findNameSpan(tokens, s.span!.start, s.varName);
        if (nameSpan)
          out.push({ name: s.varName, nameSpan, kind: "loopvar", detail: `for ${s.varName} in …`, scope: s.span });
        visit(s.body, s.span);
      } else if (s.kind === "if") {
        visit(s.then, s.span);
        if (s.else) visit(s.else, s.span);
      } else if (s.kind === "while") {
        visit(s.body, s.span);
      } else if (s.kind === "level") {
        // A storey's body binds like any block body (its `let`s are level-local).
        visit(s.body, s.span);
      } else if (s.kind === "zone") {
        // A zone is NOT a scope (see `expandScope`): a `let` inside one is visible after
        // the closing brace exactly as if it were not written, so its bindings are
        // collected with no `scope` span narrowing them.
        visit(s.body, undefined);
      }
    }
  };
  visit(plan.body, undefined);

  for (const comp of plan.components.values()) {
    const cstart = comp.span?.start ?? 0;
    const nameSpan = findNameSpan(tokens, cstart, comp.name);
    if (nameSpan)
      out.push({
        name: comp.name,
        nameSpan,
        kind: "component",
        detail: `component ${fnSig(comp.name, comp.params)}`,
        scope: undefined,
      });
    for (const p of comp.params) {
      const ps = findNameSpan(tokens, nameSpan ? nameSpan.end : cstart, p);
      if (ps)
        out.push({ name: p, nameSpan: ps, kind: "param", detail: `parameter ${p} of ${comp.name}`, scope: comp.span });
    }
    visit(comp.body, comp.span);
  }
  return out;
}

const inSpan = (s: Span | undefined, off: number): boolean => s !== undefined && off >= s.start && off <= s.end;

/** The binding a name resolves to at `offset` (innermost enclosing scope wins). */
function resolveBinding(bindings: Binding[], name: string, offset: number): Binding | undefined {
  let best: Binding | undefined;
  for (const b of bindings) {
    if (b.name !== name) continue;
    if (b.scope === undefined) {
      if (!best) best = b; // global — a fallback if no local matches
    } else if (inSpan(b.scope, offset)) {
      // Prefer the innermost (smallest) enclosing local scope.
      if (!best || best.scope === undefined || spanLen(b.scope) < spanLen(best.scope!)) best = b;
    }
  }
  // A local binding always shadows a global of the same name at this offset.
  const local = bindings.find((b) => b.name === name && b.scope !== undefined && inSpan(b.scope, offset));
  return local ?? best;
}
const spanLen = (s: Span): number => s.end - s.start;

// ---- reference occurrences (for rename / definition) ----

interface Ref {
  name: string;
  span: Span;
}

/** Every name *use* in the plan: variable refs, component calls, function calls. */
function collectRefs(plan: PlanNode, tokens: Token[]): Ref[] {
  const refs: Ref[] = [];
  eachExpr(plan, (e: Expr) => {
    if (e.t === "ref" && e.span) refs.push({ name: e.name, span: e.span });
    if (e.t === "call" && e.span) {
      const s = findNameSpan(tokens, e.span.start, e.callee);
      if (s) refs.push({ name: e.callee, span: s });
    }
  });
  eachStatement(plan, (s) => {
    if (s.kind === "instance") {
      const sp = findNameSpan(tokens, s.span!.start, s.name);
      if (sp) refs.push({ name: s.name, span: sp });
    }
  });
  return refs;
}

interface Analysis {
  plan: PlanNode;
  tokens: Token[];
  bindings: Binding[];
  refs: Ref[];
}

function analyze(source: string, registry: Registry): Analysis | undefined {
  const { plan } = parse(source, registry);
  if (!plan) return undefined;
  const tokens = lex(source).tokens;
  return { plan, tokens, bindings: collectBindings(plan, tokens), refs: collectRefs(plan, tokens) };
}

// ---- element signature synthesis (from the param schema) ----

function elementSignature(keyword: string, params: readonly ParamDoc[] | undefined): string {
  if (!params) return keyword;
  const parts = params.map((p) => {
    const core = p.type === "point" ? `${p.name} (x, y)` : p.type === "WxH" ? `${p.name} WxH` : `${p.name} <${p.type}>`;
    return p.optional ? `[${core}]` : core;
  });
  return `${keyword} ${parts.join(" ")}`;
}

// ---- features ----

/** Hover info for the token at `offset`, or null. */
export function hover(source: string, offset: number, registry: Registry = BUILTIN_REGISTRY): HoverResult | null {
  const a = analyze(source, registry);
  if (!a) return null;
  const tok = identAt(a.tokens, offset);
  if (!tok) return null;
  const span = { start: tok.start, end: tok.end };
  const word = tok.value;

  const def = registry.byKeyword.get(word);
  if (def) {
    const lines = [`\`\`\`arch\n${elementSignature(def.keyword, def.params)}\n\`\`\``];
    if (def.doc) lines.push(def.doc);
    for (const p of def.params ?? [])
      lines.push(`- \`${p.name}\` — ${p.doc}${p.default ? ` (default ${p.default})` : ""}`);
    return { contents: lines.join("\n\n"), span };
  }
  if (word in SETTING_KW) return { contents: `**${word}** — ${SETTING_KW[word]}`, span };
  if (word in CONTROL_KW) return { contents: `**${word}** — ${CONTROL_KW[word]}`, span };
  if (word in BUILTIN_SIGS)
    return { contents: `\`\`\`arch\n${BUILTIN_SIGS[word]}\n\`\`\`\n\nBuilt-in function.`, span };

  const b = resolveBinding(a.bindings, word, offset);
  if (b) return { contents: `\`\`\`arch\n${b.detail}\n\`\`\``, span };

  if (ENUM_KW.has(word)) return { contents: `**${word}** — a keyword value.`, span };
  return null;
}

// ---- the fixture category slot (the one position-sensitive completion) ----

/**
 * `furniture <category>` is the ONE slot in the language whose legal content is a word from a
 * named vocabulary rather than an expression, an id or a keyword — the parser reads it with a
 * bare `ctx.eatIdent()`, so no `let`, loop variable or component is usable there. That cuts
 * both ways, and both halves are the point: the whole-language item list {@link completion}
 * otherwise returns is noise in this position, and offering the 129 category words
 * UNCONDITIONALLY would flood every other completion in the language and make the feature
 * worse than nothing.
 *
 * Detection is over the TOKEN stream, never a regex on the raw text, for three reasons the
 * lexer has already settled: it has classified comments and string literals out (a
 * `label "furniture "` cannot match), it knows exactly where an identifier begins and ends —
 * so "the cursor is inside the word being typed" is a span test rather than a second
 * implementation of the identifier rule — and it survives an unparseable statement, which is
 * the normal state of the line a completion is requested on.
 */
const isIdentTok = (t: Token | undefined, value?: string): boolean =>
  t !== undefined && t.type === "ident" && (value === undefined || t.value === value);

/**
 * Does the token at `j` close a `furniture …` prefix — is the NEXT word the category? Two
 * shapes, mirroring `furniture.parse()`: `furniture ▸` and `furniture id = <name> ▸`, since
 * `parseIdOpt()` consumes the optional id BEFORE the category. `set furniture(…)` is excluded:
 * `furniture` there names the element kind whose defaults are being set, not a statement.
 */
function closesFurniturePrefix(tokens: Token[], j: number): boolean {
  if (j < 0) return false;
  if (isIdentTok(tokens[j], "furniture")) return !isIdentTok(tokens[j - 1], "set");
  return (
    isIdentTok(tokens[j]) &&
    tokens[j - 1]?.type === "equals" &&
    isIdentTok(tokens[j - 2], "id") &&
    isIdentTok(tokens[j - 3], "furniture") &&
    !isIdentTok(tokens[j - 4], "set")
  );
}

/** Is `offset` in a `furniture` statement's category slot — just after the prefix, or inside
 *  the partially-typed word that follows it? */
function inFixtureCategorySlot(tokens: Token[], offset: number): boolean {
  // The last token that CLOSED before the cursor. A token the cursor sits inside (or at either
  // end of) is the word being TYPED: it stops the scan without ever becoming the anchor, which
  // is what separates `furniture be|d` (the slot) from `furniture bed |` (the `at` after it).
  let anchor = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === "eof" || t.start > offset) break;
    if (inTok(t, offset)) break;
    anchor = i;
  }
  return closesFurniturePrefix(tokens, anchor);
}

/** `1700 × 700 mm`, or null when the family has no conventional footprint. */
function footprintText(category: string): string | null {
  const fp = defaultFootprint(category);
  return fp ? `${fp.along} × ${fp.depth} mm` : null;
}

/**
 * The fixture vocabulary as completion items, DERIVED from {@link FIXTURE_CATEGORIES} and the
 * catalog rather than retyped — a hardcoded copy of a language fact reproduces the same wrong
 * list forever however green the drift gate is (the v1.26.0 defect class).
 *
 * `kind` is the existing `"enum"` rather than a new {@link COMPLETION_KINDS} member: a category
 * is a word from a named value vocabulary, which is what `enum` already means here, and
 * appending to that exported array is a permanent public-surface commitment (three total icon
 * maps and their tests) bought for nothing but a different icon. It also gives that kind its
 * first producer — `enum` was declared and emitted by nothing.
 *
 * The list is a suggestion, not a closed set, and every item's doc says so in its last line:
 * the slot accepts any identifier, and an uncatalogued word deliberately falls back to a
 * labelled rectangle.
 */
function fixtureCategoryItems(): CompletionItem[] {
  return FIXTURE_CATEGORIES.map((word) => {
    const canon = canonicalFixture(word);
    const alias = canon !== undefined && canon !== word ? canon : null;
    const spec = fixtureSpec(word);
    const fp = footprintText(word);
    const facts: string[] = [];
    if (alias) facts.push(`another name for \`${alias}\` — one family, one symbol`);
    if (fp) facts.push(`default footprint ${fp}, so \`against wall …\` may omit \`size\``);
    if (spec?.requiresWall) facts.push("needs a wall behind it (supply / waste / venting)");
    if (spec?.directional) facts.push("has a back worth turning to a wall");
    if (spec?.underlay) facts.push("lies flat and is walked over rather than round");
    if (spec?.overhead) facts.push("hangs above the plan's cut plane, and draws dashed");
    if (spec?.clearanceMm) facts.push(`wants ${spec.clearanceMm} mm of clear floor in front`);
    for (const zone of spec?.zones ?? []) facts.push(`counts as the ${zone} fixture such a room needs`);
    if (hasFixtureGlyph(word)) facts.push("drawn as a plan symbol, so a `label` on it is not drawn");
    const detail = [alias ? `= ${alias}` : null, fp].filter((x): x is string => x !== null).join(" · ");
    return {
      label: word,
      kind: "enum" as const,
      detail: detail === "" ? undefined : detail,
      doc: [
        `**${word}** — a catalogued fixture category.`,
        facts.map((f) => `- ${f}`).join("\n"),
        "Any word is legal here; an uncatalogued one draws as a labelled rectangle.",
      ].join("\n\n"),
    };
  });
}

/**
 * Completion items in scope at `offset`.
 *
 * Context-free everywhere except one place: in a `furniture` statement's category slot it
 * returns the fixture vocabulary and nothing else (see {@link inFixtureCategorySlot}). The
 * full set is returned mid-word too — both shipped clients filter by the typed prefix
 * themselves (VS Code's handler maps items 1:1 with no `filterText`, and the playground's
 * CodeMirror source anchors the popup at the matched word's start with a `validFor` pattern),
 * so narrowing here would only fight them.
 */
export function completion(source: string, offset: number, registry: Registry = BUILTIN_REGISTRY): CompletionItem[] {
  // The one position-sensitive branch. It returns EARLY and completely, which is what keeps
  // the law below it true: everywhere that is not a category slot, this function still builds
  // exactly the context-free list it always has.
  if (inFixtureCategorySlot(lex(source).tokens, offset)) return fixtureCategoryItems();

  const items: CompletionItem[] = [];
  for (const kw of Object.keys(SETTING_KW)) items.push({ label: kw, kind: "keyword", doc: SETTING_KW[kw] });
  for (const kw of Object.keys(CONTROL_KW)) items.push({ label: kw, kind: "keyword", doc: CONTROL_KW[kw] });
  for (const def of registry.order)
    items.push({
      label: def.keyword,
      kind: "element",
      detail: elementSignature(def.keyword, def.params),
      doc: def.doc,
    });
  for (const [name, sig] of Object.entries(BUILTIN_SIGS)) items.push({ label: name, kind: "function", detail: sig });

  const a = analyze(source, registry);
  if (a) {
    for (const b of a.bindings) {
      if (b.scope === undefined || inSpan(b.scope, offset)) {
        const kind: CompletionKind = b.kind === "component" ? "component" : b.kind === "fn" ? "function" : "variable";
        items.push({ label: b.name, kind, detail: b.detail });
      }
    }
  }
  // De-dup by label (in-scope bindings can repeat keyword names harmlessly).
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.label)) return false;
    seen.add(i.label);
    return true;
  });
}

/** The defining occurrence's span for the symbol at `offset`, or null. */
export function definition(source: string, offset: number, registry: Registry = BUILTIN_REGISTRY): Span | null {
  const a = analyze(source, registry);
  if (!a) return null;
  const tok = identAt(a.tokens, offset);
  if (!tok) return null;
  const b = resolveBinding(a.bindings, tok.value, offset);
  return b ? b.nameSpan : null;
}

/** All edit sites to rename the symbol at `offset` to `newName`, or null. */
export function rename(
  source: string,
  offset: number,
  newName: string,
  registry: Registry = BUILTIN_REGISTRY,
): TextEdit[] | null {
  const a = analyze(source, registry);
  if (!a) return null;
  const tok = identAt(a.tokens, offset);
  if (!tok) return null;
  const target = resolveBinding(a.bindings, tok.value, offset);
  if (!target) return null;

  const spans: Span[] = [target.nameSpan];
  for (const r of a.refs) {
    if (r.name !== target.name) continue;
    const b = resolveBinding(a.bindings, r.name, r.span.start);
    if (b && b.nameSpan.start === target.nameSpan.start && b.nameSpan.end === target.nameSpan.end) spans.push(r.span);
  }
  // De-dup spans (a def site may also be collected as a ref).
  const seen = new Set<string>();
  const edits: TextEdit[] = [];
  for (const s of spans) {
    const key = `${s.start}:${s.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edits.push({ span: s, newText: newName });
  }
  return edits;
}

// ---- code actions (quickfix) ----

/**
 * An editor quickfix derived from a {@link import("./diagnostics.js").FixSuggestion}:
 * a titled bundle of {@link TextEdit}s the editor applies as one. Structurally what
 * an LSP `CodeAction` of kind `quickfix` needs (the VS Code server maps it to a
 * `WorkspaceEdit`); `diagnostic` is the JSON projection of the diagnostic it
 * resolves, so the adapter can echo it back on the action.
 */
export interface CodeAction {
  title: string;
  kind: "quickfix";
  /** The diagnostic this action resolves (agent-facing JSON projection). */
  diagnostic: DiagnosticJson;
  edits: TextEdit[];
  /** True only when this is the single machine-applicable fix on offer — the
   *  editor may then apply it with one keystroke. */
  isPreferred: boolean;
}

/** Do a diagnostic span and a request range touch (share ≥1 byte, or a shared endpoint)? */
const spansTouch = (a: Span, b: Span): boolean => a.start <= b.end && a.end >= b.start;

/**
 * Quickfix code actions for the diagnostics overlapping `range` — one action per
 * {@link import("./diagnostics.js").FixSuggestion} on those diagnostics. Pure: it
 * re-resolves the source (the fixes are attached during resolve) and projects each
 * suggestion's edits (already in original-source byte coordinates) to
 * {@link TextEdit}s. `isPreferred` is set only when exactly one machine-applicable
 * action is produced, so the editor never auto-elevates an ambiguous choice.
 */
export function codeActions(source: string, range: Span): CodeAction[] {
  const { diagnostics } = resolvePlan(source);
  // Build each action, remembering its applicability so a lone machine-applicable
  // one can be marked preferred afterward.
  const built: Array<{ action: CodeAction; machine: boolean }> = [];
  for (const d of diagnostics) {
    if (!d.span || !d.fixes?.length || !spansTouch(d.span, range)) continue;
    const dj = diagnosticToJson(source, d);
    // Present a diagnostic's mutually-exclusive alternatives in one canonical
    // order (identity on today's singleton arrays).
    for (const fix of rankFixes(d.fixes)) {
      built.push({
        machine: fix.applicability === "machine-applicable",
        action: {
          title: fix.title,
          kind: "quickfix",
          diagnostic: dj,
          edits: fix.edits.map((e) => ({ span: e.span, newText: e.newText })),
          isPreferred: false,
        },
      });
    }
  }
  // A lone machine-applicable fix is the preferred action; otherwise none is, so
  // the editor never elevates an ambiguous/placeholder choice to a one-key apply.
  const machine = built.filter((b) => b.machine);
  if (machine.length === 1) machine[0]!.action.isPreferred = true;
  return built.map((b) => b.action);
}

/** Signature help for an enclosing `callee(…)` at `offset`, or null. */
export function signatureHelp(
  source: string,
  offset: number,
  registry: Registry = BUILTIN_REGISTRY,
): SignatureResult | null {
  const a = analyze(source, registry);
  if (!a) return null;
  // Walk tokens before the cursor, tracking open calls and the active argument.
  const stack: { callee?: string; commas: number }[] = [];
  let prev: Token | undefined;
  for (const t of a.tokens) {
    if (t.start >= offset) break;
    if (t.type === "lparen") stack.push({ callee: prev && prev.type === "ident" ? prev.value : undefined, commas: 0 });
    else if (t.type === "rparen") stack.pop();
    else if (t.type === "comma" && stack.length) stack[stack.length - 1]!.commas++;
    if (t.type !== "eof") prev = t;
  }
  const top = stack[stack.length - 1];
  if (!top?.callee) return null;

  const comp = a.plan.components.get(top.callee);
  if (comp)
    return { label: `component ${fnSig(comp.name, comp.params)}`, params: comp.params, activeParameter: top.commas };
  const fn = a.bindings.find((b) => b.name === top.callee && b.kind === "fn");
  if (fn) {
    const m = /\(([^)]*)\)/.exec(fn.detail);
    const params = m?.[1] ? m[1].split(",").map((s) => s.trim()) : [];
    return { label: fn.detail.replace(/ = …$/, ""), params, activeParameter: top.commas };
  }
  if (top.callee in BUILTIN_SIGS) {
    const sig = BUILTIN_SIGS[top.callee]!;
    const m = /\(([^)]*)\)/.exec(sig);
    const params = m?.[1] ? m[1].split(",").map((s) => s.trim()) : [];
    return { label: sig, params, activeParameter: Math.min(top.commas, Math.max(0, params.length - 1)) };
  }
  return null;
}
