/**
 * `src/elements/glyphs-outdoor.ts` — the twenty-one site symbols: planting, garden
 * furniture, parked things, and the small standing objects.
 *
 * The shared drawing contract is the same one the five indoor modules are held to, and it is
 * re-asserted here rather than imported because a contract that lives in one file and is
 * checked in another is a contract nobody reads: nothing leaves its own footprint (an arc is
 * SAMPLED along its sweep, not reduced to its endpoints), every arc stays minor and every
 * curved-outline arc within 120°, two pen weights and no third, no text primitive, deterministic
 * geometry, and a finite drawing at every degenerate aspect the fuzz and the `hasFixtureGlyph`
 * probe can ask for.
 *
 * Three things are specific to this module and are what the per-family suites below are for.
 *
 * **1. Eleven of the twenty-one claim `symmetric: true`, and the claim is PROVED.** Orientation
 * reasoning reads that flag — a symmetric category never gets a derived quarter-turn and
 * never trips `W_FIXTURE_BACK_TO_ROOM` — so an unproved claim is a fact about the language
 * that the drawing contradicts. Each one is turned by the real `rotateNode` and compared
 * against itself, and reflected by the real `mirrorNode` and compared again: a symbol in plan
 * with no front has the square's whole symmetry group (D4), not just its rotations. The
 * comparisons normalise a polygon's or a loop's CYCLIC START (a quarter-turn maps a star's
 * vertex `i` to vertex `i+8`, so the same ring comes back as a rotated list) but nothing else —
 * a moved vertex, a changed radius or a dropped node still fails.
 *
 * **2. Five of them are `directional`, and that is a claim about the drawing too.** A
 * `directional` symbol must actually differ end-to-end along its depth, or the derived
 * quarter-turn is advice a reader cannot check. Each is asserted to draw something nearer its
 * back edge that is not mirrored at the front.
 *
 * **3. The planting MASKS the ground; the pergola does not.** A tree, a conifer, a shrub and a
 * hedge are each ONE closed outline filled with the lawn tint, so a ground hatch under them is
 * painted out; the pergola is above the cut plane, so it is dashed and unfilled for the
 * `upper_cabinet` reason. Both are pinned, because a fill is exactly the kind of thing a later
 * refactor changes without noticing what it hides or shows.
 */

import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { compile, lint } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { arcEdgeSweep, arcEdgesOf, pathExtentPoints } from "./glyph-extent.js";
import { weightWidth } from "../src/scene.js";
import { CANONICAL_FIXTURES, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { fixtureSpec } from "../src/fixtures-catalog.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { glyphCtx, mapSceneNode } from "../src/elements/glyph-lib.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { rotateNode } from "../src/elements/furniture.js";
import { drawChair } from "../src/elements/glyphs-living.js";
import {
  drawBbq,
  drawBicycle,
  drawBin,
  drawClothesline,
  drawConifer,
  drawEvCharger,
  drawFirePit,
  drawHedge,
  drawHotTub,
  drawMailbox,
  drawMotorcycle,
  drawOutdoorChair,
  drawOutdoorTable,
  drawPergola,
  drawSandpit,
  drawShed,
  drawShrub,
  drawSwing,
  drawTrampoline,
  drawTree,
  drawUmbrella,
} from "../src/elements/glyphs-outdoor.js";

const SRC = `plan "G" { units mm room id=r at (0,0) size 8000x6000 label "R" }`;
const baseScene = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
const { theme, sizes } = baseScene();

type Draw = (r: Rect, g: ReturnType<typeof glyphCtx>) => SceneNode[];

const draw = (fn: Draw, r: Rect): SceneNode[] => fn(r, glyphCtx(theme, sizes));

/** The twenty-one symbols under test, by the category name that dispatches to each. */
const GLYPHS: readonly (readonly [string, Draw])[] = [
  ["tree", drawTree],
  ["conifer", drawConifer],
  ["shrub", drawShrub],
  ["hedge", drawHedge],
  ["bbq", drawBbq],
  ["outdoor_table", drawOutdoorTable],
  ["outdoor_chair", drawOutdoorChair],
  ["umbrella", drawUmbrella],
  ["bicycle", drawBicycle],
  ["motorcycle", drawMotorcycle],
  ["hot_tub", drawHotTub],
  ["swing", drawSwing],
  ["trampoline", drawTrampoline],
  ["bin", drawBin],
  ["mailbox", drawMailbox],
  ["ev_charger", drawEvCharger],
  ["pergola", drawPergola],
  ["sandpit", drawSandpit],
  ["fire_pit", drawFirePit],
  ["shed", drawShed],
  ["clothesline", drawClothesline],
];

/** Every name this module answers for, canonical and alias alike. */
const ALL_NAMES: readonly string[] = [
  "tree",
  "deciduous_tree",
  "conifer",
  "pine",
  "shrub",
  "bush",
  "hedge",
  "bbq",
  "grill",
  "barbecue",
  "outdoor_table",
  "patio_table",
  "outdoor_chair",
  "patio_chair",
  "umbrella",
  "parasol",
  "bicycle",
  "bike",
  "motorcycle",
  "hot_tub",
  "spa",
  "swing",
  "swing_set",
  "trampoline",
  "bin",
  "wheelie_bin",
  "mailbox",
  "letterbox",
  "ev_charger",
  "pergola",
  "sandpit",
  "sandbox",
  "fire_pit",
  "shed",
  "garden_shed",
  "clothesline",
  "washing_line",
];

/** A generic footprint: off the origin, wider than deep, no round-number aspect. */
const R: Rect = { x: 1000, y: 2000, w: 1600, h: 700 };

/** A square footprint: the rectangle-built symmetric symbols are invariant on one. */
const SQ: Rect = { x: 500, y: 900, w: 1200, h: 1200 };

/**
 * Primitive counts at {@link R}. Exact, per family, for the reason every glyph suite pins
 * them: a count is the cheapest statement of "this symbol is still the drawing it was", and
 * it fails on an accidentally-duplicated node that no containment or weight check would see.
 * Three are aspect-dependent and are pinned at their clamps separately below: the patio table's
 * chairs (four a side and one each end here), the pergola's rafters (eight across and three
 * along here) and the hedge's scallops (which live INSIDE its one outline node).
 */
const EXPECTED_PRIMS: Readonly<Record<string, number>> = {
  tree: 26, // scalloped canopy + 8 branches × (stem + 2 twigs) + trunk
  conifer: 10, // star canopy + 8 spokes + trunk
  shrub: 2, // the cloud + its inner foliage cloud
  hedge: 2, // the scalloped band + the stem line
  bbq: 13, // firebox + 2 shelves + grate + 6 bars + 3 knobs
  outdoor_table: 23, // top + bevel + parasol hole + 10 chairs × (seat + backrest)
  outdoor_chair: 7, // seat + backrest + 2 arms + 3 slats
  umbrella: 10, // canopy + 8 ribs + pole
  bicycle: 8, // 2 tyres + frame + saddle + handlebar + crank + 2 pedals
  motorcycle: 8, // 2 tyres + body + seat + tank + handlebar + 2 mirrors
  hot_tub: 7, // shell + water + footwell + 4 seat divisions
  swing: 11, // beam + 4 legs + 2 seats + 4 chain hangers
  trampoline: 26, // frame + mat + 24 springs
  bin: 4, // body + lid + handle + grip
  mailbox: 3, // box + flap + flag
  ev_charger: 4, // pedestal + display + cable + plug
  pergola: 27, // frame + (8 + 3 rafters) × 2 halves + 4 posts
  sandpit: 6, // frame + sand + 4 corner seats
  fire_pit: 15, // surround + bowl + 8 joints + 4 logs + embers
  shed: 7, // floor + walls + 2 leaves + 2 swings + ridge
  clothesline: 8, // 2 cross-arms + 2 posts + 4 lines
};

/**
 * The primitive ceiling for one family — its own worst case at any footprint, by NAME rather
 * than a blanket raise, so a family that grows is caught by its own number. Four families have
 * a count that depends on the footprint or is large by nature: the tree's 24 branch lines and
 * the trampoline's 24 springs are FIXED at 26; the patio table's chairs are clamped at four a
 * side (23); the pergola's rafters at nine across a long run, each drawn as two halves (29).
 * Every other family keeps the
 * ~2–15 budget the indoor modules keep, and all of them are well inside the 48 the design
 * programme aims for.
 */
const CEILING: Readonly<Record<string, number>> = { tree: 26, trampoline: 26, outdoor_table: 23, pergola: 29 };
const budget = (name: string): number => CEILING[name] ?? 15;

const TAU = Math.PI * 2;

/** The signed sweep of an arc primitive, in radians, following its `sweep` flag. */
function arcSweep(p: Extract<SceneNode["prim"], { t: "arc" }>): number {
  const a0 = Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x);
  const a1 = Math.atan2(p.end.y - p.center.y, p.end.x - p.center.x);
  let d = a1 - a0;
  if (p.sweep === 1) while (d <= 0) d += TAU;
  else while (d >= 0) d -= TAU;
  return d;
}

