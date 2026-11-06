# Gotchas

Non-obvious traps that no test catches, or whose symptom points the wrong way. Each: rule · symptom
· fix. Anything a test already enforces is left to that test's failure message.

## Core

- **A correct count can be the wrong charge.** Steps are calibrated to the evaluator, about 7 M a second
  (`src/expr.ts`). The first `polygonsOverlap` charge counted operations exactly and refused 100 round
  rooms after 0.19 s of real work, because a `room circle` is a 48-gon. Scale a charge to the budget's
  unit (`RING_READS_PER_STEP`) and measure an honest plan near the limit, not only a hostile one.
- **A hint must quote the position the plan resolves.** `placeOnRun` snaps to the grid, so a quoted midpoint
  can land elsewhere silently. Quote through `pickAt`, and test by pasting the hint.
- **An oracle on an exact lattice cannot see float noise.** Coordinates built from `k·scale` make `cross3`
  exact, so a rewrite that changes an answer on near-collinear edges passes. Add trig or jittered rings.
- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen, so it
  flips with the order of a wall's points. Each leaf's sector comes from `doorLeaves` in
  `geometry.ts` (a `double` door's two, built with `doorSwing`'s geometry), shared by
  `door.render()` and every swing measure — keep them on that one helper. `doorSwing` alone
  returns null for a `double`, so a new caller of it skips double doors silently.
- **A Scene node names its element only under `annotate`.** A pass that reads `elementKind` to decide
  the drawing draws one thing for `compile()` and another for `lint()`, which passes `annotate`. Record
  the node range while lowering instead (`ElementNodes`, `src/label-fit.ts`).
- **`E_DRAWING_LIMIT` exists only in `compile()`, and only when no other error is present**
  (`src/pipeline.ts`). `describe()`/`lint()` never report it, and a catalogue fence wrapped as a
  fragment shows only `E_PARSE`. `toScene(resolve(ast).ir)` bypasses the drawing budget; `compile()`
  is the guarded route.
- **`describe()`/`lint()` stop at any resolve error** (`resolvePlan` in `src/analyze.ts` returns no
  IR), so a huge-magnitude test never reaches the analysis grids. Pin a new grid bound with an
  in-range test.
- **Circulation seeds**: the front-door and shaft-landing seeds keep their stamp of the connector's
  width on purpose; changing them changes their seed value. Carve far seeds are not stamped.
- **A diagnostic's `span` may point into an imported module**; `Diagnostic.file` then names it and
  `applyFixes` skips any fix carrying `file`. Any new consumer of `diagnostics[].fixes` must honour
  `file`, or it splices a module's byte offsets into the importer.
- **`place`: never pre-transform a resolver's input.** Every derived rule is stated in plan terms
  (`anchor top-left`, `side left`, `hinge left`, `right-of`), so an instance resolves in its own
  frame and `transformElement` carries the result. A new handed rule adds its flip in the element
  module's `transform`, under `t.reflected`. Flip what can be re-expressed in plan coordinates (a
  symbol's handedness); drop what cannot (a local `anchor` corner).
- **Room-label classification goes through `src/vocabulary.ts`**; the corpus classification is pinned
  by `test/vocabulary-equivalence.test.ts`. A red pin means fix the vocabulary, never regenerate it.
- **Every CLI exit goes through `exitFlushed()` (`src/cli.ts`, reached via `finish()`).** A bare
  `process.exit` after a large stdout write truncates the output on a pipe (Node 22 on Linux cut
  `context --json` at ~145 KB). `test/cli-flush.test.ts` discriminates only on Linux: Windows pipes
  drain in time, so a green local Windows run proves nothing about a new exit path.
- **The PNG backend is Node-only and async**; keep `node:*` imports lazy so the module stays
  browser-safe.
- **CJK text in PDF/PNG**: the face from `@chanmeng666/archlang-font-cjk` is registered only when a
  drawn string needs it, which keeps every non-CJK PDF/PNG byte-identical. Loading it
  unconditionally moves every PDF golden — a finding, not a re-pin.
