/** no test spawns the CLI unless it is about the process. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A test runs the CLI in-process with `runArch` (`test/helpers/cli.ts`), never as a child process,
 * unless what it proves is the process itself.
 *
 * `runArch` costs a function call, where a spawn costs about 2 s of tsx transpiling `src/` (40
 * files spawning it once took a fifth of the suite's time), and v8 coverage never sees a child
 * process, so the commands read as untested however well they were. The files below start a CLI
 * process, through `spawnArch`/`ARCH_ARGV` or a spawn of their own, and each says why.
 */
const ALLOWED: Record<string, string> = {
  "test/cli-flush.test.ts": "pipe truncation: a slow reader on a real pipe, against `exitFlushed`",
  "test/cli-commands.test.ts":
    "`watch`: only a live process can stay alive and be signalled, and a refused `watch` must exit it",
  "test/cli-expected-hash.test.ts": "exit code 4 from the stale-source guard reaching the real process",
  "test/cli-plan-json-roundtrip.test.ts":
    "a real stdin pipe between two processes (`-f json -o -` into `--from-json -`)",
};

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HELPER = "test/helpers/cli.ts";
/** This file names the patterns it looks for. */
const SELF = "test/no-cli-spawn.test.ts";

/** Every `.ts` file under `test/`, as a forward-slash path from the repository root. */
function testFiles(dir = join(ROOT, "test")): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : testFiles(p);
    return f.endsWith(".ts") ? [relative(ROOT, p).replace(/\\/g, "/")] : [];
  });
}

const CHILD_CALL = /(?<![\w.$])(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\(/;
/** The CLI's entry, as source, as the built binary, or as the helper's argv. */
const CLI_ENTRY = /src\/cli\.ts|dist\/cli\.js|\bARCH_ARGV\b/;

/** Does `src` start a CLI process: the helper's `spawnArch`, or a child-process call naming the CLI? */
const spawnsCli = (src: string): boolean =>
  /(?<![\w.$])spawnArch\s*\(/.test(src) || (CHILD_CALL.test(src) && CLI_ENTRY.test(src));

describe("no test spawns the CLI unless it is about the process", () => {
  const files = testFiles();

  it("finds the test tree (the guard is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(HELPER);
  });

  it("only the allow-listed files start a CLI process; the rest use runArch", () => {
    const offenders = files.filter(
      (f) => f !== HELPER && f !== SELF && !(f in ALLOWED) && spawnsCli(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(
      offenders,
      `these files start a CLI process: run it with runArch from ${HELPER}, or, for a case about the process itself, add the file to ALLOWED with the reason`,
    ).toEqual([]);
  });

  it("every allow-listed file still starts one (no stale entry)", () => {
    const stale = Object.keys(ALLOWED).filter((f) => !spawnsCli(readFileSync(join(ROOT, f), "utf8")));
    expect(stale, "drop these from ALLOWED: they no longer start a CLI process").toEqual([]);
  });

  it("the check sees each way of starting one, and not an in-process run", () => {
    expect(spawnsCli('spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args])')).toBe(true);
    expect(spawnsCli('execFileSync(process.execPath, ["dist/cli.js", "lint"])')).toBe(true);
    expect(spawnsCli("spawn(process.execPath, [...ARCH_ARGV, ...args])")).toBe(true);
    expect(spawnsCli('const r = spawnArch(["watch"], { timeout: 30_000 });')).toBe(true);
    expect(spawnsCli('const r = await runArch(["lint", "examples/studio.arch"]);')).toBe(false);
    expect(spawnsCli('const m = /x/.exec("src/cli.ts");')).toBe(false);
  });
});
