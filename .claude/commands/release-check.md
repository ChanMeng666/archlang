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
     `npm run gen:plugin` and commit the manifest; `check:drift` fails on a stale one. The Gemini CLI
     manifest (`gemini-extension.json`) carries the core's version too: run `npm run gen:agent-manifests`. The release
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
     `release.yml`'s `publish-archlang-3d` job does nothing unless its version is new. A version bump
     (0.1.0 → 0.1.1) touches exactly: `packages/archlang-3d/package.json` `version`; `package-lock.json`
     (`npm install --package-lock-only`, one line; `npm ci` still passes without it, so nothing but this
     list catches it); and
     `packages/archlang-3d/CHANGELOG.md` (a new section, dated on the release commit). Nothing else:
     `ARCHLANG_3D_VERSION` reads the manifest, `playground/package.json` says `*`, and the GLB pin
     (`test/pins.ts`) uses a fixed generator, so a moved pin means moved geometry, never a release.
     Its peer range stays a caret range whose floor is `MIN_CORE` (same test); a core MAJOR needs a
     look at the seam (ADR 0031) before the range moves. A core that adds an export archlang-3d
     needs → raise its peer floor and `MIN_CORE` to that core version and bump archlang-3d, after
     that core is on npm, or in the same release: `publish-archlang-3d` needs `publish`, whose shim
     step waits until npm shows the new core, and `prove:pack` installs the core's `latest` (done:
     `treadCount`, core 1.57.0, archlang-3d 0.4.0's stairs, floor `^1.57.0`). The core ships no 3D
     code: its `npm pack --dry-run` list stays free of it. Its README and `CHANGELOG.md` may show
     the 3D preview beside its plan, in the PS-D12 words (PS-D11, `docs/plans/public-surfaces/3d.md`).

3. **CHANGELOG.md has an entry for the new version**, and
   `node scripts/changelog-section.mjs <version>` exits 0 with the section body. A new sheet-level
   statement is called out there: a consumer that strips or owns the sheet layer must learn it
   (ArchCanvas had to add `notes` to its strip list by hand; no test of its own could have caught it).

4. **`package.json` `repository.url` owner is byte-exact `ChanMeng666`** (provenance fails with E422
   otherwise).

5. **Gates green.** `npm run check:quick` and `npm run docs:build` locally; `check`, `check:drift`
   and `typecheck:all` are the release PR's CI gates on GitHub (never the full suite locally). A green PR says nothing about
   Node 18, Node 20 or Windows: those legs report green without running on a PR, and only `main`'s
   runs prove them. Before merging the release PR, read both, for the commit it branches from:

   ```bash
   gh run list --workflow ci.yml --branch main --event push --limit 3
   gh run view <id> --json headSha,jobs --jq '.headSha, (.jobs[] | "\(.conclusion)  \(.name)")'
   gh run list --workflow nightly.yml --limit 1
   gh run view <id> --json jobs --jq '.jobs[] | select(.name | startswith("Test ")) | "\(.conclusion)  \(.name)"'
   ```

   The newest completed push run must be `main`'s head and `success` on every job, with `Node 18`,
   `Node 20` and `Windows (tests + drift)` listed. Every nightly `Test …` job must be `success`
   (a red `Secret scan` is not one of these). A red one blocks the release until it is fixed on
   `main`. The bump commit's own push run finishes after the tag, since the tag follows the merge at
   once (below): read it once it finishes, and a red there is owed a patch release.

6. **Built artifacts** (CI's `builds` job; run locally if it has not run):

   ```bash
   npm run build && npm run mcp:build:only
   node packages/mcp/scripts/check-dist-resources.mjs
   npm run vscode:build:only && npx vitest run editors/vscode  #allow-local-heavy release gate
   npx vitest run packages/mcp/test/lockstep.test.ts  #allow-local-heavy release gate
   ```

   When `packages/archlang-3d`'s version is new, also (the job runs the same; `--dir` is a new,
   empty directory outside the repository):

   ```bash
   npm -w packages/archlang-3d run notices && git diff --exit-code packages/archlang-3d/THIRD_PARTY_NOTICES
   npm run check:3d  #allow-local-heavy release gate
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
- **Confirm the registry entry is live.** After the registry publish, read the entry and check that
  `remotes` names `https://mcp.archlang.uk/mcp` and the description is `packages/mcp/server.json`'s:

  ```bash
  curl -s "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.ChanMeng666%2Farchlang-mcp/versions/latest" | node -e "const s=JSON.parse(require('fs').readFileSync(0,'utf8')).server; console.log(s.version, s.description, JSON.stringify(s.remotes))"
  ```
