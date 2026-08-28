# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

The **canonical, always-current** project status, architecture, commands, and conventions live in
**[AGENTS.md](AGENTS.md)** — read it first. It is imported below so it loads with this file; for the
exact shipped state and versions, defer to AGENTS.md → "Project status" and `CHANGELOG.md` rather
than memory.

@AGENTS.md

## Orientation (the rest is in AGENTS.md)

- **What this is:** ArchLang — a small declarative language that compiles `.arch` floor-plan source
  to professional **SVG** (also DXF/PDF/PNG). Pure TypeScript, **zero runtime dependencies**,
  isomorphic (runs in Node and the browser). A published, deployed monorepo, not a WIP.
- **Build & run:** `npm run build` · `npm test` (vitest) ·
  `npm run cli -- compile examples/studio.arch -o out.svg`. A single root `npm install` bootstraps
  every workspace.
- **Brand:** the logo is an "A" drawn as an A-frame house floor plan.
  `brand/archlang-logo-master.svg` is the byte-sacred source — every variant is a **fill-swap only**
  (never re-trace/simplify/re-fit path data, no small-size tier). The two public sites run the shared
  **"The Compile Boundary"** design system — a cool source surface and a warm sheet surface split by a
  compile seam, **both LIGHT: there is no dark mode and no dark surface on either site**. Its token
  block is **duplicated byte-identically** in `docs-site/.vitepress/theme/style.css` and
  `playground/src/styles/tokens.css` (change one, change the other). See
  [ADR 0014](docs/adr/0014-one-light-world.md) — which supersedes
  [ADR 0010](docs/adr/0010-compile-boundary-design-system.md) §1/§2/§6/§7, so read 0010's carbon/mylar
  prose as history — and `brand/README.md` first.

## Non-negotiable invariants (break these and CI fails)

- **`compile()` is pure, synchronous, deterministic.** No I/O, no `Date.now()`, no `Math.random()`
  in `src/` core; output is byte-for-byte stable and snapshot/golden-tested. Node APIs and real time
  are allowed **only** in `src/cli.ts` + `src/cli/`; everything else gets its environment via the `World` seam.
  Route number formatting through `fmt()` so floats don't drift. The parse-stage memo's `PlanNode`
  is shared and must never be mutated downstream — clone before mutating (a `repair()` in-place edit
  made output history-dependent; fixed in `51a47ee`).
- **Don't hand-edit generated files.** `dist/`, `editors/*.tmLanguage.json`,
  `playground/src/arch-language.js`, `docs-site/.vitepress/theme/arch-highlight.js`,
  `docs/error-codes.md`, `docs/cli-reference.md`, `spec.llm.md`,
  `llms-full.txt`, `schemas/plan.schema.json`, `schemas/intent.schema.json`,
  `grammars/archlang.gbnf`, and the twenty committed `examples/*.svg` the README embeds (the
  `README_SVGS` list in `scripts/gen-example-svgs.ts`) are generated — edit the source
  (`src/grammar/tokens.ts`, `src/error-catalog.ts`, `src/manifest.ts`, `PLAN_JSON_SCHEMA`,
  `INTENT_JSON_SCHEMA`, `examples/`, `SKILL.md`) and run the matching `npm run gen:grammars` /
  `gen:errors` / `gen:cli` / `gen:spec` / `gen:llms` / `gen:plan-schema` / `gen:intent-schema` /
  `gen:gbnf` / `gen:example-svgs`. CI fails on drift. The SVGs joined this list late and are the
  clearest case for it: hand-committed and never re-rendered, three of them showed the README a
  building compiled before four separate rendering fixes, and nothing was watching.
- **A generator's TEMPLATE can go stale even when `check:drift` is green.** The gate compares
  generator *output* to the committed file — it proves reproducibility, not correctness. A generator
  that hardcodes a language fact reproduces the same *wrong* text forever: `gen-llm-spec.ts` shipped a
  v1.12 CLI + no `strip` for three releases, and `gen-grammars.ts` hardcoded a number regex without the
  unit suffixes. **Derive from the source of truth (`KEYWORDS`/`RULES`/`buildManifest()`), never
  retype it**, and give each generator a guard that fails when a source-of-truth entry has no
  rendering (as `gen-llm-spec.ts` now does for every `KEYWORDS.control` entry, not just `element`).
- **A derived POSITION comes from the shape, never from its bounding box or centroid.** Six silent
  bugs shipped this way and were fixed in v1.25.0 — a label drawn off its own floor, a walk reported
  at half its true length, witness lines hanging metres off a sloped facade, a door swung into a wall
  its room does not touch, a fixture backed onto a wall outside its room, and every courtyard-wall
  window facing backwards. **`arch lint` reported none of them.** The grep that finds the next one is
  `room.size`/`r.size.w` with no nearby `r.poly` branch. Fix locally and in closed form — probe one
  wall thickness off each face and ask which side has floor — and never reach for the wall boolean
  union to answer a `describe()` question. Inventory: `docs/research/2026-08-06-competitor-borrowing-roadmap.md` §9.1.
- **Every new language form ships with a byte-identity law, pinned by test:** a plan that does not
  use it renders, describes and lints exactly as before. `site`, the door kinds, `zone`, `paper`,
  `polygon`, `arc`, `roof` and `void` all have one. Prove it with a SHA-256 sweep over the shipped
  examples, not by eyeballing — and if a golden moves, that is a finding to explain before it is a
  diff to bless. Take the baseline with the **same digest body the test will run**, not a lookalike
  in a throwaway script: `test/roof-void-byte-identity.test.ts`'s first attempt used a scratch script
  whose payload separator differed by one character and produced four "failures" over artifacts that
  were in fact byte-identical. And the sweep's payload is the whole agent-facing surface — SVG,
  `describe()` **and** `lint()` — because a form that quietly appends an empty key to every summary
  leaves the drawing untouched and is still a behaviour change for every `arch describe --json`
  consumer.