/**
 * Points that bound one primitive. An arc is SAMPLED along its sweep — start/end/centre bound
 * the chord, and the drawn curve bulges away from it, which is exactly where a containment
 * bug hides. Anything that is not one of the five primitives a glyph may emit throws, which
 * is what makes "no text primitive" a consequence of this helper rather than a second
 * assertion nobody updates.
 */
function boundingPoints(n: SceneNode): Point[] {
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
      const a0 = Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x);
      const d = arcSweep(p);
      const out: Point[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = a0 + (d * i) / 32;
        out.push({ x: p.center.x + p.r * Math.cos(a), y: p.center.y + p.r * Math.sin(a) });
      }
      return out;
    }
    // A curved outline: its vertices and its arcs' axis extremes, exactly (`glyph-extent.ts`).
    case "path":
      return pathExtentPoints(p);
    default:
      throw new Error(`a fixture glyph emitted an unexpected primitive: ${p.t}`);
  }
}

/** Every node's geometry lies inside `r`, to within a nanometre of float slack. */
function expectInside(nodes: SceneNode[], r: Rect, what: string): void {
  const eps = 1e-6;
  for (const n of nodes) {
    for (const p of boundingPoints(n)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${what}: a finite point`).toBe(true);
      expect(p.x, `${what}: x >= left`).toBeGreaterThanOrEqual(r.x - eps);
      expect(p.x, `${what}: x <= right`).toBeLessThanOrEqual(r.x + r.w + eps);
      expect(p.y, `${what}: y >= top`).toBeGreaterThanOrEqual(r.y - eps);
      expect(p.y, `${what}: y <= bottom`).toBeLessThanOrEqual(r.y + r.h + eps);
    }
  }
}

/**
 * A primitive as a rounded, order-independent string — for comparing two SETS of nodes.
 *
 * A polygon's vertex list is normalised to start at its lexicographically smallest point.
 * That is the ONE normalisation this file makes, and it is needed rather than convenient: a
 * quarter-turn maps a 32-point star's vertex `i` onto vertex `i + 8`, so a genuinely
 * rotation-invariant ring comes back as the same cycle read from a different place. Nothing
 * else is normalised — the direction of travel is preserved (a rotation cannot reverse it),
 * so a mirrored or re-ordered ring still fails.
 */
function canonical(n: SceneNode): string {
  const f = (v: number): string => v.toFixed(6);
  const pt = (p: Point): string => `${f(p.x)},${f(p.y)}`;
  const p = n.prim;
  switch (p.t) {
    case "polygon": {
      const keys = p.pts.map(pt);
      let start = 0;
      for (let i = 1; i < keys.length; i++) if (keys[i]! < keys[start]!) start = i;
      const rolled = [...keys.slice(start), ...keys.slice(0, start)];
      return `poly[${rolled.join(" ")}]`;
    }
    case "line":
      return `line[${pt(p.a)} ${pt(p.b)}]`;
    case "circle":
      return `circle[${pt(p.center)} ${f(p.r)}]`;
    case "arc":
      return `arc[${pt(p.center)} ${f(p.r)} ${pt(p.start)} ${pt(p.end)} ${p.sweep}]`;
    // A path loop is normalised the way a polygon's ring is — to start at its smallest edge
    // token — and nothing more: the direction of travel is kept, so a mirrored loop still fails.
    case "path":
      return `path[${p.loops
        .map((lp) => {
          const verts = [lp.start, ...lp.edges.map((e) => e.to)];
          const keys = lp.edges.map(
            (e, i) => `${pt(verts[i]!)}${e.t === "arc" ? `a${pt(e.center)}r${f(e.r)}s${e.sweep}` : "l"}`,
          );
          let start = 0;
          for (let i = 1; i < keys.length; i++) if (keys[i]! < keys[start]!) start = i;
          return [...keys.slice(start), ...keys.slice(0, start)].join(" ");
        })
        .join(" | ")}]`;
    default:
      throw new Error(`unexpected primitive ${p.t}`);
  }
}

const pathOf = (n: SceneNode): Extract<SceneNode["prim"], { t: "path" }> => {
  if (n.prim.t !== "path") throw new Error(`expected a path, got a ${n.prim.t}`);
  return n.prim;
};

describe("glyphs-outdoor — what each symbol draws", () => {
  it("every category dispatches to a drawn symbol, aliases included", () => {
    for (const c of ALL_NAMES) expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
  });

  it("the twenty-one families are ONE contiguous run of the canonical vocabulary", () => {
    // Derived, not retyped: the module's own family list must be exactly what
    // `FIXTURE_FAMILIES` appended, in order. Appending elsewhere or re-ordering the table
    // (which is the LEGEND's order) fails here.
    //
    // It used to read `slice(-names.length)` — the outdoor tranche was the TAIL, because it
    // was the last one written. Twenty-six more families now follow it, so the
    // tail is no longer this module's and never will be again. The property that
    // actually matters survives the change and is the one asserted now: the twenty-one sit
    // together, in order, wherever the table has grown to put them. A family slotted in
    // beside its domain neighbours instead of appended still fails, which is the whole
    // point — that ordering is the legend's.
    const names = GLYPHS.map(([n]) => n);
    const start = CANONICAL_FIXTURES.indexOf(names[0]!);
    expect(start, "the first outdoor family is in the canonical vocabulary").toBeGreaterThanOrEqual(0);
    expect(CANONICAL_FIXTURES.slice(start, start + names.length)).toEqual(names);
  });

  it("draws the expected number of primitives, all within the budget", () => {
    for (const [name, fn] of GLYPHS) {
      const nodes = draw(fn, R);
      expect(nodes.length, `${name} primitive count`).toBe(EXPECTED_PRIMS[name]);
      expect(nodes.length, `${name} is within the budget`).toBeGreaterThanOrEqual(2);
      expect(nodes.length, `${name} is within the budget`).toBeLessThanOrEqual(budget(name));
    }
  });

  it("keeps every primitive inside the footprint", () => {
    for (const [name, fn] of GLYPHS) expectInside(draw(fn, R), R, name);
  });

  it("emits no text primitive (a symbol is read, not labelled)", () => {
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) expect(n.prim.t, `${name} primitive kind`).not.toBe("text");
    }
  });

  it("paints on the furniture layer at a glyph weight, with paint.width agreeing", () => {
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) {
        expect(n.layer, `${name} layer`).toBe("furniture");
        expect(n.lineWeight, `${name} names a weight`).toBeDefined();
        expect(["thin", "extraThin"]).toContain(n.lineWeight);
        expect(n.paint.width, `${name} width matches its weight`).toBe(weightWidth(n.lineWeight!, sizes));
      }
    }
  });

  it("uses both weights: an outline in thin, interior detail in extraThin", () => {
    for (const [name, fn] of GLYPHS) {
      const nodes = draw(fn, R);
      const weights = new Set(nodes.map((n) => n.lineWeight));
      expect(weights, `${name} draws detail below its outline`).toEqual(new Set(["thin", "extraThin"]));
      // …and the FIRST node — the one a consumer makes the element's primary — is outline.
      expect(nodes[0]!.lineWeight, `${name} leads with its outline`).toBe("thin");
    }
  });

  it("strokes each tone in its own ink: outline in the symbol ink, detail in furnitureStroke", () => {
    const g = glyphCtx(theme, sizes);
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) {
        expect(n.paint.stroke, `${name} ${n.lineWeight} stroke`).toBe(n.lineWeight === "thin" ? g.ink : g.stroke);
      }
    }
  });

  it("keeps every arc a MINOR one, and every curved-outline arc within 120°", () => {
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) {
        if (n.prim.t === "arc")
          expect(Math.abs(arcSweep(n.prim)), `${name} arc sweep`).toBeLessThanOrEqual(Math.PI + 1e-9);
        if (n.prim.t === "path") {
          for (const { from, e } of arcEdgesOf(n.prim)) {
            expect(Math.abs(arcEdgeSweep(from, e)), `${name} path arc`).toBeLessThanOrEqual((2 * Math.PI) / 3 + 1e-9);
          }
        }
      }
    }
  });

  it("is deterministic — two calls produce identical geometry", () => {
    for (const [name, fn] of GLYPHS) {
      const a = draw(fn, R).map(canonical);
      const b = draw(fn, R).map(canonical);
      expect(a, `${name} is deterministic`).toEqual(b);
    }
  });
});

describe("glyphs-outdoor — the catalog's claims about these symbols are true", () => {
  /**
   * The eleven `symmetric: true` families, with the footprint each is proved on. The seven
   * radial ones hold at ANY aspect (they are built from the centre and the short side, both of
   * which a quarter-turn preserves); the four rectangle-built ones hold on a square, which is
   * the honest scope of the claim — `coffee_table` is symmetric on the same terms. (`island`
   * used to be named here too. It stopped being `symmetric` when its symbol gained a seating
   * overhang along one side; see `fixtures-catalog.ts`.)
   *
   * `shrub` used to be absent: its outline was an irregular cloud that only balanced its mass
   * about the centre. It is now a cloud of eight equal lobes on the D4 bearings, so it is proved
   * here vertex for vertex like the tree.
   */
  const SYMMETRIC: readonly (readonly [string, Draw, Rect])[] = [
    ["tree", drawTree, R],
    ["conifer", drawConifer, R],
    ["shrub", drawShrub, R],
    ["umbrella", drawUmbrella, R],
    ["trampoline", drawTrampoline, R],
    ["fire_pit", drawFirePit, R],
    ["hot_tub", drawHotTub, SQ],
    ["pergola", drawPergola, SQ],
    ["sandpit", drawSandpit, SQ],
    ["outdoor_table", drawOutdoorTable, SQ],
  ];

  it("every family the catalog calls symmetric maps onto itself under a quarter-turn", () => {
    for (const [name, fn, rect] of SYMMETRIC) {
      expect(fixtureSpec(name)?.symmetric, `${name} claims symmetry`).toBe(true);
      const centre: Point = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      const original = draw(fn, rect).map(canonical).sort();
      for (const deg of [90, 180, 270]) {
        const turned = draw(fn, rect)
          .map((n) => rotateNode(n, centre, deg))
          .map(canonical)
          .sort();
        expect(turned, `${name} at ${deg} degrees`).toEqual(original);
      }
    }
  });

  it("…and onto itself under a mirror, so it has the square's whole symmetry, not just its turns", () => {
    // `marksEqual` quotients exactly the re-spellings a reflection makes (a ring read the other
    // way round, an arc's ends swapped) and nothing else; `mirrorNode` is the reflection a
    // mirrored `place` applies to a symbol.
    for (const [name, fn, rect] of SYMMETRIC) {
      const nodes = draw(fn, rect);
      expect(
        marksEqual(
          nodes,
          nodes.map((n) => mirrorNode(n, rect.x + rect.w / 2)),
        ),
        `${name} mirrored`,
      ).toBe(true);
    }
    // Not vacuous: the mailbox carries its flag on one side, and the mirror sees it.
    const box = draw(drawMailbox, R);
    expect(
      marksEqual(
        box,
        box.map((n) => mirrorNode(n, R.x + R.w / 2)),
      ),
    ).toBe(false);
  });

  it("a mirror-symmetric symbol stays symmetric WHEREVER it sits — the symmetry probe's question", () => {
    // `analyze/symmetry.ts` asks each placed piece "are you your own mirror image?" at its real
    // plan position, so an answer that flips with the position moves `describe --facts
    // symmetry` for a decorative reason. The trap is a mirrored PAIR built as two separate
    // stadiums (a chair's arms, a washing line's cross-arms): `roundedRectPath` can leave a
    // sub-ulp straight run on one twin and not the other, depending on the coordinates. Here
    // every family that is mirror-symmetric at all is asked at many positions and aspects; the
    // bicycle and the motorcycle only stood on end, where the mirror runs along their length.
    const OFFSETS = Array.from({ length: 12 }, (_, i) => ({
      x: ((i * 7919.37) % 20000) - 3000 + i * 0.137,
      y: ((i * 104729.11) % 30000) - 5000 + i * 0.291,
    }));
    const SIZES: readonly (readonly [number, number])[] = [
      [500, 500],
      [1000, 600],
      [1234, 567],
      [1600, 900],
      [2400, 1800],
      [4000, 3000],
      [600, 1700],
      [567, 1234],
    ];
    const HANDED = new Set(["mailbox", "ev_charger"]);
    for (const [name, fn] of GLYPHS) {
      if (HANDED.has(name)) continue;
      for (const [w, h] of SIZES) {
        if ((name === "bicycle" || name === "motorcycle") && w >= h) continue;
        for (const o of OFFSETS) {
          const r: Rect = { x: o.x, y: o.y, w, h };
          const nodes = draw(fn, r);
          expect(
            marksEqual(
              nodes,
              nodes.map((n) => mirrorNode(n, r.x + r.w / 2)),
            ),
            `${name} ${w}x${h} at (${o.x.toFixed(3)}, ${o.y.toFixed(3)})`,
          ).toBe(true);
        }
      }
    }
  });

  it("the check is not vacuous — a directional symbol fails it", () => {
    // `shed` is `directional`, and the proof that the assertion above says something is that
    // running it on this symbol goes red: the doors are on one face and the ridge runs one way.
    const centre: Point = { x: SQ.x + SQ.w / 2, y: SQ.y + SQ.h / 2 };
    const original = draw(drawShed, SQ).map(canonical).sort();
    const turned = draw(drawShed, SQ)
      .map((n) => rotateNode(n, centre, 90))
      .map(canonical)
      .sort();
    expect(turned).not.toEqual(original);
  });

  it("every family the catalog calls directional draws a back that differs from its front", () => {
    // A derived quarter-turn is advice a reader must be able to check against the drawing.
    // Turning a directional symbol 180 degrees has to change it — if it did not, the flag
    // would be claiming a facing the symbol does not show.
    const DIRECTIONAL: readonly (readonly [string, Draw])[] = [
      ["bbq", drawBbq],
      ["bin", drawBin],
      ["mailbox", drawMailbox],
      ["ev_charger", drawEvCharger],
      ["shed", drawShed],
    ];
    for (const [name, fn] of DIRECTIONAL) {
      expect(fixtureSpec(name)?.directional, `${name} claims a facing`).toBe(true);
      const centre: Point = { x: SQ.x + SQ.w / 2, y: SQ.y + SQ.h / 2 };
      const original = draw(fn, SQ).map(canonical).sort();
      const turned = draw(fn, SQ)
        .map((n) => rotateNode(n, centre, 180))
        .map(canonical)
        .sort();
      expect(turned, `${name} turned end for end`).not.toEqual(original);
    }
  });

  it("nothing out here requires a wall, and nothing is an underlay", () => {
    // Both are decisions with consequences elsewhere (`W_FIXTURE_FLOATING` on one side,
    // the walkability grids on the other), so they are pinned rather than left to a comment.
    for (const name of ALL_NAMES) {
      const spec = fixtureSpec(name);
      expect(spec, `${name} has a catalog entry`).not.toBeNull();
      expect(spec!.requiresWall, `${name} needs no services`).toBe(false);
      expect(spec!.underlay ?? false, `${name} is not walked on`).toBe(false);
    }
  });

  it("gives a frontal clearance to the barbecue and to nothing else", () => {
    for (const name of ALL_NAMES) {
      const want = name === "bbq" || name === "grill" || name === "barbecue" ? 900 : undefined;
      expect(fixtureSpec(name)!.clearanceMm, `${name} clearance`).toBe(want);
    }
  });
});

