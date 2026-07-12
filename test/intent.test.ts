import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileIntent,
  feedbackForResult,
  type Intent,
  intentFromJson,
  isKnownConcept,
  roomsMatchingConcept,
  validateIntent,
} from "../src/index.js";
import type { RoomSummary } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Small self-contained plans (compile with no imports) -------------------

/** 2 rooms (bedroom + bathroom), an entrance, an interior door, one window in the bedroom. */
const TWO_ROOM = `plan "Two" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  room id=r_bed at (0,0) size 3000x4000 label "Bedroom" uses bedroom
  room id=r_bath at (3000,0) size 3000x4000 label "Bathroom" uses bath
  door id=d_main at (1500,4000) width 900 wall exterior hinge left swing in
  door id=d_int at (3000,2000) width 800 wall partition hinge left swing in
  window at (0,2000) width 1200 wall exterior
}`;

/** 3 rooms, one of them a hall — for the policy-B surplus-circulation band. */
const THREE_ROOM_HALL = `plan "Three" {
  units mm
  wall exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  wall partition thickness 100 { (6000,0) (6000,4000) }
  room id=r_living at (0,0) size 3000x4000 label "Living" uses living
  room id=r_hall at (3000,0) size 3000x4000 label "Hall" uses hall
  room id=r_bed at (6000,0) size 3000x4000 label "Bedroom" uses bedroom
  door id=d_main at (1500,4000) width 900 wall exterior hinge left swing in
}`;

/** One room, no door at all → no modeled entrance. */
const NO_DOOR = `plan "NoDoor" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=r1 at (0,0) size 4000x4000 label "Living" uses living
}`;

/** Two rooms, an entrance into the first only → the second is isolated. */
const ISOLATED = `plan "Iso" {
  units mm
  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=r_a at (0,0) size 4000x4000 label "Living" uses living
  room id=r_b at (4000,0) size 4000x4000 label "Bedroom" uses bedroom
  door id=d_main at (2000,4000) width 900 wall exterior hinge left swing in
}`;

describe("validateIntent — corpus round-trip (goldens satisfy their own intent)", () => {
  const corpus = JSON.parse(readFileSync(resolve(ROOT, "eval/corpus.json"), "utf8")) as {
    id: string;
    golden: string;
    expect: Intent;
  }[];

  for (const entry of corpus) {
    it(`${entry.id}: golden meets its intent with zero violations`, () => {
      const source = readFileSync(resolve(ROOT, entry.golden), "utf8");
      const r = validateIntent(source, entry.expect);
      expect(r.ok).toBe(true);
      expect(r.violations).toEqual([]);
      expect(r.satisfied).toBe(r.total);
    });
  }
});

describe("validateIntent — determinism", () => {
  it("two calls are deeply equal", () => {
    const a = validateIntent(TWO_ROOM, { rooms: 2, roomsInclude: [{ concept: "bedroom" }] });
    const b = validateIntent(TWO_ROOM, { rooms: 2, roomsInclude: [{ concept: "bedroom" }] });
    expect(a).toEqual(b);
  });
});

