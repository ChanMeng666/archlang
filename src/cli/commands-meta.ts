/**
 * The metadata / info commands — `manifest`, `spec`, `context`, `new`, `explain`.
 * They print the CLI's own surface (manifest), the shipped language docs (spec /
 * context), scaffold a starter plan (new), or look up an error code (explain). Split
 * out of the former monolithic `src/cli.ts` (mechanical; behavior unchanged).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { buildManifest, ERROR_CATALOG, explain } from "../index.js";
// The zero-dep levenshtein behind every "did you mean" hint the CLI prints.
import { closest } from "../expr.js";
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

// ---------------------------------------------------------------------------
// Bounded context (v1.17) — `arch context --section <name>`.
//
// `llms-full.txt` is ~50KB: an agent that only needs the diagnostic catalog used to
// pay for the spec + workflow + CLI reference too. The bundle is a concatenation
// (`scripts/gen-llms-full.ts` → `renderLlmsFull`), so the sections can be handed back
// one at a time by splitting on the exact rule it joins with — no second copy of the
// text, no parsing. `test/cli-context.test.ts` welds this splitter to that generator:
// it runs `renderLlmsFull()` in memory and asserts THIS split, so a change to the
// bundle's shape fails loudly instead of slicing garbage here.
// ---------------------------------------------------------------------------

/** The horizontal rule `renderLlmsFull()` joins its chunks with. */
const SECTION_SEPARATOR = "\n\n---\n\n";

/**
 * The addressable sections: the name an agent asks for → the `## ` heading the
 * generator emits for it, in generator order. The bundle splits into these four
 * plus a leading intro chunk (the banner + table of contents), which is not
 * addressable — an agent asking for a section wants the content, not the map.
 */
const SECTIONS: Readonly<Record<string, string>> = {
  spec: "## 1. Language spec",
  workflow: "## 2. Agent workflow",
  cli: "## 3. CLI reference",
  errors: "## 4. Diagnostic catalog",
};
const SECTION_NAMES = Object.keys(SECTIONS);
/** intro + the four sections — the chunk count the split must produce. */
const SECTION_CHUNKS = SECTION_NAMES.length + 1;

/**
 * Split a rendered `llms-full.txt` into its named sections, or `null` when it does
 * not have the shape this splitter knows (wrong chunk count, or a chunk that does
 * not open with its expected heading) — the caller reports that as an IO error
 * rather than emitting a wrong slice.
 */
export function splitContext(text: string): Record<string, string> | null {
  const chunks = text.replace(/\r\n/g, "\n").split(SECTION_SEPARATOR);
  if (chunks.length !== SECTION_CHUNKS) return null;
  const out: Record<string, string> = {};
  for (const [i, name] of SECTION_NAMES.entries()) {
    const chunk = chunks[i + 1]!; // chunk 0 is the intro
    if (!chunk.startsWith(SECTIONS[name]!)) return null;
    out[name] = chunk;
  }
  return out;
}

export function cmdContext(args: Args): number {
  const context = readContext();
  if (context === null) return ioError("llms-full.txt not found", args.json);

  const name = args.section;
  if (name === undefined) {
    if (args.json) emitJson({ ok: true, context });
    else process.stdout.write(context.endsWith("\n") ? context : context + "\n");
    return EXIT.OK;
  }

  if (!(name in SECTIONS)) {
    const hint = closest(name, SECTION_NAMES);
    return usageError(
      `unknown section "${name}" — expected one of: ${SECTION_NAMES.join(", ")}` +
        (hint === null ? "" : ` (did you mean "${hint}"?)`),
    );
  }
  const sections = splitContext(context);
  if (sections === null) {
    return ioError(
      "llms-full.txt does not have the expected section layout — regenerate it with `npm run gen:llms`",
      args.json,
    );
  }
  const section = sections[name]!;
  if (args.json) emitJson({ ok: true, section: name, context: section });
  else process.stdout.write(section.endsWith("\n") ? section : section + "\n");
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
