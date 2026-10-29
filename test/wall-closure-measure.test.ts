/**
 * Issue #346, card G5 (wall closure, measured first). Three plans with a closure defect, each
 * otherwise clean, and the codes lint and `describe` raise on them today:
 *
 *  - an exterior ring left open by a 1000 mm gap: NO lint code; `describe` only omits the gross
 *    area with the reason `no-closed-exterior-ring`;
 *  - an authored wall stopping 80 mm short of a derived partition, and a partition stopping 80 mm
 *    short of the shell: `W_WALL_END_SHORT` (added by this card) and nothing else.
 *
 * Pinned so a regression in either direction (a rule that stops seeing a slit, one that starts
 * firing on the clean twin) goes red.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe, DEFAULT_RULESET, lint } from "../src/index.js";

const read = (p: string): string => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const codes = (src: string): string[] => lint(src).map((d) => d.code);

const SHORT = "defect-corpus/space-not-enclosed/wall-end-short";
const DERIVED = "defect-corpus/space-not-enclosed/wall-end-short-derived";
const RING = "fixtures/wall-closure/open-ring.arch";

suite("wall closure, measured (G5, issue #346)", () => {
  it("a partition 80 mm short of the shell raises W_WALL_END_SHORT and only that", () => {
    const src = read(`${SHORT}.arch`);
    expect(codes(src)).toEqual(["W_WALL_END_SHORT"]);
    const [d] = lint(src);
    expect(d?.message).toBe(
      "A partition ends 80 mm short of an exterior wall it runs toward, at (4000, 180). The two do not meet, so the plan shows a slit of 80 mm between them and the walls do not close.",
    );
    expect(codes(read(`${SHORT}.clean.arch`))).toEqual([]);
  });

  it("an authored wall 80 mm short of a derived partition raises it too, naming no id in the message", () => {
    const src = read(`${DERIVED}.arch`);
    expect(codes(src)).toEqual(["W_WALL_END_SHORT"]);
    const [d] = lint(src);
    expect(d?.message).toContain("80 mm short");
    expect(d?.message).not.toContain("cross");
    expect(codes(read(`${DERIVED}.clean.arch`))).toEqual([]);
  });

  it("an open exterior ring raises no lint code; describe names it as an omitted gross area", () => {
    const src = read(RING);
    expect(codes(src)).toEqual([]);
    const totals = (describe(src) as { totals: Record<string, unknown> }).totals;
    expect(totals.gross_internal_area_omitted).toBe("no-closed-exterior-ring");
  });

  it("the reach is bounded: a slit over wallGapMm is a stub, and null turns the rule off", () => {
    const src = read(`${SHORT}.arch`);
    const wide = src.replace("(4000,180)", "(4000,300)");
    expect(codes(wide)).toEqual([]);
    expect(lint(src, { ruleset: { wallGapMm: null } }).map((d) => d.code)).toEqual([]);
    expect(DEFAULT_RULESET.wallGapMm).toBe(100);
  });

  it("two walls ending toward each other on one line are one finding", () => {
    const src = `plan "P" {
  units mm
  grid 10
  wall id=a partition thickness 100 { (0,0) (3960,0) }
  wall id=b partition thickness 100 { (4040,0) (8000,0) }
}`;
    expect(codes(src).filter((c) => c === "W_WALL_END_SHORT")).toHaveLength(1);
  });
});
