/**
 * Drift guard for the committed `examples/*.svg` drawings the README embeds.
 *
 * `scripts/gen-example-svgs.ts` renders them from their `.arch` sources. This test
 * re-renders in-memory and byte-compares — the CI equivalent of
 * `npm run gen:example-svgs && git diff --exit-code`. If it fails, run
 * `npm run gen:example-svgs` and commit (after LOOKING at the new drawing).
 *
 * The reason it exists is the reason it is worth more than a reproducibility check:
 * before this gate, `studio.svg`, `two-bed.svg` and `attached.svg` were hand-committed
 * and never regenerated, so the README showed drawings that predated the opening-void
 * fix, the fixture-orientation fix, the miter-limit cap and the label-placement pass —
 * silently, for months, because nothing compared a picture to the compiler.
 *
 * The README↔list checks below close the other half: a curated list only stays honest
 * if it is pinned to what the README actually embeds, in BOTH directions.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { archPath, README_SVGS, readExampleSource, renderExampleSvg, svgPath } from "../scripts/gen-example-svgs.js";

/** Every `./examples/<name>.svg` the README references as an image or a link. */
function readmeSvgReferences(): string[] {
  const readme = readFileSync("README.md", "utf8");
  const names = new Set<string>();
  for (const m of readme.matchAll(/\.\/examples\/([A-Za-z0-9_-]+)\.svg/g)) names.add(m[1]!);
  return [...names].sort();
}

describe("the committed example SVGs are in sync with the compiler", () => {
  for (const name of README_SVGS) {
    it(`${svgPath(name)} has no drift`, () => {
      const committed = readFileSync(svgPath(name), "utf8").replace(/\r\n/g, "\n");
      expect(renderExampleSvg(name, readExampleSource(name))).toBe(committed);
    });
  }
});

describe("the curated list and the README agree in both directions", () => {
  it("every SVG the README embeds is generated (so it cannot rot)", () => {
    const referenced = readmeSvgReferences();
    // A reference with no generator entry is exactly the state this whole gate exists to
    // prevent: a hand-committed drawing that drifts from the compiler with nothing watching.
    expect(referenced.filter((n) => !(README_SVGS as readonly string[]).includes(n))).toEqual([]);
    // Non-vacuity: the README does embed drawings, so the check above has something to say.
    expect(referenced.length).toBeGreaterThan(0);
  });

  it("every generated SVG is embedded by the README (so the list stays curated)", () => {
    const referenced = new Set(readmeSvgReferences());
    expect(README_SVGS.filter((n) => !referenced.has(n))).toEqual([]);
  });

  it("every listed name is a real example source", () => {
    for (const name of README_SVGS) {
      expect(() => readFileSync(archPath(name), "utf8")).not.toThrow();
    }
  });
});
