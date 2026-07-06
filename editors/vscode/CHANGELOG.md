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
