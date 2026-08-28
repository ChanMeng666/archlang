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

/** The three surfaces a compiler change can move. */
export interface CompilerApi {
  compile: typeof compile;
  describe: typeof describe;
  lint: typeof lint;
}

/**
 * SHA-256 over one source's SVG, `describe()` summary and `lint()` diagnostics, joined by a
 * single space — a separator none of the three can contain at a join point, since each is a
 * complete document.
 */
export function digestWith(api: CompilerApi, src: string): string {
  const out = api.compile(src, { noCache: true });
  const payload = [out.svg, JSON.stringify(api.describe(src)), JSON.stringify(api.lint(src))].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
