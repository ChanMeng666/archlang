import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { asNum, asStr, evalExpr, parseExpr, typeName, type Env, type ExprTokens, type Value } from "../src/expr.js";
import { lex } from "../src/lexer.js";
import type { Diagnostic } from "../src/diagnostics.js";

/** Build an ExprTokens stream over a source fragment (for grammar unit tests). */
function tokens(src: string): ExprTokens {
  const { tokens: toks } = lex(src);
  let pos = 0;
  const at = (o = 0) => toks[Math.min(pos + o, toks.length - 1)];
  return {
    peek: (o = 0) => at(o),
    next: () => toks[Math.min(pos++, toks.length - 1)],
    fail: (msg) => {
      throw new Error(msg);
    },
  };
}

/** Parse + evaluate an expression fragment, returning its Value and diagnostics. */
function ev(src: string, env: Env = new Map()): { value: Value; diags: Diagnostic[] } {
  const e = parseExpr(tokens(src));
  const diags: Diagnostic[] = [];
  const value = evalExpr(e, env, (d) => diags.push(d));
  return { value, diags };
}

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

describe("expression grammar (T2.2)", () => {
  it("boolean literals", () => {
    expect(ev("true").value).toEqual({ t: "bool", v: true });
    expect(ev("false").value).toEqual({ t: "bool", v: false });
  });

  it("comparison operators yield booleans", () => {
    expect(ev("3 < 5").value).toEqual({ t: "bool", v: true });
    expect(ev("5 <= 5").value).toEqual({ t: "bool", v: true });
    expect(ev("3 > 5").value).toEqual({ t: "bool", v: false });
    expect(ev("6 >= 7").value).toEqual({ t: "bool", v: false });
  });

  it("equality works within and across types", () => {
    expect(ev("2 == 2").value).toEqual({ t: "bool", v: true });
    expect(ev("2 != 3").value).toEqual({ t: "bool", v: true });
    expect(ev('"a" == "a"').value).toEqual({ t: "bool", v: true });
    expect(ev("1 == true").value).toEqual({ t: "bool", v: false }); // cross-type
    expect(ev("[1,2] == [1,2]").value).toEqual({ t: "bool", v: true }); // deep
  });

  it("logical operators short-circuit (no spurious errors)", () => {
    expect(ev("true && false").value).toEqual({ t: "bool", v: false });
    expect(ev("false || true").value).toEqual({ t: "bool", v: true });
    const r = ev("false && unknown"); // RHS never evaluated
    expect(r.value).toEqual({ t: "bool", v: false });
    expect(r.diags).toEqual([]);
  });

  it("honours precedence: arithmetic > comparison > && > ||", () => {
    expect(ev("2 + 3 * 4").value).toEqual({ t: "num", v: 14 });
    expect(ev("1 + 2 < 4").value).toEqual({ t: "bool", v: true }); // (1+2) < 4
    expect(ev("true || false && false").value).toEqual({ t: "bool", v: true }); // || lowest
    expect(ev("!(1 == 2)").value).toEqual({ t: "bool", v: true });
  });

  it("array literals", () => {
    expect(ev("[10, 20, 30]").value).toEqual({ t: "arr", v: [
      { t: "num", v: 10 }, { t: "num", v: 20 }, { t: "num", v: 30 },
    ] });
  });

  it("ranges are half-open integer arrays", () => {
    expect(ev("0..3").value).toEqual({ t: "arr", v: [
      { t: "num", v: 0 }, { t: "num", v: 1 }, { t: "num", v: 2 },
    ] });
    expect(ev("3..0").value).toEqual({ t: "arr", v: [] });
  });

  it("indexing, with bounds checking", () => {
    expect(ev("[10,20,30][1]").value).toEqual({ t: "num", v: 20 });
    const oob = ev("[1,2][5]");
    expect(oob.value).toEqual({ t: "num", v: 0 });
    expect(oob.diags.some((d) => d.code === "E_INDEX")).toBe(true);
  });

  it("if-else as an expression", () => {
    expect(ev("if 3 > 2 { 100 } else { 200 }").value).toEqual({ t: "num", v: 100 });
    expect(ev("if false { 1 } else { 2 }").value).toEqual({ t: "num", v: 2 });
  });

  it("string interpolation templates", () => {
    expect(ev('"plain"').value).toEqual({ t: "str", v: "plain" });
    expect(ev('"Bed {n}"', new Map([["n", { t: "num", v: 3 }]])).value).toEqual({ t: "str", v: "Bed 3" });
    expect(ev('"sum {a + b}"', new Map([["a", { t: "num", v: 2 }], ["b", { t: "num", v: 5 }]])).value).toEqual({ t: "str", v: "sum 7" });
    expect(ev('"x \\{ y"').value).toEqual({ t: "str", v: "x { y" }); // escaped brace
  });

  it("type mismatch in arithmetic is a diagnostic, not a throw", () => {
    const r = ev('"a" + 1');
    expect(r.value).toEqual({ t: "num", v: 1 }); // string coerces to 0
    expect(r.diags.some((d) => d.code === "E_TYPE")).toBe(true);
  });

  it("the new grammar flows through resolve into coordinates", () => {
    const r = room(`room id=r at (if 1 < 2 { 600 } else { 0 }, [0, 300, 600][2]) size 100x100`);
    expect(r.at).toEqual({ x: 600, y: 600 });
  });
});
