import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { compile } from "../src/index.js";
import { format } from "../src/format.js";
import { rotateNode } from "../src/elements/furniture.js";
import type { SceneNode } from "../src/scene.js";

/**
 * Quarter-turn furniture rotation. The symbol is drawn in its "back-on-top" frame
 * then rotated about the footprint centre with exact integer arithmetic (no trig),
 * so output stays byte-stable and the rotated symbol still fills the declared WxH.
 */

const wc = (rot: string) =>
  `plan "P" { units mm room id=r at (0,0) size 4000x4000 label "R" furniture wc at (1000,1000) size 400x700${rot} }`;

/**
 * Every defining point the furniture layer contributes, so the "stays inside the declared
 * footprint" law below sees the WHOLE symbol.
 *
 * It used to collect polygon and line points alone, which quietly made the law vacuous for
 * any glyph drawn with a curve or a dot: a `circle` or an `arc` could sit metres outside
 * the footprint and the loop would never look at it. The arms mirror `pointsOf` in
 * `src/backends/ascii.ts` — an arc is bounded by its start/end/centre, a circle by the
 * corners of its bounding square.
 */
const furnPoints = (src: string): { x: number; y: number }[] => {
  const scene = toScene(resolve(parse(src).plan!).ir);
  const pts: { x: number; y: number }[] = [];
  for (const n of scene.nodes) {
    if (n.layer !== "furniture") continue;
    const p = n.prim;
    if (p.t === "polygon") pts.push(...p.pts);
    else if (p.t === "line") pts.push(p.a, p.b);
    else if (p.t === "arc") pts.push(p.start, p.end, p.center);
    else if (p.t === "circle")
      pts.push({ x: p.center.x - p.r, y: p.center.y - p.r }, { x: p.center.x + p.r, y: p.center.y + p.r });
  }
  return pts;
};

describe("furniture rotate", () => {
  it("rotate 90 changes the output; rotate 0 is identical to no rotation", () => {
    const none = compile(wc(""), { noCache: true }).svg;
    const r0 = compile(wc(" rotate 0"), { noCache: true }).svg;
    const r90 = compile(wc(" rotate 90"), { noCache: true }).svg;
    expect(r0).toBe(none);
    expect(r90).not.toBe(none);
  });

  it("is deterministic", () => {
    expect(compile(wc(" rotate 270"), { noCache: true }).svg).toBe(compile(wc(" rotate 270"), { noCache: true }).svg);
  });

  it("keeps the rotated symbol inside the declared WxH footprint", () => {
    // Footprint: (1000,1000) 400×700 → x∈[1000,1400], y∈[1000,1700].
    for (const rot of [" rotate 90", " rotate 180", " rotate 270"]) {
      for (const p of furnPoints(wc(rot))) {
        expect(p.x).toBeGreaterThanOrEqual(1000 - 1);
        expect(p.x).toBeLessThanOrEqual(1400 + 1);
        expect(p.y).toBeGreaterThanOrEqual(1000 - 1);
        expect(p.y).toBeLessThanOrEqual(1700 + 1);
      }
    }
  });

  it("rejects a non-quarter-turn rotation", () => {
    const { diagnostics } = compile(wc(" rotate 45"), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_FURN_ROTATE")).toBe(true);
  });

  it("round-trips through the formatter", () => {
    expect(format(wc(" rotate 90"))).toContain("size 400x700 rotate 90");
  });
});

/**
 * The `arc` arm of `rotateNode`, exercised directly.
 *
 * No shipped glyph emits an arc yet, so until `elements/glyph-lib.ts` gives them one the
 * only way to hold this down is to hand `rotateNode` a synthetic node — and that is the
 * point: the arm sat behind `default: return n` for releases precisely because nothing
 * reached it, so a test routed through a real fixture would have gone on proving nothing.
 * Expected coordinates are written out, not recomputed with the same formula under test.
 */
describe("rotateNode — the curved primitives", () => {
  const C = { x: 1000, y: 1000 };
  const arcNode: SceneNode = {
    layer: "furniture",
    prim: {
      t: "arc",
      center: { x: 1200, y: 1000 },
      r: 200,
      start: { x: 1200, y: 800 },
      end: { x: 1400, y: 1000 },
      sweep: 1,
    },
    paint: { stroke: "#000", width: 1 },
  };
  const arcOf = (n: SceneNode) => {
    if (n.prim.t !== "arc") throw new Error("rotateNode changed the primitive kind");
    return n.prim;
  };

  it("moves all three defining points and leaves r/sweep alone", () => {
    const expected = {
      90: { center: { x: 1000, y: 1200 }, start: { x: 1200, y: 1200 }, end: { x: 1000, y: 1400 } },
      180: { center: { x: 800, y: 1000 }, start: { x: 800, y: 1200 }, end: { x: 600, y: 1000 } },
      270: { center: { x: 1000, y: 800 }, start: { x: 800, y: 800 }, end: { x: 1000, y: 600 } },
    } as const;
    for (const deg of [90, 180, 270] as const) {
      const got = arcOf(rotateNode(arcNode, C, deg));
      expect(got.center, `centre at ${deg}°`).toEqual(expected[deg].center);
      expect(got.start, `start at ${deg}°`).toEqual(expected[deg].start);
      expect(got.end, `end at ${deg}°`).toEqual(expected[deg].end);
      // A radius is a length and a rotation preserves orientation, so neither moves.
      expect(got.r).toBe(200);
      expect(got.sweep).toBe(1);
    }
  });

  it("rotate 0 is the identity, and four quarter-turns return the original", () => {
    expect(arcOf(rotateNode(arcNode, C, 0))).toEqual(arcNode.prim);
    let n = arcNode;
    for (let i = 0; i < 4; i++) n = rotateNode(n, C, 90);
    expect(arcOf(n)).toEqual(arcNode.prim);
  });

  it("is deterministic (exact arithmetic, no trig)", () => {
    expect(rotateNode(arcNode, C, 270)).toEqual(rotateNode(arcNode, C, 270));
  });

  it("moves a circle's centre and keeps its radius", () => {
    const circle: SceneNode = {
      layer: "furniture",
      prim: { t: "circle", center: { x: 1300, y: 1000 }, r: 50 },
      paint: { stroke: "#000", width: 1 },
    };
    const got = rotateNode(circle, C, 90).prim;
    expect(got).toEqual({ t: "circle", center: { x: 1000, y: 1300 }, r: 50 });
  });
});
