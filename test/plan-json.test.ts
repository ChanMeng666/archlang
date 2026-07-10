import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  planFromJson,
  planToJson,
  planJsonToArch,
  astToJson,
  compile,
  describe as describePlan,
  roomTypeForUses,
  usesForRoomType,
  ROOM_TYPES,
  USE_TO_ROOM_TYPE,
  ROOM_TYPE_TO_USE,
  PLAN_JSON_SCHEMA,
  type PlanJson,
} from "../src/index.js";

/**
 * Structured JSON I/O (v1.13): planFromJson / planToJson / astToJson.
 *
 * The shape follows the RPLAN / DStruct2Design convention (snake_case, room_type
 * enum, input_graph). The load-bearing guarantees: shape errors are catalogued and
 * name their JSON path; and a non-scripting plan round-trips to byte-identical SVG.
 */

// A small hand-written plan exercising walls, rooms, doors/windows/openings, and
// furniture — a non-scripting, grouped plan (the round-trip class).
const FIXTURE_A = `plan "Fixture A" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  room id=r_a at (0,0) size 3000x4000 label "Living" uses living
  room id=r_b at (3000,0) size 3000x4000 label "Bedroom" uses bedroom
  door id=d_main at (1500,4000) width 1000 wall exterior hinge left swing in
  door id=d_ab at (3000,2000) width 900 wall partition hinge left swing in
  window at (0,2000) width 1200 wall exterior
  furniture bed at (3300,300) size 1500x2000 label "Bed"
}`;

const FIXTURE_B = `plan "Fixture B" {
  units mm
  grid 100
  scale 1:100
  north right
  wall exterior thickness 250 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall partition thickness 100 { (4000,0) (4000,5000) }
  room id=k at (0,0) size 4000x5000 label "Kitchen"
  room id=b at (4000,0) size 4000x5000 label "Master Bedroom"
  opening id=o1 at (4000,2500) width 1000 wall partition
  door id=d at (2000,5000) width 900 wall exterior hinge right swing in
  window at (6000,0) width 1600 wall exterior
  furniture sofa at (300,300) size 2000x900 label "Sofa"
  dim (0,5000)->(8000,5000) offset 700 text "8000"
  title { project "B" drawn_by "T" date "2026-07-10" }
}`;

describe("plan-json — round-trip byte-identity (SVG)", () => {
  const roundTrips = (src: string): void => {
    const { json, diagnostics } = planToJson(src);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(json).toBeDefined();
    const { source, diagnostics: fromDiags } = planFromJson(json as PlanJson);
    expect(fromDiags.filter((d) => d.severity === "error")).toEqual([]);
    expect(source).toBeDefined();
    expect(compile(source!).svg).toBe(compile(src).svg);
  };

  it("round-trips two hand-written fixtures to identical SVG", () => {
    roundTrips(FIXTURE_A);
    roundTrips(FIXTURE_B);
  });

  it("round-trips examples/studio.arch to identical SVG", () => {
    roundTrips(readFileSync("examples/studio.arch", "utf8"));
  });

  it("round-trips examples/two-bed.arch to identical SVG", () => {
    roundTrips(readFileSync("examples/two-bed.arch", "utf8"));
  });
});

