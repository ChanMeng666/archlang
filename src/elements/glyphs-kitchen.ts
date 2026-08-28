/**
 * Kitchen and utility plan symbols: the sink run, the worktop, the hob, the fridge, the
 * built-in appliances and the overhead cabinet.
 *
 * The four symbols that shipped before this module was written (sink, counter, stove,
 * fridge) started as verbatim moves out of `fixtures-glyphs.ts`; they are now REFINED —
 * every one draws more than it did, and their bytes move on purpose. What changed and why:
 *
 * - **A pen hierarchy.** The outline of a piece is `thin`; anything *inside* it — a nosing,
 *   a drain, a carcass line, a control rail — is `extraThin`. Before, a counter's nosing was
 *   drawn at the same weight as its own outline, so the slab read as two stacked boxes.
 * - **Round things are round.** A burner is a `circle` primitive, not the 24-gon
 *   `ellipsePoly` returns. Every backend already serializes `circle` natively (and
 *   `rotateNode` turns one by moving its centre), so this is a fidelity gain with no
 *   per-backend code — the same argument `door-panels.ts` makes for its own budget.
 * - **Filled shapes stay polygons.** A basin is a `roundedRectPoly`, not a path with a
 *   corner radius: there is no rounded-rect primitive and inventing one would need four
 *   backends to agree about it.
 *
 * ## The one absolute in this file
 *
 * Every measure below is a FRACTION of the footprint, so a symbol survives any size the
 * catalogue or an author gives it. {@link CABINET_PITCH_MM} is the single exception, and it
 * has to be: base cabinets come in 600 mm units, and the division ticks that make a counter
 * read as cabinetry rather than a plank are spaced by that real-world module, not by a
 * fraction of however long the run happens to be. It is guarded — see {@link drawCounter} —
 * so a legend swatch or any run under two modules simply has no ticks, rather than a dense
 * hatch of them.
 *
 * Symbols draw with their back (the side placed against a wall) along the TOP edge;
 * `furniture.render()` quarter-turns the result about the footprint centre. Every function
 * is a pure, deterministic function of (rect, theme, sizes) — no clock, no randomness — and
 * every one must survive a degenerate footprint (the `hasFixtureGlyph` probe asks with a
 * 1×1 rect, and the fuzz asks with 10000×10) without throwing or producing a NaN.
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import {
  centerOf,
  clamp,
  dashedPoly,
  ellipsePoly,
  insetRect,
  insetRectSides,
  rectPoly,
  roundedRectPoly,
  shortSide,
} from "./glyph-lib.js";

/**
 * The base-cabinet module, in millimetres — the one sanctioned absolute in this file.
 *
 * 600 mm is the near-universal carcass width (GB/T, DIN and the trade all land on it), and
 * a worktop's division ticks are only truthful at that pitch: they say "this run is five
 * cabinets", which a fractional spacing cannot.
 */
export const CABINET_PITCH_MM = 600;

/**
 * Hard ceiling on the number of division ticks any one run may draw.
 *
 * A counter longer than 64 modules (38.4 m) is not a kitchen; it is a fuzz sample or a typo.
 * The cap keeps the primitive count bounded for any footprint rather than trusting the
 * caller's arithmetic — the same reason the repeat count is derived and clamped instead of
 * looped to the rect's edge.
 */
const MAX_DIVISIONS = 64;

/**
 * An unfilled `extraThin` rectangle inset from `r` by `frac` of its short side — the carcass
 * line that makes an appliance read as a box with a door rather than a blank slab.
 *
 * Unfilled on purpose: it is drawn OVER the body polygon, so a fill would repaint it and
 * hide anything already drawn underneath.
 *
 * Kitchen-local on purpose: unlike the geometry helpers this module used to carry, it is not a
 * shape but an appliance-drawing convention, and it has one domain.
 */
function insetOutline(g: GlyphCtx, r: Rect, frac: number): void {
  g.poly(rectPoly(insetRect(r, frac)), "none", "extraThin");
}

// ---------------------------------------------------------------------------
// Kitchen

