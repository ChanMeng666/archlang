/**
 * `walls from rooms` (ADR 0028 §3, plan decision D5; card PS3.0 part B).
 *
 * Five halves:
 *  - the pure derivation (`src/room-tiling.ts`) on hand-made cases, the direction rule
 *    included;
 *  - probe agreement: over every corpus storey the derivation decides exactly what the PS3.0
 *    probe (`scripts/probe-rooms-tiling.ts` `decideGroup`, PR #222) decided, refusal for
 *    refusal (code and rooms named), and derives the same number of partition runs and ring
 *    vertices where both pass; and the probe's planted cases, written with the statement,
 *    raise the probe's codes through `compile()`;
 *  - the statement through `compile()`/`describe()`: every refusal code, coexistence with
 *    authored walls, `place`d instances, the element budget, the number domain, the parse
 *    refusals and the resolve order (a balcony rail sees the derived ring);
 *  - the twins: `examples/studio.arch` written with the form, and `examples/two-bed.arch` and
 *    `examples/relational.arch` (written with it since PS3.6) typed back by hand: the SVG and
 *    `lint()` are byte-identical, and every `describe()` difference of the studio is listed;
 *  - a derived wall is never an element, never authored, and carries `_derived`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint, planToJson } from "../src/index.js";
import { wallRef } from "../src/wall-ref.js";
import { planJsonArtifact } from "../src/cli/serialize.js";
import { NULL_WORLD } from "../src/world.js";
import { resolvePlan } from "../src/analyze.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { withStepMeter } from "../src/expr.js";
import type { ResolvedPlan, RRoom, RWall } from "../src/ir.js";
import { deriveWallsFromRooms, type TileCover, type TileRoom } from "../src/room-tiling.js";
import { CODES, ROOT, probeCorpus, probeSource, storeyCodes, type Code } from "../scripts/probe-rooms-tiling.js";

const plan = (body: string, grid = 1) => `plan "p" {\n  units mm\n  grid ${grid}\n${body}\n}\n`;
const R = (id: string, x: number, y: number, w: number, h: number): TileRoom => ({
  id,
  rect: { x0: x, y0: y, x1: x + w, y1: y + h },
});
const codesOf = (src: string): string[] =>
  [
    ...new Set(
      compile(src)
        .diagnostics.filter((d) => d.severity === "error")
        .map((d) => d.code!),
    ),
  ].sort();
const irOf = (src: string): ResolvedPlan => {
  const r = resolvePlan(src);
  if (!r.ir) throw new Error(r.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
  return r.ir;
};
const derived = (ir: ResolvedPlan): RWall[] => ir.walls.filter((w) => w._derived !== undefined);
const derive = (...args: Parameters<typeof deriveWallsFromRooms>) => {
  const run = withStepMeter(0, () => deriveWallsFromRooms(...args));
  if ("signal" in run) throw new Error("step budget");
  return run.value;
};

const STUDIO = [
  R("r_living", 0, 0, 4000, 6000),
  R("r_bed", 4000, 0, 3000, 3000),
  R("r_hall", 4000, 3000, 3000, 1400),
  R("r_bath", 4000, 4400, 3000, 1600),
];
const COURT = `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000`;

suite("the derivation (src/room-tiling.ts)", () => {
  it("derives the studio: one clockwise ring from the top-left corner, five partitions by source order", () => {
    const res = derive(STUDIO, [], [], 100);
    if (!res.ok) throw new Error("refused");
    expect(res.walls.map((w) => w.name)).toEqual([
      "exterior",
      "r_living|r_bed",
      "r_living|r_hall",
      "r_living|r_bath",
      "r_bed|r_hall",
      "r_hall|r_bath",
    ]);
    const ring = res.walls[0]!.pieces[0]!;
    expect(ring.closed).toBe(true);
    // smallest y, then x; clockwise on the page, first along +x
    expect(ring.points).toEqual([
      { x: 0, y: 0 },
      { x: 7000, y: 0 },
      { x: 7000, y: 6000 },
      { x: 0, y: 6000 },
    ]);
    // a partition runs from its smaller-y, then smaller-x, end: vertical along +y, horizontal along +x
    expect(res.walls[1]!.pieces[0]!.points).toEqual([
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
    ]);
    expect(res.walls[4]!.pieces[0]!.points).toEqual([
      { x: 4000, y: 3000 },
      { x: 7000, y: 3000 },
    ]);
  });

  it("an L-shaped union keeps every corner and starts at its top-left vertex", () => {
    const res = derive([R("a", 0, 1000, 2000, 2000), R("b", 2000, 0, 2000, 3000)], [], [], 100);
    if (!res.ok) throw new Error("refused");
    expect(res.walls[0]!.pieces[0]!.points).toEqual([
      { x: 2000, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
      { x: 0, y: 1000 },
      { x: 2000, y: 1000 },
    ]);
    expect(res.counts.ringVertices).toBe(6);
  });

  it("a courtyard ring runs counter-clockwise, first along +y; a void hole derives no ring", () => {
    const rooms = [
      R("n", 0, 0, 3000, 1000),
      R("s", 0, 2000, 3000, 1000),
      R("w", 0, 1000, 1000, 1000),
      R("e", 2000, 1000, 1000, 1000),
    ];
    const hole = { x0: 1000, y0: 1000, x1: 2000, y1: 2000 };
    const court = derive(rooms, [{ kind: "outdoor", rect: hole }], [], 100);
    if (!court.ok) throw new Error("refused");
    const inner = court.walls.find((w) => w.ring === "inner")!;
    expect(inner.name).toBe("exterior#2");
    expect(inner.pieces[0]!.points).toEqual([
      { x: 1000, y: 1000 },
      { x: 1000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 1000 },
    ]);
    const voided = derive(rooms, [{ kind: "void", rect: hole }], [], 100);
    if (!voided.ok) throw new Error("refused");
    expect(voided.walls.filter((w) => w.role === "exterior").map((w) => w.name)).toEqual(["exterior"]);
    // uncovered, half covered by each kind, and spilling: refused
    for (const covers of [
      [],
      [
        { kind: "outdoor", rect: { ...hole, x1: 1500 } },
        { kind: "void", rect: { ...hole, x0: 1500 } },
      ],
      [{ kind: "outdoor", rect: { ...hole, y1: 3000 } }],
    ] as TileCover[][]) {
      const r = derive(rooms, covers, [], 100);
      expect(r.ok ? [] : r.refusals.map((x) => x.code)).toEqual(["E_ROOMS_NOT_TILING"]);
    }
  });

  it("refuses with the rooms named: overlap, corner touch (a pinch), apart, short run, non-rectangle", () => {
    const refused = (rooms: TileRoom[]) => {
      const r = derive(rooms, [], [], 100);
      return r.ok ? [] : r.refusals.map((x) => [x.code, x.rooms]);
    };
    expect(refused([R("a", 0, 0, 1000, 1000), R("b", 999, 0, 1000, 1000)])).toEqual([["E_ROOMS_OVERLAP", ["a", "b"]]]);
    expect(refused([R("a", 0, 0, 1000, 1000), R("b", 1000, 1000, 1000, 1000)])).toEqual([
      ["E_ROOMS_NOT_TILING", ["a", "b"]],
    ]);
    expect(refused([R("a", 0, 0, 1000, 1000), R("b", 1001, 0, 1000, 1000)])).toEqual([
      ["E_ROOMS_NOT_TILING", ["a", "b"]],
    ]);
    expect(refused([R("a", 0, 0, 1000, 1000), R("b", 1000, 950, 1000, 1000)])).toEqual([
      ["E_PARTITION_TOO_SHORT", ["a", "b"]],
    ]);
    expect(refused([R("a", 0, 0, 1000, 1000), R("b", 1000, 900, 1000, 1000)])).toEqual([]);
    expect(refused([R("a", 0, 0, 1000, 1000), { id: "c", shape: "circle" }])).toEqual([
      ["E_ROOM_NOT_RECTANGLE", ["c"]],
    ]);
    // a 1 mm jog is a legal tiling whose ring follows the jog
    expect(refused([R("a", 0, 0, 1000, 1000), R("b", 1000, 1, 1000, 1000)])).toEqual([]);
  });

  it("coexistence: an authored wall exactly on a derived line takes over the shared span; 1 mm off it takes nothing", () => {
    const on = derive(STUDIO, [], [{ a: { x: 2000, y: 0 }, b: { x: 3000, y: 0 }, wallId: "n" }], 100);
    if (!on.ok) throw new Error("refused");
    const ring = on.walls[0]!;
    expect(ring.dropped).toEqual([{ x1: 2000, y1: 0, x2: 3000, y2: 0, by: "n" }]);
    // the remainder is one open run across the start vertex, in ring order
    expect(ring.pieces).toEqual([
      {
        name: "exterior",
        closed: false,
        points: [
          { x: 3000, y: 0 },
          { x: 7000, y: 0 },
          { x: 7000, y: 6000 },
          { x: 0, y: 6000 },
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
        ],
      },
    ]);
    // a partition split in two keeps its name on the first run and numbers the rest
    const mid = derive(STUDIO, [], [{ a: { x: 4000, y: 1000 }, b: { x: 4000, y: 2000 }, wallId: "m" }], 100);
    if (!mid.ok) throw new Error("refused");
    expect(mid.walls[1]!.pieces.map((p) => [p.name, p.points])).toEqual([
      [
        "r_living|r_bed",
        [
          { x: 4000, y: 0 },
          { x: 4000, y: 1000 },
        ],
      ],
      [
        "r_living|r_bed~2",
        [
          { x: 4000, y: 2000 },
          { x: 4000, y: 3000 },
        ],
      ],
    ]);
    const off = derive(STUDIO, [], [{ a: { x: 4001, y: 0 }, b: { x: 4001, y: 6000 }, wallId: "p" }], 100);
    if (!off.ok) throw new Error("refused");
    expect(off.walls.every((w) => w.dropped.length === 0)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------
// Probe agreement

/** The probe's per-group inputs, rebuilt from the same resolved IR the probe reads. */
function groupsOf(ir: ResolvedPlan): Map<string, { rooms: TileRoom[]; covers: TileCover[] }> {
  const out = new Map<string, { rooms: TileRoom[]; covers: TileCover[] }>();
  const get = (g: string) => {
    const v = out.get(g) ?? { rooms: [], covers: [] };
    out.set(g, v);
    return v;
  };
  for (const e of ir.elements) {
    const g = e._instance ?? "";
    if (e.kind === "room") {
      if (e._unplaced) continue;
      const r = e as RRoom;
      get(g).rooms.push(
        r.circle
          ? { id: r.id, shape: "circle" }
          : r.poly
            ? { id: r.id, shape: "polygon" }
            : R(r.id, r.at.x, r.at.y, r.size.w, r.size.h),
      );
    } else if (e.kind === "void") {
      get(g).covers.push({
        kind: "void",
        rect: { x0: e.at.x, y0: e.at.y, x1: e.at.x + e.size.w, y1: e.at.y + e.size.h },
      });
    } else if (e.kind === "outdoor") {
      get(g).covers.push(
        e.poly
          ? { kind: "outdoor", poly: e.poly }
          : { kind: "outdoor", rect: { x0: e.at.x, y0: e.at.y, x1: e.at.x + e.size.w, y1: e.at.y + e.size.h } },
      );
    }
  }
  return out;
}

