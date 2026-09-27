/**
 * `stair`, `escalator` and `elevator` under the whole group D4: a placed run is entered
 * from the IMAGE of its authored entry edge, and its symbol is the image of its drawing.
 *
 * For every run shape (portrait up/down, landscape, SQUARE, escalator, lift) and all eight
 * elements g: `entryEdges(gP) = g · entryEdges(P₀)` (the nav grid's open sides), and the
 * run's primitives in gP — footprint, treads, break line, arrow, UP/DN word, chevrons —
 * are g applied to P₀'s, compared orientation-free through the oracle's `canonPrim`.
 * The square footprint is the case `flightAxis` cannot answer (its tie reads portrait
 * whichever way the frame turned it); `runAxis` reads the carried tail instead.
 *
 * Also: nesting composes (`place` inside `place` equals the flat composed frame), and a
 * frame followed by its inverse restores the root rule exactly (`_tail` back to the local
 * edge, `_mirror` gone). Backlog E.2 / E.3.
 */

import { describe, expect, it } from "vitest";
import { composeFrame, inverse, makeFrame, transformElement } from "../src/frame.js";
import type { RStair } from "../src/ir.js";
import { entryEdges, type RVertical, runAxis, tailEdge, verticalsOf } from "../src/vertical.js";
import {
  canonPrim,
  D4_ELEMENTS,
  frameFor,
  type GroupElement,
  lin,
  observe,
  sceneOf,
  transformPrim,
  witnessPair,
} from "./d4-oracle.js";

type Edge = "top" | "right" | "bottom" | "left";
const NORMAL: Record<Edge, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const edgeOf = (v: { x: number; y: number }): Edge =>
  (Object.keys(NORMAL) as Edge[]).find((e) => NORMAL[e].x === v.x && NORMAL[e].y === v.y)!;

/** A shell room holding one run. */
const body = (run: string): string =>
  `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
    room id=r at (0,0) size 6000x5000 label "Hall"
    door id=d at (3000,5000) width 900 wall shell
    ${run}`;

const CASES: readonly { name: string; kind: RVertical["kind"]; run: string }[] = [
  { name: "portrait stair, up", kind: "stair", run: "stair id=v at (1000,500) size 1200x3000 dir up" },
  { name: "portrait stair, down", kind: "stair", run: "stair id=v at (1000,500) size 1200x3000 dir down" },
  { name: "landscape stair", kind: "stair", run: "stair id=v at (500,1000) size 3000x1200 dir up" },
  { name: "square stair", kind: "stair", run: "stair id=v at (1000,1000) size 2000x2000 dir up width 1400" },
  { name: "escalator", kind: "escalator", run: "escalator id=v at (1000,500) size 1200x3000 dir up" },
  { name: "elevator", kind: "elevator", run: "elevator id=v at (1000,1000) size 1800x1500" },
];

const runOf = (src: string): RVertical => verticalsOf(observe(src).ir!)[0]!;

/** Every primitive the run draws (including its UP/DN word), canonical, sorted. */
const prims = (src: string, kind: string, f?: ReturnType<typeof frameFor>): string[] =>
  sceneOf(src)
    .nodes.filter((n) => n.elementKind === kind)
    .map((n) => canonPrim(f ? transformPrim(f, n.prim) : n.prim))
    .sort();

