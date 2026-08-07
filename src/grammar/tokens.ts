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
  control: [
    "plan",
    "component",
    "let",
    "theme",
    "title",
    "style",
    "import",
    "for",
    "if",
    "while",
    "else",
    "set",
    "strip",
    "level",
    "zone",
    "place",
    "axes",
    "schedule",
    "legend",
  ],
  /** Built-in element kinds → `storage.type.element`, CM `typeName`. */
  element: [
    "wall",
    "room",
    "door",
    "window",
    "opening",
    "furniture",
    "dim",
    "column",
    "stair",
    "elevator",
    "escalator",
  ],
  /** Setting / attribute keywords → `keyword.other`, CM `propertyName`. */
  attribute: [
    "units",
    "grid",
    "paper",
    "scale",
    "north",
    "dims",
    "accTitle",
    "accDescr",
    "material",
    "angle",
    "at",
    "size",
    "polygon",
    "circle",
    "arc",
    "radius",
    "width",
    "thickness",
    "label",
    "hinge",
    "swing",
    "offset",
    "text",
    "close",
    "id",
    "project",
    "drawn_by",
    "date",
    "from",
    "as",
    "right-of",
    "left-of",
    "below",
    "above",
    "align",
    "gap",
    "uses",
    "rotate",
    "against",
    "segment",
    "side",
    "on",
    "into",
    "near",
    "anchor",
    "inset",
    "flush",
    "mirror",
    "height",
    "faces",
    "clear",
    "dir",
  ],
  /** Enum value keywords → `constant.language`, CM `atom`. */
  enum: [
    "up",
    "down",
    "left",
    "right",
    "in",
    "out",
    "mm",
    "true",
    "false",
    "top",
    "middle",
    "bottom",
    "center",
    "centered",
    "start",
    "end",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "auto",
    "cw",
    "ccw",
    "major",
    "A4",
    "A3",
    "A2",
    "A1",
    "A0",
    "landscape",
    "portrait",
    "living",
    "kitchen",
    "dining",
    "bedroom",
    "bath",
    "wc",
    "hall",
    "circulation",
    "storage",
    "utility",
    "office",
    "entry",
  ],
} as const;

/**
 * Door clause value sets — the ONE source for the `hinge` / `swing` allow-lists.
 *
 * Six places used to retype these two pairs: the parser's inline check and the
 * resolver's `set door(…)` allow-list (`src/elements/door.ts`), the Plan JSON
 * validator and the Plan JSON schema (`src/plan-json.ts`), and — the dangerous two —
 * `scripts/gen-gbnf.ts`'s door productions and `scripts/gen-llm-spec.ts`'s door
 * grammar line, where a retyped literal reproduces the same *wrong* text forever
 * while `check:drift` stays green (the hazard CLAUDE.md names, and the one that
 * shipped a GBNF grammar which could not decode `polygon`/`arc`). Everything reads
 * this table now, both generators carry a guard that throws when a clause here has
 * no rendering, and `test/door-enums.test.ts` fails if a seventh copy appears.
 *
 * It **sits beside** {@link KEYWORDS}.enum rather than deriving from it or feeding
 * it. `KEYWORDS.enum` is the flat *highlighting* bucket — one bag of value words
 * shared across the language, where `left` is equally a `strip` direction and a
 * furniture `side` — while this is the *per-clause* semantic grouping, which the
 * bucket cannot express. The weld between them is a subset law (every value here
 * must appear in `KEYWORDS.enum`, so a new one can never ship unhighlighted),
 * enforced by `test/door-enums.test.ts`.
 *
 * The keys are the clause keywords themselves (`door … hinge <v>`, `door … swing
 * <v>`), which is what lets `gen-gbnf.ts` render one `<key>-val` production per key
 * and fail loudly when a key has none.
 */
export const DOOR_ENUMS = {
  hinge: ["left", "right"],
  swing: ["in", "out"],
} as const;

/**
 * `hinge near start|end` — the same clause addressed by wall VERTEX instead of by
 * traversal direction. A second spelling of `hinge`, not a third clause, so it lives
 * beside {@link DOOR_ENUMS} rather than as a key of it (a key means "a clause of its
 * own", which is what both generators iterate).
 */
export const DOOR_HINGE_NEAR = ["start", "end"] as const;

/** A door clause that takes a closed value set — a key of {@link DOOR_ENUMS}. */
export type DoorEnumClause = keyof typeof DOOR_ENUMS;
/** `hinge left|right`, relative to the host wall's traversal direction. */
export type DoorHinge = (typeof DOOR_ENUMS.hinge)[number];
/** `swing in|out`, relative to the host wall's normal. */
export type DoorSwingDir = (typeof DOOR_ENUMS.swing)[number];
/** `hinge near start|end`. */
export type DoorHingeNear = (typeof DOOR_HINGE_NEAR)[number];

/**
 * Render a closed value set the way every enum diagnostic in the tree phrases it —
 * `"left" or "right"`. Kept here so the message text is derived from the same table
 * as the check that produces it, and cannot drift from it word by word.
 */
export const enumList = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(" or ");

/** All operators the lexer recognises (multi-char forms first when generating regex). */
export const OPERATORS = [
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
] as const;

/** Lexical-rule fragments shared by the editor grammars. */
export const RULES = {
  /** Identifier (also matches keywords; the parser/highlighter classifies). A
   *  dotted tail names an element inside a `place`d component instance
   *  (`west.perimeter`); it is legal in REFERENCE positions only — a declaration
   *  (`id=`, `let`, `as`) rejects it with `E_DOTTED_DECL`. */
  ident: "[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*",
  /** Line comment to end of line. */
  comment: "#.*$",
  /** A number, optionally a literal dimension `WxH`. Either component may carry
   *  an optional metric unit suffix (`mm`|`cm`|`m`, folded to mm at lex time). */
  dimension: "[0-9]+(?:\\.[0-9]+)?(?:mm|cm|m)?x[0-9]+(?:\\.[0-9]+)?(?:mm|cm|m)?",
  number: "[0-9]+(?:\\.[0-9]+)?(?:mm|cm|m)?",
} as const;

/**
 * Keywords that begin a plan-body statement (settings + declarations + control
 * flow). Registry element keywords are added per-parse, so they are not listed
 * here. Consumed by `src/parser.ts` for statement dispatch and error recovery.
 */
export const STATEMENT_STARTS: readonly string[] = [
  "units",
  "grid",
  "paper",
  "scale",
  "north",
  "dims",
  "title",
  "accTitle",
  "accDescr",
  "theme",
  "style",
  "let",
  "component",
  "import",
  "for",
  "if",
  "while",
  "set",
  "strip",
  "level",
  "zone",
  "place",
  "axes",
  "schedule",
  "legend",
];
