/**
 * Imperial input literals (preview-and-remodel card B5, decision D8): `12ft`, `6in` and
 * `12ft6in` are length literals, converted exactly (1 in = 25.4 mm) and rounded half away from
 * zero to a whole millimetre PER LITERAL, at lex time, through `imperialToMm`
 * (`src/num-format.ts`). Input only: no output format changes.
 *
 * The laws pinned here:
 *  - the conversion and its rounding, checked against an independent BigInt reference;
 *  - the refused shapes (`12'6"`, `1/2in`, `6in12ft`, `12ft6`, …) are ONE `E_IMPERIAL_FORM` each,
 *    with a byte span, never a throw, and the message names the accepted forms;
 *  - the twin-plan law: a plan written in feet compiles to the same SVG, `describe()`, `lint()`
 *    and diagnostics as its millimetre twin (values chosen so every conversion is exact);
 *  - the modelling range still holds for an imperial literal.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { IMPERIAL_MESSAGE, lex } from "../src/lexer.js";
import { imperialToMm, MODEL_RANGE_MM } from "../src/num-format.js";

/** The single number token's folded value for a bare fragment. */
function foldOne(src: string): number {
  const r = lex(src);
  expect(r.errors).toEqual([]);
  const toks = r.tokens.filter((t) => t.type !== "eof");
  expect(toks).toHaveLength(1);
  return toks[0]!.num!;
}

/** An independent reference: BigInt rational arithmetic, rounded half away from zero. */
function reference(feet: string, inches: string): bigint {
  const rat = (s: string): [bigint, bigint] => {
    if (s === "") return [0n, 1n];
    const [a = "", b = ""] = s.split(".");
    return [BigInt(`${a || "0"}${b}`), 10n ** BigInt(b.length)];
  };
  const [fn, fd] = rat(feet);
  const [inn, ind] = rat(inches);
  // mm = (12·ft + in) · 254/10 = (12·fn·ind + inn·fd) · 254 / (fd·ind·10)
  const num = (12n * fn * ind + inn * fd) * 254n;
  const den = fd * ind * 10n;
  return (2n * num + den) / (2n * den); // non-negative: half away from zero = floor(x + 1/2)
}

