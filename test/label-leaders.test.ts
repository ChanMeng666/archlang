/**
 * Card AL3b (label-crowding; ADR 0035): a room's label that the fit (`fitLabels`, `src/label-fit.ts`)
 * leaves over a symbol, a wall, a door's swing or a piece's label, or off its floor, is placed once
 * more on a lattice about its anchor, and may leave its floor for a room's floor beside it, joined to
 * its room by a leader: one line and one dot.
 *
 * Everything here reads the Scene the compiler draws and measures it itself (rings, boxes, segments),
 * never the step's own verdict: where each led label stands, where its line runs and where its dot is.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { resolvePlan } from "../src/analyze.js";
import { room as roomDef } from "../src/elements/room.js";
import {
  clippedArea,
  distToPolygonEdge,
  pointInPolygon,
  rectInsidePolygon,
  rectRing,
} from "../src/geometry/polygon.js";
import { compile, diagnosticOverprint, lint } from "../src/index.js";
import { compileWork } from "../src/pipeline.js";
import type { ResolvedPlan, RRoom } from "../src/ir.js";
import { roomLabelAnchor } from "../src/elements/room.js";
import { isSymbolElement, LEADER_LABEL_WORK, MAX_LEADER_WORK, shapesOf } from "../src/label-fit.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { drawnLeaders, toScene } from "../src/scene-build.js";
import { wallBands } from "../src/label-placement.js";
import { inkExtent, textBox, textExtent } from "../src/text-layout.js";
import type { World } from "../src/world.js";
import { corpusFiles, walkFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";
import { floorAt, runs } from "./setup/fast-check.js";

const OVERLAP = "W_ANNOTATION_OVERLAP";
const WITNESS = readFileSync("test/fixtures/dense-office.arch", "utf8");

/** Every storey's IR and annotated Scene. */
function storeys(src: string, world?: World): { ir: ResolvedPlan; scene: Scene }[] {
  const { ir, levels } = resolvePlan(src, world ? { world } : {});
  if (!ir) return [];
  const plans: ResolvedPlan[] = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  return plans.map((p) => ({ ir: p, scene: toScene(p, { annotate: true }) }));
}

const ringOf = (r: RRoom): Point[] => r.poly ?? rectRing({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h });
const roomsOf = (ir: ResolvedPlan): RRoom[] => ir.elements.filter((e): e is RRoom => e.kind === "room");
const nodesOf = (scene: Scene, room: string): SceneNode[] =>
  scene.nodes.filter((n) => n.elementKind === "room" && n.elementId === room);

/** A segment's crossing of a polygon's edge, or a quarter point inside it: measured here, not imported. */
function segmentHits(a: Point, b: Point, ring: readonly Point[]): boolean {
  const turn = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i]!;
    const d = ring[(i + 1) % ring.length]!;
    if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) return true;
  }
  for (const t of [0.25, 0.5, 0.75])
    if (pointInPolygon(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ring)) return true;
  return false;
}

/** A text's box as it draws: centred on its point, the wider of the estimate and the ink. */
function drawnBox(prim: Extract<SceneNode["prim"], { t: "text" }>): { x0: number; x1: number; y0: number; y1: number } {
  const w = Math.max(textExtent(prim).w, inkExtent(prim).w);
  const h = textExtent(prim).h;
  return { x0: prim.at.x - w / 2, x1: prim.at.x + w / 2, y0: prim.at.y - h / 2, y1: prim.at.y + h / 2 };
}

/** Every pair of two rooms' label texts whose drawn boxes overlap, measured here. */
function roomTextOverprints(scene: Scene, of?: ReadonlySet<string>): string[] {
  const texts = scene.nodes.filter(
    (n): n is SceneNode & { prim: Extract<SceneNode["prim"], { t: "text" }> } =>
      n.elementKind === "room" && n.layer === "labels" && n.prim.t === "text",
  );
  const out: string[] = [];
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const [p, q] = [texts[i]!, texts[j]!];
      if (p.elementId === q.elementId) continue;
      if (of && !of.has(p.elementId!) && !of.has(q.elementId!)) continue;
      const a = drawnBox(p.prim);
      const b = drawnBox(q.prim);
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > 0 && h > 0) out.push(`${p.elementId}:"${p.prim.value}" x ${q.elementId}:"${q.prim.value}"`);
    }
  return out;
}

