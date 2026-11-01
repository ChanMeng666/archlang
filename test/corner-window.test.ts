/**
 * A window round a corner, and a position on an open boundary (issue #401, points 4 and 2).
 *
 * Two windows, one on each wall, run to a corner of the two walls with no wall left at it. They are
 * ordinary windows whose spans end on the other wall's outer face, so the joinery is untouched and
 * the drawing, the facts and the frame are what this suite holds. Each refusal is held to its
 * code, every quoted statement is pasted back in, and the control the form is measured against is
 * the two windows written by `at (x,y)`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  format,
  lint,
  planJsonToArch,
  planToJson,
  resolve,
  toDxf,
  toScene,
} from "../src/index.js";
import { windowEl } from "../src/elements/window.js";
import type { RWindow } from "../src/ir.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { WINDOW_KINDS } from "../src/grammar/tokens.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD } from "../src/world.js";
import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";
import {
  canonPrim,
  D4_TEST_ELEMENTS,
  frameFor,
  sceneOf,
  transformPrim,
  witnessPair,
  witnessViolations,
} from "./d4-oracle.js";
import {
  ABSOLUTE,
  CORNER,
  CORNER_BODY,
  CORNER_FIXTURE,
  DERIVED,
  DOOR,
  LEG_E,
  LEG_N,
  plan,
  RING,
  ROOM,
  SHORT_OF_THE_CORNER,
  UNEVEN,
  UNEVEN_BODY,
} from "./corner-window-plans.js";
import { ROOT } from "./rectilinear-rooms-law.js";

const codes = (src: string): string[] => compile(src).diagnostics.map((d) => d.code!);
const errors = (src: string): string[] =>
  compile(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code!);
const windowsOf = (src: string): SceneNode[] => compile(src).scene!.nodes.filter((n) => n.layer === "windows");
const lines = (nodes: readonly SceneNode[]): Array<[Point, Point]> =>
  nodes.flatMap((n) => (n.prim.t === "line" ? [[n.prim.a, n.prim.b] as [Point, Point]] : []));
const at = (x: number, y: number): string => `${x},${y}`;
/** How many line ends stand on each point. */
const ends = (nodes: readonly SceneNode[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const [a, b] of lines(nodes)) {
    for (const p of [a, b]) out.set(at(p.x, p.y), (out.get(at(p.x, p.y)) ?? 0) + 1);
  }
  return out;
};
/** Every vertex of the walls' fill. */
const wallVertices = (src: string): string[] =>
  compile(src)
    .scene!.nodes.filter((n) => n.layer === "wallFill")
    .flatMap((n) => (n.prim.t === "hatch" ? n.prim.region.flat() : []))
    .map((p) => at(p.x, p.y));

describe("a window round a corner: what stands there", () => {
  it("two windows meet with no diagnostic at all", () => {
    expect(codes(CORNER)).toEqual([]);
    expect(lint(CORNER).map((d) => d.code)).toEqual([]);
  });

  it("the pier #401 found is gone, and the control keeps it", () => {
    // By `at (x,y)`, stopping on the centrelines, a square of wall stays at the outer corner.
    expect(codes(SHORT_OF_THE_CORNER)).toEqual([]);
    expect(lint(SHORT_OF_THE_CORNER).map((d) => d.code)).toEqual(["W_OPENING_AT_JUNCTION", "W_OPENING_AT_JUNCTION"]);
    expect(wallVertices(SHORT_OF_THE_CORNER)).toContain(at(6100, -100));
    expect(wallVertices(CORNER)).not.toContain(at(6100, -100));
    expect(wallVertices(CORNER)).not.toContain(at(5900, 100));
  });

  it("the cuts are the windows': the walls are the control's, with no third cut", () => {
    const walls = (src: string): unknown =>
      compile(src).scene!.nodes.filter((n) => n.layer === "wallFill" || n.layer === "wallFace");
    expect(walls(CORNER)).toEqual(walls(ABSOLUTE));
  });

  it("each span still reads `at ± width / 2`, and ends on the outer corner", () => {
    const ir = resolve(parse(CORNER, BUILTIN_REGISTRY).plan!).ir;
    const [n, e] = ir.elements.filter((x): x is RWindow => x.kind === "window");
    expect(n!.at).toEqual({ x: 5200, y: 0 });
    expect(n!.at.x + n!.width / 2).toBe(6100);
    expect(e!.at).toEqual({ x: 6000, y: 500 });
    expect(e!.at.y - e!.width / 2).toBe(-100);
  });

  it("the position is not snapped: a 250 mm wall keeps the corner closed", () => {
    const src = plan(ROOM, `  walls from rooms exterior 250 partition 100`, DOOR, LEG_N, LEG_E);
    expect(codes(src)).toEqual([]);
    const ir = resolve(parse(src, BUILTIN_REGISTRY).plan!).ir;
    const n = ir.elements.find((x): x is RWindow => x.kind === "window")!;
    expect(n.at.x).toBe(5225);
    expect(n.at.x % 50).not.toBe(0);
    expect(wallVertices(src)).not.toContain(at(6125, -125));
  });

  it.each([
    ["top and left", "a.top", "a.left", (x: number, y: number): Point => ({ x, y })],
    ["top and right", "a.top", "a.right", (x: number, y: number): Point => ({ x: 6000 - x, y })],
    ["bottom and left", "a.bottom", "a.left", (x: number, y: number): Point => ({ x, y: 5000 - y })],
    ["bottom and right", "a.bottom", "a.right", (x: number, y: number): Point => ({ x: 6000 - x, y: 5000 - y })],
  ])("every corner of a room: %s", (_name, p, q, map) => {
    const src = plan(
      ROOM,
      DERIVED,
      `  window on ${p} at corner ${q} width 1800`,
      `  window on ${q} at corner ${p} width 1200`,
    );
    expect(codes(src)).toEqual([]);
    const outer = map(-100, -100);
    expect(ends(windowsOf(src)).get(at(outer.x, outer.y))).toBe(2);
    expect(wallVertices(src)).not.toContain(at(outer.x, outer.y));
  });

  it("a sill and head written on both legs are the pair's", () => {
    const src = plan(
      ROOM,
      DERIVED,
      `  window id=n on a.top at corner a.right width 1800 sill 300 head 2400`,
      `  window id=e on a.right at corner a.top width 1200 sill 300 head 2400`,
    );
    expect(errors(src)).toEqual([]);
    expect(describePlan(src).windows.map((w) => [w.sill, w.head])).toEqual([
      [300, 2400],
      [300, 2400],
    ]);
  });
});

