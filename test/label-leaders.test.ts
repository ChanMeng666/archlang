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
import { clippedArea, pointInPolygon, rectInsidePolygon, rectRing } from "../src/geometry/polygon.js";
import { diagnosticOverprint, lint } from "../src/index.js";
import { compileWork } from "../src/pipeline.js";
import type { ResolvedPlan, RRoom } from "../src/ir.js";
import { roomLabelAnchor } from "../src/elements/room.js";
import { isSymbolElement, LEADER_LABEL_WORK, MAX_LEADER_WORK, shapesOf } from "../src/label-fit.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { drawnLeaders, toScene } from "../src/scene-build.js";
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
    // Clear of every symbol, unless no place of the lattice on its floor is: then at its anchor.
    const onSymbol = shapes.some((sh) => clippedArea(sh, disc) > 0);
    if (onSymbol) expect(l.b, `${name}: ${l.room}'s dot on a symbol, not at its anchor`).toEqual(roomLabelAnchor(room));
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

  it("is a count: the same places are tried on every run, and the step stops at its share", () => {
    const one = compileWork(grid);
    const two = compileWork(grid);
    expect(two.labelLeaders).toBe(one.labelLeaders);
    expect(one.labelLeaders).toBeGreaterThan(0);
    // Each place tried reads at least one mark, so the places are fewer than the units of the count.
    expect(one.labelLeaders).toBeLessThan(MAX_LEADER_WORK);
    expect(LEADER_LABEL_WORK).toBeLessThan(MAX_LEADER_WORK);
  }, 60_000);
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
