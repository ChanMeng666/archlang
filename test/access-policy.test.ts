import { readdirSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  connectorConnection,
  DEFAULT_TOL,
  pointOnRoomEdge,
  resolvePlan,
  roomBox,
  roomsAtPoint,
} from "../src/analyze.js";
import { describe as describePlan, lint, suggestTopology, validateIntent } from "../src/index.js";
import type { RDoor, ROpening, RRoom } from "../src/ir.js";
import { archPlan } from "./arbitrary-plan.js";

/**
 * The access graph's ONE ambiguity policy (`AmbiguityPolicy` in `src/analyze.ts`), as a law.
 *
 * A connector whose point lies on the edges of three rooms does not say, by edge touch
 * alone, which two it joins. Every surface now answers with the same `"probe"`: one host
 * wall thickness off each face, which room's floor holds the probe? When both faces
 * resolve the connector joins those two; when either lands on a room boundary (or in no
 * floor behind an interior wall) it is `ambiguous` and joins nothing.
 *
 * This file used to be the tripwire that asserted lint (`"slice"`: the first two rooms in
 * source order) and `describe()`/circulation (`"drop"`: nothing) STILL DISAGREED on the
 * T-junction below. It is now the agreement it was waiting for: `describe().access`, the
 * circulation model, lint's `W_ROOM_UNREACHABLE`/`W_BATH_VIA_BEDROOM`, the intent channel's
 * `reachable` and `suggestTopology` give one answer — on the T-junction, on offset variants
 * the probe resolves, and on random plans.
 */
const tJunction = (at: number, bedroomStudy = false): string => `plan "T" {
  wall id=shell exterior  thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall id=cross partition thickness 100 { (0,3000) (8000,3000) }
  wall id=stem  partition thickness 100 { (4000,0) (4000,3000) }
  room id=hall  at (0,3000) size 8000x3000 label "Hall"
  room id=study at (0,0)    size 4000x3000 label "${bedroomStudy ? "Bedroom" : "Study"}"
  room id=den   at (4000,0) size 4000x3000 label "${bedroomStudy ? "Bathroom" : "Den"}"
  door    id=d_front at (2000,6000) width 1000 wall shell
  opening id=o_t     at (${at},3000) width 900  wall cross${bedroomStudy ? "\n  door    id=d_stem  at (4000,1500) width 800  wall stem" : ""}
}`;

/** The room a lint diagnostic is anchored on: the one whose own span it carries. */
const roomOf = (rooms: readonly RRoom[], span: { start: number; end: number } | undefined): string =>
  rooms.find((r) => span !== undefined && r.span?.start === span.start && r.span.end === span.end)?.id ?? "?";

/**
 * Every surface's reachability verdict for one plan, side by side. Null when the plan does
 * not compile or has no entrance (lint's reachability rules are then silent by design, and
 * `W_NO_ENTRANCE` is the fact).
 */
function verdicts(src: string) {
  const s = describePlan(src);
  if (!s.ok || !s.access.hasEntrance) return null;
  const { ir } = resolvePlan(src);
  const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
  const connectors = ir!.elements.filter((e): e is RDoor | ROpening => e.kind === "door" || e.kind === "opening");
  const unreachable = s.access.rooms.filter((r) => !r.reachable).map((r) => r.id);
  const withConnector = (id: string): boolean => {
    const box = roomBox(rooms.find((r) => r.id === id)!);
    return connectors.some((c) => pointOnRoomEdge(c.at, box, DEFAULT_TOL));
  };
  const diags = lint(src);
  const lintUnreachable = diags.filter((d) => d.code === "W_ROOM_UNREACHABLE").map((d) => roomOf(rooms, d.span));
  const bathViaBedroom = diags.filter((d) => d.code === "W_BATH_VIA_BEDROOM").map((d) => roomOf(rooms, d.span));
  const noDoorRoute = (s.circulation?.unmeasured ?? [])
    .filter((u) => u.reason === "no_door_route")
    .map((u) => u.roomId);
  const intent = validateIntent(src, { reachable: true });
  const suggestedBaths = suggestTopology(src)
    .filter((x) => x.code === "W_BATH_VIA_BEDROOM")
    .map((x) => x.roomId);
  return { s, unreachable, withConnector, lintUnreachable, bathViaBedroom, suggestedBaths, noDoorRoute, intent };
}

