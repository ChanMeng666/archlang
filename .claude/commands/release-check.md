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
   npm view @chanmeng666/archlang-3d version   # E404 until the owner's hand publish
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
   - Publish order is core → shim. The shim's `link` tool loads `@chanmeng666/archlang/link`, so the
     shim must not publish while npm's latest core lacks `./link` (`npm view @chanmeng666/archlang exports`).
     `release.yml` enforces it: `packages/mcp/scripts/check-core-exports.ts` fails the shim publish when
     npm's copy of the range's minimum lacks a subpath the server loads.
   - Claude Code plugin manifest (`plugins/archlang/.claude-plugin/plugin.json`): its `version` is
     the core's and its `npx` pin is the shim's exact version. After the version bumps run
     `npm run gen:plugin` and commit the manifest; `check:drift` fails on a stale one. The release
     PR pins a shim version that is not on npm until the tag's `release.yml` publishes it, so a
     plugin installed from `main` can fail to launch its server for those few minutes; accepted.
     Confirm `npm view @chanmeng666/archlang-mcp version` equals the pin once the tag run finishes.
   - Same range pin for `editors/vscode` (`editors/vscode/test/lockstep.test.ts`).
   - The served `<arch-plan>` (`docs-site/public/arch-plan.js`) names the core version in its
     jsDelivr URL: after the version bump run `npm run gen:arch-plan` (or `npm run gen:all`) and
     commit it with the plugin manifest; `check:drift` fails on a stale one.
   - `packages/web-component`'s peer range on the core is a caret range
     (`packages/web-component/test/peer-range.test.ts`). A core MAJOR (2.0) fails that test on
     purpose: check that `compile`, `diagnosticToJson` and `THEMES` still exist with the same
     shapes, then move the range.
   - `packages/font-cjk`: `release.yml` publishes it before the core and refuses a version/pin
     mismatch with the core's exact `optionalDependencies` pin.
   - `packages/archlang-3d` is versioned on its own: a core release needs nothing from it, and
     `release.yml`'s `publish-archlang-3d` job does nothing unless its version is new. To release it,
     bump `package.json`, set `ARCHLANG_3D_VERSION` (`src/scene3d/build.ts`) to match
     (`test/package-meta.test.ts`), re-pin `LANEWAY_GLB_SHA256` (the generator string names the
     version; the moved digest with that one string written back must be the old pin), bump
     `playground/package.json`'s exact pin and the lockfile, and date its `CHANGELOG.md` section.
     Its peer range stays a caret range whose floor is `MIN_CORE` (same test); a core MAJOR needs a
     look at the seam (ADR 0031) before the range moves. No 3D wording reaches the core: the core's
     `npm pack --dry-run` list and its `CHANGELOG.md` stay silent on it (Tier C).

3. **CHANGELOG.md has an entry for the new version**, and
   `node scripts/changelog-section.mjs <version>` exits 0 with the section body. A new sheet-level
   statement is called out there: a consumer that strips or owns the sheet layer must learn it
   (ArchCanvas had to add `notes` to its strip list by hand; no test of its own could have caught it).

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

   When `packages/archlang-3d`'s version is new, also (the job runs the same; `--dir` is a new,
   empty directory outside the repository):

   ```bash
   npm -w packages/archlang-3d run notices && git diff --exit-code packages/archlang-3d/THIRD_PARTY_NOTICES
   npm run check:3d
   npm -w packages/archlang-3d run prove:pack -- --dir <empty dir>
   npm -w packages/archlang-3d run prove:pack -- --dir <another> --core <the peer floor>
   ```

   `prove:pack` packs the tarball, installs it beside a core from npm and proves every entry, the
   types, the CLI's checked GLB and a replay with three.js inline that fetches nothing. Its summary
   line gives the tarball's size.

   Gate ORDER: these builds come BEFORE `npm run check` (item 5). `check` includes
   `editors/vscode/test/stdio.test.ts`, which compares the bundled server's stamped core version with
   the workspace version, so a stale `editors/vscode/dist/server.js` fails it after a version bump.

   Run every build and package step in the PRIMARY checkout, never a `.claude/worktrees/*` one: a
   worktree resolves the core by walking up to the shared repo and bundles that one.
   `editors/vscode/resolve-core.mjs` refuses in that case, and the `__CORE_VERSION__` stamp cannot
   tell the two apart.

## After the tag (human / external steps)

- **Tag straight after the bump merges, then prove the embed URL.** Pushing `main` deploys
  `https://archlang.uk/arch-plan.js` and the `/embed` recipe, both pinned to the new version, but
  npm only has it once the tag's `release.yml` finishes. Until then every embed shows
  `arch-plan: could not load the ArchLang compiler` (jsDelivr 404s, cached about 30 s). When the
  publish is done:

  ```bash
  curl -sI https://cdn.jsdelivr.net/npm/@chanmeng666/archlang@<version>/+esm   # expect 200
  ```

  then open `https://archlang.uk/arch-plan-demo.html` and check that both plans draw and the third
  element shows its `E_PARSE` box, or run its `@prod` case:
  `E2E_PROD=1 E2E_BASE_URL=https://archlang.uk npx playwright test -c docs-site arch-plan --grep @prod`.

