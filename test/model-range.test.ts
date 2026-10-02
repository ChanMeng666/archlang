/**
 * The modelling range: every resolved coordinate and length lies within ±2^25 mm
 * (`MODEL_RANGE_MM`, the bound under which ADR 0020 measured plain-double `orient2d` exact).
 * Beyond it an element is ONE `E_OUT_OF_RANGE` at its span and is dropped, never a throw, a
 * hang, or `Infinity`/`NaN` printed into any output. A stair or escalator run is further held
 * to `MAX_RUN_TREADS` (`E_RUN_TOO_LONG`) at every size, because the range alone still let one
 * footprint inside it draw a quarter of a million lines; and the settings that scale a drawn
 * length (`north`, hatch `scale`/`angle`, `lineWeight`, `grid`, a `paper` scale) are held to
 * domains derived from the range.
 *
 * Every case under "the cases that used to run away" failed before this bound: the stair ran
 * `compile()` out of heap, the rest printed a non-number into the SVG or `describe()`.
 * The language has no exponent syntax, so a magnitude is written as its digits.
 */
import { describe as suite, expect, it } from "vitest";
import fc from "fast-check";
import { compile, describe, ERROR_CATALOG, format, lint, resolve } from "../src/index.js";
import { fmtSource, MAX_ANGLE_DEG, MODEL_RANGE_MM, maxScaleDenominator } from "../src/num-format.js";
import { lex } from "../src/lexer.js";
import { GROUND_MATERIALS, hatchTileMm, KNOWN_MATERIALS } from "../src/hatches.js";
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
  // treadCount = round(run / 280): 1,100 up to a 308,139 mm run, 1,101 from 308,140.
  const longest = Math.floor((MAX_RUN_TREADS + 0.5) * TREAD_GOING_MM) - 1;
  it("the longest drawable run (about 308 m, past any built moving walkway) is accepted; 1 mm more is not", () => {
    expect(longest).toBe(308_139);
    for (const kind of ["stair", "escalator"]) {
      expect(surfaces(plan(`${kind} id=s at (0,0) size ${longest}x1200 dir up`)).codes).toEqual([]);
      expect(surfaces(plan(`${kind} id=s at (0,0) size 1200x${longest + 1} dir up`)).codes).toEqual(["E_RUN_TOO_LONG"]);
    }
  }, 60_000);

  it("the cap holds INSIDE the modelling range: a 2^26 run centred on the origin (was: 24 MB, or OOM x4)", () => {
    const L = MODEL_RANGE_MM;
    for (const kind of ["stair", "escalator"]) {
      // Every point within ±2^25, so the range check passes; the run is 2^26.
      expect(surfaces(plan(`${kind} id=s at (-${L},0) size ${2 * L}x1200 dir up`)).codes).toEqual(["E_RUN_TOO_LONG"]);
      // A run of 2^25 + 280 sitting inside the range.
      const half = (L + 280) / 2;
      expect(surfaces(plan(`${kind} id=s at (-${half},0) size ${L + 280}x1200 dir up`)).codes).toEqual([
        "E_RUN_TOO_LONG",
      ]);
    }
    // Four of them used to fill a 1 GB heap; now they are four errors and no drawing.
    const four = Array.from(
      { length: 4 },
      (_, i) => `escalator id=e${i} at (-${L},${i * 1500}) size ${2 * L}x1200 dir up`,
    );
    expect(surfaces(plan(four.join("\n"))).codes).toEqual(Array(4).fill("E_RUN_TOO_LONG"));
  }, 60_000);

  it("a run that is also beyond the modelling range is ONE E_OUT_OF_RANGE (the run error is withdrawn)", () => {
    expect(surfaces(plan(`stair id=s at (0,0) size ${digits(9)}x1200 dir up`)).codes).toEqual(["E_OUT_OF_RANGE"]);
    const d = compile(plan(`stair id=s at (0,0) size ${digits(12)}x1200 dir up`), { noCache: true }).diagnostics;
    expect(d.map((x) => x.code)).toEqual(["E_OUT_OF_RANGE"]);
  });

  it("a layer far past the spread limit still renders (60 runs at the cap: ~130k nodes)", () => {
    // The old guard for this was `transit-hall` scaled x1000, which the range now refuses.
    const runs = Array.from(
      { length: 60 },
      (_, i) => `escalator id=e${i} at (0,${i * 1500}) size ${longest}x1200 dir up`,
    ).join("\n");
    const r = compile(plan(runs), { noCache: true });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.svg.length).toBeGreaterThan(10_000_000);
  }, 120_000);
});

