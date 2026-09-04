/**
 * The file-producing commands — `compile`, `watch`, `preview`, `batch`, `md`. They
 * share the render/serialize core in {@link ./serialize.js}. Split out of the former
 * monolithic `src/cli.ts` (mechanical; behavior unchanged).
 */

import { writeFileSync, watchFile } from "node:fs";
import { resolve as resolvePath, dirname, basename } from "node:path";
import { cpus } from "node:os";
import { describe, diagnosticToJson, ERROR_CATALOG, extractArchBlocks, rewriteMarkdown } from "../index.js";
import type { Diagnostic } from "../index.js";
import {
  type Args,
  type CommandResult,
  type Format,
  EXIT,
  FORMAT_LIST,
  RESIDENT,
  baseDirOf,
  defaultOut,
  emitDiagnosticsHuman,
  emitJson,
  hasErrors,
  ioError,
  levelTarget,
  makeNodeWorld,
  parseFormat,
  readInput,
  resolveView,
  sourceFromJson,
  stdoutJsonConflict,
  stdoutMultiPage,
  unknownLevel,
  usageError,
  usageErrorFor,
} from "./io.js";
import {
  type PageSelect,
  type PerFile,
  aggregateExit,
  compileToFile,
  perFileJson,
  renderArtifact,
  runPool,
} from "./serialize.js";

/** Byte length of a rendered artifact (string or binary). */
const byteLen = (b: string | Uint8Array): number => (typeof b === "string" ? Buffer.byteLength(b) : b.length);

/** Which page(s) a render command should produce, from `--level`. */
const pageSelect = (args: Args, whenAbsent: PageSelect): PageSelect =>
  args.level !== undefined ? { level: args.level } : whenAbsent;

/**
 * `compile --json` with no `-o` writes NOTHING.
 *
 * `--json` says "give me the structured result on stdout" and no `-o` names no output
 * file, so there is nothing in the invocation that asks for bytes on disk — yet for
 * every release up to this one `compile` still fell back to `defaultOut()` and dropped
 * `<stem>.svg` (and one `<stem>.L<n>.svg` per storey) beside the source. That is exactly
 * the shape of a scripted "just check it compiles" loop, and it littered this repo's own
 * `examples/` with stray per-level SVGs that had to be deleted by hand before
 * `gen:example-svgs` output could be reviewed.
 *
 * The rule is deliberately uniform across every branch of `compile` — clean plan,
 * broken plan with `--error-svg`, single storey and multi-storey alike — because a
 * split rule ("no file, unless the plan is broken and --error-svg is on") would be
 * more surprising than the behaviour it replaced. Ask for a file and you get one:
 * `-o <file>` writes, `-o -` streams (and is a usage error with `--json`, unchanged).
 *
 * The JSON says so positively rather than by omission: `written: false` sits exactly
 * where `output`/`outputs` would have, `bytes` still reports the size of the render,
 * and every other key is unchanged. The bytes are NOT smuggled into the payload in
 * place of the file: this envelope reports FACTS about a render and has never carried
 * content, and an unbounded content key that appears only when no `-o` was given would
 * be a worse surprise than a flag that needs `-o`. That is a decision, and it is pinned
 * in `test/cli.test.ts` — including for `--error-svg`, the one flag whose whole purpose
 * is to produce an image, which is therefore inert in exactly this combination.
 *
 * `preview`, `batch` and `md` keep their behaviour byte-for-byte. `watch` inherits the
 * rule, because `cmdWatch` re-enters `cmdCompile` on every save — so `arch watch p.arch
 * --json` now re-reports the plan on each save instead of re-writing `p.svg`, which is
 * the same rule and not a second one.
 */
const jsonNamesNoFile = (args: Args): boolean => args.json === true && args.o === undefined;

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

