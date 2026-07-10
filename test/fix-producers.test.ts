import { describe, expect, it } from "vitest";
import { applyFixes, compile, describe as describePlan } from "../src/index.js";

/**
 * Fix producers (T2c): the syntactic suggestions a compile attaches to specific
 * diagnostics. Each test drives the full loop an agent / `arch fix` uses — read the
 * `diagnostics[].fixes`, apply via `applyFixes`, recompile — and asserts the result
 * is diagnostic-free with the intended geometry. Machine-applicable producers are
 * held to the boundary law: the applied edit must compile to the intended plan.
 */

const shell = (door: string): string => `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Room"
  ${door}
}`;

describe("off-wall opening fix (W_*_OFF_WALL → attachment form)", () => {
  it("rewrites a floating door onto its nearest wall (machine-applicable) and the applied plan hosts it", () => {
    const src = shell("door id=d at (2500,9000) width 900 wall exterior hinge left swing in");
    const diag = compile(src).diagnostics.find((d) => d.code === "W_DOOR_OFF_WALL");
    expect(diag).toBeDefined();
    const fixes = diag!.fixes!;
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.applicability).toBe("machine-applicable");
    // The rewrite pins the door to wall w1 at the projected position (63.889%).
    expect(fixes[0]!.edits[0]!.newText).toBe("door id=d on w1 at 63.889% width 900 hinge left swing in");

    const applied = applyFixes(src, fixes).output;
    const r2 = compile(applied);
    // No residual off-wall warning (the door now has a host).
    expect(r2.diagnostics.map((d) => d.code)).not.toContain("W_DOOR_OFF_WALL");
    const d = describePlan(applied).doors.find((x) => x.id === "d")!;
    expect(d.between).toEqual(["exterior", "r"]);

    // Golden: the applied plan is byte-identical to the equivalent hand-attached door.
    const hand = shell("door id=d on w1 at 63.889% width 900 hinge left swing in");
    expect(compile(applied).svg).toBe(compile(hand).svg);
  });

  it("applies to windows and openings too", () => {
    for (const [kw, code] of [
      ["window", "W_WINDOW_OFF_WALL"],
      ["opening", "W_OPENING_OFF_WALL"],
    ] as const) {
      const src = shell(`${kw} id=x at (2500,9000) width 1000`);
      const diag = compile(src).diagnostics.find((d) => d.code === code)!;
      expect(diag.fixes![0]!.applicability).toBe("machine-applicable");
      const applied = applyFixes(src, diag.fixes!).output;
      expect(applied).toContain(`${kw} id=x on w1 at`);
      expect(compile(applied).diagnostics.map((d) => d.code)).not.toContain(code);
    }
  });
});

describe("opening width fix (E_*_WIDTH → has-placeholders)", () => {
  it("suggests a placeholder width that is never auto-applied", () => {
    const src = shell("door id=d at (2500,0) width 0 wall exterior");
    const diag = compile(src).diagnostics.find((d) => d.code === "E_DOOR_WIDTH")!;
    expect(diag.fixes![0]!.applicability).toBe("has-placeholders");
    expect(diag.fixes![0]!.edits[0]!.newText).toContain("width <positive-number>");
    // has-placeholders is refused by applyFixes at every gate.
    expect(applyFixes(src, diag.fixes!).applied).toHaveLength(0);
    expect(applyFixes(src, diag.fixes!, { maxApplicability: "maybe-incorrect" }).applied).toHaveLength(0);
    expect(applyFixes(src, diag.fixes!).output).toBe(src);
  });
});

describe("attach-position clamp fix (E_ATTACH_POS_RANGE → machine-applicable)", () => {
  it("clamps an out-of-range percent to the wall endpoint and the applied plan compiles", () => {
    const src = shell("door id=d on w1 at 150% width 900");
    const diag = compile(src).diagnostics.find((d) => d.code === "E_ATTACH_POS_RANGE")!;
    expect(diag.fixes![0]!.applicability).toBe("machine-applicable");
    const applied = applyFixes(src, diag.fixes!).output;
    expect(applied).toContain("on w1 at 100%");
    expect(compile(applied).diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});
