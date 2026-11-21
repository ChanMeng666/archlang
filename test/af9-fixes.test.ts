/**
 * Card AF9 (phase A, ruling RM-D70): moves and skeletons for refused relational openings and blocked
 * doorways (`docs/plans/ai-first-language/af9-design.md`).
 *
 * 1. The design's §2 plans: each code, tier, edit span and text, and for a move, that PASTING the
 *    edit compiles with the diagnostic gone and the opening at the centre the fix quotes, in a wall.
 *    No fix of AF9's is machine-applicable (RM-D70).
 * 2. An oracle of a different shape for the nib moves: brute force writes the position at every
 *    grid point of the run (1 mm with no grid), compiles each, and reads the nearest legal centre on
 *    each side of the written one from that set, never from the search. Jittered room sizes, odd grids
 *    and a free host end are in it, because an exact lattice hides float noise.
 * 3. The corpus fuzz (§9 item 3), bounded here and widened by `FC_SCALE`: every AF9 `maybe-incorrect`
 *    fix applied alone clears its diagnostic, lowers the error count, lands where it says and leaves
 *    nothing for a second pass. The new watched warnings are counted, not failed (`fuzzCases`,
 *    `judgeFix`, `test/helpers/opening-moves.ts`); the PR states the full count.
 * 4. The bound: refusal paths are charged, and many refusals near the step limit end in
 *    `E_STEP_LIMIT` the same way each time.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, type Diagnostic, lint } from "../src/index.js";
import { link } from "../src/import.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { makeVirtualWorld } from "../src/world.js";
import { AF9_FIX_IDS, AF9_PLANS, fuzzRun, openingsOf, paste, plan } from "./helpers/opening-moves.js";
import { reach } from "./helpers/import-walk.js";
import { corpusFiles } from "./helpers/corpus.js";
import { FC_SCALE, runs } from "./setup/fast-check.js";

const errors = (src: string): Diagnostic[] =>
  compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
const one = (src: string, code: string): Diagnostic => {
  const ds = [...compile(src, { noCache: true }).diagnostics, ...(errors(src).length ? [] : lint(src))].filter(
    (d) => d.code === code,
  );
  expect(ds, code).toHaveLength(1);
  return ds[0]!;
};
/** Each fix as `[the bytes it replaces, its text, its tier]`. */
const edits = (src: string, d: Diagnostic): Array<[string, string, string]> =>
  (d.fixes ?? []).map((f) => [
    src.slice(f.edits[0]!.span.start, f.edits[0]!.span.end),
    f.edits[0]!.newText,
    f.applicability,
  ]);
/** Where the first opening of the pasted plan stands, along the run's axis. */
const centreOf = (src: string, axis: "x" | "y"): number | undefined => {
  const o = openingsOf(src)[0];
  return o && "host" in o && o.host ? o.at[axis] : undefined;
};

