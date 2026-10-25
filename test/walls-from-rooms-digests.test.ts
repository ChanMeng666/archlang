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
  ["studio-twin", "7c3d0a9f6ee8e74b88483e504f1f58175d93a000daffec10af15bd88e2ca6c45"],
  // Re-pinned for PS3.6: the twin is now the hand-typed twin of the rewritten two-bed (a
  // different plan); the previous twin under this compiler reproduces the previous row.
  // Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (the twin follows two-bed's bed move); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-25 (PS2.11a/b): the twin follows two-bed's window and WC moves; why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
  ["two-bed-twin", "a9ef20b1fd3996df5c32bf7acf2353f635baa8de6f219ca1c088b9fe62d2b6d5"],
  ["widen-4000", "05ddd3af60fa2eca554712f69b5ae50affd76de0a5dfe27029fdf70f45af7017"],
  ["widen-4500", "f3ad2d7b2f3302ff4a632976470830ac8e1bed3faffb30a3cdb0038fecac5203"],
  ["courtyard", "ec88547006b9f1783422b20c8182d0b32fe96ed723b353c94408d769fb5cf875"], // PS2.29: message text only, same code, same span
  ["void-hole", "1f69ba84fa71ee957c81ebf6e8264145700d1f2bcb9398790542f42801429ba1"], // PS2.29: message text only, same code, same span
  ["instances", "3ebe5698783bb99fc61b05816d283a059ca9c3681c41c7e9c98b997b499d2a49"], // PS2.29: message text only, same code, same span
  ["coexist", "baef034f75d85f3ae7c186fa45274f65a2d656f44844ab2136fe60c9cc76b875"], // PS2.29: message text only, same code, same span
  ["refused", "76e0b4711a8d03cafc6ce4271a2fb765a9280b9d332ffec2eeb350ef93bf67f7"], // PS2.29: message text only, same code, same span
  // Part C, the pair clauses: pinned after the twins held (`test/walls-from-rooms-clauses.test.ts`).
  // Re-pinned in red team round 1 (S1): the first pin carried a false W_OPENING_AT_JUNCTION (a
  // 25 mm "nib" beside the thinner wall at the a|c (150) / b|c (100) end); with the HEAD rule
  // restored the old digest reproduces exactly, so the rule fix is the only change.
  ["open-plan", "6bc203245a5cdf856acdcb9ec89f017ecdc6e43e1958c44a408ed88e80417b3f"], // PS2.29: message text only, same code, same span
  ["open-width", "3700865d383bf6e8261ce21e0ac21d5ffb52816e80f26712008769626e126861"], // PS2.29: message text only, same code, same span (round 2: no capital mid-sentence)
  ["open-instances", "b25b6590521baa45b9deb54583d5d6e5548609bea19544a08dbb1f90a7fbaa7b"], // PS2.29: message text only, same code, same span
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
