/**
 * Laws of the joinery's SPLIT mode (`joinWalls(…, faces)`, `JoinerySplit` in
 * `src/geometry/joinery.ts`) — what lets the DXF file exterior and interior walls on separate
 * layers without a second ownership authority.
 *
 * 1. **Inert.** Asking for a split changes neither the outline nor any fill: the drawing is
 *    the same with or without it.
 * 2. **The runs partition the outline.** Their total length is the outline's.
 * 3. **The (group, face) fills tile the group fill.** Their net areas sum to the group's,
 *    and at sample points no face claims a point twice, nor one the group fill lacks.
 * 4. **The tie POLICY.** At every probed point exactly one (group, face) fill claims it, and
 *    it is the one the policy names: the owner is the thickest wall covering the point (the
 *    lowest index among equal ones), and its face is the face listed FIRST among the walls of
 *    that thickness AND that group (hatch: material, scale and angle) covering the point —
 *    so an exterior wall wins a same-hatch tie whatever the statement order. Laws 1–3 hold
 *    for any face rule; this one pins the rule itself.
 *
 * All four run over every storey of every shipped example, over the joinery fuzz generator
 * (`test/helpers/arbitrary-joinery.ts`, the same pinned seed convention as
 * `test/joinery-oracle.test.ts`), and over 20 deterministic T-junction ties. Points are a
 * 41 x 41 grid plus probes a quarter-thickness off every band vertex (where junction squares
 * are; a grid alone rarely lands in one). Every quantity is read off the exact `EdgeLoop`s —
 * arcs included — so there is no tessellation in the tolerances.
 */

import { exampleNames } from "./helpers/corpus.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { distPointToSegment } from "../src/geometry.js";
import { distPointToArc } from "../src/geometry/arc.js";
import type { Edge, EdgeLoop } from "../src/geometry/band.js";
import {
  PointInterner,
  SNAP_MM,
  edgeEnd,
  edgeStart,
  loopArea,
  loopBBox,
  loopWinding,
  openingCut,
  wallBand,
} from "../src/geometry/band.js";
import type { JoineryCut, JoineryResult, JoineryWall } from "../src/geometry/joinery.js";
import { bandBBox, joinWalls, spanCell } from "../src/geometry/joinery.js";
import { hatchesUsed, hatchKey, hatchOf } from "../src/hatches.js";
import { compile } from "../src/index.js";
import type { SceneWall } from "../src/scene.js";
import { classifyWallSet, joinWallSet } from "../src/wall-lowering.js";
import type { World } from "../src/world.js";
import { type WallSpec, angledWalls, rectilinearWalls, renderWalls } from "./helpers/arbitrary-joinery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = 20261013;
const RUNS = Number(process.env.JOINERY_RUNS ?? 150);

const edgeLength = (e: Edge): number =>
  e.t === "arc" ? Math.abs(e.arc.r * e.arc.sweep) : Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
const totalLength = (loops: readonly EdgeLoop[]): number =>
  loops.reduce((s, l) => s + l.reduce((t, e) => t + edgeLength(e), 0), 0);
/** A region's net area: its loops are directed solid-on-the-right, so holes cancel. */
const netArea = (loops: readonly EdgeLoop[]): number => Math.abs(loops.reduce((s, l) => s + loopArea(l), 0));
const inside = (loops: readonly EdgeLoop[], p: Point): boolean =>
  loops.reduce((n, l) => n + loopWinding(l, p), 0) !== 0;
const edgeDist = (p: Point, e: Edge): number =>
  e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, e.a, e.b);
const close = (a: number, b: number, rel = 1e-9): boolean => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

/** Laws 1–4 for one join: a failure message (or null), and how many probed points were a
 *  same-group TIE between walls of different faces (so a caller can prove law 4 ran). */
