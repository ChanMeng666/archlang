import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { asNum, asStr, evalExpr, typeName, type Env, type Value } from "../src/expr.js";
import type { Diagnostic } from "../src/diagnostics.js";

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

describe("Value coercions (errors-as-data, never thrown)", () => {
  const collect = () => {
    const diags: Diagnostic[] = [];
    return { diags, onError: (d: Diagnostic) => diags.push(d) };
  };

  it("asNum diagnoses a non-number and yields a safe default", () => {
    const { diags, onError } = collect();
    const n = asNum({ t: "str", v: "x" }, onError);
    expect(n).toBe(0);
    expect(diags[0]?.code).toBe("E_TYPE");
    expect(diags[0]?.message).toContain("number");
  });

  it("evalExpr reports a type mismatch using a string binding in arithmetic", () => {
    const env: Env = new Map<string, Value>([["s", { t: "str", v: "hi" }]]);
    const { diags, onError } = collect();
    // s + 1 — string used where a number is needed.
    const out = evalExpr({ t: "bin", op: "+", l: { t: "ref", name: "s" }, r: { t: "num", value: 1 } }, env, onError);
    expect(out).toEqual({ t: "num", v: 1 }); // string coerces to 0, 0 + 1 = 1
    expect(diags.some((d) => d.code === "E_TYPE")).toBe(true);
  });

  it("asStr stringifies every Value deterministically", () => {
    expect(asStr({ t: "num", v: 12.5 })).toBe("12.5");
    expect(asStr({ t: "num", v: 3 })).toBe("3");
    expect(asStr({ t: "bool", v: true })).toBe("true");
    expect(asStr({ t: "str", v: "Bed" })).toBe("Bed");
    expect(asStr({ t: "arr", v: [{ t: "num", v: 1 }, { t: "str", v: "a" }] })).toBe("[1, a]");
  });

  it("typeName names each Value kind", () => {
    expect(typeName({ t: "num", v: 0 })).toBe("number");
    expect(typeName({ t: "bool", v: false })).toBe("boolean");
    expect(typeName({ t: "str", v: "" })).toBe("string");
    expect(typeName({ t: "arr", v: [] })).toBe("array");
  });
});
