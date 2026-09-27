import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCache,
  codeActions,
  compile,
  describe as describePlan,
  format,
  lint,
  makeVirtualWorld,
  refactorActions,
  reroll,
} from "../src/index.js";
// `proves`/`compileForProof` are internal (not re-exported from src/index.js —
// see their doc comments in reroll.ts): imported directly here so the mutant-
// proofing tests below can drive the proof obligation with a deliberately
// WRONG replacement, not just observe reroll()'s own always-correct ones.
import { compileForProof, proves } from "../src/reroll.js";
import type { CompileOptions, Span } from "../src/index.js";

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

const diagTriples = (ds: { code?: string; severity: string; message: string }[]): string[] =>
  ds.map((d) => JSON.stringify([d.code, d.severity, d.message])).sort();
const diagPairs = (ds: { code?: string; message: string }[]): string[] =>
  ds.map((d) => JSON.stringify([d.code, d.message])).sort();

/**
 * Build the exact shape `proves()` expects for its `baseline` parameter, from
 * the PUBLIC `compile`/`describe`/`lint` — mirroring `reroll.ts`'s own
 * (internal, unexported) `getBaseline` so a test can call `proves()` directly
 * without depending on any of reroll.ts's non-exported types.
 */
function makeBaseline(source: string, opts: CompileOptions = {}) {
  const c = compile(source, opts);
  const d = describePlan(source, opts);
  const { diagnostics, ...describeFacts } = d;
  return {
    pipeline: {
      ok: c.errors.length === 0,
      diagnostics: c.diagnostics,
      pages: c.pages ? c.pages.map((p) => p.svg) : [c.svg],
    },
    describeFacts,
    describeDiagTriples: diagTriples(diagnostics),
    lintPairs: diagPairs(lint(source, opts)),
  };
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

describe("reroll — comment loss (MAJOR 2: format() preserves comments, so must reroll)", () => {
  it("refuses a run with a comment BETWEEN two of its statements", () => {
    const src = format(`plan "C1" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      # a comment between the first and second statement
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses a run with a comment trailing a NON-last statement (same line)", () => {
    const src = format(`plan "C2" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300 # trails the first statement
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("refuses a run with a comment trailing its LAST statement (same line)", () => {
    const src = format(`plan "C3" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300 # trails the last statement
    }`);
    expect(reroll(src)).toEqual([]);
  });

  it("still offers when a comment LEADS the run (before the first statement, its own line)", () => {
    const src = format(`plan "C4" {
      units mm
      grid 50
      north up
      # a comment before the run — outside it, nothing is lost by rerolling
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    expect(reroll(src).length).toBe(1);
  });

  it("still offers when a comment follows the run on the NEXT line (not trailing it)", () => {
    const src = format(`plan "C5" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
      # a comment after the run, on its own line — not trailing the last statement
      wall partition thickness 100 { (0,2000) (9000,2000) }
    }`);
    expect(reroll(src).length).toBe(1);
  });
});

describe("reroll — exact arithmetic progression (MINOR 5)", () => {
  it("refuses a progression that only agrees once PRINTED, not in exact binary (100.1, 100.2, 100.3)", () => {
    // IEEE-754: 100.2 - 100.1 !== 100.3 - 100.2 in binary, though fmt3 prints
    // all three deltas as "0.1". The public `scene` must be byte-identical to
    // the one the original literals produced, not merely equal once rounded.
    const src = format(`plan "Float" {
      units mm
      grid 50
      north up
      column at (100.1,0) size 300x300
      column at (100.2,0) size 300x300
      column at (100.3,0) size 300x300
    }`);
    expect(100.1 + 2 * (100.2 - 100.1)).not.toBe(100.3); // the premise: binary rounding really does break this
    expect(reroll(src)).toEqual([]);
  });

  it("still offers an EXACT integer progression", () => {
    const src = format(`plan "Int" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    expect(reroll(src).length).toBe(1);
  });
});

describe("reroll — CRLF (MINOR 7)", () => {
  it("prints the replacement with the source's own CRLF line endings", () => {
    const lfSrc = format(`plan "CRLF" {
      units mm
      grid 50
      north up
      column at (0,0) size 300x300
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
    }`);
    const crlfSrc = lfSrc.replace(/\n/g, "\r\n");
    const suggestions = reroll(crlfSrc);
    expect(suggestions.length).toBe(1);
    const replacement = suggestions[0]!.replacement;
    expect(replacement).toContain("\r\n");
    // No BARE LF: every "\n" is immediately preceded by "\r".
    expect(replacement.split("\r\n").join("").includes("\n")).toBe(false);

    const twin = crlfSrc.slice(0, suggestions[0]!.span.start) + replacement + crlfSrc.slice(suggestions[0]!.span.end);
    expect(compile(twin).errors).toEqual([]);
  });
});

describe("reroll — the detection gate (token-shortening; MAJOR 4)", () => {
  it("refuses a run whose loop wrapper would be LONGER than the statements it replaces", () => {
    // Three single-argument instance calls: `unit(0)`, `unit(4000)`, `unit(8000)`
    // — the `for i in 0..3 { … }` wrapper's own overhead (7 tokens) outweighs
    // the saving on a run this short.
    const src = format(`plan "Short" {
      units mm
      grid 50
      north up
      component unit(x) {
        column at (x,0) size 300x300
      }
      unit(0)
      unit(4000)
      unit(8000)
    }`);
    expect(reroll(src)).toEqual([]);
  });
});

describe("reroll — the proof obligation rejects a WRONG replacement (MAJOR 4, mutant-proofing)", () => {
  // Three columns in an exact AP (0, 4000, 8000) — every test below proves()
  // a deliberately WRONG replacement over this same run and expects `false`.
  const SRC = format(`plan "Mutant" {
    units mm
    grid 50
    north up
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    column at (0,0) size 300x300
    column at (4000,0) size 300x300
    column at (8000,0) size 300x300
  }`);
  const start = SRC.indexOf("column at (0, 0)");
  const end = SRC.indexOf("column at (8000, 0)") + "column at (8000, 0) size 300x300".length;
  const SPAN: Span = { start, end };
  const OPTS: CompileOptions = {};
  const BASELINE = makeBaseline(SRC, OPTS);

  it("sanity: the CORRECT replacement proves", () => {
    const correct = "for i in 0..3 {\n    column at (i * 4000,0) size 300x300\n  }";
    expect(proves(SRC, SPAN, correct, OPTS, BASELINE)).toBe(true);
  });

  it("rejects a replacement whose SVG differs (wrong delta: 5000 instead of 4000)", () => {
    const wrong = "for i in 0..3 {\n    column at (i * 5000,0) size 300x300\n  }";
    const twin = SRC.slice(0, start) + wrong + SRC.slice(end);
    expect(compile(twin, OPTS).svg).not.toBe(compile(SRC, OPTS).svg);
    expect(proves(SRC, SPAN, wrong, OPTS, BASELINE)).toBe(false);
  });

  it("rejects a source whose diagnostics differ — SVG, describe() facts and lint all UNCHANGED (an unknown wall material still draws the default hatch)", () => {
    // Verified premise: adding an unrecognized `material` word to a wall with
    // none draws the SAME default hatch (SVG unchanged), reports no new
    // describe()/lint() fact, and adds exactly one W_UNKNOWN_MATERIAL warning.
    const sourceWithBadMaterial = SRC.replace(
      "wall exterior thickness 200",
      "wall exterior thickness 200 material bogus_unknown_material_xyz",
    );
    expect(compile(sourceWithBadMaterial, OPTS).svg).toBe(compile(SRC, OPTS).svg);
    // The material insertion sits BEFORE the run, so the run's own byte span
    // shifted in this source — recompute it (never reuse SPAN across a source
    // edit that lands earlier in the file than the run). BASELINE (computed
    // from SRC, the TRUE original with no bad material) still applies: the
    // question is whether this twin — correct loop, but still carrying the
    // injected bad-material wall — proves equivalent to the real original.
    const s2 = sourceWithBadMaterial.indexOf("column at (0, 0)");
    const e2 = sourceWithBadMaterial.indexOf("column at (8000, 0)") + "column at (8000, 0) size 300x300".length;
    const correct = "for i in 0..3 {\n    column at (i * 4000,0) size 300x300\n  }";
    expect(proves(sourceWithBadMaterial, { start: s2, end: e2 }, correct, OPTS, BASELINE)).toBe(false);
  });

  it("rejects a source whose describe() facts differ — SVG, diagnostics and lint all UNCHANGED (heights draw nothing: a window sill is a fact only)", () => {
    // Verified premise: a window's `sill` is a fact `describe()` reports and
    // NOTHING draws (docs/agents/architecture.md: "heights draw nothing"), so
    // changing it alone changes describe() and nothing else.
    const srcWithWindow = format(`plan "SillMutant" {
      units mm
      grid 50
      north up
      wall exterior thickness 200 { (0,0) (12000,0) (12000,4000) (0,4000) close }
      window at (2000,0) width 1200 wall exterior sill 900
      column at (0,2000) size 300x300
      column at (4000,2000) size 300x300
      column at (8000,2000) size 300x300
    }`);
    const baseline = makeBaseline(srcWithWindow, OPTS);
    const sourceWithChangedSill = srcWithWindow.replace("sill 900", "sill 1200");
    expect(compile(sourceWithChangedSill, OPTS).svg).toBe(compile(srcWithWindow, OPTS).svg);
    expect(diagPairs(lint(sourceWithChangedSill, OPTS))).toEqual(diagPairs(lint(srcWithWindow, OPTS)));
    // The sill edit sits BEFORE the run, so the run's own byte span shifted in
    // this source ("sill 900" -> "sill 1200" is one byte longer) — recompute
    // it here rather than reusing an offset from `srcWithWindow`.
    const s2 = sourceWithChangedSill.indexOf("column at (0, 2000)");
    const e2 = sourceWithChangedSill.indexOf("column at (8000, 2000)") + "column at (8000, 2000) size 300x300".length;
    const correct = "for i in 0..3 {\n    column at (i * 4000,2000) size 300x300\n  }";
    expect(proves(sourceWithChangedSill, { start: s2, end: e2 }, correct, OPTS, baseline)).toBe(false);
  });

  it("rejects a source whose lint warnings differ (a shrunk room trips W_ROOM_TOO_SMALL)", () => {
    const srcWithRoom = format(`plan "LintMutant" {
      units mm
      grid 50
      north up
      wall exterior thickness 200 { (0,0) (16000,0) (16000,4000) (0,4000) close }
      room at (0,0) size 3000x3000 label "Room"
      column at (4000,0) size 300x300
      column at (8000,0) size 300x300
      column at (12000,0) size 300x300
    }`);
    const baseline = makeBaseline(srcWithRoom, OPTS);
    // A wrong SOURCE (a room-size shrink, unrelated to the run) proved against
    // the correct replacement for the run itself — shrinking is not part of
    // `replacement`, so this checks `proves()` against a whole-plan lint delta.
    const shrunkSource = srcWithRoom.replace("size 3000x3000", "size 400x400");
    expect(lint(shrunkSource, OPTS).map((d) => d.code)).toContain("W_ROOM_TOO_SMALL");
    const s2 = shrunkSource.indexOf("column at (4000, 0)");
    const e2 = shrunkSource.indexOf("column at (12000, 0)") + "column at (12000, 0) size 300x300".length;
    const correct = "for i in 0..3 {\n    column at (i * 4000 + 4000,0) size 300x300\n  }";
    expect(proves(shrunkSource, { start: s2, end: e2 }, correct, OPTS, baseline)).toBe(false);
  });

  it("compileForProof reports a compile error for an unresolvable twin", () => {
    const brokenReplacement = "for i in 0..3 {\n    column at (i * unbound_name,0) size 300x300\n  }";
    const twin = SRC.slice(0, start) + brokenReplacement + SRC.slice(end);
    expect(compileForProof(twin, OPTS).ok).toBe(false);
    expect(proves(SRC, SPAN, brokenReplacement, OPTS, BASELINE)).toBe(false);
  });
});

// --------------------------------------------------------------------------
// LSP: `refactorActions` offers a reroll suggestion as a refactor.rewrite
// action; `codeActions` keeps its historical quickfix-only contract.
// --------------------------------------------------------------------------

describe("reroll — LSP refactor action", () => {
  it("refactorActions offers the suggestion, as kind refactor.rewrite, with no diagnostic", () => {
    const at = FLAT_ROW.indexOf("wall exterior");
    const actions = refactorActions(FLAT_ROW, { start: at, end: at });
    expect(actions.length).toBe(1);
    const [a] = actions;
    const [s] = reroll(FLAT_ROW).filter((r) => r.span.start <= at && r.span.end >= at);
    expect(a).toEqual({
      title: `Re-roll ${s!.count} statements into a \`for\` loop`,
      kind: "refactor.rewrite",
      edits: [{ span: s!.span, newText: s!.replacement }],
    });
    expect(a).not.toHaveProperty("diagnostic");
    expect(a).not.toHaveProperty("isPreferred");
  });

  it("refactorActions offers nothing when the range does not touch any suggestion's span", () => {
    // Offset 0 is the `plan` keyword — before every statement's span.
    expect(refactorActions(FLAT_ROW, { start: 0, end: 1 })).toEqual([]);
  });

  it("codeActions on a plan with a re-rollable run returns quickfixes only, each with a diagnostic", () => {
    // The historical call shape: an embedder mapping `a.diagnostic.code` must never meet
    // an action without one. The row plus one off-wall door (a warning with a quick fix,
    // so the plan still re-rolls); the whole-document range touches all three runs.
    const src = FLAT_ROW.replace(/\n\}\s*$/, "\n  door id=stray at (2500,9000) width 900\n}\n");
    expect(reroll(src).length).toBe(3);
    const actions = codeActions(src, { start: 0, end: src.length });
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.kind).toBe("quickfix");
      expect(typeof a.diagnostic.code).toBe("string");
    }
    expect(actions.map((a) => a.diagnostic.code)).toContain("W_DOOR_OFF_WALL");
  });
});

describe("reroll — baseline memo", () => {
  // A World whose module text the test mutates in place: the SAME world object (identity
  // is the memo key) reads a broken module first, then a fixed one.
  const files: Record<string, string> = {};
  const world = { read: (p: string) => files[p.replace(/^\.\//, "")] ?? null };
  const GOOD_LIB = `plan "Lib" {\n  units mm\n  component marker() {\n    column at (0, 0) size 100x100\n  }\n}`;
  const src = format(`plan "Imports" {
    units mm
    grid 50
    north up
    import "lib.arch": marker
    marker()
    furniture bed at (0, 0) size 1000x2000
    furniture bed at (4000, 0) size 1000x2000
    furniture bed at (8000, 0) size 1000x2000
  }`);

  afterEach(() => clearCache());

  it("never memoizes a failed baseline: fixing the imported module is seen on the next call", () => {
    clearCache();
    delete files["lib.arch"];
    expect(reroll(src, { world })).toEqual([]);
    files["lib.arch"] = GOOD_LIB;
    // No clearCache() in between: the failure was never cached.
    expect(reroll(src, { world }).length).toBe(1);
  });

  it("clearCache() empties the memo: a module changed after a success is re-baselined once the cache is cleared", () => {
    clearCache();
    files["lib.arch"] = GOOD_LIB;
    expect(reroll(src, { world }).length).toBe(1);
    // Still a valid module, but it draws a different column. A stale baseline (the OLD
    // column) would disagree with every twin (the NEW column), so the proof would refuse
    // the re-roll; a fresh one agrees with it.
    files["lib.arch"] = GOOD_LIB.replace("size 100x100", "size 200x200");
    clearCache();
    expect(reroll(src, { world }).length).toBe(1);
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
    expect(j.wrote).toBe(true);
    expect(j.target).toBe(file);
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