describe("glyphs-outdoor — the planting masks the ground, the pergola does not", () => {
  it("draws every planting canopy as ONE closed outline filled with the lawn tint", () => {
    for (const [name, fn] of [
      ["tree", drawTree],
      ["conifer", drawConifer],
      ["shrub", drawShrub],
      ["hedge", drawHedge],
    ] as const) {
      const [canopy] = draw(fn, R);
      expect(["path", "polygon"], `${name} canopy is a closed shape`).toContain(canopy!.prim.t);
      expect(canopy!.paint.fill, `${name} canopy fill`).toBe(theme.lawn);
      expect(canopy!.lineWeight, `${name} canopy is outline`).toBe("thin");
    }
  });

  it("closes the shrub's and the hedge's outlines with arcs alone — no gap, no straight run", () => {
    // Both used to be loose rows of separate arcs that did not close (the shrub's cloud was
    // eight open arcs, the hedge a chain of overlapping circles), so neither could carry a fill.
    // Now each is one loop whose every edge is a curve and whose last edge lands on its start.
    for (const [name, fn] of [
      ["shrub", drawShrub],
      ["hedge", drawHedge],
    ] as const) {
      const lp = pathOf(draw(fn, R)[0]!).loops[0]!;
      expect(lp.edges.length, `${name} has edges`).toBeGreaterThan(4);
      expect(
        lp.edges.every((e) => e.t === "arc"),
        `${name} every edge is a curve`,
      ).toBe(true);
      const last = lp.edges[lp.edges.length - 1]!.to;
      expect(last.x).toBeCloseTo(lp.start.x, 9);
      expect(last.y).toBeCloseTo(lp.start.y, 9);
    }
  });

  it("dashes the pergola's frame and rafters — they are above the cut plane — and not its posts", () => {
    const nodes = draw(drawPergola, R);
    const outline = nodes[0]!;
    expect(outline.lineType).toBe("dashed");
    expect(outline.paint.fill, "the terrace under it reads through").toBe("none");
    expect(outline.paint.dash, "the named type and the raw pattern agree").toEqual([sizes.thin * 6, sizes.thin * 4]);
    // The rafters are dashed detail; the four posts are what the cut passes through: solid ink.
    const rafters = nodes.filter((n) => n.prim.t === "line");
    expect(rafters.length).toBeGreaterThan(0);
    for (const n of rafters) {
      expect(n.lineType).toBe("dashed");
      expect(n.lineWeight).toBe("extraThin");
    }
    const posts = nodes.slice(1).filter((n) => n.prim.t === "polygon");
    expect(posts).toHaveLength(4);
    for (const n of posts) {
      expect(n.lineType).toBeUndefined();
      expect(n.paint.fill).toBe(glyphCtx(theme, sizes).ink);
    }
  });

  it("clamps the pergola's rafters to nine a direction, and grids a square the same both ways", () => {
    const lines = (r: Rect): number => draw(drawPergola, r).filter((n) => n.prim.t === "line").length;
    // Three each way on a square, each in two halves running out from the centre line.
    expect(lines(SQ)).toBe(12);
    expect(lines({ x: 0, y: 0, w: 10000, h: 10 })).toBe(24);
    expect(draw(drawPergola, { x: 0, y: 0, w: 10, h: 10000 })).toHaveLength(budget("pergola"));
  });

  it("dashes the shed's ridge for the same reason, and only the ridge", () => {
    const nodes = draw(drawShed, R);
    const dashed = nodes.filter((n) => n.lineType === "dashed");
    expect(dashed).toHaveLength(1);
    expect(dashed[0]!.prim.t).toBe("line");
    expect(dashed[0]!.paint.dash).toEqual([sizes.thin * 6, sizes.thin * 4]);
  });
});