/**
 * Counter slab, two eased basins each with a drain, and a tap with its spout at the back.
 *
 * The tap's radius is keyed to the SHORT side, not to the width the drafting convention
 * would suggest: on a 3 m × 600 mm sink run `0.03 × w` is a 90 mm disc that hangs clean off
 * the back edge of its own footprint.
 */
export function drawKitchenSink(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  g.poly(rectPoly(r), g.body);

  const m = shortSide(r) * 0.14;
  const bw = (r.w - 3 * m) / 2;
  const bh = r.h - 2 * m - r.h * 0.12;
  const by = r.y + m + r.h * 0.12;
  const bowlRad = Math.min(bw, bh) * 0.08;
  const drainR = Math.min(bw, bh) * 0.12;
  for (const bx of [r.x + m, r.x + 2 * m + bw]) {
    const bowl: Rect = { x: bx, y: by, w: bw, h: bh };
    g.poly(roundedRectPoly(bowl, bowlRad), g.basin);
    g.dot(centerOf(bowl), drainR, g.body, "extraThin");
  }

  const tapR = shortSide(r) * 0.03;
  const tapCy = r.y + r.h * 0.06;
  g.dot({ x: cx, y: tapCy }, tapR);
  g.seg({ x: cx, y: tapCy }, { x: cx, y: r.y + r.h * 0.28 }, "extraThin");
  return g.nodes;
}

/**
 * A worktop: the slab, an `extraThin` nosing line set in from the front edge, and one
 * division tick per base-cabinet module below it.
 *
 * The ticks are what distinguish a run of cabinetry from a plank, and they are the one place
 * this file measures in real millimetres ({@link CABINET_PITCH_MM}). The guard is the point
 * of the design: a run shorter than TWO modules gets none, so a legend swatch — which is
 * drawn at whatever size the legend cell is — degrades to the plain symbol instead of
 * turning into a comb. Tick `k` sits strictly inside the run, so the last one never lands on
 * the front-right corner and doubles the outline.
 */
