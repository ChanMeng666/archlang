/**
 * Card RM9.4: when one error causes a chain of diagnostics, the root is listed first and every
 * diagnostic that follows from it names it (`Diagnostic.cause`, `cause` in the JSON); numbers in
 * messages print through `src/num-format.ts` (`fmtMessage`), so float noise never shows.
 *
 * The rule is mechanical, set where the dependent is raised. A refused `walls from rooms` records
 * its refusal (`ResolveCtx.derivationRefused`); then an opening that finds no wall to stand in on an
 * edge of a room the statement derives from, and a door between two rooms it refused for
 * overlapping, follow from it (`refusedDerivation`). `rootsFirst` moves each root to just before its
 * first dependent and leaves every other diagnostic in its order. Nothing is deleted: each dependent
 * keeps its own report. Only a failing plan's ORDER moves; a message's NUMBER moves on any plan,
 * compiling ones included, where the old text printed float noise (the table at the end pins one
 * plan per message).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, formatDiagnostic, lint, makeVirtualWorld } from "../src/index.js";
import { type Diagnostic, MAX_DIAGNOSTICS, rootsFirst } from "../src/diagnostics.js";
import { fmtMessage, fmtWritten } from "../src/num-format.js";
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

/** `FEET`'s `compile().diagnostics` on `main` before RM9.4 (a7924a73), as `code@span.start`: the
 *  resolver reports by element kind, and `walls` comes after `door` and `window`. */
const FEET_BEFORE = [
  "W_GRID_SNAPPED@67",
  "W_GRID_SNAPPED@122",
  "W_GRID_SNAPPED@177",
  "E_OPENING_NO_SHARED_WALL@253",
  "E_OPENING_NO_SHARED_WALL@324",
  "E_OPENING_NO_SHARED_WALL@298",
  "E_ROOMS_OVERLAP@202",
];

/** The card's simplest case: two rooms that overlap by 1 mm, and a door between them. */
const OVERLAP = `plan "Overlap" {
  room id=a at (0, 0) size 3000x3000 label "A"
  room id=b at (2999, 0) size 3000x3000 label "B"
  walls from rooms exterior 150 partition 100
  door between a and b at center width 800
  window on a.top width 900
}
`;
/** `OVERLAP` on `main` before RM9.4, as `FEET_BEFORE`. */
const OVERLAP_BEFORE = ["E_WALL_BETWEEN_NOT_ADJACENT@167", "E_OPENING_NO_SHARED_WALL@212", "E_ROOMS_OVERLAP@116"];

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
const ROOT_NOTE = (code: string) => `follows from the ${code} here`;