export async function cmdCompile(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("missing input file (use a path or `-` for stdin)");

  const format = parseFormat(args);
  if (!format) return usageError(`unknown format "${args.format}" (use ${FORMAT_LIST})`);
  // Checked before any read: two writers for one stdout is a usage error, not a silent
  // redirect to `out.svg` (see `stdoutJsonConflict`).
  if (args.json && args.o === "-") return stdoutJsonConflict("compile");

  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }

  // `--from-json`: the input is Plan JSON (RPLAN shape), not `.arch`. Convert it to
  // canonical `.arch` here, then fall through to the normal pipeline so every flag
  // (-f/-o/--overlay/--accessible/--error-svg/--cols/--charset) composes unchanged.
  if (args.fromJson) {
    const conv = sourceFromJson(source);
    if ("error" in conv) {
      const projSrc = conv.generated ?? source;
      if (args.json) {
        emitJson({ ok: false, format, diagnostics: conv.error.map((d) => diagnosticToJson(projSrc, d)) });
      } else {
        emitDiagnosticsHuman(projSrc, conv.error, args.quiet);
        if (!args.quiet) process.stderr.write("✗ plan JSON is invalid\n");
      }
      return EXIT.USER;
    }
    source = conv.source;
  }

  // `--view iso|axon` (v1.35): the illustrative axonometric. It is a WHOLE-BUILDING
  // drawing, so it collapses the per-storey fan-out to one artifact — `compile()` returns
  // no `pages` for it, and `-o <file>` therefore writes exactly the file it names rather
  // than one `<stem>.L<n>` per level. Validated here so a bad value or `-f txt` is an
  // exit-3 usage error before anything is read.
  const rv = resolveView(args, format, "compile");
  if ("code" in rv) return rv.code;

  // A multi-storey plan (`level` blocks) renders one artifact per storey unless `--level`
  // narrows it to one; a single-storey plan is unaffected by either.
  const r = await renderArtifact(source, format, args, baseDirOf(input), pageSelect(args, "all"), rv.view);
  if (r.badLevel) return unknownLevel("compile", args.level!, r.levels);

  if (r.error) {
    // A serialize / missing-optional-dependency failure (compile succeeded). In
    // --json carry the catalog code + fix so the agent knows exactly what to do.
    if (args.json) {
      const o: Record<string, unknown> = { ok: false, format, error: r.error };
      if (r.errorCode) {
        o.code = r.errorCode;
        const fix = ERROR_CATALOG[r.errorCode]?.fix;
        if (fix) o.fix = fix;
      }
      emitJson(o);
      return EXIT.INTERNAL;
    }
    return ioError(r.error, false, { format });
  }

  const errored = hasErrors(r.diagnostics);

  // ---- multi-storey: one sheet per level -----------------------------------------
  // `-o -` cannot mean "several drawings on one stream", so it is a usage error (exit 3)
  // unless `--level` picked a single storey — the same doctrine as `-o -` + `--json`.
  if (r.pages) {
    if (args.o === "-") return stdoutMultiPage("compile", r.levels);
    return writePages(r.pages, r.diagnostics, source, input, format, args);
  }

  if (r.bytes === undefined) {
    const diagnostics = r.diagnostics;
    if (args.json) {
      emitJson({ ok: false, format, diagnostics: diagnostics.map((d) => diagnosticToJson(source, d)) });
    } else {
      emitDiagnosticsHuman(source, diagnostics, args.quiet);
      const n = diagnostics.filter((d) => d.severity === "error").length;
      if (!args.quiet) process.stderr.write(`✗ compilation failed (${n} error${n === 1 ? "" : "s"})\n`);
    }
    return EXIT.USER;
  }

  const bytes = r.bytes;
  const diagnostics = r.diagnostics;

  // `--json` with no `-o` asked for no file — see {@link jsonNamesNoFile}.
  const noWrite = jsonNamesNoFile(args);
  const target = args.o ?? defaultOut(input, format);

  // `--error-svg` produced an error-card image for a *broken* plan: write it (so an
  // agent/embed has visual feedback) but keep the user-source exit code and report
  // the diagnostics — a broken plan never counts as a successful compile. With
  // `--json` and no `-o` the card is still *rendered* (so `bytes` is real) and still
  // not written, because no one named a place to put it.
  if (errored) {
    if (noWrite) {
      // nothing on disk: the invocation named no output file
    } else if (target === "-") {
      process.stdout.write(bytes);
    } else {
      try {
        writeFileSync(resolvePath(target), bytes);
      } catch (e) {
        return ioError((e as Error).message, args.json, { format });
      }
    }
    if (args.json) {
      const o: Record<string, unknown> = {
        ok: false,
        format,
        diagnostics: diagnostics.map((d) => diagnosticToJson(source, d)),
      };
      if (noWrite) {
        o.written = false;
        o.bytes = byteLen(bytes);
      } else if (target !== "-") {
        o.output = resolvePath(target);
        o.bytes = byteLen(bytes);
      }
      emitJson(o);
    } else {
      emitDiagnosticsHuman(source, diagnostics, args.quiet);
      const n = diagnostics.filter((d) => d.severity === "error").length;
      if (!args.quiet && target !== "-")
        process.stderr.write(`✗ compilation failed (${n} error${n === 1 ? "" : "s"}); wrote error card → ${target}\n`);
    }
    return EXIT.USER;
  }

  if (!noWrite) {
    if (target === "-") {
      process.stdout.write(bytes);
      return EXIT.OK;
    }
    try {
      writeFileSync(resolvePath(target), bytes);
    } catch (e) {
      return ioError((e as Error).message, args.json, { format });
    }
  }

  const warnings = diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    const s = describe(source, { world: makeNodeWorld(baseDirOf(input)) });
    const { ok: _ok, diagnostics: _d, ...summary } = s;
    emitJson({
      ok: true,
      format,
      // `written: false` takes `output`'s slot when the invocation named no file.
      ...(noWrite ? { written: false } : { output: resolvePath(target) }),
      bytes: byteLen(bytes),
      diagnostics: warnings.map((d) => diagnosticToJson(source, d)),
      summary,
    });
  } else {
    emitDiagnosticsHuman(source, warnings, args.quiet);
    const len = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length;
    if (!args.quiet) process.stdout.write(`✓ ${input} → ${target} (${len} bytes, ${format.toUpperCase()})\n`);
  }
  return EXIT.OK;
}

