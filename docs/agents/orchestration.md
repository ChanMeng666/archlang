# Orchestration notes

For the coordinator (the session that plans, dispatches executors, reviews and merges). An
executor reads `AGENTS.md`, `gotchas.md` and the rule for its paths; it reads this file only when its
card says it is also the coordinator. Hard rules stay in `AGENTS.md`; owner decisions in `iron-laws.md`;
merge procedure and the CI job map in `commands.md`.

## Dispatching an executor

- **A worktree agent starts at `main`**, whatever branch the coordinator is on (`isolation:
  "worktree"` checks out the default branch). The card names the integration branch (default `main`);
  the executor's first step is `git fetch` and re-pointing its branch to it, and the coordinator checks
  each worktree's base with `git merge-base --is-ancestor <integration> HEAD` before merging.
- **Name the reading in the brief**: the card lists every doc beyond `AGENTS.md`, `gotchas.md` and the path rule
  that the executor needs (architecture, testing § 2–3, a recipe); the agent definitions only default to the three.
- **The limits every card repeats**: run `npm run check:quick` once, at the end (plus `npm run docs:build`
  after a published `docs/*.md` edit); never the full suite, `check`, `check:drift`, `typecheck:all`,
  e2e or bench locally (the local-gate hook blocks them and CI is the gate); a vitest file, when it
  must run, takes `--poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1`; one executor and
  one heavy process at a time on this machine (it froze under three parallel test runs); never edit
  `docs/plans/*/cards.md` (adjacent card headings conflict on every merge; the coordinator records
  status in a records PR); no push or tag unless the card says so.
- **How a day's work continues**: take the first `todo` card of the lowest open wave, honour
  `depends`, dispatch one executor into a worktree from `main` with the card text plus the finding's
  section from the audit report, at most two executors at once (EH-D1). Merge by tier
  (`scripts/risk-tier.mjs`; `commands.md` § Merging a PR).
- **Review depth**: a medium PR gets one fresh-context review against `REVIEW.md` and one fix round, a
  second round only for a new mechanism; CI reds found during a round are folded into it. Every
  pure-move PR repoints the source-text guards.

- **The `alg-*` executors do not push**; the main session pushes and opens the PR, and writes the body if
  the executor did not. A worktree branch can track `origin/main`, so push with an explicit
  `HEAD:<branch>`.
- **The session scratchpad is shared by parallel executors**: give each its own subfolder in the brief. A
  reviewer's `scratchpad/` left inside a worktree fails CI's `npm run check` on lint, and must not be staged.
- **A worktree locked by the running session refuses `git worktree remove`**, even with `--force`. Leave
  it for the session's end rather than removing it with `-f -f`.
- **Two actors in one worktree share one checkout.** A reviewer's `git checkout -b probe` silently
  redirects the other's commits. Verify a branch from a separate checkout (or `git -C`), and re-read
  an agent branch's tip with `git rev-parse` before merging it.

## Merging and CI

- **`gh pr checks <n> --watch --fail-fast` has exited early on the informational Benchmark job.**
  Watch without `--fail-fast`, then read every conclusion with
  `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`.
- **`gh pr checks <n> --watch` right after `gh pr create` can return before the checks register**, and
  the merge is then refused by branch policy. Before merging, confirm `mergeStateStatus` is `CLEAN`.
- **`gh pr merge --match-head-commit` needs the full 40-character SHA**; a short one fails the
  merge, and a branch delete `;`-chained after it then closes the PR unmerged. Auto-merge deletes
  the branch on merge: never delete it by hand (procedure: `commands.md` § Merging a PR).
- **Two green PRs can break `main` together.** #521 required one MP4 per 3D plan and #523 added
  plans without one; each PR's CI ran without the other, and `main`'s docs build (and deploy) went
  red until #525. When two open PRs share a data shape (a manifest, a JSON schema, a component's
  props), rebase the second after the first merges, and read `main`'s own CI after every merge.
- **CI runs only on PRs whose base is `main`.** A stacked PR gets no CI, and retargeting it to
  `main` fires `edited`, not a run: push a commit (or rebase and force-push) to start one.
