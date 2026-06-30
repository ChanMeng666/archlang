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
// Compiles clean (no errors) but lints with warnings: a room with no door/entrance.
const WARN = 'plan "W" { units mm wall exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close } room id=r at (0,0) size 2000x2000 label "R" }';

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

  it("`validate --strict` fails on warnings (exit 2) but default validate passes (exit 0)", () => {
    const lax = run(["validate", "-", "--json"], WARN);
    expect(lax.status).toBe(0);
    expect(JSON.parse(lax.stdout).ok).toBe(true);
    const strict = run(["validate", "-", "--strict", "--json"], WARN);
    expect(strict.status).toBe(2);
    const j = JSON.parse(strict.stdout);
    expect(j.ok).toBe(false);
    expect(j.strict).toBe(true);
    expect(j.diagnostics.length).toBeGreaterThan(0);
  }, 30000);

  it("`repair - --json` emits corrected source + a change log, exit 0", () => {
    const THROUGH_WALL = `plan "P" {
      units mm grid 50
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=b at (4000,0) size 4000x4000 label "B"
      furniture sofa at (3200,1000) size 1000x900
    }`;
    const r = run(["repair", "-", "--json"], THROUGH_WALL);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.changed).toBe(true);
    expect(j.changes[0].kind).toBe("moved-out-of-wall");
    expect(typeof j.source).toBe("string");
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
