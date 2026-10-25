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
  ["relational-forms", "c152bfe4c49d13825e41cab7814a57bbb63379fc7641eeb795ae3dc531b81998"],
  ["hosted-datums", "2de74be4cdc3993be2a0eba3292c1a4a564ddb3c116da83f75e53e16f35302cf"],
  ["frames", "50f91949030acfac188fb04ce7ac101864bea7b87e7e19941355cbf7d3a6c401"], // PS2.29: message text only, same code, same span
  ["widen-4000", "d1605219c6eebb1868a94cb5c433e8d4c80bcf18c28735d4904c5cda9d1c2704"],
  ["widen-4500", "7b48c85287593ab898f6b170605bdc7e43d40c8abe9c209c0886e1a5e2c3235b"],
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
