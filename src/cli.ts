#!/usr/bin/env node
/**
 * ArchLang CLI — agent-native.
 *
 * Every command takes `--json`: structured result to **stdout**, human messages to
 * **stderr**, so an AI agent pipes stdout straight into a parser. Exit codes are
 * deterministic — `0` ok · `2` user-source error (don't blindly retry) · `1`
 * internal/IO · `3` bad usage — and every JSON diagnostic carries the catalog `fix`,
 * so the self-correction loop needs no docs lookup. Source can come from a file or
 * from stdin (`-`), and artifacts can go to stdout (`-o -`) — but not together with
 * `--json`, whose envelope owns stdout: that combination is a usage error (exit 3),
 * never a quiet redirect to a file the caller never named.
 *
 * Verbs:
 *   compile   render a plan to SVG/DXF/PDF/PNG
 *   watch     recompile on save (human/interactive)
 *   validate  parse + resolve + lint, no render (is it valid & sound?)
 *   describe  semantic facts: rooms, areas, adjacency, what doors connect
 *   lint      architectural soundness warnings
 *   fmt       canonical formatting
 *   finish    add the sheet statements a plan lacks
 *   reroll    offer a proven-equivalent `for` loop for a repeated statement run
 *   impact    change one number: what moved and why, what held, what broke
 *   takeoff   geometric quantities, CSV or Markdown
 *   spec      print the one-prompt language spec (spec.llm.md)
 *   new       scaffold a starter .arch
 *   explain   look up an error code
 *   link      print a playground URL that opens the plan
 *   import    convert an OpenPlan3D plan (JSON) to .arch source + a report
 *
 * This file is the process entry point: it runs `runCli` (`src/cli/run.ts`, the argument parse +
 * dispatch) on the real process and exits through `exitFlushed`; the commands themselves (and
 * their shared IO/render helpers) live in `src/cli/`. Node APIs and real time
 * are allowed here and across `src/cli/`, the one place they are — everything else
 * in `src/` gets its environment via the `World` seam.
 */

import { type CommandResult, RESIDENT, nodeIo } from "./cli/io.js";
import { runCli } from "./cli/run.js";

/**
 * The single exit point for every dispatch arm of `runCli` (`src/cli/run.ts`).
 *
 * A command hands back either an exit code — in which case the process ends with it,
 * as it always has — or {@link RESIDENT}, meaning it installed a handle and now owns
 * the process (only `watch` does today). Routing EVERY arm through this, rather than
 * special-casing `watch` in its own arm, is the point: the hazard was never specific
 * to watching a file, it was `process.exit(await cmdX(args))` being unable to express
 * "this one does not return". Written this way, the next long-running command is
 * correct by returning `RESIDENT`, and cannot be broken by a dispatcher that has
 * forgotten it exists.
 *
 * Note what this does NOT do: it never falls off the end without exiting. A one-shot
 * command that returns a code still exits with it explicitly, so nothing depends on
 * the event loop happening to be empty — but only AFTER stdout and stderr have drained
 * ({@link exitFlushed}), because `process.exit` discards whatever a pipe has not yet
 * accepted.
 */
function finish(result: CommandResult): void {
  if (result === RESIDENT) return; // the command owns the process now; let it live.
  exitFlushed(result);
}

/**
 * End the process with `code` once everything already written to stdout/stderr has been
 * handed to the OS. A bare `process.exit()` right after `process.stdout.write(big)` truncates
 * the output on a pipe (Node 22 on Linux cut `context --json` at ~145 KB, and the cut moves
 * down as outputs grow): the write is asynchronous and `exit` does not wait for it. An empty
 * write queues behind the pending ones, so its callback fires exactly when they are done;
 * the no-op error listeners keep a closed reader (`| head`) from turning EPIPE into an
 * uncaught exception that would replace the documented exit code.
 */
function exitFlushed(code: number): void {
  let pending = 2;
  const done = (): void => {
    if (--pending === 0) process.exit(code);
  };
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", () => {});
    stream.write("", done);
  }
}

async function main(): Promise<void> {
  finish(await runCli(process.argv.slice(2), nodeIo()));
}

void main();
