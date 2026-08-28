/**
 * The v1.31 CROSS-FEATURE gate — the cases neither track could produce on its own.
 *
 * v1.31 landed on two parallel branches from `v1.30.0`. Track A added the GROUND: `outdoor
 * <kind>` surfaces, `fence`, `site … boundary`, and the `OUTDOOR_LAYERS` list that tells the
 * rest of the tree "this node is not a room". Track B added the GARAGE and the outdoor
 * FIXTURES: `uses garage`, `W_GARAGE_TOO_NARROW`, the `door garage` kind whose overhead
 * projection side is DERIVED from which face has floor, and 21 furniture families that are
 * placed outdoors.
 *
 * Git merged them cleanly. `docs/backlog.md`'s merge protocol says in as many words that a
 * clean auto-merge is not evidence, and the v1.25.0 near-miss is why. So the two places the
 * tracks touch the same question get a test that only exists after the merge:
 *
 *  1. **`roomSideOf` vs. the ground.** A `garage` door parks its panel overhead INSIDE the
 *     building, and `elements/door.ts` picks that side by probing one wall thickness off
 *     each face and asking which side has FLOOR. Track A then introduced a second thing you
 *     can draw on the ground outside that wall — a `driveway`, which is exactly what is
 *     outside a garage door — and made a point of it not being a room. If ground ever
 *     entered `ctx.rooms`, the probe would find floor on BOTH sides and the projection could
 *     land in the drive. The plan below is the one that would catch it: the same garage, the
 *     same door, with and without the driveway. The comparison is on GEOMETRY, not bytes,
 *     and deliberately so — the two documents are genuinely not byte-identical, because
 *     ground joins the page bounds and on a plan with no `paper` that rescales every line
 *     weight. A fourth case pins that difference, so the geometry assertion cannot be read
 *     as a byte-identity law it is not.
 *
 *  2. **`isGround` vs. outdoor furniture.** Track A taught `backends/ascii.ts` to skip the
 *     ground on the room pass AND the furniture pass, because a `fence` rides the furniture
 *     layer for z-order and a lawn is a polygon on the floor pass. Track B then put real
 *     furniture out on that same ground. The skip is by LAYER NAME, so a `tree` must still
 *     print while the lawn under it does not — a wider predicate (say, "anything outside a
 *     room") would silently empty the garden.
 *
 * Both are written as differentials rather than as absolute assertions: each compares two
 * plans that differ by ONE statement, so a change to the rest of the pipeline cannot make
 * either pass vacuously.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";
import { renderAscii } from "../src/backends/ascii.js";

/**
 * A garage with a `door garage` on its street wall. `drive` toggles the one statement under
 * test: an `outdoor driveway` on the far side of that door.
 */
function garagePlan(drive: boolean): string {
  return `plan "G" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=r_garage at (0,0) size 6000x6000 label "Garage" uses garage
  door id=d_g garage on shell at 1500 width 3000
  furniture car at (1500,1500) size 1900x4300 in r_garage
${drive ? '  outdoor id=g_d driveway at (1000,-4000) size 4000x4000 label "Drive"\n' : ""}}`;
}

describe("v1.31 cross — the ground is not floor, and a garage door knows it", () => {
  it("both plans compile clean", () => {
    for (const drive of [false, true]) {
      const r = compile(garagePlan(drive), { noCache: true });
      expect(r.errors, `errors with drive=${drive}`).toEqual([]);
    }
  });

  it("the ground never enters describe().rooms — the probe's own input", () => {
    const withDrive = describePlan(garagePlan(true));
    expect(withDrive.rooms.map((r) => r.id)).toEqual(["r_garage"]);
    // …and it IS present, under its own key, so this is not a test of an absent feature.
    expect(withDrive.outdoor?.map((o) => o.kind)).toEqual(["driveway"]);
  });

  /** The `A-DOOR` pass: the panel, the two jamb ticks, and the dashed projection. */
  const doorPass = (src: string): string => {
    const g = compile(src, { noCache: true }).svg.match(/<g id="A-DOOR"[\s\S]*?<\/g>/);
    expect(g, "the A-DOOR group must exist").not.toBeNull();
    return g?.[0] ?? "";
  };

  /** Every coordinate the pass emits, in document order — geometry with no paint. */
  const coords = (pass: string): string[] => [
    ...[...pass.matchAll(/points="([^"]+)"/g)].map((m) => `points ${m[1]}`),
    ...[...pass.matchAll(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(
      (m) => `line ${m[1]},${m[2]} ${m[3]},${m[4]}`,
    ),
  ];

  it("the projection's GEOMETRY is unmoved by a driveway on the other side of the door", () => {
    const bare = coords(doorPass(garagePlan(false)));
    expect(bare.length, "non-vacuity: the pass emits geometry").toBeGreaterThan(3);
    expect(coords(doorPass(garagePlan(true)))).toEqual(bare);
  });

  it("…and the projection is INSIDE the garage, on the side that has floor", () => {
    // The dashed polygon is the projection. `y > 0` is the room side; `y < 0` is the drive.
    const dashed = doorPass(garagePlan(true))
      .split("\n")
      .filter((l) => l.includes("stroke-dasharray"));
    expect(dashed).toHaveLength(1);
    const ys = [...(dashed[0] ?? "").matchAll(/[\d.-]+,([\d.-]+)/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });

  it("the PAINT does change, and that is the documented page-growth rule", () => {
    // Track A states it plainly: ground joins the page bounds, and on a plan with no `paper`
    // `refDim` is the drawing span, so every line weight in the building rescales. Pinning it
    // here keeps the geometry assertion above honest — it is comparing coordinates precisely
    // because the two documents are NOT byte-identical, and this says why.
    const w = (src: string): string => doorPass(src).match(/stroke-width="([\d.]+)"/)?.[1] ?? "(none)";
    expect(w(garagePlan(true))).not.toEqual(w(garagePlan(false)));
  });
});

describe("v1.31 cross — the ASCII backend skips the ground but not what stands on it", () => {
  const lawnPlan = (tree: boolean): string => `plan "L" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=r at (0,0) size 6000x6000 label "Room" uses living
  door id=d on shell at 3000 width 900
  outdoor id=g_lawn lawn at (-5000,-5000) size 4000x4000 label "Lawn"
${tree ? "  furniture tree at (-4500,-4500) size 2400x2400\n" : ""}}`;

  // `-f txt` is the ONLY way this backend is reached, and `src/cli/serialize.ts` compiles
  // with `annotate: true` for it — without that a drawn glyph carries no `elementId`, the
  // furniture pass has nothing to group it by, and every fixture would be dropped for a
  // reason that has nothing to do with the ground. So these two cases annotate, exactly as
  // the CLI does.
  it("the lawn's name never becomes a room's name", () => {
    const scene = compile(lawnPlan(false), { annotate: true, noCache: true }).scene;
    expect(scene, "compile returns a scene").toBeDefined();
    const txt = renderAscii(scene!);
    expect(txt).toContain("Room");
    expect(txt).not.toContain("Lawn");
  });

  it("a tree standing ON that lawn still prints", () => {
    const bare = renderAscii(compile(lawnPlan(false), { annotate: true, noCache: true }).scene!);
    const treed = renderAscii(compile(lawnPlan(true), { annotate: true, noCache: true }).scene!);
    // The differential is the point: one statement added, and the text must change.
    expect(treed).not.toEqual(bare);
  });
});
