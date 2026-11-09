/**
 * `import` — a plan in another tool's format, as `.arch` source. One format today:
 * `--from openplan3d` (an OpenPlan3D web project or prepared RoomPlan interchange JSON), converted
 * by the core's pure `openPlan3dToArch()`. This file only reads the input, writes the output and
 * prints the report; it adds nothing to what the conversion decides.
 */

import { basename } from "node:path";
import { diagnosticToJson, openPlan3dToArch } from "../index.js";
import type { Diagnostic, OpenPlan3dImportResult } from "../index.js";
import {
  type Args,
  type CliIo,
  EXIT,
  emitJson,
  ioError,
  readInput,
  stdoutJsonConflict,
  usageErrorFor,
  writeOutput,
} from "./io.js";

const FORMATS = ["openplan3d"] as const;

/** The human line for one diagnostic of a JSON input (no span, so no source frame). */
function line(d: Diagnostic): string {
  return `${d.severity}${d.code ? `[${d.code}]` : ""}: ${d.message}`;
}

export function cmdImport(args: Args, io: CliIo): number {
  if (args.from === undefined)
    return usageErrorFor(io, "import", `missing --from <${FORMATS.join("|")}> (the format of the input file)`);
  if (!(FORMATS as readonly string[]).includes(args.from))
    return usageErrorFor(io, "import", `unknown --from "${args.from}" (supported: ${FORMATS.join(", ")})`);
  if (args.format !== undefined && args.format !== "web" && args.format !== "handoff")
    return usageErrorFor(io, "import", `unknown --format "${args.format}" (web or handoff)`);
  const input = args._[0];
  if (!input) return usageErrorFor(io, "import", "missing input file (use a path or `-` for stdin)");
  if (args.json && args.o === "-") return stdoutJsonConflict(io, "import");

  let text: string;
  try {
    text = readInput(io, input);
  } catch {
    return ioError(io, `cannot read ${input}`, args.json);
  }
  let parsed: unknown;
  let result: OpenPlan3dImportResult | undefined;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    result = {
      ok: false,
      diagnostics: [{ severity: "error", code: "E_IMPORT_FORMAT", message: `Invalid JSON: ${(e as Error).message}.` }],
    };
  }
  if (result === undefined) {
    // An interchange file is named after its file, as OpenPlan3D names it.
    const name = input === "-" ? undefined : basename(input).replace(/\.json$/i, "");
    result = openPlan3dToArch(parsed, {
      ...(args.format !== undefined ? { format: args.format as "web" | "handoff" } : {}),
      ...(name !== undefined ? { name } : {}),
    });
  }

  const target = args.o;
  let written: string | undefined;
  if (result.source !== undefined && target !== undefined && target !== "-") {
    try {
      writeOutput(target, result.source);
      written = target;
    } catch (e) {
      return ioError(io, (e as Error).message, args.json);
    }
  }

  if (args.json) {
    const r = result.report;
    emitJson(io, {
      ok: result.ok,
      ...(r
        ? {
            format: r.format,
            units: r.units,
            levels: r.levels,
            counts: r.counts,
            rooms: r.rooms,
            dropped: r.dropped,
            fields: r.fields,
            notes: r.notes,
            ids: r.ids,
          }
        : {}),
      ...(written !== undefined ? { output: written } : result.source !== undefined ? { source: result.source } : {}),
      diagnostics: result.diagnostics.map((d) => diagnosticToJson("", d)),
    });
    return result.ok ? EXIT.OK : EXIT.USER;
  }

  if (result.source !== undefined && written === undefined) io.stdout.write(result.source);
  if (!args.quiet) {
    for (const d of result.diagnostics) io.stderr.write(`${line(d)}\n`);
    const r = result.report;
    if (r && written !== undefined) {
      const mapped = Object.values(r.counts).reduce((s, c) => s + c.mapped, 0);
      const dropped = Object.values(r.counts).reduce((s, c) => s + c.dropped, 0);
      io.stderr.write(
        `✓ ${input} → ${written} (OpenPlan3D ${r.format}: ${mapped} imported, ${dropped} left out, ${r.rooms.detected} room${r.rooms.detected === 1 ? "" : "s"}; next: archlang lint ${written})\n`,
      );
    }
  }
  return result.ok ? EXIT.OK : EXIT.USER;
}
