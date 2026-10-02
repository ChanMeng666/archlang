/**
 * The evaluation-step budget (`MAX_EVAL_STEPS`, `src/expr.ts`): one deterministic counter
 * across a whole resolution, every storey, instance, call and loop iteration. Past it the
 * resolution stops with ONE `E_STEP_LIMIT` at the statement that crossed it, never a hang
 * and never a throw.
 *
 * Every case under "the shapes that used to run away" failed before the budget: the nested
 * loops and the branching recursion were still running after 40 s (killed), and the doubling
 * strings threw `RangeError: Invalid string length` out of `compile()`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import * as A from "../src/index.js";
import { compile, describe, ERROR_CATALOG, lint, makeVirtualWorld } from "../src/index.js";
import { MAX_EVAL_STEPS } from "../src/expr.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { extractArchBlocks } from "../src/markdown.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");
const plan = (body: string, head = ""): string => `plan "P" {\n  units mm\n${head}${body}\n}\n`;
const ROOM = "  room id=a at (0,0) size 3000x3000";

/** The steps a source's whole resolution spends (every storey). */
function stepsOf(src: string, world: World = NULL_WORLD): number {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const linked = link(ast, world, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, world));
}

/** compile()'s diagnostics, checked never to throw; describe() and lint() must not throw either. */
function codes(src: string, world?: World): string[] {
  const r = compile(src, { noCache: true, ...(world ? { world } : {}) });
  expect(() => describe(src, world ? { world } : {})).not.toThrow();
  expect(() => lint(src, world ? { world } : {})).not.toThrow();
  return r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>");
}

const count = (xs: string[], c: string): number => xs.filter((x) => x === c).length;

suite("the shapes that used to run away", () => {
  it("M.2's repro: two nested `for` loops of 10^8 iterations stop with ONE E_STEP_LIMIT (was: > 40 s)", () => {
    const src = plan(`${ROOM}\n  for i in 0..100000 { for j in 0..1000 { let x = i } }`);
    const r = compile(src, { noCache: true });
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_STEP_LIMIT"]);
    expect(r.svg).toBe("");
    // At the statement that crossed the budget: the inner body's `let`, or one of the loops.
    const at = src.slice(errs[0]!.span!.start, errs[0]!.span!.end);
    expect(at).toMatch(/^(let x = i|for j in 0\.\.1000 \{ let x = i \}|for i in 0\.\.100000)/);
    expect(errs[0]!.message).toContain(String(MAX_EVAL_STEPS));
  }, 60_000);

  it("three nested capped `while`s (10^12 iterations) stop with ONE E_STEP_LIMIT", () => {
    const body =
      "  let a = 0\n  while a < 100000 {\n    a = a + 1\n    let b = 0\n    while b < 100000 {\n" +
      "      b = b + 1\n      let c = 0\n      while c < 100000 { c = c + 1 }\n    }\n  }";
    const cs = codes(plan(`${ROOM}\n${body}`));
    expect(count(cs, "E_STEP_LIMIT")).toBe(1);
    // Every other error is the innermost loop's own cap, raised before the budget ran out.
    expect(cs.filter((c) => c !== "E_STEP_LIMIT" && c !== "E_WHILE_LIMIT")).toEqual([]);
  }, 60_000);

  it("recursion that calls itself twice (2^40 calls) stops with ONE E_STEP_LIMIT", () => {
    const src = plan(`${ROOM}\n  let f(n) = if n < 2 { 1 } else { f(n - 1) + f(n - 2) }\n  let x = f(40)`);
    expect(codes(src)).toEqual(["E_STEP_LIMIT"]);
  }, 60_000);

  it("a doubling string is E_STEP_LIMIT (was: RangeError: Invalid string length thrown by compile())", () => {
    const src = plan(`${ROOM}\n  let s = "xx"\n  let k = 0\n  while k < 40 {\n    s = "{s}{s}"\n    k = k + 1\n  }`);
    expect(codes(src)).toEqual(["E_STEP_LIMIT"]);
    // The same doubling printed into 1000 labels: the labels' characters are charged too.
    const labels = plan(
      `${ROOM}\n  let s = "xxxxxxxxxxxxxxxx"\n  let k = 0\n  while k < 16 {\n    s = "{s}{s}"\n    k = k + 1\n  }\n` +
        '  for i in 0..1000 { room at (i * 4000, 10000) size 3000x3000 label "{s}" }',
    );
    expect(codes(labels)).toEqual(["E_STEP_LIMIT"]);
  }, 60_000);

  it("24 storeys of capped loops stop: each storey's own caps, and the budget across them", () => {
    const levels = Array.from(
      { length: 24 },
      (_, k) => `  level ${k} {\n    for i in 0..100000 { column at (i * 1000, 0) size 600x600 }\n  }`,
    ).join("\n");
    const cs = codes(plan(levels));
    // Every storey that was evaluated hit its element cap; the plan is refused either way.
    expect(cs.length).toBeGreaterThan(0);
    expect(cs.every((c) => ["E_ELEMENT_LIMIT", "E_STEP_LIMIT", "E_DRAWING_LIMIT"].includes(c))).toBe(true);
  }, 60_000);
});

