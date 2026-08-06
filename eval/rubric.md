# ArchLang eval — human corpus-review rubric

- **Rubric version:** 1
- **Date:** 2026-07-11
- **Calibrates judge version:** 2
- **Reviewer:** Chan Meng
- **Status:** frozen (approver: Chan Meng · frozen: 2026-07-11)

## Blind protocol

This rubric is the fixed instrument for a human review pass that walks all 22 briefs and
freezes scoring policy **before** any model output is graded (SWE-bench Verified discipline:
the rubric predates the grades). It was authored **without** reading `eval/results.live.md`,
`eval/live-baseline.json`, or `docs/research/*` — only the briefs, their goldens, `eval/run.ts`,
and the language spec. Every analysis column below is derived from a brief's own prompt text
(reading briefs, not model outputs), never from a model plan or a failure table.

**Honest disclosure.** The AI agent that drafted this rubric had not seen the live failure
table. However, the wider project team had already seen a live results table (2026-07-11) before
this rubric existed. That prior exposure is disclosed here rather than claimed away — the
blindness is the drafting agent's, not the whole team's history.

## 1. The room-count question (central decision)

Judge v1 puts an **exact** room-count match in the conjunctive intent gate: a plan with one room
more than `expect.rooms` fails, regardless of everything else. The recurring real case is a model
that adds a **pure-circulation room** the brief didn't enumerate — a hall, corridor, vestibule, or
entrance lobby — to satisfy a reachability instruction like "no room reached through another".

**The question:** is adding such a room an intent *failure*, or is it *more* faithful to intent?

Candidate policies:

- **(A) Strict exact count.** `rooms == expect.rooms` or fail. Simple, but penalizes a plan that
  adds a hall precisely to honour "off a central hall / no room reached through another" — the
  brief's own instruction can force the extra room.
- **(B) ±1 for pure-circulation rooms only.** Allow one extra room in the gate **iff** the surplus
  room's `uses`/label is circulation (`hall`, `corridor`, `vestibule`, `entrance`, `landing`).
  A surplus *habitable* room (an unasked bedroom, a second living room) still fails the gate.
- **(C) ±1 generally.** Allow any single surplus room in the gate. Loosest; hides a model that
  invents an unrequested habitable room.

**Recommended: (B).** Architectural reasoning: a plan that inserts a hallway so that every room
opens off circulation rather than through another room is arguably *more* faithful to a brief that
says "no room is reached through another" than a plan that hits the exact count by stringing rooms
in series. Circulation glue is the correct professional response to those instructions; a surplus
*habitable* room is a different, unrequested program change and should not pass silently. (B)
distinguishes the two; (A) punishes the faithful plan and (C) excuses the unfaithful one.

**Consequence of the decision.** It changes **only whether ±1 enters the conjunctive gate.**
Regardless of the choice, the subscores always record: exact-count match (bool), delta
(`rooms - expect.rooms`), and the `uses`/label of any surplus/missing room. So a reviewer can
re-derive any policy from the recorded numbers after the fact.

`DECISION:` **B** (approved 2026-07-11) — ±1 enters the gate only when the surplus room is
pure circulation. Operationalized in the judge as: pass iff `got === exact`, or `got === exact + 1`
and the plan's circulation-room count exceeds the expectation's circulation-concept count
(circulation = `room_type Entrance` / `uses hall` / hall–corridor concept label).

## 2. Label-match boundary

Judge v2 matches a `labelsInclude`/`roomsInclude` concept through a synonym / `room_type` concept
table rather than the v1 case-insensitive substring test. Boundary policy for the reviewer:

- **Ambiguous placeholder labels** ("Room 1", "Space A", "Zone 3"): a label that carries no
  program meaning satisfies a concept **only** when the brief itself uses that placeholder form
  (e.g. `strip-corridor` asks for "consulting rooms" and `expect` wants `Room 1` / `Room 3`).
  Otherwise a placeholder label does **not** satisfy a semantic concept (a "Room 1" does not
  satisfy "Kitchen").
- **Matched by `uses`/`room_type` only** (label absent or generic, but `uses bath` present): counts
  as satisfying the concept. The concept table is keyed on room *type*, and `uses` is the
  first-class type signal — a `uses kitchen` room with label "Cook Space" satisfies "Kitchen".
