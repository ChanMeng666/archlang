/**
 * The `walls from rooms` digest table (ADR 0028 §3; card PS3.0 part B): SHA-256 over SVG,
 * `describe()`, `lint()` and `compile().diagnostics` of every storey of each plan in
 * `test/walls-from-rooms-plans.ts`, pinned in its own commit after the byte-identity law held
 * (every existing digest suite unchanged, the twins byte-identical in SVG and lint,
 * `test/walls-from-rooms.test.ts`). Measured with the test's own digest body
 * (`allStoreysDigestWithDiagnostics`). A moved row is a finding to explain
 * (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { WALLS_FROM_ROOMS_PLANS } from "./walls-from-rooms-plans.js";

const API: CompilerApi = { compile, describe, lint };

const DIGESTS: [string, string][] = [
  ["studio-twin", "25ad0dd4d393d4c72288a9ff004ff8aaef8e750e376f1da53136237322bba1d5"],
  // Re-pinned for PS3.6: the twin is now the hand-typed twin of the rewritten two-bed (a
  // different plan); the previous twin under this compiler reproduces the previous row.
  // Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (the twin follows two-bed's bed move); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-25 (PS2.11a/b): the twin follows two-bed's window and WC moves; why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
  ["two-bed-twin", "4fbad9ce863e4e2aca346556a7a728e2471670dcaf107dbda3568687335fa31e"],
  ["widen-4000", "8f10a20c86ffc919a72b6bb7912c7fffea0f953f46777d3f84a598582c67209e"],
  ["widen-4500", "c50d7c02d2f34d92da146950a02856fa53648b2d961314cc29db95d97e78012d"],
  ["courtyard", "a275e4579cbce8f519beb0685c4418badeab0565cd00530deda8cfa3d553108b"], // PS2.29: message text only, same code, same span
  ["void-hole", "ead0619b314fa4909cac8a1a06e519817198747f0ce366e11dc0c0b538d8383d"], // PS2.29: message text only, same code, same span
  ["instances", "94e172415611d6b589f37957bcced3265c6c2473e98e5aeba34105421e15eaaa"], // PS2.29: message text only, same code, same span
  ["coexist", "fba1b7b96368559795065ca930ab8f266e7a01eca2177ffb5a745780cad2b5fd"], // PS2.29: message text only, same code, same span
  ["refused", "76e0b4711a8d03cafc6ce4271a2fb765a9280b9d332ffec2eeb350ef93bf67f7"], // PS2.29: message text only, same code, same span
  // Part C, the pair clauses: pinned after the twins held (`test/walls-from-rooms-clauses.test.ts`).
  // Re-pinned in red team round 1 (S1): the first pin carried a false W_OPENING_AT_JUNCTION (a
  // 25 mm "nib" beside the thinner wall at the a|c (150) / b|c (100) end); with the HEAD rule
  // restored the old digest reproduces exactly, so the rule fix is the only change.
  ["open-plan", "6ebb5e7d9f7fb571d15dcd3c3382b3696bdd18250ec3f2239158b1220fe16486"], // PS2.29: message text only, same code, same span
  ["open-width", "4166f94b1b0c64b89d1bdc708ae976de66eaf8064a2ac574be412772bc564530"], // PS2.29: message text only, same code, same span
  ["open-instances", "73c5ad30e5247ae54f50bed598c3bc02b2fec4f6c97edd98e92b19ea97db3d19"], // PS2.29: message text only, same code, same span
  ["clauses-refused", "2ee033192ebca84b6e8d593937ed348915530b2805b38f8d339ad7a5a6d6fe02"],
];

suite("walls from rooms: digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(WALLS_FROM_ROOMS_PLANS.map((p) => p[0]));
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const src = WALLS_FROM_ROOMS_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
