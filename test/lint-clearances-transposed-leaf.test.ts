/**
 * Plan-soundness PS2.11c (`W_FOOTPRINT_TRANSPOSED`) and PS2.11d (`W_LEAF_ACROSS_DOORWAY`): what
 * each fires on, what it must not fire on, its boundaries, its fix, its words, and that a `place`
 * turn or mirror moves neither (both are classified `invariant` in `test/helpers/d4-oracle.ts`).
 */

import { describe as suite, expect, it } from "vitest";
import { applyFixes, type Diagnostic, lint } from "../src/index.js";
import { CATALOG_CATEGORIES, defaultFootprint, fixtureSpec } from "../src/fixtures-catalog.js";

const of = (src: string, code: string, profile?: string): Diagnostic[] =>
  lint(src, profile ? { profile } : {}).filter((d) => d.code === code);

// ─── W_FOOTPRINT_TRANSPOSED ──────────────────────────────────────────────────────────────

const lounge = (piece: string): string => `plan "P" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  room id=r at (0,0) size 6000x5000 label "Lounge" uses living
  door id=d at (4000,5000) width 900 wall shell
  ${piece}
}`;
const T = "W_FOOTPRINT_TRANSPOSED";

suite("W_FOOTPRINT_TRANSPOSED (PS2.11c)", () => {
  it("the catalogue's `fixedAspect` families each have an oblong (≥ 5:4) footprint and a back", () => {
    const flagged = CATALOG_CATEGORIES.filter((c) => fixtureSpec(c)?.fixedAspect === true);
    expect(flagged.length).toBeGreaterThan(10);
    for (const c of flagged) {
      const fp = defaultFootprint(c);
      expect(fp, c).not.toBeNull();
      const long = Math.max(fp!.along, fp!.depth);
      const short = Math.min(fp!.along, fp!.depth);
      expect(4 * long >= 5 * short, c).toBe(true);
      expect(fixtureSpec(c)?.symmetric, c).not.toBe(true);
    }
  });

  it("a wider-than-deep piece (sofa_l): its long side drawn as its depth", () => {
    const ds = of(lounge("furniture sofa_l at (2000,800) size 900x2400"), T);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      "The sofa_l in Lounge is drawn turned a quarter: its symbol is 900 mm along its back and 2400 mm deep, but a sofa_l is wider than it is deep (2600 × 1600 mm), so its long side is drawn as its depth.",
    );
    // The id is assigned (`sofa_l_1`): never quoted, in the message or the hint.
    expect(ds[0]!.hints!.join(" ")).not.toContain("sofa_l_1");
    expect(ds[0]!.hints![0]).toContain("on the sofa_l in Lounge");
    // Not the catalogue footprint swapped, so no fix.
    expect(ds[0]!.fixes).toBeUndefined();
  });

  it("a deeper-than-wide piece (bed): its long side drawn along its back; an authored id is quoted", () => {
    const ds = of(lounge('furniture id=couch bed at (2000,800) size 1900x700 label "Couch"'), T);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      "The Couch in Lounge is drawn turned a quarter: its symbol is 1900 mm along its back and 700 mm deep, but a bed is deeper than it is wide (1500 × 2000 mm), so its long side is drawn along its back.",
    );
    expect(ds[0]!.hints![0]).toContain('`size` on "couch"');
  });

  it("a WC against a wall: the same wording, no `rotate` hint, and a swap fix to the catalogue size", () => {
    const src = lounge("furniture wc against wall shell segment 3 offset 2500 size 700x400 in r");
    const ds = of(src, T);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      "The wc in Lounge is drawn turned a quarter: its symbol is 700 mm along its back and 400 mm deep, but a wc is deeper than it is wide (400 × 700 mm), so its long side is drawn along its back.",
    );
    expect(ds[0]!.hints![0]).not.toContain("rotate");
    expect(ds[0]!.fixes).toHaveLength(1);
    expect(ds[0]!.fixes![0]!.applicability).toBe("maybe-incorrect");
    const fixed = applyFixes(src, ds[0]!.fixes!, { maxApplicability: "maybe-incorrect" }).output;
    expect(fixed).toContain("size 400x700");
    expect(of(fixed, T)).toEqual([]);
  });

  it("the fix is written from the size as drawn on the grid, and only when that is the catalogue's", () => {
    // `grid 50` snaps 690 to 700: the drawn wc is 700 × 400, its swap the catalogue's 400 × 700.
    const ds = of(lounge("furniture wc against wall shell segment 3 offset 2500 size 690x400 in r"), T);
    expect(ds[0]!.fixes![0]!.edits[0]!.newText).toBe("400x700");
    // 800 × 400 swaps to 400 × 800, not the catalogue's: no fix.
    expect(of(lounge("furniture wc against wall shell segment 3 offset 2500 size 800x400 in r"), T)[0]!.fixes).toBe(
      undefined,
    );
  });

  it("does not fire on the same piece the right way round, a custom smaller one, or a near-square one", () => {
    expect(of(lounge("furniture sofa_l at (2000,800) size 2400x900"), T)).toEqual([]);
    expect(of(lounge("furniture sofa_l at (2000,800) size 1300x1250"), T)).toEqual([]);
    expect(of(lounge("furniture bed at (2000,800) size 900x1900"), T)).toEqual([]);
  });

  it("reads the symbol's frame: `rotate 90` swaps it, both ways", () => {
    expect(of(lounge("furniture sofa_l at (2000,800) size 900x2400 rotate 90"), T)).toEqual([]);
    expect(of(lounge("furniture sofa_l at (2000,800) size 2400x900 rotate 90"), T)).toHaveLength(1);
    expect(of(lounge("furniture bed at (2000,800) size 2000x1500 rotate 270"), T)).toEqual([]);
    expect(of(lounge("furniture bed at (2000,800) size 1500x2000 rotate 270"), T)).toHaveLength(1);
  });

  it("the 5:4 boundary is exact", () => {
    // A bed is 1500 × 2000 (deeper than wide). Written 2000 wide: 4·2000 = 5·1600 fires at 1600
    // deep; 4·2000 < 5·1650 does not (the plan's 50 mm grid is the finest step).
    expect(of(lounge("furniture bed at (2000,800) size 2000x1600"), T)).toHaveLength(1);
    expect(of(lounge("furniture bed at (2000,800) size 2000x1650"), T)).toEqual([]);
  });

  it("never judges a family sold in both shapes, a piece with no footprint, or a symmetric one", () => {
    for (const piece of [
      "furniture filing_cabinet at (2000,800) size 900x450", // a lateral cabinet
      "furniture locker at (2000,800) size 300x450",
      "furniture shed at (1000,800) size 1800x2400",
      "furniture wardrobe at (2000,800) size 450x600", // a single-door wardrobe
      "furniture kitchen_sink at (2000,800) size 450x600",
      "furniture wardrobe at (2000,800) size 600x1800", // out of reach: card PS2.53's depth ceiling
      "furniture bookshelf at (2000,800) size 600x3000", // a library stack
      "furniture radiator at (200,800) size 100x1000",
      "furniture fridge at (100,100) size 650x600",
      "furniture chaise at (2000,800) size 800x1600", // a chaise longue: its back at a short end
      "furniture chaise at (2000,800) size 1600x800",
      "furniture sofa at (2000,800) size 900x2200", // no catalogued footprint (PS3.11)
      "furniture pool_table at (1000,800) size 1400x2500",
    ])
      expect(of(lounge(piece), T), piece).toEqual([]);
  });

  it("is unmoved by a `place` turn or mirror: same count, same span, same fix", () => {
    const body = `component nook() {
    room id=r at (0,0) size 4000x3000 label "Nook"
    furniture wc at (300,300) size 700x400
  }`;
    const at = (frame: string): Diagnostic[] =>
      of(`plan "P" {\n  units mm\n  ${body}\n  place nook() as n at (0,0)${frame}\n}`, T);
    const base = at("");
    expect(base).toHaveLength(1);
    for (const frame of [" rotate 90", " rotate 180", " mirror x", " rotate 90 mirror y"]) {
      const ds = at(frame);
      expect(ds, frame).toHaveLength(1);
      expect(ds[0]!.span, frame).toEqual(base[0]!.span);
      expect(ds[0]!.fixes, frame).toEqual(base[0]!.fixes);
    }
  });
});

