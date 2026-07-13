# Sugar Worked Examples + suggestTopology Extension (v1.16.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship archlang v1.16.0: `suggestTopology` gains W_NO_ENTRANCE + W_BATH_VIA_BEDROOM suggestion kinds and furniture-aware door candidates; the generated agent docs (spec.llm.md worked examples, Common mistakes, SKILL.md) teach attachment-first authoring.

**Architecture:** Workstream B (code) lands first in two tasks on `src/suggest.ts` + tests; workstream A (docs) follows in one task touching `scripts/gen-llm-spec.ts`, `SKILL.md`, CLI/MCP description prose + the regen chain; a release task bumps the version, writes the CHANGELOG (with the mandatory eval-baseline note), and tags.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), vitest, biome, tsup; generated artifacts via `npm run gen:*` with drift tests.

**Spec:** `docs/superpowers/specs/2026-07-14-sugar-examples-and-suggest-extension-design.md` (owner-approved).

## Global Constraints

- ADR 0005: suggestions are DATA — deterministic, closed-form, fail-open (`[]` on error/ambiguity), never applied by the library.
- Existing golden assertions in `test/suggest.test.ts` / `test/cli-fix-suggest.test.ts` (exact `pct` values, candidate ordering) must stay byte-valid — all changes additive.
- Generated artifacts (`spec.llm.md`, `llms-full.txt`, grammars, schemas) are NEVER hand-edited; edit sources then `npm run gen:spec && npm run gen:llms` (order matters), verify with `npm run check:drift`.
- spec.llm.md must stay `< 18_000` bytes (test/llm-spec-drift.test.ts) — the swap SHRINKS it (~14.2 KB), never raise the cap.
- Gates per task: `npm run check` (typecheck + biome + vitest) and, when generators/doc sources changed, `npm run check:drift`. Fix biome findings, never suppress.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch: `feat/sugar-examples-suggest-v2` (design doc already committed at its tip).

---

### Task 1: suggestTopology new kinds — W_NO_ENTRANCE + W_BATH_VIA_BEDROOM

**Files:**
- Modify: `src/suggest.ts` (the only production file)
- Test: `test/suggest.test.ts` (append), `test/cli-fix-suggest.test.ts` (append one passthrough case)

**Interfaces:**
- Consumes (all existing exports): `buildDoorAccessGraph`, `isBedroom`, `isWetRoom`, `rectOf`, `resolvePlan` from `./analyze.js`; `projectPointOntoWall` from `./fix-producers.js`; the local helpers `edgesOf`/`hostWallForEdge`/`neighboursOnEdge`/`longestFreeRun`/`blockedRuns`/`orderCandidates`. Study `src/lint/rules/entrance.ts` (when W_NO_ENTRANCE fires) and `src/lint/rules/reachability.ts:30-60` (the two-BFS reach-all vs reach-excluding-bedrooms pattern) and mirror their SEMANTICS exactly so a suggestion fires iff the lint fires.
- Produces: `Suggestion.code` union widened to `"W_ROOM_UNREACHABLE" | "W_BEDROOM_NO_WINDOW" | "W_NO_ENTRANCE" | "W_BATH_VIA_BEDROOM"`. No signature changes; CLI (`cmdSuggest`) and MCP (`suggest` tool) pass the array through untouched.

- [ ] **Step 1: failing tests.** Append to `test/suggest.test.ts` (follow the file's existing fixture + assertion style):
  - Fixture `NO_ENTRANCE`: a compiling 2-room plan (living + bedroom, partition door between them, windows, NO exterior door) that trips lint `W_NO_ENTRANCE`. Assert: `suggestTopology(NO_ENTRANCE)` contains a suggestion with `code === "W_NO_ENTRANCE"`; its top candidate `insertText` matches `/^door on \w+ at [\d.]+% width 900$/`; the candidate targets the LIVING room's exterior wall (not the bedroom's) — assert via the rationale naming the living room; inserting the top candidate before the closing `}` makes `lint(...)` free of `W_NO_ENTRANCE`.
  - Fixture `BATH_VIA_BEDROOM`: entrance → living; bath reachable ONLY through the bedroom (living↔bedroom door, bedroom↔bath door; living↔bath share a wall with no opening); trips lint `W_BATH_VIA_BEDROOM`. Assert: suggestion with `code === "W_BATH_VIA_BEDROOM"`, top candidate is a `door on <the living↔bath shared wall> at …% width 900`, and the round-trip insert clears `W_BATH_VIA_BEDROOM` from lint.
  - Regression: the existing `faulty` fixture's assertions above these are untouched; additionally assert `suggestTopology(faulty).every(s => s.code !== "W_NO_ENTRANCE")` (it has an entrance).
  - `test/cli-fix-suggest.test.ts`: one case running `suggest - --json` on `NO_ENTRANCE` asserting the new code appears in `j.suggestions[].code`.