describe("AF9: the design's plans (§2)", () => {
  it("E_OPENING_NIB: the nearest legal centre, as one maybe-incorrect move that pastes clean", () => {
    const src = AF9_PLANS.nib;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([["at 500 from start", "at 600 from start", "maybe-incorrect"]]);
    expect(d.hints).toEqual(["The nearest legal position is `between a and b at 600 from start` (centre at y 600)."]);
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(600);
  });

  it("F1: a written centre on a meeting wall gets both bays' nearest centres, and the hint names the tie", () => {
    const src = AF9_PLANS.nibTie;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([
      ["at 1500 from start", "at 950 from start", "maybe-incorrect"],
      ["at 1500 from start", "at 2050 from start", "maybe-incorrect"],
    ]);
    expect(d.hints).toEqual([
      "Two positions are equally near, 550 mm either way: `between a and b at 950 from start` (centre at y 950) and `between a and b at 2050 from start` (centre at y 2050).",
    ]);
    for (const [f, y] of [
      [d.fixes![0]!, 950],
      [d.fixes![1]!, 2050],
    ] as const) {
      const out = paste(src, f);
      expect(errors(out)).toEqual([]);
      expect(centreOf(out, "y")).toBe(y);
    }
  });

  it("F2: a cased opening is offered its flush jamb, the nearest centre that compiles", () => {
    const src = AF9_PLANS.flush;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([["at 450 from start", "at 500 from start", "maybe-incorrect"]]);
    expect(d.hints![0]).toContain("`between a and b at 500 from start` (centre at y 500)");
    expect(errors(paste(src, d.fixes![0]!))).toEqual([]);
  });

  // Red team S1: a flush centre that the far jamb's nib refuses no longer stands for a legal one.
  it("S1: a cased opening too wide for its bay is offered the next bay's flush centre, judged first", () => {
    const src = AF9_PLANS.casedNarrowBay;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([["at 575 from start", "at 1600 from start", "maybe-incorrect"]]);
    expect(centreOf(paste(src, d.fixes![0]!), "y")).toBe(1600);
  });

  it("S1: a cased opening that fills its bay jamb to jamb is offered that flush centre", () => {
    const src = AF9_PLANS.casedFillsBay;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([["at 500 from start", "at 550 from start", "maybe-incorrect"]]);
    expect(d.hints).toEqual(["The nearest legal position is `between a and b at 550 from start` (centre at y 550)."]);
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(550);
  });

  // Red team round 2, S-A: a meeting wall wholly outside the host's extent is no bay end. On `midwall`
  // the host (the shell's top) starts at x 0, the edge `b.top` at x 4000 with no wall there, so the
  // span may run to 4000 (main's hint, 400); and past a host's far end likewise (the corpus cases,
  // which the search now serves itself: the hint's position is no longer tried as a fallback).
  it("S-A: a meeting wall beyond the host's extent leaves its end free (midwall: 400, as main says)", () => {
    const src = AF9_PLANS.midwall;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([["at 300 from start", "at 400 from start", "maybe-incorrect"]]);
    expect(d.hints).toEqual(["The nearest legal position is `on b.top at 400 from start` (centre at x 4400)."]);
    expect(errors(paste(src, d.fixes![0]!))).toEqual([]);
  });

  it.each([
    ["examples/courtyard-family.arch", 54, 9000, "at 3800 from start"],
    ["examples/remodel.arch", 43, 9200, "at 4900 from start"],
  ] as const)("S-A: %s:%i written at %i, past its host's far end, is offered %s", (file, line, at, to) => {
    const lines = readFileSync(file, "utf8").split("\n");
    lines[line - 1] = lines[line - 1]!.replace(/( at )(-?\d+(?:\.\d+)?)/, `$1${at}`);
    const src = lines.join("\n");
    const d = errors(src).find((x) => x.code === "E_OPENING_NIB")!;
    expect((d.fixes ?? []).map((f) => f.edits[0]!.newText)).toEqual([to]);
    expect(errors(paste(src, d.fixes![0]!))).toEqual([]);
  });

  it("E_OPENING_HOST_AMBIGUOUS on a room's edge: each exterior wall's position, saying it replaces `at center`", () => {
    const src = AF9_PLANS.extPart;
    const d = one(src, "E_OPENING_HOST_AMBIGUOUS");
    expect(edits(src, d)).toEqual([["at center", "at 2100 from start", "maybe-incorrect"]]);
    expect(d.fixes![0]!.title).toContain("replaces `at center` with a fixed offset");
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(2100);
  });

  it("E_OPENING_NO_SHARED_WALL: a door on a partition becomes `between` the two rooms, in the same wall", () => {
    const src = AF9_PLANS.extDoor;
    const d = one(src, "E_OPENING_NO_SHARED_WALL");
    expect(edits(src, d)).toEqual([["on a.right", "between a and b", "maybe-incorrect"]]);
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(1500);
  });

  it("E_OPENING_NO_SHARED_WALL: a window gets the room's one exterior edge, or the skeleton when it has several", () => {
    const one1 = AF9_PLANS.oneEdge;
    const d = one(one1, "E_OPENING_NO_SHARED_WALL");
    expect(edits(one1, d)).toEqual([["b.left", "b.top", "maybe-incorrect"]]);
    expect(d.hints).toEqual(["Place it on an edge of the room that faces outside."]);
    const out = paste(one1, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "x")).toBe(4500);

    const many = AF9_PLANS.ext;
    const e = one(many, "E_OPENING_NO_SHARED_WALL");
    expect(edits(many, e)).toEqual([["a.right", '<exterior edge of "a">', "has-placeholders"]]);
    expect(e.fixes![0]!.title).toContain("(a.top, a.bottom, a.left)");
    // A placeholder is never applied.
    expect(paste(many, e.fixes![0]!)).toBe(many);
  });

  it("E_OPENING_DATUM: a parallel edge is swapped for each edge through an end; no datum or no position get skeletons", () => {
    const par = AF9_PLANS.par;
    const d = one(par, "E_OPENING_DATUM");
    expect(edits(par, d)).toEqual([
      ["a.left", "a.top", "maybe-incorrect"],
      ["a.left", "a.bottom", "maybe-incorrect"],
    ]);
    expect(centreOf(paste(par, d.fixes![0]!), "y")).toBe(600);
    expect(centreOf(paste(par, d.fixes![1]!), "y")).toBe(2400);

    const nopos = AF9_PLANS.nopos;
    const ds = errors(nopos);
    expect(ds.map((x) => x.code)).toEqual(["E_OPENING_DATUM", "E_OPENING_DATUM"]);
    expect(edits(nopos, ds[0]!)).toEqual([["", " at <mm> from start", "has-placeholders"]]);
    expect(edits(nopos, ds[1]!)).toEqual([["", " from <start or end>", "has-placeholders"]]);
    expect(nopos.slice(0, ds[1]!.fixes![0]!.edits[0]!.span.start).endsWith("at 600")).toBe(true);
    const pct = one(AF9_PLANS.pct, "E_OPENING_DATUM");
    expect(edits(AF9_PLANS.pct, pct)).toEqual([["at 40%", "at <mm> from <start or end>", "has-placeholders"]]);
  });

  it("W_DOORWAY_BLOCKED: the door moved along its bay only where its landing and its swing are both clear", () => {
    const src = AF9_PLANS.blocked;
    const d = one(src, "W_DOORWAY_BLOCKED");
    // 2400 and 3600 are equally near; at 3600 the swing still meets the WC, so only 2400 is offered.
    expect(edits(src, d)).toEqual([["at 3000", "at 2400", "maybe-incorrect"]]);
    const after = lint(paste(src, d.fixes![0]!)).map((x) => x.code);
    expect(after).not.toContain("W_DOORWAY_BLOCKED");
    expect(after).not.toContain("W_SWING_OBSTRUCTED");
  });

  // The corpus is `test/fixable-codes.test.ts`'s: it fails on any tier a row does not declare, and no
  // AF9 row declares `machine-applicable`.
  it("no AF9 fix is machine-applicable, over the §2 plans and the warned fixtures (RM-D70)", () => {
    const tiers = new Set<string>();
    const sources = [...Object.values(AF9_PLANS), ...FUZZ_PLANS.map((f) => readFileSync(f, "utf8"))];
    for (const src of sources) {
      const ds = [...compile(src, { noCache: true }).diagnostics, ...(errors(src).length ? [] : lint(src))];
      for (const f of ds.flatMap((d) => d.fixes ?? [])) if (AF9_FIX_IDS.has(f.fixId ?? "")) tiers.add(f.applicability);
    }
    expect([...tiers].sort()).toEqual(["has-placeholders", "maybe-incorrect"]);
  });
});

