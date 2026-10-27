/**
 * `nextDiagnostic()` (plan-soundness PS5.3): the one item to fix first, by fixed precedence —
 * error → compile warning → validity → drafting → intent (gating, graph, advisory) → profile →
 * taste — and, within a tier, emission order, but for one exception in the validity tier: a
 * door-swing shortfall yields to a stair-safety code or an earlier-stage finding (PS7.7), and a
 * `fixtures`-stage finding to a stair-safety code or a swing shortfall (PS7.10).
 *
 * - Unit: every tier alone, every tier against every lower one, emission order within a tier,
 *   the profile run's wording, the taste minimum, and `null`.
 * - Table: over the defect corpus, each case's `next` is its first compile warning, else the
 *   first validity warning of its default `lint()` in emission order, else the first drafting
 *   one; it is the case's own `expect` code (and that code's tier) whenever that code is the
 *   plan's only warning.
 * - L1: computing `next` with every input over every example leaves SVG, `describe()` and
 *   `lint()` at the pinned byte-identity baseline (`nextDiagnostic` only reads results it is
 *   handed; the measuring is `compile`/`lint`/`validateIntent`/`taste`, run here first).
 */

import { describe, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  type Diagnostic,
  type IntentCheckResult,
  LINT_CODE_LAYERS,
  lint,
  lintWithCoverage,
  NEXT_TIERS,
  nextDiagnostic,
  type NextInput,
  taste,
  type TasteReport,
  validateIntent,
} from "../src/index.js";
import { LINT_CODE_STAGES } from "../src/lint.js";
import { STAIR_SAFETY_CODES, SWING_SHORTFALL_CODES } from "../src/next.js";
import { AUTHORS_HEIGHT, BASELINE } from "./byte-identity-baseline.js";
import { type CompilerApi, allStoreysDigestWith } from "./byte-identity-digest.js";
import { heightFreeSource } from "./height-free-source.js";
import { DEFECT_SOURCES, EXAMPLE_SOURCES, TASTE_WORLD, headerOf } from "./taste-sources.js";

const W = (code: string, start = 0, extra: Partial<Diagnostic> = {}): Diagnostic => ({
  severity: "warning",
  code,
  message: `${code} message`,
  span: { start, end: start + 1 },
  ...extra,
});
const E = (code: string, start = 0): Diagnostic => ({ ...W(code, start), severity: "error" });

// Real layers: the drafting code below must really be declared drafting by its rule.
const DRAFTING = "W_DIM_TEXT_MISMATCH";
const VALIDITY = "W_ROOM_VIA_PRIVATE";

// A real intent result with a gating and an advisory violation, from a real plan.
const PLAN = `plan "Home" {
  units mm
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (4000,0) (4000,5000) }
  room id=bed at (0,0) size 4000x5000 label "Bedroom"
  room id=bath at (4000,0) size 4000x5000 label "Bathroom"
  door id=entry at (2000,0) width 900 wall ext
  window id=w1 at (1000,0) width 1200 wall ext
}`;
const INTENT: IntentCheckResult = validateIntent(PLAN, {
  rooms: 3,
  adjacency: { requiredEdges: { bedroom: ["bathroom"] }, source: "test" },
});
const ADVISORY_ONLY: IntentCheckResult = validateIntent(PLAN, {
  rooms: 2,
  adjacency: { requiredEdges: { bedroom: ["bathroom"] }, source: "test" },
});

/** A taste report whose criteria carry the given scores (in order), built on a real report. */
function tasteWith(scores: Array<number | null>): TasteReport {
  const real = taste(PLAN, { profile: "generic" });
  const proto = real.criteria[0]!;
  return {
    ...real,
    criteria: scores.map((s, i) => ({
      ...proto,
      id: `R${i + 1}`,
      assessable: s !== null,
      score: s,
      advice: s === null || s >= 1 ? null : `A_TEST_${i + 1}`,
      message: `criterion ${i + 1}`,
    })),
  };
}

