/**
 * The file-producing commands — `compile`, `watch`, `preview`, `batch`, `md`. They
 * share the render/serialize core in {@link ./serialize.js}. Split out of the former
 * monolithic `src/cli.ts` (mechanical; behavior unchanged).
 */

import { writeFileSync, watchFile } from "node:fs";
import { resolve as resolvePath, dirname, basename } from "node:path";
import { cpus } from "node:os";
import { describe, diagnosticToJson, ERROR_CATALOG, extractArchBlocks, rewriteMarkdown } from "../index.js";
import {
  type Args,
  type Format,
  EXIT,
  FORMAT_LIST,
  baseDirOf,
  defaultOut,
  emitDiagnosticsHuman,
  emitJson,
  hasErrors,
  ioError,
  makeNodeWorld,
  parseFormat,
  readInput,
  sourceFromJson,
  usageError,
} from "./io.js";
import { type PerFile, aggregateExit, compileToFile, perFileJson, renderArtifact, runPool } from "./serialize.js";

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

export async function cmdCompile(args: Args): Promise<number> {
  const input = args._[0];
  if (!input) return usageError("missing input file (use a path or `-` for stdin)");

  const format = parseFormat(args);
  if (!format) return usageError(`unknown format "${args.format}" (use ${FORMAT_LIST})`);

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

  const r = await renderArtifact(source, format, args, baseDirOf(input));

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

  // Resolve output target. In JSON mode keep stdout clean: redirect `-` to a file.
  let target = args.o ?? defaultOut(input, format);
  if (args.json && target === "-") target = defaultOut(input === "-" ? "-" : input, format);

  // `--error-svg` produced an error-card image for a *broken* plan: write it (so an
  // agent/embed has visual feedback) but keep the user-source exit code and report
  // the diagnostics — a broken plan never counts as a successful compile.
  if (errored) {
    if (target === "-") {
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
      if (target !== "-") {
        o.output = resolvePath(target);
        o.bytes = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length;
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

  if (target === "-") {
    process.stdout.write(bytes);
    return EXIT.OK;
  }
  try {
    writeFileSync(resolvePath(target), bytes);
  } catch (e) {
    return ioError((e as Error).message, args.json, { format });
  }

  const warnings = diagnostics.filter((d) => d.severity === "warning");
  if (args.json) {
    const s = describe(source, { world: makeNodeWorld(baseDirOf(input)) });
    const { ok: _ok, diagnostics: _d, ...summary } = s;
    emitJson({
      ok: true,
      format,
      output: resolvePath(target),
      bytes: typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length,
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

export async function cmdWatch(args: Args): Promise<number> {
  const input = args._[0];
  if (!input || input === "-") return usageError("watch needs a file path");
  await cmdCompile(args);
  process.stderr.write(`watching ${input} … (Ctrl+C to stop)\n`);
  watchFile(resolvePath(input), { interval: 300 }, () => void cmdCompile(args));
  return EXIT.OK;
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
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json, { format });
  }
  const r = await renderArtifact(source, format, args, baseDirOf(input));
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

  const r = await renderArtifact(source, format, args, baseDirOf(input));

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

  let target = args.o ?? defaultOut(input, format);
  if (args.json && target === "-") target = defaultOut(input === "-" ? "-" : input, format);

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

  const outDir = args.o && args.o !== "-" ? args.o : undefined;
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

  let md: string;
  try {
    md = readInput(input);
  } catch {
    return ioError(`cannot read ${input}`, args.json);
  }

  // Output target: default `<name>.out.md`; in JSON mode never stream to stdout.
  let target = args.o ?? (input === "-" ? "out.md" : resolvePath(input).replace(/\.md$/i, "") + ".out.md");
  if (args.json && target === "-")
    target = input === "-" ? "out.md" : resolvePath(input).replace(/\.md$/i, "") + ".out.md";
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
