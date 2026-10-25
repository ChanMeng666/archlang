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
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["studio-twin", "b94caf8eba43ee2dc872cba71595102a9bdfd7f937389f3a1546091950e1fefe"],
  // Re-pinned for PS3.6: the twin is now the hand-typed twin of the rewritten two-bed (a
  // different plan); the previous twin under this compiler reproduces the previous row.
  // Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (the twin follows two-bed's bed move); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-25 (PS2.11a/b): the twin follows two-bed's window and WC moves; why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
  ["two-bed-twin", "5600c5e45c6ad8a8dc476a8e9485aca059e581fbed5651f578875e323263cbbc"],
  ["widen-4000", "caaf25e6f0f27dc2409f4d81d2434d83c7c75b62e5bcad55cd8a08d5a8dbce19"],
  ["widen-4500", "5756d730cbb5d2bb27471d50e24023b29b6826aa359bf76a4cd43b2a156afef9"],
  ["courtyard", "ddab523168af17603cb23ef2ade5be2c433e2f48992a8cdf7b6e5e7a71d00d59"], // PS2.29: message text only, same code, same span
  ["void-hole", "1f2cc21de6c54b4c5fda96e2ca562ce248ba50c65e8100dc70ca348931f2e30b"], // PS2.29: message text only, same code, same span
  ["instances", "9cee7cee0d0fcdf4a673ef1ebd3dd085bc570542fb857da1b7efd1b7c4fdfde2"], // PS2.29: message text only, same code, same span
  ["coexist", "edbb7e715c8919e1128ff4bb6376d16f3f491cceb3729ef6627c4461b1173957"], // PS2.29: message text only, same code, same span
  ["refused", "76e0b4711a8d03cafc6ce4271a2fb765a9280b9d332ffec2eeb350ef93bf67f7"], // PS2.29: message text only, same code, same span
  // Part C, the pair clauses: pinned after the twins held (`test/walls-from-rooms-clauses.test.ts`).
  // Re-pinned in red team round 1 (S1): the first pin carried a false W_OPENING_AT_JUNCTION (a
  // 25 mm "nib" beside the thinner wall at the a|c (150) / b|c (100) end); with the HEAD rule
  // restored the old digest reproduces exactly, so the rule fix is the only change.
  ["open-plan", "cf0506374e592aa8a4a37bf48a97bc50185e0cf51f155424841e27631d972c20"], // PS2.29: message text only, same code, same span
  ["open-width", "90d01573e36499e402b62a86d906617c58154934dcaca5bcce26ce3cab996824"], // PS2.29: message text only, same code, same span (round 2: no capital mid-sentence)
  ["open-instances", "5189c3f612d03340e090163e8da07716340518af795c2e6dc20f7396b6c529af"], // PS2.29: message text only, same code, same span
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
