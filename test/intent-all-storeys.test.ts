/**
 * Issue #365: on a plan with `level` blocks the intent's `rooms`, `roomsInclude` and
 * `totalAreaM2` read the whole building, as `grossInternalAreaM2`, `roomDimensions` and
 * `reachable` always did. The check reads `levels[]`; `describe()` keeps its contract (the
 * top-level facts are the lowest storey), and a single-storey plan is judged exactly as before.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { makeNodeWorld } from "../src/cli/io.js";
import {
  type Intent,
  type Predicate,
  checkPredicates,
  compileIntent,
  describe,
  describeLevel,
  feedbackForResult,
  intentFromJson,
  validateIntent,
} from "../src/index.js";

/** The issue's plan, as filed: 30 m² on each storey, one room below and three above. */
const ISSUE_PLAN = `plan "intent over two storeys" {
  units mm
  level 0 "Ground" {
    room id=liv at (0,0) size 6000x5000 label "Living" uses living
    walls from rooms exterior 200 partition 100
    door on liv.bottom at 4500 from start width 900 swing inward
    window on liv.top width 1500
    stair id=s at (100,1200) size 900x2600 dir up
  }
  level 1 "Upper" {
    room id=land at (0,0) size 2000x5000 label "Landing" uses hall
    room id=bed1 right-of land size 4000x2500 label "Bed 1" uses bedroom
    room id=bed2 below bed1 size 4000x2500 label "Bed 2" uses bedroom
    walls from rooms exterior 200 partition 100
    door between land and bed1 at center width 800 swing into bed1
    door between land and bed2 at center width 800 swing into bed2
    window on bed1.right width 1200
    window on bed2.right width 1200
    stair id=s at (100,1200) size 900x2600 dir down
  }
}`;

/** The same id on two storeys is two rooms (`docs/language-reference.md`, Numbering): here a
 *  windowless bedroom below, and a study with a window above. */
const SAME_ID_PLAN = `plan "same id" {
  units mm
  level 0 "Ground" {
    room id=a at (0,0) size 4000x4000 label "Bedroom" uses bedroom
    walls from rooms exterior 200 partition 100
  }
  level 1 "Upper" {
    room id=a at (0,0) size 4000x4000 label "Study"
    walls from rooms exterior 200 partition 100
    window on a.right width 1200
  }
}`;

const codes = (src: string, intent: Intent): string[] => validateIntent(src, intent).violations.map((v) => v.code);

