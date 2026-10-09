# Change Log — ArchLang VS Code extension

All notable changes to the **ArchLang** VS Code extension
([`ChanMeng.archlang`](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang))
are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the extension follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **This extension is versioned independently of the core** `@chanmeng666/archlang`
> package. It bundles the core at build time (esbuild, `--no-dependencies`), so a new
> language feature in the core only reaches users **after the extension is rebuilt and
> republished**. See [CONTRIBUTING.md → Releasing](../../CONTRIBUTING.md#releasing) for
> the checklist that keeps the two in sync.

## [0.30.0] - 2026-10-09

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.42.0`** (`arch finish`, and
  `W_BATH_VIA_BEDROOM` no longer flags an en-suite beside a bathroom off circulation).
  - The release adds no grammar, keyword or diagnostic code, and `finish` is a CLI and library
    transform the extension does not call. The rebundle keeps the extension's language
    services at the published core.

## [0.29.0] - 2026-10-06

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.41.0`** (a room name too wide for its room
  now wraps onto several lines).
  - The extension draws nothing, so the change does not reach the editor: diagnostics, hover
    and completion are byte-identical over every shipped example and test fixture. The
    rebundle keeps the extension's language services at the published core.

## [0.28.0] - 2026-10-05

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.40.0`.**
  - A component imported from a module now resolves a name against that module's own
    plan-level `let`s and value-functions, so a file that the core accepts no longer shows
    `E_UNKNOWN_REF` / `E_UNKNOWN_FN` on such a name. No file that was clean before gains a
    diagnostic.
  - `ERROR_CODES` is ordered by code unit instead of the host's collation. The codes
    themselves, hover and completion are unchanged.

## [0.27.0] - 2026-10-03

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.39.0`** (visual-polish release: the plan
  symbols, doors, windows and ground hatches are redrawn).
  - The extension draws nothing, so the redraw reaches it only through the drawing budget: the
    redrawn symbols emit more primitives (a window's drawing cost is 4 → 6), so a plan close to
    the budget can report **`E_DRAWING_LIMIT`** sooner. Diagnostics are otherwise byte-identical
    over every shipped example and test fixture; hover and completion are unchanged.

## [0.26.0] - 2026-10-02

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.38.0`** (robustness release).
  - **Seven new diagnostics** (`arch explain <CODE>`): `E_NON_FINITE`, `E_ELEMENT_LIMIT`,
    `E_LAYOUT_UNPLACED`, `E_OUT_OF_RANGE`, `E_RUN_TOO_LONG`, `E_STEP_LIMIT` and
    `E_DRAWING_LIMIT`. Inputs that used to throw, overflow the stack or run out of memory now
    return one of them; coordinates and lengths are held to a 2^25 mm modelling range.
  - **Content after the plan's closing `}`** (a stray `}` or a second `plan` block) is an
    `E_PARSE` on the first trailing token instead of being dropped silently.
  - **`W_SWING_OBSTRUCTED`** decides door-swing clashes exactly; **`E_ARC_RADIUS`** accepts exact
    semicircles and its fix writes a radius that passes; **`W_ROOM_NOT_ENCLOSED`** on a wet
    `room circle` is measured against its `arc` walls.
  - **Circulation facts**: a storey reached only by a shaft now has them, a stair is a way up
    only from a reachable room, and a door's width applies only on the cells it opens.

## [0.25.0] - 2026-10-01

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.37.1`** (spans core 1.36.0 to 1.37.1).
  - **Re-roll refactor action.** A run of statements whose numbers advance by a constant step is
    offered as a `refactor.rewrite` code action that rewrites it into a proven-equivalent `for` loop
    (the same engine as `arch reroll`). It is offered only on an explicit refactor request, never on
    an automatic one, and only for a selection that covers the run.
  - **Rename and find-references find every use of a name**, including uses inside a placed
    component.
  - **`describe --facts symmetry,syntax`** and `mirror: true` on reflected doors and dimensions in
    Plan JSON reach the editor's `describe` consumers; `place` now composes (a component may
    reference the instances it places).
  - **`W_SWING_OBSTRUCTED`** no longer fires on a textbook double door, and its "narrow the door"
    hint quotes a width that clears.
  - **Deprecations surface as warnings**: `while`/reassignment carry an advisory
    (`W_WHILE_DEPRECATED`, `W_REASSIGN_DEPRECATED`); the axonometric view is deprecated.
  - **Accessible output**: `annotate` + `accessible` make a compiled plan keyboard-reachable.

