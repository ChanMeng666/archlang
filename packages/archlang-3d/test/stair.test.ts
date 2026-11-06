/**
 * Stairs in the 3D preview (card X3): stepped solids from the core's own stair geometry, never from
 * a bounding box. Checked against the core directly (`resolvePlan`'s `RStair`, `entryEdges`,
 * `treadCount`), not against the adapter that read them: every stair of the corpus is closed and
 * wound outward in whole micrometres, covers exactly its flight bands and landings, climbs
 * `Σ (treads + 1)` equal risers to the floor above, stands its treads on the drawing's tread lines,
 * is its own mirror image across each flight's centreline, and is built once per climb.
 */
import { entryEdges, type RStair, resolvePlan, treadCount } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type MeshNode, type Scene3D, stairRisers, stairSolid } from "../src/index.js";
import { openEdges, signedVolume } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const MM = 1000;
const FINISH = 5 * MM;

function adapted(source: string) {
  const r = adaptPlan(source, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  return r;
}

/** The examples that place a stair (outside comments), read from the corpus, never listed by hand. */
const STAIRED = EXAMPLES_LIST.filter(([, s]) => /^\s*stair\b/m.test(s));

/** The core's stairs per storey (lowest first), with each storey's elevation and height (mm). */
function coreStoreys(source: string) {
  const res = resolvePlan(source, { world: WORLD });
  const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : res.ir ? [res.ir] : [];
  return irs.map((ir) => ({
    elevation: ir.elevation,
    storeyHeight: ir.storeyHeight,
    stairs: ir.elements.filter((e): e is RStair => e.kind === "stair"),
  }));
}

/** A straight run of the core: its rectangle (mm), the edge a climb starts from and its tread count. */
interface Run {
  x: number;
  y: number;
  w: number;
  h: number;
  foot: "top" | "bottom" | "left" | "right";
  n: number;
}
const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
function runsOf(s: RStair): Run[] {
  // A turning stair's flights carry their tails; a straight stair's is the core's `entryEdges`.
  const tails: Array<{ at: { x: number; y: number }; size: { w: number; h: number }; tail: Run["foot"] }> =
    s.flights ?? [{ at: s.at, size: s.size, tail: entryEdges(s)[0] as Run["foot"] }];
  return tails.map((f) => {
    const foot = s.dir === "up" ? f.tail : opposite[f.tail];
    const alongY = f.tail === "top" || f.tail === "bottom";
    return { x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h, foot, n: treadCount(alongY ? f.size.h : f.size.w) };
  });
}
const alongY = (r: Run): boolean => r.foot === "top" || r.foot === "bottom";

/** A run's flight band (µm), the stair's width centred across the run, as the drawing centres it. */
function band(r: Run, width: number): [number, number, number, number] {
  if (alongY(r)) {
    const x0 = r.x + (r.w - width) / 2;
    return [x0 * MM, r.y * MM, (x0 + width) * MM, (r.y + r.h) * MM];
  }
  const y0 = r.y + (r.h - width) / 2;
  return [r.x * MM, y0 * MM, (r.x + r.w) * MM, (y0 + width) * MM];
}

/** [minX, minY, minZ, maxX, maxY, maxZ] over shells (µm, glTF axes: X plan x, Y up, Z plan y). */
function extent(shells: MeshNode["shells"]): [number, number, number, number, number, number] {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const s of shells)
    s.positions.forEach((p, i) => {
      lo[i % 3] = Math.min(lo[i % 3] as number, p);
      hi[i % 3] = Math.max(hi[i % 3] as number, p);
    });
  return [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]] as [number, number, number, number, number, number];
}

const corpus = STAIRED.map(([n, src]) => {
  const r = adapted(src);
  return { n, src, scene: r.scene, mesh: buildMesh(r.scene), core: coreStoreys(src) };
});
const stairNodes = (m: { nodes: MeshNode[] }): MeshNode[] => m.nodes.filter((x) => x.kind === "stair");

