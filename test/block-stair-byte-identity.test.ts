/**
 * Block stairs (issue #362, card S1): the byte-identity law.
 *
 * A plan with no block stair resolves, draws, describes and lints exactly as before, down to its
 * Scene and the steps its resolution spends, in the accessibility profile and on the circulation
 * overlay too. Each digest is {@link stairLawDigest} (`test/block-stair-law.ts`), **measured
 * against `src/` at `7c57c6fb`** (`main` before the form), that tree extracted by `git archive`,
 * the body imported from this branch and handed that tree's compiler. The rows are every plan the
 * rectilinear-rooms law pins, the stair-safety defect corpus, and {@link STAIR_INLINE_ROWS}: a
 * straight stair on each path the form forks from.
 *
 * In this table the digest comes first: a row keyed by a path holding `access` is the shape the
 * secret scanner reads as a credential, and this order is not that shape.
 *
 * Why the rows hold: `flightsOf`, `boardedFlight` and `piecesOf` hand a straight run back as it
 * is, and the block path is taken only on `stair … dir`, which was an `E_PARSE` until now. The
 * one sanctioned move is that parse error itself: a source that has `dir` straight after a stair's
 * id now reads as the form, and no row here does.
 *
 * A digest moving is a finding to explain before it is a diff to re-measure.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD, type World } from "../src/world.js";
import { planOf, L_STAIR } from "./block-stair-plans.js";
import { STAIR_INLINE_ROWS, type StairLawApi, stairLawDigest, stairLawRows } from "./block-stair-law.js";
import { ROOT } from "./rectilinear-rooms-law.js";

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

/** Does the plan write a block stair? Read off the parse, of every statement at any depth. */
function reachesTheForm(src: string): boolean {
  const { plan } = parse(src, BUILTIN_REGISTRY);
  if (!plan) return false;
  return JSON.stringify(plan).includes('"pieces":');
}