describe("validateIntent — per-kind gating", () => {
  it("room-count: exact passes, wrong count fails with E_INTENT_ROOM_COUNT (score 0)", () => {
    expect(validateIntent(TWO_ROOM, { rooms: 2 }).ok).toBe(true);
    const r = validateIntent(THREE_ROOM_HALL, { rooms: 5 });
    expect(r.ok).toBe(false);
    expect(r.violations[0]?.code).toBe("E_INTENT_ROOM_COUNT");
    expect(r.subscores.rooms).toBe(0);
  });

  it("room-count: policy-B +1 circulation passes but scores 0.5", () => {
    const r = validateIntent(THREE_ROOM_HALL, {
      rooms: 2,
      roomsInclude: [{ concept: "living-room" }, { concept: "bedroom" }],
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.subscores.rooms).toBe(0.5);
    const count = r.assertions.find((a) => a.predicate.kind === "room-count");
    expect(count?.detail).toContain("policy B");
  });

  it("room-exists: a missing concept fails with E_INTENT_ROOM_MISSING", () => {
    const r = validateIntent(TWO_ROOM, { roomsInclude: [{ concept: "kitchen" }] });
    expect(r.ok).toBe(false);
    expect(r.violations[0]?.code).toBe("E_INTENT_ROOM_MISSING");
  });

  it("room-area: a room outside the band fails with E_INTENT_ROOM_AREA", () => {
    const r = validateIntent(TWO_ROOM, {
      roomsInclude: [{ concept: "bedroom", areaM2: { min: 20, max: 30, source: "about 25 m²" } }],
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "E_INTENT_ROOM_AREA")).toBe(true);
  });

  it("total-area: outside band fails; min-only open top passes when met, fails when short", () => {
    expect(validateIntent(TWO_ROOM, { totalAreaM2: { min: 50, max: 60, source: "about 55 m²" } }).ok).toBe(false);
    expect(validateIntent(TWO_ROOM, { totalAreaM2: { min: 10, source: "at least 10 m²" } }).ok).toBe(true);
    const short = validateIntent(TWO_ROOM, { totalAreaM2: { min: 50, source: "at least 50 m²" } });
    expect(short.ok).toBe(false);
    expect(short.violations[0]?.code).toBe("E_INTENT_TOTAL_AREA");
    // The open top renders as ∞ in the detail band.
    const ta = short.assertions.find((a) => a.predicate.kind === "total-area");
    expect(ta?.detail).toContain("∞");
  });

  it("adjacency: a miss is listed (E_INTENT_NOT_ADJACENT) but does NOT gate ok", () => {
    const r = validateIntent(TWO_ROOM, {
      adjacency: { requiredEdges: { bedroom: ["living-room"] }, source: "brief" },
    });
    expect(r.ok).toBe(true);
    expect(r.violations[0]?.code).toBe("E_INTENT_NOT_ADJACENT");
    expect(r.violations[0]?.gate).toBe(false);
  });

  it("reachable: no entrance → E_INTENT_NO_DOOR; isolated room → E_INTENT_UNREACHABLE (both advisory)", () => {
    const noDoor = validateIntent(NO_DOOR, { reachable: true });
    expect(noDoor.ok).toBe(true);
    expect(noDoor.violations[0]?.code).toBe("E_INTENT_NO_DOOR");
    expect(noDoor.violations[0]?.gate).toBe(false);

    const iso = validateIntent(ISOLATED, { reachable: true });
    expect(iso.ok).toBe(true);
    expect(iso.violations[0]?.code).toBe("E_INTENT_UNREACHABLE");
    expect(iso.violations[0]?.gate).toBe(false);
  });

  it("room-windows: presence passes; absence fails with E_INTENT_NO_WINDOW (gating)", () => {
    const lit = validateIntent(TWO_ROOM, { roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }] });
    expect(lit.ok).toBe(true);

    const dark = validateIntent(TWO_ROOM, {
      roomsInclude: [{ concept: "bedroom" }, { concept: "bathroom", windows: { min: 1 } }],
    });
    expect(dark.ok).toBe(false);
    const v = dark.violations.find((x) => x.code === "E_INTENT_NO_WINDOW");
    expect(v?.gate).toBe(true);
  });
});

describe("validateIntent — window facing", () => {
  // TWO_ROOM's window sits on the bedroom's LEFT edge (x=0) → faces W.
  it("a matching facing passes; a wrong facing fails with E_INTENT_NO_WINDOW (gating)", () => {
    const w = validateIntent(TWO_ROOM, {
      roomsInclude: [{ concept: "bedroom", windows: { min: 1, facing: "W" } }],
    });
    expect(w.ok).toBe(true);

    const s = validateIntent(TWO_ROOM, {
      roomsInclude: [{ concept: "bedroom", windows: { min: 1, facing: "S" } }],
    });
    expect(s.ok).toBe(false);
    const v = s.violations.find((x) => x.code === "E_INTENT_NO_WINDOW");
    expect(v?.gate).toBe(true);
    // The facing is named in the blame message and the feedback prompt.
    expect(v?.message).toContain("facing S");
    expect(feedbackForResult(s).join("\n")).toContain("facing S");
  });

  it("the no-facing detail strings are unchanged when facing is absent", () => {
    const r = validateIntent(TWO_ROOM, { roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }] });
    const a = r.assertions.find((x) => x.predicate.kind === "room-windows");
    expect(a?.detail).toBe('windows: concept "bedroom" ok (found 1)');
  });
});

describe("roomsMatchingConcept — unknown-concept literal fallback", () => {
  const room = (over: Partial<RoomSummary>): RoomSummary => ({
    id: "r",
    label: undefined,
    uses: [],
    room_type: "LivingRoom",
    area_m2: 10,
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    floor_polygon: [],
    adjacent: [],
    ...over,
  });

  it("matches by normalized id", () => {
    const r = room({ id: "wine_cellar" });
    expect(isKnownConcept("wine-cellar")).toBe(false);
    expect(roomsMatchingConcept("wine-cellar", [r])).toEqual([r]);
  });

  it("matches by token-bounded label", () => {
    const r = room({ label: "Garage" });
    expect(roomsMatchingConcept("garage", [r])).toEqual([r]);
  });

  it("matches by uses tag", () => {
    const r = room({ uses: ["office"] });
    expect(isKnownConcept("office")).toBe(false);
    expect(roomsMatchingConcept("office", [r])).toEqual([r]);
  });

  it("matches by room_type (case-insensitive)", () => {
    const r = room({ room_type: "Balcony" });
    expect(roomsMatchingConcept("balcony", [r])).toEqual([r]);
  });

  it('"Hallmark" does NOT match the known concept "hall"', () => {
    const r = room({ label: "Hallmark" });
    expect(roomsMatchingConcept("hall", [r])).toEqual([]);
  });
});

