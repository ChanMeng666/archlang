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
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  ["164d5d3f4955ae6a2ea4b3c117bc7b9d6f024ca0f68d52b9f708f77a3ee982b4", "examples/aquarium.arch"],
  ["90680592ce7aef9b99598ec8e547044bedf53cebf2edbf890d7fac8db64763ef", "examples/attached.arch"],
  ["312d17f25ef87de1b03b11ab09383648ec0a85c38a1f4ecf569e54014387b8fd", "examples/bungalow.arch"],
  ["843f1de2ff7da325a3211c0c95d6c4211d47108cc15be61b8364fbc3f2955886", "examples/classroom-block.arch"],
  ["add2574d8abfc894d4d3880bbc97a485bee142c9ef90c16df3e5a491747a4858", "examples/clinic.arch"],
  ["0c5f2a884df8dd9e94a4304efc09c531fc6199a24284a43f4ef2c1e9481eef9a", "examples/corner-cafe.arch"],
  ["c6b64e3fa5815d6b9cbeb2e272f64c23d973fbb059c83ea6e57cc41d9b7195f2", "examples/courtyard-family.arch"], // new example (RM8.5, the courtyard-family showcase); CO.1: the example writes its snapped `against` size out (+14 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was 64e5593c)
  ["411fd77e07ded87ca0555dae3f1abb713057a7b63b5e86e712e3a05e2d4fb02a", "examples/courtyard-house.arch"],
  ["fcb5a98c9bf892177daef2174831cb56be4314d6c9ac66526b1046cd6618438b", "examples/furnished-flat.arch"],
  ["4090de73163a56b3319477311f2a1d38126aa4861359e38193f897b364e58ef5", "examples/gallery-l.arch"],
  ["6d5955224cdfaff62510ebf2f5a676098617e78f2938c962bac59434d83fb05d", "examples/garden-house.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; CO.1: the example writes its 2 snapped `against` sizes out (+26 bytes), so only spans and the steps of the written clauses (+8) moved; see the header (was dd673d71); RM9.2, see ./byte-identity-baseline.ts
  ["cc9a04a46e7d09a69aa3f45e3aa9625b66cb8bbc7814658c9aa1f3a5591b891a", "examples/garden-loft.arch"],
  ["6544b4c8a8dd7e8a419f1beb6ab9e3daed19bc6a972a2bb493e361dc29f05b02", "examples/hexagon-pavilion.arch"],
  ["907fd3f916ad5b56090ced28f9b920af66ea223f685f3fc046d7617e550b8a7d", "examples/hillside-villa.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; CO.1: the example writes its 3 snapped `against` sizes out (+40 bytes), so only spans and the steps of the written clauses (+12) moved; see the header (was 6a0a3529); RM9.2, see ./byte-identity-baseline.ts
  ["943cb8dbb7c0438d4f7d62160dafba83a6861b912a5c8cbf70db47e11ec80be7", "examples/imports.arch"],
  ["eba7e921a8695d44326f95ebdb9e22c7b4a9fa5cb311b81055e6359e0cdeafd5", "examples/knob-flat.arch"], // new example (P4, the knobs example), as in ./block-stair-byte-identity.test.ts
  ["312c51d435f0c106b693ccd6c13a1cebb5c41b3217647e4202eef05101f058a1", "examples/laneway-house.arch"],
  ["3287073b01810f410a7e011350769357b5914455673dd0c1cea8c21f24a517ce", "examples/library.arch"],
  ["cba42cb40c26fc7374e9009aad98330821970d7512ec69463b07f76bb6327913", "examples/materials.arch"],
  ["f78767a05bce8ca47e5ba9ce667be40768f24154bb9f3d184a06851614e19387", "examples/museum-wing.arch"],
  ["b3c136dda6a1e2c1d13127e480daa1e2264a98f84cc5cef8018c6bb77a18860b", "examples/museum-wings.arch"],
  ["c487fa90d22f873a3baa02ccf942576cb7557063a0eff546d6955859132ce0c0", "examples/museum.arch"], // CO.1: the example writes its 5 snapped `against` sizes out (+65 bytes), so only spans and the steps of the written clauses (+10) moved; see the header (was 8acbd708)
  ["232be7cd74316c370773ffc6c75d17076cbffdd4ba37df3a9b3c3cf3c3b9a6c2", "examples/one-room.arch"],
  ["cfb3df7a358a33c3ab583d90b3ce215c3ef2f53a8d994ea040f97c1f4c4ddd28", "examples/parametric.arch"],
  ["1d5d2c0df9dad3beca99c1146fc2457ef40021d604453b012d45dc333d88ba8d", "examples/practice-office.arch"],
  ["02918cde41f10b126dee8f4a0a847c25168eead83c4be59553b88acabb47bd00", "examples/relational.arch"],
  ["0e04f3b717d1c6938f1013acb953abdbbb8c154f6b6293b2a1ae20559b6a6ecc", "examples/remodel.arch"], // CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was a4a2014e)
  ["478fdeeb66fd3e037e1665fa1be8a49313c5db38e5802999bb95c6f328754bc2", "examples/sheet-notes.arch"],
  ["f6a6a81fa57cd5183bfbb7c607bdb9599ddf2eebfbc657c0cc4e69c7c0bcae7a", "examples/studio.arch"],
  ["bd6056a84ec5d55dee071e9101fea8d157ce72e0830211a1f66b11291f0e0ef7", "examples/terrace-row.arch"],
  ["503b89ecf0ca78f6c1100f1fd059c0b63080a9bdb3b9401c675c74971816cd21", "examples/themed.arch"],
  ["1a78c5532e6c4bb783da712f6f27c83f5c771765278ec8552940d4f73e32beaa", "examples/tiny-house.arch"],
  ["58f07fa654e3eecb00c8f1958974ff854b2ef7b39cf50e6e1cea6d2463033ecc", "examples/townhouse.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["12a2c3da84bc3fb045fc784bcad3851edaaf6ae0ec539727b52a5d39e58dca2b", "examples/transit-hall.arch"],
  ["ea10c4f2ef02a4edf1e91ad6b5782839346ad80f1aaa595f4a6573b79921ce65", "examples/two-bed.arch"], // CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was f220acec)
  ["90f3b76705f1aee006f98d7a9c83575531399928e9f73500f373a7dc6f76f747", "examples/two-storey.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["2fe38a4ad849ebb8a3192c7cea724d729f659fed022b9a1740b8b96a0e1db1f9", "test/fixtures/axes-grid.arch"],
  ["8b201a108d4f8cf901579b200c92b809000d77b9550cda3e092994c09fbba1d5", "test/fixtures/chain30.arch"],
  ["c08051d0ac804cb6ddbc6d6a073934ce248aab2951f1b3bcbb05e242ec1f4c22", "test/fixtures/dense-bays.arch"],
  ["b9215930403c72e737b6486d949354fc8162cf96ec5d53897edfab5f21835e4f", "test/fixtures/diff-a.arch"],
  ["cc20d6821e47c1a45a5c0b94d86a15eda2e2e684a66c096c06ef8071b21bf20b", "test/fixtures/diff-b.arch"],
  ["035414348be6c178ae7688e584bf7e8ff4e43461e2d70c40894682db0347acd2", "test/fixtures/diff-circ-a.arch"],
  ["f10e71740b3325be957d2e1c2bc467796b6a2ea700533714fba2e8c5539421f3", "test/fixtures/diff-circ-b.arch"],
  ["d2e33f0f08e06930824942bb36faf1a439459483a3335cd78063e3ef51b021b6", "test/fixtures/lock-before.arch"],
  ["a5b010590ff37b31382b353c37001f3541ef26e5f9c8bd531f2121dd1a9d4fa2", "test/fixtures/lock-partition-moved.arch"],
  ["bfe79454671a15f63522c0a770453a819328df15f90b01154d028f5161350046", "test/fixtures/lock-window-moved.arch"],
  ["d340196f446839ceda4c324efb5c2c29abab79551b673a72b95abeabc64d3fe2", "test/fixtures/off-path-bypass.arch"], // RM1.4: the unknown-furniture search is charged to the step meter (+29 steps: `cabinet`, 234 -> 263) (was ff686ab3)
  ["b1d58662ed6a557fd27aa948f640a3a70d38552402506413bd13f774a15fa47b", "test/fixtures/schedule-sheet.arch"],
  ["ac6b7954d2cefaa2461c5e8111d1004603b931ef133597f0971e07db78c6dd42", "test/fixtures/star30.arch"],
  ["04967cde5bfb789226f853109ea1e5727d1a48883db9042bc95f25f8d0602b3b", "test/fixtures/storeys-eaves-overflow.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  // was 3d10dfea. D27, the digest every law on `main` pins: this plan's stair stands in no wall, so `bounds()`
  // reaching its break line widens the drawing 156 mm. No `sheet text` moved it: the form's rows stay as measured.
  ["5febcfb91b9a3e7bc23705df313a0ac218fb64f35aae5a19b607b313ddca79fb", "test/fixtures/zones-levels.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["ee9f057b82b717e4b7c0753daef62a2baa9b3df5c5d8aa617079c3dedce0081e", "test/fixtures/zones-wings.arch"],
  ["edc62a570b76ff9877ab4515a7a83826cc91bf70328a315fe62f42ff17f3a843", "test/walls-from-rooms/relational.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "test/walls-from-rooms/studio.arch"],
  ["4a1ab38ed28c696ef0c713c4227dd30efb828fb60a7d3dd5b4b4e1d0e40f68ef", "test/walls-from-rooms/two-bed.arch"], // RM1.4: snapping is now reported (this test plan's 850x2000 sofa and 450x600 basin under grid 100 raise W_GRID_SNAPPED; steps 629 -> 757, +128 = two DIAGNOSTIC_STEPS) (was 73d42f0e); CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was cd33c0b4)
  [
    "ef6b4cf52454c07cdd3c22449f6545da111fb35e7f1085d1ec15cd8c94903e4b",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "test/walls-from-rooms/widen.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "plans:studio-twin"],
  ["4a1ab38ed28c696ef0c713c4227dd30efb828fb60a7d3dd5b4b4e1d0e40f68ef", "plans:two-bed-twin"], // RM1.4: snapping is now reported (this test plan's 850x2000 sofa and 450x600 basin under grid 100 raise W_GRID_SNAPPED; steps 629 -> 757, +128 = two DIAGNOSTIC_STEPS) (was 73d42f0e); CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was cd33c0b4)
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "plans:widen-4000"],
  ["f472897ea01f13b118a0efeb189ffce7083a9629f880d9a6b9b267ad7becb10e", "plans:widen-4500"],
  ["ebc0bb540123325ca7eb8fe4fe12a3e5aa76c78cd6d451cb6a235118c92bba7a", "plans:courtyard"],
  ["bc452991d3ed362cdc36ff1f97938f1c917a9503f05c40ebdb286484a85f7034", "plans:void-hole"],
  ["01402210432235dd8c87a3b8f9ffff66d1839272a5fb649b181c91d9ea87cf5b", "plans:instances"],
  ["27fd4888416deb84501c64dc2d2ebad10776ac3f5c53e780e5eea8f2f0a4f05c", "plans:coexist"],
  ["f48b445c3d8f3499ece29b70d20c50207c34adc80e430edccc3d9f6cd36eb114", "plans:refused"],
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
  ["b699986d9e7a9fd640cba2cc7fd75cd76eb213bf5b01fec1730e1b60fb57f725", "inline:door-refusals"],
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
    "a823dc7289226e3b5fed12d7c3c09c77018a89121bc68b2bb272ed0234918150", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/head-against-wall.arch",
  ],
  [
    "7f034ceb5b31408d50ab0296138ad95d752ca272141c6ee7ff18539c5e206f3f", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/head-against-wall.clean.arch",
  ],
  [
    "353f62418808f03e9a65ba5868a456fe4af337a37bdb19fb0af16f98dcc789c0", // RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/riser-too-high.arch",
  ],
  [
    "1fe18c7d4e81e2167b88554bd42f8f8a6c491b526b822d19a812548ba6cc79ca", // RM1.2a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/riser-too-high.clean.arch",
  ],
  [
    "4c04ddec3195a65a5d06714e23b904ae8a7abfacae6e463d788ca887b66c1e96", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.arch",
  ],
  [
    "ef8de37a85d16d8fd54a0639d0ea09f37301a1a26859c07b617614a331ef9c09", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.clean.arch",
  ],
  [
    "0f46a66f24bfd3296658a585aff0dcdaead10138a7fd004dc74995f4ce873d49", // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/stair-too-steep.arch",
  ],
  [
    "7c6caa77f96e277544acd54ded74ca682c017b2f2f4fa91a3fa659ada81e0131", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
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
    "444444d968b7e432931e7a1218a7f2f43bbd1c5079d9335d3fe213b94ec3cfb4", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/void-at-stair-head.arch",
  ],
  [
    "4d4bfb32187b2a0b26e687f4c2784905b4802b22135e3e3b26239c6240eaffa8", // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/void-at-stair-head.clean.arch",
  ],
  ["803382568b44d2abe330873b5b788636b5dae38beea8416ea9da39a9fb3a12ab", "inline:stair-words-as-names"],
  ["f1497554533ffa39becdfaf8494d14a9d2aa84d8eee0455a4eaf4feffa213aba", "inline:stair-square-and-narrow"],
  ["0ba9460627a738d65c7d5235e533ad8410bf7a548bfedc69dca44f987793ee91", "inline:stair-placed"],
  ["802586e9b7cf3f6927c1441481a0e2d14699e57b6b7a50ddb48b71a9b4a902d5", "inline:stair-arrival"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["e6eed958e1d4cea68f7981fce9964af4b5a26fa3d09ad3eafebb0992ce5cb727", "inline:stair-refusals"],
  ["57879436768cab2c738430d6586f0e88de6cb79c178799a011c9d09f73e553df", "inline:stair-parse-refusals"],
  ["4ee5b0cc65a55f8a21b0dfdbac7c3d3a513cd912f2a54693ad59a1fba85435b2", "inline:sheet-word-as-names"],
  ["77ecc92eac7412e138fc1a1fd3d3541e26b27d9a9497c7d9bb1c7a1b679bdf07", "inline:sheet-macro"],
  ["9d996ce459b88fc3b5405d0e7fd29df3d9ac7b452a5c0c865f9efa3718749259", "inline:every-table"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["c3bd0b213038578a15a84f8031adaf7461a5a76f1ce406e189e1de434b5954b2", "inline:fractional-sites"],
  ["4df881b97667921f10ebabdc0ef5a593c8f5fbc8724a8fba1bd396d9554b8d05", "inline:curve-call-outs"],
  ["1f92cd16e9aaeaa19f81a01ddd2d74c4fd634dc6ca80f568e815bcab0cde07d8", "inline:sheet-near-miss-0"],
  ["1f92cd16e9aaeaa19f81a01ddd2d74c4fd634dc6ca80f568e815bcab0cde07d8", "inline:sheet-near-miss-1"],
  ["1f92cd16e9aaeaa19f81a01ddd2d74c4fd634dc6ca80f568e815bcab0cde07d8", "inline:sheet-near-miss-2"],
  ["1f92cd16e9aaeaa19f81a01ddd2d74c4fd634dc6ca80f568e815bcab0cde07d8", "inline:sheet-near-miss-3"],
  ["1f92cd16e9aaeaa19f81a01ddd2d74c4fd634dc6ca80f568e815bcab0cde07d8", "inline:sheet-near-miss-4"],
  ["03f61da770c3d28fd642e62610d82438f2bfbb55131890a4401e2ff058960e63", "inline:sheet-near-miss-in-a-level-0"],
  ["03f61da770c3d28fd642e62610d82438f2bfbb55131890a4401e2ff058960e63", "inline:sheet-near-miss-in-a-level-1"],
  ["03f61da770c3d28fd642e62610d82438f2bfbb55131890a4401e2ff058960e63", "inline:sheet-near-miss-in-a-level-2"],
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

  it.each(BASELINE)("%s %s", (digest, name) => {
    const row = ROWS.find((r) => r.name === name)!;
    expect(stairLawDigest(API, row.src, worldOf(row.dir))).toBe(digest);
  });
});
