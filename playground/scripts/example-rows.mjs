/**
 * `EXAMPLE_ROWS` (playground/src/examples.ts), read from plain Node: the one parser of the table
 * that decides which plans have a static page at `https://playground.archlang.uk/examples/<name>.html`.
 *
 * That file is a TypeScript module full of Vite `?raw` import specifiers, so it cannot be
 * imported from Node, but its table is declared literal and uniformly shaped for exactly this
 * reason. Three builds read it through this module: `gen-static.mjs` (the pages, the sitemap and
 * the plan gallery), `docs-site/sync-docs.mjs` (the docs host's links to those pages) and the
 * playground's e2e. `test/playground-examples-rows.test.ts` parses it with its own copy of the
 * pattern and fails if the two copies differ, so a parser that drifted cannot pass over a table
 * the build reads differently.
 *
 * The optional trailing comma in the pattern is not cosmetic: Biome's 120-column formatter breaks
 * these rows across four lines and adds one, so a pattern that demanded `"]` would match zero
 * rows the moment anyone ran `npm run lint:fix`.
 *
 * Plain JavaScript with no dependency, so a Node build script and the vitest suite import the
 * same function.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @typedef {{ name: string, label: string, group: string, blurb: string }} ExampleRow */

/** The table's file, relative to the repo root. */
export const EXAMPLES_TS = "playground/src/examples.ts";

/** Where the static example pages are served. */
export const PLAYGROUND_ORIGIN = "https://playground.archlang.uk";

/**
 * The rows out of the text of `examples.ts`, in table order. Throws when the table lost its
 * shape: every caller is a build that must stop rather than publish without it.
 *
 * @param {string} src
 * @returns {ExampleRow[]}
 */
export function parseExampleRows(src) {
  const block = /const EXAMPLE_ROWS = \[([\s\S]*?)\n\] as const;/.exec(src);
  if (!block) {
    throw new Error(
      `${EXAMPLES_TS} no longer declares \`const EXAMPLE_ROWS = [ … ] as const;\` as a ` +
        "literal table. That table is the single source of the menu, the static example pages and the sitemap; " +
        "restore the shape, or update this parser and test/playground-examples-rows.test.ts together.",
    );
  }
  const rows = [...block[1].matchAll(/\[\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g)].map(
    (m) => ({ name: m[1], label: m[2], group: m[3], blurb: m[4] }),
  );
  if (rows.length === 0) throw new Error(`${EXAMPLES_TS}: EXAMPLE_ROWS parsed to zero rows.`);
  return rows;
}

/**
 * The rows of the checkout at `repo` (its root directory).
 *
 * @param {string} repo
 * @returns {ExampleRow[]}
 */
export function readExampleRows(repo) {
  return parseExampleRows(readFileSync(join(repo, EXAMPLES_TS), "utf8"));
}

/**
 * The static page of the example `name`: `html_handling: "none"` makes the `.html` part of the URL.
 *
 * @param {string} name
 * @returns {string}
 */
export const examplePageUrl = (name) => `${PLAYGROUND_ORIGIN}/examples/${name}.html`;

/**
 * `name → its static page's URL` for every row, in table order: what the docs host links. A plan
 * with no row has no entry, so a card can link a static page only when one is published.
 *
 * @param {ExampleRow[]} rows
 * @returns {Record<string, string>}
 */
export function examplePageLinks(rows) {
  return Object.fromEntries(rows.map((r) => [r.name, examplePageUrl(r.name)]));
}

/**
 * Where the row `name` sits: the rows before and after it in table order (null at either end),
 * and the other rows of its group, in table order.
 *
 * @param {ExampleRow[]} rows
 * @param {string} name
 * @returns {{ prev: ExampleRow | null, next: ExampleRow | null, siblings: ExampleRow[] }}
 */
export function rowNeighbours(rows, name) {
  const i = rows.findIndex((r) => r.name === name);
  if (i < 0) throw new Error(`${EXAMPLES_TS}: no row named ${JSON.stringify(name)}.`);
  const row = rows[i];
  return {
    prev: i > 0 ? rows[i - 1] : null,
    next: i < rows.length - 1 ? rows[i + 1] : null,
    siblings: rows.filter((r) => r.group === row.group && r.name !== name),
  };
}
