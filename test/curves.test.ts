import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterAll, describe as suite, expect, it } from "vitest";
import {
  applyFixes,
  compile,
  describe,
  format,
  getGeometryBackend,
  lint,
  loadClipperBackend,
  repair,
  setGeometryBackend,
} from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { segmentsOfWall } from "../src/geometry.js";
import {
  ARC_MIN_STEPS,
  ARC_STEP_DEG,
  arcExtremes,
  arcFromChord,
  arcLength,
  arcSteps,
  arcSweepDegrees,
  arcTangentAt,
  arcTessellate,
  distPointToArc,
  minArcRadius,
} from "../src/geometry/arc.js";
import type { RRoom, RWall } from "../src/ir.js";

/**
 * Curved geometry (v1.24) — `arc (x,y) radius R [cw|ccw] [major]` wall edges and
 * `room circle at (cx,cy) radius R` floors.
 *
 * Two laws are pinned harder than anything else here.
 *
 * 1. **A plan with no curve is byte-identical.** Every arc code path is reached only
 *    through an `arcs` array that a straight polyline never has, so the whole existing
 *    corpus must compile to exactly the bytes it did before.
 * 2. **A curve compiles identically with and without the optional geometry backend.**
 *    This is THE determinism risk of the feature: `clipper2-wasm` is an optional
 *    dependency, so if a curve ever reached the polygon boolean an arc plan's output
 *    would depend on whether an optional package happened to be installed. The lowering
 *    deliberately routes every arc-bearing wall through the wall element instead — the
 *    test below is what holds that decision in place.
 */

const CURVE = `plan "Curve" {
  units mm
  grid 100
  wall id=w exterior thickness 300 {
    (0,0)
    (12000,0)
    arc (24000,12000) radius 12000
    (24000,24000)
  }
  room id=r circle at (12000,12000) radius 6000 label "Rotunda"
}`;

const AQUARIUM = readFileSync("examples/aquarium.arch", "utf8");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}
function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const wallsOf = (src: string): RWall[] => resolve(parse(src).plan!).ir.walls;
const roomsOf = (src: string): RRoom[] =>
  resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

// ---------------------------------------------------------------------------
// The arc solve: closed form, both turn directions, both branches of `major`
// ---------------------------------------------------------------------------

