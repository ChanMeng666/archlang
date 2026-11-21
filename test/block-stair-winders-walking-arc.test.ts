/**
 * The walking line over a winder landing is the arc lint credits (backlog ST.2).
 *
 * Lint credits a winder landing with the whole goings that fit on the quarter arc of radius
 * `width / 2` round its inner corner (`winderGoings`, `src/lint/rules/stairs.ts`). The glyph drew
 * that stretch of the walking line as one straight chord, about 0.707 × `width` against the arc's
 * 0.785, so the drawing and the lint read two lengths. It now draws the arc. Expectations are
 * derived from the plain numbers of `test/tables/block-stair-plans.ts`, never from the resolver.
 *
 * **The law.** A drawing change moves the drawing only. Each row of `LAW` is a plan that writes
 * `winders` (`test/helpers/block-stair-winders-drawn.ts`) with two digests:
 *
 *  - `semantic`: {@link semanticDigestWith} (`describe()` and `lint()`, no drawing), **measured
 *    against `src/` at `b40b01c6`** (`main` before the arc), that tree extracted by `git archive`
 *    and handed this suite's own digest body and these very rows. It did not move. On the same two
 *    trees `compile().diagnostics` and `describe()` with `facts: ["symmetry", "syntax"]` were
 *    compared row by row and are equal too.
 *  - `whole`: {@link allStoreysDigestWithDiagnostics} (every storey's SVG, `describe()`, `lint()`,
 *    `compile().diagnostics`) with the arc drawn. Every row moved from its value at `b40b01c6`, by
 *    one element per winder landing: the chord's `<line>` became the arc's `<path>`, in place.
 *
 * A plan that writes no `winders` is pinned by `block-stair-winders-byte-identity.test.ts`, whose
 * 23 rows were measured before the clause existed and do not move here.
 *
 * A digest here moving is a finding to explain before it is a diff to re-measure.
 */

import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { winderGoings } from "../src/lint/rules/stairs.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { SceneNode, ScenePrim } from "../src/scene.js";
import { MAX_WINDERS, verticalsOf } from "../src/vertical.js";
import {
  type CompilerApi,
  allStoreysDigestWithDiagnostics,
  semanticDigestWith,
} from "./helpers/byte-identity-digest.js";
import { winderDrawnRows, winderStairBlock } from "./helpers/block-stair-winders-drawn.js";
import { hallPlan, L_STAIR, planOf, THREE_FLIGHTS } from "./tables/block-stair-plans.js";

const API: CompilerApi = { compile, describe: describePlan, lint };

type P = { x: number; y: number };
type ArcPrim = Extract<ScenePrim, { t: "arc" }>;
/** One stroke of the stair's symbol: a straight line or an arc, with its pen. */
type Stroke = { a: P; b: P; ink: string | undefined; arc?: ArcPrim };

const stairNodes = (src: string): SceneNode[] =>
  compile(src, { noCache: true }).scene!.nodes.filter((n) => n.layerName === "A-FLOR-STRS");

/** The stair's strokes in drawing order. */
const strokesOf = (src: string): Stroke[] =>
  stairNodes(src).flatMap((n): Stroke[] =>
    n.prim.t === "line"
      ? [{ a: n.prim.a, b: n.prim.b, ink: n.paint.stroke }]
      : n.prim.t === "arc"
        ? [{ a: n.prim.start, b: n.prim.end, ink: n.paint.stroke, arc: n.prim }]
        : [],
  );

const arcsOf = (src: string): ArcPrim[] => strokesOf(src).flatMap((s) => (s.arc ? [s.arc] : []));

/** The walking line: the strokes in the symbol ink (the pen of the last stroke, a barb), without
 *  the arrowhead's two barbs. The treads, the winder fan and the break line are the lighter pen. */
const walkOf = (src: string): Stroke[] => {
  const all = strokesOf(src);
  return all.filter((s) => s.ink === all[all.length - 1]!.ink).slice(0, -2);
};

/** A stroke's length as drawn: a quarter arc's is `π/2 × r`. */
const drawn = (s: Stroke): number => (s.arc ? (Math.PI / 2) * s.arc.r : Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y));

/** Is `arc` a quarter turn about its centre, with the sweep its own two radii give (+y is down, so
 *  a positive cross product is clockwise on the page, the SVG sweep flag 1)? */
