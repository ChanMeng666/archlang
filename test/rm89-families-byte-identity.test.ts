/**
 * The byte-identity law for the new-families batch (product-roadmap card RM8.9): **a plan that names
 * none of the sixteen new fixture families renders, describes, lints and diagnoses exactly as before
 * they existed** — under the default theme and under `rendered`, the one theme whose fills read the
 * family table.
 *
 * ## Why a law of its own
 *
 * The V8 law (`test/new-families-byte-identity.test.ts`) states the same claim for the twenty
 * families before these and was measured at `8233acc4`; its rows and baseline do not change, and
 * its premise now holds its twenty by name instead of by the table's length, which this batch's
 * append would have broken. It cannot be this batch's law: its inline legend row draws the first 83
 * families, so a family 84–103 that this batch moved would go unseen there, and its near words are
 * its own. So this law re-weighs the corpus over the 103 families that existed before the batch,
 * in a module of its own (`test/helpers/families-law-rm89.ts`, which says why the V8 module is not
 * edited), with one digest body shared by both laws.
 *
 * ## Where the hashes came from
 *
 * Measured on `main` at `70e5b207` (the tip before the batch), with `src/`, `examples/` and
 * `test/helpers/` extracted by `git archive` and this law's module copied in, by THIS law's body
 * handed that tree's `compile`/`describe`/`lint`, its `rendered` theme, its family table and its
 * `makeNodeWorld`, not a lookalike (see `test/helpers/byte-identity-digest.ts`). The branch measured
 * the same 40 rows, row for row. The sweep was proved able to fail first: a planted 0.97 → 0.971 on
 * the urinal bowl's depth (a family no example draws) in the extract moved exactly
 * `inline:families-before-rm89-legend`, and no other row. The example rows equal the V8 law's,
 * since neither the examples nor what they draw moved between the two measurements.
 *
 * ## What each row is for
 *
 * - `examples/*.arch` — the shipped corpus, the V8 law's own list of it; none of it names a new
 *   word (the first case below holds that premise over every plan, Markdown fence and code or data
 *   string the repository ships, skipping only the closed `SHOWCASE_PLANS` list, which is never a
 *   row; "ships" means tracked by git, or untracked and not ignored,
 *   `test/helpers/shipped-sources.ts`, so gitignored local output is never read).
 * - `inline:families-before-rm89-legend` — all 103 families that existed before the batch on one
 *   sheet with its legend, which lists fixture rows in `FIXTURE_FAMILIES` order: a family slotted
 *   in rather than appended would move it.
 * - `inline:rm89-near-words` — words near the batch that stay uncatalogued (`gate`, `freezer`,
 *   `screen`, `divider`, `art`), each still the labelled rectangle.
 *
 * ## What the law does not cover, said so
 *
 * A plan that names an UNCATALOGUED furniture word with no `label` gets a spelling hint
 * (`W_UNKNOWN_FURNITURE`, `src/elements/furniture.ts`); a new word near it could change that hint.
 * No such word in the shipped corpus is within the hint's distance of a new word (checked by script
 * in the PR). A `sheet text` key may be any furniture word (`src/sheet-text.ts`), so a plan keyed by
 * a new word reads differently; no shipped plan has one.
 *
 * ## When one of these moves
 *
 * A finding to explain before it is a digest to re-measure. A drawing change landing from elsewhere
 * moves the SVG half of a row on purpose; prove it by substitution, as `docs/testing.md` § 3
 * describes, and record the reason here.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 22 digests, of the
 * 22 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 *
 * Re-measured for SR.15 (a wrapped room name keeps the spaces its break removed, each run in a
 * `<tspan font-size="0" xml:space="preserve">` between its lines): the rows of plans that draw a
 * wrapped name moved, SVG only. Strip those separators from the branch's SVG and this body
 * reproduces every old digest (`test/byte-identity-baseline.ts`, § SR.15); `describe()`, `lint()`,
 * the diagnostics and the steps did not move.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import {
  CANONICAL_FIXTURES,
  canonicalFixture,
  FIXTURE_CATEGORIES,
  hasFixtureGlyph,
} from "../src/elements/fixtures-glyphs.js";
import { THEMES } from "../src/theme.js";
import type { World } from "../src/world.js";
import {
  FAMILIES_BEFORE_RM89,
  type FamiliesLawApi,
  familiesLawDigest,
  NEAR_WORDS_RM89,
  perThemeDigests,
  rm89LawRows,
} from "./helpers/families-law-rm89.js";
import { ROOT } from "./helpers/rectilinear-rooms-law.js";
import { SHOWCASE_PLANS } from "./helpers/showcase-plans.js";
import { shippedSources } from "./helpers/shipped-sources.js";

const API: FamiliesLawApi = { compile, describe, lint, rendered: THEMES.rendered! };
const ROWS = rm89LawRows(ROOT, CANONICAL_FIXTURES);
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** The batch's sixteen families, frozen by name: rows 104–119 of the append-only table. */
const BATCH: readonly string[] = [
  "wall_ac",
  "condenser",
  "chest_freezer",
  "wine_fridge",
  "display_cabinet",
  "folding_screen",
  "daybed",
  "pool",
  "garden_gate",
  "gazebo",
  "greenhouse",
  "wall_art",
  "climber",
  "bamboo",
  "potted_tree",
  "stepping_stones",
];

