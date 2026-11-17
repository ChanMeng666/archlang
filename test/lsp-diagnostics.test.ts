/** LSP diagnostics mapping. */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { lspDiagnostics, offsetToPosition, Severity } from "../editors/vscode/src/diagnostics.js";

describe("LSP diagnostics mapping", () => {
  it("maps an error diagnostic to LSP shape with a range and code", () => {
    const src = `plan "E" { room id=r at (0,0) size 0x1000 label "R" }`;
    const diags = lspDiagnostics(compile, src);
    const err = diags.find((d) => d.severity === Severity.Error);
    expect(err).toBeDefined();
    expect(err!.source).toBe("archlang");
    expect(err!.message).toMatch(/positive size/);
    expect(err!.range.start.line).toBe(0);
    expect(err!.range.end.character).toBeGreaterThan(err!.range.start.character);
  });

  it("maps a warning diagnostic with Warning severity", () => {
    const src = [
      'plan "E" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }",
      "  door id=d at (2000,2000) width 900",
      "}",
    ].join("\n");
    const diags = lspDiagnostics(compile, src);
    const warn = diags.find((d) => d.message.includes("does not lie on any wall"));
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe(Severity.Warning);
    expect(warn!.range.start.line).toBe(2); // door is on the 3rd line (0-based 2)
  });

  it("computes 0-based positions across newlines", () => {
    const text = "abc\ndef\nghi";
    expect(offsetToPosition(text, 0)).toEqual({ line: 0, character: 0 });
    expect(offsetToPosition(text, 4)).toEqual({ line: 1, character: 0 }); // 'd'
    expect(offsetToPosition(text, 9)).toEqual({ line: 2, character: 1 }); // 'h'
    expect(offsetToPosition(text, 999)).toEqual({ line: 2, character: 3 }); // clamps to end
  });

  it("maps related spans to relatedInformation in the document's uri (card AF1)", () => {
    const src = [
      'plan "D" {',
      '  room id=a at (0,0) size 3000x3000 label "A"',
      '  room id=a at (3000,0) size 3000x3000 label "B"',
      "}",
    ].join("\n");
    const uri = "file:///plans/dup.arch";
    const dup = lspDiagnostics(compile, src, uri).find((d) => d.code === "E_DUP_ID");
    expect(dup?.range.start).toEqual({ line: 2, character: 2 });
    expect(dup?.relatedInformation).toEqual([
      {
        location: { uri, range: { start: { line: 1, character: 2 }, end: { line: 1, character: 45 } } },
        message: 'id "a" first declared here',
      },
    ]);
    // Without a uri there is no location to name: the shape is what it always was.
    const bare = lspDiagnostics(compile, src).find((d) => d.code === "E_DUP_ID");
    expect(bare).toBeDefined();
    expect("relatedInformation" in bare!).toBe(false);
  });

  it("a diagnostic with no related span gains no relatedInformation key", () => {
    const src = `plan "E" { room id=r at (0,0) size 0x1000 label "R" }`;
    for (const d of lspDiagnostics(compile, src, "file:///e.arch")) expect("relatedInformation" in d).toBe(false);
  });

  it("returns no diagnostics for valid source", () => {
    const src = `plan "OK" { room id=r at (0,0) size 1000x1000 label "R" }`;
    expect(lspDiagnostics(compile, src)).toEqual([]);
  });
});
