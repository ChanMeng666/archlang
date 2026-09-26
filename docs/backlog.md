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

### G.5 · Circulation measures every walk from `entrances[0]` only — `todo` (the repair half is done)

**Still open (deliberately, and it is now 16 rooms not 12):** `computeCirculation` measures every walk
from `entrances[0]` only. That needs somebody to decide what a multi-dwelling sheet means — a
per-entrance model, or nearest-entrance-per-room — before a line of code is written. Those 16 are
reported as `other_entrance` rather than silently dropped, so the gap is now visible rather than
invisible.

### G.10 · Plan JSON carries a frame's ROTATION but not its REFLECTION — `todo` (tripwire ARMED)

`planToJson` projects the rotation a `place` frame imposes on a fixture and not the reflection.
Before item 5.4 that lost nothing — a mirrored symbol drew identically to its twin — but 5.4 made
**19 of the 83 catalogued families genuinely handed**, so the projection now drops a fact the drawing
depends on. Measured: a plain and a `mirror x` placed `desk` produce payloads differing **only in
`x`**.

**Still unreachable, and therefore still `todo`.** A plan containing `place` never round-trips at
all: `planFromJson` refuses a namespaced id with `E_DOTTED_DECL` (×3 on the minimal fixture). The two
defects mask each other and no fixture can reach the projection bug.

**The tripwire is now armed** (`test/plan-json.test.ts`, "G.10 tripwire"), which is the part of this
entry that has been actioned. Two assertions pin the CURRENT, WRONG state on purpose, each carrying
the sentence that says what its failure means:

1. the two payloads are equal once position is stripped — **fails when the projection learns to carry
   the reflection**;
2. the round-trip is refused with `E_DOTTED_DECL` — **fails when a placed plan starts round-tripping**.

So whoever fixes `E_DOTTED_DECL` lands on a **red test that names this work**, instead of un-masking
the defect silently with no witness but a symbol drawn the wrong way round on someone else's plan.
Do not "fix" that suite by deleting the block; invert it into the real round-trip assertion.

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
