/**
 * `ERROR_CODES` order is a law of the source, not of the host: errors first, then warnings, and
 * within each group by UTF-16 code unit. It feeds `docs/error-codes.md`, `llms-full.txt` and
 * `arch manifest --json`, so an order that followed the host's collation (`localeCompare` reads
 * ICU data) could reorder a generated file between machines.
 *
 * The expected order is built here by an independent code-unit comparison (`charCodeAt`, not the
 * `<` the catalogue uses), and the control below proves the test can tell the two orders apart:
 * ICU puts `_` before letters, code units put it after `A`–`Z`.
 */
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG, ERROR_CODES } from "../src/index.js";

function codeUnitCompare(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

describe("ERROR_CODES order", () => {
  it("is every catalog code, errors then warnings, by UTF-16 code unit within each group", () => {
    const codes = Object.keys(ERROR_CATALOG);
    const group = (sev: "error" | "warning"): string[] =>
      codes.filter((c) => ERROR_CATALOG[c]!.severity === sev).sort(codeUnitCompare);
    expect([...ERROR_CODES]).toEqual([...group("error"), ...group("warning")]);
  });

  it("control: orders a pair where ICU collation and code units disagree by code unit", () => {
    const a = "E_INTENT_NOT_ADJACENT";
    const b = "E_INTENT_NO_DOOR";
    // The pair really does split the two orders, on any ICU locale: `T` (0x54) < `_` (0x5F)
    // by code unit, while collation ranks `_` below every letter.
    expect(codeUnitCompare(a, b)).toBeLessThan(0);
    for (const locale of ["en-US", "zh-CN", "de", "ja"]) expect(a.localeCompare(b, locale)).toBeGreaterThan(0);
    expect(ERROR_CODES.indexOf(a)).toBeGreaterThanOrEqual(0);
    expect(ERROR_CODES.indexOf(a)).toBeLessThan(ERROR_CODES.indexOf(b));
  });
});
