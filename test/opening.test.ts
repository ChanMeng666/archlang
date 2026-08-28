import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, compile } from "../src/index.js";
import { format } from "../src/format.js";
import { aiaLayer } from "../src/scene.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { renderAscii } from "../src/backends/ascii.js";
import { toDxf } from "../src/export/dxf.js";
import { outlineSegments } from "./path-prim.js";

/**
 * Cased `opening` — a leaf-less gap in a wall that still connects two spaces. It
 * voids the wall like a door/window but draws no leaf/swing, and it participates in
 * the access graph so open-plan layouts read as connected (not "disconnected" or
 * "unreachable").
 */

// Living + kitchen, open to each other via an `opening`, entered through one door.
const openPlan = `plan "Open" {
  units mm
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=living  at (0,0)    size 4000x4000 label "Living"  uses living
  room id=kitchen at (4000,0) size 4000x4000 label "Kitchen" uses kitchen
  door    id=d_in at (2000,4000) width 1000 wall exterior  hinge left swing in
  opening id=op   at (4000,2000) width 1800 wall partition
}`;

describe("opening element", () => {
  it("connects two rooms in the access graph with full clear width (no leaf)", () => {
    const { access, openings } = describePlan(openPlan);
    expect(openings).toEqual([{ id: "op", between: ["living", "kitchen"], width: 1800 }]);
    const e = access.edges.find((x) => x.doorId === "op")!;
    expect(e.kind).toBe("opening");
    expect(e.estimatedClearWidth).toBe(1800); // openings keep their full width
    expect(access.rooms.find((r) => r.id === "kitchen")!.reachable).toBe(true);
  });

  it("does not flag a room reached only through an opening as disconnected", () => {
    const codes = lint(openPlan).map((d) => d.code);
    expect(codes).not.toContain("W_ROOM_DISCONNECTED");
    expect(codes).not.toContain("W_ROOM_UNREACHABLE");
    expect(codes).not.toContain("W_NO_ENTRANCE");
  });

  it("counts an opening on an exterior wall as an entrance", () => {
    const src = openPlan.replace(
      "door    id=d_in at (2000,4000) width 1000 wall exterior  hinge left swing in",
      "opening id=o_in at (2000,4000) width 1200 wall exterior",
    );
    expect(lint(src).map((d) => d.code)).not.toContain("W_NO_ENTRANCE");
  });

  it("warns W_ROOM_UNREACHABLE for a room with a connector but no path to the entrance", () => {
    // Right cluster (C–D) is walled off from the entered left room — they connect to
    // each other but not to the exterior.
    const src = `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      wall partition thickness 100 { (4000,2000) (8000,2000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=c at (4000,0) size 4000x2000 label "C"
      room id=d at (4000,2000) size 4000x2000 label "D"
      door id=d_in at (2000,4000) width 1000 wall exterior  hinge left swing in
      door id=d_cd at (6000,2000) width 800  wall partition hinge left swing in
    }`;
    const codes = lint(src)
      .filter((x) => x.code === "W_ROOM_UNREACHABLE")
      .map((d) => d.message);
    expect(codes.some((m) => m.includes('"C"'))).toBe(true);
    expect(codes.some((m) => m.includes('"D"'))).toBe(true);
  });

  it("renders the opening as a wall void with jambs but no leaf/swing arc", () => {
    const { svg } = compile(openPlan, { noCache: true });
    // The opening voids the wall (a polygon filled with the opening colour) but adds
    // no door swing arc of its own. (The single arc present is the entrance door's.)
    const arcs = (svg.match(/<path d="M [^"]*A /g) ?? []).length;
    expect(arcs).toBe(1);
  });

  it("rejects a non-positive width and round-trips through the formatter", () => {
    const { diagnostics } = compile(
      `plan "P" { units mm wall exterior thickness 200 { (0,0) (3000,0) } opening at (1500,0) width 0 }`,
      { noCache: true },
    );
    expect(diagnostics.some((d) => d.code === "E_OPENING_WIDTH")).toBe(true);
    expect(format(openPlan)).toContain("opening id=op at (4000, 2000) width 1800 wall partition");
  });
});

