/**
 * The body of the byte-identity law for the new-families batch (product-roadmap card RM8.9),
 * importable without vitest, so its baseline is measured against `main`'s `src/` by this very code
 * and not a lookalike (`test/helpers/byte-identity-digest.ts` says why that matters).
 *
 * The claim: sixteen fixture families appended to `FIXTURE_FAMILIES` and the catalogue move nothing
 * a plan that does not name one of their words already drew, described, linted or diagnosed, under
 * the default theme and `rendered`.
 *
 * Why a module of its own rather than the V8 one (`test/helpers/new-families-law.ts`) given a new
 * number: that module's rows are built from its constants (`FAMILIES_BEFORE = 83`, its
 * `NEAR_WORDS`), and its baseline was measured at `8233acc4` by that code as it stands; changing it
 * would change the instrument the V8 law was measured with. So that module is not edited. This one
 * reuses what in it does not depend on a family count — the digest (`familiesLawDigest`,
 * `perThemeDigests`: one digest body for both laws) and the example rows (`familiesLawRows`, of
 * which only the `examples/` rows are kept) — and builds its own two inline rows from parameters:
 * every family before the batch on one legend sheet, in the V8 row's layout, and the batch's near
 * words.
 */

import { type FamiliesLawRow, familiesLawRows } from "./new-families-law.js";

export { type FamiliesLawApi, familiesLawDigest, perThemeDigests } from "./new-families-law.js";

/** The canonical families that existed before the batch: the first 103 rows of the append-only table. */
export const FAMILIES_BEFORE_RM89 = 103;

/**
 * Words NEAR the batch that stay uncatalogued, each still the labelled rectangle: `gate` (kept for a
 * gate in a `fence` line, `src/elements/fence.ts`), `freezer` (an upright freezer looks like a
 * fridge), `screen` (a material's name), `divider` and `art` (the bare halves of `room_divider` and
 * `wall_art`). A dispatch that matched more than the batch's exact words would move this row.
 */
export const NEAR_WORDS_RM89: readonly string[] = ["gate", "freezer", "screen", "divider", "art"];

const plan = (body: string): string => `plan "F" {\n  units mm\n${body}\n}\n`;

/**
 * The plans the example corpus cannot supply, for a batch appended after the first `before`
 * families: every one of those on one sheet with its legend (twelve a row, `paper A1`, `scale 1:50`,
 * the V8 row's layout), so the legend's order and rows are under the law; and `nearWords`, each a
 * labelled rectangle. Rows are named `inline:families-before-<tag>-legend` and `inline:<tag>-near-words`.
 */
export function inlineRowsFor(
  canonicalFamilies: readonly string[],
  before: number,
  nearWords: readonly string[],
  tag: string,
): FamiliesLawRow[] {
  if (canonicalFamilies.length < before) {
    throw new Error(`families law: ${canonicalFamilies.length} families, the row was measured over ${before}`);
  }
  const fams = canonicalFamilies.slice(0, before);
  const cols = 12;
  const pieces = fams.map((f, i) => {
    const x = 300 + (i % cols) * 1400;
    const y = 300 + Math.floor(i / cols) * 1200;
    return `  furniture ${f} at (${x},${y}) size 1000x800 in r`;
  });
  const W = 300 + cols * 1400;
  const H = 300 + Math.ceil(fams.length / cols) * 1200;
  const near = nearWords.map(
    (word, i) => `  furniture ${word} at (${300 + i * 900},300) size 700x500 label "${word}" in r`,
  );
  return [
    {
      name: `inline:families-before-${tag}-legend`,
      src: plan(
        `  paper A1 landscape\n  scale 1:50\n  legend\n  room id=r at (0,0) size ${W}x${H} label "All"\n  wall exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }\n${pieces.join("\n")}`,
      ),
    },
    {
      name: `inline:${tag}-near-words`,
      src: plan(
        `  legend\n  room id=r at (0,0) size 7000x1200 label "Near"\n  wall exterior thickness 200 { (0,0) (7000,0) (7000,1200) (0,1200) close }\n${near.join("\n")}`,
      ),
    },
  ];
}

/** Every row of the RM8.9 law, in table order: the shipped top-level examples (the V8 law's own
 *  list of them), then {@link inlineRowsFor} over the first {@link FAMILIES_BEFORE_RM89} families. */
export function rm89LawRows(root: string, canonicalFamilies: readonly string[]): FamiliesLawRow[] {
  const examples = familiesLawRows(root, canonicalFamilies).filter((r) => r.name.startsWith("examples/"));
  return [...examples, ...inlineRowsFor(canonicalFamilies, FAMILIES_BEFORE_RM89, NEAR_WORDS_RM89, "rm89")];
}