describe("glyphs-outdoor — the tree, the conifer and the shrub", () => {
  const c = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
  const crown = Math.min(R.w, R.h) * 0.48;

  it("draws the tree as a scalloped canopy, eight forked branches and a trunk", () => {
    const n = draw(drawTree, R);
    expect(n.map((x) => x.prim.t)).toEqual(["path", ...Array(24).fill("line"), "circle"]);
    expect(n[0]!.lineWeight).toBe("thin");
    for (const b of n.slice(1, 25)) expect(b.lineWeight).toBe("extraThin");
    // The trunk is a solid disc in the outline ink.
    expect(n[25]!.lineWeight).toBe("thin");
    expect(n[25]!.paint.fill).toBe(n[25]!.paint.stroke);
  });

  it("scallops the canopy into SIXTEEN lobes — a multiple of four is what makes it symmetric", () => {
    const canopy = pathOf(draw(drawTree, R)[0]!);
    const lp = canopy.loops[0]!;
    // The cusps are the vertices on the cusp circle (0.82 of the crown); every lobe is curved.
    const cusps = [lp.start, ...lp.edges.map((e) => e.to)]
      .slice(0, -1)
      .filter((p) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - crown * 0.82) < 1e-6);
    expect(cusps).toHaveLength(16);
    expect(lp.edges.every((e) => e.t === "arc")).toBe(true);
    // …reaching out to the crown on the axes and diagonals, never past it.
    const far = Math.max(...pathExtentPoints(canopy).map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    expect(far).toBeLessThanOrEqual(crown + 1e-9);
    expect(far).toBeGreaterThan(crown * 0.95);
  });

  it("draws the conifer as a SIXTEEN-point needled star, eight spokes and the tree's own trunk", () => {
    const n = draw(drawConifer, R);
    expect(n.map((x) => x.prim.t)).toEqual(["polygon", ...Array(8).fill("line"), "circle"]);
    const pts = (n[0]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>).pts;
    expect(pts, "sixteen tips and sixteen notches").toHaveLength(32);
    const d = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
    expect(Math.max(...d)).toBeCloseTo(crown, 9);
    expect(Math.min(...d), "notched to 0.6 of the crown").toBeCloseTo(crown * 0.6, 9);
    // The spokes are detail and run out toward the tips; the trunk is the tree's, mark for mark.
    for (const s of n.slice(1, 9)) expect(s.lineWeight).toBe("extraThin");
    const trunk = n[9]!;
    const treeTrunk = draw(drawTree, R)[25]!;
    expect(trunk.prim).toEqual(treeTrunk.prim);
    expect(trunk.paint).toEqual(treeTrunk.paint);
    expect(trunk.lineWeight).toBe("thin");
  });

  it("draws the shrub as an eight-lobe cloud reaching the crown, with a smaller cloud of foliage inside", () => {
    const n = draw(drawShrub, R);
    expect(n.map((x) => x.prim.t)).toEqual(["path", "path"]);
    const outer = pathOf(n[0]!);
    const far = Math.max(...pathExtentPoints(outer).map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    expect(far).toBeCloseTo(crown, 6);
    // Eight cusps on the cusp circle (0.78 of the crown) — eight big lobes against the tree's
    // sixteen small ones.
    const lp = outer.loops[0]!;
    const cusps = [lp.start, ...lp.edges.map((e) => e.to)]
      .slice(0, -1)
      .filter((p) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - crown * 0.78) < 1e-6);
    expect(cusps).toHaveLength(8);
    // The inner cloud is detail and is not filled, so it never hides the outline it sits in.
    expect(n[1]!.lineWeight).toBe("extraThin");
    expect(n[1]!.paint.fill).toBe("none");
  });
});