type Box = { x: number; y: number; w: number; h: number };
const meets = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

/**
 * The first place of the leader's lattice about the room's anchor (pitch the room-name size, ranked
 * as ADR 0035 ranks it) whose dot stands on the room's floor clear of every symbol, every wall band
 * and every text as drawn; undefined when none is.
 */
function clearDotPlace(ir: ResolvedPlan, scene: Scene, room: RRoom, r: number, shapes: Point[][]): Point | undefined {
  const pitch = scene.sizes.roomFont;
  const ring = ringOf(room);
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const reach = Math.min(16, Math.ceil(extent / pitch) + 2);
  const anchor = roomLabelAnchor(room);
  const walls = wallBands(ir, 0);
  const texts: Box[] = scene.nodes.flatMap((n) => {
    if (n.prim.t !== "text") return [];
    if (n.prim.rotate !== undefined) {
      const b = textBox(n.prim).box;
      return [{ x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY }];
    }
    const d = drawnBox(n.prim);
    return [{ x: d.x0, y: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0 }];
  });
  const places: { i: number; j: number }[] = [];
  for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) places.push({ i, j });
  places.sort(
    (u, v) =>
      u.i * u.i + u.j * u.j - (v.i * v.i + v.j * v.j) ||
      Math.max(Math.abs(u.i), Math.abs(u.j)) - Math.max(Math.abs(v.i), Math.abs(v.j)) ||
      u.j - v.j ||
      u.i - v.i,
  );
  for (const { i, j } of places) {
    const p = { x: anchor.x + i * pitch, y: anchor.y + j * pitch };
    const d = { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r };
    if (!rectInsidePolygon(d, ring)) continue;
    if (shapes.some((sh) => clippedArea(sh, rectRing(d)) > 0)) continue;
    if (walls.some((w) => meets(d, w)) || texts.some((t) => meets(d, t))) continue;
    return p;
  }
  return undefined;
}

/**
 * The points of the segment, 400 along it, that stand on neither floor and not in a gap between the
 * two floors as wide as a wall at most (their distances to the two floors' edges sum to more than the
 * plan's thickest wall): measured here. A line through a wall between the floors crosses only such a
 * gap; one out of the building, or past a corner across open ground, does not.
 */
function lineOffFloors(ir: ResolvedPlan, a: Point, b: Point, own: Point[], host: Point[]): string[] {
  const thickest = Math.max(0, ...ir.walls.map((w) => w.thickness));
  const out: string[] = [];
  for (let i = 0; i < 400; i++) {
    const t = (i + 0.5) / 400;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (pointInPolygon(p.x, p.y, own) || pointInPolygon(p.x, p.y, host)) continue;
    if (distToPolygonEdge(p, own) + distToPolygonEdge(p, host) <= thickest + 2) continue;
    out.push(`(${Math.round(p.x)},${Math.round(p.y)})`);
  }
  return out;
}

/**
 * Every leader a storey draws, checked: its line and dot are the room's last two nodes, the dot on
 * the room's own floor and clear of every symbol; the label's texts on the host's floor; the line
 * through no third room's floor, no other text and no other leader. Returns the led rooms' ids.
 */
