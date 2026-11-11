/**
 * The walls' outlines in the 3D preview (product-roadmap card RM8.1, `src/replay/wall-lines.ts`): a
 * line only where a storey's wall surface really turns. Each wall piece, sill and lintel is its own
 * closed prism, so outlining each node on its own drew a seam wherever two prisms' faces are one flat
 * surface. Light: no browser; the outlines are read straight off the payload the replay mounts.
 */
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { replayPayload } from "../src/node.js";
import {
  type FaceFix,
  joinedGroups,
  type LineSource,
  nearlyFlat,
  takesWallLines,
  wallFaces,
  wallLines,
  wallOutline,
  withFaces,
} from "../src/replay/wall-lines.js";
import type { Level } from "../src/scene3d/types.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

const MM = 1000;

interface Seg {
  node: string;
  a: [number, number, number];
  b: [number, number, number];
}

function outlined(src: string) {
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(r.refusal.code);
  const mesh = buildMesh(r.scene);
  const payload = replayPayload(mesh, { title: "t", svg: compile(src, { world: WORLD }).svg });
  const nodes = payload.nodes;
  const out = wallLines(nodes);
  const segs: Seg[] = [];
  out.forEach((flat, i) => {
    for (let j = 0; flat && j < flat.length; j += 6) {
      segs.push({
        node: nodes[i]?.key ?? "",
        a: flat.slice(j, j + 3) as [number, number, number],
        b: flat.slice(j + 3, j + 6) as [number, number, number],
      });
    }
  });
  return { level: r.scene.levels[0] as Level, levels: r.scene.levels, nodes, events: payload.events, out, segs };
}

const sourceOf = (name: string): string => EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";

/** The vertical lines over plan point `(x, y)` (µm), as height intervals. */
const verticalAt = (segs: readonly Seg[], x: number, y: number): Array<[number, number]> =>
  segs
    .filter((s) => s.a[0] === x && s.b[0] === x && s.a[2] === y && s.b[2] === y)
    .map((s) => [Math.min(s.a[1], s.b[1]), Math.max(s.a[1], s.b[1])]);

/** Whether the intervals cover `[lo, hi]` without a gap. */
const covers = (iv: ReadonlyArray<[number, number]>, lo: number, hi: number): boolean => {
  let at = lo;
  for (const [a, b] of [...iv].sort((p, q) => p[0] - q[0])) {
    if (a > at) break;
    at = Math.max(at, b);
  }
  return at >= hi;
};

/** Whether some interval overlaps the open interval `(lo, hi)`. */
const overlaps = (iv: ReadonlyArray<[number, number]>, lo: number, hi: number): boolean =>
  iv.some(([a, b]) => Math.min(b, hi) > Math.max(a, lo));

/**
 * The horizontal lines at height `y` on the plan line through `p` and `q` (µm), as intervals of the
 * place along it (x, or the plan y when the line runs along y).
 */
function horizontalOn(segs: readonly Seg[], y: number, p: readonly number[], q: readonly number[]) {
  const dx = (q[0] as number) - (p[0] as number);
  const dy = (q[1] as number) - (p[1] as number);
  const on = (x: number, z: number): boolean => dx * (z - (p[1] as number)) - dy * (x - (p[0] as number)) === 0;
  const t = (x: number, z: number): number => (dx !== 0 ? x : z);
  return segs
    .filter((s) => s.a[1] === y && s.b[1] === y && on(s.a[0], s.a[2]) && on(s.b[0], s.b[2]))
    .map((s): [number, number] => {
      const u = t(s.a[0], s.a[2]);
      const v = t(s.b[0], s.b[2]);
      return [Math.min(u, v), Math.max(u, v)];
    });
}

/** Whether some node of the storey has a vertex over plan point `(x, y)`: a box corner, so a seam the old outline drew. */
const vertexAt = (nodes: readonly LineSource[], x: number, y: number): boolean =>
  nodes.some((n) => {
    if (!takesWallLines(n)) return false;
    for (let i = 0; i < n.positions.length; i += 3) if (n.positions[i] === x && n.positions[i + 2] === y) return true;
    return false;
  });

describe("wall outlines: openings (laneway-house)", () => {
  const { level, nodes, segs } = outlined(sourceOf("laneway-house.arch"));
  const e = level.elevation;
  const walls = new Map(level.walls.map((w) => [w.id, w] as const));

  it("draws a door's or a window's jamb only between its sill and head, the real reveal", () => {
    expect(level.openings.length).toBeGreaterThan(5);
    let corners = 0;
    for (const o of level.openings) {
      const host = walls.get(o.host);
      if (!host) continue;
      const top = e + host.height;
      for (const [x, y] of o.cut) {
        const at = verticalAt(segs, x, y);
        const where = `${o.id} at (${x / MM}, ${y / MM})`;
        // The real corner: the wall face turns into the jamb between sill and head.
        expect(covers(at, e + o.sill, e + Math.min(o.head, host.height)), `${where}: the reveal`).toBe(true);
        // Above the head and below the sill the face runs on flat over the lintel and the sill.
        expect(overlaps(at, e + o.head, top), `${where}: above the head`).toBe(false);
        expect(overlaps(at, e, e + o.sill), `${where}: below the sill`).toBe(false);
        corners++;
      }
    }
    expect(corners).toBeGreaterThan(20);
  });

  it("cuts no wall top across its thickness at a jamb", () => {
    let jambs = 0;
    for (const o of level.openings) {
      const host = walls.get(o.host);
      if (!host || o.head >= host.height) continue;
      const top = e + host.height;
      o.cut.forEach((p, i) => {
        const q = o.cut[(i + 1) % o.cut.length] as [number, number];
        // A jamb's edge crosses the wall: the cut's short sides.
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) > host.thickness + 1) return;
        const [u, v] = q[0] !== p[0] ? [p[0], q[0]] : [p[1], q[1]];
        expect(
          overlaps(horizontalOn(segs, top, p, q), Math.min(u, v), Math.max(u, v)),
          `${o.id}: the top across the jamb at (${p[0] / MM}, ${p[1] / MM})`,
        ).toBe(false);
        jambs++;
      });
    }
    expect(jambs).toBeGreaterThan(10);
  });

  it("outlines every standing wall, and only walls and columns", () => {
    const { out } = outlined(sourceOf("laneway-house.arch"));
    nodes.forEach((n, i) => {
      expect(out[i] !== undefined, n.key).toBe(takesWallLines(n));
    });
    const wallsOutlined = nodes.filter((n, i) => n.kind === "wall" && (out[i]?.length ?? 0) > 0).length;
    expect(wallsOutlined).toBe(nodes.filter((n) => n.kind === "wall").length);
  });
});

