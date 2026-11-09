/**
 * The D4 ⋉ Z² equivariance oracle over RANDOM plans (`test/helpers/arbitrary-plan.ts`).
 *
 * The corpus suites pin violations per example; a random plan has no name to pin, so here
 * whole CLASSES are excluded — each through its own `covers` predicate in
 * `test/tables/equivariance-known.ts` — and any violation no class accounts for fails with the
 * shrunk plan printed. The instance variant of the arbitrary (`RenderOptions.instance`)
 * draws the whole plan as ONE placed component, so a spec renders as P₀ and as gP for any
 * element g.
 *
 * Three laws:
 *
 *  - the instance variant emits only plans that render (the non-vacuity gate, as
 *    `test/fuzz.test.ts` states it for the base arbitrary);
 *  - facts(gP) = g · facts(P₀), tiers T1–T3, modulo the pinned classes;
 *  - nested `place` IS frame composition: `place outer()` around `place body() rotate r1
 *    mirror m1` is the flat `place body()` spelled with the composed frame — same facts,
 *    same lint, byte-identical SVG — modulo the instance path.
 *
 * ## What the T2 (raster) half guarantees, and what it does not
 *
 * No class covers a raster change at all. The nav grid breaks its ties D4-symmetrically
 * (backlog E.6–E.10: an entrance on a lattice line seeds both sides, a threshold is carved
 * on a symmetric row set, a room is measured to the equidistant cell the walk reaches first
 * and then by a group-invariant key, and its seed point sits on the frame's dyadic lattice),
 * so every circulation fact — each room's walk, bottleneck, detour and entrance, every key
 * route, the sealed and unmeasured rooms — and every lint rule that reads the grid must map
 * exactly under every element on a grid-aligned plan, and under a pure translation on any.
 * Any raster violation is NEW.
 *
 * Measured once, not assumed (a one-off run; the shipped tests below run 60, 60 and 30 draws):
 * 4 000 cases on four fixed seeds (11, 22, 43, 91) show no raster
 * violation, where the tree before the tie rules showed one in 1 352 of them (1 076 endpoint
 * ties, 334 far anchor ties, 91 threshold carves, 45 entrance seeds; a case can show more
 * than one).
 *
 * It does NOT prove a walk is right, only that the same plan turned or flipped measures the
 * same: an equivariant regression passes here and is caught by the model-vs-truth gates
 * (`test/circulation-hand-derived.test.ts`, `test/nav-grid-residual.test.ts`).
 *
 * ## Probabilistic
 *
 * Like every property in `test/fuzz.test.ts`, the three `fc.assert` calls are UNSEEDED:
 * each run draws new plans, so this gate samples rather than proves, and a class too rare
 * for 60 draws can go unseen for many runs. A failure prints its seed and shrunk plan.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PlaceRotate } from "../src/ast.js";
import { composeFrame, makeFrame } from "../src/frame.js";
import { compile, type Diagnostic, describe as describePlan, lint } from "../src/index.js";
import { type PlanSpec, planSpec, withInstance } from "./helpers/arbitrary-plan.js";
import {
  D4_ELEMENTS,
  D4_TEST_ELEMENTS,
  elementNamed,
  explain,
  type GroupElement,
  type InstanceRender,
  instanceCase,
  stable,
  translationFor,
  windowOnTie,
} from "./helpers/d4-oracle.js";
import { KNOWN_CLASSES } from "./tables/equivariance-known.js";
import { runs } from "./setup/fast-check.js";

/** Every non-identity element (P₀ is the identity). */
const element: fc.Arbitrary<GroupElement> = fc.constantFrom(...D4_TEST_ELEMENTS.filter((g) => g.name !== "e"));

/** The `instance` render option that places a spec through `g` (P₀ for the identity). */
const placedBy = (spec: PlanSpec, g: GroupElement | null) => {
  const t = g?.translate ? translationFor(spec.grid ?? 0) : 0;
  return {
    rotate: g?.rotate ?? 0,
    ...(g?.mirror ? { mirror: g.mirror } : {}),
    at: { x: t, y: t },
  } as const;
};

/** P₀ / gP of a spec; on the fixed sheet the spec's own `paper` is dropped. */
const renderOf =
  (spec: PlanSpec): InstanceRender =>
  (g, fixedSheet) =>
    withInstance(fixedSheet ? { ...spec, paper: undefined } : spec, placedBy(spec, g));

const geometryCount = (svg: string): number =>
  (svg.match(/<(path|rect|line|circle|polyline|polygon|text)\b/g) ?? []).length;

