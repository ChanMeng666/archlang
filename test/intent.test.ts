/** validateIntent — corpus round-trip (goldens satisfy their own intent); validateIntent — determinism; validateIntent — per-kind gating; validateIntent — window f… */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkPredicates,
  compileIntent,
  describe as describePlan,
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

  it("reads the facing against the plan's `north`, not the page", () => {
    // Same geometry, rotated compass: TWO_ROOM's bedroom window is on the page's LEFT
    // edge. Under `north right` compass north points at the page's right edge, so that
    // window faces SOUTH — a `facing: "W"` brief that passed on the default north must
    // now fail, and `facing: "S"` must pass.
    const turned = TWO_ROOM.replace("units mm", "units mm\n  north right");
    expect(
      validateIntent(turned, { roomsInclude: [{ concept: "bedroom", windows: { min: 1, facing: "S" } }] }).ok,
    ).toBe(true);
    const w = validateIntent(turned, {
      roomsInclude: [{ concept: "bedroom", windows: { min: 1, facing: "W" } }],
    });
    expect(w.ok).toBe(false);
    expect(w.violations.find((x) => x.code === "E_INTENT_NO_WINDOW")?.gate).toBe(true);
  });

  it("the no-facing detail strings are unchanged when facing is absent", () => {
    const r = validateIntent(TWO_ROOM, { roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }] });
    const a = r.assertions.find((x) => x.predicate.kind === "room-windows");
    expect(a?.detail).toBe('windows: concept "bedroom" ok (found 1)');
  });
});

/** Repro: two rooms of room_type Storage, one `uses storage`, one `uses utility`. */
const STORAGE_UTILITY = `plan "repro" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=storage1 at (0,0)    size 2000x4000 label "Pantry"    uses storage
  room id=tech1    at (2000,0) size 2000x4000 label "Tech room" uses utility
  door on w at 50% width 900 swing into storage1
  window on w at 25% width 800
}`;

/** Three Storage-type rooms: two stores and a tech room. */
const TWO_STORES_ONE_TECH = `plan "stores" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=store_a at (0,0)    size 2000x4000 label "Store A"   uses storage
  room id=store_b at (2000,0) size 2000x4000 label "Store B"   uses storage
  room id=tech1   at (4000,0) size 2000x4000 label "Tech room" uses utility
  door on w at 50% width 900 swing into store_b
}`;

const claimedFound = (r: ReturnType<typeof validateIntent>, concept: string): string | undefined =>
  r.assertions.find((a) => a.predicate.kind === "room-exists" && a.predicate.concept === concept)?.detail;

