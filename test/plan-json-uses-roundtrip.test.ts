/**
 * A room's uses survive a Plan JSON round trip (checker-reach CR2 group B).
 *
 * `planToJson` writes `uses` only when the source authored it; a room whose use comes from
 * its label ("Hall") gets only the `room_type` that use maps to (`Entrance`). Several uses
 * share one `room_type` (hall, circulation and entry are all `Entrance`), and the way back
 * used to turn the `room_type` into its primary use, so `label "Hall"` came back as
 * `label "Hall" uses entry`: a different room for `describe()` and every rule that reads
 * uses. The way back now writes no `uses` when the label already reads as that
 * `room_type`, so the label says it again, exactly as the source did.
 */
import { describe, expect, it } from "vitest";
import { type PlanJson, describe as describePlan, planFromJson, planToJson } from "../src/index.js";
import { sourceFromJson } from "../src/cli/io.js";

const plan = (room: string): string => `plan "U" {\n  units mm\n  ${room}\n}\n`;

const uses = (src: string): Array<{ id: string; uses: unknown }> =>
  (describePlan(src).rooms ?? []).map((r) => ({ id: r.id, uses: (r as { uses?: unknown }).uses }));

const back = (src: string): string => {
  const { json, diagnostics } = planToJson(src);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const r = planFromJson(json as PlanJson);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return r.source!;
};

const roomLine = (src: string): string =>
  src
    .split("\n")
    .find((l) => l.trim().startsWith("room "))!
    .trim();

describe("Plan JSON round trip keeps the room's uses", () => {
  it.each([
    ['room id=h at (0,0) size 3000x2000 label "Hall"', "hall"],
    ['room id=h at (0,0) size 1200x6000 label "Corridor"', "hall"],
    ['room id=u at (0,0) size 2000x2000 label "Laundry"', "utility"],
    ['room id=w at (0,0) size 1500x1500 label "WC"', "wc"],
    ['room id=g at (0,0) size 3000x6000 label "Garage"', "garage"],
  ])("a label-inferred use comes back as the label, not the room_type's primary use: %s", (room, use) => {
    const src = plan(room);
    expect(JSON.stringify(uses(src))).toContain(use); // the label really reads as that use
    const b = back(src);
    expect(roomLine(b)).not.toContain(" uses ");
    expect(uses(b)).toEqual(uses(src));
    expect(describePlan(b)).toEqual(describePlan(src));
  });

  it("a label that reads as several uses keeps all of them (it used to keep only the dominant one)", () => {
    const src = plan('room id=k at (0,0) size 4000x3000 label "Kitchen / Dining"');
    const before = uses(src);
    expect(JSON.stringify(before)).toContain("dining");
    expect(uses(back(src))).toEqual(before);
  });

  it("an authored `uses hall` survives exactly, through the library and the CLI's --from-json", () => {
    const src = plan('room id=h at (0,0) size 3000x2000 label "Hall" uses hall');
    expect(roomLine(back(src))).toBe('room id=h at (0,0) size 3000x2000 label "Hall" uses hall');
    const conv = sourceFromJson(JSON.stringify(planToJson(src).json));
    if ("error" in conv) throw new Error("--from-json refused its own export");
    expect(roomLine(conv.source)).toBe('room id=h at (0,0) size 3000x2000 label "Hall" uses hall');
    expect(uses(conv.source)).toEqual(uses(src));
  });

  it("an authored use that disagrees with the label still wins", () => {
    const src = plan('room id=h at (0,0) size 3000x2000 label "Hall" uses office');
    expect(roomLine(back(src))).toContain("uses office");
    expect(uses(back(src))).toEqual(uses(src));
  });
});

describe("room_type alone still reads as its primary use (hand-written JSON)", () => {
  const room = (r: Record<string, unknown>): PlanJson =>
    ({ version: 1, units: "mm", rooms: [{ id: "a", x: 0, y: 0, width: 3000, height: 3000, ...r }] }) as PlanJson;

  it("with no label, room_type Entrance is `uses entry`", () => {
    expect(roomLine(planFromJson(room({ room_type: "Entrance" })).source!)).toContain("uses entry");
  });

  it("a label that reads as another room_type does not override room_type", () => {
    const line = roomLine(planFromJson(room({ label: "Hall", room_type: "Kitchen" })).source!);
    expect(line).toContain("uses kitchen");
  });

  it("a label that reads as nothing takes room_type's use", () => {
    const line = roomLine(planFromJson(room({ label: "Room 4", room_type: "StudyRoom" })).source!);
    expect(line).toContain("uses office");
  });

  it("explicit `uses` win over both", () => {
    const line = roomLine(planFromJson(room({ label: "Hall", room_type: "Entrance", uses: ["circulation"] })).source!);
    expect(line).toContain("uses circulation");
  });
});
