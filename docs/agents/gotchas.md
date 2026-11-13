# Gotchas

Non-obvious traps that no test catches, or whose symptom points the wrong way. Each: rule · symptom
· fix. Anything a test already enforces is left to that test's failure message.

This file holds the traps every executor needs. Path-specific traps live in the rule that loads
for that path (`.claude/rules/`: `glyphs`, `examples`, `tests`, `cli`, `sites`, `playground-e2e`,
`archlang-3d`, `release-and-packages`, `docs-prose`, `eval-dataset`, `mcp`, `plan-json`); the
coordinator's own notes (merging, registries, browser and social automation, the executor brief) live in
`docs/agents/orchestration.md`. Goldens: `.claude/rules/tests.md` and `docs/testing.md` § 2–3.

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
- **A new handed/oriented fact crosses `place` only through the element's own `transform`**; the
  equivariance oracle (`test/helpers/d4-oracle.ts`) will pin it `NEW` otherwise, not fail silently.
- **A lint fix inside a turned or mirrored `place` must pull its value back through the instance
  frame before writing it** (`LintContext.frameOf`, `src/lint.ts`), or the machine-applicable edit
  is correct in plan coordinates and wrong once `arch fix` writes it back into the component body.
- **A spec cut is provable only if the same fact remains in the file, after every parallel branch has merged.** Three cuts in one round removed facts called duplicates, and two branches cutting the same sentence's copies left none (#438, #439). Grep the file for the fact after each merge.
- **`spec.llm.md` is capped below 30,000 UTF-16 units** (`test/llm-spec-drift.test.ts`) with little
  headroom, so new spec text must be paid for by cuts elsewhere in the file. Two PRs that each fit can
  overflow together after merging: re-measure after every merge and pay with a provable-duplicate cut.

## PRs & CI

