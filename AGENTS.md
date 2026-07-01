# AGENTS.md

This file provides project guidance to AI coding assistants (Claude Code, GitHub Copilot, Cursor,
Codex, etc.) working with this repository. Read it before writing or changing any code.

## Project Overview

ArchLang — A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

- **Primary language / stack:** TypeScript (Node 18+; the core also runs in the browser)
- **Default branch:** `main`
- **Repository:** https://github.com/ChanMeng666/archlang

## Project status & where things live (current)

**ArchLang is shipped and launched (v1.3.0).** This is a published, deployed monorepo —
not a work-in-progress. Treat the live artifacts below as the source of truth.

| Thing | Current | Where |
|-------|---------|-------|
| **Core package** | `@chanmeng666/archlang@1.9.0` (published, `latest`) | npmjs.com/package/@chanmeng666/archlang |
| **Agent interface** | the `arch` **CLI** (`--json`, exit codes, stdin) + `SKILL.md` + `spec.llm.md` — **no MCP** | `src/cli.ts`, `SKILL.md`, `spec.llm.md` |
| **VS Code extension** | `ChanMeng.archlang@0.3.0` (published, live) | marketplace.visualstudio.com/items?itemName=ChanMeng.archlang |
| **Playground** | deployed (pan/zoom · autocomplete · history · click-to-source · **format · repair · error-explain · embeddable `embed.html`**) | https://archlang-playground.vercel.app |
| **Docs site** | deployed (VitePress · **live editable `<ArchLive>` examples**) | https://archlang-docs.vercel.app |
| **Git** | `main`, tags `v1.0.0` → `v1.9.0` (latest) | github.com/ChanMeng666/archlang |
| **Tests** | 488 passing (56 files); typecheck + build clean | — |

**Unreleased (sites only, core untouched).** Two ZenUML-inspired wins in the deployed apps — **no
change to the published core**: (1) an **embeddable playground viewer** (`playground/embed.html`,
rendered from the `#z=` share hash, with an **Embed** snippet button and `&editable=1`), plus
**IDE-parity actions** wiring shipped-but-unused core APIs into the UI (a **Format** button, a
**Repair furniture** review-and-apply panel, and **clickable diagnostics** that jump to source and
show the catalogued cause/fix/example); and (2) **live, editable docs examples** via a new
SSR-safe `<ArchLive>` VitePress component (examples gallery + guide hero). See `CHANGELOG.md`.

**Latest release — v1.9.0 (opt-in source annotation + playground overhaul).** Two things:
- **Core: opt-in source annotation.** `compile(src, { annotate: true })` stamps `data-span="start:end"`
  (source byte range) on each drawn SVG primitive that has a span, so a tool can map a clicked element
  back to its source. **Default output is byte-identical** (Scene IR + SVG unchanged, goldens
  untouched, exports clean); `toScene` carries the span onto nodes only in this mode; walls are unioned
  so they are intentionally unstamped. Deterministic, still zero-dependency. Programmatic only (no CLI
  flag). See [ADR 0007](docs/adr/0007-opt-in-source-annotation.md).
- **Playground: mermaid-live-editor parity + editor↔plan linking.** The Vite app now has preview
  pan/zoom/fit, editor autocomplete (via the core `completion()`), compressed share links (`#z=`,
  reads legacy `#src=`), autosave + named snapshot history (localStorage), copy SVG/PNG, resizable
  panes, an always-visible `describe()` facts strip, **click-any-element → jump-to-source** (via
  `annotate`), and **hover-a-room → facts tooltip**. All client-side; exports strip the annotations.
  New modules: `playground/src/{pan-zoom,interact,snapshots,storage,arch-completion}.js`.