describe("nextDiagnostic · each tier alone", () => {
  it("the layers this file relies on are the real ones", () => {
    expect(LINT_CODE_LAYERS[DRAFTING]).toBe("drafting");
    expect(LINT_CODE_LAYERS[VALIDITY]).toBe("validity");
    expect(INTENT.violations.map((v) => v.gate)).toEqual([true, false]);
    expect(ADVISORY_ONLY.violations.map((v) => v.gate)).toEqual([false]);
  });

  it("nothing to fix is null", () => {
    expect(nextDiagnostic({ diagnostics: [] })).toBeNull();
    expect(nextDiagnostic({ diagnostics: [], lint: [], profileLint: [], taste: tasteWith([1, null]) })).toBeNull();
  });

  it("error", () => {
    expect(nextDiagnostic({ diagnostics: [E("E_PARSE", 5)] })).toEqual({
      tier: "error",
      code: "E_PARSE",
      message: "E_PARSE message",
      span: [5, 6],
      hint: expect.any(String), // the catalogued fix
    });
  });

  it("validity, with the diagnostic's first hint, its storey and its module", () => {
    const d = W(VALIDITY, 3, { hints: ["first", "second"], level: 2, file: "lib/a.arch" });
    expect(nextDiagnostic({ diagnostics: [], lint: [d] })).toEqual({
      tier: "validity",
      code: VALIDITY,
      message: `${VALIDITY} message`,
      span: [3, 4],
      file: "lib/a.arch",
      level: 2,
      hint: "first",
    });
  });

  it("drafting", () => {
    expect(nextDiagnostic({ diagnostics: [], lint: [W(DRAFTING)] })?.tier).toBe("drafting");
  });

  it("a code no rule declares ranks as validity (as it does for the taste cap)", () => {
    expect(nextDiagnostic({ diagnostics: [], lint: [W("W_NOT_A_RULE")] })?.tier).toBe("validity");
  });

  it("compile-channel warning", () => {
    expect(nextDiagnostic({ diagnostics: [W("W_DOOR_OFF_WALL")] })).toMatchObject({
      tier: "warning",
      code: "W_DOOR_OFF_WALL",
    });
  });

  it("intent: gating first, with its correction prompt as the hint", () => {
    const n = nextDiagnostic({ diagnostics: [], intent: INTENT });
    expect(n).toMatchObject({
      tier: "intent",
      code: INTENT.violations[0]!.code,
      message: INTENT.violations[0]!.message,
    });
    expect(n?.hint).toEqual(expect.any(String));
  });

  it("intent: advisory when nothing gates", () => {
    expect(nextDiagnostic({ diagnostics: [], intent: ADVISORY_ONLY })).toMatchObject({
      tier: "intent",
      code: ADVISORY_ONLY.violations[0]!.code,
    });
  });

  it("intent: a graph mismatch sits between gating and advisory, with no code", () => {
    const graph = {
      ok: false,
      missing_rooms: [],
      missing_connections: [["a", "b"]] as [string, string][],
      extra_connections: [],
    };
    expect(nextDiagnostic({ diagnostics: [], intent: ADVISORY_ONLY, graph })).toEqual({
      tier: "intent",
      code: null,
      message: "graph: missing connection a — b",
    });
    expect(nextDiagnostic({ diagnostics: [], intent: INTENT, graph })?.code).toBe(INTENT.violations[0]!.code);
    expect(nextDiagnostic({ diagnostics: [], graph: { ...graph, ok: true, missing_connections: [] } })).toBeNull();
  });

  it("profile: a warning only the profile raises; a default warning it repeats ranks as its own layer", () => {
    const shared = W(VALIDITY, 10);
    const extra = W("W_DOOR_TOO_NARROW", 20);
    // The profile repeats the default warning quoting another threshold: validity wins, worded as
    // the profile run words it (the text the caller's diagnostics show).
    expect(
      nextDiagnostic({
        diagnostics: [],
        lint: [shared],
        profileLint: [extra, { ...shared, message: "reworded", hints: ["profile hint"] }],
      }),
    ).toMatchObject({ tier: "validity", code: VALIDITY, message: "reworded", span: [10, 11], hint: "profile hint" });
    // A profile warning of the same code elsewhere is not the same finding.
    expect(
      nextDiagnostic({ diagnostics: [], lint: [shared], profileLint: [{ ...W(VALIDITY, 99), message: "other" }] })
        ?.message,
    ).toBe(`${VALIDITY} message`);
    // Default lint() clean: the profile's first warning, in emission order.
    expect(nextDiagnostic({ diagnostics: [], lint: [], profileLint: [extra, shared] })).toMatchObject({
      tier: "profile",
      code: "W_DOOR_TOO_NARROW",
    });
  });

  it("taste: the lowest score below 1 wins, the first on a tie, unassessable never", () => {
    expect(nextDiagnostic({ diagnostics: [], taste: tasteWith([0.75, null, 0.5, 0.5, 1]) })).toEqual({
      tier: "taste",
      code: "A_TEST_3",
      message: "criterion 3",
      hint: expect.stringMatching(/^R3 .* scored 0\.5 under generic \(source: /),
    });
    expect(nextDiagnostic({ diagnostics: [], taste: tasteWith([null, 1, 1]) })).toBeNull();
    expect(nextDiagnostic({ diagnostics: [], taste: { ...tasteWith([0.1]), ok: false } })).toBeNull();
  });
});

describe("nextDiagnostic · precedence between tiers", () => {
  // One input per tier, highest first; each must beat every tier after it.
  const inputs: Record<(typeof NEXT_TIERS)[number], NextInput> = {
    error: { diagnostics: [E("E_PARSE")] },
    validity: { diagnostics: [], lint: [W(VALIDITY)] },
    drafting: { diagnostics: [], lint: [W(DRAFTING)] },
    warning: { diagnostics: [W("W_DOOR_OFF_WALL")] },
    intent: { diagnostics: [], intent: INTENT },
    profile: { diagnostics: [], profileLint: [W("W_DOOR_TOO_NARROW", 40)] },
    taste: { diagnostics: [], taste: tasteWith([0.25]) },
  };
  const merge = (tiers: readonly (typeof NEXT_TIERS)[number][]): NextInput => {
    const m: NextInput = { diagnostics: [] };
    for (const t of tiers) {
      const i = inputs[t];
      m.diagnostics = [...m.diagnostics, ...i.diagnostics];
      if (i.lint) m.lint = [...(m.lint ?? []), ...i.lint];
      if (i.intent) m.intent = i.intent;
      if (i.profileLint) m.profileLint = [...(m.lint ?? []), ...i.profileLint];
      if (i.taste) m.taste = i.taste;
    }
    return m;
  };

  it("the tiers: compile warnings right after errors (upstream causes), drafting after validity", () => {
    expect(NEXT_TIERS).toEqual(["error", "warning", "validity", "drafting", "intent", "profile", "taste"]);
  });

  for (let i = 0; i < NEXT_TIERS.length; i++) {
    const rest = NEXT_TIERS.slice(i);
    it(`${NEXT_TIERS[i]} beats ${rest.slice(1).join(", ") || "nothing"}`, () => {
      // Every tier from i on is present, in reverse emission order so position cannot win.
      expect(nextDiagnostic(merge([...rest].reverse()))?.tier).toBe(NEXT_TIERS[i]);
    });
  }

  it("within a tier, emission order — not code, not position in the file", () => {
    const lintOrder = [W("W_ZZZ_LATER_CODE", 900), W("W_AAA_EARLIER_CODE", 1)];
    expect(nextDiagnostic({ diagnostics: [], lint: lintOrder })?.code).toBe("W_ZZZ_LATER_CODE");
    expect(nextDiagnostic({ diagnostics: [E("E_B", 50), E("E_A", 2)] })?.code).toBe("E_B");
  });

  it("an error preempts even when lint() returned warnings (a caller that passes both)", () => {
    expect(nextDiagnostic({ diagnostics: [W("W_DOOR_OFF_WALL"), E("E_PARSE", 9)], lint: [W(VALIDITY)] })?.tier).toBe(
      "error",
    );
  });
});

describe("nextDiagnostic · a swing shortfall yields inside the validity tier (PS7.7)", () => {
  const SWING = "W_SWING_OBSTRUCTED";
  const SIDE = "W_STAIR_SIDE_ENTRY"; // a stair-safety code at the swing's own stage
  const LATER = "W_FURN_CLEARANCE"; // fixtures: a later stage than the swing's
  const EARLIER = "W_BOUNDARY_NO_WALL"; // walls: an earlier stage than the swing's
  const next = (lint: Diagnostic[]): string | null | undefined => nextDiagnostic({ diagnostics: [], lint })?.code;

  it("the codes this block relies on are what it says they are", () => {
    expect([...SWING_SHORTFALL_CODES]).toEqual([SWING]);
    expect(LINT_CODE_STAGES[SWING]).toBe("openings");
    expect(LINT_CODE_STAGES[SIDE]).toBe("openings");
    expect(LINT_CODE_STAGES[LATER]).toBe("fixtures");
    expect(LINT_CODE_STAGES[EARLIER]).toBe("walls");
    // Read off the `stairs` family, not retyped: it holds the class-7 blockers the card names.
    for (const c of ["W_STAIR_NO_LANDING", "W_STAIR_TOO_STEEP", SIDE, "W_SWING_OVER_STAIR"])
      expect(STAIR_SAFETY_CODES.has(c), c).toBe(true);
    for (const c of STAIR_SAFETY_CODES) expect(LINT_CODE_LAYERS[c], c).toBe("validity");
  });

  it("a stair-safety code of the swing's own stage, emitted later, is chosen first", () => {
    expect(next([W(SWING, 1), W(LATER, 2), W(SIDE, 3)])).toBe(SIDE);
  });

  it("an earlier-stage finding, emitted later, is chosen first; the first such in emission order", () => {
    expect(next([W(SWING, 1), W(LATER, 2), W(EARLIER, 3), W("W_STAIR_TOO_STEEP", 4)])).toBe(EARLIER);
  });

  it("the swing stays first beside only later-stage findings, drafting codes and undeclared codes", () => {
    expect(next([W(SWING, 1), W(LATER, 2), W(DRAFTING, 3), W("W_NOT_A_RULE", 4)])).toBe(SWING);
  });

  it("a first validity item of no yielding kind keeps emission order", () => {
    expect(next([W(EARLIER, 1), W(SWING, 2), W("W_STAIR_NO_LANDING", 3)])).toBe(EARLIER);
    expect(next([W("W_PATH_TOO_NARROW", 1), W(LATER, 2), W(SIDE, 3)])).toBe("W_PATH_TOO_NARROW");
  });

  it("the tiers do not move: a compile warning beats the stair code, and the stair code a drafting one", () => {
    const lint = [W(DRAFTING, 0), W(SWING, 1), W("W_STAIR_TOO_STEEP", 2)];
    expect(nextDiagnostic({ diagnostics: [W("W_DOOR_OFF_WALL")], lint })?.tier).toBe("warning");
    expect(nextDiagnostic({ diagnostics: [], lint })).toMatchObject({ tier: "validity", code: "W_STAIR_TOO_STEEP" });
  });
});

describe("nextDiagnostic · a fixtures-stage finding yields inside the validity tier (PS7.10)", () => {
  const SWING = "W_SWING_OBSTRUCTED";
  const FIX = "W_FURNITURE_OVERLAP"; // fixtures
  const HOB = "W_ROOM_MISSING_DEFINING"; // fixtures
  const PATH = "W_PATH_TOO_NARROW"; // openings: earlier than fixtures, but neither stair nor swing
  const EARLIER = "W_BOUNDARY_NO_WALL"; // walls
  const next = (lint: Diagnostic[]): string | null | undefined => nextDiagnostic({ diagnostics: [], lint })?.code;

  it("the codes this block relies on are what it says they are", () => {
    for (const c of [FIX, HOB]) expect(LINT_CODE_STAGES[c], c).toBe("fixtures");
    expect(LINT_CODE_STAGES[PATH]).toBe("openings");
    expect(LINT_CODE_STAGES[EARLIER]).toBe("walls");
    expect(STAIR_SAFETY_CODES.has(PATH)).toBe(false);
  });

  it("the yield chain only climbs: no stair-safety code or swing shortfall is a fixtures-stage code", () => {
    for (const c of [...STAIR_SAFETY_CODES, ...SWING_SHORTFALL_CODES])
      expect(LINT_CODE_STAGES[c], c).not.toBe("fixtures");
  });

  it("a stair-safety code, emitted later, is chosen first (the arm-1 townhouse's missing hob)", () => {
    expect(next([W(HOB, 1), W(FIX, 2), W("W_STAIR_NO_LANDING", 3), W("W_STAIR_TOO_STEEP", 4)])).toBe(
      "W_STAIR_NO_LANDING",
    );
  });

  it("a swing shortfall, emitted later, is chosen first (the arm-1 house's fridge/sink overlap)", () => {
    expect(next([W(FIX, 1), W(SWING, 2), W(PATH, 3)])).toBe(SWING);
  });

  it("the swing it yields to yields in turn, as PS7.7 has it", () => {
    expect(next([W(FIX, 1), W(SWING, 2), W(EARLIER, 3)])).toBe(EARLIER);
    expect(next([W(FIX, 1), W(SWING, 2), W("W_STAIR_SIDE_ENTRY", 3)])).toBe("W_STAIR_SIDE_ENTRY");
  });

  it("it holds its place beside other earlier-stage findings, later fixtures ones, drafting and undeclared codes", () => {
    expect(next([W(FIX, 1), W(PATH, 2), W(EARLIER, 3), W(HOB, 4), W(DRAFTING, 5), W("W_NOT_A_RULE", 6)])).toBe(FIX);
  });
});

describe("nextDiagnostic · the defect corpus table", () => {
  const cases = DEFECT_SOURCES.filter((s) => !s.name.endsWith(".clean.arch"));
  const rows = cases.map((s) => {
    const h = headerOf(s.src);
    const linted = lintWithCoverage(s.src);
    const warnings = linted.diagnostics.filter((d) => d.severity === "warning");
    const compiled = compile(s.src).diagnostics;
    const compileWarnings = compiled.filter((d) => d.severity === "warning");
    const next = nextDiagnostic({ diagnostics: compiled, lint: linted.diagnostics });
    return {
      name: s.name,
      expect: h.expect!,
      status: h.status!,
      compileWarnings,
      warnings,
      layers: linted.layers,
      next,
    };
  });
  const done = rows.filter((r) => r.status === "done");

  it("covers the corpus (the table is not vacuous)", () => {
    expect(rows.length).toBeGreaterThan(60);
    expect(done.length).toBeGreaterThan(40);
  });

  it("the table reaches both lint tiers (drafting is not carried by one pinned row alone)", () => {
    const byTier = (t: string): number => rows.filter((r) => r.next?.tier === t).length;
    expect(byTier("validity")).toBeGreaterThan(0);
    expect(byTier("drafting")).toBeGreaterThan(0);
    // Rows whose expect code is drafting-layer: the drafting tier's population in the corpus.
    expect(done.filter((r) => r.layers[r.expect] === "drafting").length).toBeGreaterThan(0);
  });

  it("every done case's expect code is a lint code with a layer (no vacuous row)", () => {
    expect(done.filter((r) => r.layers[r.expect] === undefined).map((r) => `${r.name}: ${r.expect}`)).toEqual([]);
  });

  it("every bad twin's next: first compile warning, else first validity warning, else first drafting one", () => {
    // The validity tier's one exception, stated not re-derived: a first item that yields (a swing
    // shortfall, PS7.7; a fixtures finding, PS7.10) beside a stair-safety code or swing shortfall
    // may be replaced by one of those; the unit blocks above pin which.
    const yieldsTo = (code: string): boolean => STAIR_SAFETY_CODES.has(code) || SWING_SHORTFALL_CODES.has(code);
    const wrong = rows.flatMap((r) => {
      const cw = r.compileWarnings[0];
      const first = r.warnings.find((d) => r.layers[d.code!] !== "drafting") ?? r.warnings[0];
      const yielding =
        !cw &&
        first !== undefined &&
        (SWING_SHORTFALL_CODES.has(first.code!) || LINT_CODE_STAGES[first.code!] === "fixtures");
      if (yielding && r.next?.tier === "validity" && r.next.code !== null && yieldsTo(r.next.code)) {
        return r.warnings.some((d) => d.code === r.next!.code) ? [] : [`${r.name}: ${r.next.code} not raised`];
      }
      const want = cw
        ? { tier: "warning", code: cw.code }
        : first
          ? { tier: r.layers[first.code!] ?? "validity", code: first.code }
          : null;
      const got = r.next ? { tier: r.next.tier, code: r.next.code } : null;
      return JSON.stringify(got) === JSON.stringify(want) ? [] : [`${r.name}: ${JSON.stringify(got)}`];
    });
    expect(wrong).toEqual([]);
  });

  it("a done case whose only warning is its expect code gets exactly that code, in that code's tier", () => {
    const single = done.filter((r) => r.warnings.length === 1 && r.compileWarnings.length === 0);
    expect(single.length).toBeGreaterThan(20);
    for (const r of single) {
      expect(r.warnings[0]!.code, r.name).toBe(r.expect);
      expect(r.next, r.name).toMatchObject({ code: r.expect, tier: r.layers[r.expect] });
    }
  });

  it("a done case's next has its expect code's tier, unless a higher tier outranks it", () => {
    for (const r of done) {
      const tier = r.layers[r.expect];
      if (r.compileWarnings.length > 0) expect(r.next?.tier, r.name).toBe("warning");
      else if (tier === "drafting" && r.warnings.some((d) => r.layers[d.code!] !== "drafting"))
        expect(r.next?.tier, r.name).toBe("validity"); // the lead ruling: drafting never ahead of validity
      else expect(r.next?.tier, r.name).toBe(tier);
    }
  });

  it("title-overflow is a real drafting-tier row (W_TITLE_OVERFLOW)", () => {
    const r = rows.find((x) => x.name.endsWith("annotation-collisions/title-overflow.arch"))!;
    expect(r.status).toBe("done");
    expect(r.next).toMatchObject({ tier: "drafting", code: "W_TITLE_OVERFLOW" });
  });

  it("every clean twin's next never names its case's expect code", () => {
    for (const s of DEFECT_SOURCES.filter((x) => x.name.endsWith(".clean.arch"))) {
      const twinOf = headerOf(s.src)["twin-of"]!;
      const c = cases.find((x) => x.name.endsWith(`/${twinOf}.arch`))!;
      const n = nextDiagnostic({ diagnostics: compile(s.src).diagnostics, lint: lint(s.src) });
      expect(n?.code ?? null, s.name).not.toBe(headerOf(c.src).expect);
    }
  });
});

describe("L1 · next is invisible", () => {
  const API: CompilerApi = { compile, describe: describePlan, lint };
  const opts = { world: TASTE_WORLD };
  // Every input next can take, over every example, IN THIS PROCESS, before the digests are read.
  for (const s of EXAMPLE_SOURCES) {
    const diagnostics = compile(s.src, opts).diagnostics;
    if (diagnostics.some((d) => d.severity === "error")) continue;
    nextDiagnostic({
      diagnostics,
      lint: lint(s.src, opts),
      profileLint: lint(s.src, { ...opts, profile: "accessibility-advisory" }),
      intent: validateIntent(s.src, { rooms: 2 }, opts),
      taste: taste(s.src, { profile: "generic", world: TASTE_WORLD }),
    });
  }
  const authorsHeight = new Set(AUTHORS_HEIGHT);
  for (const [name, sha] of BASELINE) {
    it(`examples/${name}.arch: every storey's SVG, describe() and lint() equal the pinned baseline`, () => {
      const src = EXAMPLE_SOURCES.find((s) => s.name === `examples/${name}.arch`)!.src;
      expect(allStoreysDigestWith(API, authorsHeight.has(name) ? heightFreeSource(src) : src, opts)).toBe(sha);
    });
  }
});
