import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `arch finish` at the process boundary. It follows `arch fix`'s write conventions
 * (`test/cli-fix-backup.test.ts`): in place by default, a unified diff on stderr,
 * `--dry-run` writes nothing, `--backup` keeps the original, `-o` redirects, exit 0 / 2 / 3.
 * What `finish()` decides is pinned in `test/finish.test.ts`; this file pins the plumbing.
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

const BARE = `plan "Bare" {
  units mm
  north up
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room" uses living
  door id=d on w at 60% width 900 swing in
  window id=win on w at 10% width 1500
}
`;

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-finish-"));
  file = join(dir, "bare.arch");
  writeFileSync(file, BARE, "utf8");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("arch finish — the write boundary", () => {
  it("rewrites the input in place, prints the diff and the change log on stderr, exits 0", () => {
    const r = run(["finish", file]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    const out = readFileSync(file, "utf8");
    expect(out).toContain("  paper A4 landscape\n  scale 1:50\n  dims auto all\n  schedule rooms\n  legend\n");
    expect(out).toContain(`  title { project "Bare" }\n}\n`);
    expect(r.stderr).toContain("+  paper A4 landscape");
    expect(r.stderr).toContain("added scale 1:50");
    expect(existsSync(`${file}.bak`)).toBe(false);

    // …and a second run is a no-op that says so.
    const again = run(["finish", file]);
    expect(again.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(out);
    expect(again.stderr).toContain("(no changes)");
  }, 60000);

  it("`--dry-run` writes nothing and still shows the diff", () => {
    const r = run(["finish", file, "--dry-run"]);
    expect(r.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(BARE);
    expect(r.stderr).toContain("+  legend");
    expect(r.stderr).toContain("(dry run — nothing written)");
  }, 30000);

  it("`--dry-run --json` is the same preview as data", () => {
    const r = run(["finish", file, "--dry-run", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j).toMatchObject({ ok: true, changed: true, wrote: false, target: file, unresolved: [] });
    const sheet = j.changes.filter((c: { stage: string }) => c.stage === "sheet");
    expect(j.changes.length).toBeGreaterThan(sheet.length);
    expect(sheet.map((c: { statement: string }) => c.statement)).toEqual([
      "paper",
      "scale",
      "dims",
      "schedule",
      "legend",
      "title",
    ]);
    expect(j.diff).toContain("+  schedule rooms");
    expect(j.source).toContain("paper A4 landscape");
    expect(readFileSync(file, "utf8")).toBe(BARE);
  }, 30000);

  it("`--backup` keeps the original bytes in <file>.bak", () => {
    const r = run(["finish", file, "--backup", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ wrote: true, backup: `${file}.bak` });
    expect(readFileSync(`${file}.bak`, "utf8")).toBe(BARE);
    expect(readFileSync(file, "utf8")).not.toBe(BARE);
  }, 30000);

  it("`-o` writes the finished source elsewhere and leaves the input untouched", () => {
    const out = join(dir, "issued.arch");
    const r = run(["finish", file, "-o", out]);
    expect(r.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(BARE);
    expect(readFileSync(out, "utf8")).toContain("schedule rooms");
  }, 30000);

  it("stdin streams the finished source to stdout", () => {
    const r = run(["finish", "-"], BARE);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`title { project "Bare" }`);
    expect(r.stdout.startsWith(`plan "Bare" {`)).toBe(true);
  }, 30000);

  it("`--reissue` replaces a paper the drawing does not fit", () => {
    const tight = BARE.replace("  north up\n", "  paper A4\n  scale 1:10\n  north up\n");
    writeFileSync(file, tight, "utf8");
    const kept = JSON.parse(run(["finish", file, "--only", "sheet", "--dry-run", "--json"]).stdout);
    expect(kept.changed).toBe(false);
    expect(kept.unresolved[0].reason).toContain("--reissue");
    const r = JSON.parse(run(["finish", file, "--reissue", "--json"]).stdout);
    expect(
      r.changes.some((c: { kind: string; statement: string }) => c.kind === "replaced" && c.statement === "paper"),
    ).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("scale 1:10");
  }, 60000);
});

describe("arch finish — exit codes", () => {
  it("a plan that does not compile is left untouched and exits 2", () => {
    const broken = `plan "X" {\n  units mm\n  room at (0,0) size\n}\n`;
    writeFileSync(file, broken, "utf8");
    const r = run(["finish", file, "--json"]);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j).toMatchObject({ ok: false, changed: false, wrote: false, changes: [] });
    expect(j.diagnostics.length).toBeGreaterThan(0);
    expect(readFileSync(file, "utf8")).toBe(broken);
  }, 30000);

  it("`--only furnish` runs the furnish stage and writes no sheet statement", () => {
    const r = run(["finish", file, "--only", "furnish", "--dry-run", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.changed).toBe(true);
    expect(j.changes.every((c: { stage: string; statement: string }) => c.stage === "furnish")).toBe(true);
    expect(j.diff).toContain("+  furniture sofa in r anchor");
    expect(j.source).not.toContain("paper");
    expect(readFileSync(file, "utf8")).toBe(BARE);
  }, 30000);

  it("an unknown stage is a usage error with a did-you-mean", () => {
    const r = run(["finish", file, "--only", "shet"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain(`did you mean "sheet"?`);
  }, 30000);

  it("`--only sheet` runs the sheet stage", () => {
    const r = run(["finish", file, "--only", "sheet", "--dry-run", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).changed).toBe(true);
  }, 30000);

  it("a missing input and an undeclared flag are usage errors", () => {
    expect(run(["finish"]).status).toBe(3);
    const r = run(["finish", file, "--unsafe"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain(`unknown flag "--unsafe"`);
  }, 30000);

  it("an unreadable input is an IO error (exit 1)", () => {
    expect(run(["finish", join(dir, "nope.arch")]).status).toBe(1);
  }, 30000);
});
