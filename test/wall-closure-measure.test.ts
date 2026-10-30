/**
 * Issue #346, card G5 (wall closure, measured first). Three plans with a closure defect, each
 * otherwise clean, and the codes lint and `describe` raise on them today:
 *
 *  - an exterior ring left open by a 1000 mm gap: NO lint code; `describe` only omits the gross
 *    area with the reason `no-closed-exterior-ring`;
 *  - an authored wall stopping short of a derived partition, and a partition stopping short of
 *    the shell: `W_WALL_END_SHORT` (added by this card) and nothing else.
 *
 * The rule measures the DRAWN slit: the renderer caps a free end square, half the wall's
 * thickness past its last point, so a wall 100 mm thick that starts 230 mm from a wall at 0
 * (200 mm thick, inner face at 100) is drawn from 180, an 80 mm slit. The SVG assertions below
 * prove the reported millimetres are the ones on the sheet.
 *
 * Pinned so a regression in either direction (a rule that stops seeing a slit, one that starts
 * firing on a clean twin) goes red.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, DEFAULT_RULESET, lint, type LintRuleset } from "../src/index.js";

const read = (p: string): string => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const codes = (src: string, ruleset?: Partial<LintRuleset>): string[] =>
  lint(src, ruleset ? { ruleset } : {}).map((d) => d.code as string);
const svgOf = (src: string): string => {
  const r = compile(src);
  return (r as { svg?: string }).svg ?? "";
};

const SHORT = "defect-corpus/space-not-enclosed/wall-end-short";
const DERIVED = "defect-corpus/space-not-enclosed/wall-end-short-derived";
const RING = "fixtures/wall-closure/open-ring.arch";

/** A bare plan of two collinear walls, thickness 100, ends at the given x's. */
const collinear = (leftEnd: number, rightStart: number, extra = ""): string => `plan "P" {
  units mm
  grid 10
  wall id=a partition thickness 100 { (0,0) (${leftEnd},0) }
  wall id=b partition thickness 100 { (${rightStart},0) (8000,0) }
${extra}}`;

