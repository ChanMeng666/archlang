/**
 * The byte-identity law for `outdoor`, `fence` and `site { boundary … }` (v1.31).
 *
 * **Every new language form ships with a byte-identity law, pinned by test: a plan that
 * does not use it renders, describes and lints exactly as before.** `site`, the door
 * kinds, `zone`, `paper`, `polygon`, `arc`, `roof` and `void` each have one; this is the
 * three v1.31 forms'.
 *
 * ## Where the hashes came from
 *
 * They were measured on this worktree's HEAD — `5298b99`, the v1.30.0 release commit —
 * **before the first `src/` edit of this branch**, by running the existing
 * `test/roof-void-byte-identity.test.ts` and confirming its four digests green. That
 * suite's `BASELINE` covers the same four examples with the same `digest()` body, so the
 * numbers below are that measurement, carried across rather than re-derived.
 *
 * Carrying them is deliberate and is the cheapest correct thing available: taking a
 * "fresh" baseline from a tree that already contains the change would prove determinism,
 * not identity, and would stay green through a change that moved every byte. The standing
 * warning applies unchanged — take a baseline with the SAME `digest()` body the test will
 * run, never a lookalike in a throwaway script; the first attempt at the v1.29 law used a
 * scratch script whose payload separator differed by one character and produced four
 * "failures" over artifacts that were in fact byte-identical.
 *
 * The payload is the WHOLE agent-facing surface — SVG, `describe()` AND `lint()` — not
 * just the drawing. A new element that quietly appended an empty key to every summary, or
 * shifted a diagnostic's order, would leave the SVG untouched and still be a behaviour
 * change for every consumer of `arch describe --json`. That is not hypothetical here:
 * this branch appends `outdoor`/`fences` to `SceneSummary`, `outdoor_area_m2` to
 * `totals`, two fields to `site`, and two rules to the END of `LINT_RULES` — four chances
 * to move a byte on a plan that mentions none of it.
 *
 *
 * ## The v1.32 re-measurement — six furniture symbols were REDRAWN
 *
 * Three of the four moved, and `studio` did NOT — that asymmetry is the finding, so read it
 * before touching a number. v1.32's F2 track redraws eight fixture symbols (`coffee_table`,
 * `table`, `stool`, `bench`, `chair`, `tv_unit`, `nightstand`, `desk`), so a plan that draws
 * one of the eight renders different bytes and a plan that does not is untouched. `studio`
 * places only bath and kitchen fixtures, so its digest is UNCHANGED — the same number, not a
 * re-blessing — which is the control saying the redraw stayed inside the glyph layer and did
 * not reach the shared paths this law exists to watch.
 *
 * **`describe()` and `lint()` were held SHA-256 identical across the whole change**, measured
 * example by example against `8fc432a`'s `src/` (extracted with `git archive`) for all 28
 * import-free examples: 22 SVGs moved, 0 summaries and 0 diagnostic sets. The bytes that moved
 * here are SVG bytes, and the net lint change across the shipped examples is zero.
 *
 * The four examples are import-free (so no `World` is needed), none of them uses any
 * v1.31 form, and they span the shapes most likely to be disturbed: the signature
 * dwelling, the flagship, a CONCAVE polygon plan (whose ring code the ground surfaces
 * share a module with) and a CURVED sheet plan on `paper` (whose auto-fit reads the same
 * `planBounds` and the same legend row count the ground now contributes to).
 *
 * ## RE-MEASURED for v1.32 (the furniture pass), and how it was proved
 *
 * All four digests below moved, and it is not this law breaking. v1.32 redraws FOURTEEN symbols across both furniture tracks — `island`,
 * `upper_cabinet`, `dishwasher`, `oven`, `fridge` and `washer` in the kitchen and bath
 * modules, and `coffee_table`, `table`, `stool`, `bench`, `chair`, `tv_unit`, `nightstand`
 * and `desk` in the living, bedroom and office ones, so every plan that places one draws different bytes ON
 * PURPOSE. Which track moved which is itself a useful reading: `studio` places only bath and
 * kitchen fixtures and moved under that track alone; `gallery-l` and `aquarium` place none of
 * those six and moved only under the living/bedroom/office one; `laneway-house` moved under
 * both.
 *
 * That was proved by SUBSTITUTION rather than assumed, and the proof is reproducible. The
 * committed `examples/<name>.svg` files are the compiler's own output, drift-gated as such,
 * so the BASE drawing of any of these plans is `git show <the commit before the redraw>:`
 * `examples/<name>.svg`. Feeding that into this file's digest body — with `describe()` and
 * `lint()` taken from the MERGED code — reproduces the OLD hex exactly, for every plan here.
 * Only the drawing moved.
 *
 * So that the next such release need not repeat the argument, each example now also carries a
 * pin over the SUMMARY half alone (`semanticDigestWith`: the same payload with the SVG
 * removed). Those numbers are the original measurement, unchanged, and a drawing change can
 * never move them. If one of THEM moves, the finding is real.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, planToJson } from "../src/index.js";
import { type CompilerApi, semanticDigestWith } from "./byte-identity-digest.js";

/** SHA-256 over the SVG + `describe()` + `lint()` of one example, as measured at v1.30.0.*
 *
 * ## The backlog-5.8 re-measurement — the SUMMARY moved, and that is the point
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
 * ## The G.5 re-measurement — a curved wall stopped being rasterised as its chord
 *
 * ONE example moved: `aquarium`, on BOTH halves. `studio`, `gallery-l` and `laneway-house`
 * are unchanged, and that is the control — none of them has an `arc`.
 *
 * The nav grid blocked every wall segment against the straight CHORD between its endpoints,
 * ignoring the `arcs[]` solve `resolve` had already done. For a curve that is not a coarser
 * version of the same wall, it is a DIFFERENT wall somewhere else: `aquarium`'s rotunda is
 * two semicircular `arc` edges sharing endpoints, so it rasterised to a bar along its own
 * DIAMETER — a route could walk through the masonry, while the round room inside was severed
 * into two caps and the `plant` room beyond one of them dropped out of the facts with nothing
 * said (`docs/backlog.md` G.5). Segments now block against `distPointToArc`.
 *
 * Field by field against the previous commit, `aquarium`'s summary changes ONLY inside
 * `circulation`: a new `rooms[]` entry for `plant` (walk 36 900, bottleneck 1140 — exactly
 * `d_rot_n`'s own clear width, which is the narrowest thing on the only route in), and
 * `rotunda_r`'s walk 25 600 -> 25 700, one cell, for having to use the carved threshold
 * instead of walking through the wall. Every other key — rooms, areas, adjacency, openings,
 * freedom, totals — is byte-identical.
 *
 * **The SVG is byte-identical**, which is the constructive half of the argument: the DRAWING
 * always had the arc. Only the nav grid had a chord. And `lint()` over all 30 shipped
 * examples is byte-identical across the change.
 *
 * Do not read this entry as permission either.
 */