## [0.24.0] - 2026-09-04

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.35.0`.** The vertical datum layer reaches the
  editor: `sill`/`head` heights on openings and storey heights parse, complete and diagnose as
  data (heights draw nothing on the plan). The opt-in axonometric view is a compile option only.

## [0.23.0] - 2026-09-04

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.34.0`.** New advisory `W_DRAWING_OVERFLOW`
  (a drawing that overflows its sheet) and a `sheet.drawing_fits` key in `describe`.
- **Completion offers the 129 fixture categories** in a furniture statement's category slot.

## [0.22.0] - 2026-09-03

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.33.0`.** Twelve silent wrong answers fixed
  (curved-wall circulation, mirrored handed fixtures, lint rules that refused correct drawings);
  one new advisory code, no language change.

## [0.21.0] - 2026-08-29

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.32.0`.** Twenty-six new fixture families across
  five domains are valid furniture categories; fourteen fixture symbols are redrawn.

## [0.20.0] - 2026-08-29

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.31.0`.** Outdoor plans: ground surfaces,
  fences and a site lot line; twenty-one outdoor fixture families; `uses garage` with
  `W_GARAGE_TOO_NARROW`; and `door garage`, the sixth door kind.

## [0.19.0] - 2026-08-28

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.30.0`.** One zero-dependency wall-joinery pass
  for every wall; no new syntax.

## [0.18.0] - 2026-08-26

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.29.0`.** New forms: `roof` (the eaves
  projection line) and `void` (a hole in this storey's floor plate); four new furniture families.

## [0.17.0] - 2026-08-26

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.28.0`.** The room-furniture vocabulary and the
  glyph layer it is drawn on; furniture-bearing drawings change.
## [0.16.0] - 2026-08-25

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.27.0`.** One new language form reaches the
  editor and three lint rules widen, so this is a minor rather than a patch.
  - **An opening's position along a wall is now an expression.**
    `door|window|opening … on <wall> at <pos>` used to accept a single `number` token, which made
    the attachment form unusable from inside a `for` loop — the one place it is most worth having.
    `on w1 at bay * i + 600 width 700` now parses, `let` bindings are in scope there exactly as
    they are for `width`, and completion/diagnostics follow the same expression grammar every other
    numeric slot uses. One deliberate wrinkle the hover and the error text both state: inside
    `<pos>` a `%` is the percent **suffix**, so it always ends the expression and never means
    modulo — write `(5000 % 3000)` if you meant the operator.
  - **Every parse and lex error now carries a code: `E_PARSE`.** Until now the single most common
    failure in the editor — a syntax error — arrived with no `E_*` code at all, so it could not be
    selected, filtered or explained the way every other diagnostic can. It is catalogued, and its
    entry says what makes it unlike the others: resolution never ran, so there is never a quick fix
    to offer and nothing about what the plan *means* has been judged.
  - **`E_DIV_ZERO` and `E_TYPE` from an expression now point somewhere.** A `bin`/`range` node built
    over a literal carried no span, so those diagnostics reached the editor with a real message and
    nothing to underline. The span is now taken from the token stream — first token to last, so it
    covers the whole expression rather than its left half.
- **Three lint rules widened, so the editor may flag files it used to pass.** Every one of these is
  a defect the rule already claimed to catch:
  - `W_FURNITURE_WALL_COLLISION` can see a wall that is not axis-aligned (it opened with a
    `return 0` for anything diagonal, so a sofa drawn straight through a 45° wall linted clean). A
    curved segment is now declined outright rather than measured against its chord.
  - `W_FIXTURE_WRONG_ROOM` measures the fixture's **footprint** against the room's own floor instead
    of asking only where its centre is — at a corner, a piece can be 72% inside three other rooms
    with its centre comfortably in.
  - `W_NO_ENTRANCE` no longer stands down when a shell is drawn entirely from `partition` walls; it
    reads the same access graph `describe()` reads.

### Note

- No change to the extension's own source. Its version moves because the language it bundles does —
  the `.vsix` inlines the core at build time, so users see none of the above until this upload lands.

## [0.15.1] - 2026-08-13

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.26.1`** — the release that ran five shipped
  surfaces nobody's test had ever executed. No new syntax and no new catalogued code reaches the
  editor, but its **diagnostics and quick fixes differ**, because nine core `src/` files changed and
  four of them are on the bundled language server's path:
  - **`W_DIM_INSIDE` no longer offers a quick fix that undoes itself.** "Swap the endpoints" is only
    offered when the swap actually moves the dimension line out of the building. On a dimension whose
    measured run cuts *through* the plan the line reads inside either way, so the old fix was
    re-offered every pass and swapped back forever — applying it from the lightbulb walked the file
    in a 2-cycle. The warning still reports; it now honestly carries no automatic fix, and its
    hover text says so and names the alternatives (measure along a facade, or raise the `offset`).
    The predicate behind it moved to the core's `src/geometry.ts` so the rule and the fix producer
    share one source.
  - **The formatter no longer drops door kinds.** `Format Document` on a file containing
    `door … pocket … slide left` (or any `sliding` / `barn` / `bifold`, or an `open <0..1>` clause)
    used to return it as a plain hinged door — a silent semantic rewrite of the drawing by the one
    command a user is entitled to assume is safe. Shipped since v1.25.0; fixed here.
