import { describe, expect, it } from "vitest";
import { applyFixes, rankFixes } from "../src/index.js";
import type { Applicability, Diagnostic, FixEdit, FixSuggestion } from "../src/index.js";

/**
 * `rankFixes` orders the mutually-exclusive fix ALTERNATIVES on one diagnostic by
 * a deterministic cost tuple, lexicographically:
 *   1. applicability rank (machine-applicable < maybe-incorrect < placeholder/unspecified)
 *   2. total edit magnitude (Σ removed bytes + inserted chars — smallest wins)
 *   3. earliest edit start offset
 *   4. original array index (stability)
 * It is pure (returns a new array, never mutates) and the identity on singletons.
 */

const edit = (start: number, end: number, newText: string): FixEdit => ({ span: { start, end }, newText });

const sug = (title: string, edits: FixEdit[], applicability: Applicability = "machine-applicable"): FixSuggestion => ({
  title,
  applicability,
  edits,
});

const titles = (fixes: FixSuggestion[]) => rankFixes(fixes).map((f) => f.title);

describe("rankFixes", () => {
  it("is the identity on an empty array and a singleton", () => {
    expect(rankFixes([])).toEqual([]);
    const one = [sug("only", [edit(5, 5, "x")])];
    expect(rankFixes(one)).toEqual(one);
  });

  it("orders by applicability first (machine-applicable before maybe-incorrect)", () => {
    // The maybe-incorrect one has the smaller magnitude and earlier offset, yet
    // applicability dominates the tuple, so the machine-applicable one still wins.
    const fixes = [
      sug("maybe", [edit(0, 0, "a")], "maybe-incorrect"),
      sug("machine", [edit(10, 20, "aaaaaaaaaa")], "machine-applicable"),
    ];
    expect(titles(fixes)).toEqual(["machine", "maybe"]);
  });

  it("ranks placeholder/unspecified below the applicable tiers", () => {
    const fixes = [
      sug("placeholder", [edit(0, 0, "a")], "has-placeholders"),
      sug("unspecified", [edit(0, 0, "a")], "unspecified"),
      sug("maybe", [edit(50, 60, "longer edit here")], "maybe-incorrect"),
    ];
    expect(titles(fixes)[0]).toBe("maybe");
  });

  it("breaks an applicability tie by smallest total edit magnitude", () => {
    // small: removes 1, inserts 1 = 2. big: removes 4, inserts 5 = 9. Multi-edit
    // sums across edits: 2+3 = 5, still less than 9.
    const fixes = [
      sug("big", [edit(10, 14, "hello")]),
      sug("small", [edit(0, 1, "x")]),
      sug("multi", [edit(20, 21, "ab"), edit(30, 32, "c")]),
    ];
    expect(titles(fixes)).toEqual(["small", "multi", "big"]);
  });

  it("breaks an applicability+magnitude tie by earliest edit start", () => {
    // Both replace one byte with one char (magnitude 2); the earlier offset wins.
    const fixes = [sug("later", [edit(30, 31, "b")]), sug("earlier", [edit(5, 6, "a")])];
    expect(titles(fixes)).toEqual(["earlier", "later"]);
  });

  it("uses the earliest edit within a suggestion for the offset term", () => {
    // Equal magnitude (both total 4) so the offset term decides; `starts-early`'s
    // earliest edit is at offset 3, beating `starts-late`'s edit at 40.
    const fixes = [
      sug("starts-late", [edit(40, 42, "bb")]),
      sug("starts-early", [edit(3, 4, "a"), edit(100, 101, "z")]),
    ];
    expect(titles(fixes)).toEqual(["starts-early", "starts-late"]);
  });

  it("falls back to original array index for a full tie (stable)", () => {
    const a = sug("first", [edit(10, 11, "x")]);
    const b = sug("second", [edit(10, 11, "y")]);
    const c = sug("third", [edit(10, 11, "z")]);
    expect(titles([a, b, c])).toEqual(["first", "second", "third"]);
  });

  it("is pure — it does not mutate its input array or reorder it in place", () => {
    const input = [sug("big", [edit(10, 14, "hello")]), sug("small", [edit(0, 1, "x")])];
    const before = [...input];
    const out = rankFixes(input);
    expect(input).toEqual(before); // input untouched
    expect(input[0]!.title).toBe("big"); // order preserved
    expect(out).not.toBe(input); // new array
    expect(out.map((f) => f.title)).toEqual(["small", "big"]);
  });

  it("is deterministic across repeated calls", () => {
    const fixes = [sug("m", [edit(5, 6, "aa")]), sug("n", [edit(5, 6, "a")]), sug("o", [edit(2, 3, "a")])];
    expect(titles(fixes)).toEqual(titles(fixes));
  });
});

describe("cmdFix pick-one reduction (rankFixes + applyFixes)", () => {
  // `cmdFix` now collects, per diagnostic, only `rankFixes(d.fixes)[0]` — the single
  // top-ranked alternative — before handing the batch to applyFixes. This is the
  // exact composition, exercised on a synthetic diagnostic carrying two
  // mutually-exclusive, OVERLAPPING alternatives (no producer emits two today, so a
  // synthetic is required; we do not add a producer).
  const source = "door at (2500,9000)";
  //              0123456789...
  const collect = (diags: Diagnostic[]): FixSuggestion[] =>
    diags.flatMap((d) => {
      const [chosen] = rankFixes(d.fixes ?? []);
      return chosen ? [chosen] : [];
    });

  it("takes only the top-ranked (smallest-change) alternative per diagnostic", () => {
    const small = sug("zero the y", [edit(14, 18, "0")]); // replace "9000" → "0" (magnitude 5)
    const big = sug("re-attach", [edit(8, 19, "on w1 at 50%")]); // replace "(2500,9000)" (magnitude 23)
    // Give the bigger-change alternative first, to prove ordering (not array position) picks it.
    const collected = collect([{ severity: "warning", message: "off wall", fixes: [big, small] }]);
    expect(collected).toHaveLength(1);
    expect(collected[0]!.title).toBe("zero the y");

    const report = applyFixes(source, collected);
    expect(report.output).toBe("door at (2500,0)");
    expect(report.applied).toHaveLength(1);
    expect(report.skipped).toHaveLength(0); // the losing alternative is never handed to the applier
  });

  it("is byte-identical to the flat pass on a singleton diagnostic", () => {
    const only = sug("zero the y", [edit(14, 18, "0")]);
    const diag: Diagnostic = { severity: "warning", message: "off wall", fixes: [only] };
    // Flat (old) collection vs. the new pick-one collection coincide on a singleton.
    const flat = (diag.fixes ?? []).slice();
    expect(applyFixes(source, collect([diag])).output).toBe(applyFixes(source, flat).output);
  });
});
