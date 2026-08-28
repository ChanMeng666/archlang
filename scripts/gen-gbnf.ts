/**
 * Generate `grammars/archlang.gbnf` — a GBNF constrained-decoding grammar for the
 * ArchLang language, from the one grammar source of truth (`src/grammar/tokens.ts`,
 * plus the `USE_KINDS` / `FURNITURE_ANCHORS` enum vocabularies in `src/ast.ts` and the
 * `PAPER_SIZES` / `PAPER_ORIENTATIONS` sheet vocabularies in `src/sheet.ts`).
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
 * PRACTICAL, NOT PARSER-EQUIVALENT — but the slack is WHITESPACE, never SHAPE. The
 * grammar may accept token spacings the lexer would merge (`ws` sits between two
 * word-like tokens that the lexer would glue into one ident), and it deliberately
 * accepts forms the RESOLVER refuses with a catalogued `E_*`/`W_*` code — a
 * constrained decoder should be able to emit an off-wall door and be told about it.
 * What it must NOT do is accept a token sequence the PARSER rejects: that is the one
 * job it exists to do, and every such case is a defect. It must equally never reject
 * a valid `.arch` (acceptance of the whole `examples/` corpus is the hard test).
 *
 * The invariant is executable: `test/gbnf-drift.test.ts`'s "agrees with the parser"
 * suite runs a corpus through BOTH this grammar's recognizer and the real `compile()`
 * and fails when they disagree about whether a snippet parses. The expected verdict
 * is taken from the compiler, never written down beside the case, so the corpus
 * cannot be greened by editing a column. Add a case there for any clause order,
 * arity floor or either/or pairing you encode below.
 *
 * ATTRIBUTE ORDER IS PART OF THE SHAPE. Every element's optional clauses are read by
 * the parser as a FIXED SEQUENCE of `if (isKeyword(...))` tests, not as a set: after
 * `door … swing in`, a `hinge left` is not a mis-ordered clause, it is the start of an
 * unknown statement. So each element renders its clauses as a run of `( … )?`
 * optionals in the parser's own order — never `( clause )*`, which also invites the
 * decoder to repeat one.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { DoorEnumClause } from "../src/grammar/tokens.js";
import { DOOR_ENUMS, DOOR_HINGE_NEAR, DOOR_KINDS, KEYWORDS, OPERATORS } from "../src/grammar/tokens.js";
import {
  USE_KINDS,
  FURNITURE_ANCHORS,
  SCHEDULE_SUBJECTS,
  COMPASS_DIRECTIONS,
  FENCE_STYLES,
  HEMISPHERES,
  OUTDOOR_KINDS,
  RAIL_EDGES,
} from "../src/ast.js";
import { PAPER_ORIENTATIONS, PAPER_SIZES } from "../src/sheet.js";

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
/**
 * `KEYWORDS.control` entries the grammar covers structurally rather than as a literal of
 * their own: `plan` is the root, `else` rides `if-stmt`. Everything else must appear as a
 * quoted terminal somewhere in the productions.
 */
const CONTROL_COVERED_STRUCTURALLY = ["plan", "else"];

/** The door clauses that take a closed value set, in table order. */
const DOOR_CLAUSES = Object.keys(DOOR_ENUMS) as DoorEnumClause[];

/**
 * The order `door.parse()` (`src/elements/door.ts`) reads its optional clauses in:
 * `wall`, then these, then `open`. A FIXED sequence, not a set — `door … swing in
 * hinge left` is a parse error, not a re-ordering — so `door-clauses` below renders
 * one `( … )?` per entry **in `DOOR_ENUMS`'s own key order**, which happens to be
 * exactly this order.
 *
 * This constant is a PIN, not the rendering: the productions are still injected from
 * the table (iron rule — derive, never retype), and this exists only so that
 * reordering `DOOR_ENUMS` for some unrelated reason fails the build here instead of
 * silently emitting a grammar whose clause order the parser rejects. Keep it equal to
 * the sequence of `if (ctx.isKeyword(…))` tests in `door.parse()`.
 */
const DOOR_CLAUSE_PARSE_ORDER: readonly string[] = ["hinge", "swing", "slide"];

