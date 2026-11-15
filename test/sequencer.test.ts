/** test/sequencer.ts: LPT shard balancing with a per-file overhead, and its stability property. */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import DurationSequencer, {
  assignShards,
  type Durations,
  FILE_OVERHEAD_S,
  fileCost,
  pathHash,
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

  it("on the real table: a partition, every shard holds files recorded at 0 s, loads within one file's cost", () => {
    const zeros = SUITE.filter((p) => TABLE[p] === 0);
    expect(zeros.length).toBeGreaterThan(0);
    const largest = Math.max(...SUITE.filter((p) => p in TABLE).map((p) => fileCost(TABLE[p]!)));
    for (const n of [3, 5, 7]) {
      const shards = assignShards(SUITE, TABLE, n);
      expect(isPartition(shards, SUITE), `N=${n}`).toBe(true);
      for (const s of shards)
        expect(s.filter((p) => TABLE[p] === 0).length).toBeGreaterThanOrEqual(Math.floor(zeros.length / n / 2));
      const costs = shardCosts(shards, TABLE);
      // Greedy-to-lightest: the heaviest shard was the lightest when it took its last file.
      expect(Math.max(...costs) - Math.min(...costs), `N=${n}`).toBeLessThanOrEqual(largest);
    }
  });

  it("does not depend on the order or duplicates of its input", () => {
    const paths = SUITE.slice(0, 80);
    const shuffled = [...paths].sort((a, b) => pathHash(a) - pathHash(b));
    expect(assignShards([...shuffled, ...paths.slice(0, 5)], TABLE, 4)).toEqual(assignShards(paths, TABLE, 4));
  });

  it("stability: adding, removing or renaming a file the table lacks moves no other file", () => {
    const base = SUITE.filter((p) => p in TABLE).concat([
      "test/zz-unrecorded-a.test.ts",
      "test/zz-unrecorded-b.test.ts",
    ]);
    for (const n of [3, 5, 7]) {
      const before = shardOf(assignShards(base, TABLE, n));
      const variants = [
        [...base, "test/zz-new.test.ts"],
        base.filter((p) => p !== "test/zz-unrecorded-a.test.ts"),
        base.map((p) => (p === "test/zz-unrecorded-b.test.ts" ? "test/zz-renamed.test.ts" : p)),
      ];
      for (const v of variants) {
        const after = shardOf(assignShards(v, TABLE, n));
        for (const [p, i] of after) if (before.has(p)) expect(i, `${p} moved at N=${n}`).toBe(before.get(p));
      }
    }
  });

  it("puts a file the table lacks, or holds no usable number for, on the shard its path hashes to", () => {
    expect(pathHash("")).toBe(0x811c9dc5);
    expect(pathHash("a")).toBe(0xe40c292c);
    const table = {
      "x.test.ts": 3,
      "nan.test.ts": Number.NaN,
      "neg.test.ts": -1,
      "str.test.ts": "7" as unknown as number,
    };
    const paths = ["x.test.ts", "nan.test.ts", "neg.test.ts", "str.test.ts", "absent.test.ts"];
    const where = shardOf(assignShards(paths, table, 5));
    for (const p of paths.slice(1)) expect(where.get(p), p).toBe(pathHash(p) % 5);
    expect(where.get("x.test.ts")).toBe(0);
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
