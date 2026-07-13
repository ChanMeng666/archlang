/**
 * The Suggest panel (ADR 0005 — "facts, not an invisible architect").
 *
 * Lint reports faults it deliberately refuses to fix on its own: a room you cannot reach,
 * a bedroom with no window. Adding a door or a window is a *design* choice, so
 * `suggestTopology` never edits the plan — it returns candidate `.arch` statements, each
 * with the reason it is proposed, and a human picks. This panel is that data, plus an
 * Insert button; the same `suggestTopology` the `arch suggest --json` CLI calls.
 */
import { escapeHtml } from "./escape.js";
import type { Suggestion } from "archlang";

export function renderSuggest(el: HTMLElement, suggestions: Suggestion[]): void {
  el.hidden = false;
  if (suggestions.length === 0) {
    el.innerHTML = `<p class="repair-none">Nothing to suggest — no unreachable room or windowless bedroom.</p>`;
    return;
  }

  el.innerHTML =
    `<div class="repair-head"><strong>Suggestions — ${suggestions.length} fault${suggestions.length === 1 ? "" : "s"}</strong>` +
    `<span class="repair-note">advisory: pick one, nothing is applied for you</span></div>` +
    suggestions
      .map(
        (s) =>
          `<div class="sug-group">` +
          `<p class="sug-problem"><code>${escapeHtml(s.code)}</code> ${escapeHtml(s.problem)}</p>` +
          `<ul class="repair-list">` +
          s.candidates
            .map(
              (c) =>
                `<li class="sug-cand">` +
                `<code class="sug-stmt">${escapeHtml(c.insertText)}</code>` +
                `<span class="sug-why">${escapeHtml(c.rationale)}</span>` +
                `<button class="sug-insert" type="button" data-stmt="${escapeHtml(c.insertText)}">Insert</button>` +
                `</li>`,
            )
            .join("") +
          `</ul></div>`,
      )
      .join("");
}
