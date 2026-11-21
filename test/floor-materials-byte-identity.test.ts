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

import { af7StrippedApi } from "./helpers/af7-notes.js";
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
  ["3471b341d64b36f8ebd0d3786f07d8a912f610d324eaea35d938375e9c647d1f", "examples/aquarium.arch"],
  ["90680592ce7aef9b99598ec8e547044bedf53cebf2edbf890d7fac8db64763ef", "examples/attached.arch"],
  ["199a5fd1b547984cb93e2302d7d896516c3ab4ebb5b09266f5d78c1f24480cee", "examples/bungalow.arch"], // CV13 (was 6f42bf9e): example source edited (chairs added)
  ["4f7bf7282832cdf101db083d17d436221eeb0ac7002d0289e20ce3a7864da163", "examples/classroom-block.arch"],
  ["b6cd385c2dd3c10ad400acb22f9147c2f308a6e7c2e5657f90ec692b35f251d5", "examples/clinic.arch"],
  ["eaa167d41d7272aaae9866cfd38f24392fb9cb768640f0c8efb0d13cb5fac7b0", "examples/corner-cafe.arch"],
  ["c6b64e3fa5815d6b9cbeb2e272f64c23d973fbb059c83ea6e57cc41d9b7195f2", "examples/courtyard-family.arch"], // CO.1: the example writes its snapped `against` size out (+14 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was 64e5593c)
  ["5f557f7ac891e6d732cbcc24ac46b5b337beda47a890eba2528dc8998f8e1efb", "examples/courtyard-house.arch"], // CV13 (was e9866c6c): example source edited (chairs added)
  ["fcb5a98c9bf892177daef2174831cb56be4314d6c9ac66526b1046cd6618438b", "examples/furnished-flat.arch"],
  ["5ebdd5ec17e7e29eeab8413c31506ebca7b1afc26168d4455e29ddf45d4f65a5", "examples/gallery-l.arch"],
  ["6d5955224cdfaff62510ebf2f5a676098617e78f2938c962bac59434d83fb05d", "examples/garden-house.arch"], // RM1.3b, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; CO.1: the example writes its 2 snapped `against` sizes out (+26 bytes), so only spans and the steps of the written clauses (+8) moved; see the header (was dd673d71); RM9.2, see ./byte-identity-baseline.ts
  ["8be510d3825258cde0ae8e0030e44a2b76be0741860e9cc20da7720e5648586a", "examples/garden-loft.arch"], // CV13 (was e9080ba7): example source edited (chairs added)
  ["45e2de363cdbe22f1ab55d40d968083c2181571320c028f78443aa65e80a2558", "examples/hexagon-pavilion.arch"], // CV13 (was 6544b4c8): example source edited (chairs added)
  ["c9f89e9a93be96447f124e7eb52ca32594d06c8e9341e0438a74e3698992ce43", "examples/hillside-villa.arch"], // RM1.3b, see ./byte-identity-baseline.ts; RM1.3b overlay, see ./byte-identity-baseline.ts; CO.1: the example writes its 3 snapped `against` sizes out (+40 bytes), so only spans and the steps of the written clauses (+12) moved; see the header (was 6a0a3529); RM9.2, see ./byte-identity-baseline.ts
  ["943cb8dbb7c0438d4f7d62160dafba83a6861b912a5c8cbf70db47e11ec80be7", "examples/imports.arch"],
  ["5ab98e5edbb819a917045eeeec6448af5fbb7d08837f644769b75274e744fbc8", "examples/knob-flat.arch"],
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
  ["b217f5437945699b6aa83a0ec7f2a4f26b793c2d3e51ddf3295bd06720a7ae3f", "examples/townhouse.arch"], // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was efcb311a): example source edited (chairs added); CV08 (was 8643a4e3): example source edited (sofa turned to face the room)
  ["0fd9ba46a50b7e9438b7f3be5472c52c44a58219a29f22b493f3bd653766a971", "examples/transit-hall.arch"],
  ["6fa4bd1d0de5cc6aa3bc3434687929ece4ac4052356462caecb5e55109480d6a", "examples/two-bed.arch"], // CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was f220acec); CV13 (was ea10c4f2): example source edited (chairs added)
  ["9c3489d30cb4bcdea2d3ef3272820bba64eee730f4123585e19f4be3a440ccf3", "examples/two-storey.arch"], // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
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
  ["c80e318bf3434440c98e5c1053396ec945bd717a91c54a79497954cd03f2d820", "test/fixtures/off-path-bypass.arch"], // AF9 (was d340196f): `W_DOORWAY_BLOCKED` on d_d gains a maybe-incorrect move to `at 1570` (its position alone) in lint() (both profiles); SVG, describe(), the diagnostics and the steps are unchanged, and with that fix taken out the old digest returns
  ["2a9bdda5124d6cc976419991440ccccedb9ee1bcbcba18da2098319f271fe1f3", "test/fixtures/schedule-sheet.arch"],
  ["ac6b7954d2cefaa2461c5e8111d1004603b931ef133597f0971e07db78c6dd42", "test/fixtures/star30.arch"],
  ["143ddd7bfd82d51b4527ba8607803a99e38c4f1bd4997d9cf8acf95fb216e29d", "test/fixtures/storeys-eaves-overflow.arch"], // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["5febcfb91b9a3e7bc23705df313a0ac218fb64f35aae5a19b607b313ddca79fb", "test/fixtures/zones-levels.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["ee9f057b82b717e4b7c0753daef62a2baa9b3df5c5d8aa617079c3dedce0081e", "test/fixtures/zones-wings.arch"],
  ["61565f3850374e2db98b80a12890579d8899928f2e32c7ddc45fb5b43169f7c9", "test/walls-from-rooms/relational.arch"], // AF9 (was edc62a57): under `accessibility-advisory` (a 450 mm landing) `W_DOORWAY_BLOCKED` gains a maybe-incorrect move of the door; SVG, describe(), the diagnostics, the default lint() and the steps are unchanged, and with that fix taken out the old digest returns
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "test/walls-from-rooms/studio.arch"],
  ["ede95165106807f3d77fd531424fea9645eaedddf4078c98907567eb5aba5cdd", "test/walls-from-rooms/two-bed.arch"], // CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was cd33c0b4); CV13 (was 4a1ab38e): twin source edited (the two chairs examples/two-bed gained)
  [
    "ef6b4cf52454c07cdd3c22449f6545da111fb35e7f1085d1ec15cd8c94903e4b",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["218c72e6d0d121539ce5514c3cd77c9c27e13f0cbaf3a6d9b49ca20c8d502e62", "test/walls-from-rooms/widen.arch"],
  ["beff13e3b3255103bc80d0698d9bf7b9052f66bf78bf8d0626033bfeeb02adc5", "plans:studio-twin"],
  ["ede95165106807f3d77fd531424fea9645eaedddf4078c98907567eb5aba5cdd", "plans:two-bed-twin"], // CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was cd33c0b4); CV13 (was 4a1ab38e): twin source edited (the two chairs examples/two-bed gained)
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
    "a823dc7289226e3b5fed12d7c3c09c77018a89121bc68b2bb272ed0234918150", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/head-against-wall.arch",
  ],
  [
    "7f034ceb5b31408d50ab0296138ad95d752ca272141c6ee7ff18539c5e206f3f", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/head-against-wall.clean.arch",
  ],
  [
    "353f62418808f03e9a65ba5868a456fe4af337a37bdb19fb0af16f98dcc789c0", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/riser-too-high.arch",
  ],
  [
    "1fe18c7d4e81e2167b88554bd42f8f8a6c491b526b822d19a812548ba6cc79ca", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/riser-too-high.clean.arch",
  ],
  [
    "4c04ddec3195a65a5d06714e23b904ae8a7abfacae6e463d788ca887b66c1e96", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.arch",
  ],
  [
    "ef8de37a85d16d8fd54a0639d0ea09f37301a1a26859c07b617614a331ef9c09", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/shaft-footprint-mismatch.clean.arch",
  ],
  [
    "0f46a66f24bfd3296658a585aff0dcdaead10138a7fd004dc74995f4ce873d49", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/stair-too-steep.arch",
  ],
  [
    "7c6caa77f96e277544acd54ded74ca682c017b2f2f4fa91a3fa659ada81e0131", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
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
    "444444d968b7e432931e7a1218a7f2f43bbd1c5079d9335d3fe213b94ec3cfb4", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/void-at-stair-head.arch",
  ],
  [
    "4d4bfb32187b2a0b26e687f4c2784905b4802b22135e3e3b26239c6240eaffa8", // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
    "test/defect-corpus/stair-safety/void-at-stair-head.clean.arch",
  ],
  ["803382568b44d2abe330873b5b788636b5dae38beea8416ea9da39a9fb3a12ab", "inline:stair-words-as-names"],
  ["f1497554533ffa39becdfaf8494d14a9d2aa84d8eee0455a4eaf4feffa213aba", "inline:stair-square-and-narrow"],
  ["0ba9460627a738d65c7d5235e533ad8410bf7a548bfedc69dca44f987793ee91", "inline:stair-placed"],
  ["802586e9b7cf3f6927c1441481a0e2d14699e57b6b7a50ddb48b71a9b4a902d5", "inline:stair-arrival"], // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["e6eed958e1d4cea68f7981fce9964af4b5a26fa3d09ad3eafebb0992ce5cb727", "inline:stair-refusals"],
  ["1e9d114fa6522be3335f490693d677a052fc7363fd0bbc2b07b2f0849fe16494", "inline:stair-parse-refusals"], // AF4 (was 57879436): its `E_PARSE` now says what the parser expected at the token it stopped at (`expected`); SVG, lint() and every other key are unchanged, and deleting that key gives 57879436
  ["d4fb3835237b1b989e0e45c992f7e4a0c61663d603c62e89de5deb96a2167047", "examples/turning-stair.arch"], // RM1.3b overlay, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["0545c17080e7f460aacef3ed290df0f1d0ae9dd91403dacfbc1f5108bfcf2fe3", "inline:floor-words-as-names"],
  ["8d3b15bc029b1499bac84456b2c464f72b6a42c059a22875841f2a0338236588", "inline:floor-old-words-rendered"],
  ["ef4ef5ebdea707d29660779fea0c833215642abb2905346baa5cfd11a8a43bff", "inline:outdoor-old-kinds-rendered"],
];

const pinned = new Map(BASELINE.map(([digest, name]) => [name, digest]));

/** AF7 (RM-D69): `main`'s digest of each row AF7 re-measured. The law's own digest body, with AF7's
 *  related notes taken out of `compile().diagnostics` and `describe()`, gives it back. */
const AF7_MAIN: [string, string][] = [
  ["plans:refused", "f48b445c3d8f3499ece29b70d20c50207c34adc80e430edccc3d9f6cd36eb114"],
];

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

  it("AF7: each re-measured row moved by its added related notes alone (strip==old)", () => {
    for (const [name, digest] of AF7_MAIN) {
      const row = ROWS.find((r) => r.name === name)!;
      expect(stairLawDigest(af7StrippedApi(API), row.src, worldOf(row.dir)), name).toBe(digest);
    }
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