suite("a string is charged before it is built, on every public surface", () => {
  // A 1 Mi-character string (16 doublings of 16 characters), referenced N times in an array,
  // then printed: printing allocates N Mi characters. Charged after building, 1,100
  // references threw `RangeError: Invalid string length` out of every API below in 25 ms,
  // and 500 held 530 MB before the budget noticed.
  const doubled = `  let s = "xxxxxxxxxxxxxxxx"\n  let k = 0\n  while k < 16 {\n    s = "{s}{s}"\n    k = k + 1\n  }`;
  const arrstr = (n: number): string =>
    plan(
      `${ROOM}\n${doubled}\n  let a = [${Array.from({ length: n }, () => "s").join(", ")}]\n  let t = str(a)\n  let u = "{t}"`,
    );
  const sources: Record<string, string> = {
    "an array of 1,100 references to a 1 Mi-character string, printed": arrstr(1100),
    "the same array interpolated straight into a label": plan(
      `${ROOM}\n${doubled}\n  let a = [${Array.from({ length: 1100 }, () => "s").join(", ")}]\n  room at (4000,0) size 3000x3000 label "{a}"`,
    ),
    "an array nested in itself 40 times, printed": plan(
      `${ROOM}\n  let a = [1, 2]\n  let k = 0\n  while k < 40 {\n    a = [a, a]\n    k = k + 1\n  }\n  let t = str(a)`,
    ),
    "a 1 Mi-character string compared with itself in a loop": plan(
      `${ROOM}\n${doubled}\n  let t = "{s}"\n  for i in 0..100000 { let e = s == t }`,
    ),
    "an unknown name in M.2's nested loops (a hint per iteration)": plan(
      `${ROOM}\n  for i in 0..100000 { for j in 0..1000 { let x = nope } }`,
    ),
    "a recursion that calls itself twice, in the plan height": plan(
      ROOM,
      "  let f(n) = if n < 2 { 1 } else { f(n - 1) + f(n - 2) }\n  height f(40)\n",
    ),
  };
  // Every public entry point that resolves a source. None may throw, and the ones that report
  // diagnostics report E_STEP_LIMIT.
  const calls: Record<string, (s: string) => unknown> = {
    compile: (s) => A.compile(s, { noCache: true }),
    compileTheme: (s) => A.compile(s, { noCache: true, theme: { lineWeight: 1e308 } }),
    compileOverlay: (s) => A.compile(s, { noCache: true, overlays: ["circulation"] }),
    describe: (s) => A.describe(s),
    lint: (s) => A.lint(s),
    repair: (s) => A.repair(s),
    format: (s) => A.format(s),
    suggestTopology: (s) => A.suggestTopology(s),
    diffPlans: (s) => A.diffPlans(s, s.replace("3000x3000", "3000x3001")),
    reroll: (s) => A.reroll(s),
    hover: (s) => {
      for (let o = 0; o < s.length; o += 29) A.hover(s, o);
    },
    completion: (s) => {
      for (let o = 0; o < s.length; o += 31) A.completion(s, o);
    },
    definition: (s) => {
      for (let o = 0; o < s.length; o += 37) A.definition(s, o);
    },
    signatureHelp: (s) => {
      for (let o = 0; o < s.length; o += 41) A.signatureHelp(s, o);
    },
    codeActions: (s) => A.codeActions(s, { start: 0, end: s.length }),
    refactorActions: (s) => A.refactorActions(s, { start: 0, end: s.length }),
    resolve: (s) => {
      const r = A.compile(s, { noCache: true });
      if (r.ast) A.resolve(r.ast);
    },
    astToJson: (s) => {
      const r = A.compile(s, { noCache: true });
      if (r.ast) A.astToJson(r.ast);
    },
  };
  for (const [name, src] of Object.entries(sources)) {
    it(`${name}: no API throws, and compile() reports E_STEP_LIMIT`, () => {
      for (const [api, call] of Object.entries(calls)) {
        expect(() => call(src), api).not.toThrow();
      }
      const errs = A.compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
      expect(errs.map((d) => d.code)).toContain("E_STEP_LIMIT");
      expect(errs.filter((d) => d.code === "E_STEP_LIMIT")).toHaveLength(1);
    }, 120_000);
  }

  it("the heap a refused string plan holds stays small (500 and 1,100 references)", () => {
    for (const n of [500, 1100]) {
      const before = process.memoryUsage().heapUsed;
      const r = A.compile(arrstr(n), { noCache: true });
      const grown = process.memoryUsage().heapUsed - before;
      expect(r.diagnostics.map((d) => d.code)).toContain("E_STEP_LIMIT");
      // Generous for GC timing; before the fix 500 references held 530 MB.
      expect(grown).toBeLessThan(100 * 1024 * 1024);
    }
  }, 120_000);
});