- **The extension's core dependency range is now guarded.** `editors/vscode/test/lockstep.test.ts`
  requires it to be a string equal to `^` + the core's version, so a core release reddens the
  extension on purpose until someone consciously re-pins. It had sat two releases stale at `^1.24.0`
  because nothing checked it — the `__CORE_VERSION__` bundle-freshness stamp stayed green the whole
  time, since esbuild resolves the workspace symlink regardless of what the manifest declares. Only
  the manifest had rotted.

## [0.15.0] - 2026-08-12

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.26.0`** — the release that made the language's
  descriptions of itself agree with its parser. No new syntax reaches the editor, but two new
  catalogued codes do:
  - **`E_ROOM_ALIGN`** and **`E_ROOM_ALIGN_AXIS`** with their hovers and **quick fixes**. A
    relationally-placed room's `align <word>` used to accept any word at all and silently lay the
    room out against the leading edge — `align sideways`, and `align left` after `right-of`, both
    compiled clean and drew the wrong plan. Both are now refused, and both fixes rewrite the
    offending word alone, so a typo'd alignment is a one-keystroke repair in the editor rather than
    a drawing nobody questions.
  - Completion and hover now derive their relational direction and alignment value sets from the
    core's single tables rather than a second hand-typed copy.

### Fixed

- The extension's `@chanmeng666/archlang` dependency range was `^1.24.0` — **two releases behind** —
  so the range no longer described the core it bundles. It is re-pinned to `^1.26.0`. (The bundle
  itself was current; the `__CORE_VERSION__` stamp test proves what actually shipped, which is why
  the stale *range* went unnoticed.)

## [0.14.0] - 2026-08-11

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.25.0`** — the "orientation & openings" release,
  so the bundled services learn two new language surfaces and stop reporting a window's aspect
  backwards on a courtyard plan:
  - **thirteen new tokens** in the regenerated TextMate grammar and in completion — the plan-level
    **`site { street … hemisphere … }`** block with its `north`/`south`/`east`/`west` and
    `north`/`south` value words, and the door kinds **`hinged`**, **`sliding`**, **`barn`**,
    **`bifold`** and **`pocket`** with their **`slide left|right`** and **`open <0..1>`** clauses;
  - **nine new catalogued codes with their hovers** — `E_SITE_DUP`, `E_SITE_NO_STREET`,
    `E_INTENT_NO_SITE`, `W_ROOM_NOT_EQUATOR_FACING`, `E_DOOR_KIND_CLAUSE`, `E_DOOR_OPEN_RANGE`,
    `E_DOOR_KIND_CURVED`, `W_POCKET_RUN` and `W_DIM_OVERLAP`, the last two carrying
    machine-applicable quick fixes (reverse the slide; bump the dimension out one chain tier);
  - the analysis behind the language services stops deriving positions from a bounding box where
    the shape itself is the honest datum: a window's `facing` is now probed off its own wall (a
    courtyard plan used to report every courtyard-wall window backwards), a concave room's
    circulation anchor sits in the room rather than on the lip of its notch, and `swing into <room>`
    and `furniture … against wall` ask a `polygon`/`circle` room's ring instead of its box.
