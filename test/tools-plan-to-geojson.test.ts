/**
 * The converter recipe (`tools/plan-to-geojson/`, language reference § Convert Plan JSON to another
 * format): the committed example is what the two commands write, the output keeps the rules of RFC
 * 7946, and the script's own arithmetic answers to the core's: its arc against `arcTessellate`, its
 * room rings against the area `describe()` reports. The script imports nothing, so a reader can copy
 * it out of the repository.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe, planToJson } from "../src/index.js";
import { arcFromChord, arcTessellate } from "../src/geometry/arc.js";
// @ts-expect-error a plain .mjs recipe, outside the TypeScript program on purpose
import { flattenArc, planToGeoJson } from "../tools/plan-to-geojson/plan_to_geojson.mjs";

type Position = [number, number];
type Geometry = { type: string; coordinates: unknown };
type Feature = { type: string; geometry: Geometry; properties: Record<string, unknown> };
type Collection = { type: string; name: string; units: string; walls_derived?: boolean; features: Feature[] };

const toGeoJson = planToGeoJson as (plan: unknown) => Collection;
const flatten = flattenArc as (
  a: { x: number; y: number },
  b: { x: number; y: number },
  arc: { radius: number; dir?: string; major?: boolean },
) => Array<{ x: number; y: number }>;

const SCRIPT = "tools/plan-to-geojson/plan_to_geojson.mjs";
const dir = new URL("../tools/plan-to-geojson/example/", import.meta.url);
const read = (f: string): string => readFileSync(new URL(f, dir), "utf8");
const source = read("plan.arch");

const shoelace = (ring: Position[]): number => {
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++) sum += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return sum / 2;
};

const positions = (g: Geometry): Position[] => {
  if (g.type === "Point") return [g.coordinates as Position];
  if (g.type === "LineString") return g.coordinates as Position[];
  return (g.coordinates as Position[][]).flat();
};

suite("the worked example", () => {
  const plan = planToJson(source).json;
  const out = toGeoJson(plan);

  it("plan.json is what `compile -f json` writes", () => {
    expect(read("plan.json")).toBe(`${JSON.stringify(plan, null, 2)}\n`);
  });

  it("plan.geojson is what the script writes, as a process", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "tools/plan-to-geojson/example/plan.json"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(read("plan.geojson"));
  });

  it("the document's arc reaches the file as a curve, not its chord", () => {
    expect(plan?.walls[0]?.points[2]?.arc).toEqual({ radius: 2500, dir: "cw" });
    const wall = out.features.find((f) => f.properties.layer === "wall")!;
    const line = positions(wall.geometry);
    expect(line.length).toBeGreaterThan(plan!.walls[0]!.points.length + 7);
    // A bow east of the chord: x goes past 6 m. A chord would stop there.
    expect(Math.max(...line.map(([x]) => x))).toBeGreaterThan(6.5);
  });

  it("the closed wall comes back to its start, in metres, with y up", () => {
    const wall = out.features.find((f) => f.properties.layer === "wall")!;
    const line = positions(wall.geometry);
    expect(line[0]).toEqual(line.at(-1));
    expect(Math.min(...line.map(([, y]) => y))).toBeLessThan(-3.9);
    expect(Math.max(...line.map(([, y]) => y))).toBe(0);
  });

  it("every layer the plan has, one feature each", () => {
    const count = (layer: string): number => out.features.filter((f) => f.properties.layer === layer).length;
    expect(count("room")).toBe(plan!.rooms.length);
    expect(count("wall")).toBe(plan!.walls.length);
    expect(count("opening")).toBe(plan!.openings.length);
    expect(count("furniture")).toBe(plan!.furniture.length);
    expect(count("column")).toBe(plan!.columns?.length);
    expect(out).toMatchObject({ type: "FeatureCollection", name: "Bay studio", units: "m" });
  });

  it("each room's ring has the area the core reports", () => {
    const facts = describe(source);
    for (const f of out.features.filter((x) => x.properties.layer === "room")) {
      const ring = (f.geometry.coordinates as Position[][])[0]!;
      const want = facts.rooms.find((r) => r.id === f.properties.id)!;
      expect(shoelace(ring)).toBeCloseTo(want.area_m2, 6);
    }
  });

  it("keeps RFC 7946: closed rings, counter-clockwise, two numbers a position, six decimals", () => {
    for (const f of out.features) {
      expect(f.type).toBe("Feature");
      for (const p of positions(f.geometry)) {
        expect(p).toHaveLength(2);
        for (const v of p) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Object.is(v, -0)).toBe(false);
          expect(Math.round(v * 1e6) / 1e6).toBe(v);
        }
      }
      if (f.geometry.type !== "Polygon") continue;
      for (const ring of f.geometry.coordinates as Position[][]) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        expect(shoelace(ring)).toBeGreaterThan(0);
      }
    }
  });
});

suite("the arc rule is the core's", () => {
  const CASES: Array<[string, boolean]> = [
    ["cw", false],
    ["ccw", false],
    ["cw", true],
    ["ccw", true],
  ];

  it.each(CASES)("%s, major %s", (dirWord, major) => {
    const a = { x: 100, y: 200 };
    const b = { x: 3100, y: 1400 };
    const r = 2500;
    const arc = arcFromChord(a, b, r, dirWord as "cw" | "ccw", major)!;
    const core = arcTessellate(arc);
    const script = [a, ...flatten(a, b, { radius: r, dir: dirWord, major }), b];
    expect(script).toHaveLength(core.length);
    script.forEach((p, i) => {
      expect(p.x).toBeCloseTo(core[i]!.x, 6);
      expect(p.y).toBeCloseTo(core[i]!.y, 6);
    });
  });

  it("a word left out means what it means in `.arch`", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 2000, y: 0 };
    expect(flatten(a, b, { radius: 1500 })).toEqual(flatten(a, b, { radius: 1500, dir: "ccw", major: false }));
  });
});

suite("a document it was not written from", () => {
  const room = (id: string) => ({ id, room_type: "LivingRoom", x: 0, y: 0, width: 4000, height: 3000 });

  it("a hand-written room has no floor_polygon, and a rectangle will do", () => {
    const out = toGeoJson({ plan: "p", rooms: [room("a")], walls: [], openings: [], furniture: [] });
    expect(shoelace((out.features[0]!.geometry.coordinates as Position[][])[0]!)).toBeCloseTo(12, 9);
  });

  it("says when the walls are not in the document", () => {
    const out = toGeoJson({
      plan: "p",
      rooms: [room("a")],
      walls: [],
      walls_from_rooms: { exterior: 200, partition: 100 },
      openings: [],
      furniture: [],
    });
    expect(out.walls_derived).toBe(true);
    expect(out.features.filter((f) => f.properties.layer === "wall")).toEqual([]);
  });

  it("a ring that already closes is not closed twice, in either direction", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 0 },
    ];
    for (const polygon of [pts, [...pts].reverse()]) {
      const out = toGeoJson({ plan: "p", rooms: [{ id: "a", polygon }], walls: [], openings: [], furniture: [] });
      const ring = (out.features[0]!.geometry.coordinates as Position[][])[0]!;
      expect(ring).toHaveLength(4);
      expect(shoelace(ring)).toBeCloseTo(6, 9);
    }
  });

  it("a ring or a wall too short to be GeoJSON is left out", () => {
    const out = toGeoJson({
      plan: "p",
      rooms: [
        { id: "a", polygon: [{ x: 0, y: 0 }] },
        { id: "b", polygon: [] },
      ],
      walls: [
        { id: "one", points: [{ x: 0, y: 0 }], closed: true },
        { id: "none", points: [] },
      ],
      openings: [],
      furniture: [],
    });
    expect(out.features).toEqual([]);
  });

  it("an arc on a wall's first point has no edge to curve, and is read as the point", () => {
    const points = [
      { x: 0, y: 0, arc: { radius: 500 } },
      { x: 1000, y: 0 },
    ];
    const out = toGeoJson({ plan: "p", rooms: [], walls: [{ id: "w", points }], openings: [], furniture: [] });
    expect(positions(out.features[0]!.geometry)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it("refuses a version it does not know, rather than guess", () => {
    expect(() => toGeoJson({ version: 2, plan: "p", rooms: [] })).toThrow(/version 2/);
  });

  it("carries no import, so it can be copied out of the repository", () => {
    const text = readFileSync(SCRIPT, "utf8");
    const imports = [...text.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["node:fs", "node:url"]);
  });
});