suite("wall closure, measured (G5, issue #346)", () => {
  it("a partition whose drawn end is 80 mm from the shell raises W_WALL_END_SHORT and only that", () => {
    const src = read(`${SHORT}.arch`);
    expect(codes(src)).toEqual(["W_WALL_END_SHORT"]);
    const [d] = lint(src);
    expect(d?.message).toBe(
      "A partition on the line x 4000 ends 80 mm short of an exterior wall on the line y 0, as drawn. The two do not meet, so the plan shows a slit of 80 mm between them and the walls do not close.",
    );
    // The sheet: the partition's drawn end is y 180, the shell's inner face y 100.
    expect(svgOf(src)).toContain("M 3950,180 L 4050,180 L 4050,2100 L 3950,2100 Z");
    expect(svgOf(src)).toContain("L 6750,100 L 6750,-100");
    // The clean twin is drawn flush on the face (4050,100 .. 3950,100 in one outline).
    expect(codes(read(`${SHORT}.clean.arch`))).toEqual([]);
    expect(svgOf(read(`${SHORT}.clean.arch`))).toContain("L 4050,100 L 4050,2100 L 3950,2100 L 3950,100");
  });

  it("an authored wall 80 mm from a derived partition raises it too, naming no id in the message", () => {
    const src = read(`${DERIVED}.arch`);
    expect(codes(src)).toEqual(["W_WALL_END_SHORT"]);
    const [d] = lint(src);
    expect(d?.message).toContain("80 mm short");
    expect(d?.message).toContain("on the line y 2500");
    expect(d?.message).not.toContain("cross");
    // The sheet: the cross wall's drawn end is x 4130, the derived partition's face x 4050.
    expect(svgOf(src)).toContain("L 4130,2550 L 4130,2450");
    expect(codes(read(`${DERIVED}.clean.arch`))).toEqual([]);
  });

  it("an open exterior ring raises no lint code; describe names it as an omitted gross area", () => {
    const src = read(RING);
    expect(codes(src)).toEqual([]);
    const totals = (describe(src) as { totals: Record<string, unknown> }).totals;
    expect(totals.gross_internal_area_omitted).toBe("no-closed-exterior-ring");
  });

  it("a wall drawn flush on, or overlapping, another is a join, not a slit", () => {
    // Centreline ends 150 mm from the shell centre, 100 mm thick: the cap lands on the inner face.
    const flush = read(`${SHORT}.arch`).replace("(4000,230)", "(4000,150)");
    expect(codes(flush)).toEqual([]);
    // Overlapping the shell's body.
    expect(codes(read(`${SHORT}.arch`).replace("(4000,230)", "(4000,140)"))).toEqual([]);
    // Two collinear walls whose caps overlap (centreline ends 80 mm apart, 100 mm thick).
    expect(codes(collinear(3960, 4040))).toEqual([]);
  });

  it("the reported millimetres are the drawn slit, from cap to cap", () => {
    // Centrelines 200 apart, caps 50 each: 100 mm drawn. One finding for the pair, not two.
    const found = lint(collinear(3900, 4100)).filter((d) => d.code === "W_WALL_END_SHORT");
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("ends 100 mm short");
    expect(svgOf(collinear(3900, 4100))).toContain("4050,");
    // One millimetre over the default reach is a stub.
    expect(codes(collinear(3890, 4100))).toEqual([]);
  });

  it("the reach is bounded: a slit over wallGapMm is a stub, and null turns the rule off", () => {
    const src = read(`${SHORT}.arch`);
    expect(codes(src.replace("(4000,230)", "(4000,300)"))).toEqual([]);
    expect(codes(src, { wallGapMm: null })).toEqual([]);
    expect(DEFAULT_RULESET.wallGapMm).toBe(100);
    // A wider reach finds the wider slit.
    expect(codes(src.replace("(4000,230)", "(4000,300)"), { wallGapMm: 200 })).toEqual(["W_WALL_END_SHORT"]);
  });

  it("a huge wallGapMm is clamped: the scan is a count, not the ruleset's figure", () => {
    const src = read(`${SHORT}.arch`).replace("(4000,230)", "(4000,2500)");
    const t0 = Date.now();
    expect(codes(src, { wallGapMm: 1e7 })).not.toContain("W_WALL_END_SHORT");
    expect(Date.now() - t0).toBeLessThan(2000);
    // A slit inside the clamp is still found at a huge setting.
    expect(codes(read(`${SHORT}.arch`), { wallGapMm: 1e7 })).toEqual(["W_WALL_END_SHORT"]);
  });

  it("a curved wall is neither judged at its end nor a target", () => {
    const toArc = `plan "P" {
  units mm
  grid 10
  wall id=drum partition thickness 1200 { (0,3000) arc (6000,3000) radius 3000 }
  wall id=spoke partition thickness 200 { (6200,3000) (9000,3000) }
}`;
    expect(codes(toArc)).not.toContain("W_WALL_END_SHORT");
    const src = `plan "P" {
  units mm
  grid 10
  wall id=shell exterior thickness 200 { (0,0) (8000,0) }
  wall id=curve partition thickness 100 { (4000,230) arc (4000,2000) radius 900 }
}`;
    expect(codes(src)).toEqual([]);
  });

  it("a `place`d wall is judged in the plan's frame, turned or mirrored", () => {
    const body = `  component wing() {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) }
    wall id=p partition thickness 100 { (4000,230) (4000,2000) }
  }
`;
    for (const placement of ["", " rotate 90", " rotate 270", " mirror x", " rotate 180 mirror y"]) {
      const src = `plan "P" {\n  units mm\n  grid 10\n${body}  place wing() as g at (0,0)${placement}\n}`;
      const found = lint(src).filter((d) => d.code === "W_WALL_END_SHORT");
      expect(found, placement).toHaveLength(1);
      expect(found[0]?.message, placement).toContain("ends 80 mm short");
    }
  });

  it("a multi-storey plan names the storey", () => {
    const wall = `    wall id=shell exterior thickness 200 { (0,0) (8000,0) }
    wall id=p partition thickness 100 { (4000,230) (4000,2000) }`;
    const src = `plan "P" {
  units mm
  grid 10
  level 0 {
${wall}
  }
  level 1 {
${wall}
  }
}`;
    const found = lint(src).filter((d) => d.code === "W_WALL_END_SHORT");
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.message.includes("on level 1"))).toBe(true);
  });
});
