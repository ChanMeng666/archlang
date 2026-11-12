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

  it("trims no opening whose id cannot name a part node (a passage named after its rooms)", () => {
    const knob = mesh(EXAMPLES_LIST.find(([n]) => n === "knob-flat.arch")?.[1] ?? "");
    expect(knob.assumptions.filter((a) => a.rule === "opening-trim-omitted").map((a) => a.id)).toEqual([
      "r_live|r_hall:open",
    ]);
    expect(knob.nodes.some((n) => n.id === "r_live|r_hall:open")).toBe(false);
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
    // aquarium's two windows in its curved wall (hillside-villa's has no room on either side: the
    // core draws it no sill, and it gets no trim, `window-inside-probe` "neither").
    const aq = mesh(EXAMPLES_LIST.find(([n]) => n === "aquarium.arch")?.[1] ?? "");
    expect(rows(aq, "w_arc1")).toEqual([
      ["window-inside-probe", "+normal"],
      ["window-reveal-lining", { thickness: 20, head: true }],
      ["window-sill-curved-inside-cut", { thickness: 40, board: 30 }],
    ]);
    expect(node(aq, "L1/window:w_arc1:reveal")?.shells.length).toBe(3);
    expect(node(aq, "L1/window:w_arc1:sill")?.shells.length).toBe(1);
    expect(node(aq, "L1/window:w_arc1:board")?.shells.length).toBe(1);
  });
});