/**
 * Write one file per storey of a multi-storey plan: `<stem>.L<level>.<ext>`, derived from
 * the `-o` target (or the default output) so a level's sheet lands exactly where a
 * single-file compile would have put the drawing.
 *
 * The `--json` envelope reports `outputs[]` (every path, in level order) plus a `pages[]`
 * row per storey — there is no single `output`, and inventing one would be a lie. The
 * `summary` stays the whole-plan `describe()`, whose `levels[]` mirrors these pages.
 *
 * With `--json` and no `-o` nothing is written at all ({@link jsonNamesNoFile}): the
 * whole set is rendered and reported (`pages[]` keeps its `level`/`name`/`bytes`), but
 * `outputs[]` and each row's `output` are absent because no such file exists — the
 * envelope says `written: false` instead.
 */
function writePages(
  pages: NonNullable<Awaited<ReturnType<typeof renderArtifact>>["pages"]>,
  diagnostics: Diagnostic[],
  source: string,
  input: string,
  format: Format,
  args: Args,
): number {
  const noWrite = jsonNamesNoFile(args);
  const base = args.o ?? defaultOut(input, format);
  const written: Array<Record<string, unknown>> = [];
  for (const p of pages) {
    const target = levelTarget(base, p.level);
    if (!noWrite) {
      try {
        writeFileSync(resolvePath(target), p.bytes);
      } catch (e) {
        return ioError((e as Error).message, args.json, { format });
      }
    }
    written.push({
      level: p.level,
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(noWrite ? {} : { output: resolvePath(target) }),
      bytes: byteLen(p.bytes),
    });
  }

  // Warnings are per storey (each carries its `level`), so they are reported for the whole
  // set exactly once — a page is not a separate compile.
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    const s = describe(source, { world: makeNodeWorld(baseDirOf(input)) });
    const { ok: _ok, diagnostics: _d, ...summary } = s;
    emitJson({
      ok: true,
      format,
      // `written: false` takes `outputs[]`'s slot when the invocation named no file.
      ...(noWrite ? { written: false } : { outputs: written.map((w) => w.output) }),
      pages: written,
      diagnostics: warnings.map((d) => diagnosticToJson(source, d)),
      summary,
    });
  } else {
    emitDiagnosticsHuman(source, warnings, args.quiet);
    if (!args.quiet) {
      for (const w of written) {
        process.stdout.write(
          `✓ ${input} → ${w.output as string} (level ${w.level as number}, ${w.bytes as number} bytes, ${format.toUpperCase()})\n`,
        );
      }
    }
  }
  return EXIT.OK;
}

