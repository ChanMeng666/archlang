/**
 * The trim of doorways and windows (product-roadmap card RM8.6; design
 * `docs/plans/product-roadmap/design/visual-language.md` §2.1, §2.2): a minimal plan for each kind
 * of detail, its parts and its ledger rows; then, over the corpus, every trim shell closed, square
 * and in whole micrometres, and the side the 3D calls a window's outside the side the core's own
 * drawing puts the sill on (the rule is written again here, so the two are held together).
 */
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, insideOf, type Mesh3D, type MeshNode, OPENING_DETAIL } from "../src/index.js";
import { openEdges, signedVolume } from "../src/node.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

const MM = 1000;
const SHELL = `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }`;
const ROOM = `room id=r at (0,0) size 6000x4000 label "R" uses living`;
const plan = (body: string): string => `plan "t" { units mm ${body} }`;

function mesh(source: string): Mesh3D {
  const r = adaptPlan(source, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  return buildMesh(r.scene);
}
const node = (m: Mesh3D, key: string): MeshNode | undefined => m.nodes.find((n) => n.key === key);
const rows = (m: Mesh3D, id: string) =>
  m.assumptions.filter((a) => a.id === id && /^(door|window)-/.test(a.rule)).map((a) => [a.rule, a.value]);

/** [min, max] of the shells' x, y (up) and z (plan y), µm. */
function extent(shells: MeshNode["shells"]): [[number, number], [number, number], [number, number]] {
  const e: Array<[number, number]> = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ];
  for (const s of shells)
    s.positions.forEach((v, i) => {
      const r = e[i % 3] as [number, number];
      r[0] = Math.min(r[0], v);
      r[1] = Math.max(r[1], v);
    });
  return e as [[number, number], [number, number], [number, number]];
}

describe("a doorway's lining and casing (§2.1)", () => {
  // A 900 mm hinged door in the shell's bottom run (y = 4000, the room above it): t = 200 mm.
  const door = mesh(plan(`${SHELL} ${ROOM} door id=d at (3000,4000) width 900 wall shell swing in`));

  it("sizes every piece off the host's thickness: l = 0.1 t, c = 0.35 t, p = 0.1 t, clamped", () => {
    expect([OPENING_DETAIL.lining(200), OPENING_DETAIL.casingWidth(200), OPENING_DETAIL.casingProud(200)]).toEqual([
      20, 70, 20,
    ]);
    // The clamps: a 60 mm stud wall and a 600 mm masonry one.
    expect([OPENING_DETAIL.lining(60), OPENING_DETAIL.casingWidth(60), OPENING_DETAIL.casingProud(60)]).toEqual([
      12, 50, 10,
    ]);
    expect([OPENING_DETAIL.lining(600), OPENING_DETAIL.casingWidth(600), OPENING_DETAIL.casingProud(600)]).toEqual([
      25, 90, 20,
    ]);
    expect(rows(door, "d")).toEqual([
      ["door-lining-default", { thickness: 20, slot: 40, head: true }],
      ["door-casing-default", { width: 70, proud: 20, head: true }],
    ]);
  });

  it("lines the jambs and the head in two halves, a 40 mm slot left for the leaf, which keeps its length", () => {
    const lining = node(door, "L1/door:d:lining") as MeshNode;
    expect(lining.shells.length).toBe(6);
    const [x, y, z] = extent(lining.shells);
    expect([x, y, z]).toEqual([
      [2_550_000, 3_450_000],
      [0, 2_100_000],
      [3_900_000, 4_100_000],
    ]);
    // No lining in the slot: every shell lies wholly on one side of it.
    for (const s of lining.shells) {
      const [, , [z0, z1]] = extent([s]);
      expect(z1 <= 3_980_000 || z0 >= 4_020_000, `${z0}…${z1}`).toBe(true);
    }
    // The leaf: jamb to jamb as before (the core's `doorLeaves` leaf), in the slot.
    const [lx, , lz] = extent((node(door, "L1/door:d") as MeshNode).shells);
    expect([lx, lz]).toEqual([
      [2_550_000, 3_450_000],
      [3_980_000, 4_020_000],
    ]);
  });

  it("cases both faces: legs from the floor to the head, the head piece over the full width", () => {
    const casing = node(door, "L1/door:d:casing") as MeshNode;
    expect(casing.shells.length).toBe(6);
    const [x, y, z] = extent(casing.shells);
    expect([x, y, z]).toEqual([
      [2_480_000, 3_520_000],
      [0, 2_170_000],
      [3_880_000, 4_120_000],
    ]);
  });

  it("leaves out a barn door's casing on the face its panel hangs on, and a garage door's altogether", () => {
    const barn = mesh(plan(`${SHELL} ${ROOM} door id=d barn at (3000,4000) width 900 wall shell swing out`));
    expect((node(barn, "L1/door:d:casing") as MeshNode).shells.length).toBe(3);
    // `swing out` is the face away from the room (z > 4100 mm): no casing there.
    expect(extent((node(barn, "L1/door:d:casing") as MeshNode).shells)[2]).toEqual([3_880_000, 3_900_000]);
    expect(rows(barn, "d").at(-1)).toEqual(["door-casing-omitted", ["-face:barn"]]);
    const garage = mesh(plan(`${SHELL} ${ROOM} door id=d garage at (3000,4000) width 2400 wall shell`));
    expect(node(garage, "L1/door:d:casing")).toBeUndefined();
    expect(node(garage, "L1/door:d:lining")).toBeDefined();
    expect(rows(garage, "d").at(-1)).toEqual(["door-casing-omitted", "garage"]);
  });

  it("leaves out a leg that would stand in another wall (a doorway at a corner), never shortening it", () => {
    const corner = mesh(plan(`${SHELL} ${ROOM} door id=d at (550,4000) width 900 wall shell swing in`));
    const casing = node(corner, "L1/door:d:casing") as MeshNode;
    expect(casing.shells.length).toBe(5);
    // The inside face's leg toward x = 0 would stand in the shell's left run: left out, and the
    // head piece stops at that jamb.
    expect(rows(corner, "d").at(-1)).toEqual(["door-casing-omitted", ["+face:end:wall"]]);
    for (const s of casing.shells) {
      const [[x0, x1]] = extent([s]);
      expect(x1 - x0 === 70 * MM || x1 - x0 >= 900 * MM, `${x0}…${x1}`).toBe(true);
    }
  });

  it("cases a cased opening too, its lining whole across the wall (no leaf, no slot)", () => {
    const m = mesh(plan(`${SHELL} ${ROOM} opening id=o at (3000,4000) width 900 wall shell`));
    const lining = node(m, "L1/opening:o:lining") as MeshNode;
    expect(extent(lining.shells)[2]).toEqual([3_900_000, 4_100_000]);
    expect(node(m, "L1/opening:o:casing")).toBeDefined();
  });
});

