import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/index.js";
import type { PerFile } from "../src/cli/serialize.js";
import { aggregateExit, perFileJson, runPool } from "../src/cli/serialize.js";

/** Spawn the real CLI via the tsx loader (no build step), as in cli.test.ts. */
function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("CLI — batch", () => {
  it("renders many files in one call: array JSON, both outputs written, exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-batch-"));
    const r = run(["batch", "examples/studio.arch", "examples/two-bed.arch", "-f", "svg", "-o", dir, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.results).toHaveLength(2);
    for (const res of j.results) {
      expect(res.ok).toBe(true);
      expect(existsSync(res.output)).toBe(true);
      expect(res.bytes).toBeGreaterThan(0);
    }
  }, 60000);

  it("reports a user-source error per file and aggregates exit 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-batch-"));
    const good = join(dir, "good.arch");
    const bad = join(dir, "bad.arch");
    writeFileSync(good, 'plan "G" { units mm room at (0,0) size 3000x3000 label "R" }');
    writeFileSync(bad, 'plan "B" { units mm room at (0,0) size 0x3000 }');
    const r = run(["batch", good, bad, "-o", dir, "--json"]);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    const failed = j.results.find((x: { input: string }) => x.input.endsWith("bad.arch"));
    expect(failed.ok).toBe(false);
    expect(failed.diagnostics[0].code).toBe("E_ROOM_SIZE");
  }, 60000);

  /**
   * The aggregation rule end to end, against the documented contract
   * (`0` ok · `1` IO/internal · `2` user-source · `3` bad usage). A batch reports ONE
   * code for many files, so which failure wins is the whole point: a wrong answer here
   * misleads every automated consumer silently.
   */
  it("aggregates one exit code over mixed inputs: user-source (2) outranks IO (1); a bad flag is 3", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-batch-"));
    const good = join(dir, "good.arch");
    const bad = join(dir, "bad.arch");
    const missing = join(dir, "absent.arch");
    writeFileSync(good, 'plan "G" { units mm room at (0,0) size 3000x3000 label "R" }');
    writeFileSync(bad, 'plan "B" { units mm room at (0,0) size 0x3000 }');

    // An unreadable input is an IO failure, not a user-source one: no diagnostics, an
    // `error` string, exit 1 — and the readable sibling still renders.
    const io = run(["batch", good, missing, "-o", dir, "--json"]);
    expect(io.status).toBe(1);
    const ji = JSON.parse(io.stdout);
    expect(ji.ok).toBe(false);
    const absent = ji.results.find((x: { input: string }) => x.input.endsWith("absent.arch"));
    expect(absent.diagnostics).toEqual([]);
    expect(absent.error).toContain("cannot read");
    expect(ji.results.find((x: { input: string }) => x.input.endsWith("good.arch")).ok).toBe(true);

    // Both failure kinds at once: the user-source error wins, so a broken plan is never
    // hidden behind a missing-file 1.
    const mixed = run(["batch", good, missing, bad, "-o", dir, "--json"]);
    expect(mixed.status).toBe(2);
    expect(JSON.parse(mixed.stdout).results).toHaveLength(3);

    // A flag `batch` does not declare is a usage error before any file is read.
    const usage = run(["batch", good, "--nope", "-o", dir]);
    expect(usage.status).toBe(3);
    expect(usage.stderr).toContain('unknown flag "--nope"');
  }, 60000);
});

// ---------------------------------------------------------------------------
// The concurrency + aggregation core behind `batch`, in process.
// ---------------------------------------------------------------------------

const perFile = (over: Partial<PerFile>): PerFile => ({
  input: "a.arch",
  ok: true,
  format: "svg",
  diagnostics: [],
  source: "",
  ...over,
});

