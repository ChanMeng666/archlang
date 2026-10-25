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
  ["pairwise-forms", "0dcccccc013f5589489e77fc4b1dba159709419f8e8e03d83b685565a025529a"], // PS2.29: message text only, same code, same span
  ["beside-walls-from-rooms", "bb4db0582d5a70c2f06d7f232850d5da5c60f233b20d3da41a5218f0fd1b2cac"], // PS2.29: message text only, same code, same span
  ["frames", "f5c5137931998b3cdb5f4986cf183b8f25d0876026a2fe566fcc35183c3b5b84"], // PS2.29: message text only, same code, same span
  ["widen-4000", "18781e880e4e42843595c6116a9689622b3a9aa1dca04b1f3e4d177cf15ba887"],
  ["widen-4500", "dbf477f001fa9c3bb7f1ef3ce242afd204613ecd4cbc7d1437cce8570f2915e7"],
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
