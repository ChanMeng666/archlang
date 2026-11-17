// RR.24: a dim carries its endpoint-swapped statement for `W_DIM_INSIDE`'s fix, printed whether or not
// the warning fires and as long as the statement's source. It goes through the shared reprint memo
// (`src/elements/reprint.ts`), so a looped dim prints it once per storey, not once per iteration
// (before, a loop of 5,000 dims with a 96 KB statement took 8.6 s and 1.8 GB, uncharged).
import { beforeEach, describe, expect, it, vi } from "vitest";

/** How many times the leaf printer re-prints a `dim` statement, counted at the module boundary. */
const calls = { dim: 0 };
vi.mock("../src/statement-print.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/statement-print.js")>();
  return {
    ...real,
    statementText: (...args: Parameters<typeof real.statementText>) => {
      if (args[0].kind === "dim") calls.dim++;
      return real.statementText(...args);
    },
  };
});

const { compile, lint, makeVirtualWorld } = await import("../src/index.js");
const { evaluationSteps, resolveAll } = await import("../src/ir.js");
const { link } = await import("../src/import.js");
const { parse } = await import("../src/parser.js");
const { BUILTIN_REGISTRY } = await import("../src/registry.js");

const WALL = "  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }";
const ROOM = '  room id=r at (0,0) size 12000x6000 label "Hall"';
const plan = (...body: string[]): string => ['plan "P" {', "  units mm", WALL, ROOM, ...body, "}"].join("\n");
const steps = (src: string): number => {
  const world = makeVirtualWorld({});
  const linked = link(parse(src, BUILTIN_REGISTRY).plan!, world, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, world));
};
const dead = (k: number): string => `max(${Array(k).fill("1").join(",")})`;

beforeEach(() => {
  calls.dim = 0;
});

describe("a dim's swap text is printed once per node per storey (RR.24)", () => {
  it("a looped dim prints it once, not once per iteration", () => {
    compile(plan("  for i in 0..300 { dim (0,1000)->(3000 + i,1000) offset 300 }"), { noCache: true });
    expect(calls.dim).toBe(1);
  });

  it("a component placed by three storeys prints it once per storey", () => {
    const src = [
      'plan "P" {',
      "  units mm",
      `  component c() {\n${WALL}\n    dim (0,1000)->(3000,1000) offset 300\n  }`,
      ...[1, 2, 3].map((k) => `  level ${k} "L${k}" { place c() as p${k} at (0,0) }`),
      "}",
    ].join("\n");
    compile(src, { noCache: true });
    expect(calls.dim).toBe(3);
  });

  // The memo adds no charge (a ctx never rebuilds the text), so the step payload does not move:
  // a looped dim's steps do not grow with the length of a dead branch it never evaluates.
  it("adds no step charge: the steps are the same at any statement length", () => {
    const loop = (k: number): string =>
      plan(`  for i in 0..300 { dim (0,1000)->(if i < 0 { ${dead(k)} } else { 3000 + i },1000) offset 300 }`);
    expect(steps(loop(12000))).toBe(steps(loop(1)));
  });

  // The looped dim still carries the fix: the W_DIM_INSIDE edit is the memoised swapped text.
  it("a looped dim that reads inside still carries the swapped statement as its fix", () => {
    const src = plan("  for i in 0..3 { dim (4000 + i * 1000,6000)->(0,6000) offset 500 }");
    const ds = lint(src).filter((d) => d.code === "W_DIM_INSIDE");
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d.fixes?.[0]?.edits[0]?.newText).toBe("dim (0, 6000)->(4000 + i * 1000, 6000) offset 500");
    }
  });
});