describe("glyphs-outdoor — the hedge's scalloped band", () => {
  /** The band's scallops per face: the loop's vertices on one face of the core, less one. */
  const lobes = (r: Rect): number => {
    const horizontal = r.w >= r.h;
    const short = Math.min(r.w, r.h);
    const core = (horizontal ? r.y + r.h / 2 : r.x + r.w / 2) - short * 0.32;
    const lp = pathOf(draw(drawHedge, r)[0]!).loops[0]!;
    const on = [lp.start, ...lp.edges.map((e) => e.to)]
      .slice(0, -1)
      .filter((p) => Math.abs((horizontal ? p.y : p.x) - core) < 1e-6 * Math.max(1, short));
    return on.length - 1;
  };

  it("draws ONE closed scalloped band and a dashed stem line — and no box", () => {
    const nodes = draw(drawHedge, R);
    expect(nodes.map((n) => n.prim.t)).toEqual(["path", "line"]);
    expect(
      nodes.filter((n) => n.prim.t === "polygon"),
      "no rectangle around the run",
    ).toHaveLength(0);
    // The stem line is under the foliage — hidden — so it is dashed detail.
    expect(nodes[1]!.lineType).toBe("dashed");
    expect(nodes[1]!.lineWeight).toBe("extraThin");
  });

  it("derives the scallop count from the run — one per 0.7 depths of face", () => {
    // The catalogued footprint, 2000 along x 600 deep: a face of 2000 − 0.64 × 600 = 1616,
    // which is 3.85 scallops of 420 — four a face.
    expect(lobes({ x: 0, y: 0, w: 2000, h: 600 })).toBe(4);
    expect(lobes({ x: 0, y: 0, w: 600, h: 2000 })).toBe(4); // …and the same run stood on end
  });

  it("clamps to one at the floor and thirty at the ceiling, so one node never grows unbounded", () => {
    expect(lobes({ x: 0, y: 0, w: 1000, h: 1000 })).toBe(1);
    // 10000x10 asks for over a thousand; the clamp bounds the outline's edges, not just its nodes.
    for (const r of [
      { x: 0, y: 0, w: 10000, h: 10 },
      { x: 0, y: 0, w: 10, h: 10000 },
    ]) {
      expect(lobes(r)).toBe(30);
      expect(pathOf(draw(drawHedge, r)[0]!).loops[0]!.edges.length).toBeLessThanOrEqual(2 * 30 + 4);
    }
  });

  it("puts every scallop's crown exactly ON a face, and each rounded end exactly ON an end", () => {
    // The scallops bulge 0.18 of the depth out of a core 0.64 deep, so their crowns land on the
    // footprint's faces; each end cap is a semicircle that reaches the footprint's end.
    for (const r of [
      { x: 100, y: 200, w: 2000, h: 600 },
      { x: 100, y: 200, w: 600, h: 2000 },
    ]) {
      const pts = pathExtentPoints(pathOf(draw(drawHedge, r)[0]!));
      expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(r.x, 6);
      expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(r.x + r.w, 6);
      expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(r.y, 6);
      expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(r.y + r.h, 6);
    }
  });

  it("is mirror-symmetric both along and across the run", () => {
    // Uniform scallops on both faces: a clipped hedge has no handedness. (The old chain
    // alternated its lobe sizes, so it was handed whenever a face had an even count.)
    const r: Rect = { x: 0, y: 0, w: 2000, h: 500 };
    const n = draw(drawHedge, r);
    expect(
      marksEqual(
        n,
        n.map((x) => mirrorNode(x, r.w / 2)),
      ),
    ).toBe(true);
    const flipY = (x: SceneNode): SceneNode => rotateNode(mirrorNode(x, r.w / 2), { x: r.w / 2, y: r.h / 2 }, 180);
    expect(marksEqual(n, n.map(flipY))).toBe(true);
  });

  it("keeps every arc within 120° and inside the footprint at any aspect", () => {
    for (const r of [
      { x: 500, y: 500, w: 2000, h: 600 },
      { x: 500, y: 500, w: 1000, h: 1000 },
      { x: 500, y: 500, w: 10000, h: 10 },
      { x: 500, y: 500, w: 10, h: 10000 },
      { x: 0, y: 0, w: 1, h: 1 },
    ]) {
      const nodes = draw(drawHedge, r);
      expectInside(nodes, r, `hedge ${r.w}x${r.h}`);
      for (const { from, e } of arcEdgesOf(pathOf(nodes[0]!))) {
        expect(Math.abs(arcEdgeSweep(from, e))).toBeLessThanOrEqual((2 * Math.PI) / 3 + 1e-9);
      }
    }
  });
});

