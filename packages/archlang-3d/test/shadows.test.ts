/**
 * The soft contact shadows (product-roadmap card RM8.8; design `visual-language.md` §1), the half a
 * light test can assert every time (§1.3 point 6): the bands are a pure function of the replay's
 * nodes, in whole micrometres, at most three buffers a storey, and their triangles stay within the
 * structural bound; a band lies outside the solid it falls from; a hung piece casts none. The frame
 * time is measured in CI only (`e2e/frame-budget.e2e.ts`), never asserted.
 */
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, CONTACT_SHADOW } from "../src/index.js";
import { replayPayload } from "../src/node.js";
import type { ReplayPayload } from "../src/replay/payload.js";
import { type ContactShadows, contactShadows } from "../src/replay/shadows.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

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

/**
 * The design's bound (§1.3 point 6), with each term what this module builds: two triangles a band
 * (an outline edge, a fence rail's side, a stair stringer's edge), four a halo's side, at most
 * `MAX_FAN` (8) an outside corner's fan, and two bands of two triangles up each inside corner.
 */
const bound = (c: ContactShadows["counts"]): number =>
  2 * c.edges + 8 * c.convex + 4 * c.concave + 8 * c.furniture + 2 * c.fenceSides + 2 * c.stairEdges;

describe("contact shadows (card RM8.8)", () => {
  for (const name of ["laneway-house", "courtyard-house", "two-storey"]) {
    it(`${name}: within the structural bound, at most three buffers a storey, pure`, () => {
      const p = payloadOf(sourceOf(name), name);
      const s = contactShadows(p.nodes, p.ground);
      expect(s.counts.edges, name).toBeGreaterThan(0);
      expect(s.counts.triangles, name).toBeLessThanOrEqual(bound(s.counts));
      expect(s.counts.triangles, name).toBe(s.layers.reduce((n, l) => n + l.indices.length / 3, 0));
      const perStorey = new Map<number, number>();
      for (const l of s.layers) perStorey.set(l.level, (perStorey.get(l.level) ?? 0) + 1);
      for (const [level, n] of perStorey) expect(n, `${name} L${level}`).toBeLessThanOrEqual(3);
      // The same nodes, the same bands, byte for byte.
      expect(JSON.stringify(contactShadows(p.nodes, p.ground))).toBe(JSON.stringify(s));
    });
  }

  it("every corpus plan: whole micrometres, inner edges weighted 1 and outer 0, every index in range", () => {
    for (const [name, src] of EXAMPLES_LIST) {
      const r = adaptPlan(src, { world: WORLD });
      if (!r.ok) continue;
      const p = replayPayload(buildMesh(r.scene), { title: name, svg: compile(src, { world: WORLD }).svg });
      const s = contactShadows(p.nodes, p.ground);
      for (const l of s.layers) {
        expect(
          l.positions.every((v) => Number.isInteger(v)),
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
    const s = contactShadows(p.nodes, p.ground);
    expect(s.counts).toMatchObject({ edges: 8, convex: 4, concave: 4, furniture: 0 });
    const b = Math.round(0.75 * 200) * 1000;
    // The wall's centreline box ±100 mm: the outer edge of every floor band lies outside the wall
    // (beyond the outer face, or inside the inner one by the band's width).
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
    // Out past the outer faces by the band, in from the inner ones by the band.
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

  it("a hung piece casts no halo; a standing one does", () => {
    const furnished = EXAMPLES_LIST.find(([n]) => n === "furnished-flat.arch");
    const p = payloadOf(furnished?.[1] ?? "", "f");
    const hung = p.nodes.filter((n) => n.kind === "furniture" && n.band === undefined);
    const standing = p.nodes.filter((n) => n.kind === "furniture" && n.band !== undefined);
    expect(hung.map((n) => n.key)).toContain(
      p.nodes.find((n) => n.key.includes("furniture:upper_cabinet"))?.key ?? "an upper cabinet",
    );
    expect(standing.length).toBeGreaterThan(0);
    expect(contactShadows(p.nodes, p.ground).counts.furniture).toBe(standing.length);
  });

  it("the dark theme's alphas are the light theme's half as much again", () => {
    for (const k of ["floor", "corner", "furniture"] as const)
      expect(CONTACT_SHADOW.alphaDark[k]).toBeCloseTo(CONTACT_SHADOW.alpha[k] * 1.5, 12);
  });
});
