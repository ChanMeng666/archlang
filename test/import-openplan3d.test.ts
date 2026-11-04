/**
 * `openPlan3dToArch` (`arch import --from openplan3d`): an OpenPlan3D plan in, ArchLang source and
 * a report out.
 *
 * The samples in `test/fixtures/openplan3d/` are OpenPlan3D's own files (README there: source
 * commit, paths, MIT licence). The inputs built in this file are HAND-WRITTEN from OpenPlan3D's
 * documented schema (`docs/skills/openplan3d-plan-authoring/SKILL.md` §3–4 and `types.ts` at that
 * commit), each for one mapping the samples do not pin on their own: door hands, stair turns,
 * unit conversion, hostile shapes.
 *
 * The door and stair expectations are not restated by hand: `upstreamSingleLeaf`,
 * `upstreamDoubleLeaves` and `upstreamStairFoot` transcribe OpenPlan3D's own drawing code
 * (`src/lib/utils/doorSymbol.ts`, `canvasRenderer.ts` `drawStair`) and the test compares what
 * ArchLang resolves against what OpenPlan3D draws.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, doorLeaves, format, lint, openPlan3dToArch, resolvePlan } from "../src/index.js";
import type { OpenPlan3dImportResult } from "../src/index.js";
import type { RDoor, RStair } from "../src/ir.js";
import { tailEdge } from "../src/vertical.js";

const DIR = join(__dirname, "fixtures", "openplan3d");
const read = (f: string): unknown => JSON.parse(readFileSync(join(DIR, f), "utf8"));
const SAMPLES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();
/** The two samples that are not OpenPlan3D plans OpenPlan3D would open. */
const REFUSED = new Set(["damaged-native.openplan.json", "handoff-plan.json"]);
const errorsOf = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "error");

/** A web project of one floor holding `floor`'s arrays (hand-written, from SKILL.md §3). */
const web = (floor: Record<string, unknown>) => ({
  id: "hand-written",
  name: "Hand-written",
  floors: [{ id: "g", name: "Ground Floor", level: 0, ...floor }],
});
/** A 400 × 300 cm room, its top wall drawn left to right and its bottom wall right to left. */
const BOX = [
  { id: "top-wall", start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 10 },
  { id: "right-wall", start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 10 },
  { id: "bottom-wall", start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 10 },
  { id: "left-wall", start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 10 },
];
const wallOf = (id: string) => BOX.find((w) => w.id === id)!;

function sourceOf(r: OpenPlan3dImportResult): string {
  expect(r.ok, JSON.stringify(r.diagnostics)).toBe(true);
  return r.source!;
}

