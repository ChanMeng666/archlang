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
| M.8 | Should `format()` keep more than three decimals, and should `arch fmt` say so (stderr, exit code) when it refuses a file with parse errors? |
| M.9 | Should grid snap and `fmt2` round half away from zero, so a mirror image snaps alike? It moves output. |
| M.14 | Should a roof's acute corner be bevelled or miter-limited, and at what limit? |
| D.7 | One hairline for the whole sheet? The title block's rules would move in every example. |
| CI throughput | Which of `docs/plans/ci-throughput.md`'s options (repo auto-merge and branch protection, a concurrency group, path-filtered legs, coverage off the PR path, a merge queue, changelog fragments) to take? Repo settings are the owner's. |

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

### 3.2 · One playground origin constant — `todo`

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

### N.2 · `E_LEVEL_MIX`'s remedy does not name `notes` among the plan-level settings — `todo`

The remedy text in `src/error-catalog.ts` lists the statements that stay outside `level` blocks
and predates `notes`. Cosmetic: `notes` inside a level is `E_PARSE`, as `legend` is.

### N.3 · A tag with every candidate place taken keeps its first place — `todo`

A tag tries up to seven places and takes the first clear of every opening, wall, drawn
primitive and tag on the storey (`src/opening-schedule.ts`); with `schedule openings` injected
into the corpus, 21 tags find none and stay on ink (dense furniture, a party wall), and 5 sit
on a room name the label pass did not move. Each is pinned in `test/opening-tags-corpus.test.ts`
(the list may only shrink). Better needs more candidate places or a leader line. Tags also
number per storey (`W01` on each level); a set-unique numbering is an owner call.

### N.4 · `fmt` round-trips `project`/`drawn_by`/`date` wrongly for a control character — `todo`

`src/format.ts` quotes those three title fields with `JSON.stringify`, which writes a tab as
`\t`; the lexer reads back only `\"`, `\\` and `\n`, so `title { project "A<TAB>B" }` formats to
`project "A\tB"` and re-parses as `"AtB"` (likewise CR, U+0001, a lone surrogate). Older than
the sheet statements, and left so `fmt` output on existing files does not move in that change;
`number`/`revision`/`notes` already use `escapeStr`. Fix: the same escaper for the three.

### N.5 · `E_DRAWING_LIMIT`'s catalogue entry omits its second trigger — `todo`

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
- Per-room reachability on an upper storey for intent `reachable` needs a new describe fact (the
  rooms reached per storey from its arrival rooms); `levels[i].access.rooms[].reachable` counts
  exterior doors only. Re-run: the intent now fails a storey with no way in, but removing an
  upper room's only door still passes it.
- `suggestTopology` reads the lowest storey only (`resolvePlan().ir`) and so never seeds from
  arrival rooms. Re-run: removing the kitchen door on `two-storey`'s ground floor gets
  suggestions; removing the upper bath door (`W_ROOM_DISCONNECTED` on level 2) gets none. It
  also fixes its tolerance at `DEFAULT_TOL` (`src/suggest.ts`), while lint's access graph reads
  the ruleset's `tolMm`, so under a custom tolerance the two can disagree on what connects
  (code read).
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

### M.8 · The source formatter is lossy past three decimals, and silent when it refuses — `todo`

`format()` prints every literal through `fmt3`, so precision beyond 0.001 mm is dropped and a
`.0005` rounds by the binary value. Re-run: `room id=a at (0.0004,1.0005) …` formats to
`at (0, 1.001)`. Separately, `arch fmt` on a file with parse errors (including the newly
diagnosed trailing content) prints it unchanged and exits 0, so nothing tells the user it
refused: re-run on a stray-`}` file. Consider a note on stderr or a non-zero exit.

### M.9 · Grid snap rounds half up, so a mirror image snaps differently — `todo`

`Math.round` rounds .5 toward +∞, so snapping is not odd-symmetric. Re-run on `grid 50`: a room
at x = 25 resolves to 50, at x = −25 to −0 (not −50; the JSON prints `0`). A mirrored drawing
therefore snaps to a different shape. The same rule makes `fmt2(−x) ≠ −fmt2(x)`: `fmt2(0.125)` is
`0.13`, `fmt2(−0.125)` is `−0.12` (re-run through `src/num-format.ts`). Changing either moves
output; it needs a decision and a sweep.