const BASELINE: [string, string][] = [
  ["laneway-house", "2052f41a371dc7164ad7534142338f92a6abb516b8ec488a0ebbad20158c5292"],
  ["studio", "28e8de0bce723f8822d966fbb4a1fe9e533c21dd0c68f22e7f2ff2d57cd1ad44"],
  ["gallery-l", "753b39b0dc5ed5a38aa7243d4b7738257e771f95d0590f0595a2512550fcbc5f"],
  ["aquarium", "87a5c9dccb68dfb26c33f61214ef21c284f6a1aaa12a7901a96231d4f11c1890"],
];

/** The SUMMARY half of the same law — see the header. Unchanged since the measurement. */
const SEMANTIC_BASELINE: [string, string][] = [
  ["laneway-house", "bde186c2290e5aa19ea60c3ec9e8ad7cfa3f5237e7d2a0a80cdca393fa3ab85a"],
  ["studio", "7ed53b6e0925e21fe4c4fad7351ce7e80635818395fc79cf661ba095db8129b3"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["aquarium", "45f491a88fa4d1f259d61005220264b0d217e245f482786c842300aa92e1cc6e"],
];

/** The compiler surface the summary-half pins are taken over. */
const API: CompilerApi = { compile, describe: describePlan, lint };

/** The exact payload the baseline digests were taken over — do not change its shape. */
function digest(src: string): string {
  const { svg } = compile(src, { noCache: true });
  const payload = [svg, JSON.stringify(describePlan(src)), JSON.stringify(lint(src))].join("\n \n");
  return createHash("sha256").update(payload).digest("hex");
}

describe("outdoor/fence/boundary byte-identity — a plan that uses none of them is unchanged", () => {
  for (const [name, sha] of BASELINE) {
    it(`${name}.arch renders, describes and lints exactly as on main`, () => {
      const src = readFileSync(`examples/${name}.arch`, "utf8");
      // COMMENTS ARE STRIPPED FIRST. `boundary` is an ordinary English word and
      // `aquarium.arch` uses it in prose ("# room boundary and connects two spaces"),
      // which the first draft of this guard read as a language use and refused. The guard
      // is about what the plan COMPILES, so it has to look at what the compiler looks at.
      const code = src.replace(/#.*$/gm, "");
      expect(code).not.toMatch(/(?<![\w-])(outdoor|fence|boundary)(?![\w-])/);
      expect(
        digest(src),
        `${name}.arch changed. Nothing on this branch touches it, so either a shared code path ` +
          `moved (the hatch list the SVG defs are built from, the legend row count, planBounds, ` +
          `the describe() key order, the LINT_RULES order) or an element table grew a field every ` +
          `plan pays for. Find out WHICH before updating this digest — the point of the number is ` +
          `that it does not move.`,
      ).toBe(sha);
    });
  }

  for (const [name, sha] of SEMANTIC_BASELINE) {
    it(`${name}.arch describes and lints exactly as on main — no drawing in the payload`, () => {
      expect(
        semanticDigestWith(API, readFileSync(`examples/${name}.arch`, "utf8")),
        `${name}.arch's SUMMARY changed. A redrawn symbol cannot do this; a new describe() key, ` +
          `a moved lint rule or a catalog flag that changed an existing category's semantics can. ` +
          `This number is not re-measured for a drawing change.`,
      ).toBe(sha);
    });
  }
});

describe("the three forms are absent from the Plan JSON projection", () => {
  const PLAN = (extra: string): string =>
    `plan "J" {\n  units mm\n` +
    `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
    `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living\n` +
    `  door id=d on w1 at 50% width 900\n` +
    `${extra}}\n`;

  /**
   * The control carries the `site` block already, and that is the whole point of it.
   *
   * `site` HAS entered Plan JSON since v1.25 — as `{street, hemisphere}` — so a control
   * with no `site` at all would differ from the test plan for a reason that predates this
   * branch by six releases, and the first draft of this test failed exactly that way.
   * Holding the block fixed and adding only the three v1.31 forms to it isolates the
   * claim being made, which is sharper than the version that accidentally passed would
   * have been: it says `boundary` does not join the projection even though the block it
   * sits in already does.
   */
  const SITE = `  site {\n    street south\n`;

  it("adding ground, a fence and a lot line does not change one byte of `planToJson`", () => {
    const bare = planToJson(PLAN(`${SITE}  }\n`));
    const all = planToJson(
      PLAN(
        `${SITE}    boundary (-4000,-4000) (14000,-4000) (14000,11000) (-4000,11000)\n  }\n` +
          `  outdoor lawn at (-3000,-3000) size 16000x13000 label "Garden"\n` +
          `  outdoor balcony at (2000,5000) size 3000x1500\n` +
          `  fence picket { (-4000,-4000) (14000,-4000) }\n`,
      ),
    );
    expect(bare.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(all.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(JSON.stringify(all.json)).toBe(JSON.stringify(bare.json));
  });

  it("…and neither does each form ON ITS OWN, against a plan with no `site` at all", () => {
    // The per-form version of the same law. It runs against the bare control precisely
    // BECAUSE the site case cannot: it proves that `outdoor` and `fence` add nothing even
    // to a projection that has no `site` key to hide behind.
    const bare = JSON.stringify(planToJson(PLAN("")).json);
    for (const extra of [
      `  outdoor lawn at (-3000,-3000) size 16000x13000 label "Garden"\n`,
      `  outdoor balcony at (2000,5000) size 3000x1500\n`,
      `  outdoor paving polygon (0,0) (4000,0) (4000,3000)\n`,
      `  fence picket { (-4000,-4000) (14000,-4000) }\n`,
    ]) {
      expect(JSON.stringify(planToJson(PLAN(extra)).json), extra.trim()).toBe(bare);
    }
  });

  it("no new keyword appears in either committed schema", () => {
    for (const f of ["schemas/plan.schema.json", "schemas/intent.schema.json"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/"(outdoor|fence|boundary|rail)"/);
    }
  });
});

describe("additive to the drawing — and the page growth is stated, not hidden", () => {
  /** The same plan with and without ground, a fence and a lot line. */
  const pair = (settings: string): [string, string] => {
    const body =
      `  units mm\n  north up\n${settings}` +
      `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
      `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living\n`;
    return [
      compile(`plan "G" {\n${body}}\n`, { noCache: true }).svg,
      compile(
        `plan "G" {\n${body}` +
          `  outdoor lawn at (-3000,-3000) size 16000x13000\n` +
          `  fence post { (-3000,-3000) (13000,-3000) }\n` +
          `}\n`,
        { noCache: true },
      ).svg,
    ];
  };

  /** Every CAD-layer group in the SVG, keyed by layer name. */
  const layers = (svg: string): Map<string, string> =>
    new Map([...svg.matchAll(/<g id="([^"]+)"[\s\S]*?<\/g>/g)].map((m) => [m[1]!, m[0]!]));

  it("on a `paper` plan, every existing layer is byte-identical and only L-SITE/L-PLNT are new", () => {
    // With a sheet the render sizes come from the PAPER, so nothing rescales and the claim
    // is exact: the ground adds groups and touches no other. This is the strong form of
    // "additive" — ground that had moved a label, a wall or a dimension would fail here
    // rather than hide inside a page-size difference.
    const [bare, ground] = pair(`  paper A2 landscape\n  scale 1:100\n`);
    const a = layers(bare);
    const b = layers(ground);
    expect([...b.keys()].filter((k) => !a.has(k)).sort()).toEqual(["L-PLNT", "L-SITE"]);
    for (const [name, group] of a) expect(b.get(name), `layer ${name} moved`).toBe(group);
  });

  it("without `paper`, the ground rescales the whole drawing — and that is the pre-existing rule", () => {
    // A plan with no sheet sizes every font and stroke from its own reference dimension
    // (`max(drawW, drawH)`), so ANY element that grows the extent rescales the drawing — a
    // far-flung `column`, a wide `dim` offset and a `roof overhang` all do exactly the
    // same. Pinned rather than papered over, so nobody reads the sheet-mode test above as
    // a promise the no-sheet path also makes. It is why a site plan wants `paper`.
    const [bare, ground] = pair("");
    const fontOf = (svg: string): string => /font-size="([\d.]+)"[^>]*font-weight="600"/.exec(svg)![1]!;
    expect(Number(fontOf(ground))).toBeGreaterThan(Number(fontOf(bare)));
  });

  it("a plan with no ground emits no ground `<pattern>` and no extra legend row", () => {
    // The other direction of the hatch widening: `hatchesUsed(walls, ground)` must add
    // exactly nothing when there is no ground, or every existing legend gains a row and
    // every existing sheet reserves space for it.
    const sheet = `  paper A2 landscape\n  scale 1:100\n  legend\n`;
    const [bare] = pair(sheet);
    const ids = [...bare.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids).toEqual(["poche"]);
  });
});
