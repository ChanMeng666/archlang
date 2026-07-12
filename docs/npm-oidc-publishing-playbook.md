# Tokenless npm publishing for AI agents — the OIDC trusted-publishing playbook

**Audience: a Claude Code (or any coding-agent) session in *any* repository** that wants the
agent to own the entire npm release lifecycle — version, changelog, tag, publish, verify —
**without a stored npm token and without a 2FA prompt on any publish**. This is the setup that
shipped `@chanmeng666/archlang@1.14.0` + `@chanmeng666/archlang-mcp@0.2.0` from this repo on
2026-07-12, first try after one recorded gotcha. Everything here is npm's *sanctioned*
automation path (trusted publishing), not a security workaround: publishes stop needing 2FA
because they stop needing *credentials* — the CI run proves its own identity via OIDC.

> **Read this first — the honest boundary.** npm deliberately splits the world in two:
> **publishing** can be fully delegated to automation (this document); **account and package
> management** cannot. Creating/deleting tokens, changing maintainers or package access,
> editing trusted-publisher config, and 2FA settings require an interactive human with 2FA —
> token-based bypass of those is being removed (timeline below), and no compliant setup can
> delegate them. Design your release process so management actions are rare, one-time events.
> An agent that "handles all npm operations" really means: **agent publishes, human blesses
> the setup once.**

## Why not a token (the deprecation clock)

| Date | What happened / happens |
|---|---|
| 2025-12-09 | Classic tokens (incl. "Automation" type) permanently revoked. Only Granular Access Tokens (GATs) exist. |
| 2026-07-08 | npm v12 GA; deprecation of 2FA-bypass GATs announced. |
| ~2026-08 | Bypass-2FA GATs lose account/package/org **management** actions (interactive 2FA only). |
| ~2027-01 | Bypass-2FA GATs lose **direct publish** — reduced to *staging* a publish that a human 2FA-approves. |

Also: a long-lived publish token is a standing secret on disk; there is an open npm/cli bug
(npm/cli#9268) where correctly-configured bypass GATs still get EOTP/E403; and provenance
(sigstore attestation) comes free with OIDC. Tokens are the legacy path — don't build on them.

## The architecture

```
agent (local)                        GitHub Actions                     registries
─────────────                        ──────────────                     ──────────
bump versions + CHANGELOG   push     release.yml (OIDC id-token)        npm (trusted publisher,
commit → git tag vX.Y.Z  ─────────►  npm publish --provenance  ───────►  provenance-signed)
gh run watch <id>                    [optional: other registries        [optional: MCP registry
                                      via their own OIDC login]           via github-oidc]
```

No secret exists anywhere: npmjs.com is told, once per package, "trust publishes coming from
GitHub repo X, workflow file Y" — then each CI run exchanges its OIDC identity for a
short-lived, publish-only credential minted on the spot.

## One-time setup (per package; the only human steps)

1. **The package must already exist on npm.** Trusted-publisher config attaches to an existing
   package — a brand-new package's *first* version must be published once by other means (a
   short-lived GAT with read+write on the package and "Bypass 2FA" checked, deleted right
   after; or a manual `npm publish` with an OTP). Everything after v0.0.1 is tokenless.
