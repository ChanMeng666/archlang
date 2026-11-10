/**
 * Error catalogue: the limits family. Budgets and caps: the step, element, drawing, range, input
 * and diagnostic limits, the hosted rate limit, and the range a lint ruleset's numbers are held to
 * (the import and keep caps live with their families).
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const LIMITS_ENTRIES = defineEntries({
  E_DIAGNOSTIC_LIMIT: e(
    "More than 500 diagnostics; further diagnostics were not collected.",
    "One compile reports at most 500 diagnostics. Past that the lexer and parser stop collecting and every later stage's are dropped, except a budget or cap that stopped the work (`E_STEP_LIMIT`, `E_DRAWING_LIMIT`, `E_ELEMENT_LIMIT` and the other `*_LIMIT` codes), which are always kept, and this one closes the list, at the byte just past the 500th diagnostic kept. A page of stray characters, thousands of repeated declarations or one bad statement inside a long loop would otherwise cost more to report than the plan costs to compile. It is the error form, raised when any diagnostic, kept or dropped, is an error, so the plan draws nothing; when every one is a warning the limit is `W_DIAGNOSTIC_LIMIT` instead.",
    "Fix the first problems reported (they usually share one cause: a pasted binary file, a block that never closes, one bad line inside a loop) and compile again.",
    "for i in 0..600 { let x = 1 / 0 }   # error: 500 E_DIV_ZERO, then E_DIAGNOSTIC_LIMIT",
  ),
  E_ELEMENT_LIMIT: e(
    "The plan expands to too many elements.",
    "One resolution (the plan, or one storey) expanded past the element cap (5,000), usually a `for` over a huge range or a `while` whose body creates elements but never changes its condition. Expansion stops at the statement that crossed the cap; the elements before it are kept.",
    "Shrink the range, or make the loop terminate; split a genuinely huge site into storeys or separate plans.",
    "for i in 0..6000 { column at (i,0) size 1x1 }   # error: more than 5,000 elements",
  ),
  E_DRAWING_LIMIT: e(
    "The drawing is larger than any plan may draw.",
    "Before anything is drawn, `compile()` estimates the drawing primitives every element will emit (an upper bound per kind: a room 3, a door 5, a run one or two lines per tread, a fixture its own symbol), plus one per point of its outline and what `dims auto`, the axes and the margin tables add, summed over every storey because a multi-storey plan holds all its pages at once. Past 300,000 the drawing would take hundreds of megabytes, so the plan is refused, at the element whose estimate crosses the budget. Usually a loop that repeats long runs or large fixtures far more often than meant. `describe` and `lint` draw nothing and are not held by it.",
    "Draw fewer or shorter runs, shrink the loop, or split the building into separate plans.",
    "for i in 0..200 { escalator at (0, i * 2000) size 300000x1200 dir up }   # error: 429,800 units",
  ),
  E_INPUT_TOO_LARGE: e(
    "The source is larger than this host accepts.",
    "A host with a per-request CPU ceiling (the hosted MCP server) refuses a source above its byte cap before compiling it. `compile()` itself has no size cap: its budgets are counts, and every input it is given returns a diagnostic.",
    "Compile it locally, where there is no cap: `npx -y @chanmeng666/archlang compile plan.arch`, or the stdio MCP server `npx -y @chanmeng666/archlang-mcp`. Or send a smaller plan.",
    "tools/call compile { source: <more bytes than the host's cap> }   # error on the hosted MCP server, before any compile work",
  ),
  E_OUT_OF_RANGE: e(
    "A coordinate, length or drawing setting is outside the modelling range.",
    "Each element's bounds (the points it reports for the page: a rectangle's corners, a ring's vertices, a wall's faces) and the coordinates and lengths those do not carry (an opening's centre and width, a wall's thickness and arc radii, a dimension's offset, a room's label anchor), every `axes` position, every `site` boundary vertex and the `grid` must lie within ±33,554,432 mm (2^25 mm, about 33.5 km), the range inside which the geometry's integer predicates are exact. A finite value past it is not a building. The settings that scale a drawn length are held too: a wall's hatch `scale` and a theme `lineWeight` by what they DRAW on this drawing (the pattern tile and the heaviest pen, which grow with the drawing's size, must stay inside the range, so a coarse `scale 10` on a house is fine), a `north` bearing or hatch `angle` within ±33,554,432 degrees, and on a `paper` plan a `scale` denominator small enough that the sheet stays inside the range. An element is checked once its `place` frames and relational placement are applied; it is reported once (its other diagnostics are withdrawn, and an opening in a dropped wall goes with it) and dropped from the plan, so nothing downstream draws or measures it.",
    "Use a realistic dimension. A plan is measured in millimetres (a 30 m wall is `30000`, or `30m`), so a value in the millions is usually a unit slip; a site larger than about 33 km is several plans, not one.",
    "stair id=s at (0,0) size 1000000000000x3000 dir up   # error: a 1e12 mm flight",
  ),
  E_RANGE_LIMIT: e(
    "Range too large.",
    "A `lo..hi` range would expand to more elements than the safety cap allows.",
    "Use a smaller range, or restructure to avoid materializing it.",
    "for i in 0..1000000 { … }   # error: range too large",
  ),
  E_RATE_LIMITED: e(
    "This address sent more requests than the host answers per minute.",
    "The hosted MCP server pays for every request it computes, so it answers each address at most a fixed number of times a minute and refuses the rest before compiling anything. It is a property of the host, not of the plan: the same source compiles locally with no limit.",
    "Wait a minute and retry, or compile locally, where there is no limit: `npx -y @chanmeng666/archlang compile plan.arch`, or the stdio MCP server `npx -y @chanmeng666/archlang-mcp`.",
    "tools/call compile { … }   # one call past the per-minute limit from one address: error on the hosted MCP server",
  ),
  E_RULESET_VALUE: e(
    "A lint ruleset value is not a finite number within the modelling range.",
    '`lint(source, { ruleset })` (and `lintWithCoverage`) lays the caller\'s overrides over the defaults and the named profile, then checks every numeric field of the result before the plan is resolved: each must hold a finite number within ±33,554,432 (2^25, the modelling range `E_OUT_OF_RANGE` holds coordinates to), whatever its unit (mm, m² or a ratio). `NaN`, `Infinity`, a value like `1e300`, or something that is not a number at all (`undefined`, which `{ doorwayLandingMm: undefined }` lays over the default, a string such as `"500"`, an object, a boolean) would otherwise reach the rules and their spatial grids. The per-use tables (`minRoomAreaByUseM2`, `minRoomShortSideByUseMm`, `minPathClearWidthByUseMm`) are checked entry by entry, each named by a dotted key (`minRoomAreaByUseM2.bedroom`); an entry left `undefined` is no entry. `null`, where a field allows it (a rule turned off, a use exempted), passes. One error per bad value, naming the key and what the value is (not a number, not finite, beyond the range, `undefined`, a string…) but never the value itself, in the code-unit order of the keys, at byte 0, since the fault is the option and not the source; no rule runs, so the coverage report is `null`. The CLI and the MCP servers pass only named profiles, so only a library caller can raise it.',
    "Pass a finite number within the range, or leave the key out to keep its default; `null` turns off a rule whose field allows it.",
    "lint(source, { ruleset: { doorwayLandingMm: Number.NaN } })   # error: `doorwayLandingMm` is not a number, and no rule runs",
  ),
  E_STEP_LIMIT: e(
    "Evaluation did more work than any plan needs.",
    "One counter measures the work the whole resolution does (every storey, component instance and import): an expression evaluated, a statement run, a loop iteration, a value or character produced (charged before it is built), a binding copied, a diagnostic raised, a pair of a polygon ring's edges tested for a crossing, a few edges read when two polygon or round rooms have overlapping boxes. Past 5,000,000 steps evaluation stops at the statement that crossed the budget and the plan draws nothing. Each loop's own caps hold (`E_RANGE_LIMIT`, `E_WHILE_LIMIT`, `E_ELEMENT_LIMIT`), but loops nested in loops, recursion that calls itself twice and a string that doubles multiply inside them. A ring's edge pairs grow with the square of its vertices, so one ring of about 3,000 vertices spends the budget with no loop in the plan, and so do many polygon or round rooms whose boxes overlap and whose outlines run to hundreds of vertices.",
    "Remove the inner loop or the doubling, compute the value directly, draw long outlines with fewer vertices, keep the boxes of polygon rooms apart, or split the plan.",
    "for i in 0..100000 { for j in 0..1000 { let x = i } }   # error: 100 million iterations",
  ),
  E_WHILE_LIMIT: e(
    "`while` exceeded its iteration cap.",
    "A `while` ran more times than the safety cap allows (usually a condition that never becomes false).",
    "Ensure the loop body updates a binding so the condition eventually fails.",
    "let i = 0\nwhile i < 1 { let y = i }   # error: i never changes",
  ),
  W_DIAGNOSTIC_LIMIT: w(
    "More than 500 diagnostics, all warnings; further diagnostics were not collected.",
    "One compile reports at most 500 diagnostics (`E_DIAGNOSTIC_LIMIT` explains the cap). When none of them is an error, neither those kept nor those dropped, the limit is this warning instead: the plan still draws, lints and describes, and only the report is cut short.",
    "Fix the first warnings reported (a flood of them usually has one cause, such as a line repeated hundreds of times) and compile again.",
    'room at (0,0) size 3000x3000\naccTitle "a"\naccTitle "a"   # … 600 such lines: 500 W_DUP_ACC_METADATA, then W_DIAGNOSTIC_LIMIT; the room still draws',
  ),
});
