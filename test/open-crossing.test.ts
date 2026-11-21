/**
 * `open between` boundaries at one crossing (issue #368): the block left where they meet is
 * removed from the drawing, whole where every run is open, all but the wall left where one stands,
 * and nothing else moves.
 *
 * Why it is removed rather than reported: no statement asks for it, `describe()` names no such
 * thing, `column` is how a plan asks for one, and a warning would name a defect the author has no
 * way to fix. It is the bands' overlap, 120 x 120 mm in the filed plan.
 *
 * Every digest here was **measured against `src/` at `2649b9dd`** (`main` before the four-way
 * fix), with that tree extracted by `git archive` and its own digest body run against it, unless
 * its table says otherwise. A moved row is a finding to explain (`docs/testing.md` section 3),
 * never a re-pin.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 25 digests, of the
 * 25 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 */

import { sha256 } from "./helpers/digest.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, joinWallSet, lint, resolvePlan, toScene } from "../src/index.js";
import { loopWinding } from "../src/geometry/band.js";
import { classifyWallSet } from "../src/wall-lowering.js";
import {
  type CompilerApi,
  allStoreysDigestWithDiagnostics,
  semanticDigestWith,
} from "./helpers/byte-identity-digest.js";
import { FLUSH, FOUR_OPEN, FOUR_OPEN_PLACED, THREE_OPEN_PLACED, UNMOVED } from "./tables/open-crossing-plans.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

const wallsOf = (src: string) => {
  const ir = resolvePlan(src).ir;
  if (!ir) throw new Error("the plan must resolve");
  return ir.walls;
};

type Walls = ReturnType<typeof wallsOf>;
type At = { x: number; y: number };

/** Is there wall at `p` in what the joinery makes of these walls? */
const solidAt = (walls: Walls, p: At): boolean =>
  (joinWallSet(walls, [])?.result.outline ?? []).reduce((n, l) => n + loopWinding(l, p), 0) !== 0;

const stripped = (walls: Walls): Walls => walls.map((w) => ({ ...w, openings: [] }));

/** The points where `arms` `open between` runs end. */
const crossings = (walls: Walls, arms = 4): At[] => {
  const ends = walls.filter((w) => w._derived?.open).flatMap((w) => w.points);
  const same =
    (p: At) =>
    (q: At): boolean =>
      q.x === p.x && q.y === p.y;
  return ends.filter((p, i) => ends.findIndex(same(p)) === i && ends.filter(same(p)).length === arms);
};

/** The direction the one derived run left closed leaves `p` in. */
const standsAt = (walls: Walls, p: At): At => {
  const left = walls.filter(
    (w) => w._derived && !w._derived.open && w.points.length === 2 && w.points.some((q) => q.x === p.x && q.y === p.y),
  );
  expect(left).toHaveLength(1);
  const far = left[0]!.points.find((q) => q.x !== p.x || q.y !== p.y)!;
  return { x: Math.sign(far.x - p.x), y: Math.sign(far.y - p.y) };
};

const DIRECTIONS = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
};

/** Measured at `2649b9dd` (see the header). */
const FOUR_OPEN_SVG = "194956c02cebd53cba314bc794cf6bfa2925f016de48dbe1bdf70ef0ef863e54";
const FOUR_OPEN_SEMANTIC = "49c3ae1b602ae5e576211825736bcfecf13b1ed34b868e38f96bc0d7f58deb68";
// was 6680e7767ccf03d14e31beeafec0c9eb502f2234f71ca9b524acfbbfb6d109fa. RM1.4: snapping is now reported: the plan writes
// `partition 120` under `grid 50` (drawn 100), so describe() carries two W_GRID_SNAPPED; with them removed the old digest returns.
// Then bb3dce0d; RM1.4: the W_GRID_SNAPPED span points at the written value (`120`, not the whole statement).
const PLACED_SEMANTIC = "90a48e9e9651c24375dab526a75ffe442e7bd0c9ca2ce8717f434065f43f1759";

