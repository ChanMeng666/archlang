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

/** Two rooms side by side, room `a` written with `aClause`, then `rest`. */
const pair = (aClause: string, ...rest: string[]): string =>
  plan(
    [
      "  let x0 = 0",
      "  let W = 4000",
      `  room id=a ${aClause}`,
      "  room id=b at (4000,0) size 4000 x 3000",
      ...rest.map((l) => `  ${l}`),
    ].join("\n"),
  );
const AT_TYPO = "at (xo,0) size 4000 x 3000";
const AT_FIXED = "at (x0,0) size 4000 x 3000";
const WALLS = "walls from rooms exterior 200 partition 100";
const OPENINGS = [
  "door between a and b at center width 800",
  "window on a.top width 1200",
  "furniture bed in a anchor top-right flush size 1400x2000",
];
const RELATED = [
  "room id=c below a align left gap 0 size 2000 x 2000",
  "room id=d right-of c align top gap 0 size 2000 x 2000",
];
const CELL = (w: string): string =>
  plan(
    `  component cell(w) {\n    room id=r at (0,0) size w x 3000\n    furniture bed in r anchor top-right flush size 1400x2000\n  }\n  place cell(${w}) as c1 at (0,0)\n  place cell(4000) as c2 at (5000,0)\n  keep align c1.r.top c2.r.top`,
  );
const BACKED = (end: string): string =>
  plan(
    `  let len = 6000\n  wall id=w exterior thickness 200 { (0,0) (${end},0) }\n  furniture counter against wall w offset 1000 side left size 600x600`,
  );

/** Each case: the plan with the typo, its control, and the ids the typo's plan keeps. */
const DEPENDENTS: { name: string; typo: string; fixed: string; kept: string[] }[] = [
  {
    name: "a keep that aligns the dropped room",
    typo: pair(AT_TYPO, "keep align a.top b.top"),
    fixed: pair(AT_FIXED, "keep align a.top b.top"),
    kept: ["b"],
  },
  {
    name: "a keep that measures an offset from the dropped room",
    typo: pair(AT_TYPO, "keep offset b.left from a.right 0"),
    fixed: pair(AT_FIXED, "keep offset b.left from a.right 0"),
    kept: ["b"],
  },
  {
    name: "derived walls, an opening between, a window on an edge and a piece in the room (a position typo)",
    typo: pair(AT_TYPO, WALLS, ...OPENINGS),
    fixed: pair(AT_FIXED, WALLS, ...OPENINGS),
    kept: ["b", "walls_1"],
  },
  {
    // Before: `E_DATUM_UNPLACED` "a room with no positive size" three times, citing an E_ROOM_SIZE gone.
    name: "derived walls, an opening between, a window on an edge and a piece in the room (a size typo)",
    typo: pair("at (0,0) size Wx x 3000", WALLS, ...OPENINGS),
    fixed: pair("at (0,0) size W x 3000", WALLS, ...OPENINGS),
    kept: ["b", "walls_1"],
  },
  {
    name: "`except` naming the dropped room",
    typo: pair(AT_TYPO, `${WALLS} { except a }`),
    fixed: pair(AT_FIXED, `${WALLS} { except a }`),
    kept: ["b", "walls_1"],
  },
  {
    name: "`open between` naming the dropped room",
    typo: pair(AT_TYPO, `${WALLS} { open between a and b }`),
    fixed: pair(AT_FIXED, `${WALLS} { open between a and b }`),
    // The clause cannot act, so the statement derives nothing: it follows the room too.
    kept: ["b"],
  },
  {
    name: "a room placed against the dropped room, and one placed against that",
    typo: pair(AT_TYPO, ...RELATED),
    fixed: pair(AT_FIXED, ...RELATED),
    kept: ["b"],
  },
  {
    name: "a datum of the dropped room read in an expression",
    typo: pair(AT_TYPO, "column at (a.right, 3000) size 600x600"),
    fixed: pair(AT_FIXED, "column at (a.right, 3000) size 600x600"),
    kept: ["b"],
  },
  {
    name: "a placed instance's room, and the piece and the keep that name it",
    typo: CELL("wq"),
    fixed: CELL("4000"),
    kept: ["c2.r", "c2.bed_1"],
  },
  {
    name: "a piece backed onto a wall that read the error value",
    typo: BACKED("lenn"),
    fixed: BACKED("len"),
    kept: [],
  },
];

describe("AF3: nothing left in the plan or its diagnostics names an element the error value took", () => {
  for (const c of DEPENDENTS) {
    it(c.name, () => {
      expect(diagnostics(c.fixed)).toEqual([]);
      expect(diagnostics(c.typo).map((d) => d.split(" ")[0])).toEqual(["E_UNKNOWN_REF"]);
      expect(ids(c.typo)).toEqual(c.kept);
    });
  }

  it("a `keep stacked` naming a room one storey dropped says nothing more", () => {
    const src = (x: string): string =>
      plan(
        `  let x0 = 0\n  level 0 {\n    room id=a at (${x},0) size 4000 x 3000\n  }\n  level 1 {\n    room id=a at (0,0) size 4000 x 3000\n  }\n  keep stacked a on levels 0 1`,
      );
    expect(diagnostics(src("x0"))).toEqual([]);
    expect(diagnostics(src("xo"))).toEqual([`E_UNKNOWN_REF Unknown name "xo"`]);
  });

  it("a relational opening keeps its axis-arithmetic report beside an undeclared axis's (`rootDiag`)", () => {
    // `axis.2 + axis.9`: the undeclared label is the evaluator's E_UNKNOWN_REF; arithmetic on a
    // declared one is a mistake in the text (E_OPENING_DATUM), so both stand though the door goes.
    const src = pair(
      AT_FIXED,
      "axes { x at 0, 4000, 8000 }",
      WALLS,
      "door between a and b at axis.2 + axis.9 from start width 800",
    );
    const codes = compile(src, { noCache: true })
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.code)
      .sort();
    expect(codes).toEqual(["E_OPENING_DATUM", "E_UNKNOWN_REF"]);
  });
});
