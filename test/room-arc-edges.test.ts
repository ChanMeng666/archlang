/**
 * `arc` edges inside a `room polygon` ring (card ARC2, `docs/plans/arc2-room-arcs.md` §4).
 *
 * ## The byte-identity law
 *
 * A plan with no `arc` in a room ring renders, describes, lints and diagnoses exactly as before the
 * form existed. Each digest is {@link allStoreysDigestWithDiagnostics} (every storey's SVG,
 * `describe()`, `lint()` and `compile().diagnostics`, since the form reaches the resolver),
 * **measured against `src/` at `ececc428`** (`refactor/arc2-room-ring-seam`, the tree this form is
 * built on; `main` at `64875946` is the same tree), extracted by `git archive` and its own copy of this digest body run against it. The set
 * is every plan of `examples/` and `test/fixtures/`: none writes an arc in a room ring, and none
 * moved. Cross-check that the body is the sanctioned one: `examples/accessible.arch`'s row is
 * character for character the one `wall-status-byte-identity.test.ts` carries.
 *
 * Beyond these pins, the PR's corpus sweep (695 sources: these directories, `test/recovery-corpus`,
 * `eval/`, and every `arch` fence of `docs/`, `README.md` and `spec.llm.md`) hashed SVG, diagnostics,
 * DXF, ASCII, `describe()`, `lint()` under every profile, Plan JSON, the step count and the 3D
 * scene, warnings and mesh: 0 of 10,110 moved, and a planted change moved rows, so it can fail.
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import {
  applyFixes,
  compile,
  describe as describePlan,
  format,
  lint,
  type PlanJson,
  planFromJson,
  planToJson,
  resolvePlan,
} from "../src/index.js";
import { evaluationSteps, type RRoom } from "../src/ir.js";
import { roomAreaMm2 } from "../src/geometry/room-ring.js";
import { polygonArea } from "../src/geometry/polygon.js";
import { ROOM_ARC_FULL_STEP_RADIUS_MM, ROOM_ARC_MAX_SAG_MM } from "../src/elements/room.js";
import { ROOM_CONTAINMENT_SLACK_MM } from "../src/analyze/rooms.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./helpers/byte-identity-digest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

/** An `arc` clause inside a `room … polygon` statement (one line, as every corpus room is written). */
const ARC_IN_RING = /\broom\b[^\n]*\bpolygon\b[^\n]*\barc\s*\(/;

/** Measured at `ececc428` (see the header). */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "0d4ae229f5ad16397ba93dc0aa90d6fb0a7eab0cec0253bd43e619c3292e08b2"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "0dd331e28b8f4e20c3b359c8e819ed738290295cc83934c1a38808d2fd83dc13"],
  ["examples/classroom-block.arch", "4d558795c0b345b3a9a1e5454bc476125983a63dee7d3227c0d3afe09b7ed3bd"],
  ["examples/clinic.arch", "6a8b78ce84d10bea939f48f431d16e127cb95b982f473d33072889e110ff4788"],
  ["examples/corner-cafe.arch", "d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5"],
  ["examples/courtyard-family.arch", "50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67"],
  ["examples/courtyard-house.arch", "3ce3c72f6915ece00f2eca8d9321651aca7c2644b95cc423f10397395fc9ab12"],
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "f3d86da1d7aed260f386efa6ca98b440c89ee7b2b84b0d0937401c72d7bb113e"],
  ["examples/garden-house.arch", "5b0ec567a174809bd4d5a7c62907b611741e3537577e9552026d400c28cedcd6"],
  ["examples/garden-loft.arch", "2814a29269f878cd596372eafe0fdf8c1d1bc9f0c478b33f1cae2906b6db8d8d"],
  ["examples/hexagon-pavilion.arch", "752b391b72fa247a99b979b8e1f4fc6f7a6783316cd29ad0bea4447245b0e311"],
  ["examples/hillside-villa.arch", "846971b81c64739f79f3d185160d4323d6db273cc77cafb5a933387c0e9b5f3b"],
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/knob-flat.arch", "578ec7551025df65b704f453b7af3493bf4abcfb19737fdece206e4c85fd2586"],
  ["examples/laneway-house.arch", "21f4d5bc82e2e8d46536bd2dc5623b05ea76e937db31c7d4ed482a4c5e3118bc"],
  ["examples/lib/doors.arch", "f57eaea084d2e6e62b85b8450ef96675e9f1466bea9aff24e2869f2d6f0c9804"],
  ["examples/lib/fixtures.arch", "57d6c78e2eea8451a9b32a5828f3babb24b0251cc5c3b72675b431be22b3f310"],
  ["examples/lib/furniture.arch", "adf16d60e17d76d76f092f95fb24dab4b7ba5ebaa977ed32bcc3a8eaddc7e05b"],
  ["examples/library.arch", "aa107b1b311d1545f228eaac173cc95a396a6acd86fdeb6db58de4ba3617f7b7"],
  ["examples/materials.arch", "b3d629675b1a43d4d1113f10b38e732d0b826fdb2b019fcf14ac4b166abd435d"],
  ["examples/museum-wing.arch", "add9b13a425ec75dd2b88c4eba087465228822c37321b3d1952db6f0795ef6c7"],
  ["examples/museum-wings.arch", "c6dbf64c3a35e4021c173e5a10e875cb9abdc6319bb2d1cd297bdde36a6a3794"],
  ["examples/museum.arch", "bf1d425c9bf21d6ddb3e4757f53a1820f186cca67c3300c0a6ce8eb6b4e73713"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "7cceeb1be4622a8b84e1625a124d31f44fdfc15cd5362c4f4f25fa67f5560989"],
  ["examples/practice-office.arch", "bf127fd8266fe3d85e9f25712ac69c02bd42370c7027cf1a01baeafe1d3aa36c"],
  ["examples/relational.arch", "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084"],
  ["examples/remodel.arch", "b7fc3b7f11be692ffdc3125d66d01e9c70cb9ade93ab673f4bb4ddaebd0e085c"],
  ["examples/sheet-notes.arch", "708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a"],
  ["examples/showcase/garden-courtyard.arch", "f71aacc239a5bc518ea19e16c2152c3be59239bf96f73ae5248fa80fa23e3c75"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "3e8d6696f955b554411c7379e3a8bc9ce5cbf83a9521930129f18915bca585d0"],
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "42be4e4d302a36d2a95f93fe215539d45739f5f21c9dbca3a96089b8f6c18afd"],
  ["examples/transit-hall.arch", "649e39d370d434467bee6f23ad8c7fc0bef578d44081f18d96ec82ed2532c5be"],
  ["examples/turning-stair.arch", "4278a96ba7b215a43f121d04bd47fd94c94ab0c145cb7f7a2a7aba5201e2c6a2"],
  ["examples/two-bed.arch", "6393e0321cc48a44fbf17b7aa6008d89dcfbbcceea13418c4045875c5ffdf6c0"],
  ["examples/two-storey.arch", "92a71843b7de0b87acb1ef3ea1b859d1c0bedbe4ef35025f3524ecea1d674aa8"],
  ["test/fixtures/axes-grid.arch", "32dad3e21d1e5c40424473fdf05896088a2f848fd7f90d395d6cbd70169a0655"],
  ["test/fixtures/chain30.arch", "ce81264ecdc3a086f99708f90aee5dd929c71b9e8ccaaa54a1da5ce5aa213325"],
  ["test/fixtures/corner-window/corner-window.arch", "8318594db2db21fc19481f4fde4f25de5b2f964320667d34b22a24b5bbacec24"],
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/dense-office.arch", "1601b5f0adb1966b9168bde4aa447f138c431d423cbc6c562a5d002fff62e612"],
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"],
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"],
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/gaps/gaps.arch", "179bce3580bfde387cd62658e57c00cd1e822b2bf063c9c50d2bc67f15b864dd"],
  ["test/fixtures/lock-before.arch", "23d883d88f5b94b73686c13e795ed57352dd778e3b807c1d73fdea1e3870943c"],
  ["test/fixtures/lock-partition-moved.arch", "8a18c466ef0388eaba790eea5e5dc217fcdfe8d8624ec8e0ed529ec98a4e4d56"],
  ["test/fixtures/lock-window-moved.arch", "5178ac32070a056b37462b4169b3fbdbbb0ee9a94ca05221cc0c64cedf89dd99"],
  ["test/fixtures/off-path-bypass.arch", "3c4ca1f843918cd8d3de1c1cf7efd00dec9a75bfffab468dc05c71ca5cb6361b"],
  ["test/fixtures/schedule-sheet.arch", "7894657cc6c6afff831d31be9a8658f9761f90c4ddfc4015c9b28571863fc780"],
  ["test/fixtures/section/marks.arch", "f3f86bd0d88495132173c7cca1a8bd4a7d90275bf4f5c14bb358effebe890619"],
  ["test/fixtures/shared-grid/shared-grid.arch", "13b94a1b78249062d101d078da9121be525e166f8a060fc375cd1a4f16b2b84f"],
  ["test/fixtures/sheet-text/sheet-text.arch", "897cb42b47b9effa6c433b3f0a7871b1ff4ea3db1d4345f75a6d1cdd715002aa"],
  ["test/fixtures/slab-clear/levels.arch", "336af3324635e877288d244c31dfbe9f9e7fcdeb6331288b6b835f5bca4c2c75"],
  ["test/fixtures/slab-clear/single.arch", "00da85f6d80aca8f775632ae1c7cc8bb39fcef4c2f24b98bebf83ce8c3a4580b"],
  ["test/fixtures/star30.arch", "13122e9c16dd36f442eea47840e1b03dde21108f0a31bcb7048cdd3c12134bf7"],
  ["test/fixtures/storeys-eaves-overflow.arch", "68492d111abcc4a0219738601073936dbd3aed2f645531ad125cb2bf083949e2"],
  ["test/fixtures/wall-closure/annex-garage.arch", "0cc9b782b36406444c3f6651ac97bc66d86bb87bbe4fd372c8a1876e062a2820"],
  ["test/fixtures/wall-closure/annex-porch.arch", "4ba3a56b73a0da60bc3e87955cadfe7d0b71e3b993ca6e0b44eb0cb43050f04b"],
  ["test/fixtures/wall-closure/not-boundary-wall.arch", "96be1fd846216555c750fad4862d1d7e1f1e0f8d40025d6506b5b361f1261739"],
  ["test/fixtures/wall-closure/not-fence.arch", "fe296e92b7f72183d7f1c6dc193f662d751e63007251f2f9cf5baab1c3827cd3"],
  ["test/fixtures/wall-closure/not-free-standing.arch", "37b6b432704b137319a26a764602cedb5d4adcf6bbeb3c10c31b027fecdeae21"],
  ["test/fixtures/wall-closure/not-garden-wall.arch", "1bc3a6231cec08f47e81e35a5fe9b30e4f1d07cf13259959455d0d05e80f3b3c"],
  ["test/fixtures/wall-closure/not-parapet.arch", "859c140ea5d9e715705950259d4fbc2915d9a23a468cbfb70d7063b5b58d6222"],
  ["test/fixtures/wall-closure/not-roof-terrace.arch", "2c2f8ffee5c7cdd449877bb0b87dc69c6528411e02881c3763035a02302f9a5b"],
  ["test/fixtures/wall-closure/open-ring.arch", "ebbd2dcc48dd56a52a05905298af969993da1a272d7ea8ee81322e234f8687c6"],
  ["test/fixtures/window-kinds/window-kinds.arch", "b9512ce7a45888f93485eba1593409e4e9542fc62fae0bf7d4454839fd0f11d6"],
  ["test/fixtures/zones-levels.arch", "21c4b504af358718519aea5578a13c3a441ea218c01732f688c8cafff5059d1c"],
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"],
];

