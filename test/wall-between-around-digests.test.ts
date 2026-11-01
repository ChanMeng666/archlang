/**
 * The pairwise-wall digest table (ADR 0028 §4; card PS3.3): SHA-256 over SVG, `describe()`,
 * `lint()` and `compile().diagnostics` of every storey of each plan in
 * `test/wall-between-around-plans.ts`, pinned in its own commit after the byte-identity law
 * held (every existing digest suite unchanged, no re-pin; a corpus sweep against `main` moved
 * only the new language-reference fence; the twins in `test/wall-between-around.test.ts`).
 * Measured with the test's own digest body (`allStoreysDigestWithDiagnostics`). A moved row is
 * a finding to explain (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { WALL_BETWEEN_AROUND_PLANS } from "./wall-between-around-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  // PS2.69: `lint()` only, in these three rows: kitchen "C"'s `W_ROOM_NO_FIXTURE` hint no longer
  // quotes its fixture set (the counter's placement would stand in front of the exterior door and
  // raise `W_EXIT_APPROACH_BLOCKED`, which the hint's set verification now re-lints, PS2.17), so it
  // names the fixtures and says why; same code, same span, no new code.
  ["pairwise-forms", "40e355067438606cc04800bd7fddef29300ecaa16a1cf781069ea9aff8605d59"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["beside-walls-from-rooms", "2b099428e6ddc133abf357450a697883b156a28ad3d4fdb767109996faf963c3"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["frames", "e2b4d93ea7d460b79d4c7b0c8e4b608402d76b9eb66efb2f7078c9afdbd40acc"], // `centreline_at`, see ./byte-identity-baseline.ts; #367, see test/byte-identity-baseline.ts
  ["widen-4000", "c728d0c567f3b3b116fd00b8870ae67ff5ca525f490f51d7d1dae511ab77e3e3"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["widen-4500", "867ccff0da3eb30c562df83da26c5ef86835cd62e16486efe3fdf61f3d91e0a2"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["refused", "7e18b4bff41d18b98b0f0457e0f0488a8ce0bb34792e7194d8144c42e88dc901"], // PS2.29: message text only, same code, same span
];

suite("pairwise walls: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(WALL_BETWEEN_AROUND_PLANS.map((p) => p[0]));
  });
  it("every plan but the refused one compiles clean of errors", () => {
    for (const [name, src] of WALL_BETWEEN_AROUND_PLANS) {
      if (name === "refused") continue;
      expect(
        compile(src).diagnostics.filter((d) => d.severity === "error"),
        name,
      ).toEqual([]);
    }
  });
  it("the refused plan raises every refusal family", () => {
    const src = WALL_BETWEEN_AROUND_PLANS.find((p) => p[0] === "refused")![1];
    expect(new Set(compile(src).diagnostics.map((d) => d.code))).toEqual(
      new Set([
        "E_ROOMS_OVERLAP",
        "E_WALL_BETWEEN_NOT_ADJACENT",
        "E_ROOM_NOT_RECTANGLE",
        "E_PARTITION_TOO_SHORT",
        "E_ROOMS_NOT_TILING",
        "E_UNKNOWN_REF",
        "E_WALL_BETWEEN_OPEN",
        // the overlapping room is also a plan-wide warning
        "W_ROOM_OVERLAP",
      ]),
    );
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = WALL_BETWEEN_AROUND_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