describe("a refused `walls from rooms` is listed before the openings it leaves without a wall", () => {
  const ds = compile(FEET, { noCache: true }).diagnostics;
  const root = ds.find((d) => d.code === "E_ROOMS_OVERLAP")!;
  const deps = ds.filter((d) => d.code === "E_OPENING_NO_SHARED_WALL");

  it("moves only the root, to just before its first dependent: the rest keep main's order", () => {
    expect(rows(ds)).toEqual([
      ...FEET_BEFORE.slice(0, 3),
      `E_ROOMS_OVERLAP@${root.span!.start}`,
      ...FEET_BEFORE.slice(3, 6),
    ]);
    expect(root.span!.start).toBe(at(FEET, "walls from rooms"));
    // The same diagnostics as before, none dropped and none added.
    expect([...rows(ds)].sort()).toEqual([...FEET_BEFORE].sort());
  });

  it("deletes no dependent: every opening keeps its own report, which names the root", () => {
    expect(deps).toHaveLength(3);
    for (const d of deps) {
      expect(d.message).toMatch(/has no wall to stand in: no wall lies on the/);
      expect(d.cause).toEqual({ code: "E_ROOMS_OVERLAP", span: root.span });
      expect(d.relatedSpans).toEqual([{ span: root.span, message: ROOT_NOTE("E_ROOMS_OVERLAP") }]);
      expect(d.hints).toEqual([
        "Fix the `E_ROOMS_OVERLAP` this follows from first: `walls from rooms` refused, so it derived no wall here.",
      ]);
    }
    expect(root.cause).toBeUndefined();
  });

  it("prints the snapped sizes without float noise", () => {
    expect(ds.filter((d) => d.code === "W_GRID_SNAPPED").map((d) => d.message)).toEqual([
      'Room "a" size 3657.6 x 3048 was snapped to 3658 x 3048 by `grid 1`',
      'Room "b" size 3657.6 x 3048 was snapped to 3658 x 3048 by `grid 1`',
      'Room "c" size 1828.8 x 3048 was snapped to 1829 x 3048 by `grid 1`',
    ]);
  });

  it("projects `cause` to JSON after `related`, and a `fix` that agrees with the hint", () => {
    const j = diagnosticToJson(FEET, deps[0]!);
    const line = FEET.slice(0, root.span!.start).split("\n").length;
    expect(j.cause).toEqual({ code: "E_ROOMS_OVERLAP", line, col: 3, span: [root.span!.start, root.span!.end] });
    expect(Object.keys(j.cause!)).toEqual(["code", "line", "col", "span"]);
    expect(Object.keys(j).slice(-2)).toEqual(["related", "cause"]);
    // The catalogue's "Add the wall …" would contradict the hint: the dependent's `fix` names the root.
    expect(j.fix).toBe("Fix the diagnostic `cause` names first: this one follows from it.");
    const root_ = diagnosticToJson(FEET, root);
    expect(Object.keys(root_)).not.toContain("cause");
    expect(root_.fix).toMatch(/^Move or resize the rooms/);
  });

  it("shows the root as a note in the text rendering", () => {
    expect(formatDiagnostic(FEET, deps[0]!)).toContain(`note: ${ROOT_NOTE("E_ROOMS_OVERLAP")}`);
  });

  it("`arch validate --json` lists the root first among the errors and names it next", async () => {
    const r = await runArch(["validate", "-", "--json"], { input: FEET });
    const out = JSON.parse(r.stdout) as {
      diagnostics: Array<{ code: string; severity: string; cause?: { code: string } }>;
      next: { code: string };
    };
    const errors = out.diagnostics.filter((d) => d.severity === "error");
    expect(errors.map((d) => d.cause?.code ?? d.code)).toEqual(Array(4).fill("E_ROOMS_OVERLAP"));
    expect(errors[0]!.cause).toBeUndefined();
    expect(out.next.code).toBe("E_ROOMS_OVERLAP");
  });
});

