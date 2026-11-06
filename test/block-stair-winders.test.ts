/**
 * Winders on a block stair: `landing … winders <n>` divides a quarter-turn landing, `width` ×
 * `width`, into `n` tapered steps fanning from its inner corner. Expectations are derived from the
 * plain numbers of {@link L_STAIR} (the issue's quarter-turn: a flight rising north into the landing
 * at (1500,100), then a flight running west), never from what the resolver made of them.
 *
 * The landing is entered across its bottom side and left across its left side, so its inner corner,
 * the one those two sides share, is (1500, 1100), and every tread line starts there and ends on the
 * landing's top side (y 100) or right side (x 2500).
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, type Diagnostic, format, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import type { RStair } from "../src/ir.js";
import { verticalsOf } from "../src/vertical.js";
import { hallPlan, L_STAIR, U_STAIR, type BlockStair } from "./block-stair-plans.js";

/** The block of `s` with `winders` on its first landing. */
function winderBlock(s: BlockStair, winders: string, id = "s"): string {
  const lines = s.pieces.map(
    (p, i) =>
      `      ${i % 2 === 0 ? "flight" : "landing"} at (${p[0]},${p[1]}) size ${p[2]}x${p[3]}${i === 1 ? ` winders ${winders}` : ""}`,
  );
  return `    stair id=${id} dir up width ${s.width} {\n${lines.join("\n")}\n    }`;
}

const winderPlan = (winders: string, head = "", s: BlockStair = L_STAIR): string =>
  hallPlan(winderBlock(s, winders), head);

const errors = (src: string): Diagnostic[] =>
  compile(src, { noCache: true }).diagnostics.filter((d: Diagnostic) => d.severity === "error");

const stairOf = (src: string): RStair => {
  const { ir } = resolvePlan(src);
  return verticalsOf(ir!).find((v) => v.kind === "stair") as RStair;
};

const stairLines = (src: string) =>
  compile(src, { noCache: true })
    .scene!.nodes.filter((n) => n.layerName === "A-FLOR-STRS")
    .flatMap((n) => (n.prim.t === "line" ? [{ a: n.prim.a, b: n.prim.b }] : []));

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

describe("winders parse, print and resolve", () => {
  it("a landing takes `winders <n>` and keeps it through resolve and describe", () => {
    const src = winderPlan("4");
    expect(errors(src)).toEqual([]);
    expect(stairOf(src).landings![0]!.winders).toBe(4);
    const v = describePlan(src).verticals!.find((x) => x.id === "s")!;
    expect(v.landings![0]).toMatchObject({ bbox: { x: 1500, y: 100, w: 1000, h: 1000 }, winders: 4 });
  });

  it("a level landing reports no `winders` key at all", () => {
    const src = hallPlan(winderBlock(L_STAIR, "4").replace(" winders 4", ""));
    const v = describePlan(src).verticals!.find((x) => x.id === "s")!;
    expect("winders" in v.landings![0]!).toBe(false);
  });

  it("the formatter writes the clause back", () => {
    expect(format(winderPlan("3"))).toContain("landing at (1500, 100) size 1000x1000 winders 3");
  });

  it("an expression is read", () => {
    expect(stairOf(winderPlan("n", "  let n = 2 + 1\n")).landings![0]!.winders).toBe(3);
  });
});

describe("winders draw as a fan from the inner corner", () => {
  for (const n of [2, 3, 4, 6]) {
    it(`${n} winders draw ${n - 1} tread lines, each from (1500, 1100) to the far sides`, () => {
      const fan = stairLines(winderPlan(String(n))).filter((l) => near(l.a.x, 1500) && near(l.a.y, 1100));
      const treads = fan.filter((l) => near(l.b.y, 100) || near(l.b.x, 2500));
      expect(treads).toHaveLength(n - 1);
      // Equal angles over the quarter turn, measured from the entry side (pointing north).
      const angles = treads
        .map((l) => Math.atan2(l.b.x - l.a.x, -(l.b.y - l.a.y)))
        .sort((p, q) => p - q)
        .map((t) => (t * 180) / Math.PI);
      angles.forEach((deg, k) => {
        expect(deg).toBeCloseTo((90 * (k + 1)) / n, 6);
      });
    });
  }

  it("a level landing draws no fan", () => {
    const src = hallPlan(winderBlock(L_STAIR, "4").replace(" winders 4", ""));
    const fan = stairLines(src).filter((l) => near(l.a.x, 1500) && near(l.a.y, 1100) && !near(l.b.x, l.a.x));
    expect(fan.filter((l) => near(l.b.y, 100) || near(l.b.x, 2500))).toHaveLength(0);
  });
});

describe("winders are refused where they cannot stand", () => {
  it("not on a flight", () => {
    const src = hallPlan(
      winderBlock(L_STAIR, "3").replace(
        "flight at (1500,1100) size 1000x1000",
        "flight at (1500,1100) size 1000x1000 winders 2",
      ),
    );
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
  });

  for (const bad of ["1", "9", "2.5", "0"]) {
    it(`not ${bad}: a whole number from 2 to 8`, () => {
      const e = errors(winderPlan(bad));
      expect(e.map((d) => d.code)).toEqual(["E_STAIR_PIECES"]);
      expect(e[0]!.message).toContain("winders");
    });
  }

  it("not on a half-turn landing", () => {
    const e = errors(winderPlan("3", "", U_STAIR));
    expect(e.map((d) => d.code)).toEqual(["E_STAIR_PIECES"]);
  });

  it("not on a landing larger than the flight width", () => {
    const wide: BlockStair = {
      ...L_STAIR,
      pieces: [
        [1500, 1100, 1200, 1000],
        [1500, 100, 1200, 1000],
        [100, 100, 1400, 1000],
      ],
    };
    const e = errors(winderPlan("3", "", wide));
    expect(e.map((d) => d.code)).toEqual(["E_STAIR_PIECES"]);
    expect(e[0]!.message).toContain("square");
  });
});

describe("winders are goings to the steepness check", () => {
  const steep = (src: string) => lint(src).filter((d) => d.code === "W_STAIR_TOO_STEEP");

  it("a level landing replaces one going: 2400 mm of flights is short for 2750 mm", () => {
    // 13 risers of at most 220 mm, 12 goings, one fewer for the landing: 11 × 220 = 2420 > 2400.
    const src = hallPlan(winderBlock(L_STAIR, "4").replace(" winders 4", ""), "  height 2750\n");
    expect(steep(src)).toHaveLength(1);
  });

  it("four winders are four goings: 8 × 220 = 1760 mm of flights is enough", () => {
    expect(steep(winderPlan("4", "  height 2750\n"))).toEqual([]);
  });

  it("the message counts the winders when the flights are still short", () => {
    const short: BlockStair = {
      ...L_STAIR,
      pieces: [
        [1500, 1100, 1000, 600],
        [1500, 100, 1000, 1000],
        [900, 100, 600, 1000],
      ],
    };
    const w = steep(winderPlan("2", "  height 2750\n", short));
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain("2 winders");
  });
});
