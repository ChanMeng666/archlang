import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";
import { D4_ELEMENTS, witnessCase } from "./d4-oracle.js";

/**
 * Circulation from the NEAREST entrance (backlog G.5, ADR 0008 addendum).
 *
 * Every walk used to be measured from `entrances[0]`, so a room another front door serves
 * was either measured the long way round or not at all (`other_entrance`). The walk is now
 * one multi-source search seeded at every entrance (`bfsNearest`, the ⊕ of `MIN_PLUS` over
 * the entrances — `test/path-algebra.test.ts` proves the equivalence); the bottleneck is
 * the widest route from ANY entrance, each seeded at its own clear width.
 */

const exampleWorld = {
  read: (p: string) => {
    try {
      return readFileSync(`examples/${p.replace(/^\.\//, "")}`, "utf8");
    } catch {
      return null;
    }
  },
};
const summaryOf = (f: string) => describePlan(readFileSync(`examples/${f}`, "utf8"), { world: exampleWorld });

/** A hall with a front door (west, first) and a back door (east), and a room off each end. */
const TWO_DOORS = `plan "two doors" {
  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,3000) (0,3000) close }
  wall id=wa partition thickness 100 { (3000,0) (3000,3000) }
  wall id=wb partition thickness 100 { (9000,0) (9000,3000) }
  room id=west at (0,0)    size 3000x3000 label "Study"
  room id=hall at (3000,0) size 6000x3000 label "Hall"
  room id=east at (9000,0) size 3000x3000 label "Den"
  door id=d_front at (0,1500)     width 900  wall shell
  door id=d_back  at (12000,1500) width 1200 wall shell
  door id=d_w     at (3000,1500)  width 900  wall wa
  door id=d_e     at (9000,1500)  width 900  wall wb
}`;

describe("each room walks from its nearest entrance", () => {
  it("names the entrance per room, and the model's `entranceId` stays the first", () => {
    const c = describePlan(TWO_DOORS).circulation!;
    expect(c.entranceId).toBe("d_front");
    const by = new Map(c.rooms.map((r) => [r.roomId, r]));
    expect(by.get("west")?.entranceId).toBe("d_front");
    expect(by.get("east")?.entranceId).toBe("d_back");
    // The east room is walked to from the back door beside it, not across the whole hall.
    expect(by.get("east")!.walkDistanceMm).toBeLessThan(3000);
    expect(by.get("west")!.walkDistanceMm).toBeLessThan(3000);
  });

  it("the bottleneck is the widest route from ANY entrance, each at its own clear width", () => {
    const c = describePlan(TWO_DOORS).circulation!;
    const by = new Map(c.rooms.map((r) => [r.roomId, r]));
    // The east room opens straight off the 1200 mm back door (1140 clear); measured from the
    // first entrance alone it would read the 900 mm doors' 840 on the way across.
    expect(by.get("east")?.bottleneckClearWidthMm).toBe(1140);
    // The west room is behind the 900 mm front door; the hall behind a 900 mm door either way.
    expect(by.get("west")?.bottleneckClearWidthMm).toBe(840);
    expect(by.get("hall")?.bottleneckClearWidthMm).toBe(840);
  });

  it("a single-entrance plan carries no per-room `entranceId` — its bytes are unchanged", () => {
    const files = readdirSync("examples").filter((f) => f.endsWith(".arch"));
    let single = 0;
    let multi = 0;
    for (const f of files) {
      const s = summaryOf(f);
      const levels = s.levels && s.levels.length > 0 ? s.levels : [s];
      for (const lvl of levels) {
        const c = lvl.circulation;
        if (!c) continue;
        const several = lvl.access.entrances.length > 1;
        if (several) multi++;
        else single++;
        for (const r of c.rooms) expect("entranceId" in r, `${f} ${r.roomId}`).toBe(several);
      }
    }
    expect(single).toBeGreaterThan(10); // both halves of the corpus are real
    expect(multi).toBeGreaterThan(5);
  });

  it("terrace-row: every house's rooms walk from that house's own doors", () => {
    const c = summaryOf("terrace-row.arch").circulation!;
    expect(c.rooms).toHaveLength(16);
    for (const r of c.rooms) expect(r.entranceId?.split(".")[0], r.roomId).toBe(r.roomId.split(".")[0]);
  });
});

describe("two entrances that seed one cell (the fuzz gate's seed 1438601647)", () => {
  // An opening (600) and a door (900 → 840 clear) side by side on one wall seed the SAME
  // inner cell in one orientation and neighbouring cells in another. The seed used to be
  // read back off that cell, where the later entrance's stamp had overwritten the first's,
  // so the bottleneck was 840 in P₀ and 600 turned 90° — and W_PATH_TOO_NARROW fired on
  // the turned plan only. Each entrance now seeds at its own width, so it is 840 under
  // every element of D4.
  const body = `    wall id=w_shell exterior thickness 100 { (0,0) (3100,0) (3100,2000) (0,2000) close }
    room id=r0 at (0,0) size 3100x2000
    opening id=o0 on w_shell at 80% width 600
    door id=o1 hinged on w_shell at 81% width 900
    room id=r_base at (6100,16000) size 3000x2500
    room id=r_rel right-of r_base align top gap 0 size 2000x2000`;

  it("reads the wider entrance's width, and lints the same, under every g", () => {
    for (const g of D4_ELEMENTS) {
      const { vs, ctx } = witnessCase(body, g);
      const bottleneck = ctx.obsG.summary.circulation?.rooms.find((r) => r.roomId === "g.r0")?.bottleneckClearWidthMm;
      expect(bottleneck, g.name).toBe(840);
      expect(
        vs.filter((v) => v.path.endsWith(".bottleneck") || v.path.startsWith("lint.path-too-narrow")).map((v) => v.key),
        g.name,
      ).toEqual([]);
      expect(
        lint(ctx.obsG.src).filter((d) => d.code === "W_PATH_TOO_NARROW"),
        g.name,
      ).toEqual([]);
    }
  });
});
