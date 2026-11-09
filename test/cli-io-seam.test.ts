import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The CLI commands reach their process only through the `CliIo` they are handed
 * (`src/cli/io.ts`): `io.stdout`/`io.stderr` for output, `io.readStdin()` for the `-` input. That
 * seam is what lets `runCli` (`src/cli/run.ts`) run in-process under `test/helpers/cli.ts`; one
 * direct `process.stdout.write` in a command would print past the capture, and one
 * `process.exit` would end the test runner. Only `src/cli.ts` (the process entry, `exitFlushed`)
 * and `nodeIo()` in `src/cli/io.ts` touch the real streams.
 */
const CLI_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src", "cli");

/** The dispatch and every command module, read from disk so a new command is covered the day it lands. */
const SEAM_FILES = readdirSync(CLI_DIR)
  .filter((f) => f === "run.ts" || /^commands-.+\.ts$/.test(f))
  .sort();

const FORBIDDEN = /\bprocess\.(?:stdout|stderr|stdin|exit|exitCode)\b|readFileSync\(\s*0\b/g;

/** `src` without its comments, so a doc comment that names `process.exit` is not a use of it. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const uses = (src: string): string[] => [...code(src).matchAll(FORBIDDEN)].map((m) => m[0]);

describe("CLI commands write through CliIo", () => {
  it("covers the dispatch and the command modules", () => {
    expect(SEAM_FILES).toContain("run.ts");
    expect(SEAM_FILES.filter((f) => f.startsWith("commands-")).length).toBeGreaterThanOrEqual(6);
  });

  it("no command module touches process.stdout/stderr/stdin/exit", () => {
    const found = SEAM_FILES.flatMap((f) =>
      uses(readFileSync(join(CLI_DIR, f), "utf8")).map((u) => `src/cli/${f}: ${u}`),
    );
    expect(
      found,
      "write through the command's `io` (CliIo, src/cli/io.ts); only src/cli.ts and nodeIo() use the process",
    ).toEqual([]);
  });

  it("the check sees a use when there is one, and not one inside a comment", () => {
    expect(uses('  process.stdout.write("x");')).toEqual(["process.stdout"]);
    expect(uses('  const s = readFileSync(0, "utf8");\n  process.exit(1);')).toEqual([
      "readFileSync(0",
      "process.exit",
    ]);
    expect(uses("// `process.exit(await cmdX(args))`\n/** process.stderr */\nio.stderr.write(x);")).toEqual([]);
  });
});
