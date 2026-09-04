/**
 * **The view is deterministic** — the same claim `compile()` has always made, extended to
 * the one path in the compiler whose output order is computed rather than authored.
 *
 * A plan drawing's node order comes from the source: elements in source order, bucketed by
 * a fixed pass list. The axonometric's comes from a **sort over floating-point depths**, so
 * it is the first drawing in this repository whose order could in principle wobble. Hence
 * two properties rather than one:
 *
 *  - over the whole shipped corpus, in both presets, compiling twice gives the same bytes;
 *  - over 200 machine-generated plans from `test/arbitrary-plan.ts` — which emit walls,
 *    rooms, openings and fixtures **by construction** rather than the `fc.string()` bodies
 *    that once produced zero geometry across 5000 samples — the same.
 *
 * The generated half is what makes this more than a re-run: it reaches wall configurations
 * nobody wrote, including the coincident and nearly-coincident faces where a depth tie is
 * most likely, and a plan with equal-depth faces is exactly the case the reference
 * implementation's untied sort gets wrong.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { World } from "../src/world.js";
import { archPlan } from "./arbitrary-plan.js";

const EXAMPLES = resolvePath("examples");
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};

const EXAMPLE_NAMES = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .sort();

suite("iso determinism — the shipped corpus", () => {
  it("has examples to run over", () => {
    expect(EXAMPLE_NAMES.length).toBeGreaterThanOrEqual(30);
  });

  for (const view of ["iso", "axon"] as const) {
    it(`${view}: every shipped example compiles to the same bytes twice`, () => {
      for (const f of EXAMPLE_NAMES) {
        const src = readFileSync(join(EXAMPLES, f), "utf8");
        const a = compile(src, { view, world, noCache: true });
        const b = compile(src, { view, world, noCache: true });
        expect(b.svg, f).toBe(a.svg);
      }
    });
  }

  it("the two presets DIFFER — a determinism test that compared a view to itself would pass vacuously", () => {
    const src = readFileSync(join(EXAMPLES, "studio.arch"), "utf8");
    const iso = compile(src, { view: "iso", noCache: true }).svg;
    const axon = compile(src, { view: "axon", noCache: true }).svg;
    expect(axon).not.toBe(iso);
    expect(iso.length).toBeGreaterThan(0);
    expect(axon.length).toBeGreaterThan(0);
  });
});

suite("iso determinism — generated plans", () => {
  it("200 constructed plans render identically twice, in both presets", () => {
    fc.assert(
      fc.property(archPlan, (src) => {
        for (const view of ["iso", "axon"] as const) {
          const a = compile(src, { view, noCache: true });
          const b = compile(src, { view, noCache: true });
          expect(b.svg).toBe(a.svg);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("those plans really do produce geometry — the property is not asserting over blanks", () => {
    let withFaces = 0;
    fc.assert(
      fc.property(archPlan, (src) => {
        const out = compile(src, { view: "iso", noCache: true });
        if ((out.scene?.nodes.length ?? 0) > 0) withFaces++;
      }),
      { numRuns: 50 },
    );
    expect(withFaces).toBeGreaterThan(40);
  });
});