- **`vitest -u -t "<name>"` (the owner's update command) on a snapshot file deletes every snapshot the filter skipped** as obsolete
  (`snapshot.test.ts` lost its multi-level plans this way). Run `-u` unfiltered and read the diff.
  (guarded: hook rule `filtered-update`, `.claude/hooks/local-gate.mjs`, even under `#allow-local-heavy`)
- **`vitest -u` (the owner's update command) on `test/fixture-byte-identity.test.ts` rewrites every failing inline snapshot in
  the file, group 1 included.** Scope it: `-u -t "re-blessed when redrawn"`, then confirm group 1
  is untouched in the diff. (guarded: hook rule `filtered-update` refuses any other `-u` naming the file)
- **CI runs `check:drift` and fails on drift; the local `check:quick` regenerates in place** and leaves the
  artifacts (`examples/*.svg` after any rendering change) modified in the working tree. Read the diff, then
  commit them or `git checkout --` them; do not mistake them for your own edits.
- **A branch cut before a release merges its `[Unreleased]` entry into the released section, with no
  conflict.** The release PR turns `[Unreleased]` into `## [x.y.z]` above an empty `[Unreleased]`, so
  merging `main` into an older branch is clean and leaves the branch's entry inside `[x.y.z]`. After merging `main`, check `git diff origin/main -- CHANGELOG.md` shows only added lines
  under `[Unreleased]`. If not, take main's file and insert the branch's lines; bullets have no blank
  line between them, so cut an entry on the next `- ` as well. After merging `main` past a release,
  `node scripts/changelog-section.mjs <x.y.z>` must not list the branch's entry; move it under `[Unreleased]` (B3b, #337).
  (guarded: CI's `changelog` job, `scripts/check-changelog-unreleased.mjs`, on every PR; a deliberate edit of
  released history carries the label `changelog-exempt`)
- **A change to the step meter moves every law that digests steps**: K1,
  `test/rectilinear-rooms-byte-identity.test.ts`, `test/block-stair-byte-identity.test.ts`. Re-take each by
  its own route, and show that putting the old count back reproduces the pinned digest.
- **A PR whose branch conflicts with `main` gets no CI run** (GitHub cannot build the merge ref).
  A PR sitting with no checks is in conflict: resolve first, then CI starts.
- **Select hashing tests by transitive import closure, not by a grep of `*.test.ts`.** `test/block-stair-byte-identity.test.ts`
  hashes through `test/helpers/block-stair-law.ts`, so a word search misses it, and only that law hashes the accessibility profile:
  a hint change went red in CI alone (#432). `packages/archlang-3d` and `packages/mcp-worker` hold hashing tests too.
- **Two PRs that both move digest tables can each be green and red together**: required checks are not
  up-to-date-with-`main`. Merge the first, merge `main` into the second, re-take, then pin it.
- **Parallel PRs conflict on the records** (`CHANGELOG.md` `[Unreleased]`, a programme's
  `handoff.md` and `cards.md`) after nearly every merge. Resolve by keeping both entries; counts in
  those records are recounted only at a stage end, never per PR.
- **`gh pr update-branch` stales the generated artifacts.** GitHub's textual merge of `test/INDEX.md`
  (its header count) and `docs/agents/module-map.md` is not the generator's output, so the updated head
  fails `check:drift`/`test-index` (#669, 2026-11-10). When `main` moved a generated file since the branch,
  merge `main` locally, run `npm run gen:all`, commit, push, re-pin (`commands.md` § Merging a PR).
- **The PR-scale fuzz passes while the nightly's `FC_SCALE=10` fails.** A seeded property replays the same
  first runs, so a counterexample at run 494+ only ever appears in `fuzz-deep` (#664). Download its
  `fuzz-deep-report.json`, reproduce with a `tsx` probe, then card the real defect; never widen the seed.
- **A user-facing message never prints `Infinity`, `NaN` or an exponent** (`test/lint-stairs.test.ts`
  pins `/Infinity|NaN|e\+\d/`): classify the value in words ("not a finite number"), do not echo it.
- **Node 18, Node 20 and Windows do not run on a PR**, so a green PR proves only Node 22 on Linux.
  A break on the others first shows in the push run on `main` (`commands.md` § CI). Suspect them for
  a `node:` API newer than Node 18, a dependency that drops an old Node, deflate output (the
  `hillside-villa` budget), and line endings or path handling. Run a changed generator under Node 18
  before merging a tooling PR (#703 reached `main` red as #705), and never hand tsx a tsconfig with
  `extends` there: its loader calls `toReversed` (Node 20+); keep such a config self-contained (#708).
- **A test's oracle can encode the bug the PR fixes.** After #711 widened the point interner to `SNAP_MM`,
  `test/interner-oracle.test.ts` went red on `[{x:0,y:0.0949},{x:0,y:0.105}]`: the old string-keyed
  predecessor did not fuse those two points, the new interner rightly does. When an oracle goes red on a
  fix, ask whether it guards the old behaviour, and replace it with a brute-force reference; do not re-pin.
- **A new e2e can be flaky by a race, not by the machine.** #718: a gallery pick schedules a 250 ms debounced
  render whose stale result overwrote a knob edit. Pin the race deterministically (wait past the debounce
  window, then assert the state held), never a retry.
- **A new lint rule is registered beyond its module**: `.claude/commands/new-lint-rule.md` is the
  checklist and `test/lint-rule-order.test.ts` fails with every derivable place named (the full
  order list, `test/helpers/d4-oracle.ts` `RULE_CLASS`, the catalogue, `test/tables/stage-decisions.ts`); then the
  per-stage counts in `test/stages.test.ts`, `test/defect-corpus/README.md`, the totals in
  `test/rooms-tiling-probe.test.ts` (#308), and `test/walls-from-rooms.test.ts`, which walks the
  `space-not-enclosed` corpus (a case that already says `walls from rooms` is skipped there; G5).
- **Two rule PRs in parallel conflict on all of those** plus `src/lint/rules/index.ts`,
  the catalogue family file (`src/error-catalog/<family>.ts`; two rules of different families no
  longer share one) and `src/lint/ruleset.ts`: keep main's entry first, then the PR's; bump the
  windows and counts; re-take K1 and `gen:*` by their generators; re-insert catalogue and ruleset
  entries as whole blocks (a hunk-level merge split entries and broke the build, #315).
- **`validate`'s `next` and lint output feed the K1 keep digests**: a change to `next` or a new rule
  moves K1 rows. After merging `main`, re-run `npx tsx test/keep-weak-law-gen.ts` (D24); never
  hand-merge the table (#314). `keep-byte-identity` times out under a parallel local run (CI runs it alone).

- **An executor's targeted test subset misses corpus-wide guards.** On 2026-10-28 five PRs went red
  only under the full suite: the taste-digest table, the fixture corpus tables (import-module-lets,
  while and double-door byte identity, rooms-tiling-probe), the per-storey key list (`cli-levels`),
  and `context-size`'s hand-written catalogue size. Read the PR's full CI (`gh pr checks`) before pinning its auto-merge;
  a `check:quick` pass is never merge evidence, and the full suite runs in CI, not locally.
  (guarded, in part: for an `examples/` or `docs/**/*.md` change `check:quick` runs the tests that list
  that folder first, within its 20-file cap; CI runs the rest)
- **A record written through a shell `node -e`/heredoc loses its backslashes** (a Windows path's
  `\2…` became a control byte in a handoff, #335). Write such text with the Write/Edit tools, then
  `LC_ALL=C grep -c $'[\x01-\x08]' <file>` must print 0. (guarded: `test/no-control-bytes.test.ts`, every
  tracked `*.md`)
- **An escaper written with `String.replace` (Markdown table cells, GitHub annotation `::warning` text, regex
  builders) trips CodeQL `js/incomplete-sanitization` (high) when its class omits `\`**, and `CodeQL` is a
  required check since 2026-11-09: write escapers as a character map
  (`Array.from(s, c => TABLE[c] ?? c).join("")`), never a replace chain. Three PRs (#620, #629, #639) each
  lost a CI round to this.
- **Run every pre-tag proof on the release branch head before merging the version-bump PR**, so that after the merge only
  pull, tag and push remain. On 2026-11-10 #689 merged at 13:55Z and `v1.58.0` was pushed at 23:33Z; for those 9 h 38 min
  `https://archlang.uk/arch-plan.js` pointed at a core version npm did not yet have, and `<arch-plan>` embeds failed (a push to
  `main` deploys the sites; the tag publishes the packages). The cause of the stall was not established. As general practice, an unattended
  critical path holds no command that can raise a permission prompt (`rm` among them).
- **Never mint the MCP registry JWT before a long wait.** `mcp-publisher login github-oidc` yields a short-lived token; on
  2026-11-12 (v1.60.0) the login was minted before the npm-visibility wait (6m27s; the wait allows up to 10 min), which
  outlived the registry JWT (< ~6.5 min), and all six publish retries got `401 ... token is expired`.
  `release.yml` now logs in inside the retry loop, before every attempt.
- **A 3D replay change can be right in the final frame and the posters and wrong mid-rise.** The replay raises
  each wall on its own, so a face two walls share can be missing while one is up and the other is not; #691's
  first version showed a see-through slot in laneway's replay at 6.80 s, and its key frames and posters were
  clean (only laneway's `tilted` key frame is taken mid-rise). Compare frames taken during the rise, not only
  the last one, before calling a replay change done.

## Tooling & process

- **A root `.ignore` hides `CHANGELOG`, generated files and goldens from ripgrep** (and the Grep tool);
  name the path to search them.
- **A new `.gitleaksignore` fingerprint on a live file needs a rule in `test/opaque-literal-guard.test.ts`.**
- **gitleaks `generic-api-key` flags SHA-256 digest tables keyed by a name containing a key-ish word**
  (e.g. `accessible`). Allowlist the exact fingerprint per `.gitleaksignore`'s header and hold the
  file in `test/opaque-literal-guard.test.ts`; never a glob. The fingerprint names the branch commit,
  so the branch must land by a merge commit: a squash or rebase re-creates the line in a new commit
  and the nightly full-history scan flags it again.
- **In the Bash tool `/tmp` is not the `/tmp` Node resolves** (`D:\tmp` here): pass scratch paths through an
  environment variable or use the session scratchpad.
- **`check:drift` reports the generated `_headers` as drift while a new docs page is uncommitted.** Commit, then run it.
- **`check:drift` reads committed files.** An uncommitted edit to a file with a generated block
  (`README.md`, `llms.txt`, the MCP and VS Code READMEs) reads as drift: commit, then run it.
- **After a dependency PR merges, run `npm install` in the primary checkout.** A worktree's `node_modules`
  is a junction to it, so every worktree gate keeps using the old tool until you do (biome stayed 2.5 in
  worktrees after 2.6 landed on `main`).
- **Release the heavy-lock only if it still holds your own line** (`orchestration.md` § Heavy lock). An
  unconditional `free` wiped another agent's line once.
- **A reviewer never runs `git checkout` (or `switch`) in the primary checkout**: it moves every session
  sharing it off `main`. Review from a separate worktree or with `git -C`.
- **`python3` on this machine is a stub that silently does nothing.** Use `python`.
- **`2>nul` in the Bash tool on Windows creates files** named `nul`, `nul.L0`, `nul.L1` in the
  working tree (it is cmd syntax). Write `2>/dev/null`.
- **(Typecheck) A file's compiler options come from the program compiling it.** A root test that
  imports a workspace module pulls it into the root program (`noUncheckedIndexedAccess` on), and
  `exclude` cannot keep it out. Symptom: `TS2345 … | undefined` on workspace source that
  `tsc -p <workspace>` calls clean. Fix it in the shared module, never by relaxing the root option;
  `tsc -p tsconfig.dev.json --listFiles` shows what the program pulls in.
- **A literal NUL byte in a source file makes git and ripgrep treat it as binary** (the diff shows
  `Bin`, search skips the file). Write `\u0000`.
- **`check:drift` reads the committed or staged tree**, so a release bump fails it until the bump is committed.
- **In a `.claude/worktrees/*` checkout whose `node_modules` is a junction to the primary,
  `editors/vscode/test/wrong-core.test.ts` fails by design**, so the owner's release-gate `npm run check` is fully green only
  in the primary checkout and a `&&` gate chain stops there. Run gates one by one in a worktree;
  build/package the extension and the MCP shim only in the primary.
- **Card tests under `test/` and the playground specs are typed and run by CI's `typecheck:all` and
  the playground e2e.** In a worktree whose `node_modules` is a junction both would resolve an
  older core and be invalid, so read them from the PR's CI.
- **Remove a worktree's `node_modules` junctions with `[System.IO.Directory]::Delete(<junction>)`** (never recursive; the PowerShell tool blocks `cmd /c rmdir`) before
  `git worktree remove --force` or any recursive delete, or the delete follows them into the primary.
  (guarded: hook rule `delete-through-link` refuses the delete while a link sits within six levels of the target)
  Git Bash's `ln -s` does not link: it COPIES the target, and a copy of the primary's `node_modules`
  carries its workspace junctions (one points at the repository root). Scan any such copy for
  reparse points and unlink each (`[System.IO.Directory]::Delete(<junction>)`) before deleting it.
- **A clean auto-merge of a moved function another branch modified is not evidence.** Taking one
  side can silently revert the other's fix with a green suite. Diff the moved body against the newer
  version and run both branches' fixtures together. The same holds for a CALLER: a PR's new rule
  called `doorSwing()` while a parallel PR made it return null for `door … double`; the merge was
  clean and the rule went silent on double doors. After merging `main` into a PR, red-team the
  merged head, and grep every caller of a function the other branch changed.
- **(Eval) Reasoning models spend thinking tokens out of `max_completion_tokens`.** An implausibly low
  score means suspect the token cap (`eval/run.ts` uses 16384) before the language.
