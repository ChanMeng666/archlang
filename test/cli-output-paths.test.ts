/**
 * Where `-o` writes (checker-reach CR2 group A).
 *
 * `batch -o <dir>` has always created a missing directory (`test/cli-batch.test.ts`); every
 * other `-o <file>` writer failed with a raw `ENOENT` instead. They now behave like `batch`:
 * the parent directory is created, and a path that cannot be one is one clear IO error.
 * `batch -o` used to write two inputs that share a file name onto one output, the second
 * silently replacing the first; that is now a usage error before anything is written.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const PLAN = 'plan "P" { units mm room at (0,0) size 3000x3000 label "R" }\n';
// A door floating off its wall (W_DOOR_OFF_WALL): one machine-applicable fix, so `fix` writes
// (the plan `test/cli-fix-backup.test.ts` uses); `repair` and `finish` write whatever they get.
const FIXABLE = `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Room"
  door id=d at (2500,9000) width 900 wall exterior
}
`;

describe("-o <file> creates its directory, as batch -o does", () => {
  it("compile writes into a directory that does not exist, however deep", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const out = join(root, "not", "yet", "x.svg");
    const r = run(["compile", "examples/studio.arch", "-o", out, "--json"]);
    expect(r.stderr).not.toContain("ENOENT");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).output).toBe(out);
    expect(readFileSync(out, "utf8").startsWith("<svg")).toBe(true);
  }, 60000);

  it("compile of a multi-storey plan writes every storey into the new directory", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const dir = join(root, "sheets");
    const r = run(["compile", "examples/townhouse.arch", "-o", join(dir, "t.svg"), "--json"]);
    expect(r.status).toBe(0);
    const outputs: string[] = JSON.parse(r.stdout).outputs;
    expect(outputs.length).toBeGreaterThan(1);
    for (const o of outputs) expect(existsSync(o)).toBe(true);
    expect(readdirSync(dir).length).toBe(outputs.length);
  }, 60000);

  it("compile --error-svg writes its error card into a new directory and keeps exit 2", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const bad = join(root, "bad.arch");
    writeFileSync(bad, 'plan "B" { units mm room at (0,0) size 0x3000 }\n');
    const out = join(root, "cards", "bad.svg");
    const r = run(["compile", bad, "--error-svg", "-o", out]);
    expect(r.status).toBe(2);
    expect(existsSync(out)).toBe(true);
  }, 60000);

  it("a plan that does not compile leaves no directory behind", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const bad = join(root, "bad.arch");
    writeFileSync(bad, 'plan "B" { units mm room at (0,0) size 0x3000 }\n');
    const r = run(["compile", bad, "-o", join(root, "out", "bad.svg")]);
    expect(r.status).toBe(2);
    expect(existsSync(join(root, "out"))).toBe(false);
  }, 60000);

  it("a file where the directory should be is one clear IO error (exit 1), never a raw errno line", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const taken = join(root, "taken");
    writeFileSync(taken, "a file\n");
    const r = run(["compile", "examples/studio.arch", "-o", join(taken, "x.svg")]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`cannot create the output directory ${taken}`);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
  }, 60000);

  it("repair, fix and finish -o write into a new directory", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const src = join(root, "p.arch");
    writeFileSync(src, FIXABLE);
    for (const cmd of ["repair", "fix", "finish"]) {
      const out = join(root, cmd, "deep", "p.arch");
      const r = run([cmd, src, "-o", out]);
      expect(r.stderr, cmd).not.toContain("ENOENT");
      expect(r.status, cmd).toBe(0);
      expect(existsSync(out), cmd).toBe(true);
    }
  }, 120000);

  it("md -o writes the rewritten Markdown and its images into a new directory", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const md = join(root, "doc.md");
    writeFileSync(md, "# Doc\n\n```arch\n" + PLAN + "```\n");
    const out = join(root, "site", "doc.md");
    const r = run(["md", md, "-o", out, "--json"]);
    expect(r.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(root, "site", "doc-1.svg"))).toBe(true);
  }, 60000);

  it("new -o writes the starter into a new directory", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const out = join(root, "plans", "start.arch");
    const r = run(["new", "-o", out]);
    expect(r.status).toBe(0);
    expect(existsSync(out)).toBe(true);
  }, 60000);
});

describe("-o names a file: a directory there, or a trailing separator, is one clear line", () => {
  it("compile -o <an existing directory> is an IO error (exit 1) that says so, never a raw EISDIR", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const r = run(["compile", "examples/studio.arch", "-o", root]);
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain("EISDIR");
    expect(r.stderr).toContain(`cannot write ${root}: it is a directory`);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
  }, 60000);

  it("batch: a directory where an output file would go is that input's IO error, never a raw EISDIR", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-batch-"));
    mkdirSync(join(root, "out", "studio.svg"), { recursive: true });
    const r = run(["batch", "examples/studio.arch", "-o", join(root, "out")]);
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain("EISDIR");
    expect(r.stderr).toContain(`cannot write ${join(root, "out", "studio.svg")}: it is a directory`);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
  }, 60000);

  it("-o dir/ is refused (exit 1) and writes nothing, where it used to write a FILE named dir", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-out-"));
    const src = join(root, "p.arch");
    writeFileSync(src, FIXABLE);
    const md = join(root, "doc.md");
    writeFileSync(md, "# Doc\n\n```arch\n" + PLAN + "```\n");
    const cases: string[][] = [
      ["compile", "examples/studio.arch"],
      ["compile", "examples/townhouse.arch"], // multi-storey: would derive `<dir>/.L1`-style names
      ["fix", src],
      ["md", md],
    ];
    for (const [cmd, input] of cases) {
      const out = `${join(root, `${cmd}-out`)}/`;
      const r = run([cmd!, input!, "-o", out]);
      expect(r.status, `${cmd} ${input}`).toBe(1);
      expect(r.stderr, `${cmd} ${input}`).toContain(
        "ends in a path separator, so it names a directory, and -o names a file",
      );
      expect(existsSync(join(root, `${cmd}-out`)), `${cmd} ${input}`).toBe(false);
    }
    // batch's -o IS a directory: a trailing separator there is fine.
    const b = run(["batch", "examples/studio.arch", "-o", `${join(root, "batch-out")}/`]);
    expect(b.status).toBe(0);
    expect(existsSync(join(root, "batch-out", "studio.svg"))).toBe(true);
  }, 120000);
});

describe("batch -o never writes two inputs onto one file", () => {
  it("two inputs with the same file name are a usage error, and nothing is written", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-batch-clash-"));
    for (const d of ["a", "b"]) {
      mkdirSync(join(root, d));
      writeFileSync(join(root, d, "plan.arch"), PLAN);
    }
    const out = join(root, "out");
    const r = run(["batch", join(root, "a", "plan.arch"), join(root, "b", "plan.arch"), "-o", out]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain(join(root, "a", "plan.arch"));
    expect(r.stderr).toContain(join(root, "b", "plan.arch"));
    expect(r.stderr).toContain(join(out, "plan.svg"));
    expect(existsSync(out)).toBe(false);
  }, 60000);

  it("names that differ only by case clash too (one file on a case-insensitive filesystem)", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-batch-clash-"));
    mkdirSync(join(root, "a"));
    mkdirSync(join(root, "b"));
    writeFileSync(join(root, "a", "Plan.arch"), PLAN);
    writeFileSync(join(root, "b", "plan.arch"), PLAN);
    const out = join(root, "out");
    const r = run(["batch", join(root, "a", "Plan.arch"), join(root, "b", "plan.arch"), "-o", out]);
    expect(r.status).toBe(3);
    expect(existsSync(out)).toBe(false);
  }, 60000);

  it("the same input given twice is refused the same way, with or without -o", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-batch-clash-"));
    const p = join(root, "p.arch");
    writeFileSync(p, PLAN);
    const r = run(["batch", p, p]);
    expect(r.status).toBe(3);
    expect(existsSync(join(root, "p.svg"))).toBe(false);
  }, 60000);

  it("the control: distinct names in one directory still render", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-batch-clash-"));
    const r = run(["batch", "examples/studio.arch", "examples/two-bed.arch", "-o", join(root, "out"), "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).results).toHaveLength(2);
  }, 60000);
});