suite("arc edges in a room ring — the byte-identity law", () => {
  it.each(BASELINE)("%s: the payload is the one measured before the form existed", (path, digest) => {
    const src = readFileSync(join(ROOT, path), "utf8");
    expect(ARC_IN_RING.test(src)).toBe(false);
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
  });
});

const plan = (...body: string[]): string => ['plan "A" {', "  units mm", ...body, "}"].join("\n");
const roomOf = (src: string, id: string): RRoom => {
  const { ir, diagnostics } = resolvePlan(src);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return ir!.elements.find((e): e is RRoom => e.kind === "room" && e.id === id)!;
};
const codes = (src: string): string[] => compile(src).diagnostics.map((d) => d.code ?? "");
const lintCodes = (src: string): string[] => lint(src).map((d) => d.code ?? "");

/** A semicircle on the chord (0,0)–(4000,0): the closing edge curved, the repeated vertex dropped. */
const SEMICIRCLE = plan('  room id=s polygon (0,0) (4000,0) arc (0,0) radius 2000 cw label "Apse"');
/** A 4000 square with a semicircle on its east side. */
const BOWED = plan('  room id=b polygon (0,0) (4000,0) arc (4000,4000) radius 2000 cw (0,4000) label "Bow"');

suite("the exact floor", () => {
  it("a semicircle's area is πR²/2 in closed form, not its tessellation's chordal figure", () => {
    const r = roomOf(SEMICIRCLE, "s");
    const exact = (Math.PI * 2000 * 2000) / 2;
    expect(Math.abs(roomAreaMm2(r) - exact) / exact).toBeLessThan(1e-9);
    expect(polygonArea(r.poly!)).toBeLessThan(exact - 1000);
    // The ring is closed by its arc: two vertices, two edges, no repeated first vertex.
    expect(r.edges!.map((e) => e.t)).toEqual(["line", "arc"]);
    const s = describePlan(SEMICIRCLE).summary!.rooms[0]!;
    expect(s.area_m2).toBe(6.28);
    expect(s.floor_polygon).toEqual([
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
    ]);
    expect(s.floor_arcs).toEqual([
      { from: { x: 4000, y: 0 }, to: { x: 0, y: 0 }, center: { x: 2000, y: 0 }, r: 2000, sweep: Math.PI },
    ]);
    // The bulge is south of the chord (clockwise on the sheet, travelling west): the extent is exact.
    expect([r.at, r.size]).toEqual([
      { x: 0, y: 0 },
      { w: 4000, h: 2000 },
    ]);
    expect(compile(SEMICIRCLE).svg).toContain("6.3 m²");
  });

  it("a square bowed by a semicircle is its square plus πR²/2, and is drawn with a true arc", () => {
    const r = roomOf(BOWED, "b");
    const exact = 16_000_000 + (Math.PI * 2000 * 2000) / 2;
    expect(Math.abs(roomAreaMm2(r) - exact) / exact).toBeLessThan(1e-9);
    expect(describePlan(BOWED).summary!.rooms[0]!.area_m2).toBe(22.28);
    expect(compile(BOWED).svg).toMatch(/<path d="M 0,0 L 4000,0 A 2000 2000 0 0 1 [^"]*" fill=/);
    expect(r.size).toEqual({ w: 6000, h: 4000 });
  });

  it("charges the tessellation it builds to the step meter", () => {
    const steps = (src: string): number => evaluationSteps(resolvePlan(src));
    const straight = plan("  room id=s polygon (0,0) (4000,0) (2000,-2000)");
    expect(Number.isFinite(steps(SEMICIRCLE))).toBe(true);
    expect(steps(SEMICIRCLE)).toBeGreaterThan(steps(straight));
  });

  it("re-emits the clause through `arch fmt`, a fixed point", () => {
    const once = format(BOWED);
    expect(once).toContain("arc (4000, 4000) radius 2000 cw");
    expect(format(once)).toBe(once);
    expect(compile(once).svg).toBe(compile(BOWED).svg);
  });
});

