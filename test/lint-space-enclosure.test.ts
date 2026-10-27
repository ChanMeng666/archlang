import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDoorAccessGraph, DEFAULT_TOL, resolvePlan } from "../src/analyze.js";
import { computeCirculation } from "../src/analyze/circulation.js";
import {
  FACE_BUDGET_CAPS,
  faceCover,
  MAX_ENCLOSURE_FACES,
  MAX_LOOPS_PER_CELL,
  MAX_FACE_WALL_SEGMENTS,
  MAX_WALL_CONTACTS,
  roomOutside,
  wallContacts,
  wallFaces,
} from "../src/analyze/wall-faces.js";
import { lint } from "../src/index.js";
import { lintCoverage } from "../src/lint.js";
import type { RDoor, RFurniture, ROpening, RRoom, RVoid } from "../src/ir.js";
import { LINT_RULES } from "../src/lint/rules/index.js";
import { verticalsOf } from "../src/vertical.js";
import type { World } from "../src/world.js";

/**
 * The space-enclosure rules (plan-soundness PS2.4): `W_BOUNDARY_NO_WALL`, `W_FLOOR_UNASSIGNED`
 * and `W_ROOM_OUTSIDE_SHELL`. Each fires on its defect and not on its fix, at the threshold its
 * ruleset setting names, from the shapes (curved walls and circle rooms included), and with
 * every exemption pinned on both sides. The corpus cases are in
 * `test/defect-corpus/space-not-enclosed/`; this file holds the branches they do not reach.
 */

const codesOf = (src: string, opts = {}): string[] => lint(src, opts).map((d) => d.code ?? "");
const only = (src: string, code: string, opts = {}) => lint(src, opts).filter((d) => d.code === code);

const plan = (body: string): string => `plan "P" {\n  units mm\n  grid 50\n${body}\n}\n`;

/** Living room over two bedrooms; `{X}` is what stands on the shared edge y 4000. */
const LIVING_OVER = (onEdge: string, uses = ["living", "bedroom"]): string =>
  plan(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }
  room id=r_a at (0,0) size 6000x4000 label "Upper" uses ${uses[0]}
  room id=r_b at (0,4000) size 6000x3000 label "Lower" uses ${uses[1]}
  door id=d_entry on shell at 3000 width 900
