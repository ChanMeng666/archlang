/**
 * Four `open between` boundaries at one crossing (issue #368): the square left where they meet is
 * removed from the drawing, and nothing else moves.
 *
 * Why it is removed rather than reported: no statement asks for it, `describe()` names no such
 * thing, `column` is how a plan asks for one, and a warning would name a defect the author has no
 * way to fix. It is the bands' overlap, 120 x 120 mm in the filed plan.
 *
 * Every digest here was **measured against `src/` at `2649b9dd`** (`main` before the fix), with
 * that tree extracted by `git archive` and its own digest body run against it. A moved row is a
 * finding to explain (`docs/testing.md` section 3), never a re-pin.
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
import { FOUR_OPEN, FOUR_OPEN_PLACED, UNMOVED } from "./open-crossing-plans.js";

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

/** The points where four `open between` runs end. */
const crossings = (walls: Walls): At[] => {
  const ends = walls.filter((w) => w._derived?.open).flatMap((w) => w.points);
  const same =
    (p: At) =>
    (q: At): boolean =>
      q.x === p.x && q.y === p.y;
  return ends.filter((p, i) => ends.findIndex(same(p)) === i && ends.filter(same(p)).length === 4);
};

/** Measured at `2649b9dd` (see the header). */
const FOUR_OPEN_SVG = "194956c02cebd53cba314bc794cf6bfa2925f016de48dbe1bdf70ef0ef863e54";
const FOUR_OPEN_SEMANTIC = "49c3ae1b602ae5e576211825736bcfecf13b1ed34b868e38f96bc0d7f58deb68";
const PLACED_SEMANTIC = "6680e7767ccf03d14e31beeafec0c9eb502f2234f71ca9b524acfbbfb6d109fa";

/** Measured at `2649b9dd` (see the header). */
const UNMOVED_DIGESTS: [string, string][] = [
  ["three-open", "8116502def1d3f00ca3b6902507cdadce8237aaa6a6faeb066309817bc4e8f21"],
  ["narrowed", "d3a57ef3f2af063468df0cd538fb10e9387bd9c289b3d8dbef0381e665db73e1"],
  ["wall-through", "45f54c9e131d5e64c7c019fcd9af36ea7f7940525f90bc59c388eb12910c5dfe"],
  ["wall-over", "b063a68e7ddfc1a35b38d46137b18825a60a3c72ebf5970ae7b0a3ffc946488b"],
  ["wall-beside", "feb4d99b503ccd0b6535b9dd5102d7d9fc2205e9f942b3a93c1a25719ad45f38"],
  ["authored-flush", "d851658882033b64d51786963b6b99ebf80ee8f157c5d19c5c995236a59ff038"],
  ["door-on-narrowed", "63d4b612fd6a02475fc7e1619f5561a75ad997c87e029f57f46077d77420e278"],
  ["open-tee", "a122b452a674336ebb8fbaccecc006f5514d8a1d239787942de0456a8a0f4547"],
];

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
  ["examples/remodel.arch", "a24de508bdd77118148b1c1b9a4cf87aedebd8f108b30e80b3623e361cf683a6"],
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
  ["test/fixtures/chain30.arch", "df7e1343b01b2194505898df5017da81b58d8c840d01236ff75101f047396e43"],
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
  ["test/fixtures/star30.arch", "74a3209110606543fb04c1932b2ec60a78526ccdd2a7205cdfe972719efac471"],
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

  it.each(UNMOVED_DIGESTS)("%s draws what it drew", (name, digest) => {
    const src = UNMOVED.find(([n]) => n === name)?.[1] ?? "";
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
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