- Diagnostic messages for obstructed swings, blocked doorways, fixture clearance and narrow walks
  now state the value required, the value measured and the shortfall, and list the remedies —
  including, for an obstructed swing, the door kinds that dissolve the problem entirely.

## [0.13.0] - 2026-07-26

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.24.0`** — the "geometry II" release, so the
  bundled services stop assuming every edge is straight:
  - six new tokens in the regenerated TextMate grammar and in completion — the **`arc (x,y) radius
    R`** wall-body clause with its **`cw`**/**`ccw`** and **`major`** modifiers, and **`room …
    circle at (cx,cy) radius R`**;
  - three new catalogued codes with their hovers — **`E_ARC_RADIUS`** (a radius under half the
    chord describes no circle; the hover's quick fix substitutes the minimum radius),
    **`E_ROOM_RADIUS`**, and **`E_DIM_CURVE_REF`** (a `dim radius`/`dim diameter` naming a missing,
    ambiguous or wrong-shaped element);
  - the analysis behind the language services follows the curve rather than its chord: a circular
    room's area is exact **πR²** in `describe()`, openings on an arc are attributed by **arc
    length**, and `describe().rooms[].floor_circle` reports the true centre and radius.
- Bumped the dev-dependency pin `^1.22.0` → `^1.24.0` to match the bundled core.
- **This upload supersedes 0.11.0 and 0.12.0, which were packaged but never uploaded** — the
  Marketplace still lists 0.10.0 (core 1.21.0) as its only version, so installing this one carries
  the composition, polygon and curve tiers at once.

## [0.12.0] - 2026-07-26

> Packaged but **never uploaded** to the Marketplace; 0.13.0 supersedes it.

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.23.0`** — the "geometry I" release:
  - the **`polygon`** keyword in the regenerated grammar and in completion, making a room a simple
    closed ring (`room … polygon (x,y) (x,y) (x,y) …`) instead of a rectangle;
  - four new catalogued codes with their hovers — **`E_PLACE_POLY`** (relational and in-room
    placement refuse a ring rather than approximating it),
    **`E_ROOM_POLY_SELF_INTERSECT`**, **`E_ROOM_POLY_DEGENERATE`**, and the advisory
    **`W_ROOM_LABEL_OUTSIDE`**;
  - exact shoelace areas and centroid labelling in `describe()`, plus
    `describe().rooms[].floor_polygon`;
  - the `Paint.miterLimit` cap, so an acute wall joint no longer grows a mitre spike in the PDF
    export.

## [0.11.0] - 2026-07-26

> Packaged but **never uploaded** to the Marketplace; 0.13.0 supersedes it.


### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.22.0`** — the "composition" release, so the
  bundled services stop seeing a component as a text macro and a plan as one flat list of rooms:
  - three new statement keywords in the regenerated TextMate grammar and in completion —
    **`zone <id> ["Label"] { … }`**, **`place <component>(…) as <name> at (x,y)`** and the
    **`mirror x|y`** clause (alongside `rotate 0|90|180|270`);
  - **dotted identifiers highlight and complete** (`west.main`, `west.perimeter`): the lexer's
    identifier rule now takes a dotted tail, which is legal in reference positions only;
  - three new catalogued codes with their hovers — **`E_DOTTED_DECL`** (a dotted name used where a
    declaration is expected), **`E_DUP_INSTANCE`** (two `place`s share an instance name), and the
    advisory **`W_IMPORT_EMPTY_FILE`** (`import "x.arch" as x` where the module has no drawable
    body);
  - **a diagnostic raised inside an imported component body now points at the file it was written
    in.** The bundled quick-fix path inherits the accompanying safety fix: `applyFixes` refuses any
    suggestion carrying a `file`, so a "Fix" action on an imported component's diagnostic can no
    longer splice foreign byte offsets into the file you have open (a corruption present since
    imports shipped in v0.10).

