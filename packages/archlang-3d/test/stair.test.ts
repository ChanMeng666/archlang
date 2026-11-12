/**
 * Stairs in the 3D preview (card X3; in their parts since product-roadmap card RM8.6): from the
 * core's own stair geometry, never from a bounding box. Checked against the core directly
 * (`resolvePlan`'s `RStair`, `entryEdges`, `treadCount`), not against the adapter that read them:
 * every stair of the corpus is closed and wound outward in whole micrometres; its treads, landings
 * and stringers cover exactly its flight bands and landings; it climbs `Σ (treads + 1)` equal risers
 * to the floor above, a tread board under each riser top; its treads stand on the drawing's tread
 * lines, less their nosing; its treads and stringers are their own mirror image across each
 * flight's centreline; it is built once per climb; and its balustrade stands on the edges the probe
 * finds open, mirrored with the plan.
 */
import { entryEdges, type RStair, resolvePlan, treadCount } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import {
  adaptPlan,
  buildMesh,
  type MeshNode,
  type Scene3D,
  STAIR_DETAIL,
  stairDetail,
  stairRisers,
  stairSolid,
} from "../src/index.js";
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
/** Each stair's own node (its treads and landings), one per climb. */
const stairNodes = (m: { nodes: MeshNode[] }): MeshNode[] =>
  m.nodes.filter((x) => x.kind === "stair" && x.part === undefined);
