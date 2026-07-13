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

  it("a plan with an entrance never yields a W_NO_ENTRANCE suggestion", () => {
    // Regression companion to the goldens above: `faulty` has an exterior door, so
    // the whole-building no-entrance builder must stay silent for it.
    expect(lint(faulty).map((d) => d.code)).not.toContain("W_NO_ENTRANCE");
    expect(suggestTopology(faulty).every((s) => s.code !== "W_NO_ENTRANCE")).toBe(true);
  });
});

// A sealed building: living + bedroom joined by a partition door, each with a
// window, but NO exterior door — the plan trips lint `W_NO_ENTRANCE`.
const NO_ENTRANCE = `plan "NoEntrance" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (5000,0) (5000,5000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  door id=inner on part at 50% width 900
  window id=wliv on ext at 8% width 1200
  window id=wbed on ext at 25% width 1200
}`;

describe("suggestTopology — W_NO_ENTRANCE", () => {
  it("the fixture actually trips the lint (suggestion fires iff lint fires)", () => {
    expect(lint(NO_ENTRANCE).map((d) => d.code)).toContain("W_NO_ENTRANCE");
  });

  it("proposes an entrance door on a habitable room's exterior wall", () => {
    const s = suggestTopology(NO_ENTRANCE);
    const noEntry = s.find((x) => x.code === "W_NO_ENTRANCE");
    expect(noEntry).toBeDefined();
    const top = noEntry!.candidates[0]!;
    expect(top.insertText).toMatch(/^door on \w+ at [\d.]+% width 900$/);
    // The entrance is sited on the LIVING room (habitable), never the bedroom.
    expect(top.rationale).toContain("Living");
    expect(noEntry!.candidates.every((c) => c.rationale.includes("Living"))).toBe(true);
  });

  it("applying the top candidate clears W_NO_ENTRANCE", () => {
    const top = suggestTopology(NO_ENTRANCE).find((x) => x.code === "W_NO_ENTRANCE")!.candidates[0]!;
    const fixed = NO_ENTRANCE.replace(/}\s*$/, `  ${top.insertText}\n}`);
    expect(compile(fixed).diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(lint(fixed).map((d) => d.code)).not.toContain("W_NO_ENTRANCE");
  });
});

// Entrance → living; the bath is reachable ONLY through the bedroom (living↔bedroom
// door + bedroom↔bath door), and living↔bath share the `pmid` wall with no opening.
// Trips lint `W_BATH_VIA_BEDROOM`.
const BATH_VIA_BEDROOM = `plan "BathViaBed" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=pmid partition thickness 100 { (4000,0) (4000,5000) }
  wall id=phorz partition thickness 100 { (4000,2500) (8000,2500) }
  room id=living at (0,0) size 4000x5000 label "Living"
  room id=bed at (4000,0) size 4000x2500 label "Bedroom"
  room id=bath at (4000,2500) size 4000x2500 label "Bath"
  door id=entry at (2000,0) width 900 wall exterior
  door id=lb on pmid at 25% width 900
  door id=bb on phorz at 50% width 900
  window id=wb on ext at 25% width 1200
}`;

describe("suggestTopology — W_BATH_VIA_BEDROOM", () => {
  it("the fixture actually trips the lint (suggestion fires iff lint fires)", () => {
    expect(lint(BATH_VIA_BEDROOM).map((d) => d.code)).toContain("W_BATH_VIA_BEDROOM");
  });

  it("proposes a door on the living↔bath shared wall, preferred over exterior fallbacks", () => {
    const s = suggestTopology(BATH_VIA_BEDROOM);
    const via = s.find((x) => x.code === "W_BATH_VIA_BEDROOM");
    expect(via).toBeDefined();
    expect(via!.roomId).toBe("bath");
    // The shared living↔bath wall is `pmid`; that connection is the top candidate
    // even though an exterior wall offers a longer free run.
    expect(via!.candidates[0]!.insertText).toMatch(/^door on pmid at [\d.]+% width 900$/);
  });

  it("applying the top candidate clears W_BATH_VIA_BEDROOM", () => {
    const top = suggestTopology(BATH_VIA_BEDROOM).find((x) => x.code === "W_BATH_VIA_BEDROOM")!.candidates[0]!;
    const fixed = BATH_VIA_BEDROOM.replace(/}\s*$/, `  ${top.insertText}\n}`);
    expect(compile(fixed).diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(lint(fixed).map((d) => d.code)).not.toContain("W_BATH_VIA_BEDROOM");
  });
});