function checkLeaders(name: string, ir: ResolvedPlan, scene: Scene): string[] {
  const led = drawnLeaders(scene) ?? [];
  const rooms = new Map(roomsOf(ir).map((r) => [r.id, r] as const));
  const symbols = ir.elements.filter(isSymbolElement).map((e) => e.id);
  const shapes = scene.nodes
    .filter((n) => n.elementId !== undefined && symbols.includes(n.elementId) && n.prim.t !== "text")
    .flatMap((n) => shapesOf(n.prim));
  for (const l of led) {
    const room = rooms.get(l.room)!;
    const host = rooms.get(l.host)!;
    expect(room, name).toBeDefined();
    expect(host, name).toBeDefined();
    expect(room.labelAt, `${name}: a pinned label is never led`).toBeUndefined();
    const own = nodesOf(scene, l.room);
    const line = own.find((n) => n.prim.t === "line");
    const dot = own.find((n) => n.prim.t === "circle");
    expect(line?.prim, name).toEqual({ t: "line", a: l.a, b: l.b });
    expect(dot?.prim.t === "circle" && dot.prim.center, name).toEqual(l.b);
    expect(line!.layer, name).toBe("labels");
    // The dot on the room's own floor, clear of every symbol.
    expect(pointInPolygon(l.b.x, l.b.y, ringOf(room)), `${name}: ${l.room}'s dot on its floor`).toBe(true);
    const r = (dot!.prim as { r: number }).r;
    const disc = rectRing({ x: l.b.x - r, y: l.b.y - r, w: 2 * r, h: 2 * r });
    // Clear of every symbol, unless no place of the lattice on its floor is: then at its anchor, and
    // no place of the lattice, on its floor, is clear of every symbol, wall band and text as drawn.
    const onSymbol = shapes.some((sh) => clippedArea(sh, disc) > 0);
    if (onSymbol) {
      expect(l.b, `${name}: ${l.room}'s dot on a symbol, not at its anchor`).toEqual(roomLabelAnchor(room));
      const free = clearDotPlace(ir, scene, room, r, shapes);
      expect(free, `${name}: ${l.room}'s dot on a symbol, though its floor has a clear place`).toBeUndefined();
    }
    // The label on the host's floor, at the width it draws.
    for (const n of own) {
      if (n.prim.t !== "text") continue;
      const ink = textBox(n.prim, inkExtent(n.prim).w);
      const box = { x: ink.box.minX, y: ink.box.minY, w: ink.box.maxX - ink.box.minX, h: ink.box.maxY - ink.box.minY };
      const inset = { x: box.x + box.w * 0.01, y: box.y + box.h * 0.01, w: box.w * 0.98, h: box.h * 0.98 };
      expect(
        rectInsidePolygon(inset, ringOf(host)),
        `${name}: ${l.room}'s "${n.prim.value}" on ${l.host}'s floor`,
      ).toBe(true);
    }
    // The line: no third room's floor, no other room's text, no other leader.
    for (const other of rooms.values()) {
      if (other.id === l.room || other.id === l.host) continue;
      expect(segmentHits(l.a, l.b, ringOf(other)), `${name}: ${l.room}'s leader through ${other.id}`).toBe(false);
    }
    for (const n of scene.nodes) {
      if (n.prim.t !== "text" || (n.elementKind === "room" && n.elementId === l.room)) continue;
      expect(segmentHits(l.a, l.b, textBox(n.prim).rect), `${name}: ${l.room}'s leader over "${n.prim.value}"`).toBe(
        false,
      );
    }
    // Off the two floors, only through a gap between them no wider than a wall: never out of the
    // building, never through a third room's wall.
    expect(
      lineOffFloors(ir, l.a, l.b, ringOf(room), ringOf(host)),
      `${name}: ${l.room}'s leader off its floors`,
    ).toEqual([]);
    for (const o of led) {
      if (o === l) continue;
      const turn = (p: Point, q: Point, s: Point) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
      const cross = turn(l.a, l.b, o.a) * turn(l.a, l.b, o.b) < 0 && turn(o.a, o.b, l.a) * turn(o.a, o.b, l.b) < 0;
      expect(cross, `${name}: ${l.room}'s leader across ${o.room}'s`).toBe(false);
    }
  }
  // A led label stands clear of every other room's label, at the width each draws.
  expect(
    roomTextOverprints(scene, new Set(led.map((l) => l.room))),
    `${name}: a led label over a room's label`,
  ).toEqual([]);
  return led.map((l) => l.room);
}

