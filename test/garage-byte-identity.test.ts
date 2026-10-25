/**
 * The byte-identity law for the outdoor tranche: **a plan that uses none of it
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
 * last commit before the outdoor tranche — by extracting that tree with `git archive` and running the SAME
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
 * ## RE-MEASURED for the furniture pass, and how it was proved
 *
 * The whole-surface digests below moved, and the reason is the one this header's "when one of
 * these moves" list names third: a rendering change landed from elsewhere in the release.
 * The furniture pass redraws FOURTEEN symbols across both furniture tracks — `island`,
 * `upper_cabinet`, `dishwasher`, `oven`, `fridge` and `washer` in the kitchen and bath
 * modules, and `coffee_table`, `table`, `stool`, `bench`, `chair`, `tv_unit`, `nightstand`
 * and `desk` in the living, bedroom and office ones, so every plan that places one
 * draws different bytes ON PURPOSE. Four of the five below do; `studio` moved under the
 * kitchen-and-bath track alone.
 *
 * That was not assumed. It was proved by SUBSTITUTION, and the proof is reproducible: the
 * committed `examples/<name>.svg` files are the compiler's own output and are drift-gated as
 * such, so the BASE drawing of any of these plans is `git show <the commit before the`
 * `redraw>:examples/<name>.svg`. Feeding that into this file's digest body, with `describe()`
 * and `lint()` taken from the MERGED code, reproduces all five pre-furniture hexes exactly.
 * Only the drawing moved; the summary and the diagnostics did not shift by a byte.
 *
 * And so that the next such release does not have to make that argument again, each example
 * now also carries a {@link semanticDigestWith} pin — the same payload with the SVG removed.
 * Those numbers are unchanged from the original measurement and are expected to stay that
 * way through any drawing change whatsoever. If one of THEM moves, the finding is real.
 *
 * Re-measured for the visual-polish symbol redraw: SVG only, describe/lint/diagnostics unchanged
 * (substitution check reproduces the old digests).
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
 * The pins, measured at `5298b99`. Each plan is here for what it would catch:
 *
 *   - `studio` — the lint-clean, import-free flagship. Furniture, doors, windows, no kinds.
 *   - `laneway-house` — every opening on a wall run and every fixture on a room or wall, so
 *     it exercises the derived-placement paths the new room-side probe sits beside.
 *   - `bungalow` — the DOOR-KIND flagship, which already uses four of the five older kinds:
 *     a sixth kind leaking into the shared door path would move this one first.
 *   - `furnished-flat` — the FURNITURE flagship, 29 of the 36 pre-outdoor glyph families. If
 *     appending 21 families to `FIXTURE_FAMILIES` touched the dispatch, the legend order or
 *     the catalog lookups, it shows up here.
 *   - `two-bed` — a plain house with none of the above, as the control.
 *
 * ## The furniture-pass re-measurement — six furniture symbols were REDRAWN
 *
 * Four of the five moved, and `studio` did NOT. The living/bedroom/office track redraws eight fixture
 * symbols (`coffee_table`, `table`, `stool`, `bench`, `chair`, `tv_unit`, `nightstand`,
 * `desk`); `studio` places only bath and kitchen fixtures, so its pin is UNCHANGED — the same
 * number, not a re-blessing — and is the control saying the redraw stayed inside the glyph
 * layer. **`describe()` and `lint()` were held SHA-256 identical across the whole change**,
 * measured example by example against `8fc432a`'s `src/` (extracted with `git archive`) for
 * all 28 import-free examples: 22 SVGs moved, 0 summaries and 0 diagnostic sets.
 *
 *
 * ## The circulation-fix re-measurement — the SUMMARY moved, and that is the point
 *
 * This is the case the message on the summary half describes: **a moved lint rule and a
 * changed `describe()` value**, not a drawing. Nothing in the circulation fix touches a
 * glyph, and the SVG half moved only because its payload contains `describe()`.
 *
 * Exactly what changed on `studio.arch`, measured field by field against the previous
 * commit: **one number.** `circulation.rooms[r_bath].bottleneckClearWidthMm` and the
 * `r_bed -> r_bath` route's copy of it both go **700 -> 740**. Every other key of the whole
 * summary — rooms, areas, adjacency, openings, freedom, totals — is byte-identical, and
 * `lint(studio)` is unchanged (still empty). 740 is the interior door's own clear width
 * (800 - 60); the old 700 was a FURNITURE pinch reported one body diameter short, so the
 * flagship sat exactly on the 700 mm minimum by arithmetic accident and one cell of drift
 * would have made it warn.
 *
 * `furnished-flat.arch`, where this suite also pins one: `circulation` gains an `r_bath`
 * entry and the two bedroom->bath routes that depend on it (the room was silently dropped
 * because its label point sat in a pocket the entrance could not reach), and gains
 * `blocked: [{ roomId: "r_kitchen", widestWayInMm: 400 }]` — a real, previously
 * unreported finding about that plan, carrying the MEASURED width of the best way in
 * rather than a fabricated zero.
 * Nothing else in its summary moved.
 *
 * Do not read this entry as permission either. A summary digest still moves only for a
 * named, measured reason, written down here.
 *
 * ## Amendment — the threshold carve, and why more plans moved
 *
 * The connector carve was centre-first-then-stop: if the opening's midpoint happened to
 * be walkable, ONE cell of the threshold was opened and the rest of its width was never
 * tried. Every walkable part is now carved. That is strictly MORE free cells, so a route
 * can only gain options, and the measured effect across the shipped examples is exactly
 * that: **every `walkDistanceMm` and `detourRatio` on the affected plans falls or stays
 * equal, and every `bottleneckClearWidthMm` is unchanged — with one exception**,
 * `aquarium`'s `rotunda_r`, 2340 -> 1740. That one is the carve's stamp, not the route: a
 * carved cell is stamped with `min(existing, connector clear width)`, so opening more of
 * a narrower connector's threshold stamps more cells at its width. It is a lower number
 * for a real reason and it moves no diagnostic.
 *
 * **`lint()` over all 30 shipped examples is byte-identical across this amendment** —
 * the only two diagnostics this branch adds were already added before it.
 *
 * **Re-measured for circulation (W3b):** both plans have more than one entrance, and each
 * room now walks from its nearest (`bungalow` r_living 13000 → 4000, `laneway-house` r_bed
 * 9200 → 4400). Only `describe().circulation` moved; SVG and `lint()` are byte-identical.
 * `test/byte-identity-baseline.ts` has the account ("Fourteen rows re-measured").
 */
