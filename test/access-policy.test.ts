import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";

/**
 * TRIPWIRE for the access graph's ambiguity policy (`AmbiguityPolicy` in `src/analyze.ts`).
 *
 * A connector whose point lies on the edges of three rooms does not say which two it
 * joins. Two policies answer that today, and they disagree:
 *
 *  - `"drop"` (`describe().access`, Plan JSON, circulation): the edge is `ambiguous` and
 *    joins nothing;
 *  - `"slice"` (lint reachability, `suggestTopology`): the edge joins the first two
 *    touching rooms in source order.
 *
 * So on the T-junction below, lint calls the study reachable while `describe()` and the
 * circulation model call it unreachable. This test asserts that the disagreement STILL
 * EXISTS. It is meant to fail on the day the two policies are unified; whoever unifies
 * them inverts it into an agreement test, rather than deleting it.
 */
const T_JUNCTION = `plan "T" {
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall partition thickness 100 { (0,3000) (8000,3000) }
  wall partition thickness 100 { (4000,0) (4000,3000) }
  room id=hall  at (0,3000) size 8000x3000 label "Hall"
  room id=study at (0,0)    size 4000x3000 label "Study"
  room id=den   at (4000,0) size 4000x3000 label "Den"
  door    id=d_front at (2000,6000) width 1000 wall exterior
  opening id=o_t     at (4000,3000) width 900  wall partition
}`;

describe("access policy tripwire", () => {
  it("STILL DISAGREES: a connector touching 3 rooms is reachable per lint and unreachable per describe/circulation", () => {
    const s = describePlan(T_JUNCTION);
    expect(s.ok).toBe(true);
    const unreachable = lint(T_JUNCTION)
      .filter((d) => d.code === "W_ROOM_UNREACHABLE")
      .map((d) => d.message);

    // The opening at the junction touches all three rooms; describe marks it ambiguous.
    expect(s.access.edges.find((e) => e.doorId === "o_t")).toMatchObject({ ambiguous: true });

    // describe(): the study has no door route.
    expect(s.access.rooms.find((r) => r.id === "study")).toMatchObject({ reachable: false });
    // circulation: nothing to measure, for the same reason.
    expect(s.circulation?.rooms.map((r) => r.roomId)).toEqual(["hall"]);
    expect(s.circulation?.unmeasured).toContainEqual({ roomId: "study", reason: "no_door_route" });

    // lint: the "slice" pair is (hall, study), so the study IS reachable…
    expect(unreachable.some((m) => m.includes('"Study"'))).toBe(false);
    // …while the den, outside the slice pair, is unreachable per both: the control that
    // shows the rule ran on this plan.
    expect(unreachable.some((m) => m.includes('"Den"'))).toBe(true);
    expect(s.access.rooms.find((r) => r.id === "den")).toMatchObject({ reachable: false });
  });
});