/** Measured at `2649b9dd` (see the header), the first three at `dff02717`. */
const UNMOVED_DIGESTS: [string, string][] = [
  ["two-open-corner", "e89d040b7d65133f0085ff7ecefda754ee734ea60af9c4800cafb942821fd9c7"],
  ["two-open-across", "7bbebfa5d0d4a1a485ae76251f68aaf30b149410a3e6e839b26a90e8a59ac4c6"],
  ["authored-fourth", "cbfd782f6e778e817d34527630b999259e49ca564aaebe91a4817ba90d657d23"],
  ["wall-through", "45f54c9e131d5e64c7c019fcd9af36ea7f7940525f90bc59c388eb12910c5dfe"],
  ["wall-over", "b063a68e7ddfc1a35b38d46137b18825a60a3c72ebf5970ae7b0a3ffc946488b"],
  ["wall-beside", "feb4d99b503ccd0b6535b9dd5102d7d9fc2205e9f942b3a93c1a25719ad45f38"],
  ["authored-flush", "d851658882033b64d51786963b6b99ebf80ee8f157c5d19c5c995236a59ff038"],
];

/**
 * The plans whose crossing this fix draws differently: `[name, semantic, drawn]`.
 *
 * `semantic` (`describe()` + `lint()`) was **measured at `dff02717`**, `main` before this fix, by
 * the same `git archive` route, and has not moved, but for the wording `door-on-narrowed` says
 * beside its value. `drawn` (every page, `describe()`, `lint()`, diagnostics) is **re-pinned
 * deliberately at this fix**, and only the drawing moved in it: the reason stands beside each
 * value, and each `was` is the digest it held until now.
 */
const FLUSH_DIGESTS: [string, string, string][] = [
  // was 8116502d (at 2649b9dd, when it sat in the unmoved table). c|d ran 60 mm past the crossing, on its square cap and the
  // stubs of the three open runs; it now ends on the point, the issue's expected drawing.
  [
    "three-open",
    "c9072388effa81ef2ce63f7be29a1f44be7902ee9d16c786f5908b3c1db6fffa",
    "d98dae7afd9fbcec88a120a7694aed066e53308b97766a1fe95b3a4c501a629e",
  ],
  // New rows, the same reading in the other three directions, at dff02717 the same 60 mm past.
  [
    "three-open-north",
    "97b92846400b83132057dac682c4a2a37d0dcf2185e13c64bbb3cd704beca6bf",
    "a4c0f9848a0d8ba226d363e944d2de4edd0db0b9574bcade5d7534bd1c8011c5",
  ],
  [
    "three-open-west",
    "721bd2e8884f361247748881b5bd4787078132f8bbda89d1648e4d5ce0458f50",
    "83a6e877fcb02e901d02deec1d001721091e821f48f032d89a7c709692865c09",
  ],
  [
    "three-open-east",
    "76675bfb3712602bd46e6c68b45458f0aad52664a4d3c41a5ead5eaa0ee379b1",
    "01609ebd3a3af3c4540b26b5ad4c468acbd6c1313410afc235bd67f50624ccda",
  ],
  // New row: the wall left is 200 mm, and it ran 100 mm past on its own cap.
  [
    "three-open-thick",
    "aa6040500267ea7036e785c9d256d8a5820a85142987c9d6a57782bcc8370c74",
    "1689fbad1419acaf063d6319bb44fa1f200e896ff6952941880d08f0ec876517",
  ],
  // New row: the wall left is 60 mm, and the 120 mm block stood wider than it on both sides.
  [
    "three-open-thin",
    "894aeef5a86edc783c4a11a826c84e7e96b70caa512fabbe34ce9934277b75d8",
    "cd44cfff10834ec8222a4baf6765e72b5a4e06e3c3fce21b9336fa2fc6fba9b5",
  ],
  // was d3a57ef3 (at 2649b9dd, when it sat in the unmoved table). A `width` that stops short leaves the run standing at the
  // crossing, so this is `three-open` with the wall's far end cut by an opening: the same 60 mm.
  [
    "narrowed",
    "efa0f9670cc2f6b76bc05735f344910c6ac2fd109139a05d377ce355bd566315",
    "1fe7112867d5058ee4a4476efa063e41450fba24ea7edcf0b330eb6057945727",
  ],
  // was 63d4b612 (at 2649b9dd, when it sat in the unmoved table). The same 60 mm; the door's jamb at y 3060 keeps the 60 mm
  // of c|d between it and the crossing, which is what stands there of the wall it hangs on.
  // The one row whose `semantic` moved, from 3023c5c4 (and `drawn`, from e83216f4): its one
  // W_OPENING_AT_JUNCTION called the open boundary at c|d's free end a partition wall, and now names
  // it for what is drawn. Three strings, the message and two hints; put them back and both old
  // digests come back, so nothing else in either payload moved.
  [
    "door-on-narrowed",
    "6e080fe8f2c2ebb318fdbc1a4f6cd8e49727be231b7d6981f3c1f34798600507",
    "cc034f7e226b1e11020c940f800e6aa20385a82142c3783849d5a970e5a13e9b",
  ],
  // was a122b452 (at 2649b9dd, when it sat in the unmoved table), pinned then as outside #368's four. Three open runs meet
  // at the T and none stands, so its 120 mm square is the same pier: re-pinned on the issue's
  // "no wall material stays" now every arm at a point is read, whatever their number.
  [
    "open-tee",
    "931fb92a8d31b1e13387534ae7e2f706592cd4a9cd45b8442347795ccffd0a8c",
    "ebcf80e77472143c6ef231e645110493c5727ddebb6c6c5abb847e2e5b3eecbe",
  ],
  // New rows: one run stands at a T, and it ran 60 mm past the point as `three-open` did.
  [
    "tee-stem-stands",
    "5e211ac092b26d708cd747a4cd6e22e2653e8dc12662a735cf5d94268bc51b44",
    "812e65c545be3d2d342e37e3f2ea5f4b671c39826189d5930b84dde01e28f950",
  ],
  [
    "tee-line-stands",
    "cdc23ca34c126c61268910dded4ad819ad7118a1d0f53491b875e6055fa90fbd",
    "8ffa05c8d853627ddfa0a26dd081abdfcef0e85318a3dd9c076aff6d5bef9684",
  ],
];

