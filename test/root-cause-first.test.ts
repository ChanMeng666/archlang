/**
 * Card RM9.4: when one error causes a chain of diagnostics, the root is listed first and every
 * diagnostic that follows from it names it (`Diagnostic.cause`, `cause` in the JSON); numbers in
 * messages print through `src/num-format.ts` (`fmtMessage`), so float noise never shows.
 *
 * The rule is mechanical, set where the dependent is raised: an opening that finds no wall to stand
 * in, on an edge of a room a refused `walls from rooms` would have derived a wall for, follows from
 * that refusal (`ResolveCtx.derivationRefused` / `refusedDerivation`). `rootsFirst` then moves each
 * root to just before its first dependent and leaves every other diagnostic in its order. Nothing is
 * deleted: each dependent keeps its own report. A plan that compiles carries no `cause`, so its
 * diagnostics never move (the corpus law below).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, formatDiagnostic } from "../src/index.js";
import { type Diagnostic, rootsFirst } from "../src/diagnostics.js";
import { fmtMessage, fmtWritten, plainDigits } from "../src/num-format.js";
import { runArch } from "./helpers/cli.js";
import { corpusFiles, REPO_ROOT } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

/** Feet as a `let`: `12*FT` is 3657.6000000000004 in floats, each room snaps to whole mm on its own,
 *  and `b` (3658 + 3658 = 7316) overlaps `c` (at 24 ft = 7315) by 1 mm. */
const FEET = `plan "Feet" {
  grid 1
  let FT = 304.8
  room id=a at (0, 0) size 12*FT x 10*FT label "A"
  room id=b at (12*FT, 0) size 12*FT x 10*FT label "B"
  room id=c at (24*FT, 0) size 6*FT x 10*FT label "C"
  walls from rooms exterior 150 partition 100
  door between a and b at center width 800
  window on c.top width 900
  door on a.bottom at center width 900
}
`;

/** A thickness `walls from rooms` refuses derives no wall for any room it does not leave out. */
const THIN = `plan "Thin" {
  room id=a at (0, 0) size 3000x3000 label "A"
  room id=b at (3000, 0) size 3000x3000 label "B"
  walls from rooms exterior 0 partition 100 { except b }
  door between a and b at center width 800
  window on b.top width 900
  window on a.top width 900
}
`;

const at = (src: string, text: string): number => {
  const i = src.indexOf(text);
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
};
const rows = (ds: readonly Diagnostic[]): string[] => ds.map((d) => `${d.code}@${d.span?.start}`);

