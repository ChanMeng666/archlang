/**
 * A rectilinear room with derived walls (issue #363): a new input to this package, and one its
 * corpus does not hold, so a green corpus run says nothing about it. An L stays one room: one floor
 * over the ring, walls with `#n` names from one pair, and every shell closed.
 */
import { describe as describePlan, resolvePlan } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, wallOwnership } from "../src/index.js";
import { openEdges, signedVolume as volume } from "../src/node.js";

const PLAN = `plan "L" {
  units mm
  room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living
  room id=bed at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom
  room id=bath at (6000,0) size 2000x3000 label "Bath" uses bath
  walls from rooms exterior 200 partition 100
  door at (3000,4500) width 800 wall partition hinge left swing in
  door at (6000,1500) width 800 wall partition hinge left swing in
  door at (0,1500) width 1000 wall exterior hinge left swing in
  window at (1500,0) width 1500 wall exterior
}
`;

describe("a derived L", () => {
  const r = adaptPlan(PLAN);
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  const mesh = buildMesh(r.scene);
  const level = r.scene.levels[0];

  it("adapts with its walls as the core named them", () => {
    expect(level?.walls.map((w) => w.id)).toEqual(["exterior", "liv|bed", "liv|bed#2", "liv|bath"]);
  });

  it("is one floor over the ring, of the area describe() gives", () => {
    const floors = level?.floors.filter((f) => f.id === "liv") ?? [];
    expect(floors).toHaveLength(1);
    expect(floors[0]?.polygon.outer).toHaveLength(6);
    const nd = mesh.nodes.find((x) => x.kind === "floor" && x.id === "liv");
    const m2 = (nd?.shells ?? []).reduce((sum, sh) => {
      const ys = sh.positions.filter((_, i) => i % 3 === 1);
      return sum + volume(sh) / (Math.max(...ys) - Math.min(...ys)) / 1e12;
    }, 0);
    expect(Math.abs(m2 - (describePlan(PLAN).rooms[0]?.area_m2 ?? 0))).toBeLessThanOrEqual(0.02);
  });

  it("every shell is closed and points out", () => {
    const shells = mesh.nodes.flatMap((nd) => nd.shells);
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.filter((s) => openEdges(s) !== 0 || !(volume(s) > 0))).toEqual([]);
  });

  it("the walls' owned regions tile the joined solid", () => {
    const ir = resolvePlan(PLAN).ir;
    const own = wallOwnership(ir?.walls ?? []);
    const sum = own.owned.reduce((s, w) => s + w.area, 0);
    expect(Math.abs(sum - own.fillArea) / own.fillArea).toBeLessThan(1e-9);
    expect(own.owned.map((w) => w.wall.id).sort()).toEqual(["exterior", "liv|bath", "liv|bed", "liv|bed#2"]);
  });

  it("a door written by the rooms, on either run, is the door written by position", () => {
    // The relation is a way of saying where; what reaches this package is the same door.
    const twin = (a: string, b: string): string =>
      PLAN.replace("door at (3000,4500) width 800 wall partition hinge left swing in", a).replace(
        "door at (6000,1500) width 800 wall partition hinge left swing in",
        b,
      );
    const mesh3 = (src: string) => {
      const out = adaptPlan(src);
      if (!out.ok) throw new Error(`refused: ${out.refusal.code}`);
      return JSON.stringify(buildMesh(out.scene));
    };
    const onBoth = (at: string, relation: string): void => {
      expect(
        mesh3(
          twin(
            `door between liv and bed at ${relation} width 800 hinge left swing in`,
            "door between liv and bath at center width 800 hinge left swing in",
          ),
        ),
      ).toBe(mesh3(twin(`door at ${at} width 800 wall partition hinge left swing in`, PLAN.split("\n")[7]!.trim())));
    };
    onBoth("(3000,4500)", "1500 from bed.top");
    onBoth("(4500,3000)", "1500 from bed.left");
  });
});