suite("one counter across the whole resolution", () => {
  // A loop whose step cost is linear in its iterations, split into chunks because a range
  // holds at most 100,000 items. The model is MEASURED from the evaluator (a plan, one more
  // chunk, one more thousand iterations), never retyped, and checked before it is used.
  const loop = (n: number): string => `    for i in 0..${n} { let x = i + 1 }`;
  const chunked = (n: number): string => {
    const out: string[] = [];
    for (let left = n; left > 0; left -= 100_000) out.push(loop(Math.min(left, 100_000)));
    return out.join("\n");
  };
  const src = (n: number): string => plan(`${ROOM}\n${chunked(n)}`);
  const p = (stepsOf(src(2000)) - stepsOf(src(1000))) / 1000;
  const perChunk = stepsOf(plan(`${ROOM}\n${loop(1000)}\n${loop(1000)}`)) - stepsOf(src(1000)) - 1000 * p;
  const base = stepsOf(src(1000)) - perChunk - 1000 * p;
  const model = (n: number): number => base + Math.ceil(n / 100_000) * perChunk + n * p;

  it("the step model of a chunked loop is exact (so the boundary below is where it says)", () => {
    expect(Number.isInteger(p) && p > 0).toBe(true);
    for (const n of [3000, 100_000, 150_000]) expect(stepsOf(src(n))).toBe(model(n));
  });

  it("a plan just under the budget compiles; ten iterations more is E_STEP_LIMIT", () => {
    let under = Math.floor((MAX_EVAL_STEPS - base) / p);
    while (model(under) > MAX_EVAL_STEPS) under--;
    expect(MAX_EVAL_STEPS - model(under)).toBeLessThan(perChunk + 2 * p);
    expect(stepsOf(src(under))).toBe(model(under));
    expect(codes(src(under))).toEqual([]);
    expect(codes(src(under + 10))).toEqual(["E_STEP_LIMIT"]);
  }, 60_000);

  it("storeys share it: two storeys that each fit alone cross it together, once, on the upper storey", () => {
    const n = Math.floor((MAX_EVAL_STEPS * 0.6) / p);
    expect(codes(src(n))).toEqual([]);
    const two = plan(`  level 0 {\n${ROOM}\n${chunked(n)}\n  }\n  level 1 {\n${ROOM}\n${chunked(n)}\n  }`);
    const r = compile(two, { noCache: true });
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_STEP_LIMIT"]);
    expect(errs[0]!.level).toBe(1);
    // Deterministic whatever the caches hold: the storey below is memoised by now.
    const again = compile(two, { noCache: true });
    expect(JSON.stringify(again.diagnostics)).toBe(JSON.stringify(r.diagnostics));
    clearResolveCache();
    expect(JSON.stringify(compile(two, { noCache: true }).diagnostics)).toBe(JSON.stringify(r.diagnostics));
  }, 120_000);

  it("a component's body is counted, and the report carries the file it was written in", () => {
    const lib =
      'plan "lib" {\n  units mm\n  component spin() {\n    for i in 0..100000 { for j in 0..1000 { let x = i } }\n  }\n}\n';
    const world = makeVirtualWorld({ "lib.arch": lib });
    const src = plan(`${ROOM}\n  spin()`, '  import "lib.arch": spin\n');
    const r = compile(src, { noCache: true, world });
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_STEP_LIMIT"]);
    expect(errs[0]!.file).toBe("lib.arch");
    expect(lib.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toMatch(/^(let x = i|for )/);
  }, 60_000);
});

// ---- the corpus the bound was set against ------------------------------------------------

/** Every `.arch` file of the corpus, and every ```arch fence of every Markdown page. */
function corpus(): { name: string; src: string; world: World }[] {
  const out: { name: string; src: string; world: World }[] = [];
  const worldFor = (dir: string): World => ({
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
  });
  const walk = (dir: string, keep: (f: string) => boolean): string[] => {
    const files: string[] = [];
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) files.push(...walk(p, keep));
      else if (keep(f)) files.push(p);
    }
    return files;
  };
  for (const d of [
    "examples",
    "test/fixtures",
    "test/recovery-corpus",
    "eval/goldens",
    "eval/faults",
    "eval/fidelity-plans",
  ])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      out.push({ name: p, src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md)
    for (const b of extractArchBlocks(readFileSync(p, "utf8")))
      out.push({ name: `${p}#${b.index}`, src: b.source, world: NULL_WORLD });
  return out;
}

