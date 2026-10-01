/**
 * The modelling range: every resolved coordinate and length lies within ±2^25 mm
 * (`MODEL_RANGE_MM`, the bound under which ADR 0020 measured plain-double `orient2d` exact).
 * Beyond it an element is ONE `E_OUT_OF_RANGE` at its span and is dropped, never a throw, a
 * hang, or `Infinity`/`NaN` printed into any output. A stair or escalator run is further held
 * to `MAX_RUN_TREADS` (`E_RUN_TOO_LONG`), because the range alone still let one 33.5 km run
 * draw a quarter of a million lines.
 *
 * Every case under "the cases that used to run away" failed before this bound: the stair ran
 * `compile()` out of heap, the rest printed a non-number into the SVG or `describe()`.
 * The language has no exponent syntax, so a magnitude is written as its digits.
 */
import { describe as suite, expect, it } from "vitest";
import fc from "fast-check";
import { compile, describe, ERROR_CATALOG, format, lint, resolve } from "../src/index.js";
import { MODEL_RANGE_MM } from "../src/num-format.js";
import { MAX_RUN_TREADS, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";
import { readFileSync } from "node:fs";

const digits = (e: number, lead = "1"): string => lead + "0".repeat(e);
const plan = (body: string, head = ""): string => `plan "P" {\n${head}${body}\n}\n`;
const W = "wall id=w exterior thickness 200 { (0,0) (10000,0) (10000,8000) (0,8000) close }";
const R = 'room id=r at (0,0) size 10000x8000 label "Hall"';

/** A non-finite number anywhere in a JSON payload is replaced by a marker, so `null` from
 *  `JSON.stringify(Infinity)` cannot hide one. */
const json = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? "__NONFINITE__" : x));
const NON_NUMBER = /Infinity|NaN|__NONFINITE__/;

