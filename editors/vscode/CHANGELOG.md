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

## [0.11.0] - 2026-07-26

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
