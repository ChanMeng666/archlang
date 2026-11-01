/**
 * `W_NO_ENTRANCE` on a multi-storey plan (#404): each storey it fires on is told which storey it is
 * and what is missing there, because the building may have a front door on another floor. Which
 * storeys warn did not change; `test/vertical.test.ts`, `test/vertical-room-shape.test.ts` and
 * `test/access-policy.test.ts` pin that.
 *
 * Every hint is taken at its word: the plan is edited the way the hint says and the warning goes.
 */

import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";

const CODE = "W_NO_ENTRANCE";

const of = (src: string) => lint(src).filter((d) => d.code === CODE);
const shell = (id: string, w = 6000, h = 4000): string =>
  `wall id=${id} exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }`;
const building = (...storeys: string[]): string =>
  `plan "Storeys" {\n  units mm\n${storeys
    .map((body, i) => `  level ${i + 1} "L${i + 1}" {\n${body}\n  }`)
    .join("\n")}\n}`;

const ground = (extra = ""): string => `    ${shell("s1")}
    room id=h at (0,0) size 6000x4000 label "Hall" uses hall
    door id=d on s1 at 2000 width 900
    ${extra}`;
const upper = (extra = ""): string => `    ${shell("s2")}
    room id=b at (0,0) size 6000x4000 label "Bedroom" uses bedroom
    ${extra}`;

const STAIR = (id: string, dir: string): string => `stair id=${id} at (3000,1000) size 1000x2800 dir ${dir}`;

/** A hall with the door, and a store with none: the stair stands in the store. */
const deadGround = (doorToStore: boolean): string => `    ${shell("s1", 8000)}
    wall id=p partition thickness 100 { (4000,0) (4000,4000) }
    room id=h at (0,0) size 4000x4000 label "Hall" uses hall
    room id=st at (4000,0) size 4000x4000 label "Store" uses storage
    door id=d on s1 at 2000 width 900
    ${doorToStore ? "door id=ds on p at 2000 width 900 swing into st" : ""}
    stair id=s at (5000,600) size 1000x2800 dir up`;
const wideUpper = (run: string, id = "s2"): string => `    ${shell(id, 8000)}
    room id=b at (0,0) size 8000x4000 label "Bedroom" uses bedroom
    ${run}`;

/** An L: the east half of the south stands in no room, and the stair lands there. */
const notchUpper = (
  nook: string,
): string => `    wall id=s2 exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=b polygon (0,0) (8000,0) (8000,3000) (4000,3000) (4000,6000) (0,6000) label "Bedroom" uses bedroom
    ${nook}
    stair id=s at (5500,3200) size 1000x2400 dir down`;
const notchGround = `    ${shell("s1", 8000, 6000)}
    room id=h at (0,0) size 8000x6000 label "Hall" uses hall
    door id=d on s1 at 2000 width 900
    stair id=s at (5500,3200) size 1000x2400 dir up`;

