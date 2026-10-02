/**
 * The drawing budget (`MAX_DRAW_UNITS`, `src/ir.ts`): before anything is drawn, every element
 * is estimated at the primitives `render()` will emit for it, summed over every storey, and a
 * plan past the budget is ONE `E_DRAWING_LIMIT` at the element that crossed it.
 *
 * Elements are capped at 5,000 per storey and a run at 1,100 treads, but those caps multiply:
 * 500 escalators at the tread cap took 0.82 GB of heap and drew 105 MB of SVG, and 4,990
 * cabinets on each of two storeys 0.53 GB. Both are refused here before `toScene()` runs.
 *
 * The estimate is only a budget if it is an upper bound, so the suite holds it to the drawing:
 * for every kind's worst shapes, every fixture category and every corpus plan, the primitives
 * drawn never exceed the estimate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, ERROR_CATALOG } from "../src/index.js";
import { DRAW_UNITS_PER_ELEMENT, drawUnits, MAX_DRAW_UNITS, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { MAX_RUN_TREADS, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");
const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;
const RUN = MAX_RUN_TREADS * TREAD_GOING_MM; // a run exactly at the tread cap

/** Σ drawUnits over every storey of a source, and the primitives compile() actually drew. */
function estimateAndDrawn(
  src: string,
  world: World = NULL_WORLD,
): { estimate: number; drawn: number; errors: string[] } {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  const linked = link(ast!, world, BUILTIN_REGISTRY);
  const res = resolveAll(linked.plan, BUILTIN_REGISTRY, world);
  const storeys = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
  let estimate = 0;
  for (const s of storeys) for (const el of s.elements) estimate += drawUnits(el, BUILTIN_REGISTRY);
  const r = compile(src, { noCache: true, world });
  const scenes = r.pages ? r.pages.map((p) => p.scene) : r.scene ? [r.scene] : [];
  const drawn = scenes.reduce((n, s) => n + s.nodes.length, 0);
  const errors = r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>");
  return { estimate, drawn, errors };
}

const escalators = (n: number, y0 = 10_000): string =>
  `  for i in 0..${n} { escalator at (0, ${y0} + i * 2000) size ${RUN}x1200 dir up }`;

suite("the drawings that used to exhaust memory are refused before they are drawn", () => {
  it("500 escalators at the tread cap: one E_DRAWING_LIMIT, nothing drawn (was: 0.82 GB, 105 MB of SVG)", () => {
    const src = plan(escalators(500));
    const before = process.memoryUsage().heapUsed;
    const r = compile(src, { noCache: true });
    const grown = process.memoryUsage().heapUsed - before;
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_DRAWING_LIMIT"]);
    expect(r.svg).toBe("");
    expect(r.scene).toBeUndefined();
    // Refused before the drawing, so the heap barely moves (a generous bound: GC timing varies).
    expect(grown).toBeLessThan(200 * 1024 * 1024);
    // At the element whose estimate crossed the budget, naming it.
    expect(src.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toMatch(/^escalator at/);
    expect(errs[0]!.message).toContain(`budget of ${MAX_DRAW_UNITS}`);
  }, 60_000);

  it("the budget is one total over every storey: two storeys that each fit alone are refused together", () => {
    const storey = "    for i in 0..2700 { furniture upper_cabinet at (0, 10000 + i * 1000) size 300000x600 }";
    const alone = estimateAndDrawn(plan(storey));
    expect(alone.errors).toEqual([]);
    expect(alone.estimate).toBeLessThanOrEqual(MAX_DRAW_UNITS);
    const r = compile(plan(`  level 0 {\n${storey}\n  }\n  level 1 {\n${storey}\n  }`), { noCache: true });
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => [d.code, d.level])).toEqual([["E_DRAWING_LIMIT", 1]]);
    expect(r.pages ?? []).toEqual([]);
  }, 60_000);

  it("a plan just under the budget draws; one element more is refused", () => {
    const per = estimateAndDrawn(plan(escalators(1))).estimate;
    const n = Math.floor(MAX_DRAW_UNITS / per);
    const under = estimateAndDrawn(plan(escalators(n)));
    expect(under.estimate).toBeLessThanOrEqual(MAX_DRAW_UNITS);
    expect(under.errors).toEqual([]);
    expect(under.drawn).toBeGreaterThan(0);
    expect(estimateAndDrawn(plan(escalators(n + 1))).errors).toEqual(["E_DRAWING_LIMIT"]);
  }, 60_000);

  it("an over-long run is E_RUN_TOO_LONG alone: its estimate is held at the tread cap", () => {
    const r = compile(plan(`  escalator id=e at (0,0) size ${40 * RUN}x1200 dir up`), { noCache: true });
    expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["E_RUN_TOO_LONG"]);
  });
});

