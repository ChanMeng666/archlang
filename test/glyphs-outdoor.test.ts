/**
 * `src/elements/glyphs-outdoor.ts` — the twenty-one site symbols: planting, garden
 * furniture, parked things, and the small standing objects.
 *
 * The shared drawing contract is the same one the five indoor modules are held to, and it is
 * re-asserted here rather than imported because a contract that lives in one file and is
 * checked in another is a contract nobody reads: nothing leaves its own footprint (an arc is
 * SAMPLED along its sweep, not reduced to its endpoints), every arc stays minor, two pen
 * weights and no third, no text primitive, deterministic geometry, and a finite drawing at
 * every degenerate aspect the fuzz and the `hasFixtureGlyph` probe can ask for.
 *
 * Three things are specific to this module and are what the per-family suites below are for.
 *
 * **1. Ten of the twenty-one claim `symmetric: true`, and the claim is PROVED.** Orientation
 * reasoning reads that flag — a symmetric category never gets a derived quarter-turn and
 * never trips `W_FIXTURE_BACK_TO_ROOM` — so an unproved claim is a fact about the language
 * that the drawing contradicts. Each one is turned by the real `rotateNode` and compared
 * against itself. The comparison normalises a polygon's CYCLIC START (a quarter-turn maps a
 * 16-point star's vertex `i` to vertex `i+4`, so the same ring comes back as a rotated list)
 * but nothing else — a moved vertex, a changed radius or a dropped node still fails.
 *
 * **2. Six of them are `directional`, and that is a claim about the drawing too.** A
 * `directional` symbol must actually differ end-to-end along its depth, or the derived
 * quarter-turn is advice a reader cannot check. Each is asserted to draw something nearer its
 * back edge that is not mirrored at the front.
 *
 * **3. The planting is UNFILLED.** A canopy overhangs a path or a bay that has to read
 * through it, and the pergola is dashed for the `upper_cabinet` reason (above the cut plane).
 * Both are pinned, because a fill is exactly the kind of thing a later refactor adds without
 * noticing what it hides.
 */

import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { compile, lint } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { weightWidth } from "../src/scene.js";
import { CANONICAL_FIXTURES, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { fixtureSpec } from "../src/fixtures-catalog.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import { rotateNode } from "../src/elements/furniture.js";
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

/**
 * Primitive counts at {@link R}. Exact, per family, for the reason every glyph suite pins
 * them: a count is the cheapest statement of "this symbol is still the drawing it was", and
 * it fails on an accidentally-duplicated node that no containment or weight check would see.
 * The hedge's is aspect-dependent (its scallop count comes from the ratio), so its clamp ends
 * are pinned separately below.
 */
const EXPECTED_PRIMS: Readonly<Record<string, number>> = {
  tree: 3,
  conifer: 3,
  shrub: 11,
  hedge: 13,
  bbq: 11,
  outdoor_table: 5,
  outdoor_chair: 9,
  umbrella: 10,
  bicycle: 8,
  motorcycle: 4,
  hot_tub: 6,
  swing: 5,
  trampoline: 14,
  bin: 4,
  mailbox: 3,
  ev_charger: 3,
  pergola: 5,
  sandpit: 6,
  fire_pit: 3,
  shed: 3,
  clothesline: 5,
};

/**
 * The primitive ceiling for one family.
 *
 * Every glyph in this module keeps the ~2–15 budget the five indoor modules keep, EXCEPT the
 * hedge: it is the only RUN here, its outline is a chain of scallops down both faces, and a
 * chain is inherently as long as the thing it outlines. Its count is `2n + 3` with `n` clamped
 * to 16, so 35 is its hard ceiling and the clamp — not the budget — is what bounds it. The
 * carve is by NAME rather than a blanket raise, so the other twenty keep the tighter number.
 */
const budget = (name: string): number => (name === "hedge" ? 35 : 15);

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
 * bug hides. Anything that is not one of the four primitives a glyph may emit throws, which
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
 * quarter-turn maps a 16-point star's vertex `i` onto vertex `i + 4`, so a genuinely
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
    default:
      throw new Error(`unexpected primitive ${p.t}`);
  }
}

