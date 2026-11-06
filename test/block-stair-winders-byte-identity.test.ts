/**
 * Winders on a block stair: the byte-identity law.
 *
 * A block stair that writes no `winders` resolves, draws, describes and lints exactly as before the
 * clause existed. The clause runs through the paths every block stair takes: the landing records
 * (resolve, `place` frames, `describe()`), the glyph's landing loop, `drawCost` and the goings
 * `W_STAIR_TOO_STEEP` and `clearances` take off the flights. `block-stair-byte-identity` excludes
 * block stairs by name, so it pins none of this; these rows do.
 *
 * Each digest is {@link allStoreysDigestWithDiagnostics} (every storey's SVG, `describe()`,
 * `lint()` and `compile().diagnostics`), **measured against `src/` at `5593484d`** (`main`
 * before the clause), that tree extracted by `git archive`, handed to this suite's own digest body
 * (`./byte-identity-digest.ts`) and to these very rows (`./block-stair-winders-law.ts`), never a
 * rebuilt working tree. The rows: `examples/turning-stair.arch`; every `BLOCK_STAIRS` fixture,
 * `dir up` and `dir down`, without and with `height 2750`; and the quarter-turn drawn in a
 * `component` and placed once `mirror x` and once `rotate 90`. None writes `winders`; none moved.
 *
 * The sweep was proved able to fail before it was trusted, on the measured tree: with
 * `stairTooSteep` planted to take no going off for a landing, the three height-authored
 * quarter-turn rows went red (the others pass the steepness check either way); with the landing
 * outline planted out of the glyph, all 23 did.
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./byte-identity-digest.js";
import { winderLawRows } from "./block-stair-winders-law.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API: CompilerApi = { compile, describe: describePlan, lint };

/** Measured at `5593484d` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["34b5b4344ca81803a4b3f94513cd947adc0749f6e7e20dbf72c918244ee4c99c", "examples/turning-stair.arch"],
  ["575e7d3daa85f52c3902fb0f3f8dbdd4abeabda0c57da5db85c1ca06046616ed", "quarter-turn dir up, no height"],
  ["3d7526e08580089cc2cb823fd203cd73020e29fa5445eb2c912ba540ee5b96ac", "quarter-turn dir up, height 2750"],
  ["2955a883162ea99165881ad2f4e433af2cf994297015db70eaccdfb81ac463b3", "quarter-turn dir down, no height"],
  ["10682e3dd8a504292de4b1186a85da56f3fba394d1d5b4031f584c7b90b31038", "quarter-turn dir down, height 2750"],
  ["78b29bb583bf62ff6acf2c25540875514ac87f6fbed656962efccc7553932835", "half-turn dir up, no height"],
  ["500c423c0a4eb9944532888488853da1a98a239a20d0b0ae6052acaec0615a58", "half-turn dir up, height 2750"],
  ["3b55d301b22b19651b95ebce2c855cf35e7a3200e58db48ec2fcc187b2282a5f", "half-turn dir down, no height"],
  ["38671a099294919ce718d5cd050159599c09acae00e3a42d683c7cac14f3ce87", "half-turn dir down, height 2750"],
  ["1d3110b5c50f507c51662a4b1eda8de38a87508b43f6ed23c6c392a45ec28a23", "in-line dir up, no height"],
  ["5112c193ebb03f7afd31eb093024bcbe65636b43e947646f2232678a9746d9ec", "in-line dir up, height 2750"],
  ["5b375dcd92516d655d3c3885a11ae256da04491151980b07a9eecba88b707957", "in-line dir down, no height"],
  ["412ca32d2d4877e321551b53c39a8413c9c99c7e0dbcde757f135525951730c8", "in-line dir down, height 2750"],
  ["713c5c9e95f73cd76fe1264d2f2323082bd55e9b7b8b87ea62a276bc1ff16ec8", "short-axis dir up, no height"],
  ["e2e7da373ac91cc7e2ab23f8cc5e406c294d976feae23e0ab3071ff4116bfbfd", "short-axis dir up, height 2750"],
  ["37b618a77aa7348ede34d496dc73996bbc4b60856ea275d5f9d4033682d94c18", "short-axis dir down, no height"],
  ["5c125fe8baec6313e8c5d6c6619a86232e18fcdb331f97413378d5e4843a51d3", "short-axis dir down, height 2750"],
  ["c92beffa14b96ac76824d3f3a3829ed42e736647e8f63dfeaf59afb3b6e27a48", "three flights dir up, no height"],
  ["2901fe8d164eb5768329da5449c868a9ec355e32425d5804d4cea768e8ae91e2", "three flights dir up, height 2750"],
  ["2a7fcb99251c127d6a90ee4460bce4386e318b30367087549fc59a75f878b336", "three flights dir down, no height"],
  ["3bf15d0d82468a249dd81b96aa7c785c7cdb31e8d5ba00ff92ae7a618997b965", "three flights dir down, height 2750"],
  ["605c207c1eddab0698461ea16913f3f07773036cc653487a5f00e99133791234", "quarter-turn placed mirror x"],
  ["4f48aa63518cbd4fe9406650db515ba434ea391a314bf092951ab421acb4b40c", "quarter-turn placed rotate 90"],
];

const ROWS = new Map(winderLawRows(ROOT));

suite("winders — the byte-identity law", () => {
  it("the table and the rows are the same set", () => {
    expect(BASELINE.map(([, name]) => name)).toEqual([...ROWS.keys()]);
  });

  it.each(BASELINE.map(([digest, name]) => [name, digest]))(
    "%s: the payload measured before the clause existed",
    (name, digest) => {
      const src = ROWS.get(name)!;
      expect(/\bwinders\b/.test(src)).toBe(false);
      expect(src).toMatch(/stair[^\n]*\{/);
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    },
  );
});
