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
 * PRACTICAL, NOT PARSER-EQUIVALENT. The grammar is deliberately a *superset* of the
 * hand-written parser: it may accept token spacings the lexer would merge, or
 * attribute orders the parser fixes, but it must NEVER reject a valid `.arch`
 * (acceptance of the whole `examples/` corpus is the hard test). The parser and its
 * catalogued diagnostics remain the source of truth for what is actually valid.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { DoorEnumClause } from "../src/grammar/tokens.js";
import { DOOR_ENUMS, DOOR_HINGE_NEAR, DOOR_KINDS, KEYWORDS, OPERATORS } from "../src/grammar/tokens.js";
import { USE_KINDS, FURNITURE_ANCHORS, SCHEDULE_SUBJECTS, COMPASS_DIRECTIONS, HEMISPHERES } from "../src/ast.js";
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
  const paperSize = litAlt(PAPER_SIZES);
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
      `wall-stmt | room-stmt | door-stmt | window-stmt | opening-stmt | furniture-stmt | dim-stmt | column-stmt | stair-stmt | elevator-stmt | escalator-stmt`,
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
    ["site-field", `"street" rws compass-dir | "hemisphere" rws hemisphere`],
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
    ["theme-stmt", `"theme" ( rws "from" rws string | rws ident ( ws theme-block )? | ws theme-block )`],
    ["theme-block", `"{" ws ( theme-entry ws )* "}"`],
    ["theme-entry", `ident ws ":"? ws config-value`],
    ["style-stmt", `"style" rws ident ws "{" ws ( style-entry ws )* "}"`],
    ["style-entry", `ident ws ":"? ws config-value`],
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
    [
      "strip-stmt",
      `"strip" rws strip-dir rws "at" ws point rws "gap" ws expr ( rws strip-cross )? ws "{" ws ( strip-room ws )* "}"`,
    ],
    ["strip-dir", `"right" | "left" | "down" | "up"`],
    ["strip-cross", `( "height" | "width" ) ws expr`],
    ["strip-room", `"room" rws id-opt "size" ws strip-size ( ws room-label )? ( ws room-uses )?`],
    ["strip-size", `expr ( ws "x" ws expr )?`],

    // ---- level (one storey; a plan-level block, body = ordinary statements) ----
    ["level-stmt", `"level" rws ( "-" ws )? number ( rws string )? ws block`],

    // ---- zone (a wing/department grouping; legal wherever a statement is) ----
    ["zone-stmt", `"zone" rws ident ( rws string )? ws block`],

    // ---- elements --------------------------------------------------------
    [
      "wall-stmt",
      `"wall" rws id-opt ident rws "thickness" ws expr ( ws wall-material )? ws "{" ws ( wall-vertex ws )* ( "close" ws )? "}"`,
    ],
    ["wall-material", `"material" rws ident ( rws ( "scale" | "angle" ) ws expr ){0,2}`],
    // A wall vertex is a plain point or a CURVED edge arriving at one (v1.24). `arc`
    // cannot lead the list (there would be nothing to curve from), but that is a
    // resolve-time diagnostic, not a grammar rule — a constrained decoder should be able
    // to emit the form and be told, the same way it can emit an off-wall door.
    ["wall-vertex", `point | wall-arc`],
    ["wall-arc", `"arc" ws point ws "radius" ws expr ( rws arc-dir )? ( rws "major" )?`],
    ["arc-dir", `"cw" | "ccw"`],
    // Two shapes: the rectangle (`at`/relational + `size`) and the explicit RING
    // (`polygon` + >=3 points, no `size`). Both take the same trailing clauses.
    ["room-stmt", `"room" rws id-opt ( room-rect | room-poly | room-circle ) ( ws room-label )? ( ws room-uses )?`],
    ["room-rect", `room-pos ws "size" ws dims`],
    ["room-poly", `"polygon" ws point ws point ( ws point )*`],
    ["room-circle", `"circle" rws "at" ws point ws "radius" ws expr`],
    ["room-pos", `"at" ws point | rel-dir rws ref ( rws "align" rws ident )? ( rws "gap" ws expr )?`],
    ["rel-dir", `"right-of" | "left-of" | "below" | "above"`],
    ["room-label", `"label" ws string ( ws "at" ws point )?`],
    ["room-uses", `"uses" rws use-kind ( rws use-kind )*`],
    ["use-kind", useKind],
    // The KIND word leads, after any `id=` — the shipped `room polygon` / `room circle`
    // / `dim faces` shape. Its alternation is INJECTED from `DOOR_KINDS`, guarded above.
    ["door-stmt", `"door" rws id-opt ( door-kind rws )? opening-target ws "width" ws expr ( ws door-clause )*`],
    ["door-kind", litAlt(DOOR_KINDS)],
    // One clause per DOOR_ENUMS key, and one `<key>-val` production per clause, both
    // INJECTED from the table (`assertDoorVocab` above fails the build if a key ever
    // loses its production or a production stops deriving its alternation). The
    // non-enum prefixes — `hinge near <vertex>`, `swing into <ref>` — are grammar
    // structure rather than enum members, so they are stated here beside the injection.
    // `open <0..1>` is a number, not a closed value set, so it is structure too.
    [
      "door-clause",
      [`"wall" rws ref`, ...DOOR_CLAUSES.map((c) => `${lit(c)} rws ${c}-val`), `"open" ws expr`].join(" | "),
    ],
    ["hinge-val", `"near" rws ( ${litAlt(DOOR_HINGE_NEAR)} ) | ${litAlt(DOOR_ENUMS.hinge)}`],
    ["swing-val", `"into" rws ref | ${litAlt(DOOR_ENUMS.swing)}`],
    ["slide-val", litAlt(DOOR_ENUMS.slide)],
    ["window-stmt", `"window" rws id-opt opening-target ws "width" ws expr ( ws "wall" rws ref )?`],
    ["opening-stmt", `"opening" rws id-opt opening-target ws "width" ws expr ( ws "wall" rws ref )?`],
    ["opening-target", `"at" ws point | "on" rws ref rws "at" ws attach-pos`],
    ["attach-pos", `"center" | number ws "%" | number`],
    ["furniture-stmt", `"furniture" rws id-opt ident rws furn-pos ( ws furn-clause )*`],
    ["furn-pos", `"against" rws "wall" rws ref ( ws against-opt )* | "in" rws ref rws in-place | "at" ws point`],
    ["against-opt", `"segment" ws expr | "offset" ws expr | "side" rws ident`],
    ["in-place", `"centered" | "anchor" rws anchor ( ws "flush" )? ( ws "inset" ws expr )?`],
    ["anchor", anchor],
    ["furn-clause", `"size" ws dims | "label" ws string | "rotate" ws expr | "in" rws ref`],
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
