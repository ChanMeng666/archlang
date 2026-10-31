/**
 * One stair of several pieces (issue #362, card S1): `stair id=s dir up width 1000 { flight …
 * landing … flight … }`. The grammar, the refusals, the direction read from what touches, every
 * reader of the footprint, the drawing, and `place`. What each lint rule does with the form until
 * cards S2 and S3 is pinned at the end, so a change there is a decision and not a surprise.
 *
 * The expected values are derived from `test/block-stair-plans.ts`'s numbers, by hand or by a
 * lattice of its own: nothing here reads the resolver's own idea of a flight to check itself.
 */

import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { statementExprs } from "../src/cursor.js";
import { exprSpan } from "../src/expr.js";
import {
  compile,
  describe as describePlan,
  type Diagnostic,
  finish,
  format,
  impact,
  lint,
  lintWithCoverage,
  planToJson,
  renderAscii,
  repair,
  taste,
  toDxf,
} from "../src/index.js";
import type { RRoom, RStair } from "../src/ir.js";
import { MAX_ELEMENTS } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { SceneNode } from "../src/scene.js";
import {
  boardedFlight,
  entryEdges,
  flightsOf,
  piecesOf,
  roomOfVertical,
  runAxis,
  tailEdge,
  verticalObstacles,
  verticalRect,
  verticalsOf,
} from "../src/vertical.js";
import {
  BLOCK_STAIRS,
  type BlockStair,
  hallBody,
  hallPlan,
  L_STAIR,
  planOf,
  type Rect,
  SHORT_AXIS,
  type Side,
  STRAIGHT_LANDING,
  stairBlock,
  THREE_FLIGHTS,
  U_STAIR,
} from "./block-stair-plans.js";

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const stairOf = (src: string): RStair => {
  const { ir } = resolvePlan(src);
  return verticalsOf(ir!).find((v) => v.kind === "stair") as RStair;
};
const codes = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code ?? "");

/** What the stair drew, in drawing order. */
const inkOf = (src: string): SceneNode[] =>
  compile(src, { noCache: true }).scene!.nodes.filter((n) => n.layerName === "A-FLOR-STRS");
const linesOf = (nodes: SceneNode[]) =>
  nodes.flatMap((n) => (n.prim.t === "line" ? [{ a: n.prim.a, b: n.prim.b, ink: n.paint.stroke }] : []));
const wordsOf = (nodes: SceneNode[]): string[] => nodes.flatMap((n) => (n.prim.t === "text" ? [n.prim.value] : []));

/** A plain-numbers rectangle test, closed: nothing of the compiler. */
const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

describe("the block form parses", () => {
  it("is the word after the id: `dir` opens the block, `at` the straight form", () => {
    const { plan } = parse(planOf(L_STAIR), BUILTIN_REGISTRY);
    const node = plan!.body.find((s) => s.kind === "stair")!;
    expect(node).toMatchObject({ kind: "stair", id: "s", dir: "up" });
    expect("at" in node).toBe(false);
    expect((node as { pieces: { kind: string }[] }).pieces.map((p) => p.kind)).toEqual(["flight", "landing", "flight"]);
  });

  it("a block with no id still resolves, with an auto id", () => {
    const src = hallPlan(stairBlock(L_STAIR).replace("id=s ", ""));
    expect(codes(src)).toEqual([]);
    expect(stairOf(src).id).toBe("stair_1");
  });

  it("`flight` and `landing` are words only inside the block", () => {
    expect(codes(hallPlan("    flight at (0,0) size 100x100"))).toEqual(["E_PARSE"]);
    expect(codes(hallPlan("    landing at (0,0) size 100x100"))).toEqual(["E_PARSE"]);
    // A room, a binding and a stair id may all carry either name: `examples/two-storey.arch` does.
    const named = `plan "p" {
  units mm
  let flight = 300
  let landing = 2
  room id=landing at (0,0) size 3000x3000
  room id=flight at (3000,0) size 3000x3000
  column at (flight, flight * landing) size 200x200
  stair id=landing2 at (500,500) size 1000x2000 dir up
}
`;
    expect(codes(named)).toEqual([]);
  });

  it("anything else in the block is a parse error at the word, and the plan after it is kept", () => {
    const src = hallPlan(`    stair id=s dir up width 1000 {
      wall exterior thickness 100 { (0,0) (1000,0) }
    }
    column at (100,100) size 100x100`);
    const c = compile(src, { noCache: true });
    const parse0 = c.diagnostics.filter((d) => d.code === "E_PARSE");
    expect(parse0[0]!.message).toContain('Expected "flight" or "landing"');
    expect(src.slice(parse0[0]!.span!.start, parse0[0]!.span!.end)).toBe("wall");
  });

  it("`dir` first with no block says what the two forms want", () => {
    const c = compile(hallPlan("    stair id=s dir up at (500,500) size 1000x3000"), { noCache: true });
    expect(c.diagnostics.find((d) => d.code === "E_PARSE")!.message).toContain("`at` and `size` before `dir`");
  });

  it("an unclosed block is a parse error, never a throw", () => {
    expect(codes(`plan "p" {\n  stair id=s dir up width 1000 {\n    flight at (0,0) size 10x10`)).toContain("E_PARSE");
  });
});

describe("arch fmt keeps the block", () => {
  it("round-trips, is a fixed point, and leaves its comments inside", () => {
    const src = hallPlan(`    stair id=s dir up width 1000 {
      # the first
      flight at (1500,1100) size 1000x1000  # square
      landing at (1500,100) size 1000x1000
      # the second
      flight at (100,100) size 1400x1000
    }`);
    const out = format(src);
    expect(format(out)).toBe(out);
    expect(compile(out).svg).toBe(compile(src).svg);
    const block = out.slice(out.indexOf("stair id=s"), out.indexOf("}", out.indexOf("stair id=s")));
    for (const c of ["# the first", "# square", "# the second"]) expect(block).toContain(c);
  });

  it("an expression survives, in place", () => {
    const src = hallPlan(stairBlock(L_STAIR).replace("(1500,1100)", "(1000 + 500,1100)"), "  let w = 1000\n").replace(
      "width 1000",
      "width w",
    );
    expect(format(src)).toContain("dir up width w {");
    expect(format(src)).toContain("flight at (1000 + 500, 1100) size 1000x1000");
    expect(compile(format(src)).svg).toBe(compile(src).svg);
  });
});

