/**
 * Generate `grammars/archlang.gbnf` — a GBNF constrained-decoding grammar for the
 * ArchLang language, from the one grammar source of truth (`src/grammar/tokens.ts`,
 * plus the `USE_KINDS` / `FURNITURE_ANCHORS` enum vocabularies in `src/ast.ts`).
 *
 * The grammar is meant to be fed to a llama.cpp-style constrained sampler (the
 * `--grammar-file` flag / the `grammar` field on a server completion) so a model
 * can be *forced* to emit syntactically well-formed `.arch`. This is the
 * "beyond-Mermaid" artifact: Mermaid ships editor grammars; we also ship a
 * decoding grammar.
 *
 * Like `scripts/gen-grammars.ts` and `scripts/gen-llm-spec.ts`, the productions are
 * curated by hand (the structure mirrors the recursive-descent parser) but the
 * keyword / enum vocabularies are INJECTED from the single sources of truth, so a
 * new element keyword, room-use tag, or furniture anchor added there flows into the
 * grammar automatically and the drift guard below fails loudly if the operator set
 * assumed here diverges from `OPERATORS`.
 *
 * {@link renderGbnf} is pure (no fs, no clock — deterministic bytes) so the drift
 * test (`test/gbnf-drift.test.ts`) can regenerate it in-memory and assert equality.
 * Run `npx tsx scripts/gen-gbnf.ts` after editing; CI asserts no drift.
 *
 * PRACTICAL, NOT PARSER-EQUIVALENT. The grammar is deliberately a *superset* of the
 * hand-written parser: it may accept token spacings the lexer would merge, or
 * attribute orders the parser fixes, but it must NEVER reject a valid `.arch`
 * (acceptance of the whole `examples/` corpus is the hard test). The parser and its
 * catalogued diagnostics remain the source of truth for what is actually valid.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { KEYWORDS, OPERATORS } from "../src/grammar/tokens.js";
import { USE_KINDS, FURNITURE_ANCHORS } from "../src/ast.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** A GBNF string terminal for the literal `word` (keywords are whole quoted
 *  literals — iron rule 4). `word` here is always plain ASCII with no `"`/`\`. */
const lit = (word: string): string => `"${word}"`;
/** An alternation of literal terminals, in the given (source) order. */
const litAlt = (words: readonly string[]): string => words.map(lit).join(" | ");

/**
 * Drift guard, mirroring `gen-llm-spec`'s: the operator spellings the expression
 * cascade below hard-codes MUST all be present in `OPERATORS`, and every element
 * keyword MUST be covered by `element-kw`. If `src/grammar/tokens.ts` drops or
 * renames one of these, generation throws rather than emit a grammar that silently
 * diverges from the lexer.
 */
const OPS_USED = [
  "->",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "..",
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  ":",
  ",",
  "<",
  ">",
  "!",
  "[",
  "]",
];
function assertVocab(): void {
  const missing = OPS_USED.filter((o) => !(OPERATORS as readonly string[]).includes(o));
  if (missing.length) {
    throw new Error(`gen-gbnf: operators used by the grammar are missing from OPERATORS: ${missing.join(" ")}`);
  }
}

/**
 * The grammar body, as `[name, production]` pairs emitted in this fixed order.
 * Non-terminals are dashed-lowercase words (GBNF requirement). Whitespace is
 * explicit: `ws` is optional inter-token layout (bounded inline runs, may cross
 * blank / comment lines), `rws` is a *required* separator between two word-like
 * tokens the lexer would otherwise glue. Lists are `item (sep item)*` (no left
 * recursion), and repetition uses `*` / `+` / `?` / `{0,N}` bounds (never `x? x? x?`
 * chains). Every rule is one line so the drift test's tiny recognizer can read it.
 */