- **A new handed/oriented fact crosses `place` only through the element's own `transform`**; the
  equivariance oracle (`test/d4-oracle.ts`) will pin it `NEW` otherwise, not fail silently.
- **A lint fix inside a turned or mirrored `place` must pull its value back through the instance
  frame before writing it** (`LintContext.frameOf`, `src/lint.ts`), or the machine-applicable edit
  is correct in plan coordinates and wrong once `arch fix` writes it back into the component body.
- **Editing any `examples/*.arch` moves many corpus-wide suites.** Expect `cursor-exhaustive`,
  `iso-snapshot`, `snapshot`, `visual`, `opening-tags-corpus`, `readme-permalink`,
  `docs-examples-figures`, `example-svgs-drift`, `rooms-tiling-probe`, `taste-digests`,
  `intent-all-storeys`, the
  `*-digests` and `*-byte-identity` suites, `playground/test/llm-prompt.test.ts` and the corpus counts
  written into `packages/archlang-3d`'s tests (light and `e2e/`) to react; run the
  lot, and explain each moved golden rather than re-pin it. A new lint rule moves a different set:
  `compose-assoc`, `lint-file-provenance`. `hillside-villa`'s prefilled-link budget in the playground
  test is the tightest constraint on that example: deflate output differs by zlib implementation (pako
  and zlib-ng measure 26–35 characters longer than Node/Chromium; the test is skipped on Node 18), so
  trim comments, never plan content.
- **A spec cut is provable only if the same fact remains in the file, after every parallel branch has merged.** Three cuts in one round removed facts called duplicates, and two branches cutting the same sentence's copies left none (#438, #439). Grep the file for the fact after each merge.
- **A same-length edit to an example still moves its permalink** (`test/readme-permalink.test.ts`): hashes read the text, not the geometry. Regenerate with `scripts/gen-permalink.mjs`.
- **`publish-openvsx.yml` builds the ref it is dispatched on**, and a version cannot be withdrawn: dispatch the tag, `--ref v<version>`, or code merged after the release ships under the released number.
- **A local run that skipped the full suite reports green on what it ran**: on a low-load round the corpus guards and CodeQL fire only in CI, so read a PR's checks before starting the next card.
- **A docs example may not name a new fixture family.** `test/new-families-byte-identity.test.ts` scans
  every shipped plan, Markdown fences in `docs/` included, for `furniture <new word>`: the byte-identity
  law's corpus must not change. Show new families in prose, and examples with existing families.
  `check:quick` cannot see this guard (it scans directories, never names the file); CI does.
- **`spec.llm.md` is capped below 30,000 UTF-16 units** (`test/llm-spec-drift.test.ts`) with little
  headroom, so new spec text must be paid for by cuts elsewhere in the file.

## Drawing (symbols)

- **A drawing-only change moves `describe --facts symmetry`.** A piece's `hand` is read off its
  drawn symbol. Unless it is an allow-listed loss of handedness, fix the glyph, never the fact
  (`docs/adr/0023-plan-symbol-drawing-language.md`, decision 7).
- **A symmetric glyph reads handed at one footprint or position and not another.** Cause: a
  structure decided by an ulp, or a mark and its mirror straddling a `fmt4` tie (compounded
  fractions of the footprint land on `x.xxxx5`). Remedy: `.claude/rules/glyphs.md`; why: ADR 0023.
- **Changing the default `furnitureStroke`/`furnitureFill` turns group 1 of
  `test/fixture-byte-identity.test.ts` red** — always a bug (ADR 0023, decision 6).
- **`vitest -u -t "<name>"` on a snapshot file deletes every snapshot the filter skipped** as obsolete
  (`snapshot.test.ts` lost its multi-level plans this way). Run `-u` unfiltered and read the diff.
- **`vitest -u` on `test/fixture-byte-identity.test.ts` rewrites every failing inline snapshot in
  the file, group 1 included.** Scope it: `-u -t "re-blessed when redrawn"`, then confirm group 1
  is untouched in the diff.