// ─── 2. the oracle ────────────────────────────────────────────────────────────────────

/** A plan family with one door (or cased opening) `between a and b`, its run starting at y 0. */
interface OracleCase {
  name: string;
  src: (at: number) => string;
  written: number;
  /** The along-run spans of the walls meeting the run, so the oracle knows the bays. */
  walls: Array<[number, number]>;
  r1: number;
  grid: number;
}

/** A small deterministic generator, so the jittered cases are the same on every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function oracleCases(): OracleCase[] {
  const out: OracleCase[] = [];
  const rnd = lcg(20261120);
  const shell = (h: number, kind: string, width: number, extra: string[], grid: number) => (at: number) =>
    plan(
      "o",
      ...(grid > 0 ? [`grid ${grid}`] : []),
      `room id=a at (0,0) size 4000x${h}`,
      `room id=b at (4000,0) size 3000x${h}`,
      "walls from rooms exterior 200 partition 100",
      ...extra,
      `${kind} between a and b at ${at} from start width ${width}`,
    );
  for (const [kind, width, written] of [
    ["door", 800, 500],
    ["opening", 800, 450],
    ["door", 900, 2700],
  ] as const) {
    for (const grid of [0, 30, 70]) {
      out.push({
        name: `${kind} ${written} grid ${grid}`,
        src: shell(3000, kind, width, [], grid),
        written,
        walls: [
          [-100, 100],
          [2900, 3100],
        ],
        r1: 3000,
        grid,
      });
    }
    // Jittered heights: the far face is no longer on a whole millimetre.
    for (let i = 0; i < 2; i++) {
      const h = Math.round((3000 + (rnd() - 0.5) * 300) * 1000) / 1000;
      out.push({
        name: `${kind} ${written} h ${h}`,
        src: shell(h, kind, width, [], 0),
        written: written > 2000 ? Math.round(h - 300) : written,
        walls: [
          [-100, 100],
          [h - 100, h + 100],
        ],
        r1: h,
        grid: 0,
      });
    }
  }
  // A meeting wall across the run, the written centre on its body and beside it.
  const tee = ["wall id=t partition thickness 100 { (4000,1500) (7000,1500) }"];
  for (const written of [1500, 1420, 1600]) {
    out.push({
      name: `tee ${written}`,
      src: shell(3000, "door", 800, tee, 0),
      written,
      walls: [
        [-100, 100],
        [1450, 1550],
        [2900, 3100],
      ],
      r1: 3000,
      grid: 0,
    });
  }
  // A cased opening outside the wide bay (red team S1): too wide for a bay by a jamb's nib, or filling
  // one jamb to jamb, on the plan's grid or none.
  for (const [y, written, grid] of [
    [1100, 575, 0],
    [1050, 500, 0],
    [1100, 600, 50],
    [1050, 450, 50],
  ] as const) {
    out.push({
      name: `cased opening, partition at y ${y}, ${written} grid ${grid}`,
      src: shell(3000, "opening", 900, [`wall partition thickness 100 { (4000,${y}) (7000,${y}) }`], grid),
      written,
      walls: [
        [-100, 100],
        [y - 50, y + 50],
        [2900, 3100],
      ],
      r1: 3000,
      grid,
    });
  }
  // A free host end: an authored partition stopping short of the far ring.
  const free = (at: number) =>
    plan(
      "free",
      "room id=a at (0,0) size 4000x3000",
      "room id=b at (4000,0) size 3000x3000",
      "wall id=shell exterior thickness 200 { (0,0) (7000,0) (7000,3000) (0,3000) close }",
      "wall id=p partition thickness 100 { (4000,0) (4000,2200) }",
      `door between a and b at ${at} from start width 800`,
    );
  out.push({ name: "free end 1900", src: free, written: 1900, walls: [[-100, 100]], r1: 2200, grid: 0 });
  return out;
}

const legal = (src: string): boolean => errors(src).length === 0 && openingsOf(src).some((o) => "host" in o && o.host);

/** The nearest legal centre from `c` in direction `dir`, by brute force over the lattice. */
function nearestBrute(k: OracleCase, c: number, dir: 1 | -1): number | undefined {
  const step = k.grid > 0 ? k.grid : 1;
  const first = k.grid > 0 ? (dir > 0 ? Math.floor(c / step) + 1 : Math.ceil(c / step) - 1) * step : c + dir;
  for (let t = first; t > 0 && t < k.r1; t += dir * step) if (legal(k.src(t))) return t;
  return undefined;
}

