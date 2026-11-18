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
  ["49d92a00bed95bd6d06eed52ed71e14c9931dbdca182b372a34e585e4e4327f5", "examples/bungalow.arch"],
  ["338016fcea87c340bd779573a3e4aea2ada57e897059e90ceb793ee359ed2be5", "examples/classroom-block.arch"],
  ["48cb9f6644d4da205cac0dfc262588850a286485b41eea5c4f775285db367df6", "examples/clinic.arch"],
  ["85fb5d784146dc24314305e34c9b707a6d867a4b1ced66bfe8ca1b2ff1e37336", "examples/corner-cafe.arch"],
  ["fbd2bd10d650feaaad65cc9aed910165f2b7b7a96cdc0b4dab8314b46a8710b5", "examples/courtyard-family.arch"], // new example (RM8.5, the courtyard-family showcase)
  ["54e3c3c58f1f6c0aa7ab0dc26f541f5ecbeae8a54abed8a5e0b5fb42f6d7c784", "examples/courtyard-house.arch"],
  ["4cc9df18d329f19f7291bb1942317741494f08df82d7357623effb66f4012cf9", "examples/furnished-flat.arch"],
  ["258681d9f66e5578ff99e17f77d3b301da6d2dbd3fca5ac4a80a0e1e33615ae1", "examples/gallery-l.arch"],
  ["f751c9de83b8ea36f902bd5160f7c17b99b8a7b503c48b6ba091ce77ae8f9e23", "examples/garden-house.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["4b4d7b00fdcf5aa4139be22895d356c389781cc973e4395391a4ee1fd1db3894", "examples/garden-loft.arch"],
  ["8bd6a37eaeb951c8fa11e547eee4ae9727f32c3189c5a79f168e461f01012f08", "examples/hexagon-pavilion.arch"],
  ["a7f940b31da42e963c8a9632117ac1ed320aa11220090d4c70d236cc931dff1d", "examples/hillside-villa.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["b3ed32c98852d61c69c521cf756843e3d950dbff3bf5bbe45dabe997336ceb86", "examples/imports.arch"],
  ["d9a87f3402f1a99d4113e036a6a72de30a84826e8317a840cd353b0013c3bd5b", "examples/knob-flat.arch"], // new example (P4, the knobs example)
  ["ade6cb2c0d185671a4fc243dbc65cf92d255da0326b88709dc837268a6350ccf", "examples/laneway-house.arch"],
  ["664bacc1ef9be51bc128910ff9b42f45c322ef981ed05a85ae7ab89ec34afad6", "examples/library.arch"],
  ["f7dd7ef9a52f8da5a49f25f36428bbc33d754b113c1b4964e3508b5b8c65d43f", "examples/materials.arch"],
  ["b82630a3e096c4328d93982f581c817698e4ac5c9cb965b56562b320f54b80b5", "examples/museum-wing.arch"],
  ["25ce0b468db11db582491d07df83390a831cd5522fce2167650b009ba822f5eb", "examples/museum-wings.arch"],
  ["ed71bbdda5b24b9a8f7871521dc0145742ef06ed8604e232064b02183e129ec7", "examples/museum.arch"],
  ["45f4b26abfa7c62fa3b0c6c94fcbe2af3e4b11db62bba0b16f0e0567969a3bb4", "examples/one-room.arch"],
  ["4064206eb1e0357dd6f2bf27ee3ab812f1be6dc9d6e7228c2b0f4170566e90ff", "examples/parametric.arch"],
  ["a2c15d155fa58b84ebea6b73569f96cc91c9a15087158de4cdf9719a116a0c75", "examples/practice-office.arch"],
  ["438ead3b52356d8750a56b91d7057fdc6f7556a0ea89ff0acad3a270111f9b9d", "examples/relational.arch"],
  ["e034f7f8f3920b2ff501edb0aaa4e3a21c28770dea67c43d4cdb61345f6e1793", "examples/remodel.arch"],
  ["157e38a1404dbc2adddd0832783a7424abaea04e111f44c467ec1fa9b7b70f12", "examples/sheet-notes.arch"],
  ["1d9c8a9a57e9b4104d8aceb7a1ea5f23cea6963680037270195115d99e70d7cd", "examples/studio.arch"],
  ["7784e0a77b26d646d188f9f8c3bdef276a7de207da696a02345d499f9c36321f", "examples/terrace-row.arch"],
  ["78d8e4b1ef3ca7afd21a9ec05a638b1d426299d7fb57e7bf09f1b4bcd17e58d8", "examples/themed.arch"],
  ["1183ede6f8a3a1ebf83e9b2c3614d88155e37613c4d5fc3f6acd3f80defa7f6c", "examples/tiny-house.arch"],
  ["3b76fb02d4b1f0f9c644e973a2ca5625f7ed523bb63d66fb140049546512d735", "examples/townhouse.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["7d9680366da7f54a92ac8d224fe3fa46dc36385030e87365d0e9158494c52961", "examples/transit-hall.arch"],
  ["9914c01d77860216fda528327da5290168a75b9a21925f46838852db606ebd93", "examples/turning-stair.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["1e2e65d06cd1b4c7a2c89b94365dcc51980b85044242fb45dd7da177aa2fe93f", "examples/two-bed.arch"],
  ["c309fa15bad9c1908b53b4ebefec8ab3e8e80320f5f23a5e3293b68d81efa65a", "examples/two-storey.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["20f6d2fdea1167d15fb58cdf5100eba2b5ef8f608c4d4af0ff2a5ddf6211620c", "inline:families-before-legend"],
  ["79b5ba0efe233640ad18646b6ee13070309315ef6240feb73d46b4ad55299e72", "inline:near-words"],
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
