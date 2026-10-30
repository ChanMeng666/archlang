/**
 * The `double` door kind (plan-soundness PS2.11e): its byte-identity law, its printer and Plan
 * JSON round trips, and what it draws and refuses.
 *
 * ## The law: a plan that writes no `double` door renders, describes and lints as before
 *
 * The digests below are the whole agent-facing payload ({@link allStoreysDigestWithDiagnostics}:
 * every storey's SVG, `describe()` and `lint()`, plus `compile().diagnostics`), **measured against
 * `src/` at `e432c24a`** (`main` with PR #280's stair rules, which has no `double` kind; first taken
 * at `8c2d6150`, re-taken when PR #280's example edits moved `two-storey`) with that tree extracted
 * by `git archive` and this suite's own digest body (`test/byte-identity-digest.ts`) run against it.
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
 * `test/fixtures/storeys-eaves-overflow.arch` (PS2.77) was added after the kind: its row is the
 * same digest body run on `e432c24a`'s `src/` (equal to the current tree's).
 * `test/fixtures/lock-before.arch`, `lock-partition-moved.arch` and `lock-window-moved.arch`
 * (preview-and-remodel B1, `test/lock.test.ts`) were added after the kind too: each row is the
 * same digest body on the tree that adds them; they write no `double` door.
 * `examples/remodel.arch` (preview-and-remodel B3b, `test/wall-status-drawing.test.ts`) likewise.
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

/** Measured at `e432c24a` (see the header). */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/clinic.arch", "af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5"],
  ["examples/corner-cafe.arch", "199a01c5d9fcbe38de99e8a87109a800428eee868b171404e81e2dfbb51a57ce"],
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/materials.arch", "635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef"],
  ["examples/remodel.arch", "60d0399664a56b8bf38bd88b093f880b349f647bf21888cdafc88cf6d6611f01"],
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"],
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
  ["test/fixtures/schedule-sheet.arch", "15dc29228ea12dae7240ad843567f88218c5a57bd8838ea950b1a5792c2579a5"],
  ["test/fixtures/star30.arch", "93ffc93f0294e7eb2fed6e9db698f85e25e8f9f7a49d93a8de0d6028da05135b"],
  ["test/fixtures/storeys-eaves-overflow.arch", "e29b5e34735306051eeea8215d258873db2935ed3c7ebaf575a4b7af5cb89a6d"],
  ["test/fixtures/zones-levels.arch", "05693d9ec59a2c27dcf9c35c5b8d8d5a63969ee0931499b97305433324cb978f"],
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
 * `e432c24a` (`main` after PR #280, whose stair edits to `garden-house` and `hillside-villa` are in
 * `main`'s source here; first taken at `2c7ca200`) by the same digest body run on a `git archive`
 * of that tree.
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
    "21eee9f4da8cc53b9fb86193eab28a24ca0b795dab96cf68d57e1c34cd567f71",
    "f6ba848bd9ad0f4073876e5fbac39a4ea54bb7ef690f8d32243b5ed5d3142eef",
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
    "f7069b459aea043d9b908d9649dd280515e5b975f351cc779fd7666869727dfe",
    "0bc00da708cfd4f3c1ff27a675968ef37cd4d8668ceb1b1ee9f6e3fab67e4401",
    [
      [
        "  furniture kitchen_sink against wall shell segment 0 offset 14400 in r_kitchen\n  furniture stove        against wall shell segment 0 offset 13100 in r_kitchen\n  furniture counter      against wall shell segment 0 offset 13700 in r_kitchen",
        "  furniture kitchen_sink against wall shell segment 0 offset 13100 in r_kitchen\n  furniture stove        against wall shell segment 0 offset 13800 in r_kitchen\n  furniture counter      against wall shell segment 0 offset 14400 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/furnished-flat.arch",
    "890920d33692d593e437eab291ca02494542f90ec4a7292de145fdf3c5a2451e",
    "24fbdc37c75eb776d93dd062d5d4870f74b4c7313ea04ed94de7d3b816d05861",
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
    "f4873f9a1f6e68f494a84c913d6f850560f626850cfd071a9fb51784835c5b01",
    "7b0be7cc59f85d596c632beb990432981f153dd38ce1ae7027d8516f01d807ae",
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
    "f5917b29a5789d764d5f87c26c453c41cfd494779aec55d6228d542582650e3c",
    "8aff5c59e5e4aa5d446e2ea8c9492badf80205167402a29cf7a8e9f02795684c",
    [
      [
        "    furniture stove          against wall shell segment 1 offset 7400 in r_kitchen\n    furniture dishwasher     against wall shell segment 1 offset 6600 in r_kitchen\n    furniture fridge         against wall w_l1_band_e offset 4700 in r_kitchen",
        "    furniture stove          against wall shell segment 1 offset 6500 in r_kitchen\n    furniture dishwasher     against wall shell segment 1 offset 7100 in r_kitchen\n    furniture fridge         against wall shell segment 1 offset 7700 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/laneway-house.arch",
    "47330af81518da4ba0088fd0d85a62c62ed2d87f180b7ca070a9b488346b7730",
    "cd383a3a7c334d9e7979a99724e7d8ba3d2fee67be9f8b09a76e0b84ba141ef9",
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
      // PS2.74: the accessible-WC pan moved into the 400–500 mm band.
      [
        "  furniture wc against wall shell segment 2 offset 8200 in r_wc",
        "  furniture wc against wall shell segment 2 offset 7450 in r_wc",
      ],
    ],
  ],
  [
    "examples/relational.arch",
    "4c117d32d823ccbfa76734397cf58001d5b3fcf700a67ee52b493856c436f5b1",
    "8034d1bda180d886dd5fa3e053155b20f1508131985434735c5bdc283bd74053",
    [],
  ],
  [
    "examples/studio.arch",
    "db6313cfbaecbf55d2e78fac0c1de44a6973b4106497cb7700f3b4b40a94808f",
    "c9c1f50e159d4b8860578c7dbdfe183adbfa2886ae7ed75333ae27e7e33f7ac6",
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
    "fe22b49a79161204ff3e4bbe1e638501963064c9a077fc2dd1a7c0afae2a5f70",
    "e8195ad63a1af314dd906352eaedb04ebd9ce4f5f28fb7716eb24ad4c82a5bfb",
    [
      [
        "  door   at (3000,3000) width 900  wall partition hinge left swing in",
        "  door   at (3000,2000) width 900  wall partition hinge left swing in",
      ],
    ],
  ],
  [
    "examples/tiny-house.arch",
    "e2c6cec139b1f0d1348d41ac8bae956cb0f605863a8947d849b6d977b39db166",
    "720d91aae86b2b3a346c34faf45e2352a26da352ce103450ead8a1d248389efa",
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
    "97a6f7c827c1a1e61846c74b3ee38992af2472e349c986fea064a8dcb5eadf72",
    "523c0f5bac7ee09915107b0595039e1c4d8b3378b4269636527e638ed6efdb16",
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