function expectQuarter(arc: ArcPrim, r: number): void {
  const u = { x: arc.start.x - arc.center.x, y: arc.start.y - arc.center.y };
  const v = { x: arc.end.x - arc.center.x, y: arc.end.y - arc.center.y };
  expect(Math.hypot(u.x, u.y)).toBe(r);
  expect(Math.hypot(v.x, v.y)).toBe(r);
  expect(arc.r).toBe(r);
  expect(Math.abs(u.x * v.x + u.y * v.y)).toBe(0);
  expect(arc.sweep).toBe(u.x * v.y - u.y * v.x > 0 ? 1 : 0);
}

const lPlan = (dir: "up" | "down" = "up", winders = 4): string => hallPlan(winderStairBlock(L_STAIR, [winders], dir));
const row = (name: string): string => new Map(winderDrawnRows()).get(name)!;

describe("the walking line turns over winders on the arc lint credits", () => {
  // L_STAIR: the first flight rises north into the landing at (1500,100), 1000 square, across its
  // bottom side, whose middle is (2000,1100); the second leaves west across its left side, middle
  // (1500,600). The inner corner, shared by those sides, is (1500,1100); the radius is 1000 / 2.
  // North then west is a left turn: counter-clockwise on the page, sweep 0.
  it("one quarter arc of radius width / 2 round the inner corner, from flight to flight", () => {
    for (const n of [2, 3, 4, 6, 8]) {
      const arcs = arcsOf(lPlan("up", n));
      expect(arcs, `winders ${n}`).toEqual([
        {
          t: "arc",
          center: { x: 1500, y: 1100 },
          r: 500,
          start: { x: 2000, y: 1100 },
          end: { x: 1500, y: 600 },
          sweep: 0,
        },
      ]);
      expectQuarter(arcs[0]!, 500);
    }
  });

  it("no straight chord is left across the landing", () => {
    const chord = strokesOf(lPlan()).filter(
      (s) => !s.arc && s.a.x === 2000 && s.a.y === 1100 && s.b.x === 1500 && s.b.y === 600,
    );
    expect(chord).toEqual([]);
  });

  it("it is one line: joined end to end, and the arc leaves and meets the flights on their tangents", () => {
    const walk = walkOf(lPlan());
    expect(walk.map((s) => (s.arc ? "arc" : "line"))).toEqual(["line", "arc", "line"]);
    for (let i = 1; i < walk.length; i++) expect(walk[i]!.a).toEqual(walk[i - 1]!.b);
    // Up the first flight's middle (x 2000), round, and west along the second's (y 600).
    expect(walk[0]!.a.x).toBe(2000);
    expect(walk[0]!.b).toEqual({ x: 2000, y: 1100 });
    expect(walk[2]!.a).toEqual({ x: 1500, y: 600 });
    expect(walk[2]!.b.y).toBe(600);
  });

  it("the drawn length is the length lint counts goings on", () => {
    const turn = walkOf(lPlan()).find((s) => s.a.x === 2000 && s.a.y === 1100)!;
    // π/2 × 500 = 785.4 mm. The chord it replaces is 707.1 mm.
    expect(drawn(turn)).toBeCloseTo(785.398, 3);
    // Where the two lengths part: 250 mm goings fit three times on the arc and twice on the chord,
    // and 262 mm goings twice on the arc's 785.4 mm, since three need 786.
    for (const going of [220, 250, 261, 262, 392, 393]) {
      const credit = winderGoings(MAX_WINDERS, L_STAIR.width, going);
      expect(Math.floor(drawn(turn) / going), `going ${going}`).toBe(credit);
    }
    expect(winderGoings(MAX_WINDERS, L_STAIR.width, 250)).toBe(3);
  });

  it("the storey above draws the same curve, walked the other way", () => {
    expect(arcsOf(lPlan("down"))).toEqual([
      {
        t: "arc",
        center: { x: 1500, y: 1100 },
        r: 500,
        start: { x: 1500, y: 600 },
        end: { x: 2000, y: 1100 },
        sweep: 1,
      },
    ]);
  });

  // THREE_FLIGHTS, 900 wide: north, a landing at (100,1200), east, a landing at (2800,1200), south.
  // Each turn is to the right, clockwise on the page: sweep 1. The first is entered at the middle of
  // its bottom side, (550,2100), and left at the middle of its right side, (1000,1650), round their
  // shared corner (1000,2100); the second from (2800,1650) to (3250,2100) round (2800,2100).
  it("each winder landing of a stair turns on its own arc, and a level one keeps its right angle", () => {
    const first: ArcPrim = {
      t: "arc",
      center: { x: 1000, y: 2100 },
      r: 450,
      start: { x: 550, y: 2100 },
      end: { x: 1000, y: 1650 },
      sweep: 1,
    };
    const second: ArcPrim = {
      t: "arc",
      center: { x: 2800, y: 2100 },
      r: 450,
      start: { x: 2800, y: 1650 },
      end: { x: 3250, y: 2100 },
      sweep: 1,
    };
    expect(arcsOf(hallPlan(winderStairBlock(THREE_FLIGHTS, [3, 3])))).toEqual([first, second]);
    const mixed = hallPlan(winderStairBlock(THREE_FLIGHTS, [3, undefined]));
    expect(arcsOf(mixed)).toEqual([first]);
    // The level landing's walk still turns at a right angle: in to (3250,1650), then down.
    const walk = walkOf(mixed);
    expect(walk.map((s) => (s.arc ? "arc" : "line"))).toEqual(["line", "arc", "line", "line", "line", "line"]);
    for (let i = 1; i < walk.length; i++) expect(walk[i]!.a).toEqual(walk[i - 1]!.b);
    expect(walk.some((s) => !s.arc && s.b.x === 3250 && s.b.y === 1650)).toBe(true);
  });

  it("a stair with no winders draws no arc", () => {
    for (const s of [L_STAIR, THREE_FLIGHTS])
      for (const dir of ["up", "down"] as const) expect(arcsOf(planOf(s, dir))).toEqual([]);
  });

  it("a frame carries the arc: a reflection flips its sweep, a quarter turn keeps it", () => {
    // The component draws L_STAIR at the origin (landing at (1400,0)) and `place … at (1000,1000)
    // mirror x` negates x: the corner (1400,1000) lands on (-400,2000), the entry (1900,1000) on
    // (-900,2000) and the exit (1400,500) on (-400,1500). The left turn reads as a right one.
    const mirrored = arcsOf(row("quarter-turn winders 4 placed mirror x"));
    expect(mirrored).toEqual([
      {
        t: "arc",
        center: { x: -400, y: 2000 },
        r: 500,
        start: { x: -900, y: 2000 },
        end: { x: -400, y: 1500 },
        sweep: 1,
      },
    ]);
    expectQuarter(mirrored[0]!, 500);
    const turned = arcsOf(row("quarter-turn winders 4 placed rotate 90"));
    expect(turned).toHaveLength(1);
    expectQuarter(turned[0]!, 500);
    expect(turned[0]!.sweep).toBe(0);
  });

  it("the arc stands inside the stair's bounds, and the estimate still bounds what is drawn", () => {
    const def = BUILTIN_REGISTRY.byKind.get("stair")!;
    for (const [name, src] of winderDrawnRows()) {
      if (name.startsWith("shaft")) continue; // two storeys: each is the row above it, drawn once
      const v = verticalsOf(resolvePlan(src).ir!)[0]!;
      const pts = def.bounds(v);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const arcs = arcsOf(src);
      expect(arcs.length, name).toBeGreaterThan(0);
      for (const a of arcs) {
        for (const p of [a.start, a.end, a.center]) {
          expect(p.x, name).toBeGreaterThanOrEqual(Math.min(...xs));
          expect(p.x, name).toBeLessThanOrEqual(Math.max(...xs));
          expect(p.y, name).toBeGreaterThanOrEqual(Math.min(...ys));
          expect(p.y, name).toBeLessThanOrEqual(Math.max(...ys));
        }
      }
      expect(def.drawCost!(v), name).toBeGreaterThanOrEqual(stairNodes(src).length);
    }
  });
});

