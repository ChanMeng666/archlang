import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, format, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RFurniture } from "../src/ir.js";
import { backingWallForRoomEdge, innerFaceOfRoomEdge } from "../src/analyze.js";

/**
 * `flush` — wall-FACE-referenced room-anchored placement.
 *
 * A room rectangle's edges are wall CENTERLINES, so `anchor bottom` with the default
 * `inset 0` buries the piece's back half a wall thickness inside the solid. `flush`
 * re-bases `inset` onto the inner face of the wall behind each anchored edge
 * (centerline + thickness/2, toward the room) — per edge, independently, and only
 * where a wall actually is. It is a position rule that composes with (and runs before)
 * the rotation derivation, and it needs an anchored edge to exist at all.
 */

// A room walled on all four sides, each wall a DIFFERENT thickness, so every expected
// number below is unmistakably "that edge's half-thickness" and not a shared constant.
// Room box 0,0 → 4000,4000. Halves: N 100 · S 150 · W 50 · E 75.
const walled = (furniture: string, opts: { south?: boolean } = {}) =>
  `plan "P" {
    units mm
    grid 1
    wall exterior  thickness 200 { (0,0) (4000,0) }
    ${opts.south === false ? "" : "wall exterior  thickness 300 { (0,4000) (4000,4000) }"}
    wall partition thickness 100 { (0,0) (0,4000) }
    wall partition thickness 150 { (4000,0) (4000,4000) }
    room id=r at (0,0) size 4000x4000 label "Bath" uses bath
    ${furniture}
  }`;

const furnOf = (src: string): RFurniture =>
  resolve(parse(src).plan!).ir.elements.find((e): e is RFurniture => e.kind === "furniture")!;

/** Where a 600x400 free-standing piece (never rotated) lands. */
const atOf = (furn: string, opts?: { south?: boolean }) => furnOf(walled(furn, opts)).at;

const diags = (src: string) => compile(src, { noCache: true }).diagnostics;
const codes = (src: string) => lint(src).map((d) => d.code ?? "");

describe("innerFaceOfRoomEdge — the geometry `flush` measures from", () => {
  const walls = resolve(parse(walled("")).plan!).ir.walls;
  const rect = { x: 0, y: 0, w: 4000, h: 4000 };

  it("pushes each edge's centerline half a thickness toward the room", () => {
    expect(innerFaceOfRoomEdge(rect, "top", walls)).toBe(100); // 200 wall on y=0
    expect(innerFaceOfRoomEdge(rect, "bottom", walls)).toBe(3850); // 300 wall on y=4000
    expect(innerFaceOfRoomEdge(rect, "left", walls)).toBe(50); // 100 wall on x=0
    expect(innerFaceOfRoomEdge(rect, "right", walls)).toBe(3925); // 150 wall on x=4000
  });

  it("is null for an edge with no wall behind it (nothing to measure from)", () => {
    const open = resolve(parse(walled("", { south: false })).plan!).ir.walls;
    expect(innerFaceOfRoomEdge(rect, "bottom", open)).toBeNull();
    expect(innerFaceOfRoomEdge(rect, "top", open)).toBe(100);
  });
});

describe("flush arithmetic — the four edge anchors", () => {
  it("references the wall face instead of the room rectangle", () => {
    // Free axis stays centred (2000 − half the extent) in every case.
    expect(atOf(`furniture desk in r anchor top flush size 600x400`)).toEqual({ x: 1700, y: 100 });
    expect(atOf(`furniture desk in r anchor bottom flush size 600x400`)).toEqual({ x: 1700, y: 3850 - 400 });
    expect(atOf(`furniture desk in r anchor left flush size 600x400`)).toEqual({ x: 50, y: 1800 });
    expect(atOf(`furniture desk in r anchor right flush size 600x400`)).toEqual({ x: 3925 - 600, y: 1800 });
  });

  it("leaves the legacy (room-rectangle) reference untouched without `flush`", () => {
    expect(atOf(`furniture desk in r anchor top size 600x400`)).toEqual({ x: 1700, y: 0 });
    expect(atOf(`furniture desk in r anchor bottom size 600x400`)).toEqual({ x: 1700, y: 3600 });
    expect(atOf(`furniture desk in r anchor left size 600x400`)).toEqual({ x: 0, y: 1800 });
    expect(atOf(`furniture desk in r anchor right size 600x400`)).toEqual({ x: 3400, y: 1800 });
  });

  it("equals the hand-computed half-thickness inset, byte-for-byte", () => {
    // The arithmetic `flush` exists to delete: half of the 200 north wall is 100.
    const flush = compile(walled(`furniture desk in r anchor top flush size 600x400`), { noCache: true });
    const byHand = compile(walled(`furniture desk in r anchor top inset 100 size 600x400`), { noCache: true });
    expect(flush.svg).toBe(byHand.svg);
  });
});

