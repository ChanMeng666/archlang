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
  ["relations", "cc6bf8f4abf362e91e93f4248a7360757b37f992ea5dda5057493090ce069e79"],
  ["frames", "22e88b1f19c01260d0eb3f93de78d9f19d5fdfeed111ce8118b57a89129c08ca"], // PS2.29: message text only, same code, same span
  ["seats", "fd9634cca453d3bf8c3bcb9f616b368a90827cdad1e34482d7bf3b656342da6a"], // seat hint reworded (red team round 1),
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
