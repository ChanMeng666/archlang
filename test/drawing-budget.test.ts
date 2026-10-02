/**
 * The drawing budget (`MAX_DRAW_UNITS`, `src/draw-budget.ts`): before anything is drawn,
 * `compile()` estimates the primitives every storey will draw, kind by kind, and a plan past
 * the budget is ONE `E_DRAWING_LIMIT` at the element that crossed it.
 *
 * Elements are capped at 5,000 per storey and a run at 1,100 treads, but those caps multiply:
 * 500 escalators at the tread cap took 0.82 GB of heap and drew 105 MB of SVG. They are refused
 * here before `toScene()` runs.
 *
 * The estimate is only a budget if it is an UPPER bound, and only fair if it is a TIGHT one
 * (a loose bound refuses real buildings: a 24-storey tower of 200 flats a floor draws 29,352
 * primitives and must compile). So the suite holds it from both sides: for every kind's
 * shapes, every fixture category and every corpus plan the primitives drawn never exceed the
 * estimate, and over the corpus the estimate's primitive part is at most four times them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, ERROR_CATALOG, lint } from "../src/index.js";
import { DEFAULT_DRAW_COST, drawUnits, MAX_DRAW_UNITS, storeyPassUnits } from "../src/draw-budget.js";
import { resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { MAX_RUN_TREADS, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");
const plan = (body: string, head = ""): string => `plan "P" {\n  units mm\n${head}${body}\n}\n`;
const levels = (n: number, body: string): string =>
  plan(Array.from({ length: n }, (_, k) => `  level ${k} {\n${body}\n  }`).join("\n"));
const RUN = MAX_RUN_TREADS * TREAD_GOING_MM; // a run exactly at the tread cap

interface Measure {
  /** The budget's estimate over every storey. */
  estimate: number;
  /** Its primitive part: the estimate less the one unit per `bounds()` point. */
  primitives: number;
  /** Primitives compile() drew, over every page. */
  drawn: number;
  errors: string[];
}

function measure(src: string, world: World = NULL_WORLD): Measure {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  const linked = link(ast!, world, BUILTIN_REGISTRY);
  const res = resolveAll(linked.plan, BUILTIN_REGISTRY, world);
  const storeys = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
  let estimate = 0;
  let points = 0;
  for (const s of storeys) {
    for (const el of s.elements) {
      estimate += drawUnits(el, BUILTIN_REGISTRY);
      points += BUILTIN_REGISTRY.byKind.get(el.kind)?.bounds(el).length ?? 0;
    }
    estimate += storeyPassUnits(s, BUILTIN_REGISTRY);
  }
  const r = compile(src, { noCache: true, world });
  const scenes = r.pages ? r.pages.map((p) => p.scene) : r.scene ? [r.scene] : [];
  const drawn = scenes.reduce((n, s) => n + s.nodes.length, 0);
  const errors = r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>");
  return { estimate, primitives: estimate - points, drawn, errors };
}

const escalators = (n: number): string =>
  plan(`  for i in 0..${n} { escalator at (0, 10000 + i * 2000) size ${RUN}x1200 dir up }`);

/** The 24-storey tower the red team built: 200 flats a floor, each a component. */
function tower(storeys: number, withWalls: boolean): string {
  const unit = `  component flat(x, y, n) {
    room at (x, y) size 4000x5000 label "Flat {n}"${withWalls ? "\n    wall interior thickness 100 { (x, y) (x + 4000, y) }\n    door at (x + 2000, y) width 900" : ""}
  }\n`;
  const body =
    "    for i in 0..20 {\n      for j in 0..10 {\n        flat(i * 4000, j * 5000, i * 10 + j)\n      }\n    }\n" +
    "    for i in 0..21 { column at (i * 4000 - 150, -2000) size 300x300 }";
  return plan(Array.from({ length: storeys }, (_, k) => `  level ${k} {\n${body}\n  }`).join("\n"), unit);
}

