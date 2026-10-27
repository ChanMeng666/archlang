/**
 * PS0.4 (plan-soundness): three `diffPlans` defects found by `research/associativity.md` §1.2,
 * fixed additively in `src/diff.ts`.
 *
 *  1. A pure move (same shape, new position) read as `resized` with "+0.0 m²". It is now
 *     `moved` with the offset read off the shape's own vertices (or a circle's centre).
 *  2. An opening whose host or whose spaces changed was not reported at all (only a width
 *     change was). It is now `rehosted`, naming each host as a person would.
 *  3. Walls were not diffed. `walls[]` now lists authored and derived walls added, removed,
 *     moved, resized or re-thickened; a wall placed by relation that moved with its rooms is
 *     listed as following them.
 *
 * The two drills of `docs/plans/plan-soundness/repro/README.md` are pinned in full below, every
 * line explained.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { diffPlans } from "../src/diff.js";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const box = (rooms: string[], walls = "") =>
  `plan "P" {\n  units mm\n  grid 50\n` +
  `  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,8000) (0,8000) close }\n` +
  `${walls}${rooms.join("\n")}\n}\n`;

/** No new field or sentence quotes an internal name: a derived pair `A|B`, a derived ring
 *  `exterior#n`, a derived run `~k`, or an `open between` opening's `A|B:open`. */
