import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { accessDigraph, buildDoorAccessGraph, reachFrom, resolvePlan, roomBox, type RoomBox } from "../src/analyze.js";
import { entranceInputs, walkAccessGraph, walkWays } from "../src/analyze/entrance.js";
import type { RDoor, ROpening, RRoom } from "../src/ir.js";
import { describe as describePlan, lint, lintWithCoverage } from "../src/index.js";

/**
 * The main entrance (plan-soundness PS0.10). Reachability and the walk were seeded from every
 * exterior door, so a patio or balcony door masked a route blocked from the front door
 * (first-contact audit T2 and A2, each proven there by turning the secondary door into a
 * window). `describe().access` now names the front door when the plan says so unambiguously,
 * and the circulation and privacy rules judge a route from it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const FIRST_CONTACT = "test/plans/plan-soundness/audits/first-contact-plans";

const narrow = (src: string) => lint(src).filter((d) => d.code === "W_PATH_TOO_NARROW");

describe("PS0.10 — the main entrance", () => {
  it("A2: a balcony door is not a way in for the walk, so the laundry blocked from the front door is reported", () => {
    const src = read(`${FIRST_CONTACT}/1-apartment.arch`);
    const s = describePlan(src);
    expect(s.access.entrances).toEqual(["d_front", "d_bal"]);
    // The balcony slider is no candidate, so the door into the Hall is the main entrance.
    expect(s.access.mainEntrance).toEqual({ door: "d_front", basis: "entry-room", candidates: ["d_front"] });
    // The audit's proof: with the balcony door made a window, the same warning appears.
    const masked = src.replace(
      "door id=d_bal   sliding on w_s at 2000 width 2000",
      "window id=d_bal on w_s at 2000 width 2000",
    );
    const [d] = narrow(src);
    expect(d!.message).toBe(narrow(masked)[0]!.message);
    expect(d!.message).toContain('"Laundry" squeezes to 400 mm and stops there');
    expect(d!.message).not.toContain("d_front");
    expect(d!.hints!.at(-1)).toBe(
      "Measured from the main entrance `d_front` (the door into the entry, hall or circulation space). `d_bal` opens onto a balcony, which is no way in.",
    );
  });

  it("T2: refused without `site` (the patio door opens into a public room); with the street declared, both rooms are reported", () => {
    const src = read(`${FIRST_CONTACT}/5-townhouse.arch`);
    const ground = (s: ReturnType<typeof describePlan>) => s.levels!.find((l) => l.level === 0)!;
    // Width never decides, and a door into the hall does not outrank a door into the kitchen.
    expect(ground(describePlan(src)).access.mainEntrance).toEqual({
      door: null,
      basis: "tie",
      candidates: ["g_front", "g_patio"],
    });
    expect(narrow(src)).toEqual([]);
    // The plan's own comment says the street is to the south: the hinged street door is named.
    const sited = src.replace("  north up\n", "  north up\n  site { street south }\n");
    expect(ground(describePlan(sited)).access.mainEntrance).toEqual({
      door: "g_front",
      basis: "street",
      candidates: ["g_front"],
    });
    // Living has no door of its own; the kitchen's patio door is its only way in once the sofa
    // seals the hall opening, which is the mask PS0.10 removes: both are reported.
    expect(narrow(sited).map((d) => d.message)).toEqual([
      'The walk from the entrance to "Living" squeezes to 200 mm and stops there — no way in is wider, so no route reaches the room (500 mm below the 700 mm minimum).',
      'From the main entrance the walk to "Kitchen / Dining" squeezes to 200 mm and stops there (500 mm below the 700 mm minimum); the room is reached only through its own door from outside.',
    ]);
    const [, k] = narrow(sited);
    expect(k!.message).not.toContain("g_patio");
    expect(k!.hints!.at(-1)).toContain("`g_patio`");
  });

  const twoDoors = (front: string, side: string, store = "") => `plan "P" {
  units mm
  grid 100
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=p partition thickness 100 { (3000,0) (3000,5000) }
  ${store ? "wall id=q partition thickness 100 { (6000,0) (6000,5000) }" : ""}
  room id=r_hall at (0,0) size 3000x5000 label "Hall" uses hall
  room id=r_live at (3000,0) size ${store ? "3000" : "5000"}x5000 label "Living" uses living
  ${store}
  door id=d_hl on p at 2500 width 900
  door id=d_a ${front}
  door id=d_b ${side}
}`;

  it("two doors into rooms that are not entrance spaces, and no `site`: refused as a tie, and it says so", () => {
    // Both doors open into the living room; nothing singles one out, width included.
    const src = twoDoors("at (4500,0) width 900 wall shell", "at (5500,5000) width 1200 wall shell").replace(
      "door id=d_hl on p at 2500 width 900",
      "door id=d_hl on p at 2500 width 700",
    );
    const s = describePlan(src);
    expect(s.access.mainEntrance).toEqual({ door: null, basis: "tie", candidates: ["d_a", "d_b"] });
    expect(s.access.rooms.every((r) => !("depthFromMainEntrance" in r))).toBe(true);
    // The walk keeps every way in, and the coverage report (not the hint) says no main entrance
    // could be named, for the walk and for the privacy rules.
    const [d] = narrow(src);
    expect(d!.message).toContain('"Hall" squeezes to 640 mm');
    expect(d!.hints!.join(" ")).not.toContain("main entrance");
    const cov = lintWithCoverage(src).coverage!;
    for (const fam of ["circulation", "privacy"])
      expect(cov.families.find((f) => f.family === fam)!.skipped).toContainEqual({
        reason: "no-main-entrance",
        why: "no main entrance could be named",
      });
    // A storey that names its main entrance files no such skip.
    const named = lintWithCoverage(read(`${FIRST_CONTACT}/1-apartment.arch`)).coverage!;
    expect(JSON.stringify(named)).not.toContain("no-main-entrance");
  });

  it("a room reached only by its own door from outside keeps that door, and reads depthFromMainEntrance null", () => {
    const src = twoDoors(
      "at (1500,0) width 1000 wall shell",
      "at (7000,0) width 800 wall shell",
      `room id=r_store at (6000,0) size 2000x5000 label "Store" uses storage`,
    );
    const s = describePlan(src);
    expect(s.access.mainEntrance).toEqual({ door: "d_a", basis: "entry-room", candidates: ["d_a"] });
    expect(s.access.rooms.map((r) => [r.id, r.depthFromEntrance, r.depthFromMainEntrance])).toEqual([
      ["r_hall", 1, 1],
      ["r_live", 2, 2],
      ["r_store", 1, null],
    ]);
  });

  // The review round's probes (test/main-entrance-fixtures/): each pins the fact, and that lint says
  // exactly what it said before PS0.10 (no false warning on a room that has its own door, on the
  // hall that holds the front door, or from a wider back or delivery door crowned by width).
  const FIX = "test/main-entrance-fixtures";
  const NOT_EQUATOR =
    'W_ROOM_NOT_EQUATOR_FACING: Room "Living" has 1 window(s), none facing S (the equator side in the northern hemisphere) — they face N.';
  const UTILITY_640 =
    'W_PATH_TOO_NARROW: The walk from the entrance to "Utility" squeezes to 640 mm (60 mm below the 700 mm minimum) — the bottleneck is the door between "Living" and "Utility", 640 mm clear.';
  const probes: Array<[string, unknown, string[] | null]> = [
    // A 1000 mm back door into the Utility beside the 900 mm front door into the Hall.
    ["p1b-wider-back.arch", { door: "d_front", basis: "entry-room", candidates: ["d_front"] }, []],
    // The same, 10 mm wider at grid 10.
    ["p1c-grid10.arch", { door: "d_front", basis: "entry-room", candidates: ["d_front"] }, []],
    // The front door on the side wall, the back door on the street side.
    ["p2-side-front.arch", { door: "d_front", basis: "entry-room", candidates: ["d_front"] }, [NOT_EQUATOR]],
    // A 2400 mm slider into Living on the street beside the hinged front door into the Hall: the
    // Living door keeps step (a) from deciding; step (b) names the one hinged street door. The
    // Utility, which has no door of its own, read 640 mm before PS0.10 too.
    [
      "p3-street-slider.arch",
      { door: "d_front", basis: "street", candidates: ["d_front"] },
      [UTILITY_640, NOT_EQUATOR],
    ],
    // Four doors, none into an entrance space and no `site`: refused, a 1100 mm delivery door included.
    [
      "p4-cafe-delivery1100.arch",
      { door: null, basis: "tie", candidates: ["d_entry_a", "d_entry_b", "d_back", "d_delivery"] },
      null,
    ],
    // A 2400 mm courtyard slider into Living: the hinged door into the Entry hall on the street.
    ["c1-courtyard.arch", { door: "d_front", basis: "street", candidates: ["d_front"] }, [NOT_EQUATOR]],
    // A back door into the Kitchen beside the front door into the Hall, no `site`: refused.
    // PS2.17: the fixture's kitchen holds a sink and a stove and no worktop, which the kitchen
    // row now requires; that one warning is the room-contents rule's, not the entrance's.
    [
      "v1-privacy.arch",
      { door: null, basis: "tie", candidates: ["d_front", "d_back"] },
      [
        'W_ROOM_MISSING_DEFINING: "Kitchen" is furnished (kitchen sink, stove) but has no counter or worktop: the piece that makes it a kitchen.',
      ],
    ],
    // Round 2. A back hall or mud room does not outrank a front door straight into the living
    // room: refused, and no walk or privacy warning is raised from the back door.
    ["n7-back-hall.arch", { door: null, basis: "tie", candidates: ["d_back", "d_front"] }, null],
    ["n9-back-hall-privacy.arch", { door: null, basis: "tie", candidates: ["d_back", "d_front"] }, null],
    // The street door opens into a bedroom: no candidate (step 0); the patio slider is the one left.
    ["n3-street-bedroom.arch", { door: "d_patio", basis: "sole", candidates: ["d_patio"] }, null],
    // A patio slider into the living room beside the door into the Hall, no `site`: refused, so
    // every way in is kept (the coverage report says so).
    ["n6-stair-nowhere.arch", { door: null, basis: "tie", candidates: ["d_front", "d_patio"] }, null],
    // The bedroom's 600 mm garden door is no candidate (step 0); the door into the Hall is named.
    // Lint is main's: the bedroom's own narrow door already sets its walk.
    ["n8a-token600.arch", { door: "d_front", basis: "entry-room", candidates: ["d_front"] }, null],
  ];
  it.each(probes)("probe %s: the fact, and lint as before", (name, fact, lintAsBefore) => {
    const src = read(`${FIX}/${name}`);
    expect(describePlan(src).access.mainEntrance).toEqual(fact);
    const got = lint(src).map((d) => `${d.code}: ${d.message}`);
    if (lintAsBefore) expect(got).toEqual(lintAsBefore);
    else
      expect(
        got.filter(
          (m) =>
            m.startsWith("W_ROOM_VIA_PRIVATE") ||
            (m.startsWith("W_PATH_TOO_NARROW") && !name.startsWith("n8a")) ||
            m.includes("From the main entrance"),
        ),
      ).toEqual([]);
  });

  // A room blocked from the main entrance but holding its own door from outside is the mask
  // PS0.10 removes: reported with its own message, the door named in the hint only.
  const BLOCKED_BEDROOM =
    'From the main entrance the walk to "Bedroom" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum); the room is reached only through its own door from outside.';
  it("n8b: a bedroom sealed from the front door, with its own 1000 mm garden door, is reported", () => {
    const src = read(`${FIX}/n8b-door1000.arch`);
    expect(describePlan(src).access.mainEntrance).toEqual({
      door: "d_front",
      basis: "entry-room",
      candidates: ["d_front"],
    });
    const [d, ...rest] = narrow(src);
    expect(rest).toEqual([]);
    expect(d!.message).toBe(BLOCKED_BEDROOM);
    expect(d!.message).not.toContain("d_garden");
    expect(d!.hints!.at(-1)).toBe(
      "Measured from the main entrance `d_front`. The room's own door from outside, `d_garden`, is a way into it, but not the way the plan is entered.",
    );
    // The control: with the garden door made a window there is no own door, and the seal reads as
    // an ordinary blocked walk.
    expect(narrow(read(`${FIX}/n8c-control-window.arch`)).map((x) => x.message)).toEqual([
      'The walk from the entrance to "Bedroom" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum).',
    ]);
  });

  it("n6: with the street declared, the living room sealed behind the hall and open to the patio is reported", () => {
    const src = read(`${FIX}/n6-stair-nowhere.arch`).replace("  units mm\n", "  units mm\n  site { street north }\n");
    expect(describePlan(src).access.mainEntrance).toEqual({
      door: "d_front",
      basis: "street",
      candidates: ["d_front"],
    });
    expect(narrow(src).map((x) => x.message)).toEqual([
      'From the main entrance the walk to "Living" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum); the room is reached only through its own door from outside.',
    ]);
    // The control (patio door made a window) reads as before.
    expect(narrow(read(`${FIX}/n6c-control-window.arch`)).map((x) => x.message)).toEqual([
      'The walk from the entrance to "Living" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum).',
    ]);
  });

  it("s2: the studio's front door is named again, and the rooms its bedroom's garden door masked are reported", () => {
    const src = read(`${FIX}/s2-studio-bed-garden-blocked.arch`);
    expect(describePlan(src).access.mainEntrance).toEqual({ door: "d_main", basis: "sole", candidates: ["d_main"] });
    expect(narrow(src).map((x) => x.message)).toEqual([
      BLOCKED_BEDROOM,
      'The walk from the entrance to "Hall" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum).',
      'The walk from the entrance to "Bath" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum).',
    ]);
  });

  // Review round 3.
  const codes = (src: string) => lint(src).map((d) => d.code);
  const UTILITY_SEALED =
    'From the main entrance the walk to "Utility" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum); the room is reached only through its own door from outside.';
  const LIVING_BLOCKED =
    'The walk from the entrance to "Living" is blocked: furniture and its clearances leave no gap at all (0 mm against the 700 mm minimum).';

  it.each([
    // A studio the front door opens into is a living room with a bed in it, not a bedroom: its
    // door stays a candidate (step 0), so the utility back door is not named "sole".
    [
      "e1-studio-util.arch",
      ["W_SWING_OBSTRUCTED", "W_DOORWAY_BLOCKED", "W_FIXTURE_BACK_TO_ROOM", "W_ROOM_MISSING_DEFINING"],
    ],
    // The same studio by its label alone (no `uses`).
    ["e1b-studio-label.arch", ["W_SWING_OBSTRUCTED", "W_DOORWAY_BLOCKED", "W_FIXTURE_BACK_TO_ROOM"]],
  ])("%s: a studio's front door is still a candidate; refused, lint as on main", (name, lintCodes) => {
    const src = read(`${FIX}/${name}`);
    expect(describePlan(src).access.mainEntrance).toEqual({
      door: null,
      basis: "tie",
      candidates: ["d_front", "d_util"],
    });
    expect(codes(src)).toEqual(lintCodes);
  });

  it("q5b/q5c: a hinged street door into a utility room is not the front door; refused, lint as on main", () => {
    for (const name of ["q5b-street-service-sofa.arch", "q5c-nosite-sofa.arch"]) {
      const src = read(`${FIX}/${name}`);
      expect(describePlan(src).access.mainEntrance).toEqual({
        door: null,
        basis: "tie",
        candidates: ["d_util", "d_live"],
      });
      expect(codes(src)).toEqual(["W_SWING_OBSTRUCTED", "W_DOORWAY_BLOCKED"]);
    }
  });

  it("d1: a street door on a 45° wall faces no single side, so a quarter turn (north co-rotated) gives the same fact", () => {
    const facts = ["d1-chamfer.arch", "d1-chamfer-rot.arch"].map(
      (n) => describePlan(read(`${FIX}/${n}`)).access.mainEntrance,
    );
    expect(facts[0]).toEqual({ door: null, basis: "tie", candidates: ["d_ch", "d_s"] });
    expect(facts[1]).toEqual(facts[0]);
  });

  it("q7: a basement with no door from the ground does not make the ground floor an upper storey", () => {
    const src = read(`${FIX}/q7-basement.arch`);
    expect(describePlan(src).levels!.map((l) => l.access.mainEntrance ?? null)).toEqual([
      null,
      { door: "d_front", basis: "entry-room", candidates: ["d_front"] },
    ]);
    expect(narrow(src).map((d) => [d.level, d.message])).toEqual([
      [1, LIVING_BLOCKED],
      [1, UTILITY_SEALED],
    ]);
  });

  it("q7c: the two hints say what the measured walk found, so they never contradict", () => {
    const [living, utility] = narrow(read(`${FIX}/q7c-no-basement.arch`));
    expect([living!.message, utility!.message]).toEqual([LIVING_BLOCKED, UTILITY_SEALED]);
    expect(living!.hints!.at(-1)).toBe(
      "Measured from the main entrance `d_front` (the door into the entry, hall or circulation space). `d_util` opens into a room the walk from the main entrance does not reach: its own way in, not the way the plan is entered.",
    );
    expect(utility!.hints!.at(-1)).toBe(
      "Measured from the main entrance `d_front`. The room's own door from outside, `d_util`, is a way into it, but not the way the plan is entered.",
    );
  });

  it("w1: a room sealed behind its balcony slider reads as an ordinary blocked walk; the slider is no way in", () => {
    const [d, ...rest] = narrow(read(`${FIX}/w1-balcony-sealed.arch`));
    expect(rest).toEqual([]);
    expect(d!.message).toBe(LIVING_BLOCKED);
    expect(d!.hints!.at(-1)).toBe(
      "Measured from the main entrance `d_front` (the door into the entry, hall or circulation space). `d_bal` opens onto a balcony, which is no way in.",
    );
  });

  it("w2: a route sealed by a wall, not furniture, is outside PS0.10 (the seal is confirmed furniture-free)", () => {
    expect(narrow(read(`${FIX}/w2-wall-sealed.arch`))).toEqual([]);
  });

  it("an upper storey a stair arrives on names no main entrance, and walks from every way in (PS0.3)", () => {
    const src = read(`${FIX}/p5-upper-terrace.arch`);
    const s = describePlan(src);
    expect(s.levels!.map((l) => l.access.mainEntrance ?? null)).toEqual([
      null,
      { door: null, basis: "upper-storey", candidates: [] },
    ]);
    // The two deck doors open into the bedrooms; nothing is measured from either of them as a front door.
    expect(lint(src).map((d) => d.code)).toEqual(["W_ENTRANCE_INTO_PRIVATE", "W_ENTRANCE_INTO_PRIVATE"]);
  });

  it("a storey with one entrance or none gains no key at all", () => {
    const s = describePlan(read("examples/studio.arch"));
    expect(s.access.entrances.length).toBeLessThanOrEqual(1);
    expect("mainEntrance" in s.access).toBe(false);
    expect(s.access.rooms.some((r) => "depthFromMainEntrance" in r)).toBe(false);
  });

  // Over every example storey: the fact is present exactly when there is a choice, the walk's
  // graph reaches exactly the rooms the full graph reaches (so W_ROOM_UNREACHABLE cannot move),
  // and `depthFromEntrance` is untouched.
  const examples = readdirSync(join(root, "examples")).filter((f) => f.endsWith(".arch"));
  it.each(examples)("%s: the walk's ways in reach every room the doors reach", (name) => {
    const src = read(`examples/${name}`);
    const { ir, levels } = resolvePlan(src, {
      world: {
        read: (p: string) => {
          try {
            return readFileSync(join(root, "examples", p), "utf8");
          } catch {
            return null;
          }
        },
        now: () => new Date(0),
      },
    });
    const storeys = levels.length > 0 ? levels.map((l) => l.ir) : ir ? [ir] : [];
    for (const st of storeys) {
      const rooms = st.elements.filter((e): e is RRoom => e.kind === "room");
      const doors = st.elements.filter((e): e is RDoor => e.kind === "door");
      const openings = st.elements.filter((e): e is ROpening => e.kind === "opening");
      const rects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
      const full = buildDoorAccessGraph(rooms, doors, 200, undefined, openings);
      const keep = walkWays(full, entranceInputs(st, rects));
      const walk = walkAccessGraph(full, keep);
      const ids = rooms.map((r) => r.id);
      expect([...reachFrom(accessDigraph(ids, walk.edges))].sort()).toEqual(
        [...reachFrom(accessDigraph(ids, full.edges))].sort(),
      );
      if (keep === null) expect(walk).toBe(full);
      else expect(keep.size).toBeGreaterThan(0);
    }
    const summaries = levels.length > 0 ? describePlan(src).levels! : [describePlan(src)];
    for (const sum of summaries) {
      expect("mainEntrance" in sum.access).toBe(sum.access.entrances.length > 1);
      const named = sum.access.mainEntrance?.door != null;
      for (const r of sum.access.rooms) expect("depthFromMainEntrance" in r).toBe(named);
    }
  });
});
