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
  ["k1-west-to-east", "4ee096e9d63e9bcef64ae831c524504b740366962e488df595df034390f11181"], // PS2.29: message text only, same code, same span
  ["k1-east-to-west", "2a63ede50d839174333a28ca7fabee3525b58c19c9a5a2cc63b4c2c8efce8fa1"], // PS2.29: message text only, same code, same span
  ["loop", "08f86b22dc7c9915aa42911ecf092c1dd564983173760a42ee4010596b1d2b5c"], // PS2.29: message text only, same code, same span
  ["ring", "43c51fd0af4e4b5f44c9412106ffe1c4be8a235b73d7f9ec9b7206db8df3f1cd"],
  ["frames", "9f2431b29bb506b4a34f4e0b53e2178cf65be4e5c55244219acc7043a493e878"], // PS2.29: message text only, same code, same span
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
