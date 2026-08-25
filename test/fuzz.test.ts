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
import { resolvePlan } from "../src/analyze.js";
import { FURNITURE_ANCHORS } from "../src/ast.js";
import type { RFurniture } from "../src/ir.js";
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
 * Writing the round-trip laws turned up three defects. Two are fixed; one is stated here
 * as a measured fact with a named reproducer, because closing it is a design decision
 * and not a test change:
 *
 *  1. **FIXED — `format()` silently dropped a door's kind word and its `slide`/`open`
 *     clauses** (`src/format.ts`). `arch fmt` turned `door pocket … slide left` into a
 *     plain hinged door: different bytes, different drawing, and `describe().doors[].kind`
 *     gone. Invisible until now because every fixture that formats a door uses the
 *     `hinged` default — the one word the resolver drops anyway. Pinned below by
 *     "format preserves the drawing" plus a per-kind example.
 *  2. **FIXED — `W_DIM_INSIDE`'s fix 2-CYCLED** (backlog 3.10). The producer offered an
 *     endpoint swap it had never evaluated, so on a dimension running THROUGH the
 *     building — inside whichever way round it reads — `arch fix` swapped it back and
 *     forth until the pass budget ran out, leaving the result dependent on the PARITY of
 *     that budget. `dimSwapFix` now re-asks the rule's own predicate (`dimReadsInside` in
 *     `src/geometry.ts`) of the swapped geometry and offers nothing when the answer is
 *     still "inside": the warning stands, the edit does not. The exclusion list this file
 *     used to carry is gone, and its reproducer is inverted below into a fixpoint pin.
 *  3. **FIXED — `repair(repair(s)) !== repair(s)`** (backlog 3.11). Two rules whose
 *     grid-snapped remedies undid each other left a piece ping-ponging, and the pass
 *     banked whichever end it happened to reach; a second call banked the other. Both
 *     levels now park on the CANONICAL member of the cycle they are walking, and the
 *     law is asserted in the repair block below rather than described here.
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
  // THE LAW: `repair(repair(s)).source === repair(s).source`, byte for byte.
  //
  // It used to be false, and measurably so: over 400 generated plans **60 never reached
  // a fixpoint at all** — a fixture ping-ponged between two arrangements with period 2
  // (and up to 4), so which arrangement `arch repair` shipped depended on how many times
  // you happened to have run it. It was recorded rather than asserted for a while, on
  // the grounds that `expect(...).not.toBe(...)` would only pin the defect in place
  // (docs/backlog.md 3.11). Both halves of the cause are now closed — see `repair`'s
  // header for the cycle canonicalisation, and `planWrite` for the second half, a
  // written `at` the resolver snapped somewhere repair had never evaluated — so the
  // property below is what stands in that comment's place.

  it("is idempotent — a second call changes nothing", () => {
    fc.assert(
      fc.property(archPlan, (src) => {
        const once = repair(src).source;
        expect(repair(once).source, `repair is not idempotent on:\n\n${src}\n\nfirst pass gave:\n\n${once}`).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("never reports a move its own output does not contain", () => {
    // `to` is a promise about the source the caller gets back, so it is checked against
    // that source rather than against repair's own arithmetic. It was a promise repair
    // could not keep: a `in <room> centered` piece resolves off-grid (resolver-derived
    // coordinates are not snapped) and an absolute `at` IS snapped, so re-pointing one
    // as the other landed it up to half a grid square from where the log said — 37 of
    // 400 generated plans shipped a change log that disagreed with their own source.
    fc.assert(
      fc.property(archPlan, (src) => {
        const r = repair(src);
        const { ir } = resolvePlan(r.source);
        const where = new Map(
          (ir?.elements ?? []).filter((e) => e.kind === "furniture").map((e) => [e.id, (e as RFurniture).at]),
        );
        for (const c of r.changes) {
          if (c.kind === "rotated") {
            expect(c.fromRotate).not.toBe(c.toRotate);
            continue;
          }
          expect(c.from, "a change log entry reports a move to where the piece started").not.toEqual(c.to);
          const at = where.get(c.id);
          if (at)
            expect({ x: at.x, y: at.y }, `repair reported "${c.id}" at a place its own output does not`).toEqual(c.to);
        }
      }),
      { numRuns: 200 },
    );
  });

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

/** One `arch fix` pass: top-ranked fix per diagnostic, applied together. Mirrors
 *  `src/cli/commands-author.ts`'s loop body, minus the CLI reporting. */
function fixPass(src: string): string | null {
  const fixes: FixSuggestion[] = [];
  for (const d of [...compile(src, { noCache: true }).diagnostics, ...lint(src)]) {
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

  it("reaches a fixpoint, and never introduces an error on the way", () => {
    // Measured over 400 generated plans: 265 need zero passes, 130 need one, 5 need two.
    // MAX_PASSES 8 is therefore slack, not a threshold tuned to pass.
    //
    // There is NO exclusion list. There used to be one — `NON_CONVERGENT_FIX_CODES`,
    // whose single member was `W_DIM_INSIDE` — and it is gone because the defect it
    // named is fixed (backlog 3.10), not because it was inconvenient. If this property
    // ever goes red on a new code, that is a finding about that fix producer: a
    // machine-applicable fix that does not reduce its own diagnostic is worse than no
    // fix at all, since `arch fix` is a fixpoint loop (ADR 0011). Fix the producer —
    // usually by evaluating its own predicate on the geometry the edit WOULD produce —
    // and do not re-introduce a blanket skip.
    fc.assert(
      fc.property(archPlan, (src) => {
        let cur = src;
        let passes = 0;
        for (; passes < MAX_PASSES; passes++) {
          const next = fixPass(cur);
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

  it("settles on the plan whose W_DIM_INSIDE fix used to 2-cycle", () => {
    // The regression pin for backlog 3.10, kept on the EXACT plan that failed. Its
    // `dim clear` measures a line at y4000 through a 7700 × 5000 room, so the drawn line
    // lands at y4500 — inside — and swapping the endpoints only mirrors it to y3500,
    // inside as well. The producer used to offer the swap anyway: `arch fix` then spent
    // all four of its passes swapping the statement back and forth, and which of the two
    // orders you shipped depended on the parity of the pass budget.
    const reproducer = `plan "P" {
  units mm
  wall id=w1 exterior thickness 200 { (0,0) (7700,0) (7700,5000) (0,5000) close }
  room id=r1 at (0,0) size 7700x5000 uses living
  dim clear (0,4000)->(7700,4000) offset 500
}
`;
    expect(errorsOf(reproducer)).toEqual([]);

    // The warning still REPORTS — the rule describes a real problem and withholding the
    // edit must not have silenced it — but it carries no machine-applicable edit, so the
    // very first pass is already a fixpoint.
    const d = lint(reproducer).find((x) => x.code === "W_DIM_INSIDE");
    expect(d, "the reproducer no longer raises W_DIM_INSIDE — it stopped testing anything").toBeDefined();
    expect(d!.fixes ?? [], "a swap that cannot move the line outside must not be offered").toEqual([]);
    expect(fixPass(reproducer), "the loop has nothing to do, so it settles immediately").toBeNull();

    // …and the same holds from the other side of the old cycle: the plan pass 1 used to
    // produce is equally a fixpoint, so there is no parity left to depend on.
    const swapped = reproducer.replace("(0,4000)->(7700,4000)", "(7700,4000)->(0,4000)");
    expect(lint(swapped).map((x) => x.code)).toContain("W_DIM_INSIDE");
    expect(fixPass(swapped)).toBeNull();
  });

  it("still offers — and converges on — the swap it exists for", () => {
    // The other half of the guard: withholding the fix must not have withheld it
    // everywhere. Here the measured segment IS the building's south edge, so the mirror
    // genuinely reaches the outside, and one pass clears the warning for good.
    const reversed = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 uses living
  dim (5000,4000)->(0,4000) offset 500 text "5000"
}
`;
    const before = lint(reversed).find((x) => x.code === "W_DIM_INSIDE");
    expect(before?.fixes?.[0]?.applicability).toBe("machine-applicable");

    const once = fixPass(reversed);
    expect(once).not.toBeNull();
    expect(once).toContain(`dim (0, 4000)->(5000, 4000) offset 500 text "5000"`);
    expect(lint(once!).map((x) => x.code)).not.toContain("W_DIM_INSIDE");
    expect(fixPass(once!), "one pass, then a fixpoint").toBeNull();
  });
});
