# Plan-soundness programme: professional rules and taste for ArchLang

**Status:** open. Planned 2026-10-18 against `main@98bd30b` (v1.43.1). The owner delegated the four
programme decisions (§3) and asked for this document to drive implementation in later sessions.

**What this is.** ArchLang draws what an author writes, faithfully. It does not yet know what the
drawing *means* as architecture. An LLM meeting the language for the first time therefore writes plans
that compile, lint clean and are still wrong: a door across a wall junction, two rooms with no wall
between them, a living room reached through two bedrooms, a dimension whose text lies. This programme
makes ArchLang itself carry the profession's rules and taste, so the language **guides** (forms that
make the wrong thing hard to write), **checks** (rules that read the facts it already computes),
**reasons about change** (what follows an edit, what must stay, what must be re-checked) and
**judges quality** (a scored, sourced taste report), while keeping every iron law.

**How to use this document (for a new session).**

1. Read §1–§5 here (about 15 minutes). Read `evidence.md` before touching code.
2. The research behind each decision is in `research/`, and the per-plan defect audits are in `audits/`.
   Minimal reproductions are in `repro/` (see `repro/README.md`).
3. Pick the first card in §6 whose status is `todo` and whose dependencies are done. Each card states
   its goal, design, acceptance and open questions.
4. You are expected to **think, not just execute**. §8 lists what is still unknown and how to extend
   this plan. If the evidence contradicts a card, correct the card here, say why, and carry on.
5. Usual gates apply: `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`, and the `docs/backlog.md` floor gate
   and merge protocol.

---

## 1. The evidence in one page (detail: `evidence.md`)

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
  while any validity rule fails, never gating.
- *Why:* taste is profile- and culture-dependent, and putting it in `lint()` would move the lint
  output across the whole corpus for every tweak. A separate meter can evolve freely, and agents can
  still optimise it.
- *Reverse if:* agents measurably ignore a separate score.

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
- *Measured premise* (`research/2026-10-18-room-tiling.md`): in 26 of the 34 top-level examples
  the rooms' area sum equals the plan's centreline bbox area exactly, i.e. rooms already tile the
  building, and 236 of 246 rooms are rectangles. The form therefore fits how plans are written
  today, not a hoped-for style.
- *Preconditions it refuses on* (ADR 0005: refuse, never choose): rooms that overlap, a union
  with a hole or more than one component, a non-rectilinear room in the set, a room not snapped
  to the grid. Each is an `E_*` with the offending rooms named. A plan with corridors written as
  rooms satisfies them; a plan whose corridor is "the leftover" does not, and that is the point.
- *Reverse if:* the PS3.1 ADR finds that the exception list (`open between …`, thickness per edge,
  a load-bearing line) grows past three clauses, or the tiling preconditions reject more than a
  quarter of the corpus. Then the pairwise forms stay the headline and this one is dropped.
- *Measured* (PR #222, PS3.0 part A): 15 of 279 storeys refused (5.4 %), all `E_ROOM_NOT_RECTANGLE`,
  with or without the reviewed except list; 15/283 on 2026-10-24. Under the quarter: D5 holds.
  Detail verbatim: `research/2026-10-24-ps3-as-built.md` § D5 measured.

**D6. The default profile keeps the dwelling-reading rules on; a plan opts out by reading as
non-residential, not by choosing a profile.** (2026-10-20, amends PS2.18's card; does not touch D3.)
- PS2.18 as filed would have moved PS2.8's kitchen daylight arm, PS2.6 (`W_WET_ROOM_DOOR`) and
  PS2.7 (`W_ENTRANCE_INTO_PRIVATE`) into the residential profiles and had the default profile file
  a coverage skip. The default profile is the one a first-contact agent runs on a house, so that
  would have silenced the three rules exactly where the audit found their defects
  (`evidence.md`: the hall→bath→bedroom chain, the kitchen with no window). Instead the plan is
  read as a *dwelling* unless it carries positive non-residential evidence: a room with use `office`
  and no room with use `bedroom` or `living` (the living clause was added when an inline test
  fixture, Living + Office + Hall + Bath, would otherwise have read as an office), or a label from a
  short non-residential word list, measured against every corpus label before it shipped: café,
  restaurant, clinic, consulting, servery, classroom and staff room read non-residential outright;
  the ambiguous words lobby, reception, waiting, shop and meeting do so only when the plan has no
  bedroom and no living room (review round 1 showed "Reception room", a UK sitting room, and
  "Entrance Lobby" turning a house into an office; "reception room" now classifies as living through
  the PS2.19 fallback, a bare "Reception" stays ambiguous). A non-residential plan files
  the typed skip `non-dwelling` for those arms; `residential-basic` asserts a dwelling and runs them
  unconditionally. `describe()` never learns the reading; no `UseKind` is added. *Refined the same
  day:* `W_WET_ROOM_DOOR`'s kitchen arm (a bath or WC door onto a kitchen, or onto the fixture zone
  of a kitchen+living room) stays on under every reading, because a WC opening onto a food-handling
  area is a defect in any building; only its dining, living and leaf-less-opening arms decline. The
  corpus case `wc-off-dining` (from 4-cafe) is re-cast as a dwelling and a café twin `wc-off-servery`
  pins the arm that stays.
- *Why:* the two first-contact plans the card cites (4-cafe, 6-clinic) both carry that evidence, and
  no residential example or eval golden does; the heuristic is therefore decided by measurement, and
  the acceptance for PS2.18 is that no residential corpus row loses a warning.
- *Reverse if:* PS2.14's dwelling declaration lands (the declaration then decides and the word list
  is retired), or the word list misreads a residential plan in the corpus or the fuzz, or a third
  rule needs the reading (then it belongs in a declaration, not a heuristic).

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

## 4. Principles: what "professional rules and taste" means here

**Four layers, treated differently:**

| Layer | Meaning | Mechanism | Gates? |
|---|---|---|---|
| Valid | Geometry and topology are not self-contradictory: an opening sits on a wall and clear of junctions, rooms are enclosed, rooms are reachable | `W_*` lint | `validate --strict` |
| Advisory code | Sourced numeric thresholds: areas, widths, daylight ratio, fixture clearances | Lint profiles (D3) | Opt-in |
| Intent | This project's contract: brief-given sizes, room program, "these two must connect" | intent brief, `keep` (PS4) | Yes, except adjacency and reachability, which stay advisory by iron law |
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
- Never claim a model-loop gain or its absence, and never run the paid eval (T3 is declined for good).
- Never fix a defect by editing a golden. A new rule that fires on an example is either a real defect
  in the example (fix the example, explain it) or a false positive (fix the rule).