export function drawCounter(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const nosingY = r.y + r.h * 0.82;
  g.seg({ x: r.x, y: nosingY }, { x: r.x + r.w, y: nosingY }, "extraThin");

  if (Number.isFinite(r.w) && r.w / CABINET_PITCH_MM >= 2) {
    const count = Math.min(Math.ceil(r.w / CABINET_PITCH_MM) - 1, MAX_DIVISIONS);
    for (let k = 1; k <= count; k++) {
      const x = r.x + k * CABINET_PITCH_MM;
      g.seg({ x, y: r.y }, { x, y: nosingY }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * A hob: the slab, four burners as concentric true circles, and the control rail across the
 * front.
 *
 * Each burner is an outline ring at `thin` with an `extraThin` inner ring at 0.6 of it —
 * the pan-support read. They were 24-gons filled white; a `circle` primitive is exact at any
 * zoom and native in the CAD export.
 */
export function drawStove(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const br = shortSide(r) * 0.16;
  for (const bx of [r.x + r.w * 0.3, r.x + r.w * 0.7]) {
    for (const by of [r.y + r.h * 0.3, r.y + r.h * 0.7]) {
      g.ring({ x: bx, y: by }, br);
      g.ring({ x: bx, y: by }, br * 0.6, "extraThin");
    }
  }
  const railY = r.y + r.h * 0.92;
  g.seg({ x: r.x, y: railY }, { x: r.x + r.w, y: railY }, "extraThin");
  return g.nodes;
}

/**
 * A fridge-freezer: the carcass, its door face, the compartment split, and the handle bar.
 *
 * The split is placed by ASPECT, at 30% of whichever run it divides — down the width of a
 * side-by-side, across the depth of an upright with a freezer drawer behind the door. Both
 * are real appliances and the footprint is the only evidence available about which one an
 * author meant, so the drawing reads the footprint rather than picking one and being wrong
 * half the time. `r.w * 10 >= r.h * 14` is the same integer form the basin's
 * double-bowl rule uses, for the same reason: `1.4 * h` is not representable, so the round
 * number an author types at the boundary would fall on the wrong side of its own rule.
 *
 * The door face — a light line just inside the front edge — is what stops the carcass
 * reading as a blank slab. It is `extraThin`, one step under the split, which is the pen
 * hierarchy this module's header describes: the split is a real joint between two doors,
 * the face is a surface.
 */
export function drawFridge(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.05);
  const faceY = r.y + r.h * 0.8;
  g.seg({ x: r.x, y: faceY }, { x: r.x + r.w, y: faceY }, "extraThin");
  if (r.w * 10 >= r.h * 14) {
    const x = r.x + r.w * 0.3;
    g.seg({ x, y: r.y }, { x, y: faceY });
  } else {
    const y = r.y + r.h * 0.3;
    g.seg({ x: r.x, y }, { x: r.x + r.w, y });
  }
  const barY = r.y + r.h * 0.91;
  g.seg({ x: r.x + r.w * 0.34, y: barY }, { x: r.x + r.w * 0.66, y: barY });
  return g.nodes;
}

/**
 * An oven: the carcass, three control knobs on the back edge, and the door across the front
 * with its window and its handle bar — **plus four burners when the footprint is wide
 * enough to be a range** rather than a built-under single.
 *
 * The wide branch is not decoration. A 600 mm oven and a 900 mm range cooker are different
 * appliances, they are drawn differently on a real plan, and the footprint is the one thing
 * that tells them apart in a language where the fixture word does not. `r.w * 10 >= r.h * 16`
 * (aspect 1.6) is the threshold; below it the piece is an oven and the back band carries the
 * knobs alone, above it the knobs move to a rail between the hob and the door.
 *
 * Every offset from an edge is a fraction of the SHORT side, never of the axis it sits on —
 * so a knob 0.13 of the short side down from the back edge cannot escape a 10000 x 10
 * footprint, which keying it to `r.h` would not survive.
 */
export function drawOven(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const range = r.w * 10 >= r.h * 16;
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);

  if (range) {
    // The hob: four burners over the back half, as concentric-free single rings — the
    // double ring is `drawStove`'s, and a range must not read as a hob sitting on a box.
    const br = Math.min(s * 0.09, r.w * 0.1, r.h * 0.1);
    for (const fx of [0.28, 0.72]) {
      for (const fy of [0.14, 0.34]) g.ring({ x: r.x + r.w * fx, y: r.y + r.h * fy }, br);
    }
  }

  // The knobs: on the back edge of an oven, on a rail below the hob of a range.
  const knobR = Math.min(s * 0.055, r.w * 0.06, r.h * 0.06);
  const knobY = range ? r.y + r.h * 0.52 : r.y + s * 0.13;
  for (const f of [0.34, 0.5, 0.66]) g.dot({ x: r.x + r.w * f, y: knobY }, knobR, g.body, "extraThin");

  // The door: the seam across the front, the window inside it, and the handle bar.
  const doorY = r.y + r.h * 0.84;
  g.seg({ x: r.x, y: doorY }, { x: r.x + r.w, y: doorY }, "extraThin");
  const win = range ? insetRectSides(r, 0.2, 0.2, 0.62, 0.22) : insetRectSides(r, 0.2, 0.2, 0.3, 0.24);
  g.poly(roundedRectPoly(win, shortSide(win) * 0.14), g.basin, "extraThin");
  const barY = r.y + r.h * 0.92;
  g.seg({ x: r.x + r.w * 0.14, y: barY }, { x: r.x + r.w * 0.86, y: barY });
  return g.nodes;
}

/**
 * A dishwasher: the carcass, two basket lines across the tub, and the door leaf on the front
 * with its control strip and centred handle.
 *
 * It used to be a box with a dial in the middle of it, which is a washing machine's drawing
 * and not a dishwasher's — the two stand side by side under the same worktop and the dial
 * was the only mark on either. What separates them now is where the detail SITS: a
 * dishwasher's is a door leaf on the front edge and racks behind it, a washer's is a drum
 * about its own centre.
 *
 * The door is on the FRONT (the bottom edge), which is the side a dishwasher opens to and
 * the opposite of the wall its services run in. Under this module's back-on-top convention
 * the wall is the top edge, so the leaf falls where a plan draws it and the derived
 * quarter-turn from `against wall` aims it into the room.
 */
export function drawDishwasher(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);
  for (const f of [0.3, 0.5]) {
    const y = r.y + r.h * f;
    g.seg({ x: r.x + r.w * 0.16, y }, { x: r.x + r.w * 0.84, y }, "extraThin");
  }
  const door = insetRectSides(r, 0.06, 0.06, 0.7, 0.04);
  g.poly(rectPoly(door), g.basin, "extraThin");
  const stripY = door.y + door.h * 0.34;
  g.seg({ x: door.x, y: stripY }, { x: door.x + door.w, y: stripY }, "extraThin");
  const cx = r.x + r.w / 2;
  const handleY = r.y + r.h * 0.94;
  g.seg({ x: cx - r.w * 0.1, y: handleY }, { x: cx + r.w * 0.1, y: handleY });
  return g.nodes;
}

/**
 * A kitchen island: the worktop with its corners eased, the seating overhang along the
 * front, cabinet ticks under it, and — **by aspect** — either a hob or a sink at one end.
 *
 * The old symbol was a slab with a nosing on all four sides, which is a box inside a box:
 * at plan scale it read as an empty table, and nothing about it said kitchen. The three
 * things that do say kitchen are here instead. The **overhang on one long side** is what an
 * island is for — the side you sit at — and it is what distinguishes this from
 * {@link drawCounter}, which noses its front because it has a wall behind it. The **ticks**
 * below the overhang are the carcass under the top, drawn at fixed thirds rather than on
 * {@link CABINET_PITCH_MM}: an island's run is set by the room, not by a module, and three
 * ticks read as legs at any length while a pitch-derived comb does not.
 *
 * The **end fitting** follows the footprint, on the same evidence-not-guess rule
 * {@link drawOven}'s range branch follows: a long island (aspect 1.8 or over, written
 * `r.w * 10 >= r.h * 18`) is a run with a hob dropped into it; a compact one is the
 * prep island with a bowl. Neither is invented — the alternative is one drawing that is
 * wrong for the other half of the islands anyone draws.
 *
 * **This symbol is no longer rotation-symmetric, and the catalog says so.** `island` used to
 * carry `symmetric: true` and the four-sided nosing made that true. A seating side is a
 * distinguishable front, so the flag came off. Nothing observable moved with it:
 * `orientationMatters` reads `(requiresWall || directional) && !symmetric`, and an island is
 * neither wall-requiring nor directional, so it still derives no rotation and still never
 * trips `W_FIXTURE_BACK_TO_ROOM` — pinned by `test/fixture-orientation.test.ts`.
 */
export function drawIsland(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(roundedRectPoly(r, s * 0.06), g.body);
  const nosingY = r.y + r.h * 0.78;
  g.seg({ x: r.x, y: nosingY }, { x: r.x + r.w, y: nosingY }, "extraThin");
  for (const f of [0.25, 0.5, 0.75]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: nosingY }, { x, y: r.y + r.h }, "extraThin");
  }
  if (r.w * 10 >= r.h * 18) {
    const br = Math.min(s * 0.13, r.w * 0.08, r.h * 0.13);
    for (const fx of [0.12, 0.32]) {
      for (const fy of [0.28, 0.6]) g.ring({ x: r.x + r.w * fx, y: r.y + r.h * fy }, br);
    }
  } else {
    const bowl: Rect = { x: r.x + r.w * 0.08, y: r.y + r.h * 0.14, w: r.w * 0.4, h: r.h * 0.46 };
    g.poly(roundedRectPoly(bowl, shortSide(bowl) * 0.12), g.basin);
    g.dot(centerOf(bowl), shortSide(bowl) * 0.1, g.body, "extraThin");
  }
  return g.nodes;
}

