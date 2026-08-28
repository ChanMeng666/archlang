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
 * The four examples are import-free (so no `World` is needed), none of them uses any
 * v1.31 form, and they span the shapes most likely to be disturbed: the signature
 * dwelling, the flagship, a CONCAVE polygon plan (whose ring code the ground surfaces
 * share a module with) and a CURVED sheet plan on `paper` (whose auto-fit reads the same
 * `planBounds` and the same legend row count the ground now contributes to).
 *
 * ## RE-MEASURED for v1.32 (the furniture pass), and how it was proved
 *
 * Two of the four digests below moved, and it is not this law breaking. v1.32 redraws six
 * kitchen and bath symbols (`island`, `upper_cabinet`, `dishwasher`, `oven`, `fridge`,
 * `washer`), so every plan that places one draws different bytes ON PURPOSE — which is
 * `laneway-house` and `studio`. `gallery-l` and `aquarium` place none of the six and did not
 * move at all, which is itself a useful reading: the redraw is confined to the six.
 *
 * That was proved by SUBSTITUTION rather than assumed, and the proof is reproducible. The
 * committed `examples/<name>.svg` files are the compiler's own output, drift-gated as such,
 * so the BASE drawing of any of these plans is `git show <the commit before the redraw>:`
 * `examples/<name>.svg`. Feeding that into this file's digest body — with `describe()` and
 * `lint()` taken from the NEW code — reproduces the OLD hex exactly, for every plan here.
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

/** SHA-256 over the SVG + `describe()` + `lint()` of one example, as measured at v1.30.0. */
const BASELINE: [string, string][] = [
  ["laneway-house", "e306d63d953e0f7740626e188765870024f7479fe61fd482fd209017153128f8"],
  ["studio", "7816107d209b9ef70b49ee9ee0a2092bf7604224733f2f483ce968197f11d138"],
  ["gallery-l", "32666c41627873f63030c0621edf31bae42a4e1f7fa0fc3ff1ddc83674b89878"],
  ["aquarium", "b55a84953b7fa18a892cf324e0d9fc72eb06342aeb90dd498231a61f6ec07ddf"],
];

/** The SUMMARY half of the same law — see the header. Unchanged since the measurement. */
const SEMANTIC_BASELINE: [string, string][] = [
  ["laneway-house", "ac2df20e15d2e4fbcc73e34a15d4e34578aa89a859860561b85361db170040b6"],
  ["studio", "b065cbe49d364414b340639fc06922eb14f472c9f4470134bb6f2b4489ada364"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["aquarium", "2cc0778dbc3b1127e0e478d8e08d12a766de6a73458748ee40bd5f43473f1e1f"],
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
