/**
 * Error catalogue: the language family. The language itself: lexing, parsing, names, components,
 * the evaluator and plan-level metadata.
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";
import { pure } from "../pure.js";

export const LANGUAGE_ENTRIES = defineEntries({
  E_ACC_PLACEMENT: e(
    "`accTitle`/`accDescr` used outside the plan level.",
    "An `accTitle` or `accDescr` accessibility-metadata statement appeared inside a component or a control-flow block. They describe the whole plan, so they are only legal as direct plan-level statements.",
    "Move the `accTitle`/`accDescr` line up to the plan body, alongside `units`/`north`.",
    'component c() { accDescr "x" }   # error: only allowed at plan level',
  ),
  E_ARGCOUNT: e(
    "Component called with the wrong number of arguments.",
    "A component instance supplies more or fewer arguments than the component declares parameters.",
    "Pass exactly one argument per declared parameter.",
    "component bed(x, y) { … }\nbed(300)        # error: expects 2 arguments",
  ),
  E_ARITY: e(
    "Built-in function called with the wrong number of arguments.",
    "A built-in (e.g. abs, sqrt, len) was called with the wrong argument count.",
    "Check the function's arity; most built-ins take one argument.",
    "let x = abs(1, 2)   # error: abs expects 1 argument",
  ),
  E_ASSIGN_UNDEF: e(
    "Assignment to an undeclared name.",
    "`NAME = value` was used for a name never introduced with `let`.",
    "Declare it first with `let`, or fix a typo in the name.",
    "x = 5           # error: declare with `let x = …` first",
  ),
  E_CALL_DEPTH: e(
    "Value-function call stack too deep.",
    "A value-function recurses (directly or mutually) beyond the call-depth limit, or the evaluation of one expression nests deeper than the evaluator's own bound (a deep recursion whose body is itself deeply nested).",
    "Make the recursion terminate, or rewrite it iteratively with a bounded `while`.",
    "let f(n) = f(n + 1)   # error: never terminates",
  ),
  E_DIV_ZERO: e(
    "Division or modulo by zero.",
    "An expression divides (or takes a remainder) by a value that evaluates to zero.",
    "Guard the divisor, or use a non-zero value.",
    "let x = 10 / 0   # error",
  ),
  E_DOMAIN: e(
    "Math domain error.",
    "A built-in received an out-of-domain argument (e.g. `sqrt` of a negative number).",
    "Pass a value within the function's domain.",
    "let x = sqrt(-1)   # error",
  ),
  E_DUP_ID: e(
    "Duplicate element id.",
    "Two elements declare the same `id=…`; ids must be unique across the plan.",
    "Rename one of them, or drop the explicit id to auto-generate a unique one.",
    'room id=a at (0,0) size 1x1\nroom id=a at (1,0) size 1x1   # error: duplicate id "a"',
  ),
  E_DUP_INSTANCE: e(
    "Duplicate `place … as <name>` instance name.",
    "Two `place` statements claim the same instance name. The name is the id NAMESPACE for everything inside the instance, so reusing it would silently merge two instances' ids.",
    "Give each instance its own name (`as west` / `as east`).",
    'place wing() as west at (0,0)\nplace wing() as west at (9000,0)   # error: instance "west" already used',
  ),
  E_DOTTED_DECL: e(
    "A dotted name cannot be declared.",
    "A dotted name like `west.main` addresses an element INSIDE a `place`d instance. The namespace belongs to the `place`, so a dotted name is only ever a reference — it can never be declared with `id=`, `let`, `as`, or `for`.",
    "Declare the short name and address it from outside as `<instance>.<name>`.",
    "room id=main at (0,0) size 3000x3000   # then, in the plan: furniture bed in west.main centered",
  ),
  E_IMPERIAL_FORM: e(
    "An imperial length is written in a form the language does not read.",
    "Imperial lengths are read in three forms only: `12ft`, `6in` and `12ft6in` (feet before inches, each part a plain decimal such as `0.5in`), converted exactly (1 in = 25.4 mm) and rounded half away from zero to a whole millimetre. The feet-and-inch marks are refused because `\"` opens a string and `'` is no token (`12'6\"`, `12'`, `6\"`); a glued fraction because `/` is division (`1/2in`); and inches before feet or a bare trailing number (`6in12ft`, `12ft6`). The literal is replaced by 0 so the rest of the plan still reads and reports. Output stays in millimetres.",
    'Write `12ft6in` for 12\'6", `0.5in` for 1/2", and put feet before inches.',
    "room id=r at (0,0) size 12'6\"x10ft   # error: write 12ft6inx10ft",
  ),
  E_INDEX: e(
    "Array index out of range.",
    "`arr[i]` used an index outside `0 .. len(arr) - 1`.",
    "Clamp or check the index against `len(arr)`.",
    "let a = [1, 2]\nlet x = a[5]   # error",
  ),
  E_INSTANCE_NO_TRANSFORM: e(
    "A plugin element inside a `place`d component has no `transform()`.",
    "A `place` carries every element of its component from the component's own frame into plan coordinates, and each element kind supplies that action as `ElementDef.transform`. A third-party element kind registered through `compile(src, { plugins })` without one cannot be turned, mirrored or moved, so the instance's copy is dropped from the drawing (never drawn at its local coordinates) and this is reported once per instance and kind, at the `place` statement. A plugin that REPLACES a built-in kind without its own `transform()` inherits the built-in's; when that inherited action cannot read the plugin's resolved shape (its `resolve` returns a different shape from the built-in's), the element is refused the same way.",
    "Give the plugin's `ElementDef` a `transform(el, t)` that maps its geometry with the `TransformCtx` it is handed (`t.point`, `t.rect`, `t.side`, `t.id`, …) — or write the element at plan level instead of inside the component.",
    "component c() { gazebo at (0,0) }   # `gazebo` is a plugin kind with no transform()\nplace c() as g at (5000,0)   # error: cannot be placed",
  ),
  E_NON_FINITE: e(
    "A number is too large to be finite.",
    "A numeric literal, the result of an arithmetic operation (`+ - * / %`), or a quantity the resolver derives from finite dimensions (an element's extent, a room's area, the plan's total area) is beyond what a floating-point number can hold, so it would be infinite. The check is per operation: an overflowing intermediate is refused even if a later `min()` would have clamped it. A literal or arithmetic result is replaced by 0 so the rest of the plan still resolves and reports; an element whose derived quantity overflows is diagnosed at its element and dropped from the plan, so nothing downstream measures it.",
    "Use a realistic dimension. A plan is measured in millimetres, and a value above about 1e300 is never a building.",
    /* @__PURE__ */ pure(() => `let k = 1${"0".repeat(60)}\nlet x = k * k * k * k * k * k   # error: 1e360 overflows`),
  ),
  E_PARSE: e(
    "The source could not be read: its SHAPE is wrong.",
    "The lexer or the parser could not make a statement out of the bytes at this span — a missing or misspelled keyword, a value where a keyword belongs, an unterminated string, an unbalanced brace, clauses written in the wrong order, or blocks and expressions nested past the parser's limit (256 levels — far beyond any real plan; the deeper block is skipped, not read). It is the one code that says nothing about what the plan MEANS: resolution never ran here, so no measurement, no geometry and no soundness rule had a chance to speak.",
    "Read the message: it names what was expected and what was found, at a byte span. Compare the statement against `archlang spec`'s one line for that keyword — clause ORDER is part of the grammar, not a suggestion. Unlike every other code in this catalog, there is no machine-applicable fix to apply, because the compiler has no reading of the text to correct.",
    "door on w1 at 40% width 900 wall w1   # error: `wall` pairs with the `at (x,y)` form only",
  ),
  E_RECURSION: e(
    "Component recursion too deep.",
    "Component instantiation nested beyond the depth limit (usually unbounded self-instantiation).",
    "Add a base case so the recursion terminates.",
    "component r(n) { r(n) }   # error: never terminates",
  ),
  E_REDEF: e(
    "Name already defined in this scope.",
    "A `let` re-declares a name already bound in the same scope.",
    "Rename one binding, or use `NAME = …` to reassign instead of redeclaring.",
    "let x = 1\nlet x = 2   # error: redefinition",
  ),
  E_TYPE: e(
    "Type mismatch.",
    "A value was used where another type was required (e.g. a string where a number is expected, or a non-array in `for`).",
    "Convert or supply the expected type.",
    'room at (0,0) size "big" x 10   # error: size needs numbers',
  ),
  E_UNKNOWN_COMPONENT: e(
    "Unknown component.",
    "An instance calls a component name that is not defined or imported.",
    "Define the component, import it, or fix the name (see the suggestion hint).",
    "sofa(0, 0)   # error if no `component sofa` is in scope",
  ),
  E_UNKNOWN_FN: e(
    "Unknown function.",
    "A call uses a name that is neither a built-in nor a value-function in scope.",
    "Define it with `let f(…) = …`, or fix the name.",
    "let x = frobnicate(2)   # error",
  ),
  E_UNKNOWN_REF: e(
    "Unknown reference.",
    "An expression references a name that is not bound in scope, or a room-edge datum (`hall.top`) or an opening's `between` names a room the plan (or, inside a `place`d component, the component) does not have, or `axis.3` names a positioning axis the plan does not declare. A placed component reads no axis: its coordinates are its own frame's.",
    "Declare it with `let`, pass it as a parameter, or fix the typo (for a datum, the room id before the last dot; for an axis, the label the plan's `axes` give it).",
    "let x = y + 1   # error if `y` is undefined",
  ),
  W_DUP_ACC_METADATA: w(
    "Duplicate `accTitle`/`accDescr`.",
    "A plan declares `accTitle` (or `accDescr`) more than once. Only one of each applies, so the last value silently wins.",
    "Keep a single `accTitle` and a single `accDescr`; delete the extra line(s).",
    'accTitle "A"\naccTitle "B"   # warning: "A" is discarded',
  ),
  W_EMPTY_PLAN: w(
    "Empty plan.",
    "The plan resolved to no drawable elements.",
    "Add at least one element (wall, room, …).",
    'plan "Empty" { units mm }   # warning',
  ),
  W_WHILE_DEPRECATED: w(
    "`while` is deprecated and will be removed in a future major version.",
    "`while` plus a reassignment to make it terminate is the one construct in ArchLang's expand-time language that breaks referential transparency: a `let` binding reassigned later is no longer a value that can be substituted, which every equational tool (LSP rename, `archlang fix`'s rewrite-in-your-form, the planned re-roll refactor) relies on. `for x in a..b` covers every counted loop `while` is used for in practice.",
    "Rewrite the loop as `for I in A..B { … }`. `compile()` never offers this fix — only `archlang fix` proves it, against THIS file's own expansion: a shape that merely LOOKS canonical, but whose body calls a component that reads or writes `I`, that never actually ran (a library compiled standalone, a dead `if` branch), or that already caps out at `while`'s 10,000-iteration limit, is left as a warning with no fix. A proven fix at plan level is `machine-applicable`; one inside a `component` is `maybe-incorrect` (needs `archlang fix --unsafe`) — the proof only covers how THIS file instantiates it, and an importer may call it differently. Anything the fix declines needs a hand rewrite.",
    "let i = 0\nwhile i < 5 {\n  room at (0, i * 3000) size 3000x3000\n  i = i + 1\n}   # warning: deprecated; rewrites to `for i in 0..5 { … }`",
  ),
  W_REASSIGN_DEPRECATED: w(
    "Reassignment (`NAME = expr`) is deprecated and will be removed in a future major version.",
    "Reassigning an existing `let` binding exists only to make a `while` loop progress. Outside that role it is the same referential-transparency break `while` is deprecated for: a name bound with `let` can no longer be trusted to keep its first value, which breaks the equational tools (rename, `archlang fix`, the planned re-roll refactor) that treat a `let` as a substitutable value. A reassignment LEXICALLY INSIDE a `while` body (at any depth, including inside a nested `if`/`for`/`zone`) does not also raise this — every reassignment there is already covered by that loop's own `W_WHILE_DEPRECATED`.",
    "Bind a new name with `let` instead of reassigning it, or express the surrounding loop as `for NAME in A..B { … }` — `archlang fix` offers this on `W_WHILE_DEPRECATED` for the canonical shape, once proved against this file's own expansion (component sites need `--unsafe`).",
    "let total = 0\ntotal = total + 100   # warning: deprecated reassignment; bind a new name instead",
  ),
  W_LENGTH_IN_METRES: w(
    "A length reads as metres where millimetres are the unit.",
    "Lengths are millimetres. A rectangle room whose `size` has both sides under 100 mm (`size 4x3`), or a wall thickness under 10 mm (`thickness 0.2`), was almost certainly written in metres. The plan draws the value as written.",
    "Write the length in millimetres; the hint gives the clause times 1000.",
    "room at (0,0) size 4x3   # warning: read as 4 mm x 3 mm; write `size 4000x3000`",
  ),
  W_GRID_SNAPPED: w(
    "`grid` moved a written size or door position.",
    "`grid <g>` rounds a written value to a multiple of `g` (under `grid 100`, `size 2750x7000` is drawn 2800 deep). Reported for a rectangle room or furniture `size`, a wall thickness (`walls from rooms` too) and a door's `at (x,y)`, with the value as written and as drawn. The snapping is unchanged. Informational: `validate` ranks it last for `next` (tier `info`).",
    "Write a multiple of the grid, or set a finer `grid`.",
    "grid 100\nroom at (0,0) size 2750x3000   # warning: size 2750 x 3000 was snapped to 2800 x 3000",
  ),
  W_SET_VALUE_WORD: w(
    "A bare word in `set <kind>(…)` was taken as text and does nothing.",
    'A bare word in a `set` rule is read as text, never as the value of a name, so `set door(width: W)` sets the text "W" and does nothing; so does a word the key does not read (`set door(swing: inward)`). `set door(…)` reads a word only for `hinge` and `swing`. An error at 2.0.',
    "Write the value on the element, or a word the key reads.",
    'let W = 900\nset door(width: W)   # warning: takes `W` as the text "W"; the rule does nothing',
  ),
});
