/**
 * A vitest reporter that writes `{file: seconds}`, the table `test/sequencer.ts` balances by, with
 * each file's whole cost in its worker rather than only its tests' time.
 *
 * Why: vitest's JSON report spans a file from its first test's start to its last test's end
 * (`testResults[].startTime/endTime`), which leaves out importing the file and running its describe
 * callbacks. CI shards paid that collect time unseen: one shard collected for 300 s against 57-83 s
 * for the others while the table called them equal.
 *
 * A file's seconds are the sum of the per-file fields vitest records on its `RunnerTestFile`:
 * `prepareDuration` (the worker's test harness) and `environmentLoad`, set when the file is
 * collected; `setupDuration` (the setup files) and `collectDuration` (importing the file and its
 * dependencies, and running its suite callbacks), set by the runner's `collectTests`; and
 * `result.duration` (the file's suites, tests and hooks). A file that never finished collecting
 * (an import error) has no `collectDuration` and gets no row, so the sequencer counts it at the
 * table's median.
 *
 * Use: `TEST_DURATIONS_OUT=<out.json> npx vitest run --reporter=default --reporter=./test/durations-reporter.ts`
 * (default output `test-durations.json`). Under `--shard` it writes the shard's files only; merge
 * the shards' maps with `scripts/gen-test-durations.mjs` (`test/.durations.README.md`).
 */
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import type { RunnerTestFile } from "vitest";
import type { Vitest } from "vitest/node";
import type { Reporter } from "vitest/reporters";
import type { Durations } from "./sequencer.js";

/** The fields of a file task this reporter reads (all milliseconds). */
export type FileTiming = Pick<
  RunnerTestFile,
  "filepath" | "prepareDuration" | "environmentLoad" | "setupDuration" | "collectDuration" | "local"
> & { result?: { duration?: number } };

const ms = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** A file's seconds in its worker, or undefined when it never finished collecting. */
export function fileSeconds(f: FileTiming): number | undefined {
  if (f.local || typeof f.collectDuration !== "number" || !Number.isFinite(f.collectDuration)) return undefined;
  const total =
    ms(f.prepareDuration) +
    ms(f.environmentLoad) +
    ms(f.setupDuration) +
    ms(f.collectDuration) +
    ms(f.result?.duration);
  return Math.round(total / 100) / 10;
}

/** `{file: seconds}` keyed by the path relative to `root` with `/` separators, sorted by path. */
export function durationsOf(files: readonly FileTiming[], root: string): Durations {
  const rows: [string, number][] = [];
  for (const f of files) {
    const s = fileSeconds(f);
    if (s !== undefined) rows.push([relative(root, f.filepath).replace(/\\/g, "/"), s]);
  }
  return Object.fromEntries(rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export default class DurationsReporter implements Reporter {
  private root = process.cwd();

  onInit(ctx: Vitest): void {
    this.root = ctx.config.root;
  }

  onFinished(files: RunnerTestFile[] = []): void {
    const out = process.env.TEST_DURATIONS_OUT || "test-durations.json";
    const table = durationsOf(files, this.root);
    writeFileSync(out, `${JSON.stringify(table, null, 2)}\n`);
    console.log(`test durations: ${Object.keys(table).length} files -> ${out}`);
  }
}
