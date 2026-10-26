/**
 * The `double` door kind (plan-soundness PS2.11e): its byte-identity law, its printer and Plan
 * JSON round trips, and what it draws and refuses.
 *
 * ## The law: a plan that writes no `double` door renders, describes and lints as before
 *
 * The digests below are the whole agent-facing payload ({@link allStoreysDigestWithDiagnostics}:
 * every storey's SVG, `describe()` and `lint()`, plus `compile().diagnostics`), **measured against
 * `src/` at `8c2d6150`** (the base of the PR that added the kind) with that tree extracted by
 * `git archive` and this suite's own digest body (`test/byte-identity-digest.ts`) run against it.
 *
 * The set is every plan of `examples/` and `test/fixtures/` that writes no `double` door and whose
 * payload the same PR left byte-identical: 25 of the 40 (28 examples and 12 fixtures) that write
 * none. The other 15 moved for the PR's lint rules, not for the kind, each named in
 * `docs/plans/plan-soundness/research/2026-10-26-ps211e-as-built.md`: 14 examples were edited to
 * clear `W_HOB_UNDER_WINDOW`, `W_HOB_FRIDGE_GAP`, `W_LEAF_TOO_WIDE` (`transit-hall` by becoming a
 * `sliding` door) or `W_DOORWAY_BLOCKED` read from the wall's face (PS2.54), and
 * `test/fixtures/off-path-bypass.arch` gains `W_DOORWAY_BLOCKED` and is kept as written. Six
 * examples write `double` doors (their wide leaves fixed) and are the kind's own drawings.
 * (The agent gallery is left out: no test may read it, `test/agent-gallery.test.ts`.)
 *
 * The kind's own path is reachable only from its word: `doorLeaves` returns a hinged door's one
 * `doorSwing`, computed by the same arithmetic as before (`swingAlong`), and the resolver adds
 * nothing to a door that does not name the kind. Every plan below exercises hinged doors, and
 * `examples/two-storey.arch` and `examples/terrace-row.arch` the door-kind flagships' paths.
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  format,
  lint,
  type PlanJson,
  planFromJson,
  planToJson,
} from "../src/index.js";
import { doorLeaves } from "../src/geometry.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./byte-identity-digest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

/** Measured at `8c2d6150` (see the header). */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/clinic.arch", "8321ab6d53ba385d743d49fee08686afcf8b53915b7cc03f466aa72fd366d55a"],
  ["examples/corner-cafe.arch", "199a01c5d9fcbe38de99e8a87109a800428eee868b171404e81e2dfbb51a57ce"],
  ["examples/garden-house.arch", "2e3cd939b9e4d9e2d41e41001b5b4400e5ff07a61f425f5ed02bd6f067bd035b"],
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/materials.arch", "1a4aa9bad5d42f06c1158d6089a71b784b8f079761b7a03dad17a1271fd5b2ff"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "2a6b29053ac201b452bde4204087f10b17648473e3080327d2486e0cba11d86b"],
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"],
  ["examples/terrace-row.arch", "5b45dd460a3dbb1e788b8a839ee1f7fb594a0b1efe92118c84e1bf4639edca87"],
  ["examples/two-storey.arch", "a794b452d5ffffafd0c3f3e559223d6cb112d8575fa2ea1a1dc4cc53fe4eb60f"],
  ["test/fixtures/axes-grid.arch", "e6be5d70788d931cacaa8cb1db2c2c454c1532d01153b90e2427c125770e5559"],
  ["test/fixtures/chain30.arch", "df7e1343b01b2194505898df5017da81b58d8c840d01236ff75101f047396e43"],
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"],
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"],
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/schedule-sheet.arch", "15dc29228ea12dae7240ad843567f88218c5a57bd8838ea950b1a5792c2579a5"],
  ["test/fixtures/star30.arch", "74a3209110606543fb04c1932b2ec60a78526ccdd2a7205cdfe972719efac471"],
  ["test/fixtures/zones-levels.arch", "0d1a1bf3d1bfad34156356ccfa65b8d823ab0761344b1bafde050d6213d93b0f"],
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"],
];

suite("`double` door kind — the byte-identity law", () => {
  it.each(BASELINE)("%s: the payload is the one measured before the kind existed", (path, digest) => {
    const src = readFileSync(join(ROOT, path), "utf8");
    expect(/\bdouble\b/.test(src.replace(/double_bed/g, ""))).toBe(false);
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
  });
});

const hall = (door: string): string => `plan "Hall" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r_hall at (0,0) size 8000x6000 label "Hall" uses entry
  ${door}
  window at (8000,3000) width 1200 wall shell
}`;
const DOUBLE = "door id=d_main double on r_hall.bottom at center width 1800 swing inward";