describe("stairs on the shipped corpus", () => {
  it("the corpus holds straight and turning stairs on one and several storeys", () => {
    expect(corpus.map((c) => c.n)).toEqual(
      expect.arrayContaining(["turning-stair.arch", "two-storey.arch", "library.arch"]),
    );
    expect(corpus.some((c) => c.core.some((l) => l.stairs.some((s) => s.flights)))).toBe(true);
  });

  it("builds each climb once: every `dir up` stair, never the `dir down` stop above it", () => {
    for (const c of corpus) {
      const expected = c.core.flatMap((l, i) =>
        l.stairs.filter((s) => s.dir === "up").map((s) => `L${c.scene.levels[i]?.level}/stair:${s.id}`),
      );
      expect(
        stairNodes(c.mesh).map((x) => x.key),
        c.n,
      ).toEqual(expected.sort());
    }
  });

  it("every stair shell is closed, wound outward, in whole micrometres, with no NaN", () => {
    for (const c of corpus)
      for (const node of stairNodes(c.mesh)) {
        expect(node.shells.length, node.key).toBeGreaterThan(0);
        for (const s of node.shells) {
          expect(openEdges(s), node.key).toBe(0);
          expect(signedVolume(s), node.key).toBeGreaterThan(0);
          expect(
            s.positions.every((p) => Number.isInteger(p)),
            node.key,
          ).toBe(true);
        }
      }
  });

  it("covers exactly the core's flight bands and landings, from the floor finish to the top tread", () => {
    for (const c of corpus) {
      c.core.forEach((l, i) => {
        const lv = c.scene.levels[i] as Scene3D["levels"][number];
        const above = c.core[i + 1];
        for (const s of l.stairs.filter((t) => t.dir === "up")) {
          const node = stairNodes(c.mesh).find((x) => x.key === `L${lv.level}/stair:${s.id}`) as MeshNode;
          const runs = runsOf(s);
          const rects = [
            ...runs.map((r) => band(r, s.width)),
            ...(s.landings ?? []).map((p) => [
              p.at.x * MM,
              p.at.y * MM,
              (p.at.x + p.size.w) * MM,
              (p.at.y + p.size.h) * MM,
            ]),
          ];
          const rise = ((above ? above.elevation : l.elevation + l.storeyHeight) - l.elevation) * MM;
          const R = runs.reduce((k, r) => k + r.n + 1, 0);
          const z0 = l.elevation * MM + FINISH;
          const [x0, y0, z0p, x1, y1, z1p] = extent(node.shells);
          expect([x0, z0p, x1, z1p], `${c.n} ${s.id}`).toEqual([
            Math.min(...rects.map((r) => r[0] as number)),
            Math.min(...rects.map((r) => r[1] as number)),
            Math.max(...rects.map((r) => r[2] as number)),
            Math.max(...rects.map((r) => r[3] as number)),
          ]);
          expect([y0, y1], `${c.n} ${s.id}`).toEqual([z0, z0 + Math.round((rise * (R - 1)) / R)]);
          expect(node.extras.risers, `${c.n} ${s.id}`).toBe(R);
          // One flight's shell for each flight, one box for each landing.
          expect(node.shells.length).toBe(runs.length + (s.landings?.length ?? 0));
        }
      });
    }
  });

  it("climbs Σ (treads + 1) equal risers: every height a riser top, the floor above one more", () => {
    for (const c of corpus) {
      c.core.forEach((l, i) => {
        const lv = c.scene.levels[i] as Scene3D["levels"][number];
        const above = c.core[i + 1];
        for (const s of l.stairs.filter((t) => t.dir === "up")) {
          const node = stairNodes(c.mesh).find((x) => x.key === `L${lv.level}/stair:${s.id}`) as MeshNode;
          const R = runsOf(s).reduce((k, r) => k + r.n + 1, 0);
          const rise = ((above ? above.elevation : l.elevation + l.storeyHeight) - l.elevation) * MM;
          const z0 = l.elevation * MM + FINISH;
          const heights = new Set(node.shells.flatMap((sh) => sh.positions.filter((_, k) => k % 3 === 1)));
          const tops = Array.from({ length: R - 1 }, (_, k) => z0 + Math.round((rise * (k + 1)) / R));
          expect(
            [...heights].sort((a, b) => a - b),
            `${c.n} ${s.id}`,
          ).toEqual([z0, ...tops]);
          // The riser that would come next is the floor above, exactly.
          expect(z0 + Math.round((rise * R) / R)).toBe(z0 + rise);
          if (above) expect(z0 + rise).toBe(above.elevation * MM + FINISH);
        }
      });
    }
  });

  it("stands its treads on the drawing's tread lines: run / treadCount(run) apart from the foot", () => {
    for (const c of corpus) {
      c.core.forEach((l, i) => {
        const lv = c.scene.levels[i] as Scene3D["levels"][number];
        for (const s of l.stairs.filter((t) => t.dir === "up")) {
          const node = stairNodes(c.mesh).find((x) => x.key === `L${lv.level}/stair:${s.id}`) as MeshNode;
          runsOf(s).forEach((r, k) => {
            // Shells in climbing order: flight, landing, flight …, so flight k is shell 2k.
            const shell = node.shells[2 * k] as MeshNode["shells"][number];
            const axis = alongY(r) ? 2 : 0; // glTF Z is plan y
            const along = new Set(shell.positions.filter((_, j) => j % 3 === axis));
            const start = alongY(r) ? (r.foot === "top" ? r.y : r.y + r.h) : r.foot === "left" ? r.x : r.x + r.w;
            const sign = r.foot === "top" || r.foot === "left" ? 1 : -1;
            const run = (alongY(r) ? r.h : r.w) * MM;
            const lines = Array.from({ length: r.n + 1 }, (_, t) => start * MM + sign * Math.round((run * t) / r.n));
            expect(
              [...along].sort((a, b) => a - b),
              `${c.n} ${s.id} flight ${k + 1}`,
            ).toEqual(lines.sort((a, b) => a - b));
          });
        }
      });
    }
  });

  it("is its own mirror image across each flight's centreline (a stair has no hand)", () => {
    for (const c of corpus)
      for (const node of stairNodes(c.mesh))
        for (const s of node.shells) {
          const [x0, , z0, x1, , z1] = extent([s]);
          // Mirror across the cross axis' centre; the run axis is the shell's other plan axis. A
          // landing box is symmetric both ways, so either reflection may be tested on it.
          const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
          const pts = new Set<string>();
          for (let k = 0; k < s.positions.length; k += 3)
            pts.add(key(s.positions[k] as number, s.positions[k + 1] as number, s.positions[k + 2] as number));
          const mirrorX = [...pts].every((p) => {
            const [x, y, z] = p.split(",").map(Number) as [number, number, number];
            return pts.has(key(x0 + x1 - x, y, z));
          });
          const mirrorZ = [...pts].every((p) => {
            const [x, y, z] = p.split(",").map(Number) as [number, number, number];
            return pts.has(key(x, y, z0 + z1 - z));
          });
          expect(mirrorX || mirrorZ, node.key).toBe(true);
        }
  });
});

