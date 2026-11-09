import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { capDiagnostics, LIMIT_CODES, MAX_DIAGNOSTICS, offsetToLineCol } from "../src/diagnostics.js";
import { MAX_RUN_TREADS, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { compile, describe as describePlan, ERROR_CATALOG, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { lex } from "../src/lexer.js";

/**
 * The oracle: `offsetToLineCol` as it was before the line-start table (EH1.11) — a scan
 * from byte 0 on every call. Only `\n` ends a line; a `\r` (lone, or before `\n`) is an
 * ordinary column. The table version must return the same numbers for every source and
 * every offset, clamped, fractional and NaN included.
 */
function oracle(source: string, offset: number): { line: number; col: number } {
  const o = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let col = 1;
  for (let k = 0; k < o; k++) {
    if (source[k] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/** Sources made of the characters a line table can get wrong. */
const lineySource = fc
  .array(fc.constantFrom("a", " ", "\n", "\r", "\r\n", "\n\n", "é", "\t", "\u0000"), { maxLength: 200 })
  .map((parts) => parts.join(""));

describe("offsetToLineCol — line-start table agrees with the scan", () => {
  it("random sources (CRLF, lone CR, empty, trailing newline) and random offsets", () => {
    fc.assert(
      fc.property(
        lineySource,
        fc.array(fc.oneof(fc.integer({ min: -5, max: 260 }), fc.double({ min: -5, max: 260, noNaN: false })), {
          minLength: 1,
          maxLength: 20,
        }),
        (src, offsets) => {
          for (const o of offsets) expect(offsetToLineCol(src, o)).toEqual(oracle(src, o));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("edge sources", () => {
    for (const src of ["", "\n", "\r", "\r\n", "a\n", "a\r\n", "\n\n\n", "a\rb\nc", "x"]) {
      for (let o = -1; o <= src.length + 1; o++) expect(offsetToLineCol(src, o)).toEqual(oracle(src, o));
      for (const o of [Infinity, -Infinity, NaN, 0.5, 1.5]) expect(offsetToLineCol(src, o)).toEqual(oracle(src, o));
    }
  });

  it("10k random offsets of a 1 MB source agree with the oracle", () => {
    const rows: string[] = [];
    let n = 0;
    for (let i = 0; n < 1_000_000; i++) {
      const row = `${"r".repeat(i % 97)}${i % 5 === 0 ? "\r\n" : i % 7 === 0 ? "\r" : "\n"}`;
      rows.push(row);
      n += row.length;
    }
    const src = rows.join("");
    // The oracle is itself O(offset); compare at sorted offsets with one incremental scan.
    let seed = 12345;
    const offsets = Array.from({ length: 10_000 }, () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed % (src.length + 1);
    }).sort((a, b) => a - b);
    let k = 0;
    let line = 1;
    let col = 1;
    for (const o of offsets) {
      for (; k < o; k++) {
        if (src[k] === "\n") {
          line++;
          col = 1;
        } else col++;
      }
      expect(offsetToLineCol(src, o)).toEqual({ line, col });
    }
  });

  // The ONE time-based smoke for the uncapped path: callers outside compile() (the CLI, the LSP,
  // `formatDiagnostic`) call offsetToLineCol without the 500 cap. 200,000 calls over 1 MB are
  // about 2·10^11 byte reads for the old from-byte-0 scan (minutes); the line table takes well
  // under a second. Reverting commit 1 turns this red.
  it("smoke: 200,000 calls over a 1 MB source finish within 10 s", () => {
    const src = "abcdefghi\n".repeat(100_000); // 1,000,000 bytes, 100,000 lines
    let seed = 987654321;
    let sum = 0;
    const t0 = performance.now();
    for (let n = 0; n < 200_000; n++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      sum += offsetToLineCol(src, seed % (src.length + 1)).line;
    }
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(sum).toBeGreaterThan(0);
  });
});

const K = 64 * 1024;
const fill = (unit: string, bytes: number): string => unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes);
const plan = (body: string): string => `plan "p" {\n${body}\n}\n`;

/** The flood inputs of the security audit (S-F1); each once cost seconds of line/column scans. */
const FLOODS: readonly (readonly [string, string])[] = [
  ["64 KiB of @", fill("@", K)],
  ["64 KiB of NUL", fill("\u0000", K)],
  ["5,000 lines of a room with a stray word", "room at (0,0) size 1x1 zzz\n".repeat(5000)],
  ["8,000 unclosed zones", 'zone "a" {\n'.repeat(8000)],
  ["20,000 re-declarations", "let a = 1\n".repeat(20000)],
  ["600 errors from one statement in a loop", "for i in 0..600 { let x = 1 / 0 }"],
];

describe("diagnostics are capped at MAX_DIAGNOSTICS, then one E_DIAGNOSTIC_LIMIT (EH-D8)", () => {
  it("the cap is 500 and its code is catalogued as an error", () => {
    expect(MAX_DIAGNOSTICS).toBe(500);
    expect(ERROR_CATALOG.E_DIAGNOSTIC_LIMIT?.severity).toBe("error");
  });

  for (const [name, body] of FLOODS) {
    it(`${name}: exactly 500 diagnostics, then the limit, in compile() and describe()`, () => {
      const src = plan(body);
      const r = compile(src, { noCache: true });
      expect(r.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
      const last = r.diagnostics.at(-1)!;
      expect(last.code).toBe("E_DIAGNOSTIC_LIMIT");
      expect(last.severity).toBe("error");
      expect(r.diagnostics.filter((d) => d.code === "E_DIAGNOSTIC_LIMIT")).toHaveLength(1);
      expect(r.errors).toHaveLength(r.diagnostics.filter((d) => d.severity === "error").length);
      expect(r.svg).toBe("");
      // The span is the byte just past the 500th diagnostic's span.
      const kept = r.diagnostics[MAX_DIAGNOSTICS - 1]!;
      const at = kept.span ? kept.span.end : src.length;
      expect(last.span).toEqual({ start: at, end: Math.min(at + 1, src.length) });
      const d = describePlan(src);
      expect(d.ok).toBe(false);
      expect(d.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
      expect(d.diagnostics.at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    });
  }

  it("64 KiB of @: the lexer keeps one past the cap, parse() reports exactly 501", () => {
    const src = fill("@", K);
    expect(lex(src).errors).toHaveLength(MAX_DIAGNOSTICS + 1);
    const p = parse(src);
    expect(p.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(p.diagnostics.at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    // The 500th `@` is at byte 499, so the limit sits at byte 500.
    expect(p.diagnostics.at(-1)!.span).toEqual({ start: 500, end: 501 });
  });

  it("at the cap nothing changes: 500 diagnostics are returned as is, the same array", () => {
    const list: Diagnostic[] = Array.from({ length: MAX_DIAGNOSTICS }, (_, i) => ({
      severity: "error",
      message: "m",
      code: "E_PARSE",
      span: { start: i, end: i + 1 },
    }));
    expect(capDiagnostics(list, 1000)).toBe(list);
    const over = [...list, list[0]!];
    const capped = capDiagnostics(over, 1000);
    expect(capped).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(capped.at(-1)!.span).toEqual({ start: MAX_DIAGNOSTICS, end: MAX_DIAGNOSTICS + 1 });
    // Idempotent: capping a capped list (parse, then compile) keeps its one limit.
    expect(capDiagnostics([...capped, list[1]!], 1000)).toEqual(capped);
  });

  it("an error past the cap still makes the limit an error (it is not the kept list's severity)", () => {
    const warn = (i: number): Diagnostic => ({
      severity: "warning",
      message: "w",
      code: "W_DUP_ACC_METADATA",
      span: { start: i, end: i + 1 },
    });
    const warnings = Array.from({ length: 600 }, (_, i) => warn(i));
    expect(capDiagnostics(warnings, 1000).at(-1)!.code).toBe("W_DIAGNOSTIC_LIMIT");
    // An error appended after the warnings (the drawing budget, the API pen check) is cut, but counts.
    const late: Diagnostic = { severity: "error", message: "e", code: "E_DRAW_BUDGET" };
    expect(capDiagnostics([...warnings, late], 1000).at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    // A producer's dropped error counts too.
    expect(capDiagnostics(warnings, 1000, true).at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    // An upstream W_ limit is upgraded when a later stage adds an error, and keeps its span.
    const parsed = capDiagnostics(warnings, 1000);
    const merged = capDiagnostics([...parsed, late], 1000);
    expect(merged.at(-1)).toMatchObject({ code: "E_DIAGNOSTIC_LIMIT", severity: "error", span: parsed.at(-1)!.span });
    expect(capDiagnostics([...parsed, warn(0)], 1000)).toEqual(parsed);
  });

  it("600 warnings only: W_DIAGNOSTIC_LIMIT, and the plan still draws, describes and lints", () => {
    const src = plan(`room id=a at (0,0) size 3000x3000\n${'accTitle "a"\n'.repeat(600)}`);
    const r = compile(src, { noCache: true });
    expect(r.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(r.diagnostics.at(-1)).toMatchObject({ code: "W_DIAGNOSTIC_LIMIT", severity: "warning" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(r.svg.length).toBeGreaterThan(0);
    const d = describePlan(src);
    expect(d.ok).toBe(true);
    expect(d.diagnostics.at(-1)!.code).toBe("W_DIAGNOSTIC_LIMIT");
    expect(Array.isArray(lint(src))).toBe(true);
  });

  it("the same 600 warnings and then a parse error past the cap: E_DIAGNOSTIC_LIMIT", () => {
    const src = plan(`room id=a at (0,0) size 3000x3000\n${'accTitle "a"\n'.repeat(600)}room at (0,0) size\n`);
    const p = parse(src);
    expect(p.diagnostics.slice(0, MAX_DIAGNOSTICS).every((x) => x.severity === "warning")).toBe(true);
    expect(p.diagnostics.at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    const r = compile(src, { noCache: true });
    expect(r.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(r.diagnostics.at(-1)).toMatchObject({ code: "E_DIAGNOSTIC_LIMIT", severity: "error" });
    expect(r.svg).toBe("");
    expect(describePlan(src).ok).toBe(false);
  });

  it("LIMIT_CODES is every catalogue code naming a LIMIT or BUDGET, bar the marker", () => {
    const named = Object.keys(ERROR_CATALOG)
      .filter((c) => /LIMIT|BUDGET/.test(c) && !c.endsWith("_DIAGNOSTIC_LIMIT"))
      .sort();
    expect([...LIMIT_CODES].sort()).toEqual(named);
  });

  it("a limit-class diagnostic is never dropped: kept in order, the marker last", () => {
    const ord = (i: number): Diagnostic => ({
      severity: "error",
      message: "e",
      code: "E_UNKNOWN_REF",
      span: { start: i, end: i + 1 },
    });
    const step: Diagnostic = { severity: "error", message: "s", code: "E_STEP_LIMIT", span: { start: 3, end: 4 } };
    const list = [...Array.from({ length: 700 }, (_, i) => ord(i)), step];
    const capped = capDiagnostics(list, 1000);
    expect(capped).toHaveLength(MAX_DIAGNOSTICS + 2);
    expect(capped.at(-2)).toBe(step);
    expect(capped.at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    expect(capped.at(-1)!.span).toEqual({ start: MAX_DIAGNOSTICS, end: MAX_DIAGNOSTICS + 1 });
    // 500 ordinary diagnostics plus limit-class ones is not over the cap: the same array.
    const atCap = [...Array.from({ length: MAX_DIAGNOSTICS }, (_, i) => ord(i)), step, step];
    expect(capDiagnostics(atCap, 1000)).toBe(atCap);
    // A marker from upstream moves to the end, after a later limit-class diagnostic.
    expect(capDiagnostics([...capped.slice(0, -2), capped.at(-1)!, step], 1000).slice(-2)).toEqual([
      step,
      capped.at(-1),
    ]);
  });

  it("M.2's nested loops with an unknown name: E_STEP_LIMIT survives the flood, then the marker", () => {
    const src = plan("room id=a at (0,0) size 3000x3000\n  for i in 0..100000 { for j in 0..1000 { let x = nope } }");
    const r = compile(src, { noCache: true });
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toContain("E_STEP_LIMIT");
    expect(codes.at(-1)).toBe("E_DIAGNOSTIC_LIMIT");
    expect(codes.filter((c) => c === "E_DIAGNOSTIC_LIMIT")).toHaveLength(1);
  });

  it("a warning flood and a drawing past the budget: E_DRAWING_LIMIT survives, and the marker is the error", () => {
    const run = MAX_RUN_TREADS * TREAD_GOING_MM;
    const src = plan(
      `${'accTitle "a"\n'.repeat(600)}  for i in 0..500 { escalator at (0, 10000 + i * 2000) size ${run}x1200 dir up }`,
    );
    const r = compile(src, { noCache: true });
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toContain("E_DRAWING_LIMIT");
    expect(codes.at(-1)).toBe("E_DIAGNOSTIC_LIMIT");
    expect(r.svg).toBe("");
  });

  it("a plan with exactly 500 errors is reported in full, with no limit", () => {
    const r = compile(plan("for i in 0..499 { let x = 1 / 0 }"), { noCache: true }); // `..` is inclusive
    expect(r.diagnostics).toHaveLength(MAX_DIAGNOSTICS);
    expect(r.diagnostics.some((d) => d.code === "E_DIAGNOSTIC_LIMIT")).toBe(false);
  });

  // A smoke bound, not a count: the counts above are the proof. It only catches a return of
  // the quadratic line/column scan (the 64 KiB NUL flood alone took 8.5 s before).
  it("smoke: every flood compiles within a generous bound", () => {
    const t0 = performance.now();
    for (const [, body] of FLOODS) compile(plan(body), { noCache: true });
    expect(performance.now() - t0).toBeLessThan(30_000);
  });
});
