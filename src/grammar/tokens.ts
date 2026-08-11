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
    "site",
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
    "slide",
    "open",
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
    // Door kinds (v1.25) — the bare word that leads a `door` statement. Values, not
    // clause introducers, so they live here beside `left`/`in`; the per-kind grouping
    // is `DOOR_KINDS` below (this bag is flat highlighting only).
    "hinged",
    "sliding",
    "barn",
    "bifold",
    "pocket",
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
    // `site { street … }` / `hemisphere …` values. `north` is the fourth compass word
    // and is DELIBERATELY ABSENT: it already sits in `attribute` above (because `north
    // up` is a statement), and no word in this file appears in two categories — the
    // generators build flat alternations from these lists and would have to learn about
    // duplicates. The cost is cosmetic (in `street north` the word is coloured as a
    // setting keyword rather than an enum value, one word in one position); the trap is
    // that three-of-four invites a "fix". `test/site.test.ts` pins the absence.
    "south",
    "east",
    "west",
  ],
} as const;

/**
 * Door clause value sets — the ONE source for the `hinge` / `swing` / `slide`
 * allow-lists.
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
  slide: ["left", "right"],
} as const;

/**
 * `hinge near start|end` — the same clause addressed by wall VERTEX instead of by
 * traversal direction. A second spelling of `hinge`, not a third clause, so it lives
 * beside {@link DOOR_ENUMS} rather than as a key of it (a key means "a clause of its
 * own", which is what both generators iterate).
 */
export const DOOR_HINGE_NEAR = ["start", "end"] as const;

/**
 * The door KINDS — the bare word that may lead a `door` statement
 * (`door pocket on w1 at 40% width 900 slide left`).
 *
 * It sits beside {@link DOOR_ENUMS} for the same reason {@link DOOR_HINGE_NEAR} does:
 * a key of that table means "a clause of its own", which is what both generators
 * iterate to emit `<key> rws <key>-val`. A kind is not a clause — it is the leading
 * shape word, the `room polygon` / `room circle` / `dim faces` precedent — so it gets
 * its own list, its own generator rendering and its own guard in each generator.
 *
 * `hinged` is the default and is EXACTLY equivalent to writing nothing: the resolver
 * drops it, so `door hinged …` and `door …` produce byte-identical output. Order is
 * the order both generators render.
 */
export const DOOR_KINDS = ["hinged", "sliding", "barn", "bifold", "pocket"] as const;

/** The optional door clauses whose legality depends on the kind. */
export type DoorClauseName = "hinge" | "swing" | "slide" | "open";

/**
 * Which clauses each kind accepts. Beside the value sets because it is the same kind
 * of fact — part of the door vocabulary, read by the resolver (which raises
 * `E_DOOR_KIND_CLAUSE` from it), by the Plan JSON projection (which must not emit a
 * clause it would then refuse on the way back in) and by the docs.
 *
 * The rule is REFUSE, never approximate: a clause a kind has no meaning for is an
 * error, not a silently-ignored word — the v1.23 precedent, where rectangle-only
 * clauses refuse a polygon room rather than approximate it. "A pocket door with a
 * `hinge left` clause draws as if the clause were absent" is silent-error design.
 *
 * `swing` on `barn`/`bifold` is legal and deliberately OVERLOADED: for those two it
 * selects which FACE of the wall the panel hangs on or folds toward, not a leaf arc.
 * The overload buys the one handed rule already proved correct under a reflection
 * (`frame.ts` flips `swing` when `det < 0`); a new `face in|out` keyword would re-open
 * that proof for no semantic gain. The price is prose, and it is paid in the error
 * catalog, in `spec.llm.md`'s door line and in `docs/language-reference.md`.
 */
export const DOOR_KIND_CLAUSES: Readonly<Record<DoorKind, Readonly<Record<DoorClauseName, boolean>>>> = {
  hinged: { hinge: true, swing: true, slide: false, open: false },
  sliding: { hinge: false, swing: false, slide: true, open: true },
  barn: { hinge: false, swing: true, slide: true, open: true },
  bifold: { hinge: false, swing: true, slide: true, open: true },
  pocket: { hinge: false, swing: false, slide: true, open: true },
};

/** A door clause that takes a closed value set — a key of {@link DOOR_ENUMS}. */
export type DoorEnumClause = keyof typeof DOOR_ENUMS;
/** `hinge left|right`, relative to the host wall's traversal direction. */
export type DoorHinge = (typeof DOOR_ENUMS.hinge)[number];
/** `swing in|out`, relative to the host wall's normal. */
export type DoorSwingDir = (typeof DOOR_ENUMS.swing)[number];
/** `slide left|right`, relative to the host wall's traversal direction (like `hinge`). */
export type DoorSlideDir = (typeof DOOR_ENUMS.slide)[number];
/** `hinge near start|end`. */
export type DoorHingeNear = (typeof DOOR_HINGE_NEAR)[number];
/** The leading kind word of a `door` statement; `hinged` is the default. */
export type DoorKind = (typeof DOOR_KINDS)[number];

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
  "site",
];