function expectNoInternalNames(d: ReturnType<typeof diffPlans>): void {
  const text = JSON.stringify({
    walls: d.walls,
    hosts: d.openings.map((o) => [o.hostBefore, o.hostAfter, o.relationBefore, o.relationAfter]),
    summary: d.summary,
  });
  expect(text).not.toMatch(/\||exterior#|~\d|_derived/);
}

suite("PS0.4 defect 1: a pure move is a move", () => {
  it("a rectangle moved 500 mm right and 200 mm down is `moved`, not `resized +0.0 m²`", () => {
    const d = diffPlans(
      box([`  room id=r at (1000,1000) size 3000x2000 label "Study"`]),
      box([`  room id=r at (1500,1200) size 3000x2000 label "Study"`]),
    );
    expect(d.ok).toBe(true);
    // Before the fix: [{ change: "resized", areaBeforeM2: 6, areaAfterM2: 6, edges: {top: 200,
    // bottom: 200, left: 500, right: 500} }] and "Study +0.0 m²; left edge +500 mm".
    expect(d.rooms).toEqual([{ id: "r", label: "Study", change: "moved", offset: { dx: 500, dy: 200 } }]);
    expect(d.summary).toEqual(["Moved Study 500 mm right, 200 mm down"]);
  });

  it("an L-shaped polygon's offset comes from its vertices", () => {
    const L = (x: number, y: number) =>
      `  room id=l polygon (${x},${y}) (${x + 4000},${y}) (${x + 4000},${y + 1000}) (${x + 1000},${y + 1000}) (${x + 1000},${y + 3000}) (${x},${y + 3000}) label "Ell"`;
    const d = diffPlans(box([L(1000, 1000)]), box([L(2000, 500)]));
    expect(d.rooms).toEqual([{ id: "l", label: "Ell", change: "moved", offset: { dx: 1000, dy: -500 } }]);
    expect(d.summary).toEqual(["Moved Ell 1000 mm right, 500 mm up"]);
  });

  it("a circle's offset comes from its centre", () => {
    const c = (x: number) => `  room id=c circle at (${x},4000) radius 1500 label "Drum"`;
    const d = diffPlans(box([c(3000)]), box([c(6000)]));
    expect(d.rooms).toEqual([{ id: "c", label: "Drum", change: "moved", offset: { dx: 3000, dy: 0 } }]);
  });

  it("a polygon rewritten from another start vertex, or the other way round, still reads as a move", () => {
    // Red-team probe (round 1): the ring was compared vertex i with vertex i, so the same
    // rectangle written from another corner read "resized +0.0 m²".
    const before = `  room id=r polygon (1000,1000) (4000,1000) (4000,3000) (1000,3000) label "Study"`;
    const rotated = `  room id=r polygon (4500,1000) (4500,3000) (1500,3000) (1500,1000) label "Study"`;
    const reversed = `  room id=r polygon (4500,3000) (4500,1000) (1500,1000) (1500,3000) label "Study"`;
    for (const after of [rotated, reversed]) {
      const d = diffPlans(box([before]), box([after]));
      expect(d.rooms).toEqual([{ id: "r", label: "Study", change: "moved", offset: { dx: 500, dy: 0 } }]);
      expect(d.summary).toEqual(["Moved Study 500 mm right"]);
    }
  });

  it("two vertices near-tied on the lowest x do not flip a move into a resize", () => {
    // Red-team probe (round 2): x 1000 and 1004 sit within the 10 mm noise floor, and a
    // sub-10 mm nudge (1506 vs 1502) flips which is "lowest", so canonical starts differed and
    // the move read "S -0.0 m²; left edge +502 mm". Compared as written first, it is a move;
    // the offset is vertex 0's: (1506,1000) − (1000,1000) = 506 mm right.
    // No `grid`: a 50 mm grid would snap 1004/1506/1502 and hide the near-tie.
    const free = (ring: string) => box([`  room id=s polygon ${ring} label "S"`]).replace("  grid 50\n", "");
    const d = diffPlans(
      free("(1000,1000) (4000,1000) (4000,3000) (1004,3000)"),
      free("(1506,1000) (4500,1000) (4500,3000) (1502,3000)"),
    );
    expect(d.rooms).toEqual([{ id: "s", label: "S", change: "moved", offset: { dx: 506, dy: 0 } }]);
    expect(d.summary).toEqual(["Moved S 506 mm right"]);
  });

  it("a room that grew is still `resized`, not moved", () => {
    const d = diffPlans(
      box([`  room id=r at (1000,1000) size 3000x2000 label "Study"`]),
      box([`  room id=r at (1500,1000) size 3500x2000 label "Study"`]),
    );
    expect(d.rooms.map((r) => r.change)).toEqual(["resized"]);
  });
});

suite("PS0.4 defect 2: a re-hosted opening is reported", () => {
  const twoRooms = (doorWall: string) =>
    box(
      [
        `  room id=a at (0,0) size 6000x8000 label "Living"`,
        `  room id=b at (6000,0) size 6000x8000 label "Bed"`,
        `  door on ${doorWall} at 2500 width 800`,
      ],
      `  wall id=p partition thickness 100 { (6000,0) (6000,8000) }\n` +
        `  wall id=q partition thickness 100 { (6000,0) (6000,8000) }\n`,
    );

  it("a door moved from wall p to wall q is re-hosted, naming both walls by their ids", () => {
    const d = diffPlans(twoRooms("p"), twoRooms("q"));
    // Before the fix: `openings` was [] (only a width change was diffed).
    expect(d.openings).toEqual([
      {
        id: "door_1",
        kind: "door",
        change: "rehosted",
        widthBeforeMm: 800,
        widthAfterMm: 800,
        between: ["a", "b"],
        hostBefore: 'wall "p"',
        hostAfter: 'wall "q"',
      },
    ]);
    expect(d.summary).toEqual(['door door_1 re-hosted: wall "p" → wall "q"']);
  });

  it("a relational `between` pair that changed is re-hosted, quoted as written", () => {
    const rel = read("examples/relational.arch");
    const after = rel.replace("door between hall and bed  at 1000", "door between hall and bath at 1500");
    expect(after).not.toBe(rel);
    const d = diffPlans(rel, after);
    expect(d.ok).toBe(true);
    // The derived host is named by its room pair, never `hall|bed`.
    expect(d.openings).toEqual([
      {
        id: "door_2",
        kind: "door",
        change: "rehosted",
        widthBeforeMm: 800,
        widthAfterMm: 800,
        between: ["hall", "bath"],
        hostBefore: 'the partition between "hall" and "bed"',
        hostAfter: 'the partition between "hall" and "bath"',
        relationBefore: "between hall and bed",
        relationAfter: "between hall and bath",
        betweenBefore: ["hall", "bed"],
      },
    ]);
    expect(d.summary.slice(0, 2)).toEqual([
      "door door_2 re-hosted: between hall and bed → between hall and bath",
      "door door_2 joins hall and bed → hall and bath",
    ]);
    expectNoInternalNames(d);
  });

  it("a window moved to another room's edge is re-hosted by its `on <room>.<edge>`", () => {
    const rel = read("examples/relational.arch");
    const d = diffPlans(rel, rel.replace("window on bed.bottom", "window on bath.bottom"));
    const w = d.openings.find((o) => o.kind === "window");
    expect(w).toMatchObject({ change: "rehosted", relationBefore: "on bed.bottom", relationAfter: "on bath.bottom" });
    expect(d.summary).toContain("window window_3 re-hosted: on bed.bottom → on bath.bottom");
    expectNoInternalNames(d);
  });

  it("a derived `open between` opening is named by its clause in every sentence, never `A|B:open`", () => {
    // Red-team round 1: the width/Added/Removed sentences printed `opening living|hall:open`.
    const rel = read("examples/relational.arch");
    const wider = rel.replace("open between living and hall width 1200", "open between living and hall width 1500");
    const without = rel.replace("    open between living and hall width 1200\n", "");
    expect(wider).not.toBe(rel);
    expect(without).not.toBe(rel);
    const resized = diffPlans(rel, wider);
    expect(resized.ok).toBe(true);
    expect(resized.summary).toEqual(["opening between living and hall width 1200 mm → 1500 mm"]);
    expectNoInternalNames(resized);
    const removed = diffPlans(rel, without);
    expect(removed.ok).toBe(true);
    expect(removed.summary).toContain("Removed opening between living and hall");
    expectNoInternalNames(removed);
    const added = diffPlans(without, rel);
    expect(added.summary).toContain("Added opening between living and hall (1200 mm)");
    expectNoInternalNames(added);
  });

  it("a resized door that was also re-hosted keeps its width line and appends the host line", () => {
    const d = diffPlans(twoRooms("p"), twoRooms("q").replace("width 800", "width 900"));
    expect(d.openings[0]).toMatchObject({
      change: "resized",
      widthBeforeMm: 800,
      widthAfterMm: 900,
      hostAfter: 'wall "q"',
    });
    expect(d.summary).toEqual(["door door_1 width 800 mm → 900 mm", 'door door_1 re-hosted: wall "p" → wall "q"']);
  });
});

suite("PS0.4 defect 3: the wall section", () => {
  const studio = read("examples/studio.arch");

  it("authored walls: added, removed, moved, resized and re-thickened", () => {
    const after = studio
      .replace(
        "wall partition thickness 100 { (4000,3000) (7000,3000) }",
        "wall partition thickness 100 { (4000,3100) (7000,3100) }",
      )
      .replace(
        "wall partition thickness 100 { (4000,4400) (7000,4400) }",
        "wall partition thickness 150 { (4000,4400) (7000,4400) }",
      )
      .replace(
        "wall partition thickness 100 { (4000,0) (4000,6000) }",
        "wall partition thickness 100 { (4000,0) (4000,6500) }",
      )
      .replace(
        "  room id=r_living",
        "  wall id=extra partition thickness 100 { (5000,0) (5000,3000) }\n  room id=r_living",
      );
    const d = diffPlans(studio, after);
    expect(d.ok).toBe(true);
    // Before the fix: `walls` did not exist (`PlanDiff` had rooms/openings/furniture only).
    expect(d.walls).toEqual([
      {
        name: 'wall "partition_2"',
        id: "partition_2",
        category: "partition",
        change: "resized",
        lengthBeforeMm: 6000,
        lengthAfterMm: 6500,
      },
      {
        name: 'wall "partition_3"',
        id: "partition_3",
        category: "partition",
        change: "moved",
        offset: { dx: 0, dy: 100 },
      },
      {
        name: 'wall "partition_4"',
        id: "partition_4",
        category: "partition",
        change: "rethickened",
        thicknessBeforeMm: 100,
        thicknessAfterMm: 150,
      },
      {
        name: 'wall "extra"',
        id: "extra",
        category: "partition",
        change: "added",
        lengthAfterMm: 3000,
        thicknessAfterMm: 100,
      },
    ]);
    const back = diffPlans(after, studio);
    expect(back.walls.find((w) => w.id === "extra")).toEqual({
      name: 'wall "extra"',
      id: "extra",
      category: "partition",
      change: "removed",
      lengthBeforeMm: 3000,
      thicknessBeforeMm: 100,
    });
    expect(d.summary).toEqual([
      'Wall "partition_2" 6000 mm → 6500 mm long',
      'Moved wall "partition_3" 100 mm down',
      'Wall "partition_4" thickness 100 mm → 150 mm',
      'Added wall "extra" (partition, 3000 mm long, 100 mm thick)',
    ]);
  });

  it("derived walls follow the rooms that moved, named by their room pair or as the exterior", () => {
    // `examples/relational.arch` widened by 500 mm: Living, Hall and Bedroom grow on their
    // right edge; Kitchen and Bath (placed `right-of`) move. Every wall is derived.
    const rel = read("examples/relational.arch");
    const after = rel
      .replace("size 5000x4000", "size 5500x4000")
      .replace("size 8000x1200", "size 8500x1200")
      .replace("size 5000x2300", "size 5500x2300");
    const d = diffPlans(rel, after);
    expect(d.ok).toBe(true);
    expect(d.rooms.map((r) => [r.id, r.change])).toEqual([
      ["living", "resized"],
      ["kitchen", "moved"],
      ["hall", "resized"],
      ["bed", "resized"],
      ["bath", "moved"],
    ]);
    // Every derived wall is listed under the rooms it followed. The ring follows the whole
    // room union, so it lists every room that changed.
    expect(d.walls.map((w) => [w.name, w.change, w.follows])).toEqual([
      ["the exterior wall derived from the rooms", "resized", ["living", "kitchen", "hall", "bed", "bath"]],
      ['the partition between "living" and "kitchen"', "moved", ["living", "kitchen"]],
      ['the partition between "living" and "hall"', "resized", ["living", "hall"]],
      ['the partition between "kitchen" and "hall"', "moved", ["kitchen", "hall"]],
      ['the partition between "hall" and "bed"', "resized", ["hall", "bed"]],
      ['the partition between "hall" and "bath"', "moved", ["hall", "bath"]],
      ['the partition between "bed" and "bath"', "moved", ["bed", "bath"]],
    ]);
    expect(d.walls.every((w) => w.derived === true && w.id === undefined)).toBe(true);
    expect(d.walls[0]).toMatchObject({ lengthBeforeMm: 31000, lengthAfterMm: 32000 });
    expect(d.walls[1]).toMatchObject({ offset: { dx: 500, dy: 0 } });
    expect(d.summary).toContain(
      "The exterior wall derived from the rooms 31000 mm → 32000 mm long, following Living, Kitchen, Hall, Bedroom and Bath",
    );
    expect(d.summary).toContain(
      'Moved the partition between "bed" and "bath" 500 mm right, following Bedroom and Bath',
    );
    // The doors and windows are hosted by relation, so they followed too: none re-hosted.
    expect(d.openings).toEqual([]);
    expectNoInternalNames(d);
  });

  it("identical plans have no wall changes; the new sentences sit before the trailing Walk-to block", () => {
    expect(diffPlans(studio, studio).walls).toEqual([]);
    const rel = read("examples/relational.arch");
    expect(diffPlans(rel, rel).walls).toEqual([]);
    const d = diffPlans(
      rel,
      rel
        .replace("size 5000x4000", "size 5500x4000")
        .replace("size 8000x1200", "size 8500x1200")
        .replace("size 5000x2300", "size 5500x2300"),
    );
    const firstWalk = d.summary.findIndex((s) => s.startsWith("Walk to "));
    expect(firstWalk).toBeGreaterThan(0);
    expect(d.summary.slice(firstWalk).every((s) => s.startsWith("Walk to "))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The drills (`docs/plans/plan-soundness/repro/README.md`), pinned in full.
// ---------------------------------------------------------------------------

suite("PS0.4 drills", () => {
  it("widen-before.arch → widen-after.arch (`let AW` 4000 → 4500)", () => {
    const d = diffPlans(
      read("docs/plans/plan-soundness/repro/widen-before.arch"),
      read("docs/plans/plan-soundness/repro/widen-after.arch"),
    );
    expect(d.ok).toBe(true);
    // Living (`a`, `size AW x 5000`) grows 500 mm on its right edge: a true resize, 20 → 22.5 m².
    // Bed (`b`, `right-of a`) keeps its 4000×5000 shape and slides 500 mm right: a move. Before
    // the fix it read "resized" with "+0.0 m²" and both x edges +500.
    expect(d.rooms).toEqual([
      {
        id: "a",
        label: "Living",
        change: "resized",
        areaBeforeM2: 20,
        areaAfterM2: 22.5,
        edges: { top: 0, bottom: 0, left: 0, right: 500 },
      },
      { id: "b", label: "Bed", change: "moved", offset: { dx: 500, dy: 0 } },
    ]);
    // The partition door (`door on p at 2500`) stays on wall `p`, so its host is unchanged and
    // there is no host field; but `p` (x = 4000) now stands inside Living, so the spaces it
    // joins went from a↔b to none. Before the fix this door was not reported at all.
    expect(d.openings).toEqual([
      {
        id: "door_2",
        kind: "door",
        change: "rehosted",
        widthBeforeMm: 800,
        widthAfterMm: 800,
        between: [],
        betweenBefore: ["a", "b"],
      },
    ]);
    // Every wall is authored at fixed coordinates and none was edited: no wall changes. (The
    // drill's real defect — Bed now runs 500 mm past the shell — is lint's to report, not a diff's.)
    expect(d.walls).toEqual([]);
    expect(d.summary).toEqual([
      // Living's resize, in the existing wording.
      "Living +2.5 m²; right edge +500 mm",
      // Bed's move (was "Bed +0.0 m²; left edge +500 mm").
      "Moved Bed 500 mm right",
      // The partition door now joins nothing.
      "door door_2 joins a and b → nothing",
      // The walk into Living lengthens by 300 mm (existing circulation delta).
      "Walk to a: 3200 mm → 3500 mm (pinch 840 mm → 840 mm)",
      // Bed has no door route any more (existing state sentence).
      "Walk to b: 7200 mm (pinch 740 mm) → unmeasured (no_door_route)",
    ]);
  });

  it("examples/studio.arch with Living widened by 500 mm (`size 4000x6000` → `size 4500x6000`)", () => {
    const studio = read("examples/studio.arch");
    const after = studio.replace("size 4000x6000", "size 4500x6000");
    expect(after).not.toBe(studio);
    const d = diffPlans(studio, after);
    expect(d.ok).toBe(true);
    // Living / Kitchen is placed `at (0,0)`, so it grows on its right edge: 24 → 27 m². No other
    // room is relational, so none moves (Living now overlaps the right-hand column).
    expect(d.rooms).toEqual([
      {
        id: "r_living",
        label: "Living / Kitchen",
        change: "resized",
        areaBeforeM2: 24,
        areaAfterM2: 27,
        edges: { top: 0, bottom: 0, left: 0, right: 500 },
      },
    ]);
    // The cased opening `o_living` stays on the x = 4000 partition, which now lies inside
    // Living: it joins only the hall. Before the fix this was not reported.
    expect(d.openings).toEqual([
      {
        id: "o_living",
        kind: "opening",
        change: "rehosted",
        widthBeforeMm: 900,
        widthAfterMm: 900,
        between: ["r_hall"],
        betweenBefore: ["r_living", "r_hall"],
      },
    ]);
    // Every wall is authored at fixed coordinates: none follows the room, none changed.
    expect(d.walls).toEqual([]);
    expect(d.summary).toEqual([
      // The resize, in the existing wording.
      "Living / Kitchen +3.0 m²; right edge +500 mm",
      // The opening between Living and the hall no longer reaches Living.
      "opening o_living joins r_living and r_hall → r_hall",
      // With that connection gone, the entrance (in Living) reaches no other room.
      "Walk to r_bed: 7400 mm (pinch 740 mm) → unmeasured (no_door_route)",
      "Walk to r_hall: 4500 mm (pinch 900 mm) → unmeasured (no_door_route)",
      // 4200, not 4600, since fix/examples-sound (2026-10-27) moved the studio's WC along its wall.
      "Walk to r_bath: 4200 mm (pinch 740 mm) → unmeasured (no_door_route)",
    ]);
  });
});
