/**
 * Issue #364, part 1 (`W_FURNITURE_ON_STAIR`, G9): a piece on a flight's footprint or on a landing
 * the flight owes, and `finish`'s furnish stage keeping off both. The defect-corpus pairs
 * (`stair-safety/furniture-on-flight`, `furniture-on-landing`) hold the code to a clean twin; this
 * file holds the issue's plan, what the rule reads and what it declines.
 */

import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, finish, lint } from "../src/index.js";
import { codesOf } from "../src/finish.js";
import { furnishStage } from "../src/furnish.js";
import { resolvePlan } from "../src/analyze.js";
import type { RFurniture, RStair } from "../src/ir.js";
import { TASTE_SOURCES, TASTE_WORLD } from "./taste-sources.js";

const CODE = "W_FURNITURE_ON_STAIR";
const on = (src: string, profile?: string): Diagnostic[] =>
  lint(src, profile ? { profile } : {}).filter((d) => d.code === CODE);

/** The plan of issue #364, as filed. */
const ISSUE = `plan "Stair in the living room" {
  units mm
  room id=hall at (0,0) size 4000x2000 label "Hall" uses hall
  room id=liv at (0,2000) size 4000x4000 label "Living" uses living
  walls from rooms exterior 300 partition 100
  door on hall.top at center width 1000 swing into hall
  door between hall and liv at 2000 from start width 900 swing into liv
  window on liv.bottom width 2000
  stair id=s1 at (2500,2500) size 1000x3000 dir up
}
`;

/** A 6000 × 5000 hall with a flight rising from y 3500 at its south end to y 500 at its north. */
const hall = (body: string, stair = "stair id=s1 at (1000,500) size 1000x3000 dir up"): string => `plan "P" {
  units mm
  room id=hall at (0,0) size 6000x5000 label "Hall" uses hall
  walls from rooms exterior 200 partition 100
  door on hall.bottom at 4500 from start width 1000 swing into hall
  window on hall.top at 4500 from start width 1500
  ${stair}
  ${body}
}`;

const stairOf = (src: string): RStair => resolvePlan(src).ir!.elements.find((e): e is RStair => e.kind === "stair")!;
const piecesOf = (src: string): RFurniture[] =>
  resolvePlan(src).ir!.elements.filter((e): e is RFurniture => e.kind === "furniture");
const overlaps = (f: RFurniture, s: RStair): boolean =>
  f.at.x < s.at.x + s.size.w && f.at.x + f.size.w > s.at.x && f.at.y < s.at.y + s.size.h && f.at.y + f.size.h > s.at.y;

suite("the plan of issue #364", () => {
  const before = ISSUE.replace(
    "  stair id=s1",
    "  furniture sofa in liv anchor right flush size 900x2000 rotate 90\n  furniture coffee_table in liv anchor right flush inset 1300 size 600x1000 rotate 90\n  stair id=s1",
  );

  it("reports both pieces the old stage wrote on the flight, with what each covers", () => {
    expect(on(before).map((d) => d.message)).toEqual([
      'Furniture "sofa" stands on the stair in "Living": it covers 550 × 1500 mm of the flight, where less than 2000 mm of headroom is left.',
      'Furniture "coffee_table" stands on the stair in "Living": it covers 50 × 1000 mm of the flight, where less than 2000 mm of headroom is left.',
    ]);
    expect(on(before)[0]!.hints![0]).toContain(
      "`s1` with too little headroom to stand under (x 2500–3500, y 3500–5500)",
    );
  });

  it("is furnished off the flight, and the result lints as it did but for the furniture", () => {
    const out = finish(ISSUE, { only: "furnish" });
    expect(out.changes.map((c) => c.text)).toEqual([
      "furniture sofa in liv anchor left flush size 900x2000 rotate 270",
      "furniture coffee_table in liv anchor left flush inset 1300 size 600x1000 rotate 270",
    ]);
    const stair = stairOf(out.source);
    for (const f of piecesOf(out.source)) expect(overlaps(f, stair), f.category).toBe(false);
    expect(on(out.source)).toEqual([]);
  });

  it("the stage's own first proposal clears the flight: the gate has nothing to refuse", () => {
    const memo = new Map();
    const stage = furnishStage(ISSUE, {}, (s) => codesOf(s, {}, memo));
    expect(stage.checks).toBe(1);
  });
});