describe("OpenPlan3D samples", () => {
  it("are all here: at least ten that OpenPlan3D opens", () => {
    expect(SAMPLES.filter((f) => !REFUSED.has(f)).length).toBeGreaterThanOrEqual(10);
  });

  for (const f of SAMPLES.filter((s) => !REFUSED.has(s))) {
    it(`${f}: imports, compiles with no error, and lints`, () => {
      const r = openPlan3dToArch(read(f));
      const src = sourceOf(r);
      expect(errorsOf(src)).toEqual([]);
      expect(Array.isArray(lint(src))).toBe(true);
      // Canonical: formatting the output changes nothing.
      expect(format(src)).toBe(src);
      // Only the import's own warnings come with it.
      for (const d of r.diagnostics) expect(d.code).toBe("W_IMPORT_DROPPED");
    });

    it(`${f}: every entity is mapped or listed as dropped, with a reason`, () => {
      const r = openPlan3dToArch(read(f));
      const report = r.report!;
      let dropped = 0;
      for (const [kind, c] of Object.entries(report.counts)) {
        expect(c.in, kind).toBe(c.mapped + c.dropped);
        dropped += c.dropped;
      }
      expect(report.dropped.length).toBe(dropped);
      for (const d of report.dropped) {
        expect(typeof d.reason).toBe("string");
        expect(d.reason.length).toBeGreaterThan(0);
      }
      for (const fld of report.fields) {
        expect(fld.count).toBeGreaterThan(0);
        expect(typeof fld.reason, fld.field).toBe("string");
        expect(fld.reason.length, fld.field).toBeGreaterThan(0);
      }
      // A warning for every dropped kind and every dropped field that is not report-only.
      const warned = r.diagnostics.filter((d) => d.code === "W_IMPORT_DROPPED").map((d) => d.message);
      for (const d of report.dropped) expect(warned.some((m) => m.endsWith(`: ${d.reason}`))).toBe(true);
      // Each input array is counted whole.
      const doc = read(f) as Record<string, unknown>;
      const total = (key: string) =>
        report.format === "web"
          ? (doc.floors as Record<string, unknown>[]).reduce((s, fl) => s + ((fl[key] as unknown[]) ?? []).length, 0)
          : ((doc[key] as unknown[]) ?? []).length;
      const kinds =
        report.format === "web"
          ? ["walls", "doors", "windows", "rooms", "stairs", "columns", "furniture", "textAnnotations", "annotations"]
          : ["walls", "doors", "windows", "openings", "objects", "sections", "stories"];
      for (const k of kinds) expect(report.counts[k]?.in ?? 0, k).toBe(total(k));
    });

    it(`${f}: the same input gives the same bytes`, () => {
      const a = openPlan3dToArch(read(f));
      const b = openPlan3dToArch(read(f));
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });
  }

  it("refuses the two files OpenPlan3D refuses, with its path and reason", () => {
    const damaged = openPlan3dToArch(read("damaged-native.openplan.json"));
    expect(damaged.ok).toBe(false);
    expect(damaged.source).toBeUndefined();
    expect(damaged.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["E_IMPORT_FORMAT", "Invalid project: floors[0].walls[0].start must be an object."],
    ]);
    // The iPhone app's own plan file is neither format: it reads as a web project with no id.
    const native = openPlan3dToArch(read("handoff-plan.json"));
    expect(native.ok).toBe(false);
    expect(native.diagnostics.every((d) => d.code === "E_IMPORT_FORMAT")).toBe(true);
  });

  it("warns of what it leaves out, and lists report-only fields without a warning", () => {
    const r = openPlan3dToArch(read("two-room-web-project.json"));
    const warned = r.diagnostics.filter((d) => d.code === "W_IMPORT_DROPPED").map((d) => d.message);
    expect(warned).toEqual([
      "`floors[].rooms[].floorTexture` not imported on 2 records: a finish (colour or texture): ArchLang draws no finishes",
      "`floors[].walls[].color` not imported on 5 records: a finish (colour or texture): ArchLang draws no finishes",
    ]);
    // The stored room area and the project metadata are in the report, with no warning.
    const fields = r.report!.fields.map((f) => f.field);
    expect(fields).toContain("floors[].rooms[].area");
    expect(fields).toContain("project.createdAt");
    expect(warned.some((m) => m.includes("rooms[].area") || m.includes("createdAt"))).toBe(false);
  });

  it("reads both files of OpenPlan3D's two-room example as the same plan", () => {
    const body = (s: string) =>
      s
        .split("\n")
        .slice(4)
        .join("\n")
        .replace(/room id=\w+/g, "room");
    const a = sourceOf(openPlan3dToArch(read("two-room-web-project.json")));
    const b = sourceOf(openPlan3dToArch(read("two-room-interchange.openplan3d.json")));
    // The interchange file names its rooms by section, so they gain a use; nothing else differs.
    expect(body(b).replace(/ uses \w+/g, "")).toBe(body(a));
    // SKILL.md §9: "named rooms (24 m² and 16 m²)", centreline areas.
    const res = resolvePlan(a).ir!;
    const rooms = res.elements.filter((e) => e.kind === "room") as unknown as {
      label?: string;
      size: { w: number; h: number };
    }[];
    expect(rooms.map((r) => [r.label, (r.size.w * r.size.h) / 1e6])).toEqual([
      ["Living Room", 24],
      ["Bedroom", 16],
    ]);
  });

  it("imports both storeys of a multi-floor file as level blocks, with the storey height", () => {
    const src = sourceOf(openPlan3dToArch(read("sketch-two-floors.openplan.json")));
    expect(src).toMatch(/level 0 "Ground Floor" height 3000 \{/);
    expect(src).toMatch(/level 1 "Floor 1" \{/);
    const r = openPlan3dToArch(read("top-down-framing.openplan.json"));
    // Elevations -350, 0 and 425.5 cm: the storey heights are their differences.
    expect(r.report!.levels).toEqual([
      { level: -1, name: "Basement", height_mm: 3500 },
      { level: 0, name: "Ground", height_mm: 4255 },
      { level: 1, name: "Upper" },
    ]);
    // An interchange file's listed storeys (0, 2 and an empty 3 here) each become a level, OpenPlan3D's
    // `level × 300` cm apart.
    const h = openPlan3dToArch(read("handoff-roomplan.json"));
    expect(h.report!.levels).toEqual([
      { level: 0, name: "Entry", height_mm: 6000 },
      { level: 2, name: "Loft", height_mm: 3000 },
      { level: 3, name: "Future Floor" },
    ]);
  });
});

describe("units", () => {
  it("converts centimetres and metres to millimetres on the 0.001 mm lattice", () => {
    const src = sourceOf(
      openPlan3dToArch(
        web({
          walls: [
            { id: "a", start: { x: -150.5, y: 0 }, end: { x: 123.4567, y: 0 }, thickness: 12.5, height: 270 },
            { id: "b", start: { x: 0, y: 10 }, end: { x: 100, y: 10 }, thickness: 0.00004 },
          ],
        }),
      ),
    );
    // No room encloses them, so (as in OpenPlan3D's envelope test) every wall counts as exterior.
    expect(src).toContain("wall id=a exterior thickness 125 height 2700 { (-1505, 0) (1234.567, 0) }");
    // 0.0004 mm: below the lattice, it rounds to 0 (and is still written, to be refused by compile).
    expect(src).toContain("wall id=b exterior thickness 0 height 2800");
    const m = sourceOf(
      openPlan3dToArch({
        openplanPrepared: true,
        openplanHandoffVersion: 1,
        walls: [
          {
            identifier: "w",
            dimensions: [1.2345678, 2.735, 0.1],
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.61728, 1.3675, 0.1, 1],
          },
        ],
      }),
    );
    // Centre 617.28 mm, half-length 617.2839 mm; OpenPlan3D's metres to centimetres first.
    expect(m).toContain("wall id=w exterior thickness 100 height 2735 { (-0.004, 100) (1234.564, 100) }");
  });
});

