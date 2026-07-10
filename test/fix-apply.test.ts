import { describe, expect, it } from "vitest";
import { applyFixes } from "../src/index.js";
import { Data } from "../src/fix-apply.js";
import type { Applicability, FixSuggestion } from "../src/index.js";

/**
 * The piece-table replacer + `applyFixes` loop (ports of rustfix's `replace.rs`
 * and its filter/apply loop). Covers split correctness, atomic multi-edit
 * suggestions, overlap→skip, idempotency, applicability filtering, deterministic
 * ordering, and empty input.
 */

/** Build a single-edit suggestion. */
const sug = (
  start: number,
  end: number,
  newText: string,
  applicability: Applicability = "machine-applicable",
  title = "fix",
): FixSuggestion => ({ title, applicability, edits: [{ span: { start, end }, newText }] });

describe("Data (piece table)", () => {
  it("renders the original unchanged with no edits", () => {
    expect(new Data("foo bar baz").render()).toBe("foo bar baz");
  });

  it("replaces a middle chunk (left/replacement/right split)", () => {
    const d = new Data("foo bar baz");
    d.replaceRange(4, 7, "lol");
    expect(d.render()).toBe("foo lol baz");
  });

  it("replaces a single char without dropping the tail", () => {
    const d = new Data("let y = true;");
    d.replaceRange(4, 5, "mut y");
    expect(d.render()).toBe("let mut y = true;");
  });

  it("inserts at the beginning and the end", () => {
    const a = new Data("foo bar baz");
    a.replaceRange(0, 0, "oh no ");
    expect(a.render()).toBe("oh no foo bar baz");
    const b = new Data("foo bar baz");
    b.replaceRange(11, 11, " oh no");
    expect(b.render()).toBe("foo bar baz oh no");
  });

  it("applies two non-overlapping edits (in original coordinates)", () => {
    const d = new Data("lorem\nipsum\ndolor");
    d.replaceRange(6, 11, "lol"); // ipsum -> lol
    d.replaceRange(12, 17, "lol"); // dolor -> lol
    expect(d.render()).toBe("lorem\nlol\nlol");
  });

  it("supports adjacent edits that share a boundary", () => {
    const d = new Data("abcdef");
    d.replaceRange(0, 3, "X"); // abc -> X
    d.replaceRange(3, 6, "Y"); // def -> Y (boundary at 3 is shared, not overlapping)
    expect(d.render()).toBe("XY");
  });

  it("stacks two insertions at the same point deterministically (LIFO, like rustfix)", () => {
    // rustfix locates the covering part skipping zero-width `inserted` parts, so
    // a second insertion at the same offset lands before the first. The exact
    // order is an edge case; what matters is that it is deterministic.
    const d = new Data("foo!");
    d.replaceRange(3, 3, "bar");
    d.replaceRange(3, 3, "baz");
    expect(d.render()).toBe("foobazbar!");
  });

  it("treats an exact same-range same-text replace as an idempotent no-op", () => {
    const d = new Data("foo");
    d.replaceRange(0, 1, "b");
    d.replaceRange(0, 1, "b");
    expect(d.render()).toBe("boo");
  });

  it("throws when replacing already-replaced bytes with different text", () => {
    const d = new Data("foo bar baz");
    d.replaceRange(4, 7, "lol");
    expect(() => d.replaceRange(4, 7, "lol2")).toThrow();
    expect(() => d.replaceRange(5, 6, "x")).toThrow();
  });

  it("throws on an inverted or out-of-range span", () => {
    expect(() => new Data("foo!").replaceRange(2, 1, "bar")).toThrow();
    expect(() => new Data("foo").replaceRange(4, 8, "lol")).toThrow();
  });

  it("round-trips the empty string", () => {
    expect(new Data("").render()).toBe("");
  });
});