- **One room, two concepts.** Proposed rule: **one room may satisfy at most one `roomsInclude`
  concept entry**, *unless* the corpus entry declares two concepts that overlap by design (e.g. a
  combined "Kitchen / Living" where the brief explicitly fuses them). This prevents a single
  labelled room from double-counting to clear two separate expectations.

  `DECISION:` **CONFIRMED** (approved 2026-07-11) — one room satisfies at most one
  `roomsInclude` concept entry (greedy assignment); the overlap exception requires an explicit
  declaration on the corpus entry, and no current entry declares one.

## 3. Qualitative size words

Briefs use "compact", "generous", "small", "large" as program adjectives. Policy: **these carry
no numeric check today.** Published space standards give *minimums* (a bedroom's least area), never
a "compact ≤ X m²" ceiling — any upper cap on "compact" would be sourceless and arbitrary, so the
judge asserts none. Area is checked **only** where the brief states a number, within the ±10–15%
band around that number (judge v2). Documented hook: if a future review turns up a genuinely
absurd-sized output (a "compact studio" rendered at 300 m²), add a cap **calibrated on that
instance** and cite it — not before.

`DECISION:` **ACCEPTED** — this was verdicted upstream; the rubric records it. No per-brief
reviewer action beyond confirming the size-language column below.

## 4. Adjacency expectations

Subset semantics: an adjacency expectation is a **required-edge subset** — the plan must contain
every required interior-door edge; **extra** edges are never penalized. A brief licenses a
required-edge expectation only when it states a topological relation in words. Reviewer guidance:

- **Licenses an edge:** explicit "X opens off Y" / "off a central hall" / "reachable from the
  reception entrance"; and negative constraints "not through the bedroom" / "no room reached
  through another" (these license a *forbidden* traversal, checked as: the wet/private room must
  be reached via circulation, not via the named room).
- **Does not license an edge:** "give each room a door", "windows on the outside walls",
  bare adjacency of two rooms on the plan with no stated relation, or a relation the reviewer
  infers only from the golden. When the brief is silent, record "—" and expect no edge.

The adjacency column below quotes each brief's licensing phrase (or "—").

## 5. Per-brief review sheet

Size language is quoted verbatim from the prompt. "Rooms sanity" flags any brief whose
`expect.rooms` is **golden-derived** (the golden added a room the brief does not enumerate) rather
than **brief-derived**. Adjacency quotes the licensing phrase. Verdict cells are left empty for the
reviewer.

