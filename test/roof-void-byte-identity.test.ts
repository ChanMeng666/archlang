/**
 * The byte-identity law for `roof` and `void` (v1.29).
 *
 * **Every new language form ships with a byte-identity law, pinned by test: a plan that
 * does not use it renders, describes and lints exactly as before.** `site`, the door
 * kinds, `zone`, `paper`, `polygon` and `arc` each have one; these are theirs.
 *
 * ## Why the hashes are hardcoded rather than computed from a baseline
 *
 * A test that compiled each example twice and compared would prove determinism, not
 * identity — it would stay green through a change that moved every byte. The numbers
 * below were measured against **`main`'s `src/`** (v1.28.0, the branch point), by
 * checking that tree out into this worktree and running the exact `digest()` below on
 * it, so they are a genuine before-and-after: if one moves, the two new elements changed
 * a drawing that never mentions them, and that is a finding to explain rather than a diff
 * to bless. (`git stash` is shared across worktrees, so `git checkout main -- src/` and
 * back is the safe form of the same measurement.)
 *
 * A note for whoever measures the next one: take the baseline with the SAME `digest()`
 * body the test will run, not a lookalike written in a throwaway script. The first
 * attempt here used a scratch script whose payload separator differed by one character,
 * which produced four digests that all "failed" while every underlying artifact — SVG,
 * `describe()`, `lint()` — was in fact byte-identical to main. The scare cost more time
 * than the law it was checking.
 *
 * The payload is deliberately the WHOLE agent-facing surface — the SVG, `describe()` and
 * `lint()` — not just the drawing. A new element that quietly appended an empty key to
 * every summary, or that shifted a diagnostic's order, would leave the SVG untouched and
 * still be a behaviour change for every consumer of `arch describe --json`.
 *
 * The four examples are the ones this track does NOT edit (`bungalow` gains a `roof` and
 * `two-storey` a `void`, so both are excluded on purpose) and are import-free, so no
 * `World` is needed. They span the shapes most likely to be disturbed: an all-rectangle
 * dwelling, the flagship, a CONCAVE polygon plan (whose ring code the roof's offset shares
 * a module with) and a CURVED sheet plan on `paper` (whose auto-fit reads the same
 * `planBounds` the roof now contributes to).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, planToJson } from "../src/index.js";

/** SHA-256 over the SVG + `describe()` + `lint()` of one example, as measured on main. */
const BASELINE: [string, string][] = [
  ["laneway-house", "1c906547eda9568a23406d28a7beb86e92933254268725e44c9f102d3c6e87b2"],
  ["studio", "025e7c127ba0e3f65850aced8d53b62779cb946e0e989df2c9981f838c086fb8"],
  ["courtyard-house", "566b6e1d12d3f3db414788da4e749bd28df0e46a4e46b3e94e38378cff5a65fb"],
  ["aquarium", "7e871e74f0fb756d9408a357a80add0061b71f023e79bbc29e547424f8f52cd3"],
];

/** The exact payload the baseline digests were taken over — do not change its shape. */
function digest(src: string): string {
  const { svg } = compile(src, { noCache: true });
  const payload = [svg, JSON.stringify(describePlan(src)), JSON.stringify(lint(src))].join("\n \n");
  return createHash("sha256").update(payload).digest("hex");
}

describe("roof/void byte-identity — a plan that uses neither is unchanged", () => {
  for (const [name, sha] of BASELINE) {
    it(`${name}.arch renders, describes and lints exactly as on main`, () => {
      const src = readFileSync(`examples/${name}.arch`, "utf8");
      expect(src).not.toMatch(/(?<![\w-])(roof|void)(?![\w-])/);
      expect(
        digest(src),
        `${name}.arch changed. Nothing on this branch touches it, so either a shared code path ` +
          `moved (the label-placement obstacle set, the nav-grid obstacle list, planBounds, the ` +
          `describe() key order) or an element table grew a field every plan pays for. Find out ` +
          `WHICH before updating this digest — the point of the number is that it does not move.`,
      ).toBe(sha);
    });
  }
});

describe("roof/void are absent from the Plan JSON projection", () => {
  const PLAN = (extra: string): string =>
    `plan "J" {\n  units mm\n` +
    `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
    `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living\n` +
    `  door id=d on w1 at 50% width 900\n` +
    `${extra}}\n`;

  it("adding a roof and a void does not change one byte of `planToJson`", () => {
    // The strongest available form of "the schemas are byte-unchanged": a projection that
    // had learned about either element would differ here, and `schemas/plan.schema.json`
    // is generated from the same `PLAN_JSON_SCHEMA` the projection is written against.
    const bare = planToJson(PLAN(""));
    const both = planToJson(PLAN(`  roof overhang 600\n  void id=well at (2000,1500) size 1500x1500\n`));
    expect(bare.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(both.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(JSON.stringify(both.json)).toBe(JSON.stringify(bare.json));
  });

  it("neither keyword appears in either committed schema", () => {
    for (const f of ["schemas/plan.schema.json", "schemas/intent.schema.json"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/"(roof|void)"/);
    }
  });
});

describe("roof — additive to the drawing, but it does grow the page", () => {
  /** The same plan with and without a `roof overhang 600`. */
  const pair = (settings: string): [string, string] => {
    const body =
      `  units mm\n  north up\n${settings}` +
      `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
      `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living\n`;
    return [
      compile(`plan "R" {\n${body}}\n`, { noCache: true }).svg,
      compile(`plan "R" {\n${body}  roof overhang 600\n}\n`, { noCache: true }).svg,
    ];
  };

  /** Every CAD-layer group in the SVG, keyed by layer name. */
  const layers = (svg: string): Map<string, string> =>
    new Map([...svg.matchAll(/<g id="([^"]+)"[\s\S]*?<\/g>/g)].map((m) => [m[1]!, m[0]!]));

  it("on a `paper` plan, every drawn layer is byte-identical and only A-ROOF is new", () => {
    // With a sheet, the render sizes come from the PAPER, so nothing rescales and the
    // claim is exact: the roof adds a group and touches no other. This is the strong
    // form of "additive" — a roof that had moved a label, a wall or a dimension would
    // fail here rather than hide inside a page-size difference.
    const [bare, roofed] = pair(`  paper A3 landscape\n  scale 1:100\n`);
    const a = layers(bare);
    const b = layers(roofed);
    expect([...b.keys()].filter((k) => !a.has(k))).toEqual(["A-ROOF"]);
    for (const [name, group] of a) expect(b.get(name), `layer ${name} moved`).toBe(group);
  });

  it("without `paper`, the eaves rescale the whole drawing — and that is the pre-existing rule", () => {
    // A plan with no sheet sizes every font and stroke from its own reference dimension
    // (`max(drawW, drawH)`), so ANY element that grows the extent rescales the drawing —
    // a far-flung `column` or a wide `dim` offset does exactly the same. Pinned rather
    // than papered over, so nobody reads the sheet-mode test above as a promise the
    // no-sheet path also makes.
    const [bare, roofed] = pair("");
    const fontOf = (svg: string): string => /font-size="([\d.]+)"[^>]*font-weight="600"/.exec(svg)![1]!;
    expect(Number(fontOf(roofed))).toBeGreaterThan(Number(fontOf(bare)));
  });
});