suite("an out-of-range element is reported exactly once", () => {
  const P = "40000000";
  /** Every diagnostic compile() returns, any severity. */
  const all = (src: string) => compile(src, { noCache: true }).diagnostics.map((d) => d.code);

  it("its resolve-time errors and warnings are withdrawn beside E_OUT_OF_RANGE", () => {
    // Each case below used to be two reports for one element (the second named on the right).
    expect(all(plan(`wall id=w exterior thickness -${P} { (0,0) (10000,0) }`))).toEqual(["E_OUT_OF_RANGE"]); // E_WALL_THICKNESS
    expect(all(plan(`${W}\n${R}\ndoor at (${digits(308)},0) width 900`))).toEqual(["E_OUT_OF_RANGE"]); // W_DOOR_OFF_WALL
    expect(all(plan(R.replace('"Hall"', `"Hall" at (${MODEL_RANGE_MM + 1},0)`)))).toEqual(["E_OUT_OF_RANGE"]); // W_ROOM_LABEL_OUTSIDE
    // The relational path raises its label warning after placement, from `placeRelational`.
    expect(
      all(plan(`room id=a at (0,0) size 3000x3000\nroom id=b right-of a size 3000x3000 label "B" at (${P},0)`)),
    ).toEqual(["E_OUT_OF_RANGE"]);
    // Inside a placed instance too.
    expect(
      all(plan(`component c() { wall id=w exterior thickness -${P} { (0,0) (1000,0) } }\nplace c() as i at (0,0)`)),
    ).toEqual(["E_OUT_OF_RANGE"]);
  });

  it("an in-range element keeps its own diagnostics", () => {
    expect(all(plan(`wall id=w exterior thickness -200 { (0,0) (10000,0) }`))).toContain("E_WALL_THICKNESS");
    expect(all(plan(`${W}\n${R}\ndoor at (5000,4000) width 900`))).toContain("W_DOOR_OFF_WALL");
  });

  it("an opening hosted on a dropped wall goes with it, silently (the wall's report is the one report)", () => {
    const src = plan(
      `wall id=w exterior thickness 200 { (0,0) (${P},0) }\ndoor on w at 1000 width 900\nwindow on w at 3000 width 900`,
    );
    const r = compile(src, { noCache: true });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_OUT_OF_RANGE"]);
    expect(r.diagnostics[0]!.message).toContain('wall "w"');
    const kinds = resolve(r.ast!).ir.elements.map((e) => e.kind);
    expect(kinds).not.toContain("door");
    expect(kinds).not.toContain("window");
    expect(kinds).not.toContain("wall");
  });
});

