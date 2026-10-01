import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { MAX_ELEMENTS } from "../src/ir.js";

/**
 * Resource caps: `compile()` neither throws nor exhausts memory on a runaway or enormous
 * input. These plans used to crash (a `RangeError`, or an uncatchable V8 heap OOM).
 *
 * Columns stand in for rooms where only the COUNT matters: a column costs a fraction of a
 * room (no label relocation), which keeps a test that runs past the cap fast.
 */
const codes = (src: string): string[] => compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "");
const count = (cs: string[], c: string): number => cs.filter((x) => x === c).length;

suite("element budget (E_ELEMENT_LIMIT)", () => {
  it("documents the same cap the code enforces", () => {
    expect(ERROR_CATALOG.E_ELEMENT_LIMIT!.cause).toContain(MAX_ELEMENTS.toLocaleString("en-US"));
  });

  it("a `while` with no increment that creates elements stops with one E_ELEMENT_LIMIT", () => {
    const src = `plan "W" {\n let i = 0\n while i < 1 { column at (0,0) size 1x1 }\n}`;
    const cs = codes(src);
    expect(count(cs, "E_ELEMENT_LIMIT")).toBe(1);
    // The element budget (5,000) trips before the iteration cap (10,000), so the loop is
    // stopped by the budget alone — never both.
    expect(count(cs, "E_WHILE_LIMIT")).toBe(0);
  });

  it("a `while` that creates no element still hits its own iteration cap", () => {
    expect(codes(`plan "W" { while true { let y = 1 } }`)).toContain("E_WHILE_LIMIT");
  });

  it("nested `for` loops past the cap raise E_ELEMENT_LIMIT exactly once, at the crossing statement", () => {
    const src = `plan "N" {\n for a in 0..100 { for b in 0..100 { for c in 0..100 { column at (0,0) size 1x1 } } }\n}`;
    const r = compile(src, { noCache: true });
    const hits = r.diagnostics.filter((d) => d.code === "E_ELEMENT_LIMIT");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(hits[0]!.span).toBeDefined();
    expect(src.slice(hits[0]!.span!.start, hits[0]!.span!.end)).toContain("column");
    expect(r.diagnostics.filter((d) => d.code === "E_WHILE_LIMIT")).toHaveLength(0);
  });

  it("the budget counts elements reached through a component call as well", () => {
    const comp = `plan "C" {\n component c() { column at (0,0) size 1x1 }\n for i in 0..${MAX_ELEMENTS + 5} { c() }\n}`;
    expect(count(codes(comp), "E_ELEMENT_LIMIT")).toBe(1);
  });

  it("exactly MAX_ELEMENTS elements is fine; one more is not", () => {
    const plan = (n: number): string => `plan "E" { for i in 0..${n} { column at (0,0) size 1x1 } }`;
    expect(count(codes(plan(MAX_ELEMENTS)), "E_ELEMENT_LIMIT")).toBe(0);
    expect(count(codes(plan(MAX_ELEMENTS + 1)), "E_ELEMENT_LIMIT")).toBe(1);
  });

  it("is per storey: each level is its own resolution", () => {
    const plan = (n: number): string => {
      const lvl = (k: number): string => `level ${k} { for i in 0..${n} { column at (0,0) size 1x1 } }`;
      return `plan "L" {\n${lvl(1)}\n${lvl(2)}\n}`;
    };
    const full = codes(plan(MAX_ELEMENTS));
    expect(count(full, "E_PARSE")).toBe(0);
    expect(count(full, "E_ELEMENT_LIMIT")).toBe(0);
    const over = codes(plan(MAX_ELEMENTS + 1));
    expect(count(over, "E_PARSE")).toBe(0);
    expect(count(over, "E_ELEMENT_LIMIT")).toBe(2); // one per level
  }, 120_000);
});

suite("1000 identical rooms", () => {
  it("compiles with a capped overlap listing, not 499,500 warnings", () => {
    const src = `plan "R" { units mm grid 1\n${Array.from({ length: 1000 }, () => "room at (0,0) size 2000x2000").join("\n")}\n}`;
    const r = compile(src, { noCache: true });
    const overlaps = r.diagnostics.filter((d) => d.code === "W_ROOM_OVERLAP");
    expect(overlaps).toHaveLength(201);
    expect(overlaps[200]!.message).toMatch(/^…and 499300 more room pairs overlap \(first 200 listed\)$/);
  }, 120_000);
});

suite("huge finite coordinates", () => {
  // A 10^12 mm wall with a door used to exhaust memory: the joinery's cell is sized from
  // the median edge (the door's jambs), so the 10^12 mm face was bucketed into ~10^9 cells.
  const E = "1" + "0".repeat(12);
  const H = "5" + "0".repeat(11);
  const wall = `plan "H" {\n wall exterior thickness 200 { (0,0) (${E},0) }\n room at (0,0) size 3000x3000\n door at (${H},0) width 900\n}`;
  const box = `plan "H" { units mm grid 1\n wall exterior thickness 200 { (0,0) (${E},0) (${E},${E}) (0,${E}) (0,0) }\n room id=a at (0,0) size ${E}x${E}\n door at (${H},0) width 900\n}`;

  for (const [name, src] of [
    ["a wall + room + door", wall],
    ["a closed 10^12 box with a door", box],
  ] as const) {
    it(`${name} compiles, describes and lints within a bounded time, never throwing`, () => {
      // Before the bound this ran out of memory (uncatchable), so merely finishing without
      // a throw is the behaviour; the generous timeout only stops a hang.
      expect(() => compile(src, { noCache: true })).not.toThrow();
      expect(() => describe(src)).not.toThrow();
      expect(() => lint(src)).not.toThrow();
    }, 120_000);
  }
});