/** Yield long enough for the pool's workers to pick up their next task. */
const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe("runPool — bounded concurrency", () => {
  it("never exceeds the limit, and returns results in INPUT order however they finish", async () => {
    const N = 6;
    const LIMIT = 2;
    // Hand-controlled deferreds rather than timers: completion order is chosen by the
    // test, so there is no wall clock to be flaky about.
    const gate = Array.from({ length: N }, () => {
      let release!: (v: number) => void;
      const promise = new Promise<number>((r) => {
        release = r;
      });
      return { promise, release };
    });
    const started: number[] = [];
    const tasks = gate.map((g, i) => async () => {
      started.push(i);
      return g.promise;
    });

    const done = runPool(tasks, LIMIT);
    // Exactly LIMIT tasks are in flight before anything resolves.
    expect(started).toEqual([0, 1]);

    // Finish 1 BEFORE 0: the freed worker takes the next task, and the out-of-order
    // completion must not reorder the results.
    gate[1]!.release(11);
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gate[0]!.release(10);
    await tick();
    expect(started).toEqual([0, 1, 2, 3]);
    expect(started.length).toBeLessThan(N); // still throttled, not a free-for-all

    for (let i = 2; i < N; i++) gate[i]!.release(10 + i);
    expect(await done).toEqual([10, 11, 12, 13, 14, 15]);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("degenerate limits and an empty task list are safe", async () => {
    expect(await runPool([], 4)).toEqual([]);
    const seq: number[] = [];
    const tasks = [0, 1, 2].map((i) => async () => {
      seq.push(i);
      await tick();
      return i;
    });
    // `limit <= 0` clamps to one worker rather than deadlocking on zero.
    expect(await runPool(tasks, 0)).toEqual([0, 1, 2]);
    expect(seq).toEqual([0, 1, 2]);
    // A limit above the task count spawns at most one worker per task.
    expect(await runPool([async () => "x"], 99)).toEqual(["x"]);
  });
});

describe("aggregateExit — one code for many files", () => {
  const ok = perFile({ ok: true, output: "o.svg", bytes: 1 });
  // A compile failure carries diagnostics and NO `error` string — that absence is
  // exactly how the rule tells a user-source failure from an IO one.
  const user = perFile({
    ok: false,
    diagnostics: [{ severity: "error", code: "E_ROOM_SIZE", message: "bad size", span: { start: 0, end: 4 } }],
  });
  const io = perFile({ ok: false, error: "cannot read a.arch" });

  it("is 0 only when everything succeeded", () => {
    expect(aggregateExit([])).toBe(0);
    expect(aggregateExit([ok, ok])).toBe(0);
  });

  it("reports IO as 1, user-source as 2, and lets user-source win — in either order", () => {
    expect(aggregateExit([ok, io])).toBe(1);
    expect(aggregateExit([ok, user])).toBe(2);
    expect(aggregateExit([io, user])).toBe(2);
    expect(aggregateExit([user, io])).toBe(2);
  });
});

describe("perFileJson — the agent-facing per-file shape", () => {
  it("carries output/bytes on success and omits the failure keys", () => {
    const j = perFileJson(perFile({ ok: true, output: "/out/a.svg", bytes: 42 }));
    expect(j).toEqual({ input: "a.arch", ok: true, format: "svg", output: "/out/a.svg", bytes: 42, diagnostics: [] });
  });

  it("projects diagnostics against the file's OWN source, and attaches the catalog fix", () => {
    const source = 'plan "P" {\n  room at (0,0) size 0x3000\n}\n';
    const d: Diagnostic = {
      severity: "error",
      code: "E_ROOM_SIZE",
      message: "zero width",
      span: { start: 13, end: 17 },
    };
    const j = perFileJson(perFile({ ok: false, diagnostics: [d], source })) as {
      diagnostics: Array<{ code: string; line: number }>;
    };
    // Line/col come from `diagnosticToJson`, so the row must be this file's line 2 —
    // proof the projection uses each result's own source, not the last one seen.
    expect(j.diagnostics[0]!.code).toBe("E_ROOM_SIZE");
    expect(j.diagnostics[0]!.line).toBe(2);

    const dep = perFileJson(perFile({ ok: false, error: "resvg not installed", errorCode: "E_PNG_DEPENDENCY" })) as {
      error: string;
      code: string;
      fix: string;
    };
    expect(dep.error).toBe("resvg not installed");
    expect(dep.code).toBe("E_PNG_DEPENDENCY");
    expect(typeof dep.fix).toBe("string");
  });
});