/** A stair's node and its parts (stringers, rail), by the stair's key. */
const partsOf = (m: { nodes: MeshNode[] }, key: string, part: string): MeshNode | undefined =>
  m.nodes.find((x) => x.key === `${key}:${part}`);

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
      for (const node of c.mesh.nodes.filter((x) => x.kind === "stair")) {
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

  it("covers exactly the core's flight bands and landings with its treads, landings and stringers, floor to floor", () => {
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
          const stringers = partsOf(c.mesh, node.key, "stringer") as MeshNode;
          const [x0, y0, z0p, x1, y1, z1p] = extent([...node.shells, ...stringers.shells]);
          expect([x0, z0p, x1, z1p], `${c.n} ${s.id}`).toEqual([
            Math.min(...rects.map((r) => r[0] as number)),
            Math.min(...rects.map((r) => r[1] as number)),
            Math.max(...rects.map((r) => r[2] as number)),
            Math.max(...rects.map((r) => r[3] as number)),
          ]);
          // The stringers stand on the floor and reach the floor above; the top tread is a riser short.
          expect([y0, y1], `${c.n} ${s.id}`).toEqual([z0, z0 + rise]);
          expect(extent(node.shells)[4], `${c.n} ${s.id}`).toBe(z0 + Math.round((rise * (R - 1)) / R));
          expect(node.extras.risers, `${c.n} ${s.id}`).toBe(R);
          // A tread for each tread line and a box for each landing; two stringers a flight.
          expect(node.shells.length).toBe(runs.reduce((k, r) => k + r.n, 0) + (s.landings?.length ?? 0));
          expect(stringers.shells.length).toBe(2 * runs.length);
        }
      });
    }
  });

  it("climbs Σ (treads + 1) equal risers: every tread top a riser top, the floor above one more", () => {
    for (const c of corpus) {
      c.core.forEach((l, i) => {
        const lv = c.scene.levels[i] as Scene3D["levels"][number];
        const above = c.core[i + 1];
        for (const s of l.stairs.filter((t) => t.dir === "up")) {
          const node = stairNodes(c.mesh).find((x) => x.key === `L${lv.level}/stair:${s.id}`) as MeshNode;
          const R = runsOf(s).reduce((k, r) => k + r.n + 1, 0);
          const rise = ((above ? above.elevation : l.elevation + l.storeyHeight) - l.elevation) * MM;
          const z0 = l.elevation * MM + FINISH;
          // Each tread's top, and each landing's, is a riser top; a tread is a board under it.
          const T = STAIR_DETAIL.tread(rise / R / MM) * MM;
          const topsOf = node.shells.map((sh) => extent([sh])[4]);
          const tops = Array.from({ length: R - 1 }, (_, k) => z0 + Math.round((rise * (k + 1)) / R));
          expect(
            [...topsOf].sort((a, b) => a - b),
            `${c.n} ${s.id}`,
          ).toEqual(tops);
          for (const sh of node.shells) {
            const [, lo, , , hi] = extent([sh]);
            expect(lo === z0 || hi - lo === T, `${c.n} ${s.id}: a board ${T / MM} mm thick, or a landing`).toBe(true);
          }
          // The riser that would come next is the floor above, exactly.
          expect(z0 + Math.round((rise * R) / R)).toBe(z0 + rise);
          if (above) expect(z0 + rise).toBe(above.elevation * MM + FINISH);
        }
      });
    }
  });

  it("stands its treads on the drawing's tread lines: each from its line (less the nosing) to the next", () => {
    for (const c of corpus) {
      c.core.forEach((l, i) => {
        const lv = c.scene.levels[i] as Scene3D["levels"][number];
        for (const s of l.stairs.filter((t) => t.dir === "up")) {
          const node = stairNodes(c.mesh).find((x) => x.key === `L${lv.level}/stair:${s.id}`) as MeshNode;
          // Shells in climbing order: flight 1's treads, its landing, flight 2's treads …
          let at = 0;
          runsOf(s).forEach((r, k) => {
            const axis = alongY(r) ? 2 : 0; // glTF Z is plan y
            const start = alongY(r) ? (r.foot === "top" ? r.y : r.y + r.h) : r.foot === "left" ? r.x : r.x + r.w;
            const sign = r.foot === "top" || r.foot === "left" ? 1 : -1;
            const run = (alongY(r) ? r.h : r.w) * MM;
            const line = (t: number): number => start * MM + sign * Math.round((run * t) / r.n);
            const nosing = STAIR_DETAIL.nosing(run / r.n / MM) * MM;
            for (let t = 0; t < r.n; t++) {
              const shell = node.shells[at + t] as MeshNode["shells"][number];
              const e = extent([shell]);
              const front = t === 0 ? line(0) : line(t) - sign * nosing;
              expect([e[axis], e[axis + 3]], `${c.n} ${s.id} flight ${k + 1} tread ${t + 1}`).toEqual(
                [front, line(t + 1)].sort((a, b) => a - b),
              );
            }
            at += r.n + 1;
          });
        }
      });
    }
  });

  it("its treads and landings are their own mirror image across each flight's centreline (no hand)", () => {
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
    // Flight 1's five treads, then the landing, then flight 2's five.
    const landing = node.shells[5] as MeshNode["shells"][number];
    const [, , , , top] = extent([landing]);
    expect(top).toBe(1_380_000);
    expect(extent([landing])).toEqual([2_630_000, 5_000, 100_000, 3_630_000, 1_380_000, 1_100_000]);
    // The second flight starts on it: its first tread is the 7th riser, 2750 × 7 / 12 mm up.
    const second = node.shells.slice(6).map((sh) => extent([sh])[4]);
    expect(second[0]).toBe(5_000 + Math.round((2_750_000 * 7) / 12));
    expect(second.at(-1)).toBe(5_000 + Math.round((2_750_000 * 11) / 12));
  });

  it("ledgers what it derived and what it assumed: risers, materials and every part; the old rules gone", () => {
    const rules = c.mesh.assumptions.map((a) => a.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        "stair-risers-from-treads",
        "stair-material-default",
        "stair-rail-material-default",
        "stair-tread-default",
        "stair-open-riser",
        "stair-stringer-default",
        "stair-landing-solid",
        "stair-balustrade-default",
        "stair-balustrade-side",
        "stair-void-guard-omitted",
      ]),
    );
    // Card RM8.6: the stair is no longer one solid.
    expect(rules).not.toContain("stair-solid-default");
    // What each edge met: the inner (well) side of each flight is open, the outer one a wall; the
    // landing is walled on two sides and meets a flight on the other two.
    expect(
      c.mesh.assumptions.filter((a) => a.rule === "stair-balustrade-side").map((a) => `${a.field}=${a.value}`),
    ).toEqual([
      "side(flight 1, left)=open",
      "side(flight 1, right)=wall",
      "side(flight 2, top)=wall",
      "side(flight 2, bottom)=open",
      "side(landing 1, top)=wall",
      "side(landing 1, right)=wall",
      "side(landing 1, bottom)=flight",
      "side(landing 1, left)=flight",
    ]);
    expect(rules).not.toContain("m1-omits-stairs-outdoor-fences");
    // Card RM8.3 builds outdoor surfaces and fences too, so the narrowed rule is gone as well.
    expect(rules).not.toContain("m1-omits-outdoor-fences");
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
    const [x0, , , x1] = extent((partsOf(m, "L1/stair:st", "stringer") as MeshNode).shells);
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

  it("stairSolid and stairDetail refuse a stair without flights or a rise that is not positive", () => {
    const s = adapted(plan(STRAIGHT("up"))).scene.levels[0]?.stairs[0];
    expect(s && stairSolid({ ...s, flights: undefined }, 0, 3_000_000)).toBeNull();
    expect(s && stairSolid(s, 0, 0)).toBeNull();
    expect(s && stairDetail({ ...s, flights: undefined }, 0, 3_000_000, () => false)).toBeNull();
    expect(s && stairDetail(s, 0, 0, () => false)).toBeNull();
    expect(stairRisers([{ treads: 5 }, { treads: 5 }])).toBe(12);
  });
});

