# AGENTS.md

This file provides project guidance to AI coding assistants (Claude Code, GitHub Copilot, Cursor,
Codex, etc.) working with this repository. Read it before writing or changing any code.

**This is the short entry point; detail lives in `docs/agents/`, read on demand via the index
below.** A new project fact goes in exactly ONE place: here only if it binds nearly every task.
`CLAUDE.md` is the Claude Code operating brief and asserts no fact of its own.

## Project Overview

ArchLang — A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

- **Primary language / stack:** TypeScript (Node 18+; the core also runs in the browser)
- **Default branch:** `main`
- **Repository:** https://github.com/ChanMeng666/archlang

**Shipped and launched** — a published, deployed npm-workspaces monorepo. Never quote a version or
test count from a doc: probe npm, `git ls-remote --tags origin`, `gh release list`; `CHANGELOG.md`
is the canonical release notes.

## Commands

```bash
npm install          # bootstraps ALL workspaces
npm run build        # core library + CLI into dist/
npm test             # whole vitest suite
npm run cli -- compile examples/studio.arch -o studio.svg
npm run check        # typecheck + lint + test-wiring + test (pre-push gate)
npm run check:drift  # fail if any generated artifact drifted (CI gate)
npm run typecheck:all  # incl. workspaces; `npm run build` FIRST
npm run docs:build   # after any docs/*.md edit
npm run gen:all      # every gen:* generator
```

Everything else (`gen:*`, `e2e:*`, `eval:*`, CI map, CLI contract): `docs/agents/commands.md`.

## Rules that bind every task

- **`compile()` is pure and deterministic** — no I/O, time, randomness or Node APIs in `src/`
  outside `src/cli*`; errors returned, never thrown; zero runtime deps. → `architecture.md`
- **Never hand-edit `dist/` or a generated file** — edit the source, run `gen:*`. → `gotchas.md`
- **Never bless a golden/snapshot to green a suite**; every new language form ships a byte-identity
  law. → `iron-laws.md`
- **Releases are tokenless OIDC only** (`v*` tag push). Never add an npm token or automate npmjs
  account/2FA management. Pushing `main` deploys the docs site. → `iron-laws.md`
- **Eval & dataset:** T3 live run declined forever; `eval:live` is paid, owner-only; holdout never
  published, canary never regenerated. → `iron-laws.md`
- **Brand & sites:** logo master byte-sacred; both sites LIGHT, no dark mode. → `sites.md`
- **No secrets** (tokens, account ids) in this public repo.

## Where things live

`src/` core (`index.ts` = public surface; `cli.ts`+`cli/` = CLI) · `test/` · `examples/` ·
`docs/` (`adr/`, `research/`, `testing.md`) · `docs-site/` · `playground/` · `packages/mcp/` ·
`editors/vscode/` · `eval/` · `dataset/` · `scripts/` · `brand/` · agent context: `SKILL.md`,
`spec.llm.md`, `llms*.txt`, `schemas/`, `grammars/`.

## Index of agent docs (`docs/agents/`) — read when …

| File | Read when … |
|------|-------------|
| `project-status.md` | releasing; touching MCP shim, VS Code extension, dataset, SEO |
| `iron-laws.md` | any design change, new language form, derived geometry, eval/dataset/release/hosting/brand |
| `architecture.md` | changing `src/`; adding an element/format/generator; finding a module |
| `commands.md` | any other script, CI jobs, the CLI contract |
| `gotchas.md` | before changing code (entries tagged by area) |
| `sites.md` | touching `docs-site/`, `playground/`, `brand/` |
| `verification.md` | proving a change works before calling it done |
| `../testing.md` | adding a test, updating a pin, a red guard |

## Reading Order

**To USE ArchLang (author/edit floor plans as an agent):** read `spec.llm.md` (the whole language
in one page — or run `arch spec`), then follow `SKILL.md`'s loop: `spec` → write `.arch` →
`arch compile --json` → fix from each `diagnostics[].fix` → `arch describe --json` to confirm
intent. Zero install: `npx @chanmeng666/archlang …`.

**To CONTRIBUTE (work on this repo), read in this order:**
1. `README.md` — what the project is and how to run it
2. This `AGENTS.md` — how to work in it
3. `CONTRIBUTING.md` — contribution workflow and quality gates
4. `docs/testing.md` — the verification system: what runs locally, on a PR and nightly, what each
   guard enforces, and what to do when one goes red (read before adding a test or updating a pin)

## Conventions for Changes

- Follow [Conventional Commits](https://www.conventionalcommits.org/).
- Run the project's lint/test commands before proposing changes.
- Keep this file and `docs/agents/` current when build steps, structure or conventions change.
- Release narrative and work history go in `CHANGELOG.md` **only** — never re-grow per-release prose
  here or in `docs/agents/project-status.md`, and no per-session work logs under `docs/`. (Re-grown
  and archived twice; archives in `archcanvas-growth/archive/archlang/docs-archive/`.)
- **`AGENTS.md` + `CLAUDE.md` load every session: 10,000 bytes together is a hard budget**
  (`wc -c AGENTS.md CLAUDE.md`). New detail goes in `docs/agents/` with an index row.
