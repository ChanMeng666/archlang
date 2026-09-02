import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_TOL } from "../src/analyze.js";
import { navCellSizeMm } from "../src/analyze/circulation.js";
import { computeRoomClearances, roomCellSizeMm } from "../src/analyze/occupancy.js";
import { describe as describePlan, lint } from "../src/index.js";
import { resolve } from "../src/ir.js";
import type { RDoor, RFurniture, ROpening, RRoom } from "../src/ir.js";
import { parse } from "../src/parser.js";

/**
 * Scale-aware analysis grids (ADR 0008 addendum): both the whole-plan nav grid and the
 * per-room occupancy grid pick their cell from a target cell SIZE bounded by a total
 * cell BUDGET, so measurement RESOLUTION no longer shrinks as the building grows.
 *
 * The old rule was a fixed cell COUNT, which made every number scale-relative: at
 * 100 x 60 m the nav cell reached 775 mm, so a 900 mm door was one cell and every clear
 * width quantised to the same value — the measurements a large plan most needs.
 */

const m2 = (mm2: number): number => mm2 / 1_000_000;

describe("nav-grid resolution scales with plan area", () => {
  it("keeps every dwelling-scale plan at the 100 mm floor", () => {
    expect(navCellSizeMm(7000 * 6000)).toBe(100); // studio.arch — 42 m²
    expect(navCellSizeMm(15000 * 10000)).toBe(100); // a bungalow — 150 m²
    // The floor holds all the way to MAX_CELLS · MIN_CELL_MM² = 2500 m².
    expect(navCellSizeMm(50000 * 50000)).toBe(100);
  });

  it("grows the cell only past the budget, and then as sqrt(area)", () => {
    expect(navCellSizeMm(100000 * 60000)).toBe(155); // museum.arch — 6000 m²
    // Four times the area is twice the cell: resolution degrades as sqrt, never faster.
    expect(navCellSizeMm(200000 * 120000)).toBe(2 * 155);
    // Monotonic in the area — a bigger plan is never gridded finer.
    let prev = 0;
    for (const a of [1e6, 1e8, 1e9, 6e9, 1e10, 1e11]) {
      const c = navCellSizeMm(a);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("bounds the total grid by the budget alone — no per-axis clamp needed", () => {
    // Whatever the aspect ratio, cells ≈ area / cell² stays inside the budget. A long
    // thin building is exactly the case a per-axis cap used to silently coarsen.
    for (const [w, h] of [
      [100000, 60000],
      [400000, 3000],
      [3000, 400000],
      [1_000_000, 1_000_000],
    ] as const) {
      const cell = navCellSizeMm(w * h);
      const cells = Math.ceil(w / cell) * Math.ceil(h / cell);
      expect(cells).toBeLessThan(260_000);
    }
  });

  it("reports the derived cell size on the real flagship plans", () => {
    const studio = readFileSync(new URL("../examples/studio.arch", import.meta.url), "utf8");
    const museum = readFileSync(new URL("../examples/museum.arch", import.meta.url), "utf8");
    expect(describePlan(studio).circulation?.cellSizeMm).toBe(100);
    expect(describePlan(museum).circulation?.cellSizeMm).toBe(155);
  });

  it("uses the same shape for the per-room occupancy grid, on its own budget", () => {
    expect(roomCellSizeMm(3000 * 3000)).toBe(100); // a bedroom
    expect(roomCellSizeMm(25000 * 10000)).toBe(100); // the floor holds to 250 m²
    expect(roomCellSizeMm(26000 * 26000)).toBe(165); // a museum gallery — was ~520 mm
  });
});

/**
 * A large plan with two routes off the entrance hall, each squeezed by a facing pair of
 * fixtures — one leaving a 1000 mm gap, the other 1800 mm. Clearance is distance to
 * FURNITURE (never to a wall), so a pinch has to be built from furniture; the plan is
 * 100 x 60 m so both grids sit on their budget rather than at the 100 mm floor.
 */
const OPENING = 12000;
const TWO_CORRIDORS = (narrowGap: number, wideGap: number): string => {
  // A facing pair covering its whole 12 m threshold except a `gap` in the middle, so the
  // gap is the only way through and the reported bottleneck is that gap.
  const pair = (cx: number, gap: number, tag: string): string => {
    const w = OPENING / 2 - gap / 2;
    return (
      `  furniture cabinet at (${cx - OPENING / 2},40100) size ${w}x3000 label "${tag}_w"\n` +
      `  furniture cabinet at (${cx + gap / 2},40100) size ${w}x3000 label "${tag}_e"\n`
    );
  };
  return `plan "Two Corridors" {
  units mm
  grid 100
  paper A1 landscape
  scale 1:200
  wall exterior thickness 300 { (0,0) (100000,0) (100000,60000) (0,60000) close }
  wall id=div partition thickness 200 { (0,40000) (100000,40000) }
  wall id=mid partition thickness 200 { (50000,40000) (50000,60000) }
  room id=hall   at (0,0)      size 100000x40000 label "Hall" uses entry hall
  room id=narrow at (0,40000)  size 50000x20000 label "Narrow Wing"
  room id=wide   at (50000,40000) size 50000x20000 label "Wide Wing"
  door id=entry at (50000,0) width 3000 swing in
  opening id=o_narrow at (25000,40000) width ${OPENING}
  opening id=o_wide   at (75000,40000) width ${OPENING}
${pair(25000, narrowGap, "n")}${pair(75000, wideGap, "w")}}`;
};

describe("a large plan can tell a narrow route from a wide one", () => {
  const src = TWO_CORRIDORS(1000, 2400);
  /** The entrance door's own clear width — the cap on every route in the plan. It is
   *  deliberately wider than either corridor: the reported width is now the width a BODY
   *  passes through rather than that minus its own diameter, so a 2000 mm door capped
   *  BOTH readings at 1940 and the discrimination below measured nothing. */
  const ENTRANCE_CLEAR = 2940;

  it("measures distinguishably different bottlenecks (the point of the item)", () => {
    const c = describePlan(src).circulation;
    expect(c).not.toBeNull();
    if (!c) return;
    // The plan is far past the budget, so this is NOT the 100 mm floor — the discrimination
    // below is happening at a derived, coarser-than-a-dwelling resolution.
    expect(c.cellSizeMm).toBe(155);

    const by = Object.fromEntries(c.rooms.map((r) => [r.roomId, r]));
    const narrow = by.narrow?.bottleneckClearWidthMm;
    const wide = by.wide?.bottleneckClearWidthMm;
    expect(narrow).toBeGreaterThan(0);
    // Both routes are read from their own pinch, not from the plan-wide entrance cap —
    // otherwise the assertions below would pass without measuring the corridors at all.
    expect(wide).toBeLessThan(ENTRANCE_CLEAR);
    // Ordering plus a real gap, not exact values: the numbers are honestly coarse, but a
    // 1.0 m squeeze and a 2.4 m one must never round to the same reading. They did —
    // with a 775 mm cell both read 1940 mm, i.e. neither pinch registered at all.
    expect(wide!).toBeGreaterThan(narrow!);
    expect(wide! - narrow!).toBeGreaterThan(500);
    // And each reading is in the neighbourhood of the gap it measures rather than one
    // body diameter under it. The slack is a whole 155 mm cell either way — the free band
    // is measured at cell CENTRES, so at this resolution the phase of the grid against
    // the gap is worth two cells — but 1000 mm can no longer come back as 400.
    expect(narrow!).toBeGreaterThan(1000 - 2 * 155);
    expect(wide!).toBeGreaterThan(2400 - 2 * 155);
  });

  it("fires W_PATH_TOO_NARROW for the narrow route only", () => {
    // 600 mm is the body's own width, so this route is genuinely impassable while the
    // 2.4 m one is not — and at a 155 mm cell that is the honest place to draw the line.
    // The gap used to be 1000 mm here, which the rule flagged under a 900 mm threshold
    // only because every furniture-derived width came back 600 mm short: a 1.0 m gap is
    // wider than the rule asks for, and flagging it was a false positive, not a catch.
    const impassable = TWO_CORRIDORS(600, 2400);
    const codes = (profile: string) =>
      lint(impassable, { profile })
        .filter((d) => d.code === "W_PATH_TOO_NARROW")
        .map((d) => d.message);
    // Under the accessibility-advisory profile's 900 mm continuous clear width.
    const advisory = codes("accessibility-advisory");
    expect(advisory.some((m) => m.includes("Narrow Wing"))).toBe(true);
    expect(advisory.some((m) => m.includes("Wide Wing"))).toBe(false);
    // …and at the default profile too: a sealed room is not a threshold question.
    expect(codes("default").some((m) => m.includes("Narrow Wing"))).toBe(true);
  });

  it("is deterministic at budget resolution (two runs deep-equal)", () => {
    expect(describePlan(src).circulation).toEqual(describePlan(src).circulation);
    expect(JSON.stringify(describePlan(src))).toBe(JSON.stringify(describePlan(src)));
  });
});

describe("a fixture across part of a wide threshold narrows it, never seals it", () => {
  // Once the cell is a real length rather than a fraction of the plan, a connector spans
  // many cells — so modelling the threshold as the one cell at its centre point stops
  // being adequate: a fixture over that centre would read as closing the room off. The
  // museum's cafe is exactly that shape, a 6 m servery across half a 4 m threshold.
  it("keeps the museum's cafe reachable, and the flagship lint-clean", () => {
    const museum = readFileSync(new URL("../examples/museum.arch", import.meta.url), "utf8");
    const c = describePlan(museum).circulation;
    expect(c?.rooms.map((r) => r.roomId)).toContain("cafe");
    expect(lint(museum)).toEqual([]);
  });

  it("still reports a room unreachable when the fixtures cover the WHOLE opening", () => {
    // The fallback only carves the parts of an opening that are genuinely walkable, so a
    // fully blocked threshold must stay blocked — no room may be connected by fiat.
    const c = describePlan(TWO_CORRIDORS(0, 1800)).circulation;
    expect(c).not.toBeNull();
    const ids = c?.rooms.map((r) => r.roomId) ?? [];
    expect(ids).toContain("wide");
    expect(ids).not.toContain("narrow");
    // Unreachable is now REPORTED, not merely absent: the omission was the whole of
    // `docs/backlog.md` 5.8, since the lint rule's domain was the array above.
    expect(c?.blockedRoomIds).toEqual(["narrow"]);
  });
});

describe("occupancy sees a shallow fixture in a large room", () => {
  // A 30 x 20 m room — 600 m², well past the occupancy grid's 250 m² floor, so it grids
  // at 155 mm. Under the old fixed cell COUNT it gridded at ~492 x 500 mm, and blocking
  // is "is the cell CENTRE inside the footprint", so a fixture only a few hundred mm deep
  // was measured by whether its band happened to straddle a row of centres.
  const bigRoom = (piece: string): string => `plan "Big Room" {
  units mm
  grid 100
  wall exterior thickness 300 { (0,0) (30000,0) (30000,20000) (0,20000) close }
  room id=big at (0,0) size 30000x20000 label "Hall" uses entry hall
  door id=entry at (15000,0) width 1200 swing in
${piece}}`;

  const clearanceOf = (src: string) => {
    const { plan } = parse(src);
    const ir = resolve(plan!).ir;
    const rooms = ir.elements.filter((e) => e.kind === "room") as RRoom[];
    const furniture = ir.elements.filter((e) => e.kind === "furniture") as RFurniture[];
    const doors = ir.elements.filter((e) => e.kind === "door") as RDoor[];
    const openings = ir.elements.filter((e) => e.kind === "opening") as ROpening[];
    return computeRoomClearances(rooms, furniture, doors, openings, ir.walls, DEFAULT_TOL)[0];
  };

  const ROOM_M2 = m2(30000 * 20000);

  it("charges a 600 mm counter's footprint against the clear floor, to within a cell row", () => {
    const rc = clearanceOf(bigRoom(`  furniture counter at (5000,9700) size 20000x600 label "Counter"\n`));
    expect(rc).toBeDefined();
    if (!rc) return;
    const counterM2 = m2(20000 * 600);
    // Accuracy, not just visibility: the error must stay inside one cell row along the
    // counter's length (~155 mm x 20 m ≈ 3.1 m²). The old ~500 mm rows could only
    // quantise a 600 mm depth to 500 or 1000 mm and here over-blocked by ~8 m² — two
    // thirds of the piece's own footprint — so this bound needs the finer grid.
    expect(Math.abs(rc.totalClearAreaM2 - (ROOM_M2 - counterM2))).toBeLessThan(3.2);
    // It is a counter, not a barricade: the door still reaches all of the clear floor.
    expect(rc.reachableClearAreaM2).toBe(rc.totalClearAreaM2);
  });

  it("sees a 400 mm bench that fell between two of the old cell rows entirely", () => {
    // The old grid's row centres here were 250, 750, 1250 … mm; a band of y ∈ [9800,10200]
    // contains none of them, so this piece measured as literally not there.
    const rc = clearanceOf(bigRoom(`  furniture counter at (5000,9800) size 20000x400 label "Bench"\n`));
    expect(rc).toBeDefined();
    if (!rc) return;
    expect(rc.totalClearAreaM2).toBeLessThan(ROOM_M2 - 4); // ~8 m² is charged, not 0
    expect(ROOM_M2 - rc.totalClearAreaM2).toBeLessThan(m2(20000 * 400) + 3.2);
  });
});
