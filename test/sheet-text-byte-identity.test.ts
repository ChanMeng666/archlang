/**
 * `sheet text { … }` (issue #403): the byte-identity law.
 *
 * A plan that does not write the block resolves, draws, describes and lints exactly as before, down
 * to its Scene and the steps its resolution spends, in the accessibility profile and on the circulation
 * overlay too. Each digest is {@link stairLawDigest}, the widest law body the repository has
 * (`test/helpers/block-stair-law.ts`), **measured against `src/` at `3f3060a3`** (`main` before the form),
 * that tree extracted by `git archive`, the body and the rows imported from this branch and handed
 * that tree's compiler. The rows are every plan the block-stair law pins, then
 * {@link SHEET_INLINE_ROWS}: the word `sheet` as the names it has always been, every table, a
 * fractional number at each site that prints one, and the block's near misses.
 *
 * In this table the digest comes first, for the reason the block-stair law's does: a row keyed by a
 * path holding `access` is the shape the secret scanner reads as a credential.
 *
 * Why the rows hold: a plan with no block gets {@link PLAIN_SHEET_TEXT}, whose `word` returns the English
 * each site held as a literal, whose `num` is the identity and whose `mm` is `fmt2` itself. No optional
 * field joins the Scene, the chrome or the render context unless the block is written, and a column
 * reads `Math.max` only for a word the plan wrote, so no float operation moves. Nothing is evaluated, so no
 * step is charged. No row's parse error moves: `sheet` is read only when the word `text` and `{` follow
 * it. The block itself inside a `level` writes the form, so it is no row here; its refusal is pinned in
 * `test/sheet-text.test.ts`. Its near misses in a `level` are, and they measure the digest it did.
 *
 * `test/fixtures/sheet-text/sheet-text.arch` writes the form. It stands in a folder of its own because
 * the corpus tables read `test/fixtures` flat and each pins a plan that does not use it, and the premise
 * test below holds it to the form.
 *
 * A digest moving is a finding to explain before it is a diff to re-measure.
 *
 * Re-measured for CO.1 (RM-D56): `against` with no `size` now reports a footprint the `grid`
 * snapped (`W_GRID_SNAPPED`, "catalogued size"). Two kinds of row moved, each proven before it was
 * re-taken by a scratch script that runs this suite's own digest body (the PR states the method and
 * its output). A plan that relies on the snap (`test/walls-from-rooms/two-bed.arch` and its table
 * twin) moved by the added entries only: its source as `main` has it, through this branch's
 * compiler, with exactly those entries removed from `compile().diagnostics` and
 * `describe().diagnostics` and the 64 steps (`DIAGNOSTIC_STEPS`) each one charged taken back,
 * reproduces the old digest; SVG and `lint()` did not move. The examples that relied on it now write
 * the snapped size out (RM-D56 condition 3: warning-free, the drawing unchanged); their rows moved by
 * the inserted bytes alone: with every span mapped back across the inserted `size` clauses
 * and the step count `main` measured put back (a written size costs 2 steps), the old digest returns.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 26 digests, of the
 * 26 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 *
 * re-measured by AF7 (#977): only added related notes; strip==old proven (RM-D69; the check is the
 * `AF7_MAIN` test below, through `test/helpers/af7-notes.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { af7StrippedApi } from "./helpers/af7-notes.js";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD, type World } from "../src/world.js";
import { type StairLawApi, stairLawDigest, stairLawRows } from "./helpers/block-stair-law.js";
import { ROOT } from "./helpers/rectilinear-rooms-law.js";
import { everyWord, SHEET_INLINE_ROWS } from "./tables/sheet-text-plans.js";

const stepsOf = (src: string, world: World | undefined): number => {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const w = world ?? NULL_WORLD;
  return evaluationSteps(resolveAll(link(ast, w, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, w));
};

const API: StairLawApi = {
  compile,
  describe,
  lint,
  stepsOf,
  lintA11y: (src, world) => lint(src, { ...(world ? { world } : {}), profile: "accessibility-advisory" }),
  overlaySvgs(src, world) {
    const o = compile(src, { noCache: true, overlays: ["circulation"], ...(world ? { world } : {}) });
    return o.pages ? o.pages.map((p) => p.svg) : [o.svg];
  },
};

const FIXTURE = "test/fixtures/sheet-text/sheet-text.arch";
const ROWS = [...stairLawRows(ROOT), ...SHEET_INLINE_ROWS];
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** Does a source write the form? Read off the parse. */
const writesTheBlock = (src: string): boolean => parse(src, BUILTIN_REGISTRY).plan?.sheetText !== undefined;