suite("a clean plan", () => {
  it("has no finding without furniture, and none for a piece beside the flight", () => {
    expect(on(ISSUE)).toEqual([]);
    expect(on(hall("furniture sofa at (2000,1000) size 900x2000"))).toEqual([]);
  });

  it("a piece touching the flight's edge is not on it; 2 mm over is", () => {
    expect(on(hall("furniture sofa at (2000,1000) size 900x2000")).length).toBe(0);
    expect(on(hall("furniture sofa at (1998,1000) size 900x2000")).length).toBe(1);
  });
});

suite("the flight", () => {
  /** A flight rising from y 3500 to y 500: under 2 m of headroom from y 1500 down. */
  const STAIR = "stair id=s1 at (3000,500) size 1000x3000 dir up";

  it("reads a rising flight only where a person cannot stand under it", () => {
    expect(on(hall("furniture wardrobe at (3000,500) size 1000x600", STAIR))).toEqual([]);
    expect(on(hall("furniture wardrobe at (3000,2800) size 1000x600", STAIR))[0]!.message).toContain("of the flight");
    // The boundary: y 1500 is 2000 mm of run from the foot.
    expect(on(hall("furniture wardrobe at (3000,900) size 1000x600", STAIR))).toEqual([]);
    expect(on(hall("furniture wardrobe at (3000,902) size 1000x600", STAIR))).toHaveLength(1);
  });

  it("the storey's authored height moves that line: a higher storey leaves more of the flight clear", () => {
    const tall = hall("furniture wardrobe at (3000,1600) size 1000x600", STAIR).replace(
      "units mm",
      "units mm\n  height 6000",
    );
    expect(on(hall("furniture wardrobe at (3000,1600) size 1000x600", STAIR))).toHaveLength(1);
    expect(on(tall)).toEqual([]);
  });

  it("a flight coming down is a stairwell: all of its footprint is read", () => {
    const down = "stair id=s1 at (3000,500) size 1000x3000 dir down";
    const [d] = on(hall("furniture wardrobe at (3000,3000) size 1000x400", down));
    expect(d!.message).toBe(
      'Furniture "wardrobe" stands on the stair in "Hall": it covers 1000 × 400 mm of the stairwell.',
    );
    expect(on(hall("furniture wardrobe at (3000,600) size 1000x400", down))).toHaveLength(1);
    expect(d!.hints![0]).toContain("the stairwell of `s1` (x 3000–4000, y 500–3500)");
  });

  it("reads every layer: a rug on the treads and a wall cabinet over them are on the flight", () => {
    expect(on(hall("furniture rug at (1000,1000) size 1000x1000")).length).toBe(1);
    expect(on(hall("furniture wall_cabinet at (1000,2000) size 1000x350")).length).toBe(1);
  });

  it("reports a piece once a stair, and once on each of two stairs it stands on", () => {
    const two = hall("stair id=s2 at (2000,500) size 1000x3000 dir up\n  furniture sofa at (1500,1000) size 1000x900");
    expect(on(two).length).toBe(2);
  });

  it("the words carry the storey on a plan of several, and no id", () => {
    const src = `plan "P" {
  units mm
  level 0 "Ground" {
    room id=hall at (0,0) size 6000x5000 label "Hall" uses hall
    walls from rooms exterior 200 partition 100
    door on hall.bottom at 4500 from start width 1000 swing into hall
    stair id=s1 at (1000,500) size 1000x3000 dir up
  }
  level 1 "Upper" {
    room id=top at (0,0) size 6000x5000 label "Upper hall" uses circulation
    walls from rooms exterior 200 partition 100
    stair id=s1 at (1000,500) size 1000x3000 dir down
    furniture sofa at (1000,1000) size 900x2000
  }
}`;
    const [d] = on(src);
    expect(d!.message).toBe(
      'Furniture "sofa" stands on the stair in "Upper hall" on level 1: it covers 900 × 2000 mm of the stairwell.',
    );
    expect(d!.message).not.toContain("s1");
  });
});

