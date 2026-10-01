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
    // Bound to a `let`, not placed: a finite-but-astronomical coordinate is the spatial index's
    // concern (see the cap in the grid index), not the number domain's.
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

  it("both halves of an overflowing WxH dimension are diagnosed", () => {
    // The substituted 0 then makes the room itself degenerate, which is reported as well.
    expect(codes(wrap(`room id=r at (0,0) size ${BIG}x${BIG}`))).toEqual([
      "E_NON_FINITE",
      "E_NON_FINITE",
      "E_ROOM_SIZE",
    ]);
    expect(codes(wrap(`room id=r at (0,0) size ${BIG}x900`))).toEqual(["E_NON_FINITE", "E_ROOM_SIZE"]);
  });

  it("a literal inside a string interpolation surfaces through the outer string (documented)", () => {
    const r = compile(wrap(`${ROOM} label "{${BIG}}"`), { noCache: true });
    expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
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

  it("blocks nested to the limit are read; one deeper is one E_PARSE and no throw", () => {
    expect(codes(forBlocks(MAX_NEST_DEPTH - 1))).toEqual([]);
    expect(codes(forBlocks(MAX_NEST_DEPTH))).toEqual([]);
    expect(codes(forBlocks(MAX_NEST_DEPTH + 1))).toEqual(["E_PARSE"]);
    expect(codes(forBlocks(5_000))).toEqual(["E_PARSE"]);
  });

  it("an `if` nested far past the old overflow depth is diagnosed", () => {
    expect(codes(wrap("if 1 < 2 {\n".repeat(5_000) + ROOM + "\n" + "}\n".repeat(5_000)))).toEqual(["E_PARSE"]);
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

  it("a recursive function whose body is deeply nested is a diagnostic, not a stack overflow", () => {
    const wrapDeep = "abs(".repeat(120) + "g(x-1)" + ")".repeat(120);
    const src = wrap(`let g(x) = if x < 1 { 0 } else { ${wrapDeep} }\nlet z = g(500)\n${ROOM}`);
    expect(codes(src)).toContain("E_CALL_DEPTH");
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
        const src = wrap(`let v = ${e}\nlet s = "{v}"\n${ROOM}`);
        const r = compile(src, { noCache: true });
        for (const d of r.diagnostics) if (d.severity === "error") expect(ALLOWED.has(d.code ?? "")).toBe(true);
        describePlan(src);
        lint(src);
        return !/Infinity|NaN/.test(r.svg ?? "");
      }),
      { numRuns: 300 },
    );
  });
});
