# Plan-soundness programme: handoff (state as of 2026-10-27, `main@f1c197ab`)

This page is the resume point for a new session. It says where the programme stands, what is open,
in which order, and how the work is run. It is re-written at every stage end; the dated history is
in `research/` and `audits/`. Decisions are in `README.md` §3 (D1–D26); cards are in `cards.md`.
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
| 2026-10-26 arm C, walls-first control (`audits/2026-10-26-walls-first-control-arm.md`, D21) | 54, 52 without area basis (3, plus 2 partial) | 1 (townhouse stair) | 0/6 (45 `wall`, 0 `walls from rooms`) | same run | 0/6 (`validate` 0/6, `describe` 1/6; 0 of 66 calls) |
| 2026-10-26 row 6, current role (`audits/2026-10-26-first-contact-rerun-row6.md`, D26) | 61, 58 without area basis (12, all on the two plans whose authors stopped early) | 2 (house: four rooms unreachable; townhouse stair; both reported by lint) | 6/6 | not re-mapped by id (Part 1: 42 new warnings on 36 old plans, 39 true, 1 false positive) | 0/6 (`validate` 0/6, `describe` 1/6 discarded; 0 of 60 calls) |

**Not met.** Rooms-first authoring is the norm (12 of 12 plans) and class 1 stays at 0, but 52 and 54
defects still pass lint, and all three arms drew one blocker, each on the townhouse stair (the stair class
has no default rule but `W_STAIR_UNMATCHED`). The 10-26 run is D15's two-arm re-measure after the
four clearance rules (PS2.11a–d), plus the walls-first control arm (D21: walls-first is not worse, 54 against 52);
arms A and C were audited by two auditor instances, arm B by a third, so compare the arms by class and by blockers,
not by the minor count. Its verdict is D20: arm A made no `score --taste`
and no `validate` call, so D2's reverse-if is met and taste is a reviewer's tool, not an author's
(PS7.5 moves it out of the author loop). Authors game rules when they can (labels pinned on wall
lines, a stair shrunk to clear a label warning, a worktop or a TV deleted, a `uses` dropped, doors
swung outward): every new rule is checked for the cheapest evasion.

