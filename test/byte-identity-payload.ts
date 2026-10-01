/**
 * The payload builders of the byte-identity digests — and nothing else.
 *
 * `byte-identity-digest.ts` hashes these with `node:crypto`; `scripts/engine-digests.ts` sends the
 * SAME functions, via `Function.prototype.toString()`, into Chromium, Firefox and WebKit and
 * hashes them with `crypto.subtle`, so a cross-engine comparison runs the same code and not a
 * lookalike (see `byte-identity-digest.ts` for the one time a lookalike lied).
 *
 * Constraints that make that possible, all deliberate:
 *  - NO imports at runtime (type imports are erased) and no outside references: each function
 *    is fully self-contained, because only its source text crosses into the page.
 *  - Each takes the compiler API object, a source and the digest options, and returns the
 *    payload STRING — the exact bytes the digest hashes.
 *  - No named inner functions or arrow-bound consts: a transpiler's name-preserving helper
 *    would leak a free identifier into the serialised source.
 */

import type { compile, describe, lint } from "../src/index.js";
import type { World } from "../src/world.js";

/** The three surfaces a compiler change can move. */
export interface CompilerApi {
  compile: typeof compile;
  describe: typeof describe;
  lint: typeof lint;
}

/**
 * What a caller may vary about the compilation itself.
 *
 * `world` exists so a law can cover the examples that `import` — `imports.arch` and
 * `museum-wings.arch` are shipped plans like any other and a sweep that silently skips
 * them is a corpus with a hole in it (a gate is only as strong as its
 * corpus). Nothing else may be varied: the digest bodies are pinned shapes.
 */
export interface DigestOptions {
  world?: World;
}

/** One source's SVG, `describe()` summary and `lint()` diagnostics, joined by a single space. */
export function digestPayload(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  const out = api.compile(src, { noCache: true, ...opts });
  return [out.svg, JSON.stringify(api.describe(src, opts)), JSON.stringify(api.lint(src, opts))].join(" ");
}

/** {@link digestPayload} widened to EVERY STOREY: every page's SVG in `pages[]` order. */
export function allStoreysPayload(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  const out = api.compile(src, { noCache: true, ...opts });
  const drawings = out.pages ? out.pages.map((p) => p.svg) : [out.svg];
  return [...drawings, JSON.stringify(api.describe(src, opts)), JSON.stringify(api.lint(src, opts))].join(" ");
}

/** The same payload with the DRAWING left out — `describe()` and `lint()` only. */
export function semanticPayload(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  return [JSON.stringify(api.describe(src, opts)), JSON.stringify(api.lint(src, opts))].join(" ");
}

/** {@link allStoreysPayload} widened with `compile().diagnostics` as a FOURTH part. */
export function allStoreysDiagnosticsPayload(api: CompilerApi, src: string, opts: DigestOptions = {}): string {
  const out = api.compile(src, { noCache: true, ...opts });
  const drawings = out.pages ? out.pages.map((p) => p.svg) : [out.svg];
  return [
    ...drawings,
    JSON.stringify(api.describe(src, opts)),
    JSON.stringify(api.lint(src, opts)),
    JSON.stringify(out.diagnostics),
  ].join(" ");
}

/**
 * The parts {@link allStoreysDiagnosticsPayload} joins, unjoined, so a cross-engine divergence
 * can name WHICH part moved (an SVG may itself contain spaces, so the joined string cannot be
 * split back). `parts.join(" ")` is that payload exactly — the engine script asserts it.
 */
export function allStoreysDiagnosticsParts(api: CompilerApi, src: string, opts: DigestOptions = {}): string[] {
  const out = api.compile(src, { noCache: true, ...opts });
  const drawings = out.pages ? out.pages.map((p) => p.svg) : [out.svg];
  return [
    ...drawings,
    JSON.stringify(api.describe(src, opts)),
    JSON.stringify(api.lint(src, opts)),
    JSON.stringify(out.diagnostics),
  ];
}

/**
 * The cross-engine probe payload: {@link allStoreysDiagnosticsParts}'s four parts plus the
 * opt-in `--facts` describe (`symmetry` runs sin/cos/atan2, `syntax` runs log2) — the surface
 * the digests above never read, because they pin the DEFAULT `describe()`.
 */
export function engineProbeParts(api: CompilerApi, src: string, opts: DigestOptions = {}): string[] {
  const out = api.compile(src, { noCache: true, ...opts });
  const drawings = out.pages ? out.pages.map((p) => p.svg) : [out.svg];
  return [
    ...drawings,
    JSON.stringify(api.describe(src, opts)),
    JSON.stringify(api.lint(src, opts)),
    JSON.stringify(out.diagnostics),
    JSON.stringify(api.describe(src, { ...opts, facts: ["symmetry", "syntax"] })),
  ];
}