describe("a window round a corner: the mitre", () => {
  const meet = (src: string, points: Array<[number, number]>): void => {
    const e = ends(windowsOf(src));
    for (const [x, y] of points) expect(e.get(at(x, y)), `${x},${y}`).toBe(2);
  };

  it("faces and panes end in pairs on the line from the inner corner to the outer one", () => {
    meet(CORNER, [
      [6100, -100],
      [5900, 100],
      [6025, -25],
      [5975, 25],
    ]);
  });

  it("two thicknesses: the line is not at 45 degrees and the legs still meet vertex to vertex", () => {
    const src = plan(ROOM, UNEVEN, DOOR, LEG_N, LEG_E);
    expect(errors(src)).toEqual([]);
    // Across the top the wall is 300, down the side 200: the corner is 6100, -150.
    meet(src, [
      [6100, -150],
      [5900, 150],
      [6025, -37.5],
      [5975, 37.5],
    ]);
  });

  it("no line of one leg crosses the other's", () => {
    const [n, e] = [windowsOf(CORNER).slice(0, 6), windowsOf(CORNER).slice(6)];
    // The top leg's lines stop at the mitre: none runs past the other wall's outer face or into it.
    for (const [a, b] of lines(n)) expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(6100);
    for (const [a, b] of lines(e)) expect(Math.min(a.y, b.y)).toBeGreaterThanOrEqual(-100);
    expect(
      lines(n)
        .filter(([a, b]) => a.y === 100 && b.y === 100)
        .flat()
        .map((p) => p.x),
    ).toContain(5900);
  });

  it("the sills meet at their noses, and the free end keeps its horn", () => {
    const sills = windowsOf(CORNER).filter((x) => x.prim.t === "polygon" && x.paint.fill === "none");
    expect(sills).toHaveLength(2);
    const pts = sills.flatMap((s) => (s.prim.t === "polygon" ? s.prim.pts : []));
    expect(pts.filter((p) => p.x === 6140 && p.y === -140)).toHaveLength(2);
    // The top leg runs from 4300, and its horn stands 40 past that jamb.
    expect(pts.map((p) => p.x)).toContain(4260);
  });

  describe("a leg barely wider than the other wall", () => {
    const leg = (width: number, head = ""): string =>
      `plan "t" {\n  units mm\n  grid 10\n${head}${[ROOM, DERIVED, DOOR].join("\n")}\n  window id=n on a.top at corner a.right width ${width}\n${LEG_E}\n}\n`;
    const covers = (src: string): Point[][] =>
      windowsOf(src).flatMap((x) => (x.prim.t === "polygon" && x.paint.fill !== "none" ? [x.prim.pts] : []));
    /** Every turn of the ring one way, and none straight: a simple convex ring. */
    const convex = (pts: readonly Point[]): boolean => {
      const turns = pts.map((p, i) => {
        const [q, r] = [pts[(i + 1) % pts.length]!, pts[(i + 2) % pts.length]!];
        return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
      });
      return turns.every((t) => t > 0) || turns.every((t) => t < 0);
    };
    const SHEETS = ["", "  paper A3 landscape\n  scale 1:50\n", "  paper A4 landscape\n  scale 1:500\n"];

    it.each(SHEETS.flatMap((h) => [210, 220, 250, 300].map((w) => [h, w] as const)))(
      "the cover is a simple ring on any sheet: %j width %d",
      (head, width) => {
        const src = leg(width, head);
        expect(errors(src)).toEqual([]);
        for (const c of covers(src)) expect(convex(c), JSON.stringify(c)).toBe(true);
      },
    );

    it("the cover stops where the mitre meets the jamb, and draws no less of the rest", () => {
      const [pinched] = covers(leg(210));
      expect(pinched).toHaveLength(3);
      // The jamb is at 5890, and the mitre reaches it 110 inside the centreline.
      expect(pinched).toContainEqual({ x: 5890, y: 110 });
      expect(ends(windowsOf(leg(210))).get(at(5900, 100))).toBe(2);
      expect(covers(CORNER).map((c) => c.length)).toEqual([4, 4]);
    });

    it("on walls of two thicknesses the vertex is still the mitre's", () => {
      const src = plan(ROOM, UNEVEN, DOOR, `  window id=n on a.top at corner a.right width 210`, LEG_E).replace(
        "grid 50",
        "grid 10",
      );
      expect(errors(src)).toEqual([]);
      const [c] = windowsOf(src).filter((x) => x.prim.t === "polygon" && x.paint.fill !== "none");
      expect(convex(c!.prim.t === "polygon" ? c!.prim.pts : [])).toBe(true);
    });

    it.each(D4_TEST_ELEMENTS.map((g) => [g.name, g] as const))("the frame carries it × %s", (_n, g) => {
      const body = UNEVEN_BODY.replace("corner a.right width 1800", "corner a.right width 210");
      expect(witnessViolations(body, g, { fixedSheet: true, grid: 10 })).toEqual([]);
    });
  });

  it("draws what it costs: six primitives a leg", () => {
    const nodes = windowsOf(CORNER);
    expect(nodes).toHaveLength(12);
    const el = { kind: "window" } as unknown as RWindow;
    expect(windowEl.drawCost!(el)).toBe(6);
  });

  it("measures reads the thicker wall: the sill's nose runs out by the other wall", () => {
    const seg = {
      a: { x: 0, y: 0 },
      b: { x: 6000, y: 0 },
      thickness: 100,
      category: "exterior",
      wallId: "w",
      index: 0,
    };
    const other = { ...seg, a: { x: 6000, y: 0 }, b: { x: 6000, y: 5000 }, thickness: 1000, index: 1 };
    const plain = { kind: "window", at: { x: 5000, y: 0 }, width: 2000, host: seg } as unknown as RWindow;
    const leg = { ...plain, _corner: { at: { x: 6000, y: 0 }, other } };
    const r = (w: RWindow): number => windowEl.measures!(w)[4]!;
    expect(r(plain)).toBe(1000 + 0.2 * 100);
    expect(r(leg)).toBe(1000 + 0.2 * 1000);
  });

  it("bounds stay empty: a leg ends on a wall face", () => {
    expect(windowEl.bounds({ kind: "window" } as unknown as RWindow)).toEqual([]);
  });
});

