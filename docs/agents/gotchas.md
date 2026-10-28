# Gotchas

Non-obvious traps that no test catches, or whose symptom points the wrong way. Each: rule · symptom
· fix. Anything a test already enforces is left to that test's failure message.

## Core

- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen, so it
  flips with the order of a wall's points. Each leaf's sector comes from `doorLeaves` in
  `geometry.ts` (a `double` door's two, built with `doorSwing`'s geometry), shared by
  `door.render()` and every swing measure — keep them on that one helper. `doorSwing` alone
  returns null for a `double`, so a new caller of it skips double doors silently.
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
  `docs-examples-figures`, `example-svgs-drift`, `rooms-tiling-probe`, `taste-digests`, the
  `*-digests` and `*-byte-identity` suites and `playground/test/llm-prompt.test.ts` to react; run the
  lot, and explain each moved golden rather than re-pin it. A new lint rule moves a different set:
  `compose-assoc`, `lint-file-provenance`. `hillside-villa`'s prefilled-link budget in the playground
  test is the tightest constraint on that example: deflate output differs by zlib implementation (pako
  and zlib-ng measure 26–35 characters longer than Node/Chromium; the test is skipped on Node 18), so
  trim comments, never plan content.
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
- **`vitest -u` on `test/fixture-byte-identity.test.ts` rewrites every failing inline snapshot in
  the file, group 1 included.** Scope it: `-u -t "re-blessed when redrawn"`, then confirm group 1
  is untouched in the diff.
- **`npm run check:drift` regenerates in place.** A red run leaves the regenerated artifacts
  (`examples/*.svg` after any rendering change) modified in the working tree. Read the diff, then
  commit them or `git checkout --` them; do not mistake them for your own edits.

## PRs & CI

- **A PR whose branch conflicts with `main` gets no CI run** (GitHub cannot build the merge ref).
  A PR sitting with no checks is in conflict: resolve first, then CI starts.
- **`gh pr checks <n> --watch --fail-fast` has exited early on the informational Benchmark job.**
  Watch without `--fail-fast`, then read every conclusion with
  `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`.
- **`gh pr merge --match-head-commit` needs the full 40-character SHA**; a short one fails the
  merge, and a branch delete `;`-chained after it then closes the PR unmerged. Auto-merge deletes
  the branch on merge: never delete it by hand (procedure: `commands.md` § Merging a PR).
- **`actions/setup-node` takes the runner's tool cache, which lags a Node security release by
  days**; every setup-node step carries `check-latest: true`, so a new one must too (the job log
  prints `Attempting to download` when it bites).
- **Parallel PRs conflict on the records** (`CHANGELOG.md` `[Unreleased]`, a programme's
  `handoff.md` and `cards.md`) after nearly every merge. Resolve by keeping both entries; counts in
  those records are recounted only at a stage end, never per PR.
- **CI's Node jobs run biome before vitest**, so a PR whose only red was formatting has never run
  its tests: the run after the formatting fix is its first test run. Run `npx biome check .` before
  pushing (#307, #308).
- **A new lint rule is registered beyond its module**: `test/d4-oracle.ts` `RULE_CLASS`, the
  append-only order windows (`slice(-N)` in `test/doors.test.ts`,
  `test/lint-circulation-privacy.test.ts`, `test/lint-space-enclosure.test.ts`), the per-stage counts
  in `test/stages.test.ts`, `test/defect-corpus/README.md`, the totals in
  `test/rooms-tiling-probe.test.ts` (#308).
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

- **An executor's targeted test subset misses corpus-wide guards.** On 2026-10-28 five PRs went red
  only under the full suite: the taste-digest table, the fixture corpus tables (import-module-lets,
  while and double-door byte identity, rooms-tiling-probe), the per-storey key list (`cli-levels`),
  and `context-size`'s hand-written catalogue size. Run the full `npm run check` on every branch
  before pinning its auto-merge.
- **`spec.llm.md` sat at 29,999 of 30,000 on 2026-10-28.** Two PRs that each fit can overflow
  together after merging: re-measure after every merge and pay with a provable-duplicate cut.

## Tooling & process

- **`npx vitest run --maxWorkers=N` errors in this repo unless `--minWorkers=1` is also given.**
- **Under heavy machine load the visual, sheet and roof tests can time out.** Rerun the file alone
  before suspecting the code.
- **`test/reroll-findrun-oracle.test.ts` › "generated sources" is an unseeded property flake**: it
  asserts `> 0` suggestions over 60 fast-check runs with no `seed`, and about 0.5 % of runs (seeds
  124, 461, 524 of 640) offer none. A one-off red there is legitimately re-run; the fix is owed
  (seed it or assert across runs; `docs/backlog.md`).
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
- **A clean auto-merge of a moved function another branch modified is not evidence.** Taking one
  side can silently revert the other's fix with a green suite. Diff the moved body against the newer
  version and run both branches' fixtures together. The same holds for a CALLER: a PR's new rule
  called `doorSwing()` while a parallel PR made it return null for `door … double`; the merge was
  clean and the rule went silent on double doors. After merging `main` into a PR, red-team the
  merged head, and grep every caller of a function the other branch changed.
- **(MCP registry) The `io.github.ChanMeng666/*` namespace is case-sensitive and identity-checked**
  against the npm package's `mcpName`, and the server `description` is capped at 100 chars.
- **(Eval) Reasoning models spend thinking tokens out of `max_completion_tokens`.** An implausibly low
  score means suspect the token cap (`eval/run.ts` uses 16384) before the language.
- **(Dataset) `dataset/out/` is gitignored and HF-only.** On re-upload the card's
  `task_categories` must come from HF's official list (`text-generation`), under the `ChanMeng666`
  namespace. See `dataset/README.md`.
