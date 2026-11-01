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
  ["relational-forms", "d7d72933de585adc081be67bc34e06207e2f46bf6bf431d9464972ac6f3aa8bb"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["hosted-datums", "ed32136bcef7682f957e05a5c5c44aa6c731c54b56baae7c9fe9b212b832e666"],
  ["frames", "33ddec55acca93b96ea3aeeba550373cf5b467dea8242746fbb10e83c37dc65f"], // PS2.29: message text only, same code, same span; `centreline_at`, see ./byte-identity-baseline.ts
  ["widen-4000", "ac27ff053cfb837ae4fc316afc384ea897760bfa49fbedd691f0e8e81a003f31"], // `centreline_at`, see ./byte-identity-baseline.ts
  ["widen-4500", "a0ad0823865adef94aad0633cc8e5614b4d7cba015dbaaf26a1f3de2645bccfa"], // `centreline_at`, see ./byte-identity-baseline.ts
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