describe("the witness", () => {
  it("leads Store / IT and Kitchenette / Break into the corridor, where nothing reports them", () => {
    const [{ ir, scene }] = storeys(WITNESS) as [{ ir: ResolvedPlan; scene: Scene }];
    expect(checkLeaders("witness", ir, scene).sort()).toEqual(["r_kitchen", "r_store"]);
    expect((drawnLeaders(scene) ?? []).map((l) => l.host)).toEqual(["r_hall", "r_hall"]);
    expect(lint(WITNESS).filter((d) => d.code === OVERLAP)).toEqual([]);
  });

  it("draws one line in the thin pen and one dot in the name's ink for each", () => {
    const [{ scene }] = storeys(WITNESS) as [{ ir: ResolvedPlan; scene: Scene }];
    for (const room of ["r_store", "r_kitchen"]) {
      const own = nodesOf(scene, room);
      const name = own.find((n) => n.prim.t === "text")!;
      expect(own.map((n) => n.prim.t)).toEqual(["polygon", "text", "text", "line", "circle"]);
      const [line, dot] = own.slice(-2) as [SceneNode, SceneNode];
      expect(line.lineWeight).toBe("thin");
      expect(line.paint.stroke).toBe(name.paint.fill);
      expect(dot.paint.fill).toBe(name.paint.fill);
    }
  });
});

