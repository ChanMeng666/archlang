/**
 * `fmt --write` whose write fails (a read-only file) is a CLI error, exit 1 with the `ok:false`
 * envelope, not an uncaught throw. The file stays as it was.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runArch } from "./helpers/cli.js";

const UNFORMATTED = 'plan "P" {\nunits mm\n   grid 50\n}\n';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-fmt-wf-"));
  file = join(dir, "p.arch");
  writeFileSync(file, UNFORMATTED, "utf8");
});
afterEach(() => {
  try {
    chmodSync(file, 0o644);
  } catch {
    // already gone
  }
  rmSync(dir, { recursive: true, force: true });
});

// A root user can write a read-only file; the failure cannot be provoked there.
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("fmt --write when the write fails", () => {
  it.skipIf(asRoot)("exits 1 with an ok:false error envelope and leaves the file untouched", async () => {
    chmodSync(file, 0o444);
    const r = await runArch(["fmt", file, "--write", "--json"]);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout) as { ok: boolean; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/EACCES|EPERM|permission/i);
    chmodSync(file, 0o644);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(file, "utf8")).toBe(UNFORMATTED);
  });
});
