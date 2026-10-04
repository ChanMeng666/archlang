import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { diffPlans } from "../src/diff.js";
import { describe as describePlan } from "../src/describe.js";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const A = fx("diff-a.arch");
const B = fx("diff-b.arch");
// Entrance-bearing pair: both have a modeled exterior door, so describe() returns a
// non-null circulation model for BOTH (diff-a/diff-b have none). B relocates the
// interior door 3000 mm along the partition and changes nothing else, so the sole
// delta is the walk into `bed` — this exercises the circulation-delta path in diff.ts.
const circA = fx("diff-circ-a.arch");
const circB = fx("diff-circ-b.arch");

suite("diffPlans — structural", () => {
  it("identical sources produce an empty diff", () => {
    const d = diffPlans(A, A);
    expect(d.ok).toBe(true);
    expect(d.rooms).toEqual([]);
    expect(d.openings).toEqual([]);
    expect(d.furniture).toEqual([]);
  });

  it("detects the resized room with signed area delta", () => {
    const d = diffPlans(A, B);
    const resized = d.rooms.find((r) => r.id === "bed");
    expect(resized?.change).toBe("resized");
    expect(resized!.areaAfterM2! - resized!.areaBeforeM2!).toBeGreaterThan(0);
  });

  it("detects the added window", () => {
    const d = diffPlans(A, B);
    const added = d.openings.filter((o) => o.kind === "window" && o.change === "added");
    expect(added).toHaveLength(1);
  });

  it("detects the relabel without flagging geometry", () => {
    const d = diffPlans(A, B);
    const rel = d.rooms.find((r) => r.id === "bath");
    expect(rel?.change).toBe("relabeled");
  });

  it("reports totals from both sides", () => {
    const d = diffPlans(A, B);
    expect(d.totals.roomsBefore).toBe(d.totals.roomsAfter); // no rooms added/removed in fixtures
    expect(d.totals.floorAreaAfterM2).toBeGreaterThan(d.totals.floorAreaBeforeM2);
  });

  it("degrades to ok:false when a side fails to resolve", () => {
    const d = diffPlans(A, 'plan "broken" {');
    expect(d.ok).toBe(false);
    expect(d.rooms).toEqual([]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(diffPlans(A, B))).toBe(JSON.stringify(diffPlans(A, B)));
  });
});

suite("diffPlans — summary & circulation", () => {
  it("emits one sentence per structural change, rooms first", () => {
    const d = diffPlans(A, B);
    expect(d.summary.length).toBeGreaterThanOrEqual(3); // resized + relabeled + added window
    expect(d.summary[0]).toMatch(/m²/); // room sentences lead
    expect(d.summary.join(" ")).toMatch(/window/i);
  });

  it("identical sources yield an empty summary", () => {
    expect(diffPlans(A, A).summary).toEqual([]);
  });

  it("reports circulation deltas only above the noise floor", () => {
    const d = diffPlans(A, B);
    for (const c of d.circulation) {
      expect(
        Math.abs(c.walkDistanceAfterMm - c.walkDistanceBeforeMm) > 250 ||
          Math.abs(c.bottleneckAfterMm - c.bottleneckBeforeMm) > 50,
      ).toBe(true);
    }
  });
});