suite("`double` door kind — what it is", () => {
  it("two leaves of half the width, one per jamb, closing onto each other at the centre", () => {
    const leaves = doorLeaves({
      at: { x: 4000, y: 6000 },
      width: 1800,
      hinge: "left",
      swing: "in",
      host: { a: { x: 0, y: 6000 }, b: { x: 8000, y: 6000 }, thickness: 200 },
      doorKind: "double",
    });
    expect(leaves).toHaveLength(2);
    expect(leaves.map((s) => s.radius)).toEqual([900, 900]);
    expect(leaves.map((s) => s.hinge)).toEqual([
      { x: 3100, y: 6000 },
      { x: 4900, y: 6000 },
    ]);
    // Both latch jambs are the doorway's centre.
    expect(leaves.map((s) => s.farJamb)).toEqual([
      { x: 4000, y: 6000 },
      { x: 4000, y: 6000 },
    ]);
  });

  it("compiles clean, is `kind: double` in describe(), and draws two leaves and two arcs", () => {
    const src = hall(DOUBLE);
    const r = compile(src, { noCache: true });
    expect(r.errors).toEqual([]);
    expect(lint(src)).toEqual([]);
    const d = describePlan(src) as { doors: { id: string; kind?: string; width: number }[] };
    expect(d.doors.find((x) => x.id === "d_main")).toMatchObject({ kind: "double", width: 1800 });
    expect((r.svg.match(/ A /g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("takes `swing` and refuses `hinge`, `slide` and `open` (E_DOOR_KIND_CLAUSE)", () => {
    for (const clause of ["hinge left", "slide left", "open 0.5"]) {
      const src = hall(`door id=d_main double on r_hall.bottom at center width 1800 ${clause}`);
      const codes = compile(src, { noCache: true }).diagnostics.map((x) => x.code);
      expect(codes, clause).toContain("E_DOOR_KIND_CLAUSE");
    }
  });

  it("the printer round-trips it: `format` keeps the kind word where it was written", () => {
    const src = hall(DOUBLE);
    const out = format(src);
    expect(out).toContain("door id=d_main double on r_hall.bottom at center width 1800 swing inward");
    expect(format(out)).toBe(out);
    expect(compile(out).svg).toBe(compile(src).svg);
  });

  it("Plan JSON round-trips it: `door_kind: double`, no hinge, the same drawing back", () => {
    const src = hall(DOUBLE);
    const { json } = planToJson(src);
    const door = (json as unknown as { openings: { id: string; door_kind?: string; hinge?: string }[] }).openings.find(
      (o) => o.id === "d_main",
    );
    expect(door).toMatchObject({ door_kind: "double" });
    expect(door!.hinge).toBeUndefined();
    const { source, diagnostics } = planFromJson(json as PlanJson);
    expect(diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(compile(source!).svg).toBe(compile(src).svg);
  });

  it("each leaf is judged: a piece in either leaf's swing is `W_SWING_OBSTRUCTED`, once", () => {
    // The leaf on the east jamb sweeps x 4000-4900, y 5100-5900; a chest stands in it.
    const src = hall(`${DOUBLE}\n  furniture chest at (4500,5300) size 300x300`);
    expect(lint(src).filter((x) => x.code === "W_SWING_OBSTRUCTED")).toHaveLength(1);
    // The hinge-flip remedy is a hinged door's: never offered for a pair.
    const d = lint(src).find((x) => x.code === "W_SWING_OBSTRUCTED")!;
    expect(d.hints!.join(" ")).not.toContain("other jamb");
    expect(d.fixes ?? []).toEqual([]);
  });

  it("a mirrored `place` carries it: the swing face flips, nothing else is handed", () => {
    const comp = `plan "M" {
  units mm
  grid 50
  component Bay() {
    wall id=w exterior thickness 200 { (0,0) (4000,0) }
    door id=d double at (2000,0) width 1600 wall w swing in
  }
  place Bay() as a at (0,0)
  place Bay() as b at (10000,0) mirror y
}`;
    expect(compile(comp, { noCache: true }).errors).toEqual([]);
    const svg = compile(comp).svg;
    // Two doors, each drawn with two arcs.
    expect((svg.match(/ A /g) ?? []).length).toBeGreaterThanOrEqual(4);
    // The pair is symmetric about the doorway's centre, so a reflection can change only the face
    // it opens to (`door.transform` flips `swing`); both instances stay `double`.
    const doors = (describePlan(comp) as { doors: { id: string; kind?: string }[] }).doors;
    expect(doors.map((x) => x.kind)).toEqual(["double", "double"]);
  });
});
