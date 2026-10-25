import { describe, expect, it } from "vitest";
import { applyFixes, compile, lint } from "../src/index.js";
import { readDimText } from "../src/lint/rules/dims.js";

/**
 * `W_DIM_TEXT_MISMATCH` (plan-soundness PS2.10): a hand-written `dim … text "<number>"` whose
 * number is not the span its line measures. The rounding rule is read at the text's own
 * precision, decided on the 0.001 mm lattice; the boundaries below are the rule, not samples.
 */

const CODE = "W_DIM_TEXT_MISMATCH";
const plan = (body: string) =>
  `plan "P" {\n  units mm\n  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }\n  room id=r at (0,0) size 5000x4000 label "Studio"\n${body}}\n`;
const dim = (to: string, text: string) => plan(`  dim (0,-600)->(${to},-600) offset -300 text "${text}"\n`);
const mismatches = (src: string) => lint(src).filter((d) => d.code === CODE);

/** The content of the first `<text …>…</text>` element in the dimensions layer (`A-ANNO-DIMS`),
 *  found by a linear scan (no regex backtracking over the document). The plan's room label is
 *  drawn earlier, in another layer, so the scan starts at the dimensions layer: with one `dim`
 *  in the plan, its first text is that dimension's number. */
function firstText(svg: string): string | undefined {
  const layer = svg.indexOf('id="A-ANNO-DIMS"');
  if (layer < 0) return undefined;
  const open = svg.indexOf("<text", layer);
  if (open < 0) return undefined;
  const start = svg.indexOf(">", open);
  const end = svg.indexOf("</text>", start);
  return start < 0 || end < 0 ? undefined : svg.slice(start + 1, end);
}

describe("readDimText — what reads as a length", () => {
  it.each([
    ["4000", 4_000_000, 1000],
    [" 4000 ", 4_000_000, 1000],
    ["4000mm", 4_000_000, 1000],
    ["4000 mm", 4_000_000, 1000],
    ["4,000", 4_000_000, 1000],
    ["12,500.5", 12_500_500, 100],
    ["3.5m", 3_500_000, 100_000],
    ["3.5 m", 3_500_000, 100_000],
    ["4 m", 4_000_000, 1_000_000],
    ["350cm", 3_500_000, 10_000],
    ["1562.05", 1_562_050, 10],
    ["1562.005", 1_562_005, 1],
    ["0.12", 120, 10],
    ["4.000 m", 4_000_000, 1000],
    ["12.500 m", 12_500_000, 1000],
    ["1.000001 m", 1_000_001, 1],
  ])("%j is %d µm to %d µm", (text, um, step) => {
    const r = readDimText(text);
    expect(r).not.toBeNull();
    expect(r!.um).toBe(um);
    expect(r!.stepUm).toBe(step);
  });

  it.each([
    "VARIES",
    "EQ",
    "R9000",
    "φ5000",
    "~4000",
    "2300 clear",
    "2000 arc",
    "4000 min",
    "-4000",
    "+4000",
    "4000.",
    ".5 m",
    "4000  mm", // two spaces: not the unit form
    "4,00",
    "1,500 m", // a grouped number with a unit may be a decimal comma
    "0.0001", // finer than the 0.001 mm lattice
    "4.000", // a European thousands dot, or metres with no `m`: ambiguous with no unit
    "1.500",
    "12.500",
    "0.125",
    "1.0000001 m",
    "4 km",
    "",
  ])("%j is not read (exempt)", (text) => {
    expect(readDimText(text)).toBeNull();
  });

  it("re-letters in the author's unit, precision, grouping and spacing", () => {
    expect(readDimText("4500")!.fmt(4_000_000)).toBe("4000");
    expect(readDimText("3.5 m")!.fmt(4_012_000)).toBe("4.0 m");
    expect(readDimText("4,500")!.fmt(12_000_000)).toBe("12,000");
    expect(readDimText("0.50m")!.fmt(1_234_000)).toBe("1.23m");
    expect(readDimText(" 450cm")!.fmt(4_000_000)).toBe(" 400cm");
  });
});

