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
  ["studio-twin", "387daf6359c933086e75c9f7aabca3f94f7741e96a0f8504cee025e261f187b8"], // fix/examples-sound: the studio's WC moved (2026-10-27)
  // Re-pinned for PS3.6: the twin is now the hand-typed twin of the rewritten two-bed (a
  // different plan); the previous twin under this compiler reproduces the previous row.
  // Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (the twin follows two-bed's bed move); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-25 (PS2.11a/b): the twin follows two-bed's window and WC moves; why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-26 (PS2.11e/PS2.46/PS2.54): the studio and two-bed twins follow their examples' stove moves; open-plan, open-width and open-instances move in hints only (the fixture statements a `W_ROOM_NO_FIXTURE` or `W_ROOM_MISSING_DEFINING` hint quotes are now held clear of a cased opening's approach and a window over a hob, so a different anchor, or a shower for a bathtub, is quoted); SVG, `describe()` and diagnostics unchanged.
  ["two-bed-twin", "a458ded62de8575a0658145659521b7bd8b0eb5359638b1afbbcfe0cbeb4d8b8"], // PS2.11e, see header
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
  ["open-plan", "b867a283a1802a6029163acc3e54d9631c7282447b84e45e4a02dbf2e72a524e"], // PS2.29: message text only, same code, same span; PS2.11e, see header
  ["open-width", "344521e8aa15d7ca129431ae065306c80c82f741826ec7f5ccf0fa6637adf77a"], // PS2.29: message text only, same code, same span (round 2: no capital mid-sentence); PS2.11e, see header
  ["open-instances", "9cc496c9a3d3d220f2757d41a02bf1803de88b1f932156f2b7f10784372b34c7"], // PS2.29: message text only, same code, same span; PS2.11e, see header
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
