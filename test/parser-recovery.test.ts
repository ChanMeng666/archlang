/**
 * T5.1 — lossless + error-recovering parse tree.
 *
 * A broken line must NOT drop the rest of the tree: the parser recovers, emits an
 * `error` node where the broken statement was, and keeps the surrounding
 * statements. Comments are captured as trivia (for the formatter). `ast` is
 * present even when the plan header is malformed.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";

describe("T5.1 — parser recovery keeps the rest of the tree", () => {
  const src = [
    'plan "Recovery" {',
    '  room id=a at (0,0) size 1000x1000 label "A"',
    "  room id=broken at (0,0) size", // missing dimensions → error
    '  room id=c at (3000,0) size 1000x1000 label "C"',
    "}",
  ].join("\n");

  it("yields the rooms before AND after the broken line", () => {
    const { ast } = compile(src, { noCache: true });
    const rooms = ast?.body.filter((s) => s.kind === "room") ?? [];
    expect(rooms.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("places an explicit error node where the broken statement was", () => {
    const { ast } = compile(src, { noCache: true });
    const errs = ast?.body.filter((s) => s.kind === "error") ?? [];
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(errs[0].span).toBeDefined();
  });

  it("still reports a diagnostic for the broken line", () => {
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("renders nothing (errors abort) but the AST is intact", () => {
    const { svg, ast } = compile(src, { noCache: true });
    expect(svg).toBe("");
    expect(ast).toBeDefined();
  });
});

describe("T5.1 — ast present on malformed header", () => {
  it("returns an AST even when the opening brace is missing", () => {
    // No `{` after the plan name — header is malformed.
    const src = 'plan "NoBrace"\n  room at (0,0) size 1000x1000\n';
    const { ast, diagnostics } = compile(src, { noCache: true });
    expect(ast).toBeDefined();
    expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("returns an AST even when the `plan` keyword is missing entirely", () => {
    const { plan } = parse("room at (0,0) size 1000x1000");
    expect(plan).toBeDefined();
  });
});

describe("T5.1 — comment trivia is captured losslessly", () => {
  it("collects line comments with spans and text", () => {
    const src = ["# header comment", 'plan "C" {', "  # inner comment", "  room at (0,0) size 1000x1000", "}"].join(
      "\n",
    );
    const { plan } = parse(src);
    expect(plan?.comments).toBeDefined();
    expect(plan?.comments?.map((c) => c.text)).toEqual(["# header comment", "# inner comment"]);
    for (const c of plan?.comments ?? []) {
      expect(src.slice(c.span.start, c.span.end)).toBe(c.text);
    }
  });

  it("does not affect token stream / rendered output (comments are trivia)", () => {
    const withComments = 'plan "C" {\n  # a comment\n  room at (0,0) size 1000x1000 label "R"\n}';
    const without = 'plan "C" {\n  room at (0,0) size 1000x1000 label "R"\n}';
    expect(compile(withComments, { noCache: true }).svg).toBe(compile(without, { noCache: true }).svg);
  });
});
