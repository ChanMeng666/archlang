import { describe, expect, it } from "vitest";
import {
  actOnLetter,
  actOnQuarterTurn,
  actOnSide,
  applyVec,
  backEdgeOfDeg,
  backVectorOfDeg,
  compose,
  D4_ELEMENTS,
  D4_HALF_TURN,
  D4_IDENTITY,
  type D4,
  degOfBackEdge,
  degOfBackVector,
  det,
  fromMatrix,
  fromSpelling,
  inverse,
  LETTERS_CW,
  type Mat2,
  mod360,
  northBearingDeg,
  northQuarterTurns,
  oppositeSide,
  type QuarterTurn,
  SIDE_NORMAL,
  SIDES_CW,
  sideOfNormal,
  toCompass,
  toMatrix,
  toSpelling,
} from "../src/algebra/d4.js";
import { composeFrame, makeFrame, transformDeg, type Frame } from "../src/frame.js";
import { northQuarterTurns as describesNorthQuarterTurns } from "../src/describe.js";
import { compile, describe as describePlan, instanceTransform } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { NorthDir } from "../src/ast.js";
import type { RRoom } from "../src/ir.js";

/**
 * `src/algebra/d4.ts` — the dihedral group of the square, the ONE encoding of the four
 * rectilinear directions. The group is finite (eight elements), so every law below is
 * checked EXHAUSTIVELY, not sampled: 8³ triples for associativity, every element on every
 * side, letter and quarter-turn, and all twelve `place` spellings against `frame.ts`.
 */

const G = D4_ELEMENTS;
const ROTATIONS = [0, 90, 180, 270] as const;
const MIRRORS = [undefined, "x", "y"] as const;
/** Every `place` spelling: 4 turns × (none | mirror x | mirror y). */
const SPELLINGS = ROTATIONS.flatMap((rotate) => MIRRORS.map((mirror) => ({ rotate, mirror })));

/** Fold `-0` to `0` — a sign convention, not a tolerance (`-0 === 0`). */
const nz = (n: number): number => (Object.is(n, -0) ? 0 : n);
/** A vector with its signed zeros folded (a matrix product writes `−1 · 0` as `-0`). */
const vz = (v: { x: number; y: number }): { x: number; y: number } => ({ x: nz(v.x), y: nz(v.y) });
const matOf = (f: Frame): Mat2 => [f.a, f.b, f.c, f.d];
const mul = (m: Mat2, n: Mat2): Mat2 => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
];
const frameOf = (s: (typeof SPELLINGS)[number], x = 0, y = 0): Frame =>
  makeFrame({
    origin: { x, y },
    rotate: s.rotate,
    ...(s.mirror ? { mirror: s.mirror } : {}),
    prefix: "",
    component: "c",
  });
const name = (g: D4): string => `R^${g.k}·Fx^${g.f}`;

describe("D4 — the group", () => {
  it("has eight distinct elements, each its own canonical object", () => {
    expect(G).toHaveLength(8);
    expect(new Set(G.map(name)).size).toBe(8);
    for (const g of G) expect(fromMatrix(toMatrix(g))).toBe(g);
  });

  it("compose is associative over all 8³ triples", () => {
    for (const a of G)
      for (const b of G) for (const c of G) expect(compose(compose(a, b), c)).toBe(compose(a, compose(b, c)));
  });

  it("has an identity and inverses", () => {
    for (const g of G) {
      expect(compose(g, D4_IDENTITY)).toBe(g);
      expect(compose(D4_IDENTITY, g)).toBe(g);
      expect(compose(g, inverse(g))).toBe(D4_IDENTITY);
      expect(compose(inverse(g), g)).toBe(D4_IDENTITY);
    }
  });

  it("is the matrix group: toMatrix is a homomorphism into 2×2 signed permutations", () => {
    for (const g of G) {
      for (const h of G) expect(toMatrix(compose(g, h))).toEqual(mul(toMatrix(g), toMatrix(h)).map(nz));
    }
  });

  it("is NOT abelian — a reflection and a quarter-turn do not commute", () => {
    const R = fromSpelling(90);
    const Fx = fromSpelling(0, "x");
    expect(compose(R, Fx)).not.toBe(compose(Fx, R));
    // …which is the identity the chirality factorisation rests on: Fx · R = R⁻¹ · Fx.
    expect(compose(Fx, R)).toBe(compose(inverse(R), Fx));
  });

  it("det is a homomorphism onto {±1}, and equals the matrix determinant", () => {
    for (const g of G) {
      const [a, b, c, d] = toMatrix(g);
      expect(det(g)).toBe(a * d - b * c);
      expect(det(g)).toBe(g.f ? -1 : 1);
      for (const h of G) expect(det(compose(g, h))).toBe(det(g) * det(h));
    }
  });

  it("fromMatrix rejects anything that is not one of the eight", () => {
    expect(fromMatrix([1, 1, 0, 1])).toBeNull();
    expect(fromMatrix([2, 0, 0, 1])).toBeNull();
    expect(fromMatrix([0, 0, 0, 0])).toBeNull();
    // A signed zero is still a zero.
    expect(fromMatrix([-1, 0, -0, 1])).toBe(fromSpelling(0, "x"));
  });
});

