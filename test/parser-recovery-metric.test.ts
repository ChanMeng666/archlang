/**
 * The parser's error-recovery METRIC, pinned as floors.
 *
 * `test/recovery-metric.ts` defines it (statement-fingerprint survival over deterministic
 * mutants of every `examples/*.arch`). The floors below are the measured values; they may
 * only rise:
 *
 * | class       | measured                 |
 * |-------------|--------------------------|
 * | `dropBrace` | 22197/22947 = 0.967316   |
 * | `dropToken` | 65002/76753 = 0.846898   |
 *
 * A red floor is a recovery regression, not a number to re-measure. Adding or editing an
 * example legitimately moves both ratios: re-measure then, and record why here.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
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
    expect(r.survival).toBeGreaterThanOrEqual(22197 / 22947);
  }, 60_000);

  it("dropToken: blanking every k-th token, one per mutant", () => {
    const r = measure(API, SOURCES, "dropToken");
    expect(r.mutants).toBeGreaterThan(1000);
    expect(r.survival).toBeGreaterThanOrEqual(65002 / 76753);
  }, 60_000);
});
