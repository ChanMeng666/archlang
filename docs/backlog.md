# Backlog

Forward-looking work queue. **`CHANGELOG.md` remains the only record of what shipped** — this file
records what has not, and is deleted from as items land. Item numbers are stable identifiers, so a
gap in the sequence means that item shipped; the commit that closed it is cited by whatever
referenced it. Closed entries are archived verbatim in the private sibling repository, at
`archlang-lab/backlog-archive.md` (`scripts/backlog-archive.mjs` does the move); an archived id that a
tracked file still cites leaves a one-line tombstone `- <id> · <title> — <status> → archived (lab)`.
Every heading here reads ``### <id> · <title> — `<status>` ``, with status one of `todo`, `declared`,
`parked`, `deferred`, `decision` (waits on the owner), `note`. `docs/backlog-index.md` lists them all; it is
generated, so run `npm run gen:backlog-index` after any heading change.

It is also the state file for the `/loop` burn-down driver:

```
/loop Read docs/backlog-index.md. Take the topmost row whose status is `todo`. Locate it with
`grep -n '^### <id> · ' docs/backlog.md` and read from that line to the next `### `. Dispatch one
Opus subagent with isolation:"worktree" to implement it, run that item's stated verification gate,
then report the diff and the gate output to me and STOP for approval. Do not commit, do not
push, do not start a second item in the same tick.
```

**Floor gate for every item:** `npm run check:quick` locally (plus `npm run docs:build` for any
`docs/*.md` edit), then the PR's CI green: `check`, `check:drift`, `typecheck:all` and the E2E run
there, never on the owner's machine (`docs/agents/iron-laws.md`). Items list only what they add on top.

**Merge protocol** (a clean auto-merge is not evidence of correctness — one branch once *moved* a
function another had *modified*, and taking "theirs" would have silently reverted the fix with a
green suite): one worktree per item, never two concurrent items on the same file; diff moved or
renamed bodies against the newer version, not just the conflict set; run both branches' fixtures
together before merging; read the PR's CI `typecheck:all` after **every** merge.

**Read an entry's observations as evidence and its diagnosis as a hypothesis.** Symptoms here have
been reliable; stated causes have been wrong about as often as right. Check the arithmetic of a
stated cause before building on it, re-measure any number an entry quotes, and when an entry leaves
open which of two components is wrong, settle that first. Correct the entry in place when you close
it.

---

## Awaiting an owner decision

Each of these changes shipped output or tooling in a way the code cannot choose for itself. None
is to be started until its question is answered; the entry named holds the evidence.

| Item | The question |
|---|---|
| 3.1 (b) | Take the `vitest` 2 → 5 major now, or keep waiting on the entry's triggers? |
| M.9 | Should grid snap and `fmt2` round half away from zero, so a mirror image snaps alike? It moves output. |
| M.14 | Should a roof's acute corner be bevelled or miter-limited, and at what limit? |
| D.7 | One hairline for the whole sheet? The title block's rules would move in every example. |

---

## Programmes with their own card list

A programme keeps its cards, decisions and evidence in its own folder, and this file only points
at it. Its cards follow the same rules as entries here: stable ids, deleted when they land.

| Programme | Folder | What it is for |
|---|---|---|
| Plan soundness (`PS*` cards) | `docs/plans/plan-soundness/` | Professional rules and taste: relation-first authoring, validity checks that read existing facts, a change model (`impact`, `keep`), a taste score. Takes over G.12 as card PS3 |
| Preview and remodel (A–F cards) | `docs/plans/preview-and-remodel/` | The downstream `packages/archlang-3d` reader of a resolved plan (ADR 0030, plan `docs/plans/archlang-3d/`) and the renovation wedge (wall status, a lock check, quantities, imperial input) |
| Drawing set (`DS*` cards) | `docs/plans/drawing-set/` | A scheme-stage drawing set from one model: derived indicators, a site layer, sections and elevations in `packages/archlang-3d`, analysis diagrams, a sheet pack |
| Engineering health (`EH*` cards) | `docs/plans/engineering-health/` | Mechanical guards for every breakage class the 2026-11-09 audits found, CI/release/deploy signal, pure-move splits of the churn hotspots, generated maps, the backlog split |
| Math foundations (`MF*` cards) | `docs/plans/math-foundations/` | Exact clear width, walking distance, a footprint × height-interval model (wall-hung, ceiling-hung, curtains; `mount` as pure data in MF12, while 5.5's "above the cut" spelling stays its own question, MF-D3(a)), and the groundwork for drawing-set sections. Takes in M.12 as MF5 and M.16's clear-width item as MF1 |
| Checker reach (`CR*` cards, follow-ups `CRF*`) | `docs/plans/checker-reach/` | Interop (OpenPlan3D import, later OAS), short share links and preview cards, free 3D orbit, a write guard (`--expected-hash`), a public check suite and a versioned language spec before and after Show HN |

---

## Wave 3 — hygiene, freshness, and the missing example

### 3.1 · Nightly is red — and NOT for the reason this entry said (issue #66) — `todo`

**Corrected 2026-09-04 by reading the job list, and the entry was wrong twice over.**

**Wrong about WHICH job.** The failing job is **`Secret scan (gitleaks)`**. `Dependency audit
(report-only)` **passes** — it is report-only by design and cannot fail the night. So every night
this entry has been blamed for was a secret-scan failure.

**The gitleaks half is now fixed** (`.gitleaksignore`): three findings, all in
`paper/experiments/ecosystem/results-2026-08-22.json` at commit `ba3bbc4c`, all matched by the
`sourcegraph-access-token` rule, which fires on a bare 40-character hex run — and a git commit SHA
is one. Two are SHA-pinned GitHub Action references in a third party's workflow diff, the third is a
public npm package's `revision`. All three are other people's public commit SHAs; none is a
credential. They cannot be deleted, because `paper/` moved to a separate repository on 2026-08-26 and
gitleaks scans the FULL HISTORY. Allowlisted by commit-pinned fingerprint, so nothing else in that
file — or anywhere else — is suppressed. Verified locally: 648 commits, 0 findings; removing one
fingerprint makes exactly that one reappear.

**Wrong about the ADVISORY COUNT, which has quadrupled.** The entry says six advisories tracing to
exactly two roots. Measured 2026-09-04:

```
npm audit → 19 vulnerabilities: 2 critical, 9 high, 8 moderate
```

across a dozen roots — `brace-expansion`, `fast-uri`, `ip-address`, `js-yaml`, `linkify-it`,
`nanoid`, `postcss`, `undici`, `qs`, `hono`, `@hono/node-server`, `dompurify`, `esbuild`, `vite`,
`vite-node`, `vitest`, `@vitest/mocker`, `@vitest/coverage-v8`, `vitepress`. **Re-measure before
working from any of this.** It splits into three jobs that must not be one PR:

- **(a)** the leaf/transitive bumps with `fixAvailable: true` — the bulk, lockfile-only where possible.
- **(b) `vitest` 5.0.0, a MAJOR**, dragging `vite`, `esbuild`, `vite-node`, `@vitest/mocker` and
  `@vitest/coverage-v8`. The only route past both criticals. Its own worktree, its own PR, with the
  full four-workspace suite plus both E2E legs as the gate.
- **(c) `vitepress`, `fixAvailable: false`** — record it as accepted with a reason; do not force it.

**(b) IS DEFERRED, and the reason is a measurement rather than a preference (owner call,
2026-09-04).** After (a), **`npm audit --omit=dev` reports 0 vulnerabilities** — every one of the
seven residuals is a DEV dependency. That is not an aside: `nightly.yml`'s dependency job runs
exactly `npm audit --omit=dev --audit-level=high`, which now exits 0, so the residuals do not appear
in this project's own security gate at all. Neither critical ships: `vitest` and
`@vitest/coverage-v8` are the test runner, absent from every published artifact, and the `vitest`
advisory itself is against the **UI server** (`--ui`), which nothing here starts —
CI runs `vitest run`.

Against that, (b) costs more than it first looked: it is `vitest` **2.1.9 → 5.0.0, three majors**,
across 281 test files (re-measured 2026-10-03; 203 when written) and four workspaces, with the snapshot-format risk that carries in a repository
that treats a moved golden as a finding to explain rather than a diff to bless. It does **not** clear
`esbuild` (tsup's node, see above), and it **splits** the `vite` tree that `vitepress@1.6.4` currently
shares, so (c) gets no better either. Five of seven advisories clear, all of them dev-only.

**Take (b) when one of these fires — not before:**
1. `npm audit --omit=dev` stops reporting 0, i.e. an advisory reaches a shipped dependency.
2. `vitepress` ships a release that wants `vite` 8, so (b) and (c) stop pulling apart.
3. Something else needs `vitest` 3+ on its own merits (a feature, a Node version, a plugin).
4. `tsup` ships a major that can reach `esbuild` 0.28, making a single pass clear all four groups.

Do **not** treat "two criticals outstanding" as a trigger on its own — that number is `npm audit`'s
default all-dependency reading, and the honest one for this repo is the `--omit=dev` figure, which
is 0.

**(a) is DONE (2026-09-04), and it was lockfile-only — no manifest moved.** All twelve
`fixAvailable: true` roots cleared with a plain `npm audit fix` (never `--force`), a 45-line
`package-lock.json` diff and nothing else:

```
before:  19 vulnerabilities (2 critical, 9 high, 8 moderate)
after:    7 vulnerabilities (2 critical, 1 high, 4 moderate)
```

Every move was a patch or minor: `@hono/node-server` 1.19.14→1.19.17, `brace-expansion`
2.1.1→2.1.4 and 5.0.6→5.0.9, `dompurify` 3.4.11→3.4.14, `fast-uri` 3.1.2→3.1.7, `hono`
4.12.29→4.13.5, `ip-address` 10.2.0→10.7.0, `js-yaml` 4.2.0→4.3.2, `linkify-it` 5.0.1→5.0.2,
`nanoid` 3.3.15→3.3.18, `postcss` 8.5.15→8.5.28, `qs` 6.15.3→6.16.0, `undici` 7.28.0→7.29.0.
**Not one output byte moved** — a 95-artifact SHA-256 sweep (`describe()` + `lint()` + every
storey's SVG across all 30 examples) is identical before and after, proved non-vacuous in both
directions first. `hono`/`@hono/node-server` are `@modelcontextprotocol/sdk`'s, i.e. `packages/mcp`'s
transitive tree; **the shim needs no version bump for this**, because its own `package.json` is
byte-unchanged and a consumer resolves its own transitive tree from the published manifest, not from
this lockfile.

**(a) was re-run 2026-10-03, again lockfile-only.** Trigger 1 above had fired in between —
`npm audit --omit=dev` reported 4 (1 low, 3 moderate: `dompurify`, `fast-uri`, `hono`,
`ip-address`) — and every one of them cleared with a plain `npm audit fix` (npm 11.18.0, the
version `release.yml` pins, so the diff carries no lockfile-format churn), a 64-line
`package-lock.json` diff, every manifest byte-unchanged:

```
before:  20 vulnerabilities (2 critical, 9 high, 8 moderate, 1 low)   --omit=dev: 4
after:   13 vulnerabilities (2 critical, 7 high, 4 moderate)          --omit=dev: 0
```

Moves, all patch or minor: `brace-expansion` 2.1.4→2.1.7 and 5.0.9→5.0.12 (three nodes),
`dompurify` 3.4.14→3.4.16, `fast-uri` 3.1.7→3.1.8, `hono` 4.13.5→4.13.12, `ip-address`
10.7.0→10.7.3, `markdown-it` 14.2.0→14.3.2, `undici` 7.29.0→7.30.0. No output byte moved: the
byte-identity suites in CI's `npm run check` pass unchanged. The vsce chain in the table below is new and
is **not** (a) despite npm's `fixAvailable: true`: `braces` has no fixed release (`<=3.0.3` is every
version), and the only route around it is `@vscode/vsce` 4.0.0, outside the manifest's `^3.2.1` —
3.9.2 is the newest stable 3.x.

**A correction to (b) that the next agent needs: `vitest` 5 will NOT clear the `esbuild` advisory.**
npm 10 reports `esbuild`'s `fixAvailable` as `vitest@5.0.0` (`5.0.3` on 2026-10-03; npm 11.18.0
reports `false` for `esbuild` and `vite`), but that only reaches
`node_modules/vite/node_modules/esbuild@0.21.5`. The **other** node in the advisory,
`node_modules/esbuild@0.27.7`, is **tsup's** — and `tsup@8.5.1`, the latest 8, pins `esbuild ^0.27.0`,
which cannot reach the fixed `0.28.1`. So that one has **no fix at any version of tsup 8** and is a
fourth group, not part of (b). Exposure is nil either way: both `esbuild` advisories
(GHSA-67mh-4wv8-2f99, GHSA-g7r4-m6w7-qqqr) are against `esbuild serve`, a dev server tsup never
starts. Note also that the root is on **`vitest` ^2.1.8** (resolved 2.1.9), so (b) is a *three*-major
jump, and `vitepress@1.6.4` pins `vite ^5.4.14` — it shares the one hoisted `vite@5.4.21` with
vitest 2 today, but `vitest` 5 wants `vite` 8, so (b) will **split** that tree rather than fix
`vitepress`. (c) clears only on a `vitepress` release.

**Residual after (a), grouped by why — 13 advisories (re-measured 2026-10-03; 7 on 2026-09-04),
all dev-only:**

| root | sev | why it stays |
|---|---|---|
| `@vscode/vsce`, `secretlint`, `globby`, `fast-glob`, `micromatch`, `braces` | high | `braces` has no fixed release; clears only via the `@vscode/vsce` 4 MAJOR (`editors/vscode` packaging) |
| `vitest`, `@vitest/coverage-v8` | critical | needs the `vitest` 5 MAJOR — job (b) |
| `vite` | high | ditto (via `vitest` 2's `vite ^5.0.0`) |
| `@vitest/mocker`, `vite-node` | moderate | ditto |
| `esbuild` | moderate | **two nodes, only one fixable by (b)** — tsup's `0.27.7` has no fix in tsup 8 |
| `vitepress` | moderate | `fixAvailable: false`; accepted — its only `via` is `vite`, and it pins `vite ^5.4.14` |

**A separate finding, not a vulnerability — RESOLVED 2026-09 by the hosting migration:**
`docs-site/.vercel/.env.production.local` held a JWT. It was gitignored (by a `.vercel` line in
`docs-site/.gitignore`), never tracked, and appears nowhere in history — a local Vercel CLI
artifact, no exposure. Both `.vercel/` directories were **deleted** when the sites moved to
Cloudflare Workers, along with the two gitignore lines that covered them (`playground/.gitignore`
held nothing else and went with them), so the file no longer exists on any machine that pulls this
branch. Kept here rather than removed because a directory-mode scan of an older checkout, or of a
working copy that never cleaned up, will still surface it — and the answer is still "a local CLI
artifact, no exposure". **The Cloudflare equivalent is `.wrangler/`** — local state and caches that
`wrangler` writes beside each `wrangler.jsonc`. It holds no credential (`wrangler` reads
`CLOUDFLARE_API_TOKEN` from the environment; in CI that is a repository secret, never a file), but
unlike `.vercel/` it is **not currently gitignored anywhere**. Add it before someone commits one.

**The lesson this entry is now an instance of:** a permanently red gate is a disabled gate that still
costs CI minutes. Left alone, the secret scan would have failed every night forever over three public
SHAs, training every reader to scroll past the job where a real finding would eventually appear.

**One framing from the original entry survives and still matters:** the shim is **stdio-only**, so
the `hono` and rate-limit code paths are unreachable at runtime — record that in the issue rather
than implying exposure. And a shim bump drags the pack-time resource law with it: the version must
land in `packages/mcp/package.json` **and both** of `server.json`'s version fields, or the release
workflow `npm view`-skips it and nothing reaches either registry.

### 3.2 · One playground origin constant: done by #841, waiting to be archived — `note`

Re-export `PLAYGROUND_ORIGIN` (`src/cli/share-codec.mjs`) from `scripts/gen-permalink.mjs` and use it
for the hard-coded copies at `docs-site/sync-docs.mjs:25` and `playground/scripts/gen-static.mjs:73`,
after C6 merges (it edits those build scripts).

### 3.3 · Adopt the two biome 2.6 rules switched off by the upgrade — `todo`

The 2.6 upgrade (RM0.5) switched these off in `biome.jsonc` so the bump changes no behaviour; adopt
each deliberately, one PR each, proving the fix is behaviour-neutral: `useMathMinMax` (34 warnings;
`Math.min`/`max` differ from the ternary on NaN and -0) and `useDomNodeTextContent` (2 warnings;
`innerText` is not `textContent`). `usePlaywrightValidDescribeCallback` (255 errors) stays off for
good: a false positive on our own `describe()`. Biome 2.6 also formats Markdown and YAML; both stay
excluded in `files.includes`.

### 3.4 · Replay scratch-directory removal: residue of the leak fix — `todo`

Non-blockers from the review of the scratch-directory fix (`removeScratch`,
`packages/archlang-3d/src/replay/video.ts`): (1) it uses sync `rmSync` with retries, which blocks
the event loop up to ~2 s per render under a lasting lock; `rm` from `node:fs/promises` takes the
same options; (2) a lasting removal failure is now silent: no log line or report field says a
directory was left; (3) no test pins that a failed removal keeps a SUCCESSFUL render's result, or
that a rejecting `browser.close()` still removes the directory; (4) the Windows cause (empty
directories left by parallel renders) is a hypothesis: a probe with a held file reproduced a
non-empty directory and a thrown error, not an empty one. If empty `archlang3d-replay-*`
directories still appear in the temp folder after the fix, investigate again.

### 3.5 · File-URL path guard: residue of the #915 fix — `todo`

Non-blockers from the review of #919 (`test/file-url-paths.test.ts`): (1) the guard misses realistic
variants: a three-slash `file:` template, `"file://" + path`, a destructured or stored
`new URL(import.meta.url)` whose `pathname` is read later or on the next line (the scan is per
line), `import.meta.url.replace("file://", "")`/`.slice(7)`, and `.tsx`/`.cts`/`.jsx` files; no
tracked file has one today; (2) `check:quick` selects the guard only for `scripts/` changes, and only
because of its `toContain("scripts/check-quick.mjs")` sanity literal (`scannedTrees()`,
`scripts/gate-select.mjs`), so the pattern returning in `dataset/` or `packages/*/scripts/` is
caught by CI, not locally; (3) `dataset/generate.ts` keeps its `endsWith("generate.ts")` fallback,
which also matches `eval/g1/generate.ts` if that script ever imports it; the `realpathSync` idiom in
`scripts/risk-tier.mjs` is the narrower replacement for all three entry-point checks; (4) no run of
`check:quick` from a checkout under a path with spaces has been recorded.

### 3.16 · The `bathroom` concept counts a room with only a WC — by design — `note`

Owner ruling, 2026-11-18: the `bathroom` concept (`src/intent-concepts.ts`) matches a room by its label
("bath", "shower room", …), its room type `Bathroom`, or `uses bath` or `uses wc`, so a WC-only room
matches; it reads no fixtures. The Chinese 卫生间 means either, so this is a question of
meaning, not a bug, and the behaviour stays. A stricter concept for a full bathroom (bath or shower
required) is added only when a brief needs it. Reported by the ArchCanvas eval, together with a second
ask (a combined kitchen and living room credited once); that ask is withdrawn because its eval inputs
were wrong (one room meets one requirement, so a caller asserts a combined room once).

### 3.17 · Frozen public tables: residue of #968 — `todo`

Non-blockers from the second review of #968:

1. `test/ast-values-frozen.test.ts` walks `Object.entries`, so a future frozen `Set` or `Map` table passes while staying mutable.
2. 40 of the 72 object-valued root exports are still not deep-frozen (`ROOM_TYPES`, `ERROR_CODES`, `PAPER_SIZES`, `THEMES`, `DEFAULT_THEME`, `PLAN_JSON_SCHEMA` and others). This predates #968, but the same reason for freezing applies to them. Freezing them is a behaviour change for a consumer that mutates them, so decide the release class first.
3. PR CI never runs `test/index-values.test.ts` on Windows. Standalone on a Windows laptop, its program build took 9.8 s over 912 files against its 60 s timeout; `types: []` cuts that to 4–6 s with the same result.
4. The new top-level `Object.freeze` calls carry no `@__PURE__` mark (`src/pure.ts`), like 27 other freezes in `src`. No measured effect.

### 3.18 · The playground's first-use bundle has about 1.9 KB of headroom left: done by #976, waiting to be archived — `note`

Done by #976, with no budget raised: Format, Finish, Repair furniture and the DXF/TXT downloads load their core code on a press (`playground/src/press-core.ts`, build entry `src/actions-path.ts`), and a `first-use` chunk group keeps the worker's `lint` on the first use's path. `npm run size:embed` on `main` 5f3606f5 → #976's head merged with it: first use 484,715 → 456,244 B (−28,471), compiler path 325,093 → 324,065 B, embed 311,313 → 310,260 B. The target was 3 KB, so this is well past it. `firstUsePathBudget` was re-taken DOWN in the same PR by the file's own rule (measured × 1.025, rounded up to a thousand): 486,000 → 468,000 B (11,756 B headroom), so a press-core or glTF-Transform leak now trips it. For the compiler and embed paths the rule gives the budgets as they stand (333,000 and 319,000 B), so those are unchanged. `docs/agents/iron-laws.md` still quotes an older `embedPathBudget`; editing that line is the owner's call (NR.9 (3)). The card text below is kept for the record.

After AL3b (#969) the first-use path (`firstUsePathBudget`, `playground/e2e/startup-chunks.baseline.json`) measures 484,137 B gzip against 486,000 B. The next few KB of compiler growth trip `Playground E2E chromium`. Two ways out: move code a first use need not load out of the compiler chunk or the lazy core chunk (as EB.2 did, #947), or re-take the budget by the file's own rule (measured × 1.025, rounded up to a thousand). A re-take raises a ceiling, a relaxed check that needs the owner's word for that PR (`REVIEW.md`; the owner approved the compiler-path and embed raises on #969, 2026-11-19, not this one). Measure with `npm run size:embed` (`scripts/embed-path-size.mjs`) on `main` and the branch; `docs/agents/iron-laws.md` still quotes `embedPathBudget` as 310,000 B (319,000 since #969), and editing that line is the owner's call (NR.9 (3)).

### 3.19 · The compiler path has about 0.7 KB of headroom left: done by #1002, waiting to be archived — `note`

Done by #1002: the compiler chunk no longer carries `compile()`'s `onError: "svg"` error card and the catalogue's fix column it prints. `src/compile-path.ts` serves `compileWithoutErrorCard` (`src/compile-memo.ts`), and `compile()` draws the card through `src/compile-uncached.ts`, which nothing on the compile path imports. The parser's `E_LEVEL_MIX` message reads `LEVEL_MIX_FIX` (`src/level-mix-fix.ts`), not the generated column. The playground's door serves that function as its `compile`, and the embed draws the card on a broken plan with `renderErrorSvg`, loaded through `playground/src/error-card.ts`. `npm run size:embed` on `main` 44c16e12 → #1002: compiler path 332,355 → 312,481 B (−19,874), embed path 318,546 → 299,840 B (−18,706), first use 467,832 → 466,680 B (−1,152; the fix column now rides `first-use` for Copy for LLM's `diagnosticToJson`). The corpus digest of SVG, `describe()`, `lint()`, diagnostics and the error card is unchanged, and `digest:preview` moved 0 rows. By the file's rule (ruling RM-D78) the PR re-takes `compilerPathBudget` down to 321,000 B and `embedPathBudget` to 308,000 B; `firstUsePathBudget` stays at 468,000 B, which the rule would raise. A broken embed now loads about 126 KB gzip to draw its card (#1002's residue). The card text below is kept for the record.

AF9 phase A's PR (#992, merged 2026-11-20; `npm run size:embed`, base `c749ac4e` → head `1babd94d`)
measured the compiler path 330,147 → 332,209 B gzip against `compilerPathBudget` 333,000. After
#993 (`W_TABLE_NO_SEAT`, merge `f48633ff`, 2026-11-21 UTC) it is 332,303 B against 333,000 (697 B
left), the embed path 318,494 B against 319,000 (506 B) and the first use 467,775 B against
468,000 (225 B). AF4 (#987), RM9.10 (#990), AF7 (#977) and AF9 took most of the earlier headroom. The
next compiler-path card would trip `Playground E2E`. This is the next card
(`docs/plans/product-roadmap/handoff.md` §2, RM-D74), before any further compiler-path card: move
code a first compile does not need out of the compiler chunk (as EB.2, #947, and 3.18, #976, did),
measured with `npm run size:embed` on `main` and the branch, with a corpus digest of SVG,
`describe()`, `lint()` and diagnostics proving no change of behaviour. Raising a budget stays the
owner's call for that PR (`REVIEW.md`), with one exception: RM-D57's by-rule re-take of
`embedPathBudget` (`docs/agents/iron-laws.md`, owner-ratified 2026-11-17) merges on the
coordinator's judgement after a fresh-context review, as its own re-take PR, for a card that needs
the bytes and has shown no cheaper cut, by the file's × 1.025 rule. It covers `embedPathBudget`
only, not `compilerPathBudget`. **Gate:** at least ~3,000 B gzip off the compiler path and the embed path, no
budget raised, the digest unmoved.

### 3.19b · The first use has about 1.3 KB of headroom left after 3.19: done by #1005, waiting to be archived — `note`

Done by #1005, with no budget raised. The compile worker's `lint`, which no view-mode render runs, left the `first-use` chunk for a `lint` chunk of its own (build entry `src/lint-path.ts`, door `playground/src/lint-core.ts`, the `lint` group in `playground/vite.config.js`). Edit mode imports it statically. The worker imports it by that chunk's own URL (`LINT_URL`) with the editor's first request, because a literal `import()` would be wrapped in Vite's preload helper, which reads `document`. It reads `lint` from `globalThis` under `LINT_KEY`, which the door sets, because the bundler shortens the chunk's export names. `npm run size:embed` on `main` 56dff28d → #1005: first use 466,851 → 411,888 B (−54,963), compiler path 312,495 → 312,477 B, embed path 299,850 → 299,826 B. The corpus digest of SVG, `describe()`, `lint()`, diagnostics and the error card is unchanged. `firstUsePathBudget` is re-taken DOWN by the file's rule (ruling RM-D79), 468,000 → 423,000 B (11,112 B headroom), so a lint leak back onto the path trips it. Residue: three things now fetch the lint chunk (55,390 B) that a first use had loaded before. One is the Checks overlay (`checks-panel.ts`, whose review sheet runs `lint`). The others are a first press of Format, Finish, Repair furniture or a DXF/TXT download, with `press-core`, since `finish` and `repair` read `lint`. Copy for LLM's fix column (in `first-use`, ~19 KB) is still on the path. The card text below is kept for the record.

After #1002 (3.19) the first use measured 466,680 B against `firstUsePathBudget` 468,000 (1,320 B left), and three open PRs add to it: #1001 (`W_SEAT_FACING_WALL`, ~+954 B), #1003 (CV14 examples, ~+165 B) and #1004 (`W_STAIR_NO_VOID`, ~+281 B), about 80 B over together. #1002's residue named what is left on the path: the fix column Copy for LLM reads and the worker's `lint`, which only the editor runs. **Gate:** at least ~3,000 B gzip off the first use, the compiler and embed budgets met and not raised, the digest unmoved, the playground's behaviour the same.

## Found while landing 1.68.0 (arc openings, arc rooms, telemetry; 2026-11-23)

### ARC1b · The model swing of a door on an arc still comes from the tangent — `decision`

#1019 draws a hinged or double door on a curved wall with its leaf hung on a jamb of the cut, but the
model's swing (`doorSwing`/`doorLeaves`, read by lint, `describe --facts symmetry`, `repair()` and the
3D package) is still the tangent construction, so the drawn leaf stands off the measured one by up to
62.5 mm at the hinge (65.1 mm at the tip) on the shipped plans (`aquarium`). Moving the model onto the
arc moves `describe --facts symmetry`'s `full.exact` (measured in #1019's first round: true to false on
the four `radius-over-*` defect-corpus plans), which ADR 0023 decision 7 does not permit: it needs the owner's ruling for a second permitted movement before it is built.

### ARC1c · Labels may sit closer to a curved opening's ink than to the footprint they avoid — `todo`

The annotation passes read a curved opening's old tangent footprint (Ruling B in #1019), so no label
moved; the drawn ink can be up to about `w²/8R` closer (worst measured 291.9 mm, a 1700 mm double door
on R1300, over 7,168 generated drum plans; on the corpus no label or text newly touches opening ink,
the closest at 145.5 mm). Give the annotation passes the true ink
as an obstacle without moving any label on plans whose openings are straight.

### ARC2b · `W_ROOM_NOT_ENCLOSED` counts an arc wall's chord as cover for a straight room edge — `todo`

Pre-existing, reachable since #1023: the line branch of `largestPerimeterGapEdges` (`src/analyze.ts`)
treats an arc wall as its chord, so a two-vertex room on `wall { (0,0) arc (4000,0) radius 2500 cw }`
reads enclosed with its 4 m chord open.

### ARC3b · Net-area measurement mis-measures some rotated rings — `todo`

Found by the #1020 review (pre-existing, same on main): a ring of rooms rotated 17° reports 18.07 m²
unassigned at 87 % cover where 3.64 m² is true, and at 17 m / 73.3 m offsets the measurement gives no
answer, so the face is skipped and coverage still says `ran`.

### FW5b · A plan that does not parse cannot be contributed — `decision`

#1021 builds "Send this plan to improve ArchLang" on short links (ruling RM-D87), and `POST /api/share`
refuses `E_PARSE` / `E_STEP_LIMIT` plans, so the most common failure cannot be sent; the offer is
hidden for them. Collecting them needs a change to the short-link store's rule (or a separate store):
the owner's decision.

## Docs-site E2E

### DE.1 · The two /examples sheet tests ran 29 to 32 s against a 30 s timeout: done by #1011, waiting to be archived — `note`

`docs-site/e2e/homepage-links.spec.ts` › "every sheet drawing renders" (and its sibling "a sheet shows and opens the SAME plan", which waits on no image) ran 27.9 s on a pass (run 44970550484) and 29.0 to 32.3 s on the runs that failed (44975881007 on `main` fe43738d, 44968866989, 44962341628), against Playwright's 30 s default. The cost is the `/examples` page itself: `docs-site/examples.md` mounts 35 `<ArchLive>` widgets that each compile at hydration (`ArchLive.vue`), plus Playwright round-trips per action, not the image fetches. Done by #1011: both tests get a fixed, commented 60 s budget, and "every sheet drawing renders" is one `expect.poll` over all images (each round scrolls the blank ones into view; it asserts the list length equals `CARDS + LEVEL_ART` and every image has a `naturalWidth`), where it had one wait per image. The assertion is as strong as before; no image is dropped or skipped.

### DE.2 · Cut the /examples page's cost so its sheet tests fit the default timeout — `todo`

DE.1 only gives the two sheet tests a 60 s budget. The page still hydrates 35 live `<ArchLive>` compiles before a test can act. Lazy-hydrate the widgets (on visible) or give the sheet grid a lighter page, then remove `SHEET_TEST_TIMEOUT_MS` from `docs-site/e2e/homepage-links.spec.ts`. **Gate:** both tests pass at the default 30 s with the same assertions.

## Found while redrawing the showcase

Five things the twelve new examples ran into. None is a regression and none blocked an example from
shipping — each was worked around in the source, and the workaround is what makes it worth
recording: an author had to give something up. Every claim below was **reproduced**, and the
reproduction is quoted.

### S.3 · `strip` cannot nest inside `zone`, so strip rooms fall out of the schedule — `todo`

```
E_STRIP_NEST: "strip" is only allowed at plan level, not inside a block, component, or another strip
```

A `strip` is the cheapest way to lay out a run of rooms and a `zone` is the only way to group them
for `schedule rooms`, and the two cannot be combined — so strip-laid rooms land in the schedule's
`(no zone)` group. `examples/transit-hall.arch` hits both halves of this. The restriction is
deliberate (a strip resolves positions and a zone must not), but the two are orthogonal in principle:
a zone has **zero geometric semantics**, so there is no resolution-order reason a strip cannot sit
inside one.

## Found while burning down the gallery items (2026-09-02)

Five things the G.2/G.3/5.8 work turned up. None was in scope for the item that found it, and each
was deliberately NOT widened into — recorded here rather than half-fixed.

- G.5 · Circulation measures every walk from `entrances[0]` only — closed by W3b → archived (lab)

### G.10 · A `place`d plan does not round-trip through Plan JSON (the projection half is done) — `todo`

**Landed: the projection carries the reflection.** `planToJson` now emits `mirror: true` on every
fixture inside a reflecting `place` frame (the IR's `_mirror`), beside the quarter-turn it already
carried as `rotate` — the `Fx` in `M · R(l) = R(m − l) · Fx` that `rotate` cannot say. The key rides
the frame's fact, not the glyph's: symmetric families carry it too, though only a handed one draws
differently. A reflection-free plan's payload is byte-identical (no key).

**Landed: the way back refuses rather than approximates.** Source has no per-furniture `mirror` — only
a `place … mirror x|y` frame reflects a symbol — so `planJsonToArch`/`planFromJson` answer a
`mirror: true` piece with `E_JSON_MIRROR` instead of emitting the unmirrored symbol. `mirror: false`
is accepted as the absent key.

**Still open: a placed plan does not round-trip at all.** `planFromJson` refuses the namespaced ids
with a pathed `E_JSON_SCHEMA` (×3 on the minimal fixture). The tripwire stays armed (`test/plan-json.test.ts`,
"G.10"): its second test pins a pathed `E_JSON_SCHEMA` on an UNMIRRORED placement (a mirrored one is now
refused earlier, by `E_JSON_MIRROR`) and goes red when a placed plan starts round-tripping. Whoever
fixes that still has to decide what a mirrored fixture becomes on the way back, since source has no
word for it outside a `place`.

**Landed for one case: a placed component that derives its walls (PS3.9).** On that storey alone
the payload carries `components`/`instances` and marks the flattened rows `instance`, and the way
back prints `component` + `place`, so the frame carries the reflection. Widening the record to every
placed plan (which moves their Plan JSON) is plan-soundness card PS3.12.

**Note (PR #232's red team): `door on <authored wall>` comes back absolute.** A door, window or
opening written `on <wall> at <pos>` is exported by its `x`/`y` and host category, never the `on`
clause, so after a round trip `describe().freedom` reports it absolute instead of attached (the
"bar `freedom`" exception below). It holds at the root and inside a PS3.9 component body alike.

**The CLI round-trip and its gap list.** `archlang compile -f json` writes the Plan JSON that
`compile --from-json` reads back, and `test/cli-plan-json-roundtrip.test.ts` holds every example
to byte-identical SVG, equal `describe()` facts (bar `freedom`, which flattens to absolute by
design) and equal `lint()` codes through that pipe, except exactly the list `CANNOT_ROUND_TRIP`
in `test/tables/plan-json-gaps.ts`, minus `imports.arch`, which the CLI's file World flattens:

- refused with `E_JSON_MIRROR` (a reflecting `place`): `clinic`, `museum-wings`, `terrace-row`, and
  `hillside-villa`'s level 2;
- storeys (each storey projects alone and draws differently from its sheet): `two-storey`,
  `townhouse`, `garden-house`, `hillside-villa`;
- the sheet layer (`schedule`, `legend`, `zone`): `furnished-flat`, `transit-hall`;
- `column` written before `furniture`: `museum`, the same shapes in another order;
- the style layer (`theme`, `style`): `themed`, `gallery-l`, `materials`;
- curves (`room circle`; a wall's `arc` travels): `aquarium`, `hexagon-pavilion`, `library`;
- `roof`: `tiny-house`, `bungalow`, `courtyard-house`, `two-bed`;
- accessibility metadata (`accTitle`, `accDescr`): `accessible` — the default SVG survives, so
  only the `describe()` comparison sees it.

**Open: carry `accTitle`/`accDescr` in Plan JSON — `todo`.** Unlike the gaps above this one is not
a whole layer the projection leaves out by design: it is two optional plan-level strings, which
`astToJson` already emits and `planToJson` drops. Add both to `PlanJson` and the schema (emitted
only when declared, so every other payload stays byte-identical), re-emit them in `emitArch`; the CLI round-trip
test's exact gap list then goes red until `accessible.arch` is taken off it.

The neighbouring rule, from [ADR 0016](adr/0016-component-instances-and-frames.md) and now stated in
`AGENTS.md`: when a fact crosses a frame, ask **can this be re-expressed in plan coordinates?** A
placement clause cannot (plan space has no word for a local corner) so it is dropped; a symbol's
handedness can, exactly, as one reflection about the footprint's own centre line — so it is flipped.
This item is the third case, and the answer is the same as the handedness one.

### G.8 · A per-category `style` — `todo`

Also deferred by name in v1.32.0 and previously untracked. `style <kind> { … }` reaches the fixture
layer as ONE kind, so there is no way to give `tree` a different pen from `sofa`. The symbols are
drawn with named line weights already, so the seam exists — the syntax does not. Any design has to
say how a per-category rule composes with the existing per-kind one.

---

## Equivariance findings

`place … rotate r mirror m` must carry every fact through the frame's D4 ⋉ Z² action. The oracle
(`test/helpers/d4-oracle.ts`; suites `test/equivariance-{corpus,scene,fuzz}.test.ts`) measures that law, and
every violation it finds is pinned in `test/tables/equivariance-known.ts`, per element and, for the raster,
with a size bound: a new one fails as `NEW`, a closed one as `FIXED` until its pin and its `STILL …`
witness are deleted, and each pin's class predicate must account for what it pins. Each entry below
is one pinned class; the gate for closing it is that suite going `FIXED` for exactly that class.
Status is `todo` for a defect and `declared` for a convention that is not a group fact.

- E.1 · `fix-pullback` — lint fixes rewrite a shared component in plan coordinates — closed by W5c → archived (lab)
- E.2 · `stair-tail` — a vertical run's arrow and entry edge ignore the frame — closed by W5b → archived (lab)
- E.3 · `stair-break-hand` — a mirrored stair keeps its break line's hand — closed by W5b → archived (lab)
- E.4 · `plugin-throw` — a plugin element inside `place` throws — closed by W2 → archived (lab)

### E.5 · `facing-tie` — a corner or 45° window resolves its tie N/S-first — `declared`

`windowFacingPage` (`src/site.ts:191,206`) breaks a tie horizontal-first by stated convention, which
an axis swap does not commute with. Not a defect; the pin moves only if the convention does.

- E.6–E.10 · the nav grid breaks its ties in page order — closed by circulation v2 (E.9 by W3b) → archived (lab)

### E.11 · `float-translation` — facts change under a pure translation (circulation half closed by W3b) — `todo`

**Closed for circulation.** A translation re-rounds a curve's tessellation (placed 20 m out, a ring
vertex keeps one ulp less of its fraction), so the nav grid, sampling in absolute floats, resolved
exact ties the other way (`aquarium` detour 1.01 → 1, `library` reading-room walk 25500 → 25300 mm).
The grid now samples in its extent's own frame, each coordinate taken relative to the min corner and
snapped to a 2⁻¹⁰ mm lattice (`toExtentFrame`), so every circulation fact is invariant under a
translation unless a relative residue lies within about an ulp of a half-quantum (0 moves over 69
non-integer translations of 8 examples; `test/equivariance-corpus.test.ts` "closed classes",
`test/circulation-translation.test.ts`). The snap moved three
P₀ values to their translation-invariant readings (the baseline header names them).

The raster classes that shared this oracle closed with circulation v2 (E.6–E.10), so the class
now covers only lint outputs of float-sensitive geometry.

**Still open for lint:** a computed position that resolved an ulp off its integer (`at 12000 * 0.55`;
`at 55%` itself is exact since PS0.19) rounds back 20 m away and flips `W_POCKET_RUN`'s `>= need`, making its reverse-slide fix appear. Close by
snapping resolved positions (or comparing through the same snapped frame).

- E.12 · `slide-track` — a mirrored sliding door swaps its panels' tracks — closed by W5b → archived (lab)
- E.13 · `column-corner` — the frame carried a column's corner as a centre — closed by W5b → archived (lab)
- E.14 · `dim-text-side` — a dim's number was drawn inside its line for a negative offset — closed by W5b → archived (lab)

### E.15 · `dim-tick-hand` — a mirrored dim draws its ticks on the other diagonal — `declared`

Each 45° station tick is drawn along `dir + n` (`src/elements/dim.ts:290-291`), a slash of fixed page
sense relative to the line — a drafting convention, like a hatch angle. Its mirror image is the
other diagonal. Not a defect; the pin moves only if the tick convention does.

- E.16 · `nested-ref` — a reference into a nested instance fails once its plan is placed — closed by W8 → archived (lab)
- E.17 · `facade-probe-order` — placing a storey moved its `dims auto` chains — closed → archived (lab)

### E.18 · `annotation-overlap-translation` — `W_ANNOTATION_OVERLAP` changes under a pure translation: done by #999, waiting to be archived — `note`

Done by #999. The cause was not the label passes' positions but the leader step's dot (`src/label-fit.ts`).
The dot must stand wholly on its floor and meet no wall's or text's box and no symbol's shape (a
symbol's box only gates the shape test), and that was read as `rectAreaOutside(dot, floor) > 0`,
`overlapArea(dot, box) > 0` and `clippedArea(shape, dot) > 0` in absolute floats. A dot wholly on its
floor reads 1e-10 to 1e-9 mm² off it, at different lattice places for different coordinates, and a
dot can meet a wall band's box or a symbol's shape by rounding alone. So P₀ ended the line on another
dot, whose line was blocked. All three readings now run in the dot's own frame against `DOT_SLACK`
(1e-9 of the dot's box). The result is translation-invariant over the fuzz's range: tested at offsets
up to ±20 m and at 10⁶ mm, under every turn and flip (`test/equivariance-fuzz.test.ts` § pinned fuzz
counterexamples: this plan, a 1324.3 mm-deep strip whose dot met a wall band's box, and the same
strip with a wc whose shape met the dot). Further out, E.19. The CI seed passes all 60 runs (main
fails at run 59). Over the corpus only `test/fixtures/dense-office.arch`'s SVG moves (14 rows re-pinned
with a swap-back); `describe()` and `lint()` do not move. The store's line there now runs about 339 mm
through its cabinet symbol: E.20. The card text below is kept for the record.

Found by `test/equivariance-fuzz.test.ts` on `main`'s push run for `91ed1210` (Node 20, shard 3/5;
seed 533254921, the path in the run log): a three-room strip (`cols [2900,4500,2000]`, rows
`[2000]`, a centred 900×600 `wc` in the first room and a second `wc` at its corner turned 90°, a
relational annex `right-of`) raises `W_ANNOTATION_OVERLAP` ("The name "Living" is printed over the
wc") on P₀ and not when the same plan is placed 20 m out (`g = t`). Published 1.65.0 does the same,
so it predates the AF and RM9 cards; no pinned class accounts for it, so the fuzz reports it `NEW`
whenever its random seed reaches such a plan (the next push run, `594c1a93`, was green). Likely the
label passes compare absolute float positions (as circulation did before E.11's extent-frame snap).
Gate: the counterexample's P₀ and gP lint the same; the fuzz has no `NEW` on that seed. Do not pin
it as a known class to green the suite; fix the comparison.

### E.19 · `annotation-overlap-far-translation` — `W_ANNOTATION_OVERLAP` changes under a translation of 1.5 × 10⁶ mm or more — `todo`

Found by #999's red team, after E.18's fix: E.18 holds over the fuzz's range (offsets up to ±20 m, and
10⁶ mm), but placed further out some plans still lint differently. Over 400 plans of `planSpec`
(`fc.sample(planSpec, { seed: 7, numRuns: 400 })`, each drawn through `withInstance(spec, { rotate: 0,
at: { x: T, y: T } })`, `T` rounded up to the plan's grid) the share that differs is 1/400 at `T` =
1,500,000, 11/400 at 3,000,000 and 18/400 at 5,000,000. Reproducers: case #137 at 1,500,000 (the
rule reports a label far out that P₀ does not) and case #4 at 25,000,000 (P₀ reports one that far
out is led clear, `g.r1 → g.r0`). `main` before E.18 differs on the same cases at 25,000,000 and
33,000,000, so it predates the fix. Not yet traced to a pass: at those magnitudes an ulp of a
coordinate is 2⁻³²–2⁻²⁸ mm, so any label pass that compares absolute positions can flip. Gate: those
two cases lint the same as P₀; then widen the fuzz's translation or add a far-offset row.

### E.20 · `leader-dot-ignores-line` — the leader's dot is chosen before, and apart from, whether its line is clear — `todo`

Found while landing E.18 (#999). The leader step (`src/label-fit.ts`, ADR 0035) takes the dot first: the
first lattice place on the room's own floor, by key, that is clear of walls, texts and symbols. Only
then does it search the label's places, and it accepts a line only if it runs from the label to that
one dot. So a clear dot can force a poor line, or a blocked one, while another clear dot further down
the key would give a clean line. Two reproducers:

- `test/fixtures/dense-office.arch`: since E.18 the store's dot is its anchor (3750,1500), and its
  line `(4249.67,3597.77)→(3750,1500)` runs about 339 mm through the store's cabinet symbol
  (3850,1800–4450,2250; `segmentEntersRing` is true). Before E.18 the dot was (3144,894), and that
  line crossed neither the cabinet nor the shelving. The step ranks both lines in the same tier (each
  crosses a swing or a symbol), so it never compares them.
- The E.18 counterexample (`test/equivariance-fuzz.test.ts`, template `e18`) placed `rotate 90 mirror
  x` (or `rotate 270 mirror y`): the label is not led and `W_ANNOTATION_OVERLAP` reports it at every
  offset, where before E.18 a dot picked by rounding happened to give a clear line.

Gate: choose the dot together with the line (for example, try the dots in key order for each place,
or rank a place's line by the best dot), and keep it order-free and D4-symmetric. This moves drawings
that draw a leader (6 corpus plans), so it needs a swap-back of each moved row.

## Circulation findings (found while landing W3b)

Pre-existing defects and one owner decision that W3b and its red-team review ran into; none was in
W3b's scope.

- C.1 · A partition thinner than a nav cell does not block the walk — closed by circulation v2 → archived (lab)
- C.2 · `--overlay circulation` ignores floor voids — closed by circulation v2 → archived (lab)
- C.3 · The detour ratio is taken from the nearest-by-walk entrance, which can be roundabout — decided: keep it → archived (lab)

### C.5 · An oblique doorway is carved as an L-shaped tunnel — `todo`

A threshold joins a seed cell on each side of the wall by an x-then-y (and, since circulation v2,
also y-then-x) run of cells. Through a straight wall the seeds face each other and the run is a
straight slit; through a thick wall at an angle — `hexagon-pavilion`'s portals on the 1200 mm
drum — the nearest free cells on either side are several cells apart diagonally, and the run is an
L that tunnels through the masonry beside the opening rather than along it. Which tunnel is carved
depends on which seeds are chosen, so a rule change moves the walk (g_sw/g_se 9200/9300 → 9800
under circulation v2, then 9800 → 8800 when seeds stopped depending on carve order, E.10's
reopening) without any of those values being the opening's. Close by carving along the
opening's own axis (the host's normal at the connector) through the band, bounded by the opening's
width — a measured change for every oblique or curved doorway.

- C.4 · An exterior door at the corner of two rooms joins them and gives no entrance — closed by 1e0c2d9 → archived (lab)

### C.6 · `W_PATH_TOO_NARROW` names fewer doors than it could, to stay inside its re-measure budget — `todo`

A door is named only after a re-measure shows widening it clears the room, and one `lint()` run
may spend `MAX_ATTRIBUTION_MEASURES` (2) re-measures, storeys together
(`src/lint/rules/circulation-facts.ts`). The union-per-tier and door-graph proofs settle every
tree-shaped plan with one re-measure (`test/lint-attribution-budget.test.ts`), but a door graph
with cycles can need more. Measured over `examples/`, `test/fixtures/` and `eval/` under
`accessibility-advisory`: of the walk warnings that named a door before any verification existed,
10 still name none because the budget ran out first (the hillside villa's Study and Terrace among
them); 1 is named that was not. Lint time stays within 1.5× of the unverified rule except
`examples/library.arch` under `accessibility-advisory` (1.45–1.61× across five runs), where the
single re-measure of a large nav grid is most of the cost. Close by re-measuring a door variant
without rebuilding the raster (only the widened doorways' cells and stamps change), which would
make each re-measure cheap enough to raise the budget.

## Wall-face probe findings

Left open by routing "which side of this wall has floor" through `wallFaceProbes`
(`src/geometry.ts`) and giving `roomOfVertical` the room's shape. Neither was in that change's scope.
Both closed their SHAPE half in W5a; P.1's message half closed with #404.

- P.2 · `swing into <rectangle room>` on an arc host picks its side off the chord — closed by W5a → archived (lab)

## Axonometric view findings

Left open by W9, which made `compile(src, { view })` stop throwing on a wall set its openings
consume and stop painting an empty ring. None of these throws; each draws or reports wrongly.

**All four are won't-fix**: the view is deprecated and removed at 2.0 ([ADR 0021](adr/0021-plan-first-view-deprecated.md)), which closes them.

**The 2.0 bucket (in no schedule).** V.5 and V.6 below, 6.7, the escalation of PS0.16's warning and of the
no-host door and opening warnings to errors (`docs/plans/product-roadmap/README.md` RM-D6, RM-D16), and the
branch `origin/feat/remove-view` belong to one major release and are done together when 2.0 is decided. No
card schedules any of them before then; do not pick one up on its own.
PS0.16's warning is `W_SET_VALUE_WORD` (shipped by RM1.4): at 2.0 it becomes an error, `set <kind>(key: word)`
then refusing a bare word its kind does not read instead of taking it as text (RM-D6).

- V.1 · Mixed-height joints interpenetrate and draw in the wrong order — won't fix → archived (lab)
- V.4 · The joinery emits an UNCLOSED chain for a door consuming an arc wall under `grid` — won't fix → archived (lab)

### V.5 · 2.0 removal of the axonometric view (phase B) — `todo`

_In the 2.0 bucket: in no schedule, done with V.6, 6.7 and PS0.16's escalation at 2.0._

Phase A (deprecation) is done ([ADR 0021](adr/0021-plan-first-view-deprecated.md)). At 2.0, together
with the removal of `while`/reassignment (its own checklist: 6.7), delete:

- [ ] `src/view/`; the view branch in `pipeline.ts`; `Scene.view`; `CompileOptions.view`.
- [ ] the view branches in `backends/svg.ts`, `export/pdf.ts` and `export/dxf.ts` (the `V-3D-*` layers).
- [ ] the CLI `--view`, `resolveView` and `VIEW_FLAG`; the `index.ts` exports and the compile cache
      key's `view`.
- [ ] keep `joinWallSet` (the plan path uses it); un-export `themeBaseLookup` if only the view uses it.
- [ ] the 10 `test/iso-*.test.ts` and the iso snapshot.
- [ ] `VIEW_SVGS` in `scripts/gen-example-svgs.ts`, its `scripts/check-drift.ts` entries and
      `docs-site/public/view/*.svg`.
- [ ] `docs/axonometric.md`, its `docs-site/sync-docs.mjs` line and its `docs-site/.gitignore` entry.
- [ ] the `AGENTS.md` rule becomes "Heights draw nothing."; drop the view lines in
      `docs/agents/architecture.md`; rewrite the P3-2 note "The datum now has ONE consumer — the
      axonometric" below.
- [ ] prove it with a SHA-256 byte-identity sweep of `compile`, `describe` and `lint` over every example.

The deletion is already prepared and red-teamed on branch `origin/feat/remove-view` (branched from
the deprecation merge; byte-identity sweep 810/810; tests pin `--view` → exit 3; a manifest
example-flag guard). At 2.0: rebase it onto `main`, re-run its sweep, and move its CHANGELOG
`Removed — BREAKING` block into the 2.0.0 section. Rebase it, do not redo it.

### V.6 · 2.0 raises the Node floor to 22 — `todo`

_In the 2.0 bucket: in no schedule, done with V.5, 6.7 and PS0.16's escalation at 2.0._

Node 18 and 20 are end-of-life and get no security releases, yet `engines` stays `>=18` (root,
`packages/mcp`, `packages/font-cjk`) and CI/nightly still test them. Raising the floor is breaking,
so it waits for 2.0; until then nothing is exposed: the core and the MCP server open no network
connection and decompress nothing, and the sites run on workerd, not Node. At 2.0:

- [ ] every `engines.node` → `>=22`; drop 18/20 from the `ci.yml` and `nightly.yml` matrices and the
      `node-version: 20` legs (`ci.yml`, `arch-render-selftest.yml`, the arch-render README example).
- [ ] the engine-digest note (V8 on Node 18/20/22) and any doc naming Node 18 as supported.
- [ ] a CHANGELOG `Removed — BREAKING` line.

---

## Found while landing the issued-sheet statements (`notes`, `schedule openings`)

### N.2 · `E_LEVEL_MIX`'s remedy does not name `notes` among the plan-level settings: done by #839, waiting to be archived — `note`

The remedy text in `src/error-catalog.ts` lists the statements that stay outside `level` blocks
and predates `notes`. Cosmetic: `notes` inside a level is `E_PARSE`, as `legend` is.

### N.3 · A tag with every candidate place taken keeps its first place — `todo`

A tag tries up to seven places and takes the first clear of every opening, wall, drawn
primitive and tag on the storey (`src/opening-schedule.ts`); with `schedule openings` injected
into the corpus, 21 tags find none and stay on ink (dense furniture, a party wall), and 5 sit
on a room name the label pass did not move. Each is pinned in `test/opening-tags-corpus.test.ts`
(the list may only shrink). Better needs more candidate places or a leader line. Tags also
number per storey (`W01` on each level); a set-unique numbering is an owner call.

### N.4 · `fmt` round-trips `project`/`drawn_by`/`date` wrongly for a control character: done by #872, waiting to be archived — `note`

`src/format.ts` quotes those three title fields with `JSON.stringify`, which writes a tab as
`\t`; the lexer reads back only `\"`, `\\` and `\n`, so `title { project "A<TAB>B" }` formats to
`project "A\tB"` and re-parses as `"AtB"` (likewise CR, U+0001, a lone surrogate). Older than
the sheet statements, and left so `fmt` output on existing files does not move in that change;
`number`/`revision`/`notes` already use `escapeStr`. Fix: the same escaper for the three.

### N.5 · `E_DRAWING_LIMIT` catalogue names the NOTES cap: done by #840, waiting to be archived — `note`

`src/error-catalog.ts` describes only the primitive budget; the NOTES cap (over 200 wrapped
lines, `src/draw-budget.ts`) raises the same code with its own message. One sentence (with N.2).

### N.6 · Wide glyphs overrun the NOTES column — `todo`

The project-wide width estimate (`src/text-metrics.ts`, 0.62 em per character) has no wide-glyph
weight, so a line of 57 CJK characters (or 57 `W`) runs past the table's right rule; the page
does not grow. Needs a per-character width class in the shared estimate, not in the wrapper.

### N.7 · Sheet tables at extreme sizes — `declared`

Every margin table's row height scales with the drawing's reference dimension, so a plan wider
than about 4.65 km with 200 NOTES lines draws past `MODEL_RANGE_MM` (a 30 km plan: page height
216,004,640 mm) — as `schedule rooms` with 200 rooms already does on main (218,044,654 mm). The
slowest accepted `-f png` is 21–23 s / 7.9 MB (a 4×3 m plan with 200 lines). ROOM(S) clips at
23 characters with some slack left in the drawn column.

## Parked from the algebra programme (2026-09, [ADR 0020](adr/0020-algebraic-core.md))

### 6.1 · D4-orbit `reroll` for a component or a `place … mirror` — `todo`

W6b landed `arch reroll` + the LSP `refactor.rewrite` action + the `reroll()` API
(`src/reroll.ts`, sharing `src/pipeline.ts`'s one `compileUncached` with `compile()`), but
only for a **translation** arithmetic progression — same statement, same structure, a numeric
slot advancing by a constant delta each iteration (`for i in 0..N { … i*d … }`). It does not
recognise a run related by a D4 group element other than the identity: three `place`d
instances of the same component at `rotate 0`, `rotate 90`, `rotate 180` (or a mirrored pair)
are a real repetition — an ORBIT under `src/algebra/d4.ts`'s normal form — that a reader would
also fold into a loop by hand, but nothing here proposes `for r in [0, 90, 180] { place C(...)
rotate r ... }`. Detecting it needs a second structural-match mode (same statement/args, an
`at`/`rotate`/`mirror` triple forming a D4 orbit rather than an AP) ahead of the same proof
obligation `reroll.ts` already has; the proof machinery (`proves`/`compileUncached`) carries
over unchanged. Track under a new work-package; do not build ahead of it.

### 6.2 · A `mirror` fact on `describe()` furniture — `todo`

Plan JSON already projects a reflecting `place`'s furniture as `mirror: true`
(`planToJson`, G.10). `describe()`'s own furniture facts do not carry the equivalent bit, so
an agent reading `describe()` alone cannot tell a mirrored piece from an unmirrored one of
the same kind without also fetching Plan JSON. Small, additive, same key name.

- 6.3 · Plan JSON reflection on dims, doors and vertical runs — done (doors, dims), vertical _tail/_mirror not projected → archived (lab)

### 6.4 · Rectangle-algebra path consistency for `intent` (rejected for now (ADR 0020)) — `decision`

Considered and set aside while writing ADR 0020: routing the `intent` channel's
adjacency/reachability assertions through a general interval/rectangle constraint solver
instead of today's bipartite matching (`checkPredicates`). Rejected as an eval-judge risk —
a solver can satisfy a rubric with a *different* room assignment than the judge expects,
moving eval scores for reasons unrelated to plan quality. Revisit only against a concrete
rubric failure, not as a generalisation exercise.

### 6.5 · Exact projective predicates (orient2d / homogeneous intersection) (rejected for now (ADR 0020)) — `decision`

Measured bounds with today's plain double arithmetic: `orient2d` stays exact to `2²⁵` mm;
homogeneous line intersection is exact only to about 104 m (`2^(50/3)` mm ≈ 104,000 mm). Both cover every plan size the
language can express today. Revisit only if a shipped plan (not a synthetic stress case)
measures outside either bound. Re-examined and kept rejected in
[ADR 0022](adr/0022-exact-decisions-and-bounded-input.md): the exact decisions this round
needed were integer or `BigInt` comparisons on the 0.001 mm lattice and squared lengths, which
rely only on IEEE-exact `+ − × ÷ √`, not on projective predicates. The `2²⁵` mm bound is also
the candidate modelling range in M.1.

- 6.6 · A trig/hypot cross-engine audit — measured: no divergence; replacement not motivated → archived (lab)

### 6.7 · `while` and reassignment removal at 2.0 (owner decision: remove at the next MAJOR, no code before then) — `decision`

_In the 2.0 bucket: in no schedule, done with V.5, V.6 and PS0.16's escalation at 2.0._

`W_WHILE_DEPRECATED`/`W_REASSIGN_DEPRECATED` (`src/while-deprecation.ts`) soft-deprecate the two
forms and `arch fix` offers a proven `while`→`for` rewrite (`src/while-fix.ts`); nothing is removed
before the major. Removing them is language-breaking, so it ships in the same 2.0 as the
axonometric removal (V.5) — one combined
plan, one migration note, one byte-identity sweep. No shipped example, `test/fixtures/*.arch` or
`dataset/` plan uses either form, so the sweep needs no example edits.

Checklist:

- [ ] **Escalate, do not delete, the parse.** `Parser.parseWhile` and `Parser.parseAssign`
      (`src/parser.ts`) keep recognising both forms so the error can point at the construct and
      carry the rewrite. `W_WHILE_DEPRECATED`/`W_REASSIGN_DEPRECATED` become errors under new
      catalogued `E_*` codes (`src/error-catalog.ts`; propose `E_WHILE_REMOVED` and
      `E_REASSIGN_REMOVED`, since the prefix encodes severity), raised from
      `src/while-deprecation.ts` (`checkWhileDeprecation`; rename the module), still forwarded
      from an imported module by `src/import.ts` and still ignored for a reassignment inside a
      `while` body. The `ast.ts` `WhileNode`/`AssignNode` stay so the parse tree and the fix can
      name them; the `while`/`assign` cases in `src/ir.ts`'s `expandScope` stop expanding (the
      plan does not resolve) and `E_WHILE_LIMIT` plus `MAX_ITERATIONS` retire.
- [ ] **The proven rewrite becomes the migration path.** `arch fix` keeps `proveWhileFixes`
      (`src/while-fix.ts`, wired in `src/cli/commands-author.ts`) and applies it to the new error.
      Because the plan no longer compiles, the proof cannot compare against the original run:
      re-root it on the parse-stage shape (`canonicalShapeAt`) and prove the twin against the
      pre-2.0 semantics kept as a test oracle, or ship the rewrite as `arch fix --migrate-2.0`
      run on the last 1.x. Decide this before the code: it is the one non-mechanical item.
- [ ] **The counter-example that is not a counted loop.** A `while` whose body does not have the
      canonical `let I = A; while I < B { …; I = I + 1 }` shape (or a bare reassignment) has no
      machine rewrite; the error's hint names `for NAME in A..B` and `let`, as today.
- [ ] **Generated surfaces** (never hand-edit; run `npm run gen:all` and `npm run docs:build`):
      `while` stays in `src/grammar/tokens.ts` `KEYWORDS` (the parser still recognises
      it, and the editors keep colouring it); remove `while-stmt` and `assign-stmt` from
      `scripts/gen-gbnf.ts` (`grammars/archlang.gbnf`) so a constrained decoder cannot emit them; update `scripts/gen-llm-spec.ts` (`spec.llm.md`,
      `llms-full.txt`); `gen:errors` for `docs/error-codes.md`.
- [ ] **Hand-written docs:** `docs/language-reference.md` ("Reassignment" and "Control flow"),
      `docs/error-codes.md` examples, `docs/agents/architecture.md`, `skills/archlang/SKILL.md`, and a migration
      note in `CHANGELOG.md` ("Removed"): the before/after for a counted loop, the accumulator
      (`let total = 0; while … { total = total + x }`, which has no `for` twin and needs an
      `if`/`let` chain or a component parameter), and the `arch fix` command.
- [ ] **Tests that change:** `test/while-deprecation.test.ts` (warning → error),
      `test/while-fix.test.ts`, `test/spec-forms.test.ts` and `test/diagnostics.test.ts`
      (the forms' spec rows and catalogued codes), `test/lang.test.ts`, and
      `test/while-byte-identity.test.ts` with `test/while-byte-identity-baseline.ts` (the
      `compile().diagnostics` law over every example and fixture: it must stay green with the
      new codes and NO re-measured row, since no shipped plan uses either form).
      `test/byte-identity-baseline.ts` and the other `*-byte-identity` suites must not move.
- [ ] **`arch fix`'s special case** (`src/cli/commands-author.ts`, the `W_WHILE_DEPRECATED`
      filter that calls `proveWhileFixes`) re-targets the new error code. `arch validate
      --strict` needs no change: it is the generic warnings-fail, and the error already exits
      non-zero.
- [ ] **Prove it:** SHA-256 sweep of `compile`, `describe` and `lint` over every example, and a
      plan using `while` returns the new `E_*` with a span and the rewrite, never throws.

- 6.8 · `museum-wings.arch`'s `full` layer was C1, and a double door read as obstructed — closed → archived (lab)
- 6.9 · `W_SWING_OBSTRUCTED`'s narrowing hint was wrong at a shortfall of 0 — closed → archived (lab)

### 6.10 · A door's `at` snaps to the grid silently (observation, no decision) — `todo`

On `grid 100` the resolver rounds a door's `at` (`Math.round`: `src/ir.ts`,
`src/elements/door.ts`, `src/attach.ts`), so 900 mm leaves written at 20550 and 21450 resolve to
20600 and 21500: a double door's "shared jamb" lands at x=21050, 50 mm off an axis at 21000, and
nothing says so. No diagnostic reports the snap. Found via 6.8, which sidestepped it with even
1000 mm leaves; behaviour deliberately unchanged.

### 6.11 · The analysis reads a double door as two narrow doors, not one wide opening (no code) — `todo`

`describe()`'s access graph and circulation treat each leaf of a double door as its own door.
`museum-wings.arch`'s main entrance (two 1000 mm leaves, 940 mm clear each) therefore counts
as two 940 mm doorways, not one ~1940 mm opening, and every room's `bottleneckClearWidth` is now
1140 mm: the widest way in is a wing's 1200 mm exit, not the main door. A pair of leaves on a
shared jamb with both open is one opening to anyone walking through. Open: whether (and how)
the analysis should recognise a pair: shared jamb, same host, both hinged on the outer jambs.
The deferred egress facts (M.16) would settle it as a side effect: a max-flow door capacity
has to merge a pair (`isDoubleDoorPair`) before it can count one.

**Carded 2026-11-11 as RM1.3c** (`docs/plans/product-roadmap/cards.md`, split out of RM1.3a): a
design ruling on the open question comes before any code.

- 6.12 · The swing-overlap sampler missed real overlaps — closed → archived (lab)

## Found in the robustness programme ([ADR 0022](adr/0022-exact-decisions-and-bounded-input.md))

Defects, limits and deferred capabilities the numbers/parser/predicates/multi-storey work turned
up and deliberately did not widen into. Each says what was re-run for this entry; where nothing
was, it says so and names where the observation came from.

- M.1 · Absurd finite magnitudes: a modelling range — closed (every sub-item decided) → archived (lab)
- M.2 · A global step budget for element-free nested loops — closed → archived (lab)

### M.4 · Shaft-reached storeys: what the first cut leaves out — `todo`

Circulation now walks a storey reached only by a stair, lift or escalator from the run a
person arrives by (ADR 0008's addendum). Left out, each re-run unless noted:

- `--overlay circulation` draws nothing there (`computeCirculationOverlay` gets no arrivals and
  the overlay path has no building context). Re-run: `hillside-villa` level 2's overlay SVG is
  byte-identical to the plain drawing; level 1's is not.
- Direction of travel is not modelled: `dir` is a per-storey drawing convention, so an escalator
  PAIR (one up, one down) seeds the upper storey at both cars. Re-run on a two-storey probe:
  the upper room is walked from `e_dn`.
- The landing test is now on the plan's geometry, and it is SAMPLED: nine points along the
  head, about 112 mm apart on a 900 mm flight, each 1 mm beyond it (`LANDING_PROBE_MM`,
  `src/analyze/circulation.ts`). An obstruction narrower than the spacing can sit unseen
  between two points, a free slot narrower than it can be missed, and floor 1 mm deep counts
  as a landing even with a partition 50 mm farther out. A probe one body radius deep was
  measured and not taken: it seals `two-storey`'s 200 mm upper landing (code comment; not
  re-run here).
- The nearest-cell fallback (a landing row with no free cell in some frames starts the walk
  beside the flight) can add up to two cells of frame spill on its own; the red team measured
  walks spilling up to 6 cells on random buildings against 4 before. The per-building bounds in
  `test/shaft-equivariance.test.ts` are measured, not proven.
- A landing that seeds nothing still reads `unreachable` (head against the shell) or
  `no_threshold` (a covered landing on a door-less storey); a distinct reason for a sealed
  landing would be a schema change (documented in `docs/analysis.md`, pinned by
  `test/shaft-circulation.test.ts`).
- Same-id stops whose footprints do not overlap on the two storeys raise nothing; a lint for
  them is deferred. (A run drawn along another axis upstairs now takes its own entry edge rather
  than reading its flight length as the landing width, pinned in
  `test/shaft-circulation.test.ts`.)
- Walls are never eroded, so the 400 mm passage under hillside's flight reads 700 (from the
  card's report; not re-run).
- `two-storey`'s upper landing is a 200 mm strip between the void and the stair head, a
  one-cell pinch: re-run, the landing reads 900 and every room past it 700, narrower than any
  door on the way (740, 840).
- Per-room reachability on an upper storey for intent `reachable`: done by RM9.10, waiting to
  be archived (`levels[i].access.rooms[].reachable` is read per storey; a storey nobody arrives
  on reaches none of its rooms).
- `suggestTopology` per storey: done by RM9.10, waiting to be archived (each storey walked as
  lint walks it, `level` and `insertAt` on a level plan, no door to the outside on a storey
  reached only by a shaft nor onto a roof). Still open: it fixes its tolerance at `DEFAULT_TOL` (`src/suggest.ts`), while
  lint's access graph reads the ruleset's `tolMm`, so under a custom tolerance the two can
  disagree on what connects (code read).
- `diffPlans` compares the lowest storey only (documented), so upper storeys are never diffed.
- An ungrounded storey's balcony doors share one exterior node, so a room opening only onto
  balcony B counts as reachable from a room opening onto balcony A, and the room-aware fixpoint
  inherits it (one node per outdoor surface would separate them). On a grounded storey
  `describe().vertical` relays through a room a shaft lands in, while lint's reachability never
  starts from it, so lint can call a room the building graph relays through disconnected.
  `buildingRoomReach` (the callback `describe()` passes to `verticalReach`) is not exported, so
  a caller of the public `verticalReach` must build its own. (From the card's reports; not
  re-run.)
- `describe()`/`lint()` compute the vertical fixpoint and then `arrivalRuns` recomputes it, plus
  one storey-removed fixpoint per ungrounded reachable storey: redundant, cheap at dozens of
  storeys (code read).

- M.5 · The corpus equivariance oracle does not cover multi-storey plans — closed (T0–T3) → archived (lab)

### M.6 · Load-sensitive visual and sheet tests — `todo`

`test/visual.test.ts` and `test/sheet.test.ts` hit vitest's 5 s per-test budget under heavy
machine load and pass alone: the same shape as 4.10, and the same options apply (an explicit
timeout on the heavy cases, never a raised global `testTimeout`). Observed during this
programme's gate runs; not reproduced on purpose here.

- M.7 · `diffPlans` follow-ups — closed → archived (lab)

### M.8 · The source formatter is lossy past three decimals, and silent when it refuses: done by #946, waiting to be archived — `note`

**Carded as** AF6 (`docs/plans/product-roadmap/cards.md` track 10, 2026-11-18).

`format()` prints every literal through `fmt3`, so precision beyond 0.001 mm is dropped and a
`.0005` rounds by the binary value. Re-run: `room id=a at (0.0004,1.0005) …` formats to
`at (0, 1.001)`. Separately, `arch fmt` on a file with parse errors (including the newly
diagnosed trailing content) prints it unchanged and exits 0, so nothing tells the user it
refused: re-run on a stray-`}` file. Consider a note on stderr or a non-zero exit.

Closure note (#946, card AF6, decided under the RM-D65 delegation). `format()` prints each literal
through `fmtLiteral` (`src/num-format.ts`): `fmtSource` where that reads back as the same double, else
the shortest decimal that does, so every value with three decimals or fewer keeps its bytes (`fmt`
over every tracked `.arch` is byte-identical) and `at (0.0004,1.0005)` stays as written. `arch fmt` on
a plan that does not parse exits 2 with one line on stderr; `--json` adds `parsed: false` and the
parse `diagnostics`, with `ok: false`. Residue, not fixed: `repair` (through `formatPlan`) and every
fix producer still re-print an untouched literal of more than three decimals at 0.001 in the statement
they rewrite, and the playground's Format button still says "Already formatted" on a plan it refused.

### M.9 · Grid snap rounds half up, so a mirror image snaps differently — `todo`

`Math.round` rounds .5 toward +∞, so snapping is not odd-symmetric. Re-run on `grid 50`: a room
at x = 25 resolves to 50, at x = −25 to −0 (not −50; the JSON prints `0`). A mirrored drawing
therefore snaps to a different shape. The same rule makes `fmt2(−x) ≠ −fmt2(x)`: `fmt2(0.125)` is
`0.13`, `fmt2(−0.125)` is `−0.12` (re-run through `src/num-format.ts`). Changing either moves
output; it needs a decision and a sweep.

### M.11 · LSP rename misses an assignment target: done by #887, waiting to be archived — `note`

`rename` (`src/lsp.ts`) collects references from expressions and instance names, not the name
on the left of `NAME = expr`. Re-run: renaming `x` to `y` in `let x = 1`, `x = x + 1`,
`room at (x,0) …` gives `let y = 1`, `x = y + 1`, `room at (y,0) …`. Low priority:
reassignment is deprecated and removed at 2.0 (6.7).

### M.12 · `detourRatio` divides a 4-connected walk by a straight line (observation, no decision) — `todo`

The walk is measured on the 4-connected nav grid (an L1-like length) and divided by the
Euclidean line, so a direct diagonal walk reads about √2. Re-run: an empty 8 m × 8 m room
entered by a door at x = 700 reports walk 7000, detour 1.41. Harmless at the default
`maxDetourRatio` of 3, misleading for a tight one. Related: C.3.

### M.13 · A polygon room's occupancy seed breaks ties in page order — `todo`

`src/analyze/occupancy.ts` seeds a polygon room's doorway at the nearest free cell with ties
broken row-major (its own comment says so), the page-order tie the nav grid gave up in E.6–E.10.
Code read only; no flipped fact has been reproduced, and the occupancy grid is not in the
equivariance oracle's comparison.

### M.14 · A roof's acute corner is mitred without bound (policy, no decision) — `todo`

`roof overhang` meets two offset faces at their line intersection, so at an acute corner the
eave runs far past the wall. Re-run: a 10° corner with `roof overhang 600` on a 200 mm wall puts
the eave apex at (−8002, −700), about 8033 mm from the wall corner, while the wall joinery
bevels the same corner; lint is silent. Defensible as drafting (the eave is where the faces
meet); a bevel or a miter limit is a policy choice. The roof keeps its own `meet` rather than
`meetLines` (`src/geometry/intersect.ts`): unifying them moved about 11 % of decimal
rectilinear rings by 0.01 in SVG, so it needs its own measured change. `connectorEdges`
(`src/analyze.ts`) and `PARALLEL_SIN` (`src/geometry/intersect.ts`) are exported but no longer
imported outside their modules (grep re-run).

### M.15 · Parser recovery and resource-cap follow-ups — `todo`

**Carded as** AF1, the `relatedSpans` bullet only (`docs/plans/product-roadmap/cards.md` track 10, 2026-11-18).

- ~~`relatedSpans` (the "plan was closed here" note) reach only `arch compile`'s text output, not
  `--json` or the LSP.~~ Done by #944 (AF1): `diagnosticToJson` emits `related`, `instance` and
  `component`, and the language server emits `relatedInformation`.
- Indentation-guided recovery: a tab meeting spaces has no order, so such lines fall back to
  the previous rule; when a block header fails and its `}` is also missing, the deeper-indented
  lines are skipped as its body (pinned in `test/parser-recovery-metric.test.ts`).
- `relocateLabels` was quadratic in co-located rooms (about 11 s at 5,000 identical rooms, from
  the card's report). Identical rooms now continue a remembered sum (M.19): that plan compiles
  in 0.74–0.85 s, down from 7.0–7.3 s. Distinct rooms whose labels all overlap are still
  quadratic in the labels, because the exact sum has that many nonzero terms (M.19), so this
  alone does not justify raising `MAX_ELEMENTS`. `E_ELEMENT_LIMIT`'s catalogue
  text says "5,000" literally; `test/element-cap.test.ts` keeps it equal to `MAX_ELEMENTS`.
- The shared stack budget (`MAX_STACK_UNITS`, `src/expr.ts`) was measured cold on Node, Node
  workers and Chromium/Firefox/WebKit workers; the rule (minimum capacity / 1.5) is the thing to
  re-run when an engine changes, and the table lives in that docstring.
- `reroll`: a run that `buildCandidate` rejects (a `#` comment inside or after the maximal run)
  is rescanned from each later start, so detection stays quadratic on that input (about 3.2 s
  at 800 statements, from the card's report). The linear `findRun` kept these semantics on
  purpose.
- Eval `proveInfeasible` never combines a plan-wide floor with a concept's exact count:
  `{total ≤ 12, every room ≥ 5, exactly 3 bedrooms}` is infeasible but derives no conflict (from
  the card's report).
- `W_ROOM_NOT_ENCLOSED` on a circle room says "~18850 mm of its perimeter has no wall" of a drum
  whose wall is visible but whose centreline lies more than the tolerance off the radius (a
  420 mm wall with its inner face on R). The rectangular path words a wall off an edge the same
  way; "not backed by a wall centreline within 200 mm" would be truer.

### M.16 · Deferred capabilities (each needs a consumer) — `deferred`

Recorded with reasons in ADR 0022; none was built this round.

- **Egress facts** (an opt-in `describe --facts egress`): room dominators, a door-disjoint second
  route, max-flow door capacity (which would also settle 6.11's double door), the capacity left
  when any single exit fails (a minimum cut), exit separation.
- **A daylight-ratio fact**: glazing over floor area from the height datum already authored.
- **Roof ridges from the straight skeleton**: exact on ½ℤ for an integer rectilinear outline,
  but a roof plan is another drawing and a new language form.
- **Dimension completeness** (P2-8): which plan lengths no `dim` fixes; a set difference.
- **A deterministic `ownerOf`** for playground drag-to-edit: which literal owns a coordinate.
- **Small-scope parameter enumeration**: compile a component over a small parameter grid and
  report the failing values, worded for that range only.
- **A clear-width decision by squared comparison**: whether a disc of width w passes a gap is
  exact with squared distances (`BigInt` for large oblique values); the nav grid quantises it.
- **A per-brief cluster bootstrap for eval comparisons**: an observation only; it does not
  reopen G1.
- Interval-graph layering for `W_DIM_OVERLAP`, regular-path queries on the access graph, bare
  component extraction (MDL), a dataset entropy report: possible, no failure evidence yet.

### M.20 · Intent concept `dining-room` is not a table key, so a room labelled "Dining" misses it (needs an owner-approved `SYNONYMS_VERSION` bump) — `decision`

`CONCEPTS` (`src/intent-concepts.ts`) has `dining` but no `dining-room`, so `dining-room` is an
UNKNOWN concept and takes the literal fallback in `roomsMatchingConcept`: it matches the label
"Dining Room" but not "Dining". Re-run: a one-room plan labelled "Dining", intent
`{"roomsInclude":[{"concept":"dining-room"}]}`, `arch score <plan> --brief <intent> --json`
gives `satisfied: 0` and `E_INTENT_ROOM_MISSING`; the same plan against `dining` satisfies. The
fix is a table change (a `dining-room` key or alias), which bumps `SYNONYMS_VERSION`; the
version is pinned by a test and the eval scores through the same table, so the bump is the
owner's call.

### M.20a · Spanish and Portuguese label words in the concept table (NR.16's second half; needs an owner-approved `SYNONYMS_VERSION` bump) — `decision`

NR.16 (ruling RM-D68) asked for es/pt words in both the use classifier and `CONCEPTS`
(`src/intent-concepts.ts`). #973 built the classifier half only: a room labelled "Dormitorio" or
"Cozinha" reads as `uses bedroom` / `uses kitchen` and meets every concept that carries a room
kind or a `room_type`. Six concepts carry neither, `consulting-room`, `meeting-room`,
`private-office`, `reception`, `suite` and `unit`, and match by their English label words alone,
so "Recepción", "Sala de reuniones", "Consultorio" or "Apartamento" never meets one; nor does a
master-bedroom phrase ("Dormitorio principal", "Quarto principal") count by its label. Adding
those words (and an accent fold to `synonymMatchesLabel`) changes the eval's table, so it bumps
`SYNONYMS_VERSION`, which is the owner's call (as M.20). #973's first round carried such a table
change and its body lists the words; the false friends found there (a pt-PT "Quarto de banho
principal" read as a master bedroom, "Suíte" as the commercial `suite`) need guarding first.

### M.21 · `format()` writes the plan name with `JSON.stringify`, which the lexer cannot read back: done by #872, waiting to be archived — `note`

The lexer knows only the escapes `\n`, `\"` and `\\` (`src/lexer.ts`, the string-literal
branch), but `src/format.ts` prints the plan name, level names, zone labels, import specs and
title fields through `JSON.stringify`, which also emits `\t`, `\r`, `\uXXXX` and the like.
Re-run: `plan "A<TAB>B"` through `arch fmt` prints `"A\tB"`, which reads back as `AtB`
(`arch describe --json` `plan`). `arch finish` already uses the language's own escaper;
`format()` should too.

### M.22 · `finish` furnish stage: what it leaves alone (limits, not defects) — `todo`

`src/furnish.ts` furnishes rectangular rooms with an authored `id=` of their own, on every storey,
and only a room that holds no furniture. Each of these is reported in `unresolved` and left as it
is:

- polygon and circular rooms;
- rooms inside a component instance (a plan body can name them, `in u1.bed`, but the stage writes
  nothing for one; a single-storey plan's bytes and a storey's must agree if that changes);
- rooms over `MAX_ROOM_AREA_M2`;
- a room that already holds any furniture (fill-only: it is never topped up);
- relational rooms with no fixed `at`.

A kitchen run additionally needs a wall with an `id=` of its own for `against wall` to name;
without one the required piece has no position and the use is left out.

### M.23 · Default PNG export of a large sheet is over 2000 px on a side — `todo`

`arch compile -f png` at the default raster scale writes `examples/museum.arch` at 3179 x 2245
and `examples/studio.arch` at 9648 x 10214, and some image readers refuse an image over 2000 px
on a side. `-s <n>` lowers it (`studio.arch` at `-s 0.25` is 2412 x 2553). Re-run:
`node dist/cli.js compile examples/museum.arch -f png -o out.png`, then read the width and
height from the PNG header (bytes 16-23).

- M.24 · An unseeded property test flakes about once in 200 runs — done → archived (lab)
- M.19 · Quadratic passes the two budgets do not see — closed (label placement kept by decision; ring tests charged after a reopening) → archived (lab)

## Found in the symbol redraw ([ADR 0023](adr/0023-plan-symbol-drawing-language.md))

Things the plan-symbol redraw turned up and deliberately did not widen into. Each was re-run on
`main` for this entry through the CLI or the source named in it.

### D.4 · Fence ticks and window sills draw outside `bounds()` — `declared`

`fence.bounds()` is the run's points, and every post tick stands `7 × thin` either side of the run;
a corner tick lies along the bisector, past both runs. Re-run: `fence picket { (0,0) (6000,0)
(6000,4000) }` draws ticks to y = −67.2 and the corner tick from (6067.2, −67.2) to
(5932.8, 67.2). `window.bounds()` is empty on purpose (its comment); the sill stands 0.2 t proud
of the outside face, and `window.measures()` covers it. The page margin absorbs both today.

### D.5 · A hatch's `origin`/`zoom` is honoured by SVG only — `todo`

`toDxf` writes a `HATCH` from the material, scale and angle and drops `origin` and `zoom`
(`src/export/dxf.ts`); PDF fills every hatch with the solid poché base, so neither applies there.
Re-run: `examples/garden-house.arch -f dxf` carries the legend and 23 `HATCH` entities on level 1,
so its ground swatches tile from the drawing origin at full size, the framing the SVG swatch was
moved off. A plugin's hatch with an `origin` is affected the same way.

### D.6 · `pool_table` is catalogued `symmetric` but is not quarter-turn exact — `todo`

On a square footprint its rail, cushion and pockets follow the long axis, so a quarter-turn is a
different drawing; mirror and half-turn are exact. Re-run: `fixtureGlyph("pool_table", …)` against
`rotateNode(…, 90)` under `marksEqual`, for squares of 1–2400 mm at offsets 0, 100 and 1000:
false at every one. No D4 sweep covers it (`glyphs-misc.test.ts` sweeps `plant` and
`meeting_table`). `rug` and `shrub`, which failed the same sweep before the redraw, now pass. With
`requiresWall: false` and no `directional`, the flag changes no orientation decision; drop it or
make the square drawing D4-exact.

### D.7 · The sheet draws two different hairlines (an owner decision) — `decision`

A sheet-table hairline (`rule(…, hairline)`, `src/sheet-tables.ts`) is `extraThin`,
`thin × 13/18`; the title block's row rules are drawn outside the Scene at `thin × 0.5`
(`src/backends/svg.ts`, `src/export/pdf.ts`). Re-run: `examples/garden-house.arch` level 1 has
`thin` 18, the schedule's and the legend's hairlines at 13 and the four title-block rules at 9, in
the SVG and in the PDF alike. One hairline for the sheet (`weightWidth("extraThin", sizes)` for
the title block too) moves the SVG and the PDF of every plan with a title block, so it is the
owner's call.

- **Closed: SVG and PDF disagreed on the table hairline.** The rule carried
  `paint.width = thin × 0.5` beside `lineWeight: "extraThin"`; SVG follows the weight and PDF
  reads `paint.width`, so the PDF drew the tables' hairlines at 9. The rule now carries the width
  its weight resolves to (`weightWidth`); no SVG moved.

### D.8 · The before/after specimen tool lives outside the repo (a want) — `todo`

Judging a redraw needs every family drawn old against new at one footprint, at 1:50 and 1:100
and in each theme. The tool used for this redraw was never committed; `scripts/` has no
equivalent. Consider promoting a `scripts/specimen` that takes two checkouts and writes one PNG
sheet, kept outside `check:drift`.

**Carded as RM8.5** (`docs/plans/product-roadmap/cards.md`, stage D, not started on 2026-11-11).

### D.9 · A wall-thickness call-out can sit on a stair, column, elevator or escalator — `todo`

`thicknessStation` (`src/scene-build.ts`) keeps a thickness call-out (`dims auto walls` and
`dims auto all`) off the openings on its wall and off furniture footprints, but nothing else that
stands on the floor blocks it. Re-run: `examples/townhouse.arch` draws its "300" at
(4871.25, 3550) on all three storeys, inside stair `st` (x 4150–5050, y 2600–5800); the same as
before the furniture rule landed. Its `el.kind !== "furniture"` test is a one-entry stopgap for
"what occupies floor". Close by declaring that once, on the element (an `ElementDef` field read
through the registry, with each element's `bounds()` as the footprint), and reading it here and
in any other placement that avoids obstacles. It moves the drawing of every plan whose call-out
stands on such an element.

---

## Wave 5 — deferred by name in v1.28.0 / v1.29.0

Each of these was **named in `CHANGELOG.md` at the time it was skipped**, not quietly omitted, so
nobody has to guess whether it was overlooked. Two v1.28 entries are already gone from this list:
`rug`, `sofa_l`, `piano` and `sun_lounger` were deferred there and **shipped in v1.29.0**.

### 5.1 · An `arc` edge under `roof overhang` — `todo`

`roof overhang <mm>` mitres a closed wall ring outward in closed form (line–line intersection,
orientation from the shoelace sign). A curved edge has no such offset in the same arithmetic, so
`E_ROOF_CURVED` **refuses** rather than approximating, and the author writes `roof polygon …`
instead. An offset ring that carries arcs is an offset ring whose whole consumer set has to
learn arcs; the `room polygon` ring learned them through one seam (card ARC2,
`docs/plans/arc2-room-arcs.md`, `src/geometry/room-ring.ts`), the pattern to follow.

**Gate:** the refusal's own test in `test/roof.test.ts` inverts — an arc-bearing ring must produce
a drawn eaves line at `R ± overhang` on the curved run, and the exact-coordinate assertions on the
straight runs must not move.

### 5.2 · A non-right-angle polygonal `void` — `todo`

**Shipped for right angles** (CR8, PR #493, merge `b3c72976`, 1.55.0): `void polygon …` takes a ring whose
every edge is horizontal or vertical (an L, a U, a notch), and a slanted, crossing or degenerate ring is
`E_VOID_POLY`. **What remains is a ring with a non-right-angle edge**, which needs the cell
machinery to change.

The original entry: `void … size WxH` was rectangle-only in v1. A ring form needs the machinery `room polygon` already
has, and **every consumer here was written on a rectangle**: the nav-grid obstacle, the poly-aware
room attribution, and `frame.ts`'s `transformElement`. Cheap to add to the grammar, not cheap to
add to those three.

### 5.3 · Area subtraction under a `void` — `todo`

A void deliberately does **not** reduce its room's area today; `describe --json`'s `voids[]` gives
the extent so a consumer can subtract. That decision is *pinned* by `test/void.test.ts`, so
changing it is an argument with a test rather than an oversight — which is the point. Before
reopening it, decide what a subtracted area means to `schedule rooms`, to the room label's `m²`
text, and to an intent's area assertion, because those three are what would silently disagree.

### 5.5 · A syntax for overhead dashes (the CONVENTION is settled; the syntax is not) — `todo`

`upper_cabinet` is drawn dashed because of *what it is*, and there is no way for an author to say
"draw this piece above the cut plane" about anything else. Any design has to decide whether it is a
clause on `furniture`, a property of a category, or a plan-level convention.

**The half of this item that was open is now closed.** It asked that `upper_cabinet`, `roof` and
`void` "agree about what dashed *means* before a fourth spelling appears" — and v1.31 supplied the
fourth (a `garage` door's overhead projection) and the agreement with it. The convention, stated
once and written into `src/elements/door-panels.ts`'s header, `docs/furniture.md` and the door-kinds
section of `docs/language-reference.md`:

> **A dashed outline means a thing above the horizontal cut a floor plan is taken at.**

Everything that draws one now derives its pattern from the single `dashedPattern(sizes)` helper in
`src/elements/glyph-lib.ts` and sets `lineType: "dashed"` beside it — `upper_cabinet`, `roof`,
`void`, the v1.31 `pergola` and the `shed`'s ridge, and the garage projection. (The three older
dashed rules in `door-panels.ts` — a `barn`'s two wall faces and a `bifold`'s opening line — dash
for a *different* reason, redrawing an edge the leaf covers, and deliberately keep their own raw
pattern with no named line type.)

What is still `todo` is the SYNTAX: an author still cannot say "draw this piece above the cut
plane" about an arbitrary `furniture` statement. The convention above is now the constraint any
such design has to satisfy rather than a question it has to answer.

**Item 5.7 supplied the SEMANTICS and deliberately did not touch this.** `overhead` is catalogue
data on four families (`upper_cabinet`, `wall_cabinet`, `mirror`, `range_hood`); this item is about
giving an author a word. So 5.5 is now a syntax problem, not a drawing one.

**One tripwire to respect when you take it.** `test/overhead-furniture.test.ts` pins that the
overhead set is exactly those four families **and that all four are `requiresWall`**. That premise
is load-bearing: it is why `W_FURN_CLEARANCE` has no `isOverhead` arm — every overhead piece is
already skipped one condition to the left, so an arm today would be unreachable, untested code.
A ceiling-hung family (a pendant, a projector, a ceiling fan hangs off the slab, not the fabric)
breaks both halves of that pin **on purpose** — and that is the moment to add the clearance arm,
which will then be reachable enough to test by consequence. **Deleting the pin instead of adding
the arm is the failure mode.**

### 5.6 · Angled furniture — `todo`

A fixture still draws on an **axis-aligned footprint**, so a piece against a sloped wall is not
turned to it. Deferred by name in v1.28.0. Related but not the same as 3.15 above (which is about
*measuring* against a curved wall, not drawing at an angle); both are instances of the fixture
layer knowing only rectangles.

## Room labels (found downstream, 2026-10-05)

### L.2 · What still overflows, by design — `declared`

Since #367 a room's label that does not fit is drawn smaller (`fitLabels`, `src/label-fit.ts`),
down to the furniture-label size, wrapped at a space where that helps, on a table of the wider of
Roboto's and Helvetica Bold's advances (`inkWidth`, `src/text-metrics.ts`). What is left:

- **A name wider than its room at the smallest height**: drawn there, and reported by
  `W_ANNOTATION_OVERLAP`. No leader line, and no word is ever split: `Abstellraum` does not become
  `Abstell-` · `raum` unless the author writes the space.
- **`wrapLabels` still judges at the generous estimate**, so the "Accessible WC" witness stays on
  one line through that step and is wrapped by `fitLabels` instead, which reads the width drawn.
- **The area figure never wraps.** It is a number and its unit, which no break should split. It
  goes down with the name, and past that overflows a room narrower than itself.
- **Fit is judged on the row through the label's anchor** by `wrapLabels`, so a name that would fit
  one line in a wider part of a polygon room may still wrap; and at most three line counts (the
  fewest and the next two) are tried, which bounds the work on any input.
- **The places tried are a lattice of the room's box** (`FRACTIONS`), so an L can have a clear
  place none of them hits. `W_ANNOTATION_OVERLAP`'s hint says the placer did not find one, no more.
- **An `outdoor` surface's name, a pinned label and the figure of a room with no name do not
  shrink**, and an `outdoor` name does not wrap; only a room's does.
- **The widths cover two faces, not every font.** A host with neither Helvetica nor Arial, or a
  theme that names another family, can draw a name wider than `inkWidth` reads. Outside the tables
  (past Latin-1, not CJK) a character takes the flat 0.62 em.

## A11y of the compiled drawing (found downstream, 2026-09-13)

v1.36.0 made an element a named control; the first consumer to wire a real screen reader to the
output (ArchCanvas, NVDA) then found what the compiler still leaves unnamed. **Every item here has
a consumer-side workaround today**, which is why none of them blocked the release and why each one
should be weighed against the cost of a new emitted attribute rather than fixed on sight. The
limitations are documented for consumers in
[`docs/language-reference.md`](language-reference.md) § "Known limitations (screen readers)" — an
entry closed here must be struck there in the same PR.

### A.1 · `dims auto` text is announced as a bare number — `todo`

An automatic dimension chain draws its readings as `<text>` carrying **no `data-arch-id`**, so
`accessible` neither names them nor hides them: a reader announces `3400`, `600`, `5600` with
nothing saying what they measure or that they belong together. Measured with
`{ annotate: true, accessible: true }`: `bungalow.arch` emits **87** unowned `<text>` nodes, most of
them dimension readings; `furnished-flat.arch` 40; `studio.arch` 11.

Two candidate answers, and they are not the same decision. `aria-hidden="true"` says a dimension is
decoration, which is wrong for a drawing whose whole point is measurement. `aria-label="3.4 metres"`
says it in words, which needs a unit-to-prose rule (and a language for it) the compiler does not
have. **Whichever is chosen, the annotation layer's own text is the scope** — the title block, the
schedule and the legend are A.4 and must not be folded in by accident.

An **authored** `dim` element is already correctly handled on this half: its drawn number carries a
`data-arch-id` and is `aria-hidden`. See A.2 for the other half of that case.

### A.2 · An authored `dim` becomes a control called `Dim` — `todo`

A `dim` statement is an element, so under `annotate` + `accessible` its first non-`text` primitive —
a witness line — is stamped `role="button"` with the kind-only name `Dim`. `studio.arch` has four.
A focusable control named for its kind alone is defensible for a door (`Door` is what the drawing
says about it) and not for a dimension, which exists to report a number a reader cannot get from
that name.

The cheap answer is to exclude `dim` from the primary stamping, the way `wall` is already excluded
— but `wall` is excluded because unioned geometry has no one element to point at, which is a
different reason, and a selection UI may legitimately want to click a dimension. The honest answer
is probably the measured value in the name, which makes this the same unit-to-prose question as A.1;
settle that one first.

### A.3 · `describe().caption` names elements by raw id, and it is SPOKEN — `todo`

The `<desc>` under `accessible` is the caption, and the caption ends *"…entrance via `d_front`,
`d_garden`"* — an author's identifiers, read aloud to someone who cannot see the drawing.
Consumers rewrite the sentence client-side, which is a second model of a fact the compiler owns.
The caption should name a door the way `aria-label` does, and it already knows how: the naming rule
landed in v1.36 and `describe()` does not use it.

⚠ **The caption is not only an a11y string.** It is `describe().caption`, an agent-facing field with
its own consumers and its own goldens; changing its wording moves the `<desc>` bytes of every plan
compiled with `accessible`, and the byte-identity law covers the DEFAULT output, not this one. It
needs the same treatment any `describe()` change gets, not an a11y-shaped patch.

### A.4 · The sheet's own text is unowned (may be CORRECT as it stands) — `todo`

The title block, the room schedule, the legend, the north arrow and the scale bar are `<text>` with
no `data-arch-id`: neither named nor hidden. In ordinary browse mode that is **right** — they read
as the drawing's printed matter, which is what they are, and a schedule read linearly is genuinely
useful. It only breaks inside a consumer's `role="application"` scope, where a reader stops
browsing and nothing reaches them.

So this may need no compiler change at all, and the entry exists to stop the next agent from
"fixing" it by hiding the schedule. If anything is owed upstream it is a document structure the
scope can expose — the tables are already built in one place (`sheet-tables.ts`) — not an
`aria-hidden`.

### A.5 · NVDA browse mode drops an SVG `role="button"`'s name (NOT OURS; file upstream) — `todo`

NVDA announces the first character of `aria-label` on an SVG `role="button"` and stops. The markup
is correct and other readers announce it in full. **Nothing in this repository should change for
it**; the action is to file it with NVDA and cite the issue here, so the next consumer that meets
the symptom stops looking for a compiler bug. Recorded because an undocumented reader limitation
reads exactly like one of ours.

---

### A.6 · The MCP shim cannot ask for an operable drawing — `todo`

`packages/mcp`'s `compile` tool takes `accessible` as a **boolean** and passes `annotate` only for
`format:"txt"`, so an MCP host can get the `<title>`/`<desc>` pair and nothing else: no
`data-arch-primary`, no `role="button"`, no `aria-label`, and no `{ idPrefix }` for a page holding
several plans. The core has all of it; the shim's schema is what is behind.

Cheap to close — `accessible: z.union([z.boolean(), z.object({ idPrefix: z.string() })])` plus an
`annotate` passthrough — but it is a **schema change on a published tool**, so it ships under the
shim's own rules: a bump in `packages/mcp/package.json` AND both `server.json` version fields, or it
never reaches npm or the registry. Documented as a limitation in `packages/mcp/README.md` until then.

---

### A.7 · `--accessible` cannot produce an operable drawing, because `annotate` has no flag — `todo`

**The whole v1.36 feature is library-only, and nothing said so.** The element controls need
`annotate` and `accessible` together; `accessible` has a flag and `annotate` does not exist as one.
`src/cli/serialize.ts` turns `annotate` on for `-f txt` / `--ascii` alone, where the ASCII renderer
needs it — so `arch compile --accessible --acc-id-prefix plan-7` emits a `<title>`, a `<desc>`,
`role="img"`, and not one `role="button"`.

Found by `test/docs-flags.test.ts` while writing the docs for this, which is the guard working: the
README had promised a `--annotate` flag for some time and the file it does not cover is the one that
made the claim. Every doc now says library-only; the flag is what is missing, not the sentence.

Closing it is a flag (`--annotate`, on `compile`/`preview`/`md`) plus a manifest row, a
`FLAG_KEYS` entry and the bidirectional drift pin those bring with them — small, but it puts a
**new public flag** on the primary agent interface and regenerates `docs/cli-reference.md`,
`llms-full.txt` and every baked MCP resource, so it wants its own PR and a version of its own.
⚠ It must not silently widen what `-f txt` does: `annotate` is already forced there, and a flag
that reaches the same option needs to be a no-op for that format rather than a second path to it.
Pairs with **A.6** (the MCP shim has the matching gap on the same option).

---

## Not a defect — gitleaks in FILESYSTEM mode reports four more (2026-09-20)

**Deliberately not excluded. Do not "fix" this.** `gitleaks dir .` (filesystem mode) reports four
`sourcegraph-access-token` findings — two in `CHANGELOG.md`, two in `docs/backlog.md` — where a git
commit SHA appears in prose. That rule matches a bare 40-character hex string, and a commit SHA is
one; `.gitleaksignore`'s header already records the same rule firing on the ecosystem census.

They do not affect CI. The nightly `secrets` job runs `gitleaks-action`, which scans GIT history,
and history mode does not surface them: it reads commit diffs, where the leading `+` changes the
context the rule needs. Verified 2026-09-20 — a full-history scan of this branch is clean
(`no leaks found`, 708 commits) while a filesystem scan of the same tree reports these four.

The reason to leave them is the cost of excluding them. `CHANGELOG.md` and `docs/backlog.md` are
long-lived prose files that a real token could plausibly land in one day, and gitleaks cannot scope
an allowlist to a path AND a shape (see `.gitleaks.toml`'s header: `matchCondition` is ignored on a
top-level allowlist and the conditions OR together). Excluding these two paths would therefore
switch the rule off for two files that must keep it. A finding that CI never sees is not worth that.

If a future filesystem-mode scan is wanted as a gate, the answer is a per-finding fingerprint in
`.gitleaksignore`, not a path in `.gitleaks.toml`.

## Found by the fresh-agent audit (2026-10-13)

A fresh agent was given a one-paragraph brief ("2-bedroom flat, about 65 m², open-plan
kitchen-living, one bathroom, entrance hall, small balcony; a drawing I can send to a builder")
and worked blind from the README and the site on core 1.42.1 and MCP 0.2.24. The audit and the
programme that answers it are kept outside this repository, in the growth repo's
`strategy/agent-reach-programme-2026-10.md`. Its cards A1 to A9, B1 to B7, C1 to C6 and D1 to D6
cover: the `arch` command collision, the skill bundle, the MCP `instructions` and tool texts, the
four lint `fix` texts, the `finish` skip of a partly furnished room, the dimension call-outs over
openings, the docs-site loop, centreline versus net area, door tags, DXF units and layers, sheet
notes, and the rest of the reach work. This section holds only what no card covers. Line numbers
were checked against `main` when filed; the quoted commands and outputs are the audit's own and
were not re-run when filing. Re-measure before building on one.

### U.1 · The balcony door is treated as a place a walk arrives from — `todo`

**Under way in RM1.3a** (`docs/plans/product-roadmap/cards.md`): fixed on the branch
`fix/rm1.3a-reachability-blind-spots` (head `fef92a70`, no PR on 2026-11-11), which still needs its
digest pins re-measured with reasons and a review before it can merge.

**Observed (audit finding 9).** On the audit's 65 m² plan, `circulation.rooms[r_live]` reports
`entranceId: "d_balc"` and a 2.2 m walk from the street, measured from the balcony slab. The
walk to the living room should start at the front door.

**Hypothesis.** `levelIsGrounded` (`src/analyze.ts:657`) already discounts a door that opens
onto an `outdoor balcony`, but the entrance list it reads, built at `src/analyze.ts:568-571`
(`joins(e) && e.exterior`), keeps the balcony door, and the circulation seeds are built from
that same list without the discount (`src/analyze/circulation.ts:1702,1742`). Which of the two
places should drop the door is open; settle it first, because `entrances` also feeds
`hasEntrance`.

**Gate:** a plan whose only exterior door besides the front door opens onto a balcony reports
the front door as `entranceId` for every room under `arch describe --json`; the circulation
and `lint()` rows over the examples are byte-identical unless an example has such a door (list
any that move, with the reason). **Size:** S.

### U.2 · Metres compile silently: done by #704, waiting to be archived — `note`

**Observed (audit finding 11, Appendix B).** `size 4x3` and `thickness 0.2` (metres written
where millimetres are the unit) compile `ok:true` with no diagnostic. Only lint reaches the
mistake, as "only 0 m²" and "0.9 mm wide". The spec states the unit as rule 1, and the audit
rated this "Partially" fixable in one shot.

**Hypothesis.** Nothing in the parse or evaluate stage sees a length below a plausible floor
for its role, since `MODEL_RANGE_MM` (`src/num-format.ts`) bounds only the top of the range.
The wall check at `src/elements/wall.ts:152` refuses only a non-positive thickness. Whether to
add a warning at that point or a lint hint that names the unit is open; a warning on a legal
tiny value (a hairline, a model in another scale) may be noise.

**Gate:** a catalogued code with a `fix` that names millimetres, fired on the audit's two
inputs and on no example (`arch lint --json` over `examples/`); the error-catalog example test
and `gen:errors` stay green. **Size:** S.
**Done by PR #704** (RM1.4), for the audit's two inputs only. `W_LENGTH_IN_METRES`
(`src/ir/silent-accepts.ts`) covers three places: a rectangle room's `size` with both sides under
100 mm, a wall `thickness` under 10 mm, and the two thicknesses of `walls from rooms`. Its
catalogue `fix` reads "Write the length in millimetres; the hint gives the clause times 1000."
Every other length still compiles silently; that remainder is U.2a. Re-checked for AF0 with
`arch compile --json` on the audit's two inputs (`test/silent-accepts/length-in-metres.arch`):
`ok: true` and two warnings, `Wall "shell" thickness 0.2 is read as 0.2 mm: lengths are
millimetres` (its hint: write `thickness 200`) and `Room "main" size 4 x 3 is read as 4 mm x 3 mm:
lengths are millimetres` (its hint: write `size 4000x3000`). `test/silent-accepts.test.ts` pins
both and the quiet thresholds. Its byte-identity law over `examples/` checks the "no example"
clause through `compile().diagnostics`, not through `arch lint --json` as the gate wrote: the code
is raised by the compile channel, which `lint()` does not report. A length that is too LARGE (a
size built from a product of two lengths, `ai-first-language` README §6 finding 3) is a dimension
check, not this entry. The entry is closed and waits to be archived to `archlang-lab` with
`scripts/backlog-archive.mjs`.

### U.2a · Metres still compile silently outside a room size and a wall thickness — `todo`

**Observed (AF0 probe on `main` at `7fd0c469`, `arch compile --json` then `arch lint --json`).**
In one plan with a 200 mm wall, these compile with `ok: true` and no `W_LENGTH_IN_METRES`:
`door … width 0.9`, `window … width 1.2`, `furniture bed … size 1.6x2`, `room … polygon (0,0) (4,0)
(4,3) (0,3)`, and the mixed `room … size 4x3000` (one side is not under 100 mm, so the room rule
stays quiet by design). Only lint reaches any of them, each in its own terms: `W_DOOR_CLEARANCE`
("Door is 0.9 mm wide"), `W_BED_UNDERSIZED` ("The bed is 2 mm long"), and `W_ROOM_TOO_SMALL` for
the two rooms ("only 0.01 m²", "only 0 m²"). The window's 1.2 mm width draws no word at all. None
of these findings says the cause is the unit. **Gate:** decide per clause which lengths get a
metres floor (a door or window `width`, a furniture `size` with both sides under its own floor, a
polygon whose every coordinate is under 100 mm), and record the choice here. Each chosen clause
then raises `W_LENGTH_IN_METRES` with a clause-times-1000 hint, pinned in
`test/silent-accepts.test.ts`, and that file's byte-identity law over `examples/` stays green.
**Size:** S.

### U.3 · A misspelt furniture category passes `validate --strict`: done by #848, waiting to be archived — `note`

**Observed (audit finding 11, Appendix B).** `furniture grand_pianno` passes `validate --strict`
with no signal at all, although an unknown material or theme key gets `W_UNKNOWN_MATERIAL`,
`W_UNKNOWN_STYLE_KEY` or `W_UNKNOWN_THEME_KEY` (`src/error-catalog.ts:835-850`).

**Hypothesis.** Furniture is deliberately open: a category outside `FIXTURE_FAMILIES` falls
back to a labelled rectangle (`src/elements/furniture.ts:347-348`), so a new name is legal and
a typo is indistinguishable from one. A warning would need a nearest-name test against the
catalogue (a fix of "did you mean `grand_piano`") and must stay quiet for a real custom name
with a `label`. Decide that line before coding.

**Gate:** `furniture grand_pianno` raises a catalogued warning with a nearest-category `fix`
under `arch validate --strict --json`; no example gains a diagnostic. **Size:** S.

### U.4 · A furniture `label` on a drawn symbol vanishes without a word — `todo`

**Decided 2026-11-06 (RM-D6, owner-approved): no diagnostic.** A `label` is data, not a drawing: confirm that `describe().furniture[].label` carries it (add it if missing) and write one sentence in `docs/furniture.md` that a drawn symbol does not draw its `label` and that the label goes into `describe` and the schedule. Carded as part of RM1.4 (`docs/plans/product-roadmap/cards.md`); `schedule fixtures` is RM4.2. The text below is the original question.

**Observed (audit finding 11).** A `label` on a furniture item disappears from the drawing with
no diagnostic.

**Hypothesis, and why it is not a plain bug.** This is by design: a drawn symbol ignores its
`label` (AGENTS.md, "New element"), and the labelled-rectangle fallback is "the ONLY path that
renders a furniture `label` at all" (`src/elements/furniture.ts:347-348`). The gap is that the
author is never told. Either an info-level diagnostic when a `label` is present on a drawn
category, or a sentence in the spec, would close it. The spec has about 454 B of headroom and
a new diagnostic moves `lint()` only for plans that write such a label.

**Gate:** decision recorded in this entry first; then the chosen text is pinned by a test and
`describe()`/`lint()` over the examples are byte-identical (verify that no example writes a
label on a drawn symbol). **Size:** S.

### U.5 · A parse error that drops a plan's only drawable statement adds a `W_EMPTY_PLAN` (narrowed) — `todo`

**Narrowed (AF0, re-checked against the code).** The rule-6 half is done by PR #790 (CO-1):
`id=` may follow the kind word of `furniture`, `door`, `window`, `outdoor` and `wall`
(`idAfterKind`, `src/clause-order.ts`; the wall calls it at `src/elements/wall.ts:54`), so both
forms the audit wrote now compile instead of failing. Probe, `arch compile --json` on
`wall exterior id=w1 thickness 200 { … }` with a room, a `door on w1 at 50% width 900` and
`furniture bed id=b1 at (500,500) size 1600x2000`: `ok: true`, no diagnostic, the door resolves on
`w1` and `describe().furniture` lists `b1`. What remains is the cascade, for any parse error and not
only rule 6. Probe, a plan whose only statement is `wall exterior id=w1 thick 200 { … }`: exit 2,
`E_PARSE Expected "thickness" but found "thick"` and then `W_EMPTY_PLAN Plan has no walls, rooms,
or furniture — nothing to draw`. With a room beside the same wall line, only the `E_PARSE` is
reported, because `checkPlanDrawable` (`src/ir/checks.ts`) counts what resolved and the room did.
The remaining gate is the cascade half of the gate below; the `fix`-is-the-reordered-line half no
longer applies, since the reordered line is now legal. The text below is the original entry.

**Observed (audit finding 12, Appendix B).** `wall exterior id=w1 …` gives
`E_PARSE Expected "thickness" but found "id"` plus a cascading `W_EMPTY_PLAN`. Spec rule 6 says
`id=` comes first and names exactly this form as an error. The audit's agent could correct it
only with that rule in context.

**Hypothesis.** The wall parser (`src/elements/wall.ts:45-47`) eats the category word and then
expects `thickness`; it never checks for a stray `id=`. The same shape exists for `furniture
bed id=b1`, which rule 6 also lists. A targeted message ("`id=` goes before the category:
`wall id=w1 exterior`") with a machine `fix` would close both. The `W_EMPTY_PLAN` that follows
is a second symptom: it says nothing the parse error did not.

**Gate:** both rule-6 forms return one `E_PARSE` whose `fix` is the reordered line under
`arch compile - --json`; the cascade `W_EMPTY_PLAN` is suppressed when a parse error already
explains it, or the entry says why not. **Size:** S.

### U.6 · `uses balcony` does not point to `outdoor balcony`: done by #850, waiting to be archived — `note`

**Observed (audit finding 12, Appendix B).** `room … uses balcony` returns an `E_PARSE` that
lists the valid uses and gives no hint toward `outdoor balcony`.

**Hypothesis.** The "Expected one or more room uses" message is built from `USE_KINDS` alone
(`src/elements/room.ts:140-143`). A small map of near-miss words (`balcony`, `terrace`,
`garden`) to the element that draws them would let the message name it.

**Gate:** `uses balcony` yields a message that contains `outdoor balcony`, pinned by test;
`arch compile --json` over the examples unchanged. **Size:** S.

### U.7 · Two bedrooms are both typed `MasterRoom` in Plan JSON — `todo`

**Decided 2026-11-06 (RM-D6, owner-approved):** a deterministic rename with a numeric suffix (`MasterRoom`, `MasterRoom_2`) and one warning that lists the renames, in the family of `W_IMPORT_DROPPED`. Carded in RM3.1 (`docs/plans/product-roadmap/cards.md`). The text below is the original question.

**Observed (audit finding 16).** Both bedrooms of the audit plan come out of the Plan JSON
export typed `MasterRoom`.

**Hypothesis.** `USE_TO_ROOM_TYPE` maps `bedroom` to `MasterRoom` and the mapping is
documented as many-to-one (`src/plan-json.ts:90-97`; the inverse at `:144-150` folds
`MasterRoom`, `ChildRoom`, `SecondRoom` and `GuestRoom` back to `bedroom`). The source has no
way to say which bedroom is the master, so a consumer that reads the type reads an invented
fact. Options: keep, and say so in the export's documentation; or take a name-based hint. A
name-based guess would be a heuristic in a deterministic export and the entry leans against it.

**Gate:** decision written here; if the export documents it, a test pins the sentence. If the
mapping changes, every Plan JSON round-trip test and `--from-json` over the corpus stays
identical on `describe()`. **Size:** S.

### U.8 · `compile --json` returns a summary far heavier than a compile needs — `todo`

**Observed (audit finding 14).** `compile --json` returns a 13.7 KB summary for a five-room
plan; `arch context` is 107 KB (about 27k tokens); `spec.llm.md` is 29.5 KB with grammar lines
up to about 5 KB each. (The stale "~50KB" figure for `context` is card A1, not this entry.)

**Hypothesis.** The compile envelope carries the whole-plan `describe()` result beside the
SVG (`src/cli/commands-render.ts:238-247` and `:303-312`), so an agent that only wants to know
whether the compile worked pays for every room. `describe --select` already exists
(`src/cli/commands-analyze.ts:240`), which suggests `compile --json` could omit the summary
unless asked. The envelope is read by tools and tests; changing its default is a contract
change and needs its own decision.

**Gate:** `compile --json` on the audit plan is measured before and after with `wc -c`, the
size is quoted, and every existing envelope test is updated deliberately. **Size:** S to M.

### U.9 · No room shows its clear, face-to-face size — `todo`

**Observed (audit, "What ArchLang lacks").** Dimension chains are axis, opening and overall; no
room is annotated with its internal size. Bedroom 1 is drawn 12.6 m² and is 3450 × 3350 clear.

**Hypothesis.** Card D1 adds the net area figure to `describe()` and the schedule; it does not
draw a clear width and depth on the plan. This entry is the drawing half, an opt-in dims form.
It is a drawing change, so it needs a byte-identity law and bounds that cover what it draws.

**Gate:** an opt-in form draws clear sizes for rect rooms; plans not using it are
byte-identical; `bounds()` and `drawCost` cover the text. **Size:** M. D1 has landed
(`net_area_m2`, `docs/adr/0027-net-internal-area.md`), so this is unblocked.

### U.10 · The legend has one wall swatch and no wall types — `todo`

**Observed (audit, "What ArchLang lacks").** The legend shows a single "poche" swatch. Exterior
and partition walls are not told apart, and there are no build-up notes.

**Hypothesis.** `wall <category>` already carries `exterior` or `interior` and a `material`
(`src/elements/wall.ts:25`), so the data exists; the legend code does not read it. The legend
generator was not located when filing; find it first. Adding a swatch per category used would
move every sheet SVG, so it is a drawing change under the byte-identity rule.

**Gate:** a plan with both wall categories lists both in the legend; `describe()` and `lint()`
over the corpus unchanged; moved SVG rows re-pinned with the reason. **Size:** S to M.

### U.11 · The scale bar is 0 to 1 m on a 10 m plan — `todo`

**Observed (audit, "What ArchLang lacks").** The scale bar on the audit's 10.0 × 6.5 m sheet
is only 0 to 1 m.

**Hypothesis.** The length is `niceBarLength(refDim * SCALEBAR_TARGET_F)` over
`NICE_LENGTHS = [500, 1000, 2000, 5000, …]` (`src/chrome-layout.ts:37,203`), so the target
fraction is what makes a 1 m bar on a plan this size. Whether 1 m is wrong or just short is a
taste call; the audit only noted it. Any change moves the sheet SVG for every plan with one.

**Gate:** decision first; then re-pinned SVG rows with the reason, no `describe()` or
`lint()` movement. **Size:** S.

### U.12 · `finish` adds no worktop run to a kitchen — `todo`

**Observed (audit, "What ArchLang lacks").** `finish` furnishes rooms but adds no kitchen
worktop run, so a kitchen sheet shows appliances with nothing between them.

**Hypothesis.** The furnish table has rows per use with `required` and `place: "wall"` items
(`src/furnish.ts:69-102`) but no continuous-run item; a run is a different shape of placement
from a single piece. ADR 0025 decision 2 (fill only empty rooms) still applies.

**Gate:** on a bare kitchen, `arch finish --dry-run --json` lists the run and the result is
lint-clean; byte-identity laws gain a row per example whose `finish` output moves. **Size:** M.

- U.13 · The DXF is geometry only, beyond units and layers — done → archived (lab)

### U.14 · No `arch diff` verb, though `diffPlans` is exported — `todo`

**Observed (engineering gap audit, row 26).** `diffPlans` is public (`src/index.ts:232`), and
neither the CLI nor the MCP server exposes it, so a user cannot see what an edit changed.

**Hypothesis.** The verb is a thin wrapper: read two sources, call `diffPlans`, print with
`--json`. It lives under `src/cli/`, where Node APIs are allowed.

**Gate:** `arch diff a.arch b.arch --json` prints the delta; a CLI test and the manifest
drift gate (`gen:all`, `check:drift`) stay green. **Size:** S.

### U.15 · No `arch doctor` — `todo`

**Observed (engineering gap audit, row 25).** Nothing reports the optional dependencies
(resvg, pdfkit), the CJK font, the installed version against npm latest, or the MCP shim
version. The audit's agent met `--install` guidance that a local `npm i` had already made moot.

**Hypothesis.** A read-only CLI verb. The network lookup of the latest version must be
optional and off by default so the verb works offline.

**Gate:** `arch doctor --json` reports each item on a clean install and on one without the
optional dependencies. **Size:** S.

### U.16 · `arch new` has one starter and cannot list templates — `todo`

**Observed (engineering gap audit, row 10).** `arch new` writes the single `STARTER` string
(`src/cli/commands-meta.ts:34`); there is no `--list` and no `--from <example>`.

**Hypothesis.** Templates can be the authored examples, copied at run time, so no new plan is
written by hand. The corpus holds mostly dwellings and museums; card D6 adds non-dwelling ones.

**Gate:** `arch new --list --json` lists names; `arch new --from <example>` writes a file that
compiles clean. **Size:** S.

### U.17 · No report says how many diagnostics carry a machine fix: done by #898, waiting to be archived — `note`

**Observed (engineering gap audit, row 24).** Every code in `ERROR_CATALOG` (`src/error-catalog.ts`) carries a
catalogue `fix` text; only a minority produce a span edit (a grep estimate, not a measurement). The catalogue
is the source of the code count, so no number is written here.
No test prints the coverage, so the gap is not a number.

**Hypothesis.** A test or script that walks the catalogue and the fix producers can print the
count. The estimate is the first thing to replace.

**Gate:** the script prints "N of M codes have a span edit" and a test fails if the count
drops. **Size:** S.

Residue: `scripts/fix-coverage.ts` counts raise sites that can attach a span edit; it does not
prove each fix is reachable on some input.

### U.18 · The playground PDF is raster — `todo`

**Observed (engineering gap audit, row 32).** The playground builds its PDF through jsPDF
(`playground/src/actions.ts`), while the CLI writes a vector PDF at true scale. Since 2026-11-01 a
plan with a sheet prints at its paper size, so its scale holds; the PDF is still a raster, which is
what remains of this card.

**Hypothesis.** The playground cannot load pdfkit; the core already produces the sheet SVG.
Whether a vector path is worth the bundle is open.

**Gate:** CI's `npm run e2e:playground` covers the chosen behaviour; the playground bundle size
before and after is quoted. **Size:** M.

### U.19 · A global install can fail on the `arch` alias bin where npm's prefix is `/usr` — `todo`

**Observed (red-team of card A1; read from npm's source, not run on such a host).** The package
installs two bins, `archlang` and `arch`. npm's `bin-links` (`lib/link-gently.js:55-87`) throws
`EEXIST` when the global bin directory already holds a non-symlink of the same name and `--force`
is off. Where npm's prefix is `/usr`, `/usr/bin/arch` (coreutils) is that file, so
`npm i -g @chanmeng666/archlang` can fail outright. Where the prefix is `/usr/local`, the alias
instead shadows coreutils `arch` for the user's other scripts. Both behaviours predate A1, which
added `archlang`; the docs now lead with `npx -y @chanmeng666/archlang`.

**Hypothesis.** Dropping the `arch` bin removes both, at the cost of breaking scripts that call
it; that is a 2.0 decision for the owner.

**Gate:** on a Linux host whose npm prefix is `/usr`, `npm i -g` of the packed tarball succeeds
and `archlang --version` prints the version. **Size:** S.

### U.20 · The MCP `describe` tool's description names both areas: done by #815, waiting to be archived — `note`

**Observed (card D1, out of its scope).** `describe()` now reports `rooms[].net_area_m2` and
`totals.net_floor_area_m2` beside the centreline `area_m2`
(`docs/adr/0027-net-internal-area.md`). The `describe` tool's description in
`packages/mcp/src/tools.ts` still lists rooms by "area" alone, so an agent reading the tool list
is not told which figure is the floor no wall stands on, or that it can be absent.

**Hypothesis.** One clause in the description: `area_m2` on wall centrelines, `net_area_m2`
the floor no wall stands on (absent when it cannot be computed exactly). Any `packages/mcp` change, prose included, publishes only with a version bump
in `packages/mcp/package.json` and both `server.json` `version` fields.

**Gate:** the tool description names both fields; the MCP lockstep and tool-text tests pass; the
version is bumped in all three places. **Size:** S.
**Done by #815, without the bump.** A hand bump on `main` pins the plugin
(`plugins/archlang/.claude-plugin/plugin.json`, via `gen:plugin`) to a shim version npm does not have
until a release publishes it, so plugin installs would fail to start the server in between. The
bump is the release's: `npm run release:pin` raises the shim version whenever the core range moves,
which every core release does, so the description reaches the stdio shim at the next release (the
hosted server has it on deploy).

### U.22 · `describe()` net-area budget: done by #742 and #771, waiting to be archived — `note`

**Observed (card D1 review).** The net-area measurement pairs a room's edges with the wall-band
curves near it, capped per room at `MAX_NET_CURVES` (`src/analyze/net-area.ts`), but nothing caps
rooms times that: 200 overlapping rooms each meeting 1,920 curves take about 4.2 s in
`describe()`, linear in rooms up to `MAX_ELEMENTS`. `compile()` charges the term to the drawing
budget only under `schedule rooms`; `describe()` has never had a budget (adjacency is already
quadratic in rooms). The hosted Worker's CPU cap bounds it in practice.

**Hypothesis.** Give `describe()` a work meter of its own, or charge the net-area pairs to a
per-plan total and omit `net_area_m2` past it, as a single room already omits past its cap.

**Gate:** the adversarial plan above returns within the budget, with net areas omitted rather
than late; the corpus `describe()` output does not move. **Size:** M.
**Done by PR #742** (PS0.15 / RM1.3b: one net-area meter per storey read, `MAX_NET_PLAN_WORK`,
`src/analyze/net-area-memo.ts`) and **PR #771** (RM1.3d: the takeoff's wall faces charged to the same
meter). The card's own adversary (200 overlapping rooms, each meeting 1,932 curves) is pinned in
`test/net-area-budget.test.ts`: `describe()` measures three rooms, closes the meter and omits the rest;
the corpus maxima are pinned there far inside the total. What the meter does not bound is open as
U.23. The entry is closed and waits to be archived to `archlang-lab` with `scripts/backlog-archive.mjs`.

### U.23 · The net-area meter is per storey read, so many storeys still make `describe()` slow — `todo`

**Observed (review of the U.22 close, 2026-11-16, `dist/cli.js describe --json` at 1.62.0).** The meter
of U.22 was first a per-plan total (`51e610b8`), then, in review, one meter per storey read
(`9e43b71c`; `src/analyze/net-area-memo.ts` module header). Nothing caps storeys times that total.
The plans below repeat the comb storey of `test/net-area-budget.test.ts`, with each storey shifted 1 mm
so the memo misses:

| Plan | Rooms measured | Wall time |
| --- | --- | --- |
| 1 storey × 4 combs | 2 of 4 | 0.8 s |
| 30 storeys × 2 combs | 60 of 60 | 9.9 s |
| 60 storeys × 2 combs | 120 of 120 | 20.4 s |
| 30 storeys × 2 combs, partitions removed (control) | 60 of 60 | 1.05 s |

No figure is omitted and no diagnostic is raised. `E_STEP_LIMIT` stops the plan somewhere between 60
and 100 storeys. The Worker's CPU cap still bounds the hosted tools.

**Hypothesis.** A plan-wide ceiling over the per-storey meters: give each read a share of a total, or
charge every storey to one plan meter and omit `net_area_m2` past it. Either must keep a storey's figures
independent of the order the storeys are read in.

**Gate:** the 60-storey plan above returns within the budget, with net areas omitted rather than late.
Each storey's figures do not depend on read order. The corpus `describe()` output does not move.
**Size:** M.

## Found downstream (2026-10-17)

ArchCanvas adopted net area and the issued-sheet statements and showed two gaps that only a
consumer sees. Each has an issue holding its measurements; the numbers below are the issue's own
and were not re-run when filing.

- H.1 · Lint messages still quote element ids (issue #187) — closed by PS2.22 and PS2.29 (PR #269); test/lint-messages-id-free.test.ts holds it; RM0.1, 2026-11-11 → archived (lab)

### H.2 · `finish()` advisory-code `accept` option (issue #189): superseded by #245, waiting to be archived — `note`

**Observed.** `finish()`'s never-worse law (`codesOf`, `src/finish.ts`) refuses any statement
that adds a diagnostic code, so where `dims auto all` raises `W_OPENING_NOT_DIMENSIONED` the sheet
stage degrades it to `dims auto overall`. ArchCanvas treats that code as advisory. Over 416 of
its recorded plans, 410 match `finish({ only: "sheet" })` on every sheet statement; the other 6
differ only in `dims auto all` (its own chooser) versus `dims auto overall` (upstream), each on a
courtyard or recessed face whose opening no facade chain passes. This is the one thing keeping
ArchCanvas on its own sheet chooser.

**Hypothesis.** An explicit allow-list, `FinishOptions.accept: [codes]`: an accepted code leaves
the before/after comparison under every profile, errors are never acceptable, and each statement
kept only because of `accept` gets a `FinishNote` naming the code. It defaults to empty. The
alternative, a lint profile with per-code severity, is larger and changes what `lint()` reports.

**Gate:** with `accept` omitted every `finish` law test and the corpus output are unchanged; a plan
whose `dims auto all` raises only `W_OPENING_NOT_DIMENSIONED` keeps `dims auto all` under
`accept: ["W_OPENING_NOT_DIMENSIONED"]` with a note naming the code; fixpoint holds with `accept` as
part of the input; an unknown or error code is a usage error. **Size:** S.
**Closed (2026-11-16).** PR #245 (PS2.12) took the drafting-layer codes, `W_OPENING_NOT_DIMENSIONED`
included, out of the never-worse comparison (`NOT_GATED_DRAFTING`, `src/furnish.ts`; ADR 0024's
amendment of 2026-10-24), so the sheet stage keeps `dims auto all` without any option
(`test/finish-sheet-degrade.test.ts`). Issue #189 was closed as completed on 2026-10-26. An `accept`
option for non-drafting codes would loosen the never-worse law, and needs a named caller and an owner decision.
The Gate's "note naming the code" was not built: `finish` reports nothing for a kept drafting code
(`unresolved` stays empty), and only a lint of the finished source shows it, as ADR 0024 says.

## Registry listings (opened 2026-10-10)

The state of each listing is the table in `docs/seo.md` § 8. These are what is still owed. The
2026-11-06/07 submissions and deferrals are in `docs/plans/geo-seo/handoff.md`.

Readings of the agent-reach E1/E2 metrics must discount the 2026-10-14 burst traffic (the owner's
own ~1,500 hosted-MCP requests; `docs/seo.md` section 8).

### O.1 · awesome-mcp-servers #14383 waits on its maintainer (BLOCKED on a third party) — `todo`

The merge condition, a Glama quality score of any grade, is met: on 2026-10-25 Glama's Dockerfile
settings were set to install `@chanmeng666/archlang-mcp` and run `archlang-mcp` behind `mcp-proxy`
(its auto-generated build had run the CLI, not the MCP server), release 0.1.0 built and was rated A.
The score badge is on the entry in #14383 and the maintainer was told there. On 2026-11-06 #14383
was rebased and is conflict-free. Left: the merge.

### O.3 · Whether the Claude plugin directory publishes later versions after approval is unobserved — `todo`

The plugin was submitted from `plugins/archlang/` on 2026-10-10. The directory offered a "push
updates" webhook, which was dismissed and is not set up. Observed in the portal on 2026-11-17, for
the review stage: the directory follows `main` without it and needs no resubmission. Every version
in its list is labelled "via scheduled check", new `main` commits appeared roughly every 7 hours,
and whether each commit between two checks gets its own version was not checked; "Check for
new commits" pressed right after the #921 merge did not surface `573b7fe`, the next scheduled check did. The
directory refused 1.63.0 at `2c9a8d7` that day for its local `npx` server and the Cursor rule (both
accepted only from Verified organizations); #921 moved the plugin to the hosted server and the
Cursor plugin to its own folder, and `573b7fe` passed the security scan with notes only and waits
for a reviewer (`docs/seo.md` section 8). Still unobserved: whether, once the listing is approved,
later versions are published without a new review or a resubmission; settle it at the first
release after approval. The listing reads `privacyPolicyUrl`; its manifest check calls the field
unrecognized, a note, not a finding. The OpenAI plugin directory
needs a privacy-policy page and a terms page too; both now exist, at https://archlang.uk/privacy and
https://archlang.uk/terms. The OpenAI submission's state is O.7 and `docs/seo.md` section 8.

- O.7 · The next shim release carries the MCP tool annotations and the OpenAI/Codex listing — done → archived (lab)

### O.8 · `OPENAI_CATEGORIES` is a retyped list (re-check on disagreement) — `todo`

`OPENAI_CATEGORIES` in `scripts/gen-agent-manifests.ts` is retyped from the `plugin_category_unknown`
row of https://developers.openai.com/plugins/deploy/submission-errors as read on 2026-10-15. When
`test/agent-manifests.test.ts` or the portal disagrees with it, re-check it against that page.

- O.10 · Two Dependabot major bumps wait for a decision — closed by RM0.1, 2026-11-11: #119, #121, #206-#208 are closed, vitest majors are ignored in the Dependabot config (EH0.10), and the one open major bump, #603, is ruled by RM-D19 → archived (lab)

### O.11 · The OpenAI listing shows the `compile` tool's old title (BLOCKED on a third party) — `todo`

`tools/list` on the hosted server returns the new title, but the portal and ChatGPT's tool card show
the definition cached at review ("Compile ArchLang → SVG, ASCII, Plan JSON or PNG"). On 2026-11-01,
after 1.50.1 was published, Rescan and Reconnect were disabled, and a new draft had not refreshed
it. Calls are unaffected. **Gate:** ChatGPT's card reads the new title; if it never does, ask OpenAI
how a published plugin refreshes its tool definitions.

### O.12 · Two OpenAI starter prompts name a `plan.arch` a new user does not have — `todo`

"Make the bedroom in plan.arch 1 m wider…" and "Put plan.arch on an A3 sheet…" passed in ChatGPT on
2026-11-01, but that account's earlier chats had saved a `plan.arch`, which ChatGPT found. What a
user with no such file sees is unverified. **Gate:** both prompts run in an account with no saved
plan. If they fail or dead-end, reword them or have the skills offer to start from a brief; either
needs a new ZIP and the owner's resubmission.

### O.13 · The OpenAI plugin is untested in Codex (owner: a ChatGPT-login Codex) — `todo`

`codex-cli` on the owner's machine is logged in with a paid API key and its marketplaces list no
ArchLang, so it was not run; a paid run was not approved. **Gate:** one starter prompt in a Codex
signed in with a ChatGPT account.

### O.14 · The MCP WAF rule may throttle OpenAI's shared egress (check once traffic exists) — `todo`

The "mcp abuse guard" rule (100 requests per 10 s per IP, then a 10 s block) counts per IP, and
ChatGPT's calls may share addresses. This is inferred, not observed. **Gate:** the owner reads the
rule's WAF records in the Cloudflare dashboard, which an agent cannot open.

### O.16 · Arcade, which absorbed Smithery, may be a new listing (assess first) — `todo`

Smithery was acquired by Arcade (arcade.dev) and closed its MCP proxy and publishing on 2026-10-31;
our Smithery listing is gone and the release path no longer builds for it (#468). Arcade's catalogue
lists MCP servers (Context7, Exa). Unknown: whether it takes third-party stdio servers, by what
submission, and on what terms. The 2026-11-06 channel research found no submission route (it
records the Smithery row as retired), and arcade.dev on 2026-11-07 names an "Arcade Registry" to
"share and discover all your MCP tools" without saying who can publish to it, so the question is
still open. **Gate:** a short note in `docs/seo.md` § 8 saying yes (with the steps)
or no (with the reason); a submission itself is the owner's.

### O.17 · The Docker MCP Catalog entry pins an archlang commit (at each release) — `todo`

`servers/archlang/server.yaml` in docker/mcp-registry#6704 (from the owner's fork
`ChanMeng666/mcp-registry`) builds `packages/mcp/Dockerfile` at a pinned `source.commit`, and the
Dockerfile installs the `@chanmeng666/archlang-mcp` version in `packages/mcp/package.json` at that
commit. **Gate:** after a release that moves the MCP package, a follow-up PR there moves the commit
(`.claude/commands/release-check.md`).

### O.18 · The awesome-openclaw-skills entry (#610) waits on its maintainers (BLOCKED on a third party) — `todo`

`VoltAgent/awesome-openclaw-skills` declines brand-new skills, so the entry for the ClawHub skill
(`docs/seo.md` § 8) is deferred; its draft is in the session archive. **Gate:** the skill shows
users on ClawHub, then the entry is filed.

## Visual-assets residue (from `docs/plans/visual-assets/handoff.md`, 2026-11-04)

### O.19 · `release.yml`'s `publish-arch-plan` publishes without testing what it packs — `todo`

**Observed.** The job builds the core, decides whether the version is on npm, and runs `npm publish -w packages/web-component` (whose `prepack` builds the package). It runs no test of the web component (`packages/web-component/test/`) and does not look at what the tarball will hold. Whatever CI proved on the release commit is the only evidence; a broken element or a file missing from the tarball would reach npm, and a published version cannot be taken back.

**Proposed gate.** Before the publish step, in the same job: run the web component's tests, and check the packed file list (`npm pack --dry-run --json -w packages/web-component`) against the files the package is meant to ship (`dist/`, the README, the LICENSE), failing the job on either. **Tier: high**, because it edits a workflow (`scripts/risk-tier.mjs`), so it needs the fresh-context review that tier asks for. **Size:** S.

### VA.1 · The bean bag reads stepped in 3D — `todo`

`bean_bag` is built from stacked rounded tiers, so its silhouette steps. A smoother profiled section
(`profile` in `src/mesh/t0.ts`) would read softer. **Gate:** `t0.test.ts` green; laneway pins unmoved.
**Carded as RM8.6** (`docs/plans/product-roadmap/cards.md`, stage D, not started on 2026-11-11).

### VA.2 · A balcony's railing is not built in 3D — `todo`

Product-roadmap RM8.3 (PR #701) builds the rest of this item: each of the nine `outdoor` kinds is a thin slab in a ledgered colour from the core's theme, each `fence` style has its posts (on the core's ticks), rails and pickets at a ledgered height, and the replay stands the building on a ground plane the viewer draws (a backdrop, not in the file). What is not built: the railing the core draws round a `balcony` (its `rail` sides); the 3D preview ledgers it as `outdoor-rail-omitted`.
**Gate:** a ledgered default height and profile, on the sides the core rails; pins move only with the reason recorded.

### VA.3 · A room with no `uses` keeps the neutral floor (decision: read the label?) — `decision`

`floorFinish` reads `uses` only; the label is deliberately not read. Decide whether a label should
ever pick a finish before building anything.

- VA.4 · `--theme` on the CLI — done by #695 → archived (lab)

### VA.5 · Shadows in the replay (measure first) — `todo`

Shadow maps cost +55% SwiftShader frame time when measured (V9) and were left out. Revisit only with
a cheaper technique (baked contact shadows) and a frame-time budget.
**Carded as RM8.8** (`docs/plans/product-roadmap/cards.md`, stage E; RM-D23 allows baked contact
shadows, approved by the owner 2026-11-11).

## Playground residue (public-surfaces cards P2 and P3, 2026-11-06)

### PG.1 · A room cannot be reached from the keyboard: done by #824, waiting to be archived — `note`

The hover tooltip and the room's facts card (`playground/src/interact.ts`, `room-card.ts`) open
from the pointer only: no room in the drawing takes the focus, so a keyboard or screen-reader user
cannot open a room's card at all. Once open, the card is reachable and Escape closes it. One way:
a focusable list of the rooms (the facts line, or a "Rooms" control) that opens the same card.
**Gate:** an e2e case opens a room's card from the keyboard alone; the card keeps its focus rules.

### PG.2 · The card and the tooltip pick a room by its shape: done by #822, waiting to be archived — `note`

`pickSmallestContaining` (`playground/src/interact.ts`) hit-tests describe()'s `bbox`, so on an L,
a trapezoid or a circle a point inside the box but outside the room picks that room (or a smaller
box around it), and its card opens. AGENTS.md: a derived position comes from the shape, never its
bounding box. The shape is in the summary (`floor_polygon`, `floor_circle`): test it, boundary
inclusive, and keep the smallest-room tie rule (`playground/test/interact.test.ts`). **Gate:**
unit cases on `hexagon-pavilion` (trapezoids, the rotunda) and `gallery-l`; the rectangle cases
unchanged.

- PG.3 · The facts line moves the drawing on the first compile — closed by MP5 (#565, the line is
  served) and PG-D6 (the stage's foot keeps its row); pinned by `boot.spec`'s first-compile stage-box case

## Website residue (Search Console fixes #640, #643, #655, 2026-11-10)

Left by the reviews of those PRs (review-cost cap). WS.1 and WS.2 fail only on input the docs do
not yet hold; WS.3 and WS.4 are true of the live site today.

### WS.1 · Four copies of the fence rule, none quite CommonMark: done by #825, waiting to be archived — `note`

`fenceStep` (`docs-site/link-rewrite.mjs`), the link scan in `test/docs-site-links.test.ts`,
`fences()` in `test/docs-fences.test.ts` (the live-fence gate) and `headingIds` in
`test/plan-constructs.test.ts` each implement the fence rule, and they differ: the first three
accept any leading whitespace (`^\s*`), so a line indented 4+ spaces (indented code) opens a
fence; none rejects a backtick in a backtick opener's info string, which CommonMark does. One way:
one exported rule (`^ {0,3}`, the info-string check) that the rewriter and all three tests import.
**Gate:** unit cases for an indented ```` ``` ```` and for ```` ``` a`b ````; the rewritten output of every
docs page unchanged; `docs-fences` still finds the same live fences.

### WS.2 · The rewriter's heading ids skip neither HTML comments nor `{#id}`: done by #825, waiting to be archived — `note`

`headingIds` in `docs-site/link-rewrite.mjs` treats a `#` line inside `<!-- … -->` as a heading
and slugs `## Title {#custom-id}` from its whole text, while the test's copy
(`test/plan-constructs.test.ts`) does both the way VitePress 1.6.4 does. So the rewriter registers
a phantom id (`title-custom-id`) that a GitHub-spelled link is then "confirmed" against, and
`test/docs-site-links.test.ts` reports a correct `#custom-id` link as having no heading (a false
red). The rewriter's heading pattern also allows no leading spaces where the test's allows
`^ {0,3}`. Port the test's rules (and share them, with WS.1). An attribute block holding more than
an id (`{#a .b}`) and an explicit id that repeats an earlier slug are the corner cases to pin.
**Gate:** unit cases for each; rewritten output over the docs unchanged.

**Done by #825.** The shared heading text keeps a code span verbatim (`` `<arch-plan>` ``), as
VitePress does; `test/docs-site-links.test.ts` checks every published page's heading ids against
VitePress's own markdown parser.

### WS.3 · Example-page `lastmod` misses some of what the page shows — `todo`

`PAGE_INPUTS` (`playground/scripts/gen-static.mjs`) dates an example page by its newest input, but
`playground/src/facts-line.js`, `playground/src/plan-label.js`,
`playground/scripts/lean-thumb.mjs` and the compiler itself (`src/`, through the drawing and facts
the page embeds) also change the page and are not listed. Adding `src/` would move every page's date at every core change, so decide first whether
the compiler belongs (the package version may be the better signal). **Gate:** the
`test/playground-examples-rows.test.ts` pin lists the new inputs.

### WS.4 · "What this plan uses" has no row for `keep`, `import` or `style`: done by #868, waiting to be archived — `note`

`playground/scripts/plan-constructs.mjs` detects constructs from `compile().ast`. No example page
uses `keep` or `import` yet, so a detector could not be checked against a real page, and
`docs/language-reference.md` has no heading for `style` to link to. Add each row when an example
uses it (and, for `style`, when the reference gains its section). **Gate:**
`test/plan-constructs.test.ts`'s anchor check covers the new rows.

**Done by #868** for `style`: the reference gained "Per-element styles — `style`" and the row
fires on `materials`. `keep` and `import` still have no row because no `EXAMPLE_ROWS` plan writes
them, and the test's every-row-fires guard rejects a detector no page checks; add each with the
first example page that uses it.

### WS.5 · `style wall { fill }` and `{ hatch }` are accepted and draw nothing: done by #896, waiting to be archived — `note`

The parser takes both keys with no diagnostic and stores `pocheBase` / `pocheHatch` in
`plan.styles.wall`, but `src/backends/svg.ts` builds every hatch pattern from the scene theme
(`THEME.pocheBase`, `THEME.pocheHatch`), never the per-kind styled theme (#868 review: on walls
with default, concrete and brick poché, `theme { pocheBase }` moved 3 fills and `style wall { fill }`
none). The comment at `src/theme.ts` that `style wall { hatch … }` moves that ink is false as
measured. Either draw them (a drawing change on plans that write them only) or warn
`W_UNKNOWN_STYLE_KEY`. **Gate:** a test that each accepted `style` key moves its own kind's ink and
nothing else; the reference's `style` section updated.

### WS.6 · The reference's `style` section is a hand-written copy of `STYLE_KEYS`: done by #888, waiting to be archived — `note`

#868 wrote "Per-element styles — `style`" in `docs/language-reference.md` by hand; its first draft
already disagreed with `spec.llm.md` on the styleless kinds (`opening`, `walls`). **Gate:** a test that
every kind/attribute pair the section names resolves through `resolveStyleKey` and that the kinds it
says take no `style` equal `KEYWORDS.element` minus the styled kinds.

### WS.7 · "What this plan uses" rows for `keep` and `import` — `deferred`

Left by WS.4 (#868): no `EXAMPLE_ROWS` plan writes `keep` or `import`, and the every-row-fires guard
rejects an unchecked detector. **Trigger:** the first example page whose plan writes either. **Gate:**
`test/plan-constructs.test.ts` lists the row on that page.
## Stairs in the 3D preview (public-surfaces card X3, 2026-11-06)

### ST.1 · Drawn treads against storey height: done by RM1.2a (#736), waiting to be archived — `note`

The plan draws each flight with `treadCount(run)` treads (`src/elements/vertical-glyphs.ts`, a
nominal 280 mm going, whatever the storey height), and the 3D preview climbs the storey on one
riser per drawn tread plus one per flight (`docs/plans/public-surfaces/3d.md` §3, a ruling: the 3D
keeps the plan's treads). So the drawing itself implies a riser height, and several examples imply
245–273 mm (two-storey 2700 / 11, townhouse and garden-house 3000 / 12, hillside-villa 3000 / 11),
above the 220 mm `stairMaxRiseMm` that `W_STAIR_TOO_STEEP` assumes. That rule checks a flight's
run against the shortest run that climbs the storey, and only where the plan authors a height; it
never compares the treads drawn with the storey height, so none of these plans warns (measured with
`arch lint --json`: no `W_STAIR_*` on any of the four; only two-storey authors a height, and its
2900 mm run passes the 2640 mm its 2700 mm storey needs at 220 mm). A lint (or a `describe()` fact first) would report the
riser the drawing implies, where the plan authors a height. **Gate:** the implied riser for each
example, hand-derived in the test; a plan with no `height` unchanged; the byte-identity law over
the corpus for `describe()` if a fact is added, and the lint's own corpus findings listed in the PR.
**Done by RM1.2a (PR #736, merge `80c1669e`).** `W_STAIR_RISER_TOO_HIGH` (`stairDrawnMaxRiseMm`, 220 mm)
reports the riser the drawn treads imply where the plan writes a `height`, and
`test/lint-stair-riser-too-high.test.ts` hand-derives it per example. The three examples with no `height`
are RM1.2h. #736 also redrew two-storey (3250 mm flight) and turning-stair, so the riser figures
above are as filed, not as on `main`.

### ST.2 · Winder walking line drawn as the credited arc: done by #821, waiting to be archived — `note`

PR #533 (winders on a quarter-turn landing, preview-and-remodel D46) credits a winder landing with
`min(n, floor(arc / going))` goings, where `arc` is the quarter arc of radius `width / 2` round the
inner corner (about 0.785 × width). The glyph (`src/elements/vertical-glyphs.ts`) still draws the
walking line across that landing as one straight chord (about 0.707 × width), so the drawing and
the lint read two different lengths. Lint never reads the drawing, so this is a drawing change:
draw the arc. It moves the SVG of plans that write `winders` only; `describe()` and `lint()` do
not move (the `block-stair-winders-byte-identity` law pins every plan without the clause). The
contributor offered to do it. **Gate:** the winders law green; the digest of every winders fixture
listed before and after in the PR; a plan without `winders` byte-identical.
**Done by #821.** The arc is drawn as a `<path>`. It is also a room-label obstacle where the chord
was not (`src/label-placement.ts` boxes an arc), so a label near a winder landing's inner corner can
place differently, and the drafting-layer `W_ANNOTATION_OVERLAP` with it. No shipped example writes
`winders`.

- ST.3 · `archlang-3d` builds a winder landing as a level landing — done by RM1.2g (#751) → archived (lab)

## 3D asset and surface residue (public-surfaces 3D cards X4b, X6, V2, 2026-11-06)

### 3D.1 · The asset check decodes the committed plan PNG: done by #826, waiting to be archived — `note`

`checkAssets` (`packages/archlang-3d/scripts/gen-3d-assets.ts`) compares a committed
`<name>.plan.png` only by SHA-256 against the manifest, then re-rasterises the source to the
recorded pixel hash; it never decodes the committed file. A PNG swapped together with its manifest
`sha256` passes. **Gate:** `pixelsHash(readFileSync(file))` must equal `plan.pixelsSha256`; a
planted swap fails `--check`.

### 3D.2 · No size budget for plan and poster PNGs: done by #828, waiting to be archived — `note`

The budget table caps WebP, MP4 and GLB only; `.plan.png` (92–245 KB today) and `.poster.png` have
none, so an A1 sheet could grow unchecked. **Gate:** a budget (for example 300 KB) enforced by the
generator and `--check`.

**Done by #828.** Caps: `BUDGET.planPng` 300 KB, `BUDGET.posterPng` 500 KB (poster PNGs were
150–362 KB).

### 3D.4 · Pitched roofs in the 3D preview (design first) — `todo`

A plan's roof becomes a hidden 150 mm flat slab (`roof-flat-150`); every surface says "no pitched
roofs yet". **Gate:** a design note (which roof forms the core states, how the replay shows them)
before any code; the laneway GLB pin moves only with its reason.

### 3D.5 · MP4 replays and byte ranges (measure) — `todo`

Cloudflare answers a `Range` request for `/3d/*.mp4` with 200, so Safari may not play the replays;
the sites fall back to the poster and an MP4 link. **Gate:** a real Safari check; if it fails,
serve the MP4s from a host that answers 206, or keep the fallback as the design.

## Catalogued footprints under every placement (card CO-2, PR #809, 2026-11-16)

Left by the review of that PR (review-cost cap). CO.1 is a hole that predates it; CO.2 records three
behaviours it documents rather than changes.

### CO.1 · Under `grid`, an `against` piece with no `size` snaps its footprint silently: done by #941, waiting to be archived — `note`

`furniture.resolve()` snaps a catalogued footprint with `ctx.snap` under every placement, but only
`at` and `in` report it: `against wall` and `against <room>.<edge>` raise neither `W_GRID_SNAPPED`
nor, when a side snaps to 0 (a `mirror`'s 50 mm depth on `grid 200`), `E_FURN_SIZE`. This was true
on `main` before CO-2, which left it alone because the fix moves corpus rows: noting the snap for
`against` too moved 31 of the 528 `.arch` surface digests (examples, first-contact plans,
`test/walls-from-rooms/two-bed.arch`), each by a new warning. One way: route `against` through the
same `noteDefaultSize` (`src/elements/furniture.ts`), and re-measure each moved row with its reason.
**Gate:** the example law of `test/footprint-any-placement.test.ts` and every other pinned row
re-measured with the moved fields named; a `grid` row for `against` in that test's `FORMS`.

**Ruled 2026-11-17 (RM-D56, product-roadmap README § 6.25): do it, under four conditions.** (1) Re-measure
a moved row only after proof: its SVG and `lint()` are unchanged, and `describe().diagnostics` and
`compile().diagnostics` differ only by the added `W_GRID_SNAPPED` entries; removing exactly those from
both, with that suite's own digest body, reproduces the old digest. Reasons go in each baseline header.
After (3), the 7 example rows in `test/footprint-any-placement.test.ts`'s BASELINE must reproduce their
existing pins unchanged (that header's "never a re-pin" stays true); (1) applies to the ~24 rows in other
suites. (2) Under `against`, a side snapped to 0 raises
`W_GRID_SNAPPED` naming that side, not `E_FURN_SIZE`, so a plan that compiles today still compiles: do not
route `against` through `noteDefaultSize` as is (it raises `E_FURN_SIZE`). The reference states the
difference from `at`/`in` and from a written `against` size (already `E_FURN_SIZE` when it zeroes), and the
twin-law header of `test/footprint-any-placement.test.ts` gains that exception; the new `FORMS` row
includes a zero side (`mirror` on `grid 200`). (3) The 7 affected examples (`garden-house`,
`hillside-villa`, `museum`, `remodel`, `two-bed`, `courtyard-family`, `showcase/garden-courtyard`) are
rewritten with explicit on-grid sizes so they stay warning-free (the #704 ruling), drawing bytes
unchanged. (4) `finish`'s furnish stage writes sizeless `against` pieces under a grid, which would now
gain warnings and be refused by its never-worse gate: if any pinned `finish` output would move, stop and
report, do not re-pin. Unpinned too: a gridded plan with an off-grid catalogued piece (1 of 413 in the
corpus, `test/main-entrance-fixtures/n7-back-hall.arch`) loses that piece from `finish`; name it in the PR.

### CO.2 · Three documented limits of a defaulted footprint — `declared`

(1) `facing <id>` settles after placement, so it never turns a default: a turn onto the footprint's
short side is `E_FACING_TRANSPOSED`, which names the `size` to write. (2) Under `in … anchor <corner>`
with both edges walled, the footprint stays at `rotate 0` and the existing derivation backs it onto
the edge that shape fits, the north or south wall for a deep piece such as a WC. (3) A polygon
room's refusal (`a WxH piece there leaves the floor`) quotes the size as resolved, which may be the
footprint laid along an edge, not the catalogue's along × depth. (1) and (2) are in
`docs/furniture.md` § three placement modes; change one only with its byte-identity rows.

## Live-eval baseline gap (RM-D51, 2026-11-16)

### EV.1 · Diagnose the gpt-5.5 intent gap against the July baseline: done by #837, waiting to be archived — `note`

At `2a210589` (after CO-1 and CO-2) gpt-5.5 scored valid 22/22/18 and intent 10/9/7 of 26 over
three runs (`eval/live-runs/2026-11-authorability-remeasure.md`), against the July baseline's valid
23 and intent 14 (one run, `eval/live-baseline.json`). RM-D51 keeps the July baseline. This card is
the offline diagnosis only, with no API spend: download the per-brief tables of the gpt-5.5 run
artifacts (`gh run download <id>` for runs 43727485853, 43727489713, 43727493307) and set them
against July's per-brief record. The only July per-brief table in the repo is
`eval/g1/baseline-run-29150982395.md`, the 2026-07-11 run (valid 25, intent 13); the artifacts of
the 2026-07-12 run behind the current baseline (valid 23, intent 14) are gone, so a per-brief
comparison with that run is not possible and the card says so.
**Re-baselining `eval/live-baseline.json` is not part of this card:** it needs an owner decision.
One option the owner may choose is the median of 3 runs; any new run is paid, owner-only
`eval:live`.
**Gate:** a per-brief table of which briefs lost intent and why, stated as observed (prompt change,
judge, model drift), with no claim beyond the data and none about loop gain.
Done by #837: the record is `eval/live-runs/2026-11-ev1-intent-gap.md`.

## Review residue of the promo-credit backlog run (PRs #837–#904, 2026-11-16/17)

Left by the reviews of those PRs (RR.1–RR.8 from #837–#850, RR.9–RR.18 from #855–#872, RR.19–RR.24 from #879–#904) (review-cost cap: two rounds, residue becomes cards).

### RR.1 · A door fix re-prints its statement with no step charge: done by #855, waiting to be archived — `note`

`emitOpening` (`src/fix-producers.ts`) deep-clones the door node and prints the whole statement for
every diagnostic that offers a door fix, with no `chargeSteps`. A looped door whose statement holds
a long dead expression branch took 59 s to compile on `main` (#848 review round 2), and no
`E_STEP_LIMIT` fired. #848 closed the same hole for `W_UNKNOWN_FURNITURE` by building the fix once
per parse node per `ResolveCtx` and charging its source length first (`categoryFix`,
`src/elements/furniture.ts`). **Gate:** the door path does the same; a test that a looped door
shares one fix object across its iterations.

### RR.2 · A re-printing fix drops interior comments and rounds long decimals — `todo`

The `W_UNKNOWN_FURNITURE` and door fixes replace the whole statement with `statementText()`, so a
comment between the clauses of a multi-line statement is lost, and `1000.12345` comes back as
`1000.123`. Both are in the `maybe-incorrect` tier and `docs/furniture.md` names the comment loss.
One way: edit only the kind word's span, derived at resolve time from the node's span and the
source tokens, without adding a parse-node field (that moved five parse digests in #848 round 1).
**Gate:** a multi-line statement with comments keeps them after `archlang fix --unsafe`.

### RR.3 · `E_LEVEL_MIX` lists the plan-level settings by hand: done by #857, waiting to be archived — `note`

After N.2 (#839) the remedy names `notes`, but a plan also allows `style`, `keep` and the
plan-level `section` mark beside a `level` (`src/parser.ts`, `src/ast.ts`), and it says "Only
settings (…)". Comments in `src/ast.ts` (near the level kind list) and `src/import.ts` carry the
same stale list. **Gate:** the remedy's list derives from the parser's allowed set, and a test fails
when a new plan-level form is not named.

### RR.4 · `E_DRAWING_LIMIT`'s remedy does not cover the notes cap: done by #859, waiting to be archived — `note`

N.5 (#840) names the NOTES cap under Cause, but Fix still says only "Draw fewer or shorter runs,
shrink the loop, or split the building". **Gate:** the remedy names shortening `notes`; the
catalogue outputs regenerated.

### RR.5 · The `uses` outdoor hint: `terrace` and a later word: done by #861, waiting to be archived — `note`

U.6 (#850) maps `terrace` to `patio`, but the language reference draws a terrace as `outdoor
balcony … label "Terrace"`; `yard → paving` has no source in the repo. The hint fires only when the
first word after `uses` is unknown, so `uses living balcony` and `uses Balcony` get none.
**Gate:** the mapping agrees with `docs/language-reference.md`, and a test covers a later word.

### RR.6 · Site-only link guard gaps: done by #863, waiting to be archived — `note`

After #838, `test/docs-site-links.test.ts` still skips same-page `#fragment` links on site-only
pages, does not check a fragment on a route with no markdown source (`/adr#x`), and does not read
raw `href=` or frontmatter links. Its header still describes only canonical copies, and a comment
calls `levels-a-multi-storey-building-v1-21` GitHub's spelling. Absolute site URLs in READMEs are
outside it: `packages/mcp/README.md` links
`/reference#keyboard-and-screen-reader-operability-annotate--accessible`, which is dead on the site.
**Gate:** that README link fixed, and a guard for absolute `archlang.uk` fragments in READMEs.

### RR.7 · EV.1 record wording: done by #864, waiting to be archived — `note`

In `eval/live-runs/2026-11-ev1-intent-gap.md`: "What does differ is the overall rate" compares 13/26
with 26/78 across the prompt drift the record says it does not compare (state the counts, claim no
significance); "so more furniture is now drawn" compares with the pre-CO-2 November runs, not July;
"carry no per-brief signal" should read "show no per-brief signal"; the `doors.ts` citation is
line 56, not 55. **Gate:** those four sentences corrected; no number changes.

### RR.8 · Four small follow-ups — `todo`

(1) An `/adr` smoke check on the deployed site (WS.5). (2) Whether `W_DOORWAY_BLOCKED` is too strict
for furniture that only grazes a door's swing (EV.1: all 19 physical-lint intent losses).
(3) The Rooms control overlaps the drawing at ≤ 900 px (PG.1 review). (4) An oracle for
`docs-site/index.md` frontmatter links. (5) Site-link guard holes left by RR.6 (#863 review): same-page
`#fragment` links on site-only pages, a fragment on a source-less route (`/adr#x`) and raw `href=`
links are unchecked; README scanning skips dot directories and walks the filesystem, not the tracked
tree; absolute `archlang.uk` fragments outside READMEs (`docs/overview.md`, `llms-install.md`) and
fragment-less dead routes are unchecked; a bare URL followed by punctuation, or an id rendered by a
component the page does not name, is wrongly refused; a malformed `%` escape throws. Each becomes
its own card once looked at.

### RR.9 · A door's free first fix build recurs per storey: done by #939, waiting to be archived — `note`

Left by RR.1 (#855 review round 2). `src/elements/door.ts` builds each fix (and the hinge-flipped
text) once per door node and key, but the first build per `ResolveCtx` is uncharged, and there is
one ctx per storey (two under `paper`). A component's door node is shared by every storey that
places it, so a component holding one long door statement, placed by a few hundred one-line
`level` statements, gets storeys × (4 fix kinds + flip) uncharged reprints of that statement:
quadratic in source bytes (probe: 36 KB, 18 s, 3.9 % of the step budget, no `E_STEP_LIMIT`; 36 s
with `paper`). Main does the same work uncharged, so #855 is not a regression. Suggested fix:
a fixed byte allowance per build, `1 + span` charged past it, for fixes and flip text alike;
corpus door statements are short, so no pinned payload should move. **Gate:** that input returns
`E_STEP_LIMIT` or compiles within budget in linear time; a test pins the free/charged boundary
(a component's second storey is charged); no pinned digest, work count or datum law moves.

Done (#939) in `src/elements/reprint.ts`, so doors, windows, openings and dims (whose swap text
#936 routed there) share it: a statement longer than `REPRINT_FREE_BYTES` (256) pays `1 + span` on
every build, on every storey; a shorter one keeps the free first build per ctx. The probe (a 30 KB
door, 300 levels) took 13.8 s, 27 s with `paper`; it now stops at `E_STEP_LIMIT` in 1.6 s.

### RR.10 · Window and opening fixes re-print their statement with no step charge: done by #880, waiting to be archived — `note`

RR.1 (#855) charged the door path; the review noted that window and opening fixes re-print their
statement the same way, uncharged, so a looped window or opening has the hole RR.1 closed for doors.
**Gate:** the shape of `test/doors.test.ts`'s `E_STEP_LIMIT` test, for a window and an opening;
no pinned step payload, work count or datum law moves (see RR.9 for the per-storey allowance).

Residue: windows and openings now share the door's first-build rule (`src/elements/reprint.ts`),
so RR.9's per-storey free build covers all three; RR.9 should fix it there.

### RR.11 · `E_LEVEL_MIX` follow-ups after RR.3: done by #890, waiting to be archived — `note`

From #857's review. The parser's own `E_LEVEL_MIX` message (`src/parser.ts`, around the level-mix
check) still omits `keep` and `section`; changing it moves `compile().diagnostics`, so it needs its
own byte-identity note. `docs/language-reference.md` (§ Levels) lists the plan-level settings by
hand without `height`, `site`, `notes` or `sheet text`. **Gate:** both read from the same list RR.3
derives, and a test fails when a plan-level form is added without them. #857's review also noted
guard gaps it did not itemise; re-read that guard when this is taken.

Residue: § import in `docs/language-reference.md` still lists a module's ignored settings by hand
(no `height`, `site`, `notes`, `style`, `sheet text`), unguarded.

### RR.12 · `E_DRAWING_LIMIT`'s remedy retypes its message clause: done by #892, waiting to be archived — `note`

From #859's review (RR.4): the remedy repeats a clause of the message by hand, so a later wording
change to one leaves the other stale. **Gate:** the remedy reads the clause from where the message
builds it, or a test pins that they agree.

Residue: only the NOTES clause is pinned, by a test (a dependency-free leaf constant imported by both
sides was not tried); the primitive-budget message paraphrases the remedy and stays unpinned.

### RR.13 · `uses` outdoor-hint follow-ups after RR.5: done by #881, waiting to be archived — `note`

From #861's reviews. (1) `usesOutdoorHint` (`src/parser.ts`) runs `this.toks.indexOf(t)` before it
knows the word is an outdoor word, so a file of many unknown statements formats its errors in
quadratic time (1.4 MB: 1.5 s before #861, 10.4 s after); the comma hint (#395) has the same
shape. Start the walk at `this.pos - 1` and test the word first, for both.
(2) The walk-back is token-adjacent, so an outdoor word on its own line after a room's `uses` list
is hinted "after `uses`"; require the same line, or give a neutral hint. (3) The strip's
`Expected "room"` text is retyped beside `eatKeyword`'s. (4) No test covers the identifier-type
guard on the strip path (`uses living "balcony"` in a strip). (5) The `terrace → balcony`,
`garden → lawn` mapping test is not tied to the language reference's outdoor examples. **Gate:** for
(1), both hints linear in tokens, pinned by a token-visit count, not time; a test per other item.

### RR.14 · Live-delta prompt-hash follow-ups after EV.3: done by #885, waiting to be archived — `note`

From #865's round-2 review. (1) `renderDelta` without hashes gained a trailing blank line, and the
"unchanged" test only checks a substring. (2) A corpus-only mismatch still says "Baseline prompt ≠
this run's prompt"; say "corpus change" when the prompt hash matched. (3) An unparsable
`eval/live-baseline.json` is reported as missing. (4) `promptHashes()` re-reads the files after the
paid calls; compute the hashes once, before the first call, from the strings actually sent (this
also fixes the CRLF wording); read and validate the baseline before the spend too, since a `null`
hash in it throws in `renderDelta` after the paid calls. (5) Three places
still say the delta section appears only with a baseline (`eval/README.md`, the `eval/run.ts`
header, `LIVE_HEADER`). (6) A vacuous `not.toContain` in the prompt-mismatch test. **Gate:** offline
tests only; no paid run.

Residue: none. The item (6) assertion tightens an existing check, so it passes before and after the fix.

### RR.15 · The EV.1 record predates RM-D52: done by #879, waiting to be archived — `note`

From #864's review: `eval/live-runs/2026-11-ev1-intent-gap.md` still says re-baselining needs an owner
decision and that RM-D51 keeps the July record; RM-D52 (#854) re-baselined. Add a dated pointer line,
as `2026-11-authorability-remeasure.md` has; change no number.

### RR.16 · Text-guard selection follow-ups after AG.1: done by #895, waiting to be archived — `note`

From #867's reviews. (1) `docs-flags` imports `src/manifest.ts`, which wakes it only through the
capped import list, so a flag rename with its regenerated docs can cut it. (2) The `skills/*/SKILL.md`
branch of the derivation is unpinned (no set-equality test, no non-literal skill). (3) No test
asserts that an ordinary `src/` change wakes none of the guards (mutants `startsWith("src/")` pass).
(4) A lone change to `src/elements/*.ts`, `src/lint/element-phrases.ts`, `src/lint/ruleset.ts` or
`src/diagnostics.ts` does not wake `lint-fix-texts`, though they compose fix text. (5)
`opaque-literal-guard` does not wake on `docs-site/public/<key>.txt` or on the error catalogue.
(6) A deleted or renamed page wakes nothing. (An `examples/` change crowding by-name guards out of
the 20-file cap is AG.2 (1).) **Gate:** one `test/gate-select.test.ts` case per item, each failing
on today's selection.

Closure note (#895). Items (2) and (3) were missing pins, not wrong selection, so their cases pass on
main's selection and fail on the mutants named above. Item (4) is read from the changed module's own
source (`composesFixText`: a `message:`/`fix:`/`hint:`/`hints:` property outside a comment line, or a first doc
comment mentioning "message" or "hint", in a module inside that test's transitive import closure), not a
list of paths.

Residue moved to AG.2.

### RR.17 · `fmt` follow-ups after M.21: done by #884, waiting to be archived — `note`

From #872's round-2 review. (1) Strings printed through `statementText` (room `label`, `text`, list
strings) are not pinned for a blank before a line break. (2) `src/doc.ts` strips trailing blanks
with `/[ \t]+$/` per line, quadratic in a blank run that does not end the line (60k spaces: about 3 s
after #872, 8.5 s before), and the playground runs it on user text; scan from the right. (3) `fmt` is not a fixed
point for a comment on a CR CR LF line: the lexer drops one trailing CR, so pass 1 prints `# note\r`
and pass 2 `# note`. **Gate:** the corpus `format` output stays byte-identical.

Closure note (#884). On CR CR LF input the lexer now drops every trailing CR from a comment, so the
while-to-for fix's `newText` and `repair().source` carry such a comment without the extra CRs: benign,
and the result is a `fmt` fixed point where main's was not. Residue, not fixed: a comment ending CR,
blank, LF (`# note\r \n`) is still not a fixed point, since pass 1 keeps the `\r` and strips the blank.

### RR.18 · A per-upload owner instruction is not in the eval-dataset rule: decided by RM-D55, waiting to be archived — `note`

`.claude/rules/eval-dataset.md` makes HF uploads owner-only and has no carve-out for an explicit
per-upload instruction from the owner, which is how the card upload of 2026-11-16 (HF `90914659`) was
done (`docs/plans/product-roadmap/handoff.md`). Whether to add that carve-out is the owner's call;
until then the rule stands as written.

**Decided** by RM-D55 (owner, 2026-11-16; product-roadmap README §6.24): uploads to the dataset repo
are the agent's, standing; replacing a published data file still needs an owner ruling first.

### RR.19 · `uses` hint follow-ups after RR.13 — `todo`

From #881's round-2 review. (1) `afterUses` (`src/parser.ts`) binary-searches the token list on every
comma or outdoor-word failure, so the hints are n log n, not linear; `test/room-uses.test.ts`'s
read-count slack is tuned to n = 400 and turns red above about 508 with no regression. Bound the
count by the number of failures, or look at the cursor first. (2) The off-cursor lookup is unpinned:
replacing the search with `lo = this.pos` passes every test; pin it with a plugin element that fails
on a consumed token after a `uses` list, or drop the search. (3) A missing-`size` error raised at an
outdoor word right after `uses` now carries the outdoor hint (true, untested), and the comments in
`src/parser.ts` and `src/elements/room.ts` still say only two errors carry it; `wall id=uses living
balcony …` gets a wrong outdoor hint because `afterUses` does not check that `uses` is a room clause
(the comma hint has had the same blind spot since #395). **Gate:** a test per item; no corpus output
moves.

### RR.20 · `fmt` is not a fixed point for a comment ending CR, blank, LF — `todo`

From #884's review (RR.17). `src/lexer.ts` stops trimming a comment's trailing CRs at a blank, then
`trimBlanksEnd` (`src/doc.ts`) strips the blank and exposes the CR: `# note\r \n` prints `# note\r`
on pass 1 and `# note` on pass 2. Strip the whole trailing `[ \t\r]*` run in one place. **Gate:** the
T5.2 idempotence law gains these line shapes; `arch fmt` over every tracked `.arch` stays
byte-identical.

### RR.21 · `style wall` ink follow-ups after WS.5 — `todo`

From #896's and #901's reviews. (1) The PDF export (`src/export/pdf.ts`) collapses every `url(#…)`
fill to the scene theme's `pocheBase` and ignores `HatchSpec.ink`, so `style wall { fill | hatch }`
shows in the SVG and PNG only (the reference says so). (2) `test/style-keys-draw.test.ts`'s
"nothing else" half cannot fail for untagged ink (walls, dims). (3) The mixed precedence case,
`CompileOptions.theme { pocheBase }` with `style wall { fill, hatch }`, is correct by probe and
unpinned. (4) `test/style-reference-section.test.ts` drops parenthesised asides over the whole
section, so a wrong attribute written inside a parenthesis passes. **Gate:** a test per item; plans
that write no `style wall` stay byte-identical.

### RR.22 · `fix-coverage` follow-ups after U.17 — `todo`

From #898's review. (1) `W_WHILE_DEPRECATED` is counted among the codes with a span edit, but its fix
exists only inside `arch fix` (`src/cli/commands-author.ts`), never from `compile()` or `lint()`: say
so in the script's output or count it separately. (2) The function-comparison fallback in
`scripts/fix-coverage.ts` credits every `x.code === "…"` literal in the enclosing function, so a
future site in a function that tests several codes would over-credit. **Gate:** a synthetic-tree case
for each.

### RR.23 · Live eval: the sent system string on a CRLF checkout — `todo`

From #885's late review (RR.14). On a CRLF working copy the live run sends the system prompt with CRLF
while `promptSha256` is LF-normalised, so two runs that sent different bytes record the same hash;
`eval/README.md` documents only the hash's LF normalisation, and the comment in `eval/run.ts`'s `main()` says "those same strings
are sent". Normalise once and send the normalised string, or reword the comment. Also, "exit 3 before
any spend" is pinned only by a source-text order check (`test/eval-stats.test.ts`); a run of `main()`
with a bad baseline would pin the exit code. **Gate:** offline tests only; no paid run.

### RR.24 · Two statement reprints outside `reprint` (observation): done by #936, waiting to be archived — `note`

From #880's review (RR.10). `furnitureCategoryFix` (`src/fix-producers.ts`, through `categoryFix` in
`src/elements/furniture.ts`, which charges every build) and the dim swap (`src/elements/dim.ts`)
re-print a whole statement without going through `src/elements/reprint.ts`. Card it as a defect only
if a looped or component-placed case reproduces an uncharged reprint; otherwise close it as checked.

Checked (#936). The furniture fix is charged on every build: a component placed by 200 levels used
4,840,000 steps, near `E_STEP_LIMIT`. The dim swap reproduced: it is printed for every dim and every
loop iteration, uncharged (5,000 iterations of a 96 KB statement: 8.6 s, 1.8 GB, 2.4 % of the step
budget). It now goes through `reprint` with a constant key, once per node per storey (156 ms, the
same steps, no pinned payload moved). Its per-storey build is RR.9's shape (1,000 levels × 96 KB: 2.1 s).

### RR.25 · Re-print work under the 256-byte allowance is still uncharged — `todo`

Left by RR.9 (#939 review). A statement of 256 bytes or fewer still builds its first fix of each kind
per storey free (`REPRINT_FREE_BYTES`, `src/elements/reprint.ts`). The probe: 550 hinged doors of 255
bytes (a dense dead branch) in a component placed by 550 levels, 163 KB of source. It took 26.3 s and
4,862,000 steps, with no `E_STEP_LIMIT` (only `E_DRAWING_LIMIT`). The same plan with `double` doors,
which have no flip text, took 3.95 s at the same steps. The flip text is built for every hinged door
whether or not a diagnostic fires. One way: build the flip text only when a diagnostic that carries
it fires, or charge it at a per-byte rate past a much smaller allowance. **Gate:** the probe returns
`E_STEP_LIMIT` or finishes within budget in a time proportional to its steps; no pinned payload
moves (the longest corpus statement is 96 bytes).

### EB.1 · The embed-path size check is a Playwright-only number: done by #937, waiting to be archived — `note`

The playground's embed path is a hard gzip ceiling (`embedPathBudget`,
`playground/e2e/startup-chunks.baseline.json`; RM-D57 keeps it at 351,000 B), measured only by
`playground/e2e/preview3d.spec.ts` in CI. P7's executors each rebuilt a scratch script to replicate
that walk from `embed.html` with `gzipSync` before pushing a compiler change (#881 was 21 B over,
#890 about 120 B over). One way: a repo script that builds the playground as CI does and prints the
embed path's per-chunk and total gzip bytes against the budget, which the spec and the script share.
**Gate:** the script's total equals the spec's on the same build; `docs/agents/commands.md` names it;
compiler-path PR briefs say to run it.

### EB.2 · Headroom on the playground's shared compiler chunk: done by #947, waiting to be archived — `note`

Both hard gzip ceilings over the playground's compiler chunk were nearly full on `main` aaae8d4c
(`playground/e2e/startup-chunks.baseline.json`): the embed path 350,995 B of 351,000 B and the
compiler path 364,738 B of 365,000 B, so every card that added compiler-chunk code failed CI. The
chunk carried `lint()` and most of its rules, which no compile, no embed and no view-mode render
runs. **Gate:** at least ~3,000 B gzip cut from the compiler chunk on both paths with no change of
behaviour (a corpus digest of SVG, `describe()`, `lint()` and diagnostics, before and after), the
budgets never raised (the cut came to ~49.5 KB on the embed and compiler paths and ~12.5 KB on the
first use's, so all three were re-taken down by their own rule, measured × 1.025 rounded up to the
thousand, to keep a glTF-Transform-sized leak tripping them: the coordinator's ruling and review),
and `growthBudget` still met.

## Review residue of the v3 night (PRs #936–#953, 2026-11-18)

Non-blocking findings of that night's fresh-context reviews (the review-loop cap: residue becomes cards).
Each names the PR whose review found it; NR.16 is a downstream application's request, not review residue.

### NR.1 · `finish` drops a gridded kitchen's fridge without a word (#941) — `todo`

Since CO.1, a sizeless `against` piece on a grid warns, so `finish`'s never-worse gate refuses it and the
piece is left out: `test/main-entrance-fixtures/n7-back-hall.arch` loses its 600 × 650 fridge on `grid 100`,
with `unresolved` unchanged and a clean `lint`. One way: furnish writes the snapped `size`, or adds an
`unresolved` note. **Gate:** that fixture's finished plan keeps a fridge or says why not.

### NR.2 · `W_GRID_SNAPPED`'s hint for a sizeless piece names no fix (#941) — `todo`

The non-zero branch reuses `noteSnap` (`src/ir/silent-accepts.ts`): "Write a multiple of 100 mm … to keep the
value as written", but nothing was written. The fix is `size 600x700` (the snapped catalogue size). Also: when
both sides snap to 0, the message names only the depth. **Gate:** the hint quotes a pasteable `size` clause.

### NR.3 · CO.1 leftovers (#941) — `todo`

`src/expr.ts` near line 698 still says the largest compiling example spends 5,294 steps (now 5,306), and the
CHANGELOG omits the starter's `tv_unit` → `bookshelf` change (CLI output).

### NR.4 · EV.8 leftovers (#943) — `todo`

(1) `spec.llm.md` does not state the same-line rule for a kind word after the clauses. (2) With bare-CR line
ends, a next-line kind word is still absorbed (the lexer counts only `\n`), untested. (3) The GBNF accepts a
kind word on the next line (pinned as an over-acceptance). (4) LSP completion and `complete` do not offer a
kind word after `width`. **Gate:** each item fixed with a test, or stated as a known limit in the reference.

### NR.5 · RM9.1 leftovers (#942) — `todo`

(1) `exactRoomMm2`'s guard rounds `Math.round(mm2) / 1e6` but `describe()` prints `r2(mm2 / 1e6)`: a circle of
radius 9007 mm prints 254.86 while the guard computes 254.87, so it falls back to printed figures and drags
the total with it; guard on `r2(mm2 / 1_000_000)`. (2) A rectangle's area is `w * h` in `describe()` but a
shoelace over its ring in `intent.ts`; on a 0.1 mm grid they can round to different whole mm², so the exact
area depends on `at` by 1 mm². (3) No test of an L-shaped or counter-clockwise `floor_polygon`. (4) A summary
without `floor_polygon` now throws; `?? []` would route it to the printed fallback. (5) `eval/fidelity.ts`
still judges areas on printed figures. **Gate:** each item fixed with a test, or stated as a limit.

### NR.6 · AF1 leftovers (#944) — `todo`

(1) `E_DUP_ID` raised inside an imported component's body carries no `file` or `instance` (its span points
past the importer's end). (2) The section, `walls from rooms` and `open between` same-file gates have no
cross-file test. (3) A future dataset regeneration would include `related` in its diagnostic rows (decide
before regenerating; RM-D47). **Gate:** (1) and (2) each with a test; (3) a stated decision.

### NR.7 · AF6 leftovers (#946) — `todo`

(1) `repair` and every fix producer still print an untouched literal with more than three decimals at 0.001
when they rewrite its statement. (2) The keep texts (`src/keep.ts`, `src/impact.ts`) say "as `arch fmt` prints
it" but use the 3-decimal printer. (3) The playground's Format button says "Already formatted" on a plan it
refused. **Gate:** each item fixed with a test, or stated as a limit at its site.

### NR.8 · A plan saved with a byte-order mark does not parse (#946) — `todo`

`validate` on a BOM-prefixed plan gives `E_PARSE: Unexpected character "\uFEFF"` (seen in the MCP hash-parity
test). Editors on Windows write one; an agent reading such a file gets a parse error on line 1. One way: the
lexer skips a leading U+FEFF (spans stay byte offsets of the original). **Gate:** a BOM plan compiles to the
same SVG as the plan without it.

### NR.9 · Budget-record leftovers (#947) — `todo`

(1) `compilerPathBudgetWhy` still says "under firstUsePathBudget, which stands", false since #947 re-took it
down. (2) `growthBudget` (ceiling 458,980 B over a 438,980 B baseline) guards nothing since RM0.7 (the compiler
path, 315,282 B, is ~124 KB under the baseline): re-baseline it by its rule or retire it. (3) `docs/agents/iron-laws.md`'s RM-D57 line could point at
`npm run size:embed` (#937 review). **Gate:** (1) and (2) fixed in the baseline file; (3) the owner's call.

### NR.10 · Moving the `E_INTENT_*` rows out of the compiler chunk's fix table (#948): done by #976, waiting to be archived — `note`

Done by #976: the 13 rows are generated into `src/error-catalog-fixes-intent.ts`. `compile()`'s error card reads the compile table only, and `diagnosticToJson` and the public `renderErrorSvg` read both (`src/any-catalog-fix.ts`). The `test/explain.test.ts` pin now proves the two tables are disjoint and together every catalogue code. The compiler chunk is 1,052 B smaller. The first use gained nothing from it: `diagnosticToJson` is on that path and carries the rows there.

Twelve today (thirteen once #948 lands), they are never compile diagnostics; dropping them from `src/error-catalog-fixes.ts`'s compile-path copy
saves about 633 B gzip. Needs the `test/explain.test.ts` pin (its keys equal every catalogue code) reworked.
Only worth doing when headroom is short again.

### NR.11 · Test narrative that will rot (#936) — `todo`

`test/dim-swap-reprint.test.ts`'s header quotes wall-clock and RSS figures, and `src/elements/dim.ts` cites
`(backlog RR.24)`, which will be archived. Replace with what the test pins. **Gate:** no figure or backlog id left in either.

### NR.12 · The primary checkout's dependencies lag `main` (night of 2026-11-18): done by #955, waiting to be archived — `note`

Worktrees junction `node_modules` to the primary checkout, whose copy had `@modelcontextprotocol/ext-apps`
1.7.5 (main pins 2.1.0), so the mcp-worker typecheck failed locally. Separately, the root `vite` is 6 by main's
own override (`package.json`) while the playground needs 8, so `npm run size:embed` fails in a worktree unless
`playground/node_modules` is junctioned too. Both were proven by CI only. One way: `npm ci` in the primary when
no peer session uses it, and a line in `docs/agents/orchestration.md` about the `playground/node_modules`
junction. **Gate:** a fresh worktree runs `check:quick` and `size:embed` with the documented junctions.

Done: `npm ci` ran in the primary during the 1.64.0 release (ext-apps 2.1.0, playground vite 8.3.5); `orchestration.md` and `gotchas.md` name the `playground/node_modules` junction (#955). Gate evidence: three fresh worktrees (EB.2 #947, RM9.3 #948, AF3 #951) ran `check:quick` and `size:embed` with those junctions on 2026-11-18.

### NR.13 · RM9.2 leftovers (#950) — `todo`

(1) The 3-storey caption test has no doors and no entrance on levels 2 and 3, so a door or entrance swap
between those two would pass. (2) A level name is embedded verbatim, so a name containing `"`, `;` or `(`
blurs the clause (the plan name does the same today). (3) `archlang-3d`'s info strip sums storey areas
itself; it could read `totals.floor_area_all_levels_m2`. (4) Public `toScene(levelIr, { accessible: true })`
still captions one storey. **Gate:** each fixed with a test, or stated as a limit at its site.

### NR.14 · RM9.3 leftovers (#948) — `todo`

(1) The property test in `test/intent-infeasible.test.ts` is vacuous for the soundness bound: at its seed
no passing plan has demand above the ceiling, so only the deterministic repro bites; generate borderline
cases on purpose. (2) `violationStage` is not exported, so a library caller using
`predicateStage(v.predicate)` still gets `rooms` for `E_INTENT_INFEASIBLE`. (3) A self-contradicting
count (`rooms: 2` while `roomsInclude` needs 3) is not reported as infeasible. **Gate:** each with a test.

### NR.15 · AF3 leftovers (#951) — `todo`

(1) A dropped wall (`wallsShort`, `src/ir.ts`) silences independent errors on surviving walls
(`E_ATTACH_WALL_REF`, `E_ATTACH_POS_RANGE`, `E_WINDOW_WIDTH`) until the root error is fixed. (2) The
POISON-site guard regex in `test/error-value-law.test.ts` misses `= POISON` and `=> POISON` forms (no such
site today). **Gate:** (1) those errors reported beside the root, with a test; (2) the regex widened.

### NR.16 · Room words only in English (downstream ask, 2026-11-18): classifier half done by #973; concept-table half is M.20a — `todo`

A downstream application reports that brief-check concept matching and the label classifier know only
English room words: Spanish and Portuguese labels ("Dormitorio", "Baño", "Cocina", "Quarto", "Banheiro",
"Lavandería", "Despensa", "Banheiro da suíte") classify as nothing, so gating room checks fail on rooms
that exist. About one in five of its recent briefs is in Spanish or Portuguese. Two ways: (a) a small,
accent-insensitive es/pt vocabulary in the concept table and the label classifier; (b) state that `uses`
tags and concepts are the language-neutral channel, never label words, with a lint when a room has no
`uses`. Until decided, the downstream app writes `uses` on every room. **Gate:** a decision recorded,
then the chosen form with a test per language. Decided (a) by RM-D68 (product-roadmap §6.31). #973
built the use-classifier half (`test/vocabulary-es-pt.test.ts`), through which the concepts that
carry a room kind or a `room_type` are met. The concept-table half is not built: it changes the
eval's table, so it needs an owner-approved `SYNONYMS_VERSION` bump, and it is M.20a.

## Review residue of the v3 stage-1/2 session (PRs #972–#993, 2026-11-19…20 UTC)

Non-blocking findings of that session's reviews and the PRs' own residue lists (the review-loop cap:
residue becomes cards). Each names its PR. Already carded elsewhere, so not repeated: M.20a (#973's
concept half), U.2a and U.5 (#983), RR.22 (2) (#979's code-comparison over-credit), NR.9 (3) (#976's
iron-laws budget line). SR.14 is the record of the CV13 split (#996, #993), SR.18 and SR.19 come from #993's review and SR.20 from its residue. Dates in this section are UTC.

### SR.1 · NR.16 classifier leftovers (#973) — `todo`

(1) No es/pt outdoor words for `namesOpenAir` (its reading looks for the head noun last), and
`NON_RESIDENTIAL_VOCABULARY` stays English. (2) A label mixing English and es/pt words ("Hall de
entrada") can classify differently from before (no tracked plan has one). (3) "quarto de X" phrases
outside the guard read as a bedroom. **Gate:** each fixed with a test, or stated as a limit in
`docs/intent.md`.

### SR.2 · AF5 leftovers (#974) — `todo`

(1) The playground's diagnostics panel shows `cause` and `example` but not `fixed`
(`playground/src/diagnostics-panel.ts`). (2) `llms.txt`'s MCP tool list names nine tools; the
server registers twelve (`finish`, `explain` and `link` are missing; `packages/mcp/src/tools.ts`).
An agent cannot edit it as is: `llms.txt` is listed in `.claude/hooks/generated-artifacts.json`
(`gen:doors` owns one block of it), so the hook rule `generated-edit` refuses any Edit/Write of the
file, the hand-written tool list included; the `partial` list there is not read by the hook. The
fix needs `ARCHLANG_ALLOW_GENERATED_EDIT=1` in the shell that starts Claude Code, or an allow-list
entry (a hook change) for the hand-written part of a partial artifact.
(3) `E_IMPORT_NOT_FOUND` has no pair (it needs a World-serving harness); the 67 excused examples
have none either. **Gate:** (1) and (2) fixed, (2) with a guard that reads the registered names;
(3) a stated decision.

### SR.3 · RM9.4 leftovers (#975) — `todo`

(1) Chains still unlinked: a room whose ring is refused, a `wall … between|around` that refuses (its
id is "unplaced"), a step-limit stop; `W_ROOM_OVERLAP` to the `E_WALL_BETWEEN_NOT_ADJACENT` of a
door between the pair; `wall … between|around`'s `E_ROOMS_OVERLAP` to the openings on the edge it
leaves unwalled. (2) One `walls from rooms` refusing with two codes moves only the first code's
diagnostics to the front. (3) A difference of two noisy values keeps its error
(`12*FT - (12*FT - 3*FT/10)` prints `91.4400000000001`). (4) A fix's `newText` built from source text
(`src/datum.ts`'s `head ${wallHeight}`) does not go through `fmtSource`. **Gate:** each linked or fixed with
a test, or stated as a limit at its site.

### SR.4 · 3.18 leftovers (#976) — `todo`

(1) On a phone's Code view the status flash ("… did not load", "Preparing DXF…") may not be
visible. (2) Edit mode loads the 29,638 B press chunk on entry, because `applyFixes` shares a dist
chunk with `finish`; a build entry of its own would split them. (3) No e2e for an aborted
press-core fetch (the loader's reset and retry are unit-tested). **Gate:** (1) an e2e on a phone
viewport; (2) edit mode's bytes measured with `npm run size:embed`, no budget raised.

### SR.5 · AF2 leftovers (#978) — `todo`

(1) A four-letter transposition is not caught (a swap counts as two edits, over a four-letter
word's limit of 1). (2) A closed list is not a grammar: `room … widt 900` gets the machine fix
`width`, and the recompile reports that a room takes no `width`. (3) A relational typo inside an
imported module is fixed by hand only (`arch fix` refuses a fix whose `file` is another module).
(4) `rigth-of` lexes as three tokens, so a misspelt hyphenated direction gets no fix. (5) Other
unknown-id sites hint through `closest()` with no word-level fix: `wall between|around`,
`<room>.<edge>` datums, `E_UNKNOWN_REF`, `E_UNKNOWN_COMPONENT`. **Gate:** each with a test; (5)
pins the failing plans it moves. (6) An enum value at a statement start (`living` on its own line)
is not excluded as a language word: `KEYWORDS.enum` stays out of the compiler chunk for size; it
matters only if such a word is one slip from a statement keyword (#978's residue). **Gate** for (6):
a test, or a stated limit.

### SR.6 · AF8 leftovers (#979) — `todo`

(1) The fixable-codes source check is blind to helper spreads, `Object.assign`, spread parameters,
partial delegation and a ternary that credits a code; the output sweep is the backstop. (2) `arch explain`
and MCP `explain` could say whether `fix` resolves a code, and at which tier, from the same
table. (3) `test/fix-coverage.test.ts`'s `WITH_EDIT_FLOOR` duplicates the declared code set; it
could read `FIX_PRODUCERS`. **Gate:** (1) each form caught by a planted case, or stated in the
checker's header.

### SR.7 · RM9.0 coverage-note leftovers (#980) — `todo`

Its §5 (`docs/plans/product-roadmap/design/rm9.0-coverage-classes.md`): (1) multi-storey messages
name the storey twice ("in the hall on level 0 on level 0", `W_STAIR_TOO_STEEP`,
`W_STAIR_NO_LANDING`, `W_STAIR_RISER_TOO_HIGH`, `W_STAIR_SIDE_ENTRY`); (2) `spec.llm.md` does not
say `anchor` never turns a `sofa` (PS2.32's second half); (3) `anchor … flush` turns a
`reception_desk` the wrong way (PS2.43); (4) a wall that `open between` removed whole still gets a
thickness figure; (5) a corner `anchor`'s `inset` pulls in from both edges; (6) a tool fact of the
audit was already false on 1.60.0: it recorded `table` as not in the catalogue, but `table` has
been there since 2026-08-26 (CV13), so RM1.1b's auditors must not record it so. **Gate:** (1) and
(4) fixed with a test (a drawing change for (4): byte identity per RM-D56); (2), (3), (5) a fix or
a stated limit; (6) the RM1.1b audit brief says it.

### SR.8 · `check:quick` stops on an excluded generated file (#981) — `todo`

When the changed files are only biome-excluded ones (`src/context-size.ts`), `check:quick` runs
`biome (1 files)`, biome says "No files were processed in the specified paths", and the gate stops
before tsc, drift and vitest. Same class as RM0.11 (2) (a lockfile-only change). The fix: hand
biome only paths its config does not exclude, skip it when none are left, and quote the path
arguments. **Gate:** a test of the selection; a change touching only that file runs the later
steps.

### SR.9 · TR12 leftovers (#985) — `todo`

`npm run digest:preview`: (1) its selection is blind to pins reached by a dynamic import, a
concatenated path, a `.mjs` file or a file outside the tree; (2) a file whose tests are all skipped
reads as green; (3) a `process.exit(0)` inside a test is silent at `--jobs 1`; (4) the shared
module registry makes the report depend on `--jobs`; (5) its matcher diverges from vitest's in
places; (6) the two `git ls-files` premise tests fail inside a `git archive` tree. Not done: (b),
a CI job that runs the digest files first. (7) #985 leaves to the coordinator whether executor
briefs should ask for `npm run check:quick -- --digests` before the first push of a drawing change.
**Gate:** (1)–(4) each with a planted case; (7) a decision written into the brief guidance
(`docs/agents/orchestration.md`) or declined with its reason.

### SR.10 · AF4 leftovers (#987) — `todo`

(1) The anchor respell fix across a hyphen leaves the plan broken. (2) Sheet-text suggestions past
the first 16 are prose only. (3) At a missing clause only the first `expected` entry clears the
error. (4) The contextual starts (`sheet text`, `section A (`) are not in the plan-level list. (5)
The nine count or semantic `E_PARSE` sites and the lexer's carry no `expected`. (6) The prose
`closest()` hints (schedule, site field, sheet text key, outdoor kind, look direction) could move
onto the AF2 producer. The catalogue's `E_PARSE` fix text naming `expected` moves every `E_PARSE`
JSON `fix`: an owner call. **Gate:** (1) and (3) fixed with a test; the rest fixed or stated.

### SR.11 · RM9.11 leftovers (#988) — `todo`

(1) A tied snap ignores a door's approach and walls at the destination. (2) The free-destination key
reads live positions, so the answer depends on the order pieces are repaired. (3) A moved `facing`
piece can break its own `facing` (pre-existing). (4) Ties in the doorway, swing and stair pushes
are reported, not chosen (no wall id to order by). (5) A wrong-size fixture ("swap W and H") is not
changed. (6) "Test gaps": the coordinator's final review of #988 lists them as residue without
saying which; read them from #988's round-2 red-team report before carding. **Gate:** (1)–(3) each
with a test; (4) and (5) a ruling (new policy; ADR 0006 addendum); (6) its content recorded here or
carded.

### SR.12 · RM9.10 leftovers (#990) — `todo`

(1) A door into thin air on a storey stacked over an identical one is not reported (the language
states no ground level; a ground datum is a language change). (2) A curved lower exterior ring is
not read as a footprint. (3) `W_EXIT_APPROACH_BLOCKED`, `W_ENTRANCE_INTO_PRIVATE` and the
circulation walk still treat a door that is no way in as a door to the outside. (4) `W_NO_ENTRANCE`
stands down on a storey with any exterior door, including one onto a balcony only. (5)
`validateIntent` `reachable` reads the lowest storey's entrance (a basement plan fails), and its
pass wording counts the lowest storey only. (6) `spec.llm.md` says nothing about doors onto roofs.
(7) The held-out pair for `W_EXTERIOR_DOOR_ONTO_ROOF` is owed in private `archlang-lab`. M.4's other
items are untouched. **Gate:** (2)–(5) each with a test; (1) a language card; (6) within spec
headroom.

### SR.13 · AF9 phase A leftovers (#992) — `todo`

(1) A fix title does not say "moves every instance" for a span a component's instances or a `for`
body share. (2) MCP `fix` and L1 calling `rankFixes` is its own card, SR.17. (3) The nib move
ignores sibling openings and fixtures: in the final full fuzz (124 plans, 3,655 shifted cases) 11 of 188 fixes leave a
warning, all `E_OPENING_NIB` moves (`W_OPENING_OVERLAP` 6, `W_HOB_UNDER_WINDOW` 3,
`W_FURNITURE_OVER_WINDOW` 1, a blocked swing and doorway 1); no error and 0 hard-property failures.
(4) Slanted meeting walls: their footprint on the host is read as `standingJunctionSpans` reads it,
not probed further (round-2 red team). (5) #992's body lists "N2 (red team, round 1)" as residue
but does not state what N2 is; read it from the round-1 review before carding it. **Gate:** (1),
(3), (4) each with a test; (5) its content recorded here or carded.

### SR.14 · RM9.6 CV13 split by RM-D73: done by #996 and #993, waiting to be archived — `note`

`W_TABLE_NO_SEAT` fired on nine shipped examples; adding their chairs moved pinned rows and assets.
#996 measured 349 moved digest rows in 31 files (swap-back: 349 of 349 give `main`'s value), plus
snapshots, PNGs and 3D pins. Done in two PRs, each after two red-team rounds: (1) #996, the
examples-only drawing-change PR (merge `e4d36045`, 2026-11-21 UTC); (2) #993, the rule (merge
`f48633ff`), whose rows are only the rule's. CV08 and CV14 follow the same split. Of the residue
first listed here: the held-out pair exists (private `archlang-lab` `3ef34b4`; re-linted on #993's
head, 1 and 0 reports); the `table` labelled "Island" in `docs/gallery/family-of-four` is now
declined by the label rule (#993 red team 1, m6); and the gallery plans are accepted output, not
edited by hand (#993's residue: 6 reports in 6 plans). The live residue is SR.20.

### SR.15 · A wrapped room label loses its space in the SVG text (downstream report, 2026-11-20): done by #1010, waiting to be archived — `note`

Done by #1010: the spaces a break removed ride between a wrapped name's `<tspan>` lines in a `<tspan font-size="0" xml:space="preserve">` each (`lineGaps`, `src/text-layout.ts`), so the `<text>`'s content is the label (what a search, a copy or a schedule check reads; a drawn name is `aria-hidden` under `accessible`, so this is not a screen-reader fix); a visible space would shift the anchored line by half a space (measured in Chrome and resvg), the zero-size one moves no glyph (PNG and Chrome screenshots identical). The 201 moved digest rows and 33 K1 rows are SVG only: stripping the separators reproduces every old row. Residue: `arch review`'s two `dx` tspans (`src/cli/review.ts`) still read with no space (SR.23); `svgTexts` never reads a wrapped name's first line (SR.24). The card text below is kept for the record.

A downstream application reads "EntranceHall" from a production drawing whose schedule says
"Entrance Hall". Repro (MCP `compile`, 2026-11-20): a 1200 × 2400 room labelled "Entrance Hall"
next to a 4000 × 2400 one draws `<text …><tspan …>Entrance</tspan><tspan …>Hall</tspan></text>`, so
the element's text content is "EntranceHall"; at 1800 wide the label stays on one line. A reader of
the SVG text (a screen reader, search, the downstream schedule check) gets one word. **Gate:** a
wrapped label's text content equals the label; a drawing change, so byte identity per RM-D56 over
every plan with a wrapped label.

### SR.16 · AF7 leftovers (#977) — `todo`

(1) `E_ROOMS_OVERLAP` gets no related spans: the tiling's `TileRoom` carries no room spans. (2)
`stacked` keeps get no notes (their targets are per storey). (3) `W_ROOM_OVERLAP` raised for a room
of an imported body carries no `Diagnostic.file` (the gap AF1 noted for `E_DUP_ID`, NR.6 (1)); a
`RelatedSpan.file` would let a note point into a module. (4) The sweep cannot see plans built by
functions inside test files or helpers; CI's full suite covers them. **Gate:** (1)–(3) each with a
test; any moved pin under RM-D69's four conditions as ruled for #977
(`docs/plans/product-roadmap/README.md` §6.32): "every row is proven strip==old by a committed
check; each touched table carries a header note; SVG, `lint()`, steps and parse stay unmoved; no
other digest is touched."

### SR.17 · MCP `fix` and L1 take the ranked fix (#992, RM-D70 Q3): done by #1008, waiting to be archived — `note`

Done by #1008: MCP `fix` (`packages/mcp/src/tools.ts`, which the hosted Worker registers too) and L1
(`eval/l1.ts`, through a pure `l1Fixes`) take `rankFixes(d.fixes)[0]` per diagnostic, as `arch fix`
does. A door written 25 mm past a meeting wall gets `E_OPENING_NIB` with `at 2050 from start`, then
`at 950 from start` (nearer first); `rankFixes` puts `950` first, and MCP `fix` with `unsafe:true`
now applies `950` with nothing skipped, as `arch fix --unsafe` does (`packages/mcp/test/tools.test.ts`
(v)); `test/rank-fixes.test.ts` holds L1's pick. `l1Pipeline` is unchanged over `eval/faults`,
`eval/goldens` and `examples/*.arch` (69 of 69). `E_OPENING_DATUM`'s `from start|end` pair moves too:
MCP `fix` with `unsafe:true` now writes `end`, as `arch fix --unsafe` does, where it wrote `start`.
Residue: `rankFixes`' edit-magnitude term picks the fewer-digit one of AF9's two moves, nearer or
farther (here `950`, 575 mm away, over `2050`, 525 mm away): SR.21. `dataset/trajectory.ts` still hands
every alternative to `applyFixes`: SR.22. The card text below is kept for the record.

AF9 is the first producer with several alternatives on one diagnostic. `arch fix` takes the top of
`rankFixes` (`src/fix-apply.ts`) and the LSP lists the alternatives in its order, but MCP `fix` and L1
apply them in array order without it (`packages/mcp/src/tools.ts`, `eval/l1.ts`;
`docs/plans/ai-first-language/af9-design.md` F3 and §12 Q3): with `unsafe:true`, MCP `fix` applies
the first alternative and reports the next as skipped. **Gate:** both call `rankFixes`; a test that a
diagnostic with two alternatives gets the same fix from `arch fix --unsafe` and MCP `fix`, and a unit
test of L1's choice (no live run: `--l1` needs `--live`, paid and owner-only).

### SR.18 · `W_TABLE_NO_SEAT` reads a `table` whose label names a non-dining piece outside its closed list (RM9.6 follow-up) — `todo`

The rule (#993) reads every bare `table` whose label has no dining word (dining, dinner, dine, eat,
breakfast) unless the label names another piece: the whole words desk, island, nightstand, bedside,
dressing, console or coffee, or the phrases side table, end table, TV table or TV stand (ruling RM-D77).
Labels that are not dining tables still reach it: Hall table, Work table, Changing table, Pool table,
Workbench, Vanity, and non-English labels such as Mesa de centro, Couchtisch and 茶几. Options: (a)
extend the closed list one word or phrase at a time, each with a corpus probe and a both-sides test,
keeping the dining-word-wins ruling; (b) read a label through the catalogue's own piece words (as
`W_LABEL_PIECE_MISSING` reads a room label), so a label naming a catalogued non-dining piece declines
the table. Done when the listed labels are not read, the corpus re-count names each report that moves,
and the pinned label rows in `test/lint-table-no-seat.test.ts` (32: 12 not read, 20 read) hold. Option (b)
would flip "Sideboard", which is catalogued and is read today, so it needs its own ruling.

### SR.19 · `W_TABLE_NO_SEAT`: count the label classification (`roomUses`) per room — `todo`

The rule's work counter `tableSeatTests` (`src/lint/work.ts`) counts only the room x piece centre
tests. It does not see `roomUses` calls, so the half of #993's red team 2 M1 that moved the label
classification out of the per-(table, room) loop is pinned only by the dense test's skip-call bound
(a count, bounded by n) and the coordinator's timing (400 overlapping rooms and 800 tables lint in
about 1.2 s), not by a counter. **Gate:** a counter (or an existing one extended) counts the
classifications per room, and moving `roomUses` back into the per-table loop fails a test, not only
a timing.

### SR.20 · `W_TABLE_NO_SEAT` residue that is still live (#993, #996) — `todo`

(1) `eval/goldens/anchor-furniture.arch` reports once; its fixture side count was bumped under D19.
Whether to seat the golden is an eval-owner decision. (2) The reach version (distance from table to
seat) waits for a sourced `seatTableReachMm` (today `convention`). (3) Three defect-corpus clean
twins of other codes now carry this warning: `annotation-collisions/radius-over-piece.clean`,
`circulation-privacy/bath-off-open-plan.clean` and `clearances/masked-route-balcony-door.clean`;
each has a `table` in a living room with no seat, and their `expect: none` concerns their own
case's code. **Gate:** (1) decided by the eval owner and recorded; (3) seat each twin (or record why
not) with its pins re-measured under the drawing-change proof; (2) when the number has a source.

### SR.21 · `rankFixes` picks the fewer-byte alternative, not the nearer move (#1008 red team) — `todo`

`rankFixes` (`src/fix-apply.ts`) orders the alternatives on one diagnostic by applicability, then
edit magnitude (bytes removed plus bytes inserted), then edit start, then array index. AF9's
alternatives are all `maybe-incorrect` over one span, so the shorter replacement text wins whatever
it means, and `arch fix --unsafe`, MCP `fix`, L1, the LSP order and the playground's fix button all
follow it (SR.17). The AF9 producers list moves nearer first (`src/fix-producers.ts`
`openingMoveFix`). Cases: (1) a door written 25 mm past a meeting wall (rooms `a` 4000 × 3000 and
`b` 3000 × 3000 side by side, `walls from rooms exterior 200 partition 100`, a partition across `b`
at y 1500, `door between a and b at 1525 from start width 800`) is moved to `950` (575 mm) over
`2050` (525 mm). (2) The reviewer's short-bay plan: rooms `a` 4000 × 14000 and `b` 3000 × 14000, the
same walls, eight partitions across `b` 700 mm apart at y 5000, 5700, … 9900, and `door between a
and b at 9600 from start width 800`; `E_OPENING_NIB` offers `at 10450 from start` (850 mm away),
then `at 4450 from start` (5150 mm away), and `at 4450` is taken. (3) `E_OPENING_DATUM`'s fallback
pair ranks `end` over `start`, and its edge swap ranks `a.top` over `a.bottom`, by word length alone.
Options: let a producer state its own order (a rank or a cost the producer sets, which `rankFixes`
reads before magnitude), or rank AF9's moves by distance moved. Either changes what `arch fix --unsafe`
writes on such plans. **Gate:** the short-bay plan and case (1) get the nearer move from `arch fix
--unsafe` and MCP `fix`; the start/end and top/bottom order is decided and pinned; `test/rank-fixes.test.ts`
keeps the existing orders for alternatives no producer ranks.

### SR.22 · `dataset/trajectory.ts` claims L1's fix loop but still takes every alternative (#1008 red team) — `todo`

`recordTrajectory` (`dataset/trajectory.ts`) says its fix loop is "byte-for-byte the `l1Pipeline`
contract", but it still hands `applyFixes` every fix of every diagnostic (`diagnostics.flatMap((d) =>
d.fixes ?? [])`), where `l1Pipeline` takes the top of `rankFixes` per diagnostic since SR.17
(`l1Fixes`, `eval/l1.ts`). The two give the same bytes today, because both apply only
machine-applicable fixes and no producer gives a diagnostic two machine-applicable alternatives, but no
test holds them together. The dataset's published files are the owner's (RM-D47): a change that could
move a recorded `fixed_source` needs that ruling first. **Gate:** `recordTrajectory` calls `l1Fixes`
(or the header names the difference), and a test holds its fix stage equal to `l1Pipeline`'s over the
dataset's inputs; no published file is replaced without the owner's ruling.

### SR.23 · The `arch review` sheet's code and its note read as one word (#1010 residue) — `todo`

The review sheet (`src/cli/review.ts`) sets a note after a bold run inside the same `<text>` as a
`<tspan dx="8">`: a mark's code and its "not ringed" reason (`:637`) and the close-ups heading and its
"+N close-ups not drawn" count (`:658`). The 8-unit `dx` draws the gap, but the text content has no
space (a code and "(names no drawn element)" read "W_CODE(names no drawn element)"), the defect SR.15 fixed
for a wrapped room name. The sheet is CLI output, not `compile()`'s, and its SVG is pinned
(`test/cli-preview-review.test.ts:107`). **Gate:** each such `<text>`'s content holds a space between the
two runs, and the drawn glyphs do not move (SR.15's zero-size separator, `src/backends/svg.ts`, or a
measured alternative); the sheet's pin is re-taken with the reason, by swap-back.

### SR.24 · PNG font planning never reads a wrapped name's first line (#1010 red team) — `todo`

`svgTexts` (`src/backends/png.ts:63`) collects what an SVG draws with
`/<(text|tspan)\b[^>]*>([^<]*)</g`. A wrapped name is `<text …><tspan x y>first</tspan>…`: the
`<text …>` match takes the `<` of the first `<tspan`, so the scan resumes past it and the first line
is never read. It predates SR.15. So `planFonts` does not see a CJK first line: if only that line
needs the CJK face, the PNG does not load it where it is installed and does not report `W_CJK_FONT_MISSING` where it is not. Repro (2026-11-22, the
card's 1200-wide hall beside a 4000-wide room): `label "厨房厨房厨房 Kitchen"` wraps and `svgTexts` returns
`[" ", "Kitchen"]` (no `厨房厨房厨房`); at 6000 wide it is one line and returns `["厨房厨房厨房 Kitchen"]`;
"Entrance Hall" at 1200 returns `[" ", "Hall"]`. **Gate:** `svgTexts` returns every line of a wrapped
name (a test with a CJK first line, through `planFonts`), and every PNG with no wrapped CJK line is
byte-identical.

## Review residue of the v3 stage-2 session (PRs #999–#1011, 2026-11-21…22 UTC)

SR.21–SR.24 above came from the same session; SR.25 onward were opened by its records PR.

### SR.25 · R16 now judges a polygon room written with a repeated vertex (#1007 merged-head review) — `todo`

#1007's round-2 fix made the shared `latticeRing` (`src/taste/criteria.ts`) drop a repeated vertex,
which R16 reads through `cornersOf`. A rectilinear polygon room written with its closing point (for
example `polygon (2000,0) (5000,0) (5000,3000) (2000,3000) (2000,0)`) was skipped by R16 before
(`non-rectangular-room`) and is judged now, so such a plan can gain `A_DOOR_OFF_CORNER` and a
different total. The records PR of 2026-11-22 adds the CHANGELOG sentence. **Gate:** an R16
assertion on a closed ring in `test/taste.test.ts`.

### SR.26 · `polygonsOverlap` misses identical or flush-aligned outlines (#1007 red team) — `todo`

`polygonsOverlap` (core geometry) reads two identical polygon outlines, or a rectangle that fills
one arm of an L, as not overlapping: every vertex and edge midpoint of each ring lies on the other's
boundary and no edge crosses properly. So two identical polygon rooms on one storey get no
`W_ROOM_OVERLAP`, while two identical rectangles do. R20 (#1007) stopped using it and decides on the
0.001 mm lattice instead. **Gate:** the identical-L and arm-filling cases raise `W_ROOM_OVERLAP`;
the corpus re-count names every report that moves (it is a shared check).

### SR.27 · `W_AREA_AS_LENGTH` residue (#1006) — `todo`

(1) Inside an imported component, `let A = W*W` from the module's own `W` is not reported (P1a,
pinned silent in `test/silent-accepts.test.ts` so a fix flips it on purpose); the direct `size W*W`
is. A fix needs a non-evaluating peek at the cached module env (`src/ir/expand.ts`). (2) When
`E_OUT_OF_RANGE` drops the element (a square of a name over about 5.79 m), the warning goes with it.
(3) The rest of AF10 step 2: a literal with extra zeros, two different lengths multiplied (needs
units kept on literals), a cube, an element's `at`, circle and polygon numbers.

### SR.28 · R20 and `keep stacked` residue (#1007) — `todo`

(1) At a polygon's inside corner, an overlap of 1 mm or less can read either way under a mirror or
a turn (the margin is applied to the cut pieces, not the rings); deciding it on the rings closes it.
(2) The design's other half of R20 (wet rooms sharing walls) and R19 (a toilet over a habitable
room) are not built. (3) `keep stacked` needs identical rectangles, so a smaller bath over a larger
WC cannot be pinned with it.

### SR.29 · Session residue of 2026-11-21…22 (#999–#1011) — `todo`

Each item is small; split one off when it is picked up.
1. #1001: repair's "still stands in a wall where repair left it" note (`src/repair.ts`) has no
   test; repair's `rotate` for a seat inside a placed component is written in the sheet frame
   (a pre-existing class, also for a `wc`).
2. #1001 (CV08): seats 250–300 mm from a wall (`garden-loft:46`, `relational:42`,
   `laneway-house:49`) and one-seat sofas stretched deep (`knob-flat:38`, `laneway-house:49`,
   `remodel:55`, `two-bed:48`) are not reported.
3. #1003/#1004 (CV14): `examples/hillside-villa.arch:236-237`, `:285-287` still say "the void"
   (two now); the head band has no depth (a 2 mm strip clears it; a headroom rule needs a sourced
   figure); floor is sampled at three points per open stretch; a gap storey and an escalator are
   not read.
4. #1005: a broken-plan embed loads the lint chunk with the error card; the page-side `loadLint`
   has no bound on an import that never settles; the WebKit e2e opens a shared plan instead of a
   gallery pick, which WebKit could not click.
5. #1002: a broken embed loads about 126 KB gzip to draw its card; the fix column still rides the
   first use for Copy for LLM.
6. #1010: the K1 re-pin's moved files are listed in the merge commit `1f2cbbf2`, not in the
   re-pin commit.

## Test-programme findings (promo-credit programme, 2026-11-16)

From `docs/plans/product-roadmap/2026-11-test-findings.md` (§ 3, § 4, § 5). RR.8 (2), the
`W_DOORWAY_BLOCKED` strictness, is that plan's first direction and is not repeated here.

### EV.2 · A live run keeps no plan source per brief: done by #897, waiting to be archived — `note`

EV.1 could not tell whether a lost brief-run came from the model, a stricter rule or new compiler
geometry, because neither the July nor the November artifacts hold the authored `.arch` source of
each brief. One way: `eval/run.ts` writes each brief's extracted source into the run's artifact
(the workflow's upload, never the repo). A workflow artifact on this public repo is downloadable, so
whether plan sources may be published there was ruled by RM-D53 (2026-11-16, delegated): yes, the
extracted `.arch` source only, in the existing `eval-results-live` artifact at GitHub's default
retention, accepted as a limit; raw replies stay unpublished, so when `extractArch` finds no complete
fence and would fall back to the whole reply, only a "not extracted" marker is stored; a local run
writes to a git-ignored directory. **Gate:** an offline test
that a live-shaped run writes one source per scored brief and only a marker for an unfenced or
truncated reply, a check that the local directory is git-ignored, cases for the fence shapes `extractArch`'s regex mishandles (a typed block, prose, then an `arch` block; an
untyped first block of prose; an inline triple backtick; a four-backtick fence; probed in #858's
review). The property to hold, as a hypothesis to check: the stored text is the body of a block
whose opening fence is the reply's first line-start fence with an empty or `arch` info string,
else a marker; and
`eval/README.md` names the file.

Residue (2026-11-17): the hypothesis held with one tightening, a marker also when that block is not
the text `extractArch` scored; `extractArch` itself still mishandles a typed first block and a
four-backtick fence, left alone because `dataset/model-authoring/rows.ts` pins parity with it and a
fix would move live scoring, so it needs its own card (EV.7).

### EV.7 · `extractArch` scores the wrong text for a typed first block or a four-backtick fence: done by #940, waiting to be archived — `note`

`extractArch` (`eval/run.ts`) skips a typed first block (` ```json `) and opens at its closing fence,
so for a typed block, prose, then an `arch` block it scores the text between the blocks (possibly
empty); for a four-backtick fence holding a ` ``` ` line it stops at that line. EV.2 stores only a
marker for both, so no source is lost, but the scored text is wrong. One way: score the body of the
reply's first line-start fence with an empty or `arch` info string (`firstArchFence`). A fix moves
live scoring against `eval/live-baseline.json`, and `dataset/model-authoring/rows.ts` pins parity
with `extractArch`. **Gate:** both shapes scored as that block, with tests; the `rows.ts` parity
test kept green; the change to live scoring named against the baseline before it lands.

Residue (2026-11-18): one reader, `dataset/model-authoring/reply.ts`, shared by `eval/run.ts` and
`rows.ts`: the first complete top-level `arch`/untyped fence, else the old regex's block, else the
whole reply. `eval/README.md` names the reply shapes that now score differently and that
`eval/live-baseline.json` was measured under the old regex (not re-measured). One shape scores worse
than the old regex: an `arch` block inside a wrapper fence (` ```markdown ` or four-backtick
wrapper, a typed opener never closed, a closer glued to the last line) followed by another fenced
block, usually untyped, now scores text from after the plan where the old regex scored the plan; it
needs a wrapper the model was not asked for, the four shapes are pinned as they score now, and EV.10
resolves it. Over the 1,370 `model-authoring` replies none scores differently, so no published row
moves. The published card's wording is EV.9.

### EV.9 · The dataset card states the pre-EV.7 extraction rule — `todo`

`dataset/CARD.md`'s `source` row says the `.arch` is extracted as "the first fenced block, else the
whole reply". EV.7 (#940) made the rule the first complete top-level `arch` or untyped fence, else
the pre-EV.7 regex's block, else the whole reply. Every published row reads the same under both (all
1,370 replies' first fence is a complete ` ```arch ` block), so no data is wrong, only the
wording. `dataset/CARD.md` is the published HF card, so changing it means re-uploading the card
(RM-D55, the agent's), which EV.7 left out of scope. **Gate:** the row states the new rule, and the
HF card is re-uploaded and its SHA-256 compared after.

### EV.10 · A wrapped `arch` block followed by a later block scores the later block — `todo`

After EV.7 (#940), `extractArch` (`dataset/model-authoring/reply.ts`) takes the first complete
top-level fence with an empty or `arch` info string before it falls back to the pre-EV.7 regex. When
the `arch` block sits inside a wrapper fence (a ` ```markdown ` or four-backtick wrapper, a typed
opener never closed, a closer glued to the plan's last line) and another fenced block follows, that
first step skips the wrapper and scores text from after the plan (the later block, e.g.
`arch compile a.arch`, or the plan run on to the later block's opener), where the old regex scored
the plan. `test/eval-live-sources.test.ts` › "known regression, backlog EV.10" pins the four shapes
as they score now. One way: prefer an explicitly `arch`-labelled block, at any nesting the reader can
see, over an untyped one, or take the legacy step's block when it is an `arch` block the first step
skipped. A change moves live scoring, so name it against `eval/live-baseline.json` as EV.7 did.
**Gate:** the four pinned shapes score the plan; every other case in that file and the 13 rows
parity samples keep their outputs (or each moved one is named); the 1,370 `model-authoring` replies
still score byte-identically.

### EV.3 · The baseline does not record the prompt it was measured under: done by #865, waiting to be archived — `note`

`eval/live-baseline.json` carries `judge` but no hash of `spec.llm.md` or `eval/corpus.json`, so
146 of 241 prompt lines changed after July with nothing flagging the baseline as stale. One way:
record both SHA-256s in the baseline, and have `renderDelta` (`eval/run.ts`) say so plainly when a
run's hashes differ, as it already does for a judge change. **Gate:** a unit test of `renderDelta`
for a matching and a differing prompt hash.

### EV.4 · `offset` and `hinged` written as statements get no hint: done by #866, waiting to be archived — `note`

After CO-1 and CO-2 the remaining order notes in the live runs are `Unknown statement "offset"`
(Haiku 5.5 and gpt-5.5) and `Unknown statement "hinged"` (Haiku 5.5)
(`eval/live-runs/2026-11-authorability-remeasure.md`). One way: a targeted parse hint naming the
clause the model meant, as U.6 did for `uses balcony`; whether either becomes syntax waits for
the data after the hint. **Gate:** each word gets a hint naming the real form, a test per word, and
no corpus output moves (message only).

### EV.8 · A door or window kind word after `width` is still a parse error: done by #943, waiting to be archived — `note`

EV.4's data, from a downstream product: in ArchCanvas's paid 1.62 run, 2 of the 3 first drafts
that failed to compile (of 26; its clean first drafts fell from 85 % to 62 %) failed with
`E_PARSE: Unknown statement "sliding"` / `"hinged"`, a door kind word written after `width` or at
the end (the drafts were not saved; `door … at 50% width 1000 sliding` and `… swing in hinged` are
the reconstructed family). It now carries a prompt override and a tripwire that goes red when
upstream accepts the form. Probed at 1.63.0: `door id=d on w at 50% width 900
sliding`, `… swing in hinged` and `window … width 900 casement` still fail exactly as on 1.62.0
(CO-1 made the clauses order-free, not the kind word). One way: accept the kind word as one more
order-free clause of `door` and `window` (once, `E_DUP_CLAUSE` on a second kind or a kind before
`on`), with the spec line and the GBNF saying so. **Gate:** CO-1's law (every example's parse, SVG,
`describe()`, `lint()` and diagnostics byte-identical), a test per kind word in each position, and
the `hinged` hint (EV.4) kept for a kind written as its own statement.

### EV.5 · A refused opening offers no move (design first): done by #992 (AF9 phase A), waiting to be archived — `note`

**Carded as** AF9 (`docs/plans/product-roadmap/cards.md` track 10, 2026-11-18).
**Design:** `docs/plans/ai-first-language/af9-design.md` (2026-11-20) meets the gate below. Its
questions are ruled (RM-D70, revised; its §12): maybe-incorrect moves and placeholder skeletons
only, with no machine-applicable fix, so L1 cannot move.

Six of EV.1's seven compile-error losses are opening-placement refusals (`refused, not moved`, a
window on a partition edge, a parallel edge with no offset; ADR 0028 § 5). They return no fix. L1 (`eval/l1.ts`) applies only the machine-applicable tier, so
a `maybe-incorrect` fix would help an author but move no L1 number; only a provably correct move
(ADR 0011's bar) could be machine-applicable. Design first, within ADR 0005 and ADR 0028 § 5:
which refusals have one nearest legal place, and whether a move may cross a room boundary.
**Gate:** a design note in the card or an ADR before code.

### EV.6 · The published dataset card quotes the superseded baseline: done by #856, the HF re-upload of 2026-11-16 and #858, waiting to be archived — `note`

`dataset/CARD.md` § Baseline context quotes the 2026-07-12 baseline (L0 23/26 · 14/26 · 3/26; L1
18/26 · 7/26). RM-D52 re-baselined to 22 / 9 / 1 on 2026-11-16 under a changed prompt. The card is
also on HF, so changing it means a card re-upload, which is owner-only (RM-D47). One way: date
the July numbers as the baseline at generation time and name the current one beside it, with no
comparison. RM-D54 (2026-11-16, delegated) ruled the change; the repo card was changed by
#856. **Gate:** the card-only re-upload, by the owner or on the owner's explicit instruction for that
upload; card bytes on HF equal the repo's; `dataset/README.md`'s "the HF card quoted it" line
updated after.

Done: the owner said "同意上传卡片，请你自动帮我实施" (2026-11-16); `dataset/CARD.md` from main (SHA-256
`2ed46aad…9cc4`) was uploaded as `README.md`, HF commit `90914659`, and the downloaded file's SHA-256
equals main's.

### AG.1 · `check:quick` misses the text guards an executor most often trips: done by #867, waiting to be archived — `note`

In the P5 run, executors reported a green local gate on PRs that CI then failed on
`test/opaque-literal-guard.test.ts`, `test/docs-flags.test.ts` and `test/lint-fix-texts.test.ts`
(#848): `check:quick` runs the nearest tests, and those guards are not near the catalogue and docs
files they read. One way: when a change touches `src/error-catalog/`, `docs/*.md` or a
gitleaks-excluded test, `scripts/check-quick.mjs` also runs those three files. **Gate:** a
`gate-select` test that such a change selects them; `scripts/check-quick.mjs` is high tier.

### AG.2 · `check:quick` residue from AG.1's review — `todo`

Two things AG.1 left. (1) A by-name guard (a test the import graph reaches only because it names a
changed file) still competes for the 20 `--max` slots, so a change set with many `examples/` files
fills the cap with directory-scanning guards and the by-name guard is cut (review m1 of #867).
(2) `test/lint-fix-texts.test.ts` records about 61 s and runs uncapped on any error-catalogue or
`src/fix-producers.ts` change, which is most of a `check:quick` minute, and since #895 it also wakes
for about 40 % of `src/` (120 of 286 `src/**/*.ts`, by `composesFixText`). Cap `textGuards` by recorded
seconds with the cut printed, or split the `arch <cmd>` block of `test/lint-fix-texts.test.ts` into its
own cheap test. The header rule (first doc comment mentions "message" or "hint") misfires both ways:
`src/finish.ts`, `src/sheet-text.ts`, `src/text-safe.ts` and `src/taste/advice.ts` wake it, while
`src/statement-print.ts`, `src/fixtures-catalog.ts` and `src/furnish-table.ts` do not. Deletion wiring
(from RR.16's review round 1): `scripts/check-quick.mjs`'s deletion wiring is pinned by no test (a
temp-repo `--list` case would pin it); a delete-only branch that deletes a test file runs no step, so a
stale `test/INDEX.md` shows only in CI; deleting a `src/` module runs drift only; a case-only rename on
Windows is not seen as a deletion. One way for (1): give by-name guards their own extras slot.
**Gate:** `gate-select` tests for both; `scripts/check-quick.mjs` is high tier.

## Site chrome (found while fixing the nav overflow, 2026-09-20)

### N.1 · The nav row needs 1152px, and the hamburger persists until then (a WANT, not a bug) — `todo`

**The defect is fixed; this entry is the better answer that was deliberately not taken.** Nothing is
broken at any width today — `docs-site/e2e/page-chrome.spec.ts` ("the nav bar fits the viewport")
asserts zero page overflow AND zero last-item overhang on `/` and `/guide` across 768 → 1152. Do not
treat N.1 as a red.

(This is the nav entry. The plans' older "backlog N.1" meant a different entry that reused the number, `finish` missing the NOTES and schedule rows; commit `8909802c` fixed and removed it.)

What shipped, and why 1152. VitePress reveals the desktop nav row at `min-width: 768px`; our
eight-destination bar does not fit until 1152, so the reveal was moved there. The fault had two faces
and **only one of them scrolled**, which is the part worth carrying forward: below 960 `.VPNav` is
`position: relative`, so the too-wide row grew the document and the page scrolled sideways (272px at
768, 240 at 800, 140 at 900); at 960 VitePress makes `.VPNav` `position: fixed`, and **a fixed
element's overflow never grows the document** — so the row did not start fitting there, it started
being CLIPPED at the viewport edge while `scrollWidth - clientWidth` read 0. Measured overhang of the
last nav item ("Ecosystem"), Playwright/Chromium, reproduced independently on the live site:

```
/        960:+44  980:+24  1000:+4  1024:ok                  → was clipped across [960, 1003]
/guide   960:+179 1000:+139 1024:+115 1100:+39 1152:ok        → was clipped across [960, 1138]
```

⚠ **Never set this breakpoint from `scrollWidth` alone.** That number is 0 across the whole clipped
band; a binary search on it lands on 960 and ships a page whose last nav entry is severed at 1024.

**The cost of the answer taken, which is what remains open:** the hamburger persists to 1151px, so a
1024 iPad landscape and a 1100px laptop window get a hamburger beside ~500px of empty bar. That is
cosmetic, not broken — every destination is reachable and keyboard-focusable there (measured: 22
controls, 17 distinct hrefs) — but it is not what a docs site should look like at 1100.

**The recommended long-term fix is (B): cut the top level from seven items to five, and move the
breakpoint back down.** The arithmetic, so nobody re-derives it. The menu is **684px** intrinsic
(Guide 63 · Reference 110 · Examples 88 · Showcase 91 · AI Agents 106 · Playground 114 ·
Ecosystem 113). On a doc page at 960 the space left after the 272px sidebar gutter, the 183px search
box and the 32px right padding is **473px** — a **179px deficit**. Every saving that keeps all seven
items was costed and they do not reach it: item padding 12→6 buys 84px, 14px→13px labels ~30px,
dropping the `Ctrl K` chip ~40px — **154px ceiling**, at the cost of degrading the bar at 1440 where
nothing is wrong. Dropping Showcase (91px) and Ecosystem (113px) buys **204px** against the 179px
deficit, so the row would fit from 960 with room to spare; Showcase would move under an "Examples"
dropdown, and ArchCanvas/npm/GitHub stay reachable through the footer, the nav screen and
`socialLinks`.

Why it was not taken now (owner, 2026-09-20): **Showcase is deliberate outreach material** — the
famous-building plans — and demoting it from the top level is a content-strategy decision that should
not be forced by the schedule of a CSS fix. Decoupling them was the point: the defect is fixed today,
and the IA can be reconsidered on its own merits. The `nav` block in `docs-site/.vitepress/config.ts`
reasons about this IA in prose ("Playground is the standalone CTA — it is intentionally NOT repeated
inside Ecosystem"), so whoever picks this up should read that first.

Closing it means: change the `max-width` in the nav block at the foot of
`docs-site/.vitepress/theme/style.css`, change the `nav` array in `config.ts`, and widen the E2E's
width list — the overhang assertion already there is what proves the row fits, and it must keep
running on a route **with** a sidebar, which is the tight case.

---

## Accessibility — axe findings that are NOT ours (2026-09-20)

Found by the first `a11y-loop` pass over the rebuilt landing page, a doc page and the playground
(five passes each: default, dark, forced-colors, reduced-motion, 320px reflow; the playground also
driven through three storey-switcher states). **Everything this batch built came back clean** — the
nine-sheet landing page reported 0 violations, and all three switcher states reported 0. The
findings below pre-date it and are logged so they are not rediscovered from scratch.

### AX.1 · VitePress sidebar section headers promise button behaviour they do not keep — `todo`

5 × **SC 2.1.1 Keyboard (Level A)**. `#VPSidebarNav … div.item` carries `role="button"` and
`tabindex="0"` but activates on neither Enter nor Space, so a keyboard user can focus a collapsible
section and not collapse it. Upstream `VPSidebarItem.vue` (`data-v-b3fd67f8`), not our theme — the
fix means shadowing the component or adding a keydown handler, so it wants its own change. Real,
and live.

