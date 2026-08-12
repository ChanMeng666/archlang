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
 *   spec      print the one-prompt language spec (spec.llm.md)
 *   new       scaffold a starter .arch
 *   explain   look up an error code
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
import { buildManifest, MANIFEST_COMMAND_NAMES } from "./manifest.js";
import { closest } from "./expr.js";
import { cmdBatch, cmdCompile, cmdMd, cmdPreview, cmdWatch } from "./cli/commands-render.js";
import { cmdDescribe, cmdLint, cmdScore, cmdValidate } from "./cli/commands-analyze.js";
import { cmdAst, cmdComplete, cmdFix, cmdFmt, cmdRepair, cmdSuggest } from "./cli/commands-author.js";
import { cmdContext, cmdExplain, cmdManifest, cmdNew, cmdSpec } from "./cli/commands-meta.js";

/**
 * Help is no longer a hand-written string: `renderTopHelp`/`renderCommandHelp`
 * (`src/cli/help.ts`) derive it from this manifest, the same document `arch manifest
 * --json` serves — so `arch <cmd> --help` cannot list a flag the command doesn't take.
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
 * the event loop happening to be empty.
 */
function finish(result: CommandResult): void {
  if (result === RESIDENT) return; // the command owns the process now; let it live.
  process.exit(result);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  // 1. No command at all: help belongs on stderr, because exit 3 means "you invoked me wrong".
  if (!cmd) {
    process.stderr.write(`error: missing command\n\n${renderTopHelp(MANIFEST)}`);
    process.exit(EXIT.USAGE);
  }

  // 2. `--version`, before dispatch (it is not a command, so it needs no manifest entry).
  if (cmd === "--version" || cmd === "-V") {
    process.stdout.write(`${VERSION}\n`);
    process.exit(EXIT.OK);
  }

  // 3. `arch help [cmd]` / `arch --help` — asking for help succeeds (stdout, exit 0).
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    const target = rest[0] ? findCommand(MANIFEST, rest[0]) : null;
    process.stdout.write(target ? renderCommandHelp(MANIFEST, target) : renderTopHelp(MANIFEST));
    process.exit(EXIT.OK);
  }

  // 4. Unknown verb: a typo gets a did-you-mean, not a bare rejection.
  const command = findCommand(MANIFEST, cmd);
  if (!command) {
    const hint = closest(cmd, [...MANIFEST_COMMAND_NAMES]);
    const mean = hint ? ` — did you mean \`arch ${hint}\`?` : "";
    process.exit(usageError(`unknown command "${cmd}"${mean} (try \`arch help\`)`));
  }

  // Parsed against the RESOLVED command, so a flag it does not declare is rejected below
  // instead of being swallowed as an input filename.
  const args = parseArgs(rest, command);

  // 5. `arch <cmd> --help`, handled before the command runs — so it works with no input file.
  if (args.help) {
    process.stdout.write(renderCommandHelp(MANIFEST, command));
    process.exit(EXIT.OK);
  }

  // 6. A flag this command does not take is a usage error, never a filename.
  if (args.unknownFlags?.length) {
    const bad = args.unknownFlags[0]!;
    const hint = closest(bad, allowedFlags(command));
    const mean = hint ? ` — did you mean \`${hint}\`?` : "";
    process.exit(usageErrorFor(command.name, `unknown flag "${bad}" for \`arch ${command.name}\`${mean}`));
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
    case "suggest":
      return finish(cmdSuggest(args));
    case "spec":
      return finish(cmdSpec(args));
    case "context":
      return finish(cmdContext(args));
    case "new":
    case "init":
      return finish(cmdNew(args));
    case "explain":
      return finish(cmdExplain(args));
    default:
      return finish(usageError(`unknown command "${cmd}" (try \`arch help\`)`));
  }
}

void main();
