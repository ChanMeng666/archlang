/**
 * `FixtureSpec.overhead` — the piece that hangs ABOVE the plane a floor plan is cut at.
 *
 * Three families carry it (`upper_cabinet`/`wall_cabinet`, `range_hood`, `mirror`), and the
 * defect that made it necessary was visible in the flagship's own source: a range hood over
 * the hob and a mirror over the basin are CORRECT drawings, both raised
 * `W_FURNITURE_OVERLAP`, and both were left out of `examples/furnished-flat.arch` rather than
 * nudged somewhere false. The flag is what lets them back in.
 *
 * ## The flag is NOT `underlay` spelled backwards, and this file is the proof
 *
 * `underlay` (a rug) feeds FOUR consumers, and declines a check in all four. `overhead` feeds
 * exactly ONE — `W_FURNITURE_OVERLAP` — and the difference is asserted here rather than
 * asserted in prose:
 *
 *   - **Overlap: exempt**, by a PAIR test. Two things on different sides of the cut plane
 *     cannot collide. Every case below carries its counterexample, because the exemption must
 *     never degrade into "overlap checking is off": the same geometry with two ordinary pieces
 *     still warns, and — the case a blanket exemption gets wrong — two OVERHEAD pieces
 *     overlapping EACH OTHER still warn, exactly as two rugs do.
 *   - **Both walkability grids: still an obstacle.** This is the whole difference from an
 *     underlay, and it is proved with the same plan, the same footprint, one word different: a
 *     rug is walked ON, a wall cabinet is not walked UNDER — a body is taller than a wall
 *     unit's underside. So `solidFurniture()` is untouched by this flag, which is also what
 *     keeps `furnitureSealed`'s furniture-free control and `measureWaysIn`'s body-radius
 *     ladder — two further `buildNav` callers with different parameters — agreeing with the
 *     main grid about a range hood. There is no per-call-site exemption for them to disagree
 *     about, and both are driven below through the diagnostics only they can produce.
 *   - **Frontal clearance: nothing added, deliberately.** An overhead piece is above a
 *     fixture's use-space rather than in it, but every overhead family is also `requiresWall`
 *     and that rule already skips every services fixture as an obstruction. The redundancy is
 *     pinned here so that the day an overhead family is NOT wall-requiring (a ceiling pendant
 *     hangs off the slab, not the fabric) this assertion is what goes red.
 *
 * ## "Draws dashed" is a bigger set than "is overhead"
 *
 * Four shipped symbols draw the `dashedPattern()` outline the drawing reserves for a thing
 * above the cut plane, and only three FAMILIES carry the flag: a bunk bed's upper deck and a
 * vanity's mirror band are dashed BITS of a piece that stands on the floor. Pinned below, so
 * nobody derives the flag from the linework.
 */

import { describe, expect, it } from "vitest";
import { describe as describeSource, lint } from "../src/index.js";
import {
  CATALOG_CATEGORIES,
  cutPlaneLayer,
  isOverhead,
  isUnderlay,
  requiresWall,
  solidFurniture,
} from "../src/fixtures-catalog.js";

/** The codes `arch lint` raises for a plan body, in order. */
const codesFor = (src: string): string[] => lint(src).map((d) => d.code ?? "");

describe("`overhead` — which categories carry it", () => {
  it("is set on the three families that hang off the fabric, and on nothing else", () => {
    for (const c of ["upper_cabinet", "wall_cabinet", "range_hood", "mirror"]) {
      expect(isOverhead(c), `${c} should be overhead`).toBe(true);
    }
    // The near misses: two pieces whose SYMBOL draws a dashed part, one plumbed piece that
    // stands on the floor, the underlay, and an uncatalogued word.
    for (const c of ["bunk_bed", "vanity", "water_heater", "counter", "rug", "widget"]) {
      expect(isOverhead(c), `${c} should not be overhead`).toBe(false);
    }
  });

  it("no category is both an underlay and overhead — they are opposite sides of one plane", () => {
    for (const c of ["upper_cabinet", "wall_cabinet", "range_hood", "mirror"]) {
      expect(isUnderlay(c), `${c}`).toBe(false);
    }
    for (const c of ["rug", "carpet"]) expect(isOverhead(c), `${c}`).toBe(false);
  });

  it("`cutPlaneLayer` is the one three-valued answer the overlap rule asks for", () => {
    expect(cutPlaneLayer("rug")).toBe("underlay");
    expect(cutPlaneLayer("carpet")).toBe("underlay");
    expect(cutPlaneLayer("range_hood")).toBe("overhead");
    expect(cutPlaneLayer("upper_cabinet")).toBe("overhead");
    expect(cutPlaneLayer("mirror")).toBe("overhead");
    for (const c of ["sofa", "hob", "bunk_bed", "widget"]) expect(cutPlaneLayer(c), c).toBe("body");
  });
});

