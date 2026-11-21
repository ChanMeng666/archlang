/**
 * `compileUncached`: one compile, uncached, with `onError: "svg"`'s error card: the pipeline's
 * result ({@link compileUncachedWithoutErrorCard}, `pipeline.ts`), with the card drawn into `svg`
 * when there is an error. `compile()` (`compile.ts`), `finish()`, the `reroll` proof and `impact`
 * call it. A module of its own (card 3.19): the card's renderer and the catalogue's fix column it
 * prints (`renderCompileErrorSvg`, `src/catalog-fix.ts`) are reached through this file alone, so a
 * build entry that never asks for the card (`src/compile-path.ts`, the playground's compiler chunk)
 * reaches neither; esbuild splits shared code by the files each entry reaches, not by the
 * functions it calls.
 */
import { renderCompileErrorSvg } from "./backends/error-svg.js";
import type { CompileWork } from "./compile-work.js";
import { compileUncachedWithoutErrorCard } from "./pipeline.js";
import type { CompileOptions, CompileResult } from "./types.js";

/**
 * One compile, uncached; `work`, when given, counts the drawing's work (see `compileWork`,
 * `pipeline.ts`). It is {@link compileUncachedWithoutErrorCard}'s result, with `onError: "svg"`'s
 * error card drawn into `svg` when there is an error (the card is drawn nowhere else).
 */
export function compileUncached(source: string, opts: CompileOptions, work?: CompileWork): CompileResult {
  const result = compileUncachedWithoutErrorCard(source, opts, work);
  if (result.errors.length > 0 && opts.onError === "svg") {
    // Opt-in only: a broken plan yields a self-describing error card instead of
    // a blank. Default (no `onError`) leaves `svg === ""`, byte-identical to the
    // historical behavior. Errors/warnings/diagnostics are untouched.
    result.svg = renderCompileErrorSvg(source, result.diagnostics);
  }
  return result;
}
