/**
 * The relational-opening digest table (ADR 0028 §5; card PS3.4): SHA-256 over SVG,
 * `describe()`, `lint()` and `compile().diagnostics` of every storey of each plan in
 * `test/openings-between-plans.ts`, pinned in its own commit after the byte-identity law held
 * (every existing digest suite unchanged, no re-pin; a corpus sweep against `main` moved only
 * the new language-reference fence; the twins in `test/openings-between.test.ts`). Measured
 * with the test's own digest body (`allStoreysDigestWithDiagnostics`). A moved row is a
 * finding to explain (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { OPENINGS_BETWEEN_PLANS } from "./openings-between-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["relational-forms", "b815544822879c4284cb3fe38a18f74d3d0235b8d7624a79ceabbf855ad2f6a3"],
  ["hosted-datums", "669e093403a8a1693c59b73956f8ee48351d6ea00113e811a57ac12c0e49f9c5"],
  ["frames", "63b1fcde09d4ae2333c8572f86c4347b46f3d69e89081619d2a19d039e29e900"], // PS2.29: message text only, same code, same span
  ["widen-4000", "ddbed23ee91d2ab3ebe2e5f054ebef98b5c7bbf041a1d30b664da797d3ddaec3"],
  ["widen-4500", "e10c23d1ec1b88edff514314378739732c5bf1e5df58ae32c5f7ac418427391c"],
  ["refused", "8f8d8a2ccb3150bb6998eda99ae95acc80f577e04744e17992f2507f6324d7d2"],
];

suite("relational openings: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(OPENINGS_BETWEEN_PLANS.map((p) => p[0]));
  });
  it("the refused plan raises every refusal family", () => {
    const src = OPENINGS_BETWEEN_PLANS.find((p) => p[0] === "refused")![1];
    expect(new Set(compile(src).diagnostics.map((d) => d.code))).toEqual(
      new Set([
        "E_WALL_BETWEEN_OPEN",
        "E_WALL_BETWEEN_NOT_ADJACENT",
        "E_OPENING_HOST_AMBIGUOUS",
        "E_OPENING_DATUM",
        "E_OPENING_NIB",
        "E_OPENING_NO_SHARED_WALL",
      ]),
    );
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = OPENINGS_BETWEEN_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
