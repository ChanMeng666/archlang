import { describe, expect, it } from "vitest";
import { suggestTopology } from "../src/suggest.js";
import { lint, compile } from "../src/index.js";

/**
 * Topology suggestions (T2f) — `suggestTopology` proposes ready-to-paste `.arch`
 * statements (attachment form) that would resolve a `W_ROOM_UNREACHABLE` or
 * `W_BEDROOM_NO_WINDOW` fault, as DATA (never applied; ADR 0005). Deterministic:
 * the goldens pin the exact candidates, and applying one clears the lint.
 */

// A bedroom walled off behind a partition, entered only via the living room, with
// no window: both W_ROOM_UNREACHABLE (bed) and W_BEDROOM_NO_WINDOW (bed).
const faulty = `plan "Topo" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (5000,0) (5000,5000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  door id=entry at (2500,0) width 900 wall exterior
}`;

describe("suggestTopology", () => {
  it("is deterministic and empty for a plan with no topology faults", () => {
    const ok = `plan "OK" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      room id=r at (0,0) size 4000x3000 label "R"
      door at (2000,0) width 900 wall exterior
    }`;
    expect(suggestTopology(ok)).toEqual([]);
  });

  it("returns [] when the plan has errors", () => {
    expect(suggestTopology('plan "X" { units mm room at (0,0) size 0x100 }')).toEqual([]);
  });

  it("proposes doors that reconnect an unreachable room, longest shared wall first", () => {
    const s = suggestTopology(faulty);
    const unreach = s.find((x) => x.code === "W_ROOM_UNREACHABLE")!;
    expect(unreach.roomId).toBe("bed");
    // Best candidate is the longest opening-free wall run (the east exterior wall).
    expect(unreach.candidates[0]!.insertText).toBe("door on ext at 40.385% width 900");
    // A door on the shared partition reconnects the bedroom to the reachable living room.
    expect(unreach.candidates.map((c) => c.insertText)).toContain("door on part at 50% width 900");
  });

  it("proposes a window on an exterior wall for a windowless bedroom", () => {
    const s = suggestTopology(faulty);
    const nowin = s.find((x) => x.code === "W_BEDROOM_NO_WINDOW")!;
    expect(nowin.roomId).toBe("bed");
    expect(nowin.candidates[0]!.insertText).toMatch(/^window on ext at [\d.]+% width 1200$/);
  });

  it("applying a proposed candidate clears the corresponding lint", () => {
    const s = suggestTopology(faulty);
    const door = s.find((x) => x.code === "W_ROOM_UNREACHABLE")!.candidates.find((c) => c.insertText.includes("part"))!;
    const win = s.find((x) => x.code === "W_BEDROOM_NO_WINDOW")!.candidates[0]!;
    const fixed = faulty.replace("  door id=entry", `  ${door.insertText}\n  ${win.insertText}\n  door id=entry`);
    expect(compile(fixed).diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    const codes = lint(fixed).map((d) => d.code);
    expect(codes).not.toContain("W_ROOM_UNREACHABLE");
    expect(codes).not.toContain("W_ROOM_DISCONNECTED");
    expect(codes).not.toContain("W_BEDROOM_NO_WINDOW");
  });
});