### AX.2 · Playground — three pre-existing violations — `todo`

`scrollable-region-focusable` ×2 (SC 2.1.1) on two scrollable panes with no keyboard access;
`focus-not-visible` (SC 2.4.7) on CodeMirror's `.cm-content`; `reflow-horizontal-scroll`
(SC 1.4.10) on `header > .tb-cell:nth-of-type(2)` at 320 px. That header cell is the View select —
nothing this batch touched. The CodeMirror one is upstream CM6.

### AX.3 · Do NOT re-report these two — they are measurement artifacts — `note`

**21 `keyboard-unreachable` on `/guide` are a tool budget, not a focus trap.** The walk gives up
after 60 Tab steps and the sidebar alone spends most of them. Driven manually: the code copy button
takes focus at step **62**, the footer credit link at **77**, and the cycle repeats every 82 steps
(77 → 159 → 241 → 323). The tab order is complete.

**91 `color-contrast` needsReview on the landing page are inside the compiled SVG plans.** axe
cannot resolve a background through the shape stack and says so — "could not be determined because
it is overlapped by another element". The room labels are `#222222` on sheet paper: **15.90:1** on
white, **14.22:1** on `--paper`. Both pass AA and AAA. Resolve by reasoning about the source, never
by widening a rule.

## Wave 4 — P2 language features

