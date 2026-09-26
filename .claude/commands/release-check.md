---
description: Pre-release checklist (run before pushing a v* tag)
---

# Release check

Walk this checklist before pushing a `v*` tag. Report each item as pass/fail with the evidence
you observed. Do NOT push anything — this command only verifies.

## Checklist

1. **Establish the TRUE latest release first.** Never take the current version from a doc, a plan
   or the prompt. Probe:

   ```bash
   npm view @chanmeng666/archlang version
   git tag --sort=-v:refname | head
   gh release list --limit 3
   grep -m3 '^## ' CHANGELOG.md
   ```

   The target must be strictly greater than all of them (an npm version is immutable), and its
   semver class must match what changed — read `git log <lasttag>..main` and
   `git diff --stat <lasttag>..main`. New grammar/keyword, `E_*`/`W_*` code or public field ⇒ MINOR
   at least. Diff that log against `[Unreleased]` so no merged change is missing from the notes.

2. **Versions consistent.**
   - Root `package.json` `version` matches the newest `CHANGELOG.md` heading.
   - Ask whether the shim changed: `git diff <lasttag>..main -- packages/mcp`. ANY mcp-visible
     change (including a tool description, its README, a `server.json` field) needs a bump in
     `packages/mcp/package.json` AND both `version` fields of `packages/mcp/server.json` —
     `release.yml` skips a version already on npm.
   - The shim's baked resources (`spec.llm.md`, `llms-full.txt`, the GBNF, both schemas) are copied
     at pack time and refresh ONLY with a version bump — a legitimate reason to bump with an empty
     diff. Its core dep range is pinned as the string `^` + the root version, so every core release
     reddens `packages/mcp/test/lockstep.test.ts` on purpose: re-pin, rebuild, bump. Never relax it.
   - Same range pin for `editors/vscode` (`editors/vscode/test/lockstep.test.ts`).
   - `packages/font-cjk`: `release.yml` publishes it before the core and refuses a version/pin
     mismatch with the core's exact `optionalDependencies` pin.

3. **CHANGELOG.md has an entry for the new version**, and
   `node scripts/changelog-section.mjs <version>` exits 0 with the section body.

4. **`package.json` `repository.url` owner is byte-exact `ChanMeng666`** (provenance fails with E422
   otherwise).

5. **Gates green.** `npm run check`, `npm run check:drift`, `npm run typecheck:all`,
   `npm run docs:build`, and the PR gates on GitHub for the release commit
   (`gh run list --branch main --limit 5`).

6. **Built artifacts** (CI's `builds` job; run locally if it has not run):

   ```bash
   npm run build && npm run mcp:build:only
   node packages/mcp/scripts/check-dist-resources.mjs
   npm run vscode:build:only && npx vitest run editors/vscode
   npx vitest run packages/mcp/test/lockstep.test.ts
   ```

   Run every build and package step in the PRIMARY checkout, never a `.claude/worktrees/*` one: a
   worktree resolves the core by walking up to the shared repo and bundles that one.
   `editors/vscode/resolve-core.mjs` refuses in that case, and the `__CORE_VERSION__` stamp cannot
   tell the two apart.

## After the tag (human / external steps)

- **Release is tokenless OIDC.** The tag runs `.github/workflows/release.yml` (npm with provenance,
  then the MCP registry via github-oidc); re-runs are idempotent. Never add an npm token; an auth
  failure means redo the npmjs trusted-publisher registration (human with 2FA).
- **MCP registry race.** The registry step can 404 on a version npm has published but not yet made
  visible. Both npm publishes have already succeeded; run `gh run rerun <id> --failed`. Never delete
  the retry loop (`docs/backlog.md` 4.7).
- **A new npm package's FIRST version is published by hand by the owner** (as for
  `@chanmeng666/archlang-font-cjk`), then registered as a trusted publisher; later versions go
  through `release.yml`.
- **VS Code Marketplace upload is a human web step** (publisher `ChanMeng`, extension
  `ChanMeng.archlang`); nothing in CI publishes it. After a language-surface change:
  1. In the primary checkout: root `npm run build`, then `npm run package` in `editors/vscode`
     (it bundles the core's `dist/`, so a stale root build ships a stale language).
  2. Verify INSIDE the `.vsix` before uploading: `Identity Version`/`Publisher` in
     `extension.vsixmanifest`; `extension/package.json`'s version and core range;
     `ARCHLANG_CORE_VERSION` in `dist/server.js`; the release's new keywords/error codes present in
     the bundle. Search the bundle with a literal matcher, never a regex.
  3. Upload the HIGHEST un-uploaded `.vsix` (`.vsix` files are gitignored and several can pile up).
  4. The gallery lags an upload by minutes; a disagreeing probe means wait and re-probe.