suite("turned and mirrored (D4)", () => {
  const placed = (xf: string): string =>
    plan(
      "  component apse() {",
      '    room id=s polygon (0,0) (4000,0) (4000,3000) arc (0,3000) radius 2000 cw label "Apse"',
      "  }",
      `  place apse() as g at (20000,20000)${xf}`,
    );
  const factsOf = (xf: string) => {
    const s = describePlan(placed(xf)).summary!.rooms[0]!;
    return { area: s.area_m2, arcs: s.floor_arcs!.map((a) => ({ r: a.r, sweep: a.sweep })) };
  };
  const base = factsOf("");
  for (const rot of [0, 90, 180, 270])
    for (const mirror of ["", " mirror x"]) {
      it(`rotate ${rot}${mirror}: the same area, the same arc, its sweep flipped by a mirror only`, () => {
        const f = factsOf(`${rot ? ` rotate ${rot}` : ""}${mirror}`);
        expect(f.area).toBe(base.area);
        expect(f.arcs.map((a) => a.r)).toEqual(base.arcs.map((a) => a.r));
        expect(f.arcs.map((a) => a.sweep)).toEqual(base.arcs.map((a) => (mirror ? -a.sweep : a.sweep)));
      });
    }
});

suite("Plan JSON", () => {
  const roundTrips = (src: string): string => {
    const { json, diagnostics } = planToJson(src);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const { source, diagnostics: back } = planFromJson(json as PlanJson);
    expect(back.filter((d) => d.severity === "error")).toEqual([]);
    expect(compile(source!).svg).toBe(compile(src).svg);
    expect(JSON.stringify(describePlan(source!).summary!.rooms)).toBe(JSON.stringify(describePlan(src).summary!.rooms));
    return source!;
  };

  it("carries each arc on the vertex it arrives at, the closing arc on the first, and round-trips", () => {
    const room = planToJson(SEMICIRCLE).json!.rooms[0]!;
    expect(room.polygon).toEqual([
      { x: 0, y: 0, arc: { radius: 2000, dir: "cw" } },
      { x: 4000, y: 0 },
    ]);
    expect(roundTrips(SEMICIRCLE)).toContain("polygon (0,0) (4000,0) arc (0,0) radius 2000 cw");
    expect(roundTrips(BOWED)).toContain("polygon (0,0) (4000,0) arc (4000,4000) radius 2000 cw (0,4000)");
  });

  it("round-trips the arc living room of the bay bungalow", () => {
    roundTrips(readFileSync(join(ROOT, "test/floor-unassigned/bay-bungalow-arc-living.arch"), "utf8"));
  });
});

