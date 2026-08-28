/**
 * The byte-identity law for the v1.31 outdoor tranche: **a plan that uses none of it
 * renders, describes and lints exactly as it did before it existed.**
 *
 * Every new language form ships with this law, and the form it takes here matters. A twin
 * comparison inside one run — the shape `test/site.test.ts` uses, where a plan with a `site`
 * block is compared against its site-less twin — cannot state this claim, because a `garage`
 * door is *supposed* to draw differently from a `hinged` one. The question is not "do two
 * plans agree" but "did the plans that were already here move", and only a baseline can
 * answer it. A test that compiled twice and compared would prove determinism, which is a
 * different property and one already pinned elsewhere.
 *
 * So the digests below are **hardcoded, and measured against `src/` at `5298b99`** — the
 * v1.30.0 release commit — by extracting that tree with `git archive` and running the SAME
 * {@link digestWith} against it. That helper lives in `test/byte-identity-digest.ts` rather
 * than in this file for exactly that reason: a baseline generator has to load the OLD `src/`,
 * so it cannot import a test file (which pulls in vitest and runs its own suite the moment it
 * is imported), and the alternative — a lookalike copy of the digest body in a scratch script
 * — is how an earlier attempt at this kind of test in this repository reported four
 * "failures" over artifacts that were in fact byte-identical, its payload separator differing
 * by one character.
 *
 * The payload is the whole agent-facing surface — **SVG, `describe()` and `lint()`** — not
 * just the drawing. A change that appends an empty key to every summary leaves the drawing
 * untouched and is still a behaviour change for every `arch describe --json` consumer, which
 * is the exact shape of change this tranche makes.
 *
 * ## What is deliberately NOT here
 *
 * `examples/hillside-villa.arch`. Its digests move on purpose in this tranche: its garage is
 * retagged `uses garage` and its garage door becomes the `garage` kind. Both are changes to
 * the summary and the drawing, named in `CHANGELOG.md` and measured in the commits that made
 * them. Pinning the showpiece here would either bless that silently or fail forever.
 *
 * ## When one of these moves
 *
 * That is a finding to explain before it is a diff to bless. A digest here moving means one
 * of three things: a shared code path was touched (the outdoor glyphs, the use vocabulary and
 * the door kinds are all supposed to be reachable ONLY from their own syntax), a rendering
 * change landed from elsewhere in the release (re-measure against the commit that made it,
 * and say so in the same breath), or the law is genuinely broken.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { type CompilerApi, digestWith } from "./byte-identity-digest.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/**
 * The pins, measured at `5298b99` (v1.30.0). Each plan is here for what it would catch:
 *
 *   - `studio` — the lint-clean, import-free flagship. Furniture, doors, windows, no kinds.
 *   - `laneway-house` — every opening on a wall run and every fixture on a room or wall, so
 *     it exercises the derived-placement paths the new room-side probe sits beside.
 *   - `bungalow` — the DOOR-KIND flagship, which already uses four of the five older kinds:
 *     a sixth kind leaking into the shared door path would move this one first.
 *   - `furnished-flat` — the FURNITURE flagship, 29 of the 36 pre-v1.31 glyph families. If
 *     appending 21 families to `FIXTURE_FAMILIES` touched the dispatch, the legend order or
 *     the catalog lookups, it shows up here.
 *   - `two-bed` — a plain house with none of the above, as the control.
 */
const BASELINE: Readonly<Record<string, string>> = {
  "studio.arch": "4f006efaca9e50001d0fdd1452d346be56fe72fd3915228d5f17e0e624383566",
  "laneway-house.arch": "fe14d8d386a28951c546461f2e9456ab7263a26d5401a9d07a01b0d3f2f4e397",
  "bungalow.arch": "568f9d94588c60426bbe0d5fe321f7f151058fb01f8b1d90cdbc3e6374fbab64",
  "furnished-flat.arch": "a96b1eae75899ad1d4d08235d2d80ea700484caff94fa856e12c9a2e33a90c04",
  "two-bed.arch": "c2f2145a281f096800761671268074e328dbe0dee21ed6c8403b352f136b929e",
};

suite("the outdoor tranche — the byte-identity law", () => {
  const api: CompilerApi = { compile, describe: describePlan, lint };

  for (const [file, want] of Object.entries(BASELINE)) {
    it(`${file} renders, describes and lints exactly as it did at v1.30.0`, () => {
      expect(digestWith(api, readFileSync(join(ROOT, "examples", file), "utf8"))).toBe(want);
    });
  }

  it("is not vacuous — the digest moves when the drawing does", () => {
    // If `digestWith` read anything that did not depend on the source, every pin above would
    // pass for free. (The first probe written here was a `grid 50` snap, which changed
    // NOTHING — `studio.arch`'s coordinates already sit on that grid — so the non-vacuity
    // check would itself have been vacuous. Adding a piece of furniture is unambiguous.)
    const src = readFileSync(join(ROOT, "examples", "studio.arch"), "utf8");
    const planted = src.replace(/\}\s*$/, "  furniture plant at (100,100) size 400x400\n}\n");
    expect(planted).not.toBe(src);
    expect(digestWith(api, planted)).not.toBe(digestWith(api, src));
  });

  it("covers all three surfaces, not just the SVG", () => {
    // Two sources whose SVG is identical and whose `describe()` is not: a `uses` tag draws
    // nothing. If the payload were the drawing alone this would pass, and the law would be
    // silent about exactly the kind of change this tranche makes.
    const base = 'plan "P" {\n  units mm\n  room id=r at (0,0) size 4000x4000 label "R"\n}';
    const tagged = base.replace('label "R"', 'label "R" uses garage');
    expect(compile(tagged, { noCache: true }).svg).toBe(compile(base, { noCache: true }).svg);
    expect(digestWith(api, tagged)).not.toBe(digestWith(api, base));
  });
});
