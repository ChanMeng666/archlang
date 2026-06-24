/**
 * ArchLang — compile declarative floor-plan source to a professional SVG.
 *
 * @example
 * import { compile } from "@chanmeng666/archlang";
 * const { svg, errors } = compile(`plan "Demo" { room at (0,0) size 4000x3000 label "Room" }`);
 */

import { parse } from "./parser.js";
import { validate } from "./validate.js";
import { render } from "./render.js";
import type { CompileOptions, CompileResult } from "./types.js";

export type {
  CompileError,
  CompileOptions,
  CompileResult,
  CompileWarning,
} from "./types.js";
export type * from "./ast.js";

/** Small LRU-ish memo cache keyed by source+options. Bounded to 64 entries. */
const cache = new Map<string, CompileResult>();
const CACHE_MAX = 64;

export function compile(source: string, opts: CompileOptions = {}): CompileResult {
  const key = JSON.stringify([source, opts.width ?? null]);
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

function compileUncached(source: string, opts: CompileOptions): CompileResult {
  const { plan, errors: parseErrors } = parse(source);
  if (!plan || parseErrors.length > 0) {
    return { svg: "", errors: parseErrors, warnings: [] };
  }

  const { errors, warnings } = validate(plan);
  if (errors.length > 0) {
    return { svg: "", errors, warnings, ast: plan };
  }

  const svg = render(plan, opts);
  return { svg, errors: [], warnings, ast: plan };
}

/** Clear the internal compile cache (useful in long-lived processes/tests). */
export function clearCache(): void {
  cache.clear();
}