Designed and evidenced in the competitor-borrowing roadmap §5 (archived with the other research
docs outside this repository). Each one
**adds tokens**, so each needs: its own design pass, full `gen:*` regeneration, closed value sets
**interpolated from the source of truth, never retyped into a generator**, a byte-identity law
pinned by test ("a plan that does not use it renders, describes and lints exactly as before",
proven by a SHA-256 sweep over the shipped examples), and a corpus entry in the executable-spec gate.

| # | Feature | Status | Note |
|---|---|---|---|
| P2-7 | Four-sided authorable clearances + embedded-insert exemption | `todo` | Most contained — widens `clearanceMm` (`src/fixtures-catalog.ts:21`) to `{front,back,left,right}` plus a per-statement override. **Re-scope before starting:** v1.28.0 took that catalog from 18 categories to **59 across 36 families** and gave `FixtureSpec` two more flags (`directional`, then v1.29's `underlay`), so "one default per category" is now a far larger table to be right about — and an underlay already has a stated exemption (it never blocks a fixture's use-space) that a four-sided rule must not re-litigate |
| P2-10 | Feet-and-inches display formatting (`dimension_units standard`) | `todo` | **Display only** — millimetres stay the internal unit and the measured truth. Route through `fmt()` |
| P2-8 | Targeted dimension selection (dimensions on named walls/fixtures) | `todo` | Composes with the sheet layer |
| P2-2 | Room-relative door hand | `todo` | **Behaviour change for every plan with a reversed wall — must be staged.** (a) an advisory `W_*` naming the doors whose hand would move, zero geometry change; (b) the flip behind a release boundary, goldens re-blessed after review. Check the `place … mirror` goldens specifically: `frame.ts`'s `det < 0` handedness flip must compose with the new rule, not fight it |

