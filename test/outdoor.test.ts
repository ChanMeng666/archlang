/**
 * The `outdoor` ground-surface layer (v1.31).
 *
 * What this suite is for, in one line each:
 *
 *  - Every kind parses, resolves and DRAWS — including the `<pattern>` it references,
 *    which is the trap that made the first working draft render every surface invisibly.
 *  - Every measurement comes from the SHAPE: exact shoelace area, a label point inside
 *    the ring, containment by `pointInPolygon`. Never the bounding box (the defect class
 *    v1.25.0 closed six instances of).
 *  - The separation from `room` is asserted as ABSENCE, not just as presence: a ground
 *    surface must not appear in `rooms[]`, in `totals.floor_area_m2`, in the access
 *    graph or in Plan JSON, and no test that only checks `outdoor[]` would notice if it
 *    did.
 *  - Every refusal the catalog names is reproduced, in both directions.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, planToJson, toDxf } from "../src/index.js";
import { renderAscii } from "../src/backends/ascii.js";
import { OUTDOOR_KINDS } from "../src/ast.js";
import { pointInPolygon } from "../src/geometry/polygon.js";

const plan = (body: string): string => `plan "Ground" {\n  units mm\n${body}\n}\n`;

const BOX = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
const ROOM = `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living`;
const DOOR = `  door id=d1 on w1 at 30% width 900`;

const errorsOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

const codesOf = (src: string): string[] => lint(src).map((d) => d.code ?? "");

// ---------------------------------------------------------------------------
// 1 — every kind draws, and every pattern it references exists
// ---------------------------------------------------------------------------

describe("outdoor — every kind parses, resolves and renders", () => {
  for (const kind of OUTDOOR_KINDS) {
    it(`${kind} draws as a rectangle`, () => {
      const { svg, diagnostics } = compile(plan(`  outdoor id=g ${kind} at (0,0) size 6000x4000`), { noCache: true });
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(svg).toContain("<svg");
      const s = describePlan(plan(`  outdoor id=g ${kind} at (0,0) size 6000x4000`));
      expect(s.outdoor).toHaveLength(1);
      expect(s.outdoor![0]!.kind).toBe(kind);
    });
  }

  it("every kind but `balcony` also takes the polygon spelling", () => {
    for (const kind of OUTDOOR_KINDS.filter((k) => k !== "balcony")) {
      const src = plan(`  outdoor id=g ${kind} polygon (0,0) (6000,0) (6000,4000) (2000,4000)`);
      expect(errorsOf(src), kind).toEqual([]);
    }
  });

  /**
   * THE dangling-`url(#…)` trap, stated as a law rather than as a spot check.
   *
   * A `hatch` primitive carries its pattern REFERENCE in the paint and the pattern
   * itself is emitted from `Scene.hatches` — two lists that are built in different
   * places. The first working draft of this feature had the reference and not the
   * pattern, so every ground surface rendered as a completely invisible shape with a
   * perfectly valid `<pattern>` sitting unused in the `<defs>`. Nothing about the
   * compile said so: no diagnostic, no exception, a plausible-looking SVG.
   *
   * So the assertion is set containment in the direction that matters — every id
   * REFERENCED is DEFINED — over a plan using every kind at once.
   */
  it("every `url(#…)` a ground fill references is defined in the SVG defs", () => {
    const body = OUTDOOR_KINDS.map((k, i) => `  outdoor ${k} at (${i * 7000},0) size 6000x4000`).join("\n");
    const { svg } = compile(plan(BOX + "\n" + body), { noCache: true });
    const defined = new Set([...svg.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]!));
    const referenced = new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!));
    expect(referenced.size).toBeGreaterThan(1);
    for (const id of referenced) expect(defined, `url(#${id}) is referenced but never defined`).toContain(id);
  });

  it("the hatch pattern is SCALE-AWARE — the same drawing at two scales tiles the same on the sheet", () => {
    // The whole point of `c.gap * k * c.scale`. `hatchGap` derives from the sheet
    // millimetre times the denominator, so the pattern's tile in PLAN units must be
    // exactly twice as big at 1:200 as at 1:100 — i.e. the same size on the paper.
    const at = (denom: number): number => {
      const src = `plan "S" {\n  units mm\n  paper A3 landscape\n  scale 1:${denom}\n${BOX}\n${ROOM}\n  outdoor lawn at (-2000,-2000) size 12000x9000\n}\n`;
      const svg = compile(src, { noCache: true }).svg;
      const m = /<pattern id="hatch-grass" patternUnits="userSpaceOnUse" width="([\d.]+)"/.exec(svg);
      return Number(m![1]);
    };
    expect(at(200)).toBeCloseTo(at(100) * 2, 6);
  });

  it("draws on the ground CAD layers, and a balcony on the floor-plate one", () => {
    const src = plan(`  outdoor lawn at (0,0) size 4000x4000\n  outdoor paving at (5000,0) size 4000x4000`);
    const svg = compile(src, { noCache: true }).svg;
    expect(svg).toContain('<g id="L-PLNT"');
    expect(svg).toContain('<g id="L-SITE"');
    const bal = compile(plan(`${BOX}\n  outdoor balcony at (0,5200) size 4000x1600`), { noCache: true }).svg;
    expect(bal).toContain('<g id="A-FLOR-BALC"');
  });

  it("the DXF export carries the same layer names and a real HATCH entity", () => {
    const src = plan(`  outdoor lawn at (0,0) size 4000x4000`);
    const { scene } = compile(src, { noCache: true, scene: true });
    const dxf = toDxf(scene!);
    expect(dxf).toContain("L-PLNT");
    expect(dxf).toContain("HATCH");
    // The DXF pattern NAME comes from the same META table the SVG builder does.
    expect(dxf).toContain("GRASS");
  });

  it("the ASCII backend renders a ground plan without throwing", () => {
    const { scene } = compile(plan(`${BOX}\n${ROOM}\n  outdoor lawn at (-2000,-2000) size 12000x9000`), {
      noCache: true,
      scene: true,
    });
    expect(() => renderAscii(scene!)).not.toThrow();
    expect(renderAscii(scene!).length).toBeGreaterThan(0);
  });

  /**
   * The ASCII backend identifies a room STRUCTURALLY — a polygon on the `floor` pass —
   * and names it with the first weighted `labels` text inside its box. That was exact
   * while rooms were the only thing on that pass, and a ground surface put three polygons
   * there.
   *
   * The damage was not confined to the ground. A lawn drawn round a house is one polygon
   * whose box contains the whole building, so it printed its own name three times AND
   * every room's box contained the lawn's label anchor, so `Living` and `Kitchen` were
   * both overwritten with `Garden`; an unlabelled surface stamped its element id
   * (`gravel_7`) on the drawing; and a fence was reduced to a stray `F` in the middle of
   * the garden, which reads as furniture that is not there.
   *
   * The assertion is therefore about what a ground plan does NOT contain, which is the
   * only form that would have caught it.
   */
  it("the ASCII plan names its ROOMS, and the ground appears in it not at all", () => {
    const src = plan(
      `${BOX}\n  room id=liv at (0,0) size 4000x5000 label "Living" uses living\n` +
        `  room id=kit at (4000,0) size 4000x5000 label "Kitchen" uses kitchen\n` +
        `  outdoor lawn at (-6000,-6000) size 20000x17000 label "Garden"\n` +
        `  outdoor gravel at (-5000,-5000) size 3000x3000\n` +
        `  fence post { (-6000,-6000) (14000,-6000) }`,
    );
    const { scene } = compile(src, { noCache: true, scene: true, annotate: true });
    const txt = renderAscii(scene!);
    expect(txt).toContain("Living");
    expect(txt).toContain("Kitchen");
    // The ground draws walls, openings, room names and labelled furniture — and it is
    // none of those.
    expect(txt).not.toContain("Garden");
    expect(txt).not.toMatch(/gravel/);
    expect(txt).not.toMatch(/\bF\b/);
  });
});

