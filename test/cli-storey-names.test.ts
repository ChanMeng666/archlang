/**
 * The two small CLI items of issue #405: `{level}` in `-o` and `--flag=value`.
 *
 * `parseArgs` is asked in process. The file names are asked of the real binary, on a two-storey example.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { levelTarget, parseArgs, storeyTarget } from "../src/cli/io.js";
import { buildManifest } from "../src/manifest.js";

const commands = buildManifest("0.0.0").commands;
const compileCommand = commands.find((c) => c.name === "compile")!;
const contextCommand = commands.find((c) => c.name === "context")!;

const run = (args: string[]): number | null =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" }).status;

function scratch(): { dir: string; plan: string } {
  const dir = mkdtempSync(join(tmpdir(), "archlang-storeys-"));
  const plan = join(dir, "house.arch");
  copyFileSync("examples/two-storey.arch", plan);
  return { dir, plan };
}

suite("`--flag=value`", () => {
  it("reads the value out of the one word", () => {
    const a = parseArgs(["p.arch", "--level=-1"], compileCommand);
    expect(a.level).toBe(-1);
    expect(a.unknownFlags).toBeUndefined();
    expect(a._).toEqual(["p.arch"]);
    expect(parseArgs(["p.arch", "--out=a=b.svg"], compileCommand).o).toBe("a=b.svg");
  });

  it("reads as the two-word spelling, a per-command flag included", () => {
    expect(parseArgs(["--level=2"], compileCommand).level).toBe(parseArgs(["--level", "2"], compileCommand).level);
    expect(parseArgs(["--level=starter"], contextCommand).contextLevel).toBe("starter");
  });

  it("an empty value is the empty string, not the next word", () => {
    const a = parseArgs(["--out=", "p.arch"], compileCommand);
    expect(a.o).toBe("");
    expect(a._).toEqual(["p.arch"]);
  });

  it("a boolean flag has no value to give, and an unknown flag stays unknown", () => {
    expect(parseArgs(["--json=true"], compileCommand).unknownFlags).toEqual(["--json=true"]);
    expect(parseArgs(["--nope=1"], compileCommand).unknownFlags).toEqual(["--nope=1"]);
  });

  it("an empty value on a number flag is a usage error, in either spelling, and no storey 0", () => {
    for (const argv of [["--level="], ["--level", ""], ["--level= "], ["--width="]]) {
      const a = parseArgs(["p.arch", ...argv], compileCommand);
      expect(a.level, argv.join(" ")).toBeUndefined();
      expect(a.unknownFlags?.length, argv.join(" ")).toBe(1);
    }
    const { dir, plan } = scratch();
    expect(run(["compile", plan, "--level=", "-o", join(dir, "one.svg")])).toBe(3);
    expect(readdirSync(dir)).toEqual(["house.arch"]);
  });

  it("is usable on the command line", () => {
    const { dir, plan } = scratch();
    expect(run(["compile", plan, "--level=1", `--out=${join(dir, "one.svg")}`])).toBe(0);
    expect(readdirSync(dir)).toContain("one.svg");
  });
});

suite("`{level}` in `-o`", () => {
  it("fills the word in, every time it appears, with a negative level as written", () => {
    expect(storeyTarget("plan-{level}.svg", 2)).toBe("plan-2.svg");
    expect(storeyTarget("out/{level}/plan-{level}.svg", -1)).toBe("out/-1/plan--1.svg");
  });

  it("leaves a target without the word to the `.L<n>` suffix", () => {
    for (const t of ["plan.svg", "out/house.svg", "noext", "a.b/plan"]) {
      expect(storeyTarget(t, 3)).toBe(levelTarget(t, 3));
    }
  });

  it("writes one file a storey", () => {
    const { dir, plan } = scratch();
    expect(run(["compile", plan, "-o", join(dir, "storey-{level}.svg")])).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["house.arch", "storey-1.svg", "storey-2.svg"]);
  });

  it("fills in the one storey `--level` picks", () => {
    const { dir, plan } = scratch();
    expect(run(["compile", plan, "--level", "2", "-o", join(dir, "s{level}.svg")])).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["house.arch", "s2.svg"]);
  });

  it("is refused on a plan with no storey, and writes nothing", () => {
    const { dir } = scratch();
    const one = join(dir, "one.arch");
    copyFileSync("examples/studio.arch", one);
    expect(run(["compile", one, "-o", join(dir, "s{level}.svg")])).toBe(3);
    expect(readdirSync(dir).sort()).toEqual(["house.arch", "one.arch"]);
  });

  it("a plain target with `--level` stays the plain target", () => {
    const { dir, plan } = scratch();
    expect(run(["compile", plan, "--level", "2", "-o", join(dir, "upper.svg")])).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["house.arch", "upper.svg"]);
  });
});
