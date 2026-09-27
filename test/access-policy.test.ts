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
const roomOf = (rooms: readonly RRoom[], span: { start: number; end: number }): string =>
  rooms.find((r) => r.span?.start === span.start && r.span.end === span.end)?.id ?? "?";

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
  return { s, unreachable, withConnector, lintUnreachable, bathViaBedroom, noDoorRoute, intent };
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
  // circulation's `no_door_route` names only rooms the access graph cannot reach. (Not
  // "exactly": the nav grid blocks a wall only where it covers a cell centre, so a
  // partition thinner than one cell lets the walk leak into a room no door reaches — a
  // raster fact, not an access-policy one.)
  for (const id of v.noDoorRoute) expect(v.unreachable, src).toContain(id);
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
  });

  it("offset T-junctions at every position along the cross wall", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3600, max: 4400 }), fc.boolean(), (at, bed) => assertAgree(tJunction(at, bed))),
      { numRuns: 60 },
    );
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
