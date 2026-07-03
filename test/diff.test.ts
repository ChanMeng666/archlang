import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { diffPlans } from "../src/diff.js";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const A = fx("diff-a.arch");
const B = fx("diff-b.arch");

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