## [0.10.0] - 2026-07-26

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.21.0`** — the "vertical" release, so the bundled
  services stop treating a building as one floor:
  - four new statement keywords in the regenerated TextMate grammar and in completion —
    **`level <n> ["Name"] { … }`**, **`stair`**, **`elevator`** and **`escalator`** (with the
    `dir up|down` clause and the stair's `width <mm>`);
  - six new catalogued codes with their hovers — **`E_LEVEL_MIX`** (a drawable statement beside a
    `level` block has no floor to belong to), **`E_LEVEL_DUP`**, **`E_LEVEL_NEST`**,
    **`E_VERT_SIZE`**, **`E_STAIR_WIDTH`**, and the advisory **`W_STAIR_UNMATCHED`** (a shaft whose
    id appears on only one storey connects nothing);
  - diagnostics now carry the storey that raised them, so a fault on the top floor is reported
    against the right level rather than pooled;
  - the analysis behind the language services: `describe()`'s new `levels` / `vertical` keys, and
    circulation clear widths that are measured on a grid sized from the plan's **area**, so a large
    building's numbers discriminate instead of quantising to one coarse cell.
- Bumped the dev-dependency pin `^1.19.0` → `^1.21.0` to match the bundled core.

A single-storey plan with no vertical element behaves exactly as it did under 0.9.0.

## [0.9.0] - 2026-07-26

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.20.0`** — the "sheet & datum" release, so the
  bundled services pick up the whole new sheet surface:
  - four new statement keywords in the regenerated TextMate grammar and in completion —
    **`paper <size> [orientation]`** (with the `A4`…`A0` / `landscape` / `portrait` value
    vocabulary), **`axes { x at … / y at … }`**, **`schedule rooms`** and **`legend`**;
  - the new catalogued code **`W_SCALE_OVERFLOW`** with its hover (a declared `paper` + `scale`
    the building does not fit — advisory, your scale is never silently overridden);
  - the operative drawing scale itself: a `paper` plan's annotation sizes are now a constant number
    of millimetres on the sheet × the scale denominator, so the preview of a large building is
    legible instead of carrying metre-tall room labels;
  - `describe()`'s three new keys (`axes`, `sheet`, `schedule`) behind the same language services.

A plan that declares none of `paper` / `axes` / `schedule` / `legend` renders exactly as it did
under 0.8.0.

