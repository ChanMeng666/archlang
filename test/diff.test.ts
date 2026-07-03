import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { diffPlans } from "../src/diff.js";

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
