/**
 * The Lint tab body — architectural soundness warnings (habitability rules) for
 * the current plan, under the chosen advisory profile. The repair-button
 * visibility (keyed off the same diagnostics) is wired in actions.ts.
 */
import { escapeHtml } from "./escape.js";
import type { Diagnostic } from "archlang";

export function renderLint(el: HTMLElement, lintDiags: Diagnostic[], ok: boolean): void {
  if (!ok) {
    el.innerHTML = `<p class="empty">Fix the errors to run the soundness check.</p>`;
  } else if (lintDiags.length === 0) {
    el.innerHTML = `<p class="ok">✓ No soundness warnings — every room is reachable, bedrooms have windows, the building has an entrance.</p>`;
  } else {
    el.innerHTML = lintDiags
      .map(
        (d) =>
          `<div class="lintrow"><code>${d.code}</code> ${escapeHtml(d.message)}${d.hints?.length ? `<span class="hint">${escapeHtml(d.hints[0])}</span>` : ""}</div>`,
      )
      .join("");
  }
}
