/**
 * One digest body for the byte-identity laws, importable WITHOUT vitest.
 *
 * A byte-identity law is a claim that a plan not using a new form did not move, and the only
 * thing that can settle it is a measurement taken before the form existed. That measurement
 * has to be made by a program that loads the OLD `src/` — so it cannot be a test file, which
 * loads vitest and its own suite the moment it is imported.
 *
 * Hence this module: the digest body lives here, parameterised over the compiler API, and
 * both callers import it. The test hands it the current `src/`; the baseline generator hands
 * it a `git archive` of an earlier commit. **That is the whole point.** An earlier attempt at
 * this kind of test in this repository measured its baseline with a lookalike scratch script
 * whose payload separator differed by one character, and reported four "failures" over
 * artifacts that were in fact byte-identical. Two callers, one body, no lookalike.
 *
 * The payload is the whole agent-facing surface — SVG, `describe()` **and** `lint()` — not the
 * drawing alone. A change that appends an empty key to every summary leaves the drawing
 * untouched and is still a behaviour change for every `arch describe --json` consumer.
 */

import { createHash } from "node:crypto";
import type { compile, describe, lint } from "../src/index.js";
import type { World } from "../src/world.js";

/** The three surfaces a compiler change can move. */
export interface CompilerApi {
  compile: typeof compile;
  describe: typeof describe;
  lint: typeof lint;
}

/**
 * What a caller may vary about the compilation itself.
 *
 * `world` exists so a law can cover the examples that `import` — `imports.arch` and
 * `museum-wings.arch` are shipped plans like any other and a sweep that silently skips
 * them is a corpus with a hole in it (AGENTS.md: "a gate is only as strong as its
 * corpus"). Nothing else may be varied: the digest bodies below are pinned shapes.
 */
export interface DigestOptions {
  world?: World;
}

/**
 * SHA-256 over one source's SVG, `describe()` summary and `lint()` diagnostics, joined by a
 * single space — a separator none of the three can contain at a join point, since each is a
 * complete document.
 */
export function digestWith(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  const out = api.compile(src, { noCache: true, ...opts });
  const payload = [out.svg, JSON.stringify(api.describe(src, opts)), JSON.stringify(api.lint(src, opts))].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * {@link digestWith} widened to EVERY STOREY, which is the only honest sweep on a repository
 * whose examples include three multi-level plans.
 *
 * `compile().svg` is the GROUND floor alone — an upper storey reaches a caller through
 * `pages[]` — so a law taken over `svg` would leave `townhouse`'s levels 2 and 3 entirely
 * unmeasured. This body joins every page's SVG in `pages[]` order (falling back to the single
 * `svg` when a plan has no levels), then the summary and the diagnostics, so a change that
 * moved only an upper floor cannot pass.
 */
export function allStoreysDigestWith(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  const out = api.compile(src, { noCache: true, ...opts });
  const drawings = out.pages ? out.pages.map((p) => p.svg) : [out.svg];
  const payload = [...drawings, JSON.stringify(api.describe(src, opts)), JSON.stringify(api.lint(src, opts))].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * The same digest with the DRAWING left out — `describe()` and `lint()` only.
 *
 * ## Why the whole-surface digest was not enough on its own (v1.32)
 *
 * {@link digestWith} answers "did anything move", which is the right question and has one
 * weakness: a release that legitimately redraws a symbol moves every pin taken with it, and
 * then the only available response is to re-measure every hex — at which point the law has
 * stopped guarding the two surfaces it was mostly written for. v1.32's furniture pass is
 * exactly that release: it redraws six kitchen and bath symbols, so the SVG of every plan
 * that places one is different by design, while `describe()` and `lint()` must not move by so
 * much as a key.
 *
 * So the laws now carry BOTH. The whole-surface pin still catches everything and is
 * re-measured, with its reason recorded, when a drawing deliberately changes. This one is
 * blind to the drawing and therefore survives such a release untouched — which is what lets a
 * reader tell "the picture changed" from "the summary changed" without taking either on
 * trust.
 *
 * The separator and the `JSON.stringify` shape are {@link digestWith}'s, unchanged, so a
 * baseline for one can be taken in the same pass as a baseline for the other.
 */
export function semanticDigestWith(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  const payload = [JSON.stringify(api.describe(src, opts)), JSON.stringify(api.lint(src, opts))].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