describe("what it never does", () => {
  it("never leads a pinned label: the report stands", () => {
    const src = `plan "p" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size 3000x2000 label "WC" at (1000,1000)
  room id=big at (0,2000) size 6000x4000 label "Hall" uses circulation
  furniture plinth at (1120,830) size 600x120
}
`;
    const [{ scene }] = storeys(src) as [{ ir: ResolvedPlan; scene: Scene }];
    expect(drawnLeaders(scene)).toEqual([]);
    expect(
      lint(src)
        .filter((d) => d.code === OVERLAP)
        .map((d) => diagnosticOverprint(d)!.subject.room),
    ).toEqual(["r"]);
  });

  it("never stands a label it places over another room's label, at the width each draws", () => {
    // Generated strip plain-strip seed 11, plan 68 (the AL3b red team): the step led Den's label into
    // MW's room and stood its area figure over "MW", each read narrower than it draws.
    const src = `plan "p" {
  units mm
  paper A2 landscape
  scale 1:100
  dims auto all
  room id=r0 at (0,0) size 1100x2000 label "Den" uses storage
  furniture wc at (550,150) size 350x1700
  room id=r1 at (1100,0) size 2250x2000 label "MW" uses storage
  room id=r2 at (3350,0) size 1050x2000 label "Plant Room" uses storage
  furniture desk at (3500,100) size 600x950
  room id=r3 at (4400,0) size 1750x2000 label "Store / IT" uses storage
  furniture table at (4600,400) size 1400x1450
  furniture plinth at (4650,150) size 1000x1650
  room id=r4 at (6150,0) size 1900x2000 label "GYM" uses storage
  room id=r5 at (8050,0) size 2400x2000 label "GYM" uses storage
  furniture bed at (8750,1350) size 1400x400
  furniture sofa at (8300,850) size 550x450
  wall id=wn exterior thickness 200 { (0,0) (10450,0) }
  wall id=ww exterior thickness 200 { (0,0) (0,2000) }
  wall partition thickness 100 { (1100,0) (1100,2000) }
  wall partition thickness 100 { (3350,0) (3350,2000) }
  wall partition thickness 100 { (4400,0) (4400,2000) }
  wall partition thickness 100 { (8050,0) (8050,2000) }
  door at (9250,0) width 800
}
`;
    const [{ scene }] = storeys(src) as [{ ir: ResolvedPlan; scene: Scene }];
    expect(roomTextOverprints(scene)).toEqual([]);
  });

  it("never ends a leader on a symbol while its floor has a clear place, the label's old place retired", () => {
    // The AL3b red team, plain-strip seed 101 plan 27: the box the fit left the store's label at was
    // never retired, so it blocked the store's own dot, which went to the anchor on the basin.
    const src = `plan "p" {
  units mm
  paper A3 landscape
  scale 1:100
  dims auto
  room id=r0 at (0,0) size 700x1900 label "Store / IT" uses storage
  furniture basin at (100,150) size 450x1150
  furniture wc at (250,200) size 350x1300
  room id=r1 at (700,0) size 1300x1900 label "Plant Room" uses storage
  room id=r2 at (2000,0) size 1200x1900 label "Plant Room" uses storage
  furniture fridge at (2100,600) size 800x1000
  furniture table at (2150,500) size 900x1200
  room id=r3 at (3200,0) size 1000x1900 label "Kitchen" uses storage
  furniture basin at (3600,100) size 350x750
  room id=r4 at (4200,0) size 800x1900 label "Common Room" uses storage
  room id=r5 at (5000,0) size 2300x1900 label "Common Room" uses storage
  room id=r6 at (7300,0) size 1100x1900 label "Common Room" uses storage
  furniture basin at (7800,550) size 450x500
  furniture desk at (7450,100) size 850x700
  room id=hall at (0,1900) size 8400x1500 label "Corridor" uses circulation
  walls from rooms exterior 200 partition 100
}
`;
    const [{ ir, scene }] = storeys(src) as [{ ir: ResolvedPlan; scene: Scene }];
    expect(checkLeaders("plain-strip 101 #27", ir, scene)).toContain("r0");
    const r0 = roomsOf(ir).find((r) => r.id === "r0")!;
    const dot = (drawnLeaders(scene) ?? []).find((l) => l.room === "r0")!.b;
    expect(dot, "r0's dot is not at its anchor").not.toEqual(roomLabelAnchor(r0));
  });

  it("never runs a leader out of the building or through a third room's wall", () => {
    // The AL3b red team, plain-grid seed 223 plan 197: Meeting B's label was led to MW's floor, its
    // line 2 m across the open ground between them, through the exterior wall twice.
    const src = `plan "p" {
  units mm
  dims auto all
  room id=r0 at (0,0) size 3700x2450 label "Common Room" uses storage
  furniture table at (1550,200) size 800x300
  room id=r1 at (3700,0) size 3300x2450 label "Store / IT" uses storage
  room id=r2 at (7000,0) size 3900x2450 label "MW" uses storage
  furniture table at (8350,300) size 1250x1000
  furniture desk at (8200,800) size 1200x800
  room id=r3 at (10900,0) size 2100x2450 label "Bedroom" uses storage
  furniture plinth at (11200,750) size 1600x650
  room id=r4 at (13000,0) size 2600x2450 uses storage
  furniture desk at (13650,700) size 1350x1550
  room id=r5 at (0,2450) size 2950x2050 label "MW" uses storage
  furniture basin at (2250,2700) size 600x800
  room id=r6 at (2950,2450) size 2100x2050 label "Hauswirtschaftsraum" uses storage
  furniture rug at (3100,3700) size 1800x700
  furniture desk at (3500,2800) size 950x950
  room id=r7 at (0,4500) size 3050x2200 label "Store / IT" uses storage
  room id=r8 at (3050,4500) size 1250x2200 label "MASTER BEDROOM" uses storage
  furniture fridge at (3400,5650) size 350x400
  furniture desk at (3450,5150) size 650x1050
  room id=r9 at (4300,4500) size 3300x2200 label "Bath" uses storage
  furniture sofa at (5500,4600) size 850x1700
  furniture shower at (4750,5150) size 1700x1400
  room id=r10 at (7600,4500) size 2950x2200 label "Meeting B" uses storage
  furniture basin at (8250,4800) size 750x1650
  walls from rooms exterior 200 partition 100
}
`;
    const [{ ir, scene }] = storeys(src) as [{ ir: ResolvedPlan; scene: Scene }];
    const led = checkLeaders("plain-grid 223 #197", ir, scene);
    expect((drawnLeaders(scene) ?? []).filter((l) => l.room === "r10" && l.host === "r2")).toEqual([]);
    expect(led).not.toContain("r10");

    // Plain-grid seed 223 plan 125: r3's leader into r5 cut the outside corner where r3's own wall
    // meets r5's, 296 mm across open ground. That wall touches r5 only at the corner.
    const corner = `plan "p" {
  units mm
  paper A3 landscape
  scale 1:100
  room id=r0 at (0,0) size 2650x2850 label "MASTER BEDROOM" uses storage
  furniture plinth at (850,1300) size 550x1000
  furniture plinth at (1300,2150) size 1000x400
  room id=r1 at (2650,0) size 1300x2850 label "Hauswirtschaftsraum" uses storage
  furniture basin at (3000,1000) size 650x1250
  furniture basin at (3200,1400) size 600x900
  room id=r2 at (0,2850) size 2200x2700 label "Utility Room" uses storage
  room id=r3 at (2200,2850) size 1250x2700 label "Hauswirtschaftsraum" uses storage
  room id=r4 at (0,5550) size 2450x2950 label "Store / IT" uses storage
  room id=r5 at (2450,5550) size 3000x2950 label "Store / IT" uses storage
  room id=r6 at (5450,5550) size 2000x2950 label "W" uses storage
  walls from rooms exterior 200 partition 100
}
`;
    const [two] = storeys(corner) as [{ ir: ResolvedPlan; scene: Scene }];
    checkLeaders("plain-grid 223 #125", two.ir, two.scene);

    // The AL3b red team's second round, mid2: the wall between the two rooms runs past both, and the
    // line's piece off the floors had its middle in that wall and its end in the open ground beside it.
    const mid2 = `plan "mid2" {
  units mm
  paper A2 landscape
  scale 1:50
  wall id=w interior thickness 200 { (3000,0) (3000,6000) }
  wall id=n exterior thickness 200 { (1900,0) (3000,0) }
  wall id=e exterior thickness 200 { (1900,0) (1900,2000) }
  room id=a at (1900,0) size 1100x2000 label "Store" uses storage
  furniture wc at (2050,150) size 800x1700
  room id=b at (3000,2600) size 3000x3400 label "Hall" uses circulation
  wall id=s exterior thickness 200 { (3000,6000) (6000,6000) (6000,2600) }
}
`;
    const [three] = storeys(mid2) as [{ ir: ResolvedPlan; scene: Scene }];
    checkLeaders("mid2", three.ir, three.scene);
  });

  it("chooses between two floors that hold a place by the plan, not by the order of the source", () => {
    // The AL3b red team, strip seed 313 plan 56: "Dressing" (n3) stands inside "Meeting B" (r1), so a
    // place inside both was Meeting B's own floor or a leader into n3 by which came first.
    const lines = [
      '  room id=r0 at (0,0) size 1750x1850 label "NEWSROOM" at (150,1550) uses storage',
      '  room id=r1 at (1750,0) size 1850x1850 label "Meeting B" uses storage',
      "  furniture table at (1900,850) size 300x450",
      "  furniture fridge at (1900,500) size 950x1150",
      '  room id=r2 at (3600,0) size 950x1850 label "Bedroom" at (4350,1550) uses storage',
      "  furniture rug at (3700,1200) size 700x450",
      "  furniture shower at (3750,950) size 650x400",
      '  room id=hall at (0,1850) size 4550x1500 label "Corridor" uses circulation',
      '  outdoor paving at (1750,0) size 1850x1850 label "NEWSROOM"',
      '  room id=n3 at (2200,450) size 950x950 label "Dressing" uses storage',
    ];
    const walls = [
      "  wall id=wn exterior thickness 200 { (0,0) (4550,0) }",
      "  wall id=ww exterior thickness 200 { (0,0) (0,3350) }",
      "  wall partition thickness 100 { (1750,0) (1750,1850) }",
      "  wall partition thickness 100 { (3600,0) (3600,1850) }",
    ];
    const plan = (body: string[]) =>
      `plan "p" {\n  units mm\n  paper A3 landscape\n  scale 1:100\n${[...body, ...walls].join("\n")}\n}\n`;
    const order = [9, 4, 2, 3, 0, 5, 6, 7, 8, 1];
    const labels = (src: string) => {
      const [{ ir, scene }] = storeys(src) as [{ ir: ResolvedPlan; scene: Scene }];
      checkLeaders("strip 313 #56", ir, scene);
      return scene.nodes
        .filter((n) => n.elementKind === "room" && n.layer === "labels")
        .map((n) => `${n.elementId} ${JSON.stringify(n.prim)}`)
        .sort();
    };
    expect(labels(plan(order.map((k) => lines[k]!)))).toEqual(labels(plan(lines)));
  });

  it("over the corpus: leads only in the plans named, and every leader holds", () => {
    const files = [...corpusFiles(), ...walkFiles("test/plans").map((p) => p.replace(/\\/g, "/"))];
    const led: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const world = worldFor(dirname(file));
      for (const { ir, scene } of storeys(src, world)) {
        const rooms = checkLeaders(file, ir, scene);
        if (rooms.length > 0) led.push(...rooms.map((r) => `${file}: ${r}`));
      }
    }
    expect(led.sort()).toEqual(LED);
  }, 120_000);

  it("generated strips: every leader holds, and the same rooms in another order draw the same", () => {
    const NAMES = ["Store / IT", "Kitchenette / Break", "Accessible WC", "WC", "Dressing", "Utility"];
    const FURN = ["wc", "basin", "wardrobe", "shower", "cabinet"];
    const spec = fc.record({
      w: fc.constantFrom(1200, 1500),
      name: fc.constantFrom(...NAMES),
      furniture: fc.array(fc.record({ kind: fc.constantFrom(...FURN), y: fc.constantFrom(200, 700, 1200) }), {
        maxLength: 2,
      }),
    });
    let leadersSeen = 0;
    fc.assert(
      fc.property(
        fc.array(spec, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (rooms, seed) => {
          let x = 0;
          const lines: string[] = [];
          const pieces: string[] = [];
          rooms.forEach((r, i) => {
            lines.push(`  room id=r${i} at (${x},0) size ${r.w}x2400 label "${r.name}" uses storage`);
            for (const f of r.furniture) pieces.push(`  furniture ${f.kind} at (${x + 100},${f.y}) in r${i}`);
            x += r.w;
          });
          lines.push(`  room id=hall at (0,2400) size ${x}x2000 label "Hall" uses circulation`);
          let state = seed;
          const other = [...lines];
          for (let i = other.length - 1; i > 0; i--) {
            state = (state * 1103515245 + 12345) % 2147483648;
            const j = state % (i + 1);
            [other[i], other[j]] = [other[j]!, other[i]!];
          }
          const plan = (ls: readonly string[]) =>
            `plan "g" {\n  units mm\n  paper A4 landscape\n  scale 1:100\n${ls.join("\n")}\n${pieces.join("\n")}\n  walls from rooms exterior 200 partition 100\n}\n`;
          const a = storeys(plan(lines));
          const b = storeys(plan(other));
          if (a.length === 0) return;
          leadersSeen += checkLeaders("generated", a[0]!.ir, a[0]!.scene).length;
          const roomNodes = (s: Scene) =>
            s.nodes
              .filter((n) => n.elementKind === "room")
              .map((n) => `${n.elementId}:${JSON.stringify(n.prim)}`)
              .sort();
          expect(roomNodes(b[0]!.scene)).toEqual(roomNodes(a[0]!.scene));
        },
      ),
      { numRuns: runs(60), seed: 2718 },
    );
    expect(leadersSeen).toBeGreaterThanOrEqual(floorAt(3));
  }, 120_000);
});