describe("validateIntent — room assignment (one room, one concept; #104)", () => {
  it("both concepts are satisfied when a distinct room exists for each, in either array order", () => {
    for (const roomsInclude of [
      [{ concept: "storage" }, { concept: "utility" }],
      [{ concept: "utility" }, { concept: "storage" }],
    ]) {
      const r = validateIntent(STORAGE_UTILITY, { roomsInclude });
      expect(r.violations).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.satisfied).toBe(2);
      expect(r.total).toBe(2);
      expect(claimedFound(r, "storage")).toBe('label: concept "storage" ok (found 1)');
      expect(claimedFound(r, "utility")).toBe('label: concept "utility" ok (found 1)');
    }
  });

  it("still lets one room clear at most one concept: a lone WC can't satisfy bathroom AND wc", () => {
    const r = validateIntent(`plan "P" { units mm room at (0,0) size 2000x2000 label "WC" }`, {
      roomsInclude: [{ concept: "bathroom" }, { concept: "wc" }],
    });
    expect(r.ok).toBe(false);
    expect(claimedFound(r, "bathroom")).toBe('label: concept "bathroom" ok (found 1)');
    expect(claimedFound(r, "wc")).toBe('label: no room matching concept "wc" (needed 1, found 0)');
    expect(r.violations.map((v) => v.code)).toEqual(["E_INTENT_ROOM_MISSING"]);
  });

  it("a counted concept no longer starves a later one (greedy took all three rooms)", () => {
    const r = validateIntent(TWO_STORES_ONE_TECH, {
      roomsInclude: [{ concept: "storage", count: { min: 2 } }, { concept: "utility" }],
    });
    expect(r.violations).toEqual([]);
    expect(claimedFound(r, "storage")).toBe('label: concept "storage" ok (found 2)');
    expect(claimedFound(r, "utility")).toBe('label: concept "utility" ok (found 1)');
    // Needing three rooms from three is feasible; needing four is not, and the LATER
    // concept is the one reported short.
    const short = validateIntent(TWO_STORES_ONE_TECH, {
      roomsInclude: [
        { concept: "storage", count: { min: 2 } },
        { concept: "utility", count: { min: 2 } },
      ],
    });
    expect(claimedFound(short, "storage")).toBe('label: concept "storage" ok (found 2)');
    expect(claimedFound(short, "utility")).toBe('label: no room matching concept "utility" (needed 2, found 1)');
  });

  it("spare rooms still go to the first concept that matches them (greedy's claim when nothing later needs them)", () => {
    // Alone, `storage` claims every Storage-type room, exactly as before.
    const alone = validateIntent(TWO_STORES_ONE_TECH, { roomsInclude: [{ concept: "storage" }] });
    expect(claimedFound(alone, "storage")).toBe('label: concept "storage" ok (found 3)');
    // With `utility` after it, only the room utility needs moves; `max` counts the claim.
    const capped = validateIntent(TWO_STORES_ONE_TECH, {
      roomsInclude: [{ concept: "storage", count: { min: 1, max: 2 } }, { concept: "utility" }],
    });
    expect(capped.ok).toBe(true);
    expect(claimedFound(capped, "storage")).toBe('label: concept "storage" ok (found 2)');
  });

  it("area and window checks score over the rooms a concept was credited with", () => {
    const r = validateIntent(STORAGE_UTILITY, {
      roomsInclude: [
        { concept: "storage", windows: { min: 0 } },
        { concept: "utility", windows: { min: 0 } },
      ],
    });
    const found = r.assertions
      .filter((a) => a.predicate.kind === "room-windows")
      .map((a) => Number(/found (\d+)/.exec(a.detail)?.[1]));
    // The plan's single window sits in one of the two rooms. Each concept is credited with
    // its own room, so the window is counted exactly once across the two — never twice.
    expect(found).toHaveLength(2);
    expect(found[0]! + found[1]!).toBe(1);
  });
});

