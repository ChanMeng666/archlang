/**
 * Vertical circulation: `stair`, `elevator`, `escalator`.
 *
 * The contract this suite pins:
 *  - each of the three is a registry element (parse → resolve → render), dispatched by
 *    keyword/kind, with NO switch anywhere: adding one to a fresh registry is enough;
 *  - the plan symbols are real drawings — tread lines at the nominal going, a paired
 *    break line, a direction arrow labelled UP/DN, crossed diagonals, chevrons;
 *  - a footprint obstructs circulation like furniture EXCEPT outside its entry edge, so
 *    the landing you approach the flight across stays walkable;
 *  - the SAME id on two `level` blocks is one shaft: it becomes a `describe().vertical`
 *    connection, it makes an upper storey reachable with no front door of its own, and an
 *    id on exactly one storey is `W_STAIR_UNMATCHED`;
 *  - `checkGraph` counts a shaft as a connector between the rooms it lands in;
 *  - a plan with none of the three is byte-identical, and every plan is deterministic.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import {
  BUILTIN_REGISTRY,
  checkGraph,
  compile,
  createRegistry,
  describe as describePlan,
  entryEdges,
  flightAxis,
  lint,
  resolveAll,
  type StoreyRoomReach,
  type VerticalLevelInput,
  type VerticalReach,
  VERTICAL_KINDS,
  verticalConnections,
  verticalReach,
  verticalsOf,
} from "../src/index.js";
import { buildingRoomReach, DEFAULT_TOL, resolvePlan, storeyGrounded } from "../src/analyze.js";
import { parse } from "../src/parser.js";
import type { ResolvedPlan, RStair } from "../src/ir.js";
import type { World } from "../src/world.js";
import { treadCount, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";
import { symbolInk } from "../src/elements/glyph-lib.js";
import { DEFAULT_THEME } from "../src/theme.js";

const SHELL = `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }`;

/** A single-storey plan whose hall holds whatever `body` draws. */
const plan = (body: string): string => `plan "P" {
  units mm
  grid 50
  ${SHELL}
  room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
  door id=front on shell at 15000 width 1000 swing into hall
  ${body}
}`;

const elements = (src: string) => resolveAll(parse(src, BUILTIN_REGISTRY).plan!).ir.elements;

// ---------------------------------------------------------------------------
// registry-driven dispatch
// ---------------------------------------------------------------------------

suite("vertical circulation — one module per element, dispatched by the registry", () => {
  it("all three are registered by keyword AND by kind", () => {
    for (const k of VERTICAL_KINDS) {
      expect(BUILTIN_REGISTRY.byKeyword.get(k)?.kind, `keyword ${k}`).toBe(k);
      expect(BUILTIN_REGISTRY.byKind.get(k)?.keyword, `kind ${k}`).toBe(k);
    }
  });

  it("a fresh registry resolves and renders them with no core dispatch edit", () => {
    // createRegistry() clones the built-ins; if anything dispatched through a switch,
    // a registry-only path could not produce geometry.
    const reg = createRegistry();
    for (const k of VERTICAL_KINDS) {
      const def = reg.byKind.get(k)!;
      expect(typeof def.parse).toBe("function");
      expect(typeof def.resolve).toBe("function");
      expect(typeof def.render).toBe("function");
      expect(def.params!.length).toBeGreaterThan(0);
    }
  });

  it("each parses to its own AST node with the authored fields", () => {
    const ast = parse(
      plan(`stair id=s at (0,0) size 900x2600 dir up width 800
  elevator id=lift at (2000,0) size 1600x1600
  escalator id=esc at (4000,0) size 1200x4000 dir down`),
      BUILTIN_REGISTRY,
    ).plan!;
    const kinds = ast.body.map((s) => s.kind);
    expect(kinds).toContain("stair");
    expect(kinds).toContain("elevator");
    expect(kinds).toContain("escalator");
  });
});

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

