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
 * CLAUSE ORDER (card CO-1). In the statements `ORDER_FREE_STATEMENTS` names
 * (`src/clause-order.ts`), the clauses after the placement come in any order, so each renders
 * them as `( ws <stmt>-clause )*`, with a clause it cannot leave out (`size`, `width`) required
 * once among them. A repeat is in the grammar on purpose: the parser reads it and reports
 * `E_DUP_CLAUSE`, a catalogued code, which is the same deal the grammar makes with every form
 * the resolver refuses. Every other element keeps its fixed run of `( … )?` optionals, in the
 * parser's own order. `ID_AFTER_KIND_STATEMENTS` take a second `id-opt` after the kind word.
 * {@link assertClauseShapes} fails the build when either list and the productions disagree.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { DoorEnumClause } from "../src/grammar/tokens.js";
import {
  DOOR_ENUMS,
  DOOR_HINGE_NEAR,
  DOOR_KINDS,
  DOOR_SWING_BUILDING,
  KEEP_GRADES,
  KEEP_WORDS,
  KEYWORDS,
  OPERATORS,
  TITLE_FIELDS,
  WALL_STATUSES,
  WINDOW_KINDS,
} from "../src/grammar/tokens.js";
import {
  USE_KINDS,
  FURNITURE_ANCHORS,
  SCHEDULE_SUBJECTS,
  COMPASS_DIRECTIONS,
  FENCE_STYLES,
  HEMISPHERES,
  OUTDOOR_KINDS,
  RAIL_EDGES,
  RAIL_SIDES,
} from "../src/ast.js";
import { FLOOR_MATERIALS } from "../src/hatches.js";
import { PAPER_ORIENTATIONS, PAPER_SIZES } from "../src/sheet.js";
import { EDGE_WORDS } from "../src/room-datums.js";
import { SEGMENT_COMPASS_WORDS } from "../src/segment-select.js";
import { ID_AFTER_KIND_STATEMENTS, ORDER_FREE_STATEMENTS } from "../src/clause-order.js";

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

/** The door clauses that take a closed value set, in table order. Since card CO-1 the order is
 *  no longer load-bearing: a door's clauses come in any order, so `door-clause` is an alternation. */
const DOOR_CLAUSES = Object.keys(DOOR_ENUMS) as DoorEnumClause[];

/**
 * The clauses after a placement, in any order: `( ws <clause> )*`, or, with a clause the
 * statement cannot leave out, that clause once somewhere among them (a repeat of it too, which
 * the parser reports as `E_DUP_CLAUSE`).
 */
const anyOrder = (clause: string, required?: string): string =>
  required ? `( ws ${clause} )* ws ${required} ( ws ( ${clause} | ${required} ) )*` : `( ws ${clause} )*`;

/**
 * The clause-order guard (card CO-1). Every statement in `orderFree` must render a
 * `<stmt>-clause` production and reach it through {@link anyOrder}; every `<stmt>-stmt` takes a
 * second `id-opt` (after its kind word) exactly when `idAfter` names it. Exported so a test can
 * prove it fires; the lists are the parser's own (`src/clause-order.ts`), never retyped.
 */
export function assertClauseShapes(
  body: [string, string][],
  orderFree: readonly string[] = ORDER_FREE_STATEMENTS,
  idAfter: readonly string[] = ID_AFTER_KIND_STATEMENTS,
): void {
  const emitted = body.map(([, prod]) => prod).join(" ");
  for (const k of orderFree) {
    if (!body.some(([name]) => name === `${k}-clause`) || !emitted.includes(`( ws ${k}-clause )*`)) {
      throw new Error(
        `gen-gbnf: "${k}" reads its clauses in any order (ORDER_FREE_STATEMENTS), but no \`${k}-clause\` ` +
          `production is rendered through \`( ws ${k}-clause )*\`.`,
      );
    }
  }
  for (const [name, prod] of body) {
    if (!name.endsWith("-stmt")) continue;
    const k = name.slice(0, -"-stmt".length);
    const twice = prod.split("id-opt").length - 1 >= 2;
    if (twice !== idAfter.includes(k)) {
      throw new Error(
        `gen-gbnf: \`${name}\` ${twice ? "takes" : "does not take"} an \`id=\` after its kind word, but ` +
          `ID_AFTER_KIND_STATEMENTS ${idAfter.includes(k) ? "names" : "does not name"} "${k}".`,
      );
    }
  }
}