### M.11 · LSP rename misses an assignment target — `todo`

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

- `relatedSpans` (the "plan was closed here" note) reach only `arch compile`'s text output, not
  `--json` or the LSP. Re-run: the `lint --json` diagnostic has no related span.
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

### M.21 · `format()` writes the plan name with `JSON.stringify`, which the lexer cannot read back — `todo`

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
instead. Same shape as the `arc`-inside-a-`room polygon` deferral below, and probably the same
design pass: an offset ring that carries arcs is an offset ring whose whole consumer set has to
learn arcs.

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

### U.2 · Metres compile silently — `todo`

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

### U.3 · A misspelt furniture category passes `validate --strict` — `todo`

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

### U.5 · A parse error does not use what the spec already predicts — `todo`

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

### U.6 · `uses balcony` does not point to `outdoor balcony` — `todo`

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

### U.17 · No report says how many diagnostics carry a machine fix — `todo`

**Observed (engineering gap audit, row 24).** Every code in `ERROR_CATALOG` (`src/error-catalog.ts`) carries a
catalogue `fix` text; only a minority produce a span edit (a grep estimate, not a measurement). The catalogue
is the source of the code count, so no number is written here.
No test prints the coverage, so the gap is not a number.

**Hypothesis.** A test or script that walks the catalogue and the fix producers can print the
count. The estimate is the first thing to replace.

**Gate:** the script prints "N of M codes have a span edit" and a test fails if the count
drops. **Size:** S.

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

### U.20 · The MCP `describe` tool's description names only the centreline area — `todo`

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

### U.22 · `describe()` is unbudgeted, and the net-area term is quadratic per room — `todo`

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

## Found downstream (2026-10-17)

ArchCanvas adopted net area and the issued-sheet statements and showed two gaps that only a
consumer sees. Each has an issue holding its measurements; the numbers below are the issue's own
and were not re-run when filing.

