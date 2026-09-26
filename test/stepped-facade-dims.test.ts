/**
 * `dims auto all` on a STEPPED facade: no opening may drop out of the chains without a diagnostic.
 *
 * Each facade's openings chain used to hang on ONE wall line, probed at the middle of the
 * rooms' bounding box. The reporter's bedroom has a south facade in two legs (y=5389 west,
 * y=5679 east) that straddle that point, so the probe found neither leg and the whole side
 * lost its openings, on both legs. Variant C, with the door moved onto the other leg, is
 * what shows the cause is the probe and not "the wrong leg".
 *
 * Pinned here: the three reported plans, the two shipped examples whose numbers the same
 * fallback had wrong, and `W_OPENING_NOT_DIMENSIONED` for what no chain can measure.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import type { Scene } from "../src/scene.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string): string => readFileSync(join(__dirname, "..", "examples", name), "utf8");

const STEPPED_WALL = "(3615,190) (3615,5679) (2225,5679) (2225,5389) (190,5389)";
const STEPPED_ROOM = "(380,380) (3550,380) (3550,5614) (2290,5614) (2290,5324) (380,5324)";

/** The issue's reproduction, verbatim but for the title block. */
const bedroom = (wall: string, room: string, doorAt: number): string => `plan "Spike" {
  units mm
  grid 1
  paper A3 landscape
  north up
  dims auto all
  wall id=w_brick exterior thickness 380 material brick {
    (190,5389) (190,190) (3615,190)
  }
  wall id=w_block partition thickness 130 material poche {
    ${wall}
  }
  room id=bed1 polygon ${room}
    label "Bedroom #1" uses bedroom
  window id=win_bed1 on w_brick at 6974 width 2010 sill 680 head 2640
  door   id=door_bed1 on w_block at ${doorAt} width 880 hinge near start swing into bed1 head 2300
}
`;
const VARIANT_A = bedroom(STEPPED_WALL, STEPPED_ROOM, 6184);
const VARIANT_B = bedroom("(3615,190) (3615,5389) (190,5389)", "(380,380) (3550,380) (3550,5324) (380,5324)", 6094);
const VARIANT_C = bedroom(STEPPED_WALL, STEPPED_ROOM, 8194);

interface DimText {
  x: number;
  y: number;
  value: string;
  /** True for a vertical chain's number (drawn rotated). */
  vertical: boolean;
}

/** Every dimension number, by position. */
function allDimTexts(src: string): DimText[] {
  const { scene, errors } = compile(src, { noCache: true });
  expect(errors).toEqual([]);
  const out: DimText[] = [];
  for (const n of (scene as Scene).nodes) {
    if (n.layer !== "dims" || n.prim.t !== "text") continue;
    out.push({ x: n.prim.at.x, y: n.prim.at.y, value: n.prim.value, vertical: !!n.prim.rotate });
  }
  return out;
}

/** Every horizontal dimension number, by position. */
const dimTexts = (src: string): DimText[] => allDimTexts(src).filter((t) => !t.vertical);

/** The chains below the building (y > `face`), innermost first, each read west to east. */
function southChains(src: string, face: number): string[][] {
  const rows = new Map<number, DimText[]>();
  for (const t of dimTexts(src)) {
    if (t.y <= face) continue;
    rows.set(t.y, [...(rows.get(t.y) ?? []), t]);
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r.sort((a, b) => a.x - b.x).map((t) => t.value));
}

/** Every chain's value list, horizontal and vertical, ignoring where it sits. */
function allChains(src: string): string[][] {
  const rows = new Map<string, DimText[]>();
  for (const t of allDimTexts(src)) {
    const key = t.vertical ? `v${t.x}` : `h${t.y}`;
    rows.set(key, [...(rows.get(key) ?? []), t]);
  }
  return [...rows.values()].map((r) => r.sort((a, b) => (a.vertical ? a.y - b.y : a.x - b.x)).map((t) => t.value));
}

const codes = (src: string): string[] => lint(src).flatMap((d) => (d.code ? [d.code] : []));

suite("dims auto all on a stepped facade (#109)", () => {
  // Outer face of the protruding leg: 5679 + 130/2.
  const FACE = 5744;

  it("chains the door on the protruding leg (variant A)", () => {
    expect(southChains(VARIANT_A, FACE)).toEqual([["2480", "880", "320"], ["1910", "1260"], ["3680"]]);
  });

  it("chains the door on the recessed leg too (variant C)", () => {
    expect(southChains(VARIANT_C, FACE)).toEqual([["760", "880", "2040"], ["1910", "1260"], ["3680"]]);
  });

  it("leaves the un-stepped control exactly as it was (variant B)", () => {
    // Its probe always found the wall; the south face is 5389 + 65.
    expect(southChains(VARIANT_B, 5454)).toEqual([["2280", "880", "520"], ["3170"], ["3680"]]);
  });

  it("hangs every chain outside the outermost leg, not off the rooms' bounding box", () => {
    // Every south number sits past the protruding leg's outer face, so no chain crosses it.
    for (const src of [VARIANT_A, VARIANT_C]) {
      const south = dimTexts(src).filter((t) => t.y > 5389 && t.x > 0 && t.x < 3615);
      expect(south.length).toBeGreaterThan(0);
      for (const t of south) expect(t.y).toBeGreaterThan(FACE);
    }
  });

  it("raises no W_OPENING_NOT_DIMENSIONED once the door is chained", () => {
    for (const src of [VARIANT_A, VARIANT_B, VARIANT_C]) expect(codes(src)).not.toContain("W_OPENING_NOT_DIMENSIONED");
  });
});

