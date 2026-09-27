import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codeActions, compile, format, makeVirtualWorld, reroll } from "../src/index.js";

/**
 * `reroll(source)` (W6b): detect ≥3 consecutive statements in arithmetic
 * progression and offer a proven-equivalent `for` loop. Every suggestion here is
 * gated by a twin-compile proof obligation (see `src/reroll.ts`'s header), so a
 * test asserting a suggestion IS offered is also proving the obligation held.
 */

// A flat write-out of `examples/parametric.arch`'s row: 3 identical studio units
// (wall/room/door), grouped by kind so each kind forms its own consecutive run —
// canonicalized through `format()` so `format(fixed) === fixed` is a meaningful
// assertion below (the source starts at a fixed point, not merely well-formed).
const FLAT_ROW = format(`plan "Row" {
  units mm
  grid 50
  north up
  wall exterior thickness 200 { (0,0) (4000,0) (4000,5000) (0,5000) close }
  wall exterior thickness 200 { (4000,0) (8000,0) (8000,5000) (4000,5000) close }
  wall exterior thickness 200 { (8000,0) (12000,0) (12000,5000) (8000,5000) close }
  room at (0,0) size 4000x5000 label "Studio"
  room at (4000,0) size 4000x5000 label "Studio"
  room at (8000,0) size 4000x5000 label "Studio"
  door at (2000,5000) width 900 wall exterior hinge left
  door at (6000,5000) width 900 wall exterior hinge left
  door at (10000,5000) width 900 wall exterior hinge left
}`);

function applyOne(source: string, s: ReturnType<typeof reroll>[number]): string {
  return source.slice(0, s.span.start) + s.replacement + source.slice(s.span.end);
}

describe("reroll — the flat parametric row", () => {
  it("finds one loop per kind, each shorter and proven equivalent", () => {
    const suggestions = reroll(FLAT_ROW);
    expect(suggestions.length).toBe(3);
    for (const s of suggestions) {
      expect(s.count).toBe(3);
      expect(s.loopVar).toBe("i");
      expect(s.tokensAfter).toBeLessThan(s.tokensBefore);
      expect(s.replacement).toContain("for i in 0..3 {");

      const twin = applyOne(FLAT_ROW, s);
      // Byte-identity: an unrelated compile is untouched, and the twin itself compiles clean.
      const before = compile(FLAT_ROW);
      const after = compile(twin);
      expect(after.errors).toEqual([]);
      expect(after.svg).toBe(before.svg);
    }
  });

  it("format(fixed) === fixed — printed at the run's own nesting depth", () => {
    const suggestions = reroll(FLAT_ROW);
    for (const s of suggestions) {
      const twin = applyOne(FLAT_ROW, s);
      expect(format(twin)).toBe(twin);
    }
  });

  it("is deterministic (same suggestions twice)", () => {
    expect(JSON.stringify(reroll(FLAT_ROW))).toBe(JSON.stringify(reroll(FLAT_ROW)));
  });
});

describe("reroll — nested statement lists", () => {
  it("finds a run inside a component body", () => {
    const src = format(`plan "Comp" {
      units mm
      grid 50
      north up
      component unit(x) {
        furniture bed at (x + 0, 0) size 1000x2000
        furniture bed at (x + 4000, 0) size 1000x2000
        furniture bed at (x + 8000, 0) size 1000x2000
      }
      unit(0)
    }`);
    const suggestions = reroll(src);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]!.replacement).toContain("for i in 0..3 {");
    const twin = applyOne(src, suggestions[0]!);
    expect(compile(twin).errors).toEqual([]);
    expect(format(twin)).toBe(twin);
  });

  it("finds a run inside a level body", () => {
    const src = format(`plan "Lvl" {
      units mm
      grid 50
      north up
      level 0 {
        column at (0,0) size 300x300
        column at (4000,0) size 300x300
        column at (8000,0) size 300x300
      }
    }`);
    const suggestions = reroll(src);
    expect(suggestions.length).toBe(1);
    const twin = applyOne(src, suggestions[0]!);
    expect(compile(twin).errors).toEqual([]);
    expect(format(twin)).toBe(twin);
  });
});

