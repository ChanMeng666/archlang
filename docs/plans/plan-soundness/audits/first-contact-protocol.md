> Protocol record, 2026-10-25, written against `main@1f7c544d`. It makes the first-contact re-measure
> re-runnable from the repository alone. Read observations as evidence: the numbers live in the three
> audits, not here. Programme entry: `../README.md` (decision D15 needs this file). Audits that used
> it: `2026-10-18-first-contact.md`, `2026-10-24-first-contact-rerun.md`,
> `2026-10-25-first-contact-rerun-row5.md`.

# First-contact protocol: how to re-measure

The yardstick is six briefs, authored cold by an AI from `spec.llm.md` alone, then audited by hand.
This file holds the six brief texts, the dispatch prompt, the audit rubric, the per-run settings and a
checklist. Texts in `text` fences are verbatim from the dispatch transcripts. The only edits are path
placeholders (`<repo>`, `<scratch>`, `<run-folder>`) and, in the 2026-10-18 block, the brief list,
given once above. The `sh` fences are not transcripts.

## What could and could not be recovered

| Item | Status |
|---|---|
| The six brief texts | Verbatim. Byte-identical in all three runs (string comparison of the 2026-10-18 dispatch against both later dispatches). |
| The 2026-10-18 dispatch preamble and task text | Verbatim, paths placeholdered. |
| The 2026-10-24 and 2026-10-25 per-brief prompt | Verbatim, paths placeholdered. The twelve prompts (six per run) differ only in brief, worktree and output file. |
| The 2026-10-18 audit instruction | Not reproduced: it named local scripts and a checkout outside this repository. The rubric below is *reconstructed* from its checklist and the three audits' method sections. |
| The 2026-10-24 and 2026-10-25 audit instructions | Not reproduced: they carry local paths and programme steering. The audits' method sections are the record; the rubric restates them. |
| The prototype checkers used in 2026-10-18 (openings vs junctions, nibs, WC side clearance, wardrobe front, dimension text in rooms, habitable-window check, id-vs-room) | Not in this repository and not reproduced. Each measurement is repeatable by hand from `compile -f json` and `describe --json`. The 2026-10-24 audit notes the WC checker cannot see walls derived by `walls from rooms`. `W_DIM_TEXT_MISMATCH` and `W_ANNOTATION_OVERLAP` now cover part of class 8. |
| The 2026-10-18 author's model | The 2026-10-24 audit says "not recorded". The dispatch metadata records `sonnet` with the `arch-author` agent type. This corrects the 2026-10-24 audit's confounder note: the baseline author also had the `arch-author` role and model `sonnet`; what differs is one in-session teammate for all six briefs. |

## The six briefs (verbatim)

```text
1. **Two-bed apartment, ~70 m²**: hall, living/dining with kitchen, two bedrooms, one bathroom, one balcony off the living room. Single front door from a corridor.
2. **Three-bed family house, ~110 m², single storey**: entrance hall, living, kitchen/dining, three bedrooms (master with ensuite), family bathroom, utility, integral garage.
3. **Studio flat, 30 m²**: one room with kitchenette zone, bathroom, entrance, a sleeping alcove.
4. **Corner café, ~90 m²**: entrance on the corner, seating for 24, counter and back-of-house kitchen, accessible WC, staff WC, store.
5. **Two-storey townhouse, 2 × 55 m²**: ground: hall, living, kitchen/dining, WC, stair; first: two bedrooms, bathroom, landing. Use whatever multi-level form the spec provides.
6. **Small clinic, ~120 m²**: waiting room with reception, three consulting rooms, accessible WC, staff room, store, two exits.
```

Output file names: `1-apartment.arch`, `2-house.arch`, `3-studio.arch`, `4-cafe.arch`,
`5-townhouse.arch`, `6-clinic.arch`, kept in `first-contact-plans/` (2026-10-18), in
`first-contact-plans/2026-10-24-rerun/` and in `first-contact-plans/2026-10-25-rerun/`.

## The dispatch prompt (verbatim)

### 2026-10-24 and 2026-10-25: one prompt per brief