describe("the turning stair (examples/turning-stair.arch)", () => {
  const c = corpus.find((x) => x.n === "turning-stair.arch") as (typeof corpus)[number];
  const node = stairNodes(c.mesh)[0] as MeshNode;

  it("climbs 2750 mm on 12 risers: 5 treads and a head riser per flight, the landing at the 6th", () => {
    // Hand-derived: each 1530 mm flight is drawn with round(1530 / 280) = 5 treads; 2 × (5 + 1) =
    // 12 risers of 2750 / 12 mm; the landing is the 6th riser, 1375 mm over the 5 mm finish.
    expect(node.extras).toMatchObject({ dir: "up", flights: 2, risers: 12, rise_mm: 2750 });
    const landing = node.shells[1] as MeshNode["shells"][number];
    const [, , , , top] = extent([landing]);
    expect(top).toBe(1_380_000);
    expect(extent([landing])).toEqual([2_630_000, 5_000, 100_000, 3_630_000, 1_380_000, 1_100_000]);
    // The second flight starts on it: its first tread is the 7th riser, 2750 × 7 / 12 mm up.
    const second = node.shells[2] as MeshNode["shells"][number];
    const heights = [...new Set(second.positions.filter((_, k) => k % 3 === 1))].sort((a, b) => a - b);
    expect(heights[1]).toBe(5_000 + Math.round((2_750_000 * 7) / 12));
    expect(heights.at(-1)).toBe(5_000 + Math.round((2_750_000 * 11) / 12));
  });

  it("ledgers what it derived and what it assumed: risers, material and form; the old rule narrowed", () => {
    const rules = c.mesh.assumptions.map((a) => a.rule);
    expect(rules).toEqual(
      expect.arrayContaining(["stair-risers-from-treads", "stair-material-default", "stair-solid-default"]),
    );
    expect(rules).not.toContain("m1-omits-stairs-outdoor-fences");
    expect(c.mesh.assumptions.filter((a) => a.rule === "m1-omits-outdoor-fences").map((a) => a.kind)).toEqual([
      "outdoor",
      "fence",
    ]);
  });
});

