import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compile } from "../src/index.js";

/**
 * Property-based guards (golden rule: compile() never throws on user source
 * and stays deterministic — see AGENTS.md's invariants).
 */
describe("compile — fuzz properties", () => {
  it("never throws and always returns a well-formed result on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = compile(s, { noCache: true });
        expect(typeof r.svg).toBe("string");
        expect(Array.isArray(r.diagnostics)).toBe(true);
        expect(Array.isArray(r.errors)).toBe(true);
        expect(Array.isArray(r.warnings)).toBe(true);
        // svg is non-empty only when there are no error-severity diagnostics.
        const hasError = r.diagnostics.some((d) => d.severity === "error");
        if (hasError) expect(r.svg).toBe("");
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic for arbitrary plan-wrapped bodies", () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const src = `plan "F" { ${body} }`;
        expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
      }),
      { numRuns: 300 },
    );
  });
});