One fresh `arch-author` subagent per brief. The prompt, with brief 4 as the example (the other five
swap the bold brief line and the output file name; the rest is identical):

```text
Brief (metric, dimensioned, furnished, with doors and windows, a `title`, and `dims auto` where the spec allows):

**Corner café, ~90 m²**: entrance on the corner, seating for 24, counter and back-of-house kitchen, accessible WC, staff WC, store.

The language specification is the file <repo>\spec.llm.md — read all of it; it is your only documentation. Do not read any other file in the repository.

Write the plan; you may run `node <repo>\dist\cli.js compile|lint <file> --json` to check; stop when it compiles.

Save the plan to <repo>\docs\plans\plan-soundness\audits\first-contact-plans\<run-folder>\4-cafe.arch. When done, reply with the number of compile/lint rounds you ran, the final lint codes, and anything in the language you were unsure about.
```

`<repo>` was the dispatcher's own worktree, built with `npm ci && npm run build`. `<run-folder>` was
`2026-10-24-rerun` or `2026-10-25-rerun`. The prompt names `compile|lint` only: it never names
`describe`, `validate` or `score`.

The 2026-10-24 café author stopped at the first clean compile (36 warnings). The dispatcher then sent it
this message, once, with no hints (verbatim):

```text
Please continue: run the lint loop on your plan and repair the warnings you agree with (the same loop your role description gives), then stop. Overwrite the same file. Reply with the rounds, the final lint codes, and what you were unsure about.
```

Both café states were reported. On 2026-10-25 no nudge was needed.

### 2026-10-27: arm 2, the whole-loop prompt

Added by PS7.8 (D26) beside the frozen prompt above, which stays arm 1 unchanged. Confirmed by the
owner on 2026-10-27 from `../research/2026-10-27-ps78-arm2-prompt-draft.md`; first used by
`2026-10-27-first-contact-rerun-ps78.md`. One fresh `arch-author` subagent per brief, brief 4 as the
example (the other five swap the bold brief line and the output file name; the rest is identical):

```text
Brief (metric, dimensioned, furnished, with doors and windows, a `title`, and `dims auto` where the spec allows):

**Corner café, ~90 m²**: entrance on the corner, seating for 24, counter and back-of-house kitchen, accessible WC, staff WC, store.

The language specification is the file <repo>\spec.llm.md — read all of it; it is your only documentation. Do not read any other file in the repository.

Write the plan and run the whole loop with `node <repo>\dist\cli.js <verb> <file> --json`: compile, then `validate --stage rooms|walls|openings|fixtures` as you add each stage, then `lint`, then repair; iterate until `validate`'s `next` is null (or every remaining warning is a choice you state in your reply).

Save the plan to <repo>\docs\plans\plan-soundness\audits\first-contact-plans\<run-folder>\4-cafe.arch. When done, reply with the number of compile/validate/lint rounds you ran, the final lint codes, the warnings you chose to leave and why, and anything in the language you were unsure about.
```

Against arm 1 it replaces the "Write the plan; …" sentence and adds "validate" and "the warnings you
chose to leave and why" to the reply line; nothing else moves (no `describe`, `score`, `context` or
`preview`). `<run-folder>` is `<date>-rerun-arm2`, and arm 1 then uses `<date>-rerun-arm1`. Both arms
run from the same dispatcher, one after the other, with separate call logs.

### 2026-10-18: one teammate, all six briefs

