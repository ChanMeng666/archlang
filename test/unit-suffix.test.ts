/**
 * Optional metric unit suffixes on numeric literals (Tranche 6 Track B):
 * `3m`→3000, `3.5m`→3500, `3cm`→30, `3mm`→3 (a no-op), folded at lex time into
 * millimetres by exact decimal-point shifting (never float multiply). The default
 * (bare numbers = mm) is unchanged — see the byte-equality block at the end.
 */

import { describe, expect, it } from "vitest";
import { lex } from "../src/lexer.js";
import { compile } from "../src/index.js";

/** The tokens of `src` with only the fields a lexical test cares about. */
function nums(src: string): { type: string; value: string; num?: number; num2?: number }[] {
  return lex(src)
    .tokens.filter((t) => t.type === "number" || t.type === "dimension" || t.type === "ident")
    .map((t) => ({ type: t.type, value: t.value, num: t.num, num2: t.num2 }));
}

/** The single number token's folded value for a bare fragment. */
function foldOne(src: string): number {
  const t = lex(src).tokens.find((x) => x.type === "number");
  if (!t) throw new Error(`no number token in ${JSON.stringify(src)}`);
  return t.num!;
}

describe("metric unit suffixes — folding", () => {
  it("m scales ×1000, cm ×10, mm ×1 (no-op)", () => {
    expect(foldOne("3m")).toBe(3000);
    expect(foldOne("3cm")).toBe(30);
    expect(foldOne("3mm")).toBe(3);
    expect(foldOne("3")).toBe(3); // bare number stays mm
  });

  it("folds decimals exactly (no floating-point drift)", () => {
    expect(foldOne("3.5m")).toBe(3500);
    expect(foldOne("3.5cm")).toBe(35);
    expect(foldOne("3.333m")).toBe(3333);
    // 1.005 m is exactly 1005 mm — a naive float multiply (1.005 * 1000) yields
    // 1004.9999999999999, which would betray the implementation. The
    // decimal-shift path returns the exact integer.
    expect(1.005 * 1000).not.toBe(1005); // guard: the naive path really is wrong
    expect(foldOne("1.005m")).toBe(1005);
    expect(foldOne("1.234m")).toBe(1234);
    expect(foldOne("12.75cm")).toBe(127.5);
  });

  it("keeps sub-millimetre remainders exactly", () => {
    expect(foldOne("0.0005m")).toBe(0.5); // 0.5 mm
    expect(foldOne("0.25cm")).toBe(2.5); // 2.5 mm
    expect(foldOne(".5m")).toBe(500); // leading-dot literal
  });

  it("carries the suffix into the token's value + byte span", () => {
    const [t] = nums("1.2m");
    expect(t).toMatchObject({ type: "number", value: "1.2m", num: 1200 });
    const tok = lex("1.2m").tokens[0]!;
    expect(tok.start).toBe(0);
    expect(tok.end).toBe(4); // covers the suffix, so diagnostics span it
  });
});

describe("metric unit suffixes — boundary (must NOT fold)", () => {
  it("a letter after the suffix keeps it an identifier", () => {
    // `3meters` → number 3 + ident `meters`, never 3000.
    expect(nums("3meters")).toEqual([
      { type: "number", value: "3", num: 3, num2: undefined },
      { type: "ident", value: "meters", num: undefined, num2: undefined },
    ]);
    // `3cmx` where x is NOT followed by a digit → number 3 + ident `cmx`.
    expect(nums("3cmx")).toEqual([
      { type: "number", value: "3", num: 3, num2: undefined },
      { type: "ident", value: "cmx", num: undefined, num2: undefined },
    ]);
  });

  it("a bare identifier `m` (a variable) is untouched", () => {
    expect(nums("m")).toEqual([{ type: "ident", value: "m", num: undefined, num2: undefined }]);
  });

  it("`units mm` still lexes `mm` as a keyword ident, not a fold", () => {
    // No adjacent digit precedes `mm`, so nothing folds.
    expect(nums("units mm")).toEqual([
      { type: "ident", value: "units", num: undefined, num2: undefined },
      { type: "ident", value: "mm", num: undefined, num2: undefined },
    ]);
  });

  it("an unknown suffix like `3k` does not fold — `k` lexes as an ident", () => {
    expect(nums("3k")).toEqual([
      { type: "number", value: "3", num: 3, num2: undefined },
      { type: "ident", value: "k", num: undefined, num2: undefined },
    ]);
  });
});

describe("metric unit suffixes — dimension components", () => {
  it("each glued WxH component may carry its own suffix", () => {
    const dim = (src: string) => {
      const t = lex(src).tokens.find((x) => x.type === "dimension")!;
      return { value: t.value, num: t.num, num2: t.num2 };
    };
    expect(dim("3mx4m")).toEqual({ value: "3mx4m", num: 3000, num2: 4000 });
    expect(dim("3.5mx4200")).toEqual({ value: "3.5mx4200", num: 3500, num2: 4200 });
    expect(dim("3x4m")).toEqual({ value: "3x4m", num: 3, num2: 4000 });
    expect(dim("3mx4")).toEqual({ value: "3mx4", num: 3000, num2: 4 });
    expect(dim("30cmx40cm")).toEqual({ value: "30cmx40cm", num: 300, num2: 400 });
  });

  it("the spaced form `3m x 4m` lexes as two suffixed numbers around ident `x`", () => {
    expect(nums("3m x 4m")).toEqual([
      { type: "number", value: "3m", num: 3000, num2: undefined },
      { type: "ident", value: "x", num: undefined, num2: undefined },
      { type: "number", value: "4m", num: 4000, num2: undefined },
    ]);
  });
});

describe("metric unit suffixes — end-to-end byte equality with bare mm", () => {
  // The whole point: a plan authored with suffixes compiles to byte-identical
  // SVG as the same plan written in bare millimetres.
  const suffixed = `plan "Units" {
  units mm
  grid 100
  wall id=w exterior thickness 200 { (0,0) (3.5m,0) (3.5m,4m) (0,4m) close }
  room id=main at (0.2m,0.2m) size 3m x 3.6m label "Main"
  door id=d on w at 1.2m width 90cm
  window id=win on w at 50% width 1400mm
  furniture sofa in main anchor top-left inset 30cm size 2m x 900mm label "Sofa"
}
`;
  const bareMm = `plan "Units" {
  units mm
  grid 100
  wall id=w exterior thickness 200 { (0,0) (3500,0) (3500,4000) (0,4000) close }
  room id=main at (200,200) size 3000 x 3600 label "Main"
  door id=d on w at 1200 width 900
  window id=win on w at 50% width 1400
  furniture sofa in main anchor top-left inset 300 size 2000x900 label "Sofa"
}
`;

  it("produces identical SVG bytes", () => {
    const a = compile(suffixed);
    const b = compile(bareMm);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.svg).toBe(b.svg);
  });
});
