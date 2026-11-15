/**
 * Duration-balanced `vitest --shard=N/M`.
 *
 * Why: vitest's default sharding assigns files by a hash of their path, blind to how long they
 * take. With the three slowest files (`finish`, `net-area`, `finish-furnish`) hashed into one
 * shard, that shard held 19 % of the suite's time against 14-17 % for the others and set CI's
 * wall clock (9.3 min vs 5.5 min). Here the files are assigned longest-processing-time first to
 * the currently lightest shard, using `test/.durations.json` (seconds per file).
 *
 * Every file also costs FILE_OVERHEAD_S on top of its recorded seconds: the table records a file's
 * test time, not the time to import and collect it, which every file pays. Without it the ~126
 * files recorded at 0 s moved no load and all landed in one shard, the pole of every main-only leg
 * (TP6: that shard ran 284 files to the others' 160 and took about twice as long).
 *
 * Stability: the files the table holds go first, through the LPT pass over those files only; the
 * files it lacks follow in path order, each at the table's median cost onto the then-lightest shard.
 * So adding, removing or renaming a file the table lacks never moves a file the table holds; it may
 * move other files the table lacks (those after it in path order). A table refresh, or deleting a
 * recorded file, may reshuffle the recorded files, as any rebalance does.
 *
 * A stale or missing entry costs balance, never correctness: every file still lands in exactly
 * one shard, deterministically (files are sorted by path first, ties go to the lowest shard).
 * `sort()` stays vitest's default.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { BaseSequencer } from "vitest/node";

export type Durations = Record<string, number>;

/** Seconds every file costs beyond its recorded time (import and collection). */
export const FILE_OVERHEAD_S = 2;

/** The recorded seconds of `p`, or undefined when the table has no usable entry for it. */
function recorded(durations: Durations, p: string): number | undefined {
  const s = Object.hasOwn(durations, p) ? durations[p] : undefined;
  return typeof s === "number" && Number.isFinite(s) && s >= 0 ? s : undefined;
}

/** The balancing cost of a file the table holds. */
export function fileCost(seconds: number): number {
  return seconds + FILE_OVERHEAD_S;
}

/** The median of the table's usable entries (0 for an empty table): what a file it lacks counts as. */
export function medianOf(durations: Durations): number {
  const v = Object.values(durations)
    .filter((s) => typeof s === "number" && Number.isFinite(s) && s >= 0)
    .sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** The balancing cost of `p`: its recorded seconds, or the table's median, plus FILE_OVERHEAD_S. */
function costOf(durations: Durations, p: string, median: number): number {
  return fileCost(recorded(durations, p) ?? median);
}

/** The shards (index 0..count-1) as lists of paths relative to the repo root. */
export function assignShards(paths: string[], durations: Durations, count: number): string[][] {
  const shards: string[][] = Array.from({ length: count }, () => []);
  const load: number[] = new Array(count).fill(0);
  const median = medianOf(durations);
  const put = (p: string) => {
    let k = 0;
    for (let i = 1; i < count; i++) if (load[i]! < load[k]!) k = i;
    shards[k]!.push(p);
    load[k]! += costOf(durations, p, median);
  };
  const byPath = [...new Set(paths)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const known = byPath.filter((p) => recorded(durations, p) !== undefined);
  // Stable sort: equal costs keep their path order.
  for (const p of known.sort((a, b) => recorded(durations, b)! - recorded(durations, a)!)) put(p);
  // Second pass: the files the table lacks, in path order, at its median.
  for (const p of byPath) if (recorded(durations, p) === undefined) put(p);
  return shards;
}

/** The estimated cost of each shard, every file counted as `assignShards` counts it. */
export function shardCosts(shards: string[][], durations: Durations): number[] {
  const median = medianOf(durations);
  return shards.map((s) => s.reduce((sum, p) => sum + costOf(durations, p, median), 0));
}
export function readDurations(file: string | URL): Durations {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Durations;
  } catch {
    return {};
  }
}

export default class DurationSequencer extends BaseSequencer {
  override async shard(files: Awaited<ReturnType<BaseSequencer["shard"]>>) {
    const { root, shard } = this.ctx.config;
    if (!shard) return files;
    const rel = (f: (typeof files)[number]) => relative(root, f.moduleId).replace(/\\/g, "/");
    const durations = readDurations(new URL("./.durations.json", import.meta.url));
    const mine = new Set(assignShards(files.map(rel), durations, shard.count)[shard.index - 1]);
    return files.filter((f) => mine.has(rel(f)));
  }
}
