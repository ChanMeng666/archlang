# AGENTS.md

This file provides project guidance to AI coding assistants (Claude Code, GitHub Copilot, Cursor,
Codex, etc.) working with this repository. Read it before writing or changing any code.

## Project Overview

ArchLang — A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

- **Primary language / stack:** TypeScript (Node 18+; the core also runs in the browser)
- **Default branch:** `main`
- **Repository:** https://github.com/ChanMeng666/archlang

## Project status & where things live (current)

**ArchLang is shipped and launched (v1.1.0).** This is a published, deployed monorepo —
not a work-in-progress. Treat the live artifacts below as the source of truth.

| Thing | Current | Where |
|-------|---------|-------|
| **Core package** | `@chanmeng666/archlang@1.1.0` (published, `latest`) | npmjs.com/package/@chanmeng666/archlang |
| **Agent interface** | the `arch` **CLI** (`--json`, exit codes, stdin) + `SKILL.md` + `spec.llm.md` — **no MCP** | `src/cli.ts`, `SKILL.md`, `spec.llm.md` |
| **VS Code extension** | `ChanMeng.archlang@0.2.0` (published, live) | marketplace.visualstudio.com/items?itemName=ChanMeng.archlang |
| **Playground** | deployed | https://archlang-playground.vercel.app |
| **Docs site** | deployed (VitePress) | https://archlang-docs.vercel.app |
| **Git** | `main`, tags `v1.0.0` → `v1.1.0` (latest) | github.com/ChanMeng666/archlang |
| **Tests** | 371 passing (41 files); typecheck + build clean | — |

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

Key `src/` modules added in v1.1 (all pure, exported from `src/index.ts`): `describe.ts`
(semantic summary), `lint.ts` (architectural soundness rules), `analyze.ts` (shared resolve
pipeline + rectilinear geometry behind both). The agent-facing CLI lives in `src/cli.ts`.

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
render), and `arch new` (scaffold). `describe`/`lint` share the pure analysis layer in
`src/analyze.ts`; all are exported from `src/index.ts`. This is the standard interface for AI agents
— there is intentionally no MCP server (see the README's agent section).

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
  (object key order, floats, time) will fail — route number formatting through `fmt()`.
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
  so the hinge side can flip depending on the order of a wall's points.

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