**v1.8.0 (agent CLI ergonomics).** Four additive commands, no core change and the
core stays zero-dependency: **`arch preview`** (render a PNG an agent can look at; PNG-first @2×,
zero-install where `@resvg/resvg-js` is present, else the catalogued `E_PNG_DEPENDENCY` + a `fix`, and
opt-in `--install` fetches it); **`arch batch`** (render many files concurrently, `{ ok, results[] }`);
**`arch md`** (render every ` ```arch ` block in a Markdown file → image links, via pure
`extractArchBlocks`/`rewriteMarkdown`); and **`arch manifest --json`** (the whole CLI API as structured
data, drift-tested against the dispatch + fixture glyphs). The auto-install is the one opt-in,
networked action — confined to the CLI seam.

**v1.7.1** (docs: `SKILL.md` adds a verified agent procedure to repair plan
**topology** — make every room reachable & every bedroom lit by adding doors/windows from the
`describe` access graph; the design choice stays in the agent layer per ADR 0005. No core change.)

**v1.7.0 (`arch repair` also clears door-swing arcs).** The corrector now fixes six
furniture-placement faults via a global fixpoint (priority wall → wrong-room → overlap → doorway →
swing → floating), deterministic and report-don't-guess (ADR 0006). On the motivating plans it drives
every furniture-placement and swing warning to zero.

**v1.6.0 (`arch repair` separates overlaps + relocates wrong-room fixtures).** The
corrector fixes furniture-placement faults via a global fixpoint, deterministic and report-don't-guess
(ADR 0006).

**v1.5.0 (`arch repair` clears doorways + snaps floating fixtures).** The corrector
iterates each piece to a stable position across closed-form fixes, converges, and reports rather than
guesses (ADR 0006). On the motivating plans it drives every furniture-placement warning to zero.

**v1.4.0 (physical-correctness & circulation; a 2nd Claude × Codex pass).**
The compiler stays a faithful deterministic renderer; corrective arranging is an **explicit
source-to-source transform** (`arch repair`), never invisible render behavior (see ADR 0006). v1.4
adds: **`dims auto walls`** + per-room dims in the page margin; lint **`W_FURNITURE_WALL_COLLISION`**,
**`W_DOORWAY_BLOCKED`**, **`W_ROOM_NO_CLEAR_PATH`** (a grid flood-fill in `src/analyze/occupancy.ts`);
**`arch validate --strict`** (warnings fail too — the pipeline ship-gate); catalogued fixture
footprints (`against wall` may omit `size`); and **`arch repair`**. See `CHANGELOG.md`.

**Prior release — v1.3.0 (architectural soundness, circulation facts & professional placement).**
A Claude × Codex adversarial pass. The compiler stays a faithful deterministic renderer; the new
"design intelligence" ships as **facts** (`describe`) and **advisory `lint`**, never an auto-arranger
(see ADR 0005). v1.3 adds: **room `uses` tags** + a central classifier; a **modeled door/opening
access graph** (`describe().access` — entrances, reachability, clear-width bottleneck); a leaf-less
**`opening` element**; **furniture `rotate`**, closed-form **`against wall` placement**, and `in
<room>` ownership; new lint (`W_ROOM_UNREACHABLE`, `W_FURNITURE_OVERLAP`, `W_FIXTURE_FLOATING`,
`W_FIXTURE_WRONG_ROOM`, `W_FURN_CLEARANCE`); **advisory profiles** (`arch lint --profile`); and fixes
for concave door arcs, dimensions drawn into the building, and the title-block overlap (shared
`chrome-layout.ts`). See `CHANGELOG.md`.

> Beware older docs that predate the launch: `docs/IMPLEMENTATION-PLAN-v0.7-v1.0.md`
> is the (now-completed) roadmap, and the earlier half of `docs/WORK-LOG.md` is
> historical. The table above and `CHANGELOG.md` reflect what actually shipped.

**Monorepo layout (npm workspaces, one root lockfile):**

```
.                     @chanmeng666/archlang — the core (PUBLISHED package; src/, dist/)
├─ spec.llm.md        GENERATED one-page language spec for agents (`arch spec`); see scripts/gen-llm-spec.ts
├─ SKILL.md           agent Skill: the spec → compile → describe → lint loop (CLI-driven)
├─ llms.txt           machine-readable project map (how to USE vs CONTRIBUTE)
├─ editors/vscode     archlang-vscode → published as ChanMeng.archlang (esbuild-bundled extension)
├─ editors/*.json     generated TextMate grammar + language-configuration (shared by the extension)
├─ playground/        Vite + CodeMirror live editor (consumes the built core via dist/)
├─ docs-site/         VitePress docs (pages generated from docs/*.md, examples/*.arch)
├─ docs/              language-reference.md · error-codes.md · adr/ · WORK-LOG.md · roadmap
├─ examples/          studio · two-bed · parametric · themed · relational · lib/ · imports
├─ eval/              NL→ArchLang authorability harness (corpus.json, goldens/, run.ts)
├─ scripts/           gen-grammars · gen-error-codes · gen-llm-spec (single-source generators)
├─ bench/             ~1000-element timing harness (+ --json mode, CI regression comment)
└─ test/              vitest: snapshot + fast-check + unit + visual-regression + CLI/describe/lint/eval
```

Key agent-facing `src/` modules (all pure, exported from `src/index.ts`): `describe.ts`
(semantic summary), `lint.ts` (architectural soundness rules — v1.2 added circulation/enclosure/
swing-clearance/fixture checks), `analyze.ts` (shared resolve pipeline + rectilinear geometry —
door connectivity, perimeter enclosure — behind both `describe` and `lint`). `geometry.ts` holds the
shared door-swing quarter-disc geometry used by both the renderer and the linter;
`elements/fixtures-glyphs.ts` (v1.2) draws the fixture symbols. The agent-facing CLI lives in
`src/cli.ts`.

A single `npm install` at the root bootstraps every workspace.

## Commands

This is an **npm-workspaces monorepo**: the core (`@chanmeng666/archlang`) lives at
the repo root and is the published package; `editors/vscode`, `playground`, and
`docs-site` are workspace members sharing one root lockfile.

```bash
npm install          # bootstraps ALL workspaces (core has ZERO runtime deps)
npm run build        # build core library + CLI into dist/ (tsup)
npm run typecheck    # tsc --noEmit
npm test             # run the vitest suite (test/**/*.test.ts)
npm run cli -- compile examples/studio.arch -o studio.svg   # run the CLI from source via tsx
npm run bench        # compile a generated ~1000-element plan and report per-stage timings
npm run gen:grammars # regenerate editor grammars from src/grammar/tokens.ts (CI checks drift)
npm run gen:errors   # regenerate docs/error-codes.md from the catalog (CI checks drift)
npm run gen:spec     # regenerate spec.llm.md from tokens.ts + examples/ (CI checks drift)

