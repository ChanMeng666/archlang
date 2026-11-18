/** test/sequencer.ts: LPT shard balancing with a per-file overhead, and its stability property. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import DurationsReporter, { durationsOf, type FileTiming, fileSeconds } from "./durations-reporter.js";
import DurationSequencer, {
  assignShards,
  type Durations,
  FILE_OVERHEAD_S,
  fileCost,
  medianOf,
  readDurations,
  shardCosts,
} from "./sequencer.js";

const ROOT = resolve(__dirname, "..");
const TABLE = readDurations(new URL("./.durations.json", import.meta.url));
/** The files vitest.config.ts's `include` collects, from the index. */
const SUITE = execFileSync("git", ["ls-files", "--", "*.test.ts"], { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((f) => /^(test\/|playground\/test\/|packages\/[^/]+\/test\/|editors\/vscode\/test\/)/.test(f));

const shardOf = (shards: string[][]) => new Map(shards.flatMap((s, i) => s.map((p) => [p, i] as const)));
const isPartition = (shards: string[][], paths: string[]) => {
  const all = shards.flat();
  return all.length === new Set(paths).size && new Set(all).size === all.length && paths.every((p) => all.includes(p));
};

describe("assignShards", () => {
  it("is LPT over recorded seconds plus FILE_OVERHEAD_S, ties by path, to the lowest lightest shard", () => {
    expect(FILE_OVERHEAD_S).toBe(2);
    expect(fileCost(0)).toBe(2);
    const table: Durations = {
      "a.test.ts": 10,
      "b.test.ts": 6,
      "c.test.ts": 5,
      "d.test.ts": 0,
      "e.test.ts": 0,
      "f.test.ts": 0,
    };
    // Costs 12, 8, 7, 2, 2, 2: a→0 (12), b→1 (8), c→1 (15), d→0 (14), e→0 (16), f→1 (17).
    expect(assignShards(Object.keys(table).reverse(), table, 2)).toEqual([
      ["a.test.ts", "d.test.ts", "e.test.ts"],
      ["b.test.ts", "c.test.ts", "f.test.ts"],
    ]);
  });

  it("spreads files recorded at 0 s over every shard (TP6: they all landed in one)", () => {
    const table: Durations = { "heavy-1.test.ts": 100, "heavy-2.test.ts": 90, "heavy-3.test.ts": 80 };
    const zeros = Array.from({ length: 120 }, (_, i) => `zero-${String(i).padStart(3, "0")}.test.ts`);
    for (const z of zeros) table[z] = 0;
    const shards = assignShards(Object.keys(table), table, 3);
    for (const s of shards) expect(s.filter((p) => p.startsWith("zero-")).length).toBeGreaterThanOrEqual(30);
  });

  it("on the real table: a partition, the lightest files in every shard, loads within one file's cost", () => {
    // TP6's files recorded at 0 s now record their collect time; the lightest ones must still spread.
    const isLight = (p: string) => p in TABLE && TABLE[p]! <= 0.5;
    const zeros = SUITE.filter(isLight);
    expect(zeros.length).toBeGreaterThan(20);
    // Every file counted as the sequencer counts it, the files the table lacks at its median.
    const cost = (p: string) => fileCost(p in TABLE ? TABLE[p]! : medianOf(TABLE));
    const largest = Math.max(...SUITE.map(cost));
    for (const n of [3, 5, 7]) {
      const shards = assignShards(SUITE, TABLE, n);
      expect(isPartition(shards, SUITE), `N=${n}`).toBe(true);
      for (const s of shards) expect(s.filter(isLight).length).toBeGreaterThanOrEqual(Math.floor(zeros.length / n / 2));
      const costs = shardCosts(shards, TABLE);
      expect(
        costs.reduce((a, b) => a + b, 0),
        `N=${n}`,
      ).toBeCloseTo(
        SUITE.reduce((a, p) => a + cost(p), 0),
        6,
      );
      // Greedy-to-lightest, both passes: the heaviest shard was the lightest when it took its last file.
      expect(Math.max(...costs) - Math.min(...costs), `N=${n}`).toBeLessThanOrEqual(largest);
    }
  });

  it("puts a file the table lacks on the lightest shard at the table's median, after every recorded file", () => {
    // The #794 pole: an unrecorded file used to be hashed onto a shard regardless of its load.
    const table: Durations = { "heavy.test.ts": 100, "light.test.ts": 10 };
    expect(assignShards(["heavy.test.ts", "light.test.ts", "new.test.ts"], table, 2)).toEqual([
      ["heavy.test.ts"],
      ["light.test.ts", "new.test.ts"],
    ]);
    // Many unrecorded files spread like recorded ones.
    const many = Array.from({ length: 40 }, (_, i) => `u-${String(i).padStart(2, "0")}.test.ts`);
    const shards = assignShards([...many, "heavy.test.ts"], { "heavy.test.ts": 30, "x.test.ts": 1 }, 4);
    const costs = shardCosts(shards, { "heavy.test.ts": 30, "x.test.ts": 1 });
    expect(Math.max(...costs) - Math.min(...costs)).toBeLessThanOrEqual(fileCost(30));
    for (const s of shards.slice(1)) expect(s.length).toBeGreaterThan(5);
  });

  it("medianOf: the middle usable entry (mean of the two middles), 0 for an empty table", () => {
    expect(medianOf({ a: 1, b: 9, c: 3 })).toBe(3);
    expect(medianOf({ a: 1, b: 9, c: 3, d: 5 })).toBe(4);
    expect(medianOf({})).toBe(0);
    expect(medianOf({ a: 2, b: Number.NaN, c: -1, d: "7" as unknown as number })).toBe(2);
  });

  it("does not depend on the order or duplicates of its input", () => {
    const paths = [...SUITE.slice(0, 80), "test/zz-unrecorded.test.ts"];
    expect(assignShards([...paths].reverse().concat(paths.slice(0, 5)), TABLE, 4)).toEqual(
      assignShards(paths, TABLE, 4),
    );
  });

  it("stability: adding, removing or renaming a file the table lacks never moves a recorded file", () => {
    const recordedFiles = SUITE.filter((p) => p in TABLE);
    const base = recordedFiles.concat(["test/zz-unrecorded-a.test.ts", "test/zz-unrecorded-c.test.ts"]);
    for (const n of [3, 5, 7]) {
      const before = shardOf(assignShards(base, TABLE, n));
      const variants: [string[], string][] = [
        [[...base, "test/zz-unrecorded-b.test.ts"], "test/zz-unrecorded-b.test.ts"],
        [base.filter((p) => p !== "test/zz-unrecorded-c.test.ts"), "test/zz-unrecorded-c.test.ts"],
        [
          base.map((p) => (p === "test/zz-unrecorded-c.test.ts" ? "test/zz-unrecorded-d.test.ts" : p)),
          "test/zz-unrecorded-c.test.ts",
        ],
      ];
      for (const [v, changed] of variants) {
        const after = shardOf(assignShards(v, TABLE, n));
        for (const p of recordedFiles) expect(after.get(p), `${p} moved at N=${n}`).toBe(before.get(p));
        // Files the table lacks that sort before the changed one keep their shard too; later ones may move.
        for (const [p, i] of after) if (!(p in TABLE) && p < changed && before.has(p)) expect(i, p).toBe(before.get(p));
      }
    }
  });

  it("treats an entry that is not a finite number ≥ 0 as missing", () => {
    const table = {
      "x.test.ts": 3,
      "nan.test.ts": Number.NaN,
      "neg.test.ts": -1,
      "str.test.ts": "7" as unknown as number,
    };
    const paths = ["str.test.ts", "neg.test.ts", "absent.test.ts", "nan.test.ts", "x.test.ts"];
    // x first (5), then the rest in path order at the median 3 (+2) onto the lightest shard.
    expect(assignShards(paths, table, 5)).toEqual([
      ["x.test.ts"],
      ["absent.test.ts"],
      ["nan.test.ts"],
      ["neg.test.ts"],
      ["str.test.ts"],
    ]);
  });
});
describe("ci.yml's vitest shard jobs", () => {
  const yml = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8").replace(/\r\n/g, "\n");
  // Each job's block: from its `  <id>:` line to the next.
  const blocks = yml
    .slice(yml.indexOf("\njobs:\n"))
    .split(/\n(?= {2}[A-Za-z0-9_-]+:\n)/)
    .slice(1);
  const sharded = blocks.filter((b) => b.includes("npx vitest run --shard="));

  it("run shards 1..N of N, and the leg's extra steps only on shard N", () => {
    expect(sharded.length).toBeGreaterThanOrEqual(4);
    for (const b of sharded) {
      const id = b.slice(2, b.indexOf(":"));
      const n = Number(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/.exec(b)?.[1]);
      expect(n, id).toBeGreaterThan(1);
      const list = /\n {8}shard: \[([^\]]*)\]/
        .exec(b)?.[1]
        ?.split(",")
        .map((s) => Number(s.trim()));
      expect(list, id).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      for (const m of b.matchAll(/if: matrix\.shard == (\d+)/g)) expect(Number(m[1]), id).toBe(n);
    }
  });

  it("the Node 22 shards and nightly's duration leg record with test/durations-reporter.ts, never a JSON report", () => {
    const reporter = "--reporter=./test/durations-reporter.ts";
    const node22 = blocks.find((b) => b.startsWith("  node-22-tests:"));
    expect(node22).toContain(reporter);
    // Naming reporters drops vitest's own `github-actions` one, so the shards name it.
    expect(node22).toContain("--reporter=github-actions");
    const out = ["test-durations-$", "{{ matrix.shard }}.json"].join("");
    expect(node22).toContain(`TEST_DURATIONS_OUT: ${out}`);
    expect(node22).toContain(`path: ${out}`);
    const nightly = readFileSync(resolve(ROOT, ".github/workflows/nightly.yml"), "utf8").replace(/\r\n/g, "\n");
    const at = nightly.indexOf("- name: Test (with the duration report)");
    expect(at).toBeGreaterThan(0);
    const step = nightly.slice(at, nightly.indexOf("\n      - ", at));
    expect(step).toContain(reporter);
    expect(step).toContain("TEST_DURATIONS_OUT: test-durations.json");
    expect(step).not.toContain("--reporter=json");
  });
});

describe("test/durations-reporter.ts", () => {
  const file = (over: Partial<FileTiming>): FileTiming => ({
    filepath: join(ROOT, "test", "x.test.ts"),
    prepareDuration: 300,
    environmentLoad: 20,
    setupDuration: 80,
    collectDuration: 4_000,
    result: { duration: 1_550 },
    ...over,
  });

  it("counts prepare, environment, setup, collect and the run, in seconds to 0.1", () => {
    expect(fileSeconds(file({}))).toBe(6);
    expect(fileSeconds(file({ collectDuration: 4_040 }))).toBe(6);
    expect(fileSeconds(file({ collectDuration: 4_140 }))).toBe(6.1);
    // Collect alone is a file's cost when it has no tests to run.
    expect(
      fileSeconds(
        file({ prepareDuration: undefined, environmentLoad: undefined, setupDuration: 0, result: undefined }),
      ),
    ).toBe(4);
    // A field that is missing, negative or not finite counts 0.
    expect(fileSeconds(file({ prepareDuration: -5, environmentLoad: Number.NaN, result: {} }))).toBe(4.1);
  });

  it("gives no row to a file that never finished collecting, or one vitest did not run", () => {
    expect(fileSeconds(file({ collectDuration: undefined }))).toBeUndefined();
    expect(fileSeconds(file({ collectDuration: Number.POSITIVE_INFINITY }))).toBeUndefined();
    expect(fileSeconds(file({ local: true }))).toBeUndefined();
  });

  it("keys rows by the repo-relative path with `/`, sorted, the table's format", () => {
    const files = [
      file({ filepath: join(ROOT, "test", "b.test.ts") }),
      file({ filepath: join(ROOT, "packages", "mcp", "test", "a.test.ts"), collectDuration: 1_050 }),
      file({ filepath: join(ROOT, "test", "broken.test.ts"), collectDuration: undefined }),
    ];
    const table = durationsOf(files, ROOT);
    expect(Object.keys(table)).toEqual(["packages/mcp/test/a.test.ts", "test/b.test.ts"]);
    expect(table).toEqual({ "packages/mcp/test/a.test.ts": 3, "test/b.test.ts": 6 });
  });

  it("writes the map to TEST_DURATIONS_OUT, relative to the run's root", () => {
    const dir = mkdtempSync(join(tmpdir(), "durations-reporter-"));
    const before = process.env.TEST_DURATIONS_OUT;
    try {
      process.env.TEST_DURATIONS_OUT = join(dir, "out.json");
      const r = new DurationsReporter();
      r.onInit({ config: { root: ROOT } } as never);
      r.onFinished([file({ filepath: join(ROOT, "test", "y.test.ts") })] as never);
      expect(JSON.parse(readFileSync(join(dir, "out.json"), "utf8"))).toEqual({ "test/y.test.ts": 6 });
    } finally {
      if (before === undefined) delete process.env.TEST_DURATIONS_OUT;
      else process.env.TEST_DURATIONS_OUT = before;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DurationSequencer.shard()", () => {
  it("gives every collected file to exactly one shard index, N=3, 5 and 7", async () => {
    const files = SUITE.map((p) => ({ moduleId: resolve(ROOT, p) }));
    for (const count of [3, 5, 7]) {
      const seen: string[] = [];
      for (let index = 1; index <= count; index++) {
        const self = { ctx: { config: { root: ROOT, shard: { index, count } } } };
        const mine = (await DurationSequencer.prototype.shard.call(self as never, files as never)) as {
          moduleId: string;
        }[];
        seen.push(...mine.map((f) => f.moduleId));
      }
      expect(seen.length, `N=${count}`).toBe(files.length);
      expect(new Set(seen).size, `N=${count}`).toBe(files.length);
    }
  });
});
