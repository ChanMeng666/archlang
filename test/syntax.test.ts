/**
 * `describe(src, { facts: ["syntax"] })` — space syntax (Hillier & Hanson 1984) on the
 * access graph.
 *
 * Every number below is HAND-DERIVED from the graph drawn in the comment above it, never
 * read back off the implementation: depth from `exterior`, mean depth MD = Σd/(k−1),
 * RA = 2(MD−1)/(k−2), integration = 1/RA, control = Σ 1/deg(neighbour), and the cycle rank
 * E − V + C. The law: syntax is a graph fact, so it is INVARIANT under every g in D4 ⋉ Z²
 * (checked through the W1 wrapper, where both sides carry the same `g.` ids).
 */

import { describe as suite, expect, it } from "vitest";
import { describe, type SyntaxFacts } from "../src/index.js";
import {
  corpusElements,
  D4_ELEMENTS,
  ELIGIBLE_EXAMPLES,
  EXAMPLE_FILES,
  EXAMPLES_WORLD,
  TRANSLATION,
  witnessPair,
  wrapperSource,
} from "./d4-oracle.js";

function syntax(src: string): SyntaxFacts {
  const s = describe(src, { world: EXAMPLES_WORLD, facts: ["syntax"] });
  expect(s.ok, s.diagnostics.map((d) => d.message).join(" | ")).toBe(true);
  return s.syntax!;
}

/**
 * Four rooms in a 2×2 block: A (NW) B (NE) / C (SW) D (SE), one entrance into A.
 * `ring` adds the B–D door, closing the loop A–B–D–C–A.
 */
function block(ring: boolean): string {
  return `
    wall id=shell exterior  thickness 200 { (0,0) (7000,0) (7000,6000) (0,6000) close }
    wall id=px    partition thickness 100 { (4000,0) (4000,6000) }
    wall id=py    partition thickness 100 { (0,3000) (7000,3000) }
    room id=a at (0,0)       size 4000x3000 label "A" uses living
    room id=b at (4000,0)    size 3000x3000 label "B" uses bedroom
    room id=c at (0,3000)    size 4000x3000 label "C" uses hall
    room id=d at (4000,3000) size 3000x3000 label "D" uses office
    door id=entry at (2000,0)    width 900 wall shell swing in
    door id=ab    at (4000,1500) width 800 wall px swing in
    door id=ac    at (2000,3000) width 800 wall py swing in
    door id=cd    at (4000,4500) width 800 wall px swing in
    ${ring ? "door id=bd at (5500,3000) width 800 wall py swing in" : ""}`;
}

const plan = (body: string): string => `plan "syntax" {\n  units mm\n  grid 50\n${body}\n}\n`;