describe("a window round a corner: what the plan says", () => {
  const leg = (src: string, id: string) => describePlan(src).windows.find((w) => w.id === id)!;

  it("describe: two rows, each its own wall's, each naming the other", () => {
    expect(leg(CORNER, "n")).toEqual({
      id: "n",
      room: "a",
      width: 1800,
      relation: "on a.top at corner a.right",
      corner_with: "e",
      facing: "N",
    });
    expect(leg(CORNER, "e")).toMatchObject({ width: 1200, corner_with: "n", facing: "E" });
  });

  it("the areas are the control's: a window takes no floor", () => {
    const area = (src: string) => describePlan(src).rooms.map((r) => [r.id, r.area_m2, r.net_area_m2]);
    expect(area(CORNER)).toEqual(area(ABSOLUTE));
  });

  it("no window of any other plan gains the key", () => {
    expect(JSON.stringify(describePlan(ABSOLUTE).windows)).not.toContain("corner_with");
  });

  it("a stricter nib still reads the free jamb, and no move is quoted for a leg", () => {
    const src = plan(ROOM, RING, `  wall id=z partition thickness 100 { (4100,0) (4100,5000) }`, LEG_N, LEG_E);
    expect(errors(src)).toEqual([]);
    const report = lint(src, { ruleset: { minJunctionNibMm: 300 } }).filter((d) => d.code === "W_OPENING_AT_JUNCTION");
    expect(report.map((d) => d.message).join()).toContain("x 4300");
    expect(report[0]!.hints!.join()).toContain("stays at it");
    expect(report[0]!.hints!.join()).not.toMatch(/\bMove the window\b/);
  });

  it("the excuse is one wall's: a wall meeting the leg elsewhere is still measured", () => {
    // Refused at the resolver by the same measure, so the lint's twin never sees it by default.
    const src = plan(ROOM, RING, `  wall id=z partition thickness 100 { (5000,0) (5000,5000) }`, LEG_N, LEG_E);
    expect(errors(src)).toEqual(["E_OPENING_NIB"]);
  });

  it("the schedule tags two windows, each with its own width", () => {
    const src = plan(`  paper A3 landscape`, `  schedule openings`, ROOM, DERIVED, DOOR, LEG_N, LEG_E);
    const svg = compile(src).svg!;
    expect(errors(src)).toEqual([]);
    expect(svg).toContain(">W01<");
    expect(svg).toContain(">W02<");
    expect(svg).toContain("1800");
    expect(svg).toContain("1200");
  });

  it("DXF: the walls re-join to the drawing, and both windows' lines are there", () => {
    const { plan: ast } = parse(CORNER, BUILTIN_REGISTRY);
    const dxf = toDxf(toScene(resolve(ast!).ir));
    const control = (() => {
      const { plan: p } = parse(ABSOLUTE, BUILTIN_REGISTRY);
      return toDxf(toScene(resolve(p!).ir));
    })();
    expect(dxf.startsWith("0\nSECTION")).toBe(true);
    // The wall layers read `at`/`width` alone, so the corner is the control's.
    const wallLayers = (s: string): string[] => s.split("\n0\n").filter((e) => /\nA-WALL/.test(e));
    expect(wallLayers(dxf)).toEqual(wallLayers(control));
    expect(wallLayers(dxf).length).toBeGreaterThan(0);
  });

  it("dims auto and a sheet draw it, with nothing refused", () => {
    const src = plan(`  paper A3 landscape`, `  dims auto all`, ROOM, DERIVED, DOOR, LEG_N, LEG_E);
    expect(errors(src)).toEqual([]);
    expect(lint(src).map((d) => d.code)).not.toContain("W_OPENING_AT_JUNCTION");
  });

  it("the fixture writes the form on rooms and through a frame, and lints clean of the junction", () => {
    const src = readFileSync(`${ROOT}/${CORNER_FIXTURE}`, "utf8");
    expect(errors(src)).toEqual([]);
    expect(lint(src).map((d) => d.code)).not.toContain("W_OPENING_AT_JUNCTION");
    const legs = describePlan(src).windows.filter((w) => w.corner_with !== undefined);
    expect(legs.map((w) => [w.id, w.corner_with])).toEqual([
      ["nw", "wn"],
      ["wn", "nw"],
      ["ne", "en"],
      ["en", "ne"],
      ["w.n", "w.e"],
      ["w.e", "w.n"],
    ]);
  });
});

describe("a window round a corner: round trips", () => {
  it("fmt prints the position as written", () => {
    expect(format(CORNER)).toContain("window id=n on a.top at corner a.right width 1800");
    expect(format(format(CORNER))).toBe(format(CORNER));
  });

  it("Plan JSON carries it as written and it re-parses to the same plan", () => {
    const { json } = planToJson(CORNER);
    expect(json!.openings!.filter((o) => o.kind === "window").map((o) => o.relation)).toEqual([
      { edge: "a.top", at: "corner a.right" },
      { edge: "a.right", at: "corner a.top" },
    ]);
    const back = planJsonToArch(json);
    expect(back.diagnostics).toEqual([]);
    expect(back.source).toContain("on a.top at corner a.right");
    expect(windowsOf(back.source!)).toEqual(windowsOf(CORNER));
  });
});