describe("a window's reveal, sill and board (§2.2)", () => {
  // A 1200 mm window in the shell's top run (y = 0): the room is below it, the outside above.
  const win = mesh(plan(`${SHELL} ${ROOM} window id=w at (3000,0) width 1200 wall shell`));

  it("sizes them off the host's thickness, the sill's nose and horns the core's 0.2 t", () => {
    expect(rows(win, "w")).toEqual([
      ["window-inside-probe", "+normal"],
      ["window-reveal-lining", { thickness: 15, head: true }],
      ["window-sill-exterior", { thickness: 30, projection: 40, horn: 40, mitred: [false, false] }],
      ["window-board-interior", { thickness: 20, overhang: 20 }],
    ]);
  });

  it("puts the sill outside, proud of the face and past each jamb, and the board inside", () => {
    const [sx, sy, sz] = extent((node(win, "L1/window:w:sill") as MeshNode).shells);
    // The sill: from the frame's outer face (30 mm off the centreline) to 40 mm past the outer face.
    expect([sx, sy, sz]).toEqual([
      [2_360_000, 3_640_000],
      [900_000, 930_000],
      [-140_000, -30_000],
    ]);
    const [bx, by, bz] = extent((node(win, "L1/window:w:board") as MeshNode).shells);
    expect([bx, by, bz]).toEqual([
      [2_380_000, 3_620_000],
      [900_000, 920_000],
      [30_000, 120_000],
    ]);
  });

  it("lines the inside half of the jambs and the head, standing on the board", () => {
    const reveal = node(win, "L1/window:w:reveal") as MeshNode;
    expect(reveal.shells.length).toBe(3);
    expect(extent(reveal.shells)).toEqual([
      [2_400_000, 3_600_000],
      [920_000, 2_100_000],
      [30_000, 100_000],
    ]);
  });

  it("an interior window has a reveal on both halves and no sill; a free-standing wall's nothing", () => {
    const inner = mesh(
      plan(
        `${SHELL} room id=a at (0,0) size 3000x4000 label "A" uses living room id=b at (3000,0) size 3000x4000 label "B" uses office wall id=p partition thickness 100 { (3000,0) (3000,4000) } window id=w at (3000,2000) width 1000 wall p`,
      ),
    );
    expect((node(inner, "L1/window:w:reveal") as MeshNode).shells.length).toBe(6);
    expect(node(inner, "L1/window:w:sill")).toBeUndefined();
    expect(rows(inner, "w")).toContainEqual(["window-sill-omitted", "interior window"]);
    const free = mesh(
      plan(`wall id=f exterior thickness 200 { (0,0) (4000,0) } window id=w at (2000,0) width 1000 wall f`),
    );
    expect(free.nodes.filter((n) => n.id === "w").map((n) => n.part)).toEqual(["frame", "glass"]);
    expect(rows(free, "w")).toEqual([["window-inside-probe", "neither"]]);
  });

  it("a window with no sill (`sill 0`) has its reveal and neither sill nor board", () => {
    const m = mesh(plan(`${SHELL} ${ROOM} window id=w at (3000,0) width 1200 wall shell sill 0`));
    expect(m.nodes.filter((n) => n.id === "w").map((n) => n.part)).toEqual(["frame", "glass", "reveal"]);
    expect(rows(m, "w")).toContainEqual(["window-sill-omitted", "sill 0"]);
  });

  it("keeps a curved host's sill and board inside the cut, and follows the arc with its reveal", () => {
    const hv = mesh(EXAMPLES_LIST.find(([n]) => n === "hillside-villa.arch")?.[1] ?? "");
    expect(rows(hv, "window_10").map(([r]) => r)).toEqual([
      "window-inside-probe",
      "window-reveal-lining",
      "window-sill-curved-inside-cut",
    ]);
    expect(node(hv, "L1/window:window_10:reveal")?.shells.length).toBe(3);
  });
});