/** OpenPlan3D `doorSymbol`, single leaf: hinge and leaf end in plan cm. */
function upstreamSingleLeaf(wall: (typeof BOX)[number], position: number, width: number, left: boolean, flip: boolean) {
  const wdx = wall.end.x - wall.start.x;
  const wdy = wall.end.y - wall.start.y;
  const wlen = Math.hypot(wdx, wdy);
  const ux = wdx / wlen;
  const uy = wdy / wlen;
  const px = wall.start.x + wdx * position;
  const py = wall.start.y + wdy * position;
  const hw = width / 2;
  const wallAngle = Math.atan2(uy, ux);
  const swingDir = left ? 1 : -1;
  const sideFlip = flip ? -1 : 1;
  const hx = px + ux * hw * swingDir;
  const hy = py + uy * hw * swingDir;
  const sa = wallAngle + (swingDir === 1 ? Math.PI : 0);
  const ea = sa + -swingDir * sideFlip * (Math.PI / 2);
  return { hinge: { x: hx, y: hy }, leafEnd: { x: hx + width * Math.cos(ea), y: hy + width * Math.sin(ea) } };
}

/** OpenPlan3D `doorSymbol`, double/french: both leaves. */
function upstreamDoubleLeaves(
  wall: (typeof BOX)[number],
  position: number,
  width: number,
  left: boolean,
  flip: boolean,
) {
  const wdx = wall.end.x - wall.start.x;
  const wdy = wall.end.y - wall.start.y;
  const wlen = Math.hypot(wdx, wdy);
  const ux = wdx / wlen;
  const uy = wdy / wlen;
  const px = wall.start.x + wdx * position;
  const py = wall.start.y + wdy * position;
  const r = width / 2;
  const wallAngle = Math.atan2(uy, ux);
  const swingDir = left ? 1 : -1;
  const sideFlip = flip ? -1 : 1;
  return ([-1, 1] as const).map((side) => {
    const hx = px + ux * r * side;
    const hy = py + uy * r * side;
    const arcSwing = side === -1 ? swingDir : -swingDir;
    const sa = wallAngle + Math.PI * (side === 1 ? 1 : 0);
    const ea = sa + arcSwing * sideFlip * (Math.PI / 2);
    return { hinge: { x: hx, y: hy }, leafEnd: { x: hx + r * Math.cos(ea), y: hy + r * Math.sin(ea) } };
  });
}

