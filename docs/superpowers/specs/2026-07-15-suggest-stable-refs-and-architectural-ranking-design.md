# Design: stable-ref-only suggest candidates + architectural ranking for private rooms (v1.18.0)

**Date:** 2026-07-15 · **Status:** approved by owner · **Origin:** downstream feedback from ArchCanvas, which has now adopted `suggestTopology` as the driver of its production topology fixer (persisting a chosen candidate's `insertText` back into `.arch` source). A spike against real generated plans surfaced two upstream defects.

## Problem

ArchCanvas stopped carrying its own topology heuristics and made `arch suggest` the single source of candidate openings — it takes a candidate's `insertText`, writes it into the project's `.arch`, and keeps it. Persisting the string (rather than applying-and-discarding) is what exposed both bugs:

1. **A candidate could name a wall by a re-bindable positional id.** `suggestTopology` composed every `insertText` as `<door|window> on <wall.id> at <pct>%`. When the host wall had no author-declared id, `wall.id` was the *positional* auto-id `assignIds` hands out per category (`partition_3` = "the third partition, counting in source order"). That reference is only valid against the exact plan it was computed from: insert an earlier same-category wall and every later index shifts, so a persisted `door on partition_3` silently re-binds to a *different* wall. The corruption is **uncatchable by `compileClean`** — the re-bound plan still compiles, still lints clean, just describes a door in the wrong place. A fixer that persists suggestions cannot detect it at all.
2. **Geometric ranking handed private bedrooms a street door.** For `W_ROOM_UNREACHABLE`, candidates were ordered purely by longest-free-run length (`orderCandidates`). On real plans that routinely put a brand-new *exterior* door — a door straight to the street — at the top of the list for an unreachable **bedroom**, ahead of the interior door that would reconnect it to the circulation it was cut off from. The geometrically-longest run is not the architecturally-right one for a private room: the fix for a stranded bedroom is almost always to reconnect it inward, not to punch a new outside entrance into it.

Both are proven downstream and belong upstream as corrections to the *data* `suggest` emits (never as applied edits — ADR 0005).

## Workstream A — stable-ref-only emission (code)

### The three-tier stable-ref rule

Every candidate, across all four builders (entrance, unreachable-room, bedroom-window, bath-via-bedroom), now composes its placement via one helper, `composeOpening`, as the **first available** of:

1. **Author-declared id** → `on <wall.id>`. The author named the wall; that name is stable across any later edit.
2. **Unique wall category** → `on <wall.category>`, valid **iff exactly one wall in the plan carries that category**. A bare category is a legal host ref, and if it is unique it can never be ambiguous.
3. **Absolute coordinates** → `at (x, y)`. Names no wall at all; the compiler's nearest-wall hosting binds the intended wall on paste. Safe because a candidate sits at a run *midpoint*, far from any corner, so nearest-wall detection is unambiguous.

A positional auto-id (`partition_3`) is **never** emitted — it is precisely the form that re-binds. The distinction requires knowing, at suggest time, whether a resolved wall's id was authored or assigned; the resolver already knew this in `assignIds` but discarded it, so `RWall` now carries an internal `_idAuthored` marker (set in `resolve` from `Entry.idAuthored`, `_`-prefixed so it is never serialized into the Scene or any export). This is the whole of the internal surface change.

The public `Suggestion` / `SuggestionCandidate` types are **unchanged**. Only the string a candidate carries changes (and, for one fault, candidate order — see Workstream B).

## Workstream B — architectural ranking for private unreachable rooms (code)

For `W_ROOM_UNREACHABLE`, candidates now split into two groups by what they do:

- **interior** — reconnect the room to a neighbour that already reaches the entrance;
- **exterior** — cut a brand-new outside door.

For a **private** room — `isBedroom(room) || isWetRoom(room)` — interior candidates rank **above** exterior ones regardless of run length; within each group the existing longest-free-run order is kept. A **non-private** room keeps the pure geometric order across both groups, exactly as before.

### Ranking scope — why the other faults were left alone

The reordering is deliberately confined to `W_ROOM_UNREACHABLE` on private rooms. Each other builder was examined and left unchanged, for a reason:

- **`W_NO_ENTRANCE`** — exterior-first by design. The fault *is* "no way in from outside"; an interior door cannot resolve it. Reordering toward interior would be wrong.
- **`W_BATH_VIA_BEDROOM`** — already interior-preferred. Its builder already sorts a neighbour-reconnection (a route that avoids the bedroom) ahead of an exterior fallback; nothing to change.
- **`W_BEDROOM_NO_WINDOW`** — exterior-only by nature. A window must sit on an exterior wall to give light and egress, so there is no interior/exterior split to order.

So the change touches exactly the one fault where a geometric top pick was architecturally wrong, and only for the room class (private) where reconnecting inward is the correct instinct.

## The no-option-flag decision

Both behaviours ship **unconditionally** — no opt-in flag, no `SuggestOptions` field. Per [ADR 0005](../../adr/0005-facts-and-lint-not-an-architect.md) suggestions are deterministic *data*: there is one correct set of candidates for a plan, not a menu of policies. A positional id is never *more* correct than a stable ref, and an interior reconnection for a stranded bedroom is never *less* architecturally sound than a new street door. The new behaviour is strictly more correct on both axes, so a flag would only offer a way to ask for the old, worse output. There is nothing to gate.

## Reversal of a v1.16 non-goal

This round **explicitly reverses** a non-goal from the v1.16 design record ([`2026-07-14-sugar-examples-and-suggest-extension-design.md`](2026-07-14-sugar-examples-and-suggest-extension-design.md)), which stated:

> No change to existing candidate ordering or the exterior-vs-neighbour preference of `W_ROOM_UNREACHABLE` (pinned goldens).

That non-goal was correct **for its round** — v1.16 was adding two new fault kinds and being furniture-aware, and freezing the existing ordering kept that change surgical and its goldens byte-stable. It was never a permanent commitment (unlike a Standing Decision / iron law); it was scope discipline for one round. The downstream ArchCanvas adoption spike then produced the evidence that the frozen ordering was itself a defect for private rooms. Reopening it here is a deliberate, evidence-driven decision, not an oversight — and it is recorded as a reversal precisely so the two design records don't read as contradicting each other by accident.

## The flipped golden

`test/suggest.test.ts` gains fixtures and assertions that pin the new behaviour and would fail against the old:

- `UNIQUE_CAT` — walls with no author ids but unique categories → candidates reference the bare category (`door on partition …`, `window on exterior …`), never `partition_1`. A `noPositionalId` helper asserts no candidate matches `on \w+_\d+`.
- `MULTI_PART` — two undeclared partitions make `partition` non-unique, so the bedroom's interior host is neither id-nameable nor category-unique → the candidate falls back to absolute `door at (5000, 2500) …`, and a round-trip confirms nearest-wall hosting binds the intended wall with no `W_DOOR_OFF_WALL`.
- `NON_PRIVATE` — an unreachable non-private `store` keeps the pure geometric order (its longer exterior run outranks the shorter shared partition), pinning that the interior-first rule is private-room-only.
- The private-room reordering is asserted directly: for a private bedroom the interior partition candidate is `candidates[0]`.

The prior expectation — that the top `W_ROOM_UNREACHABLE` candidate for a private room is its longest run irrespective of interior/exterior — is the golden this round flips.

## Doc surface

- **Generated agent context** (`spec.llm.md`, `llms-full.txt`) regenerated from `scripts/gen-llm-spec.ts`, whose "Fix topology from facts" paragraph now states candidates use a stable ref or absolute coordinates, never a re-bindable positional auto-id.
- **`SKILL.md`** `arch suggest` bullet: same correction, hand-maintained.
- **`packages/mcp/README.md`** `suggest` row and the `cmdSuggest` / `suggestTopology` module docs: the stale "attachment form" phrasing replaced with the stable-ref description. (The MCP *tool description* in `server.ts` / `server.json` is intentionally left for a future `packages/mcp` version bump — an unbumped edit never reaches the registry, per the packages/mcp iron law.)
- **Doc-truth gate** (`test/docs-flags.test.ts`): a second `describe` block extends the v1.17 prose gate so no hand-maintained doc can show a suggest candidate that names a wall by a positional auto-id (`on \w+_\d+`), mirroring the code golden's idiom.

## Non-goals

- No auto-application of suggestions anywhere (ADR 0005, unchanged).
- No change to the *set* of candidates or their per-builder membership — only how each references its wall, and the private-room ordering within `W_ROOM_UNREACHABLE`.
- No change to the public `Suggestion` / `SuggestionCandidate` types (append-only contract).
- No MCP tool-description / `server.json` edit and no `packages/mcp` version bump this round (see Doc surface).
- No live eval re-baseline: the generated-context wording shifted, but the change is a small clarification, not a new authoring lesson; a re-baseline stays owner-only and default-not-run (same discipline as prior rounds).

## Delivery

Per-task gates: `npm run check` (typecheck + Biome + full vitest) and `npm run check:drift` (9 generated artifacts). Merge to main → tag `v1.18.0` → push (OIDC trusted publishing to npm, idempotent). The `Suggestion` contract is append-only, so downstream consumers on `^1.x` pick this up passively.