suite("the drawings that used to exhaust memory are refused before they are drawn", () => {
  it("500 escalators at the tread cap: one E_DRAWING_LIMIT, nothing drawn (was: 0.82 GB, 105 MB of SVG)", () => {
    const src = escalators(500);
    const before = process.memoryUsage().heapUsed;
    const r = compile(src, { noCache: true });
    const grown = process.memoryUsage().heapUsed - before;
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_DRAWING_LIMIT"]);
    expect(r.svg).toBe("");
    expect(r.scene).toBeUndefined();
    // Refused before the drawing, so the heap barely moves (a generous bound: GC timing varies).
    expect(grown).toBeLessThan(200 * 1024 * 1024);
    expect(src.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toMatch(/^escalator at/);
    expect(errs[0]!.message).toContain(`budget of ${MAX_DRAW_UNITS}`);
  }, 60_000);

  it("the budget is one total over every storey: two storeys that each fit alone are refused together", () => {
    const per = measure(plan("  furniture upper_cabinet at (0, 0) size 300000x600")).estimate;
    const n = Math.floor((MAX_DRAW_UNITS * 0.6) / per);
    const storey = `    for i in 0..${n} { furniture upper_cabinet at (0, 10000 + i * 1000) size 300000x600 }`;
    const alone = measure(plan(storey));
    expect(alone.errors).toEqual([]);
    const r = compile(levels(2, storey), { noCache: true });
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => [d.code, d.level])).toEqual([["E_DRAWING_LIMIT", 1]]);
    expect(r.pages ?? []).toEqual([]);
  }, 60_000);

  it("a plan just under the budget draws; one element more is refused", () => {
    const per = measure(escalators(1)).estimate;
    const n = Math.floor(MAX_DRAW_UNITS / per);
    const under = measure(escalators(n));
    expect(under.estimate).toBeLessThanOrEqual(MAX_DRAW_UNITS);
    expect(under.errors).toEqual([]);
    expect(under.drawn).toBeGreaterThan(0);
    expect(measure(escalators(n + 1)).errors).toEqual(["E_DRAWING_LIMIT"]);
  }, 60_000);

  it("an over-long run is E_RUN_TOO_LONG alone: its estimate is held at the tread cap", () => {
    const r = compile(plan(`  escalator id=e at (0,0) size ${40 * RUN}x1200 dir up`), { noCache: true });
    expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["E_RUN_TOO_LONG"]);
  });

  it("describe() and lint() draw nothing and are not held by it", () => {
    const src = escalators(500);
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).toEqual(["E_DRAWING_LIMIT"]);
    expect(JSON.stringify(describe(src))).not.toContain("E_DRAWING_LIMIT");
    expect(lint(src).map((d) => d.code)).not.toContain("E_DRAWING_LIMIT");
  }, 60_000);
});

suite("real buildings compile (the red team's tower, a long two-storey block)", () => {
  // Each was refused while every element cost a flat 72: the 24 x 200 tower was estimated at
  // 1,132,704 for 29,352 primitives drawn.
  const cases: Record<string, string> = {
    "24 storeys x 200 flats with a wall and a door each": tower(24, true),
    "24 storeys x 200 flats, rooms only": tower(24, false),
    "6 storeys x 200 flats with a wall and a door each": tower(6, true),
    "two storeys of 3,000 rooms": levels(2, "    for i in 0..3000 { room at (i * 4000, 0) size 3000x3000 }"),
  };
  for (const [name, src] of Object.entries(cases)) {
    it(name, () => {
      const m = measure(src);
      expect(m.errors).toEqual([]);
      expect(m.drawn).toBeGreaterThan(0);
      expect(m.estimate).toBeLessThanOrEqual(MAX_DRAW_UNITS);
      expect(m.drawn).toBeLessThanOrEqual(m.primitives);
    }, 120_000);
  }

  it("24 storeys of 5,000 rooms is past it (about 0.8 million units, minutes of label placement)", () => {
    const src = levels(
      24,
      "    for i in 0..4999 { room at ((i % 70) * 4000, (i - i % 70) / 70 * 4000) size 3000x3000 }",
    );
    const r = compile(src, { noCache: true });
    expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["E_DRAWING_LIMIT"]);
  }, 120_000);
});

