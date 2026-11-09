import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The CLI reaches its process only through the `CliIo` it is handed (`src/cli/io.ts`):
 * `io.stdout`/`io.stderr` for output, `io.readStdin()` for the `-` input, `io.env` and `io.cwd()`
 * for the environment. That seam is what lets `runCli` (`src/cli/run.ts`) run in-process under
 * `test/helpers/cli.ts`: one direct `process.stdout.write` in a command or a write helper
 * (`emitJson`, `usageError`, `ioError`, `emitDiagnosticsHuman`, `staleSource`, …) would print past
 * the capture, and one `process.exit` would end the test runner.
 *
 * Every module in `src/cli/` (`.ts`, `.mjs`) is scanned. The uses that must stay are listed below,
 * each by file, the top-level function it sits in, the exact uses, and why; anything else fails,
 * and so does an entry nothing matches any more. `src/cli.ts` (the process entry, `exitFlushed`) is outside
 * `src/cli/` and is the one place the process is ended.
 */
const ALLOWED: { file: string; symbol: string; uses: string[]; reason: string }[] = [
  {
    file: "io.ts",
    symbol: "nodeIo",
    uses: ["process.stdout", "process.stderr", "readFileSync(0", "process.cwd", "process.env"],
    reason: "the real process as a CliIo: the one adapter every other module writes through",
  },
  {
    file: "io.ts",
    symbol: "makeNodeWorld",
    uses: ["process.cwd"],
    reason:
      "the default import root of a World that tests and scripts build with no CliIo; runArch keeps the process directory equal to io.cwd()",
  },
  {
    file: "serialize.ts",
    symbol: "autoInstall",
    uses: ["process.stderr"],
    reason: "the --install banner sits beside the installer's own output, which inherits the real stdio",
  },
];

const CLI_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src", "cli");
const FILES = readdirSync(CLI_DIR)
  .filter((f) => /\.(?:ts|mjs)$/.test(f) && !f.endsWith(".d.ts"))
  .sort();

const FORBIDDEN = /\bprocess\.(?:stdout|stderr|stdin|exitCode|exit|env|cwd|chdir|argv)\b|readFileSync\(\s*0\b/g;
const DECL = /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+))/gm;

/** `src` without its comments, so a doc comment that names `process.exit` is not a use of it. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Each forbidden use in `src`, with the top-level declaration it sits in. */
function uses(src: string): { symbol: string; use: string }[] {
  const text = code(src);
  const decls = [...text.matchAll(DECL)].map((m) => ({ at: m.index, name: m[1] ?? m[2]! }));
  return [...text.matchAll(FORBIDDEN)].map((m) => {
    const owner = decls.filter((d) => d.at <= m.index).at(-1);
    return { symbol: owner?.name ?? "<module>", use: m[0].replace(/\s+/g, "") };
  });
}

describe("the CLI writes through CliIo", () => {
  const found = FILES.flatMap((file) => uses(readFileSync(join(CLI_DIR, file), "utf8")).map((u) => ({ file, ...u })));
  const allowed = (f: { file: string; symbol: string; use: string }): boolean =>
    ALLOWED.some((a) => a.file === f.file && a.symbol === f.symbol && a.uses.includes(f.use));

  it("scans every module in src/cli, the write helpers' among them", () => {
    expect(FILES).toEqual(expect.arrayContaining(["io.ts", "run.ts", "serialize.ts", "source-hash.ts"]));
    expect(FILES.filter((f) => f.startsWith("commands-")).length).toBeGreaterThanOrEqual(6);
  });

  it("no module touches process.stdout/stderr/stdin/exit/env/cwd outside the allow-list", () => {
    const bad = found.filter((f) => !allowed(f)).map((f) => `src/cli/${f.file} ${f.symbol}(): ${f.use}`);
    expect(
      bad,
      "go through the `io` (CliIo, src/cli/io.ts) the command was handed; only nodeIo() and the --install banner touch the process",
    ).toEqual([]);
  });

  it("every allow-list entry is still used (no stale entry)", () => {
    const stale = ALLOWED.flatMap((a) =>
      a.uses
        .filter((u) => !found.some((f) => f.file === a.file && f.symbol === a.symbol && f.use === u))
        .map((u) => `src/cli/${a.file} ${a.symbol}(): ${u}`),
    );
    expect(stale, "drop these from ALLOWED").toEqual([]);
  });

  it("the check sees a use, names the function it is in, and skips comments", () => {
    expect(uses('export function emitJson(io: CliIo) {\n  process.stdout.write("x");\n}')).toEqual([
      { symbol: "emitJson", use: "process.stdout" },
    ]);
    expect(uses('function f() {\n  const s = readFileSync(0, "utf8");\n  process.exit(1);\n}')).toEqual([
      { symbol: "f", use: "readFileSync(0" },
      { symbol: "f", use: "process.exit" },
    ]);
    expect(uses("// `process.exit(await cmdX(args))`\n/** process.stderr */\nio.stderr.write(x);")).toEqual([]);
  });
});
