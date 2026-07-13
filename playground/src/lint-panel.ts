/**
 * The Lint tab body — architectural soundness warnings (habitability rules) for
 * the current plan, under the chosen advisory profile. The repair-button
 * visibility (keyed off the same diagnostics) is wired in actions.ts.
 *
 * Some lint rules carry a machine-applicable fix of their own (e.g. `W_ALIAS_MATCH`
 * → add the `uses` the label only implied). Those get the same "Apply fix" button the
 * compile diagnostics get, driven by the same `rankFixes`/`applyFixes` the `arch fix`
 * CLI uses — a lint warning with a real fix should not be read-only just because it
 * happens to render in a different panel.
 */
import { escapeHtml } from "./escape.js";
import { rankFixes, type Diagnostic } from "archlang";

/** Renders the rows and returns them in display order — `data-i` indexes into this. */
export function renderLint(el: HTMLElement, lintDiags: Diagnostic[], ok: boolean): Diagnostic[] {
  if (!ok) {
    el.innerHTML = `<p class="empty">Fix the errors to run the soundness check.</p>`;
    return [];
  }
  if (lintDiags.length === 0) {
    el.innerHTML = `<p class="ok">✓ No soundness warnings — every room is reachable, bedrooms have windows, the building has an entrance.</p>`;
    return [];
  }
  el.innerHTML = lintDiags
    .map((d, i) => {
      // Multiple fixes on one diagnostic are mutually-exclusive ALTERNATIVES — offer the
      // best-ranked one, which is the one `arch fix` would take.
      const best = d.fixes?.length ? rankFixes(d.fixes)[0] : undefined;
      const apply = best
        ? `<button class="diag-apply" type="button" data-i="${i}" title="${escapeHtml(best.title)}">Apply fix</button>`
        : "";
      const hint = d.hints?.length ? `<span class="hint">${escapeHtml(d.hints[0])}</span>` : "";
      return `<div class="lintrow" data-i="${i}"><code>${d.code}</code> ${escapeHtml(d.message)}${hint}${apply}</div>`;
    })
    .join("");
  return lintDiags;
}