describe("intentFromJson", () => {
  it("round-trips a valid intent", () => {
    const value = {
      rooms: 4,
      roomsInclude: [{ concept: "bedroom", count: { min: 2 } }],
      totalAreaM2: { min: 37.8, max: 46.2, source: "about 42 m²" },
      adjacency: { requiredEdges: { hall: ["bathroom"] }, source: "brief" },
      reachable: true,
    };
    const { intent, errors } = intentFromJson(value);
    expect(errors).toEqual([]);
    expect(intent).toEqual(value);
  });

  it("reports pathed errors for bad types, unknown keys, missing source, empty band", () => {
    expect(intentFromJson(42).errors[0]).toContain("expected a top-level object");
    expect(intentFromJson({ rooms: "4" }).errors[0]).toContain("/rooms");
    expect(intentFromJson({ foo: 1 }).errors[0]).toContain("/foo: unknown key");
    expect(intentFromJson({ roomsInclude: [{ concept: 5 }] }).errors[0]).toContain("/roomsInclude/0/concept");
    expect(intentFromJson({ totalAreaM2: { min: 1, max: 2 } }).errors[0]).toContain("/totalAreaM2/source");
    expect(intentFromJson({ totalAreaM2: { source: "x" } }).errors[0]).toContain("at least one of min/max");
    expect(intentFromJson({ roomsInclude: [{ concept: "x", count: { min: 3, max: 1 } }] }).errors[0]).toContain(
      "min must be ≤ max",
    );
    // Any error nulls the intent.
    expect(intentFromJson({ rooms: -1 }).intent).toBeNull();
  });

  it("accepts a valid windows.facing enum and rejects a bad one with a pathed error", () => {
    const good = intentFromJson({ roomsInclude: [{ concept: "bedroom", windows: { min: 1, facing: "N" } }] });
    expect(good.errors).toEqual([]);
    expect(good.intent?.roomsInclude?.[0]?.windows?.facing).toBe("N");

    const bad = intentFromJson({ roomsInclude: [{ concept: "bedroom", windows: { facing: "north" } }] });
    expect(bad.intent).toBeNull();
    expect(bad.errors[0]).toContain("/roomsInclude/0/windows/facing");
    expect(bad.errors[0]).toContain('"N", "S", "E", "W"');
  });
});

describe("feedbackForResult", () => {
  it("emits one deterministic, actionable prompt per violation, in order", () => {
    const r = validateIntent(TWO_ROOM, {
      rooms: 5,
      roomsInclude: [{ concept: "kitchen" }],
    });
    const f1 = feedbackForResult(r);
    const f2 = feedbackForResult(r);
    expect(f1).toEqual(f2);
    expect(f1).toHaveLength(r.violations.length);
    expect(f1.join("\n")).toContain("kitchen");
  });
});

describe("validateIntent — compile failure", () => {
  it("a non-compiling source is not ok and carries diagnostics", () => {
    const r = validateIntent("this is not archlang", { rooms: 2 });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("validateIntent — blame messages name path + measured fact", () => {
  it("a missing concept names the roomsInclude path and the fact", () => {
    const r = validateIntent(TWO_ROOM, { roomsInclude: [{ concept: "kitchen" }] });
    const msg = r.violations[0]?.message ?? "";
    expect(msg).toContain("intent /roomsInclude/0:");
    expect(msg).toContain('no room matching concept "kitchen"');
  });

  it("a total-area miss names the path and cites the brief source", () => {
    const r = validateIntent(TWO_ROOM, { totalAreaM2: { min: 50, max: 60, source: "brief: 'about 55 m²'" } });
    const msg = r.violations[0]?.message ?? "";
    expect(msg).toContain("intent /totalAreaM2:");
    expect(msg).toContain("brief: 'about 55 m²'");
  });
});

describe("compileIntent — predicate lowering", () => {
  it("emits count/exists/area/windows/total/adjacent/reachable in order", () => {
    const preds = compileIntent({
      rooms: 2,
      roomsInclude: [{ concept: "bedroom", areaM2: { min: 10, source: "at least 10" }, windows: { min: 1 } }],
      totalAreaM2: { min: 20, max: 30, source: "about 25" },
      adjacency: { requiredEdges: { bedroom: ["bathroom"] }, source: "s" },
      reachable: true,
    });
    expect(preds.map((p) => p.kind)).toEqual([
      "room-count",
      "room-exists",
      "room-area",
      "room-windows",
      "total-area",
      "adjacent",
      "reachable",
    ]);
  });
});
