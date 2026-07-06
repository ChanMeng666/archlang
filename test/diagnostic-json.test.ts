import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, offsetToLineCol, ERROR_CATALOG } from "../src/index.js";
import type { Diagnostic } from "../src/index.js";

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
});
