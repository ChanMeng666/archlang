/**
 * The floor words `timber`, `carpeting`, `stone` (`room … floor <word>`) and the `outdoor` kinds `sand`,
 * `soil` (card RM8.7, design `docs/plans/product-roadmap/design/visual-language.md` §3): the
 * byte-identity law, one for each form.
 *
 * A plan that writes none of the five words as a floor or a ground resolves, draws, describes and
 * lints exactly as before, down to its Scene, its `compile().diagnostics` and the steps its resolution
 * spends, in the accessibility profile and on the circulation overlay too. Each digest is
 * {@link stairLawDigest}, the widest law body the repository has (`test/helpers/block-stair-law.ts`),
 * **measured against `src/` at `35ed277f`** (`main` without the words), that tree extracted by
 * `git archive`, the body and the rows imported from this branch and handed that tree's compiler.
 * The rows are every plan the block-stair law pins, `examples/turning-stair.arch` (which that law
 * leaves out for its own form), then {@link FLOOR_MATERIALS_INLINE_ROWS}: the five words as the names
 * they have always been, and the older floor words and kinds under `rendered`, the one theme whose
 * floor fill the new words change.
 *
 * Why the rows hold: the words only widen closed lists (`FLOOR_MATERIALS`, `GROUND_MATERIALS`,
 * `OUTDOOR_KINDS`, `KEYWORDS.enum`) and add five `<pattern>` builders a plan reaches only by writing
 * one; a room's floor fill changes only under a theme with `materialTints` and only for the three
 * floor-only words (`roomFloorFill`, `src/elements/room.ts`). An enum word is no reserved word, so the
 * names row parses as it did. The words also became `sheet text` keys (`src/sheet-text.ts`), the
 * law's third form: a block that writes one was `E_PARSE` before and now renames the word on the
 * sheet. Two texts can move without any of the three forms, because each names the known words: the
 * warning on a MISTYPED floor or ground word, and the parse error on a mistyped `sheet text` key,
 * whose "did you mean" now may name a new word (`sandd` → `sand`). No row has either (asserted
 * below), and the new texts are pinned by `test/room-floor.test.ts`, `test/outdoor.test.ts` and
 * `test/sheet-text.test.ts`.
 *
 * A digest moving is a finding to explain before it is a diff to re-measure.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { OUTDOOR_KINDS } from "../src/ast.js";
import { FLOOR_MATERIALS, FLOOR_PATTERNS } from "../src/hatches.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD, type World } from "../src/world.js";
import { type StairLawApi, stairLawDigest, stairLawRows, WRITES_THE_FORM } from "./helpers/block-stair-law.js";
import { lawRows, ROOT } from "./helpers/rectilinear-rooms-law.js";
import { FLOOR_MATERIALS_INLINE_ROWS } from "./tables/floor-materials-plans.js";

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

const ROWS = [
  ...stairLawRows(ROOT),
  ...lawRows(ROOT).filter((r) => WRITES_THE_FORM.includes(r.name)),
  ...FLOOR_MATERIALS_INLINE_ROWS,
];
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** The new ground kinds: `OUTDOOR_KINDS` past the nine it had before the card. */
const NEW_KINDS: readonly string[] = ["sand", "soil"];
/** The floor words before the card: every other word of `FLOOR_MATERIALS` is new. */
const OLD_FLOORS: readonly string[] = ["tile", "paving", "deck", "concrete"];

/** Every parse node of a plan, at any depth (a `level`, a `component`, a `strip`, a block). */
function* nodes(x: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(x)) for (const v of x) yield* nodes(v);
  else if (typeof x === "object" && x !== null) {
    const o = x as Record<string, unknown>;
    if (typeof o.kind === "string") yield o;
    for (const v of Object.values(o)) yield* nodes(v);
  }
}

/** The five words RM8.7 added, each now a `sheet text` key as well. */
const NEW_WORDS: readonly string[] = [...FLOOR_PATTERNS, ...NEW_KINDS];