The baseline author was one teammate given all six briefs in a single message (verbatim, with `<repo>`
and `<scratch>` standing for the dispatcher's repository and scratch folders):

```text
You are taking part in an experiment: you are an AI meeting ArchLang for the first time, and we want to see what plans you produce when guided only by the language's own documentation and checks. Do your honest best work as an architect would; do not try to game the experiment.

Setup: the compiler is built at `<repo>\dist\cli.js` (run `node <repo>\dist\cli.js compile|lint|describe|fix|validate <file> --json`). Learn the language ONLY from `<repo>\spec.llm.md` and the CLI's own output (do not read `docs/plans/`, `test/`, `src/` or the audits). Write everything under `<scratch>\first-contact\` (create it; one subfolder per brief). Do not touch the repository.

For each of the six briefs below, write `plan.arch`, then run your loop: `compile` → fix errors → `lint --json` → repair warnings you agree with → `describe --json` → check the plan against the brief → stop when `lint` is clean or after 6 rounds. Keep every intermediate version (`plan.v1.arch`, `plan.v2.arch`, …), save the final `lint.json`, `describe.json`, `validate.strict.json` (`validate --strict --json`) and a `log.md` recording each round: what the CLI said, what you changed and why, and what you were unsure about in the language (this last part matters most to us).

Briefs (metric, dimensioned, furnished, with doors and windows, a `title`, and `dims auto` where the spec allows):
<the six briefs above, as a numbered list>

Finish with `<scratch>\first-contact\SUMMARY.md`: per brief the rounds used, final lint codes, what you found hard or ambiguous in the language, and which of your own decisions you are least sure are architecturally right. Report that summary back to me verbatim.
```

The two later runs are not a byte-exact repeat of this: one agent per brief, no round cap, no
`describe` or `validate --strict` in the stated loop, no log files. The audits list this as a confounder. The 2026-10-24 audit also lists the baseline author's role and model as differing; they did not (see the table above): the baseline author had the `arch-author` role (2026-10-18: a teammate).

## Arm A role text

Every author was an `arch-author` subagent, so the role text in `.claude/agents/arch-author.md` was in
its system prompt on top of the dispatch prompt. Its loop was compile → fix → describe → lint, iterated
"until clean". That is why five of six 2026-10-24 authors linted to clean despite "stop when it
compiles". All three runs used this text: every copy of the file is identical from before 2026-10-18 to PR #250
(checked at `main@8d1e13e`, `main@401c0795`, `main@9cc29c7e` and the pre-#250 commit), so the history is
unaffected by which checkout the dispatcher ran in.

Arm A is that pre-#250 text. Recover it with:

```sh
git show 6e0aa520^1:.claude/agents/arch-author.md
```

(`6e0aa520` is the merge of PR #250; its first parent is the last main commit with the old role.) To run
arm A, write that output over `.claude/agents/arch-author.md` in a disposable worktree and never commit it
(see step 2 of the checklist: the dispatching session must be started in that worktree). Arm B uses the current `.claude/agents/arch-author.md` as it stands on the commit under
test. The post-#250 text adds `validate --json` (read `next`) and `score --taste generic` to the loop. A
third setting, no role text, is a `general-purpose` agent given the same prompt; no run so far used it.

## Per-run settings

| Setting | 2026-10-18 | 2026-10-24 | 2026-10-25 |
|---|---|---|---|
| Commit under test | `main@8d1e13e` plus programme docs | `main@401c0795` | `main@9cc29c7e` |
| Built CLI | `archlang v1.43.1` | `archlang v1.43.1` | `archlang v1.43.1` |
| Author | one teammate, six briefs | six subagents, one per brief | six subagents, one per brief |
| Agent type and model | `arch-author`, `sonnet` | `arch-author`, `sonnet` | `arch-author`, `sonnet` |
| Role text | pre-#250 | pre-#250 | pre-#250 |
| Spec read | `spec.llm.md` of the dispatcher's checkout | `spec.llm.md` of the dispatcher's worktree | the same |
| Other files | forbidden: `docs/plans/`, `test/`, `src/`, the audits | forbidden: any other file in the repository | the same |
| CLI verbs the prompt allows | `compile\|lint\|describe\|fix\|validate` | `compile\|lint` | `compile\|lint` |
| Stated stopping rule | lint clean or 6 rounds | "stop when it compiles" | the same |
| Execution | background, non-interactive | background, non-interactive | background, non-interactive |

## The audit rubric

*Reconstructed* from the 2026-10-18 audit instruction and the method sections of the three audits.

**Severity.** `B` blocker: the plan cannot be built or used as drawn. The blockers found so far were a
window crossed by a partition, no landing at the foot or at the head of a stair, living rooms unreachable from the front
door, and an escape door opening against the escape direction. `N` noticeable: an architect would mark it
and the occupant would feel it (no worktop, no bedside access, a sofa facing away from its TV, a WC
opening onto the kitchen). `m` minor: a drafting or advisory finding (annotation collisions, area basis).

**Class.** Numbers 1 to 8 are `../evidence.md` § 3: 1 openings ignore walls, 2 enclosure, 3 circulation and
privacy, 4 defining contents, 5 clearances, 6 daylight, 7 stair, 8 annotation. Anything else is `new`,
followed by a short name in brackets, using the audits' exact labels: `relation`, `transposed`,
`door–door` (en dash), `leaf across a corridor`, `area basis`, `space efficiency`, `advisory size`,
`counter zoning`, `context`, `brief`, `egress`, `zoning`, `taste`, `stacking`, `oblique join`. A defect that
belongs to two classes carries both, as the audits do: `4 / 5`, `5 / brief`, `5 (accessible)`.

**Lint status.** `CAUGHT`; `PARTIAL` (the warning names the defect but misses one half); `MISSED`;
`MISSED (typing)` (the rule exists but the room's typing keeps it silent); `MISSED (masked)` (the rule
would fire but a second exterior door hides it); `MISSED (presence only)`, `MISSED (silenced)` and
`MISSED (no diagnostic)` as the 2026-10-24 and 2026-10-25 audits use them (a rule sees only that a
piece is present; the author silenced the rule by relabelling or retyping; lint emits nothing); `n/a` for rows no rule could judge (brief, taste and area
rows). The Lint cell is always the final plan's default `lint`.

**Per plan, measure at least:**
- every opening against junctions, overlaps and nibs;
- every shared room edge for a wall;
- the access graph: entrance room, depth per room, rooms reached only through a bedroom, bath, kitchen or
  store, a WC opening onto dining or kitchen, a staff WC off the public floor, the accessible WC's 1500 mm
  turning circle and door swing;
- daylight for every habitable room (an internal bathroom is fine; say so);
- each room's defining contents, and furniture turned the wrong way: front rays by hand, taking `rotate 0`
  as back to the north; a TV not facing its sofa, chairs not at their table, a bed head not on a wall;
- fixture clearances: WC centreline to the side obstacle, wardrobe front, a fridge or tall unit in front of
  a window, a hob beside the fridge, bed sides;
- stairs on the townhouse: same-id footprints on both storeys, the void at the arrival, the swing over the
  treads, the landing at foot and head;
- door offsets that may flip on walls drawn right to left, and wall thickness consistency;
- annotation: auto-dimension text inside rooms, title overflow, labels over symbols;
- the area arithmetic against the brief (below);
- then anything an architect would mark that no item names (context modelled inside the plan, a garage
  reached only through the utility, a window crossed by a partition, a scale mismatch with `paper`).

**Area basis.** Judge each brief's area on centrelines and on gross internal area (GIA): the rectangle
inside the exterior walls' inner faces (centreline width and depth, each less one exterior wall
thickness). A minor row `new (area basis)`, lint `n/a`, is filed when the brief's area is met only on
centrelines or is missed on the figure that counts. For the house the habitable floor excludes the garage.
Area basis counts only for the apartment, house and studio briefs, where the baseline counted it. Every
run so far carried one such row for each of the three, and the headline tables give totals with and
without them (57 and 54 in the baseline).

**Blockers.** Re-measure the geometry and check a render crop before filing a `B`. Author doubts in a log
are leads, not findings; the 2026-10-18 audit lists which doubts were right and which wrong.

**Mapping old defects to new plans.**
- *Old plans (Part 1).* Re-lint the unchanged 2026-10-18 plans with the current CLI, default ruleset and
  `--profile accessibility-advisory`. Map each warning to a baseline id (A1 to K11) by plan, element and
  coordinates, or mark it new and true, or a false positive. A catch that names the defect but misses one
  half is `partial` and counts as half in the secondary total. Profile threshold hits the audit never judged
  are neither caught nor false.
- *Cold plans (Part 2).* These are different plans, so defects are not carried over by id: audit each fresh
  plan from scratch and give new ids with a run prefix (`N` for 2026-10-24: NA1, NH1, NS1, NC1, NT1, NK1;
  `R` for 2026-10-25: RA1, RH1, and so on). Compare runs by class, not by id.
- *Classes shift.* A class that disappears (class 1 after `walls from rooms`) is a finding about the form,
  not a defect fixed.
- *Authoring is lint-driven.* Authors repair until lint is clean, so final `lint` catches about nothing by
  construction. The yardstick is the defects that survive the loop. The one snapshot of what lint catches
  before repair is a compile-only state.

**Tool facts.** Record what the CLI said wrongly or could not say (a `describe` caption covering one storey,
an entrance tie) per plan, but do not count them as defects.

## How to run a re-measure

1. Branch from the commit under test and make a disposable worktree. Run `npm ci && npm run build`. Record
   `git rev-parse --short HEAD` and `node dist/cli.js --version`.
2. Decide the arms. For D15 run two on the same briefs: arm A with the pre-#250 role (above), arm B with the
   current role. Write the arm's role file in its own worktree, then start a new dispatching session with that
   worktree as its working directory (agent definitions load at session start; a lead in another checkout
   would dispatch the wrong role). Before dispatching, confirm with `/agents` that `arch-author`'s
   description reads `compile → fix → describe → lint` (arm A) or
   `compile → validate → lint → score --taste → repair` (arm B). Record which one in the audit's header.
3. Dispatch six `arch-author` subagents per arm, one per brief, local and unpaid, with the per-brief prompt
   above (change only the brief line, the worktree path and the output folder). Do not add hints, do not name
   `describe`, `validate` or `score`, and do not nudge. If an author stops early, record that state.
4. Save the six final plans under `first-contact-plans/<date>-rerun/` (and a second folder for a second
   arm). Keep intermediate versions outside the repository.
5. Count CLI calls per verb from each subagent's transcript (`compile`, `lint`, `describe`, `validate`,
   `score`). For D15 the number that decides it is arm A's `score --taste` and `validate` calls.
6. Part 1, old plans. Lint all eighteen earlier plans (the 2026-10-18, 2026-10-24 and 2026-10-25 sets) in both rulesets, and score them:
   ```sh
   node dist/cli.js lint <plan> --json
   node dist/cli.js lint <plan> --json --profile accessibility-advisory
   node dist/cli.js score <plan> --taste generic --json
   ```
   Lint before the change under test and after it, and diff both warning lists against the previous run's
   saved JSON. Map each new warning as in the rubric.
7. Part 2, cold plans. For each final plan run `lint --json` (default), `validate <plan> --json`, `describe --json` and
   `compile <plan> -f json`, render at 1800 px, and audit by hand to the rubric. One plan per brief, one
   table per plan.
8. Write the audit as `audits/<date>-first-contact-rerun-<tag>.md` in the shape of the 2026-10-25 file: a
   header blockquote (date, commit, CLI version); a headline table with one column per run; method and
   commands; Part 1 (new warnings, caught by id, then a taste section); Part 2 (opens with "The loop each
   author ran", a table that holds the per-verb call counts, then forms used, then verified defects per plan);
   then-and-now by class; the verdict-evidence section; candidate cards; corpus. Every defect table has exactly these columns, so they
   line up across audits:

   | # | Defect | Geometry | Sev | Class | Lint |
   |---|---|---|---|---|---|

   Keep the headline rows' wording from the 2026-10-25 file's first table so each new column is comparable.
9. Run the corpus checks and report the catch rate (the last four suites read `first-contact-plans/`, so
   a new run folder may need adding there):
   ```sh
   npx vitest run test/defect-corpus.test.ts test/taste-separation.test.ts
   npx vitest run test/rooms-tiling-probe.test.ts
   npx vitest run test/lint-dwelling-reading.test.ts test/main-entrance.test.ts \
     test/room-too-small-by-use.test.ts test/swing-building.test.ts
   ```
10. State the confounders in the audit: the author model and role text, the stated stopping rule, and that
    the lint is stronger than in the previous run. Do not add a control arm silently.