/** Every surface on `src`: none throws and none prints a non-number. Returns compile()'s error codes. */
function surfaces(src: string): { codes: string[]; svg: string } {
  const r = compile(src, { noCache: true });
  // Not vacuous: a parse error would make every assertion below prove nothing.
  expect(r.diagnostics.map((d) => d.code)).not.toContain("E_PARSE");
  const svg = (r.pages ? r.pages.map((p) => p.svg) : [r.svg]).join("\n");
  expect(svg).not.toMatch(NON_NUMBER);
  expect(json(r.diagnostics)).not.toMatch(NON_NUMBER);
  expect(json(describe(src))).not.toMatch(NON_NUMBER);
  expect(json(describe(src, { facts: ["symmetry", "syntax"] }))).not.toMatch(NON_NUMBER);
  expect(json(lint(src))).not.toMatch(NON_NUMBER);
  const ov = compile(src, { noCache: true, overlays: ["circulation"] });
  expect(ov.svg).not.toMatch(NON_NUMBER);
  return { codes: r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>"), svg };
}

suite("the cases that used to run away", () => {
  it("M.1: a stair 10^12 mm long is one E_OUT_OF_RANGE at the stair (was: compile out of heap)", () => {
    const src = plan(`stair id=s at (0,0) size ${digits(12)}x3000 dir up`);
    const { codes, svg } = surfaces(src);
    expect(codes).toEqual(["E_OUT_OF_RANGE"]);
    expect(svg).toBe("");
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_OUT_OF_RANGE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toMatch(/^stair id=s/);
    // The value, the limit and the unit.
    expect(d.message).toContain("1000000000000 mm");
    expect(d.message).toContain(`±${MODEL_RANGE_MM} mm`);
  }, 60_000);

  it("M.1: a dim at 1e308 is one E_OUT_OF_RANGE (was: Infinity in the SVG, no diagnostic)", () => {
    const E = digits(308);
    expect(surfaces(plan(`${R}\ndim (${E},0)->(${E},${E})`)).codes).toEqual(["E_OUT_OF_RANGE"]);
  });

  // Each printed Infinity/NaN into the SVG or describe() on the tip before the bound, or
  // (the vertical runs) exhausted a 1 GB heap at 1e9.
  const cases: Record<string, string> = {
    "dim offset 1e308": plan(`${R}\ndim (0,0)->(10000,0) offset ${digits(308)}`),
    "furniture 1e308 wide": plan(`furniture id=f bookshelf at (0,0) size ${digits(308)}x400`),
    "fence 1e308 long": plan(`fence picket { (0,0) (${digits(308)},0) }`),
    "outdoor 1e308 wide": plan(`outdoor lawn at (0,0) size ${digits(308)}x3000`),
    "site boundary at 1e308": plan(
      R,
      `site { street south boundary (0,0) (${digits(308)},0) (${digits(308)},${digits(308)}) (0,${digits(308)}) }\n`,
    ),
    "escalator 1e9 long": plan(`escalator id=e at (0,0) size ${digits(9)}x1200 dir up`),
    "stair 1e9 deep": plan(`stair id=s at (0,0) size 3000x${digits(9)} dir up`),
  };
  for (const [name, src] of Object.entries(cases)) {
    it(`${name}: one E_OUT_OF_RANGE, nothing drawn, no non-number anywhere`, () => {
      expect(surfaces(src).codes).toEqual(["E_OUT_OF_RANGE"]);
    }, 60_000);
  }

  it("arch fmt writes a literal of 1e21 or more in digits, so it re-parses (was: `1e+24`)", () => {
    const big = digits(24);
    const out = format(plan(`let a = ${big}\n${R}`));
    expect(out).toContain(`let a = ${big}`);
    expect(compile(out, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("E_PARSE");
  });
});

suite("every coordinate and length is held, wherever it is written", () => {
  const P = "40000000"; // 40 km
  const cases: Record<string, string> = {
    "a room corner": plan(`room id=a at (${P},0) size 3000x3000`),
    "a polygon vertex": plan(`room id=a polygon (0,0) (${P},0) (${P},3000) (0,3000)`),
    "a circle radius": plan(`room id=a circle at (0,0) radius ${P}`),
    "a room's label anchor": plan(R.replace('"Hall"', `"Hall" at (${P},0)`)),
    "a relational gap": plan(`room id=a at (0,0) size 3000x3000\nroom id=b right-of a gap ${P} size 3000x3000`),
    "a wall's thickness": plan(`wall id=w exterior thickness ${P} { (0,0) (10000,0) }`),
    "an arc radius": plan(
      `wall id=w exterior thickness 200 { (0,0) arc (3000,0) radius ${P} (3000,3000) (0,3000) (0,0) }`,
    ),
    "a door's width": plan(`${W}\n${R}\ndoor on w at 50% width ${P}`),
    "a window's width": plan(`${W}\n${R}\nwindow on w at 50% width ${P}`),
    "an opening's width": plan(`${W}\n${R}\nopening on w at 50% width ${P}`),
    "a dim's offset": plan(`${R}\ndim (0,0)->(10000,0) offset ${P}`),
    "a column": plan(`column id=c at (0,0) size ${P}x400`),
    "an elevator": plan(`elevator id=e at (${P},0) size 2000x2000`),
    "a void": plan(`void id=v at (0,0) size ${P}x3000`),
    "a roof polygon": plan(`${W}\nroof polygon (0,0) (${P},0) (${P},8000) (0,8000)`),
    "a roof overhang": plan(`${W}\nroof overhang ${P}`),
    "a strip's origin": plan(`strip right at (${P},0) gap 0 height 3000 { room size 3000 }`),
    "a placed instance": plan(`component c() { room id=r at (0,0) size 3000x3000 }\nplace c() as i at (${P},0)`),
  };
  for (const [name, src] of Object.entries(cases)) {
    it(`${name} past the range is E_OUT_OF_RANGE`, () => {
      expect(surfaces(src).codes).toEqual(["E_OUT_OF_RANGE"]);
    }, 60_000);
  }

  it("an `axes` position past the range is reported (at the block: a literal has no span)", () => {
    const src = plan(R, `axes { x at 0, ${P} y at 0, 8000 }\n`);
    expect(surfaces(src).codes).toEqual(["E_OUT_OF_RANGE"]);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_OUT_OF_RANGE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe(`axes { x at 0, ${P} y at 0, 8000 }`);
    expect(d.message).toContain(`x position reaches ${P} mm`);
  });

  it("a placed element is checked in PLAN coordinates: small local numbers, far frame", () => {
    // Every literal inside the component is tiny; only the frame carries it out of range.
    const src = plan(
      `component c() { room id=r at (0,0) size 3000x3000 }\nplace c() as near at (0,0)\nplace c() as far at (${P},0) rotate 90`,
    );
    const r = compile(src, { noCache: true });
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_OUT_OF_RANGE"]);
    expect(errs[0]!.message).toContain('"far.r"');
    // The out-of-range room is dropped from the resolved plan; the in-range one stays.
    const rooms = resolve(r.ast!).ir.elements.filter((e) => e.kind === "room");
    expect(rooms.map((x) => x.id)).toEqual(["near.r"]);
  });

  it("furniture in a dropped room raises no second error (the room was authored)", () => {
    const src = plan(`room id=r at (${P},0) size 3000x3000\nfurniture id=f sofa in r centered size 2000x900`);
    expect(surfaces(src).codes).toEqual(["E_OUT_OF_RANGE", "E_OUT_OF_RANGE"]);
  });
});

suite("the boundary itself", () => {
  const L = String(MODEL_RANGE_MM);
  const L1 = String(MODEL_RANGE_MM + 1);
  it("MODEL_RANGE_MM is 2^25", () => expect(MODEL_RANGE_MM).toBe(2 ** 25));

  it("a coordinate exactly at ±2^25 is accepted and drawn", () => {
    for (const src of [
      plan(`room id=a at (0,0) size ${L}x3000`),
      plan(`room id=a at (-${L},-${L}) size 3000x3000`),
      plan(`room id=a polygon (-${L},0) (${L},0) (${L},3000)`),
      plan(`${R}\ndim (-${L},0)->(${L},0) offset 0`),
      // A wall is held by the faces it draws: a 200 mm wall's end face sits 100 mm past its
      // last centreline point, so that point may come to within 100 mm of the bound.
      plan(`wall id=w exterior thickness 200 { (0,0) (${MODEL_RANGE_MM - 100},0) }`),
    ]) {
      const { codes, svg } = surfaces(src);
      expect(codes).toEqual([]);
      expect(svg.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("one millimetre past it is refused", () => {
    expect(surfaces(plan(`room id=a at (0,0) size ${L1}x3000`)).codes).toEqual(["E_OUT_OF_RANGE"]);
    expect(surfaces(plan(`room id=a at (-${L1},0) size 3000x3000`)).codes).toEqual(["E_OUT_OF_RANGE"]);
    const wall = plan(`wall id=w exterior thickness 200 { (0,0) (${MODEL_RANGE_MM - 99},0) }`);
    expect(surfaces(wall).codes).toEqual(["E_OUT_OF_RANGE"]);
  });

  it("the catalogue and the language reference quote the constant", () => {
    const quoted = MODEL_RANGE_MM.toLocaleString("en-US");
    expect(ERROR_CATALOG.E_OUT_OF_RANGE!.cause).toContain(quoted);
    const ref = readFileSync(new URL("../docs/language-reference.md", import.meta.url), "utf8");
    expect(ref).toContain(`±${quoted} mm`);
    expect(ref).toContain("MODEL_RANGE_MM");
  });
});

suite("a stair or escalator run is held to MAX_RUN_TREADS", () => {
  // treadCount = round(run / 280): 500 up to a 140,139 mm run, 501 from 140,140.
  const longest = Math.floor((MAX_RUN_TREADS + 0.5) * TREAD_GOING_MM) - 1;
  it("the longest drawable run is accepted; one millimetre more is E_RUN_TOO_LONG", () => {
    expect(longest).toBe(140_139);
    for (const kind of ["stair", "escalator"]) {
      expect(surfaces(plan(`${kind} id=s at (0,0) size ${longest}x1200 dir up`)).codes).toEqual([]);
      expect(surfaces(plan(`${kind} id=s at (0,0) size 1200x${longest + 1} dir up`)).codes).toEqual(["E_RUN_TOO_LONG"]);
    }
  }, 60_000);

  it("a run beyond the modelling range is E_OUT_OF_RANGE alone", () => {
    expect(surfaces(plan(`stair id=s at (0,0) size ${digits(9)}x1200 dir up`)).codes).toEqual(["E_OUT_OF_RANGE"]);
  });

  it("a layer far past the spread limit still renders (130 runs at the cap: ~130k nodes)", () => {
    // The old guard for this was `transit-hall` scaled ×1000, which the range now refuses.
    const runs = Array.from(
      { length: 130 },
      (_, i) => `escalator id=e${i} at (0,${i * 1500}) size ${longest}x1200 dir up`,
    ).join("\n");
    const r = compile(plan(runs), { noCache: true });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.svg.length).toBeGreaterThan(10_000_000);
  }, 120_000);
});

suite("property: random magnitudes up to 1e308 never escape the closed domain", () => {
  const ALLOWED = new Set(["E_OUT_OF_RANGE", "E_NON_FINITE", "E_RUN_TOO_LONG"]);
  const kinds: Record<string, (v: string) => string> = {
    roomAt: (v) => plan(`room id=a at (${v},0) size 3000x3000`),
    roomSize: (v) => plan(`room id=a at (0,0) size ${v}x3000`),
    wall: (v) => plan(`wall id=w exterior thickness 200 { (0,0) (${v},0) }\nroom id=a at (0,0) size 3000x3000`),
    door: (v) => plan(`${W}\n${R}\ndoor on w at 50% width ${v}`),
    stair: (v) => plan(`stair id=s at (0,0) size ${v}x3000 dir up`),
    escalator: (v) => plan(`escalator id=e at (0,0) size 1200x${v} dir down`),
    dim: (v) => plan(`${R}\ndim (0,0)->(${v},0) offset ${v}`),
    furniture: (v) => plan(`furniture id=f bookshelf at (0,0) size ${v}x400`),
    column: (v) => plan(`column id=c at (${v},${v}) size 400x400`),
    outdoor: (v) => plan(`outdoor lawn at (0,0) size ${v}x3000`),
    fence: (v) => plan(`fence picket { (0,0) (${v},0) }`),
    roof: (v) => plan(`${W}\nroof polygon (0,0) (${v},0) (${v},8000) (0,8000)`),
    site: (v) => plan(R, `site { street south boundary (0,0) (${v},0) (${v},${v}) (0,${v}) }\n`),
    place: (v) => plan(`component c() { room id=r at (0,0) size 3000x3000 }\nplace c() as i at (${v},0)`),
  };
  // A magnitude as digits: a leading 1-9 then 0..308 zeros, so every decade is reached.
  const magnitude = fc
    .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 308 }))
    .map(([lead, e]) => digits(e, String(lead)));

  it("never throws; no Infinity/NaN in any output; either drawn or a closed-domain code", () => {
    let drawn = 0;
    let refused = 0;
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(kinds)), magnitude, (kind, v) => {
        const src = kinds[kind]!(v);
        const { codes, svg } = surfaces(src);
        if (codes.length === 0) {
          expect(svg.length).toBeGreaterThan(0);
          drawn++;
        } else refused++;
        for (const c of codes) expect(ALLOWED.has(c)).toBe(true);
        expect(() => format(src)).not.toThrow();
        expect(format(src)).not.toMatch(/\de\+\d/);
      }),
      { seed: 20261002, numRuns: 200 },
    );
    // Not vacuous: the seed reaches both sides of the bound.
    expect(drawn).toBeGreaterThan(10);
    expect(refused).toBeGreaterThan(10);
  }, 60_000);
});
