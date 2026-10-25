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
defects 57 (2026-10-18) → 48 (10-24) → 49 (10-25), blockers 4 → 2 → 0, rooms-first 6/6, taste report
used by 0/6 authors. Corpus catch rates (§7) are the means; this number is the end. It is not yet met:
49 defects still pass lint, and the 10-25 run predates the clearance rules (PS2.11a–d).

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

*This section is the 2026-10-18 baseline, kept as written because it is the evidence the plan was
made from. Much of it is no longer true of `main`: the rules it says are missing now exist (45 lint
rules, 22 new `W_*` codes), the dimension that "lints clean" raises `W_DIM_TEXT_MISMATCH`, the
family-apartment reconstruction lints 34 warnings over 11 codes, and the coverage report says what was
not checked. Today's state is `handoff.md` § 1 and § 3.*

- **About 120 verified defects across about 30 plans; lint caught a handful.** The plans audited:
  - the ArchCanvas public examples (10 plans), with 6 blockers;
  - the ArchLang showcase (12 plans);
  - ArchLang's own `examples/`;
  - one reconstructed published plan (`repro/family-apartment.arch`).

  Default lint on that reconstructed plan returns only fixture-rotation warnings. One `arch fix` run
  plus one hand edit makes it pass `validate --strict` with every architectural defect still present.
- **Fresh plans confirm it (2026-10-18).** Six briefs written cold by an AI author from `spec.llm.md`
  alone end lint-clean and strict-clean with 57 verified defects, 4 of them blockers; lint caught
  none, and 26 fall outside the eight classes below (`audits/2026-10-18-first-contact.md`).
