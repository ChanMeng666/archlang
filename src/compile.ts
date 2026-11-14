/**
 * `compile()`, the public entry point, and its result memo. Moved out of `src/index.ts` (card
 * RM0.7f) so that `src/compile-path.ts` can reach it without reaching the whole barrel; the body is
 * the one `index.ts` held, byte for byte. `clearCache()` stays in `index.ts` and empties this memo
 * through `clearCompileCache()`.
 *
 * The one compile pipeline (parse → link → resolve → render) lives in `pipeline.ts`; `compile()`
 * below wraps it with the memoization cache; `reroll.ts`'s twin-compile proof calls the SAME
 * function, so the two can never drift apart. See that module's header.
 */
import { compileUncached } from "./pipeline.js";
import { idToken } from "./identity.js";
import type { CompileOptions, CompileResult } from "./types.js";

/** Small LRU-ish memo cache keyed by source+options. Bounded to 64 entries. */
const cache = new Map<string, CompileResult>();
const CACHE_MAX = 64;

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
  // The key includes plugin/theme/backend/hatch identity so distinct extension
  // sets never share a cache entry. Trusted, JSON-serializable `theme`/`width`
  // are embedded directly; object plugins get a stable process-local id token
  // (reused object → hit; different object → safe miss). Trailing tokens are 0
  // when absent, preserving the legacy key shape for plain compiles.
  const key = JSON.stringify([
    source,
    opts.width ?? null,
    opts.theme ?? null,
    opts.plugins?.map(idToken) ?? null,
    idToken(opts.themes),
    idToken(opts.backend),
    idToken(opts.hatches),
    idToken(opts.world),
    opts.annotate ?? null,
    opts.overlays ?? null,
    opts.onError ?? null,
    opts.accessible ?? null,
    opts.view ?? null,
  ]);
  if (!opts.noCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const result = compileUncached(source, opts);

  if (!opts.noCache) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, result);
  }
  return result;
}

/** Empty the compile result memo (the first step of `clearCache()`, `src/index.ts`). */
export function clearCompileCache(): void {
  cache.clear();
}
