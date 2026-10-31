/**
 * Wall `status` (preview-and-remodel B3a): the byte-identity law.
 *
 * A plan that writes no `status` renders, describes and lints exactly as before the clause
 * existed. The digests below are the whole agent-facing payload
 * ({@link allStoreysDigestWithDiagnostics}: every storey's SVG, `describe()` and `lint()`, plus
 * `compile().diagnostics`, since the clause reaches the resolver), **measured against `src/` at
 * `88d83823`** (`main` before the clause), with that tree extracted by `git archive` and its own
 * copy of this suite's digest body (`test/byte-identity-digest.ts`) run against it — never a
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
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./byte-identity-digest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

/** Measured at `88d83823` (see the header). */
const BASELINE: [string, string][] = [
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
  ["test/fixtures/off-path-bypass.arch", "81ef92c32f98bc41635428f477b2cf7e59adea520e60892b5e39aa48fcbcaecf"],
  ["test/fixtures/schedule-sheet.arch", "15dc29228ea12dae7240ad843567f88218c5a57bd8838ea950b1a5792c2579a5"],
  ["test/fixtures/star30.arch", "93ffc93f0294e7eb2fed6e9db698f85e25e8f9f7a49d93a8de0d6028da05135b"],
  ["test/fixtures/storeys-eaves-overflow.arch", "e29b5e34735306051eeea8215d258873db2935ed3c7ebaf575a4b7af5cb89a6d"],
  ["test/fixtures/zones-levels.arch", "05693d9ec59a2c27dcf9c35c5b8d8d5a63969ee0931499b97305433324cb978f"],
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"],
];

suite("wall `status` — the byte-identity law", () => {
  it.each(BASELINE)("%s: the payload is the one measured before the clause existed", (path, digest) => {
    const src = readFileSync(join(ROOT, path), "utf8");
    expect(/\bstatus\s+(existing|demolish|new)\b/.test(src)).toBe(false);
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
  });
});