suite("the estimate is an upper bound on what is drawn", () => {
  it("every fixture category, at every aspect and size, draws no more than its estimate", () => {
    const sizes = ["300x300", "600x600", "2000x600", "600x2000", "30000x600", "600x30000", "300000x600", "600x300000"];
    let worst = 0;
    for (const c of FIXTURE_CATEGORIES)
      for (const s of sizes)
        for (const rot of ["", " rotate 90"]) {
          const { primitives, drawn } = measure(plan(`  furniture ${c} at (0,0) size ${s}${rot}`));
          expect(drawn, `${c} ${s}${rot}`).toBeLessThanOrEqual(primitives);
          worst = Math.max(worst, drawn);
        }
    // A kind with no drawCost (a plugin's) is estimated at DEFAULT_DRAW_COST: every glyph fits.
    expect(worst).toBeLessThanOrEqual(DEFAULT_DRAW_COST);
    expect(worst).toBeGreaterThan(DEFAULT_DRAW_COST / 2);
  }, 120_000);

  it("a fixture's count does not depend on the sheet it is drawn on", () => {
    for (const head of ["", "  paper A4\n", "  paper A0\n  scale 1:500\n"]) {
      for (const c of ["upper_cabinet", "hedge", "dining_table", "rug"]) {
        const { primitives, drawn } = measure(plan(`  furniture ${c} at (0,0) size 30000x600`, head));
        expect(drawn, `${c} ${head}`).toBeLessThanOrEqual(primitives);
      }
    }
  }, 60_000);

  it("every other kind's shapes and every plan-wide pass draw no more than their estimate", () => {
    const shell =
      "  wall id=w exterior thickness 200 { (0,0) (9000,0) (9000,6000) (0,6000) close }\n  room id=r at (0,0) size 9000x6000";
    const shapes = [
      `  stair at (0,0) size ${RUN}x1200 dir up`,
      `  stair at (0,0) size 1200x${RUN} dir down width 600`,
      "  stair at (0,0) size 100x100 dir up",
      `  escalator at (0,0) size ${RUN}x1200 dir up`,
      `  escalator at (0,0) size 1200x${RUN} dir down`,
      "  escalator at (0,0) size 100x100 dir up",
      "  fence panel { (0,0) (300000,0) (300000,300000) (0,300000) close }",
      "  fence picket { (0,0) (300000,0) (300000,1000) (600000,1000) }",
      "  fence post { (0,0) (100,0) }",
      '  outdoor lawn at (0,0) size 300000x2000 label "Lawn"',
      "  outdoor deck at (0,0) size 2000x300000",
      "  outdoor balcony at (0,0) size 300000x3000",
      "  outdoor balcony at (0,0) size 3000x3000 rail top left",
      "  elevator at (0,0) size 2200x2200",
      "  column at (0,0) size 600x600",
      "  void at (0,0) size 2000x2000",
      '  room at (0,0) size 3000x2000 label "Living"',
      "  room at (0,0) size 3000x2000",
      '  room polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "L"',
      '  room circle at (0,0) radius 5000 label "Drum"',
      "  dim (0,0)->(300000,0) offset 600",
      "  dim (0,0)->(300000,0) offset 0",
      `${shell}\n  door at (3000,0) width 900 wall w hinge left swing in`,
      `${shell}\n  door id=d1 sliding on w at 3000 width 1800 slide left`,
      `${shell}\n  door id=d2 pocket on w at 3000 width 900 slide right`,
      `${shell}\n  door id=d3 bifold on w at 3000 width 900`,
      `${shell}\n  door id=d4 barn on w at 3000 width 900 slide left`,
      `${shell}\n  door id=d5 garage on w at 4500 width 3000`,
      `${shell}\n  window on w at 4500 width 1200`,
      `${shell}\n  opening on w at 4500 width 1200`,
      `${shell}\n  roof overhang 600`,
      `${shell}\n  door at (3000,0) width 900 wall w\n  window on w at 20% width 1200\n  window on w at 70% width 1200\n  dims auto`,
      `${shell}\n  room id=r2 at (0,0) size 4000x6000\n  window on w at 20% width 1200\n  dims auto all`,
      `  wall exterior thickness 200 { (0,0) arc (6000,0) radius 3000 (6000,4000) (0,4000) close }\n  room circle at (20000,0) radius 3000\n  dims auto all`,
      `${shell}\n  furniture bed at (300,300) size 1500x2000\n  furniture upper_cabinet at (300,4000) size 3000x400\n  schedule rooms\n  legend`,
      `${shell}\n  zone a "A" { room id=z1 at (0,0) size 3000x3000 }\n  zone b "B" { room id=z2 at (3000,0) size 3000x3000 }\n  schedule rooms`,
    ];
    for (const s of shapes) {
      const { primitives, drawn, errors } = measure(plan(s));
      // Not vacuous: each shape compiles and is drawn.
      expect(errors, s).toEqual([]);
      expect(drawn, s).toBeGreaterThan(0);
      expect(drawn, s).toBeLessThanOrEqual(primitives);
    }
    const sited = measure(
      plan(
        '  room id=r at (0,0) size 6000x6000 label "R"',
        "  axes { x at 0, 3000, 6000 y at 0, 6000 }\n  site { street south boundary (-5000,-5000) (20000,-5000) (20000,20000) (-5000,20000) }\n",
      ),
    );
    expect(sited.errors).toEqual([]);
    expect(sited.drawn).toBeLessThanOrEqual(sited.primitives);
  }, 120_000);

  it("over the corpus: never under what is drawn, never more than four times it, far below the budget", () => {
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
    let loosest = 0;
    for (const d of [
      "examples",
      "test/fixtures",
      "test/recovery-corpus",
      "eval/goldens",
      "eval/faults",
      "eval/fidelity-plans",
    ])
      for (const p of walk(join(ROOT, d))) {
        const m = measure(readFileSync(p, "utf8"), worldFor(dirname(p)));
        expect(m.errors, p).not.toContain("E_DRAWING_LIMIT");
        if (m.drawn === 0) continue; // a plan with an error draws nothing to compare against
        expect(m.drawn, p).toBeLessThanOrEqual(m.primitives);
        expect(m.primitives, p).toBeLessThanOrEqual(4 * m.drawn);
        loosest = Math.max(loosest, m.primitives / m.drawn);
        max = Math.max(max, m.estimate);
        n++;
      }
    expect(n).toBeGreaterThan(80);
    expect(loosest).toBeGreaterThan(1); // not vacuous: the bound is not simply what is drawn
    // Far below it: the largest shipped plan is estimated at under a tenth of the budget.
    expect(max * 10).toBeLessThanOrEqual(MAX_DRAW_UNITS);
  }, 300_000);
});

suite("the prose quotes the budget it describes", () => {
  const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  it("the catalogue entry and the language reference name MAX_DRAW_UNITS", () => {
    expect(ERROR_CATALOG.E_DRAWING_LIMIT!.cause).toContain(grouped(MAX_DRAW_UNITS));
    expect(readFileSync(join(ROOT, "docs/language-reference.md"), "utf8")).toContain(`past ${grouped(MAX_DRAW_UNITS)}`);
  });
});