describe("reroll — loop-variable collision", () => {
  it("skips `i` when it is already bound, and uses `j`", () => {
    const src = format(`plan "Collide" {
      units mm
      grid 50
      north up
      let i = 5
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    const suggestions = reroll(src);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]!.loopVar).toBe("j");
    expect(suggestions[0]!.replacement).toContain("for j in 0..3 {");
  });
});

describe("reroll — world passthrough (a plan with imports)", () => {
  // The reroll TARGET (3 furniture statements) doesn't itself reference the
  // import — the point is that the whole plan fails to link without a World,
  // which trips reroll's global "offer nothing on a plan with errors" gate
  // regardless of which statements would otherwise re-roll.
  const world = makeVirtualWorld({
    "lib.arch": `plan "Lib" {
      units mm
      component marker() {
        column at (0, 0) size 100x100
      }
    }`,
  });
  const importingSrc = format(`plan "Imports" {
    units mm
    grid 50
    north up
    import "lib.arch": marker
    marker()
    furniture bed at (0, 0) size 1000x2000
    furniture bed at (4000, 0) size 1000x2000
    furniture bed at (8000, 0) size 1000x2000
  }`);

  it("without `world`, the import fails to link, so nothing is offered", () => {
    expect(reroll(importingSrc)).toEqual([]);
  });

  it("with `world`, the import resolves and the run is proven equivalent", () => {
    const suggestions = reroll(importingSrc, { world });
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]!.replacement).toContain("for i in 0..3 {");
    const twin = applyOne(importingSrc, suggestions[0]!);
    expect(compile(twin, { world }).errors).toEqual([]);
    expect(compile(twin, { world }).svg).toBe(compile(importingSrc, { world }).svg);
  });
});

describe("reroll — refused cases", () => {
  it("refuses a run where a statement carries an explicit id", () => {
    const src = format(`plan "Ids" {
      units mm
      grid 50
      north up
      column id=c0 at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses only 2 statements", () => {
    const src = format(`plan "Two" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses a non-arithmetic-progression", () => {
    const src = format(`plan "NonAP" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (9000,0) size 300x300
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses differing strings (v1: a string slot must be identical)", () => {
    const src = format(`plan "Str" {
      units mm
      grid 50
      north up
      room at (0,0) size 4000x5000 label "A"
      room at (4000,0) size 4000x5000 label "B"
      room at (8000,0) size 4000x5000 label "C"
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses a plan with errors — offers nothing rather than reasoning about broken source", () => {
    const src = `plan "Err" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
      room at (0,0) size -100x300 label "Bad"
    }`;
    expect(compile(src).errors.length).toBeGreaterThan(0);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses a run broken by another statement (not consecutive)", () => {
    const src = format(`plan "Broken" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      wall partition thickness 100 { (0,2000) (9000,2000) }
      column at (8000,0) size 300x300
    }`);
    expect(reroll(src)).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// LSP: codeActions offers a reroll suggestion as a refactor.rewrite action.
// --------------------------------------------------------------------------

describe("reroll — LSP code action", () => {
  it("codeActions offers the suggestion, as kind refactor.rewrite, never preferred", () => {
    const at = FLAT_ROW.indexOf("wall exterior");
    const actions = codeActions(FLAT_ROW, { start: at, end: at });
    const rerollActions = actions.filter((a) => a.kind === "refactor.rewrite");
    expect(rerollActions.length).toBeGreaterThan(0);
    for (const a of rerollActions) {
      expect(a.isPreferred).toBe(false);
      expect(a.diagnostic).toBeUndefined();
      expect(a.edits.length).toBe(1);
    }
  });

  it("offers nothing when the range does not touch any suggestion's span", () => {
    // Offset 0 is the `plan` keyword — before every statement's span.
    const actions = codeActions(FLAT_ROW, { start: 0, end: 1 });
    expect(actions.filter((a) => a.kind === "refactor.rewrite")).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}
function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-reroll-"));
  file = join(dir, "row.arch");
  writeFileSync(file, FLAT_ROW, "utf8");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("arch reroll — CLI", () => {
  it("--json prints the suggestion shape", () => {
    const r = run(["reroll", file, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(Array.isArray(j.suggestions)).toBe(true);
    expect(j.suggestions.length).toBe(3);
    for (const s of j.suggestions) {
      expect(s).toHaveProperty("span");
      expect(s).toHaveProperty("replacement");
      expect(s).toHaveProperty("count");
      expect(s).toHaveProperty("loopVar");
      expect(s).toHaveProperty("tokensBefore");
      expect(s).toHaveProperty("tokensAfter");
    }
  }, 30000);

  it("--write applies every suggestion in place, and the result compiles equal", () => {
    const before = readFileSync(file, "utf8");
    const r = run(["reroll", file, "--write", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.changed).toBe(true);
    expect(j.applied).toBe(3);

    const after = readFileSync(file, "utf8");
    expect(after).not.toBe(before);
    expect(after).toContain("for i in 0..3 {");

    const beforeCompile = compile(before);
    const afterCompile = compile(after);
    expect(afterCompile.errors).toEqual([]);
    expect(afterCompile.svg).toBe(beforeCompile.svg);
  }, 30000);

  it("--write is idempotent (no reroll suggestions left after writing)", () => {
    run(["reroll", file, "--write"]);
    const r2 = run(["reroll", file, "--json"]);
    const j2 = JSON.parse(r2.stdout);
    expect(j2.suggestions).toEqual([]);
  }, 30000);

  it("human mode without --write only prints, never touches the file", () => {
    const before = readFileSync(file, "utf8");
    const r = run(["reroll", file]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("for i in 0..3 {");
    expect(readFileSync(file, "utf8")).toBe(before);
  }, 30000);

  it("reports no suggestions on a plan with none", () => {
    const clean = join(dir, "clean.arch");
    writeFileSync(clean, 'plan "C" { units mm room at (0,0) size 4000x3000 label "R" }', "utf8");
    const r = run(["reroll", clean, "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).suggestions).toEqual([]);
  }, 30000);
});
