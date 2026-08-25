---
description: Pre-release checklist (run before pushing a v* tag)
---

# Release check

Walk this checklist before pushing a `v*` tag. Report each item as pass/fail with the evidence
you observed. Do NOT push anything — this command only verifies.

## Checklist

1. **Establish the TRUE latest release before anything else — MANDATORY FIRST STEP.** Never take the
   current version from AGENTS.md, a plan doc, or the prompt. Probe all four:

   ```bash
   npm view @chanmeng666/archlang version      # what is actually on the registry
   git tag --sort=-v:refname | head            # what is actually tagged
   gh release list --limit 3                   # what actually has a Release
   grep -m3 '^## ' CHANGELOG.md                # the top heading(s)
   ```

   Then require both:
   - the target version is **strictly greater** than every one of those (an npm version is
     immutable — a target that already exists cannot be published, only skipped); and
   - its **semver class matches what actually changed** — read `git log <lasttag>..main` and
     `git diff --stat <lasttag>..main`, not the plan's number. New grammar/keyword, new `E_*`/`W_*`
     code, new public field ⇒ MINOR at least.

   If AGENTS.md disagrees with the probe, **AGENTS.md is wrong** — fix it (item 5) and carry on.
   *(2026-07-25: AGENTS.md sat stale at v1.17.0 while v1.18.0 was already published, so an approved
   plan targeted 1.18.0; the batch actually shipped as 1.19.0.)*

2. **Versions consistent where they must be.**
   - Root `package.json` `version` matches the latest entry heading in `CHANGELOG.md`.
   - **Ask whether the shim changed — don't assume:**
     `git diff <lasttag>..main -- packages/mcp`. **ANY** mcp-visible change forces the double
     version bump, including prose: a tool description, the README (it is the npm package page),
     or a `server.json` field like `websiteUrl`. The bump must land in **both**
     `packages/mcp/package.json` **and** `packages/mcp/server.json` (**both** of its `version`
     fields) — `release.yml` `npm view`-skips a version already on the registry, so an unbumped
     edit silently never reaches npm or the MCP registry.
   - The shim's core dependency range (`^1.x`) still satisfies the new core version. (The shim need
     NOT bump when only the core changes, the diff above is empty, and its dep range already covers
     the new version — e.g. core 1.15.0 with the shim at 0.2.0 depending on `^1.14.0`.)

3. **CHANGELOG.md has an entry for the new version** with the actual changes (not an empty
   `Unreleased` block). Confirm the Release body extracts:
   `node scripts/changelog-section.mjs <version>` must exit 0 with the section body.

4. **`package.json` `repository.url` owner casing is byte-exact `ChanMeng666`.** npm provenance
   fails with `E422` if the owner segment casing differs from the real repo — this has already
   cost a same-day re-tag. Confirm it reads `github.com/ChanMeng666/archlang`, not `chanmeng666`.

5. **AGENTS.md status table is updated** — the "Project status" table's version column, the tests
   count, the tags row, **and the "Latest release:" line** reflect the version being released. That
   line is the one that goes stale (it claimed v1.17.0 through two releases) and it is what the next
   agent will read as truth.

