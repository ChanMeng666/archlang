import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
});
