# Backlog

Forward-looking work queue. **`CHANGELOG.md` remains the only record of what shipped** — this file
records what has not, and is deleted from as items land.

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

---

## Wave 2 — coverage where a wrong sign ships silently

### 2.1 · Kill the PNG vacuous pass — `todo`

All three `src/backends/png.ts` tests open with `if (!(await hasResvg())) return;`, so when resvg is
absent they report **passing having asserted nothing**. `docs/testing.md` states the rule this
breaks, and `test/visual.test.ts` already implements it correctly with
`const RESVG_REQUIRED = !!process.env.CI`.

- **Files:** `test/png.test.ts`, pattern from `test/visual.test.ts`
- **Gate:** hard-fails in CI when resvg is missing; skips *visibly* locally. Prove the guard is not
  vacuous by forcing the missing-dep path.

### 2.2 · `test/lint-measure.test.ts` — `todo`

`src/lint/measure.ts`'s five pure numeric functions (`distPointToRect`, `approachGapMm`,
`frontGapMm`, `shortfall`, `mm`) have zero direct coverage — no test imports the module. They are
consumed by `src/lint/rules/{doors,furniture,circulation-facts}.ts` and are exactly the
sign/boundary/rounding code that decides whether a plan reports "clean". Highest value per line in
the repo, and trivially property-testable because the inputs are pure numbers.

- **Gate:** unit + `fast-check` property coverage of boundaries, signs and rounding.

### 2.3 · `test/frame.test.ts` — `todo`

`src/frame.ts` (367 LOC — the exact-isometry layer behind `level` and `place`) is imported only by
`src/ir.ts` and is never called directly by any test. A wrong sign here produces a plausible-looking
but wrong drawing that no golden pins.

- **Cover:** `composeFrame`, `inverse`, `det`, `isIdentity`, `tp`, `transformRect`, `transformDeg`,
  `nsId`, `transformElement`
- **Gate:** `compose ∘ inverse = identity` round-trip property; `nsId` collision test; the `det < 0`
  handedness flip asserted directly rather than through a snapshot.

### 2.4 · A grammar-aware `fast-check` arbitrary — `todo`

The flagship determinism property in `test/fuzz.test.ts` feeds `fc.string()` into a plan body, so
almost every generated case is a parse error with `svg === ""` — it is near-vacuous for the
*rendering* path. One arbitrary that emits **valid** plans makes it real and unlocks property
versions of laws currently pinned only by hand-written fixture pairs.

- **New:** `test/arbitrary-plan.ts`
- **Then upgrade:** determinism over rendering plans; the byte-identity laws (generate a
  feature-free plan, assert invariance under adding an unrelated block); cache transparency
  (`compile(s) === compile(s, {noCache:true})`); round-trips (`format∘parse` idempotence,
  `repair∘repair`, `applyFixes` convergence)
- **Gate:** existing example tests unchanged; the new properties fail when a determinism bug is
  planted.

### 2.5 · CLI commands that no test invokes — `todo`

`arch watch`, `arch fmt` and `arch manifest` have zero end-to-end execution (`format.test.ts` tests
the library `format()`; `cli-manifest.test.ts` tests `buildManifest()`, not the command). Worse,
`src/cli/serialize.ts`'s `runPool`, `aggregateExit` and `perFileJson` — the concurrency and
exit-code aggregation behind `arch batch` — have **zero references anywhere in the test suite**.
Exit codes are the agent contract, so a wrong one would ship silently.

- **Gate:** each command invoked end-to-end; batch aggregation asserted against the documented
  `0` ok / `1` IO-internal / `2` user-source / `3` bad-usage.

### 2.6 · PDF backend — `todo`

`src/export/pdf.ts` is 294 LOC behind 4 assertions, 3 of them optional-dep-gated. No determinism
check on a *published* output format, and no coverage of multi-page/`level`, the sheet frame, the
title block, themes or hatches.

- **Gate:** byte-identity across two renders; multi-page fan-out; the optional-dep skip must be
  visible and must fail in CI (same rule as 2.1).

### 2.7 · Advisory 0%-coverage reporter — `todo`