describe("the instance variant of the arbitrary", () => {
  it("emits only plans that render — no error diagnostic, real geometry", () => {
    fc.assert(
      fc.property(planSpec, element, (spec, g) => {
        const src = withInstance(spec, placedBy(spec, g));
        const out = compile(src, { noCache: true });
        const errors = out.diagnostics.filter((d) => d.severity === "error");
        expect(
          errors.map((e) => `${e.code ?? "<parse>"}: ${e.message}`),
          `The instance variant must emit only VALID plans. This one does not:\n\n${src}`,
        ).toEqual([]);
        expect(geometryCount(out.svg)).toBeGreaterThan(10);
      }),
      { numRuns: runs(60) },
    );
  });
});

describe("facts(gP) = g · facts(P₀) over random plans, modulo the pinned classes", () => {
  it("every violation is accounted for by a pinned class", () => {
    fc.assert(
      fc.property(planSpec, element, (spec, g) => {
        const { vs, ctx } = instanceCase(renderOf(spec), g, spec.grid ?? 0, spec.north ?? "up");
        const uncovered = vs.filter((v) => !Object.values(KNOWN_CLASSES).some((c) => c.covers(v, ctx)));
        expect(
          uncovered.map((v) => v.key),
          `NEW equivariance violation under ${g.name} — no pinned class accounts for it:\n${explain(uncovered, 4)}\n\n${ctx.src}`,
        ).toEqual([]);
      }),
      { numRuns: runs(60) },
    );
  }, 120_000);
});

describe("nested `place` is frame composition", () => {
  /** A spelling of a D4 element, including the non-canonical `mirror y`. */
  const spelling = fc.record({
    rotate: fc.constantFrom<PlaceRotate>(0, 90, 180, 270),
    mirror: fc.option(fc.constantFrom<"x" | "y">("x", "y"), { nil: undefined }),
  });

  /** The flat spelling of `outer ∘ inner`, read back off the composed frame. */
  const composed = (outer: { rotate: PlaceRotate; mirror?: "x" | "y" }, inner: typeof outer) => {
    const frame = (s: typeof outer) =>
      makeFrame({
        origin: { x: 0, y: 0 },
        rotate: s.rotate,
        ...(s.mirror ? { mirror: s.mirror } : {}),
        prefix: "",
        component: "",
      });
    const c = composeFrame(frame(outer), frame(inner));
    return { rotate: c.rotate, ...(c.mirror ? { mirror: c.mirror } : {}) };
  };

  /** Everything the two spellings must agree on, with the instance PATH folded away:
   *  `g.inner.<id>` (nested) and `g.<id>` (flat) name the same element. */
  const view = (src: string) => {
    const fold = (v: unknown): unknown =>
      typeof v === "string"
        ? v.replace(/(?<![\w.])g\.inner\b/g, "g")
        : Array.isArray(v)
          ? v.map(fold)
          : v && typeof v === "object"
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [String(fold(k)), fold(x)]))
            : v;
    const { instances: _i, zones: _z, ...summary } = describePlan(src);
    const machine = (d: Diagnostic) => ({ code: d.code, span: d.span, fixes: d.fixes?.map((f) => f.edits) });
    return {
      summary: fold({ ...summary, diagnostics: summary.diagnostics.map(machine) }),
      lint: fold(lint(src).map(machine)),
      svg: compile(src, { noCache: true }).svg,
    };
  };

  it("place outer() ∘ place body() ≡ place body() with the composed spelling", () => {
    fc.assert(
      fc.property(planSpec, spelling, spelling, (spec, outer, inner) => {
        const nested = withInstance(spec, { ...outer, at: { x: 0, y: 0 }, inner });
        const flat = withInstance(spec, { ...composed(outer, inner), at: { x: 0, y: 0 } });
        const a = view(nested);
        const b = view(flat);
        expect(stable(a.summary), `describe() differs:\n${nested}`).toBe(stable(b.summary));
        expect(stable(a.lint), `lint() differs:\n${nested}`).toBe(stable(b.lint));
        expect(a.svg === b.svg, `the SVG differs:\n${nested}`).toBe(true);
      }),
      { numRuns: runs(30) },
    );
  }, 120_000);
});

/**
 * Shrunk counterexamples the unseeded draws above found, pinned so they run on every CI job
 * rather than whenever a draw happens to hit them (`docs/testing.md` § 3: never delete a pin).
 */
