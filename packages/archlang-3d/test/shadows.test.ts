/**
 * The soft contact shadows (product-roadmap card RM8.8; design `visual-language.md` §1), the half a
 * light test can assert every time (§1.3 point 6): the bands are a pure function of the replay's
 * nodes, in whole micrometres, at most three buffers a storey, and their triangles stay within the
 * structural bound; a band lies outside the solid it falls from; a curved wall's chords make no
 * corners; overlapping casters band neither inside each other nor twice; a hung piece casts none and
 * a rug casts none and receives; the fade starts in the last quarter of a rise; the lookups stay
 * within a bound on a large plan. The frame time is measured in CI only (`e2e/frame-budget.e2e.ts`),
 * never asserted.
 */
import { compile, makeVirtualWorld } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, CONTACT_SHADOW } from "../src/index.js";
import { replayPayload } from "../src/node.js";
import type { ReplayPayload } from "../src/replay/payload.js";
import {
  type ContactShadows,
  contactFade,
  contactShadows,
  contactShadowsWith,
  contains,
  narrowed,
  type P2,
} from "../src/replay/shadows.js";
import { wallOutline } from "../src/replay/wall-lines.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";
import { borderSlivers, checked, tally } from "./lookup-check.js";

function payloadOf(src: string, title: string): ReplayPayload {
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  return replayPayload(buildMesh(r.scene), { title, svg: compile(src, { world: WORLD }).svg });
}

const sourceOf = (name: string): string => {
  const hit = EXAMPLES_LIST.find(([n]) => n === `${name}.arch`);
  if (!hit) throw new Error(`no example ${name}`);
  return hit[1];
};

/** The bands as the viewer bakes them: with the walls' outline lines, ranked as the replay raises them. */
function bake(p: ReplayPayload): ContactShadows {
  const rank = new Map(p.events.map((e) => [e.key, e.rank] as const));
  const { lines } = wallOutline(
    p.nodes,
    p.nodes.map((n) => rank.get(n.key) ?? 0),
  );
  return contactShadows(p.nodes, p.ground, lines);
}

/**
 * The design's bound (§1.3 point 6), with each term what this module builds: two triangles a band
 * (an outline stretch, a fence rail's side, a stair stringer's edge), eight a halo, at most `MAX_FAN`
 * (8) an outside corner's fan, and two bands of two triangles up each inside corner.
 */
const bound = (c: ContactShadows["counts"]): number =>
  2 * c.edges + 8 * c.convex + 4 * c.concave + 8 * c.furniture + 2 * c.fenceSides + 2 * c.stairEdges;