/**
 * The door-clause guard. Every clause in `DOOR_ENUMS` must (a) be reachable from
 * `door-clause`, (b) have a `<clause>-val` production of its own, and (c) have that
 * production RENDER the table's alternation rather than a retyped copy of it.
 *
 * This is the guard the design pass called blocking. `hinge-val` / `swing-val` were
 * string literals typed into this generator: a value added to the language and not
 * here ships a constrained-decoding grammar that *cannot emit it*, and `check:drift`
 * stays green throughout, because the generator reproduces its own stale output
 * perfectly (the failure that already shipped once, as MCP 0.2.2's v1.19 grammar).
 * Exported so `test/door-enums.test.ts` can prove it fires on a synthetic table
 * rather than trusting the comment.
 */
export function assertDoorVocab(
  body: [string, string][],
  enums: Record<string, readonly string[]>,
  kinds: readonly string[] = DOOR_KINDS,
): void {
  const emitted = body.map(([, prod]) => prod).join(" ");
  // The KIND word is not a clause (it leads the statement, the `room polygon` shape),
  // so it gets its own production and its own arm of this guard: `door-kind` must
  // render the whole table and `door-stmt` must reach it. Without this a kind added
  // to `DOOR_KINDS` would ship a decoding grammar that cannot emit it while
  // `check:drift` stayed green — the MCP 0.2.2 failure, one level down.
  const kindRule = body.find(([name]) => name === "door-kind");
  if (!kindRule) {
    throw new Error(
      "gen-gbnf: no `door-kind` production — a constrained decoder could never emit a door kind. " +
        "Add the rule and reach it from `door-stmt`.",
    );
  }
  if (!kindRule[1].includes(litAlt(kinds))) {
    throw new Error(
      `gen-gbnf: \`door-kind\` does not render its value set (${litAlt(kinds)}) — ` +
        `it must be injected from DOOR_KINDS, never retyped.`,
    );
  }
  if (!emitted.includes("door-kind")) throw new Error("gen-gbnf: `door-kind` is unreachable from `door-stmt`.");
  for (const [clause, values] of Object.entries(enums)) {
    const rule = body.find(([name]) => name === `${clause}-val`);
    if (!rule) {
      throw new Error(
        `gen-gbnf: door clause "${clause}" has no \`${clause}-val\` production — a constrained ` +
          `decoder could never emit it. Add the rule and reach it from \`door-clause\`.`,
      );
    }
    if (!rule[1].includes(litAlt(values))) {
      throw new Error(
        `gen-gbnf: \`${clause}-val\` does not render its value set (${litAlt(values)}) — ` +
          `it must be injected from the enum table, never retyped.`,
      );
    }
    if (!emitted.includes(`${lit(clause)} rws ${clause}-val`)) {
      throw new Error(`gen-gbnf: no door clause emits \`${lit(clause)} rws ${clause}-val\`.`);
    }
  }
  // Last, so a missing/stale production above reports itself first: the clause
  // SEQUENCE is rendered from the table's key order, which makes that order
  // load-bearing — reorder `DOOR_ENUMS` and the emitted grammar's only output would
  // be a parse error. See {@link DOOR_CLAUSE_PARSE_ORDER}.
  const order = Object.keys(enums);
  if (order.join(" ") !== DOOR_CLAUSE_PARSE_ORDER.join(" ")) {
    throw new Error(
      `gen-gbnf: DOOR_ENUMS key order (${order.join(", ")}) no longer matches the order ` +
        `\`door.parse()\` reads its clauses in (${DOOR_CLAUSE_PARSE_ORDER.join(", ")}). ` +
        `The grammar renders them as a FIXED sequence, so a mismatch would ship a grammar ` +
        `whose every multi-clause door is a parse error. Re-read src/elements/door.ts, then ` +
        `update DOOR_CLAUSE_PARSE_ORDER (and the table) together.`,
    );
  }
}

