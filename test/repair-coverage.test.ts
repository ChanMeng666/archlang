import { describe, expect, it } from "vitest";
import { lint, repair } from "../src/index.js";

/**
 * `arch repair` coverage — **a silent no-op is the bug** (ADR 0006).
 *
 * repair's statement scan used to read only top-level `furniture … at (x,y)` statements
 * with literal coordinates, so a plan whose pieces came out of a `for` body, a component,
 * an `if` branch, or an `in <room> anchor` placement got back
 * `{ changed: false, changes: [], unresolved: [] }` — a clean-looking run while `lint`
 * reported real collisions. These tests pin the contract that replaced it:
 *
 *   * the scan walks INTO `for`/`while`/`if`/component bodies;
 *   * a statement with exactly one resolved instance and literal coordinates is
 *     rewritten (so a component instantiated once, or a taken `if` branch, is repaired);
 *   * an `in <room>` placement is rewritten in its OWN form — a minimal `inset` edit when
 *     the move runs along the anchored axis (in the wall-face frame when the placement is
 *     `flush`), else the whole placement becomes an absolute `at`, carrying the rotation
 *     the anchor had derived;
 *   * anything repair may not rewrite — a scripted statement, an `against wall` anchor,
 *     expression coordinates — is **reported**, never skipped in silence;
 *   * THE POSTCONDITION: every piece the mover/orientation passes flag ends up with a
 *     change entry or an `unresolved` entry. Never nothing.
 */

/** The lint codes that report against the FURNITURE statement's own span. */
const FURNITURE_CODES = new Set([
  "W_FURNITURE_WALL_COLLISION",
  "W_FURNITURE_OVERLAP",
  "W_FIXTURE_FLOATING",
  "W_FIXTURE_WRONG_ROOM",
  "W_FIXTURE_BACK_TO_ROOM",
]);

const codes = (src: string): string[] => lint(src).map((d) => d.code);

/** Statement offsets repair reported on, as changes ∪ unresolved. */
const reportedSpans = (src: string): Set<number> => {
  const r = repair(src);
  const out = new Set<number>();
  for (const e of [...r.changes, ...r.unresolved]) if (e.span) out.add(e.span.start);
  return out;
};

// ---------------------------------------------------------------------------
// scripted placement: reported, never silently skipped
// ---------------------------------------------------------------------------

const LOOP_BENCHES = `plan "Hall" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r at (0,0) size 8000x6000 label "Hall" uses hall
  door id=entry at (4000,0) width 900 wall exterior hinge left swing in
  for i in 0..3 {
    furniture bench at (1000 + i * 200, 3000) size 1600x500
  }
}`;

describe("repair — scripted statements are reported, not skipped", () => {
  it("declines a `for`-expanded overlap but says so, naming the loop and its pieces", () => {
    // Three benches 200 mm apart out of one statement: a real pile-up lint flags three
    // times. The old scan never saw them at all — `{changed:false, unresolved:[]}`.
    expect(codes(LOOP_BENCHES).filter((c) => c === "W_FURNITURE_OVERLAP")).toHaveLength(3);
    const r = repair(LOOP_BENCHES);
    expect(r.changed).toBe(false); // one statement cannot carry three positions
    expect(r.source).toBe(LOOP_BENCHES); // …so the source is untouched
    expect(r.unresolved.length).toBeGreaterThan(0);
    for (const u of r.unresolved) {
      expect(u.reason).toMatch(/overlaps "bench_\d"/);
      expect(u.reason).toContain("scripted");
      expect(u.reason).toContain("`for` statement at line 7");
      expect(u.reason).toContain("bench_1, bench_2, bench_3");
    }
    // The report names the pieces by their RESOLVED ids — the ones `lint`/`describe` print.
    expect(r.unresolved.map((u) => u.id)).toEqual(["bench_2", "bench_3"]);
    // …and every flagged statement span is accounted for (the postcondition, locally).
    const flagged = lint(LOOP_BENCHES)
      .filter((d) => FURNITURE_CODES.has(d.code))
      .map((d) => d.span!.start);
    const reported = reportedSpans(LOOP_BENCHES);
    for (const s of flagged) expect(reported.has(s)).toBe(true);
  });

  it("declines a component instantiated twice, naming the component", () => {
    const src = `plan "P" {
  units mm
  grid 50
  component Pair(x) {
    furniture bench at (x,3000) size 1600x500
  }
  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r at (0,0) size 8000x6000 label "Hall" uses hall
  door id=entry at (4000,0) width 900 wall exterior hinge left swing in
  Pair(1000)
  Pair(1400)
}`;
    expect(codes(src)).toContain("W_FURNITURE_OVERLAP");
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved.some((u) => u.reason.includes('component "Pair"'))).toBe(true);
    expect(r.unresolved.some((u) => u.reason.includes("expands to 2 pieces"))).toBe(true);
  });

  it("declines expression coordinates rather than discarding the arithmetic", () => {
    const src = `plan "P" {
  units mm
  grid 50
  let x0 = 3200
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "A"
  room id=b at (4000,0) size 4000x4000 label "B"
  door id=entry at (2000,0) width 900 wall exterior hinge left swing in
  door id=mid   at (4000,2000) width 900 wall partition hinge left swing in
  furniture sofa at (x0,1000) size 1000x900
}`;
    expect(codes(src)).toContain("W_FURNITURE_WALL_COLLISION");
    const r = repair(src);
    expect(r.changed).toBe(false);
    const note = r.unresolved.find((u) => u.id === "sofa_1");
    expect(note).toBeDefined();
    expect(note!.reason).toContain('penetrates wall "partition_2"');
    expect(note!.reason).toContain("coordinates are expressions");
  });
});

