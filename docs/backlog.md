# Backlog

Forward-looking work queue. **`CHANGELOG.md` remains the only record of what shipped** — this file
records what has not, and is deleted from as items land. Item numbers are stable identifiers, so a
gap in the sequence means that item shipped; the commit that closed it is cited by whatever
referenced it. Closed entries are archived verbatim outside this repository.

It is also the state file for the `/loop` burn-down driver:

```
/loop Read docs/backlog.md. Take the topmost item whose status is `todo`, dispatch one Opus
subagent with isolation:"worktree" to implement it, run that item's stated verification gate,
then report the diff and the gate output to me and STOP for approval. Do not commit, do not
push, do not start a second item in the same tick.
```

**Floor gate for every item:** `npm run check` + `npm run check:drift`; add `npm run typecheck:all`
for anything outside `src/`+`test/`, `npm run docs:build` for any `docs/*.md` edit, and
`npm run e2e:playground` / `e2e:docs` for site changes. Items list only what they add on top.

**Merge protocol** (a clean auto-merge is not evidence of correctness — one branch once *moved* a
function another had *modified*, and taking "theirs" would have silently reverted the fix with a
green suite): one worktree per item, never two concurrent items on the same file; diff moved or
renamed bodies against the newer version, not just the conflict set; run both branches' fixtures
together before merging; `npm run typecheck:all` after **every** merge.

**Read an entry's observations as evidence and its diagnosis as a hypothesis.** Symptoms here have
been reliable; stated causes have been wrong about as often as right. Check the arithmetic of a
stated cause before building on it, re-measure any number an entry quotes, and when an entry leaves
open which of two components is wrong, settle that first. Correct the entry in place when you close
it.

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
credential. They cannot be deleted, because `paper/` moved to the private repo on 2026-08-26 and
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
advisory itself is against the **UI server** (`--ui`), which nothing here starts — CI runs
`vitest run`.

Against that, (b) costs more than it first looked: it is `vitest` **2.1.9 → 5.0.0, three majors**,
across 203 test files and four workspaces, with the snapshot-format risk that carries in a repository
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

**A correction to (b) that the next agent needs: `vitest` 5 will NOT clear the `esbuild` advisory.**
npm reports `esbuild`'s `fixAvailable` as `vitest@5.0.0`, but that only reaches
`node_modules/vite/node_modules/esbuild@0.21.5`. The **other** node in the advisory,
`node_modules/esbuild@0.27.7`, is **tsup's** — and `tsup@8.5.1`, the latest 8, pins `esbuild ^0.27.0`,
which cannot reach the fixed `0.28.1`. So that one has **no fix at any version of tsup 8** and is a
fourth group, not part of (b). Exposure is nil either way: both `esbuild` advisories
(GHSA-67mh-4wv8-2f99, GHSA-g7r4-m6w7-qqqr) are against `esbuild serve`, a dev server tsup never
starts. Note also that the root is on **`vitest` ^2.1.8** (resolved 2.1.9), so (b) is a *three*-major
jump, and `vitepress@1.6.4` pins `vite ^5.4.14` — it shares the one hoisted `vite@5.4.21` with
vitest 2 today, but `vitest` 5 wants `vite` 8, so (b) will **split** that tree rather than fix
`vitepress`. (c) clears only on a `vitepress` release.

**Residual after (a), grouped by why — 7 advisories:**

| root | sev | why it stays |
|---|---|---|
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

### G.5 · Circulation measures every walk from `entrances[0]` only — closed by W3b

Owner decision: nearest entrance per room. The walk is one multi-source search seeded at every
entrance (`bfsNearest`, ties to the lowest entrance index); the bottleneck is the widest route from
any entrance, each seeded at its own clear width; the detour is taken from the room's own entrance.
`rooms[].entranceId` appears only on a plan with several entrances. The 16 `other_entrance` rooms
are measured and the reason is retired (ADR 0008 addendum; `test/circulation-entrances.test.ts`).

### G.10 · A `place`d plan does not round-trip through Plan JSON — `todo` (the projection half is done)

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
with `E_DOTTED_DECL` (×3 on the minimal fixture). The tripwire stays armed (`test/plan-json.test.ts`,
"G.10"): its second test pins `E_DOTTED_DECL` on an UNMIRRORED placement (a mirrored one is now
refused earlier, by `E_JSON_MIRROR`) and goes red when a placed plan starts round-tripping. Whoever
fixes that still has to decide what a mirrored fixture becomes on the way back, since source has no
word for it outside a `place`.

The neighbouring rule, from [ADR 0016](adr/0016-component-instances-and-frames.md) and now stated in
`AGENTS.md`: when a fact crosses a frame, ask **can this be re-expressed in plan coordinates?** A
placement clause cannot (plan space has no word for a local corner) so it is dropped; a symbol's
handedness can, exactly, as one reflection about the footprint's own centre line — so it is flipped.
This item is the third case, and the answer is the same as the handedness one.


### G.12 · A wall cannot be derived from a resolved room boundary — `todo`

Found while closing G.6. It is why `examples/relational.arch` ships four warnings that cannot be
repaired without giving up the thing the example exists to teach.

**Relational placement and interior walls are mutually exclusive.** `room id=kitchen right-of
living align top gap 0` resolves to real coordinates — and nothing can read them back out. A wall
point is an `Expr`; the only name-bearing `Expr` node is `ref`, which resolves against the `let`
environment and the nine built-ins (`min` `max` `abs` `sqrt` `floor` `ceil` `round` `len` `str`).
There is no member access in the grammar at all. Measured, not read off the source:

```
wall partition thickness 100 { (kitchen.x, 0) (kitchen.x, 4000) }
  → E_UNKNOWN_REF  Unknown name "kitchen.x"   (x2, one per point)
```

So a relationally-laid plan gets rooms that reflow **or** partitions, never both, and the
consequence is not cosmetic: with no wall on a shared boundary there is nothing for a `door` to be
hosted on, so `W_ROOM_DISCONNECTED` is unavoidable for every room whose only neighbour-boundary is
an internal one. In `relational.arch` that is three of four rooms, plus `W_ROOM_NOT_ENCLOSED` on
the bath.

**Two workarounds, both measured and both rejected — do not re-derive these.**

- **A cased `opening` on the wall-free boundary.** Clears `W_ROOM_DISCONNECTED` from `arch lint`,
  raises `W_OPENING_OFF_WALL` from `arch validate`. A warning trade, not a fix. The asymmetry is by
  design (`lint` is the soundness layer; `validate` is parse + resolve + lint) and is not a defect.
- **`let`-hoisted dimensions with the walls written as arithmetic over them.** This WORKS —
  `size LW x LH` parses, and `wall … { (LW,0) (LW,LH) }` places a partition exactly on the shared
  boundary — and it fixes only the case where a SIZE changes. Change a relational clause instead
  (`bath right-of bed` → `bath below kitchen`) and the rooms move while every wall, door and
  fixture stays put, silently. It also reconstructs by hand the coordinate model `right-of` exists
  to eliminate, at which point the relational clauses are decorative.

