/**
 * Plan-soundness PS2.67 (`W_BED_UNDERSIZED`): a `bed`, `double_bed` or `bunk_bed` drawn under the
 * smallest standard UK bed (1900 × 750 mm, Which? 2026, graded [M]); never a `crib` or a `cot`. What
 * it fires on, its boundaries, its words, the ruleset override, and that no shipped example warns
 * under the default profile (the rule is classified `invariant` in `test/d4-oracle.ts`).
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, DEFAULT_RULESET, lint, type LintRuleset } from "../src/index.js";
import { EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./d4-oracle.js";

const B = "W_BED_UNDERSIZED";
const bedroom = (piece: string): string => `plan "P" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=r_bed at (0,0) size 4000x4000 label "Bedroom" uses bedroom
  door id=d at (3000,4000) width 1000 wall shell
  ${piece}
}`;
const of = (piece: string, ruleset?: Partial<LintRuleset>): Diagnostic[] =>
  lint(bedroom(piece), ruleset ? { ruleset } : {}).filter((d) => d.code === B);

suite("W_BED_UNDERSIZED (PS2.67)", () => {
  it("defaults to the Which? small single: 1900 long, 750 wide", () => {
    expect(DEFAULT_RULESET.bedMinLengthMm).toBe(1900);
    expect(DEFAULT_RULESET.bedMinWidthMm).toBe(750);
  });

  it("fires on a short bed and a narrow one, naming the room, the figure, its source and the shortfall", () => {
    const [short] = of("furniture bed at (300,300) size 900x1500");
    expect(short?.message).toBe(
      "The bed in Bedroom is 1500 mm long, under the 1900 mm of the shortest standard bed (a UK single, 90 × 190 cm; Which? UK bed sizes): 400 mm short.",
    );
    const [narrow] = of("furniture bed at (300,300) size 700x1900");
    expect(narrow?.message).toContain("700 mm wide, under the 750 mm of the narrowest standard bed");
    expect(narrow?.message).toContain("50 mm short");
    expect(narrow?.message).not.toContain("long,");
  });

  it("is silent at the figures exactly, and for a UK single and the catalogue's default bed", () => {
    expect(of("furniture bed at (300,300) size 750x1900")).toEqual([]);
    expect(of("furniture bed at (300,300) size 900x1900")).toEqual([]);
    expect(of("furniture bed at (300,300)")).toEqual([]);
  });

  it("reads the longer side as the length, whichever way `size` or `rotate` puts it", () => {
    expect(of("furniture bed at (300,300) size 1900x900 rotate 90")).toEqual([]);
    // Transposed with no turn: `W_FOOTPRINT_TRANSPOSED`'s finding, not this rule's.
    expect(of("furniture bed at (300,300) size 1900x900")).toEqual([]);
    expect(of("furniture bed at (300,300) size 1500x900 rotate 90")).toHaveLength(1);
  });

  it("judges `double_bed` and `bunk_bed`, never `crib` or `cot`", () => {
    expect(of("furniture double_bed at (300,300) size 1400x1800")).toHaveLength(1);
    expect(of("furniture bunk_bed at (300,300) size 900x1700")).toHaveLength(1);
    expect(of("furniture crib at (300,300) size 700x1300")).toEqual([]);
    expect(of("furniture cot at (300,300) size 600x1200")).toEqual([]);
  });

  it("never quotes an assigned id in its message", () => {
    const [d] = of('furniture id=couch_1 bed at (300,300) size 700x1500 label "Couch"');
    expect(d?.message.startsWith("The Couch in Bedroom is")).toBe(true);
    expect(d?.message).not.toContain("couch_1");
  });

  it("takes a caller's figures, without Which?'s name, and `null` turns a finding off", () => {
    const [d] = of("furniture bed at (300,300) size 900x1900", { bedMinLengthMm: 2000 });
    expect(d?.message).toBe("The bed in Bedroom is 1900 mm long, under the 2000 mm of `bedMinLengthMm`: 100 mm short.");
    expect(of("furniture bed at (300,300) size 700x1500", { bedMinLengthMm: null })[0]?.message).not.toContain("long");
    expect(of("furniture bed at (300,300) size 700x1500", { bedMinLengthMm: null, bedMinWidthMm: null })).toEqual([]);
  });

  it("the row-6 clinic warns on each of its three 1500 × 700 couches drawn as `bed`", () => {
    const src = readFileSync(
      "docs/plans/plan-soundness/audits/first-contact-plans/2026-10-26-rerun-row6/6-clinic.arch",
      "utf8",
    );
    const ds = lint(src).filter((d) => d.code === B);
    expect(ds.map((d) => d.message.slice(0, 31))).toEqual([
      "The bed in Consulting 1 is 1500",
      "The bed in Consulting 2 is 1500",
      "The bed in Consulting 3 is 1500",
    ]);
  });

  it("no shipped example warns under the default profile", () => {
    for (const rel of SHIPPED_EXAMPLES) {
      const src = readFileSync(`examples/${rel}`, "utf8");
      expect(
        lint(src, { world: EXAMPLES_WORLD }).filter((d) => d.code === B),
        rel,
      ).toEqual([]);
    }
  });
});