describe("W_NO_ENTRANCE says which storey and what is missing there", () => {
  it("a one-storey plan keeps its sentence, as does a plan of one `level` block", () => {
    const flat = `plan "Flat" {\n  units mm\n  ${shell("s1")}\n  room id=h at (0,0) size 6000x4000 label "Hall" uses hall\n}`;
    const one = building(`    ${shell("s1")}\n    room id=h at (0,0) size 6000x4000 label "Hall" uses hall`);
    for (const src of [flat, one]) {
      const [d] = of(src);
      expect(d?.message).toBe("The plan has no exterior door or opening — there is no way into the building.");
      expect(d?.hints).toEqual(["Add a `door` (or a cased `opening`) on an `exterior` wall."]);
    }
  });

  it("no shaft at all: the storey has neither a door nor a run", () => {
    const [d, ...rest] = of(building(ground(), upper()));
    expect(rest).toEqual([]);
    expect(d?.level).toBe(2);
    expect(d?.message).toBe(
      "Level 2 has no exterior door or opening of its own, and no stair, elevator or escalator joins it to another storey, so there is no way onto it.",
    );
    // The hint at its word: one id on both storeys.
    expect(of(building(ground(STAIR("st", "up")), upper(STAIR("st", "down"))))).toEqual([]);
  });

  it("a lower storey with no door of its own reads the same way", () => {
    const basement = `    ${shell("s0")}\n    room id=c at (0,0) size 6000x4000 label "Cellar" uses storage`;
    const [d, ...rest] = of(building(basement, ground()));
    expect(rest).toEqual([]);
    expect(d?.level).toBe(1);
    expect(d?.message).toContain("Level 1 has no exterior door or opening of its own");
  });

  it("a run on this storey alone: the two stairs do not share an id", () => {
    const src = building(ground(STAIR("up", "up")), upper(STAIR("dn", "down")));
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d?.message).toBe(
      "Level 2 has no exterior door or opening of its own, and its stair stops on no other storey, so nothing leads to it.",
    );
    expect(d?.hints?.[0]).toContain("give `dn` the id of the run it meets on the storey above or below");
    // The hint at its word.
    expect(of(src.replace("stair id=dn", "stair id=up"))).toEqual([]);
  });

  it("several runs here alone are counted, not named, and an elevator is named by its kind", () => {
    const two = building(
      ground(),
      upper(`${STAIR("x", "down")}\n    stair id=y at (1000,1000) size 1000x2800 dir down`),
    );
    expect(of(two)[0]?.message).toContain("none of its 2 stairs, elevators or escalators stops on another storey");
    expect(of(two)[0]?.hints?.[0]).toContain("give `x`, `y` the id");
    const lift = building(ground(), upper("elevator id=l at (3000,1000) size 1500x1500"));
    expect(of(lift)[0]?.message).toContain("and its elevator stops on no other storey");
  });

  it("a shaft that lands on no room: the storey is reachable and there is no floor to step onto", () => {
    const src = building(notchGround, notchUpper(""));
    expect(describePlan(src).vertical?.reachable_levels).toEqual([1, 2]);
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d?.level).toBe(2);
    expect(d?.message).toBe(
      "Level 2 has no exterior door or opening of its own, and the stair that reaches it lands on no room here, so there is no floor to step off onto.",
    );
    expect(d?.hints?.[0]).toContain("Land stair `s` on a room's floor on this storey, or add a room under it.");
    // The hint at its word.
    expect(of(building(notchGround, notchUpper(`room id=nook at (4000,3000) size 4000x3000 label "Nook"`)))).toEqual(
      [],
    );
  });

  describe("two shafts, both landing on no room", () => {
    // `y` stands in the sealed store below and comes first in the source; `x` stands in the hall and
    // is the one that reaches level 2.
    const lower = `    ${shell("s1", 8000, 6000)}
    wall id=p partition thickness 100 { (4000,0) (4000,6000) }
    room id=h at (0,0) size 4000x6000 label "Hall" uses hall
    room id=st at (4000,0) size 4000x6000 label "Store" uses storage
    door id=d on s1 at 2000 width 900
    stair id=y at (5500,3200) size 1000x2400 dir up
    stair id=x at (1500,3200) size 1000x2400 dir up`;
    const top = (room: string): string => `    ${shell("s2", 8000, 6000)}
    room id=b at (0,0) size 8000x3000 label "Bedroom" uses bedroom
    ${room}
    stair id=y at (5500,3200) size 1000x2400 dir down
    stair id=x at (1500,3200) size 1000x2400 dir down`;

    it("the hint names the shaft that reached the storey, not the first that stops on it", () => {
      const [d, ...rest] = of(building(lower, top("")));
      expect(rest).toEqual([]);
      expect(d?.message).toContain("the stair that reaches it lands on no room here");
      expect(d?.hints?.[0]).toContain("Land stair `x` on a room's floor");
    });
    it("the hint at its word: a room under `x` cures the storey, a room under `y` does not", () => {
      expect(of(building(lower, top(`room id=nook at (0,3000) size 4000x3000 label "Nook"`)))).toEqual([]);
      const [d] = of(building(lower, top(`room id=nook at (4000,3000) size 4000x3000 label "Nook"`)));
      expect(d?.hints?.[0]).toContain("Land stair `x` on a room's floor");
    });
    it("alone, the shaft from the sealed room is dead, and is told as dead", () => {
      const src = building(lower, top("")).replaceAll(/\n\s+stair id=x[^\n]*/g, "");
      expect(of(src)[0]?.message).toContain("stands in a room nobody can walk to on level 1");
    });
  });

  it("several dead shafts are counted, and the hint takes the one that can be mended", () => {
    const src = building(
      deadGround(false),
      wideUpper("stair id=t at (1000,600) size 1000x2800 dir up\n    stair id=s at (5000,600) size 1000x2800 dir down"),
      wideUpper("stair id=t at (1000,600) size 1000x2800 dir down", "s3"),
    );
    const [two, three] = of(src);
    expect(two?.level).toBe(2);
    expect(two?.message).toBe(
      "Level 2 has no exterior door or opening of its own, and none of the 2 stairs, elevators or escalators that stop here leads from a room a person can walk to.",
    );
    expect(two?.hints?.[0]).toContain("On level 1, stair `s` stands in room `st`");
    expect(three?.message).toContain("and the stair that stops here joins it only to storeys with no way in either");
    // The hint at its word: the store's door carries both storeys.
    expect(
      of(
        building(
          deadGround(true),
          wideUpper(
            "stair id=t at (1000,600) size 1000x2800 dir up\n    stair id=s at (5000,600) size 1000x2800 dir down",
          ),
          wideUpper("stair id=t at (1000,600) size 1000x2800 dir down", "s3"),
        ),
      ),
    ).toEqual([]);
  });

  it("the hint skips a shaft that only joins cut-off storeys, even when it comes first", () => {
    // `u` is met first, in the sealed cellar; `s` stands in the store of the storey with the door.
    const src = building(
      `    ${shell("s0", 8000)}
    room id=c at (0,0) size 8000x4000 label "Cellar" uses storage
    stair id=u at (1000,600) size 1000x2800 dir up`,
      deadGround(false),
      wideUpper(
        "stair id=u at (1000,600) size 1000x2800 dir down\n    stair id=s at (5000,600) size 1000x2800 dir down",
        "s3",
      ),
    );
    const top = of(src).find((d) => d.level === 3);
    expect(top?.message).toContain("none of the 2 stairs, elevators or escalators that stop here");
    expect(top?.hints?.[0]).toContain("On level 2, stair `s` stands in room `st`");
  });

  it("a dead shaft: it starts in a room nobody can walk to, on the storey that has the door", () => {
    const src = building(deadGround(false), wideUpper("stair id=s at (5000,600) size 1000x2800 dir down"));
    expect(describePlan(src).vertical?.reachable_levels).toEqual([1]);
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d?.level).toBe(2);
    expect(d?.message).toBe(
      "Level 2 has no exterior door or opening of its own, and the stair that stops here stands in a room nobody can walk to on level 1.",
    );
    expect(d?.hints?.[0]).toContain("On level 1, stair `s` stands in room `st`");
    // The hint at its word.
    expect(of(building(deadGround(true), wideUpper("stair id=s at (5000,600) size 1000x2800 dir down")))).toEqual([]);
  });

  it("a shaft joining only cut-off storeys: said for the storey above the dead one", () => {
    const src = building(
      deadGround(false),
      wideUpper("stair id=s at (5000,600) size 1000x2800 dir down\n    stair id=t at (1000,600) size 1000x2800 dir up"),
      wideUpper("stair id=t at (1000,600) size 1000x2800 dir down", "s3"),
    );
    expect(of(src).map((d) => d.level)).toEqual([2, 3]);
    const top = of(src)[1]!;
    expect(top.message).toBe(
      "Level 3 has no exterior door or opening of its own, and the stair that stops here joins it only to storeys with no way in either.",
    );
    expect(top.hints?.[0]).toContain("Stair `t` stops on levels 2, 3: join one of them to a storey with a way in.");
  });

  it("no way in on any storey: the plan's sentence is true, and each storey's warning keeps it", () => {
    const sealed = `    ${shell("s1")}\n    room id=h at (0,0) size 6000x4000 label "Hall" uses hall\n    ${STAIR("s", "up")}`;
    const src = building(sealed, upper(STAIR("s", "down")));
    expect(of(src).map((d) => [d.level, d.message])).toEqual([
      [1, "The plan has no exterior door or opening — there is no way into the building."],
      [2, "The plan has no exterior door or opening — there is no way into the building."],
    ]);
    // The hint at its word: one door, and the stair carries the other storey.
    expect(of(building(ground(STAIR("s", "up")), upper(STAIR("s", "down"))))).toEqual([]);
  });

  it("an upper storey a live shaft lands on, in a room, does not fire", () => {
    expect(of(building(ground(STAIR("s", "up")), upper(STAIR("s", "down"))))).toEqual([]);
  });

  it("no message quotes an id", () => {
    const srcs = [
      building(ground(), upper()),
      building(ground(STAIR("up", "up")), upper(STAIR("dn", "down"))),
      building(notchGround, notchUpper("")),
      building(deadGround(false), wideUpper("stair id=s at (5000,600) size 1000x2800 dir down")),
    ];
    for (const src of srcs) {
      const { message } = of(src)[0]!;
      for (const id of ["`", '"', "s1", "s2", "dn"]) expect(message).not.toContain(id);
    }
  });
});
