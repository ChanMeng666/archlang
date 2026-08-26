import { describe, expect, it } from "vitest";
import { applyFixes, compile, lint, repair } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RFurniture } from "../src/ir.js";
import { backCandidateEdges, backingWallForRoomEdge, isAgainstWall, wallBackedEdges } from "../src/analyze.js";
import { backEdgeForRotate, rotateForBackEdge } from "../src/fixture-orientation.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";

/**
 * Fixture ORIENTATION — which way a wall-requiring fixture faces.
 *
 * Fixture symbols are drawn with their back on the TOP edge, so a fixture's facing is
 * entirely its quarter-turn `rotate`. Three things must agree, and are tested here
 * against one shared mapping (`src/fixture-orientation.ts`):
 *   * resolve derives the rotation of a room-anchored fixture (the derivation matrix);
 *   * `lint` flags a fixture standing on a wall with its back to the room
 *     (`W_FIXTURE_BACK_TO_ROOM`) and carries a machine-applicable `rotate` fix;
 *   * `repair` turns such a fixture in place (`kind: "rotated"`).
 *
 * The derivation is deliberately narrow (ADR 0005): a rotation appears only when the
 * anchor AND the footprint's aspect leave exactly ONE walled edge as the back.
 */

// A room walled on all four sides. Room box 0,0 → 4000,4000; every edge sits on a
// wall centerline, so all four edges are "backed".
const boxed = (furniture: string) =>
  `plan "P" {
    units mm
    grid 1
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Bath" uses bath
    ${furniture}
  }`;

// The same room with the SOUTH wall missing (an open edge), so `anchor bottom` names
// an edge with no wall behind it.
const openSouth = (furniture: string) =>
  `plan "P" {
    units mm
    grid 1
    wall exterior thickness 200 { (0,4000) (0,0) (4000,0) (4000,4000) }
    room id=r at (0,0) size 4000x4000 label "Bath" uses bath
    ${furniture}
  }`;

const furnOf = (src: string): RFurniture =>
  resolve(parse(src).plan!).ir.elements.find((e): e is RFurniture => e.kind === "furniture")!;

/** The effective quarter-turn (an absent `rotate` is 0). */
const rotOf = (src: string): number => furnOf(src).rotate ?? 0;

const codes = (src: string): string[] => lint(src).map((d) => d.code ?? "");