suite("the estimate is an upper bound on what is drawn", () => {
  it("every fixture category, at every aspect and size, draws no more than its estimate", () => {
    const sizes = ["300x300", "600x600", "2000x600", "600x2000", "30000x600", "600x30000", "300000x600", "600x300000"];
    let worst = 0;
    for (const c of FIXTURE_CATEGORIES)
      for (const s of sizes)
        for (const rot of ["", " rotate 90"]) {
          const { estimate, drawn } = estimateAndDrawn(plan(`  furniture ${c} at (0,0) size ${s}${rot}`));
          expect(drawn, `${c} ${s}${rot}`).toBeLessThanOrEqual(estimate);
          worst = Math.max(worst, drawn);
        }
    // The fixed part is what makes this hold: the largest glyph is within it.
    expect(worst).toBeLessThanOrEqual(DRAW_UNITS_PER_ELEMENT);
    expect(worst).toBeGreaterThan(DRAW_UNITS_PER_ELEMENT / 2);
  }, 120_000);

  it("every other kind's worst shapes draw no more than their estimate", () => {
    const shapes = [
      `  stair at (0,0) size ${RUN}x1200 dir up`,
      `  stair at (0,0) size 1200x${RUN} dir down width 600`,
      `  escalator at (0,0) size ${RUN}x1200 dir up`,
      `  escalator at (0,0) size 1200x${RUN} dir down`,
      "  fence panel { (0,0) (300000,0) (300000,300000) (0,300000) close }",
      "  fence picket { (0,0) (300000,0) (300000,1000) (600000,1000) }",
      "  fence post { (0,0) (100,0) }",
      "  outdoor lawn at (0,0) size 300000x2000",
      "  outdoor deck at (0,0) size 2000x300000",
      "  outdoor driveway at (0,0) size 300000x300000",
      "  elevator at (0,0) size 2200x2200",
      "  column at (0,0) size 600x600",
      "  void at (0,0) size 2000x2000",
      '  room at (0,0) size 3000x2000 label "Living"',
      '  room polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "L"',
      "  room circle at (0,0) radius 5000",
      "  dim (0,0)->(300000,0) offset 600",
      "  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room at (0,0) size 6000x4000\n" +
        "  door at (3000,0) width 900 wall exterior hinge left swing in\n  window at (0,2000) width 1200 wall exterior\n" +
        "  opening at (6000,2000) width 900 wall exterior\n  dims auto\n  roof overhang 600",
      "  wall exterior thickness 200 { (0,0) arc (6000,0) radius 3000 (6000,4000) (0,4000) close }",
    ];
    for (const s of shapes) {
      const { estimate, drawn, errors } = estimateAndDrawn(plan(s));
      // Not vacuous: each shape compiles and is drawn.
      expect(errors, s).toEqual([]);
      expect(drawn, s).toBeGreaterThan(0);
      expect(drawn, s).toBeLessThanOrEqual(estimate);
    }
  }, 60_000);

  it("every corpus plan draws no more than its estimate, and sits far below the budget", () => {
    const worldFor = (dir: string): World => ({
      read: (p) => {
        try {
          return readFileSync(resolvePath(dir, p), "utf8");
        } catch {
          return null;
        }
      },
    });
    const walk = (dir: string): string[] =>
      readdirSync(dir)
        .sort()
        .flatMap((f) => {
          const p = join(dir, f);
          return statSync(p).isDirectory() ? walk(p) : f.endsWith(".arch") ? [p] : [];
        });
    let max = 0;
    let n = 0;
    for (const d of [
      "examples",
      "test/fixtures",
      "test/recovery-corpus",
      "eval/goldens",
      "eval/faults",
      "eval/fidelity-plans",
    ])
      for (const p of walk(join(ROOT, d))) {
        const { estimate, drawn, errors } = estimateAndDrawn(readFileSync(p, "utf8"), worldFor(dirname(p)));
        expect(errors, p).not.toContain("E_DRAWING_LIMIT");
        expect(drawn, p).toBeLessThanOrEqual(estimate);
        max = Math.max(max, estimate);
        n++;
      }
    expect(n).toBeGreaterThan(80);
    // Far below it: the largest shipped plan is estimated at under a thirtieth of the budget.
    expect(max * 30).toBeLessThanOrEqual(MAX_DRAW_UNITS);
  }, 300_000);
});

suite("the prose quotes the budget it describes", () => {
  const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  it("the catalogue entry and the language reference name MAX_DRAW_UNITS", () => {
    expect(ERROR_CATALOG.E_DRAWING_LIMIT!.cause).toContain(grouped(MAX_DRAW_UNITS));
    expect(readFileSync(join(ROOT, "docs/language-reference.md"), "utf8")).toContain(`past ${grouped(MAX_DRAW_UNITS)}`);
  });
});
