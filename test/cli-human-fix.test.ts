import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "../src/index.js";

/**
 * Human-mode diagnostics carry the catalog `fix`.
 *
 * `--json` mode has always projected `diagnostics[].fix` (see `src/diagnostic-json.ts`),
 * but a human (or an agent reading plain stderr) used to have to run `arch explain <CODE>`
 * to learn the remedy. `emitDiagnosticsHuman` now appends the catalog's one-line fix in
 * `formatDiagnostic`'s `= help:` style — spawn the real CLI and hold that contract.
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

// A zero-width room — raises E_ROOM_SIZE, which has a catalog entry with a `fix`.
const BAD = 'plan "B" { units mm room at (0,0) size 0x3000 }';
// Two rooms with the same id — raises E_DUPLICATE_ID as well, so we can check every
// diagnostic gets its own fix line, not just the first.
const BAD_TWICE = 'plan "B" { units mm room id=r at (0,0) size 0x3000 room id=r at (0,4000) size 0x3000 }';

describe("CLI — human-mode diagnostics carry the catalog fix", () => {
  it("`compile -` without --json prints `= fix:` with the catalog text on stderr, exit 2", () => {
    const r = run(["compile", "-", "-o", "-"], BAD);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("error[E_ROOM_SIZE]");
    expect(r.stderr).toContain("  = fix: ");
    expect(r.stderr).toContain(ERROR_CATALOG.E_ROOM_SIZE!.fix);
    // The fix belongs to stderr, never to the (byte-stable) stdout stream.
    expect(r.stdout).not.toContain("= fix:");
  }, 30000);

  it("emits one fix line per diagnostic", () => {
    const r = run(["compile", "-", "-o", "-"], BAD_TWICE);
    expect(r.status).toBe(2);
    expect(r.stderr.match(/^ {2}= fix: /gm)?.length ?? 0).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("`--quiet` still suppresses diagnostics entirely", () => {
    const r = run(["compile", "-", "-o", "-", "--quiet"], BAD);
    expect(r.status).toBe(2);
    expect(r.stderr).not.toContain("= fix:");
  }, 30000);

  it("`--json` keeps stdout pure JSON (the fix rides in the payload, not as a `= fix:` line)", () => {
    const r = run(["compile", "-", "--json"], BAD);
    expect(r.status).toBe(2);
    const out = JSON.parse(r.stdout) as { diagnostics: { code: string; fix?: string }[] };
    expect(out.diagnostics[0]!.fix).toBe(ERROR_CATALOG.E_ROOM_SIZE!.fix);
  }, 30000);
});
