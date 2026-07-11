# Contributing to ArchLang

Thank you for your interest in contributing! This guide explains how to get involved.

## How to Contribute

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/chanmeng666/archlang/issues/new/choose) with:

- Steps to reproduce the problem
- Expected vs. actual behavior (screenshots or logs help)
- Your environment (OS, and relevant runtime/version)

### Suggesting Features

Have an idea? [Open a feature request](https://github.com/chanmeng666/archlang/issues/new/choose) describing the problem you want to solve and your proposed solution.

### Submitting Changes

1. **Fork** the repository and **clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/archlang.git
   cd archlang
   ```
2. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and verify them locally (see Development Setup below).
4. **Commit** with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: short description of your change"
   ```
5. **Push** and open a Pull Request against the `main` branch.

## Development Setup

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Production build
npm run build

# Run the test suite
npm test
```

## Releasing

Several artifacts ship from this repo and are **released separately** — don't let them drift: the
core npm package, the VS Code extension, and (as of v1.13) the optional MCP server.

### Core — `@chanmeng666/archlang` (npm)

1. Update `CHANGELOG.md` and bump `version` in the root `package.json`.
2. `npm run build && npm test` must be green.
3. `npm publish` (manual), then tag: `git tag vX.Y.Z && git push --tags`.

Pushing to `main` auto-deploys the playground and docs sites (Vercel) — no manual step.

### VS Code extension — `ChanMeng.archlang` (Marketplace)

**The extension bundles the core at build time** (esbuild, `--no-dependencies`), so a core
release does **not** reach extension users until the extension is rebuilt and republished.
**Whenever a core change touches the language surface** — grammar/keywords, completion, hover,
diagnostics, or error/lint codes — republish the extension so its bundled services stay current:

1. Bump `version` in `editors/vscode/package.json` and add an entry to
   [`editors/vscode/CHANGELOG.md`](editors/vscode/CHANGELOG.md).
2. If the core moved, bump the `@chanmeng666/archlang` dev-dependency pin there to match.
3. `npm run build --prefix editors/vscode` then
   `npm run package --prefix editors/vscode` (`vsce package --no-dependencies`) → a `.vsix`.
4. Upload the `.vsix` at
   <https://marketplace.visualstudio.com/manage/publishers/ChanMeng> (web upload; there is no
   Azure DevOps org / CI publish for the extension).

> Rule of thumb: **if you changed `src/grammar/tokens.ts`, the language services in
> `src/lsp.ts`, or the error/lint catalogs, the extension is stale until you republish it.**

A repack can also be **non-language** — the icon, `galleryBanner`, or other marketplace metadata
(e.g. `0.4.1` was an icon-only repack of `0.4.0`). Same steps 1–4 above (skip step 2 when the core
did not move); the `.vsix` still needs a manual web upload.

> **Editor syntax colors are generated, not hand-authored.** The live-editor highlight palette
> flows through `scripts/gen-grammars.ts` → `playground/src/arch-language.js` as
> `var(--syn-<name>, <fallback>)`, with the on-carbon values in `playground/src/styles/editor.css`.
> To recolor: edit the generator template or the `--syn-*` values and run `npm run gen:grammars`;
> never hand-edit `arch-language.js` (CI fails on drift).

### MCP server — `@chanmeng666/archlang-mcp` (npm + MCP registry)

The optional stdio shim in `packages/mcp/` is a **separately versioned** package (it starts at
`0.1.x`, independent of the core). Publish it **after** the core it wraps:

1. `npm run mcp:build` (builds the core first, then the shim + copies the resource files).
2. Bump `version` in `packages/mcp/package.json` **and** `packages/mcp/server.json` (they must
   match), then `npm publish -w packages/mcp`.
3. Submit to the official registry from `packages/mcp/`:
   `mcp-publisher login github` → `mcp-publisher publish` (the CLI lives outside the repo, e.g.
   `D:\mcp-publisher\`). This validates `server.json` against the published npm package.

> **Three registry pitfalls** (they cost a same-day `0.1.0` → `0.1.1` republish): the
> `io.github.<Owner>/*` namespace is **case-sensitive** and the owner segment must match your
> GitHub login byte-for-byte (`io.github.ChanMeng666/…`); the registry **exact-matches** the npm
> package's **`mcpName`** field against `server.json`'s `name`; and the server **`description` is
> capped at 100 chars**. Any mismatch is rejected at publish.

### Live authorability eval (optional, gated)

The offline `npm run eval:ci` (26 golden briefs, no API key) runs in CI. To re-measure against a
real model, run the guarded live harness:

```bash
npm run eval:live -- --yes    # needs OPENAI_API_KEY; writes eval/results.live.md + a delta vs eval/live-baseline.json
```

It is also wired as the `workflow_dispatch` workflow `.github/workflows/eval-live.yml` (uses the
repo secret `OPENAI_API_KEY`). Two further guarded, paid harnesses live beside it (same `--yes`
guard and key handling; details in `eval/README.md`), each with its own `workflow_dispatch`
workflow: `npm run eval:g1` (Gate G1 intent generation — already run, PASSED; kept for
reproducibility) and `npm run eval:l2` (the T3 L2 loop-vs-equal-budget-resampling experiment —
not yet run). **Harness gotcha:** reasoning models spend thinking tokens out of
`max_completion_tokens` — the cap in `eval/run.ts` is 16384 (a 4096 cap truncated `gpt-5.5` into
bogusly-low scores); suspect the token budget before the language if a new model scores implausibly
low.

### CI drift gates (regenerate before you push)

Beyond the existing grammar/errors/spec/llms gates, three generators are now drift-checked in CI —
regenerate and commit their output whenever their source changes:
`npm run gen:llms` (`llms-full.txt`), `npm run gen:gbnf` (`grammars/archlang.gbnf`),
`npm run gen:plan-schema` (`schemas/plan.schema.json`).

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). For questions or
support, see [SUPPORT.md](SUPPORT.md). For security issues, see [SECURITY.md](SECURITY.md).
