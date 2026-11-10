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
import { type LineSource, takesWallLines, wallFaces, wallLines, withFaces } from "../src/replay/wall-lines.js";
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
  const nodes = replayPayload(mesh, { title: "t", svg: compile(src, { world: WORLD }).svg }).nodes;
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
  return { level: r.scene.levels[0] as Level, nodes, out, segs };
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

  it("an X junction keeps its four inside corners", () => {
    const { level, segs } = outlined(`plan "X" {
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

    it(`${name}: the same faces drawn, whatever order the triangles come in`, () => {
      const { nodes } = outlined(sourceOf(name));
      const turned = shuffled(nodes);
      expect(drawnTriangles(turned, wallFaces(turned))).toEqual(drawnTriangles(nodes, wallFaces(nodes)));
    });
  }
});

/**
 * Every triangle drawn for an outlined node once its `FaceFix` is applied, as `<node>|<corners>`,
 * each starting at its least corner (its winding kept), sorted: what is drawn, whatever the order.
 */
function drawnTriangles(nodes: readonly LineSource[], fixes: ReturnType<typeof wallFaces>): string[] {
  const all: string[] = [];
  nodes.forEach((n, i) => {
    if (!takesWallLines(n)) return;
    const d = withFaces(n, fixes[i]);
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

  it("leaves what is seen as it was: over the corpus, each wall plane keeps its net facing area", () => {
    // An inner face is a pair of faces of opposite facing over the same area: leaving both out
    // keeps every plane's signed area (+ one facing, − the other), and only they may go.
    for (const [name, src] of EXAMPLES_LIST) {
      const { nodes } = outlined(src);
      const before = planeAreas(nodes);
      const after = planeAreas(drawnNodes(nodes));
      expect(
        [...after.keys()].filter((k) => !before.has(k)),
        `${name}: a new plane`,
      ).toEqual([]);
      for (const [k, a] of before) {
        const b = after.get(k) ?? { signed: 0, total: 0 };
        expect(
          Math.abs(b.signed - a.signed) <= 1e-6 * Math.max(1, a.total),
          `${name} ${k}: ${a.signed} → ${b.signed}`,
        ).toBe(true);
        expect(b.total <= a.total * (1 + 1e-9), `${name} ${k}: more drawn than before`).toBe(true);
      }
    }
  });
});

/**
 * Per vertical plane of the outlined nodes (its storey, its normal's direction, its offset), the
 * signed area of its triangles (facing one way +, the other −) and their total area, in mm².
 */
function planeAreas(nodes: readonly LineSource[]): Map<string, { signed: number; total: number }> {
  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
  const out = new Map<string, { signed: number; total: number }>();
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
      const key = `${storey} ${dx},${dz} @${dx * (a[2] as number) - dz * (a[0] as number)}`;
      const u = [0, 1, 2].map((d) => ((b[d] as number) - (a[d] as number)) / MM);
      const w = [0, 1, 2].map((d) => ((c[d] as number) - (a[d] as number)) / MM);
      const nx = (u[1] as number) * (w[2] as number) - (u[2] as number) * (w[1] as number);
      const nz = (u[0] as number) * (w[1] as number) - (u[1] as number) * (w[0] as number);
      const twice = Math.hypot(nx, nz);
      if (twice === 0) continue;
      // Facing: along the plane's normal (−dz, dx) or against it.
      const sign = nx * -dz + nz * dx > 0 ? 1 : -1;
      const was = out.get(key) ?? { signed: 0, total: 0 };
      out.set(key, { signed: was.signed + (sign * twice) / 2, total: was.total + twice / 2 });
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