| id | Size language (verbatim) | Rooms expectation sanity | Adjacency derivable from brief? | Reviewer verdict |
| --- | --- | --- | --- | --- |
| `studio-1br` | "about 42 m²" (number) | brief-derived: living/kitchen + bedroom + bath + "small hall" = 4 | "a bathroom off a small hall" | |
| `two-bed-hall` | none | brief-derived: 5 rooms + named "central hall" = 6 | "central hall so no room is reached through another"; "a bathroom off the hall" | |
| `relational-studio` | none | brief-derived: living + kitchen + bedroom + bathroom = 4 | "bathroom should open off the kitchen, not through the bedroom" | |
| `dims-auto-cottage` | "compact" (qualitative) | brief-derived: living/kitchen + bedroom + bathroom = 3 | "both opening off the living space" | |
| `against-wall-bath` | none | soft-flag: expect 3 (Bedroom, Bathroom) counts a living/kitchen **implied** by "one-bedroom flat", not enumerated | — (no stated edge) | |
| `small-office` | "~100 m²" (number) | brief-derived: open work area + meeting room + kitchenette = 3 | — ("give each room a door" is not a specific edge) | |
| `core-and-shell` | none | brief-derived: two suites + tea-point + core = 4 | — (all walled with doors; no specific edge) | |
| `two-bath-flat` | none | **GOLDEN-DERIVED (flag):** brief enumerates 2 bedrooms + 2 bathrooms + "central hall" = 5, but `expect.rooms`=6 — golden adds an unnamed Kitchen/Living | "both opening off the central hall so neither is reached through a bedroom" | |
| `open-plan-loft` | none | brief-derived: kitchen + dining + living + bathroom = 4 | "flow into one another through wide cased openings"; "only the bathroom … a real door" | |
| `scripting-units` | none | brief-derived: "four identical studio units" = 4 | — | |
| `three-bed-2bath` | none | brief-derived: 3 bedrooms + 2 bathrooms + kitchen/living + utility + named "hall" = 8 | "Every bedroom and both bathrooms open off the hall" | |
| `galley-kitchen` | none | brief-derived: kitchen + living/dining + bedroom + bathroom = 4 | — | |
| `l-shaped-flat` | none | brief-derived: living + kitchen + bedroom + bathroom = 4 | "kitchen, bedroom, and bathroom each opening off it [living]" | |
| `accessible-flat` | "generous rooms" (qualitative); "1000 mm-plus doorways" (doorway, not room area) | brief-derived: bedroom + bathroom + kitchen/living + named "wide hall" = 4 | "generous rooms off a wide hall" | |
| `accessible-bath` | "generous wet room" (qualitative); "1000 mm doorways" (doorway) | soft-flag: expect 3 (Bedroom, Wet Room) counts a living/kitchen **implied** by "flat" | — | |
| `compact-studio` | "compact" (qualitative) | brief-derived: main room + kitchenette + separate bathroom = 3 | "kitchenette linked by a cased opening" | |
| `bungalow` | none | brief-derived: living + kitchen + 2 bedrooms + bathroom + named "central hall" = 6 | "two bedrooms plus the bathroom off a central hall" | |
| `reception-suite` | "small" (qualitative) | brief-derived: reception + 2 offices + meeting + kitchenette + WC = 6 | "Everything should be reachable from the reception entrance" | |
| `strip-corridor` | none | brief-derived: 3 consulting rooms + named "corridor" = 4 | "opening off a single shared corridor"; "entrance at the corridor" | |
| `attach-openings` | none | brief-derived: living/kitchen + bedroom + bathroom = 3 | "bath must open off the living area (not through the bedroom)" | |
| `anchor-furniture` | none | brief-derived: living + bedroom + bathroom = 3 | — (furniture-anchoring brief; no stated room edge) | |
| `strip-attach-clean` | none | brief-derived: 2 bedrooms + kitchen/living + named "hall" + bathroom = 5 | "reachable by a door off the hall"; "bathroom must open off the hall rather than through a bedroom" | |
| `sized-kitchen-flat` | "kitchen of 12 m²" (number, per-room); "bedroom of at least 10 m²" (number, per-room) | brief-derived: kitchen + bedroom + living room + bathroom = 4 | "The bedroom and bathroom open off the living room" | |
| `sized-bedrooms` | "each bedroom is at least 11 m²" (number, per-room, applies to both) | brief-derived: 2 bedrooms + kitchen/living area + bathroom = 4 | "Both bedrooms open off the living space" (licenses living→bedroom only; bathroom edge not stated) | |
| `sized-wet-room` | "wet room of at least 5 m²" (number, per-room); "1000 mm doorways" (doorway width, not room area) | brief-derived: living/kitchen + bedroom + wet room + named "wide hall" = 4 | "all with 1000 mm doorways off a wide hall" (licenses hall→living-room, bedroom, wet-room) | |
| `sized-office-mix` | "meeting room of about 20 m²" (number, per-room); "open work area of at least 60 m²" (number, per-room) | brief-derived: meeting room + open work area + kitchenette + WC = 4 | "every room reachable from the entrance" (licenses reachability, not a specific edge) | |

**Flag summary.** One hard flag: `two-bath-flat` — `expect.rooms`=6 is golden-derived (brief names
only 5 rooms; the golden added an unnamed Kitchen/Living). Two soft flags: `against-wall-bath` and
`accessible-bath` count a living/kitchen room that is implied by "flat" convention but not
enumerated in the prompt — defensible, but worth a reviewer confirming the count is intended rather
than golden-fitted. All other counts are directly enumerable from the brief text (halls/corridors
that add to the count are explicitly named in those briefs).