### 4.5 · Deferred by name in v1.31.0 — `todo`

Four things the ground track decided NOT to do, recorded so the next person finds a decision
rather than an omission:

- **Ground in the circulation model.** An `outdoor` surface obstructs nothing today: you can walk
  on the lawn, and you can walk on the `water`. Fixing the pond without fixing the pond-with-a-
  bridge is the trap — a gate in a fence, a stepping-stone path and a `water` feature all want the
  same answer — so the whole question is one piece of work rather than a per-kind special case.
  Note the nav grid presently models the INSIDE of the building only, so "walk the garden" is a
  larger change than it looks.
- **A curved fence** (`E_FENCE_CURVED`). The post pitch, the panel offset and `length_mm` are all
  measured along a straight run. Wants the per-segment arc lowering `wall` already has, plus an
  arc-length pitch — not a facet.
- **A polygonal balcony** (`E_OUTDOOR_POLY_DEGENERATE` covers it). The railing is derived per named
  EDGE (`top`/`bottom`/`left`/`right`) and carried through a `place` frame by those edges' outward
  normals; a ring has no such names. Wants a per-EDGE rail model first, which is the real work.
- ~~**`outdoor` in Plan JSON.**~~ Done in RM3.1 (PS0.21): `outdoor[]` and `fences[]` are optional
  keys of their own, and with them taken out `planToJson` is byte-identical with and without ground
  (`test/outdoor-byte-identity.test.ts`; the round-trip law `test/plan-json-roundtrip-law.test.ts`).

