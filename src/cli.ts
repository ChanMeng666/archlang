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
 *
 * This file is the argument-parse + dispatch entry point; the commands themselves
 * (and their shared IO/render helpers) live in `src/cli/`. Node APIs and real time
 * are allowed here and across `src/cli/`, the one place they are — everything else
 * in `src/` gets its environment via the `World` seam.
 */

import {
  type CommandResult,
  EXIT,
  RESIDENT,
  VERSION,
  allowedFlags,
  parseArgs,
  usageError,
  usageErrorFor,
} from "./cli/io.js";
import { findCommand, renderCommandHelp, renderTopHelp } from "./cli/help.js";
import { buildManifest, CLI_NAME, MANIFEST_COMMAND_NAMES } from "./manifest.js";
import { closest } from "./expr.js";
import { cmdBatch, cmdCompile, cmdMd, cmdPreview, cmdWatch } from "./cli/commands-render.js";
import { cmdDescribe, cmdImpact, cmdLint, cmdScore, cmdTakeoff, cmdValidate } from "./cli/commands-analyze.js";
import {
  cmdAst,
  cmdComplete,
  cmdFinish,
  cmdFix,
  cmdFmt,
  cmdRepair,
  cmdReroll,
  cmdSuggest,
} from "./cli/commands-author.js";
import { cmdContext, cmdExplain, cmdManifest, cmdNew, cmdSpec } from "./cli/commands-meta.js";
import { cmdLink } from "./cli/commands-share.js";

/**
 * Help is no longer a hand-written string: `renderTopHelp`/`renderCommandHelp`
 * (`src/cli/help.ts`) derive it from this manifest, the same document `archlang manifest
 * --json` serves — so `archlang <cmd> --help` cannot list a flag the command doesn't take.
 */
const MANIFEST = buildManifest(VERSION);

/**
 * The single exit point for every dispatch arm below.
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
  const [cmd, ...rest] = process.argv.slice(2);

  // 1. No command at all: help belongs on stderr, because exit 3 means "you invoked me wrong".
  if (!cmd) {
    process.stderr.write(`error: missing command\n\n${renderTopHelp(MANIFEST)}`);
    return finish(EXIT.USAGE);
  }

  // 2. `--version`, before dispatch (it is not a command, so it needs no manifest entry).
  if (cmd === "--version" || cmd === "-V") {
    process.stdout.write(`${VERSION}\n`);
    return finish(EXIT.OK);
  }

  // 3. `archlang help [cmd]` / `archlang --help` — asking for help succeeds (stdout, exit 0).
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    const target = rest[0] ? findCommand(MANIFEST, rest[0]) : null;
    process.stdout.write(target ? renderCommandHelp(MANIFEST, target) : renderTopHelp(MANIFEST));
    return finish(EXIT.OK);
  }

  // 4. Unknown verb: a typo gets a did-you-mean, not a bare rejection.
  const command = findCommand(MANIFEST, cmd);
  if (!command) {
    const hint = closest(cmd, [...MANIFEST_COMMAND_NAMES]);
    const mean = hint ? ` — did you mean \`${CLI_NAME} ${hint}\`?` : "";
    return finish(usageError(`unknown command "${cmd}"${mean} (try \`${CLI_NAME} help\`)`));
  }

  // Parsed against the RESOLVED command, so a flag it does not declare is rejected below
  // instead of being swallowed as an input filename.
  const args = parseArgs(rest, command);

  // 5. `archlang <cmd> --help`, handled before the command runs — so it works with no input file.
  if (args.help) {
    process.stdout.write(renderCommandHelp(MANIFEST, command));
    return finish(EXIT.OK);
  }

  // 6. A flag this command does not take is a usage error, never a filename.
  if (args.unknownFlags?.length) {
    const bad = args.unknownFlags[0]!;
    const hint = closest(bad, allowedFlags(command));
    const mean = hint ? ` — did you mean \`${hint}\`?` : "";
    return finish(usageErrorFor(command.name, `unknown flag "${bad}" for \`${CLI_NAME} ${command.name}\`${mean}`));
  }

  switch (cmd) {
    case "compile":
      return finish(await cmdCompile(args));
    case "preview":
      return finish(await cmdPreview(args));
    case "batch":
      return finish(await cmdBatch(args));
    case "md":
    case "markdown":
      return finish(await cmdMd(args));
    case "manifest":
    case "capabilities":
      return finish(cmdManifest(args));
    // The one resident command: on success it returns RESIDENT and `finish` leaves the
    // process alive on the watcher's handle; a usage error still comes back as a code.
    case "watch":
      return finish(await cmdWatch(args));
    case "validate":
      return finish(cmdValidate(args));
    case "describe":
      return finish(cmdDescribe(args));
    case "score":
      return finish(cmdScore(args));
    case "lint":
      return finish(cmdLint(args));
    case "ast":
      return finish(cmdAst(args));
    case "complete":
      return finish(cmdComplete(args));
    case "fmt":
      return finish(cmdFmt(args));
    case "repair":
      return finish(cmdRepair(args));
    case "fix":
      return finish(await cmdFix(args));
    case "finish":
      return finish(cmdFinish(args));
    case "suggest":
      return finish(cmdSuggest(args));
    case "reroll":
      return finish(cmdReroll(args));
    case "impact":
      return finish(cmdImpact(args));
    case "takeoff":
      return finish(cmdTakeoff(args));
    case "spec":
      return finish(cmdSpec(args));
    case "context":
      return finish(cmdContext(args));
    case "new":
    case "init":
      return finish(cmdNew(args));
    case "explain":
      return finish(cmdExplain(args));
    case "link":
      return finish(cmdLink(args));
    default:
      return finish(usageError(`unknown command "${cmd}" (try \`${CLI_NAME} help\`)`));
  }
}

void main();