suite("syntax — hand-derived", () => {
  it("a 4-room tree: exterior–A, A–B, A–C, C–D", () => {
    // Distances (ext, A, B, C, D):
    //   A: 1,–,1,1,2 = 5 → MD 1.25, RA 2(0.25)/3 = 1/6, integration 6
    //   B: 2,1,–,2,3 = 8 → MD 2,    RA 2/3,            integration 1.5
    //   C: 2,1,2,–,1 = 6 → MD 1.5,  RA 1/3,            integration 3
    //   D: 3,2,3,1,– = 9 → MD 2.25, RA 2(1.25)/3 = 5/6, integration 1.2
    // Degrees ext 1, A 3, B 1, C 2, D 1 → control A = 1 + 1 + 1/2, B = 1/3, C = 1/3 + 1, D = 1/2.
    expect(syntax(plan(block(false)))).toEqual({
      k: 5,
      cycleRank: 0,
      rooms: [
        { id: "a", depth: 1, meanDepth: 1.25, ra: 0.1667, integration: 6, control: 2.5 },
        { id: "b", depth: 2, meanDepth: 2, ra: 0.6667, integration: 1.5, control: 0.3333 },
        { id: "c", depth: 2, meanDepth: 1.5, ra: 0.3333, integration: 3, control: 1.3333 },
        { id: "d", depth: 3, meanDepth: 2.25, ra: 0.8333, integration: 1.2, control: 0.5 },
      ],
    });
  });

  it("a 4-room ring: the tree plus B–D", () => {
    // E 5, V 5, C 1 → cycle rank 1.
    //   A: 1,–,1,1,2 = 5 → MD 1.25, RA 1/6, integration 6
    //   B: 2,1,–,2,1 = 6 → MD 1.5,  RA 1/3, integration 3
    //   C: 2,1,2,–,1 = 6 → MD 1.5,  RA 1/3, integration 3
    //   D: 3,2,1,1,– = 7 → MD 1.75, RA 1/2, integration 2
    // Degrees ext 1, A 3, B 2, C 2, D 2 → control A = 1 + 1/2 + 1/2, B = C = 1/3 + 1/2, D = 1.
    expect(syntax(plan(block(true)))).toEqual({
      k: 5,
      cycleRank: 1,
      rooms: [
        { id: "a", depth: 1, meanDepth: 1.25, ra: 0.1667, integration: 6, control: 2 },
        { id: "b", depth: 2, meanDepth: 1.5, ra: 0.3333, integration: 3, control: 0.8333 },
        { id: "c", depth: 2, meanDepth: 1.5, ra: 0.3333, integration: 3, control: 0.8333 },
        { id: "d", depth: 3, meanDepth: 1.75, ra: 0.5, integration: 2, control: 1 },
      ],
    });
  });

  it("the studio: exterior–living–hall, hall–bed, hall–bath", () => {
    // living: 1,–,1,2,2 = 6 → MD 1.5, RA 1/3, integration 3;  control 1 + 1/3
    // hall:   2,1,–,1,1 = 5 → MD 1.25, RA 1/6, integration 6; control 1/2 + 1 + 1
    // bed/bath: 3,2,1,–,2 = 8 → MD 2, RA 2/3, integration 1.5; control 1/3
    expect(syntax(EXAMPLE_FILES["studio.arch"]!)).toEqual({
      k: 5,
      cycleRank: 0,
      rooms: [
        { id: "r_living", depth: 1, meanDepth: 1.5, ra: 0.3333, integration: 3, control: 1.3333 },
        { id: "r_bed", depth: 3, meanDepth: 2, ra: 0.6667, integration: 1.5, control: 0.3333 },
        { id: "r_hall", depth: 2, meanDepth: 1.25, ra: 0.1667, integration: 6, control: 2.5 },
        { id: "r_bath", depth: 3, meanDepth: 2, ra: 0.6667, integration: 1.5, control: 0.3333 },
      ],
    });
  });

  it("depth IS access.rooms[].depthFromEntrance", () => {
    for (const rel of ["studio.arch", "terrace-row.arch", "library.arch", "garden-house.arch"]) {
      const s = describe(EXAMPLE_FILES[rel]!, { world: EXAMPLES_WORLD, facts: ["syntax"] });
      expect(
        s.syntax!.rooms.map((r) => r.depth),
        rel,
      ).toEqual(s.access.rooms.map((r) => r.depthFromEntrance));
    }
  });

  it("an unreachable room has null metrics — never NaN — and leaves the system", () => {
    const s = syntax(plan(`${block(false)}\n    room id=shed at (9000,0) size 2000x2000 label "Shed" uses storage`));
    expect(s.k).toBe(5);
    expect(s.rooms.find((r) => r.id === "shed")).toEqual({
      id: "shed",
      depth: null,
      meanDepth: null,
      ra: null,
      integration: null,
      control: null,
    });
    // C counts the shed as its own component, so the cycle rank is still the tree's 0.
    expect(s.cycleRank).toBe(0);
    expect(JSON.stringify(s)).not.toContain("NaN");
  });

  it("k ≤ 2: RA is undefined, so RA and integration are null", () => {
    const s = syntax(
      plan(
        block(false)
          .split("\n")
          .filter((l) => !/id=(b|c|d|ab|ac|cd) /.test(l))
          .join("\n"),
      ),
    );
    expect(s).toEqual({
      k: 2,
      cycleRank: 0,
      rooms: [{ id: "a", depth: 1, meanDepth: 1, ra: null, integration: null, control: 1 }],
    });
  });

  it("RA = 0 (a space adjacent to every other): integration is null, ra says why", () => {
    // Exterior–A and A–B only: A is adjacent to both other nodes, MD 1, RA 0.
    const s = syntax(
      plan(
        block(false)
          .split("\n")
          .filter((l) => !/id=(c|d|ac|cd) /.test(l))
          .join("\n"),
      ),
    );
    expect(s.rooms[0]).toEqual({ id: "a", depth: 1, meanDepth: 1, ra: 0, integration: null, control: 2 });
  });

  it("two doors between the same pair are one permeability, not a ring", () => {
    const twin = `${block(false)}\n    door id=ab2 at (4000,700) width 600 wall px swing in`;
    expect(syntax(plan(twin))).toEqual(syntax(plan(block(false))));
  });
});

suite("syntax — invariant under every g (the W1 wrapper)", () => {
  it.each(["tree", "ring"])("hand case %s under all eight elements and a translation", (name) => {
    const body = block(name === "ring");
    for (const g of [...D4_ELEMENTS.filter((e) => e.name !== "e"), TRANSLATION]) {
      const { p0, gP } = witnessPair(body, g);
      expect(syntax(gP), g.name).toEqual(syntax(p0));
    }
  });

  it.each(ELIGIBLE_EXAMPLES)(
    "%s",
    (rel) => {
      const s0 = describe(wrapperSource(rel, null), { world: EXAMPLES_WORLD, facts: ["syntax"] });
      // An unresolved wrapper (the oracle's known T0 composition pins) has no facts to
      // compare; say so rather than compare `undefined` with itself.
      if (!s0.ok) {
        for (const g of corpusElements(rel)) {
          expect(describe(wrapperSource(rel, g), { world: EXAMPLES_WORLD }).ok, g.name).toBe(false);
        }
        return;
      }
      expect(s0.syntax, "a resolved plan reports syntax when asked").toBeDefined();
      for (const g of corpusElements(rel)) {
        const sG = describe(wrapperSource(rel, g), { world: EXAMPLES_WORLD, facts: ["syntax"] });
        expect(JSON.stringify(sG.syntax), g.name).toBe(JSON.stringify(s0.syntax));
      }
    },
    120_000,
  );
});