describe("two rooms that overlap share no edge: a door between them follows from the overlap", () => {
  it("lists E_ROOMS_OVERLAP first, and the door and window name it", () => {
    const ds = compile(OVERLAP, { noCache: true }).diagnostics;
    expect(rows(ds)).toEqual([OVERLAP_BEFORE[2], OVERLAP_BEFORE[0], OVERLAP_BEFORE[1]]);
    const root = ds[0]!;
    const [, door, window] = ds;
    expect(door!.cause).toEqual({ code: "E_ROOMS_OVERLAP", span: root.span });
    expect(door!.hints).toEqual([
      "Fix the `E_ROOMS_OVERLAP` this follows from first: the rooms overlap, so they share no edge.",
    ]);
    expect(door!.relatedSpans).toEqual([{ span: root.span, message: ROOT_NOTE("E_ROOMS_OVERLAP") }]);
    expect(window!.cause).toEqual({ code: "E_ROOMS_OVERLAP", span: root.span });
  });

  it("names the overlap only for the pair it refused", () => {
    // `b` overlaps `c`; `a` and `b` simply do not touch, so the door between them names no root.
    const src = `plan "Apart" {
  room id=a at (0, 0) size 3000x3000 label "A"
  room id=b at (4000, 0) size 3000x3000 label "B"
  room id=c at (6999, 0) size 3000x3000 label "C"
  walls from rooms exterior 150 partition 100
  door between a and b at center width 800
}
`;
    const door = compile(src, { noCache: true }).diagnostics.find((d) => d.code === "E_WALL_BETWEEN_NOT_ADJACENT")!;
    expect(door.cause).toBeUndefined();
    expect(door.hints).toEqual([
      "Name two rooms that meet along an edge, or place the opening `on <wall> at …` or `at (x,y)`.",
    ]);
  });

  it("with no `walls from rooms` there is no root: the door's error is the plan's only one, unchanged", () => {
    const src = OVERLAP.replace("  walls from rooms exterior 150 partition 100\n", "").replace(
      "  window on a.top width 900\n",
      "  wall exterior thickness 150 { (0,0) (5999,0) (5999,3000) (0,3000) close }\n",
    );
    const ds = compile(src, { noCache: true }).diagnostics;
    expect(ds.map((d) => d.code)).toEqual(["E_WALL_BETWEEN_NOT_ADJACENT"]);
    expect(ds[0]!.cause).toBeUndefined();
  });

  it("links them the same way inside a `place`d instance", () => {
    const body = OVERLAP.slice(OVERLAP.indexOf("{") + 1, OVERLAP.lastIndexOf("}"));
    const src = `plan "Placed" {\n  component wing() {${body}  }\n  place wing() as w at (0, 0)\n}\n`;
    const ds = compile(src, { noCache: true }).diagnostics;
    expect(ds.map((d) => d.code)).toEqual([
      "E_ROOMS_OVERLAP",
      "E_WALL_BETWEEN_NOT_ADJACENT",
      "E_OPENING_NO_SHARED_WALL",
    ]);
    const root = ds[0]!;
    for (const d of ds.slice(1)) {
      expect(d.instance).toBe("w");
      expect(d.cause).toEqual({ code: "E_ROOMS_OVERLAP", span: root.span });
      expect(d.relatedSpans?.[0]).toEqual({ span: root.span, message: ROOT_NOTE("E_ROOMS_OVERLAP") });
    }
  });

  it("names a root in an imported module by `file`, in `cause` and in the note, with no line/col", () => {
    const world = makeVirtualWorld({ "wing.arch": OVERLAP });
    const main = `plan "Main" {\n  import "wing.arch" as wing\n  place wing() as w at (0, 0)\n}\n`;
    const ds = compile(main, { noCache: true, world }).diagnostics;
    expect(ds.map((d) => d.code)).toEqual([
      "E_ROOMS_OVERLAP",
      "E_WALL_BETWEEN_NOT_ADJACENT",
      "E_OPENING_NO_SHARED_WALL",
    ]);
    const root = ds[0]!;
    expect(root.file).toBe("wing.arch");
    const j = diagnosticToJson(main, ds[2]!);
    expect(j.cause).toEqual({ code: "E_ROOMS_OVERLAP", span: [root.span!.start, root.span!.end], file: "wing.arch" });
    expect(j.related?.[0]).toEqual({
      message: ROOT_NOTE("E_ROOMS_OVERLAP"),
      span: [root.span!.start, root.span!.end],
      file: "wing.arch",
    });
  });
});