suite("the same fallback's shipped numbers", () => {
  it("terrace-row: the stepped top facade's overall height reads face to face", () => {
    const chains = allChains(example("terrace-row.arch"));
    expect(chains).toContainEqual(["9850"]);
    expect(chains).not.toContainEqual(["9725"]);
  });

  it("hexagon-pavilion: the overall width reaches the drawn mitred corners", () => {
    const chains = allChains(example("hexagon-pavilion.arch"));
    expect(chains).toContainEqual(["15375"]);
    expect(chains).not.toContainEqual(["15000"]);
  });
});

suite("W_OPENING_NOT_DIMENSIONED", () => {
  const angled = (mode: string, extra = ""): string => `plan "A" {
  units mm
  dims auto ${mode}
  wall id=w1 exterior thickness 200 { (0,0) (6000,0) (6000,4000) (2000,6000) (0,4000) close }
  window id=win on w1 at 12000 width 1200
  ${extra}
}
`;

  it("reports an opening on an angled exterior wall", () => {
    const d = lint(angled("all")).filter((x) => x.code === "W_OPENING_NOT_DIMENSIONED");
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain('"win"');
    expect(d[0]!.message).toContain("angled");
    expect(d[0]!.span).toBeDefined();
  });

  it("is silent unless the plan asks for openings chains", () => {
    for (const mode of ["rooms", "overall", "walls"])
      expect(codes(angled(mode))).not.toContain("W_OPENING_NOT_DIMENSIONED");
  });

  it("never reports a door joining two rooms, even on an exterior wall", () => {
    // A wing added west of the shell: the door on the shell's west wall is between rooms.
    const src = `plan "W" {
  units mm
  dims auto all
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  wall id=wing exterior thickness 200 { (0,0) (-3000,0) (-3000,3000) (0,3000) }
  room id=main at (0,0) size 4000x3000 label "Main"
  room id=annex at (-3000,0) size 3000x3000 label "Annex"
  door id=link on shell at 12500 width 900 swing into main
  door id=front on shell at 2000 width 900 swing into main
}
`;
    expect(codes(src)).not.toContain("W_OPENING_NOT_DIMENSIONED");
  });

  it("stands down once a hand-written dim measures the opening", () => {
    // Jamb to jamb along the angled wall, drawn on the opening itself.
    const dimmed = angled("all", 'dim (4748,4626)->(3674,5163) offset 0 text "1200"');
    expect(codes(dimmed)).not.toContain("W_OPENING_NOT_DIMENSIONED");
    // A dim somewhere else on the plan does not count.
    expect(codes(angled("all", "dim (0,0)->(6000,0) offset -600"))).toContain("W_OPENING_NOT_DIMENSIONED");
  });

  /** The opening ids the rule reports on a source. */
  const hit = (src: string): string[] =>
    lint(src)
      .filter((d) => d.code === "W_OPENING_NOT_DIMENSIONED")
      .map((d) => d.message.match(/"([^"]+)"/)![1]!);
  /** An example with its hand-written `dim` lines removed. */
  const undimmed = (name: string): string =>
    example(name)
      .split("\n")
      .filter((l) => !/^\s*dim\s/.test(l))
      .join("\n");

  it("finds the shipped examples' real gaps, which they now dimension by hand", () => {
    // The two windows on aquarium's curved facade and gallery-l's door on its angled face
    // are the only openings in the shipped examples that no chain can measure...
    expect(hit(undimmed("aquarium.arch"))).toEqual(["w_arc1", "w_arc2"]);
    expect(hit(undimmed("gallery-l.arch"))).toEqual(["entry"]);
    // ...and the examples as shipped carry the hand dims that close them.
    expect(hit(example("aquarium.arch"))).toEqual([]);
    expect(hit(example("gallery-l.arch"))).toEqual([]);
    // Doors between a shell and a wing added outboard of it are connections, not facade
    // openings: the category `exterior` alone must not trip the rule.
    expect(hit(example("hillside-villa.arch"))).toEqual([]);
    expect(hit(example("museum-wings.arch"))).toEqual([]);
  });
});
