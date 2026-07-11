import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import { l1Pipeline } from "../eval/l1.js";

/**
 * Fault-injection gate (roadmap Tranche 2; deep-dive H3). Each fixture in
 * `eval/faults/` is an otherwise-sound plan carrying exactly one seeded defect (two
 * for `combined`). The gate proves the *deterministic* pipeline — `arch fix` then
 * `arch repair`, wrapped by {@link l1Pipeline} — heals every seeded fault to a plan
 * that compiles clean, is physically sound, and is a fixpoint. This is the "free"
 * deterministic dividend, measured with zero API cost so it belongs in CI.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const fault = (name: string) => readFileSync(join(__dirname, "..", "eval", "faults", `${name}.arch`), "utf8");
const golden = (name: string) => readFileSync(join(__dirname, "..", "eval", "goldens", `${name}.arch`), "utf8");

/** The physical-soundness lint codes the pipeline must drive to zero. */
const PHYSICAL_CODES = ["W_FURNITURE_WALL_COLLISION", "W_DOORWAY_BLOCKED", "W_ROOM_NO_CLEAR_PATH"];
/** The off-wall placement codes a fix must clear. */
const OFF_WALL_CODES = ["W_DOOR_OFF_WALL", "W_WINDOW_OFF_WALL", "W_OPENING_OFF_WALL"];

/** Every diagnostic + lint code a source raises, deduplicated — the pre-pipeline view
 *  the defect-present guard inspects (off-wall codes surface in `compile`, physical
 *  codes in `lint`). */
const allCodes = (src: string): Set<string> =>
  new Set(
    [...compile(src).diagnostics.map((d) => d.code), ...lint(src).map((d) => d.code)].filter((c): c is string => !!c),
  );

/** Fixtures and the code(s) each seeded defect must raise before healing. */
const FIXTURES: { name: string; expected: string[]; healedBy: "fix" | "repair" | "both" }[] = [
  { name: "off-wall-door", expected: ["W_DOOR_OFF_WALL"], healedBy: "fix" },
  { name: "off-wall-window", expected: ["W_WINDOW_OFF_WALL"], healedBy: "fix" },
  { name: "off-wall-opening", expected: ["W_OPENING_OFF_WALL"], healedBy: "fix" },
  { name: "furniture-through-wall", expected: ["W_FURNITURE_WALL_COLLISION"], healedBy: "repair" },
  { name: "blocked-doorway", expected: ["W_DOORWAY_BLOCKED"], healedBy: "repair" },
  { name: "combined", expected: ["W_DOOR_OFF_WALL", "W_DOORWAY_BLOCKED"], healedBy: "both" },
];

describe("fault-injection gate — the L1 deterministic pipeline heals seeded defects", () => {
  for (const { name, expected, healedBy } of FIXTURES) {
    describe(name, () => {
      const src = fault(name);

      it("presents the seeded defect (guards against a silently-healthy fixture)", () => {
        const codes = allCodes(src);
        for (const code of expected) expect([...codes]).toContain(code);
      });

      const result = l1Pipeline(src);

      it(`heals it via ${healedBy} into a plan that compiles with no errors and non-empty svg`, () => {
        const out = compile(result.source);
        expect(out.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
        expect(out.svg.length).toBeGreaterThan(0);
        // The expected mechanism actually did work (fix span-edits and/or a repair move).
        if (healedBy !== "repair") expect(result.fixesApplied).toBeGreaterThan(0);
        if (healedBy !== "fix") expect(result.repairChanges).toBeGreaterThan(0);
      });

      it("leaves no physical-soundness or off-wall codes", () => {
        const post = allCodes(result.source);
        for (const code of PHYSICAL_CODES) expect([...post]).not.toContain(code);
        for (const code of OFF_WALL_CODES) expect([...post]).not.toContain(code);
      });

      it("is a fixpoint — a second pass through the pipeline is a byte no-op", () => {
        expect(l1Pipeline(result.source).source).toBe(result.source);
      });
    });
  }
});

describe("fault-injection gate — a clean plan is untouched", () => {
  it("passes a lint-clean golden through l1Pipeline byte-for-byte", () => {
    const src = golden("two-bed-hall");
    const result = l1Pipeline(src);
    expect(result.source).toBe(src);
    expect(result.fixesApplied).toBe(0);
    expect(result.repairChanges).toBe(0);
  });
});
