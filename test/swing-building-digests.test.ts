/**
 * The building-relative swing digest table (card PS3.8): SHA-256 over SVG, `describe()`, `lint()`
 * and `compile().diagnostics` of every storey of each plan in `test/swing-building-plans.ts`,
 * pinned in its own commit after every existing digest suite was unchanged by the form and after
 * the twins, frames and refusals in `test/swing-building.test.ts`. Measured with the test's own
 * digest body (`allStoreysDigestWithDiagnostics`). A moved row is a finding to explain
 * (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { SWING_BUILDING_PLANS } from "./swing-building-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  ["k1-west-to-east", "7b408d0ac562b44ddd4972280ec06872b667fc45346b1a69f41c565a0d1b1a01"], // PS2.29: message text only, same code, same span
  ["k1-east-to-west", "5d4e7131e9886e6502a040d8e59e7c00f7b719bf032401d14da26d3a21d6567d"], // PS2.29: message text only, same code, same span
  ["loop", "201190f90c8af2e8f73b863136ab9708b417c58806280d730f758b0947552400"], // PS2.29: message text only, same code, same span
  ["ring", "142352155d5a15bc0abf34193616bc01616adbbd9c3626bd421df54a6186a682"],
  ["frames", "25cfb077669378f72b78849bc3cfa471aef510dbe14cd25ba36fdf46fb0eb71b"], // PS2.29: message text only, same code, same span
  // Moved once, by review round 1 (N1): the "both faces" message dropped "(it stands between two
  // rooms)", which was false for a wall free-standing inside one room. Message text only.
  ["refused", "d0ff72c2f1e61f259980b250b027ddbfdfcc724c82a6c5d98d80f0b64274f5c4"],
];

suite("swing inward|outward: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(SWING_BUILDING_PLANS.map((p) => p[0]));
  });
  it("only the refused plan has an error, and it raises both refusal families", () => {
    for (const [name, src] of SWING_BUILDING_PLANS) {
      const errs = new Set(
        compile(src)
          .diagnostics.filter((d) => d.severity === "error")
          .map((d) => d.code),
      );
      expect(errs, name).toEqual(name === "refused" ? new Set(["E_SWING_SIDE", "E_DOOR_KIND_CLAUSE"]) : new Set());
    }
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = SWING_BUILDING_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
