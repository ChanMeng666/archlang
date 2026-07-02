/**
 * Frozen fixture catalog — tacit architectural knowledge about furniture/fixtures
 * as pure, deterministic data. Today it records which fixtures conventionally sit
 * **against a wall** (plumbing fixtures and kitchen runs need a wall behind them for
 * supply/waste/venting), used by the `lint` clearance/placement rules. It is the
 * seam for future per-category default footprints and clearance envelopes.
 *
 * Keyed by the same `furniture <category>` names the renderer's fixture glyphs use
 * (see `elements/fixtures-glyphs.ts`); aliases share one entry. Pure data — no I/O.
 */

export interface FixtureSpec {
  /** Conventionally installed against a wall (plumbing/venting/supply). */
  requiresWall: boolean;
  /**
   * Minimum activity clearance (mm) directly in front of the fixture — the space a
   * person needs to use it. Deliberately conservative (tight enough that a normal
   * layout never trips it, generous enough to catch a piece parked right in front).
   * 0 / omitted means "no frontal clearance check" (e.g. a shower you stand inside).
   */
  clearanceMm?: number;
  /**
   * A conventional default footprint (mm) in **wall-relative** axes — `along` runs
   * parallel to the wall the fixture backs onto, `depth` projects into the room. Lets
   * `furniture <cat> against wall <id>` omit an explicit `size`; closed-form, never a
   * guess among alternatives (ADR 0005). Omitted for free-standing furniture.
   */
  footprint?: { along: number; depth: number };
  /**
   * Which room zone(s) this category satisfies for the `W_ROOM_NO_FIXTURE` lint rule
   * (a bathroom needs a wet fixture, a kitchen a kitchen fixture). The membership
   * encodes lint's long-standing behaviour exactly — e.g. `sink` counts for both
   * zones, while `lavatory` deliberately carries none (it never counted; flipping
   * that is a behaviour change, not a refactor).
   */
  zones?: readonly FixtureZone[];
}

/** A room zone a fixture can satisfy (see {@link FixtureSpec.zones}). */
export type FixtureZone = "wet" | "kitchen";

/** Catalog entries, keyed by category (and its aliases). */
const CATALOG: Readonly<Record<string, FixtureSpec>> = Object.freeze({
  // Wet-room plumbing fixtures — need a wall behind them.
  wc: { requiresWall: true, clearanceMm: 450, footprint: { along: 400, depth: 700 }, zones: ["wet"] },
  toilet: { requiresWall: true, clearanceMm: 450, footprint: { along: 400, depth: 700 }, zones: ["wet"] },
  basin: { requiresWall: true, clearanceMm: 450, footprint: { along: 600, depth: 450 }, zones: ["wet"] },
  // No zone: lint's wet-fixture set never included `lavatory` (see FixtureSpec.zones).
  lavatory: { requiresWall: true, clearanceMm: 450, footprint: { along: 600, depth: 450 } },
  bathtub: { requiresWall: true, clearanceMm: 550, footprint: { along: 1700, depth: 700 }, zones: ["wet"] },
  tub: { requiresWall: true, clearanceMm: 550, footprint: { along: 1700, depth: 700 }, zones: ["wet"] },
  bath: { requiresWall: true, clearanceMm: 550, footprint: { along: 1700, depth: 700 }, zones: ["wet"] },
  shower: { requiresWall: true, footprint: { along: 900, depth: 900 }, zones: ["wet"] },
  // Kitchen run — counters/appliances line a wall; leave standing/working room.
  kitchen_sink: { requiresWall: true, clearanceMm: 550, footprint: { along: 800, depth: 600 }, zones: ["kitchen"] },
  // A bare `sink` satisfies either room kind (a bathroom basin or the kitchen sink).
  sink: { requiresWall: true, clearanceMm: 550, footprint: { along: 800, depth: 600 }, zones: ["wet", "kitchen"] },
  counter: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  worktop: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  stove: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  hob: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  cooktop: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  fridge: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 650 }, zones: ["kitchen"] },
  refrigerator: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 650 }, zones: ["kitchen"] },
  // Zone-only entry: counts as a kitchen fixture but is free-standing (no wall,
  // clearance or footprint semantics — identical to having no catalog entry for
  // the other rules).
  oven: { requiresWall: false, zones: ["kitchen"] },
});

/** All catalogued categories (aliases included), in declaration order. */
export const CATALOG_CATEGORIES: readonly string[] = Object.freeze(Object.keys(CATALOG));

/** The categories that satisfy `zone` for W_ROOM_NO_FIXTURE — derived from the
 *  catalog so the lint rule and this data can never drift apart. */
export function zoneFixtureCategories(zone: FixtureZone): ReadonlySet<string> {
  return new Set(CATALOG_CATEGORIES.filter((c) => CATALOG[c].zones?.includes(zone)));
}

/** The catalog spec for a fixture category, or `null` for free-standing furniture. */
export function fixtureSpec(category: string): FixtureSpec | null {
  return CATALOG[category] ?? null;
}

/** Does this fixture category conventionally need a wall behind it? */
export function requiresWall(category: string): boolean {
  return CATALOG[category]?.requiresWall ?? false;
}

/** The frontal activity clearance (mm) for a fixture category, or 0 if none. */
export function frontClearanceMm(category: string): number {
  return CATALOG[category]?.clearanceMm ?? 0;
}

/** A fixture category's conventional wall-relative footprint (along × depth), or null. */
export function defaultFootprint(category: string): { along: number; depth: number } | null {
  return CATALOG[category]?.footprint ?? null;
}
