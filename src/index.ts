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
import { offsetToLineCol } from "./diagnostics.js";
import type { Diagnostic } from "./diagnostics.js";
import type { CompileError, CompileOptions, CompileResult } from "./types.js";

export type {
  CompileError,
  CompileOptions,
  CompileResult,
  CompileWarning,
  Diagnostic,
  Span,
  Severity,
} from "./types.js";
export { formatDiagnostic, offsetToLineCol } from "./diagnostics.js";
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

/** Project a span-carrying diagnostic onto the legacy `{message, line, col}` shape. */
function toLegacy(source: string, d: Diagnostic): CompileError {
  if (!d.span) return { message: d.message };
  const { line, col } = offsetToLineCol(source, d.span.start);
  return { message: d.message, line, col };
}

function compileUncached(source: string, opts: CompileOptions): CompileResult {
  const { plan, diagnostics: parseDiags } = parse(source);

  const diagnostics: Diagnostic[] = plan ? [...parseDiags, ...validate(plan)] : [...parseDiags];

  const errs = diagnostics.filter((d) => d.severity === "error");
  const errors = errs.map((d) => toLegacy(source, d));
  const warnings = diagnostics
    .filter((d) => d.severity === "warning")
    .map((d) => toLegacy(source, d));

  // Warnings never block rendering; any error (or no plan) aborts with svg = "".
  const svg = plan && errs.length === 0 ? render(plan, opts) : "";

  return { svg, errors, warnings, diagnostics, ast: plan };
}

/** Clear the internal compile cache (useful in long-lived processes/tests). */
export function clearCache(): void {
  cache.clear();
}
