# Plan-soundness programme: professional rules and taste for ArchLang

**Status:** open. Planned 2026-10-18 against `main@98bd30b` (v1.43.1). The owner delegated the four
programme decisions (§3) and asked for this document to drive implementation in later sessions.

**What this is.** ArchLang draws what an author writes, faithfully. It does not yet know what the
drawing *means* as architecture. An LLM meeting the language for the first time therefore writes plans
that compile, lint clean and are still wrong: a door across a wall junction, two rooms with no wall
between them, a living room reached through two bedrooms, a dimension whose text lies. This programme
makes ArchLang itself carry the profession's rules and taste, so the language **guides** (forms that
make the wrong thing hard to write), **checks** (rules that read the facts it already computes),
**reasons** (about what a plan means, what follows an edit, what must stay, what must be re-checked)
and **judges quality** (a scored, sourced taste report), while keeping every iron law.

**The outcome this is measured by** (the owner's words, 2026-10-18: 让一个第一次接触 ArchLang 的 AI，
在语言自身的引导、检查和推理帮助下，写出符合建筑逻辑和使用逻辑、具有专业品味的平面图): an AI meeting
ArchLang for the first time, helped only by the language's own guidance, checks and reasoning, writes
plans that follow architectural logic and usage logic and show professional taste. The yardstick is
the first-contact re-measure (six briefs cold-authored from `spec.llm.md`, audited by hand, D7): verified
defects 57 (2026-10-18) → 48 (10-24) → 49 (10-25) → 52 / 54 (10-26, arms A / B, D20) → 61 (row 6, D26) → 64 / 56 (PS7.8, frozen / whole-loop), blockers 4 → 2 → 0
→ 1 per arm → 2 → 4 / 1, rooms-first 6/6 (12/12 on 10-26), taste report used by 0/6 (0/12 on 10-26) authors. Corpus
catch rates (§7) are the means; this number is the end. It is not yet met: 52 and 54 defects still pass lint.

**How to use this document (for a new session).**

0. Read `handoff.md` first: where the programme stands, what is open, and how to resume.
1. Read §1–§5 here (about 15 minutes). Read `evidence.md` before touching code.
2. The research behind each decision is in `research/`, and the per-plan defect audits are in `audits/`.
   Minimal reproductions are in `repro/` (see `repro/README.md`).
