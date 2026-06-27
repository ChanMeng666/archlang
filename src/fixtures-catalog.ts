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
}

/** Catalog entries, keyed by category (and its aliases). */
const CATALOG: Readonly<Record<string, FixtureSpec>> = Object.freeze({
  // Wet-room plumbing fixtures — need a wall behind them.
  wc: { requiresWall: true },
  toilet: { requiresWall: true },
  basin: { requiresWall: true },
  lavatory: { requiresWall: true },
  bathtub: { requiresWall: true },
  tub: { requiresWall: true },
  bath: { requiresWall: true },
  shower: { requiresWall: true },
  // Kitchen run — counters/appliances line a wall.
  kitchen_sink: { requiresWall: true },
  sink: { requiresWall: true },
  counter: { requiresWall: true },
  worktop: { requiresWall: true },
  stove: { requiresWall: true },
  hob: { requiresWall: true },
  cooktop: { requiresWall: true },
  fridge: { requiresWall: true },
  refrigerator: { requiresWall: true },
});

/** The catalog spec for a fixture category, or `null` for free-standing furniture. */
export function fixtureSpec(category: string): FixtureSpec | null {
  return CATALOG[category] ?? null;
}

/** Does this fixture category conventionally need a wall behind it? */
export function requiresWall(category: string): boolean {
  return CATALOG[category]?.requiresWall ?? false;
}