`vitest.config.ts` sets `all: true` with **no thresholds** (deliberate — "nobody games a
percentage"), so a module falling to zero coverage is invisible. Flag `src/` files at 0% in the
Node-22 CI step summary. **Advisory only, never gating** — that keeps the deliberate choice intact
while making the silence visible.

---

## Wave 3 — hygiene, freshness, and the missing example

### 3.1 · Nightly dependency audit red (issue #66) — `todo`

All six advisories trace to exactly two roots: `@modelcontextprotocol/sdk@1.29.0`
(→ `@hono/node-server`, `hono`, `fast-uri` via `ajv`, `ip-address` via `express-rate-limit`) and
`jspdf@4.2.1 → dompurify@3.4.11` in the playground. Both are dependency bumps.

The shim is **stdio-only**, so the hono and rate-limit code paths are unreachable at runtime —
record that in the issue rather than implying exposure. A shim bump also means the pack-time
resource law applies: version in `packages/mcp/package.json` **and both** `server.json` fields.

### 3.2 · Nine stale dependabot PRs — `todo`

Oldest is 2026-07-20. Batch the safe ones (`actions/checkout`, `actions/setup-node`,
`github/codeql-action` ×2, `@fontsource/ibm-plex-mono`). Review separately, each on its own:
**zod 3→4** (#27), **vite 6→8** (#26), and `@types/node` 22→26 (#28) — the last interacts with
`noUncheckedIndexedAccess` across every leg of `typecheck:all`.

### 3.3 · Prose contradicting the shipped state — `todo`

- `docs/research/2026-08-06-competitor-borrowing-roadmap.md` §9 says P2-1 and P2-3 are "not built"
  and that two commits "sit on unmerged worktree branches". All four claims are false post-v1.25.0.
- `docs/research/2026-08-06-p2-3-site-orientation-design.md` still reads `good_sun` throughout its
  body, under a §10b that **rejected** that name (shipped as `equator_side`).
- `docs/adr/0009-ai-first-context-and-distribution.md:67` still says "MCP remains deferred" —
  superseded by ADR 0012 and a shipped `@chanmeng666/archlang-mcp@0.2.4`.

Docs-only. Stamp the state, do not rewrite the history.

### 3.4 · A `site`-bearing flagship example — `todo`

**Zero** of the 18 shipped `.arch` examples use `site`, `pocket`, `slide`, `hemisphere` or `street`.
The gallery ships inside the npm tarball and drives the docs site, so the newest language surface is
invisible to readers *and* to models — which learn far more from worked examples than from grammar
lines. Also closes a deferral named in the P2-3 design doc.

- **Gate:** lint-clean; adds a golden and a visual snapshot; a corpus entry in the executable-spec
  gate; `docs:build` and `e2e:docs`.

---

## Wave 4 — P2 language features

Designed and evidenced in `docs/research/2026-08-06-competitor-borrowing-roadmap.md` §5. Each one
**adds tokens**, so each needs: its own design pass, full `gen:*` regeneration, closed value sets
**interpolated from the source of truth, never retyped into a generator**, a byte-identity law
pinned by test ("a plan that does not use it renders, describes and lints exactly as before",
proven by a SHA-256 sweep over the shipped examples), and a corpus entry in the executable-spec gate.

| # | Feature | Status | Note |
|---|---|---|---|
| P2-7 | Four-sided authorable clearances + embedded-insert exemption | `todo` | Most contained — widens `clearanceMm` (`src/fixtures-catalog.ts:21`) to `{front,back,left,right}` plus a per-statement override |
| P2-10 | Feet-and-inches display formatting (`dimension_units standard`) | `todo` | **Display only** — millimetres stay the internal unit and the measured truth. Route through `fmt()` |
| P2-9 | `outdoor <kind>` + floor-material hatches + auto legend | `todo` | Hatches must be **scale-aware**; do not copy `patternUnits="userSpaceOnUse"` with fixed pixel sizes, which does not scale with drawing scale |
| P2-8 | Targeted dimension selection (dimensions on named walls/fixtures) | `todo` | Composes with the sheet layer |
| P2-2 | Room-relative door hand | `todo` | **Behaviour change for every plan with a reversed wall — must be staged.** (a) an advisory `W_*` naming the doors whose hand would move, zero geometry change; (b) the flip behind a release boundary, goldens re-blessed after review. Check the `place … mirror` goldens specifically: `frame.ts`'s `det < 0` handedness flip must compose with the new rule, not fight it |

### Not scheduled — recorded so they are not lost

- **`arc` edge inside a `room polygon` ring.** Was promised in a shipped error message "for v1.25";
  v1.25 shipped without it and the promise has been retracted to point here. Genuinely large: the
  ring's whole analysis layer — effective-vertex count, self-intersection, centroid, adjacency,
  occupancy and nav grids, the `dims auto` vertex chain — is written on literal vertices and must
  learn arcs. Build it on its own merits, not to honour a version number.
- **P2-4** addressable structural grid · **P2-5** measured-vs-drawn edge separation ·
  **P2-6** multi-flight stairs — each needs its own design pass.
- **All of P3** (IFC4 export, occupancy-grid export, 3D axonometric, `arch vary`, `--why`,
  anchor-relative coordinates) — each is a project, not a task. P3-2 is **blocked** on element
  heights and opening sill/head heights, which the language does not have.
- **P3-7 arbitrary rotation** is deliberately NOT built; the trade-off is recorded in the roadmap.
  Any future design must first answer what the handed rules (`hinge left`,
  `against wall … side left`, `anchor top-left`, `right-of`) mean at non-axis angles, plus grid snap
  and `fmt()` stability.

### Settled — never re-propose

`T3` (the diagnostic-loop live experiment) is **permanently declined**; `T6` (area-syntax sugar) is
**parked** behind the frozen reversal triggers in `docs/research/2026-07-g2-verdict.md`. See
AGENTS.md → "Standing decisions & iron laws" before touching either.
