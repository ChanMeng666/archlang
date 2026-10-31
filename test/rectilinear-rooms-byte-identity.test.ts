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
 *
 * Re-measured once (H10), for two charges side by side: `polygonSelfIntersects` now charges one step
 * per edge pair of a ring ("ring scan"), and `polygonsOverlap` charges what it reads of two rings
 * whose boxes overlap, 14 reads to a step ("overlap", M.19 reopened). The step count is part of this
 * payload, so a row that reaches either moved on that count alone, by exactly those two amounts,
 * which each marked row states. The rows marked `H10` are {@link lawDigest} on `58c1fc81` (`1e29c3af`
 * for an `inline:door-` row) with those charges applied (`src/geometry/polygon.ts`) and nothing else.
 * For every row, this branch's payload with the old step count put back reproduces the digest taken
 * on that tree.
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

const ROWS = lawRows(ROOT);
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** Measured at `58c1fc81`, the `H10` rows with those charges applied (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["262def0349197a52678b48368bc427c7bd002861a06506cb9353dea8772119fe", "examples/accessible.arch"],
  ["b53db64ebc080b48cea74c90edf8705664e48365a428d23c0c16fc7731ce6cba", "examples/aquarium.arch"], // H10: +1469 ring scan, +939 overlap
  ["44575ad4610b8698bb5193ccfbd2a35fae9638f3eecbcaf9bb65b40041d7545d", "examples/attached.arch"],
  ["ba6bfa022ec919d18bb8641bb5cc50f12e4cdbe0c2f72be4ce5586d058fa3acd", "examples/bungalow.arch"], // H10: +6 ring scan, +0 overlap
  ["4776988cf9066c16be109b2ae2e10ae2f845f5e614d9866a1f485aaa0ac41f2e", "examples/classroom-block.arch"],
  ["7cfb19460c7ecbe6d7c8bce669d0d4c268aaef2eefdc9e2a4d0b282810601c4c", "examples/clinic.arch"],
  ["4daf0582ee7e899fddc98a460391781f9faec0082ebab85706e15ff466cf2b3d", "examples/corner-cafe.arch"],
  ["2fa285ac0a1406f1c19a4f5b8cd6405b9435f3192b681642f9f90add9c479fc8", "examples/courtyard-house.arch"], // H10: +34 ring scan, +0 overlap
  ["d4c16e520cd04dc9f2f2598e37cd9405e158c0c2bd5eba42b81ff7a5e81fe36c", "examples/furnished-flat.arch"],
  ["969fe0c639c3e332de2045feda5a3300b521e1964214ea9bf6bbca79c29ee9f4", "examples/gallery-l.arch"], // H10: +21 ring scan, +8 overlap
  ["890ddc4c43eee8321c202addcb421ac12ddc6c4b681e2956c30128245054e918", "examples/garden-house.arch"], // H10: +36 ring scan, +0 overlap
  ["df359e005849a18fc1d8e83823066f09da02733314120bef6d20af6e184fae01", "examples/garden-loft.arch"],
  ["d9a3b8c66ec2f242d2938dccecddd0553b964d72735d42ee005c33f003182968", "examples/hexagon-pavilion.arch"], // H10: +36 ring scan, +92 overlap
  ["be82d0e9243363c83bb31abddb46768357365ecdd9c4a6c2ca34ca4c27244949", "examples/hillside-villa.arch"], // H10: +32 ring scan, +0 overlap
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
  ["d3dbf4f8bf57cb0b7b5f0a1e7aba17ca7513e2da8a007f31d6259c60dbde6269", "examples/tiny-house.arch"], // H10: +6 ring scan, +0 overlap
  ["f5d178bb9bb656c091c877b221077ff67974ac40d04c83e9b20c5236b22c5554", "examples/townhouse.arch"], // H10: +12 ring scan, +0 overlap
  ["8fb90ee449d4117eccc0d2a31d5d58a6eeb9856e8a2b08048c388ac1742d18a6", "examples/transit-hall.arch"],
  ["814df556c729a38328debf09fc80fa142f27e1cf3d7f542ffc4a3919e5afa1c3", "examples/turning-stair.arch"], // new example (S2): no rectilinear room
  ["772d5ca48a89936223bb6d8fd4b40116e649cacc40f14bbd9f32cb5cbf666b78", "examples/two-bed.arch"], // H10: +6 ring scan, +0 overlap
  ["6ee6d812bb6895cc36f98c26b46d58b9e04556f65b72a5c835f30440d409387e", "examples/two-storey.arch"], // H10: +12 ring scan, +0 overlap
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
  ["114ea8bb6ef0556a294603caad1d316ff8bde8732bb63122c52dbd9fcc6c4bd1", "test/fixtures/storeys-eaves-overflow.arch"], // H10: +12 ring scan, +0 overlap
  ["5c3ce8b3d4f3858110637edb74d4760a4d84fba40bfe44795260fb38ada5934b", "test/fixtures/zones-levels.arch"],
  ["3795021918eab02d38979618173a348100b1b7e0265d3a0308c8ee12dc4fb8dd", "test/fixtures/zones-wings.arch"],
  ["952eaf929d8902442dd0949e6eb4e47e96bd422839f97839d627ced86b92bfab", "test/walls-from-rooms/relational.arch"],
  ["45b54b55b05cb37250a074822e9a8663cbdb30943f9986042e2d9ff73de1e5fe", "test/walls-from-rooms/studio.arch"],
  ["c37b6759709f6e4cbd71701005e6dd5808c5b24ad4b26e150b6fad32cb70d707", "test/walls-from-rooms/two-bed.arch"], // H10: +6 ring scan, +0 overlap
  [
    "e34ebf0bb5db581599908cb00a756d35ca6123585b36cc7bb31cebf1dbe5a6d7",
    "test/walls-from-rooms/widen-after-authored.arch",
  ],
  ["926ffff72612a4181cca6a69c423dd217536149ecb546237451555a9a420ca2b", "test/walls-from-rooms/widen.arch"],
  ["45b54b55b05cb37250a074822e9a8663cbdb30943f9986042e2d9ff73de1e5fe", "plans:studio-twin"],
  ["c37b6759709f6e4cbd71701005e6dd5808c5b24ad4b26e150b6fad32cb70d707", "plans:two-bed-twin"], // H10: +6 ring scan, +0 overlap
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
  ["4a08dc84357ece757d811e7daa5a53f8b377c49913663c2a491e801713d23481", "inline:door-beside-excepted-L"], // H10: +15 ring scan, +8 overlap
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