const mm = (p: { x: number; y: number }) => ({ x: p.x * 10, y: p.y * 10 });
const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

describe("door hand and swing, as OpenPlan3D draws them", () => {
  for (const wallId of ["top-wall", "bottom-wall", "right-wall"]) {
    for (const left of [true, false]) {
      for (const flip of [false, true]) {
        it(`single door on the ${wallId} wall, swingDirection ${left ? "left" : "right"}, flipSide ${flip}`, () => {
          const door = {
            id: "d",
            wallId,
            position: 0.3,
            width: 80,
            type: "single",
            swingDirection: left ? "left" : "right",
            flipSide: flip,
          };
          const src = sourceOf(openPlan3dToArch(web({ walls: BOX, doors: [door] })));
          expect(src).toContain(`hinge near ${left ? "end" : "start"} swing ${flip ? "out" : "in"}`);
          const d = resolvePlan(src).ir!.elements.find((e) => e.kind === "door") as RDoor;
          const [leaf] = doorLeaves(d);
          const want = upstreamSingleLeaf(wallOf(wallId), 0.3, 80, left, flip);
          expect(close(leaf!.hinge, mm(want.hinge)), JSON.stringify([leaf, want])).toBe(true);
          expect(close(leaf!.leafEnd, mm(want.leafEnd)), JSON.stringify([leaf, want])).toBe(true);
        });

        it(`double door on the ${wallId} wall, swingDirection ${left ? "left" : "right"}, flipSide ${flip}`, () => {
          const door = {
            id: "d",
            wallId,
            position: 0.5,
            width: 160,
            type: "double",
            swingDirection: left ? "left" : "right",
            flipSide: flip,
          };
          const src = sourceOf(openPlan3dToArch(web({ walls: BOX, doors: [door] })));
          const d = resolvePlan(src).ir!.elements.find((e) => e.kind === "door") as RDoor;
          const got = doorLeaves(d);
          const want = upstreamDoubleLeaves(wallOf(wallId), 0.5, 160, left, flip).map((l) => ({
            hinge: mm(l.hinge),
            leafEnd: mm(l.leafEnd),
          }));
          for (const w of want) {
            const g = got.find((l) => close(l.hinge, w.hinge));
            expect(g, JSON.stringify([got, want])).toBeDefined();
            expect(close(g!.leafEnd, w.leafEnd), JSON.stringify([got, want])).toBe(true);
          }
        });
      }
    }
  }

  it("maps the other kinds to their ArchLang words", () => {
    const kinds = ["sliding", "pocket", "bifold", "garage", "opening", "french"].map((type, i) => ({
      id: `d${i}`,
      wallId: "top-wall",
      position: 0.15 + i * 0.14,
      width: 40,
      type,
      swingDirection: "left",
    }));
    const src = sourceOf(openPlan3dToArch(web({ walls: BOX, doors: kinds })));
    expect(src).toContain("door id=d0 sliding on top_wall at 600 width 400 head 2100");
    expect(src).toContain("door id=d1 pocket on top_wall at 1160 width 400 slide right head 2100");
    expect(src).toContain("door id=d2 bifold on top_wall at 1720 width 400 swing in head 2100");
    expect(src).toContain("door id=d3 garage on top_wall at 2280 width 400 head 2100");
    expect(src).toContain("opening id=d4 on top_wall at 2840 width 400 head 2100");
    expect(src).toContain("door id=d5 double on top_wall at 3400 width 400 swing in head 2100");
    expect(errorsOf(src)).toEqual([]);
  });
});

/** OpenPlan3D `drawStair`: a straight flight's foot is its local +y end; `rotation` turns it clockwise. */
function upstreamStairFoot(rotation: number): "top" | "right" | "bottom" | "left" {
  const a = (rotation * Math.PI) / 180;
  // local (0, 1) rotated as the canvas does: (x cos − y sin, x sin + y cos)
  const x = -Math.sin(a);
  const y = Math.cos(a);
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "bottom" : "top";
}
const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;