A fifth was found while reviewing the flagship for release and is filed on its own, since it is a
defect in an existing rule rather than a scope decision: **4.8**, a `dims auto` chain running across
an `outdoor` surface attached to the facade it measures.

### 4.7 · The MCP registry publish races npm (RE-OPENED 2026-09-04) — `todo`

**Closed in v1.31.0 with a bounded retry; RE-OPENED by v1.34.0, which the retry did not save.** Three
consecutive clean runs had made this look settled — and the AGENTS.md rows were right to keep saying
a clean run is *evidence the retry works, not proof the race is gone*. Here is the counterexample.

**What happens.** `mcp-publisher publish` hands the registry a `server.json`, and the registry
validates it by looking the package up on npm — the package this same job published seconds earlier.
npm's registry has not yet made that version visible to a third party, so it 404s:

```
registry validation failed for package 0 (@chanmeng666/archlang-mcp):
NPM package '@chanmeng666/archlang-mcp' exists, but version '0.2.14' was not found (status: 404).
```

**The budget is the defect, and it is now measured rather than guessed.** The retry is 6 attempts
20 s apart — **a 2-minute window**. On v1.34.0 every one of the six 404'd. The publish itself was
fine: `npm view @chanmeng666/archlang-mcp version` read `0.2.14` immediately afterwards, and a manual
`gh run rerun --failed` succeeded with no change, which is the signature of a race and not of a bad
manifest.