// Rows re-measured for circulation v2 (backlog E.6–E.10) with this file's own digest body:
// SVG and lint() byte-identical, only describe().circulation moved — each field, and the
// rule that moved it, in ./byte-identity-baseline.ts ("Circulation v2").
// `laneway-house` and `bungalow` re-measured again for the thickness call-out station, the
// drawing only: the OLD SVG put back into the new payload reproduces each old row, and
// SEMANTIC_BASELINE did not move. Each moved call-out in ./byte-identity-baseline.ts
// ("thickness call-outs keep off doorways and fixtures").
// Every row re-measured once for net internal area (owner decision 2): describe() gains
// net_area_m2 / totals.net_floor_area_m2; SVG and lint unchanged except room schedules.
// A hybrid run of this file, unedited, with describe() from the pre-change tree (1eb1bf9)
// reproduces every old SUMMARY row and every old whole-surface row but `bungalow` and `furnished-flat`'s, which
// set `schedule rooms` and gain the NET AREA column; with compile() too from that tree
// they reproduce as well. The account is in ./byte-identity-baseline.ts ("EVERY row
// re-measured, once"). Those schedule rows were re-measured once more, alone, when the
// AREA column took the label `AREA (CENTRELINE, m²)`; SEMANTIC_BASELINE did not move.
// `laneway-house` and `bungalow`, both rows each, re-measured for plan-soundness PS0.10:
// `describe().access` gains the appended `mainEntrance` (`d_front`, the door on the `site`
// street side) and each room's `depthFromMainEntrance`; SVG and `lint()` byte-identical, and
// the previous describe() put back reproduces every previous row (./byte-identity-baseline.ts,
// "`describe().access` names the main entrance"). `bungalow` re-measured again in the PS0.10
// review round (its fact became `entry-room`), describe() only, the same way, and again in
// review round 2 (its fact became `street`).
// Re-measured 2026-10-23 (PS3.7): furnished-flat (both tables): chairs turned to the table they sit at, a real
// defect `W_SEAT_FACING_AWAY` found (ADR 0029 §6); the cause and the proof that nothing else
// moved are in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (two-bed, both tables); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-25 (PS2.11a/b): furnished-flat, laneway-house and two-bed, fixed for WC side clearance and tall units over windows; why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
const BASELINE: Readonly<Record<string, string>> = {
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  "studio.arch": "82fe959144377f91640399c673cbcd4d58aad91b34ca45a26541ab5c99fbe3c1",
  // laneway-house, bungalow and two-bed re-measured 2026-10-20 (PS2.17), a worktop in each kitchen;
  // see `byte-identity-baseline.ts`, "a worktop in every example kitchen", for the swap-back proof.
  "laneway-house.arch": "391bfbbb41fcb09e93f242a5f72ab367ad1adbdec31d61b9d5b11374db88615a",
  "bungalow.arch": "212e4b7910d17e62786fae7a1a71fb7a28cfe2c6891af728ece16aacb825ec11",
  // Re-measured for the `overhead` flag. Its SOURCE gained two statements —
  // a `range_hood` over the stove and a `mirror` over the basin, the two correct drawings
  // the missing flag had kept out of the flagship — so this plan is a different building
  // and both its digests move. See the SEMANTIC_BASELINE note for the proof that the CODE
  // is innocent: the pre-`overhead` source reproduces the OLD hexes exactly under the NEW compiler.
  // Re-measured again 2026-10-18 (PS2.1): its bedroom-2 south window moved 4400 → 4450, off a
  // 50 mm nib beside the partition, so only the SVG moved; the previous SVG with the new
  // describe() + lint() reproduces the previous row (./byte-identity-baseline.ts, "Six examples").
  // Re-measured 2026-10-20 (PS2.19): "Utility" now classifies as `utility`; see `byte-identity-baseline.ts`.
  "furnished-flat.arch": "a03cbdc9dfd1165cd3114b708a9e0cace3d7b7186cfe945348f043a67770ff82",
  // Re-measured 2026-10-18 (PS0.7): "Kitchen / Living" now classifies as `kitchen living`, so
  // `describe()` moves (uses + room_type) and nothing else; see ./byte-identity-baseline.ts,
  // "the label classifier emits living", for the swap-back proof. Re-measured again the same day
  // (PS2.5): `lint()` gains three W_ROOM_VIA_PRIVATE; see "the circulation-and-privacy rules".
  "two-bed.arch": "57ad08ca74589f30db3515a62facade0d57e128cf9d723709bf6f584400215c2", // PS3.6 source rewrite, see ./byte-identity-baseline.ts
};