describe("AF9: the nib moves against a brute-force oracle", () => {
  it.each(oracleCases().map((k) => [k.name, k] as const))(
    "%s",
    (_n, k) => {
      const src = k.src(k.written);
      const d = errors(src).find((x) => x.code === "E_OPENING_NIB");
      expect(d, "the written position is refused").toBeDefined();
      const c = k.grid > 0 ? Math.round(k.written / k.grid) * k.grid : k.written;
      const offered = (d!.fixes ?? []).map((f) => Number(/at (-?[\d.]+) from start/.exec(f.edits[0]!.newText)![1]));
      // The bay the written centre stands in (none when it stands on a wall's body).
      const inWall = k.walls.some(([p, q]) => p < c && c < q);
      const lo = Math.max(0, ...k.walls.filter(([, q]) => q <= c).map(([, q]) => q));
      const hi = Math.min(k.r1, ...k.walls.filter(([p]) => p >= c).map(([p]) => p));
      const below = nearestBrute(k, c, -1);
      const above = nearestBrute(k, c, 1);
      const inBay = (t: number | undefined) => t !== undefined && t > lo && t < hi;
      const bayHasOne = !inWall && (inBay(below) || inBay(above));
      const want = (bayHasOne ? [below, above].filter(inBay) : [below, above]).filter(
        (t): t is number => t !== undefined,
      );
      const tol = k.grid > 0 ? 1e-9 : 1;
      // Every offered centre is legal, pasted.
      for (const t of offered) expect(legal(k.src(t)), `${t} pastes legal`).toBe(true);
      // Each side the oracle finds legal is offered, and the offered one is the nearest there.
      expect(offered.length, `offered ${offered} want ${want}`).toBe(want.length);
      for (const w of want) {
        const got = offered.find((t) => Math.sign(t - c) === Math.sign(w - c));
        expect(got, `side of ${w}`).toBeDefined();
        expect(Math.abs(got! - w), `${got} vs brute ${w}`).toBeLessThanOrEqual(tol);
      }
    },
    120_000,
  );
});