/** `describe()` + `lint()` of {@link THREE_OPEN_PLACED}, measured at `dff02717`. */
// was c8fb85b921a2bd06e974356a3e1b065b052d33ca53978a4035b1c4fee609001a. RM1.4: snapping is now reported, as for
// PLACED_SEMANTIC above (two W_GRID_SNAPPED for `partition 120` under `grid 50`); with them removed the old digest returns.
// Then 565dff9d; RM1.4: the W_GRID_SNAPPED span points at the written value.
const THREE_PLACED_SEMANTIC = "cf41d12740ec864ba628d374de087bcaf40c68b5c2d336ec02930cb9bc3e8b05";

/** Measured at `2649b9dd` (see the header): every plan of `examples/` and `test/fixtures/`. */
const CORPUS: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "eee3dc30bd94b5f31c7189f719ff38e09d6f56a3d5484f443432591f8f1e737e"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "0dd331e28b8f4e20c3b359c8e819ed738290295cc83934c1a38808d2fd83dc13"], // CV13 (was 074d5531): example source edited (chairs added)
  ["examples/classroom-block.arch", "cca7c3dfef6593e826303c88878fbfb5537bded8a6bb9323696ae4b446ac046a"],
  ["examples/clinic.arch", "b31aad2c2f0c0d1b7e63498f8844570f16c700846d533288de7e43bf5ad56e63"],
  ["examples/corner-cafe.arch", "d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5"], // #367, see test/byte-identity-baseline.ts
  ["examples/courtyard-family.arch", "50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67"], // new example (RM8.5, the courtyard-family showcase)
  ["examples/courtyard-house.arch", "3ce3c72f6915ece00f2eca8d9321651aca7c2644b95cc423f10397395fc9ab12"], // CV13 (was 0f6dddac): example source edited (chairs added)
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "f3d86da1d7aed260f386efa6ca98b440c89ee7b2b84b0d0937401c72d7bb113e"],
  ["examples/garden-house.arch", "72528a5f6784a5c5d9527299a5abb330423c747bafb17458716dc336cc9a3eb3"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/garden-loft.arch", "2814a29269f878cd596372eafe0fdf8c1d1bc9f0c478b33f1cae2906b6db8d8d"], // CV13 (was e0ce8a5f): example source edited (chairs added)
  ["examples/hexagon-pavilion.arch", "847694c47f21e1660d3a4bbd70469d8fac354b2d255070478c59fe1aa83a613a"], // CV13 (was 3078765c): example source edited (chairs added)
  ["examples/hillside-villa.arch", "123f2af228faf039c29d9861b60cfff3574b3cd04bc0057d5549cd02e67066fb"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/knob-flat.arch", "578ec7551025df65b704f453b7af3493bf4abcfb19737fdece206e4c85fd2586"], // new example (P4, the knobs example), see header
  ["examples/laneway-house.arch", "21f4d5bc82e2e8d46536bd2dc5623b05ea76e937db31c7d4ed482a4c5e3118bc"], // CV13 (was 958934b4): example source edited (chairs added)
  ["examples/library.arch", "acbc3325a38dea3132c2e6898df4c40ac2df5e85684fab1531409ba397e3b506"],
  ["examples/materials.arch", "b3d629675b1a43d4d1113f10b38e732d0b826fdb2b019fcf14ac4b166abd435d"],
  ["examples/museum-wing.arch", "add9b13a425ec75dd2b88c4eba087465228822c37321b3d1952db6f0795ef6c7"],
  ["examples/museum-wings.arch", "c6dbf64c3a35e4021c173e5a10e875cb9abdc6319bb2d1cd297bdde36a6a3794"],
  ["examples/museum.arch", "bf1d425c9bf21d6ddb3e4757f53a1820f186cca67c3300c0a6ce8eb6b4e73713"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "7cceeb1be4622a8b84e1625a124d31f44fdfc15cd5362c4f4f25fa67f5560989"],
  ["examples/practice-office.arch", "f655cd0dfaa4ec152a2effa51cd2a3fb6254d46c8fb7e29529cbd3c7b78491cb"],
  ["examples/relational.arch", "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["examples/remodel.arch", "5fd914bb04d3d2c03d590844eb51dd3039763bab16b26d24e141b2c54b32fcfc"], // `centreline_at`, see ./byte-identity-baseline.ts; CV13 (was f0f4a5aa): example source edited (chairs added)
  ["examples/sheet-notes.arch", "708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "3e8d6696f955b554411c7379e3a8bc9ce5cbf83a9521930129f18915bca585d0"], // CV08 (was 6667da00): example source edited (sofa turned to face the room)
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "e51de067c879ba64272632c73dc6794dae996df3307fa8a0b16fa1b9d1a44915"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3657648f): example source edited (chairs added); CV08 (was 3395a3eb): example source edited (sofa turned to face the room)
  ["examples/transit-hall.arch", "649e39d370d434467bee6f23ad8c7fc0bef578d44081f18d96ec82ed2532c5be"],
  ["examples/turning-stair.arch", "4d2fb9dcc6a44640a4d0e52d202df14909c73a5743799af8c25cb1f117dc87a8"], // new example (S2), see header; `centreline_at`, see ./byte-identity-baseline.ts; RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/two-bed.arch", "6393e0321cc48a44fbf17b7aa6008d89dcfbbcceea13418c4045875c5ffdf6c0"], // `centreline_at`, see ./byte-identity-baseline.ts; CV13 (was fe871cbb): example source edited (chairs added)
  ["examples/two-storey.arch", "92a71843b7de0b87acb1ef3ea1b859d1c0bedbe4ef35025f3524ecea1d674aa8"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["test/fixtures/axes-grid.arch", "32dad3e21d1e5c40424473fdf05896088a2f848fd7f90d395d6cbd70169a0655"],
  ["test/fixtures/chain30.arch", "ce81264ecdc3a086f99708f90aee5dd929c71b9e8ccaaa54a1da5ce5aa213325"], // #367, see test/byte-identity-baseline.ts
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/dense-office.arch", "344ce7a8de19a7a9aad470e2e253c8751b5bfbefb39443f7f13033ca8ce81367"], // AL6: a new row; E.18 (was 46d130d3), see ./byte-identity-baseline.ts
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"],
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"],
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/lock-before.arch", "23d883d88f5b94b73686c13e795ed57352dd778e3b807c1d73fdea1e3870943c"],
  ["test/fixtures/lock-partition-moved.arch", "8a18c466ef0388eaba790eea5e5dc217fcdfe8d8624ec8e0ed529ec98a4e4d56"],
  ["test/fixtures/lock-window-moved.arch", "5178ac32070a056b37462b4169b3fbdbbb0ee9a94ca05221cc0c64cedf89dd99"],
  ["test/fixtures/off-path-bypass.arch", "3c4ca1f843918cd8d3de1c1cf7efd00dec9a75bfffab468dc05c71ca5cb6361b"], // AF9 (was 81ef92c3): `W_DOORWAY_BLOCKED` on d_d gains a maybe-incorrect move to `at 1570` (its position alone) in lint(); SVG, describe() and the diagnostics are unchanged, and with that fix taken out the old digest returns
  ["test/fixtures/schedule-sheet.arch", "7894657cc6c6afff831d31be9a8658f9761f90c4ddfc4015c9b28571863fc780"],
  ["test/fixtures/star30.arch", "5104211cdd3733a56e18d141c68db6a097b679e484b1b18897e7637dd05d0bbb"], // #367, see test/byte-identity-baseline.ts
  ["test/fixtures/storeys-eaves-overflow.arch", "68492d111abcc4a0219738601073936dbd3aed2f645531ad125cb2bf083949e2"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  // was 05693d9e. D27: this plan's stair stands in no wall, so `bounds()` reaching its break line widens the
  // drawing 156 mm. Only the SVG, the Scene and the overlay moved: with the old ones put back the old digest returns.
  ["test/fixtures/zones-levels.arch", "21c4b504af358718519aea5578a13c3a441ea218c01732f688c8cafff5059d1c"], // RM9.2, see ./byte-identity-baseline.ts
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"],
];

suite("four open boundaries at a crossing (#368)", () => {
  it("draws no wall at the crossing, and the drawing lost nothing but the square", () => {
    const svg = compile(FOUR_OPEN, { noCache: true }).svg ?? "";
    const square = " M 3940,2940 L 4060,2940 L 4060,3060 L 3940,3060 Z";
    expect(svg).not.toContain(square);
    // The square put back into both wall paths gives the old drawing to the byte.
    const before = svg.replace(/(<path d="M -150[^"]*)(" fill="(?:url\(#poche\)|none)")/g, `$1${square}$2`);
    expect(sha256(before)).toBe(FOUR_OPEN_SVG);
  });

  it("moves neither describe() nor lint()", () => {
    expect(semanticDigestWith(API, FOUR_OPEN)).toBe(FOUR_OPEN_SEMANTIC);
    expect(semanticDigestWith(API, FOUR_OPEN_PLACED)).toBe(PLACED_SEMANTIC);
  });

  it("keeps the square in the solid the analyses read, and adds no opening to the cuts", () => {
    const walls = wallsOf(FOUR_OPEN);
    const at = { x: 4000, y: 3000 };
    expect(solidAt(walls, at)).toBe(false);
    expect(solidAt(stripped(walls), at)).toBe(true);
    expect(joinWallSet(walls, [])?.cuts).toHaveLength(6); // four open, one door, one window
  });

  it("clears the crossing of a turned, mirrored instance too", () => {
    const walls = wallsOf(FOUR_OPEN_PLACED);
    const points = crossings(walls);
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(solidAt(walls, p)).toBe(false);
      expect(solidAt(stripped(walls), p)).toBe(true);
    }
  });

  it("files the same outline in the DXF's re-join as the drawing draws", () => {
    const ir = resolvePlan(FOUR_OPEN).ir;
    if (!ir) throw new Error("the plan must resolve");
    const scene = toScene(ir);
    const drawn = scene.nodes.find((n) => n.layer === "wallFace")?.prim;
    const refiled = classifyWallSet(scene.walls ?? [], (w) => w.category, ["exterior", "partition"]);
    expect(refiled?.outline).toEqual(drawn);
  });

  it("pins every unmoved plan", () => {
    expect(UNMOVED_DIGESTS.map(([n]) => n)).toEqual(UNMOVED.map(([n]) => n));
    expect(FLUSH_DIGESTS.map(([n]) => n)).toEqual(FLUSH.map(([n]) => n));
  });

  it.each(UNMOVED_DIGESTS)("%s draws what it drew", (name, digest) => {
    const src = UNMOVED.find(([n]) => n === name)?.[1] ?? "";
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
  });

  it.each(FLUSH_DIGESTS)("%s moves only as its row says", (name, semantic, drawn) => {
    const src = FLUSH.find(([n]) => n === name)?.[1] ?? "";
    expect(semanticDigestWith(API, src)).toBe(semantic);
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(drawn);
  });

  it("covers every plan the corpus holds", () => {
    const files = ["examples", "test/fixtures"].flatMap((d) =>
      readdirSync(join(ROOT, d))
        .filter((f) => f.endsWith(".arch"))
        .map((f) => `${d}/${f}`),
    );
    expect(CORPUS.map(([f]) => f).sort()).toEqual(files.sort());
  });

  it.each(CORPUS)("%s is byte-identical", (file, digest) => {
    expect(allStoreysDigestWithDiagnostics(API, readFileSync(join(ROOT, file), "utf8"))).toBe(digest);
  });
});

suite("a crossing with one wall left, or none (#368)", () => {
  const STANDS = FLUSH.flatMap(([name, src, at, stands, half]) =>
    stands === null ? [] : [{ name, src, at, stands: DIRECTIONS[stands], half }],
  );

  it.each(STANDS)("$name: the wall left ends on the crossing, across its own width", ({ src, at, stands, half }) => {
    const walls = wallsOf(src);
    const off = (along: number, across: number): At => ({
      x: at.x + stands.x * along - stands.y * across,
      y: at.y + stands.y * along + stands.x * across,
    });
    // One millimetre into the wall it is wall, up to both its faces.
    for (const across of [0, half - 1, 1 - half]) expect(solidAt(walls, off(1, across))).toBe(true);
    // One millimetre the other way, nothing: no cap and no stub.
    for (const across of [0, half - 1, 1 - half]) expect(solidAt(walls, off(-1, across))).toBe(false);
    // And nothing wider than the wall stands beside it.
    expect(solidAt(walls, off(1, half + 1))).toBe(false);
    expect(solidAt(walls, off(1, -half - 1))).toBe(false);
  });

  it("clears a tee of three open runs", () => {
    const [, src, at] = FLUSH.find(([n]) => n === "open-tee")!;
    const walls = wallsOf(src);
    for (const dx of [-59, 0, 59]) {
      for (const dy of [-59, 0, 59]) {
        expect(solidAt(walls, { x: at.x + dx + 0.5, y: at.y + dy + 0.5 })).toBe(false);
      }
    }
  });

  it("clears it in a turned, mirrored instance too", () => {
    const walls = wallsOf(THREE_OPEN_PLACED);
    const points = crossings(walls, 3);
    expect(points).toHaveLength(2);
    for (const p of points) {
      const d = standsAt(walls, p);
      expect(solidAt(walls, { x: p.x + d.x, y: p.y + d.y })).toBe(true);
      expect(solidAt(walls, { x: p.x - d.x, y: p.y - d.y })).toBe(false);
    }
    expect(semanticDigestWith(API, THREE_OPEN_PLACED)).toBe(THREE_PLACED_SEMANTIC);
  });

  it.each(FLUSH.map(([name, src, at]) => ({ name, src, at })))(
    "$name keeps the block in the solid the analyses read, and adds no opening to the cuts",
    ({ src, at }) => {
      const walls = wallsOf(src);
      expect(solidAt(stripped(walls), { x: at.x + 1, y: at.y + 1 })).toBe(true);
      expect(joinWallSet(walls, [])?.cuts).toHaveLength(walls.reduce((n, w) => n + w.openings.length, 0));
    },
  );

  it.each(FLUSH.map(([name, src]) => ({ name, src })))(
    "$name files the same outline in the DXF's re-join as the drawing draws",
    ({ src }) => {
      const ir = resolvePlan(src).ir;
      if (!ir) throw new Error("the plan must resolve");
      const scene = toScene(ir);
      const drawn = scene.nodes.find((n) => n.layer === "wallFace")?.prim;
      const refiled = classifyWallSet(scene.walls ?? [], (w) => w.category, ["exterior", "partition"]);
      expect(refiled?.outline).toEqual(drawn);
    },
  );
});