/** The agreement law, stated once for every plan below. */
function assertAgree(src: string): void {
  const v = verdicts(src);
  if (!v) return;
  // lint flags exactly the unreachable rooms that have a connector (the rest are
  // W_ROOM_DISCONNECTED's).
  expect(v.lintUnreachable, src).toEqual(v.unreachable.filter(v.withConnector));
  // …and never calls a room describe() cannot reach "reachable only through a bedroom".
  for (const id of v.bathViaBedroom) expect(v.unreachable, src).not.toContain(id);
  // suggestTopology proposes a way out only for a bathroom lint flags (it may have no
  // candidate to offer, so it names a subset) — an en-suite beside a wet room off
  // circulation is spared by both.
  for (const id of v.suggestedBaths) expect(v.bathViaBedroom, src).toContain(id);
  // circulation's `no_door_route` names exactly the rooms the access graph cannot reach —
  // even where the raster leaks into one through a partition thinner than a cell (backlog
  // C.1): circulation gates every walk on the door route.
  if (v.s.circulation) expect(v.noDoorRoute, src).toEqual(v.unreachable);
  // the intent channel's `reachable` is the same fact.
  expect(v.intent.assertions.find((a) => a.predicate.kind === "reachable")?.pass, src).toBe(v.unreachable.length === 0);
}