/** `[semantic, whole, row]`: see the header for what each digest is and where it was measured. */
const LAW: [string, string, string][] = [
  [
    "64e5b8eae585a1f351c0f5bd055d7110ff52e93ea3678b0f026662b584902d45",
    "7060bc1205c0712f96530017cb36569ddc8825b4847bc3d0f65a787e87e9d18c",
    "quarter-turn winders 2 dir up",
  ],
  [
    "e7174732a2093d7636e62996f5b9a48cee7b17fb966fbc7a1969ad7621fd8618",
    "bf9b930fe7ee6362b294e9d6b1acfc80d43c31d3dcfa8258ec37d9b83c253911",
    "quarter-turn winders 3 dir up",
  ],
  [
    "e88f8d1a3d335f93e3446e049f58d097b5c086bc940668c519ebfe16c3a4b253",
    "aa6a4038f04fc35fd084bacf01c2aebe4f77556d767b939727d5234dfc75ef0e",
    "quarter-turn winders 4 dir up",
  ],
  [
    "963c939341c125f11add24f3c676d2e80fae6d17549d0eaf6a32778683a1143f",
    "a22660a67e97a3c1f88fce2c8384c47aa592392045f00aff809de79bb639d8da",
    "quarter-turn winders 6 dir up",
  ],
  [
    "9775fee719cff9325f345a72063d88dbeb55821f0b930381061aa1e943bcc06f",
    "5f83d96b9ef60abff6cd7aca0d858806fdcdca66af26a0288c0b2dac5adb854a",
    "quarter-turn winders 8 dir up",
  ],
  [
    "8540e527425019600f3903ec7a44d24441411c6a5e7c40eacd56f6e474932ed1",
    "8c5c39560b8e242c45a67e37eb86e46f9ec3800f2704b2949e2591a4330c9b88",
    "quarter-turn winders 4 dir down",
  ],
  [
    "6acdd19842cfba717431d5054cd4713f406d09d4298d6d84d0e7cb2c69a6fef8",
    "74feebbd904f5177cb4c94996f463d2792b09d3810a4f37ed81a513988eef585",
    "quarter-turn winders 4 dir up, height 3300",
  ],
  [
    "ce5943b7b3e43b97326e1f2f31bced81888f1a2aa0c76b1c89e9b08d8b3f57fe",
    "8d0b0d932f12a1478fa3647c7651620dd4e05ce6d06bbba8dbefcc41e90111aa",
    "three flights winders 3 and 3 dir up",
  ],
  [
    "a375a7a4564a2d2e2d5c4b98662a79a90791cf770d95dff630c85e718eadd7eb",
    "ef3708d8bf1d9e2ea73c3dbfb7c91c74f426ac2aac4108d9b4a2e097e9e7c632",
    "three flights winders 3 and 3 dir down",
  ],
  [
    "98c71907e26136ccb9fcddf13e20083031706a2dd85484699b1476f7e475daf4",
    "f338461e9e06a22aca7625adfc4cfe8b829234dbc9b022171940d1fa35f069bc",
    "three flights winders 3 then level dir up",
  ],
  [
    "dc9455b0d013713d0e747f483c091052fb89a3761d8566017a7f58055d76fea8",
    "8f1462ad6b8e84586904b6f511efbc144f6676502f3ab230903476329a0275eb",
    "quarter-turn winders 4 placed mirror x",
  ],
  [
    "7a52f23f67d5478198c7f45cd5d66a05073800c7be46646d329e55fc0a65540e",
    "e513ae9ef6f2b3827759400bcd7c4c9174228895ea5d0b44ff1ec08df4d5bd91",
    "quarter-turn winders 4 placed rotate 90",
  ],
  [
    "12473f94cdf3160bc5627616f3f2d364aba9cb072ad7034d664d61eb2f324298", // RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was bd9dd9bc)
    "9eeca3bb144bf0db2e649d3179227c15988ae25c511114b04a752bfe019034c6", // RM9.2, see ./byte-identity-baseline.ts; RM9.6 CV14: W_STAIR_NO_VOID reports this plan (was abf61c08)
    "shaft winders 4, up below and down above",
  ],
];

const ROWS = new Map(winderDrawnRows());

describe("winders — the walking arc moves the drawing only", () => {
  it("the table and the rows are the same set", () => {
    expect(LAW.map(([, , name]) => name)).toEqual([...ROWS.keys()]);
  });

  it.each(LAW.map(([semantic, whole, name]) => [name, semantic, whole]))(
    "%s: describe() and lint() as measured before the arc, and the drawing with it",
    (name, semantic, whole) => {
      const src = ROWS.get(name)!;
      expect(/\bwinders\b/.test(src)).toBe(true);
      expect(compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(semanticDigestWith(API, src)).toBe(semantic);
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(whole);
    },
  );

  it("the rows wake the lints that read a winder stair, so the semantic digest carries them", () => {
    const codes = (name: string): (string | undefined)[] => lint(ROWS.get(name)!).map((d) => d.code);
    expect(codes("quarter-turn winders 4 dir up, height 3300")).toContain("W_STAIR_TOO_STEEP");
    expect(codes("quarter-turn winders 4 dir down")).toContain("W_STAIR_NO_LANDING");
  });
});