describe("wall outlines: junctions", () => {
  it("a T with its stem written first: no line on the through wall's flat back, the two inside corners stay", () => {
    const { level, nodes, segs } = outlined(`plan "T" {
  units mm
  wall id=w_stem partition thickness 150 { (3000,0) (3000,3000) }
  wall id=w_through partition thickness 150 { (0,3000) (6000,3000) }
}
`);
    const e = level.elevation;
    const H = e + (level.walls[0]?.height ?? 0);
    // The premise: the stem owns the crossing, so the through wall is two pieces either side of it.
    expect(level.walls.find((w) => w.id === "w_through")?.body.length).toBe(2);
    expect(vertexAt(nodes, 2925 * MM, 3075 * MM) && vertexAt(nodes, 3075 * MM, 3075 * MM)).toBe(true);
    const back = segs.filter(
      (s) => s.a[0] === s.b[0] && s.a[2] === s.b[2] && s.a[2] === 3075 * MM && s.a[0] > 1000 * MM && s.a[0] < 5000 * MM,
    );
    expect(back).toEqual([]);
    // The inside corners, where the stem's sides meet the through wall's face.
    expect(covers(verticalAt(segs, 2925 * MM, 2925 * MM), e, H)).toBe(true);
    expect(covers(verticalAt(segs, 3075 * MM, 2925 * MM), e, H)).toBe(true);
    // The top runs on across the stem: no cut across the through wall, one edge along its back.
    for (const x of [2925, 3075])
      expect(overlaps(horizontalOn(segs, H, [x * MM, 0], [x * MM, MM]), 2925 * MM, 3075 * MM), `x ${x}`).toBe(false);
    expect(covers(horizontalOn(segs, H, [0, 3075 * MM], [MM, 3075 * MM]), 1000 * MM, 5000 * MM)).toBe(true);
  });

  it("an L corner of two walls: no seam one wall thickness from the corner", () => {
    const { level, nodes, segs } = outlined(`plan "L" {
  units mm
  wall id=w_l1 exterior thickness 200 { (0,0) (0,4000) }
  wall id=w_l2 exterior thickness 200 { (0,4000) (4000,4000) }
}
`);
    const e = level.elevation;
    const H = e + (level.walls[0]?.height ?? 0);
    // The premise: one wall owns the corner square, so the other's box has a corner on the outer face.
    const seams: Array<[number, number]> = [
      [100, 4100],
      [-100, 3900],
    ];
    expect(seams.some(([x, y]) => vertexAt(nodes, x * MM, y * MM))).toBe(true);
    for (const [x, y] of seams) expect(verticalAt(segs, x * MM, y * MM), `(${x}, ${y})`).toEqual([]);
    expect(covers(verticalAt(segs, -100 * MM, 4100 * MM), e, H), "the outer corner").toBe(true);
    expect(covers(verticalAt(segs, 100 * MM, 3900 * MM), e, H), "the inner corner").toBe(true);
  });

  it("walls from rooms (two-bed): no seam where a wall's crossing went to another wall", () => {
    const { level, nodes, segs } = outlined(sourceOf("two-bed.arch"));
    const e = level.elevation;
    const H = e + (level.walls[0]?.height ?? 0);
    // Three seams the per-node outline drew round the junctions at (4000, 5000) and (6400, 5000):
    // each a box corner on a flat face.
    for (const [x, y] of [
      [3950, 5050],
      [4050, 4950],
      [6450, 4950],
    ] as const) {
      expect(vertexAt(nodes, x * MM, y * MM), `(${x}, ${y}): a box corner`).toBe(true);
      expect(verticalAt(segs, x * MM, y * MM), `(${x}, ${y})`).toEqual([]);
    }
    // The open boundary's real corner, 100 mm from one of them, stays.
    expect(covers(verticalAt(segs, 3950 * MM, 4950 * MM), e, H)).toBe(true);
  });

  it("an X junction keeps its four inside corners, and no seam rims the crossing", () => {
    const { level, nodes, segs } = outlined(`plan "X" {
  units mm
  wall id=w_x1 partition thickness 150 { (0,6000) (6000,6000) }
  wall id=w_x2 partition thickness 150 { (3000,4500) (3000,7500) }
}
`);
    const e = level.elevation;
    const H = e + (level.walls[0]?.height ?? 0);
    for (const [x, y] of [
      [2925, 5925],
      [3075, 5925],
      [2925, 6075],
      [3075, 6075],
    ] as const)
      expect(covers(verticalAt(segs, x * MM, y * MM), e, H), `(${x}, ${y})`).toBe(true);
    // The premise: one wall owns the crossing square, so its box (or the other's two pieces) has
    // edges round it, at the top and at the foot, where the tops and the feet of the two walls run
    // on flat. The per-node outline drew all eight; none of them is a turn of the surface.
    expect(level.walls.map((w) => w.body.length).sort()).toEqual([1, 2]);
    expect(vertexAt(nodes, 2925 * MM, 5925 * MM)).toBe(true);
    for (const y of [e, H]) {
      for (const z of [5925, 6075])
        expect(overlaps(horizontalOn(segs, y, [0, z * MM], [MM, z * MM]), 2925 * MM, 3075 * MM), `y ${y}, z ${z}`).toBe(
          false,
        );
      for (const x of [2925, 3075])
        expect(overlaps(horizontalOn(segs, y, [x * MM, 0], [x * MM, MM]), 5925 * MM, 6075 * MM), `y ${y}, x ${x}`).toBe(
          false,
        );
    }
  });
});

