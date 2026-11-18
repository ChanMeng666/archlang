/** scripts/gen-test-durations.mjs: merging and median-of-runs into the duration table, and what it refuses. */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { median, mergeTables, readRun, refusal } from "../scripts/gen-test-durations.mjs";

const SCRIPT = resolve(__dirname, "../scripts/gen-test-durations.mjs");
type Table = Record<string, number>;

describe("median", () => {
  it("is the middle value, the mean of the two middles for an even count, to 0.1", () => {
    expect(median([162.7, 53.5, 75.8])).toBe(75.8);
    expect(median([87.3, 136.5, 153.4])).toBe(136.5);
    expect(median([1, 2])).toBe(1.5);
    expect(median([0.12, 0.14])).toBe(0.1);
    expect(median([4])).toBe(4);
  });
});

describe("refusal", () => {
  it("refuses a vitest JSON report and anything but an object, and passes a map", () => {
    expect(refusal({ testResults: [] })).toMatch(/JSON report.*import and collect/);
    expect(refusal([1, 2])).toBeDefined();
    expect(refusal(null)).toBeDefined();
    expect(refusal(3)).toBeDefined();
    expect(refusal({ "test/a.test.ts": 1 })).toBeUndefined();
  });
});

describe("mergeTables", () => {
  const exists = (f: string) => !f.includes("deleted");
  const old: Table = { "test/a.test.ts": 1, "test/b.test.ts": 2, "test/deleted.test.ts": 3, "test/kept.test.ts": 4 };

  it("replaces the rows the runs have, keeps the rest while the file exists, drops deleted files", () => {
    const { table, rows, kept, dropped } = mergeTables({
      old,
      runs: [{ "test/b.test.ts": 9, "test/new.test.ts": 5 }],
      exists,
    });
    expect(table).toEqual({ "test/a.test.ts": 1, "test/b.test.ts": 9, "test/kept.test.ts": 4, "test/new.test.ts": 5 });
    expect(Object.keys(table)).toEqual(Object.keys(table).sort());
    expect([rows, kept, dropped]).toEqual([2, 2, 1]);
  });

  it("without --median a later run wins; with it each file gets the median of the runs that have it", () => {
    const runs: Table[] = [
      { "test/a.test.ts": 162.7, "test/b.test.ts": 10 },
      { "test/a.test.ts": 53.5, "test/b.test.ts": 30 },
      { "test/a.test.ts": 75.8 },
    ];
    expect(mergeTables({ runs, exists }).table).toEqual({ "test/a.test.ts": 75.8, "test/b.test.ts": 30 });
    expect(mergeTables({ runs, exists, useMedian: true }).table).toEqual({
      "test/a.test.ts": 75.8,
      "test/b.test.ts": 20,
    });
  });

  it("ignores a value that is not a finite number >= 0, and forgets a dropped file's row everywhere", () => {
    const runs = [{ "test/a.test.ts": -1, "test/b.test.ts": Number.NaN, "test/c.test.ts": "7" as unknown as number }];
    expect(mergeTables({ old: { "test/a.test.ts": 1 }, runs, exists }).table).toEqual({ "test/a.test.ts": 1 });
    const drop = ["test/a.test.ts"];
    expect(mergeTables({ old, runs: [{ "test/a.test.ts": 5 }], exists, drop }).table).not.toHaveProperty(
      "test/a.test.ts",
    );
  });
});

describe("the command", () => {
  let dir = "";
  const run = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" }),
      };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { code: err.status, out: err.stderr };
    }
  };
  const write = (p: string, v: unknown) => {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), JSON.stringify(v));
  };
  const table = () => JSON.parse(readFileSync(join(dir, "t.json"), "utf8")) as Table;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-test-durations-"));
    for (const f of ["a", "b", "c"]) write(`test/${f}.test.ts`, "");
    // Two runs of two shards each, as `gh run download -D <dir>` lays them out.
    write("r1/test-durations-1/test-durations-1.json", { "test/a.test.ts": 10 });
    write("r1/test-durations-2/test-durations-2.json", { "test/b.test.ts": 4 });
    write("r2/test-durations-1/test-durations-1.json", { "test/a.test.ts": 20, "test/b.test.ts": 6 });
    write("r3.json", { "test/a.test.ts": 90 });
    write("report.json", { testResults: [] });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a directory as one run, recursively, and takes the median of the runs", () => {
    write("t.json", { "test/c.test.ts": 1, "test/gone.test.ts": 2 });
    expect(run("-o", "t.json", "--median", "r1", "r2", "r3.json").code).toBe(0);
    // a: median(10, 20, 90) = 20; b: median(4, 6) = 5; c kept; gone dropped.
    expect(table()).toEqual({ "test/a.test.ts": 20, "test/b.test.ts": 5, "test/c.test.ts": 1 });
    expect(readRun(join(dir, "r1"))).toEqual({ "test/a.test.ts": 10, "test/b.test.ts": 4 });
  });

  it("requires -o: the old `<report> <out>` form is a usage error that leaves the table alone", () => {
    write("t.json", { "test/c.test.ts": 1 });
    const r = run("r3.json", "t.json");
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/usage/);
    expect(table()).toEqual({ "test/c.test.ts": 1 });
  });

  it("refuses the table as an input, a JSON report, and --drop without a file", () => {
    write("t.json", { "test/c.test.ts": 1 });
    expect(run("-o", "t.json", "t.json").code).toBe(2);
    const r = run("-o", "t.json", "report.json");
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/JSON report/);
    expect(run("-o", "t.json", "r3.json", "--drop").code).toBe(2);
    expect(table()).toEqual({ "test/c.test.ts": 1 });
  });

  it("--drop forgets a row the runs and the table hold", () => {
    write("t.json", { "test/a.test.ts": 1, "test/c.test.ts": 1 });
    expect(run("-o", "t.json", "--drop", "test/a.test.ts", "r3.json").code).toBe(0);
    expect(table()).toEqual({ "test/c.test.ts": 1 });
  });
});
