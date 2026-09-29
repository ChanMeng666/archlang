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
 * and `describe --facts symmetry` can now say the pair is mirror-consistent. Field by field,
 * on the same compiler, before/after:
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
 */

/** SHA-256 over every storey's SVG + `describe()` + `lint()`, measured on `f4548db`. */
export const BASELINE: [string, string][] = [
  ["accessible", "5602b128c5e8df74a5d3d85b1eb5d1b8778c4dfa03eafd39c62cade55d472d4f"],
  ["aquarium", "1f9580316664684ca7ddddd22602e3677a054dd7e5d259dc6a66d11b6c62ab74"],
  ["attached", "c8a219486b2c76c2ba3ecb8649b29ce77a6fd732e03da5e14013a386c6e701b9"],
  ["bungalow", "4a5fbd670b2ed36a48309a4f76adf736f0b2fc1bb7dbfe1ea393de5496629245"],
  ["clinic", "28fd1cb7e889a199d5e014df771848567612f1e0a93a9355524a871961a11b43"],
  ["courtyard-house", "4e487e68dda210d7433cbb9b7f6fcff47d80bbd8156bb4c6bcd4bab8107a7ba2"],
  ["furnished-flat", "6bca2fc18883e3dd6278cc03e0aa7a334ad6c26e67563c578344a77731a0ec05"],
  ["gallery-l", "9cdfa47c8d0f0a1a1d1ecf998877ca4ed2b029289730c028065d9ca5f92af2f1"],
  ["garden-house", "c1bf4b90a714913d96e7c1b3f68bda03c8c93770cf5b04da510e150824d6d4ae"],
  ["garden-loft", "0273b238de6d7c0ad84f3d517febcec01338ebe9033fcfb9cbe06c8307389350"],
  ["hexagon-pavilion", "4466d7ca53036ebdeabfcbd35b1a6fca1b4d2b0a990a8fedfda675c5f45570e7"],
  ["hillside-villa", "846c4d6f70dd014bcd666cd7d2d8405d8003b8b6e40447389db87038edef5bd8"], // re-measured, see header
  ["imports", "65f847d3309cfb25274bf45d07b854c703061a666627cdab56984e8ed5b1bab4"],
  ["laneway-house", "0eab9c214b43f76765f55e10b0909047aaee34544fc5d78e27e4afc176b8e0d9"],
  ["library", "5300487bb693592fb244121e84fda89476d19c08732e9ce487e09a5967f52222"],
  ["materials", "5f9cad38f200ee41f25db60bf699ac18a67b7bebc4c07e84316a55a1da86357d"],
  ["museum-wing", "fa89497eceb8e2dc56faeb5b5b9ff29f91c5b21db68cc7895307870f5cce1eba"],
  ["museum-wings", "c9e6818aaac9b452130be0aa7b762a4bd2e4ca9c4eaa56125645f7cee0bf0bb1"], // re-measured, see header
  ["museum", "07f06548d662a7283d4d47136c1e4260662ba0d8115282dd98d1b87134188304"],
  ["one-room", "1a310fb617bfe42e9749d66bddac7b9eb417b843f2525c558f66e6ecb1177b33"],
  ["parametric", "e30cff0f2fb517d5b19723cef6092a9d614ae198a63fd96f7f1b23508ee2c0a3"],
  ["relational", "c3eab06b8184405f6c2a89edd04ce75ffbf97956cc0aa6d0d9780ad7495d6b7b"],
  ["studio", "90951a2517e141dfe28f0e12462fd29cefba5460c900304e435ef53e7f3c0f3f"],
  ["terrace-row", "09d36f9a91483ae6febf948aa5eb70fd9e7aad9f21aa6e0d0ab3550186a90721"], // re-measured, see header
  ["themed", "55e8723dd35cc3ec24b73a7bbf8052bea24f1fdaddd6d90012cffb81d7d00057"],
  ["tiny-house", "a2e03e5262814a5566deb23fedcfe493b053d98ae49026336c75f3cb1ec104b5"],
  ["townhouse", "c91ab67c8b8ec72005a53625775597a82b4c585c60e298aa0c8ed0f41b815a44"],
  ["transit-hall", "378d0e215a55e6e5ee66d017c3753f3f8e7b91c4509a7470872bc1cf02cf2f79"],
  ["two-bed", "dec746240dcc800c866a0dc928b451c83caa143f456adc704baa72d724ef6520"],
  ["two-storey", "0cb36d51c57dce8e31c883f5b100a6f6758e51f61f4b40325ca68f3b05e2cdec"],
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
  ["aquarium", "23cd27bb45079f977c89494898dba45b67338b26e845777b2c536c627e3d5c81"],
  ["attached", "ccfcf88d1703b8793fe062dffe347511426f45ed1ece2152f1ecb78ccf15e17f"],
  ["bungalow", "cc3dc56c65a9baa34f57ae766ad702b4e538db62419b4881c55ad84abfe39870"],
  ["clinic", "68f5145df6c36c66cd8d5411f79df440a3f31c97af6d6b98d1ca194a92d67c6d"],
  ["courtyard-house", "c25fbe81bcf795157ed5367f2b27edd34376ebc8f3714beeb21c1d279c265692"],
  ["furnished-flat", "9ec505138f1d6d817a55e45aef46c0145639f68d577cacf7214dc2b06cfb0dc9"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["garden-house", "8c5f672a9a30115e7b1175bc260f7e6b9ccbf80031db5545b5a63b11849f9653"],
  ["garden-loft", "fcfd3d6eff4014d553670aa6fbbbffb0cc07e42b8ac9a9664f374a3a6f75a20e"],
  ["hexagon-pavilion", "87bff82a7ce3a41971dd2fbee4f55046ee87b531139cbdb6857e6306562f7270"],
  ["hillside-villa", "9d7ec154a919af108cc7f38c18c6dfe300d7a3e0676d95d5ec7e6591230b9ce8"], // re-measured, see header
  ["imports", "25899f6f578488bbdfe9929a743ff2b64f85ba1e318f06b542865b5d7d4d8136"],
  ["laneway-house", "d3ab0140b1f474997ff52c711e9c539e92a23a6d65003b656f9b72b6a7ad0cca"],
  ["library", "9b2dd482372e3cf55392271121767d8318f6a1064b9ef6ff7482ffda14784a64"],
  ["materials", "b3469b47a19fffa653c9f13bf26583fe9c715206a29f500985f96a294fc1dffa"],
  ["museum-wing", "38e455e3ebe53d0d71344ace3e82aae2ad837014319fbac114e997fe202a9943"],
  ["museum-wings", "c209dde7f8c8ad936da4edafba7ea17d8f7761d2b04507aeb20e56453b2e9885"],
  ["museum", "7ec1245b5a9ae03f813436680f5bb750cc707631703b26e1ecf6f0c1d750d573"],
  ["one-room", "f0649bfd821eff989cc1beed233ad722eb4f2d3c3284ac4a8f74d5ea07ef306f"],
  ["parametric", "5783da773c0493767621e2c063e6da257c660dec2edb5351893f0ad4907afc3a"],
  ["relational", "d31bd84bfcb7bfce8d662470f8828144f55ef3e4117924af898587706bf46293"],
  ["studio", "7ed53b6e0925e21fe4c4fad7351ce7e80635818395fc79cf661ba095db8129b3"],
  ["terrace-row", "9f9636fed1e32e916db91c641ef0e5bb1703036ddb1460748f810dbcabe58726"],
  ["themed", "3644012b9d972af8e0314ce0a210073cc0315127d38a5f6b35220b00c883aff8"],
  ["tiny-house", "89f05cd969e28765d7c775022eed2a746c786e182b276f1ba5e8cd6f691c589c"],
  ["townhouse", "acc41b078993c7d1ab8bc0e402b2462ea02968fdb77420ff849658ac903dcbd0"],
  ["transit-hall", "520c6cf0902213c5b34380ca40e09d8c440f0316e12bfba2ca094418da399526"],
  ["two-bed", "c8e5a430665c6ea875a94225dc062a534bebf776c28b3ffbdb0a614d3e71ff79"],
  ["two-storey", "494341efa9edaa35f76d17b293023a87b9b1e68567d87b2e4445ebf9b6579f93"],
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