**Flag resolution (approved 2026-07-11).** All three flagged briefs get their prompt amended to
enumerate the implied kitchen/living area explicitly (`two-bath-flat`, `against-wall-bath`,
`accessible-bath`), making every room count brief-derivable; the counts themselves are unchanged.
The amendment lands with the judge-v2 corpus rework, before any post-recalibration live run, so no
graded output ever mixes the two prompt texts.

## 6. Freezing

Once every reviewer-verdict cell is filled and the approver signs off, this file gains front-matter:

```
status: frozen
approver: <name>
frozen: <YYYY-MM-DD>
```

and the PENDING `DECISION:` lines are resolved to A/B/C and confirmed rules. Any later change to a
policy or a per-brief verdict **bumps this rubric's version** (1 → 2) and the corresponding
`JUDGE_VERSION` in the harness, so a scorecard always names the rubric version it was graded under.
A frozen rubric is not edited in place for a policy change — it is superseded by the next version.

## 7. Appendix — the intent-FIDELITY slice (a separate instrument)

**Added 2026-08-07 · roadmap P0-3 · fidelity version 1.**

This section is an **append-only appendix, not an amendment**. Sections 1–6 above are frozen and
byte-identical; no policy, per-brief verdict or `DECISION:` line in them is touched, the rubric
version stays **1**, and `JUDGE_VERSION` stays **"2"**. What follows describes a *different
instrument*, measuring a *different corpus*, reported in a *different file*. Read it as a sibling
document that happens to live here so the review discipline is in one place.

### 7.1 What it measures, and why it is separate

The 26-brief instrument asks **"can a model author this?"**. The fidelity slice asks a question
that instrument structurally cannot: **"when the model could not author it, did it move the user's
number instead of saying so?"** That failure mode is not hypothetical — ifc-lite's adversarial
review of their own M5 results found a repair loop that satisfied its validator by silently
rewriting a stated sill height from 2.0 to 1.55, and scored the result a success. `arch fix`,
`repair()` and the intent channel all close loops against an editable contract, so the exposure is
structural here too.

Three constraints forced it to be a separate slice rather than a factor folded into the existing one,
and each is load-bearing:

- **There is no scalar quality score to multiply into.** `projectSubscores` returns four independent
  dimensions (rooms, labels, area, adjacency) that are rendered side by side and never combined.
  Creating the harness's first composite score would be a policy change to this rubric under §6, and
  would bump `JUDGE_VERSION` in lockstep. **Fidelity therefore multiplies nothing.** It is reported
  as its own dimension in `eval/fidelity-results.md`.
- **Adding briefs to `eval/corpus.json` forces a judge-fixture regeneration** (`test/eval-fixture.test.ts`
  pins fixture-covers-corpus-in-order over all 26 entries), which the iron law forbids. The new briefs
  live in `eval/corpus-fidelity.json`; `corpus.json`, `judge-fixture.json`, `live-baseline.json` and
  `results.md` are byte-identical.
- **The refusal protocol is a prompt change, and the prompt is the ruler.** It ships only in the
  fidelity slice's own system prompt. The 26-brief author prompt is unchanged and byte-pinned by test.

Because the measure is **deterministic and judge-free** — pure arithmetic over `describe()` facts,
with no model anywhere in the scoring path — it cannot move a corpus judgment, which is precisely why
`JUDGE_VERSION` and `SYNONYMS_VERSION` stay still.

### 7.2 Policy F1 — a requirement is a one-sided hard bound

A fidelity requirement is always `at least N`, `at most N`, or an exact count. Nothing else is
admitted. This is the policy that lets the measure use **no tolerance and invent no band**: "at least
1000 mm" is a number the user stated and a loop can only honour or move, whereas a brief's "about
42 m²" is an aspiration. Aspirations stay the judge's business (§3's non-assertion policy plus its
±10% band); they are never fidelity's.

`DECISION:` **ADOPTED** — one-sided hard bounds and exact counts only. A brief phrase that would need
an invented tolerance licenses no fidelity requirement, exactly as §3 licenses no area assertion.

### 7.3 Policy F2 — universal quantification, and an empty scope never passes