describe("a refused `walls from rooms` is listed before the openings it leaves without a wall", () => {
  const ds = compile(FEET, { noCache: true }).diagnostics;
  const root = ds.find((d) => d.code === "E_ROOMS_OVERLAP")!;
  const deps = ds.filter((d) => d.code === "E_OPENING_NO_SHARED_WALL");

  it("pins the order: the root moves to just before its first dependent, the rest keep theirs", () => {
    const walls = at(FEET, "walls from rooms");
    expect(rows(ds)).toEqual([
      `W_GRID_SNAPPED@${at(FEET, "12*FT x 10*FT")}`,
      `W_GRID_SNAPPED@${at(FEET, '12*FT x 10*FT label "B"')}`,
      `W_GRID_SNAPPED@${at(FEET, "6*FT x 10*FT")}`,
      `E_ROOMS_OVERLAP@${walls}`,
      `E_OPENING_NO_SHARED_WALL@${at(FEET, "between a and b")}`,
      `E_OPENING_NO_SHARED_WALL@${at(FEET, "on a.bottom")}`,
      `E_OPENING_NO_SHARED_WALL@${at(FEET, "on c.top")}`,
    ]);
    // The order before RM9.4 is this list with the root put back last (the resolver reports by
    // element kind, and `walls` comes after `door` and `window`).
    const before = rows(ds).filter((r) => !r.startsWith("E_ROOMS_OVERLAP"));
    expect([...before, `E_ROOMS_OVERLAP@${walls}`]).toEqual([
      `W_GRID_SNAPPED@${at(FEET, "12*FT x 10*FT")}`,
      `W_GRID_SNAPPED@${at(FEET, '12*FT x 10*FT label "B"')}`,
      `W_GRID_SNAPPED@${at(FEET, "6*FT x 10*FT")}`,
      `E_OPENING_NO_SHARED_WALL@${at(FEET, "between a and b")}`,
      `E_OPENING_NO_SHARED_WALL@${at(FEET, "on a.bottom")}`,
      `E_OPENING_NO_SHARED_WALL@${at(FEET, "on c.top")}`,
      `E_ROOMS_OVERLAP@${walls}`,
    ]);
  });

  it("deletes no dependent: every opening keeps its own report, which names the root", () => {
    expect(deps).toHaveLength(3);
    for (const d of deps) {
      expect(d.message).toMatch(/has no wall to stand in: no wall lies on the/);
      expect(d.cause).toEqual({ code: "E_ROOMS_OVERLAP", span: root.span });
      expect(d.relatedSpans).toEqual([{ span: root.span, message: "follows from the E_ROOMS_OVERLAP here" }]);
      expect(d.hints).toEqual([
        "Fix the `E_ROOMS_OVERLAP` this follows from first: `walls from rooms` refused, so it derived no wall here.",
      ]);
    }
    expect(root.cause).toBeUndefined();
  });

  it("prints the snapped sizes without float noise", () => {
    const snaps = ds.filter((d) => d.code === "W_GRID_SNAPPED").map((d) => d.message);
    expect(snaps).toEqual([
      'Room "a" size 3657.6 x 3048 was snapped to 3658 x 3048 by `grid 1`',
      'Room "b" size 3657.6 x 3048 was snapped to 3658 x 3048 by `grid 1`',
      'Room "c" size 1828.8 x 3048 was snapped to 1829 x 3048 by `grid 1`',
    ]);
    for (const d of ds) expect(d.message).not.toMatch(/\d\.\d{12,}/);
  });

  it("projects `cause` to JSON after `related`, located as `related` is", () => {
    const j = diagnosticToJson(FEET, deps[0]!);
    const line = FEET.slice(0, root.span!.start).split("\n").length;
    expect(j.cause).toEqual({ code: "E_ROOMS_OVERLAP", line, col: 3, span: [root.span!.start, root.span!.end] });
    expect(Object.keys(j.cause!)).toEqual(["code", "line", "col", "span"]);
    expect(Object.keys(j).slice(-2)).toEqual(["related", "cause"]);
    // The root itself carries neither key.
    expect(Object.keys(diagnosticToJson(FEET, root))).not.toContain("cause");
  });

  it("shows the root as a note in the text rendering", () => {
    expect(formatDiagnostic(FEET, deps[0]!)).toContain("note: follows from the E_ROOMS_OVERLAP here");
  });

  it("`arch validate --json` lists the root first among the errors and names it next", async () => {
    const r = await runArch(["validate", "-", "--json"], { input: FEET });
    const out = JSON.parse(r.stdout) as {
      diagnostics: Array<{ code: string; severity: string; cause?: { code: string } }>;
      next: { code: string };
    };
    const errors = out.diagnostics.filter((d) => d.severity === "error");
    expect(errors[0]!.code).toBe("E_ROOMS_OVERLAP");
    expect(errors.slice(1).map((d) => d.cause?.code)).toEqual([
      "E_ROOMS_OVERLAP",
      "E_ROOMS_OVERLAP",
      "E_ROOMS_OVERLAP",
    ]);
    expect(out.next.code).toBe("E_ROOMS_OVERLAP");
  });
});

describe("a refused thickness is the root too, only for the rooms the statement derives from", () => {
  const ds = compile(THIN, { noCache: true }).diagnostics;

  it("lists E_WALL_THICKNESS first; an opening on a room `except` leaves out names no root", () => {
    const span = ds[0]!.span;
    expect(rows(ds)).toEqual([
      `E_WALL_THICKNESS@${at(THIN, "walls from rooms")}`,
      `E_OPENING_NO_SHARED_WALL@${at(THIN, "between a and b")}`,
      `E_OPENING_NO_SHARED_WALL@${at(THIN, "on b.top")}`,
      `E_OPENING_NO_SHARED_WALL@${at(THIN, "on a.top")}`,
    ]);
    const [, between, onB, onA] = ds;
    expect(between!.cause).toEqual({ code: "E_WALL_THICKNESS", span });
    expect(onA!.cause).toEqual({ code: "E_WALL_THICKNESS", span });
    // `b` is left out: no wall would stand on its top edge whatever the thickness.
    expect(onB!.cause).toBeUndefined();
    expect(onB!.relatedSpans).toBeUndefined();
    expect(onB!.hints).toEqual([
      "Add the wall (`walls from rooms` derives it, or write it by hand on that line), or place the opening on a wall that exists.",
    ]);
  });
});