/** Measured at `3f3060a3` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["e33e9923337208c91bf7093a0fa63040f132db455f3e3e85d584740a18a8f611", "examples/accessible.arch"],
  ["3471b341d64b36f8ebd0d3786f07d8a912f610d324eaea35d938375e9c647d1f", "examples/aquarium.arch"],
  ["90680592ce7aef9b99598ec8e547044bedf53cebf2edbf890d7fac8db64763ef", "examples/attached.arch"],
  ["199a5fd1b547984cb93e2302d7d896516c3ab4ebb5b09266f5d78c1f24480cee", "examples/bungalow.arch"], // CV13 (was 6f42bf9e): example source edited (chairs added)
  ["4f7bf7282832cdf101db083d17d436221eeb0ac7002d0289e20ce3a7864da163", "examples/classroom-block.arch"],
  ["b6cd385c2dd3c10ad400acb22f9147c2f308a6e7c2e5657f90ec692b35f251d5", "examples/clinic.arch"],
  ["eaa167d41d7272aaae9866cfd38f24392fb9cb768640f0c8efb0d13cb5fac7b0", "examples/corner-cafe.arch"],
  ["c6b64e3fa5815d6b9cbeb2e272f64c23d973fbb059c83ea6e57cc41d9b7195f2", "examples/courtyard-family.arch"], // new example (RM8.5, the courtyard-family showcase); CO.1: the example writes its snapped `against` size out (+14 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was 64e5593c)
  ["5f557f7ac891e6d732cbcc24ac46b5b337beda47a890eba2528dc8998f8e1efb", "examples/courtyard-house.arch"], // CV13 (was e9866c6c): example source edited (chairs added)
  ["fcb5a98c9bf892177daef2174831cb56be4314d6c9ac66526b1046cd6618438b", "examples/furnished-flat.arch"],
  ["5ebdd5ec17e7e29eeab8413c31506ebca7b1afc26168d4455e29ddf45d4f65a5", "examples/gallery-l.arch"],
  ["6b0d83c3fb0f9404d411550ed3454f988c19ab8bac61fe7cd84108b35caa51b0", "examples/garden-house.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; CO.1: the example writes its 2 snapped `against` sizes out (+26 bytes), so only spans and the steps of the written clauses (+8) moved; see the header (was dd673d71); RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 6d595522)
  ["8be510d3825258cde0ae8e0030e44a2b76be0741860e9cc20da7720e5648586a", "examples/garden-loft.arch"], // CV13 (was e9080ba7): example source edited (chairs added)
  ["45e2de363cdbe22f1ab55d40d968083c2181571320c028f78443aa65e80a2558", "examples/hexagon-pavilion.arch"], // CV13 (was 6544b4c8): example source edited (chairs added)
  ["7f4fd7877b03b9680b0c066c87ab416a9644b01f8412f0032113e8b809e77aac", "examples/hillside-villa.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; CO.1: the example writes its 3 snapped `against` sizes out (+40 bytes), so only spans and the steps of the written clauses (+12) moved; see the header (was 6a0a3529); RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was c9f89e9a)
  ["943cb8dbb7c0438d4f7d62160dafba83a6861b912a5c8cbf70db47e11ec80be7", "examples/imports.arch"],
  ["5ab98e5edbb819a917045eeeec6448af5fbb7d08837f644769b75274e744fbc8", "examples/knob-flat.arch"], // new example (P4, the knobs example), as in ./block-stair-byte-identity.test.ts
  ["d454b14329c3e568cb56b2f00143521457a1c90a2095ce46aca979651e5091a9", "examples/laneway-house.arch"], // CV13 (was 9613d624): example source edited (chairs added)
  ["84bf35da4ec0c7f7bd5d522951d07a34e0d69f870fa86a6cacc2b24ebf5a67b8", "examples/library.arch"],
  ["cff60bd4ed0f2ed238f0837b5d0a51193d69f1cc46956891b8b5af3db846c21f", "examples/materials.arch"],
  ["289fb16b2c4e880275b772afb4a730decc12702d72cb286b0fcd7ac97579be97", "examples/museum-wing.arch"],
  ["e19d0a54eaff1473ea28e9df9fb6cf32702ab4db9246f8e038b08de75664eded", "examples/museum-wings.arch"],
  ["0f549bd3d2930499c44d51e69f59c3eb20b22b37beda342703d91b6962d81e74", "examples/museum.arch"], // CO.1: the example writes its 5 snapped `against` sizes out (+65 bytes), so only spans and the steps of the written clauses (+10) moved; see the header (was 8acbd708)
  ["232be7cd74316c370773ffc6c75d17076cbffdd4ba37df3a9b3c3cf3c3b9a6c2", "examples/one-room.arch"],
  ["3db8c2ad95fdbed22f538d47519d500e27e08e5a600dfbe18292ed99ff24b169", "examples/parametric.arch"],
  ["ca028af82667a10d0dd44ed37f9a7f708f5ee8be4b82154d0e1d81397f353754", "examples/practice-office.arch"],
  ["02918cde41f10b126dee8f4a0a847c25168eead83c4be59553b88acabb47bd00", "examples/relational.arch"],
  ["478656af7841418f829fad4541e079203df12d9afc77e74a00a3500e42e6748b", "examples/remodel.arch"], // CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was a4a2014e); CV13 (was 0e04f3b7): example source edited (chairs added)
  ["76ddb8d12efbead64517024344615685c65b65652b9ab457851117796db72f6d", "examples/sheet-notes.arch"],
  ["f6a6a81fa57cd5183bfbb7c607bdb9599ddf2eebfbc657c0cc4e69c7c0bcae7a", "examples/studio.arch"],
  ["4cf26b4a1904c5041ee1f653efbbf549f487e90af5bed197628d93fe5bdd55ce", "examples/terrace-row.arch"], // CV08 (was bd6056a8): example source edited (sofa turned to face the room)
  ["503b89ecf0ca78f6c1100f1fd059c0b63080a9bdb3b9401c675c74971816cd21", "examples/themed.arch"],
  ["1a78c5532e6c4bb783da712f6f27c83f5c771765278ec8552940d4f73e32beaa", "examples/tiny-house.arch"],
  ["a45a94dfe137be6cf35965d9b5b8c0e9f64eb6da40894da4e0a3065d8e7e640e", "examples/townhouse.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was efcb311a): example source edited (chairs added); CV08 (was 8643a4e3): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was b217f543)
  ["0fd9ba46a50b7e9438b7f3be5472c52c44a58219a29f22b493f3bd653766a971", "examples/transit-hall.arch"],
  ["6fa4bd1d0de5cc6aa3bc3434687929ece4ac4052356462caecb5e55109480d6a", "examples/two-bed.arch"], // CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was f220acec); CV13 (was ea10c4f2): example source edited (chairs added)
  ["9c3489d30cb4bcdea2d3ef3272820bba64eee730f4123585e19f4be3a440ccf3", "examples/two-storey.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["429d048d147ff95c56bf15fe655fb6a2e7870b21b111d82109e7d9fbc25a8655", "test/fixtures/axes-grid.arch"],
  ["8b201a108d4f8cf901579b200c92b809000d77b9550cda3e092994c09fbba1d5", "test/fixtures/chain30.arch"],
  ["c08051d0ac804cb6ddbc6d6a073934ce248aab2951f1b3bcbb05e242ec1f4c22", "test/fixtures/dense-bays.arch"],
  ["de027848fab78289ef71ea7217c535307fa9dde6d1909420ffc85596f56dd1f6", "test/fixtures/dense-office.arch"], // AL6: a new row; E.18 (was d3a5dfbb), see ./byte-identity-baseline.ts
  ["b9215930403c72e737b6486d949354fc8162cf96ec5d53897edfab5f21835e4f", "test/fixtures/diff-a.arch"],
  ["cc20d6821e47c1a45a5c0b94d86a15eda2e2e684a66c096c06ef8071b21bf20b", "test/fixtures/diff-b.arch"],
  ["035414348be6c178ae7688e584bf7e8ff4e43461e2d70c40894682db0347acd2", "test/fixtures/diff-circ-a.arch"],
  ["f10e71740b3325be957d2e1c2bc467796b6a2ea700533714fba2e8c5539421f3", "test/fixtures/diff-circ-b.arch"],
  ["d2e33f0f08e06930824942bb36faf1a439459483a3335cd78063e3ef51b021b6", "test/fixtures/lock-before.arch"],
  ["a5b010590ff37b31382b353c37001f3541ef26e5f9c8bd531f2121dd1a9d4fa2", "test/fixtures/lock-partition-moved.arch"],
  ["bfe79454671a15f63522c0a770453a819328df15f90b01154d028f5161350046", "test/fixtures/lock-window-moved.arch"],
  ["c80e318bf3434440c98e5c1053396ec945bd717a91c54a79497954cd03f2d820", "test/fixtures/off-path-bypass.arch"], // RM1.4: the unknown-furniture search is charged to the step meter (+29 steps: `cabinet`, 234 -> 263) (was ff686ab3); AF9 (was d340196f): `W_DOORWAY_BLOCKED` on d_d gains a maybe-incorrect move to `at 1570` (its position alone) in lint() (both profiles); SVG, describe(), the diagnostics and the steps are unchanged, and with that fix taken out the old digest returns
  ["2a9bdda5124d6cc976419991440ccccedb9ee1bcbcba18da2098319f271fe1f3", "test/fixtures/schedule-sheet.arch"],
  ["ac6b7954d2cefaa2461c5e8111d1004603b931ef133597f0971e07db78c6dd42", "test/fixtures/star30.arch"],
  ["143ddd7bfd82d51b4527ba8607803a99e38c4f1bd4997d9cf8acf95fb216e29d", "test/fixtures/storeys-eaves-overflow.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  // was 3d10dfea. D27, the digest every law on `main` pins: this plan's stair stands in no wall, so `bounds()`
  // reaching its break line widens the drawing 156 mm. No `sheet text` moved it: the form's rows stay as measured.
  ["5febcfb91b9a3e7bc23705df313a0ac218fb64f35aae5a19b607b313ddca79fb", "test/fixtures/zones-levels.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["ee9f057b82b717e4b7c0753daef62a2baa9b3df5c5d8aa617079c3dedce0081e", "test/fixtures/zones-wings.arch"],
  ["61565f3850374e2db98b80a12890579d8899928f2e32c7ddc45fb5b43169f7c9", "test/walls-from-rooms/relational.arch"], // AF9 (was edc62a57): under `accessibility-advisory` (a 450 mm landing) `W_DOORWAY_BLOCKED` gains a maybe-incorrect move of the door; SVG, describe(), the diagnostics, the default lint() and the steps are unchanged, and with that fix taken out the old digest returns
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "test/walls-from-rooms/studio.arch"],
  ["ede95165106807f3d77fd531424fea9645eaedddf4078c98907567eb5aba5cdd", "test/walls-from-rooms/two-bed.arch"], // RM1.4: snapping is now reported (this test plan's 850x2000 sofa and 450x600 basin under grid 100 raise W_GRID_SNAPPED; steps 629 -> 757, +128 = two DIAGNOSTIC_STEPS) (was 73d42f0e); CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was cd33c0b4); CV13 (was 4a1ab38e): twin source edited (the two chairs examples/two-bed gained)
  [
    "ef6b4cf52454c07cdd3c22449f6545da111fb35e7f1085d1ec15cd8c94903e4b",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "test/walls-from-rooms/widen.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "plans:studio-twin"],
  ["ede95165106807f3d77fd531424fea9645eaedddf4078c98907567eb5aba5cdd", "plans:two-bed-twin"], // RM1.4: snapping is now reported (this test plan's 850x2000 sofa and 450x600 basin under grid 100 raise W_GRID_SNAPPED; steps 629 -> 757, +128 = two DIAGNOSTIC_STEPS) (was 73d42f0e); CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was cd33c0b4); CV13 (was 4a1ab38e): twin source edited (the two chairs examples/two-bed gained)
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "plans:widen-4000"],
  ["f472897ea01f13b118a0efeb189ffce7083a9629f880d9a6b9b267ad7becb10e", "plans:widen-4500"],
  ["ebc0bb540123325ca7eb8fe4fe12a3e5aa76c78cd6d451cb6a235118c92bba7a", "plans:courtyard"],
  ["bc452991d3ed362cdc36ff1f97938f1c917a9503f05c40ebdb286484a85f7034", "plans:void-hole"],
  ["01402210432235dd8c87a3b8f9ffff66d1839272a5fb649b181c91d9ea87cf5b", "plans:instances"],
  ["27fd4888416deb84501c64dc2d2ebad10776ac3f5c53e780e5eea8f2f0a4f05c", "plans:coexist"],
  ["7be9dcaea4b587b54406854ef539cadc05716ccb4433818abac8a9b4ba18815d", "plans:refused"], // AF7 (RM-D69): only added related notes (was f48b445c, AF7_MAIN)
  ["3242407cca3e68167000ae30159a28d3f1d87f74a911adaed34c5458100f5d78", "plans:open-plan"],
  ["51d28947008155d90908b371a8900b873d87ab9a0fc785479df6f179b94b0e87", "plans:open-width"],
  ["fc878a600854ad99f69ecf8577176006056f301a90106de53452b97da71bd4a5", "plans:open-instances"],
  ["5c13261d26b3e823caca5be0039c06c3b20432086d11afc430f89fc1e2cd2fc4", "plans:clauses-refused"],
  ["f3b8b7573cd4fcbdd03d921ba487613cc43b5b203923d4301cc0be5d4a8d88d2", "inline:issue-hybrid"],
  ["fe5d6778a14fabccdaff0138b49e0c7fe9b8850007ca1ed6f4f0d7629abc1e5e", "inline:typed-walls"],
  ["e140a63b3c5a19f2abfaf470afccbdbdbdf1acccea6da3f7cf0ea52e86d0aacc", "inline:except-slanted"],
  ["6e4367336a461f79b8927cdb2671f2571c0d5e029ca95b26448cf70bd39eb058", "inline:clauses"],
  ["ffcbcbe475c12edbcf2713a4449a06d4eed619f415d3d08ea57428e3cea4bca9", "inline:door-beside-excepted-L"],
  ["9a461091afe9fe608b6f1ad40d02a6a366df5884bf1af8b178b1d03c4011b40b", "inline:door-positions"],
  ["b5fc44cd1e1965550c229a17a86e73cbd08d8e1fabf53659616c7a5b1ef7eacd", "inline:door-refusals"], // AF2 (was b699986d): `E_LAYOUT_REF` on room e is spanned on its unknown id `nowhere`, not the statement, and the search for a near room id charges 8 steps (1027 -> 1035); SVG, lint() and every other diagnostic are unchanged, and main's span and steps put back give b699986d; AF9 (was 49ed81b6): `E_OPENING_DATUM` on d4 (no position) and d5 (`at 800`, no datum) gains a has-placeholders fix and `E_OPENING_NIB` on d7 a maybe-incorrect move to `at 600 from start`, in `compile().diagnostics` and `describe().diagnostics`, and the refusal paths' search charges 49 steps (1035 -> 1084); SVG, lint(), every message and hint are unchanged, and with those fixes taken out and main's steps put back the old digest returns
  [
    "c393511a4734b76c5a878d1666ab6e36e638b84abcc963a6e01c97a2bbe1b97e",
    "test/defect-corpus/stair-safety/door-onto-flank.arch",
  ],
  [
    "d64569da6d1db9f929e9a2164d34dbb736834618f7015e133e7a43c382efa0b3",
    "test/defect-corpus/stair-safety/door-onto-flank.clean.arch",
  ],
  [
    "b49e58a3092725aa80cf671745015ede1f89b50385746ea9f802088db8ad178b",
    "test/defect-corpus/stair-safety/foot-against-partition.arch",
  ],
  [
    "8c03e89267d1e817ce5fc03f39e165b19e98047928ae9acb9fd0f0aba58a67e7",
    "test/defect-corpus/stair-safety/foot-against-partition.clean.arch",
  ],
  [
    "eb907cc8fc65e290cf295b2ab564a75a4f306aa906b9c59bf6e0605b3c7b96e3",
    "test/defect-corpus/stair-safety/furniture-on-flight.arch",
  ],
  [
    "3da79477b1e625bd59f30ae59161e47fa8b8bc14f52038c4c71695678168a339",
    "test/defect-corpus/stair-safety/furniture-on-flight.clean.arch",
  ],
  [
    "4984bbc69c19fa28b5014aafb541adea69473a5116322bbb4fe27de63618adec",
    "test/defect-corpus/stair-safety/furniture-on-landing.arch",
  ],
  [
    "892e49d33f5b0767a0b82a82bae643359c61f2edcf3cae8e4e2ecf56941fb583",
    "test/defect-corpus/stair-safety/furniture-on-landing.clean.arch",
  ],
  [
    "684112f5fbdd7d76fa8d49d582afc896b190fbeb2e2789f86741d04d59805e12", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was a823dc72)
    "test/defect-corpus/stair-safety/head-against-wall.arch",
  ],
  [
    "cdb6141343bd6772db5b3f10704d68a96fe0e211dc96a3b6be88b5dbed74f539", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 7f034ceb)
    "test/defect-corpus/stair-safety/head-against-wall.clean.arch",
  ],
  [
    "62fd398e42233b810b79c42cf5b89b18077112dcf2f8f02dccc6e79f36bde2a1", // RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 353f6241)
    "test/defect-corpus/stair-safety/riser-too-high.arch",
  ],
  [
    "7ed8985efc55a72d7f84f4c79ca0dc80a2469233247681627542a663749278ef", // RM1.2a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 1fe18c7d)
    "test/defect-corpus/stair-safety/riser-too-high.clean.arch",
  ],
  [
    "93b8b328d4e5e97d6beef8c89335ef863c22c7b757d9d2a632740c96b4141087", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 4c04ddec)
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.arch",
  ],
  [
    "8169fd8dffb63bdd46daa0a42ca76646b2920720aed4c1698a167d109ecac598", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was ef8de37a)
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.clean.arch",
  ],
  [
    "548d00e050ad8c906e80de160526a664ba99dc11cb7a59994ac12cac3be715d6", // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 0f46a66f)
    "test/defect-corpus/stair-safety/stair-too-steep.arch",
  ],
  [
    "5d44365d2a3611fa8ba680986e126dbb11542b2d7d794ebb68aa8c8f58e8babf", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 7c6caa77)
    "test/defect-corpus/stair-safety/stair-too-steep.clean.arch",
  ],
  [
    "8f2476a7993174cdcffb0e09e6b48f3250a1f623b5b5e1ffebb78db2c107fdc7",
    "test/defect-corpus/stair-safety/swing-at-stair-foot.arch",
  ],
  [
    "735dbe2437261f0e5cc0601a2659aa71ea24456de46ff0c6f789625ae797d832",
    "test/defect-corpus/stair-safety/swing-at-stair-foot.clean.arch",
  ],
  [
    "c3caa0da7fc722d0c89e4dc8efce209f2d7fd1601b5fe699583160476dbada74",
    "test/defect-corpus/stair-safety/swing-over-stair.arch",
  ],
  [
    "c287517c9bf8141d08555ff1e4c1534fa43e00aa640948501dc2fffe41fe5e58",
    "test/defect-corpus/stair-safety/swing-over-stair.clean.arch",
  ],
  [
    "d290dcee45f5619daca37dd791816d20dd904917fecf53f180846674437c3b4b", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 444444d9)
    "test/defect-corpus/stair-safety/void-at-stair-head.arch",
  ],
  [
    "ef258a64d1873a3e60e30b7b93389fd745854adc657e00b2fd33705863c5e55a", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: the twin draws its void as the stairwell (was 4d4bfb32)
    "test/defect-corpus/stair-safety/void-at-stair-head.clean.arch",
  ],
  ["803382568b44d2abe330873b5b788636b5dae38beea8416ea9da39a9fb3a12ab", "inline:stair-words-as-names"],
  ["f1497554533ffa39becdfaf8494d14a9d2aa84d8eee0455a4eaf4feffa213aba", "inline:stair-square-and-narrow"],
  ["0ba9460627a738d65c7d5235e533ad8410bf7a548bfedc69dca44f987793ee91", "inline:stair-placed"],
  ["68d65af3a0d0c6cbaf11c3b72f80cdc31fbb381fa5fa0a4e628196a0fa9ee288", "inline:stair-arrival"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 802586e9)
  ["e6eed958e1d4cea68f7981fce9964af4b5a26fa3d09ad3eafebb0992ce5cb727", "inline:stair-refusals"],
  ["1e9d114fa6522be3335f490693d677a052fc7363fd0bbc2b07b2f0849fe16494", "inline:stair-parse-refusals"], // AF4 (was 57879436): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 57879436
  ["b26bc512b18857358f1d63dd780c04f84af6923145c4407d45d541b087fff4a4", "inline:sheet-word-as-names"], // AF7 (RM-D69): only added related notes (was 4ee5b0cc, AF7_MAIN)
  ["6b7f2d2d8e83f91900c427ab93ec4a8c0b78741d18f5e0040f2a7eac5d39e4cc", "inline:sheet-macro"], // AF7 (RM-D69): only added related notes (was 77ecc92e, AF7_MAIN)
  ["3a10016b2f0762fb37782872f31bd0ea51135d185d0eadd279b5ed7687f1c138", "inline:every-table"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 9d996ce4)
  ["c3bd0b213038578a15a84f8031adaf7461a5a76f1ce406e189e1de434b5954b2", "inline:fractional-sites"],
  ["4df881b97667921f10ebabdc0ef5a593c8f5fbc8724a8fba1bd396d9554b8d05", "inline:curve-call-outs"],
  ["0b8eca736d1f78e7fde5515fd5263cc03166fadb9615dd96571ae14d3627b3f0", "inline:sheet-near-miss-0"], // AF4 (was 1f92cd16): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 1f92cd16
  ["0b8eca736d1f78e7fde5515fd5263cc03166fadb9615dd96571ae14d3627b3f0", "inline:sheet-near-miss-1"], // AF4 (was 1f92cd16): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 1f92cd16
  ["0b8eca736d1f78e7fde5515fd5263cc03166fadb9615dd96571ae14d3627b3f0", "inline:sheet-near-miss-2"], // AF4 (was 1f92cd16): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 1f92cd16
  ["0b8eca736d1f78e7fde5515fd5263cc03166fadb9615dd96571ae14d3627b3f0", "inline:sheet-near-miss-3"], // AF4 (was 1f92cd16): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 1f92cd16
  ["0b8eca736d1f78e7fde5515fd5263cc03166fadb9615dd96571ae14d3627b3f0", "inline:sheet-near-miss-4"], // AF4 (was 1f92cd16): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 1f92cd16
  ["93c71098bef6e6816ebe9bbc8d464f1ff60b3e7af7c58e675feb08935babc6db", "inline:sheet-near-miss-in-a-level-0"], // AF4 (was 03f61da7): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 03f61da7
  ["93c71098bef6e6816ebe9bbc8d464f1ff60b3e7af7c58e675feb08935babc6db", "inline:sheet-near-miss-in-a-level-1"], // AF4 (was 03f61da7): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 03f61da7
  ["93c71098bef6e6816ebe9bbc8d464f1ff60b3e7af7c58e675feb08935babc6db", "inline:sheet-near-miss-in-a-level-2"], // AF4 (was 03f61da7): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 03f61da7
];

/** AF7 (RM-D69): `main`'s digest of each row AF7 re-measured. The law's own digest body, with AF7's
 *  related notes taken out of `compile().diagnostics` and `describe()`, gives it back. */
