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
import { compile, type Diagnostic, type FixSuggestion, lint } from "../src/index.js";
import {
  AF9_FIX_IDS,
  AF9_PLANS,
  af9Fixes,
  fuzzCases,
  judgeFix,
  openingsOf,
  paste,
  plan,
} from "./helpers/opening-moves.js";
import { corpusFiles } from "./helpers/corpus.js";
import { runs } from "./setup/fast-check.js";

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
    expect(edits(src, d)).toEqual([[" at 500 from start", " at 600 from start", "maybe-incorrect"]]);
    expect(d.hints).toEqual(["The nearest legal position is `between a and b at 600 from start` (centre at y 600)."]);
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(600);
  });

  it("F1: a written centre on a meeting wall gets both bays' nearest centres, and the hint names the tie", () => {
    const src = AF9_PLANS.nibTie;
    const d = one(src, "E_OPENING_NIB");
    expect(edits(src, d)).toEqual([
      [" at 1500 from start", " at 950 from start", "maybe-incorrect"],
      [" at 1500 from start", " at 2050 from start", "maybe-incorrect"],
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
    expect(edits(src, d)).toEqual([[" at 450 from start", " at 500 from start", "maybe-incorrect"]]);
    expect(d.hints![0]).toContain("`between a and b at 500 from start` (centre at y 500)");
    expect(errors(paste(src, d.fixes![0]!))).toEqual([]);
  });

  it("E_OPENING_HOST_AMBIGUOUS on a room's edge: each exterior wall's position, saying it replaces `at center`", () => {
    const src = AF9_PLANS.extPart;
    const d = one(src, "E_OPENING_HOST_AMBIGUOUS");
    expect(edits(src, d)).toEqual([["on a.right at center", "on a.right at 2100 from start", "maybe-incorrect"]]);
    expect(d.fixes![0]!.title).toContain("replaces `at center` with a fixed offset");
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(2100);
  });

  it("E_OPENING_NO_SHARED_WALL: a door on a partition becomes `between` the two rooms, in the same wall", () => {
    const src = AF9_PLANS.extDoor;
    const d = one(src, "E_OPENING_NO_SHARED_WALL");
    expect(edits(src, d)).toEqual([
      ["on a.right at 1500 from start", "between a and b at 1500 from start", "maybe-incorrect"],
    ]);
    const out = paste(src, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "y")).toBe(1500);
  });

  it("E_OPENING_NO_SHARED_WALL: a window gets the room's one exterior edge, or the skeleton when it has several", () => {
    const one1 = AF9_PLANS.oneEdge;
    const d = one(one1, "E_OPENING_NO_SHARED_WALL");
    expect(edits(one1, d)).toEqual([["on b.left", "on b.top", "maybe-incorrect"]]);
    expect(d.hints).toEqual(["Place it on an edge of the room that faces outside."]);
    const out = paste(one1, d.fixes![0]!);
    expect(errors(out)).toEqual([]);
    expect(centreOf(out, "x")).toBe(4500);

    const many = AF9_PLANS.ext;
    const e = one(many, "E_OPENING_NO_SHARED_WALL");
    expect(edits(many, e)).toEqual([["on a.right", 'on <exterior edge of "a">', "has-placeholders"]]);
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
    expect(edits(AF9_PLANS.pct, pct)).toEqual([[" at 40%", " at <mm> from <start or end>", "has-placeholders"]]);
  });

  it("W_DOORWAY_BLOCKED: the door moved along its bay only where its landing and its swing are both clear", () => {
    const src = AF9_PLANS.blocked;
    const d = one(src, "W_DOORWAY_BLOCKED");
    // 2400 and 3600 are equally near; at 3600 the swing still meets the WC, so only 2400 is offered.
    expect(edits(src, d)).toEqual([["on shell at 3000", "on shell at 2400", "maybe-incorrect"]]);
    const after = lint(paste(src, d.fixes![0]!)).map((x) => x.code);
    expect(after).not.toContain("W_DOORWAY_BLOCKED");
    expect(after).not.toContain("W_SWING_OBSTRUCTED");
  });

  it("no AF9 fix is machine-applicable, over the §2 plans and the corpus (RM-D70)", () => {
    const tiers = new Set<string>();
    const sources = [...Object.values(AF9_PLANS), ...corpusFiles().map((f) => readFileSync(f, "utf8"))];
    for (const src of sources) {
      const ds = [...compile(src, { noCache: true }).diagnostics, ...(errors(src).length ? [] : lint(src))];
      for (const f of ds.flatMap((d) => d.fixes ?? [])) if (AF9_FIX_IDS.has(f.fixId ?? "")) tiers.add(f.applicability);
    }
    expect([...tiers].sort()).toEqual(["has-placeholders", "maybe-incorrect"]);
  }, 120_000);
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

describe("AF9: the corpus fuzz (§9 item 3), bounded", () => {
  it("every maybe-incorrect AF9 fix, applied alone, clears its diagnostic, lands, and settles", () => {
    const budget = runs(120);
    const sources = [
      ...Object.entries(AF9_PLANS).map(([n, s]) => ({ n: `af9:${n}`, s })),
      ...corpusFiles()
        .filter((f) => /^(examples|test\/fixtures|eval\/faults|eval\/goldens)\//.test(f))
        .map((f) => ({ n: f, s: readFileSync(f, "utf8") }))
        .filter((x) => !/^\s*import\b/m.test(x.s)),
    ];
    let seen = 0;
    let fixes = 0;
    const counted: Record<string, number> = {};
    for (const { n, s } of sources) {
      for (const c of [{ name: n, src: s }, ...fuzzCases(n, s)]) {
        if (seen >= budget) break;
        const fs: Array<{ d: Diagnostic; f: FixSuggestion }> = af9Fixes(c.src);
        if (fs.length === 0) continue;
        seen++;
        for (const { d, f } of fs) {
          fixes++;
          const v = judgeFix(c.src, d, f, s);
          const where = `${c.name} ${d.code}: ${f.title}`;
          expect(v.gone, where).toBe(true);
          expect(v.fewerErrors, where).toBe(true);
          expect(v.landed, where).toBe(true);
          expect(v.sameRooms, where).toBe(true);
          expect(v.settled, where).toBe(true);
          for (const w of v.newWarnings) counted[w] = (counted[w] ?? 0) + 1;
        }
      }
    }
    expect(fixes).toBeGreaterThan(10);
    // Counted, never failed: the watched warnings a move leaves (design §9 item 3).
    expect(typeof counted).toBe("object");
  }, 600_000);
});

// ─── 4. the bound ─────────────────────────────────────────────────────────────────────

describe("AF9: refusal paths are charged and bounded", () => {
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