| release | outcome |
|---|---|
| v1.30.0 | failed, manual `gh run rerun --failed` |
| v1.31.0 · v1.32.0 · v1.33.0 | green on attempt 1 |
| **v1.34.0** | **all 6 retries 404'd; manual re-run needed** |
| **v1.43.1** (2026-10-16 UTC) | **all 6 retries (6 × 20 s) 404'd.** The shim publish signed its provenance at 13:36:14 and returned at 13:36:16; the registry still answered 404 at 13:38:01; `npm view …@0.2.26` first answered at 13:39:17, about 3 minutes later. Recovered by `gh run rerun --failed` once `npm view` showed the version. **Budget raised after it:** `release.yml` now waits for `npm view @chanmeng666/archlang-mcp@<version> version --prefer-online` to answer, every 20 s for up to 10 minutes, before the registry publish, and fails with an error if it never does; the six retries stay as the second line |

**Blast radius, which is why this is worth fixing rather than living with.** The registry step sits
*before* the GitHub Release step, so its failure also left the Release uncreated while both npm
packages were already public — a half-published state that reads, from `gh release list`, exactly
like "the release never happened".

**Directions, in order of how much they actually address the cause.** Widen the window well past two
minutes with backoff (cheap, and npm visibility is measured in minutes, not seconds); or poll
`npm view <pkg>@<version> version` until it answers *before* invoking `mcp-publisher`, which turns a
blind retry into a precondition; or move the GitHub Release step **ahead of** the registry step, so a
registry race can never again hide a successful npm publish. The last one is independent of the other
two and worth doing regardless.