const AF7_MAIN: [string, string][] = [
  ["plans:refused", "f48b445c3d8f3499ece29b70d20c50207c34adc80e430edccc3d9f6cd36eb114"],
  ["inline:sheet-word-as-names", "4ee5b0cc65a55f8a21b0dfdbac7c3d3a513cd912f2a54693ad59a1fba85435b2"],
  ["inline:sheet-macro", "77ecc92eac7412e138fc1a1fd3d3541e26b27d9a9497c7d9bb1c7a1b679bdf07"],
];

suite("sheet text: the byte-identity law", () => {
  it("the table pins every row, and no row reaches the form", () => {
    expect(BASELINE.map((b) => b[1])).toEqual(ROWS.map((r) => r.name));
    expect(ROWS.filter((r) => writesTheBlock(r.src)).map((r) => r.name)).toEqual([]);
  });

  it("the premise can fail: the same check sees the fixture write the form", () => {
    expect(writesTheBlock(readFileSync(join(ROOT, FIXTURE), "utf8"))).toBe(true);
    expect(writesTheBlock(everyWord('  sheet text { decimal "," }'))).toBe(true);
  });

  it("the digest can fail: the block on a row moves it, in each dimension", () => {
    const plain = everyWord("");
    const base = stairLawDigest(API, plain, undefined);
    for (const head of ['  sheet text { decimal "," }', '  sheet text { total "SUMME" }']) {
      expect(stairLawDigest(API, everyWord(head), undefined)).not.toBe(base);
    }
  });

  it("AF7: each re-measured row moved by its added related notes alone (strip==old)", () => {
    for (const [name, digest] of AF7_MAIN) {
      const row = ROWS.find((r) => r.name === name)!;
      expect(stairLawDigest(af7StrippedApi(API), row.src, worldOf(row.dir)), name).toBe(digest);
    }
  });

  it.each(BASELINE)("%s %s", (digest, name) => {
    const row = ROWS.find((r) => r.name === name)!;
    expect(stairLawDigest(API, row.src, worldOf(row.dir))).toBe(digest);
  });
});