// ---------------------------------------------------------------------------
// 2 — measurement comes from the shape, never from the box
// ---------------------------------------------------------------------------

describe("outdoor — area and the label point come from the SHAPE", () => {
  it("a rectangle's area is w x h in m², 2 dp", () => {
    const s = describePlan(plan(`  outdoor id=g lawn at (0,0) size 6000x4500`));
    expect(s.outdoor![0]!.area_m2).toBe(27);
  });

  it("a ring's area is the EXACT shoelace, not its bounding box", () => {
    // An L: an 8x6 box with a 4x3 bite out of the bottom-right. Box = 48 m², true = 36.
    const src = plan(
      `  outdoor id=g paving polygon (0,0) (8000,0) (8000,3000) (4000,3000) (4000,6000) (0,6000)`,
    );
    const o = describePlan(src).outdoor![0]!;
    expect(o.area_m2).toBe(36);
    // …and the bbox is reported, correctly, as the box — so a consumer can tell the two
    // apart. A test that only checked the area would pass if `bbox` were the area's source.
    expect(o.bbox).toEqual({ x: 0, y: 0, w: 8000, h: 6000 });
  });

  it("a CONCAVE ring's drawn label sits INSIDE its own surface", () => {
    // A U whose centroid falls in the notch — the shape that catches a centroid-based
    // label point. The drawn text must land on the surface it names.
    const ring: Array<[number, number]> = [
      [0, 0],
      [9000, 0],
      [9000, 9000],
      [6000, 9000],
      [6000, 3000],
      [3000, 3000],
      [3000, 9000],
      [0, 9000],
    ];
    const src = plan(`  outdoor id=g deck polygon ${ring.map(([x, y]) => `(${x},${y})`).join(" ")} label "Terrace"`);
    const svg = compile(src, { noCache: true }).svg;
    const m = /<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>Terrace<\/text>/.exec(svg);
    expect(m, "the label was not drawn").not.toBeNull();
    const pts = ring.map(([x, y]) => ({ x, y }));
    expect(pointInPolygon(Number(m![1]), Number(m![2]), pts)).toBe(true);
  });

  it("an unlabelled surface draws neither a name nor an area", () => {
    const withLabel = compile(plan(`  outdoor lawn at (0,0) size 6000x4000 label "G"`), { noCache: true }).svg;
    const without = compile(plan(`  outdoor lawn at (0,0) size 6000x4000`), { noCache: true }).svg;
    expect(withLabel).toContain("24.0 m²");
    expect(without).not.toContain("m²");
  });
});

