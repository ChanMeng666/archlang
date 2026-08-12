import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyFixes,
  compile,
  format,
  lint,
  rankFixes,
  repair,
  type Diagnostic,
  type FixSuggestion,
} from "../src/index.js";
import { FURNITURE_ANCHORS } from "../src/ast.js";
import { DOOR_KINDS } from "../src/grammar/tokens.js";
import {
  anchorTouchesEdge,
  archPlan,
  featureFreePlan,
  planSpec,
  renderPlan,
  siteClause,
  withSite,
  withZone,
  zoneId,
} from "./arbitrary-plan.js";

/**
 * Property-based guards over `compile()` and the source-to-source transforms.
 *
 * ## Two corpora, on purpose
 *
 * **`fc.string()`** (below, first block) is the HOSTILE-INPUT corpus. Its law is that
 * `compile()` never throws and always returns a well-formed result — a law about the
 * error path, which is exactly where arbitrary bytes land. Measured: of 5000 sampled
 * bodies only ~10% even compile (they are the empty/whitespace ones), and **zero**
 * produce a single geometry element. That is the right corpus for "never throws" and
 * the wrong one for anything else.
 *
 * **{@link archPlan}** (`test/arbitrary-plan.ts`) is the RENDERING corpus: grammar-aware,
 * valid by construction, ~160 geometry elements per plan. Every law below that is about
 * what the compiler *produces* — determinism, cache transparency, byte-identity under an
 * inert addition, the round-trips — is stated over it. Before it existed, the flagship
 * determinism property fed `fc.string()` into a plan body and so asserted, in practice,
 * only that the ERROR path is deterministic (backlog 2.4).
 *
 * ## Three findings this file records rather than asserts
 *
 * Writing the round-trip laws turned up three defects. One is fixed; two are stated here
 * as measured facts with named reproducers, because closing them is a design decision
 * and not a test change:
 *
 *  1. **FIXED — `format()` silently dropped a door's kind word and its `slide`/`open`
 *     clauses** (`src/format.ts`). `arch fmt` turned `door pocket … slide left` into a
 *     plain hinged door: different bytes, different drawing, and `describe().doors[].kind`
 *     gone. Invisible until now because every fixture that formats a door uses the
 *     `hinged` default — the one word the resolver drops anyway. Pinned below by
 *     "format preserves the drawing" plus a per-kind example.
 *  2. **OPEN — `W_DIM_INSIDE`'s fix does not converge; it 2-CYCLES.** See
 *     {@link NON_CONVERGENT_FIX_CODES}.
 *  3. **OPEN — `repair(repair(s)) !== repair(s)`.** See the repair block.
 */

// ---------------------------------------------------------------------------
// 1. The hostile-input corpus — the law is "never throws", and it is unchanged
// ---------------------------------------------------------------------------