suite("imperial literals — conversion and rounding", () => {
  it("folds the three forms to whole millimetres", () => {
    expect(foldOne("12ft")).toBe(3658); // 3657.6
    expect(foldOne("6in")).toBe(152); // 152.4
    expect(foldOne("12ft6in")).toBe(3810); // exact
    expect(foldOne("5ft")).toBe(1524); // exact
    expect(foldOne("1in")).toBe(25); // 25.4
    expect(foldOne("3in")).toBe(76); // 76.2
    expect(foldOne("1ft1in")).toBe(330); // 330.2
  });

  it("rounds a half away from zero, symmetrically under negation", () => {
    expect(foldOne("2.5in")).toBe(64); // 63.5, a tie
    expect(foldOne("0.5in")).toBe(13); // 12.7
    expect(foldOne(".5in")).toBe(13);
    expect(foldOne("1.5ft")).toBe(457); // 457.2
    // A literal is never negative (negation is the unary operator), so `-2.5in` is -(64).
    const neg = compile(
      `plan "n" {\n  let a = -2.5in\n  let b = -2.5in + 64\n  room id=r at (0,0) size 3000x3000 label "{a} {b}"\n}\n`,
    );
    expect(neg.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(neg.svg).toContain(">-64 0<");
  });

  it("rounds per literal, before arithmetic", () => {
    const r = compile(`plan "a" {\n  let k = 3 * 1in\n  room id=r at (0,0) size 3000x3000 label "{k} {3in}"\n}\n`);
    expect(r.svg).toContain(">75 76<");
  });

  it("matches a BigInt reference over many decimals", () => {
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const dec = (): string => {
      const int = String(rnd(5000));
      const places = rnd(5);
      let frac = "";
      for (let k = 0; k < places; k++) frac += String(rnd(10));
      return places > 0 ? `${int}.${frac}` : int;
    };
    for (let k = 0; k < 2000; k++) {
      const ft = k % 3 === 2 ? "" : dec();
      const inch = k % 3 === 1 ? "" : dec();
      if (ft === "" && inch === "") continue;
      expect(imperialToMm(ft, inch)).toBe(Number(reference(ft, inch)));
      const src = ft === "" ? `${inch}in` : inch === "" ? `${ft}ft` : `${ft}ft${inch}in`;
      expect(foldOne(src)).toBe(Number(reference(ft, inch)));
    }
  });

  it("carries the whole literal in the token value and span; dimensions take it per component", () => {
    const t = lex("12ft6in").tokens[0]!;
    expect(t).toMatchObject({ type: "number", value: "12ft6in", num: 3810, start: 0, end: 7 });
    const d = lex("12ft6inx10ft").tokens[0]!;
    expect(d).toMatchObject({ type: "dimension", num: 3810, num2: 3048 });
    expect(lex("2mx6in").tokens[0]).toMatchObject({ type: "dimension", num: 2000, num2: 152 });
  });
});

suite("imperial literals — boundaries that must NOT fold", () => {
  const shape = (src: string) =>
    lex(src)
      .tokens.filter((t) => t.type !== "eof")
      .map((t) => `${t.type}:${t.value}`);

  it("a letter after the suffix keeps it an identifier, like the metric suffixes", () => {
    expect(shape("6inch")).toEqual(["number:6", "ident:inch"]);
    expect(shape("12fts")).toEqual(["number:12", "ident:fts"]);
  });

  it("a spaced `1 / 2in` is a division, and `in` as a keyword is untouched", () => {
    expect(shape("1 / 2in")).toEqual(["number:1", "slash:/", "number:2in"]);
    expect(shape("w/2in")).toEqual(["ident:w", "slash:/", "number:2in"]);
    expect(shape("for i in 0..3")).toEqual(["ident:for", "ident:i", "ident:in", "number:0", "dotdot:..", "number:3"]);
    expect(shape("0ft..12ft")).toEqual(["number:0ft", "dotdot:..", "number:12ft"]);
  });
});

suite("imperial literals — refused shapes", () => {
  const REFUSED: [string, number][] = [
    [`12'6"`, 5],
    [`12'`, 3],
    [`6"`, 2],
    ["1/2in", 5],
    [`1/2"`, 4],
    ["6in12ft", 7],
    ["12ft6", 5],
    ["12ft6m", 6],
    ["12ft6inch", 9],
    ["6in.5", 5],
  ];

  it.each(REFUSED)("`%s` is one E_IMPERIAL_FORM over the literal", (form, len) => {
    const r = lex(form);
    expect(r.errors).toEqual([{ message: IMPERIAL_MESSAGE, span: { start: 0, end: len }, code: "E_IMPERIAL_FORM" }]);
    const toks = r.tokens.filter((t) => t.type !== "eof");
    expect(toks).toEqual([expect.objectContaining({ type: "number", num: 0, start: 0, end: len })]);
  });

  it.each(REFUSED)("`%s` in a plan is exactly one diagnostic, at its byte span, never a throw", (form, len) => {
    const src = `plan "r" {\n  let w = ${form}\n  room id=r at (0,0) size 3000x3000\n}\n`;
    const start = src.indexOf(form);
    const r = compile(src, { noCache: true });
    expect(r.diagnostics).toEqual([
      { severity: "error", message: IMPERIAL_MESSAGE, code: "E_IMPERIAL_FORM", span: { start, end: start + len } },
    ]);
  });

  it("the message names every accepted form", () => {
    for (const f of ["`12ft`", "`6in`", "`12ft6in`"]) expect(IMPERIAL_MESSAGE).toContain(f);
  });

  it("a refused WxH component keeps the other component and the statement shape", () => {
    const r = lex(`12'6"x10ft`);
    expect(r.tokens[0]).toMatchObject({ type: "dimension", num: 0, num2: 3048 });
    expect(r.errors.map((e) => e.code)).toEqual(["E_IMPERIAL_FORM"]);
  });

  it("inside a string interpolation it is reported at its span in the source", () => {
    const src = `plan "s" {\n  room id=r at (0,0) size 3000x3000 label "{1/2in}"\n}\n`;
    const start = src.indexOf("1/2in");
    const r = compile(src, { noCache: true });
    expect(r.diagnostics.map((d) => [d.code, d.span])).toEqual([["E_IMPERIAL_FORM", { start, end: start + 5 }]]);
  });
});

suite("imperial literals — the modelling range still holds", () => {
  it("a length past MODEL_RANGE_MM written in feet is E_OUT_OF_RANGE", () => {
    const inside = Math.floor(MODEL_RANGE_MM / 304.8); // 110086 ft
    expect(foldOne(`${inside}ft`)).toBeLessThanOrEqual(MODEL_RANGE_MM);
    expect(foldOne(`${inside + 1}ft`)).toBeGreaterThan(MODEL_RANGE_MM);
    const codes = (ft: number) =>
      compile(`plan "m" {\n  room id=r at (0,0) size ${ft}ftx10ft\n}\n`, { noCache: true }).diagnostics.map(
        (d) => d.code,
      );
    expect(codes(inside)).not.toContain("E_OUT_OF_RANGE");
    expect(codes(inside + 1)).toContain("E_OUT_OF_RANGE");
  });

  it("a literal past the doubles is E_NON_FINITE, as a metric one is", () => {
    const r = lex(`${"9".repeat(400)}ft`);
    expect(r.errors.map((e) => e.code)).toEqual(["E_NON_FINITE"]);
    expect(r.tokens[0]!.num).toBe(0);
  });
});

suite("imperial literals — the twin-plan byte-identity law", () => {
  // Every imperial value below converts EXACTLY (a multiple of 5 in = 127 mm), so the twin is
  // the same plan; rounding is pinned separately above. Each pair is padded with leading zeros
  // to one length (`05ft` / `1524`), so the twins have the same byte offsets and every
  // diagnostic's `span` is compared byte for byte too.
  type Pair = readonly [imperial: string, mm: string];
  const twins = (parts: readonly (string | Pair)[]): [string, string] => {
    let ft = "";
    let mm = "";
    for (const p of parts) {
      if (typeof p === "string") {
        ft += p;
        mm += p;
        continue;
      }
      const n = Math.max(p[0].length, p[1].length);
      ft += p[0].padStart(n, "0");
      mm += p[1].padStart(n, "0");
    }
    return [ft, mm];
  };
  const [feet, millimetres] = twins([
    `plan "Room graph" {\n  units mm\n  grid 1\n`,
    "  room id=living at (0,0) size ",
    ["15ft", "4572"],
    "x",
    ["20ft", "6096"],
    " uses living\n  room id=hall right-of living size ",
    ["5ft", "1524"],
    "x",
    ["20ft", "6096"],
    " uses hall\n  room id=bedroom right-of hall size ",
    ["12ft6in", "3810"],
    "x",
    ["20ft", "6096"],
    " uses bedroom\n  room id=store below bedroom size ",
    ["5ft", "1524"],
    "x",
    ["5ft", "1524"],
    " uses storage\n  walls from rooms exterior ",
    ["10in", "254"],
    " partition ",
    ["5in", "127"],
    " { open between living and hall }\n  door on hall.bottom at center width ",
    ["35in", "889"],
    " swing into hall\n  door between hall and bedroom at ",
    ["30in", "762"],
    " from start width ",
    ["30in", "762"],
    " swing into bedroom\n  window on living.left width ",
    ["5ft", "1524"],
    "\n  window on bedroom.right width ",
    ["4ft2in", "1270"],
    "\n  furniture bed in bedroom anchor bottom-right flush size ",
    ["5ft", "1524"],
    "x",
    ["6ft8in", "2032"],
    "\n}\n",
  ]);

  it("the feet plan and its millimetre twin compile to the same bytes", () => {
    expect(feet).toContain("12ft6in");
    expect(millimetres).not.toMatch(/[0-9](ft|in)/);
    expect(feet.length).toBe(millimetres.length);
    const a = compile(feet, { noCache: true });
    const b = compile(millimetres, { noCache: true });
    expect(a.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(a.svg).toBe(b.svg);
    expect(a.svg.length).toBeGreaterThan(1000);
    expect(JSON.stringify(describe(feet))).toBe(JSON.stringify(describe(millimetres)));
    expect(JSON.stringify(a.diagnostics)).toBe(JSON.stringify(b.diagnostics));
    const la = lint(feet);
    expect(la.length).toBeGreaterThan(0); // the doorless store warns, so the lint channel is not vacuous
    expect(JSON.stringify(la)).toBe(JSON.stringify(lint(millimetres)));
  });

  it("control: a one-inch slip in the feet twin is seen", () => {
    const slipped = feet.replace("35in", "36in");
    expect(compile(slipped, { noCache: true }).svg).not.toBe(compile(millimetres, { noCache: true }).svg);
  });
});
