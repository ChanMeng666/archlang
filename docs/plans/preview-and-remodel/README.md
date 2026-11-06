# Preview-and-remodel programme: a checked 3D preview, and the renovation wedge

> **Moved:** this programme's `research/` now lives in the private sibling repository, at
> `archlang-lab/plans/preview-and-remodel/research/`.

**Status:** open. Planned 2026-10-28 against `main@8829a8bb` (core 1.43.1 on npm, `[Unreleased]`
carries the authoring stages). The owner asked for a complete plan that later sessions implement
card by card. Cards are in `cards.md`; the resume point is `handoff.md`.

**What this is.** ArchLang draws plans and checks them. The October 2026 attention on AI floor plans
went to two things ArchLang does not show today: a plan that *draws itself* in drafting order and
then *rises* into a 3D preview, and a workflow that *remodels inside an existing shell* instead of
inventing a house from a blank prompt. This programme adds both without touching the iron laws: the
3D preview is a downstream consumer of the resolved plan (ADR 0021; the archlang-3d plan), and the
renovation wedge is additive language (wall status, a lock check, quantities, imperial input).

**The outcome it is measured by** (the owner, 2026-10-27): a product that is friendly to a human's
eye and to an AI's edits at once, where the human does vibe design and visual confirmation and the AI
implements. The 3D preview is a *confirmation surface*; the renovation wedge is what an AI needs to
edit *safely* inside constraints a human set. The yardsticks: (1) a reproducible 15 s replay video of
`examples/laneway-house.arch` from one CLI command (A3); (2) a locked-shell edit that the compiler
refuses when the shell moves (B1); (3) the N10 reading four weeks after the first public replay post
(the exposure decision record in the growth repository).

**How to use this document (for a new session).**

0. Read `handoff.md` first: where the programme stands and what to take next.
1. Read §1–§5 here (ten minutes). The evidence is in the dated research listed in §1; read the report
   a card cites before touching its code.
2. Take the next item of `handoff.md` § 3; only when it is empty, pick the first `todo` card in
   `cards.md` whose dependencies are done and whose wave is open (§4).
3. Think, not just execute. If the evidence contradicts a card, correct the card, say why in the
   as-built note, and carry on. Never bless a golden to green a suite; never widen a card's scope.
4. Usual gates apply (`AGENTS.md`, `CLAUDE.md`, `docs/agents/*`); the exact commands per card are in
   `cards.md` § 0.

---

## 1. The evidence in one page

Eleven dated reports were written 2026-10-27/28 (held by the owner outside this repository as scratch
`archlang-3d-strategy/01–11`; the facts that matter are restated in the cards). What they established:

- **The archlang-3d plan (v0.6) stands on architecture and conflicts only on exposure.** Its viewer
  (§6.1), time seam (`__seek(t)`, §6.5), opening geometry (§4.1/§4.3) and pixel-baseline rule (Q21)
  already cover a replay; it is silent on the build-sequence animation, in-browser video, and a
  playground toggle; and Q5/Q1 forbid showing anything before M6. Recut: `../archlang-3d/amendment-v0.7.md`.
- **Today's `main` is 350 commits past that plan's baseline.** Root exports 462 → 549; the C1 closure
  still holds (14 types, 26 names) but the new `double` door kind returns `null` from `doorSwing()`;
  its leaves come only from `doorLeaves()` (`src/geometry.ts:211`, unexported). C1 gains it (27 names).
  `resolvePlan`'s return type gained `plan?: PlanNode`. Q16 (light tests under `packages/*/test`,
  heavy under `e2e/` with a non-`.test.ts` suffix) is confirmed by experiment.
- **The old `--view` axonometric is not reusable code** (fixed cameras, painter's sort, no furniture,
  four open defects V.1–V.4). Its one lesson stands: extrude from the compiler's own joinery
  (`joinWallSet`, `openingCut`, `roomRing`), never from a second footprint.