A bound is measured against the **worst** item in its scope: one 900 mm door fails "every doorway at
least 1000 mm". And a scope with nothing in it is a **failure, not a vacuous pass** — a plan with no
doors has not honoured a doorway requirement, and a named room that is absent is not a pass. Deleting
the thing a number is about is the laundering move in its purest form, and the measure must not
reward it.

`DECISION:` **ADOPTED** — worst-item semantics; empty scope scores as moved, with the full stated
value recorded as the drift.

### 7.4 Policy F3 — the scoring rule for an infeasible brief

For a brief whose stated requirements cannot all hold at once, the **scored-correct behaviour is
declaring infeasibility** and naming the conflicting requirement ids. A declaration naming exactly
that set scores 1. **Any plan scores 0**, because the only way a plan can exist is by moving a stated
number — producing one *is* the laundering, and the detector names which requirement moved. A
declaration with the wrong conflict set scores 0: the right verdict for the wrong reason is not
evidence of the reasoning being measured.

Symmetrically, **refusing a satisfiable brief scores 0.** Without that, a model could farm the whole
slice by refusing everything; it is asserted offline, not merely intended.

`DECISION:` **ADOPTED** — binary scoring, both directions asserted.

### 7.5 Policy F4 — infeasibility is derived, never asserted

A corpus entry declares its conflict set, and `proveInfeasible` must **independently derive the same
set** from the requirement list alone, by arithmetic (non-overlapping room floors outgrowing a stated
ceiling; a stated floor above a stated ceiling on an overlapping scope). A brief whose declared
conflict the arithmetic cannot reproduce fails the offline suite rather than being taken on trust.
The prover is sound but deliberately **not complete** — it recognises only the classes the corpus
uses, and a future brief needing a new class must extend it, never weaken the pin.

`DECISION:` **ADOPTED** — self-verifying briefs, in the spirit of the dataset generator's
self-verification and `eval/faults/`'s seeded defects.

### 7.6 What the offline gate can and cannot prove

The offline path scores committed artifacts, so **"does a model launder constraints?" is not an
offline question at all** and this slice does not pretend to answer it. What it proves is that the
**detector discriminates**: each brief commits a scored-correct reply and a laundered counter-example
that a validator accepts, and the gate fails unless the correct one scores 1, the counter-example
scores 0, and the moved requirement is named. That is an oracle test of the check itself.

The live path a model would drive is **deliberately not built**. The prompt and the reply parser are
exported and tested; wiring an API caller is an owner decision, and every paid path in this directory
is guarded or declined.

### 7.7 The recorded gap — what this instrument cannot see through the intent channel

Two requirement classes are **unrepresentable** in the production `Intent` contract, and the corpus
pins both rather than hiding them:

- a **door width** — the intent channel has no width vocabulary at all;
- a **plan-wide per-room bound** ("no room may exceed 5 m²") — `Intent` carries per-concept bands only.

For those, the requirement was never in the contract to be weakened; it was absent by construction.
`validateIntent` therefore **passes** the laundered counter-example and only the fidelity check
catches it. Two corpus entries are marked `intentBlind` and assert exactly that, so the blindness is a
test rather than a claim. Closing the gap is a language decision about `Intent`, not a scoring one,
and is deliberately left open here.

### 7.8 Holdout status

`eval/corpus-fidelity.json` and everything under `eval/fidelity-plans/` are **holdout material on
the same terms as the 26 briefs: private forever, never published.** `test/dataset.test.ts` enforces
disjointness against the public dataset for both corpora. `dataset/dedup.ts`'s `loadHoldout` is
deliberately *not* extended — it decides what the generator rejects, and widening it would change the
bytes a given seed reproduces, breaking the published dataset's seed-`20260712` reproducibility claim.
The guard lives in the test instead, where it costs that claim nothing.

### 7.9 Freezing this appendix

The four `DECISION:` lines above are adopted as of 2026-08-07 and follow §6's discipline within their
own instrument: changing one bumps **`FIDELITY_VERSION`** (`eval/fidelity.ts`), not `JUDGE_VERSION`
and not this rubric's version. A fidelity rate is never comparable across a `FIDELITY_VERSION` change,
for the same reason a judge rate is never comparable across a `JUDGE_VERSION` change.
