# Design: teach the placement sugar + extend suggestTopology (v1.16.0)

**Date:** 2026-07-14 · **Status:** approved by owner · **Origin:** downstream feedback from ArchCanvas's archlang-1.15 adoption round (its ship gate + topology fixer surfaced two upstream gaps).

## Problem

1. **The generated agent docs don't teach the v1.13 placement sugar where it matters.** `spec.llm.md`'s worked examples (`studio.arch`, `parametric.arch`) are both coordinate-math authored; the `## Common mistakes` table teaches coordinate fixes; `SKILL.md:75` documents the furniture anchor as a stale `anchor <corner|edge>` placeholder (real grammar: nine-point tokens). Models imitate examples over prose — a downstream consumer (ArchCanvas) currently carries hand-written prompt text as the *primary* teacher of attachment/strip/anchor, which should be upstream's job.
2. **`suggestTopology` covers 2 of the 4 connectivity faults an agent actually hits, and is furniture-blind.** ArchCanvas's production topology fixer additionally handles no-entrance and bath-only-reachable-through-bedroom, and its candidate placement avoids spans where furniture blocks the door approach. Those capabilities are proven downstream and belong upstream as *suggestions* (never applied — ADR 0005).

## Workstream B — suggestTopology extension (code; lands first so A's prose can cite it)

### New suggestion kinds (additive; `Suggestion.code` union 2 → 4)

- **`W_NO_ENTRANCE`** — fires when the access graph reports `hasEntrance === false`. Candidate walls: exterior walls of entrance-suitable rooms (not `isBedroom`, not `isWetRoom`; deterministic room order — entrance-suitable rooms first, then the rest as fallback when no suitable room touches an exterior wall). `insertText`: `door on <wall> at <pct>% width 900`; rationale names the room and that this creates the building's entrance.
- **`W_BATH_VIA_BEDROOM`** — reuse the two-BFS pattern from `src/lint/rules/reachability.ts` (reach-all vs reach-excluding-bedrooms) to find wet rooms reachable only through a bedroom. Candidates: door on a shared wall with a neighbour that itself has a bedroom-free route (non-bedroom neighbours first), falling back to an exterior-wall door. Rationale explains the privacy route.

Both stay ADR 0005-compliant: deterministic, closed-form, data-only, fail-open (`[]` on ambiguity/errors), ordered by the existing `orderCandidates` (free-run length desc, wallId, pct), top 3.

### Furniture-aware door candidates

Extend the blocked-interval computation for **door** candidates only: in addition to existing openings (+100 mm clearance), subtract wall spans where a furniture rect (from `resolvePlan` ir, footprint via `rectOf`) intrudes into the door's approach corridor — the strip inside the target room along that wall, `APPROACH_DEPTH = 900` mm deep. Windows are exempt (furniture under a window is normal). Existing test goldens are furniture-free fixtures, so pinned candidate percentages must not move — this is a hard acceptance criterion.

### Tests

Three new fixtures in `test/suggest.test.ts` (+ CLI passthrough coverage where cheap):
1. no-entrance plan → `W_NO_ENTRANCE` suggestion; inserting the top candidate clears the `W_NO_ENTRANCE` lint;
2. bath-via-bedroom plan → `W_BATH_VIA_BEDROOM` suggestion; round-trip clears the lint;
3. furniture-blocking plan (a fixture sitting mid-wall in the approach strip) → the door candidate's position avoids the blocked span; a furniture-free twin pins that the free-run math is otherwise unchanged.
Existing golden assertions (exact `pct` values, candidate ordering) stay byte-valid.

### Surface refresh (prose only)

- CLI `arch suggest` usage line and `cmdSuggest` human output need no structural change (raw `Suggestion[]` passthrough); update the stale "unreachable room or windowless bedroom" wording where it appears.
- MCP `suggest` tool description (packages/mcp/src/server.ts:330) gains the two new kinds. No wiring change.

## Workstream A — generated docs teach attachment-first (docs only)

1. `scripts/gen-llm-spec.ts:28`: `SPEC_EXAMPLES` = `["attached.arch", "parametric.arch"]` (swap studio → attached). `attached.arch` itself stays byte-identical (snapshots/playground/docs untouched); `studio.arch` stays in the repo and all its consumers. Spec shrinks ~15.9 → ~14.2 KB (internal cap 18 KB; downstream pin 25 KB).
2. Rewrite the `## Common mistakes` rows in the same script: coordinate-arithmetic fixes become attachment-first guidance (off-wall door → "use `on <wall> at <pos>` — hosted by construction"); keep genuinely universal rows (units, ids).
3. `## CLI loop`'s "Fix topology" paragraph: mention all four suggestion kinds.
4. `SKILL.md`: fix line ~75 `anchor <corner|edge>` → the nine-point token list; topology section lists the two new suggest kinds.
5. Regen chain: `npm run gen:spec` → `npm run gen:llms` → `npm run check:drift`.
6. CHANGELOG `[1.16.0]`: both workstreams + the mandatory **"Note (eval baseline)"** (spec.llm.md is the eval author prompt; the calibrated 2026-07-12/13 live baseline becomes non-comparable; re-running is owner-only, default not run — same discipline as the 1.15 note).

## Non-goals

- No auto-application of suggestions anywhere (ADR 0005).
- No change to existing candidate ordering or the exterior-vs-neighbour preference of `W_ROOM_UNREACHABLE` (pinned goldens).
- No live eval re-baseline in this round (owner decision: changelog note only).
- No ArchCanvas changes in this round (its `^1.15.0` range picks up 1.16.0 passively; swapping its topology.ts internals for the richer upstream suggest is a possible later round).

## Delivery

Per-task gates: `npm run check` (typecheck + biome lint + vitest) and `npm run check:drift`. Merge to main → tag `v1.16.0` → push (OIDC trusted publishing to npm + MCP registry, idempotent) → verify `npm view @chanmeng666/archlang version` = 1.16.0. Execution model: controller orchestrates; Opus subagents implement; independent per-task reviews + final whole-branch review (same protocol as the ArchCanvas 1.15 round).