- **Sigstore 409 on a provenance publish.** `npm error code TLOG_CREATE_ENTRY_ERROR … (409) an
  equivalent entry already exists in the transparency log` fails a publish job without publishing
  (seen on `publish-archlang-3d` at v1.54.0). Nothing is broken: `gh run rerun <id> --failed` publishes
  it with provenance; then wait out the npm visibility race below before checking `npm view`.
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
  **`@chanmeng666/archlang-3d`** is this case, and the plan is decided (arch-plan's route):
  1. Date the `[0.1.0]` section of its `CHANGELOG.md`, merge, and run item 6's `prove:pack` with
     `PLAYWRIGHT_BROWSERS_PATH` at an empty directory: a version cannot be taken back, and a machine with
     a browser hid that `view --replay` failed without one (0.1.0).
  2. The owner publishes 0.1.0 by hand, from the primary checkout after root `npm run build`:
     `npm publish -w packages/archlang-3d --access public` (no `--provenance`: npm refuses it off a
     supported CI, and `publishConfig` omits it for this reason; `prepack` builds). Until then the
     job skips with a notice. 0.1.0 carries no provenance.
  3. The owner registers: npmjs.com → package → Settings → Trusted Publisher → GitHub Actions,
     `ChanMeng666` / `archlang` / `release.yml`, environment empty, tick "Allow npm publish".
  4. Within 2 days: a PR with the 0.1.1 bump (item 2's list), merged, then
     `gh workflow run release.yml --ref main`. The job publishes 0.1.1 with provenance, which
     validates the registration. Confirm with `npm view @chanmeng666/archlang-3d@0.1.1 dist.attestations`.
- **VS Code Marketplace upload: a web upload, done by an agent in the owner's signed-in Chrome**
  (publisher `ChanMeng`, extension `ChanMeng.archlang`); nothing in CI publishes it. After a
  language-surface change, or any release that bumps `editors/vscode`:
  1. In the primary checkout: root `npm run build`, then `npm run package` in `editors/vscode`
     (it bundles the core's `dist/`, so a stale root build ships a stale language).
  2. Verify INSIDE the `.vsix` before uploading: `Identity Version`/`Publisher` in
     `extension.vsixmanifest`; `extension/package.json`'s version and core range;
     `ARCHLANG_CORE_VERSION` in `dist/server.js`; the release's new keywords/error codes present in
     `dist/core.mjs` (the core is bundled there once, not in `dist/server.js`). Search it with a literal matcher, never a regex.
  3. Upload the HIGHEST un-uploaded `.vsix` (`.vsix` files are gitignored and several can pile up).
     With Claude in Chrome (first done for 0.44.0 on 2026-11-06; no owner action needed when the
     owner's Chrome is signed in):
     1. `tabs_context_mcp` (createIfEmpty), then `navigate` to
        `https://marketplace.visualstudio.com/manage/publishers/ChanMeng`. The page first passes
        through `/_public/_MsalSignedInFps`; wait ~6 s and read `document.body.innerText`. Signed in
        means it names `ChanMeng666@outlook.com` and lists the ArchLang row with the live version.
        If it asks for a sign-in instead, stop and ask the owner to sign in (never type a password).
     2. Open the row's menu: the button's `aria-label` is "More Actions..." inside the row whose text
        contains "ArchLang" (`find` cannot see it; locate it with `javascript_tool` and click its
        centre). Then `find` "Update menu item" and click it.
     3. In the "Upload Visual Studio Code extension" dialog, `find` the file input and call
        `file_upload` with the ABSOLUTE path of the `.vsix` (for example
        `D:\github_repository\archlang\editors\vscode\archlang-0.44.0.vsix`). Confirm the dialog
        text shows that file name, then `find` and click its "Upload" button. The upload publishes
        to the public listing, so it needs the owner's go-ahead for this release (a "release" in
        chat covers it).
     4. After ~8 s the row reads `<old version> Verifying <new version>`; verification takes a few
        minutes. Done when `curl -s -o /dev/null -w '%{http_code}'
        https://marketplace.visualstudio.com/_apis/public/gallery/publishers/ChanMeng/vsextensions/archlang/<version>/vspackage`
        returns 200.
     If `file_upload` refuses the path or the dialog never shows the file name, fall back to the
     owner: give the `.vsix` path and SHA-256 and the steps ⋯ → Update → choose file → Upload.
  4. The gallery lags an upload by minutes; a disagreeing probe means wait and re-probe.
  5. Then dispatch `publish-openvsx.yml` on the tag, `gh workflow run publish-openvsx.yml --ref v<core version>`, never `main`, because it builds the ref it runs on, and check `https://open-vsx.org/api/ChanMeng/archlang`: nothing else
     keeps Open VSX current, and it skips a version it already has.
- **MCPB bundle (automatic).** `release.yml` builds `archlang-mcp-<mcp version>.mcpb` (`npm run
  build:mcpb`, proven with `npm run prove:mcpb`) and attaches it to the GitHub Release, best-effort:
  the Claude Desktop extension. The manifest is generated, never committed. Smithery is no longer a
  step: it was acquired by Arcade and closed publishing on 2026-10-31 (its CLI login returns 404 and
  the `chanmeng-dev/archlang` listing is gone), so the `.smithery.mcpb` variant was retired.
- **OpenAI plugin directory (submit and publish are human steps).** The hosted tools follow `main`,
  but the listing's skills pin the CLI to the version in their ZIP, so they stay on it until a new
  ZIP is published. After a release that changes the skills or the language: in the primary
  checkout, `npm run build:openai-plugin`, then "Create draft from ZIP" in the portal; an agent may
  upload it. An update between core releases keeps the CLI pin and names a higher plugin version,
  `npm run build:openai-plugin -- --plugin-version=<version>`. Wait for the scans, then the owner submits (six attestations) and publishes. Steps in
  `docs/integrations.md`.
- **ClawHub skill (OpenClaw).** Republish `skills/archlang` at the core's version:
  `clawhub skill publish skills/archlang --slug archlang --name ArchLang --version <core>`. The CLI
  is installed globally; `clawhub login` is the owner's device flow, so an agent asks the owner to
  log in when `clawhub whoami` fails. Check with `clawhub inspect archlang` (latest and the scan).
- **Docker MCP Catalog.** The entry (`servers/archlang/server.yaml` in `docker/mcp-registry`, from
  the owner's fork `ChanMeng666/mcp-registry`) pins an archlang commit. When the MCP package's
  version moved, open a follow-up PR there that moves `source.commit` to the release commit
  (`docs/backlog.md` O.17).