/**
 * The SUMMARY half of the same law: `describe()` and `lint()` with the drawing removed.
 *
 * These are the original `5298b99` measurement, carried through the furniture pass
 * UNCHANGED — which is the claim, not an accident of the arithmetic. A drawing change is
 * allowed to move {@link BASELINE}; nothing in this release is allowed to move these.
 */
const SEMANTIC_BASELINE: Readonly<Record<string, string>> = {
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  "studio.arch": "7f8fc9b1f532bb497d826eaea9110f569df1b21cc91b558deb7e83588432abab",
  // laneway-house, bungalow and two-bed re-measured 2026-10-20 (PS2.17), as above.
  "laneway-house.arch": "870b085220a30a6edb97ff76694b105c118b9e5d51360cb0ce559f10859b50d5",
  "bungalow.arch": "6ec78e3ea6d359372405d3cc7aacb476bf6afb0fee7d322cd6a953ea9be9239a",
  // `furnished-flat.arch` is the ONE value in this table that is not the original `5298b99`
  // measurement, and the exception proves the rule rather than bending it. Its SOURCE keeps
  // being edited -- seven of the new families in the furniture pass, then a `range_hood` and a `mirror`
  // for the `overhead` flag -- so `describe()` and `lint()` genuinely report a different building,
  // which is exactly the kind of change this pin exists to make visible. A redrawn SYMBOL,
  // or a lint rule learning a new exemption, still cannot move any number here.
  //
  // The `overhead` re-measure (d58f7a8f -> 9ec50513) was proved to be the SOURCE and not the code,
  // by the substitution this file's header prescribes: feed `git show <pre-overhead>:examples/
  // furnished-flat.arch` to THIS body under the MERGED compiler and it reproduces
  // d58f7a8f42... and 88d5be44... exactly, both halves, to the byte. Field by field, the new
  // summary differs by exactly two entries -- `range_hood_14` and `mirror_36` -- plus the
  // auto-id renumbering that inserting two statements mid-file forces on every later piece;
  // `lint()` still returns ONE diagnostic, the same `W_PATH_TOO_NARROW` with the same
  // message and hints, its byte span shifted by the comment lines added above it.
  // Re-measured 2026-10-20 (PS2.19), `describe()` only: see `byte-identity-baseline.ts`.
  "furnished-flat.arch": "f9740bf19ebe9393544c8c4b596ace39c7533ccd5db338ad6168b96e84bffe1d",
  // Re-measured 2026-10-18 (PS0.7, then PS2.5), the same causes as BASELINE's two-bed row.
  "two-bed.arch": "e2b8068bbca56dd2422efe090b0dfb9a945d524c91102e49d4546c928428f7a0", // PS3.6 source rewrite, see ./byte-identity-baseline.ts
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
