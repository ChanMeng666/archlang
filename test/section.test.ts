/**
 * `section <id|int> (x,y)->(x,y) look <compass>` (RM6.1, design `slab-and-section.md` §2): what
 * `describe().sections` reports and where the mark draws, the four refusals, the words as names, the
 * printer, and Plan JSON's `dropped` row. The byte-identity law is the `section` form of
 * `test/slab-clear-byte-identity.test.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, describeLevel, format } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { planToJson } from "../src/plan-json.js";
import { section } from "../src/elements/section.js";
import { ROOT } from "./helpers/rectilinear-rooms-law.js";

const SHELL = `  wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Hall" uses hall
  door id=d at (3000,4000) width 900 wall s`;
const plan = (body: string, head = ""): string => `plan "P" {\n  units mm\n${head}${SHELL}\n${body}\n}\n`;
const errorsOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");
const FIXTURE = readFileSync(join(ROOT, "test/fixtures/section/marks.arch"), "utf8");

suite("section marks: what describe() reports", () => {
  it("the fixture: two marks beside the levels, plan-wide, never on a storey", () => {
    expect(errorsOf(FIXTURE)).toEqual([]);
    const d = describe(FIXTURE);
    expect(d.sections).toEqual([
      { id: "A", from: { x: 3000, y: -1200 }, to: { x: 3000, y: 7200 }, look: "east", toward: { x: 1, y: 0 } },
      { id: "1", from: { x: -1200, y: 2500 }, to: { x: 8200, y: 2500 }, look: "north", toward: { x: 0, y: -1 } },
    ]);
    // A whole-plan key: no storey carries it, and narrowing to any storey keeps it.
    for (const l of d.levels ?? []) expect(Object.keys(l)).not.toContain("sections");
    expect(describeLevel(d, 2).sections).toEqual(d.sections);
    expect(describeLevel(d, 1).sections).toEqual(d.sections);
  });

  it("is absent from a plan that marks none", () => {
    expect(Object.keys(describe(plan("")))).not.toContain("sections");
  });

  it("`look` is a compass word, turned by `north` into the page direction `toward`", () => {
    const vertical = "section A (3000,-1000)->(3000,5000)";
    const horizontal = "section A (-1000,2000)->(7000,2000)";
    const towardOf = (north: string, line: string, look: string) =>
      describe(plan(`  ${line} look ${look}`, `  north ${north}\n`)).sections?.[0]?.toward;
    expect(towardOf("up", vertical, "east")).toEqual({ x: 1, y: 0 });
    expect(towardOf("up", vertical, "west")).toEqual({ x: -1, y: 0 });
    expect(towardOf("up", horizontal, "south")).toEqual({ x: 0, y: 1 });
    // North to the page's right: compass north points page-right, east page-down.
    expect(towardOf("right", vertical, "north")).toEqual({ x: 1, y: 0 });
    expect(towardOf("right", horizontal, "east")).toEqual({ x: 0, y: 1 });
    // A bearing snaps to the nearest cardinal, as every facing does (`northQuarterTurns`).
    expect(towardOf("170", horizontal, "north")).toEqual({ x: 0, y: 1 });
  });
});

suite("section marks: where they draw", () => {
  it("on the lowest storey's page only, upright, and never more than its drawCost", () => {
    const out = compile(FIXTURE, { noCache: true });
    expect(out.pages?.length).toBe(2);
    const names = (svg: string) => [...svg.matchAll(/<text[^>]*>(A|1)<\/text>/g)].map((m) => m[1]);
    expect(names(out.pages![0]!.svg)).toEqual(["A", "A", "1", "1"]);
    expect(names(out.pages![1]!.svg)).toEqual([]);
    expect(out.svg).toBe(out.pages![0]!.svg);
    // Each mark: two cut strokes, two look strokes and its name twice, the name upright under any north.
    const src = plan("  section A (3000,-1000)->(3000,5000) look north", "  north right\n");
    const drawn = compile(src, { noCache: true, annotate: true }).scene!.nodes.filter(
      (n) => n.elementKind === "section",
    );
    const { ir } = resolvePlan(src);
    const mark = ir!.elements.find((e) => e.kind === "section")!;
    expect(drawn).toHaveLength(6);
    expect(drawn.length).toBeLessThanOrEqual(section.drawCost!(mark));
    expect(section.bounds(mark)).toEqual([
      { x: 3000, y: -1000 },
      { x: 3000, y: 5000 },
    ]);
    const texts = drawn.flatMap((n) => (n.prim.t === "text" ? [n.prim] : []));
    expect(texts.map((t) => [t.value, t.rotate])).toEqual([
      ["A", undefined],
      ["A", undefined],
    ]);
    // The look strokes point the way it looks: page-right, under `north right` and `look north`.
    const looks = drawn.flatMap((n) => (n.prim.t === "line" && n.prim.a.y === n.prim.b.y ? [n.prim] : []));
    expect(looks.map((l) => Math.sign(l.b.x - l.a.x))).toEqual([1, 1]);
  });

  it("is allowed beside `level` blocks: no E_LEVEL_MIX", () => {
    const codes = compile(FIXTURE, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("E_LEVEL_MIX");
  });
});

suite("section marks: the refusals", () => {
  it("E_SECTION_AXIS: a slanted line, a line of no length", () => {
    expect(errorsOf(plan("  section A (0,0)->(5000,4000) look east"))).toEqual(["E_SECTION_AXIS"]);
    expect(errorsOf(plan("  section A (100,100)->(100,100) look east"))).toEqual(["E_SECTION_AXIS"]);
  });

  it("E_SECTION_LOOK names the two words this plan's north allows", () => {
    const msg = (north: string, line: string, look: string) =>
      compile(plan(`  ${line} look ${look}`, `  north ${north}\n`), { noCache: true }).diagnostics.find(
        (d) => d.code === "E_SECTION_LOOK",
      )?.message;
    expect(msg("up", "section A (3000,-1000)->(3000,5000)", "north")).toMatch(/can look east or west$/);
    expect(msg("up", "section A (-1000,2000)->(7000,2000)", "east")).toMatch(/can look north or south$/);
    expect(msg("right", "section A (3000,-1000)->(3000,5000)", "east")).toMatch(/can look north or south$/);
    expect(msg("right", "section A (-1000,2000)->(7000,2000)", "north")).toMatch(/can look west or east$/);
  });

  it("E_SECTION_DUP on the second mark's name; a room may share the name", () => {
    const src = plan(
      "  section A (3000,-1000)->(3000,5000) look east\n  section A (-1000,2000)->(7000,2000) look north",
    );
    const dup = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "E_SECTION_DUP");
    expect(dup).toHaveLength(1);
    expect(src.slice(dup[0]!.span!.start, dup[0]!.span!.end)).toBe("A");
    expect(dup[0]!.span!.start).toBe(src.lastIndexOf("section A") + "section ".length);
    expect(dup[0]!.relatedSpans).toHaveLength(1);
    // Not the element namespace: a room named `A` and a mark named `A` are no E_DUP_ID.
    expect(
      errorsOf(plan("  room id=A at (6000,0) size 2000x2000\n  section A (3000,-1000)->(3000,5000) look east")),
    ).toEqual([]);
  });

  it("E_SECTION_SCOPE inside a level, a zone, a component or a block", () => {
    const mark = "section A (3000,-1000)->(3000,5000) look east";
    const shell = SHELL.replace(/^ {2}/gm, "    ");
    const levels = `plan "L" {\n  units mm\n  level 1 {\n${shell}\n    ${mark}\n  }\n}\n`;
    expect(errorsOf(levels)).toEqual(["E_SECTION_SCOPE"]);
    expect(errorsOf(plan(`  zone z { ${mark} }`))).toEqual(["E_SECTION_SCOPE"]);
    expect(errorsOf(plan(`  component c() { ${mark} }`))).toEqual(["E_SECTION_SCOPE"]);
    expect(errorsOf(plan(`  for i in 0..1 { ${mark} }`))).toEqual(["E_SECTION_SCOPE"]);
  });

  it("the parse refusals: a number that is no positive whole number, a missing or unknown `look`", () => {
    for (const bad of [
      "section 0 (3000,-1000)->(3000,5000) look east",
      "section 1.5 (3000,-1000)->(3000,5000) look east",
      "section A (3000,-1000)->(3000,5000)",
      "section A (3000,-1000)->(3000,5000) look eats",
    ])
      expect(errorsOf(plan(`  ${bad}`)), bad).toEqual(["E_PARSE"]);
  });
});

suite("section marks: `section` and `look` stay names", () => {
  it("as a room id, a binding, a reassignment, a component and its call", () => {
    const src = `plan "W" {
  units mm
  let section = 2
  let look = 1
  section = section + look
  component section(n) {
    room id=look at (0,0) size 1000x1000
  }
${SHELL}
  room id=section at (6000,0) size 2000x2000 label "Store" uses storage
  section(1)
}
`;
    expect(errorsOf(src)).toEqual([]);
    const kinds = parse(src, BUILTIN_REGISTRY).plan!.body.map((s) => s.kind);
    expect(kinds).not.toContain("section");
    expect(kinds).toContain("instance");
    expect(describe(src).sections).toBeUndefined();
  });

  it("is no statement start: a clause list runs on past `section`", () => {
    // `room id=section` ends the room only where a statement start would; `section` is none.
    const kinds = parse(
      plan(`  room id=section at (6000,0) size 1000x1000\n  section A (3000,-1000)->(3000,5000) look east`),
      BUILTIN_REGISTRY,
    ).plan!.body.map((s) => s.kind);
    expect(kinds.slice(-2)).toEqual(["room", "section"]);
  });
});

suite("section marks: the printer and Plan JSON", () => {
  it("`arch fmt` prints the canonical form and is a fixed point", () => {
    const once = format(FIXTURE);
    expect(once).toContain("section A (3000, -1200)->(3000, 7200) look east");
    expect(once).toContain("section 1 (-1200, 2500)->(8200, 2500) look north");
    expect(format(once)).toBe(once);
  });

  it("Plan JSON drops it, as `section`, on the lowest storey's page", () => {
    const dropped = planToJson(FIXTURE).dropped?.filter((d) => d.clause === "section");
    expect(dropped?.map((d) => d.count)).toEqual([2]);
    // Nothing for a plan that marks none.
    expect(planToJson(plan("")).dropped?.some((d) => d.clause === "section") ?? false).toBe(false);
  });
});