function assertVocab(body: [string, string][]): void {
  const missing = OPS_USED.filter((o) => !(OPERATORS as readonly string[]).includes(o));
  if (missing.length) {
    throw new Error(`gen-gbnf: operators used by the grammar are missing from OPERATORS: ${missing.join(" ")}`);
  }
  // The guard `place` needed. A new statement keyword that never reaches the grammar
  // produces a decoding grammar that silently REJECTS valid source — the constrained
  // sampler simply cannot emit it — and `check:drift` stays green the whole time,
  // because the generator reproduces its own stale output perfectly. Same failure mode
  // `gen-llm-spec` grew a guard for; this is that guard, for this generator.
  const emitted = body.map(([, prod]) => prod).join(" ");
  const uncovered = KEYWORDS.control.filter(
    (k) => !CONTROL_COVERED_STRUCTURALLY.includes(k) && !emitted.includes(lit(k)),
  );
  if (uncovered.length) {
    throw new Error(
      `gen-gbnf: KEYWORDS.control entries have no production: ${uncovered.join(", ")}. ` +
        `Add a rule that emits the literal, or list it in CONTROL_COVERED_STRUCTURALLY.`,
    );
  }
  assertDoorVocab(body, DOOR_ENUMS);
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
  // `parsePaperSetting` upper-cases the size word before checking it but compares the
  // ORIENTATION exactly — so `paper a4 landscape` is legal and `paper A4 Landscape` is
  // a parse error. Both alternations are derived (never retyped), and the asymmetry is
  // rendered rather than tidied away: a grammar that only offered `A4` would refuse a
  // spelling the parser accepts. A size is two characters, so folding the whole word is
  // the complete set of accepted spellings, not a sample.
  const paperSize = litAlt(PAPER_SIZES.flatMap((s) => [s, s.toLowerCase()]));
  const paperOrientation = litAlt(PAPER_ORIENTATIONS);

  return [
    // ---- top level -------------------------------------------------------
    ["root", `ws "plan" rws string ws "{" ws ( plan-stmt ws )* "}" ws`],
    [
      "plan-stmt",
      `setting | title-stmt | axes-stmt | acc-stmt | theme-stmt | style-stmt | component-stmt | import-stmt | strip-stmt | level-stmt | block-stmt`,
    ],
    [
      "block-stmt",
      // `place-stmt` precedes `instance-stmt`: both begin with a word, and the bare-call
      // rule would otherwise consume `place` as the component name.
      `element | let-stmt | for-stmt | if-stmt | while-stmt | set-stmt | zone-stmt | place-stmt | instance-stmt | assign-stmt`,
    ],
    [
      "element",
      `wall-stmt | room-stmt | door-stmt | window-stmt | opening-stmt | furniture-stmt | dim-stmt | column-stmt | stair-stmt | elevator-stmt | escalator-stmt | roof-stmt | void-stmt | outdoor-stmt | fence-stmt`,
    ],

    // ---- plan settings ---------------------------------------------------
    [
      "setting",
      `units-stmt | grid-stmt | paper-stmt | scale-stmt | north-stmt | site-stmt | dims-stmt | schedule-stmt | legend-stmt`,
    ],
    ["units-stmt", `"units" rws "mm"`],
    ["grid-stmt", `"grid" rws number`],
    ["paper-stmt", `"paper" rws paper-size ( rws paper-orientation )?`],
    ["paper-size", paperSize],
    ["paper-orientation", paperOrientation],
    ["scale-stmt", `"scale" rws number ws ":" ws number`],
    ["north-stmt", `"north" rws north-dir`],
    ["north-dir", `"up" | "down" | "left" | "right" | number`],
    // `site { street … [hemisphere …] }` — both value sets INJECTED from the closed
    // vocabularies the parser itself checks against (`src/ast.ts`), never retyped: a
    // direction added there and typed out here would ship a decoder that cannot emit it
    // while `check:drift` stayed green. Fields may appear in either order and either may
    // repeat, which is what the parser accepts.
    ["site-stmt", `"site" ws "{" ws ( site-field ws )* "}"`],
    // `boundary` (v1.31) is a third field of the same block, in the same either-order
    // shape. Three vertices minimum, the parser's own floor.
    [
      "site-field",
      `"street" rws compass-dir | "hemisphere" rws hemisphere | "boundary" ws point ws point ws point ( ws point )*`,
    ],
    ["compass-dir", litAlt(COMPASS_DIRECTIONS)],
    ["hemisphere", litAlt(HEMISPHERES)],
    ["dims-stmt", `"dims" rws "auto" ( rws dims-mode )?`],
    ["dims-mode", `"overall" | "rooms" | "walls" | "all"`],
    // Sheet tables: `schedule <subject>` (subjects injected from SCHEDULE_SUBJECTS, the
    // parser's own closed list) and the bare `legend` flag.
    ["schedule-stmt", `"schedule" rws schedule-subject`],
    ["schedule-subject", litAlt(SCHEDULE_SUBJECTS)],
    ["legend-stmt", `"legend"`],
    ["acc-stmt", `( "accTitle" | "accDescr" ) rws string`],

    // ---- title / theme / style ------------------------------------------
    ["title-stmt", `"title" ws "{" ws ( title-field ws )* "}"`],
    ["title-field", `( "project" | "drawn_by" | "date" ) rws string`],
    // Positioning axes (定位轴线): one row per direction, each a comma-separated
    // expression list. Rows may repeat and appear in either order (the parser appends).
    ["axes-stmt", `"axes" ws "{" ws ( axes-row ws )* "}"`],
    ["axes-row", `( "x" | "y" ) rws "at" ws expr ( ws "," ws expr )*`],
    // Base name and block are INDEPENDENTLY optional — `parseTheme` takes a leading
    // ident if there is one and a block if there is one, so a bare `theme` (a legal
    // no-op) parses. Only `from` is exclusive.
    ["theme-stmt", `"theme" ( rws "from" rws string | ( rws ident )? ( ws theme-block )? )`],
    ["theme-block", `"{" ws ( theme-entry ws )* "}"`],
    // KNOWN OVER-PERMISSIVE, pinned rather than hidden. `config-value` is right for
    // `theme` only by accident of key: every theme key but `lineWeight` takes a string,
    // so `theme { wall 5 }` is a parse error (`Expected string but found "5"`).
    // Splitting the rule by value type needs the theme key table AND its friendly
    // aliases (`wall` → `wallStroke`) injected from `src/theme.ts`, where the alias map
    // is module-private. See the `DIVERGENT` pin in `test/gbnf-drift.test.ts`, which
    // fails the day this is fixed.
    ["theme-entry", `ident ws ":"? ws config-value`],
    ["style-stmt", `"style" rws ident ws "{" ws ( style-entry ws )* "}"`],
    // A style value is ALWAYS a string — every entry in `STYLE_KEYS` maps to a colour
    // Theme key, and `parseStyle` reads it with `eatString`, so `style room { fill 5 }`
    // is a parse error. No key table needed: the rule is uniform.
    ["style-entry", `ident ws ":"? ws string`],
    ["config-value", `string | number`],

    // ---- decls / control -------------------------------------------------
    ["component-stmt", `"component" rws ident ws "(" ws param-list? ws ")" ws block`],
    ["param-list", `ident ( ws "," ws ident )*`],
    // `import "x.arch" as name` (no item list) is WHOLE-FILE instantiation: the module's
    // own top-level statements become one zero-argument component.
    ["import-stmt", `"import" rws string ( ws ":" ws import-items | rws "as" rws ident )`],
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
    // `place C(args) as name at (x,y) [rotate n] [mirror x|y]` — `as` and `at` are both
    // REQUIRED, and the grammar says so: an optional `as` would let a decoder emit the
    // legacy inline macro while believing it wrote an addressable instance.
    [
      "place-stmt",
      `"place" rws ident ws "(" ws ( expr ( ws "," ws expr )* )? ws ")" rws "as" rws ident rws "at" ws point ( rws "rotate" ws number )? ( rws "mirror" rws mirror-axis )?`,
    ],
    ["mirror-axis", `"x" | "y"`],
    ["assign-stmt", `ident ws "=" ws expr`],
    ["block", `"{" ws ( block-stmt ws )* "}"`],

    // ---- strip -----------------------------------------------------------
    // The cross-axis keyword is chosen BY THE DIRECTION, not offered as a pair: a
    // horizontal strip (`right`/`left`) shares a `height`, a vertical one (`down`/`up`)
    // shares a `width`, and `parseStrip` only ever looks for the one its direction
    // implies — so `strip right … width 3000` is a parse error, not a synonym.
    ["strip-stmt", `"strip" rws ( strip-h | strip-v ) ws "{" ws ( strip-room ws )* "}"`],
    ["strip-h", `( "right" | "left" ) rws "at" ws point rws "gap" ws expr ( rws "height" ws expr )?`],
    ["strip-v", `( "down" | "up" ) rws "at" ws point rws "gap" ws expr ( rws "width" ws expr )?`],
    // A strip child is NOT a `room` statement: it takes a main-axis extent instead of
    // `at`+`size`, and its `label` takes no `at (x,y)` anchor (`parseStripRoom` reads
    // the string and stops), so it gets its own label rule rather than sharing
    // `room-label`.
    ["strip-room", `"room" rws id-opt "size" ws strip-size ( ws strip-label )? ( ws room-uses )?`],
    ["strip-label", `"label" ws string`],
    ["strip-size", `expr ( ws "x" ws expr )?`],

    // ---- level (one storey; a plan-level block, body = ordinary statements) ----
    ["level-stmt", `"level" rws ( "-" ws )? number ( rws string )? ws block`],

    // ---- zone (a wing/department grouping; legal wherever a statement is) ----
    ["zone-stmt", `"zone" rws ident ( rws string )? ws block`],

    // ---- elements --------------------------------------------------------
    [
      "wall-stmt",
      `"wall" rws id-opt ident rws "thickness" ws expr ( ws wall-material )? ws "{" ws point ws ( wall-vertex ws )+ ( "close" ws )? "}"`,
    ],
    ["wall-material", `"material" rws ident ( rws ( "scale" | "angle" ) ws expr ){0,2}`],
    // A wall vertex is a plain point or a CURVED edge arriving at one (v1.24).
    //
    // Two arity facts are encoded in `wall-stmt` above rather than left to the
    // resolver, because BOTH are `ctx.fail` — parse errors with no catalogued code:
    // the body opens with a plain `point` (an `arc` cannot lead the list; there would
    // be nothing to curve away from) and then takes one or more further vertices,
    // since "a wall needs at least two points" counts arc endpoints too.
    ["wall-vertex", `point | wall-arc`],
    ["wall-arc", `"arc" ws point ws "radius" ws expr ( rws arc-dir )? ( rws "major" )?`],
    ["arc-dir", `"cw" | "ccw"`],
    // Two shapes: the rectangle (`at`/relational + `size`) and the explicit RING
    // (`polygon` + >=3 points, no `size`). Both take the same trailing clauses.
    ["room-stmt", `"room" rws id-opt ( room-rect | room-poly | room-circle ) ( ws room-label )? ( ws room-uses )?`],
    ["room-rect", `room-pos ws "size" ws dims`],
    // THREE vertices minimum, not two — `parseRoom` fails outright below three
    // ("A polygon room needs at least three vertices"), and a two-point ring is
    // exactly the degenerate thing a decoder would otherwise be free to emit.
    ["room-poly", `"polygon" ws point ws point ws point ( ws point )*`],
    ["room-circle", `"circle" rws "at" ws point ws "radius" ws expr`],
    ["room-pos", `"at" ws point | rel-dir rws ref ( rws "align" rws ident )? ( rws "gap" ws expr )?`],
    ["rel-dir", `"right-of" | "left-of" | "below" | "above"`],
    ["room-label", `"label" ws string ( ws "at" ws point )?`],
    ["room-uses", `"uses" rws use-kind ( rws use-kind )*`],
    ["use-kind", useKind],
    // The KIND word leads, after any `id=` — the shipped `room polygon` / `room circle`
    // / `dim faces` shape. Its alternation is INJECTED from `DOOR_KINDS`, guarded above.
    ["door-stmt", `"door" rws id-opt ( door-kind rws )? opening-placement door-clauses`],
    ["door-kind", litAlt(DOOR_KINDS)],
    // One `( … )?` per DOOR_ENUMS key, in the table's key order, plus the trailing
    // `open` — and one `<key>-val` production per clause, all INJECTED from the table
    // (`assertDoorVocab` above fails the build if a key loses its production, a
    // production stops deriving its alternation, or the key order stops matching the
    // parser's). A SEQUENCE of optionals, not `( clause )*`: `door.parse()` tests each
    // keyword once, in this order, so both a re-ordering and a repeat are parse errors.
    // The non-enum prefixes — `hinge near <vertex>`, `swing into <ref>` — are grammar
    // structure rather than enum members, so they are stated here beside the injection.
    // `open <0..1>` is a number, not a closed value set, so it is structure too.
    [
      "door-clauses",
      [...DOOR_CLAUSES.map((c) => `( ws ${lit(c)} rws ${c}-val )?`), `( ws "open" ws expr )?`].join(" "),
    ],
    ["hinge-val", `"near" rws ( ${litAlt(DOOR_HINGE_NEAR)} ) | ${litAlt(DOOR_ENUMS.hinge)}`],
    ["swing-val", `"into" rws ref | ${litAlt(DOOR_ENUMS.swing)}`],
    ["slide-val", litAlt(DOOR_ENUMS.slide)],
    ["window-stmt", `"window" rws id-opt opening-placement`],
    ["opening-stmt", `"opening" rws id-opt opening-placement`],
    /*
     * The shared placement of `door`/`window`/`opening`, and the ONE place the
     * either/or between the two forms is stated.
     *
     * The trailing `wall <id|category>` clause pairs with the FREE form only. After
     * `on <wall> at <pos>` the host is already named by construction, and the parsers
     * guard the clause on exactly that (`if (!attach && ctx.isKeyword("wall"))` in
     * src/elements/{door,window,opening}.ts), so `door on w1 at 50% width 900 wall w1`
     * is a PARSE error — no `E_*` code, no recovery, the statement is simply not in the
     * language. A grammar that offers the clause after `on` hands a constrained decoder
     * the one output it exists to make impossible, which is why this is a split
     * production rather than a shared target plus an optional tail.
     */
    ["opening-placement", `opening-free | opening-hosted`],
    ["opening-free", `"at" ws point ws "width" ws expr ( ws "wall" rws ref )?`],
    ["opening-hosted", `"on" rws ref rws "at" ws attach-pos ws "width" ws expr`],
    /*
     * The attachment position is a full EXPRESSION (v1.27.0), not a bare number — a
     * `for`-generated run of openings places itself with `on w1 at bay * i + 600`.
     *
     * It is `attach-expr`, not `expr`, for one reason: in this slot `%` is the percent
     * SUFFIX, so `src/attach.ts` parses it with `noModulo` and a trailing `%` always
     * ENDS the expression (`on w1 at 1000 % 3 width 900` is a parse error, not a
     * modulo). `attach-expr` mirrors the precedence cascade with `%` removed from the
     * multiplicative operators, and stops there: a parenthesised sub-expression, an
     * index and a call argument all reach the FULL `expr` again through the shared
     * `atom`/`postfix-expr`, exactly as the parser does when it recurses into
     * `parseExpr` with no options. Writing `expr` here instead would hand a constrained
     * decoder `at 1000 % 3` — the one output shape this file exists to make impossible.
     */
    ["attach-pos", `"center" | attach-expr ws "%" | attach-expr`],
    /*
     * Two shapes, because the trailing `in <roomId>` is available to only one of them.
     * `at`/`against` do not name a room, so the piece may declare its owner at the end;
     * the `in <room> centered|anchor …` form ALREADY named it, and `furniture.parse()`
     * reads the trailing clause under `if (node.room === undefined && …)` — so a second
     * `in` is a parse error, not a redundant repeat.
     */
    ["furniture-stmt", `"furniture" rws id-opt ident rws ( furn-placed | furn-roomed )`],
    ["furn-placed", `( furn-at | furn-against ) furn-tail ( ws "in" rws ref )?`],
    ["furn-roomed", `"in" rws ref rws in-place furn-tail`],
    ["furn-at", `"at" ws point`],
    // `segment`, `offset`, `side` — read once each, in this order (a fixed run of
    // `if`s, like every other element's clause list).
    [
      "furn-against",
      `"against" rws "wall" rws ref ( ws "segment" ws expr )? ( ws "offset" ws expr )? ( ws "side" rws ident )?`,
    ],
    ["in-place", `"centered" | "anchor" rws anchor ( ws "flush" )? ( ws "inset" ws expr )?`],
    ["anchor", anchor],
    // `size`, `label`, `rotate` — the shared tail, in the parser's order.
    ["furn-tail", `( ws "size" ws dims )? ( ws "label" ws string )? ( ws "rotate" ws expr )?`],
    [
      "dim-stmt",
      `"dim" ( ( rws dim-ref )? ws point ws "->" ws point | rws dim-curve ) ( ws "offset" ws expr )? ( ws "text" ws string )?`,
    ],
    ["dim-curve", `"radius" rws ref ( rws "segment" ws expr )? | "diameter" rws ref`],
    ["dim-ref", `"faces" | "clear"`],
    ["column-stmt", `"column" rws id-opt "at" ws point ws "size" ws dims`],
    ["stair-stmt", `"stair" rws id-opt "at" ws point ws "size" ws dims ws "dir" rws vert-dir ( ws "width" ws expr )?`],
    ["elevator-stmt", `"elevator" rws id-opt "at" ws point ws "size" ws dims`],
    ["escalator-stmt", `"escalator" rws id-opt "at" ws point ws "size" ws dims ws "dir" rws vert-dir`],
    ["vert-dir", `"up" | "down"`],
    /*
     * `roof` takes NO `id=`: the shape word leads directly, the way `room polygon` /
     * `room circle` and a door KIND do. The two spellings are alternatives, never a
     * sequence — `roof overhang 600 polygon (0,0) …` is not in the language — so this is
     * a split production and not a pair of optional tails, for exactly the reason
     * `opening-placement` is: a decoder offered both would emit the one output shape this
     * file exists to make impossible. The ring is `point point point ( ws point )*`
     * rather than `( ws point ){3,}`, because three is a MINIMUM the parser enforces.
     */
    ["roof-stmt", `"roof" rws ( roof-overhang | roof-polygon )`],
    ["roof-overhang", `"overhang" ws expr ( rws "wall" rws ref )?`],
    ["roof-polygon", `"polygon" ws point ws point ws point ( ws point )*`],
    ["void-stmt", `"void" rws id-opt "at" ws point ws "size" ws dims`],
    /*
     * `outdoor` mirrors `room`'s shape exactly — the KIND word after any `id=`, then one
     * of two mutually-exclusive spellings, then the trailing clauses in the parser's own
     * fixed order (`label` before `rail`). Split, not a pair of optional tails, for the
     * same reason `room-rect | room-poly` is: a decoder offered both would emit the one
     * shape this file exists to make impossible. Three vertices minimum on the ring, the
     * parser's own floor.
     *
     * `rail` renders as `rail-edge ( rws rail-edge )*` because the clause really is
     * repeatable, and the comma spelling is a separate arm rather than an optional comma
     * inside the repeat — `rail top,` with nothing after it is not in the language.
     */
    [
      "outdoor-stmt",
      `"outdoor" rws id-opt outdoor-kind rws ( outdoor-rect | outdoor-poly ) ( ws outdoor-label )? ( ws outdoor-rail )?`,
    ],
    ["outdoor-kind", litAlt(OUTDOOR_KINDS)],
    ["outdoor-rect", `"at" ws point ws "size" ws dims`],
    ["outdoor-poly", `"polygon" ws point ws point ws point ( ws point )*`],
    ["outdoor-label", `"label" ws string`],
    ["outdoor-rail", `"rail" rws rail-edge ( ( ws "," ws | rws ) rail-edge )*`],
    ["rail-edge", litAlt(RAIL_EDGES)],
    // The style word LEADS and is optional (the `door-kind` shape). A fence body is a
    // point list with an optional `close`, exactly like a wall's — minus `arc`, which is
    // refused by the compiler (`E_FENCE_CURVED`) and so must not be derivable here.
    // TWO vertices minimum, not one — `fence.parse` fails outright below two ("A fence
    // needs at least two points"), exactly as `wall` does, and a one-point run is
    // precisely the degenerate thing a decoder would otherwise be free to emit. The first
    // draft wrote `( point ws )*` here and the agreement corpus caught it on the first
    // run: the grammar DERIVED a form the parser refuses, which is the one defect this
    // whole file exists to prevent.
    ["fence-stmt", `"fence" rws id-opt ( fence-style rws )? "{" ws point ws ( point ws )+ ( "close" ws )? "}"`],
    ["fence-style", litAlt(FENCE_STYLES)],

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
    // The same cascade with `%` taken out of the multiplicative operators, for the one
    // slot where `%` is a suffix rather than an operator (see `attach-pos`). It rejoins
    // the shared cascade at `unary-expr`, below which `%` cannot appear anyway.
    ["attach-expr", `nm-or-expr`],
    ["nm-or-expr", `nm-and-expr ( ws "||" ws nm-and-expr )*`],
    ["nm-and-expr", `nm-eq-expr ( ws "&&" ws nm-eq-expr )*`],
    ["nm-eq-expr", `nm-cmp-expr ( ws eq-op ws nm-cmp-expr )*`],
    ["nm-cmp-expr", `nm-range-expr ( ws cmp-op ws nm-range-expr )*`],
    ["nm-range-expr", `nm-add-expr ( ws ".." ws nm-add-expr )*`],
    ["nm-add-expr", `nm-mul-expr ( ws add-op ws nm-mul-expr )*`],
    ["nm-mul-expr", `unary-expr ( ws nm-mul-op ws unary-expr )*`],
    ["nm-mul-op", `"*" | "/"`],
    ["unary-expr", `unary-op ws unary-expr | postfix-expr`],
    ["unary-op", `"-" | "+" | "!"`],
    ["postfix-expr", `atom ( ws "[" ws expr ws "]" )*`],
    // `ref` is defined ONCE, down in the lexical section (it is the dotted form). It
    // used to be defined a second time here as a bare `ident`, which is a duplicate
    // rule name in the emitted file: one of the two lines is dead in any GBNF engine,
    // and some reject the grammar outright.
    ["atom", `number | string | array | if-expr | call | ref | "(" ws expr ws ")"`],
    ["call", `ident ws "(" ws ( expr ( ws "," ws expr )* )? ws ")"`],
    ["array", `"[" ws ( expr ( ws "," ws expr )* )? ws "]"`],
    ["if-expr", `"if" ws expr ws "{" ws expr ws "}" ws "else" ws "{" ws expr ws "}"`],

    // ---- lexical ---------------------------------------------------------
    // A numeric literal may carry an optional metric unit suffix (mm|cm|m),
    // folded to millimetres by the lexer; the value is scaled, the token shape
    // is otherwise a number. The integer part is optional (`.5` lexes as a number —
    // `c === "." && isDigit(peek(1))` in `lexImpl`) but the fraction's digits are not,
    // so `5.` is a lex error in both.
    ["number", `( digits frac? | frac ) unit?`],
    ["digits", `[0-9]+`],
    ["frac", `"." digits`],
    ["unit", `"mm" | "cm" | "m"`],
    ["ident", `[a-zA-Z_] [a-zA-Z0-9_]*`],
    // A REFERENCE to an element, which may be namespaced by a `place`d instance
    // (`west.perimeter`). Declarations keep the undotted `ident` — a dotted name in a
    // declaration position is `E_DOTTED_DECL`, and the grammar must not invite one.
    ["ref", `ident ( "." ident )*`],
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
  const pairs = rules();
  assertVocab(pairs);
  const body = pairs.map(([name, prod]) => `${name} ::= ${prod}`).join("\n");
  return `${HEADER}\n${body}\n`;
}

/** Write the grammar to disk (CLI entry). */
function main(): void {
  writeFileSync(resolve(ROOT, "grammars/archlang.gbnf"), renderGbnf());
  process.stdout.write("✓ generated grammars/archlang.gbnf from src/grammar/tokens.ts\n");
}

// Run only when invoked directly (not when imported by the drift test).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