describe("pinned fuzz counterexamples", () => {
  /**
   * PS0.13: `W_ROOM_NO_CLEAR_PATH` raised only under `mirror x`. The door's centre sat on a
   * line of the room's occupancy grid (`src/analyze/occupancy.ts`), and flooring seeded the
   * flood from its +x column: the plain plan seeded the open column the second WC leaves
   * free, the mirrored plan the column beside it — a 4-cell pocket between the first WC and
   * the wall. A connector on a cell line now seeds both sides of it.
   */
  const ps013 = (g: GroupElement | null): string => `plan "P" {
  units mm
  component body() {
    wall id=w_shell exterior thickness 100 { (0,0) (2000,0) (2000,2000) (0,2000) close }
    room id=r0 at (0,0) size 2000x2000
    door id=o0 hinged on w_shell at 5% width 700
    furniture id=f0 wc at (0,51) size 400x300
    furniture id=f1 wc at (357,0) size 300x300
  }
  place body() as g at (${g?.translate ? translationFor(0) : 0},${g?.translate ? translationFor(0) : 0}) rotate ${g?.rotate ?? 0}${g?.mirror ? " mirror x" : ""}
}`;

  it("PS0.13: the doorway-on-a-cell-line room lints the same under every D4 element", () => {
    const codes = (g: GroupElement | null) => lint(ps013(g)).map((d) => d.code);
    const base = codes(null);
    expect(base).not.toContain("W_ROOM_NO_CLEAR_PATH");
    for (const g of D4_ELEMENTS) expect(codes(g), g.name).toEqual(base);
  });

  it("PS0.13: the oracle finds no violation for the witness under any element", () => {
    for (const g of D4_TEST_ELEMENTS.filter((e) => e.name !== "e")) {
      const { vs } = instanceCase((h) => ps013(h), g, 0, "up");
      expect(
        vs.map((v) => v.key),
        `${g.name}:\n${explain(vs, 4)}`,
      ).toEqual([]);
    }
  }, 60_000);

  /**
   * PS0.19 (fast-check seed 1736625303, path "29:2:2:2:10:10:10:10:10:10:11:11:20:20:20:20:
   * 20:20:20:20:20:20:20:20", g = t): `windows[g.o0].facing` read E on P₀ and S translated.
   * `at 55%` resolved to y = (55 / 100) · 6000 = 3300.0000000000005, an ulp off the room
   * corner (2000,3300), so P₀ had no tie; 20 m out the ulp rounded away, the window sat on
   * the corner and the N/S-first `facing-tie` convention answered S. `percentOf`
   * (`src/attach.ts`) now resolves it to 3300 exactly in both.
   */
  const ps019 = (g: GroupElement | null): string => `plan "P" {
  units mm
  component body() {
    wall id=w_shell exterior thickness 100 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    wall id=w_v1 partition thickness 80 { (2000,0) (2000,6000) }
    wall id=w_v2 partition thickness 80 { (4000,0) (4000,6000) }
    wall id=w_h1 partition thickness 80 { (0,3300) (6000,3300) }
    room id=r0 at (0,0) size 2000x3300
    room id=r1 at (2000,0) size 2000x3300
    room id=r2 at (4000,0) size 2000x3300
    room id=r3 at (0,3300) size 2000x2700
    room id=r4 at (2000,3300) size 2000x2700
    room id=r5 at (4000,3300) size 2000x2700
    window id=o0 on w_v1 at 55% width 600
  }
  place body() as g at (${g?.translate ? translationFor(0) : 0},${g?.translate ? translationFor(0) : 0}) rotate ${g?.rotate ?? 0}${g?.mirror ? " mirror x" : ""}
}`;

  it("PS0.19: a window `at 55%` on a room corner faces the same way translated", () => {
    const { vs, ctx } = instanceCase((h) => ps019(h), elementNamed("t"), 0, "up");
    expect(
      vs.map((v) => v.key),
      `t:\n${explain(vs, 4)}`,
    ).toEqual([]);
    // Not vacuous: P₀ resolves the window ON the corner, so it is a tie read N/S-first.
    expect(windowOnTie(ctx.obs0, "g.o0")).toBe(true);
  });

  it("PS0.19: every element's violations of the witness are accounted for by a pinned class", () => {
    for (const g of D4_TEST_ELEMENTS.filter((e) => e.name !== "e")) {
      const { vs, ctx } = instanceCase((h) => ps019(h), g, 0, "up");
      const uncovered = vs.filter((v) => !Object.values(KNOWN_CLASSES).some((c) => c.covers(v, ctx)));
      expect(
        uncovered.map((v) => v.key),
        `${g.name}:\n${explain(uncovered, 4)}`,
      ).toEqual([]);
    }
  }, 60_000);
});