const FORMS = ["floor word", "outdoor kind", "sheet text key"] as const;
type Form = (typeof FORMS)[number];
const writes = (src: string, form: Form): boolean => {
  const plan = parse(src, BUILTIN_REGISTRY).plan;
  if (!plan) return false;
  if (form === "sheet text key") return (plan.sheetText?.entries ?? []).some((e) => NEW_WORDS.includes(e.key));
  for (const n of nodes(plan.body)) {
    if (form === "floor word" && n.kind === "room") {
      const word = (n.floor as { word?: string } | undefined)?.word;
      if (word !== undefined && !OLD_FLOORS.includes(word)) return true;
    }
    if (form === "outdoor kind" && n.kind === "outdoor" && NEW_KINDS.includes(String(n.surface))) return true;
  }
  return false;
};
/**
 * A floor, ground or `sheet text` word that is no word at all: its message lists or suggests the known
 * words, which grew.
 */
const mistyped = (src: string): boolean => {
  const plan = parse(src, BUILTIN_REGISTRY).plan;
  if (!plan) return false;
  for (const n of nodes(plan.body)) {
    const word = n.kind === "room" ? (n.floor as { word?: string } | undefined)?.word : undefined;
    if (word !== undefined && !(FLOOR_MATERIALS as readonly string[]).includes(word)) return true;
  }
  return compile(src, { noCache: true }).diagnostics.some(
    (d) => d.message.includes("Unknown outdoor kind") || d.message.includes("Unknown sheet text key"),
  );
};