describe("rootsFirst", () => {
  const d = (code: string, start: number, extra: Partial<Diagnostic> = {}): Diagnostic => ({
    severity: code.startsWith("E_") ? "error" : "warning",
    message: code,
    code,
    span: { start, end: start + 1 },
    ...extra,
  });
  const cause = (code: string, start: number): Diagnostic["cause"] => ({ code, span: { start, end: start + 1 } });

  it("returns a list without a cause as the same array", () => {
    const list = [d("W_A", 1), d("E_B", 2)];
    expect(rootsFirst(list)).toBe(list);
  });

  it("moves every root of a cause together, in its own order, before the first dependent", () => {
    const list = [
      d("W_A", 1),
      d("E_DEP", 5, { cause: cause("E_ROOT", 9) }),
      d("W_B", 2),
      d("E_ROOT", 9, { message: "first" }),
      d("E_DEP", 6, { cause: cause("E_ROOT", 9) }),
      d("E_ROOT", 9, { message: "second" }),
    ];
    expect(rootsFirst(list).map((x) => `${x.code}:${x.message}@${x.span!.start}`)).toEqual([
      "W_A:W_A@1",
      "E_ROOT:first@9",
      "E_ROOT:second@9",
      "E_DEP:E_DEP@5",
      "W_B:W_B@2",
      "E_DEP:E_DEP@6",
    ]);
  });

  it("leaves a root already before its dependents where it is, and a cause with no root alone", () => {
    const list = [d("E_ROOT", 9), d("W_A", 1), d("E_DEP", 5, { cause: cause("E_ROOT", 9) })];
    expect(rootsFirst(list)).toEqual(list);
    const orphan = [d("W_A", 1), d("E_DEP", 5, { cause: cause("E_GONE", 3) })];
    expect(rootsFirst(orphan)).toEqual(orphan);
  });

  it("matches the root in the dependent's own instance and file", () => {
    const list = [
      d("E_DEP", 5, { instance: "w", cause: cause("E_ROOT", 9) }),
      d("E_ROOT", 9),
      d("E_ROOT", 9, { instance: "w", file: "m.arch" }),
      d("E_ROOT", 9, { instance: "w" }),
    ];
    expect(rootsFirst(list).map((x) => `${x.code}:${x.instance ?? ""}:${x.file ?? ""}`)).toEqual([
      "E_ROOT:w:",
      "E_DEP:w:",
      "E_ROOT::",
      "E_ROOT:w:m.arch",
    ]);
  });

  it("places a chain root-first and ends on a cycle", () => {
    const chain = [d("E_C", 3, { cause: cause("E_B", 2) }), d("E_B", 2, { cause: cause("E_A", 1) }), d("E_A", 1)];
    expect(rootsFirst(chain).map((x) => x.code)).toEqual(["E_A", "E_B", "E_C"]);
    const cycle = [d("E_X", 1, { cause: cause("E_Y", 2) }), d("E_Y", 2, { cause: cause("E_X", 1) })];
    expect(rootsFirst(cycle).map((x) => x.code)).toEqual(["E_Y", "E_X"]);
  });
});

describe("fmtMessage: a message's number, without float noise", () => {
  it("drops the noise of a float product or sum, and keeps a written value whole", () => {
    expect(fmtMessage(12 * 304.8)).toBe("3657.6");
    expect(fmtMessage(0.1 + 0.2)).toBe("0.3");
    expect(fmtMessage(2749.9999)).toBe("2749.9999");
    expect(fmtMessage(1e-7)).toBe("0.0000001");
    expect(fmtWritten(12 * 304.8)).toBe("3657.6");
    expect(fmtWritten(2749.9999)).toBe("2749.9999");
    expect(fmtWritten(2750)).toBe("2750");
  });

  it("is plainDigits exactly for every double whose shortest form has at most 15 significant digits", () => {
    /** Significant digits of a decimal (no exponent): its digits, less the zeros at either end. */
    const sig = (s: string): number => {
      const digits = Array.from(s).filter((c) => c >= "0" && c <= "9");
      const first = digits.findIndex((c) => c !== "0");
      if (first < 0) return 0;
      let last = digits.length - 1;
      while (digits[last] === "0") last--;
      return last - first + 1;
    };
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (n) => {
        const p = plainDigits(n);
        if (sig(String(n).replace(/e.*$/, "")) <= 15) expect(fmtMessage(n)).toBe(p);
        else expect(Math.abs(Number(fmtMessage(n)) - n)).toBeLessThanOrEqual(Math.abs(n) * 1e-14);
      }),
      { seed: 9_4, numRuns: 2000 },
    );
    // Decimals as an author writes them, up to 15 digits, always print as written.
    fc.assert(
      fc.property(fc.integer({ min: -(10 ** 9), max: 10 ** 9 }), fc.integer({ min: 0, max: 6 }), (k, dp) => {
        const n = k / 10 ** dp;
        expect(fmtMessage(n)).toBe(plainDigits(n));
      }),
      { seed: 9_4, numRuns: 2000 },
    );
  });
});

describe("over the corpus", () => {
  it("a plan that compiles names no cause, so its diagnostics keep their order; a named root is listed first", () => {
    let compiled = 0;
    for (const f of corpusFiles()) {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      const ds = compile(src, { noCache: true, world: worldFor(dirname(join(REPO_ROOT, f))) }).diagnostics;
      const failing = ds.some((d) => d.severity === "error");
      if (!failing) {
        compiled++;
        expect(
          ds.filter((d) => d.cause !== undefined).map((d) => d.code),
          f,
        ).toEqual([]);
      }
      ds.forEach((d, i) => {
        if (!d.cause) return;
        const r = ds.findIndex(
          (x) =>
            x.code === d.cause!.code &&
            x.span?.start === d.cause!.span.start &&
            x.span?.end === d.cause!.span.end &&
            x.file === d.cause!.file &&
            x.instance === d.instance,
        );
        expect(r, `${f}: ${d.code}@${d.span?.start}`).toBeGreaterThanOrEqual(0);
        expect(r, `${f}: ${d.code}@${d.span?.start}`).toBeLessThan(i);
      });
    }
    expect(compiled).toBeGreaterThan(50);
  });
});
