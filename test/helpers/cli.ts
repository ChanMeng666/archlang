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
 * `test/no-cli-spawn.test.ts` keeps any other test file from spawning the CLI itself, and lists
 * the files that use {@link spawnArch} or {@link ARCH_ARGV} with the reason each needs a process.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach } from "vitest";
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
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The CLI entry and the tsx loader as absolute paths, so a spawn works from any `cwd`. */
const CLI = resolve(REPO, "src/cli.ts");
const TSX = pathToFileURL(createRequire(resolve(REPO, "package.json")).resolve("tsx")).href;

/** The `node` argv that runs the CLI from any directory, for a test that must drive the child itself (async `spawn`). */
export const ARCH_ARGV: readonly string[] = ["--import", TSX, CLI];

/** The process directory this test file started in, which every run returns to. */
const HOME = process.cwd();

/**
 * Put the process directory back where the test file started. {@link runArch} restores it when a
 * run ends; a run a test timeout abandoned has not ended, so this module also calls it after
 * every test (the `afterEach` below), and the next test never starts in a stray directory.
 */
export function restoreCwd(): void {
  if (process.cwd() !== HOME) process.chdir(HOME);
}
afterEach(restoreCwd);

/**
 * Run `archlang <args…>` in-process. Writes are collected as bytes and decoded once at the end,
 * so a multi-byte character split across writes decodes as it does from a pipe.
 *
 * `cwd` changes the process directory for the run and restores it after. `io.cwd()` alone cannot
 * stand in for it: the commands hand relative paths (`-o out.svg`, the input) to Node's file
 * system, which resolves them against the process directory (vitest's default `forks` pool allows
 * `process.chdir`). A throw the CLI does not catch becomes what the process would show: the error
 * on stderr and status 1. The environment is the test process's own.
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
    env: process.env,
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

/**
 * Run `archlang <args…>` as a child process, synchronously: the real binary, exit and all. With a
 * `timeout`, a child that does not exit in time is killed and comes back with `status: null` and
 * the `signal` that ended it.
 */
export function spawnArch(
  args: readonly string[],
  opts: CliRunOptions & { timeout?: number } = {},
): CliRun & { signal: NodeJS.Signals | null } {
  const r = spawnSync(process.execPath, [...ARCH_ARGV, ...args], {
    input: opts.input,
    encoding: "utf8",
    cwd: opts.cwd ?? process.cwd(),
    timeout: opts.timeout,
  });
  return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr };
}
