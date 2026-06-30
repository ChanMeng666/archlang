import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "../src/index.js";

function run(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { input, encoding: "utf8", cwd: process.cwd() });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("CLI — preview (PNG you can look at)", () => {
  it("renders a PNG at the default scale, exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-preview-"));
    const out = join(dir, "studio.png");
    const r = run(["preview", "examples/studio.arch", "-o", out, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.format).toBe("png");
    expect(j.width).toBe(1600); // a viewable default size, not the multi-thousand-px native render
    expect(existsSync(out)).toBe(true);
    expect(j.bytes).toBeGreaterThan(0);
  }, 60000);

  it("a bad plan fails with a fix-carrying diagnostic, exit 2", () => {
    const r = run(["preview", "-", "--json"], 'plan "B" { units mm room at (0,0) size 0x3000 }');
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0].code).toBe("E_ROOM_SIZE");
  }, 60000);

  it("the missing-PNG-dependency failure is a catalogued, self-correcting code", () => {
    // The CLI maps a resvg/pdfkit load failure to E_PNG_DEPENDENCY (+ fix) in --json.
    const entry = ERROR_CATALOG["E_PNG_DEPENDENCY"];
    expect(entry).toBeDefined();
    expect(entry.fix).toMatch(/@resvg\/resvg-js/);
  });
});