**Do not** narrow this to "re-run it by hand" — that is the workaround, and it has now been needed
twice in five releases.

### 4.10 · A 5 s test budget on a heavy optional import: done by #829, waiting to be archived — `note`

Found 2026-09-04 while gating item 4.9, and worth filing because `AGENTS.md` currently records that
the suite has **no known flake**.

`test/roof.test.ts` → "PDF export draws it" opens with `await import("pdfkit")`, a heavy optional
dependency, under vitest's default **5000 ms** per-test budget. Measured on this machine:

| condition | duration | verdict |
|---|---|---|
| file run alone, machine idle | **674 ms** | passes, 7.4x margin |
| inside a full-suite run under heavy parallel load | **5821 ms** | **fails: `Test timed out in 5000ms`** |

So the margin is real but it is a margin on an **import**, not on the assertion — the same run had
`test/zones.test.ts` take 105 s. It reproduced twice under load and passed 32/32 three times when run
alone, including on `main`, so it is not a defect in `roof` and was not introduced by 4.9, which does
not touch that file.

**The trap this entry exists to mark.** The failure text says `Test timed out in 5000ms`, which is
exactly the diagnosis item G.9 records being WRONG about twice — there, the text said
`expected at least 1 JSON envelope(s) on stdout, saw 0`, which is not a timeout at all, and two agents
theorised about load from the *shape* of the symptom without reading it. Here the text really is a
timeout and the margin was measured, so the reading holds. **Read the assertion, then measure the
margin; do not pattern-match either way.**