describe("vertical runs under D4: the entry edge and the symbol follow the frame", () => {
  for (const c of CASES) {
    for (const g of D4_ELEMENTS) {
      it(`${c.name} × ${g.name}`, () => {
        const f = frameFor(g, 50);
        const { p0, gP } = witnessPair(body(c.run), g, { fixedSheet: true });
        const v0 = runOf(p0);
        const vG = runOf(gP);
        expect(vG.kind).toBe(c.kind);
        // The nav grid's open sides: g · entryEdges(P₀), in order (tail first).
        expect(entryEdges(vG)).toEqual(entryEdges(v0).map((e) => edgeOf(lin(f, NORMAL[e]))));
        // The drawing: g applied to every primitive of P₀'s run.
        const expected = prims(p0, c.kind, f);
        expect(expected.length).toBeGreaterThan(c.kind === "elevator" ? 2 : 6);
        expect(prims(gP, c.kind)).toEqual(expected);
      });
    }
  }

  it("is not vacuous: the fixed page rule disagrees with the carried tail on most of the grid", () => {
    // Strip `_tail` and ask the root rule: where it differs, the old code drew the arrow (and
    // opened the nav grid) on the wrong side, and the cases above would have failed.
    let differs = 0;
    for (const c of CASES) {
      for (const g of D4_ELEMENTS) {
        const vG = runOf(witnessPair(body(c.run), g).gP);
        const { _tail: _t, ...root } = vG as RVertical & { _tail?: Edge };
        if (tailEdge(root as RVertical) !== tailEdge(vG)) differs++;
      }
    }
    expect(differs).toBeGreaterThan(CASES.length * 3);
  });

  it("a SQUARE footprint runs along its carried tail, not along flightAxis's portrait tie", () => {
    const { gP } = witnessPair(body(CASES[3]!.run), D4_ELEMENTS.find((g) => g.name === "r90")!);
    const v = runOf(gP);
    expect(v.size.w).toBe(v.size.h);
    expect(tailEdge(v)).toBe("left");
    expect(runAxis(v)).toBe("x");
  });

  it("only a REFLECTED stair carries `_mirror`, and the root carries neither internal field", () => {
    for (const g of D4_ELEMENTS) {
      const { p0, gP } = witnessPair(body(CASES[0]!.run), g);
      const s = runOf(gP) as RStair;
      expect(s._mirror === true, g.name).toBe(g.mirror === "x");
      expect("_tail" in runOf(p0), "P₀ is placed at the identity, so it carries its own edge").toBe(true);
    }
    const root = `plan "p" {\n  units mm\n${body(CASES[0]!.run)}\n}`;
    const s = runOf(root) as RStair;
    expect("_tail" in s || "_mirror" in s).toBe(false);
  });
});

describe("vertical runs: the carried facts compose like the frame", () => {
  const spell = (g: GroupElement) => `${g.rotate ? ` rotate ${g.rotate}` : ""}${g.mirror ? ` mirror ${g.mirror}` : ""}`;
  const frameOf = (g: GroupElement) =>
    makeFrame({
      origin: { x: 0, y: 0 },
      rotate: g.rotate,
      ...(g.mirror ? { mirror: g.mirror } : {}),
      prefix: "",
      component: "",
    });

  it("place outer() ∘ place inner() draws and enters the run exactly as the flat composed place", () => {
    for (const c of [CASES[0]!, CASES[3]!, CASES[4]!]) {
      for (const outer of D4_ELEMENTS) {
        for (const inner of D4_ELEMENTS) {
          const composed = composeFrame(frameOf(outer), frameOf(inner));
          const flat = { name: "", rotate: composed.rotate, ...(composed.mirror ? { mirror: composed.mirror } : {}) };
          const sheet = "  paper A0 landscape\n  scale 1:100\n";
          const inr = `  component inner() {\n${body(c.run)}\n  }`;
          const nested = `plan "n" {\n  units mm\n  grid 50\n${sheet}${inr}\n  component outer() {\n    place inner() as i at (0,0)${spell(inner)}\n  }\n  place outer() as g at (0,0)${spell(outer)}\n}\n`;
          const flatSrc = `plan "n" {\n  units mm\n  grid 50\n${sheet}${inr}\n  place inner() as g at (0,0)${spell(flat as GroupElement)}\n}\n`;
          const tag = `${c.name}: ${outer.name} ∘ ${inner.name}`;
          expect(entryEdges(runOf(nested)), tag).toEqual(entryEdges(runOf(flatSrc)));
          expect((runOf(nested) as RStair)._mirror, tag).toBe((runOf(flatSrc) as RStair)._mirror);
          expect(prims(nested, c.kind), tag).toEqual(prims(flatSrc, c.kind));
        }
      }
    }
  });

  it("a frame then its inverse restores the local edge and drops `_mirror` (two reflections cancel)", () => {
    const local: RStair = {
      kind: "stair",
      id: "s",
      at: { x: 1000, y: 500 },
      size: { w: 1200, h: 3000 },
      dir: "down",
      width: 1200,
    };
    for (const g of D4_ELEMENTS) {
      const f = makeFrame({
        origin: { x: 700, y: -300 },
        rotate: g.rotate,
        ...(g.mirror ? { mirror: g.mirror } : {}),
        prefix: "",
        component: "",
      });
      const there = transformElement(f, local) as RStair;
      const back = transformElement(inverse(f), there) as RStair;
      expect(back._tail, g.name).toBe(tailEdge(local));
      expect("_mirror" in back, g.name).toBe(false);
      expect({ x: back.at.x + 0, y: back.at.y + 0 }).toEqual(local.at); // `+ 0` folds a −0
      expect(back.size).toEqual(local.size);
    }
  });
});