npm run playground:dev   # build core, then run the Vite playground dev server
npm run docs:build       # build core, then build the VitePress docs site
```

Export to other formats from the CLI: `-f svg|dxf|pdf|png` (`pdf` needs optional
`pdfkit`; `png` needs optional `@resvg/resvg-js`).

**The CLI is agent-native.** Every command takes `--json` (structured result to stdout, messages to
stderr) with deterministic exit codes (`0` ok · `2` user-source error · `1` IO/internal · `3` bad
usage), and source can come from stdin (`-`). Beyond `compile`/`watch`/`fmt`/`explain` there are
`arch spec` (print the whole language — `spec.llm.md`), `arch describe` (semantic JSON: rooms,
areas, adjacency, door connections — backed by `describe()` in `src/describe.ts`), `arch lint`
(architectural soundness `W_*` warnings — `src/lint.ts`), `arch validate` (parse+resolve+lint, no
render; `--strict`/`--fail-on-warning` makes warnings fail too — the pipeline ship-gate), `arch new`
(scaffold), `arch repair` (the explicit opt-in source-to-source corrector — pushes furniture out
of walls and emits new `.arch` + a change log; `src/repair.ts`, see ADR 0006), `arch preview`
(render a PNG an agent can look at; opt-in `--install` fetches the optional `@resvg/resvg-js`),
`arch batch` (render many files concurrently → `{ ok, results[] }`), `arch md` (render the
` ```arch ` blocks in a Markdown file → image links; pure `src/markdown.ts`), and
`arch manifest`/`capabilities` (the whole CLI API as structured data — `src/manifest.ts`).
`describe`/`lint` share the pure analysis layer in `src/analyze.ts` (+ `src/analyze/occupancy.ts`, the
circulation flood-fill); all are exported from `src/index.ts`. This is the standard interface for AI
agents — there is intentionally no MCP server (see the README's agent section).

## Architecture & Conventions

ArchLang is a compiler pipeline. Source text → backend-neutral **Scene IR** →
backends, in stages:

```
source (.arch)
  └─ src/lexer.ts       hand-written lexer  → Token[]   (byte spans)
  └─ src/parser.ts      recursive descent   → PlanNode  (src/ast.ts); recovers, never throws
  └─ src/import.ts      link `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts          resolve(): expand scripting, grid-snap, auto-id, host openings,
                        relational placement (src/layout.ts) → ResolvedPlan
  └─ src/scene-build.ts toScene(): wall union/offset, hatches, page sizing → Scene (src/scene.ts)
  └─ src/backends/      pure serializers of the Scene:
       svg.ts (default, zero-dep) · png.ts (optional @resvg/resvg-js)
  └─ src/export/        dxf.ts (zero-dep) · pdf.ts (optional pdfkit)
  └─ src/index.ts       compile() — orchestrates the above; memoizes by source + extension id
```

- **`src/index.ts` is the only public surface.** It exports `compile(source, opts) =>
  { svg, errors, warnings, diagnostics, ast?, scene? }` plus the backends, the
  extension registry, the World seam, and the types. The `CompileResult` is
  **append-only** — add fields, never remove/rename.
- **`compile()` is pure, synchronous, and isomorphic** — no I/O, no `Date.now()`, no
  `Math.random()`. This guarantees determinism and lets it run in the browser. Do **not**
  introduce non-determinism or Node-only APIs into the `src/` core. The CLI (`src/cli.ts`)
  is the one place Node APIs and real time are allowed; everything else gets its environment
  injected through the **`World`** seam (`src/world.ts`).
- **Optional power is lazily `import()`ed.** Heavy/native deps (Clipper2 geometry, pdfkit,
  resvg) are `optionalDependencies`, loaded only at point of use, so the default SVG path
  pulls nothing. See ADRs in `docs/adr/`.
- **Errors are returned, never thrown** for user-source problems. Push a `Diagnostic` (with a
  byte `span` and an `E_*`/`W_*` `code` documented in `src/error-catalog.ts`); the parser
  recovers and reports all problems in one pass.
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered
  in `src/elements/defs.ts`. Parse/resolve/render dispatch through the registry, not a switch.
- **Coordinates are millimetres**; origin top-left, +x right, +y down (matches SVG).
- **Rendering constants** (colours, line weights, fonts) live in the theme (`src/theme.ts`)
  and the size formulas in the backends — tune there, not inline.
- **Zero runtime dependencies in the core is a feature.** Don't add a hard runtime dep;
  prefer arithmetic or an optional lazy dep.

## Gotchas & Anti-patterns

- **Don't edit `dist/` or generated files.** `dist/` is a build output. The editor grammars
  (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`) and
  `docs/error-codes.md` are generated from `src/grammar/tokens.ts` / `src/error-catalog.ts`
  — edit the source and run `npm run gen:grammars` / `npm run gen:errors` (CI fails on drift).
  Likewise `spec.llm.md` is generated from `src/grammar/tokens.ts` + `examples/` by
  `npm run gen:spec` (the curated prose lives in `scripts/gen-llm-spec.ts`); CI fails on drift.
