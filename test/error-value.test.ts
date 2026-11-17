/**
 * An unknown name evaluates to the error value (AF3, TypeScript's error type): its `E_UNKNOWN_REF`,
 * hint included, is the one diagnostic of that root cause, and the element that read it is dropped
 * rather than drawn from a garbage 0, so no "positive size", overlap or loop-type error follows it.
 * Plans without an error never hold the value; their bytes are pinned by the corpus digests.
 */
import { describe, expect, it } from "vitest";
import { compile, resolve } from "../src/index.js";
import { parse } from "../src/parser.js";
import { type Env, evalExpr, type Expr, POISON, type Value } from "../src/expr.js";

const plan = (body: string): string => `plan "p" {\n${body}\n}\n`;
const diagnostics = (src: string): string[] =>
  compile(src, { noCache: true }).diagnostics.map((d) => `${d.code} ${d.message}`);
/** The ids `resolve()` keeps, so a dropped element is seen to be gone. */
const ids = (src: string): string[] => {
  const ast = compile(src, { noCache: true }).ast;
  expect(ast).toBeDefined();
  return resolve(ast!).ir.elements.map((e) => e.id);
};

/** Each case: the plan with the typo, and the same plan with the name spelt right (the control). */
const CASES: { name: string; typo: string; fixed: string; report: string; times?: number; drops: string[] }[] = [
  {
    name: "the card's case: a size that is an unknown name",
    typo: plan(`  let width = 4000\n  room id=a at (0,0) size wdth x 3000`),
    fixed: plan(`  let width = 4000\n  room id=a at (0,0) size width x 3000`),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["a"],
  },
  {
    name: "an unknown name inside an arithmetic expression",
    typo: plan(
      `  let width = 4000\n  room id=a at (0,0) size wdth * 2 + 100 x 3000\n  room id=b at (0,0) size 3000 x 3000`,
    ),
    fixed: plan(
      `  let width = 4000\n  room id=a at (0,0) size width * 2 + 100 x 3000\n  room id=b at (8100,0) size 3000 x 3000`,
    ),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["a"],
  },
  {
    name: "an unknown name carried through a `let`",
    typo: plan(`  let width = 4000\n  let w = wdth + 100\n  room id=a at (0,0) size w x 3000`),
    fixed: plan(`  let width = 4000\n  let w = width + 100\n  room id=a at (0,0) size w x 3000`),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["a"],
  },
  {
    // From a garbage 0 the loop would run from 0 and lay a room over `z`.
    name: "an unknown name as a for-loop bound (no iteration from a garbage 0)",
    typo: plan(
      `  let lo = 1\n  for i in lp..3 {\n    room at (i * 3000, 0) size 3000 x 3000\n  }\n  room id=z at (0,0) size 3000 x 3000`,
    ),
    fixed: plan(
      `  let lo = 1\n  for i in lo..3 {\n    room at (i * 3000, 0) size 3000 x 3000\n  }\n  room id=z at (0,0) size 3000 x 3000`,
    ),
    report: `E_UNKNOWN_REF Unknown name "lp"`,
    drops: [],
  },
  {
    name: "an unknown name inside a for-loop body (one report per iteration, no overlap)",
    typo: plan(`  let step = 3000\n  for i in 0..2 {\n    room at (i * stpe, 0) size 3000 x 3000\n  }`),
    fixed: plan(`  let step = 3000\n  for i in 0..2 {\n    room at (i * step, 0) size 3000 x 3000\n  }`),
    report: `E_UNKNOWN_REF Unknown name "stpe"`,
    times: 2,
    drops: [],
  },
  {
    name: 'an unknown name as a for-loop iterable (no `"for" expects an array` after it)',
    typo: plan(
      `  let xs = [0, 3000]\n  for i in xz {\n    room at (i, 0) size 3000 x 3000\n  }\n  room id=z at (0,4000) size 3000 x 3000`,
    ),
    fixed: plan(
      `  let xs = [0, 3000]\n  for i in xs {\n    room at (i, 0) size 3000 x 3000\n  }\n  room id=z at (0,4000) size 3000 x 3000`,
    ),
    report: `E_UNKNOWN_REF Unknown name "xz"`,
    drops: [],
  },
  {
    // From a garbage 0 the `then` branch would lay `a` over `c`; an error-valued condition takes neither.
    name: "an unknown name in an `if` condition expands neither branch",
    typo: plan(
      `  let width = 1\n  if wdth == 0 {\n    room id=a at (0,0) size 3000 x 3000\n  } else {\n    room id=b at (4000,0) size 3000 x 3000\n  }\n  room id=c at (0,0) size 3000 x 3000`,
    ),
    fixed: plan(
      `  let width = 1\n  if width == 0 {\n    room id=a at (0,0) size 3000 x 3000\n  } else {\n    room id=b at (4000,0) size 3000 x 3000\n  }\n  room id=c at (0,0) size 3000 x 3000`,
    ),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["a", "b"],
  },
  {
    // `s3` stands where `s2`'s extent ends, so it goes with `s2`; `s1` stays.
    name: "an unknown name as a `strip` extent drops that room and the rooms it moves",
    typo: plan(
      `  let width = 3000\n  strip right at (0,0) gap 0 height 3000 {\n    room id=s1 size 3000\n    room id=s2 size wdth\n    room id=s3 size 3000\n  }`,
    ),
    fixed: plan(
      `  let width = 3000\n  strip right at (0,0) gap 0 height 3000 {\n    room id=s1 size 3000\n    room id=s2 size width\n    room id=s3 size 3000\n  }`,
    ),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["s2", "s3"],
  },
  {
    name: "an unknown name as a component argument",
    typo: plan(`  component bay(w) {\n    room id=r at (0,0) size w x 3000\n  }\n  let width = 4000\n  bay(wdth)`),
    fixed: plan(`  component bay(w) {\n    room id=r at (0,0) size w x 3000\n  }\n  let width = 4000\n  bay(width)`),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["r"],
  },
  {
    name: "an unknown name as a placed component's argument",
    typo: plan(
      `  component bay(w) {\n    room id=r at (0,0) size w x 3000\n  }\n  let width = 4000\n  place bay(wdth) as east at (0,0)`,
    ),
    fixed: plan(
      `  component bay(w) {\n    room id=r at (0,0) size w x 3000\n  }\n  let width = 4000\n  place bay(width) as east at (0,0)`,
    ),
    report: `E_UNKNOWN_REF Unknown name "wdth"`,
    drops: ["east.r"],
  },
  {
    name: "an unknown name in a `place` origin (no overlap with the room at the garbage 0)",
    typo: plan(
      `  component bay(w) {\n    room id=r at (0,0) size w x 3000\n  }\n  let x0 = 5000\n  place bay(4000) as east at (xo,0)\n  room id=b at (0,0) size 4000 x 3000`,
    ),
    fixed: plan(
      `  component bay(w) {\n    room id=r at (0,0) size w x 3000\n  }\n  let x0 = 5000\n  place bay(4000) as east at (x0,0)\n  room id=b at (0,0) size 4000 x 3000`,
    ),
    report: `E_UNKNOWN_REF Unknown name "xo"`,
    drops: ["east.r"],
  },
];

