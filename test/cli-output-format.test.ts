/**
 * `compile -o plan.<ext>` with no `-f` writes what the extension says. It used to write SVG under
 * any name and report success, so a `.pdf` that no viewer opened passed for an export.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatOfOutput } from "../src/cli/io.js";
import { runArch } from "./helpers/cli.js";

const PLAN = `plan "T" {\n  units mm\n  room id=a at (0,0) size 4000x3000 label "A"\n}\n`;

async function compileTo(name: string, ...flags: string[]): Promise<{ status: number | null; head: string }> {
  const dir = mkdtempSync(join(tmpdir(), "arch-out-"));
  const input = join(dir, "plan.arch");
  const out = join(dir, name);
  writeFileSync(input, PLAN);
  const r = await runArch(["compile", input, "-o", out, ...flags]);
  return { status: r.status, head: r.status === 0 ? readFileSync(out).subarray(0, 64).toString("latin1") : "" };
}

describe("compile output format", () => {
  it("reads the format off the output path", () => {
    expect(formatOfOutput("plan.pdf")).toBe("pdf");
    expect(formatOfOutput("a.b/PLAN.PNG")).toBe("png");
    expect(formatOfOutput("plan.json")).toBe("json");
    expect(formatOfOutput("plan.md")).toBeUndefined();
    expect(formatOfOutput("plan")).toBeUndefined();
    expect(formatOfOutput("-")).toBeUndefined();
    expect(formatOfOutput(undefined)).toBeUndefined();
  });

  it("writes a real PDF, DXF and text plan from the extension alone", async () => {
    expect((await compileTo("a.pdf")).head).toMatch(/^%PDF-/);
    expect((await compileTo("a.dxf")).head).toMatch(/SECTION/);
    expect((await compileTo("a.txt")).head).not.toMatch(/^<svg/);
  }, 60_000);

  it("lets -f win, and keeps SVG for an extension that names no format", async () => {
    expect((await compileTo("a.pdf", "-f", "svg")).head).toMatch(/^<svg/);
    expect((await compileTo("a.out")).head).toMatch(/^<svg/);
  }, 60_000);
});