suite("refusals", () => {
  it("E_ROOM_ARC_RADIUS: a radius under half the chord, with the wall's fix, which clears it", () => {
    const src = plan("  room id=t polygon (0,0) (4000,0) arc (4000,4000) radius 1000 cw (0,4000)");
    const d = compile(src).diagnostics.filter((x) => x.code === "E_ROOM_ARC_RADIUS");
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain("the minimum is 2000");
    expect(d[0]!.fixes![0]!.fixId).toBe("arc-radius-min");
    const fixed = applyFixes(src, d[0]!.fixes!).output;
    expect(fixed).toContain("arc (4000, 4000) radius 2000 cw");
    expect(codes(fixed)).not.toContain("E_ROOM_ARC_RADIUS");
    expect(compile(fixed).errors).toEqual([]);
  });

  it("E_ROOM_POLY_SELF_INTERSECT: an arc that bulges across another edge", () => {
    expect(codes(plan("  room id=t polygon (0,0) (1000,0) arc (1000,3000) radius 1500 ccw (0,3000)"))).toContain(
      "E_ROOM_POLY_SELF_INTERSECT",
    );
    // The same arc bulging outward is a simple ring.
    expect(compile(plan("  room id=t polygon (0,0) (1000,0) arc (1000,3000) radius 1500 cw (0,3000)")).errors).toEqual([]);
  });

  it("E_ROOM_ARC_SAG: a chord more than the containment slack off its curve", () => {
    expect(ROOM_ARC_MAX_SAG_MM).toBe(ROOM_CONTAINMENT_SLACK_MM);
    expect(ROOM_ARC_FULL_STEP_RADIUS_MM).toBe(46705);
    const big = plan("  room id=t polygon (0,0) arc (100000,0) radius 60000 cw (100000,50000) (0,50000)");
    const d = compile(big).diagnostics.find((x) => x.code === "E_ROOM_ARC_SAG");
    expect(d?.message).toContain("113.7");
    expect(d?.hints?.[0]).toContain("46705");
    // A shallow arc of a larger radius steps finer, and stays within it.
    expect(codes(plan("  room id=t polygon (0,0) arc (10000,0) radius 100000 cw (10000,5000) (0,5000)"))).not.toContain(
      "E_ROOM_ARC_SAG",
    );
  });

  it("an `arc` cannot lead the ring", () => {
    expect(compile(plan("  room id=t polygon arc (1000,0) radius 800 (0,1000)")).errors[0]!.message).toContain(
      "needs a preceding point",
    );
  });

  const BAY = (...rest: string[]) =>
    plan("  room id=b polygon (0,0) (4000,0) arc (4000,3000) radius 2000 cw (0,3000)", ...rest);
  it("refuses like a slanted polygon: datums, relational placement, anchors, walls from rooms", () => {
    expect(codes(BAY("  wall interior thickness 100 { (b.left, 0) (b.left, 3000) }"))).toContain("E_ROOM_NOT_RECTANGLE");
    const rel = compile(BAY("  room id=c right-of b size 2000x2000")).diagnostics.find((d) => d.code === "E_PLACE_POLY");
    expect(rel?.message).toContain("a polygon room with an arc edge");
    const anchored = compile(BAY("  furniture sofa in b anchor left size 2000x900")).diagnostics.find(
      (d) => d.code === "E_PLACE_POLY",
    );
    expect(anchored?.message).toContain("a polygon room with an arc edge");
    const derived = compile(BAY("  walls from rooms exterior 200 partition 100")).diagnostics.find(
      (d) => d.code === "E_ROOM_NOT_RECTANGLE",
    );
    expect(derived?.message).toContain("arc edge");
  });
});

