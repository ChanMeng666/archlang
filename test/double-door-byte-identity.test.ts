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
 * by `git archive` and this suite's own digest body (`test/helpers/byte-identity-digest.ts`) run against it.
 *
 * The set is every plan of `examples/` and `test/fixtures/` that writes no `double` door and whose
 * payload the same PR left byte-identical: 23 of the 40 (28 examples and 12 fixtures) that write
 * none. The other 17 moved for the PR's lint rules, not for the kind, each named in
 * `archlang-lab/plans/plan-soundness/research/2026-10-26-ps211e-as-built.md`: 15 examples were edited to
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
 * `examples/turning-stair.arch` (issue #362, S2) likewise.
 * `examples/knob-flat.arch` likewise (public-surfaces P4: the playground's knobs example).
 * `examples/courtyard-family.arch` likewise (product-roadmap RM8.5: the vocabulary showcase).
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 20 digests, of the
 * 20 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 */

import { sha256 } from "./helpers/digest.js";
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
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./helpers/byte-identity-digest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

/** Measured at `e432c24a` (see the header). */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/clinic.arch", "b31aad2c2f0c0d1b7e63498f8844570f16c700846d533288de7e43bf5ad56e63"],
  ["examples/corner-cafe.arch", "d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5"], // #367, see test/byte-identity-baseline.ts
  ["examples/courtyard-family.arch", "50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67"], // new example (RM8.5, the courtyard-family showcase)
  ["examples/hexagon-pavilion.arch", "847694c47f21e1660d3a4bbd70469d8fac354b2d255070478c59fe1aa83a613a"], // CV13 (was 3078765c): example source edited (chairs added)
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
  ["examples/knob-flat.arch", "578ec7551025df65b704f453b7af3493bf4abcfb19737fdece206e4c85fd2586"], // new example (P4, the knobs example), see header
  ["examples/materials.arch", "b3d629675b1a43d4d1113f10b38e732d0b826fdb2b019fcf14ac4b166abd435d"],
  ["examples/museum-wing.arch", "add9b13a425ec75dd2b88c4eba087465228822c37321b3d1952db6f0795ef6c7"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "7cceeb1be4622a8b84e1625a124d31f44fdfc15cd5362c4f4f25fa67f5560989"],
  ["examples/remodel.arch", "5fd914bb04d3d2c03d590844eb51dd3039763bab16b26d24e141b2c54b32fcfc"], // `centreline_at`, see ./byte-identity-baseline.ts; CV13 (was f0f4a5aa): example source edited (chairs added)
  ["examples/sheet-notes.arch", "708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a"],
  ["examples/turning-stair.arch", "4278a96ba7b215a43f121d04bd47fd94c94ab0c145cb7f7a2a7aba5201e2c6a2"], // new example (S2), see header; `centreline_at`, see ./byte-identity-baseline.ts; RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 4d2fb9dc)
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
  ["test/fixtures/schedule-sheet.arch", "7894657cc6c6afff831d31be9a8658f9761f90c4ddfc4015c9b28571863fc780"],
  ["test/fixtures/star30.arch", "5104211cdd3733a56e18d141c68db6a097b679e484b1b18897e7637dd05d0bbb"], // #367, see test/byte-identity-baseline.ts
  ["test/fixtures/storeys-eaves-overflow.arch", "68492d111abcc4a0219738601073936dbd3aed2f645531ad125cb2bf083949e2"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  // was 05693d9e. D27: this plan's stair stands in no wall, so `bounds()` reaching its break line widens the
  // drawing 156 mm. Only the SVG, the Scene and the overlay moved: with the old ones put back the old digest returns.
  ["test/fixtures/zones-levels.arch", "e210562bc76c83a60dc50f5a794ea603799286ee52e323f7f9ea22abb2c4a31a"], // RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was 21c4b504)
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
 * block of whole lines found exactly once, and holds the result to the source SHA-256 recorded in
 * its row (`main`'s bytes when the row was taken; a later comment-only edit moves it, as the studio
 * row notes) before it digests it, so an edit table that drifts cannot pass. Two plans
 * need no edit: `examples/relational.arch` (its table inset is back to 300, the ruling on PR
 * #283; it lints clean, so `lint()` adds `[]` either way and this pin is its whole payload) and `test/fixtures/off-path-bypass.arch`, which gains a lint warning only.
 */
const MAIN_SOURCES: [path: string, payload: string, source: string, undo: [branch: string, main: string][]][] = [
  [
    "examples/bungalow.arch",
    "0eb546d43889219bc80e4489c49df3657ca5c9991b3d9f74e08a6f5f5999f28e", // CV13 (was 4125b726): example source edited (chairs added)
    "6d1634cdcf91a19381c6e8b36be0412cf8c379a8913b66f139d83770a2c3552d", // CV13 (was f6ba848b): example source edited (chairs added)
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
    "9dc281ff3fccb4342eeb068f2b64e03d34da556cdc096c40ff7374152e41f983", // CV13 (was 657cad4c): example source edited (chairs added)
    "b38deef72b83dee87b8dec17a3788f9a3a2ce11b57d6ad4c1dcbf1b96d086d5b", // CV13 (was 0bc00da7): example source edited (chairs added)
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
    "a9cf2cb37c2b3db8e44c101a4f2a47bd0e855514b00435ddf5b11fbcd319835d", // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was f6ce8908)
    "847c9b74bf2f5f2b771c9fc1c96796af0c8f4b3fe3ec432ff314090d7eb4cb9a", // source: RM1.4 writes the four snapped sizes (same length; was 7b0be7cc); CO.1 writes its snapped `against` sizes out, here and in the undo block: less those clauses the rebuilt source is main's, and the payload is unchanged (was 6ad0c1d8); CV14: example source edited (stairwell void added) (was 52ea7948)
    [
      [
        "    furniture fridge       against wall w_e1 offset 3200 size 600x700 in r_kitchen\n    furniture counter      against wall w_e1 offset 2500 in r_kitchen",
        "    furniture fridge       against wall w_e1 offset 2500 size 600x700 in r_kitchen\n    furniture counter      against wall w_e1 offset 3200 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/garden-loft.arch",
    "3f5ed75e72fe3ba5a7c530e5e4f0f85b83d96d1396413ce80ae5f353d9c45d3b", // CV13 (was 869e2d6a): example source edited (chairs added)
    "f38979fb0d254c94527e2bdc97b3aace3e8391e0a3e1fe929da7dc6e7df5adb4", // CV13 (was e5124b3f): example source edited (chairs added)
    [
      [
        "  furniture stove        against wall w_west offset 1900 in r_live\n  furniture kitchen_sink against wall w_west offset 2700 in r_live\n  furniture counter      against wall w_west offset 1100 in r_live",
        "  furniture stove        against wall w_west offset 1100 in r_live\n  furniture kitchen_sink against wall w_west offset 1900 in r_live\n  furniture counter      against wall w_west offset 2700 in r_live",
      ],
    ],
  ],
  [
    "examples/hillside-villa.arch",
    "8c7c81af5502498ca1e7555deb6101212399dabd757070e9051f7a885f5e610e", // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 9e118d9f)
    "9e212d075b7d8e9375e09477d79926f9552ae0f19631ee7b4c0e8f4b8590f7a9", // source: RM1.4 writes the 17 snapped values and its comment of one (same length; was 8aff5c59); CO.1 writes its snapped `against` sizes out, here and in the undo block: less those clauses the rebuilt source is main's, and the payload is unchanged (was 743e5cde); CV14: example source edited (stairwell void added) (was 44fdb87e)
    [
      [
        "    furniture stove          against wall shell segment 1 offset 7400 in r_kitchen\n    furniture dishwasher     against wall shell segment 1 offset 6600 in r_kitchen\n    furniture fridge         against wall w_l1_band_e offset 4700 size 600x700 in r_kitchen",
        "    furniture stove          against wall shell segment 1 offset 6500 in r_kitchen\n    furniture dishwasher     against wall shell segment 1 offset 7100 in r_kitchen\n    furniture fridge         against wall shell segment 1 offset 7700 size 600x700 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/laneway-house.arch",
    "ab7e0a2cfd75005a48e3ce9c0a64df79f147aeb0aa061b82a56bcfc1296bf554", // CV13 (was 4d5dee59): example source edited (chairs added)
    "a86cb33a28aeb327593519251b8edef5872fe606639867cbb0cd51612a5f3d44", // CV13 (was cd383a3a): example source edited (chairs added)
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
    "2a5de67161f1db660b230d4f0a8e326c722d6e4ebaf5dbbf6f2d61d13c49de91",
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
    "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084", // `centreline_at`, see ./byte-identity-baseline.ts
    "8034d1bda180d886dd5fa3e053155b20f1508131985434735c5bdc283bd74053",
    [],
  ],
  [
    "examples/studio.arch",
    "db6313cfbaecbf55d2e78fac0c1de44a6973b4106497cb7700f3b4b40a94808f",
    // RM0.2b: the source hash moved c9c1f50e… -> 52ead9d1… because the header comment was corrected (comment only);
    // the payload digest above is unchanged, so SVG, describe() and lint() did not move.
    "52ead9d18570bac87fba18b6171e4f544f3603cb44e839fdbbb22be54c79350a",
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
    "682a2584e4fbc1b5cd6463b00c6ecf47df8470b36dd98cf22ba6471f59142769", // CV08 (was 5b45dd46): example source edited (sofa turned to face the room)
    "c4385d43d9030ec79ae4779b307dabf19d43cbe3c4660e43c74c27de44fc41c9", // CV08 (was ce926d75): example source edited (sofa turned to face the room)
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
    "53ab5829ca96ac492af9b093da70a72746417d6da5fb6aa6d8b1fd0f69ca03b6", // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was 2cdbb29b): example source edited (chairs added); CV08 (was e741d25e): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was b5f2d17b)
    "472a5c8b60c55b709fe3c96b77a6de995d789129afdc843e4aaf009f7fbe4568", // CV13 (was 6173926c): example source edited (chairs added); CV08 (was 5ef67caa): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was 8953b691)
    [
      [
        "    furniture fridge       against wall shell segment 3 offset 3200 in r_kitchen",
        "    furniture fridge       against wall shell segment 3 offset 2900 in r_kitchen",
      ],
    ],
  ],
  [
    "examples/transit-hall.arch",
    "14ed0b4789b50d4ea16dcb81ef02083e9f31e2a9add5b7a4b566f4e8f6dbb910",
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
    "263824a7017f9cda1502ff138fc1062cdbd433620d5080eeb0af16be3264701e", // `centreline_at`, see ./byte-identity-baseline.ts; CV13 (was 773304f8): example source edited (chairs added)
    "502b59c3033ecb085a481fa251d1845d4a9a90a128af1b1b23985f6a18df5571", // source: RM1.4 writes the two snapped sizes (same length; was 64900f55); CO.1 writes its fridge's snapped `against` size out: less that clause the rebuilt source is main's, and the payload is unchanged (was b2007915); CV13 (was a0afaf24): example source edited (chairs added)
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