- **The three public 2D→3D references** (floorplan-3d MIT; casa-serra *no licence*, ideas only;
  the owner's promo MIT) all build axis-aligned box walls. Reusable patterns: the timeline as a pure
  function of time; openings rising with their host wall; the first 3D frame matching the 2D view;
  a narrow-lens dolly from plan to perspective; a 1.2 m clip plane as poché. Pitfalls: a second
  hand-typed geometry, centroid matching, whole-building scaling, `Math.random`/`Date.now`, pinning
  frame bytes, three.js from a CDN.
- **No standard fixes a drafting order.** NCS, AIA, ISO 13567 and BS 1192 name layers and pen widths
  only. Teaching material agrees on: set-out → exterior walls → interior walls → doors → windows →
  stairs and fixtures → dimensions → line weights → sheet; "grid then columns" only for framed
  buildings; a Berkeley handout draws the inside (room) lines first, which matches ADR 0028. The viral
  post that prompted this was an LLM demo *claiming* a drafter's order; it is not evidence.
- **The SVG paint order is not a drafting order** (`RENDER_PASSES` in `src/scene.ts`: floor, axes,
  furniture, wall fill, wall face, doors, openings, windows, labels, dims, annotations, chrome) and
  must not change. Walls are one joined shape without per-wall tags, so a replay cannot come from the
  core SVG; it comes from the 3D package's own per-wall geometry.
- **Core gaps for the renovation wedge** (all new): wall status, a lock mechanism (`keep` can pin a
  straight wall, cannot name a door; `diffPlans` pairs by resolved id and auto-ids shift, PS0.23),
  quantities beyond room areas and schedules, imperial units. `impact --against old.arch` exists.
- **ArchCanvas** streams progress over the chat SSE but only counters; quick actions rewrite one
  numeric `let` via `data-span` with no LLM call; the designer writes doors as `swing into <room>` and
  furniture as `against wall … offset N`, so a door flip and a furniture nudge are unique source edits
  and a wall move is not. Its pinned core (1.43.1) has no stages.
- **Claim corrections** to the 2026-10-25 X research are filed in the growth repository
  (Gemini figure, Pascal attribution, casa-serra licence, unverified Maket/Drafted claims).
- **Sizes measured:** three.js 0.186.1 viewer subset 140 kB gzip (MIT); playground startup chunks
  554 kB gzip, so the viewer must be a lazy chunk; the resolver bundles for the browser with zero
  externals (183 kB gzip); `npm run check` 787 s on a quiet machine.

## 2. Principles (each with the law it comes from)

1. **One geometric truth.** The viewer and the GLB read the same `Mesh3D`; the GLB's SHA-256 is the
   viewer's regression gate (archlang-3d G2, V-DET-01; ADR 0018's lesson).
2. **Heights draw nothing in the core; the core exports data** (ADR 0021; iron laws). No `render`
   command in the core; no 3D option on `compile()`.
3. **Replay state is a pure function of time**, ordered by the core's own authoring stages (D3).
   Video bytes are not pinned; the event table and key-frame pixels are (Q21).
4. **Additive language only.** Every new form ships a byte-identity law; a plan that does not use the
   form compiles to the same bytes (AGENTS.md).
5. **Geometry, never claims.** Quantities are centreline/face lengths and areas with the convention in
   the field name; a waste factor is a parameter the author passes, never a default; no structural or
   code-compliance claim (growth positioning, standing bans).
6. **Named before locked.** A lock applies to elements with a written `id=`; locking an unnamed
   element is refused with a diagnostic, because auto-ids shift (PS0.23).
7. **Exposure follows acceptance gates, not dates** (growth decision record 2026-10-28, §5 here).

## 3. Decisions (programme-level; owner delegation of 2026-10-25 and 2026-10-28)

Each entry has a reverse-if. "Stands unless the owner objects."

