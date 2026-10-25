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
  ["pairwise-forms", "c0c49d00ec76a8c54d65632e164d1697e9d70f55214ecc13efed97f39d984f15"],
  ["beside-walls-from-rooms", "1ac81bb4260561095036634e9079846c6984b655f7ff904018622caf4c2d50e4"],
  ["frames", "b00d94e4583565a90247a3c6905c31f6670ac8097a5c990cfdb46d663722a29f"],
  ["widen-4000", "39560adbd89d36ba775bdcf70edba0dbaa40f24fb0e3bc9007fbe268abbd7aed"],
  ["widen-4500", "9eedd7e2646e16a777655ade402a5316bc7539cc46b691feef1805ec5412874e"],
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
