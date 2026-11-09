import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { offsetToLineCol } from "../src/diagnostics.js";

/**
 * The oracle: `offsetToLineCol` as it was before the line-start table (EH1.11) — a scan
 * from byte 0 on every call. Only `\n` ends a line; a `\r` (lone, or before `\n`) is an
 * ordinary column. The table version must return the same numbers for every source and
 * every offset, clamped, fractional and NaN included.
 */
function oracle(source: string, offset: number): { line: number; col: number } {
  const o = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let col = 1;
  for (let k = 0; k < o; k++) {
    if (source[k] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/** Sources made of the characters a line table can get wrong. */
const lineySource = fc
  .array(fc.constantFrom("a", " ", "\n", "\r", "\r\n", "\n\n", "é", "\t", "\u0000"), { maxLength: 200 })
  .map((parts) => parts.join(""));

describe("offsetToLineCol — line-start table agrees with the scan", () => {
  it("random sources (CRLF, lone CR, empty, trailing newline) and random offsets", () => {
    fc.assert(
      fc.property(
        lineySource,
        fc.array(fc.oneof(fc.integer({ min: -5, max: 260 }), fc.double({ min: -5, max: 260, noNaN: false })), {
          minLength: 1,
          maxLength: 20,
        }),
        (src, offsets) => {
          for (const o of offsets) expect(offsetToLineCol(src, o)).toEqual(oracle(src, o));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("edge sources", () => {
    for (const src of ["", "\n", "\r", "\r\n", "a\n", "a\r\n", "\n\n\n", "a\rb\nc", "x"]) {
      for (let o = -1; o <= src.length + 1; o++) expect(offsetToLineCol(src, o)).toEqual(oracle(src, o));
      for (const o of [Infinity, -Infinity, NaN, 0.5, 1.5]) expect(offsetToLineCol(src, o)).toEqual(oracle(src, o));
    }
  });

  it("10k random offsets of a 1 MB source agree with the oracle", () => {
    const rows: string[] = [];
    let n = 0;
    for (let i = 0; n < 1_000_000; i++) {
      const row = `${"r".repeat(i % 97)}${i % 5 === 0 ? "\r\n" : i % 7 === 0 ? "\r" : "\n"}`;
      rows.push(row);
      n += row.length;
    }
    const src = rows.join("");
    // The oracle is itself O(offset); compare at sorted offsets with one incremental scan.
    let seed = 12345;
    const offsets = Array.from({ length: 10_000 }, () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed % (src.length + 1);
    }).sort((a, b) => a - b);
    let k = 0;
    let line = 1;
    let col = 1;
    for (const o of offsets) {
      for (; k < o; k++) {
        if (src[k] === "\n") {
          line++;
          col = 1;
        } else col++;
      }
      expect(offsetToLineCol(src, o)).toEqual({ line, col });
    }
  });
});