describe("what makes one stair", () => {
  const edit = (a: string, b: string): string => {
    const s = planOf(L_STAIR);
    expect(s).toContain(a);
    return s.replace(a, b);
  };
  const one = (...p: string[]): string =>
    hallPlan(`    stair id=s dir up width 1000 {\n      ${p.join("\n      ")}\n    }`);
  const F1 = "flight at (1500,1100) size 1000x1000";
  const L1 = "landing at (1500,100) size 1000x1000";
  const F2 = "flight at (100,100) size 1400x1000";

  it.each([
    ["no `width`", edit(" width 1000", ""), "E_STAIR_PIECES", /needs `width`/],
    ["no pieces", one(), "E_STAIR_PIECES", /no flights/],
    ["one flight", one(F1), "E_STAIR_PIECES", /at least two flights/],
    ["ends on a landing", one(F1, L1), "E_STAIR_PIECES", /end on a flight/],
    ["starts on a landing", one(L1, F2), "E_STAIR_PIECES", /alternate/],
    ["two flights running", one(F1, "flight at (1500,100) size 1000x1000"), "E_STAIR_PIECES", /alternate/],
    ["two landings running", one(F1, L1, "landing at (100,100) size 1400x1000", F2), "E_STAIR_PIECES", /alternate/],
    ["a gap", edit("(1500,100)", "(1500,50)"), "E_STAIR_PIECES", /overlap|share a length/],
    ["pieces overlap", edit("(1500,100)", "(1500,200)"), "E_STAIR_PIECES", /overlap/],
    ["a corner is no edge", one(F1, L1, "flight at (100,0) size 1400x100"), "E_STAIR_PIECES", /share a length/],
    ["a piece has no size", edit("size 1400x1000", "size 0x1000"), "E_VERT_SIZE", /positive size/],
    ["wider than a flight", edit("width 1000", "width 1200"), "E_STAIR_WIDTH", /extent across its run/],
    ["no width at all", edit("width 1000", "width 0"), "E_STAIR_WIDTH", /between 0/],
    [
      "a flight that lands short",
      one(F1, L1, "flight at (100,300) size 1400x1000"),
      "E_STAIR_PIECES",
      /does not meet piece 2 along its whole width/,
    ],
    [
      // Every neighbour meets as it must, flight 2's 1000 mm band whole on the landing's edge at
      // y 1000..2000. The flights themselves share x 1600..2100, y 2000..2100.
      "a flight on a piece it does not touch",
      one(
        "flight at (100,2000) size 2000x2000",
        "landing at (600,1000) size 1000x1000",
        "flight at (1600,900) size 1000x1200",
      ),
      "E_STAIR_PIECES",
      /pieces 1 and 3 overlap/,
    ],
  ])("%s", (_name, src, code, why) => {
    const c = compile(src, { noCache: true });
    const errors = c.diagnostics.filter((d) => d.severity === "error");
    expect(errors.map((d) => d.code)).toEqual([code]);
    expect(errors[0]!.message).toMatch(why);
    expect(c.svg === undefined || c.svg === "" || typeof c.svg === "string").toBe(true);
  });

  it("the design's rule is not enough on its own: an overlap of `width` that misses the band is refused", () => {
    // The flight's 1000 mm band is centred in its 1400 mm footprint, x 1600..2600. The landing's
    // edge meets the footprint along x 1100..2200, 1100 mm, which is at least `width`, and the
    // band leaves it at 2200: the walking line would step off the landing's corner.
    const src = hallPlan(`    stair id=s dir up width 1000 {
      flight at (1400,3000) size 1400x1000
      landing at (1100,2000) size 1100x1000
      flight at (100,2000) size 1000x1000
    }`);
    expect(codes(src)).toEqual(["E_STAIR_PIECES"]);
  });

  it("a flight runs straight: one left by a side it was not entered opposite is refused", () => {
    const src = hallPlan(`    stair id=s dir up width 1000 {
      flight at (100,3000) size 1000x1000
      landing at (100,2000) size 1000x1000
      flight at (1100,2000) size 1000x1000
      landing at (1100,1000) size 1000x1000
      flight at (2100,1000) size 1000x1000
    }`);
    const c = compile(src, { noCache: true });
    expect(c.diagnostics.map((d) => d.code)).toContain("E_STAIR_PIECES");
    expect(c.diagnostics[0]!.message).toMatch(/entered on its left edge and left on its top edge/);
  });

  it("a refusal points at the piece, and a landing may be longer than the flights it joins", () => {
    const src = edit("(1500,100)", "(1500,200)");
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_STAIR_PIECES")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe("landing at (1500,200) size 1000x1000");
    expect(codes(planOf(U_STAIR))).toEqual([]);
    expect(U_STAIR.pieces[1]![2]).toBeGreaterThan(U_STAIR.width * 2);
  });

  it("a block is rejected in a plan that also uses the straight form, with the straight form untouched", () => {
    const src = hallPlan(`${stairBlock(L_STAIR).replace("width 1000", "width 1200")}
    stair id=t at (3000,1000) size 1000x3000 dir up`);
    expect(codes(src)).toEqual(["E_STAIR_WIDTH"]);
  });
});

describe("direction comes from what touches", () => {
  it.each(BLOCK_STAIRS.map((s) => [s.name, s] as const))("%s: every flight, climbing and descending", (_n, s) => {
    const up = stairOf(planOf(s, "up"));
    expect(up.flights!.map((f) => f.tail)).toEqual(s.tails);
    const down = stairOf(planOf(s, "down"));
    expect(down.flights!.map((f) => f.tail)).toEqual(s.tails.map((t) => OPPOSITE[t]));
    // Order is climbing order on every storey: the same rectangles, in the same order.
    expect(down.flights!.map((f) => f.at)).toEqual(up.flights!.map((f) => f.at));
  });

  it("the square flight and the short-axis flight, which no long side can answer", () => {
    const l = flightsOf(stairOf(planOf(L_STAIR)))[0]!;
    expect(l.size.w).toBe(l.size.h);
    expect(runAxis(l)).toBe("y");
    const short = flightsOf(stairOf(planOf(SHORT_AXIS)))[0]!;
    expect(short.size.w).toBeGreaterThan(short.size.h);
    expect(runAxis(short)).toBe("y");
  });

  it("`dir up` boards the first flight's foot, `dir down` the last flight's head", () => {
    const up = stairOf(planOf(L_STAIR, "up"));
    expect(boardedFlight(up).at).toEqual({ x: 1500, y: 1100 });
    expect(tailEdge(up)).toBe("bottom");
    expect(entryEdges(up)).toEqual(["bottom"]);
    const down = stairOf(planOf(L_STAIR, "down"));
    expect(boardedFlight(down).at).toEqual({ x: 100, y: 100 });
    expect(tailEdge(down)).toBe("left");
  });

  it("flightsOf and piecesOf give a straight stair back as it is", () => {
    const v = stairOf(hallPlan("    stair id=s at (500,500) size 1000x3000 dir up width 800"));
    expect(flightsOf(v)).toEqual([v]);
    expect(flightsOf(v)[0]).toBe(v);
    expect(boardedFlight(v)).toBe(v);
    expect(piecesOf(v)).toEqual([verticalRect(v)]);
    expect("flights" in v || "landings" in v || "_tail" in v).toBe(false);
  });
});

describe("the resolved form", () => {
  it("`at` and `size` are the union box, and describe() reports one stair on it", () => {
    const src = planOf(L_STAIR);
    const s = stairOf(src);
    expect(s.at).toEqual({ x: 100, y: 100 });
    expect(s.size).toEqual({ w: 2400, h: 2000 });
    const d = describePlan(src);
    expect(d.verticals).toEqual([
      { id: "s", kind: "stair", dir: "up", room: "r", bbox: { x: 100, y: 100, w: 2400, h: 2000 }, flight_width: 1000 },
    ]);
  });

  it("piecesOf is the pieces as written, in climbing order", () => {
    for (const s of BLOCK_STAIRS) {
      expect(piecesOf(stairOf(planOf(s))).map((r) => [r.x, r.y, r.w, r.h])).toEqual(s.pieces.map((p) => [...p]));
    }
  });
});