const SHELL = `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }`;
const room = (id: string) => `room id=${id} at (0,0) size 6000x6000 label "R" uses hall`;
const plan = (l1: string, l2?: string) => `plan "p" { units mm
  level 1 "G" { ${SHELL} ${room("a")} door id=d at (3000,6000) width 900 wall shell swing in ${l1} }
  ${l2 === undefined ? "" : `level 2 "U" { ${SHELL} ${room("b")} void id=well at (1000,1000) size 1000x3000 ${l2} }`}
}`;
const STRAIGHT = (dir: string) => `stair id=st at (1000,1000) size 1000x3000 dir ${dir}`;

describe("which storey builds a stair", () => {
  it("a `dir down` stop with no `dir up` stair below is built from the storey below, once", () => {
    const m = buildMesh(adapted(plan("", STRAIGHT("down"))).scene);
    expect(stairNodes(m).map((x) => [x.key, x.extras.from_storey_above])).toEqual([["L1/stair:st", true]]);
  });

  it("a `dir down` stair on the lowest storey has nothing to climb from: not built, and ledgered", () => {
    const m = buildMesh(adapted(plan(STRAIGHT("down"))).scene);
    expect(stairNodes(m)).toEqual([]);
    expect(m.assumptions.filter((a) => a.kind === "stair").map((a) => [a.id, a.rule])).toEqual([
      ["st", "stair-down-no-storey-below"],
    ]);
  });

  it("a `dir up` stair on the top storey climbs that storey's height, ledgered", () => {
    const m = buildMesh(adapted(plan(STRAIGHT("up"))).scene);
    const node = stairNodes(m)[0] as MeshNode;
    expect(node.extras.rise_mm).toBe(3000);
    expect(m.assumptions.some((a) => a.rule === "stair-rise-storey-height" && a.id === "st")).toBe(true);
  });

  it("a stair narrower than its footprint stands centred in it, its band the stair's width", () => {
    const m = buildMesh(adapted(plan("stair id=st at (1000,1000) size 1600x3000 dir up width 1000", "")).scene);
    const [x0, , , x1] = extent((stairNodes(m)[0] as MeshNode).shells);
    expect([x0, x1]).toEqual([1_300_000, 2_300_000]);
  });
});

describe("a Scene3D without flights (a core without `treadCount`, or one written before 0.4.0)", () => {
  it("builds no stair and ledgers it, never a guess from the bounding box", () => {
    const scene = adapted(plan(STRAIGHT("up"), "")).scene;
    const old: Scene3D = {
      ...scene,
      levels: scene.levels.map((lv) => ({
        ...lv,
        stairs: lv.stairs.map(({ flights: _f, landings: _l, ...s }) => s),
      })),
    };
    const m = buildMesh(old);
    expect(stairNodes(m)).toEqual([]);
    expect(m.assumptions.some((a) => a.rule === "stair-no-flights" && a.id === "st")).toBe(true);
  });

  it("stairSolid refuses a stair without flights or a rise that is not positive", () => {
    const s = adapted(plan(STRAIGHT("up"))).scene.levels[0]?.stairs[0];
    expect(s && stairSolid({ ...s, flights: undefined }, 0, 3_000_000)).toBeNull();
    expect(s && stairSolid(s, 0, 0)).toBeNull();
    expect(stairRisers([{ treads: 5 }, { treads: 5 }])).toBe(12);
  });
});

describe("determinism", () => {
  it("two builds of every staired example are byte-identical", () => {
    for (const [n, src] of STAIRED) {
      const a = JSON.stringify(stairNodes(buildMesh(adapted(src).scene)));
      const b = JSON.stringify(stairNodes(buildMesh(adapted(src).scene)));
      expect(a, n).toBe(b);
    }
  });
});