/**
 * `watch` — the one RESIDENT command: it installs a handle and then owns the process
 * until a signal ends it. Everything else in this CLI is one-shot.
 *
 * It returns {@link RESIDENT} rather than `EXIT.OK` because the dispatcher cannot tell
 * those apart from a number — and for twenty-five releases it did not: `process.exit(await
 * cmdWatch(args))` killed the watcher the instant it was installed (v1.1.0's switch
 * refactor; the pre-refactor `if/else` chain simply fell off the end of `main`).
 *
 * Two behaviours here are deliberate, not incidental:
 *
 * - **A failing first compile does not stop the watch.** `cmdCompile`'s exit code is
 *   discarded on purpose: fixing the file and re-saving is the entire point of `watch`,
 *   so a syntax error must leave you watching, not at a shell prompt. The diagnostics
 *   are already on stderr by the time it returns.
 * - **A failing RE-compile does not stop it either.** The listener's promise is caught
 *   here, because an unhandled rejection is a hard process exit in Node ≥ 15 — one
 *   unwritable output (an editor holding the file, a `-o` on a full disk) would
 *   otherwise take down a watcher that is supposed to survive exactly that and let you
 *   save again.
 *
 * Termination is Node's default signal handling, unmodified: SIGINT (the advertised
 * Ctrl+C) and SIGTERM both end the process promptly, and no handler is installed that
 * could swallow either.
 */
export async function cmdWatch(args: Args): Promise<CommandResult> {
  const input = args._[0];
  // Still a usage error, and still exits 3 — `-` cannot be re-read on every save, and
  // becoming resident over a path that does not exist would watch nothing forever.
  if (!input || input === "-") return usageError("watch needs a file path");
  await cmdCompile(args);
  // ARM THE WATCHER BEFORE ANNOUNCING IT. `watchFile` takes its baseline `stat` when it
  // is called, so any save landing between the banner and this line is folded into that
  // baseline and never produces a change event — silently, and only for the first save.
  // The banner is what a human (and this project's own end-to-end test) treats as "ready",
  // so printing it first makes the readiness signal true a moment before it is: edit fast
  // enough after starting `arch watch` and your first save is ignored.
  //
  // Reproduced deterministically by widening the window: a 1.5 s delay inserted here makes
  // `test/cli-commands.test.ts`'s watch case fail every time, and `test/watch-arming.test.ts`
  // now pins the ordering so the window cannot be reopened.
  watchFile(resolvePath(input), { interval: 300 }, () => {
    // Nothing reads a re-compile's exit code — the process's own code is decided by the
    // signal that ends it — so the failure is reported and the watch continues.
    void cmdCompile(args).catch((e: unknown) => {
      process.stderr.write(`✗ recompile failed: ${e instanceof Error ? e.message : String(e)}\n`);
    });
  });
  process.stderr.write(`watching ${input} … (Ctrl+C to stop)\n`);
  return RESIDENT;
}