describe("a window round a corner: under the whole group", () => {
  for (const [name, body, drawn] of [
    ["a derived ring", CORNER_BODY, 24],
    ["walls of two thicknesses", UNEVEN_BODY, 12],
  ] as const) {
    it.each(D4_TEST_ELEMENTS.map((g) => [g.name, g] as const))(`${name}: every tier of the oracle × %s`, (_n, g) => {
      expect(witnessViolations(body, g, { fixedSheet: true })).toEqual([]);
    });

    it.each(D4_TEST_ELEMENTS.map((g) => [g.name, g] as const))(
      `${name}: every window primitive is g of P₀'s × %s`,
      (_n, g) => {
        const f = frameFor(g, 50);
        const { p0, gP } = witnessPair(body, g, { fixedSheet: true });
        const prims = (src: string, carry: boolean): string[] =>
          sceneOf(src)
            .nodes.filter((n) => n.elementKind === "window")
            .map((n) => canonPrim(carry ? transformPrim(f, n.prim) : n.prim))
            .sort();
        const expected = prims(p0, true);
        expect(expected).toHaveLength(drawn);
        expect(prims(gP, false)).toEqual(expected);
      },
    );
  }

  it("the pairing rides the frame: the ids are the plan's, and the walls stay gone", () => {
    const { gP } = witnessPair(CORNER_BODY, D4_TEST_ELEMENTS.find((g) => g.rotate === 90 && g.mirror)!);
    expect(errors(gP)).toEqual([]);
    expect(
      describePlan(gP)
        .windows.filter((w) => w.corner_with)
        .map((w) => [w.id, w.corner_with]),
    ).toEqual([
      ["g.n", "g.w"],
      ["g.w", "g.n"],
      ["g.p", "g.q"],
      ["g.q", "g.p"],
    ]);
  });

  it("the reference plan can fail: an unpaired leg in the body is refused under every element", () => {
    const body = CORNER_BODY.replace(/ {4}window id=q .*\n?/, "");
    for (const g of D4_TEST_ELEMENTS) {
      expect(errors(witnessPair(body, g).gP), g.name).toContain("E_WINDOW_CORNER");
    }
  });

  it("two storeys do not read each other's corners", () => {
    const storey = [ROOM, DERIVED, DOOR, LEG_N, LEG_E].join("\n");
    const src = `plan "t" {\n  units mm\n  grid 50\n  level 1 {\n${storey}\n  }\n  level 2 {\n${storey}\n  }\n}\n`;
    expect(errors(src)).toEqual([]);
  });
});

