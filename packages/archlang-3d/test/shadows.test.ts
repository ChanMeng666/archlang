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
import { type ContactShadows, contactFade, contactShadows } from "../src/replay/shadows.js";
import { wallOutline } from "../src/replay/wall-lines.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

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

  it("the dark theme's alphas are the light theme's half as much again", () => {
    for (const k of ["floor", "corner", "furniture"] as const)
      expect(CONTACT_SHADOW.alphaDark[k]).toBeCloseTo(CONTACT_SHADOW.alpha[k] * 1.5, 12);
  });
});
