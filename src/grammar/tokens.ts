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
    "roof",
    "void",
    // v1.31, appended at the END: `KEYWORDS.element` must equal `BUILTIN_DEFS`'s keyword
    // list ELEMENT FOR ELEMENT AND IN ORDER (`test/element-keyword-drift.test.ts`), so a
    // new element goes on the end of both lists or neither.
    "outdoor",
    "fence",
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
    // `site { street <compass> [hemisphere <h>] }` — the two clause introducers inside
    // the v1.25 site block. They belong here, beside `north`, for the same reason: a word
    // that LEADS a clause is a setting keyword, not one of its values (the values —
    // `south`/`east`/`west` — are in `enum` below). They shipped in v1.25 documented in
    // the spec's `site` grammar line but absent from this table, so every renderer drew
    // them as bare identifiers.
    "street",
    "hemisphere",
    // `roof overhang <len>` — the clause that introduces the projection distance. A word
    // that LEADS a clause is a setting keyword, so it sits here beside `thickness` and
    // `width` rather than in `enum` (which holds the VALUES a clause takes).
    "overhang",
    // v1.31. `rail <edges>` leads a clause of the `outdoor balcony` line and `boundary
    // (x,y) …` leads one of the `site` block, so both are settings, not values — the same
    // rule that put `street`/`hemisphere`/`overhang` here and their VALUES in `enum`.
    "rail",
    "boundary",
    // v1.35 — the vertical datum layer. `sill` and `head` LEAD a clause of a `window` /
    // `door` / `opening` line (`window … sill 900 head 2100`), which is the rule that put
    // `thickness` and `overhang` here rather than in `enum`: those hold the VALUES a
    // clause takes, and a height's value is a number, not a word.
    //
    // `height` itself is NOT added — it has been in this table since `strip … height <mm>`
    // shipped, and the datum layer reuses that same word at three new sites (a plan
    // setting, a `level` header and a `wall` clause) rather than inventing a fourth
    // spelling for the same idea.
    "sill",
    "head",
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
    // `dims auto <mode>` selectors (AUTO_DIMS_MODES) and the `schedule <subject>` subject
    // (SCHEDULE_SUBJECTS, whose one value `rooms` is the same word). Values following a
    // keyword, so they sit here beside `auto` itself rather than in `attribute`. They are
    // the reason `test/closed-vocabularies.test.ts` exists: both sets have lived in
    // `src/ast.ts` since v1.20/v1.26 as the parser's accept-list AND the spec's grammar
    // line, but nothing checked that the highlighting bucket had heard of them — so
    // `dims auto overall` drew its own mode word as an identifier in every renderer.
    "overall",
    "rooms",
    "walls",
    "all",
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
    // v1.31 — the `outdoor` ground surfaces (`OUTDOOR_KINDS`) and the `fence` styles
    // (`FENCE_STYLES`). Values that follow a keyword, so they sit here. The `rail` edge
    // words (`RAIL_EDGES`) are deliberately NOT repeated: all six — `top`, `bottom`,
    // `left`, `right`, `all`, `none` — are already in this bucket for other clauses, and
    // this file's standing rule is that a word appears in exactly one category once.
    // `none` is the only one that had to be ADDED, and it earns its place twice over: it
    // is also the `wall … material none` value, which has been unhighlighted since v0.9.
    "none",
    "lawn",
    "planting",
    "paving",
    "deck",
    "gravel",
    "water",
    "driveway",
    "patio",
    "balcony",
    "picket",
    "panel",
    "post",
    // `uses garage` (a USE_KINDS value) and `door garage …` (a DOOR_KINDS one) are the SAME
    // word in the highlighting bucket, and one entry is what serves both — the bucket is flat
    // and per-word, while the two semantic groupings live in `USE_KINDS` and `DOOR_KINDS`.
    // That is the ordinary case, not a special one: `left` is already a hinge side, a slide
    // direction, a furniture side and a strip direction from this one entry. What must NOT
    // happen is a second `"garage"` here — the generators build flat alternations from these
    // lists and would emit the word twice.
    "garage",
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
export const DOOR_KINDS = ["hinged", "sliding", "barn", "bifold", "pocket", "garage"] as const;

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
  // A sectional or roller garage door takes NO clause at all, and each refusal is its own
  // argument rather than a blanket one.
  //
  // `hinge` and `slide`: the leaf travels UP, not around a jamb and not along the wall.
  //
  // `swing`: for `barn`/`bifold` this word selects which FACE the panel sits on, and that is
  // the one clause a garage door could plausibly borrow — but its panel goes overhead into
  // the room, and which side is the room is a fact about the plan, not a choice. The resolver
  // derives it by probing one wall thickness off each face and asking which side has floor
  // (the poly-aware `swingInto` rule, over every room instead of one named one), so an
  // author-supplied value could only ever contradict the building.
  //
  // `open`: a sectional door retracts VERTICALLY, out of the plan's cut plane entirely, so
  // there is no intermediate position a plan can draw — at any fraction between 0 and 1 the
  // leaf is neither in the reveal nor visible. The dashed overhead projection already says
  // where it goes, and it says the same thing at every position. Accepting a clause that
  // changed nothing would be silent-error design, which is what this table exists to refuse.
  garage: { hinge: false, swing: false, slide: false, open: false },
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
  // The plan-level `height <expr>` setting (v1.35, the vertical datum layer). It is here
  // for the same reason `paper` is: the parser's plan-statement switch leads with it, and
  // error recovery has to know the word can start a statement. `strip … height <mm>` is
  // unaffected — that clause is consumed inside `parseStrip`, which never re-enters this
  // dispatch.
  "height",
];