/**
 * An upper (wall) cabinet — the ONLY glyph in this file whose every node is dashed, and
 * since this pass one that reads as cabinetry rather than as a hole in the drawing.
 *
 * A wall cabinet hangs above the horizontal cut a floor plan is taken at, so drafting
 * convention draws it dashed: present, but not cut. Every node carries `lineType: "dashed"`,
 * and the body is unfilled so the base cabinet or appliance it overhangs still reads through
 * it — which is the entire reason the convention exists.
 *
 * What it gained: **door splits on {@link CABINET_PITCH_MM}**, guarded exactly as
 * {@link drawCounter}'s division ticks are (a run under two modules draws none, so a legend
 * swatch degrades to the plain outline instead of a comb), and **a hinge tick at each end of
 * the back edge**. The old single mid-depth line was neither of those things: it said
 * nothing about how many doors the run has, and on a 600 mm cabinet it split the box in half
 * the wrong way. The hinge ticks are what stop the outline reading as a void — a dashed
 * empty rectangle on a plan is a `void`, and that is a different element.
 */
export function drawUpperCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  dashedPoly(g, rectPoly(r), "none");
  if (Number.isFinite(r.w) && r.w / CABINET_PITCH_MM >= 2) {
    const count = Math.min(Math.ceil(r.w / CABINET_PITCH_MM) - 1, MAX_DIVISIONS);
    for (let k = 1; k <= count; k++) {
      const x = r.x + k * CABINET_PITCH_MM;
      g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin", true);
    }
  }
  const tickY = r.y + r.h * 0.28;
  for (const f of [0.08, 0.92]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: r.y }, { x, y: tickY }, "extraThin", true);
  }
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Utility