function rules(): [string, string][] {
  const elementKw = litAlt(KEYWORDS.element);
  const useKind = litAlt(USE_KINDS);
  const anchor = litAlt(FURNITURE_ANCHORS);

  return [
    // ---- top level -------------------------------------------------------
    ["root", `ws "plan" rws string ws "{" ws ( plan-stmt ws )* "}" ws`],
    [
      "plan-stmt",
      `setting | title-stmt | acc-stmt | theme-stmt | style-stmt | component-stmt | import-stmt | strip-stmt | block-stmt`,
    ],
    ["block-stmt", `element | let-stmt | for-stmt | if-stmt | while-stmt | set-stmt | instance-stmt | assign-stmt`],
    [
      "element",
      `wall-stmt | room-stmt | door-stmt | window-stmt | opening-stmt | furniture-stmt | dim-stmt | column-stmt`,
    ],

    // ---- plan settings ---------------------------------------------------
    ["setting", `units-stmt | grid-stmt | scale-stmt | north-stmt | dims-stmt`],
    ["units-stmt", `"units" rws "mm"`],
    ["grid-stmt", `"grid" rws number`],
    ["scale-stmt", `"scale" rws number ws ":" ws number`],
    ["north-stmt", `"north" rws north-dir`],
    ["north-dir", `"up" | "down" | "left" | "right" | number`],
    ["dims-stmt", `"dims" rws "auto" ( rws dims-mode )?`],
    ["dims-mode", `"overall" | "rooms" | "walls" | "all"`],
    ["acc-stmt", `( "accTitle" | "accDescr" ) rws string`],

    // ---- title / theme / style ------------------------------------------
    ["title-stmt", `"title" ws "{" ws ( title-field ws )* "}"`],
    ["title-field", `( "project" | "drawn_by" | "date" ) rws string`],
    ["theme-stmt", `"theme" ( rws "from" rws string | rws ident ( ws theme-block )? | ws theme-block )`],
    ["theme-block", `"{" ws ( theme-entry ws )* "}"`],
    ["theme-entry", `ident ws ":"? ws config-value`],
    ["style-stmt", `"style" rws ident ws "{" ws ( style-entry ws )* "}"`],
    ["style-entry", `ident ws ":"? ws config-value`],
    ["config-value", `string | number`],

    // ---- decls / control -------------------------------------------------
    ["component-stmt", `"component" rws ident ws "(" ws param-list? ws ")" ws block`],
    ["param-list", `ident ( ws "," ws ident )*`],
    ["import-stmt", `"import" rws string ws ":" ws import-items`],
    ["import-items", `"*" | import-item ( ws "," ws import-item )*`],
    ["import-item", `ident ( rws "as" rws ident )?`],
    ["let-stmt", `"let" rws ident ( ws "(" ws param-list? ws ")" )? ws "=" ws expr`],
    ["for-stmt", `"for" rws ident rws "in" ws expr ws block`],
    ["if-stmt", `"if" ws expr ws block ( ws "else" ws block )?`],
    ["while-stmt", `"while" ws expr ws block`],
    ["set-stmt", `"set" rws element-kw ws "(" ws set-entries? ws ")"`],
    ["element-kw", elementKw],
    ["set-entries", `set-entry ( ws "," ws set-entry )*`],
    ["set-entry", `ident ws ":" ws expr`],
    ["instance-stmt", `ident ws "(" ws ( expr ( ws "," ws expr )* )? ws ")"`],
    ["assign-stmt", `ident ws "=" ws expr`],
    ["block", `"{" ws ( block-stmt ws )* "}"`],

    // ---- strip -----------------------------------------------------------
    [
      "strip-stmt",
      `"strip" rws strip-dir rws "at" ws point rws "gap" ws expr ( rws strip-cross )? ws "{" ws ( strip-room ws )* "}"`,
    ],
    ["strip-dir", `"right" | "left" | "down" | "up"`],
    ["strip-cross", `( "height" | "width" ) ws expr`],
    ["strip-room", `"room" rws id-opt "size" ws strip-size ( ws room-label )? ( ws room-uses )?`],
    ["strip-size", `expr ( ws "x" ws expr )?`],

    // ---- elements --------------------------------------------------------
    [
      "wall-stmt",
      `"wall" rws id-opt ident rws "thickness" ws expr ( ws wall-material )? ws "{" ws ( point ws )* ( "close" ws )? "}"`,
    ],
    ["wall-material", `"material" rws ident ( rws ( "scale" | "angle" ) ws expr ){0,2}`],
    ["room-stmt", `"room" rws id-opt room-pos ws "size" ws dims ( ws room-label )? ( ws room-uses )?`],
    ["room-pos", `"at" ws point | rel-dir rws ident ( rws "align" rws ident )? ( rws "gap" ws expr )?`],
    ["rel-dir", `"right-of" | "left-of" | "below" | "above"`],
    ["room-label", `"label" ws string`],
    ["room-uses", `"uses" rws use-kind ( rws use-kind )*`],
    ["use-kind", useKind],
    ["door-stmt", `"door" rws id-opt opening-target ws "width" ws expr ( ws door-clause )*`],
    ["door-clause", `"wall" rws ident | "hinge" rws hinge-val | "swing" rws swing-val`],
    ["hinge-val", `"near" rws ( "start" | "end" ) | "left" | "right"`],
    ["swing-val", `"into" rws ident | "in" | "out"`],
    ["window-stmt", `"window" rws id-opt opening-target ws "width" ws expr ( ws "wall" rws ident )?`],
    ["opening-stmt", `"opening" rws id-opt opening-target ws "width" ws expr ( ws "wall" rws ident )?`],
    ["opening-target", `"at" ws point | "on" rws ident rws "at" ws attach-pos`],
    ["attach-pos", `"center" | number ws "%" | number`],
    ["furniture-stmt", `"furniture" rws id-opt ident rws furn-pos ( ws furn-clause )*`],
    ["furn-pos", `"against" rws "wall" rws ident ( ws against-opt )* | "in" rws ident rws in-place | "at" ws point`],
    ["against-opt", `"segment" ws expr | "offset" ws expr | "side" rws ident`],
    ["in-place", `"centered" | "anchor" rws anchor ( ws "inset" ws expr )?`],
    ["anchor", anchor],
    ["furn-clause", `"size" ws dims | "label" ws string | "rotate" ws expr | "in" rws ident`],
    ["dim-stmt", `"dim" ws point ws "->" ws point ( ws "offset" ws expr )? ( ws "text" ws string )?`],
    ["column-stmt", `"column" rws id-opt "at" ws point ws "size" ws dims`],

    // ---- shared clause pieces -------------------------------------------
    ["id-opt", `( "id" ws "=" ws ident rws )?`],
    ["point", `"(" ws expr ws "," ws expr ws ")"`],
    ["dims", `expr ws "x" ws expr`],

    // ---- expressions (bounded, non-left-recursive precedence cascade) ----
    ["expr", `or-expr`],
    ["or-expr", `and-expr ( ws "||" ws and-expr )*`],
    ["and-expr", `eq-expr ( ws "&&" ws eq-expr )*`],
    ["eq-expr", `cmp-expr ( ws eq-op ws cmp-expr )*`],
    ["eq-op", `"==" | "!="`],
    ["cmp-expr", `range-expr ( ws cmp-op ws range-expr )*`],
    ["cmp-op", `"<=" | ">=" | "<" | ">"`],
    ["range-expr", `add-expr ( ws ".." ws add-expr )*`],
    ["add-expr", `mul-expr ( ws add-op ws mul-expr )*`],
    ["add-op", `"+" | "-"`],
    ["mul-expr", `unary-expr ( ws mul-op ws unary-expr )*`],
    ["mul-op", `"*" | "/" | "%"`],
    ["unary-expr", `unary-op ws unary-expr | postfix-expr`],
    ["unary-op", `"-" | "+" | "!"`],
    ["postfix-expr", `atom ( ws "[" ws expr ws "]" )*`],
    ["atom", `number | string | array | if-expr | call | ref | "(" ws expr ws ")"`],
    ["call", `ident ws "(" ws ( expr ( ws "," ws expr )* )? ws ")"`],
    ["ref", `ident`],
    ["array", `"[" ws ( expr ( ws "," ws expr )* )? ws "]"`],
    ["if-expr", `"if" ws expr ws "{" ws expr ws "}" ws "else" ws "{" ws expr ws "}"`],

    // ---- lexical ---------------------------------------------------------
    // A numeric literal may carry an optional metric unit suffix (mm|cm|m),
    // folded to millimetres by the lexer; the value is scaled, the token shape
    // is otherwise a number.
    ["number", `digits frac? unit?`],
    ["digits", `[0-9]+`],
    ["frac", `"." digits`],
    ["unit", `"mm" | "cm" | "m"`],
    ["ident", `[a-zA-Z_] [a-zA-Z0-9_]*`],
    ["string", `"\\"" str-char* "\\""`],
    ["str-char", `str-plain | str-esc | interp`],
    ["str-plain", `[^"\\\\{}\\n]`],
    ["str-esc", `"\\\\" ( [^\\n] | "\\n" )`],
    ["interp", `"{" ws expr ws "}"`],

    // ---- layout / whitespace (bounded inline; blank & comment lines ok) --
    ["ws", `sp cont*`],
    ["rws", `sp1 ws`],
    ["sp", `[ \\t\\r]{0,80}`],
    ["sp1", `[ \\t\\r] | comment "\\n" | "\\n"`],
    ["cont", `comment "\\n" sp | "\\n" sp`],
    ["comment", `"#" [^\\n]*`],
  ];
}

