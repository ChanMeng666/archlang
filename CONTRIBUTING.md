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

### Core — `@chanmeng666/archlang` (npm, via trusted publishing)

**Since v1.14.0 the npm publish is tokenless and runs in CI** (`.github/workflows/release.yml`,
OIDC trusted publishing with provenance — see the workflow's header comment). There is no npm
token anywhere; do not add one. The full transferable recipe (for this or any other repo) lives
in [docs/npm-oidc-publishing-playbook.md](docs/npm-oidc-publishing-playbook.md).

1. Update `CHANGELOG.md` and bump `version` in the root `package.json`.
2. `npm run build && npm test` must be green (they also run inside the publish via
   `prepublishOnly`).
3. Commit, push, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag push triggers
   `release.yml`, which publishes the core, then the MCP shim (if its version moved), then syncs
   the MCP registry — each step skips versions already on its registry, so re-running a partial
   failure is safe (`gh workflow run release.yml` re-dispatches).

> **Provenance gotcha:** npm rejects the publish (E422) if `package.json`'s
> `repository.url` casing differs from the real repo — it must say
> `github.com/ChanMeng666/archlang` (owner casing byte-exact), not `chanmeng666`.

> **One-time npmjs setup (already done for both packages):** each published package carries a
> Trusted Publisher registration on npmjs.com pointing at `ChanMeng666/archlang` +
> `release.yml`. Creating/changing that registration — like all token/maintainer/account
> management — is an interactive human-with-2FA operation by npm policy (token-based bypass of
> these is being retired through 2026–2027); agents cannot and should not automate it.

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

### MCP server — `@chanmeng666/archlang-mcp` (npm + MCP registry, via the same workflow)

The optional stdio shim in `packages/mcp/` is a **separately versioned** package, published
**after** the core it wraps — and since 0.2.0 the whole chain rides the same `release.yml`:

1. Bump `version` in `packages/mcp/package.json` **and** `packages/mcp/server.json` (they must
   match; also the `McpServer` constructor's version string in `src/server.ts`), and bump its
   `@chanmeng666/archlang` dependency range if the core moved.
2. The tag-triggered `release.yml` run publishes it to npm (OIDC + provenance) right after the
   core, then syncs the MCP registry with `mcp-publisher login github-oidc` → `publish` — also
   tokenless. The registry-sync step is guarded by the registry's own state, so an
   npm-succeeded/registry-failed partial run is recoverable by re-running the workflow.
3. Manual fallback (local): `npm run mcp:build`, `npm publish -w packages/mcp`, then from
   `packages/mcp/`: `mcp-publisher login github` (interactive device flow; CLI lives outside the
   repo, e.g. `D:\mcp-publisher\`) → `mcp-publisher publish`.

> **Three registry pitfalls** (they cost a same-day `0.1.0` → `0.1.1` republish): the
> `io.github.<Owner>/*` namespace is **case-sensitive** and the owner segment must match your
> GitHub login byte-for-byte (`io.github.ChanMeng666/…`); the registry **exact-matches** the npm
> package's **`mcpName`** field against `server.json`'s `name`; and the server **`description` is
> capped at 100 chars**. Any mismatch is rejected at publish.

### Dataset — `ChanMeng666/archlang-repair-trajectories` (Hugging Face)

The synthetic repair-trajectory + authoring dataset (roadmap Tranche 5) is generated by the in-repo
`dataset/` generator and published to Hugging Face under CC0-1.0. It is **repo tooling, not a
package** — no version bump of its own; it pins `archlang_version`.

**When to touch it.** A **language/core release that changes generated output** (anything that would
alter a compiled plan, its diagnostics, or `describe()` facts) means a new `archlang_version`:

1. Regenerate at the pinned seed: `npm run dataset:gen` (defaults `--repair-rows 1200
   --authoring-rows 400 --seed 20260712`).
2. Verify: `npm test` — the contamination/determinism guard `test/dataset.test.ts` must stay green.
3. Bump `archlang_version` in `dataset/CARD.md` to the new core version.
4. Re-upload the three artifacts **and** the card (below).

A **card-only edit** (prose, links) re-uploads `README.md` alone.

**Upload** is the owner's manual step via the `hf` CLI — logged in as the owner; **no tokens in the
repo**, no automation. Use the **canonical `ChanMeng666` namespace casing** (the owner segment is
identity-checked, same class of lesson as npm provenance / the MCP registry):

```bash
hf upload ChanMeng666/archlang-repair-trajectories dataset/out/repair.jsonl    repair.jsonl    --repo-type dataset
hf upload ChanMeng666/archlang-repair-trajectories dataset/out/authoring.jsonl authoring.jsonl --repo-type dataset
hf upload ChanMeng666/archlang-repair-trajectories dataset/out/report.json     report.json     --repo-type dataset
hf upload ChanMeng666/archlang-repair-trajectories dataset/CARD.md             README.md       --repo-type dataset   # card uploads AS README.md
```

The card's `task_categories` must come from HF's official list (`text-generation`, **not**
`text2text-generation` — the upload warns on an off-list value).

**Two permanent rules** (see `dataset/README.md` and
[ADR 0013](docs/adr/0013-repair-trajectory-dataset.md)): the canary GUID in `dataset/canary.ts` is
**never regenerated** (a new value silently splits the corpus and defeats leakage probing), and the
private eval holdout (`eval/corpus.json` + goldens) is **never published** — the public corpus is
generated independently and deduplicated against it, enforced permanently by `test/dataset.test.ts`.

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