- **The flagship example is wrong and lints clean.** `examples/two-bed.arch` says "central corridor".
  Its access graph is a chain: hall → bathroom → master bedroom → kitchen/living → bedroom 2.
  `arch lint` returns `[]`. *(PS3.6, PR #227: re-laid with every room off the corridor, in the room-graph form.)*
- **The facts exist; no rule reads them.** On the family-apartment reconstruction, `describe --json`
  already knows that:
  - the front door opens into the kitchen;
  - the living room is 4 doors deep;
  - `d_living_bed3` actually joins bedroom 3 and bathroom 2;
  - `win_bed1` lights bedroom 2;
  - the living room touches bedrooms 3 and 4 with no wall (geometric adjacency without an access
    edge), while the walking grid walks straight through the missing wall.
- **Change has no consequences.** Making the studio example's living room 500 mm wider needs about
  24 literal edits. Changing only the room size drives the room through a wall that stays put, and
  lint reports only "rooms overlap (allowed)" and "unreachable". A `dim` whose text says 4500 over a
  4000 span lints clean.
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

**D6. The default profile keeps the dwelling-reading rules on; a plan opts out by reading as
non-residential, not by choosing a profile.** (2026-10-20, amends PS2.18's card; does not touch D3.)
- A plan is read as a *dwelling* unless it carries positive non-residential evidence (an `office`
  room and no bedroom or living room, or a measured non-residential label word list); a
  non-residential plan files the typed skip `non-dwelling` for PS2.6's, PS2.7's and PS2.8's
  dwelling arms, `residential-basic` runs them unconditionally, and `W_WET_ROOM_DOOR`'s kitchen arm
  stays on under every reading. The full ruling, word lists and refinements, verbatim:
  `research/2026-10-25-ps5-as-built.md` § D5 and D6 detail.
- *Why:* the two first-contact plans the card cites (4-cafe, 6-clinic) both carry that evidence, and
  no residential example or eval golden does; the heuristic is therefore decided by measurement, and
  the acceptance for PS2.18 is that no residential corpus row loses a warning.
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
- Row 3 was met by PR #227 (PS3.6). PS3.7 (PR #228), PS3.8 (PR #229), PS3.5 (PR #230) and PS3.9
  (PR #232) then landed although they sat in no §7 row (PS3.5 sat in row 6); rows 4 and 5 were not
  started. PR #231 (PS0.19) fixed a pre-existing fuzz failure in the same stretch.
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
- Row 4 (PS0.4 PR #238, PS4.1 PR #239, PS4.2 PR #240, merged 2026-10-24) added analysis tooling only
  (`diffPlans` fixes, `describe --facts depends`, `arch impact`); it changed no language form, no
  lint rule, no example and no teaching text (`spec.llm.md` gained one generated CLI-list line), so
  a cold re-authoring would measure the same spec as #233 did hours earlier.
- *Why:* a re-measure costs a full six-brief authoring run and would return noise, not evidence;
  D7's purpose is to catch drift in what authors are taught, and nothing taught changed.
- *Reverse if:* any row-4 follow-up card (PS4.5–4.7) or a later discovery shows the row changed
  authoring-facing output; and in any case the re-measure is mandatory after row 5, which changes
  lint (PS2.10–2.12), before row 6 starts.

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
- *Why:* PS2.11 is a row-5 card (the 2026-10-19 correction to row 2 moved class 5 here for it) and
  never started; the 2026-10-25 audit counts 13 of the 49 surviving defects in class 5, and the
  corpus clearances class is 5/18. The first version of this entry (PR #251's first commit) called
  the row met on the taste acceptance alone. The remainder (PS2.11e) moves because the audits hit
  it least.
- *Reverse if:* PS2.11a–d merge and the clearances class stays under 10/18 (then the threshold or
  the split is wrong, and this entry is re-stated), or a re-measure shows the remainder carrying
  more first-contact hits than the four (then those bullets come back into row 5).
- *Closed 2026-10-25:* PS2.11a/b merged as PR #252 (486c9cb7) and PS2.11c/d as PR #253
  (43fe7fd6); the defect corpus reads 59/73 with the clearances class at 11/19 (two plans added
  for `sofa-l-transposed`), so the threshold is met and row 5 is met in full. Checked card by card:
  PS5.1–PS5.3, PS2.10, PS2.12 and PS2.11a–d are done; PS2.11e sits in row 6 with its reason. The
  first-contact hits are in the as-built records (`research/2026-10-25-ps211ab-as-built.md`,
  `research/2026-10-25-ps211cd-as-built.md`); the first-contact plans themselves are not re-run
  here, that is D15's two-arm re-measure. Costs recorded there and carried as cards: `finish`
  leaves 30 WC rooms and 16 baths of the 918-room probe empty rather than place a pan the WC rule
  refuses (PS2.45), and two examples (`tiny-house`, `hillside-villa`) carry one honest
  `W_FIXTURE_BACK_TO_ROOM` each until PS2.50 teaches that rule side-on pieces.

**D15. D2's and ADR 0032's reverse-if was hit and is not yet assessed.** (2026-10-25, stage-end
drift audit.)
- D2's and ADR 0032's reverse-if ("agents measurably ignore a separate score") was hit by the 0/6
  uptake but is not yet assessed, because the measuring protocol's dispatch prompt names
  `compile|lint` only and the author role (`.claude/agents/arch-author.md`, not shipped in the
  package) changed in PR #250. The test that decides it: the next re-measure runs two arms on the
  same briefs — (A) spec text only, with the pre-#250 role text, (B) the current role — and counts
  `score --taste` and `validate` calls; taste stays an author tool only if arm A shows calls.
  PS7.4 stays `doing` until then.
- *Why:* one arm cannot tell "agents ignore the score" from "the protocol never showed it to them";
  arm A holds the role fixed so the spec text alone is measured.
- *Reverse if:* arm A shows no calls: then D2's reverse-if is met, taste becomes a reviewer's tool
  (ADR 0032's consequence) and D2 is re-stated. If arm A shows calls, this entry closes and PS7.4
  is done.
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
  of a question. Taken under this entry: D17 ratified; the executor and red-team scratch folders of
  merged PRs (2026-10-23 to 2026-10-25, 45 folders) deleted because their evidence lives in the
  dated `research/` and `audits/` files and the PR bodies; the 2026-10-18 audit scratch kept as
  instructed. Not ruled on (not named by the owner): the remote branch `docs/archlang-3d-plan` and
  the stray worktree directory `.claude/worktrees/agent-a1314d858f0b8b0cb`, both the owner's.
- The owner's sentence named the items pending that day; it is not read as a standing delegation.
  Going forward, an iron-law change is proposed in a PR, recorded here as a D-entry with reverse-if,
  marked *awaiting ratification*, and listed in the stage report; it is applied in code (the law is
  enforced by tests either way) but not cited as precedent until the owner ratifies it.
- *Why:* the owner is not at the keyboard during these runs; a ruling that waits blocks the row, and
  a written ruling is cheaper to overturn than a question is to answer.
- *Reverse if:* the owner overturns one of these rulings; then the overturned entry is re-stated. If
  the owner extends the delegation in words, this entry is widened and says so.

**D19. Two unrecorded practices, written down; one owed measurement.** (2026-10-25, from the
repo-truth audit before the handoff.) *The first bullet touches an iron law's wording and is awaiting
ratification (D18).*
- *`eval/judge-fixture.json`:* the iron law says regenerate it only for an approved bump. Since
  PS2.5–2.7 (PR #199) every lint PR whose new rule fires on an eval golden has hand-edited that
  golden's `lintWarnings` count (PRs #199, #200, #201, #217, #245, #252, #253; every changed line
  in those diffs is a `lintWarnings` line), touching no other field and leaving `JUDGE_VERSION` at
  "2". Reading: `lintWarnings` is a side count that moves with every new rule, not a judgment;
  bumping it with a per-row reason in the PR body is allowed; no other field of the fixture is
  touched. The iron-law text says so from this PR on. *Reverse if:* a bump ever hides a judgment change, or the
  owner declines the reading; then the counts are frozen and new rules are excluded from the
  fixture's lint count instead.
- *Re-measure order:* D10 makes a first-contact re-measure mandatory after row 5 and before row 6
  starts. The only row-5 run (#249) predates #248, #250, #252 and #253, so the row-5 re-measure is
  still owed; it runs as D15's two arms and is the first item of `handoff.md` § 4, before any
  row-6 card. PS2.45, PS2.50 and PS2.22/PS2.29 are row-5 residue and may land before it only if
  they change no measured surface the authors see (PS2.50 and PS2.22/PS2.29 change lint output and
  PS2.45 changes `finish` output, so all of them wait too).
  *Reverse if:* the owner asks for row 6 to start first; then this bullet records the waiver.
  *Closed 2026-10-26:* the re-measure ran as D15's two arms (`audits/2026-10-26-first-contact-rerun-d15.md`;
  D20); the row-5 residue and row 6 may start.

**D20. D15's two arms ran; D2's reverse-if is met, and taste is re-scoped as a reviewer's tool.** (2026-10-26; evidence `audits/2026-10-26-first-contact-rerun-d15.md`.)
- Measured: arm A (spec text only, pre-#250 role) made 0 `score --taste` and 0 `validate` calls in 65; arm B (the current role, whose loop names `validate` as step 3 and `score --taste` as step 5) made 0 `score` and 1 `validate` in 77. Both arms ran under the protocol's prompt, which names `compile|lint` and says stop when it compiles; two arm-B authors said unprompted that they skipped `score --taste`. D15's test says taste stays an author tool only if arm A shows calls. It shows none, and arm B shows that the role text alone does not change that.
- D2 re-stated: validity stays in `lint`; quality stays in a separate taste score, read by the reviewer — the dispatching session, `validate --taste`, and `preview --review` (PS5.4) — and no longer expected in a cold author's loop. The score's design (0–1, sourced, capped under a validity warning, never gating, `taste()` in the API) is unchanged; only its audience is.
- Consequences: (a) ADR 0032 gets a 2026-10-26 addendum under Consequences recording this measurement and the re-scope. (b) PS7.4 is `done`: measured; teaching the step where cold authors read did not change behaviour (arm B over arm A: +1 `validate`, +1 `describe`, 0 `score`). (c) A new card PS7.5 moves the taste step out of the author loop in `spec.llm.md`'s self-correction paragraph (its characters return to the spec budget, which row 6's `keep` form needs), re-words SKILL step 7 as a review step, and reverts `.claude/agents/arch-author.md` to compile → `validate` `next` → lint → repair with taste under a "Review" heading; one PR, after this audit merges; the spec change is a measured surface, so the next re-measure states it. `validate --json` `next` stays taught: it is the validity ordering, not a second score, and its uptake (1 of 12) is a PS7.x staged-authoring question, not a taste one.
- Not changed by this run: the defect count is flat (49 → 52 / 54 under two auditors), blockers 0 → 1 per arm (both stairs: the stair class has no default lint rule but `W_STAIR_UNMATCHED`), rooms-first 6/6 in both arms, `facing` 0 uses in 12 plans. Row 6's content cards (PS4.3, PS4.4, PS5.4, PS7.x, PS2.11e) and the row-5 residue (PS2.45, PS2.50, PS2.22/2.29) may now start: D10's and D19's mandatory re-measure has run.
- *Reverse if:* a re-measure whose dispatch prompt names the whole loop (not `compile|lint`) shows at least half of the cold authors running `score --taste` unprompted, or a consumer is shown steering authors by the score; then taste returns to the author loop and PS7.5 is reverted.

## 4. Principles: what "professional rules and taste" means here

**Five layers, treated differently** (Drafting added by D11):

| Layer | Meaning | Mechanism | Gates? |
|---|---|---|---|
| Valid | Geometry and topology are not self-contradictory: an opening sits on a wall and clear of junctions, rooms are enclosed, rooms are reachable | `W_*` lint | `validate --strict` |
| Advisory code | Sourced numeric thresholds: areas, widths, daylight ratio, fixture clearances | Lint profiles (D3) | Opt-in |
| Intent | This project's contract: brief-given sizes, room program, "these two must connect" | intent brief, `keep` (PS4) | Yes, except adjacency and reachability, which stay advisory by iron law |
| Drafting | The sheet, not the plan: annotation collisions, title overflow, dimension text (D11) | `W_*` lint rules with `layer: "drafting"` | Never; never cap taste; `finish`'s never-worse law excepts them (D12) |
| Taste | Privacy gradient, day/night zoning, light on two sides, alignment, proportion, façade rhythm | `score --taste` (PS5) | Never |

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

20 cards in the table: 5 done, 15 todo (PS0.1, PS0.7 and PS0.10–PS0.12 landed earlier, listed in `cards.md` above the table). Cards, tables and as-built pointers: `cards.md` § PS0.

### PS1 · The defect corpus (do this before PS2; it is the yardstick)

4 cards: 2 done, 2 todo (PS1.3 walls-first control arm, PS1.4 diagnostic wording; both filed 2026-10-25 from the owner's 2026-10-18 asks). Cards, tables and as-built pointers: `cards.md` § PS1.

### PS2 · Validity checks that read existing facts (small, high yield)

60 cards: 19 done, 41 todo. Cards, tables and as-built pointers: `cards.md` § PS2.

### PS3 · Relation-first authoring (D1 + D5; needs an ADR)

14 cards: 10 done, 4 todo. Cards, tables and as-built pointers: `cards.md` § PS3.

### PS4 · The change model: what follows, what stays, what breaks

7 cards: 2 done, 5 todo. Cards, tables and as-built pointers: `cards.md` § PS4.

### PS5 · The taste layer and the review sheet (D2)

7 cards: 3 done, 4 todo. Cards, tables and as-built pointers: `cards.md` § PS5.

### PS6 · `arch solve` (explicit transform; last)

1 card: 1 parked. Cards, tables and as-built pointers: `cards.md` § PS6.

### PS7 · Staged authoring for agents

6 cards: 1 done, 4 todo, 1 parked. Cards, tables and as-built pointers: `cards.md` § PS7.

## 7. Suggested order and acceptance

| Order | Cards | Done when |
|---|---|---|
| 1 | PS0.1, PS0.7, PS1.1 | Done 2026-10-18 (PRs #195, #196, #197); corpus catch rate 7/53 |
| 2 | PS2.1–PS2.9, PS2.13 | Defect-corpus catch rate ≥ 90 % for classes 1, 2, 3, 4 and 6, no false positive on the clean twins, every corpus `lint()` movement explained. *Status:* met 2026-10-20 (PRs #214, #216, #217; 46/68) |
| 3 | PS3.1, PS3.2, PS3.0, PS3.3, PS3.4 | ADR merged; byte-identity law green; `relational.arch` lints clean with walls derived; the widening drill moves walls and doors with the room; the class-2 cases are unwritable in the D5 form. *Status:* met 2026-10-23 by PS3.6 (PR #227) |
| 3a | PS3.7, PS3.8, PS3.5, PS3.9 (and PS0.19) | Unplanned, after row 3 (D7): PRs #228–#232. Re-measure PR #233: defects 57 → 48, blockers 4 → 2; corpus 47/70 |
| 4 | PS0.4, PS4.1, PS4.2 | The widening drill's `impact` names every moved, held and broken item correctly. *Status:* met in part 2026-10-24 by PS4.2 (PR #240, 7954f252); `held` is empty (PS4.5) |
| 5 | PS5.1–PS5.3, PS2.10–PS2.12 | The taste score separates the corpus's known-bad from known-good plans monotonically; the clearances corpus class reaches ≥ 10/18. *Status:* met 2026-10-25 (D14): the taste acceptance holds as worded (44 pairs on 2026-10-25: 40 ordered / 0 tied / 0 reversed / 4 unjudged, ledger empty; 41/37 when #249 ran; caveats in D14); PS2.11a–d merged (PRs #252, #253); clearances 11/19; corpus 59/73. *Re-measure:* `audits/2026-10-25-first-contact-rerun-row5.md` (PR #249; ran before #248, #250, #252 and #253 merged, so the row-5 re-measure is still owed, D19): defects 48 → 49, blockers 2 → 0 (by authoring chance: no row-5 rule touches a stair), 0/6 authors ran taste or `next`. Status history verbatim: `research/2026-10-25-ps5-as-built.md` § §7 row 5 |
| 6 | PS4.3, PS4.4, PS5.4, PS7.x, PS2.11e | **Current** (row 5 closed 2026-10-25). The owed row-5 re-measure, run as D15's two arms (D19), ran 2026-10-26 (`audits/2026-10-26-first-contact-rerun-d15.md`; D20: taste is a reviewer's tool, PS7.4 done, PS7.5 filed), so the row's cards may start: first PS2.45/PS2.50/PS2.22/PS2.29 as row-5 residue, then: `keep` invariants and brief-bound sizes are checked by `validate`, the widening drill reports a broken `keep` with its signed residual, and `preview --review` rings every flagged element; a re-measure closes the row (D10). Order and the open-card map: `handoff.md` § 4. (PS3.5 and PS3.6 already landed, rows 3a and 3) |
| 7 | PS6.1 | — |

Rows 1–4 as they stood before this pruning, verbatim: `research/2026-10-25-ps5-as-built.md` § §7 rows 1–4.

The drill used in rows 3 and 4: `repro/widen-before.arch` → `repro/widen-after.arch`, and the studio
example widened by 500 mm (`repro/README.md`).

## 8. Room to think: open questions and how to extend this plan

This plan is a hypothesis about what will make AI-written plans professional. Treat it that way.

**Open questions worth a fresh investigation:**
1. **Are rooms or walls the better primary for LLM authors?** D1 bets on rooms. A small, unpaid
   experiment can test it: author the corpus briefs both ways with the CLI loop and compare defect
   counts on the PS1 corpus. Do not run or cite the paid eval. *Scheduled:* it needs the PS3 forms
   to exist, so it runs after row 3 of §7. Until then the first-contact experiment under question 8
   measures the wall-first baseline (`audits/2026-10-18-first-contact.md`). The walls-first control
   arm is card PS1.3 (filed 2026-10-25).
   *Measured 2026-10-24, see `audits/2026-10-24-first-contact-rerun.md`:* six cold authors on
   today's spec wrote rooms-first unprompted (6/6, 0 `wall` statements); class-1 defects fell 4 → 0
   and surviving defects 57 → 48 (area basis judged as in the baseline; 54 → 45 without it). There
   is no walls-first control arm yet.
   *Measured 2026-10-25, see `audits/2026-10-25-first-contact-rerun-row5.md`:* 6/6 rooms-first again (31 `door between`, 0 `wall`); defects 48 → 49 (46 without area basis), blockers 2 → 0; still no walls-first arm.
2. **Where is the boundary between a fact and taste in each culture?** For example, a kitchen as the
   entry room is normal in some housing stocks. Profiles may need a `residential-generic` that is
   deliberately quiet.
3. **Which diagnostic wording repairs best?** No controlled study exists for a spatial DSL
   (`research/prior-art.md` "Gaps"). The defect corpus plus a local, unpaid loop could measure it.
4. **Can `between`-style forms cover non-rectilinear rooms?** Polygon and circle rooms are refused
   in v1 of PS3. What would an honest extension be?
5. **What would make `impact` a planning tool, not just a report?** For example, "list the edits that
   keep every `keep` true".
6. **Multi-dwelling and multi-storey rules.** Toilet over habitable room below (GB 50096 5.4.4,
   mandatory), wet-stack alignment, and units sharing a corridor. These need a dwelling concept
   ArchLang lacks. *Researched 2026-10-18* (`research/2026-10-18-furniture-and-multistorey.md`
   Part B): became cards PS2.14–PS2.16. Still open: wet-stack rules need a riser fact and no
   authoritative spacing number was found; several clause texts were read only from secondary
   sources (the file's verification log says which) and must be read in the standard before a
   number ships in a message (D3).
7. **Furniture semantics.** Facing targets (a TV faces the sofa or bed, a bed head is against a wall,
   dining chairs face the table) as relations rather than rotations (ADAI's semantic reconstruction,
   `research/adai-sketchup.md` idea 7). *Researched 2026-10-18* (same file, Part A): became card
   PS3.7. Still open: no evidence on how often agents get a furniture turn wrong; the first-contact
   audit should count it.
8. **Anything the audits missed.** Run a fresh audit on new plans after each §7 row (D7, D10; done 2026-10-24 and 2026-10-25, next as D15's two arms). The defect classes
   in §1 came from about 30 plans and are surely incomplete. *First round done 2026-10-18*
   (`audits/2026-10-18-first-contact.md`): six briefs written cold by an AI author from
   `spec.llm.md` alone, all six lint-clean and strict-clean, carry 57 verified defects (4 blockers),
   lint caught none, and 26 fall outside the eight classes. Twelve new classes are listed there;
   the ones that became cards: furniture not facing its companion (PS3.7), transposed footprints and
   door–door interference (PS2.11), entrance masking (PS0.10), direction-relative wording (PS3.8),
   area basis (PS4.4), non-residential egress and zoning (PS2.16), repair pressure (PS0.11 and the
   order "land PS2.1 before more corner fixes are suggested"). Still uncarded: context modelled
   inside the plan (a common corridor as paving; PS2.14's dwelling work should give it a home),
   vertical stacking of partitions, oblique joins inflating `bbox_outer`, circulation share (taste).
   Re-run with each first-contact re-measure, and count the furniture turn (PS2.11c's
   `W_FOOTPRINT_TRANSPOSED` now catches the turned-footprint half; the `rotate` half is PS2.50).
   *Measured 2026-10-24, see `audits/2026-10-24-first-contact-rerun.md`:*
   - The old plans re-linted: 17/57 caught, 6 of them partially (14/57 counting halves), and 0 false positives.
   - The briefs re-authored cold: 48 defects (2 B), final lint 1.
   - Seats: 24/24 inverted before the lint loop, 0/24 after; `facing` used 0 times.
   - Sofas: 1/3 face their TV.
   - Exterior doors: 8/8 swing the intended way.
   *Measured 2026-10-25, see `audits/2026-10-25-first-contact-rerun-row5.md`:* 49 defects (0 B), final lint 0; seats 18/24 inverted before the loop, 0/24 after, `facing` 0; sofas 0/3 face their TV and 3 of 5 are transposed footprints; exterior doors 8/8.
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

- `README.md`: this plan.
- `handoff.md`: the resume point — state, open work in order, how the work is run (re-written at
  every stage end).
- `cards.md`: every card of §6, with its table, id and status (D16).
- `research/2026-10-25-ps211ab-as-built.md`, `research/2026-10-25-ps211cd-as-built.md`: the four
  clearance rules as built, their first-contact hits, corpus movements and the `finish` sweep.
- `audits/first-contact-protocol.md`: the six briefs, the dispatch prompts, the rubric, the arm A
  role-text pointer and the re-measure checklist that D15 needs (PR #257, 053ba3f8).
- `evidence.md`: what was measured, the bug list and the defect taxonomy.
- `research/checks-inventory.md`: every current check, the authoring-model facts, governing ADRs,
  and the gap list with code locations.
- `research/prior-art.md`: LLM floor-plan work, rule checking, codes and thresholds, DSL design
  evidence.
- `research/associativity.md`: Revit, ArchiCAD, FreeCAD, IFC/Bonsai, Sweet Home 3D, SolveSpace and
  Topologic at source level, plus the full P1–P7 design (datums, `between`, `impact`, `keep`,
  `solve`, the ladder, selectors).
- `research/design-taste.md`: 37 sourced rules, ResPlan priors (16,317 plans) and the score design.
- `research/adai-sketchup.md`: lessons from a staged, evidence-gated SketchUp agent (ideas only;
  CPAL licence).
- `research/2026-10-18-room-tiling.md`: do rooms already tile the building? (the D5 premise).
- `research/2026-10-18-furniture-and-multistorey.md`: furniture relations in Holodeck, Infinigen,
  LayoutVLM, IFC, Revit and Sweet Home 3D, plus twelve multi-storey/multi-dwelling rules with clause
  numbers and a fact-sufficiency table (cards PS3.7, PS2.14–PS2.16).
- `audits/archcanvas-public-examples.md`, `audits/showcase-and-examples.md`: per-plan defects with
  coordinates.
- `audits/2026-10-18-first-contact.md` and `audits/first-contact-plans/*.arch`: six briefs written
  cold by an AI author, lint-clean, 57 verified defects, twelve classes outside the taxonomy.
- `audits/2026-10-24-first-contact-rerun.md`: the same, re-measured after row 3 (D7).
- `audits/2026-10-25-first-contact-rerun-row5.md`: the same, re-measured after row 5 (D10, D14).
- `audits/2026-10-26-first-contact-rerun-d15.md` and `audits/first-contact-plans/2026-10-26-rerun-arm{A,B}/*.arch`:
  the same, re-measured after row 5 as D15's two arms (A: pre-#250 role, B: current role); 52 and 54
  verified defects, 0 and 0 `score --taste` calls; D20.
- `research/2026-10-24-ps5-taste-design.md`: the PS5 taste layer design (row 5).
- `research/2026-10-24-ps0-ps2-as-built.md`, `research/2026-10-24-ps3-as-built.md`,
  `research/2026-10-25-ps5-as-built.md`: landed cards' as-built notes, verbatim (the last also
  holds row 5's PR rulings, §7 rows 1–5 as they stood, and D5/D6 detail).
- `repro/`: minimal reproductions (see its README).