**What would actually close this** is a way for a wall to name a resolved boundary rather than a
number — something in the shape of `wall partition between living and kitchen`, or a room-edge
reference legal in wall-point position. That is a language design question, not a bug fix, and it
interacts with `place` frames (an instance-local room edge crossing into plan coordinates) and with
`grid` snapping. **Do not treat the workarounds above as the answer**; either is a step backwards
from what the example currently states honestly in its header.

Until then `examples/relational.arch` is this item's live reproduction: it carries the four
warnings on purpose and says why.

### G.8 · A per-category `style` — `todo`

Also deferred by name in v1.32.0 and previously untracked. `style <kind> { … }` reaches the fixture
layer as ONE kind, so there is no way to give `tree` a different pen from `sofa`. The symbols are
drawn with named line weights already, so the seam exists — the syntax does not. Any design has to
say how a per-category rule composes with the existing per-kind one.

---

## Equivariance findings

`place … rotate r mirror m` must carry every fact through the frame's D4 ⋉ Z² action. The oracle
(`test/d4-oracle.ts`; suites `test/equivariance-{corpus,scene,fuzz}.test.ts`) measures that law, and
every violation it finds is pinned in `test/equivariance-known.ts`, per element and, for the raster,
with a size bound: a new one fails as `NEW`, a closed one as `FIXED` until its pin and its `STILL …`
witness are deleted, and each pin's class predicate must account for what it pins. Each entry below
is one pinned class; the gate for closing it is that suite going `FIXED` for exactly that class.
Status is `todo` for a defect and `declared` for a convention that is not a group fact.

### E.1 · `fix-pullback` — lint fixes rewrite a shared component in plan coordinates — closed by W5c

`W_FIXTURE_BACK_TO_ROOM` and `W_DIM_OVERLAP` now pull their value back through the element's
instance frame (`LintContext.frameOf`) before writing it: `actOnQuarterTurn(g⁻¹, n)` for the
quarter-turn, `det(g)` on the offset (applied before rounding). A statement shared by several
placed instances keeps one fix only when every instance raises the same edit; otherwise the fix is
dropped with a hint (`reconcileSharedFixes`, `src/lint.ts`); the two dim rules report once per
statement per placement so each instance answers for itself. Pin deleted; the witness is now the law
(`test/equivariance-corpus.test.ts`, "closed classes"; `test/fix-pullback.test.ts`). What the pin
also absorbed, `W_DIM_OVERLAP` measuring a mirrored opposite-normal pair differently, is the text
side's, not the pullback's: it moved to E.14.

### E.2 · `stair-tail` — a vertical run's arrow and entry edge ignore the frame — closed by W5b