suite("the settings that scale a drawn length are held too", () => {
  const BIG = digits(308);
  const B = `${W}\n${R}`;
  const one = (src: string): string[] => surfaces(src).codes;
  const spanOf = (src: string): string => {
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_OUT_OF_RANGE")!;
    return src.slice(d.span!.start, d.span!.end);
  };

  it('north: a bearing past ±2^25 degrees (was: rotate(1e+308) and x="NaN")', () => {
    expect(one(plan(B, `north ${BIG}\n`))).toEqual(["E_OUT_OF_RANGE"]);
    expect(spanOf(plan(B, `north ${BIG}\n`))).toBe(BIG);
    expect(one(plan(B, `north ${MAX_ANGLE_DEG}\n`))).toEqual([]);
    expect(one(plan(B, `north ${MAX_ANGLE_DEG + 1}\n`))).toEqual(["E_OUT_OF_RANGE"]);
  });

  // A wall about 30 km long: the drawing's hatch module and pen grow with it.
  const FAR = 30_000_000;
  const farWall = (clause: string) =>
    plan(`wall id=w exterior thickness 200 material brick ${clause} { (0,0) (${FAR},0) }`);
  const smallWall = (clause: string) =>
    plan(`wall id=w exterior thickness 200 material brick ${clause} { (0,0) (10000,0) }\n${R}`);

  it("hatch scale is held by the TILE it draws on this drawing, not as an input cap", () => {
    // A small plan with a coarse hatch compiles: its tile is metres, not kilometres.
    expect(one(smallWall("scale 10"))).toEqual([]);
    expect(one(smallWall("scale 1000"))).toEqual([]);
    // 1e308 drew width="Infinity"; now it is refused, naming the drawn size and the setting.
    expect(one(smallWall(`scale ${BIG}`))).toEqual(["E_OUT_OF_RANGE"]);
    const d = compile(smallWall(`scale ${BIG}`), { noCache: true }).diagnostics[0]!;
    expect(d.message).toContain("hatch `scale`");
    expect(d.message).toContain("pattern tile");
    // A bare literal carries no span of its own, so the wall statement is blamed; an
    // expression is blamed itself.
    expect(spanOf(smallWall(`scale ${BIG}`))).toMatch(/^wall id=w /);
    expect(spanOf(smallWall(`scale ${BIG} / 2`))).toBe(`${BIG} / 2`);
    // Near the range the same kind of scale crosses 2^25: refused there, legal on the house.
    expect(one(farWall("scale 1"))).toEqual([]);
    expect(one(farWall("scale 1000"))).toEqual(["E_OUT_OF_RANGE"]);
    const far = compile(farWall("scale 1000"), { noCache: true }).diagnostics[0]!;
    expect(far.message).toMatch(/draws a pattern tile of \d+(\.\d+)? mm on this drawing/);
  });

  it("the tile is read from the pattern markup every material draws", () => {
    for (const material of [...KNOWN_MATERIALS, ...GROUND_MATERIALS]) {
      const t = hatchTileMm({ material, scale: 1, angle: 0 }, 100);
      expect(Number.isFinite(t) && t > 0).toBe(true);
      expect(hatchTileMm({ material, scale: 2, angle: 0 }, 100)).toBeCloseTo(2 * t, 9);
    }
  });

  it("hatch angle past ±2^25 degrees", () => {
    expect(one(smallWall(`angle ${BIG}`))).toEqual(["E_OUT_OF_RANGE"]);
    expect(one(smallWall(`angle ${MAX_ANGLE_DEG}`))).toEqual([]);
  });

  it('theme lineWeight is held by the PEN it draws on this drawing (was: stroke-width="Infinity")', () => {
    expect(one(plan(B, "theme { lineWeight: 200 }\n"))).toEqual([]);
    expect(one(plan(B, `theme { lineWeight: ${BIG} }\n`))).toEqual(["E_OUT_OF_RANGE"]);
    expect(spanOf(plan(B, `theme { lineWeight: ${BIG} }\n`))).toBe(BIG);
    const nearRange = `wall id=w exterior thickness 200 { (0,0) (${FAR},0) }`;
    expect(one(plan(nearRange, "theme { lineWeight: 1 }\n"))).toEqual([]);
    expect(one(plan(nearRange, "theme { lineWeight: 1000 }\n"))).toEqual(["E_OUT_OF_RANGE"]);
    const d = compile(plan(nearRange, "theme { lineWeight: 1000 }\n"), { noCache: true }).diagnostics[0]!;
    expect(d.message).toMatch(/lineWeight` 1000 draws the heaviest pen at \d+(\.\d+)? mm on this drawing/);
  });

  it("grid past the range (was: every coordinate snapped to 0, reported as E_ROOM_SIZE)", () => {
    expect(one(plan(B, `grid ${BIG}\n`))).toEqual(["E_OUT_OF_RANGE"]);
    expect(one(plan(B, `grid ${MODEL_RANGE_MM}\n`))).not.toContain("E_OUT_OF_RANGE");
  });

  it("a paper plan's scale denominator that puts the sheet past the range", () => {
    const max = maxScaleDenominator(1189); // A0's long side
    expect(max).toBe(28_220);
    expect(one(plan(B, `paper A0\nscale 1:${max}\n`))).toEqual([]);
    expect(one(plan(B, `paper A0\nscale 1:${max + 1}\n`))).toEqual(["E_OUT_OF_RANGE"]);
    expect(spanOf(plan(B, `paper A0\nscale 1:${max + 1}\n`))).toBe(`scale 1:${max + 1}`);
    // Without paper a scale is a title-block annotation and draws nothing at that size.
    expect(one(plan(B, `scale 1:${digits(20)}\n`))).toEqual([]);
  });
});

suite("a `lineWeight` from the compile options is held like the source's", () => {
  const B = `${W}\n${R}`;
  const FAR = 30_000_000;
  const one = (src: string): string[] => surfaces(src).codes;
  const errorsOf = (r: ReturnType<typeof compile>): string[] =>
    r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>");
  const svgOf = (r: ReturnType<typeof compile>): string => (r.pages ? r.pages.map((p) => p.svg) : [r.svg]).join("\n");

  it("opts.theme lineWeight 1e308: one E_OUT_OF_RANGE at the plan header, no Infinity (was: drawn, unchecked)", () => {
    const src = plan(B);
    const r = compile(src, { noCache: true, theme: { lineWeight: 1e308 } });
    expect(errorsOf(r)).toEqual(["E_OUT_OF_RANGE"]);
    expect(r.svg).toBe("");
    const d = r.diagnostics.find((x) => x.code === "E_OUT_OF_RANGE")!;
    // No source span of its own: the plan header carries it, and the message says where it came from.
    expect(src.slice(d.span!.start, d.span!.end)).toBe('plan "P"');
    expect(d.message).toContain("compile options");
    expect(d.message).toContain("lineWeight` 1e+308");
    expect(json(r.diagnostics)).not.toMatch(NON_NUMBER);
    expect(d.message).not.toMatch(NON_NUMBER);
    // The source path is untouched: the same plan without the option draws.
    expect(errorsOf(compile(src, { noCache: true }))).toEqual([]);
  });

  it("the API and the source decide at the same weight (bisected to the boundary)", () => {
    const near = `wall id=w exterior thickness 200 { (0,0) (${FAR},0) }`;
    const apiOk = (lw: number): boolean =>
      errorsOf(compile(plan(near), { noCache: true, theme: { lineWeight: lw } })).length === 0;
    let lo = 1;
    let hi = 1_000_000;
    expect(apiOk(lo) && !apiOk(hi)).toBe(true);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (apiOk(mid)) lo = mid;
      else hi = mid;
    }
    // Just under the bound compiles and draws; one more is refused.
    const under = compile(plan(near), { noCache: true, theme: { lineWeight: lo } });
    expect(errorsOf(under)).toEqual([]);
    expect(svgOf(under)).not.toMatch(NON_NUMBER);
    expect(svgOf(under).length).toBeGreaterThan(0);
    // The source's `lineWeight` turns at exactly the same weight.
    expect(one(plan(near, `theme { lineWeight: ${lo} }\n`))).toEqual([]);
    expect(one(plan(near, `theme { lineWeight: ${hi} }\n`))).toEqual(["E_OUT_OF_RANGE"]);
  });

  it("a theme registered in opts.themes and selected by `theme <name>` is held too", () => {
    const src = plan(B, "theme heavy\n");
    const r = compile(src, {
      noCache: true,
      themes: [{ kind: "theme" as const, name: "heavy", theme: { lineWeight: 1e308 } }],
    });
    expect(errorsOf(r)).toEqual(["E_OUT_OF_RANGE"]);
    expect(r.diagnostics[0]!.message).toContain('the theme "heavy"');
    // A source `lineWeight` overrides the registered one, and is what is checked.
    const own = compile(plan(B, "theme heavy {\n  lineWeight: 1\n}\n"), {
      noCache: true,
      themes: [{ kind: "theme" as const, name: "heavy", theme: { lineWeight: 1e308 } }],
    });
    expect(errorsOf(own)).toEqual([]);
  });

  it("a value that is not a finite number is reported without printing it as one", () => {
    for (const lw of [Number.NaN, Number.POSITIVE_INFINITY, "heavy" as unknown as number]) {
      const r = compile(plan(B), { noCache: true, theme: { lineWeight: lw } });
      expect(errorsOf(r)).toEqual(["E_OUT_OF_RANGE"]);
      expect(r.diagnostics[0]!.message).toContain("not a finite number");
      expect(r.diagnostics[0]!.message).not.toMatch(NON_NUMBER);
    }
  });

  it("on a multi-storey plan it is reported once, not once per page", () => {
    const src = plan(`level 0 {\n${B}\n}\nlevel 1 {\n${B}\n}\nlevel 2 {\n${B}\n}`);
    const r = compile(src, { noCache: true, theme: { lineWeight: 1e308 } });
    expect(errorsOf(r)).toEqual(["E_OUT_OF_RANGE"]);
  });
});