suite("the bound against the corpus", () => {
  it("every plan that compiles clean spends at most 1/100 of the budget; every error demo at most 1/10", () => {
    let cleanMax = 0;
    let demoMax = 0;
    let n = 0;
    for (const c of corpus()) {
      const steps = stepsOf(c.src, c.world);
      const errs = compile(c.src, { noCache: true, world: c.world }).diagnostics.filter((d) => d.severity === "error");
      // The one fence that MUST cross it is the budget's own catalogue demo.
      if (c.src.includes(ERROR_CATALOG.E_STEP_LIMIT!.example)) continue;
      expect(
        errs.map((d) => d.code),
        c.name,
      ).not.toContain("E_STEP_LIMIT");
      if (errs.length === 0) cleanMax = Math.max(cleanMax, steps);
      else demoMax = Math.max(demoMax, steps);
      n++;
    }
    // Not vacuous: the corpus is there and it was measured.
    expect(n).toBeGreaterThan(200);
    expect(cleanMax).toBeGreaterThan(1000);
    // The documented margins (`MAX_EVAL_STEPS`): at least 100x over every plan that compiles,
    // and the catalogue's demos of the other caps (a `while` at its 10,000 iterations, a
    // range at its 100,000 items) still reach their OWN cap first, with 10x to spare.
    expect(cleanMax * 100).toBeLessThanOrEqual(MAX_EVAL_STEPS);
    expect(demoMax * 10).toBeLessThanOrEqual(MAX_EVAL_STEPS);
  }, 300_000);
});

suite("the prose quotes the bound it describes", () => {
  const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  it("the catalogue entry and the language reference name MAX_EVAL_STEPS", () => {
    expect(ERROR_CATALOG.E_STEP_LIMIT!.cause).toContain(grouped(MAX_EVAL_STEPS));
    expect(readFileSync(join(ROOT, "docs/language-reference.md"), "utf8")).toContain(
      `${grouped(MAX_EVAL_STEPS)} steps`,
    );
  });
});