describe("flush arithmetic — corners apply the rule per edge", () => {
  it("uses each edge's own wall thickness", () => {
    expect(atOf(`furniture desk in r anchor top-left flush size 600x400`)).toEqual({ x: 50, y: 100 });
    expect(atOf(`furniture desk in r anchor top-right flush size 600x400`)).toEqual({ x: 3925 - 600, y: 100 });
    expect(atOf(`furniture desk in r anchor bottom-left flush size 600x400`)).toEqual({ x: 50, y: 3450 });
    expect(atOf(`furniture desk in r anchor bottom-right flush size 600x400`)).toEqual({ x: 3325, y: 3450 });
  });

  it("falls back to the room rectangle on the edge that has no wall", () => {
    // South wall removed: the west edge is still flush (x=50), the south edge is not.
    expect(atOf(`furniture desk in r anchor bottom-left flush size 600x400`, { south: false })).toEqual({
      x: 50,
      y: 3600,
    });
  });
});

describe("flush and no backing wall", () => {
  it("an unwalled anchored edge keeps the room-rectangle reference", () => {
    const open = { south: false as const };
    expect(atOf(`furniture desk in r anchor bottom flush size 600x400`, open)).toEqual(
      atOf(`furniture desk in r anchor bottom size 600x400`, open),
    );
  });

  it("is not an error — `flush` on a wall-less edge is simply a no-op", () => {
    expect(diags(walled(`furniture desk in r anchor bottom flush size 600x400`, { south: false }))).toEqual([]);
  });
});

describe("flush stacks with an explicit inset", () => {
  it("`flush inset 50` = wall face + 50", () => {
    expect(atOf(`furniture desk in r anchor top flush inset 50 size 600x400`)).toEqual({ x: 1700, y: 150 });
    expect(atOf(`furniture desk in r anchor bottom flush inset 50 size 600x400`)).toEqual({ x: 1700, y: 3400 });
    expect(atOf(`furniture desk in r anchor left flush inset 50 size 600x400`)).toEqual({ x: 100, y: 1800 });
    expect(atOf(`furniture desk in r anchor top-right flush inset 50 size 600x400`)).toEqual({ x: 3275, y: 150 });
  });

  it("rejects `inset` before `flush` with the canonical order in the message", () => {
    const d = diags(walled(`furniture desk in r anchor top inset 50 flush size 600x400`));
    expect(d.some((x) => /`flush` comes before `inset`/.test(x.message))).toBe(true);
  });
});

describe("flush composes with the derived rotation", () => {
  // A 400x700 WC anchored to the south wall: the anchor derives rotate 180 (cistern to
  // that wall) and `flush` puts the cistern on its face — one statement, no arithmetic.
  const wc = furnOf(walled(`furniture wc in r anchor bottom flush size 400x700`));

  it("derives the rotation AND references the wall face", () => {
    expect(wc.rotate).toBe(180);
    expect(wc.at).toEqual({ x: 1800, y: 3850 - 700 });
    expect(wc.flush).toBe(true);
  });

  it("the position is the only thing `flush` changes (rotation is identical without it)", () => {
    expect(furnOf(walled(`furniture wc in r anchor bottom size 400x700`)).rotate).toBe(180);
  });

  it("clears the wall collision that the centerline reference causes", () => {
    // The motivating bug: `inset 0` buries the back 150 mm inside the 300 mm wall.
    expect(codes(walled(`furniture wc in r anchor bottom size 400x700`))).toContain("W_FURNITURE_WALL_COLLISION");
    expect(codes(walled(`furniture wc in r anchor bottom flush size 400x700`))).not.toContain(
      "W_FURNITURE_WALL_COLLISION",
    );
  });

  it("still derives nothing when the anchored edge is unwalled", () => {
    const f = furnOf(walled(`furniture wc in r anchor bottom flush size 400x700`, { south: false }));
    expect(f.rotate).toBeUndefined();
    expect(f.at).toEqual({ x: 1800, y: 3300 }); // room-rectangle reference
  });
});

describe("flush needs an anchored edge (E_FURN_FLUSH)", () => {
  const centered = walled(`furniture wc in r centered flush size 400x700`);

  it("reports `centered flush`, pointing at the `flush` keyword", () => {
    const d = diags(centered).filter((x) => x.code === "E_FURN_FLUSH");
    expect(d).toHaveLength(1);
    expect(d[0]!.severity).toBe("error");
    const { start, end } = d[0]!.span!;
    expect(centered.slice(start, end)).toBe("flush");
  });

  it("reports `anchor center flush` the same way (the centred anchor names no edge)", () => {
    const src = walled(`furniture wc in r anchor center flush size 400x700`);
    const d = diags(src).filter((x) => x.code === "E_FURN_FLUSH");
    expect(d).toHaveLength(1);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("flush");
  });

  it("does not fire for any anchor that does touch an edge", () => {
    for (const a of ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]) {
      expect(diags(walled(`furniture desk in r anchor ${a} flush size 600x400`))).toEqual([]);
    }
  });
});