// Card RM8.6, design `visual-language.md` §2.3 and §2.5: the balustrade's edges come from the
// shape (a wall 100 mm past the band, or none), so a reflected plan builds the reflected stair.
describe("the balustrade (card RM8.6)", () => {
  const kit =
    "component k() { wall id=w partition thickness 200 { (0,0) (0,4000) } stair id=s at (100,500) size 1000x3000 dir up }";
  const plain = buildMesh(adapted(`plan "m" { units mm ${kit} place k() as a at (0,0) }`).scene);
  const mirrored = buildMesh(adapted(`plan "m" { units mm ${kit} place k() as a at (3000,0) mirror x }`).scene);
  const sides = (m: typeof plain) =>
    m.assumptions.filter((a) => a.rule === "stair-balustrade-side").map((a) => `${a.field}=${a.value}`);

  it("stands on the open edge only: the flight against the wall has none on that side", () => {
    expect(sides(plain)).toEqual(["side(flight 1, left)=wall", "side(flight 1, right)=open"]);
    const rail = partsOf(plain, "L1/stair:a.s", "rail") as MeshNode;
    // A handrail, a baluster a tread (11) and a newel at each end, all over the right stringer.
    expect(rail.shells.length).toBe(1 + 11 + 2);
    const [x0, , , x1] = extent(rail.shells);
    expect(x0).toBeGreaterThan(1_000_000);
    expect(x1).toBeLessThanOrEqual(1_100_000 + (STAIR_DETAIL.newel(1000) * MM) / 2);
    // The head newel, the highest piece: 100 mm over the handrail, whose top is 900 mm over the
    // nosing line, which reaches the floor above (the 5 mm finish + this storey's 3000 mm) at the head.
    expect(extent(rail.shells)[4]).toBe(5_000 + 3_000_000 + 900_000 + 100_000);
  });

  it("a mirrored plan builds the mirrored stair, part by part (`place … mirror x`)", () => {
    expect(sides(mirrored)).toEqual(["side(flight 1, left)=open", "side(flight 1, right)=wall"]);
    const points = (n: MeshNode | undefined, flip: boolean): string[] =>
      [
        ...new Set(
          (n?.shells ?? []).flatMap((s) =>
            Array.from({ length: s.positions.length / 3 }, (_, k) => {
              const x = s.positions[3 * k] as number;
              return `${flip ? 3_000_000 - x : x},${s.positions[3 * k + 1]},${s.positions[3 * k + 2]}`;
            }),
          ),
        ),
      ].sort();
    for (const key of ["L1/stair:a.s", "L1/stair:a.s:stringer", "L1/stair:a.s:rail"]) {
      const a = plain.nodes.find((n) => n.key === key);
      const b = mirrored.nodes.find((n) => n.key === key);
      expect(points(b, true), key).toEqual(points(a, false));
    }
  });

  // Review M1 on PR #729: a landing's level rail ran across the flights arriving on it, the edge
  // probed once at its middle. A dog-leg (two flights side by side, no well) and a half-turn (a
  // 200 mm well between them), as two storeys so the stair climbs to a floor.
  const turn = (x2: number, w: number) => {
    const s = (dir: string) => `stair id=s dir ${dir} width ${w} {
      flight at (500,1500) size ${w}x2000
      landing at (500,500) size ${x2 + w - 500}x1000
      flight at (${x2},1500) size ${w}x2000
    }`;
    return `plan "turn" { units mm
      level 1 "G" { room id=h at (0,0) size 4000x5000 label "Hall" uses hall walls from rooms exterior 200 partition 100 ${s("up")} }
      level 2 "F" { room id=g at (0,0) size 4000x5000 label "Landing" uses hall walls from rooms exterior 200 partition 100 ${s("down")} }
    }`;
  };
  const levelRailsOverFlights = (scene: Scene3D, m: typeof plain): number => {
    const st = m.nodes.find((n) => n.key === "L1/stair:s:rail") as MeshNode;
    const flights = scene.levels[0]?.stairs[0]?.flights ?? [];
    expect(flights.length).toBe(2);
    let n = 0;
    for (const sh of st.shells) {
      const [x0, y0, z0, x1, y1, z1] = extent([sh]);
      // A level rail: flat top and bottom, 50 mm apart (a sloping rail or a post is neither).
      const level = new Set(sh.positions.filter((_, k) => k % 3 === 1)).size === 2 && y1 - y0 === 50_000;
      if (!level) continue;
      for (const f of flights)
        if (x0 < f.at[0] + f.size.w && x1 > f.at[0] && z0 < f.at[1] + f.size.h && z1 > f.at[1]) n++;
    }
    return n;
  };

  it("a dog-leg's landing has no rail across its flights, and no rail between the two flights", () => {
    const scene = adapted(turn(1500, 1000)).scene;
    const m = buildMesh(scene);
    expect(sides(m)).toEqual([
      "side(flight 1, left)=open",
      "side(flight 1, right)=flight",
      "side(flight 2, left)=flight",
      "side(flight 2, right)=open",
      "side(landing 1, top)=open",
      "side(landing 1, right)=open",
      "side(landing 1, bottom)=flight",
      "side(landing 1, left)=open",
    ]);
    expect(levelRailsOverFlights(scene, m)).toBe(0);
  });

  it("a half-turn's landing rails only the well between its flights, and each flight its well side", () => {
    const scene = adapted(turn(1600, 900)).scene;
    const m = buildMesh(scene);
    expect(sides(m)).toEqual([
      "side(flight 1, left)=open",
      "side(flight 1, right)=open",
      "side(flight 2, left)=open",
      "side(flight 2, right)=open",
      "side(landing 1, top)=open",
      "side(landing 1, right)=open",
      "side(landing 1, bottom)=open",
      "side(landing 1, left)=open",
    ]);
    expect(levelRailsOverFlights(scene, m)).toBe(0);
    // The bottom edge's rail is the well's 200 mm alone, less the two newels standing in it.
    const rails = (m.nodes.find((n) => n.key === "L1/stair:s:rail") as MeshNode).shells.map((sh) => extent([sh]));
    const wellRail = rails.filter(
      ([x0, , z0, x1, , z1]) => z0 >= 1_450_000 && z1 <= 1_500_000 && x0 >= 1_400_000 && x1 <= 1_600_000,
    );
    expect(wellRail.length).toBeGreaterThan(0);
  });

  // Review m5: a `dir down` stair with no `dir up` partner below is built on the storey below, from
  // its floor, and its edges are probed against that storey's walls, the ones it stands beside.
  it("probes a stair built from the storey above against the walls of the storey it stands in", () => {
    const m = buildMesh(
      adapted(`plan "p" { units mm
        level 1 "G" { ${SHELL} ${room("a")} wall id=side partition thickness 200 { (900,0) (900,6000) } }
        level 2 "U" { ${SHELL} ${room("b")} void id=well at (1000,1000) size 1000x3000 ${STRAIGHT("down")} }
      }`).scene,
    );
    expect(stairNodes(m).map((x) => [x.key, x.extras.from_storey_above])).toEqual([["L1/stair:st", true]]);
    expect(sides(m)).toEqual(["side(flight 1, left)=wall", "side(flight 1, right)=open"]);
  });
});

describe("determinism", () => {
  it("two builds of every staired example are byte-identical", () => {
    for (const [n, src] of STAIRED) {
      const all = (m: { nodes: MeshNode[] }) => m.nodes.filter((x) => x.kind === "stair");
      const a = JSON.stringify(all(buildMesh(adapted(src).scene)));
      const b = JSON.stringify(all(buildMesh(adapted(src).scene)));
      expect(a, n).toBe(b);
    }
  });
});