- A PR that touches `docs/agents/commands.md` is high tier (`scripts/risk-tier.mjs`), so it needs the
  owner's words: keep such a line out of an otherwise medium PR and land it separately.
- `scripts/risk-tier.mjs` also puts `docs-site/public/_headers`, `_redirects`, any `server.json` and
  the root `package.json` in the high tier, so an SEO or metadata PR that regenerates `_headers`
  waits for the owner's words even when the rest is docs.
- **A local run that skipped the full suite reports green on what it ran**: on a low-load round the corpus guards and CodeQL fire only in CI, so read a PR's checks before starting the next card.
- **For the owner's rare local run, `npx vitest run --maxWorkers=N` errors in this repo unless `--minWorkers=1` is also given.**

## Releases, registries and hosting

- **`publish-openvsx.yml` builds the ref it is dispatched on**, and a version cannot be withdrawn: dispatch the tag, `--ref v<version>`, or code merged after the release ships under the released number.
- Right after an OIDC publish, `npm view` and jsDelivr can still show the old version for a few
  minutes (the log says "being processed"): wait and re-query the registry; never re-run the release.
- **Pushing `main` deploys the docs; only a `v*` tag moves npm.** A merged, unreleased language
  feature makes `archlang.uk` document syntax `npx @chanmeng666/archlang` cannot parse. Say so when
  you land one without releasing it.
- **(npm) A newly registered trusted publisher lapses unless a publish goes through it within about
  48 hours**; dispatch `release.yml` once (`.claude/commands/release-check.md`).
- **(MCP registry) Search matches server names only**, so the 100-char `description` says what the
  server is for; the tool-name lockstep lives in `packages/mcp/README.md`'s tool table
  (`packages/mcp/test/server.test.ts`).
- **The hosted MCP's precise rate guard is a zone WAF rule in the Cloudflare dashboard**
  (`mcp abuse guard`, ADR 0026 "Addendum: production"). The Worker's own bindings count per server,
  so the repository alone shows a limit that does not hold; the WAF rule covers every path on the host.
- **`taskkill` on `workerd.exe` kills every session's `wrangler dev`.** Stop only the process you
  started, by its PID.

## The primary checkout

- **A stale zero-byte `.git/index.lock` in the primary checkout** (left by a killed git process)
  makes `git checkout` and `gh pr merge` fail. Delete it only after confirming no git process runs.
- **The primary checkout can hold CRLF working copies** (`core.autocrlf=true`) that git shows clean;
  byte-digest tests then fail only there. `git ls-files --eol | grep w/crlf` finds them: delete the
  file and `git checkout -- <path>`; never re-pin a digest.

## Browser, site QA and off-site messages

- **The a11y-loop forced-colors pass reports colour-contrast findings that are artifacts.** A finding's
  `passes` array names the passes it occurred in. In Windows high-contrast emulation the browser
  replaces backgrounds, so axe measures the foreground against white and reports about 1.0:1 for any
  coloured button; axe's own documentation excludes `color-contrast` there. Before acting on a
  single-pass finding, read the element's computed colours in a real browser and check the pair with
  `a11y-loop contrast <fg> <bg>`, then audit the live production URL: an identical finding there
  predates the change and is the tool. A finding that lists all five passes, or a reflow-only one,
  has been real.
- **Claude in Chrome's screenshot can time out on platform.openai.com and after a Playground PDF
  download** ("renderer may be frozen"). The page still works: read and drive it with
  `javascript_tool`. A long `#z=` link cannot be retyped by hand; a truncated hash silently shows
  the default example, so check the editor's first line.
- **The Claude in Chrome extension drops after a terminal crash**; the owner reconnects it with
  `/chrome`.
- **Off-site messages are the owner's in practice, not only by rule:** X and LinkedIn paywall a
  message request to someone who does not follow the account, Reddit refuses every agent route
  (extension, HTTP, fetch), and a subagent will not send a message on an approval relayed by
  another agent, so the main session acts on the owner's words itself or hands the item back.
