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
   - `npm run docs:build` — the docs site still builds (the core suite does not compile it).

## Reminders (do not act on these here — they are context for the push)

- **Release is tokenless OIDC.** Pushing a `v*` tag triggers `.github/workflows/release.yml`,
  which publishes to npm via trusted publishing (with provenance) and to the MCP registry via
  github-oidc. Re-runs are idempotent — an already-published version is skipped.
- **NEVER add an npm token** to secrets or `.npmrc`. An auth failure in the workflow means "redo
  the npmjs trusted-publisher registration", never "add a token". npmjs account/publisher
  management is human-with-interactive-2FA only.
- **The VS Code extension bundles the core at build time.** A language-surface change (new
  token/keyword, grammar change, new quick-fix) means a Marketplace republish of
  `ChanMeng.archlang` — see `CONTRIBUTING.md#releasing`. Verify the `.vsix` by searching the built
  `editors/vscode/dist/server.js` for a new keyword/code, not by reading the version string.
  **Verify it by COUNT, with Node — a bare "no match" is not evidence.** Read the bundle and count
  occurrences of each new symbol, so a present symbol shows a number and an absent one shows `0`:

  ```bash
  node -e "const s=require('fs').readFileSync('editors/vscode/dist/server.js','utf8'); \
    for (const k of ['E_LEVEL_MIX','escalator']) console.log(k, s.split(k).length - 1)"
  ```

  This is immune to two ways a grep-style check lies about a build artifact: the bundle's line
  shape (esbuild's wrapping is not guaranteed, and a line-oriented matcher on a one-line bundle can
  read as a false negative), and regex metacharacters in the pattern — several of this language's
  surface strings contain `|`, `"`, or `-` (`dir up|down`, `"stair"`, `--level`), which a PowerShell
  `Select-String` will interpret as a regex unless you pass `-SimpleMatch`. A `0` count for a symbol
  the new core defines is the real failure signal; anything else means the rebundle took.
  *(2026-07-26, v1.21.0: `server.js` was 24,595 lines / 3,983 max line and `Select-String` did work —
  but the count is what proved it, and it costs nothing to be shape-independent.)*
- **Known drift, unfixed:** `packages/mcp/src/server.ts` hardcodes its `McpServer` version
  (`"0.2.0"` since 0.2.1), so the published shim misreports itself in the MCP handshake.
  `CONTRIBUTING.md#releasing` says that string must match. Fix it by deriving the version from
  `package.json` (as the core CLI does via `buildManifest(version)`) on the next shim change that is
  bumping anyway — it cannot reach users without a bump, so don't spend one on it alone.