/**
 * The wall boolean in `scene-build.ts` already severs the wall solid at every
 * registered opening (jamb end-caps included, floor continuous through the gap), so
 * an element must NOT then repaint that gap: `theme.opening` is the page background
 * in every theme, and the cover polygon over-reaches a whole `wallStroke` past each
 * wall face — which laid a white band across the floor either side of every cased
 * opening and every interior doorway. The cover survives, unpainted, only because the
 * ASCII/DXF backends locate the passage by that polygon.
 */

/** Living | Kitchen split by ONE orthogonal partition with a single cased opening —
 *  no door, no window, so every door-family primitive in the scene is the opening's. */
const orthoOpening = `plan "Op" {
  units mm
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=living  at (0,0)    size 4000x4000 label "Living"
  room id=kitchen at (4000,0) size 4000x4000 label "Kitchen"
  opening id=op   at (4000,2000) width 1800 wall partition
}`;

/** The same plan with an ANGLED partition. Until v1.30 this dropped the whole wall set
 *  out of the rectilinear boolean and — with no geometry backend registered — nothing
 *  subtracted the opening, so the cover polygon had to stay OPAQUE to fake the hole. The
 *  joinery cuts an angled host like any other, so this is now the same drawing as the
 *  orthogonal one, at 45°. */
const angledOpening = `plan "Angled" {
  units mm
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (2000,4000) (5000,1000) }
  room id=living  at (0,0)    size 4000x4000 label "Living"
  room id=kitchen at (4000,0) size 4000x4000 label "Kitchen"
  opening id=op   at (3500,2500) width 800 wall partition
  door    id=d_in at (2000,4000) width 1000 wall exterior hinge left swing in
}`;

/** A CURVED host: the passage is attributed by ARC LENGTH and its jambs run radially.
 *  Nothing voided a curved wall before v1.30 — an arc-bearing wall was lowered per
 *  segment and subtracted no opening at all, on its curve or on its straight runs. */
const arcOpening = `plan "Arc" {
  units mm
  wall id=w exterior thickness 300 {
    (0,0)
    (12000,0)
    arc (24000,12000) radius 12000
    (24000,24000)
  }
  room id=r circle at (12000,12000) radius 6000 label "Rotunda"
  opening id=op at (15515,8485) width 900 wall w
}`;

const sceneOf = (src: string): Scene => compile(src, { noCache: true }).scene!;
const on = (s: Scene, pass: SceneNode["layer"]): SceneNode[] => s.nodes.filter((n) => n.layer === pass);
const coverOf = (s: Scene, pass: SceneNode["layer"]): SceneNode => on(s, pass).find((n) => n.prim.t === "polygon")!;

