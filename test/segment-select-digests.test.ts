/**
 * The segment-selector digest table (plan card PS3.5): SHA-256 over SVG, `describe()`, `lint()`
 * and `compile().diagnostics` of every storey of each plan in `test/segment-select-plans.ts`,
 * pinned in its own commit after the byte-identity law held (every existing digest suite was
 * unchanged by the selectors) and after the twins in `test/segment-select.test.ts`. Measured
 * with the test's own digest body (`allStoreysDigestWithDiagnostics`). A moved row is a finding
 * to explain (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { SEGMENT_SELECT_PLANS } from "./segment-select-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["ring", "b0e71529ada672dc0f5d35b78566b86fbcb5a523cd8157b5aad1651651b15d5b"], // PS2.29: message text only, same code, same span
  ["open", "b084b3a9fe78e1ebadf676e66408ef9fae158c8cf41d6af084a6161de2b1b414"], // PS2.29: message text only, same code, same span
  ["derived", "0e9ba98a14acd1b134b0a7c40a08d4099d98b7f1be73c44dc15ee4b9bfaf289d"], // PS2.29: message text only, same code, same span
  ["frames", "ee6fa2bcd0358ac95cfd5a96626a1d5ea3127ac7156b43c7e571644d2024ccd9"], // PS2.29: message text only, same code, same span
  ["refused", "81a19f28940657c107b17ca08d7414999776c386e8a9d97a0e4450ca79c3346c"], // PS2.29: message text only, same code, same span
  ["compass-refused", "bdfa0c557e5c3653610eee94b8f9f9c1983a262b0f91b31ea86e1a7f4708e741"],
];

suite("segment selectors: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(SEGMENT_SELECT_PLANS.map((p) => p[0]));
  });
  it("the plans that select compile clean, and the refused ones raise their refusals", () => {
    const codesOf = (name: string) =>
      compile(SEGMENT_SELECT_PLANS.find((p) => p[0] === name)![1]).diagnostics.filter((d) => d.severity === "error");
    for (const name of ["ring", "open", "derived", "frames"]) expect(codesOf(name)).toEqual([]);
    expect(new Set(codesOf("refused").map((d) => d.code))).toEqual(
      new Set(["E_SEGMENT_SELECT", "E_UNKNOWN_REF", "E_ROOM_NOT_RECTANGLE"]),
    );
    expect(codesOf("compass-refused").map((d) => d.code)).toEqual(["E_DATUM_COMPASS"]);
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = SEGMENT_SELECT_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
