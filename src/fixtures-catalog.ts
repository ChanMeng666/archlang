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
}

/** Catalog entries, keyed by category (and its aliases). */
const CATALOG: Readonly<Record<string, FixtureSpec>> = Object.freeze({
  // Wet-room plumbing fixtures — need a wall behind them.
  wc: { requiresWall: true, clearanceMm: 450 },
  toilet: { requiresWall: true, clearanceMm: 450 },
  basin: { requiresWall: true, clearanceMm: 450 },
  lavatory: { requiresWall: true, clearanceMm: 450 },
  bathtub: { requiresWall: true, clearanceMm: 550 },
  tub: { requiresWall: true, clearanceMm: 550 },
  bath: { requiresWall: true, clearanceMm: 550 },
  shower: { requiresWall: true },
  // Kitchen run — counters/appliances line a wall; leave standing/working room.
  kitchen_sink: { requiresWall: true, clearanceMm: 550 },
  sink: { requiresWall: true, clearanceMm: 550 },
  counter: { requiresWall: true, clearanceMm: 550 },
  worktop: { requiresWall: true, clearanceMm: 550 },
  stove: { requiresWall: true, clearanceMm: 550 },
  hob: { requiresWall: true, clearanceMm: 550 },
  cooktop: { requiresWall: true, clearanceMm: 550 },
  fridge: { requiresWall: true, clearanceMm: 550 },
  refrigerator: { requiresWall: true, clearanceMm: 550 },
});

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
