/**
 * The number domain is closed and nesting is bounded: no non-finite value and no deep
 * nesting can make `compile()` / `describe()` / `lint()` throw. Every case here used to be a
 * `RangeError` / `TypeError` out of the compiler (or a silent `0`); each now yields exactly
 * one catalogued diagnostic.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { MAX_NEST_DEPTH } from "../src/expr.js";
import { fmt2, fmt3, fmt4 } from "../src/num-format.js";

const wrap = (body: string): string => `plan "p" {\n${body}\n}\n`;
const ROOM = "room id=r at (0,0) size 900x900";
const BIG = "9".repeat(400);

/** All three entry points, never throwing; returns the compile() diagnostic codes. */
function codes(src: string): string[] {
  const r = compile(src, { noCache: true });
  expect(() => describePlan(src)).not.toThrow();
  expect(() => lint(src)).not.toThrow();
  return r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>");
}

describe("non-finite literals", () => {
  it("a 400-digit literal is one E_NON_FINITE at the literal's span", () => {
    const src = wrap(`room id=r at (${BIG},0) size 900x900`);
    expect(codes(src)).toEqual(["E_NON_FINITE"]);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_NON_FINITE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe(BIG);
  });

  it("a unit suffix that shifts a finite literal past the limit is diagnosed", () => {
    // 1e306 mm fits; the same digits in metres are 1e309.
    const digits = "1" + "0".repeat(306);
    // Bound to a `let`, not placed: this asserts the literal's range only, not how a
    // finite-but-astronomical coordinate fares downstream.
    expect(
      codes(
        wrap(`let a = ${digits}
${ROOM}`),
      ),
    ).toEqual([]);
    expect(
      codes(
        wrap(`let a = ${digits}m
${ROOM}`),
      ),
    ).toEqual(["E_NON_FINITE"]);
  });

  it("a coded and an uncoded lexical error in one interpolation are both reported", () => {
    const r = compile(wrap(`${ROOM} label "{${BIG} + @}"`), { noCache: true });
    const got = r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
    expect(got).toContain("E_NON_FINITE");
    expect(got).toContain("E_PARSE");
  });

  it("both halves of an overflowing WxH dimension are diagnosed", () => {
    // The substituted 0 then makes the room itself degenerate, which is reported as well.
    expect(codes(wrap(`room id=r at (0,0) size ${BIG}x${BIG}`))).toEqual([
      "E_NON_FINITE",
      "E_NON_FINITE",
      "E_ROOM_SIZE",
    ]);
    expect(codes(wrap(`room id=r at (0,0) size ${BIG}x900`))).toEqual(["E_NON_FINITE", "E_ROOM_SIZE"]);
  });

  it("a literal inside a string interpolation keeps its own code", () => {
    const r = compile(wrap(`${ROOM} label "x{${BIG}}"`), { noCache: true });
    // The lexer's own code is threaded through (the literal becomes 0), not an E_PARSE that drops the statement.
    expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["E_NON_FINITE"]);
    expect(() => describePlan(wrap(`${ROOM} label "{${BIG}}"`))).not.toThrow();
  });
});