Each run's `transform` (`src/elements/{stair,escalator,elevator}.ts`) carries its local tail as
`_tail`; `tailEdge` reads it and `runAxis` replaces `flightAxis` for the drawn axis (a square
footprint's tie). Pins deleted; law: `test/vertical-frames.test.ts`, "closed classes" in
`test/equivariance-corpus.test.ts`. The fixed page rule still decides the tail at the root.

### E.3 · `stair-break-hand` — a mirrored stair keeps its break line's hand — closed by W5b

`stair.transform` XORs `_mirror` on a reflection; `stairGlyph` negates the break line's cross
coordinate for it. Pins deleted; law as E.2.

### E.4 · `plugin-throw` — a plugin element inside `place` throws — closed by W2

Each element module owns its frame action (`ElementDef.transform`); a plugin kind without one is
dropped inside a `place` with `E_INSTANCE_NO_TRANSFORM`, never thrown. Pin deleted; the witness is now
the law (`test/equivariance-corpus.test.ts`, "closed classes"; `test/transform-seam.test.ts`).

### E.5 · `facing-tie` — a corner or 45° window resolves its tie N/S-first — `declared`

`windowFacingPage` (`src/site.ts:191,206`) breaks a tie horizontal-first by stated convention, which
an axis swap does not commute with. Not a defect; the pin moves only if the convention does.

### E.6–E.10 · the nav grid breaks its ties in page order — closed by circulation v2 (E.9 by W3b)

Owner decision: D4-symmetric tie rules, in one window (ADR 0008, "ties are broken by the group,
not by the page"). An entrance on a lattice line seeds both sides of it and a detour's straight
line runs to the nearer seed (E.6 entrance half, E.7); a threshold is carved on a symmetric row
set — both sides of every lattice line, each seed to its nearest seed opposite, by both L-runs,
spanning the host wall's axis, and stamping the connector's width only on the cells it opens
(E.10); among equidistant cells a room is measured to the one the walk reaches first, then by a
group-invariant key, from a seed point snapped to the frame lattice (E.6 anchor half, E.8). All
four raster classes are closed: their pins are deleted, their eight `STILL` witnesses are laws
("closed classes" in `test/equivariance-corpus.test.ts`), and T2 now compares every circulation
number under every element — walks, bottlenecks, detours, entrances, key routes, the sealed
rooms' widest way in. Fuzz (a one-off measurement; the shipped test runs fewer): 0 of 4000 random plans (seeds 11/22/43/91) show a raster
violation, against 1352 before (1076 `raster-tie`, 334 `anchor-far-tie`, 91 `threshold-carve`,
45 `entrance-seed-walk`).

Re-measured before the change, on the tree after W3b's orbit pick and door-route gate (examples
whose `describe()` moves; the W3b figures in parentheses): the walk-first rule for every room
23 examples, 87 walks (24, 217); the same only when the seed point is covered 14 examples, 16
walks (14); an entrance on both sides 20 examples, 71 walks (22, 119); a threshold on a
symmetric row set 6 examples, 7 walks (5, 9). All together, with the seed snap, 24 examples and
three fixtures move, only in `describe().circulation` — the ledger is in the header of
`test/byte-identity-baseline.ts`. The largest single moves are the closed classes' own: an
anchor ring (`courtyard-house` r_dining −1400, `garden-loft` r_live −1900, `townhouse` r_kitchen
−1800) and a portal carve (`hexagon-pavilion` g_n −1200 straight through two aligned portals).
`hexagon-pavilion`'s g_sw/g_se, behind the OBLIQUE portals of the 1200 mm drum, move +600/+500
to 9800: the new value is rule-consistent, NOT a correction — the portal is carved by an
L-shaped tunnel between seed cells several cells apart on either side of the masonry, and the
symmetric seeds give a different tunnel (the card-A red team measured 170 band cells un-carved and
124 others carved, the new g_sw path zig-zagging through the band). See C.5.

Key routes follow the same law: a room whose nearest cells tie on the whole key is routed from
its whole tie set, not the cell-index pick (red-team counterexample: routes[bed>bath] 4300 vs
4200 under a turn; pre-existing on the tree before, where routes were not yet compared).

Still open by construction: a plan whose extent is not a whole number of cells spills its last
cell past one edge, so the raster is compared only under translation there.

**Reopened and closed (E.10, carve order).** The symmetric carve still read each threshold
point's seeds off the LIVE nav mask. A connector's points are visited centre, +d, −d in the
frame's own axis order, which a turn or flip reverses, so a later point could seed on a cell an
earlier one had just opened, and which room cell became the far seed (and took the connector's
width) depended on the frame. Fuzz seed 2065024317 found it (a bottleneck of 700 against 740
under r90/r180), present on `main`; the red team found the same through connector source order
(`hexagon-pavilion` plus a second portal into `g_sw`: 8800 or 8200 by which was written first).
Every connector's seeds are now read once, off the mask as it stood before any connector carved
(`buildGrid`, `src/analyze/circulation.ts`), so point order and connector order commute with the
carve. The witness, the twelve-spelling law and a two-order law are in "closed classes"
(`test/equivariance-corpus.test.ts`). Only `hexagon-pavilion`'s `g_sw`/`g_se` moved, walk
9800 → 8800 (detour 1.87 → 1.68), re-run here through `arch describe`; the 9800 above was
itself a product of carve order, and 8800 is the same rule with the order taken out, not a
measured truth (C.5). The opt-in overlay moved on 14 files with no fact moving outside the
hexagon (`test/byte-identity-baseline.ts`).

**Open question for the owner (far-seed stamp).** A carve still writes the connector's clear
width onto its far seed even when that cell was already walkable (`k === far` in `buildGrid`),
which overrides the room's own furniture pinch, against "a furniture pinch must stay a pinch".
`nearestPairs` returns `[a, b]`, so the far seed is always the `between[1]` room's seed: the
exception is asymmetric in the source order of `between`. The closed-class witness's 740 depends
on it (dropping the exception reads 700 in every frame and flips that test by design), and so
does `eval/fidelity-plans/min-bedroom-flat.laundered.arch`'s route bottleneck (M.3). Not changed.

### E.11 · `float-translation` — facts change under a pure translation — `todo` (circulation half closed by W3b)

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

**Still open for lint:** an `on <wall> at 55%` position that resolved an ulp off its integer rounds
back 20 m away and flips `W_POCKET_RUN`'s `>= need`, making its reverse-slide fix appear. Close by
snapping resolved positions (or comparing through the same snapped frame).

### E.12 · `slide-track` — a mirrored sliding door swaps its panels' tracks — closed by W5b

`door.transform` XORs `_mirror`; the `sliding` case of `renderDoorPanels` puts the fixed panel on
`n · off · (_mirror ? −slide : slide)`. `slide` itself still does not flip. No root spelling
draws a mirrored sliding door (reversing the wall reverses the normal with the traversal); the
`test/place.test.ts` twin case encoded the defect and now excludes the sliding kind.

### E.13 · `column-corner` — the frame carried a column's corner as a centre — closed by W5b

`column.transform` carries `at`/`size` through `t.rect`, as every top-left rectangle is. Pins
deleted; law: "closed classes" in `test/equivariance-corpus.test.ts`, `test/frame.test.ts`.

### E.14 · `dim-text-side` — a dim's number was drawn inside its line for a negative offset — closed by W5b

`dim.render` puts the number on the side a negative offset points (`pointsRight`), so it reads
outside its line at the root. A zero offset has no sign, so a reflected call-out takes the frame's
handedness from `RDim._mirror` (XORed in `dim.transform`, which writes `0 - offset` and so never
makes a `-0`); an evaluated `-0` is folded to `0` at resolve. `W_DIM_OVERLAP`'s band follows the
same side. No shipped example has a negative offset.

The lint half W5c moved here closed with it: `W_DIM_OVERLAP`'s band (`Band.m`) now puts the number
on the drawn side, so the A3 1:50 opposite-normal pairs (`550`/`-550` bumped `-1100` unplaced and
`-825` mirrored; `550`/`-650` warned only unplaced) give one verdict and one bump under every g.

### E.15 · `dim-tick-hand` — a mirrored dim draws its ticks on the other diagonal — `declared`

Each 45° station tick is drawn along `dir + n` (`src/elements/dim.ts:290-291`), a slash of fixed page
sense relative to the line — a drafting convention, like a hatch angle. Its mirror image is the
other diagonal. Not a defect; the pin moves only if the tick convention does.

### E.16 · `nested-ref` — a reference into a nested instance fails once its plan is placed — closed by W8

Every level now reaches into its own descendants the way the root does: instance groups resolve
deepest first, and each sees its descendants' walls and rooms carried into its local frame by the
composed authored `place` frames, named relative to it (`src/ir.ts`, `descendantView`). None
reaches out. Every position or category search sees descendants too (ADR 0016 §3 addendum), and
an opening registers on its wall by the host's wall id, not its endpoint coordinates (which two
float evaluation orders can split at grid 0). `clinic.arch` and `museum-wings.arch` survive being imported whole (T0 is clean);
clinic's T1–T3 runs, vacuous until then, surfaced only existing classes (`raster-tie`,
`threshold-carve`, `slide-track`, `dim-text-side`, `dim-tick-hand`), pinned per element. Pins
deleted; the witness is now the law (`test/equivariance-corpus.test.ts`, "closed classes";
`test/compose-assoc.test.ts`).

## Circulation findings (found while landing W3b)

Pre-existing defects and one owner decision that W3b and its red-team review ran into; none was in
W3b's scope.

### C.1 · A partition thinner than a nav cell does not block the walk — closed by circulation v2

`rasteriseWallSegments` blocked a cell only when its CENTRE was within half a wall's thickness of
the wall, so a partition thinner than one cell (the random plans draw 80 mm walls on a 100 mm grid)
blocked no cell at all and the walk leaked through it. Owner decision: the centre test PLUS every
cell the wall's CENTRELINE passes through (closed-square touch). The walk is 4-connected
(`neighbours4`) and the touched cells of a continuous centreline form an edge-connected chain —
through a lattice corner all four cells round it are touched — so no step slips between them. A
touched cell's centre is within `cell·√2/2` (70.7 mm) of the line, so for a wall of at least
`cell·√2` (~142 mm) the centre test already blocked it: the cover is consulted only below that,
and no shipped row moved. Rejected: blocking every cell the whole BAND passes through. Measured,
that square predicate sits on its decision boundary wherever a face is tangent to a lattice line —
the hand-derived drum's faces are — so a 1 mm nudge moved `test/circulation-hand-derived.test.ts`'s
walk 16100 → 16300 (the open arc's 16500 → 16700), and it moved 31 corpus walks for walls whose
faces fall inside a cell. The residual gate gains one structural class, `centrelineCover`, shown
non-vacuous on a planted 80 mm partition (red on the centre-only rule, green with the cover).

### C.2 · `--overlay circulation` ignores floor voids — closed by circulation v2

`src/overlays/circulation.ts` now passes the storey's voids to `computeCirculationOverlay`, as
`describe()` and lint do; `test/overlay.test.ts` pins that the drawn walks are exactly as long as
the reported `walkDistanceMm`, with and without a void across the way in. Every plan without a
`void` is unaffected.

### C.3 · The detour ratio is taken from the nearest-by-walk entrance, which can be roundabout — decided: keep it

Since G.5, a room's `detourRatio` divides its walk by the straight line from the entrance nearest
it BY WALK. That door can sit behind the room's back: the museum's `g3` went 1.36 → 2.32 because the
door it is now walked from is nearer on foot but not in a line. Owner decision: keep "per
walk-nearest entrance", so one record describes one route — the alternative, the least ratio over
every entrance, would call `g3` direct but no longer describe the walk `walkDistanceMm` reports.
`W_CIRCUITOUS_PATH` now names the entrance its ratio is taken from; `docs/analysis.md` documents
the difference.

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

### C.4 · An exterior door at the corner of two rooms joins them and gives no entrance — `todo`

A connector touching TWO rooms keeps `doorConnections`' answer (the ≤2-room carve-out of the
`probe` policy), and that answer is the two rooms — so an exterior door whose point is within the
adjacency tolerance of a partition's end joins the rooms to each other and the plan reports
`W_NO_ENTRANCE`. The probe would say "exterior" on the outer face. Repro:

```arch static
plan "corner" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }
  wall id=mid partition thickness 100 { (4000,0) (4000,3000) }
  room id=a at (0,0) size 4000x3000 label "Hall"
  room id=b at (4000,0) size 4000x3000 label "Living"
  door id=d at (4100,3000) width 900 wall shell
  door id=d2 at (4000,1500) width 800 wall mid
}
```

`describe().doors[d].between` is `["a", "b"]`, `access.entrances` is `[]`, lint: `W_NO_ENTRANCE`.
Close by probing a two-room connector on an EXTERIOR host too (a measured change for any plan
with a door that close to a partition end).

## Wall-face probe findings

Left open by routing "which side of this wall has floor" through `wallFaceProbes`
(`src/geometry.ts`) and giving `roomOfVertical` the room's shape. Neither was in that change's scope.
Both closed their SHAPE half in W5a; P.1's message half is still `todo`.

### P.1 · A shaft landing on no room says its storey has no way in — `todo` (the shape half is done)

**Landed (W5a): `roomOfVertical` asks the room's shape, not its bounding box.** A stair or lift
standing in a concave room's notch, or in a circle's bounding-box corner, is no longer claimed by
that room — `test/vertical-room-shape.test.ts`.

**Still open: the message.** `verticalReach` (`src/vertical.ts`) counts the storey reachable
(`describe().vertical.reachable_levels` lists it) but records an arrival room only for a stop whose
`room` is non-null, and `no-entrance` (`src/lint/rules/entrance.ts`) stands down only for an arrival
room. A stair landing in an L's unroomed notch therefore gets `W_NO_ENTRANCE` ("there is no way into
the building") on a storey the shaft reaches. The rule is right — nothing at the landing is floor to
arrive in — but the message misleads. Want a message (or code) that says the shaft lands on no room;
keep the rule. Pinned by `test/vertical-room-shape.test.ts`.

**Widened by room-aware reachability.** `verticalReach` now carries you on only from a room you
can walk to (`test/access-policy.test.ts`), so a second case reaches the same message: a stair
standing in a door-less store is a DEAD shaft, and the storey it leads to gets
`W_NO_ENTRANCE` ("there is no way into the building") although a shaft does land there. The
message work should cover both: name the shaft and say why it does not count (lands on no room;
starts in a room nobody can reach). A stop whose footprint lies in no room still keeps the
storey-level answer, so the notch case above is unchanged. Re-run: a hall with the front door
plus a door-less store holding the stair, upper floor with no exterior door:
`reachable_levels` `[1]` and `W_NO_ENTRANCE` on level 2 (was `[1, 2]` and silent).

### P.2 · `swing into <rectangle room>` on an arc host picks its side off the chord — closed by W5a

`wallFaceProbes` (`src/geometry.ts`) replaced the CHORD-normal probe `swingInto`'s rectangle path used
with the TANGENT normal `doorSwing` and `roomSideOf` already used, so all three now agree on an arc
host as they already did on a straight one. `test/wall-face-probe.test.ts` pins a major-arc door
swinging into the side its leaf is actually drawn on, at both ends and the midpoint, for both winding
directions.

## Axonometric view findings

Left open by W9, which made `compile(src, { view })` stop throwing on a wall set its openings
consume and stop painting an empty ring. None of these throws; each draws or reports wrongly.

**All four are won't-fix**: the view is deprecated and removed at 2.0 ([ADR 0021](adr/0021-plan-first-view-deprecated.md)), which closes them.

### V.1 · Mixed-height joints interpenetrate and draw in the wrong order — `won't fix`

`extrudeWalls` (`src/view/extrude.ts`) joins each wall-height subset on its own, so walls of
different heights are never trimmed against each other: each runs to its own centreline. The painter
keys on one centroid per face, so a short partition's quads sort nearer than a long, unsplit shell
face and are drawn over it. Reproduced: a 4200 shell `(0,0)…(2300,5700) close` with a 3000 partition
`(0,3700) (2300,3700)` paints the partition across the shell's near outer face; the same plan at one
height draws correctly. No example mixes heights within a storey. A candidate: join by height
BAND (every wall at least as tall as the band) rather than by equal height.

### V.2 · A header or sill block overhangs its wall's end — `won't fix`

`openingCut` (`src/geometry/band.ts`) is not clipped to its host segment, and the view extrudes the
opening's fill-back blocks from that loop, so an opening running past a wall end puts a header or
sill block out past it. The plan view does not show it: it only subtracts the cut.

### V.3 · No diagnostic for an opening wider than, or consuming, its host — `won't fix`

`wall … { (0,0) (1000,0) }` + `opening on w at center width 1200`, or overlapping openings that
cover a wall end to end, are diagnostic-free. The wall is silently gone from both drawings.

### V.4 · The joinery emits an UNCLOSED chain for a door consuming an arc wall under `grid` — `won't fix`

`finishLoops` (`src/geometry/joinery.ts`) passes an unclosed chain through by design, so the defect
it exposes reaches the drawing as an open outline. Found by the W9 red team: 11 of 8739 generated
iso/axon compiles hit it. Its header says a dead-end chain means the classification was
inconsistent, and closing the chain there would fabricate an edge; start from the classification.

### V.5 · 2.0 removal of the axonometric view (phase B) — `todo`

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

---

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

### 6.3 · Plan JSON reflection on dims, doors and vertical runs — `done` (doors, dims), vertical `_tail`/`_mirror` not projected

