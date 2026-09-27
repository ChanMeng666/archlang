/**
 * W7 — `W_WHILE_DEPRECATED` / `W_REASSIGN_DEPRECATED` (`src/while-deprecation.ts`).
 *
 * Both are advisory-only: they never change `describe()`/`lint()`/SVG output, and the
 * machine-applicable fix on the canonical counted-loop shape is proven to compile to the
 * SAME bytes as the `while` it replaces.
 */

import { describe, expect, it } from "vitest";
import { applyFixes, compile, describe as describePlan, lint } from "../src/index.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

const codesOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.map((d) => d.code)
    .filter((c): c is string => !!c);

describe("W_WHILE_DEPRECATED / W_REASSIGN_DEPRECATED — advisory only", () => {
  it("fires on a `while` statement", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("fires on a stray reassignment (not a while's own progress step)", () => {
    const src = plan(`  let total = 0\n  total = total + 100`);
    const codes = codesOf(src);
    expect(codes).toContain("W_REASSIGN_DEPRECATED");
    expect(codes).not.toContain("W_WHILE_DEPRECATED");
  });

  it("never raises an error, and never changes SVG/describe/lint of an unrelated plan", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const result = compile(src);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.svg).toBeTruthy();
  });

  it("does not double-warn a while loop's own counter update", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const codes = codesOf(src);
    expect(codes.filter((c) => c === "W_REASSIGN_DEPRECATED")).toHaveLength(0);
    expect(codes.filter((c) => c === "W_WHILE_DEPRECATED")).toHaveLength(1);
  });

  it("does not double-warn a decrementing (non `+1`) progress step either", () => {
    // isProgressStep is broader than the machine-fixable shape: any last-statement
    // reassignment of a name the condition references counts, not just literal `+ 1`.
    const src = plan(`  let i = 5\n  while i > 0 {\n    column at (i * 300, 0) size 100x100\n    i = i - 1\n  }`);
    const codes = codesOf(src);
    expect(codes.filter((c) => c === "W_REASSIGN_DEPRECATED")).toHaveLength(0);
    expect(codes.filter((c) => c === "W_WHILE_DEPRECATED")).toHaveLength(1);
  });

  it("warns on a `while` inside a component body", () => {
    const src = plan(
      `  component c() {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  c()`,
    );
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("warns on a `while` inside a `level` block", () => {
    const src = `plan "P" {\n  units mm\n  level 1 {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n}\n`;
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("warns on a `while` inside a `zone` block", () => {
    const src = plan(
      `  zone west {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("a plan using neither `while` nor reassignment is byte-identical (no new diagnostic)", () => {
    const src = plan(`  for i in 0..3 {\n    column at (i * 300, 0) size 100x100\n  }`);
    const codes = codesOf(src);
    expect(codes).not.toContain("W_WHILE_DEPRECATED");
    expect(codes).not.toContain("W_REASSIGN_DEPRECATED");
  });
});

describe("the machine-applicable fix — canonical shape only", () => {
  /** `let i = 0; while i < N { column …; i = i + 1 }` — the one rewritable shape. */
  const canonical = (n: number): string =>
    plan(`  let i = 0\n  while i < ${n} {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);

  function whileFix(src: string) {
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_WHILE_DEPRECATED");
    return d?.fixes?.[0];
  }

  it("is offered on the canonical shape, and applying it compiles to the SAME bytes", () => {
    const src = canonical(4);
    const fix = whileFix(src);
    expect(fix).toBeTruthy();
    expect(fix!.applicability).toBe("machine-applicable");

    const { output, applied } = applyFixes(src, [fix!]);
    expect(applied).toHaveLength(1);
    expect(output).toContain("for i in 0..4");
    expect(output).not.toContain("while");

    const before = compile(src, { noCache: true });
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
    // Same shape apart from the deprecation diagnostics themselves.
    const isDeprecation = (d: { code?: string }) =>
      d.code === "W_WHILE_DEPRECATED" || d.code === "W_REASSIGN_DEPRECATED";
    const stripDeprecation = (ds: typeof before.diagnostics) => ds.filter((d) => !isDeprecation(d));
    expect(stripDeprecation(after.diagnostics)).toEqual(stripDeprecation(before.diagnostics));
    const stripDescribe = (d: ReturnType<typeof describePlan>) => ({
      ...d,
      diagnostics: (d as { diagnostics?: { code?: string }[] }).diagnostics?.filter((x) => !isDeprecation(x)),
    });
    expect(stripDescribe(describePlan(output))).toEqual(stripDescribe(describePlan(src)));
    expect(lint(output)).toEqual(lint(src));
  });

  it("DECLINED: the increment is not the last statement of the body", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    i = i + 1\n    column at (i * 300, 0) size 100x100\n  }`);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: another assignment exists in the body besides the increment", () => {
    const src = plan(
      `  let i = 0\n  let extra = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    extra = extra + 1\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: B references the loop variable", () => {
    const src = plan(
      `  let i = 0\n  let n = 4\n  while i < n + i {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: I is referenced after the loop", () => {
    const src = plan(
      `  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  let last = i`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: the condition is not strictly `<`", () => {
    const src = plan(`  let i = 0\n  while i <= 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: no `let I = A` immediately before the while", () => {
    const src = plan(
      `  let i = 0\n  column at (0, 9000) size 100x100\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: the increment is not literally `I = I + 1`", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 2\n  }`);
    expect(whileFix(src)).toBeUndefined();
  });
});