- **Determinism is tested.** The suite asserts `compile(s) === compile(s)` byte-for-byte, with
  the optional geometry engine both present and absent. Anything that varies output across runs
  (object key order, floats, time) will fail — route number formatting through `fmt()`. The one
  opt-in output change is `compile(src, { annotate: true })` (adds `data-span` attributes for
  editor tooling); it is itself deterministic and leaves the **default** output byte-identical, so
  never emit annotation unconditionally (ADR 0007) — a test strips `data-span` and asserts equality
  with the default SVG.
- **Relational placement is deterministic, not an optimizer.** `src/layout.ts` resolves
  `right-of`/`below`/… by pure arithmetic in topological order; the absolute `at (x,y)` path
  must stay byte-identical (it is the default and has its own golden snapshots). See ADR 0004.
- **The PNG backend is Node-only and async** (resvg is a native binding); it rasterizes the SVG
  with a **bundled font** so text is deterministic. Keep `node:*` imports lazy inside the
  function so the module stays browser-safe.
- **Keep the optional-dep `import()`s bundler-safe.** The lazy `import()`s of `@resvg/resvg-js`,
  `pdfkit`, and `clipper2-wasm` carry `/* webpackIgnore: true */ /* @vite-ignore */` so a
  downstream webpack/Next.js consumer doesn't try to bundle a native `.node` binary and fail its
  build (this was the 1.0.0→1.0.1 fix). Preserve those comments on any new optional-dep import.
- **`npm run dev`** (repo root) runs `tsup --watch` (a rebuild watcher), not a web server. The
  playground/docs sites are separate Vite apps — use `npm run playground:dev` / `docs:dev`.
- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen —
  so the hinge side can flip depending on the order of a wall's points. The swing quarter-disc is
  computed once in `geometry.ts` (`doorSwing`) and shared by `door.render()` and the
  `W_SWING_OBSTRUCTED` lint rule — keep them on that one helper.
- **Fixtures draw by category, not a new element kind.** `furniture.render()` dispatches the
  category to `elements/fixtures-glyphs.ts`; a known fixture (`wc`, `basin`, `shower`, `bathtub`,
  `kitchen_sink`/`sink`, `counter`, `fridge`, `stove`…) draws a symbol and ignores its `label`,
  anything else falls back to the labelled rectangle. The lint rules key off the **room label**
  (`/bath|wc|shower/i`, `/kitchen/i`) and the **fixture category** — keep those classifiers in sync.
- **`examples/studio.arch` is import-free on purpose** (`test/world.test.ts` asserts the flagship
  compiles from a single file with no World). Use inline `furniture <fixture>` there, not imports.

## Reading Order

**To USE ArchLang (author/edit floor plans as an agent):** read `spec.llm.md` (the whole language
in one page — or run `arch spec`), then follow `SKILL.md`'s loop: `spec` → write `.arch` →
`arch compile --json` → fix from each `diagnostics[].fix` → `arch describe --json` to confirm
intent. Zero install: `npx @chanmeng666/archlang …`.

**To CONTRIBUTE (work on this repo), read in this order:**
1. `README.md` — what the project is and how to run it
2. This `AGENTS.md` — how to work in it
3. `CONTRIBUTING.md` — contribution workflow and quality gates

## Conventions for Changes

- Follow [Conventional Commits](https://www.conventionalcommits.org/).
- Run the project's lint/test commands before proposing changes.
- Keep this file up to date when you change build steps, structure, or conventions.
