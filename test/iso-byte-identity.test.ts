/**
 * **The byte-identity law for the axonometric view (v1.35).**
 *
 * Every new form ships with one: a plan that does not use it renders, describes and lints
 * exactly as before. The view is not a language form — it is a compile OPTION — so its law
 * reads one step out: **a compile that passes no `view` is untouched in all three
 * agent-facing surfaces.**
 *
 * That matters more than it might look, because this change did not stay inside a new
 * directory. It extracted `joinWallSet` out of `lowerWallSet` (the path EVERY wall in every
 * drawing takes), added a field to `Scene`, put a branch in the SVG backend's layer
 * grouping and another in the PDF's chrome, and made the DXF LAYER table conditional. Any
 * one of those could have moved a byte on the ordinary path.
 *
 * ## The corpus, and where the numbers come from
 *
 * All thirty shipped examples, every storey of each, against the SAME table
 * `height-byte-identity.test.ts` uses — imported from `./byte-identity-baseline.js` rather
 * than retyped, because two hand-typed copies of thirty hashes is two things to keep true
 * and the point of a measured baseline is that it is measured once. It was taken on
 * `f4548db`, the tree `v1.34.0` shipped, by a script that imported the digest bodies in
 * `./byte-identity-digest.ts` — never a lookalike.
 *
 * ## If one of these moves
 *
 * It is a finding to explain, never a value to re-bless, and the two most likely culprits
 * are named: the `joinWallSet` extraction (it must be a pure move — same interner, same
 * cut order, same `joinWalls` arguments) and the SVG backend's `scene.view` branch, which
 * must leave the per-CAD-layer grouping exactly as it was when the field is absent.
 *
 * ## And the surfaces the view must never reach
 *
 * `describe()` and `lint()` take no view option at all — `test/iso-describe-blind.test.ts`
 * makes the structural case — so the check here is behavioural: the same source, described
 * and linted, is the same JSON whether or not something else compiled it as a picture.
 */

import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { World } from "../src/world.js";
import { BASELINE, SEMANTIC_BASELINE } from "./byte-identity-baseline.js";
import { type CompilerApi, allStoreysDigestWith, semanticDigestWith } from "./byte-identity-digest.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const EXAMPLES = resolvePath("examples");

/** A World over the examples directory, so the two plans that `import` are covered too. */
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

const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");

suite("iso byte-identity — a compile with no `view` is unchanged everywhere", () => {
  it("covers the whole shipped corpus (a law over an empty list is not a law)", () => {
    expect(BASELINE.length).toBe(30);
    expect(SEMANTIC_BASELINE.length).toBe(30);
  });

  for (const [name, sha] of BASELINE) {
    it(`${name}.arch renders, describes and lints exactly as on v1.34.0 — every storey`, () => {
      expect(allStoreysDigestWith(API, srcOf(name), { world })).toBe(sha);
    });
  }

  for (const [name, sha] of SEMANTIC_BASELINE) {
    it(`${name}.arch's describe() + lint() are unchanged (blind to the drawing)`, () => {
      expect(semanticDigestWith(API, srcOf(name), { world })).toBe(sha);
    });
  }
});

suite("iso byte-identity — the view does not leak into the summary surfaces", () => {
  // Three plans that between them carry curves, multiple storeys, ground, a void and a
  // roof — the elements the view either extrudes or deliberately skips.
  for (const name of ["studio", "two-storey", "aquarium", "hillside-villa"]) {
    it(`${name}: describe() and lint() are identical whether or not the plan is also drawn in 3D`, () => {
      const src = srcOf(name);
      const before = [JSON.stringify(describePlan(src, { world })), JSON.stringify(lint(src, { world }))];
      // Compile it as a picture, twice over, in both presets.
      for (const view of ["iso", "axon"] as const) compile(src, { view, world, noCache: true });
      const after = [JSON.stringify(describePlan(src, { world })), JSON.stringify(lint(src, { world }))];
      expect(after).toEqual(before);
    });
  }

  it("an ordinary compile still returns `pages` for a multi-storey plan", () => {
    const out = compile(srcOf("two-storey"), { world, noCache: true });
    expect(out.pages?.length).toBe(2);
  });

  it("a VIEW compile returns ONE drawing of the whole building, so there are no pages", () => {
    // Deliberate and stated: an axonometric of a house is one picture, not a set of
    // sheets, so `-o house.svg` writes the file it names rather than `house.L1.svg`.
    const out = compile(srcOf("two-storey"), { view: "iso", world, noCache: true });
    expect(out.pages).toBeUndefined();
    expect(out.svg.length).toBeGreaterThan(0);
    expect(out.scene?.view).toBe("iso");
  });

  it("a view carries no sheet, no scale and no title block — it must not look issuable", () => {
    // `hillside-villa` declares `paper A2` and a scale; the plan drawing gets a sheet and
    // the view must not inherit it.
    const src = srcOf("hillside-villa");
    expect(compile(src, { world, noCache: true }).scene?.sheet).toBeDefined();
    const iso = compile(src, { view: "iso", world, noCache: true });
    expect(iso.scene?.sheet).toBeUndefined();
    expect(iso.scene?.scale).toBeUndefined();
    expect(iso.svg).not.toContain("Scale");
  });
});
