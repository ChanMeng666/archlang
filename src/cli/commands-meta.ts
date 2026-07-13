/**
 * The metadata / info commands — `manifest`, `spec`, `context`, `new`, `explain`.
 * They print the CLI's own surface (manifest), the shipped language docs (spec /
 * context), scaffold a starter plan (new), or look up an error code (explain). Split
 * out of the former monolithic `src/cli.ts` (mechanical; behavior unchanged).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { buildManifest, ERROR_CATALOG, explain } from "../index.js";
import { type Args, EXIT, HERE, VERSION, emitJson, ioError, usageError } from "./io.js";

/** `manifest` — the whole CLI API surface as one structured document for agents. */
export function cmdManifest(args: Args): number {
  const m = buildManifest(VERSION);
  if (args.json) {
    emitJson(m);
  } else {
    const lines = [
      `arch ${m.version} — ${m.commands.length} commands`,
      ...m.commands.map((c) => `  ${c.name}${c.aliases ? ` (${c.aliases.join(", ")})` : ""} — ${c.summary}`),
      `formats: ${m.formats.map((f) => f.id).join(", ")}`,
      `lint profiles: ${m.lint.profiles.join(", ")}`,
      `error codes: ${m.errorCodes.length}  ·  elements: ${m.elements.join(", ")}`,
    ];
    process.stdout.write(lines.join("\n") + "\n");
  }
  return EXIT.OK;
}

/** A minimal but complete starter plan for `arch new`. */
const STARTER = `plan "New Plan" {
  units mm
  grid 50
  scale 1:50
  north up

  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }

  room id=r_main at (0,0) size 5000x4000 label "Room"

  door   at (2500,4000) width 900  wall exterior hinge left swing in
  window at (2500,0)    width 1500 wall exterior
}
`;

export function cmdNew(args: Args): number {
  if (args.o && args.o !== "-") {
    const target = resolvePath(args.o);
    if (existsSync(target) && !args.force) {
      return ioError(`${args.o} already exists (use --force to overwrite)`, args.json);
    }
    writeFileSync(target, STARTER, "utf8");
    if (args.json) emitJson({ ok: true, output: target });
    else if (!args.quiet) process.stdout.write(`✓ wrote starter plan to ${args.o}\n`);
    return EXIT.OK;
  }
  if (args.json) emitJson({ ok: true, template: STARTER });
  else process.stdout.write(STARTER);
  return EXIT.OK;
}

/** Locate spec.llm.md relative to this module (shipped at the package root). */
function readSpec(): string | null {
  for (const rel of ["../spec.llm.md", "../../spec.llm.md"]) {
    const p = resolvePath(HERE, rel);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

export function cmdSpec(args: Args): number {
  const spec = readSpec();
  if (spec === null) return ioError("spec.llm.md not found", args.json);
  if (args.json) emitJson({ ok: true, spec });
  else process.stdout.write(spec.endsWith("\n") ? spec : spec + "\n");
  return EXIT.OK;
}

/** Locate llms-full.txt relative to this module (shipped at the package root). */
function readContext(): string | null {
  for (const rel of ["../llms-full.txt", "../../llms-full.txt"]) {
    const p = resolvePath(HERE, rel);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

export function cmdContext(args: Args): number {
  const context = readContext();
  if (context === null) return ioError("llms-full.txt not found", args.json);
  if (args.json) emitJson({ ok: true, context });
  else process.stdout.write(context.endsWith("\n") ? context : context + "\n");
  return EXIT.OK;
}

export function cmdExplain(args: Args): number {
  const code = args._[0];
  if (!code) return usageError("missing error code (e.g. arch explain E_ROOM_SIZE)");
  const upper = code.toUpperCase();
  const entry = ERROR_CATALOG[upper];
  if (!entry) {
    if (args.json) emitJson({ ok: false, code: upper });
    else process.stderr.write(`error: unknown error code "${code}"\n`);
    return EXIT.USAGE;
  }
  if (args.json) emitJson({ ok: true, code: upper, entry });
  else process.stdout.write((explain(upper) ?? "") + "\n");
  return EXIT.OK;
}