suite("a plan-level setting out of range is reported once per plan, not once per storey", () => {
  const P = "40000000";
  const three = (head: string): string => plan(`level 0 {\n${R}\n}\nlevel 1 {\n${R}\n}\nlevel 2 {\n${R}\n}`, head);
  const cases: Record<string, [string, string]> = {
    "theme lineWeight (was: one per page)": [three(`theme { lineWeight: ${digits(308)} }\n`), "E_OUT_OF_RANGE"],
    "an axes position (was: one per page)": [three(`axes { x at 0, ${P} y at 0, 8000 }\n`), "E_OUT_OF_RANGE"],
    "the site boundary (was: one per page)": [
      three(`site { street south boundary (0,0) (${P},0) (${P},${P}) (0,${P}) }\n`),
      "E_OUT_OF_RANGE",
    ],
    "the plan height (was: one per page)": [three("height 200000\n"), "E_HEIGHT_RANGE"],
    "a paper scale": [three(`paper A0\nscale 1:${maxScaleDenominator(1189) + 1}\n`), "E_OUT_OF_RANGE"],
    north: [three(`north ${digits(308)}\n`), "E_OUT_OF_RANGE"],
    grid: [three(`grid ${digits(308)}\n`), "E_OUT_OF_RANGE"],
  };
  for (const [name, [src, code]] of Object.entries(cases)) {
    it(name, () => {
      const r = compile(src, { noCache: true });
      const errs = r.diagnostics.filter((d) => d.severity === "error");
      expect(errs.map((d) => d.code)).toEqual([code]);
      expect(json(r.diagnostics)).not.toMatch(NON_NUMBER);
    });
  }

  it("a statement expanded on several storeys is reported on each, with its level (red team p5)", () => {
    const placed = plan(
      `component c() { room id=z at (${P},0) size 3000x3000 }\n` +
        `level 0 {\n${R}\nplace c() as i at (0,0)\n}\nlevel 1 {\n${R}\nplace c() as i at (0,0)\n}`,
    );
    const bare = plan(
      `component c() { room id=z at (${P},0) size 3000x3000 }\nlevel 0 {\n${R}\nc()\n}\nlevel 1 {\n${R}\nc()\n}`,
    );
    const viaLet = plan(
      `let far = ${P}\nlevel 0 {\n${R}\nroom id=b at (far,0) size 3000x3000\n}\nlevel 1 {\n${R}\nroom id=b at (far,0) size 3000x3000\n}`,
    );
    for (const src of [placed, bare, viaLet]) {
      const errs = compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
      expect(errs.map((d) => [d.code, d.level])).toEqual([
        ["E_OUT_OF_RANGE", 0],
        ["E_OUT_OF_RANGE", 1],
      ]);
    }
  });

  it("a storey's own out-of-range element is still reported on its storey", () => {
    const src = plan(`level 0 {\n${R}\n}\nlevel 1 {\n${R}\nroom id=far at (${P},0) size 3000x3000\n}`);
    const errs = compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => [d.code, d.level])).toEqual([["E_OUT_OF_RANGE", 1]]);
  });
});