Options, in the order they are worth trying: give this one case an explicit timeout that reflects what
it does (a dynamic import of an optional native-ish package is not a 5 ms unit test); or hoist the
capability probe so the import is paid once per file rather than inside the timed case; or leave it and
say plainly in `AGENTS.md` that the suite has one load-sensitive case, since a number nobody can
reproduce on a quiet machine is worse than a documented one. **Do not raise the global
`testTimeout`** — that hides every future instance of the same shape.

**Done by #829.** Both first options together: `test/roof.test.ts` probes `pdfkit` once at module
scope (`HAS_PDFKIT`, paid at collection), and "PDF export draws it" carries its own
`PDF_CASE_TIMEOUT_MS` budget; the global `testTimeout` is unchanged. M.6 (visual, sheet) is the same
shape and stays open.

### 4.1 · Joinery pass performance — `todo`

`toScene` got roughly **3× slower** when v1.30 replaced the three wall-lowering paths with one
joinery pass (ADR 0018). The cost was measured, accepted on 2026-08-28 and tracked here; it was
**not** an oversight and the `bench` PR comment is informational and has never gated.

**Measured back-to-back against `main`'s `src/` in one session** (`git checkout main -- src/`,
bench, restore):

| corpus | main | v1.30 | delta |
|---|---|---|---|
| all 29 examples, every storey, total | 57.5 ms | 162.0 ms | +182% |
| mean per storey | 1.98 ms | 5.59 ms | +182% |
| slowest real plan (`library`) | 6.75 ms | 16.0 ms | +137% |
| `bench` OPENING_HEAVY (400 walls, 600 openings) | 5.96 ms | 116.3 ms | +1852% |
| `bench` BALANCED | 120.7 ms | 184.7 ms | +53% |
| `bench` ROOM_HEAVY | 190.8 ms | 235.4 ms | +23% |

`OPENING_HEAVY` is the worst case *because* 400 disjoint axis-aligned segments is exactly what the
retired rectangle sweep was fastest at.

**Restated: the deltas stand, the `bench` absolutes do not.** Each row above is a difference on
the same bench in the same session, so the joinery pass's cost is what it says. But the three
`bench` ABSOLUTES were measured on the old one-line generated layout (a ~1 km drawing whose
room font was metres tall), where every label relocated: `relocateLabels` was about 58 % of
BALANCED and about 97 % of ROOM_HEAVY `toScene` (inspector profile, `bench/README.md`). Do not
budget against 184.7 ms or 235.4 ms as joinery cost; OPENING_HEAVY was the only clean joinery
measurement. `bench/gen.ts` now lays plans out on a grid on an A0 sheet, where label placement
is negligible and `joinWalls` is over 90 % of BALANCED, and `bench/baseline.json` is still the
old one: regenerate it on an idle machine before quoting fresh absolutes.

**Landed: the constant factors.** `PointInterner` keys its cells with nested integer maps
instead of template strings, and `chainLoops` computes each edge's undirected key once instead
of on every sort comparison; the algorithm, iteration order and `pointKey` strings are
unchanged and the output byte-identical (`test/interner-oracle.test.ts`, the joinery oracles,
every golden). Measured back to back in one session on a loaded machine (not re-run here):
`toScene` about 0.55–0.75× on BALANCED and OPENING_HEAVY, `joinWalls` alone about 0.85–0.95×.

**That profile no longer holds; re-measured 2026-10-03 before choosing what to change.** The
earlier table (split 61.5 ms, about 45 % of the pass) predates the constant factors above. On the
same OPENING_HEAVY input, timed as `joinWalls` alone (inputs built once, compiled JS, temporary
phase instrumentation since reverted), the split was about **21–27 %** of the pass, and grouping
plus chaining together were larger:

| OPENING_HEAVY, ms per call | split | group | index | classify | chain |
|---|---|---|---|---|---|
| before | 7.9 | 7.7 | 1.5 | 8.8 | 11.4 |
| after (landed below) | 8.7 | 2.4 | 1.6 | 7.7 | 4.3 |

Phase attribution in a garbage-collected run is fuzzy: a collection is billed to whichever phase
triggers it, which is why `split` reads slightly higher "after" here. With a forced collection
before each call (all absolutes inflate), split read 14.2–16.3 ms before and 9.6–12.2 after.
Compare shapes, not single cells.

**What the split's pair scan actually does** (OPENING_HEAVY, per call): 4,000 edges, 7,600
candidate pairs, and **every** candidate's boxes overlap: the grid hands out the true overlap
set, with no false positives to remove. All 7,600 pairs are axis-aligned (6,400 vertical x
horizontal, 1,200 collinear). 8,800 interner lookups. The scan's cost is the interner and the
per-pair overhead, not the crossing arithmetic.

**Landed 2026-10-03: the second round** (`src/geometry/joinery.ts`). Same algorithm, same
iteration order, same emitted floats. Proven by `test/joinery-split-oracle.test.ts`, which keeps
each replaced form verbatim, runs old against new over every example storey and generated wall
sets, and compares with `Object.is`, so −0 and one ulp both count. Each of its blocks was shown
to fail on a planted defect, and counts the inputs that reached the new path. Also checked
outside the suite: main's and this `joinWalls` were bit-identical on all 320 calls `compile()`
makes over 107 corpus sources (plan view and every `--view`), and on 3,000 generated inputs; a
planted one-ulp change was caught in 189 of the 320.

- *Per-call point-key memo.* `pointKey` was rebuilt for the same interned vertex by grouping,
  chaining, rotation and the final sort; a `Map<Point, string>` owned by the call returns the
  same string, already hashed.
- *Lines grouped through nested maps.* `L|k1|k2` equality is exactly `(k1, k2)` equality, since
  a point key holds one `|`, so the concatenated key is never built. Arcs keep the full key.
  `[k1, k2].sort()` became one comparison (`<` is the code-unit order `sort()` uses).
- *An unread field removed.* Each group carried a `coincident` set (and called `sameDirection`
  to fill it) that nothing ever read; classification probes both sides instead.
- *Probe allocations.* A probe asked `queryBox` for the cuts, which builds a `Set` and an array
  only to deduplicate; whether ANY cut contains the probe is all that is asked, so it walks the
  cells directly. `contextAt`'s per-group `Set` became a stamp array keyed by wall-index slot.
- *The fill that IS the outline.* When every side of every edge reads the same for "owned by g"
  as for "owned", the fill would rebuild the outline's edges one for one and chain them again;
  it takes the outline's loops in fresh arrays instead. That is every single-material plan,
  OPENING_HEAVY and BALANCED included. Multi-material plans keep the general pass.
- *The axis-aligned split shortcut.* A vertical x horizontal pair returns `(v.x, h.y)` before
  `parallel`. Exact because `parallel` is always false for such a pair and `meetLines` already
  returned that point with no arithmetic; all it saves is `parallel`'s two square roots. It is
  worth **2–6 % of the split, about 1 % of the pass** (final code with and without it, six
  rounds, one of which went the other way). That is small but real and exact. The item's
  premise that this pair needed a "general line–line solve" was already untrue.

Measured back to back in one session on a cloud VM (`origin/main` d4a9a3f against this change,
interleaved): `joinWalls` alone **0.58–0.71×** on OPENING_HEAVY (six rounds, median about 0.65)
and 0.65–0.70× on BALANCED; `npx tsx bench/run.ts --json` `toScene` **0.70–0.73×** on
OPENING_HEAVY and 0.70–0.78× on BALANCED (three rounds); real plans `museum` 0.64–0.77× and
`library` (multi-material, so no fill reuse) 0.75–0.90×. Ratios only: `bench/baseline.json` was
not regenerated and must be on an idle machine.

**Tried and rejected, with the evidence:**

- *A sweep line instead of the grid pair scan.* The grid's candidates already ARE the
  box-overlap pairs (7,600 of 7,600 overlap), so a sweep cannot cut the pair count, only the
  index build (about 1.6 ms). A one-dimensional sweep would test every pair that overlaps on its
  axis: **348,000** along x and **234,000** along y on OPENING_HEAVY (BALANCED: 167,010 and
  107,950 against 4,800). That is 30–46× the pair work to save the build. Not built. Only a
  two-dimensional structure could compete, and the grid is one.
- *Skip re-interning a collinear pair's endpoints* (they are interned objects already). Measured
  4–5 % of the split, inside the whole call's noise, and its exactness rests on an interner
  invariant (`intern.get(p) === p` for an interned `p`), not on a local equality. Not landed.
- *An explicit comparator for the chainer's `startKeys` sort.* The default `sort()` was a
  visible line in the profile (about 6 %), but an explicit code-unit comparator measured the same:
  the cost is the comparisons, not the comparator. Not landed.

**Still open, if anyone returns to this.** After the round above, the profile is flat: GC (about
17 %), the chainer's `startKeys` string sort, interner lookups (renormalising the universe plus
the split's 8,800), and the classify probes' winding walks. None is a single hot spot; each
needs an argument as careful as the ones above.

**The constraint, and it is the whole point of the item.** Any fix must stay **INSIDE the one
algorithm**. Legitimate directions: an exact axis-aligned shortcut within the split phase,
fewer allocations per group, a cheaper `undirectedKey` (all three landed above); a sweep line
was measured and rejected above. **Never a second
pipeline** — a rectilinear fast path would reintroduce exactly the three-paths structure ADR 0018
removed, and the four defects that came with it. That the joinery's rectilinear outline is
vertex-identical to the old rectangle boolean's (reversed and rotated) makes the shortcut *look*
free; it is not, because the fills and the opening cuts would have to agree too, and then there are
two implementations of the ownership rule to keep in step.

**Two approaches already shown NOT to apply** — do not re-try them without new evidence:

- *Classify per HATCH GROUP so each call sees a fraction of the plan* (proposed in the Stage-A
  notes). The ownership rule is **cross-group by design**: "an edge is on group `g`'s fill iff
  exactly one side is owned by `g`" is what makes two materials tile without a doubled boundary.
  Splitting the call breaks the decision the fills depend on — and `OPENING_HEAVY` is single-material
  anyway, so it would not have helped the worst case.
- *Stop rebuilding the spatial indices per call.* There is exactly **one `joinWalls` call per plan**;
  there is nothing to reuse across.

**Gate for any attempt:** the output must not move by one byte. `test/joinery-oracle.test.ts`,
`test/joinery-pipeline.test.ts` and the whole golden set are the proof, and a re-bless is a red
flag, not a step.

### NS · Not scheduled — recorded so they are not lost — `note`

- **P2-5** measured-vs-drawn edge separation ·
  **P2-6** multi-flight stairs — each needs its own design pass.
- **Deferred from the axonometric view (P3-3, shipped)**, by name: the roof (there is no pitch
  datum, only an eaves outline — approximating one is the move `roof` itself refuses), furniture,
  ground, fences, stairs and every annotation layer; and the painter's algorithm has no answer for
  two interpenetrating solids.
- **The rest of P3** (IFC4 export, occupancy-grid export, `arch vary`, `--why`, anchor-relative
  coordinates) — each is a project, not a task. **P3-2's prerequisite is DONE**: element heights and
  opening sill/head heights landed as the v1.35 vertical
  datum layer (`src/datum.ts`, branch `feat/height-datum`) — `RWall.height`, `sill`/`head` on every
  resolved opening, `ResolvedPlan.storeyHeight`/`elevation`, and `Opening.kind`/`sill`/`head` on the
  list a wall keeps of what is cut into it, which is what a 2.5D slice at a sensor height reads.
  **P3-2 itself stays open.** The datum now has ONE consumer — the axonometric — and what building
  it discovered is worth carrying: nothing was missing for a 2.5D slice, but a **slab thickness**
  still does not exist (v1's storey height is floor-to-floor and a wall runs the full storey), so
  a consumer that must separate structural depth from clear height has to add it.
- **P3-7 arbitrary rotation** is deliberately NOT built; the trade-off is recorded in the archived
  competitor-borrowing roadmap.
  Any future design must first answer what the handed rules (`hinge left`,
  `against wall … side left`, `anchor top-left`, `right-of`) mean at non-axis angles, plus grid snap
  and `fmt()` stability.

### SET · Settled — never re-propose — `note`

`T3` (the diagnostic-loop live experiment) has **one owner-ratified run** (ratified 2026-11-15; ran 2026-11-15; record: eval/live-runs/2026-11-t3-result.md) and no other; `T6` (area-syntax sugar) is
**parked** behind the frozen G2 reversal triggers. See `docs/agents/iron-laws.md` before touching
either.