${onEdge}`);

describe("W_BOUNDARY_NO_WALL", () => {
  it("fires on an edge with nothing on it, naming both rooms by label and the line; ids only in the hints", () => {
    const [d, ...rest] = only(LIVING_OVER(""), "W_BOUNDARY_NO_WALL");
    expect(rest).toEqual([]);
    expect(d!.message).toMatch(
      /^"Upper" and "Lower" have no wall between them: they meet along 6000 mm on the line y 4000, x 0–6000 with no wall, door or opening anywhere on it, wider than a 900 mm doorway\./,
    );
    expect(d!.message).not.toMatch(/r_a|r_b/);
    expect(d!.hints!.join(" ")).toContain("`wall partition thickness 100 { (0,4000) (6000,4000) }`");
    expect(d!.hints!.at(-1)).toBe('The rooms are "r_a" and "r_b".');
    expect(d!.fixes).toBeUndefined();
  });

  it("is silent once a partition runs the edge (a door in it is fine)", () => {
    const wall = "  wall id=p partition thickness 100 { (0,4000) (6000,4000) }\n  door on p at 1500 width 800\n";
    expect(codesOf(LIVING_OVER(wall))).not.toContain("W_BOUNDARY_NO_WALL");
  });

  it("measures the longest open stretch against maxBoundaryGapMm: 900 is silent, 950 fires", () => {
    // A partition from x 0 leaves the stretch x L–6000 open.
    const upTo = (x: number): string => `  wall id=p partition thickness 100 { (0,4000) (${x},4000) }\n`;
    expect(codesOf(LIVING_OVER(upTo(5100)))).not.toContain("W_BOUNDARY_NO_WALL");
    const [d] = only(LIVING_OVER(upTo(5050)), "W_BOUNDARY_NO_WALL");
    expect(d!.message).toMatch(
      /^The boundary between "Upper" and "Lower" is open for 950 mm \(y 4000, x 5050–6000\), wider than a 900 mm doorway: they meet along 6000 mm on the line y 4000, x 0–6000, and that stretch has no wall, door or opening\. Through that stretch they are one space that anyone walks through, but no door or opening joins them/,
    );
    expect(codesOf(LIVING_OVER(upTo(5050)), { ruleset: { maxBoundaryGapMm: 950 } })).not.toContain(
      "W_BOUNDARY_NO_WALL",
    );
  });

  it("counts a door or cased opening's span on the run, and the walls either side", () => {
    const parts =
      "  wall id=p1 partition thickness 100 { (0,4000) (2500,4000) }\n  wall id=p2 partition thickness 100 { (3500,4000) (6000,4000) }\n";
    // A 1000 mm gap between the two partitions: open, and over a doorway.
    expect(codesOf(LIVING_OVER(parts))).toContain("W_BOUNDARY_NO_WALL");
    // A free-standing door filling it closes the gap.
    expect(codesOf(LIVING_OVER(`${parts}  door at (3000,4000) width 1000\n`))).not.toContain("W_BOUNDARY_NO_WALL");
  });

  it("exempts an open-plan pair (each kitchen, dining or living), by uses or by label, and no other pair", () => {
    for (const pair of [
      ["living", "kitchen"],
      ["dining", "kitchen"],
      ["living", "dining"],
      ["kitchen", "living dining"],
    ])
      expect(codesOf(LIVING_OVER("", pair)), pair.join("|")).not.toContain("W_BOUNDARY_NO_WALL");
    for (const pair of [
      ["living", "hall"],
      ["kitchen", "bath"],
      ["dining", "office"],
    ])
      expect(codesOf(LIVING_OVER("", pair)), pair.join("|")).toContain("W_BOUNDARY_NO_WALL");
    // Label-only rooms classify through the vocabulary, never through the id.
    const labelled = LIVING_OVER("")
      .replace('label "Upper" uses living', 'label "Kitchen"')
      .replace('label "Lower" uses bedroom', 'label "Living Room"');
    expect(codesOf(labelled)).not.toContain("W_BOUNDARY_NO_WALL");
  });

  it("reads a fixed counter standing across the gap as the boundary (the cafe servery), not one set back", () => {
    const servery = (y: number): string => `  furniture bar_counter at (0,${y}) size 6000x600\n`;
    const pair = ["dining", "storage"];
    expect(codesOf(LIVING_OVER("", pair))).toContain("W_BOUNDARY_NO_WALL");
    expect(codesOf(LIVING_OVER(servery(3700), pair))).not.toContain("W_BOUNDARY_NO_WALL");
    expect(codesOf(LIVING_OVER(servery(3000), pair))).toContain("W_BOUNDARY_NO_WALL");
    // A table across the same gap is furniture that moves: it closes nothing.
    expect(codesOf(LIVING_OVER("  furniture table at (0,3700) size 6000x600\n", pair))).toContain("W_BOUNDARY_NO_WALL");
  });

  it("reads rooms drawn to a wall's faces (a gap of one thickness) as sharing the edge, and the wall between them", () => {
    const faces = (wall: string): string =>
      plan(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }
  room id=r_a at (0,0) size 6000x3950 label "Upper" uses office
  room id=r_b at (0,4050) size 6000x2950 label "Lower" uses bedroom
  door on shell at 3000 width 900
${wall}`);
    const [d] = only(faces(""), "W_BOUNDARY_NO_WALL");
    expect(d!.hints!.join(" ")).toContain("`wall partition thickness 100 { (0,4000) (6000,4000) }`");
    expect(codesOf(faces("  wall partition thickness 100 { (0,4000) (6000,4000) }\n"))).not.toContain(
      "W_BOUNDARY_NO_WALL",
    );
  });

  it("never reads a curved wall's chord as a wall on a straight run", () => {
    // Two rooms meet on y 4000; the only wall near that line is an arc whose chord runs along it.
    const src = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,8000) (0,8000) close }
  wall partition thickness 100 { (0,4000) arc (6000,4000) radius 5000 }
  room at (0,0) size 6000x4000 label "Upper" uses office
  room at (0,4000) size 6000x4000 label "Lower" uses bedroom`);
    expect(codesOf(src)).toContain("W_BOUNDARY_NO_WALL");
  });

  it("asks nothing of overlapping or nested rooms (they share no boundary) or of a circle room", () => {
    const nested = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room at (0,0) size 6000x4000 label "Hall" uses hall
  room at (0,0) size 3000x4000 label "Nook" uses office`);
    expect(codesOf(nested)).not.toContain("W_BOUNDARY_NO_WALL");
    const circle = plan(`  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  room at (0,0) size 4000x4000 label "Hall" uses hall
  room circle at (6000,2000) radius 2000 label "Drum" uses office`);
    expect(codesOf(circle)).not.toContain("W_BOUNDARY_NO_WALL");
  });

  it("reads a polygon room's own edges", () => {
    const src = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Ell" uses office
  room at (3000,3000) size 3000x3000 label "Corner" uses bedroom`);
    const ds = only(src, "W_BOUNDARY_NO_WALL");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain("they meet along 3000 mm");
  });
});

describe("W_FLOOR_UNASSIGNED", () => {
  const BOX = (rooms: string, extra = ""): string =>
    plan(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  door id=d_in on shell at 3000 width 900
${rooms}
${extra}`);

  it("reports the floor no room covers, the face's area and the share, naming the bordering room", () => {
    const [d, ...rest] = only(
      BOX('  room id=r_a at (0,0) size 6000x3000 label "Office" uses office'),
      "W_FLOOR_UNASSIGNED",
    );
    expect(rest).toEqual([]);
    // The face is the shell's inside, 5800 x 3800 (y 100-3900); the room covers it to y 3000, so
    // 5800 x 900 is in no room.
    expect(d!.message).toBe(
      '5.22 m² of walled floor next to "Office" is in no room: the walls there enclose 22.04 m² and rooms cover 76.3 % of it, under 95 %. Floor inside the walls that no room claims has no use, no area and no route the plan can check.',
    );
    expect(d!.hints!.at(-1)).toBe('The rooms are "r_a"; the walls round it are "shell".');
  });

  it("is silent at full cover, and holds both thresholds (minFaceCoverRatio, minUnassignedM2)", () => {
    expect(codesOf(BOX('  room at (0,0) size 6000x4000 label "Office" uses office'))).not.toContain(
      "W_FLOOR_UNASSIGNED",
    );
    // 5800 x 200 = 1.16 m² uncovered of 22.04 (94.7 % covered): reported; under 0.5 m² it is not.
    const short = BOX('  room at (0,0) size 6000x3700 label "Office" uses office');
    expect(codesOf(short)).toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(short, { ruleset: { minFaceCoverRatio: 0.9 } })).not.toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(short, { ruleset: { minUnassignedM2: 1.2 } })).not.toContain("W_FLOOR_UNASSIGNED");
  });

  it("counts an outdoor surface, a void or a stair as assigning the floor it covers", () => {
    const half = '  room at (0,0) size 6000x2000 label "Office" uses office';
    expect(codesOf(BOX(half))).toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(BOX(half, "  outdoor paving at (0,2000) size 6000x2000"))).not.toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(BOX(half, "  void at (0,2000) size 6000x2000"))).not.toContain("W_FLOOR_UNASSIGNED");
  });

  it("names the rooms behind the walls of an empty face with a way in (a courtyard)", () => {
    const src = plan(`  wall id=shell exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
  wall id=w_court partition thickness 200 { (3000,0) (3000,4000) }
  wall partition thickness 200 { (6000,0) (6000,4000) }
  room at (0,0) size 3000x4000 label "West" uses office
  room at (6000,0) size 3000x4000 label "East" uses office
  door on w_court at 2000 width 900
  door on shell at 1500 width 900`);
    const [d] = only(src, "W_FLOOR_UNASSIGNED");
    expect(d!.message).toMatch(/^10\.64 m² of walled floor, behind the walls of "West" and "East", is in no room/);
    expect(codesOf(src.replace("}\n", "  outdoor paving at (3000,0) size 3000x4000\n}\n"))).not.toContain(
      "W_FLOOR_UNASSIGNED",
    );
  });

  it("does not report a sealed pocket: no door or opening into it and no room on its floor", () => {
    const src = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (5000,0) (5000,1000) (6000,1000) }
  room at (0,0) size 6000x4000 label "Office" uses office
  door on shell at 3000 width 900`);
    // The office overlaps the walled duct, so the duct is covered; drawn short of it, it is not.
    expect(codesOf(src)).not.toContain("W_FLOOR_UNASSIGNED");
    const sealed = src.replace(
      "room at (0,0) size 6000x4000",
      "room polygon (0,0) (5000,0) (5000,1000) (6000,1000) (6000,4000) (0,4000)",
    );
    expect(codesOf(sealed)).not.toContain("W_FLOOR_UNASSIGNED");
  });

  it("measures a curved wall and a circle room in closed form (the two corpus cases)", () => {
    const corpus = (n: string): string =>
      readFileSync(join("test/defect-corpus/space-not-enclosed", `${n}.arch`), "utf8");
    expect(only(corpus("bow-strip-unassigned"), "W_FLOOR_UNASSIGNED").map((d) => d.message.split(":")[0])).toEqual([
      '9.25 m² of walled floor next to "Shop" and "Cafe" is in no room',
    ]);
    expect(only(corpus("round-snug-unassigned"), "W_FLOOR_UNASSIGNED").map((d) => d.message.split(":")[0])).toEqual([
      '3.53 m² of walled floor next to "Snug" is in no room',
    ]);
  });

  it("is silent past the wall-segment bound (a count, never a time)", () => {
    const n = MAX_FACE_WALL_SEGMENTS + 1;
    const src = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room at (0,0) size 6000x2000 label "Office" uses office
  door at (3000,0) width 900 wall exterior
  for i in 0..${n} { wall partition thickness 10 { (100 + i * 2, 3000) (101 + i * 2, 3000) } }`);
    expect(codesOf(src)).not.toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(src)).not.toContain("W_ROOM_OUTSIDE_SHELL");
  });
});

