/**
 * The render/serialize core shared by the file-producing commands
 * (compile/preview/batch/md): compile a source to bytes, the format seam that turns
 * a built {@link Scene} into the requested output, and the optional-dependency
 * auto-install path. Split out of the former monolithic `src/cli.ts` (mechanical;
 * behavior unchanged).
 */

import { writeFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { spawnSync } from "node:child_process";
import {
  compile,
  renderPng,
  renderPngFromSvg,
  renderAscii,
  toDxf,
  toPdf,
  diagnosticToJson,
  ERROR_CATALOG,
} from "../index.js";
import type { Diagnostic, Scene } from "../index.js";
import {
  type Args,
  type Format,
  EXIT,
  asciiCharset,
  baseDirOf,
  hasErrors,
  makeNodeWorld,
  readInput,
  tryLoadGeometryBackend,
} from "./io.js";

/** Does this error mean a lazy optional render dependency (resvg/pdfkit) is absent? */
function isOptionalDepError(e: unknown): boolean {
  return /resvg|pdfkit|optional dependency/i.test((e as Error).message ?? "");
}

/** Pick the package manager from the environment (lockfiles / npm_config_user_agent). */
function detectPackageManager(): string {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (existsSync(resolvePath(process.cwd(), "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(resolvePath(process.cwd(), "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Auto-install an optional render dependency into the current working directory
 * (the one impure, networked CLI action — opt-in via `--install`). Best-effort:
 * Node resolves the dep from the package's own location, so this works when `arch`
 * runs as a project dependency; an `npx`-ephemeral install may not be found.
 */
function autoInstall(pkg: string, quiet?: boolean): void {
  const pm = detectPackageManager();
  const cmdArgs = pm === "yarn" ? ["add", pkg] : ["install", pkg];
  if (!quiet) process.stderr.write(`installing ${pkg} via ${pm} … (use SVG/DXF to avoid this)\n`);
  const r = spawnSync(pm, cmdArgs, {
    stdio: quiet ? "ignore" : "inherit",
    cwd: process.cwd(),
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`auto-install of ${pkg} failed (run manually: ${pm} ${cmdArgs.join(" ")})`);
}

/** Run a render, and on a missing-optional-dep error retry once after auto-install (if `--install`). */
async function runWithInstall<T>(fn: () => Promise<T>, pkg: string, args: Args): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (args.install && isOptionalDepError(e)) {
      autoInstall(pkg, args.quiet);
      return await fn();
    }
    throw e;
  }
}

/**
 * Serialize a built Scene to the requested format (auto-installing optional deps if
 * asked). This is the output-format seam: adding a format = a row in `EXPORT_FORMATS`
 * (`src/manifest.ts`) + a serializer line here.
 */
async function serialize(scene: Scene, svg: string, format: Format, args: Args): Promise<string | Uint8Array> {
  if (format === "dxf") return toDxf(scene);
  if (format === "txt") return renderAscii(scene, { cols: args.cols, charset: asciiCharset(args) });
  if (format === "pdf") return runWithInstall(() => toPdf(scene), "pdfkit", args);
  if (format === "png")
    return runWithInstall(() => renderPng(scene, { width: args.width, scale: args.scale }), "@resvg/resvg-js", args);
  return svg;
}

/** A single rendered artifact (or a failure), the shared core of compile/batch/md/preview. */
export interface Rendered {
  bytes?: string | Uint8Array;
  diagnostics: Diagnostic[];
  /** Serialize/dependency error message (compile errors are in `diagnostics`). */
  error?: string;
  errorCode?: string;
}

/** Compile + serialize one source to bytes (no file IO). Compile errors → no bytes. */
export async function renderArtifact(source: string, format: Format, args: Args, baseDir: string): Promise<Rendered> {
  await tryLoadGeometryBackend();
  const { svg, diagnostics, scene } = compile(source, {
    width: args.width,
    noCache: true,
    world: makeNodeWorld(baseDir),
    // `--overlay circulation` draws the opt-in diagnostic overlay; unknown names are ignored.
    ...(args.overlay === "circulation" ? { overlays: ["circulation"] as const } : {}),
    // `--error-svg`: a broken plan yields a self-describing error card in `svg`
    // (instead of ""), so the branch below can serialize it. Off → svg stays "".
    ...(args.errorSvg ? { onError: "svg" as const } : {}),
    // `--accessible`: stamp <title>/<desc>/role/aria into the SVG (SVG-only; a raster
    // format simply drops the metadata). Default output is byte-identical.
    ...(args.accessible ? { accessible: true } : {}),
    // The text renderer (`-f txt` / `preview --ascii`) needs the opt-in annotate
    // metadata (elementId/elementKind) to place furniture markers — the only way to
    // recover a fixture's identity from the geometry-only Scene. Other formats never
    // set it, so their output stays byte-identical.
    ...(format === "txt" || args.ascii ? { annotate: true } : {}),
  });
  if (hasErrors(diagnostics) || !scene) {
    // A broken plan. With `--error-svg`, `svg` holds the error card — serialize it
    // (as SVG, or rasterized to PNG) so the caller still gets an image; the
    // diagnostics ride along, so the exit code stays a user-source error. Only SVG
    // and PNG cards are meaningful (DXF/PDF error cards are not).
    if (args.errorSvg && svg && (format === "svg" || format === "png")) {
      try {
        const bytes =
          format === "png"
            ? await runWithInstall(
                () => renderPngFromSvg(svg, { width: args.width, scale: args.scale }),
                "@resvg/resvg-js",
                args,
              )
            : svg;
        return { bytes, diagnostics };
      } catch (e) {
        const message = (e as Error).message;
        if (isOptionalDepError(e)) {
          const dep: Diagnostic = { severity: "error", code: "E_PNG_DEPENDENCY", message };
          return { diagnostics: [...diagnostics, dep], error: message, errorCode: "E_PNG_DEPENDENCY" };
        }
        return { diagnostics, error: message };
      }
    }
    return { diagnostics };
  }
  try {
    return { bytes: await serialize(scene, svg, format, args), diagnostics };
  } catch (e) {
    const message = (e as Error).message;
    if (isOptionalDepError(e)) {
      // A missing optional render dependency — surface it as the catalogued,
      // self-correcting code (with `fix`) rather than an opaque thrown error.
      const dep: Diagnostic = { severity: "error", code: "E_PNG_DEPENDENCY", message };
      return { diagnostics: [...diagnostics, dep], error: message, errorCode: "E_PNG_DEPENDENCY" };
    }
    return { diagnostics, error: message };
  }
}

/** One file's result in a multi-file command (batch/md). */
export interface PerFile {
  input: string;
  ok: boolean;
  format: Format;
  output?: string;
  bytes?: number;
  error?: string;
  errorCode?: string;
  diagnostics: Diagnostic[];
  source: string;
}

/** Read a `.arch` file, render it, and write the artifact to `targetPath`. */
export async function compileToFile(input: string, format: Format, args: Args, targetPath: string): Promise<PerFile> {
  let source: string;
  try {
    source = readInput(input);
  } catch {
    return { input, ok: false, format, error: `cannot read ${input}`, diagnostics: [], source: "" };
  }
  const r = await renderArtifact(source, format, args, baseDirOf(input));
  if (r.error || r.bytes === undefined) {
    return { input, ok: false, format, error: r.error, errorCode: r.errorCode, diagnostics: r.diagnostics, source };
  }
  try {
    writeFileSync(resolvePath(targetPath), r.bytes);
  } catch (e) {
    return { input, ok: false, format, error: (e as Error).message, diagnostics: r.diagnostics, source };
  }
  const bytes = typeof r.bytes === "string" ? Buffer.byteLength(r.bytes) : r.bytes.length;
  return { input, ok: true, format, output: resolvePath(targetPath), bytes, diagnostics: r.diagnostics, source };
}

/** Project a {@link PerFile} onto the agent-facing JSON shape (with fix on a dep error). */
export function perFileJson(r: PerFile): Record<string, unknown> {
  const o: Record<string, unknown> = { input: r.input, ok: r.ok, format: r.format };
  if (r.output) o.output = r.output;
  if (r.bytes !== undefined) o.bytes = r.bytes;
  o.diagnostics = r.diagnostics.map((d) => diagnosticToJson(r.source, d));
  if (r.error) o.error = r.error;
  if (r.errorCode) {
    o.code = r.errorCode;
    const fix = ERROR_CATALOG[r.errorCode]?.fix;
    if (fix) o.fix = fix;
  }
  return o;
}

/** Aggregate exit code for a multi-file run: user error > IO error > ok. */
export function aggregateExit(results: PerFile[]): number {
  if (results.some((r) => !r.ok && !r.error)) return EXIT.USER; // a compile (user-source) error
  if (results.some((r) => !r.ok)) return EXIT.INTERNAL; // an IO/dependency error
  return EXIT.OK;
}

/** Run async thunks with a bounded concurrency (a tiny zero-dep p-limit). */
export async function runPool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
    }
  };
  const n = Math.max(1, Math.min(limit, tasks.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
