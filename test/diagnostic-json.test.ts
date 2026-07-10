import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, offsetToLineCol, ERROR_CATALOG, renderErrorSvg } from "../src/index.js";
import type { Diagnostic, FixSuggestion } from "../src/index.js";

describe("diagnosticToJson", () => {
  // A zero-height room raises a catalogued, span-bearing diagnostic.
  const source = 'plan "x" { room id=r at (0,0) size 0x100 }';
  const { diagnostics } = compile(source);
  const withSpanAndFix = diagnostics.find((d) => d.span && d.code && ERROR_CATALOG[d.code]?.fix);

  it("the fixture actually produces a span- and code-bearing diagnostic", () => {
    expect(withSpanAndFix).toBeDefined();
  });

  it("resolves line/col via offsetToLineCol and carries the byte span", () => {
    const d = withSpanAndFix!;
    const json = diagnosticToJson(source, d);
    const { line, col } = offsetToLineCol(source, d.span!.start);
    expect(json.line).toBe(line);
    expect(json.col).toBe(col);
    expect(json.span).toEqual([d.span!.start, d.span!.end]);
    expect(json.code).toBe(d.code);
    expect(json.severity).toBe(d.severity);
    expect(json.message).toBe(d.message);
  });

  it("attaches the catalogued fix for the code", () => {
    const d = withSpanAndFix!;
    const json = diagnosticToJson(source, d);
    expect(json.fix).toBe(ERROR_CATALOG[d.code!]!.fix);
  });

  it("omits line/col/span when the diagnostic has no span", () => {
    const d: Diagnostic = { severity: "error", message: "whole-program problem" };
    const json = diagnosticToJson("", d);
    expect(json.line).toBeUndefined();
    expect(json.col).toBeUndefined();
    expect(json.span).toBeUndefined();
    expect(json.code).toBeUndefined();
    expect(json.fix).toBeUndefined();
    expect(json.severity).toBe("error");
    expect(json.message).toBe("whole-program problem");
  });

  it("omits fix when the code has no catalogued remediation", () => {
    // A code with no ERROR_CATALOG entry yields no `fix` (mirrors the CLI).
    const d: Diagnostic = {
      severity: "warning",
      message: "no catalog entry",
      code: "W_NOT_A_REAL_CODE",
      span: { start: 0, end: 1 },
    };
    const json = diagnosticToJson("plan", d);
    expect(json.fix).toBeUndefined();
    expect(json.line).toBe(1);
    expect(json.col).toBe(1);
  });

  it("includes hints only when present", () => {
    const withHints: Diagnostic = {
      severity: "warning",
      message: "m",
      hints: ["try this"],
    };
    expect(diagnosticToJson("", withHints).hints).toEqual(["try this"]);
    const noHints: Diagnostic = { severity: "warning", message: "m" };
    expect(diagnosticToJson("", noHints).hints).toBeUndefined();
  });

  describe("fixes projection", () => {
    const fixes: FixSuggestion[] = [
      {
        title: "give the room a width",
        applicability: "machine-applicable",
        edits: [{ span: { start: 4, end: 9 }, newText: "3000x100" }],
        fixId: "E_ROOM_SIZE",
      },
      {
        title: "with placeholders",
        applicability: "has-placeholders",
        edits: [
          { span: { start: 4, end: 9 }, newText: "<w>x100" },
          { span: { start: 12, end: 12 }, newText: ' label "?"' },
        ],
      },
    ];

    it("projects fixes (edit spans → [start,end] tuples), preserving order & fields", () => {
      const d: Diagnostic = { severity: "error", message: "m", code: "E_ROOM_SIZE", span: { start: 4, end: 9 }, fixes };
      const json = diagnosticToJson("room size 0x100", d);
      expect(json.fixes).toEqual([
        {
          title: "give the room a width",
          applicability: "machine-applicable",
          edits: [{ span: [4, 9], newText: "3000x100" }],
          fixId: "E_ROOM_SIZE",
        },
        {
          title: "with placeholders",
          applicability: "has-placeholders",
          edits: [
            { span: [4, 9], newText: "<w>x100" },
            { span: [12, 12], newText: ' label "?"' },
          ],
        },
      ]);
    });

    it("omits fixes when the diagnostic carries none", () => {
      const d: Diagnostic = { severity: "warning", message: "m" };
      expect(diagnosticToJson("", d).fixes).toBeUndefined();
      const empty: Diagnostic = { severity: "warning", message: "m", fixes: [] };
      expect(diagnosticToJson("", empty).fixes).toBeUndefined();
    });
  });

  it("a Diagnostic carrying fixes leaves the rendered SVG byte-identical (fixes are inert metadata)", () => {
    // compile()'s default SVG path never reads `diagnostics[].fixes`; the only
    // render path that takes diagnostics is the error-card backend. Prove that
    // path ignores `fixes` too: the same diagnostic with vs without `fixes`
    // renders byte-identically (mirrors the annotate additive-ness guard).
    const src = "plan bad";
    const bare: Diagnostic = { severity: "error", message: "boom", code: "E_ROOM_SIZE", span: { start: 0, end: 4 } };
    const withFixes: Diagnostic = {
      ...bare,
      fixes: [
        { title: "t", applicability: "machine-applicable", edits: [{ span: { start: 0, end: 4 }, newText: "plan" }] },
      ],
    };
    expect(renderErrorSvg(src, [withFixes])).toBe(renderErrorSvg(src, [bare]));
    // A clean compile emits no fix leakage into the SVG.
    const { svg } = compile('plan "x" { room id=r at (0,0) size 4000x3000 label "R" }', { noCache: true });
    expect(svg).not.toContain("applicability");
    expect(svg.length).toBeGreaterThan(0);
  });
});
