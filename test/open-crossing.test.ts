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
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, joinWallSet, lint, resolvePlan, toScene } from "../src/index.js";
import { loopWinding } from "../src/geometry/band.js";
import { classifyWallSet } from "../src/wall-lowering.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics, semanticDigestWith } from "./byte-identity-digest.js";
import { FLUSH, FOUR_OPEN, FOUR_OPEN_PLACED, THREE_OPEN_PLACED, UNMOVED } from "./open-crossing-plans.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };
const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

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
const PLACED_SEMANTIC = "6680e7767ccf03d14e31beeafec0c9eb502f2234f71ca9b524acfbbfb6d109fa";

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
const THREE_PLACED_SEMANTIC = "c8fb85b921a2bd06e974356a3e1b065b052d33ca53978a4035b1c4fee609001a";

/** Measured at `2649b9dd` (see the header): every plan of `examples/` and `test/fixtures/`. */
const CORPUS: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "e66504b7142257fc5c1c76c6e1b2f04a68be43ce98ea12b5be242d8e29171521"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "cda041e6004160bf8b826158202f931b3b6457c88f8edd7dc147282163c1c283"],
  ["examples/classroom-block.arch", "809f674a9d48b528c5e9850768c92afe5d826c22783f1a18df610d8a88adb4f6"],
  ["examples/clinic.arch", "af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5"],
  ["examples/corner-cafe.arch", "199a01c5d9fcbe38de99e8a87109a800428eee868b171404e81e2dfbb51a57ce"],
  ["examples/courtyard-house.arch", "e5a170e01d15451ed5a322d6eb9f8267a356f208fea829dfce19cd6d3e1a43ce"],
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "0e8f7696890b8f3e01211ecbc873996f49ba22fff103e349e8f4660b1417a1c2"],
  ["examples/garden-house.arch", "2ebce59ad2ade8fd181400ff73c88b9e6ab3af4217c1341a63745bb64ca4243d"],
  ["examples/garden-loft.arch", "f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0"],
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  ["examples/hillside-villa.arch", "9f493e8903437b74f50eb72fd227871d17c13a17b6bc9ccf7592d423f6908572"],
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/laneway-house.arch", "21459ebc71dbc508de2faae421b59ac48afd068dd1813adb6bf0595b9963fb3e"],
  ["examples/library.arch", "9354e572f6d9df8c04e9b3b0fee0fe15b5ddf87831e0feba28078aaa4158ba92"],
  ["examples/materials.arch", "635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/museum-wings.arch", "c6dbf64c3a35e4021c173e5a10e875cb9abdc6319bb2d1cd297bdde36a6a3794"],
  ["examples/museum.arch", "3eb89a03ff32698a0e11f9419f7d8bc6317ce66d2b660dd289d085cb4ecd36a4"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef"],
  ["examples/practice-office.arch", "f55654d5dd8db8243b7e46f3e9afe6ed8b265da11392f797608f5364d5c4d2b4"],
  ["examples/relational.arch", "4c117d32d823ccbfa76734397cf58001d5b3fcf700a67ee52b493856c436f5b1"],
  ["examples/remodel.arch", "0899315f2bd50e559d3e6e13350734231cd9c11f821fa929a9d0c1b51f1e13db"],
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d"],
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "2ba4f5c6510c8c1c5b0dce5fda946532a49aa27d9d14668e8398903af71f3612"],
  ["examples/transit-hall.arch", "a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5"],
  ["examples/two-bed.arch", "4fb4b10d1cde2487691965ce44bb8eb7e210c785e026f586dbeaf853f1e5b610"],
  ["examples/two-storey.arch", "30fea74236f151947c7fec764e66b2f5a860ce6f71908a5a60fc68e87566837a"],
  ["test/fixtures/axes-grid.arch", "e6be5d70788d931cacaa8cb1db2c2c454c1532d01153b90e2427c125770e5559"],
  ["test/fixtures/chain30.arch", "9ba4940dd0056ea94b3ff99e95a9288b8130a485aa2a3e7e97c9c6cc32b797d9"],
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"],
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"],
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/lock-before.arch", "23d883d88f5b94b73686c13e795ed57352dd778e3b807c1d73fdea1e3870943c"],
  ["test/fixtures/lock-partition-moved.arch", "8a18c466ef0388eaba790eea5e5dc217fcdfe8d8624ec8e0ed529ec98a4e4d56"],
  ["test/fixtures/lock-window-moved.arch", "5178ac32070a056b37462b4169b3fbdbbb0ee9a94ca05221cc0c64cedf89dd99"],
  ["test/fixtures/off-path-bypass.arch", "81ef92c32f98bc41635428f477b2cf7e59adea520e60892b5e39aa48fcbcaecf"],
  ["test/fixtures/schedule-sheet.arch", "15dc29228ea12dae7240ad843567f88218c5a57bd8838ea950b1a5792c2579a5"],
  ["test/fixtures/star30.arch", "93ffc93f0294e7eb2fed6e9db698f85e25e8f9f7a49d93a8de0d6028da05135b"],
  ["test/fixtures/storeys-eaves-overflow.arch", "e29b5e34735306051eeea8215d258873db2935ed3c7ebaf575a4b7af5cb89a6d"],
  ["test/fixtures/zones-levels.arch", "05693d9ec59a2c27dcf9c35c5b8d8d5a63969ee0931499b97305433324cb978f"],
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
