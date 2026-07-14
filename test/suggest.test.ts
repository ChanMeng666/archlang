import { describe, expect, it } from "vitest";
import { suggestTopology } from "../src/suggest.js";
import { lint, compile } from "../src/index.js";
import { rectOf, resolvePlan } from "../src/analyze.js";
import type { RFurniture } from "../src/ir.js";

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

  it("ranks the interior reconnection first for a PRIVATE unreachable room", () => {
    const s = suggestTopology(faulty);
    const unreach = s.find((x) => x.code === "W_ROOM_UNREACHABLE")!;
    expect(unreach.roomId).toBe("bed");
    // `bed` is a bedroom (private): the interior door onto the shared partition
    // (reconnecting to the reachable living room) outranks any exterior door, even
    // though the east exterior wall offers a longer opening-free run.
    expect(unreach.candidates[0]!.insertText).toBe("door on part at 50% width 900");
    // The exterior candidate (longest free run) is still offered, just lower.
    expect(unreach.candidates.map((c) => c.insertText)).toContain("door on ext at 40.385% width 900");
    // Explicit interior-before-exterior ordering for the private room.
    const idxInterior = unreach.candidates.findIndex((c) => c.insertText.includes(" part "));
    const idxExterior = unreach.candidates.findIndex((c) => c.insertText.includes(" ext "));
    expect(idxInterior).toBeGreaterThanOrEqual(0);
    expect(idxExterior).toBeGreaterThan(idxInterior);
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
    // An entrance is exterior by definition — the architectural reordering of the
    // private-room builder never touches W_NO_ENTRANCE, so it stays exterior-first.
    expect(top.insertText.startsWith("door on ext ")).toBe(true);
    expect(noEntry!.candidates.every((c) => c.insertText.startsWith("door on ext "))).toBe(true);
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

// The `faulty` unreachable-bedroom shape, but a wardrobe stands against the `part`
// partition (the living↔bedroom wall), INSIDE the bedroom's door-approach strip and
// over the naive mid-wall site. A furniture-aware door builder must slide the partition
// door candidate to the long clear span past the wardrobe rather than open onto it.
const FURNITURE_BLOCKED = `plan "FurnitureBlocked" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (5000,0) (5000,5000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  furniture wardrobe at (5100,500) size 400x1000 label "Wardrobe"
  door id=entry at (2500,0) width 900 wall exterior
}`;

// The exact twin of FURNITURE_BLOCKED with the wardrobe removed — the free-run math
// must be untouched here, so the partition candidate stays at the mid-wall (50%).
const FURNITURE_CLEAR = `plan "FurnitureClear" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (5000,0) (5000,5000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  door id=entry at (2500,0) width 900 wall exterior
}`;

describe("suggestTopology — furniture-aware door candidates", () => {
  // The partition wall `part` runs (5000,0)→(5000,5000); a candidate's along-wall pct
  // maps 1:1 to the wardrobe's y-span, so we can convert its footprint to a pct span.
  const partCandidate = (source: string): { insertText: string; pct: number } => {
    const unreach = suggestTopology(source).find((x) => x.code === "W_ROOM_UNREACHABLE")!;
    const c = unreach.candidates.find((x) => x.insertText.includes(" part "))!;
    return { insertText: c.insertText, pct: Number.parseFloat(/at ([\d.]+)%/.exec(c.insertText)![1]!) };
  };

  it("keeps the partition candidate at the mid-wall when nothing blocks the approach", () => {
    expect(partCandidate(FURNITURE_CLEAR).insertText).toBe("door on part at 50% width 900");
  });

  it("slides the partition door candidate off the furniture-blocked approach span", () => {
    // Blocked along-wall span, computed from the resolved wardrobe footprint.
    const { ir } = resolvePlan(FURNITURE_BLOCKED);
    const wardrobe = ir!.elements.find((e): e is RFurniture => e.kind === "furniture")!;
    const rect = rectOf(wardrobe);
    const loPct = (rect.y / 5000) * 100; // 10%
    const hiPct = ((rect.y + rect.h) / 5000) * 100; // 30%
    const { pct } = partCandidate(FURNITURE_BLOCKED);
    // The wardrobe blocks [10%, 30%]; the aware candidate lands on the long clear span
    // past it (the naive mid-wall would have sat at 50%, but the block reshapes the run).
    expect(pct > loPct && pct < hiPct).toBe(false);
    expect(partCandidate(FURNITURE_BLOCKED).insertText).toBe("door on part at 65% width 900");
  });

  it("the slid candidate still clears W_ROOM_UNREACHABLE on round-trip", () => {
    const { insertText } = partCandidate(FURNITURE_BLOCKED);
    const fixed = FURNITURE_BLOCKED.replace("  door id=entry", `  ${insertText}\n  door id=entry`);
    expect(compile(fixed).diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(lint(fixed).map((d) => d.code)).not.toContain("W_ROOM_UNREACHABLE");
  });
});

// `faulty`, but with NO wall ids declared — the walls take positional auto-ids
// (`exterior_1`, `partition_1`), while each CATEGORY is unique across the plan. A
// candidate must reference the bare unique category (`on partition` / `on exterior`),
// never the re-bindable positional id.
const UNIQUE_CAT = `plan "UniqueCat" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall partition thickness 100 { (5000,0) (5000,5000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  door id=entry at (2500,0) width 900 wall exterior
}`;

// Two undeclared PARTITION walls, so the `partition` category is no longer unique:
// the bedroom's interior host can't be named by id (positional, re-bindable) or by
// category (ambiguous), so the candidate must fall back to absolute coordinates. The
// second partition is a free stub inside the living room — it makes `partition`
// non-unique without creating a second unreachable room, so the round-trip fully clears.
const MULTI_PART = `plan "MultiPart" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall partition thickness 100 { (5000,0) (5000,5000) }
  wall partition thickness 100 { (2000,2000) (2000,3000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  door id=entry at (2500,0) width 900 wall exterior
}`;

// A NON-private unreachable room (`store`): the architectural interior-first
// reordering must NOT apply, so candidates keep the pure geometric (longest-run)
// order — here the exterior top wall (3000mm run) outranks the shorter shared
// partition (2000mm run) it could also reconnect through.
const NON_PRIVATE = `plan "NonPrivate" {
  units mm
  grid 50
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (5000,0) (5000,2000) }
  room id=hall at (0,0) size 5000x5000 label "Hall"
  room id=store at (5000,0) size 3000x2000 label "Store"
  door id=entry at (2500,0) width 900 wall exterior
}`;

describe("suggestTopology — stable wall references", () => {
  const noPositionalId = (s: ReturnType<typeof suggestTopology>): void => {
    for (const sug of s) {
      for (const c of sug.candidates) {
        // A positional auto-id looks like `on <category>_<n>` — never emit one.
        expect(c.insertText).not.toMatch(/on \w+_\d+/);
      }
    }
  };

  it("references a bare UNIQUE category when the host wall id was auto-assigned", () => {
    const s = suggestTopology(UNIQUE_CAT);
    noPositionalId(s);
    const unreach = s.find((x) => x.code === "W_ROOM_UNREACHABLE")!;
    // Private bedroom → interior partition first, by bare unique category.
    expect(unreach.candidates[0]!.insertText).toBe("door on partition at 50% width 900");
    expect(unreach.candidates.map((c) => c.insertText)).toContain("door on exterior at 40.385% width 900");
    // The windowless-bedroom builder is stable-ref too (unique `exterior`).
    const nowin = s.find((x) => x.code === "W_BEDROOM_NO_WINDOW")!;
    expect(nowin.candidates[0]!.insertText).toMatch(/^window on exterior at [\d.]+% width 1200$/);
  });

  it("falls back to ABSOLUTE coordinates when neither id nor category is stable", () => {
    const s = suggestTopology(MULTI_PART);
    noPositionalId(s);
    const unreach = s.find((x) => x.code === "W_ROOM_UNREACHABLE" && x.roomId === "bed")!;
    // `partition` is ambiguous (two of them) and the id is positional → absolute point.
    expect(unreach.candidates[0]!.insertText).toBe("door at (5000, 2500) width 900");
  });

  it("the absolute-fallback candidate hosts onto the intended wall on round-trip", () => {
    const top = suggestTopology(MULTI_PART).find((x) => x.code === "W_ROOM_UNREACHABLE" && x.roomId === "bed")!
      .candidates[0]!;
    const fixed = MULTI_PART.replace("  door id=entry", `  ${top.insertText}\n  door id=entry`);
    const diags = compile(fixed).diagnostics;
    expect(diags.filter((d) => d.severity === "error")).toHaveLength(0);
    const codes = lint(fixed).map((d) => d.code);
    // Hosted by nearest-wall detection — no off-wall warning, and reachability restored.
    expect(codes).not.toContain("W_DOOR_OFF_WALL");
    expect(codes).not.toContain("W_ROOM_UNREACHABLE");
  });

  it("keeps the pure geometric order for a NON-private unreachable room", () => {
    const s = suggestTopology(NON_PRIVATE);
    const unreach = s.find((x) => x.code === "W_ROOM_UNREACHABLE" && x.roomId === "store")!;
    // Geometric (longest-run) order: the exterior top wall outranks the shorter
    // interior partition — the private-room interior-first rule does NOT apply here.
    expect(unreach.candidates[0]!.insertText.startsWith("door on ext ")).toBe(true);
    expect(unreach.candidates.map((c) => c.insertText)).toContain("door on part at 50% width 900");
    const idxExterior = unreach.candidates.findIndex((c) => c.insertText.includes(" ext "));
    const idxInterior = unreach.candidates.findIndex((c) => c.insertText.includes(" part "));
    expect(idxExterior).toBeLessThan(idxInterior);
  });
});