describe("roomsMatchingConcept — unknown-concept literal fallback", () => {
  const room = (over: Partial<RoomSummary>): RoomSummary => ({
    id: "r",
    label: undefined,
    uses: [],
    room_type: "LivingRoom",
    area_m2: 10,
    net_area_m2: 10,
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

  it("accepts optional string $schema / $id keys, and rejects non-string ones", () => {
    const value = { $schema: "https://archlang.uk/intent.schema.json", $id: "brief-7", rooms: 2 };
    const { intent, errors } = intentFromJson(value);
    expect(errors).toEqual([]);
    expect(intent).toEqual(value);
    expect(intentFromJson({ $schema: 5 }).errors).toEqual(["/$schema: expected a string"]);
    expect(intentFromJson({ $id: {} }).errors).toEqual(["/$id: expected a string"]);
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

// RM9.1: a band is judged on the EXACT area. `describe()` keeps its display convention (each room
// to 0.01 m², the total the sum of those), so these plans still print the rounded figures.
describe("validateIntent — area bands judge the exact area (RM9.1)", () => {
  /** Five rooms of exactly 6.675 + 6.65 + 6.675 + 13.75 + 6.25 = 40.000 m², printed as 40.01. */
  const FORTY = `plan "Forty" {
  units mm
  room id=a at (0,0)       size 2500x2670 label "A"
  room id=b at (2500,0)    size 2500x2660 label "B"
  room id=c at (5000,0)    size 2500x2670 label "C"
  room id=d at (0,2670)    size 5000x2750 label "D"
  room id=e at (5000,2670) size 2500x2500 label "E"
}`;
  /** One room of exactly 4.001 m² (2000 x 2000.5 mm), printed as 4. */
  const OVER = `plan "Over" {
  units mm
  room id=s at (0,0) size 2000x2000.5 label "Store"
}`;
  /** An exterior ring whose inner faces enclose exactly 5000 x 8000.8 mm = 40.004 m², printed as 40. */
  const GROSS = `plan "Gross" {
  units mm
  wall exterior thickness 200 { (0,0) (5200,0) (5200,8200.8) (0,8200.8) close }
  room id=r at (0,0) size 5200x8200.8 label "Hall"
}`;

  it("a total of exactly 40.000 m² passes a max of 40, though describe() prints 40.01", () => {
    expect(describePlan(FORTY).totals.floor_area_m2).toBe(40.01);
    const r = validateIntent(FORTY, { totalAreaM2: { max: 40, source: "at most 40 m²" } });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    // The printed 40.01 would contradict the verdict, so the detail prints the exact figure.
    expect(r.assertions[0]?.detail).toBe("area: total 40 m² within [0, 40]");
  });

  it("a total equal to the band edge passes at either edge", () => {
    expect(validateIntent(FORTY, { totalAreaM2: { min: 40, max: 40, source: "exactly 40 m²" } }).ok).toBe(true);
  });

  it("a total 0.001 m² over the max fails, and the message prints the exact figure", () => {
    expect(describePlan(OVER).totals.floor_area_m2).toBe(4);
    const r = validateIntent(OVER, { totalAreaM2: { max: 4, source: "at most 4 m²" } });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.message)).toEqual([
      "intent /totalAreaM2: total 4.001 m² outside [0, 4] (at most 4 m²)",
    ]);
    expect(validateIntent(OVER, { totalAreaM2: { max: 4.001, source: "at most 4.001 m²" } }).ok).toBe(true);
  });

  it("a per-room band is judged on the room's exact area at both edges", () => {
    // Room `a` is exactly 6.675 m², printed 6.68.
    const band = (min: number, max: number): Intent => ({
      roomsInclude: [{ concept: "A", areaM2: { min, max, source: "brief" } }],
    });
    expect(describePlan(FORTY).rooms[0]?.area_m2).toBe(6.68);
    expect(validateIntent(FORTY, band(6, 6.675)).ok).toBe(true);
    expect(validateIntent(FORTY, band(6.675, 7)).ok).toBe(true);
    const over = validateIntent(FORTY, band(6.676, 7));
    expect(over.ok).toBe(false);
    expect(over.violations.map((v) => v.code)).toEqual(["E_INTENT_ROOM_AREA"]);
    const store = { roomsInclude: [{ concept: "Store", areaM2: { max: 4, source: "brief" } }] };
    expect(validateIntent(OVER, store).ok).toBe(false);
  });

  it("a gross internal area band is judged on the exact figure, and its residual with it", () => {
    expect(describePlan(GROSS).totals.gross_internal_area_m2).toBe(40);
    const r = validateIntent(GROSS, { grossInternalAreaM2: { max: 40, source: "at most 40 m² inside" } });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.message)).toEqual([
      "intent /grossInternalAreaM2: gross internal area 40.004 m² outside [0, 40], residual +0.004 m² (at most 40 m² inside)",
    ]);
    expect(r.measures?.[0]).toMatchObject({ measured: [40.004], residual: [0.004], pass: false });
    expect(validateIntent(GROSS, { grossInternalAreaM2: { max: 40.004, source: "brief" } }).ok).toBe(true);
  });

  it("a summary that did not come from describe() is judged on its printed figures", () => {
    // A JSON round trip drops the side table: the printed 40.01 decides, as before.
    const parsed = JSON.parse(JSON.stringify(describePlan(FORTY))) as ReturnType<typeof describePlan>;
    const preds = compileIntent({ totalAreaM2: { max: 40, source: "brief" } });
    expect(checkPredicates(preds, parsed).find((a) => a.predicate.kind === "total-area")?.pass).toBe(false);
    expect(checkPredicates(preds, describePlan(FORTY)).find((a) => a.predicate.kind === "total-area")?.pass).toBe(true);
  });
});