describe("cased opening rendering — never repaint the void the wall union opened", () => {
  it("puts its primitives on the `openings` pass, which is CAD layer A-DOOR (not A-GLAZ)", () => {
    expect(aiaLayer("openings")).toBe("A-DOOR");
    const s = sceneOf(orthoOpening);
    // ONE node: the unpainted cover the ASCII/DXF backends locate the passage by. It was
    // three until v1.30 — cover plus two dashed lintel lines, which are gone.
    expect(on(s, "openings")).toHaveLength(1);
    expect(on(s, "windows")).toHaveLength(0); // a leaf-less passage is not glazing
    // The LAYER table declares every AIA layer, so assert on the ENTITIES section:
    // the opening's linework must reference A-DOOR and nothing must sit on A-GLAZ.
    const entities = toDxf(s).slice(toDxf(s).indexOf("\nENTITIES\n"));
    expect(entities).toContain("A-DOOR");
    expect(entities).not.toContain("A-GLAZ"); // this plan has no window at all
  });

  it("emits an UNPAINTED cover, shrunk to the wall faces, on an orthogonal host", () => {
    const s = sceneOf(orthoOpening);
    const cover = coverOf(s, "openings");
    expect(cover.paint.fill).toBe("none"); // never theme.opening — that is the page bg
    expect(cover.paint.fill).not.toBe(s.theme.opening);
    // Half-extent is exactly thickness/2 (4000 ± 50), no wallStroke overhang into the
    // floor; it still spans the full 1800 opening (2000 ± 900) for the ASCII locator.
    const pts = cover.prim.t === "polygon" ? cover.prim.pts : [];
    expect([...new Set(pts.map((p) => p.x))].sort((a, b) => a - b)).toEqual([3950, 4050]);
    expect([...new Set(pts.map((p) => p.y))].sort((a, b) => a - b)).toEqual([1100, 2900]);
  });

  it("draws NO head line — the gap shows the capped jambs and nothing bridging them", () => {
    // The head used to be two DASHED lines, one at each wall face, a convention borrowed
    // from a drawing where the wall solid was NOT severed. With a real hole in the poché
    // those two lines re-bridge the gap the joinery just opened, so they are gone.
    const s = sceneOf(orthoOpening);
    expect(on(s, "openings").filter((n) => n.prim.t === "line")).toHaveLength(0);
    expect(on(s, "openings").some((n) => n.paint.dash)).toBe(false);
  });

  it("severs the wall at the passage on a STRAIGHT, an ANGLED and an ARC host alike", () => {
    // The claim is not "no line is drawn" — it is that the outline turns the corner and
    // runs ACROSS the wall at each jamb, which is what an opening looks like in plan. A
    // jamb is a straight outline edge exactly one wall-thickness long whose midpoint sits
    // half an opening-width from the opening's centre; that characterisation holds on a
    // curve too, where the jambs are radial.
    const cases: { name: string; src: string; at: { x: number; y: number }; t: number; w: number }[] = [
      { name: "straight", src: orthoOpening, at: { x: 4000, y: 2000 }, t: 100, w: 1800 },
      { name: "angled", src: angledOpening, at: { x: 3500, y: 2500 }, t: 100, w: 800 },
      // (15515, 8485) is the arc's own midpoint — the curve bulges AWAY from the chord's
      // far side, so its centre is (24000, 0), not the (12000, 12000) a reader guesses.
      { name: "arc", src: arcOpening, at: { x: 15515, y: 8485 }, t: 300, w: 900 },
    ];
    for (const c of cases) {
      const face = sceneOf(c.src).nodes.filter((n) => n.layer === "wallFace");
      const jambs = outlineSegments(face).filter((seg) => {
        const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y);
        const mid = { x: (seg.from.x + seg.to.x) / 2, y: (seg.from.y + seg.to.y) / 2 };
        const off = Math.hypot(mid.x - c.at.x, mid.y - c.at.y);
        return Math.abs(len - c.t) < 1 && Math.abs(off - c.w / 2) < 1;
      });
      expect(jambs, `${c.name}: expected two jambs across the wall at the passage`).toHaveLength(2);
    }
  });

  it("emits an UNPAINTED cover on an ANGLED host too — nothing repaints the floor", () => {
    // This test used to assert the OPPOSITE, and correctly: an angled wall set subtracted
    // nothing, so the opaque cover was the only thing that made a doorway read as a gap.
    const s = sceneOf(angledOpening);
    expect(coverOf(s, "openings").paint.fill).toBe("none");
    expect(coverOf(s, "openings").paint.fill).not.toBe(s.theme.opening);
    expect(coverOf(s, "doors").paint.fill).toBe("none");
  });

  it("reads as a door-style gap (·), not a window (=), in the ASCII plan", () => {
    const out = renderAscii(sceneOf(orthoOpening));
    expect(out).toContain("·"); // the passage carved out of the partition
    expect(out).not.toContain("="); // there is no window in this plan
  });

  it("compiles byte-identically twice (the cover change stays deterministic)", () => {
    expect(compile(orthoOpening, { noCache: true }).svg).toBe(compile(orthoOpening, { noCache: true }).svg);
    expect(compile(angledOpening, { noCache: true }).svg).toBe(compile(angledOpening, { noCache: true }).svg);
  });
});

describe("interior doorway rendering — the same white-band fix", () => {
  it("emits an unpainted, face-tight cover on an orthogonal host", () => {
    const src = orthoOpening.replace(
      "opening id=op   at (4000,2000) width 1800 wall partition",
      "door id=d at (4000,2000) width 800 wall partition hinge left swing in",
    );
    const s = sceneOf(src);
    const cover = coverOf(s, "doors");
    expect(cover.paint.fill).toBe("none");
    const pts = cover.prim.t === "polygon" ? cover.prim.pts : [];
    expect([...new Set(pts.map((p) => p.x))].sort((a, b) => a - b)).toEqual([3950, 4050]);
    // The leaf + swing arc are untouched by this fix.
    expect(on(s, "doors").filter((n) => n.prim.t === "arc")).toHaveLength(1);
    expect(on(s, "doors").filter((n) => n.prim.t === "line")).toHaveLength(1);
  });
});