suite("source printers write every finite value so it re-parses to the same double", () => {
  /** The number a source literal lexes to. */
  const lexed = (s: string): number => {
    const toks = lex(s).tokens.filter((t) => t.type === "number");
    expect(toks).toHaveLength(1);
    return toks[0]!.num!;
  };

  it("the integer fmt3 used to move (999999999999740600000 printed as …740700000)", () => {
    const n = 999999999999740600000;
    expect(lexed(fmtSource(n))).toBe(n);
  });

  it("4,000 doubles across 1e12..1e300 round-trip, and format() is idempotent on them", () => {
    // Above |n| × 1000 = 2^53 every value is printed exactly. Below it the source keeps its
    // 3 dp (the formatter's own precision, unchanged here), so a sample there is an integer,
    // which 3 dp carries exactly.
    // A fixed linear congruential generator: reproducible without a dependency.
    let state = 20261002;
    const next = (): number => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31;
    };
    const values: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const v = (1 + next() * 9) * 10 ** Math.floor(12 + next() * 289);
      values.push(v * 1000 > 2 ** 53 ? v : Math.round(v));
    }
    const printed = values.map(fmtSource);
    for (let i = 0; i < values.length; i++) {
      expect(printed[i]).toMatch(/^\d+(\.\d+)?$/);
      expect(lexed(printed[i]!)).toBe(values[i]);
    }
    const src = plan(printed.map((s, i) => `let v${i} = ${s}`).join("\n"));
    const once = format(src);
    for (const s of printed) expect(once).toContain(` = ${s}\n`);
    expect(format(once)).toBe(once);
  }, 60_000);
});

