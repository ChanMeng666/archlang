/**
 * Rectilinear rooms in `walls from rooms` and `door|opening between` (issue #363, cards L1, L2):
 * the byte-identity law.
 *
 * A plan with no rectilinear polygon in a `walls from rooms` set, or named by a `door|opening
 * between`, resolves, draws, describes and lints exactly as before, down to its Scene and the steps
 * its resolution spends. Each digest is {@link lawDigest} (`test/helpers/rectilinear-rooms-law.ts`): every
 * page's SVG, `describe()`, `lint()`, `compile().diagnostics`, every page's Scene and the step
 * count, **measured against `src/` at `58c1fc81`** (`main` before the form), that tree extracted by
 * `git archive`, the body imported from this branch and handed that tree's compiler. The three
 * `inline:door-` rows are card L2's, measured the same way at `1e29c3af` (`main` before doors). The
 * rows are every plan of `examples/`, `test/fixtures/` and `test/walls-from-rooms/`, the digest-table plans of
 * `test/tables/walls-from-rooms-plans.ts`, and {@link INLINE_ROWS}: a rectilinear polygon that is
 * excepted, or that stands beside typed walls, is on the law's side of the line. A plan written
 * after the form that uses it is left out by name ({@link AFTER_THE_FORM}), and must reach it.
 *
 * In this table the digest comes first: a row keyed by a path holding `access` is the shape the
 * secret scanner reads as a credential, and this order is not that shape.
 *
 * Why the rows hold (design §6): a rectangle-only set takes the sweep's new branch nowhere, because
 * one room on both sides of a line needs a polygon, and every charge is on the rectangle count,
 * which is the room count there. A `between` of two rectangles keeps its line arithmetic and costs
 * no step more: the ring path is taken only when the table holds a ring for a name. The sanctioned
 * exception is the wording of a refusal: a slanted polygon or a circle in a set, or named by a
 * `door|opening between`, reads "rectangular or rectilinear" now (`E_ROOM_NOT_RECTANGLE`,
 * `E_WALL_BETWEEN_ROOM`, the third class of `test/byte-identity-baseline.ts`'s header). No row here
 * raises either.
 *
 * A digest moving is a finding to explain before it is a diff to re-measure.
 *
 * Re-measured once (H10), for two charges side by side: `polygonSelfIntersects` now charges one step
 * per edge pair of a ring ("ring scan"), and `polygonsOverlap` charges what it reads of two rings
 * whose boxes overlap, 14 reads to a step ("overlap", M.19 reopened). The step count is part of this
 * payload, so a row that reaches either moved on that count alone, by exactly those two amounts,
 * which each marked row states. The rows marked `H10` are {@link lawDigest} on `58c1fc81` (`1e29c3af`
 * for an `inline:door-` row) with those charges applied (`src/geometry/polygon.ts`) and nothing else.
 * For every row, this branch's payload with the old step count put back reproduces the digest taken
 * on that tree.
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
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { rectilinear } from "../src/room-tiling.js";
import { NULL_WORLD, type World } from "../src/world.js";
import { type LawApi, lawDigest, lawRows, ROOT } from "./helpers/rectilinear-rooms-law.js";

const stepsOf = (src: string, world: World | undefined): number => {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const w = world ?? NULL_WORLD;
  return evaluationSteps(resolveAll(link(ast, w, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, w));
};

const API: LawApi = { compile, describe, lint, stepsOf };

/**
 * Does the plan put a rectilinear polygon in a `walls from rooms` set, or name one in a
 * `door|opening between`? The doors are read off the source, since a refused one has no relation,
 * and the rooms off the resolver itself, since `resolvePlan` hands back no plan that has an error.
 */
