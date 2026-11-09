/**
 * The one way a test runs the `archlang` CLI.
 *
 * - {@link runArch} runs it IN-PROCESS: `runCli` (`src/cli/run.ts`, the same parse + dispatch the
 *   `archlang` binary runs) over a {@link CliIo} whose writers capture. No child process, no tsx
 *   transpile of `src/` per call (about 2 s each), and v8 coverage sees the commands it drives.
 *   Use it for every test of what the CLI prints, writes or exits with.
 * - {@link spawnArch} runs the real binary as a child process (`node --import tsx src/cli.ts`).
 *   Use it only for what a function call cannot show: the process itself — how it exits
 *   (`exitFlushed`, pipe draining), a resident command (`watch`), signals, real stdio.
 *
 * Both return what the old copy-pasted `spawnSync` runner returned: `{ status, stdout, stderr }`,
 * stdout and stderr decoded as UTF-8 from the whole byte stream.
 *
 * `test/no-cli-spawn.test.ts` keeps any other test file from spawning the CLI itself.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type CliIo, type CommandResult, RESIDENT } from "../../src/cli/io.js";
import { runCli } from "../../src/cli/run.js";

/** What a CLI run hands back: the exit code (`null` only for a spawned child killed by a signal) and both streams. */
export interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface CliRunOptions {
  /** Standard input, for the `-` input operand. Absent: an empty stdin, as `spawnSync` gives. */
  input?: string;
  /** The working directory the run resolves relative paths against. Absent: the current one. */
  cwd?: string;
  /** Extra environment variables, over `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The CLI entry and the tsx loader as absolute paths, so a spawn works from any `cwd`. */
const CLI = resolve(REPO, "src/cli.ts");
const TSX = pathToFileURL(createRequire(resolve(REPO, "package.json")).resolve("tsx")).href;

/**
 * Run `archlang <args…>` in-process. Writes are collected as bytes and decoded once at the end,
 * so a multi-byte character split across writes decodes as it does from a pipe.
 *
 * `cwd` changes the process directory for the run and restores it after: the commands resolve
 * relative paths through Node's file system, which reads the process directory (vitest's default
 * `forks` pool allows `process.chdir`). A throw the CLI does not catch becomes what the process
 * would show: the error on stderr and status 1.
 */
export async function runArch(args: readonly string[], opts: CliRunOptions = {}): Promise<CliRun> {
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  const sink = (to: Buffer[]): CliIo["stdout"] => ({
    write: (chunk) => {
      to.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
    },
  });
  const io: CliIo = {
    stdout: sink(out),
    stderr: sink(err),
    readStdin: () => Buffer.from(opts.input ?? "", "utf8"),
    cwd: () => process.cwd(),
    env: { ...process.env, ...opts.env },
  };
  const home = process.cwd();
  if (opts.cwd !== undefined) process.chdir(opts.cwd);
  let result: CommandResult;
  try {
    result = await runCli(args, io);
  } catch (e) {
    err.push(Buffer.from(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`, "utf8"));
    result = 1;
  } finally {
    if (opts.cwd !== undefined) process.chdir(home);
  }
  if (result === RESIDENT) {
    throw new Error(`runArch: \`${args.join(" ")}\` stayed resident (a watcher is now running); use spawnArch`);
  }
  return { status: result, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") };
}

/** Run `archlang <args…>` as a child process, synchronously: the real binary, exit and all. */
export function spawnArch(args: readonly string[], opts: CliRunOptions & { timeout?: number } = {}): CliRun {
  const r = spawnSync(process.execPath, ["--import", TSX, CLI, ...args], {
    input: opts.input,
    encoding: "utf8",
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
    timeout: opts.timeout,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The `node` argv that runs the CLI from any directory, for a test that must drive the child itself (async `spawn`). */
export const ARCH_ARGV: readonly string[] = ["--import", TSX, CLI];
