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
 * payload the same PR left byte-identical: 23 of the 40 (28 examples and 12 fixtures) that write
 * none. The other 17 moved for the PR's lint rules, not for the kind, each named in
 * `docs/plans/plan-soundness/research/2026-10-26-ps211e-as-built.md`: 15 examples were edited to
 * clear `W_HOB_UNDER_WINDOW`, `W_HOB_FRIDGE_GAP` (`garden-house` and `terrace-row` at exactly
 * 300 mm, inside the cited 305), `W_LEAF_TOO_WIDE` (`transit-hall` by becoming a `sliding` door)
 * or `W_DOORWAY_BLOCKED` read from the wall's face (PS2.54); `examples/relational.arch` was too,
 * and is back as `main` has it under the ruling on wide openings (it lints clean again, so its
 * whole payload is `main`'s, and its second-table pin is its whole digest); and
 * `test/fixtures/off-path-bypass.arch` gains `W_DOORWAY_BLOCKED` and is kept as written. Six
 * examples write `double` doors (their wide leaves fixed) and are the kind's own drawings.
 * (The agent gallery is left out: no test may read it, `test/agent-gallery.test.ts`.)
 *
 * The kind's own path is reachable only from its word: `doorLeaves` returns a hinged door's one
 * `doorSwing`, computed by the same arithmetic as before (`swingAlong`), and the resolver adds
 * nothing to a door that does not name the kind. Every plan below exercises hinged doors, and
 * `examples/two-storey.arch` (here) and `examples/terrace-row.arch` (in the second table) the
 * door-kind flagships' paths.
 *
 * Those 17 are pinned by a second table below, without `lint()`, on the source `main` has.
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/materials.arch", "1a4aa9bad5d42f06c1158d6089a71b784b8f079761b7a03dad17a1271fd5b2ff"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "2a6b29053ac201b452bde4204087f10b17648473e3080327d2486e0cba11d86b"],
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"],
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

/**
 * ## The second law: the 17 plans the first table leaves out draw and describe as on `main`
 *
 * The first table cannot pin the 17 plans this PR moved for its lint rules, so the `doorLeaves`
 * refactor would go unwatched exactly where the edited examples hang most of their hinged doors.
 * This table pins them without `lint()`: every storey's SVG, `describe()` and
 * `compile().diagnostics` ({@link allStoreysDigestWithDiagnostics} with a `lint` that returns
 * nothing), of each plan's source **as it stands on `main`**, measured against `src/` at
 * `2c7ca200` (this branch's merge base with `main`; `b0f89776`, with PS7.1 merged, gives the same
 * seventeen) by the same digest body run on a `git archive` of that tree.
 *
 * The test rebuilds `main`'s source from the branch's file by undoing this PR's edits, each a
 * block of whole lines found exactly once, and holds the result to `main`'s own bytes (the
 * source's SHA-256) before it digests it, so an edit table that drifts cannot pass. Two plans
 * need no edit: `examples/relational.arch` (its table inset is back to 300, the ruling on PR
 * #283; it lints clean, so `lint()` adds `[]` either way and this pin is its whole payload) and `test/fixtures/off-path-bypass.arch`, which gains a lint warning only.
 */
const MAIN_SOURCES: [path: string, payload: string, source: string, undo: [branch: string, main: string][]][] = [
  [
    "examples/bungalow.arch",
    "c7a8ee06b84987b04b737449cfd19028febb61c0e3ee85b6d147c1fdf2d1a7c1",
    "554bda123b628ef6f5f24ffbe4b1c3383d11731638822173e230298b1c2ce0f8",
    [
      [
        "  furniture kitchen_sink against wall shell segment 3 offset 2000 in r_kitchen  # under the window\n  furniture stove        against wall shell segment 3 offset 2800 in r_kitchen",
        "  furniture kitchen_sink against wall shell segment 3 offset 1900 in r_kitchen  # under the window\n  furniture stove        against wall shell segment 3 offset 1100 in r_kitchen",
      ],
      [
        "  furniture counter      against wall shell segment 3 offset 1100 in r_kitchen",
        "  furniture counter      against wall shell segment 3 offset 2600 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/courtyard-house.arch",
    "27d16f56824757b4822d8f2215acc9e5ec84aca565b9f9ac039122aea466a3a6",
    "13a54cb2e73484b4576eac3df9f2dd6232b96dca4d78fe69042c535613977303",
    [
      [
        "  furniture kitchen_sink against wall shell segment 0 offset 14400 in r_kitchen\n  furniture stove        against wall shell segment 0 offset 13100 in r_kitchen\n  furniture counter      against wall shell segment 0 offset 13700 in r_kitchen",
        "  furniture kitchen_sink against wall shell segment 0 offset 13100 in r_kitchen\n  furniture stove        against wall shell segment 0 offset 13800 in r_kitchen\n  furniture counter      against wall shell segment 0 offset 14400 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/furnished-flat.arch",
    "afab7212389aaa5eb6a96917c0af81dda7b5560624ab56214b890044c7267741",
    "ea6e15ae08a102a02ebaea404a7986e06291c6b7ee416e654f029716971be5e2",
    [
      [
        "  furniture stove         against wall w_north offset 7950 in r_kitchen",
        "  furniture stove         against wall w_north offset 7350 in r_kitchen",
      ],
      [
        "  furniture dishwasher    against wall w_north offset 7350 in r_kitchen",
        "  furniture dishwasher    against wall w_north offset 7950 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/garden-house.arch",
    "e5035803bb97e05017f567426ec701137be0f9d07530b72158a31db29e36fe1d",
    "00da192b82e1ca070884b3ef214b26228745fdc69075013f042c92d3c579be7f",
    [
      [
        "    furniture fridge       against wall w_e1 offset 3200 in r_kitchen\n    furniture counter      against wall w_e1 offset 2500 in r_kitchen",
        "    furniture fridge       against wall w_e1 offset 2500 in r_kitchen\n    furniture counter      against wall w_e1 offset 3200 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/garden-loft.arch",
    "9c32144fa59fbed83396dcbfa1083cce3838976d60f4dae96f21df2f13c17cae",
    "e5124b3fb7009b347c15af1daaf6c54696d250f3b0f823f0695728271e53766c",
    [
      [
        "  furniture stove        against wall w_west offset 1900 in r_live\n  furniture kitchen_sink against wall w_west offset 2700 in r_live\n  furniture counter      against wall w_west offset 1100 in r_live",
        "  furniture stove        against wall w_west offset 1100 in r_live\n  furniture kitchen_sink against wall w_west offset 1900 in r_live\n  furniture counter      against wall w_west offset 2700 in r_live",
      ],
    ],
  ],
  [
    "examples/hillside-villa.arch",
    "32d9386cfdc776a02fc2e9fad563baae48eff007f3a161a3cb77c0bca9e549e6",
    "df395956f53fec917277953d52d899310475f1b318d603a52c9c5b087aeb3a79",
    [
      [
        "    furniture stove          against wall shell segment 1 offset 7400 in r_kitchen\n    furniture dishwasher     against wall shell segment 1 offset 6600 in r_kitchen\n    furniture fridge         against wall w_l1_band_e offset 700 in r_kitchen",
        "    furniture stove          against wall shell segment 1 offset 6500 in r_kitchen\n    furniture dishwasher     against wall shell segment 1 offset 7100 in r_kitchen\n    furniture fridge         against wall shell segment 1 offset 7700 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/laneway-house.arch",
    "fe7de9e78abe6f38ec285f1d23e79e95b6aea68de9da3a6fa26f0f41218c030f",
    "50700d95f8967d70c0e203bf0c5c078c2a87cb096b94c00b423fc170a5c2de38",
    [
      [
        "  furniture fridge       against wall w_west offset 3600 in r_live",
        "  furniture fridge       against wall w_west offset 400  in r_live",
      ],
      [
        "  furniture counter      against wall w_west offset 400  in r_live",
        "  furniture counter      against wall w_west offset 2800 in r_live",
      ],
    ],
  ],
  [
    "examples/practice-office.arch",
    "0c130db682d1f18310d6e8516b7949b3a476d70f7cbd9236bbd31afc32995429",
    "a9ce310bf0cf4c4fb19e2f6601234f341ffa32daefd22e9679971bc979940a0b",
    [
      [
        "  furniture counter against wall w_s2 offset 3600 in r_break\n  furniture fridge against wall w_s2 offset 2400 in r_break",
        "  furniture counter against wall w_s2 offset 2400 in r_break\n  furniture fridge against wall w_s2 offset 3600 in r_break",
      ],
    ],
  ],
  [
    "examples/relational.arch",
    "330b426dc44cdf8ee2379d0c5469649da9f1dc7a88aa027a915b7e71a1045ec4",
    "87f11eeb59e6f38b111461315e0472052d687b958e59ad9c1ccd299bcc0650ef",
    [],
  ],
  [
    "examples/studio.arch",
    "c9e4c976c814207b7ad9b74be3b32eada7c16cb4d813e203fcbd06b65c15247e",
    "43b36bad2c910d6e62afe7947fbb7cdcd83c536e7f29013ecf1999ed0418700d",
    [
      [
        "  # Kitchen run along the north wall: sink · stove · counter · fridge (drawn as symbols).",
        "  # Kitchen run along the north wall: sink · counter · stove · fridge (drawn as symbols).",
      ],
      [
        "  furniture counter      at (1950,250) size 600x600\n  furniture stove        at (1200,250) size 600x600",
        "  furniture counter      at (1200,250) size 600x600\n  furniture stove        at (1950,250) size 600x600",
      ],
    ],
  ],
  [
    "examples/terrace-row.arch",
    "5b45dd460a3dbb1e788b8a839ee1f7fb594a0b1efe92118c84e1bf4639edca87",
    "ce926d751443bccbbbe8dd6290271f5766d7e3fb740cca7251fbe1d41a0251f3",
    [
      [
        "    furniture id=f_fridge fridge       against wall shell segment 1 offset 8150 in living",
        "    furniture id=f_fridge fridge       against wall shell segment 1 offset 8100 in living",
      ],
    ],
  ],
  [
    "examples/themed.arch",
    "62282d6debde517de65f58f43cd67cb00994c9da2fa9b5926be161b4d063e954",
    "96ddcf9a4195ad4d97af300388b1ece7e1f804f2b086c875230e46688600b307",
    [
      [
        "  door   at (3000,3000) width 900  wall partition hinge left swing in",
        "  door   at (3000,2000) width 900  wall partition hinge left swing in",
      ],
    ],
  ],
  [
    "examples/tiny-house.arch",
    "1af2e44436e4d15d93eae05719c2e73f05e27fd73047ebf1f0f712011d23e93b",
    "761feb2a2f41480b0f98e09fbab08cbca202379daa95133babde00fba0d422de",
    [
      [
        "  # depth or wall face is written down twice. The stove stands past the window's end, off\n  # the flames' curtain, and the fridge is a 500 mm slimline: it keeps a worktop's 305 mm\n  # from the stove and still ends where the bed begins. The worktop turns the corner onto the",
        "  # depth or wall face is written down twice. The worktop turns the corner onto the",
      ],
      [
        "  furniture stove        against wall shell segment 0 offset 1450 in r_main\n  furniture fridge       against wall shell segment 0 offset 2350 size 500x650 in r_main",
        "  furniture stove        against wall shell segment 0 offset 1200 in r_main\n  furniture fridge       against wall shell segment 0 offset 1800 in r_main",
      ],
    ],
  ],
  [
    "examples/townhouse.arch",
    "dcddd916b6af56d49a6e843c46b4bcd4f3ee5f1711ce3dbe9102a88d9c0a1ef4",
    "6173926c3747eec3b2a679cf4c24c15f463a0638f56bd9d9a5d87fd53b44d091",
    [
      [
        "    furniture fridge       against wall shell segment 3 offset 3200 in r_kitchen",
        "    furniture fridge       against wall shell segment 3 offset 2900 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/transit-hall.arch",
    "b95b9997518ea3ed923a224042b7acbe334ec1e06528099349c9518c03b2b25a",
    "fb0fd8e73ed8fc39705dd16e30fbd51740923735e2f1cf55f637b8914e650f77",
    [
      [
        "  door id=d_main sliding at (45000,40000) width 4000 wall shell",
        "  door id=d_main at (45000,40000) width 4000 wall shell swing into r_unpaid",
      ],
    ],
  ],
  [
    "examples/two-bed.arch",
    "4ddd7391b3da9f7b6b74bb336b6b65c0031a34fe99a22914f260026b2d14fc01",
    "64900f557e651ec2bfa263284f0fb583a4ca8eece54ec3a8c8335ef7d5d72090",
    [
      [
        "  furniture stove        against wall exterior segment 3 offset 5300 in r_living",
        "  furniture stove        against wall exterior segment 3 offset 6800 in r_living",
      ],
      [
        "  furniture counter      against wall exterior segment 3 offset 6800 in r_living",
        "  furniture counter      against wall exterior segment 3 offset 5300 in r_living",
      ],
    ],
  ],
  [
    "test/fixtures/off-path-bypass.arch",
    "406385c9b107c234c63f035210f548ea22651474eabb6c93566526eea42a84ef",
    "bc33e0d50b0e1d1b22866d599c109389c9d506613fa0903ef5312d0562272981",
    [],
  ],
];

const NO_LINT: CompilerApi = { compile, describe: describePlan, lint: () => [] };
/** A `door … double …` statement (a comment's "double-height" or a `double_bed` is not one). */
const WRITES_DOUBLE = /^\s*door\b[^#\n]*\bdouble\b/m;
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

suite("`double` door kind — the plans its lint rules moved still draw and describe as on main", () => {
  it.each(MAIN_SOURCES)("%s: SVG, describe() and diagnostics of main's source", (path, payload, source, undo) => {
    let src = readFileSync(join(ROOT, path), "utf8");
    for (const [branch, main] of undo) {
      expect(src.split(branch).length - 1, `${path}: an edit block is found exactly once`).toBe(1);
      src = src.replace(branch, () => main);
    }
    expect(sha256(src), `${path}: the rebuilt source is main's`).toBe(source);
    expect(WRITES_DOUBLE.test(src)).toBe(false);
    expect(allStoreysDigestWithDiagnostics(NO_LINT, src)).toBe(payload);
  });

  it("the two tables together cover every plan of examples/ and test/fixtures/ that writes no `double` door", () => {
    const pinned = new Set([...BASELINE.map(([p]) => p), ...MAIN_SOURCES.map(([p]) => p)]);
    expect(pinned.size).toBe(BASELINE.length + MAIN_SOURCES.length);
    const all = ["examples", "test/fixtures"].flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((f) => f.endsWith(".arch"))
        .map((f) => `${dir}/${f}`),
    );
    const none = all.filter((p) => !WRITES_DOUBLE.test(readFileSync(join(ROOT, p), "utf8")));
    expect(none.filter((p) => !pinned.has(p))).toEqual([]);
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