- [ ] **Step 2: run to verify RED** — `npx vitest run test/suggest.test.ts` fails on the new cases only.
- [ ] **Step 3: implement.** In `src/suggest.ts`:
  - Widen the `Suggestion.code` union (line ~41) and the doc comment.
  - `W_NO_ENTRANCE` builder: if `graph.hasEntrance` is false — for each room, iterate `edgesOf`, keep edges whose `hostWallForEdge` wall is category `exterior` AND `neighboursOnEdge` is empty; compute `longestFreeRun ≥ DOOR_WIDTH`; emit door candidates. Rooms partition into entrance-suitable (`!isBedroom(room) && !isWetRoom(room)`) and the rest; collect candidates from suitable rooms, falling back to the rest ONLY when no suitable room yields a candidate. One `Suggestion` total (problem: the building has no entrance), candidates ordered by the existing `orderCandidates`.
  - `W_BATH_VIA_BEDROOM` builder: mirror `src/lint/rules/reachability.ts`'s two-BFS construction (reach-all vs reach-excluding-bedrooms over the same door-connection adjacency) to find wet rooms in reach-all but not reach-no-bed (only when the plan HAS an entrance). For each such room: candidates = door runs on shared walls with neighbours present in reach-no-bed and not `isBedroom` (preferred), plus exterior-wall door runs as fallback candidates. One Suggestion per affected wet room, `roomId` = the wet room.
  - Keep everything pure; no new exports beyond the widened union; deterministic iteration in room/edge source order.
- [ ] **Step 4: run to verify GREEN** — `npx vitest run test/suggest.test.ts test/cli-fix-suggest.test.ts`, then full `npm run check`.
- [ ] **Step 5: commit** — `feat(suggest): W_NO_ENTRANCE + W_BATH_VIA_BEDROOM suggestion kinds`.

### Task 2: furniture-aware door candidates

**Files:**
- Modify: `src/suggest.ts`
- Test: `test/suggest.test.ts` (append)

**Interfaces:**
- Consumes: furniture elements from the already-resolved plan (`resolvePlan(...)` ir — `kind === "furniture"`, footprint via `rectOf`), the existing `blockedRuns`/`longestFreeRun` helpers.
- Produces: a new module const `APPROACH_DEPTH = 900` and door-candidate free runs that exclude furniture-blocked spans. Window candidates UNCHANGED.

- [ ] **Step 1: failing tests.**
  - Fixture `FURNITURE_BLOCKED`: like the existing `faulty` unreachable-bedroom shape, but with a `furniture wardrobe at (…) size …` rect sitting against the middle of the living↔bedroom partition inside the bedroom (inside the approach strip) so the naive mid-wall candidate would open onto it. Assert: the `W_ROOM_UNREACHABLE` door candidate for the partition wall has a `pct` OUTSIDE the furniture's blocked span (compute the span in the test and assert the candidate midpoint misses it), and the round-trip insert still clears the lint.
  - Twin fixture without the wardrobe: assert the candidate equals the mid-wall position — proving the free-run math is unchanged when no furniture blocks.
  - Regression: all pre-existing golden `pct` assertions still pass (their fixtures are furniture-free).
- [ ] **Step 2: RED run.**
- [ ] **Step 3: implement.** Extend the door-candidate path only: when computing blocked intervals for a DOOR candidate on wall segment S bordering target room R, add for each furniture rect F (from ir elements) the interval of S's axis-span where F intersects the approach corridor = the strip inside R along S, `APPROACH_DEPTH` deep (axis-aligned intersection; reuse the local edge/segment math — no new geometry imports needed beyond `rectOf`). Apply in all three door builders (unreachable, no-entrance, bath-via-bedroom); windows keep the openings-only blocking.
- [ ] **Step 4: GREEN run + full `npm run check`.**
- [ ] **Step 5: commit** — `feat(suggest): furniture-aware door candidate placement (approach clearance)`.

### Task 3: docs teach attachment-first (workstream A)

