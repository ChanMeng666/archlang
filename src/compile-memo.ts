/**
 * `compile()`'s result memo, and `compileWithoutErrorCard`, the compile the playground's compiler
 * chunk serves. Split out of `compile.ts` (card 3.19) so that `src/compile-path.ts` reaches the memo
 * and the pipeline without the `onError: "svg"` error card: `compile()` itself (`compile.ts`) draws
 * the card through `compileUncached` (`compile-uncached.ts`), and esbuild splits shared code by the
 * files each build entry reaches, so a file the entry imports must not import the card. The memo's
 * body is the one `compile()` held, byte for byte, with the pipeline run handed in. `clearCache()`
 * (`src/index.ts`) empties it through `clearCompileCache()`.
 */
import { compileUncachedWithoutErrorCard } from "./pipeline.js";
import { idToken } from "./identity.js";
import type { CompileOptions, CompileResult } from "./types.js";

/** Small LRU-ish memo cache keyed by source+options. Bounded to 64 entries. */
const cache = new Map<string, CompileResult>();
const CACHE_MAX = 64;

/**
 * `compile()` without the error card (card 3.19): `opts.onError` is ignored, so a plan with an
 * error has `svg === ""`; every other field, and every result of a plan without an error, is
 * `compile()`'s. Not part of the package surface (`src/index.ts` does not export it): the
 * playground's compiler chunk serves it (`src/compile-path.ts`) so that chunk does not carry the
 * card's renderer and the catalogue's fix column, and the playground's embed, the one caller that
 * shows the card, draws it with `renderErrorSvg`, which a broken plan loads (`playground/src/embed.ts`).
 * It shares `compile()`'s memo: its key always reads `onError` as unset, the key under which
 * `compile()` draws no card either.
 *
 * @internal
 */
export function compileWithoutErrorCard(source: string, opts: CompileOptions = {}): CompileResult {
  const cardless = opts.onError === undefined ? opts : { ...opts, onError: undefined };
  return memoised(source, cardless, compileUncachedWithoutErrorCard);
}

/** `compile()`'s memo around `uncached`, the one pipeline run it caches (`src/pipeline.ts`). */
export function memoised(
  source: string,
  opts: CompileOptions,
  uncached: (source: string, opts: CompileOptions) => CompileResult,
): CompileResult {
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

  const result = uncached(source, opts);

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
