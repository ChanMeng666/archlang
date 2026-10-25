/**
 * The measured byte-identity baseline for the shipped example corpus, importable by more
 * than one law.
 *
 * It lives beside the tests rather than inside one because two of them now make the same
 * corpus-wide claim from different directions: `height-byte-identity.test.ts` says a plan
 * that writes no `height` clause is untouched by the vertical datum, and
 * `iso-byte-identity.test.ts` says a compile that passes no `view` is untouched by the
 * axonometric. A second hand-typed copy of thirty hashes would be a second thing to keep
 * true, and the whole point of these tables is that they are measured once and never
 * edited to go green.
 *
 * Both numbers were measured on `f4548db` — the last tree before the datum layer — by a script that
 * imported the digest bodies in `./byte-identity-digest.ts`, never a lookalike. See
 * `height-byte-identity.test.ts`'s header for why that matters and what to do if one moves.
 *
 * ## Every row still stands, including the one whose example now authors heights
 *
 * A shipped example gaining a `height` clause looks, at first, like a row that must be
 * retired: the plan's surfaces are no longer what the baseline measured, because `describe()`
 * grows a `heights` block and a `head`/`sill` on every opening. It is not. The row is
 * honoured against that plan's **height-free derivation** (`./height-free-source.ts`) —
 * the same file with its datum clauses mechanically removed — which is behaviourally the
 * text that shipped. So the measurement keeps its full force: nothing about the plan moved
 * except what authoring the datum is supposed to move, and no hash was re-measured or
 * re-typed to make room for the new example. {@link AUTHORS_HEIGHT} names the plans read
 * that way.
 *
 * ## The one row that WAS re-measured, and the class it exposed
 *
 * `hillside-villa`'s two rows moved, and the cause is worth knowing before the next red run
 * sends someone hunting a compiler bug: **a `lint()`/`describe()` diagnostic carries a byte
 * `span` into the source, so editing an example's PROSE moves every span below it.** Fixing
 * a wrong sentence in that file's header comment added 251 bytes, and all three of its
 * diagnostics shifted by exactly 251 — `W_BATH_VIA_BEDROOM` 2313→2564 and two
 * `W_ROOM_NOT_EQUATOR_FACING` 12347→12598 and 12513→12764. Every other field of every
 * diagnostic is unchanged and **every storey's SVG is byte-identical**; the digest covers
 * the spans because they are part of the agent-facing surface, and a consumer of
 * `arch lint --json` really does get different numbers.
 *
 * So the rule these tables live by needs one clause it did not have. A moved digest is
 * still a finding to explain before it is a diff to bless, but there are now TWO sanctioned
 * explanations, and they are distinguishable without trusting anybody:
 *
 *   1. the compiler changed — the SVG moves too, or a non-`span` field moves. Investigate.
 *   2. a shipped example's SOURCE BYTES moved above a diagnostic. The SVG is byte-identical
 *      and the ONLY delta is a uniform shift of every span by the byte count added.
 *   3. a deliberate change to a diagnostic's TEXT — the `message`/`hints` an agent reads to
 *      repair the plan, or a duplicate report of one defect withdrawn. Every storey's SVG,
 *      `describe()` and `compile().diagnostics` are byte-identical, and putting the OLD
 *      `lint()` back into the NEW payload reproduces the old hash; only the rows of plans that
 *      raise a re-worded code move, each named with its reason in the commit and below.
 *
 * Check (2) by diffing the two `lint()` payloads field by field; if the shift is not uniform, it is case (1) wearing case
 * (2)'s clothes. Only `hillside-villa` was affected here, because it is the one example
 * deliberately left with warnings — `aquarium` and `two-storey` had their prose edited in
 * the same branch and did not move, since a plan that lints clean has no spans to shift.
 *
 * ## Four drawing rows re-measured for stepped-facade dimensions; no summary row moved
 *
 * The four summary rows below (`describe()` + `lint()`) were checked against this table and
 * are unchanged. Only the whole-surface rows moved, and only in the SVG, for two named
 * reasons:
 *
 *   - `hexagon-pavilion` and `terrace-row` — case (1), the compiler changed. A `dims auto`
 *     side whose wall probe finds no line (an angled or stepped facade) used to take its
 *     outer face from the ROOM bounding box, so the chains hung off a line inside the wall.
 *     It now takes the outermost wall face on the facade outline. Two published numbers
 *     were wrong and are corrected: hexagon-pavilion's overall width 15000 → 15375 (the
 *     drawn mitred corners, not the centerline vertices) and terrace-row's left overall
 *     9725 → 9850 (face to face, like every other overall). `test/stepped-facade-dims.test.ts`
 *     pins both.
 *   - `aquarium` and `gallery-l` — case (2)'s sibling: the example SOURCE changed. Each
 *     gained hand-written `dim`s on the openings no chain can measure (two windows on the
 *     curve, a door on the angled face), which is the remedy `W_OPENING_NOT_DIMENSIONED`
 *     asks for. The new dims draw, so the SVG moves. They do not appear in `describe()`,
 *     and they close the warning, so both plans lint exactly as the baseline did.
 *
 * Every other row was left alone, and the whole corpus was swept by SHA-256 over every
 * storey's SVG + `describe()` + `lint()` before and after, to show that nothing else moved.
 *
 * ## `aquarium`'s SUMMARY row moved too: the example over-reported its floor
 *
 * The only summary row ever re-measured for an example's own content, and deliberately:
 * the numbers it pinned were wrong. `cafe` and `concourse` were rectangles running into
 * the bowed south-east corner, so they claimed floor OUTSIDE the curved wall: the cafe
 * was 200 m² against about 169 m² inside the wall. Both are now polygons whose vertices
 * sit on the arc, snapped inward. Field by field, `describe()` changes only by what that
 * implies: cafe 200 → 167.97 m², concourse 480 → 479.8 m², the total and caption
 * 2061.06 → 2028.83 m², `w_arc1`/`w_arc2` now light `cafe` instead of no room (and
 * `w_arc1` faces E, not S), and two walk distances move by one nav-grid cell, because the
 * grid scales with floor area. `lint()` is still clean. The compiler did not change.
 *
 * ## `terrace-row`'s drawing row moved: a mirrored sliding door takes the other track
 *
 * Case (1), the compiler changed, in the drawing only (backlog E.12, `slide-track`). The
 * example places `unit()` twice with `mirror x` (`u2`, `u4`), and each unit has a `sliding`
 * rear door. A sliding door's fixed panel runs on the track `slide × left normal`, a handed
 * product the reflection used to leave alone, so the mirrored units drew their panels on
 * the wrong faces. Field by field: exactly four `<polygon>`s change, the fixed and moving
 * panels of `u2.rear` and `u4.rear`, each moving from one track to the other (centre
 * y = +37.5 ↔ −37.5 about the wall line) with its x-extent unchanged, so each mirrored
 * door now matches the unmirrored units' `u1.rear`/`u3.rear`. Every other SVG byte is
 * unchanged, and `describe()` + `lint()` are identical: the summary row below did not move.
 * The PNG golden's changed pixels lie within x ∈ [9194, 10318] ∪ [20594, 21718],
 * y ∈ [−82, 82] mm, the two doorways.
 *
 * ## Fourteen rows re-measured for circulation (W3b): `describe().circulation` only
 *
 * Case (1), the compiler changed, and deliberately. For every row below the default SVG,
 * `lint()` and `compile().diagnostics` are byte-identical (swept per storey); the ONLY
 * `describe()` fields that moved are under `describe().circulation` (and each storey's
 * `levels[].circulation`). The opt-in `--overlay circulation` drawing (not part of these
 * digests) moves with them on the same fourteen plans, since it draws the same walks. Two
 * changes are responsible:
 *
 *   - **Every room walks from its NEAREST entrance** (owner decision, backlog G.5). On the
 *     twelve examples with more than one entrance, each room is measured from the entrance
 *     nearest it, its bottleneck is the widest way in from ANY entrance, its detour is taken
 *     from its own entrance, and it gains `entranceId`. Rooms that were `unmeasured:
 *     other_entrance` are now measured.
 *     - `bungalow`: r_living walk 13000 → 4000, bottleneck 940 → 1940; r_kitchen 11700 →
 *       9900 (bottleneck 1100); r_bath 9300 → 8900; r_hall, r_entry bottleneck 940 → 1100.
 *     - `garden-house` (ground storey): r_living 10100 → 2600, r_kitchen 11400 → 3800,
 *       r_garage 13300 → 3500; bottlenecks widen (r_hall 940 → 1600, r_garage 740 → 2940).
 *     - `hillside-villa`: r_living 8200 → 4300; r_garage and r_utility, formerly
 *       `other_entrance`, measured (2800, 1900 mm).
 *     - `laneway-house`: r_bed 9200 → 4400; r_live bottleneck 840 → 1740.
 *     - `library`: r_cafe 40900 → 17700, r_eaisle 32200 → 11200, r_staff 27400 → 16000,
 *       r_kitchen 46400 → 8600 (bottleneck 940 → 1140).
 *     - `materials`: r_shop 7100 → 4100, r_office 16800 → 13200, r_store 14300 → 10700,
 *       r_wc 12000 → 8400.
 *     - `museum`: g3, store, office, link, wcw, wcm, plant, cafe walk from their nearest of
 *       the three entrances (store 102765 → 6820, cafe 97495 → 50840, …).
 *     - `museum-wings`: every east-wing room walks from the east door (east.g1 44800 →
 *       8900, …); every bottleneck 1140 → 1740.
 *     - `parametric`: room_2 and room_3, formerly `other_entrance`, measured (2300 mm).
 *     - `terrace-row`: houses 2–4 (twelve rooms, formerly `other_entrance`) measured from
 *       their own doors, with three new bedroom → bath routes; u1.bed 8700 → 1900.
 *     - `townhouse` (ground storey): r_kitchen 9500 → 4100, r_wc 8200 → 7400.
 *     - `transit-hall`: every room walks from its nearest of the entrances (r_control
 *       43440 → 5160, …).
 *   - **The nav grid samples in its extent's own frame, snapped to 2⁻¹⁰ mm**, so a pure
 *     translation moves no circulation fact (short of an ulp-level residue at a
 *     half-quantum). The snap moves a curve's tessellated vertices
 *     by under a micron, which re-resolves one exact tie on each of three plans, to the value
 *     the translated plan also reads:
 *     - `aquarium`: rotunda_r detour 1.01 → 1 (its only moved field);
 *     - `hexagon-pavilion`: rotunda walk 5800 → 5700 (its only moved field);
 *     - `library`: r_reading walk 25500 → 25400 (with the entrance changes above).
 *
 * The concave-room pole orbit (the same branch) moved no row. `garage-`, `outdoor-` and
 * `roof-void-byte-identity.test.ts` carry their own copies of some of these rows (and a
 * whole-surface digest of `laneway-house` and `aquarium` under their own body); they moved
 * for exactly these reasons and were re-measured in the same commit.
 *
 * `relational` (both rows) re-measured for W3b's door-route gate: circulation now reports a
 * room the access graph cannot reach as `no_door_route` even when the raster walks into it.
 * relational has no interior wall at all (its rooms are placed relationally, partitions
 * are not drawn), so the grid walked from the living room straight into `kitchen`, `bed`
 * and `bath`, which have no door (`W_ROOM_DISCONNECTED`, `access.rooms[].reachable:
 * false`). Field by field: those three `circulation.rooms[]` entries and the two routes
 * that start from them (kitchen → living, bed → bath) are gone, and `circulation.unmeasured`
 * lists the three as `no_door_route`. SVG and `lint()` are byte-identical.
 *
 * `terrace-row`'s whole-surface row carries BOTH re-measurements above: W5b's SVG (the
 * mirrored sliding doors) and W3b's circulation. Re-measured once on the merged tree; a
 * same-tree sweep with only W3b's `src/` swapped out shows W3b moves `describe()` alone.
 *
 * ## `museum-wings`: whole-surface row re-measured for a source edit; the summary row holds
 *
 * Case (2)'s cousin, and NOT the compiler: the EXAMPLE changed. `d_east` was `hinge right`
 * and is now `hinge left`, so the east hall door is the true mirror image of `d_west`
 * (`east.shell` runs the opposite way, the same word hangs the leaf on the mirrored jamb),
 * (that consistency shows in `describe --facts symmetry` only once `d_main` is removed — see
 * `symmetry.test.ts`; with `d_main` present `full` is C1 before and after, and the symmetry
 * output is byte-identical). Field by field, on the same compiler, before/after:
 *
 *   - SVG: exactly two lines move, both `d_east`'s leaf — the leaf `<line>` from
 *     `(24000,11400)→(22200,11400)` to `(24000,9600)→(22200,9600)` and the swing arc from
 *     `M 22200,11400 A 1800 1800 0 0 1 24000,9600` to `M 22200,9600 A 1800 1800 0 0 0
 *     24000,11400` — the hinge jamb flips from the south jamb to the north one. 49072 → 49070
 *     bytes (the arc's sweep flag and the coordinates' digits); nothing else in the drawing.
 *   - `describe()`: byte-identical (a door's hinge side is not in `describe()`).
 *   - `lint()`: byte-identical, no diagnostics either side (the added source is comment lines
 *     above every diagnostic-free statement, so there is no span to shift).
 *
 * So `SEMANTIC_BASELINE`'s `museum-wings` row is unchanged, and only the whole-surface row
 * here (and `while-byte-identity-baseline.ts`'s, which digests the SVG too) was re-measured,
 * with the tests' own digest bodies.
 *
 * ## Circulation v2 (backlog E.6–E.10, C.1): 24 examples re-measured, `describe().circulation` only
 *
 * Case (1), the compiler changed, deliberately. The nav grid breaks its ties D4-symmetrically
 * instead of in page order, so a turned or flipped plan measures the same walks. For EVERY
 * moved row below the default SVG (every storey), `lint()` and `compile().diagnostics` are
 * byte-identical, and the only `describe()` fields that moved are under
 * `describe().circulation` (each storey's `levels[].circulation` on a multi-storey plan):
 * room walks, detour ratios and key routes. No bottleneck, no `entranceId`, no `blocked` or
 * `unmeasured` entry moved; `accessible`, `gallery-l`, `museum`, `parametric`, `relational`
 * and `themed` did not move at all. Swept on the rebased tree (SVG per storey, `describe()`,
 * `lint()`, `compile().diagnostics`, field by field) against the same tree with the four
 * circulation files taken from `feat/algebra-followup`; a planted bottleneck change was
 * caught by the same sweep first. Each moved field, before → after, and the rule that moved
 * it (a field two rules moved names both, in commit order):
 *
 *   A — a room's nearest-cell tie is broken by the walk, then a D4-invariant key, not the
 *       row-major first (every even-celled room's centre sits on a lattice corner);
 *   E — an entrance on a lattice line seeds both sides of it, and the straight line a
 *       detour divides by runs to the nearer seed;
 *   T — a threshold is carved on a symmetric row set (both sides, nearest seed pairs, both
 *       L-runs, the host wall's axis);
 *   S — a room's seed point is snapped to the frame lattice (the library drum's centroid was
 *       an ulp off its lattice corner).
 *
 * `hexagon-pavilion`'s g_sw/g_se [T] rows are rule-consistent, not a correction: the oblique
 * drum portals are carved as L-shaped tunnels between seeds either side of 1200 mm of masonry,
 * and the symmetric seeds give a different tunnel (backlog C.5). Key routes are measured between
 * the rooms' tie sets (`routeBetween`); that moved no route in the corpus.
 *
 * The centreline cover for walls thinner than a cell (C.1) moves no row: on the shipped
 * corpus it blocks no cell the centre test does not already block (the residual census,
 * `test/nav-grid-residual.test.ts`, counts zero `centrelineCover` cells).
 *
 *     - `aquarium`: rotunda_r walk 25900→25700 [AE]; reef walk 45400→45100 [AE]; kelp walk
 *       45200→45100 [A]; plant walk 36900→36700 [AE]; concourse walk 13900→13800 [E]; concourse
 *       detour 1.01→1 [E]; foyer walk 4900→4700 [A]; foyer detour 1.02→1 [A]; shop walk
 *       24900→24600 [AE]
 *     - `attached`: r_living walk 2000→1800 [A]; r_living detour 1.05→1 [A]; r_bed walk
 *       4700→4600 [A]; r_bed detour 1.39→1.38 [A]
 *     - `bungalow`: r_living walk 4000→3900 [E]; r_living detour 1.41→1.4 [E]; r_bed1 walk
 *       8400→8200 [AE]; r_bed1 detour 1.32→1.31 [A]; r_kitchen walk 9900→9700 [AE]; r_kitchen
 *       detour 1.35→1.34 [A]; r_hall walk 5400→5200 [AE]; r_laundry walk 6600→6400 [AE];
 *       r_laundry detour 1.97→2.02 [AE]; r_entry walk 1100→900 [A]; r_entry detour 1.09→1 [A];
 *       route r_kitchen>r_living walk 6100→6000 [A]; route r_kitchen>r_living detour 1.33→1.32
 *       [A]; route r_bed1>r_bath walk 8100→8200 [A]
 *     - `clinic`: r_wait walk 10100→10000 [A]; r_wait detour 1.24→1.23 [A]; r_corr walk
 *       16200→16100 [A]
 *     - `courtyard-house`: r_dining walk 12900→11500 [A]; r_dining detour 1.23→1.09 [A]; r_bed1
 *       walk 13700→13500 [T]; r_bed1 detour 1.6→1.57 [T]; r_study walk 9900→9700 [T]; r_study
 *       detour 2.22→2.17 [T]; route r_bed1>r_bath walk 17300→17100 [T]; route r_bed1>r_bath
 *       detour 1.37→1.35 [T]; route r_bed2>r_bath walk 11800→11600 [T]; route r_bed2>r_bath
 *       detour 1.49→1.46 [T]; route r_bed3>r_bath walk 9400→9200 [T]; route r_bed3>r_bath
 *       detour 1.79→1.75 [T]
 *     - `furnished-flat`: r_live walk 11200→11100 [E]; r_util walk 4400→4200 [AE]; r_util
 *       detour 1.94→1.98 [AE]; r_hall walk 4200→4000 [A]; r_hall detour 1.02→1 [A]
 *     - `garden-house`: L0 r_hall walk 4500→4400 [A]; L0 r_hall detour 1.07→1.05 [A]; L1
 *       r_landing walk 7400→7100 [AE]; L1 r_landing detour 1.4→1.39 [A]; L1 r_bed3 walk
 *       8000→7900 [E]; L1 r_bed3 detour 1.26→1.27 [E]; L1 r_bath walk 11900→11800 [E]; L1
 *       r_bath detour 1.7→1.68 [E]; L1 route r_bed1>r_bath walk 10300→10100 [T]; L1 route
 *       r_bed1>r_bath detour 2.29→2.24 [T]
 *     - `garden-loft`: r_live walk 4400→2500 [AE]; r_live detour 1.29→1.39 [AE]; r_bed walk
 *       4900→4800 [A]; route r_bed>r_bath walk 4600→4500 [A]; route r_bed>r_bath detour
 *       1.91→1.95 [A]
 *     - `hexagon-pavilion`: g_ne walk 12200→12100 [T]; g_n walk 11600→10400 [T]; g_n detour
 *       1.12→1 [T]; g_sw walk 9200→9800 [T]; g_sw detour 1.75→1.87 [T]; g_se walk 9300→9800
 *       [T]; g_se detour 1.75→1.87 [ET]
 *     - `hillside-villa`: L0 r_utility walk 1900→1700 [AE]; L0 r_utility detour 1.05→1 [AE]; L0
 *       r_powder walk 6700→6600 [A]; L0 r_powder detour 2.23→2.17 [A]; L0 r_pantry walk
 *       9600→9500 [A]; L0 r_pantry detour 1.64→1.62 [A]; L0 r_office walk 5900→5800 [E]; L0
 *       r_entry walk 1900→1800 [A]; L0 r_entry detour 1.05→1 [A]; L0 r_dining walk 8100→8000
 *       [A]; L0 r_dining detour 1.3→1.29 [A]; L0 r_terrace walk 17300→17200 [E]; L0 r_terrace
 *       detour 1.63→1.62 [E]; L0 route r_kitchen>r_dining walk 6900→6800 [A]; L0 route
 *       r_kitchen>r_dining detour 1.38→1.39 [A]
 *     - `imports`: r_main walk 2500→2400 [A]; r_main detour 1.25→1.26 [A]
 *     - `laneway-house`: r_live walk 2400→2300 [A]; r_live detour 1.04→1 [A]; r_bed walk
 *       4400→4300 [A]; route r_bed>r_bath walk 8400→8100 [AT]; route r_bed>r_bath detour
 *       2.58→2.41 [AT]
 *     - `library`: r_hall walk 3900→3700 [A]; r_hall detour 1.03→1 [A]; r_reading walk
 *       25400→25300 [S]; r_children walk 22700→22600 [E]; r_waisle walk 32400→32100 [AE];
 *       r_cafe walk 17700→17600 [E]; r_eaisle walk 11200→11100 [A]; r_eaisle detour 1.27→1.28
 *       [A]; r_lobby walk 22700→22600 [A]; r_stacks walk 51900→51700 [AE]; r_ref walk
 *       37100→36900 [AE]; r_staff walk 16000→15900 [A]; r_kitchen walk 8600→8400 [AE];
 *       r_kitchen detour 1.34→1.33 [A]; route r_kitchen>r_cafe walk 9700→9800 [A]
 *     - `materials`: r_shop walk 4100→3900 [AE]; r_shop detour 1.08→1.05 [E]; r_store walk
 *       10700→10600 [A]; r_store detour 1.33→1.32 [A]
 *     - `museum-wing`: g1 walk 8800→8600 [AE]; g1 detour 1.32→1.33 [E]; g2 walk 14800→14600
 *       [AE]; g3 walk 20800→20600 [AE]; g3 detour 1.31→1.3 [A]; corridor walk 10000→9900 [A];
 *       corridor detour 1.15→1.14 [A]
 *     - `museum-wings`: west.g1 walk 8800→8600 [AE]; west.g1 detour 1.32→1.33 [E]; west.g2 walk
 *       14800→14600 [AE]; west.g3 walk 13400→13100 [AE]; west.corridor walk 10000→9900 [A];
 *       west.corridor detour 1.15→1.14 [A]; east.g1 walk 8900→8600 [AE]; east.g2 walk
 *       14900→14600 [AE]; east.g3 walk 13200→13100 [A]; east.corridor walk 10100→9900 [A];
 *       east.corridor detour 1.15→1.14 [A]; hall walk 5900→5700 [A]; hall detour 1.02→1 [A]
 *     - `one-room`: r_main walk 2700→2400 [AE]; r_main detour 1.31→1.26 [AE]
 *     - `studio`: r_living walk 4000→3700 [AE]; r_living detour 1.29→1.26 [AE]; r_bed walk
 *       7500→7400 [A]; r_bed detour 1.39→1.4 [A]; r_hall walk 4600→4500 [A]; route r_bed>r_bath
 *       walk 5100→5000 [A]; route r_bed>r_bath detour 1.31→1.32 [A]
 *     - `terrace-row`: u1.bath walk 9200→9100 [A]; u1.bath detour 2.63→2.56 [A]; u1.hall walk
 *       5700→5500 [AE]; u1.hall detour 1.39→1.37 [AE]; u1.living walk 2400→2300 [A]; u1.living
 *       detour 1.37→1.38 [A]; u2.bed walk 2000→1900 [E]; u2.bed detour 1.26→1.22 [E]; u2.bath
 *       walk 9400→9100 [AE]; u2.hall walk 5900→5500 [AT]; u2.hall detour 1.42→1.37 [T];
 *       u2.living walk 2600→2300 [AE]; u2.living detour 1.4→1.38 [AE]; u3.bath walk 9800→9700
 *       [A]; u3.bath detour 2.43→2.38 [A]; u3.hall walk 6000→5800 [AE]; u3.hall detour
 *       1.44→1.42 [AE]; u3.living walk 2700→2600 [A]; u4.bed walk 2000→1900 [E]; u4.bed detour
 *       1.26→1.22 [E]; u4.bath walk 9400→9100 [AE]; u4.hall walk 5900→5500 [AT]; u4.hall detour
 *       1.42→1.37 [T]; u4.living walk 2600→2300 [AE]; u4.living detour 1.4→1.38 [AE]; route
 *       u1.bed>u1.bath walk 7300→7200 [A]; route u1.bed>u1.bath detour 2.79→2.74 [A]; route
 *       u2.bed>u2.bath walk 7400→7200 [A]; route u2.bed>u2.bath detour 2.72→2.74 [A]; route
 *       u3.bed>u3.bath walk 7300→7200 [A]; route u3.bed>u3.bath detour 2.52→2.48 [A]; route
 *       u4.bed>u4.bath walk 7400→7200 [A]; route u4.bed>u4.bath detour 2.72→2.74 [A]
 *     - `tiny-house`: r_main walk 1800→1600 [AE]; r_main detour 1.29→1.26 [AE]
 *     - `townhouse`: L0 r_hall walk 3700→3600 [E]; L0 r_hall detour 1.14→1.12 [E]; L0 r_living
 *       walk 4700→4500 [AE]; L0 r_living detour 1.4→1.41 [E]; L0 r_wc walk 7400→7100 [AE]; L0
 *       r_wc detour 1.37→1.36 [A]; L0 r_kitchen walk 4100→2300 [AE]; L0 r_kitchen detour
 *       1.39→1.35 [AE]; L0 route r_kitchen>r_living walk 9200→10400 [AT]; L0 route
 *       r_kitchen>r_living detour 1.56→1.39 [AT]
 *     - `transit-hall`: r_shop1 walk 61680→61440 [AE]; r_shop2 walk 55200→54960 [AE]; r_shop3
 *       walk 48600→48360 [AE]; r_shop4 walk 42120→41880 [AE]; r_paid walk 34200→34080 [E];
 *       r_unpaid walk 13920→13680 [AE]; r_unpaid detour 1.08→1.07 [E]; r_lobby walk 23280→23040
 *       [A]; r_wc_a walk 23520→23400 [A]; r_wc_a detour 2.42→2.43 [A]
 *     - `two-bed`: r_kitchen walk 11900→11600 [AE]; r_bed1 walk 9300→8900 [AE]; r_bed1 detour
 *       1.7→1.68 [AE]; r_bed2 walk 15000→14900 [E]; r_bed2 detour 2.26→2.28 [E]; r_bath walk
 *       4400→4100 [AE]; r_hall walk 1400→1200 [A]; r_hall detour 1.07→1 [A]; route
 *       r_bed1>r_bath walk 5700→5400 [A]; route r_bed1>r_bath detour 1.31→1.29 [A]; route
 *       r_bed2>r_bath walk 10600→10800 [A]; route r_bed2>r_bath detour 3.12→3.08 [A]
 *     - `two-storey`: L0 hall walk 3600→3500 [A]; L0 living walk 9000→8900 [A]; L0 kitchen walk
 *       5500→5400 [A]; L0 kitchen detour 1.3→1.29 [A]
 *
 * `garage-`, `outdoor-` and `roof-void-byte-identity.test.ts` carry their own copies of some of
 * these rows and moved for exactly these reasons; each was re-measured in the same commit with
 * its own digest body.
 *
 * ## `museum-wings`: both rows re-measured — the main door is a mirror pair (backlog 6.8)
 *
 * The EXAMPLE changed, on a compiler that alone moves nothing: the same sweep (every storey's
 * SVG, `describe()`, `lint()`, `compile().diagnostics`, plus `lint()` under
 * `accessibility-advisory` and `describe --facts symmetry`, over every example and fixture)
 * run before and after the `W_SWING_OBSTRUCTED` change with the examples untouched moved 0 of
 * 279 payloads. Then `d_main` (one 1800 mm leaf at x=21000, `hinge left`) became `d_main_w`
 * and `d_main_e`, two 1000 mm leaves at x=20500 / 21500 hinged on their outer jambs and
 * meeting at a shared closed jamb on the axis. Field by field, before → after:
 *
 *   - SVG (49070 → 49982 bytes): `hall_south`'s cut in the poche path (fill and stroke)
 *     widens from 20100…21900 to 20000…22000, one gap, no sliver at the shared jamb; the one
 *     door's opening polygon, leaf `<line>` and swing arc become two, `(20000,11000)` arc to
 *     `(21000,12000)` and `(22000,11000)` arc to `(21000,12000)`; the `dims auto` south
 *     chain 20250 | 1800 | 20250 becomes 20150 | 1000 | 1000 | 20150 (its ticks and texts
 *     move with it). Nothing else in the drawing.
 *   - `describe()`: `doors` 5 → 6 and the caption's "5 doors … and 1 more" → "6 doors … and 2
 *     more"; `doors[]`/`access.doors[]`/`entrances`/`placement.elements` carry `d_main_w` and
 *     `d_main_e` (width 1000, clear 940) for `d_main` (1800, clear 1740); `placement` total
 *     18 → 19, absolute 12 → 13. The widest route in is now through a wing's 1200 mm exit (clear
 *     1140), not the 1800 mm main door, so every `access.rooms[].bottleneckClearWidth` and
 *     `circulation.rooms[].bottleneckClearWidthMm` (nine each) is 1740 → 1140 — each leaf of a
 *     double door is its own 940 mm door to the analysis. Three walks re-seed: west.g3 13100 →
 *     12600, detour 1.41 → 1.4, `d_main` → `d_main_w`; east.g3 the same with `d_main_e`; hall
 *     5700 → 6100, detour 1 → 1.07, `d_main` → `d_main_w` (the entrance left the axis). Under
 *     `--facts symmetry`, `full` is C1 → D1 x about (21000,6000) (`symmetry.test.ts`).
 *   - `lint()` and `compile().diagnostics`: `[]` before and after, and `[]` under
 *     `accessibility-advisory` too: a double door's two leaves are one assembly, clear at any
 *     swing clearance (`isDoubleDoorPair`).
 *
 * The later hint fix (the narrowing width recomputed and proved, the message's numbers rounded
 * to agree) moves no row here: no example's default `lint()` carries a `W_SWING_OBSTRUCTED`.
 * It moves only `lint()` under `accessibility-advisory`, which no digest covers, for
 * `furnished-flat`, `hillside-villa`, `imports` and `materials` (the quoted widths; the
 * minimum they are measured against, 850 → 960 mm, the narrowest door that profile passes
 * without `W_DOOR_CLEARANCE` or `W_PATH_TOO_NARROW`; and `hillside-villa`'s two `wc`
 * distances 802 → 801 mm with their shortfalls 48 → 49).
 *
 * ## Circulation on storeys reached only by a shaft: three examples, both rows each
 *
 * Case (1), the compiler changed, deliberately (owner-approved). A storey with no exterior
 * door that a shaft reaches used to have `circulation: null` while lint's reachability rule
 * already walked it from the room the stair lands in; `computeCirculation` now takes the
 * arriving runs as that storey's entrances (`arrivals`). A run arrives on L when a
 * neighbouring stop of its shaft is reachable (storey and room) in the room-aware building
 * graph with L taken out (`arrivalRuns`) — order-independent; a run boarded on L for a floor
 * reachable only through L is no entrance. Each walk starts in the row of cells in front of
 * the edge a person steps off at — the HEAD of the flight from that side,
 * `oppositeSide(tailEdge(run on the neighbouring storey))`, never the foot of a flight
 * continuing onward — seeded at the run's width, with the run's halo lifted outside that
 * edge, and the doors are walked from the arrival rooms.
 * `hillside-villa`, `townhouse` and `two-storey` move — the three examples with such a
 * storey (`garden-house`'s upper floor has its own balcony door, `access.hasEntrance:
 * true`, and does not move). For every storey of all three the SVG and
 * `compile().diagnostics` are byte-identical; in `describe()` the ONLY moved field is the
 * upper storeys' `levels[i].circulation`, `null` → the model below. The top-level
 * `circulation` repeats `levels[0]`, so it moves only on a plan whose LOWEST storey is
 * shaft-reached (a basement reached down from a ground floor); in all three examples
 * `levels[0]` is the grounded ground floor, so it does not move. Swept per storey (SVG,
 * `describe()`, `lint()`, `compile().diagnostics`, `lint()` under `accessibility-advisory`)
 * over every example, fixture, recovery-corpus, eval-golden and fidelity plan against
 * `feat/math-robustness`, after a planted label edit was caught by the same sweep: only these
 * three and `test/recovery-corpus/two-storey.arch` (a copy of `two-storey`, no digest pin)
 * moved. `entranceId` is the arriving stair's id; every model has one arrival, so no room
 * carries its own `entranceId`. Outside these tables the same change moves one docs fence:
 * the "Two-storey" example in `docs/language-reference.md` (its `levels[1].circulation`,
 * `null` → a model; no test pins a digest of it).
 *
 *     - `two-storey` level 2 (`stair` 900 × 2600; the ground flight is `dir up`, boarded at
 *       its bottom, so you step off at its top edge, y = 1500 — also the upper run's own tail;
 *       seeds at y = 1450, x = 150…950; seed width 900): entranceId `stair`; landing walk
 *       1200, bottleneck 900, detour 1.34; bath 4900 / 700 / 1.14; bed1 4400 / 700 / 1.07;
 *       bed2 7100 / 700 / 1.41; routes bed1 → bath 7900 / 740 / 1.41, bed2 → bath 5200 / 740 /
 *       1.66. The 700 is a one-hop clearance cell (`centreFreedomToClearWidth(1)`), narrower
 *       than any door on the way (740, 840): the landing is the strip between the `gallery`
 *       void (to y = 1300) and the flight's head (y = 1500).
 *     - `townhouse` level 2 (`st` 900 × 3200; arrived up the ground `dir up` flight, so at its
 *       TOP edge, y = 2600 — not the bottom edge where this storey's own `dir up` run is
 *       boarded to climb on; seed width 900): entranceId `st`; r_landing 1300 / 900 / 1.32;
 *       r_bed1 3000 / 740 / 1.19; r_bath 5700 / 740 / 1.4; r_bed2 8000 / 740 / 1.24; routes
 *       r_bed1 → r_bath 7300 / 740 / 2.09, r_bed2 → r_bath 6900 / 740 / 2.12 (a route runs room
 *       to room and does not depend on the entrance). 740 is each 800 mm door's modeled clear
 *       width.
 *     - `townhouse` level 3 (arrived up level 2's `dir up` run, so at its top edge — also this
 *       storey's own `dir down` tail): entranceId `st`; r_landing 1300 / 900 / 1.32; r_study
 *       3000 / 740 / 1.19; r_bath 5700 / 740 / 1.4; r_master 8000 / 840 / 1.24 (its 900 mm
 *       door); route r_master → r_bath 6900 / 740 / 2.12.
 *     - `hillside-villa` level 2 (`stair` 2200 × 1000, landscape; the ground flight is `dir
 *       up`, boarded at its right end, so you step off at the LEFT edge, x = 4900 — also the
 *       upper run's own tail; seeds at x = 4850, y = 2750…3650; seed width 1000): entranceId
 *       `stair`; r_bed2 2400 / 640 / 1.39; r_bed3 9000 / 640 / 1.48; en2.room 1300 / 640 / 1;
 *       en3.room 7000 / 640 / 1.66; r_master 9900 / 640 / 1.81; en_m.room 10000 / 640 / 1.21;
 *       r_landing 3600 / 1000 / 1.38; r_gallery 7500 / 900 / 1.41; routes r_bed2 → en2.room
 *       1100 / 640 / 1.09, r_bed3 → en3.room 2000 / 640 / 1.05, r_master → en_m.room 5500 / 640
 *       / 1.3; `unmeasured` r_linen `no_threshold` (its door opens onto the flight's flank).
 *       640 is a 700 mm door's clear width: en2 and en3 are entered by their 700 mm corridor
 *       doors, en_m by its one 700 mm door `d_enm`, and bedrooms 2 and 3 through their
 *       en-suites, because each bed's body-radius halo covers the bedroom's own doorway, which
 *       never carves. r_master's 640 is NOT a door on its way: it is set on the one-cell
 *       passage under the flight (y = 4050), where one cell, (4950, 4050), carries the 640 mm
 *       stamp of `d_en2_corr`'s carve — the far seed the door's inward walk reached by stepping
 *       through the stair footprint (a pre-existing carve rule; the passage's other cells read
 *       700). The narrow fix (no stamp on a far seed that was already free) was measured over
 *       the whole corpus and rejected: it also moved
 *       `eval/fidelity-plans/min-bedroom-flat.laundered.arch` (`circulation.routes[0]`'s
 *       bottleneck 740 → 14000, the open-room value: there the far-seed stamp is the door's
 *       only width on the route). The artefact no longer ships: a connector's inward walk
 *       now stops at the room's first eroded cell, so `d_en2_corr` never seeds past the
 *       flight and r_master reads 9900 / 700 / 1.81 (see "a connector's inward walk stops
 *       at the room's first eroded cell" below, which leaves that eval plan unmoved).
 *
 * `lint()`: no `W_CIRCUITOUS_PATH` (the largest new detour is 2.12, under the 3.0 maximum);
 * new `W_PATH_TOO_NARROW` only, INSERTED at that rule's place in the rule order of each
 * storey's list (the old list is a subsequence of the new one, not a prefix), every
 * pre-existing diagnostic unchanged and in its relative order. Default profile (700 mm):
 * `hillside-villa` level 2 gains six — Bedroom 2, Bedroom 3, the three Ensuites and Master
 * Suite, each "squeezes to 640 mm (60 mm below the 700 mm minimum)" (the Master Suite's
 * walk warning was later replaced by its route's, below); `townhouse` and
 * `two-storey` gain none. Under `accessibility-advisory` (900 mm, no digest covers it) the
 * same six read "260 mm below the 900 mm minimum", and `townhouse` gains six (level 2 Bedroom
 * 1, Bathroom, Bedroom 2 at 740, 160 below; level 3 Study and Shower room at 740, Main bedroom
 * at 840, 60 below) and `two-storey` three (level 2 Bath, Bedroom 1, Bedroom 2 at 700, 200
 * below).
 *
 * `hillside-villa.arch`'s comment above `d_en2_corr` was corrected in the same change (it said
 * the plan leaves one warning in; it leaves nine; it now also says why the count stays nine
 * without the carve artefact; it was rewritten again when the artefact went, below). Every default-profile
 * diagnostic's span lies above that comment, so no span moved and neither row moved for it:
 * both rows were re-measured, with the tests' own digest bodies, to the same values. Under
 * `accessibility-advisory` (no digest covers it) four of its 29 diagnostics lie below the
 * comment and their spans shift uniformly by the bytes added, every other field unchanged —
 * case (2).
 * `repair()` of the edited file differs only in its echoed source text and those offsets.
 *
 * ## `hexagon-pavilion`: both rows re-measured — a threshold no longer carves in carve order
 *
 * Case (1), the compiler changed, deliberately: an equivariance fault the random-plan oracle
 * found (`test/equivariance-corpus.test.ts`, "closed classes", the carve-order witnesses). A
 * connector's threshold points are visited centre, +d, −d in the frame's own axis order, and
 * each point's seeds were read off the LIVE nav mask, so a point could seed on a cell an
 * earlier carve had just opened — an earlier point of the same connector (a turn or flip
 * reverses the ± order: a turned plan reported a bottleneck of 740 against 700) or an earlier
 * connector (source order: a second drum portal into `g_sw` gave 8800 or 8200 by which was
 * written first). Every seed is now read off the mask as it stood before ANY connector carved
 * (`buildGrid`); nothing else changed.
 *
 * Swept before → after on the same tree, 84 files (the examples incl. `lib/`, `test/fixtures`,
 * `test/recovery-corpus`, `eval/goldens`, `eval/fidelity-plans`), seven digests per file:
 * every storey's SVG, `describe()`, `lint()`, `compile().diagnostics`, `lint()` under
 * `accessibility-advisory`, this file's combined digest, and the `--overlay circulation` SVG.
 * The sweep was shown able to fail first: 1 mm planted on `r_bed1`'s walk, a room only
 * rectangular plans have, moved `describe()` on 13 files. The result:
 *
 *   - SVG, `lint()`, `compile().diagnostics` and the accessibility `lint()`: byte-identical on
 *     all 84 files.
 *   - `describe()` (and so these rows): moved on `hexagon-pavilion` only. Field by field,
 *     `circulation.rooms[g_sw]` and `circulation.rooms[g_se]`: walk 9800 → 8800, detour
 *     1.87 → 1.68. Bottlenecks (1340), every other room, routes and `blocked`/`unmeasured`
 *     are byte-identical.
 *   - The `--overlay circulation` SVG (opt-in, pinned by no baseline): moved on 14 files and
 *     no measured fact moved with it outside the hexagon. `eval/goldens/` anchor-furniture,
 *     dims-auto-cottage, galley-kitchen, relational-studio, three-bed-2bath, two-bath-flat,
 *     two-bed-hall; `examples/` aquarium, gallery-l, hillside-villa, library, materials;
 *     `test/recovery-corpus/materials`: a room's pinch marker moves 100–400 mm along one axis
 *     at the same `clearMm`, and a room walk or key route is drawn along a different polyline
 *     of the SAME length with the same two ends (a tie among shortest paths, broken on a grid
 *     whose carved cells differ). `hexagon-pavilion`: g_sw and g_se are drawn along their new
 *     8800 walks, and g_ne/g_nw along equal-length (12100) alternatives.
 *
 * The two hexagon galleries are the ones behind the OBLIQUE drum portals, whose seeds come
 * from the polygon branch's ring scan: under the live mask the scan found cells earlier
 * threshold points had opened inside the 1200 mm masonry and tunnelled from them. The old 9800
 * was itself produced by that carve order — "Circulation v2" above already recorded it as
 * rule-consistent, not a correction (backlog C.5) — and the new 8800 is the same rule with the
 * order taken out, not a measured truth either.
 *
 * ## `hillside-villa`: both rows re-measured — a connector's inward walk stops at the room's first eroded cell
 *
 * Case (1), the compiler changed, deliberately: the carve artefact "Circulation on storeys
 * reached only by a shaft" above recorded as r_master's 640. A connector's carve seeds come
 * from `seedCells`, which walks inward from each threshold point to the room's first free
 * cell. That walk stepped on through cells the clearance erosion had taken — past a fixture,
 * or a stair's whole footprint — and the carve from the far seed stamped the doorway's width
 * on a cell nowhere near the doorway. `buildGrid` now records each room's eroded FLOOR cells
 * (an eroded cell under a wall is a halo reaching through it and stays crossable), and a
 * connector's walk stops at the first of them, seeding nothing beyond. A front door's seed
 * is read as before. Sealing it too was measured and rejected: the closed-class witness "a
 * room split by furniture, entered by an opening with a threshold point on a line"
 * (`test/equivariance-corpus.test.ts`) then measured zero circulation rooms.
 *
 * Swept before → after on the same tree, 254 rows (the 84 files of the hexagon sweep above,
 * plus every ```arch fence under `docs/`), the same seven digests per row. The sweep was
 * shown able to fail first: 1 mm planted on `r_bed1`'s walk moved `describe()` on 14 files.
 * The result:
 *
 *   - SVG and `compile().diagnostics`: byte-identical on all 254 rows.
 *   - `describe()`, `lint()`, accessibility `lint()` and the overlay: moved on
 *     `hillside-villa` only. `eval/fidelity-plans/min-bedroom-flat.laundered.arch`, which the
 *     narrow fix rejected above moved, is byte-identical in every column.
 *   - `describe()`, field by field: level 2 `circulation.rooms[r_master].bottleneckClearWidthMm`
 *     640 → 700 — the width the section above measured on the passage's other cells. Its walk
 *     (9900) and detour (1.81), every other room, every route (r_master → en_m.room 5500 / 640 /
 *     1.3 included) and `unmeasured` are byte-identical; level 1 is byte-identical.
 *   - `lint()`, default profile (700 mm): still nine. "The walk from the entrance to "Master
 *     Suite" squeezes to 640 mm (60 mm below the 700 mm minimum)." is gone, and "The route
 *     from "Master Suite" to "Ensuite" squeezes to 640 mm (60 mm below the 700 mm minimum)."
 *     takes its place at the same line, column and span (the room's own, 13163–13330): a key
 *     route is flagged for its from-room only when the room's walk was not
 *     (`src/lint/rules/circulation-facts.ts`), and the route is `d_enm`'s, a real 700 mm door.
 *     Route warnings follow every walk warning, so it now comes sixth of the six, after the
 *     three Ensuites, where the walk warning came between the second and third. Every other
 *     diagnostic is unchanged.
 *   - `lint()` under `accessibility-advisory` (900 mm, no digest covers it): still 29 (nine
 *     `W_PATH_TOO_NARROW`). Only the Master Suite's walk message moved: "squeezes to 640 mm
 *     (260 mm below the 900 mm minimum)" → "squeezes to 700 mm (200 mm below the 900 mm
 *     minimum)"; its route is not flagged, because its walk still is.
 *   - The `--overlay circulation` SVG (opt-in, pinned by no baseline): level 1 only, two pinch
 *     markers at the same `clearMm` move one axis — Powder's 740 x 9150 → 9250 at y 2350,
 *     Study's 840 y 1950 → 1650 at x 4150. Both have one cause: `d_powder`'s carve no longer
 *     walks through the halo of the Powder `wc` (flush, in the halo of the door's −d
 *     threshold point). With that `wc` deleted, the trees before and after draw every level-1
 *     marker identically, Study's included; Study's marker moves only as a tie-pick among
 *     equal-clearance cells on a grid whose carved cells differ (the overlay-only class of
 *     the hexagon section above). Every walk and route polyline is unchanged. Level 2's overlay is byte-identical to the plain level-2
 *     render before and after: the overlay draws nothing on a storey reached only by a shaft
 *     (a pre-existing gap, not this change), so the moved 700 is not drawn.
 *
 * No corpus file shows it, but the rule has a second, wider consequence: a doorway with
 * furniture within R + δ of its face reads `blocked` from that side. R is the body radius
 * (300 mm); δ is the distance from the wall face to the centre of the first cell the wall
 * leaves free (100 mm for a 100 mm partition on a 100 mm grid edge; 88 mm for the same wall
 * on 108 mm cells). A threshold point's inward walk first meets that cell, the furniture's
 * halo takes it exactly when gap − δ ≤ R, and every walk then stops and seeds nothing. Where
 * every threshold point's walk was straight, the old carve back was refused anyway and the
 * room already read `blocked` at the same gap. What changes is a doorway with a point on a
 * lattice line, or within tolerance of a room corner (whose walk runs diagonally): its walk
 * stepped through the halo and the furniture to free floor beyond, and an L-shaped carve back
 * bored through the wall beside the doorway, so the room was measured through that tunnel
 * with the door's width stamped over the pinch, and its routes with it. The red team's
 * random-plan probe found 7 such flips per ~436 valid plans per seed. The threshold is
 * pinned at both cell sizes by `test/carve-inward-walk.test.ts` (blocked at R + δ, with
 * 0 < `widestWayInMm` < 2R; measured 1 mm further off), beside the landing plan that pins
 * the far-seed stamp itself. The two plans read differently before the change: the bedroom
 * past the flight 640 instead of 700, and the bath at 400 mm measured.
 *
 * `hillside-villa.arch`'s comment above `d_en2_corr` was rewritten in the same change (it
 * called the Master Suite's 640 an artefact of the walk grid; it now says the sixth warning
 * is that room's route through `d_enm`). It is 87 bytes and one line shorter. Every
 * default-profile span lies above it, so both rows measure the same with the old comment or
 * the new; under `accessibility-advisory` the four diagnostics below it — `W_SWING_OBSTRUCTED`
 * and `W_DOOR_CLEARANCE` on lines 257 and 258 — shift by exactly −87 bytes and −1 line, every
 * other field unchanged (case (2)). Both rows were re-measured with a script that imports
 * `./byte-identity-digest.ts` and that first reproduced the old values on the tree before the
 * fix: whole surface f93556cb… → 80285cb2…, summary 0bce7b7b… → 759c93ef….
 *
 * ## A far seed's width is the minimum of every constraint on it — no row moved
 *
 * Case (1), the compiler changed, deliberately (owner decision, backlog E.6–E.10's far-seed
 * question; ADR 0008's 2026-10 far-seed addendum): a carve's far seed, already walkable, now
 * reads min(connector width, the room's own clearance there) instead of the connector's width.
 *
 * Swept before (`05b1145`) → after, 265 rows (the files of the sweeps above plus
 * `eval/faults/` and every ```arch fence in the root and `docs/` Markdown), the same seven
 * digests per row. The sweep was shown able to fail first: planting the rejected variant (no
 * far-seed stamp at all) moved 32 rows, `min-bedroom-flat.laundered`'s `describe()` among them.
 * The result:
 *
 *   - SVG, `compile().diagnostics`, `describe()`, `lint()`, accessibility `lint()` and the
 *     combined digest: byte-identical on all 265 rows, so every row of both tables stands.
 *     Far seeds narrower than their door do occur in the corpus (55 cells on hillside-villa's
 *     overlay grid alone), but no room's or key route's widest way in passes only through them.
 *   - The `--overlay circulation` SVG (opt-in, pinned by no baseline): moved on 10 files —
 *     `eval/goldens/` accessible-flat, anchor-furniture, galley-kitchen; `examples/` clinic,
 *     hillside-villa, library, museum, studio; `test/recovery-corpus/` clinic, studio. Only
 *     pinch markers move (32 of them, each diamond with its label), every one at the same
 *     `clearMm`, from one cell stamped with that width to another; 31 stay on the same
 *     doorway and one of library's moves to another 940 mm door on the same route. No walk
 *     or route polyline moves. Cause: a marker is the narrowest cell the widest search
 *     reached first among equal-clearance cells, and the search's pop order changed where a
 *     far seed elsewhere now reads narrower (the tie-pick class of the sections above).
 *
 * ## A key route starts on its room's floor — nothing moved
 *
 * Case (1), the compiler changed, deliberately (ADR 0008's far-seed addendum): a key route's
 * sources are its from-room's cells that were walkable before any threshold was carved, no
 * longer the cells a carve opened inside its rectangle. Swept before (`95db8b0`) → after over
 * the same 265 rows and seven digests; a 1 mm plant on every route's walk moved `describe()`
 * on 43 rows first. Result: all seven digests byte-identical on all 265 rows, the overlay
 * included. The corrected case is not in the corpus; it is pinned by
 * `test/route-source-floor.test.ts`.
 *
 * ## `hillside-villa`: both rows re-measured — a room is reached on its floor
 *
 * Case (1), the compiler changed, deliberately (owner-delegated; ADR 0008's far-seed
 * addendum): a room's cells — the ones its walk and bottleneck are read on, and a key route's
 * target — are its FLOOR, the cells walkable before any threshold was carved. A doorway's
 * opened wall cells can lie in a room's rectangle (a cell belongs to the room holding its
 * centre), and a room read at its best cell took them: the door's side of the threshold, not
 * the floor behind it.
 *
 * Swept before (`96bc82a`) → after, 265 rows, seven digests; a 1 mm plant on every walk moved
 * `describe()` on 87 rows first. The result:
 *
 *   - Every storey's SVG, `compile().diagnostics` and the default `lint()`: byte-identical on
 *     all 265 rows. `describe()`: moved on `hillside-villa` only.
 *   - `describe()`, field by field: level 1 (and the top-level copy)
 *     `circulation.rooms[r_terrace].bottleneckClearWidthMm` 1140 → 840. Its walk and detour,
 *     every other room, every route, `blocked`/`unmeasured` and level 2 are byte-identical.
 *     Mechanism: the terrace has two doors, and 32 opened cells lie in its rectangle — 24 of
 *     `d_kit_terrace` (2400 mm sliding, 2340 clear; nav-grid row 82, ix 153–176) and 8 of
 *     `d_din_terrace` (840 clear; ix 135, rows 88–95). The kitchen door's cells are reached
 *     through the kitchen at 1140, but the floor behind them is the one-cell strip between the
 *     wall and the two sun loungers, every cell 700 mm (then read as the far seeds'
 *     min(2340, 700); their own clearance since the far-seed stamp was dropped).
 *     `d_din_terrace` opens onto open floor. So the terrace's floor is reached at best at 840,
 *     through the dining door; 1140 was the kitchen door's threshold, not the terrace.
 *   - `lint()` under `accessibility-advisory`: 29 → 30, one insertion and nothing else —
 *     "The walk from the entrance to "Terrace" squeezes to 840 mm (60 mm below the 900 mm
 *     minimum)." (level 1); the diagnostics after it shift by one index, every field unchanged.
 *   - The `--overlay circulation` SVG (opt-in, pinned by no baseline): moved on 14 files, only
 *     pinch markers (22). `hillside-villa`: the terrace's marker 1140 → 840, now at
 *     `d_din_terrace`; one 940 marker moves to another 940 mm cell. The other 20, on
 *     `eval/goldens/` accessible-flat, compact-studio, dims-auto-cottage, galley-kitchen,
 *     relational-studio, sized-office-mix, three-bed-2bath, two-bed-hall; `examples/`
 *     bungalow, clinic, courtyard-house, furnished-flat; `test/recovery-corpus/clinic`, keep
 *     their `clearMm` and move along the same doorway: the room's best cell is now a floor
 *     cell, whose limiting cell is another of the door's equal-width cells. No walk or route
 *     polyline moves.
 *
 * Both rows were re-measured with a script that imports `./byte-identity-digest.ts` and first
 * reproduced the old values on the tree before: whole surface 80285cb2… → 8bc280e3…, summary
 * 759c93ef… → 3d977524….
 *
 * ## No far-seed stamp — no row moved
 *
 * Case (1), the compiler changed, deliberately (owner-delegated; ADR 0008's far-seed
 * addendum, "No far-seed stamp"): a carve stamps its door's width only on the cells it opens;
 * the far seed keeps the room's own clearance. Swept before (`94d7e39`) → after, 265 rows,
 * seven digests; a 1 mm plant on every walk moved `describe()` on 87 rows first. Result: SVG,
 * `compile().diagnostics`, `describe()`, `lint()` and accessibility `lint()` byte-identical on
 * all 265 rows (`min-bedroom-flat`'s route stays 740). The `--overlay circulation` SVG moved on
 * 27 files, only pinch markers — 90, each at the same `clearMm`, 89 of them now on the door's
 * opened cells, where the far seed had carried the same width (the 90th, on
 * `test/fixtures/zones-wings`, an entrance seed 100 mm along). Files: the
 * `docs/language-reference.md` fence #10; `eval/fidelity-plans/` capped-wet-room.laundered,
 * two-bed-min-area.faithful; `eval/goldens/` accessible-flat, bungalow, sized-bedrooms,
 * sized-kitchen-flat, strip-attach-clean, strip-corridor, three-bed-2bath, two-bath-flat,
 * two-bed-hall; `examples/` aquarium, bungalow, furnished-flat, gallery-l, garden-house,
 * hillside-villa, library, museum, studio, terrace-row, transit-hall, two-bed;
 * `test/fixtures/zones-wings`; `test/recovery-corpus/` studio, terrace-row.
 *
 * Re-measured for the visual-polish symbol redraw: SVG only, describe/lint/diagnostics unchanged
 * (substitution check reproduces the old digests).
 *
 * ## `hillside-villa`'s whole-surface row re-measured: `dims auto` ends on the outermost face
 *
 * Case (1), the compiler changed, in the drawing only (backlog E.17, `facade-probe-order`).
 * Level 2's right facade has two parallel walls equidistant from its probe point (13800, 5100):
 * the 300 mm shell and the `en_m` ensuite's 100 mm wall, both on x = 13800. `probeSide` kept
 * whichever `ir.walls` listed first (the ensuite's, outer face 13850); it now keeps the
 * outermost face (the shell's, 13950), where the walls are drawn. Field by field: level 2's
 * SVG moves only the right-corner tick of the bottom and top `dims auto` chains, x 13850 →
 * 13950 (the closing spans 5850 → 5950 and 1550 → 1650, both overalls 14000 → 14100, each
 * number re-centred 50 mm right). Level 1's SVG, `describe()`, `lint()` and
 * `compile().diagnostics` are byte-identical: the old level-2 SVG put back into the new
 * payload reproduces the old row, and the `SEMANTIC_BASELINE` row below did not move. Swept
 * over all 272 corpus plans (every storey; SVG, `describe()`, both `lint()` profiles,
 * diagnostics): the only other drawing that moved is the E.17 witness fence in
 * `docs/backlog.md`, the same tie. The PNG golden's changed pixels lie within
 * x ∈ [6658, 14017], y ∈ [−990, −197] ∪ [10330, 11176] mm, the two chain bands.
 *
 * ## `garden-house`: both rows re-measured — the example stopped seating its tables twice
 *
 * Case (2)'s sibling: the example SOURCE changed and the compiler did not (backlog D.1).
 * `dining_table` and `outdoor_table` draw their own chairs, and the example also placed four
 * `chair`s round the one and four `outdoor_chair`s round the other; those eight lines are gone
 * (and its two comments now count fourteen outdoor families). Field by field, ground storey
 * only — the first floor's SVG is byte-identical:
 *
 *   - **SVG (level 1).** The eight chairs' primitives are gone; the "Kitchen/Dining" label
 *     and its area move from y = 9030/9415 to 9855/10240, label placement no longer having the
 *     chairs to avoid; the legend loses its `outdoor_chair` row (`chair` stays: the study has
 *     one), so the table and the page are one 340 mm row shorter (page height 42425 → 42085).
 *   - **`describe()`.** `furniture[]` loses the eight entries and the auto-ids after them
 *     renumber (`car_19` → `car_15` … `shrub_48` → `shrub_40`); `freedom` counts 48 → 40
 *     (absolute 38 → 30). The removed chairs were obstacles, so two walks move: `r_kitchen`
 *     3800 → 4100 mm (detour 1.33 → 1.46) and the kitchen → living route 9500 → 7800 mm
 *     (1.29 → 1.11); every bottleneck is unchanged. The sheet's `W_DRAWING_OVERFLOW` message
 *     quotes the taller drawing area the shorter legend leaves: 17950 → 18290 mm, over by
 *     4050 → 3710 mm (`test/drawing-overflow.test.ts` re-measured with it).
 *   - **`lint()`.** The one deliberate warning (`W_ROOM_NOT_EQUATOR_FACING`, Bedroom 2) is
 *     unchanged but for its span, 12627 → 12104: the 523 bytes removed above it. No new
 *     warning.
 *
 * Swept over all 273 corpus plans (every storey; SVG, `describe()`, both `lint()` profiles,
 * diagnostics, the circulation overlay): no other row moved. The PNG golden is a shorter page
 * (561 × 401 → 561 × 398 px), so it cannot be diffed pixel for pixel; the old and new SVG
 * rastered over one fixed window differ only within x ∈ [2880, 3420] ∪ [3680, 6620] ∪
 * [10280, 12820], y ∈ [8880, 15900] ∪ [33440, 40440] mm: the chairs, the label and the legend
 * (its frame, and its rows from the removed one down).
 *
 * ## `hillside-villa`: both rows re-measured — the piano turns its keyboard to the room
 *
 * The example SOURCE changed and the compiler did not (backlog D.2). The living room's
 * `piano at (3200,4400) size 1300x1300` stood with its keyboard 100 mm off the north wall, on
 * a square footprint too shallow for the bench. It is now `at (3000,8700) size 1600x1200
 * rotate 270`, by the east wall beside the bay: keyboard to the west, a depth of 1.33 widths
 * so the bench is drawn, 125 mm off the east wall face and 175 mm off the south one. Field by
 * field, ground storey only — level 2's SVG and `compile().diagnostics` are byte-identical:
 *
 *   - **SVG (level 1).** Only the piano's primitives: the old glyph's are gone and the new
 *     one's (with the bench's two) are drawn, ink within x ∈ [3036, 4593], y ∈ [8700, 9900].
 *   - **`describe()`.** The piano gains `rotate: 270`. It no longer stands in the mouth of the
 *     living/dining opening, so three bottlenecks widen 940 → 1100 mm: `r_living`, `r_dining`
 *     and the kitchen → dining route. No walk distance moves.
 *   - **`lint()`.** The same nine warnings, field for field, but for a uniform span shift of
 *     +11 on the five diagnostics below the piano line: the bytes ` rotate 270` added.
 *
 * Swept over all 273 corpus plans as above: no other row moved. The PNG golden's changed
 * pixels lie within x ∈ [2971, 4665], y ∈ [4351, 5780] ∪ [8639, 9963] mm: where the piano
 * stood and where it stands.
 *
 * ## `garden-house`'s whole-surface row re-measured: three legend swatches show more marks
 *
 * Case (1), the compiler changed, in the drawing only (backlog D.3). The legend's `grass`,
 * `gravel` and `tarmac` swatches draw their pattern at a smaller `zoom` (`GROUND_SWATCH_FRAME`,
 * `src/hatches.ts`: 0.8 → 0.32, 1 → 0.67, 1 → 0.72), so each holds seven to nine marks instead
 * of two to four. Field by field: level 1's SVG moves exactly three `<path>`s, those three
 * swatches' re-framed fills; no surface on the plan moves. Level 2's SVG, `describe()`,
 * `lint()` and `compile().diagnostics` are byte-identical: the old level-1 SVG put back into
 * the new payload reproduces the old row, and the `SEMANTIC_BASELINE` row below did not move.
 * Swept over all 273 corpus plans as above: no other row moved — `garden-house` is the one
 * plan that draws a legend over those three materials. The PNG golden's changed pixels lie
 * within x ∈ [3959, 4382], y ∈ [27618, 29418] mm, the swatch column from `grass` to `tarmac`.
 *
 * ## `clinic`'s whole-surface row re-measured: a room name too wide for its room wraps
 *
 * Case (1), the compiler changed, in the drawing only. A room name that does not fit its room
 * on one line at the drawing's label size is drawn on several when a wrapped form fits
 * (`wrapLabels`, `src/label-placement.ts`). In `clinic` that is the accessible WC: "Accessible
 * WC" at 350 mm is 2821 mm wide by the shared estimate, the room's wall-free run 2745 mm. Field
 * by field: the SVG moves exactly two `<text>`s — the name becomes one `<text>` (same x, y and
 * attributes) holding `<tspan>`s "Accessible" (y 8870) and "WC" (y 9290), and the area figure
 * moves from y 9465 to 9675. `describe()`, `lint()` and `compile().diagnostics` are
 * byte-identical: the old SVG put back into the new payload reproduces the old row, and the
 * `SEMANTIC_BASELINE` row did not move. Swept over all 274 corpus plans (every storey; SVG,
 * `describe()`, both `lint()` profiles, diagnostics, the circulation overlay, the annotated
 * accessible SVG): no other example row moved.
 *
 * ## `hillside-villa`: both rows re-measured — an en-suite beside a bathroom off circulation is not flagged
 *
 * Case (1), the compiler changed, in `lint()` only. `W_BATH_VIA_BEDROOM` now fires only on a
 * storey with NO wet room reachable without passing through a bedroom
 * (`wetRoomsOnlyViaBedroom`, `src/analyze.ts`). On level 2 the two bedroom-band ensuites open
 * off the landing, so the master ensuite `en_m` — one door, into the Master Suite — is no
 * longer named. Field by field: `lint()` loses exactly that one diagnostic
 * (`W_BATH_VIA_BEDROOM`, span 2564, `Bathroom "Ensuite" is reachable only through a bedroom.`)
 * and keeps the other eight in order, byte for byte; every storey's SVG, `describe()` and
 * `compile().diagnostics` are byte-identical. Proved by putting that diagnostic back at its
 * old index in the new payload: it reproduces both old rows. The example's comment above
 * `d_en2_corr` was corrected in the same change (it said lint flags `en_m`), adding 91 bytes.
 * It lies below every default-profile diagnostic's span, so those spans are unmoved. Four
 * `accessibility-advisory` diagnostics on level 2 sit below it (`W_SWING_OBSTRUCTED` × 2,
 * `W_DOOR_CLEARANCE` × 2) and their spans shift with the comment; no pinned digest hashes
 * that profile.
 *
 * Outside this table, five `eval/fidelity-plans` rows keep their `W_BATH_VIA_BEDROOM` — each
 * plan's only wet room is behind a bedroom — with a reworded hint
 * (`test/import-module-lets.test.ts`).
 *
 * ## `sheet-notes`: a row ADDED with a new example, nothing re-measured
 *
 * `examples/sheet-notes.arch` arrived with the issued-sheet statements (`notes`, the title
 * block's `number`/`revision`). Its two rows were measured with this file's own digest
 * bodies on the branch that added it, when the example first existed; no other row moved
 * (the law suites and a per-payload sweep of the whole corpus, before against after, agree).
 * The next commit on that branch extended the example with `schedule openings` (tags + the
 * DOOR & WINDOW SCHEDULE), a fourth note and two comments, and re-measured only its
 * whole-surface row: the SUMMARY row (`a26a55ae…`) is byte-identical before and after, so
 * `describe()` and `lint()` did not move and the change is in the drawing alone. A third
 * commit (the review fixes: NOTES wrap to a fixed column, tags avoid neighbouring openings)
 * re-measured that whole-surface row once more — its first note now draws on two lines — and
 * the SUMMARY row held again (`a26a55ae…`). Still no other row moved.
 *
 * ## `hillside-villa`: both rows re-measured — `W_PATH_TOO_NARROW` names the door, once
 *
 * Case (3), a diagnostic-text change, in `lint()` only (`test/lint-fix-texts.test.ts`). When
 * doors set a room's bottleneck, the message names every door on its widest door path that is
 * exactly that narrow and the hint gives the `width` that clears the minimum for each; one
 * bottleneck opening is reported once. Field by field, on level 2: the three "Ensuite" walks
 * gain `— the bottleneck is door …` naming `d_en2_corr`, `d_en3_corr` and `d_enm` (the doors
 * off the landing and the Master Suite; each 700 mm, 640 clear), and their hints become
 * "Widen door … to `width 800`" (on `grid 100`); the route "Master Suite" → "Ensuite" (span
 * 13174, 640 mm, through `d_enm`, already named) is withdrawn. "Bedroom 2"/"Bedroom 3" (640 mm
 * behind 900 mm doors: furniture, so no door is named) and both `W_ROOM_NOT_EQUATOR_FACING`
 * are byte-identical. `lint()` 8 → 7 diagnostics. Measured twice: first when the room's own
 * widest connector was the test (`d_en2` and `d_en2_corr` both named), then again when the
 * red team showed doors in series name the wrong door and the test became the widest door path
 * from the entrance (one canonical path, so one door per en-suite), and a third time when every
 * attribution became re-measured before it is quoted (the three named doors held; only their
 * hints changed, "which lets the walk clear the 700 mm minimum"). Each time, hashing the NEW
 * compile + `describe()` with the PREVIOUS `lint()` reproduced the previous rows (and
 * `while-byte-identity-baseline.ts`'s). Swept over 282 corpus plans (every storey; SVG,
 * `describe()`, diagnostics, both `lint()` profiles): no SVG, `describe()` or diagnostics
 * payload moved, and every `lint()` move was a carded text, `arch repair` → `archlang repair`
 * in a door hint, or a withdrawn duplicate `W_PATH_TOO_NARROW`; none other in this table.
 *
 * ## Sixteen whole-surface rows re-measured: thickness call-outs keep off doorways and fixtures
 *
 * Case (1), the compiler changed, in the drawing only. A `dims auto all`/`walls` thickness
 * call-out was taken at the middle of the widest run of its wall clear of crossing WALLS
 * (`thicknessStation`, `src/scene-build.ts`), so the number was written in doorways and over
 * fixtures: 33 call-outs over the shipped examples sat in an opening on their own wall or on a
 * furniture footprint (`test/dim-thickness-callout.test.ts` names each on the old tree). The
 * station is now chosen in tiers: the wall-clear station is KEPT when it is also at least a
 * cap height clear of every opening on the wall line and every footprint reaching the
 * number's band on its side; otherwise the widest run clear of all three; otherwise (none
 * exists) the wall-clear station, so a number never trades poché for a clear doorway. So
 * only a call-out that stood in or against an opening or a fixture moves; "edge on the jamb"
 * below is one whose number touched the jamb, inside the cap-height clearance. Field by
 * field, every changed SVG node is a thickness call-out (its `<text>` and three `<line>`s: the
 * dim line and two ticks) or a room label (name + area `<text>`) that `relocateLabels`
 * re-placed because the call-out it steers around moved. Every storey of every row:
 * `describe()`, both `lint()` profiles and `compile().diagnostics` byte-identical, and the OLD
 * SVG put back into the NEW payload reproduces each old row, in every table that pins it
 * (here, `while-byte-identity-baseline.ts`, `import-module-lets.test.ts`, `outdoor-`,
 * `roof-void-` and `garage-byte-identity.test.ts`). The `SEMANTIC_BASELINE` rows did not move.
 * Swept over 281 corpus plans (every storey; SVG, diagnostics, `describe()`, both `lint()`
 * profiles, the circulation overlay), after a planted one-millimetre station shift was caught
 * on every plan that draws a call-out: 33 plans moved, SVG and overlay only. Each moved
 * call-out, value, along-wall coordinate old → new, and what it cleared:
 *
 *     - `aquarium`: "300" x 10525 → 30000, out of window_3.
 *     - `bungalow`: "100" x 4500 → 6575, out of o_living; label "Living / Dining" x 2100 → 3000.
 *     - `clinic`: "100" x 6750 → 2975, out of o_entry; "200" x 4525 → 7475, out of window_7.
 *     - `courtyard-house`: "150" y 6000 → 4600, out of d_study; "300" x 6250 → 1800, out of
 *       n_living and off sofa_1; "100" y 4775 → 6575, edge on d_bath's jamb; "200" x 7025 →
 *       14200, edge on d_court_l's jamb; label "Living" x 5425 → 6250 (where it sits with no
 *       call-out drawn).
 *     - `gallery-l`: "200" y 10975 → 9250, out of the opening `inner`.
 *     - `garden-loft`: "100" y 1625 → 2575, out of d_bed; "200" x 2125 → 3725, out of window_2.
 *     - `hillside-villa` level 1: "100" x 11850 → 10750, out of d_pantry; "300" x 6000 → 12950,
 *       out of d_front. Level 2: "100" x 2050 → 3200, out of d_bed2; "300" x 2050 → 6900, off
 *       bed_1.
 *     - `laneway-house`: "200" x 2125 → 5375, out of d_front.
 *     - `library`: "200" y 4025 → 11250, out of o_ref_stacks.
 *     - `materials`: "150" x 13980 → 12537.5, off f_rug; "200" y 4000 → 7650, out of win_w;
 *       "230" y 1537.5 → 4825, out of win_o and off f_rug; "300" x 6025 → 3900, out of win_n2.
 *     - `museum-wing`: "200" and "300" x 9000 → 5050, out of o2 and w2.
 *     - `museum-wings`: "200" and "300" x 9000 → 5050, out of west.o2 and west.w2.
 *     - `museum`: "200" x 39000 → 20200, out of opening_3; "300" x 39000 → 20450, out of
 *       window_2.
 *     - `townhouse` level 1: "200" y 2350 → 3650, out of d_living; label "Hall" y 3465 → 2415
 *       (the new "200" stands where it was). Level 2: "100" x 1625 → 2275, off bathtub_3.
 *       Level 3: no move (its SVG is byte-identical; the row moves for levels 1–2).
 *     - `transit-hall`: "200" y 23750 → 19425, out of o_shop2; "300" x 44000 → 62850, out of
 *       opening_7.
 *     - `two-storey` level 1: "100" y 1825 → 2900, out of d_living; "200" x 5075 → 1125, out of
 *       w_living. Level 2: "100" y 1825 → 5775, out of d_bed1; "200" x 5075 → 6825, out of
 *       w_bed1.
 *
 * Outside this table the same change moves, for the same reason and the drawing only:
 * `test/fixtures/axes-grid` and `schedule-sheet`, the `test/recovery-corpus/` copies of
 * `clinic`, `materials` and `two-storey`, `eval/goldens/dims-auto-cottage`, nine
 * `docs/gallery/*.arch` (all but `narrow-plot`) and the `docs/overview.md` fence. Each PNG
 * golden's changed pixels lie in the boxes around the old and new call-out (and moved label)
 * positions.
 *
 * ## `sheet-notes`'s whole-surface row re-measured when the call-out change met it
 *
 * The call-out change above was measured on a tree without `sheet-notes`; the example came
 * with the issued-sheet statements on the other branch. Merged, it is the same case (1) on one
 * more plan, the drawing only: "100" on `w_mid` y 1525 → 2450, out of d_bed; "200" on `shell`
 * x 2525 → 3975, out of d_front. Those two call-outs (a `<text>` and three `<line>`s each) are
 * the only changed SVG nodes; its door and window tags, NOTES and both schedules are
 * byte-identical. Its `describe()`, `lint()` and `compile().diagnostics` did not move, so the
 * `SEMANTIC_BASELINE` row holds (`a26a55ae…`), and the OLD SVG put back into the NEW payload
 * reproduces the old rows here (`cd9df889…`) and in `while-byte-identity-baseline.ts` and
 * `import-module-lets.test.ts` (`365c38ef…`). The new stations are the call-out change's own:
 * the plan with its `notes`, `schedule openings` and title `number`/`revision` removed draws
 * both call-outs at the same coordinates on the call-out branch's tree, which has none of the
 * issued-sheet code. Its PNG golden's changed pixels lie in the boxes around the old and new
 * call-outs.
 *
 * ## EVERY row re-measured, once: `describe()` gains net internal area (owner decision 2)
 *
 * The reason, in one line: **`describe()` gains `net_area_m2` / `totals.net_floor_area_m2`;
 * SVG and lint unchanged except room schedules.** The owner decided (agent-reach decision 2,
 * 2026-10-13) that `describe()` gains an APPENDED field: every room's `net_area_m2` (its
 * shape inset by half of each bounding wall's thickness, `docs/adr/0027-net-internal-area.md`),
 * `totals.net_floor_area_m2`, and on a `schedule rooms` plan each `schedule` row's
 * `net_area_m2`. `area_m2` and every other field are unchanged. Every row in both tables
 * carries `describe()`, so every row moved, and all were re-measured in ONE commit with the
 * tests' own digest bodies; no row was blessed alone.
 *
 * Proved by a HYBRID run of the law files themselves, unedited, with `../src/index.js`
 * aliased to a shim. (A) `describe()` from the pre-change tree (`1eb1bf9`), `compile()` and
 * `lint()` from the new one: every `SEMANTIC_BASELINE` row reproduces its OLD pin, and so does
 * every `BASELINE` row except the twelve plans that set `schedule rooms` (`aquarium`,
 * `bungalow`, `clinic`, `courtyard-house`, `furnished-flat`, `garden-house`,
 * `hillside-villa`, `library`, `materials`, `museum-wings`, `sheet-notes`, `transit-hall`).
 * (B) `compile()` too from the pre-change tree: those twelve reproduce as well, and so does
 * every row of every law file, so `lint()` moved nowhere. (C) The same alias with nothing
 * old fails every row, so the run can fail. On the twelve, `compile().diagnostics` is
 * byte-identical and the SVG moves by the ROOM SCHEDULE's appended NET AREA column only: the
 * frame and the full-width row rules widen by the column, and a column rule, the
 * `NET AREA (m²)` heading, one cell per room and the subtotal and TOTAL cells are added.
 * Every cell the table drew before is byte-identical, and a legend, door & window schedule or
 * notes table to its right shifts right by the column's width. No page size moved.
 *
 * Then the AREA column took the owner's label, `AREA (CENTRELINE, m²)` (decision 2 names the
 * columns "Area (centreline)" and "Net area"), and widened to hold it. The same twelve
 * whole-surface rows were re-measured again, and ONLY them: run against the tables above,
 * the heading change fails exactly the rows of the schedule plans that the net column moved
 * (the identical set, checked), and every `SEMANTIC_BASELINE` row holds, so `describe()` and
 * `lint()` did not move. In the drawing the NO. and NAME cells keep their place; the AREA
 * cells, TOTAL and SUBTOTALs move right by the column's growth, and NET AREA with them.
 *
 * ## Six plans re-measured again: net area became "room less every wall band on it"
 *
 * The first definition inset only an edge with a wall centreline ON it, so a wall standing on
 * a floor any other way was not subtracted: `hexagon-pavilion`'s 1200 mm drum is tangent to
 * all six wedge galleries and its outer half-band (r 3000..3600) lies on each of them. Net
 * area is now the room's area less the area of every wall band inside it, each band as the
 * drawing draws it (`wallBand()`: faces, square caps at a free end, mitres, true arcs),
 * computed in closed form (ADR 0027). Field by field, `describe()` moves only in
 * `net_area_m2` and `totals.net_floor_area_m2`, and only where a band stands on a floor that
 * the inset missed:
 *
 *   - `hexagon-pavilion`: g_ne/g_nw/g_sw/g_se 15.09 → 13.55, g_n/g_s 11.97 → 10.52 (the drum's
 *     half-band, ~1.5 m² each); total 102.4 → 93.34. The rotunda holds at 18.1.
 *   - `tiny-house`: r_main 13.39 → 13.13, total 17.42 → 17.16 (the wardrobe partitions
 *     `w_ward`/`w_ward_e` stand inside the room).
 *   - `aquarium`: concourse 467.45 → 467.17, cafe 163.7 → 162.56, total 1975.04 → 1973.62 (the
 *     curved shell's band crosses the facets the two polygons were snapped to).
 *   - `hillside-villa` (ground storey): r_living 26.58 → 26.54 (the bay's band at its chord
 *     ends), r_dining 17.45 → 17.44 (a thicker wall's square cap past a thinner one on the
 *     same edge); total 177.03 → 176.98.
 *   - `materials`: r_shop 91.18 → 91.17 and `townhouse` (all three storeys): r_kitchen,
 *     r_bed2, r_master 17.15 → 17.14 — a wall's square cap where it ends on the room's edge.
 *
 * Proved by the same hybrid: with `describe()` from `7d9cda8` and `compile()`/`lint()` new,
 * every row reproduces its pin except the SUMMARY rows of those six plans and the
 * whole-surface rows of the three that set `schedule rooms` (`aquarium`, `hillside-villa`,
 * `materials`), whose drawn NET AREA cells change to the numbers above and nothing else;
 * with `compile()` also from `7d9cda8` every row reproduces, so `lint()` did not move.
 * `compile().diagnostics` is byte-identical on all of them.
 *
 * ## Three example rows re-measured when net area met them: classroom-block, corner-cafe, practice-office
 *
 * The three examples were first measured on a tree without net area. On it, each moves as
 * every row above did, and in nothing else: `describe()` gains `net_area_m2` and
 * `net_floor_area_m2` (the SEMANTIC rows), and all three set `schedule rooms`, so the drawn
 * ROOM SCHEDULE takes the `AREA (CENTRELINE, m²)` label and a NET AREA column whose cells are
 * those figures, with the zone subtotals and the total. Every table drawn right of the
 * schedule moves right by the new column's width, every line of it otherwise unchanged; no
 * other SVG node moves. `lint()` and `compile().diagnostics` are byte-identical. With the old
 * tree's `describe()` the SEMANTIC rows reproduce, and with its SVG too the whole-surface
 * rows and those in `while-byte-identity-baseline.ts` and `import-module-lets.test.ts`
 * reproduce. Their `finish` digests did not move.
 *
 * ## `hillside-villa`: both rows re-measured — `W_PATH_TOO_NARROW` names a door by its rooms
 *
 * Case (3), a diagnostic-text change, in `lint()` only (`test/lint-fix-texts.test.ts`, "the four
 * reworded hints' messages"). A consumer may show `message` to a person who never sees the
 * source, so the message names a bottleneck door by the rooms it joins, the room fewer door hops
 * from where the walk starts first, and its id stays in the hint ("Widen door … to `width …`",
 * unchanged). Field by field, `message` only, no other key of any diagnostic: on level 2 (walked
 * from its stair) the three "Ensuite" walks' `door "d_en2_corr"` and `door "d_en3_corr"` →
 * `the door between "Landing" and "Ensuite"`, and `door "d_enm"` → `the door between "Master
 * Suite" and "Ensuite"`. The first two now read alike, because the plan labels both rooms
 * "Ensuite"; their hints still name each door. Under `accessibility-advisory` (no pinned digest)
 * level 1's "Powder", "Pantry" and "Terrace" walks likewise name `the door between "Service
 * Hall" and "Powder"`, `… "Service Hall" and "Pantry"` and `… "Dining" and "Terrace"`. Hashing
 * the NEW compile + `describe()` with the PREVIOUS `lint()` reproduces both previous rows, and
 * the rows in `while-byte-identity-baseline.ts` and `import-module-lets.test.ts`. No diagnostic
 * was added or withdrawn, and no other row in this table moved.
 *
 * ## `hillside-villa`: both rows re-measured — `between` is read off the host wall's faces
 *
 * Case (1), a compiler change, in `describe()` only (backlog C.4, plan-soundness PS0.1;
 * `test/between-face-probes.test.ts`). A connector on a wall now joins the space probed one wall
 * thickness either side of that wall's centreline, not the rooms whose edges its centre point touches,
 * and one whose clear span covers more than one room on a face carries an additive
 * `straddles` list. Field by field, `describe()` gains that one key and nothing else moves:
 * `o_entry_dining` (2400 mm on `w_l1_band_w`, x 4300..6700) spans the end of `w_liv_din`
 * (x 4800), so `openings[2]` and `access.edges[15]`, and their copies under `levels[0]`, gain
 * `straddles: ["r_living", "r_dining"]`. Its `between` stays `["r_entry", "r_dining"]`.
 * Hashing the NEW `compile()` with the PREVIOUS `describe()` reproduces both previous rows
 * (with the new `lint()` as well as the old: `lint()` did not move), and the rows in
 * `while-byte-identity-baseline.ts` and `import-module-lets.test.ts`. Every storey's SVG and
 * `compile().diagnostics` are byte-identical, and so are its Plan JSON (`compile -f json`) and its
 * `lint()` under `accessibility-advisory`. No other row in this table moved.
 *
 * ## `relational`, `themed`, `two-bed`: both rows re-measured — the label classifier emits living
 *
 * 2026-10-18, plan-soundness card PS0.7. Case (1), the compiler changed, in `describe()` only.
 * `classifyLabelUses` (`src/vocabulary.ts`) used to leave `living`/`dining` out, so a room
 * labelled "Living" with no authored `uses` read as `uses: []`; it now emits them, appended
 * after every older kind. Field by field, two keys of one room per plan and nothing else:
 * `relational`'s `living` "Living" and `themed`'s `a` "Living" go `uses` `[]` → `["living"]` and
 * `room_type` `Room` → `LivingRoom`; `two-bed`'s `r_kitchen` "Kitchen / Living" goes `uses`
 * `["kitchen"]` → `["kitchen", "living"]` and `room_type` `Kitchen` → `LivingRoom` (the type an
 * authored `uses kitchen living` already got). Every storey's SVG, `lint()` (default and
 * `accessibility-advisory`), `compile().diagnostics` and the circulation overlay are
 * byte-identical, swept over the whole corpus before (a `git archive` of `8d1e13e`) and after.
 * Hashing the NEW SVG + `lint()` (+ `compile().diagnostics`) with the PREVIOUS `describe()`
 * reproduces both previous rows of all three plans here, and their rows in
 * `while-byte-identity-baseline.ts`, `import-module-lets.test.ts` (with
 * `test/recovery-corpus/themed.arch`) and `garage-byte-identity.test.ts`. No other row moved.
 *
 * ## `two-bed` (both rows) and `garden-house` (both rows): the circulation-and-privacy rules
 *
 * 2026-10-18, plan-soundness cards PS2.5–PS2.7: three advisory rules appended to `LINT_RULES`
 * (`W_ROOM_VIA_PRIVATE`, `W_WET_ROOM_DOOR`, `W_ENTRANCE_INTO_PRIVATE`, `src/lint/rules/privacy.ts`).
 *
 *   - `two-bed` — case (1), `lint()` only. It gains three `W_ROOM_VIA_PRIVATE`, the defect the
 *     plan-soundness audit found (X1): "Master Bedroom" is reached only through "Bathroom"
 *     (depth 3), "Kitchen / Living" through "Bathroom" then "Master Bedroom" (depth 4), and
 *     "Bedroom 2" through both (depth 5). The example is left as it is: the hall shares no edge
 *     with the kitchen/living room, so no door re-hosting fixes it, and card PS3.6 rewrites it.
 *     Hashing the NEW SVG, `describe()` and `compile().diagnostics` with `lint()` minus the three
 *     new codes reproduces both previous rows here and the rows in
 *     `while-byte-identity-baseline.ts`, `import-module-lets.test.ts` and
 *     `garage-byte-identity.test.ts`.
 *   - `garden-house` — case (2)'s sibling, the example SOURCE changed. The new
 *     `W_WET_ROOM_DOOR` found the WC-bearing utility room used as the hall-to-garage passage
 *     (audit X12), and the door its own comment calls "Kitchen to garage" in fact opened into
 *     the utility room. `d_gar` moves along `w_gar` from 1800 to 4750 and swings into
 *     `r_kitchen` (+3 bytes). Field by field: the drawing moves only at that door (the wall cut,
 *     leaf and swing) and the "Kitchen/Dining" label, which steps 720 mm west off the new swing;
 *     `describe()` moves `d_gar`'s `between` `r_util` → `r_kitchen`, the access edge and
 *     `input_graph` with it, and `r_util`'s bottleneck 840 → 740 (its one way in is now its 800 mm
 *     pocket door); `lint()` keeps its one `W_ROOM_NOT_EQUATOR_FACING`, its span shifted by
 *     exactly 3. The PRE-edit source under the NEW compiler, with the three new codes filtered
 *     out of `lint()`, reproduces both previous rows here, the rows in
 *     `while-byte-identity-baseline.ts` and `import-module-lets.test.ts`, and the
 *     `finish-furnish.test.ts` digest. No other row in this table moved.
 *
 * `two-bed`'s two rows were re-measured once more in the same branch, after its adversarial
 * review: case (3), the TEXT of the new warnings. The hints now measure the longest single
 * straight run of a shared edge (never two runs added together), say "a straight N mm" and
 * leave 100 mm of wall at each jamb, and a dining room's accept-if names the room. Every
 * storey's SVG and `describe()` are byte-identical to the first commit's, and hashing with the
 * first commit's `lint()` reproduces its rows. The same holds for the rows in
 * `while-byte-identity-baseline.ts`, `import-module-lets.test.ts` (with the three eval goldens
 * whose warnings carry these hints) and `garage-byte-identity.test.ts`.
 *
 * ## Six examples fixed for the opening rules (PS2.1–PS2.3): their rows re-measured
 *
 * 2026-10-18, plan-soundness cards PS2.1–PS2.3 (`W_OPENING_AT_JUNCTION`, `W_OPENING_OVERLAP`,
 * `W_CONNECTOR_AMBIGUOUS`). The rules changed `lint()` only: swept over every
 * `examples/**` and `test/**` plan before (a `git archive` of `da9b47b`) and after, no SVG,
 * `describe()` or `compile().diagnostics` moved. They fired on six examples, each a real defect
 * the plan-soundness audit had recorded (`docs/plans/plan-soundness/audits/showcase-and-examples.md`
 * X3, X10, X19, X26), and each example was fixed with an edit of the same byte length, so no
 * span moved and every example now lints EXACTLY as before. Case (2)'s sibling, then: the example
 * source changed, its drawing and `describe()` moved with it, and `lint()` did not. Hashing the
 * NEW `lint()` with the PREVIOUS SVG (every storey), `describe()` and `compile().diagnostics`
 * reproduces every previous row below, in `while-byte-identity-baseline.ts`,
 * `import-module-lets.test.ts` and `garage-byte-identity.test.ts`. Field by field, `describe()`:
 *
 *   - `courtyard-house` (X19): `o_gal_w`/`o_gal_e` 1200 → 1100 mm wide (50 mm nibs → 100-150),
 *     `d_court_l` 6000 → 6100 along `w_band_n` (0 → 100 mm nib), `w_entry_l` y 2950 → 2850
 *     (50 → 150 mm). `openings[2,3].width` and `access.edges[12,13]` widths 1200 → 1100.
 *   - `furnished-flat`: the bedroom-2 south window 4400 → 4450 (a 50 mm nib → 100). SVG only.
 *   - `hillside-villa` (X3): `o_entry_dining` 5500 → 6200 along `w_l1_band_w` (it straddled
 *     `w_liv_din`; now x 5000–7400), `o_entry_svc` 1800 → 1600 wide (50/0 mm nibs → 150/100),
 *     the study ribbon starts at 700 not 500 (a 0 mm nib → 200). `openings[1].width` 1800 → 1600,
 *     `openings[2]`/`access.edges[15]` lose `straddles`, three circulation rooms' bottleneck
 *     1100 → 1140, one walk 17200 → 16700 (detour 1.62 → 1.57), per storey as well.
 *   - `library` (X26): `o_hall_lobby` 3000 → 2600 wide, which ran 100 mm into both lobby
 *     partitions. `openings[7].width` and `access.edges[15]` widths 3000 → 2600.
 *   - `terrace-row`: in `unit()`, `win_liv` (650,d) width 800 (was (600,d) width 900, a 25 mm nib)
 *     and `win_bed` at BEDW − 600 (was − 450, flush on the partition face). `windows[0,5,9,13]`
 *     width 900 → 800. In the review round `win_bath` moved to w − 700 (was w − 500), so its
 *     `schedule openings` tag finds a clear place (`opening-tags-corpus.test.ts` loses its W04
 *     and W13 rows): the drawing moved, `describe()` and `lint()` did not, and the previous
 *     `describe()` and `lint()` with the new SVG reproduce `bc5c55f`'s row.
 *   - `two-storey` (X10, level 2): `d_bed2` filled the gap between two tees with 0 mm nibs;
 *     `bath_w` moves 4600 → 4900 and the door 4100 → 4250 (150 mm nibs). Landing 10.12 → 10.78
 *     m², Bath 5.28 → 4.62 m² (net 4.61 → 4), the caption with them, three walks +200 mm, net
 *     floor 51.58 → 51.59 m². Its rows are read against the height-free derivation as before.
 *
 * Outside this table, `import-module-lets.test.ts` also re-measures rows whose SOURCE did not
 * change and whose `lint()` gained the new codes (the recovery-corpus copies of `terrace-row`
 * and `two-storey`, four eval goldens, one fidelity plan): there the new SVG, `describe()` and
 * `compile().diagnostics` with the PREVIOUS `lint()` reproduce each previous row.
 *
 * Rows moved by BOTH plan-soundness branches (PS2.1–PS2.3 and PS2.5–PS2.7), re-measured on the
 * merged tree: `two-bed`, `test/fixtures/axes-grid`, `test/fixtures/chain30` and
 * `eval/goldens/strip-attach-clean`. For each, the merged `lint()` minus the three opening codes
 * with `origin/main`'s SVG, `describe()` and `compile().diagnostics` reproduces `origin/main`'s
 * row, and minus the three circulation codes with the opening branch's reproduces that branch's
 * row; the merged drawing and `describe()` equal the branch whose source moved (both, where
 * neither did). `two-storey`'s row is the opening branch's: the circulation rules raise nothing
 * on its fixed source, by the same two proofs.
 * ## Seven examples: both rows re-measured — the room-contents rules, and the defects they found
 *
 * 2026-10-18, plan-soundness PS2.8 + PS2.9. Two steps, each measured on its own.
 *
 * (1) The compiler: `W_HABITABLE_NO_WINDOW` and `W_ROOM_MISSING_DEFINING` are appended to
 * `LINT_RULES`, and `W_ROOM_NO_FIXTURE`'s hint now quotes the room's defining pieces (one
 * fixture alone would leave the room raising the new code). Swept per payload before (a `git
 * archive` of `da9b47b`, again after merging PS2.5–PS2.7 against `a7a1ac3`, and after merging PS2.1–PS2.3
 * against `cefe7e9`, where `hillside-villa`, `terrace-row` and `two-storey` carry both branches'
 * edits and each one's `main` source still reproduces `main`'s rows) and after, over
 * `examples/` (incl. `lib`), `test/**`, `eval/**` and every `arch` fence in `docs/`, README and
 * spec (205 files + 184–189 fences): every storey's SVG,
 * `describe()` and `compile().diagnostics` byte-identical everywhere; `lint()` moved on 81, and
 * on each the new list with the two new codes removed equals the old list element by element
 * except `W_ROOM_NO_FIXTURE`'s `hints`. Hashing the new SVG + `describe()` (+ diagnostics) with
 * the PREVIOUS `lint()` reproduces both previous rows of all seven examples below, and every
 * moved row in `while-byte-identity-baseline.ts` and `import-module-lets.test.ts`.
 *
 * (2) The examples, whose new warnings were real defects, fixed minimally (SOURCE edits):
 *   - `accessible`: the 14 m² "Living" had no window → `window at (0,2000) width 1200` on its
 *     west wall. SVG gains the window and the wall's cut; `describe()` gains `windows[1]`.
 *   - `relational`: the 20 m² label-only "Living" had no window → `window at (3300,0) width
 *     1800` on its north wall, appended after the existing windows so the generated ids keep
 *     their numbers (header sentence updated). SVG: window + cut; `describe()`: window.
 *   - `hillside-villa`: the 28.8 m² "Living"'s arc bay was solid → `window on shell at 34950
 *     width 1500` glazes the bay, plus `dim (0,10800)->(3000,10800) offset 300` (an opening on a
 *     curve is on no `dims auto` chain, `W_OPENING_NOT_DIMENSIONED`); the header's door sentence is
 *     reworded more tightly (every claim kept) and "one manual dim" reads "two manual dims", so the
 *     playground's chat link still fits (7918 of 7920). `compile().diagnostics` keeps its one
 *     `W_DRAWING_OVERFLOW`, and `describe()` one source span, shifted by the bytes the header
 *     edit moved. The rule reads a window on an arc edge as attribution unknown (PS0.12) and skips the room. SVG: the bay wall's cut, the window
 *     glyph and the dim; `describe()`: the window (`room: null`). Its `lint()` is the previous
 *     seven codes, field by field, spans shifted by the bytes added above them.
 *   - `practice-office`: the "Break Room" (`uses kitchen dining`) had a sink and no hob →
 *     `furniture stove against wall w_s2 offset 4300 in r_break`.
 *   - `two-storey`: the kitchen held only a sink, the bath a WC and basin → a `stove` against
 *     `kitchen_w` and a `shower in bath anchor bottom flush` (the bath label re-places beside it).
 *   - `corner-cafe`: the "Servery" (`uses kitchen`, a bar counter, no sink or hob, internal) is
 *     not a kitchen and no use describes a bar servery → `uses kitchen` dropped (comment says
 *     why). SVG byte-identical; `describe()` `uses` `["kitchen"]` → `[]`, `room_type` `Kitchen`
 *     → `Room`.
 *   - `terrace-row`: the front room said `uses living dining kitchen` with no table; its header
 *     calls it living + kitchen → `dining` dropped. SVG byte-identical; `describe()` `uses`.
 * After (2) every one of the seven lints exactly as before (1), field by field, spans aside;
 * each row below is the new measurement with this file's digest bodies (`two-storey` over its
 * height-free derivation).
 *
 * ## Three examples: both rows re-measured — the space-enclosure rules, and the defects they found
 *
 * 2026-10-19, plan-soundness PS2.4. Two steps, each measured on its own against `cc165f4`.
 *
 * (1) The compiler: `W_BOUNDARY_NO_WALL`, `W_FLOOR_UNASSIGNED` and `W_ROOM_OUTSIDE_SHELL` are
 * appended to `LINT_RULES`. Swept over every tracked `.arch` file (228) with `cc165f4`'s `dist/`
 * and this tree's: every storey's SVG, `describe()` and `compile().diagnostics` byte-identical
 * on the PREVIOUS sources, and `lint()` moved only by the new codes appended (the old list is
 * intact, element by element). Hashing the new SVG + `describe()` (+ diagnostics) with the
 * PREVIOUS `lint()` reproduces both previous rows of the three examples below, and every moved
 * row of `while-byte-identity-baseline.ts`, `import-module-lets.test.ts`,
 * `outdoor-byte-identity.test.ts` and `roof-void-byte-identity.test.ts`.
 *
 * (2) The examples, fixed where the new warnings were real defects:
 *   - `aquarium`: `W_FLOOR_UNASSIGNED` ×3. The walls closed the north band (y 0–6000) of both
 *     galleries, but "Reef Gallery" and "Kelp Forest" started at y 6000, leaving 121.39 m² each
 *     in no room (lit by the north windows), and the bay round the drum was open to the
 *     concourse (no wall on y 22000 between x 21000 and 39000), leaving its four spandrels
 *     (77.55 m²) as floor in no room. Fix: both galleries start at y 0 (21000×22000, a
 *     same-length edit), and the concourse polygon takes the bay round the drum, its edge there
 *     a run of 7.5° vertices snapped OUTWARD to the grid (the cafe's method, mirrored), so it
 *     never enters the round room (`compile()` raises no `W_ROOM_OVERLAP`). Reef and Kelp
 *     336 → 462 m², Concourse 480 → 564.56 m². No wall moved: a wall meeting the drum would put
 *     a line past its outer face (`joinery-pipeline.test.ts`). The concourse's name is pinned
 *     (`label … at (30000,25900)`) where it stood, since the new shape's pole sits by the drum's
 *     south door. SVG: the labels, the areas, the schedule; `describe()`: the three rooms and
 *     the totals.
 *   - `courtyard-house`: `W_FLOOR_UNASSIGNED`, the walled courtyard (19.14 m²) in no room or
 *     surface. Fix: `outdoor patio at (5000,3500) size 6000x3500`, with a comment, after every
 *     statement any diagnostic points at. SVG: the patio's tint and hatch; `describe()`:
 *     `outdoor[]` and `totals.outdoor_area_m2`.
 *   - `relational`: `W_BOUNDARY_NO_WALL` ×3, the language limit its header already documents
 *     (relational rooms cannot carry walls). Not fixed; the header now counts seven deliberate
 *     warnings (+90 code units above every diagnostic). SVG and `describe()` byte-identical
 *     with the previous source; `cc165f4`'s `lint()` on the new source is its `lint()` on the
 *     previous one with every span +90, and the new `lint()` is that list plus the three.
 *
 * Review round 1 (same day) moved `lint()` again, and only `lint()`: the boundary rule's
 * wording (a partial gap reads "the boundary … is open for N mm"), its run merging, wall-body
 * test and counter test, and the face rule's accept-if hint. `relational`'s rows and the moved
 * fixture rows elsewhere (`diff-a`, `zones-levels`, `zones-wings`) were re-measured with the same
 * proofs against `cc165f4`; `aquarium` and `courtyard-house` lint clean and did not move.
 * After (2) `aquarium` and `courtyard-house` lint exactly as before (1) (both clean); each row
 * below is the new measurement with this file's digest bodies.
 * ## `hillside-villa`: both rows re-measured — a window on an arc edge is attributed from the shape
 *
 * Case (1), a compiler change, in `describe()` only (plan-soundness PS0.12;
 * `test/arc-window-attribution.test.ts`). A window on an arc wall edge that no room's edge
 * touches is attributed from the shape: one wall thickness off each face, else along the concave
 * normal through the arc's chord into the room drawn to it. Field by field, `describe()` moves in
 * one value: the living-room bay window `windows[9].room` (and its copy under `levels[0]`) `null`
 * → `"r_living"`; its `facing` stays `S`. `lint()` is byte-identical (the Living room was skipped
 * by `W_HABITABLE_NO_WINDOW`'s arc-window rule before and is lit now), and so are every storey's
 * SVG and `compile().diagnostics`. Hashing the NEW `compile()` and `lint()` with the PREVIOUS
 * `describe()` reproduces both previous rows (5426cb1d…, 69f38c6e…) and the rows in
 * `while-byte-identity-baseline.ts` and `import-module-lets.test.ts` (a3e70591…). No other row in
 * this table moved.
 *
 * ## Fifteen examples: both rows re-measured — `describe().access` names the main entrance
 *
 * Case (1), a compiler change, in `describe()` only (plan-soundness PS0.10;
 * `test/main-entrance.test.ts`, `src/analyze/entrance.ts`). On a storey with more than one
 * entrance, `access` gains an appended `mainEntrance` `{ door, basis, candidates }`, and, when it
 * names a door, every `access.rooms[]` entry an appended `depthFromMainEntrance`; nothing else in
 * `describe()` moves (`depthFromEntrance`, `circulation` and every other key byte-identical). The
 * fact per example (and its `levels[]` copy where the plan has storeys), as the review round left
 * it (width never decides; each step singles out one door or the fact refuses):
 *   - named, `entry-room` (the door into an entry, hall or circulation room, every other door
 *     opening into a service room): `museum` (`door_1`);
 *   - named, `street` (the one hinged door on the `site` street side): `bungalow`, `garden-house`
 *     (level 1), `hillside-villa` (level 1), `laneway-house`, each `d_front`;
 *   - refused, `tie`: `classroom-block`, `practice-office`, `corner-cafe`, `library`, `materials`,
 *     `museum-wings`, `parametric`, `terrace-row`, `townhouse` (level 1), `transit-hall`.
 * Measured three times: first with a width-based choice, then in PS0.10 review round 1 (thirteen
 * rows moved; `laneway-house` and `parametric` kept the first), then in review round 2 (a door
 * into a bedroom, bath or WC is no candidate, and a hall's door is named only when every other
 * door opens into a service room: `bungalow`, `garden-house`, `hillside-villa`, `library`,
 * `terrace-row`, `townhouse`, `transit-hall` moved). Every time `describe()` alone moved: hashing
 * the new `compile()` and `lint()` with the previous measurement's `describe()` reproduces each
 * previous row.
 * `lint()` is byte-identical on all fifteen under the default ruleset: the walk now judged from the
 * main entrance moves no warning here. Every storey's SVG and `compile().diagnostics` are
 * byte-identical. Proof: with `describe()`'s main-entrance step put back (the new `compile()` and
 * `lint()` with the previous `describe()`), every digest suite passes against the previous rows,
 * and the digest script reproduces each previous row before taking the new one. The same rows
 * moved in `while-byte-identity-baseline.ts`, `import-module-lets.test.ts`,
 * `garage-byte-identity.test.ts`, `outdoor-byte-identity.test.ts` and
 * `roof-void-byte-identity.test.ts`. No other row in this table moved.
 *
 * ## `furnished-flat`: both rows re-measured — the label classifier's fallback vocabulary
 *
 * 2026-10-20, plan-soundness PS2.19. Case (1), a compiler change, in `describe()` only.
 * `classifyLabelUses` (`src/vocabulary.ts`) reads `FALLBACK_USE_VOCABULARY` (storage, office,
 * utility, a nursery, a water closet) for a label its table leaves empty. Field by field, one
 * room: `r_util` "Utility" (no authored `uses`) goes `uses` `[]` → `["utility"]` and `room_type`
 * `Room` → `Storage` (the type an authored `uses utility` already gets). Every storey's SVG,
 * `lint()` (default and `accessibility-advisory`), `compile().diagnostics` and the circulation
 * overlay are byte-identical, swept per payload over `examples/`, `test/`, `eval/`, `docs/` and
 * every `arch` fence (478 rows) before (a `git archive` of `fcb3074`) and after. Hashing the NEW
 * SVG + `lint()` (+ `compile().diagnostics`) with the PREVIOUS `describe()` reproduces both
 * previous rows (0d00a6d6…, dab3b998…) and the rows in `while-byte-identity-baseline.ts`,
 * `import-module-lets.test.ts` (4eb26e5f…; there also `eval/goldens/office.arch`, d41de65c…,
 * whose label-only "Open Office" reads `office`) and `garage-byte-identity.test.ts`. No other
 * row in this table moved.
 *
 * ## Eleven examples: both rows re-measured — a worktop in every example kitchen
 *
 * 2026-10-20, plan-soundness PS2.17. Two steps, each measured on its own against `ef7dc46`.
 *
 * (1) The compiler: `FURNISH_TABLE`'s kitchen row requires a `counter` (or `worktop`), so
 * `W_ROOM_MISSING_DEFINING` reports a furnished kitchen without one (and `W_ROOM_NO_FIXTURE`'s
 * hint quotes it). Swept per payload over 478 rows: every storey's SVG, `describe()` and
 * `compile().diagnostics` byte-identical; `lint()` moved only by the new findings appended and
 * by existing kitchen findings that now also name the worktop. Hashing the NEW compiler's
 * payload of each example's PREVIOUS source, with the "no counter or worktop" findings removed
 * from `lint()`, reproduces both previous rows of all eleven examples below, and every moved
 * row of `while-byte-identity-baseline.ts`, `import-module-lets.test.ts`,
 * `garage-byte-identity.test.ts`, `outdoor-byte-identity.test.ts` and
 * `roof-void-byte-identity.test.ts` (`two-storey` over its height-free derivation).
 *
 * (2) The examples, whose new warning was a real defect (a sink, a hob and a fridge with
 * nowhere to prepare food), each gained one `counter` statement: `bungalow`, `corner-cafe`,
 * `garden-house`, `garden-loft`, `laneway-house` and `two-bed` at the end of their run;
 * `townhouse` at the other end; `two-storey` beyond the stove; `terrace-row` anchored to the
 * top of the front room; `tiny-house` round the corner on the west wall as a 400 mm module (a
 * 600 mm one covered the gable window's schedule tag); `relational` beside its sink, with one
 * kitchen chair moved 600 mm west (6800 → 6200) so the worktop has its 550 mm in front. After
 * (2) every one of the eleven lints exactly as before (1) under the default ruleset and
 * `accessibility-advisory`, field by field, spans aside, and its `compile().diagnostics` are
 * unchanged but for `garden-house`'s `W_DRAWING_OVERFLOW`, whose legend gains a `counter` row:
 * drawing area 18290 → 17950 mm, over by 3710 → 4050 mm. SVG: the counter glyph (and that
 * legend row); `describe()`: one `furniture[]` entry, the auto-ids after it, and the `freedom`
 * counts, plus `bungalow`'s first circulation route, whose clear bottleneck the worktop takes
 * from 2400 to 2300 mm (no threshold crossed; `lint()` unchanged), and `garden-house`'s copy
 * of the overflow message. Each row below is the new measurement with this file's digest bodies.
 *
 * ## `relational` and `two-bed` (both rows each): the examples were rewritten (PS3.6)
 *
 * Not a compiler change: both SOURCES were rewritten in ADR 0028's room-graph form. `two-bed`
 * was re-laid round a central corridor (new rooms, `walls from rooms … { open between }`, doors
 * `between`, windows `on <room>.<edge>`, its furniture re-placed), and `relational` gained a hall
 * room, derived walls and openings, and re-placed fixtures. Every surface moves because the
 * plan is a different plan. Proof that the code is innocent: with both previous sources
 * (`1235529c`) put back, every digest suite on this branch (this file's two tables through
 * `finish`, `height-byte-identity`, `iso-byte-identity`; `garage-byte-identity`,
 * `while-byte-identity`, `import-module-lets`, `finish-furnish`, `walls-from-rooms-digests`)
 * is green, 1027 of 1027; no other row of any table moved with the new sources. Each new row
 * is the measurement with this file's digest bodies.
 *
 * ## Eight examples (both rows each): 17 chairs turned to their table (PS3.7, ADR 0029 §6)
 *
 * A new undeclared rule, `W_SEAT_FACING_AWAY` (plan-soundness PS2.11), found 17 chairs drawn
 * with their back to the table or desk they sit at: `corner-cafe` 9, `hillside-villa` 2, and one
 * each on `aquarium`, `furnished-flat`, `gallery-l`, `materials`, `museum` and `themed`. They
 * were real defects, so each example was FIXED by one clause (`rotate`, or `facing f_desk` on
 * `materials`; the `furnished-flat` and `museum` chairs also moved into line with their desk),
 * never blessed. Every surface of those plans moves with the edit: the SVG draws the turned
 * chair glyph, `describe()` gains the chair's `rotate` (and `facing` on `materials`), and
 * `lint()` loses the warning. Nothing else moved: with the rule off, the new language forms
 * left every row of every table green (PS3.7's first commit), the other `lint()` rows of these
 * plans are message for message the same, and `describe()` moves elsewhere only on
 * `furnished-flat`, whose walk into Bedroom 2 grows 100 mm (5200 to 5300) round the moved
 * chair. Each new row is the measurement with this file's digest bodies.
 *
 * ## `aquarium` and `gallery-l` (`BASELINE` rows only): two lying dimensions fixed (PS2.10)
 *
 * A new rule, `W_DIM_TEXT_MISMATCH` (plan-soundness PS2.10), found three hand dimensions whose
 * text contradicts their own line, all drawn "jamb to jamb" on an opening no facade chain can
 * tick. `gallery-l`'s entrance dim ran (8400,12000)→(9600,11000), 1562.05 mm, lettered "1500":
 * its endpoints were ±(600,−500) off the door's centre instead of the ±(576.17,−480.14) a
 * 1500 mm door on the 6:5 facade has, so the GEOMETRY was wrong; the endpoints now sit on the
 * jambs (1500.01 mm). `aquarium`'s two window dims (1992.49 and 1979.9 mm, lettered "2000") had
 * grid-rounded endpoints off the jambs, and even on the jambs a straight dim measures the chord
 * (1997.68 mm as drawn, endpoints rounded to 0.01), not the 2000 mm along the arc the text
 * meant: both were wrong, so the endpoints now sit on the jambs and the text reads "2.0m"
 * (1950–2050 mm, which holds the chord and the arc length). The PR's first draft wrote
 * "2000 arc", which is too wide for the line and was placed off it, past a station; red team
 * round 1 caught it, and only the `aquarium` rows were re-measured again for "2.0m", whose
 * labels sit on their lines at (59775.08,31583.72) and (56703.32,36703.32), within 65 mm of
 * main's. Each example was FIXED, never blessed.
 * Only the SVG moved (the two dims' lines, ticks and text): with the OLD sources' `compile()`
 * and the NEW sources' `describe()`/`lint()` (rule on), both payloads reproduce their old rows
 * here and in `while-byte-identity-baseline.ts`, and the `SEMANTIC_BASELINE` rows hold. No
 * other plan in any digest corpus moved. Each new row is the measurement with this file's
 * digest bodies.
 *
 * ## Seven examples fixed, and `townhouse` redrawn: annotation collisions (PS2.12)
 *
 * Two new drafting rules, `W_ANNOTATION_OVERLAP` and `W_TITLE_OVERFLOW`, read the drawn sheet
 * (`src/lint/rules/annotations.ts`). They found real overprints on seven examples, each FIXED by
 * one clause, never blessed: `aquarium` (the "Ocean Rotunda" name was pinned on the `R8000`
 * leader's lettering; pinned below the centre line instead), `hillside-villa` (the "Master Suite"
 * label was pinned on the double bed; moved to clear floor), `library` (the "Reference Stacks" name
 * lay on a shelf; pinned below the shelves), `tiny-house` (the area figure lay on the bench; label
 * pinned on clear floor, the example's one deliberate `W_PATH_TOO_NARROW` kept), `two-bed`
 * (Bedroom 2 had no clear floor for its label; the bed moved from the window wall to the top-right
 * corner, `anchor top-right flush`), and `museum-wings` and `transit-hall` (project titles of 31
 * and 35 characters, wider than the 25 the row holds; shortened). Each moves its SVG, and
 * `describe()` too where the edit is a fact it reports (the bed's position, a pinned label);
 * `lint()` loses the new warning and is otherwise unchanged. The renderer change: the `dims auto`
 * thickness figure now keeps off a stair as it did off furniture, so `townhouse`'s "300" moves off
 * the stair on all three storeys (SVG only). Proof that nothing else moved: with the seven
 * previous sources put back, every digest suite (this file's tables through `finish`,
 * `height-byte-identity`, `iso-byte-identity`, `garage-byte-identity`, `import-module-lets`,
 * `while-byte-identity`, `outdoor`/`roof-void-byte-identity`, `finish-furnish`) fails only on
 * those seven plans (each now carrying the warning), `townhouse` (the figure) and
 * `eval/goldens/l-shaped-flat` (a new `W_ANNOTATION_OVERLAP`: its "Bathroom" name on the basin; a
 * holdout golden, not edited). Each new row is the measurement with that suite's digest body.
 * Rebased onto PS2.10 (PR #243), which also edited `aquarium` (its two window dims): `aquarium`'s
 * rows in every table are the measurement of the source carrying both edits, and its SUMMARY
 * rows (describe + lint) did not move, since neither edit changes a fact `describe()` reports and
 * both leave its `lint()` as PS2.10 left it. No other row moved on the rebase.
 *
 * ## Twelve examples fixed: WC side clearance and tall units over windows (PS2.11a, PS2.11b)
 *
 * Two validity rules, `W_WC_SIDE_CLEARANCE` and `W_FURNITURE_OVER_WINDOW`
 * (`src/lint/rules/clearances.ts`), read only furniture footprints, wall bodies and window spans.
 * Measured first with every source as it was (a sweep of SVG, `compile().diagnostics`,
 * `describe()`, Plan JSON and `lint()` under the default and five profiles over every `.arch` in
 * the repository and every `arch` fence in `docs/`, README and spec): no SVG, diagnostic,
 * `describe()` or Plan JSON moved anywhere, and every moved `lint()` only APPENDED diagnostics of
 * the two new codes. Twelve examples really had the defect and were FIXED, never blessed: the WC
 * pushed into a corner, its centreline 200–250 mm from the side wall or the shower (`courtyard-house`,
 * `garden-house`, `hillside-villa` (the powder room and the `ensuite` component), `laneway-house`,
 * `materials`, `terrace-row`, `tiny-house`, `townhouse` (three storeys), `two-bed`, `two-storey`),
 * re-placed `against <room>.<edge> offset …` or on a free wall so it keeps at least 400 mm (450 where
 * the room allows); and a tall unit across a window (`courtyard-house` and `hillside-villa` fridges,
 * `furnished-flat` bookshelf, `garden-house` and `garden-loft` wardrobes, `two-bed` wardrobe),
 * moved along its wall or the window moved. Each moves its SVG and, where the edit is a fact it
 * reports, `describe()` and Plan JSON; `lint()` loses the new warning and is otherwise unchanged
 * but for spans shifted by the edit (`hillside-villa`'s comment lines). The same pass made every
 * quoted placement respect the two rules (`placementClear`), which re-words one hint off this
 * table's corpus (a `W_ROOM_MISSING_DEFINING` example statement that would have stood beside a
 * WC). Rows that moved only because their plan gained one of the new warnings and was not edited:
 * the ten eval goldens that carry it (holdout goldens, never edited) and
 * `test/fixtures/schedule-sheet`, `test/recovery-corpus/{materials,terrace-row,two-storey}`. Each
 * new row is the measurement with that suite's digest body.
 *
 * Red-team round 1 (same PR) re-measured two of those rows. `terrace-row`'s WC moved from the bath's
 * east wall to the south wall, 1625 mm along it (centreline 450 mm off the shell), because on the
 * east wall the `schedule openings` tag of one window had no clear place left
 * (`test/opening-tags-corpus.test.ts`, whose allow-list only shrinks). `hillside-villa`'s ensuite WC
 * is now written from the component room's own edges (`at (room.right - 900, room.top + 1400)`), the
 * same footprint as before, so its drawing and `describe()` did not move and its `lint()` moved only
 * by the spans the longer statement and comment shift. The deprecated iso/axon view of
 * `hillside-villa` (`test/__snapshots__/iso-snapshot.test.ts.snap`) draws the moved WCs and fridge;
 * both snapshots were re-taken. No other row moved in that round. Round 2 shortened
 * `hillside-villa`'s comments only (its `claude.ai` prefilled link had fallen under the 80
 * characters `playground/test/llm-prompt.test.ts` keeps spare), so its rows moved by `lint()`
 * spans alone; its drawing and `describe()` are unchanged.
 * ## Three examples fixed: transposed footprints and a parked leaf (PS2.11c, PS2.11d)
 *
 * Two validity rules, `W_FOOTPRINT_TRANSPOSED` (`src/lint/rules/footprint.ts`) and
 * `W_LEAF_ACROSS_DOORWAY` (`src/lint/rules/doors.ts`), found drawing defects in three examples,
 * each FIXED in the source, never blessed (payloads compared with the new compiler on both sides):
 *
 *   - `tiny-house`: the bed, `size 2000x1400` with no turn, drew 2 m wide and 1.4 m long; now
 *     `rotate 90`, lengthwise under the window, head east. SVG and `describe()` move; `lint()`
 *     trades the new code for `W_FIXTURE_BACK_TO_ROOM`, that rule's reading of a bed side-on to
 *     a wall as "back to the room" (card PS2.50). The example carries it rather than a fudged gap.
 *   - `hillside-villa`: the two wardrobes, `550x1800` and `450x1800` unturned, drew one door wide
 *     and 1.8 m deep. The final rule no longer judges a wardrobe (a family sold in both shapes),
 *     but a 1.8 m-deep wardrobe is still a real drawing defect, so the turning edit stays:
 *     Bedroom 3's `rotate 90` (back on the east shell), Bedroom 2's `rotate 270` (doors east, away
 *     from the bed 150 mm off; no turn puts its back on a wall, since it touches the north wall
 *     only with its end, and of the four turns only the unturned one is quiet). SVG and
 *     `describe()` move; `lint()` gains `W_FIXTURE_BACK_TO_ROOM` on Bedroom 2's wardrobe (card
 *     PS2.50), nothing else. Two comment lines elsewhere in the file were shortened to keep the
 *     playground's prefilled chat link inside its budget (`playground/test/llm-prompt.test.ts`).
 *   - `relational`: the front door's open leaf parked 100 mm in front of the bedroom door; now
 *     `hinge right`, and the hand-typed twin `test/walls-from-rooms/relational.arch` with it,
 *     which stays byte-identical to the example. Only the SVG moves: `describe()` reports no hinge,
 *     and the new `lint()` is clean, as main's was; the old source under the new compiler raises
 *     `W_LEAF_ACROSS_DOORWAY`, so it is clean only with that code stripped.
 *
 * Proof that nothing else moved: every row of `import-module-lets`' corpus table, measured on the
 * pre-change source with the new compiler and `lint()` stripped of the two codes, reproduces its
 * pin. The one plan whose rows moved without an edit gains the warning and nothing else:
 * `eval/goldens/against-wall-bath` (a bed `1400x2000 rotate 90`, turned onto its side), a holdout
 * golden never edited. Two overview permalinks (hillside-villa, tiny-house) were regenerated. Each
 * new row is the measurement with that suite's digest body. Rebased onto PS2.11a/b (PR #252), which
 * also edited `hillside-villa` and `tiny-house` and moved `against-wall-bath`'s row: those rows
 * are the measurement of the merged sources, carrying both PRs' edits; the swap-back above, taken
 * again on the merged base, reproduces every other pin.
 *
 * ## Two rows re-measured: a false positive withdrawn (PS2.50)
 *
 * `W_FIXTURE_BACK_TO_ROOM` now declines a piece that needs no services when no edge of it on a
 * wall could be its back (it stands side-on or end-on to the wall). Case (3) above: the rows of
 * `hillside-villa` (Bedroom 2's wardrobe, end-on to the north wall) and `tiny-house` (the bed,
 * side-on to the north wall) move because `lint()` loses exactly that one diagnostic, the two
 * PS2.11c/d recorded as this rule's false reading. Every storey's SVG, `describe()` and
 * `compile().diagnostics` are byte-identical, no example source was edited, and a sweep of 233
 * plans (examples, eval goldens, defect, recovery and walls-from-rooms corpora, test fixtures)
 * against `origin/main` found no other plan whose payload moved.
 */