- H.1 · Lint messages still quote element ids (issue #187) — closed by PS2.22 and PS2.29 (PR #269); test/lint-messages-id-free.test.ts holds it; RM0.1, 2026-11-11 → archived (lab)

### H.2 · `finish()` cannot accept a code its caller treats as advisory (issue #189) — `todo`

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

### O.3 · How the Claude plugin directory learns of a new version is unverified — `todo`

The plugin was submitted from `plugins/archlang/` on 2026-10-10 and is in review. The directory
offered a "push updates" webhook, which was dismissed and is not set up. Whether the listing follows
`main` without it, or needs a resubmission after each release, has not been observed; settle it at
the first release after the listing is approved. The directory holds a pinned-`npx` server for a
policy review, and may ask for a privacy-policy page. The OpenAI plugin directory
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

### PG.1 · A room cannot be reached from the keyboard — `todo`

The hover tooltip and the room's facts card (`playground/src/interact.ts`, `room-card.ts`) open
from the pointer only: no room in the drawing takes the focus, so a keyboard or screen-reader user
cannot open a room's card at all. Once open, the card is reachable and Escape closes it. One way:
a focusable list of the rooms (the facts line, or a "Rooms" control) that opens the same card.
**Gate:** an e2e case opens a room's card from the keyboard alone; the card keeps its focus rules.

### PG.2 · The card and the tooltip pick a room by its bounding box — `todo`

`pickSmallestContaining` (`playground/src/interact.ts`) hit-tests describe()'s `bbox`, so on an L,
a trapezoid or a circle a point inside the box but outside the room picks that room (or a smaller
box around it), and its card opens. AGENTS.md: a derived position comes from the shape, never its
bounding box. The shape is in the summary (`floor_polygon`, `floor_circle`): test it, boundary
inclusive, and keep the smallest-room tie rule (`playground/test/interact.test.ts`). **Gate:**
unit cases on `hexagon-pavilion` (trapezoids, the rotunda) and `gallery-l`; the rectangle cases
unchanged.

### PG.3 · The facts line moves the drawing on the first compile — `todo`

The facts line is empty in the served page and filled after the first compile, so the stage
shrinks by its height then (35 px, measured at 1280 and at 390 wide). Writing
it at build time (`playground/scripts/gen-static.mjs`) would fix that, but with JavaScript off the
drawing's share of a 1280×720 viewport would fall to about 0.66, under `boot.spec`'s 0.70; moving
the line into the output pane's status row first keeps both. **Gate:** the stage box is the same
before and after the first compile; `boot.spec`'s no-JS share holds.

## Website residue (Search Console fixes #640, #643, #655, 2026-11-10)

Left by the reviews of those PRs (review-cost cap). WS.1 and WS.2 fail only on input the docs do
not yet hold; WS.3 to WS.5 are true of the live site today.

### WS.1 · Four copies of the fence rule, none quite CommonMark — `todo`

`fenceStep` (`docs-site/link-rewrite.mjs`), the link scan in `test/docs-site-links.test.ts`,
`fences()` in `test/docs-fences.test.ts` (the live-fence gate) and `headingIds` in
`test/plan-constructs.test.ts` each implement the fence rule, and they differ: the first three
accept any leading whitespace (`^\s*`), so a line indented 4+ spaces (indented code) opens a
fence; none rejects a backtick in a backtick opener's info string, which CommonMark does. One way:
one exported rule (`^ {0,3}`, the info-string check) that the rewriter and all three tests import.
**Gate:** unit cases for an indented ```` ``` ```` and for ```` ``` a`b ````; the rewritten output of every
docs page unchanged; `docs-fences` still finds the same live fences.

### WS.2 · The rewriter's heading ids skip neither HTML comments nor `{#id}` — `todo`

`headingIds` in `docs-site/link-rewrite.mjs` treats a `#` line inside `<!-- … -->` as a heading
and slugs `## Title {#custom-id}` from its whole text, while the test's copy
(`test/plan-constructs.test.ts`) does both the way VitePress 1.6.4 does. So the rewriter registers
a phantom id (`title-custom-id`) that a GitHub-spelled link is then "confirmed" against, and
`test/docs-site-links.test.ts` reports a correct `#custom-id` link as having no heading (a false
red). The rewriter's heading pattern also allows no leading spaces where the test's allows
`^ {0,3}`. Port the test's rules (and share them, with WS.1). An attribute block holding more than
an id (`{#a .b}`) and an explicit id that repeats an earlier slug are the corner cases to pin.
**Gate:** unit cases for each; rewritten output over the docs unchanged.

### WS.3 · Example-page `lastmod` misses some of what the page shows — `todo`

`PAGE_INPUTS` (`playground/scripts/gen-static.mjs`) dates an example page by its newest input, but
`playground/src/facts-line.js`, `playground/src/plan-label.js`,
`playground/scripts/lean-thumb.mjs` and the compiler itself (`src/`, through the drawing and facts
the page embeds) also change the page and are not listed. Adding `src/` would move every page's date at every core change, so decide first whether
the compiler belongs (the package version may be the better signal). **Gate:** the
`test/playground-examples-rows.test.ts` pin lists the new inputs.

### WS.4 · "What this plan uses" has no row for `keep`, `import` or `style` — `todo`

`playground/scripts/plan-constructs.mjs` detects constructs from `compile().ast`. No example page
uses `keep` or `import` yet, so a detector could not be checked against a real page, and
`docs/language-reference.md` has no heading for `style` to link to. Add each row when an example
uses it (and, for `style`, when the reference gains its section). **Gate:**
`test/plan-constructs.test.ts`'s anchor check covers the new rows.

### WS.5 · The sidebar does not highlight "Architecture decisions" on `/adr` — `todo`

The ADR index is generated as `docs-site/adr/index.md` (`docs-site/sync-docs.mjs`) and served at
`/adr` (`html_handling: drop-trailing-slash`). VitePress 1.6.4's `isActive` normalises that page
to `/adr/` and the sidebar item `link: "/adr"` (`docs-site/.vitepress/config.ts`) to `/adr`, so
they never match (read from `vitepress/dist/client/shared.js`, not yet measured in a browser). The
likely fix is `link: "/adr/"`, but check the href it renders: `/adr/` redirects to `/adr` here, and
an internal link to a redirect is worse for crawling than a missing highlight. Only if no link
spelling works is a route move worth it (a 301 in `docs-site/public/_redirects`, the canonical, the
breadcrumb and the sitemap together). **Gate:** an e2e case finds the item active on `/adr`; every
rendered link to the index is `/adr`.

## Stairs in the 3D preview (public-surfaces card X3, 2026-11-06)

### ST.1 · No lint compares a stair's drawn treads with its storey height — `todo`

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

### ST.2 · The walking line over a winder landing is drawn as a chord but credited as an arc — `todo`

PR #533 (winders on a quarter-turn landing, preview-and-remodel D46) credits a winder landing with
`min(n, floor(arc / going))` goings, where `arc` is the quarter arc of radius `width / 2` round the
inner corner (about 0.785 × width). The glyph (`src/elements/vertical-glyphs.ts`) still draws the
walking line across that landing as one straight chord (about 0.707 × width), so the drawing and
the lint read two different lengths. Lint never reads the drawing, so this is a drawing change:
draw the arc. It moves the SVG of plans that write `winders` only; `describe()` and `lint()` do
not move (the `block-stair-winders-byte-identity` law pins every plan without the clause). The
contributor offered to do it. **Gate:** the winders law green; the digest of every winders fixture
listed before and after in the PR; a plan without `winders` byte-identical.

### ST.3 · `archlang-3d` builds a winder landing as a level landing — `todo`

The 3D package ignores `describe().verticals[].landings[].winders` and builds the landing flat, so
the preview climbs the storey in fewer, taller risers than the plan draws (the plan shows `n`
treads fanning from the inner corner). Fan `n` wedge-shaped treads from the inner corner in
`packages/archlang-3d`, each rising one riser, so the 3D keeps the plan's treads (the X3 ruling).
Core untouched. **Gate:** `check:3d`; the mesh/GLB pins move only for the winders fixture; a plan
without `winders` byte-identical in every 3D output.

## 3D asset and surface residue (public-surfaces 3D cards X4b, X6, V2, 2026-11-06)

### 3D.1 · The asset check trusts the manifest for the plan PNG — `todo`

`checkAssets` (`packages/archlang-3d/scripts/gen-3d-assets.ts`) compares a committed
`<name>.plan.png` only by SHA-256 against the manifest, then re-rasterises the source to the
recorded pixel hash; it never decodes the committed file. A PNG swapped together with its manifest
`sha256` passes. **Gate:** `pixelsHash(readFileSync(file))` must equal `plan.pixelsSha256`; a
planted swap fails `--check`.

### 3D.2 · No size budget for plan and poster PNGs — `todo`

The budget table caps WebP, MP4 and GLB only; `.plan.png` (92–245 KB today) and `.poster.png` have
none, so an A1 sheet could grow unchecked. **Gate:** a budget (for example 300 KB) enforced by the
generator and `--check`.

### 3D.3 · `pngjs` is not declared by `packages/archlang-3d` — `todo`

The generator script imports it through the root `devDependencies` (hoisting). Not shipped
(`scripts/` is outside `files`), but an isolated install of the workspace would break. **Gate:**
`pngjs` and `@types/pngjs` in the package's `devDependencies`.

### 3D.4 · Pitched roofs in the 3D preview (design first) — `todo`

A plan's roof becomes a hidden 150 mm flat slab (`roof-flat-150`); every surface says "no pitched
roofs yet". **Gate:** a design note (which roof forms the core states, how the replay shows them)
before any code; the laneway GLB pin moves only with its reason.

### 3D.5 · MP4 replays and byte ranges (measure) — `todo`

Cloudflare answers a `Range` request for `/3d/*.mp4` with 200, so Safari may not play the replays;
the sites fall back to the poster and an MP4 link. **Gate:** a real Safari check; if it fails,
serve the MP4s from a host that answers 206, or keep the fallback as the design.

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
- **`outdoor` in Plan JSON.** Deliberately absent — `planToJson` is byte-identical with and without
  ground, pinned in `test/outdoor-byte-identity.test.ts`. Adding it is a schema change and should be
  argued as one, with a consumer that wants it.

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

### 4.10 · A 5 s test budget on a heavy optional import — `todo`

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

- **`arc` edge inside a `room polygon` ring.** Was promised in a shipped error message "for v1.25";
  v1.25 shipped without it and the promise has been retracted to point here. Genuinely large: the
  ring's whole analysis layer — effective-vertex count, self-intersection, centroid, adjacency,
  occupancy and nav grids, the `dims auto` vertex chain — is written on literal vertices and must
  learn arcs. Build it on its own merits, not to honour a version number.
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

`T3` (the diagnostic-loop live experiment) is **permanently declined**; `T6` (area-syntax sugar) is
**parked** behind the frozen G2 reversal triggers. See `docs/agents/iron-laws.md` before touching
either.