function reachesTheForm(src: string, world: World | undefined): boolean {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return false;
  const w = world ?? NULL_WORLD;
  const res = resolveAll(link(ast, w, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, w);
  const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
  const named = new Set(
    [...src.matchAll(/\b(?:door|opening)\b[^\n]*?\bbetween\s+(\S+)\s+and\s+(\S+)/g)].flatMap((m) => [m[1]!, m[2]!]),
  );
  const isRing = (r: { poly?: readonly { x: number; y: number }[]; circle?: unknown }): boolean =>
    r.poly !== undefined && r.circle === undefined && rectilinear(r.poly);
  return irs.some(
    (ir) =>
      ir.elements.some((r) => r.kind === "room" && isRing(r) && named.has(r.id)) ||
      ir.elements.some(
        (s) =>
          s.kind === "walls" &&
          ir.elements.some(
            (r) => r.kind === "room" && r._instance === s._instance && isRing(r) && !s.except.includes(r.id),
          ),
      ),
  );
}

/**
 * Plans written after the form that use it: no tree before the form can measure them, so the law
 * cannot pin them. Each must reach the form (the list cannot hide a plan the law should pin), and
 * the table pins every other row.
 */
const AFTER_THE_FORM: readonly string[] = [
  // RM8.5: its hall is one U polygon round the courtyard, in `walls from rooms`.
  "examples/courtyard-family.arch",
];
const ALL_ROWS = lawRows(ROOT);
const ROWS = ALL_ROWS.filter((r) => !AFTER_THE_FORM.includes(r.name));
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** Measured at `58c1fc81`, the `H10` rows with those charges applied (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["262def0349197a52678b48368bc427c7bd002861a06506cb9353dea8772119fe", "examples/accessible.arch"],
  ["e4938abfa6b11c115e1fe889bf39f50aec8c0976c163627cc1806ee91ae00504", "examples/aquarium.arch"], // H10: +1469 ring scan, +939 overlap
  ["44575ad4610b8698bb5193ccfbd2a35fae9638f3eecbcaf9bb65b40041d7545d", "examples/attached.arch"],
  ["25a7e576e72eff4b17d9e413a62555623cd574486f2ac6f0582e7265cab03410", "examples/bungalow.arch"], // H10: +6 ring scan, +0 overlap
  ["2d9c5b68d269781bfe03311585db9f686e66b894328970f5d4c85c2b48535357", "examples/classroom-block.arch"],
  ["4d780f08439f66219a6b061b5e432fa86b4d341778506c21e53a61620635bc4d", "examples/clinic.arch"],
  ["5bfc83bb3f427c155354f44d70fc05a6a19a9ba2642654beda61d7e771e3b513", "examples/corner-cafe.arch"], // #367, see test/byte-identity-baseline.ts
  ["831f2361315707f3e43673598afab534281457234067eafa45f7e5060b8ceb83", "examples/courtyard-house.arch"], // H10: +34 ring scan, +0 overlap
  ["d4c16e520cd04dc9f2f2598e37cd9405e158c0c2bd5eba42b81ff7a5e81fe36c", "examples/furnished-flat.arch"],
  ["20483588dff5ba2e3ccfd05f2f7e5208036426fd579d0c06bea6151ff7fd6b67", "examples/gallery-l.arch"], // H10: +21 ring scan, +8 overlap
  ["681b232ee25561997018e7f86bea85fefc427392402f8d91757d41fb65950997", "examples/garden-house.arch"], // H10: +36 ring scan, +0 overlap; RM1.3a, see ./byte-identity-baseline.ts; CO.1: the example writes its 2 snapped `against` sizes out (+26 bytes), so only spans and the steps of the written clauses (+8) moved; see the header (was 89ea3236); RM9.2, see ./byte-identity-baseline.ts
  ["401f1c0cfe101f19982821ca2e2830c92951f236b723586499af8be2892dbf2b", "examples/garden-loft.arch"],
  ["d9a3b8c66ec2f242d2938dccecddd0553b964d72735d42ee005c33f003182968", "examples/hexagon-pavilion.arch"], // H10: +36 ring scan, +92 overlap
  ["5522225a6edf30fd1601818f33de5444700044308366d5903cf702a006e816b4", "examples/hillside-villa.arch"], // H10: +32 ring scan, +0 overlap; RM1.3a, see ./byte-identity-baseline.ts; CO.1: the example writes its 3 snapped `against` sizes out (+40 bytes), so only spans and the steps of the written clauses (+12) moved; see the header (was c0385530); RM9.2, see ./byte-identity-baseline.ts
  ["7d331b6506b22f2f3b347f7cd69066691419d8ce179543e995880159f3fd9781", "examples/imports.arch"],
  ["26816d797d510816465174bbf098dea5d5cc5be66d04a41ab3d7e7c7a4c6eb51", "examples/knob-flat.arch"], // new example (P4, the knobs example)
  ["62335f52177f148116eb6bbc2a2d294c3fcee7ff6edb1e02cc2864af42ac2078", "examples/laneway-house.arch"],
  ["3f563f5e8b43e8d881767e76f0d290dc1cd313b2030e31063dfb7bd58a116bca", "examples/library.arch"],
  ["f44cf859229b71e72bbbdeb81012ff8ef9345d3cf43a80d3efb3a7e4f2968f3c", "examples/materials.arch"],
  ["e949de01e019689e380fadbf6801c76b79b1f184a8e327f3dd9f67ba5179280c", "examples/museum-wing.arch"],
  ["a4976a4998a0879673f204c5b2380da1d6d076b541c71d5e0aec2ee0704807a0", "examples/museum-wings.arch"],
  ["e6bbbec9817d58a5bee06cc6ca00b3606a5d66dfea66e58c65fc980765ef7be0", "examples/museum.arch"], // CO.1: the example writes its 5 snapped `against` sizes out (+65 bytes), so only spans and the steps of the written clauses (+10) moved; see the header (was 6e9a779e)
  ["e5c34d6978bd49dec5063e1269e7d39bf538dfef5cdfe0ecd92507725df683d1", "examples/one-room.arch"],
  ["1cea397c4ccf63c7117cd82a688c20fbf83a3929321bd0d17d35ac314ff54526", "examples/parametric.arch"],
  ["5cf7af4ce2f9518bb0eff6696d97d8ed834d11601b153474cde64f846dfbff22", "examples/practice-office.arch"],
  ["678707d468322ff24ce8915bd462b4e21c095a0f46dc46a68504044ee4fceb1d", "examples/relational.arch"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["5cbb6abfc75147d3e38de1845e6c126d860b1a871571ce205479763eebb1a2bc", "examples/remodel.arch"], // `centreline_at`, see ./byte-identity-baseline.ts; CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was facbd0d5)
  ["8e4e97e34d32dc441f15d2daba75078563009745add61aa21959de8495f9d9a3", "examples/sheet-notes.arch"],
  ["aadd36ceb57aa3def298e2052e3eb75e6a0adffda89582598c87996b26d6f043", "examples/studio.arch"],
  ["2177671f90a2b15d52e9448a4d53d0d8378ff9d2f8ad609843f598ca6f0287da", "examples/terrace-row.arch"],
  ["581409daa1ba3e4a05cf5faf0e9b88b139941b6c33ae4d9cbc89a1b44d690f01", "examples/themed.arch"],
  ["d3dbf4f8bf57cb0b7b5f0a1e7aba17ca7513e2da8a007f31d6259c60dbde6269", "examples/tiny-house.arch"], // H10: +6 ring scan, +0 overlap
  ["bffa8d8c2c6a05a9e28f921dd9b0c8e81b764c68dfa8b7a8fb430e2475339a78", "examples/townhouse.arch"], // H10: +12 ring scan, +0 overlap; RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["1582b2276e4992205c712bdac6678bf27056c2ae5c1b26a13d6ed29f41cb877b", "examples/transit-hall.arch"],
  ["9be220d7fa5b952acb7469b79a7f1d10b98af354edffc3b578c2c4652ba555ed", "examples/turning-stair.arch"], // new example (S2): no rectilinear room; `centreline_at`, see ./byte-identity-baseline.ts; RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["8b28b25e441d1f053afb7f245c0f4ff8b791fea8139b5dd031e58831a8c659a2", "examples/two-bed.arch"], // H10: +6 ring scan, +0 overlap; `centreline_at`, see ./byte-identity-baseline.ts; CO.1: the example writes its snapped `against` size out (+13 bytes), so only spans and the steps of the written clauses (+2) moved; see the header (was 8f5ccdac)
  ["cd9e3706411887efcaaad62e23d821c886b4827ca48e083021b3beedc7172cd1", "examples/two-storey.arch"], // H10: +12 ring scan, +0 overlap; RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["c4a585b5e4993d13f8eb5450544c3c6ac314d685a5a8edb92e7f9939aba83e9d", "test/fixtures/axes-grid.arch"],
  ["5336af359d30144ea7f14a069b605773dab5615c8a72f5182a07dfd03d318ada", "test/fixtures/chain30.arch"], // #367, see test/byte-identity-baseline.ts
  ["cbfb99f4c6105f1dc4686f8c90aae852f5c78f87bbf40cfdcf3271bbf3e1bb04", "test/fixtures/dense-bays.arch"],
  ["0df726a1d2004ea61e02c4b65237414ada594d24faf2a027554eee1d7d0b27c0", "test/fixtures/dense-office.arch"], // AL6: a new row, see ./byte-identity-baseline.ts
  ["3f9b93799a04497b79ad1a64e8a9ab39396afc6f3cc2e7926b166c22932b40cd", "test/fixtures/diff-a.arch"],
  ["def6a1888f39f8cece746688cc51129fa95abe845502c284403c1bba8dba70aa", "test/fixtures/diff-b.arch"],
  ["112de470442386e3d55823c4184edc7dde68c862d1c929f86b103a64a93641c2", "test/fixtures/diff-circ-a.arch"],
  ["eac0660c1fdf0623c05d687c7c1dc6dd555b07cd0f3109c706cfcaabd01e2f54", "test/fixtures/diff-circ-b.arch"],
  ["fba3413f6775161d75a13c20ce352e9db7617cc7c2862c9828dea25b83b0f42a", "test/fixtures/lock-before.arch"],
  ["cb9b414d1452e9c9e6e5091818f7806ae8f249812f91779431a12607c57477ef", "test/fixtures/lock-partition-moved.arch"],
  ["911b2c771e68c9931bab3f95995873a2027f757705140f4bbcd53e4a3fb9df76", "test/fixtures/lock-window-moved.arch"],
  ["ffa5f189efd9d7fbaa321a32a24e7942a74be753b443a73bd78b8ea382cbbfe5", "test/fixtures/off-path-bypass.arch"], // RM1.4: the unknown-furniture search is charged to the step meter (+29 steps: `cabinet`, 234 -> 263) (was 947c91d4)
  ["26996528ae8fe4896d15f7cb23558c03be88e1b7dde573ff36ea95a0f0f2432d", "test/fixtures/schedule-sheet.arch"],
  ["2f0c4e2b63425468b46263ab7a6581dfd15bd12fadc36db828f97f6fc079a17c", "test/fixtures/star30.arch"], // #367, see test/byte-identity-baseline.ts
  ["c4068bcffcf2d16649187db428d6287195d49735d1a9e8e001ef62d7b27cec69", "test/fixtures/storeys-eaves-overflow.arch"], // H10: +12 ring scan, +0 overlap; RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  // was 5c3ce8b3. D27: this plan's stair stands in no wall, so `bounds()` reaching its break line widens the
  // drawing 156 mm. Only the SVG, the Scene and the overlay moved: with the old ones put back the old digest returns.
  ["c7f59a307241b34c9bffce2308c512728493b23d3118fd33baf43bbb79b054ea", "test/fixtures/zones-levels.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["3795021918eab02d38979618173a348100b1b7e0265d3a0308c8ee12dc4fb8dd", "test/fixtures/zones-wings.arch"],
  ["952eaf929d8902442dd0949e6eb4e47e96bd422839f97839d627ced86b92bfab", "test/walls-from-rooms/relational.arch"],
  ["45b54b55b05cb37250a074822e9a8663cbdb30943f9986042e2d9ff73de1e5fe", "test/walls-from-rooms/studio.arch"],
  ["dce94a8b897ecfd9c2119f9102f3710f2d7ec91e1a53a9973aaf4f4d9810bf88", "test/walls-from-rooms/two-bed.arch"], // H10: +6 ring scan, +0 overlap; RM1.4: snapping is now reported (this test plan's 850x2000 sofa and 450x600 basin under grid 100 raise W_GRID_SNAPPED; steps 629 -> 757, +128 = two DIAGNOSTIC_STEPS) (was c37b6759); CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was 23caf64c)
  [
    "e34ebf0bb5db581599908cb00a756d35ca6123585b36cc7bb31cebf1dbe5a6d7",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["926ffff72612a4181cca6a69c423dd217536149ecb546237451555a9a420ca2b", "test/walls-from-rooms/widen.arch"],
  ["45b54b55b05cb37250a074822e9a8663cbdb30943f9986042e2d9ff73de1e5fe", "plans:studio-twin"],
  ["dce94a8b897ecfd9c2119f9102f3710f2d7ec91e1a53a9973aaf4f4d9810bf88", "plans:two-bed-twin"], // H10: +6 ring scan, +0 overlap; RM1.4: snapping is now reported (this test plan's 850x2000 sofa and 450x600 basin under grid 100 raise W_GRID_SNAPPED; steps 629 -> 757, +128 = two DIAGNOSTIC_STEPS) (was c37b6759); CO.1: +1 W_GRID_SNAPPED (a sizeless `against` piece on a grid), steps +64 = 1 x 64; see the header (was 23caf64c)
  ["926ffff72612a4181cca6a69c423dd217536149ecb546237451555a9a420ca2b", "plans:widen-4000"],
  ["c2df8198835d6360cb2895b79d725c4f0516c5f3e118b3d239e9d489132d51cd", "plans:widen-4500"],
  ["4c78ce0c73bc8f9f1cef4703c25c6ad5a1164b13f51abaf6ad1a5a46f026e53e", "plans:courtyard"], // H10: +6 ring scan, +0 overlap
  ["0a0cde0f3454804a58ce1b7409c75911b7ff02b22b2f33d73d8f6cb3ffa5854f", "plans:void-hole"],
  ["e5860f56aa6538d37522276265fee7f6fabc65f8c412aae74b7580f1f1322c2a", "plans:instances"],
  ["36fca5359a7a3d2b364681815f85fcb3b1dae34841a62ccf0cbcaff56c6860fb", "plans:coexist"],
  ["53e9e1b6d9ec05af01975bbf4cb45daf9643638b67fd1803a71a678a51769869", "plans:refused"],
  ["0e5fbd67618f96112e4094f744efb0c6bd955da39b6c5754e1a857f2ee794c73", "plans:open-plan"],
  ["f289077bd51bafdd17c25269a83919b792fb3b363e772da02743a5a75ebf4315", "plans:open-width"],
  ["f69a63ac6b9c15b42337a03b6ae51a7dabd0d14745d44431cd26f5c0fcca007c", "plans:open-instances"],
  ["6d2f8ec2e8511dd5497f752dabee9f37fbf42905e5d1774dd9de64762eb131c3", "plans:clauses-refused"],
  ["889465609e8eb6e43ad713ed4a296e525013a60e5b442546cfbeca7de0f664de", "inline:issue-hybrid"], // H10: +15 ring scan, +8 overlap
  ["dd1a86262ce68c313653113d1c5e214652c86b42ecf399e45c7ffa7f16f589c5", "inline:typed-walls"], // H10: +15 ring scan, +8 overlap
  ["80a6ed511c4e8c1f2a7a3cd62782651f731b613eaad4cb18fd2465abc1de91b3", "inline:except-slanted"],
  ["874344a801971326859871db55b47877705079a16b852fe5aa0d75e1899b0e9a", "inline:clauses"],
  ["38cc9a4086d56351eeaedd9b8a088ac60c3e04bc0865089d50ed929f813216b9", "inline:door-beside-excepted-L"], // H10: +15 ring scan, +8 overlap; `centreline_at`, see ./byte-identity-baseline.ts
  ["03cb65e691bdcc7bec6e8382a8528924e6e470e3e98817a380d653b299862347", "inline:door-positions"], // `centreline_at`, see ./byte-identity-baseline.ts; `W_SWING_OBSTRUCTED`'s hints name no `<wall>` on a derived wall (#401 residue): lint text only
  ["28e9a77964e2f33f02ac570119ef9f757c67399da8753bb4a931bcbed513e027", "inline:door-refusals"], // refused as it was, in the same steps: `E_UNKNOWN_REF` and `E_DATUM_UNPLACED` now name the room the line wrote, not `.top` (#401 residue)
];

suite("rectilinear rooms: the byte-identity law", () => {
  it("the table pins every row, and no row reaches the form", () => {
    expect(BASELINE.map((b) => b[1])).toEqual(ROWS.map((r) => r.name));
    expect(ROWS.filter((r) => reachesTheForm(r.src, worldOf(r.dir))).map((r) => r.name)).toEqual([]);
  });

  it("every plan left out for postdating the form exists and reaches it", () => {
    for (const name of AFTER_THE_FORM) {
      const row = ALL_ROWS.find((r) => r.name === name);
      expect(row, name).toBeDefined();
      expect(reachesTheForm(row!.src, worldOf(row!.dir)), name).toBe(true);
    }
  });

  it("the premise can fail: the same check sees a plan that does reach the form", () => {
    const L = "room id=l polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000)";
    const src = `plan "p" {\n  units mm\n  ${L}\n  walls from rooms exterior 200 partition 100\n}\n`;
    expect(reachesTheForm(src, undefined)).toBe(true);
    // A door on a ring the statement leaves out, and one refused: both are the form.
    const room = "room id=r at (3000,3000) size 3000x3000";
    const typed = `  wall id=w partition thickness 100 { (3000,3000) (3000,6000) }`;
    const door = `plan "p" {\n  units mm\n  ${L}\n  ${room}\n${typed}\n  door between l and r at center width 800\n}\n`;
    expect(reachesTheForm(door, undefined)).toBe(true);
    // The control: the same plan with the door gone does not.
    expect(reachesTheForm(door.replace(/ {2}door .*\n/, ""), undefined)).toBe(false);
  });

  it.each(BASELINE)("%s %s", (digest, name) => {
    const row = ROWS.find((r) => r.name === name)!;
    expect(lawDigest(API, row.src, worldOf(row.dir))).toBe(digest);
  });
});
