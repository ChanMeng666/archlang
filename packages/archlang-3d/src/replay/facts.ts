/**
 * The metrics strip's numbers (card G4), read from the core's public `describe()` and `lint()` for
 * the same source the replay was built from: nothing is measured here and nothing is guessed. The
 * strip itself (`strip.ts`) is browser-safe and core-free; this module is the one that asks the core.
 */
import { describe, lint, type World } from "@chanmeng666/archlang";
import type { ReplayFacts } from "./strip.js";
import type { ReplayView } from "./timeline.js";

export interface FactsOptions {
  world?: World;
  /**
   * The level numbers the replay shows, lowest first: `storeysOf(mesh)` of the mesh before `viewMesh`.
   * A level with nothing to raise (a `dim` only) is not among them, so a view's index is NOT an index
   * into the core's levels; the numbers are what both are matched on.
   */
  storeys: readonly number[];
  /** The replay's view: the storeys combined (default), or storey `n` (1-based, of `storeys`). */
  view?: ReplayView;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The facts for the replay of `source`, or `undefined` when the core gives none (the plan does not
 * resolve, or a shown level has no summary). The combined view sums the shown storeys (the core's
 * top-level totals are the lowest storey's alone); a storey view reads that level's own totals.
 * Warnings are `lint()`'s, restricted to the shown levels.
 */
export function replayFacts(source: string, opts: FactsOptions): ReplayFacts | undefined {
  const view = opts.view ?? "all";
  const shown = view === "all" ? [...opts.storeys] : opts.storeys.slice(view - 1, view);
  if (shown.length === 0) return undefined;
  const d = describe(source, opts.world ? { world: opts.world } : {});
  if (!d.ok) return undefined;
  // A plan without `level` blocks has one storey, numbered by the mesh; its totals are the top level's.
  const byLevel = d.levels
    ? d.levels.map((l) => [l.level, l.totals] as const)
    : shown.map((n) => [n, d.totals] as const);
  const pick = shown.map((n) => byLevel.find(([l]) => l === n)?.[1]);
  if (pick.some((t) => t === undefined)) return undefined;
  const totals = pick as NonNullable<(typeof pick)[number]>[];
  const sum = (f: (t: (typeof totals)[number]) => number): number => totals.reduce((a, t) => a + f(t), 0);
  const nets = totals.map((t) => t.net_floor_area_m2);
  const warnings = lint(source, opts.world ? { world: opts.world } : {}).filter(
    (x) => x.severity === "warning" && (x.level === undefined || shown.includes(x.level)),
  ).length;
  return {
    ...(view === "all" && shown.length > 1 ? { storeys: shown.length } : {}),
    rooms: sum((t) => t.rooms),
    doors: sum((t) => t.doors),
    windows: sum((t) => t.windows),
    areaCentre: round2(sum((t) => t.floor_area_m2)),
    ...(nets.every((n) => n !== undefined) ? { areaNet: round2(nets.reduce((a, n) => a + (n as number), 0)) } : {}),
    warnings,
  };
}
