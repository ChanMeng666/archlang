/**
 * The ArchLang diagnostic catalog: every `E_*` / `W_*` code with its cause, fix,
 * and a tiny example. One source for `arch explain <CODE>` and the generated
 * `docs/error-codes.md` (see `scripts/gen-error-codes.ts`). The codes themselves
 * are raised across `src/` (validate/resolve/import/builtins/elements); this file
 * documents them.
 */

export interface CatalogEntry {
  code: string;
  severity: "error" | "warning";
  /** One-line summary. */
  message: string;
  /** Why the compiler raises it. */
  cause: string;
  /** How to resolve it. */
  fix: string;
  /** A minimal snippet illustrating the cause (or the fix). */
  example: string;
}

const E = (code: string, message: string, cause: string, fix: string, example: string): CatalogEntry => ({
  code,
  severity: "error",
  message,
  cause,
  fix,
  example,
});
const W = (code: string, message: string, cause: string, fix: string, example: string): CatalogEntry => ({
  code,
  severity: "warning",
  message,
  cause,
  fix,
  example,
});

/** The catalog, keyed by code. Frozen so it cannot be mutated at runtime. */
export const ERROR_CATALOG: Readonly<Record<string, CatalogEntry>> = Object.freeze({
  E_ARGCOUNT: E(
    "E_ARGCOUNT",
    "Component called with the wrong number of arguments.",
    "A component instance supplies more or fewer arguments than the component declares parameters.",
    "Pass exactly one argument per declared parameter.",
    "component bed(x, y) { … }\nbed(300)        # error: expects 2 arguments",
  ),
  E_ARITY: E(
    "E_ARITY",
    "Built-in function called with the wrong number of arguments.",
    "A built-in (e.g. abs, sqrt, len) was called with the wrong argument count.",
    "Check the function's arity; most built-ins take one argument.",
    "let x = abs(1, 2)   # error: abs expects 1 argument",
  ),
  E_ASSIGN_UNDEF: E(
    "E_ASSIGN_UNDEF",
    "Assignment to an undeclared name.",
    "`NAME = value` was used for a name never introduced with `let`.",
    "Declare it first with `let`, or fix a typo in the name.",
    "x = 5           # error: declare with `let x = …` first",
  ),
  E_CALL_DEPTH: E(
    "E_CALL_DEPTH",
    "Value-function call stack too deep.",
    "A value-function recurses (directly or mutually) beyond the call-depth limit.",
    "Make the recursion terminate, or rewrite it iteratively with a bounded `while`.",
    "let f(n) = f(n + 1)   # error: never terminates",
  ),
  E_COLUMN_SIZE: E(
    "E_COLUMN_SIZE",
    "Column must have a positive size.",
    "A column's width or height evaluated to zero or a negative number.",
    "Give the column a positive `size W x H`.",
    "column at (0,0) size 0x300   # error: width is 0",
  ),
  E_DIV_ZERO: E(
    "E_DIV_ZERO",
    "Division or modulo by zero.",
    "An expression divides (or takes a remainder) by a value that evaluates to zero.",
    "Guard the divisor, or use a non-zero value.",
    "let x = 10 / 0   # error",
  ),
  E_DOMAIN: E(
    "E_DOMAIN",
    "Math domain error.",
    "A built-in received an out-of-domain argument (e.g. `sqrt` of a negative number).",
    "Pass a value within the function's domain.",
    "let x = sqrt(-1)   # error",
  ),
  E_DOOR_WIDTH: E(
    "E_DOOR_WIDTH",
    "Door must have a positive width.",
    "A door's width evaluated to zero or a negative number.",
    "Give the door a positive `width`.",
    "door at (0,0) width 0   # error",
  ),
  E_DUP_ID: E(
    "E_DUP_ID",
    "Duplicate element id.",
    "Two elements declare the same `id=…`; ids must be unique across the plan.",
    "Rename one of them, or drop the explicit id to auto-generate a unique one.",
    'room id=a at (0,0) size 1x1\nroom id=a at (1,0) size 1x1   # error: duplicate id "a"',
  ),
  E_FURN_SIZE: E(
    "E_FURN_SIZE",
    "Furniture must have a positive size.",
    "A furniture item's width or height evaluated to zero or a negative number.",
    "Give the item a positive `size W x H`.",
    "furniture bed at (0,0) size 0x2000   # error",
  ),
  E_FURN_ROOM: E(
    "E_FURN_ROOM",
    "Furniture placed `in` an unknown room.",
    "A furniture item names a room with `in <roomId>`, but no room has that id.",
    "Use the id of an existing `room id=…`, or drop the `in` clause.",
    "furniture bed at (0,0) size 1500x2000 in bedrm   # error: no room id=bedrm",
  ),
  E_FURN_ROTATE: E(
    "E_FURN_ROTATE",
    "Furniture rotation must be a quarter-turn.",
    "A furniture item's `rotate` is not one of 0, 90, 180, or 270 degrees.",
    "Use a quarter-turn: `rotate 0|90|180|270`.",
    "furniture wc at (0,0) size 400x700 rotate 45   # error: not a quarter-turn",
  ),
  E_FURN_AGAINST: E(
    "E_FURN_AGAINST",
    "Invalid `against wall` fixture placement.",
    "A wall-anchored fixture references an unknown wall, omits `segment` on a multi-segment wall, omits `side`, sits on a non-axis-aligned segment, has an out-of-range offset, or also sets `rotate`. The compiler will not guess which wall/side/segment was meant.",
    "Name an existing wall id, add `segment <n>` for multi-segment walls, give `side left|right`, keep the segment axis-aligned, and drop any explicit `rotate`.",
    "furniture wc against wall w1 side left size 400x700   # error if w1 is unknown or multi-segment",
  ),
  E_IMPORT_BAD_SPEC: E(
    "E_IMPORT_BAD_SPEC",
    "Malformed import spec.",
    "The string after `import` is not a recognizable module reference.",
    'Use a relative path ("lib/x.arch") or a namespaced spec ("@scope/name:1.0.0").',
    'import "???" : a   # error',
  ),
  E_IMPORT_CONFLICT: E(
    "E_IMPORT_CONFLICT",
    "Imported name conflicts with an existing component.",
    "An imported component has the same name as one already defined or imported.",
    "Rename with `as`, or remove the duplicate.",
    'import "lib.arch": bed as lib_bed',
  ),
  E_IMPORT_CYCLE: E(
    "E_IMPORT_CYCLE",
    "Cyclic import.",
    "Modules import each other in a cycle, which cannot be resolved.",
    "Break the cycle so module dependencies form a tree.",
    "# a.arch imports b.arch which imports a.arch  → error",
  ),
  E_IMPORT_NOT_EXPORTED: E(
    "E_IMPORT_NOT_EXPORTED",
    "Imported name is not exported by the module.",
    "The module has no component with the requested name.",
    "Import a name the module actually defines (check its `component`s).",
    'import "lib.arch": nope   # error if lib.arch has no `component nope`',
  ),
  E_IMPORT_NOT_FOUND: E(
    "E_IMPORT_NOT_FOUND",
    "Import path could not be resolved.",
    "The World could not read the module at the given path.",
    "Check the path (relative to the importing file) and that the file exists.",
    'import "lib/missing.arch": a   # error',
  ),
  E_IMPORT_PARSE: E(
    "E_IMPORT_PARSE",
    "Imported module has a parse error.",
    "The module referenced by `import` does not itself parse.",
    "Fix the syntax error in the imported module.",
    "# error originates in the imported file",
  ),
  E_INDEX: E(
    "E_INDEX",
    "Array index out of range.",
    "`arr[i]` used an index outside `0 .. len(arr) - 1`.",
    "Clamp or check the index against `len(arr)`.",
    "let a = [1, 2]\nlet x = a[5]   # error",
  ),
  E_LAYOUT_CYCLE: E(
    "E_LAYOUT_CYCLE",
    "Relational room placement forms a cycle.",
    "Rooms placed with `right-of`/`below`/… reference each other in a loop, so no order resolves them.",
    "Break the cycle by giving one of the rooms absolute `at (x,y)` coordinates.",
    "room id=a right-of b size 100x100\nroom id=b left-of a size 100x100   # error: a ↔ b cycle",
  ),
  E_LAYOUT_REF: E(
    "E_LAYOUT_REF",
    "Relational placement references an unknown room.",
    "A `right-of`/`below`/… clause names a room id that does not exist in the plan.",
    "Reference an existing room id, or fix the typo.",
    'room id=k right-of ghost size 100x100   # error: no room "ghost"',
  ),
  E_RANGE_LIMIT: E(
    "E_RANGE_LIMIT",
    "Range too large.",
    "A `lo..hi` range would expand to more elements than the safety cap allows.",
    "Use a smaller range, or restructure to avoid materializing it.",
    "for i in 0..1000000 { … }   # error: range too large",
  ),
  E_RECURSION: E(
    "E_RECURSION",
    "Component recursion too deep.",
    "Component instantiation nested beyond the depth limit (usually unbounded self-instantiation).",
    "Add a base case so the recursion terminates.",
    "component r(n) { r(n) }   # error: never terminates",
  ),
  E_REDEF: E(
    "E_REDEF",
    "Name already defined in this scope.",
    "A `let` re-declares a name already bound in the same scope.",
    "Rename one binding, or use `NAME = …` to reassign instead of redeclaring.",
    "let x = 1\nlet x = 2   # error: redefinition",
  ),
  E_ROOM_SIZE: E(
    "E_ROOM_SIZE",
    "Room must have a positive size.",
    "A room's width or height evaluated to zero or a negative number.",
    "Give the room a positive `size W x H`.",
    "room at (0,0) size 0x4000   # error: width is 0",
  ),
  E_TYPE: E(
    "E_TYPE",
    "Type mismatch.",
    "A value was used where another type was required (e.g. a string where a number is expected, or a non-array in `for`).",
    "Convert or supply the expected type.",
    'room at (0,0) size "big" x 10   # error: size needs numbers',
  ),
  E_UNKNOWN_COMPONENT: E(
    "E_UNKNOWN_COMPONENT",
    "Unknown component.",
    "An instance calls a component name that is not defined or imported.",
    "Define the component, import it, or fix the name (see the suggestion hint).",
    "sofa(0, 0)   # error if no `component sofa` is in scope",
  ),
  E_UNKNOWN_FN: E(
    "E_UNKNOWN_FN",
    "Unknown function.",
    "A call uses a name that is neither a built-in nor a value-function in scope.",
    "Define it with `let f(…) = …`, or fix the name.",
    "let x = frobnicate(2)   # error",
  ),
  E_UNKNOWN_REF: E(
    "E_UNKNOWN_REF",
    "Unknown reference.",
    "An expression references a name that is not bound in scope.",
    "Declare it with `let`, pass it as a parameter, or fix the typo.",
    "let x = y + 1   # error if `y` is undefined",
  ),
  E_WALL_THICKNESS: E(
    "E_WALL_THICKNESS",
    "Wall must have a positive thickness.",
    "A wall's `thickness` evaluated to zero or a negative number.",
    "Give the wall a positive `thickness`.",
    "wall exterior thickness 0 { (0,0) (1,0) }   # error",
  ),
  E_WHILE_LIMIT: E(
    "E_WHILE_LIMIT",
    "`while` exceeded its iteration cap.",
    "A `while` ran more times than the safety cap allows (usually a condition that never becomes false).",
    "Ensure the loop body updates a binding so the condition eventually fails.",
    "let i = 0\nwhile i < 1 { column at (0,0) size 1x1 }   # error: i never changes",
  ),
  E_WINDOW_WIDTH: E(
    "E_WINDOW_WIDTH",
    "Window must have a positive width.",
    "A window's width evaluated to zero or a negative number.",
    "Give the window a positive `width`.",
    "window at (0,0) width 0   # error",
  ),
  E_OPENING_WIDTH: E(
    "E_OPENING_WIDTH",
    "Opening must have a positive width.",
    "A cased opening's width evaluated to zero or a negative number.",
    "Give the opening a positive `width`.",
    "opening at (0,0) width 0   # error",
  ),
  E_PNG_DEPENDENCY: E(
    "E_PNG_DEPENDENCY",
    "PNG/PDF export needs an optional dependency that is not installed.",
    "Rendering to PNG needs `@resvg/resvg-js` (PDF needs `pdfkit`); the optional binary is absent in this environment (it is not bundled, to keep the core zero-dependency).",
    "Install the optional dependency (`npm install @resvg/resvg-js`), or re-run with `--install` to fetch it automatically, or render to SVG/DXF (zero-dependency).",
    "arch preview plan.arch --install   # fetches @resvg/resvg-js, then renders the PNG",
  ),

  W_DOOR_OFF_WALL: W(
    "W_DOOR_OFF_WALL",
    "Door does not lie on any wall.",
    "A door's position is not within tolerance of any wall segment, so it has no host.",
    "Move the door onto a wall, or name its host with `wall <id|category>`. The diagnostic points at the nearest wall.",
    "door at (9999,9999) width 900   # warning: not on a wall",
  ),
  W_EMPTY_PLAN: W(
    "W_EMPTY_PLAN",
    "Empty plan.",
    "The plan resolved to no drawable elements.",
    "Add at least one element (wall, room, …).",
    'plan "Empty" { units mm }   # warning',
  ),
  W_HATCH_SCALE: W(
    "W_HATCH_SCALE",
    "Hatch scale must be positive; using 1.",
    "A wall material `scale` evaluated to zero or a negative number.",
    "Use a positive `scale`.",
    "wall exterior thickness 200 material brick scale 0 { (0,0) (1,0) }",
  ),
  W_ROOM_OVERLAP: W(
    "W_ROOM_OVERLAP",
    "Rooms overlap.",
    "Two room rectangles intersect.",
    "Adjust positions/sizes if the overlap is unintended (it is allowed).",
    "room at (0,0) size 2000x2000\nroom at (1000,0) size 2000x2000   # warning",
  ),
  W_SANITIZED_CONFIG: W(
    "W_SANITIZED_CONFIG",
    "A disallowed config value was stripped.",
    "A theme/style value contained markup or a `data:` URL and was blanked for safety.",
    "Use a plain colour/string value (no `<`, `>`, or `url(data:…)`).",
    'theme { wall: "<script>" }   # warning: stripped',
  ),
  W_UNKNOWN_MATERIAL: W(
    "W_UNKNOWN_MATERIAL",
    "Unknown wall material; using the default hatch.",
    "A wall `material` name is not one of the known hatches.",
    "Use a known material (e.g. brick, concrete, insulation, tile) or omit it.",
    "wall exterior thickness 200 material marble { (0,0) (1,0) }   # warning",
  ),
  W_UNKNOWN_STYLE_KEY: W(
    "W_UNKNOWN_STYLE_KEY",
    "Unknown style key.",
    "A `style <kind> { … }` block uses a key not valid for that element kind.",
    "Use a valid key (e.g. fill / stroke / label, depending on the kind).",
    'style room { nope: "#000" }   # warning',
  ),
  W_UNKNOWN_THEME_KEY: W(
    "W_UNKNOWN_THEME_KEY",
    "Unknown theme key.",
    "A `theme { … }` block uses a key that is not a theme property or alias.",
    "Use a known theme key (see the language reference / hover).",
    'theme { nope: "#000" }   # warning',
  ),
  W_WINDOW_OFF_WALL: W(
    "W_WINDOW_OFF_WALL",
    "Window does not lie on any wall.",
    "A window's position is not within tolerance of any wall segment, so it has no host.",
    "Move the window onto a wall, or name its host with `wall <id|category>`. The diagnostic points at the nearest wall.",
    "window at (9999,9999) width 1200   # warning: not on a wall",
  ),
  W_OPENING_OFF_WALL: W(
    "W_OPENING_OFF_WALL",
    "Opening does not lie on any wall.",
    "A cased opening's position is not within tolerance of any wall segment, so it has no host.",
    "Move the opening onto a wall, or name its host with `wall <id|category>`. The diagnostic points at the nearest wall.",
    "opening at (9999,9999) width 1000   # warning: not on a wall",
  ),
  W_ROOM_UNREACHABLE: W(
    "W_ROOM_UNREACHABLE",
    "Room cannot be reached from the entrance.",
    "The building has an entrance, but this room has no door/opening path back to the exterior — it is sealed off from the circulation.",
    "Add a door or cased `opening` linking it (directly or through a hall) to a space that reaches the entrance.",
    'room at (5000,0) size 3000x3000 label "Store"   # lint: no path from the entrance',
  ),

  // Architectural lint rules (v1.1) — habitability checks raised by `arch lint`,
  // not the core compile pass. See src/lint.ts.
  W_BEDROOM_NO_WINDOW: W(
    "W_BEDROOM_NO_WINDOW",
    "Bedroom has no window.",
    "A room labelled as a bedroom has no window on its perimeter (natural light / egress).",
    "Add a `window` on an exterior wall of the room.",
    'room at (0,0) size 3000x4000 label "Bedroom"   # lint: no window',
  ),
  W_DOOR_CLEARANCE: W(
    "W_DOOR_CLEARANCE",
    "Door is narrower than the minimum clear width.",
    "A door's width is below the configured minimum passable width (default 700 mm).",
    "Widen the door to at least the minimum clear width.",
    "door at (0,0) width 500 wall exterior   # lint: under 700 mm",
  ),
  W_NO_ENTRANCE: W(
    "W_NO_ENTRANCE",
    "The plan has no exterior door.",
    "The plan has rooms and an exterior wall but no door hosted on an exterior wall, so the building cannot be entered.",
    "Add a `door` on an `exterior` wall.",
    "wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }   # lint: no way in",
  ),
  W_ROOM_DISCONNECTED: W(
    "W_ROOM_DISCONNECTED",
    "Room has no door — it can't be entered.",
    "No door lies on any of the room's walls, so there is no way into the room.",
    "Add a `door` on one of the room's walls.",
    "room id=r at (0,0) size 3000x3000   # lint: no door on its perimeter",
  ),
  W_ROOM_TOO_SMALL: W(
    "W_ROOM_TOO_SMALL",
    "Room is implausibly small.",
    "A room's floor area is below the configured minimum (default 4 m²).",
    "Increase its `size`, or merge it into an adjacent space.",
    'room at (0,0) size 1000x1000 label "Closet"   # lint: 1 m²',
  ),
  W_BATH_VIA_BEDROOM: W(
    "W_BATH_VIA_BEDROOM",
    "Bathroom is reachable only through a bedroom.",
    "Every door path from the entrance to this bathroom/WC passes through a bedroom. That is fine for a private en-suite, but a dwelling's main bathroom should open off circulation (a hall or living space), not a bedroom.",
    "Add a door connecting the bathroom to a hall/living space, or route circulation so it is not reached only via a bedroom.",
    "door id=d_bath at (5200,4000) width 800 wall partition   # lint: bath only off the bedroom",
  ),
  W_ROOM_NOT_ENCLOSED: W(
    "W_ROOM_NOT_ENCLOSED",
    "Bathroom is not fully enclosed.",
    "A run of this bathroom/WC's perimeter is not backed by a wall, so it is open to the adjacent space — a privacy problem for a wet room (a partition that stops short is the usual cause).",
    "Extend the partition so the room's perimeter is walled on all sides (a door/window in the wall is fine — only a missing wall counts).",
    "wall partition thickness 100 { (4000,0) (4000,4000) }   # lint: stops short, bath left open",
  ),
  W_SWING_OBSTRUCTED: W(
    "W_SWING_OBSTRUCTED",
    "Door swing is obstructed.",
    "The quarter-circle a door leaf sweeps overlaps a piece of furniture/fixture or another door's swing, so the door cannot open fully.",
    "Move the door or the obstruction, flip the `hinge`/`swing`, or use a sliding door so the leaf clears.",
    "door at (4000,1500) width 900 swing in   # lint: leaf sweeps onto the bed",
  ),
  W_ROOM_NO_FIXTURE: W(
    "W_ROOM_NO_FIXTURE",
    "Bathroom or kitchen has no fixtures.",
    "A room labelled as a bathroom or kitchen contains no plumbing/kitchen fixture (WC, basin, shower, sink, counter…), so it is drawn as an empty box.",
    "Place the expected fixtures — e.g. import `lib/fixtures.arch` and add a `wc`, `basin`, `shower`, or `kitchen_sink`.",
    'room at (4000,4000) size 3000x2000 label "Bath"   # lint: no fixtures inside',
  ),
  W_FURNITURE_OVERLAP: W(
    "W_FURNITURE_OVERLAP",
    "Two pieces of furniture overlap.",
    "Two furniture/fixture rectangles occupy the same floor area, so they would physically collide — usually a coordinate or size mistake.",
    "Move or resize one so they no longer intersect; leave a walkway between them.",
    "furniture sofa at (300,300) size 2000x900\nfurniture bed  at (1000,500) size 1500x2000   # lint: overlaps the sofa",
  ),
  W_FIXTURE_FLOATING: W(
    "W_FIXTURE_FLOATING",
    "A plumbing/kitchen fixture is not against a wall.",
    "A fixture that conventionally needs a wall behind it (WC, basin, shower, sink, counter, stove, fridge…) sits with no wall backing any edge — it appears to float in the middle of the room.",
    "Move the fixture so one edge is against a wall (supply/waste/venting runs in the wall), or remove it.",
    "furniture wc at (3000,3000) size 400x700   # lint: no wall behind it",
  ),
  W_FURN_CLEARANCE: W(
    "W_FURN_CLEARANCE",
    "A fixture's use-space is blocked.",
    "The activity clearance directly in front of a fixture (WC, basin, sink, counter, stove…) is intruded by a free-standing piece of furniture, so the fixture can't be used comfortably. Other plumbing/kitchen fixtures are ignored, so a compact bathroom/kitchen run does not trip this.",
    "Leave the catalogued clearance clear in front of the fixture, or move the obstructing furniture.",
    "furniture stove at (0,0) size 600x600\nfurniture sofa at (0,650) size 2000x900   # lint: sofa blocks the stove front",
  ),
  W_FIXTURE_WRONG_ROOM: W(
    "W_FIXTURE_WRONG_ROOM",
    "Fixture sits outside its declared room.",
    "A furniture item declared `in <roomId>` has its centre outside that room's rectangle, so it is drawn in the wrong space.",
    "Move the fixture inside the named room, or correct the `in <roomId>`.",
    'furniture wc at (100,100) size 400x700 in bath   # lint: centre is not inside "bath"',
  ),
  W_FURNITURE_WALL_COLLISION: W(
    "W_FURNITURE_WALL_COLLISION",
    "Furniture penetrates a wall.",
    "A furniture/fixture rectangle intrudes into a wall's solid (it crosses the wall's thickness band rather than sitting flush against its face), so it would physically pass through the wall — a coordinate or size mistake. A piece merely touching the wall face is fine.",
    "Move or resize the piece so it sits fully inside the room (against the wall face, not through it), or anchor it with `against wall <id>`.",
    "furniture sofa at (350,2300) size 2000x900   # lint: crosses the partition at y3000",
  ),
  W_DOORWAY_BLOCKED: W(
    "W_DOORWAY_BLOCKED",
    "A doorway's landing is blocked.",
    "A piece of furniture/fixture sits in the clear landing space immediately on either side of a door opening, so you cannot pass through the doorway even when the leaf is open. This is the approach path, distinct from the leaf's swing arc (`W_SWING_OBSTRUCTED`).",
    "Clear the space directly in front of and behind the door, or move the door.",
    "door at (6000,3000) width 800\nfurniture wc at (5800,3050) size 700x400   # lint: WC blocks the doorway",
  ),
  W_ROOM_NO_CLEAR_PATH: W(
    "W_ROOM_NO_CLEAR_PATH",
    "A room cannot be entered or crossed.",
    "Furniture, fixtures, door swings and their clearances fill the room so densely that a person stepping through a door/opening has no clear floor path into the usable space — the room is technically reachable but physically blocked.",
    "Open up the layout: move or shrink the furniture nearest the door so there is a continuous walkable strip from each entrance into the room.",
    "furniture shower at (5000,3000) size 2000x2000   # lint: fills the bathroom against its only door",
  ),
});

/** All catalog codes, sorted (errors then warnings, alphabetically within). */
export const ERROR_CODES: readonly string[] = Object.keys(ERROR_CATALOG).sort((a, b) => {
  const sev = (c: string): number => (ERROR_CATALOG[c].severity === "error" ? 0 : 1);
  return sev(a) - sev(b) || a.localeCompare(b);
});

/** Render a catalog entry as a plain-text block for `arch explain`, or null. */
export function explain(code: string): string | null {
  const e = ERROR_CATALOG[code];
  if (!e) return null;
  return [
    `${e.code}  (${e.severity})`,
    `  ${e.message}`,
    "",
    "Cause:",
    `  ${e.cause}`,
    "",
    "Fix:",
    `  ${e.fix}`,
    "",
    "Example:",
    ...e.example.split("\n").map((l) => `  ${l}`),
  ].join("\n");
}