/**
 * A washing machine: the carcass, the control panel across the back with its two knobs, and
 * the drum with a white porthole at its centre.
 *
 * The panel is the half of this drawing that is new, and it is what makes the appliance
 * legible as a machine rather than as a cupboard with a circle on it. It sits on the BACK
 * edge because that is where the controls are on a plan taken from above with the door
 * facing the room, and it is drawn in `g.basin` for the reason the barbecue's shelf is: a
 * second fill separates a sub-part from the body at plan scale, where a line alone closes up.
 *
 * The **porthole is a filled disc, not a ring**, and that is deliberate. {@link drawDryer} is
 * the same carcass at the same size standing next to it, and its drum is a ring with three
 * chords; two appliances that differ only in the count of concentric circles are two
 * appliances a reader has to measure. A white centre against three chords is a difference you
 * see without looking twice.
 *
 * Every radius is capped against BOTH axes, not just the short side, so the drum on a
 * 10000 x 10 footprint shrinks with the depth instead of escaping through the front edge.
 */
export function drawWasher(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);

  const panel = insetRectSides(r, 0.06, 0.06, 0.05, 0.79);
  g.poly(rectPoly(panel), g.basin, "extraThin");
  const knobR = Math.min(s * 0.05, panel.h * 0.4, panel.w * 0.08);
  const knobY = panel.y + panel.h / 2;
  for (const f of [0.68, 0.86]) g.dot({ x: r.x + r.w * f, y: knobY }, knobR, g.body, "extraThin");

  const drum = Math.min(s * 0.3, r.h * 0.34, r.w * 0.45);
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h * 0.6 };
  g.ring(c, drum);
  g.dot(c, drum * 0.55, g.basin, "extraThin");
  return g.nodes;
}

/**
 * A tumble dryer: the washer's carcass and door, with three chords across the drum where the
 * washer has a white porthole.
 *
 * The two appliances are the same box at the same size and sit side by side in most
 * utility rooms, so they need to differ by SHAPE — a glyph carries no text (the fixture
 * label is drawn by the caller, and only when there is no symbol), so a letter is not
 * available to tell them apart even if it were good drafting.
 */
export function drawDryer(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);
  const c = centerOf(r);
  const drum = shortSide(r) * 0.3;
  g.ring(c, drum);
  for (const f of [-0.45, 0, 0.45]) {
    const dy = drum * f;
    const half = Math.sqrt(Math.max(drum * drum - dy * dy, 0)) * 0.85;
    g.seg({ x: c.x - half, y: c.y + dy }, { x: c.x + half, y: c.y + dy }, "extraThin");
  }
  return g.nodes;
}

