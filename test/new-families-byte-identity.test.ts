/**
 * The byte-identity law for the visual-assets families (card V8): **a plan that names none of the
 * twenty new fixture families renders, describes, lints and diagnoses exactly as before they
 * existed** — under the default theme and under `rendered`, the one theme whose fills read the
 * family table.
 *
 * ## Where the hashes came from
 *
 * Measured on `main` at `8233acc4` (the tip before the tranche), with `src/` and `examples/`
 * extracted by `git archive`, by THIS law's body (`test/helpers/new-families-law.ts`) handed that tree's
 * `compile`/`describe`/`lint`, its `rendered` theme, its family table and its `makeNodeWorld` —
 * not a lookalike (see `test/helpers/byte-identity-digest.ts`). The branch measured the same table, row
 * for row. The sweep was proved able to fail first: a planted 0.05 → 0.051 corner radius on the
 * treadmill (a family no example draws) moved exactly `inline:families-before-legend`, and no
 * other row.
 *
 * ## What each row is for
 *
 * - `examples/*.arch` — the shipped corpus; none of it names a new word (the first case below holds
 *   that premise, over every `.arch` and Markdown file the repository ships, so the law cannot pass
 *   because a plan stopped being in its corpus; "ships" means tracked by git, or untracked and not
 *   ignored, `test/helpers/shipped-sources.ts`, so gitignored local output is never read). The one
 *   exception is the closed list `SHOWCASE_PLANS` (`test/helpers/showcase-plans.ts`, card RM8.5):
 *   plans under `examples/showcase/` that show the new families on purpose. They are never rows
 *   (the rows are the top-level examples), so the law's statement, rows and baseline are unchanged;
 *   only the premise's coverage narrows, by exactly that list.
 * - `inline:families-before-legend` — every family that existed before the tranche on one sheet,
 *   with its legend: the legend lists fixture rows in `FIXTURE_FAMILIES` order, so a family slotted
 *   in rather than appended would move this row.
 * - `inline:near-words` — words NEAR the new vocabulary that stay uncatalogued (`rack`, `lamp`,
 *   `trunk`, …), each still the labelled rectangle: a dispatch that caught more than the twenty
 *   families' exact words would move it.
 *
 * ## When one of these moves
 *
 * A finding to explain before it is a digest to re-measure. A drawing change landing from
 * elsewhere moves the SVG half of a row on purpose; prove it by substitution, as
 * `docs/testing.md` § 3 describes, and record the reason here.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 22 digests, of the
 * 22 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 *
 * `inline:near-words` re-taken for AL4 (an uncatalogued word's label is drawn only where it fits its
 * piece), for an edit to the ROW, not a digest bless: its pieces were 700 mm wide, and at the row's
 * 122.4 mm lettering `table_lamp` (759 mm by the shared estimate) and `planter_box` (835 mm) no longer
 * fit, so the branch left both labels out and the row stopped showing every near word as a labelled
 * rectangle. The pieces are now 850 mm wide, the layout otherwise unchanged. `main`'s compiler
 * (`48334285`) gives the old pin on the old row exactly and `6f9b9f86…` on the edited row, and the
 * branch gives that same digest on the edited row: every label fits, so it draws `main`'s bytes.
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
import { ROOT } from "./helpers/rectilinear-rooms-law.js";
import {
  FAMILIES_BEFORE,
  type FamiliesLawApi,
  familiesLawDigest,
  familiesLawRows,
  NEAR_WORDS,
  perThemeDigests,
} from "./helpers/new-families-law.js";
import { SHOWCASE_PLANS } from "./helpers/showcase-plans.js";
import { shippedSources } from "./helpers/shipped-sources.js";

const API: FamiliesLawApi = { compile, describe, lint, rendered: THEMES.rendered! };
const ROWS = familiesLawRows(ROOT, CANONICAL_FIXTURES);
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/**
 * The tranche's twenty families, frozen by name. The table is append-only (its order is the
 * legend's), so they are rows 84–103 for good; a later batch appended after them (RM8.9) is not
 * this law's, and carries its own (`test/rm89-families-byte-identity.test.ts`).
 */
const TRANCHE: readonly string[] = [
  "floor_lamp",
  "side_table",
  "console_table",
  "ottoman",
  "bean_bag",
  "pantry",
  "towel_rail",
  "palm",
  "flower_bed",
  "boulder",
  "picnic_table",
  "slide",
  "bollard",
  "bike_rack",
  "raised_bed",
  "whiteboard",
  "printer",
  "server_rack",
  "hospital_bed",
  "workstation",
];

/** Every word of the tranche: the twenty families' words, aliases included, and no other. */
const NEW_WORDS: readonly string[] = FIXTURE_CATEGORIES.filter((w) => TRANCHE.includes(canonicalFixture(w)!));