describe("D4 — faithful actions agree with the matrix", () => {
  it("on sides: actOnSide is applyVec on the outward normals, and a group action", () => {
    for (const g of G) {
      for (const s of SIDES_CW) {
        expect(SIDE_NORMAL[actOnSide(g, s)]).toEqual(vz(applyVec(g, SIDE_NORMAL[s])));
        for (const h of G) expect(actOnSide(compose(g, h), s)).toBe(actOnSide(g, actOnSide(h, s)));
      }
    }
    // Faithful: no two elements move the four sides the same way.
    const images = G.map((g) => SIDES_CW.map((s) => actOnSide(g, s)).join(","));
    expect(new Set(images).size).toBe(8);
  });

  it("on letters: actOnLetter is the side action under N/E/S/W = top/right/bottom/left", () => {
    const sideOf = { N: "top", E: "right", S: "bottom", W: "left" } as const;
    for (const g of G) {
      for (const l of LETTERS_CW) {
        expect(sideOf[actOnLetter(g, l)]).toBe(actOnSide(g, sideOf[l]));
        for (const h of G) expect(actOnLetter(compose(g, h), l)).toBe(actOnLetter(g, actOnLetter(h, l)));
      }
    }
  });

  it("on quarter-turns: actOnQuarterTurn pushes the back vector through, for every input", () => {
    for (const g of G) {
      for (const d of [0, 90, 180, 270]) {
        expect(backVectorOfDeg(actOnQuarterTurn(g, d))).toEqual(vz(applyVec(g, backVectorOfDeg(d))));
        for (const h of G) expect(actOnQuarterTurn(compose(g, h), d)).toBe(actOnQuarterTurn(g, actOnQuarterTurn(h, d)));
      }
    }
  });

  it("frame.ts's transformDeg IS the quarter-turn action, for all 12 spellings and odd inputs", () => {
    for (const s of SPELLINGS) {
      const f = frameOf(s, 70, -30);
      const g = fromSpelling(s.rotate, s.mirror);
      for (const d of [undefined, 0, 90, 180, 270, 360, -90, 450, 45, Number.NaN]) {
        expect(transformDeg(f, d), `${JSON.stringify(s)} deg ${d}`).toBe(actOnQuarterTurn(g, d));
      }
    }
  });

  it("the back edge and the back vector name the same direction", () => {
    for (const d of [undefined, 0, 90, 180, 270, -90, 450, 45]) {
      expect(backEdgeOfDeg(d)).toBe(sideOfNormal(backVectorOfDeg(d ?? 0)));
    }
    for (const s of SIDES_CW) {
      expect(backEdgeOfDeg(degOfBackEdge(s))).toBe(s);
      expect(degOfBackVector(SIDE_NORMAL[s])).toBe(degOfBackEdge(s));
    }
  });

  it("opposite is the half-turn's action; toCompass is R^(−turns)", () => {
    for (const s of SIDES_CW) expect(oppositeSide(s)).toBe(actOnSide(D4_HALF_TURN, s));
    for (const l of LETTERS_CW) {
      for (const turns of [0, 1, 2, 3] as const) {
        const back = D4_ELEMENTS[(4 - turns) % 4]!;
        expect(toCompass(l, turns)).toBe(actOnLetter(back, l));
      }
    }
  });

  it("sideOfNormal names only the four unit axis vectors", () => {
    for (const s of SIDES_CW) expect(sideOfNormal(SIDE_NORMAL[s])).toBe(s);
    expect(sideOfNormal({ x: 0, y: 0 })).toBeNull();
    expect(sideOfNormal({ x: 1, y: 1 })).toBeNull();
    expect(sideOfNormal({ x: -0, y: -1 })).toBe("top");
  });
});

describe("D4 — the normal form is frame.ts's", () => {
  it("all 12 spellings: fromSpelling equals fromMatrix of makeFrame's matrix", () => {
    for (const s of SPELLINGS) {
      const f = frameOf(s);
      expect(fromMatrix(matOf(f)), JSON.stringify(s)).toBe(fromSpelling(s.rotate, s.mirror));
      // …and the table matrix IS makeFrame's, up to the sign of a zero.
      expect(toMatrix(fromSpelling(s.rotate, s.mirror))).toEqual(matOf(f).map(nz));
    }
    // Twelve spellings, eight elements: every reflection has two spellings.
    expect(new Set(SPELLINGS.map((s) => name(fromSpelling(s.rotate, s.mirror)))).size).toBe(8);
    expect(fromSpelling(0, "y")).toBe(fromSpelling(180, "x"));
  });

  it("composeFrame's re-derived (rotate, mirror) is toSpelling of the composed element", () => {
    for (const p of SPELLINGS) {
      for (const c of SPELLINGS) {
        const composed = composeFrame(frameOf(p, 1000, 2000), frameOf(c, 30, -40));
        const g = fromMatrix(matOf(composed));
        expect(g).not.toBeNull();
        const spelled = toSpelling(g!);
        expect({ rotate: composed.rotate, mirror: composed.mirror }).toEqual({
          rotate: spelled.rotate,
          mirror: spelled.mirror,
        });
        // Independently: the group product of the two spellings (no matrix involved).
        expect(g).toBe(compose(fromSpelling(p.rotate, p.mirror), fromSpelling(c.rotate, c.mirror)));
      }
    }
  });

  it("toSpelling round-trips every element", () => {
    for (const g of G) {
      const s = toSpelling(g);
      expect(fromSpelling(s.rotate, s.mirror)).toBe(g);
    }
  });
});