describe("a refused thickness is the root too, only for the rooms the statement derives from", () => {
  it("lists E_WALL_THICKNESS first; an opening on a room `except` leaves out names no root", () => {
    const ds = compile(THIN, { noCache: true }).diagnostics;
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

  it("a duplicate statement is never a root, whatever its thickness", () => {
    const src = OVERLAP.replace(
      "  walls from rooms exterior 150 partition 100\n",
      "  walls from rooms exterior 150 partition 100\n  walls from rooms exterior 0 partition 100\n",
    );
    const ds = compile(src, { noCache: true }).diagnostics;
    const thin = ds.find((d) => d.code === "E_WALL_THICKNESS")!;
    expect(ds.some((d) => d.code === "E_WALLS_FROM_ROOMS_DUP" && d.span!.start === thin.span!.start)).toBe(true);
    const causes = ds.flatMap((d) => (d.cause ? [d.cause.code] : []));
    expect(causes).toEqual(["E_ROOMS_OVERLAP", "E_ROOMS_OVERLAP"]);
  });
});

describe("the diagnostic cap keeps the root", () => {
  it("lists the root first when its dependents run past MAX_DIAGNOSTICS", () => {
    const n = MAX_DIAGNOSTICS + 20;
    const src = `plan "Cap" {
  room id=a at (0, 0) size 6000x3000 label "A"
  room id=b at (5999, 0) size 3000x3000 label "B"
  for i in 0..${n} {
    window on a.top at 100 + i * 10 from start width 5
  }
  walls from rooms exterior 150 partition 100
}
`;
    const ds = compile(src, { noCache: true }).diagnostics;
    expect(ds).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(ds[0]!.code).toBe("E_ROOMS_OVERLAP");
    expect(ds.at(-1)!.code).toBe("E_DIAGNOSTIC_LIMIT");
    expect(ds.slice(1, -1).every((d) => d.cause?.code === "E_ROOMS_OVERLAP")).toBe(true);
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
});

describe("fmtMessage: a message's number, without float noise", () => {
  it("drops the noise of a float product or sum, and keeps a written value whole", () => {
    expect(fmtMessage(12 * 304.8)).toBe("3657.6");
    expect(fmtMessage(0.1 + 0.2)).toBe("0.3");
    expect(fmtMessage(2749.9999)).toBe("2749.9999");
    expect(fmtWritten(12 * 304.8)).toBe("3657.6");
    expect(fmtWritten(2749.9999)).toBe("2749.9999");
    expect(fmtWritten(2750)).toBe("2750");
  });

  it("prints an integer, a value outside [1e-6, 1e21) and a non-finite one exactly as String(n)", () => {
    for (const n of [
      2 ** 53,
      2 ** 53 + 2,
      1e21,
      1e-7,
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      12345678901234568,
    ]) {
      expect(fmtMessage(n), String(n)).toBe(String(n));
    }
  });

  it("is String(n) for every double, except a non-integer in range with more than 15 significant digits", () => {
    /** Significant digits of a decimal written without an exponent. */
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
        const s = String(n);
        const a = Math.abs(n);
        if (Number.isInteger(n) || !(a >= 1e-6 && a < 1e21) || sig(s) <= 15) expect(fmtMessage(n)).toBe(s);
        else {
          expect(sig(fmtMessage(n))).toBeLessThanOrEqual(15);
          expect(Math.abs(Number(fmtMessage(n)) - n)).toBeLessThanOrEqual(a * 1e-14);
        }
      }),
      { seed: 94, numRuns: 2000 },
    );
    // Decimals as an author writes them always print as written.
    fc.assert(
      fc.property(fc.integer({ min: -(10 ** 9), max: 10 ** 9 }), fc.integer({ min: 0, max: 6 }), (k, dp) => {
        const n = k / 10 ** dp;
        expect(fmtMessage(n)).toBe(String(n));
      }),
      { seed: 94, numRuns: 2000 },
    );
  });
});

/**
 * One plan per message that prints a number through `fmtMessage`, written so the number carries
 * float noise: put any of those sites back to a raw `${n}` and its row fails. `compiles` marks a plan
 * with no error: its message is the one RM9.4 moves on a plan that compiles (S1), and it moves only
 * because the old text printed float noise.
 */
const WALL = "wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }";
const SITES: { code: string; compiles?: true; src: string; says: string }[] = [
  {
    code: "W_GRID_SNAPPED",
    compiles: true,
    src: `grid 1\n let FT = 304.8\n ${WALL}\n room id=a at (0,0) size 12*FT x 4000 label "A"`,
    says: "size 3657.6 x 4000 was snapped to 3658 x 4000",
  },
  {
    code: "W_DOOR_CLEARANCE",
    compiles: true,
    src: `let FT = 304.8\n ${WALL}\n room id=a at (0,0) size 6000x4000 label "A"\n door on w at 3000 width 2.2*FT`,
    says: "Door is 670.56 mm wide",
  },
  {
    code: "W_ROOM_LABEL_OUTSIDE",
    compiles: true,
    src: `${WALL}\n room id=a at (0,0) size 3000x4000 label "A" at (20000/3, 100)\n room id=b at (3000,0) size 3000x4000 label "B"`,
    says: "pins its label at (6666.66666666667, 100)",
  },
  {
    code: "W_DIM_INSIDE",
    compiles: true,
    src: `let FT = 304.8\n ${WALL}\n room id=a at (0,0) size 6000x4000 label "A"\n dim (0,0)->(6000,0) offset 3*FT`,
    says: "`offset 914.4`",
  },
  {
    code: "W_BALCONY_NO_DOOR",
    compiles: true,
    src: `wall id=w exterior thickness 0.1*3*1000 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n room id=a at (0,0) size 6000x4000 label "A"\n outdoor balcony at (0,4000) size 3000x1200`,
    says: "within 300 mm of any of its edges",
  },
  {
    code: "E_ATTACH_POS_RANGE",
    src: `let FT = 304.8\n wall id=v exterior thickness 200 { (0,0) (12*FT,0) }\n door on v at 12*FT + 0.1*3 width 800`,
    says: "attachment position 3657.9 mm is outside the wall run (0…3657.6)",
  },
  {
    code: "E_ATTACH_POS_RANGE",
    src: `wall id=v exterior thickness 200 { (0,0) (3000,0) }\n door on v at 0.1*3*1000% width 800`,
    says: "attachment position 300% is outside 0–100%",
  },
  {
    code: "E_ATTACH_POS_RANGE",
    src: `let FT = 304.8\n wall id=v exterior thickness 200 { (0,0) (12*FT,0) }\n door on v at 5000 from start width 800`,
    says: "attachment position is 5000 mm along the wall run, outside it (0…3657.6)",
  },
  {
    code: "E_HEIGHT_RANGE",
    src: `wall id=v exterior thickness 200 height 120000.00000000001 { (0,0) (3000,0) }`,
    says: "has a `height` of 120000 mm",
  },
  {
    code: "E_SILL_ABOVE_HEAD",
    src: `let FT = 304.8\n ${WALL}\n window on w at 3000 width 900 sill 12*FT head 3*FT`,
    says: "has a `sill` of 3657.6 mm at or above its `head` of 914.4 mm",
  },
  {
    code: "E_OPENING_ABOVE_WALL",
    src: `let FT = 304.8\n height 12*FT\n ${WALL}\n window on w at 3000 width 900 head 4000.0000000000005`,
    says: "has a `head` of 4000 mm but its host wall is only 3657.6 mm tall",
  },
  {
    code: "E_DOOR_OPEN_RANGE",
    src: `${WALL}\n door sliding on w at 3000 width 900 open 1.1*1.1`,
    says: "has `open 1.21`, which is outside",
  },
  {
    code: "E_FURN_AGAINST",
    src: `let FT = 304.8\n wall id=v exterior thickness 200 { (0,0) (12*FT,0) }\n furniture bed against wall v offset 12*FT + 0.1*3 side right`,
    says: "offset 3657.9 is outside the segment run (0..3657.6)",
  },
  {
    code: "E_STAIR_WIDTH",
    src: `let FT = 304.8\n stair at (0,0) size 3000 x 3*FT dir up width 2000`,
    says: "the footprint's cross extent (914.4 mm)",
  },
  { code: "E_ROOF_OVERHANG", src: `${WALL}\n roof overhang 0 - 0.1*3`, says: "(got -0.3 mm)" },
  {
    code: "E_ROOF_SELF_INTERSECT",
    src: `let FT = 304.8\n wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (3100,4000) (3100,1000) (2900,1000) (2900,4000) (0,4000) close }\n roof overhang 12*FT`,
    says: "self-intersects at 3657.6 mm of overhang",
  },
  {
    code: "E_WALL_BETWEEN_WIDTH",
    src: `let FT = 304.8\n room id=a at (0,0) size 3000 x 12*FT label "A"\n room id=b at (3000,0) size 3000 x 12*FT label "B"\n walls from rooms exterior 200 partition 100 { open between a and b width 24*FT }`,
    says: "an opening 7315.2 mm wide does not fit the 3457.6 mm clear",
  },
  {
    code: "E_ROOMS_NOT_TILING",
    src: `let FT = 304.8\n room id=a at (0,0) size 3*12*FT x 12*FT label "A"\n room id=b at (0,12*FT) size 12*FT x 12*FT label "B"\n room id=c at (2*12*FT,12*FT) size 12*FT x 12*FT label "C"\n room id=d at (0,2*12*FT) size 3*12*FT x 12*FT label "D"\n walls from rooms exterior 200 partition 100`,
    says: "a hole x 3657.6–7315.2, y 3657.6–7315.2",
  },
  {
    code: "E_PARTITION_TOO_SHORT",
    src: `let FT = 304.8\n room id=a at (0,0) size 3000 x 12*FT label "A"\n room id=b at (3000, 12*FT - 3*FT) size 3000x3000 label "B"\n walls from rooms exterior 200 partition 6*FT`,
    says: "share a run of 914.4 mm, from (3000, 2743.2) to (3000, 3657.6), shorter than the 1828.8 mm partition",
  },
  {
    code: "E_PARTITION_TOO_SHORT",
    src: `let FT = 304.8\n room id=a at (0,0) size 3000 x 12*FT label "A"\n room id=b at (3000, 12*FT - 3*FT) size 3000x3000 label "B"\n wall partition thickness 6*FT between a and b`,
    says: "share a run of 914.4 mm, from (3000, 2743.2) to (3000, 3657.6), shorter than the 1828.8 mm wall",
  },
];

describe("every number a message prints through fmtMessage is free of float noise", () => {
  it.each(SITES.map((s, i) => [`${i} ${s.code}`, s] as const))("%s", (_, s) => {
    const src = `plan "p" {\n ${s.src}\n}\n`;
    const compiled = compile(src, { noCache: true }).diagnostics;
    expect(compiled.some((d) => d.severity === "error")).toBe(!s.compiles);
    const all = s.compiles ? [...compiled, ...lint(src)] : compiled;
    const hits = all.filter((d) => d.code === s.code);
    expect(hits.map((d) => d.message).join(" | ")).toContain(s.says);
    for (const d of hits) {
      const text = [d.message, ...(d.hints ?? []), ...(d.fixes ?? []).map((f) => f.title)].join(" | ");
      expect(text).not.toMatch(/\.\d{12}/);
    }
  });

  it("the storey-height hint and the fix title of E_OPENING_ABOVE_WALL too", () => {
    const row = SITES.find((s) => s.code === "E_OPENING_ABOVE_WALL")!;
    const d = compile(`plan "p" {\n ${row.src}\n}\n`, { noCache: true }).diagnostics.find((x) => x.code === row.code)!;
    expect(d.hints?.join(" ")).toContain("the 3657.6 mm is inherited from the storey's `height 3657.6` setting");
    expect(d.fixes?.map((f) => f.title)).toContain("lower the head to the wall's own height (3657.6 mm)");
  });
});

describe("over the corpus", () => {
  it("a plan that compiles names no cause, so its diagnostics keep their order", () => {
    let compiled = 0;
    for (const f of corpusFiles()) {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      const ds = compile(src, { noCache: true, world: worldFor(dirname(join(REPO_ROOT, f))) }).diagnostics;
      if (ds.some((d) => d.severity === "error")) continue;
      compiled++;
      expect(
        ds.filter((d) => d.cause !== undefined).map((d) => d.code),
        f,
      ).toEqual([]);
    }
    expect(compiled).toBeGreaterThan(50);
  });
});
