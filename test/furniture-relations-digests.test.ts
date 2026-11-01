/**
 * The furniture-relation digest table (ADR 0029; card PS3.7): SHA-256 over SVG, `describe()`,
 * `lint()` and `compile().diagnostics` of every storey of each plan in
 * `test/furniture-relations-plans.ts`, pinned in its own commit after the byte-identity law held
 * (with the seat rule off, every existing digest suite was unchanged by the new forms; the rows
 * the turned chairs moved are explained in `test/byte-identity-baseline.ts`'s header) and after
 * the twins in `test/furniture-relations.test.ts`. Measured with the test's own digest body
 * (`allStoreysDigestWithDiagnostics`). A moved row is a finding to explain (`docs/testing.md`
 * §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { FURNITURE_RELATION_PLANS } from "./furniture-relations-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  // PS2.54: `lint()` gains one `W_DOORWAY_BLOCKED`, its dining table 250 mm off a door's face (300
  // from the wall's centreline, on the old datum's edge); SVG, `describe()` and diagnostics unchanged.
  // PS2.69: `lint()` gains one `W_EXIT_APPROACH_BLOCKED`, its sofa 400 mm inside the living room's
  // 900 mm exterior door over 250 mm of it (under the 914 mm clear floor); nothing else moved.
  ["relations", "dceaf3d1ab9d5673336daf87ef82a26251488d581f7a2ec07c3edc1e4c30f58b"], // `centreline_at`, see ./byte-identity-baseline.ts; `W_SWING_OBSTRUCTED`'s hints name no `<wall>` on a derived wall (#401 residue): lint text only
  ["frames", "f38055441cc4a51350efc6a36c271dd3491562ecf699a4903cc7d8cba8fad46b"], // PS2.29: message text only, same code, same span
  ["seats", "bf2afb0a1c3785c20dc7c239291f038b69ead0812807c58edd7c6c07fe7a9d3e"], // seat hint reworded (red team round 1),; `centreline_at`, see ./byte-identity-baseline.ts
  ["refused", "77a135b355d61ee48ed2f265c7dbb99da75edcb9ab381ead6c615e4cf8facd39"],
];

suite("furniture relations: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(FURNITURE_RELATION_PLANS.map((p) => p[0]));
  });
  it("the refused plan raises every refusal family", () => {
    const src = FURNITURE_RELATION_PLANS.find((p) => p[0] === "refused")![1];
    expect(new Set(compile(src).diagnostics.map((d) => d.code))).toEqual(
      new Set([
        "E_FACING_TARGET",
        "E_FACING_MISS",
        "E_FACING_TIE",
        "E_FACING_CONFLICT",
        "E_FACING_SYMMETRIC",
        "E_FACING_TRANSPOSED",
        "E_FURN_AGAINST",
        "E_FURN_CLEAR",
      ]),
    );
  });
  it("the relations plan raises both declared-clear warnings, and the seats plan the seat check", () => {
    const codesOf = (name: string) => lint(FURNITURE_RELATION_PLANS.find((p) => p[0] === name)![1]).map((d) => d.code);
    expect(codesOf("relations")).toEqual(expect.arrayContaining(["W_FURN_CLEAR_FRONT", "W_FURN_CLEAR_SIDES"]));
    expect(codesOf("seats").filter((c) => c === "W_SEAT_FACING_AWAY")).toHaveLength(1);
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = FURNITURE_RELATION_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