suite("arcFromChord — the closed-form centre solve", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 12000, y: 0 };

  it("puts the centre LEFT of travel for ccw and RIGHT for cw (screen space, y down)", () => {
    // Travelling +x, `normal` = (0,1) = down = the right of travel. Clockwise keeps the
    // centre on the right, so cw is below the chord and ccw above it.
    expect(arcFromChord(a, b, 6000, "ccw", false)!.center).toEqual({ x: 6000, y: 0 });
    expect(arcFromChord(a, b, 10000, "ccw", false)!.center.y).toBeCloseTo(-8000, 9);
    expect(arcFromChord(a, b, 10000, "cw", false)!.center.y).toBeCloseTo(8000, 9);
  });

  it("keeps both endpoints exactly on the circle", () => {
    const arc = arcFromChord(a, b, 10000, "cw", false)!;
    for (const p of [arc.a, arc.b]) {
      expect(Math.hypot(p.x - arc.center.x, p.y - arc.center.y)).toBeCloseTo(10000, 6);
    }
  });

  it("signs the sweep by the drawn turn direction: + clockwise, − counter-clockwise", () => {
    expect(arcFromChord(a, b, 10000, "cw", false)!.sweep).toBeGreaterThan(0);
    expect(arcFromChord(a, b, 10000, "ccw", false)!.sweep).toBeLessThan(0);
  });

  it("`major` takes the long way round — and therefore the OTHER candidate centre", () => {
    const minor = arcFromChord(a, b, 10000, "cw", false)!;
    const major = arcFromChord(a, b, 10000, "cw", true)!;
    expect(arcSweepDegrees(minor)).toBeLessThan(180);
    expect(arcSweepDegrees(major)).toBeGreaterThan(180);
    expect(arcSweepDegrees(minor) + arcSweepDegrees(major)).toBeCloseTo(360, 9);
    // Same rotational sense, mirrored centre.
    expect(Math.sign(major.sweep)).toBe(Math.sign(minor.sweep));
    expect(major.center.y).toBeCloseTo(-minor.center.y, 9);
  });

  it("a chord of exactly 2R is the semicircle: centre at the midpoint, sweep π", () => {
    const arc = arcFromChord(a, b, 6000, "ccw", false)!;
    expect(arcSweepDegrees(arc)).toBeCloseTo(180, 9);
    expect(arcLength(arc)).toBeCloseTo(Math.PI * 6000, 6);
  });

  it("declines (returns null, never throws) below the minimum radius or on a degenerate chord", () => {
    expect(minArcRadius(a, b)).toBe(6000);
    expect(arcFromChord(a, b, 5999.9, "ccw", false)).toBeNull();
    expect(arcFromChord(a, a, 5000, "ccw", false)).toBeNull();
    expect(arcFromChord(a, b, 0, "ccw", false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The one tessellator
// ---------------------------------------------------------------------------

suite("the tessellator — one fixed angular step, integer vertex count", () => {
  it("uses a 7.5° step with a floor of 8 chords (48 to the full circle)", () => {
    expect(ARC_STEP_DEG).toBe(7.5);
    expect(ARC_MIN_STEPS).toBe(8);
    const semi = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 0 }, 6000, "ccw", false)!;
    expect(arcSweepDegrees(semi)).toBeCloseTo(180, 9);
    // 180/7.5 = 24 exactly — and it must NOT tip to 25 on the binary residue.
    expect(arcSteps(semi)).toBe(24);
    expect(arcTessellate(semi)).toHaveLength(25);
    const major = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 0 }, 6000, "ccw", true)!;
    expect(arcSteps(major)).toBe(24);
  });

  it("floors at 8 chords for a shallow arc", () => {
    const shallow = arcFromChord({ x: 0, y: 0 }, { x: 1000, y: 0 }, 100000, "ccw", false)!;
    expect(arcSweepDegrees(shallow)).toBeLessThan(7.5);
    expect(arcSteps(shallow)).toBe(8);
  });

  it("pins the authored endpoints VERBATIM as the first and last vertices", () => {
    const arc = arcFromChord({ x: 1000, y: 2000 }, { x: 9000, y: 6000 }, 7000, "cw", false)!;
    const pts = arcTessellate(arc);
    expect(pts[0]).toEqual({ x: 1000, y: 2000 });
    expect(pts[pts.length - 1]).toEqual({ x: 9000, y: 6000 });
  });

  it("is bit-for-bit repeatable", () => {
    const arc = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 5000 }, 9000, "cw", false)!;
    expect(JSON.stringify(arcTessellate(arc))).toBe(JSON.stringify(arcTessellate(arc)));
  });

  it("puts every interior vertex on the circle (the tessellation is inscribed, not drifting)", () => {
    const arc = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 5000 }, 9000, "cw", false)!;
    for (const p of arcTessellate(arc)) {
      expect(Math.hypot(p.x - arc.center.x, p.y - arc.center.y)).toBeCloseTo(arc.r, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Closed-form extremes, distance, tangent
// ---------------------------------------------------------------------------

suite("closed-form arc queries (never sampled from the tessellation)", () => {
  it("reports the axis extremes inside the sweep and nothing outside it", () => {
    // The bottom semicircle of a circle centred (6000,0), r 6000: its only axis extreme
    // inside the sweep is the south point (6000,6000).
    const bottom = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 0 }, 6000, "ccw", false)!;
    const ext = arcExtremes(bottom);
    expect(ext).toContainEqual({ x: 6000, y: 6000 });
    expect(ext).not.toContainEqual({ x: 6000, y: -6000 });
    // …and the FULL circle (as two semicircles) reaches all four.
    const top = arcFromChord({ x: 12000, y: 0 }, { x: 0, y: 0 }, 6000, "ccw", false)!;
    expect(arcExtremes(top)).toContainEqual({ x: 6000, y: -6000 });
  });

  it("measures distance to the CURVE where the radial hits it, and to an endpoint otherwise", () => {
    const bottom = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 0 }, 6000, "ccw", false)!;
    // Straight below the centre, 1000 outside the arc.
    expect(distPointToArc({ x: 6000, y: 7000 }, bottom)).toBeCloseTo(1000, 9);
    // Straight ABOVE the centre — outside the sweep, so the nearer endpoint decides.
    expect(distPointToArc({ x: 6000, y: -1000 }, bottom)).toBeCloseTo(Math.hypot(6000, 1000), 9);
  });

  it("gives a tangent that points along the direction of travel", () => {
    const bottom = arcFromChord({ x: 0, y: 0 }, { x: 12000, y: 0 }, 6000, "ccw", false)!;
    // At the start (west of the centre), travelling ccw as drawn means heading DOWN.
    const t = arcTangentAt(bottom, bottom.a);
    expect(t.x).toBeCloseTo(0, 9);
    expect(t.y).toBeCloseTo(1, 9);
    // The tangent is always perpendicular to the radius.
    const mid = { x: 6000, y: 6000 };
    const tm = arcTangentAt(bottom, mid);
    expect(tm.x * (mid.x - bottom.center.x) + tm.y * (mid.y - bottom.center.y)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// Syntax → IR
// ---------------------------------------------------------------------------

suite("`arc` in a wall polyline", () => {
  it("solves into a segment-indexed arc, leaving the chord endpoints as a/b", () => {
    const [w] = wallsOf(CURVE);
    const segs = segmentsOfWall(w!);
    expect(segs).toHaveLength(3);
    expect(segs[0]!.arc).toBeUndefined();
    expect(segs[2]!.arc).toBeUndefined();
    const arc = segs[1]!.arc!;
    expect(arc.r).toBe(12000);
    // Closed-form, so the centre lands on the intended round coordinates to within a
    // float residue ~1e-13 mm — nine orders below the 0.005 mm `fmt()` quantum every
    // emitted number passes through, which is why output is still byte-stable.
    expect(arc.center.x).toBeCloseTo(24000, 9);
    expect(arc.center.y).toBeCloseTo(0, 9);
    expect(segs[1]!.a).toEqual({ x: 12000, y: 0 });
    expect(segs[1]!.b).toEqual({ x: 24000, y: 12000 });
  });

  it("marks EVERY segment of an arc-bearing wall, straight ones included", () => {
    // This is what stops a doorway on the straight run of a curved wall from believing
    // the boolean voided it (the wall never went through the boolean at all).
    for (const s of segmentsOfWall(wallsOf(CURVE)[0]!)) expect(s.arcWall).toBe(true);
    const straight = wallsOf('plan "S" { wall a thickness 200 { (0,0) (1000,0) } }');
    for (const s of segmentsOfWall(straight[0]!)) expect(s.arcWall).toBeUndefined();
  });

  it("rejects a radius under half the chord with E_ARC_RADIUS + a machine-applicable fix", () => {
    const src = 'plan "P" { wall id=w exterior thickness 200 { (0,0) arc (10000,0) radius 3000 } }';
    const r = compile(src);
    const d = r.diagnostics.find((x) => x.code === "E_ARC_RADIUS")!;
    expect(d).toBeDefined();
    expect(d.severity).toBe("error");
    expect(d.message).toContain("5000");
    expect(d.fixes![0]!.applicability).toBe("machine-applicable");
    // …and the fix actually compiles clean.
    const fixed = applyFixes(src, d.fixes!).output;
    expect(fixed).toContain("radius 5000");
    expect(compile(fixed).diagnostics.filter((x) => x.code === "E_ARC_RADIUS")).toEqual([]);
  });

  it("keeps drawing the rest of the plan when one arc is impossible (the edge goes straight)", () => {
    const src = 'plan "P" { wall id=w exterior thickness 200 { (0,0) arc (10000,0) radius 10 (10000,5000) } }';
    const [w] = wallsOf(src);
    expect(w!.arcs).toBeUndefined();
    expect(segmentsOfWall(w!)).toHaveLength(2);
  });

  it("refuses an `arc` as a wall's FIRST vertex (nothing to curve away from)", () => {
    const r = compile('plan "P" { wall id=w exterior thickness 200 { arc (1000,0) radius 5000 (2000,0) } }');
    expect(r.errors.some((e) => /preceding point/.test(e.message))).toBe(true);
  });
});

suite("`room circle`", () => {
  it("carries the exact circle, a tessellated ring, and the bounding box", () => {
    const [r] = roomsOf(CURVE);
    expect(r!.circle).toEqual({ c: { x: 12000, y: 12000 }, r: 6000 });
    expect(r!.at).toEqual({ x: 6000, y: 6000 });
    expect(r!.size).toEqual({ w: 12000, h: 12000 });
    // The ring is the 48-gon, stored WITHOUT a repeated closing vertex.
    expect(r!.poly).toHaveLength(48);
  });

  it("measures the area in CLOSED FORM (πR²), not from the 48-gon", () => {
    const d = describe(CURVE);
    const room = d.rooms.find((x) => x.id === "r")!;
    expect(room.area_m2).toBeCloseTo((Math.PI * 6000 * 6000) / 1_000_000, 2);
    // A 48-gon is ~0.14% short — the exact value must NOT be the inscribed one.
    const inscribed = (48 / 2) * 6000 * 6000 * Math.sin((2 * Math.PI) / 48);
    expect(room.area_m2 * 1_000_000).toBeGreaterThan(inscribed);
  });

  it("reports floor_circle instead of a 48-vertex floor_polygon", () => {
    const room = describe(CURVE).rooms.find((x) => x.id === "r")!;
    expect(room.floor_circle).toEqual({ cx: 12000, cy: 12000, r: 6000 });
    expect(room.floor_polygon).toEqual([]);
  });

  it("errors on a non-positive radius", () => {
    expect(compile('plan "P" { room id=r circle at (0,0) radius 0 }').diagnostics.map((d) => d.code)).toContain(
      "E_ROOM_RADIUS",
    );
  });

  it("draws the floor as a TRUE circle primitive, never a polygon", () => {
    expect(compile(CURVE).svg).toContain('<circle cx="12000" cy="12000" r="6000"');
  });
});

// ---------------------------------------------------------------------------
// Run-length parametrization
// ---------------------------------------------------------------------------

suite("`on <wall> at <pos>` walks RUN length, so a curve is not measured by its chord", () => {
  const src = `plan "P" {
  units mm
  wall id=w exterior thickness 200 {
    (0,0)
    (6000,0)
    arc (18000,0) radius 6000
    (24000,0)
  }
  door id=d on w at 50% width 900
}`;

  it("lands an opening at 50% in the middle of the arc, not on its chord midpoint", () => {
    // Runs: 6000 straight + π·6000 (18850) arc + 6000 straight = 30850. Half is 15425,
    // i.e. 9425 into the arc — exactly its midpoint. A chord-length walk would have made
    // the total 24000 and put 50% at x=12000, ON the chord.
    const ir = resolve(parse(src).plan!).ir;
    const door = ir.elements.find((e) => e.id === "d") as { at: { x: number; y: number }; host: unknown };
    expect(door.at.x).toBeCloseTo(12000, 0);
    // The arc bulges to y=6000 at its midpoint (default ccw from (6000,0) to (18000,0)).
    expect(door.at.y).toBeCloseTo(6000, 0);
  });

  it("attributes the opening to the ARC segment", () => {
    const ir = resolve(parse(src).plan!).ir;
    const door = ir.elements.find((e) => e.id === "d") as { host: { arc?: unknown } | null };
    expect(door.host?.arc).toBeDefined();
  });

  it("hosts an absolutely-placed opening on a curve by ARC distance", () => {
    // (12000,6000) is on the arc but ~6000 from either straight run's nearest point.
    const near = `plan "P" {
  wall id=w exterior thickness 200 { (0,0) (6000,0) arc (18000,0) radius 6000 (24000,0) }
  door id=d at (12000,6000) width 900
}`;
    const ir = resolve(parse(near).plan!).ir;
    const door = ir.elements.find((e) => e.id === "d") as { host: { arc?: unknown; index: number } | null };
    expect(door.host?.arc).toBeDefined();
    expect(door.host?.index).toBe(1);
    expect(lint(near).some((d) => d.code === "W_DOOR_OFF_WALL")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The swing tangent
// ---------------------------------------------------------------------------

suite("a door on a curve swings off the TANGENT at its own position", () => {
  const src = `plan "P" {
  wall id=w exterior thickness 200 { (0,0) arc (12000,0) radius 6000 }
  door id=d on w at 50% width 1000
}`;

  it("takes the leaf direction from the tangent, not from the chord", () => {
    const scene = compile(src).scene!;
    const leaf = scene.nodes.find((n) => n.layer === "doors" && n.prim.t === "line")!;
    const p = leaf.prim as { a: { x: number; y: number }; b: { x: number; y: number } };
    // The door sits at the arc's south point (6000,6000); the tangent there is horizontal,
    // so the hinge-to-leaf-tip line (perpendicular to the tangent) must be VERTICAL. On the
    // chord — which is also horizontal here — the two would coincide, so the test uses the
    // hinge position instead: it must be offset ALONG the curve, hence off the chord line.
    expect(Math.abs(p.a.x - p.b.x)).toBeCloseTo(0, 6);
    expect(p.a.y).toBeCloseTo(6000, 0);
  });

  it("emits the swing as a real arc primitive", () => {
    const scene = compile(src).scene!;
    expect(scene.nodes.filter((n) => n.layer === "doors" && n.prim.t === "arc")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Rendering: true arcs, and a tessellated fill
// ---------------------------------------------------------------------------

suite("rendering — visible faces are TRUE arcs, fills are tessellated", () => {
  it("emits two concentric arc faces at r ± t/2", () => {
    const svg = compile(CURVE).svg;
    expect(svg).toContain("A 12150 12150");
    expect(svg).toContain("A 11850 11850");
  });

  it("splits a long curve into unambiguously-minor pieces the arc primitive can carry", () => {
    // A full circle written as two semicircles: each 180° half becomes two ≤120° pieces,
    // so the SVG's hardcoded large-arc flag of 0 and the DXF's minorArcDegrees stay valid.
    const full = `plan "P" { wall id=w exterior thickness 200 {
      (12000,0) arc (0,0) radius 6000 arc (12000,0) radius 6000 } }`;
    const scene = compile(full).scene!;
    const faces = scene.nodes.filter((n) => n.layer === "wallFace" && n.prim.t === "arc");
    // 2 semicircles × 2 faces × 2 pieces.
    expect(faces).toHaveLength(8);
  });

  it("emits native ARC/CIRCLE entities in DXF", async () => {
    const { toDxf } = await import("../src/export/dxf.js");
    const dxf = toDxf(compile(CURVE).scene!);
    expect(dxf).toMatch(/\nARC\n/);
    expect(dxf).toMatch(/\nCIRCLE\n/);
  });

  it("rasterizes a curve in the ASCII plan without crashing", () => {
    const txt = run(["compile", "examples/aquarium.arch", "-f", "txt", "-o", "-"]);
    expect(txt.status).toBe(0);
    expect(txt.stdout.split("\n").length).toBeGreaterThan(10);
    // The circular room's label still lands (its floor is a `circle`, not a polygon).
    expect(txt.stdout).toContain("Ocean");
  });
});

// ---------------------------------------------------------------------------
// Dimensioning
// ---------------------------------------------------------------------------

suite("dimensioning a curve", () => {
  const AUTO = `plan "P" {
  units mm
  dims auto all
  wall id=w exterior thickness 200 { (0,0) (6000,0) arc (18000,0) radius 6000 (24000,0) (24000,12000) (0,12000) close }
  room id=r circle at (12000,6000) radius 3000 label "Round"
}`;

  it("synthesizes an R leader per distinct arc and a φ call-out per circular room", () => {
    const svg = compile(AUTO).svg;
    expect(svg).toContain(">R6000<");
    expect(svg).toContain(">φ6000<");
  });

  it("emits ONE R call-out for a circle written as two arcs of the same radius", () => {
    const full = `plan "P" { dims auto all wall id=w exterior thickness 200 {
      (12000,0) arc (0,0) radius 6000 arc (12000,0) radius 6000 } }`;
    const svg = compile(full).svg;
    expect(svg.match(/>R6000</g)).toHaveLength(1);
  });

  it("never puts a linear chain tick on a curved facade", () => {
    // The arc runs along the bottom of the plan; a chain there would need a tick at the
    // arc's own coordinates. `probeSide` skips curves, so the bottom facade falls back to
    // the measured extent and no chain is anchored on the curve's centreline.
    const scene = compile(AUTO).scene!;
    const dimTexts = scene.nodes
      .filter((n) => n.layer === "dims" && n.prim.t === "text")
      .map((n) => (n.prim as { value: string }).value);
    // The only non-linear entries are the two curve call-outs.
    expect(dimTexts.filter((t) => t.startsWith("R") || t.startsWith("φ"))).toEqual(["R6000", "φ6000"]);
  });

  it("`dim radius <wall>` / `dim diameter <room>` derive their geometry and text", () => {
    const manual = `plan "P" {
  wall id=w exterior thickness 200 { (0,0) arc (12000,0) radius 6000 }
  room id=r circle at (30000,0) radius 4000
  dim radius w offset 0
  dim diameter r offset 0
}`;
    const svg = compile(manual).svg;
    expect(svg).toContain(">R6000<");
    expect(svg).toContain(">φ8000<");
  });

  it("declines a curve call-out it cannot resolve, with E_DIM_CURVE_REF", () => {
    const cases: Array<[string, string]> = [
      ["dim radius nope offset 0", "names no wall"],
      ["dim diameter r2 offset 0", "names no room"],
      ["dim radius straight offset 0", "no `arc` edge"],
      ["dim diameter rect offset 0", "not circular"],
      ["dim radius two offset 0", "arc edges"],
    ];
    for (const [stmt, why] of cases) {
      const src = `plan "P" {
  wall id=straight exterior thickness 200 { (0,0) (1000,0) }
  wall id=two exterior thickness 200 { (5000,0) arc (9000,0) radius 3000 arc (5000,0) radius 3000 }
  room id=rect at (0,5000) size 1000x1000
  ${stmt}
}`;
      const d = compile(src).diagnostics.find((x) => x.code === "E_DIM_CURVE_REF");
      expect(d, why).toBeDefined();
      expect(d!.message).toContain(why);
    }
  });

  it("round-trips through the formatter", () => {
    const src = `plan "P" {
  wall id=w exterior thickness 200 { (0,0) arc (12000,0) radius 6000 cw major (12000,9000) }
  room id=r circle at (30000,0) radius 4000
  dim radius w segment 0 offset 0
}`;
    const once = format(src);
    expect(once).toContain("arc (12000, 0) radius 6000 cw major");
    expect(once).toContain("circle at (30000, 0) radius 4000");
    expect(once).toContain("dim radius w segment 0");
    expect(format(once)).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// Guards — decline crisply, never approximate
// ---------------------------------------------------------------------------

suite("guards on a curve (crisp diagnostics, no silent degradation)", () => {
  it("refuses `furniture … against wall` on an arc segment with E_FURN_AGAINST", () => {
    const src = `plan "P" {
  wall id=w exterior thickness 200 { (0,0) arc (12000,0) radius 6000 }
  furniture bench against wall w side left size 1200x400
}`;
    const d = compile(src).diagnostics.find((x) => x.code === "E_FURN_AGAINST")!;
    expect(d).toBeDefined();
    expect(d.message).toContain("arc");
    expect(d.message).toContain("rotate");
  });

  it("declines an `arc` inside a `room polygon` ring, naming the release it is planned for", () => {
    const r = compile('plan "P" { room id=r polygon (0,0) (1000,0) arc (1000,1000) radius 800 }');
    const msg = r.errors.map((e) => e.message).join("\n");
    expect(msg).toContain("room polygon");
    expect(msg).toContain("v1.25");
    expect(msg).toContain("room circle");
  });

  it("never lets an arc back a fixture edge (a chord can be collinear with a room side)", () => {
    // The arc's chord runs exactly along the room's north edge, but the wall itself bows
    // 3000 mm away — so the fixture reads as unwalled there, and no rotation is derived.
    const src = `plan "P" {
  units mm
  wall id=bow exterior thickness 200 { (0,0) arc (6000,0) radius 3000 }
  room id=r at (0,0) size 6000x4000
  furniture wc in r anchor top size 400x700
}`;
    expect(lint(src).some((d) => d.code === "W_FIXTURE_BACK_TO_ROOM")).toBe(false);
  });

  it("keeps `repair()`'s postcondition on a curved plan: every flagged piece is accounted for", () => {
    const src = `plan "P" {
  units mm
  wall id=w exterior thickness 300 { (0,0) arc (12000,0) radius 6000 (12000,8000) (0,8000) close }
  room id=r at (0,0) size 12000x8000 label "Hall"
  furniture bed at (-200,3000) size 1500x2000
}`;
    const out = repair(src);
    const flagged = lint(src).filter((d) => d.code === "W_FURNITURE_WALL_COLLISION").length;
    if (flagged > 0) expect(out.changes.length + out.unresolved.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// `place` — a frame maps a curve EXACTLY
// ---------------------------------------------------------------------------

suite("a placed component's curve is turned/mirrored exactly", () => {
  const comp = (extra: string) => `plan "P" {
  units mm
  component bay() {
    wall id=face exterior thickness 200 { (0,0) arc (6000,0) radius 3000 }
    room id=rot circle at (3000,1500) radius 1400 label "Bay"
  }
  place bay() as a at (0,0)
  place bay() as b at (20000,0) ${extra}
}`;

  it("preserves the radius and the area under a quarter turn", () => {
    const ir = resolve(parse(comp("rotate 90")).plan!).ir;
    const arcs = ir.walls.flatMap((w) => segmentsOfWall(w)).filter((s) => s.arc);
    expect(arcs).toHaveLength(2);
    expect(arcs.map((s) => s.arc!.r)).toEqual([3000, 3000]);
    const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
    expect(rooms.map((r) => r.circle!.r)).toEqual([1400, 1400]);
    // A turn is an exact integer isometry: the mapped centre lands on exact coordinates.
    expect(rooms[1]!.circle!.c.x % 1).toBe(0);
    expect(rooms[1]!.circle!.c.y % 1).toBe(0);
  });

  it("reverses the rotational sense under a mirror (a mirrored ccw curve reads cw)", () => {
    const ir = resolve(parse(comp("mirror x")).plan!).ir;
    const arcs = ir.walls.flatMap((w) => segmentsOfWall(w)).filter((s) => s.arc);
    expect(Math.sign(arcs[0]!.arc!.sweep)).toBe(-Math.sign(arcs[1]!.arc!.sweep));
    expect(Math.abs(arcs[0]!.arc!.sweep)).toBeCloseTo(Math.abs(arcs[1]!.arc!.sweep), 12);
  });
});

// ---------------------------------------------------------------------------
// Analysis layers see the tessellated ring
// ---------------------------------------------------------------------------

suite("the analysis layer generalises over a circular room", () => {
  it("connects a circular room through the doors on its curve", () => {
    // A door at a point where the circle is TANGENT to a straight room edge belongs to
    // both rooms, so the curve joins the building's door graph like any other wall.
    const doors = describe(AQUARIUM).doors;
    const north = doors.find((x) => x.id === "d_rot_n")!;
    const south = doors.find((x) => x.id === "d_rot_s")!;
    expect(north.between).toEqual(["rotunda_r", "plant"]);
    expect(south.between).toEqual(["rotunda_r", "concourse"]);
  });

  it("reaches the circular room from the entrance", () => {
    // The whole flagship is strict-clean, so nothing is unreachable; assert the specific
    // fact anyway, because reachability through a curve is the point of the geometry.
    expect(lint(AQUARIUM).some((x) => x.code === "W_ROOM_UNREACHABLE")).toBe(false);
  });

  it("PINNED: a circular room reports no `adjacent` rooms, and that is correct", () => {
    // `adjacent` means "shares a boundary RUN", and has always excluded a shared corner.
    // A circle meets a straight wall at a single POINT, and the 48-gon has no edge
    // parallel to an axis anyway (90° is a vertex, not an edge midpoint) — so there is no
    // run to share. Connectivity for a round room comes from its doors, above. Anyone
    // tempted to "fix" this is about to invent adjacency-by-tangency: don't (ADR 0005).
    const rot = describe(AQUARIUM).rooms.find((r) => r.id === "rotunda_r")!;
    expect(rot.adjacent).toEqual([]);
  });

  it("puts a circular room's floor on the occupancy/circulation grid via its ring", () => {
    // `describe().circulation` is produced by the flood-fill over the room rings; the
    // circular room must appear in it (a room the grid could not see would be absent).
    const c = describe(AQUARIUM).circulation;
    expect(JSON.stringify(c)).toContain("rotunda_r");
  });
});

// ---------------------------------------------------------------------------
// LAW 1 — an arc-free plan is byte-identical
// ---------------------------------------------------------------------------

suite("LAW: a plan with no curve is byte-identical", () => {
  const NAMES = [
    "studio.arch",
    "two-bed.arch",
    "relational.arch",
    "attached.arch",
    "accessible.arch",
    "museum.arch",
    "themed.arch",
  ];

  it("compiles every arc-free example deterministically and without an arc primitive", () => {
    for (const name of NAMES) {
      const src = readFileSync(`examples/${name}`, "utf8");
      const a = compile(src);
      expect(a.svg, name).toBe(compile(src).svg);
      // No wall face is an arc anywhere in the arc-free corpus, and no `arcs` array exists.
      const ir = resolve(parse(src).plan!).ir;
      for (const w of ir.walls) expect(w.arcs, name).toBeUndefined();
      for (const s of ir.walls.flatMap((w) => segmentsOfWall(w))) {
        expect(s.arc, name).toBeUndefined();
        expect(s.arcWall, name).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// LAW 2 — a curve is identical with and without the optional geometry backend
// ---------------------------------------------------------------------------

suite("LAW: a curve compiles identically with and without the clipper2 backend", () => {
  afterAll(() => setGeometryBackend(null));

  it("gives byte-identical SVG for every curved fixture in both backend states", async () => {
    const sources = [CURVE, AQUARIUM];
    setGeometryBackend(null);
    expect(getGeometryBackend()).toBeNull();
    const without = sources.map((s) => compile(s).svg);

    setGeometryBackend(await loadClipperBackend());
    expect(getGeometryBackend()).not.toBeNull();
    const with_ = sources.map((s) => compile(s).svg);

    setGeometryBackend(null);
    const withoutAgain = sources.map((s) => compile(s).svg);

    for (let i = 0; i < sources.length; i++) {
      expect(with_[i], `source ${i} — backend must not change a curve`).toBe(without[i]);
      expect(withoutAgain[i], `source ${i} — and must not leave state behind`).toBe(without[i]);
    }
  });

  it("keeps the STRAIGHT walls of a mixed plan on the boolean (the split is per wall)", () => {
    // The aquarium's straight partitions still union into multi-loop `region` nodes; only
    // the two arc-bearing walls take the per-segment path.
    const scene = compile(AQUARIUM).scene!;
    expect(scene.nodes.some((n) => n.layer === "wallFace" && n.prim.t === "region")).toBe(true);
    expect(scene.nodes.some((n) => n.layer === "wallFace" && n.prim.t === "arc")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The flagship
// ---------------------------------------------------------------------------

suite("examples/aquarium.arch — the curved-geometry flagship", () => {
  it("is lint-clean under --strict", () => {
    const r = run(["validate", "examples/aquarium.arch", "--strict", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).diagnostics).toEqual([]);
  });

  it("has a circular room measured exactly and two doors ON the curve", () => {
    const d = describe(AQUARIUM);
    const rot = d.rooms.find((r) => r.id === "rotunda_r")!;
    expect(rot.floor_circle).toEqual({ cx: 30000, cy: 14000, r: 8000 });
    expect(rot.area_m2).toBeCloseTo((Math.PI * 8000 * 8000) / 1_000_000, 1);
    const ir = resolve(parse(AQUARIUM).plan!).ir;
    const onArc = ir.elements.filter(
      (e) => (e.kind === "door" || e.kind === "window") && (e as { host?: { arc?: unknown } }).host?.arc,
    );
    expect(onArc.length).toBeGreaterThanOrEqual(4);
  });

  it("shows the GB/T curve call-outs and keeps the chains on the straight facades", () => {
    const svg = compile(AQUARIUM).svg;
    expect(svg).toContain(">R12000<");
    expect(svg).toContain(">R8000<");
    expect(svg).toContain(">φ16000<");
  });

  it("is idempotent under the formatter", () => {
    expect(format(format(AQUARIUM))).toBe(format(AQUARIUM));
  });
});
