/**
 * Property-based laws over `applyFixes` (`src/fix-apply.ts`), generalising the
 * example-based cases already pinned in `test/fix-apply.test.ts` to fast-check
 * permutations/ranges:
 *
 *  - **Disjoint admissible fixes commute**: however the caller orders a set of
 *    non-overlapping suggestions, `applyFixes` sorts them by edit position before
 *    applying, so the rendered output — and which suggestions land — never depends
 *    on input array order.
 *  - **An identical duplicate suggestion is idempotent**: two suggestions with the
 *    exact same span and replacement text both count as `applied` (the second is a
 *    no-op success, per `Data.replaceRange`'s documented exception), and the output
 *    is the same as applying either one alone.
 *  - **Of two overlapping fixes, exactly one applies, deterministically**: the one
 *    whose edit starts EARLIEST always wins, regardless of which order the caller
 *    passed them in — `applyFixes` sorts by position first, array order only breaks
 *    a tie at the same start offset.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyFixes } from "../src/index.js";
import type { Applicability, FixSuggestion } from "../src/index.js";

/** Build a single-edit, machine-applicable suggestion (the `test/fix-apply.test.ts`
 *  helper, repeated here so this file has no cross-file coupling). */
const sug = (
  start: number,
  end: number,
  newText: string,
  title = "fix",
  applicability: Applicability = "machine-applicable",
): FixSuggestion => ({ title, applicability, edits: [{ span: { start, end }, newText }] });

describe("applyFixes — disjoint fixes commute", () => {
  const SLOT_WIDTH = 10;
  // Each slot is `----XXX-----` (10 chars): a 2-char gap, a 3-char replaced core, a
  // 5-char gap — so no two slots ever touch, whatever their replacement text's length.
  const replacementText = fc.string({ minLength: 0, maxLength: 6 });

  /** The ONE correct output: every slot's 3-char core replaced by its text, filler
   *  bytes untouched. Independent of `applyFixes`'s own logic, so this is a real
   *  oracle rather than the implementation checking itself. */
  function expectedOutput(base: string, texts: string[]): string {
    let out = "";
    let pos = 0;
    texts.forEach((t, i) => {
      out += base.slice(pos, i * SLOT_WIDTH + 2);
      out += t;
      pos = i * SLOT_WIDTH + 5;
    });
    return out + base.slice(pos);
  }

  it("any permutation of N disjoint suggestions yields the same, correct output", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }).chain((n) =>
          fc.tuple(
            fc.constant(n),
            fc.array(replacementText, { minLength: n, maxLength: n }),
            fc.shuffledSubarray(
              Array.from({ length: n }, (_, i) => i),
              { minLength: n, maxLength: n },
            ),
          ),
        ),
        ([n, texts, order]) => {
          const base = "-".repeat(n * SLOT_WIDTH);
          const suggestions = texts.map((t, i) => sug(i * SLOT_WIDTH + 2, i * SLOT_WIDTH + 5, t, `slot${i}`));
          const expected = expectedOutput(base, texts);

          const shuffled = order.map((i) => suggestions[i]!);
          const r = applyFixes(base, shuffled);
          expect(r.output).toBe(expected);
          expect(r.applied).toHaveLength(n);
          expect(r.skipped).toEqual([]);
          // The SET of applied suggestions is the input set, regardless of order.
          expect(new Set(r.applied)).toEqual(new Set(suggestions));
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("applyFixes — an identical duplicate is idempotent", () => {
  it("two suggestions with the same span and text both land, as one net change", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 20 }),
        fc.nat(),
        fc.nat(),
        fc.string({ minLength: 0, maxLength: 6 }),
        (source, rawStart, rawLen, newText) => {
          const start = rawStart % source.length;
          // A NON-EMPTY range — `Data.replaceRange`'s idempotent no-op case is
          // documented for the "replaced" state only; a zero-width INSERTION
          // deliberately stacks instead (`test/fix-apply.test.ts`'s own
          // "stacks two insertions… (LIFO, like rustfix)" case), so this law is
          // about a genuine replacement, not an insert.
          const end = Math.min(start + 1 + (rawLen % 5), source.length);
          const a = sug(start, end, newText, "a");
          const b = sug(start, end, newText, "b"); // same span+text, different title
          const once = applyFixes(source, [a]);
          const twice = applyFixes(source, [a, b]);
          expect(twice.output).toBe(once.output);
          expect(twice.applied).toEqual([a, b]);
          expect(twice.skipped).toEqual([]);
          // Order does not matter either — the SECOND one processed is always the no-op.
          const reversed = applyFixes(source, [b, a]);
          expect(reversed.output).toBe(once.output);
          expect(reversed.skipped).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("applyFixes — of two overlapping fixes, exactly one applies, deterministically", () => {
  const WIDTH_A = 4;
  const BASE = "x".repeat(30);

  it("the earlier-starting edit always wins, regardless of input array order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }), // startA — leaves room for A (width 4) and B past it
        fc.integer({ min: 1, max: WIDTH_A - 1 }), // where B starts INSIDE A's range — guaranteed overlap
        fc.integer({ min: 1, max: 5 }), // B's width
        fc.string({ minLength: 0, maxLength: 4 }),
        fc.string({ minLength: 0, maxLength: 4 }),
        (startA, overlapOffset, widthB, textA, textB) => {
          const endA = startA + WIDTH_A;
          const startB = startA + overlapOffset; // strictly between startA and endA
          const endB = Math.min(startB + widthB, BASE.length);

          const a = sug(startA, endA, textA, "a");
          const b = sug(startB, endB, textB, "b");

          for (const [first, second] of [
            [a, b],
            [b, a],
          ] as const) {
            const r = applyFixes(BASE, [first, second]);
            expect(r.applied).toHaveLength(1);
            expect(r.skipped).toHaveLength(1);
            // `a` starts earliest, so it always wins — whichever order it was passed in.
            expect(r.applied[0]).toBe(a);
            expect(r.skipped[0]!.suggestion).toBe(b);
            expect(r.skipped[0]!.reason).toMatch(/overlaps an earlier fix/);
            expect(r.output).toBe(applyFixes(BASE, [a]).output);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