3. Take the next item of `handoff.md` § 4 (it orders §7's current row and the owner asks); only
   when that list is empty, pick the first `todo` card in `cards.md` (§6 summarises it, D16) whose
   dependencies are done. Each card states its goal, design, acceptance and open questions.
4. You are expected to **think, not just execute**. §8 lists what is still unknown and how to extend
   this plan. If the evidence contradicts a card, correct the card in `cards.md`, say why, and
   carry on.
5. Usual gates apply: `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`, and the `docs/backlog.md` floor gate
   and merge protocol.

---

## 1. The evidence in one page (detail: `evidence.md`)

*The 2026-10-18 baseline, kept as the evidence the plan was made from; much of it is no longer true
of `main` (`research/2026-10-26-readme-history.md` § §1: the note). Today's state is `handoff.md` § 1 and § 3.*

- About 120 verified defects across about 30 plans (the ArchCanvas public examples, the showcase,
  `examples/`, `repro/family-apartment.arch`) and 57 more in six cold-authored first-contact plans;
  lint caught a handful. The flagship example's corridor was a chain, `describe` knew facts no rule
  read, and a change had no consequences. These bullets verbatim: `research/2026-10-26-readme-history.md` § §1.
- **Missed defect classes, most common first:**
  1. openings that ignore walls: across a T-junction, overlapping each other, or with nibs under 100 mm;
  2. space not enclosed or not assigned: a shared edge with no wall, walled area with no room;
  3. circulation and privacy: through-bedroom, through-bath, bath onto living or kitchen, kitchen as
     the only link;
  4. rooms missing what defines them: bedroom without bed, bath without shower, kitchen without worktop;
  5. fixture clearances: 20 WCs 200 mm from a side wall, a wardrobe facing a bed 150 mm away, a
     fridge in front of a window;
  6. windowless living rooms (the label "Living" is not even classified as `living`);
  7. stair safety: a door swing over the top tread, a void at the stair head;
  8. annotation collisions: auto dimensions inside rooms, title-block overflow.

## 2. Diagnosis: three layers, one loop

*Written 2026-10-18 and kept as the diagnosis the plan rests on. Its present-tense gaps ("25 lint
rules exist", `between` read from the centre point, `freedom` without "on what", `diffPlans()`
calling a move a resize) are the state before PRs #196–#254; today's state is `handoff.md` § 3.*

1. **Authoring model: coordinates first, relations absent.**
   - Walls and rooms do not know each other ("Rooms describe space; walls are drawn separately").
   - An opening is a centre point plus a width and never names the rooms it joins.
   - Across the corpus, 100 % of walls, 94 % of rooms and about half of openings and furniture are
     absolute.
   - An LLM must hold a topology in its head and hand-propagate every number. LLMs are reliable at
     relations and unreliable at propagating coordinates (FloorplanQA; `research/prior-art.md`).
   - Every system that reaches near-zero invalid plans makes invalid states unwritable: a door is
     defined by the two spaces it joins (FML 2026, HypergraphFormer 2026, IFC hosting).
2. **Checking: facts computed, rules missing, coverage silent.**
   - 25 lint rules exist (`src/lint/rules/index.ts`). Only one, `W_BATH_VIA_BEDROOM`, asks what
     kind of room a route passes through.
   - Several rules are scoped to one room type: enclosure checks wet rooms only, "missing fixture"
     covers bath and kitchen only, and "near corner" covers doors at L-corners only.
   - A clean lint means "nothing I know how to check failed", but nothing says what was not checked.
     For example, rooms without a classified `uses` silently skip every program rule.
   - `between` is decided from an opening's centre point only, and `ambiguous` is a field, not a
     diagnostic (`src/analyze.ts` ~272-295).
3. **Change: no dependencies, no invariants, no impact report.**
   - `describe().freedom` says *how* a position was authored, never *on what* it depends.
   - `diffPlans()` labels a move as a resize and has no wall section.
   - No source form says "this must stay".
4. **The loop around it.** A generator that repairs against lint inherits every blind spot above:
   what lint cannot see ships. The fix is in ArchLang (more facts read, honest coverage, a `next`
   field) and in each consumer's gating. Consumer-side changes are tracked by their owners and are
   not part of this repository.

## 3. Decisions taken for this programme

The owner delegated these on 2026-10-18. Each records what would reverse it.

**D1. Relations first, as additive forms, with walls derivable from rooms.**
- Add room-edge datums (`living.east`), `wall … between A and B`, `wall … around [A B C]`,
  `door|opening between A and B [at …]`, `window on <room>.<edge> …`, hosted offsets measured from a
  wall end, a room edge or an axis, and semantic segment selectors.
- Wall-first authoring stays fully legal. Plans not using the new forms stay byte-identical.
- This closes backlog **G.12** and needs a new ADR (card PS3.1) before code.
- *Why:* it is the single change that makes "the room grows, the walls follow" true. It removes three
  defect classes at the point of writing, and it matches how LLMs succeed (prior art). It is
  closed-form with every target named, so ADR 0004/0005 allow it in `compile()`.
- *Reverse if:* the resolve-order change (rooms and relational placement before walls) cannot be made
  byte-identical, or `place`-frame semantics for datums cannot be made sound. In that case ship datums
  in wall points only and keep `between` as an explicit `arch` transform.
- *Re-stated 2026-10-26 (D21):* a claim about the authoring form, not the surviving-defect rate; see D21.

**D2. Validity in `lint`, quality in a separate taste score.**
- Only plain defects become `W_*` lint rules (§6 PS2).
- Professional quality goes to `arch score --taste <profile>` (PS5): 0–1, sourced, capped at 0.5
  while any validity rule fails (amended by D11: a validity-layer lint warning), never gating.
- *Why:* taste is profile- and culture-dependent, and putting it in `lint()` would move the lint
  output across the whole corpus for every tweak. A separate meter can evolve freely, and agents can
  still optimise it.
- *Reverse if:* agents measurably ignore a separate score.
- *Re-stated 2026-10-26 (D20):* the reverse-if was met; the score is read by the reviewer, not expected
  in a cold author's loop.

**D3. Advisory profiles are named honestly.**
- Thresholds from codes ship as `cn-residential-advisory`, `uk-residential-advisory` and
  `us-residential-advisory` (plus the existing `accessibility-advisory`), never as `gb50096` or `irc`
  (ADR 0005; `src/lint/ruleset.ts` ~113-118).
- Every number cites its source in a doc comment.
- A value remembered rather than read in the standard (marked [M] in `research/design-taste.md`) is
  verified before it ships in a message.

**D4. This document lives here; private follow-ups live privately.**
- The language programme is public: `docs/plans/plan-soundness/`, not published to the site.
- Consumer (ArchCanvas) loop changes and marketing-asset corrections are tracked in the owner's
  private repositories.
- Cards land and are deleted here as `docs/backlog.md` does (cite the closing commit).
  `CHANGELOG.md` stays the only record of what shipped.

**D5. The headline relation-first form derives every wall from the room tiling, not one wall per
pair.** (2026-10-18, amends D1; does not reverse it.)
- D1's pairwise forms (`wall … between A and B`, `wall … around […]`) still ship, but they are the
  mixed-authoring forms. The form an agent reaches for first is one statement that derives the whole
  wall set from the rooms: the exterior ring is the outline of the room union, every shared room
  edge becomes a partition, and an open-plan join is stated as an exception
  (`walls from rooms exterior 200 partition 100 { open between kitchen and living }`; grammar
  settled in PS3.1).
- *Why:* with pairwise forms the author must still enumerate every pair, so the most frequent
  "space not enclosed" defect (a shared edge with no wall) is still writable by omission. With a
  whole-tiling derivation it is unrepresentable: a wall exists on every shared edge unless the
  author wrote `open`. That is the HypergraphFormer/BSP property (`research/prior-art.md` §1.1),
  reached in closed form. It also removes "unassigned floor" and "room outside the shell" by
  construction, because the shell *is* the room union.
- *Measured premise* and *preconditions it refuses on*: moved verbatim to
  `research/2026-10-25-ps5-as-built.md` § D5 and D6 detail.
- *Reverse if:* the PS3.1 ADR finds that the exception list (`open between …`, thickness per edge,
  a load-bearing line) grows past three clauses, or the tiling preconditions reject more than a
  quarter of the corpus. Then the pairwise forms stay the headline and this one is dropped.
- *Measured* (PR #222, PS3.0 part A): 15 of 279 storeys refused (5.4 %), all `E_ROOM_NOT_RECTANGLE`,
  with or without the reviewed except list; 15/283 on 2026-10-24. Under the quarter: D5 holds.
  Detail verbatim: `research/2026-10-24-ps3-as-built.md` § D5 measured.
- *Re-stated 2026-10-26 (D21):* a claim about the authoring form, not the surviving-defect rate; see D21.

**D6. The default profile keeps the dwelling-reading rules on; a plan opts out by reading as
non-residential, not by choosing a profile.** (2026-10-20, amends PS2.18's card; does not touch D3.)
- A plan is read as a *dwelling* unless it carries positive non-residential evidence (an `office`
  room and no bedroom or living room, or a measured non-residential label word list); a
  non-residential plan files the typed skip `non-dwelling` for PS2.6's, PS2.7's and PS2.8's
  dwelling arms, `residential-basic` runs them unconditionally, and `W_WET_ROOM_DOOR`'s kitchen arm
  stays on under every reading. The full ruling, word lists and refinements, verbatim:
  `research/2026-10-25-ps5-as-built.md` § D5 and D6 detail.
- *Why:* decided by measurement over the corpus (no residential row loses a warning). Verbatim:
  `research/2026-10-26-readme-history.md` § D6 Why.
- *Reverse-if fired, re-stated 2026-10-25:* the entry said to revisit the reading if a third rule
  needed it. It now has six consumers: the three lint arms above and taste criteria R6, R11 and R12
  (PS5.1b, PR #247; `src/taste/criteria.ts`). The 2026-10-25 audit found R12's dependence recorded
  nowhere (PS5.5 names R6 and R11 only). Re-statement: the dwelling reading is a shared plan fact,
  not a PS2.18 private; it stays heuristic (no declaration) until PS2.14's dwelling marker exists,
  and every new consumer is listed here. PS5.5's text is widened to R12.
- *Reverse if:* PS2.14's dwelling declaration lands (the declaration then decides and the word list
  is retired), or the word list misreads a residential plan in the corpus or the fuzz, or a consumer
  needs a dwelling boundary the heuristic cannot give (then it belongs in a declaration, not a
  heuristic). The former trigger "a third rule needs the reading" fired (see above) and was replaced.

**D7. After §7 row 3, four PS3 cards outside any row ran before rows 4 and 5; and a met row is
followed by a first-contact re-measure.** (2026-10-24, recorded after the fact; amends §7's order.)
- PS3.7, PS3.8, PS3.5 and PS3.9 (PRs #228–#232) landed after PS3.6 although they sat in no §7 row; rows 4
  and 5 were not started. Verbatim: `research/2026-10-26-readme-history.md` § D7.
- *Why:* PS3.7's priority was raised by the 2026-10-18 first-contact audit, where seat-facing defects
  were the largest new class among its 57 defects (9 of 57); PS3.8 came from that audit's finding K1 (a fire exit's door swinging
  inward); PS3.5 and PS3.9 both close gaps PS3.0 left (segment selectors on derived rings;
  Plan JSON for a placed component that derives its walls, refused as E_JSON_DERIVED_IN_INSTANCE
  since PR #223).
- *Standing rule:* after a §7 row is met, re-measure first contact in a dated `audits/` file before
  the next row starts. The re-measure for row 3 is `audits/2026-10-24-first-contact-rerun.md`
  (PR #233).
- *Reverse if:* a later first-contact re-run shows that rows 4 and 5, done in their place, would have
  caught more of the surviving defects than PS3.5/3.7/3.8/3.9 did.

**D8. The `open between` derived opening reports `placement: "absolute"`.** (Decided in PS3.0
part C, PR #224; kept in PS3.4, PR #225; recorded 2026-10-24.)
- `describe().freedom` lists the derived opening as `absolute`, not `relational` or `derived`, while
  PS3.4's `door|opening between` forms report `relational`.
- *Why:* any other word moves the four pinned PS3.0 part C digest rows (SVG + `describe()` +
  `lint()`), a re-pin that ADR 0028 §6 does not require, and the hand-placed twin stays
  byte-identical.
- *Reverse if:* a consumer of `freedom` needs to tell a derived opening from a typed one, or PS3.10
  moves those digest rows anyway; then change the word in the same PR and explain the rows.

**D9. The LLM spec's lead example uses `walls from rooms`, not `wall between`.** (PS3.6, PR #227;
recorded 2026-10-24.)
- PS3.6's card asked for "rooms, then `wall between`, then `door between`"; the shipped
  `LEAD_EXAMPLE` derives every wall with `walls from rooms … { open between … }`.
- *Why:* D5 makes the whole-tiling form the one an author reaches for first; the pairwise forms are
  the mixed-authoring forms, and ADR 0028 §7 (teaching order) already names `walls from rooms`;
  the card's wording predated the ADR. The re-run then measured 6/6 cold authors writing rooms-first, with 0
  `wall` statements.
- *Reverse if:* D5 is reversed, or a re-run shows authors failing on the tiling preconditions more
  often than they omitted walls under the pairwise form.

**D10. The D7 first-contact re-measure after §7 row 4 is waived; the row-3 re-measure
(`audits/2026-10-24-first-contact-rerun.md`, PR #233) stays the baseline for row 5.** (2026-10-24)
- Row 4 changed no language form, lint rule, example or teaching text, so a cold re-authoring would have
  measured the same spec as #233. *Reverse if* (fulfilled): row 4's follow-ups changed authoring-facing
  output, or the re-measure after row 5 did not run; it ran 2026-10-26 (D15, D20). Body, Why and the
  reverse-if as written: `research/2026-10-26-readme-history.md` § D10.

**D11. The taste ADR is 0032, and drafting-layer lint codes never cap the score.** (Lead ruling on
the PS5 design, PR #242; built in PS5.1a, PR #244; ADR 0032 decision 4.)
- Every lint rule declares a required `layer: "validity" | "drafting"` and its `codes`
  (`LintRule`); the cap reads the layer, never a list in the taste module. The annotation family
  is `drafting`, listed under `validity.drafting`; compile-channel and profile-only warnings never
  cap either.
- *Amends D2 and §4:* D2's "capped at 0.5 while any validity rule fails" now reads "while a
  validity-layer lint warning stands"; the drafting layer is a fifth row of §4's layer table
  (sheet checks: never cap, never gate, excepted from `finish`'s never-worse law, D12).
- *Why:* a label over a bed misreports the sheet, not the plan, and a code list kept in the taste
  module would drift from the rules (`test/lint-layers.test.ts` holds every code to one rule). 0030
  and 0031 are reserved by the archlang-3d drafts.
- *Reverse if:* a drafting code turns out to hide a plan defect (then that rule's layer changes,
  with its corpus movement explained), or a rule needs both layers (then it is split).

**D12. The `finish`/`furnish` never-worse law holds under the default ruleset and the universal
profiles only.** (Lead rulings in PR #245, 2026-10-24, and PR #248, 2026-10-25; recorded as the
2026-10-24 and 2026-10-25 amendments to ADR 0024 §6 and ADR 0025 §7.)
- Drafting-layer codes are exempt by layer (`NOT_GATED_DRAFTING`, PR #245); the three
  residential-advisory profiles (`ADVISORY_CODE_PROFILES`) are outside the comparison (PR #248);
  `accessibility-advisory` stays inside.
- *Why:* the law protects the plan's soundness. An overprint reports the annotation, and the
  residential profiles are one jurisdiction's room sizes that disagree with each other by design:
  under them, placing a bed makes a bedroom a double and furnish refused to furnish it.
- *Reverse if:* PS5.6 (`finish --profile`) lands, which holds the law under the chosen profile; or
  PS2.40 makes `furnish` avoid overprints, so the drafting exemption no longer hides a regression.

**D13. `validate --json` `next` puts compile-channel warnings before validity.** (Lead ruling,
PR #246 round 1; deviates from PS5.3's card wording "errors, then validity".)
- Tier order: `error`, `warning` (compile channel), `validity`, `drafting`, `intent`, `profile`,
  `taste`; drafting never ahead of validity.
- *Why:* a door off its wall or overlapping rooms mean the source did not resolve to what it says;
  lint then judges wrongly resolved geometry, so `next` names the upstream cause, not a symptom.
- *Reverse if:* a corpus or first-contact case shows a cosmetic compile warning (one that changes
  no geometry) hiding a validity defect an author would have fixed first; then split the tier.

**D14. Row 5 is met in part.** (2026-10-25, corrected by the stage-end drift audit the same day;
evidence `audits/2026-10-25-first-contact-rerun-row5.md`, PR #249.)
- Row 5 is met in part on 2026-10-25: the taste acceptance holds as worded (concordance 0
  reversed, ledger empty) with these caveats — set B's ordering comes mostly from the 0.5 cap, the
  ledger was emptied by R9 lifting a twin while R7 still prefers its bad case, 4 pairs are
  unjudged and set A's '=' rows are aggregated into 'ordered'; the re-measure (#249) ran before
  #248 and #250 merged (#248 is opt-in only). PS2.11 is outstanding: the four rules with the most
  first-contact hits land first as PS2.11a `W_WC_SIDE_CLEARANCE`, PS2.11b
  `W_FURNITURE_OVER_WINDOW`, PS2.11c `W_FOOTPRINT_TRANSPOSED`, PS2.11d `W_LEAF_ACROSS_DOORWAY`;
  row 5 closes when they merge and the clearances corpus class reaches ≥ 10/18; the rest of PS2.11
  moves to row 6 with a reason.
- *Why:* PS2.11 is a row-5 card, never started, with 13 of the 49 surviving defects in class 5 and the
  clearances class at 5/18; the remainder (PS2.11e) moves because the audits hit it least. Verbatim:
  `research/2026-10-26-readme-history.md` § D14 Why.
- *Reverse if:* PS2.11a–d merge and the clearances class stays under 10/18 (then the threshold or
  the split is wrong, and this entry is re-stated), or a re-measure shows the remainder carrying
  more first-contact hits than the four (then those bullets come back into row 5).
- *Closed 2026-10-25:* PS2.11a/b (PR #252) and PS2.11c/d (PR #253) merged; clearances 11/19, corpus 59/73,
  so row 5 is met in full. Costs carried as cards: PS2.45 (done, PR #268); PS2.50 (done, PR #267), which
  removed the rule's false positives on `tiny-house` and `hillside-villa`.
  Detail: `research/2026-10-26-readme-history.md` § D14.

**D15. D2's and ADR 0032's reverse-if was hit and is not yet assessed.** (2026-10-25, stage-end
drift audit.)
- D2's and ADR 0032's reverse-if ("agents measurably ignore a separate score") was hit by the 0/6
  uptake but is not yet assessed, because the measuring protocol's dispatch prompt names
  `compile|lint` only and the author role (`.claude/agents/arch-author.md`, not shipped in the
  package) changed in PR #250. The test that decides it: the next re-measure runs two arms on the
  same briefs — (A) spec text only, with the pre-#250 role text, (B) the current role — and counts
  `score --taste` and `validate` calls; taste stays an author tool only if arm A shows calls.
  PS7.4 stays `doing` until then.
- *Why / Reverse if:* arm A holds the role fixed so the spec text alone is measured; if arm A showed no
  calls, D2's reverse-if is met (taste becomes a reviewer's tool, D2 re-stated), else this entry closes.
  It showed none (Closed, below). Verbatim: `research/2026-10-26-readme-history.md` § D15.
- *Closed 2026-10-26:* arm A 0 calls; D20.

**D16. The README stays small; the cards live in `cards.md`.** (2026-10-25.)
- §6's card tables and card texts moved to `cards.md`, with the same tables, ids and status words.
  §6 keeps each family's header, one line counting its done/doing/todo cards, and the pointer.
  The limit: README ≤ 60,000 bytes; `cards.md` unbounded (§8).
- *Why:* the README had grown past 70 KB, mostly from open cards; a new session reads §1–§5 first
  and needs the decisions and the order, not every card's text.
- *Reverse if:* a new session misses `cards.md` (picks work from the README alone, or files a
  duplicate card); then move the `todo` tables back.

**D17. The drawing-change iron law gains a drafting-layer carve-out.** (PR #245, 2026-10-24;
`AGENTS.md` and `docs/agents/iron-laws.md`.) *Ratified 2026-10-25 under D18: the owner delegated the
pending rulings to the coordinator and asked for the best decision; the reasons are below.*
- "A drawing change never moves `describe()`/`lint()` over the corpus" now has the exception
  "except drafting-layer lint rules, which read the sheet". `W_ANNOTATION_OVERLAP` and
  `W_TITLE_OVERFLOW` build the storey's Scene, so a renderer change can move them; such a PR lists
  each moved plan, says whether plan or renderer was wrong, and proves nothing else moved (the
  swap-back law in `test/byte-identity-baseline.ts`).
- *Why:* those defects exist only on the sheet; no plan fact can see a label printed over a bed.
  Ratified rather than rolled back because the alternative, a separate sheet check, would split the
  author's loop into two tools, against D2 and the `validate --json` `next` design (PS5.3), and
  because the carve-out is narrow and mechanical: it applies by `LintRule.layer` only, never by
  code list, and every such movement is listed plan by plan under the swap-back law.
- *Reverse if:* a drafting-layer code moves on a change that is not a renderer change, or a PR
  excuses a non-drafting movement under this clause; then the two codes leave `lint()` for a
  separate sheet check (as taste left it) and PS2.12 is re-scoped.

**D18. Pending owner rulings are taken by delegation.** (2026-10-25; owner: "关于那些待我裁定的事项，
请你帮我做出最佳决策，然后实施".)
- The coordinator took the rulings that were waiting on the owner on 2026-10-25 and recorded each
  as a decision here with its reasons and reverse-if, so the owner reviews a written ruling instead
  of a question. What was taken under it: `research/2026-10-26-readme-history.md` § D18.
- The owner's sentence named the items pending that day; it is not read as a standing delegation.
  Going forward, an iron-law change is proposed in a PR, recorded here as a D-entry with reverse-if,
  marked *awaiting ratification*, and listed in the stage report; it is applied in code (the law is
  enforced by tests either way) but not cited as precedent until the owner ratifies it.
- *Why:* the owner is not at the keyboard during these runs; a ruling that waits blocks the row, and
  a written ruling is cheaper to overturn than a question is to answer.
- *Reverse if:* the owner overturns one of these rulings; then the overturned entry is re-stated. If
  the owner extends the delegation in words, this entry is widened and says so.

**D19. Two unrecorded practices, written down; one owed measurement.** (2026-10-25, from the
repo-truth audit before the handoff.) *The first bullet touches an iron law's wording; ratified
2026-10-27 by delegation at the owner's request (D18), as is; stands unless the owner objects.*
- *`eval/judge-fixture.json`:* the iron law says regenerate it only for an approved bump. Since
  PS2.5–2.7 (PR #199) every lint PR whose new rule fires on an eval golden has hand-edited that
  golden's `lintWarnings` count (PRs #199, #200, #201, #217, #245, #252, #253; every changed line
  in those diffs is a `lintWarnings` line), touching no other field and leaving `JUDGE_VERSION` at
  "2". Reading: `lintWarnings` is a side count that moves with every new rule, not a judgment;
  bumping it with a per-row reason in the PR body is allowed; no other field of the fixture is
  touched. The iron-law text says so from this PR on. *Reverse if:* a bump ever hides a judgment change, or the
  owner declines the reading; then the counts are frozen and new rules are excluded from the
  fixture's lint count instead. *Ratified 2026-10-27* (above); reverse-if as ratified: a
  `lintWarnings` bump is found to have hidden a `semanticPass` change. PR #283 bumped four rows under
  this bullet alone with no per-row reason in its body; the reasons are now in its as-built record
  (`research/2026-10-26-ps211e-as-built.md` § The face datum and the eval judge).
- *Re-measure order:* D10's mandatory re-measure after row 5 was owed before row 6 and ran 2026-10-26 as
  D15's two arms (D20), so the row-5 residue and row 6 may start. *Reverse if* (moot): the owner asks
  for row 6 to start first. Verbatim: `research/2026-10-26-readme-history.md` § D19.

**D20. D15's two arms ran; D2's reverse-if is met, and taste is re-scoped as a reviewer's tool.** (2026-10-26; evidence `audits/2026-10-26-first-contact-rerun-d15.md`.)
- Result: arm A (spec text only) made 0 `score --taste` and 0 `validate` calls in 65, so D15's test fails
  and the role text alone did not change it (arm B: 0 and 1 in 77). Counts: `research/2026-10-26-readme-history.md` § D20.
- D2 re-stated: validity stays in `lint`; quality stays in a separate taste score, read by the reviewer — the dispatching session, `validate --taste`, and `preview --review` (PS5.4) — and no longer expected in a cold author's loop. The score's design (0–1, sourced, capped under a validity warning, never gating, `taste()` in the API) is unchanged; only its audience is.
- Consequences: an ADR 0032 addendum; PS7.4 `done`; PS7.5 takes the taste step out of the author loop; `validate --json` `next` stays taught. Summary and full text: `research/2026-10-26-readme-history.md` § D20 Consequences.
- Not changed: defects flat (49 → 52 / 54), blockers 0 → 1 per arm (both stairs), rooms-first 6/6;
  row 6 and the row-5 residue may start. Verbatim: `research/2026-10-26-readme-history.md` § D20.
- *Reverse if:* a re-measure whose dispatch prompt names the whole loop (not `compile|lint`) shows at least half of the cold authors running `score --taste` unprompted, or a consumer is shown steering authors by the score; then taste returns to the author loop and PS7.5 is reverted.
- *Closed 2026-10-26:* PS7.5 merged as PR #263 (f024ab4a).

**D21. The walls-first control arm (PS1.3) ran: walls-first is not worse in surviving defects, and D1/D5 are re-stated as claims about authoring, not about the defect rate.** (2026-10-26; evidence `audits/2026-10-26-walls-first-control-arm.md`.)
- Measured on the same six briefs, spec and day: rooms-first (arm A) 52 defects (1 B), walls-first (arm C)
  54 (1 B), within auditor spread. Figures and what walls-first cost: `research/2026-10-26-readme-history.md` § D21.
- Re-statement: D1 and D5 hold as the form an author reaches for first (6/6 cold authors chose it unprompted in four runs) and as the form under which the omission class cannot be written (this arm shows six walls-first authors did not write it either, so the arm neither confirms nor refutes that cost); they are not a claim that rooms-first plans carry fewer surviving defects, because the surviving classes (clearances, defining contents, stairs, annotation, furniture relation) do not depend on how the walls were written, and the class they do remove is now also caught by lint. §8 Q1 is answered to that extent; the open question stays whether a spec that led with walls would change the authors' choice (not run; it would measure the spec's pull, which the card already names).
- *Reverse if:* a walls-first arm under a walls-first spec shows fewer surviving defects than rooms-first by more than the spread the two rooms-first arms showed between themselves (2 in total, 5 in noticeable rows), or shows class-1 defects that lint misses; then D5's headline form is reconsidered.

**D22. `keep` is checked in the compile channel by grade, never solved and never a lint rule.** (2026-10-26; coordinator rulings on the PS4.3 design, PR #270; `research/2026-10-26-ps43-keep-design.md` §12–§14; ADR 0033, Accepted with PS4.3a, PR #272.)
- *R1, grade landing:* `hard` (the default) is a compile-channel `W_KEEP_VIOLATED` that fails `--strict`, counts in the never-worse law and sits in `next`'s `warning` tier; `soft` sits in `next`'s `intent` tier after the brief's gating items and never gates; `advisory` is reported in `describe()`, `validate --json` and `impact` only, never in `next`; no grade caps taste and no keep enters `lint()`. Why: a soft keep in lint would gate `--strict` and the never-worse law as a hard one does while capping taste where a hard one does not, so the grades would not be ordered.
- *R2, plain `validate`:* exits 0 on a broken hard keep; only `--strict` fails. Why: no warning code fails plain `validate` today, and `--strict` is the ship gate the spec teaches.
- *R3, `keep fixed <d> at <mm>`:* the valued form replaces the card's bare `keep fixed …`. Why: a keep that one compile can never find broken is not a check.
- *R4, the four spec cuts* (the `door` "DASHED" sentence, the `garage` sentence shortened, the `outdoor` hatch prose, the GB 50352 citation; 397 UTF-16 units against the keep line's 432, net headroom 236): accepted on the condition that `docs/language-reference.md` keeps every cut fact and the GB 50352-2019 source stays in `src/datum.ts`'s `WINDOW_SILL` doc comment (D3); both checked on `main@98b3d7ab`. Why: the cut text describes only how something is drawn. As built: `research/2026-10-26-readme-history.md` § D22 R4.
- *D4 law, narrowed as built:* the equivariance law (ADR 0033 decision 7) ships over single-storey plans whose keeps name no axis and whose datums include no half-grid centre. Why: the instance route carries no axis and no storey, and `snap` rounds a half toward +∞, so a mirrored half-grid centre snaps one grid from its image (a fault in snapping). *Reverse if* PS0.26 lands (sign-symmetric `snap`, a whole-plan transform): the law widens.
- D22 changes no iron law. *Reverse if:* any trigger in ADR 0033's "Reverse if" list fires, or design §12's reverse-if for the decision a ruling confirms.

**D23. The id-free message law is widened in `docs/agents/iron-laws.md`: it now names `taste()` and the
compile-channel `W_ROOM_OVERLAP`.** *Ratified by the owner 2026-10-26 ("D23 批准"), so it may be
cited as precedent (D18).* (PR #269, 2026-10-26; recorded after the fact, PS2.22, PS2.29.)
- Changed: the iron law "a `lint()` diagnostic's `message` never quotes an element id" gained a naming
  rule (an unlabelled room is named by its use or its place, `src/naming.ts`, shared by `lint()`,
  `taste()` and the `W_ROOM_OVERLAP` compile warning) and a new guard, `test/lint-messages-id-free.test.ts`
  (the whole corpus, the catalogue examples and a label-stripped twin of each), beside
  `test/lint-fix-texts.test.ts`. It is applied in code and enforced by those tests.
- *Why:* PS2.29's acceptance and ADR 0032 decision 6 already required it; a message is wrong in `taste()`
  and the compile channel for the reason it is wrong in lint. The PR recorded no D-entry (D18 asks for one).
- *Reverse if:* the owner declines. The wording reverts to lint-only and the `taste()` and compile-channel
  rows (PS2.57 covers the remaining compile, `describe()` and CLI texts) are re-filed as cards.

**D24. The keep weak-law baseline is re-taken by its generator, never by hand, whenever a later PR
legitimately moves a hashed output; the reason is recorded in the table header and the commit.**
(2026-10-26; coordinator ruling on PR #280, PS2.11e.)
- Changed: `test/keep-byte-identity-baseline.ts` (K1 of ADR 0033 decision 7) was taken once on the tree
  before any keep code, and its header forbade a re-take on a tree with keep code. A lint rule, a drawing
  fix or an example edit moves its SVG, `describe()`, `lint()` or `validate --json` hashes for reasons
  that have nothing to do with `keep`; such a PR now re-takes the whole table with
  `test/keep-weak-law-gen.ts` (whose header states the rule), records why in the table header and lists
  the moved files in the commit message. Rows are never edited by hand.
- *Why:* a hand-edited row is indistinguishable from a blessed one, and the alternative, freezing the
  table, would turn every later corpus change red for a law it does not touch. The generator measures
  with the test's own body, so a re-take cannot drift from what the test checks.
- *Reverse if:* a re-take ever hides an unexplained movement (a row moving in a re-take whose commit
  does not name it). The generator then lists per-row reasons, as the other digest tables' headers do.
- *Ratified 2026-10-27 by delegation at the owner's request (D18); stands unless the owner objects.*
  It overrides ADR 0033 decision 7's "a baseline taken before code lands", within a boundary: a PR
  that touches keep code (`src/keep.ts`, the keep branch of `src/analyze/depends.ts`, `src/impact.ts`'s
  keep handling) may not re-take K1; a re-take happens only in a PR that changes no keep code, by the
  generator, with the moved files listed in the commit. The three re-takes so far comply (no keep code
  in PR #280 or #283): `4f5f456e` (#280, 17 moved), `ade61803` (#283, 72 moved, 4 added), `8a9533de`
  (#283, 5 moved). Recorded as a dated amendment to ADR 0033 decision 7 (still Accepted). *Reverse if:*
  a re-take lands in a PR that touches keep code.

**D25. The doorway-approach datum moves to the wall face; three eval holdout judgments move with
it.** *Ratified by the owner 2026-10-26, so it may be cited as precedent (D18).* (2026-10-26, coordinator ruling on PR #283; PS2.54, PS2.11e.)
- Changed: `W_DOORWAY_BLOCKED`'s approach is measured `doorwayLandingMm` past the wall's FACE (PS2.54,
  `doorLandingRect`), and it reads cased openings (PS2.11e). Three eval holdout goldens now raise it,
  a physical failure for the judge (`eval/run.ts`'s `PHYSICAL_CODES`), so `eval/judge-fixture.json`
  sets their `semanticPass` to false, `physicalWarnings` to 1 and their failure line, with a per-row
  reason in the fixture's `notes`; `JUDGE_VERSION` is unchanged. `test/eval-offline.test.ts` reads
  the three from those notes and holds each to that one finding.
- Consequence: the eval:ci gate compares against the fixture, never requires 26/26. A gate that
  required every golden to pass could not be green under a ratified `semanticPass: false`, so
  `eval/run.ts`'s offline exit is 1 only when a golden differs from `eval/judge-fixture.json` (one
  recorded as passing that now fails, or whose `physicalWarnings` or `lintWarnings` differ, or one
  with no row), printing `✗ n golden(s) regressed against the fixture` with each named; otherwise
  `✓ 23/26 pass, 3 recorded as failing (D25)`. `JUDGE_VERSION` unchanged; no threshold anywhere
  (coordinator ruling on PR #283). The owner's ratification covered the three judgments only; this
  gate bullet (6d916d40) is *ratified 2026-10-27 by delegation at the owner's request (D18); stands
  unless the owner objects*, on the condition that a fixture row is recorded as failing only when its
  `notes` names a ratified D-entry, and that the gate prints the count of recorded failures (it does:
  `fixtureVerdict`, `eval/run.ts`). *Reverse if:* a recorded-failing row survives the reversal of the
  D-entry it cites.
- *Why:* the goldens' pieces really stand inside the approach read from the face:
  `dims-auto-cottage`'s WC 250 mm off the bath door's face, over 100 of its 800 mm;
  `galley-kitchen`'s basin 250 mm off the bath door's face, over 150 of 800 mm; `compact-studio`'s
  kitchen sink 250 mm off the kitchenette opening's face, over 350 of 1000 mm. Moving a holdout
  judgment goes beyond D19's `lintWarnings`-only practice for a lint PR, so the owner ratified it.
- *Reverse if:* if the owner later reverses D25, the datum returns to the centreline for
  `W_DOORWAY_BLOCKED` only (T2 and `clearances/bed-before-door-face` move back to missed) and the
  three judgments and their fixture notes revert.

**D26. §7 row 6 is met in part; the first-contact prompt stays frozen and the next re-measure adds
a whole-loop arm.** (2026-10-27; evidence `audits/2026-10-26-first-contact-rerun-row6.md`.) *Decided
by delegation (D18); stands unless the owner objects.* A measurement record, not an iron-law change.
- Row 6: every card landed and the D10 re-measure ran: 61 defects (2 B) against 52 / 54 / 54; 12
  reported by the final lint, all on the two plans whose authors stopped early, so not a gain; the
  stair blocker named by lint; the residual families unchanged. The review-sheet clause is false as
  built (PS5.4 probes: p2-for 0/2, p10 5/8, p3 4/6); PS4.6 is the remainder.
- Reading: defects do not fall with rules alone; the stopping rule and the families with no rule bind.
- *Run result (PS7.8, 2026-10-27, `audits/2026-10-27-first-contact-rerun-ps78.md`, `main@134765d1`):*
  the frozen arm drew 64 defects (4 / 29 / 31), `validate` 0 / 6, 3 authors stopping with warnings
  standing; the whole-loop arm drew 56 (1 / 19 / 36), `validate` 6 / 6 (`--stage` 4 / 6, batched,
  never gated), every plan lint-clean with `next` null, 0 stopping early, and final lint reports 0 of
  its 56: the loop removes what lint sees and leaves the no-rule families. First read of the
  reverse-if: not met (fewer defects); one more re-measure with both arms decides it.
- Ruling: the protocol's frozen prompt ("stop when it compiles", every run since 2026-10-24; authors
  stopping with warnings standing 0 / 0 / 2 / 2 under it, arms A, B, C, row 6) stays unchanged for
  comparability, and the next re-measure adds a second arm whose prompt names the whole loop
  (compile → `validate --stage` → lint → repair, until `next` is `null`), so the uptake of
  author-facing surfaces can be seen at all (PS7.8).
- *Why:* changing the prompt alone would move the instrument with the treatment (the PS7.4 lesson);
  keeping it alone leaves the role's loop (PS7.5, PS7.1) unmeasured.
- *Reverse if:* the whole-loop arm shows no fewer defects than the frozen arm over two re-measures;
  then the second arm is dropped.

**D27. Row-7 tranche 2's sourcing rulings: PS2.67 beds only on a consumer figure, PS2.68 blocked,
PS2.71 taste.** (2026-10-27; `research/2026-10-27-ps267-271-sources.md`, PRs #306, #315.) *Decided by
delegation (D18); the D3 exception is awaiting ratification.*
- PS2.67 judges `bed`, `double_bed`, `bunk_bed` only (never `crib`, `cot`): no read source sizes a
  shower tray or exam couch (each a new card once one is). `W_BED_UNDERSIZED`'s 1900 × 750 mm is
  Which? (a magazine, [M]), in `DEFAULT_RULESET` only: profiles take [V]/[S] figures.
- D3 exception: the bed figure ([M]) and PS2.69's 914 mm (IRC R311.3, [S]) ship unverified, each
  message naming its source.
- PS2.68 is blocked: no sourced push-back allowance (trade guides say 6, 12 or 18 in); `todo` until
  Time-Saver Standards, Panero & Zelnik or Neufert is read.
- PS2.71 is taste (D2): a low bed under a sill blocks neither light nor use; draught, curtain reach
  and light are preferences.
- *Reverse if:* a standard (BS, EN, GB/T 3328-2016's table) gives another bed minimum (follow it);
  the owner rejects the D3 exception (both defaults `null` until read); a code forbids a bed head
  under a window (PS2.71 becomes lint).

## 4. Principles: what "professional rules and taste" means here

**Five layers, treated differently** (Drafting added by D11):

| Layer | Meaning | Mechanism | Gates? |
|---|---|---|---|
| Valid | Geometry and topology are not self-contradictory: an opening sits on a wall and clear of junctions, rooms are enclosed, rooms are reachable | `W_*` lint | `validate --strict` |
| Advisory code | Sourced numeric thresholds: areas, widths, daylight ratio, fixture clearances | Lint profiles (D3) | Opt-in |
| Intent | This project's contract: brief-given sizes, room program, "these two must connect" | intent brief, `keep` (PS4) | Yes, except adjacency and reachability, which stay advisory by iron law |
| Drafting | The sheet, not the plan: annotation collisions, title overflow, dimension text (D11) | `W_*` lint rules with `layer: "drafting"` | Never; never cap taste; `finish`'s never-worse law excepts them (D12) |
| Taste | Privacy gradient, day/night zoning, light on two sides, alignment, proportion, façade rhythm | `score --taste` (PS5) | Never |

**The reviewer's tools** (D20): `score --taste` (the score) and `preview --review` (PS5.4: every
warned element ringed and numbered, the access graph, close-ups of flagged openings and pieces).

**The hold-fixed ladder: what stays when a number changes.** Higher tiers hold, and lower tiers follow:

> the brief's given numbers → site and lot → party walls and unit boundaries → structural axes →
> stair and lift shafts → wet stacks → façade opening rhythm → entrance → partitions → room sizes →
> doors → furniture → annotations

- Three rungs were missing from the first draft (2026-10-18): the **brief's given numbers** sit
  above everything else because they are the one thing the user said (PS4.4 makes them checkable);
  **party walls and unit boundaries** sit between the lot and the structure, because a wall shared
  with a neighbour never moves to widen a room (the multi-dwelling work in §8 needs this rung);
  **annotations** sit at the bottom, because a dimension or label follows what it measures and
  never holds anything (`W_DIM_TEXT_MISMATCH` is the check that it did follow).
- An edit that crosses tiers (moving a wet stack to widen a room) must be explicit.
- The ladder is enforced by hosting (openings follow their wall, furniture its anchor), by `keep`
  declarations, and by `impact`'s ordering. It is never enforced by prompt text.
- Default for a hosted door: hold it to the **nearer corner or room edge**, not the wall start.
  `at %` is right for a centred window and wrong for most doors.

**Rules of engagement for every new check:**
- Read facts, never guess from ids or labels: the label-regex inference ADR 0005 calls dishonest.
- Derive positions from the shape, never a bounding box (iron law).
- Pair every topology rule with a size or width floor, or an agent will satisfy it by shrinking rooms
  to slivers (RLVR floor-plan reward-hacking, `research/prior-art.md` §6).
- Messages give the measured fact with numbers first, then one line of reason with its source, then
  geometric options whose preconditions were checked against adjacency, then an "accept if" clause.
  No "shrink until silent" fixes. Machine fixes only where the edit is unique (ADR 0011).
- Report coverage: a skipped rule family is visible, not silent.

## 5. Guardrails (do not re-litigate)

- `compile()` stays pure, sync, deterministic and bounded. Charge steps before allocating.
  Budgets are counts, never time.
- No layout optimizer inside `compile()`. A solver is an explicit source-to-source transform only
  (ADR 0006).
- A new language form ships a byte-identity law (SHA-256 of SVG + `describe()` + `lint()`, plus
  `compile().diagnostics` when the resolver is reached).
- New `W_*` codes append to `LINT_RULES`. Any movement of corpus `lint()` output is explained per
  rule in the commit and test ledger, never blessed.
- Lint messages name things as a person would and never quote ids; ids go only in `hint`.
- Intent adjacency and reachability assertions stay advisory (`gate: false`).
- **Working rules the owner set in words (2026-10-18 to 10-25; the transcript audit of 10-25 found
  them kept in memory files only, so they live here now):** the coordinating session plans,
  reviews and dispatches; executors on other models and effort levels do the work in worktrees
  branched from `main`, and the mix is deliberate (sonnet for mechanical edits and docs, haiku for
  gate runs, opus for rule design and red team), stated in the stage report. Executors run build,
  typecheck, the touched tests and the digest suites locally, plus `typecheck:all` when `test/`
  changes and `check:drift` when a generator input changes; the `CLAUDE.md` floor (`check` +
  `check:drift`) is met by CI, which is the full gate; editing an example touches every corpus-wide
  suite (see `handoff.md` § Brief template). At most two red-team
  rounds per PR; residue becomes cards; repo tests are never removed to go green. PRs merge on green
  CI plus a reviewed diff, pinned to the reviewed commit. Every completion claim is checked against
  raw `git`/test output. Each stage ends with a report to the owner in Chinese that quotes the raw
  verification output. When the owner says stop, work that cannot be paused (an open PR under
  review, a running CI) is finished and the rest paused, with the resume point written to
  `handoff.md`.
- Never claim a model-loop gain or its absence, and never run the paid eval (T3 is declined for good).
- Never fix a defect by editing a golden. A new rule that fires on an example is either a real defect
  in the example (fix the example, explain it) or a false positive (fix the rule).

## 6. Workstreams and cards

Status words: `todo`, `doing`, `done` (at most three lines: id, title, status, PR, commit), `parked`.
Dependencies are by card id. Each card's gate is the backlog floor gate plus what it lists.
The cards themselves live in `cards.md` (D16); each family below keeps one count line.

### PS0 · Bugs found by the audit (independent; file and fix first)

24 cards in the table: 5 done, 19 todo (PS0.28, PS0.29 filed 2026-10-27; PS0.1, PS0.7 and PS0.10–PS0.12 landed earlier, listed in `cards.md` above the table). Cards, tables and as-built pointers: `cards.md` § PS0.

### PS1 · The defect corpus (do this before PS2; it is the yardstick)

8 cards: 4 done (PS1.3, D21; PS1.4, no wording rule), 4 todo (PS1.5–PS1.8). Cards, tables and as-built pointers: `cards.md` § PS1.

### PS2 · Validity checks that read existing facts (small, high yield)

82 cards: 37 done, 45 todo (nine done 2026-10-27, corpus 77/84; PS2.68 blocked, PS2.71 taste, D27; PS2.78 filed). Cards, tables and as-built pointers: `cards.md` § PS2.

### PS3 · Relation-first authoring (D1 + D5; needs an ADR)

14 cards: 10 done, 4 todo. Cards, tables and as-built pointers: `cards.md` § PS3.

### PS4 · The change model: what follows, what stays, what breaks

12 cards: 6 done, 6 todo (PS4.6, PS4.7; PS4.8–PS4.10 filed by the PS4.3 design, PS4.12 by PS4.4). Cards, tables and as-built pointers: `cards.md` § PS4.

### PS5 · The taste layer and the review sheet (D2)

7 cards: 4 done, 3 todo. Cards, tables and as-built pointers: `cards.md` § PS5.

### PS6 · `arch solve` (explicit transform; last)

1 card: 1 parked. Cards, tables and as-built pointers: `cards.md` § PS6.

### PS7 · Staged authoring for agents

10 cards: 8 done, 1 todo (PS7.9 the spec headroom), 1 parked; PS7.7 (PR #298), PS7.8 (PR #309, D26) and PS7.10 (PR #314) done 2026-10-27. Cards, tables and as-built pointers: `cards.md` § PS7.

## 7. Suggested order and acceptance

| Order | Cards | Done when |
|---|---|---|
| 1 | PS0.1, PS0.7, PS1.1 | Done 2026-10-18 (PRs #195, #196, #197); corpus catch rate 7/53 |
| 2 | PS2.1–PS2.9, PS2.13 | Defect-corpus catch rate ≥ 90 % for classes 1, 2, 3, 4 and 6, no false positive on the clean twins, every corpus `lint()` movement explained. *Status:* met 2026-10-20 (PRs #214, #216, #217; 46/68) |
| 3 | PS3.1, PS3.2, PS3.0, PS3.3, PS3.4 | ADR merged; byte-identity law green; `relational.arch` lints clean with walls derived; the widening drill moves walls and doors with the room; the class-2 cases are unwritable in the D5 form. *Status:* met 2026-10-23 by PS3.6 (PR #227) |
| 3a | PS3.7, PS3.8, PS3.5, PS3.9 (and PS0.19) | Unplanned, after row 3 (D7): PRs #228–#232. Re-measure PR #233: defects 57 → 48, blockers 4 → 2; corpus 47/70 |
| 4 | PS0.4, PS4.1, PS4.2, PS4.5 | The widening drill's `impact` names every moved, held and broken item correctly. *Status:* met 2026-10-26: PS4.2 (PR #240, 7954f252) named the moved and broken items; PS4.5 (PR #281) reports the shell and `p` as held, with their gaps |
| 5 | PS5.1–PS5.3, PS2.10–PS2.12 | The taste score separates the corpus's known-bad from known-good plans monotonically; the clearances corpus class reaches ≥ 10/18. *Status:* met 2026-10-25 (D14); PS2.11a–d merged (PRs #252, #253), clearances 11/19, corpus 59/73. Status and re-measure history: `research/2026-10-26-readme-history.md` § §7 row 5 |
| 6 | PS4.3, PS4.4, PS5.4, PS7.x, PS2.11e | **Met in part** 2026-10-27 (D26). The row is met when: `keep` invariants and brief-bound sizes are checked by `validate`, the widening drill reports a broken `keep` with its signed residual, and `preview --review` rings every flagged element; a re-measure closes the row (D10). *Status:* every card landed (PRs #267–#286) and the D10 re-measure ran (`audits/2026-10-26-first-contact-rerun-row6.md`, figures in D26); the review-sheet clause is false as built: **PS4.6** is the remainder. Detail: `research/2026-10-26-readme-history.md` § §7 row 6. Order: `handoff.md` § 4 |
| 7 | PS6.1 | — *Status:* in progress: tranche 1 (PS2.64–PS2.66, PS7.7; PRs #296–#301) and tranche 2 (PS2.67, PS2.69, PS2.70, PS2.72, PS2.74, PS2.77, PS7.8, PS7.10; PRs #305–#315) landed 2026-10-27; corpus 77/84 |

Rows 1–4 as they stood before this pruning, verbatim: `research/2026-10-25-ps5-as-built.md` § §7 rows 1–4.

The drill used in rows 3 and 4: `repro/widen-before.arch` → `repro/widen-after.arch`, and the studio
example widened by 500 mm (`repro/README.md`).

## 8. Room to think: open questions and how to extend this plan

This plan is a hypothesis about what will make AI-written plans professional. Treat it that way.

**Open questions worth a fresh investigation:**
1. **Are rooms or walls the better primary for LLM authors?** D1 bets on rooms. A small, unpaid
   experiment can test it: author the corpus briefs both ways with the CLI loop and compare defect
   counts on the PS1 corpus. Do not run or cite the paid eval. Scheduling: `research/2026-10-26-readme-history.md` § §8 Q1 scheduling.
   *Answered in part (PS1.3, D21):* walls-first is not worse; open: would a walls-first spec change
   the choice (`research/2026-10-26-readme-history.md` § §8 Q1, and § §8 Q1: the answer sentence).
2. **Where is the boundary between a fact and taste in each culture?** For example, a kitchen as the
   entry room is normal in some housing stocks. Profiles may need a `residential-generic` that is
   deliberately quiet.
3. **Which diagnostic wording repairs best?** No controlled study exists for a spatial DSL
   (`research/prior-art.md` "Gaps"). The defect corpus plus a local, unpaid loop could measure it.
   *Measured 2026-10-26 (PS1.4):* no wording rule is supported: `current` repaired best on both models, by 1 case on
   sonnet, under the 3-case margin (`research/2026-10-26-ps14-diagnostic-wording.md`). Follow-ups: PS1.8.
4. **Can `between`-style forms cover non-rectilinear rooms?** Polygon and circle rooms are refused
   in v1 of PS3. What would an honest extension be?
5. **What would make `impact` a planning tool, not just a report?** For example, "list the edits that
   keep every `keep` true". *Designed 2026-10-26 (PS4.3, ADR 0033):* `impact` lists the keeps a change breaks; listing the edits that keep them all true stays `arch solve` (PS6.1). Detail: `research/2026-10-26-readme-history.md` § §8 Q5.
6. **Multi-dwelling and multi-storey rules.** Toilet over habitable room below (GB 50096 5.4.4,
   mandatory), wet-stack alignment, and units sharing a corridor. These need a dwelling concept
   ArchLang lacks. *Researched 2026-10-18* (`research/2026-10-18-furniture-and-multistorey.md`
   Part B): became cards PS2.14–PS2.16. Still open: wet-stack rules (`research/2026-10-26-readme-history.md` § §8 Q6).
7. **Furniture semantics.** Facing targets (a TV faces the sofa or bed, a bed head is against a wall,
   dining chairs face the table) as relations rather than rotations (ADAI's semantic reconstruction,
   `research/adai-sketchup.md` idea 7). Became PS3.7 (same file, Part A); open: how often agents
   turn furniture wrong (Q8 counts it).
8. **Anything the audits missed.** Run a fresh audit on new plans after each §7 row (D7, D10; done 2026-10-24, 2026-10-25 and 2026-10-26 (D20)).  First round: `research/2026-10-26-readme-history.md` § §8 Q8: the 2026-10-27 cut. Still uncarded: context modelled
   inside the plan (a common corridor as paving; PS2.14's dwelling work should give it a home),
   vertical stacking of partitions, oblique joins inflating `bbox_outer`, circulation share (taste). Re-run and count the furniture turn each time (same file, § §8 Q8).
9. **Should a `let` be able to hold a room-edge datum?** PS3.2 part B (PR #221) refuses it
   (`E_DATUM_BEFORE_ROOMS`: a `let` is evaluated once, at expansion, before any room is placed).
   The alternative considered and declined there was a deferred `let`, evaluated where it is read;
   it forks `let` into two evaluation modes, so it becomes a card only if authors ask for it.

**How to extend this document:**
- **New evidence:** add a dated file under `research/` or `audits/`. Never rewrite an old report;
  correct its conclusions here in the card it affects, with a one-line reason.
- **A new idea:** add a card in the right workstream of `cards.md` with goal, design, acceptance and open
  questions, and mark which prior evidence supports it. If it changes a decision in §3, add a new
  decision (D5, …) that names what it supersedes and why. The paid eval stays with the owner; a
  release starts only when the owner asks (`docs/agents/iron-laws.md` § Owner policies). An
  iron-law change is proposed in a PR, recorded here as a decision with its reverse-if and marked
  *awaiting ratification* until the owner ratifies it in words (D18).
- **Size limit (D16):** README ≤ 60,000 bytes (`wc -c`); `cards.md` unbounded. New cards go in
  `cards.md`; update the family's count line in §6.
- **A card lands:** in `cards.md`, cut it to its `done` line (PR and commit), move any as-built
  note verbatim to a dated `research/` record, update §7, and record the release story in `CHANGELOG.md` only.
- **A card turns out wrong:** say so in the card, keep the reason, and change course. Symptoms have
  been reliable; stated causes have been wrong about as often as right (`docs/backlog.md`).
- **When the programme is done:** fold the lasting decisions into ADRs, delete this folder, and
  archive the research outside the repository, as the backlog does with closed entries.

## 9. Files in this folder

- `README.md`: this plan. `handoff.md`: the resume point, re-written at every stage end. `cards.md`:
  every card of §6 (D16). `evidence.md`: what was measured, the bug list and the defect taxonomy.
- `audits/first-contact-protocol.md`: the six briefs, the dispatch prompts, the rubric, the arm A
  role-text pointer and the re-measure checklist (PR #257, 053ba3f8).
- First-contact runs (`audits/`; the plans in `audits/first-contact-plans/`):
  `2026-10-18-first-contact.md` (57 defects, twelve classes outside the taxonomy),
  `2026-10-24-first-contact-rerun.md` (after row 3, D7), `2026-10-25-first-contact-rerun-row5.md`
  (after row 5, D10, D14), `2026-10-26-first-contact-rerun-d15.md` (D15's arms A and B, 52 / 54, D20),
  `2026-10-26-walls-first-control-arm.md` (PS1.3, arm C, 54, D21),
  `2026-10-26-first-contact-rerun-row6.md` (row 6, 61, D26), `2026-10-27-first-contact-rerun-ps78.md` (PS7.8, 64 / 56). Per-plan defects with coordinates:
  `audits/archcanvas-public-examples.md`, `audits/showcase-and-examples.md`.
- Research (`research/`): `checks-inventory.md` (every check, the gap list), `prior-art.md`,
  `associativity.md` (the P1–P7 design), `design-taste.md` (37 sourced rules, ResPlan priors),
  `adai-sketchup.md` (ideas only; CPAL), `2026-10-18-room-tiling.md` (the D5 premise),
  `2026-10-18-furniture-and-multistorey.md` (PS3.7, PS2.14–PS2.16), the designs
  `2026-10-24-ps5-taste-design.md` (row 5) and `2026-10-26-ps43-keep-design.md` (row 6),
  `2026-10-26-ps14-diagnostic-wording.md` (PS1.4), and `2026-10-26-readme-history.md` (README text
  moved out, verbatim; its § §9 keeps the longer description of each file).
- As-built records (`research/`, landed cards' notes verbatim): `2026-10-24-ps0-ps2-`, `2026-10-24-ps3-`,
  `2026-10-25-ps5-` (also row 5's PR rulings, §7 rows 1–5, D5/D6 detail), `2026-10-25-ps211ab-`,
  `2026-10-25-ps211cd-`, and of 2026-10-26 `ps211e-`, `ps211e-stairs-`, `ps229-`, `ps245-`, `ps250-`,
  `ps43a-`, `ps43b-`, `ps44-`, `ps45-`, `ps54-`, `ps71-`, `ps72-`, `ps75-`, `ps76-as-built.md`, and of 2026-10-27
  `ps266-`, `ps267-`, `ps269-`, `ps270-`, `row7-as-built.md` (row-7 card texts); `2026-10-27-ps267-271-sources.md` (D27).
- `repro/`: minimal reproductions (see its README).
