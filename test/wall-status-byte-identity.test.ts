/**
 * Wall `status` (preview-and-remodel B3a): the byte-identity law.
 *
 * A plan that writes no `status` renders, describes and lints exactly as before the clause
 * existed. The digests below are the whole agent-facing payload
 * ({@link allStoreysDigestWithDiagnostics}: every storey's SVG, `describe()` and `lint()`, plus
 * `compile().diagnostics`, since the clause reaches the resolver), **measured against `src/` at
 * `88d83823`** (`main` before the clause), with that tree extracted by `git archive` and its own
 * copy of this suite's digest body (`test/helpers/byte-identity-digest.ts`) run against it — never a
 * rebuilt working tree. The set is every plan of `examples/` and `test/fixtures/`: all 47 write no
 * `status`, and none moved. Cross-check that the body is the sanctioned one: the rows for
 * `examples/accessible.arch` and `test/fixtures/zones-levels.arch` are character for character the
 * ones `double-door-byte-identity.test.ts` carries.
 *
 * The sweep was proved able to fail before it was trusted: with `describe()` planted to emit its
 * `wall_status` block on every storey, 45 of the 47 rows went red. The other two,
 * `examples/imports.arch` and `examples/museum-wings.arch`, `import` a module, which this digest
 * body compiles without a world, so they stop at the resolve error and describe nothing; their
 * rows pin that error payload.
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 23 digests, of the
 * 23 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./helpers/byte-identity-digest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

/** Measured at `88d83823` (see the header). */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "eee3dc30bd94b5f31c7189f719ff38e09d6f56a3d5484f443432591f8f1e737e"],
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "0dd331e28b8f4e20c3b359c8e819ed738290295cc83934c1a38808d2fd83dc13"], // CV13 (was 074d5531): example source edited (chairs added)
  ["examples/classroom-block.arch", "cca7c3dfef6593e826303c88878fbfb5537bded8a6bb9323696ae4b446ac046a"],
  ["examples/clinic.arch", "b31aad2c2f0c0d1b7e63498f8844570f16c700846d533288de7e43bf5ad56e63"],
  ["examples/corner-cafe.arch", "d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5"], // #367, see test/byte-identity-baseline.ts
  ["examples/courtyard-house.arch", "3ce3c72f6915ece00f2eca8d9321651aca7c2644b95cc423f10397395fc9ab12"], // CV13 (was 0f6dddac): example source edited (chairs added)
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "f3d86da1d7aed260f386efa6ca98b440c89ee7b2b84b0d0937401c72d7bb113e"],
  ["examples/garden-house.arch", "72528a5f6784a5c5d9527299a5abb330423c747bafb17458716dc336cc9a3eb3"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/garden-loft.arch", "2814a29269f878cd596372eafe0fdf8c1d1bc9f0c478b33f1cae2906b6db8d8d"], // CV13 (was e0ce8a5f): example source edited (chairs added)
  ["examples/hexagon-pavilion.arch", "847694c47f21e1660d3a4bbd70469d8fac354b2d255070478c59fe1aa83a613a"], // CV13 (was 3078765c): example source edited (chairs added)
  ["examples/hillside-villa.arch", "123f2af228faf039c29d9861b60cfff3574b3cd04bc0057d5549cd02e67066fb"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/imports.arch", "a0341285f4e3699b738aa1916bba278eed61e347df4d3a2de139b9f0185d9678"],
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
  ["examples/sheet-notes.arch", "708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "3e8d6696f955b554411c7379e3a8bc9ce5cbf83a9521930129f18915bca585d0"], // CV08 (was 6667da00): example source edited (sofa turned to face the room)
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "e51de067c879ba64272632c73dc6794dae996df3307fa8a0b16fa1b9d1a44915"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3657648f): example source edited (chairs added); CV08 (was 3395a3eb): example source edited (sofa turned to face the room)
  ["examples/transit-hall.arch", "649e39d370d434467bee6f23ad8c7fc0bef578d44081f18d96ec82ed2532c5be"],
  ["examples/two-bed.arch", "6393e0321cc48a44fbf17b7aa6008d89dcfbbcceea13418c4045875c5ffdf6c0"], // `centreline_at`, see ./byte-identity-baseline.ts; CV13 (was fe871cbb): example source edited (chairs added)
  ["examples/two-storey.arch", "92a71843b7de0b87acb1ef3ea1b859d1c0bedbe4ef35025f3524ecea1d674aa8"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["test/fixtures/axes-grid.arch", "32dad3e21d1e5c40424473fdf05896088a2f848fd7f90d395d6cbd70169a0655"],
  ["test/fixtures/chain30.arch", "ce81264ecdc3a086f99708f90aee5dd929c71b9e8ccaaa54a1da5ce5aa213325"], // #367, see test/byte-identity-baseline.ts
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"],
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"],
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/off-path-bypass.arch", "3c4ca1f843918cd8d3de1c1cf7efd00dec9a75bfffab468dc05c71ca5cb6361b"], // AF9 (was 81ef92c3): `W_DOORWAY_BLOCKED` on d_d gains a maybe-incorrect move to `at 1570` (its position alone) in lint(); SVG, describe() and the diagnostics are unchanged, and with that fix taken out the old digest returns
  ["test/fixtures/schedule-sheet.arch", "7894657cc6c6afff831d31be9a8658f9761f90c4ddfc4015c9b28571863fc780"],
  ["test/fixtures/star30.arch", "5104211cdd3733a56e18d141c68db6a097b679e484b1b18897e7637dd05d0bbb"], // #367, see test/byte-identity-baseline.ts
  ["test/fixtures/storeys-eaves-overflow.arch", "68492d111abcc4a0219738601073936dbd3aed2f645531ad125cb2bf083949e2"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM1.2a review, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  // was 05693d9e. D27: this plan's stair stands in no wall, so `bounds()` reaching its break line widens the
  // drawing 156 mm. Only the SVG, the Scene and the overlay moved: with the old ones put back the old digest returns.
  ["test/fixtures/zones-levels.arch", "21c4b504af358718519aea5578a13c3a441ea218c01732f688c8cafff5059d1c"], // RM9.2, see ./byte-identity-baseline.ts
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"],
];

suite("wall `status` — the byte-identity law", () => {
  it.each(BASELINE)("%s: the payload is the one measured before the clause existed", (path, digest) => {
    const src = readFileSync(join(ROOT, path), "utf8");
    expect(/\bstatus\s+(existing|demolish|new)\b/.test(src)).toBe(false);
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
  });
});
