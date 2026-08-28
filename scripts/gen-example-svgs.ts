/**
 * Generate the committed `examples/*.svg` drawings the README embeds as `<img>` targets.
 *
 * WHY THIS EXISTS. Three example SVGs (`studio`, `two-bed`, `attached`) had been
 * committed by hand and then left alone. Nothing regenerated them and nothing compared
 * them to the compiler, so they quietly ROTTED for months: the README's hero image and
 * gallery were showing drawings several releases of rendering work out of date, and the
 * only way to notice was to look at the picture. Every other artifact in this repo that
 * is derived from `src/` has a generator and a drift gate; these did not, purely because
 * they are binary-ish blobs nobody thought of as generated. They are. This script is the
 * generator, `test/example-svgs-drift.test.ts` is the gate, and `check:drift` runs it
 * with the rest.
 *
 * WHY THE LIST IS CURATED. {@link README_SVGS} is not "every example" — committing an SVG
 * per `.arch` would add ~27 large blobs to every diff for no reader. It is exactly the set
 * the README links as an `<img src="./examples/<name>.svg">`, so the gate reads both ways:
 * a name here with no `<img>` is dead weight, and an `<img>` with no name here is
 * ungenerated (and would rot again). The drift test asserts both directions, so adding a
 * drawing to the README means adding it here — there is no path back to a hand-committed
 * SVG.
 *
 * {@link renderExampleSvg} is pure with respect to the repo (it takes the source text, not
 * a path) so the drift test can render in-memory and byte-compare. Like every other
 * generator here it imports `../src/index.js` — NOT `dist/` — because CI's `check:drift`
 * job runs before any build.
 *
 * Run `npm run gen:example-svgs` (or `npm run gen:all`) after any change to the rendering
 * pipeline or to one of the listed examples; CI asserts no drift.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../src/index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * The examples whose rendered SVG is committed, because the README embeds it.
 *
 * Curated on purpose — see the header. Keep it in step with the README's `<img>` tags;
 * `test/example-svgs-drift.test.ts` fails in BOTH directions if they diverge.
 */
export const README_SVGS = [
  "laneway-house",
  "hillside-villa",
  "garden-house",
  "studio",
  "two-bed",
  "attached",
  "courtyard-house",
  "library",
  "transit-hall",
  "hexagon-pavilion",
  "terrace-row",
  "townhouse",
  "two-storey",
  "tiny-house",
  "aquarium",
  "bungalow",
  "gallery-l",
  "museum",
  "materials",
  "furnished-flat",
] as const;

export type ReadmeSvgName = (typeof README_SVGS)[number];

/** Repo-relative path of the generated SVG for an example name. */
export function svgPath(name: string): string {
  return `examples/${name}.svg`;
}

/** Repo-relative path of the `.arch` source for an example name. */
export function archPath(name: string): string {
  return `examples/${name}.arch`;
}

/**
 * Render one example's source to the SVG bytes committed at {@link svgPath}.
 *
 * No World is passed — every listed example is import-free by construction, so this
 * cannot reach the filesystem. For a multi-storey plan `compile()` already returns the
 * GROUND floor in `.svg` (the storeys are in `pages[]`), which is the page the README
 * shows; a caller wanting another storey should read `pages[]` itself.
 *
 * @throws if the plan raises any error diagnostic — a broken example must never be
 * silently committed as a red error card.
 */
export function renderExampleSvg(name: string, source: string): string {
  const result = compile(source, { noCache: true });
  if (result.errors.length > 0) {
    // `errors` is the message/line/col projection; the catalogued `E_*` code lives on the
    // parallel `diagnostics` entries, so report from those and fall back to `errors`.
    const detail = result.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `${d.code}: ${d.message}`)
      .join("; ");
    throw new Error(
      `examples/${name}.arch does not compile cleanly: ${detail || result.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return result.svg;
}

/** Read an example's source from disk, normalised to LF so Windows checkouts agree. */
export function readExampleSource(name: string): string {
  return readFileSync(resolve(ROOT, archPath(name)), "utf8").replace(/\r\n/g, "\n");
}

/** Write every curated SVG (CLI entry). */
function main(): void {
  for (const name of README_SVGS) {
    writeFileSync(resolve(ROOT, svgPath(name)), renderExampleSvg(name, readExampleSource(name)));
  }
  process.stdout.write(`✓ generated ${README_SVGS.length} example SVGs in examples/ from their .arch sources\n`);
}

// Run only when invoked directly (not when imported by the drift test / check-drift).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