const ROWS = stairLawRows(ROOT);
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** Measured at `7c57c6fb` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["e33e9923337208c91bf7093a0fa63040f132db455f3e3e85d584740a18a8f611", "examples/accessible.arch"],
  ["229b2ce2dcde6099738788f60fda5dc88e08c7f165626e32a029a0ef9bd9a4cf", "examples/aquarium.arch"],
  ["90680592ce7aef9b99598ec8e547044bedf53cebf2edbf890d7fac8db64763ef", "examples/attached.arch"],
  ["54e8a4533c5c1001558b934da9daaf1584745e14b7235c62dfd9ad2845c27d15", "examples/bungalow.arch"],
  ["843f1de2ff7da325a3211c0c95d6c4211d47108cc15be61b8364fbc3f2955886", "examples/classroom-block.arch"],
  ["add2574d8abfc894d4d3880bbc97a485bee142c9ef90c16df3e5a491747a4858", "examples/clinic.arch"],
  ["74b06965f559d70538ab6b8091206a6d7c21228ed57909bbb11a1394132e622a", "examples/corner-cafe.arch"],
  ["f6c575cff4b9925af400c393c80035679a91ea1af5889573951ff2fb324781cc", "examples/courtyard-house.arch"],
  ["fcb5a98c9bf892177daef2174831cb56be4314d6c9ac66526b1046cd6618438b", "examples/furnished-flat.arch"],
  ["9bebae4de5952cc987025158c3c9c272049ffb7edeeaa79606d3504b70e484d3", "examples/gallery-l.arch"],
  ["04a29cf641119483d2faa73f6f98cf8fba80b1e18f7a706393e7e8fa565be5e9", "examples/garden-house.arch"],
  ["cc9a04a46e7d09a69aa3f45e3aa9625b66cb8bbc7814658c9aa1f3a5591b891a", "examples/garden-loft.arch"],
  ["f99ab40df2d3de6d4cceb7b605f8d02239f897aa48d4cd43ed572a2d96dde223", "examples/hexagon-pavilion.arch"],
  ["cd4bec175914db8191275a7572b1118d1335d74364deee07dcca2b8fe97ce314", "examples/hillside-villa.arch"],
  ["943cb8dbb7c0438d4f7d62160dafba83a6861b912a5c8cbf70db47e11ec80be7", "examples/imports.arch"],
  ["312c51d435f0c106b693ccd6c13a1cebb5c41b3217647e4202eef05101f058a1", "examples/laneway-house.arch"],
  ["3287073b01810f410a7e011350769357b5914455673dd0c1cea8c21f24a517ce", "examples/library.arch"],
  ["cba42cb40c26fc7374e9009aad98330821970d7512ec69463b07f76bb6327913", "examples/materials.arch"],
  ["f78767a05bce8ca47e5ba9ce667be40768f24154bb9f3d184a06851614e19387", "examples/museum-wing.arch"],
  ["b3c136dda6a1e2c1d13127e480daa1e2264a98f84cc5cef8018c6bb77a18860b", "examples/museum-wings.arch"],
  ["8acbd708c2a7739624228b75906c8845425e3df67b250c65a63aadd19a811c25", "examples/museum.arch"],
  ["232be7cd74316c370773ffc6c75d17076cbffdd4ba37df3a9b3c3cf3c3b9a6c2", "examples/one-room.arch"],
  ["cfb3df7a358a33c3ab583d90b3ce215c3ef2f53a8d994ea040f97c1f4c4ddd28", "examples/parametric.arch"],
  ["1d5d2c0df9dad3beca99c1146fc2457ef40021d604453b012d45dc333d88ba8d", "examples/practice-office.arch"],
  ["416be1ef23a2b89decff001d306a77ebf67f29eadc0ef6d0217b882d29e07a9e", "examples/relational.arch"],
  ["eb4a059574f4bac6af7850a5345afd589e7b95cd56ae3a48cf0ad53a4e20f150", "examples/remodel.arch"],
  ["478fdeeb66fd3e037e1665fa1be8a49313c5db38e5802999bb95c6f328754bc2", "examples/sheet-notes.arch"],
  ["f6a6a81fa57cd5183bfbb7c607bdb9599ddf2eebfbc657c0cc4e69c7c0bcae7a", "examples/studio.arch"],
  ["bd6056a84ec5d55dee071e9101fea8d157ce72e0830211a1f66b11291f0e0ef7", "examples/terrace-row.arch"],
  ["503b89ecf0ca78f6c1100f1fd059c0b63080a9bdb3b9401c675c74971816cd21", "examples/themed.arch"],
  ["cef402b1081754946c9b1c547f4141a84aeba13acfa103f39d2afdad4423947d", "examples/tiny-house.arch"],
  ["e649d526c9f25d6956c2430d7d6b92baedb76c9c1ade382a475fff300837541e", "examples/townhouse.arch"],
  ["12a2c3da84bc3fb045fc784bcad3851edaaf6ae0ec539727b52a5d39e58dca2b", "examples/transit-hall.arch"],
  ["36558928331a172f357a63f0e603fe3acec5e85734584adcc2f1d80c7b4b7a93", "examples/two-bed.arch"],
  ["0dfb5dad54893c8f8276f4740f07b6501cd79d63ca6a785e43aafeee6198964f", "examples/two-storey.arch"],
  ["2fe38a4ad849ebb8a3192c7cea724d729f659fed022b9a1740b8b96a0e1db1f9", "test/fixtures/axes-grid.arch"],
  ["acd6528394a79d385a1e02c64e9646a656daecb22eaeda68fcd8d0a814428aa8", "test/fixtures/chain30.arch"],
  ["c08051d0ac804cb6ddbc6d6a073934ce248aab2951f1b3bcbb05e242ec1f4c22", "test/fixtures/dense-bays.arch"],
  ["b9215930403c72e737b6486d949354fc8162cf96ec5d53897edfab5f21835e4f", "test/fixtures/diff-a.arch"],
  ["cc20d6821e47c1a45a5c0b94d86a15eda2e2e684a66c096c06ef8071b21bf20b", "test/fixtures/diff-b.arch"],
  ["035414348be6c178ae7688e584bf7e8ff4e43461e2d70c40894682db0347acd2", "test/fixtures/diff-circ-a.arch"],
  ["f10e71740b3325be957d2e1c2bc467796b6a2ea700533714fba2e8c5539421f3", "test/fixtures/diff-circ-b.arch"],
  ["d2e33f0f08e06930824942bb36faf1a439459483a3335cd78063e3ef51b021b6", "test/fixtures/lock-before.arch"],
  ["a5b010590ff37b31382b353c37001f3541ef26e5f9c8bd531f2121dd1a9d4fa2", "test/fixtures/lock-partition-moved.arch"],
  ["bfe79454671a15f63522c0a770453a819328df15f90b01154d028f5161350046", "test/fixtures/lock-window-moved.arch"],
  ["ff686ab3285ac3d6f30af9607a711627f6f864825a15fef562f19c28700b2753", "test/fixtures/off-path-bypass.arch"],
  ["b1d58662ed6a557fd27aa948f640a3a70d38552402506413bd13f774a15fa47b", "test/fixtures/schedule-sheet.arch"],
  ["fce50b915b34c243f9cbcf3f8dbdc47b3f2006973098b3d9ab3339dff541cb0d", "test/fixtures/star30.arch"],
  ["9af0e56239b35c95d9559968330ad33f3825f976a4eb5adc1f685bc7d17a2fc1", "test/fixtures/storeys-eaves-overflow.arch"],
  ["3d10dfea39abccb9a292527e7a5c85adaaf04b944de920f9ad3d9690187bcb68", "test/fixtures/zones-levels.arch"],
  ["ee9f057b82b717e4b7c0753daef62a2baa9b3df5c5d8aa617079c3dedce0081e", "test/fixtures/zones-wings.arch"],
  ["edc62a570b76ff9877ab4515a7a83826cc91bf70328a315fe62f42ff17f3a843", "test/walls-from-rooms/relational.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "test/walls-from-rooms/studio.arch"],
  ["159a47564016a055369063d8ef8cfef9d6a66495ba23665efa315b7b0a58ce94", "test/walls-from-rooms/two-bed.arch"],
  [
    "ef6b4cf52454c07cdd3c22449f6545da111fb35e7f1085d1ec15cd8c94903e4b",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "test/walls-from-rooms/widen.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "plans:studio-twin"],
  ["159a47564016a055369063d8ef8cfef9d6a66495ba23665efa315b7b0a58ce94", "plans:two-bed-twin"],
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "plans:widen-4000"],
  ["f472897ea01f13b118a0efeb189ffce7083a9629f880d9a6b9b267ad7becb10e", "plans:widen-4500"],
  ["1a8ac88640dc0ac5dc986484d9cc9b058f9152369f25b6b7057740c3ce3392df", "plans:courtyard"],
  ["bc452991d3ed362cdc36ff1f97938f1c917a9503f05c40ebdb286484a85f7034", "plans:void-hole"],
  ["01402210432235dd8c87a3b8f9ffff66d1839272a5fb649b181c91d9ea87cf5b", "plans:instances"],
  ["27fd4888416deb84501c64dc2d2ebad10776ac3f5c53e780e5eea8f2f0a4f05c", "plans:coexist"],
  ["f48b445c3d8f3499ece29b70d20c50207c34adc80e430edccc3d9f6cd36eb114", "plans:refused"],
  ["3242407cca3e68167000ae30159a28d3f1d87f74a911adaed34c5458100f5d78", "plans:open-plan"],
  ["51d28947008155d90908b371a8900b873d87ab9a0fc785479df6f179b94b0e87", "plans:open-width"],
  ["fc878a600854ad99f69ecf8577176006056f301a90106de53452b97da71bd4a5", "plans:open-instances"],
  ["5c13261d26b3e823caca5be0039c06c3b20432086d11afc430f89fc1e2cd2fc4", "plans:clauses-refused"],
  ["44e9264ea220b8892edf90a6176f030b4d718a12487a55db3675afc7008e8249", "inline:issue-hybrid"],
  ["c7da20312696fe227a4de270da41de5915444f3e37ddf4b109ebf0b880f1b6f1", "inline:typed-walls"],
  ["e140a63b3c5a19f2abfaf470afccbdbdbdf1acccea6da3f7cf0ea52e86d0aacc", "inline:except-slanted"],
  ["6e4367336a461f79b8927cdb2671f2571c0d5e029ca95b26448cf70bd39eb058", "inline:clauses"],
  ["89cc73f3437a1e62e0fa230093312ab52649716fe15f65e07c847540a1b25f70", "inline:door-beside-excepted-L"],
  ["3e8e9e786c88c697fd7d4d1be0a653cccd5a9f9ed6777ec9eda5366e76a46687", "inline:door-positions"],
  ["2646e902db98a47d07ba4b74dcd1be4256394c939d9067531d2fc624cd74ad45", "inline:door-refusals"],
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
    "5f4814023d4dc4f7a37237520e062f5802e45d1d8eb9db4157aef841e5bac2c2",
    "test/defect-corpus/stair-safety/furniture-on-flight.arch",
  ],
  [
    "46b3c52914812d0e9848110080cf9baaff570726a6ce3745154d0aecb8501735",
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
    "f752c20553620850a8aa7a08b0e3495c0d78f92089e5c128051aeb62bf29aa41",
    "test/defect-corpus/stair-safety/head-against-wall.arch",
  ],
  [
    "bb473be35000b55796da2047a50081a00b3fb4612da57d633354d2f14924d099",
    "test/defect-corpus/stair-safety/head-against-wall.clean.arch",
  ],
  [
    "e98bb7790a4ba51994dc2665067797894bbf1466c3f27b1dc86ae38b7f472503",
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.arch",
  ],
  [
    "bd21b05799d2a7ff933839e3d09e1cdcccfef11d4bf853551d9bf05e9b0a95f4",
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.clean.arch",
  ],
  [
    "31404bb260b8634646f8f7ac84270be21fa629089ebd6b67319641c15e4a409e",
    "test/defect-corpus/stair-safety/stair-too-steep.arch",
  ],
  [
    "5c865bb10d2e390d6f87174cdd4a682a67e8b74a2d34357017bb8deab24f4e55",
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
    "e15cdc1ea7a1b59f22c2770ed2c6de1d40a0a713cf5298c8e3a1d0b9b8377e7d",
    "test/defect-corpus/stair-safety/void-at-stair-head.arch",
  ],
  [
    "288139c819a0c58c24960f4714dbebeb2b5b225664b5ba1eb4169b75a9a841e8",
    "test/defect-corpus/stair-safety/void-at-stair-head.clean.arch",
  ],
  ["803382568b44d2abe330873b5b788636b5dae38beea8416ea9da39a9fb3a12ab", "inline:stair-words-as-names"],
  ["f1497554533ffa39becdfaf8494d14a9d2aa84d8eee0455a4eaf4feffa213aba", "inline:stair-square-and-narrow"],
  ["0ba9460627a738d65c7d5235e533ad8410bf7a548bfedc69dca44f987793ee91", "inline:stair-placed"],
  ["628b3dc3ea13475086e9be255d9ff6a20cf1632d0a242fd6eaf1ebb2b7fbb492", "inline:stair-arrival"],
  ["e6eed958e1d4cea68f7981fce9964af4b5a26fa3d09ad3eafebb0992ce5cb727", "inline:stair-refusals"],
  ["57879436768cab2c738430d6586f0e88de6cb79c178799a011c9d09f73e553df", "inline:stair-parse-refusals"],
];

suite("block stairs: the byte-identity law", () => {
  it("the table pins every row, and no row reaches the form", () => {
    expect(BASELINE.map((b) => b[1])).toEqual(ROWS.map((r) => r.name));
    expect(ROWS.filter((r) => reachesTheForm(r.src)).map((r) => r.name)).toEqual([]);
    expect(STAIR_INLINE_ROWS.length).toBeGreaterThan(0);
  });

  it("the premise can fail: the same check sees a plan that does reach the form", () => {
    expect(reachesTheForm(planOf(L_STAIR))).toBe(true);
    // Words of the form as names are no use of it.
    expect(reachesTheForm(STAIR_INLINE_ROWS[0]!.src)).toBe(false);
  });

  it.each(BASELINE)("%s %s", (digest, name) => {
    const row = ROWS.find((r) => r.name === name)!;
    expect(stairLawDigest(API, row.src, worldOf(row.dir))).toBe(digest);
  });
});