suite("the intent reads every storey (#365)", () => {
  it("passes the issue's plan and intent", () => {
    const { intent, errors } = intentFromJson({
      rooms: 4,
      roomsInclude: [{ concept: "bedroom", count: { min: 2, max: 2 }, windows: { min: 1 } }],
    });
    expect(errors).toEqual([]);
    const r = validateIntent(ISSUE_PLAN, intent!);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.assertions.map((a) => a.detail)).toEqual([
      "rooms: expected 4, got 4",
      'label: concept "bedroom" ok (found 2)',
      'windows: concept "bedroom" ok (found 2)',
    ]);
  });

  it("sums the total floor area over the storeys, and a miss prints the building's figure", () => {
    expect(codes(ISSUE_PLAN, { totalAreaM2: { min: 55, source: "brief" } })).toEqual([]);
    expect(validateIntent(ISSUE_PLAN, { totalAreaM2: { max: 40, source: "brief" } }).violations[0]?.message).toBe(
      "intent /totalAreaM2: total 60 m² outside [0, 40] (brief)",
    );
  });

  it("rounds the sum as describe() rounds a total", () => {
    const src = `plan "areas" {
      units mm
      level 0 { room id=a at (0,0) size 1100x1000 label "A" }
      level 1 { room id=b at (0,0) size 2200x1000 label "B" }
    }`;
    expect(validateIntent(src, { totalAreaM2: { max: 1, source: "brief" } }).assertions[0]?.detail).toBe(
      "area: total 3.3 m² outside [0, 1] (brief)",
    );
  });

  it("passes a one-storey figure through unrounded, whatever a caller put there", () => {
    const s = describe(`plan "p" {
 units mm
 room id=a at (0,0) size 1000x1000 label "A"
}`);
    const patched = { ...s, totals: { ...s.totals, floor_area_m2: 76.6123 } };
    expect(checkPredicates(compileIntent({ totalAreaM2: { max: 1, source: "brief" } }), patched)[0]?.detail).toBe(
      "area: total 76.6123 m² outside [0, 1] (brief)",
    );
  });

  it("holds a count, area or window band above the ground floor both ways", () => {
    const tooMany = { roomsInclude: [{ concept: "bedroom", count: { max: 1 } }] };
    expect(codes(ISSUE_PLAN, tooMany)).toEqual(["E_INTENT_ROOM_MISSING"]);
    const area = { min: 9, max: 11, source: "about 10 m²" };
    expect(codes(ISSUE_PLAN, { roomsInclude: [{ concept: "bedroom", count: { min: 2 }, areaM2: area }] })).toEqual([]);
    const tiny = { max: 5, source: "about 5 m²" };
    expect(codes(ISSUE_PLAN, { roomsInclude: [{ concept: "bedroom", areaM2: tiny }] })).toEqual(["E_INTENT_ROOM_AREA"]);
    expect(codes(ISSUE_PLAN, { roomsInclude: [{ concept: "bedroom", windows: { max: 1 } }] })).toEqual([
      "E_INTENT_NO_WINDOW",
    ]);
  });

  it("reads a window's facing on its own storey", () => {
    const facing = (f: "E" | "W"): string[] =>
      codes(ISSUE_PLAN, { roomsInclude: [{ concept: "bedroom", count: { min: 2 }, windows: { min: 2, facing: f } }] });
    expect(facing("E")).toEqual([]);
    expect(facing("W")).toEqual(["E_INTENT_NO_WINDOW"]);
  });

  it("applies policy B to a hall on any storey", () => {
    expect(validateIntent(ISSUE_PLAN, { rooms: 3 }).assertions[0]?.detail).toBe(
      "rooms: expected 3, got 4 (surplus is a circulation room — policy B)",
    );
    expect(codes(ISSUE_PLAN, { rooms: 3, roomsInclude: [{ concept: "hall" }] })).toEqual(["E_INTENT_ROOM_COUNT"]);
  });

  it("never credits one storey's window to the room with that id on another", () => {
    const windows = (concept: string, min: number): Intent => ({ roomsInclude: [{ concept, windows: { min } }] });
    expect(codes(SAME_ID_PLAN, windows("bedroom", 1))).toEqual(["E_INTENT_NO_WINDOW"]);
    expect(codes(SAME_ID_PLAN, windows("Study", 1))).toEqual([]);
    expect(codes(SAME_ID_PLAN, { rooms: 2 })).toEqual([]);
  });

  it("finds an adjacency on any storey, and a stair is not one", () => {
    const edge = (a: string, b: string): Intent => ({
      adjacency: { requiredEdges: { [a]: [b] }, source: "brief" },
    });
    expect(codes(ISSUE_PLAN, edge("hall", "bedroom"))).toEqual([]);
    expect(validateIntent(ISSUE_PLAN, edge("living-room", "bedroom"))).toMatchObject({
      ok: true,
      violations: [{ code: "E_INTENT_NOT_ADJACENT", gate: false }],
    });
  });

  it("reads the building through checkPredicates, the eval's route, with or without a room-exists", () => {
    const intent: Intent = { rooms: 4, totalAreaM2: { min: 55, source: "brief" } };
    const s = describe(ISSUE_PLAN);
    expect(checkPredicates(compileIntent(intent), s).every((a) => a.pass)).toBe(true);
    const bare: Predicate[] = [
      { kind: "room-windows", concept: "bedroom", min: 2, gate: true },
      { kind: "room-area", concept: "bedroom", min: 2, minM2: 9, source: "brief", gate: true },
    ];
    expect(checkPredicates(bare, s).map((a) => a.pass)).toEqual([true, true]);
  });

  it("reads one storey when the summary is narrowed to it", () => {
    const narrowed = describeLevel(describe(ISSUE_PLAN), 1);
    expect(checkPredicates(compileIntent({ rooms: 3 }), narrowed)[0]?.detail).toBe("rooms: expected 3, got 3");
  });

  it("names the measured fact in the feedback", () => {
    expect(feedbackForResult(validateIntent(ISSUE_PLAN, { rooms: 7 }))[0]).toContain("expected 7, got 4");
  });

  it("leaves describe() alone: the top-level facts are still the lowest storey", () => {
    const s = describe(ISSUE_PLAN);
    expect(s.rooms.map((r) => r.id)).toEqual(["liv"]);
    expect(s.windows.map((w) => w.room)).toEqual(["liv"]);
    expect(s.totals).toMatchObject({ rooms: 1, windows: 1, floor_area_m2: 30 });
    expect(s.levels?.map((l) => l.rooms.length)).toEqual([1, 3]);
  });

  it("judges a single `level` block exactly as the same plan without one", () => {
    const body = `room id=bed at (0,0) size 4000x3000 label "Bedroom" uses bedroom
      walls from rooms exterior 200 partition 100
      window on bed.right width 1200`;
    const intent: Intent = {
      rooms: 2,
      roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }],
      totalAreaM2: { max: 5, source: "brief" },
    };
    const flat = validateIntent(`plan "p" {\n units mm\n ${body}\n}`, intent);
    const levelled = validateIntent(`plan "p" {\n units mm\n level 0 {\n ${body}\n }\n}`, intent);
    expect(levelled.assertions).toEqual(flat.assertions);
    expect(levelled.violations).toEqual(flat.violations);
  });
});

