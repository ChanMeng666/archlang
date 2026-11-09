/**
 * The playground's Embed → Markdown snippet points an unedited example at the docs
 * gallery's drawing: `https://archlang.uk/examples/<name>.svg`, or one storey's
 * `<name>.L<n>.svg`. `playground/src/embed-snippets.ts` writes that name itself (the
 * browser bundle cannot import the CLI), so this gate holds the copy to the original:
 * for every example the gallery publishes, and every storey it has, the snippet's file
 * is the one `levelTarget()` names — the same law `docs-level-svgs.test.ts` holds
 * `docs-site/sync-docs.mjs` to, so the snippet, the gallery and `arch compile` agree.
 */

import { exampleNames } from "./helpers/corpus.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_IMAGE_BASE, exampleImageUrl } from "../playground/src/embed-snippets.js";
import { levelTarget } from "../src/cli/io.js";
import { compile } from "../src/index.js";

const SYNC = "docs-site/sync-docs.mjs";

/** The gallery's examples, derived the way sync-docs derives them: every top-level
 *  `examples/*.arch` minus its EXCLUDED_EXAMPLES table. */
function galleryExamples(): string[] {
  const block = /const EXCLUDED_EXAMPLES = \[([\s\S]*?)\n\];/.exec(readFileSync(SYNC, "utf8"));
  expect(block, `${SYNC} no longer declares EXCLUDED_EXAMPLES — update this extractor`).toBeTruthy();
  const excluded = new Set([...block![1]!.matchAll(/\["([^"]+\.arch)"/g)].map((m) => m[1]));
  return exampleNames()
    .filter((f) => !excluded.has(f))
    .map((f) => f.replace(/\.arch$/, ""))
    .sort();
}

describe("the Embed snippet's example image is the file the gallery publishes", () => {
  const names = galleryExamples();

  it("is not vacuous", () => {
    expect(names.length).toBeGreaterThan(20);
    expect(names).toContain("hillside-villa");
  });

  it("names every example's drawing, and every storey's, as levelTarget() does", () => {
    let storeys = 0;
    for (const name of names) {
      const { pages } = compile(readFileSync(`examples/${name}.arch`, "utf8"), { noCache: true });
      // sync-docs writes `<name>.svg` for every example (page 1 of a multi-storey one).
      expect(exampleImageUrl(name, null)).toBe(`${EXAMPLE_IMAGE_BASE}${name}.svg`);
      for (const p of pages ?? []) {
        storeys++;
        expect(exampleImageUrl(name, p.level), `${name} level ${p.level}`).toBe(
          `${EXAMPLE_IMAGE_BASE}${levelTarget(`${name}.svg`, p.level)}`,
        );
      }
    }
    expect(storeys, "no multi-storey example exercised the storey naming").toBeGreaterThan(0);
  });

  it("agrees with levelTarget() on the awkward levels too (0 and a basement)", () => {
    for (const level of [0, -1, 10]) {
      expect(exampleImageUrl("townhouse", level)).toBe(`${EXAMPLE_IMAGE_BASE}${levelTarget("townhouse.svg", level)}`);
    }
  });
});