- **A drawn fixture symbol ignores its `label`, and fixture categories are DATA, not keywords.** The
  96 catalogued words across 57 families live in one `FIXTURE_FAMILIES` table
  (`src/elements/fixtures-glyphs.ts`) with their semantics in `src/fixtures-catalog.ts`; an
  uncatalogued word falls back to the labelled rectangle on purpose. Adding a family is a table row
  and a catalog entry — never a new element, never a `switch` arm. Keep the three catalog flags
  distinct: `requiresWall` means **services only**, `directional` means the symbol has a back worth
  turning to a wall, and `underlay` (a piece that lies flat and is stood on) is read **only** through
  the shared `solidFurniture()` predicate, so the overlap rule, the clearance rule, the nav grid and
  the per-room flood fill cannot disagree about what a rug is.
- **Errors are returned, never thrown** for user-source problems: push a `Diagnostic` with a byte
  `span` and a catalogued `E_*`/`W_*` code (`src/error-catalog.ts` — a test enforces every raised
  code has an entry and vice-versa).
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered in
  `src/elements/defs.ts`. Dispatch goes through the registry, not a switch.

## Verify your work the way the tool is used

After a change, prove it through the CLI, not by eyeballing SVG:
`arch compile --json` (renders, errors-as-data) · `arch describe --json` (rooms, areas, adjacency,
door connections) · `arch lint --json` (architectural soundness). For the v1.13 authoring loop also
drive `arch fix --dry-run` (preview the machine-applicable diagnostic fixes), `arch suggest`
(advisory door/window statements as data), `arch validate --graph` (interior-door adjacency vs. an
intended graph), and `arch compile -f txt` (the zero-dep ASCII plan — a text-only look with no
raster binary). For the v1.14–v1.15 additions also drive `arch validate --intent <f>` (gate a plan on
a brief's intent contract, exit 2 on a gating miss) / `arch score --brief <f>` (the continuous
intent-satisfaction meter), and read `arch describe --json`'s `freedom` block (which element positions
are hand-authored vs resolver-derived) before nudging coordinates. For the v1.17 CLI surface, drive
the affordances an agent actually reaches for: `arch <cmd> --help` (manifest-rendered flags + worked
examples — if you are guessing a flag, ask the CLI instead), the narrowing reads `arch describe
--select <keys>` / `--room <ids>` and `arch lint|validate --code <CODE>` / `--severity <sev>`, `arch
context --section <spec|workflow|cli|errors>`, and `arch fix --dry-run` (which now prints the exact
unified diff it would write) / `--backup`. Two invariants to prove, not assume, whenever you touch
that layer: **a display filter must never change an exit code or `ok`** (they come from the unfiltered
diagnostic set), and **an unrecognized flag or verb must exit 3** with a did-you-mean — never be
swallowed as a filename. For the v1.25 surface, drive `arch describe --json --select site` (the five
derived direction names — `street`/`back`/`equator_side`/`sunrise_side`/`sunset_side`; they are a
**drafting heuristic for an aspect, not a daylight measurement**, and there is deliberately no sun
model, latitude or date), the door kinds (`door pocket … slide left`, and note `describe().doors[].kind`
appears only when it is not the default `hinged`), and `arch lint --code W_POCKET_RUN|W_DIM_OVERLAP`
with `arch fix --dry-run` for their machine fixes. For the v1.28–v1.29 surfaces, drive the three
things a reading cannot settle: **`arch describe --json --select voids`** (a `void` is reported with
its extent and its room but is deliberately NOT subtracted from that room's area — a consumer
needing the net figure subtracts, so never "fix" the area); the **roof refusals**, which are the
whole design (`arch lint --code E_ROOF_CURVED` / `arch explain E_ROOF_CURVED` — an `arc` edge is
refused rather than approximated, and `roof polygon` is the answer); and the **underlay walkability
check**, which is the one furniture claim a drawing cannot show — put a `rug` and then a `sofa` on
the same rectangle across a plan's only route and confirm `arch describe --json`'s circulation walks
THROUGH the first and `arch lint` raises `W_ROOM_NO_CLEAR_PATH` on the second. Keep the flagship
`examples/studio.arch` **lint-clean and import-free**, and update snapshots/goldens
(`vitest -u`, `UPDATE_GOLDENS=1 vitest run test/visual.test.ts`, `ASCII_UPDATE=1 vitest run
test/ascii.test.ts`) only after reviewing the diff — never to green a red suite.

Beyond the CLI, prove the surfaces the core suite does not compile. `npm run check` +
`npm run check:drift` is the floor; add **`npm run typecheck:all`** when you touch anything outside
`src/`+`test/` (it is the only thing that compiles the playground, docs-site, MCP shim and VS Code
extension), **`npm run docs:build`** for any `docs/*.md` edit, and **`npm run e2e:playground` /
`npm run e2e:docs`** (Playwright, against the BUILT sites — build the core first) when you touch
those apps. Prose is gated too: `test/docs-table-pipes.test.ts` scans every tracked `.md` for a bare
`|` inside inline code in a table cell (write `\|`), `test/docs-fences.test.ts` requires every
```` ```arch ```` fence on a published page to compile or carry `static`, and
`test/docs-flags.test.ts` checks that every `arch … --flag` you write in a hand-maintained doc is a
flag that command declares. **The whole verification system — tiers, guards, and the red-run
response for each — is mapped in [docs/testing.md](docs/testing.md).**

## Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/). Run the lint/test commands
before proposing changes. Commit or push only when asked. Keep AGENTS.md and this file accurate when
you change build steps, structure, or conventions.