**Landed: doors and dimensions project the frame's reflection.** `planToJson` emits
`mirror: true` on a door or dimension inside a reflecting `place` frame (the IR's `_mirror`),
the same semantics as furniture's (G.10): it records the FRAME's reflection, present only when
reflected (a doubly-reflected instance composes back to no key). `swing` and `offset` are
already the reflected values; the flag adds what they cannot say — which track a sliding door
takes and which side a zero-offset call-out's number reads on. `planJsonToArch` refuses
`mirror: true` on either with `E_JSON_MIRROR`, exactly as for furniture. A reflection-free
plan's payload is byte-identical; across `examples/` only `clinic.arch` and `terrace-row.arch`
(mirrored doors) change, by exactly the added key.

**Not projected: the vertical members' `_tail` and `_mirror`.** A placed stair/escalator/elevator's entry edge (`_tail`) and a stair's reflection (`_mirror`, `src/ir.ts`, `src/elements/stair.ts`) are IR-internal, and
Plan JSON has no vertical-circulation members at all, so there is nothing to attach it to. Adding
one would be a new payload member, not a flag — a separate decision.

### 6.4 · Rectangle-algebra path consistency for `intent` — `todo`, rejected for now (ADR 0020)

Considered and set aside while writing ADR 0020: routing the `intent` channel's
adjacency/reachability assertions through a general interval/rectangle constraint solver
instead of today's bipartite matching (`checkPredicates`). Rejected as an eval-judge risk —
a solver can satisfy a rubric with a *different* room assignment than the judge expects,
moving eval scores for reasons unrelated to plan quality. Revisit only against a concrete
rubric failure, not as a generalisation exercise.

### 6.5 · Exact projective predicates (orient2d / homogeneous intersection) — `todo`, rejected for now (ADR 0020)

Measured bounds with today's plain double arithmetic: `orient2d` stays exact to `2²⁵` mm;
homogeneous line intersection is exact only to about 104 m (`2^(50/3)` mm ≈ 104,000 mm). Both cover every plan size the
language can express today. Revisit only if a shipped plan (not a synthetic stress case)
measures outside either bound. Re-examined and kept rejected in
[ADR 0022](adr/0022-exact-decisions-and-bounded-input.md): the exact decisions this round
needed were integer or `BigInt` comparisons on the 0.001 mm lattice and squared lengths, which
rely only on IEEE-exact `+ − × ÷ √`, not on projective predicates. The `2²⁵` mm bound is also
the candidate modelling range in M.1.

### 6.6 · A trig/hypot cross-engine audit — measured: no divergence; replacement not motivated

`src/analyze/syntax.ts`'s integration value uses `Math.log2` alongside the existing view and
geometry code's `Math.hypot`/`Math.atan2` family (`docs/agents/architecture.md`: "the view
uses no `Math.cos/sin/tan/atan`, not exactly rounded across platforms"). ECMA-262 fixes only
`+ − × ÷` and `Math.sqrt`; the rest are implementation-approximated, and CI had pinned digests
on V8 alone (Node 18/20/22), never on SpiderMonkey or JavaScriptCore.

**Measured.** `npm run digest:engines` (`scripts/engine-digests.ts`) runs the built core in
Playwright Chromium, Firefox and WebKit and compares each engine's digest of the agent-facing
output (SVG, `describe()`, `lint()`, diagnostics, after the compiler's rounding) with Node's and
with the pinned `test/while-byte-identity-baseline.ts`. Over 86 plans (examples with `lib`,
fixtures, recovery corpus, eval goldens and fidelity plans) × 2 payloads (core and `--facts`)
plus two transcendental probes: 172 of 172 digests identical in every engine and on Node, and
Node matched all 39 pinned baseline rows. Measured when the harness landed and re-run on the
tree with every change of this round merged: `status=clean` both times. Re-run
`npm run digest:engines` after an engine or Playwright upgrade; the report names the versions
it ran. The nightly `cross-engine` job re-runs it as an
advisory signal (it never fails the night) and reports the first divergence.

Decision: replacing `hypot`/`atan2`/`log2` at the decision sites with `+ − × ÷ √` forms is not
motivated by this data and stays owner-gated until a divergence is measured. Limits: the
payload compares output bytes after rounding, so a 1-ulp transcendental difference that never
reaches an exact comparison is invisible by design; and Playwright WebKit on Windows is not
Safari's JavaScriptCore on Apple hardware. ([ADR 0022](adr/0022-exact-decisions-and-bounded-input.md).)

### 6.7 · `while` and reassignment removal at 2.0 — `todo`, owner decision: remove at the next MAJOR, no code before then

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
      `docs/error-codes.md` examples, `docs/agents/architecture.md`, `SKILL.md`, and a migration
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

### 6.8 · `museum-wings.arch`'s `full` layer was C1, and a double door read as obstructed — closed

`full` was C1 for two reasons: `d_east` hung on the wrong jamb (fixed earlier: `east.shell` runs
the opposite way to `west.shell`, so `hinge left` on both is the mirror pair) and `d_main` was a
single leaf on the axis. Owner decision: a mirror-image pair. `d_main` is now `d_main_w` and
`d_main_e`, two 1000 mm leaves at x=20500 and 21500 hinged on their outer jambs and meeting at a
shared closed jamb on the axis; `describe --facts symmetry` gives `full` D1 x about (21000,6000)
and `arch lint` is clean (`test/symmetry.test.ts`, with a C1 control that hangs one leaf on the
shared jamb).

(Superseded in part by 6.12: the sampler described below is no longer the detector;
`swingsCollide` now decides with the exact `sectorsObstruct` test. The contact semantics
recorded here are unchanged.)

The pair used to raise `W_SWING_OBSTRUCTED` ("0 mm short"): the swing test accepted a closed
boundary, so two quarter-discs tangent at the shared jamb collided. Owner decision: exempt
single-point contact only. `swingsCollide` (`src/geometry.ts`) keeps its sampler as the
detector and asks `sectorsObstruct` whether the contact is more than one point: a
weak-separating-axis test over the finite candidate set of the two sectors' Minkowski
difference (no separating line: the areas overlap), then, on the separating line, the length
of the overlap of the two sectors' faces (a segment only where two straight edges lie on it).
On axis-aligned whole-mm geometry both are exact (a shared jamb sums to 0, its contact has
length 0); on an oblique wall the jambs agree only to ~1e-13 mm, so both are read within
`VERTEX_EPS` (1e-6 mm, `src/geometry/polygon.ts`'s vertex-coincidence tolerance), not a new
epsilon. A shared-jamb pair (2×900, 2×1000, every axis direction, oblique walls, both swing
sides) is clear; a 1 mm overlap still warns, "1 mm short" (`test/swing.test.ts`,
`test/lint-deficits.test.ts`). Consequences, each pinned:

- Contact along a segment still warns, as before: two leaves 100 mm too close opening to
  OPPOSITE faces (the closed leaves overlap along the wall), and two leaves back to back on one
  post opening the same way. Leaves are solid, so a shared line is a clash. (On an oblique wall
  the sampler, unchanged, already missed the first of these; that is not new. Closed by 6.12.)
- With `swingClearanceMm > 0` (`accessibility-advisory`, 150), single-point contact at exactly
  `radius + clearance` is clear. A double door is ONE assembly (lead decision): the clearance
  keeps independent doors apart, not a pair's two leaves, so a shared-jamb pair
  (`isDoubleDoorPair`: the far jambs coincide, the closed leaves run away from them along one
  line, and at clearance 0 the discs meet in that point only) is clear at any clearance. Jambs
  1 mm apart are two doors and keep the clearance. `museum-wings` lints `[]` under the profile,
  as on the base, and passes `--strict`.
- `W_SWING_OBSTRUCTED` against furniture (`sectorIntersectsRect`) is unchanged: exact contact
  with a piece still warns.

Measured: the corpus sweep (every storey's SVG, `describe()`, `lint()`, `compile().diagnostics`,
the a11y profile's `lint()`, `--facts symmetry`; examples and fixtures) moved 0 of 279 payloads on
the predicate change alone. On the base corpus no plan reached the sampler's hit branch, under
either profile; on the final tree (counted by instrumenting it) only `museum-wings` does, once,
its main pair, cleared as single-point contact (and, under the profile, as a pair). So no
example lost or gained a warning, and every example's default `lint()` is byte-identical. A
brute-force cross-check against the original predicate (random pairs on axis-aligned and
oblique walls, clearance 0 and 150) finds no new collision, and every pair the change clears
has no area in common and no collinear edge overlap: single-point contact, or a double-door
pair at clearance 150. The re-measured `museum-wings` rows are explained field by field in
`test/byte-identity-baseline.ts`.

### 6.9 · `W_SWING_OBSTRUCTED`'s narrowing hint was wrong at a shortfall of 0 — closed

`narrowTo` equalled the door's own width at a shortfall of 0 mm ("Narrow the door to 1000 mm or
less" for a 1000 mm door). The formula behind it (`gap − radius − clearance`) was also wrong
in general: narrowing keeps `at`, so the hinge moves, and on a `grid` the resolver snaps the
width, so a quoted width could fail to clear. `widestClearingWidth` (`src/lint/rules/doors.ts`)
now bisects the widths the author can get (multiples of the grid; whole mm without one) for the
widest narrower leaf whose recomputed swing is clear of everything, the proof the hinge flip
already had; no such width, no hint. At 0 mm short it quotes 999 mm, at 1 mm short 998 (not
999, which still touches). The width it OFFERS is never below the narrowest door the ruleset
passes (`passableDoorWidthMm`: no `W_DOOR_CLEARANCE`, and a clear width, by
`connectorClearWidth` in `src/analyze.ts`, that no route pinches into `W_PATH_TOO_NARROW`;
760 mm by default, 960 under `accessibility-advisory`); a proved width under that is quoted
as "not a fix". Every quoted width in the shipped examples, applied to its door (in the file,
or in the imported module that wrote it), clears that door, and an offered one raises no new
warning of any kind (`test/lint-deficits.test.ts`, corpus-derived). The message's three numbers now agree
(`deficitMm`, `src/lint/measure.ts`: need rounded up, have rounded down, the shortfall their
difference), so "1999 mm apart … need 1999 mm (1 mm short)" cannot be printed. Every example's
default `lint()` is unchanged; under `accessibility-advisory` the swing hints (and one rounded
distance) of `furnished-flat`, `hillside-villa`, `imports` and `materials` move.

### 6.10 · A door's `at` snaps to the grid silently — `todo` (observation, no decision)

On `grid 100` the resolver rounds a door's `at` (`Math.round`: `src/ir.ts`,
`src/elements/door.ts`, `src/attach.ts`), so 900 mm leaves written at 20550 and 21450 resolve to
20600 and 21500: a double door's "shared jamb" lands at x=21050, 50 mm off an axis at 21000, and
nothing says so. No diagnostic reports the snap. Found via 6.8, which sidestepped it with even
1000 mm leaves; behaviour deliberately unchanged.

### 6.11 · The analysis reads a double door as two narrow doors, not one wide opening — `todo` (no code)

`describe()`'s access graph and circulation treat each leaf of a double door as its own door.
`museum-wings.arch`'s main entrance (two 1000 mm leaves, 940 mm clear each) therefore counts
as two 940 mm doorways, not one ~1940 mm opening, and every room's `bottleneckClearWidth` is now
1140 mm: the widest way in is a wing's 1200 mm exit, not the main door. A pair of leaves on a
shared jamb with both open is one opening to anyone walking through. Open: whether (and how)
the analysis should recognise a pair: shared jamb, same host, both hinged on the outer jambs.
The deferred egress facts (M.16) would settle it as a side effect: a max-flow door capacity
has to merge a pair (`isDoubleDoorPair`) before it can count one.

### 6.12 · The swing-overlap sampler missed real overlaps — closed

`swingsCollide` (`src/geometry.ts`) only ever tested nine points on each leaf's arc against the
other swing, so an overlap whose shared region held none of them was not seen. Counterexample:
A hinged at (300,300), radius 900, wedge 180°–270° (far jamb (−600,300), leaf end
(300,−600)); B hinged at the origin, radius 1000, first quadrant. They share the square
[0,300]², about 90,000 mm², and the sampler said clear. It also missed segment contact on an
oblique wall. Found by red-team review of 6.8.

Decision (owner-approved): decide with the exact test. After the hinge-gap reject and the double-door
check, `swingsCollide` now asks `sectorsObstruct` on both clearance pairings, with no sampling.
`sectorsObstruct` was NOT exact on its own, which the sampler had masked: it stopped at the
first candidate axis with a support sum `<= VERTEX_EPS`, a separating GAP included, and then
measured the two faces' overlap along the line without asking whether they were on the same
line, so two leaves opening away from each other with parallel facing edges "touched" (the
eval golden `sized-wet-room`'s `d_live`/`d_bed`, 1500 mm apart). Now a gap answers clear and
the contact length counts only collinear faces. Single-point contact stays clear and segment
contact a clash (6.8 unchanged).

The narrowing hint's bisection (`widestClearingWidth`) needs being clear to be monotone in
the width. The geometry is (a narrower leaf, and its clearance-grown disc, nest inside the
wider one's); the double-door exemption is not: a narrowed leaf whose far jamb lands exactly
on a THIRD door's latch is a pair at that one width, clear under a clearance while every width
around it collides, and the bisection could quote it ("500 mm or less" with 201–499 colliding;
the same on the old predicate). The narrowing probes now read the leaf as an independent door
(`swingsCollideAsIndependent`); the flip probe and the warning keep the exemption.

What this does NOT make monotone: the bisection's furniture probe. A narrowed leaf is also
tested against furniture with `sectorIntersectsRect` (`src/lint/rules/doors.ts`), a
conservative heuristic that is not proven monotone in the width. The hint is provably monotone
against other swings only; read this closure as "the swing check is exact", not "the narrowing
hint is provably monotone".

Measured: an instrumented sweep (examples with `lib`, fixtures, recovery corpus, eval goldens
and fidelity plans; every door pair, every hinge flip and every narrowing width, at
clearance 0 and 150) found no probe where the sampler and the exact test disagree, and the
P-sweep (SVG, `describe()`, `lint()`, diagnostics, `accessibility-advisory` lint) moved 0 of
84 rows. `test/swing-exact.test.ts` pins the counterexample, the gap family, the superset law
against the frozen old predicate (`test/swing-predicate-v1.ts`), an independent polygon-clipping
oracle and the bisection against every width.

---

## Found in the robustness programme ([ADR 0022](adr/0022-exact-decisions-and-bounded-input.md))

Defects, limits and deferred capabilities the numbers/parser/predicates/multi-storey work turned
up and deliberately did not widen into. Each says what was re-run for this entry; where nothing
was, it says so and names where the observation came from.

### M.1 · Absurd finite magnitudes: a modelling range, and what still runs away — `todo` (owner decision)

The number domain is now closed (`E_NON_FINITE`) and huge coordinates no longer crash the spatial
index, but a finite value far beyond any building can still exhaust memory or print a non-number.
Proposal for the owner: a catalogued modelling range of 2²⁵ mm (~33.5 km), the bound under which
ADR 0020 measured plain-double `orient2d` exact (6.5), checked once at resolve. Re-run on the
integration tip: a `stair … size 1000000000000x3000` compiles in `describe`/`lint` but `arch
compile` runs out of heap (the stair's `treadCount` drives a loop in
`src/elements/vertical-glyphs.ts`); a `dim (1e308,0)->(1e308,1e308)` (written out in digits)
prints `Infinity` into the SVG with no diagnostic. Not reproduced any more on the tip, so not
part of this item: a wall to `(1e308,0)`, and a door `1e308` wide (on a 10 m wall) or `1e307`
wide (on that huge wall), which a tree earlier in the round hung or exhausted memory on, now
`describe`, `lint` and `compile` in about 0.15 s each. (A door wider than its wall raises no
diagnostic, a 20000 mm door on a 10000 mm wall included, on `main` too. That is V.3, filed
`won't fix` with the view, although the plan drawing has it as well and will keep it after the
view is removed.) Also not audited at huge magnitudes: arc and curve segment counts, hatch and
pattern line counts, dimension tick counts, the label lattice, `W_SCALE_OVERFLOW`; and the
symmetry report's roof case (a `roof overhang` at 1e306 did not throw when probed).

### M.2 · A global step budget for element-free nested loops — `todo`

`E_ELEMENT_LIMIT` bounds what a plan creates, `E_WHILE_LIMIT` one loop's iterations, and the
stack budget nesting; nothing bounds TIME spent in loops that create nothing. Re-run:
`for i in 0..100000 { for j in 0..1000 { let x = i } }` was still running after 25 s (killed;
the original report measured over 180 s with no diagnostic). Nested `while`s multiply their
10,000-iteration caps the same way, and the per-storey element cap makes time linear in the
number of levels (24 capped levels took about 219 s in the original report; not re-run). Wants
one evaluation-step budget across the whole resolution, as a catalogued error.

### M.3 · The doorway carve's inward walk steps through eroded cells — `todo`

A carve's far-seed stamp (E.10's open question) can land several cells from its door, because
the inward walk (`walkInward`, `src/analyze/circulation.ts`) passes through eroded cells, here a
stair footprint. On `hillside-villa` level 2 that stamps `d_en2_corr`'s 640 mm onto one cell of
the passage under the flight, (4950, 4050), and caps the Master Suite at 640 where the passage
reads 700; it is one of that storey's six `W_PATH_TOO_NARROW`. Re-run: `r_master` walk 9900,
bottleneck 640, detour 1.81. The narrow fix (stamp only cells that were not free) was measured
and rejected: it also moves `eval/fidelity-plans/min-bedroom-flat.laundered.arch`'s first route
(`r_bed` → `r_bath`) bottleneck 740 → 14000, the open-room value, because there the far-seed
stamp is the door's only width on the route (re-run: 740 today). A proper fix must keep a
far-seed width wherever it is a route's only door width. Without the artefact hillside's count
stays nine: the Master Suite's route to its ensuite passes the real 700 mm `d_enm` (stated in
the source comment; not planted away to prove it).

### M.4 · Shaft-reached storeys: what the first cut leaves out — `todo`

Circulation now walks a storey reached only by a stair, lift or escalator from the run a
person arrives by (ADR 0008's addendum). Left out, each re-run unless noted:

- `--overlay circulation` draws nothing there (`computeCirculationOverlay` gets no arrivals and
  the overlay path has no building context). Re-run: `hillside-villa` level 2's overlay SVG is
  byte-identical to the plain drawing; level 1's is not.
- Direction of travel is not modelled: `dir` is a per-storey drawing convention, so an escalator
  PAIR (one up, one down) seeds the upper storey at both cars. Re-run on a two-storey probe:
  the upper room is walked from `e_dn`.
- A landing with no walkable cell in front of it seeds nothing; its rooms read `unreachable`
  (head against the shell) or `no_threshold` (a covered landing on a door-less storey). A
  distinct reason would be a schema change (documented in `docs/analysis.md`, pinned by
  `test/shaft-circulation.test.ts`).
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

### M.5 · The equivariance oracle does not cover multi-storey plans — `todo`

The corpus suite places every shipped example with no `level` block
(`test/equivariance-corpus.test.ts`, "the corpus is COMPUTED: every shipped example with no
`level` block"), so `hillside-villa`, `townhouse`, `two-storey` and the other `level` plans,
including the new shaft-walked storeys, have no oracle coverage. Re-run: read the test's filter.

### M.6 · Load-sensitive visual and sheet tests — `todo`

`test/visual.test.ts` and `test/sheet.test.ts` hit vitest's 5 s per-test budget under heavy
machine load and pass alone: the same shape as 4.10, and the same options apply (an explicit
timeout on the heavy cases, never a raised global `testTimeout`). Observed during this
programme's gate runs; not reproduced on purpose here.

### M.7 · `diffPlans` follow-ups — `todo`

An insertion plus a newly authored `id=` in the same edit still pairs the wrong rooms: before,
auto "Hall"; after, auto "Kitchen" plus `id=hall` "Hall". Re-run: the summary reads
`Relabeled room_1 to "Kitchen"`, `Added Hall`. Fixing it needs the unique-label match to run
before the id pass whether or not the id is authored, keeping the rule symmetric (antisymmetry
law). Still silent (from the card's report, not re-run): an entrance added or removed
(`circulation` null on one side), and a room blocked on both sides with a different
`widestWayInMm`. There is no `arch diff` command.

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

### M.10 · Catalogue order follows the host's collation — `todo`

`ERROR_CODES` (`src/error-catalog.ts`) sorts with `localeCompare`, which follows the host's ICU
collation, not code-unit order; it feeds `docs/error-codes.md`, `llms-full.txt` and `arch
manifest --json`. Re-run on one host whose default locale is `zh-CN`: `ERROR_CODES` and the
same severity-grouped sort by code units differ at 15 of 149 positions (ICU puts
`E_INTENT_NO_DOOR` before `E_INTENT_NOT_ADJACENT`, code units the reverse), so a host with
another default collation could reorder a generated file. `dataset/dedup.ts` and
`dataset/generate.ts` sort with `localeCompare` too. A plain `<` comparison would move the
generated order once.

### M.11 · LSP rename misses an assignment target — `todo`

`rename` (`src/lsp.ts`) collects references from expressions and instance names, not the name
on the left of `NAME = expr`. Re-run: renaming `x` to `y` in `let x = 1`, `x = x + 1`,
`room at (x,0) …` gives `let y = 1`, `x = y + 1`, `room at (y,0) …`. Low priority:
reassignment is deprecated and removed at 2.0 (6.7).

### M.12 · `detourRatio` divides a 4-connected walk by a straight line — `todo` (observation, no decision)

The walk is measured on the 4-connected nav grid (an L1-like length) and divided by the
Euclidean line, so a direct diagonal walk reads about √2. Re-run: an empty 8 m × 8 m room
entered by a door at x = 700 reports walk 7000, detour 1.41. Harmless at the default
`maxDetourRatio` of 3, misleading for a tight one. Related: C.3.

### M.13 · A polygon room's occupancy seed breaks ties in page order — `todo`

`src/analyze/occupancy.ts` seeds a polygon room's doorway at the nearest free cell with ties
broken row-major (its own comment says so), the page-order tie the nav grid gave up in E.6–E.10.
Code read only; no flipped fact has been reproduced, and the occupancy grid is not in the
equivariance oracle's comparison.

### M.14 · A roof's acute corner is mitred without bound — `todo` (policy, no decision)

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
- `relocateLabels` is quadratic in co-located rooms (about 11 s at 5,000 identical rooms, from
  the card's report); a fix would allow raising `MAX_ELEMENTS`. `E_ELEMENT_LIMIT`'s catalogue
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

### M.16 · Deferred capabilities — `deferred` (each needs a consumer)

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

### 5.2 · A polygonal `void` — `todo`

`void … size WxH` is rectangle-only in v1. A ring form needs the machinery `room polygon` already
has, and **every consumer here is written on a rectangle**: the nav-grid obstacle, the poly-aware
room attribution, and `frame.ts`'s `transformElement`. Cheap to add to the grammar, not cheap to
add to those three.

### 5.3 · Area subtraction under a `void` — `todo`

A void deliberately does **not** reduce its room's area today; `describe --json`'s `voids[]` gives
the extent so a consumer can subtract. That decision is *pinned* by `test/void.test.ts`, so
changing it is an argument with a test rather than an oversight — which is the point. Before
reopening it, decide what a subtracted area means to `schedule rooms`, to the room label's `m²`
text, and to an intent's area assertion, because those three are what would silently disagree.

### 5.5 · A syntax for overhead dashes — `todo` (the CONVENTION is settled; the syntax is not)

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

### A.4 · The sheet's own text is unowned — `todo` (may be CORRECT as it stands)

The title block, the room schedule, the legend, the north arrow and the scale bar are `<text>` with
no `data-arch-id`: neither named nor hidden. In ordinary browse mode that is **right** — they read
as the drawing's printed matter, which is what they are, and a schedule read linearly is genuinely
useful. It only breaks inside a consumer's `role="application"` scope, where a reader stops
browsing and nothing reaches them.

So this may need no compiler change at all, and the entry exists to stop the next agent from
"fixing" it by hiding the schedule. If anything is owed upstream it is a document structure the
scope can expose — the tables are already built in one place (`sheet-tables.ts`) — not an
`aria-hidden`.

### A.5 · NVDA browse mode drops an SVG `role="button"`'s name — `todo` (NOT OURS; file upstream)

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

## Site chrome (found while fixing the nav overflow, 2026-09-20)

### N.1 · The nav row needs 1152px, and the hamburger persists until then — `todo` (a WANT, not a bug)

**The defect is fixed; this entry is the better answer that was deliberately not taken.** Nothing is
broken at any width today — `docs-site/e2e/page-chrome.spec.ts` ("the nav bar fits the viewport")
asserts zero page overflow AND zero last-item overhang on `/` and `/guide` across 768 → 1152. Do not
treat N.1 as a red.

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

### A.1 · VitePress sidebar section headers promise button behaviour they do not keep — `todo`

5 × **SC 2.1.1 Keyboard (Level A)**. `#VPSidebarNav … div.item` carries `role="button"` and
`tabindex="0"` but activates on neither Enter nor Space, so a keyboard user can focus a collapsible
section and not collapse it. Upstream `VPSidebarItem.vue` (`data-v-b3fd67f8`), not our theme — the
fix means shadowing the component or adding a keydown handler, so it wants its own change. Real,
and live.

### A.2 · Playground — three pre-existing violations — `todo`

`scrollable-region-focusable` ×2 (SC 2.1.1) on two scrollable panes with no keyboard access;
`focus-not-visible` (SC 2.4.7) on CodeMirror's `.cm-content`; `reflow-horizontal-scroll`
(SC 1.4.10) on `header > .tb-cell:nth-of-type(2)` at 320 px. That header cell is the View select —
nothing this batch touched. The CodeMirror one is upstream CM6.

### A.3 · Do NOT re-report these two — they are measurement artifacts

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

### 4.7 · The MCP registry publish races npm — `todo` (RE-OPENED 2026-09-04)

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
The sweep line and the exact axis-aligned split shortcut remain open.

**Phase profile of `joinWalls`** (measured with temporary instrumentation, since reverted):

| plan | split | classify | index | chain | keys |
|---|---|---|---|---|---|
| OPENING_HEAVY | 61.5 ms | 29.1 | 17.0 | 16.7 | 9.6 |
| `library` | 5.4 ms | 3.2 | 1.6 | 1.1 | 0.9 |

Split is the largest phase at ~45% of the pass, so halving it recovers about 11% of `toScene`.
There is no single hot spot to delete.

**The constraint, and it is the whole point of the item.** Any fix must stay **INSIDE the one
algorithm**. Legitimate directions: an exact axis-aligned shortcut within the split phase (a
horizontal/vertical pair needs no general line–line solve), a sweep line instead of the
grid-bucketed pair scan, fewer allocations per group, a cheaper `undirectedKey`. **Never a second
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

### Not scheduled — recorded so they are not lost

- **`arc` edge inside a `room polygon` ring.** Was promised in a shipped error message "for v1.25";
  v1.25 shipped without it and the promise has been retracted to point here. Genuinely large: the
  ring's whole analysis layer — effective-vertex count, self-intersection, centroid, adjacency,
  occupancy and nav grids, the `dims auto` vertex chain — is written on literal vertices and must
  learn arcs. Build it on its own merits, not to honour a version number.
- **P2-4** addressable structural grid · **P2-5** measured-vs-drawn edge separation ·
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

### Settled — never re-propose

`T3` (the diagnostic-loop live experiment) is **permanently declined**; `T6` (area-syntax sugar) is
**parked** behind the frozen G2 reversal triggers. See `docs/agents/iron-laws.md` before touching
either.
