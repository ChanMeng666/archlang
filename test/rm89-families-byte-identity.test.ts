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
 *   row).
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
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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
  ["875c65bb70dd8f85c3f2a6347c21e3d8a6cce8d6b9b9a9ce1eb1c1bac9d9722a", "examples/aquarium.arch"],
  ["b65120c0078ef74191d75591963b87f64f2f0c6494282cb2eaecb845c75a9f25", "examples/attached.arch"],
  ["e43ca3ddecaafcd826272abe80bb27b22a88a52cb28267c408bee2dc823e1845", "examples/bungalow.arch"],
  ["e0f56d5e7226168c38b1c7ee28d4b6fe43b5550d2d6dcbf9478317ef92134db2", "examples/classroom-block.arch"],
  ["4cb08a0d3671499549a71d5404e7edf421ed8bf633d159c815d22859deed87a9", "examples/clinic.arch"],
  ["7e7cd0c04d41dc603dd9100f49c45e72c5c6739a0df335638e1ceda79d794c50", "examples/corner-cafe.arch"],
  ["fbd2bd10d650feaaad65cc9aed910165f2b7b7a96cdc0b4dab8314b46a8710b5", "examples/courtyard-family.arch"],
  ["b763e113515203306d321fb2021b87dcf75432fdc98c3712808288227a6db91b", "examples/courtyard-house.arch"],
  ["4cc9df18d329f19f7291bb1942317741494f08df82d7357623effb66f4012cf9", "examples/furnished-flat.arch"],
  ["94ed5dea82a84d559a97e2b179f81509ce710cccb82ea1c2a54d87e6cac4669b", "examples/gallery-l.arch"],
  ["ae33abb73acdf48838d21fcc6bd92e072287a3cc1fa608bf52e4e018fb9bc078", "examples/garden-house.arch"],
  ["2621494eb04015b448fa01ed95fb9aa4ad2b03170a5822f616e61b4b4fe7dd2e", "examples/garden-loft.arch"],
  ["8bd6a37eaeb951c8fa11e547eee4ae9727f32c3189c5a79f168e461f01012f08", "examples/hexagon-pavilion.arch"],
  ["845adcd1009d5987a08d77f187c5f17885b9c40ea9402dd2014ab1d454d8af33", "examples/hillside-villa.arch"],
  ["b3ed32c98852d61c69c521cf756843e3d950dbff3bf5bbe45dabe997336ceb86", "examples/imports.arch"],
  ["b70f7455f644b327a4b36f56d283a7eb2397d5ed84523363c2f0df92cf0f2f96", "examples/knob-flat.arch"],
  ["913ed13bd8dd60b02816e127ef1a347bdcae49c7e944cee0925db120015d6ece", "examples/laneway-house.arch"],
  ["fbc95cdcb6f4c4baf8f8afeae25f4d3b96a49812af107e13ef64713868f8bc46", "examples/library.arch"],
  ["f6e8fc4606bd7782cb703ea8d7ecc0e900be392607be0d5181f9f187db5377fa", "examples/materials.arch"],
  ["835149afac322674a3bfd9f221e1d8464ca94215cb8aba9dcac4ca359bf8a3a4", "examples/museum-wing.arch"],
  ["2f84be39e29096299da8cc82ab468ac95091c4f42814a016780dc0d9dc9c5a29", "examples/museum-wings.arch"],
  ["c8ed1b848cd448df36aa38be1613bd0d2d4e36fefc7440436700d7fcc6de64d4", "examples/museum.arch"],
  ["45f4b26abfa7c62fa3b0c6c94fcbe2af3e4b11db62bba0b16f0e0567969a3bb4", "examples/one-room.arch"],
  ["edadca7560cb6c0aa60e9ad9ca8b1aef14ce798e697993ea3d931a42ef82f906", "examples/parametric.arch"],
  ["e87aecb6cc5312ddd304a1f3a1d877ced1cec8824801bce8aac932ee50cd5b04", "examples/practice-office.arch"],
  ["438ead3b52356d8750a56b91d7057fdc6f7556a0ea89ff0acad3a270111f9b9d", "examples/relational.arch"],
  ["e034f7f8f3920b2ff501edb0aaa4e3a21c28770dea67c43d4cdb61345f6e1793", "examples/remodel.arch"],
  ["cb2821cbd51740692331b476d9efb05ca5c5c35056b3b4724edc4def271192c9", "examples/sheet-notes.arch"],
  ["1d9c8a9a57e9b4104d8aceb7a1ea5f23cea6963680037270195115d99e70d7cd", "examples/studio.arch"],
  ["7784e0a77b26d646d188f9f8c3bdef276a7de207da696a02345d499f9c36321f", "examples/terrace-row.arch"],
  ["78d8e4b1ef3ca7afd21a9ec05a638b1d426299d7fb57e7bf09f1b4bcd17e58d8", "examples/themed.arch"],
  ["1183ede6f8a3a1ebf83e9b2c3614d88155e37613c4d5fc3f6acd3f80defa7f6c", "examples/tiny-house.arch"],
  ["5bbc2cc26f425dc7d5d7c37c425b837b476b8fb0f68c7626ebcb49c17304f0b8", "examples/townhouse.arch"],
  ["d4389ceea35c71a0a73b9e3a7e47c770531d15c038ac69ac0bda89bc8099ced0", "examples/transit-hall.arch"],
  ["97b2cbeb7be94176916a59e6bc99f12d5573e424e953b29d17b155b8a52f23d4", "examples/turning-stair.arch"],
  ["1e2e65d06cd1b4c7a2c89b94365dcc51980b85044242fb45dd7da177aa2fe93f", "examples/two-bed.arch"],
  ["2e311efeb95e9a6a200474ac116b1d2ae704f419dd5fb40fd08008c0b0bc6e00", "examples/two-storey.arch"],
  ["a1ade8ea8d6d67cb0e38ae7a5a508e0b4810c7465f08f50b0cc32f8b429d1c1c", "inline:families-before-rm89-legend"],
  ["8843ef1c96b76a79c848c30735d919f9240e24d06b04ee12547c33c247b7024e", "inline:rm89-near-words"],
];

/** The source kinds a plan can ship in: a plan file, a Markdown fence, or a string in code or data. */
const SOURCE_EXT = /\.(arch|md|ts|tsx|js|mjs|json|vue)$/;

/** Every source file under `dir` (recursively), skipping dependencies, builds and generated sites. */
function shippedSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "public" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...shippedSources(p));
    else if (SOURCE_EXT.test(name)) out.push(p);
  }
  return out;
}

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
    // in every plan file, Markdown fence and code or data string the repository ships plans in.
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
      for (const f of shippedSources(join(ROOT, dir))) {
        const rel = relative(ROOT, f).replace(/\\/g, "/");
        // The plans under `docs/plans/` describe work; they are not compiled. A package's tests
        // build their own scenes and are not shipped plans.
        if (rel.startsWith("docs/plans/") || /^packages\/[^/]+\/test\//.test(rel)) continue;
        if (SHOWCASE_PLANS.includes(rel)) continue;
        if (words.test(readFileSync(f, "utf8"))) users.push(rel);
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
