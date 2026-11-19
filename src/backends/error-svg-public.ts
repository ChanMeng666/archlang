// The public error-card renderer, `renderErrorSvg` (the card itself is `backends/error-svg.ts`).
// A module of its own (card NR.10): it reads every catalogue code's fix, the intent violations'
// (`E_INTENT_*`) too, so a consumer's card for a `validateIntent` diagnostic draws its fix as it
// always did, while the card `compile()` draws (`renderCompileErrorSvg`) reads only the codes
// `compile()` raises and keeps the intent table off the compile path (the playground's compiler
// chunk, `playground/e2e/startup-chunks.baseline.json`). Nothing on the compile path imports it.
// Line comments, not a doc comment: the declaration bundle would print one into the public
// `index.d.ts`, and these names are internal.

import { anyCatalogFix } from "../any-catalog-fix.js";
import type { Diagnostic } from "../diagnostics.js";
import { type ErrorSvgOptions, renderErrorCard } from "./error-svg.js";

/**
 * Render a deterministic "error card" SVG describing `diagnostics`.
 *
 * The card is a fixed-width panel (default 800px) with a title summarising the
 * error/warning counts and one bordered row per diagnostic (severity accent, a
 * monospace code chip, `line:col`, the message, and the catalogued fix). When
 * there are more than `maxRows` diagnostics the overflow collapses into a
 * "+K more" line. Height is computed from the content, so output is stable.
 *
 * @param source       The source that produced `diagnostics` (used only to
 *                      resolve byte spans to `line:col`; never rendered verbatim).
 * @param diagnostics  The problems to display (errors and/or warnings).
 * @param opts         Width / max rows / theme overrides.
 */
export function renderErrorSvg(source: string, diagnostics: Diagnostic[], opts: ErrorSvgOptions = {}): string {
  return renderErrorCard(source, diagnostics, opts, anyCatalogFix);
}