// ─── W_LEAF_ACROSS_DOORWAY ───────────────────────────────────────────────────────────────

const L = "W_LEAF_ACROSS_DOORWAY";
/** The corpus case's hall: d_front hinged on the shell, its leaf into the hall; d_bed on the
 *  100 mm partition at x 3000 (hall face 3050), spanning y 250–1050. */
const hall = (front: string, extra = ""): string => `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  wall id=w_mid partition thickness 100 { (3000,0) (3000,5000) }
  room id=r_bed at (0,0) size 3000x5000 label "Bedroom 2" uses bedroom
  room id=r_hall at (3000,0) size 3000x5000 label "Hall" uses hall
  ${front}
  door id=d_bed at (3000,650) width 800 wall w_mid swing into r_bed
  ${extra}
}`;
const FRONT = "door id=d_front at (3700,0) width 900 wall shell hinge near start swing into r_hall";

suite("W_LEAF_ACROSS_DOORWAY (PS2.11d)", () => {
  it("fires on a leaf parked in front of another doorway, naming both doors by their rooms", () => {
    const ds = of(hall(FRONT), L);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'In "Hall", the open leaf of the door from outside parks 200 mm in front of the door to "Bedroom 2" and leaves 150 mm of its 800 mm doorway clear (700 mm needed), so one door must be shut to use the other.',
    );
    expect(ds[0]!.message).not.toMatch(/d_front|d_bed/);
    expect(ds[0]!.hints!.join(" ")).toContain('door "d_front"');
    expect(ds[0]!.hints![0]).toContain("which parks the leaf clear of this doorway");
    expect(ds[0]!.fixes).toBeUndefined();
  });

  it("quotes no assigned id: unnamed doors are named in the hints by the rooms they join", () => {
    const src = hall(FRONT.replace("id=d_front ", "")).replace("door id=d_bed ", "door ");
    const ds = of(src, L);
    expect(ds).toHaveLength(1);
    const hints = ds[0]!.hints!.join(" ");
    expect(hints).not.toMatch(/door_\d/);
    expect(hints).toContain("Hang the door from outside on its other jamb");
    expect(hints).toContain('the door to "Bedroom 2" along its wall');
  });

  it("tells apart two unnamed doors from the same room to the same place", () => {
    // Two doors from outside into one hall: the north door's leaf (x 250) parks 150 mm in front of
    // the west door (face x 100, y 250–1050), which swings out.
    const src = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,5000) (0,5000) close }
  room id=r_hall at (0,0) size 3000x5000 label "Hall" uses hall
  door at (700,0) width 900 wall shell hinge near start swing in
  door at (0,650) width 800 wall shell swing out
}`;
    const ds = of(src, L);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain(
      "the open leaf of the door from outside parks 150 mm in front of the other door from outside",
    );
    expect(ds[0]!.hints![1]).toContain("Or move the door from outside or the other door from outside along its wall");
  });

  it("is quiet when the leaf hangs on the other jamb, or swings outside", () => {
    expect(of(hall(FRONT.replace("near start", "near end")), L)).toEqual([]);
    expect(of(hall(FRONT.replace("swing into r_hall", "swing out")), L)).toEqual([]);
  });

  it("the approach is `doorwayLandingMm` from the face, open at its far edge", () => {
    // Hinge at x 3350: the leaf stands exactly 300 mm from the 3050 face, outside the zone.
    const at300 = hall(FRONT.replace("(3700,0)", "(3800,0)"));
    expect(of(at300, L)).toEqual([]);
    // Hinge at x 3300: 250 mm, inside.
    expect(of(hall(FRONT.replace("(3700,0)", "(3750,0)")), L)).toHaveLength(1);
    // `accessibility-advisory` asks 450 mm, so 300 mm is inside there.
    expect(of(at300, L, "accessibility-advisory")).toHaveLength(1);
  });

  it("leaves a passable doorway alone: under 700 mm left clear is the threshold", () => {
    // d_bed 1600 wide (y 250–1850): the leaf covers y 250–900 and leaves 950 mm.
    const wide = hall(FRONT).replace(
      "door id=d_bed at (3000,650) width 800",
      "door id=d_bed at (3000,1050) width 1600",
    );
    expect(of(wide, L)).toEqual([]);
  });

  it("a sliding door parks no leaf, but its doorway is still judged; a leaf-less opening is not", () => {
    expect(of(hall("door id=d_front sliding at (3700,0) width 900 wall shell swing into r_hall"), L)).toEqual([]);
    const pocket = hall(FRONT).replace(
      "door id=d_bed at (3000,650) width 800 wall w_mid swing into r_bed",
      "door id=d_bed pocket at (3000,650) width 800 wall w_mid slide right",
    );
    expect(of(pocket, L)).toHaveLength(1);
    const opening = hall(FRONT).replace(
      "door id=d_bed at (3000,650) width 800 wall w_mid swing into r_bed",
      "opening id=o_bed at (3000,650) width 800 wall w_mid",
    );
    expect(of(opening, L)).toEqual([]);
  });

  it("a leaf behind a partition: the two doors share no room, so it is not across the doorway", () => {
    // A 200 mm closet between the bedroom door and the hall: d_bed joins bedroom and closet, the
    // front door's leaf (x 3250) stands in the hall, behind the closet's 3200 partition.
    const src = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  wall id=w_mid partition thickness 100 { (3000,0) (3000,5000) }
  wall id=w_cl partition thickness 100 { (3200,0) (3200,5000) }
  room id=r_bed at (0,0) size 3000x5000 label "Bedroom 2" uses bedroom
  room id=r_cl at (3000,0) size 200x5000 label "Closet" uses storage
  room id=r_hall at (3200,0) size 2800x5000 label "Hall" uses hall
  door id=d_front at (3700,0) width 900 wall shell hinge near start swing into r_hall
  door id=d_bed at (3000,650) width 800 wall w_mid swing into r_bed
  door id=d_cl at (3200,4000) width 700 wall w_cl swing into r_hall
}`;
    expect(of(src, L)).toEqual([]);
  });

  it("leaves a pair whose swings collide to W_SWING_OBSTRUCTED", () => {
    const src = hall(FRONT).replace("swing into r_bed", "swing into r_hall");
    expect(of(src, "W_SWING_OBSTRUCTED")).toHaveLength(1);
    expect(of(src, L)).toEqual([]);
  });

  // Neither the leaf of a door on an angled wall nor the approach to one is measured (the
  // catalogue says so). The first case keeps the approached door orthogonal and angles only the
  // leaf's door; the second is the corpus case turned 45° about the origin (its unturned twin is
  // the first case of this suite, which fires), so the approached door is angled too.
  const R = Math.SQRT1_2;
  const turn = (x: number, y: number): string => `(${(x - y) * R},${(x + y) * R})`;
  it("does not measure a leaf from a door on an angled wall", () => {
    // A closet cut off the hall by a 45° partition: its door's open leaf leaves the partition at
    // 45°, from about (3777,177) toward (3141,813), across the bedroom door's approach (x 3050–3350,
    // y 250–1050): inside it, the leaf's shadow covers y about 604–813 of the span, leaving 354 mm
    // clear (with the orthogonal guard lifted, the rule fires on it). The leaf of a door on an
    // angled wall is not measured, so it is quiet.
    const src = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  wall id=w_mid partition thickness 100 { (3000,0) (3000,5000) }
  wall id=w_diag partition thickness 100 { (3600,0) (6000,2400) }
  room id=r_bed at (0,0) size 3000x5000 label "Bedroom 2" uses bedroom
  room id=r_hall polygon (3000,0) (3600,0) (6000,2400) (6000,5000) (3000,5000) label "Hall" uses hall
  room id=r_cl polygon (3600,0) (6000,0) (6000,2400) label "Closet" uses storage
  door id=d_cl on w_diag at 700 width 900 hinge left swing in
  door id=d_bed at (3000,650) width 800 wall w_mid swing into r_bed
  door id=d_front at (1500,5000) width 900 wall shell
}`;
    expect(lint(src).filter((d) => d.severity === "error")).toEqual([]);
    expect(of(src, L)).toEqual([]);
  });

  it("does not measure the approach to a door on an angled wall", () => {
    // Every wall turned 45°: the bedroom door's wall is angled (and the front door's too).
    const src = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { ${turn(0, 0)} ${turn(6000, 0)} ${turn(6000, 5000)} ${turn(0, 5000)} close }
  wall id=w_mid partition thickness 100 { ${turn(3000, 0)} ${turn(3000, 5000)} }
  room id=r_bed polygon ${turn(0, 0)} ${turn(3000, 0)} ${turn(3000, 5000)} ${turn(0, 5000)} label "Bedroom 2" uses bedroom
  room id=r_hall polygon ${turn(3000, 0)} ${turn(6000, 0)} ${turn(6000, 5000)} ${turn(3000, 5000)} label "Hall" uses hall
  door id=d_front on shell segment 0 at 3700 width 900 hinge left swing in
  door id=d_bed on w_mid at 650 width 800 swing out
}`;
    expect(of(src, L)).toEqual([]);
  });

  it("is unmoved by a `place` turn or mirror", () => {
    const body = `component flat() {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
    wall id=w_mid partition thickness 100 { (3000,0) (3000,5000) }
    room id=r_bed at (0,0) size 3000x5000 label "Bedroom 2" uses bedroom
    room id=r_hall at (3000,0) size 3000x5000 label "Hall" uses hall
    ${FRONT}
    door id=d_bed at (3000,650) width 800 wall w_mid swing into r_bed
  }`;
    const at = (frame: string): Diagnostic[] =>
      of(`plan "P" {\n  units mm\n  ${body}\n  place flat() as f at (0,0)${frame}\n}`, L);
    const base = at("");
    expect(base).toHaveLength(1);
    for (const frame of [" rotate 90", " rotate 270", " mirror x", " mirror y", " rotate 90 mirror x"]) {
      const ds = at(frame);
      expect(ds, frame).toHaveLength(1);
      expect(ds[0]!.span, frame).toEqual(base[0]!.span);
      expect(ds[0]!.message, frame).toBe(base[0]!.message);
    }
  });
});