describe("W_ROOM_OUTSIDE_SHELL", () => {
  it("reports the floor past the walls and how far past their outer face; silent inside", () => {
    const src = (w: number): string =>
      plan(`  wall exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  room id=r_b at (4000,0) size ${w}x5000 label "Bedroom" uses bedroom
  door at (6000,5000) width 900 wall exterior`);
    expect(only(src(4600), "W_ROOM_OUTSIDE_SHELL").map((d) => d.message)).toEqual([
      'Room "Bedroom" has 2.5 m² of its floor outside the building\'s walls, up to 500 mm past their outer face. A room drawn past the outside wall has floor no wall encloses, usually a room resized or moved while its walls stayed put.',
    ]);
    // To the outer face (a half thickness past the centreline) is inside the walls.
    expect(codesOf(src(4100))).not.toContain("W_ROOM_OUTSIDE_SHELL");
    expect(codesOf(src(4000))).not.toContain("W_ROOM_OUTSIDE_SHELL");
    // 50 mm past the outer face over 5 m is 0.25 m²: at the threshold it is reported, above it not.
    expect(codesOf(src(4150), { ruleset: { minOutsideShellM2: 0.25 } })).toContain("W_ROOM_OUTSIDE_SHELL");
    expect(codesOf(src(4150), { ruleset: { minOutsideShellM2: 0.26 } })).not.toContain("W_ROOM_OUTSIDE_SHELL");
  });

  it("is silent when the walls close no region (no shell: refuse, never guess)", () => {
    const open = plan(`  wall exterior thickness 200 { (0,0) (8000,0) (8000,5000) }
  room at (0,0) size 9000x5000 label "Bedroom" uses bedroom`);
    expect(codesOf(open)).not.toContain("W_ROOM_OUTSIDE_SHELL");
  });

  it("measures a circle room by its circle", () => {
    const src = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room circle at (5000,2000) radius 2000 label "Drum" uses office
  door at (3000,0) width 900 wall exterior`);
    const [d] = only(src, "W_ROOM_OUTSIDE_SHELL");
    // The circle's part past x 6100: a circular segment of sagitta 900 on R 2000.
    expect(d!.message).toMatch(/^Room "Drum" has 2\.\d\d m² of its floor outside the building's walls\. /);
  });
});

describe("the three rules' place in LINT_RULES", () => {
  it("are appended in card order, followed only by the furniture-relation rules (ADR 0029), PS2.10's dimension text, the annotation-collision rules (PS2.12), the clearance rules (PS2.11a–d) and the stair rules (PS2.11e, PS2.34, PS2.15) and the kitchen and door rules (PS2.11e, PS2.46) and the accessible-WC rule (PS2.74)", () => {
    expect(LINT_RULES.slice(-22).map((r) => r.name)).toEqual([
      "boundary-no-wall",
      "floor-unassigned",
      "room-outside-shell",
      "furn-clear-declared",
      "seat-facing-away",
      "dim-text-mismatch",
      "annotation-overlap",
      "title-overflow",
      "wc-side-clearance",
      "furniture-over-window",
      "footprint-transposed",
      "leaf-across-doorway",
      "swing-over-stair",
      "stair-no-landing",
      "stair-side-entry",
      "stair-head-void",
      "stair-too-steep",
      "shaft-footprint-mismatch",
      "hob-under-window",
      "hob-fridge-gap",
      "leaf-too-wide",
      "accessible-wc-side-wall",
    ]);
  });
});

// ─── circulation-reachable implies access-reachable ────────────────────────────────────

const worldFor = (dir: string): World => ({
  read: (p) => {
    try {
      return readFileSync(resolvePath(dir, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
});

function archFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...archFiles(p));
    else if (name.endsWith(".arch")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

/**
 * Rooms the WALKING grid reaches from an entrance on each storey that the door access graph
 * does not. The circulation model only measures rooms the access graph reaches, so the walk is
 * asked with every room marked reachable: what it then measures is what a body can walk to.
 */
function walkedNotReached(src: string, world: World): string[] {
  const { ir, levels } = resolvePlan(src, { world });
  if (!ir) return [];
  const out: string[] = [];
  for (const s of levels.length ? levels.map((l) => l.ir) : [ir]) {
    const rooms = s.elements.filter((e): e is RRoom => e.kind === "room");
    const doors = s.elements.filter((e): e is RDoor => e.kind === "door");
    const openings = s.elements.filter((e): e is ROpening => e.kind === "opening");
    const furniture = s.elements.filter((e): e is RFurniture => e.kind === "furniture");
    const voids = s.elements.filter((e): e is RVoid => e.kind === "void");
    const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
    if (!access.hasEntrance) continue;
    const everyRoom = { ...access, rooms: access.rooms.map((r) => ({ ...r, reachable: true })) };
    const walk = computeCirculation(
      rooms,
      s.walls,
      doors,
      openings,
      furniture,
      everyRoom,
      DEFAULT_TOL,
      undefined,
      verticalsOf(s),
      voids,
    );
    const reached = new Set(access.rooms.filter((r) => r.reachable).map((r) => r.id));
    for (const r of walk?.rooms ?? []) if (!reached.has(r.roomId)) out.push(r.roomId);
  }
  return out;
}

/**
 * The plans where the claim does not hold yet, measured, each with why. A body walks into
 * these rooms over a boundary with no wall and no connector, so the access graph has no edge
 * for the step. Every one is a boundary `W_BOUNDARY_NO_WALL` reports. (`examples/relational.arch`
 * was here, its open-plan kitchen the one exempt entry, until PS3.6 derived its walls and wrote
 * the join as `open between`, which the access graph sees: it now holds.) The set is pinned
 * exactly: a new entry, or one that starts to hold, turns this red.
 */
const NOT_YET: Record<string, string[]> = {
  // The corpus case itself: Living Room | Bedrooms 3 and 4, reported.
  "test/defect-corpus/space-not-enclosed/fa-no-wall-living-bedrooms.arch": ["r_bed3", "r_bed4"],
  // A zones fixture drawn with no partitions: Gallery A | Gallery B and Office | Store, reported.
  "test/fixtures/zones-wings.arch": ["gal_b", "store"],
};

describe("circulation-reachable implies access-reachable, on the corpus", () => {
  const files = [...archFiles("examples"), ...archFiles("test/fixtures"), ...archFiles("test/defect-corpus")].filter(
    (f) => !f.startsWith("examples/lib/"),
  );

  it("holds on every plan but the pinned counterexamples, which are exactly as measured", () => {
    const found: Record<string, string[]> = {};
    for (const f of files) {
      const bad = walkedNotReached(readFileSync(f, "utf8"), worldFor(dirname(f)));
      if (bad.length) found[f] = bad;
    }
    expect(found).toEqual(NOT_YET);
  });

  it("every counterexample is a boundary W_BOUNDARY_NO_WALL reports", () => {
    for (const f of Object.keys(NOT_YET)) {
      const ds = only(readFileSync(f, "utf8"), "W_BOUNDARY_NO_WALL", { world: worldFor(dirname(f)) });
      expect(ds.length, f).toBeGreaterThan(0);
    }
  });
});

// ─── review round 1 (red-team repros, each reduced from the reviewer's file) ───────────

/** A plan from the reviewer's repro shape: no units line, mm by default. */
const P = (body: string): string => `plan "t" {\n${body}\n}\n`;
const SHELL_67 = "wall exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }";

describe("review round 1 — W_BOUNDARY_NO_WALL", () => {
  const split = (bedroom: string): string =>
    P(`${SHELL_67}
wall partition thickness 100 { (0,4000) (2200,4000) }
wall partition thickness 100 { (3800,4000) (6000,4000) }
room at (0,0) size 6000x4000 label "Study" uses office
${bedroom}`);

  it("merges collinear pieces of a run, so a ring vertex cannot hide a gap across it (b1)", () => {
    const control = split('room polygon (0,4000) (6000,4000) (6000,7000) (0,7000) label "Bedroom" uses bedroom');
    const vertex = split(
      'room polygon (0,4000) (3000,4000) (6000,4000) (6000,7000) (0,7000) label "Bedroom" uses bedroom',
    );
    const msg = (s: string) => only(s, "W_BOUNDARY_NO_WALL").map((d) => d.message.split(":")[0]);
    expect(msg(control)).toEqual([
      'The boundary between "Study" and "Bedroom" is open for 1600 mm (y 4000, x 2200–3800), wider than a 900 mm doorway',
    ]);
    expect(msg(vertex)).toEqual(msg(control));
  });

  it("counts a counter only along its own extent and only when it straddles the line (b2, b3)", () => {
    const tiny = P(`${SHELL_67}
wall partition thickness 100 { (0,4000) (2100,4000) }
wall partition thickness 100 { (3900,4000) (6000,4000) }
room at (0,0) size 6000x4000 label "Study" uses office
room at (0,4000) size 6000x3000 label "Bedroom" uses bedroom
furniture counter at (2950,3950) size 100x100`);
    // 100 mm of counter in an 1800 mm gap leaves 1700 open: still over a doorway.
    expect(codesOf(tiny)).toContain("W_BOUNDARY_NO_WALL");
    const short = P(`${SHELL_67}
room at (0,0) size 6000x4000 label "Study" uses office
room at (0,4000) size 6000x3000 label "Bedroom" uses bedroom
furniture counter at (500,3360) size 5000x600`);
    // y 3360–3960: 40 mm short of the line, inside one room. It closes nothing.
    expect(codesOf(short)).toContain("W_BOUNDARY_NO_WALL");
    // Across the line it closes what it covers; the 300 mm left at each end (600 in all) is under a doorway.
    expect(codesOf(short.replace("at (500,3360) size 5000x600", "at (300,3700) size 5400x600"))).not.toContain(
      "W_BOUNDARY_NO_WALL",
    );
  });

  it("counts a wall by its BODY on the boundary: 190 mm inside one room is not it (b4), a thick wall with a face on it is (b5)", () => {
    const wall = (w: string): string =>
      P(`${SHELL_67}
${w}
room at (0,0) size 6000x4000 label "Study" uses office
room at (0,4000) size 6000x3000 label "Bedroom" uses bedroom`);
    expect(codesOf(wall("wall partition thickness 100 { (0,4190) (6000,4190) }"))).toContain("W_BOUNDARY_NO_WALL");
    expect(codesOf(wall("wall partition thickness 500 { (0,4250) (6000,4250) }"))).not.toContain("W_BOUNDARY_NO_WALL");
    // The body's slack is 50 mm: a 100 mm wall whose face stands 50 mm off the line still counts, 51 does not.
    expect(codesOf(wall("wall partition thickness 100 { (0,4100) (6000,4100) }"))).not.toContain("W_BOUNDARY_NO_WALL");
    expect(codesOf(wall("wall partition thickness 100 { (0,4101) (6000,4101) }"))).toContain("W_BOUNDARY_NO_WALL");
  });

  it("words a partial gap as an open stretch, and says a door joins them only when one does (h1)", () => {
    const src = P(`${SHELL_67}
wall id=p partition thickness 100 { (0,4000) (3500,4000) }
door on p at 1500 width 800
room at (0,0) size 6000x4000 label "Study" uses office
room at (0,4000) size 6000x3000 label "Bedroom" uses bedroom`);
    const [d] = only(src, "W_BOUNDARY_NO_WALL");
    expect(d!.message).toBe(
      'The boundary between "Study" and "Bedroom" is open for 2500 mm (y 4000, x 3500–6000), wider than a 900 mm doorway: they meet along 6000 mm on the line y 4000, x 0–6000, and that stretch has no wall, door or opening. A door or opening on the run joins them, but through that stretch they are one space, so privacy and enclosure are read as if it were walled.',
    );
    expect(d!.message).not.toContain("no door or opening joins them");
  });
});

describe("review round 1 — W_FLOOR_UNASSIGNED", () => {
  const corner = (extra: string): string =>
    P(`wall exterior thickness 200 { (0,0) (9000,0) (9000,6000) (0,6000) close }
wall partition thickness 100 { (6000,0) (6000,3000) (9000,3000) }
${extra}
room at (0,0) size 6000x6000 label "Living" uses living
room polygon (6000,3000) (9000,3000) (9000,6000) (6000,6000) label "Kitchen" uses kitchen`);

  it("does not call a forgotten room with a window a sealed pocket (f2, and with a door)", () => {
    expect(codesOf(corner(""))).not.toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(corner("window at (7500,0) width 1200"))).toContain("W_FLOOR_UNASSIGNED");
    expect(codesOf(corner("window at (7500,0) width 1200\ndoor at (6000,1500) width 800"))).toContain(
      "W_FLOOR_UNASSIGNED",
    );
  });

  it("keeps library's drum spandrels silent: sealed, no door, no window", () => {
    const src = readFileSync("examples/library.arch", "utf8");
    expect(codesOf(src, { world: worldFor("examples") })).not.toContain("W_FLOOR_UNASSIGNED");
  });

  it("ends its hints with the accept-if clause for a sealed void", () => {
    const [d] = only(corner("window at (7500,0) width 1200"), "W_FLOOR_UNASSIGNED");
    expect(d!.hints).toContain(
      "Accept it if the floor is a sealed void: then draw it as a `void`, so the plan says so.",
    );
  });
});

describe("review round 1 — W_ROOM_OUTSIDE_SHELL needs a shell", () => {
  it("is silent beside a column ring, a closed WC box, or behind a shell left open at its door (g3, g2, f1)", () => {
    const g3 = P(`wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) }
wall partition thickness 100 { (4000,0) (4000,4000) }
wall partition thickness 100 { (6000,3000) (6400,3000) (6400,3400) (6000,3400) close }
room at (0,0) size 4000x6000 label "Living" uses living
room at (4000,0) size 5000x6000 label "Bedroom" uses bedroom`);
    const g2 = P(`wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) }
