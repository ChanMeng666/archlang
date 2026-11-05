import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, lint } from "archlang";
import { buildReviewSheet, reviewSheetAndWarnings } from "../../src/cli/review.js";
import { CHECKS_SAMPLE, SAMPLE_GROUP, SAMPLES, sampleLabelFor, sampleSource } from "../src/samples.js";

const sample = sampleSource(CHECKS_SAMPLE)!;
/** The one line its finding asks for. */
const FIX_LINE = "  window on r_bed.top width 1200\n";
const fixed = sample.replace("  window on r_live.top width 1800\n", `  window on r_live.top width 1800\n${FIX_LINE}`);

describe("the playground-only samples", () => {
  it("are not shipped examples, and no example shares a label or a source with them", () => {
    expect(SAMPLE_GROUP).toBe("Try Checks");
    const rows = readFileSync(new URL("../src/examples.ts", import.meta.url), "utf8");
    const examples = new URL("../../examples/", import.meta.url);
    const sources = readdirSync(examples)
      .filter((f) => f.endsWith(".arch"))
      .map((f) => readFileSync(new URL(f, examples), "utf8").replace(/\r\n?/g, "\n"));
    for (const s of SAMPLES) {
      expect(rows, s.label).not.toContain(`"${s.label}"`);
      expect(sources, s.label).not.toContain(s.source);
      expect(sampleLabelFor(s.source.replace(/\n/g, "\r\n"))).toBe(s.label);
    }
    expect(sampleLabelFor(fixed)).toBeUndefined();
  });

  it(`"${CHECKS_SAMPLE}" compiles and raises exactly one advisory finding, with a fix hint`, () => {
    expect(compile(sample, { noCache: true }).errors).toEqual([]);
    const r = reviewSheetAndWarnings(sample);
    if ("kind" in r) throw new Error(r.kind);
    expect(r.sheet.marks.map((m) => m.code)).toEqual(["W_BEDROOM_NO_WINDOW"]);
    expect(r.sheet.marks[0]!.ringed.map((x) => x.id)).toEqual(["r_bed"]);
    const j = diagnosticToJson(sample, r.warnings[0]!);
    expect(j.severity).toBe("warning");
    expect(j.hints?.[0] ?? j.fix).toMatch(/window/);
    // The one finding is lint()'s, under its default rules.
    expect(lint(sample).map((d) => d.code)).toEqual(["W_BEDROOM_NO_WINDOW"]);
  });

  it("the window it asks for clears it", () => {
    const r = reviewSheetAndWarnings(fixed);
    if ("kind" in r) throw new Error(r.kind);
    expect(r.sheet.marks).toEqual([]);
    expect(lint(fixed)).toEqual([]);
  });

  it("pairs each review mark with the warning it was made from", () => {
    const r = reviewSheetAndWarnings(sample);
    if ("kind" in r) throw new Error(r.kind);
    expect(r.warnings).toHaveLength(r.sheet.marks.length);
    for (const [i, m] of r.sheet.marks.entries()) {
      expect(r.warnings[i]!.code).toBe(m.code);
      expect(r.warnings[i]!.message).toBe(m.message);
    }
    // `arch preview --review`'s function is this one's sheet, unchanged.
    expect(buildReviewSheet(sample)).toEqual(r.sheet);
  });
});