describe("D4 — the degree helpers keep their exact arithmetic", () => {
  it("mod360 is EXACTLY ((x % 360) + 360) % 360", () => {
    for (const x of [0, -0, 1, 359, 360, 361, -1, -90, -360, -450, 720.5, -0.25, 1e21, Number.NaN, Infinity]) {
      expect(Object.is(mod360(x), ((x % 360) + 360) % 360), `x = ${x}`).toBe(true);
    }
  });

  it("northBearingDeg: keywords are the four cardinals, a bearing passes through raw", () => {
    const cases: [NorthDir, number][] = [
      ["up", 0],
      ["right", 90],
      ["down", 180],
      ["left", 270],
      [{ deg: 30 }, 30],
      [{ deg: -45 }, -45],
      [{ deg: 450 }, 450],
    ];
    for (const [n, deg] of cases) expect(northBearingDeg(n)).toBe(deg);
  });

  it("northQuarterTurns moved here and describe.ts re-exports the same function", () => {
    expect(describesNorthQuarterTurns).toBe(northQuarterTurns);
    for (const n of ["up", "right", "down", "left"] as const) {
      expect(northQuarterTurns(n)).toBe((northBearingDeg(n) / 90) as QuarterTurn);
    }
  });
});

describe("D4 — instances compare by transform, never by spelling", () => {
  // An asymmetric L of walls plus a handed fixture: all eight images are different drawings.
  const planFor = (s: (typeof SPELLINGS)[number]): string => `plan "i" {
  units mm
  component k() {
    wall id=s exterior thickness 200 { (0,0) (4000,0) (4000,1000) (1500,1000) (1500,3000) (0,3000) close }
    furniture id=d desk at (300,300) size 1400x700
  }
  place k() as a at (10000,10000)${s.rotate ? ` rotate ${s.rotate}` : ""}${s.mirror ? ` mirror ${s.mirror}` : ""}
}`;
  const runs = SPELLINGS.map((s) => {
    const src = planFor(s);
    const inst = describePlan(src).instances?.[0];
    if (!inst) throw new Error(`no instance for ${JSON.stringify(s)}`);
    return { s, t: instanceTransform(inst), svg: compile(src, { noCache: true }).svg, inst };
  });

  it("two instances have the same transform ⇔ equal D4 values (all 12 × 12 spelling pairs)", () => {
    for (const a of runs) {
      for (const b of runs) {
        expect(a.svg === b.svg, `${JSON.stringify(a.s)} vs ${JSON.stringify(b.s)}`).toBe(a.t === b.t);
      }
    }
    expect(new Set(runs.map((r) => r.svg)).size).toBe(8);
  });

  it("`mirror y` and `rotate 180 mirror x` describe differently and transform identically", () => {
    const y = runs.find((r) => r.s.rotate === 0 && r.s.mirror === "y")!;
    const x180 = runs.find((r) => r.s.rotate === 180 && r.s.mirror === "x")!;
    expect(y.inst).toMatchObject({ rotate: 0, mirror: "y" });
    expect(x180.inst).toMatchObject({ rotate: 180, mirror: "x" });
    expect(instanceTransform(y.inst)).toEqual(instanceTransform(x180.inst));
    expect(y.svg).toBe(x180.svg);
  });
});

describe("grid snapping happens in the author's frame, before the transform", () => {
  const roomsOf = (src: string): RRoom[] =>
    resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

  it("room at (50,0) on a 100 grid, placed `mirror x`, lands its authored edge at x = −100", () => {
    const [r] = roomsOf(`plan "g" {
  units mm
  grid 100
  component c() { room id=r at (50,0) size 1000x1000 }
  place c() as a at (0,0) mirror x
}`);
    // Round-half-UP in the LOCAL frame: 50 → 100. The reflection then carries that edge to
    // −100, which is the room's right edge once re-cornered.
    expect(r!.at.x + r!.size.w).toBe(-100);
    expect(r!.at.x).toBe(-1100);
    // Authored directly in PLAN space the tie rounds the other way (−50 → −0), so a tie is
    // a property of the frame the author wrote in, not a defect of the group action.
    const [p] = roomsOf(`plan "g" {
  units mm
  grid 100
  room id=r at (-50,0) size 1000x1000
}`);
    expect(nz(p!.at.x)).toBe(0);
  });
});