function splitLaws(
  walls: readonly JoineryWall[],
  cuts: Parameters<typeof joinWalls>[1],
  groups: string[],
  faces: string[],
): { error: string | null; ties: number } {
  let ties = 0;
  const fail = (error: string) => ({ error, ties });
  const plain = joinWalls(walls, cuts, groups);
  const withSplit: JoineryResult = joinWalls(walls, cuts, groups, faces);
  if (JSON.stringify(withSplit.outline) !== JSON.stringify(plain.outline)) return fail("split mode moved the outline");
  if (JSON.stringify(withSplit.fills) !== JSON.stringify(plain.fills)) return fail("split mode moved a fill");
  const split = withSplit.split!;
  const runs = split.faces.flatMap((f) => f.runs);
  if (!close(totalLength(runs), totalLength(plain.outline))) {
    return fail(`runs ${totalLength(runs)} != outline ${totalLength(plain.outline)}`);
  }
  // Sample grid over the solid's box, skipping points within 1e-6 mm of any boundary.
  const all = [...plain.outline, ...split.fills.flatMap((f) => f.loops)].flat();
  if (all.length === 0) return { error: null, ties };
  const xs = all.flatMap((e) => (e.t === "arc" ? [e.arc.a.x, e.arc.b.x, e.arc.center.x] : [e.a.x, e.b.x]));
  const ys = all.flatMap((e) => (e.t === "arc" ? [e.arc.a.y, e.arc.b.y, e.arc.center.y] : [e.a.y, e.b.y]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const N = 41;
  const probes: Point[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++)
      probes.push({ x: x0 + ((x1 - x0) * (i + 0.37)) / N, y: y0 + ((y1 - y0) * (j + 0.61)) / N });
  }
  for (const w of walls) {
    const q = w.thickness / 4;
    for (const l of w.loops) {
      for (const e of l) {
        const v = e.t === "arc" ? e.arc.a : e.a;
        for (const [dx, dy] of [
          [q, q],
          [q, -q],
          [-q, q],
          [-q, -q],
        ] as const)
          probes.push({ x: v.x + dx, y: v.y + dy });
      }
    }
  }
  for (const fill of plain.fills) {
    const parts = split.fills.filter((f) => f.group === fill.group);
    const sum = parts.reduce((s, f) => s + netArea(f.loops), 0);
    if (!close(sum, netArea(fill.loops), 1e-9))
      return fail(`group ${fill.group}: faces' area ${sum} != ${netArea(fill.loops)}`);
  }
  // Every boundary a probe could sit on: the fills, the split fills, the bands and the cuts.
  const boundary = [
    ...plain.fills.flatMap((f) => f.loops),
    ...split.fills.flatMap((f) => f.loops),
    ...walls.flatMap((w) => w.loops),
    ...cuts.map((c) => c.loop),
  ].flat();
  const rank = (w: JoineryWall): number => faces.indexOf(w.face ?? "");
  for (const p of probes) {
    if (boundary.some((e) => edgeDist(p, e) < 1e-6)) continue;
    // The policy's answer at p, computed from the walls alone.
    let want: { group: string; face: string } | null = null;
    if (!cuts.some((c) => loopWinding(c.loop, p) !== 0)) {
      const covering = walls.filter((w) => inside(w.loops, p));
      if (covering.length > 0) {
        const t = Math.max(...covering.map((w) => w.thickness));
        const owner = covering.filter((w) => w.thickness === t).sort((a, b) => a.index - b.index)[0]!;
        const tied = covering.filter((w) => w.thickness === t && w.group === owner.group);
        const face = tied.reduce((best, w) => (rank(w) < rank(best) ? w : best), owner).face ?? "";
        if (new Set(tied.map((w) => w.face)).size > 1) ties++;
        want = { group: owner.group, face };
      }
    }
    const claims = split.fills.filter((f) => inside(f.loops, p));
    const got = claims.map((f) => `${f.group}/${f.face}`).join(",");
    const expected = want ? `${want.group}/${want.face}` : "";
    if (got !== expected) return fail(`(${p.x}, ${p.y}) is claimed by [${got}], the policy says [${expected}]`);
  }
  return { error: null, ties };
}

/** The joinery inputs of a Scene's walls, built exactly as `joinWallSet` builds them. */
function joineryInputs(walls: readonly SceneWall[], faceOf: (w: SceneWall) => string) {
  const intern = new PointInterner();
  const jwalls: JoineryWall[] = [];
  const cuts: JoineryCut[] = [];
  walls.forEach((w, index) => {
    const loops = wallBand(w, intern);
    if (loops.length > 0) {
      jwalls.push({
        index,
        id: "",
        thickness: w.thickness,
        group: hatchKey(hatchOf(w)),
        face: faceOf(w),
        loops,
        bbox: bandBBox(loops),
      });
    }
    for (const op of w.openings) {
      const loop = openingCut(w, op, intern);
      if (loop) cuts.push({ index: cuts.length, loop, bbox: loopBBox(loop) });
    }
  });
  return { walls: jwalls, cuts, groups: hatchesUsed(walls).map(hatchKey) };
}

const examplesWorld: World = {
  read: (p) => {
    try {
      return readFileSync(join(__dirname, "..", "examples", p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};

const EXAMPLES = exampleNames().sort();

describe("joinery split mode — laws over every shipped example", () => {
  for (const f of EXAMPLES) {
    it(`${f}: inert, runs partition the outline, face fills tile each group`, () => {
      const r = compile(readFileSync(join(__dirname, "..", "examples", f), "utf8"), {
        noCache: true,
        world: examplesWorld,
      });
      const scenes = r.pages ? r.pages.map((p) => p.scene) : [r.scene!];
      for (const scene of scenes) {
        const walls: readonly SceneWall[] = scene.walls ?? [];
        if (walls.length === 0) continue;
        // Re-derive the joinery inputs the way `classifyWallSet` does, and check the laws there.
        const keys = hatchesUsed(walls).map(hatchKey);
        const joined = joinWallSet(walls, keys, {
          faceOf: (w) => (w.category === "exterior" ? "EXTR" : "INTR"),
          faces: ["EXTR", "INTR"],
        })!;
        const split = joined.result.split!;
        expect(split.faces.map((x) => x.face)).toEqual(["EXTR", "INTR"]);
        const plain = joinWallSet(walls, keys)!.result;
        expect(JSON.stringify(joined.result.outline)).toBe(JSON.stringify(plain.outline));
        expect(JSON.stringify(joined.result.fills)).toBe(JSON.stringify(plain.fills));
        const runs = split.faces.flatMap((x) => x.runs);
        expect(close(totalLength(runs), totalLength(plain.outline))).toBe(true);
        for (const fill of plain.fills) {
          const parts = split.fills.filter((x) => x.group === fill.group);
          const sum = parts.reduce((s, x) => s + netArea(x.loops), 0);
          expect(close(sum, netArea(fill.loops))).toBe(true);
        }
        // And all four laws, point-sampled, on the same inputs `joinWallSet` builds.
        const inputs = joineryInputs(walls, (w) => (w.category === "exterior" ? "EXTR" : "INTR"));
        expect(splitLaws(inputs.walls, inputs.cuts, inputs.groups, ["EXTR", "INTR"]).error).toBeNull();
      }
    });
  }
});

describe("joinery split mode — laws over the fuzz generator", () => {
  const families = fc.oneof(rectilinearWalls, angledWalls);
  it("inert, runs partition the outline, (group, face) fills tile each group fill, tie policy", () => {
    let fuzzTies = 0;
    fc.assert(
      fc.property(families, fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }), (specs, ext) => {
        const { walls, cuts, groups } = renderWalls(specs);
        const faced = walls.map((w, i) => ({ ...w, face: ext[i % ext.length] ? "EXTR" : "INTR" }));
        const r = splitLaws(faced, cuts, groups, ["EXTR", "INTR"]);
        expect(r.error).toBeNull();
        fuzzTies += r.ties;
      }),
      { numRuns: RUNS, seed: SEED },
    );
    // The generator does produce same-group ties between faces, so law 4 was exercised here
    // too — not only by the deterministic set below.
    expect(fuzzTies).toBeGreaterThan(0);
  });
});

describe("joinery split mode — the tie policy over 20 deterministic T-junctions", () => {
  // An INTR wall stated FIRST (so it has the lower index and owns the tie by index) meets an
  // EXTR ring of the same thickness and group: 5 thicknesses x 4 positions, two of them
  // where the T meets a corner. Law 4 must give every junction point to EXTR.
  const ring = (t: number): WallSpec => ({
    points: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    thickness: t,
    closed: true,
    group: "concrete",
    openings: [],
  });
  for (const t of [100, 150, 200, 250, 300]) {
    for (const x of [1000, 3000, 5500, 6000 - t / 2]) {
      it(`thickness ${t}, T at x = ${x}`, () => {
        const stub: WallSpec = {
          points: [
            { x, y: 0 },
            { x, y: 4000 },
          ],
          thickness: t,
          closed: false,
          group: "concrete",
          openings: [],
        };
        const { walls, cuts, groups } = renderWalls([stub, ring(t)]);
        const faced = walls.map((w, i) => ({ ...w, face: i === 0 ? "INTR" : "EXTR" }));
        const r = splitLaws(faced, cuts, groups, ["EXTR", "INTR"]);
        expect(r.error).toBeNull();
        expect(r.ties).toBeGreaterThan(0);
      });
    }
  }
});

describe("joinery split mode — the face listed first wins a same-group tie", () => {
  // The reviewer's repro: an envelope and a 200 mm wall of the same thickness and material
  // whose category sorts before "exterior". Both statement orders.
  const shell = "wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }";
  const core = "wall id=part core thickness 200 { (2500,0) (2500,4000) }";
  for (const [label, body] of [
    ["envelope first", `${shell}\n${core}`],
    ["core first", `${core}\n${shell}`],
  ] as const) {
    it(`${label}: the junction squares and every outer-face run are the envelope's`, () => {
      const scene = compile(`plan "C" { units mm\n${body} }`, { noCache: true }).scene!;
      const split = classifyWallSet(scene.walls!, (w) => (w.category === "exterior" ? "EXTR" : "INTR"), [
        "EXTR",
        "INTR",
      ])!;
      const fill = split.fills[0]!;
      const area = (pts: Point[][]): number =>
        Math.abs(
          pts.reduce((s, loop) => {
            let a = 0;
            for (let i = 0; i < loop.length; i++) {
              const p = loop[i]!;
              const q = loop[(i + 1) % loop.length]!;
              a += p.x * q.y - q.x * p.y;
            }
            return s + a / 2;
          }, 0),
        );
      // The ring band is 5200x4200 - 4800x3800; the core is the 200 x 3800 between the faces.
      expect(area(fill.byClass.find((c) => c.cls === "EXTR")!.region)).toBeCloseTo(5200 * 4200 - 4800 * 3800, 6);
      expect(area(fill.byClass.find((c) => c.cls === "INTR")!.region)).toBeCloseTo(200 * 3800, 6);
      // No INTR face run touches the envelope's outer face (x = -100 / 5100, y = -100 / 4100).
      const outer = (p: Point): boolean => p.x === -100 || p.x === 5100 || p.y === -100 || p.y === 4100;
      const intr = split.faces.find((f) => f.cls === "INTR")!.runs;
      for (const run of intr) {
        let from = run.start;
        for (const e of run.edges) {
          expect(outer(from) && outer(e.to)).toBe(false);
          from = e.to;
        }
      }
    });
  }

  it("a class the caller did not list is refused, not silently dropped", () => {
    const scene = compile(`plan "C" { units mm\n${shell}\n${core} }`, { noCache: true }).scene!;
    expect(() => classifyWallSet(scene.walls!, (w) => w.category, ["exterior"])).toThrow(RangeError);
  });
});

describe("joinery: a wall offset by less than the snap distance keeps every piece (RM8.1d)", () => {
  // Two collinear 200 mm walls, b `dy` mm off a's line. Under SNAP_MM the interner fuses a's end
  // corner onto b's face, but the split scan's pair test was a strict box overlap, so a's end cap
  // (y up to 100) and b's face (y = 100 + dy) were never intersected: one face split, the other
  // not, an odd vertex, open chains, and b's piece between the joint and its window came out a
  // triangle (the 3D preview's wall lost it; the SVG carried `M x,y Z` dust). 0.0149 and 0.0151
  // sit either side of SNAP_MM; 0 and 0.0151 are the controls, already sound before the fix.
  const OFFSETS = ["0.001", "0.0149", "-0.001", "0", "0.0151"] as const;
  const plan = (bx: number, dy: string, windows: boolean, y = 0): string => {
    const yb = y === 0 ? dy : String(y + Number(dy));
    return `plan "N" {
  units mm
  height 3000
  wall id=a exterior thickness 200 { (0,${y}) (3000,${y}) }
  wall id=b exterior thickness 200 { (${bx},${yb}) (${bx + 3000},${yb}) }
${windows ? "  window id=wa on a at center width 800 sill 900 head 2100\n  window id=wb on b at 2000 width 800 sill 600 head 1800\n" : ""}}
`;
  };
  /** b's own share: its 3200 x 200 band, less what a (the earlier wall of the same thickness) owns
   *  where they overlap, less b's window. Within SNAP_MM the faces are fused, so the overlap is the
   *  full 200 deep; past it, b keeps the |dy|-deep strip beside a's face. */
  const bArea = (bx: number, dy: number, windows: boolean): number => {
    const overlap = 3100 - (bx - 100);
    const deep = Math.abs(dy) < SNAP_MM ? 200 : 200 - Math.abs(dy);
    return 3200 * 200 - overlap * deep - (windows ? 800 * 200 : 0);
  };
  const isClosed = (l: EdgeLoop): boolean =>
    l.length > 0 &&
    l.every((e, i) => {
      const end = edgeEnd(e);
      const next = edgeStart(l[(i + 1) % l.length]!);
      return end.x === next.x && end.y === next.y;
    });

  it("the offsets bracket the snap distance", () => {
    expect(Number("0.0149")).toBeLessThan(SNAP_MM);
    expect(Number("0.0151")).toBeGreaterThan(SNAP_MM);
  });

  it("the cell-boundary case sits on a cell line: 800 mm cells, a's face and b's either side of y = 800", () => {
    // The universe `joinWalls` indexes: every band edge and every cut edge, as `joineryInputs` builds them.
    const walls = compile(plan(3000, "0.001", true, 699.9995), { noCache: true }).scene!.walls!;
    const inputs = joineryInputs(walls, () => "");
    const edges = [...inputs.walls.flatMap((w) => w.loops), ...inputs.cuts.map((c) => c.loop)].flat();
    const cell = spanCell(edges.map((e) => loopBBox([e])));
    expect(cell).toBe(800);
    // a's lower face (centreline 699.9995 + 100) and b's (0.001 mm further) round to different rows.
    expect(Math.floor((699.9995 + 100) / cell)).toBe(0);
    expect(Math.floor((699.9995 + 0.001 + 100) / cell)).toBe(1);
  });

  for (const [label, bx, windows, y] of [
    ["b from 3000 with a window", 3000, true, 0],
    ["b from 2000 without openings", 2000, false, 0],
    // The same pair with a grid-index cell boundary (cells are 800 mm here) between a's end cap
    // and b's face: they share no cell, so the scan's query box is grown by SNAP_MM too.
    ["b from 3000 with a window, a cell boundary between the faces", 3000, true, 699.9995],
  ] as const) {
    for (const dy of OFFSETS) {
      it(`${label}, dy = ${dy}: closed chains, no SVG dust, b keeps its full piece`, () => {
        const src = plan(bx, dy, windows, y);
        const r = compile(src, { noCache: true });
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(r.svg).not.toMatch(/M -?[\d.]+,-?[\d.]+ Z/);
        // One face per wall, by drawing order (a, then b), as the 3D package's ownership reads it.
        const walls = r.scene!.walls!;
        expect(walls.length).toBe(2);
        const faceOf = new Map(walls.map((w, i) => [w, i === 0 ? "a" : "b"] as const));
        const joined = joinWallSet(walls, hatchesUsed(walls).map(hatchKey), {
          faceOf: (w) => faceOf.get(w) ?? "",
          faces: ["a", "b"],
        })!;
        const { outline, fills, split } = joined.result;
        for (const l of outline) expect(isClosed(l), "an outline chain").toBe(true);
        for (const f of fills) for (const l of f.loops) expect(isClosed(l), "a fill chain").toBe(true);
        for (const f of split!.fills) for (const l of f.loops) expect(isClosed(l), `wall ${f.face}'s chain`).toBe(true);
        const b = split!.fills.filter((f) => f.face === "b").reduce((s, f) => s + netArea(f.loops), 0);
        expect(b).toBeCloseTo(bArea(bx, Number(dy), windows), 2);
      });
    }
  }

  // Off the whole-number lattice the interner's key cells no longer line up with the geometry: two
  // points up to SNAP_MM apart can round two 0.01 mm cells apart, and a 3 x 3 lookup never fused
  // them (review round 1). Each plan below is a junction a sub-snap distance short of meeting, at
  // offsets in 0.005-0.015 mm placed so the two points round two cells apart (a coordinate ending
  // .0049 rounds down, one 0.0149 further rounds up twice), and every wall must keep its whole
  // share: its band less what an earlier wall of the same thickness owns, to within SNAP_MM x 4 m
  // (the fused faces lean by at most that).
  const wall = (id: string, pts: Array<[number, number]>) =>
    `  wall id=${id} exterior thickness 200 { ${pts.map(([x, y]) => `(${x},${y})`).join(" ")} }\n`;
  for (const [label, body, shares] of [
    [
      "in line, non-integer coordinates (0.01115 mm)",
      wall("b", [
        [6970.9425, 2737.53482],
        [9970.9425, 2737.53482],
      ]) +
        wall("a", [
          [3970.9425, 2737.54597],
          [6970.9425, 2737.54597],
        ]),
      [640000, 600000],
    ],
    [
      // The stem's cap ends at y = 900.0049, the bar's face is at 900.0198.
      "a T: the stem stops 0.0149 mm short of the bar's face",
      wall("bar", [
        [0, 1000.0198],
        [4000, 1000.0198],
      ]) +
        wall("stem", [
          [2000, 0],
          [2000, 800.0049],
        ]),
      [4200 * 200, 1000 * 200],
    ],
    [
      // a's end cap at x = 3100.0049, b's outer face at 3100.0154, b's start cap 0.0105 mm above
      // a's face: the corners are 0.01485 mm apart, inside SNAP_MM.
      "an L: the second leg 0.0105 mm off the first's end in x and in y",
      wall("a", [
        [0.0049, 0],
        [3000.0049, 0],
      ]) +
        wall("b", [
          [3000.0154, 0.0105],
          [3000.0154, 3000],
        ]),
      [640000, 600000],
    ],
    [
      // a's face at y = 100.0049, b's at 100.0198.
      "parallel faces 0.0149 mm apart",
      wall("a", [
        [0, 0.0049],
        [3000, 0.0049],
      ]) +
        wall("b", [
          [1000, 200.0198],
          [4000, 200.0198],
        ]),
      [640000, 640000],
    ],
    [
      "three in a chain, each 0.0149 mm off the last",
      wall("a", [
        [0, 0],
        [3000, 0],
      ]) +
        wall("b", [
          [3000, 0.0149],
          [6000, 0.0149],
        ]) +
        wall("c", [
          [6000, 0.0298],
          [9000, 0.0298],
        ]),
      [640000, 600000, 600000],
    ],
  ] as const) {
    it(`${label}: closed chains, no SVG dust, every wall keeps its share`, () => {
      const r = compile(`plan "N" {\n  units mm\n  height 3000\n${body}}\n`, { noCache: true });
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.svg).not.toMatch(/M -?[\d.]+,-?[\d.]+ Z/);
      const walls = r.scene!.walls!;
      expect(walls.length).toBe(shares.length);
      const faces = walls.map((_, i) => String(i));
      const faceOf = new Map(walls.map((w, i) => [w, String(i)] as const));
      const { outline, fills, split } = joinWallSet(walls, hatchesUsed(walls).map(hatchKey), {
        faceOf: (w) => faceOf.get(w) ?? "",
        faces,
      })!.result;
      for (const l of outline) expect(isClosed(l), "an outline chain").toBe(true);
      for (const f of fills) for (const l of f.loops) expect(isClosed(l), "a fill chain").toBe(true);
      for (const f of split!.fills) for (const l of f.loops) expect(isClosed(l), `wall ${f.face}'s chain`).toBe(true);
      faces.forEach((face, i) => {
        const got = split!.fills.filter((f) => f.face === face).reduce((s, f) => s + netArea(f.loops), 0);
        expect(Math.abs(got - shares[i]!), `wall ${i}'s share ${got} against ${shares[i]}`).toBeLessThan(
          SNAP_MM * 4000,
        );
      });
    });
  }
});