// ---------------------------------------------------------------------------
// 3 — the balcony railing
// ---------------------------------------------------------------------------

describe("outdoor balcony — the railing is derived from the walls", () => {
  /** A balcony hung off the bottom facade of the standard 8x5 box. */
  const against = (): string => plan(`${BOX}\n${ROOM}\n  outdoor id=b balcony at (2000,5000) size 3000x1500`);

  it("a balcony against a wall rails its three FREE edges", () => {
    const rail = describePlan(against()).outdoor![0]!.rail;
    expect(rail).toEqual(["bottom", "left", "right"]);
  });

  it("a free-standing balcony rails all four", () => {
    const src = plan(`${BOX}\n${ROOM}\n  outdoor id=b balcony at (20000,20000) size 3000x1500`);
    expect(describePlan(src).outdoor![0]!.rail).toEqual(["top", "bottom", "left", "right"]);
  });

  it("with no walls at all, every edge is free", () => {
    const src = plan(`  outdoor id=b balcony at (0,0) size 3000x1500`);
    expect(describePlan(src).outdoor![0]!.rail).toEqual(["top", "bottom", "left", "right"]);
  });

  it("`rail <edges>` overrides the derivation outright", () => {
    const src = against().replace("size 3000x1500", "size 3000x1500 rail top");
    expect(describePlan(src).outdoor![0]!.rail).toEqual(["top"]);
  });

  it("`rail all` and `rail none` are the two whole-rectangle answers", () => {
    const all = against().replace("size 3000x1500", "size 3000x1500 rail all");
    const none = against().replace("size 3000x1500", "size 3000x1500 rail none");
    expect(describePlan(all).outdoor![0]!.rail).toEqual(["top", "bottom", "left", "right"]);
    // An empty list is a REAL answer, distinct from the key being absent — which is why
    // `rail: []` must survive into the summary rather than being spread away.
    expect(describePlan(none).outdoor![0]!.rail).toEqual([]);
    expect(describePlan(none).outdoor![0]!).toHaveProperty("rail");
  });

  it("edge words are canonicalised, so order in the source cannot change the drawing", () => {
    const a = against().replace("size 3000x1500", "size 3000x1500 rail right top");
    const b = against().replace("size 3000x1500", "size 3000x1500 rail top right");
    expect(describePlan(a).outdoor![0]!.rail).toEqual(describePlan(b).outdoor![0]!.rail);
    expect(compile(a, { noCache: true }).svg).toBe(compile(b, { noCache: true }).svg);
  });

  it("no other kind reports a `rail` key at all", () => {
    // Absence, not emptiness: "railings do not apply to a deck" is a different fact from
    // "this deck has no railing".
    const s = describePlan(plan(`  outdoor id=g deck at (0,0) size 4000x3000`));
    expect(s.outdoor![0]!).not.toHaveProperty("rail");
  });

  it("a railed balcony draws more nodes than an unrailed one", () => {
    const railed = compile(against().replace("size 3000x1500", "size 3000x1500 rail all"), { noCache: true }).svg;
    const bare = compile(against().replace("size 3000x1500", "size 3000x1500 rail none"), { noCache: true }).svg;
    expect(railed.length).toBeGreaterThan(bare.length);
  });
});

