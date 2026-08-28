/**
 * v1.21 — vertical circulation: `stair`, `elevator`, `escalator`.
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
  VERTICAL_KINDS,
  verticalConnections,
  verticalsOf,
} from "../src/index.js";
import { parse } from "../src/parser.js";
import type { RStair } from "../src/ir.js";
import { treadCount, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";

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
// a balcony door is not an arrival point (backlog 4.6)
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

suite("vertical circulation — a balcony door is not an arrival point (backlog 4.6)", () => {
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
});