describe("the drawing", () => {
  /** Follow the drawn lines joined end to end from the first ink line after the treads. */
  const walkOf = (nodes: SceneNode[]): { x: number; y: number }[][] => {
    const ls = linesOf(nodes);
    // The walking line and the arrow are the symbol ink; the treads and the cut the lighter pen.
    const ink = ls.filter((l) => l.ink === ls[ls.length - 1]!.ink);
    return ink.map((l) => [l.a, l.b]);
  };

  /** The flight rectangles of `s`, in the order they are walked. */
  const walkedPieces = (s: BlockStair, dir: "up" | "down"): number[] => {
    const order = s.pieces.map((_, i) => i);
    return dir === "up" ? order : order.reverse();
  };

  it.each(BLOCK_STAIRS.flatMap((s) => (["up", "down"] as const).map((dir) => [`${s.name} ${dir}`, s, dir] as const)))(
    "%s: one word, one walking line through every piece in order, one head",
    (_n, s, dir) => {
      const nodes = inkOf(planOf(s, dir));
      expect(wordsOf(nodes)).toEqual([dir === "up" ? "UP" : "DN"]);
      const segs = walkOf(nodes);
      const walk = segs.slice(0, -2);
      const barbs = segs.slice(-2);
      // Joined end to end, axis-aligned, and the two barbs meet at the last point: one line.
      for (let i = 1; i < walk.length; i++) expect(walk[i]![0]).toEqual(walk[i - 1]![1]);
      for (const [a, b] of walk) expect(a!.x === b!.x || a!.y === b!.y).toBe(true);
      const head = walk[walk.length - 1]![1]!;
      for (const b of barbs) expect(b[0]).toEqual(head);
      // Sampled every 10 mm on a lattice of its own: it visits the pieces in walking order, each
      // once, and never stands on floor outside them.
      const visited: number[] = [];
      for (const [a, b] of walk) {
        const len = Math.abs(b!.x - a!.x) + Math.abs(b!.y - a!.y);
        for (let t = 0; t <= len; t += 10) {
          const x = a!.x + ((b!.x - a!.x) * t) / len;
          const y = a!.y + ((b!.y - a!.y) * t) / len;
          const at = s.pieces.findIndex((p) => inside(p, x, y));
          expect(at, `(${x},${y}) is off the stair`).toBeGreaterThanOrEqual(0);
          if (visited[visited.length - 1] !== at) visited.push(at);
        }
      }
      expect(visited).toEqual(walkedPieces(s, dir));
      // The word stands in the first flight boarded.
      const word = nodes.find((n) => n.prim.t === "text")!.prim as { at: { x: number; y: number } };
      expect(inside(s.pieces[dir === "up" ? 0 : s.pieces.length - 1]!, word.at.x, word.at.y)).toBe(true);
    },
  );

  it("one outline per piece, and no tread on a landing", () => {
    for (const s of BLOCK_STAIRS) {
      const nodes = inkOf(planOf(s));
      const outlines = nodes.filter((n) => n.prim.t === "polygon");
      expect(outlines.length).toBe(s.pieces.length);
      const treads = linesOf(nodes).filter((l) => l.ink !== linesOf(nodes).at(-1)!.ink);
      for (const t of treads) {
        const mid = { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 };
        const on = s.pieces.findIndex((p) => inside(p, mid.x, mid.y));
        expect(on % 2, `a tread or cut line at (${mid.x},${mid.y})`).toBe(0);
      }
    }
  });

  it("the treads stay at the nominal going, across each flight's run", () => {
    // The issue's second flight runs 1400 mm west: 5 divisions of 280 mm, so four treads, and
    // each is a vertical line, because that flight runs along x.
    const nodes = inkOf(planOf(L_STAIR));
    const treads = linesOf(nodes).filter(
      (l) => l.a.x === l.b.x && l.a.x > 100 && l.a.x < 1500 && Math.abs(l.a.y - l.b.y) === 1000,
    );
    expect(treads.map((l) => l.a.x).sort((a, b) => a - b)).toEqual([380, 660, 940, 1220]);
  });

  it("one break line, on the flight below the walk's midpoint, whatever `dir` says", () => {
    // Walked 1000 + 1000 + 1400 = 3400: the midpoint, 1700, is on the landing, so the cut is on
    // the flight before it. A copy on the storey above keeps its cut.
    for (const dir of ["up", "down"] as const) {
      const cut = linesOf(inkOf(planOf(L_STAIR, dir))).filter((l) => l.a.x !== l.b.x && l.a.y !== l.b.y && !isBarb(l));
      expect(cut.length).toBe(2);
      for (const l of cut)
        expect(inside([1500, 1100, 1000, 1000], (l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2)).toBe(true);
    }
  });

  /** A barb: the arrowhead's short diagonal, which ends on the walking line. */
  const isBarb = (l: { a: { x: number; y: number }; b: { x: number; y: number } }): boolean =>
    Math.abs(l.a.x - l.b.x) < 200 || Math.abs(l.a.y - l.b.y) < 200
      ? Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) < 400
      : false;

  it("a square flight keeps treads beside its cut", () => {
    // A full cut, as a straight stair draws one, would omit all three treads of this flight.
    const treads = linesOf(inkOf(planOf(L_STAIR))).filter(
      (l) => l.a.y === l.b.y && l.a.y > 1100 && l.a.y < 2100 && Math.abs(l.a.x - l.b.x) === 1000,
    );
    expect(treads.length).toBe(2);
  });

  it("no height enters the drawing", () => {
    const src = planOf(L_STAIR);
    const tall = planOf(L_STAIR, "up", "  height 2750\n");
    const short = planOf(L_STAIR, "up", "  height 3300\n");
    expect(compile(tall, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    expect(compile(short, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  /** The two diagonals of the break line: the only slanted lines not in the walking line's ink,
   *  whose last stroke is the arrowhead's barb. */
  const cutOf = (lines: ReturnType<typeof linesOf>) =>
    lines.filter((l) => l.ink !== lines.at(-1)!.ink && l.a.x !== l.b.x && l.a.y !== l.b.y);

  it("the estimate is an upper bound on what a block draws", () => {
    for (const s of BLOCK_STAIRS) {
      for (const dir of ["up", "down"] as const) {
        const src = planOf(s, dir);
        const v = verticalsOf(resolvePlan(src).ir!)[0]!;
        expect(BUILTIN_REGISTRY.byKind.get("stair")!.drawCost!(v)).toBeGreaterThanOrEqual(inkOf(src).length);
      }
    }
  });

  it("every line stands inside the bounds but the break line's two diagonals", () => {
    for (const s of BLOCK_STAIRS) {
      for (const dir of ["up", "down"] as const) {
        const src = planOf(s, dir);
        const pts = BUILTIN_REGISTRY.byKind.get("stair")!.bounds(verticalsOf(resolvePlan(src).ir!)[0]!);
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const lines = linesOf(inkOf(src));
        const cut = cutOf(lines);
        expect(cut.length).toBe(2);
        for (const l of lines.filter((x) => !cut.includes(x))) {
          for (const p of [l.a, l.b]) {
            expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs));
            expect(p.x).toBeLessThanOrEqual(Math.max(...xs));
            expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys));
            expect(p.y).toBeLessThanOrEqual(Math.max(...ys));
          }
        }
      }
    }
  });

  it("the break line overshoots the flight band by 6% of the width, and stays on the run", () => {
    for (const s of BLOCK_STAIRS) {
      for (const dir of ["up", "down"] as const) {
        const cut = cutOf(linesOf(inkOf(planOf(s, dir))));
        const mid = { x: (cut[0]!.a.x + cut[0]!.b.x) / 2, y: (cut[0]!.a.y + cut[0]!.b.y) / 2 };
        const flights = s.pieces.filter((_, i) => i % 2 === 0);
        const held = flights.findIndex((r) => inside(r, mid.x, mid.y));
        const r = flights[held]!;
        const upThePage = s.tails[held] === "top" || s.tails[held] === "bottom";
        const centre = upThePage ? r[0] + r[2] / 2 : r[1] + r[3] / 2;
        const [from, to] = upThePage ? [r[1], r[1] + r[3]] : [r[0], r[0] + r[2]];
        const reach = s.width / 2 + s.width * 0.06;
        for (const l of cut) {
          const ends = [l.a, l.b].map((p) => (upThePage ? p.x - centre : p.y - centre)).sort((a, b) => a - b);
          expect(ends[0]).toBeCloseTo(-reach, 6);
          expect(ends[1]).toBeCloseTo(reach, 6);
          for (const p of [l.a, l.b]) {
            const along = upThePage ? p.y : p.x;
            expect(along).toBeGreaterThanOrEqual(from);
            expect(along).toBeLessThanOrEqual(to);
          }
        }
      }
    }
  });

  it("so `bounds()` is 60 mm short of the ink on a 1000 mm flight at the box's edge, as a straight stair's is", () => {
    // The quarter-turn's first flight stands on the box's east edge, x 2500.
    const xs = cutOf(linesOf(inkOf(planOf(L_STAIR)))).flatMap((l) => [l.a.x, l.b.x]);
    expect(Math.max(...xs)).toBeCloseTo(2560, 6);
    const straight = hallPlan("    stair id=s at (500,500) size 1000x3000 dir up");
    const nodes = linesOf(inkOf(straight));
    const slanted = nodes.filter((l) => l.a.x !== l.b.x && l.a.y !== l.b.y && Math.abs(l.a.x - l.b.x) > 1000);
    const ends = slanted.flatMap((l) => [l.a.x, l.b.x]);
    expect(Math.min(...ends)).toBeCloseTo(440, 6);
    expect(Math.max(...ends)).toBeCloseTo(1560, 6);
  });
});

describe("no surface falls over on the form", () => {
  it.each(BLOCK_STAIRS.map((s) => [s.name, s] as const))("%s: every output, fact and transform", (_n, s) => {
    const src = planOf(s, "up", "  height 2750\n");
    const c = compile(src, { noCache: true });
    expect(c.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Through the Scene, on the stair's own CAD layer; no new layer.
    const dxf = toDxf(c.scene!);
    expect(dxf).toContain("A-FLOR-STRS");
    expect(renderAscii(c.scene!).length).toBeGreaterThan(0);
    expect(compile(src, { noCache: true, overlays: ["circulation"] }).svg).toContain("<svg");
    expect(compile(src, { noCache: true, annotate: true }).svg).toContain("data-arch");
    const facts = describePlan(src, { facts: ["symmetry", "syntax", "clearances", "depends"] });
    expect(facts.verticals?.length).toBe(1);
    expect(lintWithCoverage(src).diagnostics.length).toBeGreaterThanOrEqual(0);
    expect(taste(src).score).toBeDefined();
    // Plan JSON has no stair, and says the statement is dropped.
    expect(planToJson(src).dropped).toContainEqual({ clause: "stair", count: 1, ids: ["s"] });
    // `finish` keeps its furniture off every piece, through the same zones lint reads.
    const done = finish(src).source;
    expect(compile(done, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(lint(done).filter((d) => d.code === "W_FURNITURE_ON_STAIR")).toEqual([]);
    expect(repair(src).source).toContain("flight at");
  });

  it("`impact` sees a piece move inside an unchanged box", () => {
    const moved: BlockStair = {
      ...U_STAIR,
      pieces: [U_STAIR.pieces[0]!, U_STAIR.pieces[1]!, [1600, 2000, 1100, 2000]],
    };
    const a = planOf(U_STAIR);
    const b = planOf(moved);
    expect(stairOf(b).size).toEqual(stairOf(a).size);
    expect(stairOf(b).at).toEqual(stairOf(a).at);
    expect(JSON.stringify(impact(a, a).changed)).not.toContain('"s"');
    expect(JSON.stringify(impact(a, b).changed)).toContain('"s"');
  });

  it("`keep stacked` reads the box, as it reads any footprint", () => {
    const src = `plan "Two" {
  units mm
  level 1 {
${hallBody(stairBlock(L_STAIR, "up"))}
  }
  level 2 {
${hallBody(stairBlock(L_STAIR, "down"))}
  }
  keep stacked s on levels 1 2
}
`;
    const violated = (s: string) =>
      compile(s, { noCache: true }).diagnostics.filter((d) => d.code === "W_KEEP_VIOLATED").length;
    expect(codes(src)).toEqual([]);
    expect(violated(src)).toBe(0);
    const moved: BlockStair = { ...L_STAIR, pieces: L_STAIR.pieces.map((p) => [p[0] + 300, p[1], p[2], p[3]]) };
    const off = src.replace(stairBlock(L_STAIR, "down"), stairBlock(moved, "down"));
    expect(off).not.toBe(src);
    expect(violated(off)).toBe(1);
  });

  it("a component draws one at each `place`, its pieces read through its parameters", () => {
    const src = `plan "p" {
  units mm
  component flightsOf(w, x) {
    stair id=s dir up width w {
      flight at (x,1000) size w x 1000
      landing at (x,0) size w x 1000
      flight at (x + w,0) size 2 * w x 1000
    }
  }
  place flightsOf(1000, 0) as a at (0,0)
  place flightsOf(800, 0) as b at (5000,0) mirror x
}
`;
    expect(codes(src)).toEqual([]);
    const { ir } = resolvePlan(src);
    const [a, b] = verticalsOf(ir!) as RStair[];
    expect(a!.id).toBe("a.s");
    expect(a!.flights!.map((f) => f.tail)).toEqual(["bottom", "left"]);
    // Mirrored: the second flight now runs the other way across the sheet.
    expect(b!.flights!.map((f) => f.tail)).toEqual(["bottom", "right"]);
    expect(b!.width).toBe(800);
    expect(b!._mirror).toBe(true);
  });

  it("every expression of the block is walked, in source order, so rename and hover reach them", () => {
    const src = hallPlan(
      stairBlock(L_STAIR).replace("width 1000", "width w").replace("(1500,1100)", "(a,1100)"),
      "  let w = 1000\n  let a = 1500\n",
    );
    const { plan } = parse(src, BUILTIN_REGISTRY);
    const stmt = plan!.body.find((s) => s.kind === "stair")!;
    const all = statementExprs(stmt);
    expect(all.length).toBe(1 + 3 * 4);
    // The two named reads carry spans, and come first and second as the source does.
    const named = all.flatMap((e) => {
      const span = exprSpan(e);
      return span ? [src.slice(span.start, span.end)] : [];
    });
    expect(named).toEqual(["w", "a"]);
    expect(exprSpan(all[0]!)).toBeDefined();
    expect(exprSpan(all[1]!)).toBeDefined();
  });
});

describe("the bounds of the form", () => {
  it("a long flight is E_RUN_TOO_LONG, at the flight", () => {
    const src = hallPlan(`    stair id=s dir up width 1000 {
      flight at (1500,1100) size 1000x1000
      landing at (1500,100) size 1000x1000
      flight at (-398500,100) size 400000x1000
    }`);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_RUN_TOO_LONG")!;
    expect(d.message).toContain("flight 2");
    expect(src.slice(d.span!.start, d.span!.end)).toBe("flight at (-398500,100) size 400000x1000");
  });

  it("a piece past the modelling range is E_OUT_OF_RANGE alone", () => {
    const src = hallPlan(`    stair id=s dir up width 1000 {
      flight at (1500,1100) size 1000x1000
      landing at (1500,100) size 1000x1000
      flight at (-39998500,100) size 40000000x1000
    }`);
    expect(codes(src)).toContain("E_OUT_OF_RANGE");
    expect(codes(src)).not.toContain("E_NON_FINITE");
  });

  it("a landing longer than the range is E_OUT_OF_RANGE with both its corners inside it", () => {
    // 60,000,000 mm from -30,000,000: no corner is past MODEL_RANGE_MM, so only its length tells.
    const landing = (x: number, w: number): string =>
      hallPlan(`    stair id=s dir up width 1000 {
      flight at (1500,1100) size 1000x1000
      landing at (${x},100) size ${w}x1000
      flight at (1500,-900) size 1000x1000
    }`);
    expect(codes(landing(1500, 1000))).toEqual([]);
    expect(codes(landing(-30000000, 60000000))).toContain("E_OUT_OF_RANGE");
  });

  it("each piece counts toward the element budget, before anything is built", () => {
    const rows: string[] = [];
    for (let i = 0; i <= MAX_ELEMENTS; i++) {
      rows.push(`${i % 2 === 0 ? "flight" : "landing"} at (0,${i * 1000}) size 1000x1000`);
    }
    const src = `plan "p" {\n  units mm\n  stair id=s dir up width 1000 {\n    ${rows.join("\n    ")}\n  }\n}\n`;
    expect(codes(src)).toEqual(["E_ELEMENT_LIMIT"]);
  });

  it("comparing every pair is charged to the step meter before the comparing", () => {
    const rows: string[] = [];
    for (let i = 0; i < 3501; i++) rows.push(`${i % 2 === 0 ? "flight" : "landing"} at (0,${i * 1000}) size 1000x1000`);
    const src = `plan "p" {\n  units mm\n  stair id=s dir up width 1000 {\n    ${rows.join("\n    ")}\n  }\n}\n`;
    expect(codes(src)).toEqual(["E_STEP_LIMIT"]);
  });

  it("a long block that is legal compiles, in line", () => {
    const rows: string[] = [];
    for (let i = 0; i < 41; i++) rows.push(`${i % 2 === 0 ? "flight" : "landing"} at (0,${i * 1000}) size 1000x1000`);
    const src = `plan "p" {\n  units mm\n  stair id=s dir up width 1000 {\n    ${rows.join("\n    ")}\n  }\n}\n`;
    expect(codes(src)).toEqual([]);
    expect(stairOf(src).flights!.length).toBe(21);
  });
});

describe("every reader of the footprint reads the pieces, not the box", () => {
  /** An L round the south-east of a hall: its box is the whole room, and the notch is the floor
   *  the front door and the store's door both open onto. */
  const NOTCH = `plan "Notch" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,3000) (0,3000) close }
  wall id=mid partition thickness 100 { (3000,0) (3000,3000) }
  room id=hall at (0,0) size 3000x3000 label "Hall" uses hall
  room id=store at (3000,0) size 2000x3000 label "Store" uses storage
  door id=front at (2000,3000) width 900 wall shell swing in
  door id=ds at (3000,2000) width 800 wall mid swing in
  stair id=s dir up width 900 {
    flight at (100,1100) size 900x1400
    landing at (100,100) size 1000x1000
    flight at (1100,100) size 1800x900
  }
}
`;

  it("the fixture is what it claims: the box covers both doors and the pieces neither", () => {
    expect(codes(NOTCH)).toEqual([]);
    const s = stairOf(NOTCH);
    expect(s.at.x + s.size.w).toBe(2900);
    expect(s.at.y + s.size.h).toBe(2500);
    for (const r of piecesOf(s)) expect(inside([r.x, r.y, r.w, r.h], 2000, 2000)).toBe(false);
  });

  it("the walking grid sees the notch as floor: the store behind it is reached", () => {
    const d = describePlan(NOTCH);
    expect(d.circulation!.rooms.map((r) => r.roomId).sort()).toEqual(["hall", "store"]);
    expect(d.circulation!.blocked).toBeUndefined();
    expect(lint(NOTCH).filter((x) => x.code === "W_ROOM_NO_CLEAR_PATH")).toEqual([]);
  });

  it("one obstacle per piece, open only on the flight boarded, each naming its run", () => {
    for (const dir of ["up", "down"] as const) {
      const s = stairOf(planOf(THREE_FLIGHTS, dir));
      const obs = verticalObstacles([s]);
      expect(obs.map((o) => o.rect)).toEqual(piecesOf(s));
      expect(obs.every((o) => o.run === "s")).toBe(true);
      const open = obs.flatMap((o, i) => (o.open.length > 0 ? [i] : []));
      expect(open).toEqual([dir === "up" ? 0 : 4]);
      expect(obs[open[0]!]!.open).toEqual([dir === "up" ? "bottom" : "bottom"]);
    }
  });

  it("the room of a stair is where you step on, never the centre of its box", () => {
    // Two rooms: the box's centre stands in the first, the boarded flight in the second.
    const src = `plan "Two rooms" {
  units mm
  room id=a at (0,0) size 3000x6000
  room id=b at (3000,0) size 3000x6000
  stair id=s dir up width 1000 {
    flight at (3500,3000) size 1000x2000
    landing at (3500,2000) size 1000x1000
    flight at (500,2000) size 3000x1000
  }
}
`;
    const { ir } = resolvePlan(src);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    const s = stairOf(src);
    const box = { x: s.at.x + s.size.w / 2, y: s.at.y + s.size.h / 2 };
    expect(box.x).toBeLessThan(3000 + 500);
    expect(roomOfVertical(s, rooms)).toBe("b");
    expect(roomOfVertical({ ...s, dir: "down", _tail: "left" }, rooms)).toBe("a");
  });

  it("furniture in the notch is on nothing, on a piece it is on the stair", () => {
    const with_ = (cat: string, at: string): string =>
      NOTCH.replace("  stair id=s", `  furniture ${cat} at ${at} size 600x600\n  stair id=s`);
    const on = (src: string) => lint(src).filter((d) => d.code === "W_FURNITURE_ON_STAIR").length;
    expect(on(with_("sofa", "(1500,1500)"))).toBe(0);
    expect(on(with_("sofa", "(200,200)"))).toBe(1);
    expect(on(with_("sofa", "(1800,200)"))).toBe(1);
    expect(on(with_("sofa", "(200,1400)"))).toBe(1);
  });

  it("a door swinging in the notch is over no stair; one over a piece is", () => {
    const swings = (src: string) => lint(src).filter((d) => d.code === "W_SWING_OVER_STAIR").length;
    expect(swings(NOTCH)).toBe(0);
    const over = NOTCH.replace(
      "door id=ds at (3000,2000) width 800 wall mid swing in",
      "door id=ds at (3000,500) width 800 wall mid swing into hall",
    );
    expect(codes(over)).toEqual([]);
    expect(swings(over)).toBe(1);
  });

  it("a label in the notch overprints nothing; one pinned on a piece does", () => {
    const pinned = (at: string): string => NOTCH.replace('label "Hall" uses hall', `label "Hall" at ${at} uses hall`);
    const over = (src: string) =>
      lint(src).filter((d) => d.code === "W_ANNOTATION_OVERLAP" && d.message.includes('"Hall"')).length;
    expect(over(pinned("(2000,1800)"))).toBe(0);
    expect(over(pinned("(600,600)"))).toBe(1);
  });

  it("one door beside two flights is one warning", () => {
    const src = `plan "Side" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=r at (0,0) size 6000x6000 uses hall
  wall id=mid partition thickness 100 { (1150,2000) (1150,3800) }
  door id=d at (1150,2900) width 800 wall mid swing in
  door id=front at (3000,6000) width 900 wall shell swing in
  stair id=s dir up width 1000 {
    flight at (100,2000) size 1000x1800
    landing at (100,1000) size 2100x1000
    flight at (1200,2000) size 1000x1800
  }
}
`;
    expect(codes(src)).toEqual([]);
    expect(lint(src).filter((d) => d.code === "W_STAIR_SIDE_ENTRY").length).toBe(1);
    // A doorway onto the landing's side is how a landing is meant to be reached.
    const onLanding = src.replace(
      "wall id=mid partition thickness 100 { (1150,2000) (1150,3800) }",
      "wall id=mid partition thickness 100 { (2300,1000) (2300,2000) }",
    );
    const moved = onLanding.replace("door id=d at (1150,2900)", "door id=d at (2300,1500)");
    expect(codes(moved)).toEqual([]);
    expect(lint(moved).filter((d) => d.code === "W_STAIR_SIDE_ENTRY")).toEqual([]);
  });

  it("the floor the stair wraps round is not assigned by it", () => {
    // A walled closet with no room in it, its floor the notch of the stair: a box would call
    // the floor covered, and the pieces leave most of it in no room.
    const src = `plan "Bare" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
  room id=r at (0,0) size 5000x1000 uses hall
  door id=front at (3000,0) width 900 wall shell swing in
  stair id=s dir up width 1000 {
    flight at (1100,3900) size 3800x1000
    landing at (100,3900) size 1000x1000
    flight at (100,1000) size 1000x2900
  }
}
`;
    expect(codes(src)).toEqual([]);
    expect(lint(src).filter((d) => d.code === "W_FLOOR_UNASSIGNED").length).toBe(1);
  });
});

describe("arrival on a block stair", () => {
  /** The issue's L, moved clear of the west wall its head stands against: from there the storey
   *  above can be walked. */
  const CLEAR: BlockStair = { ...L_STAIR, pieces: L_STAIR.pieces.map((p) => [p[0] + 1000, p[1] + 1000, p[2], p[3]]) };

  /** A hall with the front door below; the same block above, the only way in up there. */
  const twoStorey = (above = "", s: BlockStair = CLEAR): string => `plan "Two" {
  units mm
  level 1 "Ground" {
${hallBody(stairBlock(s, "up"))}
  }
  level 2 "Upper" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=up at (0,0) size 6000x6000 label "Landing" uses hall circulation
${stairBlock(s, "down")}
${above}
  }
}
`;

  it("compiles, joins one shaft, and walks the upper storey from the last flight's head", () => {
    const src = twoStorey();
    expect(codes(src)).toEqual([]);
    const d = describePlan(src);
    expect(d.vertical!.connections.map((c) => c.id)).toEqual(["s"]);
    expect(d.vertical!.reachable_levels).toEqual([1, 2]);
    const up = d.levels!.find((l) => l.level === 2)!;
    expect(up.circulation!.entranceId).toBe("s");
    expect(up.circulation!.rooms.map((r) => r.roomId)).toEqual(["up"]);
    // Across the last flight's head, its 1000 mm width: that flight's footprint, not the box's
    // 2000 mm height.
    expect(up.circulation!.rooms[0]!.bottleneckClearWidthMm).toBe(1000);
  });

  /**
   * The walk upstairs, worked out on a lattice of its own from the plain numbers of the fixture,
   * the way `test/circulation-hand-derived.test.ts` does for a door: 100 mm cells over a wall-less
   * room, a cell blocked inside any piece or within the 300 mm body radius of one, the halo lifted
   * only beyond the boarded flight's entry edge, seeds in the row of cells beyond that edge, and
   * four-connected steps to the free cell nearest the room's centre that the walk can reach.
   */
  const latticeWalk = (s: BlockStair, tail: Side, w: number, h: number): number => {
    const boarded = s.pieces[s.pieces.length - 1]!;
    const past = (r: Rect, cx: number, cy: number): boolean =>
      tail === "left" ? cx < r[0] : tail === "right" ? cx > r[0] + r[2] : tail === "top" ? cy < r[1] : cy > r[1] + r[3];
    const gap = (r: Rect, cx: number, cy: number): number =>
      Math.hypot(Math.max(0, r[0] - cx, cx - r[0] - r[2]), Math.max(0, r[1] - cy, cy - r[1] - r[3]));
    const free = (cx: number, cy: number): boolean =>
      s.pieces.every((r) => !inside(r, cx, cy) && (gap(r, cx, cy) > 300 || (r === boarded && past(r, cx, cy))));
    const nx = w / 100;
    const ny = h / 100;
    const key = (i: number, j: number): number => j * nx + i;
    const hops = new Map<number, number>();
    let front: [number, number][] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const [cx, cy] = [50 + 100 * i, 50 + 100 * j];
        const beyond =
          (tail === "left" || tail === "right"
            ? cy >= boarded[1] && cy <= boarded[1] + boarded[3]
            : cx >= boarded[0] && cx <= boarded[0] + boarded[2]) &&
          (tail === "left"
            ? cx < boarded[0] && cx >= boarded[0] - 100
            : tail === "right"
              ? cx > boarded[0] + boarded[2] && cx <= boarded[0] + boarded[2] + 100
              : tail === "top"
                ? cy < boarded[1] && cy >= boarded[1] - 100
                : cy > boarded[1] + boarded[3] && cy <= boarded[1] + boarded[3] + 100);
        if (beyond && free(cx, cy)) {
          hops.set(key(i, j), 0);
          front.push([i, j]);
        }
      }
    }
    for (let d = 1; front.length > 0; d++) {
      const next: [number, number][] = [];
      for (const [i, j] of front) {
        for (const [a, b] of [
          [i + 1, j],
          [i - 1, j],
          [i, j + 1],
          [i, j - 1],
        ] as const) {
          if (a < 0 || b < 0 || a >= nx || b >= ny || hops.has(key(a, b))) continue;
          if (!free(50 + 100 * a, 50 + 100 * b)) continue;
          hops.set(key(a, b), d);
          next.push([a, b]);
        }
      }
      front = next;
    }
    let best = Number.POSITIVE_INFINITY;
    let walk = Number.POSITIVE_INFINITY;
    for (const [k, d] of hops) {
      const [i, j] = [k % nx, Math.floor(k / nx)];
      const dist = Math.hypot(50 + 100 * i - w / 2, 50 + 100 * j - h / 2);
      if (dist < best || (dist === best && d * 100 < walk)) {
        best = dist;
        walk = d * 100;
      }
    }
    return walk;
  };

  const moved = (s: BlockStair, dx: number, dy: number): BlockStair => ({
    ...s,
    pieces: s.pieces.map((p) => [p[0] + dx, p[1] + dy, p[2], p[3]]),
  });

  /** Two storeys of `s`, the upper one a bare `w` × `h` room with the block drawn `dir down`, the
   *  whole plan standing at (`ox`,`oy`). */
  const bareUpper = (s: BlockStair, w: number, h: number, ox = 0, oy = 0): string => {
    const [x1, y1] = [ox + w, oy + h];
    const here = moved(s, ox, oy);
    return `plan "Two" {
  units mm
  level 1 "Ground" {
    room id=g at (${ox},${oy}) size ${w}x${h} uses hall
    wall id=shell exterior thickness 200 { (${ox},${oy}) (${x1},${oy}) (${x1},${y1}) (${ox},${y1}) close }
    door id=front at (${x1},${y1 - 400}) width 600 wall shell swing in
${stairBlock(here, "up")}
  }
  level 2 "Upper" {
    room id=up at (${ox},${oy}) size ${w}x${h} uses hall circulation
${stairBlock(here, "down")}
  }
}
`;
  };

  it.each([
    // The room's centre stands in the notch of the L, floor that only the pieces leave free.
    ["an L, to the floor it wraps round", CLEAR, 3600, 5000],
    ["an L, past its first flight", CLEAR, 6000, 6000],
    ["a half-turn", moved(U_STAIR, 1000, 500), 6000, 7000],
    ["a short-axis flight", moved(SHORT_AXIS, 1000, 500), 7000, 7000],
    ["three flights", moved(THREE_FLIGHTS, 1000, 500), 7000, 7000],
  ] as const)("the walk upstairs agrees with a lattice of its own: %s", (_n, s, w, h) => {
    const src = bareUpper(s, w, h);
    expect(codes(src)).toEqual([]);
    // Climbing, the last flight leaves by the edge opposite its foot: down, that edge is its tail.
    const head = OPPOSITE[s.tails[s.tails.length - 1]!];
    const up = describePlan(src).levels!.find((l) => l.level === 2)!;
    expect(up.circulation!.rooms.map((r) => r.walkDistanceMm)).toEqual([latticeWalk(s, head, w, h)]);
    // The flight's own width crosses the head, whatever the box's extent is.
    expect(up.circulation!.rooms[0]!.bottleneckClearWidthMm).toBe(
      head === "left" || head === "right" ? s.pieces[s.pieces.length - 1]![3] : s.pieces[s.pieces.length - 1]![2],
    );
    // The lattice stands at the origin, and a walk does not know where the plan is: every piece
    // moves into the grid's frame with the room, or the walk is measured round a stair elsewhere.
    const away = describePlan(bareUpper(s, w, h, 1500, 700)).levels!.find((l) => l.level === 2)!;
    expect(away.circulation!.rooms.map((r) => r.walkDistanceMm)).toEqual([latticeWalk(s, head, w, h)]);
  });

  it("the head of the last flight stands short of the stair's own first flight: no landing", () => {
    // Up, right along the landing, down, then back west to a head at `headX`, facing the first
    // flight's east face at x 2000. The other pieces stay obstacles, so that face keeps the 300 mm
    // the body needs: 400 mm is floor to step onto and 200 mm is not.
    const spiral = (headX: number): BlockStair => ({
      name: "spiral",
      width: 1000,
      pieces: [
        [1000, 3000, 1000, 2000],
        [1000, 2000, 3800, 1000],
        [3800, 3000, 1000, 1000],
        [3800, 4000, 1000, 1000],
        [headX, 4000, 3800 - headX, 1000],
      ],
      tails: ["bottom", "top", "right"],
    });
    const walked = (headX: number): number => {
      const src = bareUpper(spiral(headX), 6000, 6000);
      expect(codes(src)).toEqual([]);
      const up = describePlan(src).levels!.find((l) => l.level === 2)!;
      return up.circulation!.rooms.filter((r) => r.walkDistanceMm !== undefined).length;
    };
    expect(walked(2400)).toBe(1);
    expect(walked(2200)).toBe(0);
  });

  it("each storey's stop stands in the room of the flight boarded there", () => {
    const d = describePlan(twoStorey());
    expect(d.vertical!.connections[0]!.stops.map((s) => [s.level, s.dir, s.room])).toEqual([
      [1, "up", "r"],
      [2, "down", "up"],
    ]);
  });

  /** A straight stair `t` climbing on through the middle storey, where it has an arrival edge of
   *  its own, beside a block stair `s` of three obstacles: the positional pairing's trap. */
  const middle = (blockFirst: boolean): string => {
    const t = (dir: string) => `stair id=t at (4000,1000) size 1000x3000 dir ${dir}`;
    const block = (dir: "up" | "down") => stairBlock(CLEAR, dir);
    const both = (dir: "up" | "down", td: string) =>
      blockFirst ? `${block(dir)}\n    ${t(td)}` : `    ${t(td)}\n${block(dir)}`;
    const shell = `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=up at (0,0) size 6000x6000 label "Landing" uses hall circulation`;
    return `plan "Three" {
  units mm
  level 1 "Ground" {
${hallBody(both("up", "up"))}
  }
  level 2 "Middle" {
    ${shell}
${both("up", "up")}
  }
  level 3 "Top" {
    ${shell}
${both("down", "down")}
  }
}
`;
  };

  it("a flatMap of the obstacles does not pair them with the wrong run", () => {
    const first = middle(true);
    expect(codes(first)).toEqual([]);
    // Would be a TypeError on `verticals[i]` once the obstacles outnumber the runs.
    const walk = (src: string) => describePlan(src).levels!.find((l) => l.level === 2)!.circulation!;
    const a = walk(first);
    const b = walk(middle(false));
    expect(a.rooms.length).toBeGreaterThan(0);
    // `entranceId` is the first run in source order, the one thing the two spellings differ in.
    expect(a.rooms).toEqual(b.rooms);
    expect([a.entranceId, b.entranceId]).toEqual(["s", "t"]);
  });

  it("the arriving straight flight's extra edge lands on its own obstacle", () => {
    // Declared after the block, `t` is the fourth obstacle and the second run. If the edge went
    // by position it would open the landing, which `t` has nothing to do with.
    const lint1 = lintWithCoverage(middle(true));
    const lint2 = lintWithCoverage(middle(false));
    const key = (x: { diagnostics: Diagnostic[] }) => x.diagnostics.map((d) => d.code).sort();
    expect(key(lint1)).toEqual(key(lint2));
  });

  it("declaration order moves nothing on a plain two-storey arrival either", () => {
    expect(describePlan(twoStorey(), {}).levels![1]!.circulation).toEqual(
      describePlan(twoStorey(`    column at (5000,5000) size 200x200`), {}).levels![1]!.circulation,
    );
  });
});

describe("what lint says of a block stair until S2 and S3, deliberately strict", () => {
  const skipped = (src: string): boolean =>
    (lintWithCoverage(src).coverage?.families ?? []).some((f) => f.skipped?.some((s) => s.reason === "block-stair"));

  it("W_STAIR_TOO_STEEP reads the flights' sum and allows nothing for a landing, and says so", () => {
    const src = planOf(L_STAIR, "up", "  height 2750\n");
    const ds = lint(src).filter((d) => d.code === "W_STAIR_TOO_STEEP");
    expect(ds.length).toBe(1);
    // 1000 + 1400, not the box's 2000; the 2640 is a straight flight's, 220 more than the form
    // will owe once a landing counts.
    expect(ds[0]!.message).toContain("its 2400 mm run");
    expect(ds[0]!.message).toContain("a 2640 mm run (240 mm short)");
    expect(skipped(src)).toBe(true);
  });

  it("clearances report the sum, and the same strict figure", () => {
    const d = describePlan(planOf(L_STAIR, "up", "  height 2750\n"), { facts: ["clearances"] });
    expect(d.clearances!.stairs).toMatchObject([{ id: "s", run_mm: 2400, min_run_mm: 2640 }]);
  });

  it("the foot landing is the boarded flight's, read beyond its own edge", () => {
    // The first flight's foot is 800 mm from the south wall's face of a 3 m hall, in a plan where
    // the box's bottom edge is the same line: what moves it is the flight, not the box.
    const src = `plan "Foot" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  room id=r at (0,0) size 6000x3000 uses hall
  door id=front at (5000,3000) width 900 wall shell swing in
  stair id=s dir up width 1000 {
    flight at (300,1100) size 1000x1800
    landing at (300,100) size 1000x1000
    flight at (1300,100) size 1400x1000
  }
}
`;
    const ds = lint(src).filter((d) => d.code === "W_STAIR_NO_LANDING");
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toContain("at its foot");
    // The first flight stops well short of the box's bottom edge here, and the wall that stands
    // in front of it is nowhere near the box's: a box would read clear floor.
    const short = `plan "Foot" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=p partition thickness 100 { (100,3300) (1600,3300) }
  room id=r at (0,0) size 6000x6000 uses hall
  door id=front at (5000,6000) width 900 wall shell swing in
  stair id=s dir up width 1000 {
    flight at (500,2000) size 1000x1000
    landing at (500,1000) size 2200x1000
    flight at (1700,2000) size 1000x3000
  }
}
`;
    expect(codes(short)).toEqual([]);
    const near = lint(short).filter((d) => d.code === "W_STAIR_NO_LANDING");
    expect(near.map((d) => d.message.includes("at its foot"))).toEqual([true]);
  });

  it("a block in line agrees with a straight flight on the foot and the head it owes", () => {
    const landingsOf = (src: string) =>
      (describePlan(src, { facts: ["clearances"] }).clearances!.stairs as { landings: unknown[] }[])[0]!.landings;
    const straight = (dir: string) => hallPlan(`    stair id=s at (1000,600) size 1000x3800 dir ${dir}`);
    expect(landingsOf(planOf(STRAIGHT_LANDING, "up"))).toEqual(landingsOf(straight("up")));
    expect(landingsOf(planOf(STRAIGHT_LANDING, "down"))).toEqual(landingsOf(straight("down")));
  });

  it("the head landing on a `dir down` stop is the last flight's", () => {
    const d = describePlan(planOf(L_STAIR, "down"), { facts: ["clearances"] });
    // The last flight's left edge stands against the west wall.
    expect(d.clearances!.stairs).toMatchObject([{ landings: [{ end: "head", by: { kind: "wall" } }] }]);
  });

  it("the shaft check keeps the box overlap, and does not cry wolf on the axis of an L", () => {
    const s = L_STAIR;
    const src = `plan "Two" {
  units mm
  level 1 "Ground" {
${hallPlan(stairBlock(s, "up")).split("\n").slice(2, -2).join("\n")}
  }
  level 2 "Upper" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=up at (0,0) size 6000x6000 uses hall circulation
${stairBlock(s, "down")}
  }
}
`;
    expect(lint(src).filter((d) => d.code === "W_SHAFT_FOOTPRINT_MISMATCH")).toEqual([]);
    expect(skipped(src)).toBe(true);
  });

  it("a block drawn elsewhere on the next storey is still a mismatch, on the box", () => {
    const moved: BlockStair = { ...U_STAIR, pieces: U_STAIR.pieces.map((p) => [p[0] + 3100, p[1] + 2000, p[2], p[3]]) };
    const src = `plan "Two" {
  units mm
  level 1 "Ground" {
${hallPlan(stairBlock(U_STAIR, "up")).split("\n").slice(2, -2).join("\n")}
  }
  level 2 "Upper" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=up at (0,0) size 6000x6000 uses hall circulation
${stairBlock(moved, "down")}
  }
}
`;
    expect(lint(src).filter((d) => d.code === "W_SHAFT_FOOTPRINT_MISMATCH").length).toBe(1);
  });

  it("a straight stair's coverage never mentions the form", () => {
    const src = hallPlan("    stair id=s at (500,500) size 1000x3000 dir up", "  height 2750\n");
    expect(skipped(src)).toBe(false);
  });

  it("nothing reads a compliance claim into the form", () => {
    const src = planOf(L_STAIR, "up", "  height 2750\n");
    const text = lint(src)
      .map((d) => d.message)
      .join(" ");
    expect(text).not.toMatch(/complian|complies|conform|meets the/i);
  });
});