describe("compile — hostile input", () => {
  it("never throws and always returns a well-formed result on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = compile(s, { noCache: true });
        expect(typeof r.svg).toBe("string");
        expect(Array.isArray(r.diagnostics)).toBe(true);
        expect(Array.isArray(r.errors)).toBe(true);
        expect(Array.isArray(r.warnings)).toBe(true);
        // svg is non-empty only when there are no error-severity diagnostics.
        const hasError = r.diagnostics.some((d) => d.severity === "error");
        if (hasError) expect(r.svg).toBe("");
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic for arbitrary plan-wrapped bodies", () => {
    // Retained deliberately: the ERROR path has to be deterministic too (an error card,
    // a diagnostic order, a span). What it does NOT establish is determinism of the
    // rendering path — that is the next block's job, and this one cannot reach it.
    fc.assert(
      fc.property(fc.string(), (body) => {
        const src = `plan "F" { ${body} }`;
        expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The rendering corpus is real — a green run below cannot be vacuous
// ---------------------------------------------------------------------------

/** Geometry-bearing SVG elements, as opposed to the page frame an empty plan emits. */
const geometryCount = (svg: string): number =>
  (svg.match(/<(path|rect|line|circle|polyline|polygon|text)\b/g) ?? []).length;

/** The whole-plan error set. Warnings are expected and welcome (see the arbitrary's header). */
const errorsOf = (src: string): Diagnostic[] =>
  compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");

describe("the grammar-aware arbitrary is honest about what it emits", () => {
  it("emits only plans that render — no error diagnostic, real geometry", () => {
    // THE non-vacuity gate for everything below. If the arbitrary ever starts leaking
    // error cases, every law after this point silently degrades toward the old
    // `fc.string()` behaviour — asserting things about `svg === ""` — so this runs first
    // and reports the offending source verbatim.
    fc.assert(
      fc.property(archPlan, (src) => {
        const errors = errorsOf(src);
        expect(
          errors.map((e) => `${e.code ?? "<parse>"}: ${e.message}`),
          `The arbitrary must emit only VALID plans. This one does not:\n\n${src}`,
        ).toEqual([]);
        expect(geometryCount(compile(src, { noCache: true }).svg)).toBeGreaterThan(10);
      }),
      { numRuns: 200 },
    );
  });

  it("reaches the forms it claims to cover", () => {
    // "Coverage over cleverness": an arbitrary that only ever emits one rectangular room
    // proves nothing, and nothing else in this file would notice if it degenerated into
    // that. A fixed seed keeps the assertion stable — it is a statement about the
    // GENERATOR, not about a particular run.
    const corpus = fc.sample(archPlan, { numRuns: 400, seed: 20260813 }).join("\n");
    const missing = [
      // walls with several segments, and a curved one
      ["a closed multi-segment shell", /wall id=w_shell exterior[^\n]*close/],
      ["an interior partition", /wall id=w_v1 partition/],
      ["an arc edge", /\barc \(/],
      // the three room shapes
      ["a rectangular room", /room id=r0 at \(/],
      ["a polygon room", /room id=r_poly polygon/],
      ["a circular room", /room id=r_circ circle/],
      ["a relationally-placed room", /room id=r_rel/],
      // openings hosted on walls
      ["a window", /^\s*window id=/m],
      ["a cased opening", /^\s*opening id=/m],
      // all four fixture placement forms
      ["furniture at (x,y)", /furniture id=\w+ \S+ at \(/],
      ["furniture against a wall", /furniture[^\n]*against wall/],
      ["furniture centered in a room", /furniture[^\n]*centered/],
      ["furniture anchored in a room", /furniture[^\n]*anchor /],
      ["a flush anchored fixture", /furniture[^\n]* flush/],
      // dimensioning, both manual and automatic
      ["a manual dimension", /^\s*dim \(/m],
      ["a `faces`/`clear` dimension", /^\s*dim (faces|clear) /m],
      ["a curve call-out", /^\s*dim (radius|diameter) /m],
      ["the `dims auto` setting", /^\s*dims auto /m],
      // plan settings
      ["a paper size", /^\s*paper /m],
      ["a north direction", /^\s*north /m],
      ["a snap grid", /^\s*grid /m],
      ["a room `uses` classification", /\buses \w+/],
      ["a free-standing column", /^\s*column id=/m],
    ]
      .filter(([, re]) => !(re as RegExp).test(corpus))
      .map(([what]) => what);
    expect(missing, "the arbitrary no longer reaches these forms").toEqual([]);

    // Every door kind, read from the owning table so a new one must appear too.
    const unreached = DOOR_KINDS.filter((k) => !new RegExp(`door id=\\w+ ${k} `).test(corpus));
    expect(unreached, "these door kinds are never generated").toEqual([]);
  });

  it("pins the `flush` legality derivation to the anchor table", () => {
    // The arbitrary must not emit `anchor center flush` (`E_FURN_FLUSH` — correct
    // behaviour, so it is respected rather than papered over), and it decides which
    // anchor that is by DERIVING it from AXIS_ALIGNS rather than retyping "center".
    // Pin the derivation: exactly one anchor touches no edge. If the two vocabularies
    // ever decouple, this says so plainly instead of surfacing as a puzzling fuzz miss.
    const edgeless = FURNITURE_ANCHORS.filter((a) => !anchorTouchesEdge(a));
    expect(edgeless).toHaveLength(1);
    expect(FURNITURE_ANCHORS.filter((a) => anchorTouchesEdge(a))).toHaveLength(FURNITURE_ANCHORS.length - 1);
  });
});

// ---------------------------------------------------------------------------
// 3. Determinism — the flagship law, now stated over plans that actually render
// ---------------------------------------------------------------------------

describe("compile — determinism on rendering plans", () => {
  it("is byte-identical across two calls", () => {
    fc.assert(
      fc.property(archPlan, (src) => {
        const a = compile(src, { noCache: true });
        const b = compile(src, { noCache: true });
        expect(b.svg).toBe(a.svg);
        // Diagnostics are part of the contract too: order, spans and codes all stable.
        expect(b.diagnostics).toEqual(a.diagnostics);
      }),
      { numRuns: 200 },
    );
  });

  it("is transparent to the memo cache", () => {
    // `cache.test.ts` establishes hit/eviction mechanics by example; nothing asserted
    // the thing that actually matters to a caller — that a cached answer is the SAME
    // answer. A memo keyed on too little would show up here and nowhere else.
    fc.assert(
      fc.property(archPlan, (src) => {
        const cached = compile(src);
        const fresh = compile(src, { noCache: true });
        expect(fresh.svg).toBe(cached.svg);
        expect(fresh.diagnostics).toEqual(cached.diagnostics);
      }),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Byte-identity under an inert addition — the law behind the fixture pairs
// ---------------------------------------------------------------------------

describe("byte-identity under an unrelated addition", () => {
  // Every new language form ships with "a plan that does not use it renders exactly as
  // before", pinned by a hand-written fixture PAIR. These two properties are the
  // generalisation: the control is a feature-free plan from the arbitrary and the
  // treatment is the same plan plus a form that draws nothing.

  it("a `site` block changes no bytes", () => {
    fc.assert(
      fc.property(planSpec, siteClause, (spec, site) => {
        const control = renderPlan(spec);
        const treated = withSite(spec, site);
        expect(treated).not.toBe(control); // the treatment really was applied
        expect(compile(treated, { noCache: true }).svg).toBe(compile(control, { noCache: true }).svg);
      }),
      { numRuns: 120 },
    );
  });

  it("wrapping every drawable statement in a `zone` changes no bytes", () => {
    fc.assert(
      fc.property(planSpec, zoneId, (spec, zone) => {
        const control = renderPlan(spec);
        const treated = withZone(spec, zone);
        expect(treated).not.toBe(control);
        expect(compile(treated, { noCache: true }).svg).toBe(compile(control, { noCache: true }).svg);
      }),
      { numRuns: 120 },
    );
  });

  it("the control really is feature-free (so the law is not comparing two treated plans)", () => {
    fc.assert(
      fc.property(featureFreePlan, (src) => {
        expect(src).not.toMatch(/^\s*site\b/m);
        expect(src).not.toMatch(/^\s*zone\b/m);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Round-trips
// ---------------------------------------------------------------------------

describe("format — round-trip", () => {
  it("is idempotent", () => {
    fc.assert(
      fc.property(archPlan, (src) => {
        const once = format(src);
        expect(format(once)).toBe(once);
      }),
      { numRuns: 120 },
    );
  });

  it("preserves the drawing", () => {
    // ┌─────────────────────────────────────────────────────────────────────────────┐
    // │ THIS PROPERTY FOUND A REAL, SHIPPED BUG ON ITS FIRST RUN. Read before        │
    // │ deleting it as slow.                                                        │
    // └─────────────────────────────────────────────────────────────────────────────┘
    // On the first 300 generated plans it failed 197 times. The cause: `format()` did
    // not print a door's leading KIND word or its `slide`/`open` clauses, so `arch fmt`
    // rewrote `door pocket … slide left` as a plain hinged door — a different SVG, a
    // swing arc that should not exist, `describe().doors[].kind` gone and `W_POCKET_RUN`
    // no longer applying. A FORMATTER changing semantics, live in v1.26.0.
    //
    // Nothing in the suite could see it: every hand-written fixture that formats a door
    // uses `hinged`, which is the default and the one word the resolver drops anyway. It
    // took a corpus that types the OTHER four kinds without being asked to.
    //
    // Idempotence alone would not have caught it either — a formatter that deletes a
    // clause deletes it stably. The law has to compare the DRAWINGS.
    fc.assert(
      fc.property(archPlan, (src) => {
        const formatted = format(src);
        expect(errorsOf(formatted)).toEqual([]);
        expect(compile(formatted, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
      }),
      { numRuns: 120 },
    );
  });

  it("keeps every door kind and its clauses (the regression that property found)", () => {
    // The property above is the general law; this is the specific defect, named, so a
    // reintroduction reports "pocket" rather than "some plan differs". Generated from
    // DOOR_KINDS, so a sixth kind is covered without an edit here.
    const shell = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
    for (const kind of DOOR_KINDS) {
      const src = `plan "P" {\n  units mm\n${shell}\n  door id=d1 ${kind} on w1 at 50% width 900\n}\n`;
      const formatted = format(src);
      expect(formatted, `format() dropped the \`${kind}\` kind word`).toMatch(new RegExp(`door id=d1 ${kind} `));
      expect(compile(formatted, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    }
    // …and the two clauses that travel with a non-hinged kind.
    const sliding = `plan "P" {\n  units mm\n${shell}\n  door id=d1 sliding on w1 at 50% width 900 slide right open 0.5\n}\n`;
    expect(format(sliding)).toMatch(/slide right open 0\.5/);
    expect(compile(format(sliding), { noCache: true }).svg).toBe(compile(sliding, { noCache: true }).svg);
  });
});

describe("repair — round-trip", () => {
  // NOT asserted: `repair(repair(s)) === repair(s)`.
  //
  // It is FALSE, and measurably so — over 400 generated plans, 262 needed more than one
  // call to reach a fixpoint and **47 never reach one at all**: a fixture ping-pongs
  // between two positions, so iterating `repair` cycles with period 2. `repair`'s own
  // header documents a bounded internal fixpoint that "keeps the pass's own advice" when
  // it runs out of passes, so a second call legitimately continuing the work is arguable
  // design; a stable 2-cycle across calls is harder to defend, since which of the two
  // arrangements you ship then depends on how many times you happened to run `arch
  // repair`. Recorded here as a measured fact for the owner rather than asserted either
  // way — writing `expect(...).not.toBe(...)` would pin the defect in place.
  //
  // What IS asserted is the part of the contract that must hold on every call.

  it("never breaks a plan it corrects", () => {
    fc.assert(
      fc.property(archPlan, (src) => {
        const out = repair(src).source;
        expect(
          errorsOf(out).map((e) => `${e.code ?? "<parse>"}: ${e.message}`),
          `repair() turned a clean plan into one that does not compile:\n\n${out}`,
        ).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });

  it("is deterministic and moves no room", () => {
    // `repair` corrects FURNITURE (ADR 0006). A pass that silently moved a wall or a
    // room would be a much larger claim than the transform makes, and the change log
    // would not mention it.
    fc.assert(
      fc.property(archPlan, (src) => {
        const out = repair(src).source;
        expect(repair(src).source).toBe(out);
        const rooms = (s: string) => (s.match(/^\s*room .*$/gm) ?? []).length;
        expect(rooms(out)).toBe(rooms(src));
      }),
      { numRuns: 60 },
    );
  });
});

/**
 * Diagnostic codes whose machine-applicable fix is known **not to reduce its own
 * diagnostic**, so the `arch fix` loop cannot reach a fixpoint on a plan that raises
 * one. Excluded from the convergence property below — with the reproducer proved live,
 * so this cannot rot into a dumping ground (the `NOT_REPRODUCED_HERE` idiom from
 * `test/spec-forms.test.ts`).
 *
 * `W_DIM_INSIDE` (the only member) offers "swap the dimension's endpoints so the line
 * reads outside the building". On a dimension that runs THROUGH the plan — neither
 * endpoint order puts it outside — the swap is offered again on the next pass and swaps
 * it back: a clean 2-cycle that burns every one of `arch fix`'s passes and leaves the
 * result depending on the parity of the pass budget. The likely remedy is for the fix
 * producer to evaluate its own predicate on the SWAPPED geometry and offer nothing when
 * the swap does not help — but "offer nothing" versus "offer an offset change" is a
 * design call, so this file measures the defect rather than guessing at it.
 */
const NON_CONVERGENT_FIX_CODES = new Map<string, string>([
  ["W_DIM_INSIDE", "the endpoint swap 2-cycles on a dimension that is inside either way"],
]);

/** One `arch fix` pass: top-ranked fix per diagnostic, applied together. Mirrors
 *  `src/cli/commands-author.ts`'s loop body, minus the CLI reporting. */
function fixPass(src: string, skip: ReadonlySet<string>): string | null {
  const fixes: FixSuggestion[] = [];
  for (const d of [...compile(src, { noCache: true }).diagnostics, ...lint(src)]) {
    if (d.code !== undefined && skip.has(d.code)) continue;
    const [top] = rankFixes(d.fixes ?? []);
    if (top) fixes.push(top);
  }
  if (fixes.length === 0) return null;
  const report = applyFixes(src, fixes);
  if (report.applied.length === 0 || report.output === src) return null;
  return report.output;
}

describe("applyFixes — convergence", () => {
  const MAX_PASSES = 8;
  const skip = new Set(NON_CONVERGENT_FIX_CODES.keys());

  it("reaches a fixpoint, and never introduces an error on the way", () => {
    // Measured over 400 generated plans: 265 need zero passes, 130 need one, 5 need two.
    // MAX_PASSES 8 is therefore slack, not a threshold tuned to pass.
    fc.assert(
      fc.property(archPlan, (src) => {
        let cur = src;
        let passes = 0;
        for (; passes < MAX_PASSES; passes++) {
          const next = fixPass(cur, skip);
          if (next === null) break;
          cur = next;
        }
        expect(passes, `the fix loop did not settle within ${MAX_PASSES} passes:\n\n${src}`).toBeLessThan(MAX_PASSES);
        // A fix loop that turns a compiling plan into a broken one is the worst outcome
        // the transform can have — worse than fixing nothing.
        expect(
          errorsOf(cur).map((e) => `${e.code ?? "<parse>"}: ${e.message}`),
          `the fix loop introduced an error:\n\nBEFORE\n${src}\nAFTER\n${cur}`,
        ).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });

  it("the non-convergence exclusions are real and still needed", () => {
    // Staleness guard. Each excluded code must STILL fail to converge — otherwise it was
    // fixed and the exclusion is a lie that hides the next oscillating fix.
    const reproducer = `plan "P" {
  units mm
  wall id=w1 exterior thickness 200 { (0,0) (7700,0) (7700,5000) (0,5000) close }
  room id=r1 at (0,0) size 7700x5000 uses living
  dim clear (0,4000)->(7700,4000) offset 500
}
`;
    expect(errorsOf(reproducer)).toEqual([]);
    expect(lint(reproducer).map((d) => d.code)).toContain("W_DIM_INSIDE");

    // Unskipped, the loop cycles: state N+2 equals state N, forever.
    const states: string[] = [reproducer];
    for (let i = 0; i < 4; i++) {
      const next = fixPass(states[states.length - 1]!, new Set<string>());
      expect(next, "the reproducer stopped producing fixes — W_DIM_INSIDE may be fixed").not.toBeNull();
      states.push(next!);
    }
    expect(states[3], "W_DIM_INSIDE no longer 2-cycles — delete it from NON_CONVERGENT_FIX_CODES").toBe(states[1]);
    expect(states[4]).toBe(states[2]);
    expect(states[1]).not.toBe(states[2]);

    // …and the exclusion list carries a reason for every member, so it stays reviewable.
    for (const [code, why] of NON_CONVERGENT_FIX_CODES) expect(why.length, `${code} has no reason`).toBeGreaterThan(20);
  });
});