describe("one access policy: every surface agrees on reachability", () => {
  it("the T-junction: the probe lands on the stem's boundary, so the opening is ambiguous for EVERY surface", () => {
    const src = tJunction(4000);
    const s = describePlan(src);
    expect(s.ok).toBe(true);
    // The opening at the junction touches all three rooms and its probe (100 mm off the
    // cross wall) lands on the study/den boundary: undecidable.
    expect(s.access.edges.find((e) => e.doorId === "o_t")).toMatchObject({ ambiguous: true });
    expect(s.access.rooms.filter((r) => !r.reachable).map((r) => r.id)).toEqual(["study", "den"]);
    expect(s.circulation?.rooms.map((r) => r.roomId)).toEqual(["hall"]);
    const v = verdicts(src)!;
    // lint used to call the study reachable (the old "slice" pair was hall/study). Not now.
    expect(v.lintUnreachable).toEqual(["study", "den"]);
    expect(v.intent.violations.map((x) => x.code)).toEqual(["E_INTENT_UNREACHABLE"]);
    assertAgree(src);
  });

  it("an offset T: the probe resolves the pair the host wall separates — never the source-order pair", () => {
    // 100 mm east of the junction the opening still touches all three rooms (tolerance
    // 200 mm), but the probe lands squarely in the den and the hall.
    const src = tJunction(4100);
    const { ir } = resolvePlan(src);
    const rooms = new Map(
      ir!.elements.filter((e): e is RRoom => e.kind === "room").map((r) => [r.id, roomBox(r)] as const),
    );
    const o = ir!.elements.find((e): e is ROpening => e.kind === "opening")!;
    expect(roomsAtPoint(o.at, rooms, DEFAULT_TOL)).toEqual(["hall", "study", "den"]);
    expect(connectorConnection(o, rooms, DEFAULT_TOL)).toEqual({ between: ["hall", "den"], ambiguous: false });
    // The policy it replaced as the reference: drop joins nothing.
    expect(connectorConnection(o, rooms, DEFAULT_TOL, "drop")).toEqual({
      between: ["hall", "study"],
      ambiguous: true,
    });
    const s = describePlan(src);
    expect(s.openings.find((x) => x.id === "o_t")?.between).toEqual(["hall", "den"]);
    expect(s.access.rooms.filter((r) => !r.reachable).map((r) => r.id)).toEqual(["study"]);
    expect(verdicts(src)!.lintUnreachable).toEqual(["study"]);
    assertAgree(src);
    // The mirror offset resolves the other pair.
    const west = tJunction(3900);
    expect(
      describePlan(west)
        .access.rooms.filter((r) => !r.reachable)
        .map((r) => r.id),
    ).toEqual(["den"]);
    assertAgree(west);
  });

  it("W_BATH_VIA_BEDROOM and suggestTopology read the probed graph too", () => {
    // Bedroom west and bathroom east of the stem, with a door between them through it.
    // East of the junction the opening joins hall↔bathroom, so the bathroom is NOT behind
    // the bedroom — the old source-order pair (hall, bedroom) said it was.
    const east = tJunction(4100, true);
    const ve = verdicts(east)!;
    expect(ve.unreachable).toEqual([]);
    expect(ve.bathViaBedroom).toEqual([]);
    expect(suggestTopology(east).filter((x) => x.code === "W_BATH_VIA_BEDROOM")).toEqual([]);
    assertAgree(east);
    // West of it the opening joins hall↔bedroom, and the bathroom really is en-suite-trapped:
    // lint and suggest both say so (the control that shows both rules ran).
    const west = tJunction(3900, true);
    const vw = verdicts(west)!;
    expect(vw.bathViaBedroom).toEqual(["den"]);
    expect(
      suggestTopology(west)
        .filter((x) => x.code === "W_BATH_VIA_BEDROOM")
        .map((x) => x.roomId),
    ).toEqual(["den"]);
    assertAgree(west);
    // A WC off the hall on the same storey: the bathroom behind the bedroom is an en-suite
    // beside a wet room that avoids every bedroom, and neither surface names it.
    const withWc = west.replace(
      `room id=hall  at (0,3000) size 8000x3000 label "Hall"`,
      `wall id=wcw partition thickness 100 { (6000,3000) (6000,6000) }
  room id=hall  at (0,3000) size 6000x3000 label "Hall"
  room id=wc    at (6000,3000) size 2000x3000 label "WC"
  door id=d_wc  at (6000,4500) width 800 wall wcw`,
    );
    expect(withWc).not.toBe(west);
    const vc = verdicts(withWc)!;
    expect(vc.s.access.rooms.map((r) => r.id)).toContain("wc");
    expect(vc.unreachable).toEqual([]);
    expect(vc.bathViaBedroom).toEqual([]);
    expect(vc.suggestedBaths).toEqual([]);
    assertAgree(withWc);
  });

  it("offset T-junctions at every position along the cross wall", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3600, max: 4400 }), fc.boolean(), (at, bed) => assertAgree(tJunction(at, bed))),
      { numRuns: 60 },
    );
  });

  it("every shipped single-file example — incl. relational's open plan, which has no partition to stop the raster", () => {
    const files = readdirSync("examples").filter(
      (f) => f.endsWith(".arch") && f !== "imports.arch" && f !== "museum-wings.arch",
    );
    for (const f of files) assertAgree(readFileSync(`examples/${f}`, "utf8"));
    // relational's kitchen, bedroom and bath have no door: the grid (no interior wall at
    // all) walks straight into them, but circulation reports them as `no_door_route`.
    const rel = describePlan(readFileSync("examples/relational.arch", "utf8"));
    expect(rel.circulation?.unmeasured).toEqual([
      { roomId: "kitchen", reason: "no_door_route" },
      { roomId: "bed", reason: "no_door_route" },
      { roomId: "bath", reason: "no_door_route" },
    ]);
  });

  it("random plans that carry a connector touching three rooms", () => {
    let probed = 0;
    fc.assert(
      fc.property(archPlan, (src) => {
        const { ir } = resolvePlan(src);
        if (!ir) return;
        const rooms = new Map(
          ir.elements.filter((e): e is RRoom => e.kind === "room").map((r) => [r.id, roomBox(r)] as const),
        );
        const three = ir.elements.some(
          (e) => (e.kind === "door" || e.kind === "opening") && roomsAtPoint(e.at, rooms, DEFAULT_TOL).length >= 3,
        );
        fc.pre(three);
        probed++;
        assertAgree(src);
      }),
      { numRuns: 25 },
    );
    expect(probed).toBeGreaterThan(0); // the precondition admitted real cases
  }, 120_000);
});

