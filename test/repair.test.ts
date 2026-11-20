/** arch repair. */

import { describe, expect, it } from "vitest";
import { compile, format, repair, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import type { RFurniture } from "../src/ir.js";

/**
 * `arch repair` — the explicit source-to-source corrector (ADR 0006). It emits new
 * `.arch` source with furniture pushed out of walls; it never edits render behavior.
 * The output must lint clean of the collision it fixed, be idempotent, and refuse to
 * guess (ambiguous / wall-anchored / scripted pieces are left untouched).
 */

const split = (furn: string) =>
  `plan "P" {
    units mm
    grid 50
    wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    wall partition thickness 100 { (4000,0) (4000,4000) }
    room id=a at (0,0)    size 4000x4000 label "A"
    room id=b at (4000,0) size 4000x4000 label "B"
    ${furn}
  }`;

const has = (src: string, code: string) => lint(src).some((d) => d.code === code);

describe("arch repair", () => {
  it("pushes furniture out of a wall and the result lints clean", () => {
    const src = split(`furniture sofa at (3200,1000) size 1000x900`);
    expect(has(src, "W_FURNITURE_WALL_COLLISION")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.kind).toBe("moved");
    expect(r.changes[0]!.reason).toContain("wall");
    expect(has(r.source, "W_FURNITURE_WALL_COLLISION")).toBe(false);
  });

  it("clears furniture out of a door's landing", () => {
    // A door on the bottom exterior wall with a chest parked right in the approach.
    const src = `plan "P" {
      units mm grid 50
      wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
      room id=r at (0,0) size 5000x5000 label "R"
      door at (1000,5000) width 900 wall exterior hinge left swing in
      window at (3000,0) width 1200 wall exterior
      furniture chest at (700,4400) size 800x500
    }`;
    expect(has(src, "W_DOORWAY_BLOCKED")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.reason).toContain("doorway");
    expect(has(r.source, "W_DOORWAY_BLOCKED")).toBe(false);
  });

  it("moves furniture out of a door's swing arc", () => {
    const src = `plan "P" {
      units mm grid 50
      wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
      room id=r at (0,0) size 5000x5000 label "R"
      door at (1000,5000) width 1000 wall exterior hinge left swing in
      window at (3000,0) width 1200 wall exterior
      furniture sofa at (600,3800) size 1600x900
    }`;
    expect(has(src, "W_SWING_OBSTRUCTED")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.reason).toContain("swing");
    expect(has(r.source, "W_SWING_OBSTRUCTED")).toBe(false);
  });

  it("snaps a floating wall-fixture onto the nearest wall", () => {
    const src = `plan "P" {
      units mm grid 50
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "Bath" uses bath
      door at (2000,4000) width 900 wall exterior hinge left swing in
      furniture wc at (1700,400) size 400x700
    }`;
    expect(has(src, "W_FIXTURE_FLOATING")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.reason).toContain("wall");
    expect(has(r.source, "W_FIXTURE_FLOATING")).toBe(false);
  });

  it("separates two overlapping pieces (the later one yields)", () => {
    const src = split(`furniture sofa at (300,300) size 1500x900\n    furniture table at (800,500) size 1000x900`);
    expect(has(src, "W_FURNITURE_OVERLAP")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    // The earlier piece (sofa) is the anchor; the later (table) is the mover.
    expect(r.changes.map((c) => c.id.replace(/#.*/, ""))).toContain("table");
    expect(r.changes.every((c) => !c.id.startsWith("sofa"))).toBe(true);
    expect(has(r.source, "W_FURNITURE_OVERLAP")).toBe(false);
  });

  it("moves a fixture into its declared room", () => {
    // wc declared `in b` but placed in room a's area.
    const src = split(`furniture wc at (200,200) size 400x700 in b`);
    expect(has(src, "W_FIXTURE_WRONG_ROOM")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.reason).toContain("declared room");
    expect(has(r.source, "W_FIXTURE_WRONG_ROOM")).toBe(false);
  });

  it("is idempotent — repairing a fixed plan makes no further change", () => {
    const r1 = repair(split(`furniture sofa at (3200,1000) size 1000x900`));
    const r2 = repair(r1.source);
    expect(r2.changed).toBe(false);
    expect(r2.source).toBe(r1.source);
  });

  it("leaves a sound plan untouched (verbatim source)", () => {
    const src = split(`furniture sofa at (300,1000) size 2000x900`);
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(src);
  });

  it("refuses to guess for a piece centred exactly on a wall", () => {
    // Centre x = 4000 sits on the partition centreline — no majority side.
    const r = repair(split(`furniture table at (3500,1000) size 1000x900`));
    expect(r.changed).toBe(false);
    expect(r.unresolved.some((u) => u.reason.includes("centred on a wall"))).toBe(true);
  });

  it("does not touch wall-anchored (`against wall`) furniture", () => {
    const r = repair(split(`furniture wc against wall partition side left in a size 400x700`));
    expect(r.changed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Idempotence: the two ping-pongs that used to make `arch repair`'s output
  // depend on how many times you had run it.
  // -------------------------------------------------------------------------

  /**
   * **Two walls, one piece, no seat on the grid.** The shell is 300 mm thick, so its
   * inner faces are at x = 150 and x = 1950 — an interior exactly 1800 mm wide, holding
   * a piece exactly 1800 mm wide. The one position that clears both walls is x = 150,
   * which `grid 100` does not have. So the wall push off the left wall snapped to 200
   * (50 mm into the right wall), the push off the right wall snapped to 100 (50 mm into
   * the left), and the pass banked whichever it had reached: `repair` returned 200,
   * `repair(repair(…))` returned 100, and it alternated for ever.
   */
  const SQUEEZE = `plan "Squeeze" {
    units mm
    grid 100
    wall id=w exterior thickness 300 { (0,0) (2100,0) (2100,3300) (0,3300) close }
    room id=r0 at (0,0) size 2100x3300
    furniture id=f0 widget at (90,1300) size 1800x1400 in r0
  }`;

  /**
   * **A wall push and an overlap separation with opposite objectives.** `b` overlaps
   * `a` by 100 mm along y, so the separation pushes it UP to y = 100 — which buries it
   * 50 mm in the top wall, so the (higher-priority) wall push sends it back DOWN to
   * y = 200, back onto `a`. Two remedies, each correct on its own, that undo each other.
   */
  const SANDWICH = `plan "Sandwich" {
    units mm
    grid 100
    wall id=w exterior thickness 300 { (0,0) (3000,0) (3000,3000) (0,3000) close }
    room id=r0 at (0,0) size 3000x3000
    furniture id=a widget at (600,700) size 900x600 in r0
    furniture id=b widget at (400,200) size 1100x600 in r0
  }`;

  it("settles a piece with no on-grid seat between two walls instead of ping-ponging", () => {
    const r1 = repair(SQUEEZE);
    expect(repair(r1.source).source).toBe(r1.source);
    // …and it says so: a piece it could not seat is never left looking settled.
    const note = r1.unresolved.find((u) => u.id === "f0");
    expect(note?.reason).toContain("cycles between 2 positions");
    // The change log describes the source the caller got back — never a move that
    // source does not contain.
    for (const c of r1.changes) expect(c.from).not.toEqual(c.to);
  });

  it("does not settle a wall push and an overlap separation by trading one fault for another", () => {
    // The cycle's canonical seat is y = 100 — 50 mm inside the top wall. Shipping it
    // cleared the overlap with `a` by putting `b` into a wall it was not in: a
    // `W_FURNITURE_WALL_COLLISION` the input did not have. The no-worse law refuses that
    // trade, so `b` stays where the author put it (still on `a`, as the input was) and the
    // note says where repair would have put it and what that would have hit.
    const r1 = repair(SANDWICH);
    expect(repair(r1.source).source).toBe(r1.source);
    expect(r1.changed).toBe(false);
    expect(r1.source).toBe(SANDWICH);
    const note = r1.unresolved.find((u) => u.id === "b");
    expect(note?.reason).toBe(
      "moving it to (400,100) would push it into a wall, which the plan does not have now — left in place; adjust manually",
    );
  });

  it("keeps the canonical seat of a cycle, whichever end it is handed", () => {
    // Both ends of the SQUEEZE cycle repair to the same arrangement. Before, each
    // repaired to the OTHER — which is what made the shipped plan a function of the
    // number of times the command had been run. Compared through the formatter because
    // repair leaves a plan it does not change byte-untouched, so the end that is already
    // canonical comes back in the author's own layout.
    const at = (x: number) => SQUEEZE.replace("at (90,1300)", `at (${x},1300)`);
    expect(format(repair(at(100)).source)).toBe(format(repair(at(200)).source));
  });

  it("writes a position the plan resolves back to", () => {
    // A `in <room> centered` piece is resolver-derived and NOT grid-snapped, so it can
    // sit off the grid; an absolute `at` IS snapped. Re-pointing one as the other used
    // to report a `to` the output did not contain — 37 of 400 generated plans shipped a
    // change log that disagreed with their own source.
    const src = `plan "Off" {
      units mm
      grid 100
      wall id=w exterior thickness 200 { (0,0) (2500,0) (2500,2500) (0,2500) close }
      room id=r0 at (0,0) size 2500x2500
      furniture id=a widget at (100,100) size 900x900 in r0
      furniture id=b widget in r0 centered size 900x900
    }`;
    const r = repair(src);
    const moved = r.changes.filter((c) => c.kind === "moved");
    expect(moved.length).toBeGreaterThan(0);
    // Every reported destination is on the grid the resolver will snap to.
    for (const c of moved) {
      expect(c.to.x % 100).toBe(0);
      expect(c.to.y % 100).toBe(0);
    }
    expect(repair(r.source).source).toBe(r.source);
  });

  it("records a moved position as the printer will write it", () => {
    // Regression, found by `test/fuzz.test.ts`'s round-trip property ("never reports a
    // move its own output does not contain"), which failed on roughly one run in five
    // and reproduced byte-for-byte against an older released `src/` — so this shipped.
    //
    // `planWrite` promises that the source repair is about to write resolves back to
    // the position it reports. It computed that position in full float precision, but
    // `formatPlan` prints every number through `fmt3`: the change log said the WC went
    // to y = 1117.9999999999982 while the source it handed back said `y 1118`. A
    // consumer diffing the log against the plan saw a 1.8e-12 mm disagreement, and the
    // fuzz property — which compares the log to the RE-RESOLVED output, which is the
    // only honest comparison — caught it. This is the exact counterexample it found
    // (fast-check seed -2029920382).
    //
    // No grid statement, deliberately: `snap` is the identity without one, so nothing
    // else rounds the coordinate on its way to the printer.
    const src = `plan "P" {
  units mm
  wall id=w_shell exterior thickness 100 { (0,0) (3200,0) (3200,5400) (0,5400) close }
  wall id=w_h1 partition thickness 80 { (0,3000) (3200,3000) }
  room id=r0 at (0,0) size 3200x3000
  room id=r1 at (0,3000) size 3200x2400
  door id=o0 hinged on w_shell at 81% width 700
  furniture id=f0 wc at (0,1152) size 300x1800
}
`;
    const r = repair(src);
    const moved = r.changes.find((c) => c.id === "f0" && c.kind === "moved");
    expect(moved, "the counterexample must still move its WC, or it proves nothing").toBeDefined();

    // The property this is here to hold: every reported destination equals the position
    // the emitted source actually resolves to. Asserted over EVERY change, not just the
    // one that failed — a `rotated` entry carries the same coordinates.
    const { ir } = resolvePlan(r.source);
    const where = new Map(
      (ir?.elements ?? []).filter((e) => e.kind === "furniture").map((e) => [e.id, (e as RFurniture).at] as const),
    );
    for (const c of r.changes) {
      const at = where.get(c.id);
      if (!at) continue;
      expect({ x: at.x, y: at.y }, `repair reported "${c.id}" at a place its own output does not`).toEqual(c.to);
    }

    // And the specific value, so a future rounding change has to argue with a number
    // rather than quietly satisfy a self-comparison.
    expect(moved!.to).toEqual({ x: 50, y: 1118 });
    expect(r.source).toContain("at (50, 1118)");
  });

  it("is pure across repeated calls on the same source (parse memo untouched)", () => {
    // Regression: repair once mutated the shared parse-cache AST in place, so a second
    // repair() of the byte-identical source saw already-moved furniture and reported
    // zero changes — same input, history-dependent output (ADR 0006 violation).
    const src = split(`furniture sofa at (3200,1000) size 1000x900`);
    const r1 = repair(src);
    const r2 = repair(src);
    expect(r1.changes.length).toBeGreaterThan(0);
    expect(r2.changes).toEqual(r1.changes);
    expect(r2.source).toBe(r1.source);
  });
});

/**
 * RM9.11 (downstream request 3): the two choices repair used to decline are made by one stated
 * order, and the change log names the key that made each; and a piece standing on a stair is
 * moved off it, which on a multi-storey plan is what reconnects the storeys the stair joins.
 * Repair still adds no door or window.
 */
describe("arch repair — deterministic choices (RM9.11)", () => {
  const room = (walls: string, furn: string, extra = "") =>
    `plan "P" {
      units mm
      grid 50
      ${walls}
      room id=r at (0,0) size 4000x4000 label "Bath" uses bath
      ${extra}
      ${furn}
    }`;
  const ring = `wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }`;
  const door = `door at (3000,4000) width 900 wall exterior hinge left swing out`;
  const fixpoint = (src: string): void => {
    const once = repair(src).source;
    expect(repair(once).changed).toBe(false);
    expect(repair(once).source).toBe(once);
  };

  it("snaps a fixture equidistant from two walls onto the one it can back onto by its size", () => {
    // 500 mm to the top face and 500 mm to the left one; a 400×700 WC backs onto a horizontal edge.
    const src = room(ring, `furniture wc at (600,600) size 400x700`, door);
    const r = repair(src);
    expect(r.unresolved).toEqual([]);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]!.to).toEqual({ x: 600, y: 100 });
    expect(r.changes[0]!.reason).toContain("the walls on its top/left side were equally near");
    expect(r.changes[0]!.reason).toContain("the only one it can back onto by its size");
    expect(has(r.source, "W_FIXTURE_FLOATING")).toBe(false);
    fixpoint(src);
  });

  it("breaks a tie between walls by the smallest wall id, not by direction", () => {
    const top = (id: string) => `wall id=${id} partition thickness 100 { (0,0) (4000,0) }`;
    const left = (id: string) => `wall id=${id} partition thickness 100 { (0,0) (0,4000) }`;
    const basin = `furniture basin at (600,600) size 500x500`; // square: either wall fits it
    // The same two walls, the ids swapped and declared in the other order.
    const a = repair(room(`${left("w_b")}\n${top("w_a")}`, basin));
    expect(a.changes[0]!.to).toEqual({ x: 600, y: 50 });
    expect(a.changes[0]!.reason).toContain('took wall "w_a", by the smallest wall id');
    const b = repair(room(`${top("w_b")}\n${left("w_a")}`, basin));
    expect(b.changes[0]!.to).toEqual({ x: 50, y: 600 });
    expect(b.changes[0]!.reason).toContain('took wall "w_a", by the smallest wall id');
  });

  it("orders unnamed walls by their number, so `partition_2` comes before `partition_10`", () => {
    const far = Array.from(
      { length: 7 },
      (_, k) => `wall partition thickness 100 { (10000,${k * 1000}) (11000,${k * 1000}) }`,
    ).join("\n");
    const walls = [
      `wall exterior thickness 100 { (4000,0) (4000,4000) (0,4000) }`, // exterior_1
      `wall partition thickness 100 { (0,0) (0,4000) }`, // partition_2, on the left
      far, // partition_3 … partition_9
      `wall partition thickness 100 { (0,0) (4000,0) }`, // partition_10, on the top
    ].join("\n");
    const r = repair(room(walls, `furniture basin at (600,600) size 500x500`));
    // Code-unit order would put "partition_10" first and snap the basin to the top.
    expect(r.changes[0]!.to).toEqual({ x: 50, y: 600 });
    expect(r.changes[0]!.reason).toContain('took wall "partition_2", by the smallest wall id');
  });

  it("turns a corner fixture onto the nearest wall face", () => {
    // The bottom edge stands 50 mm off the south face, the left edge on the west one.
    const src = room(ring, `furniture counter at (100,3250) size 600x600 rotate 0`, door);
    const r = repair(src);
    const turn = r.changes.find((c) => c.kind === "rotated");
    expect(turn?.toRotate).toBe(270);
    expect(turn?.reason).toContain("took the nearest wall face");
    expect(r.unresolved).toEqual([]);
    expect(has(r.source, "W_FIXTURE_BACK_TO_ROOM")).toBe(false);
    fixpoint(src);
  });

  it("leaves a piece standing side-on to a wall alone, as lint does", () => {
    // A bed lengthwise along the west wall: no edge it could back onto has a wall, its front is
    // off the wall, and `W_FIXTURE_BACK_TO_ROOM` declines it (PS2.50); repair used to report it.
    const src = room(ring, `furniture bed at (100,1500) size 1600x2000 rotate 0`, door);
    expect(has(src, "W_FIXTURE_BACK_TO_ROOM")).toBe(false);
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved).toEqual([]);
  });

  it("says a size the wrong way round needs W and H swapped, which no `rotate` can do", () => {
    const src = room(ring, `furniture wc at (100,1500) size 400x700 rotate 0`, door);
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved.map((u) => u.reason)).toEqual([expect.stringContaining("swap W and H in `size`")]);
  });

  it("moves furniture off a stair's landings, reconnecting the storey above, and adds no door", () => {
    const src = `plan "Stair" {
      units mm
      grid 50
      height 2700
      level 1 "Ground" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,7000) (0,7000) close }
        wall id=hall_w partition thickness 100 { (2200,0) (2200,7000) }
        room id=hall at (0,0) size 2200x7000 label "Hall" uses hall
        room id=living at (2200,0) size 5800x7000 label "Living" uses living
        door id=front on shell at 21900 width 1000 swing into hall
        door id=d_living on hall_w at 1800 width 900 swing into living
        window id=w1 on shell at 5000 width 1800
        stair id=stair at (100,1000) size 900x3250 dir up
        furniture cabinet at (100,4300) size 900x500
      }
      level 2 "First" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,7000) (0,7000) close }
        wall id=hall_w partition thickness 100 { (2200,0) (2200,7000) }
        room id=landing at (0,0) size 2200x7000 label "Landing" uses circulation
        room id=bed at (2200,0) size 5800x7000 label "Bed" uses bedroom
        door id=d_bed on hall_w at 1800 width 900 swing into bed
        window id=w2 on shell at 5000 width 1500
        stair id=stair at (100,1000) size 900x3250 dir down
        void id=well at (100,1000) size 900x3250
        furniture wardrobe at (100,450) size 900x500
      }
    }`;
    const onStair = (s: string) => lint(s).filter((d) => d.code === "W_FURNITURE_ON_STAIR");
    const blockedLanding = (s: string) =>
      lint(s).some((d) => d.code === "W_PATH_TOO_NARROW" && d.message.includes('"Landing"'));
    expect(onStair(src)).toHaveLength(2);
    expect(blockedLanding(src)).toBe(true);
    const r = repair(src);
    expect(r.changes.map((c) => [c.level, c.id, c.to])).toEqual([
      [1, "cabinet#1", { x: 100, y: 5150 }], // past the foot landing
      [2, "wardrobe#2", { x: 1000, y: 450 }], // off the head landing, beside it
    ]);
    for (const c of r.changes) expect(c.reason).toBe("moved off the stair's flight or landing");
    expect(onStair(r.source)).toEqual([]);
    expect(blockedLanding(r.source)).toBe(false);
    const count = (s: string, word: string) => s.split("\n").filter((l) => l.trim().startsWith(word)).length;
    expect(count(r.source, "door")).toBe(count(src, "door"));
    expect(count(r.source, "window")).toBe(count(src, "window"));
    fixpoint(src);
  });
});

/**
 * RM9.11 review round 1: the cases where a choice must NOT be made, or must not stand. Each plan is
 * a red-team probe (`rt988`), pinned by what repair now does with it.
 */
describe("arch repair — what a choice may not do (RM9.11)", () => {
  /** Two storeys; the upper stairwell is enclosed by the shell, `hall_w` and a guard wall. */
  const well = (furn: string, opts: { guard?: boolean; l1?: string } = {}) => `plan "Stair" {
  units mm
  grid 50
  height 2700
  level 1 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,7000) (0,7000) close }
    wall id=hall_w partition thickness 100 { (1050,0) (1050,7000) }
    room id=hall at (0,0) size 1050x7000 label "Hall" uses hall
    room id=living at (1050,0) size 6950x7000 label "Living" uses living
    door id=front on shell at 22500 width 800 swing into hall
    door id=d_living on hall_w at 5800 width 900 swing into living
    window id=w1 on shell at 5000 width 1800
    stair id=stair at (100,1000) size 900x3250 dir up
    ${opts.l1 ?? ""}
  }
  level 2 "First" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,7000) (0,7000) close }
    wall id=hall_w partition thickness 100 { (1050,0) (1050,7000) }
    ${opts.guard === false ? "" : "wall id=guard partition thickness 100 { (0,4300) (1050,4300) }"}
    room id=landing at (0,0) size 1050x4300 label "Landing" uses circulation
    room id=store at (0,4300) size 1050x2700 label "Store" uses storage
    room id=bed at (1050,0) size 6950x7000 label "Bed" uses bedroom
    door id=d_bed on hall_w at 500 width 800 swing into bed
    door id=d_store on hall_w at 5800 width 800 swing into bed
    window id=w2 on shell at 5000 width 1500
    stair id=stair at (100,1000) size 900x3250 dir down
    void id=well at (100,1000) size 900x3250
    furniture bed at (5000,3000) size 1600x2000 rotate 90
    ${furn}
  }
}`;
  const bath = (furn: string) => `plan "P" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=r at (0,0) size 4000x4000 label "Bath" uses bath
  door at (3000,4000) width 900 wall exterior hinge left swing out
  ${furn}
}`;
  const furnitureLines = (s: string) =>
    s
      .split("\n")
      .filter((l) => l.trim().startsWith("furniture"))
      .map((l) => l.trim().replace(/\s+/g, " ").replace(/, /g, ","));
  const errorsOf = (s: string) => compile(s, { noCache: true }).diagnostics.filter((d) => d.severity === "error");

  for (const [name, at] of [
    ["against the shell (E1)", "(150,2000)"],
    ["against `hall_w` (p2)", "(600,2000)"],
  ] as const) {
    it(`never carries a piece in an enclosed stairwell through a wall: ${name}`, () => {
      const src = well(`furniture cabinet at ${at} size 300x300`);
      const r = repair(src);
      expect(r.changes).toEqual([]);
      expect(r.unresolved.map((u) => u.reason)).toEqual([
        "stands on a stair, and every axis move off it runs into a wall — move it by hand",
      ]);
      expect(furnitureLines(r.source)).toEqual(furnitureLines(src));
    });
  }

  it("puts a piece back when a later fix undoes its move off a stair, and says so (E5)", () => {
    // Off the foot landing is the front door's approach, which pushes the cabinet back on.
    const src = well("", { l1: "furniture cabinet at (100,4300) size 900x500" });
    const r = repair(src);
    expect(r.changes).toEqual([]);
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      "stands on a stair's flight or landing, and every way off it that repair found ran into another fault (a wall, a doorway, another piece) — left in place; move it by hand",
    ]);
    expect(r.unresolved.some((u) => u.reason.includes("parked"))).toBe(false);
  });

  it("never moves a piece onto floor no room covers, nor through a wall", () => {
    // The top wall is nearer by 50 mm, but the bathtub stands there: the overlap push takes the
    // basin into the shell and the wall push clears it to the far side, out of the building.
    // main shipped (900,-600) with lint silent; the no-worse check now holds it.
    const src = bath("furniture bathtub at (300,100) size 1700x700\nfurniture basin at (900,850) size 500x500");
    const r = repair(src);
    expect(r.changes).toEqual([]);
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      "moving it to (900,-600) would put it on floor no room covers — left in place; adjust manually",
    ]);
    expect(r.source).toBe(src);
    // With no room drawn at all, the crossing of the shell is what holds it.
    const bare = src.replace(/\n\s*room id=r[^\n]*/, "");
    expect(repair(bare).unresolved.map((u) => u.reason)).toEqual([
      'moving it to (900,-600) would carry it through wall "ext" — left in place; adjust manually',
    ]);
  });

  it("lets a move cross into the next room where no wall stands between them", () => {
    // An open-plan kitchen and dining room: the chair is pushed 300 mm across the zone line, as
    // main pushed it; the room check fires only off every room's floor or through a wall.
    const src = `plan "Open" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  room id=kitchen at (0,0) size 4000x4000 label "Kitchen" uses kitchen
  room id=dining at (4000,0) size 4000x4000 label "Dining" uses dining
  door at (6000,4000) width 900 wall exterior hinge left swing out
  furniture table at (2800,1000) size 800x800
  furniture chair at (3300,1100) size 600x600
}`;
    const r = repair(src);
    expect(r.changes.map((c) => [c.id, c.to, c.reason])).toEqual([
      ["chair#2", { x: 3600, y: 1100 }, "separated from an overlapping piece"],
    ]);
    expect(r.unresolved).toEqual([]);
  });

  it("returns every piece a failed move off a stair pushed, and parks none on the stair (q5b)", () => {
    for (const plant of ["(700,5150) size 300x150", "(100,5150) size 300x150"]) {
      const src = well("", {
        l1: `furniture id=cab cabinet at (100,4300) size 900x500\n    furniture id=nb plant at ${plant}`,
      });
      const onStair = (s: string) => lint(s).filter((d) => d.code === "W_FURNITURE_ON_STAIR").length;
      const r = repair(src);
      expect(r.changed, plant).toBe(false);
      expect(r.source, plant).toBe(src);
      expect(onStair(r.source), plant).toBe(onStair(src));
      expect(r.unresolved.find((u) => u.id === "cab")?.reason, plant).toBe(
        "stands on a stair's flight or landing, and every way off it that repair found ran into another fault (a wall, a doorway, another piece) — left in place; move it by hand",
      );
    }
  });

  it("names the key that decided against a different move, not a twin run behind the same edge (q3)", () => {
    // The top run is drawn as two collinear walls `t1`, `t2`; the left wall `a` (smallest id)
    // has a bathtub on it. The top wins because its side is free, not because `t1` < `t2`.
    const src = `plan "P" {
  units mm
  grid 50
  wall id=a partition thickness 200 { (0,0) (0,4000) }
  wall id=t1 partition thickness 200 { (0,0) (1150,0) }
  wall id=t2 partition thickness 200 { (1150,0) (4000,0) }
  wall id=rest partition thickness 200 { (4000,0) (4000,4000) (0,4000) }
  room id=r at (0,0) size 4000x4000 label "Bath" uses bath
  door id=d1 at (3000,4000) width 900 wall rest hinge left swing out
  furniture bathtub at (100,300) size 700x1700
  furniture basin at (900,900) size 500x500
}`;
    const moved = repair(src).changes.find((c) => c.kind === "moved")!;
    expect(moved.to).toEqual({ x: 900, y: 100 });
    expect(moved.reason).toContain('took wall "t1", the one whose side of the room is free');
  });

  it("breaks a tie toward the wall whose side of the room is free", () => {
    // 800 mm from the top face and from the left one; the bathtub stands on the top wall.
    const src = bath("furniture bathtub at (300,100) size 1700x700\nfurniture basin at (900,900) size 500x500");
    const r = repair(src);
    const moved = r.changes.find((c) => c.kind === "moved")!;
    expect(moved.to).toEqual({ x: 100, y: 900 });
    expect(moved.reason).toContain('took wall "ext", the one whose side of the room is free');
    expect(r.unresolved).toEqual([]);
  });

  it("never writes a `rotate` onto a piece whose turn `facing` states", () => {
    for (const [furn, win] of [
      [
        "furniture counter at (100,3300) size 600x600 facing win",
        "window id=win at (400,4000) width 500 wall exterior",
      ],
      [
        "furniture counter at (1500,3300) size 600x600 facing win",
        "window id=win at (1800,4000) width 500 wall exterior",
      ],
    ] as const) {
      const src = bath(`${win}\n  ${furn}`);
      const r = repair(src);
      expect(r.changes).toEqual([]);
      expect(r.unresolved.map((u) => u.reason)).toEqual([
        "has its back to the room, and its turn is stated by `facing` — point the `facing` at something on its bottom side, or replace it with `rotate 180`",
      ]);
      expect(errorsOf(r.source)).toEqual([]);
    }
  });

  it("lets the snap move a wall fixture that stands on a stair with no single way off", () => {
    const src = `plan "P" {
  units mm
  room id=hall at (0,0) size 6000x5000 label "Hall" uses hall
  walls from rooms exterior 200 partition 100
  door on hall.bottom at 4500 from start width 1000 swing into hall
  window on hall.top at 4500 from start width 1500
  stair id=s1 at (1000,500) size 1000x3000 dir up
  furniture wc at (1300,2400) size 400x700
}`;
    const r = repair(src);
    expect(r.changes.map((c) => [c.kind, c.to, c.reason])).toEqual([
      ["moved", { x: 100, y: 2400 }, "snapped against the nearest wall"],
    ]);
    expect(lint(r.source).some((d) => d.code === "W_FURNITURE_ON_STAIR")).toBe(false);
  });

  it("names the side it turned the piece to", () => {
    // Walls on its top and left; a 700×400 WC can back onto a vertical edge only, so the left.
    const r = repair(bath("furniture wc at (150,100) size 700x400 rotate 90"));
    expect(r.changes.map((c) => [c.toRotate, c.reason])).toEqual([
      [270, "turned to put its back against the wall on its left side"],
    ]);
  });

  it("does not turn a piece in a polygon room, which lint does not judge", () => {
    const src = `plan "P" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=r polygon (0,0) (4000,0) (4000,4000) (0,4000) label "Kitchen" uses kitchen
  door at (3000,4000) width 900 wall exterior hinge left swing out
  furniture counter at (100,3300) size 600x600 rotate 0
}`;
    expect(lint(src).some((d) => d.code === "W_FIXTURE_BACK_TO_ROOM")).toBe(false);
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved).toEqual([]);
  });
});