describe("contact shadows (card RM8.8)", () => {
  for (const name of ["laneway-house", "courtyard-house", "two-storey"]) {
    it(`${name}: within the structural bound, at most three buffers a storey, pure`, () => {
      const p = payloadOf(sourceOf(name), name);
      const s = bake(p);
      expect(s.counts.edges, name).toBeGreaterThan(0);
      expect(s.counts.triangles, name).toBeLessThanOrEqual(bound(s.counts));
      expect(s.counts.triangles, name).toBe(s.layers.reduce((n, l) => n + l.indices.length / 3, 0));
      const perStorey = new Map<number, number>();
      for (const l of s.layers) perStorey.set(l.level, (perStorey.get(l.level) ?? 0) + 1);
      for (const [level, n] of perStorey) expect(n, `${name} L${level}`).toBeLessThanOrEqual(3);
      // The same nodes, the same bands, byte for byte.
      expect(JSON.stringify(bake(p))).toBe(JSON.stringify(s));
    });
  }

  it("every corpus plan: whole micrometres (no -0), inner edges weighted 1 and outer 0, every index in range", () => {
    for (const [name, src] of EXAMPLES_LIST) {
      const r = adaptPlan(src, { world: WORLD });
      if (!r.ok) continue;
      const p = replayPayload(buildMesh(r.scene), { title: name, svg: compile(src, { world: WORLD }).svg });
      const s = bake(p);
      for (const l of s.layers) {
        expect(
          l.positions.every((v) => Number.isInteger(v) && !Object.is(v, -0)),
          `${name} L${l.level} ${l.cls}`,
        ).toBe(true);
        expect(
          l.weight.every((w) => w === 0 || w === 1),
          name,
        ).toBe(true);
        const n = l.weight.length;
        expect(l.positions.length, name).toBe(3 * n);
        expect(l.caster.length, name).toBe(n);
        expect(
          l.indices.every((i) => i >= 0 && i < n),
          name,
        ).toBe(true);
        expect(
          l.caster.every((c) => c >= 0 && c < s.casters.length),
          name,
        ).toBe(true);
      }
    }
  });

  it("a walled box: a band outside each face, a fan at each outside corner, two bands up each inside one", () => {
    const p = payloadOf(
      `plan "b" { units mm grid 50 wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } }`,
      "b",
    );
    const s = bake(p);
    expect(s.counts).toMatchObject({ edges: 8, convex: 4, concave: 4, flatJoints: 0, dropped: 0, furniture: 0 });
    const b = Math.round(0.75 * 200) * 1000;
    // The outer edge of every floor band lies outside the wall: beyond its outer face, or in from its
    // inner one by the band's width.
    const foot = s.layers.find((l) => l.cls === "foot");
    expect(foot).toBeDefined();
    const pos = foot?.positions ?? [];
    const xs: number[] = [];
    foot?.weight.forEach((w, i) => {
      const x = pos[3 * i] as number;
      const z = pos[3 * i + 2] as number;
      const inWall =
        x > -100_000 &&
        x < 4_100_000 &&
        z > -100_000 &&
        z < 3_100_000 &&
        !(x >= 100_000 && x <= 3_900_000 && z >= 100_000 && z <= 2_900_000);
      if (w === 0) {
        expect(inWall, `outer vertex ${x},${z}`).toBe(false);
        xs.push(x);
      }
    });
    expect(Math.min(...xs)).toBe(-100_000 - b);
    expect(Math.max(...xs)).toBe(4_100_000 + b);
    expect(xs).toContain(100_000 + b);
    expect(xs).toContain(3_900_000 - b);
    // Every band lies on the ground, the liftMm above it.
    const ys = new Set(pos.filter((_, i) => i % 3 === 1));
    expect([...ys]).toEqual([(p.ground?.y ?? Number.NaN) + CONTACT_SHADOW.liftMm * 1000]);
    // The inside corners' bands stand from there to the wall's top.
    const corner = s.layers.find((l) => l.cls === "corner");
    const cy = new Set((corner?.positions ?? []).filter((_, i) => i % 3 === 1));
    expect(cy.size).toBe(2);
  });

  it("a curved wall's chords are joints, not corners: mitred, no fan and no inside band (review B1)", () => {
    // s5: a room closed by one arc; its only sharp turns are where the arc meets the straight walls
    // and the door's and window's jambs.
    const s5 = bake(payloadOf(STRESS_PLANS["s5-door-on-arc"] ?? "", "s5"));
    expect(s5.counts.flatJoints).toBeGreaterThan(20);
    expect(s5.counts.concave).toBeLessThanOrEqual(4);
    for (const name of ["library", "aquarium", "hexagon-pavilion"]) {
      const s = bake(payloadOf(sourceOf(name), name));
      expect(s.counts.flatJoints, name).toBeGreaterThan(s.counts.concave);
    }
    // The library's rotunda: one inside band at most at each sharp corner, none along the arc.
    const lib = bake(payloadOf(sourceOf("library"), "library"));
    expect(lib.counts.concave).toBeLessThan(100);
  });

  it("overlapping casters band neither inside each other nor twice (review S4)", () => {
    const p = payloadOf(
      `plan "o" { units mm grid 50 wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
        column at (2700,-200) size 600x600 }`,
      "o",
    );
    const s = bake(p);
    expect(s.counts.dropped).toBeGreaterThan(0);
    const foot = s.layers.find((l) => l.cls === "foot");
    const pos = foot?.positions ?? [];
    // No band's outer edge lies strictly inside the wall or the column.
    foot?.weight.forEach((w, i) => {
      if (w !== 0) return;
      const x = pos[3 * i] as number;
      const z = pos[3 * i + 2] as number;
      const inColumn = x > 2_700_000 && x < 3_300_000 && z > -200_000 && z < 400_000;
      const inWallSouth = x > -100_000 && x < 6_100_000 && z > -100_000 && z < 100_000;
      expect(inColumn || inWallSouth, `outer vertex ${x},${z}`).toBe(false);
    });
  });

  it("a hung piece casts no halo; a standing one does; a rug casts none and receives (review S2, S5)", () => {
    const p = payloadOf(sourceOf("furnished-flat"), "f");
    const none = p.nodes.filter((n) => n.kind === "furniture" && n.band === undefined);
    const standing = p.nodes.filter((n) => n.kind === "furniture" && n.band !== undefined);
    expect(none.map((n) => n.key)).toContain(
      p.nodes.find((n) => n.key.includes("furniture:upper_cabinet"))?.key ?? "an upper cabinet",
    );
    expect(standing.length).toBeGreaterThan(0);
    expect(bake(p).counts.furniture).toBe(standing.length);
    // laneway's table stands on its rug: the rug casts nothing and the table's ring lies on its top.
    const lw = payloadOf(sourceOf("laneway-house"), "l");
    const rug = lw.nodes.find((n) => n.key.includes("furniture:rug"));
    const table = lw.nodes.find((n) => n.key.includes("furniture:table"));
    expect(rug?.flat).toBe(true);
    expect(rug?.band).toBeUndefined();
    const s = bake(lw);
    const at = s.casters.findIndex((c) => c[0] === table?.key);
    expect(at).toBeGreaterThanOrEqual(0);
    const halo = s.layers.find((l) => l.cls === "halo");
    const ys = new Set((halo?.positions ?? []).filter((_, i) => i % 3 === 1 && halo?.caster[(i - 1) / 3] === at));
    let rugTop = -Infinity;
    for (let i = 1; i < (rug?.positions.length ?? 0); i += 3) rugTop = Math.max(rugTop, rug?.positions[i] as number);
    expect([...ys]).toEqual([rugTop + CONTACT_SHADOW.liftMm * 1000]);
  });

  it("a hung piece is told by its own node, so a standing piece of the same id on another storey still casts (review S-A)", () => {
    // Ids are unique per storey only: the ledger's per-piece rows name no storey, so reading them
    // once took the sofa on level 2 for the television hung on level 1.
    const box = (id: string) => `wall id=${id} exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }`;
    const src = `plan "t" { units mm grid 50
      level 1 { ${box("w1")} furniture id=x tv at (1500,200) size 1200x100 }
      level 2 { ${box("w2")} furniture id=x sofa at (1000,1000) size 2000x900 }
    }`;
    const world = makeVirtualWorld({});
    const r = adaptPlan(src, { world });
    if (!r.ok) throw new Error(r.refusal.code);
    const mesh = buildMesh(r.scene);
    expect(mesh.nodes.filter((n) => n.extras.hung === true).map((n) => n.key)).toEqual(["L1/furniture:x"]);
    const p = replayPayload(mesh, { title: "t", svg: compile(src, { world }).svg });
    const by = new Map(p.nodes.map((n) => [n.key, n] as const));
    expect(by.get("L1/furniture:x")?.band).toBeUndefined();
    expect(by.get("L2/furniture:x")?.band).toBeGreaterThan(0);
    const s = contactShadows(p.nodes, p.ground);
    expect(s.counts.furniture).toBe(1);
    expect(s.casters.some((c) => c[0] === "L2/furniture:x")).toBe(true);
  });

  it("whether a piece is hung reads no ledger row: stripped or contradicted, the ledger moves no band (card RM8.8b item 1)", () => {
    // The ledger's furniture rows are per category or per id with no storey; a hung piece is told
    // by its own node (`extras.hung`). Only the fence posts (one row a style) and the ground plane's
    // storey are read from the ledger, so with every other row gone, or a mount row naming every
    // standing piece, each node casts what it cast.
    const kept = new Set(["fence-profile-default", "ground-plane-viewer-only"]);
    for (const name of ["furnished-flat", "laneway-house", "corner-cafe"]) {
      const src = sourceOf(name);
      const r = adaptPlan(src, { world: WORLD });
      if (!r.ok) throw new Error(r.refusal.code);
      const mesh = buildMesh(r.scene);
      const svg = compile(src, { world: WORLD }).svg;
      const casts = (m: typeof mesh): string =>
        JSON.stringify(replayPayload(m, { title: name, svg }).nodes.map((n) => [n.key, n.band, n.flat]));
      const before = casts(mesh);
      expect(mesh.nodes.some((n) => n.extras.hung === true) || name === "laneway-house", name).toBe(true);
      expect(casts({ ...mesh, assumptions: mesh.assumptions.filter((a) => kept.has(a.rule)) }), name).toBe(before);
      // The rows as the mesh builder writes them for a hung piece: by category, and by id.
      const lies: typeof mesh.assumptions = mesh.nodes
        .filter((n) => n.kind === "furniture" && n.extras.hung !== true)
        .flatMap((n) => [
          {
            kind: "furniture",
            field: `mount_mm(${String(n.extras.category)})`,
            value: 1400,
            provenance: "default" as const,
            rule: "furniture-mount-default",
          },
          {
            kind: "furniture",
            id: n.id,
            field: "top_mm",
            value: 1900,
            provenance: "default" as const,
            rule: "furniture-mount-from-top",
          },
        ]);
      expect(lies.length, name).toBeGreaterThan(0);
      expect(casts({ ...mesh, assumptions: [...mesh.assumptions, ...lies] }), name).toBe(before);
    }
  });

  it("a band narrows to half a gap it faces, so it never crosses into the solid beyond (card RM8.8b item 5)", () => {
    // Each foot band's cross-section at its middle, k/8 of the way out, against the storey's walls'
    // and columns' bottom faces (strictly inside one is in the solid).
    const crossings = (p: ReplayPayload): string[] => {
      const s = bake(p);
      const out: string[] = [];
      for (const layer of s.layers) {
        if (layer.cls !== "foot") continue;
        const casters = p.nodes.filter(
          (n) =>
            n.key.startsWith(`L${layer.level}/`) && (n.kind === "wall" || n.kind === "column") && n.band !== undefined,
        );
        let e = Infinity;
        for (const n of casters)
          for (let i = 1; i < n.positions.length; i += 3) e = Math.min(e, n.positions[i] as number);
        const tris: number[][] = [];
        for (const n of casters) {
          const q = n.positions;
          for (let i = 0; i < n.indices.length; i += 3) {
            const v = [n.indices[i], n.indices[i + 1], n.indices[i + 2]] as number[];
            if (v.every((k) => q[k * 3 + 1] === e))
              tris.push(v.flatMap((k) => [q[k * 3] as number, q[k * 3 + 2] as number]));
          }
        }
        const inside = (x: number, z: number): boolean =>
          tris.some(([ax = 0, az = 0, bx = 0, bz = 0, cx = 0, cz = 0]) => {
            const s1 = (bx - ax) * (z - az) - (bz - az) * (x - ax);
            const s2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx);
            const s3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
            return (s1 > 0 && s2 > 0 && s3 > 0) || (s1 < 0 && s2 < 0 && s3 < 0);
          });
        const pos = layer.positions;
        const ix = layer.indices;
        const xz = (i: number): [number, number] => [pos[3 * i] as number, pos[3 * i + 2] as number];
        for (let t = 0; t + 5 < ix.length; t += 3) {
          // A band is the quad a b d e drawn as (a, b, d) and (a, d, e); a fan is not.
          const a = ix[t] as number;
          if (
            !(
              ix[t + 1] === a + 1 &&
              ix[t + 2] === a + 2 &&
              ix[t + 3] === a &&
              ix[t + 4] === a + 2 &&
              ix[t + 5] === a + 3
            )
          )
            continue;
          const [ia, ib, od, oe] = [xz(a), xz(a + 1), xz(a + 2), xz(a + 3)];
          const mi = [(ia[0] + ib[0]) / 2, (ia[1] + ib[1]) / 2] as const;
          const mo = [(od[0] + oe[0]) / 2, (od[1] + oe[1]) / 2] as const;
          for (let k = 1; k < 8; k++)
            if (inside(mi[0] + ((mo[0] - mi[0]) * k) / 8, mi[1] + ((mo[1] - mi[1]) * k) / 8)) {
              out.push(`${mi.join(",")} -> ${mo.join(",")}`);
              break;
            }
          t += 3;
        }
      }
      return out;
    };
    // s7: wall a's doorway leaves a 100 mm slot in the 250 mm wall b; b's 188 mm bands crossed it.
    expect(crossings(payloadOf(STRESS_PLANS["s7-collinear-diff-thickness"] ?? "", "s7"))).toEqual([]);
    // Two parallel 200 mm walls 100 mm apart: each 150 mm band now stops at the slot's middle.
    const p = payloadOf(
      `plan "g" { units mm wall id=a partition thickness 200 { (0,0) (4000,0) } wall id=b partition thickness 200 { (0,300) (4000,300) } }`,
      "g",
    );
    expect(crossings(p)).toEqual([]);
    const foot = bake(p).layers.find((l) => l.cls === "foot");
    const gapOuter = new Set<number>();
    foot?.weight.forEach((w, i) => {
      const x = foot.positions[3 * i] as number;
      const z = foot.positions[3 * i + 2] as number;
      if (w === 0 && x >= -100_000 && x <= 4_100_000 && z > 100_000 && z < 200_000) gapOuter.add(z);
    });
    expect([...gapOuter]).toEqual([150_000]);
  });

  it("a band fades in over the last quarter of its caster's rise, by ease, and not before", () => {
    const ev = { riseFrom: 0.6, riseTo: 0.7 };
    expect(contactFade(ev, 0.6)).toBe(0);
    expect(contactFade(ev, 0.674)).toBe(0);
    expect(contactFade(ev, 0.675)).toBeCloseTo(0, 12);
    expect(contactFade(ev, 0.6875)).toBeCloseTo(0.5, 12);
    expect(contactFade(ev, 0.7)).toBe(1);
    expect(contactFade(ev, 1)).toBe(1);
    expect(contactFade({ ...ev, hidden: true }, 1)).toBe(0);
    expect(contactFade(undefined, 1)).toBe(0);
    let last = 0;
    for (let u = 0.6; u <= 0.7; u += 0.001) {
      const f = contactFade(ev, u);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
  });

  it("looks up receivers through a grid: a 400-room plan stays within a few tests a probe (review S3)", () => {
    const n = 20;
    const rooms: string[] = [];
    const walls: string[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) rooms.push(`room id=r_${i}_${j} at (${i * 3000},${j * 3000}) size 3000x3000`);
    for (let k = 0; k <= n; k++) {
      walls.push(`wall id=h${k} partition thickness 100 { (0,${k * 3000}) (${n * 3000},${k * 3000}) }`);
      walls.push(`wall id=v${k} partition thickness 100 { (${k * 3000},0) (${k * 3000},${n * 3000}) }`);
    }
    const src = `plan "grid" { units mm\n${rooms.join("\n")}\n${walls.join("\n")}\n}`;
    const world = makeVirtualWorld({});
    const r = adaptPlan(src, { world });
    if (!r.ok) throw new Error(r.refusal.code);
    const p = replayPayload(buildMesh(r.scene), { title: "g", svg: compile(src, { world }).svg });
    const s = contactShadows(p.nodes, p.ground);
    expect(s.counts.edges).toBeGreaterThan(4 * n * n);
    // Without the grid every probe tests every one of the storey's ~2 n² faces.
    expect(s.counts.tests).toBeLessThanOrEqual(16 * s.counts.probes);
  }, 60_000);

  it("the grid stays near-linear on a long thin plan and a many-sided room (card RM8.8b item 2)", () => {
    const world = makeVirtualWorld({});
    const bakeOf = (src: string): ContactShadows => {
      const r = adaptPlan(src, { world });
      if (!r.ok) throw new Error(r.refusal.code);
      const p = replayPayload(buildMesh(r.scene), { title: "g", svg: compile(src, { world }).svg });
      return contactShadows(p.nodes, p.ground);
    };
    // A row of 400 rooms: square cells over a 1200 m by 3 m extent were 64 × 64 slivers across it,
    // each holding six rooms' faces (36.9 tests a probe before the fix, 4.6 after).
    const n = 400;
    const rooms: string[] = [];
    const walls = [
      `wall id=h0 partition thickness 100 { (0,0) (${n * 3000},0) }`,
      `wall id=h1 partition thickness 100 { (0,3000) (${n * 3000},3000) }`,
    ];
    for (let i = 0; i < n; i++) rooms.push(`room id=r_${i} at (${i * 3000},0) size 3000x3000`);
    for (let k = 0; k <= n; k++)
      walls.push(`wall id=v${k} partition thickness 100 { (${k * 3000},0) (${k * 3000},3000) }`);
    const row = bakeOf(`plan "row" { units mm\n${rooms.join("\n")}\n${walls.join("\n")}\n}`);
    expect(row.counts.edges).toBeGreaterThan(4 * n);
    expect(row.counts.tests).toBeLessThanOrEqual(8 * row.counts.probes);
    // A 720-sided round room: its triangulation's long slivers were listed in every cell their box
    // covers (156.6 tests a probe before the fix, 29.3 after; 545.5 → 62.2 at 2880 sides).
    const pts: string[] = [];
    for (let i = 0; i < 720; i++) {
      const a = (2 * Math.PI * i) / 720;
      pts.push(`(${Math.round(20000 + 20000 * Math.cos(a))},${Math.round(20000 + 20000 * Math.sin(a))})`);
    }
    const gon = bakeOf(
      `plan "gon" { units mm\nroom id=r polygon ${pts.join(" ")}\nwall id=w exterior thickness 200 { ${pts.join(" ")} close }\n}`,
    );
    expect(gon.counts.edges).toBeGreaterThan(700);
    expect(gon.counts.tests).toBeLessThanOrEqual(40 * gon.counts.probes);
  }, 60_000);

  it("the grid finds what a scan of every face finds, at every probe of the corpus, the 400-room row and the 720-gon (card RM8.8b item 2)", () => {
    // Every `at(q)` and `near(box)` the bake makes, its answer after the exact test against a scan of
    // every face of that storey (`lookup-check.ts`), and the bake with the checking lookup the same
    // as without it: the grid decides only how many faces are tested, never the bands.
    const t = tally();
    const world = makeVirtualWorld({});
    const n = 400;
    const rooms: string[] = [];
    const walls = [
      `wall id=h0 partition thickness 100 { (0,0) (${n * 3000},0) }`,
      `wall id=h1 partition thickness 100 { (0,3000) (${n * 3000},3000) }`,
    ];
    for (let i = 0; i < n; i++) rooms.push(`room id=r_${i} at (${i * 3000},0) size 3000x3000`);
    for (let k = 0; k <= n; k++)
      walls.push(`wall id=v${k} partition thickness 100 { (${k * 3000},0) (${k * 3000},3000) }`);
    const pts: string[] = [];
    for (let i = 0; i < 720; i++) {
      const a = (2 * Math.PI * i) / 720;
      pts.push(`(${Math.round(20000 + 20000 * Math.cos(a))},${Math.round(20000 + 20000 * Math.sin(a))})`);
    }
    const synthetic: Array<[string, string]> = [
      ["row", `plan "row" { units mm\n${rooms.join("\n")}\n${walls.join("\n")}\n}`],
      [
        "gon",
        `plan "gon" { units mm\nroom id=r polygon ${pts.join(" ")}\nwall id=w exterior thickness 200 { ${pts.join(" ")} close }\n}`,
      ],
    ];
    const refused: string[] = [];
    const of = (name: string, src: string, w = WORLD): Array<[string, ReplayPayload]> => {
      const r = adaptPlan(src, { world: w });
      if (!r.ok) refused.push(`${name}: ${r.refusal.code}`);
      return r.ok
        ? [[name, replayPayload(buildMesh(r.scene), { title: name, svg: compile(src, { world: w }).svg })]]
        : [];
    };
    const plans: Array<[string, ReplayPayload]> = [
      ...EXAMPLES_LIST.flatMap(([name, src]) => of(name, src)),
      ...Object.entries(STRESS_PLANS).flatMap(([name, src]) => of(name, src)),
      ...synthetic.flatMap(([name, src]) => of(name, src, world)),
    ];
    // Every plan is covered, none refused: the 38 examples, the 11 stress plans, the row and the gon.
    expect(refused).toEqual([]);
    expect([EXAMPLES_LIST.length, Object.keys(STRESS_PLANS).length, synthetic.length]).toEqual([38, 11, 2]);
    expect(plans.length).toBe(51);
    for (const [name, p] of plans) {
      const rank = new Map(p.events.map((e) => [e.key, e.rank] as const));
      const { lines } = wallOutline(
        p.nodes,
        p.nodes.map((nd) => rank.get(nd.key) ?? 0),
      );
      const before = t.at + t.near;
      const viaCheck = contactShadowsWith(p.nodes, p.ground, lines, (tris) => checked(t, tris));
      expect(JSON.stringify(viaCheck), name).toBe(JSON.stringify(contactShadows(p.nodes, p.ground, lines)));
      expect(t.at + t.near, name).toBeGreaterThan(before);
    }
    expect(t.seen).toEqual([]);
    expect(t.misses).toBe(0);
    expect(t.at).toBeGreaterThan(40_000);
    expect(t.near).toBeGreaterThan(6_000);
  }, 120_000);

  it("the grid finds a sliver that only touches a cell along its border or at its corner (card RM8.8b item 2)", () => {
    const { tris, probes, grid, measured } = borderSlivers();
    // The base and the slivers make the grid the placeholders measured, so the slivers lie on its borders.
    expect([grid.x0, grid.z0, grid.w, grid.h, grid.kx, grid.kz]).toEqual([
      measured.x0,
      measured.z0,
      measured.w,
      measured.h,
      measured.kx,
      measured.kz,
    ]);
    expect(grid.kx).toBeGreaterThan(4);
    const t = tally();
    const look = checked(t, tris, grid);
    let hits = 0;
    for (const q of probes) {
      hits += look.at(q).filter((f) => f.y === 2 && contains(f, q)).length;
      look.near(q[0], q[1], q[0], q[1]);
      look.near(q[0] - 1, q[1] - 1, q[0] + 1, q[1] + 1);
      look.near(q[0], q[1] - grid.h, q[0], q[1] + grid.h);
      look.near(q[0] - grid.w, q[1], q[0] + grid.w, q[1]);
    }
    expect(t.seen).toEqual([]);
    expect(t.misses).toBe(0);
    expect(t.at).toBe(probes.length);
    // The probes on a sliver's border edge or corner find it.
    expect(hits).toBeGreaterThan(probes.length / 3);
  });

  it("a facing gap gives a band no negative width, from the exact cross product (review round 1)", () => {
    // Antiparallel stretches on parallel lines one lattice step apart, far along a long, nearly
    // axis-aligned direction (the float normal's cancellation is worst there), and a plain slot.
    const band = (): number => 150;
    for (const [dx, dz, k] of [
      [10_000_019, 1, 150],
      [1_000_003, 7, 1000],
      [99_991, 12_345, 3000],
    ] as const) {
      // dx·pz − dz·px = −1: t's line one step in front of s's.
      let [r0, r1, s0, s1, t0, t1]: [number, number, number, number, number, number] = [dx, dz, 1, 0, 0, 1];
      while (r1 !== 0) {
        const qn = Math.floor(r0 / r1);
        [r0, r1, s0, s1, t0, t1] = [r1, r0 - qn * r1, s1, s0 - qn * s1, t1, t0 - qn * t1];
      }
      const p: [number, number] = [t0 + k * dx, -s0 + k * dz];
      expect(dx * p[1] - dz * p[0]).toBe(-1);
      const m = k + 2;
      const s = { a: [0, 0] as P2, b: [dx * m, dz * m] as P2, node: 0 };
      const o = { a: [p[0] + dx * m, p[1] + dz * m] as P2, b: p as P2, node: 1 };
      for (const piece of narrowed([s, o], band)) {
        expect(piece.w === undefined || (Number.isFinite(piece.w) && piece.w >= 0)).toBe(true);
      }
    }
    const pieces = narrowed(
      [
        { a: [0, 0], b: [4_000_000, 0], node: 0 },
        { a: [4_000_000, -100_000], b: [0, -100_000], node: 1 },
      ],
      band,
    );
    expect(pieces.map((x) => x.w)).toEqual([50, 50]);
  });

  it("the dark theme's alphas are the light theme's half as much again", () => {
    for (const k of ["floor", "corner", "furniture"] as const)
      expect(CONTACT_SHADOW.alphaDark[k]).toBeCloseTo(CONTACT_SHADOW.alpha[k] * 1.5, 12);
  });
});