suite("property: random magnitudes up to 1e308 never escape the closed domain", () => {
  const ALLOWED = new Set(["E_OUT_OF_RANGE", "E_NON_FINITE", "E_RUN_TOO_LONG"]);
  const B = `${W}\n${R}`;
  // (`grid` is not here: a grid coarser than the plan legitimately snaps it apart, with the
  // plan's own codes; its domain is pinned in the suite above.)
  // Each template varies exactly ONE value, so at most one element (or setting) can leave its
  // domain: the plan is either drawn or refused by exactly one report.
  const kinds: Record<string, (v: string) => string> = {
    roomAt: (v) => plan(`room id=a at (${v},0) size 3000x3000`),
    roomSize: (v) => plan(`room id=a at (0,0) size ${v}x3000`),
    wall: (v) => plan(`wall id=w exterior thickness 200 { (0,0) (${v},0) }\nroom id=a at (0,0) size 3000x3000`),
    wallThickness: (v) => plan(`wall id=w exterior thickness ${v} { (0,0) (10000,0) }`),
    door: (v) => plan(`${B}\ndoor on w at 50% width ${v}`),
    doorAt: (v) => plan(`${B}\ndoor at (${v},0) width 900`),
    labelAt: (v) => plan(R.replace('"Hall"', `"Hall" at (${v},0)`)),
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
    north: (v) => plan(B, `north ${v}\n`),
    hatchScale: (v) => plan(`wall id=w exterior thickness 200 material brick scale ${v} { (0,0) (10000,0) }\n${R}`),
    hatchAngle: (v) => plan(`wall id=w exterior thickness 200 material brick angle ${v} { (0,0) (10000,0) }\n${R}`),
    lineWeight: (v) => plan(B, `theme { lineWeight: ${v} }\n`),
    paperScale: (v) => plan(B, `paper A3\nscale 1:${v}\n`),
    // A plan-level setting on a multi-storey plan: still one report, not one per storey.
    lineWeightStoreys: (v) => plan(`level 0 {\n${B}\n}\nlevel 1 {\n${B}\n}`, `theme { lineWeight: ${v} }\n`),
    axesStoreys: (v) => plan(`level 0 {\n${R}\n}\nlevel 1 {\n${R}\n}`, `axes { x at 0, ${v} y at 0, 8000 }\n`),
  };
  // A FINITE magnitude as digits: a leading 1-9 then 0..308 zeros (only 1e308 itself in the
  // last decade, the largest such literal that is finite), so every decade is reached. A
  // literal past the doubles is the lexer's per-literal E_NON_FINITE (test/non-finite.test.ts).
  const magnitude = fc
    .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 308 }))
    .map(([lead, e]) => digits(e, String(e === 308 ? 1 : lead)));

  it("never throws; no Infinity/NaN in any output; drawn, or exactly one closed-domain report", () => {
    let drawn = 0;
    let refused = 0;
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(kinds)), magnitude, (kind, v) => {
        const src = kinds[kind]!(v);
        const { codes, svg } = surfaces(src);
        if (codes.length === 0) {
          expect(svg.length).toBeGreaterThan(0);
          drawn++;
        } else {
          refused++;
          // One varying value, one report, and it is a closed-domain code.
          expect(codes).toHaveLength(1);
          expect(ALLOWED.has(codes[0]!)).toBe(true);
          // Nothing else is said about that element: no other diagnostic lies within its span.
          const diags = compile(src, { noCache: true }).diagnostics;
          const d = diags.find((x) => x.severity === "error")!;
          const inside = diags.filter(
            (x) => x !== d && x.span && d.span && x.span.start >= d.span.start && x.span.end <= d.span.end,
          );
          expect(inside).toEqual([]);
        }
        expect(() => format(src)).not.toThrow();
        expect(format(src)).not.toMatch(/\de\+\d/);
      }),
      {
        seed: 20261002,
        numRuns: 300,
        // Always run: a coarse hatch and a heavy pen on a small plan are drawn (they used to be
        // refused by fixed caps); the same settings at 1e308 are one report, no Infinity.
        examples: [
          ["hatchScale", "10"],
          ["hatchScale", "1000"],
          ["lineWeight", "200"],
          ["hatchScale", digits(308)],
          ["lineWeight", digits(308)],
          ["north", digits(308)],
          ["lineWeightStoreys", digits(308)],
          ["axesStoreys", "40000000"],
        ],
      },
    );
    // Not vacuous: the seed reaches both sides of the bound.
    expect(drawn).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(20);
  }, 60_000);
});