describe("`overhead` — what the flag changes in `W_FURNITURE_OVERLAP`", () => {
  const plan = (body: string): string =>
    ['plan "O" {', "  units mm", '  room id=r at (0,0) size 6000x5000 label "Kitchen" uses kitchen', body, "}"].join(
      "\n",
    );
  const codes = (body: string): string[] => codesFor(plan(body));

  // ONE geometry, used by every case below, so the only variable is the pair of words.
  const pair = (a: string, b: string): string =>
    `  furniture ${a} at (1000,300) size 600x600\n  furniture ${b} at (900,350) size 900x500`;

  it("a range hood over the hob is the arrangement, not a collision", () => {
    expect(codes(pair("hob", "range_hood"))).not.toContain("W_FURNITURE_OVERLAP");
  });

  it("…and a mirror over the basin likewise", () => {
    expect(codes(pair("basin", "mirror"))).not.toContain("W_FURNITURE_OVERLAP");
  });

  it("…and the exemption is the PAIR, not a switch: the same geometry with two ordinary pieces warns", () => {
    // The counterexample that makes both cases above non-vacuous — identical rectangles,
    // neither piece overhead.
    expect(codes(pair("hob", "table"))).toContain("W_FURNITURE_OVERLAP");
  });

  it("…and two OVERHEAD pieces overlapping EACH OTHER still warn", () => {
    // The case a blanket "skip anything overhead" test would get wrong, and the rule two rugs
    // already obey: one wall cabinet half through a hood is a drawing mistake, and nothing
    // about hanging above the cut plane says otherwise.
    expect(codes(pair("upper_cabinet", "range_hood"))).toContain("W_FURNITURE_OVERLAP");
  });

  it("…while an underlay and an overhead piece do not collide either, from the layers alone", () => {
    // Neither flag's own rule covers this pair; the three-valued `cutPlaneLayer` answers it
    // without a third condition having been written for it.
    expect(codes(pair("rug", "range_hood"))).not.toContain("W_FURNITURE_OVERLAP");
    // Non-vacuity for THIS pair: a rug and an ordinary piece of the same size still exempt,
    // a hood and an ordinary piece of the same size still exempt, two ordinary ones do not.
    expect(codes(pair("rug", "table"))).not.toContain("W_FURNITURE_OVERLAP");
    expect(codes(pair("table", "bench"))).toContain("W_FURNITURE_OVERLAP");
  });
});