The means, tracked in `README.md` §7: defect-corpus catch rate 7/53 (10-18) → 46/68 (10-20) → 53/72
(10-24) → 59/73 (10-25 and 10-26) → 67/77 (PR #280, stair safety 0/4 → 8/8) → **72/79** (PR #283), clearances class 11/19 → 16/21.

## 2. Where §7 stands

| Row | Cards | Status |
|---|---|---|
| 1 | PS0.1, PS0.7, PS1.1 | met 2026-10-18 |
| 2 | PS2.1–PS2.9, PS2.13 | met 2026-10-20 |
| 3 | PS3.0–PS3.4, PS3.6 | met 2026-10-23 (ADR 0028) |
| 3a | PS3.5, PS3.7–PS3.9, PS0.19 | unplanned, recorded by D7 |
| 4 | PS0.4, PS4.1, PS4.2, PS4.5 | met 2026-10-26: PS4.5 reports `held` |
| 5 | PS5.1–PS5.3, PS2.10–PS2.12 | met 2026-10-25 (D14; PS2.11e moved to row 6) |
| 6 | PS4.3, PS4.4, PS5.4, PS7.x, PS2.11e | **closed in part** 2026-10-27 (D26): every card landed (#267–#286) and the D10 re-measure ran (`audits/2026-10-26-first-contact-rerun-row6.md`); `preview --review` rings nothing inside repeated statements, so PS4.6 is the remainder |
| 7 | PS6.1 | parked |

## 3. What shipped (2026-10-18 → 10-27, PRs #195–#286)

Everything below is on `main` and **unreleased**: the last `v*` tag predates PR #195 (check with
`git describe --tags --abbrev=0` and `npm view @chanmeng666/archlang version`). A release starts only
when the owner asks; the agent then runs the chain (`docs/agents/iron-laws.md` § Owner policies).
`CHANGELOG.md` `[Unreleased]` is the release record; PR #255 backfilled the 24 programme PRs it was
missing. Totals at f1c197ab: 32 new `W_*` codes (52 → 84), 40 new `E_*` codes (103 → 143), 11 `A_*`
taste advice codes, `LINT_RULES` 54 entries. Cards, counted from `cards.md`'s tables and card headers
after the 2026-10-27 housekeeping (which filed PS0.28, PS1.8, PS2.73, PS7.9): 151, of which 62 done,
0 doing, 2 parked, 87 todo (147 at f1c197ab). The five PS0 cards listed above that family's table are
not counted; the 133 recorded at 6f3de966 counted them (128 without).

| Surface | Card | PR | Merge |
|---|---|---|---|
| Defect corpus (7/53 → 72/79) | PS1.1, PS1.2 | #195, #203, #233 | 3d255044, 90ae6bfd, 1a1efd9e |
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
| First-contact re-measure, D15's two arms; D20; ADR 0032 addendum; PS2.56, PS7.5, PS7.6 filed | PS7.4 | #261 | ef16e249 |
| DXF export carries text justification, rotation and non-ASCII (external contributor) | — | #262 | 186d0561 |
| The taste step leaves the author loop: spec, SKILL step 7 and `arch-author.md` teach compile → validate → lint → repair; taste is the reviewer's | PS7.5 | #263 | f024ab4a |
| Walls-first control arm (arm C of the same run); D21 | PS1.3 | #264 | 3f071b91 |
| Opening tags stay off room names pinned with `label … at` (external contributor; four `terrace-row` tags) | — | #265 | caa54106 |
| CI posts the benchmark comment only for same-repo PRs | — | #266 | b10c24e3 |
| `W_FIXTURE_BACK_TO_ROOM` declines a piece side-on or end-on to a wall | PS2.50 | #267 | 98b3d7ab |
| `finish` furnishes small wet rooms as whole sets | PS2.45 | #268 | e6778596 |
| No message quotes an element id (`lint()`, `taste()`, `W_ROOM_OVERLAP`; `src/naming.ts`); D23 ratified 2026-10-26 | PS2.22, PS2.29 | #269 | 5aab29e5 |
| `keep` design record, D22, ADR 0033 (Proposed) | PS4.3 design | #270 | 0c5e7a09 |
| Brief-bound dimensions; `describe().totals.gross_internal_area_m2` | PS4.4 | #271 | c2f4176b |
| `keep` statement, `W_KEEP_VIOLATED`, `describe().keeps[]`, `validate --json` `keeps`/`next`; ADR 0033 Accepted | PS4.3a | #272 | 6f3de966 |
| Housekeeping: counts, shipped table, D23 recorded, README trim (head 04d6f7a6) | — | #273 | a1c33a9c |
| `arch preview --review`, the review sheet (head 59b2d793) | PS5.4 | #274 | 8c2d6150 |
| `impact`'s keeps section, `depends.keeps`, Plan JSON's dropped-keeps note (head 40bd2f7a) | PS4.3b, PS4.11 | #275 | b09eee4d |
| D23 ratified by the owner (head 98155c82) | — | #277 | c1b01513 |
| `lint` and `validate` open with a one-line summary (head 8a78e12e) | PS7.6 | #278 | 52e7c71f |
| `context --level starter`, a one-screen starter (head be28101f) | PS7.2 | #279 | 2c7ca200 |
| Stair safety: `W_STAIR_NO_LANDING`, `W_STAIR_SIDE_ENTRY`, `W_STAIR_HEAD_VOID`, `W_STAIR_TOO_STEEP`, `W_SWING_OVER_STAIR`, `W_SHAFT_FOOTPRINT_MISMATCH`; K1 re-taken (D24) (head fb52a6b5) | PS2.11e stairs, PS2.34, PS2.15 | #280 | e432c24a |
| `impact` reports walls and furniture held on a room edge that moved (head f9b60378) | PS4.5 | #281 | 0413af3d |
| Authoring stages, `validate --stage <s>` (head c546ca3f) | PS7.1 | #282 | b0f89776 |
| `W_HOB_UNDER_WINDOW`, `W_HOB_FRIDGE_GAP`, `W_LEAF_TOO_WIDE`, the `double` kind, the cased-opening approach from the face; D24, D25; `eval:ci` against the fixture (head 8a9533de) | PS2.11e, PS2.46, PS2.54 | #283 | 24a8afa2 |
| Diagnostic-wording study: no wording rule supported (head f5847349) | PS1.4 | #284 | f339e313 |
| CLI flushes stdout before exiting, so large `--json` outputs are never truncated (head 95778dd8) | — | #285 | c9d8c8eb |
| Row 6 closed by the first-contact re-measure; D26; PS2.64–PS2.72, PS7.7, PS7.8 filed (head 9d64e1fb) | — | #286 | f1c197ab |

Recorded practice a reader must know: lint PRs bump the `lintWarnings` counts in `eval/judge-fixture.json`
when a new rule fires on an eval golden, with a per-row reason in the PR body (judgment fields untouched,
`JUDGE_VERSION` unchanged; D19, ratified 2026-10-27). A judgment moves only under a ratified D-entry
named in the row's `notes` (D25), and `eval:ci` compares with the fixture (D25's gate bullet, ratified
2026-10-27). The K1 keep baseline is re-taken only by its generator and never in a PR that touches keep
code (D24, ratified 2026-10-27; ADR 0033 decision 7, amended).