// ---------------------------------------------------------------------------
// preview / batch / md
// ---------------------------------------------------------------------------

/**
 * `preview` — render a PNG an agent can *look at*. PNG-first, default `scale 2`
 * for legibility. Zero-install where the optional `@resvg/resvg-js` binary is
 * present (a normal `npm i`/`npx` installs it); otherwise the failure carries the
 * `E_PNG_DEPENDENCY` code + fix, and `--install` fetches it and retries.
 */
/**
 * `preview --ascii` — the text preview. Compiles to the `txt` backend and prints
 * the plan to stdout (human) or as an `ascii` field (`--json`), following the same
 * result shape as the PNG preview. Zero dependency: an agent gets a legible plan
 * with no raster binary at all.
 */
async function cmdPreviewAscii(args: Args, input: string): Promise<number> {
  const format: Format = "txt";
  // `--ascii` IS the txt backend, so `--view` is refused here for the same reason
  // `-f txt` is: a projection has no plan for the ASCII room pass to read.
  const rv = resolveView(args, format, "preview");
  if ("code" in rv) return rv.code;
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }
  const r = await renderArtifact(source, format, args, baseDirOf(input), pageSelect(args, "first"));
  if (r.badLevel) return unknownLevel("preview", args.level!, r.levels);
  if (r.bytes === undefined) {
    if (args.json) emitJson({ ok: false, format, diagnostics: r.diagnostics.map((d) => diagnosticToJson(source, d)) });
    else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ compilation failed\n");
    }
    return EXIT.USER;
  }
  const ascii = typeof r.bytes === "string" ? r.bytes : Buffer.from(r.bytes).toString("utf8");
  const warnings = r.diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    emitJson({ ok: true, format, ascii, diagnostics: warnings.map((d) => diagnosticToJson(source, d)) });
  } else {
    process.stdout.write(ascii);
  }
  return EXIT.OK;
}

