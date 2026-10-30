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
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["k1-west-to-east", "db09ae897832301b114bc8ff586e44a794385a2b4c495a518d374d66b199d61c"], // PS2.29: message text only, same code, same span
  ["k1-east-to-west", "a04b716939992b6d37d522cf7d310dfae38aac880f235f9f63359abcfa10ae6f"], // PS2.29: message text only, same code, same span
  ["loop", "6a6e5e95567e7221eaf50b064a79d525f4cb2eca871290a95c0538afaacf6522"], // PS2.29: message text only, same code, same span
  ["ring", "4cc235210897be4e79a8e49740ddf55a2b28aa26fdd7fd0c03d1852cddff2bd0"],
  ["frames", "82213a228a4e5847d5704a8a068f66bdf211d093b5d7a409723ddd27aeb2c6dc"], // PS2.29: message text only, same code, same span
  // Moved once, by review round 1 (N1): the "both faces" message dropped "(it stands between two
  // rooms)", which was false for a wall free-standing inside one room. Message text only.
  // PS2.11e: the pocket door's `E_DOOR_KIND_CLAUSE` hint lists the kinds that take `swing`, now `double` too
  // (derived from DOOR_KIND_CLAUSES); the code, span and message are unchanged.
  ["refused", "0f71f9060ab451219f69b2a31f60843dc40207d5c9790e62decc6138635fd493"],
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
