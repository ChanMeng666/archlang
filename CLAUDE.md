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
  **"The Compile Boundary"** design system (source-world dark / sheet-world paper, split by a compile
  seam); its token block is **duplicated byte-identically** in `docs-site/.vitepress/theme/style.css`
  and `playground/src/styles/tokens.css` (change one, change the other). See
  [ADR 0010](docs/adr/0010-compile-boundary-design-system.md) and `brand/README.md` first.

## Non-negotiable invariants (break these and CI fails)

- **`compile()` is pure, synchronous, deterministic.** No I/O, no `Date.now()`, no `Math.random()`
  in `src/` core; output is byte-for-byte stable and snapshot/golden-tested. Node APIs and real time
  are allowed **only** in `src/cli.ts` + `src/cli/`; everything else gets its environment via the `World` seam.
  Route number formatting through `fmt()` so floats don't drift. The parse-stage memo's `PlanNode`
  is shared and must never be mutated downstream — clone before mutating (a `repair()` in-place edit
  made output history-dependent; fixed in `51a47ee`).
- **Don't hand-edit generated files.** `dist/`, `editors/*.tmLanguage.json`,
  `playground/src/arch-language.js`, `docs/error-codes.md`, `spec.llm.md`, `llms-full.txt`,
  `schemas/plan.schema.json`, and `grammars/archlang.gbnf` are generated — edit the source
  (`src/grammar/tokens.ts`, `src/error-catalog.ts`, `PLAN_JSON_SCHEMA`, `examples/`, `SKILL.md`) and
  run the matching `npm run gen:grammars` / `gen:errors` / `gen:spec` / `gen:llms` /
  `gen:plan-schema` / `gen:gbnf`. CI fails on drift.
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
are hand-authored vs resolver-derived) before nudging coordinates. Keep the flagship
`examples/studio.arch` **lint-clean and import-free**, and update snapshots/goldens
(`vitest -u`, `UPDATE_GOLDENS=1 vitest run test/visual.test.ts`) only after reviewing the diff.

## Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/). Run the lint/test commands
before proposing changes. Commit or push only when asked. Keep AGENTS.md and this file accurate when
you change build steps, structure, or conventions.