describe("non-finite arithmetic", () => {
  const E200 = "1" + "0".repeat(200);
  it("a multiplication that overflows is one E_NON_FINITE at the operation", () => {
    const src = wrap(`let a = ${E200}\nroom id=r at (a*a,0) size 900x900`);
    expect(codes(src)).toEqual(["E_NON_FINITE"]);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_NON_FINITE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe("a*a");
  });

  it("+, - and a quotient that overflow are diagnosed; a plain % is not", () => {
    const M = "1" + "0".repeat(308); // 1e308: finite
    expect(codes(wrap(`let a = ${M}\nroom id=r at (a+a,0) size 900x900`))).toEqual(["E_NON_FINITE"]);
    expect(codes(wrap(`let a = ${M}\nroom id=r at (0-a-a,0) size 900x900`))).toEqual(["E_NON_FINITE"]);
    expect(codes(wrap(`let a = ${M}\nroom id=r at (a/0.001,0) size 900x900`))).toEqual(["E_NON_FINITE"]);
    expect(codes(wrap(`room id=r at (7 % 3,0) size 900x900`))).toEqual([]);
  });

  it("a NaN index is a diagnostic, not a TypeError", () => {
    // `n*0` used to be Infinity*0 = NaN once `n` overflowed; now the overflow is caught first.
    const src = wrap(`let n = ${BIG}\nlet a = [1,2]\nroom id=r at (a[n*0],0) size 900x900`);
    expect(codes(src)).toEqual(["E_NON_FINITE"]);
  });

  it("division by zero keeps its own diagnostic", () => {
    expect(codes(wrap(`room id=r at (1/0,0) size 900x900`))).toEqual(["E_DIV_ZERO"]);
    expect(codes(wrap(`room id=r at (1%0,0) size 900x900`))).toEqual(["E_DIV_ZERO"]);
  });

  it("min/max over the largest allowed argument list does not throw", () => {
    const args = Array.from({ length: 100_000 }, (_, i) => i).join(",");
    const r = compile(wrap(`let m = max(${args})\nlet n = min(${args})\nroom id=r at (n,m) size 900x900`), {
      noCache: true,
    });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("nesting depth", () => {
  const forBlocks = (n: number) => wrap("for i in 0..1 {\n".repeat(n) + ROOM + "\n" + "}\n".repeat(n));
  const parens = (n: number) => wrap(`room id=r at (${"(".repeat(n)}1${")".repeat(n)},0) size 900x900`);

  it("blocks: read to the parser limit, expanded to the stack budget, diagnosed beyond — never a throw", () => {
    // 100 nested blocks are well inside both bounds.
    expect(codes(forBlocks(100))).toEqual([]);
    // Up to MAX_NEST_DEPTH the parser reads them, but expansion stops at the stack budget.
    expect(codes(forBlocks(MAX_NEST_DEPTH))).toEqual(["E_RECURSION"]);
    // One past the parser limit: that block is skipped (E_PARSE) and the rest still expands.
    expect(codes(forBlocks(MAX_NEST_DEPTH + 1))).toContain("E_PARSE");
    expect(codes(forBlocks(5_000))).toContain("E_PARSE");
  });

  it("an `if` nested far past the old overflow depth is diagnosed", () => {
    expect(codes(wrap("if 1 < 2 {\n".repeat(5_000) + ROOM + "\n" + "}\n".repeat(5_000)))).toContain("E_PARSE");
  });

  it("parenthesised expressions: limit-ish is fine, far above is one E_PARSE", () => {
    expect(codes(parens(MAX_NEST_DEPTH - 2))).toEqual([]);
    expect(codes(parens(10_000))).toEqual(["E_PARSE"]);
  });

  it("unary chains, index chains, calls, arrays and flat sums past the limit are diagnosed", () => {
    expect(codes(wrap(`room id=r at (${"-".repeat(10_000)}1,0) size 900x900`))).toEqual(["E_PARSE"]);
    expect(codes(wrap(`let a=[1]\nroom id=r at (a${"[0]".repeat(10_000)},0) size 900x900`))).toEqual(["E_PARSE"]);
    expect(codes(wrap(`let a = ${"abs(".repeat(5_000)}1${")".repeat(5_000)}\n${ROOM}`))).toEqual(["E_PARSE"]);
    expect(codes(wrap(`let a = ${"[".repeat(5_000)}1${"]".repeat(5_000)}\n${ROOM}`))).toEqual(["E_PARSE"]);
    expect(codes(wrap(`room id=r at (${Array(50_000).fill(1).join("+")},0) size 900x900`))).toEqual(["E_PARSE"]);
  });

  it("a flat chain is accepted to 257 terms and refused from 258 (one binary node per `+`)", () => {
    const sum = (n: number) => wrap(`let a = ${Array(n).fill(1).join("+")}\n${ROOM}`);
    expect(codes(sum(257))).toEqual([]);
    expect(codes(sum(258))).toEqual(["E_PARSE"]);
  });

  it("a recursive function whose body is deeply nested is a diagnostic, not a stack overflow", () => {
    const wrapDeep = "abs(".repeat(120) + "g(x-1)" + ")".repeat(120);
    const src = wrap(`let g(x) = if x < 1 { 0 } else { ${wrapDeep} }\nlet z = g(500)\n${ROOM}`);
    expect(codes(src)).toContain("E_CALL_DEPTH");
  });

  it("bodied recursion is accepted to ~336 / (3 nested evaluations per call) calls", () => {
    const sum = (n: number) => wrap(`let sum(n) = if n == 0 { 0 } else { n + sum(n - 1) }\nlet z = sum(${n})\n${ROOM}`);
    expect(codes(sum(100))).toEqual([]);
    // Past the stack budget it is the call-depth diagnostic, ONCE (not once per evaluation that trips).
    const d = compile(sum(600), { noCache: true }).diagnostics.filter((x) => x.code === "E_CALL_DEPTH");
    expect(d).toHaveLength(1);
  });

  it("recursion x nesting: component depth times block depth is a diagnostic, never a stack overflow", () => {
    // Up to 64 component levels each holding `per` nested blocks: the product used to overflow the JS stack.
    for (const [per, comps] of [
      [30, 63],
      [60, 32],
      [120, 16],
      [250, 8],
      [250, 63],
    ] as const) {
      for (const open of ["if n > 0 {\n", "for i in 0..1 {\n"]) {
        const src = wrap(
          `component c(n) { ${open.repeat(per)}if n > 0 { c(n - 1) }\n${"}\n".repeat(per)} }\nc(${comps})`,
        );
        const errs = codes(src);
        expect(errs.filter((c) => c === "E_RECURSION")).toHaveLength(1);
      }
    }
  });

  it("a budget crossing inside an `if` adds no spurious type error", () => {
    const src = wrap(`let sum(n) = if n < 1 { 0 } else { n + sum(n - 1) }\nlet z = sum(600)\n${ROOM}`);
    expect(codes(src)).toEqual(["E_CALL_DEPTH"]);
    // Same inside deep expansion frames: the only error is the expansion's own.
    const deep = wrap(
      `component c(n) { ${"if n > 0 {\n".repeat(120)}if n > 0 { c(n - 1) }\n${"}\n".repeat(120)} }\nc(60)`,
    );
    expect([...new Set(codes(deep))]).toEqual(["E_RECURSION"]);
  });

  it("each independent fault at plan level is reported, not just the first", () => {
    const sums = wrap(
      `let sum(n) = if n < 1 { 0 } else { n + sum(n - 1) }\nlet a = sum(600)\nlet b = sum(600)\n${ROOM}`,
    );
    expect(codes(sums)).toEqual(["E_CALL_DEPTH", "E_CALL_DEPTH"]);
    const comp = (name: string) =>
      `component ${name}(n) { ${"if n > 0 {\n".repeat(120)}if n > 0 { ${name}(n - 1) }\n${"}\n".repeat(120)} }\n${name}(60)\n`;
    expect(codes(wrap(comp("c") + comp("d"))).filter((c) => c === "E_RECURSION")).toHaveLength(2);
  });

  it("shallow component recursion is untouched", () => {
    expect(codes(wrap(`component c(n) { if n > 0 { c(n - 1) } }\nc(40)\n${ROOM}`))).toEqual([]);
  });
});

describe("derived quantities (area, extent) are diagnosed, not printed as Infinity", () => {
  const E160 = "1" + "0".repeat(160);
  it("a room whose area overflows is one E_NON_FINITE at the room (values left as computed)", () => {
    const src = wrap(`room id=r at (0,0) size ${E160}x${E160}`);
    expect(codes(src)).toEqual(["E_NON_FINITE"]);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_NON_FINITE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toContain("room id=r");
  });
  it("two finite areas whose total overflows are diagnosed", () => {
    const E154 = "1" + "0".repeat(154);
    const src = wrap(`room id=r at (0,0) size ${E154}x${E154}\nroom id=q at (${E154},0) size ${E154}x${E154}`);
    expect(codes(src)).toContain("E_NON_FINITE");
  });
  it("the total-area diagnostic is spanned at the room that carries it out of range", () => {
    const E154 = "1" + "0".repeat(154);
    const src = wrap(`room id=r at (0,0) size ${E154}x${E154}\nroom id=q at (${E154},0) size ${E154}x${E154}`);
    const d = compile(src, { noCache: true }).diagnostics.filter(
      (x) => x.code === "E_NON_FINITE" && x.message.startsWith("The total"),
    );
    expect(d).toHaveLength(1);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toContain("room id=q");
  });
});

describe("number formatting of huge finite values", () => {
  it("a finite value whose scaled form overflows prints as itself, never Infinity", () => {
    for (const f of [fmt2, fmt3, fmt4]) {
      expect(f(-1.8e305)).toBe("-1.8e+305");
      expect(f(1.7e308)).toBe("1.7e+308");
    }
    expect(fmt3(Number.POSITIVE_INFINITY)).toBe("0"); // the backstop is unchanged
    expect(fmt3(1.23456)).toBe("1.235");
  });
});

describe("arithmetic is closed over the finite numbers", () => {
  // Random expression trees over literals that include huge ones: the compile either
  // evaluates (no error) or raises only the catalogued arithmetic codes — never a throw.
  const lit = fc.oneof(
    fc.integer({ min: 0, max: 1000 }).map(String),
    fc.constantFrom("0", "0.5", "3"),
    fc.constantFrom("1" + "0".repeat(150), "1" + "0".repeat(300), "9".repeat(320)),
  );
  const expr: fc.Arbitrary<string> = fc.letrec((tie) => ({
    e: fc.oneof(
      { depthSize: "small", maxDepth: 5 },
      lit,
      fc
        .tuple(
          tie("e") as fc.Arbitrary<string>,
          fc.constantFrom("+", "-", "*", "/", "%"),
          tie("e") as fc.Arbitrary<string>,
        )
        .map(([l, o, r]) => `(${l} ${o} ${r})`),
      (tie("e") as fc.Arbitrary<string>).map((x) => `-${x}`),
      (tie("e") as fc.Arbitrary<string>).map((x) => `abs(${x})`),
      fc.tuple(tie("e") as fc.Arbitrary<string>, tie("e") as fc.Arbitrary<string>).map(([a, b]) => `max(${a}, ${b})`),
      (tie("e") as fc.Arbitrary<string>).map((x) => `[1, 2, 3][${x}]`),
    ),
  })).e;
  const ALLOWED = new Set(["E_NON_FINITE", "E_DIV_ZERO", "E_INDEX"]);

  it("never throws; only the arithmetic codes appear; a number that survives is finite", () => {
    fc.assert(
      fc.property(expr, (e) => {
        // The random value drives a drawn coordinate and size (clamped, so a finite value never
        // reaches the spatial index at absurd magnitude) and an interpolated label.
        const src = wrap(
          `let v = ${e}\nroom id=r at (min(max(v, 0), 3000), 0) size min(max(v, 1000), 4000) x 900 label "{v}"`,
        );
        const r = compile(src, { noCache: true });
        for (const d of r.diagnostics) if (d.severity === "error") expect(ALLOWED.has(d.code ?? "")).toBe(true);
        describePlan(src);
        lint(src);
        return !/Infinity|NaN/.test(r.svg ?? "");
      }),
      {
        // Fixed seed: CI is reproducible. The example is the finite ~-1.8e305 value whose
        // interpolation printed "-Infinity" (fmt3 scaled it past the double range).
        seed: 20261001,
        numRuns: 300,
        examples: [[`(377 * -(477 * 1${"0".repeat(300)}))`]],
      },
    );
  });
});