const HEADER = `# ArchLang GBNF grammar — a constrained-decoding grammar for llama.cpp-style samplers.
#
# GENERATED by scripts/gen-gbnf.ts from src/grammar/tokens.ts (keywords/operators)
# plus USE_KINDS / FURNITURE_ANCHORS from src/ast.ts. Do NOT edit by hand — run
# \`npx tsx scripts/gen-gbnf.ts\`; CI checks drift (test/gbnf-drift.test.ts).
#
# Feed it to a constrained sampler (llama.cpp \`--grammar-file\`, or the \`grammar\`
# field of a server completion) to force a model to emit syntactically well-formed
# ArchLang. This is a PRACTICAL grammar: intentionally a superset / approximation of
# the hand-written parser (src/parser.ts) — it constrains the keyword-first
# statement shapes and enum vocabularies but accepts some token spacings and
# attribute orders the parser is stricter about. It must never REJECT a valid .arch;
# the parser + its catalogued diagnostics remain the source of truth for validity.
# Deterministic bytes (no version / date).
`;

/** The GBNF grammar text (pure — safe for the drift test). */
export function renderGbnf(): string {
  assertVocab();
  const body = rules()
    .map(([name, prod]) => `${name} ::= ${prod}`)
    .join("\n");
  return `${HEADER}\n${body}\n`;
}

/** Write the grammar to disk (CLI entry). */
function main(): void {
  writeFileSync(resolve(ROOT, "grammars/archlang.gbnf"), renderGbnf());
  process.stdout.write("✓ generated grammars/archlang.gbnf from src/grammar/tokens.ts\n");
}

// Run only when invoked directly (not when imported by the drift test).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