suite("probe agreement (PS3.0 part A, PR #222)", () => {
  it("decides every corpus group as the probe did: the 15 refusals, codes and rooms, and the derived counts", () => {
    const report = probeCorpus(null);
    let groups = 0;
    const refused: string[] = [];
    const disagree: string[] = [];
    const byFile = new Map<string, typeof report.storeys>();
    for (const s of report.storeys) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);
    for (const [file, storeys] of byFile) {
      const abs = join(ROOT, file);
      const res = resolvePlan(readFileSync(abs, "utf8"), { world: makeNodeWorld(dirname(abs)) });
      const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir!];
      storeys.forEach((s, k) => {
        const mine = groupsOf(irs[k]!);
        let storeyRefused = false;
        for (const g of s.groups) {
          if (g.budget || g.rooms === 0) continue;
          groups++;
          const input = mine.get(g.group)!;
          const r = derive(input.rooms, input.covers, [], g.partitionMm);
          const got = r.ok ? [] : r.refusals.map((x) => `${x.code}:${[...x.rooms].sort().join(",")}`);
          const want = g.refusals.map((x) => `${x.code}:${[...x.rooms].sort().join(",")}`);
          if (got.join(";") !== want.join(";")) disagree.push(`${file} L${s.level} [${g.group}]: ${got} vs ${want}`);
          if (r.ok && g.derived) {
            const counts = `${r.counts.partitions}/${r.counts.ringVertices}`;
            const theirs = `${g.derived.partitionRuns}/${g.derived.ringVertices}`;
            if (counts !== theirs) disagree.push(`${file} L${s.level} [${g.group}]: counts ${counts} vs ${theirs}`);
          }
          if (!r.ok) storeyRefused = true;
        }
        if (storeyRefused) refused.push(`${file}#${s.level}`);
      });
    }
    expect(disagree).toEqual([]);
    expect(groups).toBeGreaterThan(279);
    // 15 until PS2.12 added four defect-corpus pavilions (radius-over-label, radius-over-piece
    // and their twins): one `circle` room each, which the form refuses as not a rectangle.
    expect(refused.length).toBe(19);
  });

  // The probe's own planted cases (test/rooms-tiling-probe.test.ts), written with the form:
  // `compile()` raises exactly the codes the probe decided.
  const planted: Array<[string, string, number?]> = [
    ["two rooms tiling a rectangle", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000`],
    ["overlap", `  room id=a at (0,0) size 4000x3000\n  room id=b at (3999,0) size 3000x3000`],
    ["a 1 mm gap", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4001,0) size 3000x3000`],
    ["a 1 mm jog", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,1) size 3000x3000`],
    ["corner touch", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,3000) size 3000x3000`],
    ["an uncovered hole", COURT],
    ["a courtyard", `${COURT}\n  outdoor patio at (3000,3000) size 3000x3000`],
    ["a part-covered hole", `${COURT}\n  outdoor patio at (3000,3000) size 2999x3000`],
    ["a spilling cover", `${COURT}\n  outdoor patio at (3000,3000) size 3000x6000`],
    [
      "a pinch",
      `  room id=w at (0,0) size 3000x9000\n  room id=s at (3000,6000) size 6000x3000\n  room id=e at (6000,3000) size 3000x3000\n  room id=t at (3000,0) size 3000x3000`,
    ],
    ["a short run", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,2950) size 3000x3000`],
    ["a run exactly the thickness", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,2900) size 3000x3000`],
    ["a thicker partition", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,2900) size 3000x3000`, 150],
    [
      // Slanted: a rectilinear ring is in the set since card L1, and the probe predates that.
      "a polygon room",
      `  room id=a polygon (0,0) (4000,0) (4000,3000) (1000,3000)\n  room id=b at (4000,0) size 3000x3000`,
    ],
    ["a circle room", `  room id=a circle at (2000,2000) radius 2000`],
  ];
  it.each(planted)("%s", (_n, body, t = 100) => {
    const probe = probeSource(
      plan(t === 100 ? body : `  wall partition thickness ${t} { (90000,0) (90000,1000) }\n${body}`),
    );
    if ("reason" in probe) throw new Error(probe.reason);
    const want = CODES.filter((c) => probe.some((s) => [...storeyCodes(s)].includes(c as Code)));
    expect(codesOf(plan(`${body}\n  walls from rooms exterior 200 partition ${t}`))).toEqual([...want].sort());
  });
});

// ------------------------------------------------------------------------------------------
// The statement

suite("the statement", () => {
  it("every refusal is a catalogued error on the statement, naming the rooms", () => {
    const stmt = "walls from rooms exterior 200 partition 100";
    const src = plan(`  room id=a at (0,0) size 4000x3000\n  room id=b at (5000,0) size 3000x3000\n  ${stmt}`);
    const d = compile(src).diagnostics.find((x) => x.code === "E_ROOMS_NOT_TILING")!;
    expect(d.message).toContain('"a"');
    expect(d.message).toContain('"b"');
    expect(src.slice(d.span!.start, d.span!.end)).toBe(stmt);
    expect(codesOf(plan(`  room id=a at (0,0) size 4000x3000\n  ${stmt}\n  ${stmt}`))).toEqual([
      "E_WALLS_FROM_ROOMS_DUP",
    ]);
    const bad = plan(`  room id=a at (0,0) size 4000x3000\n  ${stmt} { except terrace }`);
    const e = compile(bad).diagnostics.find((x) => x.code === "E_WALL_BETWEEN_ROOM")!;
    expect(bad.slice(e.span!.start, e.span!.end)).toBe("terrace");
    expect(codesOf(plan(`  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 0 partition 100`))).toEqual([
      "E_WALL_THICKNESS",
    ]);
  });

  it("`except` leaves a room out, polygon and circle rooms included", () => {
    const ir = irOf(
      plan(
        `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  room id=c circle at (20000,0) radius 1000\n  walls from rooms exterior 200 partition 100 { except c }`,
      ),
    );
    expect(derived(ir).map((w) => w.id)).toEqual(["exterior", "a|b"]);
    expect(
      codesOf(
        plan(
          `  room id=a at (0,0) size 4000x3000\n  room id=c circle at (20000,0) radius 1000\n  walls from rooms exterior 200 partition 100`,
        ),
      ),
    ).toEqual(["E_ROOM_NOT_RECTANGLE"]);
  });

  it("derived walls are walls, never elements, never authored, and carry `_derived`", () => {
    const ir = irOf(
      plan(
        `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  walls from rooms exterior 200 partition 100`,
      ),
    );
    expect(ir.elements.filter((e) => e.kind === "wall")).toEqual([]);
    expect(ir.walls.map((w) => [w.id, w.category, w.thickness, w._idAuthored, w._derived])).toEqual([
      ["exterior", "exterior", 200, false, { from: "rooms", ring: "outer" }],
      ["a|b", "partition", 100, false, { from: "rooms", between: ["a", "b"] }],
    ]);
  });

  it("openings host on derived walls by position and by category, after every authored wall", () => {
    const src = plan(
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  walls from rooms exterior 200 partition 100\n` +
        `  door id=d at (4000,1500) width 800 wall partition hinge left swing in\n  window id=w on exterior at 2000 width 1200`,
    );
    const r = compile(src);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const ir = irOf(src);
    const host = (id: string) => (ir.elements.find((e) => e.id === id) as { host?: { wallId: string } }).host?.wallId;
    expect([host("d"), host("w")]).toEqual(["a|b", "exterior"]);
    expect(ir.walls.find((w) => w.id === "a|b")!.openings.map((o) => o.ownerId)).toEqual(["d"]);
  });

  it("coexistence in the drawing: the authored wall wins its span and describe() reports the drop", () => {
    const src = plan(
      `  wall id=p partition thickness 150 { (4000,0) (4000,3000) }\n  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  walls from rooms exterior 200 partition 100`,
    );
    const ir = irOf(src);
    expect(ir.walls.map((w) => w.id)).toEqual(["p", "exterior"]);
    expect(describe(src).derived_walls).toEqual([
      { from: "rooms", name: "exterior" },
      { from: "rooms", name: "a|b", between: ["a", "b"], dropped: [{ x1: 4000, y1: 0, x2: 4000, y2: 3000, by: "p" }] },
    ]);
    const off = irOf(src.replace("(4000,0) (4000,3000)", "(4001,0) (4001,3000)"));
    expect(off.walls.map((w) => w.id)).toEqual(["p", "exterior", "a|b"]);
  });

  it("a `place`d component derives in its own frame; its walls are namespaced and carried", () => {
    const src =
      `plan "p" {\n  units mm\n  component unit() {\n    room id=a at (0,0) size 4000x3000\n    room id=b at (4000,0) size 3000x3000\n    walls from rooms exterior 200 partition 100\n  }\n` +
      `  place unit() as west at (0,0)\n  place unit() as east at (20000,0) rotate 90\n}\n`;
    const ir = irOf(src);
    expect(ir.walls.map((w) => w.id)).toEqual(["west.exterior", "west.a|b", "east.exterior", "east.a|b"]);
    const east = ir.walls.find((w) => w.id === "east.a|b")!;
    expect(east._instance).toBe("east");
    // rotate 90: the vertical partition x=4000, y 0..3000 becomes horizontal
    expect(east.points[0]!.y).toBe(east.points[1]!.y);
    expect(describe(src).derived_walls!.map((r) => r.name)).toEqual([
      "west.exterior",
      "west.a|b",
      "east.exterior",
      "east.a|b",
    ]);
  });

  it("authored walls splitting a derived run are counted before the pieces exist (red team round 1, B1)", () => {
    const plant = (n: number) =>
      plan(
        `  room id=a at (0,0) size 4000x20000\n  room id=b at (4000,0) size 3000x20000\n  walls from rooms exterior 200 partition 100\n` +
          `  for i in 0..${n} {\n    wall partition thickness 1 { (4000, 4*i+1) (4000, 4*i+3) }\n  }`,
      );
    // 100 cuts: 101 partition pieces + the ring, well inside the budget
    expect(derived(irOf(plant(100))).length).toBe(102);
    // 4,900 cuts: 4,900 authored walls + 4,902 derived would be twice MAX_ELEMENTS
    const r = compile(plant(4900));
    const limit = r.diagnostics.filter((d) => d.code === "E_ELEMENT_LIMIT");
    expect(limit.length).toBe(1);
    const src = plant(4900);
    expect(src.slice(limit[0]!.span!.start).startsWith("walls from rooms")).toBe(true);
    expect(limit[0]!.message).toMatch(/derives none/);
  });

  it("a statement with no room to derive from refuses: E_WALLS_FROM_NO_ROOMS", () => {
    expect(codesOf(plan("  walls from rooms exterior 200 partition 100"))).toEqual(["E_WALLS_FROM_NO_ROOMS"]);
    expect(
      codesOf(plan("  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100 { except a }")),
    ).toEqual(["E_WALLS_FROM_NO_ROOMS"]);
  });

  it("thickness is judged as an authored wall's is (snapped, else as written; positive)", () => {
    const authored = (t: string) =>
      codesOf(
        plan(
          `  room id=a at (0,0) size 4000x3000\n  wall exterior thickness ${t} { (0,0) (4000,0) (4000,3000) (0,3000) close }`,
        ),
      );
    const derivedOk = (t: string) =>
      codesOf(plan(`  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior ${t} partition 100`));
    for (const t of ["0", "-5", "0.4", "200"]) expect(derivedOk(t)).toEqual(authored(t));
  });

  it("counts toward the element budget at expansion: 10 per room of its group", () => {
    const many = (n: number) =>
      plan(
        `  for i in 0..${n} {\n    room at (i * 1000, 0) size 1000x1000\n  }\n  walls from rooms exterior 200 partition 100`,
      );
    expect(codesOf(many(400))).toEqual([]);
    const d = compile(many(460)).diagnostics.filter((x) => x.code === "E_ELEMENT_LIMIT");
    expect(d.length).toBe(1);
    expect(d[0]!.message).toContain("walls from rooms");
  });

  it("past the modelling range the statement is dropped with its walls", () => {
    const src = plan(
      `  room id=a at (33550000,0) size 4432x1000\n  walls from rooms exterior 200 partition 100\n  door at (33552000,1000) width 800 wall exterior`,
    );
    const { ir, diagnostics } = resolve(parse(src).plan!);
    // reported once, at the statement; the room (in range) stays, the walls and the door go
    expect(diagnostics.filter((d) => d.code === "E_OUT_OF_RANGE").length).toBe(1);
    expect(
      src.slice(diagnostics.find((d) => d.code === "E_OUT_OF_RANGE")!.span!.start).startsWith("walls from rooms"),
    ).toBe(true);
    expect(ir.walls).toEqual([]);
    expect(ir.elements.map((e) => e.kind)).toEqual(["room"]);
  });

  it("the body's clause list is closed at `except`, `open between` and `between … thickness`", () => {
    const parseError = (body: string) =>
      compile(
        plan(`  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100 { ${body} }`),
      ).diagnostics.find((d) => d.code === "E_PARSE")?.message;
    expect(parseError("open between a and b")).toBeUndefined();
    expect(parseError("open id=o between a and b width 900")).toBeUndefined();
    expect(parseError("between a and b thickness 200")).toBeUndefined();
    expect(parseError("between a and b")).toMatch(/Expected "thickness"/);
    expect(parseError("open between a b")).toMatch(/Expected "and"/);
    expect(parseError("party between a and b")).toMatch(/Expected "except", "open" or "between"/);
    expect(parseError("except")).toMatch(/at least one room/);
  });

  it("`dims auto` on the line before keeps its default mode and leaves `walls` to the statement", () => {
    const ir = irOf(
      plan(`  dims auto\n  walls from rooms exterior 200 partition 100\n  room id=a at (0,0) size 4000x3000`),
    );
    expect(ir.autoDims).toBe("all");
    expect(derived(ir).length).toBe(1);
    expect(irOf(plan(`  dims auto walls\n  room id=a at (0,0) size 4000x3000`)).autoDims).toBe("walls");
  });

  it("a balcony's derived rail is read against the derived ring (the outdoor resolves early, then rewalls)", () => {
    const ir = irOf(
      plan(
        `  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100\n  outdoor balcony at (1000,3000) size 2000x1000`,
      ),
    );
    const b = ir.elements.find((e) => e.kind === "outdoor") as { rail?: string[] };
    expect(b.rail).toEqual(expect.not.arrayContaining(["top"]));
    expect(b.rail!.length).toBe(3);
  });

  it("`roof overhang` follows the outer ring only, not a courtyard ring", () => {
    const r = compile(
      plan(
        `${COURT}\n  outdoor patio at (3000,3000) size 3000x3000\n  walls from rooms exterior 200 partition 100\n  roof overhang 500`,
      ),
    );
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("a plan without the statement resolves exactly as before (no derived walls, no describe key)", () => {
    const src = readFileSync(join(ROOT, "examples/studio.arch"), "utf8");
    expect(describe(src).derived_walls).toBeUndefined();
    expect(describe(src).freedom.walls).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------------
// Addressing: no hint, fix or suggestion quotes or edits a derived wall (ADR 0028 §3)

suite("addressing: lint and compile never quote or edit a derived wall", () => {
  const BAD = plan(
    `  dims auto all\n  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses bedroom\n` +
      `  walls from rooms exterior 200 partition 100\n` +
      `  door id=d1 at (4000,150) width 800 wall partition hinge left swing in\n` +
      `  door id=d2 pocket at (4000,2300) width 800 wall partition\n` +
      `  window id=w1 at (1000,0) width 1200 wall exterior\n  window id=w2 at (1900,0) width 1200 wall exterior\n` +
      `  door id=d3 at (2000,3400) width 800\n  furniture bed at (3500,500) size 1000x2000`,
  );
  const stmt = { start: BAD.indexOf("walls from rooms"), end: BAD.indexOf("partition 100") + "partition 100".length };
  const quotesDerived = (text: string) =>
    /a\|b|exterior#|"exterior"|on exterior#/.test(text) || /\bon a\|b\b/.test(text);
  /** Every text a diagnostic carries, raw (not JSON, which escapes the quotes the patterns read). */
  const textsOf = (d: ReturnType<typeof lint>[number]): string =>
    [
      d.message,
      ...(d.hints ?? []),
      ...(d.fixes ?? []).flatMap((f) => [f.title, ...f.edits.map((e) => e.newText)]),
      ...(d.relatedSpans ?? []).map((r) => r.message ?? ""),
    ].join("\n");

  it("the rules that name a host reach derived walls (non-vacuous)", () => {
    const codes = new Set(lint(BAD).map((d) => d.code));
    for (const c of ["W_FURNITURE_WALL_COLLISION", "W_OPENING_AT_JUNCTION", "W_OPENING_OVERLAP"])
      expect(codes).toContain(c);
    // and they name the walls by relation
    const texts = lint(BAD).flatMap((d) => [d.message, ...(d.hints ?? [])]);
    expect(texts.some((t) => t.includes('the partition between "a" and "b"'))).toBe(true);
    expect(texts.some((t) => t.includes("the exterior wall derived from the rooms"))).toBe(true);
  });

  it("no message, hint or fix of lint() or compile() quotes a derived wall's internal name or edits the statement", () => {
    const all = [...lint(BAD), ...compile(BAD).diagnostics];
    for (const d of all) {
      const text = textsOf(d);
      expect(quotesDerived(text), `${d.code}: ${text}`).toBe(false);
      for (const f of d.fixes ?? []) {
        for (const e of f.edits)
          expect(e.span.end <= stmt.start || e.span.start >= stmt.end, `${d.code} edits the statement`).toBe(true);
      }
    }
  });

  it("the patterns bite: a planted internal name is caught (non-vacuous)", () => {
    expect(quotesDerived('both are on wall "exterior".')).toBe(true);
    expect(quotesDerived("door on a|b at 50%")).toBe(true);
    expect(quotesDerived('nearest wall "exterior" is here')).toBe(true);
  });

  it("a collision with a derived wall offers no `against wall <id>`", () => {
    const hint = lint(BAD)
      .find((d) => d.code === "W_FURNITURE_WALL_COLLISION")!
      .hints!.join("\n");
    expect(hint).not.toContain("against wall");
    expect(hint).toContain("anchor <edge> flush");
  });

  it("an authored wall cannot take the derived ring's name: E_WALL_ID_RESERVED on the id", () => {
    const src = plan(
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  wall id=exterior partition thickness 100 { (2000,0) (2000,3000) }\n  walls from rooms exterior 200 partition 100`,
    );
    const d = compile(src).diagnostics.filter((x) => x.code === "E_WALL_ID_RESERVED");
    expect(d.length).toBe(1);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("exterior");
    // without the statement the id is an ordinary id
    expect(codesOf(src.replace("  walls from rooms exterior 200 partition 100\n", ""))).toEqual([]);
    // two walls sharing an id are told apart by their segment
    const ir = resolve(parse(src).plan!).ir;
    const derivedRing = ir.walls.find((w) => w._derived !== undefined && w.id === "exterior")!;
    expect(wallRef(ir.walls, { wallId: "exterior", a: derivedRing.points[0], b: derivedRing.points[1] })).toBe(
      "the exterior wall derived from the rooms",
    );
    expect(wallRef(ir.walls, { wallId: "exterior", a: { x: 2000, y: 0 }, b: { x: 2000, y: 3000 } })).toBe(
      'wall "exterior"',
    );
  });

  it("an off-wall opening is never attached to a derived wall by a fix", () => {
    const off = compile(BAD).diagnostics.filter((d) => /OFF_WALL|NOT_ON_WALL/.test(d.code ?? ""));
    expect(off.length).toBeGreaterThan(0);
    for (const d of off) expect(d.fixes ?? []).toEqual([]);
  });
});

suite("Plan JSON never drops a placed component's derived walls (red team round 1, S2)", () => {
  it("carries the statement in the component's body (PS3.9); a root statement projects", () => {
    const src = `plan "p" {\n  units mm\n  component unit() {\n    room id=a at (0,0) size 4000x3000\n    walls from rooms exterior 200 partition 100\n  }\n  place unit() as west at (0,0)\n}\n`;
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Refused here once (E_JSON_DERIVED_IN_INSTANCE, PR #223), carried now: the statement is in
    // the body and its walls are in no `walls[]`. What is still refused (a nested place,
    // differing bodies, an imported component) is pinned in test/plan-json-instances.test.ts.
    const r = planToJson(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.json!.components).toEqual([
      {
        name: "unit",
        body: expect.objectContaining({ walls: [], walls_from_rooms: { exterior: 200, partition: 100 } }),
      },
    ]);
    expect(r.json!.walls).toEqual([]);
    expect(
      planToJson(plan("  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100")).json,
    ).toBeDefined();
    const art = planJsonArtifact(src, NULL_WORLD, "all", [], []);
    expect(art.error).toBeUndefined();
    expect(art.diagnostics).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------
// The widening drill and the class-2 defect corpus (ADR 0028 Acceptance)

suite("the widening drill", () => {
  const form = readFileSync(join(ROOT, "test/walls-from-rooms/widen.arch"), "utf8");
  const widened = form.replace("let AW = 4000", "let AW = 4500");
  it("widening a room by 500 mm moves the shell, the partition, its door and the window with it", () => {
    expect(widened).not.toBe(form);
    // byte for byte the drawing a careful author gets by moving every literal by hand
    const byHand = readFileSync(join(ROOT, "test/walls-from-rooms/widen-after-authored.arch"), "utf8");
    expect(compile(widened).svg).toBe(compile(byHand).svg);
    expect(compile(widened).svg).not.toBe(compile(form).svg);
    const ir = irOf(widened);
    expect(derived(ir).map((w) => [w.id, w.points])).toEqual([
      [
        "exterior",
        [
          { x: 0, y: 0 },
          { x: 8500, y: 0 },
          { x: 8500, y: 5000 },
          { x: 0, y: 5000 },
        ],
      ],
      [
        "a|b",
        [
          { x: 4500, y: 0 },
          { x: 4500, y: 5000 },
        ],
      ],
    ]);
  });
  it("the wall-first repro's defects cannot arise: no room leaves the shell, no partition is left inside a room", () => {
    for (const src of [form, widened]) {
      const codes = lint(src).map((d) => d.code);
      for (const c of ["W_ROOM_OUTSIDE_SHELL", "W_ROOM_DISCONNECTED", "W_BOUNDARY_NO_WALL", "W_FLOOR_UNASSIGNED"])
        expect(codes).not.toContain(c);
    }
  });
});

suite("class-2 defect corpus (space not enclosed) written with `walls from rooms`", () => {
  const DIR = "test/defect-corpus/space-not-enclosed";
  const CLASS2 = ["W_ROOM_NOT_ENCLOSED", "W_FLOOR_UNASSIGNED", "W_BOUNDARY_NO_WALL", "W_ROOM_OUTSIDE_SHELL"];
  const REFUSALS = ["E_ROOMS_OVERLAP", "E_ROOMS_NOT_TILING", "E_PARTITION_TOO_SHORT", "E_ROOM_NOT_RECTANGLE"];
  /** Every authored wall removed, every reference to one re-pointed at its category (an
   *  opening placed `on <wall> at …` is written at the point it resolved to: a derived wall
   *  has no id to attach to, and relational `between` hosting is plan card PS3.4), and the
   *  statement written with the plan's own thicknesses. */
  function rewrite(original: string): string {
    let src = original;
    const hosted = irOf(original).elements.filter(
      (e): e is Extract<typeof e, { kind: "door" | "window" | "opening" }> =>
        (e.kind === "door" || e.kind === "window" || e.kind === "opening") && e.span !== undefined,
    );
    for (const e of [...hosted].sort((p, q) => q.span!.start - p.span!.start)) {
      const stmt = src.slice(e.span!.start, e.span!.end);
      const moved = stmt.replace(/\bon \S+ at \S+/, `at (${e.at.x}, ${e.at.y})`);
      src = src.slice(0, e.span!.start) + moved + src.slice(e.span!.end);
    }
    const cats = new Map<string, string>();
    let ext = 200;
    let part = 100;
    const lines = src.split("\n").filter((l) => {
      const m = /^\s*wall\s+(?:id=(\S+)\s+)?(\S+)\s+thickness\s+(\d+)/.exec(l);
      if (!m) return true;
      if (m[1]) cats.set(m[1], m[2]!);
      if (m[2] === "exterior") ext = Number(m[3]);
      else part = Number(m[3]);
      return false;
    });
    let out = lines.join("\n");
    for (const [id, cat] of cats) out = out.replace(new RegExp(`\\b(wall|on) ${id}\\b`, "g"), `$1 ${cat}`);
    return out.replace(/\n}\s*$/, `\n  walls from rooms exterior ${ext} partition ${part}\n}\n`);
  }
  // A case that already says `walls from rooms` (G5's wall-end-short-derived: an authored wall beside
  // a derived one) has nothing to rewrite, and a second statement is E_WALLS_FROM_ROOMS_DUP.
  const cases = readdirSync(join(ROOT, DIR)).filter(
    (f) =>
      f.endsWith(".arch") &&
      !f.endsWith(".clean.arch") &&
      !/^\s*walls from rooms/m.test(readFileSync(join(ROOT, DIR, f), "utf8")),
  );
  const outcome = new Map<string, string>();
  it.each(cases)("%s: refused, or gains the wall", (f) => {
    const before = readFileSync(join(ROOT, DIR, f), "utf8");
    const expectCode = /# expect: (\S+)/.exec(before)![1]!;
    expect(lint(before).map((d) => d.code)).toContain(expectCode);
    const src = rewrite(before);
    expect(src).toContain("walls from rooms");
    expect(src).not.toMatch(/^\s*wall\s/m);
    const errors = compile(src)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.code!);
    if (errors.length > 0) {
      expect(
        errors.every((c) => REFUSALS.includes(c)),
        errors.join(", "),
      ).toBe(true);
      outcome.set(f, `refused ${errors.join(",")}`);
    } else {
      const codes = lint(src).map((d) => d.code);
      for (const c of CLASS2) expect(codes, `${f} still reports ${c}`).not.toContain(c);
      expect(derived(irOf(src)).length).toBeGreaterThan(0);
      outcome.set(f, "gains the walls");
    }
  });
  it("both outcomes occur (the corpus is not vacuous either way)", () => {
    expect(outcome.size).toBe(cases.length);
    expect([...outcome.values()].some((v) => v.startsWith("refused"))).toBe(true);
    expect([...outcome.values()].some((v) => v === "gains the walls")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------
// The twins

suite("twins of the examples (the swap-back law)", () => {
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
  const pairs: Array<[string, string]> = [
    ["examples/studio.arch", "test/walls-from-rooms/studio.arch"],
    // Since PS3.6 these two examples are the derived side and the twins are hand-typed
    // (walls as points, openings `on <wall> at <mm>`): the swap-back law read the other way.
    ["examples/two-bed.arch", "test/walls-from-rooms/two-bed.arch"],
    ["examples/relational.arch", "test/walls-from-rooms/relational.arch"],
  ];
  it.each(pairs)("%s: the SVG is byte-identical", (a, b) => {
    expect(compile(read(b)).svg).toBe(compile(read(a)).svg);
  });

  it.each(pairs)("%s: lint() is identical but for the spans the edited prose shifted", (a, b) => {
    const strip = (src: string) => lint(src).map(({ span: _s, fixes: _f, ...d }) => d);
    expect(strip(read(b))).toEqual(strip(read(a)));
  });

  it("describe(): the differences are the new facts and the host names, nothing else", () => {
    const [a, b] = [describe(read(pairs[0]![0])), describe(read(pairs[0]![1]))];
    const { derived_walls, freedom, access, ...rest } = b;
    expect(rest).toEqual((({ freedom: _f, access: _a, ...r }) => r)(a));
    expect(derived_walls!.length).toBe(6);
    expect(freedom.walls).toEqual({ total: 6, derived: 6, absolute: 0 });
    expect({ ...freedom, walls: undefined }).toEqual({ ...a.freedom, walls: undefined });
    // access edges differ only in the host's name: `exterior_1` → `exterior`, `partition_3` → `r_bed|r_hall`, …
    const hosts = (x: typeof access) => x.edges.map((e) => (e as { hostWallId?: string }).hostWallId);
    expect(hosts(access)).toEqual(["exterior", "r_bed|r_hall", "r_hall|r_bath", "r_living|r_hall"]);
    const noHost = (x: typeof access) => ({ ...x, edges: x.edges.map(({ hostWallId: _h, ...e }) => e) });
    expect(noHost(access)).toEqual(noHost(a.access));
  });
});
