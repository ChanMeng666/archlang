import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * CLI integration — the agent-native contract.
 *
 * Spawns the real CLI (via the tsx loader, no build step) and asserts the things an
 * AI agent depends on: `--json` produces parseable stdout, exit codes are
 * deterministic (0 ok · 2 user-source error · 3 bad usage), diagnostics carry the
 * catalog `fix`, and stdin (`-`) / stdout (`-o -`) work for pipe-driven use.
 */

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const VALID = 'plan "S" { units mm room at (0,0) size 4000x3000 label "R" door at (0,1500) width 900 }';
const BAD = 'plan "B" { units mm room at (0,0) size 0x3000 }';

describe("CLI — agent contract", () => {
  it("`spec` prints the one-prompt spec, exit 0", () => {
    const r = run(["spec"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ArchLang in one prompt");
  }, 30000);

  it("`describe - --json` emits parseable facts on a valid plan, exit 0", () => {
    const r = run(["describe", "-", "--json"], VALID);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.totals.rooms).toBe(1);
  }, 30000);

  it("`compile - --json` on a bad plan: ok:false, fix-carrying diagnostic, exit 2", () => {
    const r = run(["compile", "-", "--json"], BAD);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0].code).toBe("E_ROOM_SIZE");
    expect(typeof j.diagnostics[0].fix).toBe("string");
  }, 30000);

  it("`compile - -o -` streams SVG to stdout, exit 0", () => {
    const r = run(["compile", "-", "-o", "-"], VALID);
    expect(r.status).toBe(0);
    expect(r.stdout.trimStart().startsWith("<svg")).toBe(true);
  }, 30000);

  it("`explain` on an unknown code is a usage error (exit 3)", () => {
    const r = run(["explain", "E_NOPE", "--json"]);
    expect(r.status).toBe(3);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  }, 30000);

  it("`new` scaffolds a plan that itself validates clean", () => {
    const created = run(["new"]);
    expect(created.status).toBe(0);
    const validated = run(["validate", "-", "--json"], created.stdout);
    expect(validated.status).toBe(0);
    expect(JSON.parse(validated.stdout).ok).toBe(true);
  }, 30000);
});