- **`npm run check:drift` regenerates in place.** A red run leaves the regenerated artifacts
  (`examples/*.svg` after any rendering change) modified in the working tree. Read the diff, then
  commit them or `git checkout --` them; do not mistake them for your own edits.

## PRs & CI

- **A branch cut before a release merges its `[Unreleased]` entry into the released section, with no
  conflict.** After merging `main`, check `git diff origin/main -- CHANGELOG.md` shows only added lines
  under `[Unreleased]`. If not, take main's file and insert the branch's lines; bullets have no blank
  line between them, so cut an entry on the next `- ` as well.
- **A change to the step meter moves every law that digests steps**: K1,
  `test/rectilinear-rooms-byte-identity.test.ts`, `test/block-stair-byte-identity.test.ts`. Re-take each by
  its own route, and show that putting the old count back reproduces the pinned digest.
- **A new example moves more than the example tables**: the corpus counts in `packages/archlang-3d`
  (`e2e/glb.e2e.ts`, `e2e/replay.e2e.ts`, `test/adapter-corpus.test.ts`, `test/mesh.test.ts`) and the digest
  rows naming it. `npm run check` does not run the e2e half: run `check:3d`.
- **The playground's startup budget is a sum, not a per-PR limit**: ordinary core growth reaches it
  eventually. Confirm no 3D marker is in the chunks, then re-take `playground/e2e/startup-chunks.baseline.json`
  with the reason in the commit. The budget stays.
- **A PR whose branch conflicts with `main` gets no CI run** (GitHub cannot build the merge ref).
  A PR sitting with no checks is in conflict: resolve first, then CI starts.
- **`gh pr checks <n> --watch --fail-fast` has exited early on the informational Benchmark job.**
  Watch without `--fail-fast`, then read every conclusion with
  `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`.
- **`gh pr checks <n> --watch` right after `gh pr create` can return before the checks register**, and
  the merge is then refused by branch policy. Before merging, confirm `mergeStateStatus` is `CLEAN`.
- **`gh pr merge --match-head-commit` needs the full 40-character SHA**; a short one fails the
  merge, and a branch delete `;`-chained after it then closes the PR unmerged. Auto-merge deletes
  the branch on merge: never delete it by hand (procedure: `commands.md` § Merging a PR).
- **`actions/setup-node` takes the runner's tool cache, which lags a Node security release by
  days**; every setup-node step carries `check-latest: true`, so a new one must too (the job log
  prints `Attempting to download` when it bites).
