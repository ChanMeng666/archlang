/**
 * `describeLevel(summary, n)` — the core narrowing that reads ONE storey of a
 * multi-storey summary.
 *
 * It used to be a private CLI helper (`narrowToLevel` in `src/cli/commands-analyze.ts`);
 * it moved into `src/describe.ts` so the browser playground's storey switcher reads a
 * storey the same way `arch describe --level` does. A second copy would be a second
 * place to forget a per-storey optional key, and that failure is SILENT: the narrowed
 * read reports another floor's facts under its own name and says nothing.
 *
 * What is pinned here:
 *  - the per-storey-optional-key DELETION branch (driven off `PER_STOREY_OPTIONAL_KEYS`,
 *    so a third key added there is covered for free);
 *  - the display-filter law — narrowing never moves `ok` or `diagnostics`;
 *  - whole-BUILDING facts (`vertical`) survive the narrowing, per-storey ones do not;
 *  - a level the plan does not declare returns the summary UNCHANGED (identity), which
 *    is what lets a caller narrow before it knows the storey list;
 *  - the input summary is not mutated.
 */

import { describe as suite, expect, it } from "vitest";
import { describe as describePlan, describeLevel, PER_STOREY_OPTIONAL_KEYS } from "../src/index.js";
import type { SceneSummary } from "../src/index.js";

/**
 * Level 1 declares BOTH per-storey optional keys (a `stair` → `verticals`, a `void` →
 * `voids`); level 2 declares neither. That asymmetry is the whole point: level 2's
 * narrowed read must not inherit level 1's.
 */
const ASYMMETRIC = `plan "P" {
  units mm
  level 1 "Ground floor" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=r1 at (0,0) size 8000x6000 label "Hall" uses hall
    door id=front on shell at 4000 width 900
    stair id=s at (500,500) size 900x2600 dir up
    void id=well at (5000,1000) size 1200x1200
  }
  level 2 "Loft" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=r2 at (0,0) size 8000x6000 label "Loft" uses storage
    door id=hatch on shell at 4000 width 900
  }
}`;

/** The same shaft id on both storeys — the only way a `vertical` report exists. */
const SHARED_SHAFT = `plan "P" {
  units mm
  level 1 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=r1 at (0,0) size 8000x6000 label "Hall" uses hall
    door id=front on shell at 4000 width 900
    stair id=s at (500,500) size 900x2600 dir up
  }
  level 2 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=r2 at (0,0) size 8000x6000 label "Loft" uses storage
    stair id=s at (500,500) size 900x2600 dir down
  }
}`;

suite("describeLevel — narrowing a summary to one storey", () => {
  const full = describePlan(ASYMMETRIC);

  it("the fixture is the shape the rest of this suite assumes", () => {
    expect(full.ok).toBe(true);
    expect((full.levels ?? []).map((l) => l.level)).toEqual([1, 2]);
    // The top-level facts are the LOWEST storey, so level 1's optional keys are the ones
    // sitting there before any narrowing — the values level 2 could wrongly inherit.
    for (const k of PER_STOREY_OPTIONAL_KEYS) {
      expect(
        full[k],
        `the fixture's level 1 must declare a ${k} for the deletion branch to be reachable`,
      ).toBeDefined();
    }
  });

  it("a per-storey optional key absent from the selected storey is DELETED, not inherited", () => {
    const one = describeLevel(full, 1);
    const two = describeLevel(full, 2);
    for (const k of PER_STOREY_OPTIONAL_KEYS) {
      expect(one[k], `level 1 declares a ${k} and the narrowed read lost it`).toBeDefined();
      expect(k in two, `level 2 declares no ${k}, so the narrowed read must not carry the key at all`).toBe(false);
    }
  });

  it("narrows `levels` to the selected storey and lifts its facts to the top", () => {
    const two = describeLevel(full, 2);
    expect((two.levels ?? []).map((l) => l.level)).toEqual([2]);
    expect(two.rooms.map((r) => r.id)).toEqual(["r2"]);
    expect(two.doors.map((d) => d.id)).toEqual(["hatch"]);
    // `level`/`name` are the LevelSummary's own keys and must not leak into the
    // whole-plan shape — a SceneSummary has never had them.
    expect("level" in two).toBe(false);
    expect("name" in two).toBe(false);
  });

  it("is a DISPLAY filter: `ok` and `diagnostics` stay whole-plan", () => {
    for (const n of [1, 2]) {
      const narrowed = describeLevel(full, n);
      expect(narrowed.ok).toBe(full.ok);
      expect(narrowed.diagnostics).toEqual(full.diagnostics);
      expect(narrowed.plan).toBe(full.plan);
    }
  });

  it("keeps whole-BUILDING facts that no single storey owns", () => {
    // `vertical` is the shaft graph across storeys — it exists only when the SAME run id
    // appears on two of them, so this needs its own fixture. It lives at the top level
    // alone and is legitimately unchanged by narrowing (unlike `verticals`, which is
    // per-storey and must be replaced or deleted).
    const shafted = describePlan(SHARED_SHAFT);
    expect(shafted.vertical).toBeDefined();
    expect(describeLevel(shafted, 2).vertical).toEqual(shafted.vertical);
  });

  it("returns the summary UNCHANGED for a level the plan does not declare", () => {
    expect(describeLevel(full, 7)).toBe(full);
    // …including a single-storey plan, which has no `levels` at all.
    const flat = describePlan(`plan "F" {\n  units mm\n  room id=r at (0,0) size 3000x3000 label "Room"\n}`);
    expect(flat.levels).toBeUndefined();
    expect(describeLevel(flat, 1)).toBe(flat);
  });

  it("does not mutate the summary it was given", () => {
    const before: SceneSummary = describePlan(ASYMMETRIC);
    const snapshot = JSON.stringify(before);
    describeLevel(before, 2);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