describe("`overhead` — a rug is walked ON, a wall cabinet is not walked UNDER", () => {
  /**
   * The `underlay` plan from `glyphs-batch2.test.ts`, reused deliberately: one piece spanning
   * the back room wall-to-wall right inside its only door. Through a rug the far room stays
   * reachable; through anything solid it is sealed. The absurd 5000 × 1780 run of wall units
   * is a test rig for the GEOMETRY — the question is which predicate the grids consult, not
   * whether a kitchen is ever fitted like this.
   */
  const plan = (category: string): string => `plan "W" {
    units mm
    wall id=w exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
    wall id=p partition thickness 100 { (0,2500) (5000,2500) }
    room id=front at (0,0)    size 5000x2500 label "Hall" uses hall
    room id=back  at (0,2500) size 5000x2500 label "Back"
    door id=d_in on w at 2500 width 900 hinge near start swing into front
    door id=d_bk on p at 2500 width 900 hinge near start swing into back
    furniture ${category} at (0,2620) size 5000x1780
  }`;

  const reached = (category: string): string[] =>
    (describeSource(plan(category)).circulation?.rooms ?? []).map((r) => r.roomId);
  const codes = (category: string): string[] => codesFor(plan(category));

  it("an overhead piece seals the back room off — both grids say so", () => {
    for (const category of ["upper_cabinet", "range_hood"]) {
      // `analyze/circulation.ts`: the room never appears in the entrance walk.
      expect(reached(category), category).toEqual(["front"]);
      // `analyze/occupancy.ts`, through the lint rule that reads it.
      expect(codes(category), category).toContain("W_ROOM_NO_CLEAR_PATH");
    }
  });

  it("…exactly as an ordinary solid piece does, and unlike a rug at the same footprint", () => {
    // The two poles this case sits between. Without the rug half, "overhead obstructs" would
    // be trivially true of everything; without the piano half, it would prove nothing about
    // the two flags differing.
    expect(reached("piano")).toEqual(["front"]);
    expect(reached("rug")).toEqual(["front", "back"]);
    expect(codes("rug")).not.toContain("W_ROOM_NO_CLEAR_PATH");
  });

  it("`solidFurniture` — the predicate both grids share — keeps overhead pieces", () => {
    const pieces = [{ category: "rug" }, { category: "upper_cabinet" }, { category: "range_hood" }];
    expect(solidFurniture(pieces)).toEqual([{ category: "upper_cabinet" }, { category: "range_hood" }]);
  });

  it("the two EXTRA nav-grid callers agree with the main grid about an overhead piece", () => {
    // `furnitureSealed` rebuilds the grid with NO furniture and keeps only the rooms the
    // furniture is actually responsible for; `measureWaysIn` rebuilds it down a descending
    // body-radius ladder to report the widest way in. Both call `buildNav` again with
    // different arguments, so an exemption applied at any one call site would split them from
    // the main pass. They are observable only through the wording these two diagnostics carry,
    // and an overhead piece must produce the SAME wording a piano does.
    const pathMsg = (category: string, code: string): string =>
      lint(plan(category)).find((d) => d.code === code)?.message ?? "";
    for (const code of ["W_ROOM_NO_CLEAR_PATH", "W_PATH_TOO_NARROW"]) {
      // The furniture-free control fired (the claim "furniture … seal off" was EARNED, not
      // assumed) and the ladder measured a way in, for the overhead piece and the piano alike.
      expect(pathMsg("upper_cabinet", code), code).toBe(pathMsg("piano", code));
      expect(pathMsg("upper_cabinet", code), code).not.toBe("");
    }
    // …and the rug reaches neither rule, which is what makes the equality above a finding.
    expect(pathMsg("rug", "W_ROOM_NO_CLEAR_PATH")).toBe("");
  });

  it("but an overhead piece drawn THROUGH a wall is still a drawing error", () => {
    // `W_FURNITURE_WALL_COLLISION` deliberately keeps applying, on the underlay precedent:
    // what height a thing hangs at has no bearing on whether it is inside the plaster.
    for (const c of ["upper_cabinet", "range_hood", "rug", "piano"]) {
      expect(codes(c), c).toContain("W_FURNITURE_WALL_COLLISION");
    }
  });
});

describe("`overhead` — the frontal-clearance rule needs nothing, and here is why", () => {
  const plan = (body: string): string =>
    ['plan "C" {', "  units mm", '  room id=r at (0,0) size 6000x5000 label "Room"', body, "}"].join("\n");

  it("EVERY overhead family is also `requiresWall` — the premise the omission rests on", () => {
    // This is the assertion that goes red the day a ceiling-hung family lands (a pendant, a
    // projector: overhead, but off the slab rather than the fabric). At that point the
    // clearance rule needs its own `isOverhead` arm, and it will be reachable enough to test.
    const overheadCats = CATALOG_CATEGORIES.filter((c) => isOverhead(c));
    expect(overheadCats).toEqual(["upper_cabinet", "wall_cabinet", "mirror", "range_hood"]);
    for (const c of overheadCats) expect(requiresWall(c), c).toBe(true);
  });

  it("an overhead piece in a fixture's use-space is already skipped, as a SERVICES fixture", () => {
    // A WC wants 450 mm of clear floor in front (it faces south at `rotate 0`). Parking a
    // range hood there raises nothing — but not because of this flag: `requiresWall` is tested
    // one condition to the left, and every overhead family carries it. The pin is that they
    // still all do, so the redundant arm stays redundant.
    const inFront = "  furniture wc at (1000,300) size 400x700\n  furniture %s at (900,1050) size 800x300";
    expect(codesFor(plan(inFront.replace("%s", "range_hood")))).not.toContain("W_FURN_CLEARANCE");
    expect(codesFor(plan(inFront.replace("%s", "coffee_table")))).toContain("W_FURN_CLEARANCE");
  });
});
