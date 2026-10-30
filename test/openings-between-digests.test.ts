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
  ["relational-forms", "5e18d3deb43482d7634f9ff0b0885e4592b37b50a20ed4a98e004297ac26bcbc"],
  ["hosted-datums", "ed32136bcef7682f957e05a5c5c44aa6c731c54b56baae7c9fe9b212b832e666"],
  ["frames", "616122bd1315cf31957276f2ebfb616adb9ee33580f44d67dad0ca8cc2ea29a5"], // PS2.29: message text only, same code, same span
  ["widen-4000", "2a88ff177ad46b12397f45d5e6ef0ea40d652c0a3dc57335699e58ff9afeae01"],
  ["widen-4500", "462b46729c778470eb1796a12c6132703d00a998355a2e5e092a59c62c5333f1"],
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
