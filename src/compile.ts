/**
 * `compile()`, the public entry point. Moved out of `src/index.ts` (card RM0.7f); its memo moved on
 * to `compile-memo.ts` (card 3.19), beside `compileWithoutErrorCard`, the compile the playground's
 * compiler chunk serves (`src/compile-path.ts` reaches that file, not this one, and so not the
 * `onError: "svg"` error card `compileUncached` draws). `clearCache()` stays in `index.ts` and
 * empties the memo through `clearCompileCache()`.
 *
 * The one compile pipeline (parse → link → resolve → render) lives in `pipeline.ts`; `compile()`
 * below wraps it, with the card (`compile-uncached.ts`), in the memoization cache; `reroll.ts`'s
 * twin-compile proof calls the SAME function, so the two can never drift apart. See that module's header.
 */
import { memoised } from "./compile-memo.js";
import { compileUncached } from "./compile-uncached.js";
import type { CompileOptions, CompileResult } from "./types.js";

/**
 * Compile ArchLang source to a professional SVG floor plan.
 *
 * Pure, synchronous, and isomorphic (Node + browser): the same `source` always
 * yields byte-identical output. The result is append-only — `{ svg, errors,
 * warnings, diagnostics, ast, scene }` — and never throws on a user-source
 * problem; errors are returned as {@link CompileResult.diagnostics} (with byte
 * spans) and reflected in `errors`, with `svg` left `""` when any error is
 * present. Results are memoized by `source` + extension identity unless
 * `opts.noCache` is set.
 *
 * The default path is zero-dependency and emits SVG; the `scene` field exposes
 * the backend-neutral {@link Scene} so consumers can target other backends
 * ({@link toDxf}, {@link toPdf}, {@link renderPng}) without re-resolving. Pass a
 * {@link World} (via `opts.world`) to resolve `import`s and inject `now`.
 *
 * @param source  ArchLang source text (a `plan "…" { … }`).
 * @param opts    Width, theme, plugins/backend/hatches/themes, world, noCache.
 * @returns A {@link CompileResult}.
 *
 * @example
 * const { svg, diagnostics, scene } = compile(`plan "Demo" {
 *   room at (0,0) size 4000x3000 label "Room"
 * }`);
 */
export function compile(source: string, opts: CompileOptions = {}): CompileResult {
  return memoised(source, opts, compileUncached);
}