/** SHA-256 over every storey's SVG + `describe()` + `lint()`, measured on `f4548db`. */
export const BASELINE: [string, string][] = [
  ["accessible", "cdc14f20b17a41f25cb20a6c5b19ca55e368bd5c84ca1ef6eeb0a9ecb53d08b1"],
  ["aquarium", "23ad34714826a1c0506b6c8252b7244d579a37b4cc183305e9a2f7cd424b72ee"], // re-measured for PS2.4, see header; PS2.10 dims fixed, see header
  ["attached", "f1b122904c1242d9ef7088c5eed12c765dc63f4dbc2af2a75ab8f23f398feac2"],
  ["bungalow", "7e4b4f8e97cd44c1f03f2fa8aa9ae85ee1568a17dc5743c384e55590196eb1e5"],
  ["classroom-block", "b3e8150f963c3c1060e4f2caa809a6d133795b8130466f3fee798b5a0aa602e1"], // added with the example, re-measured for net area, see header
  ["clinic", "5d1f3ac0f05d759faa0cb55fcc1059e4e140fef7004974606eda28d2957d9174"],
  ["corner-cafe", "afb1988c01b07af451de094ec7e1a98f02bab6c6b53dd99bfb5a5d2e7a386f7f"], // added with the example, re-measured for net area, see header
  ["courtyard-house", "8fe19d637344b6114de09619d9f17438767e4083c1f916823532a4b736b97ff1"], // re-measured for PS2.4, see header
  ["furnished-flat", "1d3a98c3cf3eff0bec89ee54b0c3acbbb24cf799caa771efbf66a2aa45b8b5d7"],
  ["gallery-l", "a65cc6b6100dea8fcd1381541a4d60e07aa43a509f4be7087a2dfafe8421cfc1"], // PS2.10 dim fixed, see header
  ["garden-house", "8dc93639c9a34a961d0864530394d40af97b17840cd0fb883d80dd714bb8f339"], // re-measured, see header
  ["garden-loft", "19d5cb4a8c197905cbb588d0a18d859d121c7edcc65f62176c62b78424084715"],
  ["hexagon-pavilion", "92d343afbb62315ad0014b95de9f4a8b26ccffbc14093b04c5956b689f850252"],
  ["hillside-villa", "e6438968bf01b98ee36b69d99cc86d3c57c73c419870a61617180aaad76b2216"], // re-measured, see header
  ["imports", "4b0151513963a656e52ac84c6fd80eb35c9820ae101921420cb8d5c9c13c0b70"],
  ["laneway-house", "efd11c408cc1c0ab1c23ef1ef054b63ce3c86bd7024c06b3fc69654b602dcfff"],
  ["library", "3482b924cb35a47f09dec06bf46b3d0155bc2f7b07630fb76a1747c3456167e9"],
  ["materials", "615715ab389d45e151ff785bd4bbcea195e176c17b18b402885a096954fb8481"],
  ["museum-wing", "00ac6744ffaa76596229248fd62ca5a41c9a5d70315c41ffa0fd6fc844ce2201"],
  ["museum-wings", "c1f4233dc49a9ea09aa2a3f216c2d186136c3ebe049268c2938877172570c55d"], // re-measured, see header
  ["museum", "e8ebfe1fddec93af03bb9c645d0ec2e9bdd8032a313fbff38a7a845869bed1f4"],
  ["one-room", "9519d5c396d8644e840a1520e6d84f75a8306d1309abebcbd61aa59560fda364"],
  ["parametric", "e45fddefabb204b9470fd9b06f59c2aec440a8fd786773effc1334f1b7fb904c"],
  ["practice-office", "2a3b241c5897a154d937b8e1b392e8468812a1acafd8b8fafaee8ad478c5caa9"], // added with the example, re-measured for net area, see header
  ["relational", "0b19721e0c2226a1b829fa6e439f5ac1169972a467904f10ba0d3e4a2acdf052"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see header
  ["sheet-notes", "f4ab64ec80be43d25a5949c971b07b00696f8fc2ab3927af72442ab70e8f551f"], // re-measured, see header
  ["studio", "820d01bc49c948e62b0be9e6fd7d80334a312b5c9c5ff440bed4279b8638d75f"],
  ["terrace-row", "b0af69a10d91e8a7bb8c970e93203ca36b0a82148fee4716c5e04b198a8c6f22"], // re-measured, see header
  ["themed", "cc3a3b597d0a268b12b233bc82aa8b85eadd9232493962766a0d39b8d0a7b318"],
  ["tiny-house", "c398cbe93fe387013b46c4fc2929fa598debcfa867e3620cdff7dc3246153821"],
  ["townhouse", "133902baef39c683d1a3c179e6ec742a8ba93b63c8ae828cdc343b294e7e14c0"], // re-measured, see header
  ["transit-hall", "558cd626af15b0400cee0443d52a67b4d7a8a8b55aae4afd7b93372e59761841"],
  ["two-bed", "2dc668dc93aa6dd7e114715e593a87ec91b208ff60255b2d41bf20c585b3fa05"], // PS3.6 source rewrite, see header
  ["two-storey", "8160961429c94f1c32963e77c0ae9151002d14959084c03f34d432bc8f6e94af"], // re-measured, see header
];

/**
 * The SUMMARY half — `describe()` + `lint()` with the drawing removed.
 *
 * It is blind to the picture, which is what makes it the sharper of the two here: a
 * datum layer has no business moving a drawing, so if this pair ever disagrees — the
 * whole-surface digest moving while this one holds — the change is in the SVG and this
 * file's own claim is what is wrong.
 *
 * The four values shared with `roof-void-byte-identity.test.ts` are the cross-check
 * described in the header.
 */
export const SEMANTIC_BASELINE: [string, string][] = [
  ["accessible", "ea4dbda89e3b9b49c115c69acf7c10ffd86aa4b6315f3589792d7795313051df"],
  ["aquarium", "ac66ce24faecd7af7fc55e3153868caa2e7f720b4eb535cdfd3715fbacac9893"], // re-measured for PS2.4, see header
  ["attached", "0edb3482583f971f1c5daa64c7e8f8c638dc3ad70943893bfb5076ec71a425ac"],
  ["bungalow", "f655bb711665281ce3440d10cb38dc2ca4cdb80343e0a4580d2ca89947078351"],
  ["classroom-block", "3ac3a2a28075c9f125b5a562c19af9cf5538ae7ea42acc432b73e175cf2c8de9"], // added with the example, re-measured for net area, see header
  ["clinic", "6abf1b490c46e473a3330d3acf61e35a0b9524f33ebaa0d7881dafebcf014261"],
  ["corner-cafe", "ede7a4836c78e278efe0aa8d864eb2cedae510da8f0b38ed7ae17ff76bf09688"], // added with the example, re-measured for net area, see header
  ["courtyard-house", "a61ba137f5f84c8c291807850fd7e3e86edf53d6f24f997298e027eefa5d217e"], // re-measured for PS2.4, see header
  ["furnished-flat", "6a19a52e6e702ead080c55100e93d69667627a7a586412db992ab65c5289ba24"],
  ["gallery-l", "ae44ce899ea92b457360ec9c39362baec12d3840c8105cad5248afa16fd905e1"],
  ["garden-house", "e5682c530681829e8b70a578429909629d24e4c6dbbee5017a3154f91280b5d2"], // re-measured, see header
  ["garden-loft", "82868ee4b98cfc0e45872c803153a34fc90cc699b022e6f8a12bcad0bdef2010"],
  ["hexagon-pavilion", "6e8005c3a0af9b80598574e77141301a957b4a293ba8d5de6cc1effb00693494"],
  ["hillside-villa", "24d03bc29574e116335bd3336c1bc7fd7f0f93652a73aa3f2c4bab27f904284e"], // re-measured, see header
  ["imports", "183bf4ec261e6650b21c4771b64fe924bf5c6eabd3ea1b8d3bbdac71b2900ac3"],
  ["laneway-house", "c8b08b3f3a1b0fc9f390a7be6f9e16a6bcd512df54db8fce74f06cf3fbd6e679"],
  ["library", "a17af1b3b0ac53ba1c8acf2a83b0f9556aa790ff23008c3cd149d501b8ff02c3"],
  ["materials", "ea9876e7c4575110c59cc81d2248b722743b016798be33ac97324b0c25cc8894"],
  ["museum-wing", "b3058ec90b03384f0f6856a475263046f503e246cc654d05dbf8495d263fa246"],
  ["museum-wings", "3c2503ac3c7e5e446f784733b2587e3d2dc2e1ec0b80ad55cc9221017c593348"], // re-measured, see header
  ["museum", "a104ddd41ccd9eef34f0055a7c0277a8a24476cb5a90effd0d8b66ba4620143c"],
  ["one-room", "fbbd7f194ce4ff25444b4a5e58d32ae1919f01a25e20f9ab8bf6aa9d7475def5"],
  ["parametric", "ec765bc02073b9cf32d8646760c3df96cc8ec60f351ea05506f89b1373c0ad22"],
  ["practice-office", "bc58498b17376ff2fcb8f5bf1713dcec5b6bbf851a3ed92be5ea4ff34f277996"], // added with the example, re-measured for net area, see header
  ["relational", "5ac199a9373bef52f66d7bedc8fdad5c8754c1073fb12c44e25e2274050977bb"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see header
  ["sheet-notes", "8a72d4737654ecebe5fa7cce4590d84c70d3c73556115298e2a1c2eadde7d0f9"], // added with the example, see header
  ["studio", "ff1227adbd85a5239306f8b1b2d6ef4359af324e8a334dca3b5d63a25361ee6a"],
  ["terrace-row", "2b74af640f769060a7054e227e7007144c94e879afd356e306aedda6a0eda84d"],
  ["themed", "b68f852d95fddacf8f5cd97228da4bd88054bd262a79dbd7083539a7e53605e0"],
  ["tiny-house", "29f1074ba594a57739a0666fb8babff5864ae80efca4467756aae499b64ed296"],
  ["townhouse", "afab30a8efdac3ddee689dee2889276cb8fed003a0bcb056c376133a3c0d8277"], // re-measured, see header
  ["transit-hall", "fce22abf9ad40aa1de121328a80e33120015b5a7a338d04a8d22d32153b12dab"],
  ["two-bed", "8c3bc146d49582bf1438d0b075c40f5aa80d24d9e8a5b9b52e9a75cc4d4b1cae"], // PS3.6 source rewrite, see header
  ["two-storey", "b55d8eb1c6a871d439cf87a4071baf91dd762f5fbedf59c8b5045f68d0fe07d2"], // re-measured, see header
];

/**
 * The shipped examples that AUTHOR the vertical datum — the second half of the corpus.
 *
 * It is a list, not a scan of the sources, on purpose: it is the declared intent, and the
 * corpus tests cross-check it against an actual scan in BOTH directions, so a plan that
 * quietly grows a `height` without being named here fails the no-height group's vacuity
 * guard, and a name here whose plan authors nothing fails its own.
 *
 * Its rows are read differently from the rest by `height-byte-identity.test.ts` and
 * `iso-byte-identity.test.ts`: their `BASELINE`/`SEMANTIC_BASELINE` hashes are checked
 * against the plan's height-free derivation (see this file's header), and the plan AS
 * WRITTEN is held to a stronger law that needs no measurement at all — its drawing must
 * equal the derivation's, byte for byte, on every storey.
 *
 * **This list must not be empty.** A corpus split where one side has no members makes the
 * stronger law vacuous, which is the failure this whole restructure exists to avoid; the
 * tests assert it.
 */
export const AUTHORS_HEIGHT: readonly string[] = ["two-storey"];
