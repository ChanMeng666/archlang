// RR.10: a window's or opening's fix re-prints the whole statement, so it is memoised per parse node
// and charged to the step meter after a node's first build, as RR.1 (#855) did for doors
// (`src/elements/reprint.ts`; the door's own tests are in test/doors.test.ts).
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const plan = (...body: string[]): string =>
  [
    'plan "P" {',
    "  units mm",
    "  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }",
    ...body,
    "}",
  ].join("\n");

describe.each(["window", "opening"] as const)("%s fixes (RR.10)", (kind) => {
  // Each off-wall statement at its own point re-prints a statement as long as its source, so a loop
  // of them with a long dead branch runs out of steps (it did not before RR.10).
  it("charges each re-printed off-wall fix to the step meter", () => {
    const dead = `max(${Array(12000).fill("1").join(",")})`;
    const src = plan(`  for i in 0..300 { ${kind} at (if i < 0 { ${dead} } else { 3000 + i }, 3000) width 900 }`);
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).toContain("E_STEP_LIMIT");
  });

  // The same loop at a short statement stays well inside the budget: the charge is the source length.
  it("a short looped off-wall statement stays within the step budget", () => {
    const src = plan(`  for i in 0..300 { ${kind} at (3000 + i, 3000) width 900 }`);
    const codes = compile(src, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("E_STEP_LIMIT");
    expect(codes).toContain(kind === "window" ? "W_WINDOW_OFF_WALL" : "W_OPENING_OFF_WALL");
  });

  // A looped width fix is the same text every iteration, so it is built once for the shared node.
  it("a looped statement shares one width fix across its iterations", () => {
    const code = kind === "window" ? "E_WINDOW_WIDTH" : "E_OPENING_WIDTH";
    const src = plan(`  for i in 0..3 { ${kind} at (3000 + i * 1000, 0) width 0 }`);
    const ds = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === code);
    expect(ds).toHaveLength(3);
    expect(ds[0]!.fixes).toBeDefined();
    expect(ds[1]!.fixes).toBe(ds[0]!.fixes);
    expect(ds[2]!.fixes).toBe(ds[0]!.fixes);
  });
});

// A component body's node is shared by every place, but the off-wall fix reads that place's walls
// (`ctx.walls` is reassigned per group), so the memo is scoped per wall set and each place gets its
// own fix (the door's twin is in test/doors.test.ts).
describe.each(["window", "opening"] as const)("%s off-wall fix in a component placed twice (RR.10)", (kind) => {
  const code = kind === "window" ? "W_WINDOW_OFF_WALL" : "W_OPENING_OFF_WALL";
  const mk = (body: string, places: string): string =>
    `plan "t" {\n  units mm\n  component c(w) {\n${body}\n  }\n${places}\n}`;
  const fixes = (src: string): [string | undefined, string | undefined][] =>
    compile(src, { noCache: true })
      .diagnostics.filter((d) => d.code === code)
      .map((d) => [d.fixes?.[0]?.applicability, d.fixes?.[0]?.title]);

  it("each place gets its own fix", () => {
    const one = `    wall id=a partition thickness 100 { (0,0) (w,0) }\n    ${kind} id=d at (500,400) width 900`;
    expect(fixes(mk(one, "  place c(1000) as p at (0,0)\n  place c(4000) as q at (0,5000)"))).toEqual([
      ["machine-applicable", `attach the ${kind} to wall "a" at 50%`],
      ["machine-applicable", `attach the ${kind} to wall "a" at 12.5%`],
    ]);
  });

  it("a tie in the second place keeps its fix maybe-incorrect", () => {
    const tie = [
      "    wall id=a partition thickness 100 { (0,0) (w,0) }",
      "    wall id=b partition thickness 100 { (w,0) (w,800) }",
      `    ${kind} id=d at (600,400) width 900`,
    ].join("\n");
    expect(fixes(mk(tie, "  place c(4000) as p at (0,0)\n  place c(1000) as q at (0,5000)"))).toEqual([
      ["machine-applicable", `attach the ${kind} to wall "a" at 15%`],
      ["maybe-incorrect", `attach the ${kind} to wall "a" at 60%`],
    ]);
  });
});

// A looped window's kind-clause fix is the same text every iteration, so it is built once.
it("a looped window shares one kind-clause fix across its iterations", () => {
  const src = [
    'plan "P" {',
    "  units mm",
    "  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }",
    "  for i in 0..3 { window fixed on shell at (20 + i * 10)% width 900 hinge left }",
    "}",
  ].join("\n");
  const ds = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "E_WINDOW_KIND_CLAUSE");
  expect(ds).toHaveLength(3);
  expect(ds[0]!.fixes).toBeDefined();
  expect(ds[1]!.fixes).toBe(ds[0]!.fixes);
  expect(ds[2]!.fixes).toBe(ds[0]!.fixes);
});
