import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * CLI integration for `arch fix` (T2d) and `arch suggest` (T2f). Spawns the real
 * CLI via the tsx loader (no build) and checks the agent contract: `--json` is
 * parseable on stdout, exit codes match the documented convention, `--dry-run`
 * never writes, and both stream through stdin (`-`).
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

// A door floating off the wall (W_DOOR_OFF_WALL) — a machine-applicable fix.
const OFF_WALL = `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Room"
  door id=d at (2500,9000) width 900 wall exterior
}`;

// A bedroom walled off with no window (W_ROOM_UNREACHABLE + W_BEDROOM_NO_WINDOW).
const TOPO = `plan "T" {
  units mm
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (5000,0) (5000,5000) }
  room id=living at (0,0) size 5000x5000 label "Living"
  room id=bed at (5000,0) size 3000x5000 label "Bedroom"
  door id=entry at (2500,0) width 900 wall exterior
}`;

describe("arch fix", () => {
  it("`fix - --dry-run --json` reports the applied fixes and streams to stdout, exit 0", () => {
    const r = run(["fix", "-", "--dry-run", "--json"], OFF_WALL);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.passes).toBe(1);
    expect(j.applied).toHaveLength(1);
    expect(j.applied[0].code).toBe("W_DOOR_OFF_WALL");
    expect(j.applied[0].applicability).toBe("machine-applicable");
  }, 30000);

  it("`fix - -o -` emits the corrected source with the door attached", () => {
    const r = run(["fix", "-", "-o", "-"], OFF_WALL);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("door id=d on w1 at 63.889% width 900");
  }, 30000);

  it("is a no-op (exit 0) on an already-clean plan", () => {
    const clean = 'plan "C" { units mm room at (0,0) size 4000x3000 label "R" }';
    const r = run(["fix", "-", "--dry-run", "--json"], clean);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.passes).toBe(0);
    expect(j.applied).toHaveLength(0);
  }, 30000);
});

describe("arch suggest", () => {
  it("`suggest - --json` returns candidate statements for the topology faults, exit 0", () => {
    const r = run(["suggest", "-", "--json"], TOPO);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    const codes = j.suggestions.map((s: { code: string }) => s.code);
    expect(codes).toContain("W_ROOM_UNREACHABLE");
    expect(codes).toContain("W_BEDROOM_NO_WINDOW");
    const unreach = j.suggestions.find((s: { code: string }) => s.code === "W_ROOM_UNREACHABLE");
    expect(unreach.candidates[0].insertText).toMatch(/^door on \w+ at [\d.]+% width \d+$/);
  }, 30000);
});
