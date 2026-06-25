import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

/** Resolve a single-room plan and return its IR room. */
function room(body: string): { at: { x: number; y: number }; size: { w: number; h: number } } {
  const { plan } = parse(`plan "E" { ${body} }`);
  const { ir } = resolve(plan!);
  return ir.elements.find((e) => e.kind === "room") as never;
}

describe("expressions", () => {
  it("compiles the DoD example with parenthesised arithmetic in a size", () => {
    const { svg, errors } = compile(
      `plan "E" { room id=r at (0,0) size (3000) x (3000-500) label "R" }`,
      { noCache: true },
    );
    expect(errors).toEqual([]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(room(`room id=r at (0,0) size (3000) x (3000-500) label "R"`).size).toEqual({ w: 3000, h: 2500 });
  });

  it("honours operator precedence (* before +)", () => {
    expect(room(`room id=r at (2+3*4, 0) size 100x100`).at.x).toBe(14);
  });

  it("honours parentheses over precedence", () => {
    expect(room(`room id=r at ((2+3)*4, 0) size 100x100`).at.x).toBe(20);
  });

  it("supports unary minus and division", () => {
    expect(room(`room id=r at (-100, 6000/2) size 100x100`).at).toEqual({ x: -100, y: 3000 });
  });

  it("accepts the `<expr> x <expr>` size form", () => {
    expect(room(`room id=r at (0,0) size (1000+500) x (2000)`).size).toEqual({ w: 1500, h: 2000 });
  });

  it("reports division by zero and aborts rendering", () => {
    const { svg, diagnostics } = compile(`plan "E" { room id=r at (0,0) size (10/0) x 1000 }`, { noCache: true });
    expect(svg).toBe("");
    expect(diagnostics.some((d) => d.code === "E_DIV_ZERO")).toBe(true);
  });

  it("still accepts the literal WxH dimension form (back-compat)", () => {
    expect(room(`room id=r at (0,0) size 4000x3000`).size).toEqual({ w: 4000, h: 3000 });
  });
});