// ── v1.32 F1: kitchen & bath ──
//
// Five more kitchen and utility symbols. They are appended at the END of the module for the
// same reason `FIXTURE_FAMILIES` appends: reading order here follows the table's order, which
// is the LEGEND's order, and slotting a range hood in beside the wall cabinet it hangs above
// would put the two lists out of step for nothing.

/**
 * A laundry tub: the slab, ONE deep double-rimmed bowl, its waste, and the tap block with its
 * spout.
 *
 * The whole difference from {@link drawKitchenSink} is the count and the rim. A kitchen sink
 * is two bowls side by side; a laundry sink is one deep one, and the second rim inside it is
 * what says "deep" in a drawing that has no elevation to say it in. Both take a tap at the
 * back, because both are plumbed against a wall, and both hold their tap width against the
 * DEPTH so a long run does not grow a tap the size of a bowl.
 */
export function drawLaundrySink(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  g.poly(rectPoly(r), g.body);

  const bowl = insetRectSides(r, 0.1, 0.1, 0.26, 0.08);
  const rad = shortSide(bowl);
  g.poly(roundedRectPoly(bowl, rad * 0.1), g.basin);
  g.poly(roundedRectPoly(insetRect(bowl, 0.07), rad * 0.08), g.basin, "extraThin");
  g.dot(centerOf(bowl), rad * 0.1, g.body, "extraThin");

  const tapW = Math.min(r.w * 0.14, r.h * 0.3);
  const tapH = r.h * 0.1;
  g.poly(rectPoly({ x: cx - tapW / 2, y: r.y + r.h * 0.04, w: tapW, h: tapH }), g.body);
  g.seg({ x: cx, y: r.y + r.h * 0.14 }, { x: cx, y: r.y + r.h * 0.34 }, "extraThin");
  return g.nodes;
}

/**
 * A water heater / boiler: the cylinder in plan, its inner shell, and two pipe ticks running
 * back to the wall.
 *
 * A cylinder seen from above is a circle, and a circle alone is a `fire_pit` or a `stool`.
 * The pipes are what make it a service: two short runs from the vessel to the back edge, the
 * one thing on this drawing that says the piece is connected to something. They also give the
 * symbol a back, which is why the catalog leaves it un-`symmetric` even though its outline
 * would map onto itself — `against wall` then derives a quarter-turn that puts the pipes into
 * the wall rather than into the room.
 *
 * The vessel is pushed toward the FRONT (`r.h - s * 0.5` from the top) so the pipe run has
 * somewhere to be — but only just far enough. Keying that offset to the short side rather
 * than to `r.h` is what keeps the circle inside a footprint of any aspect: the centre is at
 * most `0.5 s` above the bottom edge and the radius is `0.38 s`, so the two cannot cross
 * either way. The first draft pushed it to `0.42 s`, which left the pipes standing clear of
 * the vessel for a third of the footprint and reading as antennae rather than as a flue.
 */
export function drawWaterHeater(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const rad = s * 0.38;
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h - s * 0.5 };
  g.dot(c, rad, g.body);
  g.ring(c, rad * 0.62, "extraThin");
  for (const f of [-0.3, 0.3]) {
    const x = c.x + rad * f;
    g.seg({ x, y: r.y }, { x, y: c.y - rad * 0.45 }, "extraThin");
  }
  return g.nodes;
}

/**
 * An extract hood over a hob: the outline, the fan ring, four blade radials and the hub —
 * **every one of them dashed**, because a hood hangs above the cut plane exactly as
 * {@link drawUpperCabinet} does.
 *
 * That makes this the module's second dashed symbol, and the convention is now the drawing's
 * rather than one glyph's: a dashed outline means a thing above the cut plane, which
 * `upper_cabinet`, `roof`, `void`, the outdoor `pergola`/`shed` and the garage door's
 * projection all already say. The two are told apart by what is INSIDE the outline — a
 * cabinet's door splits run edge to edge, a hood's fan is a ring about the centre — and the
 * fan is drawn as an `ellipsePoly` through {@link dashedPoly} rather than as a `circle`
 * because {@link GlyphCtx.ring} has no dashed form and inventing one would put a dash pattern
 * on a primitive four backends serialize differently.
 */
