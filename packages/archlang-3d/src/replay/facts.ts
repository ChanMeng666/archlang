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
  /** The replay's view: the storeys combined (default), or storey `n` (1-based, lowest first). */
  view?: ReplayView;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The facts for `source`, or `undefined` when the core gives none (the plan does not resolve).
 * The combined view sums every storey (the core's top-level totals are the lowest storey's alone);
 * a storey view reads that storey's own totals. Warnings are `lint()`'s, for the whole plan.
 */
export function replayFacts(source: string, opts: FactsOptions = {}): ReplayFacts | undefined {
  const view = opts.view ?? "all";
  const d = describe(source, opts.world ? { world: opts.world } : {});
  if (!d.ok) return undefined;
  const levels = d.levels?.map((l) => l.totals) ?? [d.totals];
  const pick = view === "all" ? levels : [levels[view - 1] ?? levels[0]].filter((x) => x !== undefined);
  if (pick.length === 0) return undefined;
  const sum = (f: (t: (typeof pick)[number]) => number): number => pick.reduce((a, t) => a + f(t), 0);
  const nets = pick.map((t) => t.net_floor_area_m2);
  const warnings = lint(source, opts.world ? { world: opts.world } : {}).filter((x) => x.severity === "warning").length;
  return {
    ...(view === "all" && levels.length > 1 ? { storeys: levels.length } : {}),
    rooms: sum((t) => t.rooms),
    doors: sum((t) => t.doors),
    windows: sum((t) => t.windows),
    areaCentre: round2(sum((t) => t.floor_area_m2)),
    ...(nets.every((n) => n !== undefined) ? { areaNet: round2(nets.reduce((a, n) => a + (n as number), 0)) } : {}),
    warnings,
  };
}