/** Measured at `35ed277f` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["e33e9923337208c91bf7093a0fa63040f132db455f3e3e85d584740a18a8f611", "examples/accessible.arch"],
  ["164d5d3f4955ae6a2ea4b3c117bc7b9d6f024ca0f68d52b9f708f77a3ee982b4", "examples/aquarium.arch"],
  ["90680592ce7aef9b99598ec8e547044bedf53cebf2edbf890d7fac8db64763ef", "examples/attached.arch"],
  ["312d17f25ef87de1b03b11ab09383648ec0a85c38a1f4ecf569e54014387b8fd", "examples/bungalow.arch"],
  ["843f1de2ff7da325a3211c0c95d6c4211d47108cc15be61b8364fbc3f2955886", "examples/classroom-block.arch"],
  ["add2574d8abfc894d4d3880bbc97a485bee142c9ef90c16df3e5a491747a4858", "examples/clinic.arch"],
  ["0c5f2a884df8dd9e94a4304efc09c531fc6199a24284a43f4ef2c1e9481eef9a", "examples/corner-cafe.arch"],
  ["64e5593cdf241b655c52cc44fcbe94e18ea2de76d2cced6fac8155567564b512", "examples/courtyard-family.arch"],
  ["411fd77e07ded87ca0555dae3f1abb713057a7b63b5e86e712e3a05e2d4fb02a", "examples/courtyard-house.arch"],
  ["fcb5a98c9bf892177daef2174831cb56be4314d6c9ac66526b1046cd6618438b", "examples/furnished-flat.arch"],
  ["4090de73163a56b3319477311f2a1d38126aa4861359e38193f897b364e58ef5", "examples/gallery-l.arch"],
  ["df81256b7655199970c53e69a1bfcbb409d59dd368604e2cc83b7482552f830f", "examples/garden-house.arch"],
  ["cc9a04a46e7d09a69aa3f45e3aa9625b66cb8bbc7814658c9aa1f3a5591b891a", "examples/garden-loft.arch"],
  ["6544b4c8a8dd7e8a419f1beb6ab9e3daed19bc6a972a2bb493e361dc29f05b02", "examples/hexagon-pavilion.arch"],
  ["b188c6d560ee0dc48cac47acdd479c66f31a0c3fd57a55d6c7e32a4fb04e9cb6", "examples/hillside-villa.arch"],
  ["943cb8dbb7c0438d4f7d62160dafba83a6861b912a5c8cbf70db47e11ec80be7", "examples/imports.arch"],
  ["eba7e921a8695d44326f95ebdb9e22c7b4a9fa5cb311b81055e6359e0cdeafd5", "examples/knob-flat.arch"],
  ["312c51d435f0c106b693ccd6c13a1cebb5c41b3217647e4202eef05101f058a1", "examples/laneway-house.arch"],
  ["3287073b01810f410a7e011350769357b5914455673dd0c1cea8c21f24a517ce", "examples/library.arch"],
  ["cba42cb40c26fc7374e9009aad98330821970d7512ec69463b07f76bb6327913", "examples/materials.arch"],
  ["f78767a05bce8ca47e5ba9ce667be40768f24154bb9f3d184a06851614e19387", "examples/museum-wing.arch"],
  ["b3c136dda6a1e2c1d13127e480daa1e2264a98f84cc5cef8018c6bb77a18860b", "examples/museum-wings.arch"],
  ["8acbd708c2a7739624228b75906c8845425e3df67b250c65a63aadd19a811c25", "examples/museum.arch"],
  ["232be7cd74316c370773ffc6c75d17076cbffdd4ba37df3a9b3c3cf3c3b9a6c2", "examples/one-room.arch"],
  ["cfb3df7a358a33c3ab583d90b3ce215c3ef2f53a8d994ea040f97c1f4c4ddd28", "examples/parametric.arch"],
  ["1d5d2c0df9dad3beca99c1146fc2457ef40021d604453b012d45dc333d88ba8d", "examples/practice-office.arch"],
  ["02918cde41f10b126dee8f4a0a847c25168eead83c4be59553b88acabb47bd00", "examples/relational.arch"],
  ["a4a2014e8fb5a304471442fd6b8738b26523c1521cb83af5d170ecaa5198251e", "examples/remodel.arch"],
  ["478fdeeb66fd3e037e1665fa1be8a49313c5db38e5802999bb95c6f328754bc2", "examples/sheet-notes.arch"],
  ["f6a6a81fa57cd5183bfbb7c607bdb9599ddf2eebfbc657c0cc4e69c7c0bcae7a", "examples/studio.arch"],
  ["bd6056a84ec5d55dee071e9101fea8d157ce72e0830211a1f66b11291f0e0ef7", "examples/terrace-row.arch"],
  ["503b89ecf0ca78f6c1100f1fd059c0b63080a9bdb3b9401c675c74971816cd21", "examples/themed.arch"],
  ["1a78c5532e6c4bb783da712f6f27c83f5c771765278ec8552940d4f73e32beaa", "examples/tiny-house.arch"],
  ["2357bb50624d8aecb9ce28dfa643030e55b29392d45f92a0406b17e2e6ddcab8", "examples/townhouse.arch"],
  ["12a2c3da84bc3fb045fc784bcad3851edaaf6ae0ec539727b52a5d39e58dca2b", "examples/transit-hall.arch"],
  ["f220acec3a66201d974fd3475459a35d52efe4689fc4f76784ccfae1ddc1b92d", "examples/two-bed.arch"],
  ["654826455338d90bafeb6d342aa4b1d0e2aab5c964b5838507ac2162fa6edf71", "examples/two-storey.arch"],
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
  ["d340196f446839ceda4c324efb5c2c29abab79551b673a72b95abeabc64d3fe2", "test/fixtures/off-path-bypass.arch"],
  ["b1d58662ed6a557fd27aa948f640a3a70d38552402506413bd13f774a15fa47b", "test/fixtures/schedule-sheet.arch"],
  ["ac6b7954d2cefaa2461c5e8111d1004603b931ef133597f0971e07db78c6dd42", "test/fixtures/star30.arch"],
  ["6e48c810b2a663d3bed9872c72baf36b60f0c66b9ee4d45d8ada5bb6ff855a40", "test/fixtures/storeys-eaves-overflow.arch"],
  ["f003e58744492a4b562ef28436484454401495ad76df042d14c468d3c0533243", "test/fixtures/zones-levels.arch"],
  ["ee9f057b82b717e4b7c0753daef62a2baa9b3df5c5d8aa617079c3dedce0081e", "test/fixtures/zones-wings.arch"],
  ["edc62a570b76ff9877ab4515a7a83826cc91bf70328a315fe62f42ff17f3a843", "test/walls-from-rooms/relational.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "test/walls-from-rooms/studio.arch"],
  ["cd33c0b417750000635a33a16ddda770a3c7623673ce9af52d3aea1a8f7e64e6", "test/walls-from-rooms/two-bed.arch"],
  [
    "ef6b4cf52454c07cdd3c22449f6545da111fb35e7f1085d1ec15cd8c94903e4b",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "test/walls-from-rooms/widen.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "plans:studio-twin"],
  ["cd33c0b417750000635a33a16ddda770a3c7623673ce9af52d3aea1a8f7e64e6", "plans:two-bed-twin"],
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
    "c6383deacde2c6dcc29324161286900e379b3a5455d55d666f4eedfe7a34ae0c",
    "test/defect-corpus/stair-safety/head-against-wall.arch",
  ],
  [
    "8006f82586d77cdcbc25604e629d40fbc2bded96324e9215acb81a7fa5080701",
    "test/defect-corpus/stair-safety/head-against-wall.clean.arch",
  ],
  [
    "b62b21fb25e4251c18c2f2920b95545186c51990fbac7f93abed99234ba73dcd",
    "test/defect-corpus/stair-safety/riser-too-high.arch",
  ],
  [
    "f09d66b97645ac11e71c9449884a203e2a1ed7401be1fc7d17ed42e180918737",
    "test/defect-corpus/stair-safety/riser-too-high.clean.arch",
  ],
  [
    "62561237624e63dc6963d928aba528b086ab20190498b45c03f0a3efdf5195b0",
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.arch",
  ],
  [
    "9d602f21ac870ab1ff52a11a872cb62969675bbb268856596f77418c32820e58",
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.clean.arch",
  ],
  [
    "a5712c574f3be15f891f474b7a2e3b7a91d608ccc68ac436abd41cf69b40c532",
    "test/defect-corpus/stair-safety/stair-too-steep.arch",
  ],
  [
    "7048d5cf94fbf7484f9b3cbb8bbff523c970657ffc20d6c8606a7971a13f05e7",
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
    "9973266c0262637c62af5e92452aaf6efc7830da88cf81da82d2cecd56da9495",
    "test/defect-corpus/stair-safety/void-at-stair-head.arch",
  ],
  [
    "43e1e7b81a86c292b022efcb446fef4f26fb29040082cb96693088bc8f35d3ea",
    "test/defect-corpus/stair-safety/void-at-stair-head.clean.arch",
  ],
  ["803382568b44d2abe330873b5b788636b5dae38beea8416ea9da39a9fb3a12ab", "inline:stair-words-as-names"],
  ["f1497554533ffa39becdfaf8494d14a9d2aa84d8eee0455a4eaf4feffa213aba", "inline:stair-square-and-narrow"],
  ["0ba9460627a738d65c7d5235e533ad8410bf7a548bfedc69dca44f987793ee91", "inline:stair-placed"],
  ["4167a1570bdd1c88c93532347194b825f6146a42193aaecd515e3bd6b1853cf6", "inline:stair-arrival"],
  ["e6eed958e1d4cea68f7981fce9964af4b5a26fa3d09ad3eafebb0992ce5cb727", "inline:stair-refusals"],
  ["57879436768cab2c738430d6586f0e88de6cb79c178799a011c9d09f73e553df", "inline:stair-parse-refusals"],
  ["8d7f88735fa076c8f5a55135c402613be1a877985145ffd0cc197994e666859d", "examples/turning-stair.arch"],
  ["0545c17080e7f460aacef3ed290df0f1d0ae9dd91403dacfbc1f5108bfcf2fe3", "inline:floor-words-as-names"],
  ["8d3b15bc029b1499bac84456b2c464f72b6a42c059a22875841f2a0338236588", "inline:floor-old-words-rendered"],
  ["ef4ef5ebdea707d29660779fea0c833215642abb2905346baa5cfd11a8a43bff", "inline:outdoor-old-kinds-rendered"],
];

const pinned = new Map(BASELINE.map(([digest, name]) => [name, digest]));

suite("floor words and ground kinds: the byte-identity law", () => {
  it("the table pins every row, and no row writes any of the words or mistypes one", () => {
    expect(BASELINE.map((b) => b[1])).toEqual(ROWS.map((r) => r.name));
    for (const form of FORMS) expect(ROWS.filter((r) => writes(r.src, form)).map((r) => r.name)).toEqual([]);
    expect(ROWS.filter((r) => mistyped(r.src)).map((r) => r.name)).toEqual([]);
  });

  it("the premise can fail: the same check sees each word written, and the lists are the card's", () => {
    expect([...FLOOR_PATTERNS]).toEqual(FLOOR_MATERIALS.filter((w) => !OLD_FLOORS.includes(w)));
    expect(OUTDOOR_KINDS.slice(-2)).toEqual(NEW_KINDS);
    const room = (floor: string) => `plan "P" {\n  units mm\n  room id=a at (0,0) size 3000x3000${floor}\n}\n`;
    for (const w of FLOOR_PATTERNS) expect(writes(room(` floor ${w}`), "floor word"), w).toBe(true);
    for (const w of OLD_FLOORS) expect(writes(room(` floor ${w}`), "floor word"), w).toBe(false);
    const ground = (k: string) =>
      `plan "P" {\n  units mm\n  level 1 {\n    outdoor ${k} at (0,0) size 3000x3000\n  }\n}\n`;
    for (const k of NEW_KINDS) expect(writes(ground(k), "outdoor kind"), k).toBe(true);
    expect(writes(ground("lawn"), "outdoor kind")).toBe(false);
    expect(mistyped(room(" floor marble"))).toBe(true);
    expect(mistyped(ground("sandy"))).toBe(true);
    const sheet = (block: string) => `plan "P" {\n  units mm\n  ${block}\n  room id=a at (0,0) size 3000x3000\n}\n`;
    for (const w of NEW_WORDS) expect(writes(sheet(`sheet text { ${w} "x" }`), "sheet text key"), w).toBe(true);
    expect(writes(sheet('sheet text { tile "Fliese" }'), "sheet text key")).toBe(false);
    expect(mistyped(sheet('sheet text { sandd "x" }'))).toBe(true);
    expect(mistyped(sheet('sheet text { tile "Fliese" }'))).toBe(false);
  });

  it("the digest can fail: each word moves it, under the default theme and under `rendered`", () => {
    const room = (theme: string, floor: string) =>
      `plan "P" {\n  units mm\n${theme}  room id=a at (0,0) size 3000x3000 uses living${floor}\n}\n`;
    for (const theme of ["", "  theme rendered\n"]) {
      const plain = stairLawDigest(API, room(theme, ""), undefined);
      for (const w of FLOOR_PATTERNS)
        expect(stairLawDigest(API, room(theme, ` floor ${w}`), undefined), w).not.toBe(plain);
    }
    const ground = (k: string) => `plan "P" {\n  units mm\n  outdoor ${k} at (0,0) size 3000x3000\n}\n`;
    for (const k of NEW_KINDS)
      expect(stairLawDigest(API, ground(k), undefined), k).not.toBe(stairLawDigest(API, ground("paving"), undefined));
    // A `sheet text` key that names a new word renames its legend row.
    const legend = (block: string) =>
      `plan "P" {\n  units mm\n  legend\n  ${block}\n  room id=a at (0,0) size 3000x3000 floor timber\n}\n`;
    expect(stairLawDigest(API, legend('sheet text { timber "Holz" }'), undefined)).not.toBe(
      stairLawDigest(API, legend('sheet text { tile "Fliese" }'), undefined),
    );
  });

  // One law per form: every row that does not write the form is byte-identical to `35ed277f`.
  for (const form of FORMS) {
    const rows = ROWS.filter((r) => !writes(r.src, form)).map((r) => [pinned.get(r.name)!, r.name] as const);
    it.each(rows)(`no ${form}: %s %s`, (digest, name) => {
      const row = ROWS.find((r) => r.name === name)!;
      expect(stairLawDigest(API, row.src, worldOf(row.dir))).toBe(digest);
    });
  }
});
