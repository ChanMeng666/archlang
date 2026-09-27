/**
 * The D4 ⋉ Z² equivariance oracle over RANDOM plans (`test/arbitrary-plan.ts`).
 *
 * The corpus suites pin violations per example; a random plan has no name to pin, so here
 * whole CLASSES are excluded — each through its own `covers` predicate in
 * `test/equivariance-known.ts` — and any violation no class accounts for fails with the
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
 * No class covers a raster change by PATH. Every walk change is attributed through the
 * render overlay (`attributeWalks`): where the entrance cell and the room's measured cell
 * went, whether the measured cell is an exact tie, whether the seed point itself moved. So
 * a random plan passes only when each change is one of these, and no bigger:
 *
 *  - `raster-tie` — the walk moved by no more than its endpoints did, each endpoint at most
 *    one lattice step per tied axis (≤ 3 cells), with the measured/unmeasured/sealed room
 *    sets unchanged; a bottleneck by at most one clear-width quantum (2 cells);
 *  - `entrance-seed-walk` — the entrance is on a lattice line and its tied row is eroded,
 *    and the walk moved by no more than the endpoints did;
 *  - `anchor-far-tie` — the measured cell jumped more than a step to a cell EXACTLY as far
 *    from the seed point (a ring round an obstacle);
 *  - `label-point-tie` — a concave room's seed point itself moved;
 *  - `threshold-carve` — P₀ has a doorway seeded across a lattice line, and the walk moved
 *    by MORE than its endpoints did (the grid itself differs) or a room's measurement
 *    appeared, vanished or was sealed;
 *  - a raster lint rule only when every circulation change of the case is one of these.
 *
 * It does NOT prove a walk is right: a raster regression that happens to fit one of these
 * shapes (say, a threshold that stops carving in a plan with a doorway on a lattice line)
 * passes here and is caught only by the corpus pins, which bound each room's change.
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
import { type PlanSpec, planSpec, withInstance } from "./arbitrary-plan.js";
import {
  D4_TEST_ELEMENTS,
  explain,
  type GroupElement,
  type InstanceRender,
  instanceCase,
  stable,
  translationFor,
} from "./d4-oracle.js";
import { KNOWN_CLASSES } from "./equivariance-known.js";

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
      { numRuns: 60 },
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
      { numRuns: 60 },
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
      { numRuns: 30 },
    );
  }, 120_000);
});