/** Every word of the batch: its sixteen families' words, aliases included, and no other. */
const NEW_WORDS: readonly string[] = FIXTURE_CATEGORIES.filter((w) => BATCH.includes(canonicalFixture(w)!));

/** Measured at `70e5b207` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["1defb1a97f6a98d2aad9f52a1a5dd7e4d40f5f7549f4cf70999b58b9aefd7212", "examples/accessible.arch"],
  ["716e2346ce1b0e0c5ad12dd655af1d4dc245e04a3af7fd85f072f7a6753894d4", "examples/aquarium.arch"],
  ["b65120c0078ef74191d75591963b87f64f2f0c6494282cb2eaecb845c75a9f25", "examples/attached.arch"],
  ["385eb04786c9b1340bc29e7ad5e0708792f0a7b57010d23b4e290fccb4ef62dc", "examples/bungalow.arch"], // CV13 (was 49d92a00): example source edited (chairs added)
  ["7bdbe984d504513537c0bf753f401f4b6addacd38068e9a65452e2bbdeff71d6", "examples/classroom-block.arch"],
  ["4cc89eced25fa8e7b789ba3bc39130f48af7bd483942a11ad23d9d99a94c968d", "examples/clinic.arch"],
  ["85fb5d784146dc24314305e34c9b707a6d867a4b1ced66bfe8ca1b2ff1e37336", "examples/corner-cafe.arch"],
  ["fbd2bd10d650feaaad65cc9aed910165f2b7b7a96cdc0b4dab8314b46a8710b5", "examples/courtyard-family.arch"],
  ["042a55e657417f8fa9112ebdd4fd4064b5a84c43071fd9b0a83c257b29732c06", "examples/courtyard-house.arch"], // CV13 (was 54e3c3c5): example source edited (chairs added)
  ["4cc9df18d329f19f7291bb1942317741494f08df82d7357623effb66f4012cf9", "examples/furnished-flat.arch"],
  ["258681d9f66e5578ff99e17f77d3b301da6d2dbd3fca5ac4a80a0e1e33615ae1", "examples/gallery-l.arch"],
  ["5d5e7b26c2145ec4ee7b7b93d007adbfd9e811c8d91063b1e3380caa68d6378e", "examples/garden-house.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was f751c9de)
  ["55957d574fce885ecf823c0d2757f1830072a58d9e1d478060ef22e89e13f066", "examples/garden-loft.arch"], // CV13 (was 4b4d7b00): example source edited (chairs added)
  ["1fba23d430a77dc9fec8e9f6311d12fda479a00b66a9bb90470a7ef3f2c1b372", "examples/hexagon-pavilion.arch"], // CV13 (was 8bd6a37e): example source edited (chairs added)
  ["24c97182c839595840a47a275a34866868eed9a1562854a66de04c8d45b74110", "examples/hillside-villa.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was a7f940b3)
  ["b3ed32c98852d61c69c521cf756843e3d950dbff3bf5bbe45dabe997336ceb86", "examples/imports.arch"],
  ["d9a87f3402f1a99d4113e036a6a72de30a84826e8317a840cd353b0013c3bd5b", "examples/knob-flat.arch"],
  ["1381be2ef7d0068103c27ef948c77082d7fb591111b36c84d309a2e747717f33", "examples/laneway-house.arch"], // CV13 (was b9093b92): example source edited (chairs added)
  ["b8a131dda6d89b132671ff85261c104ea66686c837085d0ddcf7fcb97afdd2d3", "examples/library.arch"],
  ["f7dd7ef9a52f8da5a49f25f36428bbc33d754b113c1b4964e3508b5b8c65d43f", "examples/materials.arch"],
  ["b82630a3e096c4328d93982f581c817698e4ac5c9cb965b56562b320f54b80b5", "examples/museum-wing.arch"],
  ["25ce0b468db11db582491d07df83390a831cd5522fce2167650b009ba822f5eb", "examples/museum-wings.arch"],
  ["ed71bbdda5b24b9a8f7871521dc0145742ef06ed8604e232064b02183e129ec7", "examples/museum.arch"],
  ["45f4b26abfa7c62fa3b0c6c94fcbe2af3e4b11db62bba0b16f0e0567969a3bb4", "examples/one-room.arch"],
  ["4064206eb1e0357dd6f2bf27ee3ab812f1be6dc9d6e7228c2b0f4170566e90ff", "examples/parametric.arch"],
  ["de77b7b02ef8ec2080c4b1d5b1c32e8d6f2af645f347d634c0540df8c2e62edd", "examples/practice-office.arch"],
  ["438ead3b52356d8750a56b91d7057fdc6f7556a0ea89ff0acad3a270111f9b9d", "examples/relational.arch"],
  ["bbbdef1aac00c70dba925fb7500f1ed9870f5c1f3f908d070ecd1032fb73950e", "examples/remodel.arch"], // SR.15 (was 131d7956); CV13 (was e034f7f8): example source edited (chairs added)
  ["157e38a1404dbc2adddd0832783a7424abaea04e111f44c467ec1fa9b7b70f12", "examples/sheet-notes.arch"],
  ["1d9c8a9a57e9b4104d8aceb7a1ea5f23cea6963680037270195115d99e70d7cd", "examples/studio.arch"],
  ["c43011c1e3e15d3eb1e821186fade0fcd25ad697dc1da9c0ed52ed43d2ad5eb0", "examples/terrace-row.arch"], // CV08 (was 7784e0a7): example source edited (sofa turned to face the room)
  ["78d8e4b1ef3ca7afd21a9ec05a638b1d426299d7fb57e7bf09f1b4bcd17e58d8", "examples/themed.arch"],
  ["1183ede6f8a3a1ebf83e9b2c3614d88155e37613c4d5fc3f6acd3f80defa7f6c", "examples/tiny-house.arch"],
  ["d53b3a4b7f51560747296d2c37dce0919d71dc15b0126bd8af7b0026cd7f7391", "examples/townhouse.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3b76fb02): example source edited (chairs added); CV08 (was 067489db): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was d33a7ae4)
  ["7d9680366da7f54a92ac8d224fe3fa46dc36385030e87365d0e9158494c52961", "examples/transit-hall.arch"],
  ["6e3014ee1b48c4ca689b53a546c42784415d36f80775bb5cc4ed18dcfa495735", "examples/turning-stair.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 9914c01d)
  ["5befb53fade12044aa9301705c74141fe204c4f7f6ec48344492abf599faf22c", "examples/two-bed.arch"], // CV13 (was 1e2e65d0): example source edited (chairs added)
  ["c309fa15bad9c1908b53b4ebefec8ab3e8e80320f5f23a5e3293b68d81efa65a", "examples/two-storey.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["a1ade8ea8d6d67cb0e38ae7a5a508e0b4810c7465f08f50b0cc32f8b429d1c1c", "inline:families-before-rm89-legend"],
  ["8843ef1c96b76a79c848c30735d919f9240e24d06b04ee12547c33c247b7024e", "inline:rm89-near-words"],
];

suite("new-families batch (RM8.9) — byte-identity law", () => {
  it("names exactly the sixteen families appended after the first 103, aliases included", () => {
    expect(CANONICAL_FIXTURES.slice(FAMILIES_BEFORE_RM89, FAMILIES_BEFORE_RM89 + BATCH.length)).toEqual(BATCH);
    expect(BATCH).toHaveLength(16);
    expect(NEW_WORDS[0]).toBe("wall_ac");
    expect(NEW_WORDS.at(-1)).toBe("stepping_stones");
    expect(NEW_WORDS).toHaveLength(39);
    for (const w of NEW_WORDS) expect(hasFixtureGlyph(w), w).toBe(true);
    for (const w of NEAR_WORDS_RM89) {
      expect(FIXTURE_CATEGORIES, w).not.toContain(w);
      expect(hasFixtureGlyph(w), w).toBe(false);
    }
  });

  it("no shipped plan names a new word, so the law's corpus is a corpus that did not change", () => {
    // `furniture <word>` and `furniture id=<x> <word>` (the only two places a category stands),
    // in every plan file, Markdown fence and code or data string the repository ships plans in:
    // shipped means tracked by git, or untracked and not ignored (`test/helpers/shipped-sources.ts`),
    // so gitignored local output (a paid eval run's `eval/results.*`) is not scanned.
    const words = new RegExp(`\\bfurniture\\s+(?:id=(?:"[^"]*"|\\S+)\\s+)?(${NEW_WORDS.join("|")})\\b`);
    expect(words.test("furniture id=ac1 wall_ac at (0,0)"), "the guard sees the id= form").toBe(true);
    expect(words.test("furniture pool at (0,0)"), "the guard sees the bare form").toBe(true);
    expect(words.test("furniture pool_table at (0,0)"), "a longer word is not a new one").toBe(false);
    // The showcase plans (RM8.5) are skipped, as the V8 law skips them, and are never one of this
    // law's rows, which are the top-level examples.
    for (const p of SHOWCASE_PLANS) {
      expect(
        ROWS.map((r) => r.name),
        "a showcase plan is never a row of the law",
      ).not.toContain(p);
    }
    const users: string[] = [];
    const dirs = [
      "examples",
      "docs",
      "test/fixtures",
      "test/recovery-corpus",
      "eval",
      "dataset",
      "skills",
      "playground/src",
      "docs-site",
      "packages",
      "editors/vscode/src",
    ];
    for (const dir of dirs) {
      for (const rel of shippedSources(ROOT, dir)) {
        // The plans under `docs/plans/` describe work; they are not compiled. A package's tests
        // build their own scenes and are not shipped plans.
        if (rel.startsWith("docs/plans/") || /^packages\/[^/]+\/test\//.test(rel)) continue;
        if (SHOWCASE_PLANS.includes(rel)) continue;
        if (words.test(readFileSync(join(ROOT, rel), "utf8"))) users.push(rel);
      }
    }
    for (const f of ["README.md", "spec.llm.md", "llms-full.txt"]) {
      if (words.test(readFileSync(join(ROOT, f), "utf8"))) users.push(f);
    }
    expect(users).toEqual([]);
  });

  it("the table pins every row the law reads, in order", () => {
    expect(BASELINE.map(([, name]) => name)).toEqual(ROWS.map((r) => r.name));
  });

  // One case per row, so a red run names the plan; the message names the per-theme digests.
  for (const [want, name] of BASELINE) {
    it(`${name} is byte-identical under the default theme and \`rendered\``, () => {
      const row = ROWS.find((r) => r.name === name)!;
      const world = worldOf(row.dir);
      const got = familiesLawDigest(API, row.src, world);
      expect(got, `per theme [default, rendered]: ${perThemeDigests(API, row.src, world).join(" ")}`).toBe(want);
    });
  }
});