/**
 * Multi-storey: reachability is a fixpoint over `(storey, room)`, not over storeys
 * (`verticalReach` with the room-aware callback, `src/vertical.ts`). A shaft carries you
 * on only from a stop whose room is walkable on its own storey, and `describe().vertical`,
 * lint's `W_NO_ENTRANCE` and the intent channel's `reachable` give that one answer.
 */
describe("one access policy across storeys: a shaft relays only from a reachable room", () => {
  const SHELL = `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }`;
  const multi = (...levels: string[]): string =>
    `plan "M" {\n  units mm\n  grid 50\n${levels
      .map((body, i) => `  level ${i + 1} "L${i + 1}" {\n    ${SHELL}\n${body}\n  }`)
      .join("\n")}\n}`;

  /** Ground: a hall with the front door, and a store holding the stair — sealed unless `storeDoor`. */
  const probeGround = (storeDoor: boolean): string => `
    wall id=store_w partition thickness 100 { (4000,0) (4000,4000) }
    room id=hall at (0,0) size 4000x4000 label "Hall" uses hall
    room id=store at (4000,0) size 2000x4000 label "Store" uses storage
    door id=front on shell at 2000 width 1000 swing into hall
    ${storeDoor ? "door id=d_store on store_w at 2000 width 900 swing into store" : ""}
    stair id=s at (4500,500) size 900x2600 dir up`;
  const probeUpper = `
    wall id=bed_w partition thickness 100 { (4000,0) (4000,4000) }
    room id=bed at (0,0) size 4000x4000 label "Bedroom" uses bedroom
    room id=landing at (4000,0) size 2000x4000 label "Landing" uses circulation
    door id=d_bed on bed_w at 2000 width 900 swing into bed
    stair id=s at (4500,500) size 900x2600 dir down`;

  const noEntrance = (src: string): (number | undefined)[] =>
    lint(src)
      .filter((d) => d.code === "W_NO_ENTRANCE")
      .map((d) => d.level);
  const reachableAssertion = (src: string) =>
    validateIntent(src, { reachable: true }).assertions.find((a) => a.predicate.kind === "reachable")!;

  it("the probe: a stair in a door-less store reaches nothing — storey 2 is cut off everywhere", () => {
    const src = multi(probeGround(false), probeUpper);
    const s = describePlan(src);
    expect(s.ok).toBe(true);
    expect(s.vertical?.connections.map((c) => c.stops.map((st) => st.room))).toEqual([["store", "landing"]]);
    // Was [1, 2]: the storey-level fixpoint joined the storeys wherever the stair stood.
    expect(s.vertical?.reachable_levels).toEqual([1]);
    expect(noEntrance(src)).toEqual([2]);
    const a = reachableAssertion(src);
    expect(a.pass).toBe(false);
    // Both causes are named: the sealed store on the ground floor, and the storey it strands.
    // The stair IS a shaft from a reachable storey — it is dead, not absent, so the wording
    // must not claim there is none.
    expect(a.detail).toBe(
      "reachable: unreachable: store; no way into storey(s): 2 (no exterior door and no live shaft — a shaft counts only from a room you can reach)",
    );
    // The ground floor has its front door, so the violation is unreachability, not a missing door.
    expect(validateIntent(src, { reachable: true }).violations.map((v) => v.code)).toEqual(["E_INTENT_UNREACHABLE"]);
  });

  it("the control: one store↔hall door and the same stair joins the storeys again", () => {
    const src = multi(probeGround(true), probeUpper);
    expect(describePlan(src).vertical?.reachable_levels).toEqual([1, 2]);
    expect(noEntrance(src)).toEqual([]);
    const a = reachableAssertion(src);
    expect(a.pass).toBe(true);
    expect(a.detail).toBe("reachable: all 2 room(s) reachable");
  });

  /** Three storeys: stair `a` hall→landing, then stair `b` from a study on storey 2 to storey 3. */
  const relay = (studyDoor: boolean): string =>
    multi(
      `
    room id=hall at (0,0) size 6000x4000 label "Hall" uses hall
    door id=front on shell at 2000 width 1000 swing into hall
    stair id=a at (500,500) size 900x2600 dir up`,
      `
    wall id=study_w partition thickness 100 { (2000,0) (2000,4000) }
    room id=landing at (0,0) size 2000x4000 label "Landing" uses circulation
    room id=study at (2000,0) size 4000x4000 label "Study" uses office
    ${studyDoor ? "door id=d_study on study_w at 2000 width 900 swing into study" : ""}
    stair id=a at (500,500) size 900x2600 dir down
    stair id=b at (4500,500) size 900x2600 dir up`,
      `
    room id=attic at (0,0) size 6000x4000 label "Attic" uses storage
    stair id=b at (4500,500) size 900x2600 dir down`,
    );

  it("a three-storey relay: storey 3 is reached through storey 2's study only while the study is", () => {
    const open = relay(true);
    expect(describePlan(open).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(describePlan(open).vertical?.reachable_levels).toEqual([1, 2, 3]);
    expect(noEntrance(open)).toEqual([]);
    expect(reachableAssertion(open).pass).toBe(true);

    const sealed = relay(false);
    // Storey 2 is still reached (stair `a` lands on the landing); the study is not, so
    // stair `b` relays nothing and storey 3 has no way in.
    expect(describePlan(sealed).vertical?.reachable_levels).toEqual([1, 2]);
    expect(noEntrance(sealed)).toEqual([3]);
    const a = reachableAssertion(sealed);
    expect(a.pass).toBe(false);
    expect(a.detail).toContain("no way into storey(s): 3");
  });

  /**
   * A GROUNDED storey relays too: its seeds are the exterior plus the rooms live shafts
   * land in. Here the ground floor's back room is sealed off from the hall, but stair `b`
   * comes back down into it from the landing, and lift `c` carries on from it to storey 3.
   */
  const groundedRelay = (withB: boolean): string =>
    multi(
      `
    wall id=back_w partition thickness 100 { (4000,0) (4000,4000) }
    room id=hall at (0,0) size 4000x4000 label "Hall" uses hall
    room id=back at (4000,0) size 2000x4000 label "Back" uses storage
    door id=front on shell at 2000 width 1000 swing into hall
    stair id=a at (500,500) size 900x2600 dir up
    stair id=b at (4500,500) size 900x2600 dir up
    elevator id=c at (4500,3200) size 900x600`,
      `
    room id=landing at (0,0) size 6000x4000 label "Landing" uses circulation
    stair id=a at (500,500) size 900x2600 dir down
    ${withB ? "stair id=b at (4500,500) size 900x2600 dir down" : ""}`,
      `
    room id=loft at (0,0) size 6000x4000 label "Loft" uses storage
    elevator id=c at (4500,3200) size 900x600`,
    );

  it("a grounded storey relays a shaft that lands in a room its own door cannot reach", () => {
    const src = groundedRelay(true);
    expect(describePlan(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(describePlan(src).vertical?.reachable_levels).toEqual([1, 2, 3]);
    expect(noEntrance(src)).toEqual([]);
    // The control: without `b` nothing arrives in the back room, so lift `c` is dead.
    const control = groundedRelay(false);
    expect(describePlan(control).vertical?.reachable_levels).toEqual([1, 2]);
    expect(noEntrance(control)).toEqual([3]);
  });

  it("a building with no entrance at all keeps the one base cause — no storey is named twice", () => {
    // zones-levels: neither storey has a way in and nothing is reachable. The lowest storey
    // is what "no modeled entrance" already reports, so the storey clause stays out and the
    // detail and violation code are the pre-storey-check ones, byte for byte.
    const src = readFileSync("test/fixtures/zones-levels.arch", "utf8");
    const s = describePlan(src);
    expect(s.levels?.map((l) => l.access.hasEntrance)).toEqual([false, false]);
    expect(s.vertical?.reachable_levels).toEqual([]);
    const a = reachableAssertion(src);
    expect(a.pass).toBe(false);
    expect(a.detail).toBe("reachable: no modeled entrance");
    expect(validateIntent(src, { reachable: true }).violations.map((v) => v.code)).toEqual(["E_INTENT_NO_DOOR"]);
  });

  it("a single-storey summary is judged exactly as before (no `levels`, no storey clause)", () => {
    const src = tJunction(4100);
    expect(describePlan(src).levels).toBeUndefined();
    expect(reachableAssertion(src).detail).toBe("reachable: unreachable: study");
  });
});
