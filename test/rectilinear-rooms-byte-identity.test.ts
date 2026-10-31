/**
 * Rectilinear rooms in `walls from rooms` and `door|opening between` (issue #363, cards L1, L2):
 * the byte-identity law.
 *
 * A plan with no rectilinear polygon in a `walls from rooms` set, or named by a `door|opening
 * between`, resolves, draws, describes and lints exactly as before, down to its Scene and the steps
 * its resolution spends. Each digest is {@link lawDigest} (`test/rectilinear-rooms-law.ts`): every
 * page's SVG, `describe()`, `lint()`, `compile().diagnostics`, every page's Scene and the step
 * count, **measured against `src/` at `58c1fc81`** (`main` before the form), that tree extracted by
 * `git archive`, the body imported from this branch and handed that tree's compiler. The three
 * `inline:door-` rows are card L2's, measured the same way at `1e29c3af` (`main` before doors). The
 * rows are every plan of `examples/`, `test/fixtures/` and `test/walls-from-rooms/`, the digest-table plans of
 * `test/walls-from-rooms-plans.ts`, and {@link INLINE_ROWS}: a rectilinear polygon that is
 * excepted, or that stands beside typed walls, is on the law's side of the line.
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
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint, resolvePlan } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { rectilinear } from "../src/room-tiling.js";
import { NULL_WORLD, type World } from "../src/world.js";
import { type LawApi, lawDigest, lawRows, ROOT } from "./rectilinear-rooms-law.js";

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
 * `door|opening between`? The doors are read off the source, since a refused one has no relation.
 */