suite("the landing", () => {
  it("is as wide as the flight and as deep as it is wide, past the end it is entered from", () => {
    const at = (x: number, y: number): string => `furniture bookcase at (${x},${y}) size 400x300`;
    expect(on(hall(at(1000, 4000)))[0]!.message).toBe(
      'Furniture "bookcase" stands on the landing at the foot of the stair in "Hall": a landing as long as the flight is wide, 1000 mm, stays clear of furniture.',
    );
    expect(on(hall(at(1000, 4000)))[0]!.hints).toEqual([
      "Move or resize it so it clears the floor beyond the foot of `s1` (x 1000–2000, y 3500–4500), or move the stair.",
    ]);
    expect(on(hall(at(600, 4000)))).toEqual([]); // beside it, to the west
    expect(on(hall(at(2000, 4000)))).toEqual([]); // beside it, to the east
    expect(on(hall(at(1000, 4500)))).toEqual([]); // past its far end
  });

  it("the end a flight comes down to here is its head", () => {
    const down = "stair id=s1 at (1000,1500) size 1000x3000 dir down";
    expect(on(hall("furniture bookcase at (1000,800) size 400x300", down))[0]!.message).toContain(
      "the landing at the head of",
    );
  });

  it("is read only as deep as its floor stands clear: past the wall that cuts it short is not on it", () => {
    const cut = `wall id=c partition thickness 100 { (200,3800) (5800,3800) }\n  furniture bookcase at (1000,4000) size 400x300`;
    expect(on(hall(cut))).toEqual([]);
    expect(on(hall(cut.replace("(1000,4000)", "(1000,3550)")))).toHaveLength(1);
  });

  it("asks a building other than a dwelling for 1200 mm", () => {
    const office = hall("furniture bookcase at (1000,4600) size 400x100").replace(
      'label "Hall" uses hall',
      'label "Office" uses office',
    );
    expect(on(office)[0]!.message).toContain("1200 mm");
    expect(on(office, "residential-basic")).toEqual([]);
  });

  it("does not read a rug, which is walked on, or a wall cabinet, which hangs above it", () => {
    expect(on(hall("furniture rug at (1000,3800) size 1000x600"))).toEqual([]);
    expect(on(hall("furniture wall_cabinet at (1000,3800) size 1000x350"))).toEqual([]);
  });
});

suite("finish keeps off the floor a flight claims", () => {
  /** A flight at x 3100-4000: a wardrobe at the east wall would fit, its front on the flight. */
  const BEDROOM = `plan "P" {
  units mm
  room id=r at (0,0) size 5000x4000 label "R" uses bedroom
  walls from rooms exterior 200 partition 100
  door on r.bottom at 1000 from start width 900 swing into r
  window on r.top at 1000 from start width 1000
  stair id=s1 at (3100,300) size 900x3000 dir up
}
`;

  it("keeps off the whole footprint, the high end of a rising flight the rule leaves alone included", () => {
    // A west wall flight 1000 mm wide: the wardrobe the rule would accept at its high end is not written.
    for (const src of [BEDROOM, BEDROOM.replace("at (3100,300)", "at (3900,300)")]) {
      const out = finish(src, { only: "furnish" });
      const stair = stairOf(out.source);
      for (const f of piecesOf(out.source)) expect(overlaps(f, stair), f.category).toBe(false);
    }
  });

  it("says so when the stair is what leaves no room", () => {
    const tight = `plan "P" {
  units mm
  room id=r at (0,0) size 2000x2400 label "R" uses living
  walls from rooms exterior 200 partition 100
  door on r.bottom at 1000 from start width 800 swing into r
  stair id=s1 at (500,200) size 1000x2000 dir up
}
`;
    const reasons = finish(tight, { only: "furnish" }).unresolved.map((n) => n.reason);
    expect(reasons.join(" ")).toContain("clears its walls, its doors, its stair and the pieces before it");
  });

  it("no piece stands on the landing either", () => {
    const src = hall("").replace("uses hall", "uses living");
    const out = finish(src, { only: "furnish" });
    expect(out.changes.length).toBeGreaterThan(0);
    expect(on(out.source)).toEqual([]);
  });

  it("no piece's front strip lands on the flight: that is floor it is used from", () => {
    const out = finish(BEDROOM, { only: "furnish" });
    expect(out.changes.map((c) => c.text)).toEqual([
      "furniture bed in r anchor top-left flush size 2000x1500 rotate 270",
      "furniture wardrobe in r anchor bottom flush size 1200x600 rotate 180",
    ]);
  });

  it("never gains the code, on a plan that already has it either", () => {
    const has = ISSUE.replace("  stair id=s1", "  furniture sofa at (2600,3000) size 800x2000\n  stair id=s1");
    const out = finish(has.replace("uses hall", "uses bedroom"), { only: "furnish" });
    expect(on(out.source).length).toBe(1);
  });
});

suite("the hard laws", () => {
  it("fires on no shipped example, defect-corpus or taste-corpus plan but this card's two cases", () => {
    const firing = TASTE_SOURCES.filter((t) => lint(t.src, { world: TASTE_WORLD }).some((d) => d.code === CODE)).map(
      (t) => t.name,
    );
    expect(firing).toEqual([
      "test/defect-corpus/stair-safety/furniture-on-flight.arch",
      "test/defect-corpus/stair-safety/furniture-on-landing.arch",
    ]);
  });
});
