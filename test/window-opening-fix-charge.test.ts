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