export async function cmdPreview(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("preview needs an input file (use a path or `-` for stdin)");

  // `--ascii`: a zero-install text preview an agent can read straight from stdout,
  // no raster dependency. Reuses the same `renderAscii` backend as `-f txt`.
  if (args.ascii) return cmdPreviewAscii(args, input);

  const format: Format = "png";
  if (args.json && args.o === "-") return stdoutJsonConflict("preview");
  const rv = resolveView(args, format, "preview");
  if ("code" in rv) return rv.code;
  // Target a sensible on-screen size by default: the native render is high-res
  // (thousands of px), so render the page at ~1600px wide unless the caller set
  // an explicit width/scale. That keeps the PNG legible *and* small enough for an
  // agent's vision to ingest without heavy downscaling.
  if (args.width === undefined && (args.scale === undefined || !(args.scale > 0))) args.width = 1600;
  if (args.scale === undefined || !(args.scale > 0)) args.scale = 1;

  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }

  // Multi-storey: preview the storey `--level` names, else the lowest (page 1). With
  // `--view` there is one page — the whole building — so `--level` has nothing to narrow.
  const r = await renderArtifact(source, format, args, baseDirOf(input), pageSelect(args, "first"), rv.view);
  if (r.badLevel) return unknownLevel("preview", args.level!, r.levels);

  if (r.error) {
    if (args.json) {
      const o: Record<string, unknown> = { ok: false, format, error: r.error };
      if (r.errorCode) {
        o.code = r.errorCode;
        const fix = ERROR_CATALOG[r.errorCode]?.fix;
        if (fix) o.fix = fix;
      }
      emitJson(o);
      return EXIT.INTERNAL;
    }
    return ioError(r.error, false, { format });
  }

  if (r.bytes === undefined) {
    if (args.json) emitJson({ ok: false, format, diagnostics: r.diagnostics.map((d) => diagnosticToJson(source, d)) });
    else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet) process.stderr.write("✗ compilation failed\n");
    }
    return EXIT.USER;
  }

  const errored = hasErrors(r.diagnostics);

  const target = args.o ?? defaultOut(input, format);

  // `--error-svg`: rasterized error-card PNG for a broken plan — write it, but keep
  // the user-source exit code and report the diagnostics.
  if (errored) {
    if (target === "-") {
      process.stdout.write(r.bytes);
    } else {
      try {
        writeFileSync(resolvePath(target), r.bytes);
      } catch (e) {
        return ioError((e as Error).message, args.json, { format });
      }
    }
    if (args.json) {
      const o: Record<string, unknown> = {
        ok: false,
        format,
        diagnostics: r.diagnostics.map((d) => diagnosticToJson(source, d)),
      };
      if (target !== "-") {
        o.output = resolvePath(target);
        o.bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
      }
      emitJson(o);
    } else {
      emitDiagnosticsHuman(source, r.diagnostics, args.quiet);
      if (!args.quiet && target !== "-") process.stderr.write(`✗ compilation failed; wrote error card → ${target}\n`);
    }
    return EXIT.USER;
  }

  if (target === "-") {
    process.stdout.write(r.bytes);
    return EXIT.OK;
  }
  try {
    writeFileSync(resolvePath(target), r.bytes);
  } catch (e) {
    return ioError((e as Error).message, args.json, { format });
  }

  const bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
  const warnings = r.diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    emitJson({
      ok: true,
      format,
      output: resolvePath(target),
      bytes,
      width: args.width ?? null,
      scale: args.scale,
      diagnostics: warnings.map((d) => diagnosticToJson(source, d)),
    });
  } else {
    emitDiagnosticsHuman(source, warnings, args.quiet);
    if (!args.quiet)
      process.stdout.write(
        `✓ ${input} → ${target} (${bytes} bytes, PNG${args.width ? ` ${args.width}px` : ""}@${args.scale}x)\n`,
      );
  }
  return EXIT.OK;
}

/**
 * `batch` — render many `.arch` files in one call, concurrently. Stable array
 * JSON shape (`{ ok, results: [...] }`) so an agent can render design variants and
 * read every outcome at once. `-o <dir>` directs outputs into a directory; `-j`
 * caps concurrency (default: CPU count).
 */
export async function cmdBatch(args: Args): Promise<number> {
  const inputs = args._;
  if (inputs.length === 0) return usageError("batch needs at least one input file");
  const format = parseFormat(args);
  if (!format) return usageError(`unknown format "${args.format}" (use ${FORMAT_LIST})`);
  // `batch -o` is an output DIRECTORY and `batch` writes one file per input, so there is
  // no single stream `-` could mean — with or without `--json`. It used to be dropped on
  // the floor (outputs landing next to each input, unannounced); say so instead.
  if (args.o === "-")
    return usageErrorFor(
      "batch",
      "`-o -` is not a batch target: -o takes an output DIRECTORY and batch writes one file per input — give a directory, or omit -o to write alongside each input",
    );

  const outDir = args.o;
  const targetFor = (input: string): string =>
    outDir ? resolvePath(outDir, basename(input).replace(/\.arch$/i, "") + "." + format) : defaultOut(input, format);

  const jobs = args.jobs && args.jobs > 0 ? args.jobs : Math.min(cpus().length, inputs.length);
  const results = await runPool(
    inputs.map((input) => () => compileToFile(input, format, args, targetFor(input))),
    jobs,
  );

  if (args.json) {
    emitJson({ ok: results.every((r) => r.ok), results: results.map(perFileJson) });
  } else if (!args.quiet) {
    for (const r of results) {
      if (r.ok) process.stdout.write(`✓ ${r.input} → ${r.output} (${r.bytes} bytes, ${format.toUpperCase()})\n`);
      else process.stderr.write(`✗ ${r.input}: ${r.error ?? "compilation failed"}\n`);
    }
  }
  return aggregateExit(results);
}

