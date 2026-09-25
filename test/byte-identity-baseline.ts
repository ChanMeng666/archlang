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
 * Both numbers were measured on `f4548db` — the tree `v1.34.0` shipped — by a script that
 * imported the digest bodies in `./byte-identity-digest.ts`, never a lookalike. See
 * `height-byte-identity.test.ts`'s header for why that matters and what to do if one moves.
 *
 * ## Every row still stands, including the one whose example now authors heights
 *
 * A shipped example gaining a `height` clause looks, at first, like a row that must be
 * retired: the plan's surfaces are no longer what `v1.34.0` measured, because `describe()`
 * grows a `heights` block and a `head`/`sill` on every opening. It is not. The row is
 * honoured against that plan's **height-free derivation** (`./height-free-source.ts`) —
 * the same file with its datum clauses mechanically removed — which is behaviourally the
 * text that shipped. So the measurement keeps its full force: nothing about the plan moved
 * except what authoring the datum is supposed to move, and no hash was re-measured or
 * re-typed to make room for the new example. {@link AUTHORS_HEIGHT} names the plans read
 * that way.
 *
 * ## The one row that WAS re-measured, and the class it exposed (2026-09-20)
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
 * Check (2) by diffing the two `lint()` payloads field by field, as
 * `docs/testing.md` describes; if the shift is not uniform, it is case (1) wearing case
 * (2)'s clothes. Only `hillside-villa` was affected here, because it is the one example
 * deliberately left with warnings — `aquarium` and `two-storey` had their prose edited in
 * the same branch and did not move, since a plan that lints clean has no spans to shift.
 *
 * ## Four drawing rows re-measured for issue #109 (2026-09-26); no summary row moved
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
 *     and they close the warning, so both plans lint exactly as `v1.34.0` did.
 *
 * Every other row was left alone, and the whole corpus was swept by SHA-256 over every
 * storey's SVG + `describe()` + `lint()` before and after, to show that nothing else moved.
 */

