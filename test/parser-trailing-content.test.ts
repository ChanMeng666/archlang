/**
 * Trailing content after the plan's closing `}`.
 *
 * A file holds one plan. Before this guard the parser returned as soon as it consumed the
 * plan's `}`, so a stray `}` in the middle of a body — or a second `plan "B" { … }` block —
 * compiled with zero diagnostics and silently dropped everything after it. Now the first
 * trailing token gets ONE `E_PARSE`, with the consumed `}` as its related span. Comments are
 * trivia (not tokens) and never trigger it.
 */

import { describe, expect, it } from "vitest";
import { compile, format, formatDiagnostic, lint, makeVirtualWorld } from "../src/index.js";

const STRAY = [
  'plan "p" {',
  "  units mm",
  "  room id=a at (0,0) size 3000x3000",
  "  }",
  "  room id=b at (3000,0) size 3000x3000",
  "}",
  "",
].join("\n");

const SECOND = [
  'plan "A" {',
  "  units mm",
  "  room id=a at (0,0) size 3000x3000",
  "}",
  'plan "B" {',
  "  room id=b at (3000,0) size 3000x3000",
  "}",
  "",
].join("\n");

/** Byte span of the `n`-th (0-based) occurrence of `needle` in `src`. */
function spanOf(src: string, needle: string, n = 0): { start: number; end: number } {
  let at = -1;
  for (let i = 0; i <= n; i++) at = src.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`"${needle}" #${n} not in source`);
  return { start: at, end: at + needle.length };
}

describe("trailing content after the plan — E_PARSE", () => {
  it("a stray `}` mid-body: one E_PARSE on the first trailing token, related to the consumed `}`", () => {
    const { diagnostics } = compile(STRAY, { noCache: true });
    const errs = diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(1);
    const d = errs[0]!;
    expect(d.code).toBe("E_PARSE");
    // The first trailing token is the `room` keyword of the dropped statement…
    expect(d.span).toEqual(spanOf(STRAY, "room", 1));
    expect(d.message).toContain("after the plan was closed");
    expect(d.message).toContain('"room"');
    // …and the related span is the `}` that closed the plan early (line 4), not the last one.
    expect(d.relatedSpans).toEqual([{ span: spanOf(STRAY, "}", 0), message: "the plan was closed here" }]);
  });

  it("a second `plan` block gets its own message, spanned on the second `plan` keyword", () => {
    const { diagnostics } = compile(SECOND, { noCache: true });
    const errs = diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(1);
    const d = errs[0]!;
    expect(d.code).toBe("E_PARSE");
    expect(d.span).toEqual(spanOf(SECOND, "plan", 1));
    expect(d.message).toMatch(/^A second "plan" block after the plan was closed/);
    expect(d.relatedSpans).toEqual([{ span: spanOf(SECOND, "}", 0), message: "the plan was closed here" }]);
  });

  it("the rendered diagnostic carries the related note", () => {
    const d = compile(SECOND, { noCache: true }).diagnostics.find((x) => x.code === "E_PARSE")!;
    expect(formatDiagnostic(SECOND, d)).toContain("note: the plan was closed here");
  });

  it("lint() no longer judges the truncated plan (it used to warn about room a alone)", () => {
    // `lint()` runs no rule over a plan with an error diagnostic; before the guard it
    // linted the plan minus its dropped tail and reported W_ROOM_DISCONNECTED for `a`.
    expect(lint(STRAY)).toEqual([]);
    expect(lint(SECOND)).toEqual([]);
  });

  it("comments and whitespace after the plan are trivia and raise nothing", () => {
    const clean = 'plan "A" {\n  room id=a at (0,0) size 3000x3000\n}\n';
    const withTrivia = `${clean}# trailing comment\n\n   # another, indented\n\n`;
    const a = compile(clean, { noCache: true });
    const b = compile(withTrivia, { noCache: true });
    expect(b.diagnostics).toEqual(a.diagnostics);
    expect(b.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(b.svg).toBe(a.svg);
  });

  it("a missing closing `}` still reports only the missing brace (no trailing-content error)", () => {
    const src = 'plan "A" {\n  room id=a at (0,0) size 3000x3000\n';
    const errs = compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("end of input");
    expect(errs[0]!.relatedSpans).toBeUndefined();
  });

  it("reports only the FIRST trailing token, however long the tail", () => {
    const src = `${STRAY}}\n}\nroom id=c at (0,0) size 1x1\n${SECOND}`;
    const trailing = compile(src, { noCache: true }).diagnostics.filter((d) =>
      d.message.includes("after the plan was closed"),
    );
    expect(trailing).toHaveLength(1);
  });
});

describe("trailing content — format() now refuses instead of dropping the tail", () => {
  it("returns a stray-`}` file verbatim (it used to reformat it without room b)", () => {
    expect(format(STRAY)).toBe(STRAY);
  });

  it("returns a two-plan file verbatim (it used to reformat it without plan B)", () => {
    expect(format(SECOND)).toBe(SECOND);
  });

  it("still formats a clean plan followed only by a comment", () => {
    const src = 'plan "A" {\nroom id=a at (0,0) size 3000x3000\n}\n# tail\n';
    const out = format(src);
    expect(out).not.toBe(src);
    expect(out).toContain("# tail");
    expect(format(out)).toBe(out);
  });
});

describe("trailing content inside an imported module — E_IMPORT_PARSE at the import site", () => {
  const LIB = [
    'plan "lib" {',
    "  component box(x, y) { room at (x, y) size 1000x1000 }",
    "}",
    'plan "extra" {',
    "  component other(x, y) { room at (x, y) size 1000x1000 }",
    "}",
  ].join("\n");
  const PLAN = ['plan "P" {', '  import "lib.arch": box', "  box(0, 0)", "}"].join("\n");

  it("surfaces the module's trailing-content error as E_IMPORT_PARSE on the import statement", () => {
    const world = makeVirtualWorld({ "lib.arch": LIB });
    const errs = compile(PLAN, { world, noCache: true }).diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_IMPORT_PARSE"]);
    expect(errs[0]!.message).toMatch(/^In module "lib\.arch": A second "plan" block after the plan was closed/);
    expect(errs[0]!.span).toEqual(spanOf(PLAN, 'import "lib.arch": box'));
  });
});