/** Measured at `8233acc4` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["1defb1a97f6a98d2aad9f52a1a5dd7e4d40f5f7549f4cf70999b58b9aefd7212", "examples/accessible.arch"],
  ["46000a43c13888cf2eee11367cbbc755ddaaee42930ba101d22b5c56472b9045", "examples/aquarium.arch"],
  ["b65120c0078ef74191d75591963b87f64f2f0c6494282cb2eaecb845c75a9f25", "examples/attached.arch"],
  ["385eb04786c9b1340bc29e7ad5e0708792f0a7b57010d23b4e290fccb4ef62dc", "examples/bungalow.arch"], // CV13 (was 49d92a00): example source edited (chairs added)
  ["338016fcea87c340bd779573a3e4aea2ada57e897059e90ceb793ee359ed2be5", "examples/classroom-block.arch"],
  ["48cb9f6644d4da205cac0dfc262588850a286485b41eea5c4f775285db367df6", "examples/clinic.arch"],
  ["85fb5d784146dc24314305e34c9b707a6d867a4b1ced66bfe8ca1b2ff1e37336", "examples/corner-cafe.arch"],
  ["fbd2bd10d650feaaad65cc9aed910165f2b7b7a96cdc0b4dab8314b46a8710b5", "examples/courtyard-family.arch"], // new example (RM8.5, the courtyard-family showcase)
  ["042a55e657417f8fa9112ebdd4fd4064b5a84c43071fd9b0a83c257b29732c06", "examples/courtyard-house.arch"], // CV13 (was 54e3c3c5): example source edited (chairs added)
  ["4cc9df18d329f19f7291bb1942317741494f08df82d7357623effb66f4012cf9", "examples/furnished-flat.arch"],
  ["258681d9f66e5578ff99e17f77d3b301da6d2dbd3fca5ac4a80a0e1e33615ae1", "examples/gallery-l.arch"],
  ["5d5e7b26c2145ec4ee7b7b93d007adbfd9e811c8d91063b1e3380caa68d6378e", "examples/garden-house.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was f751c9de)
  ["55957d574fce885ecf823c0d2757f1830072a58d9e1d478060ef22e89e13f066", "examples/garden-loft.arch"], // CV13 (was 4b4d7b00): example source edited (chairs added)
  ["98886b03627a80297d5ac7e64a3beec28176cc3fa452bef4c4c1abdc300abbec", "examples/hexagon-pavilion.arch"], // CV13 (was 8bd6a37e): example source edited (chairs added)
  ["2277208bbb1bfe4f736aeb3c81d7ab1b0a5edca6883ca72ab753d3486470e7ed", "examples/hillside-villa.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was a7f940b3)
  ["b3ed32c98852d61c69c521cf756843e3d950dbff3bf5bbe45dabe997336ceb86", "examples/imports.arch"],
  ["d9a87f3402f1a99d4113e036a6a72de30a84826e8317a840cd353b0013c3bd5b", "examples/knob-flat.arch"], // new example (P4, the knobs example)
  ["1381be2ef7d0068103c27ef948c77082d7fb591111b36c84d309a2e747717f33", "examples/laneway-house.arch"], // CV13 (was b9093b92): example source edited (chairs added)
  ["664bacc1ef9be51bc128910ff9b42f45c322ef981ed05a85ae7ab89ec34afad6", "examples/library.arch"],
  ["f7dd7ef9a52f8da5a49f25f36428bbc33d754b113c1b4964e3508b5b8c65d43f", "examples/materials.arch"],
  ["b82630a3e096c4328d93982f581c817698e4ac5c9cb965b56562b320f54b80b5", "examples/museum-wing.arch"],
  ["25ce0b468db11db582491d07df83390a831cd5522fce2167650b009ba822f5eb", "examples/museum-wings.arch"],
  ["ed71bbdda5b24b9a8f7871521dc0145742ef06ed8604e232064b02183e129ec7", "examples/museum.arch"],
  ["45f4b26abfa7c62fa3b0c6c94fcbe2af3e4b11db62bba0b16f0e0567969a3bb4", "examples/one-room.arch"],
  ["4064206eb1e0357dd6f2bf27ee3ab812f1be6dc9d6e7228c2b0f4170566e90ff", "examples/parametric.arch"],
  ["a2c15d155fa58b84ebea6b73569f96cc91c9a15087158de4cdf9719a116a0c75", "examples/practice-office.arch"],
  ["438ead3b52356d8750a56b91d7057fdc6f7556a0ea89ff0acad3a270111f9b9d", "examples/relational.arch"],
  ["131d7956a2ed43a35efdc3df8cdef9b0b8a27d44aff5f529e0403884aa7d2b20", "examples/remodel.arch"], // CV13 (was e034f7f8): example source edited (chairs added)
  ["157e38a1404dbc2adddd0832783a7424abaea04e111f44c467ec1fa9b7b70f12", "examples/sheet-notes.arch"],
  ["1d9c8a9a57e9b4104d8aceb7a1ea5f23cea6963680037270195115d99e70d7cd", "examples/studio.arch"],
  ["c43011c1e3e15d3eb1e821186fade0fcd25ad697dc1da9c0ed52ed43d2ad5eb0", "examples/terrace-row.arch"], // CV08 (was 7784e0a7): example source edited (sofa turned to face the room)
  ["78d8e4b1ef3ca7afd21a9ec05a638b1d426299d7fb57e7bf09f1b4bcd17e58d8", "examples/themed.arch"],
  ["1183ede6f8a3a1ebf83e9b2c3614d88155e37613c4d5fc3f6acd3f80defa7f6c", "examples/tiny-house.arch"],
  ["d53b3a4b7f51560747296d2c37dce0919d71dc15b0126bd8af7b0026cd7f7391", "examples/townhouse.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3b76fb02): example source edited (chairs added); CV08 (was 067489db): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was d33a7ae4)
  ["7d9680366da7f54a92ac8d224fe3fa46dc36385030e87365d0e9158494c52961", "examples/transit-hall.arch"],
  ["6e3014ee1b48c4ca689b53a546c42784415d36f80775bb5cc4ed18dcfa495735", "examples/turning-stair.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 9914c01d)
  ["5befb53fade12044aa9301705c74141fe204c4f7f6ec48344492abf599faf22c", "examples/two-bed.arch"], // CV13 (was 1e2e65d0): example source edited (chairs added)
  ["c309fa15bad9c1908b53b4ebefec8ab3e8e80320f5f23a5e3293b68d81efa65a", "examples/two-storey.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["20f6d2fdea1167d15fb58cdf5100eba2b5ef8f608c4d4af0ff2a5ddf6211620c", "inline:families-before-legend"],
  ["6f9b9f86a99482c0ca862988a96dea45a10711ee0043353ae8ceffc3c7542892", "inline:near-words"], // AL4: the row edited, see the header
];

suite("visual-assets families — byte-identity law", () => {
  it("names exactly the twenty families appended after the earlier ones, aliases included", () => {
    // Was `CANONICAL_FIXTURES.length === FAMILIES_BEFORE + 20`, which a later append broke; the
    // twenty are now held by name at their rows, a stronger claim than a count (RM8.9).
    expect(CANONICAL_FIXTURES.slice(FAMILIES_BEFORE, FAMILIES_BEFORE + TRANCHE.length)).toEqual(TRANCHE);
    expect(TRANCHE).toHaveLength(20);
    expect(NEW_WORDS[0]).toBe("floor_lamp");
    expect(NEW_WORDS.at(-1)).toBe("desk_pod");
    for (const w of NEW_WORDS) expect(hasFixtureGlyph(w), w).toBe(true);
    for (const w of NEAR_WORDS) {
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
    expect(words.test("furniture id=lamp1 floor_lamp at (0,0)"), "the guard sees the id= form").toBe(true);
    expect(words.test("furniture palm at (0,0)"), "the guard sees the bare form").toBe(true);
    // The showcase plans (RM8.5) name new words on purpose and are the only files skipped: a closed,
    // sorted list, each under `examples/showcase/` (so never one of the law's rows, which are the
    // top-level examples), each present and each naming a new word, or the exemption is not needed.
    expect([...SHOWCASE_PLANS].sort()).toEqual(SHOWCASE_PLANS);
    expect(new Set(SHOWCASE_PLANS).size).toBe(SHOWCASE_PLANS.length);
    for (const p of SHOWCASE_PLANS) {
      expect(p, "a showcase plan lives under examples/showcase/").toMatch(/^examples\/showcase\/[^/]+\.arch$/);
      expect(
        ROWS.map((r) => r.name),
        "a showcase plan is never a row of the law",
      ).not.toContain(p);
      expect(words.test(readFileSync(join(ROOT, p), "utf8")), `${p} names a new word`).toBe(true);
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

  it("the premise scan refuses a missing folder, so a renamed entry cannot make it vacuous", () => {
    // `git ls-files` lists nothing for a path that does not exist; the disk walk threw ENOENT.
    expect(() => shippedSources(ROOT, "no-such-dir")).toThrow(/no-such-dir is not a folder/);
    expect(() => shippedSources(ROOT, "README.md"), "a file is not a folder").toThrow(/is not a folder/);
    // A trailing separator names the same folder.
    const examples = shippedSources(ROOT, "examples");
    expect(examples.length).toBeGreaterThan(0);
    expect(shippedSources(ROOT, "examples/")).toEqual(examples);
    expect(shippedSources(ROOT, "examples\\")).toEqual(examples);
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