2. **Register the trusted publisher** — npmjs.com → the package → *Settings* → *Trusted
   Publisher* → *GitHub Actions*, then fill **exactly, case-sensitively**:
   - *Organization or user*: the GitHub **owner** (e.g. `ChanMeng666` — GitHub casing, not the
     npm scope's lowercase)
   - *Repository*: the repo name (e.g. `archlang`)
   - *Workflow filename*: the filename only, with extension (e.g. `release.yml` — not a path)
   - *Environment name*: leave empty (unless you gate releases behind a GitHub environment)
   - *Allowed actions*: check **"Allow npm publish"** (configs created after 2026-05-20 must
     select actions explicitly; leave "stage publish" unchecked unless you use staging)
3. npm **will demand a 2FA OTP to save this** — that is the by-design human step. Workable
   division of labor: the agent drives the browser (e.g. Claude-in-Chrome) and fills the form,
   **stops at the OTP prompt**, the human types the 6-digit code, the agent verifies the saved
   entry. One OTP per package, once, ever (until the config itself changes).
4. A monorepo publishing N packages = N registrations, all pointing at the **same** repo and
   workflow file. One workflow run can publish all of them (OIDC mints a fresh credential per
   `npm publish` invocation).

## The workflow (template)

Adapt from this repo's working `.github/workflows/release.yml`. The load-bearing parts:

```yaml
name: Release (npm via OIDC)
on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  id-token: write   # the OIDC exchange — without this you get an auth error
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest   # cloud-hosted runners only; self-hosted unsupported
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'   # REQUIRED for the OIDC token exchange
          cache: npm
      - run: npm ci            # with the runner's bundled npm — see pin note below
      - run: |                 # trusted publishing needs npm >= 11.5.1; pin 11.x, NOT @latest
          npm install -g npm@^11.5.1
          npm --version
      # idempotency: skip any version already on the registry, so re-runs are safe
      - id: check
        run: |
          v=$(node -p "require('./package.json').version")
          echo "version=$v" >> "$GITHUB_OUTPUT"
          on_reg=$(npm view "your-pkg@$v" version 2>/dev/null || true)
          echo "exists=$([ "$on_reg" = "$v" ] && echo true || echo false)" >> "$GITHUB_OUTPUT"
      - if: ${{ success() && steps.check.outputs.exists != 'true' }}
        run: npm publish --provenance --access public
      # workspaces: repeat guard + `npm publish -w packages/<name> --provenance --access public`
```

Template notes, each learned the hard way or from the docs:

- **Pin npm to `^11.5.1` *after* `npm ci`, never `npm@latest`.** Latest is npm 12, whose
  `allowScripts`-off default silently blocks dependency install scripts (esbuild's
  postinstall, native builds) — and 11.5.1 is the trusted-publishing minimum. Upgrading after
  `npm ci` means install scripts already ran under permissive npm.
- **`registry-url` on setup-node is required** — it writes the `.npmrc` plumbing the OIDC
  exchange rides on. Forgetting it looks like an auth failure.
- **Pass `--provenance` explicitly** (or `publishConfig.provenance: true`); docs say it's
  automatic under trusted publishing, practice says be explicit. `--access public` is needed
  for a scoped package.
- **Custom `if:` conditions must include `success() &&`** — a bare custom `if:` drops GitHub's
  implicit failure check, and a failed earlier publish would NOT stop later steps.
- **Make every publish idempotent** (the `npm view` guard) so a partially-failed release is
  fixed by re-running the workflow (`gh workflow run release.yml`), not by hand-surgery.
- **Guard secondary-registry syncs by the *secondary registry's* state, not by "did npm
  publish happen this run"** — otherwise an npm-ok/registry-failed partial run skips the sync
  forever on re-run. (Example: the MCP registry — `mcp-publisher login github-oidc` →
  `mcp-publisher publish` is likewise tokenless under the same `id-token: write`.)

## Gotchas that will actually bite you

1. **Provenance exact-matches `repository.url` casing (E422).** If `package.json` says
   `github.com/chanmeng666/repo` and the OIDC attestation says `ChanMeng666/repo`, the publish
   is rejected *after* the tarball uploads. The GitHub **owner casing must be byte-exact** in
   `repository.url` (and keep `homepage`/`bugs` consistent while you're there). If the fix
   lands after tagging: commit, then move the tag (`git tag -f vX.Y.Z && git push -f origin
   vX.Y.Z`) so the published source matches the tag.
2. **The workflow filename is part of the trust contract.** Renaming `release.yml` breaks
   publishing until a human re-registers the trusted publisher (a 2FA action). Pick a name and
   keep it.
3. **Package-level "Publishing access" setting** — the option "Require two-factor
   authentication and disallow tokens" does NOT block trusted publishing (it blocks GATs), but
   while you still depend on any token anywhere, know that this radio silently EOTPs it.
4. **`npm view` can lag a minute** after publish on edge caches — verify against the registry
   JSON (`https://registry.npmjs.org/<pkg>`) before declaring failure.
5. **npm 12 on dev machines/CI**: when it arrives, dependency install scripts stop running by
   default — build an allowlist with `npm approve-scripts` and commit it, or installs of
   script-dependent toolchains (esbuild et al.) break quietly.

## What the agent does per release (the whole loop)

1. Bump version(s) + changelog; run the repo's full gate locally; commit; push.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` — this *is* the publish button.
3. `gh run watch <run-id> --exit-status`; on failure, read `gh run view <id> --log-failed`,
   fix, push, move the tag if the fix affects published files, re-run.
4. Verify independently: `npm view <pkg> version dist-tags.latest` (+ the sigstore transparency
   log URL npm prints) — then truth-sync the repo's own status docs.

## Fallback: staged publishing (when CI is unavailable)

`npm stage publish` from a local machine stages the release without 2FA; a human then approves
with one 2FA tap — from the CLI or the npmjs.com "Staged Packages" web UI (a phone works).
This is also what bypass-GATs get reduced to in 2027, so it's the sanctioned local path, not a
downgrade. Agent stages, human taps — still zero secrets.

## Copy-paste checklist for a new repo

- [ ] Package(s) exist on npm (bootstrap a brand-new package once, then delete the token)
- [ ] Human registers trusted publisher per package (owner/repo/workflow-filename, exact case;
      allow "publish"; expect one OTP each)
- [ ] Add `release.yml` from the template above (id-token: write · registry-url ·
      npm@^11.5.1 after npm ci · idempotency guards · --provenance --access public)
- [ ] `repository.url` casing matches the real GitHub owner in every published package.json
- [ ] Delete every npm token from `~/.npmrc`, CI secrets, and npmjs.com (`npm whoami` failing
      locally is the *desired* end state)
- [ ] Document in the repo's CONTRIBUTING: tag push = release; auth failure = redo the npmjs
      registration, never add a token