describe("a window round a corner: what is refused", () => {
  const BESIDE = `  room id=b right-of a size 3000x5000`;
  const ONE: Array<[string, string, string[]]> = [
    ["alone", plan(ROOM, DERIVED, LEG_N), ["E_WINDOW_CORNER"]],
    ["on a door", plan(ROOM, DERIVED, `  door id=d on a.top at corner a.right width 900`), ["E_WINDOW_CORNER"]],
    [
      "on a cased opening",
      plan(ROOM, DERIVED, `  opening id=o on a.top at corner a.right width 900`),
      ["E_WINDOW_CORNER"],
    ],
    [
      "on `between`",
      plan(ROOM, BESIDE, DERIVED, `  opening id=o between a and b at corner a.top width 900`),
      ["E_WINDOW_CORNER"],
    ],
    ["on a wall by id", plan(ROOM, RING, `  window id=n on x at corner a.right width 1800`), ["E_WINDOW_CORNER"]],
    [
      "another room's edge",
      plan(ROOM, `  room id=b below a size 6000x3000`, DERIVED, `  window id=n on a.top at corner b.right width 1800`),
      ["E_WINDOW_CORNER"],
    ],
    [
      "a parallel edge",
      plan(ROOM, DERIVED, `  window id=n on a.top at corner a.bottom width 1800`),
      ["E_WINDOW_CORNER"],
    ],
    ["its own edge", plan(ROOM, DERIVED, `  window id=n on a.top at corner a.top width 1800`), ["E_WINDOW_CORNER"]],
    ["a centre line", plan(ROOM, DERIVED, `  window id=n on a.top at corner a.cx width 1800`), ["E_OPENING_DATUM"]],
    ["no such room", plan(ROOM, DERIVED, `  window id=n on a.top at corner zz.right width 1800`), ["E_UNKNOWN_REF"]],
    [
      "a tee: a wall runs on and the other is a partition",
      plan(ROOM, BESIDE, DERIVED, LEG_N, LEG_E),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
    [
      "a wall runs on past the corner",
      plan(
        ROOM,
        `  wall id=t exterior thickness 200 { (0,0) (9000,0) }`,
        `  wall id=r exterior thickness 200 { (6000,0) (6000,5000) }`,
        `  wall id=q exterior thickness 200 { (6000,5000) (0,5000) (0,0) }`,
        LEG_N,
        LEG_E,
      ),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
    [
      "a third wall carries on from it",
      plan(ROOM, RING, `  wall id=z partition thickness 100 { (6000,0) (9000,0) }`, LEG_N, LEG_E),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
    [
      "a third wall runs in on the slant",
      plan(ROOM, RING, `  wall id=z partition thickness 100 { (6000,0) (5000,1000) }`, LEG_N, LEG_E),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
    [
      "a column at the corner",
      plan(ROOM, DERIVED, LEG_N, LEG_E, `  column id=c at (5900,-100) size 200x200`),
      ["E_WINDOW_CORNER"],
    ],
    [
      "no wider than the other wall",
      plan(ROOM, DERIVED, `  window id=n on a.top at corner a.right width 150`, LEG_E),
      ["E_WINDOW_CORNER"],
    ],
    [
      "a second wall on the span",
      plan(ROOM, RING, `  wall id=z exterior thickness 200 { (4800,0) (5400,0) }`, LEG_N, LEG_E),
      ["E_WINDOW_CORNER"],
    ],
    [
      "three at a corner",
      plan(ROOM, DERIVED, LEG_N, LEG_E, `  window id=m on a.top at corner a.right width 900`),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
    [
      "two on one wall",
      plan(ROOM, DERIVED, LEG_N, `  window id=m on a.top at corner a.right width 900`),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
    [
      "different sills",
      plan(ROOM, DERIVED, `  window id=n on a.top at corner a.right width 1800 sill 300`, LEG_E),
      ["E_WINDOW_CORNER"],
    ],
    [
      "different heads",
      plan(ROOM, DERIVED, `  window id=n on a.top at corner a.right width 1800 head 2400`, LEG_E),
      ["E_WINDOW_CORNER"],
    ],
    [
      "a demolished wall",
      plan(
        ROOM,
        `  wall id=t exterior thickness 200 { (0,0) (6000,0) }`,
        `  wall id=r exterior thickness 200 status demolish { (6000,0) (6000,5000) }`,
        `  wall id=q exterior thickness 200 { (6000,5000) (0,5000) (0,0) }`,
        LEG_N,
        LEG_E,
      ),
      ["E_WINDOW_CORNER", "E_WINDOW_CORNER"],
    ],
  ];

  it.each(ONE)("%s", (_name, src, want) => {
    expect(errors(src)).toEqual(want);
    expect(compile(src).svg ?? "").not.toContain("corner_with");
  });

  it("a column clear of the corner is no matter", () => {
    expect(errors(plan(ROOM, DERIVED, DOOR, LEG_N, LEG_E, `  column id=c at (6100,-300) size 200x200`))).toEqual([]);
  });

  it("a refused leg does not leave its partner reporting it missing", () => {
    const src = plan(ROOM, DERIVED, `  window id=n on a.top at corner a.right width 150`, LEG_E);
    const [only, ...rest] = compile(src).diagnostics;
    expect(rest).toEqual([]);
    expect(only!.message).toContain('Window "n"');
    expect(only!.message).not.toContain("alone");
  });

  it("a leg refused at another corner does not hide a lone leg at this one", () => {
    const src = plan(ROOM, DERIVED, DOOR, LEG_N, `  window id=z on a.bottom at corner a.left width 150`);
    const said = compile(src).diagnostics.map((d) => d.message);
    expect(said).toHaveLength(2);
    expect(said.join()).toContain('Window "n" runs to a corner alone');
    expect(said.join()).toContain('Window "z" cannot run to a corner there');
  });

  it("a leg refused on this wall is not the other wall's window", () => {
    const src = plan(ROOM, DERIVED, LEG_N, `  window id=m on a.top at corner a.right width 150`);
    expect(
      compile(src)
        .diagnostics.map((d) => d.message)
        .join(),
    ).toContain('Window "n" runs to a corner alone');
  });

  it("the refused leg is known by its edges, in the compass words too", () => {
    const src = plan(ROOM, DERIVED, `  window id=n on a.north at corner a.east width 150`, LEG_E);
    expect(compile(src).diagnostics).toHaveLength(1);
    expect(compile(src).diagnostics[0]!.message).toContain('Window "n"');
  });

  it("the message of a compile error may name the wall, and says what stands there", () => {
    const src = plan(ROOM, RING, `  wall id=z partition thickness 100 { (6000,0) (9000,0) }`, LEG_N, LEG_E);
    expect(compile(src).diagnostics[0]!.message).toContain('wall "z" stands at the corner too');
  });
});

describe("a window round a corner: every quoted statement resolves", () => {
  const hint = (src: string, code: string): string => {
    const d = compile(src).diagnostics.find((x) => x.code === code)!;
    return d.hints![0]!;
  };

  it("alone: the hint writes the missing window, and pasted it compiles", () => {
    const src = plan(ROOM, DERIVED, LEG_N);
    const quoted = /`(window on [^`]+)`/.exec(hint(src, "E_WINDOW_CORNER"))![1]!;
    expect(quoted).toBe("window on a.right at corner a.top width <mm>");
    expect(errors(plan(ROOM, DERIVED, LEG_N, `  ${quoted.replace("<mm>", "1200")}`))).toEqual([]);
  });

  it.each([
    [
      "a run shorter than the window",
      plan(ROOM, DERIVED, `  window id=n on a.top at corner a.right width 7000`, LEG_E),
      5900,
    ],
    [
      "a wall that meets the run",
      plan(ROOM, RING, `  wall id=z partition thickness 100 { (4300,0) (4300,5000) }`, LEG_N, LEG_E),
      1650,
    ],
  ])("the widest window: %s", (_name, src, width) => {
    expect(errors(src)).toEqual(["E_OPENING_NIB"]);
    const quoted = /`(on a\.top at corner a\.right width (\d+))`/.exec(hint(src, "E_OPENING_NIB"))!;
    expect(Number(quoted[2])).toBe(width);
    const fixed = src.replace(/on a\.top at corner a\.right width \d+/, quoted[1]!);
    expect(errors(fixed)).toEqual([]);
    const wider = src.replace(
      /on a\.top at corner a\.right width \d+/,
      `on a.top at corner a.right width ${width + 50}`,
    );
    expect(errors(wider)).toEqual(["E_OPENING_NIB"]);
  });

  it("the widest window keeps to the grid", () => {
    const src = plan(
      ROOM,
      `  wall id=t exterior thickness 200 { (0,0) (6000,0) }`,
      `  wall id=r exterior thickness 250 { (6000,0) (6000,5000) }`,
      `  wall id=q exterior thickness 200 { (6000,5000) (0,5000) (0,0) }`,
      `  wall id=z partition thickness 100 { (4300,0) (4300,5000) }`,
      LEG_N,
      LEG_E,
    );
    expect(hint(src, "E_OPENING_NIB")).toContain("width 1650");
    const fixed = src.replace("on a.top at corner a.right width 1800", "on a.top at corner a.right width 1650");
    expect(errors(fixed)).toEqual([]);
  });

  it("no width fits: it says so, and quotes none", () => {
    const src = plan(
      ROOM,
      RING,
      `  wall id=z partition thickness 100 { (5750,0) (5750,5000) }`,
      `  window id=n on a.top at corner a.right width 1800`,
      LEG_E,
    );
    expect(errors(src)).toEqual(["E_OPENING_NIB"]);
    expect(hint(src, "E_OPENING_NIB")).toContain("No width fits");
  });
});

describe("the word `corner` stays free", () => {
  it("as a binding, in the position slot", () => {
    const src = plan(`  let corner = 3000`, ROOM, RING, `  window id=w on x at corner width 900`);
    expect(errors(src)).toEqual([]);
    expect(resolve(parse(src, BUILTIN_REGISTRY).plan!).ir.elements.find((e) => e.kind === "window")).toMatchObject({
      at: { x: 3000, y: 0 },
    });
  });

  it("as a room id, and then as the form on that room", () => {
    const src = plan(
      `  room id=corner at (0,0) size 3000x3000 uses office`,
      DERIVED,
      `  window on corner.top at corner corner.left width 900`,
      `  window on corner.left at corner corner.top width 900`,
    );
    expect(errors(src)).toEqual([]);
  });

  it("a non-dotted name after it is the parse error it always was", () => {
    expect(errors(plan(ROOM, DERIVED, `  window id=n on a.top at corner hall width 900`))).toEqual(["E_PARSE"]);
  });
});

describe("the count is charged", () => {
  it("two hundred corners in two hundred instances is no work", () => {
    const body = `    room id=a at (0,0) size 3000x3000
    walls from rooms exterior 200 partition 100
    window id=n on a.top at corner a.right width 1000
    window id=e on a.right at corner a.top width 1000`;
    const places = Array.from({ length: 200 }, (_, i) => `  place c() as p${i} at (${i * 4000},0)`).join("\n");
    const src = `plan "t" {\n  units mm\n  grid 50\n  component c() {\n${body}\n  }\n${places}\n}\n`;
    expect(errors(src)).toEqual([]);
  });

  it("a leg is charged five passes over its group, and a plain window none", () => {
    const steps = (...lines: string[]): number => {
      clearResolveCache();
      const src = plan(ROOM, DERIVED, DOOR, ...lines);
      return evaluationSteps(resolveAll(parse(src, BUILTIN_REGISTRY).plan!, BUILTIN_REGISTRY, NULL_WORLD));
    };
    const columns = Array.from({ length: 100 }, (_, i) => `  column at (${i * 100},9000) size 50x50`);
    const cost = (...legs: string[]): number => steps(...legs, ...columns) - steps(...legs);
    expect(cost(LEG_N, LEG_E) - cost()).toBe(2 * 5 * columns.length);
    expect(cost(`  window id=m on a.top at 1500 from a.right width 900`) - cost()).toBe(0);
  });

  it("thousands of windows at one corner stop at the meter, never in a hang or a throw", () => {
    const src = plan(ROOM, DERIVED, `  for i in 0..6000 {\n    window on a.top at corner a.right width 1800\n  }`);
    const got = errors(src);
    expect(got.length).toBeGreaterThan(0);
    expect(new Set(got).has("E_WINDOW_CORNER") || new Set(got).has("E_STEP_LIMIT")).toBe(true);
  });
});

describe("a window kind on a leg", () => {
  /** On `a.top` the corner is ahead along the wall, so `hinge left` is the free jamb there; on
   *  `a.right` it is behind, so `hinge right` is. */
  const legs = (kind: string, top = "", side = "", width = 1800): string =>
    plan(
      ROOM,
      DERIVED,
      DOOR,
      `  window id=n ${kind} on a.top at corner a.right width ${width}${top}`,
      `  window id=e ${kind} on a.right at corner a.top width 1200${side}`,
    );
  /** Every point a window's nodes draw: line ends, polygon vertices, a circle's extreme points. */
  const inked = (n: SceneNode): Point[] => {
    if (n.prim.t === "line") return [n.prim.a, n.prim.b];
    if (n.prim.t === "polygon") return [...n.prim.pts];
    if (n.prim.t === "circle") {
      const { center: c, r } = n.prim;
      return [
        { x: c.x - r, y: c.y - r },
        { x: c.x + r, y: c.y + r },
      ];
    }
    throw new Error(`no reading of ${n.prim.t}`);
  };
  /** The marks alone: what a kind adds to the six nodes every leg draws. */
  const marks = (src: string): { n: SceneNode[]; e: SceneNode[] } => {
    const nodes = windowsOf(src);
    const split = nodes.findIndex(
      (_, i) => i > 0 && nodes[i]!.paint.fill === nodes[0]!.paint.fill && nodes[i]!.prim.t === "polygon",
    );
    return { n: nodes.slice(6, split), e: nodes.slice(split + 6) };
  };

  it.each([...WINDOW_KINDS])("%s draws inside its own span, and no mark reaches the mitre", (kind) => {
    for (const width of [1800, 300, 220]) {
      const src = legs(kind, "", "", width).replace("grid 50", "grid 10");
      expect(errors(src)).toEqual([]);
      const { n, e } = marks(src);
      // The inner face of the wall on `a.right` is x 5900: nothing of the top leg's marks passes it.
      for (const p of n.flatMap(inked)) expect(p.x, `${kind} ${width}`).toBeLessThanOrEqual(5900);
      for (const p of n.flatMap(inked)) expect(p.x).toBeGreaterThanOrEqual(6100 - width);
      // Likewise the inner face of the wall on `a.top`, y 100, for the side leg.
      for (const p of e.flatMap(inked)) expect(p.y, `${kind} side`).toBeGreaterThanOrEqual(100);
    }
  });

  it("`fixed` has one pane, and it stops on the corner point", () => {
    const panes = windowsOf(legs("fixed")).filter(
      (n) => n.prim.t === "line" && n.paint.stroke === windowsOf(CORNER)[3]!.paint.stroke,
    );
    expect(panes).toHaveLength(2);
    expect(ends(panes).get(at(6000, 0))).toBe(2);
  });

  it("two kinds can meet at a corner: each stops on the mitre", () => {
    const src = plan(
      ROOM,
      DERIVED,
      DOOR,
      `  window id=n fixed on a.top at corner a.right width 1800`,
      `  window id=e sliding on a.right at corner a.top width 1200`,
    );
    expect(errors(src)).toEqual([]);
    expect(ends(windowsOf(src)).get(at(6000, 0))).toBe(1);
    expect(ends(windowsOf(src)).get(at(6025, -25))).toBe(1);
  });

  describe("a hinge cannot stand at the corner end", () => {
    it.each(["casement", "tilt_turn"])("%s: a hinge naming the corner end is refused", (kind) => {
      const src = legs(kind, " hinge right");
      expect(errors(src)).toEqual(["E_WINDOW_CORNER"]);
      expect(compile(src).diagnostics[0]!.message).toContain("`hinge right` names the jamb at the corner");
    });

    it("on the other wall the same word is the free jamb, which is the frame's business", () => {
      expect(errors(legs("casement", " hinge left", " hinge left"))).toEqual(["E_WINDOW_CORNER"]);
      expect(errors(legs("casement", " hinge left", " hinge right"))).toEqual([]);
    });

    it("the refusal's own word, pasted in, compiles", () => {
      const src = legs("casement", " hinge right");
      const word = /`hinge (left|right)`, the free jamb/.exec(compile(src).diagnostics[0]!.hints![0]!)![1]!;
      expect(word).toBe("left");
      expect(errors(legs("casement", ` hinge ${word}`))).toEqual([]);
    });

    it.each(["casement", "tilt_turn"])("%s with no `hinge` draws its mark on the free jamb alone", (kind) => {
      const { n, e } = marks(legs(kind));
      const chevrons = (m: SceneNode[]): SceneNode[] => m.filter((x) => x.prim.t === "line");
      // Two lines of one chevron, both from the jamb: x 4300 on top, y 1100 down the side.
      expect(chevrons(n)).toHaveLength(2);
      expect(ends(chevrons(n)).get(at(4300, 0))).toBe(2);
      expect(chevrons(e)).toHaveLength(2);
      expect(ends(chevrons(e)).get(at(6000, 1100))).toBe(2);
    });

    it("a hinge written on the free jamb draws what none written draws", () => {
      expect(marks(legs("casement", " hinge left", " hinge right"))).toEqual(marks(legs("casement")));
    });

    it("an ordinary casement keeps a mark on both jambs: a leg's rule is a leg's", () => {
      const src = plan(ROOM, DERIVED, DOOR, `  window id=w casement on a.top at 3000 from start width 1800`);
      expect(windowsOf(src).filter((n) => n.lineWeight === "extraThin")).toHaveLength(4);
    });
  });

  it("a kind on a leg rides through describe, fmt and Plan JSON", () => {
    const src = legs("casement", " hinge left", " hinge right");
    expect(describePlan(src).windows[0]).toMatchObject({ kind: "casement", corner_with: "e" });
    expect(format(src)).toContain("window id=n casement on a.top at corner a.right width 1800 hinge left");
    const back = planJsonToArch(planToJson(src).json);
    expect(back.diagnostics).toEqual([]);
    expect(windowsOf(back.source!)).toEqual(windowsOf(src));
  });

  it("sill and head parity still holds on a kind", () => {
    const src = plan(
      ROOM,
      DERIVED,
      `  window id=n fixed on a.top at corner a.right width 1800 sill 300`,
      `  window id=e fixed on a.right at corner a.top width 1200`,
    );
    expect(errors(src)).toEqual(["E_WINDOW_CORNER"]);
  });

  describe("under the group", () => {
    const body = (kind: string, n = "", w = ""): string =>
      CORNER_BODY.replace("window id=n on", `window id=n ${kind} on`)
        .replace("window id=w on", `window id=w ${kind} on`)
        .replace("corner a.left width 1800", `corner a.left width 1800${n}`)
        .replace("corner a.top width 1200", `corner a.top width 1200${w}`);
    const CASES = [
      ...WINDOW_KINDS.map((k) => [k, body(k)] as const),
      ["casement, hinges written on the free jambs", body("casement", " hinge right", " hinge left")] as const,
    ];

    it.each(CASES.flatMap(([name, b]) => D4_TEST_ELEMENTS.map((g) => [name, g.name, b, g] as const)))(
      "%s × %s: every tier, and every primitive g of P₀'s",
      (_name, _g, b, g) => {
        expect(errors(witnessPair(b, g).gP)).toEqual([]);
        expect(witnessViolations(b, g, { fixedSheet: true })).toEqual([]);
        const f = frameFor(g, 50);
        const { p0, gP } = witnessPair(b, g, { fixedSheet: true });
        const prims = (src: string, carry: boolean): string[] =>
          sceneOf(src)
            .nodes.filter((n) => n.elementKind === "window")
            .map((n) => canonPrim(carry ? transformPrim(f, n.prim) : n.prim))
            .sort();
        expect(prims(gP, false)).toEqual(prims(p0, true));
      },
    );
  });
});

describe("an L-shaped room's corners", () => {
  /** Notch at the bottom right. Its sides: top, right, bottom, left; the notch has no word. */
  const L = `  room id=a polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living`;
  const legs = (p: string, q: string): string[] => [
    `  window id=n on a.${p} at corner a.${q} width 1500`,
    `  window id=e on a.${q} at corner a.${p} width 1200`,
  ];

  it.each([
    ["top", "right", 6100, -100],
    ["top", "left", -100, -100],
    ["bottom", "left", -100, 6100],
  ])("the convex corner of %s and %s: no diagnostic, and no wall left at it", (p, q, x, y) => {
    const src = plan(L, DERIVED, ...legs(p, q));
    expect(errors(src)).toEqual([]);
    expect(wallVertices(src)).not.toContain(at(x, y));
    expect(ends(windowsOf(src)).get(at(x, y))).toBe(2);
    expect(lint(src).map((d) => d.code)).not.toContain("W_OPENING_AT_JUNCTION");
    expect(describePlan(src).windows.map((w) => w.corner_with)).toEqual(["e", "n"]);
  });

  it("the sides that never meet are refused, and the refusal says why", () => {
    const src = plan(L, DERIVED, ...legs("bottom", "right"));
    expect(errors(src)).toEqual(["E_WINDOW_CORNER", "E_WINDOW_CORNER"]);
    const d = compile(src).diagnostics[0]!;
    expect(d.message).toContain("`a.right` does not meet `a.bottom` at an end of it");
    expect(d.hints![0]).toContain("a re-entrant corner has no word");
  });

  it("every end of a side is convex: no pair of side words reaches the re-entrant corner", () => {
    const sides = ["top", "right", "bottom", "left"];
    const met = sides.flatMap((p) =>
      sides.flatMap((q) => (errors(plan(L, DERIVED, ...legs(p, q))).length === 0 ? [`${p}/${q}`] : [])),
    );
    expect(met.sort()).toEqual(["bottom/left", "left/bottom", "left/top", "right/top", "top/left", "top/right"]);
  });

  it("an L's outline from two rooms: the re-entrant corner is a tee, and says so", () => {
    const rooms = [
      `  room id=a at (0,0) size 6000x3000 label "Living" uses living`,
      `  room id=b below a align left size 3000x3000 label "Bed" uses bedroom`,
    ];
    const src = plan(
      ...rooms,
      DERIVED,
      `  window id=n on b.right at corner b.top width 1200`,
      `  window id=e on a.bottom at corner a.right width 1200`,
    );
    const said = compile(src).diagnostics.map((d) => [d.code, d.message]);
    expect(said[0]![0]).toBe("E_WINDOW_CORNER");
    expect(said[0]![1]).toContain("the wall on `b.top` there is a partition");
  });

  it("a U's side is several runs, and reading it refuses as any read of it does", () => {
    const U = `  room id=a polygon (0,0) (2000,0) (2000,3000) (4000,3000) (4000,0) (6000,0) (6000,5000) (0,5000) uses living`;
    const src = plan(U, DERIVED, `  window id=n on a.right at corner a.top width 1200`);
    expect(errors(src)).toContain("E_ROOM_NOT_RECTANGLE");
  });
});

describe("the refusal of a plain length on a room's edge", () => {
  it("reads as English on an edge and on a shared edge", () => {
    const edge = plan(ROOM, DERIVED, `  window id=w on a.top at 1500 width 900`);
    expect(compile(edge).diagnostics[0]!.message).toContain("along an edge write");
    const shared = plan(
      ROOM,
      `  room id=b right-of a size 3000x5000`,
      DERIVED,
      `  opening id=o between a and b at 1500 width 900`,
    );
    expect(compile(shared).diagnostics[0]!.message).toContain("along a shared edge write");
  });
});

describe("`open between` takes no position", () => {
  const BESIDE = `  room id=b right-of a size 3000x5000 label "Kitchen" uses kitchen`;
  const walls = (clause: string): string => `  walls from rooms exterior 200 partition 100 { ${clause} }`;
  const message = (src: string): string => compile(src).diagnostics[0]!.message;
  const quoted = (src: string): string => /`(opening [^`]+)`/.exec(message(src))![1]!;

  it.each([
    [
      "before width",
      "open id=o between a and b at 1500 from start width 2000",
      "opening id=o between a and b at 1500 from start width 2000",
    ],
    ["after width", "open between a and b width 2000 at center", "opening between a and b at center width 2000"],
    [
      "with no width",
      "open between a and b at 1500 from a.top",
      "opening between a and b at 1500 from a.top width <mm>",
    ],
    [
      "an expression",
      "open between a and b width 1000 * 2 at 1500 from end",
      "opening between a and b at 1500 from end width 1000 * 2",
    ],
  ])("%s: the parse error quotes the statement to write", (_name, clause, statement) => {
    const src = plan(ROOM, BESIDE, walls(clause));
    expect(errors(src)).toEqual(["E_PARSE"]);
    expect(quoted(src)).toBe(statement);
  });

  it.each([
    ["a plain length reads from the start", "open between a and b at 1500 width 2000", "at 1500 from start width 2000"],
    [
      "a percentage names nothing `between` reads",
      "open between a and b at 40% width 2000",
      "at <mm> from start width 2000",
    ],
    ["a corner is no place for it", "open between a and b at corner a.top width 2000", "at <mm> from start width 2000"],
  ])("%s", (_name, clause, tail) => {
    const src = plan(ROOM, BESIDE, walls(clause));
    expect(quoted(src)).toBe(`opening between a and b ${tail}`);
    const fixed = plan(ROOM, BESIDE, DERIVED, `  ${quoted(src).replace("<mm>", "1500")}`);
    expect(errors(fixed)).toEqual([]);
    expect(describePlan(fixed).openings[0]!.centreline_at).toEqual({ x: 6000, y: 1500 });
  });

  it("pasted, what it quotes compiles and stands where it said", () => {
    const src = plan(ROOM, BESIDE, walls("open id=o between a and b at 1500 from start width 2000"));
    const fixed = plan(ROOM, BESIDE, DERIVED, `  ${quoted(src)}`);
    expect(errors(fixed)).toEqual([]);
    expect(describePlan(fixed).openings[0]).toMatchObject({
      id: "o",
      width: 2000,
      centreline_at: { x: 6000, y: 1500 },
    });
  });

  // ADR 0028 §3's amendment, as a test: the claim the decision rests on.
  describe("what `opening between` is to `open`, over one span", () => {
    const pair = (width: string, opening: string): [string, string] => [
      plan(ROOM, BESIDE, walls(`open id=o between a and b${width}`), DOOR),
      plan(ROOM, BESIDE, DERIVED, DOOR, `  opening id=o between a and b at center width ${opening}`),
    ];

    it.each([
      ["narrower than the span", ...pair(" width 2000", "2000")],
      ["the whole clear span", ...pair("", "4800")],
    ])("%s: the same drawing, lint and rooms; `describe` differs by the row and `freedom`", (_name, open, opening) => {
      expect(compile(open).svg).toBe(compile(opening).svg);
      expect(lint(open)).toEqual(lint(opening));
      const [a, b] = [describePlan(open), describePlan(opening)];
      expect(a.rooms).toEqual(b.rooms);
      const moved = Object.keys(a).filter(
        (k) => JSON.stringify(a[k as keyof typeof a]) !== JSON.stringify(b[k as keyof typeof b]),
      );
      expect(moved.sort()).toEqual(["freedom", "openings"]);
    });

    it("the cased opening keeps what the clause gives up: a door on the rest of the line, and its nibs", () => {
      const door = `  door id=e between a and b at 700 from end width 800 swing into b`;
      expect(
        errors(plan(ROOM, BESIDE, DERIVED, `  opening id=o between a and b at 1500 from start width 2000`, door)),
      ).toEqual([]);
      expect(errors(plan(ROOM, BESIDE, walls("open id=o between a and b width 2000"), door))).toEqual([
        "E_WALL_BETWEEN_OPEN",
      ]);
      expect(errors(plan(ROOM, BESIDE, DERIVED, `  opening id=o between a and b at center width 4750`))).toEqual([
        "E_OPENING_NIB",
      ]);
      expect(errors(plan(ROOM, BESIDE, walls("open id=o between a and b width 4750")))).toEqual([]);
    });
  });
});