describe("applyFixes", () => {
  const source = "foo bar baz";

  it("returns the source untouched with no suggestions", () => {
    const r = applyFixes(source, []);
    expect(r.output).toBe(source);
    expect(r.applied).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it("applies a single machine-applicable suggestion", () => {
    const s = sug(4, 7, "lol");
    const r = applyFixes(source, [s]);
    expect(r.output).toBe("foo lol baz");
    expect(r.applied).toEqual([s]);
    expect(r.skipped).toEqual([]);
  });

  it("applies both edits of a multi-edit suggestion atomically", () => {
    const s: FixSuggestion = {
      title: "two edits",
      applicability: "machine-applicable",
      edits: [
        { span: { start: 0, end: 3 }, newText: "AAA" },
        { span: { start: 8, end: 11 }, newText: "ZZZ" },
      ],
    };
    const r = applyFixes(source, [s]);
    expect(r.output).toBe("AAA bar ZZZ");
    expect(r.applied).toEqual([s]);
  });

  it("rolls back a whole suggestion when one of its edits conflicts", () => {
    // `first` sorts earliest (edit at 0) and lands. `conflicting`'s earliest edit
    // is at 1 (so it is processed after), and that edit collides with `first`, so
    // NEITHER edit of `conflicting` lands — the far-away 4..7 edit is rolled back too.
    const first = sug(0, 3, "AAA");
    const conflicting: FixSuggestion = {
      title: "one edit collides",
      applicability: "machine-applicable",
      edits: [
        { span: { start: 4, end: 7 }, newText: "lol" }, // fine on its own
        { span: { start: 1, end: 2 }, newText: "x" }, // overlaps `first` (0..3)
      ],
    };
    const r = applyFixes(source, [first, conflicting]);
    expect(r.output).toBe("AAA bar baz"); // only `first` landed; 4..7 did NOT
    expect(r.applied).toEqual([first]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.suggestion).toBe(conflicting);
    expect(r.skipped[0]!.reason).toMatch(/overlaps an earlier fix/);
  });

  it("skips an overlapping later suggestion, keeps the earlier one", () => {
    const a = sug(4, 7, "lol");
    const b = sug(5, 6, "x"); // overlaps a
    const r = applyFixes(source, [a, b]);
    expect(r.output).toBe("foo lol baz");
    expect(r.applied).toEqual([a]);
    expect(r.skipped.map((s) => s.suggestion)).toEqual([b]);
  });

  it("treats an idempotent duplicate suggestion as applied, not skipped", () => {
    const a = sug(0, 3, "FOO");
    const b = sug(0, 3, "FOO"); // exact same range + text
    const r = applyFixes(source, [a, b]);
    expect(r.output).toBe("FOO bar baz");
    // Both admissible; the second is an idempotent no-op success (not a skip).
    expect(r.applied).toEqual([a, b]);
    expect(r.skipped).toEqual([]);
  });

  describe("applicability filtering", () => {
    it("applies only machine-applicable by default", () => {
      const m = sug(0, 3, "M", "machine-applicable");
      const maybe = sug(8, 11, "Y", "maybe-incorrect");
      const r = applyFixes(source, [m, maybe]);
      expect(r.output).toBe("M bar baz");
      expect(r.applied).toEqual([m]);
      // A filtered-out suggestion is not "skipped" (it was never a candidate).
      expect(r.skipped).toEqual([]);
    });

    it("widens to maybe-incorrect when asked", () => {
      const m = sug(0, 3, "M", "machine-applicable");
      const maybe = sug(8, 11, "Y", "maybe-incorrect");
      const r = applyFixes(source, [m, maybe], { maxApplicability: "maybe-incorrect" });
      expect(r.output).toBe("M bar Y");
      expect(r.applied).toEqual([m, maybe]);
    });

    it("never applies has-placeholders or unspecified, even when widened", () => {
      const ph = sug(0, 3, "<name>", "has-placeholders");
      const un = sug(8, 11, "Z", "unspecified");
      const wide = applyFixes(source, [ph, un], { maxApplicability: "maybe-incorrect" });
      expect(wide.output).toBe(source);
      expect(wide.applied).toEqual([]);
      // Even naming the tier explicitly must not apply it.
      const explicit = applyFixes(source, [ph], { maxApplicability: "has-placeholders" });
      expect(explicit.output).toBe(source);
      expect(explicit.applied).toEqual([]);
    });
  });

  it("is deterministic regardless of input order (sorts by earliest edit start)", () => {
    const late = sug(8, 11, "Z");
    const early = sug(0, 3, "A");
    const forward = applyFixes(source, [early, late]);
    const reversed = applyFixes(source, [late, early]);
    expect(forward.output).toBe("A bar Z");
    expect(reversed.output).toBe("A bar Z");
    // Applied order follows edit position, not input order.
    expect(forward.applied).toEqual(reversed.applied);
    expect(forward.applied).toEqual([early, late]);
  });

  it("applies fixes over a realistic multi-line source", () => {
    const src = "plan {\n  room size 0x100\n}";
    const start = src.indexOf("0x100");
    const s = sug(start, start + "0x100".length, "3000x100");
    const r = applyFixes(src, [s]);
    expect(r.output).toBe("plan {\n  room size 3000x100\n}");
  });
});