describe("flush round-trips and stays deterministic", () => {
  it("the formatter prints `flush` before `inset`", () => {
    const out = format(walled(`furniture desk in r anchor bottom-left    flush   inset 50 size 600x400`));
    expect(out).toContain("in r anchor bottom-left flush inset 50");
    const bare = format(walled(`furniture desk in r anchor bottom flush size 600x400`));
    expect(bare).toContain("in r anchor bottom flush size 600x400");
    // …and a formatted plan re-parses to the same placement.
    expect(furnOf(bare).at).toEqual(atOf(`furniture desk in r anchor bottom flush size 600x400`));
  });

  it("compiles byte-identically across runs", () => {
    const src = walled(`furniture wc in r anchor bottom flush size 400x700`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

/**
 * `flush` and `grid` used to fight (docs/backlog.md 3.12). `flush` against a 100 mm
 * partition lands the piece on a `…50` coordinate; the resolver then grid-snapped that
 * DERIVED coordinate like a hand-authored one, and a `grid 100` plan pulled the fixture
 * straight back into the wall — raising `W_FURNITURE_WALL_COLLISION` on a correct plan.
 * A coordinate the resolver derives from wall geometry is not something the author
 * wrote, so it is no longer snapped; `at (x,y)` still is.
 */
describe("a resolver-DERIVED placement is not grid-snapped", () => {
  const gridded = (grid: number, furn: string) =>
    `plan "P" {
      units mm
      grid ${grid}
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=b at (4000,0) size 4000x4000 label "B"
      ${furn}
    }`;

  const COUNTER = `furniture counter in a anchor right flush size 600x1200`;

  it("`flush` against a 100 mm partition survives `grid 100`", () => {
    // The partition's inner face is x = 3950. `anchor right flush` puts the piece's
    // right edge exactly there, so its corner is 3350 — a `…50` coordinate the grid
    // used to round up to 3400, burying 50 mm of the piece in the wall solid.
    const f = furnOf(gridded(100, COUNTER));
    expect(f.at.x).toBe(3350);
    expect(f.at.x + 600).toBe(3950); // flush ON the face, not through it
    expect(codes(gridded(100, COUNTER))).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("gives the same answer at every grid — the derivation no longer depends on it", () => {
    // Grids up to 100 only: the grid still governs the numbers the AUTHOR wrote, and a
    // `grid 200` plan rounds this partition's own `thickness 100` up to 200, which moves
    // the wall face the fixture is derived from. That is the grid doing its job on an
    // authored number, not the derivation drifting.
    for (const g of [1, 25, 50, 100]) {
      expect(furnOf(gridded(g, COUNTER)).at).toEqual({ x: 3350, y: 1400 });
    }
  });

  it("still snaps a HAND-AUTHORED `at (x,y)` (only derived coordinates are exempt)", () => {
    expect(furnOf(gridded(100, `furniture counter at (3330,1410) size 600x1200 in a`)).at).toEqual({
      x: 3300,
      y: 1400,
    });
  });

  it("leaves an on-grid derived placement byte-identical (the `grid 50` workaround)", () => {
    // `examples/bungalow.arch` works around 3.12 with `grid 50`; 3350 already sits on
    // that grid, so the fix must not move a single byte of such a plan.
    expect(compile(gridded(50, COUNTER), { noCache: true }).svg).toBe(
      compile(gridded(1, COUNTER), { noCache: true }).svg,
    );
  });
});

describe("the flagship example's WC", () => {
  const studio = readFileSync("examples/studio.arch", "utf8");
  const byHand = studio.replace("anchor bottom flush", "anchor bottom inset 100");
  // The studio has several fixtures; the WC is the room-anchored one.
  const wcOf = (src: string): RFurniture =>
    resolve(parse(src).plan!).ir.elements.find((e): e is RFurniture => e.kind === "furniture" && e.category === "wc")!;

  it("uses `flush`, not a hand-computed half-thickness", () => {
    expect(studio).toContain("in r_bath anchor bottom flush");
    expect(byHand).not.toBe(studio); // the replacement actually matched
  });

  it("lands byte-identically to the old `inset 100` (the shell is 200 thick)", () => {
    const f = wcOf(studio);
    expect(f.at).toEqual(wcOf(byHand).at);
    expect(f.rotate).toBe(180);
    expect(compile(studio, { noCache: true }).svg).toBe(compile(byHand, { noCache: true }).svg);
  });

  it("stays lint-clean", () => {
    expect(lint(studio)).toEqual([]);
    expect(compile(studio, { noCache: true }).errors).toEqual([]);
  });
});

/**
 * Item G.1 — **two rules read different wall FACES off the same centreline.**
 *
 * A room edge is a wall CENTERLINE, and more than one wall can sit on it: write a
 * 100 mm partition along a 250 mm exterior shell's run and the solid at that edge
 * reaches 125 mm into the room while the partition alone reaches 50. `flush` used to
 * read ONE backing segment — the one covering the most of the edge, first-declared on
 * a tie — so on the repro below it referenced the partition's face at y = 50 and put
 * the bed 75 mm inside the shell, which `W_FURNITURE_WALL_COLLISION` measures against
 * the solid and duly flagged. The verdict therefore depended on the ORDER of two
 * `wall` statements, which is the tell: a derived position must come from the shape,
 * and the nearest CENTERLINE is not the nearest FACE.
 *
 * The collision check was right; `flush` was wrong. The face is now the innermost of
 * every wall backing the edge.
 */
describe("G.1 — `flush` clears every wall on the edge, not the one it picked", () => {
  // The backlog's repro, verbatim: 1800 x 2600 room, a 100 mm partition coincident
  // with the 250 mm shell's north run. `partitionFirst` is the order that used to fail.
  const coincident = (partitionFirst: boolean) => {
    const part = `wall id=part partition thickness 100 { (0,0) (1800,0) }`;
    const shell = `wall id=shell exterior thickness 250 { (0,0) (1800,0) (1800,2600) (0,2600) close }`;
    return `plan "G1" {
      units mm
      grid 50
      ${partitionFirst ? `${part}\n      ${shell}` : `${shell}\n      ${part}`}
      room id=r at (0,0) size 1800x2600 label "Room" uses bedroom
      furniture bed in r anchor top-left flush size 1400x2000
    }`;
  };

  const rect = { x: 0, y: 0, w: 1800, h: 2600 };
  const wallsOf = (src: string) => resolve(parse(src).plan!).ir.walls;

  it("takes the innermost face of the two coincident walls, either way round", () => {
    // 250/2 = 125 (the shell) beats 100/2 = 50 (the partition) — the 75 mm the report names.
    expect(innerFaceOfRoomEdge(rect, "top", wallsOf(coincident(true)))).toBe(125);
    expect(innerFaceOfRoomEdge(rect, "top", wallsOf(coincident(false)))).toBe(125);
  });

  it("still answers `which wall backs this edge?` with the largest-overlap pick", () => {
    // Unchanged on purpose: the rotation derivation and `W_FIXTURE_BACK_TO_ROOM` ask
    // for a segment, not a measurement, and a coverage tie still resolves by order.
    expect(backingWallForRoomEdge(rect, "top", wallsOf(coincident(true)))?.thickness).toBe(100);
    expect(backingWallForRoomEdge(rect, "top", wallsOf(coincident(false)))?.thickness).toBe(250);
  });

  it("places the piece on the solid's face, independent of statement order", () => {
    for (const partitionFirst of [true, false]) {
      // x = 125 off the shell's west run; y = 125 off the coincident north walls.
      expect(furnOf(coincident(partitionFirst)).at).toEqual({ x: 125, y: 125 });
    }
  });

  it("no longer collides — and the two orderings are byte-identical", () => {
    for (const partitionFirst of [true, false]) {
      expect(codes(coincident(partitionFirst))).not.toContain("W_FURNITURE_WALL_COLLISION");
    }
    expect(compile(coincident(true), { noCache: true }).svg).toBe(compile(coincident(false), { noCache: true }).svg);
  });

  it("is not `always the thickest wall in the plan` — a lone partition still reads 50", () => {
    // Non-vacuity: drop the shell's coincident north run and the same 250 mm shell is
    // still in the plan, but the top edge's own solid is the partition's 100 mm.
    const partitionOnly = `plan "G1" {
      units mm
      grid 50
      wall id=part partition thickness 100 { (0,0) (1800,0) }
      wall id=shell exterior thickness 250 { (0,0) (0,2600) (1800,2600) (1800,0) }
      room id=r at (0,0) size 1800x2600 label "Room" uses bedroom
      furniture bed in r anchor top-left flush size 1400x2000
    }`;
    expect(innerFaceOfRoomEdge(rect, "top", wallsOf(partitionOnly))).toBe(50);
    expect(furnOf(partitionOnly).at).toEqual({ x: 125, y: 50 });
  });
});