/**
 * The byte law for a plan with no `level` blocks. No example carries an intent, so each is held
 * to intents written to reach every read this change touches, in both verdicts. Each digest is
 * SHA-256 of the whole `validateIntent` result, diagnostics included, taken with this test's own
 * body on `main` before the change (62c0d10d). `accessible` has no row only because a digest
 * keyed by that word trips gitleaks (`docs/agents/gotchas.md`). A new example needs no row. An
 * edit to a listed example can move its row, as it moves every corpus digest: explain the move,
 * then re-take it.
 */
suite("a single-storey plan is judged byte for byte as before (#365)", () => {
  const PROBES: Intent[] = [
    {
      rooms: 4,
      roomsInclude: [
        { concept: "bedroom", count: { min: 1, max: 2 }, windows: { min: 1, facing: "S" } },
        { concept: "bathroom", areaM2: { min: 3, max: 9, source: "brief" }, windows: { max: 0 } },
        { concept: "hall" },
        { concept: "r1" },
      ],
      totalAreaM2: { min: 30, max: 80, source: "brief" },
      adjacency: { requiredEdges: { kitchen: ["living-room"], bedroom: ["hall"] }, source: "brief" },
      reachable: true,
    },
    {
      rooms: 1,
      roomsInclude: [{ concept: "living-room", windows: { min: 1, facing: "street" } }],
      totalAreaM2: { min: 1000, source: "brief" },
    },
    { totalAreaM2: { max: 1000, source: "brief" }, roomsInclude: [{ concept: "kitchen", count: { min: 0 } }] },
  ];

  const digest = (file: string): string => {
    const source = readFileSync(`examples/${file}.arch`, "utf8");
    const world = makeNodeWorld("examples");
    const results = PROBES.map((p) => validateIntent(source, p, { world }));
    return createHash("sha256").update(JSON.stringify(results)).digest("hex");
  };

  const BASELINE: Record<string, string> = {
    aquarium: "4306761d7dbfc15658825f532a2ac5162be46c73b0c39db8793b670a04acfcc5",
    attached: "359f0deb53753537a89c9ffdd03551bd9a1f0ff8662303425c4c39a318bf93c8",
    bungalow: "450689946fb084c856f2f5169b1cf7aa4050287cb437e617a8f332e5a50ccf31",
    "classroom-block": "da0a113fd2ebc2eea0703e8ed11600104be2f8ffd24e8fadd472ca07d8cf61e1",
    clinic: "c2f5da737a0abfb97fc44f7c0d6b0bb0a8e5b3c0d4d36e7265bed3cb2511363c",
    "corner-cafe": "e3de3e7eaa0539600bbea82092d9c9f89b9803494267f348ee5e2a2fc02662b1",
    "courtyard-house": "afee25a805b1ee68bb13b4e6ff85aeccd2b4b58e286b1fa2e8ae16d07c9a674e",
    "furnished-flat": "99638db1ec24f4cb876f4846605f0856f33330b694373f4d9050bb1978ec1007",
    "gallery-l": "330ae8a0f72e6082aa6f13252626067d9953aaaa17cd289e4d5eecf16770dde1",
    "garden-loft": "381c98c7a72bff9b72b1bb4bc386fec85b1ca6dde9df345bc31acd02b3bca9da",
    "hexagon-pavilion": "fb1fa57cf07b976c70953b3f402ba1d57e13fdcf5753fa011fc6aa6f15bd2b68",
    imports: "e8bf012b08d69a1521d15d2a1266bb24749e8b93a43d7dcbb096b1b2a88df08b",
    "laneway-house": "9c786524a99f63ce59d3d9cd746b907934b2ec0022eae229d83bd0d9f412d4f0",
    library: "e3a40c55732cb798b09cc0b731d781651d9be27561d5c25810d81c4246627bc9",
    materials: "8513b5a74241f2bed595f140891df81051285506bbeb8b35aa69d6cd0c613b15",
    "museum-wing": "fbc7e26dd927c64aaf0f5c5cf7f35635e13867be21600cfe1da35ee84a2e3acc",
    "museum-wings": "edc314f147e74e97704ff99e2c36b5eb15ce4150052dc46d3e55bc8a5b75121e",
    museum: "81cae38198ba6537fe2a9c32919326a11bdd61e43d75843f09194cc46986de14",
    "one-room": "8279c25596f877350b94754d53a59c88e1aab3e6d3a1e5afcfadc8cd6f855fde",
    parametric: "0b87412ecdfc4a8431527ab7d1fc5367c42e96afda5a0d257a4b474401389f63",
    "practice-office": "6f7566a4a40c86ddee9415224ef172dc06868a1696a890ae7c8d79d86ca7c0dd",
    relational: "e4b9236ac8091b058c5acb7bbdf5f3d046b4f8ae5194e11cb129bf4c0cb8bdcb",
    remodel: "b8e496216ab2f8dc2436f184f91da6d8f36543d009a38d5dbf619f4e39e1f976",
    "sheet-notes": "ff97b591c3e15bb792819d58166a194272cfcd52ddc542204bf2db37074c9148",
    studio: "81c8607a83c919e8b6f2c67993e6c6a187331eccfdd5450ed24448bb3d5c21be",
    "terrace-row": "22d586d12d1da0045d02dc3bcd79ffb552e1dfba0b1743681075a68585c96a6f",
    themed: "c94bceaa72367882111af9fe1075282cd751167bb6c392fec580379549833392",
    "tiny-house": "537818f0aecf557850a4f9a83b8f2f60e5df49ee8594c1a713958671c38d4625",
    "transit-hall": "b3ec3dc7475cc903c3393515a46886aeaf48ef90951607650ce41760c1a53587",
    "two-bed": "26c529234c070ca4d157c4196ffa8c7a0716bcf9cef0cd28cbf341888564c849",
  };

  it("holds over the examples with no `level` blocks", () => {
    for (const [file, sha] of Object.entries(BASELINE)) {
      const source = readFileSync(`examples/${file}.arch`, "utf8");
      expect(describe(source, { world: makeNodeWorld("examples") }).levels, file).toBeUndefined();
      expect(digest(file), file).toBe(sha);
    }
  });
});