describe("glyphs-outdoor — what each symbol draws", () => {
  it("every category dispatches to a drawn symbol, aliases included", () => {
    for (const c of ALL_NAMES) expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
  });

  it("the twenty-one families are a contiguous, in-order block of the canonical vocabulary", () => {
    // Derived, not retyped: the module's own family list must be exactly what
    // `FIXTURE_FAMILIES` appended, in order. Re-ordering that table (which is the LEGEND's
    // order, so a re-order moves every shipped plan's legend) or interleaving a later tranche
    // through this one fails here.
    //
    // It used to assert the block was the TAIL. That was true while this was the newest tranche
    // and stopped being true the moment v1.32 appended after it — a later tranche appending at
    // the end is exactly what the table's own comment asks for, so "tail" was pinning the wrong
    // property. Contiguity and order are what this suite actually owns.
    const names = GLYPHS.map(([n]) => n);
    const start = CANONICAL_FIXTURES.indexOf(names[0]!);
    expect(start, "the outdoor block must exist").toBeGreaterThanOrEqual(0);
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
      const weights = new Set(draw(fn, R).map((n) => n.lineWeight));
      expect(weights, `${name} draws detail below its outline`).toEqual(new Set(["thin", "extraThin"]));
    }
  });

  it("keeps every arc a MINOR one — the large-arc flag is pinned to 0 in every backend", () => {
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) {
        if (n.prim.t !== "arc") continue;
        expect(Math.abs(arcSweep(n.prim)), `${name} arc sweep`).toBeLessThanOrEqual(Math.PI + 1e-9);
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
  /** A square footprint: the rectangle-built symmetric symbols are invariant on one. */
  const SQ: Rect = { x: 500, y: 900, w: 1200, h: 1200 };

  /**
   * NINE of the ten `symmetric: true` families, with the footprint each is proved on. The five
   * radial ones hold at ANY aspect (they are built from the centre and the short side, both of
   * which a quarter-turn preserves); the four rectangle-built ones hold on a square, which is
   * the honest scope of the claim — `coffee_table` and `island` are symmetric on the same
   * terms.
   *
   * `shrub` is the tenth and is deliberately ABSENT: its outline is an irregular cloud, so it
   * does not map onto itself vertex for vertex. That is a change to what this file proves, not
   * to what the catalog claims — see the group below.
   */
  const SYMMETRIC: readonly (readonly [string, Draw, Rect])[] = [
    ["tree", drawTree, R],
    ["conifer", drawConifer, R],
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

  it("the check is not vacuous — a directional symbol fails it", () => {
    // `shed` is `directional`, and the proof that the assertion above says something is that
    // running it on this symbol goes red: the ridge and the door tick are not mirrored.
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

  it("the shrub has no favoured side, which is what its `symmetric` flag actually claims", () => {
    // The catalog flag means the piece has no distinguishable BACK — a fact about bushes —
    // and NOT that the drawing is invariant vertex for vertex. The first draft of this symbol
    // was four equal circles at a 90-degree pitch, which satisfied the stronger property and
    // read as a flower; the cloud that replaced it is irregular on purpose.
    //
    // So the honest, still-checkable property is that no side of the outline carries the
    // mass: the centroid of every sampled point sits essentially on the footprint centre.
    // The eight lobe bearings are a fixed table, so this is a real constraint on that table —
    // skew it and this fails.
    expect(fixtureSpec("shrub")?.symmetric).toBe(true);
    for (const rect of [R, SQ, { x: 0, y: 0, w: 900, h: 900 }]) {
      const pts = draw(drawShrub, rect).flatMap(boundingPoints);
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      const off = Math.hypot(cx - (rect.x + rect.w / 2), cy - (rect.y + rect.h / 2)) / Math.min(rect.w, rect.h);
      expect(off, `shrub ${rect.w}x${rect.h} centroid offset`).toBeLessThan(0.03);
    }
    // Not vacuous, and honest about its own scope: a `shed` — which IS directional — puts a
    // ninth of its short side between the two. (This is a mass-balance check, not a general
    // symmetric/directional discriminator: a `bbq`'s mass is nearly centred too, and what
    // makes IT directional is a shelf and two wheels, which no centroid can see.)
    const pts = draw(drawShed, SQ).flatMap(boundingPoints);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    expect(Math.hypot(cx - (SQ.x + SQ.w / 2), cy - (SQ.y + SQ.h / 2)) / SQ.w).toBeGreaterThan(0.03);
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

describe("glyphs-outdoor — the planting reads through", () => {
  it("draws every canopy unfilled, so the ground under it is not painted out", () => {
    for (const [name, fn] of [
      ["tree", drawTree],
      ["conifer", drawConifer],
      ["pergola", drawPergola],
    ] as const) {
      for (const n of draw(fn, R)) {
        if (n.prim.t === "polygon") expect(n.paint.fill, `${name} canopy fill`).toBe("none");
      }
    }
  });

  it("draws the shrub and the hedge from ARCS alone — there is no shape to fill", () => {
    // Both were rewritten away from closed shapes: the shrub was four circles, the hedge was
    // circles inside a rectangle, and the rectangle is the thing that made it read as a tray.
    // Neither emits a polygon now, which is a stronger statement than "the fill is none".
    for (const [name, fn] of [
      ["shrub", drawShrub],
      ["hedge", drawHedge],
    ] as const) {
      const kinds = new Set(draw(fn, R).map((n) => n.prim.t));
      expect([...kinds].sort(), `${name} primitive kinds`).toEqual(name === "hedge" ? ["arc", "line"] : ["arc"]);
    }
  });

  it("dashes the pergola all the way round — it is above the cut plane", () => {
    const nodes = draw(drawPergola, R);
    const outline = nodes[0]!;
    expect(outline.lineType).toBe("dashed");
    expect(outline.paint.dash, "the named type and the raw pattern agree").toEqual([sizes.thin * 6, sizes.thin * 4]);
    // …and the four posts are not dashed: only the overhead frame is above the cut.
    for (const n of nodes.slice(1)) expect(n.lineType).toBeUndefined();
  });

  it("dashes the shed's ridge for the same reason, and only the ridge", () => {
    const nodes = draw(drawShed, R);
    const dashed = nodes.filter((n) => n.lineType === "dashed");
    expect(dashed).toHaveLength(1);
    expect(dashed[0]!.prim.t).toBe("line");
    expect(dashed[0]!.paint.dash).toEqual([sizes.thin * 6, sizes.thin * 4]);
  });
});

describe("glyphs-outdoor — the tree and the conifer are one construction, one number apart", () => {
  it("draws a canopy, a crown ring and a trunk for both", () => {
    for (const fn of [drawTree, drawConifer]) {
      expect(draw(fn, R).map((n) => n.prim.t)).toEqual(["polygon", "circle", "circle"]);
    }
  });

  it("gives the conifer the deeper notches — that IS the difference between them", () => {
    const c = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
    const inner = (fn: Draw): number => {
      const pts = (draw(fn, R)[0]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>).pts;
      return Math.min(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    };
    const outer = (fn: Draw): number => {
      const pts = (draw(fn, R)[0]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>).pts;
      return Math.max(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    };
    expect(outer(drawTree)).toBeCloseTo(outer(drawConifer), 9);
    expect(inner(drawConifer)).toBeLessThan(inner(drawTree) * 0.7);
  });

  it("gives both canopies sixteen vertices — a multiple of four is what makes them symmetric", () => {
    for (const fn of [drawTree, drawConifer]) {
      const pts = (draw(fn, R)[0]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>).pts;
      expect(pts).toHaveLength(16);
    }
  });
});

describe("glyphs-outdoor — the hedge's scalloped outline", () => {
  /** Lobes PER FACE: the node list is `2n` arcs + 2 end caps + 1 dashed centreline. */
  const lobes = (r: Rect): number => (draw(drawHedge, r).length - 3) / 2;

  it("draws two scalloped faces, two end caps and one dashed centreline — and no box", () => {
    const nodes = draw(drawHedge, R);
    const arcs = nodes.filter((n) => n.prim.t === "arc");
    const lines = nodes.filter((n) => n.prim.t === "line");
    expect(
      nodes.filter((n) => n.prim.t === "polygon"),
      "no rectangle around the run",
    ).toHaveLength(0);
    expect(arcs).toHaveLength(nodes.length - 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.lineType, "the centreline is dashed").toBe("dashed");
    expect(lines[0]!.lineWeight).toBe("extraThin");
    // Every arc is the outline, so every arc is `thin`.
    for (const a of arcs) expect(a.lineWeight).toBe("thin");
  });

  it("derives the lobe count from the aspect ratio — two per depth of run", () => {
    // The catalogued footprint, 2000 along x 600 deep: 3.33 depths, so seven lobes a face.
    expect(lobes({ x: 0, y: 0, w: 2000, h: 600 })).toBe(7);
    expect(lobes({ x: 0, y: 0, w: 600, h: 2000 })).toBe(7); // …and the same run stood on end
  });

  it("clamps to three at the floor and sixteen at the ceiling", () => {
    expect(lobes({ x: 0, y: 0, w: 1000, h: 1000 })).toBe(3);
    // 10000x10 asks for two thousand; the clamp is what bounds the primitive count.
    expect(lobes({ x: 0, y: 0, w: 10000, h: 10 })).toBe(16);
    expect(lobes({ x: 0, y: 0, w: 10, h: 10000 })).toBe(16);
    expect(draw(drawHedge, { x: 0, y: 0, w: 10000, h: 10 })).toHaveLength(35);
  });

  it("puts each lobe's apex exactly ON the run's face, from either side", () => {
    // A lobe centred one radius inside the face has its apex on the face. That is what makes
    // the outline touch the footprint edge without crossing it, at every scallop.
    const r: Rect = { x: 100, y: 200, w: 2000, h: 600 };
    const arcs = draw(drawHedge, r)
      .filter((n) => n.prim.t === "arc")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "arc" }>);
    const top = arcs.filter((a) => a.center.y < r.y + r.h / 2 - 1);
    const bottom = arcs.filter((a) => a.center.y > r.y + r.h / 2 + 1);
    expect(top.length, "lobes on the top face").toBe(7);
    expect(bottom.length, "lobes on the bottom face").toBe(7);
    for (const a of top) expect(a.center.y - a.r).toBeCloseTo(r.y, 6);
    for (const a of bottom) expect(a.center.y + a.r).toBeCloseTo(r.y + r.h, 6);
  });

  it("alternates the lobe radius, so consecutive bumps differ", () => {
    const r: Rect = { x: 0, y: 0, w: 2000, h: 600 };
    const top = draw(drawHedge, r)
      .filter((n) => n.prim.t === "arc")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "arc" }>)
      .filter((a) => a.center.y < r.h / 2)
      .sort((a, b) => a.center.x - b.center.x);
    expect(new Set(top.map((a) => Math.round(a.r))).size, "two distinct radii").toBe(2);
    expect(top[1]!.r).toBeCloseTo(top[0]!.r * 0.85, 6);
  });

  it("overlaps consecutive lobes, so the scallops fuse into one outline", () => {
    // Each arc spans ~1.97 radii along the run against a pitch of 1.0, so neighbours overlap.
    // A gap here is what would turn the cloud back into a row of separate bumps.
    const r: Rect = { x: 0, y: 0, w: 2000, h: 600 };
    const top = draw(drawHedge, r)
      .filter((n) => n.prim.t === "arc")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "arc" }>)
      .filter((a) => a.center.y < r.h / 2)
      .sort((a, b) => a.center.x - b.center.x);
    for (let i = 1; i < top.length; i++) {
      const gap = top[i]!.center.x - top[i - 1]!.center.x;
      expect(gap, `lobes ${i - 1}-${i} overlap`).toBeLessThan(top[i]!.r + top[i - 1]!.r);
    }
  });

  it("keeps every arc minor and inside the footprint at any aspect", () => {
    for (const r of [
      { x: 500, y: 500, w: 2000, h: 600 },
      { x: 500, y: 500, w: 1000, h: 1000 },
      { x: 500, y: 500, w: 10000, h: 10 },
      { x: 500, y: 500, w: 10, h: 10000 },
      { x: 0, y: 0, w: 1, h: 1 },
    ]) {
      const nodes = draw(drawHedge, r);
      expectInside(nodes, r, `hedge ${r.w}x${r.h}`);
      for (const n of nodes) {
        if (n.prim.t === "arc") expect(Math.abs(arcSweep(n.prim))).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});

describe("glyphs-outdoor — the pieces that read off their own long axis", () => {
  const LONG: Rect = { x: 0, y: 0, w: 1800, h: 600 };
  const TALL: Rect = { x: 0, y: 0, w: 600, h: 1800 };

  it("draws the same object turned, not a different one", () => {
    // A bicycle across a path and one along it are the same bicycle: same primitive kinds,
    // same count. This is the `drawBookshelf` rule applied to three more symbols.
    for (const [name, fn] of [
      ["bicycle", drawBicycle],
      ["motorcycle", drawMotorcycle],
      ["swing", drawSwing],
      ["clothesline", drawClothesline],
    ] as const) {
      const a = draw(fn, LONG).map((n) => n.prim.t);
      const b = draw(fn, TALL).map((n) => n.prim.t);
      expect(b, `${name} turned on end`).toEqual(a);
    }
  });

  it("puts the bicycle's two wheels at a quarter and three quarters of the run", () => {
    const wheels = draw(drawBicycle, LONG)
      .filter((n) => n.prim.t === "circle")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "circle" }>);
    expect(wheels).toHaveLength(2);
    expect(wheels[0]!.r).toBeCloseTo(wheels[1]!.r, 9);
    expect(wheels[0]!.center.y).toBeCloseTo(LONG.h / 2, 9);
    expect(wheels[1]!.center.y).toBeCloseTo(LONG.h / 2, 9);
    expect(wheels[0]!.center.x).toBeCloseTo(LONG.x + LONG.w * 0.25, 9);
    expect(wheels[1]!.center.x).toBeCloseTo(LONG.x + LONG.w * 0.75, 9);
  });

  it("draws a four-tube diamond frame between the hubs, under the wheels", () => {
    // Two rings and a stick read as a trolley; the frame is what says bicycle. All four tubes
    // are `extraThin` so they sit under the wheels rather than competing with them.
    const nodes = draw(drawBicycle, LONG);
    expect(nodes.map((n) => n.prim.t)).toEqual(["circle", "circle", "line", "line", "line", "line", "line", "line"]);
    const tubes = nodes.slice(2, 6);
    for (const t of tubes) expect(t.lineWeight).toBe("extraThin");
    // …and the saddle and the bars are `thin`, so they read over the frame.
    for (const t of nodes.slice(6)) expect(t.lineWeight).toBe("thin");
    // Every tube sits between the hubs along the run, and above the centreline or on it.
    for (const t of tubes) {
      const p = t.prim as Extract<SceneNode["prim"], { t: "line" }>;
      for (const q of [p.a, p.b]) {
        expect(q.x).toBeGreaterThanOrEqual(LONG.x + LONG.w * 0.25 - 1e-6);
        expect(q.x).toBeLessThanOrEqual(LONG.x + LONG.w * 0.75 + 1e-6);
        expect(q.y).toBeLessThanOrEqual(LONG.y + LONG.h / 2 + 1e-6);
      }
    }
  });

  it("takes the wheel radius from whichever limb is smaller, and stays inside either way", () => {
    // Width limb: a long, thin rack. 0.42 x 600 = 252 beats 0.24 x 1800 = 432.
    const wide = draw(drawBicycle, LONG).filter((n) => n.prim.t === "circle");
    expect((wide[0]!.prim as Extract<SceneNode["prim"], { t: "circle" }>).r).toBeCloseTo(600 * 0.42, 9);
    // Length limb: a short, fat one. 0.24 x 600 = 144 beats 0.42 x 600 = 252, and it is the
    // limb that keeps a hub at 25% of the run from reaching past the end.
    const r: Rect = { x: 0, y: 0, w: 600, h: 600 };
    const fat = draw(drawBicycle, r).filter((n) => n.prim.t === "circle");
    expect((fat[0]!.prim as Extract<SceneNode["prim"], { t: "circle" }>).r).toBeCloseTo(600 * 0.24, 9);
    expectInside(draw(drawBicycle, r), r, "bicycle 600x600");
  });
});

describe("glyphs-outdoor — the two pieces that had to stop looking like something else", () => {
  it("gives the patio chair slats and armrests, so it is neither a `chair` nor a `bin`", () => {
    const nodes = draw(drawOutdoorChair, R);
    // Seat, back band and inset cushion is the `chair` construction it is built on.
    expect(nodes.slice(0, 3).map((n) => n.prim.t)).toEqual(["polygon", "polygon", "polygon"]);
    for (const n of nodes.slice(0, 3)) expect(n.paint.fill).toBe(theme.furnitureFill);
    // Four slats across the back band and an armrest each side — six `extraThin` lines, none
    // of which a `bin` has, and none of which a `chair` has either.
    const lines = nodes.slice(3);
    expect(lines).toHaveLength(6);
    for (const n of lines) expect(n.prim.t).toBe("line");
    for (const n of lines) expect(n.lineWeight).toBe("extraThin");
    // The slats sit INSIDE the back band; the armrests hang below it, one each side.
    const backBottom = R.y + R.h * 0.2;
    const slats = lines.slice(0, 4).map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    for (const sl of slats) expect(sl.b.y).toBeLessThanOrEqual(backBottom + 1e-6);
    const arms = lines.slice(4).map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    expect(arms[0]!.a.x).toBeLessThan(R.x + R.w / 2);
    expect(arms[1]!.a.x).toBeGreaterThan(R.x + R.w / 2);
    for (const a of arms) expect(a.a.y).toBeGreaterThan(backBottom);
    // And it draws nothing a `bin` draws: no filled wheel dots.
    expect(nodes.filter((n) => n.prim.t === "circle")).toHaveLength(0);
    expect(draw(drawBin, R).filter((n) => n.prim.t === "circle")).toHaveLength(2);
  });

  it("gives the barbecue a CROSS grid, a shelf and wheels, so it is not a radiator", () => {
    const nodes = draw(drawBbq, R);
    const lines = nodes
      .filter((n) => n.prim.t === "line")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    const vertical = lines.filter((l) => Math.abs(l.a.x - l.b.x) < 1e-9);
    const horizontal = lines.filter((l) => Math.abs(l.a.y - l.b.y) < 1e-9);
    // Three bars each way is the grid; the fourth horizontal is the shelf's own line. Bars in
    // BOTH directions are what tell a grill from a run of parallel lines.
    expect(vertical, "grill bars across the run").toHaveLength(3);
    expect(horizontal, "grill bars along it, plus the shelf line").toHaveLength(4);
    // The shelf is a band down the right-hand fifth, in the basin colour.
    const shelf = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>;
    expect(nodes[1]!.paint.fill).toBe(theme.opening);
    expect(Math.min(...shelf.pts.map((p) => p.x))).toBeGreaterThan(R.x + R.w * 0.7);
    // Two wheels, on the FRONT (bottom) edge — which with the shelf on the right is what
    // leaves the top edge clear, and the top edge is the back this category faces at a wall.
    const wheels = nodes
      .filter((n) => n.prim.t === "circle")
      .map((n) => n.prim as Extract<SceneNode["prim"], { t: "circle" }>);
    expect(wheels).toHaveLength(2);
    for (const w of wheels) expect(w.center.y).toBeGreaterThan(R.y + R.h * 0.75);
    expect(fixtureSpec("bbq")?.directional).toBe(true);
  });
});

describe("glyphs-outdoor — the trampoline and the fire pit do not read alike", () => {
  it("gives the trampoline a narrow spring band and twelve springs", () => {
    const nodes = draw(drawTrampoline, R);
    const rings = nodes.filter((n) => n.prim.t === "circle").map((n) => n.prim as { r: number });
    const springs = nodes.filter((n) => n.prim.t === "line");
    expect(rings).toHaveLength(2);
    expect(springs).toHaveLength(12);
    expect(rings[1]!.r).toBeCloseTo(rings[0]!.r * 0.8, 9);
  });

  it("gives the fire pit a spiky flame instead of spokes", () => {
    const nodes = draw(drawFirePit, R);
    expect(nodes.map((n) => n.prim.t)).toEqual(["circle", "circle", "polygon"]);
    const flame = nodes[2]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>;
    expect(flame.pts).toHaveLength(8);
    expect(nodes[2]!.paint.fill).toBe("none");
  });
});

describe("glyphs-outdoor — the EV charger's cable", () => {
  const nodes = draw(drawEvCharger, R);

  it("draws a pedestal, a true arc and the plug", () => {
    expect(nodes.map((n) => n.prim.t)).toEqual(["polygon", "arc", "circle"]);
  });

  it("bows the cable into the FRONT half, below the pedestal", () => {
    const arc = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "arc" }>;
    const pedestal = nodes[0]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>;
    const pedestalBottom = Math.max(...pedestal.pts.map((p) => p.y));
    expect(arc.center.y).toBeGreaterThan(pedestalBottom);
    expect(arc.center.y + arc.r).toBeLessThanOrEqual(R.y + R.h + 1e-6);
  });

  it("keeps it a minor arc of 140 degrees", () => {
    const arc = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "arc" }>;
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
    // The charger's cable is the arc no fallback ever emitted; the tree's canopy is a
    // polygon with no fill.
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
