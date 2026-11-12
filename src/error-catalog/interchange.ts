/**
 * Error catalogue: the interchange family. Plan JSON and the source-rewriting tools around it:
 * `impact --set`/`--lock` and `--expected-hash`.
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e } from "./entry.js";

export const INTERCHANGE_ENTRIES = defineEntries({
  E_SET_OVERRIDE: e(
    "`archlang impact --set NAME=value` cannot override that name with that value.",
    "`--set NAME=value` replaces the expression of the root plan's one top-level `let NAME = …` with a numeric literal and compares the plan before and after. It is refused, and nothing is compared, when NAME is not exactly one top-level `let` (absent, bound only inside a block, a component or a `level`, a value-function `let f(x) = …`, declared twice, or reassigned with `NAME = …`), or when the value is not one number as the language writes it (`4500`, `4.5m`, `45cm`, `-200`). Raised by `applyLetOverride()`, never by `compile()`.",
    "Name a top-level `let` the message lists, give a plain number, or compare two whole files with `archlang impact plan.arch --against old.arch`.",
    "let W = 4000\nroom id=a at (0,0) size W x 3000   # archlang impact plan.arch --set D=4500: error, D is not a top-level let",
  ),
  E_JSON_SCHEMA: e(
    "Plan JSON does not match the schema.",
    "A value passed to `planFromJson` has the wrong shape or type for its JSON path (e.g. a room missing a numeric `width`, a non-array `rooms`), or it uses a construct the JSON form cannot represent — scripting (`let`/`for`/`if`/`component`) and `import` are intentionally not supported.",
    "Fix the value at the reported JSON path (the message names it, e.g. `/rooms/0/width`); express geometry as concrete numbers, and author scripting/imports in `.arch` source instead.",
    '{ "rooms": [ { "x": 0, "y": 0, "width": "big", "height": 3000 } ] }   # error at /rooms/0/width: expected a number',
  ),
  E_JSON_KIND: e(
    "Unknown element kind in plan JSON.",
    "An element in the JSON names a `kind` (or lives in an array) the builder does not recognize — e.g. an opening whose `kind` is not `door`, `window`, or `opening`.",
    "Use one of the supported kinds: opening `kind` must be `door` | `window` | `opening`.",
    '{ "openings": [ { "kind": "portal", "width": 900 } ] }   # error at /openings/0/kind: unknown kind "portal"',
  ),
  E_JSON_DERIVED_IN_INSTANCE: e(
    "Plan JSON cannot carry a `place`d component that derives its walls in this plan.",
    "Plan JSON carries `walls from rooms` as the statement, never the walls it derives (ADR 0028 §3). A placed component's statement goes in the payload's `components` record, one resolved body per component with one level of `instances`. Three plans do not fit that record, and `planToJson` (`compile -f json`) refuses them, naming the instance, rather than drop the walls: (a) the plan nests a `place`; (b) two instances of one component resolve to different bodies (different arguments); (c) the component comes in through an `import`.",
    "Keep the plan in `.arch` source; or flatten the nesting, give each differing instance its own component, or copy the imported component into the file; or write that component's walls by hand.",
    'component inner() { room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100 }\ncomponent outer() { place inner() as i at (0,0) }\nplace outer() as o at (0,0)   # compile -f json: error, instance "o.i" (nested)',
  ),
  E_JSON_MIRROR: e(
    "Plan JSON door, dimension or flattened instance's piece is `mirror: true`, which `.arch` source cannot state.",
    "`planToJson` reports `mirror: true` on EVERY door and dimension inside a reflecting `place` (`mirror x|y`, or a nested composition that reflects): the flag records the FRAME's reflection. A piece of furniture has a `mirror` clause, so its flag is printed back as that clause, unless its dotted id says the document flattened an instance: source cannot declare that id, and only the `place` states the reflection. A door or a dimension has no clause, so a `place` frame is the only thing that can reflect one, and converting that payload back to source would lose the reflection (a sliding door would take the other track, a zero-offset dimension's number would read on the other side). It is refused instead.",
    "Keep the instance in `.arch` source (the `place … mirror x|y` that produced it), or drop `mirror` from the element if the unreflected drawing is what you want.",
    '{ "openings": [ { "kind": "door", "x": 0, "y": 0, "width": 900, "mirror": true } ] }   # error at /openings/0/mirror',
  ),
  E_LOCKED_ELEMENT_CHANGED: e(
    "An element `archlang impact --lock` names changed between the two versions.",
    "`--lock <id,…>` names elements that must stay as they were. An element is changed when, on the lowest storey, it moved (an opening also when it slid along an unchanged wall), resized, was re-hosted (another wall, relation or joined spaces), was re-thickened, changed its door swing or any other resolved field, vanished or appeared. A relabel is not a change. Each violation carries the element's span on both sides. Raised by `impact()`, never by `compile()`.",
    "Put the locked element back as it was in the older file, or drop it from `--lock` if the change is intended.",
    "window id=w1 on s at 1200 width 1200   # was `at 1100`: archlang impact new.arch --against old.arch --lock w1: error, moved 100 mm",
  ),
  E_LOCK_UNNAMED: e(
    "`archlang impact --lock` names an element whose id was not written, or no element at all.",
    "A lock names an element by the `id=` its author wrote. An assigned id (`room_3`, `window_2`, or the internal name of a wall `walls from rooms` derived) shifts when a statement is inserted ahead of it, so a lock on it could follow another element; it is refused. So is a name no element of either version carries, or one that stands only above the lowest storey, which `impact` does not compare yet. Raised by `impact()`, never by `compile()`.",
    "Write `id=<name>` on the element in both versions and lock that name.",
    "window on s at 1200 width 1200   # assigned window_1: archlang impact new.arch --against old.arch --lock window_1: error, write id= first",
  ),
  E_STALE_SOURCE: e(
    "The file is not the revision `--expected-hash` names.",
    "A command that rewrites a `.arch` file (`fix`, `finish`, `repair`, `fmt --write`, `reroll --write`) was given `--expected-hash <sha256>`, and the SHA-256 of the input file's bytes (a BOM and CRLF line ends are part of them) is another value: someone changed the file after you read it. The command checks the hash before it computes anything and refuses then; it reads the file again just before it writes and refuses if the bytes changed while it ran. Nothing is written either way. The second check narrows the race with another writer; it is not a lock. Raised by the CLI (exit 4), never by `compile()`.",
    "Re-read the file, re-apply your edit to what is there now, and pass the new hash: the `source_hash` a `--json` run of the command reports (or the `written_hash` of your own last write).",
    "archlang fix plan.arch --expected-hash 9f86d081884c…   # error: plan.arch changed since that hash was taken, exit 4",
  ),
});