## 6. Workstreams and cards

Status words: `todo`, `doing`, `done` (at most three lines: id, title, status, PR, commit), `parked`.
Dependencies are by card id. Each card's gate is the backlog floor gate plus what it lists.

### PS0 · Bugs found by the audit (independent; file and fix first)

Landed: PS0.1 (PR #196, da9b47b5), PS0.7 (PR #197, 1d92656f), PS0.10–PS0.12 (PR #211, fcb30748),
PS0.13–PS0.14 (PR #214, e736146f). Landing notes verbatim: `research/2026-10-24-ps0-ps2-as-built.md` § PS0.

A done row's "record" is `research/2026-10-24-ps0-ps2-as-built.md`.

| Card | Bug (re-measure first; the evidence is in the cited file) | Status |
|---|---|---|
| PS0.2 | `compile -f json` (Plan JSON) drops arc segments; a round trip loses a bay and floats its window (`audits/archcanvas-public-examples.md` G2) | todo |
| PS0.3 | Multi-storey `describe`: upper-storey rooms report `reachable:false` though a stair reaches them; an exterior door on an upper storey counts as an entrance (`audits/showcase-and-examples.md` §5.10) | todo |
| PS0.4 | `diffPlans`: pure moves, re-hosted openings, a wall section | done (PR #238, 78b507c5) |
| PS0.5 | `furniture … against wall … in <relational room>` failed with `E_FURN_AGAINST`. As built: record § PS0.5 | done (PR #220, 6c6179c7) |
| PS0.6 | `suggest` connects an unreachable room to *any* reachable neighbour, a bedroom included (`src/suggest.ts` ~364-395), against `skills/archlang/SKILL.md`'s own advice. Rank by neighbour use (hall/circulation/living first, bedroom and bath last) | todo |
| PS0.8 | `W_PATH_TOO_NARROW` measures pinches on the 100 mm grid and missed a 500 mm diagonal between a bench and a jamb (`repro/gallery-bench-pinch.arch`, `audits/archcanvas-public-examples.md` GW3). Re-measure the case first: the repro lints with the warning in isolation | todo |
| PS0.9 | `describe` assigns a window between an enclosed room and a covered loggia to the loggia, so lint and describe disagree on bedroom windows (`audits/showcase-and-examples.md` villa-rotonda) | todo |
| PS0.13 | `W_ROOM_NO_CLEAR_PATH` was not equivariant under mirror x. As built: record § PS0.13 | done (PR #214, e736146f) |
| PS0.14 | `describe()`'s net-area integral was super-linear on a comb room. As built: record § PS0.14 | done (PR #214, e736146f) |
| PS0.15 | `describe()`'s net-area work has a cap per room but no total per plan. Measured by PR #214's red team on `aac48b2`: 200 distinct 45-wall × 60-tooth comb rooms, each under `MAX_NET_PROBE_WORK`, cost `describe()` 172.6 s (50 rooms 19.7 s; main 60.3 s for the same 50). `compile()` meets the drawing budget only when a schedule is drawn; `describe()` draws nothing (ADR 0022 §4), so the step budget is its only bound and the playground thread is still exposed. Add a per-call total (a count, charged before each room's walk; rooms past it omit the figure for the same reason) or make the per-room charge count against one plan-level meter. No shipped plan is near it. *Note 2026-10-25 (PR #248):* `lint --profile` with a net-area profile (`cn-`, `uk-`, `us-residential-advisory`, `roomAreaMeasure: "net"`) now runs the same per-room net-area work for every room held to a per-use floor (shared memo with `describe()`), so the missing per-plan total bounds that path too | todo |
| PS0.16 | `set` value parsing: `parseSetValue` reads a bare identifier before `,`/`)` as a word (like `swing: out`), so `set door(width: W)` and `set door(width: hall.cx)` silently become the string "W"/"hall.cx" and have no effect, with no diagnostic (predates PR #221, found in its review; a door's explicit `width` overrides `set`, so the effect was never visible). Decide: a bound name or a dotted datum name as a `set` value is an expression; a bare word stays a word only for word-valued keys. Also: `set door(swing: inward\|outward)` is silently ignored like any unknown enum word there (PS3.8); fix it with this card | todo |
| PS0.20 | Plan JSON: a door carrying both `swing` and `swing_building` that contradict each other (e.g. `swing: "out"` with `swing_building: "outward"` where outward resolves to `in`) is accepted silently; `swing_building` wins on input and the `swing` value is never read (found in PR #229's review). Consider a warning on import, or document `swing` as informational there | todo |
| PS0.17 | `describe` keys: `outdoor` and `fences` are missing from `PER_STOREY_OPTIONAL_KEYS` (`src/describe.ts`), so `describe --level N` can leave another storey's surfaces standing, and from `DESCRIBE_KEYS` (`src/cli/commands-analyze.ts`), so `--select outdoor` is refused (found in PR #223, which added `derived_walls` to both; not fixed there) | todo |
| PS0.19 | A window's `facing` fact was not equivariant under a pure translation. As built: record § PS0.19 | done (PR #231, 6fde1d7f) |
| PS0.18 | Plan JSON round trip turns a label-only "Hall" into `uses entry`: the room classifies `uses hall`, `room_type` `Entrance`, and the projection maps `Entrance` back to `entry` (`src/plan-json.ts`), so the compiled-back plan's `describe()` differs. Found in PR #227, where `examples/relational.arch`'s new hall authors `uses hall` to round-trip. Decide the honest mapping (carry the classified `uses`, or map `Entrance` to the use that produced it). It applies inside a PS3.9 component body too, whose rooms go through the same projection (found by PR #232's red team) | todo |
| PS0.21 | Plan JSON has no member for `outdoor`, so a plan whose rooms tile only with an `outdoor` surface (a courtyard) loses it on the way out and comes back refused with `E_ROOMS_NOT_TILING`, at the root and inside a PS3.9 component body alike (found by PR #232's red team). Carry `outdoor` additively, or refuse the projection with a named code rather than emit a payload that cannot compile | todo |
| PS0.22 | `diffPlans` reports no change for a room reshaped inside the same bounding box with the same area (an L flipped inside its 3000×3000 box: `(0,0) (3000,0) (3000,1000) (1000,1000) (1000,3000) (0,3000)` → `(0,0) (1000,0) (1000,2000) (3000,2000) (3000,3000) (0,3000)`), because `geometryChanged` compares only area and bbox edges (`src/diff.ts`; found in PR #238). Acceptance: a vertex-set comparison reports it as reshaped; add this L case to `test/diff-fabric.test.ts` (PR #238 dropped it, since it documented the gap) | todo |
| PS0.23 | `diffPlans` pairs walls without a written `id=` by their positional auto id (`partition_3`), so inserting a wall ahead of them shifts the ids and mis-pairs them (found in PR #238). The positional pairing also yields false `re-hosted` lines for doors that never moved: e.g. per PR #238's red team, inserting `wall partition … { (1000,0) (1000,1000) }` before the first partition in `examples/studio.arch` gives three false re-hosts and three false wall lines. Separately, two courtyard rings get the same name (`the courtyard wall derived from the rooms`), so the summary is ambiguous and the `wall:${w.name}` antisymmetry key in `test/diff-laws.test.ts` would collide. Acceptance: pair unnamed walls by shape first, then fall back to position (doors, windows and openings pair by id the same way and should get the same treatment); name rings by a distinct hole index or by the rooms they enclose. `arch impact --against` inherits the positional-auto-id shift and the identical courtyard-ring names (found in PR #240) | todo |
| PS0.24 | The LSP's reference walk (`STATEMENT_EXPRS` in `src/cursor.ts`) misses two PS3.7 clauses, `against <room>.<edge> offset <expr>` and `clear front\|sides <expr>`, so rename and references skip a name read there (found in PR #239, whose `statementReads()` adds them for `describe --facts depends` only, leaving the LSP unchanged). Acceptance: add both clauses to the cursor table and extend the LSP references test to cover each | todo |

### PS1 · The defect corpus (do this before PS2; it is the yardstick)

**PS1.1 · `test/defect-corpus/`.** `done` (PR #195, 3d255044)
- As built: record § PS1.1.

**PS1.2 · Fold the first-contact instances into the corpus.** `done` (PR #203, 90ae6bfd; two more cases in PR #233, 1a1efd9e)
- As built: record § PS1.2. The corpus is now 70 cases and the catch rate 48/70 (47/70 before PS2.10).
- *Open (carried from PS1.1):* should the corpus also feed `eval:ci` as a non-gating metric? Read
  `.claude/rules/eval-dataset.md` first: the holdout rules apply.

### PS2 · Validity checks that read existing facts (small, high yield)

Each is an advisory `W_*` appended to `LINT_RULES`, with catalogue entry, `explain` text, fix prose
(§4 format) and a defect-corpus case. Prototype checkers that found these defects exist in the
owner's audit scratch. Re-derive them from this text rather than asking for them.

Landed in three waves, 2026-10-19 to 2026-10-20 (landing notes verbatim: `research/2026-10-24-ps0-ps2-as-built.md` § PS2). Corpus catch
rate 47/70 after the re-run (`audits/2026-10-24-first-contact-rerun.md`); 48/70 with PS2.10 (PR #243);
53/72 with PS2.12 (PR #245: three `todo` annotation cases caught, plus two new pairs).

A done row's "record" is `research/2026-10-24-ps0-ps2-as-built.md`.

| Card | Rule | Test (on the resolved plan) | Status |
|---|---|---|---|
| PS2.1 | `W_OPENING_AT_JUNCTION` | As built: record § PS2.1 | done (PR #201, cefe7e9f) |
| PS2.2 | `W_OPENING_OVERLAP` | As built: record § PS2.2 | done (PR #201, cefe7e9f) |
| PS2.3 | `W_CONNECTOR_AMBIGUOUS` | As built: record § PS2.3 | done (PR #201, cefe7e9f) |
| PS2.4 | `W_BOUNDARY_NO_WALL` | As built: record § PS2.4 | done (PR #204, 600eaaf6) |
| PS2.5 | `W_ROOM_VIA_PRIVATE` | As built: record § PS2.5 | done (PR #199, a7a1ac34) |
| PS2.6 | `W_WET_ROOM_DOOR` | As built: record § PS2.6 | done (PR #199, a7a1ac34; PR #203, 90ae6bfd) |
| PS2.7 | `W_ENTRANCE_INTO_PRIVATE` | As built: record § PS2.7 | done (PR #199, a7a1ac34) |
| PS2.8 | `W_HABITABLE_NO_WINDOW` | As built: record § PS2.8 | done (PR #200, cc165f4c) |
| PS2.9 | `W_ROOM_MISSING_DEFINING` | As built: record § PS2.9 | done (PR #200, cc165f4c) |
| PS2.10 | `W_DIM_TEXT_MISMATCH` | As built: record § PS2.10 | done (PR #243, pending) |
| PS2.11 | Clearance family | WC centreline to side obstacle (default 400, `us` 381, accessible 450–500); front of a wardrobe ≥ 600; hob-to-fridge gap; tall unit (fridge, wardrobe, bookcase) covering a window; a door swing over a stair footprint or its landing; a void at a stair's arrival; stair pitch versus storey height; `W_DOORWAY_BLOCKED` extended to leaf-less openings; a single hinged leaf over 1200 mm (and a double-leaf `door` kind, since authors fake one with two leaves that clash); door–door interference (an open leaf parked across another doorway's approach, which `W_SWING_OBSTRUCTED` does not compare); a transposed footprint on a directional piece (`size WxH` with the depth on the long axis instead of a `rotate`, drawn turned and stretched). Each is a separate code; split into cards as they start. Wardrobe front and bed sides are declarations or profile values, never defaults (PS3.7). Fresh instances: `audits/2026-10-18-first-contact.md` T1, T3, H2, C4, A1, K4. *Part landed:* `W_SEAT_FACING_AWAY` (PR #228, 0d2dbc04); as built: `research/2026-10-24-ps0-ps2-as-built.md` § PS2.11. The other bullets stay open | todo |
| PS2.12 | Annotation collisions | Auto-dimension text inside a room floor, over a symbol or over a label; title-block text wider than its row. Extend `W_DIM_INSIDE` to `dims auto`; drafting only, never `describe()`. *As built:* `W_ANNOTATION_OVERLAP` (a room label or a `dims auto` number over a symbol or a label; absorbs the corpus's `W_LABEL_COLLISION`) and `W_TITLE_OVERFLOW`; `W_DIM_INSIDE` deliberately not widened (every `dims auto` number on a floor is a call-out lettered there by design; see PS2.39); the thickness call-out now also keeps off stairs | done (PR #245, pending) |
| PS2.13 | Lint coverage report | As built: record § PS2.13 | done (PR #203, 90ae6bfd) |
| PS2.14 | Dwelling declaration | A zone-level marker that groups rooms into a dwelling, `describe().dwellings`, common area, and the derived party wall (the ladder rung). Needs an ADR. Unblocks the across-dwellings rule (GB 50096 5.4.4 / GB 55038-2025 4.1.7: a WC over another household's bedroom, living, kitchen or dining) and the shared-corridor checks. Corrects `research/design-taste.md` R19's default of "one level = one dwelling": that fires inside a single house and misses flats, so R19 runs only where dwellings are declared and otherwise reports a coverage skip (`research/2026-10-18-furniture-and-multistorey.md` B1, B9, B12) | todo |
| PS2.15 | `W_SHAFT_FOOTPRINT_MISMATCH` | Same-id stair/lift runs on adjacent storeys whose footprints do not overlap. The facts exist already; ship with PS2.11's arrival-void check (`…multistorey.md` B4) | todo |
| PS2.16 | Egress necessary-condition checks | `uk-residential-advisory`: `W_INNER_ROOM` (ADB 2.11/2.12, 3.7/3.8: a habitable room whose only route to the exit passes through another room, with its exemptions). `us-residential-advisory`: bedroom escape-window failures provable from gross sizes (IRC R310: width < 508 mm, sill > 1118 mm, area < 0.33 m²); never a pass claim without an `openable` window fact (`…multistorey.md` B10–B11). A non-residential advisory profile for the same family: escape-door swing in the direction of travel and leaf type, exits on separate sides, public/staff zoning, accessible WC pan offset and basin reach (first-contact café and clinic, K1, K9, K10, C6, K8). Blocked on facts, not rules, and listed as such: wet-stack risers, fire ratings, protected-stair enclosure, sprinkler-dependent limits | todo |
| PS2.17 | Kitchen worktop | As built: record § PS2.17 | done (PR #216, 8bbdd699) |
| PS2.18 | Profile scoping of dwelling-reading rules | As built: record § PS2.18 | done (PR #217, 06c6b563) |
| PS2.19 | Vocabulary gaps | As built: record § PS2.19 | done (PR #216, 8bbdd699) |
| PS2.20 | Furnish: shower and tub placement | After PS2.9, 44 of 1,600 fuzzed baths are left empty because neither the stage's candidates nor the lint's placement search finds a tub or shower position, where the previous main wrote a WC and basin. Measure what those rooms have in common (size, door and window positions) and extend the candidate set (a shower in the corner the door does not swing into; a tub along the long wall with the door at its foot) before anyone concludes the rooms are too small | todo |
| PS2.21 | Enclosure budget follow-ups | From PR #204's final red-team: (1) the point-test charge assumes every curve crosses every other (`piecesBound ≈ 2c²` × ring vertices), so a plain round room drawn with ≥ 300 vertices is refused on `point-tests` although it crosses nothing; count only curve pairs whose boxes meet so finely drawn curved rooms stay measured (corpus max today is 56 vertices, aquarium's concourse). (2) The slowest admitted shape, a 50-partition × 30-tooth comb room, lints in ~1.6 s vs 0.44 s on main: bounded, not a hang, but twice the figure the PR body quotes. (3) `W_BOUNDARY_NO_WALL` sits outside the `FaceBudget` (ring × ring per room pair plus runs × wall segments), the same class as the ring-pair analyses `describe()` already pays; two interlocking 2000-tooth combs go 23 s → 35 s. Give it a count bound beside the existing ring-pair cost | todo |
| PS2.22 | `W_ALIAS_MATCH` quotes a room id | For a room with no label the alias rule classifies the id and then writes it into the message ('Room "r_carport" reads as a garage only from the indirect term "carport"'), the one lint message that names an id; PS2.19's fallback words widen it (`r_plant`, `r_boiler`, `r_cellar`, `r_linen`, `r_nursery`; found by PR #216's red team). Word the unlabelled case without the id (the room's storey and position, or "an unlabelled room") and pin that no lint message over the corpus contains a room id | todo |
| PS2.23 | Authored wall beside a derived line | An authored wall 1 mm (any non-zero distance) off a `walls from rooms` derived line is kept beside the derived wall, not merged (ADR 0028 §3 coexistence): two parallel bands nearly on top of each other. Lint it: an authored straight wall parallel to a derived segment, overlapping it along its length, whose centreline is closer than half the thicker wall's thickness, almost always meant to lie on the line (found by PR #223's red team) | todo |
| PS2.24 | Wall meeting an open run mid-span | An authored wall perpendicular to a `walls from rooms` `open between` run, ending on it mid-span, is neither refused (it is not collinear, so not `E_WALL_BETWEEN_OPEN`) nor excused: today it only warns through `W_OPENING_AT_JUNCTION` (a wall standing inside the opening). Decide the rule: refuse it as `E_WALL_BETWEEN_OPEN`, or a lint finding with its own hint (give the opening a `width` that clears the wall, or move the wall). No code yet (found by PR #224's red team) | todo |
| PS2.25 | `W_DOOR_NEAR_CORNER` disagrees with the junction measure | `W_DOOR_NEAR_CORNER` measures from a different point than the junction measure `E_OPENING_NIB` and `W_OPENING_AT_JUNCTION` share (`src/opening-junctions.ts`), so a relational door placed at the nib hint's "nearest legal position" (650 from end on a 400 mm host meeting a thinner wall) still warns. Fix: measure the corner from the meeting wall's face, or have the nib hint skip candidates that would warn. No code yet (found by PR #225's red team) | todo |
| PS2.26 | `W_SWING_OBSTRUCTED` at exactly 0 mm short | Under `accessibility-advisory` the rule fires on `examples/two-bed.arch` with a swing that needs 1050 mm of clear radius and measures 1050 mm ("0 mm short", found by PR #227's red team). The boundary should be `<`, not `≤`: decide, fix, and explain the corpus movement in that PR | todo |
| PS2.27 | `W_FACING_BLOCKED` | A declared `facing` whose front ray crosses a wall body before it reaches its target (a TV facing a sofa through a partition). Walls only: a coffee table between a sofa and its TV is the arrangement. Deferred from PS3.7 (ADR 0029) | todo |
| PS2.28 | Undeclared sofa → TV check | A sofa or loveseat in a room with a `tv`/`tv_unit` whose front ray misses it (the audit's A3, H2, T3: 3 of 3 sofas). Out of PS3.7's scope, which judges only seats at tables; measure the corpus first, and decide what a sofa facing a view instead means | todo |
| PS2.29 | Id-free lint messages | Iron law: a lint `message` never quotes an element id (ids go in `hint`). The 2026-10-23 drift audit found three codes that do: `W_OPENING_NOT_DIMENSIONED` (the opening's id), `W_POCKET_RUN` and `W_DOOR_NEAR_CORNER` (the host via `wallPhraseOf`, `src/wall-ref.ts`: `wall "<id>"`, or a derived partition by its room ids). A grep of `src/lint` adds, to confirm first: `ctx.labelOf` falls back to the room id for an unlabelled room, as do `circulation-facts.ts`'s connector and route phrases; `W_CIRCUITOUS_PATH` (entrance door id); `W_OUTDOOR_OVERLAPS_ROOM` and `W_BALCONY_NO_DOOR` (surface id); `W_ALIAS_MATCH` is PS2.22 (fold in); `W_ROOM_OVERLAP` quotes element ids (`Rooms "r_living" and "r_bath" overlap`) and is a compile-channel warning (found in PR #240). *Acceptance:* `test/lint-fix-texts.test.ts` asserts that no internal id appears in any `message` over the corpus: element ids, room ids of unlabelled rooms, and the derived names `A\|B`, `A\|B:open`, `exterior` and `exterior#n`; the same holds for `W_ROOM_OVERLAP`'s `message` over the corpus's `compile().diagnostics`. Every moved corpus `lint()` row explained | todo |
| PS2.30 | Room use inferred from contents | A room holding a kitchen sink, stove or fridge but not typed `kitchen` (or untyped) gets `W_ROOM_USE_MISSING`, or the kitchen rules run on the inferred use. NA1, NS1, NC1. NC1 shows that deleting the type is the cheapest way to silence `W_ROOM_MISSING_DEFINING`. **Acceptance test: the exact laundering.** The final café (`first-contact-plans/2026-10-24-rerun/4-cafe.arch`) has `service` untyped, and lint reports only `W_WET_ROOM_DOOR`. Restoring `uses kitchen` on `service` brings back `W_ROOM_MISSING_DEFINING`: "Counter" is furnished (bar counter) but has no kitchen sink, no stove and no counter or worktop. The card is done when the untyped room gets the same finding. `bar_counter` does not count as the worktop in that message, and the card should keep it that way. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.31 | A table or desk with no seat | A dining table or desk with no chair within `seatTableReachMm`. NA4, NT8, NK1. Also a waiting room's seat count, as a profile value. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.32 | A seat or sofa facing a wall | A sofa or seat whose front ray meets a wall face within 600 mm: NS4, NK5, NH2's front. A sibling of PS2.28. Also make `in <room> anchor <edge> flush` turn a sofa's back to the anchored wall as it does a bed's head, or say in `spec.llm.md` that it does not. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.33 | An open leaf across a corridor | An open leaf in a circulation room that leaves under 700 mm past it: NH3. A sibling of `W_LEAF_ACROSS_DOORWAY`. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.34 | Stair foot and head landings, and side entry | A landing shallower than the flight width at the foot or head, and a door or opening onto a flight's flank (NT1, NT2; T1). Extends PS2.11's stair bullets, which today name only the swing and the void. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.35 | A wet-room door onto a food store | `W_WET_ROOM_DOOR` reaches `kitchen` and `dining` only. A WC opening onto a store in a plan with a kitchen should count (NC3). Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.36 | Accessible WC door swing | An accessible WC whose hinged door opens inward (NC4, NK2). Fold it into PS2.16 with the pan offset and basin reach. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.37 | `W_WET_ROOM_DOOR` on non-residential plans | NC6 cites GB 50096 (residential) on a café's public WC, and the author kept it as wrong for the building type. Decide whether the rule should defer to a non-residential profile. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.38 | Chord-aware dimension hint, or an arc-length dimension form | A straight `dim` drawn on the jambs of an opening on an arc and lettered with the opening's width (the arc length) is told by `W_DIM_TEXT_MISMATCH` to move its endpoints so they span that width, i.e. off the jambs. Either make the hint chord-aware (recognise jambs on an arc and say the line measures the chord) or add an arc-length dimension form that measures along the arc. Found in PR #243 (aquarium's two window dims, now lettered `2.0m`) | todo |
| PS2.39 | Thickness call-outs on room floors | `dims auto all` letters each wall thickness once, beside its wall on the side with floor (`thicknessSideFlipped`, `scene-build.ts`): about 65 numbers on a room floor across 21 of the 26 `dims auto` examples, with the `R` and `φ` call-outs (audits X28, M6, DM2; corpus `annotation-collisions/auto-dims-in-room`). A drawing decision, not a lint: state thickness on the openings chain or in the dimension band, or make the tier opt-in, with its own byte-identity accounting. PS2.12 declined to flag it (no author remedy short of dropping the openings chains) | todo |
| PS2.40 | `furnish` avoids label overprints | `furnish` prefers a candidate that raises no `W_ANNOTATION_OVERLAP`, else lists the room under `unresolved`. Acceptance: `finish` on the eval goldens raises 0 overlaps (9 across 6 plans today: ADR 0024 §6 and ADR 0025 §7, amended 2026-10-24). Found in PR #245 | todo |
| PS2.44 | A balcony door does not make an entry passage | Under `cn-residential-advisory`, `W_ROOM_TOO_NARROW` holds a passage to the 1200 mm entry figure when any door from outside opens into it, a door onto an `outdoor balcony` included (`widthAsk`, `src/lint/rules/per-room.ts`, reads every exterior access edge). Read the entrance as the walk does (`entranceWays`' `balcony` flag, `src/analyze/entrance.ts`) and leave balcony doors out; the warning's hint says so until then. (PS2.41–43 are reserved by the row-5 audit, PR #249.) Found in PR #248 | todo |

### PS3 · Relation-first authoring (D1 + D5; needs an ADR)

**PS3.1 · ADR: rooms may be primary; walls and openings may be derived from room relations.**
`done`: ADR 0028, drafted in PR #215 (9d05af4f), Accepted in PR #224 (ac1ad21d)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.1.

**PS3.0 · `walls from rooms` (D5).** `done` (parts A–C: PR #222, c95bd8a1; PR #223, c97c226c; PR #224, ac1ad21d)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.0.

**PS3.2 · Resolve order and room-edge datums.** `done` (PR #220, 6c6179c7; PR #221, 9fb79494)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.2.

**PS3.3 · `wall … between A and B` and `wall … around [ids]`.** `done` (PR #226, 1235529c)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.3.

**PS3.4 · `door|opening between A and B [at <pos>]`, `… on <room>.<edge>`.** `done` (PR #225, 852df5ec)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.4. Ruling D8 (§3) records its `placement` decision.

**PS3.5 · Semantic selectors.** `done` (PR #230, 401c0795)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.5.

**PS3.6 · Teach it.** `done` (PR #227, 2316f7d5)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.6. Ruling D9 (§3) records its lead-example form.

**PS3.10 · Snap a derived open-pair opening to the grid?** `todo`
- `open between`'s derived opening centres on the clear span exactly. That can be a half-grid
  position, which a typed `at` on the same `grid` cannot reach (`relational.arch`: 2025 and 2525
  on `grid 50`, between a 200 mm ring's face and a 100 mm partition's).
- Decide whether the derived centre should snap to the plan grid, toward the inside of the clear
  span, so that a typed twin always exists. A snapped centre would move the PS3.0 part C digest
  rows, so it needs its own PR with the rows explained.

**PS3.7 · Furniture relations: `facing <id>`, `against <wall|room.edge>`, `clear front|sides <mm>`.**
`done` (PR #228, 0d2dbc04; ADR 0029, Accepted, with an ADR 0017 amendment)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.7.

**PS3.11 · Sofa and couch footprints.** `todo` (after a corpus sweep)
- `sofa`/`couch` carry no catalogued footprint, so `E_FACING_TRANSPOSED` cannot see the audit's
  transposed sofas (H2, T3) and `against wall` cannot omit their `size`. Add a footprint (about
  2000-2200 along x 900 deep) once a sweep shows which corpus rows move (`finish`, the LSP hover,
  the fixture paste and the defining-piece rule read it), and explain each.

**PS3.8 · Building-relative swing and offset wording.** `done` (PR #229, 98a41560)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.8.

**PS3.9 · Plan JSON for a component that derives its walls.** `done` (PR #232, f420660a)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.9.

**PS3.12 · Plan JSON round trip for every placed plan.** `todo` (after PS3.9)
- PS3.9's record (`components`/`instances`, `instance` on flattened rows) is gated to storeys where
  a placed component derives its walls, so every other placed plan still exports flattened and
  fails the way back with `E_DOTTED_DECL` (backlog G.10). Widen the gate to every placed plan. It
  moves the Plan JSON of each placed example (`clinic`, `museum-wings`, `terrace-row`,
  `hillside-villa` and every other plan with a `place`). List each one, and take the
  `E_DOTTED_DECL` tripwire in `test/plan-json.test.ts` and those examples' entries in
  `CANNOT_ROUND_TRIP` (`test/plan-json-gaps.ts`) off together. Nested places and imported
  components need their own decision.

**PS3.13 · Plan JSON: print each `place` where its instance stood.** `todo` (after PS3.9; may fold
into PS3.12)
- PS3.9 prints every `place` after the root statements, so a plan that places before (or between)
  its root statements comes back in the grouped order and draws within a layer in another order
  (the LIMIT pin in `test/plan-json-instances.test.ts`). Print each `place` at the position its
  marked rows held in the payload instead. Prove first, against the resolve order (instances
  resolve deepest first and commit in group order before the root, `src/ir.ts` step 3), that the
  row order alone determines `ir.elements` order; then turn the LIMIT pin into a law.

### PS4 · The change model: what follows, what stays, what breaks

**PS4.1 · `describe --facts depends` (opt-in).** `done` (PR #239, 29ec0662)

**PS4.2 · `arch impact`.** `done` (PR #240, 7954f252)

**PS4.3 · `keep` invariants (checked, never solved, by `compile()`).** `todo` (needs an ADR addendum)
- Vocabulary: `keep align …`, `keep equal …`, `keep offset <x> from <y> <mm>`, `keep min clear <room> <mm>`,
  `keep on axis <n> <wall>`, `keep stacked <room> on levels …`, `keep fixed …`.
- Grades `hard`/`soft`/`advisory` (the IFC `IfcConstraintEnum` ladder).
- `W_KEEP_VIOLATED` reports a signed residual in mm.
- A static DOF/redundancy/conflict fact goes under `--facts depends`.
- A `keep` draws nothing and moves nothing.

**PS4.4 · Brief-bound dimensions (provenance).** `todo`
- Sizes stated by the user's brief become intent assertions that `validate --intent` measures from
  geometry (room count and area exist already; add a room width/depth and an exact-size assertion).
- An edit that breaks one fails the gate. Every other number is free to flex.
- This is the machine form of "know what to keep" (ADAI's bound dimension targets,
  `research/adai-sketchup.md` idea 1).
- Check the intent schema's drift and generator rules before adding fields.
- Add a gross-internal-area fact beside the centreline area (`describe().totals`), because every
  first-contact brief was "met" on centrelines and the finished floor came out 6–10 % under the
  brief (`audits/2026-10-18-first-contact.md` A12, H8, S7). The brief binds to the fact the client
  means.

**PS4.5 · Contact dependency.** `todo`
- A wall or element written at fixed coordinates that lies on a room's edge records that contact
  (a `depends` edge), so `arch impact`'s `held` can flag it when the room moves and it does not.
- *Acceptance:* the widening drill (`repro/widen-before.arch`, `--set AW=4500`) reports the shell and
  the partition `p` as held. Found in PR #240.

**PS4.6 · Impact keying.** `todo`
- Diagnostics carry the element id they are about, and `arch impact` keys by it instead of by span
  containment. Then a whole-plan warning that re-attaches to another room (`W_FLOOR_UNASSIGNED`) is
  not read as one broke plus one healed, and the elements of one loop body are told apart.
- An unresolved side keys its errors to the statement. Every storey's elements are compared, not
  only the lowest storey's. Found in PR #240.

**PS4.7 · Impact resolves bindings, not names.** `todo`
- `arch impact` keeps one entry per bound name, so a name stands for every place that binds it.
  The red team on PR #240 measured three consequences:
  - (a) arguments of different `place` instances are merged. An element that reads a component
    parameter directly is resolved per instance since round 2 (`place unit(A) as p`,
    `place unit(B) as q`, `--set A=…`: `q.r` is neither changed nor held). A component-local
    `let` that reads a parameter (`let BEDW = w - BATHW`) is still one entry for every instance;
  - (b) a block-level `let W = K` merges with a top-level `W`: with `--set K=2000`, the
    top-level reader `a` is held via `reads W (reads K)`, and the lets section prints `W` with
    before "3000", after "3000" and `reads K`;
  - (c) a changed name spreads to every name that reads it even when the value did not change
    (`bed_1` with `x = 0·W`; a loop's elements at `i = 0`).
- *Acceptance:* resolve bindings per instance and per scope, and compare values, not names.
  Found in PR #240.

### PS5 · The taste layer and the review sheet (D2)

**PS5.1 · `taste()` and `arch score --taste <profile> [--json]`.** `done (PR #247, pending)`
- Design: `research/2026-10-24-ps5-taste-design.md`.
- Shape: `research/design-taste.md` §5.1 (coverage first, six subscores, criteria with source,
  evidence and advice code, capped at 0.5 while any validity rule fails).
- Start with R3 (privacy gradient), R6 (furniture–use match), R7 (daylight ratio), R9 (proportion
  from the shape), R11 (kitchen–dining link), R12 (aspect), R14 (living at the integration core,
  from the existing `--facts syntax`), R15 (day/night zoning), R16 (corner doors), R17 (axis economy)
  and R18 (regularity).
- Calibrate on the corpus plus the ResPlan priors in that report (§4 has the method and caveats).
- PS5.1a shipped: PR #244 (pending). `taste()`, `score --taste generic`, R3, R7, R14, the layer
  field on lint rules, ADR 0032 (Proposed); R6, R9, R11, R12, R15, R16, R17, R18 remain (PS5.1b).
- PS5.1b shipped: PR #247 (pending). R6, R9, R11, R12, R15, R16, R17, R18, the exact minimum
  enclosing rectangle (`src/geometry/min-rect.ts`), the SKILL and spec loop line (compile → lint →
  score --taste → repair). PS5.1a and PS5.1b together complete PS5.1.

**PS5.2 · Profiles.** `done (PR #248, pending)`
- `cn-`, `uk-` and `us-residential-advisory`, each a partial ruleset with sourced numbers.
- R4 (area and short side by use), R8 (corridor width by destination), R10 (WC clearances) and R37
  (bedroom escape window, `us`).
- Shipped: R4, R8 and R7's target per profile (`cn` 1/7, `uk`/`us` 8 %); new code
  `W_ROOM_TOO_NARROW` (clear width between wall faces), a double bedroom read from its bed
  (`no-bed` otherwise), R8 measured on the passage's own width (not the walk, which runs through
  doors); profile-only warnings under the taste report's `advisory`, never capping. Areas are
  net floor (ADR 0027; review round 1). The never-worse law of `finish`/`furnish` now holds under
  the default ruleset and the universal profiles only (ADR 0024 §6, ADR 0025 §7, amended
  2026-10-25; follow-up PS5.6).
- *Deferred (lead ruling, 2026-10-24):* R10 lands with PS2.11's WC-clearance rule and R37 with
  PS2.16's escape-window rule; their sourced numbers wait, unread, in `DEFERRED_PROFILE_NUMBERS`
  (`src/lint/ruleset.ts`).

**PS5.3 · `validate --json` gains `next`.** `done (PR #246, pending)`
- The one diagnostic to fix first, chosen by fixed precedence: errors, then validity, then intent,
  then profile, then taste.
- Prior art: a checker that returns the most important specific critique works about as well as
  returning all of them, and far better than "try again".
- Shipped tiers: `error`, `warning`, `validity`, `drafting`, `intent` (gating, then a `--graph`
  mismatch, then advisory), `profile`, `taste`; `validate --profile` and `validate --taste` added.
  Deviation from the card's wording (lead ruling, PR #246): compile-channel warnings precede
  validity because they are upstream causes.

**PS5.3a · MCP `validate` returns `next` (version bump).** `todo`
- The MCP `validate` tool returns the same `next` key, with `--profile`/`--taste` parameters.
- A tool-surface change: bump `packages/mcp`'s version and both `server.json` fields (iron law);
  the hosted worker inherits it. Deferred from PS5.3 by lead ruling.

**PS5.4 · `arch preview --review`.** `todo`
- A review sheet: the plan with the access graph overlaid, each flagged element ringed with its code,
  plus zoomed crops of every flagged junction.
- Agents look at pictures well when told where to look ("not opened = not seen").
- Drawing-only; it never changes `describe()` or `lint()`.

**PS5.6 · `finish`/`furnish --profile <name>`.** `todo`
- `finish --profile <name>` (and its furnish stage) holds the never-worse law under that profile
  as well: when the profile refuses a room's first piece, it falls back to the next size in the
  furnish table (e.g. the 900 × 2000 single bed for the 1500 mm `bed` that makes a bedroom a
  double), and reports what it could not fit.
- Why: ADR 0024 §6 and ADR 0025 §7 (amended 2026-10-25, PR #248) left the residential-advisory
  profiles out of the default law; measured on the eval goldens, a default furnish leaves 28
  profile-only warnings in 14 plans (`uk` 22, `cn` 6, `us` 0), every one a bedroom the 1500 mm
  bed makes a double.

### PS6 · `arch solve` (explicit transform; last)

**PS6.1 · ADR addendum to 0006, then `arch solve`.** `parked` until `keep` has real use
- Exact rational elimination for equalities (DOF is a decision, not a float threshold) and
  Bellman-Ford for difference constraints (a negative cycle names the conflicting `keep`s).
- Authored values are the lowest-priority anchors, applied in hold-fixed-ladder order.
- It refuses when under-determined, its budget is counted, and it emits source plus a change log.
- Design: `research/associativity.md` §4 P5.

### PS7 · Staged authoring for agents

**PS7.1 · Stages as a first-class idea.** `todo` (after PS2, PS3.4)
- Stages: brief → room graph → zoning on a grid → walls (derived) → openings → fixtures and
  furniture → drafting.
- `validate --stage <s>` runs only the rules meaningful up to that stage. SKILL's loop advances only
  when a stage is clean.
- Prior art and ADAI agree: decide low-frequency things first; early proportional errors cascade.

**PS7.2 · `arch context --level starter`.** `todo`
- A one-screen starter for weak models: the same truth as the full context, less of it.

**PS7.3 · Rule packs as data.** `parked`
- Profiles and taste rules described as versioned data, each with applicability, check, failure exit,
  sources, and draft/verified-on-corpus state.
- Only if PS5 shows the rule count outgrowing code-defined profiles.

## 7. Suggested order and acceptance

| Order | Cards | Done when |
|---|---|---|
| 1 | PS0.1, PS0.7, PS1.1 | Done 2026-10-18: PS0.7 in PR #197 (ad58551, dfd1737), PS1.1 in PR #195 (df00ab5), PS0.1 in PR #196 (1e0c2d9, e81a136; also closed backlog C.4). Corpus catch rate 7/53 |
| 2 | PS2.1–PS2.9, PS2.13 | Defect-corpus catch rate ≥ 90 % for classes 1, 2, 3, 4 and 6, with no false positive on the clean twins; every corpus `lint()` movement is explained (two-bed is expected to start warning: fix the example, see PS3.6). *Corrected 2026-10-19:* class 5 (clearances) belongs to PS2.11 in row 5, so it was removed from this row's acceptance. *Status:* met 2026-10-20 (PRs #214, #216, #217; 46/68 on `main@06c6b56`); dated status history verbatim: `research/2026-10-24-ps0-ps2-as-built.md` § §7 row 2 |
| 3 | PS3.1, PS3.2, PS3.0, PS3.3, PS3.4 | ADR merged; byte-identity law green; `relational.arch` lints clean with walls derived; the 500 mm widening drill moves walls and doors with the room; the class-2 corpus cases are unwritable in the D5 form. *Status:* met 2026-10-23 by PS3.6 (PR #227), every bullet; catch rate then 46/68; dated status history verbatim: `research/2026-10-24-ps3-as-built.md` § §7 row 3 |
| 3a | PS3.7, PS3.8, PS3.5, PS3.9 (and PS0.19) | Unplanned: done after row 3 was met, before row 4 (D7): PRs #228, #229, #230, #232; PS0.19 #231. First-contact re-run, PR #233 (`audits/2026-10-24-first-contact-rerun.md`): old six plans 17/57 caught (6 partially; 14/57 counting halves); cold re-authoring 6/6 rooms-first; defects 57 → 48, blockers 4 → 2; corpus catch rate 46/68 → 47/70 |
| 4 | PS0.4, PS4.1, PS4.2 | The widening drill's `impact` names every moved, held and broken item correctly. *Status:* met in part 2026-10-24 by PS4.2 (PR #240): every moved and broken item of the drill is named correctly; `held` is empty because the drill's walls are fixed coordinates and depend on nothing (PS4.5). Merged 2026-10-24 (7954f252) |
| 5 | PS5.1–PS5.3, PS2.10–PS2.12 | **Next.** The taste score separates the corpus's known-bad from known-good plans monotonically. D10: the row-3 first-contact figures are the baseline; re-measure after this row. PS5.1 complete; concordance 37 ordered / 0 tied / 0 reversed (0 ledgered) / 4 unjudged. *Re-measure:* `audits/2026-10-25-first-contact-rerun-row5.md` (PR #249): cold re-authoring 6/6 rooms-first, defects 48 → 49 (B 2 → 0), final lint 0; 0/6 authors ran `score --taste` or `validate`; taste 0.72–0.93 on the new plans and reaches 3/48 (+1 partial) and 2/49 audited defects; the row-5 codes caught 1.5/57 and 0/48 on the old plans (`W_ANNOTATION_OVERLAP` only, 12 true hits); concordance unchanged; corpus 53/72. PS5.2 done (PR #248, pending; R10 and R37 deferred to PS2.11 and PS2.16). |
| 6 | PS4.3, PS4.4, PS3.5, PS3.6, PS5.4, PS7.x | — (PS3.6 landed in row 3, PS3.5 in row 3a) |
| 7 | PS6.1 | — |

The drill used in rows 3 and 4: `repro/widen-before.arch` → `repro/widen-after.arch`, and the studio
example widened by 500 mm (`repro/README.md`).

## 8. Room to think: open questions and how to extend this plan

This plan is a hypothesis about what will make AI-written plans professional. Treat it that way.

**Open questions worth a fresh investigation:**
1. **Are rooms or walls the better primary for LLM authors?** D1 bets on rooms. A small, unpaid
   experiment can test it: author the corpus briefs both ways with the CLI loop and compare defect
   counts on the PS1 corpus. Do not run or cite the paid eval. *Scheduled:* it needs the PS3 forms
   to exist, so it runs after row 3 of §7. Until then the first-contact experiment under question 8
   measures the wall-first baseline (`audits/2026-10-18-first-contact.md`, once written).
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
8. **Anything the audits missed.** Run a fresh audit on new plans after PS2 lands. The defect classes
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
   Re-run after PS2 lands, and count the furniture turn.
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
- **A new idea:** add a card in the right workstream with goal, design, acceptance and open
  questions, and mark which prior evidence supports it. If it changes a decision in §3, add a new
  decision (D5, …) that names what it supersedes and why. Owner-reserved choices (iron laws,
  releases, paid eval) still go to the owner.
- **A card lands:** cut it to its `done` line (PR and commit), move any as-built note verbatim to a
  dated `research/` record, update §7, and record the release story in `CHANGELOG.md` only.
- **A card turns out wrong:** say so in the card, keep the reason, and change course. Symptoms have
  been reliable; stated causes have been wrong about as often as right (`docs/backlog.md`).
- **When the programme is done:** fold the lasting decisions into ADRs, delete this folder, and
  archive the research outside the repository, as the backlog does with closed entries.

## 9. Files in this folder

- `README.md`: this plan.
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
- `research/2026-10-24-ps0-ps2-as-built.md`, `research/2026-10-24-ps3-as-built.md`: landed cards'
  as-built notes, verbatim.
- `repro/`: minimal reproductions (see its README).