describe("wall outlines: a curved wall (s5-door-on-arc)", () => {
  const { level, nodes, segs } = outlined(STRESS_PLANS["s5-door-on-arc"] ?? "");
  const e = level.elevation;

  /**
   * A plan point on one of the arc's two faces (radius 3000 about (6000, 3000), the faces 125 either
   * side), clear of the straight walls it meets: there, two chords of the arc meet.
   */
  const onArc = (x: number, y: number): boolean => {
    const r = Math.hypot(x - 6000 * MM, y - 3000 * MM);
    const face = Math.abs(r - 3125 * MM) < MM || Math.abs(r - 2875 * MM) < MM;
    return face && y > 200 * MM && y < 5800 * MM;
  };

  it("draws no line between the chords of the arc, only the openings' reveals", () => {
    const cuts = level.openings;
    expect(cuts.length).toBe(2);
    // The premise: the arc is many vertical chord faces, meeting at these points.
    const chordPoints = new Set<string>();
    for (const n of nodes.filter(takesWallLines))
      for (let i = 0; i < n.positions.length; i += 3) {
        const [x, y] = [n.positions[i] as number, n.positions[i + 2] as number];
        if (onArc(x, y)) chordPoints.add(`${x},${y}`);
      }
    expect(chordPoints.size).toBeGreaterThan(16);
    const vertical = segs.filter((s) => s.a[0] === s.b[0] && s.a[2] === s.b[2] && onArc(s.a[0], s.a[2]));
    expect(vertical.length).toBeGreaterThanOrEqual(8);
    for (const s of vertical) {
      const [x, y] = [s.a[0], s.a[2]];
      const lo = Math.min(s.a[1], s.b[1]);
      const hi = Math.max(s.a[1], s.b[1]);
      const reveal = cuts.find((o) => o.cut.some((p) => p[0] === x && p[1] === y));
      expect(reveal, `a line at (${x / MM}, ${y / MM})`).toBeDefined();
      if (reveal) {
        expect(lo >= e + reveal.sill && hi <= e + reveal.head, `${reveal.id}: (${x / MM}, ${y / MM})`).toBe(true);
      }
    }
  });

  it("keeps the reveals of the door and the window on the arc", () => {
    for (const o of level.openings) {
      const reveals = o.cut.filter(([x, y]) => covers(verticalAt(segs, x, y), e + o.sill, e + o.head));
      expect(reveals.length, o.id).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("wall outlines: determinism", () => {
  /** A fixed shuffle (a linear congruential sequence), so the test is the same every run. */
  function shuffled(nodes: readonly LineSource[]): LineSource[] {
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    return nodes.map((n) => {
      const tris: number[][] = [];
      for (let i = 0; i < n.indices.length; i += 3) tris.push(n.indices.slice(i, i + 3) as number[]);
      for (let i = tris.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [tris[i], tris[j]] = [tris[j] as number[], tris[i] as number[]];
      }
      // Each triangle starts at another corner: the same winding, other edges first.
      const turned = tris.map((t, i) => (i % 3 === 0 ? t : i % 3 === 1 ? [t[1], t[2], t[0]] : [t[2], t[0], t[1]]));
      return { ...n, indices: turned.flat() as number[] };
    });
  }

  for (const name of ["laneway-house.arch", "two-storey.arch", "studio.arch"]) {
    it(`${name}: the same lines, byte for byte, whatever order the triangles come in`, () => {
      const { nodes, out } = outlined(sourceOf(name));
      expect(out.some((o) => (o?.length ?? 0) > 0)).toBe(true);
      expect(JSON.stringify(wallLines(shuffled(nodes)))).toBe(JSON.stringify(out));
      expect(JSON.stringify(wallLines(nodes))).toBe(JSON.stringify(out));
    });

    it(`${name}: the same faces drawn, risen or rising, and the same groups, whatever order the triangles come in`, () => {
      const { nodes } = outlined(sourceOf(name));
      const turned = shuffled(nodes);
      const a = wallFaces(turned);
      const b = wallFaces(nodes);
      for (const mode of ["joined", "alone"] as const)
        expect(drawnTriangles(turned, a, mode), mode).toEqual(drawnTriangles(nodes, b, mode));
      expect(a.map((f) => f?.group)).toEqual(b.map((f) => f?.group));
      expect(b.some((f) => (f?.group ?? -1) >= 0)).toBe(true);
    });
  }
});

/**
 * Every triangle drawn for an outlined node once its `FaceFix` is applied, as `<node>|<corners>`,
 * each starting at its least corner (its winding kept), sorted: what is drawn, whatever the order.
 */
function drawnTriangles(
  nodes: readonly LineSource[],
  fixes: ReturnType<typeof wallFaces>,
  mode: "joined" | "alone" = "joined",
): string[] {
  const all: string[] = [];
  nodes.forEach((n, i) => {
    if (!takesWallLines(n)) return;
    const d = withFaces(n, fixes[i], mode);
    for (let t = 0; t + 2 < d.indices.length; t += 3) {
      const c = [0, 1, 2].map((k) => {
        const v = d.indices[t + k] as number;
        return [d.positions[v * 3], d.positions[v * 3 + 1], d.positions[v * 3 + 2]].join(",");
      });
      const least = c.indexOf([...c].sort()[0] as string);
      all.push(`${n.key}|${[...c.slice(least), ...c.slice(0, least)].join(" ")}`);
    }
  });
  return all.sort();
}

/** The nodes as they are drawn: an outlined node's faces with its `FaceFix` applied. */
const drawnNodes = (nodes: readonly LineSource[]): LineSource[] => {
  const fixes = wallFaces(nodes);
  return nodes.map((n, i) => (takesWallLines(n) ? { ...n, ...withFaces(n, fixes[i]) } : n));
};

describe("wall faces: no inner face is drawn (they leaked along the seams)", () => {
  const inRing = (x: number, y: number, ring: ReadonlyArray<readonly number[]>): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  /**
   * Whether plan point `(x, y)` at height `z` (µm) lies inside the storey's walls or columns, as
   * the mesh builds them: each wall's body pieces to its height, and under and over each opening
   * its sill and its lintel.
   */
  const inSolid = (level: Level, x: number, y: number, z: number): boolean => {
    const e = level.elevation;
    const height = new Map(level.walls.map((w) => [w.id, w.height] as const));
    const body = level.walls.some(
      (w) =>
        z > e &&
        z < e + w.height &&
        w.body.some((pg) => inRing(x, y, pg.outer) && !(pg.holes ?? []).some((h) => inRing(x, y, h))),
    );
    const sillOrLintel = level.openings.some((o) => {
      const h = height.get(o.host) ?? 0;
      return inRing(x, y, o.cut) && z > e && z < e + h && (z < e + o.sill || z > e + o.head);
    });
    const column = level.columns.some(
      (c) =>
        z > e &&
        z < e + level.storeyHeight &&
        x > c.at[0] &&
        x < c.at[0] + c.size.w &&
        y > c.at[1] &&
        y < c.at[1] + c.size.h,
    );
    return body || sillOrLintel || column;
  };

  const plans: Array<[string, string]> = [
    ["laneway-house", sourceOf("laneway-house.arch")],
    ["two-bed", sourceOf("two-bed.arch")],
    ["studio", sourceOf("studio.arch")],
    [
      "T, stem first",
      `plan "T" {\n  units mm\n  wall id=w_stem partition thickness 150 { (3000,0) (3000,3000) }\n  wall id=w_through partition thickness 150 { (0,3000) (6000,3000) }\n}\n`,
    ],
    [
      "L of two walls",
      `plan "L" {\n  units mm\n  wall id=w_l1 exterior thickness 200 { (0,0) (0,4000) }\n  wall id=w_l2 exterior thickness 200 { (0,4000) (4000,4000) }\n}\n`,
    ],
    ["s5-door-on-arc", STRESS_PLANS["s5-door-on-arc"] ?? ""],
  ];
  for (const [name, src] of plans) {
    it(`${name}: every wall face drawn has the wall behind it and air in front`, () => {
      const { level, nodes } = outlined(src);
      const drawn = drawnNodes(nodes);
      let faces = 0;
      for (const n of drawn) {
        if (!takesWallLines(n)) continue;
        for (let t = 0; t + 2 < n.indices.length; t += 3) {
          const c = [0, 1, 2].map((k) => {
            const v = n.indices[t + k] as number;
            return [n.positions[v * 3], n.positions[v * 3 + 1], n.positions[v * 3 + 2]] as [number, number, number];
          });
          const [a, b, d] = c as [[number, number, number], [number, number, number], [number, number, number]];
          if (a[1] === b[1] && a[1] === d[1]) continue; // a top or a bottom
          // The outward normal (counter-clockwise from outside), level for a wall face.
          const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
          const nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
          const len = Math.hypot(nx, nz);
          if (len === 0) continue;
          const [cx, cy, cz] = [0, 1, 2].map((k) => ((a[k] as number) + (b[k] as number) + (d[k] as number)) / 3) as [
            number,
            number,
            number,
          ];
          const step = (sign: number): [number, number] => [cx + (sign * 500 * nx) / len, cz + (sign * 500 * nz) / len];
          const [ox, oz] = step(1);
          const [ix, iz] = step(-1);
          const where = `${n.key} at (${(cx / MM).toFixed(1)}, ${(cz / MM).toFixed(1)}) h ${(cy / MM).toFixed(1)}`;
          expect(inSolid(level, ox, oz, cy), `${where}: a wall in front of the face`).toBe(false);
          expect(inSolid(level, ix, iz, cy), `${where}: no wall behind the face`).toBe(true);
          faces++;
        }
      }
      expect(faces).toBeGreaterThan(8);
    });
  }

  it("leaves what is seen as it was: over the corpus, each wall plane keeps its net facing area, exactly", () => {
    // An inner face is a pair of faces of opposite facing over the same area: leaving both out
    // keeps every plane's signed area (+ one facing, − the other), and only they may go. Exact:
    // twice each area in the plane's own frame, in integers (µm²), so not one cell may move.
    for (const [name, src] of EXAMPLES_LIST) {
      const { nodes } = outlined(src);
      const fixes = wallFaces(nodes);
      const finished = nodes.map((n, i) => (takesWallLines(n) ? { ...n, ...withFaces(n, fixes[i]) } : n));
      expectSameAreas(planeAreas(nodes), planeAreas(finished), name);
      // Each node on its own, as it stands while it rises: its own planes' areas, its inner faces out.
      nodes.forEach((n, i) => {
        if (!takesWallLines(n)) return;
        expectSameAreas(
          planeAreas([n]),
          planeAreas([{ ...n, ...withFaces(n, fixes[i], "alone") }]),
          `${name} ${n.key}`,
        );
      });
    }
  });
});

function expectSameAreas(
  before: Map<string, { signed: bigint; total: bigint }>,
  after: Map<string, { signed: bigint; total: bigint }>,
  name: string,
): void {
  expect(
    [...after.keys()].filter((k) => !before.has(k)),
    `${name}: a new plane`,
  ).toEqual([]);
  for (const [k, a] of before) {
    const b = after.get(k) ?? { signed: 0n, total: 0n };
    expect(b.signed === a.signed, `${name} ${k}: ${a.signed} → ${b.signed}`).toBe(true);
    expect(b.total <= a.total, `${name} ${k}: more drawn than before`).toBe(true);
  }
}

/**
 * Per vertical plane of the outlined nodes (its storey, its plan direction in lowest terms, its
 * offset), twice the signed area of its triangles in the plane's own frame (`s` along it, x or the
 * plan y, and up; counter-clockwise +) and twice their total area, in µm², exactly. Every plane's
 * frame is the same for all its triangles, so the sums compare across nodes.
 */
function planeAreas(nodes: readonly LineSource[]): Map<string, { signed: bigint; total: bigint }> {
  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
  const out = new Map<string, { signed: bigint; total: bigint }>();
  for (const n of nodes) {
    if (!takesWallLines(n)) continue;
    const storey = n.key.split("/")[0];
    for (let t = 0; t + 2 < n.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => {
        const v = n.indices[t + k] as number;
        return [0, 1, 2].map((d) => n.positions[v * 3 + d] as number);
      }) as [number[], number[], number[]];
      if (a[1] === b[1] && a[1] === c[1]) continue;
      const far = [b, c].find((p) => p[0] !== a[0] || p[2] !== a[2]);
      if (!far) continue;
      // The plan line, exactly: its direction in lowest terms (+x, or +z along z) and its offset.
      let dx = (far[0] as number) - (a[0] as number);
      let dz = (far[2] as number) - (a[2] as number);
      const g = gcd(dx, dz);
      dx /= g;
      dz /= g;
      if (dx < 0 || (dx === 0 && dz < 0)) [dx, dz] = [-dx, -dz];
      const key = `${storey} ${dx},${dz} @${BigInt(dx) * BigInt(a[2] as number) - BigInt(dz) * BigInt(a[0] as number)}`;
      const s = (p: number[]): bigint => BigInt(dx !== 0 ? (p[0] as number) : (p[2] as number));
      const y = (p: number[]): bigint => BigInt(p[1] as number);
      const twice = (s(b) - s(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (s(c) - s(a));
      if (twice === 0n) continue;
      const was = out.get(key) ?? { signed: 0n, total: 0n };
      out.set(key, { signed: was.signed + twice, total: was.total + (twice < 0n ? -twice : twice) });
    }
  }
  return out;
}

describe("wall outlines over the corpus", () => {
  it("every line runs up or along, has length, and lies on its node's storey", () => {
    for (const [name, src] of EXAMPLES_LIST) {
      const { nodes, out } = outlined(src);
      out.forEach((flat, i) => {
        if (!flat) return;
        const n = nodes[i] as LineSource;
        let lo = Infinity;
        let hi = -Infinity;
        for (let j = 1; j < n.positions.length; j += 3) {
          lo = Math.min(lo, n.positions[j] as number);
          hi = Math.max(hi, n.positions[j] as number);
        }
        for (let j = 0; j < flat.length; j += 6) {
          const [x0, y0, z0, x1, y1, z1] = flat.slice(j, j + 6) as number[];
          const up = x0 === x1 && z0 === z1;
          expect(up || y0 === y1, `${name} ${n.key}: a slanted line`).toBe(true);
          expect(up ? y0 !== y1 : x0 !== x1 || z0 !== z1, `${name} ${n.key}: a line of no length`).toBe(true);
          for (const y of [y0, y1]) expect((y as number) >= lo && (y as number) <= hi, `${name} ${n.key}`).toBe(true);
        }
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The replay raises each node on its own (`timeline.ts`'s stagger; `mount.ts` scales each node's
// group about its own foot). A face two nodes share is left out only once their whole group stands
// at full height; before that each node draws its own, so no frame shows a slot through a wall or
// an open wall end (review R1, B1).

type V3 = [number, number, number];

/**
 * Where a set of triangles is open: per 3D line, the stretches where their directed edges do not
 * cancel. A closed, consistently wound surface's edges pair off (an edge split by a T-junction
 * included, since the sum is taken along the line). Exact, in integer µm.
 */
function openEdges(tris: readonly V3[][]): string[] {
  const gcd = (a: bigint, b: bigint): bigint => {
    let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
    while (y !== 0n) [x, y] = [y, x % y];
    return x;
  };
  const lines = new Map<string, Array<{ t0: bigint; t1: bigint; k: number }>>();
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const p = (t[i] as V3).map((v) => BigInt(v)) as [bigint, bigint, bigint];
      const q = (t[(i + 1) % 3] as V3).map((v) => BigInt(v)) as [bigint, bigint, bigint];
      const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]] as [bigint, bigint, bigint];
      const g = gcd(gcd(d[0], d[1]), d[2]);
      if (g === 0n) continue;
      let u = d.map((x) => x / g) as [bigint, bigint, bigint];
      if ((u.find((x) => x !== 0n) as bigint) < 0n) u = u.map((x) => -x) as [bigint, bigint, bigint];
      const m = [p[1] * u[2] - p[2] * u[1], p[2] * u[0] - p[0] * u[2], p[0] * u[1] - p[1] * u[0]];
      const key = `${u.join(",")}|${m.join(",")}`;
      const ta = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
      const tb = q[0] * u[0] + q[1] * u[1] + q[2] * u[2];
      const e = ta < tb ? { t0: ta, t1: tb, k: 1 } : { t0: tb, t1: ta, k: -1 };
      const list = lines.get(key);
      if (list) list.push(e);
      else lines.set(key, [e]);
    }
  }
  const open: string[] = [];
  for (const [key, es] of lines) {
    const ts = [...new Set(es.flatMap((e) => [e.t0, e.t1]))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (let j = 0; j + 1 < ts.length; j++) {
      const [a, b] = [ts[j] as bigint, ts[j + 1] as bigint];
      const sum = es.filter((e) => e.t0 <= a && e.t1 >= b).reduce((s, e) => s + e.k, 0);
      if (sum !== 0) open.push(`line ${key} [${a}, ${b}] x${sum}`);
    }
  }
  return open.sort();
}

/**
 * The outlined nodes' triangles as the 3D preview draws them when node `i` stands at `rise(i)` of
 * its height (scaled about its own foot, as `mount.ts` does) or is not shown yet (`undefined`): a
 * node leaves out the faces it shares only while its whole group stands at full height, as
 * `joinedGroups` (the function `mount.ts`'s `draw` calls) picks `alone` or `joined`.
 */
function drawnAt(
  nodes: readonly LineSource[],
  fixes: ReadonlyArray<FaceFix | undefined>,
  rise: (i: number) => number | undefined,
): V3[][] {
  const joined = joinedGroups(fixes, (i) => rise(i) === 1);
  const tris: V3[][] = [];
  nodes.forEach((n, i) => {
    const r = rise(i);
    if (!takesWallLines(n) || r === undefined) return;
    const f = fixes[i];
    const d = withFaces(n, f, f && f.group >= 0 && !joined.has(f.group) ? "alone" : "joined");
    let base = Infinity;
    for (let v = 1; v < d.positions.length; v += 3) base = Math.min(base, d.positions[v] as number);
    for (let t = 0; t + 2 < d.indices.length; t += 3) {
      tris.push(
        [0, 1, 2].map((k) => {
          const v = d.indices[t + k] as number;
          const y = base + ((d.positions[v * 3 + 1] as number) - base) * r;
          if (!Number.isInteger(y)) throw new Error(`${n.key}: a height off the µm grid at rise ${r}`);
          return [d.positions[v * 3] as number, y, d.positions[v * 3 + 2] as number] as V3;
        }),
      );
    }
  });
  return tris;
}

/** The rise states to try: all up, every other one half up or not shown, and each node half up, not shown, or shown alone. */
function riseStates(nodes: readonly LineSource[]): Array<[string, (i: number) => number | undefined]> {
  const walls = nodes.map((n, i) => (takesWallLines(n) ? i : -1)).filter((i) => i >= 0);
  const states: Array<[string, (i: number) => number | undefined]> = [
    ["all up", () => 1],
    ["every other half up", (i) => (walls.indexOf(i) % 2 === 1 ? 0.5 : 1)],
    ["every other not yet shown", (i) => (walls.indexOf(i) % 2 === 1 ? undefined : 1)],
  ];
  for (const w of walls) {
    const key = nodes[w]?.key ?? "";
    states.push(
      [`${key} half up`, (i) => (i === w ? 0.5 : 1)],
      [`${key} not yet shown`, (i) => (i === w ? undefined : 1)],
      [`${key} shown alone`, (i) => (i === w ? 1 : undefined)],
      [`${key} shown alone, half up`, (i) => (i === w ? 0.5 : undefined)],
    );
  }
  return states;
}

const FIXTURES: Record<string, string> = {
  "T, stem first": `plan "T" {\n  units mm\n  wall id=w_stem partition thickness 150 { (3000,0) (3000,3000) }\n  wall id=w_through partition thickness 150 { (0,3000) (6000,3000) }\n}\n`,
  "L of two walls": `plan "L" {\n  units mm\n  wall id=w_l1 exterior thickness 200 { (0,0) (0,4000) }\n  wall id=w_l2 exterior thickness 200 { (0,4000) (4000,4000) }\n}\n`,
  "columns against a wall face and a wall end": `plan "C" {\n  units mm\n  height 3000\n  wall id=w exterior thickness 200 { (0,0) (4000,0) }\n  column id=c1 at (1000,100) size 400x400\n  column id=c2 at (4100,-200) size 400x400\n}\n`,
  "walls of two thicknesses in line, flush on one face": `plan "S" {\n  units mm\n  height 3000\n  wall id=a exterior thickness 200 { (0,0) (3000,0) }\n  wall id=b exterior thickness 100 { (3000,50) (6000,50) }\n}\n`,
  "walls of two heights in line": `plan "H" {\n  units mm\n  height 3000\n  wall id=a exterior thickness 200 { (0,0) (3000,0) }\n  wall id=b exterior thickness 200 height 2000 { (3000,0) (6000,0) }\n}\n`,
  "a T of two heights": `plan "TH" {\n  units mm\n  height 3000\n  wall id=s partition thickness 150 height 2000 { (3000,0) (3000,3000) }\n  wall id=t partition thickness 150 { (0,3000) (6000,3000) }\n}\n`,
  "a window up to the wall top": `plan "O" {\n  units mm\n  height 3000\n  wall id=a exterior thickness 200 { (0,0) (6000,0) }\n  window id=wn on a at center width 1200 sill 900 head 3000\n}\n`,
  "a window across a T junction": `plan "X" {\n  units mm\n  height 3000\n  wall id=t exterior thickness 200 { (0,0) (6000,0) }\n  wall id=s partition thickness 100 { (3000,0) (3000,3000) }\n  window id=wn on t at center width 1200\n}\n`,
  "a diagonal wall in an L": `plan "D" {\n  units mm\n  height 3000\n  wall id=a exterior thickness 200 { (0,0) (3000,3000) }\n  wall id=b exterior thickness 200 { (3000,3000) (7000,3000) }\n}\n`,
  "a diagonal stem in a T": `plan "DT" {\n  units mm\n  height 3000\n  wall id=t partition thickness 150 { (0,3000) (7000,3000) }\n  wall id=s partition thickness 150 { (1000,0) (4000,3000) }\n}\n`,
};

describe("wall faces: every frame of the rise is closed (no slot through a wall, no open end)", () => {
  const plans: Array<[string, string]> = [
    ...Object.entries(FIXTURES),
    ["laneway-house", sourceOf("laneway-house.arch")],
    ["two-bed", sourceOf("two-bed.arch")],
    ["studio", sourceOf("studio.arch")],
    ["two-storey", sourceOf("two-storey.arch")],
  ];
  for (const [name, src] of plans) {
    it(`${name}: closed at every rise state tried`, () => {
      const { nodes } = outlined(src);
      const fixes = wallFaces(nodes);
      // The premise at a junction: two nodes there share a face, which the finished frame leaves out.
      if (name !== "a window up to the wall top")
        expect(
          fixes.some((f) => (f?.group ?? -1) >= 0),
          "a shared face",
        ).toBe(true);
      for (const [state, rise] of riseStates(nodes)) {
        expect(openEdges(drawnAt(nodes, fixes, rise)).slice(0, 4), `${name}, ${state}`).toEqual([]);
      }
    });
  }

  it("over the corpus, each node is closed by itself (its own inner faces out, its shared ones in), and so is each finished storey", () => {
    for (const [name, src] of EXAMPLES_LIST) {
      const { nodes } = outlined(src);
      const fixes = wallFaces(nodes);
      nodes.forEach((n, i) => {
        if (!takesWallLines(n)) return;
        expect(
          openEdges(drawnAt(nodes, fixes, (j) => (j === i ? 1 : undefined))).slice(0, 4),
          `${name} ${n.key}`,
        ).toEqual([]);
      });
      expect(openEdges(drawnAt(nodes, fixes, () => 1)).slice(0, 4), `${name}: the finished storeys`).toEqual([]);
    }
  });

  it("a group is the nodes that share a face, named by its lowest index, never across storeys", () => {
    const { nodes } = outlined(sourceOf("two-storey.arch"));
    const fixes = wallFaces(nodes);
    const storey = (i: number): string => nodes[i]?.key.split("/")[0] ?? "";
    let grouped = 0;
    fixes.forEach((f, i) => {
      if (!f || f.group < 0) {
        expect(f?.alone ?? [], nodes[i]?.key).toEqual([]);
        expect(f?.joined ?? [], nodes[i]?.key).toEqual([]);
        return;
      }
      grouped++;
      expect(f.group <= i, nodes[i]?.key).toBe(true);
      expect(fixes[f.group]?.group, nodes[i]?.key).toBe(f.group);
      expect(storey(f.group), nodes[i]?.key).toBe(storey(i));
      expect(f.alone.length, `${nodes[i]?.key}: its own faces where it meets another`).toBeGreaterThan(0);
    });
    const groups = new Set(fixes.map((f) => f?.group ?? -1).filter((g) => g >= 0));
    expect(groups.size).toBeGreaterThanOrEqual(2);
    expect(grouped).toBeGreaterThan(4);
  });
});

describe("wall faces: the switch to the finished storey is one function (card RM8.1b)", () => {
  const fix = (group: number): FaceFix => ({ hide: [], add: [], alone: [], joined: [], group });

  it("a group is joined only when every node in it stands; never node by node", () => {
    // Nodes 0, 1 and 3 are one group (0), node 2 is another (2), node 4 meets nothing.
    const fixes = [fix(0), fix(0), fix(2), fix(0), undefined, fix(-1)];
    const up = (...stands: number[]) => joinedGroups(fixes, (i) => stands.includes(i));
    expect([...up(0, 1, 2, 3, 4, 5)].sort()).toEqual([0, 2]);
    expect([...up(0, 1, 2, 4)].sort(), "node 3 is not up: group 0 stays alone").toEqual([2]);
    expect([...up(0, 1, 3)].sort(), "node 2 is not up: group 2 stays alone").toEqual([0]);
    expect([...up(0, 3)], "node 1 is not up").toEqual([]);
    expect([...up(4, 5)], "nodes outside any group name no group").toEqual([]);
  });

  it("over a laneway plan, one node short of full height keeps its whole group alone", () => {
    const { nodes } = outlined(sourceOf("laneway-house.arch"));
    const fixes = wallFaces(nodes);
    const grouped = fixes.flatMap((f, i) => (f && f.group >= 0 ? [i] : []));
    const all = joinedGroups(fixes, () => true);
    expect(all.size).toBeGreaterThanOrEqual(1);
    const g = fixes[grouped[0] as number]?.group as number;
    const members = grouped.filter((i) => fixes[i]?.group === g);
    expect(members.length).toBeGreaterThanOrEqual(2);
    for (const short of members)
      expect(joinedGroups(fixes, (i) => i !== short).has(g), `node ${short} short`).toBe(false);
  });
});

describe("wall faces: near-coplanar overlapping pieces built from a plan (card RM8.1b)", () => {
  // Two collinear 200 mm walls overlapping from 2000 to 3000, the second 0.001 mm (1 µm) off the
  // line of the first: their outer faces are parallel, overlap and are 1 µm apart in depth, so no
  // face may be taken for a shared one. A window on each adds sills and lintels.
  const src = `plan "N" {
  units mm
  height 3000
  wall id=a exterior thickness 200 { (0,0) (3000,0) }
  wall id=b exterior thickness 200 { (2000,0.001) (5000,0.001) }
  window id=wa on a at center width 800 sill 900 head 2100
  window id=wb on b at center width 800 sill 600 head 1800
}
`;

  it("leaves out no face between pieces a µm apart, and every rise state is closed", () => {
    const { nodes } = outlined(src);
    const fixes = wallFaces(nodes);
    const walls = nodes.filter(takesWallLines);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    // The two walls' long faces overlap in x yet are 1 µm apart: whatever the pieces share (the ends
    // of a wall's own sill, lintel and jambs), none of a through face of wall a is left out for b's.
    for (const [state, rise] of riseStates(nodes)) {
      expect(openEdges(drawnAt(nodes, fixes, rise)).slice(0, 4), state).toEqual([]);
    }
    nodes.forEach((n, i) => {
      if (!takesWallLines(n)) return;
      expect(openEdges(drawnAt(nodes, fixes, (j) => (j === i ? 1 : undefined))).slice(0, 4), n.key).toEqual([]);
    });
    expect(openEdges(drawnAt(nodes, fixes, () => 1)).slice(0, 4), "the finished storey").toEqual([]);
  });

  it("outlines both faces' ends at the overlap: the 1 µm step is a line, not a seam taken away", () => {
    const { segs } = outlined(src);
    // Wall b's start (x = 2000) stands in front of a's face by 1 µm: a vertical line at x = 2000 on b's face.
    const lines = segs.filter(
      (g) => g.a[0] === 2_000_000 && g.b[0] === 2_000_000 && g.a[2] === g.b[2] && g.a[1] !== g.b[1],
    );
    expect(lines.length).toBeGreaterThan(0);
  });
});

/** A closed box node, `x`, `y`, `z` each `[lo, hi]` in µm, every face wound counter-clockwise seen from outside. */
function box(key: string, x: [number, number], y: [number, number], z: [number, number]): LineSource {
  const positions: number[] = [];
  const indices: number[] = [];
  const centre = [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2];
  const quad = (c: V3[]): void => {
    const at = positions.length / 3;
    for (const p of c) positions.push(...p);
    const [a, b, d] = c as [V3, V3, V3, V3];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as V3;
    const w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]] as V3;
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const out = n.reduce((s, v, k) => s + v * ((a[k] as number) - (centre[k] as number)), 0) > 0;
    indices.push(...(out ? [at, at + 1, at + 2, at, at + 2, at + 3] : [at, at + 2, at + 1, at, at + 3, at + 2]));
  };
  const [x0, x1] = x;
  const [y0, y1] = y;
  const [z0, z1] = z;
  quad([
    [x0, y0, z0],
    [x0, y0, z1],
    [x0, y1, z1],
    [x0, y1, z0],
  ]);
  quad([
    [x1, y0, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x1, y0, z1],
  ]);
  quad([
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
  ]);
  quad([
    [x0, y1, z0],
    [x0, y1, z1],
    [x1, y1, z1],
    [x1, y1, z0],
  ]);
  quad([
    [x0, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y0, z0],
  ]);
  quad([
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ]);
  return { key, kind: "wall", positions, indices };
}

describe("wall faces: only faces that lie exactly on each other are left out", () => {
  const H: [number, number] = [0, 3_000_000];
  const T: [number, number] = [-100_000, 100_000];
  /** The vertical lines at `x` (µm) on the two outer faces. */
  const at = (nodes: LineSource[], x: number): number[][] =>
    wallLines(nodes)
      .flatMap((flat) => {
        const segs: number[][] = [];
        for (let j = 0; flat && j < flat.length; j += 6) segs.push(flat.slice(j, j + 6));
        return segs;
      })
      .filter((s) => s[0] === x && s[3] === x && s[2] === s[5] && s[1] !== s[4]);

  it("two boxes that touch share their end faces; one µm apart, nothing is left out", () => {
    const touching = [box("L1/wall:a", [0, 1_000_000], H, T), box("L1/wall:b", [1_000_000, 2_000_000], H, T)];
    const apart = [box("L1/wall:a", [0, 1_000_000], H, T), box("L1/wall:b", [1_000_001, 2_000_000], H, T)];
    const [ta, tb] = wallFaces(touching);
    expect([ta?.hide.length, tb?.hide.length, ta?.group, tb?.group]).toEqual([2, 2, 0, 0]);
    expect((ta?.joined.length ?? 0) + (tb?.joined.length ?? 0)).toBe(0);
    expect((ta?.alone.length ?? 0) / 9 + (tb?.alone.length ?? 0) / 9).toBe(4);
    for (const f of wallFaces(apart)) expect(f).toEqual({ hide: [], add: [], alone: [], joined: [], group: -1 });
    // The touching pair's outer faces run on flat: no line at the joint; one µm apart, each end is outlined.
    expect(at(touching, 1_000_000)).toEqual([]);
    expect(at(apart, 1_000_000).length).toBe(2);
    expect(at(apart, 1_000_001).length).toBe(2);
  });
});

describe("wall outlines: the cases the first round left untested", () => {
  it("walls of two thicknesses in line: a line at the step, none on the flush face", () => {
    const { level, segs } = outlined(FIXTURES["walls of two thicknesses in line, flush on one face"] as string);
    const e = level.elevation;
    const H = e + 3000 * MM;
    expect(level.walls.map((w) => w.thickness)).toEqual([200 * MM, 100 * MM]);
    expect(verticalAt(segs, 3100 * MM, 100 * MM), "the flush face").toEqual([]);
    expect(covers(verticalAt(segs, 3100 * MM, -100 * MM), e, H), "the step's outer corner").toBe(true);
    expect(covers(verticalAt(segs, 3100 * MM, 0), e, H), "the step's inner corner").toBe(true);
    expect(overlaps(horizontalOn(segs, H, [3100 * MM, 0], [3100 * MM, MM]), 0, 100 * MM), "the flush top").toBe(false);
    expect(covers(horizontalOn(segs, H, [3100 * MM, 0], [3100 * MM, MM]), -100 * MM, 0), "the step's top").toBe(true);
  });

  it("walls of two heights in line: the taller one's end is outlined above the lower, not below", () => {
    const { level, segs } = outlined(FIXTURES["walls of two heights in line"] as string);
    const e = level.elevation;
    for (const z of [-100, 100]) {
      const at = verticalAt(segs, 3100 * MM, z * MM);
      expect(covers(at, e + 2000 * MM, e + 3000 * MM), `z ${z}: above the lower wall`).toBe(true);
      expect(overlaps(at, e, e + 2000 * MM), `z ${z}: where both stand`).toBe(false);
    }
    expect(covers(horizontalOn(segs, e + 2000 * MM, [3100 * MM, 0], [3100 * MM, MM]), -100 * MM, 100 * MM)).toBe(true);
  });

  it("a window up to the wall top: no lintel, its reveals run to the top and the top is cut at each jamb", () => {
    const { level, segs } = outlined(FIXTURES["a window up to the wall top"] as string);
    const e = level.elevation;
    const [o] = level.openings;
    expect(o?.head).toBe(3000 * MM);
    for (const [x, y] of o?.cut ?? []) {
      expect(covers(verticalAt(segs, x, y), e + 900 * MM, e + 3000 * MM), `(${x / MM}, ${y / MM})`).toBe(true);
      expect(overlaps(verticalAt(segs, x, y), e, e + 900 * MM), `(${x / MM}, ${y / MM}) below the sill`).toBe(false);
    }
    for (const x of [2400, 3600])
      expect(covers(horizontalOn(segs, e + 3000 * MM, [x * MM, 0], [x * MM, MM]), -100 * MM, 100 * MM), `x ${x}`).toBe(
        true,
      );
  });

  it("a window across a T junction: the stem's end shows in the window, outlined at the sill and the head", () => {
    const { level, segs } = outlined(FIXTURES["a window across a T junction"] as string);
    const e = level.elevation;
    const [o] = level.openings;
    expect(o?.cut.some(([x]) => x < 2950 * MM) && o?.cut.some(([x]) => x > 3050 * MM)).toBe(true);
    for (const y of [o?.sill ?? 0, o?.head ?? 0])
      expect(
        covers(horizontalOn(segs, e + y, [0, 100 * MM], [MM, 100 * MM]), 2950 * MM, 3050 * MM),
        `at ${y / MM}`,
      ).toBe(true);
    // The stem's sides meet the through wall's face below the sill and above the head, and turn round
    // its end between: one line each side, the full height.
    for (const x of [2950, 3050])
      expect(covers(verticalAt(segs, x * MM, 100 * MM), e, e + 3000 * MM), `x ${x}`).toBe(true);
  });

  it("a diagonal stem in a T: on the through wall's face, lines only at the stem's sides", () => {
    const { segs } = outlined(FIXTURES["a diagonal stem in a T"] as string);
    const up = segs.filter(
      (s) => s.a[0] === s.b[0] && s.a[2] === s.b[2] && s.a[2] === 2925 * MM && s.a[0] > 0 && s.a[0] < 7000 * MM,
    );
    expect([...new Set(up.map((s) => s.a[0]))].sort((a, b) => a - b)).toEqual([3818934, 4031066]);
  });

  it("columns: the inside corners where a column meets a wall stay, and the wall face carries no line behind it", () => {
    const { level, segs } = outlined(FIXTURES["columns against a wall face and a wall end"] as string);
    const e = level.elevation;
    const H = e + 3000 * MM;
    for (const x of [1000, 1400]) expect(covers(verticalAt(segs, x * MM, 100 * MM), e, H), `x ${x}`).toBe(true);
    for (const y of [e, H])
      expect(overlaps(horizontalOn(segs, y, [0, 100 * MM], [MM, 100 * MM]), 1000 * MM, 1400 * MM), `${y}`).toBe(false);
    // The wall's end against the second column: its corners are on the column's face, inside corners.
    for (const z of [-100, 100]) expect(covers(verticalAt(segs, 4100 * MM, z * MM), e, H), `z ${z}`).toBe(true);
  });

  it("two storeys are worked out apart: one storey's faces and lines are the same with or without the other", () => {
    const { nodes } = outlined(sourceOf("two-storey.arch"));
    const full = wallOutline(nodes);
    const storeys = [...new Set(nodes.filter(takesWallLines).map((n) => n.key.split("/")[0]))];
    expect(storeys.length).toBe(2);
    for (const s of storeys) {
      const keep = nodes.map((n, i) => [n, i] as const).filter(([n]) => n.key.split("/")[0] === s);
      const part = wallOutline(keep.map(([n]) => n));
      keep.forEach(([n, i], j) => {
        if (!takesWallLines(n)) return;
        expect(part.lines[j], n.key).toEqual(full.lines[i]);
        const a = part.faces[j] as FaceFix;
        const b = full.faces[i] as FaceFix;
        expect([a.hide, a.add, a.alone, a.joined], n.key).toEqual([b.hide, b.add, b.alone, b.joined]);
      });
    }
  });

  it("a demolished wall (a ghost) keeps its own outline and takes no part: the others are the same without it", () => {
    const { nodes, out } = outlined(sourceOf("remodel.arch"));
    expect(nodes.filter((n) => n.kind === "wall" && n.part === "demolish").length).toBe(2);
    const fixes = wallFaces(nodes);
    nodes.forEach((n, i) => {
      if (n.part !== "demolish") return;
      expect(out[i], n.key).toBeUndefined();
      expect(fixes[i], n.key).toBeUndefined();
    });
    const standing = nodes.filter((n) => n.part !== "demolish");
    const without = wallOutline(standing);
    expect(without.faces.some((f) => (f?.hide.length ?? 0) > 0)).toBe(true);
    let j = 0;
    nodes.forEach((n, i) => {
      if (n.part === "demolish") return;
      expect(without.lines[j], n.key).toEqual(out[i]);
      for (const mode of ["joined", "alone"] as const)
        expect(drawnTriangles([n], [without.faces[j]], mode), n.key).toEqual(drawnTriangles([n], [fixes[i]], mode));
      j++;
    });
  });
});

describe("wall outlines: a line where two walls meet rises with the one raised last", () => {
  /** The nodes holding the vertical line over plan point `(x, z)` (µm). */
  const holders = (lines: Array<number[] | undefined>, nodes: readonly LineSource[], x: number, z: number): string[] =>
    nodes
      .filter((_, i) => {
        const flat = lines[i] ?? [];
        for (let j = 0; j < flat.length; j += 6)
          if (flat[j] === x && flat[j + 3] === x && flat[j + 2] === z && flat[j + 5] === z) return true;
        return false;
      })
      .map((n) => n.key);

  it("in the replay's build order, and on the other wall when the ranks are the other way round", () => {
    const { nodes, events } = outlined(FIXTURES["T, stem first"] as string);
    const rankOf = new Map(events.map((e) => [e.key, e.rank] as const));
    const rank = nodes.map((n) => rankOf.get(n.key) ?? 0);
    const stem = nodes.findIndex((n) => n.key.endsWith("wall:w_stem"));
    const through = nodes.findIndex((n) => n.key.endsWith("wall:w_through"));
    expect(stem >= 0 && through >= 0).toBe(true);
    // The premise: the stem is written first, so it rises first.
    expect((rank[stem] as number) < (rank[through] as number)).toBe(true);
    const corners: Array<[number, number]> = [
      [2925 * MM, 2925 * MM],
      [3075 * MM, 2925 * MM],
    ];
    const asBuilt = wallLines(nodes, rank);
    for (const [x, z] of corners) expect(holders(asBuilt, nodes, x, z), `${x / MM}`).toEqual(["L1/wall:w_through"]);
    const flipped = rank.map((r, i) => (i === stem ? 1e6 : r));
    const other = wallLines(nodes, flipped);
    for (const [x, z] of corners) expect(holders(other, nodes, x, z), `${x / MM}`).toEqual(["L1/wall:w_stem"]);
    // The same lines either way; only the node holding them moves.
    const all = (lines: Array<number[] | undefined>): string =>
      JSON.stringify(
        lines
          .flatMap((l) => {
            const segs: string[] = [];
            for (let j = 0; l && j < l.length; j += 6) segs.push(l.slice(j, j + 6).join(","));
            return segs;
          })
          .sort(),
      );
    expect(all(asBuilt)).toBe(all(other));
  });
});

describe("wall outlines: the 30° test is exact", () => {
  it("draws a line at a turn of just over 30° and none at just under, in integers", () => {
    // tan 30° = 0.5773502691896…: (1e6, 577350) turns just under 30°, (1e6, 577351) just over.
    expect(nearlyFlat([1, 0], [1_000_000, 577_350], 1, 1)).toBe(true);
    expect(nearlyFlat([1, 0], [1_000_000, 577_351], 1, 1)).toBe(false);
    // Past a double's exact products: the test is in BigInt throughout.
    expect(nearlyFlat([1, 0], [1_000_000_000_000, 577_350_269_189], 1, 1)).toBe(true);
    expect(nearlyFlat([1, 0], [1_000_000_000_000, 577_350_269_190], 1, 1)).toBe(false);
    // Facing: one direction, the faces facing apart, is a full turn back, never flat.
    expect(nearlyFlat([1, 0], [1, 0], 1, -1)).toBe(false);
    expect(nearlyFlat([1, 0], [1, 0], -1, -1)).toBe(true);
    expect(nearlyFlat([1, 0], [-1, 0], 1, -1)).toBe(true);
    // 45° and 90°.
    expect(nearlyFlat([1, 0], [1, 1], 1, 1)).toBe(false);
    expect(nearlyFlat([1, 0], [0, 1], 1, 1)).toBe(false);
  });

  it("decides a turn a double cannot tell from 30°, as the outline of two faces", () => {
    // Integer directions never turn exactly 30° (d² = 3c² has no solution but 0), but they come as
    // close as a double's last bit: p² − 3q² = 1 turns just under 30° (flat, no line), p² − 3q² = −2
    // just over (a line). cos θ in doubles reads 0.8660254037844387 for the first, which is not more
    // than `Math.cos(π / 6)`, so a floating-point test drew a line there.
    const H = 3_000_000;
    const strip = (p: number, q: number): LineSource => ({
      key: "L1/wall:w",
      kind: "wall",
      // Two vertical quads meeting over (0, 0): one along +x, one along (p, q); wound alike.
      positions: [-1_000_000, 0, 0, 0, 0, 0, 0, H, 0, -1_000_000, H, 0, p, 0, q, p, H, q],
      indices: [0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2],
    });
    const at0 = (n: LineSource): number[][] => {
      const flat = wallLines([n])[0] ?? [];
      const out: number[][] = [];
      for (let j = 0; j < flat.length; j += 6) {
        const s = flat.slice(j, j + 6);
        if (s[0] === 0 && s[2] === 0 && s[3] === 0 && s[5] === 0) out.push(s);
      }
      return out;
    };
    expect(189_750_626 ** 2 - 3 * 109_552_575 ** 2).not.toBe(1); // the premise: not exact in doubles
    expect(nearlyFlat([1, 0], [189_750_626, 109_552_575], 1, 1)).toBe(true);
    expect(nearlyFlat([1, 0], [518_408_351, 299_303_201], 1, 1)).toBe(false);
    expect(at0(strip(189_750_626, 109_552_575))).toEqual([]);
    expect(at0(strip(518_408_351, 299_303_201))).toEqual([[0, 0, 0, 0, H, 0]]);
  });
});
