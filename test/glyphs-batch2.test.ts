/**
 * The second furniture tranche — `rug`, `sofa_l`, `piano`, `sun_lounger` — and the one piece
 * of catalog semantics that came with them, `FixtureSpec.underlay`.
 *
 * The four symbols are held to the same drawing contract as every other glyph (inside its own
 * footprint at every aspect and every quarter-turn, two pen weights, no text, deterministic),
 * because a symbol that draws outside its rectangle makes the drawing and `arch lint` disagree
 * about where the piece is — silently. That part is routine, and it is the first block below.
 *
 * The rest is not routine, and it is why this file exists rather than four more rows in
 * `glyphs-living.test.ts`:
 *
 * **1. The rug paints NO fill, and that is a correctness property, not a style.** An underlay
 * is drawn under other furniture, so if it filled, the drawing would depend on the order the
 * two statements were written in — `rug` after `sofa` would paint over the sofa, and the same
 * plan with the lines swapped would look right. The assertion walks every primitive, so a
 * later edit that gives one of them a body fill fails here rather than in a screenshot.
 *
 * **2. `underlay` is proved by its CONSEQUENCES, in both directions.** Three rules read the
 * flag, and each one is asserted with the counterexample beside it: the exemption must not be
 * "overlap checking is off". A rug under a sofa raises nothing, two ordinary pieces overlapping
 * still raise `W_FURNITURE_OVERLAP`, and — the case a blanket exemption would get wrong — two
 * RUGS overlapping each other still raise it too.
 *
 * **3. A rug is walked ON; a piano is walked ROUND.** The same plan, the same footprint, the
 * same position, one word different: through the rug the far room is reachable and lint is
 * quiet, through the piano the room is cut off from the nav grid and `W_ROOM_NO_CLEAR_PATH`
 * fires. Two grids answer that question (`analyze/circulation.ts`'s whole-plan nav grid and
 * `analyze/occupancy.ts`'s per-room flood fill) and both are driven here, because they are
 * separate code paths that must not disagree about what a rug is.
 *
 * **4. A piano cannot be placed `against wall`, on purpose.** It carries no catalogued
 * footprint precisely so that form is unreachable — `against wall` derives the rotation from
 * the wall under the back-on-top convention, which would face the keyboard into the plaster.
 * That refusal is a design decision one `footprint:` line would silently undo, so it is pinned.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describeSource, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { DEFAULT_THEME } from "../src/theme.js";
import type { Point } from "../src/ast.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { fixtureGlyph, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint, isUnderlay, solidFurniture } from "../src/fixtures-catalog.js";

/** Real pen sizes, taken from a real scene rather than invented. */
const SIZES: RenderSizes = toScene(
  resolve(parse(`plan "G" { units mm room id=r at (0,0) size 9000x6000 label "R" }`).plan!).ir,
).sizes;

/** The symbol for `category`, or a failure — every category below must actually draw. */
function glyph(category: string, r: Rect): SceneNode[] {
  const nodes = fixtureGlyph(category, r, DEFAULT_THEME, SIZES);
  if (nodes === null) throw new Error(`${category} draws no symbol`);
  return nodes;
}

/**
 * Every point that DEFINES a primitive's extent. Throws on a primitive kind a fixture symbol
 * has no business emitting — `text` above all, which is how the "no text prims" law is
 * enforced for every case in the file at once rather than in one assertion someone can forget
 * to extend.
 */
function pointsOf(n: SceneNode): Point[] {
  const p = n.prim;
  switch (p.t) {
    case "polygon":
      return [...p.pts];
    case "line":
      return [p.a, p.b];
    case "circle":
      return [
        { x: p.center.x - p.r, y: p.center.y - p.r },
        { x: p.center.x + p.r, y: p.center.y + p.r },
      ];
    case "arc": {
      const mid = { x: (p.start.x + p.end.x) / 2, y: (p.start.y + p.end.y) / 2 };
      const dx = mid.x - p.center.x;
      const dy = mid.y - p.center.y;
      const len = Math.hypot(dx, dy);
      const apex = len > 0 ? [{ x: p.center.x + (dx / len) * p.r, y: p.center.y + (dy / len) * p.r }] : [];
      return [p.start, p.end, p.center, ...apex];
    }
    default:
      throw new Error(`a batch-2 glyph emitted an unexpected primitive: ${p.t}`);
  }
}