describe("W_DIM_TEXT_MISMATCH — the rounding rule", () => {
  it("fires on the defect corpus's lying dimension, with the measured span and the written number", () => {
    const [d, ...rest] = mismatches(dim("4000", "4500"));
    expect(rest).toEqual([]);
    expect(d!.message).toBe(
      "The dimension from (0, -600) to (4000, -600) is lettered 4500, but its line spans 4000 mm: the text is 500 mm longer than what it measures.",
    );
  });

  it("a whole-mm text covers half a millimetre either side, both ends included", () => {
    expect(mismatches(dim("3999.5", "4000"))).toEqual([]);
    expect(mismatches(dim("4000.5", "4000"))).toEqual([]);
    expect(mismatches(dim("3999.499", "4000"))).toHaveLength(1);
    expect(mismatches(dim("4000.501", "4000"))).toHaveLength(1);
  });

  it("a text read at a coarser precision is that coarser rounding", () => {
    expect(mismatches(dim("3450", "3.5 m"))).toEqual([]);
    expect(mismatches(dim("3550", "3.5 m"))).toEqual([]);
    expect(mismatches(dim("3449", "3.5 m"))).toHaveLength(1);
    expect(mismatches(dim("4499", "4 m"))).toEqual([]);
    expect(mismatches(dim("4501", "4 m"))).toHaveLength(1);
  });

  it("copying what the drawing prints with no `text` never fires (the printer's own rounding)", () => {
    for (const to of ["1562.0499", "1562.05", "1000.004", "3333.333", "2999.995", "7.126"]) {
      const printed = firstText(compile(plan(`  dim (0,-600)->(${to},-600) offset -300\n`), { noCache: true }).svg);
      expect(printed, to).toBeDefined();
      expect(printed, to).toMatch(/^\d/); // the dimension's number, never a label: not vacuous
      expect(mismatches(dim(to, printed!)), `${to} printed ${printed}`).toEqual([]);
    }
  });

  it("measures the span the line draws: after `faces` pushed the endpoints onto the outer faces", () => {
    const faces = (text: string) => plan(`  dim faces (0,4000)->(5000,4000) offset 600 text "${text}"\n`);
    expect(mismatches(faces("5200"))).toEqual([]);
    expect(mismatches(faces("5000"))[0]!.message).toContain("spans 5200 mm");
  });

  it("non-numeric text is exempt, however wrong it looks", () => {
    for (const t of ["VARIES", "EQ", "2000 arc", "R9000", "~4500"]) expect(mismatches(dim("4000", t))).toEqual([]);
  });

  it("a dim with no `text` is never judged", () => {
    expect(mismatches(plan(`  dim (0,-600)->(4000,-600) offset -300\n`))).toEqual([]);
  });
});

describe("W_DIM_TEXT_MISMATCH — the fix and the hint", () => {
  it("the fix letters the measured span in the text's own form, is maybe-incorrect, and clears the warning", () => {
    const src = dim("4000", "4.5 m");
    const [d] = mismatches(src);
    expect(d!.fixes).toHaveLength(1);
    expect(d!.fixes![0]!.applicability).toBe("maybe-incorrect");
    expect(applyFixes(src, d!.fixes!).applied).toEqual([]); // `archlang fix` without --unsafe leaves it
    const out = applyFixes(src, d!.fixes!, { maxApplicability: "maybe-incorrect" }).output;
    expect(out).toContain('text "4.0 m"');
    expect(mismatches(out)).toEqual([]);
  });

  it("the message names no id; the hint does, with the clause to write", () => {
    const [d] = mismatches(dim("4000", "4500"));
    expect(d!.message).not.toMatch(/dim_\d/);
    expect(d!.hints![0]).toContain('dim "dim_1"');
    expect(d!.hints![0]).toContain('`text "4000"`');
  });

  it("an interpolated text gets the hint but no fix: a literal would cut it loose from its `let`", () => {
    const src = plan(`  let L = 4000\n  dim (0,-600)->(4000,-600) offset -300 text "{L + 500}"\n`);
    const [d] = mismatches(src);
    expect(d).toBeDefined();
    expect(d!.fixes).toBeUndefined();
  });

  it("a statement drawn at several spans gets no fix: one rewrite cannot suit them all", () => {
    const src = plan(`  for i in 1..3 {\n    dim (0,-600 * i)->(2000 * i,-600 * i) offset -300 text "2000"\n  }\n`);
    const ds = mismatches(src);
    expect(ds).toHaveLength(1); // the 4000 mm one; the 2000 mm one is right
    expect(ds[0]!.fixes).toBeUndefined();
    // One hint, and it does not quote a `text` to write: no single rewrite can be right.
    expect(ds[0]!.hints).toHaveLength(1);
    expect(ds[0]!.hints![0]).toContain("more than one dimension");
    expect(ds[0]!.hints![0]).not.toContain("`text");
  });
});

describe("W_DIM_TEXT_MISMATCH — red-team round 1", () => {
  it("a bare dot-grouped number is ambiguous and exempt; with a unit it is metres and checked", () => {
    expect(mismatches(dim("4000", "4.000"))).toEqual([]);
    expect(mismatches(dim("1500", "1.500"))).toEqual([]);
    expect(mismatches(dim("12500", "12.500"))).toEqual([]);
    expect(mismatches(dim("4000", "4.000 m"))).toEqual([]);
    expect(mismatches(dim("4000", "4.500 m"))).toHaveLength(1);
  });

  it("the message's printed numbers subtract", () => {
    const [d] = mismatches(dim("3901.05", "4000"));
    expect(d!.message).toContain("its line spans 3901.05 mm: the text is 98.95 mm longer");
    // written finer than the printer's 0.01 mm: the span is printed to the micrometre
    const [e] = mismatches(dim("1562.0026", "1562.004"));
    expect(e!.message).toContain("spans 1562.003 mm: the text is 0.001 mm longer");
  });

  it("a text in millimetres is quoted once; one in metres also gives its millimetres", () => {
    expect(mismatches(dim("4000", "5000 mm"))[0]!.message).toContain("is lettered 5000 mm, but");
    expect(mismatches(dim("4000", "5 m"))[0]!.message).toContain("is lettered 5 m, 5000 mm, but");
  });
});