- **Select hashing tests by transitive import closure, not by a grep of `*.test.ts`.** `test/block-stair-byte-identity.test.ts`
  hashes through `test/block-stair-law.ts`, so a word search misses it, and only that law hashes the accessibility profile:
  a hint change went red in CI alone (#432). `packages/archlang-3d` and `packages/mcp-worker` hold hashing tests too.
- **Two PRs that both move digest tables can each be green and red together**: required checks are not
  up-to-date-with-`main`. Merge the first, merge `main` into the second, re-take, then pin it.
- **A guard that skips when a dependency is absent can be dead with the dependency present.** A test resolving
  `pdfkit/package.json` hit `ERR_PACKAGE_PATH_NOT_EXPORTED`, took the "absent" branch everywhere, and passed locally while
  never reading the file (#433). Run such a test with `CI=true` before trusting it.
- **Parallel PRs conflict on the records** (`CHANGELOG.md` `[Unreleased]`, a programme's
  `handoff.md` and `cards.md`) after nearly every merge. Resolve by keeping both entries; counts in
  those records are recounted only at a stage end, never per PR.
- **Node 18, Node 20 and Windows do not run on a PR**, so a green PR proves only Node 22 on Linux.
  A break on the others first shows in the push run on `main` (`commands.md` § CI). Suspect them for
  a `node:` API newer than Node 18, a dependency that drops an old Node, deflate output (the
  `hillside-villa` budget), and line endings or path handling.
- **A test file must not read what another test file wrote.** `vitest --shard` assigns files by sorted
  hash, so a new file can move others into another shard, on another runner. Symptom: a red shard on a
  PR that touched neither file. Write to a `mkdtemp` directory.
- **A new lint rule is registered beyond its module**: `test/d4-oracle.ts` `RULE_CLASS`, the
  append-only order windows (`slice(-N)` in `test/doors.test.ts`,
  `test/lint-circulation-privacy.test.ts`, `test/lint-space-enclosure.test.ts`), the per-stage counts
  in `test/stages.test.ts`, `test/defect-corpus/README.md`, the totals in
  `test/rooms-tiling-probe.test.ts` (#308), and `test/walls-from-rooms.test.ts`, which walks the
  `space-not-enclosed` corpus (a case that already says `walls from rooms` is skipped there; G5).
- **Two rule PRs in parallel conflict on all of those** plus `src/lint/rules/index.ts`,
  `src/error-catalog.ts` and `src/lint/ruleset.ts`: keep main's entry first, then the PR's; bump the
  windows and counts; re-take K1 and `gen:*` by their generators; re-insert catalogue and ruleset
  entries as whole blocks (a hunk-level merge split entries and broke the build, #315).
- **`validate`'s `next` and lint output feed the K1 keep digests**: a change to `next` or a new rule
  moves K1 rows. After merging `main`, re-run `npx tsx test/keep-weak-law-gen.ts` (D24); never
  hand-merge the table (#314). `keep-byte-identity` times out under a parallel local run: run it alone.
- **Editing `examples/` moves the playground e2e specs** (actions, layout and levels read
  `examples/hillside-villa.arch`) and the docs e2e: run `npm run e2e:playground` before pushing an
  examples PR (#305).

- CodeQL `js/polynomial-redos` fires on regexes in `test/` too, and the `analyze` job gates: slice
  a block with `indexOf` rather than a lazy `[\s\S]*?` match over compiler output.
- A PR that touches `docs/agents/commands.md` is high tier (`scripts/risk-tier.mjs`), so it needs the
  owner's words: keep such a line out of an otherwise medium PR and land it separately.
- `scripts/risk-tier.mjs` also puts `docs-site/public/_headers`, `_redirects`, any `server.json` and
  the root `package.json` in the high tier, so an SEO or metadata PR that regenerates `_headers`
  waits for the owner's words even when the rest is docs.
- Right after an OIDC publish, `npm view` and jsDelivr can still show the old version for a few
  minutes (the log says "being processed"): wait and re-query the registry; never re-run the release.

## Docs & prose

- **A quoted dimension must name its convention or carry a tilde.** A plan with wall thickness has
  a centreline size (`describe --json` `bbox`) and an outer-face size (`bbox_outer`). Settle it with
  `arch describe <file> --json --select bbox,bbox_outer`. Deliberately not gated.
- **`docs-site/sync-docs.mjs` copies `docs/*.md` and root artifacts into the site** (gitignored
  there). Edit the repo-root source, never the copy.
- **Pushing `main` deploys the docs; only a `v*` tag moves npm.** A merged, unreleased language
  feature makes `archlang.uk` document syntax `npx @chanmeng666/archlang` cannot parse. Say so when
  you land one without releasing it.

## Sites

- **VitePress `.vp-doc a:hover` (0,2,1) outranks a two-class rule (0,2,0).** A control whose colour
  must survive hover re-asserts `color` in its own `:hover` rule. Check hover/focus/active states.
- **A fixed hex in the site CSS is a fossil** — convert it to a token. The one legitimate literal is
  the CodeMirror lint squiggle's data-URI hex (a `var()` cannot enter an SVG data URI).
- **Changing a public host**: grep the host prefix without dots (`archlang-playground`), because some
  references are regexes with escaped dots. Schema `$id`s live in `src/plan-json.ts`/`src/intent.ts`
  (regenerate with `gen:*-schema`), agent-context URLs in `skills/archlang/SKILL.md` (`gen:llms`).
- **SEO** (`docs/seo.md`): crawlers execute no JavaScript, so only static bytes count; the
  killed-claim regexes on `PAGE_META`/`EXAMPLE_ROWS` are never widened — fix the copy; `/embed.html`
  is de-indexed by an `X-Robots-Tag` header, not a `robots.txt` Disallow; `_headers` binds to the
  request path, so `/` and `/index.html` each need their own rule.
- **`vitepress preview` caches its file index at startup.** Symptom: after a rebuild the page is 200
  but its hashed CSS 404s, and every measurement reads plausible and wrong. Restart the preview after
  every build, give a measurement server its own port (a parallel worktree may hold the fixed one),
  and gate on a marker only the new build has, never a status code.
- **`check:quick` picks the nearest tests**, so `docs-page-meta`, `docs-sync-list`, `docs-fences`
  and `docs-topics` may run only in CI for a docs-site PR; read its CI before calling it green.

- **An executor's targeted test subset misses corpus-wide guards.** On 2026-10-28 five PRs went red
  only under the full suite: the taste-digest table, the fixture corpus tables (import-module-lets,
  while and double-door byte identity, rooms-tiling-probe), the per-storey key list (`cli-levels`),
  and `context-size`'s hand-written catalogue size. Read the PR's full CI (`gh pr checks`) before pinning its auto-merge;
  a `check:quick` pass is never merge evidence, and the full suite runs in CI, not locally.
- **`spec.llm.md` has a 30,000-unit cap.** Two PRs that each fit can overflow
  together after merging: re-measure after every merge and pay with a provable-duplicate cut.
- **A branch cut before a release merges its CHANGELOG entry into the new version's section.**
  The release PR turns `[Unreleased]` into `## [x.y.z]` above an empty `[Unreleased]`; merging
  `main` into an older branch is then clean and leaves the branch's entry inside `[x.y.z]` (B3b,
  #337). After merging `main` past a release, check `node scripts/changelog-section.mjs <x.y.z>`
  does not list the branch's entry, and move it under `[Unreleased]`.
- **A record written through a shell `node -e`/heredoc loses its backslashes** (a Windows path's
  `\2…` became a control byte in a handoff, #335). Write such text with the Write/Edit tools, then
  `LC_ALL=C grep -c $'[\x01-\x08]' <file>` must print 0.

## Tooling & process

- **Claude in Chrome's screenshot can time out on platform.openai.com and after a Playground PDF
  download** ("renderer may be frozen"). The page still works: read and drive it with
  `javascript_tool`. A long `#z=` link cannot be retyped by hand; a truncated hash silently shows
  the default example, so check the editor's first line.
- **The `alg-*` executors do not push**; the main session pushes and opens the PR, and writes the body if
  the executor did not. A worktree branch can track `origin/main`, so push with an explicit
  `HEAD:<branch>`.
- **The session scratchpad is shared by parallel executors**: give each its own subfolder in the brief. A
  reviewer's `scratchpad/` left inside a worktree fails `npm run check` on lint, and must not be staged.
- **In the Bash tool `/tmp` is not the `/tmp` Node resolves** (`D:\tmp` here): pass scratch paths through an
  environment variable or use the session scratchpad.
- **A worktree locked by the running session refuses `git worktree remove`**, even with `--force`. Leave
  it for the session's end rather than removing it with `-f -f`.
- **`npx vitest run --maxWorkers=N` errors in this repo unless `--minWorkers=1` is also given.**
- **Under heavy machine load the visual, sheet and roof tests can time out.** Rerun the file alone
  before suspecting the code.
- **`test/reroll-findrun-oracle.test.ts` › "generated sources" is an unseeded property flake**: it
  asserts `> 0` suggestions over 60 fast-check runs with no `seed`, and about 0.5 % of runs (seeds
  124, 461, 524 of 640) offer none. A one-off red there is legitimately re-run; the fix is owed
  (seed it or assert across runs; `docs/backlog.md`).
- **`npx tsx test/keep-weak-law-gen.ts` needs a reason argument** and prints only a usage line without one, so a
  conflict in `test/keep-byte-identity-baseline.ts` stays unresolved if you do not read its output.
- **`check:drift` reports the generated `_headers` as drift while a new docs page is uncommitted.** Commit, then run it.
- **Two green PRs can break `main` together.** #521 required one MP4 per 3D plan and #523 added
  plans without one; each PR's CI ran without the other, and `main`'s docs build (and deploy) went
  red until #525. When two open PRs share a data shape (a manifest, a JSON schema, a component's
  props), rebase the second after the first merges, and read `main`'s own CI after every merge.
- **CI runs only on PRs whose base is `main`.** A stacked PR gets no CI, and retargeting it to
  `main` fires `edited`, not a run: push a commit (or rebase and force-push) to start one.
- **`check:drift` reads committed files.** An uncommitted edit to a file with a generated block
  (`README.md`, `llms.txt`, the MCP and VS Code READMEs) reads as drift: commit, then run it.
- **`python3` on this machine is a stub that silently does nothing.** Use `python`.
- **A worktree's playground typecheck can miss `@resvg/resvg-wasm`** (the primary checkout's
  `node_modules` lacks it): run `npm ci` in the worktree rather than junctioning.
- **vsce rejects an SVG image from a host outside its badge allow-list** (raw.githubusercontent.com
  included): the VS Code README uses PNGs.
- **archlang-3d key frames are pinned from CI's printed hashes.** A change that moves frames leaves
  `e2e/fixtures/keyframe-baseline.json` alone, `check-3d` prints the new hashes, and a follow-up
  commit on the same PR pins them with the run link (`e2e/fixtures/README.md`). `check-3d` is not a
  required check, so never merge with it red.
- **Cloudflare static assets answer a `Range` request with 200, not 206**, so an MP4 may not play
  on Safari: every replay on the sites keeps its poster and an MP4 link as the fallback.
- **`2>nul` in the Bash tool on Windows creates files** named `nul`, `nul.L0`, `nul.L1` in the
  working tree (it is cmd syntax). Write `2>/dev/null`.

- **`packages/archlang-3d` imports `playwright-core` lazily** (inside the function that launches a
  browser): 1.64 calls `process.exit(1)` on import under Node < 20, and CI's Node 18 leg runs the
  package's light tests. After a dependency lands in a workspace, a checkout whose `node_modules`
  predates it needs `npm ci`, or every junctioned worktree fails to resolve it.
- **`tsx` honours a workspace `tsconfig` `paths` entry that points at a `.d.ts`** and then loads a
  file with no runtime exports; `packages/archlang-3d` resolves the core through the workspace link.

- **(Typecheck) A file's compiler options come from the program compiling it.** A root test that
  imports a workspace module pulls it into the root program (`noUncheckedIndexedAccess` on), and
  `exclude` cannot keep it out. Symptom: `TS2345 … | undefined` on workspace source that
  `tsc -p <workspace>` calls clean. Fix it in the shared module, never by relaxing the root option;
  `tsc -p tsconfig.dev.json --listFiles` shows what the program pulls in.
- **Two actors in one worktree share one checkout.** A reviewer's `git checkout -b probe` silently
  redirects the other's commits. Verify a branch from a separate checkout (or `git -C`), and re-read
  an agent branch's tip with `git rev-parse` before merging it.
- **A literal NUL byte in a source file makes git and ripgrep treat it as binary** (the diff shows
  `Bin`, search skips the file). Write `\u0000`.
- **`check:drift` reads the committed or staged tree**, so a release bump fails it until the bump is committed.
- **A new `.gitleaksignore` fingerprint on a live file needs a rule in `test/opaque-literal-guard.test.ts`.**
- **gitleaks `generic-api-key` flags SHA-256 digest tables keyed by a name containing a key-ish word**
  (e.g. `accessible`). Allowlist the exact fingerprint per `.gitleaksignore`'s header and hold the
  file in `test/opaque-literal-guard.test.ts`; never a glob. The fingerprint names the branch commit,
  so the branch must land by a merge commit: a squash or rebase re-creates the line in a new commit
  and the nightly full-history scan flags it again.
- **In a `.claude/worktrees/*` checkout whose `node_modules` is a junction to the primary,
  `editors/vscode/test/wrong-core.test.ts` fails by design**, so `npm run check` is fully green only
  in the primary checkout and a `&&` gate chain stops there. Run gates one by one in a worktree;
  build/package the extension and the MCP shim only in the primary.
- **Card tests under `test/` and the playground specs are typed and run only by `typecheck:all` and
  the playground e2e in the PRIMARY checkout.** A worktree whose `node_modules` is a junction
  resolves an older core, so those two gates are invalid there.
- **A stale zero-byte `.git/index.lock` in the primary checkout** (left by a killed git process)
  makes `git checkout` and `gh pr merge` fail. Delete it only after confirming no git process runs.
- **The primary checkout can hold CRLF working copies** (`core.autocrlf=true`) that git shows clean;
  byte-digest tests then fail only there. `git ls-files --eol | grep w/crlf` finds them: delete the
  file and `git checkout -- <path>`; never re-pin a digest.
- **The hosted MCP's precise rate guard is a zone WAF rule in the Cloudflare dashboard**
  (`mcp abuse guard`, ADR 0026 "Addendum: production"). The Worker's own bindings count per server,
  so the repository alone shows a limit that does not hold; the WAF rule covers every path on the host.
- **A version bump reddens `npm run check` until `editors/vscode/dist/server.js` is rebuilt**:
  `editors/vscode/test/stdio.test.ts` compares the bundle's stamped core version with the
  workspace's. Release gate order is in `docs/agents/commands.md`.
- **`@chanmeng666/arch-plan`'s `prepack` refuses a stale root `dist/`**: run `npm run build` at the
  root before packing or publishing it.
- **(npm) A newly registered trusted publisher lapses unless a publish goes through it within about
  48 hours**; dispatch `release.yml` once (`.claude/commands/release-check.md`).
- **Remove a worktree's `node_modules` junctions with `cmd /c rmdir <path>`** before
  `git worktree remove --force` or any recursive delete, or the delete follows them into the primary.
  Git Bash's `ln -s` does not link: it COPIES the target, and a copy of the primary's `node_modules`
  carries its workspace junctions (one points at the repository root). Scan any such copy for
  reparse points and unlink each (`[System.IO.Directory]::Delete(<junction>)`) before deleting it.
- **A clean auto-merge of a moved function another branch modified is not evidence.** Taking one
  side can silently revert the other's fix with a green suite. Diff the moved body against the newer
  version and run both branches' fixtures together. The same holds for a CALLER: a PR's new rule
  called `doorSwing()` while a parallel PR made it return null for `door … double`; the merge was
  clean and the rule went silent on double doors. After merging `main` into a PR, red-team the
  merged head, and grep every caller of a function the other branch changed.
- **(MCP registry) The `io.github.ChanMeng666/*` namespace is case-sensitive and identity-checked**
  against the npm package's `mcpName`, and the server `description` is capped at 100 chars.
- **(MCP registry) Search matches server names only**, so the 100-char `description` says what the
  server is for; the tool-name lockstep lives in `packages/mcp/README.md`'s tool table
  (`packages/mcp/test/server.test.ts`).
- **`taskkill` on `workerd.exe` kills every session's `wrangler dev`.** Stop only the process you
  started, by its PID.
- **The Claude in Chrome extension drops after a terminal crash**; the owner reconnects it with
  `/chrome`.
- **Off-site messages are the owner's in practice, not only by rule:** X and LinkedIn paywall a
  message request to someone who does not follow the account, Reddit refuses every agent route
  (extension, HTTP, fetch), and a subagent will not send a message on an approval relayed by
  another agent, so the main session acts on the owner's words itself or hands the item back.
- **(Eval) Reasoning models spend thinking tokens out of `max_completion_tokens`.** An implausibly low
  score means suspect the token cap (`eval/run.ts` uses 16384) before the language.
- **(Dataset) `dataset/out/` is gitignored and HF-only.** On re-upload the card's
  `task_categories` must come from HF's official list (`text-generation`), under the `ChanMeng666`
  namespace. See `dataset/README.md`.