6. **Gates green.**
   - `npm run check` — typecheck + lint + tests all pass.
   - `npm run check:drift` — all nine generated artifacts are in sync with their sources. This is
     a hard CI gate (`.github/workflows/ci.yml`) and it is separate from `npm run check`, which
     does **not** run it. It is the gate that catches a `src/manifest.ts` edit whose
     `docs/cli-reference.md` was never regenerated — the single most common way a release goes red.
   - `npm run typecheck:all` — the four workspaces typecheck too (CI's `builds` job).
   - `npm run docs:build` — the docs site still builds (the core suite does not compile it).
   - **Confirm the PR gates for the release commit are green on GitHub** —
     `gh run list --branch main --limit 5` / `gh run view <id>`. `ci.yml` alone has five gating
     jobs and `codeql.yml` a sixth; a green local `npm run check` is a subset of them, not a
     substitute. What each job catches: `docs/testing.md` §1.

7. **The two artifacts that used to need a by-hand probe are now GATED — confirm the gate, don't
   redo the recipe.** Both live in CI's `builds` job; run them locally if it has not run yet:

   ```bash
   npm run build && npm run mcp:build:only
   node packages/mcp/scripts/check-dist-resources.mjs   # every baked MCP resource == its repo source
   npm run vscode:build:only && npx vitest run editors/vscode   # incl. the __CORE_VERSION__ bundle stamp
   npx vitest run packages/mcp/test/lockstep.test.ts    # both server.json versions, mcpName, dep range
   ```

   A red `check-dist-resources` means rebuild (and `npm run gen:all` first if the repo artifact is
   itself stale). A red dep-range assertion is **expected on every core release** and is the
   intended prompt to bump the shim — see item 2.

   **Run every build and package step in the PRIMARY checkout, never in a `.claude/worktrees/*`
   one.** A worktree has no `node_modules` of its own, so esbuild resolves
   `@chanmeng666/archlang` by walking **up** to the shared repo and bundles **that** core — not the
   one you are releasing. Observed live on 2026-08-13: a worktree's `dist/server.js` carried a
   pre-fix function body while its own `dist/chunk-*.js` had the fixed one. **The
   `__CORE_VERSION__` stamp cannot catch this** — both cores stamp the same version, so the
   freshness test passes while the bundle is wrong. The stamp proves the bundle is not stale *in
   version*; it says nothing about which checkout the bundle came from (`docs/backlog.md` 3.14).

   Since v1.26.2 the build **refuses** rather than relying on you remembering: the guard in
   `editors/vscode/resolve-core.mjs` compares the resolved core's real path against the repo root
   of the tree being built and throws, naming both paths, when they differ
   (`editors/vscode/test/wrong-core.test.ts`). Note it fires for a **junctioned** worktree too, and
   correctly: npm links a workspace package by ABSOLUTE path to the main tree's root, so a junction
   moves the walk one step and changes nothing about which core gets bundled. The instruction is
   unchanged — package in the primary checkout — but a mistake is now loud instead of silent.

## Reminders (do not act on these here — they are context for the push)

- **Release is tokenless OIDC.** Pushing a `v*` tag triggers `.github/workflows/release.yml`,
  which publishes to npm via trusted publishing (with provenance) and to the MCP registry via
  github-oidc. Re-runs are idempotent — an already-published version is skipped.
- **NEVER add an npm token** to secrets or `.npmrc`. An auth failure in the workflow means "redo
  the npmjs trusted-publisher registration", never "add a token". npmjs account/publisher
  management is human-with-interactive-2FA only.
- **The VS Code extension bundles the core at build time.** A language-surface change (new
  token/keyword, grammar change, new quick-fix) means a Marketplace republish of
  `ChanMeng.archlang` — see `CONTRIBUTING.md#releasing`. **"Did the rebundle take?" is now a test,
  not a by-hand probe:** esbuild stamps the resolved core version into `dist/server.js` as
  `__CORE_VERSION__` and `editors/vscode/test/stdio.test.ts` asserts it equals that version, over a
  real LSP round-trip against the built bundle. Confirm the gate — `npm run vscode:build:only &&
  npx vitest run editors/vscode` (CI's `builds` job runs exactly this) — rather than counting
  symbols in the artifact. The old count-with-Node recipe was replaced because a version stamp
  cannot be stale-but-plausible the way a hand-picked symbol list can: it fails for *every* core
  change, not only the ones somebody remembered to grep for.
  - Still true, and why the test spawns the bundle rather than reading it: never judge a build
    artifact with a line-oriented or regex matcher. esbuild's wrapping is not guaranteed, and
    several of this language's surface strings contain `|`, `"` or `-`, which PowerShell's
    `Select-String` treats as a regex unless you pass `-SimpleMatch`.
- **The shim's handshake drift is FIXED** (0.2.3, 2026-07-26): `packages/mcp/src/server.ts` derives
  its `McpServer` version from `package.json` via `readShimVersion()`, mirroring the core's
  `readVersion()` in `src/cli/io.ts`, and a test pins the two together. Don't "fix" it again — and
  don't reintroduce a literal.
- **Ask what the shim SHIPS, not just what its diff says.** Its `archlang://spec` / `context` /
  `grammar` resources are copied into the tarball at **pack time**
  (`packages/mcp/scripts/copy-resources.mjs`), so they freeze at the last publish while the `^1.x`
  dep range resolves to a current core. `check:drift` does not see it (it compares the *repo-root*
  artifacts) and `git diff <lasttag>..main -- packages/mcp` is empty. Published 0.2.2 handed hosts a
  **v1.19 GBNF grammar that could not decode** `arc`/`polygon`/`zone`/`level` at all.

  **Two gates now cover this class, and item 7 above is how you confirm them** — the by-hand
  `npm pack` + symbol-count probe is retired:
  `packages/mcp/scripts/check-dist-resources.mjs` byte-compares every baked resource against its
  repo source (CI's `builds` job), and the dep-range assertion in
  `packages/mcp/test/lockstep.test.ts` is a **string** equality against `^` + the root version, so a
  core release reddens the shim on purpose until it is consciously re-pinned and rebuilt. Do not
  relax that to a semver-satisfies check to green a release.

  What the gates cannot do is publish for you: **only a version bump ships the refreshed
  resources** — that is a legitimate reason to spend one even when the diff is empty — and the bump
  must land in BOTH `packages/mcp/package.json` and BOTH of `server.json`'s version fields.