describe("glyphs-outdoor — the pieces that read off their own long axis", () => {
  const LONG: Rect = { x: 0, y: 0, w: 1800, h: 600 };
  const TALL: Rect = { x: 0, y: 0, w: 600, h: 1800 };

  it("draws the same object turned, not a different one", () => {
    // A bicycle across a path and one along it are the same bicycle: same primitive kinds,
    // same count. This is the `drawBookshelf` rule applied to five more symbols.
    for (const [name, fn] of [
      ["bicycle", drawBicycle],
      ["motorcycle", drawMotorcycle],
      ["swing", drawSwing],
      ["clothesline", drawClothesline],
      ["hedge", drawHedge],
    ] as const) {
      const a = draw(fn, LONG);
      const b = draw(fn, TALL);
      expect(
        b.map((n) => n.prim.t),
        `${name} turned on end`,
      ).toEqual(a.map((n) => n.prim.t));
      // Same geometry too: the tall drawing IS the long one turned a quarter about the centre
      // (up to a mirror, which a run stood on end is) — so they are each other's reflection in
      // the diagonal.
      const diag = (n: SceneNode): SceneNode => mapSceneNode(n, (p) => ({ x: p.y, y: p.x }), true);
      expect(marksEqual(b, a.map(diag)), `${name} is the same object stood on end`).toBe(true);
    }
  });

  it("puts the bicycle's two tyres in line on its centre line, narrow, at the two ends of the run", () => {
    const nodes = draw(drawBicycle, LONG);
    const [rear, front] = nodes.slice(0, 2).map((n) => pathExtentPoints(pathOf(n)));
    for (const [t, lo, hi] of [
      [rear!, 0.03, 0.41],
      [front!, 0.59, 0.97],
    ] as const) {
      const xs = t.map((p) => p.x);
      const ys = t.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(LONG.w * lo, 6);
      expect(Math.max(...xs)).toBeCloseTo(LONG.w * hi, 6);
      // A tyre is a slim slot on the centre line — a tenth of the width at most.
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(LONG.h * 0.1 + 1e-9);
      expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(LONG.h / 2, 9);
    }
  });

  it("puts the handlebar ACROSS the front tyre and the saddle over the rear one", () => {
    const nodes = draw(drawBicycle, LONG);
    const bar = pathExtentPoints(pathOf(nodes[4]!));
    const saddle = pathExtentPoints(pathOf(nodes[3]!));
    const span = (pts: Point[], k: "x" | "y"): number =>
      Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
    expect(span(bar, "y"), "the bar spans most of the width").toBeGreaterThan(LONG.h * 0.8);
    expect(Math.min(...bar.map((p) => p.x))).toBeGreaterThan(LONG.w * 0.59);
    expect(Math.max(...saddle.map((p) => p.x))).toBeLessThan(LONG.w * 0.41);
    // The cranks and pedals are the detail pen.
    for (const n of nodes.slice(5)) expect(n.lineWeight).toBe("extraThin");
  });

  it("holds a short, fat bicycle's tyres to a slot, and stays inside", () => {
    const r: Rect = { x: 0, y: 0, w: 600, h: 600 };
    const tyre = pathExtentPoints(pathOf(draw(drawBicycle, r)[0]!));
    expect(Math.max(...tyre.map((p) => p.y)) - Math.min(...tyre.map((p) => p.y))).toBeCloseTo(600 * 0.06, 9);
    expectInside(draw(drawBicycle, r), r, "bicycle 600x600");
  });

  it("draws the motorcycle's tyres first and its body over them, widest at the tank", () => {
    const nodes = draw(drawMotorcycle, LONG);
    expect(nodes.slice(0, 3).map((n) => n.prim.t)).toEqual(["path", "path", "path"]);
    const body = pathExtentPoints(pathOf(nodes[2]!));
    const width = Math.max(...body.map((p) => p.y)) - Math.min(...body.map((p) => p.y));
    expect(width).toBeGreaterThanOrEqual(LONG.h * 0.48 - 1e-6);
    expect(width).toBeLessThan(LONG.h * 0.56);
  });
});