## 4. What is open, in order

The order below is the coordinator's reading of §7 row 6 plus the costs and owner asks that surfaced
on 2026-10-25. Each item names its card; the card holds goal, design, acceptance and open questions.

1. **Resume point (2026-10-27): row 6 is closed, met in part, by `audits/2026-10-26-first-contact-rerun-row6.md`
   (D26).** One arm, current role, `main@24a8afa2`: 61 defects (2 B) against 52 / 54 / 54; 12 reported
   by the final lint, all on the two plans whose authors stopped on the prompt's "stop when it
   compiles"; the stair blocker named by lint; the residual families unchanged. Its remainder is PS4.6
   (`preview --review` rings nothing inside a repeated statement). Cards filed: PS2.64–PS2.72, PS7.7,
   PS7.8.
2. The stage-end drift audit ran 2026-10-27 and its housekeeping PR (`docs/ps-stage-end-housekeeping`)
   ratified D19, D24 and D25's gate bullet by delegation (D18), cut the README to its cap and filed
   PS0.28, PS1.8, PS2.73 and PS7.9. **Next: row 7 / the next PS2 tranche per `cards.md`**: first the two false
   positives the re-measure found (PS2.64 hob beside a window, PS2.65 garage door), PS7.7 (`next`
   precedence), then the no-rule families by first-contact evidence (PS2.28/2.32, PS2.30, PS2.31,
   PS2.36/2.16, PS2.43, PS2.71). PS7.8 (the whole-loop arm) runs with the next re-measure.
3. Everything else in `cards.md` by family: PS0 18 todo, PS1 4, PS2 49 todo, PS3 4, PS4 6 todo, PS5 3, PS7 3 (7.3 parked); pick by first-contact evidence, not by number.

**Open cards by family (2026-10-25 audit, counts updated 2026-10-27; "ready" = no stated dependency
outstanding; every card that changes what an author sees in `lint`, `validate`, `finish` or the spec
waited for the row-5 re-measure (D19), which ran 2026-10-26: such a card may start and the next re-measure states it).**