describe("the shared back-edge ⇄ quarter-turn mapping", () => {
  it("round-trips every edge (0 = back north, then clockwise)", () => {
    expect(rotateForBackEdge("top")).toBe(0);
    expect(rotateForBackEdge("right")).toBe(90);
    expect(rotateForBackEdge("bottom")).toBe(180);
    expect(rotateForBackEdge("left")).toBe(270);
    for (const e of ["top", "right", "bottom", "left"] as const) {
      expect(backEdgeForRotate(rotateForBackEdge(e))).toBe(e);
    }
  });

  it("normalizes an absent / out-of-range rotation to the top edge", () => {
    expect(backEdgeForRotate(undefined)).toBe("top");
    expect(backEdgeForRotate(360)).toBe("top");
    expect(backEdgeForRotate(-90)).toBe("left");
  });

  it("agrees with the rendered symbol: rotate 180 puts the WC cistern on the south edge", () => {
    // The cistern is the band across the back; with rotate 180 its polygon must sit in
    // the SOUTHERN fifth of the footprint (y 1000..1700 → band at y ≥ 1546).
    const src = `plan "P" { units mm room id=r at (0,0) size 4000x4000 furniture wc at (1000,1000) size 400x700 rotate 180 }`;
    const svg = compile(src, { noCache: true }).svg;
    const band = svg.match(/<polygon points="([^"]*)" fill="#f4f2ee"[^>]*\/>/g)!.at(-1)!;
    const ys = [...band.matchAll(/[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(1500);
    expect(Math.max(...ys)).toBeCloseTo(1700, 6);
  });
});

describe("backingWallForRoomEdge / wallBackedEdges", () => {
  const walls = resolve(parse(boxed("")).plan!).ir.walls;
  const rect = { x: 0, y: 0, w: 4000, h: 4000 };

  it("finds the wall collinear with each edge of the room", () => {
    for (const e of ["top", "bottom", "left", "right"] as const) {
      expect(backingWallForRoomEdge(rect, e, walls)).not.toBeNull();
    }
  });

  it("returns null for an edge with no wall behind it", () => {
    const open = resolve(parse(openSouth("")).plan!).ir.walls;
    expect(backingWallForRoomEdge(rect, "bottom", open)).toBeNull();
    expect(backingWallForRoomEdge(rect, "top", open)).not.toBeNull();
  });

  it("returns null when the wall covers less than half the edge", () => {
    // A stub wall along only 1000 of the 4000-long south edge.
    const stub = resolve(parse(`plan "P" { units mm wall partition thickness 100 { (0,4000) (1000,4000) } }`).plan!).ir
      .walls;
    expect(backingWallForRoomEdge(rect, "bottom", stub)).toBeNull();
  });

  it("is exactly what isAgainstWall summarizes (any edge backed)", () => {
    for (const r of [
      { x: 0, y: 0, w: 400, h: 700 }, // corner
      { x: 1800, y: 1800, w: 400, h: 700 }, // floating mid-room
      { x: 1800, y: 3300, w: 400, h: 700 }, // on the south wall
    ]) {
      const backing = wallBackedEdges(r, walls, 300);
      const any = (["top", "bottom", "left", "right"] as const).some((e) => backing[e] !== null);
      expect(any).toBe(isAgainstWall(r, walls, 300));
    }
  });
});

describe("backCandidateEdges — the footprint's aspect constrains the back", () => {
  it("keeps a 400x700 WC's back on a horizontal edge (400 runs along the wall)", () => {
    expect(backCandidateEdges({ w: 400, h: 700 }, defaultFootprint("wc"))).toEqual(["top", "bottom"]);
  });

  it("puts a 700x400 WC's back on a vertical edge (the depth axis is x)", () => {
    expect(backCandidateEdges({ w: 700, h: 400 }, defaultFootprint("wc"))).toEqual(["left", "right"]);
  });

  it("says nothing for a square footprint or an uncatalogued kind", () => {
    expect(backCandidateEdges({ w: 600, h: 600 }, defaultFootprint("counter"))).toEqual([
      "top",
      "bottom",
      "left",
      "right",
    ]);
    // `bed` used to stand in for "uncatalogued" here; it is a catalogued bed now, so the
    // uncatalogued case needs a word the catalog genuinely does not know.
    expect(backCandidateEdges({ w: 400, h: 700 }, defaultFootprint("widget"))).toEqual([
      "top",
      "bottom",
      "left",
      "right",
    ]);
  });

  it("keeps a bed's back on its HEAD edge (1500 along the wall, 2000 into the room)", () => {
    expect(backCandidateEdges({ w: 1500, h: 2000 }, defaultFootprint("bed"))).toEqual(["top", "bottom"]);
    expect(backCandidateEdges({ w: 2000, h: 1500 }, defaultFootprint("bed"))).toEqual(["left", "right"]);
  });
});

/**
 * The derivation matrix: anchor kind × wall backing × category × explicit `rotate`.
 * Each row is one closed-form answer, or none at all.
 */
describe("derived orientation for room-anchored placement", () => {
  it("edge anchor, wall present → back faces that wall", () => {
    expect(rotOf(boxed(`furniture wc in r anchor bottom size 400x700`))).toBe(180);
    expect(rotOf(boxed(`furniture wc in r anchor top size 400x700`))).toBe(0);
    // A vertical wall needs the piece's depth on x, i.e. a 700x400 footprint.
    expect(rotOf(boxed(`furniture wc in r anchor left size 700x400`))).toBe(270);
    expect(rotOf(boxed(`furniture wc in r anchor right size 700x400`))).toBe(90);
  });

  it("edge anchor, NO wall on that edge → no rotation (nothing to face)", () => {
    expect(rotOf(openSouth(`furniture wc in r anchor bottom size 400x700`))).toBe(0);
    expect(furnOf(openSouth(`furniture wc in r anchor bottom size 400x700`)).rotate).toBeUndefined();
  });

  it("edge anchor whose wall the footprint rules out → no rotation", () => {
    // 400 along × 700 deep can't back onto the west wall; deriving 270 would draw a
    // 700-wide, 400-deep WC. Declined, and lint says so instead.
    expect(furnOf(boxed(`furniture wc in r anchor left size 400x700`)).rotate).toBeUndefined();
    expect(codes(boxed(`furniture wc in r anchor left size 400x700`))).toContain("W_FIXTURE_BACK_TO_ROOM");
  });

  it("corner anchor → derived when the footprint leaves one of the two edges", () => {
    // bottom-left: candidates {bottom,left}; a 400x700 WC can only back onto bottom.
    expect(rotOf(boxed(`furniture wc in r anchor bottom-left size 400x700`))).toBe(180);
    expect(rotOf(boxed(`furniture wc in r anchor top-right size 700x400`))).toBe(90);
  });

  it("corner anchor with two equally valid walls → no rotation (no guess)", () => {
    // A square counter can back onto either wall of the corner: ambiguous.
    expect(furnOf(boxed(`furniture counter in r anchor bottom-left size 600x600`)).rotate).toBeUndefined();
  });

  it("`centered` names no edge → no rotation", () => {
    expect(furnOf(boxed(`furniture wc in r centered size 400x700`)).rotate).toBeUndefined();
  });

  it("free-standing furniture is never turned", () => {
    // `bed` used to be the example here, on the strength of being uncatalogued. It is a
    // catalogued, wall-requiring bed now (its back is its HEAD), so the free-standing case
    // needs a piece that is free-standing on purpose — a sofa is arranged, not installed —
    // and a word the catalog does not know at all.
    expect(furnOf(boxed(`furniture sofa in r anchor bottom size 2000x900`)).rotate).toBeUndefined();
    expect(furnOf(boxed(`furniture widget in r anchor bottom size 1500x2000`)).rotate).toBeUndefined();
  });

  it("a catalogued bed is NOT turned by a room anchor — its symbol has no back yet", () => {
    // `bed` is catalogued (footprint, aliases, lint vocabulary) but NOT `requiresWall`: it
    // carries no services, and `W_FIXTURE_FLOATING`'s remedy line ("supply/waste/venting
    // runs in the wall") is false about a bed. `orientationMatters` therefore says no, and
    // that is the honest answer while the bed draws as a plain labelled rectangle — a box
    // has no back to turn toward a wall, so a derived rotation would be invisible and
    // `W_FIXTURE_BACK_TO_ROOM`'s advice unverifiable from the drawing. The phase that draws
    // the bed is the phase that can say which way it faces. Flip this test then.
    expect(furnOf(boxed(`furniture bed in r anchor bottom size 1500x2000`)).rotate).toBeUndefined();
    expect(codes(boxed(`furniture bed in r anchor bottom size 1500x2000`))).not.toContain("W_FIXTURE_FLOATING");
  });

  it("`against wall` still derives a bed's rotation, catalogued or not", () => {
    // `placeAgainst` takes its quarter-turn from the wall itself, for EVERY category — so
    // the clause that exists to say "this backs onto that wall" keeps working regardless of
    // what the catalog thinks about the piece's services.
    const src = `plan "P" { units mm
      wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "R"
      furniture bed against wall w segment 2 offset 2000 in r }`;
    expect(furnOf(src).rotate).toBe(180);
  });

  it("a rotation-symmetric fixture (shower tray) is never turned", () => {
    expect(furnOf(boxed(`furniture shower in r anchor bottom size 900x900`)).rotate).toBeUndefined();
  });

  it("an explicit `rotate` always wins over the derivation", () => {
    expect(rotOf(boxed(`furniture wc in r anchor bottom size 400x700 rotate 90`))).toBe(90);
    // …including an explicit 0 (author says "back to the north"), which is not derived away.
    expect(rotOf(boxed(`furniture wc in r anchor bottom size 400x700 rotate 0`))).toBe(0);
  });

  it("does not move the piece: position is byte-identical to the un-derived form", () => {
    const derived = furnOf(boxed(`furniture wc in r anchor bottom size 400x700`));
    const plain = furnOf(boxed(`furniture bed in r anchor bottom size 400x700`));
    expect(derived.at).toEqual(plain.at);
  });

  it("stays deterministic", () => {
    const src = boxed(`furniture wc in r anchor bottom size 400x700`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

describe("W_FIXTURE_BACK_TO_ROOM", () => {
  // The studio's old WC line, in the same geometry: a 400x700 WC flush against the
  // south wall with no `rotate`, so its cistern faced north into the room.
  const southWall = (furn: string) =>
    `plan "P" {
      units mm
      grid 50
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "Bath" uses bath
      door at (500,4000) width 900 wall exterior hinge left swing out
      ${furn}
    }`;
  const misOriented = southWall(`furniture wc at (1800,3200) size 400x700`);

  it("fires on a fixture whose back faces the room, with a machine-applicable fix", () => {
    const diags = lint(misOriented).filter((d) => d.code === "W_FIXTURE_BACK_TO_ROOM");
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fixes![0]!;
    expect(fix.applicability).toBe("machine-applicable");
    expect(fix.fixId).toBe("fixture-back-to-room");
    expect(fix.title).toContain("rotate 180");
  });

  it("does not fire once the fixture is turned the right way", () => {
    expect(codes(southWall(`furniture wc at (1800,3200) size 400x700 rotate 180`))).not.toContain(
      "W_FIXTURE_BACK_TO_ROOM",
    );
  });

  it("does not fire for free-standing furniture or a symmetric fixture", () => {
    expect(codes(southWall(`furniture bed at (1000,1000) size 1500x2000`))).not.toContain("W_FIXTURE_BACK_TO_ROOM");
    // A shower tray in the SE corner: two walls behind it, no meaningful facing.
    expect(codes(southWall(`furniture shower at (2900,2900) size 900x900`))).not.toContain("W_FIXTURE_BACK_TO_ROOM");
  });

  it("does not fire for a fixture against no wall at all (that is W_FIXTURE_FLOATING)", () => {
    const c = codes(southWall(`furniture wc at (1800,1500) size 400x700`));
    expect(c).toContain("W_FIXTURE_FLOATING");
    expect(c).not.toContain("W_FIXTURE_BACK_TO_ROOM");
  });

  it("fires without a fix when two walls are equally valid (a square fixture in a corner)", () => {
    const diags = lint(southWall(`furniture counter at (3300,3300) size 600x600 rotate 0`)).filter(
      (d) => d.code === "W_FIXTURE_BACK_TO_ROOM",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.fixes).toBeUndefined();
  });

  it("a display filter cannot hide it from the exit code (lint stays whole-plan)", () => {
    // The rule is a warning like any other: it must not turn a plan's `ok` green.
    expect(lint(misOriented).some((d) => d.severity === "warning")).toBe(true);
  });

  describe("arch fix round-trip", () => {
    it("applying the fixes leaves the plan lint-clean and still compiling", () => {
      const fixes = lint(misOriented).flatMap((d) => d.fixes ?? []);
      const report = applyFixes(misOriented, fixes);
      expect(report.applied.length).toBe(1);
      expect(report.output).toContain("size 400x700 rotate 180");
      expect(compile(report.output, { noCache: true }).errors).toEqual([]);
      expect(codes(report.output)).not.toContain("W_FIXTURE_BACK_TO_ROOM");
      expect(lint(report.output)).toEqual([]);
    });

    it("rewrites an authored wrong `rotate` instead of appending a second one", () => {
      const src = southWall(`furniture wc at (1800,3200) size 400x700 rotate 90`);
      const out = applyFixes(
        src,
        lint(src).flatMap((d) => d.fixes ?? []),
      ).output;
      expect(out).toContain("rotate 180");
      expect(out.match(/rotate/g)).toHaveLength(1);
      expect(lint(out)).toEqual([]);
    });

    it("inserts before a trailing `in <room>`, which the grammar keeps last", () => {
      const src = southWall(`furniture wc at (1800,3200) size 400x700 in r`);
      const out = applyFixes(
        src,
        lint(src).flatMap((d) => d.fixes ?? []),
      ).output;
      expect(out).toContain("size 400x700 rotate 180 in r");
      expect(compile(out, { noCache: true }).errors).toEqual([]);
      expect(lint(out)).toEqual([]);
    });
  });

  describe("arch repair", () => {
    it("turns a flush-but-wrong-facing fixture and logs a `rotated` change", () => {
      const r = repair(misOriented);
      expect(r.changed).toBe(true);
      const turns = r.changes.filter((c) => c.kind === "rotated");
      expect(turns).toHaveLength(1);
      expect(turns[0]!.category).toBe("wc");
      expect(turns[0]!.fromRotate).toBe(0);
      expect(turns[0]!.toRotate).toBe(180);
      expect(turns[0]!.from).toEqual(turns[0]!.to); // a turn never moves the piece
      expect(r.source).toContain("rotate 180");
      expect(lint(r.source)).toEqual([]);
    });

    it("is deterministic and idempotent (the second run is a fixpoint)", () => {
      expect(repair(misOriented)).toEqual(repair(misOriented));
      const once = repair(misOriented).source;
      const twice = repair(once);
      expect(twice.changed).toBe(false);
      expect(twice.source).toBe(once);
    });

    it("reports, never guesses, when no single wall is the back", () => {
      const r = repair(southWall(`furniture counter at (3300,3300) size 600x600 rotate 0`));
      expect(r.changes.filter((c) => c.kind === "rotated")).toEqual([]);
      expect(r.unresolved.some((u) => u.reason.includes("faces the room"))).toBe(true);
    });

    it("leaves a correctly-oriented fixture alone", () => {
      expect(repair(southWall(`furniture wc at (1800,3200) size 400x700 rotate 180`)).changed).toBe(false);
    });
  });
});