// ---------------------------------------------------------------------------
// nested but single-instance: actually repaired
// ---------------------------------------------------------------------------

/** A sofa drawn through the partition, placed by `slot` inside the plan body. */
const nested = (slot: string) => `plan "P" {
  units mm
  grid 50
  let one = 1
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "A"
  room id=b at (4000,0) size 4000x4000 label "B"
  door id=entry at (2000,0) width 900 wall exterior hinge left swing in
  door id=mid   at (4000,2000) width 900 wall partition hinge left swing in
  ${slot}
}`;

describe("repair — a single resolved instance is rewritten however it is nested", () => {
  it("moves furniture declared inside a component instantiated once", () => {
    const src = `plan "P" {
  units mm
  grid 50
  component Nook() {
    furniture sofa at (3200,1000) size 1000x900
  }
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "A"
  room id=b at (4000,0) size 4000x4000 label "B"
  door id=entry at (2000,0) width 900 wall exterior hinge left swing in
  door id=mid   at (4000,2000) width 900 wall partition hinge left swing in
  Nook()
}`;
    expect(codes(src)).toContain("W_FURNITURE_WALL_COLLISION");
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]!.via).toBe("at");
    expect(r.changes[0]!.reason).toContain("wall");
    // The edit lands inside the component body, where the statement lives.
    expect(r.source).toContain("component Nook() {\n    furniture sofa at (2700, 600)");
    expect(codes(r.source)).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("moves furniture in a taken `if` branch", () => {
    const src = nested("if one == 1 {\n    furniture sofa at (3200,1000) size 1000x900\n  }");
    expect(codes(src)).toContain("W_FURNITURE_WALL_COLLISION");
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.via).toBe("at");
    expect(r.source).toContain("if one == 1 {\n    furniture sofa at (2700, 600)");
    expect(codes(r.source)).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("leaves an untaken `if` branch alone (it draws nothing to flag)", () => {
    const src = nested("if one == 2 {\n    furniture sofa at (3200,1000) size 1000x900\n  }");
    expect(codes(src)).not.toContain("W_FURNITURE_WALL_COLLISION");
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// `in <room>` placements: rewritten in their own form
// ---------------------------------------------------------------------------

/** A bath whose only fixture floats 900 mm below the north wall — `anchor top inset`
 *  from the room rectangle, or the same position `flush` from the wall face (800). */
const floatingWc = (place: string) => `plan "Bath" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
  room id=r at (0,0) size 5000x5000 label "Bath" uses bath
  door id=entry at (2500,5000) width 900 wall exterior hinge left swing in
  furniture wc in r ${place} size 400x700
}`;

describe("repair — `in <room>` placements", () => {
  it("rewrites the `inset` minimally instead of dropping the placement", () => {
    const src = floatingWc("anchor top inset 900");
    expect(codes(src)).toContain("W_FIXTURE_FLOATING");
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.via).toBe("inset");
    expect(r.changes[0]!.reason).toContain("`inset 100`");
    // Still a declarative placement — only the number moved.
    expect(r.source).toContain("furniture wc in r anchor top inset 100 size 400x700");
    expect(codes(r.source)).not.toContain("W_FIXTURE_FLOATING");
  });

  it("computes a `flush` placement's inset in the wall-face frame", () => {
    // Same physical fixture, same physical move: `inset` measures from the plaster, so
    // the rewritten number is 0 where the room-referenced form needs 100. Dropping
    // `flush` (or solving in the wrong frame) would move the piece into the wall.
    const src = floatingWc("anchor top flush inset 800");
    expect(codes(src)).toContain("W_FIXTURE_FLOATING");
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.via).toBe("inset");
    expect(r.changes[0]!.reason).toContain("from the wall face");
    expect(r.source).toContain("furniture wc in r anchor top flush inset 0 size 400x700");
    expect(codes(r.source)).not.toContain("W_FIXTURE_FLOATING");
    // Both forms end at the same place, which is what "same move, other frame" means.
    expect(repair(floatingWc("anchor top inset 900")).changes[0]!.to).toEqual(r.changes[0]!.to);
  });

  it("rewrites the whole placement to an absolute `at` when no `inset` expresses the move, keeping the derived rotation", () => {
    // `anchor bottom` centres the piece horizontally, so a sideways separation is not an
    // `inset` at all. The placement becomes `at`, and the rotation the anchor DERIVED
    // (back to the south wall = 180) is written out — dropping it would spin the WC.
    const src = `plan "Bath" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
  room id=r at (0,0) size 5000x5000 label "Bath" uses bath
  door id=entry at (500,0) width 900 wall exterior hinge left swing in
  furniture chest at (2500,4200) size 1000x700
  furniture wc in r anchor bottom flush size 400x700
}`;
    expect(codes(src)).toContain("W_FURNITURE_OVERLAP");
    const r = repair(src);
    expect(r.changed).toBe(true);
    const move = r.changes.find((c) => c.id === "wc#2")!;
    expect(move.via).toBe("placement");
    expect(move.reason).toContain("could not express the move as an `inset`");
    expect(move.reason).toContain("`rotate 180` is now written out");
    expect(r.source).toContain("furniture wc at (2100, 4200) size 400x700 rotate 180 in r");
    expect(lint(r.source)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// `against wall`: never moved, never silent
// ---------------------------------------------------------------------------

const againstWall = (order: "fixture-last" | "fixture-first") => {
  const wc = "  furniture wc against wall partition offset 3400 side right size 400x700 in a\n";
  const chest = "  furniture chest at (3200,1600) size 1000x800\n";
  return `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
  wall partition thickness 100 { (0,2500) (5000,2500) }
  room id=a at (0,0)    size 5000x2500 label "Bath" uses bath
  room id=b at (0,2500) size 5000x2500 label "Bed" uses bedroom
  window at (2000,0) width 1200 wall exterior
  window at (2000,5000) width 1200 wall exterior
  door id=entry at (2500,0) width 900 wall exterior hinge left swing in
  door id=mid   at (1000,2500) width 900 wall partition hinge left swing in
${order === "fixture-last" ? chest + wc : wc + chest}}`;
};

describe("repair — `against wall` furniture", () => {
  it("explains a flagged wall-anchored fixture instead of moving it or saying nothing", () => {
    const src = againstWall("fixture-last");
    expect(codes(src)).toContain("W_FURNITURE_OVERLAP");
    const r = repair(src);
    expect(r.changed).toBe(false); // the wall is authoritative — repair never overrides it
    expect(r.source).toBe(src);
    const note = r.unresolved.find((u) => u.id === "wc_2");
    expect(note).toBeDefined();
    expect(note!.reason).toContain('overlaps "chest_1"');
    expect(note!.reason).toContain("against wall partition");
    expect(note!.reason).toContain("`offset`/`side`");
  });

  it("treats it as an obstacle the movable piece must yield to", () => {
    // The mirror case: the free piece is the later one, so IT moves — a wall-anchored
    // fixture used to be invisible to the mover and the overlap stood.
    const src = againstWall("fixture-first");
    expect(codes(src)).toContain("W_FURNITURE_OVERLAP");
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes.map((c) => c.id)).toEqual(["chest#2"]);
    expect(codes(r.source)).not.toContain("W_FURNITURE_OVERLAP");
  });
});

// ---------------------------------------------------------------------------
// THE POSTCONDITION
// ---------------------------------------------------------------------------

/**
 * One plan carrying every kind of statement at once: an absolute piece through a wall,
 * an anchored piece that needs a push, a `for`-expanded pile-up, an `against wall`
 * fixture in the way, a piece with expression coordinates, and a chest parked in the
 * entrance door's landing.
 */
const MIXED = `plan "Mixed" {
  units mm
  grid 50
  let x0 = 3200
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall partition thickness 100 { (4000,0) (4000,6000) }
  room id=a at (0,0)    size 4000x6000 label "Living" uses living
  room id=b at (4000,0) size 4000x6000 label "Bath"   uses bath
  window at (1000,0) width 1200 wall exterior
  door id=entry at (2000,0)    width 900 wall exterior hinge left swing in
  door id=mid   at (4000,3000) width 900 wall partition hinge left swing in
  furniture sofa at (3600,4800) size 1400x800
  furniture wc in b anchor top inset 1200 size 400x700
  furniture desk at (x0,200) size 900x600
  furniture counter against wall partition offset 1200 side right size 1200x600 in b
  for i in 0..2 {
    furniture stool at (600 + i * 150, 2000) size 500x500
  }
  furniture chest at (1700,300) size 800x500
}`;

describe("repair — the postcondition: nothing flagged is left silent", () => {
  it("reports a change or an unresolved entry for every flagged piece", () => {
    const before = lint(MIXED);
    // The plan really is a mess: several distinct furniture faults, from several forms.
    const furnitureDiags = before.filter((d) => FURNITURE_CODES.has(d.code));
    expect(new Set(furnitureDiags.map((d) => d.code)).size).toBeGreaterThanOrEqual(3);

    const r = repair(MIXED);
    const reported = new Set<number>();
    for (const e of [...r.changes, ...r.unresolved]) if (e.span) reported.add(e.span.start);

    // (a) every statement lint flags by its own span is accounted for …
    const missed = [...new Set(furnitureDiags.map((d) => d.span!.start))].filter((s) => !reported.has(s));
    expect(missed).toEqual([]);

    // (b) … and so is the piece behind a door-side warning, which lint reports against
    // the DOOR's span — so it is checked against the statement we know sits in the
    // entrance door's swing (the chest).
    expect(before.map((d) => d.code)).toContain("W_SWING_OBSTRUCTED");
    expect(reported.has(MIXED.indexOf("furniture chest"))).toBe(true);

    // (c) nothing is reported twice as both a move and an excuse.
    const changedSpans = new Set(r.changes.map((c) => c.span!.start));
    for (const u of r.unresolved) expect(changedSpans.has(u.span!.start)).toBe(false);

    // (d) every entry is attributable: an id and a source span, always.
    for (const e of [...r.changes, ...r.unresolved]) {
      expect(e.id).toBeTruthy();
      expect(e.span).toBeDefined();
    }
  });

  it("is idempotent — the second run changes nothing and reports the same residue", () => {
    const first = repair(MIXED);
    expect(first.changed).toBe(true);
    const second = repair(first.source);
    expect(second.changed).toBe(false);
    expect(second.source).toBe(first.source);
    // The residue is what repair declined (scripted / wall-anchored / expression), so it
    // survives: a stable report an agent can act on, not a moving target. Only the line
    // number a scripted note cites moves, because the output is canonically formatted.
    const stable = (u: { id: string; reason: string }): string => `${u.id}: ${u.reason.replace(/line \d+/, "line N")}`;
    expect(second.unresolved.map(stable)).toEqual(first.unresolved.map(stable));
  });

  it("is deterministic — the same source gives byte-identical output and log", () => {
    expect(repair(MIXED)).toEqual(repair(MIXED));
    expect(repair(MIXED).source).toBe(repair(MIXED).source);
  });

  it("a component `place`d TWICE is reported once, never rewritten in silence", () => {
    // One `furniture` statement, two drawn pieces — and the two are in different places
    // on the page, so no single edit to the component body can fix both. The v1.19
    // postcondition still has to hold: the piece lint flags gets an entry, and it is an
    // `unresolved` one naming the component, not a change that would move both instances.
    const src = `plan "Twins" {
  units mm
  grid 50
  component pod() {
    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Pod" uses bedroom
    door id=d at (2000,4000) width 900 wall exterior hinge left swing in
    furniture id=bed bed at (-100,500) size 1600x2000
  }
  place pod() as west at (0,0)
  place pod() as east at (6000,0)
}`;
    const before = lint(src).filter((d) => FURNITURE_CODES.has(d.code));
    // BOTH instances are flagged — lint sees one plan — and both point at the one
    // statement that drew them.
    expect(before.length).toBe(2);
    expect(new Set(before.map((d) => d.span!.start)).size).toBe(1);

    const r = repair(src);
    // Nothing was silently rewritten …
    expect(r.changes).toEqual([]);
    // … and the piece IS accounted for, with the component named in the reason.
    expect(r.unresolved.length).toBeGreaterThan(0);
    expect(r.unresolved.map((u) => u.reason).join(" ")).toContain('component "pod"');
    expect(reportedSpans(src).has(src.indexOf("furniture id=bed"))).toBe(true);
  });

  it("says so instead of returning a clean no-op when the plan does not resolve", () => {
    const broken = `plan "P" {
  units mm
  grid 50
  furniture sofa at (0,0) size 1000x900 in nosuchroom
}`;
    const r = repair(broken);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(broken);
    expect(r.unresolved.map((u) => u.reason).join(" ")).toContain("does not resolve");
  });
});