describe("glyphs-outdoor — the garden furniture", () => {
  it("gives the patio chair arms and slats, so it is neither a `chair` nor a `bin`", () => {
    const nodes = draw(drawOutdoorChair, R);
    // Seat (white), backrest and two arms (body): the outline pen.
    expect(nodes.slice(0, 4).map((n) => n.prim.t)).toEqual(["path", "path", "path", "path"]);
    expect(nodes[0]!.paint.fill).toBe(theme.opening);
    for (const n of nodes.slice(1, 4)) expect(n.paint.fill).toBe(theme.furnitureFill);
    // The backrest is on the BACK (top) edge; the arms run down each side.
    const back = pathExtentPoints(pathOf(nodes[1]!));
    expect(Math.max(...back.map((p) => p.y))).toBeLessThanOrEqual(R.y + R.h * 0.13 + 1e-6);
    const arms = nodes.slice(2, 4).map((n) => pathExtentPoints(pathOf(n)));
    expect(Math.max(...arms[0]!.map((p) => p.x))).toBeLessThan(R.x + R.w * 0.2);
    expect(Math.min(...arms[1]!.map((p) => p.x))).toBeGreaterThan(R.x + R.w * 0.8);
    // Three slat joints across the seat, in the detail pen.
    const slats = nodes.slice(4);
    expect(slats).toHaveLength(3);
    for (const n of slats) {
      expect(n.prim.t).toBe("line");
      expect(n.lineWeight).toBe("extraThin");
    }
    // The pilot dining chair is two nodes; this is seven.
    expect(drawChair(R, glyphCtx(theme, sizes))).toHaveLength(2);
  });

  it("seats the patio table in the dining table's language: top first, chairs tucked in the band", () => {
    const r: Rect = { x: 0, y: 0, w: 2400, h: 1200 };
    const nodes = draw(drawOutdoorTable, r);
    const band = 1200 * 0.22;
    // The top, its bevel and the parasol hole, then (seat, backrest) per chair.
    expect(nodes[0]!.paint.fill).toBe(theme.furnitureFill);
    expect(nodes[2]!.prim.t).toBe("circle");
    const chairs = nodes.slice(3);
    expect(chairs.length % 2).toBe(0);
    // Every chair's ink is inside the band round the top, never on the top itself.
    const top = { x: band, y: band, w: 2400 - 2 * band, h: 1200 - 2 * band };
    for (const n of chairs) {
      for (const p of boundingPoints(n)) {
        const insideTop =
          p.x > top.x + 1e-6 && p.x < top.x + top.w - 1e-6 && p.y > top.y + 1e-6 && p.y < top.y + top.h - 1e-6;
        expect(insideTop, "a chair stands off the top").toBe(false);
      }
    }
    // Chairs per long side from the pilot's 2.2-band pitch (three here: 1872 of top over bands of
    // 264), plus one at each end.
    expect(chairs.length / 2).toBe(2 * 3 + 2);
  });

  it("draws a near-square patio table ROUND, with one chair to a side", () => {
    const nodes = draw(drawOutdoorTable, SQ);
    expect(nodes[0]!.prim.t, "a true circle on a square").toBe("circle");
    expect(nodes).toHaveLength(2 + 2 * 4); // top + hole + 4 chairs
    const oval = draw(drawOutdoorTable, { x: 0, y: 0, w: 1300, h: 1200 });
    expect(oval[0]!.prim.t, "a four-centre oval when the sides differ").toBe("path");
  });

  it("gives the barbecue a firebox, two shelves, a barred grate and knobs at the FRONT", () => {
    const nodes = draw(drawBbq, R);
    // The firebox leads (the outline), the middle three fifths at full depth; a shelf each side.
    const box = pathExtentPoints(pathOf(nodes[0]!));
    expect(Math.min(...box.map((p) => p.x))).toBeCloseTo(R.x + R.w * 0.2, 6);
    expect(Math.max(...box.map((p) => p.x))).toBeCloseTo(R.x + R.w * 0.8, 6);
    for (const n of nodes.slice(1, 3)) expect(n.paint.fill).toBe(theme.furnitureFill);
    // The grate is white, and its six bars run front to back.
    expect(nodes[3]!.paint.fill).toBe(theme.opening);
    const bars = nodes
      .filter((n) => n.prim.t === "line")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    expect(bars).toHaveLength(6);
    for (const b of bars) expect(b.a.x).toBeCloseTo(b.b.x, 9);
    // Three knobs on the FRONT band — what makes the top edge the back this category faces at a wall.
    const knobs = nodes
      .filter((n) => n.prim.t === "circle")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "circle" }>);
    expect(knobs).toHaveLength(3);
    for (const k of knobs) expect(k.center.y).toBeGreaterThan(R.y + R.h * 0.75);
    expect(fixtureSpec("bbq")?.directional).toBe(true);
    // A shelf each side: mirror-symmetric, so not handed.
    expect(
      marksEqual(
        nodes,
        nodes.map((n) => mirrorNode(n, R.x + R.w / 2)),
      ),
    ).toBe(true);
  });

  it("gives the bin its handle at the BACK and its grip at the front", () => {
    const nodes = draw(drawBin, R);
    const handle = pathExtentPoints(pathOf(nodes[2]!));
    expect(Math.max(...handle.map((p) => p.y))).toBeLessThan(R.y + R.h * 0.2);
    const grip = nodes[3]!.prim as Extract<SceneNode["prim"], { t: "line" }>;
    expect(grip.a.y).toBeGreaterThan(R.y + R.h * 0.8);
  });

  it("draws the shed's walls as one band with a door opening, and a pair of doors swung inward", () => {
    const r: Rect = { x: 0, y: 0, w: 2400, h: 1800 };
    const nodes = draw(drawShed, r);
    expect(nodes.map((n) => n.prim.t)).toEqual(["polygon", "polygon", "polygon", "polygon", "arc", "arc", "line"]);
    // The floor is the outline, white; the walls are one body-filled band.
    expect(nodes[0]!.paint.fill).toBe(theme.opening);
    expect(nodes[1]!.paint.fill).toBe(theme.furnitureFill);
    // The two swings meet at the centre of the opening, on the FRONT (bottom) wall, and are minor.
    const swings = nodes.slice(4, 6).map((n) => n.prim as Extract<SceneNode["prim"], { t: "arc" }>);
    for (const a of swings) {
      expect(a.start.x).toBeCloseTo(1200, 9);
      expect(a.center.y).toBeGreaterThan(r.h * 0.9);
      expect(Math.abs(arcSweep(a))).toBeCloseTo(Math.PI / 2, 9);
    }
    // A pair of doors keeps the shed mirror-symmetric (not handed).
    expect(
      marksEqual(
        nodes,
        nodes.map((n) => mirrorNode(n, r.w / 2)),
      ),
    ).toBe(true);
  });
});