wall partition thickness 100 { (4000,0) (4000,4000) }
wall partition thickness 100 { (500,4500) (2500,4500) (2500,5800) (500,5800) close }
door at (1500,4500) width 700
room at (0,0) size 4000x6000 label "Living" uses living
room at (4000,0) size 5000x6000 label "Bedroom" uses bedroom
room at (500,4500) size 2000x1300 label "WC" uses wc`);
    const f1 = P(`wall exterior thickness 200 { (2000,0) (8000,0) (8000,6000) (0,6000) (0,0) (800,0) }
wall partition thickness 100 { (4000,0) (4000,6000) }
door at (4000,3000) width 800
room at (0,0) size 4000x6000 label "Living" uses living
room at (4000,0) size 4000x6000 label "Bedroom" uses bedroom`);
    for (const s of [g3, g2, f1]) expect(codesOf(s)).not.toContain("W_ROOM_OUTSIDE_SHELL");
  });

  it("still reports a room mostly inside the shell (room-past-shell, widen-after, a loft past its storey's walls)", () => {
    const corpus = (n: string): string =>
      readFileSync(join("test/defect-corpus/space-not-enclosed", `${n}.arch`), "utf8");
    expect(codesOf(corpus("room-past-shell"))).toContain("W_ROOM_OUTSIDE_SHELL");
    expect(codesOf(corpus("widen-after-outside-shell"))).toContain("W_ROOM_OUTSIDE_SHELL");
    const loft = P(`level 1 {
  wall exterior thickness 200 { (0,0) (10000,0) (10000,6000) (0,6000) close }
  door at (2000,0) width 900
  room at (0,0) size 10000x6000 label "Hall" uses hall
  stair id=s1 at (8000,1000) size 1000x3000 dir up
}
level 2 {
  wall exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room at (0,0) size 9000x6000 label "Loft" uses bedroom
  stair id=s1 at (8000,1000) size 1000x3000 dir down
}`);
    expect(only(loft, "W_ROOM_OUTSIDE_SHELL").map((d) => [d.level, d.message.split(". A room")[0]])).toEqual([
      [2, 'Room "Loft" has 17.4 m² of its floor outside the building\'s walls, up to 2900 mm past their outer face'],
    ]);
  });
});

describe("review round 1 — the face rules are bounded by counts, charged before the work", () => {
  /** The reviewer's lattice: an n × n grid of 1 m cells and one hall over all of it. */
  const lattice = (n: number, hallW = n * 1000): string => {
    const L = n * 1000;
    const walls: string[] = [`wall exterior thickness 200 { (0,0) (${L},0) (${L},${L}) (0,${L}) close }`];
    for (let i = 1; i < n; i++)
      walls.push(
        `wall partition thickness 100 { (${i * 1000},0) (${i * 1000},${L}) }`,
        `wall partition thickness 100 { (0,${i * 1000}) (${L},${i * 1000}) }`,
      );
    return P(`${walls.join("\n")}\nroom at (0,0) size ${hallW}x${L} label "Hall" uses hall`);
  };
  const facesOfLattice = (n: number) => {
    const { ir } = resolvePlan(lattice(n));
    return { ir: ir!, wf: wallFaces(ir!.walls) };
  };

  it("measures a lattice just under MAX_ENCLOSURE_FACES with a flat count of loop tests per probe", () => {
    const n = Math.floor(Math.sqrt(MAX_ENCLOSURE_FACES));
    const per: number[] = [];
    for (const m of [5, 10, n]) {
      const { ir, wf } = facesOfLattice(m);
      if (!wf || "refused" in wf) throw new Error(`lattice ${m} refused`);
      expect(wf.faces).toHaveLength(m * m);
      const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
      for (let i = 0; i < wf.faces.length; i++) faceCover(wf, i, rooms);
      for (const r of rooms) roomOutside(wf, r);
      // A scan of every hole per probe would test about m² / 2 loops per probe; the grid tests ~1.33.
      expect(wf.work.loopTests).toBeLessThanOrEqual(2 * wf.work.probes);
      per.push(wf.work.probes / (m * m));
    }
    // And the probes per face do not grow with the face count.
    expect(Math.max(...per)).toBeLessThanOrEqual(1.05 * Math.min(...per));
  });

  it("refuses a lattice just over MAX_ENCLOSURE_FACES, and one over MAX_WALL_CONTACTS before joining it", () => {
    const n = Math.floor(Math.sqrt(MAX_ENCLOSURE_FACES)) + 1;
    expect(facesOfLattice(n).wf).toEqual({ refused: "too-many-faces", count: n * n });
    const big = facesOfLattice(41).wf;
    expect(big && "refused" in big && big.refused).toBe("too-many-wall-contacts");
    expect(big && "refused" in big && big.count).toBe(MAX_WALL_CONTACTS + 1);
  });

  it("so both face rules speak on a lattice just under every cap, and are silent past one", () => {
    // A hall drawn 2 m past the east wall: outside the shell, and most of it inside.
    const past = (n: number): string => lattice(n, n * 1000 + 2000);
    // 18²: 324 faces, and its point-test charge (191 164 128) just under the cap.
    const { ir } = resolvePlan(past(18));
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    const wf = wallFaces(ir!.walls, rooms, rooms);
    if (!wf || "refused" in wf) throw new Error(`refused: ${JSON.stringify(wf)}`);
    expect(wf.budget).toEqual({
      loopsPerCell: 5,
      candidateTests: 191_164_128,
      faceCurves: 1296,
      faceRooms: 324,
      roomCurves: 1304,
    });
    expect(codesOf(past(18))).toContain("W_ROOM_OUTSIDE_SHELL");
    // 20²: under the face cap, over the point-test cap. 21²: over the face cap.
    expect(codesOf(past(20))).not.toContain("W_ROOM_OUTSIDE_SHELL");
    expect(codesOf(past(21))).not.toContain("W_ROOM_OUTSIDE_SHELL");
  });
});

// ─── review round 2 ─────────────────────────────────────────────────────────────────────

describe("review round 2 — the face budget is charged before the work, from counts", () => {
  /** The reviewer's nested shape: `n` concentric square rings 150 mm apart, one hall over them. */
  const rings = (n: number): string => {
    const walls: string[] = [];
    for (let k = 0; k < n; k++) {
      const lo = 69000 - 150 * k;
      const hi = 71000 + 150 * k;
      walls.push(`wall partition thickness 50 { (${lo},${lo}) (${hi},${lo}) (${hi},${hi}) (${lo},${hi}) close }`);
    }
    const lo = 69000 - 150 * (n - 1);
    const side = 2000 + 300 * (n - 1);
    return P(
      `${walls.join("\n")}\nroom at (${lo},${lo}) size ${side}x${side} label "Hall" uses hall\ndoor at (70000,${lo}) width 900`,
    );
  };
  /** The reviewer's 20 × 20 lattice under `n` identical full-size rooms. */
  const lat20 = (n: number): string => {
    const walls = ["wall exterior thickness 200 { (0,0) (20000,0) (20000,20000) (0,20000) close }"];
    for (let i = 1; i < 20; i++)
      walls.push(
        `wall partition thickness 100 { (${i * 1000},0) (${i * 1000},20000) }`,
        `wall partition thickness 100 { (0,${i * 1000}) (20000,${i * 1000}) }`,
      );
    const rooms = Array.from({ length: n }, (_, i) => `room at (0,0) size 20000x19500 label "Hall ${i}" uses hall`);
    return P(`${walls.join("\n")}\n${rooms.join("\n")}\ndoor at (500,0) width 800`);
  };
  /** `wallFaces` charged with the rule's own cover and rooms. */
  const charge = (src: string) => {
    const { ir } = resolvePlan(src);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    return wallFaces(ir!.walls, rooms, rooms);
  };

  it("refuses nested rings on the loops one point test can meet (rings-100, -200, -400), and rings-401 on contacts", () => {
    for (const n of [100, 200, 400]) {
      const wf = charge(rings(n));
      expect(wf && "refused" in wf && wf.refused, `rings-${n}`).toBe("too-many-loops-per-cell");
      // Counted up to the cap and no further: the count stops one past it.
      expect(wf && "refused" in wf && wf.count, `rings-${n}`).toBe(MAX_LOOPS_PER_CELL + 1);
    }
    expect(charge(rings(401))).toEqual({ refused: "too-many-wall-contacts", count: MAX_WALL_CONTACTS + 1 });
  });

  it("measures rings just under the cap, each face read off its hole and the hole's child only", () => {
    // 31 rings: 62 loops at the centre cell, under MAX_LOOPS_PER_CELL.
    const wf = charge(rings(31));
    if (!wf || "refused" in wf) throw new Error(`refused: ${JSON.stringify(wf)}`);
    expect(wf.faces).toHaveLength(31);
    expect(wf.budget.loopsPerCell).toBeLessThanOrEqual(MAX_LOOPS_PER_CELL);
    // Every ring's face is bounded by its hole (4 edges) and the next ring's outer loop (4),
    // the innermost by its hole alone: never every loop inside its box.
    expect(wf.budget.faceCurves).toBe(30 * 8 + 4);
    expect(codesOf(rings(31))).not.toContain("W_ROOM_OUTSIDE_SHELL");
  });

  it("refuses a lattice under hundreds of overlapping rooms on face × room pairs (lat20-rooms-100, -300)", () => {
    expect(charge(lat20(100))).toEqual({ refused: "too-many-face-rooms", count: 40_000 });
    expect(charge(lat20(300))).toEqual({ refused: "too-many-face-rooms", count: 120_000 });
    expect(FACE_BUDGET_CAPS.faceRooms).toBeLessThan(40_000);
  });

  it("charges the same lattice under one room by its point tests, ring vertices included (lat20-rooms-1)", () => {
    // Each probe of the hall's own measurements is two point tests (5 loops per cell each)
    // and the hall's 4-vertex inside test: 290 480 320 in all, over the cap.
    expect(charge(lat20(1))).toEqual({ refused: "too-many-candidate-tests", count: 290_480_320 });
    expect(FACE_BUDGET_CAPS.candidateTests).toBeLessThan(290_480_320);
  });

  it("charges an arc by its own extent, not its whole circle (library 131 → 51; a 60-arc drum is not refused)", () => {
    const { ir } = resolvePlan(readFileSync("examples/library.arch", "utf8"));
    expect(wallContacts(ir!.walls, Number.POSITIVE_INFINITY)).toBe(51);
    // A drum of 60 arcs of one circle: every whole-circle box meets every other (1770 pairs,
    // over MAX_WALL_CONTACTS); the arcs' own boxes meet only their neighbours.
    const pts = Array.from({ length: 60 }, (_, k) => {
      const t = (k * Math.PI) / 30;
      return `(${Math.round(20000 + 10000 * Math.cos(t))},${Math.round(20000 + 10000 * Math.sin(t))})`;
    });
    const drum = P(
      `wall exterior thickness 200 { ${pts[0]} ${pts
        .slice(1)
        .map((p) => `arc ${p} radius 10000`)
        .join(" ")} arc ${pts[0]} radius 10000 }\nroom circle at (20000,20000) radius 10000 label "Drum" uses hall`,
    );
    const wf = charge(drum);
    expect(wf && "refused" in wf).toBe(false);
    const { ir: dir } = resolvePlan(drum);
    expect(wallContacts(dir!.walls, Number.POSITIVE_INFINITY)).toBeLessThan(200);
  });
});

describe("review round 2 — W_BOUNDARY_NO_WALL", () => {
  const gap = (extra: string): string =>
    P(`${SHELL_67}
