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
 *
 * ## RE-MEASURED for v1.32 (the furniture pass), and how it was proved
 *
 * The whole-surface digests below moved, and the reason is the one this header's "when one of
 * these moves" list names third: a rendering change landed from elsewhere in the release.
 * v1.32 redraws six kitchen and bath symbols (`island`, `upper_cabinet`, `dishwasher`, `oven`,
 * `fridge`, `washer`), so every plan that places one draws different bytes ON PURPOSE.
 *
 * That was not assumed. It was proved by SUBSTITUTION, and the proof is reproducible: the
 * committed `examples/<name>.svg` files are the compiler's own output and are drift-gated as
 * such, so the BASE drawing of any of these plans is `git show <the commit before the`
 * `redraw>:examples/<name>.svg`. Feeding that into this file's digest body, with `describe()`
 * and `lint()` taken from the NEW code, reproduces every old hex exactly. Only the drawing
 * moved; the summary and the diagnostics did not shift by a byte.
 *
 * And so that the next such release does not have to make that argument again, each example
 * now also carries a {@link semanticDigestWith} pin — the same payload with the SVG removed.
 * Those numbers are unchanged from the original measurement and are expected to stay that
 * way through any drawing change whatsoever. If one of THEM moves, the finding is real.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { type CompilerApi, digestWith, semanticDigestWith } from "./byte-identity-digest.js";

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
  "studio.arch": "c921a0607bf60aa2c39e27c4467d42f27660e4862a3735e8693726cdabf4e339",
  "laneway-house.arch": "0c2e933ce347a8458e422bb1acc5e39c7af11793145e1fd91e64b7d5e08588c1",
  "bungalow.arch": "36d62f8b5b1f005d0b8c59e1587a39c5b11dcfed09156358e0c609db3d9f0608",
  "furnished-flat.arch": "14fdd323031e6362f10c75e5cc6f4fe27e3ce48c1f49fabbc489c72485bf91d4",
  "two-bed.arch": "3de3901e69214a52c8ee220b916a050d956133370d5a85fdd577dedcbfac4604",
};

/**
 * The SUMMARY half of the same law: `describe()` and `lint()` with the drawing removed.
 *
 * These are the original v1.30.0 measurement, carried through the v1.32 furniture pass
 * UNCHANGED — which is the claim, not an accident of the arithmetic. A drawing change is
 * allowed to move {@link BASELINE}; nothing in this release is allowed to move these.
 */
const SEMANTIC_BASELINE: Readonly<Record<string, string>> = {
  "studio.arch": "b065cbe49d364414b340639fc06922eb14f472c9f4470134bb6f2b4489ada364",
  "laneway-house.arch": "ac2df20e15d2e4fbcc73e34a15d4e34578aa89a859860561b85361db170040b6",
  "bungalow.arch": "4835ae875c03ea01d8ec44ece1a3ecdcb3b324775c503bed0fad224e81fad93d",
  "furnished-flat.arch": "fa118ba75482141827ad2d3ec5fa2539e0408f9e849e81e3fb5bf5468b4fe06f",
  "two-bed.arch": "a118170f4549ccd89aa1dce2274363e9444c13d1667d679877cb2d460ac2e070",
};

suite("the outdoor tranche — the byte-identity law", () => {
  const api: CompilerApi = { compile, describe: describePlan, lint };

  for (const [file, want] of Object.entries(BASELINE)) {
    it(`${file} renders, describes and lints exactly as it did at v1.30.0 + the v1.32 redraw`, () => {
      expect(digestWith(api, readFileSync(join(ROOT, "examples", file), "utf8"))).toBe(want);
    });
  }

  for (const [file, want] of Object.entries(SEMANTIC_BASELINE)) {
    it(`${file} describes and lints exactly as it did at v1.30.0 — no drawing in the payload`, () => {
      expect(semanticDigestWith(api, readFileSync(join(ROOT, "examples", file), "utf8"))).toBe(want);
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