/** Assert every defining point of `nodes` lies inside `r`, to within a hair of float noise. */
function expectInside(nodes: SceneNode[], r: Rect, what: string): void {
  const eps = Math.max(r.w, r.h, 1) * 1e-9;
  for (const p of nodes.flatMap(pointsOf)) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${what}: (${p.x}, ${p.y}) is not finite`).toBe(true);
    expect(p.x, `${what}: x`).toBeGreaterThanOrEqual(r.x - eps);
    expect(p.x, `${what}: x`).toBeLessThanOrEqual(r.x + r.w + eps);
    expect(p.y, `${what}: y`).toBeGreaterThanOrEqual(r.y - eps);
    expect(p.y, `${what}: y`).toBeLessThanOrEqual(r.y + r.h + eps);
  }
}

/**
 * One representative footprint per category, with the primitive count it must emit.
 *
 * The counts are written out rather than derived from the module's own formula, so a wrong
 * implementation cannot agree with the assertion. Each is the aspect a real plan would use: a
 * 2000 x 1400 rug under a coffee table, the catalogued 2600 x 1600 L-sofa, a 1500 x 1400 baby
 * grand, a 700 x 1900 lounger.
 */
const CASES: readonly (readonly [string, Rect, number])[] = [
  ["rug", { x: 1000, y: 1000, w: 2000, h: 1400 }, 16], // 2 borders + 7 fringe ticks per end
  ["sofa_l", { x: 1000, y: 1000, w: 2600, h: 1600 }, 6], // body + 2 backrests + 2 + 1 cushions
  ["piano", { x: 1000, y: 1000, w: 1500, h: 1400 }, 7], // body + keyboard + 4 key ticks + lid
  ["sun_lounger", { x: 1000, y: 1000, w: 700, h: 1900 }, 8], // body + backrest + 6 slats
];

const ALL_NAMES = ["rug", "carpet", "sofa_l", "corner_sofa", "piano", "grand_piano", "sun_lounger", "lounger"];

describe("glyphs-batch2 — the drawing contract", () => {
  it("every name in the four families dispatches to a drawn symbol, aliases included", () => {
    for (const c of ALL_NAMES) expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
  });

  it.each(CASES)("%s draws %o as %i primitives, all inside its footprint", (category, r, count) => {
    const nodes = glyph(category, r);
    expect(nodes).toHaveLength(count);
    expectInside(nodes, r, category);
  });

  it.each(CASES)("%s uses only the two glyph pen weights, and outlines at least one in thin", (category, r) => {
    const weights = glyph(category, r).map((n) => n.lineWeight);
    for (const w of weights) expect(["thin", "extraThin"]).toContain(w);
    expect(weights, `${category} must have an outline`).toContain("thin");
  });

  it.each(CASES)("%s emits no text primitive and draws on the furniture layer", (category, r) => {
    // `pointsOf` throws on `text`; this states the law where a reader will look for it.
    for (const n of glyph(category, r)) {
      expect(n.prim.t).not.toBe("text");
      expect(n.layer).toBe("furniture");
    }
  });

  it.each(CASES)("%s is a deterministic function of its inputs", (category, r) => {
    expect(glyph(category, r)).toEqual(glyph(category, r));
  });

  it.each(CASES)("%s differs from the labelled-rectangle fallback and swallows its label", (category) => {
    const plan = (kind: string): string =>
      `plan "P" { units mm room id=r at (0,0) size 6000x5000 label "R" ` +
      `furniture ${kind} at (1000,1000) size 1600x1200 label "X" }`;
    const drawn = compile(plan(category), { noCache: true }).svg;
    const fallback = compile(plan("hammock"), { noCache: true }).svg;
    expect(drawn).not.toBe(fallback);
    expect(fallback).toContain(">X</text>");
    expect(drawn).not.toContain(">X</text>");
  });
});

describe("glyphs-batch2 — through the compiler, at all four quarter-turns", () => {
  // Declared 2100 x 900 at (1000,1000): x ∈ [1000,3100], y ∈ [1000,1900] whatever the turn,
  // because `furniture.render()` swaps the pre-rotation extents for 90/270.
  const AT = { x: 1000, y: 1000, w: 2100, h: 900 };
  const plan = (category: string, deg: number): string =>
    `plan "P" { units mm room id=r at (0,0) size 6000x5000 label "R" ` +
    `furniture ${category} at (${AT.x},${AT.y}) size ${AT.w}x${AT.h} rotate ${deg} }`;

  it.each(CASES.map(([c]) => c))("%s compiles clean and stays in its footprint at 0/90/180/270", (category) => {
    for (const deg of [0, 90, 180, 270]) {
      const src = plan(category, deg);
      const out = compile(src, { noCache: true });
      expect(out.errors, `${category} rotate ${deg}`).toEqual([]);
      const nodes = toScene(resolve(parse(src).plan!).ir).nodes.filter((n) => n.layer === "furniture");
      expect(nodes.length, `${category} rotate ${deg} drew nothing`).toBeGreaterThan(0);
      expectInside(nodes, AT, `${category} rotate ${deg}`);
    }
  });
});

describe("glyphs-batch2 — degenerate footprints", () => {
  const DEGENERATE: readonly Rect[] = [
    { x: 0, y: 0, w: 0, h: 0 },
    { x: 500, y: 500, w: 0, h: 900 },
    { x: 500, y: 500, w: 900, h: 0 },
    { x: 0, y: 0, w: 10000, h: 10 },
    { x: 0, y: 0, w: 10, h: 10000 },
    { x: -1000, y: -1000, w: 1, h: 1 },
  ];

  it.each(CASES.map(([c]) => c))("%s stays finite, bounded and text-free on every degenerate rect", (category) => {
    for (const r of DEGENERATE) {
      const nodes = glyph(category, r);
      const where = `${category} at ${r.w}x${r.h}`;
      // Every repeat count here is aspect-derived, and an aspect is unbounded: without the
      // clamps the 10000 x 10 case asks for thousands of lines in one symbol.
      expect(nodes.length, where).toBeGreaterThanOrEqual(5);
      expect(nodes.length, where).toBeLessThanOrEqual(20);
      for (const n of nodes) {
        if (n.prim.t === "circle" || n.prim.t === "arc") {
          expect(Number.isFinite(n.prim.r), `${where}: radius`).toBe(true);
        }
      }
      expectInside(nodes, r, where);
    }
  });
});

describe("the rug is drawn UNFILLED, so paint order cannot matter", () => {
  const RECTS: readonly Rect[] = [
    { x: 0, y: 0, w: 2000, h: 1400 },
    { x: 0, y: 0, w: 1400, h: 2000 },
    { x: 0, y: 0, w: 10000, h: 10 },
    { x: 0, y: 0, w: 0, h: 0 },
  ];

  it("no primitive of a rug paints a fill, at any aspect", () => {
    for (const r of RECTS) {
      for (const n of glyph("rug", r)) {
        // Absent (a line) or the explicit "none" (a border) — never a colour.
        expect([undefined, "none"], `a rug prim filled ${String(n.paint.fill)} at ${r.w}x${r.h}`).toContain(
          n.paint.fill,
        );
      }
    }
  });

  it("the sofa it is written after survives, whichever order the two are written in", () => {
    // The consequence the law above buys, stated end to end: an unfilled rug drawn LAST
    // cannot occlude, so the sofa's own linework is byte-identical either way round.
    const body = (first: string, second: string): string =>
      `plan "P" { units mm room id=r at (0,0) size 6000x5000 label "R" ${first} ${second} }`;
    const rug = "furniture rug at (500,500) size 3000x2200";
    const sofa = "furniture sofa at (800,1200) size 2000x900";
    const rugFirst = compile(body(rug, sofa), { noCache: true }).svg;
    const sofaFirst = compile(body(sofa, rug), { noCache: true }).svg;
    // The two documents differ only in the order of the furniture group's own children…
    expect(rugFirst).not.toBe(sofaFirst);
    // …and every line of each is present in the other, so nothing was painted over.
    const lines = (s: string): string[] => s.split("\n").sort();
    expect(lines(rugFirst)).toEqual(lines(sofaFirst));
  });
});

describe("`underlay` — what the catalog flag actually changes", () => {
  const plan = (body: string): string =>
    ['plan "U" {', "  units mm", '  room id=r at (0,0) size 6000x5000 label "Room"', body, "}"].join("\n");
  const codes = (body: string): string[] => lint(plan(body)).map((d) => d.code ?? "");

  it("the flag is set on the rug family and on nothing else in the tranche", () => {
    expect(isUnderlay("rug")).toBe(true);
    expect(isUnderlay("carpet")).toBe(true);
    for (const c of ["sofa_l", "piano", "sun_lounger", "sofa", "coffee_table", "widget"]) {
      expect(isUnderlay(c), `${c} is not an underlay`).toBe(false);
    }
  });

  it("`solidFurniture` drops underlays and keeps everything else", () => {
    const pieces = [{ category: "rug" }, { category: "sofa" }, { category: "carpet" }, { category: "piano" }];
    expect(solidFurniture(pieces)).toEqual([{ category: "sofa" }, { category: "piano" }]);
  });

  it("a sofa standing ON a rug is the arrangement, not an overlap", () => {
    expect(
      codes("  furniture rug at (500,500) size 3000x2200\n  furniture sofa at (800,1200) size 2000x900"),
    ).not.toContain("W_FURNITURE_OVERLAP");
  });

  it("…and the exemption is the PAIR, not a switch: two ordinary pieces still collide", () => {
    // The counterexample that makes the case above non-vacuous — same geometry, neither
    // piece an underlay.
    expect(
      codes("  furniture table at (500,500) size 3000x2200\n  furniture sofa at (800,1200) size 2000x900"),
    ).toContain("W_FURNITURE_OVERLAP");
  });

  it("…and two RUGS overlapping each other still collide", () => {
    // The case a blanket "skip anything underlay" test would get wrong. One rug half over
    // another is a drawing mistake, and nothing about walking on them says otherwise.
    expect(
      codes("  furniture rug at (500,500) size 3000x2200\n  furniture carpet at (800,1200) size 2000x900"),
    ).toContain("W_FURNITURE_OVERLAP");
  });

  it("a rug reaching under a fixture does not block its frontal clearance", () => {
    // A WC wants 450 mm of clear floor in front (it faces south at `rotate 0`).
    const inFront = "  furniture wc at (1000,300) size 400x700\n  furniture %s at (900,1050) size 800x300";
    expect(codes(inFront.replace("%s", "rug"))).not.toContain("W_FURN_CLEARANCE");
    expect(codes(inFront.replace("%s", "coffee_table"))).toContain("W_FURN_CLEARANCE");
  });
});

describe("`underlay` — a rug is walked ON, a piano is walked ROUND", () => {
  /**
   * One plan, one word different. A piece spanning the back room wall-to-wall, right inside
   * its only door, leaves a single 0.5 m² row of floor in front of it (under the rule's 1.0 m²
   * floor) and 3 m² sealed behind it (over it, so a genuinely tiny room is not what is being
   * measured).
   */
  const plan = (category: string): string => `plan "W" {
    units mm
    wall id=w exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
    wall id=p partition thickness 100 { (0,2500) (5000,2500) }
    room id=front at (0,0)    size 5000x2500 label "Hall" uses hall
    room id=back  at (0,2500) size 5000x2500 label "Back"
    door id=d_in on w at 2500 width 900 hinge near start swing into front
    door id=d_bk on p at 2500 width 900 hinge near start swing into back
    furniture ${category} at (0,2620) size 5000x1780
  }`;

  const reached = (category: string): string[] =>
    (describeSource(plan(category)).circulation?.rooms ?? []).map((r) => r.roomId);
  const codes = (category: string): string[] => lint(plan(category)).map((d) => d.code ?? "");

  it("the piano seals the back room off — both grids say so", () => {
    // `analyze/circulation.ts`: the room never appears in the entrance walk.
    expect(reached("piano")).toEqual(["front"]);
    // `analyze/occupancy.ts`, through the lint rule that reads it.
    expect(codes("piano")).toContain("W_ROOM_NO_CLEAR_PATH");
  });

  it("the rug does not, at the same position and the same footprint", () => {
    expect(reached("rug")).toEqual(["front", "back"]);
    expect(codes("rug")).not.toContain("W_ROOM_NO_CLEAR_PATH");
  });

  it("but a rug drawn THROUGH a wall is still a drawing error", () => {
    // `W_FURNITURE_WALL_COLLISION` deliberately keeps applying: what you can walk on has no
    // bearing on whether it is inside the plaster. Both plans above trip it, which is also
    // what proves the two cases differ only in the walkability rules.
    expect(codes("rug")).toContain("W_FURNITURE_WALL_COLLISION");
    expect(codes("piano")).toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("the DOOR rules do not yet know about underlays — recorded, not endorsed", () => {
    // `lint/rules/doors.ts` builds its own obstacle list straight from `furniture`, so a rug
    // under a door swing or across its landing reads as an obstruction. `W_SWING_OBSTRUCTED`
    // is arguable (a thick rug really does catch a leaf); `W_DOORWAY_BLOCKED` — "you cannot
    // stand here" about a piece you stand ON — is not, and a rug inside a doorway is an
    // ordinary thing to draw.
    //
    // It is left alone rather than fixed here because those two rules were out of this
    // change's scope, and pinning the CURRENT answer is what makes the gap visible: whoever
    // extends `solidFurniture` to `doors.ts` will land on this assertion with the note
    // attached, instead of discovering the residual from a user.
    expect(codes("rug")).toContain("W_SWING_OBSTRUCTED");
    expect(codes("rug")).toContain("W_DOORWAY_BLOCKED");
  });
});

describe("the piano's missing footprint is a decision, not an omission", () => {
  it("none of the three unsized kinds has one, and `sofa_l` does", () => {
    for (const c of ["rug", "piano", "sun_lounger"]) expect(defaultFootprint(c), c).toBeNull();
    expect(defaultFootprint("sofa_l")).toEqual({ along: 2600, depth: 1600 });
    expect(defaultFootprint("corner_sofa")).toEqual({ along: 2600, depth: 1600 });
  });

  it("`furniture piano against wall …` is refused, because it would face the keyboard at it", () => {
    // `against wall` derives the rotation from the wall under the back-on-top convention, and
    // a piano's back-on-top IS its keyboard. Withholding the footprint is what keeps the form
    // out of reach — one `footprint:` line would silently make it legal and wrong.
    const src = `plan "P" {
      units mm
      wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
      room id=r at (0,0) size 6000x6000 label "R"
      furniture piano against wall w segment 0 offset 3000 in r
    }`;
    const errs = compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E_FURN_SIZE"]);
  });

  it("an L-sofa, which has one, may omit `size` there", () => {
    const src = `plan "P" {
      units mm
      wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
      room id=r at (0,0) size 6000x6000 label "R"
      furniture sofa_l against wall w segment 0 offset 3000 in r
    }`;
    expect(compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
