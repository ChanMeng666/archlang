/**
 * The single source of truth for ArchLang's lexical grammar.
 *
 * Keyword categories, operators, and the comment/string/number rules live here
 * once. `scripts/gen-grammars.ts` generates the editor grammars
 * (`editors/archlang.tmLanguage.json` + the playground StreamLanguage) from this
 * file, and `src/parser.ts` derives its statement-start set from
 * {@link STATEMENT_STARTS}. CI regenerates and asserts no drift
 * (`test/grammar-drift.test.ts`), so editing a keyword here updates both editor
 * grammars. Borrows the one-grammar idea from Mermaid's `langium generate`.
 *
 * NB: the hand-written lexer (`src/lexer.ts`) emits every word as an `ident`;
 * keywords are recognised at parse time. So this file feeds the *parser* and the
 * *editor grammars* — it is the spec the lexer's operator/number/string rules
 * mirror, not a table the lexer indexes at runtime.
 */

/** Keyword categories, by highlighting role. Order within each is stable. */
export const KEYWORDS = {
  /** Statement / declaration keywords → TextMate `keyword.control`, CM `keyword`. */
  control: ["plan", "component", "let", "theme", "title", "style", "import", "for", "if", "while", "else", "set"],
  /** Built-in element kinds → `storage.type.element`, CM `typeName`. */
  element: ["wall", "room", "door", "window", "furniture", "dim", "column"],
  /** Setting / attribute keywords → `keyword.other`, CM `propertyName`. */
  attribute: [
    "units", "grid", "scale", "north", "dims", "material", "angle", "at", "size", "width", "thickness",
    "label", "hinge", "swing", "offset", "text", "close", "id", "project", "drawn_by", "date", "from", "as",
    "right-of", "left-of", "below", "above", "align", "gap",
  ],
  /** Enum value keywords → `constant.language`, CM `atom`. */
  enum: ["up", "down", "left", "right", "in", "out", "mm", "true", "false", "top", "middle", "bottom", "center", "auto"],
} as const;

/** All operators the lexer recognises (multi-char forms first when generating regex). */
export const OPERATORS = [
  "->", "==", "!=", "<=", ">=", "&&", "||", "..",
  "+", "-", "*", "/", "%", "=", ":", ",", "<", ">", "!", "[", "]",
] as const;

/** Lexical-rule fragments shared by the editor grammars. */
export const RULES = {
  /** Identifier (also matches keywords; the parser/highlighter classifies). */
  ident: "[A-Za-z_][A-Za-z0-9_]*",
  /** Line comment to end of line. */
  comment: "#.*$",
  /** A number, optionally a literal dimension `WxH`. */
  dimension: "[0-9]+(?:\\.[0-9]+)?x[0-9]+(?:\\.[0-9]+)?",
  number: "[0-9]+(?:\\.[0-9]+)?",
} as const;

/**
 * Keywords that begin a plan-body statement (settings + declarations + control
 * flow). Registry element keywords are added per-parse, so they are not listed
 * here. Consumed by `src/parser.ts` for statement dispatch and error recovery.
 */
export const STATEMENT_STARTS: readonly string[] = [
  "units", "grid", "scale", "north", "dims", "title", "theme", "style", "let", "component", "import",
  "for", "if", "while", "set",
];