**Files:**
- Modify: `scripts/gen-llm-spec.ts` (SPEC_EXAMPLES line 28; `## Common mistakes` table; `## CLI loop` "Fix topology" paragraph)
- Modify: `SKILL.md` (line ~75 anchor grammar; the "Fix the topology" section's code list)
- Modify: `src/cli.ts` usage line for `suggest` + `src/cli/commands-author.ts` cmdSuggest comment/prose if it names only the two old kinds
- Modify: `packages/mcp/src/server.ts:330` suggest tool description
- Regenerated: `spec.llm.md`, `llms-full.txt` (via `npm run gen:spec && npm run gen:llms` — never hand-edited)
- Test: existing drift tests are the net; no new tests

**Interfaces:**
- Consumes: Task 1's new suggestion kinds (the prose must name all four).
- Produces: `SPEC_EXAMPLES = ["attached.arch", "parametric.arch"]`; regenerated artifacts.

- [ ] **Step 1:** Edit `SPEC_EXAMPLES` (swap `"studio.arch"` → `"attached.arch"`, attached FIRST as the flagship). Do NOT touch `examples/attached.arch` or `examples/studio.arch` themselves.
- [ ] **Step 2:** Rewrite the `## Common mistakes` rows in the script: replace coordinate-arithmetic fix advice with attachment-first guidance — an off-wall door/window row whose fix is "attach it: `door on <wall> at <pos>` — hosted by construction, can never be off-wall"; a hand-summed room offsets row → "lay rows with `strip`"; a floating/copy-pasted furniture row → "place `in <room> anchor <9-point> [inset]` or `against wall <id>`". KEEP genuinely universal rows (mm units, unique ids). Keep the table compact — the spec must stay well under 18 KB (expect ~14.2 KB after the swap).
- [ ] **Step 3:** Update the "Fix topology" paragraph in the CLI-loop prose + `SKILL.md`'s topology section to name all FOUR suggest kinds (`W_ROOM_UNREACHABLE`, `W_BEDROOM_NO_WINDOW`, `W_NO_ENTRANCE`, `W_BATH_VIA_BEDROOM`). Fix `SKILL.md:75` `anchor <corner|edge>` → `anchor <top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right>` (may abbreviate as `anchor <9-point anchor>` followed by the token list — match SKILL.md's existing voice). Refresh CLI usage line + MCP tool description similarly.
- [ ] **Step 4:** `npm run gen:spec && npm run gen:llms && npm run check:drift` — all green; `wc -c spec.llm.md` reported in the task report (expect ≈14 KB, MUST be < 18,000).
- [ ] **Step 5:** Full `npm run check`; commit — `docs(spec,skill): attachment-first worked example + four suggest kinds; fix stale anchor grammar`.

### Task 4: CHANGELOG + version 1.16.0

**Files:**
- Modify: `CHANGELOG.md` (new `## [1.16.0] - 2026-07-14` section at top, after `[Unreleased]` content is folded/retained per file convention)
- Modify: `package.json` (version 1.15.0 → 1.16.0); `npm install` to sync the lockfile

**Interfaces:** none new; documentation of Tasks 1–3.

- [ ] **Step 1:** Write the 1.16.0 CHANGELOG section in the file's established voice: Added — the two suggestion kinds + furniture-aware door candidates (credit the downstream ArchCanvas topology-fixer provenance, ADR 0005 discipline preserved); Changed — spec worked examples swap + Common-mistakes rewrite + SKILL anchor-grammar fix. Include verbatim the mandatory note, mirroring the 1.15 precedent: "**Note (eval baseline):** `spec.llm.md` is the eval's author prompt, and this change replaces a worked example in it, so it now differs from the prompt behind the calibrated live baseline. No scoring/judge/fixture code changed; re-running the paid live baseline under the new prompt stays a separate, owner-approved action (default: not run)."
- [ ] **Step 2:** Bump `package.json` version to `1.16.0`; run `npm install` (lockfile sync only).
- [ ] **Step 3:** Full `npm run check && npm run check:drift`; commit — `release: v1.16.0 changelog + version bump`.

### Task 5 (controller): final review, merge, tag, publish verify

- [ ] Whole-branch review (opus) over `main..feat/sugar-examples-suggest-v2`.
- [ ] Merge to `main`, push.
- [ ] `git tag v1.16.0 && git push origin v1.16.0` → OIDC release workflow publishes core + MCP shim; watch the run.
- [ ] Verify: `npm view @chanmeng666/archlang version` → `1.16.0`; GitHub Release created from CHANGELOG.
- [ ] Update the session ledger + memory.
