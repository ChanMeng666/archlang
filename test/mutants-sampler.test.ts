/**
 * The nightly mutant sampler (`scripts/mutants.mjs`, nightly.yml `mutants`, report-only): each
 * operator rewrites a synthetic source the way its header says, the PRNG and the sample are fixed
 * by the seed, the allow-list matches a site exactly, and `--dry-run` lists sampled sites without
 * running vitest. The sampler's verdicts themselves are read from the nightly job summary.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as sampler from "../scripts/mutants.mjs";

const { allowRow, applySite, dateSeed, enumerateSites, main, mulberry32, OPERATORS, parseAllow, sampleSites } = sampler;

type Site = {
  file: string;
  line: number;
  column: number;
  operator: string;
  start: number;
  end: number;
  replacement: string;
  before: string;
  after: string;
};

const SRC = [
  "export function f(a: number, b: number): number {",
  "  if (a < b && b >= 2) return a * b;",
  '  const s = "x" + a;',
  "  if (!(a === b)) return a - b / 2;",
  "  return a + b;",
  "}",
  "export function g(): void {",
  "  console.log(1 > 0);",
  "}",
  "export class C {",
  "  constructor() {",
  "    return;",
  "  }",
  "}",
  "",
].join("\n");

const sites = (): Site[] => enumerateSites("synthetic.ts", SRC);
const pick = (operator: string, before: string, after: string): Site => {
  const found = sites().filter((s) => s.operator === operator && s.after === after);
  expect(found, `${operator}: ${after}`).toHaveLength(1);
  const s = found[0] as Site;
  expect(s.before).toBe(before);
  return s;
};

describe("operators", () => {
  it("every operator finds a site in the synthetic source", () => {
    expect(new Set(sites().map((s) => s.operator))).toEqual(new Set(OPERATORS));
  });

  it("boundary: < ↔ <=, > ↔ >=", () => {
    pick("boundary", "if (a < b && b >= 2) return a * b;", "if (a <= b && b >= 2) return a * b;");
    pick("boundary", "if (a < b && b >= 2) return a * b;", "if (a < b && b > 2) return a * b;");
    pick("boundary", "console.log(1 > 0);", "console.log(1 >= 0);");
  });

  it("sign: + ↔ -, * ↔ /, never on a string operand", () => {
    pick("sign", "if (a < b && b >= 2) return a * b;", "if (a < b && b >= 2) return a / b;");
    pick("sign", "if (!(a === b)) return a - b / 2;", "if (!(a === b)) return a + b / 2;");
    pick("sign", "if (!(a === b)) return a - b / 2;", "if (!(a === b)) return a - b * 2;");
    pick("sign", "return a + b;", "return a - b;");
    expect(sites().filter((s) => s.line === 3)).toEqual([]);
  });

  it("negation and equality: !x → x, === ↔ !==", () => {
    pick("negation", "if (!(a === b)) return a - b / 2;", "if ((a === b)) return a - b / 2;");
    pick("equality", "if (!(a === b)) return a - b / 2;", "if (!(a !== b)) return a - b / 2;");
  });

  it("early-return: only a value-returning function body, never a constructor or a void function", () => {
    const er = sites().filter((s) => s.operator === "early-return");
    expect(er.map((s) => s.line)).toEqual([2]);
    pick("early-return", "if (a < b && b >= 2) return a * b;", "return; if (a < b && b >= 2) return a * b;");
  });

  it("constant: a numeric operand of a comparison, n → n+1", () => {
    pick("constant", "if (a < b && b >= 2) return a * b;", "if (a < b && b >= 3) return a * b;");
    pick("constant", "console.log(1 > 0);", "console.log(2 > 0);");
    pick("constant", "console.log(1 > 0);", "console.log(1 > 1);");
    // `b / 2` is arithmetic, not a comparison: its literal is no site.
    expect(sites().filter((s) => s.operator === "constant" && s.line === 4)).toEqual([]);
  });

  it("applySite rewrites exactly the edited span and keeps every other byte", () => {
    for (const s of sites()) {
      const out = applySite(SRC, s);
      expect(out.slice(0, s.start)).toBe(SRC.slice(0, s.start));
      expect(out.slice(s.start + s.replacement.length)).toBe(SRC.slice(s.end));
      expect(out.split("\n")[s.line - 1]?.trim()).toBe(s.after);
    }
  });

  it("a CRLF source prints its lines without the CR", () => {
    const crlf = enumerateSites("crlf.ts", SRC.replace(/\n/g, "\r\n")) as Site[];
    expect(crlf.map((s) => [s.operator, s.before, s.after])).toEqual(
      sites().map((s) => [s.operator, s.before, s.after]),
    );
  });
});

describe("sampling", () => {
  it("mulberry32 is deterministic for a seed and differs across seeds", () => {
    const draw = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 5 }, () => r());
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
    for (const x of draw(7)) expect(x >= 0 && x < 1).toBe(true);
  });

  it("the sample is fixed by the seed, without replacement, in source order, capped at the site count", () => {
    const all = sites();
    const a = sampleSites(all, 4, 20261110) as Site[];
    expect(sampleSites(all, 4, 20261110)).toEqual(a);
    expect(new Set(a).size).toBe(4);
    expect([...a].sort((x, y) => x.start - y.start)).toEqual(a);
    expect(sampleSites(all, 1000, 1)).toHaveLength(all.length);
  });

  it("the default seed is the UTC date as YYYYMMDD", () => {
    expect(dateSeed(new Date(Date.UTC(2026, 10, 9, 23, 59)))).toBe(20261109);
  });
});

describe("allow-list", () => {
  it("a row matches only its exact site", () => {
    const s = pick("boundary", "console.log(1 > 0);", "console.log(1 >= 0);");
    const row = { file: s.file, line: s.line, operator: s.operator, before: s.before, after: s.after, reason: "r" };
    expect(allowRow(s, [row])).toBe(row);
    for (const k of ["file", "line", "operator", "before", "after"] as const) {
      expect(allowRow(s, [{ ...row, [k]: k === "line" ? s.line + 1 : `${row[k]}x` }])).toBeUndefined();
    }
  });

  it("a row with no reason is refused; the shipped list parses", () => {
    expect(() => parseAllow('[{"file":"f","line":1,"operator":"sign","before":"a","after":"b","reason":" "}]')).toThrow(
      /no reason/,
    );
    expect(() => parseAllow('[{"file":"f"}]')).toThrow(/no `line`/);
    expect(Array.isArray(parseAllow(readFileSync("test/mutants.allow.json", "utf8")))).toBe(true);
  });
});

describe("--dry-run", () => {
  it("lists a sampled site of the default files and never runs vitest", async () => {
    const out: string[] = [];
    const code = await main(["--mutants", "1", "--dry-run", "--seed", "1"], {
      log: (s: string) => out.push(s),
      run: () => {
        throw new Error("--dry-run ran vitest");
      },
    });
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toMatch(/1 of \d+ sites sampled; nothing run\./);
    expect(text).toMatch(/\| 1 \| `src\/(num-format|expr)\.ts:\d+` \| [a-z-]+ \| .+ \| not run \|/);
  });

  it("refuses a bad argument with exit 2", async () => {
    const out: string[] = [];
    expect(await main(["--mutants", "0", "--dry-run"], { log: (s: string) => out.push(s) })).toBe(2);
    expect(await main(["--files", "src/no-such-file.ts", "--dry-run"], { log: (s: string) => out.push(s) })).toBe(2);
  });
});
