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
 */

/** SHA-256 over every storey's SVG + `describe()` + `lint()`, measured on `f4548db`. */
export const BASELINE: [string, string][] = [
  ["accessible", "5602b128c5e8df74a5d3d85b1eb5d1b8778c4dfa03eafd39c62cade55d472d4f"],
  ["aquarium", "736e20a429113534d882ccb8fa88187227ad7bdc7e6c95f55a70c2e0917d5768"],
  ["attached", "b4aaf0c67e584a88f9eca8c35a525bf58e1b3054774c75e681cec2e03576f805"],
  ["bungalow", "88ab68abfc47345fdef7098506116ad93fcbab466415837d5db99dc1542d8851"],
  ["clinic", "1d20a7330af3826897fcdfd3771a948c13b4f3ae45b8844400bdb53657005926"],
  ["courtyard-house", "8cc94cede4106e5d53afb9806307783b5bc02fd5dbc616821cb6bb194db3055d"],
  ["furnished-flat", "78513fb8a5182104e2a22b69580fa952a2ff2f11839162241ebfe40839047d80"],
  ["gallery-l", "9cdfa47c8d0f0a1a1d1ecf998877ca4ed2b029289730c028065d9ca5f92af2f1"],
  ["garden-house", "707e56c4a8992c77ecf5d76a409690c2554f68059e31758bb8712d2b54266654"],
  ["garden-loft", "970f3edf687ae08093993eeb5ec87cc0e63b9dd51e8487202d6d5d3d61b5030b"],
  ["hexagon-pavilion", "7bdf11d0b722ec26ce6f63aae7ce558a3da404529a405d87a387f9ba0e18c344"],
  ["hillside-villa", "9f075ede483ebb255419c4ffb60e62f07d70a6de1f5f571587bd4e6e751a1cae"], // re-measured, see header
  ["imports", "9a18b7a2e74117c3c986bbf513055d7ea333dea1451faeb4f9f3429ca23e7e55"],
  ["laneway-house", "ca93975f9180ff845039a79422a4cca1fe683d76a28831cf700efbb8f6d2bea0"],
  ["library", "614bc84423700e348345a7dd9bbf1e3ff098deacba76f3f62043cc2d7e5c144c"],
  ["materials", "f400204eb2a5b4e189d33ce462c9135d602e21bb050df7dda94e260897d57450"],
  ["museum-wing", "3c797bc54f382cfd1f3975d0e6d5cc49fbb10287fe24ba22b0d24ac321504e13"],
  ["museum-wings", "53f6146cd811ea75b6547cff0601a739cfc042b3b781b37b129a0b2980b258e3"], // re-measured, see header
  ["museum", "07f06548d662a7283d4d47136c1e4260662ba0d8115282dd98d1b87134188304"],
  ["one-room", "153de2406dcdfd537ba6a8495bad8a046f1f75441119333f40c21c3970164431"],
  ["parametric", "e30cff0f2fb517d5b19723cef6092a9d614ae198a63fd96f7f1b23508ee2c0a3"],
  ["relational", "c3eab06b8184405f6c2a89edd04ce75ffbf97956cc0aa6d0d9780ad7495d6b7b"],
  ["studio", "20a7659eb5c0ae250d1b91e0a7c53cff9dc2fd8908365a40e679bbf97e91751d"],
  ["terrace-row", "d47f75e57df406060420ee7ce6c18f5a7f4250edcf4171b6145df92966076d3f"], // re-measured, see header
  ["themed", "55e8723dd35cc3ec24b73a7bbf8052bea24f1fdaddd6d90012cffb81d7d00057"],
  ["tiny-house", "4530542edaa0793db192ee26cfaa293bc353c3912a5bc42baf4749a5ce5ce010"],
  ["townhouse", "7a8e8a6e84e53c0df96a85b02b81af6d2b81c5556e6146e36863a72fa845a9d7"],
  ["transit-hall", "056a651ef496fa544aabdab8db6b0486ac00b3d4e32da8f8133bc73b6581e2e3"],
  ["two-bed", "ff4ad8858ef6c8fa71a632c9df6c5c489b4661d0ea0b80719f69f0f481c50cd7"],
  ["two-storey", "12e2c67328c957fcfd9fe245db48d4fde513746afd090e6f2be72e61e5bb9fcc"],
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
  ["accessible", "68484c56bb156de1e79654600b428779227547e5a44d46653217b34ab0364c9e"],
  ["aquarium", "299f0e348e915d0f4f7aac16a047f708cc7003f3103892b10f46ee945a6b477c"],
  ["attached", "df08961c92bc1d8412dd0f5ff7e9282c35b283e5a007b4192323005a6c564d0f"],
  ["bungalow", "93a7bbad33a456a3f9a72b8ec7e0ccc116c3ea777b464149a6c40d0328e3d48d"],
  ["clinic", "87a31334de932023821bb2a29a4a8b7f81b46f2c6a06283a00e4c4a0856d1e10"],
  ["courtyard-house", "fe1c1009bf87d63b2e9dc77fb870ad43cc2a0957376e4ad3c2192ce5bab5ac0a"],
  ["furnished-flat", "c55ce2b43dd4acf0eec4eada9ee456c799bf4188f6f1a2f6d32a8cb691424fc4"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["garden-house", "d41cfe2342e0e0818cc7531e75e08bf7c65fbe0d650d7e6a7f2b4261d3470bb8"],
  ["garden-loft", "ad8935f435045684b7ed9975254dc2daf0357f4eb3735e514e319980ebecf793"],
  ["hexagon-pavilion", "9d87d6ba7fb3a4cc3a459bc981e6b682d3c0d7926669fae90589b54308f8c5ff"],
  ["hillside-villa", "066363a2120e1409e7fe68708b551468748ae1ce62caaba732b0883556dee7f3"], // re-measured, see header
  ["imports", "5c75030d46ecbfc8b1e80b40945d17bd13afb68a813a286b9ddfe23252452cbc"],
  ["laneway-house", "9a173beb7f213286b8e0c117d829d126166b93e118f91894ba278005254a5255"],
  ["library", "f81107388c6547af37b0938ecc06a1f3ab3acbe69916edb7b0c9c76a4c9f3477"],
  ["materials", "e5041b5dd4d5029e77b657823d988604464193e121cd3f4f3a236a72faf5bf9f"],
  ["museum-wing", "95ef06b2e848b83c8d042250431b5c46deed6d8afc3f2c443b343b83e5b6cd6e"],
  ["museum-wings", "220aa53fd86ecc9546320077450fc93337d5fb85f0af4862fa05aa40c6ffe7d1"], // re-measured, see header
  ["museum", "7ec1245b5a9ae03f813436680f5bb750cc707631703b26e1ecf6f0c1d750d573"],
  ["one-room", "4313ab047cbd42c75be08c6a6c72e3bbe8ee6b1e598a816d722d0aa8655c0551"],
  ["parametric", "5783da773c0493767621e2c063e6da257c660dec2edb5351893f0ad4907afc3a"],
  ["relational", "d31bd84bfcb7bfce8d662470f8828144f55ef3e4117924af898587706bf46293"],
  ["studio", "540245f5c6c0f523e13b455cad9bcfc3c6d21cf96ca953ce1bbfa3d547345208"],
  ["terrace-row", "172aac3cd62b8ccbbdf2d58374fe0535e4657d1344f60c1c7cb825ae3e2a59b8"],
  ["themed", "3644012b9d972af8e0314ce0a210073cc0315127d38a5f6b35220b00c883aff8"],
  ["tiny-house", "63a784b0a353f2a0664dc710ca720364d3b246447972b5bda928c855ea0e18a8"],
  ["townhouse", "5ecbdea1fb6fbcdc18000019f09c8705d0f27fda0a37d34063568c829cbcb2b2"],
  ["transit-hall", "cc69ca4464febda4baee441c36b8c2a5f8b1b4b3f794b221ffa1261bb78a800e"],
  ["two-bed", "061698b483472d4cee3801c39a6e1f74070037d82c8ea7efa19906388f24a79a"],
  ["two-storey", "2d38f2f4fd0f50601b80262a37f843b96dc8558d80ea1bc16b2e4640f6288553"],
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