/** SHA-256 over every storey's SVG + `describe()` + `lint()`, measured on `f4548db`. */
export const BASELINE: [string, string][] = [
  ["accessible", "5602b128c5e8df74a5d3d85b1eb5d1b8778c4dfa03eafd39c62cade55d472d4f"],
  ["aquarium", "71abfea807ef37dd0f869cd426d2e95827de4693a6a813bc3aad22824a024078"],
  ["attached", "c8a219486b2c76c2ba3ecb8649b29ce77a6fd732e03da5e14013a386c6e701b9"],
  ["bungalow", "7dacd03e5c79772836ad273f9542c1272f881df27d8afd0dadef5ef558f8f3b2"],
  ["clinic", "28fd1cb7e889a199d5e014df771848567612f1e0a93a9355524a871961a11b43"],
  ["courtyard-house", "4e487e68dda210d7433cbb9b7f6fcff47d80bbd8156bb4c6bcd4bab8107a7ba2"],
  ["furnished-flat", "6bca2fc18883e3dd6278cc03e0aa7a334ad6c26e67563c578344a77731a0ec05"],
  ["gallery-l", "9cdfa47c8d0f0a1a1d1ecf998877ca4ed2b029289730c028065d9ca5f92af2f1"],
  ["garden-house", "2d9d6637b6d52802d9c03b09ddd33feaa35c565edf95f8d65e31a8ad15db7677"],
  ["garden-loft", "0273b238de6d7c0ad84f3d517febcec01338ebe9033fcfb9cbe06c8307389350"],
  ["hexagon-pavilion", "3bf51877721eb526f3533c38d47add4dcfa492f82e3773df3f18dfac46e2f25e"],
  ["hillside-villa", "0a52a08b20550d5887377a391ad5e842712167896e48a38960071d16e0cdc641"], // re-measured 2026-09-20, see header
  ["imports", "65f847d3309cfb25274bf45d07b854c703061a666627cdab56984e8ed5b1bab4"],
  ["laneway-house", "401f5a9e255e5748a2eda400569ad352ae856e1ad5c9f51b62895e30bfd5ad1f"],
  ["library", "c6cc5c95ab3d19aed79ccd37f0102ff42083c7542ce2ad2ed9fbc3507a825b7b"],
  ["materials", "9768adc292f64dc26ce2d11f193191344ecfdf09d271fa884a3caf7afe264e97"],
  ["museum-wing", "fa89497eceb8e2dc56faeb5b5b9ff29f91c5b21db68cc7895307870f5cce1eba"],
  ["museum-wings", "af09b101883586725bb0282948711b5aeb9767fa74d7fb9ea2a760fdf95c0dc7"],
  ["museum", "0b72cfb610d73c4292ca45af47dc73f5adb19b552573d9a306d5c420ba54b7a6"],
  ["one-room", "1a310fb617bfe42e9749d66bddac7b9eb417b843f2525c558f66e6ecb1177b33"],
  ["parametric", "2227a10cba690442987dc6dc9f7aa9af393a613432b6a7ea30d67d93eb736e82"],
  ["relational", "e6e1f0a6fb9589b3a6eaaa6491bd97620567d6fbdb35d162f25720e9da940b07"],
  ["studio", "90951a2517e141dfe28f0e12462fd29cefba5460c900304e435ef53e7f3c0f3f"],
  ["terrace-row", "83033a5111c86ea0c240de8173493c23afb1a947fa235d3bf768b8ef363e2df2"],
  ["themed", "55e8723dd35cc3ec24b73a7bbf8052bea24f1fdaddd6d90012cffb81d7d00057"],
  ["tiny-house", "a2e03e5262814a5566deb23fedcfe493b053d98ae49026336c75f3cb1ec104b5"],
  ["townhouse", "f3cccd631ffbfa4afbce7bba5cbd71e012fd33a0b28905e4b6d6eeb15c127ddd"],
  ["transit-hall", "2a8e7db037018704eee58b3f3312d8625a57c0a4563ab2a2d3abc1e78245bbfc"],
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
  ["aquarium", "45f491a88fa4d1f259d61005220264b0d217e245f482786c842300aa92e1cc6e"],
  ["attached", "ccfcf88d1703b8793fe062dffe347511426f45ed1ece2152f1ecb78ccf15e17f"],
  ["bungalow", "242307d21b82d129acb6317df03702d2044f0c8e05f9a78374c9de9a9f01f4fd"],
  ["clinic", "68f5145df6c36c66cd8d5411f79df440a3f31c97af6d6b98d1ca194a92d67c6d"],
  ["courtyard-house", "c25fbe81bcf795157ed5367f2b27edd34376ebc8f3714beeb21c1d279c265692"],
  ["furnished-flat", "9ec505138f1d6d817a55e45aef46c0145639f68d577cacf7214dc2b06cfb0dc9"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["garden-house", "320b6d0aa637b941ccfd7705df4cd77ef76e8994e3ec07e04ecbb595014a2174"],
  ["garden-loft", "fcfd3d6eff4014d553670aa6fbbbffb0cc07e42b8ac9a9664f374a3a6f75a20e"],
  ["hexagon-pavilion", "da4ae66c401e5ce77b0a35a9cb4d75ae3af19a31d49be76608923454584ffbdf"],
  ["hillside-villa", "b1172a3d3a9f2b27deccdd7513da707547fa6c8b299239ae6e35e5574e6ad27a"], // re-measured 2026-09-20, see header
  ["imports", "25899f6f578488bbdfe9929a743ff2b64f85ba1e318f06b542865b5d7d4d8136"],
  ["laneway-house", "bde186c2290e5aa19ea60c3ec9e8ad7cfa3f5237e7d2a0a80cdca393fa3ab85a"],
  ["library", "e1daef38bb73cd65cd723bf45d52f407a3a0412759cf34dd37cc6cb0d5503d39"],
  ["materials", "648012dc07c11a37974ff86dd38f5bcf65da3d6acf00b88cfd7c6beeef4c9459"],
  ["museum-wing", "38e455e3ebe53d0d71344ace3e82aae2ad837014319fbac114e997fe202a9943"],
  ["museum-wings", "80926b17ced4ee7f7e138ed7307a9205958088a99cf086c8e87f9686c2dd21b0"],
  ["museum", "8d1e029b936bcbbbfb2007a1fb8b0ea681d2b54e563f3c916093955944258fa3"],
  ["one-room", "f0649bfd821eff989cc1beed233ad722eb4f2d3c3284ac4a8f74d5ea07ef306f"],
  ["parametric", "b6249826e5bf7896b601daaa354fb8cdd2e2cf65785778a0267869c530d3e03e"],
  ["relational", "1011260beda141af5f99716609f12d5a9a6be8a81466ed14760e6924025c0ad4"],
  ["studio", "7ed53b6e0925e21fe4c4fad7351ce7e80635818395fc79cf661ba095db8129b3"],
  ["terrace-row", "d7ab0659605d4b76c4388c63a7255e26c0f85ed072ede197f29dd8e194f01cc4"],
  ["themed", "3644012b9d972af8e0314ce0a210073cc0315127d38a5f6b35220b00c883aff8"],
  ["tiny-house", "89f05cd969e28765d7c775022eed2a746c786e182b276f1ba5e8cd6f691c589c"],
  ["townhouse", "a3a867c4803762ba8debd5fe4a72a34914ea3bcaaffa3fca129fedbfa9c0a6aa"],
  ["transit-hall", "96513787744653538698e672aee582972d517c2787b446312c4dd8c6b0d084a7"],
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