suite("diffPlans — circulation deltas (entrance-bearing fixtures)", () => {
  // Precondition, asserted indirectly: an identical entrance-bearing plan yields no
  // circulation delta and no summary. If describe() were returning `circulation: null`
  // for these fixtures (as diff-a/diff-b do), this would still pass — but the
  // non-empty assertions below would then fail, so together they prove the model is
  // non-null AND the delta path runs.
  it("identical entrance-bearing sources yield no circulation delta or summary", () => {
    const d = diffPlans(circA, circA);
    expect(d.ok).toBe(true);
    expect(d.circulation).toEqual([]);
    expect(d.summary).toEqual([]);
  });

  it("detects the relocated-door walk delta with before/after in source order", () => {
    const d = diffPlans(circA, circB);
    expect(d.ok).toBe(true);
    // The move isolates the change to circulation — nothing structural drifted.
    expect(d.rooms).toEqual([]);
    expect(d.openings).toEqual([]);
    expect(d.furniture).toEqual([]);

    expect(d.circulation.length).toBeGreaterThanOrEqual(1);
    for (const c of d.circulation) {
      // Every delta clears the noise floor (>250 mm walk OR >50 mm pinch).
      expect(
        Math.abs(c.walkDistanceAfterMm - c.walkDistanceBeforeMm) > 250 ||
          Math.abs(c.bottleneckAfterMm - c.bottleneckBeforeMm) > 50,
      ).toBe(true);
    }
    // `bed`'s walk shortens when the interior door moves toward the entrance;
    // before is measured from A, after from B (moving the endpoints would flip these).
    const bed = d.circulation.find((c) => c.roomId === "bed");
    expect(bed).toBeDefined();
    expect(bed!.walkDistanceBeforeMm).toBeGreaterThan(bed!.walkDistanceAfterMm);
    expect(bed!.walkDistanceBeforeMm - bed!.walkDistanceAfterMm).toBeGreaterThan(250);
  });

  it("appends Walk-to sentences after any room/opening/furniture sentences", () => {
    const d = diffPlans(circA, circB);
    const walk = d.summary.filter((s) => /^Walk to /.test(s));
    expect(walk.length).toBeGreaterThanOrEqual(1);
    // Frozen ordering: circulation sentences form the trailing block — no room /
    // opening / furniture sentence ever follows a Walk-to sentence.
    const firstWalk = d.summary.findIndex((s) => /^Walk to /.test(s));
    expect(firstWalk).toBeGreaterThanOrEqual(0);
    expect(d.summary.slice(0, firstWalk).every((s) => !/^Walk to /.test(s))).toBe(true);
    expect(d.summary.slice(firstWalk).every((s) => /^Walk to /.test(s))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Positional auto-ids. `room_<n>` numbers rooms in source order, so inserting, deleting or
// reordering a room shifts every later auto-id: the id is a false key. A room whose label
// names exactly one room on EACH side pairs by label before any id is consulted, unless its
// id is authored on both sides (src/diff.ts `matchRooms`, passes 0 and 1).
// ---------------------------------------------------------------------------

const autoPlan = (rooms: string[]): string =>
  `plan "P" {\n  units mm\n` +
  `  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }\n` +
  `${rooms.join("\n")}\n}\n`;
const HALL = `  room at (0,0) size 3000x3000 label "Hall"`;
const KITCHEN = `  room at (3000,0) size 3000x3000 label "Kitchen"`;
const BEDROOM = `  room at (6000,0) size 3000x3000 label "Bedroom"`;

suite("diffPlans — auto-id rooms pair by unique label", () => {
  it("inserting a room first keeps the old rooms paired and reports exactly one added", () => {
    const d = diffPlans(autoPlan([KITCHEN, BEDROOM]), autoPlan([HALL, KITCHEN, BEDROOM]));
    expect(d.ok).toBe(true);
    // Before the fix: "room_1: Hall resized", "room_2: Kitchen resized", "room_3: Bedroom added".
    expect(d.rooms).toEqual([{ id: "room_1", label: "Hall", change: "added", areaAfterM2: 9 }]);
    expect(d.summary).toEqual(["Added Hall (9.0 m²)"]);
  });

  it("deleting the first room reports exactly one removed", () => {
    const d = diffPlans(autoPlan([HALL, KITCHEN, BEDROOM]), autoPlan([KITCHEN, BEDROOM]));
    expect(d.rooms).toEqual([{ id: "room_1", label: "Hall", change: "removed", areaBeforeM2: 9 }]);
  });

  it("reordering the statements alone is an empty diff", () => {
    const d = diffPlans(autoPlan([HALL, KITCHEN, BEDROOM]), autoPlan([BEDROOM, HALL, KITCHEN]));
    expect(d.ok).toBe(true);
    expect(d.rooms).toEqual([]);
    expect(d.summary).toEqual([]);
  });

  it("a moved auto-id room reports its edges once, under its after-side id", () => {
    const moved = `  room at (9000,0) size 3000x3000 label "Hall"`;
    const d = diffPlans(autoPlan([HALL, KITCHEN]), autoPlan([KITCHEN, moved]));
    expect(d.rooms).toEqual([
      {
        id: "room_2",
        label: "Hall",
        change: "resized",
        areaBeforeM2: 9,
        areaAfterM2: 9,
        edges: { top: 0, bottom: 0, left: 9000, right: 9000 },
      },
    ]);
  });

  it("a duplicated label is no key: those rooms keep the id match", () => {
    const k2 = `  room at (6000,0) size 3000x3000 label "Kitchen"`;
    // Two "Kitchen"s after: that label names no single room, so pass 1 skips it and the
    // positional ids pair room_1↔room_1 and room_2↔room_2 as before; room_3 is added.
    const d = diffPlans(autoPlan([HALL, KITCHEN]), autoPlan([HALL, KITCHEN, k2]));
    expect(d.rooms.map((r) => [r.id, r.change])).toEqual([["room_3", "added"]]);
  });

  it("an authored id=room_3 is authored, not positional (the resolver's flag, not the spelling)", () => {
    // Before: one room, AUTHORED id=room_3, labelled Bedroom. After: the same room relabelled
    // Study, plus a new auto-id room labelled Bedroom. Read as authored, room_3 is the stable
    // key: it is relabelled and the new Bedroom is added. Read by spelling (`^room_\d+`), it
    // would look positional and pair with the new Bedroom by label instead.
    const r3 = (label: string) => `  room id=room_3 at (0,0) size 3000x3000 label "${label}"`;
    const d = diffPlans(autoPlan([r3("Bedroom")]), autoPlan([r3("Study"), BEDROOM]));
    expect(d.ok).toBe(true);
    expect(d.rooms.find((r) => r.id === "room_3")).toEqual({ id: "room_3", label: "Study", change: "relabeled" });
    const added = d.rooms.filter((r) => r.change === "added");
    expect(added).toHaveLength(1);
    expect(added[0]!.label).toBe("Bedroom");
    expect(d.rooms).toHaveLength(2);
  });

  // backlog M.7: an insertion plus a newly authored `id=` in the same edit. The id authored
  // on ONE side only is no stable key, so the unique label pairs the old auto-id Hall with
  // the new `id=hall` Hall, and the inserted Kitchen is the one added. Before the fix pass 1
  // read labels only for rooms auto on both sides, so the positional room_1 paired Hall with
  // Kitchen: `Relabeled room_1 to "Kitchen"`, `Added Hall`.
  it("M.7: an insertion plus a newly authored id= keeps Hall and adds Kitchen", () => {
    const kitchenAtHall = `  room at (0,0) size 3000x3000 label "Kitchen"`;
    const hallMoved = `  room id=hall at (3000,0) size 3000x3000 label "Hall"`;
    const fwd = diffPlans(autoPlan([HALL]), autoPlan([kitchenAtHall, hallMoved]));
    expect(fwd.ok).toBe(true);
    expect(fwd.rooms).toEqual([
      {
        id: "hall",
        label: "Hall",
        change: "resized",
        areaBeforeM2: 9,
        areaAfterM2: 9,
        edges: { top: 0, bottom: 0, left: 3000, right: 3000 },
      },
      { id: "room_1", label: "Kitchen", change: "added", areaAfterM2: 9 },
    ]);
    expect(fwd.summary).toEqual(["Hall +0.0 m²; left edge +3000 mm", "Added Kitchen (9.0 m²)"]);
    const back = diffPlans(autoPlan([kitchenAtHall, hallMoved]), autoPlan([HALL]));
    expect(back.summary).toEqual(["Hall +0.0 m²; left edge -3000 mm", "Removed Kitchen (9.0 m²)"]);
  });

  it("M.7: Hall kept in place under a new id= while Kitchen is inserted is one added room", () => {
    const hallAuthored = `  room id=hall at (0,0) size 3000x3000 label "Hall"`;
    const d = diffPlans(autoPlan([HALL]), autoPlan([KITCHEN, hallAuthored]));
    expect(d.ok).toBe(true);
    expect(d.rooms).toEqual([{ id: "room_1", label: "Kitchen", change: "added", areaAfterM2: 9 }]);
    expect(d.summary).toEqual(["Added Kitchen (9.0 m²)"]);
  });

  it("an id authored on both sides outranks a unique label", () => {
    // Labels swapped between two authored ids: two relabels, never a cross-id pairing.
    const r = (id: string, x: number, label: string) => `  room id=${id} at (${x},0) size 3000x3000 label "${label}"`;
    const d = diffPlans(
      autoPlan([r("a", 0, "Hall"), r("b", 3000, "Kitchen")]),
      autoPlan([r("a", 0, "Kitchen"), r("b", 3000, "Hall")]),
    );
    expect(d.rooms).toEqual([
      { id: "a", label: "Kitchen", change: "relabeled" },
      { id: "b", label: "Hall", change: "relabeled" },
    ]);
  });

  it("circulation follows the room pairing, not a shifted auto-id", () => {
    // diff-circ-a's two rooms without ids, then with their statements swapped: the auto-ids
    // swap (Living room_1 ↔ Bedroom room_1) and the plan does not change. Comparing walks by
    // id reported Living's walk against Bedroom's.
    const lines = circA.replace("room id=living ", "room ").replace("room id=bed    ", "room ").split("\n");
    const li = lines.findIndex((l) => /label "Living"/.test(l));
    const bi = lines.findIndex((l) => /label "Bedroom"/.test(l));
    const swappedLines = [...lines];
    [swappedLines[li], swappedLines[bi]] = [lines[bi]!, lines[li]!];
    const plain = lines.join("\n");
    const swapped = swappedLines.join("\n");
    expect(swapped).not.toBe(plain);
    expect(describePlan(plain).circulation).not.toBeNull();
    const d = diffPlans(plain, swapped);
    expect(d.ok).toBe(true);
    expect(d.rooms).toEqual([]);
    expect(d.circulation).toEqual([]);
    expect(d.summary).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A room that becomes blocked or unmeasured has no walk on one side, so it cannot be a
// `CirculationChange` (frozen API, two walks). It used to vanish from the diff; it is now a
// "Walk to" sentence built from each side's own verdict, worded with the API's own vocabulary
// (`rooms[]`/`blocked[]`/`unmeasured[]` and the `unmeasured` reason codes).
// ---------------------------------------------------------------------------

suite("diffPlans — rooms that become blocked or unmeasured", () => {
  // A wardrobe across the inside of `bed`'s only doorway blocks it (circulation.blocked).
  const blocked = circA.replace(/\n}\s*$/, "\n  furniture wardrobe at (4050,400) size 600x1200 in bed\n}\n");

  it("precondition: the wardrobe blocks bed", () => {
    const c = describePlan(blocked).circulation!;
    expect(c.blocked?.map((b) => b.roomId)).toEqual(["bed"]);
    expect(c.rooms.map((r) => r.roomId)).not.toContain("bed");
  });

  it("measured → blocked is reported, and so is the reverse", () => {
    const fwd = diffPlans(circA, blocked);
    expect(fwd.ok).toBe(true);
    expect(fwd.circulation).toEqual([]); // no CirculationChange: the frozen shape needs two walks
    expect(fwd.summary.filter((s) => s.startsWith("Walk to "))).toEqual([
      "Walk to bed: 8000 mm (pinch 740 mm) → blocked (widest way in 0 mm)",
    ]);
    const back = diffPlans(blocked, circA);
    expect(back.summary.filter((s) => s.startsWith("Walk to "))).toEqual([
      "Walk to bed: blocked (widest way in 0 mm) → 8000 mm (pinch 740 mm)",
    ]);
  });

  it("measured → unmeasured names the model's reason, and so does the reverse", () => {
    // Remove the interior door: bed has no door route at all.
    const noDoor = circA.replace(/^\s*door id=d_int .*$/m, "");
    expect(describePlan(noDoor).circulation!.unmeasured).toEqual([{ roomId: "bed", reason: "no_door_route" }]);
    expect(diffPlans(circA, noDoor).summary).toContain(
      "Walk to bed: 8000 mm (pinch 740 mm) → unmeasured (no_door_route)",
    );
    expect(diffPlans(noDoor, circA).summary).toContain(
      "Walk to bed: unmeasured (no_door_route) → 8000 mm (pinch 740 mm)",
    );
  });

  // backlog M.7: two verdicts the diff used to treat as "the same" although they differ.
  it("M.7: blocked on both sides with a different widest way in is reported", () => {
    // Shifted 250 mm into bed, the wardrobe still seals the doorway but leaves a 200 mm way in.
    const wider = circA.replace(/\n}\s*$/, "\n  furniture wardrobe at (4300,400) size 600x1200 in bed\n}\n");
    expect(describePlan(wider).circulation!.blocked).toEqual([{ roomId: "bed", widestWayInMm: 200 }]);
    expect(describePlan(blocked).circulation!.blocked).toEqual([{ roomId: "bed", widestWayInMm: 0 }]);
    const fwd = diffPlans(blocked, wider);
    expect(fwd.ok).toBe(true);
    expect(fwd.rooms).toEqual([]);
    expect(fwd.furniture).toEqual([]);
    expect(fwd.circulation).toEqual([]);
    expect(fwd.summary).toEqual(["Walk to bed: blocked (widest way in 0 mm) → blocked (widest way in 200 mm)"]);
    expect(diffPlans(wider, blocked).summary).toEqual([
      "Walk to bed: blocked (widest way in 200 mm) → blocked (widest way in 0 mm)",
    ]);
  });

  it("M.7: an entrance added or removed reports each matched room's walk against no model", () => {
    const noEntrance = circA.replace(/^\s*door id=d_main .*$/m, "");
    expect(describePlan(noEntrance).circulation).toBeNull();
    const fwd = diffPlans(circA, noEntrance);
    expect(fwd.ok).toBe(true);
    expect(fwd.circulation).toEqual([]);
    expect(fwd.summary).toEqual([
      "Removed door d_main",
      "Walk to living: 2300 mm (pinch 940 mm) → no circulation model",
      "Walk to bed: 8000 mm (pinch 740 mm) → no circulation model",
    ]);
    expect(diffPlans(noEntrance, circA).summary).toEqual([
      "Added door d_main (1000 mm)",
      "Walk to living: no circulation model → 2300 mm (pinch 940 mm)",
      "Walk to bed: no circulation model → 8000 mm (pinch 740 mm)",
    ]);
    // No model on either side is no change.
    expect(diffPlans(noEntrance, noEntrance).summary).toEqual([]);
  });

  it("state sentences stay inside the trailing Walk-to block", () => {
    const d = diffPlans(circA, blocked);
    const firstWalk = d.summary.findIndex((s) => /^Walk to /.test(s));
    expect(firstWalk).toBeGreaterThanOrEqual(0);
    expect(d.summary.slice(firstWalk).every((s) => /^Walk to /.test(s))).toBe(true);
  });
});
