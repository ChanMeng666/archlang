import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { lex } from "../src/lexer.js";
import { formatDiagnostic, offsetToLineCol } from "../src/diagnostics.js";
import type { Diagnostic } from "../src/diagnostics.js";

describe("lexer — byte-offset spans", () => {
  it("token spans index back to their exact source substring", () => {
    const src = "wall exterior thickness 200";
    const { tokens } = lex(src);
    for (const t of tokens) {
      if (t.type === "ident" || t.type === "number" || t.type === "dimension") {
        expect(src.slice(t.start, t.end)).toBe(t.value);
      }
    }
    const ex = tokens.find((t) => t.value === "exterior")!;
    expect(ex.start).toBe(5);
    expect(ex.end).toBe(13);
  });

  it("collects every lexical error, not just the first", () => {
    const { errors } = lex("@ $");
    expect(errors).toHaveLength(2);
    expect(errors[0].span).toEqual({ start: 0, end: 1 });
    expect(errors[1].span).toEqual({ start: 2, end: 3 });
  });
});

describe("offsetToLineCol", () => {
  it("maps offsets to 1-based line/col and clamps out-of-range", () => {
    const src = "ab\ncde";
    expect(offsetToLineCol(src, 0)).toEqual({ line: 1, col: 1 });
    expect(offsetToLineCol(src, 3)).toEqual({ line: 2, col: 1 });
    expect(offsetToLineCol(src, 5)).toEqual({ line: 2, col: 3 });
    expect(offsetToLineCol(src, 999)).toEqual({ line: 2, col: 4 });
  });
});

describe("formatDiagnostic — codespan frames", () => {
  it("frames an error with code, caret span, and a hint", () => {
    const src = "room id=bed at (0,0) size 0x4000";
    const d: Diagnostic = {
      severity: "error",
      code: "E_ROOM_SIZE",
      message: 'room "bed" must have a positive size',
      span: { start: 26, end: 32 },
      hints: ["did you mean 3000x4000?"],
    };
    expect(formatDiagnostic(src, d)).toMatchInlineSnapshot(`
      "error[E_ROOM_SIZE]: room "bed" must have a positive size
        --> 1:27
        |
      1 | room id=bed at (0,0) size 0x4000
        |                           ^^^^^^
        = help: did you mean 3000x4000?"
    `);
  });

  it("frames a warning without a code", () => {
    const src = "door id=d1 at (2000,2000) width 900";
    const d: Diagnostic = {
      severity: "warning",
      message: 'door "d1" does not lie on any wall',
      span: { start: 0, end: 4 },
    };
    expect(formatDiagnostic(src, d)).toMatchInlineSnapshot(`
      "warning: door "d1" does not lie on any wall
        --> 1:1
        |
      1 | door id=d1 at (2000,2000) width 900
        | ^^^^"
    `);
  });

  it("renders just the header when there is no span", () => {
    const d: Diagnostic = { severity: "warning", message: "nothing to draw" };
    expect(formatDiagnostic("", d)).toBe("warning: nothing to draw");
  });
});

describe("parser — error recovery + multi-error collection", () => {
  const src = [
    'plan "E" {',
    '  room id=a at (0,0) size 1000x1000 label "A"',
    "  grid xyz",
    "  door foo at (0,0) width 900",
    '  room id=b at (9000,0) size 1000x1000 label "B"',
    "  scale foo",
    "}",
  ].join("\n");

  it("reports all three statement errors in one pass", () => {
    const { diagnostics } = compile(src, { noCache: true });
    const errs = diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(3);
    for (const e of errs) expect(e.span).toBeDefined();
  });

  it("still produces a partial AST containing the well-formed statements", () => {
    const { ast } = compile(src, { noCache: true });
    const rooms = ast?.body.filter((e) => e.kind === "room") ?? [];
    expect(rooms.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("aborts rendering when any error is present", () => {
    const { svg, errors } = compile(src, { noCache: true });
    expect(svg).toBe("");
    expect(errors).toHaveLength(3);
    expect(errors[0].line).toBeTypeOf("number");
  });
});

describe("compile — warnings never block rendering", () => {
  const src = [
    'plan "E" {',
    "  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }",
    "  door id=d at (2000,2000) width 900",
    "}",
  ].join("\n");

  it("emits a warning diagnostic but still renders", () => {
    const { svg, errors, warnings, diagnostics } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(warnings.some((w) => /does not lie on any wall/.test(w.message))).toBe(true);
    expect(diagnostics.some((d) => d.severity === "warning" && d.code === "W_DOOR_OFF_WALL")).toBe(true);
  });
});

describe("compile — diagnostics shape is append-only", () => {
  it("exposes diagnostics alongside the unchanged legacy fields", () => {
    const { diagnostics, errors, warnings, svg } = compile(`plan "X" { room id=r at (0,0) size 1000x1000 label "R" }`, {
      noCache: true,
    });
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(Array.isArray(errors)).toBe(true);
    expect(Array.isArray(warnings)).toBe(true);
    expect(typeof svg).toBe("string");
  });
});
