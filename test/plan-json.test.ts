import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
// The parser's own accept-list, imported rather than retyped — the same law the
// projection itself follows, so a fifth `dims auto` mode cannot pass this suite unnoticed.
import { AUTO_DIMS_MODES } from "../src/ast.js";

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

  /**
   * EVERY shipped example, partitioned — never sampled.
   *
   * This suite used to name three examples by hand, and that is exactly how the `dims
   * auto` gap survived: `garden-loft.arch` and `one-room.arch` both declare it, both
   * silently lost it through the JSON, and both rendered a differently-sized sheet with
   * no diagnostic — and neither was in the sample. So the corpus is now the DIRECTORY:
   * every `examples/*.arch` either round-trips, or appears in {@link CANNOT_ROUND_TRIP}
   * with a reason and a `proof` pattern that must still match the file. A future example
   * is covered the moment it is added; a lossy clause cannot hide in an unsampled file.
   *
   * The exclusions are not a skip list. Plan JSON is deliberately a FLAT, SINGLE-STOREY,
   * SHEET-FREE, STRAIGHT-EDGED geometry projection: it carries walls, rooms, openings,
   * furniture, columns, explicit `dim`s and the plan-level settings (`grid`, `scale`,
   * `north`, `site`, `dims auto`, `title`), and nothing else. Everything named below is
   * a language surface it does not model, so the loss is by construction and visible in
   * the schema rather than a defect — with ONE exception, `two-bed.arch`, called out as
   * a defect in its own reason string.
   */
  const CANNOT_ROUND_TRIP: Record<string, { because: string; proof: RegExp }> = {
    // --- the sheet layer: `paper`/`axes`/`schedule`/`legend` have no JSON field ------
    "furnished-flat.arch": { because: "sheet layer — `paper` + `schedule`", proof: /^\s*paper\b/m },
    "museum-wing.arch": { because: "sheet layer — `paper`", proof: /^\s*paper\b/m },
    "museum.arch": { because: "sheet layer — `paper`", proof: /^\s*paper\b/m },
    // --- the style layer: `theme`/`style` select paint, which the JSON does not carry -
    "themed.arch": { because: "style layer — `theme`", proof: /^\s*theme\b/m },
    "gallery-l.arch": { because: "style layer — `theme`; and the sheet layer — `paper`", proof: /^\s*theme\b/m },
    "materials.arch": {
      because: "style layer — `style <kind> { … }`; and `paper`/`schedule`/`legend`",
      proof: /^\s*style\b/m,
    },
    // --- curved geometry: `WallJson.points` is straight-edged; there is no `circle` ---
    "aquarium.arch": {
      because: "curved geometry — wall `arc` + `room circle`; and the sheet layer",
      proof: /\barc\s*\(/,
    },
    "hexagon-pavilion.arch": { because: "curved geometry — wall `arc` + `room circle`", proof: /\barc\s*\(/ },
    "library.arch": {
      because: "curved geometry — wall `arc`; and the sheet layer, `zone`, `stair`/`elevator`",
      proof: /\barc\s*\(/,
    },
    // --- drawing-only and ground elements: no JSON element kind ----------------------
    "tiny-house.arch": { because: "`roof` is deliberately absent from the projection", proof: /^\s*roof\b/m },
    "bungalow.arch": { because: "`roof`; and the sheet layer — `paper` + `schedule`", proof: /^\s*roof\b/m },
    "courtyard-house.arch": { because: "`roof`; and the sheet layer + `zone`", proof: /^\s*roof\b/m },
    // --- storeys and composition -----------------------------------------------------
    "two-storey.arch": {
      because: "`level` — the projection is single-storey; also `roof`/`void`/`stair`",
      proof: /^\s*level\b/m,
    },
    "townhouse.arch": {
      because: "`level` — the projection is single-storey; also `roof`/`stair`/`paper`",
      proof: /^\s*level\b/m,
    },
    "garden-house.arch": {
      because: "`level`, `outdoor`/`fence`/`roof`, `site … boundary` and the sheet layer",
      proof: /^\s*level\b/m,
    },
    "hillside-villa.arch": {
      because: "`level`, `place`, `roof`/`void`, `arc` and the sheet layer",
      proof: /^\s*level\b/m,
    },
    "terrace-row.arch": {
      because: "`component` + `place` — composition is authored in .arch, not JSON",
      proof: /^\s*place\b/m,
    },
    "clinic.arch": { because: "`component` + `place`; and the sheet layer + `zone`", proof: /^\s*place\b/m },
    "transit-hall.arch": { because: "sheet layer + `zone` + `elevator`/`escalator`", proof: /^\s*escalator\b/m },
    // `import` is refused outright, by design — `planFromJson` says so in its own doc.
    "imports.arch": {
      because: "`import` — refused by design (`E_IMPORT_NOT_FOUND` on projection)",
      proof: /^\s*import\b/m,
    },
    "museum-wings.arch": { because: "`import` + `place` — refused by design", proof: /^\s*import\b/m },
    // --- the one genuine DEFECT in this list, named rather than hidden ---------------
    // `planToJson` projects a RESOLVER-DERIVED position as an authored `at (x,y)`, and
    // `grid` snaps coordinates an author WRITES (v1.27) — so a derived position that is
    // not already on the grid moves on the way back in. Here `furniture wardrobe in
    // r_bed1 anchor top-right flush` resolves to (8650,150) against a 300-thick shell
    // and re-snaps to (8700,200) under `grid 100`. Minimal repro, no example needed:
    //   plan with `grid 100`, a 300-thick shell, one `anchor top-right flush` fixture.
    // Independent of this file's `roof overhang`, which excludes it on its own.
    "two-bed.arch": {
      because:
        "DEFECT (not by design): a resolver-derived furniture position is re-emitted as an authored `at` and re-snapped by `grid` — plus `roof`",
      proof: /^\s*roof\b/m,
    },
  };

  const EXAMPLES = readdirSync("examples")
    .filter((f) => f.endsWith(".arch"))
    .sort();
  const COVERED = EXAMPLES.filter((f) => !(f in CANNOT_ROUND_TRIP));

  it("names only exclusions that exist and still use the feature their reason cites", () => {
    for (const [name, { proof }] of Object.entries(CANNOT_ROUND_TRIP)) {
      expect(EXAMPLES, `exclusion "${name}" names no shipped example`).toContain(name);
      expect(
        proof.test(readFileSync(`examples/${name}`, "utf8")),
        `exclusion "${name}": ${proof} no longer matches`,
      ).toBe(true);
    }
  });

  it("keeps a non-vacuous covered set", () => {
    // A regression must not be greenable by moving a file into the exclusion list.
    expect(COVERED.length).toBeGreaterThanOrEqual(8);
    for (const must of ["one-room.arch", "garden-loft.arch", "studio.arch", "attached.arch", "laneway-house.arch"])
      expect(COVERED, `${must} must round-trip`).toContain(must);
  });

  it.each(COVERED)("round-trips examples/%s to identical SVG", (name) => {
    roundTrips(readFileSync(`examples/${name}`, "utf8"));
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

/**
 * `dims auto <mode>` — the plan-level setting the projection used to drop.
 *
 * It is load-bearing on OUTPUT, which is what made the loss silent and serious: the
 * chains it synthesizes grow the drawing extent, so a plan that declared `dims auto all`
 * came back through the JSON declaring nothing and rendered a smaller sheet — with zero
 * diagnostics, on a PUBLISHED machine interface (`arch compile --from-json`).
 */
describe("plan-json — `dims auto` is a carried SETTING, not a dropped word", () => {
  const withDims = (mode: string) => `plan "D" {
  units mm
  grid 50
  dims auto ${mode}
  wall id=s exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Room" uses living
}`;
  const noDims = withDims("all").replace(/\n\s*dims auto all/, "");

  it.each(AUTO_DIMS_MODES)("projects and re-emits `dims auto %s`", (mode) => {
    const { json } = planToJson(withDims(mode));
    expect(json?.dims_auto).toBe(mode);
    expect(planJsonToArch(json!).source).toContain(`dims auto ${mode}`);
  });

  it("is absent from the payload of a plan that never asked for it", () => {
    // The `site` rule: emitted only when declared, so every pre-existing payload is
    // byte-identical and no consumer sees a new key appear on an unchanged plan.
    expect("dims_auto" in planToJson(noDims).json!).toBe(false);
    expect(planJsonToArch(planToJson(noDims).json!).source).not.toContain("dims auto");
  });

  it("actually moves the drawing — so the round-trip law has something to protect", () => {
    // Non-vacuity: if the two rendered the same, the round-trip assertion above would
    // pass no matter what the projection did with the word.
    expect(compile(withDims("all")).svg).not.toBe(compile(noDims).svg);
  });

  it("refuses an unknown mode with a path-bearing E_JSON_SCHEMA", () => {
    const { json } = planToJson(withDims("all"));
    const bad = { ...(json as PlanJson), dims_auto: "everything" } as unknown as PlanJson;
    const { source, diagnostics } = planFromJson(bad);
    expect(source).toBeUndefined();
    expect(diagnostics.some((d) => d.code === "E_JSON_SCHEMA" && d.message.includes("/dims_auto"))).toBe(true);
  });

  it("advertises every parser mode in the schema, derived rather than retyped", () => {
    const prop = (PLAN_JSON_SCHEMA as unknown as { properties: Record<string, { enum?: readonly string[] }> })
      .properties.dims_auto;
    expect(prop?.enum).toEqual([...AUTO_DIMS_MODES]);
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
    expect(PLAN_JSON_SCHEMA.$id).toBe("https://archlang.uk/plan.schema.json");
    expect(PLAN_JSON_SCHEMA.required).toEqual(["plan", "rooms", "walls", "openings", "furniture"]);
    expect(PLAN_JSON_SCHEMA.properties.room_types.items.enum).toEqual([...ROOM_TYPES]);
  });
});