/** The window-kind guard, {@link assertDoorVocab}'s for a door's: `window-kind` renders the table, and
 *  `window-stmt` reaches it. Exported so a test can prove it fires. */
export function assertWindowVocab(body: [string, string][], kinds: readonly string[] = WINDOW_KINDS): void {
  const kindRule = body.find(([name]) => name === "window-kind");
  if (!kindRule?.[1].includes(litAlt(kinds))) {
    throw new Error(
      `gen-gbnf: \`window-kind\` does not render its value set (${litAlt(kinds)}) — ` +
        `it must be injected from WINDOW_KINDS, never retyped.`,
    );
  }
  if (!body.some(([name, prod]) => name === "window-stmt" && prod.includes("window-kind"))) {
    throw new Error("gen-gbnf: `window-kind` is unreachable from `window-stmt`.");
  }
}

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
  swingBuilding: readonly string[] = DOOR_SWING_BUILDING,
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
  // `swing inward|outward` is a second spelling of `swing` (beside `DOOR_ENUMS`, not a key of
  // it), so the clause loop below cannot see it: its own arm, same rule.
  const swingRule = body.find(([name]) => name === "swing-val");
  if (swingRule && !swingRule[1].includes(litAlt(swingBuilding))) {
    throw new Error(
      `gen-gbnf: \`swing-val\` does not render the building-relative words (${litAlt(swingBuilding)}) — ` +
        `inject them from DOOR_SWING_BUILDING, never retype.`,
    );
  }
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
  // No order check: since card CO-1 a door's clauses come in any order and `door-clause` is an
  // alternation, so the table's key order reaches nothing a parser reads.
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
  assertWindowVocab(body);
  assertClauseShapes(body);
}

/**
 * `keep <form> [grade]` (ADR 0033): each form's leading words from `KEEP_WORDS.forms`, the
 * measures and level words from `KEEP_WORDS`, the grades from `KEEP_GRADES` — derived, never
 * retyped. The tail after the leading words is the form's structure (`parseKeep`,
 * `src/parser.ts`); a form with no tail here throws, so a new form cannot ship ungrammared.
 */
