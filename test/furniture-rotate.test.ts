import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { compile } from "../src/index.js";
import { format } from "../src/format.js";

/**
 * Quarter-turn furniture rotation. The symbol is drawn in its "back-on-top" frame
 * then rotated about the footprint centre with exact integer arithmetic (no trig),
 * so output stays byte-stable and the rotated symbol still fills the declared WxH.
 */

const wc = (rot: string) =>
  `plan "P" { units mm room id=r at (0,0) size 4000x4000 label "R" furniture wc at (1000,1000) size 400x700${rot} }`;

const furnPoints = (src: string): { x: number; y: number }[] => {
  const scene = toScene(resolve(parse(src).plan!).ir);
  const pts: { x: number; y: number }[] = [];
  for (const n of scene.nodes) {
    if (n.layer !== "furniture") continue;
    if (n.prim.t === "polygon") pts.push(...n.prim.pts);
    else if (n.prim.t === "line") pts.push(n.prim.a, n.prim.b);
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