describe("glyphs-outdoor — the round things do not read alike", () => {
  it("gives the trampoline a narrow sprung band: frame, mat at 0.8, twenty-four springs", () => {
    const nodes = draw(drawTrampoline, R);
    const discs = nodes.filter((n) => n.prim.t === "circle").map((n) => n.prim as { r: number });
    const springs = nodes.filter((n) => n.prim.t === "line");
    expect(discs).toHaveLength(2);
    expect(springs).toHaveLength(24);
    expect(discs[1]!.r).toBeCloseTo(discs[0]!.r * 0.8, 9);
    for (const s of springs) expect(s.lineWeight).toBe("extraThin");
  });

  it("gives the fire pit a wide stone band with joints, logs and embers instead", () => {
    const nodes = draw(drawFirePit, R);
    expect(nodes.map((n) => n.prim.t)).toEqual([
      "circle",
      "circle",
      ...Array(8).fill("line"),
      ...Array(4).fill("path"),
      "circle",
    ]);
    const [surround, bowl] = nodes.map((n) => n.prim as { r: number });
    expect(bowl!.r).toBeCloseTo(surround!.r * 0.68, 9);
  });

  it("gives the parasol a sagging eight-panel canopy, not a straight octagon", () => {
    const canopy = pathOf(draw(drawUmbrella, R)[0]!);
    const lp = canopy.loops[0]!;
    expect(lp.edges.every((e) => e.t === "arc")).toBe(true);
    // Every panel bows INWARD of its chord: the arc's centre lies outside the canopy.
    const c = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
    const crown = Math.min(R.w, R.h) * 0.48;
    for (const e of lp.edges)
      if (e.t === "arc") expect(Math.hypot(e.center.x - c.x, e.center.y - c.y)).toBeGreaterThan(crown);
  });
});

describe("glyphs-outdoor — the EV charger's cable", () => {
  const nodes = draw(drawEvCharger, R);

  it("draws a pedestal with its display, a true arc and the plug", () => {
    expect(nodes.map((n) => n.prim.t)).toEqual(["path", "path", "arc", "circle"]);
  });

  it("bows the cable into the FRONT half, below the pedestal", () => {
    const arc = nodes[2]!.prim as Extract<SceneNode["prim"], { t: "arc" }>;
    const pedestalBottom = Math.max(...pathExtentPoints(pathOf(nodes[0]!)).map((p) => p.y));
    expect(arc.center.y).toBeGreaterThan(pedestalBottom);
    expect(arc.center.y + arc.r).toBeLessThanOrEqual(R.y + R.h + 1e-6);
  });

  it("keeps it a minor arc of 140 degrees", () => {
    const arc = nodes[2]!.prim as Extract<SceneNode["prim"], { t: "arc" }>;
    expect(Math.abs(arcSweep(arc))).toBeCloseTo((140 * Math.PI) / 180, 9);
  });
});

describe("glyphs-outdoor — degenerate footprints", () => {
  const DEGENERATE: readonly Rect[] = [
    { x: 0, y: 0, w: 1, h: 10000 },
    { x: 0, y: 0, w: 10000, h: 1 },
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 0, y: 0, w: 10000, h: 10 },
    { x: 0, y: 0, w: 10, h: 10000 },
  ];

  it("draws finite geometry inside the footprint at any aspect, and never throws", () => {
    for (const r of DEGENERATE) {
      for (const [name, fn] of GLYPHS) {
        const nodes = draw(fn, r);
        expect(nodes.length, `${name} at ${r.w}x${r.h}`).toBeGreaterThan(0);
        expectInside(nodes, r, `${name} at ${r.w}x${r.h}`);
      }
    }
  });

  it("never asks for an unbounded number of primitives", () => {
    for (const r of DEGENERATE) {
      for (const [name, fn] of GLYPHS) {
        expect(draw(fn, r).length, `${name} at ${r.w}x${r.h}`).toBeLessThanOrEqual(budget(name));
      }
    }
  });
});

describe("glyphs-outdoor — through the compiler", () => {
  const plan = (rot: number): string => `plan "Site" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (16000,0) (16000,10000) (0,10000) close }
  room id=g at (0,0) size 16000x10000 label "Garden"
  furniture tree at (600,600) size 3000x3000 rotate ${rot}
  furniture shed at (4200,600) size 2400x1800 label "Shed" rotate ${rot}
  furniture bbq at (7200,600) size 1200x600 rotate ${rot}
  furniture bicycle at (9200,600) size 1800x600 rotate ${rot}
  furniture ev_charger at (11600,600) size 400x300 rotate ${rot}
  furniture trampoline at (600,4200) size 3600x3600 rotate ${rot}
  furniture pergola at (5000,4200) size 4000x3000 rotate ${rot}
}`;

  it("compiles clean at all four quarter-turns and is deterministic", () => {
    for (const rot of [0, 90, 180, 270]) {
      const out = compile(plan(rot), { noCache: true });
      expect(out.errors, `rotate ${rot}`).toEqual([]);
      expect(out.svg.length).toBeGreaterThan(0);
      expect(compile(plan(rot), { noCache: true }).svg, `rotate ${rot} is deterministic`).toBe(out.svg);
    }
  });

  it("draws the symbol instead of the labelled rectangle", () => {
    const svg = compile(plan(0), { noCache: true }).svg;
    // `furniture.render()` drops the label entirely once a glyph draws, so the one word that
    // could only come from the fallback path is the proof the fallback is gone.
    expect(svg).not.toContain(">Shed<");
    expect(svg).toContain(">Garden<");
    // The canopies, tyres and shelves are curved paths; the trampoline is true circles.
    expect(svg).toContain('<path d="M ');
    expect(svg).toContain("<circle ");
  });

  it("turns the whole drawing — each quarter-turn moves the bytes", () => {
    const seen = new Set([0, 90, 180, 270].map((rot) => compile(plan(rot), { noCache: true }).svg));
    expect(seen.size, "four distinct drawings").toBe(4);
  });

  it("raises no floating-fixture warning on a garden that stands in the open", () => {
    // The whole point of `requiresWall: false` across this module. Every piece in this plan sits
    // clear of every wall, which is what a garden IS — and `W_FIXTURE_FLOATING`'s remedy line
    // ("supply/waste/venting runs in the wall") would be nonsense about any of them.
    const codes = lint(plan(0)).map((d) => d.code);
    expect(codes.filter((c) => c === "W_FIXTURE_FLOATING" || c === "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
  });
});
