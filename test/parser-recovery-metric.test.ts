/**
 * The parser's error-recovery METRIC, pinned as floors.
 *
 * `test/recovery-metric.ts` defines it (statement-fingerprint survival over deterministic
 * mutants of every `examples/*.arch`). The floors below are the measured values with the
 * brace-depth-aware `synchronize` (`src/parser.ts`); they may only rise. Measured with the
 * same body over the previous `synchronize` (which stopped at the first `}` or statement
 * keyword at any depth):
 *
 * | class       | previous                 | brace-depth aware        |
 * |-------------|--------------------------|--------------------------|
 * | `dropBrace` | 22197/22947 = 0.967316   | 22222/22947 = 0.968405   |
 * | `dropToken` | 65002/76753 = 0.846898   | 74642/76753 = 0.972496   |
 *
 * A red floor is a recovery regression, not a number to re-measure. Adding or editing an
 * example legitimately moves both ratios: re-measure then, and record why here.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { measure, multisetIntersection, statementFingerprints, type MetricApi } from "./recovery-metric.js";

const API: MetricApi = { lex, parse };
const EXAMPLES = resolvePath("examples");
const SOURCES = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => readFileSync(join(EXAMPLES, f), "utf8"));

describe("parser recovery metric — the measurement is honest", () => {
  it("every example parses clean, so a mutant's loss is the mutation's alone", () => {
    for (const src of SOURCES) {
      expect(parse(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }
  });

  it("fingerprints carry no position: re-indenting every line keeps every statement", () => {
    let kept = 0;
    let total = 0;
    for (const src of SOURCES) {
      const base = statementFingerprints(API, src);
      kept += multisetIntersection(base, statementFingerprints(API, `  \n${src.replace(/\n/g, "\n ")}`));
      total += base.length;
    }
    expect(total).toBeGreaterThan(1000);
    expect(kept).toBe(total);
  });

  it("it can see a loss: a stray `}` mid-plan drops the statements after it", () => {
    const src = 'plan "p" {\n  room id=a at (0,0) size 1x1\n}\n  room id=b at (1,0) size 1x1\n}\n';
    const whole = statementFingerprints(API, src.replace("}\n  room id=b", "  room id=b"));
    expect(multisetIntersection(whole, statementFingerprints(API, src))).toBe(1);
  });
});

describe("parser recovery metric — floors (may only rise)", () => {
  it("dropBrace: blanking each `}` in turn", () => {
    const r = measure(API, SOURCES, "dropBrace");
    expect(r.mutants).toBeGreaterThan(300);
    expect(r.survival).toBeGreaterThanOrEqual(22222 / 22947);
  }, 60_000);

  it("dropToken: blanking every k-th token, one per mutant", () => {
    const r = measure(API, SOURCES, "dropToken");
    expect(r.mutants).toBeGreaterThan(1000);
    expect(r.survival).toBeGreaterThanOrEqual(74642 / 76753);
  }, 60_000);
});

/** Rooms the parser produced, and the error diagnostics — the two halves of recovery. */
function recovered(src: string): { rooms: string[]; errors: string[] } {
  const out = compile(src, { noCache: true });
  return {
    rooms: (out.ast?.body ?? []).filter((s) => s.kind === "room").map((s) => s.id),
    errors: out.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  };
}

describe("brace-depth-aware synchronize — the cases the metric aggregates", () => {
  it("a bad point inside a wall's `{ … }` no longer closes the plan at the wall's `}`", () => {
    const src = [
      'plan "p" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) bogus (4000,3000) close }",
      "  room id=a at (0,0) size 4000x3000",
      "  room id=b at (4000,0) size 3000x3000",
      "}",
    ].join("\n");
    // Previously: rooms [] (silently dropped after the wall's `}` closed the plan).
    expect(recovered(src)).toEqual({ rooms: ["a", "b"], errors: ["E_PARSE"] });
  });

  it("a bad key inside a `theme { … }` block no longer closes the plan", () => {
    const src = 'plan "p" {\n  theme { wall 12 bogus }\n  room id=a at (0,0) size 4000x3000\n}';
    expect(recovered(src)).toEqual({ rooms: ["a"], errors: ["E_PARSE"] });
  });

  it("a failed `for` header skips its body as a unit (no cascade from the orphaned body)", () => {
    const src = [
      'plan "p" {',
      "  for i 0..2 {",
      "    room at (i*1000, 0) size 1000x1000",
      "  }",
      "  room id=b at (4000,0) size 3000x3000",
      "}",
    ].join("\n");
    // Previously the body was parsed at plan level: an extra E_UNKNOWN_REF for `i`.
    expect(recovered(src)).toEqual({ rooms: ["b"], errors: ["E_PARSE"] });
  });

  it("failing AT a statement keyword resumes there, even with the wall's `{` left open", () => {
    const src = [
      'plan "p" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) close",
      "  room id=a at (0,0) size 4000x3000",
      "}",
    ].join("\n");
    expect(recovered(src)).toEqual({ rooms: ["a"], errors: ["E_PARSE"] });
  });
});