room at (0,0) size 6000x4000 label "Study" uses office
room at (0,4000) size 6000x3000 label "Bedroom" uses bedroom
wall partition thickness 100 { (0,4000) (2100,4000) }
wall partition thickness 100 { (3900,4000) (6000,4000) }
${extra}`);

  it("splits the stretch where a wall body crosses the line (wb-perp: two 850 mm stretches, silent)", () => {
    expect(codesOf(gap(""))).toContain("W_BOUNDARY_NO_WALL");
    expect(codesOf(gap("wall partition thickness 100 { (3000,3000) (3000,5000) }"))).not.toContain(
      "W_BOUNDARY_NO_WALL",
    );
    // A wall that only reaches the line from one side does not cross it.
    expect(codesOf(gap("wall partition thickness 100 { (3000,3000) (3000,3990) }"))).toContain("W_BOUNDARY_NO_WALL");
  });

  it("keeps the decided asymmetry: counters by the total they leave open, wall stubs by the longest stretch (k2b, k2c)", () => {
    // Two counters leaving 900 mm open in all: closed. 950 in all: open.
    expect(
      codesOf(gap("furniture counter at (2300,3700) size 400x600\nfurniture counter at (3100,3700) size 500x600")),
    ).not.toContain("W_BOUNDARY_NO_WALL");
    expect(
      codesOf(gap("furniture counter at (2300,3700) size 400x600\nfurniture counter at (3100,3700) size 450x600")),
    ).toContain("W_BOUNDARY_NO_WALL");
    // Two wall stubs leaving 950 mm open in all, the longest stretch 400 mm: silent.
    expect(
      codesOf(
        gap(
          "wall partition thickness 100 { (2300,4000) (2700,4000) }\nwall partition thickness 100 { (3100,4000) (3550,4000) }",
        ),
      ),
    ).not.toContain("W_BOUNDARY_NO_WALL");
  });
});

describe("the coverage report names a refused storey (PS2.13 seam)", () => {
  it("files the face rules' budget refusal as an enclosure-budget skip, and nothing when measured", () => {
    const walls: string[] = [];
    for (let k = 0; k < 100; k++) {
      const lo = 69000 - 150 * k;
      const hi = 71000 + 150 * k;
      walls.push(`wall partition thickness 50 { (${lo},${lo}) (${hi},${lo}) (${hi},${hi}) (${lo},${hi}) close }`);
    }
    const nested = P(
      `${walls.join("\n")}\nroom at (54150,54150) size 31700x31700 label "Hall" uses hall\ndoor at (70000,54150) width 900`,
    );
    const fam = lintCoverage(nested)!.families.find((f) => f.family === "enclosure");
    // The boundary rule measured; the two face rules declined, so the family is partial.
    expect(fam).toEqual({
      family: "enclosure",
      status: "partial",
      skipped: [
        {
          reason: "enclosure-budget",
          why: "too many walled regions nested in one place to measure",
          cap: "nested-regions",
        },
      ],
    });
    const measured = lintCoverage(
      readFileSync("test/defect-corpus/space-not-enclosed/bow-strip-unassigned.arch", "utf8"),
    )!;
    expect(measured.families.find((f) => f.family === "enclosure")).toEqual({ family: "enclosure", status: "ran" });
  });
});

// ─── review round 3 ─────────────────────────────────────────────────────────────────────

describe("review round 3 — a room's inside test is charged per probe, before the work", () => {
  /**
   * The reviewer's comb: `s` long free-standing stubs inside a 40 m box, one room with `t`
   * teeth whose edges cross every stub, and `k` tiny stubs outside the box (they shrink the
   * grid cell). Ported from `comb.mjs`, same numbers.
   */
  const comb = (s: number, t: number, k: number): string => {
    const W = 40000;
    const H = 40000;
    const o = [`wall exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }`];
    for (let i = 0; i < s; i++)
      o.push(`wall partition thickness 20 { (1000,${1000 + i * 300}) (${W - 1000},${1000 + i * 300}) }`);
    const p = (W - 4000) / t;
    const pts: Array<[number, number]> = [[1500, 400]];
    for (let j = 0; j < t; j++) {
      const x0 = Math.round(2000 + j * p);
      const x1 = Math.round(2000 + j * p + p / 2);
      pts.push([x0, 400], [x0, H - 500], [x1, H - 500], [x1, 400]);
    }
    pts.push([W - 1500, 400], [W - 1500, 300], [1500, 300]);
    o.push(`room polygon ${pts.map(([x, y]) => `(${x},${y})`).join(" ")} label "Comb" uses storage`);
    for (let j = 0; j < k; j++) {
      const x = -20000 - (j % 40) * 500;
      const y = Math.floor(j / 40) * 500;
      o.push(`wall partition thickness 20 { (${x},${y}) (${x + 300},${y}) }`);
    }
    return P(o.join("\n"));
  };
  const charge = (src: string) => {
    const { ir } = resolvePlan(src);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    return wallFaces(ir!.walls, rooms, rooms);
  };

  it("refuses combs whose many-vertex room is crossed by many walls (comb 60/100/400, 100/100/400)", () => {
    expect(charge(comb(60, 100, 400))).toEqual({ refused: "too-many-candidate-tests", count: 2_085_773_472 });
    expect(charge(comb(100, 100, 400))).toEqual({ refused: "too-many-candidate-tests", count: 3_239_282_592 });
  });

  it("still measures the corpus's largest ring (aquarium's 56-vertex concourse over its walls)", () => {
    const src = readFileSync("examples/aquarium.arch", "utf8");
    const { ir } = resolvePlan(src);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    expect(Math.max(...rooms.map((r) => r.poly?.length ?? 4))).toBe(56);
    const wf = wallFaces(ir!.walls, rooms, rooms);
    if (!wf || "refused" in wf) throw new Error(`refused: ${JSON.stringify(wf)}`);
    expect(wf.budget.candidateTests).toBe(9_306_756);
    expect(wf.budget.candidateTests).toBeLessThan(FACE_BUDGET_CAPS.candidateTests / 20);
    expect(lintCoverage(src)!.families.find((f) => f.family === "enclosure")).toEqual({
      family: "enclosure",
      status: "ran",
    });
  });

  it("names the cap that tripped in the coverage words, under the one reason id", () => {
    const why = (src: string) =>
      lintCoverage(src)!
        .families.find((f) => f.family === "enclosure")!
        .skipped!.map((s) => [s.reason, s.cap, s.why]);
    const lat20 = (n: number): string => {
      const walls = ["wall exterior thickness 200 { (0,0) (20000,0) (20000,20000) (0,20000) close }"];
      for (let i = 1; i < 20; i++)
        walls.push(
          `wall partition thickness 100 { (${i * 1000},0) (${i * 1000},20000) }`,
          `wall partition thickness 100 { (0,${i * 1000}) (20000,${i * 1000}) }`,
        );
      const rooms = Array.from({ length: n }, (_, i) => `room at (0,0) size 20000x19500 label "Hall ${i}" uses hall`);
      return P(`${walls.join("\n")}\n${rooms.join("\n")}\ndoor at (500,0) width 800`);
    };
    expect(why(comb(60, 100, 400))).toEqual([["enclosure-budget", "point-tests", "too many point tests to measure"]]);
    expect(why(lat20(300))).toEqual([
      ["enclosure-budget", "room-region-pairs", "too many room–region pairs to measure"],
    ]);
    // 21 x 21 cells of 1 m: 441 faces, over the face cap.
    const cells: string[] = ["wall exterior thickness 200 { (0,0) (21000,0) (21000,21000) (0,21000) close }"];
    for (let i = 1; i < 21; i++)
      cells.push(
        `wall partition thickness 100 { (${i * 1000},0) (${i * 1000},21000) }`,
        `wall partition thickness 100 { (0,${i * 1000}) (21000,${i * 1000}) }`,
      );
    cells.push('room at (0,0) size 21000x21000 label "Hall" uses hall');
    expect(why(P(cells.join("\n")))).toEqual([
      ["enclosure-budget", "regions", "too many walls or walled regions to measure"],
    ]);
  });
});