// ---------------------------------------------------------------------------
// 4 — a ground surface is NOT a room, asserted as absence
// ---------------------------------------------------------------------------

describe("outdoor — the separation from `room` is total", () => {
  const bare = plan(`${BOX}\n${ROOM}\n${DOOR}`);
  const withGround = plan(
    `${BOX}\n${ROOM}\n${DOOR}\n  outdoor lawn at (-6000,-6000) size 22000x18000 label "Garden"\n  outdoor balcony at (2000,5000) size 3000x1500`,
  );

  it("adds nothing to `rooms[]`, `totals.rooms` or `totals.floor_area_m2`", () => {
    const a = describePlan(bare);
    const b = describePlan(withGround);
    expect(b.rooms).toEqual(a.rooms);
    expect(b.totals.rooms).toBe(a.totals.rooms);
    expect(b.totals.floor_area_m2).toBe(a.totals.floor_area_m2);
  });

  it("totals its own area in its own key, present only when ground exists", () => {
    expect(describePlan(bare).totals).not.toHaveProperty("outdoor_area_m2");
    // 22 x 18 = 396, plus the 4.5 m² balcony.
    expect(describePlan(withGround).totals.outdoor_area_m2).toBe(400.5);
  });

  it("adds nothing to the access graph, the input graph or circulation", () => {
    const a = describePlan(bare);
    const b = describePlan(withGround);
    expect(b.access).toEqual(a.access);
    expect(b.input_graph).toEqual(a.input_graph);
    expect(JSON.stringify(b.circulation)).toBe(JSON.stringify(a.circulation));
  });

  it("does not enter the drawn `schedule rooms` table", () => {
    const sched = (src: string) => describePlan(src.replace("units mm", "units mm\n  schedule rooms")).schedule;
    expect(sched(withGround)).toEqual(sched(bare));
  });

  it("does not change ONE BYTE of `planToJson`", () => {
    // The strongest available form of "the schemas are unchanged": a projection that had
    // learned about `outdoor` would differ here, and `schemas/plan.schema.json` is
    // generated from the same `PLAN_JSON_SCHEMA` the projection is written against.
    const a = planToJson(bare);
    const b = planToJson(withGround);
    expect(a.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(b.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(JSON.stringify(b.json)).toBe(JSON.stringify(a.json));
  });

  it("the `outdoor` key itself is absent from a plan that declares none", () => {
    expect(describePlan(bare)).not.toHaveProperty("outdoor");
    expect(describePlan(withGround).outdoor).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5 — the legend
// ---------------------------------------------------------------------------

describe("outdoor — the legend gains a row per ground material used", () => {
  const legendRows = (src: string): string[] => {
    const svg = compile(src, { noCache: true }).svg;
    const band = svg.slice(svg.indexOf("LEGEND"));
    return [...band.matchAll(/>([a-z_]+)<\/text>/g)].map((m) => m[1]!);
  };

  it("one row per DISTINCT material, and `patio` shares `paving`'s", () => {
    const src = `plan "L" {\n  units mm\n  paper A2 landscape\n  scale 1:100\n  legend\n${BOX}\n${ROOM}\n  outdoor lawn at (-4000,-4000) size 4000x4000\n  outdoor paving at (9000,0) size 4000x4000\n  outdoor patio at (9000,5000) size 4000x4000\n}\n`;
    const rows = legendRows(src);
    expect(rows).toContain("grass");
    expect(rows).toContain("paving");
    // `patio` and `paving` ARE one material, so they are one row — the legend names
    // materials, not places.
    expect(rows.filter((r) => r === "paving")).toHaveLength(1);
  });

  it("a plan with no ground has no ground rows", () => {
    const src = `plan "L" {\n  units mm\n  paper A2 landscape\n  scale 1:100\n  legend\n${BOX}\n${ROOM}\n}\n`;
    const rows = legendRows(src);
    expect(rows).toContain("poche");
    expect(rows).not.toContain("grass");
  });
});

// ---------------------------------------------------------------------------
// 6 — the refusals, in both directions
// ---------------------------------------------------------------------------

describe("outdoor — refuses rather than approximating", () => {
  it("E_OUTDOOR_SIZE on a non-positive extent, and not on a positive one", () => {
    expect(errorsOf(plan(`  outdoor lawn at (0,0) size 0x4000`))).toContain("E_OUTDOOR_SIZE");
    expect(errorsOf(plan(`  outdoor lawn at (0,0) size 4000x0`))).toContain("E_OUTDOOR_SIZE");
    expect(errorsOf(plan(`  outdoor lawn at (0,0) size 4000x4000`))).toEqual([]);
  });

  it("E_OUTDOOR_POLY_DEGENERATE on a collinear ring", () => {
    expect(errorsOf(plan(`  outdoor paving polygon (0,0) (2000,0) (4000,0)`))).toContain(
      "E_OUTDOOR_POLY_DEGENERATE",
    );
  });

  it("E_OUTDOOR_POLY_SELF_INTERSECT on a bow-tie", () => {
    expect(errorsOf(plan(`  outdoor deck polygon (0,0) (4000,4000) (4000,0) (0,4000)`))).toContain(
      "E_OUTDOOR_POLY_SELF_INTERSECT",
    );
  });

  it("a polygonal BALCONY is refused, by name, rather than railed wrong", () => {
    // Deferred deliberately: the rail derivation and the frame transform are both written
    // on four named edges, and a ring has none.
    expect(errorsOf(plan(`  outdoor balcony polygon (0,0) (4000,0) (4000,3000) (0,3000)`))).toContain(
      "E_OUTDOOR_POLY_DEGENERATE",
    );
  });

  it("E_OUTDOOR_RAIL on a kind with no railing — refused, never ignored", () => {
    expect(errorsOf(plan(`  outdoor deck at (0,0) size 4000x3000 rail all`))).toContain("E_OUTDOOR_RAIL");
    expect(errorsOf(plan(`  outdoor balcony at (0,0) size 4000x3000 rail all`))).toEqual([]);
  });

  it("an unknown kind is a parse error naming the closed set", () => {
    const d = compile(plan(`  outdoor meadow at (0,0) size 4000x3000`), { noCache: true }).diagnostics;
    expect(d.some((x) => /Unknown outdoor kind "meadow"/.test(x.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7 — the two lint rules, each with a counterexample
// ---------------------------------------------------------------------------

describe("outdoor — W_OUTDOOR_OVERLAPS_ROOM", () => {
  it("fires when a surface is laid over a room's floor", () => {
    expect(codesOf(plan(`${BOX}\n${ROOM}\n  outdoor paving at (1000,1000) size 3000x2000`))).toContain(
      "W_OUTDOOR_OVERLAPS_ROOM",
    );
  });

  it("does NOT fire on a surface that merely abuts the building", () => {
    // A patio flush against the house shares the room's edge exactly, which is the case
    // an area threshold was going to exist to forgive — and the exact predicate already
    // does, because `polygonsOverlap` needs INTERIOR overlap.
    expect(codesOf(plan(`${BOX}\n${ROOM}\n  outdoor paving at (0,5000) size 8000x3000`))).not.toContain(
      "W_OUTDOOR_OVERLAPS_ROOM",
    );
  });

  it("does NOT fire on a surface well clear of the building", () => {
    expect(codesOf(plan(`${BOX}\n${ROOM}\n  outdoor lawn at (12000,0) size 6000x6000`))).not.toContain(
      "W_OUTDOOR_OVERLAPS_ROOM",
    );
  });

  it("is exact on a CONCAVE room — a surface in the notch is not on the floor", () => {
    // The room is a U; the surface sits in the bite, which its BOUNDING BOX contains and
    // its floor does not. A bbox answer here would be a plain lie.
    const u = `  room id=u polygon (0,0) (9000,0) (9000,9000) (6000,9000) (6000,3000) (3000,3000) (3000,9000) (0,9000) label "U"`;
    expect(codesOf(plan(`${u}\n  outdoor paving at (3500,4000) size 2000x4000`))).not.toContain(
      "W_OUTDOOR_OVERLAPS_ROOM",
    );
    // …and it still fires on the same plan when the surface is moved onto a real limb.
    expect(codesOf(plan(`${u}\n  outdoor paving at (500,1000) size 2000x4000`))).toContain(
      "W_OUTDOOR_OVERLAPS_ROOM",
    );
  });

  it("reports a surface over many rooms ONCE", () => {
    const two = `  room id=a at (0,0) size 4000x4000\n  room id=b at (4000,0) size 4000x4000`;
    const hits = codesOf(plan(`${two}\n  outdoor lawn at (0,0) size 8000x4000`)).filter(
      (c) => c === "W_OUTDOOR_OVERLAPS_ROOM",
    );
    expect(hits).toHaveLength(1);
  });
});

describe("outdoor — W_BALCONY_NO_DOOR", () => {
  it("fires on a balcony with no opening within reach", () => {
    expect(codesOf(plan(`${BOX}\n${ROOM}\n  outdoor balcony at (0,9000) size 4000x1600`))).toContain(
      "W_BALCONY_NO_DOOR",
    );
  });

  it("does NOT fire when a door serves it", () => {
    // The door sits at 30% along the ring of the 8x5 box — on the bottom facade — and the
    // balcony hangs off exactly that facade.
    const src = plan(`${BOX}\n${ROOM}\n  door id=d on w1 at 75% width 900\n  outdoor balcony at (0,5000) size 4000x1600`);
    expect(codesOf(src)).not.toContain("W_BALCONY_NO_DOOR");
  });

  it("a WINDOW serves it too — a full-height window is a normal way out", () => {
    const src = plan(
      `${BOX}\n${ROOM}\n  window id=win on w1 at 75% width 1600\n  outdoor balcony at (0,5000) size 4000x1600`,
    );
    expect(codesOf(src)).not.toContain("W_BALCONY_NO_DOOR");
  });

  it("cannot fire on any other kind", () => {
    for (const k of OUTDOOR_KINDS.filter((x) => x !== "balcony")) {
      expect(codesOf(plan(`${BOX}\n${ROOM}\n  outdoor ${k} at (0,9000) size 4000x1600`)), k).not.toContain(
        "W_BALCONY_NO_DOOR",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 8 — `arch fmt` round-trips every clause
// ---------------------------------------------------------------------------

describe("outdoor — `arch fmt` returns the same plan", () => {
  const roundTrips = async (body: string): Promise<void> => {
    const { format } = await import("../src/format.js");
    const src = plan(body);
    const once = format(src);
    // Idempotent (a fmt of a fmt is a fixed point) …
    expect(format(once)).toBe(once);
    // …and semantically identical, which is the claim that matters: the v1.26.1 lesson
    // is that a dropped clause makes `fmt` silently return a DIFFERENT drawing.
    expect(compile(once, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    expect(JSON.stringify(describePlan(once))).toBe(JSON.stringify(describePlan(src)));
  };

  it("the rectangle spelling, with a label", () => roundTrips(`  outdoor id=g lawn at (0,0) size 6000x4000 label "G"`));
  it("the ring spelling", () => roundTrips(`  outdoor paving polygon (0,0) (6000,0) (6000,3000) (2000,3000)`));
  it("an authored rail list", () =>
    roundTrips(`${BOX}\n  outdoor balcony at (0,5200) size 4000x1600 rail top left`));
  it("`rail none` — the clause that must NOT be dropped", () =>
    roundTrips(`${BOX}\n  outdoor balcony at (0,5200) size 4000x1600 rail none`));
  it("a DERIVED rail is not printed as if it were authored", async () => {
    const { format } = await import("../src/format.js");
    // The source wrote no `rail`, so the formatted source must not grow one — printing
    // the derived set would freeze it against later edits to the walls it came from.
    const src = plan(`${BOX}\n  outdoor balcony at (0,5200) size 4000x1600`);
    expect(format(src)).not.toMatch(/\brail\b/);
  });
});