export function drawRangeHood(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.34;
  dashedPoly(g, rectPoly(r), "none");
  dashedPoly(g, ellipsePoly(c.x, c.y, rad, rad), "none", "extraThin");
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    g.seg(c, { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) }, "extraThin", true);
  }
  dashedPoly(g, ellipsePoly(c.x, c.y, rad * 0.22, rad * 0.22), "none", "extraThin");
  return g.nodes;
}

/**
 * A microwave: the carcass, the door window over the left three-quarters, and three buttons
 * down the control panel on the right.
 *
 * The asymmetry IS the symbol. A microwave is a small box, and a small box on a worktop is
 * indistinguishable from every other small box unless something says which end the door is —
 * so the window is set to one side and the buttons fill the other, which is what every one of
 * them actually looks like. That asymmetry is also what earns the `directional` flag: the
 * back has a vent and belongs against something.
 *
 * The button radius is capped against BOTH axes and their spread is keyed to the SHORT side,
 * so the column stays on the panel at any aspect instead of running off the front edge.
 */
export function drawMicrowave(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.07);
  const win = insetRectSides(r, 0.12, 0.3, 0.22, 0.22);
  g.poly(roundedRectPoly(win, shortSide(win) * 0.12), g.basin, "extraThin");
  const btnR = Math.min(s * 0.055, r.w * 0.05, r.h * 0.1);
  const bx = r.x + r.w * 0.86;
  for (const k of [-1, 0, 1]) g.dot({ x: bx, y: r.y + r.h / 2 + k * s * 0.16 }, btnR, g.body, "extraThin");
  return g.nodes;
}

/**
 * A bar counter: the top, the seating overhang along the front, and one stool ring per
 * roughly 1.2 counter-depths of run.
 *
 * The stools are the point. A bar drawn as a slab with a nosing is a `counter`, and the
 * language already has that word; what makes a bar a bar is that you sit at it. Deriving the
 * count from the run rather than fixing it means a 1.8 m bar draws four stools and a 4 m bar
 * draws eight, which is the arrangement in both cases — and it means an author who has not
 * placed individual `stool` pieces still gets a drawing that reads.
 *
 * `clamp((r.w / r.h) * 1.2, 1, 8)` is the count, and every part of it is load-bearing. The
 * ratio is the FRONT's length against the depth, so it is scale-free. The floor of 1 is what
 * a legend swatch and the `hasFixtureGlyph` 1x1 probe get. The ceiling of 8 is what keeps the
 * primitive budget bounded on a fuzz sample. And {@link clamp} resolves `NaN` to its low
 * bound, so a zero-by-zero footprint draws one stool rather than looping on a `NaN` count.
 *
 * The seat radius is capped at `0.4 * r.w / stools` as well as at the short side: at eight
 * stools the pitch is an eighth of the run, and a radius keyed to depth alone would have the
 * end seats hanging off the ends.
 */
export function drawBarCounter(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  // The worktop is the BACK 62% of the footprint; the front band is the floor you stand a
  // stool on. Filling the whole rect and then drawing rings on it — the first draft — made
  // the stools read as holes cut in the slab.
  g.poly(rectPoly({ x: r.x, y: r.y, w: r.w, h: r.h * 0.62 }), g.body);
  const overhangY = r.y + r.h * 0.44;
  g.seg({ x: r.x, y: overhangY }, { x: r.x + r.w, y: overhangY }, "extraThin");

  const stools = Math.round(clamp((r.w / r.h) * 1.2, 1, 8));
  const seat = Math.min(s * 0.14, (r.w * 0.4) / stools);
  const cy = r.y + r.h - s * 0.2;
  for (let k = 0; k < stools; k++) {
    g.ring({ x: r.x + (r.w * (k + 0.5)) / stools, y: cy }, seat, "extraThin");
  }
  return g.nodes;
}