function keepRules(): [string, string][] {
  const tails: Record<string, string> = {
    align: `keep-ref ( rws keep-ref )+`,
    equal: `( ${litAlt(KEEP_WORDS.measures)} ) rws keep-ref ( rws keep-ref )+`,
    offset: `keep-ref rws "from" rws keep-ref ws expr`,
    "min-clear": `keep-ref ws expr`,
    // `on axis <label> <wall>`: the second leading word is the axis datum's own `axis`.
    "on-axis": `( number | ident ) rws keep-ref`,
    stacked: `keep-ref rws ${KEEP_WORDS.levels.map(lit).join(" rws ")} ws expr ( ws expr )+`,
    fixed: `keep-ref rws "at" ws expr`,
  };
  const forms = Object.entries(KEEP_WORDS.forms);
  const missing = forms.filter(([k]) => tails[k] === undefined).map(([k]) => k);
  if (missing.length) throw new Error(`gen-gbnf: keep forms with no production: ${missing.join(", ")}`);
  const name = (k: string): string => `keep-${k}`;
  return [
    ["keep-stmt", `"keep" rws keep-form ( rws keep-grade )?`],
    ["keep-form", forms.map(([k]) => name(k)).join(" | ")],
    ...forms.map(([k, words]): [string, string] => [name(k), `${words.map(lit).join(" rws ")} rws ${tails[k]}`]),
    ["keep-ref", `"axis" rws ( number | ident ) | ref ( rws "segment" rws number )?`],
    ["keep-grade", litAlt(KEEP_GRADES)],
  ];
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
      `setting | title-stmt | axes-stmt | acc-stmt | theme-stmt | style-stmt | component-stmt | import-stmt | strip-stmt | level-stmt | section-stmt | block-stmt`,
    ],
    [
      "block-stmt",
      // `place-stmt` precedes `instance-stmt`: both begin with a word, and the bare-call
      // rule would otherwise consume `place` as the component name.
      `element | let-stmt | for-stmt | if-stmt | while-stmt | set-stmt | keep-stmt | zone-stmt | place-stmt | instance-stmt | assign-stmt`,
    ],
    [
      "element",
      `wall-stmt | room-stmt | door-stmt | window-stmt | opening-stmt | furniture-stmt | dim-stmt | column-stmt | stair-stmt | elevator-stmt | escalator-stmt | roof-stmt | void-stmt | outdoor-stmt | fence-stmt | walls-stmt`,
    ],

    // ---- plan settings ---------------------------------------------------
    [
      "setting",
      `units-stmt | grid-stmt | paper-stmt | scale-stmt | height-stmt | north-stmt | site-stmt | dims-stmt | schedule-stmt | legend-stmt | notes-stmt | sheet-text-stmt`,
    ],
    ["units-stmt", `"units" rws "mm"`],
    ["grid-stmt", `"grid" rws number`],
    ["paper-stmt", `"paper" rws paper-size ( rws paper-orientation )?`],
    ["paper-size", paperSize],
    ["paper-orientation", paperOrientation],
    ["scale-stmt", `"scale" rws ( number ws ":" ws number ( rws "hidden" )? | "hidden" )`],
    // The vertical datum's plan-level setting (v1.35). A full `expr`, not a bare `number`,
    // because the parser reads one — a plan writes `let h = 3200` once and `height h`
    // everywhere, and a grammar that offered only a literal would forbid the form the
    // language accepts.
    // `height <expr> clear <expr>`: a single-storey plan's clear height (RM-D17).
    ["height-stmt", `"height" rws expr ( rws "clear" rws expr )?`],
    ["north-stmt", `"north" rws ( north-dir ( rws "hidden" )? | "hidden" )`],
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
    // `net` rides on `rooms` only; the grammar over-accepts it after `openings` (the parser refuses).
    ["schedule-stmt", `"schedule" rws schedule-subject ( rws "net" )?`],
    ["schedule-subject", litAlt(SCHEDULE_SUBJECTS)],
    ["legend-stmt", `"legend"`],
    // `notes "…" ["…" …]` — one or more note strings for the sheet's NOTES table.
    ["notes-stmt", `"notes" ( rws string )+`],
    // `sheet text { <key> "…" … }`: the keys are a closed table of the parser's (`sheetTextKeys`), too
    // long for a grammar a model is constrained by, so an unknown one is left to the parser's refusal.
    ["sheet-text-stmt", `"sheet" rws "text" ws "{" ws ( ident rws string ws )+ "}"`],
    ["acc-stmt", `( "accTitle" | "accDescr" ) rws string`],

    // ---- title / theme / style ------------------------------------------
    ["title-stmt", `"title" ws "{" ws ( title-field ws )* "}" | "title" rws "hidden"`],
    ["title-field", `( ${litAlt(TITLE_FIELDS)} ) rws string`],
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
    ...keepRules(),
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
    // `room-label`. Its clauses come in any order, as a `room`'s do, `size` once among them.
    ["strip-room", `"room" rws id-opt ${anyOrder("strip-room-clause", "strip-room-size")}`],
    ["strip-room-size", `"size" ws strip-size`],
    ["strip-room-clause", `strip-label | room-uses | room-floor`],
    ["strip-label", `"label" ws string`],
    ["strip-size", `expr ( ws "x" ws expr )?`],

    // ---- level (one storey; a plan-level block, body = ordinary statements) ----
    // The optional `height <expr>` sits in the HEADER, after the name and before the
    // block — the body is an ordinary statement list and a plan setting inside it is
    // `E_LEVEL_MIX`, so there is nowhere else it could go. `slab` then `clear` follow it, in
    // that order, as the parser reads them (MF-D1, RM-D17).
    [
      "level-stmt",
      `"level" rws ( "-" ws )? number ( rws string )? ( rws "height" ws expr )? ( rws "slab" ws expr )? ( rws "clear" ws expr )? ws block`,
    ],

    // ---- zone (a wing/department grouping; legal wherever a statement is) ----
    ["zone-stmt", `"zone" rws ident ( rws string )? ws block`],

    // ---- elements --------------------------------------------------------
    [
      "wall-stmt",
      `"wall" rws id-opt ident rws id-opt "thickness" ws expr ( ws wall-material )? ( ws "height" ws expr )? ( ws wall-status )? ws ( wall-body | wall-relation )`,
    ],
    // `status existing|demolish|new` (B3a): after `height`, before the body, as the parser reads it.
    ["wall-status", `"status" rws ( ${litAlt(WALL_STATUSES)} )`],
    ["wall-body", `"{" ws point ws ( wall-vertex ws )+ ( "close" ws )? "}"`],
    // The pairwise forms (ADR 0028 §4) stand where the point list would: the rooms' shared
    // edge, or one ring on the outline of at least one listed room.
    ["wall-relation", `"between" rws ref rws "and" rws ref | "around" ws "[" ws ref ( rws ref )* ws "]"`],
    ["wall-material", `"material" rws ident ( rws ( "scale" | "angle" ) ws expr ){0,2}`],
    // A wall vertex is a plain point or a CURVED edge arriving at one (v1.24).
    //
    // Two arity facts are encoded in `wall-body` above rather than left to the
    // resolver, because BOTH are `ctx.fail` — parse errors with no catalogued code:
    // the body opens with a plain `point` (an `arc` cannot lead the list; there would
    // be nothing to curve away from) and then takes one or more further vertices,
    // since "a wall needs at least two points" counts arc endpoints too.
    ["wall-vertex", `point | wall-arc`],
    ["wall-arc", `"arc" ws point ws "radius" ws expr ( rws arc-dir )? ( rws "major" )?`],
    ["arc-dir", `"cw" | "ccw"`],
    // Two shapes: the rectangle (`at`/relational + `size`) and the explicit RING
    // (`polygon` + >=3 points, no `size`). Both take the same trailing clauses, in any order;
    // the rectangle's `size` is one of them, once.
    ["room-stmt", `"room" rws id-opt ( room-rect | room-poly room-tail | room-circle room-tail )`],
    ["room-rect", `room-pos ${anyOrder("room-clause", "room-size")}`],
    ["room-size", `"size" ws dims`],
    ["room-tail", anyOrder("room-clause")],
    ["room-clause", `room-label | room-uses | room-floor`],
    // THREE vertices minimum, not two — `parseRoom` fails outright below three
    // ("A polygon room needs at least three vertices"), and a two-point ring is
    // exactly the degenerate thing a decoder would otherwise be free to emit.
    ["room-poly", `"polygon" ws point ws point ws point ( ws point )*`],
    ["room-circle", `"circle" rws "at" ws point ws "radius" ws expr`],
    ["room-pos", `"at" ws point | rel-dir rws ref ( rws "align" rws ident )? ( rws "gap" ws expr )?`],
    ["rel-dir", `"right-of" | "left-of" | "below" | "above"`],
    ["room-label", `"label" ws string ( ws "at" ws point )?`],
    ["room-uses", `"uses" rws use-kind ( rws use-kind )*`],
    ["room-floor", `"floor" rws ( ${FLOOR_MATERIALS.map((m) => `"${m}"`).join(" | ")} )`],
    ["use-kind", useKind],
    // The KIND word leads, after any `id=` (and an `id=` may follow it) — the shipped
    // `room polygon` / `room circle` / `dim faces` shape. Its alternation is INJECTED from
    // `DOOR_KINDS`, guarded above.
    [
      "door-stmt",
      `"door" rws id-opt ( door-kind rws id-opt )? ( opening-free-pos ${anyOrder("door-free-clause", "opening-width")} | ( opening-hosted-pos | opening-edge-pos | opening-between-pos ) ${anyOrder("door-clause", "opening-width")} )`,
    ],
    ["door-kind", litAlt(DOOR_KINDS)],
    // One arm per DOOR_ENUMS key, then `open` and `head` — and one `<key>-val` production per
    // clause, all INJECTED from the table (`assertDoorVocab` above fails the build if a key
    // loses its production or a production stops deriving its alternation). An alternation
    // read through `anyOrder`: since card CO-1 a door's clauses come in any order. The non-enum
    // prefixes — `hinge near <vertex>`, `swing into <ref>` — are grammar structure rather than
    // enum members, so they are stated here beside the injection. `open <0..1>` and the vertical
    // `head` take a number, not a closed value set, so they are structure too.
    [
      "door-clause",
      [...DOOR_CLAUSES.map((c) => `${lit(c)} rws ${c}-val`), `"open" ws expr`, `"head" ws expr`].join(" | "),
    ],
    ["door-free-clause", `door-clause | opening-wall`],
    ["hinge-val", `"near" rws ( ${litAlt(DOOR_HINGE_NEAR)} ) | ${litAlt(DOOR_ENUMS.hinge)}`],
    ["swing-val", `"into" rws ref | ${litAlt(DOOR_SWING_BUILDING)} | ${litAlt(DOOR_ENUMS.swing)}`],
    ["slide-val", litAlt(DOOR_ENUMS.slide)],
    // `sill` is a WINDOW's alone: a door or a cased opening starts at the floor — a `sill`
    // clause there is not a redundant one, it is not in the language. A kind word leads, as
    // on a `door`, and `hinge` takes the door's two sides, not `near`.
    [
      "window-stmt",
      `"window" rws id-opt ( window-kind rws id-opt )? ( opening-free-pos ${anyOrder("window-free-clause", "opening-width")} | ( opening-hosted-pos | opening-edge-pos ) ${anyOrder("window-clause", "opening-width")} )`,
    ],
    ["window-clause", `"hinge" rws window-hinge | "sill" ws expr | "head" ws expr`],
    ["window-free-clause", `window-clause | opening-wall`],
    ["window-kind", litAlt(WINDOW_KINDS)],
    ["window-hinge", litAlt(DOOR_ENUMS.hinge)],
    [
      "opening-stmt",
      `"opening" rws id-opt ( opening-free-pos ${anyOrder("opening-free-clause", "opening-width")} | ( opening-hosted-pos | opening-edge-pos | opening-between-pos ) ${anyOrder("opening-clause", "opening-width")} )`,
    ],
    ["opening-clause", `"head" ws expr`],
    ["opening-free-clause", `opening-clause | opening-wall`],
    ["opening-width", `"width" ws expr`],
    /*
     * The shared placements of `door`/`window`/`opening`, and the ONE place the
     * either/or between the two forms is stated.
     *
     * The `wall <id|category>` clause pairs with the FREE form only. After
     * `on <wall> at <pos>` the host is already named by construction, and the parsers
     * offer the clause on exactly that (`at ? [wallClause(…)] : []` in
     * src/elements/{door,window,opening}.ts), so `door on w1 at 50% width 900 wall w1`
     * is a PARSE error — no `E_*` code, no recovery, the statement is simply not in the
     * language. A grammar that offers the clause after `on` hands a constrained decoder
     * the one output it exists to make impossible, which is why each statement splits its
     * clause set (`<stmt>-free-clause` adds `opening-wall`) rather than sharing one.
     */
    ["opening-free-pos", `"at" ws point`],
    ["opening-hosted-pos", `"on" rws ref rws "at" ws attach-pos`],
    ["opening-wall", `"wall" rws ref`],
    /*
     * The relational placements (ADR 0028 §5). `on <room>.<edge>` may leave its position
     * out (the parser accepts that only for a name ending in an edge word, so the
     * production names the edge word), and `between <A> and <B>` is a door's or a cased
     * opening's alone: `window.parse()` refuses it, so `window-stmt` does not offer it.
     */
    ["opening-edge-pos", `"on" rws edge-ref`],
    ["edge-ref", `ref "." ( ${litAlt(EDGE_WORDS)} )`],
    ["opening-between-pos", `"between" rws ref rws "and" rws ref ( rws "at" ws attach-pos )?`],
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
    /*
     * ADR 0028 §5's datum positions join it: `axis <label>` (a number or a letter label) and
     * `<expr> from start|end|<room>.<edge>`, both of which `parseAttachPos` reads.
     */
    [
      "attach-pos",
      `"center" | "axis" rws axis-label | "corner" rws ref | attach-expr ws "%" | attach-expr ( rws "from" rws ref )?`,
    ],
    ["axis-label", `[0-9]+ | ident`],
    /*
     * Two placement shapes, absolute and room-relative, sharing one set of clauses in any
     * order. The trailing `in <roomId>` is one of them: after the room-relative form, which
     * already named the room, it is a repeat the parser reports (`E_DUP_CLAUSE`), as any
     * other repeat. An `id=` may follow the category word.
     */
    ["furniture-stmt", `"furniture" rws id-opt ident rws id-opt ( furn-placed | furn-roomed )`],
    ["furn-placed", `( furn-at | furn-against | furn-against-edge ) ${anyOrder("furniture-clause")}`],
    ["furn-roomed", `"in" rws ref rws in-place ${anyOrder("furniture-clause")}`],
    ["furn-at", `"at" ws point`],
    // `segment`, `offset`, `side` — read once each, in this order (a fixed run of
    // `if`s, like every other element's clause list).
    [
      "furn-against",
      `"against" rws "wall" rws ref ( ws "segment" ws segment-sel )? ( ws "offset" ws expr )? ( ws "side" rws ident )?`,
    ],
    // `segment <n>`, or a selector aliasing it (PS3.5): a compass word or `containing <room>.<edge>`.
    ["segment-sel", `${litAlt(SEGMENT_COMPASS_WORDS)} | "containing" rws edge-ref | expr`],
    // `against <room>.<edge> [offset <mm>]` (ADR 0029 §2): the room edge the piece backs onto.
    ["furn-against-edge", `"against" rws edge-ref ( ws "offset" ws expr )?`],
    ["in-place", `"centered" | "anchor" rws anchor ( ws "flush" )? ( ws "inset" ws expr )?`],
    ["anchor", anchor],
    // The clauses after the placement, any order (card CO-1). `rotate` and `facing` may now both
    // be derived: the parser reads the pair so that resolve can refuse it (`E_FACING_CONFLICT`,
    // ADR 0029 §3), a catalogued code, and an order-free run cannot leave one out without the other.
    [
      "furniture-clause",
      `"size" ws dims | "label" ws string | "rotate" ws expr | "facing" rws ref | "mirror" | "clear" rws ( "front" | "sides" ) ws expr | "in" rws ref`,
    ],
    [
      "dim-stmt",
      `"dim" ( ( rws dim-ref )? ws point ws "->" ws point | rws dim-curve ) ( ws "offset" ws expr )? ( ws "text" ws string )?`,
    ],
    ["dim-curve", `"radius" rws ref ( rws "segment" ws segment-sel )? | "diameter" rws ref`],
    ["dim-ref", `"faces" | "clear"`],
    ["column-stmt", `"column" rws id-opt "at" ws point ws "size" ws dims`],
    [
      "stair-stmt",
      `"stair" rws id-opt ( "at" ws point ws "size" ws dims ws "dir" rws vert-dir ( ws "width" ws expr )? | "dir" rws vert-dir ws "width" ws expr ws "{" ws stair-piece ( ws stair-piece )+ ws "}" )`,
    ],
    [
      "stair-piece",
      `"flight" rws "at" ws point ws "size" ws dims | "landing" rws "at" ws point ws "size" ws dims ( ws "winders" ws expr )?`,
    ],
    ["elevator-stmt", `"elevator" rws id-opt "at" ws point ws "size" ws dims`],
    ["escalator-stmt", `"escalator" rws id-opt "at" ws point ws "size" ws dims ws "dir" rws vert-dir`],
    ["vert-dir", `"up" | "down"`],
    /*
     * `roof` takes NO `id=`: the shape word leads directly, the way `room polygon` /
     * `room circle` and a door KIND do. The two spellings are alternatives, never a
     * sequence — `roof overhang 600 polygon (0,0) …` is not in the language — so this is
     * a split production and not a pair of optional tails, for exactly the reason
     * the opening placements are: a decoder offered both would emit the one output shape this
     * file exists to make impossible. The ring is `point point point ( ws point )*`
     * rather than `( ws point ){3,}`, because three is a MINIMUM the parser enforces.
     */
    ["roof-stmt", `"roof" rws ( roof-overhang | roof-polygon )`],
    ["roof-overhang", `"overhang" ws expr ( rws "wall" rws ref )?`],
    ["roof-polygon", `"polygon" ws point ws point ws point ( ws point )*`],
    /*
     * `void` (plan decision CR-D8): the rectangle or a ring of four points or more, each with
     * its own `rail` words — side words on the rectangle, `all|none` or 0-based edge numbers
     * (`digits`, a whole number) on the ring — so neither spelling derives the other's words.
     */
    ["void-stmt", `"void" rws id-opt ( void-rect | void-poly )`],
    ["void-rect", `"at" ws point ws "size" ws dims ( ws "rail" rws rail-edge ( ( ws "," ws | rws ) rail-edge )* )?`],
    [
      "void-poly",
      `"polygon" ws point ws point ws point ws point ( ws point )* ( ws "rail" rws void-edge ( ( ws "," ws | rws ) void-edge )* )?`,
    ],
    ["void-edge", `${litAlt(RAIL_EDGES.filter((w) => !(RAIL_SIDES as readonly string[]).includes(w)))} | digits`],
    /*
     * `outdoor` mirrors `room`'s shape exactly — the KIND word after any `id=` (an `id=` may
     * follow it too), then one of two mutually-exclusive spellings, then the clauses in any
     * order, the rectangle's `size` once among them. Split, not one shared tail, for the
     * same reason `room-rect | room-poly` is: a decoder offered `size` after a ring would emit
     * the one shape this file exists to make impossible. Three vertices minimum on the ring,
     * the parser's own floor.
     *
     * `rail` renders as `rail-edge ( rws rail-edge )*` because the clause really is
     * repeatable, and the comma spelling is a separate arm rather than an optional comma
     * inside the repeat — `rail top,` with nothing after it is not in the language.
     */
    [
      "outdoor-stmt",
      `"outdoor" rws id-opt outdoor-kind rws id-opt ( "at" ws point ${anyOrder("outdoor-clause", "outdoor-size")} | outdoor-poly ${anyOrder("outdoor-clause")} )`,
    ],
    ["outdoor-kind", litAlt(OUTDOOR_KINDS)],
    ["outdoor-size", `"size" ws dims`],
    ["outdoor-clause", `outdoor-label | outdoor-rail`],
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
    // `section <name|int> (x,y)->(x,y) look <compass>` (RM6.1): a PLAN statement, never a block one
    // (`E_SECTION_SCOPE` inside any block), so it is no `element` alternative.
    // The name is an identifier or a positive whole number, as the parser takes it (no sign, no
    // fraction, no unit).
    ["section-stmt", `"section" rws ( ident | [1-9] [0-9]* ) ws point ws "->" ws point ws "look" rws compass-dir`],
    // `walls from rooms` (ADR 0028 §3). The body holds `except`, `open between` and
    // `between … thickness` clauses, the closed list the parser accepts.
    [
      "walls-stmt",
      `"walls" rws "from" rws "rooms" rws "exterior" rws expr rws "partition" rws expr ( ws wall-status )? ( ws "{" ws ( walls-clause ws )* "}" )?`,
    ],
    [
      "walls-clause",
      `"except" rws ident ( rws ident )* | "open" rws id-opt "between" rws ident rws "and" rws ident ( rws "width" rws expr )? | "between" rws ident rws "and" rws ident rws "thickness" rws expr`,
    ],

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
    // A numeric literal may carry an optional unit suffix, metric (mm|cm|m) or
    // imperial (ft|in|<ft>ft<in>in), folded to millimetres by the lexer; the value
    // is scaled, the token shape is otherwise a number. Imperial forms the lexer
    // refuses (`12'6"`, `1/2in`, `12ft6`) are not generated. The integer part is optional (`.5` lexes as a number —
    // `c === "." && isDigit(peek(1))` in `lexImpl`) but the fraction's digits are not,
    // so `5.` is a lex error in both.
    ["number", `( digits frac? | frac ) unit?`],
    ["digits", `[0-9]+`],
    ["frac", `"." digits`],
    ["unit", `"mm" | "cm" | "m" | "ft" ( ( digits frac? | frac ) "in" )? | "in"`],
    ["ident", `[a-zA-Z_] [a-zA-Z0-9_]*`],
    // A REFERENCE to an element, which may be namespaced by a `place`d instance
    // (`west.perimeter`). Declarations keep the undotted `ident` — a dotted name in a
    // declaration position is `E_DOTTED_DECL`, and the grammar must not invite one. `axis.3` is
    // the one dotted word a digit continues (`lexImpl`): a positioning axis read by its label.
    ["ref", `"axis." digits | ident ( "." ident )*`],
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