suite("the walls that back an arc edge are read by the arc (W_ROOM_NOT_ENCLOSED, W_BOUNDARY_NO_WALL)", () => {
  it("a bath walled on its R3000 curve is enclosed; open on the curve, it is not", () => {
    const bath = (wall: string) =>
      plan(wall, '  room id=bath polygon (0,0) arc (6000,0) radius 3000 cw (6000,3000) (0,3000) label "Bath" uses bath');
    const walled = bath("  wall exterior thickness 200 { (0,0) arc (6000,0) radius 3000 cw (6000,3000) (0,3000) close }");
    expect(lintCodes(walled)).not.toContain("W_ROOM_NOT_ENCLOSED");
    const open = bath("  wall exterior thickness 200 { (6000,0) (6000,3000) (0,3000) (0,0) }");
    expect(lint(open).find((d) => d.code === "W_ROOM_NOT_ENCLOSED")?.message).toContain("~9425 mm");
  });

  it("two rooms either side of an R9000 curved partition share no run a straight wall must back", () => {
    const src = plan(
      "  wall exterior thickness 200 { (0,0) (16000,0) (16000,12000) (0,12000) close }",
      "  wall partition thickness 100 { (0,6000) arc (16000,6000) radius 9000 cw }",
      '  room id=n polygon (0,0) (16000,0) (16000,6000) arc (0,6000) radius 9000 ccw label "Office" uses office',
      '  room id=s polygon (0,6000) arc (16000,6000) radius 9000 cw (16000,12000) (0,12000) label "Bedroom" uses bedroom',
      "  door on exterior at 2000 width 900",
    );
    expect(lintCodes(src)).not.toContain("W_BOUNDARY_NO_WALL");
    const describeRooms = describePlan(src).summary!.rooms.map((r) => [r.id, r.area_m2]);
    expect(describeRooms[0]![1]! + describeRooms[1]![1]!).toBeCloseTo(192, 1);
  });
});

