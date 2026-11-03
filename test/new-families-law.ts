/**
 * The body of the byte-identity law for the visual-assets families (card V8), importable without
 * vitest, so the baseline is measured against `main`'s `src/` by this very code and not a
 * lookalike (`test/byte-identity-digest.ts` says why that matters).
 *
 * The claim: twenty fixture families appended to `FIXTURE_FAMILIES` and the catalogue move nothing
 * a plan that does not name one of their words already drew, described, linted or diagnosed. So
 * every row is compiled under the default theme and under `rendered` (the one theme whose fills
 * read the family table, which the rendered-theme law does not sweep), and the repository's
 * whole-surface payload is hashed for each ({@link allStoreysDiagnosticsPayload}: every page's SVG,
 * `describe()`, `lint()`, `compile().diagnostics`). A row's digest is SHA-256 over its two
 * per-theme digests joined by a comma.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allStoreysDiagnosticsPayload, type CompilerApi, type DigestOptions } from "./byte-identity-payload.js";
import type { Theme } from "../src/theme.js";
import type { World } from "../src/world.js";

/** The compiler surface the law reads, plus the `rendered` base, handed in so `main` can be measured. */
export interface FamiliesLawApi extends CompilerApi {
  rendered: Partial<Theme>;
}

/** A plan the law pins: `dir` is what an `import` of it is read against. */
export interface FamiliesLawRow {
  name: string;
  src: string;
  dir?: string;
}

/** The canonical families that existed before the tranche: the first 83 rows of the table, which
 *  is append-only (its order is the legend's), so the row is built from the table, never retyped. */
export const FAMILIES_BEFORE = 83;

/**
 * Words NEAR the new vocabulary that stay uncatalogued, each still the labelled rectangle: `rack`
 * (deliberately not an alias of `server_rack`), `lamp` and `table_lamp` (the floor lamp's word is
 * `floor_lamp`), `stand`, `trunk`, `planter_box`, `stone`. A dispatch that matched more than the
 * twenty families' exact words would move this row.
 */
export const NEAR_WORDS: readonly string[] = ["rack", "lamp", "table_lamp", "stand", "trunk", "planter_box", "stone"];

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** One digest per theme: the default (no theme option), then `rendered`. */
export function perThemeDigests(api: FamiliesLawApi, src: string, world: World | undefined): string[] {
  const w = world ? { world } : {};
  // `DigestOptions` is the world alone; the theme rides the same options object to `compile()`,
  // `describe()` and `lint()`, which is exactly what a caller passing a theme does.
  return [
    sha256(allStoreysDiagnosticsPayload(api, src, w)),
    sha256(allStoreysDiagnosticsPayload(api, src, { ...w, theme: api.rendered } as unknown as DigestOptions)),
  ];
}

/** The row's digest: SHA-256 over its per-theme digests joined by a comma. */
export function familiesLawDigest(api: FamiliesLawApi, src: string, world: World | undefined): string {
  return sha256(perThemeDigests(api, src, world).join(","));
}

const plan = (body: string): string => `plan "F" {\n  units mm\n${body}\n}\n`;

/** The plans the example corpus cannot supply: every earlier family on one sheet with its legend
 *  (so the legend's order and rows are under the law), and the near words. */
export function inlineRows(canonicalFamilies: readonly string[]): FamiliesLawRow[] {
  if (canonicalFamilies.length < FAMILIES_BEFORE) {
    throw new Error(`families law: ${canonicalFamilies.length} families, the row was measured over ${FAMILIES_BEFORE}`);
  }
  const fams = canonicalFamilies.slice(0, FAMILIES_BEFORE);
  const cols = 12;
  const pieces = fams.map((f, i) => {
    const x = 300 + (i % cols) * 1400;
    const y = 300 + Math.floor(i / cols) * 1200;
    return `  furniture ${f} at (${x},${y}) size 1000x800 in r`;
  });
  const W = 300 + cols * 1400;
  const H = 300 + Math.ceil(fams.length / cols) * 1200;
  const near = NEAR_WORDS.map(
    (word, i) => `  furniture ${word} at (${300 + i * 900},300) size 700x500 label "${word}" in r`,
  );
  return [
    {
      name: "inline:families-before-legend",
      src: plan(
        `  paper A1 landscape\n  scale 1:50\n  legend\n  room id=r at (0,0) size ${W}x${H} label "All"\n  wall exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }\n${pieces.join("\n")}`,
      ),
    },
    {
      name: "inline:near-words",
      src: plan(
        `  legend\n  room id=r at (0,0) size 7000x1200 label "Near"\n  wall exterior thickness 200 { (0,0) (7000,0) (7000,1200) (0,1200) close }\n${near.join("\n")}`,
      ),
    },
  ];
}

/** Every row of the law, in table order: the shipped examples, then {@link inlineRows}. */
export function familiesLawRows(root: string, canonicalFamilies: readonly string[]): FamiliesLawRow[] {
  const dir = "examples";
  const examples = readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ name: `${dir}/${f}`, src: readFileSync(join(root, dir, f), "utf8"), dir: join(root, dir) }));
  return [...examples, ...inlineRows(canonicalFamilies)];
}