describe("the trim over the corpus and the stress plans", () => {
  const plans = [...EXAMPLES_LIST, ...Object.entries(STRESS_PLANS)];
  const TRIM = new Set(["lining", "casing", "sill", "board", "reveal"]);

  it("every trim shell is closed, wound outward, in whole micrometres; every part rises with its host", () => {
    let shells = 0;
    for (const [n, src] of plans) {
      for (const nd of mesh(src).nodes.filter((x) => x.part !== undefined && TRIM.has(x.part))) {
        expect(nd.extras.host, `${n} ${nd.key}`).toBeDefined();
        for (const s of nd.shells) {
          shells++;
          expect(openEdges(s), `${n} ${nd.key}`).toBe(0);
          expect(signedVolume(s), `${n} ${nd.key}`).toBeGreaterThan(0);
          expect(
            s.positions.every((v) => Number.isInteger(v)),
            `${n} ${nd.key}`,
          ).toBe(true);
        }
      }
    }
    expect(shells).toBeGreaterThan(2000);
  }, 120_000);

  it("calls a window's outside the side the core's drawing puts its sill on, for every window", () => {
    let windows = 0;
    for (const [n, src] of EXAMPLES_LIST) {
      const r = adaptPlan(src, { world: WORLD });
      if (!r.ok) continue;
      const c = compile(src, { world: WORLD });
      r.scene.levels.forEach((lv, i) => {
        const drawn = c.pages?.[i]?.scene ?? c.scene;
        // The core's sill: a window-layer outline with no fill (the cover is filled), its middle off a face.
        const sills = (drawn?.nodes ?? []).flatMap((x) =>
          x.layer === "windows" && x.prim.t === "polygon" && x.paint.fill === "none"
            ? [
                [
                  (x.prim.pts.reduce((s, p) => s + p.x, 0) / x.prim.pts.length) * MM,
                  (x.prim.pts.reduce((s, p) => s + p.y, 0) / x.prim.pts.length) * MM,
                ] as const,
              ]
            : [],
        );
        const thickness = new Map(lv.walls.map((w) => [w.id, w.thickness] as const));
        for (const o of lv.openings.filter((x) => x.kind === "window")) {
          windows++;
          const t = thickness.get(o.host) ?? 0;
          const [j0, j1] = o.jambs;
          const L = Math.hypot(j1[0] - j0[0], j1[1] - j0[1]);
          const [ux, uy] = [(j1[0] - j0[0]) / L, (j1[1] - j0[1]) / L];
          const near = sills
            .map(([x, y]) => [(x - j0[0]) * ux + (y - j0[1]) * uy, -(x - j0[0]) * uy + (y - j0[1]) * ux] as const)
            .filter(([u, v]) => u > 0 && u < L && Math.abs(v) > t / 2 && Math.abs(v) < t);
          const core = near.length === 1 ? ((near[0] as readonly [number, number])[1] > 0 ? -1 : 1) : null;
          const side = insideOf(o, t, lv);
          expect(near.length, `${n} L${lv.level} ${o.id}: one sill or none`).toBeLessThanOrEqual(1);
          expect(side === "both" ? null : side, `${n} L${lv.level} ${o.id}`).toBe(core);
        }
      });
    }
    expect(windows).toBeGreaterThan(250);
  }, 120_000);
});