// Review M2 and m4 on PR #729: openings close together, and furniture against the wall by one.
describe("trim beside its neighbours", () => {
  /** Each piece's plan box (x0, z0, x1, z1) and heights (y0, y1). */
  const boxes = (n: MeshNode | undefined) =>
    (n?.shells ?? []).map((s) => {
      const [x, y, z] = extent([s]);
      return { x, y, z };
    });
  const clear = (a: ReturnType<typeof boxes>, b: ReturnType<typeof boxes>): boolean =>
    a.every((p) =>
      b.every(
        (q) =>
          p.x[1] <= q.x[0] ||
          q.x[1] <= p.x[0] ||
          p.z[1] <= q.z[0] ||
          q.z[1] <= p.z[0] ||
          p.y[1] <= q.y[0] ||
          q.y[1] <= p.y[0],
      ),
    );

  // RM8.6b S1: the trim never depends on the order the plan writes its openings in. Two pieces of the
  // same rank that meet are both cut back or left out; a casing beats a sill's or a board's horn.
  const TWO_DOORS = (first: string, second: string) => plan(`${SHELL} ${ROOM} ${first} ${second}`);
  const DOOR_A = "door id=a at (2000,4000) width 800 wall shell swing in";
  const DOOR_B = "door id=b at (2900,4000) width 800 wall shell swing in";
  const ROW = `wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close } room id=r at (0,0) size 8000x4000 label "R" uses living`;
  const W1 = "window id=w1 at (1500,0) width 1000 wall shell";
  const W2 = "window id=w2 at (2560,0) width 1000 wall shell";
  const D = "door id=d at (5000,0) width 900 wall shell swing in";
  const W3 = "window id=w3 at (6045,0) width 1000 wall shell";

  it("two doors 100 mm apart: both legs between them are left out, each head piece stops at its jamb", () => {
    // Door a spans x 1600–2400, b 2500–3300; a casing is 70 mm wide, so the two legs between meet.
    const m = mesh(TWO_DOORS(DOOR_A, DOOR_B));
    expect(rows(m, "a").at(-1)).toEqual(["door-casing-omitted", ["+face:start:casing b", "-face:start:casing b"]]);
    expect(rows(m, "b").at(-1)).toEqual(["door-casing-omitted", ["+face:end:casing a", "-face:end:casing a"]]);
    expect(clear(boxes(node(m, "L1/door:a:casing")), boxes(node(m, "L1/door:b:casing")))).toBe(true);
    // Each head piece runs from its own jamb on that side (a's ends at x 2400, b's starts at 2500).
    expect(Math.max(...boxes(node(m, "L1/door:a:casing")).map((p) => p.x[1]))).toBe(2_400_000);
    expect(Math.min(...boxes(node(m, "L1/door:b:casing")).map((p) => p.x[0]))).toBe(2_500_000);
  });

  it("two windows 60 mm apart, and a window 95 mm from a door: the horns between stop at their jambs", () => {
    const m = mesh(plan(`${ROW} ${W1} ${W2} ${D} ${W3}`));
    // The sills' 40 mm horns meet in the 60 mm between w1 and w2: both stop. The boards' 20 mm fit.
    // The door's casing beats w3's sill horn; on the inside its 70 mm casing ends 75 mm short of w3's
    // jamb, short of w3's 20 mm board horn.
    const horns = (id: string) => rows(m, id).filter(([r]) => r === "window-sill-horn-omitted");
    expect(horns("w1")).toEqual([["window-sill-horn-omitted", ["end:sill w2"]]]);
    expect(horns("w2")).toEqual([["window-sill-horn-omitted", ["start:sill w1"]]]);
    expect(horns("w3")).toEqual([["window-sill-horn-omitted", ["start:casing d"]]]);
    expect(rows(m, "d").map(([r]) => r)).not.toContain("door-casing-omitted");
    for (const [a, b] of [
      ["L1/window:w1:sill", "L1/window:w2:sill"],
      ["L1/window:w1:board", "L1/window:w2:board"],
      ["L1/door:d:casing", "L1/window:w3:sill"],
      ["L1/door:d:casing", "L1/window:w3:board"],
    ] as const)
      expect(clear(boxes(node(m, a)), boxes(node(m, b))), `${a} ~ ${b}`).toBe(true);
  });

  it("builds the same trim whatever order the plan writes its openings in", () => {
    /** Each opening's trim nodes (their shells) and its ledger rows, by id. */
    const trimOf = (m: Mesh3D) => ({
      nodes: Object.fromEntries(
        m.nodes.filter((n) => n.part && n.part !== "frame" && n.part !== "glass").map((n) => [n.key, n.shells]),
      ),
      rows: Object.fromEntries(
        [...new Set(m.assumptions.flatMap((x) => (x.id ? [x.id] : [])))].sort().map((id) => [id, rows(m, id)]),
      ),
    });
    for (const [a, b] of [
      [TWO_DOORS(DOOR_A, DOOR_B), TWO_DOORS(DOOR_B, DOOR_A)],
      [plan(`${ROW} ${W1} ${W2} ${D} ${W3}`), plan(`${ROW} ${W3} ${D} ${W2} ${W1}`)],
      [plan(`${ROW} ${D} ${W3}`), plan(`${ROW} ${W3} ${D}`)],
    ] as const)
      expect(trimOf(mesh(b))).toEqual(trimOf(mesh(a)));
    // Review of PR #732, B1: three doorways side by side (each touching the next) in all six orders,
    // the names a clash reports among them too.
    const three = [
      "door id=o0 at (3560,4000) width 800 wall shell swing in",
      "door id=o1 at (4410,4000) width 900 wall shell swing in",
      "door id=o2 at (5260,4000) width 800 wall shell swing in",
    ];
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const first = trimOf(mesh(plan(`${ROW} ${orders[0]?.map((k) => three[k]).join(" ")}`)));
    expect(first.rows.o1).toContainEqual([
      "door-casing-omitted",
      ["+face:start:opening o2", "+face:end:opening o0", "-face:start:opening o2", "-face:end:opening o0"],
    ]);
    for (const order of orders.slice(1))
      expect(trimOf(mesh(plan(`${ROW} ${order.map((k) => three[k]).join(" ")}`))), order.join("")).toEqual(first);
  });

  it("keeps the sill and board of windows that touch a neighbour, cutting only the horns between", () => {
    // Two windows jamb to jamb (x 1000–2000, 2000–3000), and a sidelight against a door (door x
    // 3550–4450, window 4450–5450). Review of PR #732, B1: the widened jamb tests horns only.
    const m = mesh(
      plan(
        `${ROW} ${W1} window id=w2 at (2500,0) width 1000 wall shell door id=d at (4000,0) width 900 wall shell swing in window id=w at (4950,0) width 1000 wall shell`,
      ),
    );
    for (const id of ["w1", "w2", "w"]) {
      expect(node(m, `L1/window:${id}:sill`), id).toBeDefined();
      expect(node(m, `L1/window:${id}:board`), id).toBeDefined();
      expect(
        rows(m, id).map(([r]) => r),
        id,
      ).not.toContain("window-sill-omitted");
    }
    expect(rows(m, "w1")).toContainEqual(["window-sill-horn-omitted", ["end:opening w2"]]);
    expect(rows(m, "w2")).toContainEqual(["window-sill-horn-omitted", ["start:opening w1"]]);
    expect(rows(m, "w")).toContainEqual(["window-sill-horn-omitted", ["start:opening d"]]);
  });

  it("gives a mirror-symmetric two-door plan mirror-symmetric trim", () => {
    // Doors at x 2550 and 3450 (800 wide, 100 mm apart), symmetric about x = 3000.
    const m = mesh(
      TWO_DOORS(
        "door id=a at (2550,4000) width 800 wall shell swing in",
        "door id=b at (3450,4000) width 800 wall shell swing in",
      ),
    );
    const points = (key: string, flip: boolean): string[] =>
      [
        ...new Set(
          (node(m, key)?.shells ?? []).flatMap((s) =>
            Array.from({ length: s.positions.length / 3 }, (_, k) => {
              const x = s.positions[3 * k] as number;
              return `${flip ? 6_000_000 - x : x},${s.positions[3 * k + 1]},${s.positions[3 * k + 2]}`;
            }),
          ),
        ),
      ].sort();
    for (const part of ["casing", "lining"])
      expect(points(`L1/door:b:${part}`, true), part).toEqual(points(`L1/door:a:${part}`, false));
  });

  it("cuts a head piece back one end at a time (RM8.6b S3)", () => {
    // A high window (sill 2100, head 2600) beside a door whose head is at 2100, on a 3000 mm wall.
    const at = (x: number) =>
      mesh(
        plan(
          `wall id=shell exterior thickness 200 height 3000 { (0,0) (8000,0) (8000,4000) (0,4000) close } room id=r at (0,0) size 8000x4000 label "R" uses living door id=d at (5000,0) width 900 wall shell swing in head 2100 window id=w at (${x},0) width 1000 wall shell sill 2100 head 2600`,
        ),
      );
    // 95 mm apart: the door's casing stands whole (its legs end below the window's sill, its head
    // piece 70 mm past the jamb, short of the window); the window's sill horn yields to it.
    const far = at(6045);
    expect(rows(far, "d").map(([r]) => r)).not.toContain("door-casing-omitted");
    expect(rows(far, "w")).toContainEqual(["window-sill-horn-omitted", ["start:casing d"]]);
    // 40 mm apart: the head piece's end toward the window would stand in the window's doorway, so
    // that end alone is cut back, on each face; the other end stays.
    const near = at(5990);
    expect(rows(near, "d").at(-1)).toEqual([
      "door-casing-omitted",
      ["+face:head-end:opening w", "-face:head-end:opening w"],
    ]);
    const pieces = boxes(node(near, "L1/door:d:casing"));
    const xs = pieces.flatMap((p) => p.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([4_480_000, 5_520_000]);
    // The head piece: from 70 mm past the far jamb to the near jamb (x 5450), 2100–2170 up.
    const bars = pieces.filter((p) => p.y[0] === 2_100_000);
    expect(bars.length).toBe(2);
    for (const b of bars)
      expect([b.x, b.y]).toEqual([
        [4_480_000, 5_450_000],
        [2_100_000, 2_170_000],
      ]);
  });

  it("passes a casing leg through a rug by the doorway, and leaves it out beside a wardrobe", () => {
    const by = (piece: string) =>
      mesh(
        plan(
          `${SHELL} ${ROOM} door id=d at (3000,4000) width 900 wall shell swing in furniture ${piece} at (3480,3300) size 400x590`,
        ),
      );
    const rug = by("rug");
    expect(rows(rug, "d").map(([r]) => r)).not.toContain("door-casing-omitted");
    const wardrobe = by("wardrobe");
    expect(rows(wardrobe, "d").at(-1)?.[0]).toBe("door-casing-omitted");
    expect(String(rows(wardrobe, "d").at(-1)?.[1])).toMatch(/\+face:start:furniture /);
  });

  it("ledgers the colour of each trim part once (`trim-material-default`)", () => {
    const m = mesh(EXAMPLES_LIST.find(([n]) => n === "laneway-house.arch")?.[1] ?? "");
    expect(m.assumptions.filter((a) => a.rule === "trim-material-default").map((a) => `${a.kind}:${a.field}`)).toEqual([
      "door:material(lining)",
      "door:material(casing)",
      "window:material(reveal)",
      "window:material(sill)",
      "window:material(board)",
    ]);
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
        // V-GLTF-02 names a node `<kind>:<id>:<part>`: an id that cannot be named gets no trim.
        expect(nd.key, n).toMatch(/^L\d+\/[a-z]+:[^:/\s]+:[a-z]+$/);
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