| # | Decision | Reverse if |
|---|---|---|
| D1 | 3D stays downstream in `packages/archlang-3d` (ADR 0021/0030); this programme owns the *recut* of its M1 and the exposure gates; M2–M6 stay with the archlang-3d plan | the core ever needs 3D data the package cannot get through additive exports |
| D2 | M1 is recut into M1a (geometry + replay viewer + CLI video) → M1b (GLB + gates) → M1c (playground toggle) → M1d (optional browser MP4); viewer first, GLB second (`../archlang-3d/amendment-v0.7.md`) | more than two `Scene3D`/`Mesh3D` schema changes after M1b force viewer rework (then GLB-first was cheaper) |
| D3 | Replay order = authoring stages `brief → rooms → walls → openings → fixtures → drafting`, then *rise*. Inside `brief`: levels, `axes`, `grid`, `north`. Inside `rooms`: room outlines faint, then `void`/`stair`/`outdoor` footprints. Inside `walls`: `column` → walls with `category exterior` → the rest → `fence`; `roof` hidden by default. Inside `openings`: doors then windows then plain openings. Inside `fixtures`: catalogued fixtures (wet-room and kitchen families) then loose furniture. `drafting`: cross-fade to the core SVG (fill, dims, labels, sheet). Source order within a group. No core change: `ELEMENT_KIND_STAGES` already maps every kind (`column → walls`); `axes`/`grid`/`north` are plan-level and belong to `brief` | a user study or the owner's eye finds stage order less legible than paint order; or a `.arch` corpus plan has no rooms (then walls open the replay) |
| D4 | `RENDER_PASSES` (paint order) is unchanged by this programme. Drafting order lives in the replay and in authoring guidance (`validate --stage`, `spec.llm.md`) | never for the replay's sake; only a drawing-quality reason under ADR 0032 may move paint order, with every golden re-pinned on purpose |
| D5 | Exposure tiers (growth record `strategy/decisions/2026-10-28-3d-preview-exposure-and-positioning-row-8.md`): Tier 0 nothing; Tier A after A3 acceptance = owner's personal X posts + playground toggle labelled *"Preview — from the separate archlang-3d package. ArchLang itself draws plans."*; Tier B after a positive N10 read, A4 green and a founder-made 0.x publish = ArchCanvas + positioning row 8 rewrite; Tier C at M6 = docs and landing pages. Show HN 2026-12-01 stays 2D. Superseded for ArchLang surfaces by PS-D11 (owner, 2026-11-06; docs/plans/public-surfaces/3d.md). Product word: *3D preview* | the N10 read is negative (built in); support questions read the preview as a product promise |
| D6 | Locking ships first **without syntax**: `arch impact --against <old.arch> --lock <id,…>` (or `arch diff` once U.14 lands) fails with `E_LOCKED_ELEMENT_CHANGED` when a named element moved, resized, re-hosted or vanished; `keep locked` syntax is parked until ArchCanvas or an interview needs it in the source | a consumer needs the lock to travel inside the `.arch` file (then B2 opens) |
| D7 | Wall `status existing \| demolish \| new` ships in two cards: B3a semantics (IR, describe, Plan JSON, schema, lint: a `demolish` wall encloses nothing, hosts nothing and counts in no area; `existing` and `new` behave as today) then B3b drawing (dashed via a separate `lowerWallSet` call, DXF layers, legend rows, one new example, byte-identity law). Derived walls (`walls from rooms`) take a statement-level status | the 172 `ir.walls` call sites cannot be audited in B3a's budget (then split B3a by consumer group, do not ship half) |
| D8 | Imperial ships **input only** (`ft`, `in`, `12ft6in`; exact 25.4 mm conversion; rounding half away from zero) with a catalogued diagnostic for `'`/`"` forms. Imperial *display* is parked until North-American demand is evidenced | a paying or interviewed user in `ft-in` needs the sheet in their units (then B5b opens) |
| D9 | Quantities are an opt-in `describe --facts quantities` block plus `arch takeoff --format csv\|md [--waste <pct>]`; existing `describe` bytes do not change; wall areas appear only when heights are authored | the digest tests show the opt-in path still moves a pinned output |
| D10 | C1 export set = the 26 names of `core-pr/c1-c2-exports.md` **plus `doorLeaves`**; `resolvePlan` is public, only-additive, narrowly promised (ADR 0031 draft); its stability wording quotes the 4-field return type | the core maintainer rejects the stability level (then the package deep-imports `src/analyze` and records R1) |
| D11 | Export themes: a dark blueprint theme is allowed in exported HTML/MP4 only; the sites stay light-only (ADR 0014) | — |
| D12 | The in-browser WebCodecs MP4 button (M1d) is parked until A5 has shipped; when built it is labelled non-deterministic and its muxer passes the Q20 licence gate | a Tier A post needs it (then unpark) |
| D13 | Execution model: the main session plans, reviews and dispatches; executors are subagents in worktrees branched from `main`; at most two red-team rounds per PR; the documented auto-merge flow (`docs/agents/commands.md`); owner-only steps are releases, npm publishes, the trusted-publisher registration, and the merge that opens Tier A (confirmed with the owner before merging because a push to `main` deploys the playground) | — |
| D14 | **Owner, 2026-10-28 (A3 look notes, round 1):** a multi-storey replay shows each storey on its own AND the storeys combined; the ground floor is never hidden behind the floors above (in the A3 build the upper storey's walls and slab covered every ground-floor detail). Also accepted: every optimisation the main session found (hexagon-pavilion framed too small at the end; A2b's T0 furniture, V-GEO-05, curved-host glass, slab ∪ rooms; A0b's exports; `--doors plan`) | the owner's next look finds the per-storey views harder to read than one combined view |
| D15 | **Owner, 2026-10-28:** the agent may cut and publish the releases end to end — the core (`@chanmeng666/archlang`), the MCP shim (`packages/mcp`, with its version bump and both `server.json` fields), `@chanmeng666/arch-plan`, and the VS Code extension build — through the documented tokenless OIDC chain and `/release-check`; the owner steps in only for OTP/2FA, logins, terms and file pickers (iron-laws "Owner policies"). `@chanmeng666/archlang-3d`'s first publish still needs its npm trusted-publisher registration, which only the owner can do (§6) | the owner revokes it |
| D16 | **Owner, 2026-10-28:** Tier A is OPEN: A5 (the playground toggle with D5's label) may merge once green, and the owner's own posts may follow; the docs site, README, npm README and landing pages stay Tier C (no 3D there). For every owner-only manual step — the VS Code Marketplace upload, any OTP/2FA, login, terms or attestation prompt in the release chain — the agent PAUSES, gives the owner exact step-by-step instructions (where to click, what to paste, which file to pick, what success looks like), waits for the owner's confirmation, verifies the result itself, then continues automatically Superseded for ArchLang surfaces by PS-D11 (owner, 2026-11-06; docs/plans/public-surfaces/3d.md). | the owner revokes it, or a Tier A post draws a support question that reads the preview as a product promise (D5) |
| D17 | **2026-10-29 (by delegation):** the public roadmap issues #343–#347 are reconciled to 1.46.0 before any further work on them (G2): each states what exists, what remains, and names one user or none, never "users asked", unless `data/community-replies.json` in the growth repository shows more. Three of the five described shipped features as future work | a thread or interview shows the plural |
| D18 | **2026-10-29 (by delegation):** import stays out of the core. No raster decoding in `src/`; the import path is a rooms-only Plan JSON with a derived-walls statement, plus recipes and tools outside the package (`tools/`), marked experimental (G3). A VLM or segmentation reversal is ArchCanvas-side and waits for a conversation with the one user who asked | a second independent import ask arrives with masks or PDFs in hand |
| D19 | **2026-10-29 (by delegation):** "visual clash", HUD and glow ideas from creator research are built only from facts the core already computes (review rings, circulation overlay, `describe` quantities) and only where a Tier allows; no "clash", "before the floor is poured" or "mathematically true" wording (growth bans on measurement and buildability claims); the repair-convergence replay (G7) waits for the N10 read | the N10 read is positive and the owner asks for G7 earlier |
| D20 | **2026-10-31 (by delegation):** `@chanmeng666/archlang-3d` is published at 0.x, 0.1.0 by the owner's hand and every later version through `release.yml` with provenance. The core README, the docs site and the npm README of the core stay silent on 3D until Tier C; growth row 8 is unchanged Superseded for ArchLang surfaces by PS-D11 (owner, 2026-11-06; docs/plans/public-surfaces/3d.md). | Tier C opens, or a release of the package carries a promise the 0.x label does not |
| D21 | **2026-10-31 (by delegation):** #362–#370, filed by the one active user drawing German houses with an agent, go ahead of the 3D publish. Bugs first, one PR each, into the next core release (G9: #365, #366, #364 part 1, #368, #367), then written designs for #363 and #362 (G10). IFC stays archlang-3d M5 and is never promised in a reply | a second user asks for something else first, or the user stops using ArchLang |
| D22 | **2026-10-31 (by delegation):** G6 needs nothing from the owner: the question was already asked on Reddit on 2026-10-28 (growth row `2026-10-28-reddit-localllama-followup-dcjson`). Check on 2026-11-04; no sample by the N10 read closes the card | a sample file arrives |
| D23 | **2026-10-31 (owner-approved plan):** Wave 7 (the H, L and S cards) does not wait for N10. N10 reads the 3D preview's exposure (growth record 2026-10-28 (c)) and says nothing about language gaps a user has reported; waiting would leave four days before Show HN. Wave 4, wave 6 and the 3D Tiers still wait for it. Order: silent defects first, then forms any house has; forms only German plans need wait for a second ask. New language forms freeze on 2026-11-24 until Show HN has run | the user's answer shows #363 and #362 are not first (then swap L and S), or the owner reads day 90 as STOP (then L and S pause; the H cards stand) |
| D24 | **2026-10-31 (owner-approved plan):** the G10 open questions. L-shaped rooms: `at center` on a two-run pair stays a refusal whose diagnostic carries the fix; notch edge names wait for a second ask; L3 and L4 wait for the user's reply after L2; `finish` on an L is out of this round. Stairs: a winder is drawn as a landing for now, because lint then errs strict and reported; no German profile (DIN 18065 is unchecked and one user is not a case for it); no `entry` clause on a straight flight, a spec sentence instead; the `explain` advice is reworded now | the user supplies plans a landing cannot stand in for (then S5); a second person asks for a named edge, an `entry` clause or a German profile |
| D25 | **2026-10-31 (owner-approved plan):** #345 narrows. The shared grid (backlog P2-4) stays. The load-bearing check is out: a structural attribute invites a structural claim, against principle 5 and the growth bans. If walls need checking across storeys, the route is `keep stacked` on named walls, geometry only, with no word about load | someone with a structural workflow asks for the attribute and accepts geometry-only wording |
| D26 | **2026-11-01 (by delegation, after the owner asked for the day-90 verdict):** growth read day 90 as STOP on the consumer product (`strategy/decisions/2026-11-01-day-90-verdict-stop.md`). D23's pause was re-evaluated at once: L2 continues, because L1 alone is a half-feature; S1–S3 continue, because Show HN is ArchLang's distribution event and turning stairs are one of the two gaps the active user named first; S4 drops out of this round. After S3 no new language programme opens until the Show HN and N10 reads are in. The owner deferred the question to the user, so D23's and D24's user-led triggers wait | the owner reverses the verdict, or S1–S3 miss 2026-11-24 (then none ships before Show HN) |
| D27 | **2026-11-01 (by delegation):** the stair `bounds()` gap waits for card H9, after Show HN, and is fixed in `bounds()` rather than in the ink. Measured on 1.49.0: a stair with nothing around it draws 60 mm past its footprint and the sheet margin holds it (ink x −60 to 1060, viewBox from −510), and a stair against a wall stays inside the wall band, so nothing is clipped or misread today. Changing the ink would move every stair in every golden before a launch; changing `bounds()` can move `bbox` on a plan whose stair is the outermost thing | a report of a clipped or misplaced stair, or a law that reads `bounds()` as a range check |
| D28 | **2026-11-01 (by delegation):** ArchCanvas stays on core 1.48. Its designer prompts inject `spec.llm.md` verbatim, so a bump to 1.50 teaches the block stair and rectilinear rooms to production with no prompt edit, and only a paid run can price that. The product is in maintenance (D26), so an unmeasured behaviour change has no case. The bump is ready as a draft PR in that repository | a paid run is approved, or a launch needs the forms |
| D29 | **2026-11-01, the owner:** ArchLang keeps being built. It is an open-source project the owner wants to make more usable and more professional, so D26's line that no new language programme opens before the Show HN and N10 reads does not bind, and neither do D24's "wait for a second ask" parks. New forms may be designed and shipped on their merit. Each still ships with its byte-identity law, a red-team round and a paid-for spec line. What stands: the STOP on the ArchCanvas consumer product, D28, wave 4 and wave 6's 3D work waiting for N10, and D27. The last week before Show HN stays for stabilising, so the launch does not ride on a fresh form | the owner says so |
| D30 | **2026-11-02, the owner:** fifteen items in three batches, core 1.51.0 (fixes), 1.52.0 (common forms), 1.53.0 (interchange and languages, after Show HN unless the first two finish early); cards J1–J15. Main takes bug fixes only from 2026-11-24 until Show HN has run | the owner says so |
| D31 | **2026-11-02 (by delegation, J1):** only an authored `sill` above 0 disqualifies a window as a way onto a balcony; the threshold is exactly 0 and `head` is not read, since 1,356 of 1,376 corpus windows sit at the default 900. A piece at a `sill 0` window needs no height: any cut-plane piece on the wall's face. A building with no way in at all keeps its sentence | plans start writing `sill 900` as a habit; a French window with an upstand draws a complaint |
| D32 | **2026-11-02 (by delegation, J2):** an open shell is read end by end, one reading for all plans. A wall below `DOOR_HEAD` is a parapet, since no one walks under it, rather than one below the storey height. A room counts as enclosed by its shape, never one point. Open air is the last word of `label ?? id`, in English, with `uses` overriding. `leaves_out` lists every room no ring wholly encloses, so a room a ring half covers is named and the figure holds the covered part. The CSV holds the whole plan and the panel says so | a real indoor label is caught; authors commonly write shell heights below a door head |
| D33 | **2026-11-02 (by delegation, J3):** a storey's voids, flights through and lifts are read on `level` plans only, so single-storey bytes hold and a one-storey `finish` can still write on a `void` (stated in the docs). A placed component's rooms stay unfurnished on both shapes, with a true note, so the #364 workaround root is left as it is. The per-storey measure lives in `gainedCodes`, so the sheet stage inherits it. `docs/gallery/two-storey.arch` was re-run by the tool | the owner accepts single-storey bytes moving; dotted furnishing is wanted (then for both shapes together) |
| D34 | **2026-11-02 (by delegation, J4):** label widths are the per-character wider of Roboto (PNG, PDF) and Helvetica Bold (a browser's SVG), an estimate over two faces, not a promise for every font. Rungs 3.5, 3, 2.5, 2 mm; the floor is `SHEET_MM.furnLabel`, the smallest text the sheet already draws; no exact-fit size, so a small edit keeps its lettering. Shrink only on the rule's own test; a wrapped form before one line at the same height; a label nothing cures goes to its least-buried form. Pinned, outdoor and unnamed labels do not shrink. No mid-word hyphenation, no leader | labels read too small; the owner wants one output fitted; a one-line form at the same height reads better |
| D35 | **2026-11-02 (by delegation, J5, J6):** on a mixed edge `from start`, `from end` and `center` stay on the whole room edge and may resolve, since they name a point before any wall is read: arithmetic, not a choice (ADR 0005). Straddling, a partition landing and a doubled wall stay refused; no exterior wall at all is `E_OPENING_NO_SHARED_WALL`. `between` keeps its one-wall rule. `centreline_at` is a default appended field on `between` openings only. `batch -o` creates its directory lazily. A refused door draws no follow-up warning, reversing a pin that held that noise on purpose | a window with no position landing off-centre proves a surprise; consumers want one position field on every opening; a typo'd output path causes harm |
| D36 | **2026-11-02 (by delegation, J7):** a side of a rectilinear polygon is the outline's run on its outermost line, one run or a refusal, never the box. `right-of`, `.top\|.bottom\|.left\|.right`, anchors and `finish` read it; `.cx`, `.cy` and `centered` stay refused. A U keeps its four corners. `finish` proposes only what the forms can say | a notch edge gets a name; ADR 0025 admits `at` |
| D37 | **2026-11-02 (by the main session, a deviation from the owner's order; the owner delegated the call the same day and it stands):** `door between liv and bed at center` on a pair with two runs stays `E_OPENING_HOST_AMBIGUOUS`, so #363's plan compiles with one line rewritten and not with none. The two runs are 3000 mm each, an exact tie, so resolving it would be the compiler choosing a wall, which ADR 0005 forbids, and #363's own proposal says to refuse. D29 lifted D24's parks, not this. The other seven lines compile verbatim, and the diagnostic quotes the fix | the owner says the plan must compile as filed: that needs ADR 0005 amended, then a tie rule and a warning naming the run taken |
| D38 | **2026-11-02 (by delegation, J8):** window kinds `fixed`, `casement`, `tilt`, `tilt_turn`, `sliding`; `tilt_turn` is the English trade term. `hinge` is authored or absent, and absent draws marks on both jambs, so the drawing states no hand. `door glazed_sliding`, not `lift_slide`, since a plan does not show lifting; it reads half its `width`. `fixed` and `tilt` are no way onto a balcony. `archlang-3d` gains the word in its closed lists, which is not M2 work, and bumps with the core that ships it, or a published package rejects the plan | the plans being redrawn print another English word; a third panel count arrives |
| D39 | **2026-11-02 (by delegation, J9):** `schedule rooms net`, a word on the existing statement. The stamp reads the schedule's own rows and says ` net`. A room the schedule cannot measure, or that no wall touches, keeps its bare stamp, so `net` never claims a deduction that did not happen. Ties round up from the table's two decimals | authors want net stamps with no schedule table; the suffix reads as noise |
| D40 | **2026-11-02 (by delegation, J10):** `open between` takes no position, because over one span it draws and lints as `opening between`, the positioned form, and ADR 0028's fourth-clause condition does not fire. A corner window is `at corner <edge>`, two windows, two ordinary cuts, so the joinery is unchanged; `width` runs to the outer corner; a lone leg is refused; legs share `sill` and `head`; marks stand in a leg's clear span; a `hinge` naming the corner end is refused, since no pier stands there | a plan needs an off-centre voided run that still closes the pair; a schedule must carry one mark for the pair; a real plan needs legs at different heights |
| D41 | **2026-11-02 (by delegation, J11):** a turn landing is read leg by leg along each flight that meets it, never by the walking line's length, once per climb, on the stop the climb starts from. A corner landing cannot be shorter than `width`, so only a wall or 1200 mm outside a dwelling reports there. A rising block's climb spreads over its flights, landings level. No `shape` shortcut (2 of 8 orientations, the compiler would choose, 40+ spec units) and no winders (the profile figures are unread and a partial form is worse) | a second ask, or measured `E_STAIR_PIECES` failures; the owner rules on step geometry with sourced figures |
| D42 | **2026-11-02 (by delegation, J12):** Plan JSON stays `version` 1: a wall's `arc` is a member of the point it arrives at and `paper` sits beside `scale`, so a core older than 1.53 reads such a document silently as the chord with no sheet, which the docs say. The converter seam is a recipe, `tools/plan-to-geojson/`, labelled experimental, not a plugin API. DXF blocks are shared by measured equality in each element's quarter-turn frame, driven by a non-enumerable `Scene.parts`; a figure that is not whole is written out. `check:dxf` gates through ezdxf in `Workspace builds`; no CAD program is promised | a consumer shows a point member breaks it; a second converter shows what a shared helper must hold; a CAD user needs shared blocks on angled walls |
| D43 | **2026-11-02 (by delegation, J13):** `sheet text { … }` is an authored table of stable keys plus `decimal`, plan-level and once. ArchLang ships no translations and reads no environment locale: a key left out keeps its English word. It reaches drawn text only; `describe()`, Plan JSON, DXF numeric fields and `lint()` messages keep their points and their English. Plan JSON reports it in `dropped` | a second language's users ask for a shipped table; a consumer needs the words in the document |
| D44 | **2026-11-02 (by delegation, J15):** `axis.3` is a datum read on every storey, refused where it cannot be read (`let`, `place … at`, a placed component) and in the form `at axis.2 from …`. No per-storey grid: `W_AXES_DIFFER` reports one block coming out as two. `keep on axis` holds a column at its centre. D27 closes: `bounds()` adds the break line's ends, so the ink, `describe()` and `lint()` hold and the page widens by the reach; `W_DRAWING_OVERFLOW` can newly fire and a stair whose break line alone passes the range is `E_OUT_OF_RANGE`. D25's route is not built yet: `keep stacked` refuses a wall | first-contact runs keep writing `A/3`; a real building needs another grid on a storey |
| D46 | **2026-11-06 (by delegation, after the owner asked the agent to decide; ratified by the owner the same day, "我全部同意"):** D41's "no winders" is lifted for the form in PR #533 (gerontec, issue #532): a `winders <n>` clause on a quarter-turn landing of exactly `width` × `width`, 2–8, geometry only. D24's reverse-if fired (a real plan a landing cannot stand in for) and #532 is read as the second ask. D41's objection that "a partial form is worse" is answered without any sourced figure: lint credits a winder landing with `min(n, floor(arc / going))` goings, where `arc` is the walking line the glyph draws across the landing (the quarter arc at `width / 2`) and `going` is the profile's existing minimum, and the "each going at least …" clause never covers the winders. No DIN 18065 figure, no German profile, no helix, no taper into the flights. Merge needs the four review fixes on #533 and CI green; the 3D package's flat winder landing is a follow-up card | the owner rules otherwise, or a sourced going figure arrives and replaces the geometric credit |
| D45 | **2026-11-02 (by delegation, J14):** `hidden` on `north`, `scale`, `title` frees the mark's band, so `describe()`'s `scale` and `sheet` can move where the auto fit changes. `mirror` on a piece takes no axis and swaps its hand, its back stays. `floor` is a hatch, a drawing fact. `paper auto` is not built: ADR 0024 refuses it by name, and `arch finish --only sheet` writes the sheet into the source. Plan JSON converts a piece's `mirror`, and keeps `E_JSON_MIRROR` for a piece flattened out of a `place` | the owner amends ADR 0024; authors ask for one word to hide all marks; a theme grows per-room tints |

## 4. Order of work (waves; a wave opens when the previous wave's gate is met)

| Wave | Cards (parallel within a wave) | Gate to open the next wave |
|---|---|---|
| 0 | A0 (C1/C2 + ADR 0031), B6 (garage lint), C1 (drafting-order guidance), growth corrections (filed 2026-10-28) | A0 merged |
| 1 | A1 (M0 skeleton + adapter + H1 + Scene3D v0), B1 (lock check), B4 (quantities) | A1 accepted (34 examples adapt or refuse by name) |
| 2 | A2 (Mesh3D geometry) then A3 (replay viewer + CLI video), B3a (wall status semantics), B5 (imperial input) | A3 accepted = **Tier A may open** (owner confirms) |
| 3 | A4 (GLB + gates + `check:3d` CI), A5 (playground toggle; its merge opens Tier A), B3b (wall status drawing + example) | A4 green and N10 window started |
| 4 | D1 (DXF blocks U.13), A6 (browser MP4, parked), archlang-3d M2+ as planned; ArchCanvas E-cards per its own spec | N10 read (≈4 weeks after the first Tier A post) |
| 5 (added 2026-10-29, runs before wave 4) | A9, G1 (surface what shipped), G2 (roadmap issues reconciled; owner approves the text), G3 (rooms-only Plan JSON import + mask recipe), G4 (metrics strip), G5 (wall-closure measure-first); ArchCanvas E0–E3 in that repository | G1 and G2 landed (the public roadmap is honest), and the owner's first Tier A post made |
| 7 (added 2026-10-31, D23; independent of N10) | H0–H8 (1.48.0), then L1, L2 (1.49.0), then S1–S3 and S4 if there is room (1.50.0) | L1 and L2 share a release; S1–S3 share a release; nothing new in the language after 2026-11-24 until Show HN has run |

The companion ArchCanvas work (E-cards: quick-action telemetry, visible self-check, door flip and
furniture nudge, later the 3D tab) is specified in that repository
(`docs/specs/2026-10-28-value-theatre-and-canvas-tweaks.md`) and runs in parallel from wave 0; it does
not depend on this programme until its 3D tab (Tier B).

## 5. What would prove this programme wrong

1. **The top-down 2D phase of the replay looks bare** without the core sheet's fill, dims and labels,
   and the cross-fade is not enough. Then the replay would need the core SVG drawn element by element,
   which needs per-wall tags in the drawing: a core change. Honest fallback: the replay starts at walls.
2. **The C1 PR is refused or slow.** The package deep-imports `src/analyze` meanwhile (R1); ArchCanvas
   waits for a core release either way.
3. **Rising walls expose joint artefacts** a static GLB hides (mixed-height notches, pinched polygons;
   1.6 % of synthetic plans). Then A2's budget was low and the viewer needs the Q19 warning rendered.
4. **The N10 read is negative**: impressions without installs or activations. 3D returns to the v0.6
   order and pace; the renovation wedge continues on its own evidence.
5. **A discovery interview shows remodelers do not value the preview but do value the lock.** Reorder:
   wave 2's B-cards ahead of A2/A3.
6. **B3a's audit of `ir.walls` consumers finds a consumer that cannot decide** what a demolished wall
   is (for example net area under a profile). Then `demolish` ships drawing-only first, with lint and
   describe treating it as `existing`, and the semantics follow in a card of their own.

## 6. Owner-only steps (never automated)

- ~~Cutting the core release that carries C1/C2 and the stages~~: delegated to the agent by D15;
  1.44.0 carried them.
- Registering the npm trusted publisher for `@chanmeng666/archlang-3d`; the first 0.x publish.
- ~~Confirming the merge of A5~~: confirmed by D16 (A5 merged, Tier A open). Each Tier A post stays
  the owner's.
- Reading N10 at four weeks and deciding Tier B.
- Uploading each VS Code `.vsix` to the Marketplace (D16: the agent builds and verifies it, then
  guides the upload).
- ~~Updating `strategy/positioning.md` row 8 at Tier A~~: done by the agent at the owner's request
  (archcanvas-growth #22); the Tier B rewrite rides with the ArchCanvas PR.

## 7. Related documents

`../archlang-3d/` (the 3D plan, v0.6, and `amendment-v0.7.md`) · `../plan-soundness/` (the format
this follows; its stages and `keep`/`impact` are reused) · `docs/adr/0021`, `0028`, `0032`, `0033` ·
`docs/backlog.md` U.13, U.14, P2-4, P3-2, V.5 · growth repository
`research/2026-10-25-x-cad-and-solvaix-research/` and `strategy/decisions/2026-10-28-…` · ArchCanvas
`docs/specs/2026-10-28-value-theatre-and-canvas-tweaks.md`.