## [0.8.0] - 2026-07-25

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.19.0`** — two language-surface releases had
  accumulated (1.18.0's `arch suggest` round shipped without an extension repack), so the bundled
  services pick up:
  - the new **`flush`** keyword (wall-face-referenced in-room placement) in the regenerated TextMate
    grammar and in completion;
  - the new **`dim faces` / `dim clear`** statement forms;
  - four new catalogued codes with their hovers and, where they carry one, their **quick fixes** —
    **`W_FIXTURE_BACK_TO_ROOM`** (a fixture against a wall with its back to the room; fix inserts or
    rewrites `rotate <n>`), **`W_DIM_INSIDE`** (a hand dim whose line lands inside the plan; fix swaps
    the reversed endpoints), **`W_DIM_NO_WALL`**, and the error **`E_FURN_FLUSH`** (`flush` with no
    anchored edge);
  - derived fixture orientation for `in <room> anchor <edge>` placement, `describe().bbox_outer`, and
    1.18.0's stable-ref `suggest` candidates (a suggestion the extension surfaces no longer names a
    wall by a positional auto-id that re-binds on a later edit).
- Bumped the dev-dependency pin `^1.15.0` → `^1.19.0` to match the bundled core.

## [0.7.0] - 2026-07-12

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.15.0`** — a language-surface release, so
  the bundled services pick up: **optional metric unit suffixes** (`3m`/`3cm`/`3mm` fold to
  millimetres; syntax highlighting via the regenerated TextMate grammar), the new advisory
  **`W_ALIAS_MATCH`** (a room's use inferred from an indirect alias like "Powder" → WC) with
  its **quick fix** inserting the explicit `uses …`, canonical quick-fix ordering via the
  core's new `rankFixes`, and the `describe().freedom` placement facts. Bumped the
  dev-dependency pin `^1.14.0` → `^1.15.0` to match the bundled core.

## [0.6.0] - 2026-07-12

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.14.0`**, refreshing the bundled
  language services and error catalog. Diagnostics and `explain` now recognize the eight
  v1.14 **intent-channel** codes (`E_INTENT_ROOM_MISSING`, `E_INTENT_ROOM_COUNT`,
  `E_INTENT_ROOM_AREA`, `E_INTENT_TOTAL_AREA`, `E_INTENT_NOT_ADJACENT`,
  `E_INTENT_UNREACHABLE`, `E_INTENT_NO_DOOR`, `E_INTENT_NO_WINDOW`) surfaced by the core's
  new intent verification (`validateIntent` / `arch validate --intent` / `arch score`).
  Bumped the dev-dependency pin `^1.13.0` → `^1.14.0` to match the bundled core.

_Rebundle only — no new extension configuration or runtime-behavior change beyond the newer bundled core._

## [0.5.0] - 2026-07-11

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.13.0`**, picking up the v1.13 language
  surface so highlighting, completion, hover, and diagnostics cover the new AI-native
  authoring sugar: opening **attachment** (`door|window|opening on <wall> at <pos>`,
  `swing into <room>`, `hinge near start|end`), the **`strip`** layout block, and
  **`furniture … in <room> anchor <corner|edge> [inset <mm>]`**, plus the new catalogued
  codes (`E_ATTACH_WALL_REF`, `E_ATTACH_POS_RANGE`, `E_STRIP_NEST`, `E_STRIP_SIZE`,
  `E_JSON_SCHEMA`, `E_JSON_KIND`). Bumped the dev-dependency pin `^1.12.0` → `^1.13.0` to
  match the bundled core.

_No new configuration or runtime-behavior change beyond the newer bundled core._

## [0.4.1] - 2026-07-10

### Added

- **Marketplace icon.** The extension now ships a listing icon
  (`images/icon.png` — the sanctioned void-tile + plum A-frame mark composition from the
  brand kit) plus a dark `galleryBanner` (`#0f1115`), so `ChanMeng.archlang` no longer shows
  the default placeholder. Icon-only repack; no language-surface or bundled-core change.

## [0.4.0] - 2026-07-06

### Changed

- **Rebundled the core at `@chanmeng666/archlang@1.12.0`**, picking up the v1.12 language
  surface: new plan-level **`accTitle` / `accDescr`** accessibility keywords (highlighting,
  completion, hover) and the new diagnostic codes `E_ACC_PLACEMENT` / `W_DUP_ACC_METADATA`
  in the bundled catalog.

## [0.3.1] - 2026-07-03

### Changed

- **Rebuilt against core `@chanmeng666/archlang@1.10.0`** (was bundled against a
  pre-v1.4 core). This refreshes the bundled language services and TextMate grammar to
  the current language surface — so completion, hover, diagnostics, and highlighting now
  cover everything the language gained since the previous package (room `uses` tags, the
  `opening` element, `against wall` / `rotate` furniture, `dims auto`, and the current
  error/lint-code catalog).
- **Accurate README.** The listing now documents the full LSP feature set the extension
  already provides (hover, completion, go-to-definition, rename, signature help) instead
  of describing it as "minimal."
- Bumped the dev dependency pin `@chanmeng666/archlang` `^1.0.1` → `^1.10.0` to match the
  bundled core.

_No runtime-behavior change beyond the newer bundled core; no new configuration._

## [0.3.0] - 2026-06-27

### Added

- Grammar and diagnostics updated for `dims auto` and the newer lint rules shipped in the
  core at the time.

## [0.2.0] - 2026-06-26

### Changed

- **Bundled with esbuild** into a self-contained, slim `.vsix` — the grammar and
  language-configuration are copied in at build time so the package resolves them without
  `../` paths, and the core is inlined rather than shipped as a dependency.
- Corrected the Marketplace **publisher to `ChanMeng`** and the extension **id to
  `archlang`** (`archlang-vscode` was taken).

## [0.1.0] - 2026-06-26

### Changed

- Packaged against the **published** core rather than a local link.

## [0.0.1] - 2026-06-25

### Added

- Initial release: a language server (LSP) for `.arch` files providing **live
  diagnostics** plus **hover, completion, go-to-definition, rename, and signature help**,
  and **TextMate syntax highlighting** from the shared generated grammar.
