import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * A one-shot command ends in `process.exit(code)` (`src/cli.ts`). On a pipe, stdout is
 * written asynchronously and `process.exit` does not wait for the pending part, so a large
 * `--json` document reached the reader cut off mid-string (Node 22 on Linux, first seen on
 * `context --json` at ~145 KB). The fix drains stdout/stderr before exiting.
 *
 * The reader here is deliberately slow: it stalls after every chunk, so the child reaches
 * exit with data still queued, which is the state that truncates. Measured in node:18 and
 * node:22 containers before the fix: the >200 KB `ast` output arrived cut at 219 KB / 146 KB
 * of 872 KB. Plain `spawnSync` shows it only on some platforms (Windows pipes drain in time).
 */

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runSlowReader(args: string[], input?: string, readerDelayMs = 150): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stderr.on("data", (b: Buffer) => err.push(b));
    // Take one chunk, then stop reading for a while. The listener must exist from the start:
    // Node drains an unlistened, paused child pipe by itself when the child exits.
    child.stdout.on("data", (b: Buffer) => {
      out.push(b);
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), readerDelayMs);
    });
    child.on("error", reject);
    child.on("close", (status) =>
      resolve({ status, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }),
    );
    child.stdin.end(input ?? "");
  });
}

/** ~1200 rooms: `ast --json` of this is far past 200 KB, whatever the agent context weighs. */
function bigPlan(rooms: number): string {
  let s = 'plan "Big" {\n  units mm\n';
  for (let i = 0; i < rooms; i++) {
    s += `  room id=r${i} at (${(i % 40) * 5000},${Math.floor(i / 40) * 4000}) size 4000x3000 label "R${i}"\n`;
  }
  return `${s}}\n`;
}

describe("CLI — stdout is flushed before the process exits", () => {
  it("a >200 KB `ast - --json` over a slow pipe arrives whole and parses", async () => {
    const r = await runSlowReader(["ast", "-", "--json"], bigPlan(1200));
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(200_000);
    expect(r.stdout.endsWith("\n")).toBe(true);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
  }, 60000);

  it("`context --json` over a slow pipe arrives whole and parses", async () => {
    const r = await runSlowReader(["context", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(typeof j.context).toBe("string");
  }, 60000);

  it("keeps the documented exit codes through the flush (usage error stays 3)", async () => {
    const r = await runSlowReader(["ast", "--no-such-flag"]);
    expect(r.status).toBe(3);
  }, 30000);
});
