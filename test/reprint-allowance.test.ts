// RR.9: a statement reprint (a door, window or opening fix, the door's flip text, a dim's swap text)
// is free only for a statement of at most `REPRINT_FREE_BYTES` bytes, so a component's long statement placed by many
// storeys is charged on every storey instead of growing as storeys × statement length uncharged
// (`src/elements/reprint.ts`; the looped-statement charge is pinned in test/doors.test.ts and
// test/window-opening-fix-charge.test.ts).
import { describe, expect, it } from "vitest";
import { compile, makeVirtualWorld } from "../src/index.js";
import { REPRINT_FREE_BYTES } from "../src/elements/reprint.js";
import { link } from "../src/import.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";

const WALL = "wall id=w exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }";
const steps = (src: string): number => {
  const world = makeVirtualWorld({});
  const linked = link(parse(src, BUILTIN_REGISTRY).plan!, world, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, world));
};
/** `head` and `tail` joined by spaces so the statement is exactly `bytes` long (spaces evaluate nothing). */
const sized = (head: string, tail: string, bytes: number): string => {
  const pad = bytes - head.length - tail.length;
  if (pad < 1) throw new Error(`a ${bytes}-byte statement cannot hold ${head}…${tail}`);
  return `${head}${" ".repeat(pad)}${tail}`;
};
const plan = (stmt: string, ...extra: string[]): string =>
  ['plan "P" {', "  units mm", ...extra, `  ${WALL}`, `  ${stmt}`, "}"].join("\n");
/** A component holding `stmt`, placed by `levels` one-line `level` statements. */
const storeys = (stmt: string, levels: number, ...extra: string[]): string =>
  [
    'plan "P" {',
    "  units mm",
    ...extra,
    `  component c() {\n    ${WALL}\n    ${stmt}\n  }`,
    ...Array.from({ length: levels }, (_, k) => `  level ${k} { place c() as p${k} at (0,0) }`),
    "}",
  ].join("\n");

const AT = REPRINT_FREE_BYTES;
const PAST = REPRINT_FREE_BYTES + 1;

// Each case prints `builds` statement reprints per resolution: an off-wall fix (and, for a hinged
// door, its flip text), a hinged door on its wall (only the flip text), or a dim (its swap text).
const cases = [
  { name: "an off-wall door (fix + flip text)", head: "door at (3000, 3000)", tail: "width 900", builds: 2 },
  { name: "a hinged door on its wall (flip text)", head: "door on w at 3000", tail: "width 900", builds: 1 },
  { name: "an off-wall window", head: "window at (3000, 3000)", tail: "width 900", builds: 1 },
  { name: "an off-wall opening", head: "opening at (3000, 3000)", tail: "width 900", builds: 1 },
  { name: "a dim (swap text)", head: "dim (0, 1000)->(3000, 1000)", tail: "offset 300", builds: 1 },
] as const;

describe.each(cases)("$name: the free/charged boundary (RR.9)", ({ head, tail, builds }) => {
  it("a statement up to the allowance is free, one byte past it pays 1 + its length per build", () => {
    expect(steps(plan(sized(head, tail, AT)))).toBe(steps(plan(`${head} ${tail}`)));
    expect(steps(plan(sized(head, tail, PAST))) - steps(plan(sized(head, tail, AT)))).toBe(builds * (1 + PAST));
  });

  it("a component's second storey is charged again, and so is each `paper` pass", () => {
    const extra = (levels: number, ...p: string[]): number =>
      steps(storeys(sized(head, tail, PAST), levels, ...p)) - steps(storeys(sized(head, tail, AT), levels, ...p));
    expect(extra(1)).toBe(builds * (1 + PAST));
    expect(extra(2)).toBe(2 * builds * (1 + PAST));
    // A `paper` plan resolves each storey twice (the geometry probe, then the drawn pass).
    expect(extra(2, "  paper A3 landscape")).toBe(4 * builds * (1 + PAST));
  });
});

// The card's probe: one long door statement with every fix firing, in a component placed by many
// one-line `level` statements. Before RR.9 each storey re-printed it five times uncharged (60
// storeys: about 7 MB printed, no `E_STEP_LIMIT`); now each storey pays for it, so it runs out of steps.
describe("a long component door placed by many storeys runs out of steps (RR.9)", () => {
  const dead = `max(${Array(12000).fill("1").join(",")})`;
  const door = `door pocket at ((if 1 < 0 { ${dead} } else { 3000 }), 3000) width 0 hinge left open 2`;
  it.each(["", "  paper A3 landscape"])("paper=%j", (paper) => {
    const codes = compile(storeys(door, 60, ...(paper ? [paper] : [])), { noCache: true }).diagnostics.map(
      (d) => d.code,
    );
    expect(codes).toContain("E_STEP_LIMIT");
  });
  // A short door placed by the same storeys is free on each: it stays well inside the budget.
  it("the same storeys with a short door stay within the budget", () => {
    const codes = compile(storeys("door pocket at (3000, 3000) width 0 hinge left open 2", 60), {
      noCache: true,
    }).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("E_STEP_LIMIT");
    expect(codes).toContain("E_DOOR_OPEN_RANGE");
  });
});