describe("stairs", () => {
  for (const rotation of [0, 90, 180, 270]) {
    for (const direction of ["up", "down"] as const) {
      it(`a straight flight turned ${rotation}°, ${direction}: same footprint, entered at the same end`, () => {
        const stair = {
          id: "s",
          position: { x: 200, y: 150 },
          rotation,
          width: 100,
          depth: 300,
          riserCount: 14,
          direction,
        };
        const r = openPlan3dToArch(web({ walls: BOX, stairs: [stair] }));
        const src = sourceOf(r);
        expect(errorsOf(src)).toEqual([]);
        expect(r.report!.counts.stairs).toEqual({ in: 1, mapped: 1, dropped: 0 });
        expect(r.report!.fields.map((f) => f.field)).toContain("floors[].stairs[].riserCount");
        const s = resolvePlan(src).ir!.elements.find((e) => e.kind === "stair") as RStair;
        const across = rotation === 90 || rotation === 270;
        expect({ at: s.at, size: s.size }).toEqual({
          at: across ? { x: 500, y: 1000 } : { x: 1500, y: 0 },
          size: across ? { w: 3000, h: 1000 } : { w: 1000, h: 3000 },
        });
        const foot = upstreamStairFoot(rotation);
        // `dir up` is entered at the foot; `dir down` at the head, the other end.
        expect(tailEdge(s)).toBe(direction === "up" ? foot : OPPOSITE[foot]);
      });
    }
  }

  it("drops the stairs ArchLang cannot draw as written, each with its reason", () => {
    const base = { position: { x: 200, y: 150 }, width: 100, depth: 300, riserCount: 14 };
    const r = openPlan3dToArch(
      web({
        walls: BOX,
        stairs: [
          { ...base, id: "l", stairType: "l-shaped" },
          { ...base, id: "t", rotation: 45 },
          { ...base, id: "w", width: 300, depth: 100 },
        ],
      }),
    );
    expect(r.report!.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["l", "its type is l-shaped, and only straight flights are imported"],
      ["t", "turned by a fraction of a quarter turn; ArchLang stairs run along the page's axes"],
      ["w", "it climbs along its shorter side, and an ArchLang flight runs along the longer one"],
    ]);
  });
});

describe("rooms, walls and metadata", () => {
  it("names a room from the record keyed by its walls, and drops a record no loop matches", () => {
    const r = openPlan3dToArch(
      web({
        walls: BOX,
        rooms: [
          {
            id: "r1",
            name: "Kitchen",
            walls: ["top-wall", "right-wall", "bottom-wall", "left-wall"],
            details: { roomType: "kitchen" },
          },
          { id: "r2", name: "Ghost", walls: ["top-wall"] },
        ],
      }),
    );
    const src = sourceOf(r);
    expect(src).toContain('room id=r1 at (0, 0) size 4000x3000 label "Kitchen" uses kitchen');
    expect(src).toContain("wall id=top_wall exterior");
    expect(r.report!.counts.rooms).toEqual({ in: 2, mapped: 1, dropped: 1 });
    expect(r.report!.dropped[0]).toMatchObject({ kind: "rooms", id: "r2" });
  });

  it("splits a T-junction as OpenPlan3D does, and marks the partition", () => {
    const r = openPlan3dToArch(
      web({ walls: [...BOX, { id: "mid", start: { x: 200, y: 0 }, end: { x: 200, y: 300 }, thickness: 10 }] }),
    );
    const src = sourceOf(r);
    expect(r.report!.rooms.detected).toBe(2);
    expect(src).toContain("wall id=mid partition");
    expect(src).toContain("room id=room_1 at (0, 0) size 2000x3000");
    expect(src).toContain("room id=room_2 at (2000, 0) size 2000x3000");
  });

  it("rewrites an id that is not an ArchLang identifier, and says so", () => {
    const r = openPlan3dToArch(web({ walls: BOX.map((w, i) => (i === 0 ? { ...w, id: "0-top wall" } : w)) }));
    expect(sourceOf(r)).toContain("wall id=w_0_top_wall ");
    expect(r.report!.ids).toContainEqual({ kind: "walls", from: "0-top wall", to: "w_0_top_wall" });
  });

  it("keeps a label's braces and quotes literal", () => {
    const src = sourceOf(
      openPlan3dToArch(
        web({
          walls: BOX,
          rooms: [{ id: "r", name: 'Den {x} "a"', walls: ["top-wall", "right-wall", "bottom-wall", "left-wall"] }],
        }),
      ),
    );
    expect(errorsOf(src)).toEqual([]);
    expect(src).toContain('label "Den \\{x\\} \\"a\\""');
  });
});

