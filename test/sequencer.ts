/**
 * Duration-balanced `vitest --shard=N/M`.
 *
 * Why: vitest's default sharding assigns files by a hash of their path, blind to how long they
 * take. With the three slowest files (`finish`, `net-area`, `finish-furnish`) hashed into one
 * shard, that shard held 19 % of the suite's time against 14-17 % for the others and set CI's
 * wall clock (9.3 min vs 5.5 min). Here the files are assigned longest-processing-time first to
 * the currently lightest shard, using `test/.durations.json` (seconds per file).
 *
 * A stale or missing entry costs balance, never correctness: every file still lands in exactly
 * one shard, deterministically (files are sorted by path first, ties go to the lowest shard),
 * and a file absent from the table counts as the table's median. `sort()` stays vitest's default.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { BaseSequencer } from "vitest/node";

export type Durations = Record<string, number>;

export function medianOf(durations: Durations): number {
  const v = Object.values(durations).sort((a, b) => a - b);
  if (v.length === 0) return 1;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** The shards (index 0..count-1) as lists of paths relative to the repo root, LPT-assigned. */
export function assignShards(paths: string[], durations: Durations, count: number): string[][] {
  const fallback = medianOf(durations);
  const cost = (p: string): number => durations[p] ?? fallback;
  const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  // Stable sort: equal durations keep their path order.
  const byCost = sorted.sort((a, b) => cost(b) - cost(a));
  const shards: string[][] = Array.from({ length: count }, () => []);
  const load: number[] = new Array(count).fill(0);
  for (const p of byCost) {
    let k = 0;
    for (let i = 1; i < count; i++) if (load[i]! < load[k]!) k = i;
    shards[k]!.push(p);
    load[k]! += cost(p);
  }
  return shards;
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
