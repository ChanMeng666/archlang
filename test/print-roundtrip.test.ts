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

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { format } from "../src/format.js";
import { parse } from "../src/parser.js";
import { archPlan } from "./arbitrary-plan.js";

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

const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));
const LIBS = readdirSync("examples/lib")
  .filter((f) => f.endsWith(".arch"))
  .map((f) => `lib/${f}`);
const ALL = [...EXAMPLES, ...LIBS];
const readExample = (name: string): string => readFileSync(`examples/${name}`, "utf8");

describe("print-roundtrip — parse(format(s)) ≡ parse(s), modulo spans and trivia", () => {
  for (const name of ALL) {
    it(`${name} round-trips through the formatter unchanged`, () => {
      checkRoundtrip(readExample(name));
    });
  }

  it("also holds over fc.sample(archPlan)", () => {
    for (const src of fc.sample(archPlan, { numRuns: 200, seed: 20260927 })) checkRoundtrip(src);
  });
});
