/**
 * M.8 / AF6 — `arch fmt` prints every number literal losslessly: the text reads back as the same
 * double, so a formatted plan compiles to the same drawing, facts and findings, and `fmt` stays a
 * fixed point. Where 3 dp already reads back, the bytes are the historical ones.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, format, lint, repair } from "../src/index.js";
import { lex } from "../src/lexer.js";
import { fmtLiteral, fmtSource, plainDigits } from "../src/num-format.js";

/** The number a source literal lexes to (one token, as the formatter writes it). */
const lexed = (s: string): number => {
  const toks = lex(s).tokens.filter((t) => t.type === "number");
  expect(toks, s).toHaveLength(1);
  return toks[0]!.num!;
};

/** A fixed linear congruential generator: reproducible without a dependency. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** Span-like keys dropped: formatting moves bytes, so a span is the one thing allowed to differ. */
const SPANNY = new Set(["span", "spans", "line", "col"]);
const facts = (v: unknown): string => JSON.stringify(v, (k, x) => (SPANNY.has(k) ? undefined : x));

/** The whole agent-facing surface of a source, spans left out. */
const surface = (src: string): string[] => {
  const c = compile(src, { noCache: true });
  return [c.svg, facts(c.diagnostics), facts(describePlan(src)), facts(lint(src))];
};

describe("fmtLiteral: every finite literal value reads back as itself", () => {
  it("3,000 doubles from 1e-9 to 1e15 with up to 17 significant digits round-trip through the lexer", () => {
    const next = lcg(20261118);
    for (let i = 0; i < 3000; i++) {
      const digits = 1 + Math.floor(next() * 17);
      const v = Number((next() * 10 ** Math.floor(-9 + next() * 25)).toPrecision(digits));
      const s = fmtLiteral(v);
      expect(s, String(v)).toMatch(/^\d+(\.\d+)?$/);
      expect(lexed(s), s).toBe(v);
    }
  });

  it("is fmtSource wherever fmtSource already reads back (the historical bytes), and differs only where it moved the value", () => {
    const next = lcg(7);
    let differed = 0;
    for (let i = 0; i < 3000; i++) {
      const v = Math.round(next() * 1e7) / 10 ** Math.floor(next() * 6);
      const old = fmtSource(v);
      if (lexed(old) === v) expect(fmtLiteral(v), String(v)).toBe(old);
      else differed++;
    }
    // The sample reaches values 3 dp cannot carry, or the comparison above proved nothing.
    expect(differed).toBeGreaterThan(100);
  });

  it("keeps the 3 dp printer's lattice values and its backstops", () => {
    for (const [v, s] of [
      [0, "0"],
      [-0, "0"],
      [1.5, "1.5"],
      [0.001, "0.001"],
      [1234.567, "1234.567"],
      [0.0004, "0.0004"],
      [1.0005, "1.0005"],
      [1e-7, "0.0000001"],
      [1e21, `1${"0".repeat(21)}`],
      [Number.NaN, "0"],
      [Number.POSITIVE_INFINITY, "0"],
    ] as const)
      expect(fmtLiteral(v), String(v)).toBe(s);
  });
});

describe("format() keeps a literal's precision (M.8)", () => {
  it("the M.8 re-run: `at (0.0004,1.0005)` is no longer `at (0, 1.001)`", () => {
    const src = 'plan "P" { units mm room id=a at (0.0004,1.0005) size 4000x3000 label "A" }\n';
    expect(format(src)).toContain("room id=a at (0.0004, 1.0005) size 4000x3000");
  });

  /** One literal of more than 3 dp in every numeric slot the formatter prints itself or through the shared printers. */
  const PRECISE = `plan "P" {
  units mm
  north 30.00004
  theme { lineWeight: 1.00005 }
  style wall { stroke: "#123456" }
  let w = 900.0049
  level 1 "Ground" {
    wall id=sh exterior thickness 200.0004 { (0,0) (6000.0049,0) (6000.0049,4000.0049) (0,4000.0049) close }
    room id=a at (0.0049,0.0049) size 3000.0049x4000.0049 label "A"
    room id=b at (3000.0049,0.0049) size 3000.0001x4000.0049 label "B"
    door on sh at 33.33333% width w
    window on sh at 1500.0049 from start width 1200.0049
    furniture bed in a anchor center size 1600.0049x2000.0049
    dim (0.0049,0)->(6000.0049,0) offset 300.0049
  }
  level 2 "Upper" height 2800.0049 {
    room id=c at (0.0049,0.0049) size 6000.0049x4000.0049 label "C"
  }
}
`;

  it("a header setting keeps its digits too (`grid`)", () => {
    const once = format('plan "P" { units mm grid 12.5005 room at (0,0) size 4000x3000 label "R" }\n');
    expect(once).toContain("grid 12.5005\n");
    expect(format(once)).toBe(once);
  });

  it("every slot keeps its digits, the text is a fixed point, and it compiles to the same bytes", () => {
    const once = format(PRECISE);
    for (const lit of ["30.00004", "1.00005", "900.0049", "200.0004", "6000.0049", "3000.0001", "33.33333%"])
      expect(once, lit).toContain(lit);
    expect(format(once)).toBe(once);
    expect(compile(PRECISE, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(surface(once)).toEqual(surface(PRECISE));
  });

  it("the comparison can fail: the 3 dp printer's text draws a different plan", () => {
    // What `format()` wrote before M.8: every literal through fmtSource (33.33333% became
    // 33.333%, 1500.0049 became 1500.005), and the drawing moves with it.
    const old = PRECISE.replace(/\d+\.\d+/g, (m) => fmtSource(Number(m)));
    expect(old).not.toBe(PRECISE);
    expect(surface(old)[0]).not.toBe(surface(PRECISE)[0]);
  });

  it("generated plans with arbitrary-precision coordinates compile to the same bytes after format, and stay a fixed point", () => {
    const next = lcg(424242);
    // A value with 4 to 15 significant digits, written as a lexable literal (no exponent).
    const val = (max: number): number => Number((next() * max).toPrecision(4 + Math.floor(next() * 12)));
    const lit = (max: number, add = 0): string => plainDigits(add + val(max));
    for (let k = 0; k < 25; k++) {
      const rooms = Array.from(
        { length: 3 },
        (_, i) =>
          `room id=r${i} at (${lit(9000)},${lit(9000)}) size ${lit(3000, 1000)}x${lit(3000, 1000)} label "R${i}"`,
      );
      const src = `plan "G${k}" {\n units mm\n ${rooms.join("\n ")}\n let t = ${lit(100)}\n}\n`;
      const once = format(src);
      expect(format(once), src).toBe(once);
      expect(surface(once), src).toEqual(surface(src));
    }
  });
});

describe("only format() prints losslessly", () => {
  it("repair, the other caller of formatPlan, keeps the 3 dp printer for the values it computes", () => {
    // `repair` writes positions it computed; their last digits are float noise, so it keeps
    // fmtSource (src/repair.ts `printed`). A 4 dp literal in the same file is printed by it at
    // 3 dp, as before: that is outside M.8, which is `arch fmt`.
    const src = `plan "P" {
  units mm
  wall id=w exterior thickness 100 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "R"
  furniture id=f bed at (-200,1000) size 1600x2000
  let k = 1.0005
}
`;
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.source).toContain("let k = 1.001");
    // …and the swap inside format() never leaks: a later repair still prints 3 dp.
    format(src);
    expect(repair(src).source).toBe(r.source);
  });
});