function reachesTheForm(src: string, world: World | undefined): boolean {
  const res = resolvePlan(src, world ? { world } : {});
  const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : res.ir ? [res.ir] : [];
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

const ROWS = lawRows(ROOT);
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** Measured at `58c1fc81` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["262def0349197a52678b48368bc427c7bd002861a06506cb9353dea8772119fe", "examples/accessible.arch"],
  ["be3d7d2c23ba1e047cced274a72590e436ae8445b4ffe7b371d35bf8941da4e6", "examples/aquarium.arch"],
  ["44575ad4610b8698bb5193ccfbd2a35fae9638f3eecbcaf9bb65b40041d7545d", "examples/attached.arch"],
  ["52e250c7625e9daba6b61b6903cb6981432556b4366c452ed34567af35d8436a", "examples/bungalow.arch"],
  ["4776988cf9066c16be109b2ae2e10ae2f845f5e614d9866a1f485aaa0ac41f2e", "examples/classroom-block.arch"],
  ["7cfb19460c7ecbe6d7c8bce669d0d4c268aaef2eefdc9e2a4d0b282810601c4c", "examples/clinic.arch"],
  ["4daf0582ee7e899fddc98a460391781f9faec0082ebab85706e15ff466cf2b3d", "examples/corner-cafe.arch"],
  ["a0bd447ffb8cd2d914b2bf05f5e15564264c537dbe49f1bfb66f44d8a7dba0a5", "examples/courtyard-house.arch"],
  ["d4c16e520cd04dc9f2f2598e37cd9405e158c0c2bd5eba42b81ff7a5e81fe36c", "examples/furnished-flat.arch"],
  ["02639cad8e5cdffb80a89d45b92a447152e9f0000a3b6924be66425167b6dab4", "examples/gallery-l.arch"],
  ["b907428907abf5d0531f9f9403fd5f08e0c9c282d035ccd01beb0060f98dda87", "examples/garden-house.arch"],
  ["df359e005849a18fc1d8e83823066f09da02733314120bef6d20af6e184fae01", "examples/garden-loft.arch"],
  ["b202db8ab6c6b4e9ed83a99829dc7a2fbc25e43ef6354e293e33d72f8de11dbd", "examples/hexagon-pavilion.arch"],
  ["28e67f2871972202cd7f94e6729b968eb39a14ce1f78f9ffcae94e8283ab7ea9", "examples/hillside-villa.arch"],
  ["7d331b6506b22f2f3b347f7cd69066691419d8ce179543e995880159f3fd9781", "examples/imports.arch"],
  ["d96d19caeabce46e47c45e8c0e3ce20dd1c578b6cc789b04fbe96fa437ef6995", "examples/laneway-house.arch"],
  ["bdabd4b948d566741f259a125dc7785fef086080fa65a997ee6ba802b2f724b5", "examples/library.arch"],
  ["213c92fbdb0b2724f37dcf4b6a69c8284a07e0b1db01be8993bef183399cad3b", "examples/materials.arch"],
  ["4c6d86aeda2a2b463c3e1f4b8e57a0b7a412337d0a846a159292297020e7f54c", "examples/museum-wing.arch"],
  ["15c59814835fd26b4d3a639eb7fc8fe5eb0a358ec90077b2420cfcf4161cbce1", "examples/museum-wings.arch"],
  ["6e9a779e53d3e4ca9051b2a00385661cd0fcee9fa61c4fd77b203824739fc3d3", "examples/museum.arch"],
  ["e5c34d6978bd49dec5063e1269e7d39bf538dfef5cdfe0ecd92507725df683d1", "examples/one-room.arch"],
  ["66ec0cf20311f8457b9c783e04918c5063991fa9c361c80d2ae2906626e1a1b7", "examples/parametric.arch"],
  ["d4d84c989958a7f6849751317b9d8d2a97ec4d2c17bead11a1ce4e15b0fd61ee", "examples/practice-office.arch"],
  ["edcb0d71bda6749ad687f3f8a50399157aff098a0dc7e2fb75b5b73d1bbff936", "examples/relational.arch"],
  ["3726e7f8d740eb135d0b3addc2c54994fce841974b027b3a7781f3850a5c9ac3", "examples/remodel.arch"],
  ["37b4fc842de526931aef55456f668bdc120d4101cab310726e57a293a1479373", "examples/sheet-notes.arch"],
  ["aadd36ceb57aa3def298e2052e3eb75e6a0adffda89582598c87996b26d6f043", "examples/studio.arch"],
  ["2177671f90a2b15d52e9448a4d53d0d8378ff9d2f8ad609843f598ca6f0287da", "examples/terrace-row.arch"],
  ["581409daa1ba3e4a05cf5faf0e9b88b139941b6c33ae4d9cbc89a1b44d690f01", "examples/themed.arch"],
  ["bd51abd73c5bbcf045b8c181431d6d3379e7fbf9b3599284d1e330c86ef3df08", "examples/tiny-house.arch"],
  ["4cf52fb24863ece1a9a965a2581c9fca5f2529d923b2e6a6f7db7686cffabf0c", "examples/townhouse.arch"],
  ["8fb90ee449d4117eccc0d2a31d5d58a6eeb9856e8a2b08048c388ac1742d18a6", "examples/transit-hall.arch"],
  ["5af04a59a7dcb6eda9a43c0da162c3ba1667e31df98836504e41565fbfabef2d", "examples/two-bed.arch"],
  ["1ae2589e982443ecfbfed44f63ad06a0d5f476c32531607483f6ca51d87a38c1", "examples/two-storey.arch"],
  ["449c5ed8dd295c5962225440d46ebac117ee2258e17e05f8ab42ade1ee6e804c", "test/fixtures/axes-grid.arch"],
  ["58be7c4cc24885675f977dd8caf9f531288abdfecd3686a132526c7b45387bb5", "test/fixtures/chain30.arch"],
  ["cbfb99f4c6105f1dc4686f8c90aae852f5c78f87bbf40cfdcf3271bbf3e1bb04", "test/fixtures/dense-bays.arch"],
  ["3f9b93799a04497b79ad1a64e8a9ab39396afc6f3cc2e7926b166c22932b40cd", "test/fixtures/diff-a.arch"],
  ["def6a1888f39f8cece746688cc51129fa95abe845502c284403c1bba8dba70aa", "test/fixtures/diff-b.arch"],
  ["112de470442386e3d55823c4184edc7dde68c862d1c929f86b103a64a93641c2", "test/fixtures/diff-circ-a.arch"],
  ["eac0660c1fdf0623c05d687c7c1dc6dd555b07cd0f3109c706cfcaabd01e2f54", "test/fixtures/diff-circ-b.arch"],
  ["fba3413f6775161d75a13c20ce352e9db7617cc7c2862c9828dea25b83b0f42a", "test/fixtures/lock-before.arch"],
  ["cb9b414d1452e9c9e6e5091818f7806ae8f249812f91779431a12607c57477ef", "test/fixtures/lock-partition-moved.arch"],
  ["911b2c771e68c9931bab3f95995873a2027f757705140f4bbcd53e4a3fb9df76", "test/fixtures/lock-window-moved.arch"],
  ["947c91d438bd4507e84c02e9f1a15cd7417b32717d867d41261599049befdfa9", "test/fixtures/off-path-bypass.arch"],
  ["f6031de45dc54fe15b0c22019de5123543e6aade443518347c48d3373892c9bd", "test/fixtures/schedule-sheet.arch"],
  ["71c077e7287a6f48d48eb515da141b5a6d76176c58b80e6a21f41d4e63f490ba", "test/fixtures/star30.arch"],
  ["d14d04a348ef6d676d12f270715ceb9e1da8ab0aa3b2ec9685f7e78611a6b405", "test/fixtures/storeys-eaves-overflow.arch"],
  ["5c3ce8b3d4f3858110637edb74d4760a4d84fba40bfe44795260fb38ada5934b", "test/fixtures/zones-levels.arch"],
  ["3795021918eab02d38979618173a348100b1b7e0265d3a0308c8ee12dc4fb8dd", "test/fixtures/zones-wings.arch"],
  ["952eaf929d8902442dd0949e6eb4e47e96bd422839f97839d627ced86b92bfab", "test/walls-from-rooms/relational.arch"],
  ["45b54b55b05cb37250a074822e9a8663cbdb30943f9986042e2d9ff73de1e5fe", "test/walls-from-rooms/studio.arch"],
  ["0210c3f2275dca33e06c14da2f35355da0934b289c2cc2c7375b5cc5b051af68", "test/walls-from-rooms/two-bed.arch"],
  [
    "e34ebf0bb5db581599908cb00a756d35ca6123585b36cc7bb31cebf1dbe5a6d7",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["926ffff72612a4181cca6a69c423dd217536149ecb546237451555a9a420ca2b", "test/walls-from-rooms/widen.arch"],
  ["45b54b55b05cb37250a074822e9a8663cbdb30943f9986042e2d9ff73de1e5fe", "plans:studio-twin"],
  ["0210c3f2275dca33e06c14da2f35355da0934b289c2cc2c7375b5cc5b051af68", "plans:two-bed-twin"],
  ["926ffff72612a4181cca6a69c423dd217536149ecb546237451555a9a420ca2b", "plans:widen-4000"],
  ["c2df8198835d6360cb2895b79d725c4f0516c5f3e118b3d239e9d489132d51cd", "plans:widen-4500"],
  ["f5c7501ebe06e18087bd3d95fb088ab05bb769fa115bcf3dc9218c7f88ea7c2f", "plans:courtyard"],
  ["0a0cde0f3454804a58ce1b7409c75911b7ff02b22b2f33d73d8f6cb3ffa5854f", "plans:void-hole"],
  ["e5860f56aa6538d37522276265fee7f6fabc65f8c412aae74b7580f1f1322c2a", "plans:instances"],
  ["36fca5359a7a3d2b364681815f85fcb3b1dae34841a62ccf0cbcaff56c6860fb", "plans:coexist"],
  ["53e9e1b6d9ec05af01975bbf4cb45daf9643638b67fd1803a71a678a51769869", "plans:refused"],
  ["0e5fbd67618f96112e4094f744efb0c6bd955da39b6c5754e1a857f2ee794c73", "plans:open-plan"],
  ["f289077bd51bafdd17c25269a83919b792fb3b363e772da02743a5a75ebf4315", "plans:open-width"],
  ["f69a63ac6b9c15b42337a03b6ae51a7dabd0d14745d44431cd26f5c0fcca007c", "plans:open-instances"],
  ["6d2f8ec2e8511dd5497f752dabee9f37fbf42905e5d1774dd9de64762eb131c3", "plans:clauses-refused"],
  ["4addd7d96bb441da8305e46fe44dba54a70db63fab3c2510a06424a2f9a268dd", "inline:issue-hybrid"],
  ["bce37c5588d4b6c1aee329002d5488ca13af14455a416ab66a160d50a8d27086", "inline:typed-walls"],
  ["80a6ed511c4e8c1f2a7a3cd62782651f731b613eaad4cb18fd2465abc1de91b3", "inline:except-slanted"],
  ["874344a801971326859871db55b47877705079a16b852fe5aa0d75e1899b0e9a", "inline:clauses"],
  ["905fffe3bd86765a62d322d890f63b54a73e7e709e66a537245d7d2b712ae138", "inline:door-beside-excepted-L"],
  ["dd9a9f05506152146ef7778cfcb15a2051d36bf06e5d7da4246e754b0c2fb954", "inline:door-positions"],
  ["d9a51f44cc4e25155b77d0ae1f873ef92d79061cc05fc2b079b7be55b03ebdb0", "inline:door-refusals"],
];

suite("rectilinear rooms: the byte-identity law", () => {
  it("the table pins every row, and no row reaches the form", () => {
    expect(BASELINE.map((b) => b[1])).toEqual(ROWS.map((r) => r.name));
    expect(ROWS.filter((r) => reachesTheForm(r.src, worldOf(r.dir))).map((r) => r.name)).toEqual([]);
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