describe("malformed and hostile input returns diagnostics, never a throw", () => {
  const codes = (v: unknown) => openPlan3dToArch(v).diagnostics.map((d) => d.code);
  it("non-objects and missing arrays", () => {
    for (const v of [null, 42, "plan", [], {}, { id: "p" }, { id: "p", floors: [] }])
      expect(codes(v).length, JSON.stringify(v)).toBeGreaterThan(0);
    expect(codes({ id: "p", floors: [] })).toEqual(["E_IMPORT_FORMAT"]);
  });

  it("NaN written as a string, a wrong enum, a door on a missing wall", () => {
    const r = openPlan3dToArch(
      web({
        walls: [{ id: "a", start: { x: "NaN", y: 0 }, end: { x: 100, y: 0 }, thickness: 10 }],
        doors: [{ id: "d", wallId: "nope", position: 0.5, width: 80, type: "revolving" }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      "Invalid project: floors[0].walls[0].start.x must be a finite number in range.",
      "Invalid project: floors[0].doors[0].wallId must refer to a wall on the same floor.",
      "Invalid project: floors[0].doors[0].type has an unsupported value.",
    ]);
  });

  it("a coordinate past the modelling range", () => {
    const r = openPlan3dToArch(
      web({ walls: [{ id: "a", start: { x: 0, y: 0 }, end: { x: 1e300, y: 0 }, thickness: 10 }] }),
    );
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_OUT_OF_RANGE"]);
  });

  it("deep nesting where an object is expected", () => {
    let deep: unknown = {};
    for (let i = 0; i < 100_000; i++) deep = { x: deep };
    const r = openPlan3dToArch(web({ walls: BOX, rooms: [{ id: "r", walls: ["top-wall"], details: deep }] }));
    expect(r.ok).toBe(true);
    const r2 = openPlan3dToArch(web({ walls: [{ id: "a", start: deep, end: { x: 1, y: 0 }, thickness: 1 }] }));
    expect(r2.ok).toBe(false);
  });

  it("100,000 walls on one floor stop at the step budget", () => {
    const walls = Array.from({ length: 100_000 }, (_, i) => ({
      id: `w${i}`,
      start: { x: i, y: 0 },
      end: { x: i, y: 100 },
      thickness: 1,
    }));
    const r = openPlan3dToArch(web({ walls }));
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_IMPORT_LIMIT"]);
  });

  it("too many problems are capped", () => {
    const walls = Array.from({ length: 500 }, (_, i) => ({
      id: `w${i}`,
      start: { x: i, y: 0 },
      end: { x: i, y: 1 },
      thickness: -1,
    }));
    expect(codes(web({ walls })).length).toBe(100);
  });

  /** A prepared interchange room, 4 × 3 m (hand-written from SKILL.md §4's wall transform). */
  const roomWalls = [
    ["north", 1, 0, 2, 0, 4],
    ["east", 0, 1, 4, 1.5, 3],
    ["south", -1, 0, 2, 3, 4],
    ["west", 0, -1, 0, 1.5, 3],
  ].map(([identifier, dx, dz, cx, cz, len]) => ({
    identifier,
    dimensions: [len, 2.5, 0.1],
    transform: [dx, 0, dz, 0, 0, 1, 0, 0, -(dz as number), 0, dx, 0, cx, 1.25, cz, 1],
  }));
  const PROTO = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "isPrototypeOf"];

  it("prototype names as section labels are labels, never Object.prototype's members", () => {
    for (const label of PROTO) {
      const r = openPlan3dToArch({
        openplanPrepared: true,
        openplanHandoffVersion: 1,
        walls: roomWalls,
        sections: [{ center: [2, 0, 1.5], label }],
      });
      const src = sourceOf(r);
      expect(src, label).toContain(`label "${label}"`);
      expect(errorsOf(src), label).toEqual([]);
    }
  });

  it("prototype names as record keys and as ids", () => {
    // JSON text, so `__proto__` is an own key as JSON.parse makes it, not a prototype.
    const keys = PROTO.map((k) => `"${k}": 1`).join(", ");
    const doc = JSON.parse(`{
      "id": "proto", "name": "Proto", ${keys},
      "floors": [{ "id": "g", ${keys},
        "walls": [
          { "id": "constructor", "start": {"x":0,"y":0}, "end": {"x":400,"y":0}, "thickness": 10, ${keys} },
          { "id": "toString", "start": {"x":400,"y":0}, "end": {"x":400,"y":300}, "thickness": 10 },
          { "id": "__proto__", "start": {"x":400,"y":300}, "end": {"x":0,"y":300}, "thickness": 10 },
          { "id": "valueOf", "start": {"x":0,"y":300}, "end": {"x":0,"y":0}, "thickness": 10 }
        ],
        "doors": [{ "id": "hasOwnProperty", "wallId": "constructor", "position": 0.5, "width": 80, ${keys} }],
        "furniture": [{ "id": "isPrototypeOf", "catalogId": "constructor", "position": {"x":100,"y":100}, ${keys} }],
        "rooms": [{ "id": "propertyIsEnumerable", "name": "toString",
          "walls": ["constructor", "toString", "__proto__", "valueOf"],
          "details": { "roomType": "constructor", ${keys} }, ${keys} }]
      }]
    }`);
    const r = openPlan3dToArch(doc);
    const src = sourceOf(r);
    expect(errorsOf(src)).toEqual([]);
    expect(src).toContain('label "toString"');
    expect(src).toContain("wall id=__proto__ ");
    for (const f of r.report!.fields) expect(typeof f.reason, f.field).toBe("string");
    for (const d of r.diagnostics) expect(d.message).not.toContain("native code");
    expect(r.report!.fields).toContainEqual({
      field: "floors[].walls[].constructor",
      count: 1,
      reason: "not read by the importer",
    });
    expect(r.report!.dropped).toContainEqual(
      expect.objectContaining({
        kind: "furniture",
        id: "isPrototypeOf",
        reason: '"constructor" has no ArchLang fixture family',
      }),
    );
  });

  it("more storeys than an import writes are refused before any is built", () => {
    const walls = Array.from({ length: 100_000 }, (_, i) => ({
      identifier: `w${i}`,
      story: i % 20_000,
      dimensions: [1, 2.5, 0.1],
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i % 7, 1.25, 0, 1],
    }));
    const r = openPlan3dToArch({ openplanPrepared: true, openplanHandoffVersion: 1, walls });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_IMPORT_LIMIT"]);
    expect(r.diagnostics[0]!.message).toContain("20000 storeys");
    const floors = Array.from({ length: 201 }, (_, i) => ({ id: `f${i}`, level: i, walls: [] }));
    expect(codes({ id: "p", floors })).toEqual(["E_IMPORT_LIMIT"]);
  });

  it("as many storeys as an import writes, with many items each, stays on the step budget", () => {
    const walls = Array.from({ length: 100_000 }, (_, i) => ({
      identifier: `w${i}`,
      story: i % 200,
      dimensions: [1, 2.5, 0.1],
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i % 7, 1.25, 0, 1],
    }));
    const r = openPlan3dToArch({ openplanPrepared: true, openplanHandoffVersion: 1, walls });
    // 500 walls a storey cost their pairwise room search: either it fits or it is refused, by count.
    expect(r.ok || r.diagnostics.map((d) => d.code).join() === "E_IMPORT_LIMIT").toBe(true);
  });

  it("a position derived from in-range values but past the range is refused as it is written", () => {
    const r = openPlan3dToArch(
      web({
        walls: [{ id: "long", start: { x: -3_000_000, y: 0 }, end: { x: 3_000_000, y: 0 }, thickness: 10 }],
        doors: [{ id: "d", wallId: "long", position: 0.9, width: 80 }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.source).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_OUT_OF_RANGE"]);
  });
});
