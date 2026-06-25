# AGENTS.md

This file provides project guidance to AI coding assistants (Claude Code, GitHub Copilot, Cursor,
Codex, etc.) working with this repository. Read it before writing or changing any code.

## Project Overview

ArchLang — A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

- **Primary language / stack:** Node.js / JavaScript
- **Default branch:** `main`
- **Repository:** https://github.com/chanmeng666/archlang

## Commands

```bash
npm install          # install dev dependencies (the library has ZERO runtime deps)
npm run build        # build library + CLI into dist/ (tsup)
npm run typecheck    # tsc --noEmit
npm test             # run the vitest suite (test/compile.test.ts)
npm run cli -- compile examples/studio.arch -o studio.svg   # run the CLI from source via tsx
npm run bench        # compile a generated ~1000-element plan and report per-stage timings

# Playground (Vite + CodeMirror 6); consumes the built dist/:
npm run build && npm install --prefix playground && npm run dev --prefix playground
```

## Architecture & Conventions

ArchLang is a classic compiler pipeline. Source text → drawing, in stages:

```
source (.arch)
  └─ src/lexer.ts     hand-written lexer  → Token[]   (tracks line/col)
  └─ src/parser.ts    recursive descent   → PlanNode  (src/ast.ts)
  └─ src/validate.ts  grid-snap, auto-id, semantic checks (errors/warnings)
  └─ src/geometry.ts  pure vector math: wall offsetting, bounds, opening hosting
  └─ src/render.ts    PlanNode → SVG string (poché, doors, dims, north, scale, title)
  └─ src/index.ts     compile() — orchestrates the above; memoizes by source
```

- **`src/index.ts` is the only public surface.** It exports `compile(source, opts) =>
  { svg, errors, warnings, ast? }` plus the types. Keep the contract stable.
- **`compile()` is pure, synchronous, and isomorphic** — no I/O, no `Date.now()`, no
  `Math.random()`. This is what guarantees determinism and lets it run in the browser.
  Do **not** introduce non-determinism or Node-only APIs into the `src/` core (the CLI in
  `src/cli.ts` is the only place that touches `node:fs`).
- **Errors are returned, never thrown** for user-source problems. Add new diagnostics by
  pushing to `errors`/`warnings` in `validate.ts` (or returning them from the parser),
  always with a `line` when known.
- **Coordinates are millimetres**; origin top-left, +x right, +y down (matches SVG).
- **Rendering constants** (colours, line weights, fonts) live in the `THEME` object and the
  size formulas at the top of `render(...)` in `src/render.ts` — tune there, not inline.
- **Zero runtime dependencies is a feature.** Don't add a runtime dep without strong reason;
  prefer a few lines of arithmetic (see `src/geometry.ts`).

## Gotchas & Anti-patterns

- **Don't edit `dist/`** — it's a build output. Rebuild with `npm run build`. The playground
  imports the built `dist/` (via a Vite alias), so rebuild the core after changing `src/`.
- **Determinism is tested.** `test/compile.test.ts` asserts `compile(s) === compile(s)`
  byte-for-byte. Anything that varies output across runs (object key order, floats, time)
  will fail — keep number formatting going through the `fmt()` helper in `render.ts`.
- **`npm run dev`** (repo root) runs `tsup --watch` (a rebuild watcher), not a web server. The
  playground is a separate Vite app — run `npm run dev --prefix playground` for its dev server.
- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen —
  so the hinge side can flip depending on the order of a wall's points. Expected for v0.1.

## Reading Order

When onboarding to this repo, read in this order:
1. `README.md` — what the project is and how to run it
2. This `AGENTS.md` — how to work in it
3. `CONTRIBUTING.md` — contribution workflow and quality gates

## Conventions for Changes

- Follow [Conventional Commits](https://www.conventionalcommits.org/).
- Run the project's lint/test commands before proposing changes.
- Keep this file up to date when you change build steps, structure, or conventions.
