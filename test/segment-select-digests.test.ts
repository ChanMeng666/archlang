/**
 * The segment-selector digest table (plan card PS3.5): SHA-256 over SVG, `describe()`, `lint()`
 * and `compile().diagnostics` of every storey of each plan in `test/tables/segment-select-plans.ts`,
 * pinned in its own commit after the byte-identity law held (every existing digest suite was
 * unchanged by the selectors) and after the twins in `test/segment-select.test.ts`. Measured
 * with the test's own digest body (`allStoreysDigestWithDiagnostics`). A moved row is a finding
 * to explain (`docs/testing.md` §3), never a re-pin.
 * re-measured by AF7 (#PR_AF7): only added related notes; strip==old proven (RM-D69; the check is the
 * `AF7_MAIN` test below, through `test/helpers/af7-notes.ts`).
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { af7StrippedApi } from "./helpers/af7-notes.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./helpers/byte-identity-digest.js";
import { SEGMENT_SELECT_PLANS } from "./tables/segment-select-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["ring", "b0e71529ada672dc0f5d35b78566b86fbcb5a523cd8157b5aad1651651b15d5b"], // PS2.29: message text only, same code, same span
  ["open", "1f3887ca145238a1bbf08e60fe13b2cdbf514f93903085fa051a3c0489f55b1e"], // H1: lint() gains W_EXTERIOR_RING_OPEN, true of this plan (an L on two of the room's four sides closes nothing); take that one diagnostic out and the digest is the old b084b3a9…; SVG, describe() and compile().diagnostics did not move. PS2.29: message text only, same code, same span
  ["derived", "0e9ba98a14acd1b134b0a7c40a08d4099d98b7f1be73c44dc15ee4b9bfaf289d"], // PS2.29: message text only, same code, same span
  ["frames", "fa90e92405b3198a736d6f7c9da05847bd679947c95e7b16b8da63be94a03822"], // PS2.29: message text only, same code, same span
  // A slanted polygon's datum refusal now reads "rectangular or rectilinear": message text only. With the old
  // words put back this plan's payload hashes to the digest before it, 81a19f28.
  ["refused", "6018d8a035d705bb75fcc144f5aa378b64074eefe2f9c9e11e98389eca14ecee"], // AF7 (RM-D69): only added related notes (was 67352892, AF7_MAIN)
  ["compass-refused", "bdfa0c557e5c3653610eee94b8f9f9c1983a262b0f91b31ea86e1a7f4708e741"],
];

/** AF7 (RM-D69): `main`'s digest of each row AF7 re-measured. The row's own digest body, with AF7's
 *  related notes taken out of `compile().diagnostics` and `describe()`, gives it back. */
const AF7_MAIN: [string, string][] = [["refused", "6735289270fe0fa8fcee6d6adabc593c177e7f5673b4787a629801a8442f1967"]];

suite("segment selectors: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(SEGMENT_SELECT_PLANS.map((p) => p[0]));
  });
  it("the plans that select compile clean, and the refused ones raise their refusals", () => {
    const codesOf = (name: string) =>
      compile(SEGMENT_SELECT_PLANS.find((p) => p[0] === name)![1]).diagnostics.filter((d) => d.severity === "error");
    for (const name of ["ring", "open", "derived", "frames"]) expect(codesOf(name)).toEqual([]);
    expect(new Set(codesOf("refused").map((d) => d.code))).toEqual(
      new Set(["E_SEGMENT_SELECT", "E_UNKNOWN_REF", "E_ROOM_NOT_RECTANGLE"]),
    );
    expect(codesOf("compass-refused").map((d) => d.code)).toEqual(["E_DATUM_COMPASS"]);
  });
  it("AF7: each re-measured row moved by its added related notes alone (strip==old)", () => {
    for (const [name, digest] of AF7_MAIN) {
      const src = SEGMENT_SELECT_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(af7StrippedApi(API), src), name).toBe(digest);
    }
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = SEGMENT_SELECT_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
