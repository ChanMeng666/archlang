# Backlog

Forward-looking work queue. **`CHANGELOG.md` remains the only record of what shipped** — this file
records what has not, and is deleted from as items land. Item numbers are stable identifiers, so a
gap in the sequence means that item shipped; the commit that closed it is cited by whatever
referenced it.

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

_All items landed._

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

### 3.14 · A worktree build silently bundles the WRONG core — `todo`

**A release hazard that defeats a guard added the same day.** Running `npm run vscode:build:only`
from inside a `.claude/worktrees/*` checkout resolves `@chanmeng666/archlang` by walking **up** the
directory chain to the **shared** repo's `node_modules`, because a worktree has no `node_modules` of
its own. So esbuild bundles the shared checkout's core, not the worktree's.

Observed live: an agent's `dist/server.js` carried the pre-fix 1-argument `dimSwapFix` while its own
`dist/chunk-*.js` had the 2-argument one.

**The `__CORE_VERSION__` freshness test cannot catch it** — both cores stamp the same version, so it
passes. That test asserts the bundle is not stale *in version*; nothing asserts it came from *this
checkout*. An agent running `npm run package` from a worktree would ship a stale language with an
entirely green bundle-freshness check, which is precisely the shape of failure the stamp was added
to prevent.

- **Cheap mitigation, do this first:** state in `.claude/commands/release-check.md` and AGENTS.md
  that packaging happens in the **primary checkout only**, never a worktree.
- **Real fix:** have the bundle stamp something checkout-identifying (the resolved core's absolute
  path, or a content hash of `dist/index.js`) and assert it matches the building tree.
- **Gate:** prove it by building from a worktree with a deliberately divergent core and watching the
  new assertion fail where the version stamp passes.

### 3.11 · `repair(repair(s)) !== repair(s)` — `todo`

Over 400 generated plans: 138 already at a fixpoint, 194 need one more call, and **47 never reach
one** — a fixture ping-pongs between two positions with period 2. So which arrangement you ship
depends on how many times you happened to run `arch repair`.

`repair`'s header documents a *bounded* internal fixpoint that "keeps the pass's own advice" when it
runs out, so a second call continuing is arguable — but a stable 2-cycle across calls is not.
Deliberately **not** asserted either way: pinning `.not.toBe` would cement the defect.

### 3.12 · `flush` and `grid` fight — `todo`

A fixture placed `flush` against a 100 mm partition lands on a `…50` coordinate; `grid 100` then
snaps it back **into** the wall and raises `W_FURNITURE_WALL_COLLISION` on a plan that is correct.
`flush` exists precisely so nobody has to write the half-thickness, and the grid undoes it.

`examples/bungalow.arch` works around it with `grid 50` and says why. The real fix is either a
snap-aware `flush` or a diagnostic that names the grid as the cause rather than blaming the
fixture.

### 3.13 · `SKILL.md` never mentions `site` or the door kinds — `todo`

The agent Skill — the loop a cold-start model follows — documents neither the v1.25 orientation
layer nor the four non-default door kinds. `examples/bungalow.arch` now demonstrates both, but
there is nowhere in `SKILL.md` to reference it from.

Note the constraint before starting: `SKILL.md` feeds `gen:llms`, and `spec.llm.md` sits at
**24,940 of 25,000 characters** — 60 to spare. Any addition needs its budget worked out first.

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
