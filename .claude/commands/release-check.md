---
description: Pre-release checklist (run before pushing a v* tag)
---

# Release check

Walk this checklist before pushing a `v*` tag. Report each item as pass/fail with the evidence
you observed. Do NOT push anything — this command only verifies.

## Checklist

1. **Versions consistent where they must be.**
   - Root `package.json` `version` matches the latest entry heading in `CHANGELOG.md`.
   - If the MCP shim changed: `packages/mcp/package.json` `version` and
     `packages/mcp/server.json` version agree with each other, and the shim's core dependency
     range (`^1.x`) still satisfies the new core version. (The shim need NOT bump when only the
     core changes and its dep range already covers the new version — e.g. core 1.15.0 with the
     shim at 0.2.0 depending on `^1.14.0`.)

2. **CHANGELOG.md has an entry for the new version** with the actual changes (not an empty
   `Unreleased` block).

3. **`package.json` `repository.url` owner casing is byte-exact `ChanMeng666`.** npm provenance
   fails with `E422` if the owner segment casing differs from the real repo — this has already
   cost a same-day re-tag. Confirm it reads `github.com/ChanMeng666/archlang`, not `chanmeng666`.

4. **AGENTS.md status table is updated** — the "Project status" table's version column and any
   `CHANGELOG` prose reflect the version being released.

5. **Gates green.**
   - `npm run check` — typecheck + lint + tests all pass.
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
  `ChanMeng.archlang` — see `CONTRIBUTING.md#releasing`.