| Family | Open | Ready now | Waiting on something |
|---|---|---|---|
| PS1 | 4 | 1.5, 1.6, 1.7, 1.8 | — |
| PS0 | 18 | PS0.15 (net-area bound), 0.2, 0.3, 0.6, 0.9, 0.17, 0.22, 0.23, 0.25, 0.26, 0.27, 0.28 | 0.8 (re-measure), 0.16/0.18/0.20/0.21 (a decision each), 0.24 (code landed in #252; only a `clear front\|sides` test is left) |
| PS2 | 49 | 2.21, 2.23, 2.25, 2.27, 2.30–2.33, 2.35, 2.41–2.44, 2.47–2.49, 2.51, 2.52, 2.56, 2.57, 2.58, 2.61–2.66, 2.72 | 2.67/2.68/2.69/2.70 (a sourced figure each), 2.71 (lint or taste first), 2.73 (authors reaching for it), 2.14 (ADR), 2.16/2.36 (facts), 2.20/2.28/2.59 (measure first), 2.24/2.26/2.37/2.38/2.55 (a decision each), 2.39 (drawing decision), 2.40 and 5.6 (fire D12's reverse-if), 2.53 (a sourced ceiling), 2.60 (a sourced profile figure) |
| PS3 | 4 | 3.12 | 3.10 (decision; moves digests, D8), 3.11 (corpus sweep), 3.13 (proof first) |
| PS4 | 6 | 4.6, 4.7, 4.8, 4.9 | 4.10 and 4.12's MCP part (with 5.3a's version bump) |
| PS5 | 3 | 5.5 | 5.3a (MCP version bump), 5.6 (D12) |
| PS6/PS7 | 1 parked; 3 todo, 1 parked | 7.7, 7.9 | 7.8 (runs with the next re-measure), 6.1 (until `keep` is used), 7.3 (parked: only if rule packs outgrow code) |

Facts a reader would otherwise miss: the dwelling reading (D6) now has six consumers (three lint
arms, taste R6/R11/R12), so D6's reverse-if has fired and is re-stated in D6; spec headroom:
`spec.llm.md` is 29,977 of 30,000 UTF-16 units (23 free): every spec addition from here pays by cuts
(D22 R4 precedent; card PS7.9);
the first-contact hits of the four clearance rules (A8, NT4, NH6, RH3, T5, A1, K4, NH5, RA6, C4, RS4,
RK4) are in the two 2026-10-25 as-built records and are summed in Part 1 of the 2026-10-26 audit (23
of the 57, 7 of the 48 and 5 of the 49 now caught, 9 new true findings, 0 false positives); `docs/backlog.md`
items 3.1(b), M.8, M.9, M.14 and D.7 wait on the owner's answers and are not covered by D18.

## 5. Owner asks not yet carried out (from the 2026-10-25 transcript audit)

- Walls-first vs rooms-first comparison (PS1.3): done 2026-10-26 (D21; `audits/2026-10-26-walls-first-control-arm.md`).
  Diagnostic wording (PS1.4): done 2026-10-26 (`research/2026-10-26-ps14-diagnostic-wording.md`): the current message + hint repaired
  best on sonnet and haiku, but by 1 case on sonnet, under the 3-case margin; the data supports no wording rule, and the record says what would.
- Id-free lint messages: done 2026-10-26 (PS2.22/PS2.29, PR #269); the rule is in `README.md` §5.
  **D23 ratified by the owner on 2026-10-26** (D18): PR #269 widened the id-free wording in
  `docs/agents/iron-laws.md` to `taste()` and the compile-channel `W_ROOM_OVERLAP`; recorded with its
  reverse-if, applied in code, enforced by tests, and now citable as precedent.
- **D25 ratified 2026-10-26** (D18): the doorway approach is read from the wall's face
  (PS2.54, PR #283), so three eval holdout goldens (`dims-auto-cottage`, `galley-kitchen`,
  `compact-studio`) now fail the judge's physical check and their `semanticPass` was set to false,
  beyond D19's `lintWarnings`-only practice. Reverse-if in `README.md` §3 D25.
- **Ratified 2026-10-27 by delegation at the owner's request (D18); each stands unless the owner
  objects:** D25's `eval:ci` gate bullet (a row recorded as failing only under a ratified D-entry named
  in its `notes`), D24 (K1 re-taken by its generator, never in a PR touching keep code; ADR 0033
  decision 7 amended), and D19's first bullet as is. Reasons and reverse-ifs in `README.md` §3.
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
3. Merge on green CI and a reviewed diff. Before merging, post `reviewed <full sha>` as a PR comment
   (a round-2 fix of blocker class gets that note too; #286 was the first to carry it), then
   `gh pr merge <n> --merge --match-head-commit <full sha> --delete-branch`, then unlink the worktree's
   `node_modules` junction before removing the worktree.
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
> `npx vitest run test/defect-corpus.test.ts` before acting. Then continue in the order of
> handoff § 4, one card per PR, under `README.md` §5's working rules.