- **Release is tokenless OIDC.** The tag runs `.github/workflows/release.yml` (npm with provenance,
  then the MCP registry via github-oidc); re-runs are idempotent. Never add an npm token; an auth
  failure means redo the npmjs trusted-publisher registration (human with 2FA).
- **MCP registry race.** The registry step can 404 on a version npm has published but not yet made
  visible. Both npm publishes have already succeeded; run `gh run rerun <id> --failed`. Never delete
  the retry loop (`docs/backlog.md` 4.7).
- **npm visibility race.** npm shows a just-published version only about 3 minutes after `npm publish`
  returns. The shim's core-exports check waits `VIEW_ATTEMPTS` x `VIEW_INTERVAL_MS`
  (`packages/mcp/scripts/check-core-exports.ts`, 8 minutes) for it; if it still trips, nothing is
  broken: run `gh run rerun <id> --failed` (idempotent).
- **A new npm package's FIRST version is published by hand by the owner** (as for
  `@chanmeng666/archlang-font-cjk`), then registered as a trusted publisher; later versions go
  through `release.yml`. `@chanmeng666/arch-plan` (0.1.0 published by hand) is published by `release.yml`'s
  `publish-arch-plan` job. The owner registers its trusted publisher once on npmjs.com
  (`@chanmeng666/arch-plan` → Settings → Trusted Publisher → GitHub Actions, repo `ChanMeng666/archlang`,
  workflow `release.yml`, no environment); until then that job fails with an auth error and nothing
  else is affected. Its `prepack` refuses a stale root `dist/`, so `npm run build` first when publishing by hand.
  npmjs lists a new trusted publisher as "Pending validation" and it LAPSES unless one publish goes
  through it within about 48 hours: right after registering, run `gh workflow run release.yml --ref main`
  once (a dispatch run skips every version already on npm and publishes only the new one). On the
  registration form tick "Allow npm publish" (`release.yml` publishes directly; the form prefers staged
  publishing and warns), label free, environment empty. Afterwards `npm view` lists a `0.0.0-stage`
  placeholder version made by npm's staged-publish machinery: ignore it, never unpublish it by hand.
  Any NEW package follows this order: first version by hand, register, then a NEW version through
  `release.yml` within 2 days (<https://docs.npmjs.com/trusted-publishers>: "must complete its first
  successful publish within 2 days", then it expires and must be deleted and recreated). A dispatch
  alone validates nothing when every version is already on npm, since it skips them: bump first.
  arch-plan did this (0.1.0 by hand, without provenance; 0.1.1 through the workflow, with it).
  npm cannot register a publisher for a package that does not exist
  (<https://docs.npmjs.com/cli/v11/commands/npm-trust>: "must already exist on the npm registry").
  **`@chanmeng666/archlang-3d`** is this case. The hand publish, from the primary checkout after root
  `npm run build`: `npm publish -w packages/archlang-3d --access public` (no `--provenance`: npm
  refuses it off a supported CI, and `publishConfig` omits it for this reason; `prepack` builds).
  Until that exists its job skips with a notice. Registration: npmjs.com → package → Settings →
  Trusted Publisher → GitHub Actions, `ChanMeng666` / `archlang` / `release.yml`, environment
  empty, tick "Allow npm publish".
- **VS Code Marketplace upload is a human web step** (publisher `ChanMeng`, extension
  `ChanMeng.archlang`); nothing in CI publishes it. After a language-surface change:
  1. In the primary checkout: root `npm run build`, then `npm run package` in `editors/vscode`
     (it bundles the core's `dist/`, so a stale root build ships a stale language).
  2. Verify INSIDE the `.vsix` before uploading: `Identity Version`/`Publisher` in
     `extension.vsixmanifest`; `extension/package.json`'s version and core range;
     `ARCHLANG_CORE_VERSION` in `dist/server.js`; the release's new keywords/error codes present in
     `dist/core.mjs` (the core is bundled there once, not in `dist/server.js`). Search it with a literal matcher, never a regex.
  3. Upload the HIGHEST un-uploaded `.vsix` (`.vsix` files are gitignored and several can pile up).
  4. The gallery lags an upload by minutes; a disagreeing probe means wait and re-probe.
- **MCPB bundle / Smithery (human step; no credential in CI).** `release.yml` builds
  `archlang-mcp-<mcp version>.mcpb` (`npm run build:mcpb`, proven with `npm run prove:mcpb`) and attaches
  it to the GitHub Release, best-effort, together with `archlang-mcp-<version>.smithery.mcpb`. The
  `.smithery` variant exists because Smithery's API requires an `inputSchema` on every manifest tool
  while `mcpb validate` rejects that key, so one manifest cannot satisfy both: the plain file is the
  Claude Desktop extension, the variant is only for Smithery. To list a release on Smithery
  (<https://smithery.ai/docs/build/publish>), download the variant (or run `npm run build:mcpb` in the
  primary checkout) and:

  ```bash
  npx @smithery/cli@4.11.1 auth login   # once; browser approval, no key to type
  npx @smithery/cli@4.11.1 mcp publish dist-mcpb/archlang-mcp-<version>.smithery.mcpb -n chanmeng-dev/archlang
  ```

  The namespace/server id is `chanmeng-dev/archlang`. A new shim version needs a new bundle and a
  re-publish; the manifests are generated, never committed.
