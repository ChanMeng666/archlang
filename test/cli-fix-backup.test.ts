import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `arch fix`'s mutation boundary (WP4). `fix` rewrites the input file IN PLACE by
 * default — the CLI's one destructive act — so the contract an agent relies on is that
 * the rewrite is *previewable* (a unified diff on stderr, and under `--dry-run` nothing
 * is written) and *reversible* (`--backup` keeps the original bytes), while a plain
 * `fix` still leaves no `.bak` litter behind.
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

// A door floating off the wall (W_DOOR_OFF_WALL) — one machine-applicable fix, so
// `fix` always rewrites this source.
const OFF_WALL = `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Room"
  door id=d at (2500,9000) width 900 wall exterior
}`;

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-fix-"));
  file = join(dir, "broken.arch");
  writeFileSync(file, OFF_WALL, "utf8");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("arch fix — safe retries (--backup / diff preview)", () => {
  it("`--backup` keeps the original bytes in <file>.bak and still fixes the file", () => {
    const r = run(["fix", file, "--backup"]);
    expect(r.status).toBe(0);

    const bak = `${file}.bak`;
    expect(existsSync(bak)).toBe(true);
    expect(readFileSync(bak, "utf8")).toBe(OFF_WALL);

    const fixed = readFileSync(file, "utf8");
    expect(fixed).not.toBe(OFF_WALL);
    expect(fixed).toContain("door id=d on w1 at");
    expect(r.stderr).toContain("backup: ");
  }, 30000);

  it("without `--backup` no .bak file is created (no litter)", () => {
    const r = run(["fix", file]);
    expect(r.status).toBe(0);
    expect(readFileSync(file, "utf8")).not.toBe(OFF_WALL); // it did rewrite
    expect(existsSync(`${file}.bak`)).toBe(false);
  }, 30000);

  it("`--dry-run` prints the unified diff on stderr and leaves the file byte-identical", () => {
    const r = run(["fix", file, "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("@@");
    expect(r.stderr).toContain("-  door id=d at (2500,9000) width 900 wall exterior");
    expect(r.stderr).toContain("+  door id=d on w1 at");
    expect(r.stderr).toContain("(dry run — nothing written)");

    expect(readFileSync(file, "utf8")).toBe(OFF_WALL);
    expect(existsSync(`${file}.bak`)).toBe(false);
  }, 30000);

  it("`--json` carries wrote/target/diff (+ backup with --backup)", () => {
    const r = run(["fix", file, "--backup", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.wrote).toBe(true);
    expect(j.target).toBe(file);
    expect(j.backup).toBe(`${file}.bak`);
    expect(j.diff).toContain("@@");
    expect(j.diff).toContain("+  door id=d on w1 at");
    // Append-only: the pre-existing fields are untouched.
    expect(j.passes).toBe(1);
    expect(j.applied[0].code).toBe("W_DOOR_OFF_WALL");
  }, 30000);

  it("`--dry-run --json` reports wrote:false with the diff it would have written", () => {
    const r = run(["fix", file, "--dry-run", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.wrote).toBe(false);
    expect(j.target).toBe(file);
    expect(j.backup).toBeUndefined();
    expect(j.diff).toContain("@@");
    expect(readFileSync(file, "utf8")).toBe(OFF_WALL);
  }, 30000);

  it("an already-clean plan writes nothing, backs up nothing, and emits no diff", () => {
    const clean = join(dir, "clean.arch");
    const src = 'plan "C" { units mm room at (0,0) size 4000x3000 label "R" }';
    writeFileSync(clean, src, "utf8");

    const r = run(["fix", clean, "--backup", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.wrote).toBe(false);
    expect(j.diff).toBeUndefined();
    expect(j.backup).toBeUndefined();
    expect(existsSync(`${clean}.bak`)).toBe(false);
    expect(readFileSync(clean, "utf8")).toBe(src);
  }, 30000);
});
