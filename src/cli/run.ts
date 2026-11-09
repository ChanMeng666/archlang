/**
 * The CLI as a function: argument parse + dispatch over a {@link CliIo}, returning the exit
 * code (or {@link RESIDENT}) instead of ending the process. `src/cli.ts` runs it on the real
 * process and exits through `exitFlushed`; `test/helpers/cli.ts` runs it in-process with
 * capturing writers, so a CLI test costs a function call rather than a child process and v8
 * coverage sees the commands it drives.
 */

import {
  type CliIo,
  type CommandResult,
  EXIT,
  RESIDENT,
  VERSION,
  allowedFlags,
  parseArgs,
  setImportRoot,
  usageError,
  usageErrorFor,
} from "./io.js";
import { findCommand, renderCommandHelp, renderTopHelp } from "./help.js";
import { buildManifest, CLI_NAME, MANIFEST_COMMAND_NAMES } from "../manifest.js";
import { closest } from "../expr.js";
import { cmdBatch, cmdCompile, cmdMd, cmdPreview, cmdWatch } from "./commands-render.js";
import { cmdDescribe, cmdImpact, cmdLint, cmdScore, cmdTakeoff, cmdValidate } from "./commands-analyze.js";
import { cmdAst, cmdComplete, cmdFinish, cmdFix, cmdFmt, cmdRepair, cmdReroll, cmdSuggest } from "./commands-author.js";
import { cmdContext, cmdExplain, cmdManifest, cmdNew, cmdSpec } from "./commands-meta.js";
import { cmdLink } from "./commands-share.js";
import { cmdImport } from "./commands-import.js";

/**
 * Help is no longer a hand-written string: `renderTopHelp`/`renderCommandHelp`
 * (`src/cli/help.ts`) derive it from this manifest, the same document `archlang manifest
 * --json` serves — so `archlang <cmd> --help` cannot list a flag the command doesn't take.
 */
const MANIFEST = buildManifest(VERSION);

/**
 * Run one CLI invocation (`argv` without the node and script paths). Every outcome is a returned
 * code — or {@link RESIDENT} when the command installed a handle and now owns the process (only
 * `watch` does) — never a `process.exit`: ending the process is the caller's business
 * (`src/cli.ts`, through `exitFlushed`).
 *
 * `--import-root` is process state (`setImportRoot`), so a run that does not stay resident clears
 * it again on the way out: the next in-process run starts from the working directory, as a fresh
 * process would.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<CommandResult> {
  let result: CommandResult | undefined;
  try {
    result = await dispatch(argv, io);
    return result;
  } finally {
    if (result !== RESIDENT) setImportRoot(undefined);
  }
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<CommandResult> {
  const [cmd, ...rest] = argv;

  // 1. No command at all: help belongs on stderr, because exit 3 means "you invoked me wrong".
  if (!cmd) {
    io.stderr.write(`error: missing command\n\n${renderTopHelp(MANIFEST)}`);
    return EXIT.USAGE;
  }

  // 2. `--version`, before dispatch (it is not a command, so it needs no manifest entry).
  if (cmd === "--version" || cmd === "-V") {
    io.stdout.write(`${VERSION}\n`);
    return EXIT.OK;
  }

  // 3. `archlang help [cmd]` / `archlang --help` — asking for help succeeds (stdout, exit 0).
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    const target = rest[0] ? findCommand(MANIFEST, rest[0]) : null;
    io.stdout.write(target ? renderCommandHelp(MANIFEST, target) : renderTopHelp(MANIFEST));
    return EXIT.OK;
  }

  // 4. Unknown verb: a typo gets a did-you-mean, not a bare rejection.
  const command = findCommand(MANIFEST, cmd);
  if (!command) {
    const hint = closest(cmd, [...MANIFEST_COMMAND_NAMES]);
    const mean = hint ? ` — did you mean \`${CLI_NAME} ${hint}\`?` : "";
    return usageError(io, `unknown command "${cmd}"${mean} (try \`${CLI_NAME} help\`)`);
  }

  // Parsed against the RESOLVED command, so a flag it does not declare is rejected below
  // instead of being swallowed as an input filename.
  const args = parseArgs(rest, command);

  // 5. `archlang <cmd> --help`, handled before the command runs — so it works with no input file.
  if (args.help) {
    io.stdout.write(renderCommandHelp(MANIFEST, command));
    return EXIT.OK;
  }

  // 6. A flag this command does not take is a usage error, never a filename.
  if (args.unknownFlags?.length) {
    const bad = args.unknownFlags[0]!;
    const hint = closest(bad, allowedFlags(command));
    const mean = hint ? ` — did you mean \`${hint}\`?` : "";
    return usageErrorFor(io, command.name, `unknown flag "${bad}" for \`${CLI_NAME} ${command.name}\`${mean}`);
  }

  // 7. `--import-root <dir>`: set once for the run, so every command that compiles honours it
  // through `makeNodeWorld` (EH-D7). A missing directory is a usage error, before anything runs.
  const rootError = setImportRoot(args.importRoot);
  if (rootError) return usageErrorFor(io, command.name, rootError);

  switch (cmd) {
    case "compile":
      return cmdCompile(args, io);
    case "preview":
      return cmdPreview(args, io);
    case "batch":
      return cmdBatch(args, io);
    case "md":
    case "markdown":
      return cmdMd(args, io);
    case "manifest":
    case "capabilities":
      return cmdManifest(args, io);
    // The one resident command: on success it returns RESIDENT and the caller leaves the
    // process alive on the watcher's handle; a usage error still comes back as a code.
    case "watch":
      return cmdWatch(args, io);
    case "validate":
      return cmdValidate(args, io);
    case "describe":
      return cmdDescribe(args, io);
    case "score":
      return cmdScore(args, io);
    case "lint":
      return cmdLint(args, io);
    case "ast":
      return cmdAst(args, io);
    case "complete":
      return cmdComplete(args, io);
    case "fmt":
      return cmdFmt(args, io);
    case "repair":
      return cmdRepair(args, io);
    case "fix":
      return cmdFix(args, io);
    case "finish":
      return cmdFinish(args, io);
    case "suggest":
      return cmdSuggest(args, io);
    case "reroll":
      return cmdReroll(args, io);
    case "impact":
      return cmdImpact(args, io);
    case "takeoff":
      return cmdTakeoff(args, io);
    case "spec":
      return cmdSpec(args, io);
    case "context":
      return cmdContext(args, io);
    case "new":
    case "init":
      return cmdNew(args, io);
    case "explain":
      return cmdExplain(args, io);
    case "import":
      return cmdImport(args, io);
    case "link":
      return cmdLink(args, io);
    default:
      return usageError(io, `unknown command "${cmd}" (try \`${CLI_NAME} help\`)`);
  }
}