// ─── 3. the fuzz ──────────────────────────────────────────────────────────────────────

/**
 * The plans the PR-scale fuzz shifts: the corpus plans whose shifted twins the full run found fixes
 * on (relational and hosted doors, windows and cased openings, a blocked doorway). The full run, over
 * every plan of the five corpus directories, is this body at `FC_SCALE` and is quoted in the PR.
 */
const FUZZ_PLANS = [
  "examples/relational.arch",
  "examples/remodel.arch",
  "examples/two-bed.arch",
  "test/fixtures/off-path-bypass.arch",
  "test/fixtures/gaps/gaps.arch",
];

describe("AF9: the corpus fuzz (§9 item 3), bounded", () => {
  it("every maybe-incorrect AF9 fix, applied alone, clears its diagnostic, lands, and settles", () => {
    // Each source and its first `PER_PLAN` shifted twins, so the bounded run reaches every plan.
    // Never under 16 (check:quick runs at FC_SCALE 0.25), so the pinned count below is the one measured.
    const PER_PLAN = Math.max(16, runs(16));
    const sources = [
      ...Object.entries(AF9_PLANS).map(([n, s]) => ({ name: `af9:${n}`, src: s })),
      ...(FC_SCALE > 1
        ? corpusFiles().filter((f) => /^(examples|test\/fixtures|eval\/faults|eval\/goldens)\//.test(f))
        : FUZZ_PLANS
      )
        .map((f) => ({ name: f, src: readFileSync(f, "utf8") }))
        .filter((x) => !/^\s*import\b/m.test(x.src)),
    ];
    const r = fuzzRun(sources, PER_PLAN);
    expect(r.failures).toEqual([]);
    for (const f of FUZZ_PLANS) expect(r.bySource[f] ?? 0, f).toBeGreaterThan(0);
    if (FC_SCALE <= 1) {
      // Counted, never failed (design §9 item 3): applied as if machine-applicable, a move that
      // leaves an error or a new watched warning is wrong. The PR states the full corpus's count.
      expect({ fixes: r.fixes, byCode: r.byCode, wrong: r.wrong, newWarnings: r.newWarnings }).toEqual(PR_SCALE);
    }
  }, 120_000);
});

/** The bounded run's count, measured with `fuzzRun` (`test/helpers/opening-moves.ts`). */
const PR_SCALE = {
  fixes: 89,
  byCode: {
    E_OPENING_DATUM: 8,
    E_OPENING_HOST_AMBIGUOUS: 1,
    E_OPENING_NIB: 42,
    E_OPENING_NO_SHARED_WALL: 8,
    W_DOORWAY_BLOCKED: 30,
  },
  // One nib move (`examples/remodel.arch`) lands where a swing and a doorway's landing meet furniture.
  wrong: 1,
  newWarnings: { W_DOORWAY_BLOCKED: 1, W_SWING_OBSTRUCTED: 1 },
};

// ─── 4. the bound ─────────────────────────────────────────────────────────────────────

describe("AF9: refusal paths are charged and bounded", () => {
  const steps = (src: string): number => {
    const world = makeVirtualWorld({});
    return evaluationSteps(
      resolveAll(link(parse(src, BUILTIN_REGISTRY).plan!, world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, world),
    );
  };
  const P = AF9_PLANS;
  /** Each refusal's steps beyond the same plan with the written position its fix offers: what the
   *  refusal path charges, the AF9 search included (`nibMoves`, `otherEdge`, the datum swap, and
   *  each candidate judged by `judgeLanding`). Measured; a charge removed or added moves its row. */
  const REFUSAL_COST: Array<[string, string, string, number]> = [
    ["nib (nibMoves)", P.nib, P.nib.replace("at 500 from start", "at 600 from start"), 107],
    ["nib on a tee", P.nibTie, P.nibTie.replace("at 1500 from start", "at 950 from start"), 147],
    ["cased opening's flush jamb", P.flush, P.flush.replace("at 450 from start", "at 500 from start"), 137],
    [
      "cased opening past a narrow bay",
      P.casedNarrowBay,
      P.casedNarrowBay.replace("at 575 from start", "at 1600 from start"),
      210,
    ],
    [
      "nib with a meeting wall beyond the host's extent",
      P.midwall,
      P.midwall.replace("at 300 from start", "at 400 from start"),
      106,
    ],
    [
      "on a room's edge with two walls (edgeHints)",
      P.extPart,
      P.extPart.replace("at center", "at 2100 from start"),
      110,
    ],
    ["door on a partition (otherEdge)", P.extDoor, P.extDoor.replace("on a.right", "between a and b"), 74],
    ["window, one exterior edge (otherEdge)", P.oneEdge, P.oneEdge.replace("on b.left", "on b.top"), 197],
    ["window, several exterior edges (otherEdge)", P.ext, P.ext.replace("on a.right", "on a.top"), 106],
    ["parallel datum edge (the datum swap)", P.par, P.par.replace("from a.left", "from a.top"), 74],
  ];
  it.each(REFUSAL_COST)("%s charges its pinned steps", (_n, refused, placed, cost) => {
    expect(errors(placed)).toEqual([]);
    expect(steps(refused) - steps(placed)).toBe(cost);
  });

  it("many refused doors beside many meeting walls end in E_STEP_LIMIT, the same way each time", () => {
    const tees = Array.from(
      { length: 400 },
      (_, i) => `wall partition thickness 100 { (4000,${100 + i * 7}) (7000,${100 + i * 7}) }`,
    );
    const doors = Array.from({ length: 400 }, (_, i) => `door between a and b at ${130 + i * 7} from start width 800`);
    const src = plan(
      "bound",
      "room id=a at (0,0) size 4000x3000",
      "room id=b at (4000,0) size 3000x3000",
      "walls from rooms exterior 200 partition 100",
      ...tees,
      ...doors,
    );
    const a = compile(src, { noCache: true }).diagnostics.map((d) => d.code);
    const b = compile(src, { noCache: true }).diagnostics.map((d) => d.code);
    expect(a).toEqual(b);
    expect(a).toContain("E_STEP_LIMIT");
  }, 120_000);
});

// ─── 6. an imported module's statements ───────────────────────────────────────────────

/**
 * Design §3 and red team round 2, S-B: a statement written in an imported module gets no fix from any
 * AF9 producer (its offsets are the module's, which `applyFixes` would splice into the importer), while
 * its hint still names the positions (S-C). Each refusal and the warning are raised from a component the
 * root calls inline; the control writes the same statement in the root.
 */
describe("AF9: no fix for an imported module's statement, from every producer (red team round 2, S-B)", () => {
  const LIB = [
    'plan "lib" {',
    "  units mm",
    "  component nib() {\n    door between a and b at 500 from start width 800\n  }",
    "  component tie() {\n    wall id=t partition thickness 100 { (4000,1500) (7000,1500) }\n    door between a and b at 1500 from start width 800\n  }",
    "  component amb() {\n    window on a.right at center width 800\n  }",
    "  component part() {\n    door on a.right at 600 from start width 800\n  }",
    "  component win() {\n    window on a.right width 1200\n  }",
    "  component par() {\n    door between a and b at 600 from a.left width 800\n  }",
    "  component nopos() {\n    door between a and b width 800\n  }",
    "  component nodatum() {\n    door between a and b at 600 width 800\n  }",
    "  component blocked() {\n    door between a and b at 1500 from start width 800\n    furniture sofa at (3300,1200) size 600x600\n  }",
    "}",
    "",
  ].join("\n");
  const world = makeVirtualWorld({ "lib.arch": LIB });
  const root = (call: string, bHeight = 3000) =>
    plan(
      "m",
      'import "lib.arch": nib, tie, amb, part, win, par, nopos, nodatum, blocked',
      "room id=a at (0,0) size 4000x3000",
      `room id=b at (4000,0) size 3000x${bHeight}`,
      "walls from rooms exterior 200 partition 100",
      `${call}()`,
    );
  const CASES: Array<[string, string, string, number?]> = [
    ["nib", "E_OPENING_NIB", "door between a and b at 500 from start width 800"],
    [
      "tie",
      "E_OPENING_NIB",
      "wall id=t partition thickness 100 { (4000,1500) (7000,1500) }\n  door between a and b at 1500 from start width 800",
    ],
    ["amb", "E_OPENING_HOST_AMBIGUOUS", "window on a.right at center width 800", 1500],
    ["part", "E_OPENING_NO_SHARED_WALL", "door on a.right at 600 from start width 800"],
    ["win", "E_OPENING_NO_SHARED_WALL", "window on a.right width 1200"],
    ["par", "E_OPENING_DATUM", "door between a and b at 600 from a.left width 800"],
    ["nopos", "E_OPENING_DATUM", "door between a and b width 800"],
    ["nodatum", "E_OPENING_DATUM", "door between a and b at 600 width 800"],
    [
      "blocked",
      "W_DOORWAY_BLOCKED",
      "door between a and b at 1500 from start width 800\n  furniture sofa at (3300,1200) size 600x600",
    ],
  ];
  const raised = (src: string, code: string, w?: ReturnType<typeof makeVirtualWorld>): Diagnostic[] => {
    const o = w ? { world: w } : {};
    const c = compile(src, { noCache: true, ...o }).diagnostics;
    const ds = c.some((d) => d.severity === "error")
      ? c
      : [...c, ...lint(src, o), ...lint(src, { ...o, profile: "accessibility-advisory" })];
    return ds.filter((d) => d.code === code);
  };
  it.each(CASES)(
    "%s: %s raised in the module carries no fix; written in the root it does",
    (call, code, stmt, h = 3000) => {
      const imported = raised(root(call, h), code, world);
      expect(imported.length, "raised").toBeGreaterThan(0);
      for (const d of imported) {
        expect(d.file).toBe("lib.arch");
        expect(d.fixes ?? []).toEqual([]);
      }
      const local = plan(
        "m",
        "room id=a at (0,0) size 4000x3000",
        `room id=b at (4000,0) size 3000x${h}`,
        "walls from rooms exterior 200 partition 100",
        stmt,
      );
      expect(raised(local, code).flatMap((d) => d.fixes ?? []).length, "the control").toBeGreaterThan(0);
    },
  );

  it("S-C: the module's nib refusal still names both tied positions", () => {
    const [d] = raised(root("tie"), "E_OPENING_NIB", world);
    expect(d!.hints).toEqual([
      "Two positions are equally near, 550 mm either way: `between a and b at 950 from start` (centre at y 950) and `between a and b at 2050 from start` (centre at y 2050).",
    ]);
  });
});

// ─── 5. off the compiler chunk ────────────────────────────────────────────────────────

describe("AF9: the lint-only modules stay off the compile path (red team S3)", () => {
  const LINT_ONLY = ["src/lint/doorway-move.ts", "src/lint/rules/doorway.ts", "src/lint/rules/openings.ts"];
  it("src/compile-path.ts and src/first-use-path.ts reach none of them; lint's entry reaches each", () => {
    const compilePath = reach("src/compile-path.ts");
    expect(compilePath).toContain("src/opening-relation.ts");
    expect(compilePath).toContain("src/lint/rules/doors.ts");
    expect(LINT_ONLY.filter((f) => compilePath.includes(f))).toEqual([]);
    // Card 3.19b: `lint` is src/lint-path.ts's (the playground's `lint` chunk), no longer the first
    // use's; the positive control follows it, and the first use's path carries none of them.
    const lintPath = reach("src/lint-path.ts");
    for (const f of LINT_ONLY) expect(lintPath, f).toContain(f);
    const firstUse = reach("src/first-use-path.ts");
    expect(firstUse).toContain("src/diagnostic-json.ts");
    expect(LINT_ONLY.filter((f) => firstUse.includes(f))).toEqual([]);
  });
});
