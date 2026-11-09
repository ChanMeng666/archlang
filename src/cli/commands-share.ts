/**
 * `link` — print a URL that opens the plan in the hosted playground, so an agent can hand a
 * person a rendered plan with nothing to install. The plan travels in the URL fragment; the
 * minting and the `--json` shape are `linkResult` (`link.ts`), shared with the MCP `link` tool.
 */

import { compile, diagnosticToJson } from "../index.js";
import { type Args, type CliIo, EXIT, emitJson, withSource } from "./io.js";
import { linkResult } from "./link.js";

/**
 * A plan that does not compile still gets its link (the playground shows the diagnostics, which
 * is useful to whoever opens it), but the caller hears about it: `ok:false` with an `errors`
 * count in `--json`, one warning line on stderr, and exit 0 because the link was minted. Compiled
 * with no `World`, as the playground does, so a plan that leans on `import` warns here exactly
 * when it would fail there.
 */
export function cmdLink(args: Args, io: CliIo): number {
  return withSource(io, args, (source, input) => {
    const { diagnostics } = compile(source, { noCache: true });
    const result = linkResult(source, diagnostics);
    if (!result.ok && !args.quiet) {
      const first = diagnosticToJson(source, diagnostics.find((d) => d.severity === "error")!);
      const name = input === "-" ? "stdin" : input;
      const where = first.line === undefined ? "" : ` at ${first.line}:${first.col}`;
      const count = `${result.errors} error${result.errors === 1 ? "" : "s"}`;
      io.stderr.write(
        `warning: ${name} does not compile (${count}, first ${first.code ?? "uncoded"}${where}); the link opens it with the diagnostics\n`,
      );
    }
    if (args.json) emitJson(io, result);
    else io.stdout.write(`${result.playground}\n`);
    return EXIT.OK;
  });
}
