/**
 * The docs gallery's PER-STOREY file names must be the CLI's file names.
 *
 * `docs-site/sync-docs.mjs` writes one SVG per storey for every multi-storey example, so
 * the landing page can show a building's floors as three drawings rather than one. The
 * name it writes them under has to be the same one `arch compile townhouse.arch` writes
 * on disk — `levelTarget()` in `src/cli/io.ts` — because the whole point of showing them
 * is "this is what the CLI gives you". Two names for one artifact is a documentation bug
 * that no build step can see: both sides would still produce files, and both would still
 * be served.
 *
 * sync-docs is a plain `.mjs` build script and cannot import the TypeScript CLI
 * (`dist/cli.js` runs `main()` the moment it is imported), so it restates the law in one
 * arrow function. This gate makes the restatement PROVED rather than hoped: it extracts
 * that arrow out of sync-docs' source, evaluates it, and compares it with `levelTarget()`
 * over a spread of levels including the awkward ones (0 and a basement).
 *
 * The end-to-end half lives in `docs-site/e2e/routes.spec.ts`, which derives the routes it
 * fetches from `levelTarget()` itself and would 404 if the writer and the reader drifted.
 * This one is the fast, build-free half.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { levelTarget } from "../src/cli/io.js";

const SYNC = "docs-site/sync-docs.mjs";
const syncSrc = readFileSync(SYNC, "utf8");

/** Pull sync-docs' `levelSvgName` arrow out of its source and evaluate it as plain JS. */
function extractLevelSvgName(): (name: string, level: number) => string {
  const m = /^const levelSvgName = (\(name, level\) => .+);$/m.exec(syncSrc);
  expect(
    m,
    `${SYNC} no longer declares \`const levelSvgName = (name, level) => …;\` on one line. That ` +
      `arrow is the docs site's copy of the CLI's per-storey naming law, and this gate is the only ` +
      `thing holding the copy to the original — restore the shape, or update this extractor in the ` +
      `same commit.`,
  ).toBeTruthy();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(`return ${m![1]!};`)() as (name: string, level: number) => string;
}

describe("the docs gallery's per-storey SVG names are the CLI's", () => {
  const levelSvgName = extractLevelSvgName();

  it("is not vacuous — the extracted function actually produces a name", () => {
    expect(levelSvgName("townhouse", 1)).toBe("townhouse.L1.svg");
  });

  it("agrees with levelTarget() for every level a plan may declare", () => {
    // `level` integers are unique and ascending but 0 and negative are legal (a basement),
    // so the awkward ones are in here on purpose.
    for (const name of ["townhouse", "two-storey", "hillside-villa", "a.b.c"]) {
      for (const level of [1, 2, 3, 10, 0, -1, -2]) {
        expect(
          levelSvgName(name, level),
          `sync-docs would write ${levelSvgName(name, level)} for ${name} level ${level}, but ` +
            `\`arch compile ${name}.arch\` writes ${levelTarget(`${name}.svg`, level)}. The docs site ` +
            `would be showing a file the CLI does not produce.`,
        ).toBe(levelTarget(`${name}.svg`, level));
      }
    }
  });

  it("sync-docs actually writes the level pages (the law is used, not just declared)", () => {
    expect(
      syncSrc,
      `${SYNC} declares levelSvgName but no longer writes a file with it — the A-102 card's ` +
        `three storey drawings would 404.`,
    ).toMatch(/writeFileSync\(join\(exDest, levelSvgName\(name, p\.level\)\), p\.svg\)/);
  });
});
