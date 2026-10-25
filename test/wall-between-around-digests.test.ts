/**
 * The pairwise-wall digest table (ADR 0028 §4; card PS3.3): SHA-256 over SVG, `describe()`,
 * `lint()` and `compile().diagnostics` of every storey of each plan in
 * `test/wall-between-around-plans.ts`, pinned in its own commit after the byte-identity law
 * held (every existing digest suite unchanged, no re-pin; a corpus sweep against `main` moved
 * only the new language-reference fence; the twins in `test/wall-between-around.test.ts`).
 * Measured with the test's own digest body (`allStoreysDigestWithDiagnostics`). A moved row is
 * a finding to explain (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { WALL_BETWEEN_AROUND_PLANS } from "./wall-between-around-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["pairwise-forms", "9eff26529b93242795c157099ea55b8cb92c8cb5c10d59b87ec9a5ddae370676"],
  ["beside-walls-from-rooms", "51b72edae29692d3e738bc9802c035554e61753af36d4ad506f1bd7a4649b9c3"],
  ["frames", "0f78e971555db8277a7593507dbb915cc699267cfaaeb68f274b1cf225e06dae"],
  ["widen-4000", "86d18ac0da3a35cc67206619c7b9faf9224ba837caa9283af98404861bf3164c"],
  ["widen-4500", "9cef908d29584b917eb605f312962d98e0a957108ab9143e3d45601e1df18fdb"],
  ["refused", "7e18b4bff41d18b98b0f0457e0f0488a8ce0bb34792e7194d8144c42e88dc901"], // PS2.29: message text only, same code, same span
];

suite("pairwise walls: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(WALL_BETWEEN_AROUND_PLANS.map((p) => p[0]));
  });
  it("every plan but the refused one compiles clean of errors", () => {
    for (const [name, src] of WALL_BETWEEN_AROUND_PLANS) {
      if (name === "refused") continue;
      expect(
        compile(src).diagnostics.filter((d) => d.severity === "error"),
        name,
      ).toEqual([]);
    }
  });
  it("the refused plan raises every refusal family", () => {
    const src = WALL_BETWEEN_AROUND_PLANS.find((p) => p[0] === "refused")![1];
    expect(new Set(compile(src).diagnostics.map((d) => d.code))).toEqual(
      new Set([
        "E_ROOMS_OVERLAP",
        "E_WALL_BETWEEN_NOT_ADJACENT",
        "E_ROOM_NOT_RECTANGLE",
        "E_PARTITION_TOO_SHORT",
        "E_ROOMS_NOT_TILING",
        "E_UNKNOWN_REF",
        "E_WALL_BETWEEN_OPEN",
        // the overlapping room is also a plan-wide warning
        "W_ROOM_OVERLAP",
      ]),
    );
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = WALL_BETWEEN_AROUND_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