describe("plan-json — planToJson projection & enrichments", () => {
  const { json } = planToJson(FIXTURE_A);
  const p = json!;

  it("emits the versioned RPLAN-style shape", () => {
    expect(p.version).toBe(1);
    expect(p.units).toBe("mm");
    expect(p.plan).toBe("Fixture A");
    expect(p.grid).toBe(50);
  });

  it("derives room_type, area, floor_polygon and totals", () => {
    const a = p.rooms.find((r) => r.id === "r_a")!;
    expect(a.room_type).toBe("LivingRoom");
    expect(a.uses).toEqual(["living"]);
    expect(a.area).toBe(12);
    expect(a.floor_polygon).toEqual([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    expect(p.room_count).toBe(2);
    expect(p.total_area).toBe(24);
    expect(p.room_types).toEqual(["LivingRoom", "MasterRoom"]);
  });

  it("keeps doors/windows/openings in one source-ordered openings[] with kinds", () => {
    expect(p.openings.map((o) => o.kind)).toEqual(["door", "door", "window"]);
    const door = p.openings.find((o) => o.id === "d_main")!;
    expect(door.hinge).toBe("left");
    expect(door.swing).toBe("in");
    expect(door.wall).toBe("exterior");
  });

  it("projects the interior input_graph (exterior excluded)", () => {
    expect(p.input_graph).toEqual({ r_a: ["r_b"], r_b: ["r_a"] });
    // The front door (exterior→r_a) is a `front` edge, not an interior adjacency.
    expect(p.edges).toContainEqual({ from: "exterior", to: "r_a", via: "door", type: "front" });
    expect(p.edges).toContainEqual({ from: "r_a", to: "r_b", via: "door", type: "interior" });
  });
});

describe("plan-json — planFromJson shape validation", () => {
  it("flags a non-numeric room field with a path-bearing E_JSON_SCHEMA", () => {
    const { ast, diagnostics } = planFromJson({
      plan: "X",
      rooms: [{ x: 0, y: 0, width: "big", height: 3000 }],
      walls: [],
      openings: [],
      furniture: [],
    });
    expect(ast).toBeUndefined();
    const d = diagnostics.find((x) => x.code === "E_JSON_SCHEMA");
    expect(d).toBeDefined();
    expect(d!.message).toContain("/rooms/0/width");
  });

  it("flags an unknown opening kind with E_JSON_KIND naming the path", () => {
    const { ast, diagnostics } = planFromJson({
      plan: "X",
      rooms: [],
      walls: [],
      openings: [{ kind: "portal", x: 0, y: 0, width: 900 }],
      furniture: [],
    });
    expect(ast).toBeUndefined();
    const d = diagnostics.find((x) => x.code === "E_JSON_KIND");
    expect(d).toBeDefined();
    expect(d!.message).toContain("/openings/0/kind");
  });

  it("rejects the top-level being a non-object", () => {
    const { diagnostics } = planFromJson(42);
    expect(diagnostics.some((d) => d.code === "E_JSON_SCHEMA")).toBe(true);
  });

  it("rejects scripting/import keys the JSON form cannot represent", () => {
    const { diagnostics } = planFromJson({
      plan: "X",
      rooms: [],
      walls: [],
      openings: [],
      furniture: [],
      imports: ["x"],
    });
    expect(diagnostics.some((d) => d.code === "E_JSON_SCHEMA" && d.message.includes("/imports"))).toBe(true);
  });

  it("builds a valid AST from a well-formed JSON plan", () => {
    const { ast, source, diagnostics } = planFromJson(planToJson(FIXTURE_A).json as object);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(ast).toBeDefined();
    expect(source).toContain('plan "Fixture A"');
  });
});

describe("plan-json — determinism", () => {
  it("planToJson is byte-stable across runs", () => {
    expect(JSON.stringify(planToJson(FIXTURE_B).json)).toBe(JSON.stringify(planToJson(FIXTURE_B).json));
  });
  it("planJsonToArch is byte-stable across runs", () => {
    const j = planToJson(FIXTURE_B).json;
    expect(planJsonToArch(j).source).toBe(planJsonToArch(j).source);
  });
});

describe("plan-json — astToJson", () => {
  it("projects settings, body and spans without expanding scripting", () => {
    const src = `plan "S" {
  units mm
  let n = 3
  for i in 0..n { room at (i,0) size 100x100 }
}`;
    const { ast } = compile(src);
    const j = astToJson(ast!) as Record<string, unknown>;
    expect(j.kind).toBe("plan");
    expect(j.name).toBe("S");
    const body = j.body as Array<Record<string, unknown>>;
    // The `let` and `for` survive as their node kinds (no expansion) with spans.
    expect(body.map((s) => s.kind)).toContain("let");
    const forNode = body.find((s) => s.kind === "for")!;
    expect(forNode.span).toBeDefined();
  });
});

describe("plan-json — room-type mapping", () => {
  it("maps uses → room_type by dominant priority", () => {
    expect(roomTypeForUses(["living", "kitchen"])).toBe("LivingRoom");
    expect(roomTypeForUses(["kitchen"])).toBe("Kitchen");
    expect(roomTypeForUses(["bath"])).toBe("Bathroom");
    expect(roomTypeForUses(["wc"])).toBe("Bathroom");
    expect(roomTypeForUses([])).toBe("Room");
  });
  it("maps room_type → uses (inverse, lossy)", () => {
    expect(usesForRoomType("MasterRoom")).toEqual(["bedroom"]);
    expect(usesForRoomType("StudyRoom")).toEqual(["office"]);
    expect(usesForRoomType("Room")).toEqual([]);
    expect(usesForRoomType("Nonsense")).toEqual([]);
  });
  it("the tables cover the whole enum and vocabulary", () => {
    for (const rt of ROOM_TYPES) expect(rt in ROOM_TYPE_TO_USE).toBe(true);
    for (const u of Object.keys(USE_TO_ROOM_TYPE))
      expect(ROOM_TYPES).toContain(USE_TO_ROOM_TYPE[u as keyof typeof USE_TO_ROOM_TYPE]);
  });
});

describe("plan-json — describe() additions", () => {
  it("surfaces room_type, floor_polygon and input_graph", () => {
    const s = describePlan(FIXTURE_A);
    const a = s.rooms.find((r) => r.id === "r_a")!;
    expect(a.room_type).toBe("LivingRoom");
    expect(a.floor_polygon.length).toBe(4);
    expect(s.input_graph).toEqual({ r_a: ["r_b"], r_b: ["r_a"] });
  });
  it("returns an empty input_graph on a fatal error", () => {
    const s = describePlan(`plan "X" { room at (0,0) size 0x0 }`);
    expect(s.ok).toBe(false);
    expect(s.input_graph).toEqual({});
  });
});

describe("plan-json — schema object", () => {
  it("advertises the id, required roots and the room_type enum", () => {
    expect(PLAN_JSON_SCHEMA.$id).toBe("https://archlang-docs.vercel.app/plan.schema.json");
    expect(PLAN_JSON_SCHEMA.required).toEqual(["plan", "rooms", "walls", "openings", "furniture"]);
    expect(PLAN_JSON_SCHEMA.properties.room_types.items.enum).toEqual([...ROOM_TYPES]);
  });
});
