/**
 * The line breaker a room name wraps with (`src/text-layout.ts`): where it may break, how many
 * lines it takes, and which of the equal-count breaks it picks. Widths are the shared estimate
 * (`textWidth`), so every case below is stated in characters, at font size 1, through {@link chars}
 * — the very product `textWidth` computes, so a width of n characters is n characters exactly.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EM_PER_CHAR } from "../src/text-metrics.js";
import { balancedLines, breakUnits, fewestLines, textExtent, textLines } from "../src/text-layout.js";
import type { ScenePrim } from "../src/scene.js";

/** The drawn width of `n` characters at font size 1. */
const chars = (n: number): number => n * 1 * EM_PER_CHAR;
const units = (name: string): string[] => breakUnits(name).map((u) => name.slice(u.start, u.end));

describe("breakUnits — where a name may break", () => {
  it("breaks only at spaces, never inside a word", () => {
    expect(units("Accessible WC")).toEqual(["Accessible", "WC"]);
    expect(units("Bedroom 3")).toEqual(["Bedroom", "3"]);
    expect(units("U-A")).toEqual(["U-A"]);
    expect(units("Kitchen/Dining")).toEqual(["Kitchen/Dining"]);
    expect(units("厨房")).toEqual(["厨房"]);
  });

  it("keeps a spaced slash on the line of the word before it", () => {
    expect(units("Living / Kitchen")).toEqual(["Living /", "Kitchen"]);
    expect(units("Kitchen / Living / Dining")).toEqual(["Kitchen /", "Living /", "Dining"]);
    // Any word with no letter or digit is a separator, glued the same way.
    expect(units("Bed & Breakfast")).toEqual(["Bed &", "Breakfast"]);
    // A leading one has no word before it, so it goes with the word after.
    expect(units("/ Store")).toEqual(["/ Store"]);
    expect(units("/ /")).toEqual(["/ /"]);
  });

  it("a break is a run of spaces; only U+0020 counts", () => {
    expect(units("  Wet   Room  ")).toEqual(["Wet", "Room"]);
    expect(units("Wet Room")).toEqual(["Wet Room"]);
    expect(units("Wet\tRoom")).toEqual(["Wet\tRoom"]);
    expect(units("")).toEqual([]);
  });
});

describe("fewestLines / balancedLines — how it breaks", () => {
  it("takes the fewest lines the width allows", () => {
    // "Sleeping Alcove" is 15 wide: one line at 15, two below that, never three.
    expect(fewestLines("Sleeping Alcove", 1, chars(15))).toBe(1);
    expect(fewestLines("Sleeping Alcove", 1, chars(14))).toBe(2);
    expect(fewestLines("Sleeping Alcove", 1, chars(8))).toBe(2);
    expect(fewestLines("a b c d e f", 1, chars(3))).toBe(3);
    // A word wider than the width takes a line of its own; the caller's fit test says no.
    expect(fewestLines("Accessible WC", 1, chars(9))).toBe(2);
  });

  it("among breaks with the same line count, the most balanced", () => {
    // Filling greedily at the room's width would give "a b c d e" / "f"; balanced gives the
    // shorter longest line.
    expect(balancedLines("a b c d e f", 2)).toEqual(["a b c", "d e f"]);
    expect(balancedLines("one two three four five six", 2)).toEqual(["one two three", "four five six"]);
    expect(balancedLines("one two three four five six", 3)).toEqual(["one two", "three four", "five six"]);
  });

  it("on a tie, the earlier lines are the fuller ones", () => {
    expect(balancedLines("Accessible WC", 2)).toEqual(["Accessible", "WC"]);
    // "aa b" / "cc" and "aa" / "b cc" both have a longest line of 4: the top one is fuller.
    expect(balancedLines("aa b cc", 2)).toEqual(["aa b", "cc"]);
    expect(balancedLines("Main Entrance Hall", 2)).toEqual(["Main Entrance", "Hall"]);
  });

  it("keeps the separator attached and the name's own spacing inside a line", () => {
    expect(balancedLines("Living / Kitchen", 2)).toEqual(["Living /", "Kitchen"]);
    expect(balancedLines("Kitchen / Living", 2)).toEqual(["Kitchen /", "Living"]);
    expect(balancedLines("a  b cccc", 2)).toEqual(["a  b", "cccc"]);
  });

  it("cannot make more lines than there are units", () => {
    expect(balancedLines("Hall", 2)).toBeNull();
    expect(balancedLines("Living / Kitchen", 3)).toBeNull();
    expect(balancedLines("Wet Room", 2)).toEqual(["Wet", "Room"]);
  });

  it("property: exactly n lines, every unit once in order, longest line minimal", () => {
    const word = fc.stringMatching(/^[a-z]{1,6}$/);
    fc.assert(
      fc.property(fc.array(word, { minLength: 1, maxLength: 9 }), fc.integer({ min: 1, max: 9 }), (words, n) => {
        const name = words.join(" ");
        const lines = balancedLines(name, n);
        if (n > words.length) {
          expect(lines).toBeNull();
          return;
        }
        expect(lines).toHaveLength(n);
        expect(lines!.join(" ")).toBe(name);
        // Brute force over every way to cut the words into n non-empty lines.
        let best = Infinity;
        const cut = (from: number, left: number, widest: number): void => {
          if (left === 1) {
            best = Math.min(best, Math.max(widest, words.slice(from).join(" ").length));
            return;
          }
          for (let e = from + 1; e <= words.length - left + 1; e++)
            cut(e, left - 1, Math.max(widest, words.slice(from, e).join(" ").length));
        };
        cut(0, n, 0);
        expect(Math.max(...lines!.map((l) => l.length))).toBe(best);
        // …and the fewest lines a width allows is what greedy filling at that width gives.
        expect(fewestLines(name, 1, chars(best))).toBeLessThanOrEqual(n);
      }),
      { numRuns: 400 },
    );
  });
});

describe("textLines / textExtent — where each line is drawn", () => {
  const text = (block?: { lines: string[]; pitch: number }): Extract<ScenePrim, { t: "text" }> => ({
    t: "text",
    at: { x: 100, y: 200 },
    value: "Accessible WC",
    size: 10,
    anchor: "middle",
    baseline: "central",
    ...(block ? { block } : {}),
  });

  it("a one-line text is itself", () => {
    expect(textLines(text())).toEqual([{ value: "Accessible WC", at: { x: 100, y: 200 } }]);
    expect(textExtent(text())).toEqual({ w: 13 * 10 * EM_PER_CHAR, h: 10 });
  });

  it("a block's lines are a pitch apart and centred on `at`", () => {
    expect(textLines(text({ lines: ["Accessible", "WC"], pitch: 12 }))).toEqual([
      { value: "Accessible", at: { x: 100, y: 194 } },
      { value: "WC", at: { x: 100, y: 206 } },
    ]);
    expect(textLines(text({ lines: ["a", "b", "c"], pitch: 12 })).map((l) => l.at.y)).toEqual([188, 200, 212]);
    expect(textExtent(text({ lines: ["Accessible", "WC"], pitch: 12 }))).toEqual({ w: 10 * 10 * EM_PER_CHAR, h: 22 });
  });
});
