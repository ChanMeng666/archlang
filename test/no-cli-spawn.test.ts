import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A test runs the CLI through `test/helpers/cli.ts`, never by spawning `src/cli.ts` itself.
 *
 * `runArch` runs the CLI in-process: a call costs a function call, where a spawn costs about 2 s of
 * tsx transpiling `src/` (40 files spawning it once took a fifth of the suite's time), and v8
 * coverage never sees a child process, so the commands read as untested however well they were.
 * `spawnArch` is there for what only a process shows. The files below drive the child themselves
 * (async `spawn` with their own stream handling), and each says why.
 */
const ALLOWED: Record<string, string> = {
  "test/cli-flush.test.ts": "pipe truncation: a slow reader on a real pipe, against `exitFlushed`",
  "test/cli-commands.test.ts": "`watch` is resident: only a live process can stay alive and be signalled",
};

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HELPER = "test/helpers/cli.ts";
/** This file names the pattern it looks for. */
const SELF = "test/no-cli-spawn.test.ts";

/** Every `.ts` file under `test/`, as a forward-slash path from the repository root. */
function testFiles(dir = join(ROOT, "test")): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : testFiles(p);
    return f.endsWith(".ts") ? [relative(ROOT, p).replace(/\\/g, "/")] : [];
  });
}

/** Does `src` start a child process that runs the CLI entry? */
const spawnsCli = (src: string): boolean =>
  /(?<![\w.$])(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\(/.test(src) && /src\/cli\.ts/.test(src);

describe("no test spawns the CLI itself", () => {
  const files = testFiles();

  it("finds the test tree (the guard is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(HELPER);
  });

  it("only the allow-listed files spawn `src/cli.ts`; the rest use test/helpers/cli.ts", () => {
    const offenders = files.filter(
      (f) => f !== HELPER && f !== SELF && !(f in ALLOWED) && spawnsCli(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(
      offenders,
      `these files spawn src/cli.ts: run the CLI with runArch (or spawnArch, for a case about the process itself) from ${HELPER}`,
    ).toEqual([]);
  });

  it("every allow-listed file still spawns it (no stale entry)", () => {
    const stale = Object.keys(ALLOWED).filter((f) => !spawnsCli(readFileSync(join(ROOT, f), "utf8")));
    expect(stale, "drop these from ALLOWED: they no longer spawn the CLI").toEqual([]);
  });

  it("the check sees a spawn when there is one", () => {
    expect(spawnsCli('spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args])')).toBe(true);
    expect(spawnsCli('const r = runArch(["lint", "examples/studio.arch"]);')).toBe(false);
  });
});
