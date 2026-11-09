/**
 * The central law motivating this task: **a printer is a section of the parser**.
 * `parse(format(s))` must equal `parse(s)`, modulo spans and trivia (byte offsets
 * necessarily shift when the text is reformatted; comments/blank-line placement is
 * trivia, not semantics). `test/format.test.ts` already pins the weaker,
 * SVG-level form of this (`compile(s) === compile(format(s))`); this file pins the
 * stronger AST-level form directly, which is what actually proves `format.ts` and
 * the shared leaf printer (`statement-print.ts`) never silently drop or rewrite a
 * field `parse()` would have produced differently.
 */

import { exampleNames, libNames } from "./helpers/corpus.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { format } from "../src/format.js";
import { parse } from "../src/parser.js";
import { archPlan } from "./helpers/arbitrary-plan.js";
import { runs } from "./setup/fast-check.js";

/** Field names that are pure position/trivia, not semantics: every `*Span` field
 *  recorded for a diagnostic/fix, the parser's own `span`/`line`, and the plan's
 *  captured `comments`/`bodyStart` (comment trivia, not drawing content). Stripped
 *  recursively from BOTH trees before comparison, so the law is exactly "same
 *  drawing", not "same bytes". */
function stripTrivia(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  if (node instanceof Map) {
    const out = new Map<unknown, unknown>();
    for (const [k, v] of node) out.set(k, stripTrivia(v));
    return out;
  }
  if (Array.isArray(node)) return node.map(stripTrivia);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "span" || k === "line" || k === "comments" || k === "bodyStart" || /Span$/.test(k)) continue;
    out[k] = stripTrivia(v);
  }
  return out;
}

/** `parse(format(s))` and `parse(s)` must describe the same plan, modulo trivia. */
function checkRoundtrip(src: string): void {
  const before = parse(src);
  expect(before.plan, "the source itself failed to parse").toBeTruthy();

  const formatted = format(src);
  const after = parse(formatted);
  expect(
    after.diagnostics.some((d) => d.severity === "error"),
    `format() produced source with a parse error:\n${formatted}`,
  ).toBe(false);
  expect(after.plan, "format(s) failed to parse").toBeTruthy();

  expect(stripTrivia(after.plan)).toEqual(stripTrivia(before.plan));
}

const EXAMPLES = exampleNames();
const LIBS = libNames().map((f) => `lib/${f}`);
const ALL = [...EXAMPLES, ...LIBS];
const readExample = (name: string): string => readFileSync(`examples/${name}`, "utf8");

describe("print-roundtrip — parse(format(s)) ≡ parse(s), modulo spans and trivia", () => {
  for (const name of ALL) {
    it(`${name} round-trips through the formatter unchanged`, () => {
      checkRoundtrip(readExample(name));
    });
  }

  it("`walls from rooms` round-trips, its `except` clauses folded into one", () => {
    for (const f of ["studio", "two-bed"]) checkRoundtrip(readFileSync(`test/walls-from-rooms/${f}.arch`, "utf8"));
    const two = `plan "p" {\n  units mm\n  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  walls from rooms exterior 200 partition 100 {\n    except a\n    except b\n  }\n}\n`;
    checkRoundtrip(two);
    expect(format(two)).toContain("walls from rooms exterior 200 partition 100 { except a b }");
  });

  it("`walls from rooms` pair clauses round-trip in source order, after the `except` clause", () => {
    const src = `plan "p" {\n  units mm\n  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  room id=c at (0,3000) size 7000x2000\n  room id=t at (7000,0) size 1000x1000\n  walls from rooms exterior 200 partition 100 {\n    between b and c thickness 100 + 50\n    except t\n    open id=ab between a and b\n    open between a and c width 900\n  }\n}\n`;
    checkRoundtrip(src);
    expect(format(src)).toContain(
      "walls from rooms exterior 200 partition 100 { except t between b and c thickness 100 + 50 open id=ab between a and b open between a and c width 900 }",
    );
  });

  it("relational openings and datum positions round-trip (ADR 0028 §5)", () => {
    const src = `plan "p" {\n  units mm\n  room id=a at (0,0) size 4000x5000\n  room id=b at (4000,0) size 4000x5000\n  walls from rooms exterior 200 partition 100\n  wall id=w1 partition thickness 100 { (9000,0) (9000,5000) }\n  door id=d hinged between a and b at 800 + 0 from end width 800 hinge left\n  opening between a and b at axis A width 900\n  window on b.top width 1500\n  window on b.right at 1200 from b.top width 1200\n  door on w1 at 300 from start width 800\n  door on w1 at 1200 from a.top width 800\n}\n`;
    checkRoundtrip(src);
    const out = format(src);
    for (const line of [
      "door id=d hinged between a and b at 800 + 0 from end width 800 hinge left",
      "opening between a and b at axis A width 900",
      "window on b.top width 1500",
      "window on b.right at 1200 from b.top width 1200",
      "door on w1 at 300 from start width 800",
      "door on w1 at 1200 from a.top width 800",
    ])
      expect(out).toContain(line);
  });

  it("also holds over fc.sample(archPlan)", () => {
    for (const src of fc.sample(archPlan, { numRuns: runs(200), seed: 20260927 })) checkRoundtrip(src);
  });
});