suite("the motivating plan: ArchCanvas's Bay Bungalow, its living room written with the bay's arc", () => {
  const bay = readFileSync(join(ROOT, "test/floor-unassigned/bay-bungalow-arc-living.arch"), "utf8");
  const original = readFileSync(join(ROOT, "test/floor-unassigned/bay-bungalow.arch"), "utf8");

  it("covers the bay: W_FLOOR_UNASSIGNED reports no bay, the area includes the segment exactly", () => {
    const bayReport = (src: string) =>
      lint(src).filter((d) => d.code === "W_FLOOR_UNASSIGNED" && d.message.includes('"Living"'));
    expect(bayReport(original)).toHaveLength(1);
    expect(bayReport(bay)).toEqual([]);
    const living = describePlan(bay).summary!.rooms.find((r) => r.id === "r_living")!;
    // 5800 × 6800 plus the segment (R²/2)(θ − sin θ), θ = 2·asin(1500/1900).
    const theta = 2 * Math.asin(1500 / 1900);
    const exact = 5800 * 6800 + ((1900 * 1900) / 2) * (theta - Math.sin(theta));
    expect(Math.abs(roomAreaMm2(roomOf(bay, "r_living")) - exact)).toBeLessThan(1e-6);
    expect(living.area_m2).toBe(40.98);
    // The net area is the whole face the walls enclose there: nothing is left over.
    expect(living.net_area_m2).toBe(38.74);
  });

  it("fills the bay with a true arc, and dimensions the curve once (the wall's R1900)", () => {
    const svg = compile(bay).svg;
    expect(svg).toContain('<path d="M 0,0 L 2400,0 A 1900 1900 0 0 1 5400,0 L 5800,0');
    expect(svg.match(/>R1900</g)).toHaveLength(1);
  });
});
