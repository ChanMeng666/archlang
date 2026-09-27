/**
 * The measured baseline for `test/while-byte-identity.test.ts` — M3 of the W7 red-team
 * verdict: no test pinned the byte-identity law for `compile().diagnostics` itself, only
 * for SVG/`describe()`/`lint()` (which a PARSE-stage diagnostic never reaches).
 *
 * Every row is `allStoreysDigestWithDiagnostics(API, src, { world })` from
 * `./byte-identity-digest.ts`, taken with the test's own digest body (never a lookalike;
 * see that module's header for why this split exists) over the whole corpus: every
 * shipped `examples/*.arch` plus every `test/fixtures/*.arch`. None of these plans uses
 * `while` or a bare reassignment, so the measurement is the same on the tree before W7
 * existed and after — proved directly, not merely argued, by an ad-hoc before/after sweep
 * against `feat/algebra` (0 files moved) as part of this change.
 *
 * `terrace-row` re-measured after W5b (merged in `566f2d3`; commit `54d8b18` re-measured
 * its own goldens): mirrored units' sliding doors now take the correct track — SVG only;
 * describe/lint/diagnostics unchanged.
 *
 * Fourteen example rows re-measured for W3b's circulation changes, with this test's own
 * digest body. In every one the SVG, `lint()` and `compile().diagnostics` are byte-identical
 * (swept per storey before and after on the same tree); only `describe().circulation` moved
 * (field by field in `./byte-identity-baseline.ts`, "Fourteen rows re-measured"). No fixture
 * row moved.
 *   - `bungalow`, `garden-house`, `hillside-villa`, `laneway-house`, `materials`, `museum`,
 *     `museum-wings`, `parametric`, `terrace-row`, `townhouse`, `transit-hall`: each has
 *     several entrances, and every room now walks from its NEAREST one (backlog G.5);
 *   - `library`: the same, plus r_reading 25500 → 25400 from the snapped relative frame;
 *   - `aquarium`: rotunda_r detour 1.01 → 1, the snapped relative frame (translation
 *     invariance);
 *   - `hexagon-pavilion`: rotunda walk 5800 → 5700, the snapped relative frame.
 */
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["examples/accessible.arch", "a8b70a680754e431524037dc3a936bba2ec7c0e2cba8df0c72a16f45e5d1e27b"],
  ["examples/aquarium.arch", "dd5f77a7f53548cc4d5e7261f3059c81a7b0bd28e33f7a2a969c3babedf9100b"],
  ["examples/attached.arch", "94ae2b6be5daaddcc1482ea054c78798296f3582dffe39e8dd59984ce0222f3c"],
  ["examples/bungalow.arch", "12e2b2e18249e8527a419cc78e1e5355ac8e22165ce0f09f714c5f6ad05f2640"],
  ["examples/clinic.arch", "9f19793b4ed6d1013f93afae9dfa2dfd02026a5e015bcbba89c12bd83307ea83"],
  ["examples/courtyard-house.arch", "35dae90f257666e7b356ab03c2f92c1333ee85974a64043d532feeae34cc3433"],
  ["examples/furnished-flat.arch", "89da2da93c835cbd43199992ce8a664668c896eb5d8060c46ca0dc49e259a874"],
  ["examples/gallery-l.arch", "8904c16f3c22da4f2b82d7a257a02fe2a578494378524a00a62b7fd94a2afa87"],
  ["examples/garden-house.arch", "505aa382436742a62d469b9cae616b2d149380c305b9ae2c8472efd18619da04"],
  ["examples/garden-loft.arch", "cab7c29cafef21898fe9653e5a76179319d33e1df9371ca2dda3e668f9e99a7b"],
  ["examples/hexagon-pavilion.arch", "c94153a876553ea9825eae8fde9f8ffb48254d871b985e94f50d4f25fc06cd06"],
  ["examples/hillside-villa.arch", "e16c5ec6dd510ddc87db50727f620af58e5ce6dec2d90a226f38f75180b86377"],
  ["examples/imports.arch", "91665a5b909589c21001a2a7383c672e040b52031d9db513b0c37009063384e9"],
  ["examples/laneway-house.arch", "88e02d50099df52b908a7a602955441c1b40bd603cea8659c59becc600335a05"],
  ["examples/library.arch", "1ffc81af5b0e707af1d0c8e18502acea95cc8464234d48e5415e4c7490c99a03"],
  ["examples/materials.arch", "618b6ce2d9036c654b9c9cdf28f73c43417cb20f2a4cc70cea6b618f979b1d43"],
  ["examples/museum-wing.arch", "bcda3bd78b5082aa5e084987b6748ae3c6cba41fe30e28cc70b7dcbc3762af17"],
  ["examples/museum-wings.arch", "82a0b3a4c478efefb2c43cf5018d14c78e86602d51c367cce95b59f102ff3838"],
  ["examples/museum.arch", "afc31f3ca38ea93b1ff3031a7f89cc3bdf15c6255be5987569f427bcbaaa5fea"],
  ["examples/one-room.arch", "1b4e455d3f64e83a7a8139fb5b4df88b358faf756a80befff46c255e731635a0"],
  ["examples/parametric.arch", "963fd4b30b77d52f0367492e8e7ff13eabb08c9f709fd2100aba7eb67764ca63"],
  ["examples/relational.arch", "4563e746db1dbd428c1135d6cec80fff35aa21a760038a098834376e45ec17fb"],
  ["examples/studio.arch", "caff7bcd95ee0f378f3e2f764332d00002f3d9706435b4b9c9a48b4d02841f9f"],
  ["examples/terrace-row.arch", "a88f753ca9f5b241bc536acefa26b748371a048a87bda1919f9a369e0efff902"],
  ["examples/themed.arch", "9395b6c8962d09e72701690c14ce8e12ef7ae1c9f65a1d4827d5f9734c1fcc4c"],
  ["examples/tiny-house.arch", "f10d5672954e9cf9b48bca3c3e81d27a18c15b310971241ae82389c6ae3cd199"],
  ["examples/townhouse.arch", "aea406a832507a5f2a78bcc04107b19b11817cbc6bf41460cd48078b9b392c34"],
  ["examples/transit-hall.arch", "233e5b99547a81ce85728d5da7bb81be1777de27d998c08e69fa17800acf0e1d"],
  ["examples/two-bed.arch", "ae1500f3711ee2caf9551ff46883b21f993cc9284e5d2ff3cbbfcf0ba0bec947"],
  ["examples/two-storey.arch", "30409b71b07cd534ce2223f46e4ea1ad9a9db43f7179c4198dc54f4b8e34dd10"],
  ["test/fixtures/axes-grid.arch", "392def55168a0672ecddda8e47deebc5be6289ce8db230fbf1dc7fe315e077ac"],
  ["test/fixtures/dense-bays.arch", "22f98cc0f66e94a5db73bd40f2ba111da74740976f5255f1f978467760828de3"],
  ["test/fixtures/diff-a.arch", "1df5ea19907127485872bd11c488eb5747e17ab3bd55051a0a69c7221394b24a"],
  ["test/fixtures/diff-b.arch", "6145ecc0ccbfa94fa78fb31d6eabca8d89194ca92290361ca52e37c572e468d8"],
  ["test/fixtures/diff-circ-a.arch", "fe9c2244a86afcc31558780efd0486ad07fd7c5ca73782da8995e2ce06f456fc"],
  ["test/fixtures/diff-circ-b.arch", "4f166d45197b41b42585324eda1cf2cea329beeddc6731036240214bb2d26708"],
  ["test/fixtures/schedule-sheet.arch", "87b0599a57b6df143daf9f593a4099c0cb19fb230b36aabe93cf37bef15c4fff"],
  ["test/fixtures/zones-levels.arch", "73386d89afe78ed066d395979141521f6b9d7ca42ee883c42cd8c7bbc7db884b"],
  ["test/fixtures/zones-wings.arch", "887c24283b921f4f86d91efa26d64b25dd1a696b2c79d20c757ede924acd0220"],
];