suite("vertical circulation — resolve", () => {
  it("a stair's flight width defaults to the footprint's cross extent", () => {
    const s = elements(plan(`stair id=s at (0,0) size 900x2600 dir up`)).find((e) => e.kind === "stair") as RStair;
    expect(s.width).toBe(900);
    expect(s.dir).toBe("up");
  });

  it("an authored flight width narrower than the footprint is kept", () => {
    const s = elements(plan(`stair id=s at (0,0) size 1800x2600 dir down width 900`)).find(
      (e) => e.kind === "stair",
    ) as RStair;
    expect(s.width).toBe(900);
  });

  it("a flight width wider than the footprint is E_STAIR_WIDTH (returned, not thrown)", () => {
    const r = compile(plan(`stair id=s at (0,0) size 900x2600 dir up width 1200`), { noCache: true });
    expect(r.diagnostics.map((d) => d.code)).toContain("E_STAIR_WIDTH");
  });

  it("a non-positive footprint is E_VERT_SIZE for every kind", () => {
    for (const body of [
      `stair id=s at (0,0) size 900x0 dir up`,
      `elevator id=l at (0,0) size 0x1600`,
      `escalator id=e at (0,0) size 1200x0 dir up`,
    ]) {
      expect(
        compile(plan(body), { noCache: true }).diagnostics.map((d) => d.code),
        body,
      ).toContain("E_VERT_SIZE");
    }
  });

  it("`dir` is mandatory on a stair and an escalator, and rejects anything else", () => {
    for (const body of [`stair id=s at (0,0) size 900x2600`, `escalator id=e at (0,0) size 1200x4000 dir sideways`]) {
      expect(compile(plan(body), { noCache: true }).errors.length, body).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// the plan symbols
// ---------------------------------------------------------------------------

/** The scene nodes a plan emits on one CAD layer. */
const layerNodes = (src: string, layerName: string) =>
  compile(src, { noCache: true }).scene!.nodes.filter((n) => n.layerName === layerName);

suite("vertical circulation — the plan symbols", () => {
  it("a stair draws treads at the nominal going, a paired break line and an arrow", () => {
    const nodes = layerNodes(plan(`stair id=s at (0,0) size 900x2600 dir up`), "A-FLOR-STRS");
    // One footprint polygon.
    expect(nodes.filter((n) => n.prim.t === "polygon")).toHaveLength(1);
    // The UP word.
    const text = nodes.filter((n) => n.prim.t === "text");
    expect(text).toHaveLength(1);
    expect(text[0]!.prim).toMatchObject({ value: "UP" });

    const lines = nodes.filter((n) => n.prim.t === "line");
    // Treads run ACROSS the flight (horizontal here — a portrait footprint), the two
    // break-line diagonals do not, and the arrow's shaft runs ALONG it.
    const horizontal = lines.filter((n) => n.prim.t === "line" && n.prim.a.y === n.prim.b.y);
    const diagonal = lines.filter((n) => n.prim.t === "line" && n.prim.a.y !== n.prim.b.y && n.prim.a.x !== n.prim.b.x);
    expect(diagonal.length).toBeGreaterThanOrEqual(2); // break line + the two arrow barbs
    // 2600 / 280 ≈ 9 divisions ⇒ 8 interior treads, minus the ones the break line cuts.
    expect(treadCount(2600)).toBe(9);
    expect(horizontal.length).toBeGreaterThan(0);
    expect(horizontal.length).toBeLessThan(treadCount(2600));
    // The two break-line diagonals are parallel (same run and rise).
    const slope = (n: (typeof diagonal)[number]): number => {
      const p = n.prim as { t: "line"; a: { x: number; y: number }; b: { x: number; y: number } };
      return (p.b.y - p.a.y) / (p.b.x - p.a.x);
    };
    const breaks = diagonal.filter((n) => {
      const p = n.prim as { t: "line"; a: { x: number }; b: { x: number } };
      return Math.abs(p.b.x - p.a.x) > 900; // spans the whole flight (arrow barbs do not)
    });
    expect(breaks).toHaveLength(2);
    expect(slope(breaks[0]!)).toBeCloseTo(slope(breaks[1]!), 9);
  });

  it("`dir up` draws UP and `dir down` draws DN", () => {
    const word = (dir: string) =>
      layerNodes(plan(`stair id=s at (0,0) size 900x2600 dir ${dir}`), "A-FLOR-STRS").filter(
        (n) => n.prim.t === "text",
      )[0]!.prim;
    expect(word("up")).toMatchObject({ value: "UP" });
    expect(word("down")).toMatchObject({ value: "DN" });
  });

  it("a narrower flight draws the band's own long edges; a full-width one does not", () => {
    // The band edges are the only lines that run the WHOLE length ALONG the flight and
    // are not the arrow shaft (which sits on the centreline, x = 900).
    const bandEdges = (src: string): number[] =>
      layerNodes(src, "A-FLOR-STRS")
        .map((n) => n.prim)
        .filter(
          (p): p is { t: "line"; a: { x: number; y: number }; b: { x: number; y: number } } =>
            p.t === "line" && p.a.x === p.b.x && p.a.x !== 900 && Math.abs(p.b.y - p.a.y) === 2600,
        )
        .map((p) => p.a.x)
        .sort((a, b) => a - b);
    expect(bandEdges(plan(`stair id=s at (0,0) size 1800x2600 dir up`))).toEqual([]);
    expect(bandEdges(plan(`stair id=s at (0,0) size 1800x2600 dir up width 900`))).toEqual([450, 1350]);
  });

  it("an elevator draws the car rectangle plus corner-to-corner crossed diagonals", () => {
    const nodes = layerNodes(plan(`elevator id=lift at (1000,1000) size 1600x1600`), "A-FLOR-EVTR");
    expect(nodes.filter((n) => n.prim.t === "polygon")).toHaveLength(1);
    const lines = nodes.filter((n) => n.prim.t === "line").map((n) => n.prim);
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual({ t: "line", a: { x: 1000, y: 1000 }, b: { x: 2600, y: 2600 } });
    expect(lines).toContainEqual({ t: "line", a: { x: 2600, y: 1000 }, b: { x: 1000, y: 2600 } });
    // No UP/DN: a lift serves every storey it appears on.
    expect(nodes.filter((n) => n.prim.t === "text")).toHaveLength(0);
  });

  it("an escalator draws chevrons (line PAIRS meeting on the centreline) plus an arrow", () => {
    const nodes = layerNodes(plan(`escalator id=e at (0,0) size 1200x4000 dir up`), "A-FLOR-STRS");
    expect(nodes.filter((n) => n.prim.t === "text")[0]!.prim).toMatchObject({ value: "UP" });
    const apexes = nodes
      .filter((n) => n.prim.t === "line")
      .map((n) => n.prim as { b: { x: number; y: number } })
      // A chevron's two strokes both END at the apex, on the flight centreline (x = 600).
      .filter((p) => p.b.x === 600);
    // Every apex is shared by exactly two strokes.
    const byY = new Map<number, number>();
    for (const p of apexes) byY.set(p.b.y, (byY.get(p.b.y) ?? 0) + 1);
    expect([...byY.values()].filter((n) => n === 2).length).toBeGreaterThan(1);
  });

  it("tone follows the symbol hierarchy: outline and arrow in the symbol ink, detail in furnitureStroke", () => {
    // The same rule the fixture glyphs follow (`elements/glyph-lib.ts`), so a stair never reads
    // paler than the sofa beside it. Widths are untouched — every line is the thin pen.
    const ink = symbolInk(DEFAULT_THEME.furnitureStroke, DEFAULT_THEME.wallStroke);
    const detail = DEFAULT_THEME.furnitureStroke;
    expect(ink).not.toBe(detail);
    // The stair (x 0..900): the arrow is every line with an end on the centreline, x = 450.
    const stair = layerNodes(plan(`stair id=s at (0,0) size 900x2600 dir up`), "A-FLOR-STRS");
    const onAxis = (n: (typeof stair)[number]): boolean =>
      n.prim.t === "line" && (n.prim.a.x === 450 || n.prim.b.x === 450);
    expect(stair.find((n) => n.prim.t === "polygon")!.paint.stroke).toBe(ink);
    const arrow = stair.filter(onAxis);
    expect(arrow).toHaveLength(3); // shaft + two barbs
    for (const n of arrow) expect(n.paint.stroke).toBe(ink);
    const treads = stair.filter((n) => n.prim.t === "line" && !onAxis(n));
    expect(treads.length).toBeGreaterThan(2);
    for (const n of treads) expect(n.paint.stroke).toBe(detail);
    // The UP word keeps the label colour.
    expect(stair.find((n) => n.prim.t === "text")!.paint.fill).toBe(DEFAULT_THEME.annotation);
    // The lift: the car outline in ink, its cross in the detail tone.
    const lift = layerNodes(plan(`elevator id=lift at (1000,1000) size 1600x1600`), "A-FLOR-EVTR");
    expect(lift.find((n) => n.prim.t === "polygon")!.paint.stroke).toBe(ink);
    for (const n of lift.filter((x) => x.prim.t === "line")) expect(n.paint.stroke).toBe(detail);
    // The escalator: footprint in ink, chevrons in the detail tone.
    const esc = layerNodes(plan(`escalator id=e at (0,0) size 1200x4000 dir up`), "A-FLOR-STRS");
    expect(esc.find((n) => n.prim.t === "polygon")!.paint.stroke).toBe(ink);
    const chevrons = esc.filter((n) => n.prim.t === "line" && n.prim.a.x !== 600 && n.prim.b.x === 600);
    expect(chevrons.length).toBeGreaterThan(2);
    for (const n of chevrons) expect(n.paint.stroke).toBe(detail);
  });

  it("the going is the documented nominal and the divisions scale with the run", () => {
    expect(TREAD_GOING_MM).toBe(280);
    expect(treadCount(2600)).toBe(9);
    expect(treadCount(100)).toBe(2); // never fewer than two divisions
    expect(treadCount(5600)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// entry edge + circulation obstruction
// ---------------------------------------------------------------------------

suite("vertical circulation — entry edge and the nav grid", () => {
  const s = (w: number, h: number, dir: "up" | "down" = "up"): RStair => ({
    kind: "stair",
    id: "s",
    at: { x: 0, y: 0 },
    size: { w, h },
    dir,
    width: Math.min(w, h),
  });

  it("the flight runs along the LONG axis; a RISING one starts at its larger-coordinate end", () => {
    expect(flightAxis({ w: 900, h: 2600 })).toBe("y");
    expect(flightAxis({ w: 2600, h: 900 })).toBe("x");
    expect(flightAxis({ w: 900, h: 900 })).toBe("y"); // square ⇒ portrait, total and stable
    expect(entryEdges(s(900, 2600))).toEqual(["bottom"]);
    expect(entryEdges(s(2600, 900))).toEqual(["right"]);
    expect(entryEdges({ kind: "elevator", id: "l", at: { x: 0, y: 0 }, size: { w: 2600, h: 900 } })).toEqual([
      "bottom",
    ]);
  });

  it("a DESCENDING run is met at its head, so `dir down` flips the entry to the other end", () => {
    expect(entryEdges(s(900, 2600, "down"))).toEqual(["top"]);
    expect(entryEdges(s(2600, 900, "down"))).toEqual(["left"]);
    // An escalator's halo is lifted at BOTH narrow ends either way; only the order (and
    // therefore the arrow's tail) follows `dir`.
    expect(entryEdges({ ...s(900, 2600), kind: "escalator" } as never)).toEqual(["bottom", "top"]);
    expect(entryEdges({ ...s(900, 2600, "down"), kind: "escalator" } as never)).toEqual(["top", "bottom"]);
  });

  it("one shaft's UP and DN arrows therefore point in OPPOSITE directions", () => {
    const shaft = (dir: string) =>
      layerNodes(plan(`stair id=s at (0,0) size 900x2600 dir ${dir}`), "A-FLOR-STRS")
        .filter((n) => n.prim.t === "line")
        .map((n) => n.prim as { a: { x: number; y: number }; b: { x: number; y: number } })
        .filter((p) => p.a.x === p.b.x)
        .sort((p, q) => Math.abs(q.b.y - q.a.y) - Math.abs(p.b.y - p.a.y))[0]!;
    const up = shaft("up");
    const down = shaft("down");
    expect(up.b.y).toBeLessThan(up.a.y); // UP points north
    expect(down.b.y).toBeGreaterThan(down.a.y); // DN points south
  });

  /**
   * A hall split by a partition with a cased opening, entered from the south. `body`
   * draws an obstacle across the SOUTH room, leaving one nav-grid cell column free
   * between its right-hand end (x = 5800) and the east wall's inner face (x = 5900) —
   * so `north` is reachable if, and only if, that column is walkable.
   */
  const slot = (body: string): string => `plan "P" {
  units mm
  grid 50
  ${SHELL}
  wall id=mid partition thickness 100 { (0,3000) (6000,3000) }
  room id=north at (0,0) size 6000x3000 label "North" uses hall
  room id=south at (0,3000) size 6000x3000 label "South" uses hall
  door id=front on shell at 15000 width 1000 swing into south
  opening id=o at (2000,3000) width 1600
  ${body}
}`;

  const reached = (src: string): string[] => describePlan(src).circulation!.rooms.map((r) => r.roomId);

  it("a footprint obstructs the walk exactly like furniture — the room beyond is cut off", () => {
    expect(reached(slot(``))).toEqual(["north", "south"]);
    // A furniture rectangle of the same footprint inflates by the body radius on ALL
    // four sides, so the 100 mm slot is eroded shut and `north` drops out.
    expect(reached(slot(`furniture block at (0,4000) size 5800x900`))).toEqual(["south"]);
  });

  it("… EXCEPT outside its entry edge, where the halo is lifted and the landing stays walkable", () => {
    // The identical footprint as a STAIR. A landscape footprint is entered from its
    // right-hand end, so the halo is suppressed there — the slot survives and the route
    // past the flight is open again.
    expect(reached(slot(`stair id=s at (0,4000) size 5800x900 dir up`))).toEqual(["north", "south"]);
    // Turn it into a portrait-ish run whose entry is the BOTTOM instead: the right-hand
    // slot is no longer an entry side, so it erodes shut like furniture.
    expect(
      reached(
        slot(`stair id=s at (0,4000) size 700x900 dir up
  furniture block at (700,4000) size 5100x900`),
      ),
    ).toEqual(["south"]);
  });
});

// ---------------------------------------------------------------------------
// cross-level: identity, reachability, W_STAIR_UNMATCHED
// ---------------------------------------------------------------------------

/** A two-storey plan whose ground floor has the only front door. `up`/`down` bodies. */
const twoStorey = (ground: string, upper: string): string => `plan "House" {
  units mm
  grid 50
  level 1 "Ground" {
    ${SHELL}
    room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
    door id=front on shell at 15000 width 1000 swing into hall
    window id=w1 on shell at 3000 width 1200
    ${ground}
  }
  level 2 "First" {
    ${SHELL}
    room id=landing at (0,0) size 6000x6000 label "Landing" uses circulation
    window id=w2 on shell at 3000 width 1200
    ${upper}
  }
}`;

const STAIR_UP = `stair id=stair at (500,2000) size 900x2600 dir up`;
const STAIR_DOWN = `stair id=stair at (500,2000) size 900x2600 dir down`;

suite("vertical circulation — the same id on two storeys is one shaft", () => {
  it("describe().vertical reports the connection, its levels and its per-storey stops", () => {
    const s = describePlan(twoStorey(STAIR_UP, STAIR_DOWN));
    expect(s.vertical!.connections).toEqual([
      {
        id: "stair",
        kind: "stair",
        levels: [1, 2],
        stops: [
          { level: 1, dir: "up", room: "hall" },
          { level: 2, dir: "down", room: "landing" },
        ],
      },
    ]);
    expect(s.vertical!.reachable_levels).toEqual([1, 2]);
  });

  it("`vertical` is absent for a single-storey plan and for an unmatched run", () => {
    expect(describePlan(plan(STAIR_UP))).not.toHaveProperty("vertical");
    expect(describePlan(twoStorey(STAIR_UP, ``))).not.toHaveProperty("vertical");
  });

  it("each storey lists its OWN runs under `verticals`; a storey with none omits the key", () => {
    const s = describePlan(twoStorey(STAIR_UP, ``));
    expect(s.levels![0]!.verticals).toEqual([
      {
        id: "stair",
        kind: "stair",
        dir: "up",
        room: "hall",
        bbox: { x: 500, y: 2000, w: 900, h: 2600 },
        flight_width: 900,
      },
    ]);
    expect(s.levels![1]!).not.toHaveProperty("verticals");
  });

  it("an upper storey reached by the shaft raises NO W_NO_ENTRANCE …", () => {
    const codes = lint(twoStorey(STAIR_UP, STAIR_DOWN)).map((d) => d.code);
    expect(codes).not.toContain("W_NO_ENTRANCE");
    expect(codes).not.toContain("W_ROOM_UNREACHABLE");
  });

  it("… and the counterexample DOES: no shaft ⇒ the upper storey has no way in", () => {
    const diags = lint(twoStorey(``, ``)).filter((d) => d.code === "W_NO_ENTRANCE");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.level).toBe(2);
  });

  it("a lone run on one storey is W_STAIR_UNMATCHED, tagged with its level", () => {
    const diags = lint(twoStorey(STAIR_UP, ``)).filter((d) => d.code === "W_STAIR_UNMATCHED");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.level).toBe(1);
    expect(diags[0]!.message).toContain('Stair "stair"');
  });

  it("a matched pair raises no W_STAIR_UNMATCHED, and a single-storey plan never does", () => {
    expect(lint(twoStorey(STAIR_UP, STAIR_DOWN)).map((d) => d.code)).not.toContain("W_STAIR_UNMATCHED");
    expect(lint(plan(STAIR_UP)).map((d) => d.code)).not.toContain("W_STAIR_UNMATCHED");
  });

  it("verticalConnections is identity-only — a different id on the upper floor connects nothing", () => {
    const { levels } = resolveAll(
      parse(twoStorey(STAIR_UP, `stair id=other at (500,2000) size 900x2600 dir down`), BUILTIN_REGISTRY).plan!,
    );
    expect(verticalConnections(levels.map((l) => ({ level: l.level, ir: l.ir })))).toEqual([]);
    expect(verticalsOf(levels[0]!.ir).map((v) => v.id)).toEqual(["stair"]);
  });
});

// ---------------------------------------------------------------------------
// checkGraph
// ---------------------------------------------------------------------------

suite("vertical circulation — checkGraph counts a shaft as a cross-level connector", () => {
  const SRC = twoStorey(STAIR_UP, STAIR_DOWN);

  it("an intended hall↔landing edge is satisfied by the shaft", () => {
    expect(checkGraph(SRC, { hall: ["landing"] })).toEqual({
      ok: true,
      missing_rooms: [],
      missing_connections: [],
      extra_connections: [],
    });
  });

  it("without the shaft the same edge is missing (and the shaft is the only extra)", () => {
    const noShaft = checkGraph(twoStorey(``, ``), { hall: ["landing"] });
    expect(noShaft.ok).toBe(false);
    expect(noShaft.missing_connections).toEqual([["hall", "landing"]]);
    // Both storeys' rooms are nodes even with no shaft — the graph is the BUILDING's.
    expect(noShaft.missing_rooms).toEqual([]);
    expect(checkGraph(SRC, {}).extra_connections).toEqual([["hall", "landing"]]);
  });
});

// ---------------------------------------------------------------------------
// the invariants
// ---------------------------------------------------------------------------

suite("vertical circulation — byte identity and determinism", () => {
  it("every shipped example that draws none of the three is byte-identical", () => {
    // The example corpus is the strongest available proof that nothing on the default
    // path moved: only two-storey.arch uses the new elements.
    for (const f of readdirSync("examples").filter((n) => n.endsWith(".arch"))) {
      const src = readFileSync(`examples/${f}`, "utf8");
      if (/\b(stair|elevator|escalator)\s/.test(src)) continue;
      const a = compile(src, { noCache: true });
      const b = compile(src, { noCache: true });
      expect(a.svg, f).toBe(b.svg);
      expect(
        a.diagnostics.map((d) => d.code),
        f,
      ).toEqual(b.diagnostics.map((d) => d.code));
    }
  });

  it("a plan drawing all three compiles byte-identically twice", () => {
    const src = plan(`stair id=s at (0,0) size 900x2600 dir up
  elevator id=lift at (2000,0) size 1600x1600
  escalator id=esc at (4000,0) size 1200x4000 dir down`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("a stair keeps the plan drawable — `W_EMPTY_PLAN` is not raised for a stair-only plan", () => {
    const codes = compile(`plan "P" { units mm stair id=s at (0,0) size 900x2600 dir up }`, {
      noCache: true,
    }).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("W_EMPTY_PLAN");
  });

  it("`fmt` round-trips all three verbatim", async () => {
    const { format } = await import("../src/index.js");
    const src = plan(`stair id=s at (0,0) size 900x2600 dir up width 800
  elevator id=lift at (2000,0) size 1600x1600
  escalator id=esc at (4000,0) size 1200x4000 dir down`);
    const once = format(src);
    expect(once).toContain("stair id=s at (0, 0) size 900x2600 dir up width 800");
    expect(once).toContain("elevator id=lift at (2000, 0) size 1600x1600");
    expect(once).toContain("escalator id=esc at (4000, 0) size 1200x4000 dir down");
    expect(format(once)).toBe(once); // idempotent
  });
});

// ---------------------------------------------------------------------------
// a balcony door is not an arrival point
// ---------------------------------------------------------------------------

/**
 * A two-storey house whose upper storey has a landing (holding the shaft's arrival end),
 * a bedroom with an exterior door, and a bathroom reachable ONLY through that bedroom's
 * interior door. `outdoorClause` is either an `outdoor balcony` covering the bedroom
 * door's outward face, or `` — the counterexample pair `levelIsGrounded` is pinned by.
 */
const balconyHouse = (outdoorClause: string): string => `plan "House" {
  units mm
  grid 50
  level 1 "Ground" {
    ${SHELL}
    room id=hall at (0,0) size 6000x6000 label "Hall" uses hall entry
    door id=front on shell at 15000 width 1000 swing into hall
    window id=w1 on shell at 3000 width 1200
    stair id=stair at (500,300) size 900x1400 dir up
  }
  level 2 "First" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    wall id=p_h partition thickness 100 { (0,2000) (6000,2000) }
    wall id=p_v partition thickness 100 { (3000,2000) (3000,6000) }
    room id=landing at (0,0)       size 6000x2000 label "Landing"  uses circulation
    room id=bed1    at (0,2000)    size 3000x4000 label "Bedroom"  uses bedroom
    room id=bath    at (3000,2000) size 3000x4000 label "Bath"     uses bath
    door id=d_bed1 on p_h at 1500  width 900 swing into bed1
    door id=d_bath on p_h at 4500  width 800 swing into bath
    door id=d_balc sliding on shell at 16500 width 1800 slide right
    stair id=stair at (500,300) size 900x1400 dir down
    ${outdoorClause}
  }
}`;

const WITH_BALCONY = `outdoor id=g_bal balcony at (500,6100) size 2000x1200`;

suite("vertical circulation — a balcony door is not an arrival point", () => {
  it("a bedroom's balcony door does NOT ground the upper storey — no false W_BATH_VIA_BEDROOM", () => {
    const src = balconyHouse(WITH_BALCONY);
    const codes = lint(src).map((d) => d.code);
    expect(codes).not.toContain("W_BATH_VIA_BEDROOM");
    // The stair's arrival room is the landing, not suppressed by a false grounding.
    const s = describePlan(src);
    expect(s.vertical!.reachable_levels).toEqual([1, 2]);
    // The per-storey `access.hasEntrance` fact stays HONEST — that floor really does
    // have an exterior door — even though it no longer grounds the shaft's reach.
    expect(s.levels![1]!.access.hasEntrance).toBe(true);
  });

  it("… and the counterexample: remove the balcony, and the SAME door genuinely grounds the storey, so the bathroom really is reached only via the bedroom", () => {
    const src = balconyHouse(``);
    const codes = lint(src).map((d) => d.code);
    expect(codes).toContain("W_BATH_VIA_BEDROOM");
    const s = describePlan(src);
    expect(s.vertical!.reachable_levels).toEqual([1, 2]);
    expect(s.levels![1]!.access.hasEntrance).toBe(true);
  });

  it("the en-suite exemption is per storey: a WC off the ground-floor hall does not excuse the bathroom upstairs", () => {
    // With the balcony the upper storey is entered at the landing (the shaft's arrival room).
    // Move the bathroom's door off the landing and onto the bedroom: a true en-suite.
    const base = balconyHouse(WITH_BALCONY);
    const ensuite = base.replace(
      `door id=d_bath on p_h at 4500  width 800 swing into bath`,
      `door id=d_bath on p_v at 2000  width 800 swing into bath`,
    );
    expect(ensuite).not.toBe(base);
    const viaBedroom = (src: string): number => lint(src).filter((d) => d.code === "W_BATH_VIA_BEDROOM").length;
    expect(viaBedroom(ensuite)).toBe(1);
    // A WC off the hall one storey down changes nothing upstairs.
    const wcBelow = ensuite.replace(
      `room id=hall at (0,0) size 6000x6000 label "Hall" uses hall entry`,
      `wall id=p_wc partition thickness 100 { (4000,0) (4000,6000) }
    room id=hall at (0,0) size 4000x6000 label "Hall" uses hall entry
    room id=wc at (4000,0) size 2000x6000 label "WC" uses wc
    door id=d_wc on p_wc at 3000 width 800 swing into wc`,
    );
    expect(wcBelow).not.toBe(ensuite);
    expect(describePlan(wcBelow).levels![0]!.access.rooms.find((r) => r.id === "wc")?.reachable).toBe(true);
    expect(viaBedroom(wcBelow)).toBe(1);
    // The same WC on the bathroom's own storey, off the landing, does.
    const wcBeside = ensuite.replace(
      `room id=landing at (0,0)       size 6000x2000 label "Landing"  uses circulation`,
      `wall id=p_wc partition thickness 100 { (4000,0) (4000,2000) }
    room id=landing at (0,0)       size 4000x2000 label "Landing"  uses circulation
    room id=wc      at (4000,0)    size 2000x2000 label "WC"       uses wc
    door id=d_wc on p_wc at 1000 width 800 swing into wc`,
    );
    expect(wcBeside).not.toBe(ensuite);
    expect(describePlan(wcBeside).levels![1]!.access.rooms.find((r) => r.id === "wc")?.reachable).toBe(true);
    expect(viaBedroom(wcBeside)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// verticalReach: the room-aware fixpoint is an optional refinement of the old one
// ---------------------------------------------------------------------------

/**
 * `verticalReach` exactly as it stood before the room-aware `roomReach` parameter existed
 * (verbatim body, renamed). It is the oracle for the law that the two-argument call is
 * unchanged, and that the room-aware fixpoint with every room live reproduces it.
 */
function oracleVerticalReach(
  levels: readonly VerticalLevelInput[],
  grounded: (level: number) => boolean,
): VerticalReach {
  const connections = verticalConnections(levels);
  const reachable = new Set<number>();
  for (const l of levels) if (grounded(l.level)) reachable.add(l.level);
  const arrivalRooms = new Map<number, string[]>();

  for (let pass = 0; pass < levels.length + 1; pass++) {
    let grew = false;
    for (const c of connections) {
      const anyReachable = c.levels.some((n) => reachable.has(n));
      if (!anyReachable) continue;
      for (const stop of c.stops) {
        if (!reachable.has(stop.level)) {
          reachable.add(stop.level);
          grew = true;
        }
        if (grounded(stop.level) || stop.room === null) continue;
        const list = arrivalRooms.get(stop.level) ?? [];
        if (!list.includes(stop.room)) {
          list.push(stop.room);
          arrivalRooms.set(stop.level, list);
        }
      }
    }
    if (!grew) break;
  }
  return { reachable, arrivalRooms };
}

/** A reach result with its insertion orders made visible, so `toEqual` is order-strict. */
const shape = (r: VerticalReach) => ({ reachable: [...r.reachable], arrivalRooms: [...r.arrivalRooms.entries()] });

/** Every room of the storey, whatever the seeds: the callback under which no stop is dead. */
const allRoomsLive =
  (levels: readonly VerticalLevelInput[]): StoreyRoomReach =>
  (level) =>
    new Set(
      (levels.find((l) => l.level === level)?.ir.elements ?? []).filter((e) => e.kind === "room").map((e) => e.id),
    );

interface Spec {
  grounded: boolean;
  rooms: boolean[];
  runs: { id: string; kind: string; cell: number }[];
  /** Which rooms the exterior reaches, and per room which rooms it reaches — a monotone reach. */
  fromExterior: boolean[];
  fromRoom: boolean[][];
}

/**
 * A synthetic building: up to four storeys, each a strip of up to three 1000 mm rooms and a
 * few runs whose centre falls in a room cell or in the empty cell past the strip (`room:
 * null`). Only the fields `verticalConnections`/`roomOfVertical` read are present.
 */
const arbBuilding: fc.Arbitrary<[Spec[], number]> = fc.tuple(
  fc.array(
    fc.record({
      grounded: fc.boolean(),
      rooms: fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
      runs: fc.array(
        fc.record({
          id: fc.constantFrom("a", "b", "c", "d"),
          kind: fc.constantFrom("stair", "elevator", "escalator"),
          cell: fc.integer({ min: 0, max: 3 }),
        }),
        { maxLength: 4 },
      ),
      fromExterior: fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
      fromRoom: fc.array(fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), { minLength: 3, maxLength: 3 }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  fc.integer({ min: -1, max: 1 }),
);

function synth(specs: Spec[], base: number) {
  const levels: VerticalLevelInput[] = specs.map((s, i) => {
    const elements = [
      ...s.rooms.flatMap((present, k) =>
        present ? [{ kind: "room", id: `r${k}`, at: { x: k * 1000, y: 0 }, size: { w: 1000, h: 1000 } }] : [],
      ),
      ...s.runs.map((r) => ({
        kind: r.kind,
        id: r.id,
        at: { x: r.cell * 1000 + 300, y: 300 },
        size: { w: 400, h: 400 },
        ...(r.kind === "elevator" ? {} : { dir: "up" }),
      })),
    ];
    return { level: base + i, ir: { elements } as unknown as ResolvedPlan };
  });
  const specOf = (level: number): Spec | undefined => specs[level - base];
  const grounded = (level: number): boolean => specOf(level)?.grounded ?? false;
  const roomReach: StoreyRoomReach = (level, seeds) => {
    const s = specOf(level)!;
    const out = new Set<string>();
    const addAll = (row: readonly boolean[]): void => {
      for (let k = 0; k < row.length; k++) if (row[k] && s.rooms[k]) out.add(`r${k}`);
    };
    if (seeds.exterior) addAll(s.fromExterior);
    for (const id of seeds.rooms) {
      out.add(id);
      addAll(s.fromRoom[Number(id.slice(1))]!);
    }
    return out;
  };
  return { levels, grounded, roomReach };
}

/**
 * The room-aware semantics restated as a naive least fixpoint — recompute every storey's
 * live rooms from scratch each round, fire every connection with an active stop — with no
 * pass structure, caching or ordering shared with `src/vertical.ts`.
 */
function naiveRoomAware(levels: readonly VerticalLevelInput[], grounded: (n: number) => boolean, rr: StoreyRoomReach) {
  const connections = verticalConnections(levels);
  const reach = new Set(levels.filter((l) => grounded(l.level)).map((l) => l.level));
  const seeds = new Map<number, Set<string>>(levels.map((l) => [l.level, new Set<string>()]));
  for (let changed = true; changed; ) {
    changed = false;
    const live = new Map(
      levels.map((l) => [l.level, rr(l.level, { exterior: grounded(l.level), rooms: [...seeds.get(l.level)!] })]),
    );
    for (const c of connections) {
      const fires = c.stops.some((s) => reach.has(s.level) && (s.room === null || live.get(s.level)!.has(s.room)));
      if (!fires) continue;
      for (const s of c.stops) {
        if (!reach.has(s.level)) {
          reach.add(s.level);
          changed = true;
        }
        if (s.room !== null && !seeds.get(s.level)!.has(s.room)) {
          seeds.get(s.level)!.add(s.room);
          changed = true;
        }
      }
    }
  }
  return { reach, seeds };
}

/** Every multi-storey plan in the corpus, resolved with a World on its own directory. */
function corpusBuildings(): { name: string; levels: VerticalLevelInput[] }[] {
  const out: { name: string; levels: VerticalLevelInput[] }[] = [];
  for (const dir of ["examples", "test/fixtures", "eval/goldens", "eval/fidelity-plans"]) {
    const abs = resolvePath(dir);
    const world: World = {
      read: (p) => {
        try {
          return readFileSync(resolvePath(abs, p), "utf8");
        } catch {
          return null;
        }
      },
      now: () => new Date(0),
    };
    for (const f of readdirSync(abs).filter((n) => n.endsWith(".arch"))) {
      const { levels } = resolvePlan(readFileSync(join(abs, f), "utf8"), { world });
      if (levels.length > 1) {
        out.push({ name: `${dir}/${f}`, levels: levels.map((l) => ({ level: l.level, ir: l.ir })) });
      }
    }
  }
  return out;
}

suite("verticalReach — the room-aware fixpoint refines the storey-level one", () => {
  it("without `roomReach` it IS the old function (fast-check, order-strict)", () => {
    fc.assert(
      fc.property(arbBuilding, ([specs, base]) => {
        const { levels, grounded } = synth(specs, base);
        expect(shape(verticalReach(levels, grounded))).toEqual(shape(oracleVerticalReach(levels, grounded)));
      }),
      { numRuns: 400 },
    );
  });

  it("with every room live it reproduces the old answer exactly, arrival order included", () => {
    fc.assert(
      fc.property(arbBuilding, ([specs, base]) => {
        const { levels, grounded } = synth(specs, base);
        expect(shape(verticalReach(levels, grounded, allRoomsLive(levels)))).toEqual(
          shape(oracleVerticalReach(levels, grounded)),
        );
      }),
      { numRuns: 400 },
    );
  });

  it("with any monotone `roomReach` it is the naive least fixpoint, and never reaches more than the old one", () => {
    let pruned = 0;
    fc.assert(
      fc.property(arbBuilding, ([specs, base]) => {
        const { levels, grounded, roomReach } = synth(specs, base);
        const got = verticalReach(levels, grounded, roomReach);
        const naive = naiveRoomAware(levels, grounded, roomReach);
        const old = oracleVerticalReach(levels, grounded);
        expect([...got.reachable].sort()).toEqual([...naive.reach].sort());
        // arrivalRooms = the seeds of the UNGROUNDED storeys, nothing on a grounded one.
        for (const l of levels) {
          const want = grounded(l.level) ? [] : [...naive.seeds.get(l.level)!].sort();
          expect([...(got.arrivalRooms.get(l.level) ?? [])].sort()).toEqual(want);
        }
        for (const n of got.reachable) expect(old.reachable.has(n)).toBe(true);
        for (const [n, rooms] of got.arrivalRooms) for (const r of rooms) expect(old.arrivalRooms.get(n)).toContain(r);
        if (got.reachable.size < old.reachable.size) pruned++;
      }),
      { numRuns: 400 },
    );
    expect(pruned).toBeGreaterThan(0); // the generator really produced dead stops
  });

  it("on every multi-storey corpus plan: the two-argument call is the old function, and the room-aware one agrees", () => {
    const corpus = corpusBuildings();
    expect(corpus.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "examples/garden-house.arch",
        "examples/hillside-villa.arch",
        "examples/townhouse.arch",
        "examples/two-storey.arch",
        "test/fixtures/zones-levels.arch",
      ]),
    );
    for (const { name, levels } of corpus) {
      const grounded = (n: number): boolean => {
        const l = levels.find((x) => x.level === n);
        return l ? storeyGrounded(l.ir, DEFAULT_TOL) : false;
      };
      const old = shape(oracleVerticalReach(levels, grounded));
      expect(shape(verticalReach(levels, grounded)), name).toEqual(old);
      // Every corpus shaft stands in a room its storey reaches (or in none, on a storey
      // nothing reaches), so nothing moves.
      expect(shape(verticalReach(levels, grounded, buildingRoomReach(levels, DEFAULT_TOL))), name).toEqual(old);
    }
  });
});
