# Plan-soundness programme: handoff (state as of 2026-10-26, `main` after PR #261 merges)

This page is the resume point for a new session. It says where the programme stands, what is open,
in which order, and how the work is run. It is re-written at every stage end; the dated history is
in `research/` and `audits/`. Decisions are in `README.md` §3 (D1–D20); cards are in `cards.md`.
Nothing here is private: the companion material the owner keeps outside this repository stays there
(D4).

## 1. What the programme is for, and whether it is met

The outcome (owner, 2026-10-18): an AI meeting ArchLang for the first time, helped only by the
language's own guidance, checks and reasoning, writes plans that follow architectural logic and usage
logic and show professional taste. The yardstick is the first-contact re-measure (D7): six briefs
cold-authored from `spec.llm.md` alone, audited by hand.

| Re-measure | Verified defects (lint caught in that run's own plans) | Blockers | Rooms-first | 2026-10-18 plans caught by that day's lint (partial) | Taste report used |
|---|---|---|---|---|---|
| 2026-10-18 (`audits/2026-10-18-first-contact.md`) | 57 (0) | 4 | 0/6 | 0 | n/a |
| 2026-10-24 (`audits/2026-10-24-first-contact-rerun.md`) | 48 (1) | 2 | 6/6 | 17 (6) of 57 | n/a |
| 2026-10-25 (`audits/2026-10-25-first-contact-rerun-row5.md`) | 49, 46 without area basis (0) | 0 | 6/6 | 19 (7) of 57 | 0/6 |
| 2026-10-26 arm A, pre-#250 role (`audits/2026-10-26-first-contact-rerun-d15.md`) | 52, 49 without area basis (0) | 1 (townhouse stair) | 6/6 | 23 (6) of 57 | 0/6 (`validate` 0/6, `describe` 1/6; 0 of 65 calls) |
| 2026-10-26 arm B, current role (same file) | 54, 51 without area basis (0) | 1 (townhouse stair) | 6/6 | 23 (6) of 57 | 0/6 (`validate` 1/6, `describe` 1/6; 0 of 77 calls) |

**Not met.** Rooms-first authoring is the norm (12 of 12 plans) and class 1 stays at 0, but 52 and 54
defects still pass lint, and each arm drew one blocker, both on the townhouse stair (the stair class
has no default rule but `W_STAIR_UNMATCHED`). The 10-26 run is D15's two-arm re-measure after the
four clearance rules (PS2.11a–d); the two arms were audited by two auditor instances, so compare them
by class and by blockers, not by the minor count. Its verdict is D20: arm A made no `score --taste`
and no `validate` call, so D2's reverse-if is met and taste is a reviewer's tool, not an author's
(PS7.5 moves it out of the author loop). Authors game rules when they can (labels pinned on wall
lines, a stair shrunk to clear a label warning, a worktop or a TV deleted, a `uses` dropped, doors
swung outward): every new rule is checked for the cheapest evasion.

The means, tracked in `README.md` §7: defect-corpus catch rate 7/53 (10-18) → 46/68 (10-20) → 53/72
(10-24) → **59/73** (10-25 and 10-26), clearances class 11/19.

## 2. Where §7 stands

| Row | Cards | Status |
|---|---|---|
| 1 | PS0.1, PS0.7, PS1.1 | met 2026-10-18 |
| 2 | PS2.1–PS2.9, PS2.13 | met 2026-10-20 |
| 3 | PS3.0–PS3.4, PS3.6 | met 2026-10-23 (ADR 0028) |
| 3a | PS3.5, PS3.7–PS3.9, PS0.19 | unplanned, recorded by D7 |
| 4 | PS0.4, PS4.1, PS4.2 | met in part 2026-10-24: `held` is empty (PS4.5 open) |
| 5 | PS5.1–PS5.3, PS2.10–PS2.12 | met 2026-10-25 (D14; PS2.11e moved to row 6) |
| 6 | PS4.3, PS4.4, PS5.4, PS7.x, PS2.11e | **current** (the owed re-measure ran 2026-10-26, D20; the row's cards may start) |
| 7 | PS6.1 | parked |

## 3. What shipped (2026-10-18 → 10-26, PRs #195–#261)

Everything below is on `main` and **unreleased**: the last `v*` tag predates PR #195 (check with
`git describe --tags --abbrev=0` and `npm view @chanmeng666/archlang version`). A release starts only
when the owner asks; the agent then runs the chain (`docs/agents/iron-laws.md` § Owner policies).
`CHANGELOG.md` `[Unreleased]` is the release record; PR #255 backfilled the 24 programme PRs it was
missing. Totals at 1f7c544d: 22 new `W_*` codes (52 → 74), 31 new `E_*` codes (103 → 134), 11 `A_*`
taste advice codes, `LINT_RULES` 45 entries; after this PR, 124 cards: 47 done, 2 parked,
75 todo (121 after PR #256, plus PS2.56, PS7.5 and PS7.6; PS7.4 is done).

| Surface | Card | PR | Merge |
|---|---|---|---|
| Defect corpus (7/53 → 59/73) | PS1.1, PS1.2 | #195, #203, #233 | 3d255044, 90ae6bfd, 1a1efd9e |
| Connector `between` read off the host wall's faces | PS0.1 | #196 | da9b47b5 |
| Living/dining classified from the label | PS0.7 | #197 | 1d92656f |
| Main entrance, use-aware floor, arc-window attribution | PS0.10–0.12 | #211 | fcb30748 |
| Clear-path equivariance; counted net-area walk | PS0.13–0.14 | #214 | e736146f |
| `at <pct>%` exact | PS0.19 | #231 | 6fde1d7f |
| `diffPlans` moved/rehosted/walls | PS0.4 | #238 | 78b507c5 |
| `W_ROOM_VIA_PRIVATE`, `W_WET_ROOM_DOOR`, `W_ENTRANCE_INTO_PRIVATE` | PS2.5–2.7 | #199 | a7a1ac34 |
| `W_HABITABLE_NO_WINDOW`, `W_ROOM_MISSING_DEFINING` | PS2.8–2.9 | #200 | cc165f4c |
| `W_OPENING_AT_JUNCTION`, `W_OPENING_OVERLAP`, `W_CONNECTOR_AMBIGUOUS` | PS2.1–2.3 | #201 | cefe7e9f |
| Lint coverage report | PS2.13 | #203 | 90ae6bfd |
| `W_BOUNDARY_NO_WALL`, `W_FLOOR_UNASSIGNED`, `W_ROOM_OUTSIDE_SHELL` | PS2.4 | #204 | 600eaaf6 |
| Label fallback vocabulary; required kitchen worktop | PS2.19, PS2.17 | #216 | 8bbdd699 |
| Dwelling reading (`assumeDwelling`, `non-dwelling`); read by three lint arms and taste R6/R11/R12 | PS2.18 / D6 | #217 | 06c6b563 |
| ADR 0028 drafted / Accepted | PS3.1 | #215 / #224 | 9d05af4f / ac1ad21d |
| Rooms-first resolve, frozen datum table | PS3.2a | #220 | 6c6179c7 |
| Room-edge datums, `E_DATUM_*` | PS3.2b | #221 | 9fb79494 |
| Tiling-precondition probe (15/279 refused) | PS3.0a | #222 | c95bd8a1 |
| `walls from rooms` | PS3.0b | #223 | c97c226c |
| `open between`, `between … thickness` | PS3.0c | #224 | ac1ad21d |
| `door\|opening between`, `… on <room>.<edge>` | PS3.4 | #225 | 852df5ec |
| `wall … between` / `around` | PS3.3 | #226 | 1235529c |
| Rooms-first teaching (`LEAD_EXAMPLE`) | PS3.6 / D9 | #227 | 2316f7d5 |
| `facing`, `against <room>.<edge>`, `clear`; `W_FURN_CLEAR_FRONT/SIDES`, `W_SEAT_FACING_AWAY` | PS3.7 | #228 | 0d2dbc04 |
| `swing inward\|outward` | PS3.8 | #229 | 98a41560 |
| Segment selectors | PS3.5 | #230 | 401c0795 |
| Plan JSON `components`/`instances` | PS3.9 | #232 | f420660a |
| `describe --facts depends` | PS4.1 | #239 | 29ec0662 |
| `arch impact` / `impact()`, `E_SET_OVERRIDE` | PS4.2 | #240 | 7954f252 |
| `W_DIM_TEXT_MISMATCH` (drafting layer) | PS2.10 | #243 | b1f06577 |
| `taste()`, `score --taste` (R3, R7, R14), `LintRule.layer`/`codes` | PS5.1a / D11 | #244 | 3a262a00 |
| `W_ANNOTATION_OVERLAP`, `W_TITLE_OVERFLOW`; `finish` drafting exemption | PS2.12 / D12, D17 | #245 | cbf6701f |
| `validate --json` `next`, `--profile`, `--taste` | PS5.3 / D13 | #246 | c54cdfbc |
| Taste R6, R9, R11, R12, R15–R18 (concordance 41 pairs / 37 ordered at #247; 44 / 40 / 0 tied / 0 reversed / 4 unjudged at 1f7c544d) | PS5.1b | #247 | 9cc29c7e |
| cn/uk/us residential advisory profiles; `W_ROOM_TOO_NARROW` (profile-only); never-worse law scoped | PS5.2 / D12 | #248 | f60636d6 |
| Authoring loop taught in the spec, SKILL and `arch-author.md` (measured 2026-10-26: not used, D20) | PS7.4 (`done`) | #250 | 6e0aa520 |
| `W_WC_SIDE_CLEARANCE`, `W_FURNITURE_OVER_WINDOW`; `finish` WC 450 mm off the side face; cursor clauses | PS2.11a/b | #252 | 486c9cb7 |
| `W_FOOTPRINT_TRANSPOSED`, `W_LEAF_ACROSS_DOORWAY` | PS2.11c/d | #253 | 43fe7fd6 |
| Housekeeping: D7–D19, ADR 0029/0032 Accepted, cards moved to `cards.md`, CHANGELOG backfill, this page | — | #237, #241, #242, #249, #251, #254, #255, #256 | — |
| First-contact re-measure, D15's two arms; D20; ADR 0032 addendum; PS2.56, PS7.5, PS7.6 filed | PS7.4 | #261 | — |

Recorded practice a reader must know: lint PRs bump the `lintWarnings` counts in `eval/judge-fixture.json`
when a new rule fires on an eval golden (judgment fields untouched, `JUDGE_VERSION` unchanged; D19).

## 4. What is open, in order

The order below is the coordinator's reading of §7 row 6 plus the costs and owner asks that surfaced
on 2026-10-25. Each item names its card; the card holds goal, design, acceptance and open questions.

1. **The row-5 re-measure, run as D15's two arms: done 2026-10-26** (`audits/2026-10-26-first-contact-rerun-d15.md`,
   PR #261; D20). Sonnet authors, six briefs per arm; arm A (pre-#250 role) made 0 `score --taste`
   and 0 `validate` calls in 65, arm B (current role) 0 and 1 in 77; defects 52 and 54, blockers 1 and
   1 (both the townhouse stair). D2's reverse-if is met: taste is a reviewer's tool, PS7.4 is done and
   PS7.5 moves the step out of the author loop. The row-5 residue and row 6 may start: item 2 is next.
2. **PS2.45** `finish` leaves small wet rooms empty rather than place a pan the WC rule refuses (30 of
   276 WC rooms and 16 of 144 baths in the 918-room probe). User-visible; first in row 6.
3. **PS2.50** `W_FIXTURE_BACK_TO_ROOM` has no correct reading for a bed or wardrobe side-on to a wall;
   `examples/tiny-house.arch` and `examples/hillside-villa.arch` each carry one `W_FIXTURE_BACK_TO_ROOM`
   that is the rule's fault, not the plan's (both examples also carry their own `W_PATH_TOO_NARROW`
   and, for hillside-villa, `W_ROOM_NOT_EQUATOR_FACING` warnings, which are the plans').
4. **PS2.22, PS2.29** id-free lint messages. An owner rule from 2026-10-18 ("lint 消息里不出现 id")
   that the code still breaks through `labelOf`'s id fallback. Small; do it before new rules.
5. **PS4.3** `keep` invariants checked by `validate` (ADR addendum first), **PS4.4** brief-bound
   dimensions, **PS4.5** `impact` reports `held`.
6. **PS5.4** `preview --review` rings every flagged element.
7. **PS7.x** staged authoring; then **PS7.5** (the taste step leaves the author loop in the spec, SKILL
   and role text; one PR; PS4.3 in item 5 needs the spec characters it frees, so take PS7.5 first if
   PS4.3 starts) and **PS7.6** (`lint` opens with a one-line summary). Both change what authors see, so
   the next re-measure states them.
8. **PS2.11e** the clearance remainder (`W_DOORWAY_BLOCKED` over leaf-less openings, stair swings,
   hob under a window PS2.46, per-family depth ceiling PS2.53, face/centreline unification PS2.54).
9. **PS1.3** walls-first control arm (§8 Q1) and **PS1.4** diagnostic-wording study (§8 Q3): owner asks
   from 2026-10-18 found undone by the 2026-10-25 transcript audit; PS1.3's walls-first arm ran on
   2026-10-26 in item 1's harness (66 CLI calls, 0 `score`, 0 `validate`; six plans, hand-audited) and is
   reported in its own audit and PR; PS1.4 is still open.
10. Everything else in `cards.md` by family: PS0 15 todo, PS1 2, PS2 41 todo, PS3 4, PS4 5, PS5 4,
    PS7 4 (7.1, 7.2, 7.5, 7.6); pick by first-contact evidence, not by number.

**Open cards by family (2026-10-25 audit, counts updated 2026-10-26; "ready" = no stated dependency
outstanding; every card that changes what an author sees in `lint`, `validate`, `finish` or the spec
waited for item 1 (D19), which ran 2026-10-26: such a card may start and the next re-measure states it).**

| Family | Open | Ready now | Waiting on something |
|---|---|---|---|
| PS1 | 2 | — | 1.3 and 1.4 (item 1's harness) |
| PS0 | 15 | PS0.15 (net-area bound), 0.2, 0.3, 0.6, 0.9, 0.17, 0.22, 0.23, 0.25 | 0.8 (re-measure), 0.16/0.18/0.20/0.21 (a decision each), 0.24 (code landed in #252; only a `clear front\|sides` test is left) |
| PS2 | 41 | 2.21, 2.23, 2.25, 2.27, 2.29, 2.30–2.35, 2.41–2.45, 2.47–2.49, 2.51, 2.52, 2.54, 2.56 | 2.11e (row 6), 2.14 (ADR), 2.15 (2.11e), 2.16/2.36 (facts), 2.20/2.28 (measure first), 2.22 (fold into 2.29), 2.24/2.26/2.37/2.38/2.46/2.50/2.55 (a decision each), 2.39 (drawing decision), 2.40 and 5.6 (fire D12's reverse-if), 2.53 (a sourced ceiling) |
| PS3 | 4 | 3.12 | 3.10 (decision; moves digests, D8), 3.11 (corpus sweep), 3.13 (proof first) |
| PS4 | 5 | 4.5, 4.6, 4.7 | 4.3 (ADR addendum, row 6), 4.4 (row 6) |
| PS5 | 4 | 5.5 | 5.3a (MCP version bump), 5.4 (row 6), 5.6 (D12) |
| PS6/PS7 | 1 parked; 4 todo, 1 parked | 7.2, 7.5 (D20; before PS4.3, which needs its spec characters), 7.6 | 6.1 (until `keep` is used), 7.1 ("after PS2" is ambiguous; read it as after row 6), 7.3 (parked: only if rule packs outgrow code) |

Facts a reader would otherwise miss: the dwelling reading (D6) now has six consumers (three lint
arms, taste R6/R11/R12), so D6's reverse-if has fired and is re-stated in D6; `spec.llm.md` has 136
UTF-16 units of headroom under its 30,000 cap, so row 6's `keep` form must be paid for by cuts (PS7.5 frees the
loop paragraph's taste clause);
the first-contact hits of the four clearance rules (A8, NT4, NH6, RH3, T5, A1, K4, NH5, RA6, C4, RS4,
RK4) are in the two 2026-10-25 as-built records and are summed in Part 1 of the 2026-10-26 audit (23
of the 57, 7 of the 48 and 5 of the 49 now caught, 9 new true findings, 0 false positives); `docs/backlog.md`
items 3.1(b), M.8, M.9, M.14 and D.7 wait on the owner's answers and are not covered by D18.

## 5. Owner asks not yet carried out (from the 2026-10-25 transcript audit)

- Walls-first vs rooms-first comparison (PS1.3): ran 2026-10-26 in item 1's harness and is reported in
  its own audit and PR. Diagnostic wording (PS1.4): card filed, not run.
- Id-free lint messages: PS2.22/PS2.29 open; the rule is in `README.md` §5.
- Fuzz, timing and red-team probes were to run in the owner's prepaid `claude --cloud` sessions
  (owner, in conversation, 2026-10-20). One probe ran; the rest ran locally. Item 1's two arms ran as
  local headless sessions, not in the cloud sessions; use the cloud sessions, if they are still
  available, for the red-team rounds.
- Executors on a mix of models and effort levels: the 2026-10-25 transcript audit (outside the
  repo) found nearly every dispatch went to one model. The mix rule is in `README.md` §5. The
  2026-10-26 two-arm run used a mix: sonnet authors (`claude-sonnet-5-5`, six per arm), opus auditors
  (one per arm), a sonnet docs executor for the audit PR, and one headless `claude -p` dispatcher
  session per arm started in that arm's worktree (agent definitions load at session start).
- Stage reports in Chinese must quote raw verification output; the same audit found the reports
  after 2026-10-20 stopped doing so.

Owner-reserved and untouched: the remote branch `docs/archlang-3d-plan` and the primary checkout on
it; Dependabot major bumps (patch/minor bumps follow `docs/agents/iron-laws.md` § Owner policies);
starting a release; the paid eval; `docs/backlog.md`'s owner-blocked items.

## 6. How the work is run

The rules are in `README.md` §5 (working rules) and §8; `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`
apply. The shape that worked for the 49 programme PRs merged between #195 and #254:

1. The coordinating session reads this page, `README.md` §3/§7 and the card, then writes a brief
   (template below) and dispatches an executor in a worktree branched from `main`.
2. The executor opens a PR; the coordinator starts `gh pr checks <n> --watch --fail-fast` and a
   read-only red-team review in parallel; fixes go back to the executor; at most two rounds.
3. Merge on green CI and a reviewed diff: `gh pr merge <n> --merge --match-head-commit <full sha>
   --delete-branch`, then unlink the worktree's `node_modules` junction before removing the worktree.
4. At a stage end: drift audit (read-only, compares the stage's PRs with §3/§7 and the cards), the
   housekeeping PR (decisions, counts, this page), the report to the owner.

**Brief template (what every executor brief must contain).** The card id and its text; the base
commit; the laws that bite (`compile()` purity and count budgets, byte-identity law, derived positions
from the shape never the bbox, no ids in messages, never bless a golden); the local gate = build +
typecheck + the touched tests + the digest suites, CI being the full gate; **if the brief edits any file
under `examples/`, the touched tests include** `cursor-exhaustive`, `iso-snapshot`, `snapshot`,
`visual`, `opening-tags-corpus`, `readme-permalink`, `docs-examples-figures`, `example-svgs-drift`,
`compose-assoc`, `lint-file-provenance`, `rooms-tiling-probe`, `taste-digests`, every
`*-digests`/`*-byte-identity` suite and `playground/test/llm-prompt.test.ts` (the prefilled-link budget
on `hillside-villa` is the tightest constraint on that example); the golden policy (an example that
fires a new rule is fixed and explained, never re-pinned to silence it); the as-built record path
(`research/<date>-<card>-as-built.md`) and the card's one-line `done` form; the commit trailer; the
instruction to report raw test counts and the head SHA.

## 7. Resume prompt

A new session can be started with:

> Read `docs/plans/plan-soundness/handoff.md`, then `README.md` §3 and §7 and the first open card in
> handoff § 4. Verify the figures there against `git log`, `gh pr list --state merged --limit 20` and
> `npx vitest run test/defect-corpus.test.ts` before acting. Then continue §7 row 6 in the order of
> handoff § 4, one card per PR, under `README.md` §5's working rules.
