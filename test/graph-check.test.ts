import { describe, expect, it } from "vitest";
import { checkGraph } from "../src/index.js";

/**
 * Intent-graph check (T3b): compare an intended room-adjacency dict against a plan's
 * compiled interior-door connectivity. Names resolve by id, then case-insensitive
 * label, then room_type; comparisons are undirected and outputs are deterministic.
 */

// r_a ── r_b (interior door on the partition); r_a has the exterior entrance.
const PLAN = `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  room id=r_a at (0,0) size 3000x4000 label "Living" uses living
  room id=r_b at (3000,0) size 3000x4000 label "Bedroom" uses bedroom
  door id=d_main at (1500,4000) width 1000 wall exterior hinge left swing in
  door id=d_ab at (3000,2000) width 900 wall partition hinge left swing in
}`;

describe("checkGraph", () => {
  it("passes when the intent matches the plan exactly (by id)", () => {
    const res = checkGraph(PLAN, { r_a: ["r_b"] });
    expect(res).toEqual({ ok: true, missing_rooms: [], missing_connections: [], extra_connections: [] });
  });

  it("matches room names by label (case-insensitive)", () => {
    const res = checkGraph(PLAN, { Living: ["bedroom"] });
    expect(res.missing_rooms).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("matches room names by room_type", () => {
    const res = checkGraph(PLAN, { LivingRoom: ["MasterRoom"] });
    expect(res.missing_rooms).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("reports a missing connection the plan lacks", () => {
    // Intend r_a ↔ r_b AND a (non-existent) self-standing extra room link.
    const noPartitionDoor = PLAN.replace(/ {2}door id=d_ab .*\n/, "");
    const res = checkGraph(noPartitionDoor, { r_a: ["r_b"] });
    expect(res.ok).toBe(false);
    expect(res.missing_connections).toEqual([["r_a", "r_b"]]);
    expect(res.extra_connections).toEqual([]);
  });

  it("reports an extra connection the plan has but the intent omits", () => {
    const res = checkGraph(PLAN, { r_a: [] });
    expect(res.ok).toBe(false);
    expect(res.extra_connections).toEqual([["r_a", "r_b"]]);
    expect(res.missing_connections).toEqual([]);
  });

  it("reports intended rooms that do not resolve", () => {
    const res = checkGraph(PLAN, { r_a: ["ghost"], nowhere: ["r_b"] });
    expect(res.missing_rooms).toEqual(["ghost", "nowhere"]);
    expect(res.ok).toBe(false);
  });

  it("is deterministic (identical result across runs)", () => {
    expect(checkGraph(PLAN, { r_a: ["r_b"] })).toEqual(checkGraph(PLAN, { r_a: ["r_b"] }));
  });

  it("reports every intended room missing on a fatal compile error", () => {
    const res = checkGraph(`plan "X" { room at (0,0) size 0x0 }`, { a: ["b"] });
    expect(res.ok).toBe(false);
    expect(res.missing_rooms).toEqual(["a"]);
  });
});