describe("the count", () => {
  /** The 14 x 14 grid of the label-fit count test: every label a candidate, none with anywhere to go. */
  const grid = (() => {
    let s = 'plan "g" {\n  units mm\n  paper A0 landscape\n  scale 1:200\n';
    for (let y = 0; y < 14; y++)
      for (let x = 0; x < 14; x++)
        s += `  room id=r${x}_${y} at (${x * 1500},${y * 1500}) size 1500x1500 label "Hauswirtschaftsraum ${x}" uses storage\n`;
    return `${s}  walls from rooms exterior 200 partition 100\n}\n`;
  })();

  it("is a count: the same places are tried on every run", () => {
    const one = compileWork(grid);
    const two = compileWork(grid);
    expect(two.labelLeaders).toBe(one.labelLeaders);
    expect(one.labelLeaders).toBeGreaterThan(0);
    // Each place tried reads at least one mark, so the places are fewer than the units of the count.
    expect(one.labelLeaders).toBeLessThan(MAX_LEADER_WORK);
    expect(LEADER_LABEL_WORK).toBeLessThan(MAX_LEADER_WORK);
  }, 60_000);

  /** Rooms led and rooms still reported, and the drawing, for one compile of `src`. */
  const outcome = (src: string) => {
    const [{ scene }] = storeys(src) as [{ ir: ResolvedPlan; scene: Scene }];
    const led = (drawnLeaders(scene) ?? []).map((l) => l.room);
    const reported = lint(src)
      .filter((d) => d.code === OVERLAP)
      .map((d) => diagnosticOverprint(d)!.subject.room);
    return { led, reported, svg: compile(src, { noCache: true }).svg, places: compileWork(src).labelLeaders };
  };

  it("stops at the step's count: a long strip of WCs off a corridor leads the first and leaves the rest", () => {
    // 60 rooms of 1.1 x 2 m, a WC filling each, a 2.4 m corridor below: every name needs the corridor.
    // Measured when it was set: 37 of the 60 labels are tried before the count (MAX_LEADER_WORK) is
    // spent, 36 led; with no count all 60 are tried and 59 led.
    let src = 'plan "g" {\n  units mm\n  paper A0 landscape\n  scale 1:100\n';
    for (let i = 0; i < 60; i++)
      src += `  room id=r${i} at (${i * 1100},0) size 1100x2000 label "Store ${i}" uses storage\n  furniture wc at (${i * 1100 + 150},150) size 800x1700\n`;
    src += '  room id=hall at (0,2000) size 66000x2400 label "Corridor" uses circulation\n';
    src += "  walls from rooms exterior 200 partition 100\n}\n";
    const one = outcome(src);
    // The first rooms (the labels are taken left to right) are led; past the count, the last keep
    // the place the fit gave them and are reported.
    expect(one.led).toContain("r0");
    expect(one.led.length).toBeLessThan(50);
    expect(one.led).not.toContain("r59");
    expect(one.reported).toContain("r59");
    expect(one.reported.length).toBeGreaterThan(10);
    // A count, the same on every run.
    const two = outcome(src);
    expect(two).toEqual(one);
  }, 120_000);

  it("stops one label at its own cap, so a label that can never be placed leaves the count to the next", () => {
    // A room full of chairs, ordered first, whose name has no clear place anywhere its lattice reaches:
    // its search is stopped at LEADER_LABEL_WORK, and the WC room after it is still led. With no cap
    // the first label spends the step's whole count and the WC room's is never tried.
    let src = 'plan "g" {\n  units mm\n  paper A1 landscape\n  scale 1:100\n';
    src += '  room id=a at (0,0) size 8000x8000 label "Hauswirtschaftsraum" uses storage\n';
    for (let y = 100; y + 400 <= 7900; y += 500)
      for (let x = 100; x + 400 <= 7900; x += 500) src += `  furniture chair at (${x},${y}) size 400x400\n`;
    src += '  room id=b at (13000,6000) size 1100x2000 label "Store" uses storage\n';
    src += "  furniture wc at (13150,6150) size 800x1700\n";
    src += '  room id=hall at (13000,8000) size 3000x2400 label "Corridor" uses circulation\n}\n';
    const one = outcome(src);
    expect(one.led).toEqual(["b"]);
    expect(one.reported).toContain("a");
    expect(outcome(src)).toEqual(one);
  }, 120_000);
});

describe("what the room costs", () => {
  it("draws no more than its drawCost, the leader's line and dot included", () => {
    const [{ ir, scene }] = storeys(WITNESS) as [{ ir: ResolvedPlan; scene: Scene }];
    for (const r of roomsOf(ir)) expect(nodesOf(scene, r.id).length, r.id).toBeLessThanOrEqual(roomDef.drawCost!(r));
  });
});

/** The corpus rooms whose labels are led off their floors, `file: room`. */
const LED: string[] = [
  "test/fixtures/dense-office.arch: r_kitchen",
  "test/fixtures/dense-office.arch: r_store",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-24-rerun/2-house.arch: bath",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-24-rerun/2-house.arch: dress",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-24-rerun/5-townhouse.arch: stairg",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-24-rerun/5-townhouse.arch: stairu",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-26-rerun-row6/5-townhouse.arch: f_stair",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-27-rerun-arm1/5-townhouse.arch: bath",
];