describe("AF3: an unknown name is one diagnostic, never a cascade", () => {
  for (const c of CASES) {
    it(c.name, () => {
      // The control compiles with no diagnostic at all, so every report of the typo is about the typo.
      expect(diagnostics(c.fixed)).toEqual([]);
      expect(diagnostics(c.typo)).toEqual(Array.from({ length: c.times ?? 1 }, () => c.report));
      // The element that read the error value is gone; every other one is kept.
      const kept = ids(c.typo);
      for (const id of c.drops) expect(kept).not.toContain(id);
      for (const id of ids(c.fixed).filter((id) => !c.drops.includes(id) && !/^room_\d+$/.test(id))) {
        expect(kept).toContain(id);
      }
    });
  }

  it("keeps the did-you-mean hint on the one report", () => {
    const d = compile(CASES[0]!.typo, { noCache: true }).diagnostics;
    expect(d).toHaveLength(1);
    expect(d[0]!.hints).toEqual([`did you mean "width"?`]);
    expect(d[0]!.span).toBeDefined();
  });

  it("still reports every root cause: two unknown names in one expression are two reports", () => {
    expect(diagnostics(plan(`  room id=a at (0,0) size wdth + hght x 3000`))).toEqual([
      `E_UNKNOWN_REF Unknown name "wdth"`,
      `E_UNKNOWN_REF Unknown name "hght"`,
    ]);
  });

  it("a type error in a size is its own one report (no positive-size error after it)", () => {
    expect(diagnostics(plan(`  room id=a at (0,0) size "x" x 3000`))).toEqual([
      "E_TYPE Expected a number but got string",
    ]);
  });

  it("an opening on a wall that read the error value goes with its wall, silently", () => {
    const src = plan(
      `  let len = 6000\n  wall id=w exterior thickness 200 { (0,0) (lenn,0) }\n  door on w at 50% width 900`,
    );
    expect(diagnostics(src).map((d) => d.split(" ")[0])).toEqual(["E_UNKNOWN_REF"]);
    expect(ids(src)).toEqual([]);
  });

  it("the error value propagates through operators, indexes, conditions and built-ins", () => {
    compile(plan(""), { noCache: true }); // installs the built-in dispatch
    const sink: unknown[] = [];
    const env: Env = new Map<string, Value>([
      ["xs", { t: "arr", v: [{ t: "num", v: 1 }] }],
      ["abs", { t: "builtin", name: "abs" }],
    ]);
    const at = (src: string): Value => {
      const ast = parse(plan(`  let probe = ${src}`)).plan!;
      const stmt = ast.body[0] as { value: Expr };
      return evalExpr(stmt.value, env, (d) => sink.push(d));
    };
    const shapes = [
      "nope + 1",
      "-nope",
      "!nope",
      "nope < 1",
      "nope == 1",
      "nope || false",
      "xs[nope]",
      "nope[0]",
      "0..nope",
      "abs(nope)",
      "abs()",
      "if nope { 1 } else { 2 }",
      `"w{nope}"`,
      "1 / 0",
      "xs[5]",
    ];
    for (const e of shapes) {
      sink.length = 0;
      expect(at(e), e).toBe(POISON);
      expect(sink, e).toHaveLength(1);
    }
    // A clean expression never yields it.
    expect(at("xs[0] + 1")).not.toBe(POISON);
  });
});