/** Alt text for an embedded block's image link. */
function blockAlt(index: number): string {
  return `Floor plan ${index + 1}`;
}

/**
 * `md` — render every ` ```arch ` block in a Markdown file to an image and rewrite
 * each block to an image link (mermaid-cli's markdown mode). Images are written
 * next to the output `.md` as `<name>-<n>.<ext>`. A block that fails to render is
 * left untouched in the output.
 */
export async function cmdMd(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("md needs a Markdown file");
  // Route through the one shared `-f` parser (so an unknown id gets the same
  // full-format-list error every other command gives), then narrow to the subset
  // `md` can actually embed as an image link.
  const format = parseFormat(args);
  if (!format) return usageError(`unknown format "${args.format}" (use ${FORMAT_LIST})`);
  if (format !== "svg" && format !== "png") return usageError(`md supports -f svg or png (got "${format}")`);
  if (args.json && args.o === "-") return stdoutJsonConflict("md");

  let md: string;
  try {
    md = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json);
  }

  // Output target: default `<name>.out.md` (`-o -` streams it, and cannot be combined
  // with `--json` — rejected above).
  const target = args.o ?? (input === "-" ? "out.md" : resolvePath(input).replace(/\.md$/i, "") + ".out.md");
  const outAbs = target === "-" ? resolvePath("out.md") : resolvePath(target);
  const outDir = dirname(outAbs);
  const outBase = basename(outAbs).replace(/\.[^.]+$/, "");
  const baseDir = baseDirOf(input);

  const blocks = extractArchBlocks(md);
  const replacements: Array<string | undefined> = [];
  const images: PerFile[] = [];

  for (const b of blocks) {
    const imgName = `${outBase}-${b.index + 1}.${format}`;
    const r = await renderArtifact(b.source, format, args, baseDir);
    if (r.error || r.bytes === undefined) {
      images.push({
        input: `block ${b.index + 1}`,
        ok: false,
        format,
        error: r.error,
        errorCode: r.errorCode,
        diagnostics: r.diagnostics,
        source: b.source,
      });
      replacements[b.index] = undefined; // leave the failing block in place
      continue;
    }
    try {
      writeFileSync(resolvePath(outDir, imgName), r.bytes);
    } catch (e) {
      images.push({
        input: `block ${b.index + 1}`,
        ok: false,
        format,
        error: (e as Error).message,
        diagnostics: r.diagnostics,
        source: b.source,
      });
      replacements[b.index] = undefined;
      continue;
    }
    const bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
    // With `--error-svg`, a broken block still produced bytes (an error card): the
    // image is written and the block rewritten to it, but `ok` reflects that the
    // block errored, so the aggregate exit code stays a user-source error.
    images.push({
      input: `block ${b.index + 1}`,
      ok: !hasErrors(r.diagnostics),
      format,
      output: resolvePath(outDir, imgName),
      bytes,
      diagnostics: r.diagnostics,
      source: b.source,
    });
    replacements[b.index] = `![${blockAlt(b.index)}](${imgName})`;
  }

  const rewritten = rewriteMarkdown(md, blocks, replacements);
  if (target === "-") {
    process.stdout.write(rewritten);
  } else {
    try {
      writeFileSync(outAbs, rewritten, "utf8");
    } catch (e) {
      return ioError((e as Error).message, args.json);
    }
  }

  if (args.json) {
    emitJson({
      ok: images.every((i) => i.ok),
      output: target === "-" ? null : outAbs,
      blocks: blocks.length,
      images: images.map(perFileJson),
    });
  } else if (!args.quiet) {
    const rendered = images.filter((i) => i.ok).length;
    process.stdout.write(
      `✓ ${input} → ${target} (${blocks.length} block${blocks.length === 1 ? "" : "s"}, ${rendered} rendered)\n`,
    );
  }
  return aggregateExit(images);
}
