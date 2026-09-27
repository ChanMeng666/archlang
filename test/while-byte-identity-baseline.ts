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
 */
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["examples/accessible.arch", "a8b70a680754e431524037dc3a936bba2ec7c0e2cba8df0c72a16f45e5d1e27b"],
  ["examples/aquarium.arch", "6c6d9056af7bae258c98888237bf3ddf2eee731b3531504bbc96f19af47f723c"],
  ["examples/attached.arch", "94ae2b6be5daaddcc1482ea054c78798296f3582dffe39e8dd59984ce0222f3c"],
  ["examples/bungalow.arch", "e16d39c709b94c5f86b326e447f8908ff9daf4397eca0defee1b8854a6ce9aeb"],
  ["examples/clinic.arch", "9f19793b4ed6d1013f93afae9dfa2dfd02026a5e015bcbba89c12bd83307ea83"],
  ["examples/courtyard-house.arch", "35dae90f257666e7b356ab03c2f92c1333ee85974a64043d532feeae34cc3433"],
  ["examples/furnished-flat.arch", "89da2da93c835cbd43199992ce8a664668c896eb5d8060c46ca0dc49e259a874"],
  ["examples/gallery-l.arch", "8904c16f3c22da4f2b82d7a257a02fe2a578494378524a00a62b7fd94a2afa87"],
  ["examples/garden-house.arch", "a702d7b2de9dfe2123ed3405d7a2b36aaa71b915ece8f4152b5c8191030cf747"],
  ["examples/garden-loft.arch", "cab7c29cafef21898fe9653e5a76179319d33e1df9371ca2dda3e668f9e99a7b"],
  ["examples/hexagon-pavilion.arch", "3230d0f4fb8ee5b24f5b6de4e00ae21906b056cad47c552330f8df670121b3c5"],
  ["examples/hillside-villa.arch", "6d922d9ca962194b13ee674d7329c89c47a895b869d45d29ee59c9cf7a28b2c0"],
  ["examples/imports.arch", "91665a5b909589c21001a2a7383c672e040b52031d9db513b0c37009063384e9"],
  ["examples/laneway-house.arch", "9a8d219e67c9f21890703071713332bb349229eab84fd1a8ade14b703ff7875f"],
  ["examples/library.arch", "d368114fd402b59c5a12df7f4270335043f045cd476c6565f52939ace7aa159d"],
  ["examples/materials.arch", "d9bece650072dc7b9f32903b144253c188b472b663ed697e69352165f6ec3f18"],
  ["examples/museum-wing.arch", "bcda3bd78b5082aa5e084987b6748ae3c6cba41fe30e28cc70b7dcbc3762af17"],
  ["examples/museum-wings.arch", "1c20a9f44b1ca61a579a620a4dd819e154637e9292e3522a333c91eb8c562ab9"],
  ["examples/museum.arch", "ed02dac55552d5f78e4e4dfdd54bf14dc50404861c15a1fa3ea916d7b192026b"],
  ["examples/one-room.arch", "1b4e455d3f64e83a7a8139fb5b4df88b358faf756a80befff46c255e731635a0"],
  ["examples/parametric.arch", "73a3a769c0ca490501672c1cfa894c3aa84bf03fc066c131908409e02dbb9fc7"],
  ["examples/relational.arch", "4563e746db1dbd428c1135d6cec80fff35aa21a760038a098834376e45ec17fb"],
  ["examples/studio.arch", "caff7bcd95ee0f378f3e2f764332d00002f3d9706435b4b9c9a48b4d02841f9f"],
  ["examples/terrace-row.arch", "27f04936fd39036584bd0713588f3f1296fa8af22df14ec912cf4d2f4a0694c8"],
  ["examples/themed.arch", "9395b6c8962d09e72701690c14ce8e12ef7ae1c9f65a1d4827d5f9734c1fcc4c"],
  ["examples/tiny-house.arch", "f10d5672954e9cf9b48bca3c3e81d27a18c15b310971241ae82389c6ae3cd199"],
  ["examples/townhouse.arch", "371b041ee1b1d24328ddb9e8b91fc4f41c5747f91cf2b3a8cc5e262f5c3cb73f"],
  ["examples/transit-hall.arch", "7775cdfb246959b1acd032585fc379656baa1715bd7d6b6e8b280d114dbb02a3"],
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
